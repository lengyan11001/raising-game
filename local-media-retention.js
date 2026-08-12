"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

const LOCAL_MEDIA_RETENTION_MS = 24 * 60 * 60 * 1000;
const PUBLISHED_MARKER_SUFFIX = ".r2-ready";

async function removeEmptyDirectories(rootDir, currentDir = rootDir) {
  let entries = [];
  try {
    entries = await fs.readdir(currentDir, { withFileTypes: true });
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    await removeEmptyDirectories(rootDir, path.join(currentDir, entry.name));
  }
  if (currentDir === rootDir) return;
  const remaining = await fs.readdir(currentDir).catch(() => ["occupied"]);
  if (!remaining.length) await fs.rmdir(currentDir).catch(() => {});
}

async function listRegularFiles(rootDir) {
  const files = [];
  async function walk(currentDir) {
    let entries = [];
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) await walk(fullPath);
      else if (entry.isFile()) files.push(fullPath);
    }
  }
  await walk(rootDir);
  return files;
}

async function removeExpiredFiles(rootDir, cutoffMs) {
  const summary = { files: 0, bytes: 0 };
  for (const filePath of await listRegularFiles(rootDir)) {
    if (filePath.endsWith(PUBLISHED_MARKER_SUFFIX)) continue;
    const stat = await fs.stat(filePath).catch(() => null);
    if (!stat || stat.mtimeMs >= cutoffMs) continue;
    await fs.rm(filePath, { force: true });
    summary.files += 1;
    summary.bytes += Number(stat.size || 0);
  }
  await removeEmptyDirectories(rootDir);
  return summary;
}

async function markPublishedFile(filePath) {
  if (!filePath) return "";
  const markerPath = `${filePath}${PUBLISHED_MARKER_SUFFIX}`;
  await fs.writeFile(markerPath, "");
  return markerPath;
}

async function removeExpiredPublishedFiles(rootDirs, cutoffMs) {
  const summary = { files: 0, bytes: 0 };
  for (const rootDir of rootDirs) {
    for (const markerPath of (await listRegularFiles(rootDir)).filter((filePath) => filePath.endsWith(PUBLISHED_MARKER_SUFFIX))) {
      const markerStat = await fs.stat(markerPath).catch(() => null);
      if (!markerStat || markerStat.mtimeMs >= cutoffMs) continue;
      const targetPath = markerPath.slice(0, -PUBLISHED_MARKER_SUFFIX.length);
      const targetStat = await fs.stat(targetPath).catch(() => null);
      if (targetStat?.isFile()) {
        await fs.rm(targetPath, { force: true });
        summary.files += 1;
        summary.bytes += Number(targetStat.size || 0);
      }
      await fs.rm(markerPath, { force: true });
    }
    await removeEmptyDirectories(rootDir);
  }
  return summary;
}

module.exports = {
  LOCAL_MEDIA_RETENTION_MS,
  PUBLISHED_MARKER_SUFFIX,
  markPublishedFile,
  removeExpiredFiles,
  removeExpiredPublishedFiles,
};
