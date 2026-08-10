"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const serverSource = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
const copySource = fs.readFileSync(path.join(__dirname, "..", "platform.copy.js"), "utf8");
const uiSource = fs.readFileSync(path.join(__dirname, "..", "platform.ui.js"), "utf8");

test("external model docs list every currently supported model family", () => {
  for (const marker of [
    "Seedance 2.0 Standard",
    "Seedance 2.0 Fast",
    "Wan 3.0 Video",
    "Seedance 2.5",
    "Seedance2.5 (NSFW)",
    "Wan2.7 Video",
    "HappyHorse Video",
    "Wan Animate",
    "Seedream 5.0 Pro",
    "Qwen Image 3.0",
    "Wan2.7 Image",
  ]) {
    assert.match(serverSource, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("external docs cover advanced request fields and polling without internal credentials", () => {
  for (const functionName of [
    "advancedAssetParameterFields",
    "wan30VideoParameterFields",
    "seedance25VideoParameterFields",
    "seedanceNsfwVideoParameterFields",
    "wan27VideoParameterFields",
    "happyhorseVideoParameterFields",
    "wanAnimateVideoParameterFields",
  ]) {
    assert.match(serverSource, new RegExp(`function ${functionName}\\(\\)`));
  }
  assert.match(serverSource, /\/api\/generation-records\/<taskId>/);
  assert.match(serverSource, /PNG transparency is not supported/);
  assert.match(serverSource, /input-video seconds plus output duration must not exceed 30 seconds/);
  assert.doesNotMatch(serverSource.slice(serverSource.indexOf("function externalAdvancedApiDoc"), serverSource.indexOf("function docsPricingView")), /API_KEY|Secret Access Key|ep-\d/);
});

test("Copy token plus docs advertises all model routes and loads the live markdown source", () => {
  assert.match(copySource, /const ADVANCED_VIDEO_ACCESS_COPY/);
  assert.match(copySource, /Wan 3\.0, Seedance 2\.5, Seedance2\.5 \(NSFW\), Wan2\.7, HappyHorse, and Wan Animate/);
  assert.match(copySource, /\/api\/vipeak1\/image-edit/);
  assert.match(uiSource, /fetchLatestModelDocsMarkdown/);
  assert.match(uiSource, /\/api\/advanced\/generate/);
  assert.match(uiSource, /\/api\/generation-records\/<taskId>/);
});
