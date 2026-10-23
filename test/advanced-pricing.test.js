"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
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
