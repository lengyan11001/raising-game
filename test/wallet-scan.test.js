"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { readServerSource } = require("../server-source");

const server = readServerSource();

test("BNB wallet scanning bypasses deprecated keyless indexers and advances an RPC cursor", () => {
  assert.match(server, /WALLET_EVM_SCAN_CHUNK_SIZE[\s\S]*?\|\| 1000/);
  assert.match(server, /https:\/\/bsc\.meowrpc\.com/);
  assert.match(server, /if \(!config\.apiKey\) return await scanEvmUsdtTransfersByRpc\(chain, address, options\)/);
  assert.match(server, /walletEvmScanCursors\.set\(cursorKey/);
  assert.match(server, /scanWalletTransfers\(group\.chain, group\.address, \{ orders: group\.orders \}\)/);
});

test("wallet scanner loads only pending orders and transaction keys, never the full app snapshot", () => {
  const db = fs.readFileSync(path.resolve(__dirname, "..", "db.js"), "utf8");
  const part12 = fs.readFileSync(path.resolve(__dirname, "..", "server.parts", "part-12.js"), "utf8");
  assert.match(db, /async function getWalletChainScanDataFromDb/);
  const helper = db.slice(db.indexOf("async function getWalletChainScanDataFromDb"), db.indexOf("async function getWalletOrderByIdInDb"));
  assert.doesNotMatch(helper, /app_user_assets|app_generation_records|app_user_characters/);
  assert.match(helper, /o\.status = \$1/);
  assert.match(helper, /LIMIT \$2/);
  assert.match(helper, /\$\{timeClauseForPaid\}/);
  assert.match(server, /WALLET_CHAIN_SCAN_ORDER_TTL_HOURS[\s\S]*?\|\| 1\) \|\| 1\)/);
  assert.match(part12, /getWalletChainScanDataFromDb\(\{ minCreatedAt, status: "pending", limit \}\)/);
  const scan = part12.slice(part12.indexOf("async function scanAndSettleWalletOrders"), part12.indexOf("let walletScanRunning"));
  assert.doesNotMatch(scan, /\breadDb\s*\(/);
});
