"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const application = require("../server");
const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
const platformUi = fs.readFileSync(path.join(root, "platform.ui.js"), "utf8");
const adminUi = fs.readFileSync(path.join(root, "admin.js"), "utf8");

test("admin pricing rows use their server definition when saving", () => {
  assert.match(server, /ADVANCED_PRICING_ROWS_BY_KEY\.get\(key\)/);
});

test("admin pricing uses a model list and detail view without dropping hidden rows from save", () => {
  const pricingSource = adminUi.slice(
    adminUi.indexOf("async function renderPricing()"),
    adminUi.indexOf("/* ============ PLATFORM ============ */", adminUi.indexOf("async function renderPricing()")),
  );
  const legacySource = adminUi.slice(
    adminUi.indexOf("async function renderPricingLegacy()"),
    adminUi.indexOf("async function loadChatLiveVoices()", adminUi.indexOf("async function renderPricingLegacy()")),
  );
  assert.match(adminUi, /function pricingModelCard\(/);
  assert.match(adminUi, /data-pricing-model="\$\{escapeHtml\(key\)\}"/);
  assert.match(pricingSource, /id="pricingModelSearch"/);
  assert.match(pricingSource, /id="pricingModelDetail"/);
  assert.match(pricingSource, /byId\("pricingModelList"\)\?\.querySelectorAll\(":scope > \[data-pricing-model\]"\)/);
  assert.match(pricingSource, /card\.hidden = Boolean\(query\)/);
  assert.match(pricingSource, /closest\("#pricingModelList > \[data-pricing-model\]"\)/);
  assert.match(pricingSource, /data-pricing-detail/);
  assert.match(pricingSource, /const visiblePricingRows = pricingRows\.filter\(\(row\) => row\.pricingVisible !== false\)/);
  assert.match(pricingSource, /const nextRows = pricingRows\.map/);
  assert.match(pricingSource, /detail\?\.querySelector\(`tr\[data-row-key=/);
  assert.match(pricingSource, /body: \{ rows: nextRows, modelSettings: nextSettings \}/);
  assert.match(pricingSource, /data-pricing-config/);
  assert.match(pricingSource, /pricingModelDiscount/);
  assert.doesNotMatch(pricingSource, /id="pricingModelFilter"/);
  assert.doesNotMatch(legacySource, /pricingModelFilter|data-pricing-model/);
});

test("public pricing uses the same configured model rows as the admin", () => {
  assert.match(server, /rows: publicAdvancedPricingRows\(normalized\)/);
  assert.match(server, /ADVANCED_PRICING_ROWS\s*\n\s*\.filter\(publicPricingModelVisible\)/);
  assert.match(server, /saleCreditsPerUnit = advancedSaleCreditsPerSecond/);
  assert.match(server, /key: "wan27-image"[\s\S]*?saleCreditsPerUnit: applyAdvancedModelDiscount\(configuredSaleCreditsPerUnit, normalized, modelKey\)/);
  assert.match(server, /key: `qwen-image3-\$\{tier\}-\$\{resolution\.toLowerCase\(\)\}`/);
  assert.match(platformUi, /const configuredRows = Array\.isArray\(pricing\.rows\)/);
  assert.match(platformUi, /row && row\.pricingVisible !== false/);
  assert.match(platformUi, /const modelGroups = new Map\(\)/);
  assert.match(platformUi, /id="publicPricingModelSelect"/);
  assert.match(platformUi, /state\.pricingModelKey = String\(event\.target\.value/);
  assert.match(platformUi, /row\.saleCreditsPerUnit \?\? row\.saleCreditsPerSecond/);
  assert.match(platformUi, /Prices come directly from the current admin sale-price configuration/);
});

test("public and admin pricing list only models visible on the generation page", async () => {
  const publicRows = application.publicAdvancedPricingRows();
  assert.equal(publicRows.some((row) => row.provider === "seedance20-vega"), false);
  assert.equal(publicRows.some((row) => row.provider === "seedance25"), false);
  assert.equal(publicRows.some((row) => row.provider === "happyhorse"), false);
  assert.equal(publicRows.some((row) => row.key === "z-image-spicy-pro"), true);
  assert.equal(publicRows.some((row) => row.key === "qwen-image-edit-spicy"), true);

  const admin = await application.adminAdvancedPricingView({});
  assert.equal(admin.rows.some((row) => row.key === "vega10-pro-1080p" && row.pricingVisible === false), true);
  assert.equal(admin.rows.some((row) => row.key === "seedance25-480p" && row.pricingVisible === false), true);
  assert.equal(admin.rows.some((row) => row.key === "vega15-pro-1080p" && row.pricingVisible === true), true);
  assert.equal(admin.rows.some((row) => row.key === "seedance-fast-720p" && row.pricingVisible === true), true);
  assert.equal(admin.rows.some((row) => row.key === "z-image-spicy-pro" && row.pricingVisible === true), true);
  assert.equal(admin.rows.some((row) => row.key === "qwen-image-edit-spicy" && row.pricingVisible === true), true);
});

test("admin pricing keeps current models and omits early Wan models", () => {
  const pricingRowsSource = server.slice(
    server.indexOf("const ADVANCED_PRICING_ROWS = ["),
    server.indexOf("const ADVANCED_PRICING_ROW_KEYS"),
  );
  assert.match(pricingRowsSource, /key: "wan27-720p"/);
  assert.match(pricingRowsSource, /key: "wan27-1080p"/);
  assert.match(pricingRowsSource, /key: "happyhorse-720p"/);
  assert.match(pricingRowsSource, /key: "happyhorse-1080p"/);
  assert.match(pricingRowsSource, /key: "wan30-480p"/);
  assert.match(pricingRowsSource, /key: "wan30-720p"/);
  assert.match(pricingRowsSource, /key: "wan30-1080p"/);
  assert.match(pricingRowsSource, /key: "wan30-prime-480p"/);
  assert.match(pricingRowsSource, /key: "wan30-prime-720p"/);
  assert.match(pricingRowsSource, /key: "wan30-prime-1080p"/);
  assert.match(pricingRowsSource, /key: "seedance-nsfw-480p"/);
  assert.match(pricingRowsSource, /key: "seedance-nsfw-720p"/);
  assert.match(pricingRowsSource, /key: "seedance-nsfw-video-input-480p"/);
  assert.match(pricingRowsSource, /key: "seedance-nsfw-video-input-720p"/);
  assert.doesNotMatch(pricingRowsSource, /capability: "wan27-(?:t2v|i2v|r2v|video-edit)"/);
  assert.doesNotMatch(pricingRowsSource, /capability: "happyhorse-(?:t2v|i2v|r2v|video-edit)"/);
  assert.doesNotMatch(pricingRowsSource, /officialSingaporeLegacyPricingRows\(\)/);
  assert.doesNotMatch(pricingRowsSource, /providerLabel: "Wan Legacy"/);
  assert.match(pricingRowsSource, /model: "wan2\.7"/);
  assert.match(pricingRowsSource, /model: ALIYUN_WAN_ANIMATE_MIX_MODEL/);
  assert.match(pricingRowsSource, /model: "happyhorse"/);
});

test("Vega 1.5 Lite has editable output and input-video pricing rows", () => {
  const pricingRowsSource = server.slice(
    server.indexOf("const ADVANCED_PRICING_ROWS = ["),
    server.indexOf("const ADVANCED_PRICING_ROW_KEYS"),
  );
  for (const resolution of ["480p", "720p", "1080p", "2k", "4k"]) {
    assert.match(pricingRowsSource, new RegExp(`key: "h3-vega-${resolution}"[^\\n]*provider: "h3-vega"[^\\n]*providerLabel: "Vega 1\\.5 Lite"[^\\n]*resolution: "${resolution}"`));
    assert.match(pricingRowsSource, new RegExp(`key: "h3-vega-video-input-${resolution}"[^\\n]*provider: "h3-vega"[^\\n]*resolution: "${resolution}"[^\\n]*rateKind: "video_input"`));
    assert.match(server, new RegExp(`key === "h3-vega-${resolution}"\\) next\\.h3VegaCreditsPerSecondByResolution\\["${resolution}"\\] = credits`));
    assert.match(server, new RegExp(`key === "h3-vega-video-input-${resolution}"\\) next\\.h3VegaInputVideoCreditsPerSecondByResolution\\["${resolution}"\\] = credits`));
  }
  assert.match(server, /h3VegaCreditsPerSecondByResolution: \{\s*"480p": 6\.75,\s*"720p": 13\.5,\s*"1080p": 27,\s*"2k": 32\.4,\s*"4k": 38\.88,?\s*\}/);
  assert.match(server, /h3VegaInputVideoCreditsPerSecondByResolution: \{\s*"480p": 6\.75,\s*"720p": 13\.5,\s*"1080p": 27,\s*"2k": 27,\s*"4k": 27,?\s*\}/);
  for (const resolution of ["480p", "720p", "1080p", "2k", "4k"]) {
    assert.match(server, new RegExp(`"${resolution}": normalizeStoredCredits\\(h3Vega\\["${resolution}"\\], DEFAULT_ADVANCED_PRICING\\.h3VegaCreditsPerSecondByResolution\\["${resolution}"\\], 6\\)`));
    assert.match(server, new RegExp(`"${resolution}": normalizeStoredCredits\\(h3VegaInputVideo\\["${resolution}"\\], DEFAULT_ADVANCED_PRICING\\.h3VegaInputVideoCreditsPerSecondByResolution\\["${resolution}"\\], 6\\)`));
  }
});

test("Vega purchase prices are complete, editable, and retain a 1.5x sale margin", async () => {
  const pricing = await application.adminAdvancedPricingView({});
  const vegaRows = pricing.rows.filter((row) => ["h3-vega", "vega10-lite", "seedance20-vega", "seedance25-vega"].includes(row.provider));
  assert.equal(vegaRows.length, 41);
  for (const row of vegaRows) {
    assert.equal(row.purchaseEditable, true, `${row.key} must expose an editable purchase price`);
    assert.equal(row.purchaseSource, "admin_configured", `${row.key} must use the configured Vega purchase price`);
    assert.ok(Number(row.purchaseUsdPerSecond) > 0, `${row.key} must have a positive purchase price`);
    assert.ok(Number(row.saleUsdPerSecond) > 0, `${row.key} must have a positive sale price`);
    assert.ok(Math.abs(Number(row.saleUsdPerSecond) / Number(row.purchaseUsdPerSecond) - 1.5) < 1e-5, `${row.key} must keep a 1.5x margin`);
  }
  const reference = vegaRows.find((row) => row.key === "vega10-lite-reference-image");
  assert.equal(reference?.purchaseUsdPerSecond, 0.03);
  assert.equal(reference?.saleUsdPerSecond, 0.045);
});

test("model discount applies consistently to admin, public, and runtime sale prices", async () => {
  const advancedPricing = {
    modelSettings: {
      "seedance20-vega": {
        displayName: "seedance2.0（vega）",
        subtitle: "测试副标题",
        discount: 0.9,
      },
    },
  };
  const admin = await application.adminAdvancedPricingView({ platform: { advancedPricing } });
  const adminRow = admin.rows.find((row) => row.key === "vega10-pro-1080p");
  assert.ok(adminRow);
  assert.equal(adminRow.modelDisplayName, "seedance2.0（vega）");
  assert.equal(adminRow.modelSubtitle, "测试副标题");
  assert.equal(adminRow.modelDiscount, 0.9);
  assert.equal(adminRow.configuredSaleCreditsPerSecond, 39.93);
  assert.equal(adminRow.saleCreditsPerSecond, 35.937);
  assert.equal(adminRow.purchaseCreditsPerSecond, 26.62);

  assert.equal(adminRow.pricingVisible, false);
  const publicRow = application.publicAdvancedPricingRows(advancedPricing)
    .find((row) => row.key === "vega10-pro-1080p");
  assert.equal(publicRow, undefined);

  const runtime = application.advancedModelPricing("seedance20-vega", {
    advancedPricing,
    duration: 5,
    resolution: "1080P",
    ratio: "16:9",
    mode: "reference_video",
  });
  assert.equal(runtime.modelKey, "seedance20-vega");
  assert.equal(runtime.modelDiscount, 0.9);
  assert.equal(runtime.configuredCredits, 199.65);
  assert.equal(runtime.credits, 179.685);
  assert.equal(runtime.creditsPerSecond, adminRow.saleCreditsPerSecond);
});

test("Vega purchase tables preserve every Tencent VOD international rate", () => {
  assert.match(server, /h3VegaPurchaseUsdPerSecondByResolution: \{\s*"480p": 0\.045,\s*"720p": 0\.09,\s*"1080p": 0\.18,\s*"2k": 0\.216,\s*"4k": 0\.2592,?\s*\}/);
  assert.match(server, /h3VegaInputVideoPurchaseUsdPerSecondByResolution: \{\s*"480p": 0\.045,\s*"720p": 0\.09,\s*"1080p": 0\.18,\s*"2k": 0\.18,\s*"4k": 0\.18,?\s*\}/);
  assert.match(server, /vega10LitePurchaseUsdPerSecondByResolution: \{\s*"480p": 0\.0457,\s*"768p": 0\.0577,\s*"1080p": 0\.0769,\s*"2k": 0\.0962,\s*"4k": 0\.1154,?\s*\}/);
  assert.match(server, /vega10LiteReferenceImagePurchaseUsdEach: 0\.03/);
  assert.match(server, /vega10ProPurchaseUsdPerSecondByResolution: \{\s*"480p": 0\.064,\s*"720p": 0\.1223,\s*"1080p": 0\.2662,\s*"2k": 0\.6615,\s*"4k": 0\.7538,?\s*\}/);
  assert.match(server, /vega10ProInputVideoPurchaseUsdPerSecondByResolution: \{\s*"480p": 0\.0402,\s*"720p": 0\.0769,\s*"1080p": 0\.1662,\s*"2k": 0\.4108,\s*"4k": 0\.4615,?\s*\}/);
  assert.match(server, /vega15ProPurchaseUsdPerSecondByResolution: \{\s*"480p": 0\.0932,\s*"720p": 0\.1828,\s*"1080p": 0\.3979,\s*"2k": 0\.98,\s*"4k": 1\.078,?\s*\}/);
  assert.match(server, /vega15ProInputVideoPurchaseUsdPerSecondByResolution: \{\s*"480p": 0\.0559,\s*"720p": 0\.1138,\s*"1080p": 0\.2431,\s*"2k": 0\.5938,\s*"4k": 0\.6532,?\s*\}/);
});

test("Seedance 2.5 defaults to 1.1x and migrates the legacy 1.0x defaults", async () => {
  const pricing = await application.adminAdvancedPricingView({});
  for (const [resolution, purchaseCredits, saleCredits] of [
    ["480p", 8.9955, 9.8951],
    ["720p", 14.9925, 16.4918],
  ]) {
    const row = pricing.rows.find((item) => item.key === `seedance25-${resolution}`);
    assert.ok(row, `${resolution} row must exist`);
    assert.equal(row.purchaseCreditsPerSecond, purchaseCredits);
    assert.equal(row.saleCreditsPerSecond, saleCredits);
    assert.ok(Math.abs(row.saleCreditsPerSecond / row.purchaseCreditsPerSecond - 1.1) < 1e-5);
  }

  for (const legacyStored of [{ "480p": 8.995502, "720p": 14.992504 }, { "480p": 9, "720p": 16 }]) {
    const migrated = await application.adminAdvancedPricingView({
      platform: {
        advancedPricing: {
          seedance25CreditsPerSecondByResolution: legacyStored,
        },
      },
    });
    assert.equal(migrated.rows.find((row) => row.key === "seedance25-480p").saleCreditsPerSecond, 9.8951);
    assert.equal(migrated.rows.find((row) => row.key === "seedance25-720p").saleCreditsPerSecond, 16.4918);
  }

  const custom = await application.adminAdvancedPricingView({
    platform: {
      advancedPricing: {
        seedance25CreditsPerSecondByResolution: { "480p": 9.1, "720p": 15.1 },
      },
    },
  });
  assert.equal(custom.rows.find((row) => row.key === "seedance25-480p").saleCreditsPerSecond, 9.1);
  assert.equal(custom.rows.find((row) => row.key === "seedance25-720p").saleCreditsPerSecond, 15.1);
  assert.match(server, /const SEEDANCE25_DEFAULT_SALE_MARKUP = 1\.1;/);
  assert.match(server, /seedance25SaleSiteCreditsPerSecond\("480p"\)/);
  assert.match(server, /previousPurchaseDefault/);
});

test("Seedream 5.0 Pro and Qwen Image 3.0 default to a 1.5x sale multiplier and migrate legacy sale prices", () => {
  const expectations = [
    ["seedream5-image", { resolution: "1K" }, "outputUsdPerImage", 0.045, 0.0675],
    ["seedream5-image", { resolution: "2K" }, "outputUsdPerImage", 0.09, 0.135],
    ["seedream5-image", { resolution: "2K", referenceImageCount: 2 }, "referenceUsdPerImage", 0.003, 0.0045],
    ["qwen-image3", { tier: "pro", resolution: "1K" }, "outputUsdPerImage", 0.03438, 0.05157],
    ["qwen-image3", { tier: "pro", resolution: "2K" }, "outputUsdPerImage", 0.068761, 0.103142],
    ["qwen-image3", { tier: "pro", resolution: "1K", referenceImageCount: 1 }, "inputUsdPerReferenceImage", 0.00275, 0.004125],
    ["qwen-image3", { tier: "standard", resolution: "1K" }, "outputUsdPerImage", 0.024754, 0.037131],
    ["qwen-image3", { tier: "standard", resolution: "2K" }, "outputUsdPerImage", 0.024754, 0.037131],
    ["qwen-image3", { tier: "standard", resolution: "1K", referenceImageCount: 1 }, "inputUsdPerReferenceImage", 0.00275, 0.004125],
  ];
  for (const [provider, options, field, purchaseUsd, saleUsd] of expectations) {
    const estimate = application.advancedModelPricing(provider, options);
    assert.equal(estimate[field], saleUsd);
    assert.ok(Math.abs(estimate[field] / purchaseUsd - 1.5) < 1e-5, `${provider} ${JSON.stringify(options)} must sell at 1.5x`);
  }

  const legacyPricing = {
    seedream5Image: {
      pro: {
        saleUsdPerImageByResolution: { "1K": 0.045, "2K": 0.09 },
        referenceUsdPerImageAfterFirst: 0.003,
        userConfigured: true,
      },
    },
    qwenImage3: {
      pro: {
        saleUsdPerImageByResolution: { "1K": 0.03438, "2K": 0.068761 },
        saleUsdPerReferenceImage: 0.00275,
        userConfigured: true,
      },
      standard: {
        saleUsdPerImageByResolution: { "1K": 0.024754, "2K": 0.024754 },
        saleUsdPerReferenceImage: 0.00275,
        userConfigured: true,
      },
    },
  };
  assert.equal(application.advancedModelPricing("seedream5-image", { resolution: "1K", advancedPricing: legacyPricing }).outputUsdPerImage, 0.0675);
  assert.equal(application.advancedModelPricing("seedream5-image", { resolution: "2K", referenceImageCount: 2, advancedPricing: legacyPricing }).referenceUsdPerImage, 0.0045);
  assert.equal(application.advancedModelPricing("qwen-image3", { tier: "pro", resolution: "2K", advancedPricing: legacyPricing }).outputUsdPerImage, 0.103142);
  assert.equal(application.advancedModelPricing("qwen-image3", { tier: "standard", resolution: "1K", referenceImageCount: 1, advancedPricing: legacyPricing }).inputUsdPerReferenceImage, 0.004125);

  const customPricing = {
    seedream5Image: { pro: { saleUsdPerImageByResolution: { "1K": 0.08, "2K": 0.18 }, referenceUsdPerImageAfterFirst: 0.006, userConfigured: true } },
    qwenImage3: {
      pro: { saleUsdPerImageByResolution: { "1K": 0.05, "2K": 0.11 }, saleUsdPerReferenceImage: 0.005, userConfigured: true },
      standard: { saleUsdPerImageByResolution: { "1K": 0.04, "2K": 0.04 }, saleUsdPerReferenceImage: 0.004, userConfigured: true },
    },
  };
  assert.equal(application.advancedModelPricing("seedream5-image", { resolution: "1K", advancedPricing: customPricing }).outputUsdPerImage, 0.08);
  assert.equal(application.advancedModelPricing("qwen-image3", { tier: "pro", resolution: "2K", advancedPricing: customPricing }).outputUsdPerImage, 0.11);
  assert.equal(application.advancedModelPricing("qwen-image3", { tier: "standard", resolution: "1K", referenceImageCount: 1, advancedPricing: customPricing }).inputUsdPerReferenceImage, 0.004);
});

test("admin pricing uses a tolerance when flagging multipliers below 1.5x", () => {
  const adminSource = fs.readFileSync(path.join(root, "admin.js"), "utf8");
  assert.match(adminSource, /const PRICING_MULTIPLIER_TOLERANCE = 1e-5/);
  assert.match(adminSource, /multiplier < PRICING_MULTIPLIER_FLOOR - PRICING_MULTIPLIER_TOLERANCE/);
  assert.doesNotMatch(adminSource, /multiplier < 1\.5/);
});


test("Vega 1.0 Lite pricing rows, defaults, validation, and reference-image fees match the contract", () => {
  const pricingRowsSource = server.slice(
    server.indexOf("const ADVANCED_PRICING_ROWS = ["),
    server.indexOf("const ADVANCED_PRICING_ROW_KEYS"),
  );
  for (const resolution of ["480p", "768p", "1080p", "2k", "4k"]) {
    assert.match(pricingRowsSource, new RegExp(`key: "vega10-lite-${resolution}"[^\\n]*provider: "vega10-lite"[^\\n]*providerLabel: "Vega 1\\.0 Lite"[^\\n]*resolution: "${resolution}"`));
    assert.match(pricingRowsSource, new RegExp(`key: "vega10-lite-video-input-${resolution}"[^\\n]*provider: "vega10-lite"[^\\n]*resolution: "${resolution}"[^\\n]*rateKind: "video_input"`));
    assert.match(server, new RegExp(`key === "vega10-lite-${resolution}"\\) next\\.vega10LiteCreditsPerSecondByResolution\\["${resolution}"\\] = credits`));
    assert.match(server, new RegExp(`key === "vega10-lite-video-input-${resolution}"\\) next\\.vega10LiteInputVideoCreditsPerSecondByResolution\\["${resolution}"\\] = credits`));
  }
  assert.match(pricingRowsSource, /key: "vega10-lite-reference-image"[^\n]*provider: "vega10-lite"[^\n]*rateKind: "reference_image"/);
  assert.match(server, /vega10LiteCreditsPerSecondByResolution: \{\s*"480p": 6\.855,\s*"768p": 8\.655,\s*"1080p": 11\.535,\s*"2k": 14\.43,\s*"4k": 17\.31,?\s*\}/);
  assert.match(server, /vega10LiteInputVideoCreditsPerSecondByResolution: \{\s*"480p": 6\.855,\s*"768p": 8\.655,\s*"1080p": 11\.535,\s*"2k": 14\.43,\s*"4k": 17\.31,?\s*\}/);
  assert.match(server, /vega10LiteReferenceImageCreditsEach: 4\.5/);

  assert.throws(
    () => application.advancedModelPricing("vega10-lite", { duration: 5, resolution: "720P" }),
    (error) => error?.code === "INVALID_RESOLUTION",
  );
  assert.throws(
    () => application.advancedModelPricing("vega10-lite", { duration: -1, resolution: "768P" }),
    (error) => error?.code === "INVALID_DURATION",
  );
  const estimate = application.advancedModelPricing("vega10-lite", {
    duration: 5,
    resolution: "768P",
    referenceVideoDurations: [3],
    referenceImageCount: 7,
  });
  assert.equal(estimate.outputCredits, 43.275);
  assert.equal(estimate.inputVideoCredits, 25.965);
  assert.equal(estimate.billableReferenceImageCount, 2);
  assert.equal(estimate.referenceImageCredits, 9);
  assert.equal(estimate.credits, 78.24);
  assert.equal(estimate.source, "configured_vega10_lite_input_output_and_reference_rates");

  const hdSixSeconds = application.advancedModelPricing("vega10-lite", {
    duration: 6,
    resolution: "1080P",
  });
  assert.equal(hdSixSeconds.outputCredits, 69.21);
  assert.equal(hdSixSeconds.credits, 69.21);

  const fiveImages = application.advancedModelPricing("vega10-lite", {
    duration: 4,
    resolution: "480P",
    referenceImageCount: 5,
  });
  assert.equal(fiveImages.billableReferenceImageCount, 0);
  assert.equal(fiveImages.referenceImageCredits, 0);
  const sixImages = application.advancedModelPricing("vega10-lite", {
    duration: 4,
    resolution: "480P",
    referenceImageCount: 6,
  });
  assert.equal(sixImages.billableReferenceImageCount, 1);
  assert.equal(sixImages.referenceImageCredits, 4.5);
  assert.equal(sixImages.credits - fiveImages.credits, 4.5);
});

test("public Vega 1.0 Lite pricing rows keep 768P and extra-reference-image rates", () => {
  const rows = application.publicAdvancedPricingRows({
    vega10LiteCreditsPerSecondByResolution: { "480p": 6.855, "768p": 8.655, "1080p": 11.535, "2k": 14.43, "4k": 17.31 },
    vega10LiteInputVideoCreditsPerSecondByResolution: { "480p": 6.855, "768p": 8.655, "1080p": 11.535, "2k": 14.43, "4k": 17.31 },
    vega10LiteReferenceImageCreditsEach: 4.5,
  });
  const byKey = Object.fromEntries(rows.map((row) => [row.key, row]));
  assert.equal(byKey["vega10-lite-768p"].saleCreditsPerUnit, 8.655);
  assert.equal(byKey["vega10-lite-video-input-768p"].saleCreditsPerUnit, 8.655);
  assert.equal(byKey["vega10-lite-reference-image"].saleCreditsPerUnit, 4.5);
});

test("Vega 1.0 Pro pricing rows cover every resolution with separate reference-video rates", () => {
  const pricingRowsSource = server.slice(
    server.indexOf("const ADVANCED_PRICING_ROWS = ["),
    server.indexOf("const ADVANCED_PRICING_ROW_KEYS"),
  );
  for (const resolution of ["480p", "720p", "1080p", "2k", "4k"]) {
    assert.match(pricingRowsSource, new RegExp(`key: "vega10-pro-${resolution}"[^\\n]*provider: "seedance20-vega"[^\\n]*providerLabel: "Vega 1\\.0 Pro"[^\\n]*resolution: "${resolution}"`));
    assert.match(pricingRowsSource, new RegExp(`key: "vega10-pro-video-${resolution}"[^\\n]*provider: "seedance20-vega"[^\\n]*resolution: "${resolution}"[^\\n]*rateKind: "video_input"`));
    assert.match(server, new RegExp(`key === "vega10-pro-${resolution}"\\) next\\.vega10ProCreditsPerSecondByResolution\\["${resolution}"\\] = credits`));
    assert.match(server, new RegExp(`key === "vega10-pro-video-${resolution}"\\) next\\.vega10ProInputVideoCreditsPerSecondByResolution\\["${resolution}"\\] = credits`));
  }
  assert.match(server, /vega10ProCreditsPerSecondByResolution: \{\s*"480p": 9\.6,\s*"720p": 18\.345,\s*"1080p": 39\.93,\s*"2k": 99\.225,\s*"4k": 113\.07,?\s*\}/);
  assert.match(server, /vega10ProInputVideoCreditsPerSecondByResolution: \{\s*"480p": 6\.03,\s*"720p": 11\.535,\s*"1080p": 24\.93,\s*"2k": 61\.62,\s*"4k": 69\.225,?\s*\}/);

  const publicRows = application.publicAdvancedPricingRows(application.DEFAULT_ADVANCED_PRICING);
  const byKey = Object.fromEntries(publicRows.map((row) => [row.key, row]));
  assert.equal(byKey["vega10-pro-768p"], undefined);
  assert.equal(byKey["vega10-pro-video-768p"], undefined);
  assert.equal(byKey["vega10-pro-1080p"], undefined);
  assert.equal(byKey["vega10-pro-video-1080p"], undefined);
  assert.equal(publicRows.some((row) => row.provider === "seedance20-vega"), false);
});

test("Vega 1.0 Pro bills no-reference, reference input, and reference output rates correctly", () => {
  for (const [resolution, expected] of [
    ["480P", 9.6],
    ["720P", 18.345],
    ["1080P", 39.93],
    ["2K", 99.225],
    ["4K", 113.07],
  ]) {
    const estimate = application.advancedModelPricing("seedance20-vega", { duration: 4, resolution });
    assert.equal(estimate.creditsPerSecond, expected);
    assert.equal(estimate.outputCreditsPerSecond, expected);
    assert.equal(estimate.outputCredits, expected * 4);
  }
  assert.throws(
    () => application.advancedModelPricing("seedance20-vega", { duration: 4, resolution: "768P" }),
    (error) => error?.code === "INVALID_RESOLUTION",
  );
  assert.throws(
    () => application.advancedModelPricing("seedance20-vega", { duration: -1, resolution: "1080P" }),
    (error) => error?.code === "INVALID_DURATION",
  );

  const noReference = application.advancedModelPricing("seedance20-vega", { duration: 6, resolution: "1080P" });
  assert.equal(noReference.outputCredits, 239.58);
  assert.equal(noReference.inputVideoCredits, 0);
  assert.equal(noReference.referenceImageCredits, 0);
  assert.equal(noReference.credits, 239.58);
  assert.equal(noReference.source, "configured_vega10_pro_output_duration_rate");

  const withReference = application.advancedModelPricing("seedance20-vega", {
    duration: 6,
    resolution: "1080P",
    referenceVideoDurations: [1],
    referenceImageCount: 9,
  });
  assert.equal(withReference.creditsPerSecond, 24.93);
  assert.equal(withReference.outputCreditsPerSecond, 24.93);
  assert.equal(withReference.outputCredits, 149.58);
  assert.equal(withReference.rawInputVideoSeconds, 1);
  assert.equal(withReference.inputVideoMinimumSeconds, 4);
  assert.equal(withReference.inputVideoSeconds, 4);
  assert.equal(withReference.inputVideoCreditsPerSecond, 24.93);
  assert.equal(withReference.inputVideoCredits, 99.72);
  assert.equal(withReference.billableReferenceImageCount, 0);
  assert.equal(withReference.referenceImageCredits, 0);
  assert.equal(withReference.credits, 249.3);
  assert.equal(withReference.source, "configured_vega10_pro_input_output_and_reference_rates");
});

test("Vega 1.5 Pro pricing rows cover every resolution with separate reference-video rates", () => {
  const pricingRowsSource = server.slice(
    server.indexOf("const ADVANCED_PRICING_ROWS = ["),
    server.indexOf("const ADVANCED_PRICING_ROW_KEYS"),
  );
  for (const resolution of ["480p", "720p", "1080p", "2k", "4k"]) {
    assert.match(pricingRowsSource, new RegExp(`key: "vega15-pro-${resolution}"[^\\n]*provider: "seedance25-vega"[^\\n]*providerLabel: "Vega 1\\.5 Pro"[^\\n]*resolution: "${resolution}"`));
    assert.match(pricingRowsSource, new RegExp(`key: "vega15-pro-video-${resolution}"[^\\n]*provider: "seedance25-vega"[^\\n]*resolution: "${resolution}"[^\\n]*rateKind: "video_input"`));
    assert.match(server, new RegExp(`key === "vega15-pro-${resolution}"\\) next\\.vega15ProCreditsPerSecondByResolution\\["${resolution}"\\] = credits`));
    assert.match(server, new RegExp(`key === "vega15-pro-video-${resolution}"\\) next\\.vega15ProInputVideoCreditsPerSecondByResolution\\["${resolution}"\\] = credits`));
  }
  assert.match(server, /vega15ProCreditsPerSecondByResolution: \{\s*"480p": 13\.98,\s*"720p": 27\.42,\s*"1080p": 59\.685,\s*"2k": 147,\s*"4k": 161\.7,?\s*\}/);
  assert.match(server, /vega15ProInputVideoCreditsPerSecondByResolution: \{\s*"480p": 8\.385,\s*"720p": 17\.07,\s*"1080p": 36\.465,\s*"2k": 89\.07,\s*"4k": 97\.98,?\s*\}/);

  const publicRows = application.publicAdvancedPricingRows(application.DEFAULT_ADVANCED_PRICING);
  const byKey = Object.fromEntries(publicRows.map((row) => [row.key, row]));
  assert.equal(byKey["vega15-pro-768p"], undefined);
  assert.equal(byKey["vega15-pro-video-768p"], undefined);
  assert.equal(byKey["vega15-pro-video-1080p"].saleCreditsPerUnit, 36.465);
});

test("Vega 1.5 Pro bills no-reference, reference input, and reference output rates correctly", () => {
  for (const [resolution, expected] of [
    ["480P", 13.98],
    ["720P", 27.42],
    ["1080P", 59.685],
    ["2K", 147],
    ["4K", 161.7],
  ]) {
    const estimate = application.advancedModelPricing("seedance25-vega", { duration: 5, resolution });
    assert.equal(estimate.creditsPerSecond, expected);
    assert.equal(estimate.outputCreditsPerSecond, expected);
    assert.equal(estimate.outputCredits, Math.round(expected * 5 * 1e6) / 1e6);
    assert.equal(estimate.referenceImageCredits, 0);
    assert.equal(estimate.source, "configured_vega15_pro_output_duration_rate");
  }
  assert.throws(
    () => application.advancedModelPricing("seedance25-vega", { duration: 5, resolution: "768P" }),
    (error) => error?.code === "INVALID_RESOLUTION",
  );

  const withReference = application.advancedModelPricing("seedance25-vega", {
    duration: 5,
    resolution: "1080P",
    referenceVideoDurations: [1],
    referenceImageCount: 30,
  });
  assert.equal(withReference.creditsPerSecond, 36.465);
  assert.equal(withReference.outputCreditsPerSecond, 36.465);
  assert.equal(withReference.outputCredits, 182.325);
  assert.equal(withReference.rawInputVideoSeconds, 1);
  assert.equal(withReference.inputVideoMinimumSeconds, 4);
  assert.equal(withReference.inputVideoSeconds, 4);
  assert.equal(withReference.inputVideoCreditsPerSecond, 36.465);
  assert.equal(withReference.inputVideoCredits, 145.86);
  assert.equal(withReference.billableReferenceImageCount, 0);
  assert.equal(withReference.referenceImageCredits, 0);
  assert.equal(withReference.credits, 328.185);
  assert.equal(withReference.source, "configured_vega15_pro_input_output_and_reference_rates");

  const smartDuration = application.advancedModelPricing("seedance25-vega", {
    duration: -1,
    resolution: "1080P",
  });
  assert.equal(smartDuration.adaptiveDuration, true);
  assert.equal(smartDuration.billingDuration, 30);
  assert.equal(smartDuration.outputCredits, 1790.55);
  assert.equal(smartDuration.credits, 1790.55);

  const longerReference = application.advancedModelPricing("seedance25-vega", {
    duration: 6,
    resolution: "720P",
    referenceVideoDurations: [10],
  });
  assert.equal(longerReference.inputVideoMinimumSeconds, 4);
  assert.equal(longerReference.inputVideoSeconds, 10);
  assert.equal(longerReference.outputCredits, 102.42);
  assert.equal(longerReference.inputVideoCredits, 170.7);
  assert.equal(longerReference.credits, 273.12);
});

test("Vega 1.5 Lite bills output and reference input video separately and fails closed at zero", () => {
  const pricingSource = server.slice(
    server.indexOf("function advancedModelPricingRaw("),
    server.indexOf("function seedream5ImagePricingEstimate("),
  );
  assert.match(pricingSource, /normalizedProvider === "h3-vega" \|\| normalizedProvider === "vega10-lite"/);
  assert.match(pricingSource, /const duration = options\.duration \?\? options\.durationSeconds/);
  assert.match(pricingSource, /const normalizedDuration = normalizeVegaDuration\(normalizedProvider, duration\)/);
  assert.match(pricingSource, /const adaptiveDuration = normalizedDuration === -1/);
  assert.match(pricingSource, /const billingDuration = adaptiveDuration \? 30 : normalizedDuration/);
  assert.match(pricingSource, /advancedPricing\.vega10LiteCreditsPerSecondByResolution/);
  assert.match(pricingSource, /advancedPricing\.h3VegaCreditsPerSecondByResolution/);
  assert.match(pricingSource, /advancedPricing\.vega10LiteInputVideoCreditsPerSecondByResolution/);
  assert.match(pricingSource, /advancedPricing\.h3VegaInputVideoCreditsPerSecondByResolution/);
  assert.match(pricingSource, /const outputRate = isVegaProWithReferenceRates && hasVideoInput\s*\? inputVideoCreditsPerSecond : creditsPerSecond/);
  assert.match(pricingSource, /const outputCredits = creditsAmount\(billingDuration \* outputRate\)/);
  assert.match(pricingSource, /const inputVideoCredits = creditsAmount\(hasVideoInput \? inputVideoSeconds \* inputVideoCreditsPerSecond : 0\)/);
  assert.match(pricingSource, /const credits = creditsAmount\(outputCredits \+ inputVideoCredits \+ referenceImageCredits\)/);
  assert.match(pricingSource, /if \(hasVideoInput && !\(inputVideoCreditsPerSecond > 0\)\)/);
  assert.match(pricingSource, /MODEL_PRICING_UNAVAILABLE/);
  assert.match(pricingSource, /configured_\$\{pricingKey\}_input_output_and_reference_rates/);
  assert.match(server, /isVega10Lite\s*\?\s*advancedPricing\.vega10LiteCreditsPerSecondByResolution\s*:\s*advancedPricing\.h3VegaCreditsPerSecondByResolution/);
  assert.ok(
    pricingSource.indexOf('normalizedProvider === "h3-vega"')
      < pricingSource.indexOf("if (isVegaProvider(normalizedProvider)) throw vegaPricingUnavailableError(normalizedProvider);"),
  );
});

test("admin pricing uses the public visibility rules while preserving internal compatibility", () => {
  assert.match(server, /const rows = await Promise\.all\(ADVANCED_PRICING_ROWS\.map\(async \(row\) => \{/);
  assert.match(server, /pricingVisible: publicPricingModelVisible\(row\)/);
  assert.doesNotMatch(server, /ADMIN_HIDDEN_PRICING_PROVIDERS/);
  assert.doesNotMatch(server, /ADMIN_HIDDEN_PRICING_CAPABILITIES/);
  assert.match(server, /key: "wan27-720p"/);
  assert.match(server, /key: `aliyun-\$\{item\.capability\}-\$\{rateKey\}`/);
  assert.match(server, /providerLabel: "W3\.0"/);
  assert.match(server, /providerLabel: "W3\.0-Pro"/);
  assert.match(server, /providerLabel: "W3\.0-Prime"/);
  assert.match(server, /providerLabel: "W3\.0-VSR-Prime"/);
  assert.match(server, /providerLabel: "HappyHorse Video"/);
});

test("admin pricing exposes persisted purchase and sale inputs for Wan3.0", () => {
  assert.match(server, /wan30PurchaseUsdPerSecondByResolution: \{ \.\.\.WAN30_PURCHASE_USD_PER_SECOND_BY_CAPABILITY\["wan30-video"\] \}/);
  assert.match(server, /wan30ProPurchaseUsdPerSecondByResolution: \{ \.\.\.WAN30_PURCHASE_USD_PER_SECOND_BY_CAPABILITY\["wan30-video-pro"\] \}/);
  assert.match(server, /wan30PrimePurchaseUsdPerSecondByResolution: \{ \.\.\.WAN30_PURCHASE_USD_PER_SECOND_BY_CAPABILITY\["wan30-video-prime"\] \}/);
  assert.match(server, /wan30PrimeProPurchaseUsdPerSecondByResolution: \{ \.\.\.WAN30_PURCHASE_USD_PER_SECOND_BY_CAPABILITY\["wan30-video-prime-pro"\] \}/);
  assert.match(server, /purchaseEditable: Boolean\(wan30PurchaseTable \|\| vegaPurchase\)/);
  assert.match(server, /const rawPurchaseUsd = Number\(row\.purchaseUsdPerSecond\)/);
  assert.match(server, /purchaseTable\[definedRow\.resolution\] = pricingNumber\(rawPurchaseUsd/);
  assert.match(server, /definedRow\?\.provider === "wan30" && rawCredits <= 0/);
});

test("runtime billing uses family prices for Wan2.7 and HappyHorse", () => {
  const pricingSource = server.slice(
    server.indexOf("function advancedModelPricingRaw("),
    server.indexOf("function seedream5ImagePricingEstimate("),
  );
  assert.match(pricingSource, /capability\.startsWith\("happyhorse-"\)[\s\S]*happyhorseCreditsPerSecondByResolution/);
  assert.match(pricingSource, /capability\.startsWith\("wan27-"\)[\s\S]*wan27CreditsPerSecondByResolution/);
});

test("Wan3.0 uses configured per-second billing", () => {
  const pricingSource = server.slice(
    server.indexOf("function advancedModelPricingRaw("),
    server.indexOf("function seedream5ImagePricingEstimate("),
  );
  assert.match(pricingSource, /normalizedProvider === "wan30"/);
  assert.match(pricingSource, /wan30CreditsPerSecondByResolution/);
  assert.match(pricingSource, /wan30PrimeCreditsPerSecondByResolution/);
  assert.match(pricingSource, /billing: "output"/);
  assert.match(pricingSource, /billingDuration/);
  assert.match(pricingSource, /source: `configured_\$\{capability\.replace\(\/-\/g, "_"\)\}_output_duration_rate`/);
  assert.doesNotMatch(pricingSource, /wan30_invitation_free/);
});

test("Wan3.0 default sale prices match the configured production rates", () => {
  assert.match(server, /const ALIYUN_WAN30_CNY_PER_USD = pricingNumber\([^\n]+, 6\.67,/);
  assert.match(server, /"wan30-video": Object\.freeze\(\{ "480p": 7, "720p": 15, "1080p": 30 \}\)/);
  assert.match(server, /"wan30-video-pro": Object\.freeze\(\{ "1080p": 26\.986507, "2k": 53\.973014, "4k": 107\.946028 \}\)/);
  assert.match(server, /"wan30-video-prime": Object\.freeze\(\{ "480p": 10, "720p": 20, "1080p": 38 \}\)/);
  assert.match(server, /"wan30-video-prime-pro": Object\.freeze\(\{ "1080p": 40\.479761, "2k": 80\.959521, "4k": 161\.919042 \}\)/);
  assert.match(server, /wan30PrimeCreditsPerSecondByResolution: \{ \.\.\.WAN30_DEFAULT_SALE_CREDITS_PER_SECOND\["wan30-video-prime"\] \}/);
  assert.match(server, /"720p": normalizeStoredCredits\(wan30Prime\["720p"\], DEFAULT_ADVANCED_PRICING\.wan30PrimeCreditsPerSecondByResolution\["720p"\], 6\)/);
  assert.match(server, /const multiplier = \(prime \? ALIYUN_WAN30_PRIME_PRICE_FACTOR : 1\)/);
  assert.match(server, /baseCnyPerSecond \* multiplier/);
  assert.match(server, /source: "mulerouter_model_pricing"/);
});

test("Wan3.0 premium pricing fails closed and keeps public rate tables", () => {
  assert.match(server, /if \(!\(creditsPerSecond > 0\)\) \{/);
  assert.match(server, /"MODEL_PRICING_UNAVAILABLE"/);
  assert.match(server, /error\.statusCode = 422/);
  assert.match(server, /return sendAdvancedValidationError\(res, error, "Model pricing is unavailable\."\)/);
  assert.match(server, /videoCapability: params\.videoCapability/);
  assert.doesNotMatch(server, /\n  delete view\.wan30PrimeCreditsPerSecondByResolution;/);
  const publicPricingSource = server.slice(
    server.indexOf("function publicAdvancedPricingView("),
    server.indexOf("function publicCharacterPageFromItems("),
  );
  assert.match(publicPricingSource, /wan30ProCreditsPerSecondByResolution: \{ \.\.\.normalized\.wan30ProCreditsPerSecondByResolution \}/);
  assert.match(publicPricingSource, /wan30PrimeCreditsPerSecondByResolution: \{ \.\.\.normalized\.wan30PrimeCreditsPerSecondByResolution \}/);
  assert.match(publicPricingSource, /wan30PrimeProCreditsPerSecondByResolution: \{ \.\.\.normalized\.wan30PrimeProCreditsPerSecondByResolution \}/);
});

test("Wan3.0 adaptive duration pre-deducts the maximum and settles from the output video", () => {
  assert.match(server, /const billingDuration = adaptiveDuration \? 30 : duration/);
  assert.match(server, /billingStatus: cost > 0 \? \(pricing\.adaptiveDuration \? "pre_deducted" : "settled"\)/);
  assert.match(server, /async function settleWan30AdaptiveDuration/);
  assert.match(server, /const actualDuration = await probeVideoDurationSeconds\(resultUrl\)/);
  assert.match(server, /Math\.min\(30, actualDuration\) \* creditsPerSecond/);
});

test("Seedance NSFW prices video input from combined input and output seconds", () => {
  const pricingSource = server.slice(
    server.indexOf("function advancedModelPricingRaw("),
    server.indexOf("function seedream5ImagePricingEstimate("),
  );
  assert.match(pricingSource, /normalizedProvider === SEEDANCE25_DIRECT_PROVIDER/);
  assert.match(pricingSource, /seedanceNsfwVideoCreditsPerSecondByResolution/);
  assert.match(pricingSource, /billingSeconds = duration \+ \(hasVideoInput \? inputVideoSeconds : 0\)/);
  assert.match(pricingSource, /source: "seedance25_direct_token_estimate"/);
  assert.match(server, /directSeedance25[\s\S]*completionTokens \* usdPerMillionTokens \* DEFAULT_CREDITS_PER_USD/);
});

test("Vega 1.5 Lite request and estimate carry reference video durations", () => {
  const createSource = fs.readFileSync(path.join(root, "platform.create.parts", "part-03.js"), "utf8");
  const estimateSource = fs.readFileSync(path.join(root, "platform.ui.parts", "part-04.js"), "utf8");
  const vegaHandlerSource = server.slice(
    server.indexOf("async function handleAdvancedVegaGenerate("),
    server.indexOf("async function handleAdvancedVegaTask(", server.indexOf("async function handleAdvancedVegaGenerate")),
  );
  assert.match(createSource, /const vegaReferenceVideoDurations = vegaVideoItems\.map/);
  assert.match(createSource, /referenceVideoDurations: vegaReferenceVideoDurations/);
  assert.match(vegaHandlerSource, /referenceVideoDurations/);
  assert.match(vegaHandlerSource, /advancedModelPricing\(provider, \{[\s\S]*?referenceVideoDurations,/);
  assert.match(estimateSource, /referenceVideoDurations: Array\.isArray\(options\.referenceVideoDurations\)/);
  assert.match(estimateSource, /vegaReferenceVideoDurations/);
});
