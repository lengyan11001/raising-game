"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  leaseKeyFor,
  normalizedSchedulerName,
  runWithSchedulerLease,
} = require("../lib-scheduler-lease");

function fakePool() {
  const held = new Set();
  const events = [];
  const pool = {
    events,
    held,
    async connect() {
      const clientHeld = new Set();
      return {
        async query(sql, params = []) {
          events.push({ sql, params: [...params] });
          if (sql.includes("pg_try_advisory_lock")) {
            const key = params[0];
            if (held.has(key)) return { rows: [{ acquired: false }] };
            held.add(key);
            clientHeld.add(key);
            return { rows: [{ acquired: true }] };
          }
          if (sql.includes("pg_advisory_unlock")) {
            const key = params[0];
            if (!clientHeld.has(key)) return { rows: [{ pg_advisory_unlock: false }] };
            clientHeld.delete(key);
            held.delete(key);
            return { rows: [{ pg_advisory_unlock: true }] };
          }
          throw new Error(`Unexpected fake SQL: ${sql}`);
        },
        release() {
          for (const key of clientHeld) held.delete(key);
          clientHeld.clear();
          events.push({ release: true });
        },
      };
    },
  };
  return pool;
}

test("scheduler lease names are bounded and namespaced", () => {
  assert.equal(normalizedSchedulerName(" wallet-scan "), "wallet-scan");
  assert.throws(() => normalizedSchedulerName(""), /required/);
  assert.match(leaseKeyFor("wallet-scan"), /^raising-game-scheduler:wallet-scan$/);
});

test("two scheduler instances cannot run one job concurrently", async () => {
  const pool = fakePool();
  let releaseFirst;
  const firstMayFinish = new Promise((resolve) => { releaseFirst = resolve; });
  let firstStarted = false;
  let secondRan = false;

  const first = runWithSchedulerLease("media-ingest", async () => {
    firstStarted = true;
    await firstMayFinish;
    return "first";
  }, { connect: () => pool.connect() });
  while (!firstStarted) await new Promise((resolve) => setImmediate(resolve));

  const second = await runWithSchedulerLease("media-ingest", async () => {
    secondRan = true;
    return "second";
  }, { connect: () => pool.connect() });

  assert.equal(second.acquired, false);
  assert.equal(second.skipped, true);
  assert.equal(secondRan, false);
  releaseFirst();
  const firstResult = await first;
  assert.equal(firstResult.value, "first");
  assert.equal(pool.held.size, 0);
});

test("release allows the next tick or standby instance to take ownership", async () => {
  const pool = fakePool();
  const first = await runWithSchedulerLease("chat-live", async () => 1, { connect: () => pool.connect() });
  const second = await runWithSchedulerLease("chat-live", async () => 2, { connect: () => pool.connect() });
  assert.equal(first.acquired, true);
  assert.equal(second.acquired, true);
  assert.deepEqual([first.value, second.value], [1, 2]);
});

test("job failure and connection release still release the lease", async () => {
  const pool = fakePool();
  const error = new Error("job failed");
  await assert.rejects(
    runWithSchedulerLease("wallet-scan", async () => { throw error; }, { connect: () => pool.connect() }),
    /job failed/,
  );
  assert.equal(pool.held.size, 0);
  const next = await runWithSchedulerLease("wallet-scan", async () => "recovered", { connect: () => pool.connect() });
  assert.equal(next.value, "recovered");
  assert.equal(pool.events.filter((event) => event.release).length, 2);
});

test("direct failure handler can report lease errors without running the job", async () => {
  const errors = [];
  const skipped = [];
  let ran = false;
  const result = await runWithSchedulerLease("telegram", async () => { ran = true; }, {
    connect: async () => { throw new Error("database unavailable"); },
    onError: (error, name, key) => errors.push({ error, name, key }),
    onSkipped: (name) => skipped.push(name),
  });
  assert.equal(result.acquired, false);
  assert.equal(result.error.message, "database unavailable");
  assert.equal(ran, false);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].name, "telegram");
  assert.equal(skipped.length, 0);
});
test("failed unlock destroys the lock connection instead of pooling a poisoned session", async () => {
  let releasedWith = null;
  const result = await runWithSchedulerLease("unlock-check", async () => "ok", {
    connect: async () => ({
      async query(sql, params = []) {
        if (sql.includes("pg_try_advisory_lock")) return { rows: [{ acquired: true }] };
        if (sql.includes("pg_advisory_unlock")) throw new Error("connection lost during unlock");
        throw new Error(`Unexpected SQL: ${sql}`);
      },
      release(destroy) { releasedWith = destroy; },
    }),
  });
  assert.equal(result.value, "ok");
  assert.equal(releasedWith, true);
});
