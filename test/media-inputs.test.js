"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
  minimumImageTargetDimensions,
  referenceVideoDurationViolation,
} = require("../media-inputs");

const server = fs.readFileSync(path.resolve(__dirname, "..", "server.js"), "utf8");

test("small reference images are enlarged proportionally to the upstream minimum", () => {
  assert.deepEqual(minimumImageTargetDimensions(204, 204), {
    width: 300,
    height: 300,
    changed: true,
    scale: 300 / 204,
  });
  assert.deepEqual(minimumImageTargetDimensions(400, 600), {
    width: 400,
    height: 600,
    changed: false,
    scale: 1,
  });
});

test("every Seedance reference video is checked against the asset duration bounds", () => {
  assert.equal(referenceVideoDurationViolation([
    { label: "Video 1", durationSeconds: 8 },
    { label: "Video 2", durationSeconds: 15.2 },
  ]), null);
  assert.deepEqual(referenceVideoDurationViolation([
    { label: "Video 1", durationSeconds: 8 },
    { label: "Video 2", durationSeconds: 15.9667 },
  ]), {
    index: 1,
    label: "Video 2",
    durationSeconds: 15.9667,
    minSeconds: 1.8,
    maxSeconds: 15.2,
  });
});

test("server applies media checks before upstream generation and mirrors tool uploads", () => {
  assert.match(server, /await validateSeedanceReferenceVideoDurationsForRequest\(\{ urls: pricingBody\.reference_videos \}\)/);
  assert.match(server, /referenceVideoAssets: seedanceVideoAssets/);
  assert.match(server, /const objectStorage = await uploadLocalAssetMirrorToObjectStorage\(\{ localUrl, bytes: mirrorBytes, mime \}\)/);
  assert.match(server, /objectStorageKey: objectStorage\.key \|\| ""/);
  assert.match(server, /userAsset = await normalizeUserImageAssetForUpstream/);
});
