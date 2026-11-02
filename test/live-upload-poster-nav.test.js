"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const live = fs.readFileSync(path.join(root, "live.js"), "utf8");
const css = fs.readFileSync(path.join(root, "live.css"), "utf8");
const java = fs.readFileSync(path.join(root, "mobile/live-android/src/com/vipeak/live/MainActivity.java"), "utf8");

test("creator image uploads are compressed and expose clear progress and 413 feedback", () => {
  assert.match(live, /function creatorImageKind\(file\)/);
  assert.match(live, /if \(\/\\\.png\$\/\.test\(name\)\) return "image\/png"/);
  assert.match(live, /const maxSide = 1600/);
  assert.match(live, /canvas\.toDataURL\("image\/jpeg", 0\.86\)/);
  assert.match(live, /正在压缩图片…/);
  assert.match(live, /正在上传图片…/);
  assert.match(live, /state\.createUploading = true/);
  assert.match(live, /aria-busy="\$\{state\.createUploading \? "true" : "false"\}"/);
  assert.match(live, /图片过大，服务器未接收。请换一张较小的图片后重试。/);
  assert.match(css, /\.create-avatar-upload\.uploading/);
  assert.match(css, /@keyframes create-upload-spin/);
});

test("Android poster saving uses a native media-store bridge", () => {
  assert.match(live, /if \(native && typeof native\.savePoster === "function"\)/);
  assert.match(live, /native\.savePoster\(dataUrl, filename\)/);
  assert.match(java, /webView\.addJavascriptInterface\(new PosterBridge\(\), "VipeakNative"\)/);
  assert.match(java, /@JavascriptInterface\s+public String savePoster\(String dataUrl, String requestedName\)/);
  assert.match(java, /import android\.util\.Base64;/);
  assert.doesNotMatch(java, /import java\.util\.Base64;/);
  assert.match(java, /MediaStore\.Images\.Media\.EXTERNAL_CONTENT_URI/);
  assert.match(java, /MediaScannerConnection\.scanFile/);
});

test("bottom navigation is limited to the four primary tabs", () => {
  assert.equal((live.match(/\$\{nav\(/g) || []).length, 5);
  assert.match(live, /<main class="live-page"><section class="section-head">[\s\S]*?<\/main>\$\{nav\("home"\)\}/);
  assert.match(live, /<main class="live-page messages-page">[\s\S]*?<\/main>\$\{nav\("messages"\)\}/);
  assert.match(live, /<main class="live-page profile-page">[\s\S]*?<\/main>\$\{nav\("profile"\)\}/);
  assert.equal((live.match(/\$\{nav\("create"\)\}/g) || []).length, 2);
  const subpage = live.match(/function subpage\([\s\S]*?\n  \}/)[0];
  const rooms = live.match(/function showRooms\([\s\S]*?\n  \}/)[0];
  assert.doesNotMatch(subpage, /\$\{nav\(/);
  assert.doesNotMatch(rooms, /\$\{nav\(/);
  assert.match(css, /\.vip-page\{background:#121116;padding-bottom:24px\}/);
});
