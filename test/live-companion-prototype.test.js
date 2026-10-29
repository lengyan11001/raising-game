"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const live = fs.readFileSync(path.join(root, "live.js"), "utf8");
const css = fs.readFileSync(path.join(root, "live.css"), "utf8");
const html = fs.readFileSync(path.join(root, "live.html"), "utf8");

test("live bottom navigation exposes the prototype create tab", () => {
  assert.match(live, /data-nav="create"[\s\S]*?label\("create"\)/);
  assert.match(live, /state\.page === "create"[\s\S]*?createCards\(\)/);
  assert.match(live, /function createCards\(\)/);
  assert.match(live, /data-create-form/);
  assert.match(live, /api\("\/api\/chat-live\/creator\/characters"/);
});

test("live relationship and companion level pages use the persisted API", () => {
  assert.match(live, /data-action="relationship"/);
  assert.match(live, /api\(`\/api\/companion\/relationship\/\$\{encodeURIComponent\(id\)\}`\)/);
  assert.match(live, /\["level", "crown", "陪伴等级"/);
  assert.match(live, /api\("\/api\/companion\/level"\)/);
  assert.match(live, /id="companionGuideTitle"/);
});


test("live relationship entries match the prototype placement and interaction", () => {
  assert.match(live, /class="relationship-entry"/);
  assert.match(live, /class="chat-relationship-strip"/);
  assert.match(live, /pendingRelationship/);
  assert.match(live, /function openCall\([\s\S]*?if \(!token\(\)\) return askLogin\(\{ characterId: c\.id, roomId \}\)/);
  assert.match(live, /role-detail-page[\s\S]*?relationship-entry[\s\S]*?role-intro-card/);
  assert.doesNotMatch(live, /class="role-relationship"/);
});

test("live companion guide persists seen and complete state while keeping local suppression", () => {
  assert.match(live, /api\(`\/api\/onboarding\?guide=\$\{GUIDE_KEY\}`\)/);
  assert.match(live, /api\(`\/api\/onboarding\/\$\{GUIDE_KEY\}\/\$\{action\}`/);
  assert.match(live, /localStorage\.getItem\(GUIDE_LOCAL_KEY\)/);
  assert.match(live, /vipeakVideoCompanionGuideSeen/);
});

test("the welcome guide CTA enters the first recommended character", () => {
  assert.match(live, /if \(a === "guide-start"\) \{[\s\S]*?const firstCharacter = state\.chars\[0\][\s\S]*?state\.role = firstCharacter; state\.page = "role-detail";[\s\S]*?render\(\);/);
});

test("live text chat keeps composing while a reply is pending", () => {
  assert.match(live, /textChatBurstState/);
  assert.match(live, /queueTextChatMessage\(conversationId, content\)/);
  assert.match(live, /flushTextChatBurst\(conversationId\)/);
  assert.match(live, /refreshTextChatMessages\(conversationId\)/);
  assert.match(live, /\[data-text-thread\]/);
  assert.match(live, /burst\.blocked/);
  assert.doesNotMatch(live, /const sendBtn = textForm\.querySelector\("button\[type=submit\]"\); sendBtn\.disabled = true/);
});

test("live recommendation cards keep one fixed frame", () => {
  assert.match(css, /\.person-card\{height:392px;display:flex;flex-direction:column\}/);
  assert.match(css, /\.person-image\{display:block;width:100%;height:330px;flex:0 0 330px\}/);
  assert.match(css, /\.person-intro\{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2/);
});

test("live Google login uses the registered redirect URI while keeping account login available", () => {
  assert.match(live, /const GOOGLE_LOGIN_VISIBLE = true;/);
  assert.match(live, /const redirect = location\.origin;/);
  assert.doesNotMatch(live, /const redirect = location\.origin \+ "\/"/);
  assert.match(live, /button\.hidden = !enabled;/);
  assert.match(live, /const hash = String\(location\.hash/);
  assert.match(html, /data-google-login hidden/);
  assert.match(html, /<input name="username"/);
  assert.match(html, /<input name="password"/);
});

test("live gift and spending ledger rows keep a stable three-column layout", () => {
  assert.match(css, /\.ledger-card\{display:grid/);
  assert.match(css, /\.ledger-card>div\{display:grid;[^}]*grid-template-columns:42px minmax\(0,1fr\) auto/);
  assert.match(css, /\.ledger-copy b,\.ledger-copy small\{[^}]*overflow:hidden[^}]*text-overflow:ellipsis/);
  assert.match(css, /\.ledger-card>div>em\{[^}]*text-align:right/);
  assert.match(live, /function ledgerRows\(items, empty\)[\s\S]*?<section class="ledger-card">/);
});

test("live prototype styles and cache keys ship together", () => {
  assert.match(css, /\.companion-guide-card/);
  assert.match(css, /\.create-card-grid/);
  assert.match(css, /\.companion-stage-row/);
  assert.match(html, /live\.css\?v=2026102906/);
  assert.match(html, /live\.js\?v=2026102906/);
  assert.match(html, /chat-live\.js\?v=chat-inline-20261026-1/);
});

test("live system messages, check-in, gift data, feedback, and billing rules are wired", () => {
  assert.match(live, /data-action="system-messages"/);
  assert.match(live, /class="conversation system-message-row"/);
  assert.match(live, /api\("\/api\/live\/notifications"\)/);
  assert.match(live, /api\("\/api\/live\/notifications\/read-all"/);
  assert.match(live, /data-action="checkin"/);
  assert.match(live, /api\("\/api\/live\/checkin"/);
  assert.match(live, /\["creator-income", "gift", "创作者收益", u \? "角色被使用产生的收益" : "登录后查看收益"\]/);
  assert.doesNotMatch(live, /\["creator-income", "gift", "礼物数据"/);
  assert.match(live, /state\.page === "creator-income"\) showCreatorIncome\(\)/);
  assert.match(live, /api\("\/api\/live\/creator-income\?limit=50"\)/);
  assert.match(live, /\["feedback", "chat", "问题反馈", "提交后会收到站内信回复"\]/);
  assert.match(live, /\["creator", "pen", "创作者中心"/);
  assert.match(live, /<section class="profile-menu" data-profile-menu>\$\{menu\}<\/section>/);
  assert.match(css, /\.profile-login-card/);
  assert.match(live, /state\.user = session\.user \|\| null;[\s\S]*?localStorage\.removeItem\(TOKEN_KEY\)/);
  assert.doesNotMatch(live, /lastTouchActionAt = Date\.now\(\);\s*run\(event\)/);
  assert.match(live, /data-menu-action/);
  assert.match(live, /function bindProfileMenuActions\(\)/);
  assert.match(live, /href="#profile\/\$\{action\}"/);
  assert.match(live, /addEventListener\("touchstart"/);
  assert.match(live, /addEventListener\("touchend"/);
  assert.match(live, /function profileRouteFromHash\(\)/);
  assert.match(live, /a === "feedback"\)/);
  assert.match(live, /api\("\/api\/support-messages"/);
  assert.match(live, /聊天付费规则/);
  assert.match(live, /文字私信[\s\S]*?0\.5 积分\/条/);
  assert.match(live, /语音通话 \/ 语音消息[\s\S]*?2 积分\/秒/);
  assert.match(live, /视频通话[\s\S]*?5 积分\/秒/);
  assert.match(live, /陪伴房间[\s\S]*?5 积分\/秒/);
  assert.match(live, /礼物打赏[\s\S]*?data-action="rooms">去房间/);
  assert.match(css, /\.rule-rows>div>em,\.rule-rows>div>button\{[^}]*margin-left:auto[^}]*text-align:right[^}]*font-variant-numeric:tabular-nums/);
  assert.doesNotMatch(live, /textMessageCredits\s*\|\|\s*0\.5/);
  assert.doesNotMatch(live, /V币|爱心币/);
  assert.match(css, /\.system-message-row/);
  assert.match(css, /\.checkin-hero/);
  assert.match(css, /\.income-hero/);
  assert.match(css, /\.feedback-form/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
  const db = fs.readFileSync(path.join(root, "db.js"), "utf8");
  const admin = fs.readFileSync(path.join(root, "admin.js"), "utf8");
  assert.doesNotMatch(db, /V币|爱心币/);
  assert.doesNotMatch(admin, /V币|爱心币/);
  assert.match(db, /ON CONFLICT \(id\) DO UPDATE[\s\S]*?payload->>'welcome' = 'true'/);
});

test("the main domain serves an independent one-screen landing page", () => {
  const serverSource = fs.readFileSync(path.join(root, "server.js"), "utf8");
  const landingHtml = fs.readFileSync(path.join(root, "site-landing.html"), "utf8");
  const landingCss = fs.readFileSync(path.join(root, "site-landing.css"), "utf8");
  const landingJs = fs.readFileSync(path.join(root, "site-landing.js"), "utf8");
  assert.match(serverSource, /defaultPageForHostname\(requestHostname\(req\)\)/);
  assert.match(serverSource, /"\/site-landing\.html", "\/site-landing\.css", "\/site-landing\.js"/);
  assert.match(serverSource, /"\/platform\.html"/);
  assert.match(landingHtml, /class="site-header"/);
  assert.match(landingHtml, /href="\/live\.html"/);
  assert.match(landingCss, /\.header-cta \{ display: none; \}/);
  assert.match(landingCss, /\.menu-button \{ display: block; \}/);
  assert.match(landingCss, /\.hero h1 \{ font-size: clamp\(35px, 9\.8vw, 41px\); \}/);
  assert.match(landingJs, /data-menu-toggle/);
  assert.match(landingJs, /data-mobile-menu/);
});
