const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const server = require("../server-source").readServerSource();

test("successful PayPal and USDT settlements queue Telegram notifications", () => {
  const settlement = server.match(/async function settleWalletOrderPayment[\s\S]*?\n}\r?\n\r?\nasync function safeSettleWalletOrderPayment/);
  assert.ok(settlement, "settlement function should be present");
  assert.match(settlement[0], /telegramPaymentNotificationPendingAt/);
  assert.match(settlement[0], /telegramPaymentNotificationStatus = order\.telegramPaymentNotificationStatus \|\| "pending"/);
  assert.match(server, /function telegramPaymentMethodLabel[\s\S]*?return "PayPal"/);
  assert.match(server, /return network \? `USDT \(\$\{network}\)` : "USDT"/);
});

test("payment notifications are sent per chat id and retried without duplicating successful recipients", () => {
  assert.match(server, /TELEGRAM_PAYMENT_NOTIFY_CHAT_IDS/);
  assert.match(server, /telegramPaymentNotificationSentChatIds/);
  assert.match(server, /pendingChatIds = TELEGRAM_PAYMENT_NOTIFY_CHAT_IDS\.filter/);
  assert.match(server, /chat_id: chatId/);
  assert.match(server, /startTelegramPaymentNotificationScheduler\(\)/);
  assert.match(server, /`订单号: \$\{order\.id \|\| ""}`/);
  assert.match(server, /`到账积分: \$\{credits}`/);
});

test("payment notification recipients are claimed atomically before sending", () => {
  const db = fs.readFileSync(path.resolve(__dirname, "..", "db.js"), "utf8");
  const part13 = fs.readFileSync(path.resolve(__dirname, "..", "server.parts", "part-13.js"), "utf8");
  assert.match(db, /async function claimTelegramPaymentNotificationRecipientInDb/);
  assert.match(db, /async function confirmTelegramPaymentNotificationRecipientInDb/);
  assert.match(db, /async function releaseTelegramPaymentNotificationRecipientClaimInDb/);
  assert.match(db, /async function recordTelegramPaymentNotificationStateInDb/);
  assert.match(db, /telegramPaymentNotificationRecipientClaims/);
  assert.match(db, /claim\.claimToken !== token/);
  assert.match(db, /SET payload = \$2::jsonb/);
  assert.match(part13, /await claimTelegramPaymentNotificationRecipientInDb\(order\.id, chatId, claimToken\)/);
  assert.match(part13, /await confirmTelegramPaymentNotificationRecipientInDb\(order\.id, chatId, claimToken\)/);
  assert.match(part13, /await releaseTelegramPaymentNotificationRecipientClaimInDb\(/);
  assert.match(part13, /await recordTelegramPaymentNotificationStateInDb\(order\.id/);
  assert.match(part13, /pendingAfterAttempt/);
  assert.match(part13, /status !== "sent"/);
});

test("notification claims use at-most-once semantics after uncertain delivery", () => {
  const db = fs.readFileSync(path.resolve(__dirname, "..", "db.js"), "utf8");
  const paymentClaim = db.match(/async function claimTelegramPaymentNotificationRecipientInDb[\s\S]*?\n}/);
  const generationClaim = db.match(/async function claimTelegramGenerationNotificationInDb[\s\S]*?\n}/);
  assert.ok(paymentClaim);
  assert.ok(generationClaim);
  assert.doesNotMatch(paymentClaim[0], /staleBefore/);
  assert.match(paymentClaim[0], /pg_advisory_xact_lock/);
  assert.match(paymentClaim[0], /SELECT \* FROM app_wallet_orders WHERE id = \$1/);
  assert.match(paymentClaim[0], /claimStatus === "sending"/);
  assert.match(generationClaim[0], /pg_advisory_xact_lock/);
  assert.match(generationClaim[0], /SELECT payload FROM app_generation_records WHERE task_id = \$1/);
  assert.match(generationClaim[0], /to_jsonb\('unknown'::text\)/);
  assert.match(generationClaim[0], /claim\?\.status === "unknown"/);
});

test("payment notification polling queries only pending paid orders and users", () => {
  const db = fs.readFileSync(path.resolve(__dirname, "..", "db.js"), "utf8");
  const part13 = fs.readFileSync(path.resolve(__dirname, "..", "server.parts", "part-13.js"), "utf8");
  const helper = db.slice(
    db.indexOf("async function getTelegramPaymentNotificationScanDataFromDb"),
    db.indexOf("async function getWalletOrderByIdInDb"),
  );
  assert.match(helper, /WHERE o\.status = 'paid'/);
  assert.match(helper, /telegramPaymentNotificationPendingAt/);
  assert.match(helper, /telegramPaymentNotificationStatus/);
  assert.doesNotMatch(helper, /app_user_assets|app_generation_records|app_user_characters/);
  const scan = part13.slice(part13.indexOf("async function scanTelegramPaymentNotifications"), part13.indexOf("const DOUBLE_TOPUP_PROMO"));
  assert.match(scan, /getTelegramPaymentNotificationScanDataFromDb\(\{ limit: 50 \}\)/);
  assert.doesNotMatch(scan, /\breadDb\s*\(/);
});
