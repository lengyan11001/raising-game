"use strict";

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { URL } = require("node:url");
const {
  dbEnabled,
  upsertWorkflowPresetInDb,
} = require("../db");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_SOURCE = "https://playflux.ai/zh-sg/workflow";
const WORKFLOW_ASSET_DIR = path.join(ROOT, "assets", "workflow", "presets");
const PUBLIC_ASSET_PREFIX = "/assets/workflow/presets";
const VIDEO_EXT_RE = /\.(mp4|mov|webm)(?:[?#]|$)/i;

function loadLocalEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const index = trimmed.indexOf("=");
    if (index < 1) return;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  });
}

function slug(value = "", fallback = "preset") {
  return String(value || fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || fallback;
}

function unescapeJsString(raw = "") {
  try {
    return Function(`return ${raw}`)();
  } catch (_) {
    return String(raw || "").slice(1, -1);
  }
}

function readString(text, index) {
  const quote = text[index];
  let value = "";
  for (let i = index + 1; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "\\") {
      value += ch + (text[i + 1] || "");
      i += 1;
      continue;
    }
    if (ch === quote) return { raw: `${quote}${value}${quote}`, end: i + 1 };
    value += ch;
  }
  return null;
}

function findObjectStart(text, position) {
  let index = position;
  while (index >= 0 && text[index] !== "{") index -= 1;
  return index;
}

function findObjectEnd(text, start) {
  let depth = 0;
  let inString = false;
  let quote = "";
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === quote) inString = false;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      inString = true;
      quote = ch;
      continue;
    }
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

function extractField(objectText, name) {
  const match = new RegExp(`(?:^|[,\\\\{])${name}:`).exec(objectText);
  if (!match) return "";
  let index = match.index + match[0].length;
  while (/\s/.test(objectText[index])) index += 1;
  if (objectText[index] === '"' || objectText[index] === "'") {
    const value = readString(objectText, index);
    return value ? unescapeJsString(value.raw) : "";
  }
  const preview = objectText.slice(index, index + 240);
  const literals = [...preview.matchAll(/(['"])(.*?)\1/g)].map((item) => item[2]);
  if (name.toLowerCase().includes("url") && literals.length) {
    if (preview.includes("eY") && literals[0].startsWith("/")) return `https://i.fluxnsfw.ai/demo-asian${literals[0]}`;
    return literals[0];
  }
  return "";
}

function parseWorkflowPresets(bundleText) {
  const presets = [];
  const usedIds = new Map();
  let position = 0;
  while ((position = bundleText.indexOf("id:", position)) !== -1) {
    const start = findObjectStart(bundleText, position);
    const end = start >= 0 ? findObjectEnd(bundleText, start) : -1;
    position += 3;
    if (start < 0 || end <= start) continue;
    const objectText = bundleText.slice(start, end);
    if (!objectText.includes("defaultPrompt:") || !objectText.includes("demoUrl:")) continue;
    const sourceId = extractField(objectText, "id");
    const label = extractField(objectText, "label");
    const prompt = extractField(objectText, "defaultPrompt");
    const sourcePreviewUrl = extractField(objectText, "demoUrl");
    if (!sourceId || !label || !prompt || !VIDEO_EXT_RE.test(sourcePreviewUrl)) continue;
    const baseId = slug(label, sourceId);
    const seen = usedIds.get(baseId) || 0;
    usedIds.set(baseId, seen + 1);
    presets.push({
      id: seen ? `${baseId}-${slug(sourceId)}` : baseId,
      source: "playflux",
      sourceId,
      label,
      prompt,
      sourcePreviewUrl,
      category: "PlayFlux",
      sortOrder: presets.length,
    });
  }
  return presets;
}

async function fetchText(url) {
  const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`Fetch failed ${response.status}: ${url}`);
  return await response.text();
}

async function loadBundle(source) {
  const clean = String(source || DEFAULT_SOURCE).trim() || DEFAULT_SOURCE;
  if (fs.existsSync(clean)) return fs.readFileSync(clean, "utf8");
  if (/\.js(?:[?#]|$)/i.test(clean)) return await fetchText(clean);
  const html = await fetchText(clean);
  const pageScript = [...html.matchAll(/<script[^>]+src=["']([^"']*\/workflow\/page-[^"']+\.js[^"']*)["']/gi)]
    .map((match) => new URL(match[1], clean).toString())[0];
  if (!pageScript) throw new Error("Workflow page script was not found.");
  return await fetchText(pageScript);
}

async function downloadPreview(preset) {
  await fsp.mkdir(WORKFLOW_ASSET_DIR, { recursive: true });
  const ext = (new URL(preset.sourcePreviewUrl).pathname.match(/\.([a-z0-9]+)$/i) || [null, "mp4"])[1].toLowerCase();
  const fileName = `${preset.id}.${ext}`;
  const filePath = path.join(WORKFLOW_ASSET_DIR, fileName);
  if (fs.existsSync(filePath) && fs.statSync(filePath).size > 0) {
    return `${PUBLIC_ASSET_PREFIX}/${fileName}`;
  }
  const response = await fetch(preset.sourcePreviewUrl, { redirect: "follow", signal: AbortSignal.timeout(10 * 60 * 1000) });
  if (!response.ok) throw new Error(`Preview download failed ${response.status}: ${preset.sourcePreviewUrl}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  await fsp.writeFile(filePath, bytes);
  return `${PUBLIC_ASSET_PREFIX}/${fileName}`;
}

async function main() {
  loadLocalEnv(path.join(ROOT, ".env.local"));
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const source = args.find((arg) => arg !== "--dry-run") || DEFAULT_SOURCE;
  const bundleText = await loadBundle(source);
  const presets = parseWorkflowPresets(bundleText);
  console.log(`Parsed ${presets.length} workflow video presets.`);
  if (dryRun) {
    console.log(JSON.stringify(presets.slice(0, 5), null, 2));
    return;
  }
  if (!dbEnabled()) throw new Error("DATABASE_URL is required. Workflow presets are stored in DB only.");
  let saved = 0;
  for (const preset of presets) {
    try {
      const previewUrl = await downloadPreview(preset);
      await upsertWorkflowPresetInDb({
        ...preset,
        previewUrl,
        updatedAt: new Date().toISOString(),
      });
      saved += 1;
      console.log(`[${saved}/${presets.length}] ${preset.label} -> ${previewUrl}`);
    } catch (error) {
      console.warn(`[skip] ${preset.label}: ${error.message || error}`);
    }
  }
  console.log(`Imported ${saved}/${presets.length} workflow presets.`);
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
