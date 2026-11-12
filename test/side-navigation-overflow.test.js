const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("side navigation keeps full-size buttons and no longer renders a More entry", () => {
  const html = read("platform.html");
  const css = read("platform.css");
  const explore = read("platform.explore.js");

  assert.doesNotMatch(html, /id="sideNavMoreBtn"/);
  assert.doesNotMatch(html, /id="sideNavMoreMenu"/);
  assert.match(css, /\.top-tabs \{[\s\S]*?gap:\s*10px;[\s\S]*?overflow-y:\s*auto;/);
  assert.match(css, /\.top-tab \{[\s\S]*?min-height:\s*44px;/);
  assert.match(css, /\.top-tab \{[\s\S]*?min-height:\s*44px;[\s\S]*?color: rgba\(247,247,251,\.82\);/);
  assert.match(css, /@media \(min-width: 1081px\) \{[\s\S]*?\.side-rail \{\s*width: 216px;[\s\S]*?\.top-tabs \{\s*gap: 8px;\s*\}[\s\S]*?\.top-tab \{[\s\S]*?min-height: 38px;/);
  assert.match(css, /\.top-tab svg \{\s*width:\s*15px;\s*height:\s*15px;/);
  assert.doesNotMatch(css, /top-tab-more|side-nav-more-menu|is-nav-overflowing/);
  assert.doesNotMatch(explore, /syncSideNavigationMore|sideNavMoreBtn|sideNavMoreMenu/);
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
  assert.match(html, /data-i18n="nav\.sameStyle">Same style<\/span>/);
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
  assert.match(require("node:fs").readFileSync(path.resolve(__dirname, "..", "lib-tenants.js"), "utf8"), /allowedTabs: parseCsvList\(process\.env\.PLATFORM_SITE_ALLOWED_TABS \|\| "home,/);
  assert.match(css, /\.gallery-top-tabs \{/);
  assert.match(css, /\.gallery-top-tabs \{[\s\S]*?flex-wrap:\s*nowrap;[\s\S]*?gap:\s*4px;[\s\S]*?padding:\s*5px;[\s\S]*?border-radius:\s*999px;/);
  assert.match(css, /\.gallery-top-tabs \.gallery-mode-tab \{[\s\S]*?min-height:\s*38px;[\s\S]*?padding:\s*8px 15px;[\s\S]*?border-radius:\s*999px;[\s\S]*?font-size:\s*\.84rem;/);
  assert.match(css, /\.gallery-top-tabs \.gallery-mode-tab svg \{\s*width:\s*16px;\s*height:\s*16px;\s*\}/);
  assert.match(css, /\.gallery-top-tabs \.gallery-mode-tab\.is-active \{[\s\S]*?border-color:\s*transparent;[\s\S]*?color:\s*#fff;[\s\S]*?background:\s*transparent;[\s\S]*?box-shadow:\s*none;/);
  assert.doesNotMatch(css, /\.gallery-top-tabs \.gallery-mode-tab[^}]*rgba\(255,79,163/);
  assert.doesNotMatch(css, /\.gallery-top-tabs \.gallery-mode-tab\.is-active \{[^}]*background:\s*(?:#fff|white|rgba\(255,\s*255,\s*255,\s*(?:\.\d+|1)\));/);
  assert.match(css, /\.gallery-top-tabs \.gallery-mode-tab\.is-active span \{[\s\S]*?color:\s*inherit;[\s\S]*?background:\s*transparent;/);
  assert.doesNotMatch(explore, /syncGalleryModeTabs/);
  assert.match(explore, /function syncGalleryShortcutNav\(\)[\s\S]*?renderGalleryModeTabs\(\);/);
});

test("recharge promotion entries stay out of the shared same-style layout", () => {
  const html = read("platform.html");

  assert.doesNotMatch(html, /id="doubleTopupBanner"/);
  assert.doesNotMatch(html, /class="double-topup-banner double-topup-banner-home"/);
  assert.match(html, /<section class="same-style-panel" id="sameStylePanel" hidden>/);
});
