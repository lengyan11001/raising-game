"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (name) => fs.__sourceCompatReadFileSync
  ? fs.__sourceCompatReadFileSync(path.join(root, name), "utf8")
  : fs.readFileSync(path.join(root, name), "utf8");

function identifiers(source = "") {
  return new Set(String(source).match(/\b[A-Za-z_$][\w$]*\b/g) || []);
}

test("server source imports every db export used by the split parts", () => {
  const dbSource = read("db.js");
  const exportStart = dbSource.indexOf("module.exports = {");
  assert.ok(exportStart >= 0, "db.js should export a CommonJS object");
  const exportsBlock = dbSource.slice(exportStart, dbSource.indexOf("\n};", exportStart));
  const exported = new Set();
  for (const line of exportsBlock.split("\n")) {
    const match = line.match(/^\s*([A-Za-z_$][\w$]*)\s*(?:,|:)/);
    if (match) exported.add(match[1]);
  }

  const partFiles = fs.readdirSync(path.join(root, "server.parts"))
    .filter((fileName) => /^part-\d+\.js$/.test(fileName))
    .sort();
  const partsSource = partFiles.map((fileName) => read(path.join("server.parts", fileName))).join("\n");
  const importedBlock = partsSource.slice(partsSource.indexOf("const {"), partsSource.indexOf('} = require("./db")'));
  const imported = identifiers(importedBlock);

  const usedAndExported = [...identifiers(partsSource)].filter((name) => exported.has(name));
  const missing = usedAndExported.filter((name) => !imported.has(name)).sort();
  assert.deepEqual(missing, [], `server.parts references db.js exports that are not imported: ${missing.join(", ")}`);
});
