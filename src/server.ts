import { createServer, type Server } from "node:http";

export function createCacheLabServer(): Server {
  return createServer((request, response) => {
    console.log(`Requête reçue : ${request.method} ${request.url}`);

    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });

    request.on("end", () => {
      response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      response.end(
        JSON.stringify({
          message: "Hi from CacheLab",
          received: body || null,
        }),
      );
    });
  });
}