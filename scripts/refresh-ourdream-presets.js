"use strict";

// Fetch the OurDream catalog once and mirror every image/video into this site's R2 bucket.
// The generated JSON is the only catalog consumed by production.
const crypto = require("node:crypto");
const fsSync = require("node:fs");
const fs = require("node:fs/promises");
const path = require("node:path");
const { fetchOurDreamPresetLibrary } = require("../ourdream-presets");

const ROOT = path.resolve(__dirname, "..");
const OUTPUT = path.join(ROOT, "assets", "ourdream", "presets", "presets.json");
const ACTION_OUTPUT = path.join(ROOT, "assets", "ourdream", "presets", "video-actions.json");
const mirror = process.argv.includes("--mirror");
const concurrencyArg = process.argv.find((arg) => arg.startsWith("--concurrency="));
const concurrency = Math.max(1, Math.min(20, Number(concurrencyArg?.split("=")[1]) || 8));
const cache = new Map();

function loadLocalEnv(filePath) {
  if (!fsSync.existsSync(filePath)) return;
  for (const line of fsSync.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index < 1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!process.env[key]) process.env[key] = value;
  }
}

loadLocalEnv(path.join(ROOT, ".env.local"));
loadLocalEnv(path.join(ROOT, ".env"));

const R2 = {
  accessKey: process.env.R2_ACCESS_KEY_ID || process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
  secretKey: process.env.R2_SECRET_ACCESS_KEY || process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
  endpoint: process.env.R2_ENDPOINT || process.env.CLOUDFLARE_R2_ENDPOINT,
  region: process.env.R2_REGION || process.env.CLOUDFLARE_R2_REGION || "auto",
  bucket: process.env.R2_BUCKET || process.env.CLOUDFLARE_R2_BUCKET,
  publicDomain:
    process.env.R2_PUBLIC_BASE_URL || process.env.R2_PUBLIC_DOMAIN ||
    process.env.CLOUDFLARE_R2_PUBLIC_BASE_URL || process.env.CLOUDFLARE_R2_PUBLIC_DOMAIN,
};

function required(name, value) {
  if (!value) throw new Error(`Missing ${name}; pass R2 credentials in the server environment.`);
}

function hmac(key, value, encoding) { return crypto.createHmac("sha256", key).update(value).digest(encoding); }
function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function signingKey(secret, date, region) { return hmac(hmac(hmac(hmac(`AWS4${secret}`, date), region), "s3"), "aws4_request"); }
function encodedPath(value) { return value.split("/").map(encodeURIComponent).join("/"); }
function extFor(contentType, sourceUrl) {
  const pathname = (() => { try { return new URL(sourceUrl).pathname; } catch { return ""; } })();
  const ext = path.extname(pathname).toLowerCase();
  if (/^\.(png|jpe?g|webp|gif|bmp|svg|mp4|webm|mov|m4v)$/.test(ext)) return ext;
  return ({ "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "video/mp4": ".mp4", "video/quicktime": ".mov", "video/webm": ".webm" })[contentType] || ".bin";
}
function contentType(response, sourceUrl) {
  const value = String(response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (value) return value;
  const ext = path.extname(new URL(sourceUrl).pathname).toLowerCase();
  return ({ ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm" })[ext] || "application/octet-stream";
}
function authFor(key, bytes, mime) {
  const endpointText = String(R2.endpoint || "").replace(/\/+$/, "");
  const endpoint = new URL(/^https?:\/\//i.test(endpointText) ? endpointText : `https://${endpointText}`);
  const xDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const date = xDate.slice(0, 8);
  const payloadHash = sha256(bytes);
  const canonicalUri = `/${encodeURIComponent(R2.bucket)}/${encodedPath(key)}`;
  const headers = { "cache-control": "public, max-age=31536000, immutable", "content-type": mime, host: endpoint.host, "x-amz-content-sha256": payloadHash, "x-amz-date": xDate };
  const signedHeaders = Object.keys(headers).sort().join(";");
  const canonicalHeaders = signedHeaders.split(";").map((header) => `${header}:${headers[header]}\n`).join("");
  const canonicalRequest = ["PUT", canonicalUri, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = `${date}/${R2.region}/s3/aws4_request`;
  const signature = hmac(signingKey(R2.secretKey, date, R2.region), ["AWS4-HMAC-SHA256", xDate, scope, sha256(canonicalRequest)].join("\n"), "hex");
  return { url: `${endpoint.protocol}//${endpoint.host}${canonicalUri}`, headers: { ...headers, authorization: `AWS4-HMAC-SHA256 Credential=${R2.accessKey}/${scope},SignedHeaders=${signedHeaders},Signature=${signature}` } };
}

async function mirrorUrl(sourceUrl, kind, id) {
  const source = String(sourceUrl || "").trim();
  if (!/^https?:\/\//i.test(source)) return source;
  if (cache.has(source)) return cache.get(source);
  let response;
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);
    try {
      response = await fetch(source, { headers: { accept: "*/*", referer: "https://ourdream.ai/" }, signal: controller.signal });
      clearTimeout(timer);
      if (response.ok) break;
      lastError = new Error(`Download failed ${response.status}: ${source}`);
    } catch (error) {
      clearTimeout(timer);
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
  }
  if (!response?.ok) throw lastError || new Error(`Download failed: ${source}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const mime = contentType(response, source);
  const digest = sha256(source).slice(0, 20);
  const safeKind = String(kind || "asset").replace(/[^a-z0-9_-]+/gi, "-").toLowerCase();
  const safeId = String(id || "item").replace(/[^a-z0-9_-]+/gi, "-").toLowerCase().slice(0, 80);
  const key = `assets/ourdream/mirrored/${safeKind}/${safeId}-${digest}${extFor(mime, source)}`;
  const auth = authFor(key, bytes, mime);
  const uploadController = new AbortController();
  const uploadTimer = setTimeout(() => uploadController.abort(), 120000);
  const upload = await fetch(auth.url, { method: "PUT", headers: auth.headers, body: bytes, signal: uploadController.signal });
  clearTimeout(uploadTimer);
  if (!upload.ok) throw new Error(`R2 upload failed ${upload.status}: ${source}`);
  const publicUrl = `${String(R2.publicDomain).replace(/\/+$/, "")}/${key}`;
  cache.set(source, publicUrl);
  return publicUrl;
}

async function mapConcurrent(items, worker) {
  const output = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor++;
      output[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return output;
}

function collectMedia(library) {
  const jobs = [];
  for (const set of library.sets || []) {
    for (const item of set.items || []) {
      const id = `${set.slot}-${item.id}`;
      for (let index = 0; index < (item.displayImageUrls || []).length; index += 1) {
        const url = item.displayImageUrls[index];
        if (/^https?:\/\//i.test(String(url || ""))) jobs.push({ item: item.displayImageUrls, field: index, url, kind: set.slot, id: `${id}-display-${index}` });
      }
      for (const field of ["imageUrl", "referenceImageUrl"]) if (/^https?:\/\//i.test(String(item[field] || ""))) jobs.push({ item, field, url: item[field], kind: set.slot, id });
      for (const [variantKey, variant] of Object.entries(item.variants || {})) {
        for (const field of ["imageUrl", "referenceImageUrl"]) if (/^https?:\/\//i.test(String(variant[field] || ""))) jobs.push({ item: variant, field, url: variant[field], kind: set.slot, id: `${id}-${variantKey}` });
      }
      for (const field of ["videoUrl", "imageUrl", "referenceImageUrl"]) if (/^https?:\/\//i.test(String(item[field] || ""))) jobs.push({ item, field, url: item[field], kind: `${set.slot}-media`, id });
      for (const [gender, variant] of Object.entries(item.videos || {})) for (const field of ["videoUrl", "animeVideoUrl"]) if (/^https?:\/\//i.test(String(variant[field] || ""))) jobs.push({ item: variant, field, url: variant[field], kind: "actions", id: `${id}-${gender}` });
      for (const [gender, variant] of Object.entries(item.thumbnails || {})) for (const field of ["thumbnailUrl", "animeThumbnailUrl"]) if (/^https?:\/\//i.test(String(variant[field] || ""))) jobs.push({ item: variant, field, url: variant[field], kind: "actions", id: `${id}-${gender}` });
    }
  }
  return jobs;
}

async function main() {
  if (mirror) {
    for (const [name, value] of Object.entries(R2)) required(`R2_${name}`, value);
  }
  const library = await fetchOurDreamPresetLibrary({ characterLimit: 100 });
  const jobs = collectMedia(library);
  const unique = [...new Map(jobs.map((job) => [job.url, job])).values()];
  const mirrored = mirror ? await mapConcurrent(unique, async (job) => ({ ...job, localUrl: await mirrorUrl(job.url, job.kind, job.id) })) : unique.map((job) => ({ ...job, localUrl: job.url }));
  const bySource = new Map(mirrored.map((job) => [job.url, job.localUrl]));
  for (const job of jobs) {
    job.item.sourceUrl = job.item.sourceUrl || job.url;
    job.item[job.field] = bySource.get(job.url) || job.localUrl;
  }
  const clean = JSON.parse(JSON.stringify(library));
  function scrub(value) {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) return value.forEach(scrub);
    if (typeof value.remoteImageUrl === "string") value.remoteImageUrl = "";
    for (const child of Object.values(value)) scrub(child);
  }
  scrub(clean);
  clean.source = "OurDream catalog mirrored to this site's R2 bucket";
  clean.generatedAt = new Date().toISOString();
  await fs.writeFile(OUTPUT, `${JSON.stringify(clean, null, 2)}\n`);
  const actionSet = clean.sets.find((set) => set.slot === "action");
  if (actionSet) await fs.writeFile(ACTION_OUTPUT, `${JSON.stringify({ version: 2, source: clean.source, generatedAt: clean.generatedAt, items: actionSet.items }, null, 2)}\n`);
  console.log(`Wrote ${clean.sets.reduce((sum, set) => sum + (set.items || []).length, 0)} presets and mirrored ${bySource.size} media files.`);
}

if (require.main === module) main().catch((error) => { console.error(error.stack || error.message || error); process.exitCode = 1; });

module.exports = { collectMedia, extFor, mirrorUrl };
