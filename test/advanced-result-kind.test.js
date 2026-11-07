"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const create = fs.readFileSync(path.join(root, "platform.create.js"), "utf8");
const ui = fs.readFileSync(path.join(root, "platform.ui.js"), "utf8");
const explore = fs.readFileSync(path.join(root, "platform.explore.js"), "utf8");
const source = create.match(/function advancedResultKind\(record = \{\}\) \{[\s\S]*?\n\}/)?.[0] || "";
assert.ok(source, "advancedResultKind should exist");

const advancedResultKind = new Function(
  "generationVideoUrl",
  "generationImageResultUrl",
  `${source}\nreturn advancedResultKind;`,
)(() => "", () => "");

test("pending image tasks stay in the image result tab before a result URL exists", () => {
  assert.equal(advancedResultKind({
    taskId: "pending-image-abc",
    kind: "advanced-image",
    provider: "qwen-image3",
  }), "image");
  assert.equal(advancedResultKind({
    taskId: "pending-playflux-abc",
    kind: "asset-image",
    params: { createKind: "image" },
  }), "image");
  assert.equal(advancedResultKind({
    taskId: "pending-custom-abc",
    source: "asset-image-modify",
    params: { createKind: "image" },
  }), "image");
});

test("pending video and conversation tasks keep their own result tabs", () => {
  assert.equal(advancedResultKind({
    taskId: "pending-video-abc",
    kind: "advanced-video",
  }), "video");
  assert.equal(advancedResultKind({
    taskId: "pending-text-abc",
    kind: "advanced-text",
  }), "conversation");
});

test("all generated task entry points select the matching result tab", () => {
  assert.match(create, /const pendingTaskId = `pending-text-[\s\S]{0,120}?setAdvancedResultMediaKind\("conversation"\);/);
  assert.match(create, /setAdvancedResultMediaKind\("image"\);[\s\S]{0,100}?const pendingTaskId = `pending-image/);
  assert.match(create, /setAdvancedResultMediaKind\("video"\);[\s\S]{0,100}?const pendingTaskId = `pending-video/);
  assert.match(explore, /setAdvancedResultMediaKind\(isVideo \? "video" : "image"\);\s*mergeAdvancedResultRecord\(playfluxTemplateRecordBase/);
});

test("image result cards are rendered before video posters and have no play icon", () => {
  const body = create.match(/function renderAdvancedResultPanel\(\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.ok(body, "renderAdvancedResultPanel should exist");
  const imageBranch = body.indexOf(": imageUrl");
  const videoBranch = body.indexOf(": videoUrl || posterUrl");
  assert.ok(imageBranch >= 0, "image result branch should exist");
  assert.ok(videoBranch > imageBranch, "image URLs must win over poster/video rendering");
  const imageMarkup = body.slice(imageBranch, videoBranch);
  assert.doesNotMatch(imageMarkup, /data-lucide="play"/);
});

test("front-end image helpers reject upstream video URLs", () => {
  const helper = ui.match(/function isGenerationImageOutputUrl\(value\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.ok(helper, "isGenerationImageOutputUrl should exist");
  assert.match(helper, /mp4\|webm\|mov\|m4v/);
  assert.match(ui, /\.filter\(isGenerationImageOutputUrl\)/);
});
