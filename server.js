"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { readServerSource, partFiles } = require("./server-source");

const source = readServerSource();
const filename = path.join(__dirname, "server.js");
const compiled = vm.compileFunction(source, [
  "exports",
  "require",
  "module",
  "__filename",
  "__dirname",
], {
  filename,
  importModuleDynamically: vm.constants?.USE_MAIN_CONTEXT_DEFAULT_LOADER,
});

compiled(module.exports, require, module, filename, __dirname);

module.exports.__sourceParts = Object.freeze([...partFiles]);
