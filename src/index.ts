import { createKeyValueServer } from "./server";

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  throw new Error("PORT must be an integer between 0 and 65535");
}

const server = createKeyValueServer();
server.on("error", (error) => {
  console.error("Unable to start CacheLab API:", error);
  process.exitCode = 1;
});
server.listen(port, "127.0.0.1", () => {
  const address = server.address();
  if (address && typeof address !== "string") {
    console.info(`CacheLab API listening on http://127.0.0.1:${address.port}`);
  }
});
