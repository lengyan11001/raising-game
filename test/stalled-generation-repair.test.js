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
  assert.match(server, /async function stalledGenerationRefundExists/);
  assert.match(server, /billingStatus !== "pre_deducted"/);
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
  assert.match(script, /summary\.results\.map\(\(\{ userId, \.\.\.item \}\) => item\)/);
});
