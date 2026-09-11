"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const server = fs.readFileSync(path.resolve(__dirname, "..", "server.js"), "utf8");

function functionSource(name) {
  const start = server.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} should exist in server.js`);
  // Skip the parameter list first: default values such as `tenantOptions = {}`
  // contain braces that must not be mistaken for the function body.
  let cursor = start;
  let parens = 0;
  for (; cursor < server.length; cursor += 1) {
    if (server[cursor] === "(") parens += 1;
    else if (server[cursor] === ")") {
      parens -= 1;
      if (parens === 0) {
        cursor += 1;
        break;
      }
    }
  }
  let depth = 0;
  for (let index = cursor; index < server.length; index += 1) {
    if (server[index] === "{") depth += 1;
    else if (server[index] === "}") {
      depth -= 1;
      if (depth === 0) return server.slice(start, index + 1);
    }
  }
  throw new Error(`could not extract ${name} from server.js`);
}

const sandbox = {};
vm.runInNewContext(
  `${functionSource("playfluxTemplateTabForGalleryMode")}
${functionSource("playfluxTemplatesForTenant")}
globalThis.handlers = { playfluxTemplatesForTenant };`,
  sandbox,
);
const { playfluxTemplatesForTenant } = sandbox.handlers;

const templates = [
  { id: "video-1", tab: "video" },
  { id: "image-1", tab: "image" },
  { id: "anime-1", tab: "anime" },
];

test("the video tool tenant receives its video templates", () => {
  const result = playfluxTemplatesForTenant(templates, { toolOnly: true, allowedGalleryModes: ["playflux-video"] });
  assert.deepEqual([...result].map((item) => item.id), ["video-1"]);
});

test("the image tool tenant receives its image templates", () => {
  const result = playfluxTemplatesForTenant(templates, { toolOnly: true, allowedGalleryModes: ["playflux-image"] });
  assert.deepEqual([...result].map((item) => item.id), ["image-1"]);
});

test("the platform tenant still receives every template", () => {
  const result = playfluxTemplatesForTenant(templates, { toolOnly: false, allowedGalleryModes: [] });
  assert.equal([...result].length, 3);
});

test("tool tenants without a playflux gallery still get an empty list", () => {
  const result = playfluxTemplatesForTenant(templates, { toolOnly: true, allowedGalleryModes: ["characters"] });
  assert.deepEqual([...result], []);
});

test("the templates endpoint filters by tenant instead of returning nothing", () => {
  assert.doesNotMatch(server, /if \(tenantOptions\.toolOnly\) return sendJson\(res, 200, \{ ok: true, templates: \[\] \}\);/);
  assert.match(server, /const templates = playfluxTemplatesForTenant\(/);
});

test("the video tool still exposes the playflux video gallery", () => {
  assert.match(server, /defaultGalleryMode: "playflux-video"/);
  assert.match(server, /allowedGalleryModes: \["playflux-video"\]/);
});
