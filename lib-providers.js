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
const {
  SEEDANCE25_FLASH_ENDPOINT_ID,
  SEEDANCE25_FLASH_LABEL,
  SEEDANCE25_FLASH_MODEL,
  SEEDANCE25_FLASH_PROVIDER,
} = require("./seedance25-flash");
const {
  isVegaProvider,
  vegaProviderDefinition,
} = require("./tencent-vod-vega");

function isSeedream55ImageProvider(value = "") {
  const normalized = String(value || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  return [
    "seedream55",
    "seedream55image",
    "seedream5.5",
    "seedream5.5image",
    "dolaseedream55261028",
    "ep20261115092454jlm4p",
  ].includes(normalized) || normalized.includes("seedream55") || normalized.includes("seedream5.5");
}

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

function isSeedance25FlashProvider(value = "") {
  const normalized = String(value || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  return [
    "seedance25flash",
    "seedance2.5flash",
    "seedanceflash",
    SEEDANCE25_FLASH_ENDPOINT_ID,
    SEEDANCE25_FLASH_MODEL,
  ].map((item) => String(item || "").toLowerCase().replace(/[\s_-]+/g, "")).includes(normalized)
    || (normalized.includes("seedance") && normalized.includes("flash"));
}

function normalizeAdvancedProvider(value = "") {
  const normalized = String(value || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (!normalized) return "wan27";
  if (isVegaProvider(value)) return vegaProviderDefinition(value).id;
  if (isPapayaProvider(value)) return "papaya";
  if (isByteplusLanguageProvider(value)) return "byteplus-language";
  if (isQwen37FlashProvider(value)) return "qwen37-flash";
  if (isQwenImage3Provider(value)) return "qwen-image3";
  if (isSeedream55ImageProvider(value)) return "seedream55-image";
  if (isSeedream5ImageProvider(value)) return "seedream5-image";
  if (["zimagespicypro", "zimagespicy", "zimagepro", "zimage", "zimagespicpro"].includes(normalized) || normalized.includes("zimagespicy") || normalized.includes("zimage")) return "z-image-spicy-pro";
  if (["qwenimageeditspicy", "qwenimageeditspic", "qwenimageedit", "qwenimageeditspicpro"].includes(normalized) || normalized.includes("qwenimageedit")) return "qwen-image-edit-spicy";
  if (isSeedance25FlashProvider(value)) return SEEDANCE25_FLASH_PROVIDER;
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
  if (isVegaProvider(raw)) return vegaProviderDefinition(raw).id;
  if (isPapayaProvider(raw)) return "papaya";
  if (isByteplusLanguageProvider(raw)) return "byteplus-language";
  if (isQwen37FlashProvider(raw)) return "qwen37-flash";
  if (isQwenImage3Provider(raw)) return "qwen-image3";
  if (isSeedream55ImageProvider(raw)) return "seedream55-image";
  if (isSeedream5ImageProvider(raw)) return "seedream5-image";
  if (["zimagespicypro", "zimagespicy", "zimagepro", "zimage", "zimagespicpro"].includes(normalized) || normalized.includes("zimagespicy") || normalized.includes("zimage")) return "z-image-spicy-pro";
  if (["qwenimageeditspicy", "qwenimageeditspic", "qwenimageedit", "qwenimageeditspicpro"].includes(normalized) || normalized.includes("qwenimageedit")) return "qwen-image-edit-spicy";
  if (isSeedance25FlashProvider(raw)) return SEEDANCE25_FLASH_PROVIDER;
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
  if (isVegaProvider(id)) return vegaProviderDefinition(id).label;
  if (id === "papaya") return "Papaya 1.0";
  if (id === "byteplus-language") return "BytePlus Language";
  if (id === "qwen37-flash") return "Qwen3.7 Flash";
  if (id === "qwen-image3") return "Qwen Image 3.0";
  if (id === "seedream55-image") return "Seedream 5.5";
  if (id === "seedream5-image") return "Seedream 5.0 Image";
  if (id === "z-image-spicy-pro") return "Z-Image Spicy Pro";
  if (id === "qwen-image-edit-spicy") return "Qwen Image Edit Spicy";
  if (id === SEEDANCE25_FLASH_PROVIDER) return SEEDANCE25_FLASH_LABEL;
  if (id === SEEDANCE25_DIRECT_PROVIDER) return SEEDANCE25_DIRECT_LABEL;
  if (id === "seedance25") return "Seedance 2.5";
  if (id === "wan30") return "Wan 3.0";
  if (id === "happyhorse") return "HappyHorse";
  if (id === "wan27-image") return "Wan2.7 Image";
  if (id === "wan27") return "Wan2.7";
  if (id === "seedance") return "Seedance 2.0";
  return id;
}

function publicGenerationDisplayLabel(value = "") {
  const raw = String(value || "").trim();
  const normalized = raw.toLowerCase().replace(/[\s_-]+/g, "");
  if (!normalized) return "";
  if (
    normalized === "seedance25vega"
    || normalized === "seedance2.5vega"
    || normalized === "vega1.5pro"
    || normalized.includes("vega1.5pro")
    || normalized.includes("wandvegavideo1.5pro")
  ) return "seedance2.5vega";
  if (
    normalized === "seedance20vega"
    || normalized === "seedance2.0vega"
    || normalized === "vega1.0pro"
    || normalized.includes("vega1.0pro")
    || normalized.includes("wandvegavideo1.0pro")
  ) return "seedance2.0（vega）";
  return "";
}

function publicGenerationDisplayTitle(record = {}, fallback = "") {
  const provider = record.provider || record.params?.provider || "";
  const alias = publicGenerationDisplayLabel(provider)
    || publicGenerationDisplayLabel(record.templateTitle)
    || publicGenerationDisplayLabel(record.modelLabel)
    || publicGenerationDisplayLabel(record.model);
  if (alias) return alias;
  return String(record.templateTitle || record.sceneName || record.modelLabel || record.model || record.provider || record.taskId || fallback || "").trim();
}

function publicModelText(value = "") {
  return String(value ?? "");
}

function publicGenerationErrorMessage(value = "") {
  const raw = String(value ?? "").replace(/https?:\/\/\S+/gi, "").replace(/\s+/g, " ").trim();
  if (!raw) return "";
  if (/output.?audio.*copyright|outputaudiocopyright|output video contains.*(?:bgm|music)|background music.*copyright|生成结果.*背景音乐.*版权/i.test(raw)) {
    return "生成结果中的音频触发版权限制，通常是自动生成的背景音乐（BGM）导致。平台已加入禁止生成 BGM 的约束，请重新生成；如仍失败，请关闭“生成音频”后再试。";
  }
  if (/copyright|infring(?:e|ement)|版权|侵权/i.test(raw)) {
    return "参考素材可能涉及版权限制，请更换素材后重试。";
  }
  if (/content.?policy|moderation|safety|sensitive|nsfw|violat|prohibited|inappropriate|blocked|risk.?control|审核|违规|敏感|违法|色情|涉黄|内容不(?:合规|安全)/i.test(raw)) {
    return "内容审核未通过，请调整提示词或参考素材后重试。";
  }
  if (/rate.?limit|too many requests|429\b|限流|请求过于频繁/i.test(raw)) {
    return "当前生成请求较多，请稍后再试。";
  }
  if (/insufficient (?:balance|credits?|quota)|balance (?:is )?(?:insufficient|low|zero)|not enough (?:balance|credits?|quota)|out of credits|quota exceeded|payment required|billing|402\b|余额|额度|欠费|积分不足/i.test(raw)) {
    return "生成额度不足，请充值或稍后再试。";
  }
  if (/timeout|timed out|etimedout|econnreset|socket hang up|network|fetch failed|eai_again|enotfound|502\b|503\b|504\b|网络|超时/i.test(raw)) {
    return "生成服务暂时连接失败，本次如已扣积分会自动退回，请稍后重试。";
  }
  if (/unauthorized|invalid.?api.?key|authentication|401\b|403\b|鉴权|认证失败/i.test(raw)) {
    return "生成服务连接异常，本次如已扣积分会自动退回，请稍后重试。";
  }
  if (/invalid|unsupported|validation|bad request|400\b|parameter|not support|参数|不支持/i.test(raw)) {
    return "生成参数不受支持，请调整模型、时长、比例或素材后重试。";
  }
  if (/[\u3400-\u9fff]/.test(raw) && !/[A-Za-z]{4,}/.test(raw)) return raw.slice(0, 160);
  return "生成失败，本次如已扣积分会自动退回。请调整提示词或参考素材后重试，仍有问题请联系客服。";
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
  const next = slimGenerationRecordValue(record, { detail: true });
  // New generation media is durable only in PostgreSQL metadata + object
  // storage. Local paths remain readable for historical migration, but the
  // whole record must never advertise a server-local output as durable.
  if (next && typeof next === "object") {
    for (const key of ["localVideoUrl", "localVideoPath", "localPosterUrl", "localPosterPath", "localImageUrl", "localImagePath"]) {
      if (Object.prototype.hasOwnProperty.call(next, key)) next[key] = "";
    }
  }
  return next;
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
      if (key === "providerLabel") {
        const provider = value.provider || item;
        return [key, publicGenerationDisplayLabel(provider) || publicProviderLabel(provider)];
      }
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
  isSeedream55ImageProvider,
  isSeedream5ImageProvider,
  isQwenImage3Provider,
  isQwen37FlashProvider,
  isSeedance25FlashProvider,
  isByteplusLanguageProvider,
  isPapayaProvider,
  isWan27ImageProvider,
  normalizeAdvancedProvider,
  publicProviderId,
  publicProviderLabel,
  publicGenerationDisplayLabel,
  publicGenerationDisplayTitle,
  publicModelText,
  publicGenerationErrorMessage,
  publicModelKey,
  publicModelValue,
  slimGenerationRecordValue,
  storageGenerationRecord,
  listGenerationRecordValue,
  publicPricingValue,
  publicDocsValue,
  normalizeSeedanceTier,
};
