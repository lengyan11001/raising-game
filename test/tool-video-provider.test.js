"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
const explore = fs.readFileSync(path.join(root, "platform.explore.js"), "utf8");
const config = fs.readFileSync(path.join(root, "platform.config.js"), "utf8");
const html = fs.readFileSync(path.join(root, "platform.html"), "utf8");

test("Video template surfaces use the Seedance replacement route", () => {
  assert.match(server, /const TOOL_VIDEO_DEFAULT_PROVIDER = "seedance";/);
  assert.match(server, /const TOOL_VIDEO_SEEDANCE_MODEL = "ep-20260429142513-zg667";/);
  assert.match(server, /const isVideoReplacementRequest = isToolVideoTemplateRequest/);
  assert.match(server, /isVideoReplacementRequest \? "seedance"/);
  assert.match(explore, /isTenantTool\("video"\)[\s\S]*?return "seedance"/);
  assert.match(explore, /model: "ep-20260429142513-zg667"/);
  assert.match(config, /id: "video-image"[\s\S]*?provider: "seedance"[\s\S]*?seedanceMode: "reference_video"/);
});

test("Video tool Seedance payload includes ordered references and fixed options", () => {
  const seedanceBody = explore;
  assert.match(seedanceBody, /prompt: VIDEO_REPLACE_PROMPT/);
  assert.match(seedanceBody, /referenceImages: .*seedanceImageRefPayload\(reference\)/s);
  assert.match(seedanceBody, /referenceVideoUrls:/);
  assert.match(seedanceBody, /generate_audio: true/);
  assert.match(seedanceBody, /watermark: false/);
});

test("Video replacement uses the fixed prompt, model, and reference mode", () => {
  assert.match(server, /if \(isVideoReplacementRequest\) prompt = VIDEO_REPLACE_PROMPT/);
  assert.match(server, /seedanceMode = isVideoReplacementRequest\s*\? "reference_video"/);
  assert.match(server, /requestParams\.model = provider === "seedance"\s*\? \(isVideoReplacementRequest \? TOOL_VIDEO_SEEDANCE_MODEL/);
  assert.match(server, /requestParams\.duration = 6/);
  assert.match(server, /requestParams\.resolution = "720p"/);
});

test("Video template provider helper remains available to all platform surfaces", () => {
  assert.match(explore, /function playfluxTemplateVideoProvider\(\)/);
  assert.match(html, /platform\.js\?v=ai-\d+-[a-z0-9-]+/);
});
