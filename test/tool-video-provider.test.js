"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
const explore = fs.readFileSync(path.join(root, "platform.explore.js"), "utf8");
const html = fs.readFileSync(path.join(root, "platform.html"), "utf8");

test("all Video template surfaces default to Wan2.7 video edit", () => {
  assert.match(server, /const TOOL_VIDEO_DEFAULT_PROVIDER = "wan27";/);
  assert.match(server, /if \(normalizedProvider === "wan27"\) return "wan27-video-edit";/);
  assert.match(server, /isToolVideoTemplateRequest \? toolVideoDefaultCapability\(toolVideoProvider\) : ""/);
  assert.match(explore, /tenantStringFeature\("videoProvider", "wan27"\)/);
  assert.match(explore, /return \["wan30", "wan27", "happyhorse", "seedance"\]\.includes\(provider\) \? provider : "wan27"/);
  assert.match(explore, /const PLAYFLUX_WAN27_VIDEO_EDIT_CAPABILITY = "wan27-video-edit"/);
  assert.match(server, /const forcePlayfluxWan27VideoEdit = isPlayfluxVideoTemplateRequest;/);
  assert.match(server, /forcePlayfluxWan27VideoEdit \? "wan27"/);
  assert.match(server, /forcePlayfluxWan27VideoEdit \? "wan27-video-edit"/);
  assert.doesNotMatch(explore, /isTenantTool\("video"\)\s*\?\s*tenantStringFeature\("videoProvider"/);
});

test("Video tool submits the uploaded image and reference video to Wan2.7 video edit", () => {
  const body = explore.slice(
    explore.indexOf("const generateBody = provider === \"wan30\""),
    explore.indexOf("provider === \"happyhorse\"", explore.indexOf("const generateBody = provider === \"wan30\"")),
  );
  assert.match(body, /videoCapability: PLAYFLUX_WAN27_VIDEO_EDIT_CAPABILITY/);
  assert.match(body, /prompt: playfluxTemplateVideoPrompt/);
  assert.match(body, /referenceImages: reference \? \[reference\] : \[\]/);
  assert.match(body, /videoUrl:/);
  assert.match(body, /followInputDuration: true/);
  assert.doesNotMatch(body, /firstFrameDataUrl|parameters: \{ mode:/);
});

test("Video tool uses the image-to-video person replacement prompt for Wan2.7", () => {
  assert.match(server, /provider === "wan27" && requestParams\.videoCapability === "wan27-video-edit"/);
  assert.match(server, /requestParams\.videoCapability === "wan27-video-edit"\s*&&\s*requestParams\.followInputDuration/);
  assert.match(explore, /return "将视频中的人物替换成图片中的人物。保持图片中人物的身份、脸部、发型、体型、肤色和服装特征，严格参考原视频的动作顺序、姿态变化、节奏、运镜、构图、场景、光线、剪辑、音频和时长。除人物身份替换外，不改变原视频内容，不添加文字、字幕、标志、水印或其他人物。";/);
  assert.match(server, /if \(isPlayfluxVideoReferenceRequest && provider !== "wan27"\)/);
});

test("Video tool matches Wan2.7 output duration and billing to the reference video", () => {
  assert.match(explore, /Math\.max\(2, Math\.min\(10, Math\.round\(referenceDuration\)\)\)/);
  assert.match(explore, /provider === "wan27" \? Math\.min\(duration, seconds\) : seconds/);
  assert.match(server, /requestParams\.duration = Math\.max\(2, Math\.min\(10, Math\.ceil\(primaryVideoDuration\)\)\)/);
  assert.match(server, /requestParams\.videoCapability === "wan27-video-edit" && requestParams\.followInputDuration/);
  assert.match(server, /capabilityDefinition\?\.billing === "input_output"/);
});

test("Video tool estimate uses the same capability as generation", () => {
  const estimateSource = server.slice(
    server.indexOf("async function handleAdvancedEstimate("),
    server.indexOf("async function buildTemplateModelDoc("),
  );
  assert.match(estimateSource, /if \(isToolVideoTemplateEstimate\) \{\s*params\.videoCapability = toolVideoDefaultCapability\(provider\);\s*\}/);
});

test("game feed does not contain Video tool estimate state", () => {
  const gameFeedSource = server.slice(
    server.indexOf("async function handleGameFeed("),
    server.indexOf("async function handleUnlockVideo("),
  );
  assert.doesNotMatch(gameFeedSource, /isToolVideoTemplateEstimate|params\.videoCapability|toolVideoDefaultCapability/);
});

test("Video template provider is shared across old, new2, and tool tenant", () => {
  assert.match(explore, /function playfluxTemplateVideoProvider\(\)/);
  assert.match(explore, /return \["wan30", "wan27", "happyhorse", "seedance"\]\.includes\(provider\) \? provider : "wan27"/);
  assert.match(html, /platform\.js\?v=ai-\d+-[a-z0-9-]+/);
});
