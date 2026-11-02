// lib-providers.js
// Provider normalization / public shaping helpers, extracted from server.js.
// Self-contained: reads only process.env and node globals.
const BYTEPLUS_LANGUAGE_MODEL = String(process.env.BYTEPLUS_LANGUAGE_MODEL || "ep-20260827122554-8fsgw").trim() || "ep-20260827122554-8fsgw";

// Seedance 2.5 direct provider identity. These must come from the provider
// module instead of being re-declared here so the id/label cannot drift.
const {
  SEEDANCE25_DIRECT_LABEL,
  SEEDANCE25_DIRECT_PROVIDER,
} = require("./seedance25-direct");

function isSeedream5ImageProvider(value = "") {
  const normalized = String(value || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  return [
    "seedream",
    "seedream5",
    "seedream50",
    "seedreamimage",
    "seedream5image",
    "seedream50image",
    "seedream5img",
    "seedream5imageedit",
    "vipeakseedream",
  ].includes(normalized) || normalized.includes("seedream5") || normalized.includes("seedream50");
}

function isQwenImage3Provider(value = "") {
  const normalized = String(value || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  return ["qwenimage3", "qwenimage30", "qwenimage3pro", "qwenimage30pro"].includes(normalized)
    || normalized.includes("qwenimage3.0");
}

function isQwen37FlashProvider(value = "") {
  const normalized = String(value || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  return ["qwen37flash", "qwen3.7flash", "qwen3.7flash20260715"].includes(normalized)
    || normalized.includes("qwen37flash")
    || normalized.includes("qwen3.7flash");
}

function isByteplusLanguageProvider(value = "") {
  const normalized = String(value || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  return ["bytepluslanguage", "arklanguage", BYTEPLUS_LANGUAGE_MODEL.toLowerCase()].includes(normalized);
}

function isPapayaProvider(value = "") {
  const normalized = String(value || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  return ["papaya", "papaya10", "papaya1.0", "carrothubpapaya10", "carrothubpapaya1.0"].includes(normalized) || normalized.includes("carrothubpapaya");
}

function normalizeAdvancedProvider(value = "") {
  const normalized = String(value || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (!normalized) return "wan27";
  if (isPapayaProvider(value)) return "papaya";
  if (isByteplusLanguageProvider(value)) return "byteplus-language";
  if (isQwen37FlashProvider(value)) return "qwen37-flash";
  if (isQwenImage3Provider(value)) return "qwen-image3";
  if (isSeedream5ImageProvider(value)) return "seedream5-image";
  if (["zimagespicypro", "zimagespicy", "zimagepro", "zimage", "zimagespicpro"].includes(normalized) || normalized.includes("zimagespicy") || normalized.includes("zimage")) return "z-image-spicy-pro";
  if (["qwenimageeditspicy", "qwenimageeditspic", "qwenimageedit", "qwenimageeditspicpro"].includes(normalized) || normalized.includes("qwenimageedit")) return "qwen-image-edit-spicy";
  if (["seedancensfw", "seedance25nsfw", "seedance2.5nsfw"].includes(normalized) || (normalized.includes("seedance") && normalized.includes("nsfw"))) return SEEDANCE25_DIRECT_PROVIDER;
  if (["seedance25", "seedance2.5", "seedancev25"].includes(normalized) || normalized.includes("seedance25") || normalized.includes("seedance2.5")) return "seedance25";
  if (["wan30", "wan3", "wan3.0", "wan3video", "wan3.0video"].includes(normalized) || normalized.includes("wan30") || normalized.includes("wan3.0")) return "wan30";
  if (["happyhorse", "horse", "hh"].includes(normalized) || normalized.includes("happyhorse")) return "happyhorse";
  if (["wan27", "wan2.7", "wan", "vipeak1", "vp1"].includes(normalized) || normalized.includes("wan27") || normalized.includes("wan2.7") || normalized.includes("vipeak1")) return "wan27";
  if (["seedance", "vipeak2", "vp2"].includes(normalized) || normalized.includes("vipeak2")) return "seedance";
  return "seedance";
}

function isWan27ImageProvider(value = "") {
  const normalized = String(value || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  return ["wan27image", "wan27imageedit", "wan2.7image", "wan2.7imageedit", "wanimage", "wanimageedit", "imageedit", "vipeak1image", "vipeak1imageedit", "vp1image", "vp1imageedit"].includes(normalized);
}

function publicProviderId(value = "") {
  const raw = String(value || "").trim();
  const normalized = raw.toLowerCase().replace(/[\s_-]+/g, "");
  if (!normalized) return "";
  if (isPapayaProvider(raw)) return "papaya";
  if (isByteplusLanguageProvider(raw)) return "byteplus-language";
  if (isQwen37FlashProvider(raw)) return "qwen37-flash";
  if (isQwenImage3Provider(raw)) return "qwen-image3";
  if (isSeedream5ImageProvider(raw)) return "seedream5-image";
  if (["zimagespicypro", "zimagespicy", "zimagepro", "zimage", "zimagespicpro"].includes(normalized) || normalized.includes("zimagespicy") || normalized.includes("zimage")) return "z-image-spicy-pro";
  if (["qwenimageeditspicy", "qwenimageeditspic", "qwenimageedit", "qwenimageeditspicpro"].includes(normalized) || normalized.includes("qwenimageedit")) return "qwen-image-edit-spicy";
  if (["seedancensfw", "seedance25nsfw", "seedance2.5nsfw"].includes(normalized) || (normalized.includes("seedance") && normalized.includes("nsfw"))) return SEEDANCE25_DIRECT_PROVIDER;
  if (["seedance25", "seedance2.5", "seedancev25"].includes(normalized) || normalized.includes("seedance25") || normalized.includes("seedance2.5")) return "seedance25";
  if (["wan30", "wan3", "wan3.0", "wan3video", "wan3.0video"].includes(normalized) || normalized.includes("wan30") || normalized.includes("wan3.0")) return "wan30";
  if (["happyhorse", "horse", "hh"].includes(normalized) || normalized.includes("happyhorse")) return "happyhorse";
  if (isWan27ImageProvider(raw) || ["vipeak1image", "vp1image"].includes(normalized) || normalized.includes("wan27image") || normalized.includes("wan2.7image")) return "wan27-image";
  if (["wan27", "wan2.7", "wan", "vipeak1", "vp1"].includes(normalized) || normalized.includes("wan27") || normalized.includes("wan2.7") || normalized.includes("vipeak1")) return "wan27";
  if (["seedance", "vipeak2", "vp2"].includes(normalized) || normalized.includes("seedance") || normalized.includes("vipeak2") || normalized.includes("dreamina")) return "seedance";
  return raw;
}

function publicProviderLabel(value = "") {
  const id = publicProviderId(value);
  if (id === "papaya") return "Papaya 1.0";
  if (id === "byteplus-language") return "BytePlus Language";
  if (id === "qwen37-flash") return "Qwen3.7 Flash";
  if (id === "qwen-image3") return "Qwen Image 3.0";
  if (id === "seedream5-image") return "Seedream 5.0 Image";
  if (id === "z-image-spicy-pro") return "Z-Image Spicy Pro";
  if (id === "qwen-image-edit-spicy") return "Qwen Image Edit Spicy";
  if (id === SEEDANCE25_DIRECT_PROVIDER) return SEEDANCE25_DIRECT_LABEL;
  if (id === "seedance25") return "Seedance 2.5";
  if (id === "wan30") return "Wan 3.0";
  if (id === "happyhorse") return "HappyHorse";
  if (id === "wan27-image") return "Wan2.7 Image";
  if (id === "wan27") return "Wan2.7";
  if (id === "seedance") return "Seedance 2.0";
  return id;
}

function publicModelText(value = "") {
  return String(value ?? "");
}

function publicModelKey(key = "") {
  return String(key || "");
}

function publicModelValue(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(publicModelValue);
  if (typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [publicModelKey(key), publicModelValue(item)]));
  return typeof value === "string" ? publicModelText(value) : value;
}

function slimGenerationRecordValue(value, { detail = false } = {}) {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    if (/^data:[^;]+;base64,/i.test(value)) {
      return `[dataUrl omitted: ${Buffer.byteLength(value)} bytes]`;
    }
    if (!detail && value.length > 12000) return `${value.slice(0, 12000)}... [truncated ${value.length} chars]`;
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => slimGenerationRecordValue(item, { detail }));
  if (typeof value !== "object") return value;
  const next = {};
  Object.entries(value).forEach(([key, item]) => {
    const normalizedKey = String(key || "").toLowerCase();
    if (normalizedKey === "dataurl" || normalizedKey === "data_url" || normalizedKey === "b64_json" || normalizedKey === "base64") {
      next[key] = typeof item === "string"
        ? `[${key} omitted: ${Buffer.byteLength(item)} bytes]`
        : `[${key} omitted]`;
      return;
    }
    next[key] = slimGenerationRecordValue(item, { detail });
  });
  return next;
}

function storageGenerationRecord(record = {}) {
  if (!record || typeof record !== "object") return record;
  return slimGenerationRecordValue(record, { detail: true });
}

function listGenerationRecordValue(value) {
  return slimGenerationRecordValue(value, { detail: false });
}

function publicPricingValue(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(publicPricingValue);
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => {
      if (key === "provider") return [key, publicProviderId(item)];
      if (key === "providerLabel") return [key, publicProviderLabel(value.provider || item)];
      return [publicModelKey(key), publicPricingValue(item)];
    }));
  }
  return typeof value === "string" ? publicModelText(value) : value;
}

function publicDocsValue(value, key = "") {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((item) => publicDocsValue(item, key));
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([entryKey, item]) => {
      if (entryKey === "provider") return [entryKey, publicProviderId(item)];
      return [publicModelKey(entryKey), publicDocsValue(item, entryKey)];
    }));
  }
  if (typeof value !== "string") return value;
  if (key === "provider") return publicProviderId(value);
  return publicModelText(value);
}

function normalizeSeedanceTier(value = "") {
  return String(value || "").trim().toLowerCase() === "fast" ? "fast" : "standard";
}

module.exports = {
  isSeedream5ImageProvider,
  isQwenImage3Provider,
  isQwen37FlashProvider,
  isByteplusLanguageProvider,
  isPapayaProvider,
  isWan27ImageProvider,
  normalizeAdvancedProvider,
  publicProviderId,
  publicProviderLabel,
  publicModelText,
  publicModelKey,
  publicModelValue,
  slimGenerationRecordValue,
  storageGenerationRecord,
  listGenerationRecordValue,
  publicPricingValue,
  publicDocsValue,
  normalizeSeedanceTier,
};
