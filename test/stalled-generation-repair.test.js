const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
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
