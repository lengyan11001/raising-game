const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  PUBLIC_SECURITY_HEADERS,
  applyPublicSecurityHeaders,
  httpsRedirectLocation,
} = require("../site-http");

const serverSource = fs.readFileSync(path.resolve(__dirname, "..", "server.js"), "utf8");
const createSource = fs.readFileSync(path.resolve(__dirname, "..", "platform.create.js"), "utf8");

test("public security headers cover browser-facing responses", () => {
  assert.match(PUBLIC_SECURITY_HEADERS["content-security-policy"], /frame-ancestors 'none'/);
  assert.match(PUBLIC_SECURITY_HEADERS["content-security-policy"], /https:\/\/oauth\.telegram\.org/);
  assert.equal(PUBLIC_SECURITY_HEADERS["cross-origin-opener-policy"], "same-origin-allow-popups");
  assert.equal(PUBLIC_SECURITY_HEADERS["x-content-type-options"], "nosniff");
  assert.equal(PUBLIC_SECURITY_HEADERS["x-frame-options"], "DENY");
  assert.equal(PUBLIC_SECURITY_HEADERS["referrer-policy"], "strict-origin-when-cross-origin");
});

test("server implementation and deployment files are not publicly served", () => {
  assert.match(serverSource, /const PRIVATE_STATIC_ROOT_FILES = new Set/);
  assert.match(serverSource, /"\/server\.js"/);
  assert.match(serverSource, /"\/db\.js"/);
  assert.match(serverSource, /"\/video-tools\.js"/);
  assert.match(serverSource, /if \(privateStaticPath\(pathname\)\) return sendText\(res, 404, "Not Found"\)/);
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
  assert.match(serverSource, /function sendJson\(res, statusCode, payload, \{ cacheControl = "no-store" \} = \{\}\)/);
  assert.match(serverSource, /public, max-age=30, s-maxage=30, stale-while-revalidate=120/);
  assert.match(serverSource, /private, no-store/);
  assert.match(serverSource, /public, max-age=300, s-maxage=300, stale-while-revalidate=3600/);
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
