const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { normalizeErrorClass, parseArgs } = require("../scripts/audit-generation-failures");

const scriptPath = path.join(__dirname, "..", "scripts", "audit-generation-failures.js");

test("generation failure audit normalizes operational error classes", () => {
  assert.equal(normalizeErrorClass("Request timed out after 30000ms"), "network-or-timeout");
  assert.equal(normalizeErrorClass("401 Unauthorized"), "auth-or-credentials");
  assert.equal(normalizeErrorClass("content policy rejected"), "moderation-or-policy");
  assert.equal(normalizeErrorClass("provider 503 Service Unavailable"), "upstream-or-server");
  assert.equal(normalizeErrorClass(""), "no-error-message");
});

test("generation failure audit is read-only and separates refund anomalies", () => {
  const source = fs.readFileSync(scriptPath, "utf8");
  assert.match(source, /mode: "generation-failure-read-only-audit"/);
  assert.match(source, /SET TRANSACTION READ ONLY/);
  assert.match(source, /"pre_deducted", "refund_failed"/);
  assert.match(source, /refundAnomalies/);
  assert.doesNotMatch(source, /DELETE\s+FROM|UPDATE\s+app_generation_records|INSERT\s+INTO/);
  assert.doesNotMatch(source, /userId|username|email|prompt/);
});

test("generation failure audit does not permit unbounded lookback or samples", () => {
  const args = parseArgs(["--since-days", "999999", "--limit", "999999"]);
  assert.equal(args.sinceDays, 999999);
  assert.equal(args.limit, 999999);
  const source = fs.readFileSync(scriptPath, "utf8");
  assert.match(source, /Math\.max\(1, Math\.min\(3650/);
  assert.match(source, /Math\.max\(1, Math\.min\(200/);
});
