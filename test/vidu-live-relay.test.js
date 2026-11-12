"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const relay = require("../vidu-live-relay");

function tokenPayload(overrides = {}) {
  return {
    kind: "compute-relay",
    sessionId: "chatlive-relay-1",
    merchantUserId: "merchant-1",
    externalUserId: "user-1",
    characterId: "embedchar-1",
    iat: Date.now(),
    exp: Date.now() + 60_000,
    ...overrides,
  };
}

function encodedToken(payload) {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function fakeClient() {
  const sent = [];
  return {
    sent,
    closed: false,
    closeCode: 0,
    closeReason: "",
    sendText(value) { sent.push(value); },
    close(code = 1000, reason = "") { this.closed = true; this.closeCode = code; this.closeReason = reason; },
  };
}

function fakeRelay(overrides = {}) {
  const upstreamTexts = [];
  const upstreamBinaries = [];
  const state = {
    session: { id: "chatlive-relay-1", liveId: "live-1", userId: "merchant-1" },
    client: fakeClient(),
    upstream: {
      closed: false,
      sendText(text) { upstreamTexts.push(typeof text === "string" ? JSON.parse(text) : text); return true; },
      sendBinary(buffer) { upstreamBinaries.push(Buffer.from(buffer)); return true; },
      close() { this.closed = true; },
    },
    connId: "relay-test",
    seq: 0,
    ready: true,
    speechOpen: false,
    pending: [],
    lookPending: null,
    closed: false,
    flushPending() {
      if (!this.ready || !this.upstream) return;
      while (this.pending.length) {
        const item = this.pending.shift();
        this.upstream.sendText({ type: item.type, live_id: this.session.liveId, conn_id: this.connId, seq_id: ++this.seq, payload: item.payload });
      }
    },
    ...overrides,
  };
  state.upstreamTexts = upstreamTexts;
  state.upstreamBinaries = upstreamBinaries;
  return state;
}

test("relay tokens are HMAC-bound to session, merchant and character and reject tampering", () => {
  relay.configure({ secret: "test-relay-secret" });
  const session = {
    id: "chatlive-relay-1",
    userId: "merchant-1",
    externalUserId: "external-1",
    characterId: "embedchar-1",
  };
  const token = relay.makeToken(session, 5 * 60_000);
  const payload = relay.readToken(token);
  assert.equal(payload.sessionId, session.id);
  assert.equal(payload.merchantUserId, session.userId);
  assert.equal(payload.externalUserId, session.externalUserId);
  assert.equal(payload.characterId, session.characterId);
  assert.equal(relay.readToken(`${token.slice(0, -1)}x`), null);
  assert.equal(relay.readToken(token.replace("vlr1.", "vlr2.")), null);

  const expiredEncoded = encodedToken(tokenPayload({ exp: Date.now() - 1 }));
  const expired = `vlr1.${expiredEncoded}.${relay.__test.sign(expiredEncoded)}`;
  assert.equal(relay.readToken(expired), null);
});

test("looks accept only public https assets with supported kinds and stable ids", () => {
  const garment = relay.__test.normalizeLook({
    type: "look.switch",
    look: { kind: "garment", imageUrl: "https://cdn.example.com/dress.png", imageId: "outfit-1", userText: "换成这条裙子" },
  });
  assert.deepEqual(garment, {
    prompt: {
      op_type: "switch",
      images: [{ image_uri: "https://cdn.example.com/dress.png", image_id: "outfit-1", kind: "garment", user_text: "换成这条裙子" }],
    },
  });
  assert.equal(relay.__test.normalizeLook({ type: "look.switch", look: { kind: "object", imageUrl: "http://cdn.example.com/a.png", imageId: "a" } }).error.includes("https"), true);
  assert.equal(relay.__test.normalizeLook({ type: "look.switch", look: { kind: "object", imageUrl: "https://cdn.example.com/a.png" } }).error.includes("imageId"), true);
  assert.equal(relay.__test.normalizeLook({ type: "look.switch", look: { kind: "person", imageUrl: "https://cdn.example.com/a.png", imageId: "a" } }).error.includes("garment|object|background"), true);
  assert.deepEqual(relay.__test.normalizeLook({ type: "look.remove" }), { prompt: { op_type: "remove" } });
});

test("PCM relay validates non-empty even byte buffers and enforces the frame cap", () => {
  assert.deepEqual(relay.__test.validatePcmFrame(Buffer.alloc(960)), { ok: true });
  assert.equal(relay.__test.validatePcmFrame(Buffer.alloc(0)).code, "INVALID_PCM");
  assert.equal(relay.__test.validatePcmFrame(Buffer.alloc(3)).code, "INVALID_PCM");
  assert.equal(relay.__test.validatePcmFrame(Buffer.alloc(256 * 1024 + 2)).code, "PCM_TOO_LARGE");
  assert.equal(relay.__test.validatePcmFrame("not-a-buffer").code, "INVALID_PCM");
});

test("speech.start validates audio contract, acknowledges the request and sends Vidu type 10", () => {
  const state = fakeRelay();
  relay.__test.handleClientText(state, JSON.stringify({
    type: "speech.start",
    requestId: "speech-1",
    text: "你回来了。",
    action: { name: "wave", emotion: "happy" },
    audio: { format: "pcm_s16le", sampleRate: 24000, channels: 1 },
  }));
  assert.deepEqual(state.client.sent[0], { type: "speech.accepted", requestId: "speech-1" });
  assert.equal(state.speechOpen, true);
  assert.equal(state.upstreamTexts.length, 1);
  assert.equal(state.upstreamTexts[0].type, 10);
  assert.equal(state.upstreamTexts[0].payload.text_msg.content, "你回来了。");
  assert.deepEqual(state.upstreamTexts[0].payload.text_msg.action, { name: "wave", emotion: "happy" });

  relay.__test.handleClientText(state, JSON.stringify({
    type: "speech.start",
    text: "bad",
    audio: { format: "pcm_s16le", sampleRate: 16000, channels: 1 },
  }));
  assert.equal(state.client.sent.at(-1).code, "INVALID_AUDIO");
});

test("speech.start requires text and queues safely before upstream readiness", () => {
  const state = fakeRelay({ ready: false });
  relay.__test.handleClientText(state, JSON.stringify({ type: "speech.start", text: "   " }));
  assert.equal(state.client.sent.at(-1).code, "TEXT_REQUIRED");

  relay.__test.handleClientText(state, JSON.stringify({ type: "speech.start", requestId: "queued", text: "等一下" }));
  assert.equal(state.pending.length, 1);
  assert.equal(state.upstreamTexts.length, 0);
});

test("user.text, speech.end, speech.cancel and hangup use the documented commands", () => {
  const state = fakeRelay();
  relay.__test.handleClientText(state, JSON.stringify({ type: "user.text", requestId: "user-1", text: "今天怎么样" }));
  assert.equal(state.upstreamTexts.at(-1).type, 9);
  assert.equal(state.upstreamTexts.at(-1).payload.text_msg.content, "今天怎么样");

  state.speechOpen = true;
  relay.__test.handleClientText(state, JSON.stringify({ type: "speech.end", requestId: "speech-1" }));
  assert.equal(state.speechOpen, false);
  assert.deepEqual(state.client.sent.at(-1), { type: "speech.ended", requestId: "speech-1" });

  state.speechOpen = true;
  relay.__test.handleClientText(state, JSON.stringify({ type: "speech.cancel", requestId: "speech-2" }));
  assert.equal(state.speechOpen, false);
  assert.equal(state.upstreamTexts.at(-1).type, 7);
  assert.deepEqual(state.client.sent.at(-1), { type: "speech.cancelled", requestId: "speech-2" });

  relay.__test.handleClientText(state, JSON.stringify({ type: "session.hangup", reason: "merchant_end" }));
  assert.equal(state.upstreamTexts.at(-1).type, 5);
  assert.deepEqual(state.client.sent.at(-1), { type: "session.ended", reason: "merchant_end" });
  assert.equal(state.closed, true);
});

test("look.switch acknowledges upstream type 12 and prevents overlapping look operations", () => {
  const state = fakeRelay();
  relay.__test.handleClientText(state, JSON.stringify({
    type: "look.switch",
    requestId: "look-1",
    look: { kind: "background", imageUrl: "https://cdn.example.com/room.png", imageId: "room-1" },
  }));
  assert.equal(state.lookPending.requestId, "look-1");
  assert.equal(state.upstreamTexts.at(-1).type, 11);
  relay.__test.handleClientText(state, JSON.stringify({ type: "look.switch", look: { kind: "background", imageUrl: "https://cdn.example.com/b.png", imageId: "b" } }));
  assert.equal(state.client.sent.at(-1).code, "LOOK_BUSY");

  relay.__test.handleUpstreamText(state, JSON.stringify({ type: 12, payload: { prompt_operation_ack: { success: true } } }));
  assert.equal(state.lookPending, null);
  assert.deepEqual(state.client.sent.at(-1), { type: "look.result", requestId: "look-1", success: true, code: "", message: "" });
});

test("upstream conn_init, text, and hangup events map to stable client events", () => {
  const state = fakeRelay({ ready: false });
  relay.__test.handleUpstreamText(state, JSON.stringify({ type: 2, payload: { conn_init_ack: { success: true } } }));
  assert.equal(state.ready, true);
  assert.equal(state.client.sent.at(-1).type, "session.ready");
  assert.equal(state.client.sent.at(-1).audio.frameBytes, 960);

  relay.__test.handleUpstreamText(state, JSON.stringify({ type: 10, payload: { text_msg: { content: "我在。", msg_id: "assistant-1" } } }));
  assert.deepEqual(state.client.sent.at(-1), { type: "speech.text", role: "assistant", text: "我在。", messageId: "assistant-1" });

  relay.__test.handleUpstreamText(state, JSON.stringify({ type: 6, payload: { hangup: { hangup_reason: "upstream_end" } } }));
  assert.deepEqual(state.client.sent.at(-1), { type: "session.ended", reason: "upstream_end" });
  assert.equal(state.closed, true);
});
