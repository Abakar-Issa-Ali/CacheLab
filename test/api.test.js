const assert = require("node:assert/strict");
const { test } = require("node:test");
const { createCacheLabServer } = require("../dist/src/server.js");

test("le serveur répond au message du client", async () => {
  const server = createCacheLabServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  const response = await fetch(`http://127.0.0.1:${port}`, { method: "POST", body: "ping" });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    message: "Hi from CacheLab",
    received: "ping",
  });

  server.close();
});