import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";

import { HashMap } from "./hash-map";

const MAX_BODY_BYTES = 1024 * 1024;
const MAX_KEY_BYTES = 1024;

type StoredValue = {
  value: unknown;
  bytes: number;
};

export type ServerOptions = {
  maxEntries?: number;
  maxStorageBytes?: number;
};

function validateKey(key: unknown): asserts key is string {
  if (
    typeof key !== "string" ||
    key.length === 0 ||
    Buffer.byteLength(key) > MAX_KEY_BYTES ||
    /[\u0000-\u001f\u007f]/.test(key) ||
    key === "." ||
    key === ".."
  ) {
    throw new HttpError(
      "Key must be 1–1024 UTF-8 bytes, without control characters or dot segments",
      400,
    );
  }
}

class HttpError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
  }
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  body: unknown,
): void {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
  });

  response.end(JSON.stringify(body));
}

function sendNotFound(response: ServerResponse): void {
  sendJson(response, 404, {
    error: "Key not found",
  });
}

async function readJsonBody(
  request: IncomingMessage,
): Promise<unknown> {
  if (
    request.headers["content-type"]
      ?.split(";")[0]
      .trim()
      .toLowerCase() !== "application/json"
  ) {
    request.resume();

    throw new HttpError(
      "Content-Type must be application/json",
      415,
    );
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of request.iterator({
    destroyOnReturn: false,
  })) {
    const buffer = Buffer.isBuffer(chunk)
      ? chunk
      : Buffer.from(chunk);

    totalBytes += buffer.length;

    if (totalBytes > MAX_BODY_BYTES) {
      request.resume();

      throw new HttpError(
        "Request body exceeds 1 MiB",
        413,
      );
    }

    chunks.push(buffer);
  }

  try {
    return JSON.parse(
      Buffer.concat(chunks).toString("utf8"),
    ) as unknown;
  } catch {
    throw new HttpError(
      "Request body must contain valid JSON",
      400,
    );
  }
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

async function handleRequest(
  store: HashMap<StoredValue>,
  limits: {
    maxEntries: number;
    maxStorageBytes: number;
    storageBytes: number;
  },
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  try {
    const url = new URL(
      request.url ?? "/",
      "http://localhost",
    );

    // ==========================================
    // ROUTE /keys
    // GET  : afficher toutes les clés
    // POST : créer une nouvelle clé
    // ==========================================

    if (url.pathname === "/keys") {

      // NOUVELLE FONCTIONNALITÉ : KEYS
      if (request.method === "GET") {
        sendJson(response, 200, {
          keys: store.keys(),
        });

        return;
      }

      if (request.method !== "POST") {
        response.setHeader("allow", "GET, POST");

        sendJson(response, 405, {
          error: "Method not allowed",
        });

        return;
      }

      const body = await readJsonBody(request);

      if (
        !isRecord(body) ||
        typeof body.key !== "string" ||
        body.key.length === 0 ||
        !Object.hasOwn(body, "value")
      ) {
        throw new HttpError(
          "Body must include a non-empty key and a value",
          400,
        );
      }

      validateKey(body.key);

      if (store.has(body.key)) {
        sendJson(response, 409, {
          error: "Key already exists",
        });

        return;
      }

      const bytes =
        Buffer.byteLength(body.key) +
        Buffer.byteLength(JSON.stringify(body.value));

      if (
        store.size >= limits.maxEntries ||
        limits.storageBytes + bytes >
          limits.maxStorageBytes
      ) {
        throw new HttpError(
          "Cache capacity exceeded",
          507,
        );
      }

      store.set(body.key, {
        value: body.value,
        bytes,
      });

      limits.storageBytes += bytes;

      sendJson(response, 201, {
        key: body.key,
        value: body.value,
      });

      return;
    }

    // ==========================================
    // ROUTE /keys/:key
    // ==========================================

    const keyMatch =
      /^\/keys\/([^/]+)$/.exec(url.pathname);

    if (!keyMatch) {
      sendJson(response, 404, {
        error: "Route not found",
      });

      return;
    }

    let key: string;

    try {
      key = decodeURIComponent(keyMatch[1]);
    } catch {
      throw new HttpError(
        "Key must be URL-encoded correctly",
        400,
      );
    }

    validateKey(key);

    switch (request.method) {

      // ========================================
      // GET : récupérer une valeur
      // ========================================

      case "GET": {
        if (!store.has(key)) {
          sendNotFound(response);
          return;
        }

        sendJson(response, 200, {
          key,
          value: store.get(key)!.value,
        });

        return;
      }

      // ========================================
      // PUT : modifier une valeur
      // ========================================

      case "PUT": {
        const body = await readJsonBody(request);

        if (
          !isRecord(body) ||
          !Object.hasOwn(body, "value")
        ) {
          throw new HttpError(
            "Body must include a value",
            400,
          );
        }

        if (!store.has(key)) {
          sendNotFound(response);
          return;
        }

        const previous = store.get(key)!;

        const bytes =
          Buffer.byteLength(key) +
          Buffer.byteLength(
            JSON.stringify(body.value),
          );

        if (
          limits.storageBytes -
            previous.bytes +
            bytes >
          limits.maxStorageBytes
        ) {
          throw new HttpError(
            "Cache capacity exceeded",
            507,
          );
        }

        store.set(key, {
          value: body.value,
          bytes,
        });

        limits.storageBytes +=
          bytes - previous.bytes;

        sendJson(response, 200, {
          key,
          value: body.value,
        });

        return;
      }

      // ========================================
      // DELETE : supprimer une clé
      // ========================================

      case "DELETE": {
        const previous = store.get(key);

        if (!store.delete(key)) {
          sendNotFound(response);
          return;
        }

        limits.storageBytes -= previous!.bytes;

        response.writeHead(204);
        response.end();

        return;
      }

      // ========================================
      // MÉTHODE NON AUTORISÉE
      // ========================================

      default: {
        response.setHeader(
          "allow",
          "GET, PUT, DELETE",
        );

        sendJson(response, 405, {
          error: "Method not allowed",
        });
      }
    }
  } catch (error) {

    if (error instanceof HttpError) {
      if (
        error.statusCode === 413 ||
        error.statusCode === 415
      ) {
        response.setHeader(
          "connection",
          "close",
        );
      }

      sendJson(response, error.statusCode, {
        error: error.message,
      });

      return;
    }

    console.error(
      "Unexpected API error:",
      error,
    );

    if (!response.headersSent) {
      sendJson(response, 500, {
        error: "Internal server error",
      });
    } else {
      response.destroy();
    }
  }
}

// ==========================================
// CRÉATION DU SERVEUR
// ==========================================

export function createKeyValueServer(
  options: ServerOptions = {},
): Server {

  const limits = {
    maxEntries: options.maxEntries ?? 10_000,

    maxStorageBytes:
      options.maxStorageBytes ??
      16 * 1024 * 1024,

    storageBytes: 0,
  };

  for (const value of [
    limits.maxEntries,
    limits.maxStorageBytes,
  ]) {
    if (
      !Number.isSafeInteger(value) ||
      value < 1
    ) {
      throw new RangeError(
        "Cache limits must be positive safe integers",
      );
    }
  }

  const store = new HashMap<StoredValue>();

  const server = createServer(
    (request, response) => {
      void handleRequest(
        store,
        limits,
        request,
        response,
      );
    },
  );

  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.maxConnections = 100;

  return server;
}