// lib-http.js
// HTTP response helpers and basic request origin/cookie parsing, extracted from server.js.
// Self-contained: uses only node globals (Buffer, URL) and PUBLIC_BASE_URL from env.
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, "");

function sendJson(res, statusCode, payload, { cacheControl = "no-store" } = {}) {
  const body = JSON.stringify(payload);
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": cacheControl,
    "vary": "Accept-Encoding",
  };
  if (cacheControl.startsWith("public")) {
    headers["cdn-cache-control"] = cacheControl;
    headers["cloudflare-cdn-cache-control"] = cacheControl;
  }
  res.writeHead(statusCode, headers);
  res.end(body);
}

function sendText(res, statusCode, body, { cacheControl = "no-cache", head = false } = {}) {
  const text = String(body ?? "");
  res.writeHead(statusCode, {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": cacheControl,
    "content-length": Buffer.byteLength(text),
  });
  res.end(head ? undefined : text);
}

function sendHtml(res, statusCode, body, { cacheControl = "no-store", head = false } = {}) {
  const html = String(body ?? "");
  res.writeHead(statusCode, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": cacheControl,
    "content-length": Buffer.byteLength(html),
  });
  res.end(head ? undefined : html);
}

function publicLegalPageHtml(type = "privacy", req = null) {
  const isPrivacy = String(type || "privacy").toLowerCase() === "privacy";
  const title = isPrivacy ? "Privacy Policy" : "Terms of Service";
  const canonicalBase = publicOriginFromRequest(req) || "https://123vips.com";
  const canonical = `${canonicalBase}/${isPrivacy ? "privacy" : "terms"}`;
  const content = isPrivacy ? `
    <h1>Privacy Policy</h1>
    <p class="updated">Last updated: 2026-08-24</p>
    <p>Vipeak AI provides creative AI image and video tools. This policy explains what information we collect, how we use it, and the choices available to you.</p>
    <h2>Information we collect</h2>
    <p>We collect account information, authentication details, Google profile information used for sign-in, support messages, prompts, uploaded media, generation records, billing records, and security and request logs.</p>
    <h2>How we use information</h2>
    <p>We use information to authenticate accounts, provide image and video generation, process credits and payments, prevent abuse, troubleshoot failures, provide support, maintain security, and comply with legal obligations.</p>
    <h2>Google sign-in</h2>
    <p>When you choose Google sign-in, Google provides a stable account identifier and basic profile information such as your email address, name, and profile image. We use this information only to create and access your Vipeak AI account. We do not sell Google user data or use it for advertising.</p>
    <h2>Uploads and generated content</h2>
    <p>Prompts, reference files, generated media, and task metadata may be processed by our hosting and model providers only as needed to operate the service, handle failures, enforce safety rules, and preserve billing records.</p>
    <h2>Sharing</h2>
    <p>We do not sell personal information. We may share limited information with hosting, payment, analytics, security, and model service providers, or when required by law, safety, fraud prevention, or enforcement of our agreements.</p>
    <h2>Retention and security</h2>
    <p>We retain account, billing, generation, and security records for as long as needed for service operation, dispute handling, security, legal compliance, and backup recovery. No online system is risk-free.</p>
    <h2>Your choices</h2>
    <p>You may contact support to request access, correction, deletion, export, or restriction of personal information where applicable. Some records may be retained when required for legal, security, fraud-prevention, or accounting reasons.</p>
    <h2>Contact</h2>
    <p>For privacy questions, contact us through <a href="https://t.me/VipeakSupportBot">Vipeak AI support</a>.</p>
  ` : `
    <h1>Terms of Service</h1>
    <p class="updated">Last updated: 2026-08-24</p>
    <p>By registering or using Vipeak AI, you confirm that you can legally enter these terms and that the information you provide is truthful and current.</p>
    <h2>Account security</h2>
    <p>You are responsible for your password, sign-in methods, API token, and activity under your account. Notify support promptly if you suspect unauthorized access.</p>
    <h2>Acceptable use</h2>
    <p>You must not use the service to create illegal, non-consensual, deceptive, infringing, hateful, exploitative, abusive, or unsafe content, or to bypass safety controls, rate limits, access controls, or payment rules.</p>
    <h2>Uploads and rights</h2>
    <p>You represent that you have the rights, permissions, and consent required for media, prompts, names, likenesses, trademarks, and other materials you upload or ask the service to process.</p>
    <h2>Credits and billing</h2>
    <p>Credits are used for generation and related actions. Prices, model availability, duration, resolution, and credit consumption may change. Completed purchases and consumed credits are generally non-refundable unless required by law or expressly approved by us.</p>
    <h2>Generated content</h2>
    <p>Generated outputs depend on model behavior and user inputs. You are responsible for reviewing outputs before publication or commercial use and for complying with law, platform rules, and third-party rights.</p>
    <h2>Service changes and termination</h2>
    <p>We may modify, suspend, throttle, or discontinue features, models, accounts, or access when needed for security, compliance, abuse prevention, maintenance, or business reasons.</p>
    <h2>Contact</h2>
    <p>For questions about these terms, contact <a href="https://t.me/VipeakSupportBot">Vipeak AI support</a>.</p>
  `;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} - Vipeak AI</title><meta name="description" content="${title} for Vipeak AI.">
<link rel="canonical" href="${canonical}"><style>
:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#09090d;color:#f4f4f5;font:16px/1.7 system-ui,-apple-system,Segoe UI,sans-serif}main{width:min(860px,calc(100% - 32px));margin:0 auto;padding:56px 0 72px}h1{font-size:clamp(2rem,5vw,3rem);line-height:1.15;margin:0 0 8px}h2{font-size:1.15rem;margin:30px 0 6px}p{color:#c8c8d0;margin:10px 0}.updated{font-size:.9rem;color:#8f8f9a}a{color:#ff5bab}nav{margin-bottom:34px}nav a{color:#f4f4f5;text-decoration:none}nav a:hover{text-decoration:underline}.brand{font-weight:800;letter-spacing:.02em}
</style></head><body><main><nav><a href="/"><span class="brand">Vipeak AI</span></a></nav>${content}</main></body></html>`;
}

function sendXml(res, statusCode, body, { cacheControl = "no-cache", head = false } = {}) {
  const xml = String(body ?? "");
  res.writeHead(statusCode, {
    "content-type": "application/xml; charset=utf-8",
    "cache-control": cacheControl,
    "content-length": Buffer.byteLength(xml),
  });
  res.end(head ? undefined : xml);
}

function sendCsv(res, filename, body) {
  const safeName = String(filename || "export.csv").replace(/[^a-z0-9._-]/gi, "-") || "export.csv";
  res.writeHead(200, {
    "content-type": "text/csv; charset=utf-8",
    "content-disposition": `attachment; filename="${safeName}"`,
    "cache-control": "no-store",
  });
  res.end(`\uFEFF${body}`);
}

function csvValue(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvRows(headers, rows) {
  return [
    headers.map(({ label }) => csvValue(label)).join(","),
    ...rows.map((row) => headers.map(({ key }) => csvValue(row[key])).join(",")),
  ].join("\n");
}

function htmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function xmlEscape(value) {
  return htmlEscape(value);
}

function requestCountryCode(req) {
  return String(
    req.headers["cf-ipcountry"] ||
      req.headers["x-vercel-ip-country"] ||
      req.headers["x-country-code"] ||
      "",
  ).trim().toUpperCase();
}

function parseCookieHeader(header = "") {
  const cookies = {};
  String(header || "").split(";").forEach((part) => {
    const index = part.indexOf("=");
    if (index < 0) return;
    const key = part.slice(0, index).trim();
    if (!key) return;
    cookies[key] = decodeURIComponent(part.slice(index + 1).trim());
  });
  return cookies;
}

function timingSafeEqualString(a = "", b = "") {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function sendMarkdown(res, statusCode, body) {
  res.writeHead(statusCode, {
    "content-type": "text/markdown; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(body);
}

function publicOriginFromRequest(req) {
  if (PUBLIC_BASE_URL) return PUBLIC_BASE_URL;
  return requestOriginFromHeaders(req);
}

function requestOriginFromHeaders(req) {
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
  if (!host) return "https://123vips.com";
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const localHost = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host);
  const protocol = forwardedProto || (localHost ? "http" : "https");
  return `${protocol}://${host}`.replace(/\/+$/, "");
}

module.exports = {
  sendJson,
  sendText,
  sendHtml,
  publicLegalPageHtml,
  sendXml,
  sendCsv,
  csvValue,
  csvRows,
  htmlEscape,
  xmlEscape,
  requestCountryCode,
  parseCookieHeader,
  timingSafeEqualString,
  sendMarkdown,
  publicOriginFromRequest,
  requestOriginFromHeaders,
};
