#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

function loadLocalEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
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
  listAdminHomeItemsFromDb,
  upsertAdminHomeItemInDb,
} = require("../db");

const OURDREAM_TRPC_BASE = String(process.env.OURDREAM_TRPC_BASE_URL || "https://trpc.svc.ourdream.ai/api/trpc").replace(/\/+$/, "");
const OURDREAM_TYPESENSE_BASE = String(process.env.OURDREAM_TYPESENSE_BASE_URL || "https://0pwc4xvbo6znaj57p.a1.typesense.net").replace(/\/+$/, "");
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const BLOCKED_TAGS = new Set(["underage", "minor", "child", "children", "loli", "lolicon"]);
const MAX_IMAGE_BYTES = Math.max(1024 * 1024, Number(process.env.OURDREAM_IMPORT_MAX_IMAGE_BYTES || 20 * 1024 * 1024));
const MAX_VIDEO_BYTES = Math.max(10 * 1024 * 1024, Number(process.env.OURDREAM_IMPORT_MAX_VIDEO_BYTES || 150 * 1024 * 1024));

const R2 = {
  accessKey: process.env.R2_ACCESS_KEY_ID || process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
  secretKey: process.env.R2_SECRET_ACCESS_KEY || process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
  endpoint: process.env.R2_ENDPOINT || process.env.CLOUDFLARE_R2_ENDPOINT,
  region: process.env.R2_REGION || process.env.CLOUDFLARE_R2_REGION || "auto",
  bucket: process.env.R2_BUCKET || process.env.CLOUDFLARE_R2_BUCKET,
  publicDomain:
    process.env.R2_PUBLIC_BASE_URL
    || process.env.R2_PUBLIC_DOMAIN
    || process.env.CLOUDFLARE_R2_PUBLIC_BASE_URL
    || process.env.CLOUDFLARE_R2_PUBLIC_DOMAIN,
};

function parseArgs(argv = []) {
  const options = {
    apply: false,
    refreshCovers: false,
    limit: 20,
    pages: 20,
    perPage: 100,
    minVideos: 1,
    maxVideos: 4,
    sort: "newest",
    timeframe: "all-time",
    gender: "Female",
    concurrency: 4,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const [name, inlineValue] = arg.split("=", 2);
    const value = inlineValue ?? argv[index + 1];
    if (arg === "--apply") options.apply = true;
    else if (arg === "--refresh-covers") options.refreshCovers = true;
    else if (name === "--limit") {
      options.limit = Number(value);
      if (inlineValue == null) index += 1;
    } else if (name === "--pages") {
      options.pages = Number(value);
      if (inlineValue == null) index += 1;
    } else if (name === "--per-page") {
      options.perPage = Number(value);
      if (inlineValue == null) index += 1;
    } else if (name === "--min-videos") {
      options.minVideos = Number(value);
      if (inlineValue == null) index += 1;
    } else if (name === "--max-videos") {
      options.maxVideos = Number(value);
      if (inlineValue == null) index += 1;
    } else if (name === "--sort") {
      options.sort = String(value || "");
      if (inlineValue == null) index += 1;
    } else if (name === "--timeframe") {
      options.timeframe = String(value || "");
      if (inlineValue == null) index += 1;
    } else if (name === "--gender") {
      options.gender = String(value || "");
      if (inlineValue == null) index += 1;
    } else if (name === "--concurrency") {
      options.concurrency = Number(value);
      if (inlineValue == null) index += 1;
    }
    else if (arg === "--help" || arg === "-h") options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  options.limit = Math.max(1, Math.min(200, Math.trunc(options.limit || 20)));
  options.pages = Math.max(1, Math.min(100, Math.trunc(options.pages || 20)));
  options.perPage = Math.max(1, Math.min(250, Math.trunc(options.perPage || 100)));
  options.minVideos = Math.max(1, Math.min(20, Math.trunc(options.minVideos || 1)));
  options.maxVideos = Math.max(options.minVideos, Math.min(20, Math.trunc(options.maxVideos || 4)));
  options.concurrency = Math.max(1, Math.min(8, Math.trunc(options.concurrency || 4)));
  return options;
}

function printHelp() {
  process.stdout.write([
    "Import new public OurDream characters and their videos into Explore.",
    "",
    "Dry run:",
    "  node scripts/import-ourdream-explore.js --limit 20",
    "",
    "Write media to this site's R2 bucket and rows to app_admin_home_items:",
    "  node scripts/import-ourdream-explore.js --apply --refresh-covers --limit 20",
    "",
    "Options: --refresh-covers --pages 20 --per-page 100 --min-videos 1 --max-videos 4 --sort newest|messages|likes --timeframe all-time|month|week|today --gender Female --concurrency 4",
    "",
  ].join("\n"));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function slugify(value = "") {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
}

function normalizeDate(value) {
  if (!value) return "";
  if (typeof value === "number") {
    const milliseconds = value > 10_000_000_000 ? Math.floor(value / 1000) : value * 1000;
    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString();
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function isVideoUrl(value = "") {
  const url = String(value || "").toLowerCase();
  return url.includes("vid.ourdream.ai") || /\.(?:mp4|webm|mov|m4v)(?:\?|$)/i.test(url);
}

function staticCoverUrl(candidate = {}) {
  // OurDream's character card uses the first non-video displayImageUrl.
  return (Array.isArray(candidate.displayImageUrls) ? candidate.displayImageUrls : [])
    .map((value) => String(value || "").trim())
    .find((value) => value && !isVideoUrl(value)) || "";
}

function imageUrlsFor(candidate = {}) {
  return [...new Set((Array.isArray(candidate.displayImageUrls) ? candidate.displayImageUrls : [])
    .map((value) => String(value || "").trim())
    .filter((value) => value && !isVideoUrl(value)))];
}

function videoUrlsFor(candidate = {}) {
  return [...new Set((Array.isArray(candidate.displayImageUrls) ? candidate.displayImageUrls : [])
    .map((value) => String(value || "").trim())
    .filter((value) => value && isVideoUrl(value)))];
}

function adultCandidateAllowed(candidate = {}) {
  const age = Number(candidate.age || 0);
  if (!Number.isFinite(age) || age < 18) return false;
  const tags = (Array.isArray(candidate.tags) ? candidate.tags : [])
    .map((tag) => String(tag || "").trim().toLowerCase());
  return !tags.some((tag) => BLOCKED_TAGS.has(tag));
}

function searchSort(value = "newest") {
  if (value === "likes") return "like_count:desc";
  if (value === "messages") return "estimated_message_count:desc";
  return "first_approved_at:desc";
}

function searchFilter({ timeframe = "all-time", gender = "Female" } = {}) {
  const filters = ["visibility:=Public"];
  if (gender) filters.push(`gender:=${gender}`);
  if (timeframe && timeframe !== "all-time") {
    const durations = { today: 86_400_000, week: 604_800_000, month: 2_592_000_000 };
    const duration = durations[timeframe];
    if (duration) filters.push(`first_approved_at:>=${(Date.now() - duration) * 1000}`);
  }
  return filters.join(" && ");
}

async function fetchJson(url, options = {}, attempts = 4) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: { "user-agent": USER_AGENT, ...(options.headers || {}) },
        signal: AbortSignal.timeout(30_000),
      });
      const text = await response.text();
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`);
      return JSON.parse(text);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(750 * attempt);
    }
  }
  throw lastError || new Error(`Request failed: ${url}`);
}

async function getTypesenseKey() {
  const payload = await fetchJson(`${OURDREAM_TRPC_BASE}/typesense.getScopedSearchKey`, {
    headers: { "content-type": "application/json" },
  });
  const key = payload?.result?.data?.json?.apiKey;
  if (!key) throw new Error("OurDream did not return a Typesense public API key.");
  return key;
}

function toCandidate(document = {}) {
  return {
    sourceCharacterId: String(document.id || "").trim(),
    sourceDisplayId: String(document.display_id || "").trim(),
    sourceProfileUrl: document.display_id ? `https://ourdream.ai/c/${document.display_id}` : "",
    name: String(document.name || "").trim(),
    title: String(document.short_description || "").trim(),
    description: String(document.short_description || "").trim(),
    displayImageUrls: Array.isArray(document.display_image_urls) ? document.display_image_urls : [],
    tags: Array.isArray(document.tags) ? document.tags : [],
    gender: document.gender || "",
    style: document.style || "",
    model: document.model || "",
    age: document.age ?? null,
    visibility: document.visibility || "",
    estimatedMessageCount: Number(document.estimated_message_count || 0),
    likeCount: Number(document.like_count || 0),
    createdAt: normalizeDate(document.created_at),
    createdByUserId: document.created_by_user_id || "",
    creatorUsername: document.username || "",
    creatorAvatarUrl: document.avatar_url || "",
  };
}

async function searchCharacters({ page, perPage, sort, timeframe, gender, apiKey }) {
  const params = new URLSearchParams({
    q: "*",
    query_by: "name,tags,embed_text",
    query_by_weights: "5,4,5",
    include_fields: [
      "id", "display_id", "name", "short_description", "display_image_urls", "tags", "gender", "style",
      "model", "age", "visibility", "estimated_message_count", "like_count", "created_at", "created_by_user_id",
      "$public_profile(username,avatar_url,strategy:merge)",
    ].join(","),
    highlight_fields: "none",
    highlight_full_fields: "none",
    search_cutoff_ms: "5000",
    enable_lazy_filter: "true",
    per_page: String(perPage),
    page: String(page),
    sort_by: searchSort(sort),
    filter_by: searchFilter({ timeframe, gender }),
  });
  return fetchJson(`${OURDREAM_TYPESENSE_BASE}/collections/character/documents/search?${params}`, {
    headers: { "x-typesense-api-key": apiKey },
  });
}

async function findCandidateBySourceId(sourceCharacterId, apiKey) {
  const sourceId = String(sourceCharacterId || "").trim();
  if (!/^[a-z0-9-]{8,100}$/i.test(sourceId)) return null;
  const params = new URLSearchParams({
    q: "*",
    query_by: "name,tags,embed_text",
    include_fields: [
      "id", "display_id", "name", "short_description", "display_image_urls", "tags", "gender", "style",
      "model", "age", "visibility", "estimated_message_count", "like_count", "created_at", "created_by_user_id",
      "$public_profile(username,avatar_url,strategy:merge)",
    ].join(","),
    highlight_fields: "none",
    per_page: "1",
    page: "1",
    filter_by: `visibility:=Public && id:=${sourceId}`,
  });
  const result = await fetchJson(`${OURDREAM_TYPESENSE_BASE}/collections/character/documents/search?${params}`, {
    headers: { "x-typesense-api-key": apiKey },
  });
  const document = result?.hits?.[0]?.document;
  return document ? toCandidate(document) : null;
}

function existingDedupeSets(items = []) {
  const sourceIds = new Set();
  const displayIds = new Set();
  for (const item of Array.isArray(items) ? items : []) {
    if (item?.sourceCharacterId) sourceIds.add(String(item.sourceCharacterId).trim().toLowerCase());
    if (item?.sourceDisplayId) displayIds.add(String(item.sourceDisplayId).trim().toLowerCase());
  }
  return { sourceIds, displayIds };
}

function candidateAlreadyImported(candidate, existing) {
  const sourceId = String(candidate.sourceCharacterId || "").trim().toLowerCase();
  const displayId = String(candidate.sourceDisplayId || "").trim().toLowerCase();
  return Boolean((sourceId && existing.sourceIds.has(sourceId)) || (displayId && existing.displayIds.has(displayId)));
}

async function collectCandidates(options, existingItems = []) {
  const apiKey = await getTypesenseKey();
  const existing = existingDedupeSets(existingItems);
  const selected = [];
  const seen = existingDedupeSets([]);
  const rejected = { duplicate: 0, adult: 0, cover: 0, videos: 0 };
  for (let page = 1; page <= options.pages && selected.length < options.limit; page += 1) {
    const result = await searchCharacters({ ...options, page, apiKey });
    const hits = Array.isArray(result.hits) ? result.hits : [];
    for (const hit of hits) {
      const candidate = toCandidate(hit.document || {});
      if (candidateAlreadyImported(candidate, existing) || candidateAlreadyImported(candidate, seen)) {
        rejected.duplicate += 1;
        continue;
      }
      if (!adultCandidateAllowed(candidate)) {
        rejected.adult += 1;
        continue;
      }
      if (!staticCoverUrl(candidate)) {
        rejected.cover += 1;
        continue;
      }
      const videos = videoUrlsFor(candidate);
      if (videos.length < options.minVideos) {
        rejected.videos += 1;
        continue;
      }
      selected.push({
        ...candidate,
        coverSourceUrl: staticCoverUrl(candidate),
        imageSourceUrls: imageUrlsFor(candidate),
        videoSourceUrls: videos.slice(0, options.maxVideos),
      });
      if (candidate.sourceCharacterId) seen.sourceIds.add(candidate.sourceCharacterId.toLowerCase());
      if (candidate.sourceDisplayId) seen.displayIds.add(candidate.sourceDisplayId.toLowerCase());
      if (selected.length >= options.limit) break;
    }
    process.stdout.write(`[collect] page=${page} hits=${hits.length} selected=${selected.length} found=${Number(result.found || 0)}\n`);
    if (!hits.length) break;
  }
  return { selected, rejected };
}

function requireR2() {
  for (const [label, value] of [
    ["R2_ACCESS_KEY_ID", R2.accessKey],
    ["R2_SECRET_ACCESS_KEY", R2.secretKey],
    ["R2_ENDPOINT", R2.endpoint],
    ["R2_BUCKET", R2.bucket],
    ["R2_PUBLIC_BASE_URL", R2.publicDomain],
  ]) {
    if (!value) throw new Error(`Missing ${label}`);
  }
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

function encodePathname(input = "") {
  return input.split("/").map((part) => encodeURIComponent(part)).join("/");
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
  const scope = `${date}/${R2.region}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", xDate, scope, sha256Hex(canonicalRequest)].join("\n");
  const signature = hmac(signAwsKey(R2.secretKey, date, R2.region, "s3"), stringToSign, "hex");
  return {
    url: `${endpoint.protocol}//${endpoint.host}${canonicalUri}`,
    headers: {
      ...headers,
      authorization: `AWS4-HMAC-SHA256 Credential=${R2.accessKey}/${scope},SignedHeaders=${signedHeaders},Signature=${signature}`,
    },
  };
}

function extensionForMime(mime = "", sourceUrl = "") {
  const normalized = String(mime || "").split(";")[0].trim().toLowerCase();
  const byMime = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "video/quicktime": ".mov",
  };
  if (byMime[normalized]) return byMime[normalized];
  const match = String(sourceUrl || "").split("?")[0].match(/\.(jpe?g|png|webp|gif|mp4|webm|mov)$/i);
  if (!match) return normalized.startsWith("video/") ? ".mp4" : ".jpg";
  return match[1].toLowerCase() === "jpeg" ? ".jpg" : `.${match[1].toLowerCase()}`;
}

async function fetchMedia(sourceUrl, kind, attempts = 4) {
  let lastError = null;
  const maxBytes = kind === "video" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(sourceUrl, {
        redirect: "follow",
        headers: { "user-agent": USER_AGENT },
        signal: AbortSignal.timeout(kind === "video" ? 180_000 : 60_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const declaredLength = Number(response.headers.get("content-length") || 0);
      if (declaredLength > maxBytes) throw new Error(`${kind} exceeds ${maxBytes} bytes`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!bytes.length || bytes.length > maxBytes) throw new Error(`${kind} has invalid size ${bytes.length}`);
      const mime = String(response.headers.get("content-type") || (kind === "video" ? "video/mp4" : "image/jpeg")).split(";")[0];
      if (kind === "image" && !mime.startsWith("image/")) throw new Error(`Expected image but received ${mime}`);
      if (kind === "video" && !mime.startsWith("video/") && mime !== "application/octet-stream") {
        throw new Error(`Expected video but received ${mime}`);
      }
      return { bytes, mime, extension: extensionForMime(mime, sourceUrl) };
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(1000 * attempt);
    }
  }
  throw new Error(`Failed to download ${kind} ${sourceUrl}: ${lastError?.message || lastError}`);
}

async function uploadMedia(sourceUrl, keyWithoutExtension, kind) {
  const media = await fetchMedia(sourceUrl, kind);
  const key = `${keyWithoutExtension}${media.extension}`;
  let lastError = null;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const auth = makeR2Auth({ method: "PUT", key, body: media.bytes, contentType: media.mime });
      const response = await fetch(auth.url, {
        method: "PUT",
        headers: auth.headers,
        body: media.bytes,
        signal: AbortSignal.timeout(240_000),
      });
      const text = await response.text();
      if (!response.ok) {
        const error = new Error(`R2 upload failed for ${key}: ${response.status} ${text.slice(0, 300)}`);
        error.retryable = response.status === 429 || response.status >= 500;
        throw error;
      }
      return {
        key,
        publicUrl: `${String(R2.publicDomain).replace(/\/+$/, "")}/${key}`,
        bytes: media.bytes.length,
        mime: media.mime,
      };
    } catch (error) {
      lastError = error;
      if (attempt >= 5 || error.retryable === false) break;
      await sleep(Math.min(10_000, 1000 * 2 ** (attempt - 1)));
    }
  }
  throw lastError || new Error(`R2 upload failed for ${key}`);
}

function itemIdForCandidate(candidate = {}) {
  const slug = slugify(candidate.sourceDisplayId || candidate.name || candidate.sourceCharacterId) || "character";
  const suffix = slugify(candidate.sourceCharacterId).slice(0, 8) || sha256Hex(candidate.sourceProfileUrl || slug).slice(0, 8);
  return `ourdream-${slug}-${suffix}`.slice(0, 120);
}

function buildVideoEntry(candidate, itemId, index, videoUrl, posterUrl) {
  const sceneId = `od-${slugify(candidate.sourceCharacterId).slice(0, 8) || sha256Hex(itemId).slice(0, 8)}-${String(index + 1).padStart(2, "0")}`;
  return {
    sceneId,
    sceneEntryId: "default",
    sceneName: "Featured video",
    sceneEntryName: `Clip ${index + 1}`,
    title: `${candidate.name || "OurDream character"} Clip ${index + 1}`,
    posterUrl,
    cdnPosterUrl: posterUrl,
    localPosterUrl: posterUrl,
    coverUrl: posterUrl,
    thumbnailUrl: posterUrl,
    videoUrl,
    cdnVideoUrl: videoUrl,
    localVideoUrl: videoUrl,
    taskId: `ourdream-import-${candidate.sourceCharacterId || itemId}-${index + 1}`,
    status: "succeeded",
    provider: "ourdream",
    ratio: "public",
    resolution: "public",
    duration: 0,
    likes: null,
    createdAt: candidate.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    source: "ourdream-import",
    shouldBlur: false,
  };
}

function buildExploreItem(candidate, media = {}) {
  const now = new Date().toISOString();
  const itemId = itemIdForCandidate(candidate);
  const videoEntries = (media.videoUrls || []).map((url, index) => buildVideoEntry(
    candidate,
    itemId,
    index,
    url,
    media.posterUrls?.[index] || media.coverUrl,
  ));
  const homeSceneVideos = {};
  const unlockVideos = {};
  if (videoEntries[0]) homeSceneVideos[videoEntries[0].sceneId] = videoEntries[0];
  for (const entry of videoEntries.slice(1)) unlockVideos[entry.sceneId] = entry;
  return {
    id: itemId,
    source: "ourdream-import",
    sourceCharacterId: candidate.sourceCharacterId,
    sourceDisplayId: candidate.sourceDisplayId,
    sourceProfileUrl: candidate.sourceProfileUrl,
    name: candidate.name,
    title: candidate.title || "Featured creator role",
    description: candidate.description || "A curated public character profile with showcase clips.",
    posterUrl: media.coverUrl,
    thumbnailUrl: media.coverUrl,
    localImageUrl: media.coverUrl,
    sourceImageUrl: media.coverUrl,
    publicImageUrl: media.coverUrl,
    cdnImageUrl: media.coverUrl,
    cdnPosterUrl: media.coverUrl,
    videoUrl: media.videoUrls?.[0] || "",
    localVideoUrl: media.videoUrls?.[0] || "",
    cdnVideoUrl: media.videoUrls?.[0] || "",
    taskId: `ourdream-import-${candidate.sourceCharacterId || itemId}`,
    status: "succeeded",
    referenceState: "missing",
    provider: "ourdream",
    createdAt: candidate.createdAt || now,
    updatedAt: now,
    age: candidate.age,
    gender: candidate.gender,
    style: candidate.style,
    model: candidate.model,
    tags: candidate.tags || [],
    likeCount: candidate.likeCount || 0,
    estimatedMessageCount: candidate.estimatedMessageCount || 0,
    creatorUsername: candidate.creatorUsername || "",
    creatorAvatarUrl: candidate.creatorAvatarUrl || "",
    videoCount: videoEntries.length,
    homeSceneVideos,
    sceneVideos: {},
    unlockVideos,
  };
}

async function importCandidate(candidate) {
  const slug = slugify(candidate.sourceDisplayId || candidate.name || candidate.sourceCharacterId) || sha256Hex(candidate.sourceCharacterId).slice(0, 12);
  const baseKey = `assets/ourdream/characters/${slug}`;
  const cover = await uploadMedia(candidate.coverSourceUrl, `${baseKey}/cover`, "image");
  const posterUrls = [];
  for (let index = 0; index < candidate.videoSourceUrls.length; index += 1) {
    const posterSource = candidate.imageSourceUrls[index] || candidate.coverSourceUrl;
    if (posterSource === candidate.coverSourceUrl) {
      posterUrls.push(cover.publicUrl);
    } else {
      const poster = await uploadMedia(posterSource, `${baseKey}/poster-${String(index + 1).padStart(2, "0")}`, "image");
      posterUrls.push(poster.publicUrl);
    }
  }
  const videoUrls = [];
  for (let index = 0; index < candidate.videoSourceUrls.length; index += 1) {
    const video = await uploadMedia(candidate.videoSourceUrls[index], `${baseKey}/video-${String(index + 1).padStart(2, "0")}`, "video");
    videoUrls.push(video.publicUrl);
  }
  const item = buildExploreItem(candidate, { coverUrl: cover.publicUrl, posterUrls, videoUrls });
  await upsertAdminHomeItemInDb(item);
  return item;
}

async function refreshExistingCover(item, apiKey, apply) {
  if (!item?.sourceCharacterId) return { status: "missing-source-id", id: item?.id || "" };
  const candidate = await findCandidateBySourceId(item.sourceCharacterId, apiKey);
  if (!candidate) return { status: "source-not-found", id: item.id, name: item.name || "" };
  const coverSourceUrl = staticCoverUrl(candidate);
  if (!coverSourceUrl) return { status: "cover-not-found", id: item.id, name: item.name || "" };
  if (!apply) return { status: "would-refresh", id: item.id, name: item.name || candidate.name, coverSourceUrl };
  const slug = slugify(item.sourceDisplayId || candidate.sourceDisplayId || item.name || item.sourceCharacterId)
    || sha256Hex(item.sourceCharacterId).slice(0, 12);
  const cover = await uploadMedia(coverSourceUrl, `assets/ourdream/characters/${slug}/cover`, "image");
  const now = new Date().toISOString();
  const updated = {
    ...item,
    posterUrl: cover.publicUrl,
    thumbnailUrl: cover.publicUrl,
    localImageUrl: cover.publicUrl,
    sourceImageUrl: cover.publicUrl,
    publicImageUrl: cover.publicUrl,
    cdnImageUrl: cover.publicUrl,
    cdnPosterUrl: cover.publicUrl,
    coverSourceUrl,
    coverRefreshedAt: now,
    updatedAt: now,
  };
  await upsertAdminHomeItemInDb(updated);
  return { status: "refreshed", id: item.id, name: updated.name || candidate.name, coverUrl: cover.publicUrl };
}

async function refreshExistingCovers(items, options) {
  const candidates = (Array.isArray(items) ? items : []).filter((item) => (
    item
    && !item.deletedAt
    && String(item.source || "").trim().toLowerCase() === "ourdream-import"
  ));
  if (!candidates.length) return { total: 0, results: [] };
  const apiKey = await getTypesenseKey();
  const results = new Array(candidates.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(options.concurrency, candidates.length) }, async () => {
    while (cursor < candidates.length) {
      const index = cursor;
      cursor += 1;
      const item = candidates[index];
      try {
        results[index] = await refreshExistingCover(item, apiKey, options.apply);
        process.stdout.write(`[cover] ${index + 1}/${candidates.length} ${item.name || item.id} ${results[index].status}\n`);
      } catch (error) {
        results[index] = { status: "failed", id: item.id, name: item.name || "", error: error.message || String(error) };
        process.stderr.write(`[cover-failed] ${item.name || item.id}: ${error.message || error}\n`);
      }
    }
  });
  await Promise.all(workers);
  return { total: candidates.length, results };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) return printHelp();
  if (options.apply) {
    requireR2();
    if (!dbEnabled()) throw new Error("DATABASE_URL is required with --apply.");
    await ensureSchema();
  }
  const existingItems = dbEnabled() ? await listAdminHomeItemsFromDb({ includeDeleted: true }) : [];
  if (options.refreshCovers) {
    const coverResult = await refreshExistingCovers(existingItems || [], options);
    const coverSummary = coverResult.results.reduce((summary, item) => {
      summary[item.status] = (summary[item.status] || 0) + 1;
      return summary;
    }, {});
    process.stdout.write(`[cover-summary] total=${coverResult.total} ${JSON.stringify(coverSummary)}\n`);
  }
  const result = await collectCandidates(options, existingItems || []);
  process.stdout.write(`[candidates] selected=${result.selected.length} rejected=${JSON.stringify(result.rejected)}\n`);
  if (!result.selected.length) throw new Error("No new OurDream characters with the requested video count were found.");
  if (!options.apply) {
    process.stdout.write(`${JSON.stringify(result.selected.map((candidate) => ({
      sourceCharacterId: candidate.sourceCharacterId,
      sourceDisplayId: candidate.sourceDisplayId,
      name: candidate.name,
      age: candidate.age,
      coverSourceUrl: candidate.coverSourceUrl,
      videoCount: candidate.videoSourceUrls.length,
    })), null, 2)}\n`);
    process.stdout.write("[dry-run] No media uploaded and no database rows written. Add --apply to import.\n");
    return;
  }
  const imported = [];
  const failed = [];
  for (const [index, candidate] of result.selected.entries()) {
    try {
      process.stdout.write(`[import] ${index + 1}/${result.selected.length} ${candidate.name} (${candidate.videoSourceUrls.length} videos)\n`);
      const item = await importCandidate(candidate);
      imported.push({ id: item.id, name: item.name, videoCount: item.videoCount });
      process.stdout.write(`[imported] ${item.id}\n`);
    } catch (error) {
      failed.push({ sourceCharacterId: candidate.sourceCharacterId, name: candidate.name, error: error.message || String(error) });
      process.stderr.write(`[failed] ${candidate.name}: ${error.message || error}\n`);
    }
  }
  process.stdout.write(`${JSON.stringify({ imported, failed }, null, 2)}\n`);
  if (failed.length) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
  });
}

module.exports = {
  adultCandidateAllowed,
  buildExploreItem,
  imageUrlsFor,
  isVideoUrl,
  itemIdForCandidate,
  parseArgs,
  refreshExistingCover,
  staticCoverUrl,
  videoUrlsFor,
};
