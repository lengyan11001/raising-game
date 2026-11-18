const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("Seedream campaign entry lives below the main navigation and opens the campaign dialog", () => {
  const html = read("platform.html");
  const navEnd = html.indexOf("</nav>", html.indexOf('class="top-tabs"'));
  const campaign = html.indexOf('class="side-campaign-carousel"');
  const utilityNav = html.indexOf('class="side-utility-nav"');
  assert.ok(navEnd >= 0 && campaign > navEnd && utilityNav > campaign);
  assert.match(html, /data-campaign-carousel/);
  assert.match(html, /data-campaign-track/);
  assert.match(html, /data-campaign-open="seedream55"/);
  assert.match(html, /assets\/campaigns\/seedream-5-5\.jpg/);
  assert.match(html, /id="seedreamCampaignDialog"/);
  assert.match(html, /id="seedreamCampaignBuyBtn"[^>]*>立即开通 \$59\.9</);
  assert.match(html, /原价 <s>\$99<\/s>/);
});

test("Seedream campaign supports carousel, countdown, membership state, and checkout", () => {
  const source = read("platform.ui.parts/part-07.js");
  assert.match(source, /const SEEDREAM_CAMPAIGN_ENDS_AT = "2026-11-30T23:59:59\+08:00"/);
  assert.match(source, /track\.style\.transform = `translateX\(-\$\{activeIndex \* 100\}%\)`/);
  assert.match(source, /window\.setInterval\(\(\) => showSlide\(activeIndex \+ 1\), 6000\)/);
  assert.match(source, /root\.addEventListener\("click", \(event\) => \{/);
  assert.match(source, /entry\.dataset\.campaignOpen === "seedream55"/);
  assert.match(source, /window\.setInterval\(syncCountdown, 1000\)/);
  assert.match(source, /requestJson\("\/api\/promo\/seedream55\/checkout", \{ method: "POST", body: \{\} \}\)/);
  assert.match(source, /window\.location\.assign\(checkoutUrl\)/);
  assert.match(source, /if \(!state\.token \|\| !state\.user\)[\s\S]*?openLogin/);
  assert.match(source, /function updateSeedreamCampaignMembership\(\)/);
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
  assert.match(promo, /amount: 59\.9/);
  assert.match(promo, /originalAmount: 99/);
  assert.match(promo, /url\.pathname === "\/api\/promo\/seedream55\/checkout"/);
  assert.match(promo, /promoCampaignId: SEEDREAM55_CAMPAIGN\.id/);
  assert.match(promo, /baseAmount: SEEDREAM55_CAMPAIGN\.amount/);
  assert.match(settlement, /order\.promoCampaignId === SEEDREAM55_CAMPAIGN\.id[\s\S]*?markPromotionPurchasePaidInDb\(\{ campaignId: SEEDREAM55_CAMPAIGN\.id/);
  assert.match(stripe, /order\.promoCampaignId === SEEDREAM55_CAMPAIGN\.id/);
  assert.match(stripe, /markPromotionPurchaseFailedInDb\(\{ campaignId: order\.promoCampaignId/);
});
