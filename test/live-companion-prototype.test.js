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

test("live companion guide persists seen and complete state while keeping local suppression", () => {
  assert.match(live, /api\(`\/api\/onboarding\?guide=\$\{GUIDE_KEY\}`\)/);
  assert.match(live, /api\(`\/api\/onboarding\/\$\{GUIDE_KEY\}\/\$\{action\}`/);
  assert.match(live, /localStorage\.getItem\(GUIDE_LOCAL_KEY\)/);
  assert.match(live, /vipeakVideoCompanionGuideSeen/);
});

test("live prototype styles and cache keys ship together", () => {
  assert.match(css, /\.companion-guide-card/);
  assert.match(css, /\.create-card-grid/);
  assert.match(css, /\.companion-stage-row/);
  assert.match(html, /live\.css\?v=202610242130/);
  assert.match(html, /live\.js\?v=202610242130/);
});
