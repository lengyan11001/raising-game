#!/usr/bin/env node
"use strict";

/*
 * Real PostgreSQL concurrency/failover drill. This is intentionally a script,
 * not part of `npm test`, because it requires a disposable database URL.
 */

const assert = require("node:assert/strict");
const { Client, Pool } = require("pg");
const db = require("../db");
const { runWithSchedulerLease } = require("../lib-scheduler-lease");

const databaseUrl = String(process.env.TEST_DATABASE_URL || "").trim();
if (!databaseUrl) {
  process.stderr.write("TEST_DATABASE_URL is required for the real PostgreSQL fault-injection drill.\n");
  process.exit(2);
}

const cleanup = [];

async function waitFor(predicate, { timeoutMs = 3000, intervalMs = 25 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}

async function withClient(fn) {
  const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 3000 });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end().catch(() => {});
  }
}

async function resetWebhookDrill() {
  await withClient((client) => client.query("TRUNCATE app_webhook_deliveries"));
}

async function main() {
  process.env.DATABASE_URL = databaseUrl;
  await resetWebhookDrill();

  const concurrentClaims = await Promise.all(Array.from({ length: 8 }, (_, index) => db.claimWebhookDeliveryInDb({
    provider: "drill",
    deliveryId: "concurrent",
    eventType: "task.succeeded",
    claimToken: `token-${index}`,
  })));
  assert.equal(concurrentClaims.filter((claim) => claim.claimed).length, 1, "exactly one concurrent claim must win");

  const owner = concurrentClaims.find((claim) => claim.claimed);
  const duplicate = await db.claimWebhookDeliveryInDb({ provider: "drill", deliveryId: "concurrent" });
  assert.equal(duplicate.claimed, false, "an active claim must reject duplicates");
  assert.equal(duplicate.status, "claimed");
  const ownerLeaseMs = new Date(owner.leaseUntil).getTime() - Date.now();
  assert.ok(ownerLeaseMs > 15 * 60 * 1000,
    "default claim ownership must cover the full 15-minute media download/upload timeout");

  await db.releaseWebhookDeliveryClaimInDb({
    provider: "drill",
    deliveryId: "concurrent",
    claimToken: owner.claimToken,
    error: "temporary-task-not-ready",
  });
  const retry = await db.claimWebhookDeliveryInDb({ provider: "drill", deliveryId: "concurrent", claimToken: "retry-token" });
  assert.equal(retry.claimed, true, "a released claim must be retryable");
  assert.equal(retry.attempts, 2);

  await db.completeWebhookDeliveryClaimInDb({ provider: "drill", deliveryId: "concurrent", claimToken: retry.claimToken });
  const completedDuplicate = await db.claimWebhookDeliveryInDb({ provider: "drill", deliveryId: "concurrent", claimToken: "after-complete" });
  assert.equal(completedDuplicate.claimed, false, "completed claims must never be processed again");
  assert.equal(completedDuplicate.status, "completed");

  const expiring = await db.claimWebhookDeliveryInDb({
    provider: "drill",
    deliveryId: "expired",
    claimToken: "expired-owner",
    leaseMs: 5000,
  });
  assert.equal(expiring.claimed, true);
  await withClient((client) => client.query(
    `UPDATE app_webhook_deliveries
     SET lease_until = NOW() - INTERVAL '1 second'
     WHERE provider = 'drill' AND delivery_id = 'expired'`,
  ));
  const takeover = await db.claimWebhookDeliveryInDb({
    provider: "drill",
    deliveryId: "expired",
    claimToken: "takeover-owner",
    leaseMs: 5000,
  });
  assert.equal(takeover.claimed, true, "an expired claim must be recoverable");
  assert.equal(takeover.claimToken, "takeover-owner");

  const schedulerHolder = new Client({ connectionString: databaseUrl });
  schedulerHolder.on("error", () => {
    // The drill intentionally terminates this backend to prove advisory-lock release.
  });
  await schedulerHolder.connect();
  cleanup.push(() => schedulerHolder.end().catch(() => {}));

  let standbyRan = 0;
  const holderLock = await schedulerHolder.query(
    "SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired",
    ["raising-game-scheduler:fault-injection"],
  );
  assert.equal(holderLock.rows[0].acquired, true, "owner session must acquire the scheduler lock");

  const standbyPool = new Pool({ connectionString: databaseUrl, max: 2 });
  cleanup.push(() => standbyPool.end());
  const standbyWhileHeld = await runWithSchedulerLease("fault-injection", async () => {
    standbyRan += 1;
    return "standby";
  }, { connect: () => standbyPool.connect() });
  assert.equal(standbyWhileHeld.acquired, false, "standby must not run while owner holds the lease");
  assert.equal(standbyRan, 0);

  const holderPidResult = await schedulerHolder.query("SELECT pg_backend_pid() AS pid");
  const holderPid = Number(holderPidResult.rows[0].pid);
  const terminator = new Client({ connectionString: databaseUrl });
  await terminator.connect();
  try {
    await terminator.query("SELECT pg_terminate_backend($1)", [holderPid]);
  } finally {
    await terminator.end();
  }
  let released = false;
  const takeoverDeadline = Date.now() + 5000;
  while (Date.now() < takeoverDeadline) {
    const takeoverResult = await runWithSchedulerLease("fault-injection", async () => {
      standbyRan += 1;
      return "takeover";
    }, { connect: () => standbyPool.connect() });
    if (takeoverResult.acquired) {
      released = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(released, true, "session advisory lock must be released when the owner connection is terminated");
  assert.equal(standbyRan, 1, "standby must execute exactly once after owner connection loss");

  await resetWebhookDrill();
  process.stdout.write("POSTGRES_FAULT_INJECTION_OK webhook_claims=5 scheduler_takeover=1\n");
}

Promise.resolve().then(main).catch(async (error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
}).finally(async () => {
  for (const fn of cleanup.reverse()) await fn();
  const pool = db.getPool();
  if (pool) await pool.end().catch(() => {});
});
