"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const dbSource = fs.readFileSync(path.join(root, "db.js"), "utf8");
const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
const live = fs.readFileSync(path.join(root, "live.js"), "utf8");
const liveHtml = fs.readFileSync(path.join(root, "live.html"), "utf8");
const admin = fs.readFileSync(path.join(root, "admin.js"), "utf8");
const adminHtml = fs.readFileSync(path.join(root, "admin.html"), "utf8");

function numeric(value) {
  return Number(value || 0);
}

function creatorEarningRow(params = []) {
  return {
    id: String(params[0]),
    creator_user_id: String(params[1]),
    viewer_user_id: String(params[2]),
    character_id: String(params[3]),
    session_id: String(params[4]),
    type: String(params[5]),
    source_credits: String(params[6]),
    earning_rate: String(params[7]),
    delta_credits: String(params[8]),
    balance_after: String(params[9]),
    meta: JSON.parse(params[10] || "{}"),
    payload: JSON.parse(params[11] || "{}"),
    created_at: params[12],
  };
}

function withdrawalRow(overrides = {}) {
  return {
    id: "withdrawal-1",
    creator_user_id: "creator-1",
    amount_credits: "1",
    network: "USDT-TRC20",
    withdrawal_address: "T123456789012345678901234567890",
    status: "processing",
    tx_hash: "",
    note: "",
    rejection_reason: "",
    reviewed_by_user_id: "",
    payload: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    processed_at: null,
    ...overrides,
  };
}

function loadCreatorDb({ character = null, existingEarning = null, balance = 0, withdrawal = null } = {}) {
  const calls = [];
  const ledgerRows = [];
  const state = {
    balance,
    withdrawal: withdrawal ? { ...withdrawal } : null,
  };
  const client = {
    async query(sql, params = []) {
      const text = String(sql).replace(/\s+/g, " ").trim();
      calls.push({ sql: text, params });
      if (["BEGIN", "COMMIT", "ROLLBACK"].includes(text)) return { rows: [] };
      if (text.startsWith("SELECT pg_advisory_xact_lock")) return { rows: [{}] };
      if (text.includes("FROM app_chat_live_characters WHERE id = $1")) {
        return { rows: character ? [{ payload: character }] : [] };
      }
      if (text.includes("FROM app_creator_earning_ledger WHERE type = 'video_view_earning' AND session_id = $1")) {
        return { rows: existingEarning ? [existingEarning] : [] };
      }
      if (text.includes("SELECT COALESCE(SUM(delta_credits), 0)::numeric AS balance")) {
        return { rows: [{ balance: String(state.balance) }] };
      }
      if (text.startsWith("INSERT INTO app_creator_earning_ledger")) {
        const row = creatorEarningRow(params);
        state.balance = numeric(row.balance_after);
        ledgerRows.push({
          type: row.type,
          creatorUserId: row.creator_user_id,
          viewerUserId: row.viewer_user_id,
          sourceCredits: numeric(row.source_credits),
          deltaCredits: numeric(row.delta_credits),
          balanceAfter: numeric(row.balance_after),
        });
        return { rows: [row] };
      }
      if (text.startsWith("INSERT INTO app_creator_withdrawals")) {
        state.withdrawal = withdrawalRow({
          id: String(params[0]),
          creator_user_id: String(params[1]),
          amount_credits: String(params[2]),
          network: String(params[3]),
          withdrawal_address: String(params[4]),
          payload: JSON.parse(params[5] || "{}"),
          created_at: params[6],
          updated_at: params[6],
        });
        return { rows: [state.withdrawal] };
      }
      if (text.startsWith("SELECT * FROM app_creator_withdrawals WHERE id = $1 FOR UPDATE")) {
        return { rows: state.withdrawal ? [state.withdrawal] : [] };
      }
      if (text.startsWith("UPDATE app_creator_withdrawals SET status = $2")) {
        state.withdrawal = {
          ...state.withdrawal,
          status: String(params[1]),
          tx_hash: String(params[2]),
          note: String(params[3]),
          rejection_reason: String(params[4]),
          reviewed_by_user_id: String(params[5]),
          processed_at: params[6],
          updated_at: params[6],
        };
        return { rows: [state.withdrawal] };
      }
      throw new Error(`Unexpected SQL in creator test: ${text}`);
    },
    release() {},
  };

  class MockPool {
    on() {}
    async connect() {
      return client;
    }
  }

  const sandbox = {
    Buffer,
    URL,
    URLSearchParams,
    console,
    process: { ...process, env: { ...process.env, DATABASE_URL: "postgres://creator-test" } },
    require(name) {
      if (name === "pg") return { Pool: MockPool };
      return require(name);
    },
    setTimeout,
    clearTimeout,
    structuredClone,
    module: { exports: {} },
    exports: {},
  };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(
    `${dbSource}\nensureSchema = async () => {};\nmodule.exports.__creatorIncomeTest = { recordCreatorVideoViewEarningInDb, createCreatorWithdrawalInDb, updateCreatorWithdrawalInDb };`,
    sandbox,
    { filename: "db.js" },
  );

  return {
    api: sandbox.module.exports.__creatorIncomeTest,
    calls,
    ledgerRows,
    getBalance: () => state.balance,
    getWithdrawal: () => state.withdrawal,
  };
}

test("creator income uses PostgreSQL tables and an idempotent settled-credit ledger", () => {
  assert.match(dbSource, /CREATE TABLE IF NOT EXISTS app_creator_earning_ledger/);
  assert.match(dbSource, /CREATE TABLE IF NOT EXISTS app_creator_withdrawals/);
  assert.match(dbSource, /CREATE UNIQUE INDEX IF NOT EXISTS app_creator_earning_session_uidx[\s\S]*?\(type, session_id\)[\s\S]*?type = 'video_view_earning'/);
  assert.match(dbSource, /SELECT payload FROM app_chat_live_characters WHERE id = \$1`/);
  assert.doesNotMatch(dbSource, /SELECT payload FROM app_chat_live_characters WHERE id = \$1 AND deleted_at IS NULL/);
  assert.match(server, /const earningSourceCredits = Number\(updated\?\.chargedCredits \|\| 0\)/);
  assert.match(server, /sourceCredits: earningSourceCredits,[\s\S]*?earningRate: 0\.3/);
});

test("30% earning is recorded independently without changing app_users credits", async () => {
  const store = loadCreatorDb({
    character: { id: "character-1", name: "角色一", createdByUserId: "creator-1" },
    balance: 0,
  });
  const record = await store.api.recordCreatorVideoViewEarningInDb({
    sessionId: "session-1",
    viewerUserId: "viewer-1",
    characterId: "character-1",
    sourceCredits: 10,
    earningRate: 0.3,
  });
  assert.equal(record.deltaCredits, 3);
  assert.equal(record.sourceCredits, 10);
  assert.equal(record.earningRate, 0.3);
  assert.deepEqual(store.ledgerRows, [{
    type: "video_view_earning",
    creatorUserId: "creator-1",
    viewerUserId: "viewer-1",
    sourceCredits: 10,
    deltaCredits: 3,
    balanceAfter: 3,
  }]);
  assert.equal(store.calls.some((call) => /UPDATE\s+app_users/i.test(call.sql)), false);
});

test("self-view earns nothing and a settled session cannot split twice", async () => {
  const selfView = loadCreatorDb({
    character: { id: "character-1", createdByUserId: "viewer-1" },
    balance: 0,
  });
  assert.equal(await selfView.api.recordCreatorVideoViewEarningInDb({
    sessionId: "session-self",
    viewerUserId: "viewer-1",
    characterId: "character-1",
    sourceCredits: 20,
  }), null);
  assert.equal(selfView.ledgerRows.length, 0);

  const existing = creatorEarningRow([
    "earning-existing", "creator-1", "viewer-1", "character-1", "session-1",
    "video_view_earning", "10", "0.3", "3", "3", "{}", "{}", new Date().toISOString(),
  ]);
  const duplicate = loadCreatorDb({
    character: { id: "character-1", createdByUserId: "creator-1" },
    existingEarning: existing,
  });
  const record = await duplicate.api.recordCreatorVideoViewEarningInDb({
    sessionId: "session-1",
    viewerUserId: "viewer-1",
    characterId: "character-1",
    sourceCredits: 10,
  });
  assert.equal(record.deltaCredits, 3);
  assert.equal(duplicate.calls.some((call) => call.sql.startsWith("INSERT INTO app_creator_earning_ledger")), false);
});

test("USDT withdrawal freezes independent earnings and enforces the review rules", async () => {
  const store = loadCreatorDb({ balance: 2500 });
  const withdrawal = await store.api.createCreatorWithdrawalInDb({
    userId: "creator-1",
    amountCredits: 2000,
    network: "USDT-TRC20",
    address: "T123456789012345678901234567890",
  });
  assert.equal(withdrawal.amountCredits, 2000);
  assert.equal(withdrawal.status, "processing");
  assert.equal(store.getBalance(), 500);
  assert.equal(store.ledgerRows[0].type, "withdrawal_hold");
  assert.equal(store.ledgerRows[0].deltaCredits, -2000);

  await assert.rejects(
    store.api.createCreatorWithdrawalInDb({
      userId: "creator-1",
      amountCredits: 1999.99,
      network: "USDT-TRC20",
      address: "T123456789012345678901234567890",
    }),
    (error) => error.code === "INVALID_WITHDRAWAL_AMOUNT" && /最低提现 2000 积分（20 USDT）/.test(error.message),
  );
});

test("paid withdrawals require txHash and rejected withdrawals refund available credits", async () => {
  const processing = withdrawalRow({ amount_credits: "1", status: "processing" });
  const paidStore = loadCreatorDb({ balance: 2, withdrawal: processing });
  await assert.rejects(
    paidStore.api.updateCreatorWithdrawalInDb({ id: "withdrawal-1", status: "paid", adminUserId: "admin-1" }),
    (error) => error.code === "WITHDRAWAL_TX_HASH_REQUIRED",
  );

  const rejectedStore = loadCreatorDb({ balance: 2, withdrawal: withdrawalRow({ amount_credits: "1", status: "processing" }) });
  await assert.rejects(
    rejectedStore.api.updateCreatorWithdrawalInDb({ id: "withdrawal-1", status: "rejected", adminUserId: "admin-1" }),
    (error) => error.code === "WITHDRAWAL_REJECTION_REASON_REQUIRED",
  );

  const reviewed = await rejectedStore.api.updateCreatorWithdrawalInDb({
    id: "withdrawal-1",
    status: "rejected",
    rejectionReason: "地址无效",
    adminUserId: "admin-1",
  });
  assert.equal(reviewed.status, "rejected");
  assert.equal(rejectedStore.ledgerRows.at(-1).type, "withdrawal_refund");
  assert.equal(rejectedStore.ledgerRows.at(-1).deltaCredits, 1);
  assert.equal(rejectedStore.getBalance(), 3);

  const paid = await loadCreatorDb({
    balance: 2,
    withdrawal: withdrawalRow({ amount_credits: "1", status: "processing" }),
  }).api.updateCreatorWithdrawalInDb({
    id: "withdrawal-1",
    status: "paid",
    txHash: "0xUSDT-PAID-HASH",
    adminUserId: "admin-1",
  });
  assert.equal(paid.status, "paid");
  assert.equal(paid.txHash, "0xUSDT-PAID-HASH");
});

test("creator income APIs, profile page, and admin review UI are wired", () => {
  assert.match(server, /url\.pathname === "\/api\/live\/creator-income"/);
  assert.match(server, /url\.pathname === "\/api\/live\/creator-withdrawals"/);
  assert.match(server, /url\.pathname === "\/api\/admin\/creator-data"/);
  assert.match(server, /url\.pathname === "\/api\/admin\/creator-withdrawals"/);
  assert.match(server, /adminCreatorWithdrawalMatch[\s\S]*?handleAdminUpdateCreatorWithdrawal/);
  assert.match(live, /\["creator-income", "gift", "创作者收益"/);
  assert.match(live, /视频通话实际扣除的积分，30% 作为角色创作者可提现收益/);
  assert.match(live, /data-creator-withdraw-form/);
  assert.match(live, /name="address"/);
  assert.match(live, /最低提现 2000 积分（20 USDT）/);
  assert.match(live, /不会累加到普通积分余额/);
  assert.match(liveHtml, /live\.js\?v=2026102908/);
  assert.match(liveHtml, /live\.css\?v=2026102908/);
  assert.match(adminHtml, /data-route="creator-data"[\s\S]*?创作者数据/);
  assert.match(adminHtml, /admin\.js\?v=20261029-creator-income-1/);
  assert.match(admin, /async function renderCreatorData/);
  assert.match(admin, /data-creator-withdraw-action="paid"/);
  assert.match(admin, /data-creator-withdraw-action="rejected"/);
  assert.match(admin, /打款必须填写链上交易哈希；拒绝必须填写原因/);
  assert.doesNotMatch(admin, /result\.txHash/);
});
