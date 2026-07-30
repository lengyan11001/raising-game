"use strict";

const DEFAULT_CANONICAL_HOST_ALIASES = Object.freeze({
  "www.123vips.com": "123vips.com",
  "www.667zui.video": "667zui.video",
  "www.123tops.com": "123tops.com",
  "video.123tops.com": "123tops.com",
});

function normalizeHostname(value = "") {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return "";
  try {
    return new URL(text.includes("://") ? text : `https://${text}`).hostname.toLowerCase();
  } catch {
    return text.replace(/:\d+$/, "").replace(/^\.+|\.+$/g, "");
  }
}

function parseHostValueMap(value = "", defaults = {}) {
  const map = new Map(
    Object.entries(defaults).map(([host, target]) => [normalizeHostname(host), String(target || "").trim()]),
  );
  String(value || "")
    .split(/[,\n;]/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .forEach((entry) => {
      const separator = entry.includes("=") ? "=" : entry.includes("|") ? "|" : "";
      if (!separator) return;
      const separatorIndex = entry.indexOf(separator);
      const host = normalizeHostname(entry.slice(0, separatorIndex));
      const target = String(entry.slice(separatorIndex + 1) || "").trim();
      if (host && target) map.set(host, target);
    });
  return map;
}

function canonicalHostname(hostname = "", configuredAliases = "") {
  const host = normalizeHostname(hostname);
  if (!host) return "";
  const aliases = parseHostValueMap(configuredAliases, DEFAULT_CANONICAL_HOST_ALIASES);
  return normalizeHostname(aliases.get(host) || host);
}

function canonicalizeOrigin(origin = "", configuredAliases = "") {
  try {
    const url = new URL(String(origin || ""));
    const hostname = canonicalHostname(url.hostname, configuredAliases);
    if (!hostname || hostname === url.hostname) return url.origin;
    url.hostname = hostname;
    url.port = "";
    return url.origin;
  } catch {
    return String(origin || "").replace(/\/+$/, "");
  }
}

function siteVerificationToken(hostname = "", defaultToken = "", configuredByHost = "") {
  const host = canonicalHostname(hostname);
  const configured = parseHostValueMap(configuredByHost);
  return String(configured.get(host) || defaultToken || "").trim();
}

function validTimestamp(value) {
  const date = new Date(value || "");
  return Number.isFinite(date.getTime()) ? date : null;
}

function latestIsoTimestamp(values = [], fallback = "") {
  const dates = (Array.isArray(values) ? values : [values])
    .map(validTimestamp)
    .filter(Boolean)
    .sort((a, b) => b.getTime() - a.getTime());
  if (dates.length) return dates[0].toISOString();
  return validTimestamp(fallback)?.toISOString() || "";
}

function itemUpdatedAt(item = {}, fallback = "") {
  return latestIsoTimestamp([
    item.updatedAt,
    item.updated_at,
    item.createdAt,
    item.created_at,
  ], fallback);
}

function collectionUpdatedAt(items = [], fallback = "") {
  return latestIsoTimestamp((items || []).flatMap((item) => [
    item?.updatedAt,
    item?.updated_at,
    item?.createdAt,
    item?.created_at,
  ]), fallback);
}

function xmlEscape(value = "") {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function sitemapEntryXml({ loc, lastmod, image = "" }) {
  const imageXml = image ? `
    <image:image>
      <image:loc>${xmlEscape(image)}</image:loc>
    </image:image>` : "";
  return `  <url>
    <loc>${xmlEscape(loc)}</loc>
    <lastmod>${xmlEscape(lastmod)}</lastmod>${imageXml}
  </url>`;
}

function buildSitemapXml(snapshot = {}) {
  const fallbackUpdatedAt = snapshot.updatedAt || new Date(0).toISOString();
  const origin = String(snapshot.origin || "").replace(/\/+$/, "");
  const entries = [
    sitemapEntryXml({ loc: `${origin}/`, lastmod: fallbackUpdatedAt }),
  ];
  if (!snapshot.toolOnly) {
    entries.push(
      sitemapEntryXml({ loc: `${origin}/characters/`, lastmod: fallbackUpdatedAt }),
      sitemapEntryXml({ loc: `${origin}/tags/`, lastmod: fallbackUpdatedAt }),
      sitemapEntryXml({ loc: `${origin}/categories/`, lastmod: fallbackUpdatedAt }),
      ...(snapshot.categories || []).map((category) => sitemapEntryXml({
        loc: category.url,
        lastmod: category.updatedAt || fallbackUpdatedAt,
        image: category.characters?.[0]?.geoPosterAbsolute || "",
      })),
      ...(snapshot.tags || []).map((tag) => sitemapEntryXml({
        loc: tag.url,
        lastmod: tag.updatedAt || fallbackUpdatedAt,
        image: tag.characters?.[0]?.geoPosterAbsolute || "",
      })),
      ...(snapshot.characters || []).map((item) => sitemapEntryXml({
        loc: item.geoUrl,
        lastmod: item.geoUpdatedAt || fallbackUpdatedAt,
        image: item.geoPosterAbsolute || "",
      })),
    );
  }
  const imageNamespace = entries.some((entry) => entry.includes("<image:image>"))
    ? ' xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"'
    : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${imageNamespace}>
${entries.join("\n")}
</urlset>
`;
}

function htmlEscape(value = "") {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderDiscoveryLinks(snapshot = {}) {
  if (snapshot.toolOnly) return "";
  const links = [
    { label: "All characters", path: "/characters/" },
    { label: "All tags", path: "/tags/" },
    { label: "All categories", path: "/categories/" },
    ...(snapshot.categories || []).slice(0, 3).map((item) => ({ label: item.label, path: item.path })),
    ...(snapshot.tags || []).slice(0, 10).map((item) => ({ label: item.label, path: item.path })),
    ...(snapshot.characters || []).slice(0, 12).map((item) => ({
      label: item.name || item.title || item.id,
      path: item.geoPath,
    })),
  ].filter((item) => item.label && item.path);
  if (!links.length) return "";
  return `
    <nav class="seo-discovery" aria-label="Browse public collections">
      <strong>Browse</strong>
      <div>${links.map((item) => `<a href="${htmlEscape(item.path)}">${htmlEscape(item.label)}</a>`).join("")}</div>
    </nav>`;
}

module.exports = {
  DEFAULT_CANONICAL_HOST_ALIASES,
  buildSitemapXml,
  canonicalHostname,
  canonicalizeOrigin,
  collectionUpdatedAt,
  itemUpdatedAt,
  latestIsoTimestamp,
  parseHostValueMap,
  renderDiscoveryLinks,
  siteVerificationToken,
};
