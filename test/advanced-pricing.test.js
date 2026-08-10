"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const server = fs.readFileSync(path.join(root, "server.js"), "utf8");

test("admin pricing rows use their server definition when saving", () => {
  assert.match(server, /ADVANCED_PRICING_ROWS_BY_KEY\.get\(key\)/);
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
  assert.match(pricingSource, /billing: "output"/);
  assert.match(pricingSource, /billingDuration/);
  assert.match(pricingSource, /source: "configured_wan30_output_duration_rate"/);
  assert.doesNotMatch(pricingSource, /wan30_invitation_free/);
});

test("Wan3.0 purchase prices match the Alibaba Cloud Beijing price card", () => {
  assert.match(server, /const ALIYUN_WAN30_CNY_PER_USD = pricingNumber\([^\n]+, 6\.67,/);
  assert.match(server, /"480p": 0\.3,/);
  assert.match(server, /"720p": 0\.6,/);
  assert.match(server, /"1080p": 1\.2,/);
  assert.match(server, /source: "aliyun_beijing_official_model_pricing"/);
});

test("Wan3.0 adaptive duration pre-deducts the maximum and settles from the output video", () => {
  assert.match(server, /const billingDuration = adaptiveDuration \? 30 : duration/);
  assert.match(server, /billingStatus: cost > 0 \? \(pricing\.adaptiveDuration \? "pre_deducted" : "settled"\)/);
  assert.match(server, /async function settleWan30AdaptiveDuration/);
  assert.match(server, /const actualDuration = await probeVideoDurationSeconds\(resultUrl\)/);
  assert.match(server, /Math\.min\(30, actualDuration\) \* creditsPerSecond/);
});
