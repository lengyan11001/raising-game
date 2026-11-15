"use strict";

const path = require("node:path");
const { Linter } = require("eslint");
const { partFiles, readServerSource } = require("../server-source");

const root = path.resolve(__dirname, "..");
const source = readServerSource();
const globals = new Set([
  "require",
  "module",
  "exports",
  "__dirname",
  "__filename",
  ...Object.getOwnPropertyNames(globalThis),
]);

const messages = new Linter().verify(source, {
  languageOptions: {
    ecmaVersion: "latest",
    sourceType: "script",
    globals: Object.fromEntries([...globals].map((name) => [name, "readonly"])),
  },
  rules: {
    "no-undef": "error",
  },
}, { filename: "server-source.js" });

if (messages.length === 0) process.exit(0);

const ranges = [];
let firstLine = 1;
for (const fileName of partFiles) {
  const lineCount = require("node:fs")
    .readFileSync(path.join(root, "server.parts", fileName), "utf8")
    .split("\n").length;
  ranges.push({ fileName, firstLine, lastLine: firstLine + lineCount - 1 });
  firstLine += lineCount;
}

for (const message of messages) {
  const range = ranges.find(({ firstLine: start, lastLine }) => message.line >= start && message.line <= lastLine);
  const location = range
    ? `server.parts/${range.fileName}:${message.line - range.firstLine + 1}:${message.column}`
    : `server-source.js:${message.line}:${message.column}`;
  console.error(`${location} ${message.message}`);
}
console.error(`Found ${messages.length} undefined server reference${messages.length === 1 ? "" : "s"}.`);
process.exitCode = 1;
