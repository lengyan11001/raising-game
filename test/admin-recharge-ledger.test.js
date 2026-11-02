const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const db = fs.readFileSync(path.resolve(__dirname, "..", "db.js"), "utf8");
const server = fs.readFileSync(path.resolve(__dirname, "..", "server.js"), "utf8");

test("admin recharge history uses a bounded database page", () => {
  assert.match(db, /async function getAdminRechargeLedgerPageFromDb\(/);
  assert.match(db, /LIMIT \$5 OFFSET LEAST\(\$6/);
  assert.match(db, /SELECT \* FROM app_credit_ledger ORDER BY created_at DESC LIMIT 1000/);
  assert.match(server, /getAdminRechargeLedgerPageFromDb\(\{/);
});

test("admin recharge endpoint requests one paged database slice", () => {
  assert.match(server, /getAdminRechargeLedgerPageFromDb\(\{[\s\S]*queryText: query/);
});

test("admin list endpoints and user history use database pagination", () => {
  assert.match(db, /async function getAdminUsersPageFromDb\(/);
  assert.match(db, /async function getAdminWalletOrdersPageFromDb\(/);
  assert.match(db, /async function getAdminUserAssetsPageFromDb\(/);
  assert.match(db, /async function getAdminUserCharactersPageFromDb\(/);
  assert.match(db, /async function getAdminSupportMessagesPageFromDb\(/);
  assert.match(db, /async function getUserGenerationRecordsPageFromDb\(/);
  assert.match(server, /requireAdmin\(req, res, \{ loadDb: false \}\)/);
  assert.match(server, /getUserGenerationRecordsPageFromDb\(\{ userId: auth\.user\.id/);
});
