"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
const client = fs.readFileSync(path.join(__dirname, "..", "chat-live.js"), "utf8");
const admin = fs.readFileSync(path.join(__dirname, "..", "admin.js"), "utf8");

test("chat live sessions use first-frame billing and preserve legacy sessions", () => {
  assert.equal((server.match(/billingPolicy: "first_frame"/g) || []).length, 2);
  assert.match(server, /const billingPolicy = session\.billingPolicy \|\| latest\?\.billingPolicy \|\| ""/);
  assert.match(server, /const billedSeconds = billingPolicy === "first_frame"/);
  assert.match(server, /const billedSeconds = session\.billingPolicy === "first_frame"/);
  assert.match(client, /state\.billableStartedAt \? `\$\{mm\}:\$\{ss\}` : "--:--"/);
});

test("chat live operation diagnostics persist bounded success and failure details", () => {
  assert.match(server, /async function appendChatLiveOperation/);
  assert.match(server, /jsonb_array_length\(COALESCE\(payload->'operations', '\[\]'::jsonb\)\) \+ 2 - 40/);
  assert.match(server, /success: body\?\.success === true \? true : body\?\.success === false \? false : null/);
  assert.match(server, /code: String\(body\?\.code \|\| ""\)/);
  assert.match(server, /operations: normalizeChatLiveOperations\(session\.operations\)/);
  assert.match(admin, /操作明细/);
  assert.match(admin, /operation\.success === true/);
  assert.match(admin, /operation\.success === false/);
  assert.match(admin, /处理中/);
});

test("control disconnect reports the active operation instead of hard-coded Undress", () => {
  assert.match(client, /const operation = state\.lookOperation \|\| \{\};/);
  assert.match(client, /action: operation\.action \|\| "switch_look"/);
  assert.doesNotMatch(client, /reportChatLiveOperation\(\{ action: "undress", phase: "transport"/);
});

test("legacy string settled values do not block a new chat", () => {
  assert.match(server, /item\.settled === true \|\| String\(item\.settled \|\| ""\)\.toLowerCase\(\) === "true"/);
  assert.match(server, /const status = String\(item\.status \|\| ""\)\.toLowerCase\(\)/);
});

test("chat live retains upstream trace, request, response, billing, and RTC diagnostics", () => {
  assert.match(server, /function chatLiveUpstreamSummary/);
  assert.match(server, /upstreamTraceId/);
  assert.match(server, /event: "vidu_create"/);
  assert.match(server, /event: "balance_check"/);
  assert.match(server, /event: "vidu_live_status"/);
  assert.match(server, /event: "vidu_final_status"/);
  assert.match(server, /console\.info\("\[vidu-live-response\]"/);
  assert.match(client, /phase: "rtc_subscribe"/);
  assert.match(client, /function reportVideoDiagnostic/);
  assert.match(client, /first_frame_timeout/);
  assert.match(client, /video_recovery_request/);
  assert.match(client, /video_recovery_frame/);
});

test("Undress replacement keeps the overlay but releases RTC before a fresh session", () => {
  assert.match(client, /finishSession\("look_reconnect", "Undress 使用新图片重新建立连接", \{ keepOverlay: true \}\)/);
  assert.match(client, /replaceSessionId: oldSessionId/);
  assert.match(client, /preserveOverlay: true, freshRtc: true/);
  assert.match(client, /await new Promise\(\(resolve\) => window\.setTimeout\(resolve, 450\)\)/);
  assert.match(client, /createInstance/);
  assert.match(client, /你等我一下哦，我去准备一下/);
  assert.match(client, /LOOK_SWITCHING_MESSAGE/);
  assert.match(client, /videoRecoveryPending/);
});

test("chat live characters support per-role Markdown persona maintenance", () => {
  assert.match(server, /const personaMd = String\(body\.personaMd/);
  assert.match(server, /personaFormat: personaMd \? "markdown"/);
  assert.match(admin, /上传 Markdown/);
  assert.match(admin, /chatLivePersonaTemplate/);
  assert.match(admin, /readChatLivePersonaMarkdown/);
});
