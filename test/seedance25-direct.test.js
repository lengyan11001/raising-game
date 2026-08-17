"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  buildSeedance25DirectTaskPayload,
  directEstimatedCompletionTokens,
  directPurchaseUsdPerSecond,
  validateSeedance25DirectInput,
} = require("../seedance25-direct");

const serverSource = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");

test("generated videos retry upstream downloads when the saved file is shorter than requested", () => {
  assert.match(serverSource, /expectedGeneratedVideoDurationSeconds/);
  assert.match(serverSource, /generatedVideoIsTooShort/);
  assert.match(serverSource, /GENERATED_VIDEO_DOWNLOAD_MAX_ATTEMPTS/);
  assert.match(serverSource, /generated-video-download-retry/);
  assert.match(serverSource, /fs\.rename\(temporaryPath, localVideoPath\)/);
});

test("direct Seedance 2.5 purchase rates match official token pricing", () => {
  assert.equal(directPurchaseUsdPerSecond("480p"), 0.10280025);
  assert.equal(directPurchaseUsdPerSecond("720p"), 0.23112);
  assert.equal(directPurchaseUsdPerSecond("480p", { hasVideoInput: true }), 0.061488);
  assert.equal(directPurchaseUsdPerSecond("720p", { hasVideoInput: true }), 0.13824);
  assert.equal(directEstimatedCompletionTokens({ resolution: "720p", outputSeconds: 5 }), 108000);
  assert.equal(directEstimatedCompletionTokens({ resolution: "480p", outputSeconds: 5, inputVideoSeconds: 3 }), 76860);
});

test("Seedance 2.5 NSFW customer billing stays at the configured sale price", () => {
  assert.match(serverSource, /function seedanceUsesConfiguredSalePrice/);
  assert.match(serverSource, /const finalCredits = configuredSalePrice \? preDeducted : usage\.credits/);
  assert.match(serverSource, /billingPriceSource: configuredSalePrice \? "configured_sale_price" : "upstream_token_usage"/);
  assert.match(serverSource, /upstreamCalculatedCredits: usage\.credits/);
});

test("direct payload keeps ordered multimodal references and required upstream flags", () => {
  const payload = buildSeedance25DirectTaskPayload({
    mode: "reference",
    prompt: "Use the references in order.",
    imageAssets: ["asset://image-1", "asset://image-2"],
    videoAssets: ["asset://video-1"],
    audioAssets: ["asset://audio-1"],
    resolution: "720p",
    ratio: "9:16",
    duration: 8,
    generateAudio: false,
    seed: 7,
  }, "ep-test");

  assert.equal(payload.model, "ep-test");
  assert.deepEqual(payload.content.map((item) => item.role || item.type), [
    "text",
    "reference_image",
    "reference_image",
    "reference_video",
    "reference_audio",
  ]);
  assert.equal(payload.generate_audio, false);
  assert.equal(payload.output_format, "mp4");
  assert.deepEqual(payload.Moderation, { Strategy: "Skip" });
  assert.equal(payload.seed, 7);
});

test("direct reference mode accepts audio-only media", () => {
  const normalized = validateSeedance25DirectInput({
    mode: "reference",
    audioAssets: ["asset://audio-1"],
    resolution: "480p",
    ratio: "adaptive",
    duration: 4,
  });
  assert.deepEqual(normalized.audios, ["asset://audio-1"]);
});

test("direct first-last frames are exclusive and ordered", () => {
  const payload = buildSeedance25DirectTaskPayload({
    mode: "first_last_frame",
    firstFrameAsset: "asset://first",
    lastFrameAsset: "asset://last",
    resolution: "480p",
    ratio: "adaptive",
    duration: 5,
  });
  assert.deepEqual(payload.content.map((item) => item.role), ["first_frame", "last_frame"]);
  assert.throws(() => buildSeedance25DirectTaskPayload({
    mode: "first_last_frame",
    firstFrameAsset: "asset://first",
    lastFrameAsset: "asset://last",
    imageAssets: ["asset://reference"],
    resolution: "480p",
    ratio: "adaptive",
    duration: 5,
  }), /cannot be mixed/);
});

test("direct edit follows the source-video duration", () => {
  const normalized = validateSeedance25DirectInput({
    mode: "edit",
    videoAssets: ["asset://video-1"],
    inputVideoSeconds: 8.2,
    resolution: "720p",
    ratio: "adaptive",
    duration: 4,
  });
  assert.equal(normalized.duration, 9);
  assert.throws(() => validateSeedance25DirectInput({
    mode: "edit",
    videoAssets: ["asset://video-1", "asset://video-2"],
    inputVideoSeconds: 8,
    resolution: "720p",
    ratio: "adaptive",
    duration: 4,
  }), /exactly one source video/);
});
