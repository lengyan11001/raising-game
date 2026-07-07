#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { buildRegistry, buildDedupeKeys } = require("./ourdream-character-registry");

const ROOT = path.resolve(__dirname, "..");
const HOME_ITEMS_PATH = path.join(ROOT, "assets", "ourdream", "home-items.json");
const REGISTRY_PATH = path.join(ROOT, "assets", "ourdream", "imported-character-registry.json");
const CANDIDATES_PATH = path.join(ROOT, "assets", "ourdream", "next-candidates.json");
const FILTERED_PATH = path.join(ROOT, "assets", "ourdream", "next-candidates-filtered.json");
const OUT_DIR = path.join(ROOT, "assets", "ourdream", "characters");

const TYPESENSE_BASE = "https://0pwc4xvbo6znaj57p.a1.typesense.net";
const TYPESENSE_KEY_URL = "https://ourdream.ai/api/trpc/typesense.getScopedSearchKey";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const BLOCKED_TAGS = new Set(["teen", "underage", "young teen", "loli", "schoolgirl"]);

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--limit") args.limit = Number(argv[++i]);
    else if (arg === "--pages") args.pages = Number(argv[++i]);
    else if (arg === "--per-page") args.perPage = Number(argv[++i]);
    else if (arg === "--collect-only") args.collectOnly = true;
    else if (arg === "--download") args.download = true;
  else if (arg === "--sort") args.sort = argv[++i];
  else if (arg === "--timeframe") args.timeframe = argv[++i];
  else if (arg === "--append") args.append = true;
    else args._.push(arg);
  }
  return args;
}

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function slugify(value) {
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
    const ms = value > 10_000_000_000 ? Math.floor(value / 1000) : value * 1000;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString();
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function sourceUrlToFileExt(url, fallback = ".bin") {
  const clean = String(url || "").split("?")[0].toLowerCase();
  if (clean.endsWith(".jpg") || clean.endsWith(".jpeg")) return ".jpg";
  if (clean.endsWith(".png")) return ".png";
  if (clean.endsWith(".webp")) return ".webp";
  if (clean.endsWith(".gif")) return ".gif";
  if (clean.includes("vid.ourdream.ai")) return ".mp4";
  if (clean.includes("img.ourdream.ai")) return ".jpg";
  return fallback;
}

function isBlocked(candidate) {
  const age = Number(candidate.age || 0);
  if (age && age < 18) return true;
  const tags = (candidate.tags || []).map((tag) => String(tag || "").trim().toLowerCase());
  return tags.some((tag) => BLOCKED_TAGS.has(tag));
}

function mediaKind(url) {
  const text = String(url || "");
  if (/\/\/vid\.ourdream\.ai\//i.test(text)) return "video";
  if (/\/\/(?:img|media|r2-images)\.ourdream\.ai\//i.test(text)) return "image";
  return "";
}

function videoUrlsFor(candidate) {
  return [...new Set((candidate.displayImageUrls || []).filter((url) => mediaKind(url) === "video"))];
}

function imageUrlsFor(candidate) {
  return [...new Set((candidate.displayImageUrls || []).filter((url) => mediaKind(url) === "image"))];
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "user-agent": USER_AGENT,
      "content-type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}: ${text.slice(0, 500)}`);
  }
  return JSON.parse(text);
}

async function fetchWithRetry(url, options = {}, attempts = 5) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 120_000);
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          "user-agent": USER_AGENT,
          ...(options.headers || {}),
        },
      });
      clearTimeout(timeout);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response;
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;
      if (attempt === attempts) break;
      const waitMs = Math.min(20_000, 1_500 * attempt);
      process.stdout.write(`[retry] ${attempt}/${attempts} ${url} (${error.message || error})\n`);
      await sleep(waitMs);
    }
  }
  throw lastError || new Error(`Fetch failed: ${url}`);
}

async function getTypesenseKey() {
  const json = await fetchJson(TYPESENSE_KEY_URL, {
    headers: { cookie: "AdultContentAcceptedOD=true; contentWarningActionTaken=true" },
  });
  const apiKey = json?.result?.data?.json?.apiKey;
  if (!apiKey) throw new Error("Unable to read Typesense public key");
  return apiKey;
}

function searchSort(sort, timeframe) {
  if (sort === "newest") return "first_approved_at:desc";
  if (sort === "messages") return "estimated_message_count:desc";
  if (sort === "likes") return "like_count:desc";
  if (sort === "top") return timeframe === "month" ? "estimated_message_count:desc" : "estimated_message_count:desc";
  return sort || "estimated_message_count:desc";
}

function searchFilter(timeframe) {
  const filters = ["visibility:Public", "gender:=Female"];
  if (timeframe && timeframe !== "all-time") {
    const now = Date.now();
    const ms = timeframe === "today" ? 86_400_000 : timeframe === "week" ? 604_800_000 : 2_592_000_000;
    filters.push(`first_approved_at:>=${(now - ms) * 1000}`);
  }
  return filters.join(" && ");
}

async function searchCharacters({ page, perPage, sort, timeframe, apiKey }) {
  const params = new URLSearchParams({
    q: "*",
    query_by: "name,tags,embed_text",
    query_by_weights: "5,4,5",
    include_fields: [
      "id",
      "display_id",
      "name",
      "short_description",
      "display_image_urls",
      "tags",
      "gender",
      "style",
      "model",
      "age",
      "visibility",
      "estimated_message_count",
      "like_count",
      "created_at",
      "created_by_user_id",
      "$public_profile(username,avatar_url,strategy:merge)",
    ].join(","),
    highlight_fields: "none",
    highlight_full_fields: "none",
    search_cutoff_ms: "5000",
    enable_lazy_filter: "true",
    per_page: String(perPage),
    page: String(page),
    sort_by: searchSort(sort, timeframe),
    filter_by: searchFilter(timeframe),
  });
  const url = `${TYPESENSE_BASE}/collections/character/documents/search?${params.toString()}`;
  const json = await fetchJson(url, { headers: { "x-typesense-api-key": apiKey } });
  return {
    found: json.found || 0,
    hits: (json.hits || []).map((hit) => hit.document || {}),
  };
}

function toCandidate(document) {
  return {
    sourceCharacterId: document.id || "",
    sourceDisplayId: document.display_id || "",
    name: document.name || "",
    title: document.short_description || "",
    description: document.short_description || "",
    displayImageUrls: Array.isArray(document.display_image_urls) ? document.display_image_urls : [],
    tags: Array.isArray(document.tags) ? document.tags : [],
    gender: document.gender || "",
    style: document.style || "",
    model: document.model || "",
    age: document.age || null,
    visibility: document.visibility || "",
    estimatedMessageCount: document.estimated_message_count || 0,
    likeCount: document.like_count || 0,
    createdAt: normalizeDate(document.created_at),
    createdByUserId: document.created_by_user_id || "",
    creatorUsername: document.username || "",
    creatorAvatarUrl: document.avatar_url || "",
  };
}

function registryKeySet(registry) {
  return new Set((registry.characters || []).flatMap((character) => character.dedupeKeys || []));
}

function filterCandidatePool(pool, registry, limit) {
  const known = registryKeySet(registry);
  const seen = new Set();
  const unique = [];
  const rejected = [];
  for (const candidate of pool) {
    const dedupeKeys = buildDedupeKeys({
      ...candidate,
      sourceCharacterId: candidate.sourceCharacterId,
      sourceDisplayId: candidate.sourceDisplayId,
      sourceProfileUrl: candidate.sourceDisplayId ? `https://ourdream.ai/c/${candidate.sourceDisplayId}` : "",
    });
    const matchedKeys = dedupeKeys.filter((key) => known.has(key) || seen.has(key));
    const videos = videoUrlsFor(candidate);
    const images = imageUrlsFor(candidate);
    const reason = matchedKeys.length
      ? "duplicate"
      : isBlocked(candidate)
        ? "blocked-age-or-tag"
        : videos.length < 4
          ? "not-enough-videos"
          : images.length < 1
            ? "missing-cover-image"
            : "";
    if (reason) {
      rejected.push({ reason, matchedKeys, candidate });
      continue;
    }
    dedupeKeys.forEach((key) => seen.add(key));
    unique.push({ ...candidate, dedupeKeys, videoUrls: videos.slice(0, 4), imageUrls: images });
    if (unique.length >= limit) break;
  }
  return { unique, rejected };
}

async function collectCandidates(options) {
  const apiKey = await getTypesenseKey();
  const previousPool = options.append ? readJson(CANDIDATES_PATH, []) : [];
  const pool = [...previousPool];
  const seenSourceIds = new Set(pool.map((candidate) => candidate.sourceCharacterId || candidate.id).filter(Boolean));
  for (let page = 1; page <= options.pages; page += 1) {
    const result = await searchCharacters({ page, perPage: options.perPage, sort: options.sort, timeframe: options.timeframe, apiKey });
    for (const candidate of result.hits.map(toCandidate)) {
      const key = candidate.sourceCharacterId || candidate.sourceDisplayId;
      if (key && seenSourceIds.has(key)) continue;
      if (key) seenSourceIds.add(key);
      pool.push(candidate);
    }
    process.stdout.write(`[collect] page ${page}, hits ${result.hits.length}, pool ${pool.length}, found ${result.found}\n`);
    if (result.hits.length === 0) break;
    await sleep(150);
  }
  const registry = fs.existsSync(REGISTRY_PATH) ? readJson(REGISTRY_PATH) : buildRegistry(HOME_ITEMS_PATH);
  const filtered = filterCandidatePool(pool, registry, options.limit);
  const payload = {
    collectedAt: new Date().toISOString(),
    options,
    poolCount: pool.length,
    uniqueCount: filtered.unique.length,
    rejectedCount: filtered.rejected.length,
    unique: filtered.unique,
    rejected: filtered.rejected,
  };
  writeJson(CANDIDATES_PATH, pool);
  writeJson(FILTERED_PATH, payload);
  return payload;
}

async function downloadFile(url, filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (fs.existsSync(filePath) && fs.statSync(filePath).size > 0) return;
  const response = await fetchWithRetry(url, {}, 5);
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(filePath, buffer);
}

function captureVideoPosterFrame(videoPath, posterPath) {
  try {
    fs.mkdirSync(path.dirname(posterPath), { recursive: true });
    execFileSync("ffmpeg", [
      "-y",
      "-ss",
      "00:00:00.500",
      "-i",
      videoPath,
      "-frames:v",
      "1",
      "-q:v",
      "3",
      posterPath,
    ], { stdio: "ignore", timeout: 60000 });
    return fs.existsSync(posterPath) && fs.statSync(posterPath).size > 0;
  } catch {
    return false;
  }
}

function homeVideoEntry(candidate, index, slug, videoIndex, url, localUrl, posterUrl) {
  const key = `od-${String(index).padStart(3, "0")}-${String(videoIndex).padStart(2, "0")}`;
  return {
    sceneId: key,
    sceneEntryId: "default",
    sceneName: "Featured video",
    sceneEntryName: `Clip ${videoIndex}`,
    title: `${candidate.name || slug} Clip ${videoIndex}`,
    posterUrl,
    videoUrl: localUrl,
    localVideoUrl: localUrl,
    sourceVideoUrl: url,
    taskId: path.basename(String(url).split("?")[0]) || key,
    status: "succeeded",
    provider: "ourdream",
    ratio: "public",
    resolution: "public",
    duration: null,
    likes: null,
    createdAt: candidate.createdAt || new Date().toISOString(),
    source: "ourdream-import",
    shouldBlur: false,
  };
}

function buildHomeItem(candidate, index, slug, coverUrl, posterUrls, videoUrls) {
  const itemId = `ourdream-${String(index).padStart(3, "0")}-${slug}`;
  const localBase = `/assets/ourdream/characters/${slug}`;
  const homeSceneVideos = {};
  for (let i = 0; i < 4; i += 1) {
    const posterUrl = posterUrls[i] || coverUrl;
    homeSceneVideos[`od-${String(index).padStart(3, "0")}-${String(i + 1).padStart(2, "0")}`] = homeVideoEntry(
      candidate,
      index,
      slug,
      i + 1,
      candidate.videoUrls[i],
      videoUrls[i],
      posterUrl
    );
  }
  return {
    id: itemId,
    source: "ourdream-import",
    sourceDisplayId: candidate.sourceDisplayId,
    sourceCharacterId: candidate.sourceCharacterId,
    name: candidate.name,
    title: candidate.title || "Featured creator role",
    description: candidate.description || "A curated public character profile with locally hosted showcase clips.",
    posterUrl: posterUrls[0] || coverUrl,
    thumbnailUrl: coverUrl,
    localImageUrl: coverUrl,
    sourceImageUrl: candidate.imageUrls[0] || "",
    imageMime: sourceUrlToFileExt(candidate.imageUrls[0], ".jpg").replace(".", "image/").replace("image/jpg", "image/jpeg"),
    sourceImageMime: "image/jpeg",
    videoUrl: videoUrls[0],
    localVideoUrl: videoUrls[0],
    taskId: `ourdream-import-${String(index).padStart(3, "0")}`,
    status: "succeeded",
    referenceState: "ready",
    provider: "ourdream",
    createdAt: candidate.createdAt || new Date().toISOString(),
    age: candidate.age,
    gender: candidate.gender,
    style: candidate.style,
    model: candidate.model,
    tags: candidate.tags || [],
    likeCount: candidate.likeCount || 0,
    estimatedMessageCount: candidate.estimatedMessageCount || 0,
    creatorUsername: candidate.creatorUsername || "",
    creatorAvatarUrl: candidate.creatorAvatarUrl || "",
    videoCount: 4,
    homeSceneVideos,
    sceneVideos: {},
    unlockVideos: {},
  };
}

async function downloadBatch(limit) {
  const filtered = readJson(FILTERED_PATH);
  const homeItems = readJson(HOME_ITEMS_PATH, []);
  const existingSourceIds = new Set(homeItems.map((item) => item.sourceCharacterId).filter(Boolean));
  const existingDisplayIds = new Set(homeItems.map((item) => item.sourceDisplayId).filter(Boolean));
  const selected = (filtered.unique || [])
    .filter((candidate) => {
      if (candidate.sourceCharacterId && existingSourceIds.has(candidate.sourceCharacterId)) return false;
      if (candidate.sourceDisplayId && existingDisplayIds.has(candidate.sourceDisplayId)) return false;
      return true;
    })
    .slice(0, limit);
  if (!selected.length) throw new Error(`No unique candidates in ${path.relative(ROOT, FILTERED_PATH)}`);
  const existingIds = new Set(homeItems.map((item) => item.id));
  let nextIndex = homeItems.length + 1;
  const imported = [];
  for (const candidate of selected) {
    let slug = slugify(candidate.sourceDisplayId || candidate.name || candidate.sourceCharacterId);
    if (!slug) slug = `character-${nextIndex}`;
    let itemId = `ourdream-${String(nextIndex).padStart(3, "0")}-${slug}`;
    while (existingIds.has(itemId)) {
      slug = `${slug}-${nextIndex}`;
      itemId = `ourdream-${String(nextIndex).padStart(3, "0")}-${slug}`;
    }
    const dir = path.join(OUT_DIR, slug);
    fs.mkdirSync(dir, { recursive: true });
    const coverExt = sourceUrlToFileExt(candidate.imageUrls[0], ".jpg");
    const coverPath = path.join(dir, `cover${coverExt}`);
    await downloadFile(candidate.imageUrls[0], coverPath);
    const localBase = `/assets/ourdream/characters/${slug}`;
    const coverUrl = `${localBase}/cover${coverExt}`;
    const videoUrls = [];
    const videoPaths = [];
    for (let i = 0; i < 4; i += 1) {
      const source = candidate.videoUrls[i];
      const fileName = `video-${String(i + 1).padStart(2, "0")}.mp4`;
      const videoPath = path.join(dir, fileName);
      await downloadFile(source, videoPath);
      videoUrls.push(`${localBase}/${fileName}`);
      videoPaths.push(videoPath);
    }
    const posterUrls = [];
    const imageSources = candidate.imageUrls.length ? candidate.imageUrls : [candidate.imageUrls[0]];
    for (let i = 0; i < 4; i += 1) {
      const fileName = `poster-${String(i + 1).padStart(2, "0")}.jpg`;
      const posterPath = path.join(dir, fileName);
      const captured = captureVideoPosterFrame(videoPaths[i], posterPath);
      if (!captured) {
        const source = imageSources[i] || imageSources[0];
        await downloadFile(source, posterPath);
      }
      posterUrls.push(`${localBase}/${fileName}`);
    }
    const item = buildHomeItem(candidate, nextIndex, slug, coverUrl, posterUrls, videoUrls);
    homeItems.push(item);
    existingIds.add(item.id);
    if (item.sourceCharacterId) existingSourceIds.add(item.sourceCharacterId);
    if (item.sourceDisplayId) existingDisplayIds.add(item.sourceDisplayId);
    imported.push({ index: nextIndex, id: item.id, name: item.name, sourceCharacterId: item.sourceCharacterId, sourceDisplayId: item.sourceDisplayId });
    writeJson(HOME_ITEMS_PATH, homeItems);
    writeJson(path.join(ROOT, "assets", "ourdream", "last-imported-batch.json"), { importedAt: new Date().toISOString(), imported });
    process.stdout.write(`[download] ${nextIndex} ${item.name} -> ${slug}\n`);
    nextIndex += 1;
  }
  writeJson(path.join(ROOT, "assets", "ourdream", "last-imported-batch.json"), { importedAt: new Date().toISOString(), imported });
  return imported;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const options = {
    limit: args.limit || 100,
    pages: args.pages || 25,
    perPage: args.perPage || 50,
    sort: args.sort || "messages",
    timeframe: args.timeframe || "all-time",
    append: Boolean(args.append),
  };
  if (!args.download) {
    const payload = await collectCandidates(options);
    process.stdout.write(`[result] unique ${payload.uniqueCount}, rejected ${payload.rejectedCount}, pool ${payload.poolCount}\n`);
    process.stdout.write(`[write] ${path.relative(ROOT, FILTERED_PATH).replace(/\\/g, "/")}\n`);
  }
  if (args.download) {
    const imported = await downloadBatch(options.limit);
    process.stdout.write(`[result] imported ${imported.length}\n`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
