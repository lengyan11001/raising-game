"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const dbSource = fs.readFileSync(path.join(root, "db.js"), "utf8");
const runnerSource = fs.readFileSync(path.join(root, "ops", "run-db-migrations.js"), "utf8");

function sourceBetween(start, end) {
  const startIndex = dbSource.indexOf(start);
  const endIndex = end ? dbSource.indexOf(end, startIndex + start.length) : -1;
  assert.ok(startIndex >= 0, `missing source anchor: ${start}`);
  assert.ok(!end || endIndex > startIndex, `missing source end: ${end}`);
  return dbSource.slice(startIndex, endIndex > startIndex ? endIndex : undefined);
}

test("generation submit queue is a required migrated schema", () => {
  assert.match(dbSource, /"2026-11-11-generation-submit-jobs-v1"/);
  assert.match(dbSource, /"app_generation_submit_jobs"/);
  assert.match(dbSource, /ensureGenerationSubmitJobsSchema/);
  assert.match(runnerSource, /version: "2026-11-11-generation-submit-jobs-v1"/);
  assert.match(runnerSource, /GENERATION_SUBMIT_JOBS_DDL/);
  assert.match(runnerSource, /app_generation_submit_jobs/);
  assert.match(runnerSource, /submit_state/);
});

test("queue claims use PostgreSQL row locking and leases", () => {
  const claimSource = sourceBetween("async function claimNextGenerationSubmitJobsInDb", "async function markGenerationSubmitJobSubmittingInDb");
  assert.match(claimSource, /FOR UPDATE SKIP LOCKED/);
  assert.match(claimSource, /lease_until/);
  assert.match(claimSource, /attempts = jobs\.attempts \+ 1/);
  assert.match(claimSource, /submit_state = 'pending'/);
});

test("only a pending lease can be taken over; an in-flight provider call becomes unknown", () => {
  const claimSource = sourceBetween("async function claimNextGenerationSubmitJobsInDb", "async function markGenerationSubmitJobSubmittingInDb");
  const unknownSource = sourceBetween("async function markGenerationSubmitJobUnknownInDb", "async function ensureSchemaInner");
  assert.match(claimSource, /status = 'processing'[\s\S]*lease_until <= NOW\(\)[\s\S]*submit_state = 'pending'/);
  assert.match(claimSource, /SET status = 'unknown'[\s\S]*submit_state = 'submitting'/);
  assert.match(unknownSource, /status = 'unknown'/);
  assert.match(unknownSource, /submit_state = 'unknown'/);
  assert.match(unknownSource, /claim_token = \$2/);
});

test("submit transitions are fenced by claim token and prior state", () => {
  const submitting = sourceBetween("async function markGenerationSubmitJobSubmittingInDb", "async function completeGenerationSubmitJobInDb");
  const complete = sourceBetween("async function completeGenerationSubmitJobInDb", "async function retryGenerationSubmitJobInDb");
  const retry = sourceBetween("async function retryGenerationSubmitJobInDb", "async function failGenerationSubmitJobInDb");
  const failed = sourceBetween("async function failGenerationSubmitJobInDb", "async function markGenerationSubmitJobUnknownInDb");
  for (const source of [submitting, complete, retry, failed]) {
    assert.match(source, /claim_token = \$2/);
  }
  assert.match(submitting, /submit_state = 'pending'/);
  assert.match(complete, /submit_state = 'submitting'/);
  assert.match(retry, /safeToRetry === true|safeToRetry\) === true/);
});

test("a task is enqueued at most once by task id", () => {
  const enqueue = sourceBetween("async function enqueueGenerationSubmitJobInDb", "async function claimNextGenerationSubmitJobsInDb");
  assert.match(enqueue, /ON CONFLICT \(task_id\) DO NOTHING/);
  assert.match(enqueue, /user_id/);
  assert.match(enqueue, /payload/);
  assert.match(enqueue, /client = null/);
  assert.match(enqueue, /client\.query\.bind\(client\)/);
});

test("atomic generation preparation shares one transaction for record, charge, usage, and queue", () => {
  const prepare = sourceBetween("async function prepareGenerationSubmitInDb", "async function markGenerationSubmitJobUnknownInDb");
  assert.match(prepare, /const client = await getPool\(\)\.connect\(\)/);
  assert.match(prepare, /client\.query\("BEGIN"\)/);
  assert.match(prepare, /SELECT \* FROM app_users WHERE id = \$1 FOR UPDATE[\s\S]*SELECT \* FROM app_credit_ledger WHERE id = \$1 FOR UPDATE/);
  assert.match(prepare, /app_generation_records/);
  assert.match(prepare, /app_credit_ledger/);
  assert.match(prepare, /app_api_subtoken_usage/);
  assert.match(prepare, /enqueueGenerationSubmitJobInDb\(taskId,[\s\S]*client,/);
  assert.match(prepare, /client\.query\("COMMIT"\)/);
  assert.match(prepare, /client\.query\("ROLLBACK"\)/);
});

test("crash recovery can reconstruct an accepted response from the durable record and job", () => {
  const resume = sourceBetween("async function getGenerationSubmitResumeStateInDb", "async function markGenerationSubmitJobUnknownInDb");
  const handlerSource = fs.readFileSync(path.join(root, "server.parts", "part-48.js"), "utf8");
  assert.match(resume, /LEFT JOIN app_generation_submit_jobs/);
  assert.match(resume, /records\.task_id = \$1/);
  assert.match(handlerSource, /getGenerationSubmitResumeStateInDb\(taskId\)/);
  assert.match(handlerSource, /resumed\?\.record && resumed\.job/);
  assert.match(handlerSource, /Idempotent-Replay/);
});

test("legacy stale cleanup cannot race a durable queued, processing, or unknown job", () => {
  const stale = sourceBetween("async function getStalePreSubmitGenerationRecordsFromDb", "async function getGenerationRecordsForScheduledMaintenanceFromDb");
  assert.match(stale, /NOT EXISTS/);
  assert.match(stale, /jobs\.task_id = app_generation_records\.task_id/);
  assert.match(stale, /jobs\.status IN \('queued', 'retry', 'processing', 'unknown'\)/);
});

test("pre-submit retries are fenced as safe, while ambiguous submissions become unknown", () => {
  const part25Source = fs.readFileSync(path.join(root, "server.parts", "part-25.js"), "utf8");
  const workerStart = part25Source.indexOf("async function processQueuedPlatformGenerationJob");
  const workerEnd = part25Source.indexOf("async function processPlatformGenerationSubmitQueue", workerStart);
  assert.ok(workerStart >= 0 && workerEnd > workerStart);
  const worker = part25Source.slice(workerStart, workerEnd);
  const provider = part25Source.slice(part25Source.indexOf("async function platformGenerationProviderTask"), part25Source.indexOf("async function persistPlatformGenerationAccepted"));
  assert.match(provider, /onDispatch/);
  assert.match(provider, /asset = await ensurePublicUrlForUserAsset|preparedAsset = await ensurePublicUrlForUserAsset/);
  assert.match(worker, /let providerDispatched = false/);
  assert.match(worker, /if \(!providerDispatched\)/);
  assert.match(worker, /safeToRetry: true/);
  assert.match(worker, /platformGenerationSubmitProviderRejected\(error\)/);
  assert.match(worker, /markGenerationSubmitJobUnknownInDb\(/);
});

test("the submit worker is independently gated and stopped before drain", () => {
  const part01 = fs.readFileSync(path.join(root, "server.parts", "part-01.js"), "utf8");
  const part25 = fs.readFileSync(path.join(root, "server.parts", "part-25.js"), "utf8");
  const part43 = fs.readFileSync(path.join(root, "server.parts", "part-43.js"), "utf8");
  assert.match(part01, /GENERATION_SUBMIT_WORKER_ENABLED/);
  assert.match(part25, /runWithSchedulerLease\("generation-submit-worker"/);
  assert.match(part25, /generationSubmissionDraining/);
  assert.match(part43, /startPlatformGenerationSubmitWorker\(\);/);
  assert.match(part43, /stopPlatformGenerationSubmitWorker\(\);\s*const startedAt/);
});

test("failed submit jobs remain scan-targets until the generation record is terminal", () => {
  const reconciliation = sourceBetween(
    "async function getGenerationSubmitJobsNeedingReconciliationInDb",
    "async function prepareGenerationSubmitInDb",
  );
  assert.match(reconciliation, /jobs\.status = 'failed'/);
  assert.match(reconciliation, /JOIN app_generation_records/);
  assert.match(reconciliation, /COALESCE\(records\.payload->>'upstreamTaskId', ''\) = ''/);
  assert.match(reconciliation, /LOWER\(COALESCE\(records\.payload->>'status', ''\)\) NOT IN/);
  assert.match(reconciliation, /preDeductedCredits/);
  assert.match(reconciliation, /billingStatus/);
  assert.match(reconciliation, /<> 'refunded'/);
});

test("worker reconciliation only finalizes records and never re-dispatches providers", () => {
  const part25 = fs.readFileSync(path.join(root, "server.parts", "part-25.js"), "utf8");
  const reconcile = part25.slice(
    part25.indexOf("async function reconcileFailedPlatformGenerationSubmitJobs"),
    part25.indexOf("async function processPlatformGenerationSubmitQueue"),
  );
  const queue = part25.slice(
    part25.indexOf("async function processGenerationSubmitQueue"),
    part25.indexOf("async function processPlatformGenerationSubmitQueue"),
  );
  assert.match(reconcile, /getGenerationSubmitJobsNeedingReconciliationInDb/);
  assert.match(reconcile, /markPlatformGenerationSubmitFailed/);
  assert.doesNotMatch(reconcile, /platformGenerationProviderTask/);
  assert.match(queue, /reconcileFailedPlatformGenerationSubmitJobs\(limit\)/);
  assert.match(queue, /before claiming more work|reconciliation/);
});

test("accepted records win over expired lease recovery and completion is idempotent", () => {
  const claim = sourceBetween("async function claimNextGenerationSubmitJobsInDb", "async function markGenerationSubmitJobSubmittingInDb");
  const complete = sourceBetween("async function completeGenerationSubmitJobInDb", "async function retryGenerationSubmitJobInDb");
  assert.match(claim, /COALESCE\(records\.payload->>'upstreamTaskId', ''\) <> ''/);
  assert.match(claim, /SET status = 'completed'[\s\S]*submit_state = 'accepted'/);
  assert.match(claim, /LOWER\(COALESCE\(records\.payload->>'status', ''\)\) IN \('failed'/);
  assert.match(complete, /alreadyCompleted/);
  assert.match(complete, /storedUpstreamTaskId/);
});

test("non-queued platform submission distinguishes definitely-not-sent failures", () => {
  const part25Source = fs.readFileSync(path.join(root, "server.parts", "part-25.js"), "utf8");
  const workerStart = part25Source.indexOf("async function runPlatformGenerationJob");
  const workerEnd = part25Source.indexOf("async function processQueuedPlatformGenerationJob", workerStart);
  assert.ok(workerStart >= 0 && workerEnd > workerStart);
  const worker = part25Source.slice(workerStart, workerEnd);
  assert.match(worker, /platformGenerationSubmitDefinitelyNotSent\(error\)/);
  assert.match(worker, /platformGenerationSubmitProviderRejected\(error\)/);
  assert.match(worker, /markPlatformGenerationSubmitUnknown\(job, error\)/);
});
