const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("side navigation keeps its full-size buttons and moves overflow into More", () => {
  const html = read("platform.html");
  const css = read("platform.css");
  const explore = read("platform.explore.js");
  const main = read("platform.main.js");

  assert.match(html, /id="sideNavMoreBtn"/);
  assert.match(html, /id="sideNavMoreMenu"/);
  assert.match(css, /\.top-tab \{[\s\S]*?min-height:\s*44px;/);
  assert.match(css, /\.top-tab svg \{\s*width:\s*15px;\s*height:\s*15px;/);
  assert.match(css, /\.top-tab-more \{ display: none; \}/);
  assert.match(css, /\.top-tabs\.is-nav-overflowing \.top-tab-more \{ display: flex; \}/);
  assert.match(explore, /function syncSideNavigationMore\(\)/);
  assert.match(explore, /tabs\.classList\.add\("is-nav-overflowing"\)/);
  assert.match(explore, /menu\.appendChild\(clone\)/);
  assert.match(main, /event\.target\.closest\("#sideNavMoreMenu"\)/);
  assert.doesNotMatch(css, /\.top-tab \{ padding: 4px 9px; \}/);
});

test("same-style is a top-level entry with Case-first in-page tabs", () => {
  const html = read("platform.html");
  const css = read("platform.css");
  const main = read("platform.main.js");
  const explore = read("platform.explore.js");

  assert.doesNotMatch(html, /data-nav-group="same-style"/);
  assert.doesNotMatch(html, /data-nav-group-toggle/);
  assert.match(html, /<button class="top-tab" data-tab="cases" data-same-style-entry/);
  assert.match(html, /class="i18n-en">Same style<\/span>/);
  assert.match(html, /class="i18n-zh">同款<\/span>/);
  assert.match(html, /<section class="same-style-panel" id="sameStylePanel" hidden>/);
  assert.match(html, /class="gallery-mode-tabs gallery-top-tabs" id="galleryModeTabs"/);
  assert.match(html, /document\.documentElement\.classList\.add\(`i18n-\$\{lang\}`\)/);
  assert.match(main, /data-gallery-top-tab/);
  assert.match(main, /if \(mode === "cases"\) setTab\("cases"\);\s*else setGalleryMode\(mode\);/);
  assert.match(explore, /function galleryTopTabItems\(\)/);
  const caseIndex = explore.indexOf('id: "cases"');
  const videoIndex = explore.indexOf('id: "playflux-video"');
  const animeIndex = explore.indexOf('id: "playflux-anime"');
  const imageIndex = explore.indexOf('id: "playflux-image"');
  assert.ok(caseIndex > -1 && caseIndex < videoIndex && videoIndex < animeIndex && animeIndex < imageIndex);
  assert.match(explore, /active: state\.tab === "cases"/);
  assert.match(explore, /els\.sameStylePanel\.hidden = nextTab !== "cases"/);
  assert.match(css, /\.gallery-top-tabs \{/);
  assert.match(css, /\.gallery-top-tabs \.gallery-mode-tab\.is-active \{/);
  assert.doesNotMatch(explore, /syncGalleryModeTabs/);
  assert.match(explore, /function syncGalleryShortcutNav\(\)[\s\S]*?renderGalleryModeTabs\(\);/);
});

test("recharge promotion entries stay out of the shared same-style layout", () => {
  const html = read("platform.html");

  assert.doesNotMatch(html, /id="doubleTopupBanner"/);
  assert.doesNotMatch(html, /class="double-topup-banner double-topup-banner-home"/);
  assert.match(html, /<section class="same-style-panel" id="sameStylePanel" hidden>/);
});
