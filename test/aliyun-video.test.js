"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  ANIMATE_SYNTHESIS_PATH,
  LEGACY_WAN_MODELS,
  VIDEO_SYNTHESIS_PATH,
  buildAliyunVideoRequest,
  officialSingaporeLegacyPricingRows,
  officialSingaporePurchaseDetails,
  officialSingaporePurchaseRate,
} = require("../aliyun-video");

const image = (url = "https://example.com/person.png") => ({ type: "reference_image", url });
const video = (url = "https://example.com/action.mp4") => ({ type: "reference_video", url });

test("builds Wan2.7 text-to-video", () => {
  const request = buildAliyunVideoRequest({
    capability: "wan27-t2v",
    prompt: "A tracking shot",
    duration: 5,
    resolution: "720p",
  });
  assert.equal(request.endpoint, VIDEO_SYNTHESIS_PATH);
  assert.equal(request.payload.model, "wan2.7-t2v-2026-06-12");
  assert.equal(request.payload.input.media, undefined);
});

test("builds Wan2.7 image-to-video first/last frame", () => {
  const request = buildAliyunVideoRequest({
    capability: "wan27-i2v",
    prompt: "Move naturally",
    media: [
      { type: "first_frame", url: "https://example.com/first.png" },
      { type: "last_frame", url: "https://example.com/last.png" },
    ],
    duration: 8,
    resolution: "1080P",
  });
  assert.deepEqual(request.payload.input.media.map((item) => item.type), ["first_frame", "last_frame"]);
  assert.equal(request.payload.parameters.resolution, "1080P");
});

test("builds Wan2.7 multimodal reference request with voice", () => {
  const request = buildAliyunVideoRequest({
    capability: "wan27-r2v",
    prompt: "Image 1 follows Video 1",
    media: [
      { ...image(), referenceVoice: "https://example.com/voice.mp3" },
      video(),
    ],
    duration: 10,
  });
  assert.equal(request.payload.model, "wan2.7-r2v-2026-06-12");
  assert.equal(request.payload.input.media[0].reference_voice, "https://example.com/voice.mp3");
});

test("rejects Wan2.7 reference video longer than 10 seconds", () => {
  assert.throws(() => buildAliyunVideoRequest({
    capability: "wan27-r2v",
    prompt: "Follow motion",
    media: [image(), video()],
    duration: 11,
  }), /2-10 seconds/);
});

test("builds Wan2.7 video edit", () => {
  const request = buildAliyunVideoRequest({
    capability: "wan27-video-edit",
    prompt: "Replace the outfit",
    media: [{ type: "video", url: "https://example.com/input.mp4" }, image()],
    duration: 0,
    parameters: { audio_setting: "origin" },
  });
  assert.equal(request.payload.parameters.audio_setting, "origin");
  assert.equal(request.payload.parameters.duration, 0);
});

test("supports Singapore legacy Wan models", () => {
  const request = buildAliyunVideoRequest({
    capability: "wan-legacy",
    model: "wan2.6-t2v",
    prompt: "A wide shot",
    duration: 5,
  });
  assert.equal(request.payload.model, "wan2.6-t2v");
});

test("builds Wan image-to-action and character replacement", () => {
  for (const capability of ["wan-animate-move", "wan-animate-mix"]) {
    const request = buildAliyunVideoRequest({
      capability,
      prompt: "Transfer the motion",
      media: [
        { type: "image_url", url: "https://example.com/person.png" },
        { type: "video_url", url: "https://example.com/action.mp4" },
      ],
      parameters: { mode: "wan-pro", watermark: false },
    });
    assert.equal(request.endpoint, ANIMATE_SYNTHESIS_PATH);
    assert.equal(request.payload.parameters.mode, "wan-pro");
    assert.equal(request.payload.input.image_url, "https://example.com/person.png");
  }
});

test("builds every HappyHorse capability", () => {
  const cases = [
    ["happyhorse-t2v", []],
    ["happyhorse-i2v", [{ type: "first_frame", url: "https://example.com/first.png" }]],
    ["happyhorse-r2v", [image()]],
    ["happyhorse-video-edit", [{ type: "video", url: "https://example.com/input.mp4" }, image()]],
  ];
  for (const [capability, media] of cases) {
    const request = buildAliyunVideoRequest({ capability, prompt: "Create", media, duration: capability.endsWith("video-edit") ? 0 : 5 });
    assert.match(request.payload.model, /^happyhorse-/);
  }
});

test("contains official Singapore purchase rates", () => {
  assert.equal(officialSingaporePurchaseRate("wan27-r2v", { resolution: "1080p" }), 0.15);
  assert.equal(officialSingaporePurchaseRate("wan-animate-mix", { mode: "wan-pro" }), 0.26);
  assert.equal(officialSingaporePurchaseRate("happyhorse-i2v", { resolution: "720p" }), 0.084);
});

test("reports HappyHorse effective and list prices", () => {
  assert.deepEqual(officialSingaporePurchaseDetails("happyhorse-video-edit", { resolution: "1080p" }), {
    capability: "happyhorse-video-edit",
    model: "",
    rateKey: "1080P",
    usdPerSecond: 0.192,
    listUsdPerSecond: 0.24,
    discountPercent: 20,
    limitedTimeDiscount: true,
  });
});

test("prices legacy Wan models by model, resolution, and audio mode", () => {
  assert.equal(officialSingaporePurchaseRate("wan-legacy", {
    model: "wan2.5-t2v-preview",
    resolution: "480p",
  }), 0.05);
  assert.equal(officialSingaporePurchaseRate("wan-legacy", {
    model: "wan2.6-i2v-flash",
    resolution: "1080p",
    audio: true,
  }), 0.075);
  assert.equal(officialSingaporePurchaseRate("wan-legacy", {
    model: "wan2.6-i2v-flash",
    resolution: "1080p",
    audio: false,
  }), 0.0375);
});

test("builds admin pricing rows for every exposed legacy Wan model", () => {
  const rows = officialSingaporeLegacyPricingRows();
  const pricedModels = new Set(rows.map((row) => row.model));
  assert.deepEqual([...pricedModels].sort(), [...LEGACY_WAN_MODELS].sort());
  assert.equal(rows.filter((row) => row.model === "wan2.6-r2v-flash").length, 4);
  assert.ok(rows.every((row) => row.key && row.rateKey && row.resolution));
});
