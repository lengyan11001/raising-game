#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");
const { downloadObject } = require("../oss-storage");

const ROOT = path.resolve(__dirname, "..");
const MAX_IMAGE_BYTES = 30 * 1024 * 1024;

function parseArgs(argv) {
  const args = { apply: false, envFile: process.env.ENV_FILE || "", taskIds: [], limit: 100 };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") args.apply = true;
    else if (arg === "--dry-run") args.apply = false;
    else if (arg === "--env") args.envFile = argv[++index] || "";
    else if (arg === "--task-id") args.taskIds.push(String(argv[++index] || "").trim());
    else if (arg === "--limit") args.limit = Math.max(1, Math.min(500, Number(argv[++index] || 0) || 100));
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function loadEnvFile(filePath = "") {
  if (!filePath || !fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!process.env[key]) process.env[key] = value;
  }
}

function usage() {
  return [
    "Usage: node scripts/repair-generated-image-asset-dimensions.js [options]",
    "",
    "Repair zero-dimension generated-image assets that have a source generation task.",
    "Dimension validation and automatic resizing are not touched.",
    "",
    "  --dry-run        Inspect candidates without writing (default)",
    "  --apply          Update asset and matching generation-record metadata",
    "  --task-id <id>   Restrict to one generation task id; repeatable",
    "  --limit <n>      Maximum candidates to inspect (default 100, max 500)",
    "  --env <path>     Load DATABASE_URL and OSS settings from an env file",
  ].join("\n");
}

function readLittleEndian24(buffer, offset) {
  return buffer[offset] + (buffer[offset + 1] << 8) + (buffer[offset + 2] << 16);
}

function imageDimensionsFromBuffer(bytes) {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes || []);
  if (buffer.length >= 24 && buffer[0] === 0x89 && buffer.toString("ascii", 1, 4) === "PNG") {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), type: "png" };
  }
  if (buffer.length >= 26 && buffer.toString("ascii", 0, 2) === "BM") {
    return { width: Math.abs(buffer.readInt32LE(18)), height: Math.abs(buffer.readInt32LE(22)), type: "bmp" };
  }
  if (buffer.length >= 30 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    const chunk = buffer.toString("ascii", 12, 16);
    if (chunk === "VP8X") return { width: readLittleEndian24(buffer, 24) + 1, height: readLittleEndian24(buffer, 27) + 1, type: "webp" };
    if (chunk === "VP8 ") return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff, type: "webp" };
    if (chunk === "VP8L" && buffer.length >= 25 && buffer[20] === 0x2f) {
      const bits = buffer.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1, type: "webp" };
    }
  }
  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      while (offset < buffer.length && buffer[offset] !== 0xff) offset += 1;
      while (offset < buffer.length && buffer[offset] === 0xff) offset += 1;
      const marker = buffer[offset];
      offset += 1;
      if (!marker || marker === 0xd9 || marker === 0xda) break;
      if (marker >= 0xd0 && marker <= 0xd7) continue;
      if (offset + 2 > buffer.length) break;
      const length = buffer.readUInt16BE(offset);
      if (length < 2 || offset + length > buffer.length) break;
      if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
        if (offset + 7 <= buffer.length) {
          return { width: buffer.readUInt16BE(offset + 5), height: buffer.readUInt16BE(offset + 3), type: "jpeg" };
        }
      }
      offset += length;
    }
  }
  if (buffer.length >= 10 && (buffer.toString("ascii", 0, 6) === "GIF87a" || buffer.toString("ascii", 0, 6) === "GIF89a")) {
    return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8), type: "gif" };
  }
  return null;
}

function imageMimeFromType(type = "") {
  if (type === "png") return "image/png";
  if (type === "webp") return "image/webp";
  if (type === "gif") return "image/gif";
  if (type === "bmp") return "image/bmp";
  return type === "jpeg" ? "image/jpeg" : "";
}

function nonEmptyStrings(...values) {
  return values.map((value) => String(value || "").trim()).filter(Boolean);
}

function assetStorageKey(asset = {}) {
  return nonEmptyStrings(asset.objectStorageKey, asset.storageKey, asset.r2Key)[0] || "";
}

function assetMediaUrl(asset = {}) {
  return nonEmptyStrings(asset.cdnUrl, asset.publicUrl, asset.localUrl, asset.imageResultUrl)[0] || "";
}

async function loadCandidateRows(client, { taskIds = [], limit = 100 } = {}) {
  const params = [];
  const filters = [
    "a.deleted_at IS NULL",
    "LOWER(a.mime) LIKE 'image/%'",
    "(COALESCE((a.payload->>'width')::numeric, 0) <= 0 OR COALESCE((a.payload->>'height')::numeric, 0) <= 0)",
    "COALESCE(a.payload->>'sourceGenerationTaskId', '') <> ''",
  ];
  if (taskIds.length) {
    params.push(taskIds);
    filters.push(`a.payload->>'sourceGenerationTaskId' = ANY($${params.length}::text[])`);
  }
  params.push(limit);
  const { rows } = await client.query(`
    SELECT
      a.id, a.user_id, a.mime, a.payload,
      r.payload AS record
    FROM app_user_assets a
    LEFT JOIN app_generation_records r
      ON r.task_id = a.payload->>'sourceGenerationTaskId'
    WHERE ${filters.join("\n      AND ")}
    ORDER BY a.updated_at ASC NULLS FIRST, a.id ASC
    LIMIT $${params.length}
  `, params);
  return rows;
}

async function bytesFromStorageKey(key = "") {
  if (!key) return null;
  const downloaded = await downloadObject({ key, maxBytes: MAX_IMAGE_BYTES });
  return {
    bytes: downloaded.bytes,
    mime: String(downloaded.contentType || "").split(";")[0].trim().toLowerCase(),
  };
}

async function bytesFromUrl(url = "") {
  if (!/^https?:\/\//i.test(url)) return null;
  const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`media download failed: ${response.status}`);
  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (declaredLength > MAX_IMAGE_BYTES) throw new Error("media exceeds 30MB");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength > MAX_IMAGE_BYTES) throw new Error("media exceeds 30MB");
  return {
    bytes,
    mime: String(response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase(),
  };
}

async function mediaForCandidate(row = {}) {
  const asset = row.payload && typeof row.payload === "object" ? row.payload : {};
  const record = row.record && typeof row.record === "object" ? row.record : {};
  const storageKeys = nonEmptyStrings(
    assetStorageKey(asset),
    asset.imageStorageKey,
    record.imageStorageKey,
    record.storageKey,
  );
  const urls = nonEmptyStrings(assetMediaUrl(asset), record.imageResultUrl, record.cdnImageUrl, record.localImageUrl);
  const errors = [];
  for (const key of storageKeys) {
    try {
      const media = await bytesFromStorageKey(key);
      if (media) return { ...media, source: `oss:${key}` };
    } catch (error) {
      errors.push(`oss:${error.message || error}`);
    }
  }
  for (const url of urls) {
    try {
      const media = await bytesFromUrl(url);
      if (media) return { ...media, source: `url:${url}` };
    } catch (error) {
      errors.push(`url:${error.message || error}`);
    }
  }
  throw new Error(errors.join(" | ") || "no readable media source");
}

function assetUpdatePayload(asset = {}, metadata = {}) {
  return {
    ...asset,
    width: metadata.width,
    height: metadata.height,
    sizeBytes: metadata.sizeBytes,
    updatedAt: metadata.updatedAt,
  };
}

function recordUpdatePayload(record = {}, asset = {}) {
  const next = {
    resolution: record.resolution || `${asset.width}x${asset.height}`,
    width: asset.width,
    height: asset.height,
    sizeBytes: asset.sizeBytes,
    updatedAt: asset.updatedAt,
    lastUpdateReason: "repair-generated-image-asset-dimensions",
  };
  if (!String(record.imageStorageKey || "").trim() && assetStorageKey(asset)) next.imageStorageKey = assetStorageKey(asset);
  return next;
}

async function persistCandidate(client, row, metadata) {
  const asset = row.payload && typeof row.payload === "object" ? row.payload : {};
  const record = row.record && typeof row.record === "object" ? row.record : null;
  const now = new Date().toISOString();
  const updatedAsset = assetUpdatePayload(asset, { ...metadata, updatedAt: now });
  await client.query(`
    UPDATE app_user_assets
    SET payload = $1::jsonb,
        updated_at = $2::timestamptz
    WHERE id = $3
      AND deleted_at IS NULL
  `, [JSON.stringify(updatedAsset), now, row.id]);
  if (record) {
    await client.query(`
      UPDATE app_generation_records
      SET payload = payload || $1::jsonb,
          updated_at = $2::timestamptz
      WHERE task_id = $3
    `, [JSON.stringify(recordUpdatePayload(record, updatedAsset)), now, String(asset.sourceGenerationTaskId || "").trim()]);
  }
  return updatedAsset;
}

async function repairGeneratedImageAssetDimensions({ databaseUrl, apply = false, taskIds = [], limit = 100 } = {}) {
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  const summary = { mode: apply ? "apply" : "dry-run", candidates: 0, repaired: 0, skipped: 0, failed: 0, results: [] };
  try {
    const rows = await loadCandidateRows(client, { taskIds, limit });
    summary.candidates = rows.length;
    for (const row of rows) {
      const asset = row.payload && typeof row.payload === "object" ? row.payload : {};
      const taskId = String(asset.sourceGenerationTaskId || "").trim();
      try {
        const media = await mediaForCandidate(row);
        const dimensions = imageDimensionsFromBuffer(media.bytes);
        if (!dimensions?.width || !dimensions?.height) throw new Error("image dimensions could not be parsed");
        const metadata = {
          width: dimensions.width,
          height: dimensions.height,
          sizeBytes: media.bytes.byteLength,
        };
        if (apply) await persistCandidate(client, row, metadata);
        summary.repaired += 1;
        summary.results.push({
          assetId: row.id,
          userId: row.user_id,
          taskId,
          width: metadata.width,
          height: metadata.height,
          sizeBytes: metadata.sizeBytes,
          mime: imageMimeFromType(dimensions.type) || String(row.mime || ""),
          source: media.source,
          applied: apply,
        });
      } catch (error) {
        summary.skipped += 1;
        summary.results.push({ assetId: row.id, userId: row.user_id, taskId, error: error.message || String(error), applied: false });
      }
    }
  } catch (error) {
    summary.failed = 1;
    summary.error = error.message || String(error);
  } finally {
    await client.end().catch(() => {});
  }
  return summary;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  loadEnvFile(args.envFile);
  process.chdir(ROOT);
  const summary = await repairGeneratedImageAssetDimensions({
    databaseUrl: process.env.DATABASE_URL,
    apply: args.apply,
    taskIds: args.taskIds,
    limit: args.limit,
  });
  console.log(JSON.stringify(summary, null, 2));
  if (summary.failed) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message || error);
    process.exit(1);
  });
}

module.exports = {
  parseArgs,
  imageDimensionsFromBuffer,
  repairGeneratedImageAssetDimensions,
};
