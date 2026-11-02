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

test("builds Wan3.0 multimodal requests for the mainland endpoint contract", () => {
  const request = buildAliyunVideoRequest({
    provider: "wan30",
    capability: "wan30-video",
    prompt: "Image 1 follows Video 1 and Audio 1",
    media: [
      image(),
      video(),
      { type: "reference_audio", url: "https://example.com/voice.mp3" },
    ],
    duration: -1,
    resolution: "1080p",
    ratio: "adaptive",
    parameters: { audio: false, enable_thinking: true, watermark: false, prompt_extend: true },
  });
  assert.equal(request.endpoint, VIDEO_SYNTHESIS_PATH);
  assert.equal(request.payload.model, "wan3.0-video");
  assert.deepEqual(request.payload.input.media.map((item) => item.type), ["reference_image", "reference_video", "reference_audio"]);
  assert.deepEqual(request.payload.parameters, {
    resolution: "1080P",
    ratio: "adaptive",
    duration: -1,
    audio: false,
    prompt_extend: true,
    watermark: false,
  });
});

test("builds Wan3.0 strict first and last frames", () => {
  const request = buildAliyunVideoRequest({
    capability: "wan30-video",
    media: [
      { type: "first_frame", url: "https://example.com/first.png" },
      { type: "last_frame", url: "https://example.com/last.png" },
    ],
    duration: 30,
    resolution: "480P",
    parameters: { seed: 2147483647 },
  });
  assert.equal(request.payload.input.prompt, undefined);
  assert.equal(request.payload.parameters.ratio, "adaptive");
  assert.equal(request.payload.parameters.seed, 2147483647);
});

test("builds Wan3.0 document input and keeps it exclusive", () => {
  const request = buildAliyunVideoRequest({
    capability: "wan30-video",
    prompt: "Use the uploaded document as the visual brief",
    media: [{ type: "file", url: "https://example.com/brief.pdf" }],
    duration: 5,
  });
  assert.deepEqual(request.payload.input.media, [{ type: "file", url: "https://example.com/brief.pdf" }]);
  assert.throws(() => buildAliyunVideoRequest({
    capability: "wan30-video",
    prompt: "Create",
    media: [{ type: "file", url: "https://example.com/brief.pdf" }, image()],
    duration: 5,
  }), /cannot mix a document/);
});

test("builds Wan3.0 Video Prime with the same multimodal contract", () => {
  const request = buildAliyunVideoRequest({
    provider: "wan30",
    capability: "wan30-video-prime",
    prompt: "Image 1 walks through the scene",
    media: [image()],
    duration: 5,
    resolution: "480p",
    ratio: "adaptive",
  });
  assert.equal(request.endpoint, VIDEO_SYNTHESIS_PATH);
  assert.equal(request.payload.model, "wan3.0-video-prime");
  assert.deepEqual(request.payload.input.media, [image()]);
  assert.deepEqual(request.payload.parameters, {
    resolution: "480P",
    ratio: "adaptive",
    duration: 5,
    audio: true,
    prompt_extend: true,
    watermark: false,
  });
});

test("Wan3.0 prompt extension defaults on and can be disabled", () => {
  const request = buildAliyunVideoRequest({
    capability: "wan30-video",
    prompt: "Keep the exact choreography.",
    duration: 5,
    parameters: { prompt_extend: false },
  });
  assert.equal(request.payload.parameters.prompt_extend, false);
  assert.equal(Object.hasOwn(request.payload.parameters, "enable_thinking"), false);
});

test("rejects invalid Wan3.0 combinations and limits", () => {
  assert.throws(() => buildAliyunVideoRequest({
    capability: "wan30-video",
    prompt: "Create",
    media: [image(), { type: "first_frame", url: "https://example.com/first.png" }],
    duration: 5,
  }), /cannot mix reference media/);
  assert.throws(() => buildAliyunVideoRequest({
    capability: "wan30-video",
    prompt: "Create",
    media: Array.from({ length: 11 }, (_, index) => image(`https://example.com/${index}.png`)),
    duration: 5,
  }), /0-10 reference_image/);
  assert.throws(() => buildAliyunVideoRequest({ capability: "wan30-video", prompt: "Create", duration: 1 }), /between 2 and 30/);
  assert.throws(() => buildAliyunVideoRequest({ capability: "wan30-video", prompt: "Create", duration: 5, ratio: "2:1" }), /supports 16:9/);
});

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
