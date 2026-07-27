"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
const explore = fs.readFileSync(path.join(root, "platform.explore.js"), "utf8");
const html = fs.readFileSync(path.join(root, "platform.html"), "utf8");

test("Video tool defaults to Wan2.7 Reference to Video", () => {
  assert.match(server, /const TOOL_VIDEO_DEFAULT_PROVIDER = "wan27";/);
  assert.match(server, /if \(normalizedProvider === "wan27"\) return "wan27-r2v";/);
  assert.match(server, /isToolVideoTemplateRequest \? toolVideoDefaultCapability\(toolVideoProvider\) : ""/);
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
  assert.match(html, /platform\.js\?v=ai-318-mobile-auth/);
});
