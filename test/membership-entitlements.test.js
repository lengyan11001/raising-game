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
  assert.match(main, /topupMembershipLink\?\.addEventListener\("click"[\s\S]*?setTab\("referral"\)/);
  assert.match(main, /membershipCard\?\.scrollIntoView/);
  assert.match(main, /productId:\s*"api-docs-access"/);
  assert.match(main, /billingPlanId:\s*"plan-main-creator"/);
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
