"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const application = require("../server");
const providers = require("../lib-providers");
const platformHtml = fs.readFileSync(path.join(root, "platform.html"), "utf8");
const platformUi = fs.readFileSync(path.join(root, "platform.ui.js"), "utf8");
const platformConfig = fs.readFileSync(path.join(root, "platform.config.js"), "utf8");
const platformCreate = fs.readFileSync(path.join(root, "platform.create.js"), "utf8");
const serverSource = fs.readFileSync(path.join(root, "server.js"), "utf8");

test("Seedream 5.5 keeps its own provider identity and public label", () => {
  for (const value of ["seedream55-image", "seedream-5.5", "dola-seedream-5-5-261028", "ep-20261115092454-jlm4p"]) {
    assert.equal(providers.normalizeAdvancedProvider(value), "seedream55-image", value);
    assert.equal(providers.publicProviderId(value), "seedream55-image", value);
  }
  assert.notEqual(providers.normalizeAdvancedProvider("seedream55-image"), "seedream5-image");
  assert.equal(providers.publicProviderLabel("seedream55-image"), "Seedream 5.5");
});

test("Seedream 5.5 builds the documented direct Ark image payload", () => {
  const payload = application.seedream55ImageRequestPayload({
    prompt: "A transparent embroidered sticker",
    resolution: "2K",
    ratio: "16:9",
    outputFormat: "PNG",
    watermark: true,
    background: "transparent",
    referenceImageUrls: ["https://cdn.example.com/reference.png", "asset://not-a-public-url"],
  });
  assert.deepEqual(payload, {
    model: "ep-20261115092454-jlm4p",
    prompt: "A transparent embroidered sticker",
    response_format: "url",
    size: "2816x1584",
    output_format: "png",
    watermark: true,
    background: "transparent",
    image: ["https://cdn.example.com/reference.png"],
  });
});

test("Seedream 5.5 bills every reference image at the official 1.5x sale price", () => {
  const oneK = application.advancedModelPricing("seedream55-image", {
    resolution: "1K",
    referenceImageCount: 2,
    outputImageCount: 1,
  });
  assert.equal(oneK.outputUsdPerImage, 0.03);
  assert.equal(oneK.referenceUsdPerImage, 0.012);
  assert.equal(oneK.outputUsd, 0.03);
  assert.equal(oneK.referenceUsd, 0.024);
  assert.equal(oneK.totalUsd, 0.054);
  assert.equal(oneK.credits, 5.4);
  assert.equal(oneK.billableReferenceImages, 2);

  const twoK = application.advancedModelPricing("seedream55-image", {
    resolution: "2K",
    referenceImageCount: 10,
    outputImageCount: 1,
  });
  assert.equal(twoK.outputUsdPerImage, 0.0525);
  assert.equal(twoK.referenceUsd, 0.12);
  assert.equal(twoK.credits, 17.25);
  assert.equal(twoK.billableReferenceImages, 10);
});

test("Seedream 5.5 accepts ten references and rejects the eleventh", () => {
  const ten = Array.from({ length: 10 }, (_, index) => `https://cdn.example.com/${index}.png`);
  assert.equal(application.seedream55ReferenceInputsFromBody({ referenceImages: ten }).length, 10);
  assert.throws(
    () => application.seedream55ReferenceInputsFromBody({ referenceImages: [...ten, "https://cdn.example.com/11.png"] }),
    (error) => error.code === "TOO_MANY_SEEDREAM55_IMAGES" && /at most 10/.test(error.message),
  );
});

test("Seedream 5.5 persists successful images and refunds failed jobs with dedicated billing types", () => {
  const job = serverSource.slice(
    serverSource.indexOf("async function runSeedream55ImageGenerationJob"),
    serverSource.indexOf("function startSeedream55ImageGenerationJob"),
  );
  assert.match(job, /const savedImage = await saveRemoteGeneratedImage\(taskId, imageUrl\)/);
  assert.match(job, /status: "succeeded"[\s\S]*?imageResultUrl: savedImage\.cdnImageUrl \|\| imageUrl/);
  assert.match(job, /billingStatus: cost > 0 \? "settled" : "free"/);
  assert.match(job, /refundCreditsWithSubtoken\([\s\S]*?"advanced_seedream55_image_refund"/);
  assert.match(job, /status: "failed"[\s\S]*?billingStatus: cost <= 0 \? "free" : refunded \? "refunded" : "pre_deducted"/);
  assert.match(serverSource, /type: "advanced_seedream55_image"/);
});

test("Seedream 5.5 public and admin pricing rows use exact 1.5x prices", async () => {
  const publicRows = application.publicAdvancedPricingRows()
    .filter((row) => row.provider === "seedream55-image");
  const publicByKey = Object.fromEntries(publicRows.map((row) => [row.key, row]));
  assert.equal(publicByKey["seedream55-1k"].saleCreditsPerUnit, 3);
  assert.equal(publicByKey["seedream55-2k"].saleCreditsPerUnit, 5.25);
  assert.equal(publicByKey["seedream55-reference"].saleCreditsPerUnit, 1.2);
  assert.equal(publicByKey["seedream55-1k"].model, "ep-20261115092454-jlm4p");

  const adminPricing = await application.adminAdvancedPricingView({});
  const adminByKey = Object.fromEntries(
    adminPricing.rows
      .filter((row) => row.provider === "seedream55-image")
      .map((row) => [row.key, row]),
  );
  assert.equal(adminByKey["seedream55-1k"].purchaseUsdPerSecond, 0.02);
  assert.equal(adminByKey["seedream55-1k"].saleUsdPerSecond, 0.03);
  assert.equal(adminByKey["seedream55-2k"].purchaseUsdPerSecond, 0.035);
  assert.equal(adminByKey["seedream55-2k"].saleUsdPerSecond, 0.0525);
  assert.equal(adminByKey["seedream55-reference"].purchaseUsdPerSecond, 0.008);
  assert.equal(adminByKey["seedream55-reference"].saleUsdPerSecond, 0.012);
  for (const row of Object.values(adminByKey)) {
    assert.ok(Math.abs(row.saleUsdPerSecond / row.purchaseUsdPerSecond - 1.5) < 1e-9, row.key);
  }
});

test("Seedream 5.5 is exposed in image generation with 1K/2K, five ratios, and ten references", () => {
  assert.match(platformHtml, /<option value="seedream55-image">Seedream 5\.5<\/option>/);
  assert.match(platformUi, /function advancedVideoResolutionOptions[\s\S]*?\["seedream55-image", "seedream5-image"\]\.includes\(normalizeAdvancedProvider\(provider\)\)\) return \["1K", "2K"\]/);
  assert.match(platformCreate, /ADVANCED_SEEDREAM55_REFERENCE_LIMIT/);
  assert.match(platformCreate, /provider === "seedream55-image"[\s\S]*?return images\.slice\(0, ADVANCED_SEEDREAM55_REFERENCE_LIMIT\)/);
  assert.match(serverSource, /const SEEDREAM55_REFERENCE_LIMIT = 10/);
  assert.match(platformConfig, /const ADVANCED_SEEDREAM55_REFERENCE_LIMIT = 10/);
});

test("Seedream 5.5 regeneration restores its provider and reference mode", () => {
  assert.match(platformCreate, /"seedream55-image",[\s\S]*?"seedream5-image",[\s\S]*?"qwen-image3"/);
  assert.match(platformCreate, /provider === "seedream55-image"\) return ADVANCED_SEEDREAM55_REFERENCE_LIMIT/);
  assert.match(platformCreate, /\["gpt-image-2", "seedream55-image", "seedream5-image", "qwen-image3"\]\.includes\(provider\)/);
});

test("Seedream 5.5 persists canonical reference media assets", () => {
  const assets = application.seedream55PreparedMediaAssets([{
    id: "asset-1794708168754-709a6fa5",
    localUrl: "/assets/user-uploads/user-1/asset-1794708168754-709a6fa5.png",
    publicUrl: "https://assets-cdn.example.com/assets/user-uploads/user-1/asset-1794708168754-709a6fa5.png",
    assetUri: "asset://asset-1794708168754-709a6fa5",
    name: "reference.png",
  }]);
  assert.deepEqual(assets, [{
    type: "reference_image",
    userAssetId: "asset-1794708168754-709a6fa5",
    url: "/assets/user-uploads/user-1/asset-1794708168754-709a6fa5.png",
    imageUrl: "/assets/user-uploads/user-1/asset-1794708168754-709a6fa5.png",
    sourceImageUrl: "/assets/user-uploads/user-1/asset-1794708168754-709a6fa5.png",
    previewUrl: "/assets/user-uploads/user-1/asset-1794708168754-709a6fa5.png",
    publicUrl: "https://assets-cdn.example.com/assets/user-uploads/user-1/asset-1794708168754-709a6fa5.png",
    assetUri: "asset://asset-1794708168754-709a6fa5",
    referenceAssetUri: "asset://asset-1794708168754-709a6fa5",
    name: "reference.png",
    order: 1,
  }]);
  assert.match(serverSource, /mediaAssets: preparedMediaAssets/);
});

test("Seedream 5.5 admin save paths accept its three pricing rows", () => {
  assert.match(serverSource, /key === "seedream55-1k" \|\| key === "seedream55-2k" \|\| key === "seedream55-reference"/);
  assert.match(serverSource, /next\.seedream55Image\.saleUsdPerReferenceImage/);
  assert.match(serverSource, /next\.seedream55Image\.saleUsdPerImageByResolution\[resolution\]/);
});
