const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  PUBLIC_SECURITY_HEADERS,
  applyPublicSecurityHeaders,
  httpsRedirectLocation,
  publicAdminMediaPath,
  publicStaticPath,
} = require("../site-http");

const serverSource = fs.readFileSync(path.resolve(__dirname, "..", "server.js"), "utf8");
const createSource = fs.readFileSync(path.resolve(__dirname, "..", "platform.create.js"), "utf8");

test("admin entry and assets bypass CDN caching while previews roll out", () => {
  assert.match(serverSource, /const frontendNames = \[\"\/admin\.html\", \"\/admin\.css\", \"\/admin\.js\"/);
  assert.match(serverSource, /const isFrontendNoStore = isFrontendAsset && !isVersionedAsset/);
  assert.match(serverSource, /isFrontendNoStore \|\| isHtml[\s\S]*?no-store, no-cache, must-revalidate, max-age=0/);
});

test("public security headers cover browser-facing responses", () => {
  assert.match(PUBLIC_SECURITY_HEADERS["content-security-policy"], /frame-ancestors 'none'/);
  assert.match(PUBLIC_SECURITY_HEADERS["content-security-policy"], /https:\/\/oauth\.telegram\.org/);
  assert.match(PUBLIC_SECURITY_HEADERS["content-security-policy"], /script-src[^;]*https:\/\/www\.googletagmanager\.com/);
  assert.match(PUBLIC_SECURITY_HEADERS["content-security-policy"], /style-src[^;]*https:\/\/accounts\.google\.com/);
  assert.doesNotMatch(PUBLIC_SECURITY_HEADERS["content-security-policy"], /(?:script-src|style-src)[^;]*\shttps:(?:\s|;)/);
  assert.equal(PUBLIC_SECURITY_HEADERS["cross-origin-opener-policy"], "same-origin-allow-popups");
  assert.equal(PUBLIC_SECURITY_HEADERS["x-content-type-options"], "nosniff");
  assert.equal(PUBLIC_SECURITY_HEADERS["x-frame-options"], "DENY");
  assert.equal(PUBLIC_SECURITY_HEADERS["referrer-policy"], "strict-origin-when-cross-origin");
});

test("static serving uses an explicit allowlist instead of a denylist", () => {
  assert.match(serverSource, /if \(!publicStaticPath\(pathname\)\) return sendText\(res, 404, "Not Found"\)/);
  assert.doesNotMatch(serverSource, /PRIVATE_STATIC_ROOT_FILES/);
  assert.doesNotMatch(serverSource, /privateStaticPath/);
});

test("static allowlist keeps public pages, media, downloads, verification, and workflow assets", () => {
  for (const pathname of [
    "/", "/platform.html", "/platform.css", "/platform.js", "/platform.create.parts/part-01.js",
    "/admin.html", "/admin.css", "/admin.js", "/chat.html", "/live.html", "/pay.html",
    "/BingSiteAuth.xml", "/google8281945d44253453.html", "/favicon.svg",
    "/assets/brand/live-logo.png", "/assets/admin/home/default-hero.jpg",
    "/assets/generated/characters/aria360/frame-0.png", "/assets/vendor/three.min.js",
    "/downloads/123tops-video.apk", "/downloads/123tops-video.mobileconfig",
    "/vendor/lucide-1.27.0.min.js", "/vendor/vipeak-prompt-editor.js",
    "/workflow-react/dist/canvas.js", "/workflow-react/dist/assets/bootstrap-icons.woff2",
    "/workflow-react/vendor/react.production.min.js",
  ]) {
    assert.equal(publicStaticPath(pathname), true, pathname);
  }
});

test("static allowlist blocks source, secrets, documentation, maps, dotfiles, and unknown extensions", () => {
  for (const pathname of [
    "/server.js", "/db.js", "/package.json", "/package-lock.json", "/DEPLOY.md", "/README.md",
    "/LOCAL_CREDENTIALS.md", "/AGENTS.md", "/.env", "/.env.example", "/.git/config",
    "/data/app-db.json", "/data/app-config.json", "/scripts/deploy_site.py",
    "/server.parts/part-42.js", "/test/site-http.test.js", "/tmp/secret",
    "/assets/ATTRIBUTION.md", "/assets/secret.json", "/assets/source/debug.map",
    "/platform.test-generate.css", "/workflow-react/dist/canvas.js.map",
    "/downloads/backup.zip", "/downloads/private.key", "/console.log",
    "/assets/image.jpg/secret.txt", "/assets/%2e%2e/server.js", "/assets/..%2fserver.js",
  ]) {
    assert.equal(publicStaticPath(pathname), false, pathname);
  }
});

test("admin media exposes only the three public reference directories", () => {
  for (const pathname of [
    "/assets/admin/home/default-hero.jpg",
    "/assets/admin/advanced-cases/example.mp4",
    "/assets/admin/platform-templates/example.jpg",
  ]) {
    assert.equal(publicAdminMediaPath(pathname), true, pathname);
  }
  for (const pathname of [
    "/assets/admin/voice-preview/joanna-scene-23s-a-bfa45922.m4a",
    "/assets/admin/undress-examples/example.png",
    "/assets/admin/private/report.json",
    "/assets/admin/",
    "/assets/admin/home/../voice-preview/joanna-scene-23s-a-bfa45922.m4a",
    "/assets/admin/home/%2e%2e/voice-preview/joanna-scene-23s-a-bfa45922.m4a",
    "/assets/admin/home/..%2fvoice-preview/joanna-scene-23s-a-bfa45922.m4a",
    "/assets/admin/home/%2E%2E/voice-preview/joanna-scene-23s-a-bfa45922.m4a",
    "/assets/admin/home/.%2e/voice-preview/joanna-scene-23s-a-bfa45922.m4a",
    "/assets/admin/home/voice-preview\\..\\private.m4a",
  ]) {
    assert.equal(publicAdminMediaPath(pathname), false, pathname);
  }
});

test("HTTP public requests redirect to HTTPS while local development remains available", () => {
  assert.equal(
    httpsRedirectLocation(
      { headers: { host: "123tops.com", "x-forwarded-proto": "http" }, socket: {} },
      { pathname: "/platform.html", search: "?from=test" },
    ),
    "https://123tops.com/platform.html?from=test",
  );
  assert.equal(
    httpsRedirectLocation(
      { headers: { host: "127.0.0.1:4307", "x-forwarded-proto": "http" }, socket: {} },
      { pathname: "/", search: "" },
    ),
    "",
  );
});

test("HTTPS responses receive HSTS and the shared security policy", () => {
  const headers = new Map();
  const response = {
    hasHeader(name) { return headers.has(name); },
    setHeader(name, value) { headers.set(name, value); },
  };
  applyPublicSecurityHeaders(
    { headers: { host: "123vips.com", "x-forwarded-proto": "https" }, socket: {} },
    response,
  );
  assert.match(headers.get("strict-transport-security"), /max-age=31536000/);
  assert.equal(headers.get("x-frame-options"), "DENY");
});

test("large public catalogs use edge caching while authenticated config stays private", () => {
  assert.match(fs.readFileSync(path.resolve(__dirname, "..", "lib-http.js"), "utf8"), /function sendJson\(res, statusCode, payload, \{ cacheControl = "no-store" \} = \{\}\)/);
  assert.match(serverSource, /public, max-age=30, s-maxage=30, stale-while-revalidate=120/);
  assert.match(serverSource, /private, no-store/);
  assert.match(serverSource, /public, max-age=300, s-maxage=3600, stale-while-revalidate=86400/);
  assert.match(serverSource, /cloudflare-cdn-cache-control/);
});

test("Alibaba model exposure is independently switchable without disabling the API", () => {
  assert.match(serverSource, /PUBLIC_ALIYUN_MODEL_EXPOSURE_ENABLED/);
  assert.match(serverSource, /PUBLIC_WAN30_MODEL_EXPOSURE_ENABLED/);
  assert.match(serverSource, /PUBLIC_WAN27_MODEL_EXPOSURE_ENABLED/);
  assert.match(serverSource, /PUBLIC_HAPPYHORSE_MODEL_EXPOSURE_ENABLED/);
  assert.match(serverSource, /PUBLIC_QWEN_IMAGE3_EXPOSURE_ENABLED/);
  assert.match(serverSource, /ALIYUN_QWEN_IMAGE3_BASE_URL \|\| ALIYUN_DASHSCOPE_BASE_URL/);
  assert.match(serverSource, /ALIYUN_QWEN_IMAGE3_API_KEY \|\| ALIYUN_DASHSCOPE_API_KEY/);
  assert.match(serverSource, /apiAccessEnabledForRequest\(req\)[\s\S]*requestTenantOptions\(req\)\.apiAccess !== false/);
  assert.match(serverSource, /MODEL_TEMPORARILY_UNAVAILABLE/);
  assert.match(createSource, /publicAliyunModelsEnabled/);
  assert.match(createSource, /publicWan30ModelsEnabled/);
  assert.match(createSource, /publicWan27ModelsEnabled/);
  assert.match(createSource, /publicHappyhorseModelsEnabled/);
  assert.match(createSource, /publicQwenImage3ModelsEnabled/);
  assert.match(createSource, /hiddenProviders = new Set/);
});
