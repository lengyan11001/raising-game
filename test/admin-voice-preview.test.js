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
const previewFiles = [
  "joanna-moan-breath-c.wav",
  "joanna-intimate-baseline-a.wav",
  "joanna-intimate-waitfix-a.wav",
  "joanna-intimate-waitfix-c.wav",
  "joanna-intimate-final-d.wav",
  "joanna-intimate-final-e.wav",
  "joanna-intimate-final-h.wav",
  "joanna-intimate-wait-nohu-420.wav",
  "joanna-intimate-wait-nohu-520.wav",
  "joanna-intimate-wait-nohu-620.wav",
  "joanna-user-rule-e.wav",
  "joanna-user-rule-f.wav",
];

test("admin has a top-level voice preview route and navigation entry", () => {
  assert.match(html, /href="#\/voice-preview" data-route="voice-preview"/);
  assert.match(html, /<span>试听<\/span>/);
  assert.match(admin, /\{ id: "voice-preview", title: "试听", render: renderVoicePreview \}/);
  assert.match(admin, /function renderVoicePreview\(\)/);
});

test("voice preview renders the reviewed Joanna samples and final candidate with seeking", () => {
  assert.match(admin, /const VOICE_PREVIEW_ITEMS = \[/);
  for (const fileName of previewFiles.filter((name) => name.includes("baseline") || name.includes("waitfix") || name.includes("final-d"))) {
    assert.match(admin, new RegExp(`/assets/admin/voice-preview/${fileName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\?v=20261030-voice-preview-2`));
  }
  for (const fileName of previewFiles.filter((name) => name.includes("wait-nohu"))) {
    assert.match(admin, new RegExp(`/assets/admin/voice-preview/${fileName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\?v=20261030-voice-preview-6`));
  }
  assert.match(admin, /joanna-moan-breath-c\.wav\?v=20261030-voice-preview-5/);
  assert.match(admin, /joanna-intimate-final-e\.wav\?v=20261030-voice-preview-3/);
  assert.match(admin, /joanna-intimate-final-h\.wav\?v=20261030-voice-preview-4/);
  assert.match(admin, /joanna-user-rule-e\.wav\?v=20261030-voice-preview-7/);
  assert.match(admin, /joanna-user-rule-f\.wav\?v=20261030-voice-preview-7/);
  assert.match(admin, /本轮 E · 自然对白 \+ 长气音/);
  assert.match(admin, /本轮 F · 自然对白 \+ 长气音/);
  assert.match(admin, /item\.id\.startsWith\("user-rule-"\)/);
  assert.match(admin, /data-voice-seek="5\.0"/);
  assert.match(admin, /data-voice-seek="8\.0"/);
  assert.match(admin, /修正 H（已否决）/);
  assert.match(admin, /已否决 \/ 仅对照/);
  assert.match(admin, /item\.id\.startsWith\("final-"\).*16\.4/);
  assert.match(admin, /data-voice-seek="28\.0"/);
  assert.match(admin, /data-voice-seek="37\.6"/);
  assert.match(admin, /data-voice-seek="0"/);
  assert.match(admin, /data-voice-seek="0\.35"/);
  assert.match(admin, /data-voice-seek="31\.5"/);
  assert.match(admin, /data-voice-seek="28\.5"/);
  assert.match(admin, /无呼接桥 520ms/);
  assert.match(admin, /joanna-intimate-final-d\.wav\?v=20261030-voice-preview-2/);
  assert.match(admin, /audio\.currentTime = Math\.max\(0, seekTo\)/);
  assert.match(admin, /data-voice-preview-id/);
  assert.match(css, /\.adm-voice-preview-card audio\s*\{[\s\S]*?width:\s*100%/);
});

test("voice preview WAV files exist and are valid RIFF/WAVE", () => {
  for (const fileName of previewFiles) {
    const file = path.join(previewRoot, fileName);
    const stat = fs.statSync(file);
    const minimumBytes = fileName.includes("user-rule-") ? 400_000 : fileName.includes("moan-breath-c") ? 500_000 : 1_000_000;
    assert.ok(stat.size > minimumBytes, `${fileName} is a valid preview sample`);
    const header = fs.readFileSync(file).subarray(0, 12);
    assert.equal(header.subarray(0, 4).toString("ascii"), "RIFF");
    assert.equal(header.subarray(8, 12).toString("ascii"), "WAVE");
    if (fileName === "moan-breath-c.wav") {
      const digest = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
      assert.equal(digest, "a6ea5970aa1e0ebf3e1ffa4dda52d58bec87daec95e1ee78004fffd10888d26e", "approved Joanna breath reference must remain byte-identical");
    }
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
