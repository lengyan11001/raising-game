"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  buildQwenImage3Request,
  qwenImage3OfficialPricing,
  qwenImage3OutputUrls,
  qwenImage3Size,
} = require("../qwen-image3");

const serverSource = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
const platformHtml = fs.readFileSync(path.join(__dirname, "..", "platform.html"), "utf8");
const platformCreateSource = fs.readFileSync(path.join(__dirname, "..", "platform.create.js"), "utf8");

test("builds Qwen Image 3.0 multimodal request with official parameter names", () => {
  const payload = buildQwenImage3Request({
    tier: "pro",
    prompt: "Keep the subject and change the background",
    referenceImages: ["https://example.com/one.png", "https://example.com/two.webp"],
    resolution: "1K",
    ratio: "16:9",
    n: 2,
    negativePrompt: "blur",
    seed: 42,
    watermark: true,
  });
  assert.equal(payload.model, "qwen-image-3.0-pro");
  assert.deepEqual(payload.input.messages[0].content, [
    { image: "https://example.com/one.png" },
    { image: "https://example.com/two.webp" },
    { text: "Keep the subject and change the background" },
  ]);
  assert.deepEqual(payload.parameters, {
    size: "1360*768",
    n: 2,
    prompt_extend: true,
    prompt_extend_mode: "direct",
    watermark: true,
    negative_prompt: "blur",
    seed: 42,
  });
});

test("uses agent prompt extension only for text-to-image", () => {
  const payload = buildQwenImage3Request({ prompt: "A product photo", prompt_extend_mode: "agent" });
  assert.equal(payload.parameters.prompt_extend_mode, "agent");
  assert.equal(payload.model, "qwen-image-3.0-pro");
});

test("validates reference, output, seed, and size limits", () => {
  assert.throws(() => buildQwenImage3Request({ prompt: "x", referenceImages: ["1", "2", "3", "4"] }), /at most 3/);
  assert.throws(() => buildQwenImage3Request({ prompt: "x", n: 7 }), /from 1 to 6/);
  assert.throws(() => buildQwenImage3Request({ prompt: "x", seed: -1 }), /from 0/);
  assert.throws(() => qwenImage3Size({ size: "100*100" }), /pixel area/);
});

test("calculates official Pro and Standard image charges", () => {
  const pro = qwenImage3OfficialPricing({ tier: "pro", resolution: "2K", referenceImageCount: 3, outputImageCount: 2 });
  assert.equal(pro.inputUsd, 0.00825);
  assert.equal(pro.outputUsd, 0.137522);
  assert.equal(pro.totalUsd, 0.145772);

  const standard = qwenImage3OfficialPricing({ tier: "standard", resolution: "2K", referenceImageCount: 1, outputImageCount: 1 });
  assert.equal(standard.totalUsd, 0.027504);
});

test("extracts Qwen output images in model order", () => {
  assert.deepEqual(qwenImage3OutputUrls({
    output: { choices: [{ message: { content: [{ image: "https://example.com/1.png" }, { image: "https://example.com/2.png" }] } }] },
  }), ["https://example.com/1.png", "https://example.com/2.png"]);
});

test("locks Qwen Image 3.0 to the Singapore endpoint", () => {
  assert.match(serverSource, /const QWEN_IMAGE3_SINGAPORE_BASE_URL = "https:\/\/dashscope-intl\.aliyuncs\.com"/);
  assert.match(serverSource, /qwenImage3 \? QWEN_IMAGE3_SINGAPORE_BASE_URL/);
});

test("server estimate and gateway persistence preserve Qwen tier, count, and all output images", () => {
  assert.match(serverSource, /qwenTier: firstPresent\(params\.qwenTier, params\.qwenImageTier, params\.tier\)/);
  assert.match(serverSource, /outputImageCount: firstPresent\(params\.outputImageCount, params\.n\)/);
  assert.match(serverSource, /for \(let index = 0; index < remoteImageUrls\.length; index \+= 1\)/);
  assert.match(serverSource, /imageResultUrls: resultImageUrls/);
  assert.match(serverSource, /cdnImageUrls,/);
});

test("Advanced exposes Qwen Image 3.0 with multi-reference input and complete parameters", () => {
  assert.match(platformHtml, /<option value="qwen-image3">Qwen Image 3\.0<\/option>/);
  assert.match(platformHtml, /id="advancedQwenTier"/);
  assert.match(platformHtml, /id="advancedQwenOutputCount"/);
  assert.match(platformCreateSource, /provider === "qwen-image3" \? ADVANCED_QWEN_IMAGE3_REFERENCE_LIMIT/);
  assert.match(platformCreateSource, /prompt_extend: els\.advancedQwenPromptExtend/);
  assert.match(platformCreateSource, /watermark: els\.advancedQwenWatermark/);
});

test("live model documentation includes the Qwen V3 request and limits", () => {
  assert.match(serverSource, /function qwenImage3ParameterFields\(\)/);
  assert.match(serverSource, /\*\*Qwen Image 3\.0 through V3\*\*/);
  assert.match(serverSource, /This integration uses the Alibaba Cloud Model Studio Singapore endpoint/);
});
