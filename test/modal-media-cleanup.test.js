"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function source(file) {
  return fs.readFileSync(path.join(__dirname, "..", file), "utf8");
}

test("admin shared dialog stops embedded media when closed or replaced", () => {
  const admin = source("admin.js");
  assert.match(admin, /function stopDialogMedia\(root\)[\s\S]*?media\.pause\(\)[\s\S]*?media\.removeAttribute\("src"\)[\s\S]*?media\.load\(\)/);
  assert.match(admin, /els\.dialog\?\.addEventListener\("close", \(\) => stopDialogMedia\(els\.dialogBody\)\)/);
  assert.match(admin, /stopDialogMedia\(els\.dialogBody\);\s*els\.dialogBody\.innerHTML = ""/);
});

test("platform history and inline dialogs stop embedded media", () => {
  const ui = source("platform.ui.js");
  const explore = source("platform.explore.js");
  const main = source("platform.main.js");
  assert.match(ui, /function stopModalMedia\(root\)[\s\S]*?media\.pause\(\)[\s\S]*?media\.removeAttribute\("src"\)[\s\S]*?media\.load\(\)/);
  assert.match(ui, /const cleanup = \(\) => \{\s*stopModalMedia\(els\.inlineDialogBody\)/);
  assert.match(explore, /stopModalMedia\(els\.historyDetailBody\);\s*els\.historyDetailBody\.innerHTML/);
  assert.match(main, /els\.historyDetailDialog\?\.addEventListener\("close", \(\) => \{\s*stopModalMedia\(els\.historyDetailBody\)/);
});

test("legacy result and action dialogs release video sources", () => {
  const app = source("app.js");
  const game = source("game.js");
  assert.match(app, /els\.videoDialog\?\.addEventListener\("close"[\s\S]*?els\.resultVideo\.pause\(\)[\s\S]*?els\.resultVideo\.removeAttribute\("src"\)[\s\S]*?els\.resultVideo\.load\(\)/);
  assert.match(game, /function stopActionDialogMedia\(\)[\s\S]*?media\.pause\(\)[\s\S]*?media\.removeAttribute\("src"\)/);
  assert.match(game, /const onClose = \(\) => \{\s*stopActionDialogMedia\(\)/);
});
