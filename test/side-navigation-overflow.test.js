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

test("same-style navigation groups Cases, Video, Anime, and Image behind a collapsed parent", () => {
  const html = read("platform.html");
  const css = read("platform.css");
  const main = read("platform.main.js");
  const explore = read("platform.explore.js");

  const group = html.match(/<div class="top-nav-group"[^>]*data-nav-group="same-style">([\s\S]*?)<\/div>\s*<button class="top-tab" data-tab="advanced"/)?.[1] || "";
  assert.ok(group, "same-style group should wrap the four child entries");
  assert.match(group, /data-nav-group-toggle[^>]*aria-expanded="false"/);
  assert.match(group, /class="top-nav-group-children" hidden/);
  const caseIndex = group.indexOf('data-tab="cases"');
  const videoIndex = group.indexOf('data-gallery-shortcut="playflux-video"');
  const animeIndex = group.indexOf('data-gallery-shortcut="playflux-anime"');
  const imageIndex = group.indexOf('data-gallery-shortcut="playflux-image"');
  assert.ok(caseIndex > -1 && caseIndex < videoIndex && videoIndex < animeIndex && animeIndex < imageIndex);
  assert.doesNotMatch(html, /<button class="top-tab" data-tab="cases"/);
  assert.match(main, /data-nav-group-toggle/);
  assert.match(main, /children\.hidden = expanded/);
  assert.match(explore, /has-active-child/);
  assert.match(css, /\.top-nav-group-children\[hidden\] \{\s*display: none;/);
});
