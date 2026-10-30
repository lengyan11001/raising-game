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
const fs = require("node:fs");
const path = require("node:path");

const PCM_SAMPLE_RATE = 24000;
const FRAME_BYTES = 960; /* 20ms @24kHz s16le mono */
const FRAME_MS = 20;
const WS_PING_INTERVAL_MS = 15000;

/* 不再推等待音。这段合成轻声会被 Vidu 当成正式口播，回复前先响一段杂音。等待时只靠动作匹配。 */
function buildThinkingPcm() {
  const seconds = 1.8;
  const samples = PCM_SAMPLE_RATE * seconds;
  const pcm = Buffer.alloc(samples * 2);
  const hum = (t, start, end) => {
    if (t < start || t > end) return 0;
    const u = (t - start) / (end - start);
    return Math.sin(Math.PI * u) ** 1.15;
  };
  for (let i = 0; i < samples; i += 1) {
    const t = i / PCM_SAMPLE_RATE;
    const env = Math.max(hum(t, 0.06, 0.38), hum(t, 0.62, 1.05), hum(t, 1.28, 1.62));
    const f0 = 158 + 18 * Math.sin(2 * Math.PI * 2.4 * t);
    const wave = Math.sin(2 * Math.PI * f0 * t) * 0.62
      + Math.sin(2 * Math.PI * f0 * 2.02 * t) * 0.2
      + Math.sin(2 * Math.PI * f0 * 3.05 * t) * 0.07;
    const noise = ((i * 17) % 1000) / 1000 - 0.5;
    const sample = Math.max(-1, Math.min(1, (wave + noise * 0.04) * env * 0.2));
    pcm.writeInt16LE(sample * 32767, i * 2);
  }
  return pcm;
}
const THINKING_PCM = buildThinkingPcm();

function stopThinking(session) {
  if (!session) return;
  if (session.thinkTimer) clearTimeout(session.thinkTimer);
  session.thinkTimer = 0;
}

function startThinking(session, turn) {
  stopThinking(session);
}

function log(...args) {
  console.log("[chat-live-component]", ...args);
}

/* ---------------- 最小 WebSocket 客户端（只能发文本/二进制，收文本/心跳） ---------------- */
class MiniWebSocket {
  constructor(url, { headers = {}, onText, onBinary, onClose, onOpen, ping = true } = {}) {
    this.url = new URL(url);
    this.headers = headers;
    this.onText = onText;
    this.onBinary = onBinary;
    this.onClose = onClose;
    this.onOpen = onOpen;
    this.allowPing = ping !== false;
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
    if (this.allowPing) this.pingTimer = setInterval(() => this.ping(), WS_PING_INTERVAL_MS);
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
      else if (opcode === 0x2 || opcode === 0x0) this.onBinary?.(payload);
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

async function startComponentSession({ liveId, clientSecret, character, language = "zh", onEvent = null, viduBase = "", viduKey = "", memoryBlock = "", userBlock = "", conversationTone = "", engagementBlock = "", spokenPrompt = "", languageModel = "byteplus", site = "" } = {}) {
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
    memoryBlock: String(memoryBlock || ""),
    engagementBlock: String(engagementBlock || ""),
    conversationTone: String(conversationTone || ""),
    spokenPrompt: String(spokenPrompt || ""),
    languageModel: String(languageModel || "byteplus").toLowerCase() === "papaya" ? "papaya" : "byteplus",
    site: String(site || "").toLowerCase(),
    nudgeCount: 0,
    nudgeTimer: 0,
    userBlock: String(userBlock || ""),
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
      scheduleComponentNudge(session, 3000, true);
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

function clearComponentNudge(session) {
  if (!session) return;
  if (session.nudgeTimer) clearTimeout(session.nudgeTimer);
  session.nudgeTimer = 0;
}

function scheduleComponentNudge(session, delayMs = null, opening = false) {
  clearComponentNudge(session);
  if (!session) return;
  if (!opening && (session.nudgeCount || 0) >= 4) return;
  const wait = delayMs == null ? audioRemainingMs(session) + 5000 : delayMs;
  session.nudgeTimer = setTimeout(() => {
    session.nudgeTimer = 0;
    if (!sessions.has(session.liveId) || !session.ready) return;
    if (session.speaking || session.tts || audioRemainingMs(session) > 250) {
      scheduleComponentNudge(session, audioRemainingMs(session) + 5000, opening);
      return;
    }
    if (opening && session.history.length) return;
    if (!opening) session.nudgeCount = (session.nudgeCount || 0) + 1;
    log("nudge start", session.liveId, opening ? "opening" : "silence");
    const userBlock = session.userBlock || "";
    const userInfo = userBlock ? "\n对方资料：" + userBlock.replace(/\n/g, "；") : "";
    const openingMsg = userInfo ? "你好呀！" + userInfo : "你好呀！有什么想聊的吗？";
    componentSay(session.liveId, opening ? openingMsg : "用户沉默了几秒，没有新消息。", { proactive: true, opening }).catch((error) => log("nudge failed", session.liveId, error?.message || error));
  }, Math.max(800, wait));
}

function stopComponentSession(liveId) {
  const session = sessions.get(String(liveId));
  if (!session) return false;
  clearComponentNudge(session);
  try {
    session.lookPending?.({ success: false, error_code: "PROMPT_OP_LIVE_NOT_ACTIVE" });
  } catch {}
  try {
    session.ws?.sendText(buildSignal(5, session.liveId, session.connId, { hangup: { hangup_reason: "user_end" } }));
  } catch {}
  stopThinking(session);
  try { session.tts?.cancel?.(); } catch {}
  session.tts = null;
  session.audioUntil = Date.now();
  session.speakTurn = (session.speakTurn || 0) + 1;
  session.sayEpoch = (session.sayEpoch || 0) + 1;
  session.pendingSays = 0;
  session.sayChain = Promise.resolve();
  try { session.ws?.close(); } catch {}
  sessions.delete(String(liveId));
  return true;
}

/* ---------------- 我们自己的 LLM ---------------- */
const COSY_EMOTIONS = new Set(["neutral", "fearful", "angry", "sad", "surprised", "happy", "disgusted"]);
const EMOTION_ALIAS = {
  neutral: "neutral", calm: "neutral", 平静: "neutral", 中性: "neutral",
  happy: "happy", 开心: "happy", 高兴: "happy", 温柔: "happy", 暧昧: "neutral",
  sad: "sad", 难过: "sad", 委屈: "sad",
  angry: "angry", 生气: "angry",
  fearful: "fearful", 害怕: "fearful",
  surprised: "surprised", 惊讶: "surprised",
  disgusted: "disgusted", 嫌弃: "disgusted",
};

function normalizeEmotion(value) {
  const key = String(value || "").trim().toLowerCase();
  if (COSY_EMOTIONS.has(key)) return key;
  return EMOTION_ALIAS[key] || EMOTION_ALIAS[String(value || "").trim()] || "neutral";
}

const COMPONENT_DELIVERIES = new Set(["casual", "tender", "flirty", "foreplay", "intimate", "aftercare"]);
const DELIVERY_ALIAS = {
  casual: "casual", neutral: "casual", 日常: "casual", 闲聊: "casual",
  tender: "tender", soft: "tender", 温柔: "tender", 关心: "tender",
  flirty: "flirty", flirting: "flirty", flirt: "flirty", teasing: "flirty", 暧昧: "flirty", 调情: "flirty", 撩拨: "flirty",
  foreplay: "foreplay", 前戏: "foreplay", 预热: "foreplay",
  intimate: "intimate", 亲密: "intimate", 缠绵: "intimate", 性爱: "intimate",
  aftercare: "aftercare", 余韵: "aftercare", 事后: "aftercare",
};

function normalizeDelivery(value, stage = "") {
  const key = String(value || "").trim().toLowerCase();
  if (COMPONENT_DELIVERIES.has(key)) return key;
  const alias = DELIVERY_ALIAS[key] || DELIVERY_ALIAS[String(value || "").trim()];
  if (alias) return alias;
  const stageKey = String(stage || "").trim().toLowerCase();
  return COMPONENT_DELIVERIES.has(stageKey) ? stageKey : "casual";
}

function componentContextComparable(value = "") {
  return String(value || "").toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}

function componentContextSimilarity(left = "", right = "") {
  const a = componentContextComparable(left);
  const b = componentContextComparable(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length > b.length ? a : b;
  if (shorter.length >= 4 && longer.includes(shorter)) return shorter.length / longer.length;
  const aPairs = new Set(Array.from({ length: Math.max(0, a.length - 1) }, (_, index) => a.slice(index, index + 2)));
  const bPairs = new Set(Array.from({ length: Math.max(0, b.length - 1) }, (_, index) => b.slice(index, index + 2)));
  if (!aPairs.size || !bPairs.size) return a === b ? 1 : 0;
  const overlap = [...aPairs].filter((pair) => bPairs.has(pair)).length;
  return (2 * overlap) / (aPairs.size + bPairs.size);
}

function componentReplySkeleton(value = "") {
  const compact = componentContextComparable(value);
  return { head: compact.slice(0, 4), tail: compact.slice(-10) };
}

function componentHistoryHasRepeatedScaffold(history = []) {
  const replies = (Array.isArray(history) ? history : []).filter((message) => message?.role === "assistant").map((message) => componentReplySkeleton(message.content)).filter((item) => item.head);
  for (let left = 0; left < replies.length; left += 1) {
    for (let right = left + 1; right < replies.length; right += 1) {
      if (replies[left].head === replies[right].head || replies[left].tail === replies[right].tail) return true;
    }
  }
  return false;
}

function componentHistoryForTurn(history = [], userText = "") {
  const raw = (Array.isArray(history) ? history : []).filter((message) => message && ["user", "assistant"].includes(message.role));
  const list = [];
  for (const message of raw) {
    const previous = list.at(-1);
    if (message.role === "user" && previous?.role === "user" && componentContextSimilarity(previous.content, message.content) >= 0.72) {
      list[list.length - 1] = message;
      continue;
    }
    list.push(message);
  }
  const stale = new Set();
  for (let index = 0; index < list.length; index += 1) {
    if (list[index].role !== "user") continue;
    if (componentContextSimilarity(list[index].content, userText) < 0.72) continue;
    stale.add(index);
    if (list[index + 1]?.role === "assistant") stale.add(index + 1);
  }
  const assistants = list.map((message, index) => ({ message, index })).filter((item) => item.message.role === "assistant");
  const last = assistants.at(-1);
  if (last) {
    const similar = assistants.filter((item) => componentContextSimilarity(item.message.content, last.message.content) >= 0.72);
    if (similar.length >= 2) similar.forEach((item) => stale.add(item.index));
  }
  const filtered = list.filter((_, index) => !stale.has(index));
  const latest = filtered.at(-1);
  const current = latest?.role === "user" ? [latest] : [];
  if (componentHistoryHasRepeatedScaffold(filtered)) return current;
  return [...filtered.slice(0, current.length ? -1 : undefined).slice(-8), ...current];
}

function cleanComponentSay(value = "") {
  return String(value || "")
    .replace(/<\|?channel\|?>[\s\S]*?(?=<\|?\/channel\|?>|$)/gi, " ")
    .replace(/<\|?\/channel\|?>/gi, " ")
    .replace(/<(?:br|\/div|\/p)>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/```(?:json)?[\s\S]*?```/gi, " ")
    .replace(/[（(][^）)]{0,40}[）)]/g, "")
    .replace(/\*[^*]+\*/g, "")
    .replace(/\{\s*$/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseLooseJsonObject(text = "") {
  const value = String(text || "").trim();
  const candidates = [value];
  const start = value.indexOf("{");
  if (start >= 0) candidates.push(value.slice(start));
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim());
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch {}
  }
  const sayMatch = value.match(/"say"\s*:\s*"((?:\\.|[^"\\])*)"/i);
  const actionMatch = value.match(/"action"\s*:\s*"((?:\\.|[^"\\])*)"/i);
  const emotionMatch = value.match(/"emotion"\s*:\s*"((?:\\.|[^"\\])*)"/i);
  const deliveryMatch = value.match(/"delivery"\s*:\s*"((?:\\.|[^"\\])*)"/i);
  if (!sayMatch) return null;
  const decode = (raw = "") => {
    try { return JSON.parse(`"${raw}"`); } catch { return raw.replace(/\\"/g, '"').replace(/\\\\/g, "\\"); }
  };
  return { say: decode(sayMatch[1]), action: actionMatch ? decode(actionMatch[1]) : "", emotion: emotionMatch ? decode(emotionMatch[1]) : "", delivery: deliveryMatch ? decode(deliveryMatch[1]) : "" };
}

function splitComponentSpeech(raw) {
  const text = String(raw || "").trim();
  const parsed = parseLooseJsonObject(text);
  if (parsed) {
    const action = String(parsed.action || parsed.expression || "").replace(/[\r\n]+/g, " ").trim().slice(0, 24);
    return {
      say: cleanComponentSay(parsed.say || parsed.reply || ""),
      action,
      emotion: normalizeEmotion(parsed.emotion || parsed.mood),
      delivery: normalizeDelivery(parsed.delivery || parsed.style || parsed.tone),
      rate: clampNumber(parsed.rate, 0.5, 2, 1),
      volume: clampNumber(parsed.volume, 0, 100, 50),
      pitch: clampNumber(parsed.pitch, 0.5, 2, 1),
    };
  }
  return { say: cleanComponentSay(raw), action: "", emotion: "neutral", delivery: "casual", rate: 1, volume: 50, pitch: 1 };
}

/* ---------------- 口播分轨：可见文本不动，只把独立叫声交给长音合成 ---------------- */
const COMPONENT_VOCAL_TOKENS = ["哈啊", "啊哈", "嗯啊", "唔嗯", "啊", "嗯", "唔", "哈", "呃", "嘶", "呜", "噢", "哦", "呀"];
const COMPONENT_VOCAL_BOUNDARY = /[\s，。！？、；：,.!?;:…—~～"'“”‘’（）()【】\[\]《》<>-]/u;
const COMPONENT_VOCAL_PAUSE = /[\s，。！？、；：,.!?;:…—~～"'“”‘’（）()【】\[\]《》<>-]/u;
const COMPONENT_MOAN_CACHE = new Map();

function componentVocalAt(text, index) {
  for (const token of COMPONENT_VOCAL_TOKENS) {
    if (text.startsWith(token, index)) return token;
  }
  return "";
}

function componentVocalBoundaryAt(text, index) {
  return index < 0 || index >= text.length || COMPONENT_VOCAL_BOUNDARY.test(text[index]);
}

function componentVocalShape(value = "") {
  const text = String(value || "");
  if (/[嘶呃噢哦]/u.test(text)) return "gasp";
  if (/哈/u.test(text)) return "breath";
  if (/[唔嗯呜]/u.test(text)) return "nasal";
  return "open";
}

function componentVocalIntensity(value = "") {
  const text = String(value || "");
  const repeated = (text.match(/[啊嗯唔哈呃嘶呜噢哦呀]/gu) || []).length;
  const breaks = (text.match(/[…—]/gu) || []).length;
  return Math.max(1, Math.min(3, 1 + (repeated > 1 ? 1 : 0) + (breaks > 1 ? 1 : 0)));
}

function splitComponentAudioParts(raw) {
  const text = String(raw || "");
  const parts = [];
  let index = 0;
  let speechStart = 0;
  const pushSpeech = (end) => {
    const value = text.slice(speechStart, end);
    if (!value.trim()) return;
    const previous = parts.at(-1);
    if (previous?.kind === "speech") previous.text += value;
    else parts.push({ kind: "speech", text: value });
  };
  while (index < text.length) {
    if (!componentVocalBoundaryAt(text, index - 1)) {
      index += 1;
      continue;
    }
    const first = componentVocalAt(text, index);
    if (!first) {
      index += 1;
      continue;
    }
    let runEnd = index;
    while (true) {
      const token = componentVocalAt(text, runEnd);
      if (!token) break;
      runEnd += token.length;
      let spacedEnd = runEnd;
      while (spacedEnd < text.length && /[ \t]/u.test(text[spacedEnd])) spacedEnd += 1;
      if (componentVocalAt(text, spacedEnd)) runEnd = spacedEnd;
      else break;
    }
    if (!componentVocalBoundaryAt(text, runEnd)) {
      index += first.length;
      continue;
    }
    let end = runEnd;
    while (end < text.length && COMPONENT_VOCAL_PAUSE.test(text[end])) end += 1;
    const vocalText = text.slice(index, end).trim();
    if (!vocalText) break;
    pushSpeech(index);
    parts.push({ kind: "vocal", text: vocalText, shape: componentVocalShape(vocalText), intensity: componentVocalIntensity(vocalText) });
    index = end;
    speechStart = end;
  }
  pushSpeech(text.length);
  return parts;
}

function componentHash(value = "") {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function componentPausePcm(ms = 80) {
  return Buffer.alloc(Math.max(0, Math.round((Number(ms) || 0) * PCM_SAMPLE_RATE / 1000)) * 2);
}

function decodeComponentWav(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 44 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") return null;
  let offset = 12;
  let format = null;
  let data = null;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = Math.min(buffer.length, start + size);
    if (id === "fmt " && size >= 16) {
      format = {
        audioFormat: buffer.readUInt16LE(start),
        channels: buffer.readUInt16LE(start + 2),
        sampleRate: buffer.readUInt32LE(start + 4),
        bitsPerSample: buffer.readUInt16LE(start + 14),
      };
    } else if (id === "data") {
      data = buffer.slice(start, end);
    }
    offset = start + size + (size % 2);
  }
  if (!format || !data || format.audioFormat !== 1 || format.bitsPerSample !== 16 || format.channels < 1) return null;
  const frames = Math.floor(data.length / (format.channels * 2));
  const mono = new Float32Array(frames);
  for (let frame = 0; frame < frames; frame += 1) {
    let sample = 0;
    for (let channel = 0; channel < format.channels; channel += 1) {
      sample += data.readInt16LE((frame * format.channels + channel) * 2) / 32768;
    }
    mono[frame] = sample / format.channels;
  }
  return { ...format, samples: mono };
}

function resampleComponentPcm(samples, sourceRate, targetRate = PCM_SAMPLE_RATE) {
  if (!samples?.length || !sourceRate) return Buffer.alloc(0);
  const outputLength = Math.max(1, Math.round(samples.length * targetRate / sourceRate));
  const pcm = Buffer.alloc(outputLength * 2);
  for (let index = 0; index < outputLength; index += 1) {
    const source = index * sourceRate / targetRate;
    const left = Math.min(samples.length - 1, Math.floor(source));
    const right = Math.min(samples.length - 1, left + 1);
    const mix = source - left;
    const sample = samples[left] * (1 - mix) + samples[right] * mix;
    pcm.writeInt16LE(Math.max(-1, Math.min(1, sample)) * 32767, index * 2);
  }
  return pcm;
}

function componentMoanDirs() {
  const configured = String(process.env.CHAT_LIVE_MOAN_DIR || "").trim();
  return configured ? [configured] : [path.join(__dirname, "assets", "chat-live", "moans")];
}

function componentMoanSample(voice, shape, intensity = 1) {
  const dirs = componentMoanDirs();
  const safeVoice = String(voice || "default").replace(/[^\w.-]+/g, "_").slice(0, 100);
  const safeShape = String(shape || "open").replace(/[^\w.-]+/g, "_").slice(0, 40);
  const level = Math.max(1, Math.min(3, Math.round(Number(intensity) || 1)));
  const names = [
    `${safeVoice}-${safeShape}-${level}.wav`,
    `${safeVoice}-${safeShape}.wav`,
    `${safeShape}-${level}.wav`,
    `${safeShape}.wav`,
    `${safeVoice}.wav`,
  ];
  for (const dir of dirs) {
    for (const name of names) {
      const file = path.join(dir, name);
      const cacheKey = `${file}:${safeShape}:${level}`;
      if (COMPONENT_MOAN_CACHE.has(cacheKey)) return COMPONENT_MOAN_CACHE.get(cacheKey);
      try {
        const decoded = decodeComponentWav(fs.readFileSync(file));
        if (!decoded) continue;
        const pcm = resampleComponentPcm(decoded.samples, decoded.sampleRate);
        if (pcm.length >= PCM_SAMPLE_RATE * 0.25) {
          COMPONENT_MOAN_CACHE.set(cacheKey, pcm);
          return pcm;
        }
      } catch {}
    }
  }
  return null;
}

function componentNormalizePcm(pcm, targetPeak = 13500) {
  if (!pcm?.length) return pcm;
  let peak = 0;
  for (let index = 0; index < pcm.length; index += 2) {
    peak = Math.max(peak, Math.abs(pcm.readInt16LE(index)));
  }
  if (!peak) return pcm;
  const gain = Math.max(0.25, Math.min(2.2, targetPeak / peak));
  if (Math.abs(gain - 1) < 0.02) return pcm;
  const out = Buffer.from(pcm);
  for (let index = 0; index < out.length; index += 2) {
    out.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(out.readInt16LE(index) * gain))), index);
  }
  return out;
}

function componentVocalVariant(voice, shape, intensity, text) {
  const base = componentMoanSample(voice, shape, intensity);
  if (!base) return null;
  // Keep the recorded performance intact. Re-sampling, rotating, or looping an
  // already emotional vocal creates the mechanical "乌拉乌拉" effect.
  const seed = componentHash(`${voice}:${shape}:${intensity}:${text}`);
  return componentNormalizePcm(base, 11800 + (seed % 3) * 500);
}

function buildComponentVocalPcm(part, voice = "longanyang") {
  const text = String(part?.text || part || "");
  const shape = part?.shape || componentVocalShape(text);
  const intensity = Math.max(1, Math.min(3, Number(part?.intensity) || componentVocalIntensity(text)));
  const sampled = componentVocalVariant(voice, shape, intensity, text);
  if (sampled) return sampled;
  const seed = componentHash(`${voice}:${text}:${shape}:${intensity}`);
  let randomState = seed || 1;
  const rand = () => {
    let value = randomState = (randomState + 0x9e3779b9) >>> 0;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return (value >>> 0) / 4294967296;
  };
  const baseDuration = shape === "gasp" ? 0.46 : shape === "nasal" ? 0.56 : 0.64;
  const duration = Math.min(1.15, baseDuration + intensity * 0.1 + (seed % 11) / 100);
  const length = Math.round(duration * PCM_SAMPLE_RATE);
  const pcm = Buffer.alloc(length * 2);
  const femaleBias = /(?:huan|qi|xia|yue|nan|meng|tian|wei|jing|lin|xin|yao)/i.test(String(voice || "")) ? 1 : 0.82;
  const basePitch = (shape === "gasp" ? 205 : shape === "nasal" ? 188 : 205) * femaleBias + (seed % 31) - 15;
  const formants = shape === "nasal" || /唔|嗯|呜/u.test(text)
    ? [350, 1050, 2250]
    : shape === "gasp"
      ? [620, 1400, 2500]
      : [760, 1280, 2650];
  const harmonicLevel = shape === "gasp" ? 0.42 : shape === "nasal" ? 0.7 : 0.78;
  let phase = 0;
  let noiseState = 0;
  for (let index = 0; index < length; index += 1) {
    const t = index / PCM_SAMPLE_RATE;
    const u = index / Math.max(1, length - 1);
    const attack = Math.min(1, u / 0.075);
    const release = Math.min(1, (1 - u) / 0.3);
    const envelope = Math.sin(Math.PI / 2 * Math.max(0, Math.min(1, attack))) * Math.sin(Math.PI / 2 * Math.max(0, Math.min(1, release)));
    const arch = Math.sin(Math.PI * u) ** 0.34;
    const tremolo = 1 + (0.045 + intensity * 0.018) * Math.sin(2 * Math.PI * (3.8 + intensity * 0.55) * t + (seed % 1000) / 50000);
    const f0 = basePitch * (0.9 + arch * 0.2 - u * 0.1) * tremolo
      + Math.sin(2 * Math.PI * (4.7 + intensity * 0.35) * t) * (2.5 + intensity);
    phase += 2 * Math.PI * f0 / PCM_SAMPLE_RATE;
    let tonal = 0;
    for (let harmonic = 1; harmonic <= 11; harmonic += 1) {
      const frequency = f0 * harmonic;
      const first = 1 / (1 + ((frequency - formants[0]) / 240) ** 2);
      const second = 1 / (1 + ((frequency - formants[1]) / 420) ** 2);
      const third = 1 / (1 + ((frequency - formants[2]) / 720) ** 2);
      const weight = (0.1 + first * 0.64 + second * 0.36 + third * 0.13) / Math.pow(harmonic, 0.62);
      tonal += Math.sin(phase * harmonic) * weight;
    }
    const rawNoise = rand() * 2 - 1;
    noiseState = noiseState * 0.82 + rawNoise * 0.18;
    const breath = (rawNoise * 0.55 + noiseState * 0.45) * (shape === "gasp" ? 0.16 : 0.055 + intensity * 0.012) * arch;
    const sample = Math.tanh((tonal * harmonicLevel + breath) * envelope * (0.6 + intensity * 0.1));
    pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, sample)) * 32767), index * 2);
  }
  return pcm;
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function pcmDurationMs(bytes) {
  const size = Number(bytes || 0);
  if (!size) return 0;
  return Math.ceil((size / (PCM_SAMPLE_RATE * 2)) * 1000);
}

function audioRemainingMs(session) {
  return Math.max(0, (session?.audioUntil || 0) - Date.now());
}

function noteSpokenAudio(session, pcm) {
  const ms = pcmDurationMs(pcm?.length) + 350;
  const start = Math.max(Date.now(), session.audioUntil || 0);
  session.audioUntil = start + ms;
}

function cancelComponentSpeech(session) {
  if (!session) return;
  try { session.tts?.cancel?.(); } catch {}
  session.tts = null;
  session.audioUntil = Date.now();
  try { session.ws?.sendText(buildSignal(7, session.liveId, session.connId, {})); } catch {}
}

async function componentReply(session, userText, options = {}) {
  const persona = session.character?.persona || "";
  const name = session.character?.name || "Character";
  const proactive = options.proactive === true;
  const opening = options.opening === true;
  const userBlock = session.userBlock || "";
  const storyBlock = options.storyBlock || "";
  const stage = normalizeDelivery(options.stage || session.liveStoryStage || "", options.stage || session.liveStoryStage || "");
  const userInfo = userBlock ? "\n对方资料：" + userBlock.replace(/\n/g, "；") : "";
  const cue = opening
    ? "刚接通。用一两句自然的话根据对方资料打招呼，可以根据对方的名字称呼ta，不要自我介绍，不要提礼物，不要开新剧情，说完就停。" + userInfo
    : proactive
      ? "用户没接话。用一句短话接上次的话题，不要重复上一句，不要自我介绍，不要另起剧情。"
      : "先回用户刚说的这句。不要铺气氛，不要改话题。";
  const explicitIntimate = session.site === "live" && /(?:龟头|鸡巴|阴茎|阴道|肛门|里面|进去|插入|顶到|抽插|操|干你|舔|含住|夹紧|射|高潮|湿了|淫水|汁水|撑开|挤进|弄我|摸我|亲我|吻我|脱掉|蹭|磨|疼|轻点|慢点|快点|叫床|叫出来)/u.test(String(userText || ""));
  const flirtyContext = session.site === "live" && /(?:想你|喜欢你|心动|暧昧|撩|调情|诱惑|想要你|靠近|抱|亲|吻|耳边|轻声|低声|喘|呼吸|睡衣|夜色|陪我|今晚|别躲|看着我|脸红|害羞|心跳)/u.test(String(userText || ""));
  const intimateCue = explicitIntimate
    ? "当前是被插入、被顶弄的场景。说话的人是承受这一下的那一方，不是旁观、验收或指挥的人。直接反应这一下，不要用“唔……哈”“嗯……哈”做固定开头，不要评价对方的能力、表现、诚意、节奏或进度。叫声、气音、被撞断的半句话和身体感受要跟着动作变化，不要套同一条模板。"
    : flirtyContext || ["flirty", "foreplay", "intimate", "aftercare"].includes(stage)
      ? "当前是带暧昧张力的私下互动，不是客服闲聊。台词要像真的在对喜欢的人低声说话：有试探、停顿、留白和克制的吸引；不要解释气氛，不要播音腔。是否露骨由当前场景决定，但不能把暧昧说成普通开心或礼貌回应。"
      : "";
  const stageCue = stage === "intimate"
    ? "当前表演阶段是亲密阶段。每一句都要贴近、低声、带气息和暧昧张力，语速偏慢并允许自然停顿；保持角色本人性格，不要变成通用娇喘模板。"
    : stage === "foreplay"
      ? "当前表演阶段是前戏阶段。用贴近、试探、克制的暧昧语气说，慢一点，留出呼吸和停顿，不要提前演成机械叫床。"
      : stage === "flirty"
        ? "当前表演阶段是暧昧阶段。语气要像私下撩拨，轻声、慢一点、带暗示和留白，不要用普通闲聊的平直语气。"
        : stage === "aftercare"
          ? "当前表演阶段是余韵阶段。声音轻、贴近、带一点疲倦和依恋，停顿自然，不要退回播音腔。"
          : "";
  const jsonTail = "输出必须是一行 JSON，不要 markdown：{\"say\":\"要说出口的话\",\"action\":\"\",\"emotion\":\"neutral\",\"delivery\":\"casual\",\"rate\":1,\"volume\":50,\"pitch\":1}。say 只写会说出口的话。action 留空。emotion 只能是 neutral、happy、sad、surprised、angry、fearful、disgusted 之一。delivery 只能是 casual、tender、flirty、foreplay、intimate、aftercare 之一，按当前阶段和这句话选择。rate 0.5 到 2，volume 0 到 100，pitch 0.5 到 2，按这一句自己定。";
  const strategyBlock = [
    "读懂用户这句话实际在做什么：提问就回答，提出偏好就照做，讲述动作就作为接收方反应，把主动权交给角色就主动推进一个动作；人设只决定态度和说话方式，不能拿来躲避配合。",
    "先决定回复功能，再决定措辞。不要反问用户同一个请求，不要把用户对角色做的事改写成用户命令，不要沿用上一条回复的句式、威胁、收尾或动作顺序。",
    "禁止把回复写成重复的条件威胁结构（例如连续使用“既然……”“你要是……”“我就要把你……”）。先说出动作、回答或感受，再按角色态度收住。",
  ].join("\n");
  const basePrompt = session.spokenPrompt || `You are ${name}, chatting with the user by text message.\nCharacter background (reference only): ${persona}\n${session.conversationTone || ""}`;
  const messages = [
    { role: "system", content: `${basePrompt}\n${strategyBlock}\n${stageCue}\n${intimateCue}\n${storyBlock}\n${cue}\n${jsonTail}` },
    ...componentHistoryForTurn(session.history, proactive ? "" : userText),
    { role: "user", content: proactive ? "（对方没接话）" : userText },
  ];
  const usePapaya = session.languageModel === "papaya";
  const base = usePapaya
    ? String(process.env.MULEROUTER_API_BASE || "https://api.mulerouter.ai").replace(/\/+$/, "") + "/vendors/openai/v1"
    : String(process.env.ARK_BASE_URL || "https://ark.ap-southeast.bytepluses.com/api/v3").replace(/\/+$/, "");
  const key = usePapaya ? String(process.env.MULEROUTER_API_KEY || "").trim() : String(process.env.ARK_API_KEY || "");
  if (!key) throw new Error(usePapaya ? "Papaya is not configured." : "BytePlus language model is not configured.");
  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      accept: "application/json",
      "user-agent": "raising-game-demo/chat-live",
    },
    body: JSON.stringify({
      model: usePapaya ? "carrothub-papaya-1.0" : (process.env.BYTEPLUS_LANGUAGE_MODEL || "ep-20260827122554-8fsgw"),
      messages,
      max_tokens: 700,
      temperature: intimateCue ? 0.92 : 0.82,
      top_p: 0.92,
      frequency_penalty: intimateCue ? 0.92 : 0.72,
      presence_penalty: intimateCue ? 0.82 : 0.65,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || `LLM HTTP ${response.status}`);
  const reply = payload?.choices?.[0]?.message?.content || payload?.choices?.[0]?.text || "";
  const speech = splitComponentSpeech(reply);
  if (!speech.say || (/^[\s\p{P}\p{S}]+$/u.test(speech.say) && speech.say.length < 3)) {
    speech.say = proactive ? "嗯。" : "你说。";
  }
  session.history.push({ role: "user", content: userText }, { role: "assistant", content: speech.say });
  if (session.history.length > 36) session.history.splice(0, session.history.length - 36);
  return speech;
}

/* ---------------- 组件 TTS：新加坡 CosyVoice v3 流式 PCM ---------------- */
function dashscopeWorkspaceId() {
  const explicit = String(process.env.CHAT_LIVE_TTS_WORKSPACE || "").trim();
  if (explicit) return explicit;
  try {
    const host = new URL(String(process.env.ALIYUN_DASHSCOPE_BASE_URL || "")).hostname;
    const id = host.split(".")[0];
    if (id.startsWith("ws-")) return id;
  } catch {}
  return "ws-q23damt9qmyo1rd9";
}

function openCosyvoicePcmStream(voice, model, onPcm, options = {}) {
  const key = process.env.ALIYUN_DASHSCOPE_API_KEY || "";
  const workspace = dashscopeWorkspaceId();
  const region = String(process.env.CHAT_LIVE_TTS_REGION || "ap-southeast-1").trim() || "ap-southeast-1";
  const url = `wss://${workspace}.${region}.maas.aliyuncs.com/api-ws/v1/inference`;
  const taskId = crypto.randomUUID();
  const voiceName = String(voice || "longanyang").trim() || "longanyang";
  const queue = [];
  let started = false;
  let finishedSent = false;
  let finishRequested = false;
  let cancelled = false;
  let bytes = 0;
  let continueTaskCount = 0;
  let settled = false;
  let resolveDone;
  let rejectDone;
  const done = new Promise((resolve, reject) => { resolveDone = resolve; rejectDone = reject; });
  const finish = (error) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    try { ws.close(); } catch {}
    if (error && !cancelled) rejectDone(error);
    else resolveDone(bytes);
  };
  const pump = () => {
    if (!started || cancelled || settled) return;
    while (queue.length) {
      const text = queue.shift();
      continueTaskCount += 1;
      ws.sendText(JSON.stringify({
        header: { action: "continue-task", task_id: taskId, streaming: "duplex" },
        payload: { input: { text } },
      }));
    }
    if (finishRequested && !finishedSent) {
      finishedSent = true;
      ws.sendText(JSON.stringify({
        header: { action: "finish-task", task_id: taskId, streaming: "duplex" },
        payload: { input: {} },
      }));
    }
  };
  const ws = new MiniWebSocket(url, {
    ping: false,
    headers: {
      Authorization: `Bearer ${key}`,
      "X-DashScope-WorkSpace": workspace,
    },
    onText: (raw) => {
      let message;
      try { message = JSON.parse(raw); } catch { return; }
      const header = message.header || {};
      const event = header.event;
      if (event === "task-started") {
        started = true;
        pump();
      } else if (event === "task-finished") {
        if (!bytes && !cancelled) finish(new Error("TTS 没有返回音频。"));
        else finish(null);
      } else if (event === "task-failed") {
        finish(new Error(header.error_message || header.error_code || "TTS 失败。"));
      }
    },
    onBinary: (chunk) => {
      if (!chunk?.length || cancelled) return;
      bytes += chunk.length;
      try { onPcm(Buffer.from(chunk)); } catch (error) { log("pcm forward failed", error.message); }
    },
    onOpen: () => {
      const sent = ws.sendText(JSON.stringify({
        header: { action: "run-task", task_id: taskId, streaming: "duplex" },
        payload: {
          task_group: "audio",
          task: "tts",
          function: "SpeechSynthesizer",
          model,
          parameters: {
            text_type: "PlainText",
            voice: voiceName,
            format: "pcm",
            sample_rate: PCM_SAMPLE_RATE,
            rate: Number(options.rate) > 0 ? Number(options.rate) : 0.94,
            volume: Number.isFinite(Number(options.volume)) ? Number(options.volume) : 50,
            pitch: Number(options.pitch) > 0 ? Number(options.pitch) : 1,
            ...(options.ssml ? { enable_ssml: true } : {}),
          },
          input: {},
        },
      }));
      if (!sent) finish(new Error("TTS 连接失败。"));
    },
    onClose: (error) => {
      if (!settled) finish(cancelled ? null : (error || new Error("TTS 连接中断。")));
    },
  });
  const timer = setTimeout(() => finish(new Error("TTS 超时。")), 20000);
  ws.connect();
  return {
    pushText(text) {
      const chunk = String(text || "");
      if (!chunk || cancelled) return;
      if (options.ssml && (queue.length || continueTaskCount)) {
        finish(new Error("SSML 模式只允许发送一次 continue-task。"));
        return;
      }
      queue.push(chunk);
      pump();
    },
    finish() {
      finishRequested = true;
      pump();
    },
    cancel() {
      cancelled = true;
      finish(null);
    },
    done,
    get bytes() { return bytes; },
  };
}

function cosyvoiceWsPcm(text, voice, model, options = {}) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const stream = openCosyvoicePcmStream(voice, model, (chunk) => chunks.push(chunk), options);
    options.onStream?.(stream);
    stream.pushText(text);
    stream.finish();
    stream.done.then((bytes) => {
      if (!bytes) reject(new Error("TTS 没有返回音频。"));
      else resolve(Buffer.concat(chunks));
    }).catch(reject);
  });
}

function speechDelivery(speech = {}) {
  const emotion = normalizeEmotion(speech.emotion);
  const stageDelivery = normalizeDelivery(speech.stage);
  const delivery = stageDelivery === "casual"
    ? normalizeDelivery(speech.delivery)
    : stageDelivery;
  const explicitRate = Number(speech.rate);
  const explicitVolume = Number(speech.volume);
  const explicitPitch = Number(speech.pitch);
  const rate = clampNumber(speech.rate, 0.5, 2, 1);
  const volume = Math.round(clampNumber(speech.volume, 0, 100, 50));
  const pitch = clampNumber(speech.pitch, 0.5, 2, 1);
  let instruction = "";
  if (delivery === "intimate") {
    instruction = "这是亲密场景中的私下耳语，不是闲聊或朗读。贴近对方耳边低声说，气息自然、轻微断续，语速慢一些并留出真实停顿；声音收住但要有暧昧、吸引和克制的欲望。保持角色原本的音色和性格，不要播音腔，不要整句平铺，不要夸张叫床或刻意拖音。";
  } else if (delivery === "foreplay") {
    instruction = "这是前戏中的暧昧耳语，不是普通聊天。音量压低，像贴近对方说话，语速稍慢，带有试探、呼吸和若即若离的停顿；要有吸引力，但不要机械娇喘，也不要夸张叫床。保持角色原本的说话习惯。";
  } else if (delivery === "flirty") {
    instruction = "这是私下暧昧撩拨，不是客服式口播。轻声、慢一点，像靠近对方耳边说话；语气带一点笑意、试探和留白，让暧昧张力自然出现。不要播音腔，不要平铺直叙，也不要夸张叫床。保持角色原本的音色和性格。";
  } else if (delivery === "aftercare") {
    instruction = "这是亲密之后的余韵，不是朗读。声音轻而贴近，语速稍慢，带一点疲倦、依恋和自然呼吸；停顿柔和，保持角色原本的音色和性格，不要播音腔。";
  } else if (delivery === "tender") {
    instruction = "用温柔、贴近的私下语气说这句话，声音自然，句子之间有轻微停顿；不要播音腔，保持角色原本的音色和性格。";
  } else if (emotion !== "neutral") {
    instruction = `你正在和对方私下聊天，说话的情感是${emotion}。保持角色原本的音色，像真人自然开口，不要播音腔。`;
  }
  const styledRate = delivery === "intimate" || delivery === "foreplay"
    ? Math.max(0.72, Math.min(rate, explicitRate > 0 ? 0.9 : 0.86))
    : delivery === "flirty" || delivery === "aftercare"
      ? Math.max(0.78, Math.min(rate, explicitRate > 0 ? 0.94 : 0.9))
      : rate;
  const styledVolume = delivery === "intimate" || delivery === "foreplay" || delivery === "flirty"
    ? Math.min(volume, explicitVolume >= 0 ? 52 : 46)
    : volume;
  const styledPitch = delivery === "intimate" || delivery === "foreplay"
    ? Math.min(pitch, explicitPitch > 0 ? 0.98 : 0.95)
    : delivery === "flirty"
      ? Math.min(pitch, explicitPitch > 0 ? 1.01 : 0.98)
      : pitch;
  return {
    emotion,
    delivery,
    rate: styledRate,
    volume: styledVolume,
    pitch: styledPitch,
    instruction,
  };
}

/* CosyVoice v3 flash only applies the documented Instruct grammar to voices
 * that advertise Instruct support. longyingtao_v3 does not. Express the
 * controlled delivery with supported SSML prosody instead of silently
 * accepting an instruction and synthesizing flat speech. */
function speechSsml(text, options = {}) {
  const delivery = speechDelivery(options);
  const raw = String(text || "");
  if (!raw.trim()) return "";
  const escape = (value) => String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
  const rate = String(delivery.rate);
  const pitch = String(delivery.pitch);
  const volume = String(delivery.volume);
  const pauseMs = delivery.delivery === "intimate" || delivery.delivery === "foreplay"
    ? 260
    : delivery.delivery === "flirty" || delivery.delivery === "aftercare"
      ? 190
      : 0;
  let body = escape(raw);
  if (pauseMs) {
    body = body
      .replace(/([，,])/g, `$1<break time="${pauseMs}ms"/>`)
      .replace(/([。！？!?…]+)/g, `$1<break time="${Math.round(pauseMs * 0.8)}ms"/>`);
  }
  return `<speak rate="${rate}" pitch="${pitch}" volume="${volume}">${body}</speak>`;
}

async function componentSpeechPcm(text, voice, options = {}) {
  const key = process.env.ALIYUN_DASHSCOPE_API_KEY || process.env.ALIYUN_WAN30_API_KEY || "";
  if (!key) throw new Error("TTS 未配置（缺 ALIYUN_DASHSCOPE_API_KEY）。");
  const model = "cosyvoice-v3-flash";
  const requested = String(voice || "").trim() || "longanyang";
  const delivery = speechDelivery(options);
  let stream = null;
  try {
    return await cosyvoiceWsPcm(text, requested, model, {
      rate: delivery.rate,
      volume: delivery.volume,
      pitch: delivery.pitch,
      ssml: delivery.instruction ? speechSsml(text, options) : "",
      onStream(next) { stream = next; options.onStream?.(next); },
    });
  } catch (error) {
    if (stream) options.onStream?.(null);
    log("tts voice failed", requested, delivery.delivery, error.message);
    throw error;
  }
}

function pcm16MonoWav(pcm, sampleRate = PCM_SAMPLE_RATE) {
  const audio = Buffer.isBuffer(pcm) ? pcm : Buffer.from(pcm || []);
  if (!audio.length) throw new Error("PCM 音频为空。");
  const rate = Math.max(8000, Math.min(192000, Math.round(Number(sampleRate) || PCM_SAMPLE_RATE)));
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + audio.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(audio.length, 40);
  return Buffer.concat([header, audio]);
}

async function componentVoicePreviewWav(text, voice, options = {}) {
  const pcm = await componentSpeechPcm(text, voice, options);
  return pcm16MonoWav(pcm, PCM_SAMPLE_RATE);
}

async function componentReplyPcm(reply, voice, options = {}) {
  const text = String(reply || "").trim();
  const parts = splitComponentAudioParts(text);
  const hasVocal = parts.some((part) => part.kind === "vocal");
  const speechPcm = options.speechPcm || componentSpeechPcm;
  if (!hasVocal) {
    return {
      pcm: await speechPcm(text, voice, options),
      parts,
      segmented: false,
    };
  }
  const chunks = [];
  let speechParts = 0;
  let vocalParts = 0;
  let previousKind = "";
  for (const part of parts) {
    if (options.shouldContinue && !options.shouldContinue()) {
      return { pcm: Buffer.alloc(0), parts, segmented: true, cancelled: true };
    }
    if (part.kind === "vocal") {
      // Consecutive reactions should feel like breaths in the same moment,
      // not separate clips with a long gap between them.
      if (chunks.length && chunks.at(-1)?.length) chunks.push(componentPausePcm(previousKind === "vocal" ? 45 : 55));
      chunks.push(buildComponentVocalPcm(part, voice));
      chunks.push(componentPausePcm(35));
      vocalParts += 1;
      previousKind = "vocal";
      continue;
    }
    const speech = String(part.text || "").trim();
    if (!speech) continue;
    const pcm = await speechPcm(speech, voice, options);
    if (options.shouldContinue && !options.shouldContinue()) {
      return { pcm: Buffer.alloc(0), parts, segmented: true, cancelled: true };
    }
    if (previousKind === "vocal") chunks.push(componentPausePcm(40));
    chunks.push(pcm);
    chunks.push(componentPausePcm(60));
    speechParts += 1;
    previousKind = "speech";
  }
  const pcm = Buffer.concat(chunks);
  if (!pcm.length) throw new Error("TTS 没有返回音频。");
  log("tts segmented", { speechParts, vocalParts, pcmMs: pcmDurationMs(pcm.length) });
  return { pcm, parts, segmented: true };
}
/* ---------------- 对外：一轮对话 ---------------- */
function componentNotReady(message = "还在接通，这句话还没发出去。") {
  const error = new Error(message);
  error.code = "CHAT_LIVE_NOT_READY";
  error.statusCode = 409;
  return error;
}

async function waitComponentReady(liveId, timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const session = sessions.get(String(liveId));
    if (!session) throw new Error("会话已结束。");
    if (session.ready) return session;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw componentNotReady();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

async function componentSay(liveId, userText, options = {}) {
  const session = await waitComponentReady(liveId);
  if (options.proactive === true) return runComponentSay(session, userText, options);
  const epoch = session.sayEpoch || 0;
  session.pendingSays = (session.pendingSays || 0) + 1;
  const previous = session.sayChain || Promise.resolve();
  const current = previous.catch(() => {}).then(async () => {
    try {
      if ((session.sayEpoch || 0) !== epoch || !sessions.has(String(liveId))) return "";
      return await runComponentSay(session, userText, options);
    } finally {
      session.pendingSays = Math.max(0, (session.pendingSays || 1) - 1);
    }
  });
  session.sayChain = current.then(() => {}, () => {});
  return current;
}

async function runComponentSay(session, userText, options = {}) {
  const liveId = session.liveId;
  const proactive = options.proactive === true;
  if (!sessions.has(String(liveId))) return "";
  clearComponentNudge(session);
  if (proactive && (session.pendingSays || session.speaking || session.tts || audioRemainingMs(session) > 250)) {
    scheduleComponentNudge(session, audioRemainingMs(session) + 5000, options.opening === true);
    return "";
  }
  if (!proactive) session.nudgeCount = 0;
  const turn = (session.speakTurn || 0) + 1;
  session.speakTurn = turn;
  session.speaking = true;
  stopThinking(session);
  if (!proactive) {
    session.ws?.sendText(buildSignal(9, session.liveId, session.connId, { text_msg: { msg_id: `u-${Date.now()}`, content: userText, timestamp: Date.now() } }));
  }
  startThinking(session, turn);
  try {
    if (options.memoryBlock) session.memoryBlock = String(options.memoryBlock);
    if (options.userBlock) session.userBlock = String(options.userBlock);
    if (options.engagementBlock) session.engagementBlock = String(options.engagementBlock);
    if (options.stage) session.liveStoryStage = String(options.stage);
    const speech = await componentReply(session, userText, {
      proactive,
      opening: options.opening === true,
      storyBlock: options.storyBlock,
      stage: options.stage || session.liveStoryStage || "",
    });
    const reply = speech.say;
    const action = speech.action;
    if (session.speakTurn !== turn) return reply;
    const componentVoice = session.character?.componentVoiceType || (session.character?.voiceProvider === "dashscope_cosyvoice" ? session.character?.voiceType : "") || "longanyang";
    const ttsOptions = {
      emotion: speech.emotion,
      delivery: speech.delivery,
      stage: options.stage || session.liveStoryStage || "",
      rate: speech.rate,
      volume: speech.volume,
      pitch: speech.pitch,
      shouldContinue: () => session.speakTurn === turn && sessions.has(String(liveId)),
      onStream(stream) {
        if (!stream) {
          session.tts = null;
          return;
        }
        if (session.speakTurn !== turn) {
          stream.cancel();
          return;
        }
        session.tts = stream;
      },
    };
    let pcm;
    try {
      pcm = (await componentReplyPcm(reply, componentVoice, ttsOptions)).pcm;
    } catch (error) {
      if (session.speakTurn !== turn || !sessions.has(String(liveId))) return reply;
      log("tts segmented fallback", session.liveId, error.message);
      pcm = await componentSpeechPcm(reply, componentVoice, ttsOptions);
    }
    if (session.tts) session.tts = null;
    if (session.speakTurn !== turn || !sessions.has(String(liveId))) return reply;
    const remain = audioRemainingMs(session);
    if (remain > 80) await sleep(remain);
    if (session.speakTurn !== turn || !sessions.has(String(liveId))) return reply;
    stopThinking(session);
    /* 动作字段发给 Vidu（如果有的话）。组件版 type=10 的 text_msg 可以带 action。 */
    if (action) {
      log("action sent to Vidu", session.liveId, action);
      session.ws?.sendText(buildSignal(10, session.liveId, session.connId, { text_msg: { msg_id: `a-${Date.now()}`, content: reply, timestamp: Date.now(), action: action } }));
    }
    if (!action) {
      session.ws?.sendText(buildSignal(10, session.liveId, session.connId, { text_msg: { msg_id: `a-${Date.now()}`, content: reply, timestamp: Date.now() } }));
    }
    session.ws?.sendBinary(pcm);
    noteSpokenAudio(session, pcm);
    log("spoken", session.liveId, proactive ? "nudge" : "reply", speech.emotion || "neutral", speech.rate, speech.volume, speech.pitch, pcmDurationMs(pcm.length));
    if (proactive) log("nudge spoken", session.liveId, String(reply || "").length);
    return reply;
  } finally {
    if (session.speakTurn === turn) {
      stopThinking(session);
      session.speaking = false;
      session.tts = null;
      scheduleComponentNudge(session, audioRemainingMs(session) + 5000);
    }
  }
}

function componentLookError(code) {
  const message = ({
    PROMPT_OP_PARAM_INVALID: "素材参数不对，换不了。",
    PROMPT_OP_MODEL_NOT_SUPPORTED: "当前通话不支持换画面。",
    PROMPT_OP_LIVE_NOT_ACTIVE: "会话还没开始或已经结束。",
    PROMPT_OP_IMAGE_TRANSFER_FAILED: "这张图暂时用不了，请换一张再试。",
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
  __test: {
    splitComponentAudioParts,
    buildComponentVocalPcm,
    componentReplyPcm,
    componentSpeechPcm,
    componentVoicePreviewWav,
    pcm16MonoWav,
    splitComponentSpeech,
    cleanComponentSay,
    componentMoanSample,
    pcmDurationMs,
    normalizeDelivery,
    speechDelivery,
    speechSsml,
  },
};
