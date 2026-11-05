"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const rawReadFileSync = fs.__sourceCompatReadFileSync || fs.readFileSync;
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const readRaw = (file) => rawReadFileSync.call(fs, path.join(root, file), "utf8");

test("primary loaders never block the HTML parser", () => {
  for (const file of ["platform.js", "platform.ui.js", "platform.create.js"]) {
    const source = readRaw(file);
    assert.doesNotMatch(source, /document\.write\s*\(/, `${file} must not use document.write`);
    assert.match(source, /script\.async = false/, `${file} must preserve ordered chunk execution`);
    assert.match(source, /document\.head\.appendChild\(script\)/, `${file} must append chunks instead of writing them`);
    if (file === "platform.js") {
      assert.doesNotMatch(source.replace(/\/\/.*$/gm, ""), /DOMContentLoaded[\s\S]{0,120}loadChunks/, `${file} must start chunk downloads immediately`);
    }
  }
});

test("public config is fetched anonymously before parallel session restore", () => {
  const create = read("platform.create.parts/part-06.js");
  const requestJson = read("platform.ui.parts/part-04.js");
  assert.match(create, /const publicConfigPromise = requestJson\("\/api\/config\/public", \{ auth: false \}\);/);
  assert.match(create, /const sessionPromise = \(async \(\) => \{[\s\S]*?loadTelegramMiniAppAuth\(\)[\s\S]*?loadMe\(\);/);
  assert.ok(
    create.indexOf('const publicConfigPromise = requestJson("/api/config/public", { auth: false });')
      < create.indexOf("const sessionPromise ="),
    "anonymous public config should start before session restoration",
  );
  assert.match(requestJson, /if \(state\.token && options\.auth !== false\) headers\.authorization = `Bearer \$\{state\.token\}`;/);
  assert.doesNotMatch(create, /cacheBootstrapConfigSnapshot\(authenticated\.config\)/);
});

test("first paint does not await advanced presets or billing", () => {
  const create = read("platform.create.parts/part-06.js");
  const renderShell = create.match(/function renderBootstrapShell\(config\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.ok(renderShell, "renderBootstrapShell should exist");
  assert.match(renderShell, /scheduleAdvancedPresetsLoad\(\)/);
  assert.doesNotMatch(renderShell, /await loadAdvancedPresets\(\)/);
  assert.match(create, /if \(!isTenantTool\("undress"\)\) loadPlatformEstimates\(\);/);
  assert.match(create, /sessionPromise\.then\(async \(\) => \{/);
  assert.match(create, /if \(state\.token\) \{[\s\S]*?requestJson\("\/api\/config\/public"\)/);
});

test("HTML and public config are CDN-cacheable for repeat refreshes", () => {
  const html = read("server.parts/part-04.js");
  const config = read("server.parts/part-42.js");
  const http = read("lib-http.js");
  assert.match(html, /cacheControl: "public, max-age=0, s-maxage=15, stale-while-revalidate=60"/);
  assert.match(config, /public, max-age=30, s-maxage=30, stale-while-revalidate=120/);
  assert.match(http, /headers\["cdn-cache-control"\] = cacheControl;/);
  assert.match(http, /headers\["cloudflare-cdn-cache-control"\] = cacheControl;/);
});

test("HTML snapshots coalesce requests and include tenant/version cache keys", () => {
  const source = read("server.parts/part-04.js");
  assert.match(source, /const platformHtmlSnapshotCache = new Map\(\);/);
  assert.match(source, /const PLATFORM_HTML_CACHE_TTL_MS = 20_000;/);
  assert.match(source, /pageOriginFromRequest\(req\)/);
  assert.match(source, /requestHostname\(req\)/);
  assert.match(source, /tenant\.tenant\?\.tenantId/);
  assert.match(source, /tenant\.tenant\?\.toolId/);
  assert.match(source, /tenant\.tenant\?\.siteProfile/);
  assert.match(source, /version/);
  assert.match(source, /const cached = platformHtmlSnapshotCache\.get\(key\);/);
});

test("GEO analytics never sits on the request critical path", () => {
  const source = read("server.parts/part-42.js");
  assert.match(source, /recordGeoVisitStats\(req, url\)\.catch\(\(error\) => \{/);
  assert.doesNotMatch(source, /await recordGeoVisitStats\(req, url\)/);
});
