"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const admin = fs.readFileSync(path.join(root, "admin.js"), "utf8");
const css = fs.readFileSync(path.join(root, "admin.css"), "utf8");
const html = fs.readFileSync(path.join(root, "admin.html"), "utf8");
const server = fs.readFileSync(path.join(root, "server.js"), "utf8");

const previewRoot = path.join(root, "assets", "admin", "voice-preview");
const previewFiles = [
  "joanna-intimate-baseline-a.wav",
  "joanna-intimate-waitfix-a.wav",
  "joanna-intimate-waitfix-c.wav",
  "joanna-intimate-final-d.wav",
];

test("admin has a top-level voice preview route and navigation entry", () => {
  assert.match(html, /href="#\/voice-preview" data-route="voice-preview"/);
  assert.match(html, /<span>试听<\/span>/);
  assert.match(admin, /\{ id: "voice-preview", title: "试听", render: renderVoicePreview \}/);
  assert.match(admin, /function renderVoicePreview\(\)/);
});

test("voice preview renders the reviewed Joanna samples and final candidate with seeking", () => {
  assert.match(admin, /const VOICE_PREVIEW_ITEMS = \[/);
  for (const fileName of previewFiles) {
    assert.match(admin, new RegExp(`/assets/admin/voice-preview/${fileName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\?v=20261030-voice-preview-2`));
  }
  assert.match(admin, /data-voice-seek=\"\$\{item\.id === "final-d" \? "16\.4" : "27\.5"\}"/);
  assert.match(admin, /data-voice-seek="28\.0"/);
  assert.match(admin, /joanna-intimate-final-d\.wav\?v=20261030-voice-preview-2/);
  assert.match(admin, /audio\.currentTime = Math\.max\(0, seekTo\)/);
  assert.match(admin, /data-voice-preview-id/);
  assert.match(css, /\.adm-voice-preview-card audio\s*\{[\s\S]*?width:\s*100%/);
});

test("voice preview WAV files exist and are valid RIFF/WAVE", () => {
  for (const fileName of previewFiles) {
    const file = path.join(previewRoot, fileName);
    const stat = fs.statSync(file);
    assert.ok(stat.size > 1_000_000, `${fileName} is a full scene sample`);
    const header = fs.readFileSync(file).subarray(0, 12);
    assert.equal(header.subarray(0, 4).toString("ascii"), "RIFF");
    assert.equal(header.subarray(8, 12).toString("ascii"), "WAVE");
  }
});

test("voice preview assets are served as seekable audio", () => {
  assert.match(server, /\["\.wav", "audio\/wav"\]/);
  assert.match(server, /contentType\.startsWith\("video\/"\) \|\| contentType\.startsWith\("audio\/"\)/);
  assert.match(server, /"accept-ranges": contentType\.startsWith\("video\/"\) \|\| contentType\.startsWith\("audio\/"\) \? "bytes" : "none"/);
});

test("production nginx serves admin preview WAVs as audio on the admin host", () => {
  const tuning = fs.readFileSync(path.join(root, "ops", "apply-production-tuning.sh"), "utf8");
  assert.match(tuning, /server_name 123vips\.com www\.123vips\.com admin\.123vips\.com;/);
  assert.match(tuning, /location \^~ \/assets\/admin\/voice-preview\/ \{[\s\S]*?types \{ audio\/wav wav; \}[\s\S]*?default_type audio\/wav;[\s\S]*?add_header Accept-Ranges bytes always;/);
});

test("voice preview assets stay local and bypass the R2 redirect", () => {
  assert.match(
    server,
    /!pathname\.startsWith\("\/assets\/admin\/voice-preview\/"\) &&[\s\S]*?!DISABLE_R2_STORAGE/,
  );
  assert.doesNotMatch(admin, /data\/.*\.json/);
  assert.doesNotMatch(admin, /voice-preview[\s\S]{0,200}(readFile|writeFile|JSON\.parse)/i);
});
