const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("membership and API documentation entitlements use the requested products", () => {
  const server = read("server.js");
  const html = read("platform.html");
  const main = read("platform.main.js");
  const config = read("platform.config.js");
  const create = read("platform.create.js");
  const explore = read("platform.explore.js");
  const copy = read("platform.copy.js");

  assert.match(server, /CREATOR_MEMBERSHIP_PLAN_ID\s*=\s*"plan-main-creator"/);
  assert.match(server, /CREATOR_MEMBERSHIP_PRICE_USD\s*=\s*99/);
  assert.match(server, /CREATOR_MEMBERSHIP_REFERRAL_TARGET\s*=\s*100/);
  assert.match(server, /API_DOCS_PRODUCT_ID\s*=\s*"api-docs-access"/);
  assert.match(server, /API_DOCS_PRICE_USD\s*=\s*1000/);
  assert.match(server, /API_DOCS_TEST_CREDITS\s*=\s*20000/);
  assert.match(server, /id:\s*"usd-500"/);
  assert.doesNotMatch(server, /id:\s*"usd-1000"/);
  assert.match(html, /id="buyApiDocsBtn"/);
  assert.match(html, /id="buyMembershipBtn"/);
  assert.match(html, /id="topupMembershipLink"/);
  assert.match(html, /data-i18n="topup\.membershipGuideHint"/);
  assert.match(html, /data-i18n="membership\.benefitReferral"/);
  assert.match(html, /data-i18n="membership\.benefitTopup"/);
  assert.match(html, /class="membership-benefit-badge" data-i18n="membership\.badgeExplore"/);
  assert.match(html, /class="membership-benefit-badge" data-i18n="membership\.badgeReferral"/);
  assert.match(html, /class="membership-benefit-badge" data-i18n="membership\.badgeTopup"/);
  assert.match(copy, /"topup\.membershipGuideHint": "开通权益，领取最高 20% 充值套餐奖励"/);
  assert.match(copy, /"membership\.benefitExplore": "观看和下载 Explore 视频"/);
  assert.match(copy, /"membership\.badgeExplore": "免费"/);
  assert.match(copy, /"membership\.badgeReferral": "每位 100 积分"/);
  assert.match(copy, /"membership\.badgeTopup": "最高 20%"/);
  assert.match(main, /topupMembershipLink\?\.addEventListener\("click"[\s\S]*?setTab\("referral"\)/);
  assert.match(main, /membershipCard\?\.scrollIntoView/);
  assert.match(config, /selectedProductId:\s*""/);
  assert.match(main, /openEntitlementPaymentChoice\("api-docs-access", els\.apiDocsPurchaseStatus\)/);
  assert.doesNotMatch(main, /startEntitlementCheckout\(\{ productId:\s*"api-docs-access"/);
  assert.match(create, /function openEntitlementPaymentChoice/);
  assert.match(create, /state\.selectedProductId = product\.id/);
  assert.match(create, /setTopupStep\("payment"\)/);
  assert.match(create, /if \(payPalCheckoutVisible\(\)\) renderPayPalCheckout\(\)/);
  assert.match(explore, /function selectedBillingProduct/);
  assert.match(explore, /\? \{ productId: billingProduct\.id \}/);
  assert.match(explore, /body: billingPlan[\s\S]*?\? \{ productId: billingProduct\.id, walletOptionId:/);
  assert.match(main, /billingPlanId:\s*"plan-main-creator"/);
  assert.match(main, /openBillingPaymentChoice\(\{[\s\S]*billingPlanId:\s*"plan-main-creator"/);
  assert.match(main, /function openTopupDialog\(\)[\s\S]*?topupMembershipLink\.hidden = !membershipProgramEnabled\(\)/);
  assert.match(create, /function openBillingPaymentChoice/);
  assert.match(create, /state\.selectedBillingPlanId = plan\?\.id \|\| ""/);
  assert.match(explore, /function isOwnGalleryCharacter/);
  assert.match(explore, /ownCharacter/);
  assert.match(explore, /function isHiddenToolSubscriptionPlan/);
  assert.match(explore, /Number\(plan\.amount \|\| 0\) === 20/);
  assert.match(explore, /intervalUnit \|\| ""\)\.toLowerCase\(\) === "month"/);
  assert.doesNotMatch(explore, /if \(confirmed === "confirm"\) \{[\s\S]*?startEntitlementCheckout\(\{ billingPlanId:/);
});

test("API documentation access can be revoked for external tokens without blocking the site frontend", () => {
  const server = read("server.js");
  const admin = read("admin.js");
  assert.match(server, /async function requireExternalApiDocsAccess\(/);
  assert.match(server, /tokenSource === "api_token" \|\| tokenSource === "subtoken"/);
  assert.match(server, /code: "API_DOCS_ACCESS_REQUIRED"/);
  assert.match(server, /if \(typeof body\.apiDocsAccess === "boolean"\)/);
  assert.match(server, /status: "revoked"/);
  assert.match(server, /status: "active"/);
  assert.match(server, /requireExternalApiDocsAccess\(req, res\)/);
  assert.match(admin, /id="editApiDocsAccess"/);
  assert.match(admin, /const apiDocsAccess = Boolean\(tpl\.querySelector\("#editApiDocsAccess"\)/);
  assert.match(admin, /const body = \{ role, apiDocsAccess \}/);
});

test("USDT API documentation checkout creates a product order", () => {
  const server = read("server.js");
  const handler = server.match(/async function handleCreatePaymentOrder[\s\S]*?\n}\r?\n\r?\nasync function handleListPaymentOrders/);
  assert.ok(handler, "manual payment order handler should be present");
  assert.match(handler[0], /requestedProductId === API_DOCS_PRODUCT_ID && tenant\.membershipProgram/);
  assert.match(handler[0], /code: "PRODUCT_ALREADY_OWNED"/);
  assert.match(handler[0], /kind: "product"/);
  assert.match(handler[0], /amount: API_DOCS_PRICE_USD/);
  assert.match(handler[0], /credits: API_DOCS_TEST_CREDITS/);
  assert.match(handler[0], /orderKind: paymentSelection\.kind/);
  assert.match(handler[0], /productId: paymentSelection\.kind === "product" \? paymentSelection\.id : ""/);
});

test("paid settlement grants product credits or membership without double settlement", () => {
  const server = read("server.js");
  const settlement = server.match(/async function settleWalletOrderPayment[\s\S]*?\n}\r?\n\r?\nasync function safeSettleWalletOrderPayment/);
  assert.ok(settlement, "settlement function should be present");
  assert.match(settlement[0], /if \(order\.status === "paid"\)/);
  assert.match(settlement[0], /order\.orderKind === "product" && order\.productId === API_DOCS_PRODUCT_ID/);
  assert.match(settlement[0], /grantApiDocsAccess\(db, user/);
  assert.match(settlement[0], /if \(subscriptionPlan\) await activatePaidSubscription/);
  assert.match(settlement[0], /if \(order\.orderKind === "product" && order\.productId === API_DOCS_PRODUCT_ID\)/);
});

test("membership-only benefits are enforced server-side", () => {
  const server = read("server.js");
  const explore = server.match(/async function handleUnlockVideo[\s\S]*?\n}\r?\n\r?\nfunction localAssetUrlForGameMedia/);
  assert.ok(explore, "Explore access handler should be present");
  assert.match(explore[0], /MEMBERSHIP_REQUIRED/);
  assert.match(explore[0], /userHasCreatorMembership\(auth\.user\)/);
  assert.match(server, /function maybeGrantReferralReward[\s\S]*?REFERRAL_REWARD_CREDITS/);
  assert.match(server, /REFERRAL_REWARD_CREDITS\s*=\s*100/);
  assert.match(server, /CREATOR_MEMBERSHIP_REFERRAL_TARGET/);
});

test("activation codes are hashed, owner-scoped and redeemed transactionally", () => {
  const server = read("server.js");
  const db = read("db.js");
  assert.match(server, /function membershipActivationCodeHash/);
  assert.match(server, /redeemMembershipActivationCodeInDb\(/);
  assert.match(server, /await activateCreatorMembership\(auth\.db, auth\.user/);
  assert.match(db, /CREATE TABLE IF NOT EXISTS app_membership_activation_codes/);
  assert.match(db, /CREATE TABLE IF NOT EXISTS app_membership_activation_redemptions/);
  assert.match(db, /UNIQUE INDEX IF NOT EXISTS app_membership_activation_redemptions_code_user_uidx/);
  assert.match(db, /FOR UPDATE/);
});
