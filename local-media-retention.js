"use strict";

const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const LOCAL_MEDIA_RETENTION_MS = 24 * 60 * 60 * 1000;
const PUBLISHED_MARKER_SUFFIX = ".r2-ready";
const TRANSIENT_MEDIA_ROOT_NAME = "raising-game-media";
const TRANSIENT_POSTER_PREFIX = "raising-game-poster-";

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


/* Only disposable generation workspaces are eligible. Business media under
   assets/, user uploads, and locked previews are deliberately outside this
   function and must remain owned by PostgreSQL-backed records. */
async function cleanupTransientMediaWorkspaces({ tmpDir = os.tmpdir(), cutoffMs = Date.now() - LOCAL_MEDIA_RETENTION_MS } = {}) {
  const summary = { directories: 0 };
  const safeTmpDir = path.resolve(tmpDir);
  const removeOldDirectory = async (directoryPath) => {
    const stat = await fs.lstat(directoryPath).catch(() => null);
    if (!stat?.isDirectory() || stat.isSymbolicLink() || stat.mtimeMs >= cutoffMs) return;
    await fs.rm(directoryPath, { recursive: true, force: true });
    summary.directories += 1;
  };
  let entries = [];
  try {
    entries = await fs.readdir(safeTmpDir, { withFileTypes: true });
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return summary;
  }
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    if (entry.name === TRANSIENT_MEDIA_ROOT_NAME) {
      if (!entry.isDirectory()) continue;
      const rootPath = path.join(safeTmpDir, entry.name);
      const rootStat = await fs.lstat(rootPath).catch(() => null);
      if (!rootStat?.isDirectory() || rootStat.isSymbolicLink()) continue;
      const children = await fs.readdir(rootPath, { withFileTypes: true }).catch(() => []);
      for (const child of children) {
        if (child.isSymbolicLink() || !child.isDirectory()) continue;
        await removeOldDirectory(path.join(rootPath, child.name));
      }
    } else if (entry.name.startsWith(TRANSIENT_POSTER_PREFIX) && entry.isDirectory()) {
      await removeOldDirectory(path.join(safeTmpDir, entry.name));
    }
  }
  return summary;
}

async function markPublishedFile(filePath) {
  if (!filePath) return "";
  const markerPath = `${filePath}${PUBLISHED_MARKER_SUFFIX}`;
  await fs.writeFile(markerPath, "");
  return markerPath;
}

async function markPublishedFileSafely(filePath) {
  try {
    return await markPublishedFile(filePath);
  } catch {
    // The upload already succeeded. A marker failure must not turn it into a
    // failed publication; the 24-hour unmarked-file sweep is the fallback.
    return "";
  }
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
  markPublishedFileSafely,
  removeExpiredFiles,
  removeExpiredPublishedFiles,
  cleanupTransientMediaWorkspaces,
};
