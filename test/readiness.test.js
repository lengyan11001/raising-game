"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  PHASES,
  createReadinessState,
  markReady,
  markStarting,
  markStopping,
  markFailed,
  readinessView,
  liveView,
  probeReadiness,
  readinessResponse,
} = require("../readiness");

test("readiness starts before accepting traffic", () => {
  const state = createReadinessState();
  assert.equal(state.phase, PHASES.STARTING);
  assert.deepEqual(readinessView(state), {
    ok: false,
    ready: false,
    phase: "starting",
    startedAt: state.startedAt,
    readyAt: "",
  });
});

test("readiness only reports ready after bootstrap marks it", () => {
  const state = createReadinessState();
  markReady(state, new Date("2026-11-11T00:00:00.000Z"));
  assert.deepEqual(readinessView(state), {
    ok: true,
    ready: true,
    phase: "ready",
    startedAt: state.startedAt,
    readyAt: "2026-11-11T00:00:00.000Z",
  });
});

test("readiness reports failed bootstrap and can return to starting", () => {
  const state = createReadinessState();
  const error = new Error("DATABASE_URL is required");
  error.code = "DATABASE_UNAVAILABLE";
  markFailed(state, error, new Date("2026-11-11T00:00:01.000Z"));
  assert.deepEqual(readinessView(state), {
    ok: false,
    ready: false,
    phase: "failed",
    startedAt: state.startedAt,
    readyAt: "",
    failedAt: "2026-11-11T00:00:01.000Z",
    error: {
      code: "DATABASE_UNAVAILABLE",
      message: "DATABASE_URL is required",
    },
  });
  markStarting(state);
  assert.deepEqual(readinessView(state), {
    ok: false,
    ready: false,
    phase: "starting",
    startedAt: state.startedAt,
    readyAt: "",
  });
});

test("stopping is not ready", () => {
  const state = createReadinessState();
  markReady(state);
  markStopping(state);
  assert.equal(state.phase, PHASES.STOPPING);
  assert.equal(readinessView(state).ready, false);
});


test("liveness is independent from readiness", () => {
  const state = createReadinessState();
  assert.deepEqual(liveView(state), {
    ok: true,
    phase: "starting",
    startedAt: state.startedAt,
  });
  markReady(state);
  assert.equal(liveView(state).ok, true);
});

test("readiness probe does not query the database before bootstrap is ready", async () => {
  const state = createReadinessState();
  let calls = 0;
  const result = await probeReadiness(state, {
    checkDatabase: async () => { calls += 1; return { ok: true }; },
  });
  assert.equal(calls, 0);
  assert.equal(result.ready, false);
});

test("readiness probe reports database failure without changing bootstrap phase", async () => {
  const state = createReadinessState();
  markReady(state, new Date("2026-11-11T00:00:00.000Z"));
  const result = await probeReadiness(state, {
    checkDatabase: async () => {
      const error = new Error("connection refused");
      error.code = "ECONNREFUSED";
      throw error;
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.ready, false);
  assert.equal(result.phase, "ready");
  assert.deepEqual(result.database, { ok: false, code: "ECONNREFUSED" });
});

test("readiness probe succeeds only after a successful database check", async () => {
  const state = createReadinessState();
  markReady(state);
  let timeoutArg = 0;
  const result = await probeReadiness(state, {
    timeoutMs: 900,
    checkDatabase: async ({ timeoutMs }) => { timeoutArg = timeoutMs; return { ok: true }; },
  });
  assert.equal(timeoutArg, 900);
  assert.equal(result.ok, true);
  assert.equal(result.ready, true);
});

test("readiness probe times out a wedged database check", async () => {
  const state = createReadinessState();
  markReady(state);
  const result = await probeReadiness(state, {
    timeoutMs: 30,
    checkDatabase: () => new Promise(() => {}),
  });
  assert.equal(result.ok, false);
  assert.equal(result.database.code, "DATABASE_READINESS_TIMEOUT");
});

test("readiness probe caches briefly so monitoring cannot amplify database checks", async () => {
  const state = createReadinessState();
  markReady(state);
  let calls = 0;
  let currentTime = 1000;
  const options = {
    cacheMs: 1000,
    now: () => currentTime,
    checkDatabase: async () => { calls += 1; return { ok: true }; },
  };
  const first = await probeReadiness(state, options);
  const cached = await probeReadiness(state, options);
  assert.equal(calls, 1);
  assert.equal(first.ready, true);
  assert.equal(cached.ready, true);
  currentTime += 1001;
  await probeReadiness(state, options);
  assert.equal(calls, 2);
});

test("readiness probe retries a failed database check after the cache expires", async () => {
  const state = createReadinessState();
  markReady(state);
  let calls = 0;
  let currentTime = 1000;
  const options = {
    cacheMs: 1000,
    now: () => currentTime,
    checkDatabase: async () => {
      calls += 1;
      if (calls === 1) {
        const error = new Error("connection refused");
        error.code = "ECONNREFUSED";
        throw error;
      }
      return { ok: true };
    },
  };
  assert.equal((await probeReadiness(state, options)).ready, false);
  currentTime += 1001;
  assert.equal((await probeReadiness(state, options)).ready, true);
  assert.equal(calls, 2);
});

test("readiness HTTP contract returns 503 before bootstrap and 200 after DB success", async () => {
  const state = createReadinessState();
  const starting = await readinessResponse(state, { checkDatabase: async () => ({ ok: true }) });
  assert.equal(starting.statusCode, 503);
  assert.equal(starting.body.ok, false);
  assert.equal(starting.body.phase, "starting");

  markReady(state);
  const ready = await readinessResponse(state, {
    checkDatabase: async () => ({ ok: true }),
  });
  assert.equal(ready.statusCode, 200);
  assert.equal(ready.body.ok, true);
  assert.equal(ready.body.ready, true);
});

test("readiness HTTP contract turns a database failure into 503", async () => {
  const state = createReadinessState();
  markReady(state);
  const response = await readinessResponse(state, {
    checkDatabase: async () => {
      const error = new Error("connection refused");
      error.code = "ECONNREFUSED";
      throw error;
    },
  });
  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.body.database, { ok: false, code: "ECONNREFUSED" });
});


test("startup database gate retries transient failures and then succeeds", async () => {
  const { checkDatabaseStartup } = require("../db");
  let attempts = 0;
  const waits = [];
  const result = await checkDatabaseStartup({
    attempts: 4,
    check: async () => {
      attempts += 1;
      if (attempts < 3) {
        const error = new Error("connect timeout");
        error.code = "ETIMEDOUT";
        throw error;
      }
      return { ok: true };
    },
    wait: async (ms) => { waits.push(ms); },
    baseDelayMs: 10,
    maxDelayMs: 25,
  });
  assert.deepEqual(result, { ok: true });
  assert.equal(attempts, 3);
  assert.deepEqual(waits, [10, 20]);
});

test("startup database gate fails closed after bounded retries", async () => {
  const { checkDatabaseStartup } = require("../db");
  let attempts = 0;
  await assert.rejects(
    checkDatabaseStartup({
      attempts: 3,
      check: async () => {
        attempts += 1;
        const error = new Error("database unavailable");
        error.code = "DATABASE_UNAVAILABLE";
        throw error;
      },
      wait: async () => {},
    }),
    /database unavailable/,
  );
  assert.equal(attempts, 3);
});

test("server bootstrap performs the database gate before schema checks and listen", () => {
  const source = require("../server-source").readServerSource();
  const bootstrap = source.slice(source.indexOf("async function bootstrap()"), source.indexOf("let gracefulShutdownStarted"));
  assert.match(bootstrap, /await checkDatabaseStartup\(\{ timeoutMs: 5000 \}\)/);
  assert.ok(bootstrap.indexOf("checkDatabaseStartup") < bootstrap.indexOf("assertSchemaReady"));
  assert.ok(bootstrap.indexOf("checkDatabaseStartup") < bootstrap.indexOf("server.listen"));
});

test("startup maintenance scans are serialized while steady intervals remain enabled", () => {
  const source = require("../server-source").readServerSource();
  for (const name of [
    "stale-submit-generation-records",
    "active-generation-records",
    "wallet-chain-scan",
    "media-ingest-worker",
    "generation-record-media-recovery",
    "generation-record-media-persistence",
    "generation-poster-backfill",
    "generation-result-asset-backfill",
  ]) {
    assert.match(source, new RegExp(`scheduleStartupScheduler\\("${name}"`));
  }
  assert.match(source, /function scheduleStartupScheduler\(name, task\)/);
  assert.match(source, /startupSchedulerQueue = startupSchedulerQueue\s*\.then/);
  assert.match(source, /setInterval\(\(\) => runMediaIngestWorkerSchedulerTick\(\), 15 \* 1000\)/);
  assert.match(source, /setInterval\(\(\) => runStaleSubmitGenerationRecordSchedulerTick\("timer"\), GENERATION_STALE_SUBMIT_SCAN_INTERVAL_MS\)/);
});

test("health stays a compatibility liveness response while probes have separate contracts", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const routes = fs.readFileSync(path.resolve(__dirname, "..", "server.parts", "part-42.js"), "utf8");
  const health = routes.slice(
    routes.indexOf('url.pathname === "/api/health"'),
    routes.indexOf('url.pathname === "/api/livez"'),
  );
  const live = routes.slice(
    routes.indexOf('url.pathname === "/api/livez"'),
    routes.indexOf('url.pathname === "/api/readyz"'),
  );
  const ready = routes.slice(
    routes.indexOf('url.pathname === "/api/readyz"'),
    routes.indexOf('url.pathname === "/robots.txt"'),
  );
  assert.match(health, /sendJson\(res, 200, \{ ok: true \}\)/);
  assert.doesNotMatch(health, /checkDatabase/);
  assert.match(live, /liveView\(processReadiness\)/);
  assert.doesNotMatch(live, /checkDatabase/);
  assert.match(ready, /checkDatabase: checkDatabaseReadiness/);
  assert.match(ready, /readinessResponse\(processReadiness/);
  assert.match(ready, /readiness\.statusCode, readiness\.body/);
});
