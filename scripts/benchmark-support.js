const { performance } = require("node:perf_hooks");
const { mkdirSync, writeFileSync } = require("node:fs");
const { dirname, resolve } = require("node:path");

const OPERATIONS = [
  "SET",
  "GET",
  "PUT",
  "DELETE",
  "KEYS",
  "INCR",
  "DECR",
  "METRICS",
];
const SCENARIOS = { light: [100, 1], medium: [1000, 10], heavy: [10000, 50] };
function integer(value, name, min = 1, max = 1_000_000) {
  if (!/^\d+$/.test(String(value)))
    throw new Error(`${name} must be an integer`);
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < min || n > max)
    throw new Error(`${name} must be between ${min} and ${max}`);
  return n;
}
function parseArgs(args, env = process.env) {
  const values = {};
  const allowed = [
    "scenario",
    "requests",
    "concurrency",
    "volume",
    "warmup",
    "mode",
    "operations",
    "timeout",
    "json",
    "csv",
  ];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--help") return { help: true };
    const name = args[i].slice(2);
    if (!args[i].startsWith("--") || !allowed.includes(name))
      throw new Error(`Unknown argument: ${args[i]}`);
    if (Object.hasOwn(values, name))
      throw new Error(`Duplicate argument: --${name}`);
    const value = args[++i];
    if (!value || value.startsWith("--"))
      throw new Error(`Missing value for --${name}`);
    values[name] = value;
  }
  const scenario = values.scenario || "light";
  if (!Object.hasOwn(SCENARIOS, scenario))
    throw new Error("scenario must be light, medium or heavy");
  const [requests, concurrency] = SCENARIOS[scenario];
  const list = (value, name, fallback, max) =>
    (value || fallback).split(",").map((n) => integer(n, name, 1, max));
  const mode = values.mode || (env.BENCH_PERSIST === "1" ? "disk" : "memory");
  if (!["memory", "disk", "both"].includes(mode))
    throw new Error("mode must be memory, disk or both");
  const operations = (values.operations || OPERATIONS.join(","))
    .split(",")
    .map((s) => (s.toUpperCase() === "POST" ? "SET" : s.toUpperCase()));
  if (
    operations.some((s) => !OPERATIONS.includes(s)) ||
    new Set(operations).size !== operations.length
  )
    throw new Error("Invalid or duplicate operations");
  const config = {
    scenario,
    requests: integer(
      values.requests ?? env.BENCH_REQUESTS ?? requests,
      "requests",
    ),
    concurrencies: values.concurrency
      ? [integer(values.concurrency, "concurrency", 1, 100)]
      : list(env.BENCH_CONCURRENCY, "concurrency", String(concurrency), 100),
    volumes: values.volume
      ? [integer(values.volume, "volume")]
      : list(env.BENCH_VOLUMES, "volume", "100", 1_000_000),
    warmup: integer(values.warmup ?? 20, "warmup", 0, 10000),
    timeoutMs: integer(values.timeout ?? 10000, "timeout", 1, 120000),
    mode,
    operations,
    json: values.json,
    csv: values.csv,
  };
  if (config.json && config.csv && resolve(config.json) === resolve(config.csv))
    throw new Error("JSON and CSV paths must differ");
  return config;
}
function summarize(latencies, elapsedMs) {
  if (
    !latencies.length ||
    latencies.some((n) => !Number.isFinite(n) || n < 0) ||
    !Number.isFinite(elapsedMs) ||
    elapsedMs <= 0
  )
    throw new Error("Invalid timing samples");
  const sorted = [...latencies].sort((a, b) => a - b);
  const percentile = (p) => sorted[Math.ceil(sorted.length * p) - 1];
  return {
    requests: sorted.length,
    elapsedMs,
    minMs: sorted[0],
    maxMs: sorted.at(-1),
    meanMs: sorted.reduce((a, b) => a + b, 0) / sorted.length,
    p50Ms: percentile(0.5),
    p95Ms: percentile(0.95),
    p99Ms: percentile(0.99),
    requestsPerSecond: (sorted.length * 1000) / elapsedMs,
  };
}
async function request(base, spec, timeoutMs, fetchImpl = fetch) {
  try {
    const response = await fetchImpl(base + spec.path, {
      method: spec.method || "GET",
      headers:
        spec.body === undefined
          ? undefined
          : { "content-type": "application/json" },
      body: spec.body === undefined ? undefined : JSON.stringify(spec.body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = await response.text();
    return {
      kind: response.status === (spec.expected ?? 200) ? "success" : "http",
      status: response.status,
      body,
    };
  } catch (error) {
    return {
      kind: "network",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
async function measure(run, requests, concurrency) {
  const latencies = [];
  const counts = { success: 0, httpErrors: 0, networkErrors: 0 };
  const statusCodes = {};
  const errorSamples = [];
  let next = 0;
  const start = performance.now();
  await Promise.all(
    Array.from({ length: Math.min(concurrency, requests) }, async () => {
      while (next < requests) {
        const index = next++;
        const before = performance.now();
        const result = await run(index);
        latencies.push(performance.now() - before);
        if (result.status !== undefined)
          statusCodes[result.status] = (statusCodes[result.status] || 0) + 1;
        if (result.kind === "success") counts.success++;
        else {
          counts[result.kind === "http" ? "httpErrors" : "networkErrors"]++;
          if (errorSamples.length < 5)
            errorSamples.push({
              kind: result.kind,
              status: result.status,
              message: (result.error || result.body || "").slice(0, 200),
            });
        }
      }
    }),
  );
  return {
    ...summarize(latencies, performance.now() - start),
    ...counts,
    failed: counts.httpErrors + counts.networkErrors,
    statusCodes,
    errorSamples,
  };
}
const CSV_COLUMNS = [
  "date",
  "node",
  "os",
  "cpu",
  "scenario",
  "mode",
  "volume",
  "concurrency",
  "operation",
  "method",
  "route",
  "warmup",
  "keysBefore",
  "keysAfter",
  "requests",
  "success",
  "failed",
  "httpErrors",
  "networkErrors",
  "elapsedMs",
  "minMs",
  "maxMs",
  "meanMs",
  "p50Ms",
  "p95Ms",
  "p99Ms",
  "requestsPerSecond",
];
function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text;
}
function toCsv(report) {
  return (
    [
      CSV_COLUMNS.join(","),
      ...report.results.map((row) =>
        CSV_COLUMNS.map((key) =>
          csvCell({ ...report.metadata, ...row }[key]),
        ).join(","),
      ),
    ].join("\r\n") + "\r\n"
  );
}
function exportResults(report, { json, csv }) {
  for (const [path, content] of [
    [json, JSON.stringify(report, null, 2) + "\n"],
    [csv, toCsv(report)],
  ]) {
    if (!path) continue;
    mkdirSync(dirname(resolve(path)), { recursive: true });
    writeFileSync(path, content, "utf8");
  }
}
module.exports = {
  OPERATIONS,
  SCENARIOS,
  parseArgs,
  summarize,
  request,
  measure,
  toCsv,
  exportResults,
};
