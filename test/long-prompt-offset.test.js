"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "vendor/vipeak-prompt-editor.src.js"), "utf8");

test("prompt text and selection offsets share one paragraph model", () => {
  assert.match(source, /plainTextOffsetForPosition\(position = 0\)/);
  assert.match(source, /positionForPlainTextOffset\(offset = 0\)/);
  assert.match(source, /getText\(\{ blockSeparator: "\\n" \}\)/);
  assert.match(source, /textBetween\(0, pos, "\\n", "\\n"\)\.length/);
});

test("multi-line insertion keeps one paragraph per logical line", () => {
  assert.match(source, /function inlineContentFromText[\s\S]*?\.map\(\(line\) => \(\{[\s\S]*?type: "paragraph"/);
  assert.match(source, /handleTextInput:[\s\S]*?this\.insertTextAt\(from, to, text\)/);
});
