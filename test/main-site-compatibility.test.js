"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("main site derives responsive heights from the live visual viewport", () => {
  const main = read("platform.main.js");
  const html = read("platform.html");
  const css = read("platform.css");

  assert.match(main, /function syncPlatformViewportMetrics\(\)/);
  assert.match(main, /window\.visualViewport/);
  assert.match(main, /--app-height/);
  assert.match(main, /--app-keyboard-inset/);
  assert.match(main, /window\.addEventListener\("orientationchange", schedulePlatformViewportSync/);
  assert.match(main, /visualViewport\?\.addEventListener\("resize", schedulePlatformViewportSync/);
  assert.match(css, /--app-height: 100dvh/);
  assert.match(css, /@supports not \(height: 100dvh\)/);
  assert.match(css, /\.workflow-panel \{[\s\S]*?height: calc\(var\(--app-height, 100vh\) - 70px\)/);
  assert.match(css, /\.modal \{[\s\S]*?max-height: calc\(var\(--app-height, 100vh\) - 16px\)/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*?padding-bottom: calc\(26px \+ var\(--safe-bottom\)\)/);
  assert.match(css, /\.chat-onboarding-panel \{[^\n]*height: min\(730px, calc\(var\(--app-height, 100vh\) - 48px\)\) !important/);
  assert.match(css, /\.chat-onboarding-panel \{[^\n]*height: calc\(var\(--app-height, 100vh\) - 20px\) !important/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*?\.workflow-panel \{\s*min-height: 0;/);
  assert.match(css, /\.seo-discovery \{\s*width: min\(1440px, 100%\);/);
  assert.match(css, /\.site-foot \{\s*display: none;\s*width: min\(1440px, 100%\);/);
  assert.match(html, /platform\.css\?v=[^"\s]+/);
  assert.match(html, /platform\.js\?v=[^"\s]+/);
});

test("main site keeps touch controls free of double-tap zoom delays", () => {
  const css = read("platform.css");
  assert.match(css, /:where\(button, \[role="button"\], a\[href\], input, select, textarea, summary\) \{[\s\S]*?touch-action: manipulation/);
  assert.match(css, /body\.app-keyboard-open \{[\s\S]*?overscroll-behavior-y: contain/);
});

test("small workflow toolbars keep touch actions usable without wrapping", () => {
  const css = read("workflow-react/src/components/workflow/WorkflowEditor.css");
  assert.match(css, /\.CanvasEditor-back-button \{[\s\S]*?white-space: nowrap;/);
  assert.match(css, /\.CanvasEditor-save-button,[\s\S]*?\.CanvasEditor-new-button \{[\s\S]*?white-space: nowrap;/);
  assert.match(css, /@media \(max-width: 420px\)[\s\S]*?\.CanvasEditor-back-button,[\s\S]*?\.CanvasEditor-save-button,[\s\S]*?\.CanvasEditor-new-button \{[\s\S]*?min-height: 44px;/);
  assert.match(css, /@media \(max-width: 420px\)[\s\S]*?\.CanvasEditor-title \{[\s\S]*?max-width: 100%;/);
});

test("compatibility fixture defines the representative acceptance matrix", () => {
  const doc = read("docs/main-site-compatibility.md");
  for (const label of [
    "iPhone SE",
    "iPhone 15",
    "Pixel",
    "Galaxy",
    "iPad",
    "Desktop Chrome",
    "Desktop Safari",
    "Desktop Firefox",
    "WeChat",
  ]) {
    assert.match(doc, new RegExp(label));
  }
  for (const flow of ["登录", "图片生成", "视频生成", "上传", "结果", "充值", "工作流"]) {
    assert.match(doc, new RegExp(flow));
  }
  for (const evidence of ["123vips.com", "123vip.fans", "浏览器自动化", "保存请求", "真机"]) {
    assert.match(doc, new RegExp(evidence));
  }
});
