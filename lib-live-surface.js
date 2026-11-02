"use strict";

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_LIVE_STATIC_ROOT = "/opt/raising-game-live-static";
const LIVE_SURFACE_PATHS = Object.freeze([
  "/live.html",
  "/live.css",
  "/live.js",
  "/qrcode.js",
  "/site-landing.html",
  "/site-landing.css",
  "/site-landing.js",
  "/downloads/vipeak-live.apk",
]);
const LIVE_SURFACE_PATH_SET = new Set(LIVE_SURFACE_PATHS);

function normalizeStaticPath(pathname = "") {
  const normalized = String(pathname || "").trim().toLowerCase();
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

function isLiveOwnedStaticPath(pathname = "") {
  const normalized = normalizeStaticPath(pathname);
  return LIVE_SURFACE_PATH_SET.has(normalized)
    || normalized.startsWith("/assets/brand/live-")
    || normalized.startsWith("/assets/chat-live/moans/")
    || normalized.startsWith("/assets/chat-live/welcome-newcomer");
}

function resolveLiveStaticRoot(root, envRoot = "", options = {}) {
  const { defaultRoot = DEFAULT_LIVE_STATIC_ROOT } = options;
  const explicitRoot = String(envRoot || "").trim();
  return path.resolve(explicitRoot || defaultRoot);
}

function shouldBlockLiveOwnedStatic({
  pathname = "",
  toolId = "",
  hostname = "",
  isPaymentHost = false,
  isCmsHost = false,
  isStandaloneLandingHost = false,
} = {}) {
  if (toolId === "live" || isStandaloneLandingHost) return false;
  if (toolId === "chat" && normalizeStaticPath(pathname) === "/chat-live.js") return false;
  if (isPaymentHost || isCmsHost) return false;
  return isLiveOwnedStaticPath(pathname);
}

module.exports = {
  DEFAULT_LIVE_STATIC_ROOT,
  LIVE_SURFACE_PATHS,
  isLiveOwnedStaticPath,
  normalizeStaticPath,
  resolveLiveStaticRoot,
  shouldBlockLiveOwnedStatic,
};
