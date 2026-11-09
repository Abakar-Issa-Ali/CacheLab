import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { HashMap } from "./hash-map";

const MAX_BODY_BYTES = 1024 * 1024;

class HttpError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
  }
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function sendNotFound(response: ServerResponse): void {
  sendJson(response, 404, { error: "Key not found" });
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;
    if (totalBytes > MAX_BODY_BYTES) {
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
  store: HashMap<unknown>,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  try {
    const url = new URL(request.url ?? "/", "http://localhost");

    if (url.pathname === "/keys") {
      if (request.method !== "POST") {
        response.setHeader("allow", "POST");
        sendJson(response, 405, { error: "Method not allowed" });
        return;
      }

      const body = await readJsonBody(request);
      if (
        !isRecord(body) ||
        typeof body.key !== "string" ||
        body.key.length === 0 ||
        !Object.hasOwn(body, "value")
      ) {
        throw new HttpError("Body must include a non-empty key and a value", 400);
      }
      if (store.has(body.key)) {
        sendJson(response, 409, { error: "Key already exists" });
        return;
      }

      store.set(body.key, body.value);
      sendJson(response, 201, { key: body.key, value: body.value });
      return;
    }

    const keyMatch = /^\/keys\/([^/]+)$/.exec(url.pathname);
    if (!keyMatch) {
      sendJson(response, 404, { error: "Route not found" });
      return;
    }

    let key: string;
    try {
      key = decodeURIComponent(keyMatch[1]);
    } catch {
      throw new HttpError("Key must be URL-encoded correctly", 400);
    }
    if (key.length === 0) {
      throw new HttpError("Key must not be empty", 400);
    }

    switch (request.method) {
      case "GET": {
        if (!store.has(key)) {
          sendNotFound(response);
          return;
        }
        sendJson(response, 200, { key, value: store.get(key) });
        return;
      }
      case "PUT": {
        const body = await readJsonBody(request);
        if (!isRecord(body) || !Object.hasOwn(body, "value")) {
          throw new HttpError("Body must include a value", 400);
        }
        if (!store.has(key)) {
          sendNotFound(response);
          return;
        }

        store.set(key, body.value);
        sendJson(response, 200, { key, value: body.value });
        return;
      }
      case "DELETE": {
        if (!store.delete(key)) {
          sendNotFound(response);
          return;
        }
        response.writeHead(204);
        response.end();
        return;
      }
      default:
        response.setHeader("allow", "GET, PUT, DELETE");
        sendJson(response, 405, { error: "Method not allowed" });
    }
  } catch (error) {
    if (error instanceof HttpError) {
      sendJson(response, error.statusCode, { error: error.message });
      return;
    }

    console.error("Unexpected API error:", error);
    if (!response.headersSent) {
      sendJson(response, 500, { error: "Internal server error" });
    } else {
      response.destroy();
    }
  }
}

export function createKeyValueServer(): Server {
  const store = new HashMap<unknown>();
  return createServer((request, response) => {
    void handleRequest(store, request, response);
  });
}
