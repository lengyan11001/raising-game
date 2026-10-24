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

test("live recommendation cards keep one fixed frame", () => {
  assert.match(css, /\.person-card\{height:392px;display:flex;flex-direction:column\}/);
  assert.match(css, /\.person-image\{display:block;width:100%;height:330px;flex:0 0 330px\}/);
  assert.match(css, /\.person-intro\{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2/);
});

test("live prototype styles and cache keys ship together", () => {
  assert.match(css, /\.companion-guide-card/);
  assert.match(css, /\.create-card-grid/);
  assert.match(css, /\.companion-stage-row/);
  assert.match(html, /live\.css\?v=202610242350/);
  assert.match(html, /live\.js\?v=202610242350/);
  assert.match(html, /chat-live\.js\?v=202610242320/);
});
