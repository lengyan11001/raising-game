"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const server = require("../server-source").readServerSource();

test("generation notifications have an independent compatibility-on switch", () => {
  assert.match(server, /const TELEGRAM_GENERATION_NOTIFICATIONS_ENABLED = \/\^\(1\|true\|yes\|on\)\$\/i\.test\(String\(process\.env\.TELEGRAM_GENERATION_NOTIFICATIONS_ENABLED \|\| "1"\)\.trim\(\)\);/);
  assert.match(server, /function telegramGenerationNotifierEnabled\(\)[\s\S]*?TELEGRAM_GENERATION_NOTIFICATIONS_ENABLED[\s\S]*?TELEGRAM_BOT_TOKEN[\s\S]*?telegramBotClient\.enabled/);
});

test("disabling generation notifications leaves inbound Telegram handling available", () => {
  const notifier = server.match(/function telegramGenerationNotifierEnabled\(\)[\s\S]*?\n}\r?\n\r?\nasync function notifyTelegramGenerationRecord/);
  assert.ok(notifier, "generation notifier guard should be present");
  assert.match(server, /async function notifyTelegramGenerationRecord[\s\S]*?!telegramGenerationNotifierEnabled\(\)[\s\S]*?return;/);
  assert.match(server, /async function scanTelegramGenerationNotifications[\s\S]*?telegramGenerationNotifierEnabled\(\)/);
  assert.match(server, /function startTelegramBotScheduler\(\)[\s\S]*?if \(!telegramGenerationNotifierEnabled\(\)\) return;/);
  assert.match(server, /async function handleTelegramBotWebhook\(req, res\)/);
  assert.doesNotMatch(notifier[0], /TELEGRAM_LOGIN_BOT_TOKEN/);
});

test("payment notifications remain independently disabled by default", () => {
  assert.match(server, /TELEGRAM_PAYMENT_NOTIFICATIONS_ENABLED \|\| "0"/);
  assert.match(server, /TELEGRAM_GENERATION_NOTIFICATIONS_ENABLED \|\| "1"/);
  assert.match(server, /TELEGRAM_API_AUTH_COOLDOWN_RAW === ""[\s\S]*?300000[\s\S]*?TELEGRAM_API_AUTH_COOLDOWN_RAW === "0"[\s\S]*?\? 0[\s\S]*?\|\| 300000/);
});
