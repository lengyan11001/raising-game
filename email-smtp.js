"use strict";

const crypto = require("node:crypto");
const tls = require("node:tls");

const EMAIL_NOT_CONFIGURED = "EMAIL_NOT_CONFIGURED";
const EMAIL_SEND_FAILED = "EMAIL_SEND_FAILED";
const EMAIL_RECIPIENT_INVALID = "EMAIL_RECIPIENT_INVALID";
const EMAIL_SMTP_UNSUPPORTED = "EMAIL_SMTP_UNSUPPORTED";

function emailError(message, code = EMAIL_SEND_FAILED, options = {}) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = options.statusCode || (code === EMAIL_NOT_CONFIGURED ? 503 : code === EMAIL_RECIPIENT_INVALID ? 400 : 502);
  if (options.cause) error.cause = options.cause;
  return error;
}

function integerSetting(value, fallback, minimum, maximum) {
  const number = Number(value);
  return Number.isInteger(number) && number >= minimum && number <= maximum ? number : fallback;
}

function smtpConfig(env = process.env) {
  return {
    host: String(env.EMAIL_SMTP_HOST || "").trim(),
    port: integerSetting(env.EMAIL_SMTP_PORT, 465, 1, 65535),
    secure: !/^(0|false|no|off)$/i.test(String(env.EMAIL_SMTP_SECURE || "1").trim()),
    user: String(env.EMAIL_SMTP_USER || "").trim(),
    pass: String(env.EMAIL_SMTP_PASSWORD || env.EMAIL_SMTP_PASS || "").trim(),
    from: String(env.EMAIL_FROM || "").trim(),
    replyTo: String(env.EMAIL_REPLY_TO || "").trim(),
    connectionTimeoutMs: integerSetting(env.EMAIL_SMTP_CONNECTION_TIMEOUT_MS, 15000, 1000, 120000),
    greetingTimeoutMs: integerSetting(env.EMAIL_SMTP_GREETING_TIMEOUT_MS, 10000, 1000, 120000),
    socketTimeoutMs: integerSetting(env.EMAIL_SMTP_SOCKET_TIMEOUT_MS, 20000, 1000, 120000),
  };
}

function smtpConfigured(config = smtpConfig()) {
  return Boolean(config.host && config.port && config.user && config.pass && config.from);
}

function normalizeAddress(value = "") {
  return String(value || "").trim();
}

function headerText(value = "", label = "Email header") {
  const text = normalizeAddress(value);
  if (/[\r\n]/.test(text)) throw emailError(`${label} contains an invalid line break.`, EMAIL_SEND_FAILED);
  return text;
}

function extractEmailAddress(value = "", label = "email address") {
  const text = headerText(value, label);
  const angleMatch = text.match(/<([^<>\s]+@[^<>\s]+)>/);
  const address = angleMatch ? angleMatch[1] : text;
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address) || address.length > 254) {
    throw emailError(`Invalid ${label}.`, EMAIL_RECIPIENT_INVALID);
  }
  return address;
}

function assertSmtpConfig(config) {
  if (!smtpConfigured(config)) {
    throw emailError(
      "Email service is not configured. Set EMAIL_SMTP_HOST, EMAIL_SMTP_PORT, EMAIL_SMTP_SECURE, EMAIL_SMTP_USER, EMAIL_SMTP_PASSWORD and EMAIL_FROM.",
      EMAIL_NOT_CONFIGURED,
    );
  }
  if (!config.secure) {
    throw emailError(
      "Alibaba Cloud Direct Mail requires implicit TLS. Set EMAIL_SMTP_SECURE=1; port 587 / STARTTLS is not used by this integration.",
      EMAIL_SMTP_UNSUPPORTED,
    );
  }
}

function connectSmtpTls(config) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({
      host: config.host,
      port: config.port,
      servername: config.host,
      rejectUnauthorized: true,
      minVersion: "TLSv1.2",
    });
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      socket.removeListener("secureConnect", onConnect);
      socket.removeListener("error", onError);
      if (error) {
        socket.destroy();
        reject(emailError(`SMTP connection failed: ${error.message || "unknown error"}`, EMAIL_SEND_FAILED, { cause: error }));
      } else {
        resolve(socket);
      }
    };
    const onConnect = () => finish();
    const onError = (error) => finish(error);
    socket.setTimeout(config.connectionTimeoutMs, () => finish(new Error("connection timed out")));
    socket.once("secureConnect", onConnect);
    socket.once("error", onError);
  });
}

function readSmtpResponse(socket, timeoutMs) {
  return new Promise((resolve, reject) => {
    let buffer = "";
    let timer;
    const cleanup = () => {
      clearTimeout(timer);
      socket.removeListener("data", onData);
      socket.removeListener("error", onError);
      socket.removeListener("close", onClose);
    };
    const fail = (error) => {
      cleanup();
      reject(emailError(`SMTP connection failed: ${error.message || "response timeout"}`, EMAIL_SEND_FAILED, { cause: error }));
    };
    const onError = (error) => fail(error);
    const onClose = () => fail(new Error("connection closed before SMTP response"));
    const onData = (chunk) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";
      if (!lines.length) return;
      const lastLine = lines[lines.length - 1];
      if (!/^\d{3}[ -]/.test(lastLine)) return;
      const codeLine = lines.find((line) => /^\d{3} /.test(line));
      if (!codeLine) return;
      cleanup();
      resolve({ code: Number(codeLine.slice(0, 3)), lines });
    };
    timer = setTimeout(() => fail(new Error("response timeout")), timeoutMs);
    socket.on("data", onData);
    socket.once("error", onError);
    socket.once("close", onClose);
  });
}

function expectSmtp(socket, response, allowedCodes, context, timeoutMs) {
  return Promise.resolve(response).then((result) => {
    if (allowedCodes.includes(result.code)) return result;
    const detail = result.lines.join(" ").replace(/\s+/g, " ").slice(0, 240);
    throw emailError(`${context} failed (${result.code}): ${detail}`, EMAIL_SEND_FAILED);
  });
}

async function command(socket, line, allowedCodes, context, timeoutMs) {
  if (/[\r\n]/.test(line)) throw emailError("SMTP command contains an invalid line break.", EMAIL_SEND_FAILED);
  socket.write(`${line}\r\n`);
  const response = await readSmtpResponse(socket, timeoutMs);
  return expectSmtp(socket, response, allowedCodes, context, timeoutMs);
}

function base64(value) {
  return Buffer.from(String(value || ""), "utf8").toString("base64");
}

function wrapBase64(value, width = 76) {
  const encoded = base64(value);
  return encoded.match(new RegExp(`.{1,${width}}`, "g"))?.join("\r\n") || "";
}

function encodeSubject(value) {
  const subject = headerText(value || "Vipeak verification code", "Email subject");
  return `=?UTF-8?B?${base64(subject)}?=`;
}

function escapeDataLine(line = "") {
  return line.startsWith(".") ? `.${line}` : line;
}

function emailDomain(address, fallback = "localhost") {
  return String(address || "").split("@")[1] || fallback;
}

function buildMimeMessage({ from, to, replyTo, subject, text, html, messageId }) {
  const boundary = `vipeak-${crypto.randomBytes(12).toString("hex")}`;
  const plain = text || String(html || "").replace(/<[^>]*>/g, " ");
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    ...(replyTo ? [`Reply-To: ${replyTo}`] : []),
    `Subject: ${encodeSubject(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${messageId}>`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "X-Entity-Ref-ID: " + messageId,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(plain),
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(html || `<pre>${plain.replace(/[&<>]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[char]))}</pre>`),
    "",
    `--${boundary}--`,
    "",
  ];
  return lines.join("\r\n");
}

async function authenticate(socket, config, timeoutMs) {
  const ehlo = await command(socket, "EHLO vipeakai.local", [250], "SMTP EHLO", timeoutMs);
  const advertised = ehlo.lines.join("\n").toUpperCase();
  if (advertised.includes("AUTH") && /AUTH[^\n]*(PLAIN|LOGIN)/.test(advertised)) {
    if (/AUTH[^\n]*PLAIN/.test(advertised)) {
      await command(socket, `AUTH PLAIN ${base64(`\0${config.user}\0${config.pass}`)}`, [235], "SMTP authentication", timeoutMs);
    } else {
      await command(socket, "AUTH LOGIN", [334], "SMTP authentication", timeoutMs);
      await command(socket, base64(config.user), [334], "SMTP authentication", timeoutMs);
      await command(socket, base64(config.pass), [235], "SMTP authentication", timeoutMs);
    }
  } else {
    await command(socket, "AUTH LOGIN", [334], "SMTP authentication", timeoutMs);
    await command(socket, base64(config.user), [334], "SMTP authentication", timeoutMs);
    await command(socket, base64(config.pass), [235], "SMTP authentication", timeoutMs);
  }
}

async function withSmtpSession(config, action) {
  assertSmtpConfig(config);
  const socket = await connectSmtpTls(config);
  let authenticated = false;
  try {
    socket.setTimeout(config.socketTimeoutMs);
    await expectSmtp(socket, await readSmtpResponse(socket, config.greetingTimeoutMs), [220], "SMTP greeting", config.socketTimeoutMs);
    await authenticate(socket, config, config.socketTimeoutMs);
    authenticated = true;
    return await action(socket);
  } finally {
    if (!socket.destroyed) {
      if (authenticated) socket.write("QUIT\r\n");
      socket.end();
      setTimeout(() => socket.destroy(), 1000).unref?.();
    }
  }
}

async function verifySmtp(config = smtpConfig()) {
  await withSmtpSession(config, async () => undefined);
  return { ok: true, host: config.host, port: config.port, secure: config.secure };
}

async function sendSmtpMail({ to, subject, text = "", html = "", replyTo = "" }, config = smtpConfig()) {
  assertSmtpConfig(config);
  const recipient = extractEmailAddress(to, "recipient email address");
  const envelopeFrom = extractEmailAddress(config.from, "sender email address");
  const replyAddress = replyTo || config.replyTo ? extractEmailAddress(replyTo || config.replyTo, "reply-to email address") : "";
  const normalizedSubject = headerText(subject || "Vipeak verification code", "Email subject");
  const normalizedFrom = headerText(config.from, "sender");
  const messageId = `vipeak-${Date.now()}-${crypto.randomBytes(8).toString("hex")}@${emailDomain(envelopeFrom, config.host)}`;
  const message = buildMimeMessage({
    from: normalizedFrom,
    to: recipient,
    replyTo: replyAddress,
    subject: normalizedSubject,
    text,
    html,
    messageId,
  });
  const safeMessage = message.split("\r\n").map(escapeDataLine).join("\r\n");
  return withSmtpSession(config, async (socket) => {
    await command(socket, `MAIL FROM:<${envelopeFrom}>`, [250], "SMTP MAIL FROM", config.socketTimeoutMs);
    await command(socket, `RCPT TO:<${recipient}>`, [250, 251], "SMTP RCPT TO", config.socketTimeoutMs);
    await command(socket, "DATA", [354], "SMTP DATA", config.socketTimeoutMs);
    socket.write(`${safeMessage}\r\n.\r\n`);
    const accepted = await expectSmtp(socket, await readSmtpResponse(socket, config.socketTimeoutMs), [250], "SMTP message delivery", config.socketTimeoutMs);
    const response = accepted.lines.join(" ").replace(/\s+/g, " ").trim();
    return { accepted: true, response, messageId };
  });
}

module.exports = {
  EMAIL_NOT_CONFIGURED,
  EMAIL_SEND_FAILED,
  EMAIL_RECIPIENT_INVALID,
  EMAIL_SMTP_UNSUPPORTED,
  emailError,
  smtpConfig,
  smtpConfigured,
  verifySmtp,
  sendSmtpMail,
};
