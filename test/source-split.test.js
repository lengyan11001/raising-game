"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const directories = ["server.parts", "platform.ui.parts", "platform.create.parts"];
const wrappers = ["server.js", "platform.ui.js", "platform.create.js", "server-source.js"];

function lineCount(filePath) {
  return fs.__sourceCompatReadFileSync(filePath, "utf8").split("\n").length;
}

test("large runtime sources stay split into ordered, bounded parts", () => {
  for (const wrapper of wrappers) {
    assert.ok(lineCount(path.join(root, wrapper)) < 100, `${wrapper} should remain a small wrapper`);
  }

  for (const directory of directories) {
    const files = fs.readdirSync(path.join(root, directory))
      .filter((fileName) => /^part-\d+\.js$/.test(fileName))
      .sort();
    assert.ok(files.length > 0, `${directory} should contain source parts`);
    files.forEach((fileName, index) => {
      assert.equal(fileName, `part-${String(index + 1).padStart(2, "0")}.js`);
      const content = fs.__sourceCompatReadFileSync(path.join(root, directory, fileName), "utf8");
      assert.ok(content.trim().length > 0, `${directory}/${fileName} should not be empty`);
      assert.ok(content.split("\n").length <= 2500, `${directory}/${fileName} should stay below 2,500 lines`);
    });
  }
});
