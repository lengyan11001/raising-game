"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
const explore = fs.readFileSync(path.join(root, "platform.explore.js"), "utf8");
const html = fs.readFileSync(path.join(root, "platform.html"), "utf8");

test("Video tool defaults to guided Wan2.7 Reference to Video", () => {
  assert.match(server, /const TOOL_VIDEO_DEFAULT_PROVIDER = "wan27";/);
  assert.match(server, /if \(normalizedProvider === "wan27"\) return "wan27-r2v";/);
  assert.match(server, /isToolVideoTemplateRequest \? toolVideoDefaultCapability\(toolVideoProvider\) : ""/);
});

test("Video tool submits the uploaded image and reference video to Wan2.7", () => {
  const body = explore.slice(
    explore.indexOf("const generateBody = provider === \"wan27\""),
    explore.indexOf(": provider === \"happyhorse\"", explore.indexOf("const generateBody = provider === \"wan27\"")),
  );
  assert.match(body, /videoCapability: PLAYFLUX_WAN_VIDEO_CAPABILITY/);
  assert.match(body, /referenceImages: reference \? \[reference\] : \[\]/);
  assert.match(body, /referenceVideoUrls:/);
  assert.doesNotMatch(body, /firstFrameDataUrl|parameters: \{ mode:/);
});

test("Video tool applies the image-identity-first prompt guide to Wan2.7", () => {
  assert.match(server, /provider === "wan27" && requestParams\.videoCapability === "wan27-r2v"/);
  assert.match(server, /requestParams\.videoCapability === "wan27-r2v"\s*\? "wan27-r2v"/);
  assert.match(server, /Image 1 is the user's selected character\/source image/);
  assert.match(server, /Use Video 1 only for motion, action, camera, and composition/);
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

test("Video tool frontend uses the shared tenant helper", () => {
  assert.match(explore, /isTenantTool\("video"\)/);
  assert.doesNotMatch(explore, /isToolTenant\(/);
  assert.match(html, /platform\.js\?v=ai-324-wan-r2v-guided/);
});
