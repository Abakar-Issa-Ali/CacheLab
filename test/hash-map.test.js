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

test("missing keys and undefined values remain distinguishable", () => {
  const cache = new HashMap();
  assert.equal(cache.get("absent"), undefined);
  assert.equal(cache.has("absent"), false);
  cache.set("undefined", undefined);
  assert.equal(cache.has("undefined"), true);
  assert.equal(cache.size, 1);
});

// Independent calculation verifies that all selected keys collide at capacity 16.
function initialIndex(key) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash = Math.imul(hash ^ key.charCodeAt(i), 0x01000193);
  }
  return (hash >>> 0) % 16;
}
const collidingKeys = Array.from({ length: 100 }, (_, i) => `collision-${i}`)
  .filter((key) => initialIndex(key) === initialIndex("collision-0")).slice(0, 3);

for (const position of [0, 1, 2]) {
  test(`deletes collision chain position ${position} and preserves its neighbours`, () => {
    assert.equal(collidingKeys.length, 3);
    const cache = new HashMap();
    collidingKeys.forEach((key, i) => cache.set(key, i));
    cache.set(collidingKeys[1], "updated");
    assert.equal(cache.size, 3);
    assert.equal(cache.get(collidingKeys[1]), "updated");
    assert.equal(cache.delete(collidingKeys[position]), true);
    assert.equal(cache.has(collidingKeys[position]), false);
    collidingKeys.forEach((key, i) => {
      if (i !== position) assert.equal(cache.get(key), i === 1 ? "updated" : i);
    });
    assert.equal(cache.size, 2);
  });
}

test("grows above 75%, shrinks below 25%, and never below initial capacity", () => {
  const cache = new HashMap();
  assert.equal(cache.capacity, 16);
  for (let i = 0; i < 12; i++) cache.set(`k${i}`, i);
  assert.equal(cache.capacity, 16);
  cache.set("k0", "updated");
  assert.equal(cache.capacity, 16);
  cache.set("k12", 12);
  assert.equal(cache.capacity, 32);
  for (let i = 1; i <= 5; i++) cache.delete(`k${i}`);
  assert.equal(cache.capacity, 32);
  cache.delete("k6");
  assert.equal(cache.capacity, 16);
  assert.equal(cache.get("k0"), "updated");
  for (let i = 7; i <= 12; i++) assert.equal(cache.get(`k${i}`), i);
  for (let i = 0; i <= 12; i++) cache.delete(`k${i}`);
  assert.equal(cache.size, 0);
  assert.equal(cache.capacity, 16);
});
