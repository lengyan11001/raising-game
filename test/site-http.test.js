const test = require("node:test");
const assert = require("node:assert/strict");

const {
  PUBLIC_SECURITY_HEADERS,
  applyPublicSecurityHeaders,
  httpsRedirectLocation,
} = require("../site-http");

test("public security headers cover browser-facing responses", () => {
  assert.match(PUBLIC_SECURITY_HEADERS["content-security-policy"], /frame-ancestors 'none'/);
  assert.equal(PUBLIC_SECURITY_HEADERS["x-content-type-options"], "nosniff");
  assert.equal(PUBLIC_SECURITY_HEADERS["x-frame-options"], "DENY");
  assert.equal(PUBLIC_SECURITY_HEADERS["referrer-policy"], "strict-origin-when-cross-origin");
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
