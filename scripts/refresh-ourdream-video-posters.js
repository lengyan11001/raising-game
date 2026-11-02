#!/usr/bin/env node
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { execFile } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_ENV_FILE = process.env.ENV_FILE || "";

function parseArgs(argv) {
  const args = { dryRun: false, all: false, limit: 0, concurrency: 2, envFile: DEFAULT_ENV_FILE };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--all") args.all = true;
    else if (arg === "--limit") args.limit = Number(argv[++i] || 0);
    else if (arg === "--concurrency") args.concurrency = Math.max(1, Number(argv[++i] || 2));
    else if (arg === "--env") args.envFile = argv[++i] || "";
  }
  return args;
}

function loadEnvFile(filePath = "") {
  if (!filePath || !fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, "utf8");
  text.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const index = trimmed.indexOf("=");
    if (index <= 0) return;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  });
}

function publicAssetPathToFile(value = "") {
  const clean = String(value || "").split("?")[0].trim();
  if (!clean || !clean.startsWith("/assets/")) return "";
  const relative = decodeURIComponent(clean.replace(/^\/+/, ""));
  const filePath = path.normalize(path.join(ROOT, relative));
  const assetsRoot = path.normalize(path.join(ROOT, "assets"));
  return filePath.startsWith(assetsRoot) ? filePath : "";
}

function localVideoSource(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.startsWith("/assets/")) {
    const filePath = publicAssetPathToFile(text);
    if (filePath && fs.existsSync(filePath)) return filePath;
  }
  if (/^https?:\/\//i.test(text)) return text;
  return "";
}

function videoIndexFromEntry(entry = {}, fallback = 1) {
  const candidates = [
    entry.sceneEntryName,
    entry.title,
    entry.sceneId,
    entry.localVideoUrl,
    entry.videoUrl,
    entry.sourceVideoUrl,
    entry.posterUrl,
  ];
  for (const value of candidates) {
    const text = String(value || "");
    const match = text.match(/(?:clip|video|poster|od-\d+-|[-_])0?([1-4])(?:\D|$)/i);
    if (match) return Number(match[1]);
  }
  return fallback;
}

function posterUrlForEntry(entry = {}, fallbackIndex = 1) {
  const current = String(entry.posterUrl || entry.localPosterUrl || entry.coverUrl || entry.thumbnailUrl || "").trim();
  const videoUrl = String(entry.localVideoUrl || entry.videoUrl || entry.sourceVideoUrl || "").trim();
  const index = videoIndexFromEntry(entry, fallbackIndex);
  const name = `poster-${String(index).padStart(2, "0")}.jpg`;
  const base = current.startsWith("/assets/") ? current : videoUrl;
  if (base.startsWith("/assets/")) {
    const dir = path.posix.dirname(base.split("?")[0]);
    return `${dir}/${name}`;
  }
  return current;
}

function videoEntries(item = {}) {
  const out = [];
  ["homeSceneVideos", "sceneVideos", "unlockVideos"].forEach((field) => {
    Object.entries(item[field] || {}).forEach(([key, entry], index) => {
      if (!entry || typeof entry !== "object") return;
      out.push({ field, key, index: index + 1, entry });
    });
  });
  return out;
}

async function fileHash(filePath = "") {
  try {
    const bytes = await fsp.readFile(filePath);
    return crypto.createHash("sha256").update(bytes).digest("hex");
  } catch {
    return "";
  }
}

async function hasDuplicatePosterContent(item = {}) {
  const hashes = [];
  const urls = [];
  for (const { entry, index } of videoEntries(item)) {
    const posterUrl = posterUrlForEntry(entry, index);
    const filePath = publicAssetPathToFile(posterUrl);
    if (!filePath) continue;
    urls.push(posterUrl);
    hashes.push(await fileHash(filePath));
  }
  const validHashes = hashes.filter(Boolean);
  const uniqueHashes = new Set(validHashes);
  const uniqueUrls = new Set(urls);
  return validHashes.length >= 2 && (uniqueHashes.size < validHashes.length || uniqueUrls.size < urls.length);
}

function captureFrame(videoSource, posterPath) {
  return new Promise((resolve) => {
    execFile("ffmpeg", [
      "-y",
      "-ss",
      "00:00:00.500",
      "-i",
      videoSource,
      "-frames:v",
      "1",
      "-q:v",
      "3",
      posterPath,
    ], { timeout: 60000 }, (error) => resolve(!error && fs.existsSync(posterPath) && fs.statSync(posterPath).size > 0));
  });
}

async function mapLimit(items, limit, fn) {
  const out = [];
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      out[index] = await fn(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

async function processItem(item, { dryRun = false } = {}) {
  const entries = videoEntries(item);
  const changes = [];
  const version = Date.now().toString(36);
  for (const info of entries) {
    const { field, key, entry, index } = info;
    const posterUrl = posterUrlForEntry(entry, index);
    const posterPath = publicAssetPathToFile(posterUrl);
    const videoSource = localVideoSource(entry.localVideoUrl || entry.videoUrl || entry.sourceVideoUrl || entry.remoteVideoUrl);
    if (!posterUrl || !posterPath || !videoSource) {
      changes.push({ key, skipped: true, reason: "missing poster target or video source" });
      continue;
    }
    if (!dryRun) {
      await fsp.mkdir(path.dirname(posterPath), { recursive: true });
      const ok = await captureFrame(videoSource, posterPath);
      if (!ok) {
        changes.push({ key, posterUrl, skipped: true, reason: "ffmpeg capture failed" });
        continue;
      }
    }
    const publicPosterUrl = `${posterUrl}?v=${version}`;
    entry.posterUrl = publicPosterUrl;
    entry.localPosterUrl = publicPosterUrl;
    entry.coverUrl = publicPosterUrl;
    entry.thumbnailUrl = publicPosterUrl;
    changes.push({ key, field, posterUrl: publicPosterUrl });
  }
  return { item, changes };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  loadEnvFile(args.envFile);
  const { dbEnabled, listAdminHomeItemsFromDb, upsertAdminHomeItemInDb } = require("../db");
  if (!dbEnabled()) throw new Error("DATABASE_URL is not configured. Pass --env /etc/raising-game-demo.env or source the env file first.");
  let items = await listAdminHomeItemsFromDb();
  items = items.filter((item) => item && !item.deletedAt && item.source === "ourdream-import");
  const selected = [];
  for (const item of items) {
    if (args.all || await hasDuplicatePosterContent(item)) selected.push(item);
    if (args.limit && selected.length >= args.limit) break;
  }
  console.log(JSON.stringify({ scanned: items.length, selected: selected.length, dryRun: args.dryRun }, null, 2));
  const results = await mapLimit(selected, args.concurrency, async (item) => {
    const result = await processItem(item, { dryRun: args.dryRun });
    if (!args.dryRun && result.changes.some((entry) => !entry.skipped)) {
      item.updatedAt = new Date().toISOString();
      await upsertAdminHomeItemInDb(item);
    }
    console.log(`[poster] ${item.id} ${item.name || ""} changes=${result.changes.filter((entry) => !entry.skipped).length} skipped=${result.changes.filter((entry) => entry.skipped).length}`);
    return result;
  });
  const changed = results.reduce((sum, result) => sum + result.changes.filter((entry) => !entry.skipped).length, 0);
  const skipped = results.reduce((sum, result) => sum + result.changes.filter((entry) => entry.skipped).length, 0);
  console.log(JSON.stringify({ done: true, items: results.length, changed, skipped }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
