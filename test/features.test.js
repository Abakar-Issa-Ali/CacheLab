const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
  mkdirSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { Cache } = require("../dist/src/cache");
const { createKeyValueServer } = require("../dist/src/server");
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const temp = (t) => {
  const dir = mkdtempSync(join(tmpdir(), "cachelab-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return join(dir, "cache.json");
};
test("KEYS empty and numerical operations preserve types and quotas", () => {
  const c = new Cache({ maxStorageBytes: 2 });
  assert.deepEqual(c.keys(), []);
  c.write("a", 9, true);
  assert.throws(() => c.change("a", 1), /capacity/);
  assert.equal(c.get("a").value, 9);
  c.change("a", -1);
  assert.equal(c.get("a").value, 8);
  assert.throws(() => c.change("missing", 1), /not found/);
});
test("INCR DECR refuse non numeric and unsafe numbers", () => {
  for (const value of [
    "12",
    null,
    true,
    {},
    [],
    Number.MAX_SAFE_INTEGER,
    1e100,
  ]) {
    const c = new Cache();
    c.write("n", value, true);
    assert.throws(() => c.change("n", 1));
    assert.deepEqual(c.get("n").value, value);
  }
  const c = new Cache();
  c.write("n", -Number.MAX_SAFE_INTEGER, true);
  assert.throws(() => c.change("n", -1));
  c.write("n", 1.5, false);
  assert.equal(c.change("n", 1).value, 2.5);
  assert.equal(c.change("n", -1).value, 1.5);
});
test("TTL expiration releases quota, permits recreation and counts misses", async () => {
  const c = new Cache({ maxEntries: 1 });
  c.write("a", 1, true, 0.02);
  const expiration = c.get("a").expiresAt;
  c.change("a", 1);
  assert.equal(c.get("a").expiresAt, expiration);
  c.write("a", 3, false);
  assert.equal(c.get("a").expiresAt, expiration);
  await delay(35);
  assert.equal(c.get("a", true), undefined);
  assert.deepEqual(c.metrics(), {
    hits: 0,
    misses: 1,
    totalKeys: 0,
    storageBytes: 0,
    maxStorageBytes: 16777216,
    hitRate: 0,
  });
  c.write("a", 1, true);
});
test("TTL validation, replacement and removal", () => {
  const c = new Cache();
  for (const ttl of [0, -1, "2", Infinity, NaN, 1e100])
    assert.throws(() => c.write("a", 1, true, ttl));
  c.write("a", 1, true, 1);
  const first = c.get("a").expiresAt;
  c.write("a", 2, false, 10);
  assert.ok(c.get("a").expiresAt > first);
  c.write("a", 3, false, null);
  assert.equal(c.get("a").expiresAt, undefined);
});
test("snapshot reload preserves values and expiration, ignores expired entries", async (t) => {
  const path = temp(t);
  const c = new Cache({ persistencePath: path });
  c.write("stable", { a: 1 }, true);
  c.write("short", 2, true, 0.02);
  c.write("long", 3, true, 60);
  await delay(35);
  const next = new Cache({ persistencePath: path });
  assert.deepEqual(next.keys().sort(), ["long", "stable"]);
  assert.deepEqual(next.get("stable").value, { a: 1 });
  assert.equal(next.get("long").expiresAt, c.get("long").expiresAt);
  next.change("long", 1);
  next.delete("stable");
  assert.deepEqual(new Cache({ persistencePath: path }).keys(), ["long"]);
});
test("invalid or over quota snapshots fail without overwriting disk", (t) => {
  const path = temp(t);
  for (const text of [
    "{",
    "{}",
    JSON.stringify({
      version: 1,
      entries: [{ key: "a", value: 1, expiresAt: "bad" }],
    }),
  ]) {
    writeFileSync(path, text);
    assert.throws(() => new Cache({ persistencePath: path }));
    assert.equal(readFileSync(path, "utf8"), text);
  }
  writeFileSync(
    path,
    JSON.stringify({ version: 1, entries: [{ key: "a", value: "large" }] }),
  );
  assert.throws(
    () => new Cache({ persistencePath: path, maxStorageBytes: 1 }),
    /capacity/,
  );
});
test("failed persistence leaves previous memory and snapshot intact", (t) => {
  const path = temp(t);
  const c = new Cache({ persistencePath: path });
  c.write("a", 1, true);
  const backup = readFileSync(path, "utf8");
  rmSync(path);
  mkdirSync(path);
  assert.throws(() => c.write("a", 2, false), /persist/);
  assert.throws(() => c.delete("a"), /persist/);
  assert.equal(c.get("a").value, 1);
  assert.equal(c.metrics().storageBytes, 2);
  assert.ok(backup.includes('"value":1'));
});
test("HTTP operations, metrics, TTL and restart with persistence", async (t) => {
  const path = temp(t);
  let server;
  async function start() {
    server = createKeyValueServer({
      persistencePath: path,
      cleanupIntervalMs: 5,
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    return `http://127.0.0.1:${server.address().port}`;
  }
  const stop = () =>
    new Promise((r, j) => server.close((e) => (e ? j(e) : r())));
  let base = await start();
  t.after(async () => {
    if (server.listening) await stop();
  });
  const call = async (path, method = "GET", body) => {
    const r = await fetch(base + path, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, data: r.status === 204 ? null : await r.json() };
  };
  assert.deepEqual((await call("/keys")).data, { keys: [] });
  assert.equal(
    (await call("/keys", "POST", { key: "a", value: 1 })).status,
    201,
  );
  assert.equal((await call("/keys/a/incr", "POST")).data.value, 2);
  assert.equal((await call("/keys/a/decr", "POST")).data.value, 1);
  await Promise.all(
    Array.from({ length: 20 }, () => call("/keys/a/incr", "POST")),
  );
  assert.equal((await call("/keys/a")).data.value, 21);
  await call("/keys/missing");
  let m = (await call("/metrics")).data;
  assert.equal(m.hits, 1);
  assert.equal(m.misses, 1);
  assert.equal(m.hitRate, 50);
  assert.equal((await call("/keys/a/incr")).status, 405);
  assert.equal((await call("/keys/missing/decr", "POST")).status, 404);
  await call("/keys", "POST", { key: "text", value: "x" });
  assert.equal((await call("/keys/text/incr", "POST")).status, 400);
  await call("/keys", "POST", { key: "ttl", value: 0, ttl: 0.02 });
  await delay(40);
  assert.equal((await call("/keys/ttl")).status, 404);
  assert.ok(!(await call("/keys")).data.keys.includes("ttl"));
  await stop();
  base = await start();
  assert.equal((await call("/keys/a")).data.value, 21);
  assert.equal((await call("/metrics")).data.totalKeys, 2);
});
test("periodic cleanup removes expired entries without any request", async (t) => {
  const { Cache } = require("../dist/src/cache");
  const original = Cache.prototype.cleanup;
  let observed = false;
  Cache.prototype.cleanup = function () {
    original.call(this);
    if (this.store.size === 0) observed = true;
  };
  const server = createKeyValueServer({ cleanupIntervalMs: 5 });
  t.after(() => {
    Cache.prototype.cleanup = original;
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    await fetch(`http://127.0.0.1:${server.address().port}/keys`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: "expire", value: 1, ttl: 0.02 }),
    });
    observed = false;
    await delay(80);
    assert.equal(observed, true);
  } finally {
    await new Promise((r) => server.close(r));
  }
});
test("HTTP storage growth and persistence failure return JSON without mutation", async (t) => {
  const path = temp(t);
  const server = createKeyValueServer({
    persistencePath: path,
    maxStorageBytes: 2,
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => new Promise((r) => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}`;
  await fetch(base + "/keys", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: '{"key":"a","value":9}',
  });
  assert.equal(
    (await fetch(base + "/keys/a/incr", { method: "POST" })).status,
    507,
  );
  rmSync(path);
  mkdirSync(path);
  const fail = await fetch(base + "/keys/a/decr", { method: "POST" });
  assert.equal(fail.status, 500);
  assert.match((await fail.json()).error, /persist/);
  assert.equal((await (await fetch(base + "/keys/a")).json()).value, 9);
  const invalid = await fetch(base + "/keys", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: '{"key":"b","value":1e400}',
  });
  assert.equal(invalid.status, 400);
});
