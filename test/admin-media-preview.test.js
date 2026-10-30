"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const admin = fs.readFileSync(path.join(__dirname, "..", "admin.js"), "utf8");
const css = fs.readFileSync(path.join(__dirname, "..", "admin.css"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "..", "admin.html"), "utf8");

function extractFunction(name) {
  const start = admin.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} exists`);
  const next = admin.indexOf("\nfunction ", start + 1);
  assert.ok(next > start, `${name} has a following function`);
  return admin.slice(start, next).trim();
}

function loadPreviewHelpers() {
  const code = [
    'function escapeHtml(value) { return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/\'/g, "&#39;"); }',
    extractFunction("adminMediaPreviewType"),
    extractFunction("adminMediaPreviewTrigger"),
    'module.exports = { adminMediaPreviewType, adminMediaPreviewTrigger };',
  ].join("\n");
  const sandbox = { module: { exports: {} }, exports: {} };
  vm.runInNewContext(code, sandbox);
  return sandbox.module.exports;
}

test("admin media preview selects images, videos, and audio without autoplaying thumbnails", () => {
  const { adminMediaPreviewType, adminMediaPreviewTrigger } = loadPreviewHelpers();
  assert.equal(adminMediaPreviewType("https://cdn.test/a.webp", "avatar"), "image");
  assert.equal(adminMediaPreviewType("https://cdn.test/a.mp4", "image"), "video");
  assert.equal(adminMediaPreviewType("https://cdn.test/a.m4a", ""), "audio");

  const image = adminMediaPreviewTrigger({ url: "https://cdn.test/a.webp", label: "场景图" });
  assert.match(image, /data-admin-media-preview/);
  assert.match(image, /<img src="https:\/\/cdn\.test\/a\.webp"/);

  const video = adminMediaPreviewTrigger({ url: "https://cdn.test/a.mp4", kind: "video", label: "视频素材" });
  assert.match(video, /<video src="https:\/\/cdn\.test\/a\.mp4#t=0\.1" muted playsinline preload="metadata"><\/video>/);
  assert.doesNotMatch(video, /controls|autoplay/);
  assert.match(video, /data-media-kind="video"/);
  assert.match(video, /adm-media-preview-play/);
  assert.match(video, /<span class="adm-media-preview-badge">播放<\/span>/);

  const ratioVideo = adminMediaPreviewTrigger({
    url: "https://cdn.test/a.mp4",
    kind: "video",
    label: "生成结果",
    className: "adm-record-thumb",
    style: "--video-ratio:9 / 16;",
  });
  assert.match(ratioVideo, /class="adm-media-preview-trigger adm-record-thumb" style="--video-ratio:9 \/ 16;"/);

  const audio = adminMediaPreviewTrigger({ url: "https://cdn.test/a.mp3", kind: "ambient-music", label: "环境音乐" });
  assert.match(audio, /<audio class="adm-media-preview-audio" src="https:\/\/cdn\.test\/a\.mp3" controls preload="metadata"><\/audio>/);
});

test("all live chat material editors render a preview trigger", () => {
  assert.match(admin, /function chatLiveStoryAssetField[\s\S]*?data-story-preview[\s\S]*?adminMediaPreviewTrigger/);
  assert.match(admin, /function chatLiveStoryAssetField[\s\S]*?data-story-open-preview[\s\S]*?预览播放/);
  assert.match(admin, /data-story-open-preview[\s\S]*?openAdminMediaPreview/);
  assert.match(admin, /function chatLiveAlbumCardHtml[\s\S]*?adminMediaPreviewTrigger/);
  assert.match(admin, /function chatLiveLookCard[\s\S]*?adminMediaPreviewTrigger/);
  assert.match(admin, /function chatLiveGiftsHtml[\s\S]*?data-gift-preview[\s\S]*?adminMediaPreviewTrigger/);
  assert.match(admin, /chatLiveUndressPreview[\s\S]*?adminMediaPreviewTrigger\(\{ url: current\.undressImageUrl/);
});

test("admin cards, records, templates, avatars, and geo samples render preview triggers", () => {
  assert.match(admin, /function videoOrPoster[\s\S]*?adminMediaPreviewTrigger/);
  assert.match(admin, /function generationRecordRowHtml[\s\S]*?className: "adm-record-thumb adm-record-thumb-preview"[\s\S]*?style: ratioStyle/);
  assert.match(admin, /function platformTemplatePreview[\s\S]*?adminMediaPreviewTrigger\(\{[\s\S]*?kind: isVideoUrl\(preview\) \? "video" : "image"/);
  assert.match(admin, /function chatLiveCharacterRow[\s\S]*?className: "adm-avatar adm-avatar-preview"/);
  assert.match(admin, /function renderGeoSampleCard[\s\S]*?adminMediaPreviewTrigger/);
});

test("story image previews refresh after upload and clear on failure", () => {
  const start = admin.indexOf("function bindChatLiveStoryAssetUploads(");
  const end = admin.indexOf("function readChatLivePersonaMarkdown(", start);
  assert.ok(start >= 0 && end > start);
  const source = admin.slice(start, end);
  assert.match(source, /const previewUrl = URL\.createObjectURL\(file\)/);
  assert.match(source, /preview\.innerHTML = adminMediaPreviewTrigger\(\{ url: previewUrl/);
  assert.match(source, /preview\.innerHTML = adminMediaPreviewTrigger\(\{ url: result\.url/);
  assert.match(source, /hidden\?\.value[\s\S]*?adminMediaPreviewTrigger\(\{ url: hidden\.value/);
  assert.match(source, /URL\.revokeObjectURL\(previewUrl\)/);
  assert.match(source, /kind: isVideo \? "private-video" : "look"/);
  assert.doesNotMatch(source, /imageUrl\s*=\s*result\.url/);
});

test("media lightbox supports full-size image and playable video previews", () => {
  assert.match(admin, /function openAdminMediaPreview/);
  assert.match(admin, /lightbox\.className = "adm-media-lightbox"/);
  assert.match(admin, /data-media-url=/);
  assert.match(admin, /<video src="\$\{escapeHtml\(source\)\}" controls autoplay playsinline/);
  assert.match(admin, /addEventListener\("keydown"[\s\S]*?Escape/);
  assert.match(css, /\.adm-media-lightbox\s*\{[\s\S]*?position:\s*fixed/);
  assert.match(css, /\.adm-media-preview-trigger img,[\s\S]*?object-fit:\s*cover/);
  assert.match(css, /\.adm-media-preview-play\s*\{[\s\S]*?position:\s*absolute/);
  assert.match(css, /\.adm-story-media-empty\s*\{/);
  assert.match(css, /\.chat-live-story-preview[\s\S]*?aspect-ratio:\s*16\s*\/\s*10/);
  assert.match(css, /\.adm-record-thumb-preview\s*\{[\s\S]*?display:\s*inline-block/);
  assert.match(css, /\.platform-mini-preview-link\s*\{[\s\S]*?width:\s*58px/);
  assert.match(css, /\.adm-avatar-preview\s*\{[\s\S]*?width:\s*38px/);
  assert.match(css, /\.adm-geo-sample-card > \.adm-media-preview-trigger\s*\{[\s\S]*?aspect-ratio:\s*9\s*\/\s*13/);
});

test("admin entry busts cached preview assets and disables edge caching", () => {
  assert.match(html, /admin\.css\?v=20261030-voice-preview-4/);
  assert.match(html, /admin\.js\?v=20261030-voice-preview-4/);
  assert.match(admin, /function adminMediaPreviewTrigger/);
  assert.match(css, /\.adm-media-lightbox/);
});
