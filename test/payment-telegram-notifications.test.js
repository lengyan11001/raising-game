const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const server = fs.readFileSync(path.resolve(__dirname, "..", "server.js"), "utf8");

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
