"use strict";

const crypto = require("node:crypto");
const tls = require("node:tls");

const TOKEN_TTL_MS = 6 * 60 * 60 * 1000;
const FRAME_BYTES = 960;
const MAX_TEXT_BYTES = 64 * 1024;
const MAX_BINARY_BYTES = 256 * 1024;

let relaySecret = "";
let sessionReader = null;
let credentialsReader = null;
const activeRelays = new Map();

function configure(options = {}) {
  if (options.secret) relaySecret = String(options.secret);
  if (typeof options.getSession === "function") sessionReader = options.getSession;
  if (typeof options.credentialsForRegion === "function") credentialsReader = options.credentialsForRegion;
}

function sign(encoded) {
  return crypto.createHmac("sha256", relaySecret).update(`vidu-live-relay:${encoded}`).digest("base64url");
}

function makeToken(session = {}, ttlMs = TOKEN_TTL_MS) {
  if (!relaySecret) throw new Error("relay secret is not configured");
  const now = Date.now();
  const payload = {
    kind: "compute-relay",
    sessionId: String(session.id || ""),
    merchantUserId: String(session.userId || ""),
    externalUserId: String(session.externalUserId || ""),
    characterId: String(session.characterId || ""),
    iat: now,
    exp: now + Math.max(60 * 1000, Math.min(12 * 60 * 60 * 1000, Number(ttlMs) || TOKEN_TTL_MS)),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `vlr1.${encoded}.${sign(encoded)}`;
}

function readToken(token = "") {
  if (!relaySecret) return null;
  const parts = String(token || "").split(".");
  if (parts.length !== 3 || parts[0] !== "vlr1") return null;
  const expected = sign(parts[1]);
  const actual = parts[2];
  if (actual.length !== expected.length) return null;
  try {
    if (!crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected))) return null;
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    if (!payload || payload.kind !== "compute-relay" || Number(payload.exp || 0) < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

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
    this.upgraded = false;
    this.pingTimer = 0;
  }

  connect() {
    const key = crypto.randomBytes(16).toString("base64");
    const port = this.url.port ? Number(this.url.port) : 443;
    this.socket = tls.connect({ host: this.url.hostname, port, servername: this.url.hostname }, () => {
      const lines = [
        `GET ${this.url.pathname}${this.url.search} HTTP/1.1`,
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
    if (this.allowPing) this.pingTimer = setInterval(() => this.ping(), 20000);
    this.pingTimer.unref?.();
  }

  handleData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    if (!this.upgraded) {
      const end = this.buffer.indexOf("\r\n\r\n");
      if (end < 0) return;
      const head = this.buffer.subarray(0, end).toString("latin1");
      this.buffer = this.buffer.subarray(end + 4);
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
        const big = this.buffer.readBigUInt64BE(2);
        if (big > BigInt(MAX_BINARY_BYTES)) return this.fail(new Error("frame too large"));
        length = Number(big);
        offset = 10;
      }
      if (length > MAX_BINARY_BYTES) return this.fail(new Error("frame too large"));
      const maskKey = masked ? this.buffer.subarray(offset, offset + 4) : null;
      if (masked) offset += 4;
      if (this.buffer.length < offset + length) return;
      let payload = Buffer.from(this.buffer.subarray(offset, offset + length));
      if (maskKey) for (let i = 0; i < payload.length; i += 1) payload[i] ^= maskKey[i % 4];
      this.buffer = this.buffer.subarray(offset + length);
      if (opcode === 0x9) this.sendFrame(0xa, payload);
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

  sendText(text) { return this.sendFrame(0x1, Buffer.from(String(text), "utf8")); }
  sendBinary(buffer) {
    const body = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
    for (let i = 0; i < body.length; i += FRAME_BYTES) this.sendFrame(0x2, body.subarray(i, i + FRAME_BYTES));
    return true;
  }
  ping() { this.sendFrame(0x9, Buffer.from("hb")); }
  close() {
    if (this.closed) return;
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

function socketWrite(socket, text) {
  if (!socket || socket.destroyed) return false;
  try { socket.write(text); return true; } catch { return false; }
}

function wsFrame(opcode, payload = Buffer.alloc(0)) {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload || ""), "utf8");
  let header;
  if (body.length < 126) {
    header = Buffer.from([0x80 | opcode, body.length]);
  } else if (body.length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(body.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(body.length), 2);
  }
  return Buffer.concat([header, body]);
}

class ClientSocket {
  constructor(socket) {
    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    this.closed = false;
    this.fragments = [];
    socket.on("data", (chunk) => this.onData(chunk));
    socket.on("error", () => this.close());
    socket.on("close", () => { this.closed = true; });
  }

  accept() {
    const key = this.handshakeKey || "";
    const accept = crypto.createHash("sha1").update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64");
    socketWrite(this.socket, [
      "HTTP/1.1 101 Switching Protocols",
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Accept: ${accept}`,
      "\r\n",
    ].join("\r\n"));
  }

  onData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
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
        const big = this.buffer.readBigUInt64BE(2);
        if (big > BigInt(MAX_BINARY_BYTES)) return this.close(1009, "frame too large");
        length = Number(big);
        offset = 10;
      }
      if (length > MAX_BINARY_BYTES) return this.close(1009, "frame too large");
      const mask = masked ? this.buffer.subarray(offset, offset + 4) : null;
      if (masked) offset += 4;
      if (this.buffer.length < offset + length) return;
      let payload = Buffer.from(this.buffer.subarray(offset, offset + length));
      if (mask) for (let i = 0; i < payload.length; i += 1) payload[i] ^= mask[i % 4];
      this.buffer = this.buffer.subarray(offset + length);
      if (!masked) return this.close(1002, "client frames must be masked");
      if (opcode === 0x9) this.sendFrame(0xa, payload);
      else if (opcode === 0x8) this.close();
      else if (opcode === 0x2) this.onBinary?.(payload);
      else if (opcode === 0x1) this.onText?.(payload.toString("utf8"));
    }
  }

  sendFrame(opcode, payload = Buffer.alloc(0)) {
    if (this.closed || !this.socket || this.socket.destroyed) return false;
    try { this.socket.write(wsFrame(opcode, payload)); return true; } catch { return false; }
  }
  sendText(value) { return this.sendFrame(0x1, Buffer.from(JSON.stringify(value), "utf8")); }
  sendBinary(buffer) { return this.sendFrame(0x2, buffer); }
  close(code = 1000, reason = "") {
    if (this.closed) return;
    const body = Buffer.alloc(2 + Buffer.byteLength(reason));
    body.writeUInt16BE(code, 0);
    body.write(reason, 2);
    this.sendFrame(0x8, body);
    this.closed = true;
    try { this.socket?.destroy(); } catch {}
  }
}

function buildSignal(relay, type, payload = {}) {
  relay.seq = (relay.seq || 0) + 1;
  return JSON.stringify({
    type,
    live_id: String(relay.session.liveId || ""),
    conn_id: relay.connId,
    seq_id: relay.seq,
    payload,
  });
}

function sendUpstream(relay, type, payload = {}) {
  if (!relay.upstream) return false;
  return relay.upstream.sendText(buildSignal(relay, type, payload));
}

function relayError(client, code, message) {
  client?.sendText({ type: "error", code: String(code || "RELAY_ERROR"), message: String(message || "relay error").slice(0, 300) });
}

function normalizeAction(value) {
  if (!value || typeof value !== "object") return null;
  const name = String(value.name || value.action || "").trim().slice(0, 80);
  if (!name) return null;
  const out = { name };
  for (const key of ["emotion", "intensity", "loop", "text"]) {
    if (value[key] != null) out[key] = typeof value[key] === "string" ? value[key].slice(0, 200) : value[key];
  }
  return out;
}

function validatePcmFrame(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) return { ok: false, code: "INVALID_PCM", message: "PCM frame must be a non-empty Buffer" };
  if (buffer.length % 2 !== 0) return { ok: false, code: "INVALID_PCM", message: "PCM length must be a positive multiple of 2 bytes" };
  if (buffer.length > MAX_BINARY_BYTES) return { ok: false, code: "PCM_TOO_LARGE", message: "PCM frame is too large" };
  return { ok: true };
}

function normalizeLook(message = {}) {
  const remove = message.type === "look.remove" || message.opType === "remove" || message.operation === "remove";
  const prompt = { op_type: remove ? "remove" : "switch" };
  if (!remove) {
    const look = message.look && typeof message.look === "object" ? message.look : message;
    const imageUrl = String(look.imageUrl || look.imageUri || look.image_uri || "").trim();
    const imageId = String(look.imageId || look.image_id || "").trim().slice(0, 128);
    const kind = String(look.kind || "").trim();
    if (!/^https:\/\/\S+$/i.test(imageUrl) || !imageId || !["garment", "object", "background"].includes(kind)) {
      return { error: "look.switch requires public https imageUrl, imageId and kind=garment|object|background" };
    }
    prompt.images = [{ image_uri: imageUrl, image_id: imageId, kind, user_text: String(look.userText || look.user_text || "").trim().slice(0, 200) }];
  }
  return { prompt };
}

function handleClientText(relay, text) {
  let message;
  try { message = JSON.parse(text); } catch { return relayError(relay.client, "INVALID_JSON", "message must be JSON"); }
  const type = String(message?.type || "").trim();
  if (!type) return relayError(relay.client, "INVALID_COMMAND", "type is required");
  if (type === "speech.start") {
    const body = message;
    if (body.audio && (Number(body.audio.sampleRate || 24000) !== 24000 || Number(body.audio.channels || 1) !== 1 || String(body.audio.format || "pcm_s16le") !== "pcm_s16le")) {
      return relayError(relay.client, "INVALID_AUDIO", "audio must be pcm_s16le, 24000 Hz, mono");
    }
    const speechText = String(body.text || body.content || "").trim().slice(0, 4000);
    if (!speechText) return relayError(relay.client, "TEXT_REQUIRED", "speech.start requires text");
    const action = normalizeAction(body.action);
    relay.speechOpen = true;
    relay.client.sendText({ type: "speech.accepted", requestId: String(body.requestId || "").slice(0, 120) });
    relay.pending.push({
      type: 10,
      payload: {
        text_msg: {
          msg_id: String(body.requestId || `say-${Date.now()}`).slice(0, 120),
          content: speechText,
          timestamp: Date.now(),
          ...(action ? { action } : {}),
        },
      },
    });
    relay.flushPending();
    return;
  }
  if (type === "user.text") {
    const content = String(message.text || message.content || "").trim().slice(0, 4000);
    if (!content) return relayError(relay.client, "TEXT_REQUIRED", "user.text requires text");
    relay.pending.push({ type: 9, payload: { text_msg: { msg_id: String(message.requestId || `user-${Date.now()}`).slice(0, 120), content, timestamp: Date.now() } } });
    relay.flushPending();
    return;
  }
  if (type === "speech.end") {
    relay.speechOpen = false;
    relay.client.sendText({ type: "speech.ended", requestId: String(message.requestId || "").slice(0, 120) });
    return;
  }
  if (type === "speech.cancel") {
    relay.speechOpen = false;
    sendUpstream(relay, 7, { cancel_speech: { reason: "merchant_cancel" } });
    relay.client.sendText({ type: "speech.cancelled", requestId: String(message.requestId || "").slice(0, 120) });
    return;
  }
  if (type === "look.switch" || type === "look.remove") {
    const normalized = normalizeLook(message);
    if (normalized.error) return relayError(relay.client, "INVALID_LOOK", normalized.error);
    if (relay.lookPending) return relayError(relay.client, "LOOK_BUSY", "another look operation is pending");
    relay.lookPending = { requestId: String(message.requestId || "").slice(0, 120), at: Date.now() };
    relay.pending.push({ type: 11, payload: { prompt_operation: normalized.prompt } });
    relay.flushPending();
    return;
  }
  if (type === "session.hangup") {
    sendUpstream(relay, 5, { hangup: { hangup_reason: String(message.reason || "merchant_end").slice(0, 80) } });
    relay.client.sendText({ type: "session.ended", reason: String(message.reason || "merchant_end").slice(0, 80) });
    closeRelay(relay, false);
    return;
  }
  return relayError(relay.client, "UNKNOWN_COMMAND", `unsupported command: ${type}`);
}

function startRelay(relay) {
  const creds = relay.credentials || {};
  if (!creds.key) {
    relayError(relay.client, "VIDU_NOT_CONFIGURED", "Vidu live is not configured");
    relay.client.close(1011, "Vidu not configured");
    return;
  }
  const httpBase = String(creds.base || "https://api.vidu.com").replace(/\/+$/, "");
  const wsOrigin = httpBase.replace(/^http:/i, "ws:").replace(/^https:/i, "wss:");
  const wsUrl = new URL(`${wsOrigin}/live/v1/external-lives/${encodeURIComponent(relay.session.liveId)}/stream`);
  wsUrl.searchParams.set("conn_id", relay.connId);
  if (relay.session.clientSecret) wsUrl.searchParams.set("client_secret", relay.session.clientSecret);
  relay.upstream = new MiniWebSocket(wsUrl.toString(), {
    headers: { Authorization: `Token ${creds.key}` },
    onOpen: () => relay.upstream.sendText(buildSignal(relay, 1, { conn_init: { version: 1 } })),
    onText: (text) => handleUpstreamText(relay, text),
    onClose: (error) => {
      if (relay.closed) return;
      relay.client.sendText({ type: "upstream.closed", message: String(error?.message || "closed").slice(0, 200) });
      relay.client.close(1011, "upstream closed");
      activeRelays.delete(relay.session.id);
    },
  });
  relay.upstream.connect();
}

function handleUpstreamText(relay, text) {
  let message;
  try { message = JSON.parse(text); } catch { return; }
  const type = Number(message?.type || 0);
  const payload = message?.payload || {};
  if (type === 2) {
    const ack = payload.conn_init_ack || {};
    if (ack.success === true) {
      relay.ready = true;
      relay.client.sendText({ type: "session.ready", liveId: relay.session.liveId, sessionId: relay.session.id, audio: { format: "pcm_s16le", sampleRate: 24000, channels: 1, frameBytes: FRAME_BYTES } });
      relay.flushPending();
    } else {
      setTimeout(() => { if (!relay.closed) relay.upstream?.sendText(buildSignal(relay, 1, { conn_init: { version: 1 } })); }, 2000).unref?.();
    }
    return;
  }
  if (type === 6) {
    const reason = String(payload.hangup?.hangup_reason || payload.reason || "upstream_hangup").slice(0, 120);
    relay.client.sendText({ type: "session.ended", reason });
    closeRelay(relay, false);
    return;
  }
  if (type === 12) {
    const ack = payload.prompt_operation_ack || payload;
    const pending = relay.lookPending;
    relay.lookPending = null;
    relay.client.sendText({ type: "look.result", requestId: pending?.requestId || "", success: ack.success === true, code: String(ack.error_code || ack.code || ""), message: String(ack.message || "") });
    return;
  }
  if (type === 9 || type === 10) {
    const body = payload.text_msg || {};
    relay.client.sendText({ type: "speech.text", role: type === 9 ? "user" : "assistant", text: String(body.content || "").slice(0, 4000), messageId: String(body.msg_id || "") });
  }
}

function closeRelay(relay, notify = true, reason = "relay_closed") {
  if (!relay || relay.closed) return;
  relay.closed = true;
  if (notify) relay.client?.sendText({ type: "session.ended", reason: String(reason || "relay_closed").slice(0, 120) });
  try { relay.upstream?.close(); } catch {}
  try { relay.client?.close(); } catch {}
  activeRelays.delete(relay.session.id);
}

function parseHeaders(head = "") {
  const headers = {};
  for (const line of String(head || "").split("\r\n").slice(1)) {
    const index = line.indexOf(":");
    if (index > 0) headers[line.slice(0, index).trim().toLowerCase()] = line.slice(index + 1).trim();
  }
  return headers;
}

async function handleUpgrade(req, socket, head = Buffer.alloc(0)) {
  let parsed;
  try { parsed = new URL(req.url, "http://127.0.0.1"); } catch { socket.destroy(); return false; }
  const match = parsed.pathname.match(/^\/api\/embed\/live\/sessions\/([^/]+)\/relay\/?$/);
  if (!match) return false;
  const tokenPayload = readToken(parsed.searchParams.get("token") || "");
  if (!tokenPayload) {
    socket.destroy();
    return true;
  }
  const sessionId = decodeURIComponent(match[1]);
  if (String(tokenPayload.sessionId) !== sessionId || !sessionReader) {
    socket.destroy();
    return true;
  }
  const session = await sessionReader(sessionId).catch(() => null);
  if (!session || session.mode !== "compute-relay" || !session.liveId || String(session.userId || "") !== String(tokenPayload.merchantUserId || "")) {
    socket.destroy();
    return true;
  }
  if (["ended", "failed", "cancelled"].includes(String(session.status || "").toLowerCase()) || session.settled === true) {
    socket.destroy();
    return true;
  }
  const previous = activeRelays.get(session.id);
  if (previous) closeRelay(previous, true, "replaced_by_reconnect");
  const client = new ClientSocket(socket);
  client.handshakeKey = String(req.headers["sec-websocket-key"] || "");
  client.accept();
  if (head?.length) client.onData(head);
  const relay = {
    session,
    token: tokenPayload,
    client,
    upstream: null,
    connId: `relay-${crypto.randomBytes(6).toString("hex")}`,
    seq: 0,
    ready: false,
    speechOpen: false,
    pending: [],
    lookPending: null,
    closed: false,
    credentials: credentialsReader ? credentialsReader(session.viduRegion || "overseas") : null,
    flushPending() {
      if (!this.ready || !this.upstream) return;
      while (this.pending.length) {
        const item = this.pending.shift();
        this.upstream.sendText(buildSignal(this, item.type, item.payload));
      }
    },
  };
  client.onText = (text) => handleClientText(relay, text);
  client.onBinary = (buffer) => {
    if (!relay.speechOpen) return relayError(client, "SPEECH_NOT_STARTED", "send speech.start before PCM audio");
    const pcm = validatePcmFrame(buffer);
    if (!pcm.ok) return relayError(client, pcm.code, pcm.message);
    if (!relay.ready || !relay.upstream) return relayError(client, "NOT_READY", "upstream is not ready");
    relay.upstream.sendBinary(buffer);
  };
  activeRelays.set(session.id, relay);
  startRelay(relay);
  return true;
}

function closeSession(sessionId = "", notify = true, reason = "merchant_end") {
  const relay = activeRelays.get(String(sessionId || ""));
  if (!relay) return false;
  const hangupReason = String(reason || "merchant_end").slice(0, 80) || "merchant_end";
  if (!relay.closed && relay.upstream && !relay.upstream.closed) {
    sendUpstream(relay, 5, { hangup: { hangup_reason: hangupReason } });
  }
  closeRelay(relay, notify, hangupReason);
  return true;
}

function hasSession(sessionId = "") {
  return activeRelays.has(String(sessionId || ""));
}

function __testReset() {
  for (const relay of activeRelays.values()) closeRelay(relay, false);
  activeRelays.clear();
}

module.exports = {
  configure,
  makeToken,
  readToken,
  handleUpgrade,
  closeSession,
  hasSession,
  TOKEN_TTL_MS,
  FRAME_BYTES,
  __test: {
    MiniWebSocket,
    ClientSocket,
    wsFrame,
    sign,
    validatePcmFrame,
    normalizeLook,
    handleClientText,
    handleUpstreamText,
    buildSignal,
    closeRelay,
    activeRelays,
    __testReset,
  },
};
