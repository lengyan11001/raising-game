"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const databaseUrl = String(process.env.TEST_DATABASE_URL || "").trim();
const databaseName = (() => {
  try {
    return decodeURIComponent(new URL(databaseUrl).pathname.replace(/^\//, ""));
  } catch {
    return "";
  }
})();
const canRun = Boolean(databaseUrl) && /(?:^|[_-])test(?:$|[_-])/i.test(databaseName);

if (canRun) process.env.DATABASE_URL = databaseUrl;

const db = canRun ? require("../db") : null;

test("PostgreSQL notification claims are atomic and at-most-once after uncertain delivery", {
  skip: !canRun ? "Set TEST_DATABASE_URL to a dedicated disposable PostgreSQL test database." : false,
}, async (t) => {
  const { Pool } = require("pg");
  const pool = new Pool({ connectionString: databaseUrl, max: 4 });
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const orderId = `tg-payment-test-${suffix}`;
  const taskId = `tg-generation-test-${suffix}`;
  const chatId = `chat-${suffix}`;
  const stage = "completed";
  const claimKey = `${stage}:${chatId}`;

  t.after(async () => {
    await pool.query("DELETE FROM app_wallet_orders WHERE id = $1", [orderId]).catch(() => {});
    await pool.query("DELETE FROM app_generation_records WHERE task_id = $1", [taskId]).catch(() => {});
    await pool.end();
  });

  await db.updateWalletOrderInDb({
    id: orderId,
    userId: `user-${suffix}`,
    status: "paid",
    telegramPaymentNotificationPendingAt: new Date().toISOString(),
    telegramPaymentNotificationStatus: "pending",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const [firstPaymentClaim, secondPaymentClaim] = await Promise.all([
    db.claimTelegramPaymentNotificationRecipientInDb(orderId, chatId, `token-a-${suffix}`),
    db.claimTelegramPaymentNotificationRecipientInDb(orderId, chatId, `token-b-${suffix}`),
  ]);
  assert.equal(Number(firstPaymentClaim?.claimed) + Number(secondPaymentClaim?.claimed), 1);
  const winner = firstPaymentClaim?.claimed ? firstPaymentClaim : secondPaymentClaim;
  const winnerToken = winner.order.telegramPaymentNotificationRecipientClaims[chatId].claimToken;
  assert.ok([`token-a-${suffix}`, `token-b-${suffix}`].includes(winnerToken));
  const persistedPayment = await db.getWalletOrderByIdInDb(orderId);
  assert.equal(persistedPayment.telegramPaymentNotificationRecipientClaims[chatId].claimToken, winnerToken);
  const rejectedToken = winnerToken === `token-a-${suffix}` ? `token-b-${suffix}` : `token-a-${suffix}`;
  assert.equal(await db.confirmTelegramPaymentNotificationRecipientInDb(orderId, chatId, rejectedToken), null);
  const confirmedPayment = await db.confirmTelegramPaymentNotificationRecipientInDb(orderId, chatId, winnerToken);
  assert.equal(confirmedPayment.telegramPaymentNotificationRecipientClaims[chatId].status, "sent");
  assert.deepEqual(confirmedPayment.telegramPaymentNotificationSentChatIds, [chatId]);
  const afterConfirm = await db.claimTelegramPaymentNotificationRecipientInDb(orderId, chatId, `token-c-${suffix}`);
  assert.equal(afterConfirm.claimed, false);

  const retryOrderId = `${orderId}-retry`;
  await db.updateWalletOrderInDb({
    id: retryOrderId,
    userId: `user-${suffix}`,
    status: "paid",
    telegramPaymentNotificationPendingAt: new Date().toISOString(),
    telegramPaymentNotificationStatus: "pending",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  const retryToken = `retry-${suffix}`;
  assert.equal((await db.claimTelegramPaymentNotificationRecipientInDb(retryOrderId, chatId, retryToken))?.claimed, true);
  const released = await db.releaseTelegramPaymentNotificationRecipientClaimInDb(retryOrderId, chatId, retryToken, "Telegram API rejected the request");
  assert.equal(released.telegramPaymentNotificationRecipientClaims[chatId].status, "retry");
  assert.equal((await db.claimTelegramPaymentNotificationRecipientInDb(retryOrderId, chatId, `retry-2-${suffix}`))?.claimed, true);
  await db.recordTelegramPaymentNotificationStateInDb(retryOrderId, {
    status: "retry",
    error: "one recipient failed",
    attempted: true,
  });
  const retryOrder = await db.getWalletOrderByIdInDb(retryOrderId);
  assert.equal(retryOrder.telegramPaymentNotificationStatus, "retry");
  assert.equal(retryOrder.telegramPaymentNotificationAttempts, 1);
  await pool.query("DELETE FROM app_wallet_orders WHERE id = $1", [retryOrderId]);

  const uncertainOrderId = `${orderId}-uncertain`;
  await db.updateWalletOrderInDb({
    id: uncertainOrderId,
    userId: `user-${suffix}`,
    status: "paid",
    telegramPaymentNotificationPendingAt: new Date().toISOString(),
    telegramPaymentNotificationStatus: "pending",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  assert.equal((await db.claimTelegramPaymentNotificationRecipientInDb(uncertainOrderId, chatId, `uncertain-${suffix}`))?.claimed, true);
  await pool.query(
    `UPDATE app_wallet_orders
     SET payload = jsonb_set(payload, ARRAY['telegramPaymentNotificationRecipientClaims', $2, 'claimedAt'], to_jsonb($3::text), true)
     WHERE id = $1`,
    [uncertainOrderId, chatId, new Date(Date.now() - 60 * 60 * 1000).toISOString()],
  );
  assert.equal((await db.claimTelegramPaymentNotificationRecipientInDb(uncertainOrderId, chatId, `uncertain-2-${suffix}`))?.claimed, false);
  await pool.query("DELETE FROM app_wallet_orders WHERE id = $1", [uncertainOrderId]);

  await db.upsertGenerationRecordInDb({
    taskId,
    userId: `user-${suffix}`,
    status: "succeeded",
    tenantId: "undress-tool",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  const [firstGenerationClaim, secondGenerationClaim] = await Promise.all([
    db.claimTelegramGenerationNotificationInDb(taskId, stage, chatId, `generation-a-${suffix}`),
    db.claimTelegramGenerationNotificationInDb(taskId, stage, chatId, `generation-b-${suffix}`),
  ]);
  assert.equal(Number(firstGenerationClaim?.claimed) + Number(secondGenerationClaim?.claimed), 1);
  const generationWinner = firstGenerationClaim?.claimed ? firstGenerationClaim : secondGenerationClaim;
  const generationWinnerToken = generationWinner.record.telegramNotificationClaims[claimKey].claimToken;
  const confirmedGeneration = await db.confirmTelegramGenerationNotificationInDb(taskId, stage, chatId, generationWinnerToken);
  assert.equal(confirmedGeneration.telegramNotificationClaims[claimKey].status, "sent");
  assert.ok(confirmedGeneration.telegramNotificationStages[stage]);
  assert.equal((await db.claimTelegramGenerationNotificationInDb(taskId, stage, chatId, `generation-c-${suffix}`))?.claimed, false);

  const uncertainTaskId = `${taskId}-uncertain`;
  await db.upsertGenerationRecordInDb({
    taskId: uncertainTaskId,
    userId: `user-${suffix}`,
    status: "succeeded",
    tenantId: "undress-tool",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  assert.equal((await db.claimTelegramGenerationNotificationInDb(uncertainTaskId, stage, chatId, `generation-uncertain-${suffix}`))?.claimed, true);
  await pool.query(
    `UPDATE app_generation_records
     SET payload = jsonb_set(payload, ARRAY['telegramNotificationClaims', $2, 'claimedAt'], to_jsonb($3::text), true)
     WHERE task_id = $1`,
    [uncertainTaskId, claimKey, new Date(Date.now() - 60 * 60 * 1000).toISOString()],
  );
  const staleGeneration = await db.claimTelegramGenerationNotificationInDb(uncertainTaskId, stage, chatId, `generation-uncertain-2-${suffix}`);
  assert.equal(staleGeneration.claimed, false);
  assert.equal(staleGeneration.stale, true);
  assert.equal(staleGeneration.record.telegramNotificationClaims[claimKey].status, "unknown");
  assert.equal((await db.claimTelegramGenerationNotificationInDb(uncertainTaskId, stage, chatId, `generation-uncertain-3-${suffix}`))?.claimed, false);
  await pool.query("DELETE FROM app_generation_records WHERE task_id = $1", [uncertainTaskId]);
});
