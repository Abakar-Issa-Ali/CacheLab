const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");
const { createKeyValueServer } = require("../dist/src/server.js");

const server = createKeyValueServer();
let baseUrl;

before(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

test("POST, GET, PUT, and DELETE /keys perform the CRUD lifecycle", async () => {
  const created = await fetch(`${baseUrl}/keys`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ key: "session:1", value: { user: "Alice" } }),
  });
  assert.equal(created.status, 201);
  assert.deepEqual(await created.json(), {
    key: "session:1",
    value: { user: "Alice" },
  });

  const read = await fetch(`${baseUrl}/keys/session%3A1`);
  assert.equal(read.status, 200);
  assert.deepEqual(await read.json(), {
    key: "session:1",
    value: { user: "Alice" },
  });

  const updated = await fetch(`${baseUrl}/keys/session%3A1`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ value: "active" }),
  });
  assert.equal(updated.status, 200);
  assert.deepEqual(await updated.json(), { key: "session:1", value: "active" });

  const deleted = await fetch(`${baseUrl}/keys/session%3A1`, { method: "DELETE" });
  assert.equal(deleted.status, 204);
  assert.equal(await deleted.text(), "");

  const missing = await fetch(`${baseUrl}/keys/session%3A1`);
  assert.equal(missing.status, 404);

  const missingDelete = await fetch(`${baseUrl}/keys/session%3A1`, {
    method: "DELETE",
  });
  assert.equal(missingDelete.status, 404);
});

test("reports duplicate creates, missing updates, and invalid request bodies", async () => {
  const createRequest = () =>
    fetch(`${baseUrl}/keys`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: "duplicate", value: null }),
    });

  assert.equal((await createRequest()).status, 201);
  assert.equal((await createRequest()).status, 409);

  const missingUpdate = await fetch(`${baseUrl}/keys/absent`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ value: "value" }),
  });
  assert.equal(missingUpdate.status, 404);

  const invalidBody = await fetch(`${baseUrl}/keys`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{",
  });
  assert.equal(invalidBody.status, 400);
});
