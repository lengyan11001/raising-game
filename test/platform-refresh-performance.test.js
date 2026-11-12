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

test("cached refresh paints before anonymous or authenticated config", () => {
  const create = read("platform.create.parts/part-06.js");
  const requestJson = read("platform.ui.parts/part-04.js");
  assert.match(create, /const publicConfigPromise = hadStoredSession \? null : requestJson\("\/api\/config\/public", \{ auth: false \}\);/);
  assert.match(create, /if \(cachedConfig\) \{[\s\S]*?eventSafeBackgroundTask\(sessionPromise\.then/);
  assert.match(create, /const payload = await sessionPromise;/, "only a cold cache may await config");
  assert.match(requestJson, /const requestToken = options\.auth === false \? "" : String\(state\.token \|\| ""\);/);
  assert.match(requestJson, /if \(requestToken\) headers\.authorization = `Bearer \$\{requestToken\}`;/);
  assert.doesNotMatch(create, /cacheBootstrapConfigSnapshot\(authenticated\.config\)/);
});

test("first paint does not await advanced presets or billing", () => {
  const create = read("platform.create.parts/part-06.js");
  const renderShell = create.match(/function renderBootstrapShell\(config\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.ok(renderShell, "renderBootstrapShell should exist");
  assert.match(renderShell, /scheduleAdvancedPresetsLoad\(\)/);
  assert.doesNotMatch(renderShell, /await loadAdvancedPresets\(\)/);
  assert.match(create, /if \(!isTenantTool\("undress"\)\) loadPlatformEstimates\(\);/);
  assert.match(create, /sessionPromise\.then\(\(\) => \{/);
  assert.match(create, /if \(!state\.token\) return publicConfigPromise \|\| requestJson\("\/api\/config\/public", \{ auth: false \}\);/);
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
  assert.match(source, /crypto\.createHash\("sha256"\)\.update\(content\)/);
  assert.match(source, /entries\.join\("\\0"\)/);
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

test("first paint defers heavy optional modules and icons", () => {
  const html = read("platform.html");
  const loader = read("platform.js");
  assert.doesNotMatch(html, /vendor\/lucide-1\.27\.0\.min\.js/);
  assert.match(html, /rel="preconnect" href="https:\/\/media\.123vips\.com"/);
  assert.match(loader, /const criticalChunkFiles = \[/);
  assert.match(loader, /const deferredChunkFiles = \[[\s\S]*?platform\.workflow-canvases\.js[\s\S]*?platform\.video-tools\.js[\s\S]*?platform\.undress-tool\.js[\s\S]*?chat-live\.js/);
  assert.doesNotMatch(loader, /requestIdleCallback\(\(\) => loadDeferredChunks\(\)/);
  assert.match(loader, /requestIdleCallback\(loadIcons/);
  assert.match(loader, /window\.PlatformDeferredModules = \{ load: loadDeferredChunks \}/);
  assert.match(loader, /deferredLoadPromise = appendChunks\(deferredChunkFiles\)/);
  assert.match(loader, /platform-deferred-ready/);
});

test("deferred interactions hydrate instead of throwing on first click", () => {
  const loader = read("platform.js");
  const explore = read("platform.explore.js");
  const chat = read("platform.chat.js");
  const main = read("platform.main.js");
  assert.match(loader, /script\.onload = \(\) => resolve\(script\.src\)/);
  assert.match(explore, /const deferred = window\.PlatformDeferredModules\?\.load\?\.\(\)/);
  assert.match(explore, /deferred\.then\(loadCanvases\)/);
  assert.match(chat, /platform-deferred-ready/);
  assert.match(chat, /hydrateChatLiveEntry/);
  assert.match(explore, /nextTab === "chat"[\s\S]*?PlatformDeferredModules\?\.load\?\.\(\)/);
  assert.match(main, /deferredVideoTool/);
  assert.match(main, /openVideoToolDialog\(action\)/);
});

test("service worker never intercepts API or non-GET requests", () => {
  const sw = read("platform-sw.js");
  assert.match(sw, /request\.method !== "GET"/);
  assert.match(sw, /url\.pathname\.startsWith\("\/api\/"\)/);
  assert.match(sw, /request\.mode === "navigate"/);
  assert.match(sw, /refresh/);
  assert.doesNotMatch(sw, /type !== "precache"/);
  assert.doesNotMatch(sw, /shellUrls/);
  assert.match(sw, /caches\.delete\(key\)/);
});

test("service worker prefers a fresh navigation and uses cache only as fallback", () => {
  const sw = read("platform-sw.js");
  const navigate = sw.match(/if \(request\.mode === "navigate"\) \{([\s\S]*?)\n    \}/)?.[1] || "";
  assert.match(navigate, /fetchAndCache\(cache, request, key\)/);
  assert.match(navigate, /networkWithin\(networkPromise, 1500\)/);
  assert.match(navigate, /if \(fresh\) return fresh;/);
  assert.match(navigate, /const cached = await cache\.match\(key, \{ ignoreSearch: true \}\);/);
  assert.match(navigate, /if \(cached\) \{[\s\S]*?event\.waitUntil\(networkPromise\);[\s\S]*?return cached;/);
  const asset = sw.match(/if \(isPlatformAsset\(url\.pathname\)\) \{([\s\S]*?)\n      \}/)?.[1] || "";
  assert.match(asset, /const cached = await cache\.match\(request\);/);
  assert.match(asset, /if \(cached\) \{[\s\S]*?event\.waitUntil\(refresh\(cache, request\)\);[\s\S]*?return cached;/);
});

test("service worker script remains registrable", () => {
  const staticServer = read("server.parts/part-42.js");
  const loader = read("platform.js");
  assert.match(staticServer, /const isServiceWorker = pathname === "\/platform-sw\.js"/);
  assert.match(staticServer, /const isNoStoreResponse = \(isFrontendNoStore \|\| isHtml\) && !isServiceWorker/);
  assert.match(staticServer, /isServiceWorker[\s\S]*?"no-cache, must-revalidate, max-age=0"/);
  assert.match(staticServer, /isNoStoreResponse \|\| isServiceWorker[\s\S]*?"cdn-cache-control": "no-store"/);
  assert.doesNotMatch(staticServer, /isFrontendNoStore \|\| isHtml\s*\? "no-store/);
  assert.match(loader, /updateViaCache: "none"/);
  assert.doesNotMatch(loader, /postMessage\(\{ type: "precache"/);
});
