"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("live billing copy does not rewrite the platform top-up panel", () => {
  const platformHtml = read("platform.html");
  const platformCopy = read("platform.copy.js");
  assert.match(platformHtml, /积分永不过期 · Credits never expire\./);
  assert.match(platformHtml, /<strong id="topupCredits">0 credits<\/strong>/);
  assert.doesNotMatch(platformHtml, /topup-expiry-note" data-i18n="topup\.creditsNeverExpire"/);
  assert.doesNotMatch(platformCopy, /"topup\.creditsNeverExpire": "积分永不过期。"/);
});

test("live credit display work does not change platform pricing units", () => {
  const platformUi = read("platform.ui.js");
  assert.match(platformUi, /mobileDrawerCredits\.textContent = state\.user \? `\$\{Number\(state\.user\?\.credits \|\| 0\)\} credits` : ""/);
  assert.match(platformUi, /const publicCredits = \(value\) => `\$\{formatCredits\(creditsAmount\(value\)\)\} credits`/);
  assert.match(platformUi, /<span>1 USD = \$\{escapeHtml\(formatCredits\(creditsPerUsd\)\)\} credits<\/span>/);
  assert.match(platformUi, /const publicCredits = \(value\) => `\$\{formatCredits\(creditsAmount\(value\)\)\} 积分`/);
  assert.match(platformUi, /<span>1 USD = \$\{escapeHtml\(formatCredits\(creditsPerUsd\)\)\} 积分<\/span>/);
});
