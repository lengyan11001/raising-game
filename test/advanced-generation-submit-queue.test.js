"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const dbSource = fs.readFileSync(path.join(root, "db.js"), "utf8");
const part25Source = fs.readFileSync(path.join(root, "server.parts", "part-25.js"), "utf8");
const part26Source = fs.readFileSync(path.join(root, "server.parts", "part-26.js"), "utf8");
const part29Source = fs.readFileSync(path.join(root, "server.parts", "part-29.js"), "utf8");
const part48Source = fs.readFileSync(path.join(root, "server.parts", "part-48.js"), "utf8");

function sourceBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = end ? source.indexOf(end, startIndex + start.length) : -1;
  assert.ok(startIndex >= 0, `missing source anchor: ${start}`);
  assert.ok(!end || endIndex > startIndex, `missing source end: ${end}`);
  return source.slice(startIndex, endIndex > startIndex ? endIndex : undefined);
}

test("advanced generation has a dedicated durable submit kind", () => {
  assert.match(part29Source, /advancedGenerationSubmitQueueEnabled/);
  assert.match(part29Source, /prepareGenerationSubmitInDb\(/);
  assert.match(part29Source, /kind:\s*ADVANCED_GENERATION_SUBMIT_KIND/);
  assert.match(part26Source, /processQueuedAdvancedGenerationJob/);
  assert.match(part26Source, /ADVANCED_GENERATION_SUBMIT_KIND/);
});

test("advanced queue preparation is atomic with billing and the generation record", () => {
  const prepare = sourceBetween(
    dbSource,
    "async function prepareGenerationSubmitInDb",
    "async function getGenerationSubmitResumeStateInDb",
  );
  assert.match(prepare, /app_generation_records/);
  assert.match(prepare, /app_credit_ledger/);
  assert.match(prepare, /app_api_subtoken_usage/);
  assert.match(prepare, /enqueueGenerationSubmitJobInDb\(taskId,/);
  assert.match(prepare, /client\.query\("COMMIT"\)/);
  assert.match(prepare, /client\.query\("ROLLBACK"\)/);
});

test("advanced worker marks submitting before one provider dispatch", () => {
  const processSource = sourceBetween(
    part26Source,
    "async function processQueuedAdvancedGenerationJob",
    "async function reconcileFailedAdvancedGenerationSubmitJobs",
  );
  assert.match(processSource, /markGenerationSubmitJobSubmittingInDb\(\{/);
  assert.match(processSource, /runAdvancedGenerationJob\(jobInput, submission, \{/);
  assert.doesNotMatch(processSource, /retryGenerationSubmitJobInDb[\s\S]*safeToRetry:\s*true/);
});

test("advanced worker never retries an ambiguous provider submission", () => {
  const processSource = sourceBetween(
    part26Source,
    "async function processQueuedAdvancedGenerationJob",
    "async function reconcileFailedAdvancedGenerationSubmitJobs",
  );
  assert.match(processSource, /markGenerationSubmitJobUnknownInDb\(\{/);
  assert.match(processSource, /unknown-after-dispatch/);
  assert.doesNotMatch(processSource, /setTimeout\([^)]*runner\(/);
});

test("advanced accepted records close the queue idempotently", () => {
  const processSource = sourceBetween(
    part26Source,
    "async function processQueuedAdvancedGenerationJob",
    "async function reconcileFailedAdvancedGenerationSubmitJobs",
  );
  assert.match(processSource, /upstreamTaskId/);
  assert.match(processSource, /completeGenerationSubmitJobInDb\(\{/);
});

test("advanced reconciliation refunds only definitely pre-dispatch failures", () => {
  const reconcileSource = sourceBetween(
    part26Source,
    "async function reconcileFailedAdvancedGenerationSubmitJobs",
    "async function runAdvancedGenerationJob",
  );
  assert.match(reconcileSource, /refundBeforeDispatch:\s*true/);
  assert.doesNotMatch(reconcileSource, /refundBeforeDispatch:\s*false/);
  assert.match(reconcileSource, /getGenerationSubmitJobsNeedingReconciliationInDb/);
});

test("worker dispatches by durable job kind rather than assuming platform templates", () => {
  const queueSource = sourceBetween(
    part25Source,
    "async function processGenerationSubmitQueue",
    "async function processPlatformGenerationSubmitQueue",
  );
  assert.match(queueSource, /processQueuedPlatformGenerationJob/);
  assert.match(queueSource, /processQueuedAdvancedGenerationJob/);
  assert.match(queueSource, /ADVANCED_GENERATION_SUBMIT_KIND/);
});

test("advanced entrypoint keeps the legacy path unless the queue flag is on", () => {
  assert.match(part29Source, /if\s*\(advancedGenerationSubmitQueueEnabled\(\)\)/);
  assert.match(part29Source, /startAdvancedGenerationJob\(queueJobInput\)/);
  assert.match(part48Source, /advancedGenerationSubmitQueueEnabled/);
  assert.match(part48Source, /prepareGenerationSubmitInDb\(/);
});

test("advanced queue records stay unsettled until the provider accepts the task", () => {
  const entry = sourceBetween(
    part29Source,
    "const recordInput = {",
    "const queueJobInput = {",
  );
  assert.match(entry, /billingStatus: cost > 0 \? \(advancedGenerationSubmitQueueEnabled\(\) \|\| pricing\.adaptiveDuration \? "pre_deducted" : "settled"\) : "free"/);
  assert.match(entry, /billingSettledAt: cost > 0 && !advancedGenerationSubmitQueueEnabled\(\) && !pricing\.adaptiveDuration/);

  const runner = sourceBetween(
    part26Source,
    "async function runAdvancedGenerationJob",
    "function byteplusRequestId",
  );
  assert.match(runner, /billingStatus: cost > 0 \? \(pricing\?\.adaptiveDuration \? "pre_deducted" : "settled"\) : "free"/);
  assert.match(runner, /billingSettledAt: cost > 0 && !pricing\?\.adaptiveDuration \? submittedAt : ""/);
  assert.match(runner, /const upstreamTaskId = task\?\.taskId \|\| ""/);
  assert.ok(runner.indexOf("const upstreamTaskId") < runner.indexOf("const fixedBilling"), "provider task id must be checked before settlement");
});

test("Seedance 2.5 queue uses the same pre-dispatch refund and unknown outcome rules", () => {
  const runner = sourceBetween(
    part48Source,
    "async function runSeedance25GenerationJob",
    "function startSeedance25GenerationJob",
  );
  assert.match(runner, /let providerDispatchStarted = false/);
  assert.match(runner, /providerDispatchStarted = true;\s*submitted = await submitArkTaskAfterAssetsReady/);
  assert.match(runner, /providerDispatchStarted = true;\s*submitted = USE_GATEWAY_UPSTREAM/);
  assert.match(runner, /await settleAdvancedGenerationJobFailure\(\{/);
  assert.match(runner, /refundBeforeDispatch: !providerDispatchStarted/);
  assert.doesNotMatch(runner, /status: "failed",\s*awaitingUpstreamTask: false,[\s\S]*?seedance25-failed/);

  const entry = sourceBetween(
    part48Source,
    "const recordInput = {",
    "const queueJobInput = {",
  );
  assert.match(entry, /advancedGenerationSubmitQueueEnabled\(\) \|\| direct \? "pre_deducted" : "settled"/);
  assert.match(entry, /billingSettledAt: cost > 0 && !advancedGenerationSubmitQueueEnabled\(\) && !direct/);
});
