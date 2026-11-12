"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const test = require("node:test");

const {
  createBaselineMetrics,
  normalizeRouteName,
  statusClass,
} = require("../baseline-metrics");
const {
  createOperationalStatsReader,
  deltaCounters,
  normalizePoolStats,
  normalizeStatsRow,
} = require("../db-operational-stats");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function request(port, pathname, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path: pathname, headers }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on("error", reject);
    req.end();
  });
}

test("baseline metrics are inert unless explicitly enabled", () => {
  const metrics = createBaselineMetrics({ enabled: false });
  metrics.recordCache("public_config", true);
  metrics.recordEvent("rate_limit_write");
  metrics.recordRequest({ route: "/api/health", statusCode: 200, durationMs: 9 });
  const snapshot = metrics.snapshot();
  assert.equal(snapshot.enabled, false);
  assert.equal(snapshot.requests, 0);
  assert.deepEqual(snapshot.cache, {});
  assert.deepEqual(snapshot.events, {});
  assert.deepEqual(snapshot.routes, {});
});

test("baseline metrics aggregate latency, byte, status, in-flight, cache, and event counters", () => {
  let now = 1_000;
  let mono = 0;
  const metrics = createBaselineMetrics({ enabled: true, reservoirSize: 4, now: () => now, monoNow: () => mono });
  const end = metrics.beginRequest("/api/config/public");
  const second = metrics.beginRequest("/api/config/public");
  assert.equal(metrics.snapshot().inFlight, 2);
  assert.equal(metrics.snapshot().peakInFlight, 2);
  end();
  end();
  second();
  metrics.recordRequest({ route: "/api/config/public", statusCode: 200, durationMs: 10, bytesInBytes: 12, bytesOutBytes: 100 });
  metrics.recordRequest({ route: "/api/config/public", statusCode: 503, durationMs: 30, bytesInBytes: 3, bytesOutBytes: 50 });
  metrics.recordRequest({ route: "/api/readyz", statusCode: 404, durationMs: 20 });
  metrics.recordRequest({ route: "/", statusCode: 302, durationMs: 1 });
  metrics.recordCache("public_config", true);
  metrics.recordCache("public_config", true);
  metrics.recordCache("public_config", false);
  metrics.recordEvent("rate_limit_write", 3);
  metrics.recordTiming("user_assets:db", 12.5);
  metrics.recordTiming("user_assets:db", 7.5);
  now += 65_000;
  const snapshot = metrics.snapshot();
  assert.equal(snapshot.requests, 4);
  assert.equal(snapshot.inFlight, 0);
  assert.equal(snapshot.peakInFlight, 2);
  assert.equal(snapshot.bytesIn, 15);
  assert.equal(snapshot.bytesOut, 150);
  assert.equal(snapshot.uptimeSeconds, 65);
  assert.equal(snapshot.statuses["2xx"], 1);
  assert.equal(snapshot.statuses["3xx"], 1);
  assert.equal(snapshot.statuses["4xx"], 1);
  assert.equal(snapshot.statuses["5xx"], 1);
  assert.equal(snapshot.latency.p50Ms, 10);
  assert.equal(snapshot.latency.p95Ms, 30);
  assert.equal(snapshot.latency.maxMs, 30);
  assert.equal(snapshot.latency.avgMs, 15.25);
  assert.equal(snapshot.routes["/api/config/public"].latency.maxMs, 30);
  assert.equal(snapshot.cache.public_config.hits, 2);
  assert.equal(snapshot.cache.public_config.misses, 1);
  assert.equal(snapshot.cache.public_config.hitRate, 0.6667);
  assert.equal(snapshot.events.rate_limit_write, 3);
  assert.deepEqual(snapshot.phases["user_assets:db"], { count: 2, avgMs: 10, maxMs: 12.5 });
  assert.equal(snapshot.routes["/api/config/public"].requests, 2);
  assert.equal(snapshot.routes["/api/config/public"].latency.avgMs, 20);
  assert.equal(snapshot.routes["/api/config/public"].statuses["5xx"], 1);
});

test("route cardinality is bounded and route names are truncated", () => {
  const metrics = createBaselineMetrics({ enabled: true, maxRoutes: 2 });
  metrics.recordRequest({ route: "/one", statusCode: 200, durationMs: 1 });
  metrics.recordRequest({ route: "/two", statusCode: 200, durationMs: 1 });
  metrics.recordRequest({ route: "/three", statusCode: 200, durationMs: 1 });
  const snapshot = metrics.snapshot();
  assert.equal(Object.keys(snapshot.routes).length, 2);
  assert.equal(snapshot.requests, 3);
  assert.equal(snapshot.droppedRoutes, 1);
  assert.equal(normalizeRouteName("x".repeat(200)).length, 160);
  assert.equal(statusClass(599), "5xx");
  assert.equal(statusClass(418), "4xx");
});

test("PostgreSQL stats normalize cumulative counters without becoming a data store", () => {
  const stats = normalizeStatsRow({
    datname: "raising_game",
    stats_reset: "2026-11-11T00:00:00.000Z",
    xact_commit: "100",
    xact_rollback: "2",
    blks_read: "25",
    blks_hit: "75",
    tup_returned: "30",
    tup_fetched: "70",
    tup_inserted: "5",
    tup_updated: "6",
    tup_deleted: "1",
    deadlocks: "1",
    temp_files: "2",
    temp_bytes: "4096",
    sessions: "8",
    sessions_abandoned: "1",
    sessions_fatal: "0",
    sessions_killed: "1",
  });
  assert.equal(stats.database, "raising_game");
  assert.equal(stats.transactions.total, 102);
  assert.equal(stats.blocks.hitRatio, 0.75);
  assert.equal(stats.tuples.fetchedRatio, 0.7);
  assert.deepEqual(stats.temp, { files: 2, bytes: 4096 });
  assert.deepEqual(normalizePoolStats({ totalCount: 5, idleCount: 2, waitingCount: 1, max: 20 }), {
    total: 5,
    idle: 2,
    waiting: 1,
    max: 20,
  });
});

test("operational stats derive rate deltas only from successive reads", () => {
  const previous = {
    capturedAtMs: 1_000,
    transactions: { total: 100, rollback: 1 },
    blocks: { read: 10, hit: 90 },
    tuples: { returned: 20, fetched: 80 },
    deadlocks: 1,
  };
  const current = {
    capturedAtMs: 3_000,
    transactions: { total: 140, rollback: 2 },
    blocks: { read: 20, hit: 180 },
    tuples: { returned: 30, fetched: 170 },
    deadlocks: 2,
  };
  assert.deepEqual(deltaCounters(previous, current), {
    elapsedSeconds: 2,
    transactionsPerSecond: 20,
    blocksPerSecond: 50,
    tuplesPerSecond: 50,
    rollbackDelta: 1,
    deadlockDelta: 1,
  });
  assert.equal(deltaCounters(null, current), null);
});

test("operational stats reader performs one read-only current-database query", async () => {
  const queries = [];
  let now = 10;
  const reader = createOperationalStatsReader({
    now: () => now,
    query: async (sql) => {
      queries.push(sql);
      now += 7;
      return { rows: [{ datname: "raising_game", xact_commit: "1", xact_rollback: "0" }] };
    },
    getPool: () => ({ totalCount: 2, idleCount: 1, waitingCount: 0, max: 20 }),
    dbEnabled: () => true,
  });
  const stats = await reader.read();
  assert.equal(queries.length, 1);
  assert.match(queries[0], /FROM pg_stat_database/);
  assert.match(queries[0], /WHERE datname = current_database\(\)/);
  assert.doesNotMatch(queries[0], /\b(INSERT|UPDATE|DELETE|ALTER|DROP)\b/i);
  assert.equal(stats.pool.total, 2);
  assert.equal(stats.delta, null);
  assert.equal(stats.databaseEnabled, true);
});

test("diagnostics endpoint is disabled by default, admin-only, and never Redis-dependent", () => {
  const source = read("server.parts/part-42.js");
  const block = source.slice(
    source.indexOf('url.pathname === "/api/admin/operational-baseline"'),
    source.indexOf('url.pathname === "/robots.txt"'),
  );
  assert.match(block, /if \(!BASELINE_METRICS_ENABLED\)/);
  assert.match(block, /requireAdmin\(req, res, \{ loadDb: false \}\)/);
  assert.match(block, /private, no-store/);
  assert.match(block, /redis: \{/);
  assert.match(block, /configured: false/);
  assert.match(block, /workloads: \{/);
  assert.match(block, /idempotency: false/);
  assert.doesNotMatch(block, /redis\.connect|createClient|REDIS_URL/);
});

test("request entrypoint uses bounded route labels and finalizes once", () => {
  const source = read("server.parts/part-43.js");
  assert.match(source, /if \(BASELINE_METRICS_ENABLED\) \{/);
  assert.match(source, /baselineRouteLabel\(routePath\)/);
  assert.match(source, /baselineMetrics\.beginRequest\(route\)/);
  assert.match(source, /res\.once\("finish", finalize\)/);
  assert.match(source, /res\.once\("close", finalize\)/);
  assert.match(source, /if \(recorded\) return/);
  assert.doesNotMatch(source, /req\.url[^\n]*route/);
});

test("diagnostics HTTP surface is default-off and admin-protected when enabled", async () => {
  const previous = { ...process.env };
  try {
    for (const [enabled, expectedStatus] of [[false, 404], [true, 401]]) {
      process.env.BASELINE_METRICS_ENABLED = enabled ? "1" : "0";
      process.env.BASELINE_METRICS_MAX_ROUTES = "4";
      process.env.BASELINE_METRICS_RESERVOIR_SIZE = "8";
      delete require.cache[require.resolve("../server.js")];
      delete require.cache[require.resolve("../server-source")];
      const serverModule = require("../server.js");
      const server = serverModule.__httpServer;
      assert.ok(server && typeof server.listen === "function", "server should export its HTTP server for integration tests");
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
      });
      const { port } = server.address();
      try {
        const response = await request(port, "/api/admin/operational-baseline");
        assert.equal(response.status, expectedStatus);
        if (enabled) {
          assert.match(response.body, /LOGIN_REQUIRED/);
          assert.match(response.headers["cache-control"] || "", /no-store/);
        } else {
          assert.match(response.body, /DIAGNOSTICS_DISABLED/);
        }
      } finally {
        await new Promise((resolve) => server.close(resolve));
        serverModule.__httpServer = null;
      }
    }
  } finally {
    for (const key of Object.keys(process.env)) {
      if (!(key in previous)) delete process.env[key];
    }
    Object.assign(process.env, previous);
    delete require.cache[require.resolve("../server.js")];
    delete require.cache[require.resolve("../server-source")];
  }
});

test("user asset diagnostics record bounded phase timings without raw identifiers", () => {
  const source = read("server.parts/part-37.js");
  const block = source.slice(
    source.indexOf("async function handleListUserAssets"),
    source.indexOf("async function handleResolveUserAssets"),
  );
  assert.match(block, /recordTiming\("user_assets:auth"/);
  assert.match(block, /recordTiming\("user_assets:db"/);
  assert.match(block, /recordTiming\("user_assets:serialize"/);
  assert.doesNotMatch(block, /console\.(?:log|warn|error)/);
  assert.doesNotMatch(block, /recordTiming\([^\n]*(?:auth\.user\.id|q\b)/);
});

test("rate-limit writes and generation polling are counted without changing their paths", () => {
  const risk = read("server.parts/part-46.js");
  const generation = read("server.parts/part-41.js");
  assert.match(risk, /incrementRateLimitInDb\(key, \{ windowMs \}\);[\s\S]{0,160}try \{ baselineMetrics\.recordEvent\("rate_limit_write"\); \} catch \{\}/);
  assert.match(generation, /if \(pollRequested\) \{[\s\S]{0,100}baselineMetrics\.recordEvent\("generation_list_poll"\)/);
});
