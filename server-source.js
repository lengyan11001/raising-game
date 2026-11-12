"use strict";

const fs = require("node:fs");
const path = require("node:path");

const partsDirectory = path.join(__dirname, "server.parts");
const partFiles = fs.readdirSync(partsDirectory)
  .filter((fileName) => /^part-\d+\.js$/.test(fileName))
  .sort();

const sourceParts = partFiles.map((fileName) => fs.readFileSync(path.join(partsDirectory, fileName), "utf8"));
const source = sourceParts.join("");

function readServerSource() {
  return source;
}

module.exports = {
  partFiles,
  readServerSource,
  source,
};
