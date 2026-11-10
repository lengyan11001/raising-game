"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const live = fs.readFileSync(path.join(root, "live.js"), "utf8");
const css = fs.readFileSync(path.join(root, "live.css"), "utf8");
const html = fs.readFileSync(path.join(root, "live.html"), "utf8");
const java = fs.readFileSync(path.join(root, "mobile/live-android/src/com/vipeak/live/MainActivity.java"), "utf8");
const manifest = fs.readFileSync(path.join(root, "mobile/live-android/AndroidManifest.xml"), "utf8");

test("live navigation remembers and restores the actual page history", () => {
  assert.match(live, /const liveNavigationStack = \[\]/);
  assert.match(live, /function liveNavigationSnapshot\(\)/);
  assert.match(live, /function rememberLiveNavigation\(targetPage\)/);
  assert.match(live, /function restoreLiveNavigation\(snapshot\)/);
  assert.match(live, /function navigateLiveBack\(fallback = "home"\)/);
  assert.match(live, /scrollTop: app\.querySelector\("\.live-page"\)\?\.scrollTop \|\| 0/);
  assert.match(live, /page\.scrollTop = Number\(snapshot\.scrollTop \|\| 0\)/);
  assert.match(live, /if \(liveNavigationStack\.length\) \{\s*navigateLiveBack\("home"\);\s*return true;/);
});

test("live back handles overlays before navigating and preserves root double-back exit", () => {
  assert.match(live, /window\.VipeakLiveBack = \(\) =>/);
  assert.match(live, /document\.querySelector\("\[data-photo-view\]"\)/);
  assert.match(live, /document\.querySelector\("\[data-companion-guide\]"\)/);
  assert.match(live, /document\.querySelector\("\.sheet-backdrop"\)/);
  assert.match(live, /document\.querySelector\("\[data-settings-menu\]:not\(\[hidden\]\)"\)/);
  assert.match(live, /state\.page === "home" && state\.category/);
  assert.match(live, /if \(\["home", "messages", "create", "profile"\]\.includes\(state\.page\)\) return false;/);
});

test("all in-app back controls use the unified back button", () => {
  assert.match(live, /function backButton\(label = ""\)/);
  assert.match(live, /class="back-button" data-action="live-back"/);
  assert.match(live, /if \(a === "live-back"\) \{ navigateLiveBack\("home"\); return; \}/);
  assert.doesNotMatch(live, /back-home|back-profile|back-subpage|pageReturn|back-relationship|back-level|back-messages|back-from-sub|back-rooms/);
  assert.match(css, /\/\* Unified in-app back button across live subpages\. \*\//);
  assert.match(css, /\.edit-header>\.back-button,[\s\S]*?\.chat-head>button\.back-button:first-child \{/);
});

test("Android requires a second root back press before exiting", () => {
  assert.match(java, /webView\.evaluateJavascript\(/);
  assert.match(java, /window\.VipeakLiveBack/);
  assert.match(java, /import android\.os\.SystemClock;/);
  assert.match(java, /EXIT_BACK_INTERVAL_MS = 2000L/);
  assert.match(java, /if \("true"\.equals\(value\)\) \{[\s\S]*?lastBackPressedAt = 0;[\s\S]*?return;/);
  assert.match(java, /Toast\.makeText\(this, "再按一次退出", Toast\.LENGTH_SHORT\)\.show\(\)/);
  assert.match(java, /finish\(\)/);
  assert.match(manifest, /android:enableOnBackInvokedCallback="false"/);
});

test("live assets use a cache-busting build version", () => {
  assert.match(html, /live\.css\?v=2026110301/);
  assert.match(html, /live\.js\?v=2026110301/);
  assert.match(html, /data-live-build="2026110301"/);
});
