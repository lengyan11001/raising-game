"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { Linter } = require("eslint");

const root = path.resolve(__dirname, "..");
const sourceArg = process.argv.indexOf("--source");
if (sourceArg >= 0 && !process.argv[sourceArg + 1]) {
  console.error("Missing value for --source.");
  process.exit(2);
}
const sourceRef = sourceArg >= 0 ? process.argv[sourceArg + 1] : null;

let partFiles;
let sourceParts;
if (sourceRef) {
  const paths = execFileSync("git", ["ls-tree", "-r", "--name-only", sourceRef, "--", "server.parts"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  })
    .split("\n")
    .filter((fileName) => /^server\.parts\/part-\d+\.js$/.test(fileName))
    .sort();
  partFiles = paths.map((fileName) => path.basename(fileName));
  sourceParts = paths.map((fileName) => execFileSync("git", ["show", `${sourceRef}:${fileName}`], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  }));
} else {
  partFiles = fs.readdirSync(path.join(root, "server.parts"))
    .filter((fileName) => /^part-\d+\.js$/.test(fileName))
    .sort();
  sourceParts = partFiles.map((fileName) => fs.readFileSync(path.join(root, "server.parts", fileName), "utf8"));
}
const normalizedSourceParts = sourceParts.map((part) => (part.endsWith("\n") ? part : `${part}\n`));
const source = normalizedSourceParts.join("");
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
for (let index = 0; index < partFiles.length; index += 1) {
  const fileName = partFiles[index];
  const lineCount = normalizedSourceParts[index].split("\n").length - 1;
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
