import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";

import { Cache, HttpError, validateKey, type CacheOptions } from "./cache";
const MAX_BODY_BYTES = 1024 * 1024;
export type ServerOptions = CacheOptions;

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

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  if (
    request.headers["content-type"]?.split(";")[0].trim().toLowerCase() !==
    "application/json"
  ) {
    request.resume();

    throw new HttpError("Content-Type must be application/json", 415);
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of request.iterator({
    destroyOnReturn: false,
  })) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);

    totalBytes += buffer.length;

    if (totalBytes > MAX_BODY_BYTES) {
      request.resume();

      throw new HttpError("Request body exceeds 1 MiB", 413);
    }

    chunks.push(buffer);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new HttpError("Request body must contain valid JSON", 400);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function handleRequest(
  cache: Cache,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  try {
    const url = new URL(request.url ?? "/", "http://localhost");

    if (
      url.pathname === "/metrics" ||
      (url.pathname === "/keys" && request.method === "GET")
    ) {
      if (request.method !== "GET") {
        response.setHeader("allow", "GET");
        throw new HttpError("Method not allowed", 405);
      }
      sendJson(
        response,
        200,
        url.pathname === "/metrics" ? cache.metrics() : { keys: cache.keys() },
      );
      return;
    }
    if (url.pathname === "/keys") {
      if (request.method !== "POST") {
        response.setHeader("allow", "GET, POST");
        throw new HttpError("Method not allowed", 405);
      }
      const body = await readJsonBody(request);
      if (!isRecord(body) || !Object.hasOwn(body, "value"))
        throw new HttpError(
          "Body must include a non-empty key and a value",
          400,
        );
      validateKey(body.key);
      const entry = cache.write(body.key, body.value, true, body.ttl);
      sendJson(response, 201, result(body.key, entry));
      return;
    }
    const match = /^\/keys\/([^/]+)(?:\/(incr|decr))?$/.exec(url.pathname);
    if (!match) throw new HttpError("Route not found", 404);
    let key: string;
    try {
      key = decodeURIComponent(match[1]);
    } catch {
      throw new HttpError("Key must be URL-encoded correctly", 400);
    }
    validateKey(key);
    if (match[2]) {
      if (request.method !== "POST") {
        response.setHeader("allow", "POST");
        throw new HttpError("Method not allowed", 405);
      }
      sendJson(
        response,
        200,
        result(key, cache.change(key, match[2] === "incr" ? 1 : -1)),
      );
      return;
    }
    switch (request.method) {
      case "GET": {
        const entry = cache.get(key, true);
        if (!entry) {
          sendNotFound(response);
          return;
        }
        sendJson(response, 200, result(key, entry));
        return;
      }
      case "PUT": {
        const body = await readJsonBody(request);
        if (!isRecord(body) || !Object.hasOwn(body, "value"))
          throw new HttpError("Body must include a value", 400);
        sendJson(
          response,
          200,
          result(key, cache.write(key, body.value, false, body.ttl)),
        );
        return;
      }
      case "DELETE":
        cache.delete(key);
        response.writeHead(204);
        response.end();
        return;
      default:
        response.setHeader("allow", "GET, PUT, DELETE");
        throw new HttpError("Method not allowed", 405);
    }
  } catch (error) {
    if (error instanceof HttpError) {
      if (error.statusCode === 413 || error.statusCode === 415) {
        response.setHeader("connection", "close");
      }

      sendJson(response, error.statusCode, {
        error: error.message,
      });

      return;
    }

    console.error("Unexpected API error:", error);

    if (!response.headersSent) {
      sendJson(response, 500, {
        error: "Internal server error",
      });
    } else {
      response.destroy();
    }
  }
}

function result(key: string, entry: { value: unknown; expiresAt?: number }) {
  return {
    key,
    value: entry.value,
    ...(entry.expiresAt === undefined
      ? {}
      : {
          expiresAt: entry.expiresAt,
          ttlRemaining: Math.max(0, (entry.expiresAt - Date.now()) / 1000),
        }),
  };
}
export function createKeyValueServer(options: ServerOptions = {}): Server {
  const cache = new Cache(options);
  const server = createServer((request, response) => {
    void handleRequest(cache, request, response);
  });
  let timer: ReturnType<typeof setInterval> | undefined;
  server.on("listening", () => {
    timer = setInterval(
      () => cache.cleanup(),
      options.cleanupIntervalMs ?? 1000,
    );
    timer.unref();
  });
  server.on("close", () => clearInterval(timer));
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.maxConnections = 100;
  return server;
}
