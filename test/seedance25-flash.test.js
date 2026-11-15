"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const application = require("../server");
const {
  SEEDANCE25_FLASH_ENDPOINT_ID,
  SEEDANCE25_FLASH_MODEL,
  buildSeedance25FlashTaskPayload,
  flashEstimatedCompletionTokens,
  flashPurchaseUsdPerSecond,
  normalizeSeedance25FlashMode,
  validateSeedance25FlashInput,
} = require("../seedance25-flash");
const {
  normalizeAdvancedProvider,
  publicProviderLabel,
} = require("../lib-providers");

const root = path.resolve(__dirname, "..");
const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
const flashModuleSource = fs.readFileSync(path.join(root, "seedance25-flash.js"), "utf8");
const platformConfig = fs.readFileSync(path.join(root, "platform.config.js"), "utf8");
const platformHtml = fs.readFileSync(path.join(root, "platform.html"), "utf8");
const platformUi = fs.readFileSync(path.join(root, "platform.ui.js"), "utf8");
const platformCreate = fs.readFileSync(path.join(root, "platform.create.js"), "utf8");

const image = (name = "image.png") => `asset://image-${name}`;
const video = (name = "video.mp4") => `asset://video-${name}`;
const audio = (name = "audio.mp3") => `asset://audio-${name}`;
const publicImage = (name = "image.png") => `https://cdn.example.com/${name}`;

function inputError(fn, code) {
  assert.throws(fn, (error) => {
    assert.equal(error.code, code);
    assert.equal(error.statusCode, 400);
    return true;
  });
}

test("normalizes Flash aliases before generic Seedance and exposes its public label", () => {
  for (const alias of [
    "seedance25-flash",
    "seedance25flash",
    "seedance2.5-flash",
    SEEDANCE25_FLASH_ENDPOINT_ID,
    SEEDANCE25_FLASH_MODEL,
  ]) {
    assert.equal(normalizeAdvancedProvider(alias), "seedance25-flash");
  }
  assert.equal(normalizeAdvancedProvider("seedance25"), "seedance25");
  assert.equal(normalizeAdvancedProvider("seedance25-nsfw"), "seedance-nsfw");
  assert.equal(publicProviderLabel("seedance25-flash"), "Seedance 2.5 Flash");
});

test("builds the confirmed Flash multimodal payload with audio enabled by default", () => {
  const payload = buildSeedance25FlashTaskPayload({
    prompt: "Animate the references",
    imageAssets: [image("one.png"), image("two.png"), image("two.png")],
    videoAssets: [video("motion.mp4")],
    audioAssets: [audio("music.mp3")],
    resolution: "720P",
    ratio: "16:9",
    duration: 8,
    seed: 42,
  });

  assert.equal(payload.model, SEEDANCE25_FLASH_ENDPOINT_ID);
  assert.equal(payload.resolution, "720p");
  assert.equal(payload.ratio, "16:9");
  assert.equal(payload.duration, 8);
  assert.equal(payload.generate_audio, true);
  assert.equal(payload.watermark, false);
  assert.equal(payload.output_format, "mp4");
  assert.equal(payload.seed, 42);
  assert.equal("moderation" in payload, false);
  assert.deepEqual(payload.content, [
    { type: "text", text: "Animate the references" },
    { type: "image_url", image_url: { url: image("one.png") }, role: "reference_image" },
    { type: "image_url", image_url: { url: image("two.png") }, role: "reference_image" },
    { type: "video_url", video_url: { url: video("motion.mp4") }, role: "reference_video" },
    { type: "audio_url", audio_url: { url: audio("music.mp3") }, role: "reference_audio" },
  ]);
});

test("First + Last Frame uses frame roles and omits ratio", () => {
  const payload = buildSeedance25FlashTaskPayload({
    prompt: "Transition between the frames",
    mode: "first-last-frame",
    firstFrameUrl: image("first.png"),
    lastFrameUrl: image("last.png"),
    resolution: "480p",
    ratio: "9:16",
    duration: 4,
  });

  assert.equal(normalizeSeedance25FlashMode("first-last-frame"), "first_last_frame");
  assert.equal("ratio" in payload, false);
  assert.deepEqual(payload.content, [
    { type: "text", text: "Transition between the frames" },
    { type: "image_url", image_url: { url: image("first.png") }, role: "first_frame" },
    { type: "image_url", image_url: { url: image("last.png") }, role: "last_frame" },
  ]);
});

test("validates modes, resolution, integer duration, ratios, and uploaded asset URIs", () => {
  inputError(() => validateSeedance25FlashInput({ prompt: "x", mode: "edit", duration: 4 }), "SEEDANCE25_FLASH_INVALID_MODE");
  inputError(() => validateSeedance25FlashInput({ prompt: "x", resolution: "1080p", duration: 4 }), "SEEDANCE25_FLASH_INVALID_RESOLUTION");
  inputError(() => validateSeedance25FlashInput({ prompt: "x", ratio: "2:1", duration: 4 }), "SEEDANCE25_FLASH_INVALID_RATIO");
  inputError(() => validateSeedance25FlashInput({ prompt: "x", duration: 3.5 }), "SEEDANCE25_FLASH_INVALID_DURATION");
  inputError(() => validateSeedance25FlashInput({ prompt: "x", duration: 31 }), "SEEDANCE25_FLASH_INVALID_DURATION");
  inputError(() => validateSeedance25FlashInput({ prompt: "x", duration: 4, imageAssets: [publicImage("uploaded.png")] }), "SEEDANCE25_FLASH_INVALID_MEDIA_URL");
  inputError(() => validateSeedance25FlashInput({ prompt: "x", duration: 4, videoAssets: ["/local/video.mp4"] }), "SEEDANCE25_FLASH_INVALID_MEDIA_URL");
});

test("enforces media limits and rejects mixed frame/reference modes", () => {
  const elevenImages = Array.from({ length: 11 }, (_, index) => image(`${index}.png`));
  inputError(() => validateSeedance25FlashInput({ prompt: "x", duration: 4, imageAssets: elevenImages }), "SEEDANCE25_FLASH_TOO_MANY_IMAGES");

  const sixVideos = Array.from({ length: 6 }, (_, index) => video(`${index}.mp4`));
  inputError(() => validateSeedance25FlashInput({ prompt: "x", duration: 4, videoAssets: sixVideos }), "SEEDANCE25_FLASH_TOO_MANY_VIDEOS");

  const sixAudios = Array.from({ length: 6 }, (_, index) => audio(`${index}.mp3`));
  inputError(() => validateSeedance25FlashInput({ prompt: "x", duration: 4, audioAssets: sixAudios }), "SEEDANCE25_FLASH_TOO_MANY_AUDIOS");

  const tenImages = Array.from({ length: 10 }, (_, index) => image(`${index}.png`));
  const maxReferences = validateSeedance25FlashInput({
    prompt: "x",
    duration: 4,
    imageAssets: tenImages,
    videoAssets: Array.from({ length: 5 }, (_, index) => video(`${index}.mp4`)),
    audioAssets: Array.from({ length: 5 }, (_, index) => audio(`${index}.mp3`)),
  });
  assert.equal(maxReferences.images.length + maxReferences.videos.length + maxReferences.audios.length, 20);
  assert.ok(flashModuleSource.includes("validatedImages.length + validatedVideos.length + validatedAudios.length > 20"));

  inputError(() => validateSeedance25FlashInput({
    prompt: "x",
    mode: "first_last_frame",
    firstFrameUrl: image("first.png"),
    duration: 4,
  }), "SEEDANCE25_FLASH_FRAMES_REQUIRED");

  inputError(() => validateSeedance25FlashInput({
    prompt: "x",
    mode: "first_last_frame",
    firstFrameUrl: image("first.png"),
    lastFrameUrl: image("last.png"),
    imageAssets: [image("reference.png")],
    duration: 4,
  }), "SEEDANCE25_FLASH_INVALID_MEDIA_COMBINATION");
});

test("calculates official token use and 1.5x sale rates", async () => {
  assert.equal(flashEstimatedCompletionTokens({ resolution: "480p", outputSeconds: 4 }), 38430);
  assert.equal(flashEstimatedCompletionTokens({ resolution: "720p", outputSeconds: 4, inputVideoSeconds: 1 }), 108000);
  assert.equal(flashPurchaseUsdPerSecond("480p"), 0.0672525);
  assert.equal(flashPurchaseUsdPerSecond("720p"), 0.1512);
  assert.equal(flashPurchaseUsdPerSecond("480p", { hasVideoInput: true }), 0.04131225);
  assert.equal(flashPurchaseUsdPerSecond("720p", { hasVideoInput: true }), 0.09288);

  const sd = application.advancedModelPricing("seedance25-flash", { duration: 4, resolution: "480p" });
  const hd = application.advancedModelPricing("seedance25-flash", { duration: 4, resolution: "720p" });
  const sdVideo = application.advancedModelPricing("seedance25-flash", { duration: 4, resolution: "480p", inputVideoSeconds: 1 });
  const hdVideo = application.advancedModelPricing("seedance25-flash", { duration: 4, resolution: "720p", inputVideoSeconds: 1 });

  assert.equal(sd.creditsPerSecond, 10.087875);
  assert.equal(hd.creditsPerSecond, 22.68);
  assert.equal(sdVideo.creditsPerSecond, 6.196838);
  assert.equal(hdVideo.creditsPerSecond, 13.932);
  assert.equal(sd.credits, 40.3515);
  assert.equal(hd.credits, 90.72);
  assert.equal(sdVideo.baseCredits, 30.9842);
  assert.equal(hdVideo.baseCredits, 69.66);
  assert.equal(sdVideo.billingSeconds, 5);
  assert.equal(hdVideo.inputVideoCredits, 13.932);
  assert.equal(sd.source, "seedance25_flash_token_estimate");

  const purchases = Object.fromEntries((await application.adminAdvancedPricingView()).rows
    .filter((row) => row.key.startsWith("seedance-flash-"))
    .map((row) => [row.key, row.purchaseCreditsPerSecond]));
  assert.deepEqual(purchases, {
    "seedance-flash-480p": 6.72525,
    "seedance-flash-720p": 15.12,
    "seedance-flash-video-input-480p": 4.131225,
    "seedance-flash-video-input-720p": 9.288,
  });
});

test("publishes and saves the four Flash pricing rows", async () => {
  const publicRates = Object.fromEntries(application.publicAdvancedPricingRows()
    .filter((row) => row.key.startsWith("seedance-flash-"))
    .map((row) => [row.key, row.saleCreditsPerUnit]));
  assert.deepEqual(publicRates, {
    "seedance-flash-480p": 10.087875,
    "seedance-flash-720p": 22.68,
    "seedance-flash-video-input-480p": 6.196838,
    "seedance-flash-video-input-720p": 13.932,
  });

  const admin = await application.adminAdvancedPricingView();
  const labels = Object.fromEntries(admin.rows
    .filter((row) => row.key.startsWith("seedance-flash-"))
    .map((row) => [row.key, row.providerLabel]));
  assert.equal(labels["seedance-flash-480p"], "Seedance 2.5 Flash");
  assert.equal(labels["seedance-flash-video-input-720p"], "Seedance 2.5 Flash + Video");

  const saveSource = server.slice(server.indexOf("function advancedPricingFromBody("));
  assert.match(saveSource, /key === "seedance-flash-480p"[\s\S]*?seedanceFlashCreditsPerSecondByResolution\["480p"\] = credits/);
  assert.match(saveSource, /key === "seedance-flash-720p"[\s\S]*?seedanceFlashCreditsPerSecondByResolution\["720p"\] = credits/);
  assert.match(saveSource, /key === "seedance-flash-video-input-480p"[\s\S]*?seedanceFlashVideoCreditsPerSecondByResolution\["480p"\] = credits/);
  assert.match(saveSource, /key === "seedance-flash-video-input-720p"[\s\S]*?seedanceFlashVideoCreditsPerSecondByResolution\["720p"\] = credits/);
});

test("routes Flash through the Ark task endpoint only with uploaded asset URIs", () => {
  assert.ok(server.includes("const SEEDANCE25_FLASH_ENDPOINT = String(process.env.SEEDANCE25_FLASH_ENDPOINT_ID || SEEDANCE25_FLASH_ENDPOINT_ID).trim()"));
  assert.ok(server.includes('["seedance25", SEEDANCE25_FLASH_PROVIDER, SEEDANCE25_DIRECT_PROVIDER].includes(provider)'));
  assert.ok(server.includes('return await handleAdvancedSeedance25Generate(req, res, {'));
  assert.ok(server.includes('if (flash) buildSeedance25FlashTaskPayload(upstreamInput, SEEDANCE25_FLASH_ENDPOINT)'));
  assert.ok(server.includes('submitted = await submitArkTaskAfterAssetsReady(upstreamPayload)'));
  const flashSubmit = server.slice(
    server.indexOf("if (flash) {\n      upstreamPayload"),
    server.indexOf("} else if (direct) {", server.indexOf("if (flash) {\n      upstreamPayload")),
  );
  assert.ok(flashSubmit.includes("buildSeedance25FlashTaskPayload"));
  assert.ok(flashSubmit.includes("submitArkTaskAfterAssetsReady"));
  assert.doesNotMatch(flashSubmit, /arkRequest\("POST", "\/contents\/generations\/tasks"/);
  assert.match(server, /async function seedance25FlashReferenceAsset\(/);
  assert.match(server, /resolved = await ensureSeedanceAssetForUserAsset\(db, resolved\)/);
  assert.match(server, /imageFiles\.push\(prepared\.assetUri\)/);
  assert.match(server, /videoFiles\.push\(entry\.assetUri\)/);
  assert.match(server, /audioFiles\.push\(entry\.assetUri\)/);
  assert.match(server, /firstFrameSubmitUrl = prepared\.assetUri/);
  assert.match(server, /lastFrameSubmitUrl = prepared\.assetUri/);
  assert.doesNotMatch(server.slice(server.indexOf("function buildSeedance25FlashTaskPayload("), server.indexOf("function flashEstimatedCompletionTokens(")), /moderation/);
});

test("raw public image references do not dereference missing owned assets", () => {
  const guarded = "imageAssets.map((asset) => asset?.id).filter(Boolean)";
  assert.ok(server.includes(`referenceImageAssetIds: ${guarded}`));
  assert.ok(server.includes(`imageAssetIds: ${guarded}`));
});

test("Advanced UI exposes only Flash resolutions, modes, limits, and audio defaults", () => {
  assert.match(platformHtml, /<option value="seedance25-flash">Seedance 2\.5 Flash<\/option>/);
  assert.match(platformConfig, /id: "seedance25-flash"[\s\S]*?resolutions: \["480p", "720p"\][\s\S]*?ratios: \["16:9", "21:9", "9:16", "4:3", "3:4", "1:1", "adaptive"\][\s\S]*?durations: \[4, 5, 8, 10, 15, 20, 30\][\s\S]*?value: "omini"[\s\S]*?value: "first_last_frame"/);
  assert.match(platformConfig, /ADVANCED_SEEDANCE25_FLASH_IMAGE_REFERENCE_LIMIT = 10/);
  assert.match(platformConfig, /ADVANCED_SEEDANCE25_FLASH_VIDEO_REFERENCE_LIMIT = 5/);
  assert.match(platformConfig, /ADVANCED_SEEDANCE25_FLASH_AUDIO_REFERENCE_LIMIT = 5/);
  assert.match(platformConfig, /ADVANCED_SEEDANCE25_FLASH_TOTAL_REFERENCE_LIMIT = 20/);
  assert.match(platformUi, /normalizedProvider === "seedance25-flash"[\s\S]*?seedanceFlashVideoCreditsPerSecondByResolution/);
  assert.match(platformCreate, /provider === "seedance25-flash" \? "advanced-seedance25-flash"/);
  assert.ok(platformCreate.includes('functionMode: ["seedance25", "seedance25-flash", "seedance-nsfw"].includes(provider) ? seedanceMode : undefined'));
});
