"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function promotionServerSource() {
  const server = read("server.js");
  const start = server.indexOf("const ELEVEN_ELEVEN_PROMO");
  const end = server.indexOf("\nasync function handlePromotionPaymentRoutes", start);
  assert.ok(start >= 0 && end > start, "11.11 server promotion block should be present");
  return server.slice(start, end);
}

function promotionHelpers() {
  const source = promotionServerSource();
  return new Function("STRIPE_CURRENCY", `${source}\nreturn {
    ELEVEN_ELEVEN_PROMO,
    elevenElevenSku,
    elevenElevenCampaignStarted,
    elevenElevenCampaignOpen,
    elevenElevenCampaignVisible,
    elevenElevenCampaignWindow,
    elevenElevenPublicPromo
  };`)("usd");
}

test("top-bar and mobile entries expose the redesigned 11.11 campaign", () => {
  const html = read("platform.html");

  assert.match(html, /class="eleven-eleven-entry eleven-eleven-entry-mobile"[\s\S]*?11\.11[\s\S]*?elevenElevenMobileCountdown/);
  assert.match(html, /class="eleven-eleven-entry eleven-eleven-entry-desktop"[\s\S]*?\$29\.9[\s\S]*?elevenElevenCountdown[\s\S]*?立即抢/);
  assert.ok(html.indexOf("eleven-eleven-entry-desktop") < html.indexOf('id="topupHeadBtn"'), "desktop campaign entry must sit left of Buy credits");
  assert.match(html, /id="elevenElevenDialog" class="eleven-eleven-dialog"/);
  assert.match(html, /id="elevenElevenCloseBtn"/);
  assert.match(html, /限时特惠，不限量供应/);
  assert.doesNotMatch(html, /限量 1,111|剩 1,111 份|eleven-eleven-bar/);
  assert.match(html, /data-eleven-sku="member"[\s\S]*?\$99[\s\S]*?\$29\.9[\s\S]*?终身有效/);
  assert.match(html, /data-eleven-sku="credits"[\s\S]*?\$66[\s\S]*?9,000[\s\S]*?多拿 80%/);
  assert.match(html, /class="eleven-eleven-rib" hidden>已购买/);
  assert.match(html, /class="eleven-eleven-rib" hidden>已购买/);
  assert.match(html, /最高 20%[\s\S]*?10,000 → 12,000 积分[\s\S]*?活动档位不参与，活动结束后自动生效/);
  assert.match(html, /活动档为限时特价，不与会员充值奖励及其它优惠叠加/);
  assert.match(html, /id="elevenElevenDone"[\s\S]*?支付成功[\s\S]*?当前积分余额/);
  assert.match(html, /id="elevenElevenEnded"[\s\S]*?本次活动已结束/);
});

test("promotion dialog handles countdown, sold-out, purchased, payment return, and duplicate submit", () => {
  const ui = read("platform.ui.parts/part-07.js");

  assert.match(ui, /requestJson\(`\/api\/promo\/1111\$\{command/);
  assert.match(ui, /params\.get\("promo"\) === "1111"/);
  assert.match(ui, /params\.get\("promo_cancelled"\) === "1"/);
  assert.match(ui, /params\.get\("promo_sku"\)/);
  assert.match(ui, /距开始/);
  assert.match(ui, /距结束/);
  assert.match(ui, /refresh\("refresh"\)/);
  assert.match(ui, /11\.11 新一期活动已开始/);
  assert.match(ui, /!sku \|\| sku\.purchased \|\| sku\.owned \|\| !promo\?\.active/);
  assert.match(ui, /rib\.textContent = sku\?\.purchased \? "已购买" : "已拥有"/);
  assert.match(ui, /已售 \$\{Number\(sku\?\.sold \|\| 0\)\.toLocaleString\(\)\}/);
  assert.doesNotMatch(ui, /sku\.capacity|sku\.remaining|sku\.soldOut|data-eleven-left|data-eleven-bar/);
  assert.match(ui, /创作者终身权益每个账号限购一次/);
  assert.match(ui, /支付未完成，请重试或更换支付方式/);
  assert.match(ui, /if \(paying\) return;/);
  assert.match(ui, /buyBtn\.disabled = paying/);
  assert.match(ui, /\[\"#elevenElevenCloseBtn\", \"#elevenElevenEndedBtn\", \"#elevenElevenDoneBtn\"\]/);
  assert.match(ui, /requestJson\("\/api\/auth\/me"\)/);
  assert.match(ui, /item\.orderStatus === "paid"/);
  assert.match(ui, /attempt < 20/);
});

test("server defines the two campaign SKUs with authoritative price and credit values", () => {
  const source = promotionServerSource();
  const helpers = promotionHelpers();

  assert.equal(helpers.ELEVEN_ELEVEN_PROMO.id, "eleven-eleven-2026");
  assert.deepEqual(Object.keys(helpers.ELEVEN_ELEVEN_PROMO.skus), ["member", "credits"]);
  assert.equal(helpers.elevenElevenSku("member").amount, 29.9);
  assert.equal(helpers.elevenElevenSku("member").originalAmount, 99);
  assert.equal(helpers.elevenElevenSku("member").displaySold, 896);
  assert.equal(helpers.elevenElevenSku("member").capacity, undefined);
  assert.equal(helpers.elevenElevenSku("credits").amount, 66);
  assert.equal(helpers.elevenElevenSku("credits").originalAmount, 90);
  assert.equal(helpers.elevenElevenSku("credits").credits, 9000);
  assert.equal(helpers.elevenElevenSku("unknown"), null);

  assert.match(source, /const sku = elevenElevenSku\(body\.sku\)/);
  assert.match(source, /baseAmount: sku\.amount/);
  assert.match(source, /creditAmount: creditsAmount\(sku\.credits\)/);
  assert.match(source, /packageCredits: sku\.credits/);
  assert.doesNotMatch(source, /body\.(amount|price|credits|capacity)/);
  assert.doesNotMatch(source, /readDb\(|readFile|data\/.+\.json/);
});

test("promotion status reports inventory and per-user purchase state from the server clock", () => {
  const { ELEVEN_ELEVEN_PROMO, elevenElevenCampaignOpen, elevenElevenCampaignVisible, elevenElevenCampaignWindow, elevenElevenPublicPromo } = promotionHelpers();
  const beforeStart = ELEVEN_ELEVEN_PROMO.startsAt - 1;
  const during = ELEVEN_ELEVEN_PROMO.startsAt + 1;
  const afterFirstPeriod = ELEVEN_ELEVEN_PROMO.startsAt + ELEVEN_ELEVEN_PROMO.periodSeconds * 1000 + 1;
  const afterEnd = ELEVEN_ELEVEN_PROMO.startsAt + ELEVEN_ELEVEN_PROMO.periodSeconds * 1000 * 2;

  assert.equal(elevenElevenCampaignVisible(beforeStart), true);
  assert.equal(elevenElevenCampaignOpen(beforeStart), false);
  assert.equal(elevenElevenCampaignOpen(during), true);
  assert.equal(elevenElevenCampaignVisible(afterEnd), true);
  assert.equal(elevenElevenCampaignOpen(afterEnd), true);
  assert.equal(elevenElevenCampaignWindow(afterFirstPeriod).startsAt, ELEVEN_ELEVEN_PROMO.startsAt + ELEVEN_ELEVEN_PROMO.periodSeconds * 1000);
  assert.equal(elevenElevenCampaignWindow(afterFirstPeriod).endsAt, ELEVEN_ELEVEN_PROMO.startsAt + ELEVEN_ELEVEN_PROMO.periodSeconds * 1000 * 2);

  const promo = elevenElevenPublicPromo({
    purchases: [
      { sku: "member", status: "paid", orderId: "stripe_member" },
      { sku: "credits", status: "paid", orderId: "stripe_credits" },
    ],
  }, during);
  const member = promo.skus.find((sku) => sku.id === "member");
  const credits = promo.skus.find((sku) => sku.id === "credits");

  assert.equal(promo.active, true);
  assert.equal(member.sold, 896);
  assert.equal(member.purchased, true);
  assert.equal(member.owned, false);
  assert.equal(credits.sold, 743);
  assert.equal(credits.purchased, false, "credits remain repurchasable even after a paid purchase");
  assert.equal(credits.orderStatus, "paid", "checkout return polling still sees the latest credits order status");
  assert.equal(credits.orderId, "stripe_credits");
  assert.equal(member.capacity, undefined);
  assert.equal(member.remaining, undefined);
  assert.equal(member.soldOut, undefined);

  const memberViewerPromo = elevenElevenPublicPromo({ purchases: [] }, during, { memberActive: true });
  assert.equal(memberViewerPromo.skus.find((sku) => sku.id === "member").owned, true);
  assert.equal(memberViewerPromo.skus.find((sku) => sku.id === "credits").owned, false);
});

test("checkout allows unlimited credits purchases while the member SKU stays once per account", () => {
  const source = promotionServerSource();
  const db = read("db.js");

  assert.match(source, /if \(!dbEnabled\(\)\) return sendJson\(res, 503,[\s\S]*?DATABASE_REQUIRED/);
  assert.match(source, /if \(!elevenElevenCampaignStarted\(\)\)[\s\S]*?PROMO_CLOSED/);
  assert.match(source, /reservePromotionPurchaseInDb\(\{/);
  assert.doesNotMatch(source, /capacity: sku\.capacity|PROMO_SOLD_OUT/);
  assert.match(source, /reservationSeconds: ELEVEN_ELEVEN_PROMO\.reservationSeconds/);
  assert.match(source, /PROMO_ALREADY_PURCHASED/);
  assert.match(source, /MEMBERSHIP_ALREADY_ACTIVE/);
  assert.doesNotMatch(source, /existingState|existing\?\.status === "pending"/);
  assert.match(source, /PROMO_CHECKOUT_BUSY/);
  assert.match(source, /reused: true/);
  assert.match(source, /markPromotionPurchaseFailedInDb/);

  assert.match(db, /CREATE TABLE IF NOT EXISTS app_promotion_purchases/);
  assert.match(db, /id BIGSERIAL PRIMARY KEY/);
  assert.match(db, /CREATE UNIQUE INDEX IF NOT EXISTS app_promotion_purchases_member_once_uidx[\s\S]*?WHERE sku = 'member' AND status = 'paid'/);
  assert.match(db, /CREATE UNIQUE INDEX IF NOT EXISTS app_promotion_purchases_order_uidx[\s\S]*?WHERE order_id <> ''/);
  assert.match(db, /if \(cleanSku === "member" && paid\)/);
  assert.match(db, /pg_advisory_xact_lock\(hashtext\(\$1\)\)/);
});

test("Stripe return URL identifies the purchased SKU and cancellation releases the UI state", () => {
  const server = read("server.parts/part-34.js");
  const ui = read("platform.ui.parts/part-07.js");

  assert.match(server, /promoQuery\.set\("promo", "1111"\)/);
  assert.match(server, /promoQuery\.set\("promo_sku", order\.promoCampaignSku\)/);
  assert.match(server, /cancelQuery\.set\("promo_cancelled", "1"\)/);
  assert.match(server, /promoQuery\.set\("stripe_session_id", "\{CHECKOUT_SESSION_ID\}"\)/);
  assert.match(server, /checkout\.session\.expired[\s\S]*?markPromotionPurchaseFailedInDb/);
  assert.match(ui, /isCancelledCheckout[\s\S]*?await open\(\);[\s\S]*?setError\("支付未完成，请重试或更换支付方式。"\)/);
});

test("paid promotion purchases are marked before the settlement early return", () => {
  const server = read("server.parts/part-13.js");
  const marker = server.indexOf("markPromotionPurchasePaidInDb({ campaignId: ELEVEN_ELEVEN_PROMO.id, orderId: order.id })");
  const paidReturn = server.indexOf('if (order.status === "paid")', marker);

  assert.ok(marker >= 0, "settlement should mark the promotion purchase paid");
  assert.ok(paidReturn > marker, "paid marker must run before the existing paid early return");
});

test("promotion UI is cache-busted and has no duplicate dialog max-height declaration", () => {
  const html = read("platform.html");
  const css = read("platform.css");
  const cssVersion = html.match(/platform\.css\?v=([^"']+)/)?.[1] || "";
  const jsVersion = html.match(/platform\.js\?v=([^"']+)/)?.[1] || "";

  assert.ok(cssVersion, "platform.css must be cache-busted");
  assert.equal(jsVersion, cssVersion, "platform.css and platform.js must share one cache suffix");
  assert.match(cssVersion, /20261106/);
  assert.equal((css.match(/max-height: min\(860px, calc\(100dvh - 28px\)\);/g) || []).length, 1);
  assert.match(css, /@media \(max-width: 768px\)[\s\S]*?\.eleven-eleven-cards \{ grid-template-columns: 1fr; \}/);
});
