const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const db = fs.readFileSync(path.resolve(__dirname, "..", "db.js"), "utf8");
const server = fs.readFileSync(path.resolve(__dirname, "..", "server.js"), "utf8");

test("admin recharge history is not truncated to the newest 1000 ledger rows", () => {
  assert.match(db, /SELECT \* FROM app_credit_ledger ORDER BY created_at DESC/);
  assert.doesNotMatch(db, /SELECT \* FROM app_credit_ledger ORDER BY created_at DESC LIMIT 1000/);
  assert.match(server, /function adminRechargeLedgerRecords\(db = \{\}\)/);
});
