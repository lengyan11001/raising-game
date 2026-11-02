const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("main site and both tool tenants use the 100-credit referral reward", () => {
  const server = read("server.js");
  const tenants = read("lib-tenants.js");
  const html = read("platform.html");
  const copy = read("platform.copy.js");
  const ui = read("platform.ui.js");
  const main = read("platform.main.js");
  const videoCss = read("tool-video.css");

  assert.match(server, /const REFERRAL_REWARD_CREDITS = 100;/);
  assert.match(tenants, /tenantId: "tool-undress-14vips"[\s\S]*?allowedTabs: \[[^\]]*"referral"[\s\S]*?disabledTabs: \[(?![^\]]*"referral")/);
  assert.match(tenants, /tenantId: "tool-video-123tops"[\s\S]*?allowedTabs: \[[^\]]*"referral"[\s\S]*?disabledTabs: \[(?![^\]]*"referral")/);
  assert.match(server, /function undressToolApiPathAllowed[\s\S]*?pathValue === "\/api\/referral"/);
  assert.match(html, /class="top-tab" data-tab="referral"/);
  assert.match(server, /const rewardCount =[\s\S]*?const origin = pageOriginFromRequest\(req\);[\s\S]*?inviteUrl: `\$\{origin\}\/\?ref=/);
  assert.match(ui, /const publicTab = button\.dataset\.tab === "pricing"/);
  assert.match(ui, /state\.user && !skipReferralRefresh\) loadReferralSummary\(\{ force: true \}\)/);
  assert.match(main, /function copyReferralText[\s\S]*?document\.execCommand\("copy"\)/);
  assert.match(videoCss, /\.top-tab\[data-tab\]:not\(\[data-tab="history"\]\):not\(\[data-tab="referral"\]\)/);
  assert.doesNotMatch(`${html}\n${copy}`, /750(?:-credit| credits| 积分)/);
});

test("paid invite rewards are not gated by creator membership and remain idempotent", () => {
  const server = read("server.js");
  const live = read("live.js");

  const grant = server.match(/async function maybeGrantReferralReward[\s\S]*?\n}\n\nasync function grantPendingReferralRewardsForMember/)[0];
  assert.doesNotMatch(grant, /ensureCreatorMembershipFromReferrals|userHasCreatorMembership/);
  assert.match(grant, /referralRewardAlreadyGranted\(db, referrer\.id, referredUser\.id\)/);
  assert.match(grant, /REFERRAL_REWARD_CREDITS/);
  assert.match(server, /cleanType === "referral_reward" \? `\$\{meta\?\.referrerUserId \|\| ""\}:\$\{meta\?\.referredUserId \|\| ""\}`/);

  const pending = server.match(/async function grantPendingReferralRewardsForMember[\s\S]*?\n}\n\nfunction currentAuthContext/)[0];
  assert.match(pending, /if \(!referrer\?\.id\) return 0;/);
  assert.doesNotMatch(pending, /userHasCreatorMembership/);
  assert.match(pending, /String\(order\.status \|\| ""\)\.toLowerCase\(\) === "paid"/);

  const summary = server.match(/function publicReferralSummary[\s\S]*?\n}\n\nfunction apiSubtokenView/)[0];
  assert.match(summary, /const availableRewards = Math\.max\(0, paidUserIds\.size - rewardCount\);/);
  assert.match(summary, /const rewardEligible = true;/);
  assert.match(summary, /rewardEligible,/);

  const referralPage = live.match(/async function showReferral\(\) \{[\s\S]*?\n  \}\n\n  function languageSheet/)[0];
  assert.match(referralPage, /\\u6bcf\\u4f4d\\u6709\\u6548\\u4ed8\\u8d39\\u7528\\u6237 \$\{reward\} \\u79ef\\u5206/);
  assert.match(referralPage, /\\u540c\\u4e00\\u4e2a\\u88ab\\u9080\\u8bf7\\u7528\\u6237\\u53ea\\u8ba1\\u4e00\\u6b21\\u5956\\u52b1\\uff0c\\u91cd\\u590d\\u652f\\u4ed8\\u4e0d\\u91cd\\u590d\\u53d1\\u653e/);
  assert.match(referralPage, /\\u5956\\u52b1\\u79ef\\u5206\\u53d1\\u653e\\u81f3\\u666e\\u901a\\u79ef\\u5206\\u4f59\\u989d/);
  assert.doesNotMatch(referralPage, /V币|5%|withdraw-referral|会员门槛/);
});
