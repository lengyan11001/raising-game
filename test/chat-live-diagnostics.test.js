"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
const client = fs.readFileSync(path.join(__dirname, "..", "chat-live.js"), "utf8");
const admin = fs.readFileSync(path.join(__dirname, "..", "admin.js"), "utf8");

test("replaced account sessions reopen login instead of reporting a video connection failure", () => {
  assert.match(client, /function isSessionReplacedError\(error\)/);
  assert.match(client, /error\?\.code === "SESSION_REPLACED" \|\| error\?\.payload\?\.code === "SESSION_REPLACED"/);
  assert.match(client, /function handleSessionReplaced\(errorOrPayload = \{\}\)/);
  assert.match(client, /window\.dispatchEvent\(new CustomEvent\("raising-session-replaced", \{ detail: payload \}\)\)/);
  assert.match(client, /if \(payload\?\.code === "SESSION_REPLACED"\) handleSessionReplaced\(payload\);/);
  const catchStart = client.indexOf('} catch (error) {\n      if (isSessionReplacedError(error)) {');
  const catchEnd = client.indexOf('const message = error.message || "创建会话失败。";', catchStart);
  assert.ok(catchStart >= 0 && catchEnd > catchStart);
  const createCatch = client.slice(catchStart, catchEnd);
  assert.match(createCatch, /handleSessionReplaced\(error\);/);
  assert.match(createCatch, /closeOverlay\(\);/);
  assert.doesNotMatch(createCatch, /视频服务暂时没有接通/);
});

test("upstream Vidu balance exhaustion is not treated as the user's wallet balance", () => {
  assert.match(server, /function chatLiveUpstreamBalanceUnavailable/);
  assert.match(server, /code: upstreamBalanceUnavailable \? "CHAT_LIVE_UPSTREAM_BALANCE_UNAVAILABLE"/);
  assert.match(server, /视频服务额度暂时不足，请联系客服处理。/);
  assert.match(client, /const upstreamBalance = error\.code === "CHAT_LIVE_UPSTREAM_BALANCE_UNAVAILABLE"/);
  assert.match(client, /const noCredits = !membership && !upstreamBalance/);
  assert.match(client, /if \(noCredits\) showCreditGuide\(\);/);
});

test("chat live sessions bill from entry and keep first frame as diagnostics only", () => {
  assert.ok((server.match(/billingPolicy: "entry"/g) || []).length >= 2);
  assert.doesNotMatch(server, /billingPolicy: "first_frame"/);
  assert.doesNotMatch(server, /provisionalBilledSeconds/);
  assert.match(server, /const terminalBillingKnown = Boolean\(detail\) && terminalStatus && billingEvidence\.known/);
  assert.match(server, /upstreamBilledSeconds: settlement\.billingEvidence\.seconds/);
  assert.match(server, /const billedSeconds = session\.sharedRoomViewer === true[\s\S]*?session\.billingPolicy === "entry"/);
  assert.match(client, /function applyChatLiveBillableStart\(session = \{\}\)/);
  assert.match(client, /const raw = session\?\.billableStartedAt \|\| session\?\.createdAt \|\| ""/);
  assert.match(client, /state\.billableStartedAt = startedMs/);
  assert.match(client, /videoReadyReported: false/);
  assert.match(client, /if \(state\.videoReadyReported \|\| state\.ended \|\| !state\.session\?\.id\) return;/);
  assert.match(client, /state\.videoReadyReported = true;/);
  assert.match(client, /state\.session = payload\.session;\n    applyChatLiveBillableStart\(payload\.session\)/);
  assert.doesNotMatch(client, /function startTimer\(\) \{\n    state\.startedAt = Date\.now\(\);\n    state\.billableStartedAt = 0;/);
  assert.doesNotMatch(client, /if \(state\.billableStartedAt \|\| state\.ended \|\| !state\.session\?\.id\) return;/);
  assert.match(client, /state\.overlay\.timer\.textContent = state\.billableStartedAt \? `\$\{mm\}:\$\{ss\}` : "--:--"/);
  assert.match(client, /const seconds = state\.billableStartedAt \? Math\.floor\(\(Date\.now\(\) - state\.billableStartedAt\) \/ 1000\) : 0/);
});

test("first-frame readiness never creates or replaces the billing start", () => {
  const readyBlock = server.match(/async function handleMarkChatLiveReady\([\s\S]*?\n}\n\nasync function handleReportChatLiveOperation/)[0];
  assert.match(readyBlock, /first frame is a diagnostic milestone only/i);
  assert.match(readyBlock, /phase: "first_frame"/);
  assert.doesNotMatch(readyBlock, /jsonb_set\(payload, '\{billableStartedAt\}'/);
  assert.doesNotMatch(readyBlock, /const startedAt = new Date/);
  assert.match(client, /进房即开始计时/);
});

test("all chat-live entry responses expose the server billing start", () => {
  const joinBlock = server.match(/async function handleJoinChatLiveRoom\([\s\S]*?\n}\n\nasync function handleListChatLiveRoomMessages/)[0];
  const createBlock = server.match(/async function handleCreateChatLiveSession\([\s\S]*?\n}\n\nfunction sanitizeChatLiveDiagnosticText/)[0];
  assert.match(joinBlock, /billableStartedAt: viewer\.billableStartedAt/);
  assert.match(joinBlock, /createdAt: viewer\.createdAt \|\| viewer\.billableStartedAt/);
  assert.match(joinBlock, /saleCreditsPerMinute: viewer\.saleCreditsPerMinute/);
  assert.match(joinBlock, /costCreditsPerMinute: viewer\.costCreditsPerMinute/);
  assert.doesNotMatch(joinBlock, /saleCreditsPerMinute: 0|costCreditsPerMinute: 0/);
  assert.ok((createBlock.match(/billableStartedAt: session\.billableStartedAt/g) || []).length >= 2);
  assert.ok((createBlock.match(/createdAt: session\.createdAt \|\| session\.billableStartedAt/g) || []).length >= 2);
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
  assert.match(client, /endSessionRequest\(oldId, "look_reconnect", "私密画面已就绪"\)/);
  assert.match(client, /replaceSessionId: oldSessionId/);
  assert.match(client, /preserveOverlay: true, freshRtc: true/);
  assert.match(client, /await new Promise\(\(resolve\) => window\.setTimeout\(resolve, 450\)\)/);
  assert.match(client, /createInstance/);
  assert.match(client, /你等我一下哦，我去准备一下/);
  assert.match(client, /LOOK_SWITCHING_MESSAGE/);
  assert.match(client, /videoRecoveryPending/);
});

test("leaving live room stops all Aliyun RTC clock sync timers", () => {
  assert.match(client, /rtcClocks: new Set\(\)/);
  assert.match(client, /rtcClockHalted: false/);
  assert.match(client, /rtcClockEpoch: 0/);
  assert.match(client, /Clock\.prototype\.startSyncClock = async function startSyncClock\(\)/);
  assert.match(client, /const epoch = state\.rtcClockEpoch;/);
  assert.match(client, /if \(state\.rtcClockHalted \|\| this\.__chatLiveHold\) return;/);
  assert.match(client, /if \(state\.rtcClockHalted \|\| epoch !== state\.rtcClockEpoch \|\| this\.__chatLiveHold\) \{\n        try \{ this\.stopSyncClock\(\); \} catch \{\}/);
  assert.match(client, /function pauseRtcClock\(\) \{\n    state\.rtcClockHalted = true;\n    state\.rtcClockEpoch \+= 1;/);
  assert.match(client, /const clocks = new Set\(state\.rtcClocks \|\| \[\]\)/);
  assert.match(client, /function resumeRtcClock\(\) \{[\s\S]*?state\.rtcClockHalted \|\| state\.ended/);
  assert.match(client, /const alreadyEnded = state\.ended === true;\n    state\.ended = true;\n    pauseRtcClock\(\);/);
  assert.match(client, /state\.ended = false;\n    state\.rtcClockHalted = false;/);
});

test("chat live characters support per-role Markdown persona maintenance", () => {
  assert.match(server, /const personaMd = String\(body\.personaMd/);
  assert.match(server, /personaFormat: personaMd \? "markdown"/);
  assert.match(admin, /导入人设 Markdown/);
  assert.match(admin, /chatLivePersonaTemplate/);
  assert.match(admin, /chatLiveReplyStyleTemplate/);
  assert.match(admin, /句长跟着内容走，不固定句数/);
  assert.match(admin, /说话方式/);
  assert.match(admin, /禁止括号动作、旁白、心理描写/);
  assert.match(admin, /不要每轮反问/);
  assert.match(admin, /被命令时第一反应/);
  assert.match(admin, /不把陪伴和打赏绑定/);
  assert.match(admin, /readChatLivePersonaMarkdown/);
});
