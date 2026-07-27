"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const server = read("server.js");
const html = read("platform.html");
const config = read("platform.config.js");
const create = read("platform.create.js");
const explore = read("platform.explore.js");
const main = read("platform.main.js");
const ui = read("platform.ui.js");
const css = read("platform.css");

test("login and registration share one form and one endpoint", () => {
  assert.match(html, /<form method="dialog" id="loginForm">/);
  assert.doesNotMatch(html, /toggleLoginMode/);
  assert.doesNotMatch(config, /loginMode|toggleLoginMode/);
  assert.match(create, /requestJson\("\/api\/auth\/login-or-register"/);
  assert.match(main, /els\.loginForm\?\.addEventListener\("submit"/);
  assert.match(server, /if \(!user && registerIfMissing\) \{\s*return registerWithBody\(req, res, body\);/);
  assert.match(server, /url\.pathname === "\/api\/auth\/login-or-register"/);
});

test("mobile drawer shows one authentication entry while logged out", () => {
  assert.match(html, /class="mobile-drawer-user" id="mobileDrawerUser" hidden/);
  assert.match(config, /mobileDrawerUser: document\.querySelector\("#mobileDrawerUser"\)/);
  assert.match(ui, /els\.mobileDrawerUser\.hidden = !loggedIn/);
  assert.match(ui, /els\.mobileDrawerLoginBtn\.hidden = loggedIn/);
});

test("mobile Video cards keep a stable poster while previews load", () => {
  assert.match(explore, /PLAYFLUX_MOBILE_INITIAL_COUNT = 6/);
  assert.match(explore, /class="playflux-template-poster"/);
  assert.match(explore, /class="playflux-template-video"/);
  assert.match(explore, /classList\.add\("is-video-ready"\)/);
  assert.match(css, /\.playflux-template-video \{[\s\S]*?opacity: 0;/);
  assert.match(css, /\.playflux-template-media\.is-video-ready \.playflux-template-video \{[\s\S]*?opacity: 1;/);
});

test("mobile history scrolls through pages and uses one action menu", () => {
  assert.match(create, /function setupHistoryInfiniteScroll\(\)/);
  assert.match(create, /new IntersectionObserver/);
  assert.match(create, /append: true/);
  assert.match(create, /els\.historyPager\.hidden = mobileLayout/);
  assert.match(create, /<details class="history-actions-menu">/);
  assert.match(css, /\.history-card-actions \{ display: none; \}/);
  assert.match(css, /\.history-actions-menu \{ display: block; \}/);
});

test("mobile history opens one preview stream", () => {
  assert.match(create, /const allowInlinePreview = !mobileLayout && window\.matchMedia\("\(hover: hover\) and \(pointer: fine\)"\)\.matches/);
  assert.match(create, /if \(allowInlinePreview\) \{[\s\S]*?addEventListener\("focus", showVideo/);
  assert.match(html, /id="previewVideo" controls playsinline preload="auto"/);
  assert.match(explore, /document\.querySelectorAll\("\.history-media video"\)\.forEach\(\(video\) => video\.pause\(\)\)/);
});

test("history play icon stays centered after Lucide replaces its placeholder", () => {
  assert.match(css, /\.history-poster > svg \{[\s\S]*?top: 50%;[\s\S]*?left: 50%;[\s\S]*?transform: translate\(-50%, -50%\);/);
});

test("opening a dialog always closes the mobile drawer", () => {
  assert.match(ui, /function prepareModalOpen\(\) \{\s*closeMobileDrawer\(\);\s*closeAccountMenu\(\);/);
  assert.match(ui, /function showInlineDialog[\s\S]*?prepareModalOpen\(\);/);
  assert.match(create, /function openLogin\(\)[\s\S]*?prepareModalOpen\(\);/);
  assert.match(main, /function openTopupDialog\(\)[\s\S]*?prepareModalOpen\(\);/);
  assert.match(explore, /function playPreview[\s\S]*?prepareModalOpen\(\);/);
  assert.match(html, /platform\.js\?v=ai-322-history-play/);
  assert.match(html, /platform\.css\?v=ai-322-history-play/);
});
