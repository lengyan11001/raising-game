"use strict";

const path = require("node:path");

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com https://oauth.telegram.org https://accounts.google.com https://g.alicdn.com https://checkout.airwallex.com https://checkout-demo.airwallex.com https://static.airwallex.com",
  "frame-src 'self' https://accounts.google.com https://checkout.airwallex.com https://checkout-demo.airwallex.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' https: data: blob:",
  "media-src 'self' https: blob:",
  "font-src 'self' https: data:",
  "connect-src 'self' https: wss: blob:",
  "worker-src 'self' blob:",
  "form-action 'self' https:",
  "upgrade-insecure-requests",
].join("; ");

const PUBLIC_SECURITY_HEADERS = Object.freeze({
  "content-security-policy": CONTENT_SECURITY_POLICY,
  "cross-origin-opener-policy": "same-origin-allow-popups",
  /* 在线聊天（Vidu 实时数字人）需要麦克风；摄像头保留给将来的双向模式 */
  "permissions-policy": "camera=(self), geolocation=(), microphone=(self), browsing-topics=()",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
});


const PUBLIC_STATIC_ROOT_FILES = new Set([
  "/",
  "/admin.css",
  "/admin.html",
  "/admin.js",
  "/app.js",
  "/bingsiteauth.xml",
  "/chat-live.js",
  "/chat.css",
  "/chat.html",
  "/chat.js",
  "/embed.html",
  "/favicon.ico",
  "/favicon.svg",
  "/game.css",
  "/game.html",
  "/game.js",
  "/index.html",
  "/live.css",
  "/live.html",
  "/live.js",
  "/pay.css",
  "/pay.html",
  "/pay.js",
  "/platform-sw.js",
  "/platform.css",
  "/platform.html",
  "/platform.prompt-editor.css",
  "/platform.vitals.js",
  "/qrcode.js",
  "/site-123vipfans.css",
  "/site-123vipfans.js",
  "/site-landing.css",
  "/site-landing.html",
  "/site-landing.js",
  "/styles.css",
  "/tool-undress.css",
  "/tool-video.css",
  "/vendor/vipeak-prompt-editor.js",
]);

const PUBLIC_STATIC_DIRECTORY_EXTENSIONS = new Map([
  ["/assets/", new Set([
    ".aac", ".css", ".gif", ".ico", ".jpeg", ".jpg", ".js", ".m4a", ".m4v", ".mov",
    ".mp3", ".mp4", ".ogg", ".png", ".svg", ".ttf", ".wav", ".webm", ".webp", ".woff", ".woff2",
  ])],
  ["/downloads/", new Set([".apk", ".mobileconfig"])],
  ["/platform.create.parts/", new Set([".js"])],
  ["/platform.ui.parts/", new Set([".js"])],
  ["/vendor/", new Set([".css", ".gif", ".ico", ".jpeg", ".jpg", ".js", ".png", ".svg", ".ttf", ".webp", ".woff", ".woff2"])],
  ["/workflow-react/dist/", new Set([".css", ".gif", ".ico", ".jpeg", ".jpg", ".js", ".png", ".svg", ".txt", ".webp", ".woff", ".woff2"])],
  ["/workflow-react/vendor/", new Set([".css", ".js"])],
]);

const PUBLIC_STATIC_ROOT_PATTERNS = [
  /^\/platform(?:\.[a-z0-9-]+)?\.js$/i,
  /^\/google[0-9a-f]+\.html$/i,
];

function publicStaticPath(pathname = "") {
  const normalized = String(pathname || "").replace(/\\/g, "/");
  if (!normalized.startsWith("/") || normalized.includes("\0")) return false;
  if (/%2e|%2f|%5c/i.test(normalized)) return false;
  const segments = normalized.split("/");
  if (segments.some((segment) => segment.startsWith("."))) return false;
  if (PUBLIC_STATIC_ROOT_FILES.has(normalized.toLowerCase())) return true;
  if (PUBLIC_STATIC_ROOT_PATTERNS.some((pattern) => pattern.test(normalized))) return true;
  const extension = path.extname(normalized).toLowerCase();
  if (!extension) return false;
  for (const [prefix, extensions] of PUBLIC_STATIC_DIRECTORY_EXTENSIONS) {
    if (normalized.startsWith(prefix)) return extensions.has(extension);
  }
  return false;
}

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
  const pathname = String(req?.url || "").split("?")[0];
  const embed = pathname === "/embed" || pathname.startsWith("/embed/");
  const headers = embed ? {
    ...PUBLIC_SECURITY_HEADERS,
    "content-security-policy": CONTENT_SECURITY_POLICY.replace("frame-ancestors 'none'", "frame-ancestors https:"),
    "permissions-policy": "camera=*, geolocation=(), microphone=*, browsing-topics=()",
  } : PUBLIC_SECURITY_HEADERS;
  Object.entries(headers).forEach(([name, value]) => {
    if (embed && name === "x-frame-options") return;
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
  publicStaticPath,
};
