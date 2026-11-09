const assert = require("node:assert/strict");
const { test } = require("node:test");
const { HashMap } = require("../dist/src/hash-map.js");

test("supports create, read, update, and delete", () => {
  const cache = new HashMap();

  cache.set("user:1", "Alice");
  assert.equal(cache.get("user:1"), "Alice");
  assert.equal(cache.has("user:1"), true);

  cache.set("user:1", "Alicia");
  assert.equal(cache.get("user:1"), "Alicia");
  assert.equal(cache.size, 1);

  assert.equal(cache.delete("user:1"), true);
  assert.equal(cache.has("user:1"), false);
  assert.equal(cache.get("user:1"), undefined);
  assert.equal(cache.delete("user:1"), false);
  assert.equal(cache.size, 0);
});

test("preserves values across collisions and table resizing", () => {
  const cache = new HashMap();
  const values = [];

  cache.set("key-5", "collision-a");
  cache.set("key-10", "collision-b");
  assert.equal(cache.get("key-5"), "collision-a");
  assert.equal(cache.get("key-10"), "collision-b");

  for (let i = 0; i < 500; i += 1) {
    const key = `key-${i}`;
    const value = `value-${i}`;
    cache.set(key, value);
    values.push([key, value]);
  }

  assert.equal(cache.size, values.length);
  for (const [key, value] of values) {
    assert.equal(cache.get(key), value);
  }

  for (let i = 0; i < 490; i += 1) {
    assert.equal(cache.delete(`key-${i}`), true);
  }
  assert.equal(cache.size, 10);
  for (let i = 490; i < 500; i += 1) {
    assert.equal(cache.get(`key-${i}`), `value-${i}`);
  }
});
