const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { createServer } = require("node:http");
const {
  parseArgs,
  summarize,
  request,
  measure,
  exportResults,
  toCsv,
} = require("../scripts/benchmark-support");
const { runOperation, operationSpec } = require("../scripts/benchmark-http");

test("benchmark statistics use arithmetic mean, nearest rank and wall time throughput", () => {
  const samples = Array.from({ length: 100 }, (_, i) => 100 - i);
  const stats = summarize(samples, 2000);
  assert.equal(stats.requests, 100);
  assert.equal(stats.meanMs, 50.5);
  assert.equal(stats.minMs, 1);
  assert.equal(stats.maxMs, 100);
  assert.equal(stats.p50Ms, 50);
  assert.equal(stats.p95Ms, 95);
  assert.equal(stats.p99Ms, 99);
  assert.equal(stats.requestsPerSecond, 50);
  assert.equal(samples[0], 100);
  assert.equal(summarize([5], 10).p99Ms, 5);
  assert.equal(summarize([1, 2, 3, 4], 10).p50Ms, 2);
  for (const [values, time] of [
    [[], 1],
    [[NaN], 1],
    [[1], 0],
    [[-1], 1],
  ])
    assert.throws(() => summarize(values, time));
});
test("benchmark CLI defines all three scenarios and explicit overrides", () => {
  for (const [scenario, requests, concurrency] of [
    ["light", 100, 1],
    ["medium", 1000, 10],
    ["heavy", 10000, 50],
  ]) {
    const c = parseArgs(["--scenario", scenario], {});
    assert.equal(c.requests, requests);
    assert.deepEqual(c.concurrencies, [concurrency]);
  }
  const c = parseArgs(
    [
      "--requests",
      "7",
      "--concurrency",
      "2",
      "--mode",
      "both",
      "--volume",
      "3",
      "--warmup",
      "0",
      "--timeout",
      "99",
      "--operations",
      "POST,GET",
    ],
    {},
  );
  assert.equal(c.requests, 7);
  assert.deepEqual(c.concurrencies, [2]);
  assert.deepEqual(c.volumes, [3]);
  assert.equal(c.mode, "both");
  assert.equal(c.warmup, 0);
  assert.equal(c.timeoutMs, 99);
  assert.deepEqual(c.operations, ["SET", "GET"]);
  const env = {
    BENCH_REQUESTS: "9",
    BENCH_CONCURRENCY: "1,3",
    BENCH_VOLUMES: "10,20",
    BENCH_PERSIST: "1",
  };
  assert.equal(parseArgs([], env).mode, "disk");
  assert.deepEqual(parseArgs([], env).concurrencies, [1, 3]);
  assert.equal(parseArgs(["--requests", "2"], env).requests, 2);
  assert.equal(parseArgs(["--help"], {}).help, true);
});
test("benchmark CLI rejects invalid, missing, duplicate or unknown arguments", () => {
  for (const args of [
    ["--requests", "0"],
    ["--requests", "1.5"],
    ["--requests", "NaN"],
    ["--requests", "-1"],
    ["--requests", "1e3"],
    ["--requests", "1000001"],
    ["--concurrency", "101"],
    ["--concurrency", "0"],
    ["--volume", "0"],
    ["--warmup", "-1"],
    ["--timeout", "0"],
    ["--scenario", "other"],
    ["--mode", "remote"],
    ["--operations", "GET,BOGUS"],
    ["--operations", "GET,GET"],
    ["--operations", "SET,POST"],
    ["--requests"],
    ["--requests", "--mode", "disk"],
    ["--bogus", "1"],
    ["5"],
    ["--requests", "1", "--requests", "2"],
    ["--json", "same", "--csv", "same"],
  ])
    assert.throws(() => parseArgs(args, {}), undefined, args.join(" "));
  assert.throws(() => parseArgs([], { BENCH_CONCURRENCY: "1," }));
});
test("HTTP status mismatch differs from network and body-read errors", async () => {
  let consumed = false;
  const response = async () => ({
    status: 507,
    text: async () => {
      consumed = true;
      return '{"error":"quota"}';
    },
  });
  const wrong = await request(
    "http://127.0.0.1",
    { path: "/keys", expected: 201 },
    100,
    response,
  );
  assert.equal(wrong.kind, "http");
  assert.equal(wrong.status, 507);
  assert.equal(consumed, true);
  const failed = await request(
    "http://127.0.0.1",
    { path: "/keys" },
    100,
    async () => {
      throw Error("connection refused");
    },
  );
  assert.equal(failed.kind, "network");
  assert.match(failed.error, /refused/);
  const bodyError = await request(
    "http://127.0.0.1",
    { path: "/keys" },
    100,
    async () => ({
      status: 200,
      text: async () => {
        throw Error("truncated");
      },
    }),
  );
  assert.equal(bodyError.kind, "network");
});
test("benchmark handles real unexpected HTTP responses and connection refusal", async () => {
  const server = createServer((_req, res) => {
    res.writeHead(503);
    res.end("unavailable");
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const result = await request(base, { path: "/keys" }, 1000);
    assert.equal(result.kind, "http");
    assert.equal(result.status, 503);
  } finally {
    await new Promise((r) => server.close(r));
  }
  assert.equal((await request(base, { path: "/keys" }, 1000)).kind, "network");
});
test("measurement counts every request, separates errors and bounds concurrency", async () => {
  let active = 0,
    maxActive = 0;
  const report = await measure(
    async (i) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setImmediate(r));
      active--;
      return i < 2
        ? { kind: "success", status: 200 }
        : i === 2
          ? { kind: "http", status: 404, body: "missing" }
          : { kind: "network", error: "offline" };
    },
    5,
    2,
  );
  assert.equal(report.requests, 5);
  assert.equal(report.success, 2);
  assert.equal(report.httpErrors, 1);
  assert.equal(report.networkErrors, 2);
  assert.equal(report.failed, 3);
  assert.equal(maxActive, 2);
  assert.deepEqual(report.statusCodes, { 200: 2, 404: 1 });
  assert.equal(report.errorSamples.length, 3);
  assert.ok(report.p50Ms <= report.p95Ms);
  assert.ok(report.requestsPerSecond > 0);
});
test("JSON and CSV exports preserve metadata, numeric statistics and CSV escaping", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "cachelab-export-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const report = {
    metadata: {
      date: "2026-11-16T00:00:00Z",
      node: process.version,
      os: "linux",
      cpu: 'CPU, "demo"\nmodel',
      scenario: "light",
    },
    results: [
      {
        mode: "memory",
        operation: "GET",
        ...summarize([1, 2, 3], 100),
        success: 3,
        failed: 0,
        httpErrors: 0,
        networkErrors: 0,
      },
    ],
  };
  const json = join(dir, "nested", "report.json"),
    csv = join(dir, "nested", "report.csv");
  exportResults(report, { json, csv });
  assert.deepEqual(JSON.parse(readFileSync(json, "utf8")), report);
  const text = readFileSync(csv, "utf8");
  assert.equal(text, toCsv(report));
  assert.match(text, /"CPU, ""demo""\nmodel"/);
  assert.match(text, /meanMs,p50Ms,p95Ms,p99Ms,requestsPerSecond/);
  assert.match(text, /2026-11-16T00:00:00Z/);
  assert.throws(() => exportResults(report, { json: dir }));
});
test("operation specifications match existing routes and unique mutation keys", () => {
  assert.equal(
    operationSpec("INCR", "bench-", 0).path,
    "/keys/bench-base-0/incr",
  );
  assert.equal(
    operationSpec("DECR", "bench-", 0).path,
    "/keys/bench-base-0/decr",
  );
  assert.equal(operationSpec("METRICS", "bench-", 0).path, "/metrics");
  assert.equal(operationSpec("SET", "bench-", 0).expected, 201);
  assert.notEqual(
    operationSpec("DELETE", "bench-", 0).path,
    operationSpec("DELETE", "bench-", 1).path,
  );
});
test("small real benchmark isolates operations and prepares successful deletes in both modes", async () => {
  const config = parseArgs(
    ["--requests", "2", "--warmup", "1", "--volume", "1"],
    {},
  );
  for (const mode of ["memory", "disk"])
    for (const op of ["SET", "DELETE", "KEYS"]) {
      const result = await runOperation(config, mode, 1, 2, op);
      assert.equal(result.success, 2);
      assert.equal(result.failed, 0);
      assert.equal(result.requests, 2);
      if (op === "KEYS") {
        assert.equal(result.keysBefore, 1);
        assert.equal(result.keysAfter, 1);
      }
      if (op === "SET") {
        assert.equal(result.keysBefore, 2);
        assert.equal(result.keysAfter, 4);
      }
      if (op === "DELETE") {
        assert.equal(result.keysBefore, 3);
        assert.equal(result.keysAfter, 1);
      }
    }
});

test("CLI returns nonzero for invalid arguments and displays help without starting a server", () => {
  const { spawnSync } = require("node:child_process");
  const script = join(__dirname, "../scripts/benchmark-http.js");
  const invalid = spawnSync(process.execPath, [script, "--requests", "0"], {
    encoding: "utf8",
  });
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /requests must be between/);
  const help = spawnSync(process.execPath, [script, "--help"], {
    encoding: "utf8",
  });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /--scenario/);
});

test("HTTP timeout is reported as a network error", async () => {
  const server = createServer(() => {});
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const result = await request(
      `http://127.0.0.1:${server.address().port}`,
      { path: "/hang" },
      30,
    );
    assert.equal(result.kind, "network");
    assert.match(result.error, /timeout|abort/i);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
