"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

const OURDREAM_TRPC_BASE = "https://trpc.svc.ourdream.ai/api/trpc";
const OURDREAM_ORIGIN = "https://ourdream.ai";
const CACHE_TTL_MS = 60 * 60 * 1000;
const PRESET_COMBOS = Object.freeze([
  Object.freeze({ gender: "Female", style: "Realistic" }),
  Object.freeze({ gender: "Male", style: "Realistic" }),
  Object.freeze({ gender: "Female", style: "Anime" }),
  Object.freeze({ gender: "Male", style: "Anime" }),
]);
const VIDEO_ACTIONS_PATH = path.join(__dirname, "assets", "ourdream", "presets", "video-actions.json");
const FALLBACK_PRESETS_PATH = path.join(__dirname, "assets", "ourdream", "presets", "presets.json");

let cachedLibrary = null;
let cachedAt = 0;

function tRpcUrl(procedure, input) {
  return `${OURDREAM_TRPC_BASE}/${procedure}?input=${encodeURIComponent(JSON.stringify({ json: input }))}`;
}

async function fetchTrpc(procedure, input, fetchImpl = fetch) {
  const response = await fetchImpl(tRpcUrl(procedure, input), {
    headers: {
      accept: "application/json",
      origin: OURDREAM_ORIGIN,
      referer: `${OURDREAM_ORIGIN}/generate`,
    },
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok || payload?.error) {
    const message = payload?.error?.json?.message || payload?.error?.message || text || `HTTP ${response.status}`;
    throw new Error(`OurDream ${procedure} failed: ${message}`);
  }
  return payload?.result?.data?.json || {};
}

function cleanTags(value) {
  return Array.isArray(value) ? [...new Set(value.map((item) => String(item || "").trim()).filter(Boolean))] : [];
}

function normalizePresetItem(item = {}, slot = "", combo = {}) {
  const section = String(item.section || "").trim();
  return {
    id: String(item.id || ""),
    sourceId: String(item.id || ""),
    sourceCombo: `${combo.gender || ""}-${combo.style || ""}`.replace(/^-|-$/g, ""),
    label: String(item.label || item.prompt || slot || "Preset").trim(),
    category: section || String(combo.style || "").trim() || "Other",
    section,
    gender: combo.gender || "",
    style: combo.style || "",
    tags: cleanTags(item.tags),
    prompt: String(item.prompt || item.description || item.label || "").trim(),
    description: String(item.description || "").trim(),
    imageUrl: String(item.imageUrl || "").trim(),
    remoteImageUrl: String(item.imageUrl || "").trim(),
    recommendedVideoActions: Array.isArray(item.recommendedVideoActions) ? item.recommendedVideoActions : [],
    dbId: Number(item.dbId || 0) || undefined,
    sourceType: `ourdream-${slot}`,
  };
}

function normalizeCharacter(item = {}) {
  const media = Array.isArray(item.displayImageUrls) ? item.displayImageUrls : [];
  const imageUrl = media.find((url) => /^https?:\/\/img\./i.test(String(url || ""))) || media[0] || "";
  const tags = cleanTags(item.tags);
  const details = [item.age ? `${item.age}` : "", item.style, item.gender, ...tags].filter(Boolean).join("; ");
  return {
    id: String(item.id || ""),
    sourceId: String(item.id || ""),
    label: String(item.name || "Character").trim(),
    category: String(item.style || "Featured").trim(),
    section: String(item.style || "").trim(),
    gender: String(item.gender || "").trim(),
    style: String(item.style || "").trim(),
    age: Number(item.age || 0) || undefined,
    tags,
    prompt: [
      "Use the selected character as the main subject. Keep identity, face, hairstyle, body type, and age impression consistent.",
      details,
    ].filter(Boolean).join(" "),
    description: String(item.shortDescription || details || "").trim(),
    imageUrl: String(imageUrl || "").trim(),
    referenceImageUrl: String(imageUrl || "").trim(),
    displayImageUrls: media,
    displayId: String(item.displayId || "").trim(),
    sourceType: "ourdream-character",
  };
}

function dedupeItems(items = []) {
  const byId = new Map();
  items.forEach((item) => {
    const id = String(item?.id || "").trim();
    if (!id || !item?.imageUrl) return;
    const previous = byId.get(id);
    const variantKey = `${item.gender || "Female"}:${item.style || "Realistic"}`;
    const variant = {
      gender: item.gender || "",
      style: item.style || "",
      prompt: item.prompt || "",
      imageUrl: item.imageUrl || "",
      remoteImageUrl: item.remoteImageUrl || item.imageUrl || "",
    };
    if (!previous) {
      byId.set(id, { ...item, variants: { [variantKey]: variant } });
      return;
    }
    previous.variants = { ...(previous.variants || {}), [variantKey]: variant };
    if (previous.style === "Anime" && item.style === "Realistic") {
      Object.assign(previous, { ...item, variants: previous.variants });
    }
  });
  return [...byId.values()];
}

async function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function fetchCharacters(fetchImpl = fetch, limit = 100) {
  const payload = await fetchTrpc("generate.getFilteredCharacters", {
    gender: null,
    style: null,
    ageGroup: null,
    sortBy: "top-month",
    category: "all",
    locale: "en",
    limit,
  }, fetchImpl);
  return (Array.isArray(payload.items) ? payload.items : []).map(normalizeCharacter).filter((item) => item.id && item.imageUrl);
}

async function fetchOurDreamPresetLibrary({ fetchImpl = fetch, characterLimit = 100 } = {}) {
  const [characters, videoActions, ...presetPayloads] = await Promise.all([
    fetchCharacters(fetchImpl, characterLimit),
    readJsonFile(VIDEO_ACTIONS_PATH, { items: [] }),
    ...PRESET_COMBOS.map((combo) => fetchTrpc("presets.getAll", combo, fetchImpl)),
  ]);
  const collected = { pose: [], outfit: [], background: [] };
  presetPayloads.forEach((payload, index) => {
    const combo = PRESET_COMBOS[index];
    Object.keys(collected).forEach((key) => {
      (Array.isArray(payload[key]) ? payload[key] : []).forEach((item) => {
        collected[key].push(normalizePresetItem(item, key, combo));
      });
    });
  });
  const actions = Array.isArray(videoActions?.items) ? videoActions.items : [];
  return {
    version: 4,
    schemaVersion: 2,
    source: "ourdream.ai live presets.getAll + generate.getFilteredCharacters + bundled video actions",
    generatedAt: new Date().toISOString(),
    sourceCombos: PRESET_COMBOS,
    sets: [
      { slot: "character", items: characters },
      { slot: "pose", items: dedupeItems(collected.pose) },
      { slot: "action", items: actions },
      { slot: "outfit", items: dedupeItems(collected.outfit) },
      { slot: "scene", items: dedupeItems(collected.background) },
    ],
    categories: {},
  };
}

async function fallbackPresetLibrary() {
  const [fallback, videoActions] = await Promise.all([
    readJsonFile(FALLBACK_PRESETS_PATH, { sets: [], categories: {} }),
    readJsonFile(VIDEO_ACTIONS_PATH, { items: [] }),
  ]);
  const sets = Array.isArray(fallback.sets) ? fallback.sets : [];
  const oldAction = sets.find((set) => set.slot === "action") || { items: [] };
  return {
    ...fallback,
    version: Math.max(4, Number(fallback.version || 0)),
    schemaVersion: 2,
    sets: [
      ...sets.filter((set) => !["action", "pose"].includes(set.slot)),
      { slot: "pose", items: oldAction.items || [] },
      { slot: "action", items: Array.isArray(videoActions.items) ? videoActions.items : [] },
    ],
  };
}

async function getOurDreamPresetLibrary(options = {}) {
  // Production serves the last successful mirrored snapshot. This keeps page loads
  // independent from OurDream availability and guarantees media stays on our CDN.
  const staticSnapshot = await readJsonFile(FALLBACK_PRESETS_PATH, null);
  if (staticSnapshot && Array.isArray(staticSnapshot.sets)) {
    return staticSnapshot;
  }
  const now = Date.now();
  if (!options.force && cachedLibrary && now - cachedAt < CACHE_TTL_MS) return cachedLibrary;
  try {
    cachedLibrary = await fetchOurDreamPresetLibrary(options);
    cachedAt = now;
    return cachedLibrary;
  } catch (error) {
    if (cachedLibrary) return cachedLibrary;
    const fallback = await fallbackPresetLibrary();
    fallback.warning = error.message || String(error);
    return fallback;
  }
}

module.exports = {
  PRESET_COMBOS,
  dedupeItems,
  fetchOurDreamPresetLibrary,
  getOurDreamPresetLibrary,
  normalizeCharacter,
  normalizePresetItem,
  tRpcUrl,
};
