"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const admin = fs.readFileSync(path.join(root, "admin.js"), "utf8");
const css = fs.readFileSync(path.join(root, "admin.css"), "utf8");
const html = fs.readFileSync(path.join(root, "admin.html"), "utf8");
const server = fs.readFileSync(path.join(root, "server.js"), "utf8");

const previewRoot = path.join(root, "assets", "admin", "voice-preview");
const currentPreviewFiles = [
  "joanna-scene-23s-a-bfa45922.m4a",
  "joanna-scene-23s-b-5c58fa85.m4a",
];
const legacyPreviewFiles = ["joanna-user-rule-e.wav", "joanna-user-rule-f.wav"];
const referencePreviewFiles = ["joanna-moan-breath-c.wav"];
const historicalPreviewFiles = [
  "joanna-intimate-baseline-a.wav",
  "joanna-intimate-waitfix-a.wav",
  "joanna-intimate-waitfix-c.wav",
  "joanna-intimate-final-d.wav",
  "joanna-intimate-final-e.wav",
  "joanna-intimate-final-h.wav",
  "joanna-intimate-wait-nohu-420.wav",
  "joanna-intimate-wait-nohu-520.wav",
  "joanna-intimate-wait-nohu-620.wav",
];

function assertWav(fileName, minimumBytes) {
  const file = path.join(previewRoot, fileName);
  const stat = fs.statSync(file);
  assert.ok(stat.size > minimumBytes, `${fileName} is a valid preview sample`);
  const header = fs.readFileSync(file).subarray(0, 12);
  assert.equal(header.subarray(0, 4).toString("ascii"), "RIFF");
  assert.equal(header.subarray(8, 12).toString("ascii"), "WAVE");
}

function assertM4a(fileName, minimumBytes) {
  const file = path.join(previewRoot, fileName);
  const stat = fs.statSync(file);
  assert.ok(stat.size > minimumBytes, `${fileName} contains the complete converted scene`);
  const header = fs.readFileSync(file).subarray(0, 12);
  assert.equal(header.subarray(4, 8).toString("ascii"), "ftyp", `${fileName} is an MPEG-4 audio container`);
}

test("admin has a top-level voice preview route and navigation entry", () => {
  assert.match(html, /href="#\/voice-preview" data-route="voice-preview"/);
  assert.match(html, /<span>试听<\/span>/);
  assert.match(admin, /\{ id: "voice-preview", title: "试听", render: renderVoicePreview \}/);
  assert.match(admin, /function renderVoicePreview\(\)/);
});

test("voice preview only lists the complete A/B audition candidates", () => {
  assert.match(admin, /const VOICE_PREVIEW_ITEMS = \[/);
  assert.match(admin, /id: "user-rule-e"/);
  assert.match(admin, /id: "user-rule-f"/);
  assert.match(admin, /joanna-scene-23s-a-bfa45922\.m4a\?v=20261030-voice-preview-12/);
  assert.match(admin, /joanna-scene-23s-b-5c58fa85\.m4a\?v=20261030-voice-preview-12/);
  assert.doesNotMatch(admin, /joanna-user-rule-[ef]\.wav/);
  assert.match(admin, /duration: "41\.5 秒"/);
  assert.match(admin, /duration: "46\.8 秒"/);
  assert.match(admin, /expectedDuration: 41\.5/);
  assert.match(admin, /expectedDuration: 46\.8/);
  assert.match(admin, /当前只保留本轮两条连续场景候选，均为完整提示词直接生成；历史音频已从后台试听页移除/);
  assert.match(admin, /data-voice-seek="0"/);
  assert.match(admin, /data-voice-seek="23\.0"/);
  assert.match(admin, /data-voice-seek="32\.0"/);
  assert.match(admin, /audio\.currentTime = Math\.min\(audio\.duration, Math\.max\(0, seekTo\)\)/);
  assert.match(admin, /data-voice-preview-id/);
  assert.match(admin, /audio\.closest\("article\[data-voice-preview-id\]"\)/);
  assert.match(admin, /fetch\(source\)/);
  assert.match(admin, /response\.arrayBuffer\(\)/);
  assert.match(admin, /new Blob\(\[bytes\], \{ type: "audio\/mp4" \}\)/);
  assert.match(admin, /audio\.src = blobUrl/);
  assert.match(admin, /duration < minimumDuration/);
  assert.match(admin, /已阻止不完整播放/);
  assert.match(admin, /preload="none"/);
  const voicePreviewRender = admin.match(/function renderVoicePreview\(\) \{([\s\S]*?)\n\}/)?.[1] || "";
  assert.ok(voicePreviewRender);
  assert.doesNotMatch(voicePreviewRender, /<audio[^>]*\ssrc=/);

  for (const fileName of historicalPreviewFiles) {
    assert.doesNotMatch(admin, new RegExp(fileName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${fileName} must not be rendered in admin`);
  }
  assert.doesNotMatch(admin, /joanna-intimate-/);
  assert.doesNotMatch(admin, /joanna-moan-breath-c\.wav/);
  assert.doesNotMatch(admin, /无呼接桥|修正 H|已否决|原始气音 C/);
  assert.match(css, /\.adm-voice-preview-card audio\s*\{[\s\S]*?width:\s*100%/);
});

test("current audition M4A files and the protected breath reference are valid", () => {
  for (const fileName of currentPreviewFiles) assertM4a(fileName, 100_000);
  assertWav("joanna-moan-breath-c.wav", 500_000);
  const digest = crypto.createHash("sha256").update(fs.readFileSync(path.join(previewRoot, "joanna-moan-breath-c.wav"))).digest("hex");
  assert.equal(digest, "a6ea5970aa1e0ebf3e1ffa4dda52d58bec87daec95e1ee78004fffd10888d26e", "approved Joanna breath reference must remain byte-identical");
});

test("historical audition files are not part of the current preview set", () => {
  for (const fileName of historicalPreviewFiles) {
    assert.equal(fs.existsSync(path.join(previewRoot, fileName)), false, `${fileName} should be removed from the backend audition folder`);
  }
  for (const fileName of legacyPreviewFiles) {
    assert.equal(fs.existsSync(path.join(previewRoot, fileName)), false, `${fileName} should be removed after the M4A migration`);
  }
  assert.deepEqual(fs.readdirSync(previewRoot).sort(), [...currentPreviewFiles, ...referencePreviewFiles].sort());
});

test("voice preview assets are served as seekable audio", () => {
  assert.match(server, /\["\.wav", "audio\/wav"\]/);
  assert.match(server, /\["\.m4a", "audio\/mp4"\]/);
  assert.match(server, /contentType\.startsWith\("video\/"\) \|\| contentType\.startsWith\("audio\/"\)/);
  assert.match(server, /"accept-ranges": contentType\.startsWith\("video\/"\) \|\| contentType\.startsWith\("audio\/"\) \? "bytes" : "none"/);
});

test("production nginx serves admin preview WAV and M4A files as audio on the admin host", () => {
  const tuning = fs.readFileSync(path.join(root, "ops", "apply-production-tuning.sh"), "utf8");
  assert.match(tuning, /server_name 123vips\.com www\.123vips\.com admin\.123vips\.com;/);
  assert.match(tuning, /location \^~ \/assets\/admin\/voice-preview\/ \{[\s\S]*?types \{[\s\S]*?audio\/wav wav;[\s\S]*?audio\/mp4 m4a;[\s\S]*?\}[\s\S]*?add_header Accept-Ranges bytes always;/);
});

test("voice preview assets stay local and bypass the R2 redirect", () => {
  assert.match(
    server,
    /!pathname\.startsWith\("\/assets\/admin\/voice-preview\/"\) &&[\s\S]*?!DISABLE_R2_STORAGE/,
  );
  assert.doesNotMatch(admin, /data\/.*\.json/);
  assert.doesNotMatch(admin, /voice-preview[\s\S]{0,200}(readFile|writeFile|JSON\.parse)/i);
});
