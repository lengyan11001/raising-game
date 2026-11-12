"use strict";

// Tenant / host resolution helpers extracted from server.js.
//
// These constants and functions are shared by the main server (and would be
// shared by any future route modules). They must stay dependency-free of the
// server module itself: the only cross-module imports are db.js (tenant id
// helpers) and site-seo.js (canonical host aliases), neither of which requires
// server.js, so there is no circular require.

const { DEFAULT_TENANT_ID, normalizeTenantId } = require("./db");
const { canonicalizeOrigin } = require("./site-seo");
const {
  publicOriginFromRequest,
  requestOriginFromHeaders,
} = require("./lib-http");

const CANONICAL_HOST_ALIASES = String(process.env.CANONICAL_HOST_ALIASES || "").trim();
const PRIMARY_PLATFORM_HOSTS = new Set(parseCsvList(process.env.PRIMARY_PLATFORM_HOSTS || "123vips.com,www.123vips.com"));
const PRIMARY_PLATFORM_ROOT_HOSTS = new Set(parseCsvList(process.env.PRIMARY_PLATFORM_ROOT_HOSTS || "123vips.com"));
const PUBLIC_TENANT_ROOT_HOSTS = new Set(parseCsvList(process.env.PUBLIC_TENANT_ROOT_HOSTS || "cloudtoken.ai,667zui.video"));
const TOOL_TENANT_SUBDOMAIN_ALIASES = Object.freeze({
  undress: "undress",
  video: "video",
  videos: "video",
  image: "image",
  images: "image",
  anime: "anime",
  animation: "anime",
  character: "characters",
  characters: "characters",
  role: "characters",
  roles: "characters",
  create: "advanced",
  advanced: "advanced",
  tool: "advanced",
});
const TOOL_VIDEO_DEFAULT_PROVIDER = "seedance";

function toolVideoDefaultCapability(provider = TOOL_VIDEO_DEFAULT_PROVIDER) {
  const normalizedProvider = String(provider || "").trim().toLowerCase();
  if (normalizedProvider === "wan30") return "wan30-video";
  if (normalizedProvider === "wan27") return "wan27-video-edit";
  if (normalizedProvider === "happyhorse") return "happyhorse-video-edit";
  return "";
}

const TOOL_VIDEO_PROVIDER = ["wan30", "wan27", "happyhorse", "seedance"].includes(String(process.env.TOOL_VIDEO_PROVIDER || "").trim().toLowerCase())
  ? String(process.env.TOOL_VIDEO_PROVIDER).trim().toLowerCase()
  : TOOL_VIDEO_DEFAULT_PROVIDER;
const TOOL_TENANT_SPECS = Object.freeze({
  undress: {
    id: "undress",
    tenantId: "tool-undress-14vips",
    brand: "Undress",
    title: "Undress",
    description: "Private AI image and video editing.",
    defaultTab: "gallery",
    defaultGalleryMode: "characters",
    allowedTabs: ["gallery", "history", "topups", "spending", "referral"],
    allowedGalleryModes: ["characters"],
    disabledTabs: ["access", "assets", "workflow", "characters", "advanced"],
    assetLibrary: false,
  },
  video: {
    id: "video",
    tenantId: "tool-video-123tops",
    brand: "123Tops Video",
    title: "123Tops Video",
    description: "AI video creation workspace.",
    defaultTab: "gallery",
    defaultGalleryMode: "playflux-video",
    allowedTabs: ["gallery", "history", "topups", "spending", "pricing", "referral"],
    allowedGalleryModes: ["playflux-video"],
    disabledTabs: ["access", "assets", "workflow"],
    assetLibrary: false,
    videoProvider: TOOL_VIDEO_PROVIDER,
  },
  image: {
    id: "image",
    tenantId: "tool-image",
    defaultTab: "gallery",
    defaultGalleryMode: "playflux-image",
    allowedTabs: ["gallery", "history", "topups", "spending", "pricing"],
    allowedGalleryModes: ["playflux-image"],
    disabledTabs: ["access", "assets", "workflow", "referral"],
    assetLibrary: false,
  },
  anime: {
    id: "anime",
    tenantId: "tool-anime",
    defaultTab: "gallery",
    defaultGalleryMode: "playflux-anime",
    allowedTabs: ["gallery", "history", "topups", "spending", "pricing"],
    allowedGalleryModes: ["playflux-anime"],
    disabledTabs: ["access", "assets", "workflow", "referral"],
    assetLibrary: false,
  },
  characters: {
    id: "characters",
    tenantId: "tool-characters",
    defaultTab: "characters",
    allowedTabs: ["characters", "history", "topups", "spending", "pricing"],
    allowedGalleryModes: ["characters"],
    disabledTabs: ["access", "assets", "workflow", "referral"],
    assetLibrary: false,
  },
  chat: {
    id: "chat",
    tenantId: "tool-chat-5vips",
    brand: "5VIPS Chat",
    title: "5VIPS Chat",
    description: "Guided character conversations with your favorite AI roles.",
    defaultTab: "gallery",
    defaultGalleryMode: "characters",
    allowedTabs: ["gallery", "chat", "topups", "spending", "pricing"],
    allowedGalleryModes: ["characters"],
    disabledTabs: ["access", "assets", "workflow", "characters", "advanced", "referral"],
    assetLibrary: false,
  },
  live: {
    id: "live",
    tenantId: "tool-chat-5vips",
    brand: "Vipeak Live",
    title: "Vipeak Live",
    description: "Live conversations with AI characters.",
    defaultTab: "home",
    allowedTabs: ["home", "rooms", "messages", "account"],
    allowedGalleryModes: ["characters"],
    disabledTabs: ["access", "assets", "workflow", "advanced"],
    assetLibrary: false,
  },
  advanced: {
    id: "advanced",
    tenantId: "tool-advanced",
    defaultTab: "advanced",
    allowedTabs: ["advanced", "characters", "history", "topups", "spending", "pricing"],
    disabledTabs: ["access", "assets", "workflow", "referral"],
    assetLibrary: false,
  },
});
const DEFAULT_TOOL_TENANT_DOMAINS = "123tops.com=video,www.123tops.com=video,video.123tops.com=video,undress.14vips.com=undress,chat.5vips.com=chat,live.123vipeak.com=live";
const TOOL_TENANT_DOMAIN_MAP = parseToolTenantDomainMap(process.env.TOOL_TENANT_DOMAINS || process.env.TOOL_DOMAIN_MAP || DEFAULT_TOOL_TENANT_DOMAINS);

// Platform (non-tool) hosts that ship their own site profile. They keep the main
// platform user pool and billing (tenantId stays DEFAULT_TENANT_ID, toolOnly is
// false) but land on a different default tab and expose a reduced tab set.
const DEFAULT_PLATFORM_SITE_HOSTS = "123vip.fans";
const PLATFORM_SITE_HOSTS = new Set(parseCsvList(process.env.PLATFORM_SITE_HOSTS || DEFAULT_PLATFORM_SITE_HOSTS));
const PLATFORM_SITE_PROFILE = Object.freeze({
  id: "custom-workflow",
  // The profile lands on its own welcome page and enters the 自定义 workspace
  // from there, so defaultRoute stays empty (no forced in-app route).
  defaultTab: String(process.env.PLATFORM_SITE_DEFAULT_TAB || "home").trim() || "home",
  // In-app route the profile lands on (setTab accepts the raw "custom" route,
  // which opens the 自定义 workspace in custom mode).
  defaultRoute: String(process.env.PLATFORM_SITE_DEFAULT_ROUTE || "").trim(),
  // Nav entries to hide without disabling the underlying tab/panel.
  hiddenNavTabs: parseCsvList(process.env.PLATFORM_SITE_HIDDEN_NAV_TABS || "advanced"),
  allowedTabs: parseCsvList(process.env.PLATFORM_SITE_ALLOWED_TABS || "home,advanced,workflow,assets,history,topups,spending,pricing,referral,access"),
  disabledTabs: parseCsvList(process.env.PLATFORM_SITE_DISABLED_TABS || "gallery,characters,chat"),
  // Show a "home" entry in the side rail so the workspace can return to the
  // profile's welcome page.
  navHome: true,
  bodyClass: "site-custom-workflow",
  stylesheet: "site-123vipfans.css",
  logo: "/assets/brand/123vipfans-logo.png",
  favicon: "/assets/brand/123vipfans-favicon.png",
});

function platformSiteProfileForHostname(hostname = "") {
  const host = normalizeHostname(hostname);
  if (!host) return null;
  // The www host is the same site as the apex, so it must land on the same
  // profile instead of falling back to the plain platform app.
  const bareHost = host.replace(/^www\./, "");
  return PLATFORM_SITE_HOSTS.has(host) || PLATFORM_SITE_HOSTS.has(bareHost) ? PLATFORM_SITE_PROFILE : null;
}

function standaloneLandingHostname(hostname = "") {
  return normalizeHostname(hostname).replace(/^www\./, "") === "123vipeak.com";
}

function defaultPageForHostname(hostname = "") {
  return standaloneLandingHostname(hostname) ? "/site-landing.html" : "/platform.html";
}

function pageOriginFromRequest(req) {
  const tenant = requestTenantDescriptor(req);
  const origin = tenant.toolOnly ? requestOriginFromHeaders(req) : publicOriginFromRequest(req);
  return canonicalizeOrigin(origin, CANONICAL_HOST_ALIASES);
}

function parseCsvList(value = "") {
  return String(value || "")
    .split(/[,\n;]/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function normalizeHostname(value = "") {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return "";
  try {
    return new URL(text.includes("://") ? text : `https://${text}`).hostname.toLowerCase();
  } catch {
    return text.replace(/:\d+$/, "").replace(/^\.+|\.+$/g, "").toLowerCase();
  }
}

function parseToolTenantDomainMap(value = "") {
  const map = new Map();
  String(value || "")
    .split(/[,\n;]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((entry) => {
      const separator = entry.includes("=") ? "=" : entry.includes("|") ? "|" : "";
      if (!separator) return;
      const [rawHost, rawTool] = entry.split(separator);
      const host = normalizeHostname(rawHost);
      const tool = String(rawTool || "").trim().toLowerCase();
      if (host && TOOL_TENANT_SPECS[tool]) map.set(host, tool);
    });
  return map;
}

function hostnameFromOrigin(origin = "") {
  return normalizeHostname(origin);
}

function requestHostname(req) {
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
  if (!host) return "";
  try {
    return new URL(`http://${host}`).hostname.toLowerCase();
  } catch {
    return host.replace(/:\d+$/, "").toLowerCase();
  }
}

function hostnameMatchesRoot(hostname = "", root = "") {
  const host = normalizeHostname(hostname);
  const base = normalizeHostname(root);
  return Boolean(host && base && (host === base || host.endsWith(`.${base}`)));
}

function isPrimaryPlatformHostname(hostname = "") {
  const host = normalizeHostname(hostname);
  return Boolean(host && PRIMARY_PLATFORM_HOSTS.has(host));
}

function isPublicTenantHostname(hostname = "") {
  const host = normalizeHostname(hostname);
  if (!host || isPrimaryPlatformHostname(host)) return false;
  if (Array.from(PRIMARY_PLATFORM_ROOT_HOSTS).some((root) => hostnameMatchesRoot(host, root))) return true;
  return Array.from(PUBLIC_TENANT_ROOT_HOSTS).some((root) => hostnameMatchesRoot(host, root));
}

function toolTenantIdForHostname(hostname = "") {
  const host = normalizeHostname(hostname);
  if (!host || isPrimaryPlatformHostname(host)) return "";
  const configured = TOOL_TENANT_DOMAIN_MAP.get(host);
  if (configured && TOOL_TENANT_SPECS[configured]) return configured;
  const firstLabel = host.split(".")[0] || "";
  return TOOL_TENANT_SUBDOMAIN_ALIASES[firstLabel] || "";
}

function tenantDescriptorFromHostname(hostname = "") {
  const host = normalizeHostname(hostname);
  const toolId = toolTenantIdForHostname(host);
  const tool = TOOL_TENANT_SPECS[toolId] || null;
  const siteProfile = tool ? null : platformSiteProfileForHostname(host);
  const tenantPublic = Boolean(tool || isPublicTenantHostname(host));
  const apiAccess = !tool;
  return {
    tenantPublic,
    tenantMode: tool ? "tool" : "platform",
    host,
    tenantId: normalizeTenantId(tool?.tenantId || DEFAULT_TENANT_ID),
    toolOnly: Boolean(tool),
    toolId: tool?.id || "",
    brand: tool?.brand || "",
    title: tool?.title || "",
    description: tool?.description || "",
    defaultTab: tool?.defaultTab || siteProfile?.defaultTab || "gallery",
    defaultGalleryMode: tool?.defaultGalleryMode || "characters",
    allowedTabs: Array.isArray(tool?.allowedTabs) ? tool.allowedTabs : (siteProfile?.allowedTabs || []),
    allowedGalleryModes: Array.isArray(tool?.allowedGalleryModes) ? tool.allowedGalleryModes : [],
    hiddenNavTabs: Array.isArray(siteProfile?.hiddenNavTabs) ? siteProfile.hiddenNavTabs : [],
    defaultRoute: siteProfile?.defaultRoute || "",
    navHome: Boolean(siteProfile?.navHome),
    disabledTabs: Array.from(new Set([
      ...(tool?.disabledTabs || siteProfile?.disabledTabs || []),
      ...(apiAccess ? [] : ["access"]),
    ])),
    apiAccess,
    assetLibrary: tool?.assetLibrary ?? true,
    accountMenu: true,
    subscriptions: Boolean(tool),
    membershipProgram: !tool,
    videoProvider: tool?.videoProvider || "",
    siteProfile: siteProfile?.id || "",
  };
}

function tenantDescriptorFromOrigin(origin = "") {
  return tenantDescriptorFromHostname(hostnameFromOrigin(origin));
}

function requestTenantDescriptor(req) {
  return tenantDescriptorFromHostname(requestHostname(req) || hostnameFromOrigin(publicOriginFromRequest(req)));
}

function requestTenantOptions(req) {
  const tenant = requestTenantDescriptor(req);
  return { ...tenant, tenant };
}

function requestTenantId(req) {
  return normalizeTenantId(requestTenantDescriptor(req).tenantId || DEFAULT_TENANT_ID);
}

function recordTenantId(record = null) {
  return normalizeTenantId(record?.tenantId || record?.tenant_id || DEFAULT_TENANT_ID);
}

function recordBelongsToTenant(record = null, tenantId = DEFAULT_TENANT_ID) {
  return Boolean(record) && recordTenantId(record) === normalizeTenantId(tenantId);
}

function isTenantPublicOrigin(origin = "") {
  return tenantDescriptorFromOrigin(origin).tenantPublic;
}

module.exports = {
  // configuration
  CANONICAL_HOST_ALIASES,
  PRIMARY_PLATFORM_HOSTS,
  PRIMARY_PLATFORM_ROOT_HOSTS,
  PUBLIC_TENANT_ROOT_HOSTS,
  TOOL_TENANT_SUBDOMAIN_ALIASES,
  TOOL_VIDEO_DEFAULT_PROVIDER,
  TOOL_VIDEO_PROVIDER,
  TOOL_TENANT_SPECS,
  TOOL_TENANT_DOMAIN_MAP,
  PLATFORM_SITE_HOSTS,
  PLATFORM_SITE_PROFILE,
  // helpers
  parseCsvList,
  normalizeHostname,
  parseToolTenantDomainMap,
  toolVideoDefaultCapability,
  platformSiteProfileForHostname,
  standaloneLandingHostname,
  defaultPageForHostname,
  hostnameFromOrigin,
  requestHostname,
  hostnameMatchesRoot,
  isPrimaryPlatformHostname,
  isPublicTenantHostname,
  toolTenantIdForHostname,
  tenantDescriptorFromHostname,
  tenantDescriptorFromOrigin,
  requestTenantDescriptor,
  requestTenantOptions,
  requestTenantId,
  recordTenantId,
  recordBelongsToTenant,
  isTenantPublicOrigin,
  // origin helpers
  publicOriginFromRequest,
  requestOriginFromHeaders,
  pageOriginFromRequest,
};
