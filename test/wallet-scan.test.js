"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const server = fs.readFileSync(path.resolve(__dirname, "..", "server.js"), "utf8");

test("BNB wallet scanning bypasses deprecated keyless indexers and advances an RPC cursor", () => {
  assert.match(server, /WALLET_EVM_SCAN_CHUNK_SIZE[\s\S]*?\|\| 1000/);
  assert.match(server, /https:\/\/bsc\.meowrpc\.com/);
  assert.match(server, /if \(!config\.apiKey\) return await scanEvmUsdtTransfersByRpc\(chain, address, options\)/);
  assert.match(server, /walletEvmScanCursors\.set\(cursorKey/);
  assert.match(server, /scanWalletTransfers\(group\.chain, group\.address, \{ orders: group\.orders \}\)/);
});
