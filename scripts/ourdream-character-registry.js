#!/usr/bin/env node
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_HOME_ITEMS = path.join(ROOT, "assets", "ourdream", "home-items.json");
const DEFAULT_REGISTRY = path.join(ROOT, "assets", "ourdream", "imported-character-registry.json");
const DEFAULT_LIST = path.join(ROOT, "assets", "ourdream", "imported-character-list.md");

const VIDEO_GROUPS = [
  ["homeSceneVideos", "home"],
  ["unlockVideos", "unlock"],
  ["sceneVideos", "scene"],
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeSlug(value) {
  return normalizeText(value)
    .replace(/^https?:\/\/[^/]+\/?/i, "")
    .replace(/^c\//i, "")
    .replace(/[?#].*$/, "")
    .replace(/^\/+|\/+$/g, "");
}

function looksLikeUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

function firstPresent(...values) {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return "";
}

function candidateSourceId(candidate = {}) {
  const direct = firstPresent(
    candidate.sourceCharacterId,
    candidate.ourdreamCharacterId,
    candidate.characterId,
    candidate.publicCharacterId
  );
  if (direct) return direct;

  const id = String(candidate.id || "").trim();
  if (looksLikeUuid(id)) return id;
  return "";
}

function candidateDisplayId(candidate = {}) {
  return firstPresent(
    candidate.sourceDisplayId,
    candidate.displayId,
    candidate.slug,
    candidate.profileSlug,
    candidate.publicProfileId,
    candidate.handle
  );
}

function candidateProfileSlug(candidate = {}) {
  const fromUrl = firstPresent(candidate.sourceProfileUrl, candidate.profileUrl, candidate.characterUrl, candidate.url);
  if (fromUrl) return normalizeSlug(fromUrl);
  return normalizeSlug(candidateDisplayId(candidate));
}

function buildDedupeKeys(candidate = {}) {
  const keys = new Set();
  const sourceId = normalizeText(candidateSourceId(candidate));
  const displayId = normalizeSlug(candidateDisplayId(candidate));
  const profileSlug = normalizeSlug(candidateProfileSlug(candidate));
  const localId = normalizeText(candidate.localId || candidate.id);
  const name = normalizeText(candidate.name || candidate.title);

  if (sourceId) keys.add(`ourdream:character-id:${sourceId}`);
  if (displayId) keys.add(`ourdream:display-id:${displayId}`);
  if (profileSlug) keys.add(`ourdream:profile:${profileSlug}`);
  if (localId) keys.add(`local-id:${localId}`);
  if (name) keys.add(`name:${name}`);

  return [...keys];
}

function collectVideos(item = {}) {
  const videos = [];
  for (const [field, group] of VIDEO_GROUPS) {
    for (const [key, video] of Object.entries(item[field] || {})) {
      videos.push({
        group,
        key,
        title: video.title || "",
        posterUrl: video.posterUrl || "",
        videoUrl: video.videoUrl || video.localVideoUrl || "",
        localVideoUrl: video.localVideoUrl || video.videoUrl || "",
        taskId: video.taskId || "",
        duration: video.duration || null,
        width: video.width || null,
        height: video.height || null,
      });
    }
  }
  return videos;
}

function profileUrlFor(item = {}) {
  const slug = normalizeSlug(item.sourceDisplayId || item.slug || "");
  return slug ? `https://ourdream.ai/c/${slug}` : "";
}

function characterEntry(item = {}, index = 0) {
  const videos = collectVideos(item);
  const localId = item.id || "";
  const sourceDisplayId = item.sourceDisplayId || "";
  const sourceCharacterId = item.sourceCharacterId || "";
  const entry = {
    index: index + 1,
    localId,
    source: item.source || "ourdream-import",
    sourceCharacterId,
    sourceDisplayId,
    sourceProfileUrl: profileUrlFor(item),
    name: item.name || "",
    title: item.title || "",
    age: item.age || null,
    gender: item.gender || "",
    style: item.style || "",
    model: item.model || "",
    tags: Array.isArray(item.tags) ? item.tags : [],
    posterUrl: item.posterUrl || item.localImageUrl || "",
    localImageUrl: item.localImageUrl || item.posterUrl || "",
    videoCount: videos.length,
    videos,
  };
  entry.dedupeKeys = buildDedupeKeys({
    ...item,
    localId,
    sourceCharacterId,
    sourceDisplayId,
    sourceProfileUrl: entry.sourceProfileUrl,
  });
  return entry;
}

function buildRegistry(homeItemsPath = DEFAULT_HOME_ITEMS) {
  const items = readJson(homeItemsPath);
  if (!Array.isArray(items)) {
    throw new Error(`${path.relative(ROOT, homeItemsPath)} must contain a JSON array`);
  }
  const characters = items.map(characterEntry);
  return {
    version: 1,
    source: "ourdream.ai",
    sourceFile: path.relative(ROOT, homeItemsPath).replace(/\\/g, "/"),
    sourceHash: sha256File(homeItemsPath),
    characterCount: characters.length,
    videoCount: characters.reduce((sum, item) => sum + item.videoCount, 0),
    dedupeKeyPriority: [
      "ourdream:character-id",
      "ourdream:display-id",
      "ourdream:profile",
      "local-id",
      "name",
    ],
    characters,
  };
}

function registryKeySet(registry = {}) {
  const keys = new Set();
  for (const character of registry.characters || []) {
    for (const key of character.dedupeKeys || []) keys.add(key);
  }
  return keys;
}

function extractCandidateArray(input) {
  if (Array.isArray(input)) return input;
  for (const key of ["characters", "items", "data", "results"]) {
    if (Array.isArray(input?.[key])) return input[key];
  }
  if (Array.isArray(input?.json?.items)) return input.json.items;
  if (Array.isArray(input?.json?.data)) return input.json.data;
  throw new Error("Candidate JSON must be an array or contain characters/items/data/results.");
}

function filterCandidates(candidates, registry) {
  const known = registryKeySet(registry);
  const unique = [];
  const duplicates = [];
  for (const candidate of candidates) {
    const dedupeKeys = buildDedupeKeys(candidate);
    const matchedKeys = dedupeKeys.filter((key) => known.has(key));
    if (matchedKeys.length) {
      duplicates.push({ candidate, matchedKeys });
    } else {
      unique.push({ ...candidate, dedupeKeys });
    }
  }
  return { unique, duplicates };
}

function markdownList(registry) {
  const rows = [
    "# OurDream imported character list",
    "",
    `Source file: \`${registry.sourceFile}\``,
    `Source hash: \`${registry.sourceHash}\``,
    `Characters: ${registry.characterCount}`,
    `Videos: ${registry.videoCount}`,
    "",
    "## Next import dedupe",
    "",
    "Build or refresh this registry after a completed import:",
    "",
    "```powershell",
    "node scripts/ourdream-character-registry.js --write",
    "```",
    "",
    "Filter a newly fetched candidate JSON before downloading media:",
    "",
    "```powershell",
    "node scripts/ourdream-character-registry.js --filter assets/ourdream/next-candidates.json --out assets/ourdream/next-candidates-filtered.json",
    "```",
    "",
    "Use the `unique` array from the filtered output for the next download batch.",
    "",
    "| # | Name | Source character ID | Source display ID | Local ID | Videos |",
    "|---:|---|---|---|---|---:|",
  ];
  for (const character of registry.characters) {
    const cells = [
      character.index,
      character.name,
      character.sourceCharacterId,
      character.sourceDisplayId,
      character.localId,
      character.videoCount,
    ].map((value) => String(value ?? "").replace(/\|/g, "\\|"));
    rows.push(`| ${cells.join(" | ")} |`);
  }
  rows.push("");
  return `${rows.join("\n")}`;
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--write") args.write = true;
    else if (arg === "--home-items") args.homeItems = argv[++i];
    else if (arg === "--registry") args.registry = argv[++i];
    else if (arg === "--list") args.list = argv[++i];
    else if (arg === "--filter") args.filter = argv[++i];
    else if (arg === "--out") args.out = argv[++i];
    else args._.push(arg);
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const homeItemsPath = path.resolve(ROOT, args.homeItems || DEFAULT_HOME_ITEMS);
  const registryPath = path.resolve(ROOT, args.registry || DEFAULT_REGISTRY);
  const listPath = path.resolve(ROOT, args.list || DEFAULT_LIST);

  let registry;
  if (args.filter && fs.existsSync(registryPath)) {
    registry = readJson(registryPath);
  } else {
    registry = buildRegistry(homeItemsPath);
  }

  if (args.write) {
    writeJson(registryPath, registry);
    fs.mkdirSync(path.dirname(listPath), { recursive: true });
    fs.writeFileSync(listPath, markdownList(registry));
  }

  if (args.filter) {
    const candidates = extractCandidateArray(readJson(path.resolve(ROOT, args.filter)));
    const result = filterCandidates(candidates, registry);
    const output = {
      inputCount: candidates.length,
      uniqueCount: result.unique.length,
      duplicateCount: result.duplicates.length,
      unique: result.unique,
      duplicates: result.duplicates,
    };
    if (args.out) {
      writeJson(path.resolve(ROOT, args.out), output);
    } else {
      process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    }
    return;
  }

  process.stdout.write(`OurDream registry: ${registry.characterCount} characters, ${registry.videoCount} videos\n`);
  if (args.write) {
    process.stdout.write(`Wrote ${path.relative(ROOT, registryPath).replace(/\\/g, "/")}\n`);
    process.stdout.write(`Wrote ${path.relative(ROOT, listPath).replace(/\\/g, "/")}\n`);
  }
}

if (require.main === module) main();

module.exports = {
  buildDedupeKeys,
  buildRegistry,
  collectVideos,
  filterCandidates,
  registryKeySet,
};
