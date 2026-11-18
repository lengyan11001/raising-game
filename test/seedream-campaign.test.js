const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("Seedream campaign banner and checkout entry are offline", () => {
  const html = read("platform.html");
  assert.doesNotMatch(html, /data-campaign-carousel/);
  assert.doesNotMatch(html, /data-campaign-open="seedream55"/);
  assert.doesNotMatch(html, /id="seedreamCampaignDialog"/);
  assert.doesNotMatch(html, /id="seedreamCampaignBuyBtn"/);
  assert.doesNotMatch(html, /会员免费使用/);
});

test("Seedream campaign client behavior is removed from the shell", () => {
  const source = read("platform.ui.parts/part-07.js");
  assert.doesNotMatch(source, /SEEDREAM_CAMPAIGN_ENDS_AT/);
  assert.doesNotMatch(source, /setupSeedreamCampaign/);
  assert.doesNotMatch(source, /\/api\/promo\/seedream55\/checkout/);
});

test("Seedream campaign has responsive modal styling and a real local hero asset", () => {
  const css = read("platform.css");
  assert.match(css, /\.side-campaign-carousel/);
  assert.match(css, /\.side-campaign-track/);
  assert.match(css, /\.seedream-campaign-dialog/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*?\.seedream-campaign-body \{ display: block;/);
  const asset = fs.statSync(path.join(root, "assets/campaigns/seedream-5-5.jpg"));
  assert.ok(asset.size > 50_000);
});

test("Seedream campaign checkout is server-authoritative and completes the promotion lifecycle", () => {
  const promo = read("server.parts/part-44.js");
  const settlement = read("server.parts/part-13.js");
  const stripe = read("server.parts/part-34.js");
  assert.match(promo, /const SEEDREAM55_CAMPAIGN = Object\.freeze\(\{/);
  assert.match(promo, /id: "seedream55-2026"/);
  assert.match(promo, /enabled: false/);
  assert.match(promo, /amount: 59\.9/);
  assert.match(promo, /originalAmount: 99/);
  assert.match(promo, /url\.pathname === "\/api\/promo\/seedream55\/checkout"/);
  assert.match(promo, /promoCampaignId: SEEDREAM55_CAMPAIGN\.id/);
  assert.match(promo, /baseAmount: SEEDREAM55_CAMPAIGN\.amount/);
  assert.match(settlement, /order\.promoCampaignId === SEEDREAM55_CAMPAIGN\.id[\s\S]*?markPromotionPurchasePaidInDb\(\{ campaignId: SEEDREAM55_CAMPAIGN\.id/);
  assert.match(stripe, /order\.promoCampaignId === SEEDREAM55_CAMPAIGN\.id/);
  assert.match(stripe, /markPromotionPurchaseFailedInDb\(\{ campaignId: order\.promoCampaignId/);
});
