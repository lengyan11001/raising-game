const crypto = require("node:crypto");
const fsSync = require("node:fs");
const fs = require("node:fs/promises");
const path = require("node:path");
const { URL } = require("node:url");

const ROOT = path.resolve(__dirname, "..");

function loadLocalEnv(filePath) {
  if (!fsSync.existsSync(filePath)) return;
  const lines = fsSync.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index < 1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadLocalEnv(path.join(ROOT, ".env.local"));

const {
  dbEnabled,
  ensureSchema,
  query,
  getKv,
  setKv,
} = require("../db");

const R2 = {
  accessKey: process.env.R2_ACCESS_KEY_ID || process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
  secretKey: process.env.R2_SECRET_ACCESS_KEY || process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
  endpoint: process.env.R2_ENDPOINT || process.env.CLOUDFLARE_R2_ENDPOINT,
  region: process.env.R2_REGION || process.env.CLOUDFLARE_R2_REGION || "auto",
  bucket: process.env.R2_BUCKET || process.env.CLOUDFLARE_R2_BUCKET,
  publicDomain:
    process.env.R2_PUBLIC_BASE_URL ||
    process.env.R2_PUBLIC_DOMAIN ||
    process.env.CLOUDFLARE_R2_PUBLIC_BASE_URL ||
    process.env.CLOUDFLARE_R2_PUBLIC_DOMAIN,
};

const dryRun = process.argv.includes("--dry-run");
const uploadAllAssets = process.argv.includes("--all-assets");
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const maxUploads = limitArg ? Math.max(0, Number(limitArg.split("=")[1]) || 0) : 0;
const concurrencyArg = process.argv.find((arg) => arg.startsWith("--concurrency="));
const uploadConcurrency = Math.max(1, Math.min(32, concurrencyArg ? Number(concurrencyArg.split("=")[1]) || 8 : 8));
const uploadCache = new Map();
let uploadCount = 0;

const mimeTypes = new Map([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".gif", "image/gif"],
  [".bmp", "image/bmp"],
  [".svg", "image/svg+xml"],
  [".mp4", "video/mp4"],
  [".webm", "video/webm"],
  [".mov", "video/quicktime"],
  [".m4v", "video/x-m4v"],
  [".mp3", "audio/mpeg"],
  [".wav", "audio/wav"],
  [".m4a", "audio/mp4"],
  [".aac", "audio/aac"],
  [".ogg", "audio/ogg"],
]);

function required(label, value) {
  if (!value) throw new Error(`Missing ${label}`);
}

function sha256Hex(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function hmac(key, data, encoding) {
  return crypto.createHmac("sha256", key).update(data).digest(encoding);
}

function signAwsKey(secret, date, region, service) {
  return hmac(hmac(hmac(hmac(`AWS4${secret}`, date), region), service), "aws4_request");
}

function amzDate() {
  const value = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { xDate: value, date: value.slice(0, 8) };
}

function storagePathSegment(value = "", fallback = "asset") {
  return String(value || fallback)
    .trim()
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 128) || fallback;
}

function encodePathname(input) {
  return input.split("/").map((part) => encodeURIComponent(part)).join("/");
}

function localAssetMirrorKey(localUrl = "") {
  const value = String(localUrl || "").trim().split("?")[0];
  if (!value.startsWith("/assets/")) return "";
  return value.replace(/^\/+/, "").split("/").map((part) => storagePathSegment(decodeURIComponent(part), "asset")).join("/");
}

function localPathFromAssetUrl(value = "") {
  const text = String(value || "").trim();
  if (!text || !text.startsWith("/assets/")) return "";
  const pathname = text.split("?")[0].replace(/^\/+/, "");
  const filePath = path.normalize(path.join(ROOT, pathname));
  const assetsRoot = path.normalize(path.join(ROOT, "assets"));
  if (!filePath.startsWith(assetsRoot)) return "";
  return filePath;
}

function publicUrlForKey(key = "") {
  return `${String(R2.publicDomain || "").replace(/\/+$/, "")}/${key}`;
}

function makeR2Auth({ method, key, body, contentType }) {
  const endpoint = new URL(/^https?:\/\//i.test(R2.endpoint) ? R2.endpoint : `https://${R2.endpoint}`);
  const { xDate, date } = amzDate();
  const payloadHash = sha256Hex(body);
  const canonicalUri = `/${encodeURIComponent(R2.bucket)}/${encodePathname(key)}`;
  const headers = {
    "content-type": contentType,
    host: endpoint.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": xDate,
  };
  const sortedKeys = Object.keys(headers).sort();
  const signedHeaders = sortedKeys.join(";");
  const canonicalHeaders = sortedKeys.map((header) => `${header}:${headers[header]}\n`).join("");
  const canonicalRequest = [method, canonicalUri, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = `${date}/${R2.region || "auto"}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", xDate, scope, sha256Hex(canonicalRequest)].join("\n");
  const signature = hmac(signAwsKey(R2.secretKey, date, R2.region || "auto", "s3"), stringToSign, "hex");
  return {
    url: `${endpoint.protocol}//${endpoint.host}${canonicalUri}`,
    headers: {
      ...headers,
      authorization: `AWS4-HMAC-SHA256 Credential=${R2.accessKey}/${scope},SignedHeaders=${signedHeaders},Signature=${signature}`,
    },
  };
}

async function remoteObjectExists(publicUrl = "") {
  if (!publicUrl || dryRun) return false;
  try {
    const response = await fetch(publicUrl, { method: "HEAD" });
    return response.ok;
  } catch {
    return false;
  }
}

async function uploadLocalAsset(localUrl = "", options = {}) {
  const cleanUrl = String(localUrl || "").split("?")[0];
  if (!cleanUrl.startsWith("/assets/")) return "";
  if (uploadCache.has(cleanUrl)) return uploadCache.get(cleanUrl);
  if (maxUploads && uploadCount >= maxUploads) return "";

  const key = localAssetMirrorKey(cleanUrl);
  const filePath = localPathFromAssetUrl(cleanUrl);
  if (!key || !filePath) return "";
  try {
    await fs.access(filePath);
  } catch {
    console.warn("[missing]", cleanUrl);
    return "";
  }

  const publicUrl = publicUrlForKey(key);
  if (options.skipExisting && await remoteObjectExists(publicUrl)) {
    uploadCache.set(cleanUrl, publicUrl);
    console.log(`[exists] ${cleanUrl} -> ${publicUrl}`);
    return publicUrl;
  }
  if (!dryRun) {
    const bytes = await fs.readFile(filePath);
    const mime = mimeTypes.get(path.extname(filePath).toLowerCase()) || "application/octet-stream";
    const auth = makeR2Auth({ method: "PUT", key, body: bytes, contentType: mime });
    const response = await fetch(auth.url, { method: "PUT", headers: auth.headers, body: bytes });
    const text = await response.text();
    if (!response.ok) throw new Error(`R2 upload failed for ${cleanUrl}: ${response.status} ${text}`);
  }
  uploadCount += 1;
  uploadCache.set(cleanUrl, publicUrl);
  console.log(`${dryRun ? "[dry-run]" : "[uploaded]"} ${cleanUrl} -> ${publicUrl}`);
  return publicUrl;
}

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

async function patchMediaObject(obj) {
  if (!isObject(obj)) return false;
  let changed = false;

  const localUrl = String(obj.localUrl || "").trim();
  if (localUrl.startsWith("/assets/")) {
    const publicUrl = await uploadLocalAsset(localUrl);
    if (publicUrl && obj.publicUrl !== publicUrl) {
      obj.publicUrl = publicUrl;
      obj.cdnUrl = publicUrl;
      changed = true;
    }
  }

  const videoSource = String(obj.localVideoUrl || "").trim();
  if (videoSource.startsWith("/assets/")) {
    const publicUrl = await uploadLocalAsset(videoSource);
    if (publicUrl && obj.cdnVideoUrl !== publicUrl) {
      obj.cdnVideoUrl = publicUrl;
      changed = true;
    }
  }

  const imageSource = String(obj.localImageUrl || obj.syntheticReferenceLocalUrl || "").trim();
  if (imageSource.startsWith("/assets/")) {
    const publicUrl = await uploadLocalAsset(imageSource);
    if (publicUrl && obj.cdnImageUrl !== publicUrl) {
      obj.cdnImageUrl = publicUrl;
      changed = true;
    }
    if (publicUrl && !String(obj.publicImageUrl || "").startsWith("http")) {
      obj.publicImageUrl = publicUrl;
      changed = true;
    }
  }

  const posterSource = String(obj.localPosterUrl || obj.posterUrl || obj.coverUrl || obj.thumbnailUrl || "").trim();
  if (posterSource.startsWith("/assets/")) {
    const publicUrl = await uploadLocalAsset(posterSource);
    if (publicUrl && obj.cdnPosterUrl !== publicUrl) {
      obj.cdnPosterUrl = publicUrl;
      changed = true;
    }
  }

  for (const value of Object.values(obj)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (await patchMediaObject(item)) changed = true;
      }
    } else if (isObject(value)) {
      if (await patchMediaObject(value)) changed = true;
    }
  }
  return changed;
}

async function migrateAppConfig() {
  const config = await getKv("app_config", {});
  const changed = await patchMediaObject(config);
  if (changed && !dryRun) await setKv("app_config", config);
  return changed ? 1 : 0;
}

async function migrateCharacterAssetsKv() {
  const assets = await getKv("character_assets", {});
  const changed = await patchMediaObject(assets);
  if (changed && !dryRun) await setKv("character_assets", assets);
  return changed ? 1 : 0;
}

async function migrateDbPayloadTable(table, idColumn = "id") {
  const { rows } = await query(`SELECT ${idColumn} AS id, payload FROM ${table}`);
  let changedCount = 0;
  for (const row of rows) {
    const payload = row.payload || {};
    if (!(await patchMediaObject(payload))) continue;
    changedCount += 1;
    if (!dryRun) {
      await query(`UPDATE ${table} SET payload = $2::jsonb, updated_at = NOW() WHERE ${idColumn} = $1`, [
        row.id,
        JSON.stringify(payload),
      ]);
    }
  }
  return changedCount;
}

async function walkFiles(dirPath) {
  const out = [];
  let entries = [];
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      out.push(...await walkFiles(fullPath));
    } else if (entry.isFile()) {
      out.push(fullPath);
    }
  }
  return out.sort();
}

async function uploadAllStaticAssets() {
  const assetsRoot = path.join(ROOT, "assets");
  const files = await walkFiles(assetsRoot);
  let changedCount = 0;
  let cursor = 0;
  const workers = Array.from({ length: Math.min(uploadConcurrency, Math.max(files.length, 1)) }, async () => {
    while (cursor < files.length) {
      const filePath = files[cursor];
      cursor += 1;
      const relative = path.relative(ROOT, filePath).split(path.sep).join("/");
      if (!relative.startsWith("assets/")) continue;
      const publicUrl = await uploadLocalAsset(`/${relative}`, { skipExisting: true });
      if (publicUrl) changedCount += 1;
    }
  });
  await Promise.all(workers);
  return changedCount;
}

async function main() {
  required("R2_ACCESS_KEY_ID", R2.accessKey);
  required("R2_SECRET_ACCESS_KEY", R2.secretKey);
  required("R2_ENDPOINT", R2.endpoint);
  required("R2_BUCKET", R2.bucket);
  required("R2_PUBLIC_BASE_URL", R2.publicDomain);
  if (!dbEnabled()) throw new Error("DATABASE_URL is required. Media URL migration updates database records only.");

  const summary = { appConfig: 0, characterAssets: 0, userAssets: 0, userCharacters: 0, adminHomeItems: 0, generationRecords: 0, staticAssets: 0, uploads: 0 };
  await ensureSchema();
  if (uploadAllAssets) summary.staticAssets = await uploadAllStaticAssets();
  summary.appConfig = await migrateAppConfig();
  summary.characterAssets = await migrateCharacterAssetsKv();
  summary.userAssets = await migrateDbPayloadTable("app_user_assets");
  summary.userCharacters = await migrateDbPayloadTable("app_user_characters");
  summary.adminHomeItems = await migrateDbPayloadTable("app_admin_home_items");
  summary.generationRecords = await migrateDbPayloadTable("app_generation_records", "task_id");
  summary.uploads = uploadCount;
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
