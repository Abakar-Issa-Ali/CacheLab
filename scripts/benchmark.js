const assert = require("node:assert/strict");
const { performance } = require("node:perf_hooks");
const { cpus } = require("node:os");
const { HashMap } = require("../dist/src/hash-map.js");

function measure(keys) {
  const cache = new HashMap();
  const start = performance.now();
  keys.forEach((key, i) => cache.set(key, i));
  const inserted = performance.now();
  let checksum = 0;
  for (const key of keys) checksum += cache.get(key);
  const end = performance.now();
  assert.equal(checksum, keys.length * (keys.length - 1) / 2);
  assert.equal(cache.size, keys.length);
  return { insertion: inserted - start, recherche: end - inserted };
}
function median(values) {
  return values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
}
console.log(`Node ${process.version}; ${process.platform}/${process.arch}; ${cpus()[0]?.model}`);
console.log("HashMap seule, clés préconstruites, 5 échauffements puis médiane de 21 passages (ms).");
for (const count of [100, 1000, 10000]) {
  const keys = Array.from({ length: count }, (_, i) => `benchmark:${i}`);
  for (let i = 0; i < 5; i++) measure(keys);
  const samples = Array.from({ length: 21 }, () => measure(keys));
  console.log(`${count} clés : insertion ${median(samples.map(s => s.insertion)).toFixed(4)} ms ; recherche ${median(samples.map(s => s.recherche)).toFixed(4)} ms`);
}
