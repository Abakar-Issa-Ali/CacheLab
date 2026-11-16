const { performance } = require("node:perf_hooks");
const { cpus } = require("node:os");
const { fork } = require("node:child_process");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { once } = require("node:events");
const { createKeyValueServer } = require("../dist/src/server");

// The API runs in another process to avoid sharing its event loop with the load generator.
if (process.env.CACHELAB_BENCH_CHILD) {
  const server = createKeyValueServer({
    maxEntries: 100000,
    persistencePath: process.env.BENCH_FILE || undefined,
  });
  server.listen(0, "127.0.0.1", () => process.send(server.address().port));
  process.on("message", () => server.close(() => process.exit(0)));
} else
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
function positiveList(name, fallback) {
  const values = (process.env[name] || fallback).split(",").map(Number);
  if (values.some((n) => !Number.isSafeInteger(n) || n < 1))
    throw Error(`Invalid ${name}`);
  return values;
}
async function main() {
  const volumes = positiveList("BENCH_VOLUMES", "100,1000");
  const concurrencies = positiveList("BENCH_CONCURRENCY", "1,10");
  const samples = positiveList("BENCH_REQUESTS", "200")[0];
  const disk = process.env.BENCH_PERSIST === "1";
  console.log(
    JSON.stringify({
      date: new Date().toISOString(),
      node: process.version,
      platform: process.platform,
      cpu: cpus()[0]?.model,
      persistence: disk,
      samples,
      warmup: 20,
    }),
  );
  for (const volume of volumes)
    for (const concurrency of concurrencies) {
      const dir = mkdtempSync(join(tmpdir(), "cachelab-bench-"));
      const child = fork(__filename, [], {
        env: {
          ...process.env,
          CACHELAB_BENCH_CHILD: "1",
          BENCH_FILE: disk ? join(dir, "cache.json") : "",
        },
        stdio: ["ignore", "inherit", "inherit", "ipc"],
      });
      try {
        const [port] = await Promise.race([
          once(child, "message"),
          once(child, "exit").then(() => {
            throw Error("API exited before startup");
          }),
        ]);
        const base = `http://127.0.0.1:${port}`;
        async function request(path, method = "GET", body, expected = 200) {
          const r = await fetch(base + path, {
            method,
            headers: body ? { "content-type": "application/json" } : undefined,
            body: body ? JSON.stringify(body) : undefined,
            signal: AbortSignal.timeout(10000),
          });
          await r.arrayBuffer();
          return r.status === expected;
        }
        for (let i = 0; i < volume; i++)
          if (
            !(await request("/keys", "POST", { key: `k${i}`, value: i }, 201))
          )
            throw Error("Seeding failed");
        let sequence = 0;
        const operations = {
          GET: () => request("/keys/k0"),
          POST: () =>
            request(
              "/keys",
              "POST",
              { key: `new${sequence++}`, value: 1 },
              201,
            ),
          PUT: () => request("/keys/k0", "PUT", { value: 1 }),
          KEYS: () => request("/keys"),
          INCR: () => request("/keys/k0/incr", "POST"),
          DECR: () => request("/keys/k0/decr", "POST"),
          DELETE: (i) => request(`/keys/delete${i}`, "DELETE", undefined, 204),
        };
        for (const [operation, run] of Object.entries(operations)) {
          if (operation === "DELETE")
            for (let i = 0; i < samples + 20; i++)
              await request(
                "/keys",
                "POST",
                { key: `delete${i}`, value: 0 },
                201,
              );
          for (let i = 0; i < 20; i++)
            if (!(await run(samples + i)))
              throw Error(`Warmup failed: ${operation}`);
          const times = [];
          let next = 0,
            success = 0;
          const start = performance.now();
          await Promise.all(
            Array.from({ length: Math.min(concurrency, samples) }, async () => {
              while (next < samples) {
                const i = next++;
                const before = performance.now();
                try {
                  if (await run(i)) success++;
                } catch {}
                times.push(performance.now() - before);
              }
            }),
          );
          const elapsed = performance.now() - start;
          times.sort((a, b) => a - b);
          const p = (q) => times[Math.ceil(times.length * q) - 1];
          const round = (n) => Number(n.toFixed(3));
          console.log(
            JSON.stringify({
              volume,
              concurrency,
              operation,
              success,
              failed: samples - success,
              meanMs: round(times.reduce((a, b) => a + b, 0) / times.length),
              minMs: round(times[0]),
              maxMs: round(times.at(-1)),
              p50Ms: round(p(0.5)),
              p95Ms: round(p(0.95)),
              p99Ms: round(p(0.99)),
              requestsPerSecond: round((samples / elapsed) * 1000),
            }),
          );
        }
      } finally {
        if (child.connected) child.send("stop");
        if (child.exitCode === null) await once(child, "exit");
        rmSync(dir, { recursive: true, force: true });
      }
    }
}
