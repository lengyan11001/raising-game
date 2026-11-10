const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const server = require("../server-source").readServerSource();
const script = fs.readFileSync(path.join(__dirname, "..", "scripts", "repair-stalled-generation-records.js"), "utf8");
const { isStalledGenerationRecordCandidate } = require("../server");

test("stalled repair only matches old active generation records", () => {
  const now = Date.now();
  assert.equal(isStalledGenerationRecordCandidate({
    taskId: "old-running",
    userId: "user-1",
    status: "running",
    createdAt: new Date(now - 3 * 60 * 60 * 1000).toISOString(),
  }, 2 * 60 * 60 * 1000), true);
  assert.equal(isStalledGenerationRecordCandidate({
    taskId: "recent-running",
    userId: "user-1",
    status: "running",
    createdAt: new Date(now - 10 * 60 * 1000).toISOString(),
  }, 2 * 60 * 60 * 1000), false);
  assert.equal(isStalledGenerationRecordCandidate({
    taskId: "old-completed",
    userId: "user-1",
    status: "completed",
    createdAt: new Date(now - 3 * 60 * 60 * 1000).toISOString(),
  }, 2 * 60 * 60 * 1000), false);
});

test("stalled repair is idempotent for pre-deducted refunds", () => {
  assert.match(server, /const stalledGenerationRepairLocks = new Set\(\)/);
  assert.match(server, /withStalledGenerationRepairLock\(record\.taskId/);
  assert.match(server, /failStalledGenerationRecordUnlocked\(current, "stalled-generation-repair"\)/);
  assert.match(server, /async function stalledGenerationRefundExists/);
  assert.match(server, /allowSettledRefund: true/);
  assert.match(server, /if \(billingStatus === "pre_deducted"\)/);
  assert.match(server, /previousBillingStatus: billingStatus/);
  assert.match(server, /type = ANY\(\$1::text\[\]\)[\s\S]*?meta->>'taskId' = \$2/);
  assert.match(server, /if \(!alreadyRefunded\)[\s\S]*?changeUserCredits/);
  assert.match(server, /billingStatus: "refunded"/);
});

test("failed-refund audit uses timestamp range instead of integer milliseconds", () => {
  const audit = server.slice(
    server.indexOf("async function listFailedRefundedGenerationRecordsForAudit"),
    server.indexOf("async function repairFailedRefundedGenerationRecords"),
  );
  assert.match(audit, /const sinceAt = new Date\(Date\.now\(\) - /);
  assert.match(audit, />= \$2::timestamptz/);
  assert.match(audit, /\[providers, sinceAt, safeLimit\]/);
  assert.doesNotMatch(audit, /\$2::int/);
});

test("failed-refund audit recognizes actual generation_refund ledger entries", () => {
  const audit = server.slice(
    server.indexOf("const FAILED_REFUND_AUDIT_LEDGER_TYPES"),
    server.indexOf("async function listFailedRefundedGenerationRecordsForAudit"),
  );
  assert.match(audit, /refunds: \["advanced_seedream5_image_refund", "generation_refund"\]/);
  assert.match(audit, /function failedRefundAuditRefundTypes/);
  assert.match(audit, /refundTypes\.includes\(entry\.type\)/);
  assert.match(audit, /types\.charge, \.\.\.failedRefundAuditRefundTypes\(types\)/);
});

test("failed-refund audit preserves signed ledger totals", () => {
  const audit = server.slice(
    server.indexOf("function signedCreditsAmount"),
    server.indexOf("async function listFailedRefundedGenerationRecordsForAudit"),
  );
  assert.match(audit, /function signedCreditsAmount/);
  assert.match(audit, /total: signedCreditsAmount\(row\.total \|\| 0\)/);
  assert.doesNotMatch(audit, /total: creditsAmount\(row\.total/);
});

test("stalled repair script defaults to dry-run and supports targeted apply", () => {
  assert.match(script, /apply: false/);
  assert.match(script, /--dry-run/);
  assert.match(script, /--apply/);
  assert.match(script, /--task-id/);
  assert.match(script, /DATABASE_URL is required/);
  assert.match(script, /summary\.results\.map\(\(\{ userId, refundAlreadyRecorded, \.\.\.item \}\) => item\)/);
  assert.match(script, /main\(\)\.then\(\(\) => \{[\s\S]*?process\.exit\(process\.exitCode \|\| 0\)/);
  assert.match(script, /\.catch\(\(error\) => \{[\s\S]*?process\.exit\(1\)/);
});

test("stale pre-submit scans have bounded queries, record isolation, and diagnostics", () => {
  const scan = server.slice(
    server.indexOf("let staleSubmitScanRunning = false"),
    server.indexOf("function startStaleSubmitGenerationRecordScheduler"),
  );
  assert.match(server, /GENERATION_STALE_SUBMIT_SCAN_TIMEOUT_MS/);
  assert.match(server, /GENERATION_STALE_SUBMIT_RECORD_TIMEOUT_MS/);
  assert.match(scan, /rejectAfterTimeout\(/);
  assert.match(scan, /timeoutMs: GENERATION_STALE_SUBMIT_SCAN_TIMEOUT_MS/);
  assert.match(scan, /stale-submit-generation-records-scan-start/);
  assert.match(scan, /stale-submit-generation-records-scan-end/);
  assert.match(scan, /stale-submit-generation-record-scan-failed/);
  assert.match(scan, /GENERATION_STALE_SUBMIT_RECORD_TIMEOUT_MS/);
  assert.match(scan, /Promise\.race\(\[promise, timeout\]\)/);
  assert.match(scan, /for \(const record of staleRecords\)[\s\S]*?catch \(error\)[\s\S]*?\}\s*\}\s*if \(settled\.length\)/);
  assert.match(scan, /finally \{\s*staleSubmitScanRunning = false;/);
});

test("seedream failure does not claim refunded unless the refund ledger write succeeded", () => {
  const part = fs.readFileSync(path.join(__dirname, "..", "server.parts", "part-27.js"), "utf8");
  const handler = part.slice(part.indexOf("async function runSeedream5ImageGenerationJob"), part.indexOf("function startSeedream5ImageGenerationJob"));
  assert.match(handler, /let refunded = cost <= 0/);
  assert.match(handler, /refunded = result\.refunded/);
  assert.match(handler, /billingStatus: cost <= 0 \? "free" : refunded \? "refunded" : "pre_deducted"/);
  assert.match(handler, /billingSettledAt: refunded \? new Date\(\)\.toISOString\(\) : ""/);
  assert.match(handler, /billingError: refundError \?/);
});

test("failed generation paths never claim a refund before the real ledger write succeeds", () => {
  const seedance = fs.readFileSync(path.join(__dirname, "..", "server.parts", "part-15.js"), "utf8");
  const seedanceHandler = seedance.slice(seedance.indexOf("async function handleVolcengineCreateGenerationTask("), seedance.indexOf("async function handleSeedanceVideoTask"));
  const seedanceRefund = seedanceHandler.indexOf('refundCreditsWithSubtoken(auth, auth.user.id, cost, "volcengine_generation_submit_refund"');
  const seedanceRecord = seedanceHandler.indexOf("await upsertGenerationRecord({", seedanceRefund);
  assert.ok(seedanceRefund > 0 && seedanceRecord > seedanceRefund);
  assert.match(seedanceHandler, /let refunded = cost <= 0/);
  assert.match(seedanceHandler, /billingStatus: cost <= 0 \? "free" : refunded \? "refunded" : "pre_deducted"/);
  assert.match(seedanceHandler, /billingError: refundError \? `Refund failed: \$\{refundError\.message \|\| refundError\}` : ""/);

  const videoTool = fs.readFileSync(path.join(__dirname, "..", "server.parts", "part-22.js"), "utf8");
  const refundVideoTool = videoTool.slice(videoTool.indexOf("async function refundVideoToolTask("), videoTool.indexOf("function closestWan27ImageRatioForAsset("));
  assert.match(refundVideoTool, /let refunded = cost <= 0/);
  assert.match(refundVideoTool, /refundCreditsWithSubtoken\(record, record\.userId, cost, "video_tool_refund"/);
  assert.match(refundVideoTool, /billingStatus: cost <= 0 \? \(freeClaimId \? "free_released" : "free"\) : refunded \? "refunded" : "pre_deducted"/);
  assert.match(refundVideoTool, /billingSettledAt: refunded \? new Date\(\)\.toISOString\(\) : ""/);
  assert.match(refundVideoTool, /billingError: refundError \?/);
});
