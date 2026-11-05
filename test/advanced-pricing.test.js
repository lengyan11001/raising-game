"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const application = require("../server");
const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
const platformUi = fs.readFileSync(path.join(root, "platform.ui.js"), "utf8");

test("admin pricing rows use their server definition when saving", () => {
  assert.match(server, /ADVANCED_PRICING_ROWS_BY_KEY\.get\(key\)/);
});

test("public pricing uses the same configured model rows as the admin", () => {
  assert.match(server, /rows: publicAdvancedPricingRows\(normalized\)/);
  assert.match(server, /ADVANCED_PRICING_ROWS\s*\n\s*\.filter\(publicAdvancedPricingRowVisible\)/);
  assert.match(server, /saleCreditsPerUnit = advancedSaleCreditsPerSecond/);
  assert.match(server, /key: "wan27-image"[\s\S]*?saleCreditsPerUnit: advancedSaleImageCredits/);
  assert.match(server, /key: `qwen-image3-\$\{tier\}-\$\{resolution\.toLowerCase\(\)\}`/);
  assert.match(platformUi, /const configuredRows = Array\.isArray\(pricing\.rows\)/);
  assert.match(platformUi, /row\.saleCreditsPerUnit \?\? row\.saleCreditsPerSecond/);
  assert.match(platformUi, /Prices come directly from the current admin sale-price configuration/);
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
  for (const resolution of ["480p", "720p", "768p", "1080p", "2k", "4k"]) {
    assert.match(pricingRowsSource, new RegExp(`key: "vega10-pro-${resolution}"[^\\n]*provider: "seedance20-vega"[^\\n]*providerLabel: "Vega 1\\.0 Pro"[^\\n]*resolution: "${resolution}"`));
    assert.match(pricingRowsSource, new RegExp(`key: "vega10-pro-video-${resolution}"[^\\n]*provider: "seedance20-vega"[^\\n]*resolution: "${resolution}"[^\\n]*rateKind: "video_input"`));
    assert.match(server, new RegExp(`key === "vega10-pro-${resolution}"\\) next\\.vega10ProCreditsPerSecondByResolution\\["${resolution}"\\] = credits`));
    assert.match(server, new RegExp(`key === "vega10-pro-video-${resolution}"\\) next\\.vega10ProInputVideoCreditsPerSecondByResolution\\["${resolution}"\\] = credits`));
  }
  assert.match(server, /vega10ProCreditsPerSecondByResolution: \{\s*"480p": 9\.6,\s*"720p": 18\.345,\s*"768p": 18\.345,\s*"1080p": 39\.93,\s*"2k": 99\.225,\s*"4k": 113\.07,?\s*\}/);
  assert.match(server, /vega10ProInputVideoCreditsPerSecondByResolution: \{\s*"480p": 6\.03,\s*"720p": 11\.535,\s*"768p": 11\.535,\s*"1080p": 24\.93,\s*"2k": 61\.62,\s*"4k": 69\.225,?\s*\}/);

  const publicRows = application.publicAdvancedPricingRows(application.DEFAULT_ADVANCED_PRICING);
  const byKey = Object.fromEntries(publicRows.map((row) => [row.key, row]));
  assert.equal(byKey["vega10-pro-1080p"].saleCreditsPerUnit, 39.93);
  assert.equal(byKey["vega10-pro-video-1080p"].saleCreditsPerUnit, 24.93);
});

test("Vega 1.0 Pro bills no-reference, reference input, and reference output rates correctly", () => {
  for (const [resolution, expected] of [
    ["480P", 9.6],
    ["720P", 18.345],
    ["768P", 18.345],
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

test("Vega 1.5 Lite bills output and reference input video separately and fails closed at zero", () => {
  const pricingSource = server.slice(
    server.indexOf("function advancedModelPricing("),
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
  assert.match(pricingSource, /const outputRate = isVega10Pro && hasVideoInput \? inputVideoCreditsPerSecond : creditsPerSecond/);
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

test("admin pricing filters retired rows while preserving internal compatibility", () => {
  assert.match(server, /ADMIN_HIDDEN_PRICING_PROVIDERS = new Set\(\["wan27", "wan27-image"\]\)/);
  assert.match(server, /ADMIN_HIDDEN_PRICING_CAPABILITIES = new Set\(\["wan-animate-move", "wan-animate-mix"\]\)/);
  assert.match(server, /ADVANCED_PRICING_ROWS\.filter\(adminAdvancedPricingRowVisible\)/);
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
  assert.match(server, /purchaseEditable: Boolean\(wan30PurchaseTable\)/);
  assert.match(server, /const rawPurchaseUsd = Number\(row\.purchaseUsdPerSecond\)/);
  assert.match(server, /purchaseTable\[definedRow\.resolution\] = pricingNumber\(rawPurchaseUsd/);
  assert.match(server, /definedRow\?\.provider === "wan30" && rawCredits <= 0/);
});

test("runtime billing uses family prices for Wan2.7 and HappyHorse", () => {
  const pricingSource = server.slice(
    server.indexOf("function advancedModelPricing("),
    server.indexOf("function seedream5ImagePricingEstimate("),
  );
  assert.match(pricingSource, /capability\.startsWith\("happyhorse-"\)[\s\S]*happyhorseCreditsPerSecondByResolution/);
  assert.match(pricingSource, /capability\.startsWith\("wan27-"\)[\s\S]*wan27CreditsPerSecondByResolution/);
});

test("Wan3.0 uses configured per-second billing", () => {
  const pricingSource = server.slice(
    server.indexOf("function advancedModelPricing("),
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
    server.indexOf("function advancedModelPricing("),
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
