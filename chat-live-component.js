"use strict";
/*
 * 组件版（外接 LLM）流水线：
 *   用户的话 → 我们的 LLM（BytePlus，人设来自后台）→ 文本 type=10
 *            → DashScope CosyVoice 合成 24kHz/s16le/mono PCM → 二进制帧推给 Vidu
 *   Vidu 只负责把数字人渲染到我们自己的 RTC 频道。
 * 该文件是纯 Node 实现（含最小 WebSocket 客户端），不引第三方依赖。
 */
const tls = require("node:tls");
const crypto = require("node:crypto");

const PCM_SAMPLE_RATE = 24000;
const FRAME_BYTES = 960; /* 20ms @24kHz s16le mono */
const WS_PING_INTERVAL_MS = 15000;

function log(...args) {
  console.log("[chat-live-component]", ...args);
}

/* ---------------- 最小 WebSocket 客户端（只能发文本/二进制，收文本/心跳） ---------------- */
class MiniWebSocket {
  constructor(url, { headers = {}, onText, onClose, onOpen } = {}) {
    this.url = new URL(url);
    this.headers = headers;
    this.onText = onText;
    this.onClose = onClose;
    this.onOpen = onOpen;
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this.closed = false;
    this.pingTimer = 0;
  }
  connect() {
    const key = crypto.randomBytes(16).toString("base64");
    const port = this.url.port ? Number(this.url.port) : 443;
    this.socket = tls.connect({ host: this.url.hostname, port, servername: this.url.hostname }, () => {
      const path = `${this.url.pathname}${this.url.search}`;
      const lines = [
        `GET ${path} HTTP/1.1`,
        `Host: ${this.url.hostname}`,
        "Upgrade: websocket",
        "Connection: Upgrade",
        `Sec-WebSocket-Key: ${key}`,
        "Sec-WebSocket-Version: 13",
      ];
      for (const [name, value] of Object.entries(this.headers)) lines.push(`${name}: ${value}`);
      this.socket.write(`${lines.join("\r\n")}\r\n\r\n`);
    });
    this.socket.on("data", (chunk) => this.handleData(chunk));
    this.socket.on("error", (error) => this.fail(error));
    this.socket.on("close", () => this.fail(new Error("socket closed")));
    this.pingTimer = setInterval(() => this.ping(), WS_PING_INTERVAL_MS);
  }
  handleData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    if (!this.upgraded) {
      const end = this.buffer.indexOf("\r\n\r\n");
      if (end < 0) return;
      const head = this.buffer.slice(0, end).toString("latin1");
      this.buffer = this.buffer.slice(end + 4);
      if (!/^HTTP\/1\.1 101/.test(head)) {
        this.fail(new Error(`websocket upgrade failed: ${head.split("\r\n")[0]}`));
        return;
      }
      this.upgraded = true;
      this.onOpen?.();
    }
    this.readFrames();
  }
  readFrames() {
    while (this.buffer.length >= 2) {
      const first = this.buffer[0];
      const second = this.buffer[1];
      const opcode = first & 0x0f;
      const masked = (second & 0x80) !== 0;
      let length = second & 0x7f;
      let offset = 2;
      if (length === 126) {
        if (this.buffer.length < 4) return;
        length = this.buffer.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        if (this.buffer.length < 10) return;
        length = Number(this.buffer.readBigUInt64BE(2));
        offset = 10;
      }
      const maskKey = masked ? this.buffer.slice(offset, offset + 4) : null;
      if (masked) offset += 4;
      if (this.buffer.length < offset + length) return;
      let payload = this.buffer.slice(offset, offset + length);
      if (maskKey) for (let i = 0; i < payload.length; i += 1) payload[i] ^= maskKey[i % 4];
      this.buffer = this.buffer.slice(offset + length);
      if (opcode === 0x9) this.sendFrame(0xa, payload);           /* ping → pong */
      else if (opcode === 0x1) this.onText?.(payload.toString("utf8"));
      else if (opcode === 0x8) this.fail(new Error("server closed websocket"));
    }
  }
  sendFrame(opcode, payload = Buffer.alloc(0)) {
    if (!this.socket || this.socket.destroyed) return false;
    const mask = crypto.randomBytes(4);
    const length = payload.length;
    let header;
    if (length < 126) {
      header = Buffer.alloc(2);
      header[1] = 0x80 | length;
    } else if (length < 65536) {
      header = Buffer.alloc(4);
      header[1] = 0x80 | 126;
      header.writeUInt16BE(length, 2);
    } else {
      header = Buffer.alloc(10);
      header[1] = 0x80 | 127;
      header.writeBigUInt64BE(BigInt(length), 2);
    }
    header[0] = 0x80 | opcode;
    const masked = Buffer.from(payload);
    for (let i = 0; i < masked.length; i += 1) masked[i] ^= mask[i % 4];
    try {
      this.socket.write(Buffer.concat([header, mask, masked]));
      return true;
    } catch {
      return false;
    }
  }
  sendText(text) { return this.sendFrame(0x1, Buffer.from(text, "utf8")); }
  sendBinary(buffer) {
    for (let i = 0; i < buffer.length; i += FRAME_BYTES) {
      this.sendFrame(0x2, buffer.slice(i, i + FRAME_BYTES));
    }
    return true;
  }
  ping() { this.sendFrame(0x9, Buffer.from("hb")); }
  close() {
    this.closed = true;
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = 0;
    try { this.sendFrame(0x8, Buffer.alloc(0)); } catch {}
    try { this.socket?.destroy(); } catch {}
  }
  fail(error) {
    if (this.closed) return;
    this.closed = true;
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = 0;
    try { this.socket?.destroy(); } catch {}
    this.onClose?.(error);
  }
}

/* ---------------- 会话管理 ---------------- */
const sessions = new Map();

function buildSignal(type, liveId, connId, payload = {}) {
  const session = sessions.get(String(liveId)) || null;
  const seq = session ? (session.seq += 1) : 1;
  return JSON.stringify({ type, live_id: String(liveId), conn_id: connId, seq_id: seq, payload });
}

async function startComponentSession({ liveId, clientSecret, character, language = "zh", onEvent = null, viduBase = "", viduKey = "" } = {}) {
  const id = String(liveId);
  if (sessions.has(id)) return sessions.get(id);
  const connId = `srv-${crypto.randomBytes(4).toString("hex")}`;
  const session = {
    liveId: id,
    connId,
    seq: 0,
    ready: false,
    speaking: false,
    history: [],
    character,
    language,
    onEvent,
    ws: null,
  };
  sessions.set(id, session);
  const viduHttpBase = String(viduBase || process.env.VIDU_API_BASE || "https://api.vidu.com").replace(/\/+$/, "");
  const viduWsOrigin = viduHttpBase.replace(/^http:/i, "ws:").replace(/^https:/i, "wss:");
  const wsUrl = new URL(viduWsOrigin + "/live/v1/external-lives/" + encodeURIComponent(id) + "/stream");
  wsUrl.searchParams.set("conn_id", connId);
  if (clientSecret) wsUrl.searchParams.set("client_secret", clientSecret);
  const ws = new MiniWebSocket(wsUrl.toString(), {
    headers: { Authorization: `Token ${viduKey || process.env.VIDU_API_KEY || ""}` },
    onOpen: () => {
      ws.sendText(buildSignal(1, id, connId, { conn_init: { version: 1 } }));
      log("conn_init sent", id);
    },
    onText: (text) => handleServerSignal(session, text),
    onClose: (error) => {
      log("ws closed", id, error?.message || "");
      session.ready = false;
      session.lookPending?.({ success: false, error_code: "PROMPT_OP_LIVE_NOT_ACTIVE" });
      session.onEvent?.({ type: "closed", message: error?.message || "" });
      sessions.delete(id);
    },
  });
  session.ws = ws;
  ws.connect();
  return session;
}

function handleServerSignal(session, text) {
  let message;
  try { message = JSON.parse(text); } catch { return; }
  const type = Number(message?.type || 0);
  const payload = message?.payload || {};
  if (type === 2) {
    const ack = payload.conn_init_ack || {};
    if (ack.success === true) {
      session.ready = true;
      session.onEvent?.({ type: "ready" });
      log("ready", session.liveId);
    } else {
      /* NOT_READY 属正常，稍后重试 conn_init */
      setTimeout(() => session.ws?.sendText(buildSignal(1, session.liveId, session.connId, { conn_init: { version: 1 } })), 2000);
    }
    return;
  }
  if (type === 6) {
    session.lookPending?.({ success: false, error_code: "PROMPT_OP_LIVE_NOT_ACTIVE" });
    session.onEvent?.({ type: "force_hangup", reason: payload.hangup?.hangup_reason || "" });
    return;
  }
  if (type === 12) {
    session.lookPending?.(payload.prompt_operation_ack || {});
  }
}

function stopComponentSession(liveId) {
  const session = sessions.get(String(liveId));
  if (!session) return false;
  try {
    session.lookPending?.({ success: false, error_code: "PROMPT_OP_LIVE_NOT_ACTIVE" });
  } catch {}
  try {
    session.ws?.sendText(buildSignal(5, session.liveId, session.connId, { hangup: { hangup_reason: "user_end" } }));
  } catch {}
  try { session.ws?.close(); } catch {}
  sessions.delete(String(liveId));
  return true;
}

/* ---------------- 我们自己的 LLM ---------------- */
async function componentReply(session, userText) {
  const persona = session.character?.persona || "";
  const name = session.character?.name || "Character";
  const messages = [
    { role: "system", content: `You are roleplaying as ${name}. Character: ${persona}\nReply ONLY in the user's language. Keep replies short (1-3 sentences), natural and in character. Never say you are an AI.` },
    ...session.history.slice(-12),
    { role: "user", content: userText },
  ];
  const base = String(process.env.ARK_BASE_URL || "https://ark.ap-southeast.bytepluses.com/api/v3").replace(/\/+$/, "");
  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.ARK_API_KEY || ""}`, "content-type": "application/json" },
    body: JSON.stringify({ model: process.env.BYTEPLUS_LANGUAGE_MODEL || "ep-20260827122554-8fsgw", messages, max_tokens: 220, temperature: 0.8 }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || `LLM HTTP ${response.status}`);
  const reply = payload?.choices?.[0]?.message?.content || payload?.choices?.[0]?.text || "";
  session.history.push({ role: "user", content: userText }, { role: "assistant", content: reply });
  return reply.trim();
}

/* ---------------- 我们的 TTS（DashScope CosyVoice → 24k PCM） ---------------- */
async function componentSpeechPcm(text, voice) {
  const key = process.env.ALIYUN_DASHSCOPE_API_KEY || process.env.ALIYUN_WAN30_API_KEY || "";
  if (!key) throw new Error("TTS 未配置（缺 ALIYUN_DASHSCOPE_API_KEY）。");
  const base = String(process.env.ALIYUN_DASHSCOPE_BASE_URL || "https://dashscope.aliyuncs.com").replace(/\/+$/, "");
  const model = String(process.env.CHAT_LIVE_TTS_MODEL || "cosyvoice-v1").trim();
  const headers = { authorization: `Bearer ${key}`, "content-type": "application/json" };
  /* 用后台角色里选的音色：CosyVoice 走 speech-synthesis，qwen-tts 走 multimodal-generation */
  const payloads = model.startsWith("cosyvoice")
    ? [{
        url: `${base}/api/v1/services/aigc/text2speech/speech-synthesis`,
        body: { model, input: { text, voice: voice || "longxiaochun" }, parameters: { format: "wav", sample_rate: PCM_SAMPLE_RATE } },
      }]
    : [
        { url: `${base}/api/v1/services/aigc/multimodal-generation/generation`, body: { model, input: { text, voice: voice || "Cherry" } } },
        { url: `${base}/api/v1/services/aigc/text2speech/speech-synthesis`, body: { model: "cosyvoice-v1", input: { text, voice: voice || "longxiaochun" }, parameters: { format: "wav", sample_rate: PCM_SAMPLE_RATE } } },
      ];
  let response = null;
  let payload = {};
  for (const attempt of payloads) {
    response = await fetch(attempt.url, { method: "POST", headers, body: JSON.stringify(attempt.body) });
    payload = await response.json().catch(() => ({}));
    if (response.ok) break;
  }
  if (!response.ok) throw new Error(payload?.message || payload?.error?.message || `TTS HTTP ${response.status}`);
  const audio = payload?.output?.audio;
  const url = typeof audio === "string" ? audio : audio?.url || audio?.data;
  if (!url) throw new Error("TTS 没有返回音频。");
  if (/^https?:/i.test(url)) {
    const file = await fetch(url);
    const buffer = Buffer.from(await file.arrayBuffer());
    /* wav 去掉 44 字节头；裸 pcm 直接用 */
    return buffer.slice(0, 4).toString("latin1") === "RIFF" ? buffer.slice(44) : buffer;
  }
  return Buffer.from(String(url).replace(/^data:[^,]+,/, ""), "base64");
}

/* ---------------- 对外：一轮对话 ---------------- */
async function componentSay(liveId, userText) {
  const session = sessions.get(String(liveId));
  if (!session) throw new Error("会话已结束。");
  if (!session.ready) throw new Error("数字人还在准备，请稍后再试。");
  session.speaking = true;
  session.ws?.sendText(buildSignal(7, session.liveId, session.connId, {}));            /* 打断上一轮 */
  session.ws?.sendText(buildSignal(9, session.liveId, session.connId, { text_msg: { msg_id: `u-${Date.now()}`, content: userText, timestamp: Date.now() } }));
  const reply = await componentReply(session, userText);
  session.ws?.sendText(buildSignal(10, session.liveId, session.connId, { text_msg: { msg_id: `a-${Date.now()}`, content: reply, timestamp: Date.now() } }));
  const pcm = await componentSpeechPcm(reply, session.character?.voiceType);
  session.ws?.sendBinary(pcm);
  session.speaking = false;
  return reply;
}

function componentLookError(code) {
  const message = ({
    PROMPT_OP_PARAM_INVALID: "素材参数不对，换不了。",
    PROMPT_OP_MODEL_NOT_SUPPORTED: "当前数字人不是 vidu-s2，不能换画面。",
    PROMPT_OP_LIVE_NOT_ACTIVE: "会话还没开始或已经结束。",
    PROMPT_OP_IMAGE_TRANSFER_FAILED: "数字人拉不到这张图，请换一张再试。",
    PROMPT_OP_SIP_NOT_CONNECTED: "画面还在准备，请几秒后再试。",
    PROMPT_OP_FAILED: "画面切换失败，请再试一次。",
    LOOK_BUSY: "上一次切换还在处理。",
    LOOK_TIMEOUT: "画面切换超时，请再试一次。",
    LOOK_CHANNEL: "画面通道不可用，请稍后再试。",
  })[String(code || "")] || "画面切换失败，请再试一次。";
  const error = new Error(message);
  error.code = String(code || "PROMPT_OP_FAILED");
  error.statusCode = error.code === "PROMPT_OP_LIVE_NOT_ACTIVE" ? 409 : error.code === "PROMPT_OP_PARAM_INVALID" ? 422 : 502;
  return error;
}

/* 换衣服 / 拿东西 / 换背景。等 type=12，通道不认这条消息就超时失败，不假装成功。 */
function componentApplyLook(liveId, operation = {}) {
  const session = sessions.get(String(liveId));
  if (!session?.ws) return Promise.reject(componentLookError("PROMPT_OP_LIVE_NOT_ACTIVE"));
  if (!session.ready) return Promise.reject(componentLookError("PROMPT_OP_SIP_NOT_CONNECTED"));
  if (session.lookPending) return Promise.reject(componentLookError("LOOK_BUSY"));
  const opType = operation.opType === "remove" ? "remove" : "switch";
  const prompt = { op_type: opType };
  if (opType === "switch") {
    const imageUri = String(operation.imageUrl || "").trim();
    const imageId = String(operation.imageId || "").trim().slice(0, 128);
    const kind = String(operation.kind || "").trim();
    const userText = String(operation.userText || "").trim().slice(0, 200);
    if (!imageUri || !imageId || !["garment", "object", "background"].includes(kind)) {
      return Promise.reject(componentLookError("PROMPT_OP_PARAM_INVALID"));
    }
    prompt.images = [{ image_uri: imageUri, image_id: imageId, kind, user_text: userText }];
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (session.lookPending !== finish) return;
      session.lookPending = null;
      reject(componentLookError("LOOK_TIMEOUT"));
    }, 12000);
    const finish = (ack) => {
      clearTimeout(timer);
      if (session.lookPending === finish) session.lookPending = null;
      if (ack?.success === true) resolve(ack);
      else reject(componentLookError(ack?.error_code || "PROMPT_OP_FAILED"));
    };
    session.lookPending = finish;
    const sent = session.ws.sendText(buildSignal(11, session.liveId, session.connId, { prompt_operation: prompt }));
    if (!sent) {
      clearTimeout(timer);
      session.lookPending = null;
      reject(componentLookError("LOOK_CHANNEL"));
    }
  });
}

module.exports = {
  startComponentSession,
  stopComponentSession,
  componentSay,
  componentApplyLook,
  hasComponentSession: (liveId) => sessions.has(String(liveId)),
};
