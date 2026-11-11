#!/usr/bin/env node
"use strict";

/*
 * Real PostgreSQL concurrency/failover drill. This is intentionally a script,
 * not part of `npm test`, because it requires a disposable database URL.
 */

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
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

async function resetRequestIdempotencyDrill() {
  await withClient((client) => client.query("TRUNCATE app_request_idempotency"));
}

async function resetGenerationSubmitDrill() {
  await withClient(async (client) => {
    await client.query("TRUNCATE app_generation_submit_jobs");
    await client.query("DELETE FROM app_credit_ledger WHERE id LIKE 'drill-submit-%'");
    await client.query("DELETE FROM app_generation_records WHERE task_id LIKE 'drill-submit-%'");
  });
}

async function generationSubmitQueueDrill() {
  await resetGenerationSubmitDrill();
  const enqueued = await Promise.all(Array.from({ length: 8 }, () => db.enqueueGenerationSubmitJobInDb("drill-submit-queue-1", {
    userId: "drill-user",
    kind: "drill",
    payload: { marker: "once" },
  })));
  assert.equal(enqueued.filter((item) => item.inserted).length, 1, "task id must be enqueued exactly once");
  const claims = await Promise.all(Array.from({ length: 8 }, (_, index) => db.claimNextGenerationSubmitJobsInDb({
    limit: 1,
    claimToken: `queue-claim-${index}`,
  })));
  const winners = claims.flatMap((claim) => claim.jobs);
  assert.equal(winners.length, 1, "exactly one worker must claim the task");
  const owner = winners[0];
  const oldToken = owner.claimToken;
  const marked = await db.markGenerationSubmitJobSubmittingInDb({ taskId: owner.taskId, claimToken: oldToken });
  assert.equal(marked.marked, true, "the owner must atomically enter submitting state");
  assert.equal(marked.job.submitState, "submitting");
  await withClient((client) => client.query(
    `UPDATE app_generation_submit_jobs SET lease_until = NOW() - INTERVAL '1 second' WHERE task_id = $1`,
    [owner.taskId],
  ));
  const recovery = await db.claimNextGenerationSubmitJobsInDb({ limit: 1, claimToken: "queue-takeover" });
  assert.equal(recovery.jobs.length, 0, "submitting work must never be blindly re-claimed");
  assert.equal(recovery.unknownJobs.length, 1, "expired in-flight work must become unknown");
  assert.equal(recovery.unknownJobs[0].status, "unknown");
  const staleComplete = await db.completeGenerationSubmitJobInDb({
    taskId: owner.taskId,
    claimToken: oldToken,
    upstreamTaskId: "upstream-stale",
  });
  assert.equal(staleComplete.completed, false, "old worker token must not complete an unknown job");
  const row = await withClient((client) => client.query(`SELECT status, submit_state FROM app_generation_submit_jobs WHERE task_id = $1`, [owner.taskId]));
  assert.deepEqual(row.rows[0], { status: "unknown", submit_state: "unknown" });

  const retryTask = "drill-submit-retry-1";
  await db.enqueueGenerationSubmitJobInDb(retryTask, { userId: "drill-user", kind: "drill", payload: {} });
  const retryOwner = (await db.claimNextGenerationSubmitJobsInDb({ limit: 1, claimToken: "retry-owner" })).jobs.find((job) => job.taskId === retryTask);
  assert.ok(retryOwner, "retry task must be claimable");
  const retryMarked = await db.markGenerationSubmitJobSubmittingInDb({ taskId: retryTask, claimToken: retryOwner.claimToken });
  assert.equal(retryMarked.marked, true, "retry task must enter submitting before the unsafe check");
  const unsafe = await db.retryGenerationSubmitJobInDb({ taskId: retryTask, claimToken: retryOwner.claimToken, error: "network timeout", safeToRetry: false });
  assert.equal(unsafe.retried, false, "in-flight work must not be retried unless the caller proves it is safe");
  const safe = await db.retryGenerationSubmitJobInDb({ taskId: retryTask, claimToken: retryOwner.claimToken, error: "pre-submit failure", safeToRetry: true });
  assert.equal(safe.retried, true, "an explicitly safe pre-submit failure may retry");
  await withClient((client) => client.query(
    `UPDATE app_generation_submit_jobs
     SET available_at = NOW() - INTERVAL '1 second'
     WHERE task_id = $1`,
    [retryTask],
  ));
  const retried = await db.claimNextGenerationSubmitJobsInDb({ limit: 1, claimToken: "retry-owner-2" });
  assert.equal(retried.jobs[0]?.taskId, retryTask, "retryable work must be claimable again");
  await db.failGenerationSubmitJobInDb({ taskId: retryTask, claimToken: retried.jobs[0].claimToken, error: "terminal drill" });
  const terminal = await withClient((client) => client.query(`SELECT status, submit_state FROM app_generation_submit_jobs WHERE task_id = $1`, [retryTask]));
  assert.deepEqual(terminal.rows[0], { status: "failed", submit_state: "failed" });
  await resetGenerationSubmitDrill();
}

async function insertDrillUser(client, userId, credits = 10) {
  await client.query("DELETE FROM app_users WHERE id = $1", [userId]);
  await client.query(
    `INSERT INTO app_users(id, username, credits, payload, created_at, updated_at)
     VALUES ($1, $1, $2::numeric, '{}'::jsonb, NOW(), NOW())`,
    [userId, credits],
  );
}

async function prepareDrillSubmission({
  taskId,
  userId,
  chargeId,
  tokenId = "",
  usageKey = "",
  credits = 10,
  preDeductedCredits = 3,
}) {
  await withClient(async (client) => {
    await client.query("DELETE FROM app_credit_ledger WHERE id = $1", [chargeId]);
    await client.query("DELETE FROM app_generation_submit_jobs WHERE task_id = $1", [taskId]);
    await client.query("DELETE FROM app_generation_records WHERE task_id = $1", [taskId]);
    if (tokenId) {
      await client.query("DELETE FROM app_api_subtoken_usage WHERE token_id = $1", [tokenId]);
      await client.query("DELETE FROM app_api_subtokens WHERE id = $1", [tokenId]);
    }
    await insertDrillUser(client, userId, credits);
  });
  if (tokenId) {
    await db.createApiSubtokenInDb({
      id: tokenId,
      token: `${tokenId}-value`,
      parentUserId: userId,
      name: "fault drill",
      quotaType: "amount",
      quotaLimit: 100,
      usedAmount: 0,
      usedCount: 0,
    });
  }
  return await db.prepareGenerationSubmitInDb({
    record: {
      taskId,
      userId,
      status: "submitting",
      provider: "apiz",
      source: "platform-template",
      preDeductedCredits,
      pricingEstimate: { source: "drill" },
      createdAt: new Date().toISOString(),
    },
    charge: {
      id: chargeId,
      userId,
      delta: -preDeductedCredits,
      type: "generation_pre_deduct",
      meta: { taskId },
    },
    subtoken: tokenId ? {
      tokenId,
      eventKey: usageKey,
      parentUserId: userId,
      deltaAmount: preDeductedCredits,
      deltaCount: 0,
      meta: { taskId, type: "generation_pre_deduct" },
    } : null,
    job: {
      userId,
      kind: "drill",
      payload: {
        taskId,
        provider: "apiz",
        preDeductedCredits,
        pricingEstimate: { source: "drill" },
      },
    },
  });
}

async function claimDrillSubmission(taskId, claimToken) {
  const result = await db.claimNextGenerationSubmitJobsInDb({ limit: 20, claimToken });
  const job = result.jobs.find((item) => item.taskId === taskId);
  assert.ok(job, `drill task must be claimable: ${taskId}`);
  return job;
}

async function cleanupDrillTask({ taskId, userId, chargeId, refundId = "", tokenId = "", usageKey = "" }) {
  await withClient(async (client) => {
    if (tokenId) {
      await client.query("DELETE FROM app_api_subtoken_usage WHERE token_id = $1", [tokenId]);
      await client.query("DELETE FROM app_api_subtokens WHERE id = $1", [tokenId]);
    }
    if (refundId) await client.query("DELETE FROM app_credit_ledger WHERE id = $1", [refundId]);
    await client.query("DELETE FROM app_credit_ledger WHERE id = $1", [chargeId]);
    await client.query("DELETE FROM app_generation_submit_jobs WHERE task_id = $1", [taskId]);
    await client.query("DELETE FROM app_generation_records WHERE task_id = $1", [taskId]);
    await client.query("DELETE FROM app_users WHERE id = $1", [userId]);
  });
}

function assertDisposableDrillDatabase() {
  let database = "";
  try {
    database = decodeURIComponent(new URL(databaseUrl).pathname.replace(/^\/+/, ""));
  } catch {
    database = "";
  }
  if (!/^raising_game_fault_drill_[0-9]{14}$/.test(database)) {
    throw new Error(`Refusing to run PostgreSQL fault injection outside a disposable raising_game_fault_drill_YYYYMMDDHHMMSS database; got ${database || "<missing>"}`);
  }
  process.env.DB_SCHEMA_MIGRATION_MODE = "bootstrap";
  return database;
}

async function main() {
  const database = assertDisposableDrillDatabase();
  process.env.DATABASE_URL = databaseUrl;
  process.stdout.write(`POSTGRES_FAULT_INJECTION_DATABASE ${database}\n`);
  await db.ensureSchema();
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
  await resetRequestIdempotencyDrill();

  const idempotencyClaims = await Promise.all(Array.from({ length: 8 }, (_, index) => db.claimRequestIdempotencyInDb({
    userId: "user-drill",
    action: "advanced_generate",
    idempotencyKey: "submit-once",
    payloadHash: "sha256:same-payload",
    claimToken: `generation-token-${index}`,
    taskId: `cgt-drill-${index}`,
  })));
  assert.equal(idempotencyClaims.filter((claim) => claim.claimed).length, 1, "exactly one concurrent generation claim must win");
  const requestOwner = idempotencyClaims.find((claim) => claim.claimed);
  const activeDuplicate = await db.claimRequestIdempotencyInDb({
    userId: "user-drill",
    action: "advanced_generate",
    idempotencyKey: "submit-once",
    payloadHash: "sha256:same-payload",
  });
  assert.equal(activeDuplicate.claimed, false, "an active request claim must reject a duplicate");
  assert.equal(activeDuplicate.status, "claimed");
  assert.equal(activeDuplicate.taskId, requestOwner.taskId);

  const payloadMismatch = await db.claimRequestIdempotencyInDb({
    userId: "user-drill",
    action: "advanced_generate",
    idempotencyKey: "submit-once",
    payloadHash: "sha256:different-payload",
  });
  assert.equal(payloadMismatch.conflict, true, "same key with a different payload must conflict");

  await db.releaseRequestIdempotencyClaimInDb({
    userId: "user-drill",
    action: "advanced_generate",
    idempotencyKey: "submit-once",
    claimToken: requestOwner.claimToken,
    error: "temporary failure",
  });
  const retryClaim = await db.claimRequestIdempotencyInDb({
    userId: "user-drill",
    action: "advanced_generate",
    idempotencyKey: "submit-once",
    payloadHash: "sha256:same-payload",
    claimToken: "retry-generation-owner",
  });
  assert.equal(retryClaim.claimed, true, "a released idempotency claim must be retryable");
  assert.equal(retryClaim.attempts, 2);
  assert.equal(retryClaim.taskId, requestOwner.taskId, "retry must preserve the original task id");
  await db.completeRequestIdempotencyInDb({
    userId: "user-drill",
    action: "advanced_generate",
    idempotencyKey: "submit-once",
    claimToken: retryClaim.claimToken,
    taskId: retryClaim.taskId,
    resultPayload: { ok: true, taskId: retryClaim.taskId },
  });
  const completedReplay = await db.claimRequestIdempotencyInDb({
    userId: "user-drill",
    action: "advanced_generate",
    idempotencyKey: "submit-once",
    payloadHash: "sha256:same-payload",
  });
  assert.equal(completedReplay.claimed, false, "a completed request must not execute again");
  assert.equal(completedReplay.status, "completed");
  assert.equal(completedReplay.taskId, requestOwner.taskId);
  assert.deepEqual(completedReplay.resultPayload, { ok: true, taskId: requestOwner.taskId });

  await db.claimRequestIdempotencyInDb({
    userId: "user-drill",
    action: "advanced_generate",
    idempotencyKey: "expired-generation",
    payloadHash: "sha256:expired",
    claimToken: "expired-owner",
    taskId: "cgt-expired",
    leaseMs: 5000,
  });
  await withClient((client) => client.query(
    `UPDATE app_request_idempotency
     SET lease_until = NOW() - INTERVAL '1 second'
     WHERE user_id = 'user-drill' AND action = 'advanced_generate'
       AND idempotency_key = 'expired-generation'`,
  ));
  const requestTakeover = await db.claimRequestIdempotencyInDb({
    userId: "user-drill",
    action: "advanced_generate",
    idempotencyKey: "expired-generation",
    payloadHash: "sha256:expired",
    claimToken: "takeover-generation-owner",
  });
  assert.equal(requestTakeover.claimed, true, "an expired idempotency claim must be recoverable");
  assert.equal(requestTakeover.taskId, "cgt-expired");

  await resetRequestIdempotencyDrill();
  await requestIdempotencyHttpDrill();
  await resetRequestIdempotencyDrill();
  await generationSubmitQueueDrill();
  await generationSubmitCrashWindowDrill();
  await generationSubmitAtomicDrill();
  await generationSubmitRefundDrill();
  await generationSubmitAmbiguousDrill();
  await generationSubmitReconciliationDrill();
  process.stdout.write("POSTGRES_FAULT_INJECTION_OK webhook_claims=5 scheduler_takeover=1 request_idempotency=1 http_idempotency=1 generation_submit_queue=1 generation_submit_crash_window=1 generation_submit_atomic=1 generation_submit_refund=1 generation_submit_ambiguous=1 generation_submit_reconciliation=1\n");
}

async function generationSubmitCrashWindowDrill() {
  const taskId = "drill-submit-crash-window-1";
  const userId = "drill-submit-crash-window-user";
  const chargeId = "drill-submit-crash-window-charge";
  try {
    await prepareDrillSubmission({ taskId, userId, chargeId });
    const owner = await claimDrillSubmission(taskId, "crash-window-owner");
    const marked = await db.markGenerationSubmitJobSubmittingInDb({ taskId, claimToken: owner.claimToken });
    assert.equal(marked.marked, true, "crash-window owner must enter submitting state");

    await withClient((client) => client.query(
      `UPDATE app_generation_records
       SET payload = payload || jsonb_build_object(
         'status', 'succeeded',
         'upstreamTaskId', 'upstream-crash-window-1'
       ),
       updated_at = NOW()
       WHERE task_id = $1`,
      [taskId],
    ));
    await withClient((client) => client.query(
      `UPDATE app_generation_submit_jobs
       SET lease_until = NOW() - INTERVAL '1 second'
       WHERE task_id = $1`,
      [taskId],
    ));

    const recovery = await db.claimNextGenerationSubmitJobsInDb({
      limit: 1,
      claimToken: "crash-window-recovery-owner",
    });
    assert.equal(recovery.jobs.length, 0, "accepted durable record must not be resubmitted");
    assert.equal(recovery.unknownJobs.length, 0, "accepted durable record must be recovered before lease-expiry marking");
    const recovered = recovery.recoveredAcceptedJobs.find((job) => job.taskId === taskId);
    assert.ok(recovered, "accepted durable record must close the job during claim recovery");
    assert.equal(recovered.status, "completed");
    assert.equal(recovered.submitState, "accepted");
    assert.equal(recovered.payload.upstreamTaskId, "upstream-crash-window-1");

    const staleCompletion = await db.completeGenerationSubmitJobInDb({
      taskId,
      claimToken: owner.claimToken,
      upstreamTaskId: "upstream-crash-window-1",
    });
    assert.equal(staleCompletion.completed, true, "an accepted job may replay completion idempotently");
    assert.equal(staleCompletion.alreadyCompleted, true, "stale token must receive alreadyCompleted, not perform a new transition");
    const replayCompletion = await db.completeGenerationSubmitJobInDb({
      taskId,
      claimToken: "crash-window-recovery-owner",
      upstreamTaskId: "upstream-crash-window-1",
    });
    assert.equal(replayCompletion.completed, true, "completion replay must remain idempotent");
    assert.equal(replayCompletion.alreadyCompleted, true);
  } finally {
    await cleanupDrillTask({ taskId, userId, chargeId });
  }
}

async function generationSubmitRefundDrill() {
  const taskId = "drill-submit-refund-1";
  const userId = "drill-submit-refund-user";
  const chargeId = "drill-submit-refund-charge";
  const tokenId = "drill-submit-refund-token";
  const chargeUsageKey = "charge:generation_pre_deduct:drill-submit-refund-1";
  const refundUsageKey = "adjust:generation_refund:drill-submit-refund-1";
  const refundId = `ledger-${crypto.createHash("sha256").update(`generation_refund:${taskId}`).digest("hex").slice(0, 24)}`;
  try {
    await prepareDrillSubmission({
      taskId,
      userId,
      chargeId,
      tokenId,
      usageKey: chargeUsageKey,
    });
    const owner = await claimDrillSubmission(taskId, "refund-owner");
    await db.markGenerationSubmitJobSubmittingInDb({ taskId, claimToken: owner.claimToken });
    const failed = await db.failGenerationSubmitJobInDb({
      taskId,
      claimToken: owner.claimToken,
      error: "provider rejected before acceptance",
    });
    assert.equal(failed.failed, true, "provider rejection must close the claimed job");
    await withClient((client) => client.query(
      `UPDATE app_generation_records
       SET payload = payload || jsonb_build_object('status', 'failed')
       WHERE task_id = $1`,
      [taskId],
    ));

    const pending = await db.getGenerationSubmitJobsNeedingReconciliationInDb({ limit: 20 });
    assert.equal(pending.some((item) => item.job.taskId === taskId), true,
      "failed attempt with a charged record must remain reconcilable");

    const refundArgs = {
      id: refundId,
      userId,
      delta: 3,
      type: "generation_refund",
      meta: { taskId, provider: "apiz", reason: "drill" },
      requireTaskCharge: true,
      refundTypes: ["generation_refund"],
    };
    const concurrentRefunds = await Promise.all(Array.from({ length: 8 }, () => db.applyCreditDeltaInDb(refundArgs)));
    assert.equal(concurrentRefunds.filter((item) => item?.inserted).length, 1,
      "concurrent refunds must insert exactly one ledger row");
    const concurrentUsage = await Promise.all(Array.from({ length: 8 }, () => db.recordApiSubtokenUsageInDb({
      tokenId,
      parentUserId: userId,
      eventKey: refundUsageKey,
      deltaAmount: -3,
      deltaCount: 0,
      meta: { taskId, type: "generation_refund" },
    })));
    assert.equal(concurrentUsage.filter((item) => item?.inserted).length, 1,
      "concurrent subtoken refunds must update usage exactly once");
    await withClient(async (client) => {
      const user = await client.query("SELECT credits FROM app_users WHERE id = $1", [userId]);
      const ledger = await client.query("SELECT count(*)::int AS count FROM app_credit_ledger WHERE meta->>'taskId' = $1 AND type = 'generation_refund'", [taskId]);
      const usage = await client.query("SELECT count(*)::int AS count FROM app_api_subtoken_usage WHERE token_id = $1 AND event_key = $2", [tokenId, refundUsageKey]);
      const token = await client.query("SELECT used_amount FROM app_api_subtokens WHERE id = $1", [tokenId]);
      assert.equal(Number(user.rows[0].credits), 10, "refund must restore the pre-deducted balance exactly once");
      assert.equal(ledger.rows[0].count, 1, "refund ledger must be unique per task");
      assert.equal(usage.rows[0].count, 1, "subtoken refund usage must be unique");
      assert.equal(Number(token.rows[0].used_amount), 0, "subtoken refund must restore used amount");
    });

    await withClient(async (client) => {
      const records = await client.query("SELECT payload FROM app_generation_records WHERE task_id = $1", [taskId]);
      await client.query(
        "UPDATE app_generation_records SET payload = $2::jsonb WHERE task_id = $1",
        [taskId, JSON.stringify({ ...records.rows[0].payload, billingStatus: "refunded", finalCredits: 0 })],
      );
    });
    const afterRefund = await db.getGenerationSubmitJobsNeedingReconciliationInDb({ limit: 20 });
    assert.equal(afterRefund.some((item) => item.job.taskId === taskId), false,
      "refunded record must leave the reconciliation scan");
  } finally {
    await cleanupDrillTask({ taskId, userId, chargeId, refundId, tokenId, usageKey: chargeUsageKey });
  }
}

async function generationSubmitAmbiguousDrill() {
  const taskId = "drill-submit-ambiguous-1";
  const userId = "drill-submit-ambiguous-user";
  const chargeId = "drill-submit-ambiguous-charge";
  try {
    await prepareDrillSubmission({ taskId, userId, chargeId });
    const owner = await claimDrillSubmission(taskId, "ambiguous-owner");
    const marked = await db.markGenerationSubmitJobSubmittingInDb({ taskId, claimToken: owner.claimToken });
    assert.equal(marked.marked, true, "ambiguous owner must enter submitting before dispatch");
    const unknown = await db.markGenerationSubmitJobUnknownInDb({
      taskId,
      claimToken: owner.claimToken,
      error: "network reset after provider request",
    });
    assert.equal(unknown.markedUnknown, true, "ambiguous dispatch must become unknown");

    const reclaim = await db.claimNextGenerationSubmitJobsInDb({ limit: 20, claimToken: "ambiguous-reclaim" });
    assert.equal(reclaim.jobs.some((item) => item.taskId === taskId), false,
      "unknown work must never be reclaimed and resent");
    assert.equal(reclaim.unknownJobs.some((item) => item.taskId === taskId), false,
      "an explicit unknown transition must not be reported as a new lease expiry");
    const lateCompletion = await db.completeGenerationSubmitJobInDb({
      taskId,
      claimToken: owner.claimToken,
      upstreamTaskId: "late-upstream-id",
    });
    assert.equal(lateCompletion.completed, false, "an old lease token must not complete an unknown job");

    await withClient(async (client) => {
      const job = await client.query("SELECT status, submit_state, claim_token FROM app_generation_submit_jobs WHERE task_id = $1", [taskId]);
      assert.deepEqual(job.rows[0], { status: "unknown", submit_state: "unknown", claim_token: "" });
      const ledger = await client.query("SELECT count(*)::int AS count FROM app_credit_ledger WHERE meta->>'taskId' = $1 AND type = 'generation_refund'", [taskId]);
      const user = await client.query("SELECT credits FROM app_users WHERE id = $1", [userId]);
      assert.equal(ledger.rows[0].count, 0, "ambiguous dispatch must not auto-refund");
      assert.equal(Number(user.rows[0].credits), 7, "ambiguous dispatch must keep the pre-deduction pending reconciliation");
    });
  } finally {
    await cleanupDrillTask({ taskId, userId, chargeId });
  }
}

async function generationSubmitReconciliationDrill() {
  const taskId = "drill-submit-reconcile-1";
  const userId = "drill-submit-reconcile-user";
  const chargeId = "drill-submit-reconcile-charge";
  await withClient(async (client) => {
    await client.query("DELETE FROM app_credit_ledger WHERE id = $1", [chargeId]);
    await client.query("DELETE FROM app_generation_submit_jobs WHERE task_id = $1", [taskId]);
    await client.query("DELETE FROM app_generation_records WHERE task_id = $1", [taskId]);
    await client.query("DELETE FROM app_users WHERE id = $1", [userId]);
    await client.query(
      `INSERT INTO app_users(id, username, credits, payload, created_at, updated_at)
       VALUES ($1, $1, 10, '{}'::jsonb, NOW(), NOW())`,
      [userId],
    );
  });
  await db.prepareGenerationSubmitInDb({
    record: {
      taskId,
      userId,
      status: "submitting",
      provider: "apiz",
      source: "platform-template",
      preDeductedCredits: 3,
      pricingEstimate: { source: "drill" },
      createdAt: new Date().toISOString(),
    },
    charge: { id: chargeId, userId, delta: -3, type: "generation_pre_deduct", meta: { taskId } },
    job: { userId, kind: "drill", payload: { taskId, provider: "apiz", preDeductedCredits: 3, pricingEstimate: { source: "drill" } } },
  });
  const owner = (await db.claimNextGenerationSubmitJobsInDb({ limit: 1, claimToken: "reconcile-owner" })).jobs.find((job) => job.taskId === taskId);
  assert.ok(owner, "reconcile task must be claimable");
  await db.markGenerationSubmitJobSubmittingInDb({ taskId, claimToken: owner.claimToken });
  await db.failGenerationSubmitJobInDb({ taskId, claimToken: owner.claimToken, error: "provider rejected" });
  await withClient((client) => client.query(
    `UPDATE app_generation_records SET payload = payload || '{"status":"submitting"}'::jsonb WHERE task_id = $1`,
    [taskId],
  ));
  const firstScan = await db.getGenerationSubmitJobsNeedingReconciliationInDb({ limit: 10 });
  assert.equal(firstScan.some((item) => item.job.taskId === taskId), true, "failed job with non-terminal record must remain a scan target");
  const refundId = `ledger-${crypto.createHash("sha256").update(`generation_refund:${taskId}`).digest("hex").slice(0, 24)}`;
  await withClient(async (client) => {
    const records = await client.query(`SELECT payload FROM app_generation_records WHERE task_id = $1`, [taskId]);
    await client.query(
      `UPDATE app_generation_records SET payload = $2::jsonb WHERE task_id = $1`,
      [taskId, JSON.stringify({ ...records.rows[0].payload, status: "failed", billingStatus: "refunded", finalCredits: 0 })],
    );
  });
  const afterRefund = await db.getGenerationSubmitJobsNeedingReconciliationInDb({ limit: 10 });
  assert.equal(afterRefund.some((item) => item.job.taskId === taskId), false, "terminal refunded record must leave reconciliation scan");
  await withClient(async (client) => {
    const user = await client.query("SELECT credits FROM app_users WHERE id = $1", [userId]);
    assert.equal(Number(user.rows[0].credits), 7, "drill preparation must debit once");
    await client.query("DELETE FROM app_credit_ledger WHERE id = $1", [chargeId]);
    await client.query("DELETE FROM app_credit_ledger WHERE id = $1", [refundId]);
    await client.query("DELETE FROM app_generation_submit_jobs WHERE task_id = $1", [taskId]);
    await client.query("DELETE FROM app_generation_records WHERE task_id = $1", [taskId]);
    await client.query("DELETE FROM app_users WHERE id = $1", [userId]);
  });
}

async function generationSubmitAtomicDrill() {
  const taskId = "drill-submit-atomic-1";
  const userId = "drill-submit-atomic-user";
  const chargeId = "drill-submit-atomic-charge";
  const tokenId = "drill-submit-atomic-token";
  const usageKey = "charge:generation_pre_deduct:drill-submit-atomic-1";
  await withClient(async (client) => {
    await client.query("DELETE FROM app_credit_ledger WHERE id = $1", [chargeId]);
    await client.query("DELETE FROM app_generation_submit_jobs WHERE task_id = $1", [taskId]);
    await client.query("DELETE FROM app_generation_records WHERE task_id = $1", [taskId]);
    await client.query("DELETE FROM app_api_subtokens WHERE id = $1", [tokenId]);
    await client.query("DELETE FROM app_users WHERE id = $1", [userId]);
    await client.query(
      `INSERT INTO app_users(id, username, credits, payload, created_at, updated_at)
       VALUES ($1, $1, 10, '{}'::jsonb, NOW(), NOW())`,
      [userId],
    );
  });
  await db.createApiSubtokenInDb({
    id: tokenId,
    token: "drill-submit-atomic-token-value",
    parentUserId: userId,
    name: "atomic drill",
    quotaType: "amount",
    quotaLimit: 100,
    usedAmount: 0,
    usedCount: 0,
  });
  const prepareArgs = {
    record: { taskId, userId, status: "submitting", createdAt: new Date().toISOString() },
    charge: { id: chargeId, userId, delta: -3, type: "generation_pre_deduct", meta: { taskId } },
    subtoken: {
      tokenId,
      eventKey: usageKey,
      parentUserId: userId,
      deltaAmount: 3,
      deltaCount: 0,
      meta: { taskId, type: "generation_pre_deduct" },
    },
    job: { userId, kind: "drill", payload: { taskId } },
  };
  const concurrent = await Promise.all(Array.from({ length: 8 }, () => db.prepareGenerationSubmitInDb(prepareArgs)));
  assert.equal(concurrent.filter((item) => item.jobInserted).length, 1,
    "concurrent preparation must enqueue exactly one job");
  await withClient(async (client) => {
    const user = await client.query("SELECT credits FROM app_users WHERE id = $1", [userId]);
    const ledger = await client.query("SELECT count(*)::int AS count FROM app_credit_ledger WHERE id = $1", [chargeId]);
    const record = await client.query("SELECT count(*)::int AS count FROM app_generation_records WHERE task_id = $1", [taskId]);
    const job = await client.query("SELECT count(*)::int AS count FROM app_generation_submit_jobs WHERE task_id = $1", [taskId]);
    const usage = await client.query("SELECT count(*)::int AS count FROM app_api_subtoken_usage WHERE token_id = $1 AND event_key = $2", [tokenId, usageKey]);
    const token = await client.query("SELECT used_amount FROM app_api_subtokens WHERE id = $1", [tokenId]);
    assert.equal(Number(user.rows[0].credits), 7, "concurrent charge must be committed exactly once");
    assert.equal(ledger.rows[0].count, 1, "concurrent ledger insertion must happen exactly once");
    assert.equal(record.rows[0].count, 1, "concurrent record insertion must happen exactly once");
    assert.equal(job.rows[0].count, 1, "concurrent queue insertion must happen exactly once");
    assert.equal(usage.rows[0].count, 1, "subtoken usage must be recorded exactly once");
    assert.equal(Number(token.rows[0].used_amount), 3, "subtoken usage must be charged exactly once");
  });
  const rollbackTaskId = "drill-submit-atomic-rollback";
  await assert.rejects(
    db.prepareGenerationSubmitInDb({
      record: { taskId: rollbackTaskId, userId, status: "submitting" },
      charge: { id: `${chargeId}-rollback`, userId, delta: -100, type: "generation_pre_deduct", meta: { taskId: rollbackTaskId } },
      job: { userId, kind: "drill", payload: { taskId: rollbackTaskId } },
    }),
    (error) => error.code === "INSUFFICIENT_CREDITS",
  );
  await withClient(async (client) => {
    const user = await client.query("SELECT credits FROM app_users WHERE id = $1", [userId]);
    const record = await client.query("SELECT count(*)::int AS count FROM app_generation_records WHERE task_id = $1", [rollbackTaskId]);
    const job = await client.query("SELECT count(*)::int AS count FROM app_generation_submit_jobs WHERE task_id = $1", [rollbackTaskId]);
    const ledger = await client.query("SELECT count(*)::int AS count FROM app_credit_ledger WHERE id = $1", [`${chargeId}-rollback`]);
    assert.equal(Number(user.rows[0].credits), 7, "failed charge must roll back the whole preparation");
    assert.equal(record.rows[0].count, 0, "failed preparation must not leave a generation record");
    assert.equal(job.rows[0].count, 0, "failed preparation must not leave a queue job");
    assert.equal(ledger.rows[0].count, 0, "failed preparation must not leave a ledger row");
    await client.query("DELETE FROM app_credit_ledger WHERE id = $1", [chargeId]);
    await client.query("DELETE FROM app_generation_submit_jobs WHERE task_id = $1", [taskId]);
    await client.query("DELETE FROM app_generation_records WHERE task_id = $1", [taskId]);
    await client.query("DELETE FROM app_users WHERE id = $1", [userId]);
  });
}

Promise.resolve().then(main).catch(async (error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
}).finally(async () => {
  for (const fn of cleanup.reverse()) await fn();
  const pool = db.getPool();
  if (pool) await pool.end().catch(() => {});
});

async function requestIdempotencyHttpDrill() {
  const { executeRequestIdempotently } = require("../lib-request-idempotency");
  const base = {
    req: { headers: { "Idempotency-Key": "http-submit-once" } },
    auth: { user: { id: "user-http-drill" } },
    action: "platform_generate",
    payload: { templateId: "tpl-drill", prompt: "same", params: { duration: 5 } },
    taskIdPrefix: "cgt",
    claim: db.claimRequestIdempotencyInDb,
    complete: db.completeRequestIdempotencyInDb,
    release: db.releaseRequestIdempotencyClaimInDb,
  };
  let executeCalls = 0;
  const execute = async ({ idempotency }) => {
    executeCalls += 1;
    await new Promise((resolve) => setTimeout(resolve, 20));
    return { statusCode: 200, payload: { ok: true, taskId: idempotency.taskId, executeCalls } };
  };
  const results = await Promise.all(Array.from({ length: 8 }, () => executeRequestIdempotently({
    ...base,
    claimToken: () => `http-claim-${Math.random()}`,
    execute,
  })));
  assert.equal(executeCalls, 1, "HTTP idempotency helper must execute exactly one provider submit");
  assert.equal(results.filter((result) => result.statusCode === 200).length, 1);
  assert.equal(results.filter((result) => result.payload.code === "REQUEST_IN_PROGRESS").length, 7);
  const taskId = results.find((result) => result.statusCode === 200).payload.taskId;

  const replay = await executeRequestIdempotently({
    ...base,
    claimToken: () => "http-replay-token",
    execute: async () => {
      executeCalls += 1;
      return { statusCode: 200, payload: { ok: true, taskId: "wrong" } };
    },
  });
  assert.equal(replay.statusCode, 200);
  assert.equal(replay.headers["Idempotent-Replay"], "true");
  assert.equal(replay.payload.taskId, taskId);
  assert.equal(executeCalls, 1, "completed requests must replay without executing");

  const conflict = await executeRequestIdempotently({
    ...base,
    payload: { templateId: "tpl-other", prompt: "different" },
    claimToken: () => "http-conflict-token",
    execute,
  });
  assert.equal(conflict.statusCode, 409);
  assert.equal(conflict.payload.code, "IDEMPOTENCY_KEY_REUSED");
  assert.equal(executeCalls, 1, "payload conflicts must not execute");
}
