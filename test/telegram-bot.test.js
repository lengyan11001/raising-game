"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  createTelegramLoginNonce,
  createTelegramBotClient,
  parseTelegramLoginNonce,
  parseTelegramWebAppInitData,
  telegramMiniAppUrl,
  telegramStatusStage,
  verifyTelegramOidcIdToken,
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

function signedOidcToken(privateKey, claims, { kid = "test-key", alg = "RS256" } = {}) {
  const header = Buffer.from(JSON.stringify({ alg, kid, typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = crypto.sign("RSA-SHA256", Buffer.from(`${header}.${payload}`), privateKey).toString("base64url");
  return `${header}.${payload}.${signature}`;
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

test("creates tenant- and host-bound Telegram login nonces", () => {
  const nowMs = Date.parse("2026-08-23T12:00:00Z");
  const nonce = createTelegramLoginNonce("123456:test-secret", {
    tenantId: "tool-video",
    host: "Video.Example.com",
  }, { nowMs, maxAgeSeconds: 600 });
  const parsed = parseTelegramLoginNonce(nonce, "123456:test-secret", {
    tenantId: "tool-video",
    host: "video.example.com",
    nowMs: nowMs + 1000,
  });
  assert.equal(parsed.tenantId, "tool-video");
  assert.equal(parsed.host, "video.example.com");
  assert.throws(() => parseTelegramLoginNonce(nonce, "123456:test-secret", {
    tenantId: "tool-undress",
    host: "video.example.com",
    nowMs: nowMs + 1000,
  }), /tenant does not match/);
  assert.throws(() => parseTelegramLoginNonce(nonce, "123456:test-secret", {
    tenantId: "tool-video",
    host: "other.example.com",
    nowMs: nowMs + 1000,
  }), /host does not match/);
  assert.throws(() => parseTelegramLoginNonce(nonce, "123456:test-secret", {
    tenantId: "tool-video",
    host: "video.example.com",
    nowMs: nowMs + 601000,
  }), (error) => error.code === "TELEGRAM_LOGIN_EXPIRED");
});

test("verifies Telegram OIDC ID tokens and rejects altered claims", () => {
  const nowMs = Date.parse("2026-08-23T12:00:00Z");
  const nowSeconds = Math.floor(nowMs / 1000);
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const publicJwk = publicKey.export({ format: "jwk" });
  publicJwk.kid = "test-key";
  publicJwk.alg = "RS256";
  publicJwk.use = "sig";
  const claims = {
    iss: "https://oauth.telegram.org",
    aud: "8908067452",
    sub: "123456789",
    iat: nowSeconds,
    exp: nowSeconds + 600,
    nonce: "signed-nonce",
    preferred_username: "telegram_user",
  };
  const token = signedOidcToken(privateKey, claims);
  const verified = verifyTelegramOidcIdToken(token, {
    clientId: "8908067452",
    expectedNonce: "signed-nonce",
    jwks: { keys: [publicJwk] },
    nowMs,
  });
  assert.equal(verified.sub, "123456789");
  assert.throws(() => verifyTelegramOidcIdToken(token, {
    clientId: "wrong-client",
    expectedNonce: "signed-nonce",
    jwks: { keys: [publicJwk] },
    nowMs,
  }), /audience is invalid/);
  assert.throws(() => verifyTelegramOidcIdToken(token, {
    clientId: "8908067452",
    expectedNonce: "wrong-nonce",
    jwks: { keys: [publicJwk] },
    nowMs,
  }), /nonce is invalid/);
  const expiredToken = signedOidcToken(privateKey, { ...claims, exp: nowSeconds - 1 });
  assert.throws(() => verifyTelegramOidcIdToken(expiredToken, {
    clientId: "8908067452",
    expectedNonce: "signed-nonce",
    jwks: { keys: [publicJwk] },
    nowMs,
  }), (error) => error.code === "TELEGRAM_LOGIN_EXPIRED");
  const otherKeys = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const otherJwk = otherKeys.publicKey.export({ format: "jwk" });
  otherJwk.kid = "test-key";
  assert.throws(() => verifyTelegramOidcIdToken(token, {
    clientId: "8908067452",
    expectedNonce: "signed-nonce",
    jwks: { keys: [otherJwk] },
    nowMs,
  }), /signature is invalid/);
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
  assert.equal(markup.keyboard[0][0].web_app, undefined);
  assert.equal(markup.keyboard[0][1].web_app, undefined);
  assert.equal(markup.keyboard[1][1].web_app, undefined);
  const createMarkup = client.createMarkup();
  assert.equal(createMarkup.inline_keyboard[0][0].callback_data, "tg:create:image");
  assert.equal(createMarkup.inline_keyboard[0][1].callback_data, "tg:create:image_video");
  const rechargeMarkup = client.rechargeMarkup([
    { id: "usd-10", amount: 10, credits: 1000 },
    { id: "usd-20", amount: 20, credits: 2000 },
  ]);
  assert.equal(rechargeMarkup.inline_keyboard[0][0].callback_data, "tg:topup:paypal:usd-10");
  assert.equal(rechargeMarkup.inline_keyboard.at(-1)[0].callback_data, "tg:payment:paypal");
  const usdtMarkup = client.rechargeMarkup([{ id: "usd-10", amount: 10, credits: 1000 }], "usdt");
  assert.equal(usdtMarkup.inline_keyboard[0][0].callback_data, "tg:topup:usdt:usd-10");
  assert.equal(usdtMarkup.inline_keyboard.at(-1)[1].callback_data, "tg:payment:usdt");
});

test("Telegram start welcome includes the community links", async () => {
  const calls = [];
  const originalFetch = global.fetch;
  global.fetch = async (_url, options = {}) => {
    calls.push(JSON.parse(options.body || "{}"));
    return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    const client = createTelegramBotClient({ token: "123456:unit-test-token" });
    await client.sendStart("42");
    assert.match(calls[0].text, /Welcome to Vipeak AI/);
    assert.match(calls[0].text, /https:\/\/t\.me\/VipeakAILab/);
    assert.match(calls[0].text, /https:\/\/x\.com\/VipeakAI/);
  } finally {
    global.fetch = originalFetch;
  }
});

test("tool navigation exposes community and support entries", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "platform.html"), "utf8");
  const undressCss = fs.readFileSync(path.join(__dirname, "..", "tool-undress.css"), "utf8");
  const videoCss = fs.readFileSync(path.join(__dirname, "..", "tool-video.css"), "utf8");
  assert.match(html, /href="https:\/\/t\.me\/VipeakAILab"/);
  assert.match(html, /href="https:\/\/x\.com\/VipeakAI"/);
  assert.match(html, /id="supportNavBtn"/);
  assert.doesNotMatch(undressCss, /body\.tenant-tool-undress \.side-utility-nav,\nbody\.tenant-tool-undress \.support-fab/);
  assert.match(undressCss, /body\.tenant-tool-undress \.side-utility-nav \{[\s\S]*?display: flex/);
  assert.doesNotMatch(videoCss, /body\.tenant-tool-video \.side-utility-nav,\n  body\.tenant-tool-video \.mobile-drawer-account/);
  assert.match(videoCss, /body\.tenant-tool-video \.side-utility-nav \{[\s\S]*?display: flex/);
});

test("loads the Telegram SDK only on the Undress hostname", () => {
  assert.doesNotMatch(PLATFORM_HTML, /telegram-web-app\.js/);
  assert.match(PLATFORM_TELEGRAM, /window\.location\.hostname\.toLowerCase\(\) !== "undress\.14vips\.com"/);
  assert.match(PLATFORM_TELEGRAM, /https:\/\/telegram\.org\/js\/telegram-web-app\.js\?63/);
});

test("supports Telegram OIDC login from the shared login dialog", () => {
  assert.match(PLATFORM_HTML, /id="telegramLoginBtn"/);
  assert.match(PLATFORM_TELEGRAM, /https:\/\/oauth\.telegram\.org\/js\/telegram-login\.js\?5/);
  assert.match(PLATFORM_TELEGRAM, /Telegram\.Login\.auth/);
  assert.match(PLATFORM_TELEGRAM, /requestJson\("\/api\/telegram\/login\/options"\)/);
  assert.match(PLATFORM_TELEGRAM, /requestJson\("\/api\/telegram\/login"/);
  assert.match(PLATFORM_TELEGRAM, /scope: \["profile"\]/);
});
