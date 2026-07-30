"use strict";

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' https: data: blob:",
  "media-src 'self' https: blob:",
  "font-src 'self' https: data:",
  "connect-src 'self' https: wss:",
  "worker-src 'self' blob:",
  "form-action 'self' https:",
  "upgrade-insecure-requests",
].join("; ");

const PUBLIC_SECURITY_HEADERS = Object.freeze({
  "content-security-policy": CONTENT_SECURITY_POLICY,
  "permissions-policy": "camera=(), geolocation=(), microphone=(), browsing-topics=()",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
});

function firstForwardedValue(value = "") {
  return String(value || "").split(",")[0].trim().toLowerCase();
}

function requestProtocol(req = {}) {
  if (req.socket?.encrypted) return "https";
  return firstForwardedValue(req.headers?.["x-forwarded-proto"] || "http");
}

function requestHost(req = {}) {
  return firstForwardedValue(req.headers?.["x-forwarded-host"] || req.headers?.host || "");
}

function isLocalHostname(host = "") {
  const hostname = String(host || "").replace(/^\[/, "").replace(/\](?::\d+)?$/, "").replace(/:\d+$/, "");
  return /^(localhost|127\.0\.0\.1|::1)$/i.test(hostname);
}

function httpsRedirectLocation(req = {}, url = {}) {
  const protocol = requestProtocol(req);
  const host = requestHost(req);
  if (protocol !== "http" || !host || isLocalHostname(host)) return "";
  return `https://${host}${url.pathname || "/"}${url.search || ""}`;
}

function applyPublicSecurityHeaders(req, res) {
  Object.entries(PUBLIC_SECURITY_HEADERS).forEach(([name, value]) => {
    if (!res.hasHeader(name)) res.setHeader(name, value);
  });
  if (requestProtocol(req) === "https" && !res.hasHeader("strict-transport-security")) {
    res.setHeader("strict-transport-security", "max-age=31536000; includeSubDomains");
  }
}

module.exports = {
  CONTENT_SECURITY_POLICY,
  PUBLIC_SECURITY_HEADERS,
  applyPublicSecurityHeaders,
  httpsRedirectLocation,
  requestProtocol,
};
