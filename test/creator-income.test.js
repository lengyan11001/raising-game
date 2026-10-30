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
      if (text.includes("FROM app_creator_earning_ledger WHERE type = $1 AND session_id = $2")) {
        return { rows: existingEarning && String(params[0]) === String(existingEarning.type) && String(params[1]) === String(existingEarning.session_id) ? [existingEarning] : [] };
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
    `${dbSource}\nensureSchema = async () => {};\nmodule.exports.__creatorIncomeTest = { recordCreatorUsageEarningInDb, recordCreatorVideoViewEarningInDb, createCreatorWithdrawalInDb, updateCreatorWithdrawalInDb };`,
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

test("server-derived ownership and royalty eligibility gate only public community roles", () => {
  const publicForRequest = server.slice(
    server.indexOf("function publicChatLiveCharacterForRequest"),
    server.indexOf("function liveMembershipActive"),
  );
  const publicPredicate = server.slice(
    server.indexOf("function communityChatLiveCharacterIsPublic"),
    server.indexOf("function publicChatLiveCharacterIsPubliclyListed"),
  );
  assert.match(publicForRequest, /value\.ownedByViewer = Boolean\(user\?\.id\)/);
  assert.match(publicForRequest, /String\(character\?\.createdByUserId \|\| ""\) === String\(user\.id\)/);
  assert.match(publicForRequest, /value\.creatorRoyaltyEligible = communityChatLiveCharacterIsPublic\(character\)/);
  assert.match(publicPredicate, /character\?\.source === "community"/);
  assert.match(publicPredicate, /character\?\.communityShareEnabled === true/);
  assert.match(publicPredicate, /character\?\.communityVisibility === "public"/);
  assert.match(publicPredicate, /character\?\.enabled !== false/);
  assert.match(live, /<button class="role-share-button" data-action="share-role" aria-label="分享角色">\$\{uiIcon\("share"\)\}<\/button>/);
  assert.doesNotMatch(live, /canShareEarnings \?/);
  assert.doesNotMatch(live, /c\.communityVisibility === "public"[^;\n]*share-role/);
});

test("owner can share a public created role while an internal role has no royalty CTA", () => {
  const publicRoleCard = live.slice(
    live.indexOf('data-action="create-share"'),
    live.indexOf('data-action="create-delete"'),
  );
  assert.match(publicRoleCard, /分享角色/);
  assert.match(live, /if \(role\.communityVisibility !== "public"\) \{\s*state\.createFocusVisibility = true;\s*await openCreateEditor\(id\);\s*referralToast\("设为「公开并分享」并保存后，即可分享角色"\);/);
  assert.match(live, /if \(saved\.character\?\.communityVisibility === "public"\)[\s\S]*?await openSharePoster\(\);/);
  const creatorView = server.slice(
    server.indexOf("function creatorChatLiveCharacterView"),
    server.indexOf("async function handleCreatorChatLiveCharacters"),
  );
  assert.doesNotMatch(creatorView, /share-role|creatorRoyaltyEligible|分享角色/);
  assert.match(server, /payload\.communityShareEnabled = false;[\s\S]*?payload\.communityVisibility = "private";/);
});

test("text chat royalty is recorded only after refundable writes complete", () => {
  const sendHandler = server.slice(
    server.indexOf("async function handleSendChatMessage"),
    server.indexOf("function normalizeWan27MediaItem"),
  );
  const upsertConversation = sendHandler.indexOf("await upsertChatConversationInDb(conversation);");
  const earning = sendHandler.indexOf("await recordCreatorUsageEarningInDb({", upsertConversation);
  const refund = sendHandler.indexOf('"character_chat_refund"', earning);
  assert.ok(upsertConversation >= 0);
  assert.ok(earning > upsertConversation);
  assert.ok(refund > earning);
  assert.match(sendHandler.slice(upsertConversation, earning), /succeeded\. Any earlier failure enters the refund path/);
});

test("text gift royalty uses the persisted gift charge and repairs it idempotently", () => {
  const giftHandler = server.slice(
    server.indexOf("async function handleChatGift"),
    server.indexOf("function chatBurstMessageText"),
  );
  assert.match(giftHandler, /const originalGiftCredits = Number\(existing\.giftCredits \|\| 0\);/);
  assert.match(giftHandler, /earningType: "text_gift_earning"/);
  assert.match(giftHandler, /sourceCredits: originalGiftCredits,/);
  assert.match(giftHandler, /sourceCredits: gift\.credits,/);
  assert.match(giftHandler, /earningRate: 0\.3,/);
  assert.match(giftHandler, /existing[\s\S]*?return sendJson\(res, 200, \{ ok: true, duplicate: true,/);
  assert.match(dbSource, /CREATE UNIQUE INDEX IF NOT EXISTS app_creator_earning_session_uidx[\s\S]*?\(type, session_id\)[\s\S]*?session_id <> ''/);
  assert.match(dbSource, /FROM app_creator_earning_ledger WHERE type = \$1 AND session_id = \$2 LIMIT 1/);
});

test("creator income uses PostgreSQL tables and an idempotent settled-credit ledger", () => {
  assert.match(dbSource, /CREATE TABLE IF NOT EXISTS app_creator_earning_ledger/);
  assert.match(dbSource, /CREATE TABLE IF NOT EXISTS app_creator_withdrawals/);
  assert.match(dbSource, /CREATE UNIQUE INDEX IF NOT EXISTS app_creator_earning_session_uidx[\s\S]*?\(type, session_id\)[\s\S]*?session_id <> ''/);
  assert.match(dbSource, /SELECT payload FROM app_chat_live_characters WHERE id = \$1`/);
  assert.doesNotMatch(dbSource, /SELECT payload FROM app_chat_live_characters WHERE id = \$1 AND deleted_at IS NULL/);
  assert.match(server, /const earningSourceCredits = Number\(updated\?\.chargedCredits \|\| 0\)/);
  assert.match(server, /sourceCredits: earningSourceCredits,[\s\S]*?earningRate: 0\.3/);
});

test("30% earning is recorded independently without changing app_users credits", async () => {
  const store = loadCreatorDb({
    character: { id: "character-1", name: "角色一", createdByUserId: "creator-1", source: "community", communityShareEnabled: true, communityVisibility: "public", enabled: true },
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

test("internal creator-center characters never earn", async () => {
  const store = loadCreatorDb({
    character: { id: "character-internal", createdByUserId: "creator-1", source: "creator", communityShareEnabled: false },
  });
  assert.equal(await store.api.recordCreatorVideoViewEarningInDb({
    sessionId: "session-internal",
    viewerUserId: "viewer-1",
    characterId: "character-internal",
    sourceCredits: 10,
  }), null);
  assert.equal(store.ledgerRows.length, 0);
  assert.equal(store.calls.some((call) => /UPDATE\s+app_users/i.test(call.sql)), false);
});

test("community sharing flag alone is not enough for an internal role to earn", async () => {
  const store = loadCreatorDb({
    character: { id: "character-admin", createdByUserId: "creator-1", source: "admin", communityShareEnabled: true },
  });
  assert.equal(await store.api.recordCreatorVideoViewEarningInDb({
    sessionId: "session-admin",
    viewerUserId: "viewer-1",
    characterId: "character-admin",
    sourceCredits: 10,
  }), null);
  assert.equal(store.ledgerRows.length, 0);
});

test("private or disabled community characters never earn", async () => {
  const privateRole = loadCreatorDb({
    character: { id: "character-private", createdByUserId: "creator-1", source: "community", communityShareEnabled: true, communityVisibility: "private", enabled: true },
  });
  assert.equal(await privateRole.api.recordCreatorVideoViewEarningInDb({
    sessionId: "session-private",
    viewerUserId: "viewer-1",
    characterId: "character-private",
    sourceCredits: 10,
  }), null);
  assert.equal(privateRole.ledgerRows.length, 0);

  const disabledRole = loadCreatorDb({
    character: { id: "character-disabled", createdByUserId: "creator-1", source: "community", communityShareEnabled: true, communityVisibility: "public", enabled: false },
  });
  assert.equal(await disabledRole.api.recordCreatorVideoViewEarningInDb({
    sessionId: "session-disabled",
    viewerUserId: "viewer-1",
    characterId: "character-disabled",
    sourceCredits: 10,
  }), null);
  assert.equal(disabledRole.ledgerRows.length, 0);
});

test("self-view earns nothing and a settled session cannot split twice", async () => {
  const selfView = loadCreatorDb({
    character: { id: "character-1", createdByUserId: "viewer-1", source: "community", communityShareEnabled: true, communityVisibility: "public", enabled: true },
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
    character: { id: "character-1", createdByUserId: "creator-1", source: "community", communityShareEnabled: true, communityVisibility: "public", enabled: true },
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

test("internal creator center is available to logged-in users while staying private and non-royalty", () => {
  const getHandler = server.slice(
    server.indexOf("async function handleCreatorChatLiveCharacters"),
    server.indexOf("function communityChatLiveCharacterView"),
  );
  const saveHandler = server.slice(
    server.indexOf("async function handleCreatorSaveChatLiveCharacter"),
    server.indexOf("async function handleCreatorUploadChatLiveAsset"),
  );
  const communityHandler = server.slice(
    server.indexOf("async function handleCommunitySaveChatLiveCharacter"),
    server.indexOf("async function handleCreatorSaveChatLiveCharacter"),
  );
  assert.match(getHandler, /const auth = await requireUser\(req, res\);/);
  assert.match(saveHandler, /const auth = await requireUser\(req, res\);/);
  assert.doesNotMatch(getHandler, /requireAdmin\(req, res\)/);
  assert.doesNotMatch(saveHandler, /requireAdmin\(req, res\)/);
  assert.match(getHandler, /String\(item\?\.createdByUserId \|\| ""\) === userId/);
  assert.match(saveHandler, /creatorOwnsChatLiveCharacter\(existing, auth\.user\)/);
  assert.match(saveHandler, /只能修改自己创建的角色。/);
  assert.match(saveHandler, /source: "creator",/);
  assert.match(saveHandler, /payload\.communityShareEnabled = false;/);
  assert.match(saveHandler, /payload\.communityVisibility = "private";/);
  assert.match(communityHandler, /source: "community",/);
  assert.match(communityHandler, /payload\.communityShareEnabled = true;/);

  assert.match(live, /\["creator", "pen", "创作者中心", u \? "管理内部角色与素材，不参与分成" : "登录后管理角色与素材"\]/);
  assert.match(live, /if \(action === "creator"\) \{\s*if \(!token\(\) \|\| !state\.user\) return askLogin\(\);\s*state\.page = "creator";/);
  assert.doesNotMatch(live, /创作者中心仅供平台管理员使用/);
  assert.doesNotMatch(live, /state\.user\?\.role !== "admin"/);
  assert.match(live, /data-action="create-share" data-id="\$\{esc\(item\.id\)\}"[\s\S]*?分享角色/);
  assert.doesNotMatch(live, /视频通话实扣积分的 30% 计入角色创作者独立收益/);
  assert.match(live, /「创作」页公开角色被其他用户实际扣费聊天、视频通话或送礼物时，实扣积分的 30%/);
  assert.match(admin, /聊天、视频通话、礼物分成收益/);
  assert.match(admin, /聊天 \/ 视频通话 \/ 礼物实扣积分/);
  assert.doesNotMatch(admin, /查看角色视频通话分成收益/);
});

test("creator income APIs, profile page, and admin review UI are wired", () => {
  assert.match(server, /url\.pathname === "\/api\/live\/creator-income"/);
  assert.match(server, /url\.pathname === "\/api\/live\/creator-withdrawals"/);
  assert.match(server, /url\.pathname === "\/api\/admin\/creator-data"/);
  assert.match(server, /url\.pathname === "\/api\/admin\/creator-withdrawals"/);
  assert.match(server, /adminCreatorWithdrawalMatch[\s\S]*?handleAdminUpdateCreatorWithdrawal/);
  assert.match(live, /\["creator-income", "gift", "创作者收益"/);
  assert.match(live, /单笔收益 = 用户在该角色上的实扣积分 × \$\{Math\.round\(Number\(income\.earningRate \|\| \.3\) \* 100\)\}%/);
  assert.match(live, /仅「创作」页创建的公开角色参与分成；内部创作者中心角色不参与分成。收益独立计算，不累计到普通积分余额。/);
  assert.match(live, /data-creator-withdraw-form/);
  assert.match(live, /name="address"/);
  assert.match(live, /最低提现 2000 积分（20 USDT）/);
  assert.match(live, /不累计到普通积分余额/);
  assert.match(live, /<p>收支清单<\/p>/);
  assert.match(live, /rows = \[\.\.\.incomeRows, \.\.\.withdrawalRows\]\.sort/);
  assert.match(live, /creator-income-ledger/);
  assert.doesNotMatch(live, />收益流水<|>提现记录</);
  assert.match(live, /url\.hash = `role\/\$\{encodeURIComponent\(id\)\}`/);
  assert.match(live, /data-action="create-share" data-id="\$\{esc\(item\.id\)\}"[^>]*>\$\{item\.communityVisibility === "public" \? "分享角色" : "设为公开后分享"\}/);
  const shareSheetBody = live.match(/function openShareSheet\(\) \{([\s\S]*?)\n  \}/)?.[1] || "";
  assert.ok(shareSheetBody);
  assert.doesNotMatch(shareSheetBody, /total|cells|locks/);
  assert.match(liveHtml, /live\.js\?v=2026103034/);
  assert.match(liveHtml, /live\.css\?v=2026103034/);
  assert.match(adminHtml, /data-route="creator-data"[\s\S]*?创作者数据/);
  assert.match(adminHtml, /admin\.js\?v=20261030-voice-preview-10/);
  assert.match(admin, /async function renderCreatorData/);
  assert.match(admin, /data-creator-withdraw-action="paid"/);
  assert.match(admin, /data-creator-withdraw-action="rejected"/);
  assert.match(admin, /打款必须填写链上交易哈希；拒绝必须填写原因/);
  assert.doesNotMatch(admin, /result\.txHash/);
});
