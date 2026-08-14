"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  createTelegramBotClient,
  parseTelegramWebAppInitData,
  telegramMiniAppUrl,
  telegramStatusStage,
} = require("../telegram-bot");

const PLATFORM_HTML = fs.readFileSync(path.join(__dirname, "..", "platform.html"), "utf8");
const PLATFORM_TELEGRAM = fs.readFileSync(path.join(__dirname, "..", "platform.telegram.js"), "utf8");

function signedInitData(token, user, authDate = Math.floor(Date.now() / 1000)) {
  const params = new URLSearchParams({
    auth_date: String(authDate),
    query_id: "AA-test-query",
    user: JSON.stringify(user),
  });
  const dataCheckString = Array.from(params.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = crypto.createHmac("sha256", "WebAppData").update(token).digest();
  const hash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  params.set("hash", hash);
  return params.toString();
}

test("validates Telegram WebApp initData with the bot token", () => {
  const token = "123456:unit-test-token";
  const user = { id: 42, first_name: "Test", username: "tester" };
  const parsed = parseTelegramWebAppInitData(signedInitData(token, user), token);
  assert.equal(parsed.user.id, 42);
  assert.equal(parsed.queryId, "AA-test-query");
});

test("rejects a Telegram WebApp initData signature mismatch", () => {
  assert.throws(
    () => parseTelegramWebAppInitData(signedInitData("123456:one", { id: 42 }), "123456:two"),
    (error) => error.code === "TELEGRAM_INIT_DATA_INVALID" && error.statusCode === 401,
  );
});

test("normalizes Telegram task links and notification stages", () => {
  assert.equal(
    telegramMiniAppUrl("https://undress.14vips.com/", "history", "task-42"),
    "https://undress.14vips.com/?tg_view=history&tg_task=task-42",
  );
  assert.equal(telegramStatusStage("running"), "processing");
  assert.equal(telegramStatusStage("succeeded"), "completed");
  assert.equal(telegramStatusStage("failed"), "failed");
});

test("builds a Telegram menu with all Undress entry points", () => {
  const client = createTelegramBotClient({ token: "123456:unit-test-token" });
  const markup = client.menuMarkup();
  const texts = markup.keyboard.flat().map((button) => button.text);
  assert.deepEqual(texts, ["Create", "History", "Recharge", "Support", "My"]);
  assert.equal(markup.keyboard[0][0].web_app.url.includes("tg_view=create"), true);
  assert.equal(markup.keyboard[1][1].web_app, undefined);
});

test("loads the Telegram SDK only on the Undress hostname", () => {
  assert.doesNotMatch(PLATFORM_HTML, /telegram-web-app\.js/);
  assert.match(PLATFORM_TELEGRAM, /window\.location\.hostname\.toLowerCase\(\) !== "undress\.14vips\.com"/);
  assert.match(PLATFORM_TELEGRAM, /https:\/\/telegram\.org\/js\/telegram-web-app\.js\?63/);
});
