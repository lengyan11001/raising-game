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
  assert.match(main, /#sideNavMoreMenu \[data-tab\]/);
  assert.doesNotMatch(css, /\.top-tab \{ padding: 4px 9px; \}/);
});
