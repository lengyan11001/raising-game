"use strict";

const crypto = require("node:crypto");

const TELEGRAM_INIT_DATA_MAX_AGE_SECONDS = 24 * 60 * 60;
const TELEGRAM_API_TIMEOUT_MS = 15000;
const TELEGRAM_LOGIN_NONCE_MAX_AGE_SECONDS = 10 * 60;

function normalizedText(value = "", maxLength = 4096) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function safeEqualHex(actual = "", expected = "") {
  const actualBuffer = Buffer.from(String(actual || ""), "hex");
  const expectedBuffer = Buffer.from(String(expected || ""), "hex");
  return actualBuffer.length === expectedBuffer.length
    && actualBuffer.length > 0
    && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function parseTelegramWebAppInitData(initData = "", botToken = "", { maxAgeSeconds = TELEGRAM_INIT_DATA_MAX_AGE_SECONDS } = {}) {
  const raw = String(initData || "").trim();
  const token = String(botToken || "").trim();
  if (!raw || !token) {
    const error = new Error("Telegram WebApp authentication data is missing.");
    error.code = "TELEGRAM_INIT_DATA_MISSING";
    error.statusCode = 401;
    throw error;
  }

  const params = new URLSearchParams(raw);
  const receivedHash = String(params.get("hash") || "").trim().toLowerCase();
  if (!receivedHash) {
    const error = new Error("Telegram WebApp authentication hash is missing.");
    error.code = "TELEGRAM_INIT_DATA_INVALID";
    error.statusCode = 401;
    throw error;
  }

  const dataCheckString = Array.from(params.entries())
    .filter(([key]) => key !== "hash")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = crypto.createHmac("sha256", "WebAppData").update(token).digest();
  const calculatedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  if (!safeEqualHex(calculatedHash, receivedHash)) {
    const error = new Error("Telegram WebApp authentication data is invalid.");
    error.code = "TELEGRAM_INIT_DATA_INVALID";
    error.statusCode = 401;
    throw error;
  }

  const authDate = Number(params.get("auth_date") || 0);
  if (!Number.isFinite(authDate) || authDate <= 0 || Math.abs(Math.floor(Date.now() / 1000) - authDate) > maxAgeSeconds) {
    const error = new Error("Telegram WebApp authentication data has expired.");
    error.code = "TELEGRAM_INIT_DATA_EXPIRED";
    error.statusCode = 401;
    throw error;
  }

  let user = null;
  try {
    user = JSON.parse(String(params.get("user") || "null"));
  } catch {
    user = null;
  }
  if (!user || !String(user.id || "").trim()) {
    const error = new Error("Telegram user information is missing.");
    error.code = "TELEGRAM_USER_MISSING";
    error.statusCode = 401;
    throw error;
  }

  return {
    user,
    queryId: String(params.get("query_id") || ""),
    startParam: String(params.get("start_param") || ""),
    chatType: String(params.get("chat_type") || ""),
    chatInstance: String(params.get("chat_instance") || ""),
    authDate,
    params,
  };
}

function telegramAuthError(message, code = "TELEGRAM_LOGIN_INVALID", statusCode = 401) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function base64UrlJson(value = "") {
  try {
    return JSON.parse(Buffer.from(String(value || ""), "base64url").toString("utf8"));
  } catch {
    throw telegramAuthError("Telegram login payload is invalid.");
  }
}

function createTelegramLoginNonce(secret = "", payload = {}, { nowMs = Date.now(), maxAgeSeconds = TELEGRAM_LOGIN_NONCE_MAX_AGE_SECONDS } = {}) {
  const key = String(secret || "").trim();
  if (!key) throw telegramAuthError("Telegram login is not configured.", "TELEGRAM_LOGIN_NOT_CONFIGURED", 503);
  const issuedAt = Math.floor(Number(nowMs || Date.now()) / 1000);
  const body = Buffer.from(JSON.stringify({
    v: 1,
    tenantId: String(payload.tenantId || "").trim(),
    host: String(payload.host || "").trim().toLowerCase(),
    iat: issuedAt,
    exp: issuedAt + Math.max(60, Number(maxAgeSeconds || TELEGRAM_LOGIN_NONCE_MAX_AGE_SECONDS)),
    random: crypto.randomBytes(18).toString("base64url"),
  })).toString("base64url");
  const signature = crypto.createHmac("sha256", key).update(body).digest("base64url");
  return `${body}.${signature}`;
}

function parseTelegramLoginNonce(nonce = "", secret = "", { tenantId = "", host = "", nowMs = Date.now() } = {}) {
  const key = String(secret || "").trim();
  const [body = "", signature = "", extra = ""] = String(nonce || "").trim().split(".");
  if (!key || !body || !signature || extra) throw telegramAuthError("Telegram login nonce is invalid.");
  const expected = crypto.createHmac("sha256", key).update(body).digest();
  let received = null;
  try {
    received = Buffer.from(signature, "base64url");
  } catch {
    received = null;
  }
  if (!received || received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) {
    throw telegramAuthError("Telegram login nonce is invalid.");
  }
  const payload = base64UrlJson(body);
  const nowSeconds = Math.floor(Number(nowMs || Date.now()) / 1000);
  if (Number(payload.exp || 0) <= nowSeconds || Number(payload.iat || 0) > nowSeconds + 60) {
    throw telegramAuthError("Telegram login nonce has expired.", "TELEGRAM_LOGIN_EXPIRED");
  }
  if (String(payload.tenantId || "") !== String(tenantId || "").trim()) {
    throw telegramAuthError("Telegram login tenant does not match.");
  }
  if (String(payload.host || "") !== String(host || "").trim().toLowerCase()) {
    throw telegramAuthError("Telegram login host does not match.");
  }
  return payload;
}

function verifyTelegramOidcIdToken(idToken = "", { clientId = "", expectedNonce = "", jwks = {}, nowMs = Date.now() } = {}) {
  const parts = String(idToken || "").trim().split(".");
  if (parts.length !== 3) throw telegramAuthError("Telegram ID token is invalid.");
  const header = base64UrlJson(parts[0]);
  const claims = base64UrlJson(parts[1]);
  if (header.alg !== "RS256" || !header.kid) {
    throw telegramAuthError("Telegram ID token algorithm is not supported.");
  }
  const keys = Array.isArray(jwks?.keys) ? jwks.keys : [];
  const jwk = keys.find((item) => item?.kid === header.kid && item?.kty === "RSA");
  if (!jwk) throw telegramAuthError("Telegram signing key was not found.");
  let verified = false;
  try {
    verified = crypto.verify(
      "RSA-SHA256",
      Buffer.from(`${parts[0]}.${parts[1]}`),
      crypto.createPublicKey({ key: jwk, format: "jwk" }),
      Buffer.from(parts[2], "base64url"),
    );
  } catch {
    verified = false;
  }
  if (!verified) throw telegramAuthError("Telegram ID token signature is invalid.");

  const nowSeconds = Math.floor(Number(nowMs || Date.now()) / 1000);
  const audience = Array.isArray(claims.aud) ? claims.aud.map(String) : [String(claims.aud || "")];
  if (claims.iss !== "https://oauth.telegram.org") throw telegramAuthError("Telegram ID token issuer is invalid.");
  if (!audience.includes(String(clientId || ""))) throw telegramAuthError("Telegram ID token audience is invalid.");
  if (Number(claims.exp || 0) <= nowSeconds || Number(claims.iat || 0) > nowSeconds + 60) {
    throw telegramAuthError("Telegram ID token has expired.", "TELEGRAM_LOGIN_EXPIRED");
  }
  if (!expectedNonce || String(claims.nonce || "") !== String(expectedNonce)) {
    throw telegramAuthError("Telegram ID token nonce is invalid.");
  }
  if (!String(claims.sub || claims.id || "").trim()) {
    throw telegramAuthError("Telegram user information is missing.", "TELEGRAM_USER_MISSING");
  }
  return claims;
}

function telegramUserLabel(user = {}) {
  const username = String(user.username || "").trim();
  const name = [user.first_name, user.last_name].map((value) => normalizedText(value, 80)).filter(Boolean).join(" ");
  if (username && name) return `${name} (@${username})`;
  if (username) return `@${username}`;
  return name || String(user.id || "Telegram user");
}

function telegramStatusStage(status = "") {
  const value = String(status || "").trim().toLowerCase();
  if (["succeeded", "success", "completed", "done", "finished"].includes(value)) return "completed";
  if (["failed", "failure", "error", "cancelled", "canceled"].includes(value)) return "failed";
  if (["running", "processing", "queued", "pending", "submitted", "accepted", "in_progress"].includes(value)) return "processing";
  return value || "processing";
}

function telegramMiniAppUrl(baseUrl = "https://undress.14vips.com/", view = "create", taskId = "") {
  const url = new URL(String(baseUrl || "https://undress.14vips.com/"));
  const normalizedView = ["create", "history", "topups", "support", "account"].includes(String(view || "").toLowerCase())
    ? String(view).toLowerCase()
    : "create";
  url.searchParams.set("tg_view", normalizedView);
  if (taskId) url.searchParams.set("tg_task", String(taskId));
  return url.toString();
}

function telegramMenuMarkup(_baseUrl = "https://undress.14vips.com/") {
  return {
    keyboard: [
      [{ text: "Create" }, { text: "History" }],
      [{ text: "Recharge" }, { text: "Support" }],
      [{ text: "My" }],
    ],
    resize_keyboard: true,
    is_persistent: true,
    input_field_placeholder: "Choose an action",
  };
}

function telegramCreateMarkup() {
  return {
    inline_keyboard: [
      [
        { text: "Image", callback_data: "tg:create:image" },
        { text: "Image to Video", callback_data: "tg:create:image_video" },
      ],
      [{ text: "Video", callback_data: "tg:create:video" }],
    ],
  };
}

function telegramRechargeMarkup(packages = [], paymentMethod = "paypal") {
  const method = String(paymentMethod || "").trim().toLowerCase() === "usdt" ? "usdt" : "paypal";
  const buttons = (Array.isArray(packages) ? packages : [])
    .filter((item) => item && item.id && Number(item.amount) > 0)
    .slice(0, 6)
    .map((item) => ({
      text: `$${Number(item.amount).toFixed(0)} / ${Number(item.credits || 0).toFixed(0)} credits`,
      callback_data: `tg:topup:${method}:${String(item.id).slice(0, 48)}`,
    }));
  const rows = [];
  for (let index = 0; index < buttons.length; index += 2) rows.push(buttons.slice(index, index + 2));
  rows.push([
    { text: method === "paypal" ? "PayPal (selected)" : "PayPal", callback_data: "tg:payment:paypal" },
    { text: method === "usdt" ? "USDT (selected)" : "USDT", callback_data: "tg:payment:usdt" },
  ]);
  return { inline_keyboard: rows };
}

function createTelegramBotClient({
  token = "",
  webAppUrl = "https://undress.14vips.com/",
  telegramChannelUrl = "https://t.me/VipeakAILab",
  xUrl = "https://x.com/VipeakAI",
  timeoutMs = TELEGRAM_API_TIMEOUT_MS,
} = {}) {
  const botToken = String(token || "").trim();
  const baseUrl = String(webAppUrl || "https://undress.14vips.com/").trim();
  const channelUrl = String(telegramChannelUrl || "https://t.me/VipeakAILab").trim();
  const socialXUrl = String(xUrl || "https://x.com/VipeakAI").trim();
  const supportModeChats = new Set();

  async function call(method, payload = {}) {
    if (!botToken) return { ok: false, description: "Telegram bot is not configured." };
    const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.ok === false) {
      const error = new Error(result.description || `Telegram API ${method} failed.`);
      error.statusCode = response.status || 502;
      error.code = "TELEGRAM_API_ERROR";
      error.payload = result;
      throw error;
    }
    return result;
  }

  async function sendMessage(chatId, text, extra = {}) {
    return call("sendMessage", {
      chat_id: String(chatId || ""),
      text: String(text || ""),
      disable_web_page_preview: true,
      ...extra,
    });
  }

  async function sendPhoto(chatId, photo, caption = "", extra = {}) {
    return call("sendPhoto", {
      chat_id: String(chatId || ""),
      photo: String(photo || ""),
      caption: String(caption || "").slice(0, 1024),
      ...extra,
    });
  }

  async function downloadFile(fileId, { maxBytes = 20 * 1024 * 1024 } = {}) {
    const file = (await call("getFile", { file_id: String(fileId || "") })).result || {};
    const filePath = String(file.file_path || "").trim();
    if (!filePath) throw new Error("Telegram file path is unavailable.");
    const response = await fetch(`https://api.telegram.org/file/bot${botToken}/${filePath}`, {
      signal: AbortSignal.timeout(Math.max(timeoutMs, 30000)),
    });
    if (!response.ok) throw new Error(`Telegram file download failed (${response.status}).`);
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > maxBytes) throw new Error(`Telegram media must be ${Math.round(maxBytes / 1024 / 1024)}MB or smaller.`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > maxBytes) throw new Error(`Telegram media must be ${Math.round(maxBytes / 1024 / 1024)}MB or smaller.`);
    return { bytes, filePath, mime: String(response.headers.get("content-type") || "").split(";")[0].trim() };
  }

  async function answerCallbackQuery(callbackQueryId, text = "") {
    return call("answerCallbackQuery", {
      callback_query_id: String(callbackQueryId || ""),
      ...(text ? { text: String(text).slice(0, 200) } : {}),
    });
  }

  async function sendTaskLink(chatId, taskId, stage = "processing") {
    const normalizedStage = telegramStatusStage(stage);
    const text = normalizedStage === "completed"
      ? `Generation complete\nTask: ${String(taskId || "")}`
      : normalizedStage === "failed"
      ? `Generation failed\nTask: ${String(taskId || "")}`
      : `Generation in progress\nTask: ${String(taskId || "")}`;
    return sendMessage(chatId, text);
  }

  async function sendStart(chatId) {
    return sendMessage(chatId, [
      "Welcome to Vipeak AI.",
      "Create AI images and videos directly in Telegram.",
      "",
      `Telegram: ${channelUrl}`,
      `X: ${socialXUrl}`,
      "",
      "Choose an action below.",
    ].join("\n"), {
      reply_markup: telegramMenuMarkup(baseUrl),
    });
  }

  async function sendSupportPrompt(chatId) {
    supportModeChats.add(String(chatId || ""));
    return sendMessage(chatId, "Send your support message here. Include the task ID when relevant.", {
      reply_markup: telegramMenuMarkup(baseUrl),
    });
  }

  async function processUpdate(update = {}, {
    onSupportMessage = null,
    onUnknownMessage = null,
    onCallbackQuery = null,
    onMessage = null,
  } = {}) {
    const callbackQuery = update.callback_query;
    if (callbackQuery && !callbackQuery.from?.is_bot) {
      await answerCallbackQuery(callbackQuery.id).catch(() => {});
      if (typeof onCallbackQuery === "function") {
        await onCallbackQuery(callbackQuery);
        return { handled: true, action: "callback" };
      }
      return { handled: false };
    }
    const message = update.message || update.edited_message;
    if (!message || message.from?.is_bot) return { handled: false };
    const chatId = String(message.chat?.id || "");
    if (!chatId || (message.chat?.type && message.chat.type !== "private")) return { handled: false };
    if (typeof onMessage === "function") {
      const handled = await onMessage(message);
      if (handled) return { handled: true, action: "native-message" };
    }
    const text = String(message.text || "").trim();
    const command = text.split(/\s+/)[0].replace(/@\w+$/, "").toLowerCase();
    if (["/start", "/menu", "/create"].includes(command)) {
      await sendStart(chatId);
      return { handled: true, action: "menu" };
    }
    if (command === "/history") {
      await sendStart(chatId);
      return { handled: true, action: "history" };
    }
    if (["/recharge", "/topup"].includes(command)) {
      await sendStart(chatId);
      return { handled: true, action: "topups" };
    }
    if (["/me", "/account"].includes(command)) {
      await sendStart(chatId);
      return { handled: true, action: "account" };
    }
    if (["/support", "support"].includes(command) || text === "Support") {
      await sendSupportPrompt(chatId);
      return { handled: true, action: "support" };
    }
    if (supportModeChats.has(chatId) && typeof onSupportMessage === "function") {
      supportModeChats.delete(chatId);
      await onSupportMessage(message);
      await sendMessage(chatId, "Received. We will reply here if follow-up is needed.", {
        reply_markup: telegramMenuMarkup(baseUrl),
      });
      return { handled: true, action: "support-message" };
    }
    if (typeof onUnknownMessage === "function") await onUnknownMessage(message);
    return { handled: false };
  }

  return {
    enabled: Boolean(botToken),
    call,
    answerCallbackQuery,
    downloadFile,
    sendMessage,
    sendPhoto,
    sendStart,
    sendTaskLink,
    processUpdate,
    createMarkup: telegramCreateMarkup,
    rechargeMarkup: telegramRechargeMarkup,
    menuMarkup: () => telegramMenuMarkup(baseUrl),
    miniAppUrl: (view, taskId) => telegramMiniAppUrl(baseUrl, view, taskId),
  };
}

module.exports = {
  TELEGRAM_INIT_DATA_MAX_AGE_SECONDS,
  TELEGRAM_LOGIN_NONCE_MAX_AGE_SECONDS,
  createTelegramLoginNonce,
  createTelegramBotClient,
  parseTelegramLoginNonce,
  parseTelegramWebAppInitData,
  telegramMenuMarkup,
  telegramCreateMarkup,
  telegramRechargeMarkup,
  telegramMiniAppUrl,
  telegramStatusStage,
  telegramUserLabel,
  verifyTelegramOidcIdToken,
};
