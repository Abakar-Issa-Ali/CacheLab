const { fork } = require("node:child_process");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir, cpus, release } = require("node:os");
const { join } = require("node:path");
const {
  parseArgs,
  request,
  measure,
  exportResults,
} = require("./benchmark-support");

const HELP = `CACHELAB — HTTP BENCHMARK
Usage: npm run benchmark -- [options]
  --scenario light|medium|heavy   100/1, 1000/10, 10000/50 (requests/concurrency)
  --requests N                   Measured requests per operation (1..1000000)
  --concurrency N                Concurrent requests (1..100)
  --volume N                     Initial baseline keys (default 100)
  --warmup N                     Warm-up per operation (default 20, may be 0)
  --mode memory|disk|both         Default memory; private temporary snapshots
  --operations SET,GET,...        Default all eight operations; POST aliases SET
  --timeout N                    Per-request timeout in ms (default 10000)
  --json path                    Export full report JSON
  --csv path                     Export flattened CSV
  --help
BENCH_REQUESTS, BENCH_CONCURRENCY, BENCH_VOLUMES and BENCH_PERSIST=1
remain supported. CLI values take precedence. No external server is modified.`;

function startWorker(options) {
  const child = fork(join(__dirname, "benchmark-worker.js"), [], {
    env: { ...process.env, CACHELAB_BENCH_OPTIONS: JSON.stringify(options) },
    stdio: ["ignore", "ignore", "inherit", "ipc"],
  });
  const ready = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Benchmark API startup timed out"));
    }, 15000);
    function cleanup() {
      clearTimeout(timeout);
      child.off("message", message);
      child.off("error", error);
      child.off("exit", exit);
    }
    function message(data) {
      if (Number.isInteger(data?.port)) {
        cleanup();
        resolve(`http://127.0.0.1:${data.port}`);
      }
    }
    function error(e) {
      cleanup();
      reject(e);
    }
    function exit(code) {
      cleanup();
      reject(new Error(`Benchmark API exited before startup (${code})`));
    }
    child.on("message", message);
    child.once("error", error);
    child.once("exit", exit);
  });
  return { child, ready };
}
async function stopWorker(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise((resolve) => {
    const timeout = setTimeout(() => child.kill("SIGKILL"), 3000);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
    child.kill("SIGTERM");
  });
}
function operationSpec(operation, prefix, index) {
  const target = `/keys/${prefix}base-0`;
  switch (operation) {
    case "SET":
      return {
        path: "/keys",
        method: "POST",
        expected: 201,
        body: { key: `${prefix}set-${index}`, value: 1 },
      };
    case "GET":
      return { path: target };
    case "PUT":
      return { path: target, method: "PUT", body: { value: index } };
    case "DELETE":
      return {
        path: `/keys/${prefix}delete-${index}`,
        method: "DELETE",
        expected: 204,
      };
    case "KEYS":
      return { path: "/keys" };
    case "INCR":
      return { path: target + "/incr", method: "POST" };
    case "DECR":
      return { path: target + "/decr", method: "POST" };
    case "METRICS":
      return { path: "/metrics" };
    default:
      throw new Error(`Unknown operation ${operation}`);
  }
}
async function runOperation(config, mode, volume, concurrency, operation) {
  const dir = mkdtempSync(join(tmpdir(), "cachelab-bench-"));
  const maxEntries = volume + config.requests + config.warmup + 1;
  // Dedicated quotas cover all keys and small numeric values, independently of production defaults.
  const options = {
    maxEntries,
    maxStorageBytes: maxEntries * 256,
    ...(mode === "disk" ? { persistencePath: join(dir, "cache.json") } : {}),
  };
  let worker;
  try {
    worker = startWorker(options);
    const base = await worker.ready;
    const prefix = "bench-cachelab-";
    const send = (spec) => request(base, spec, config.timeoutMs);
    async function checked(spec) {
      const result = await send(spec);
      if (result.kind !== "success")
        throw new Error(
          `Preparation/warm-up failed: ${result.kind} ${result.status ?? result.error} ${result.body ?? ""}`,
        );
      return result.body;
    }
    for (let i = 0; i < volume; i++)
      await checked({
        path: "/keys",
        method: "POST",
        expected: 201,
        body: { key: `${prefix}base-${i}`, value: 0 },
      });
    if (operation === "DELETE")
      for (let i = 0; i < config.requests + config.warmup; i++)
        await checked({
          path: "/keys",
          method: "POST",
          expected: 201,
          body: { key: `${prefix}delete-${i}`, value: 0 },
        });
    for (let i = 0; i < config.warmup; i++)
      await checked(operationSpec(operation, prefix, i));
    const keysBefore = JSON.parse(
      await checked({ path: "/metrics" }),
    ).totalKeys;
    const stats = await measure(
      (i) => send(operationSpec(operation, prefix, config.warmup + i)),
      config.requests,
      concurrency,
    );
    const after = await send({ path: "/metrics" });
    const keysAfter =
      after.kind === "success" ? JSON.parse(after.body).totalKeys : null;
    const postCheckError =
      after.kind === "success"
        ? undefined
        : { kind: after.kind, status: after.status, error: after.error };
    const spec = operationSpec(operation, ":key-", 0);
    return {
      mode,
      volume,
      concurrency,
      operation,
      method: spec.method || "GET",
      route: ["GET", "PUT", "DELETE"].includes(operation)
        ? "/keys/:key"
        : ["INCR", "DECR"].includes(operation)
          ? `/keys/:key/${operation.toLowerCase()}`
          : spec.path,
      warmup: config.warmup,
      keysBefore,
      keysAfter,
      ...(postCheckError ? { postCheckError } : {}),
      maxEntries,
      maxStorageBytes: options.maxStorageBytes,
      ...stats,
    };
  } finally {
    if (worker) await stopWorker(worker.child);
    rmSync(dir, { recursive: true, force: true });
  }
}
function printRow(row) {
  console.log(
    [
      row.mode.padEnd(7),
      String(row.volume).padStart(6),
      String(row.concurrency).padStart(4),
      row.operation.padEnd(7),
      String(row.requests).padStart(7),
      String(row.success).padStart(7),
      String(row.failed).padStart(5),
      String(row.httpErrors).padStart(5),
      String(row.networkErrors).padStart(5),
      ...["minMs", "maxMs", "meanMs", "p50Ms", "p95Ms", "p99Ms"].map((k) =>
        row[k].toFixed(3).padStart(9),
      ),
      row.requestsPerSecond.toFixed(1).padStart(9),
      `${row.keysBefore}->${row.keysAfter ?? "?"}`,
    ].join(" "),
  );
}
async function main(args = process.argv.slice(2)) {
  const config = parseArgs(args);
  if (config.help) {
    console.log(HELP);
    return;
  }
  const metadata = {
    date: new Date().toISOString(),
    node: process.version,
    os: `${process.platform} ${release()} ${process.arch}`,
    cpu: cpus()[0]?.model,
    scenario: config.scenario,
    clock: "performance.now",
    percentileMethod: "nearest-rank: sorted[ceil(p*N)-1]",
    latencyUnit: "ms",
    target: "isolated local child process per operation",
  };
  const report = { schemaVersion: 1, metadata, config, results: [] };
  console.log("CACHELAB — HTTP BENCHMARK\n" + JSON.stringify(metadata));
  console.log(
    "Mode    Volume Conc Op      Requests Success  Fail  HTTP   Net   Min(ms)   Max(ms)   Avg(ms)   P50(ms)   P95(ms)   P99(ms)       RPS Keys(before->after)",
  );
  for (const mode of config.mode === "both"
    ? ["memory", "disk"]
    : [config.mode])
    for (const volume of config.volumes)
      for (const concurrency of config.concurrencies)
        for (const operation of config.operations) {
          const row = await runOperation(
            config,
            mode,
            volume,
            concurrency,
            operation,
          );
          report.results.push(row);
          printRow(row);
        }
  exportResults(report, config);
  const errors = report.results.reduce((sum, r) => sum + r.failed, 0);
  console.log(
    `Completed: ${report.results.reduce((sum, r) => sum + r.requests, 0)} measured requests; ${errors} failures.`,
  );
  if (config.json) console.log(`JSON: ${config.json}`);
  if (config.csv) console.log(`CSV: ${config.csv}`);
  if (errors || report.results.some((row) => row.postCheckError))
    process.exitCode = 1;
  return report;
}
if (require.main === module)
  main().catch((error) => {
    console.error("Benchmark failed:", error.message);
    process.exitCode = 1;
  });
module.exports = { main, runOperation, operationSpec };
