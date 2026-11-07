"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const sourceByPath = new Map();

function readParts(directoryName) {
  const directory = path.join(root, directoryName);
  return fs.readdirSync(directory)
    .filter((fileName) => /^part-\d+\.js$/.test(fileName))
    .sort()
    .map((fileName) => fs.readFileSync(path.join(directory, fileName), "utf8"))
    .join("");
}

sourceByPath.set(path.join(root, "server.js"), require("../server-source").readServerSource());
sourceByPath.set(path.join(root, "platform.ui.js"), readParts("platform.ui.parts"));
sourceByPath.set(path.join(root, "platform.create.js"), readParts("platform.create.parts"));

function sourceFor(target) {
  if (typeof target !== "string") return null;
  return sourceByPath.get(path.resolve(target)) || null;
}

function encodingFrom(options) {
  if (typeof options === "string") return options;
  return options?.encoding || null;
}

function asReadResult(source, options) {
  return encodingFrom(options) ? source : Buffer.from(source);
}

const originalReadFileSync = fs.readFileSync;
fs.__sourceCompatReadFileSync = originalReadFileSync;
fs.readFileSync = function readFileSync(target, options) {
  const source = sourceFor(target);
  if (source === null) return originalReadFileSync.apply(this, arguments);
  return asReadResult(source, options);
};

for (const fsModule of [fs, fs.promises, require("node:fs/promises")]) {
  const originalReadFile = fsModule.readFile;
  fsModule.readFile = async function readFile(target, options) {
    const source = sourceFor(target);
    if (source === null) return originalReadFile.apply(this, arguments);
    return asReadResult(source, options);
  };
}
