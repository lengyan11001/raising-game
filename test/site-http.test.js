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

test("public security headers cover browser-facing responses", () => {
  assert.match(PUBLIC_SECURITY_HEADERS["content-security-policy"], /frame-ancestors 'none'/);
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

test("public mainland blocking is enabled by default and login is not an exception", () => {
  assert.match(serverSource, /const BLOCK_MAINLAND_CHINA = \/\^\(1\|true\|yes\|on\)\$\/i\.test\(String\(process\.env\.BLOCK_MAINLAND_CHINA \|\| "1"\)/);
  assert.match(serverSource, /function isMainlandAdminAllowedRequest\(req, url\) \{\s*return isCmsHostRequest\(req\);/);
  assert.doesNotMatch(serverSource, /function isMainlandAdminAllowedRequest[\s\S]{0,300}api\/auth\/login/);
});

test("public AI exposure is feature-flagged and upstream details are not in health output", () => {
  assert.match(serverSource, /const PUBLIC_AI_EXPOSURE_ENABLED = \/\^\(1\|true\|yes\|on\)\$\/i\.test\(String\(process\.env\.PUBLIC_AI_EXPOSURE_ENABLED \|\| "0"\)/);
  assert.match(serverSource, /publicPlatform\.advanced = \{ cases: \[\] \};/);
  assert.match(serverSource, /if \(!apiAccessEnabledForRequest\(req\)\) return sendApiAccessDisabled\(res\);\s*return await handleAdvancedGenerate/);
  assert.match(serverSource, /return sendJson\(res, 200, \{ ok: true \}\);/);
});
