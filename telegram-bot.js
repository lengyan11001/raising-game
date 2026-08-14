"use strict";

const crypto = require("node:crypto");

const TELEGRAM_INIT_DATA_MAX_AGE_SECONDS = 24 * 60 * 60;
const TELEGRAM_API_TIMEOUT_MS = 15000;

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

function telegramMenuMarkup(baseUrl = "https://undress.14vips.com/") {
  const webAppButton = (text, view) => ({ text, web_app: { url: telegramMiniAppUrl(baseUrl, view) } });
  return {
    keyboard: [
      [webAppButton("Create", "create"), webAppButton("History", "history")],
      [webAppButton("Recharge", "topups"), { text: "Support" }],
      [webAppButton("My", "account")],
    ],
    resize_keyboard: true,
    is_persistent: true,
    input_field_placeholder: "Choose an action",
  };
}

function createTelegramBotClient({ token = "", webAppUrl = "https://undress.14vips.com/", timeoutMs = TELEGRAM_API_TIMEOUT_MS } = {}) {
  const botToken = String(token || "").trim();
  const baseUrl = String(webAppUrl || "https://undress.14vips.com/").trim();
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

  async function sendTaskLink(chatId, taskId, stage = "processing") {
    const link = telegramMiniAppUrl(baseUrl, "history", taskId);
    const normalizedStage = telegramStatusStage(stage);
    const text = normalizedStage === "completed"
      ? `Generation complete\n${link}`
      : normalizedStage === "failed"
      ? `Generation failed\n${link}`
      : `Generation in progress\n${link}`;
    return sendMessage(chatId, text);
  }

  async function sendStart(chatId) {
    return sendMessage(chatId, "Undress is ready. Choose an action below.", {
      reply_markup: telegramMenuMarkup(baseUrl),
    });
  }

  async function sendSupportPrompt(chatId) {
    supportModeChats.add(String(chatId || ""));
    return sendMessage(chatId, "Send your support message here. Include the task ID when relevant.", {
      reply_markup: telegramMenuMarkup(baseUrl),
    });
  }

  async function processUpdate(update = {}, { onSupportMessage = null, onUnknownMessage = null } = {}) {
    const message = update.message || update.edited_message;
    if (!message || message.from?.is_bot) return { handled: false };
    const chatId = String(message.chat?.id || "");
    if (!chatId || (message.chat?.type && message.chat.type !== "private")) return { handled: false };
    const text = String(message.text || "").trim();
    const command = text.split(/\s+/)[0].replace(/@\w+$/, "").toLowerCase();
    if (["/start", "/menu", "/create"].includes(command)) {
      await sendStart(chatId);
      return { handled: true, action: "menu" };
    }
    if (command === "/history") {
      await sendMessage(chatId, telegramMiniAppUrl(baseUrl, "history"));
      return { handled: true, action: "history" };
    }
    if (["/recharge", "/topup"].includes(command)) {
      await sendMessage(chatId, telegramMiniAppUrl(baseUrl, "topups"));
      return { handled: true, action: "topups" };
    }
    if (["/me", "/account"].includes(command)) {
      await sendMessage(chatId, telegramMiniAppUrl(baseUrl, "account"));
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
    sendMessage,
    sendStart,
    sendTaskLink,
    processUpdate,
    menuMarkup: () => telegramMenuMarkup(baseUrl),
    miniAppUrl: (view, taskId) => telegramMiniAppUrl(baseUrl, view, taskId),
  };
}

module.exports = {
  TELEGRAM_INIT_DATA_MAX_AGE_SECONDS,
  createTelegramBotClient,
  parseTelegramWebAppInitData,
  telegramMenuMarkup,
  telegramMiniAppUrl,
  telegramStatusStage,
  telegramUserLabel,
};
