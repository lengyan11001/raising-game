const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("membership products remain while API documentation is available to everyone", () => {
  const server = read("server.js");
  const html = read("platform.html");
  const main = read("platform.main.js");
  const explore = read("platform.explore.js");
  const copy = read("platform.copy.js");

  assert.match(server, /CREATOR_MEMBERSHIP_PLAN_ID\s*=\s*"plan-main-creator"/);
  assert.match(server, /CREATOR_MEMBERSHIP_PRICE_USD\s*=\s*99/);
  assert.match(server, /CREATOR_MEMBERSHIP_REFERRAL_TARGET\s*=\s*100/);
  assert.doesNotMatch(server, /API_DOCS_PRICE_USD/);
  assert.doesNotMatch(server, /API_DOCS_TEST_CREDITS/);
  assert.doesNotMatch(server, /API_DOCS_PURCHASE_REQUIRED/);
  assert.doesNotMatch(server, /API_DOCS_ACCESS_REQUIRED/);
  assert.match(server, /async function requireApiDocsAccess[\s\S]*?return \{ user: null, db: null, tokenSource: "" \};/);
  assert.match(server, /async function requireExternalApiDocsAccess[\s\S]*?return requireUser\(req, res\);/);
  assert.match(server, /id:\s*"usd-500"/);
  assert.doesNotMatch(server, /id:\s*"usd-1000"/);
  assert.doesNotMatch(html, /id="apiDocsPurchaseCard"/);
  assert.doesNotMatch(html, /id="buyApiDocsBtn"/);
  assert.doesNotMatch(html, /\$1,000/);
  assert.match(html, /<div id="apiDocsUnlockedContent">/);
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
  assert.doesNotMatch(main, /openEntitlementPaymentChoice\("api-docs-access"/);
  assert.match(main, /billingPlanId:\s*"plan-main-creator"/);
  assert.match(main, /openBillingPaymentChoice\(\{[\s\S]*billingPlanId:\s*"plan-main-creator"/);
  assert.match(explore, /function renderAccessGuides\(\) \{\s*const enabled = tenantFeature\("apiAccess", true\);/);
  assert.doesNotMatch(explore, /apiDocsAccessActive\(\)/);
  assert.match(explore, /els\.apiDocsUnlockedContent\.hidden = !enabled/);
  assert.match(explore, /function isOwnGalleryCharacter/);
  assert.match(explore, /ownCharacter/);
  assert.match(explore, /function isHiddenToolSubscriptionPlan/);
  assert.match(explore, /Number\(plan\.amount \|\| 0\) === 20/);
  assert.match(explore, /intervalUnit \|\| ""\)\.toLowerCase\(\) === "month"/);
  assert.doesNotMatch(explore, /if \(confirmed === "confirm"\) \{[\s\S]*?startEntitlementCheckout\(\{ billingPlanId:/);
});

test("API documentation is public and external API tokens no longer need a paid entitlement", () => {
  const server = read("server.js");
  const html = read("platform.html");
  const ui = read("platform.ui.js");
  const config = read("platform.config.js");
  const admin = read("admin.js");
  const copy = read("platform.copy.js");
  assert.doesNotMatch(server, /API_DOCS_PURCHASE_REQUIRED/);
  assert.doesNotMatch(server, /API_DOCS_ACCESS_REQUIRED/);
  assert.match(server, /async function requireExternalApiDocsAccess\(req, res\)[\s\S]*?return requireUser\(req, res\);/);
  assert.match(server, /requireExternalApiDocsAccess\(req, res\)/);
  assert.doesNotMatch(html, /Unlock docs/);
  assert.doesNotMatch(config, /apiDocsPurchaseCard|buyApiDocsBtn|apiDocsPurchaseStatus|apiDocsAccessActive/);
  assert.doesNotMatch(admin, /editApiDocsAccess|API 文档接口权限|会员 \/ API文档/);
  assert.doesNotMatch(copy, /referral\.apiDocsCommission|\$1000 API docs|1000 美元接口文档/);
  assert.match(ui, /loadApiDocsCenter/);
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

test("membership top-up bonuses are capped at 20 percent", () => {
  const server = read("server.js");
  const config = read("platform.config.js");
  assert.match(server, /id:\s*"usd-200", amount: 200, credits: 24000/);
  assert.match(server, /id:\s*"usd-500", amount: 500, credits: 60000/);
  assert.match(config, /id: "usd-200", amount: 200, credits: 24000/);
  assert.match(config, /id: "usd-500", amount: 500, credits: 60000/);
  assert.doesNotMatch(server, /id:\s*"usd-500", amount: 500, credits: 65000/);
});

test("membership top-up package credits and pink bonus badges match requested rates", () => {
  const server = read("server.js");
  const config = read("platform.config.js");
  const explore = read("platform.explore.js");
  const css = read("platform.css");
  assert.match(server, /usd-20", amount: 20, credits: 2100, bonusPercent: 5/);
  assert.match(server, /usd-30", amount: 30, credits: 3300, bonusPercent: 10/);
  assert.match(server, /usd-50", amount: 50, credits: 5750, bonusPercent: 15/);
  assert.match(server, /usd-100", amount: 100, credits: 12000, bonusPercent: 20/);
  assert.match(server, /usd-200", amount: 200, credits: 24000, bonusPercent: 20/);
  assert.match(server, /usd-500", amount: 500, credits: 60000, bonusPercent: 20/);
  assert.match(config, /id: "usd-20", amount: 20, credits: 2100, bonusPercent: 5/);
  assert.match(config, /id: "usd-30", amount: 30, credits: 3300, bonusPercent: 10/);
  assert.match(config, /id: "usd-50", amount: 50, credits: 5750, bonusPercent: 15/);
  assert.match(config, /id: "usd-100", amount: 100, credits: 12000, bonusPercent: 20/);
  assert.match(config, /id: "usd-200", amount: 200, credits: 24000, bonusPercent: 20/);
  assert.match(config, /id: "usd-500", amount: 500, credits: 60000, bonusPercent: 20/);
  assert.match(explore, /bonusPercent/);
  assert.match(explore, /topup-package-badge/);
  assert.match(css, /\.topup-package-badge/);
  assert.match(css, /background: #ff4fa3;/);
});
test("non-members do not flash top-up bonus badges; redeeming membership refreshes packages immediately", () => {
  const explore = read("platform.explore.js");
  const create = read("platform.create.js");
  assert.match(explore, /const member = creatorMembershipActive\(\);/);
  assert.match(explore, /bonusPercent: member \? Number\(item\.bonusPercent/);
  assert.match(create, /Array\.isArray\(state\.billing\?\.topupPackages\)/);
  assert.match(create, /state\.wallet = \{ \.\.\.\(state\.wallet \|\| \{\}\), topupPackages: state\.billing\.topupPackages \}/);
});


test("creating a result switches the result media tab to match task kind", () => {
  const create = read("platform.create.js");
  assert.match(create, /state\.advancedResultMediaKind = "video";\s*const pendingTaskId = `pending-video/);
  assert.match(create, /state\.advancedResultMediaKind = "image";\s*const pendingTaskId = `pending-image/);
  assert.ok((create.match(/state\.advancedResultMediaKind = "image";/g) || []).length >= 2);
});
test("admin membership code list exposes a persistent one-click copy button", () => {
  const admin = read("admin.js");
  const css = read("admin.css");
  const db = read("db.js");
  const server = read("server.js");
  assert.match(db, /code_value TEXT NOT NULL DEFAULT ''/);
  assert.match(db, /INSERT INTO app_membership_activation_codes[\s\S]*?code_value/);
  assert.match(db, /code: String\(row\.code_value \|\| ""\)/);
  assert.match(server, /codeHash: membershipActivationCodeHash\(code\),[\s\S]*?code,/);
  assert.match(admin, /adm-membership-code-cell[\s\S]*?data-copy-membership-code=/);
  assert.match(admin, /<i data-lucide="copy"><\/i>复制<\/button>/);
  assert.match(admin, /copyText\(button\.dataset\.copyMembershipCode \|\| "", "激活码已复制。"\)/);
  assert.match(admin, /<th>用户对象<\/th>/);
  assert.match(admin, /function membershipCodeUsersHtml/);
  assert.match(admin, /record\.redemptionUsers/);
  assert.match(db, /'id', COALESCE\(NULLIF\(users\.id, ''\), redemptions\.user_id\)/);
  assert.match(db, /'username', COALESCE\(NULLIF\(users\.username, ''\), redemptions\.user_id\)/);
  assert.match(db, /search_users\.username/);
  assert.match(css, /\.adm-membership-code-users/);
  assert.doesNotMatch(admin, /newMembershipCodes|本次创建的明文码/);
  assert.match(css, /\.adm-membership-code-cell \.adm-btn \{ flex: 0 0 auto; \}/);
});
