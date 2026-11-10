"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "server.js"), "utf8");
const relay = fs.readFileSync(path.join(root, "vidu-live-relay.js"), "utf8");
const db = fs.readFileSync(path.join(root, "db.js"), "utf8");

function sourceBlock(start, end) {
  const from = source.indexOf(start);
  assert.notEqual(from, -1, `missing source start: ${start}`);
  const to = source.indexOf(end, from + start.length);
  assert.notEqual(to, -1, `missing source end: ${end}`);
  return source.slice(from, to);
}

test("Vidu merchant APIs require API/sub token auth and never accept embed browser tokens", () => {
  const {
    viduLiveMerchantAuth,
    viduLiveExternalUserId,
  } = require(path.join(root, "server.js"));
  assert.equal(viduLiveMerchantAuth({ user: { id: "merchant-1" }, tokenSource: "api_token" }), true);
  assert.equal(viduLiveMerchantAuth({ user: { id: "merchant-1" }, tokenSource: "subtoken" }), true);
  assert.equal(viduLiveMerchantAuth({ user: { id: "merchant-1" }, isApiToken: true }), true);
  assert.equal(viduLiveMerchantAuth({ user: { id: "merchant-1" }, tokenSource: "session" }), false);
  assert.equal(viduLiveMerchantAuth({ user: { id: "merchant-1" }, tokenSource: "embed_live" }), false);
  assert.equal(viduLiveMerchantAuth({ user: null, tokenSource: "api_token" }), false);
  assert.match(source, /VIDU_LIVE_MERCHANT_TOKEN_REQUIRED/);
  assert.match(source, /source === "api_token" \|\| source === "subtoken" \|\| auth\?\.isApiToken === true/);

  assert.equal(viduLiveExternalUserId("user-10001"), "user-10001");
  assert.equal(viduLiveExternalUserId("user:10001@example.com"), "user:10001@example.com");
  assert.equal(viduLiveExternalUserId("bad user"), "");
  assert.equal(viduLiveExternalUserId("x".repeat(121)), "");
});

test("character ids are stable random ids and updates preserve the existing id", () => {
  assert.match(source, /id: existing\?\.id \|\| `embedchar-\$\{crypto\.randomBytes\(12\)\.toString\("hex"\)\}`/);
  assert.doesNotMatch(source, /embedchar.*createHash/);
  assert.match(source, /getChatLiveCharacterByOwnerInDb\(auth\.user\.id, id\)/);
  assert.match(source, /ownerMerchantUserId: String\(auth\.user\.id\)/);
  assert.match(source, /embedMerchantId: String\(auth\.user\.id\)/);
});

test("character lookup, list, delete and ticket character selection are owner-scoped", () => {
  assert.match(db, /listChatLiveCharactersByOwnerInDb/);
  assert.match(db, /COALESCE\(payload->>'ownerMerchantUserId', payload->>'embedMerchantId'\) = \$1/);
  assert.match(db, /WHERE id = \$1 AND deleted_at IS NULL/);
  assert.match(db, /listActiveChatLiveSessionsByCharacterIdInDb/);
  assert.match(source, /const character = await getChatLiveCharacterByOwnerInDb\(auth\.user\.id, characterId\);/);
  assert.match(source, /角色不存在或不属于当前商家/);
  assert.match(source, /VIDU_LIVE_CHARACTER_IN_USE/);
});

test("compute-relay is international-only, programmatic-only and fails closed without sale pricing", () => {
  const create = sourceBlock("async function handleViduLiveCreateSession", "async function handleViduLiveGetSession");
  assert.match(create, /String\(body\.mode \|\| character\.defaultMode \|\| "compute-relay"\) !== "compute-relay"/);
  assert.match(create, /VIDU_LIVE_MODE/);
  assert.match(create, /computeRelaySaleCreditsPerMinute/);
  assert.match(create, /VIDU_LIVE_PRICING_MISSING/);
  assert.match(create, /if \(live\.region === "cn"\)/);
  assert.match(create, /VIDU_LIVE_INTERNATIONAL_ONLY/);
  assert.match(create, /viduCredentialsForRegion\("overseas"\)/);
  assert.match(create, /viduRegion: "overseas"/);
  assert.doesNotMatch(create, /startComponentSession|generateChatLiveReply|tts|asr/i);
});

test("compute-relay reserves before upstream, rolls back failures and settles billed seconds", () => {
  const create = sourceBlock("async function handleViduLiveCreateSession", "async function handleViduLiveGetSession");
  const prepare = create.indexOf("prepareChatLiveFreeEntry");
  const upstream = create.indexOf('viduLiveRequestRetry("/live/s_avatar/component"');
  assert.ok(prepare > -1 && upstream > prepare, "billing reservation must precede upstream creation");
  assert.match(create, /rollbackChatLiveEntryAllocation\(sessionId, auth, entry\.initialHold/);
  assert.match(create, /VIDU_LIVE_NO_LIVE_ID/);
  assert.match(create, /billingVersion: "compute_relay_prepaid_v1"/);
  assert.match(source, /meta: \{ taskId: session\.id, liveId: session\.liveId, characterId: session\.characterId, seconds: session\.billedSeconds, model: session\.model, externalUserId: session\.externalUserId \|\| "" \}/);
});

test("settlement and insufficient-credit paths close compute-relay connections", () => {
  assert.match(source, /if \(session\.mode === "compute-relay"\) viduLiveRelay\.closeSession\(session\.id, true, clientReason \|\| "merchant_end"\)/);
  assert.match(source, /viduLiveRelay\.closeSession\(session\.id, true, "insufficient_credits"\)/);
  assert.match(source, /viduLiveRelay\.closeSession\(session\.id, true, clientReason\)/);
});

test("programmatic session response exposes a stable relay URL and PCM contract", () => {
  const {
    viduLiveRelayWebSocketUrl,
  } = require(path.join(root, "server.js"));
  const url = viduLiveRelayWebSocketUrl({
    id: "chatlive-relay-1",
    userId: "merchant-1",
    externalUserId: "user-1",
    characterId: "embedchar-1",
  });
  assert.match(url, /^wss:\/\/live\.123vipeak\.com\/api\/embed\/live\/sessions\/chatlive-relay-1\/relay\?token=/);
  assert.match(source, /protocol: "vidu-live-relay\.v1"/);
  assert.match(source, /format: "pcm_s16le", sampleRate: 24000, channels: 1, frameBytes: 960/);
  assert.match(source, /relayActive: viduLiveRelay\.hasSession\(session\.id\)/);
});

test("public docs route and character/public serialization are wired", () => {
  assert.match(source, /url\.pathname === "\/docs\/vidu-live-integration\.md"/);
  assert.match(source, /text\/markdown; charset=utf-8/);
  const {
    viduLivePublicCharacter,
  } = require(path.join(root, "server.js"));
  const serialized = viduLivePublicCharacter({
    id: "embedchar-1",
    name: "Lin",
    intro: "intro",
    persona: "persona",
    avatarUrl: "https://cdn.example.com/a.png",
    defaultMode: "compute-relay",
    voiceProvider: "qwen_omni",
    voiceType: "Cindy",
    embedLooks: [{ id: "look-1", kind: "garment", name: "coat", imageUrl: "https://cdn.example.com/c.png" }],
  });
  assert.equal(serialized.id, "embedchar-1");
  assert.equal(serialized.defaultMode, "compute-relay");
  assert.deepEqual(serialized.voice, { provider: "qwen_omni", voiceType: "Cindy" });
  assert.equal(serialized.looks.length, 1);
});
