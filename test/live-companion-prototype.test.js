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
  assert.match(html, /live\.css\?v=202610262200/);
  assert.match(html, /live\.js\?v=chat-unlocked-20261026-3/);
  assert.match(html, /chat-live\.js\?v=chat-unlocked-20261026-3/);
});
