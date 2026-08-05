"use strict";

const QWEN_IMAGE3_MODELS = Object.freeze({
  pro: "qwen-image-3.0-pro",
  standard: "qwen-image-3.0",
});

const QWEN_IMAGE3_REFERENCE_LIMIT = 3;
const QWEN_IMAGE3_OUTPUT_MIN = 1;
const QWEN_IMAGE3_OUTPUT_MAX = 6;
const QWEN_IMAGE3_SIZE_MIN_PIXELS = 512 * 512;
const QWEN_IMAGE3_SIZE_MAX_PIXELS = 2048 * 2048;
const QWEN_IMAGE3_SEED_MAX = 2147483647;

const QWEN_IMAGE3_OFFICIAL_USD = Object.freeze({
  pro: Object.freeze({
    inputPerReferenceImage: 0.00275,
    outputPerImage: Object.freeze({ "1K": 0.03438, "2K": 0.068761 }),
  }),
  standard: Object.freeze({
    inputPerReferenceImage: 0.00275,
    outputPerImage: Object.freeze({ "1K": 0.024754, "2K": 0.024754 }),
  }),
});

const QWEN_IMAGE3_ADVANCED_SIZES = Object.freeze({
  "1K": Object.freeze({
    "1:1": "1024*1024",
    "3:4": "896*1152",
    "4:3": "1152*896",
    "9:16": "768*1360",
    "16:9": "1360*768",
  }),
  "2K": Object.freeze({
    "1:1": "2048*2048",
    "3:4": "1776*2360",
    "4:3": "2360*1776",
    "9:16": "1536*2728",
    "16:9": "2728*1536",
  }),
});

function qwenImage3Error(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = 400;
  error.details = details;
  return error;
}

function normalizeQwenImage3Tier(value = "", model = "") {
  const normalized = String(value || model || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (normalized === "standard" || normalized === "qwenimage3.0" || normalized === "qwenimage30") return "standard";
  return "pro";
}

function qwenImage3ModelForTier(tier = "pro", model = "") {
  const requested = String(model || "").trim().toLowerCase();
  if (requested === QWEN_IMAGE3_MODELS.standard) return QWEN_IMAGE3_MODELS.standard;
  if (requested === QWEN_IMAGE3_MODELS.pro) return QWEN_IMAGE3_MODELS.pro;
  return QWEN_IMAGE3_MODELS[normalizeQwenImage3Tier(tier, requested)];
}

function normalizeQwenImage3Resolution(value = "2K") {
  const normalized = String(value || "2K").trim().toUpperCase();
  return normalized === "1K" ? "1K" : "2K";
}

function normalizeQwenImage3Ratio(value = "1:1") {
  const normalized = String(value || "1:1").trim().toLowerCase().replace("/", ":");
  return ["1:1", "3:4", "4:3", "9:16", "16:9"].includes(normalized) ? normalized : "1:1";
}

function parseQwenImage3Size(value = "") {
  const match = String(value || "").trim().match(/^(\d{3,5})\s*[x*]\s*(\d{3,5})$/i);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  return { width, height, pixels: width * height, ratio: width / height, value: `${width}*${height}` };
}

function validateQwenImage3Size(value = "") {
  const parsed = parseQwenImage3Size(value);
  if (!parsed) {
    throw qwenImage3Error("QWEN_IMAGE3_INVALID_SIZE", "Qwen Image 3.0 size must use width*height.");
  }
  if (parsed.pixels < QWEN_IMAGE3_SIZE_MIN_PIXELS || parsed.pixels > QWEN_IMAGE3_SIZE_MAX_PIXELS) {
    throw qwenImage3Error("QWEN_IMAGE3_INVALID_SIZE", "Qwen Image 3.0 output pixel area must be from 512*512 through 2048*2048.");
  }
  if (parsed.ratio < 1 / 8 || parsed.ratio > 8) {
    throw qwenImage3Error("QWEN_IMAGE3_INVALID_RATIO", "Qwen Image 3.0 output aspect ratio must be from 1:8 through 8:1.");
  }
  return parsed;
}

function qwenImage3Size({ size = "", resolution = "2K", ratio = "1:1" } = {}) {
  if (String(size || "").trim() && !/^[12]k$/i.test(String(size).trim())) {
    return validateQwenImage3Size(size).value;
  }
  const normalizedResolution = normalizeQwenImage3Resolution(size || resolution);
  const normalizedRatio = normalizeQwenImage3Ratio(ratio);
  return QWEN_IMAGE3_ADVANCED_SIZES[normalizedResolution][normalizedRatio];
}

function qwenImage3ResolutionForSize(size = "", fallback = "2K") {
  const parsed = parseQwenImage3Size(size);
  if (!parsed) return normalizeQwenImage3Resolution(fallback);
  return parsed.pixels <= 1152 * 1152 ? "1K" : "2K";
}

function normalizeReferenceImages(values = []) {
  const images = (Array.isArray(values) ? values : [values])
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (!item || typeof item !== "object") return "";
      return String(item.url || item.imageUrl || item.image_url || item.dataUrl || item.assetUri || "").trim();
    })
    .filter(Boolean);
  if (images.length > QWEN_IMAGE3_REFERENCE_LIMIT) {
    throw qwenImage3Error("QWEN_IMAGE3_TOO_MANY_REFERENCES", `Qwen Image 3.0 supports at most ${QWEN_IMAGE3_REFERENCE_LIMIT} reference images.`);
  }
  return [...new Set(images)];
}

function normalizeOutputCount(value = 1) {
  const count = Number(value ?? 1);
  if (!Number.isInteger(count) || count < QWEN_IMAGE3_OUTPUT_MIN || count > QWEN_IMAGE3_OUTPUT_MAX) {
    throw qwenImage3Error("QWEN_IMAGE3_INVALID_OUTPUT_COUNT", `Qwen Image 3.0 output count must be an integer from ${QWEN_IMAGE3_OUTPUT_MIN} to ${QWEN_IMAGE3_OUTPUT_MAX}.`);
  }
  return count;
}

function normalizeSeed(value) {
  if (value === undefined || value === null || value === "") return null;
  const seed = Number(value);
  if (!Number.isInteger(seed) || seed < 0 || seed > QWEN_IMAGE3_SEED_MAX) {
    throw qwenImage3Error("QWEN_IMAGE3_INVALID_SEED", `Qwen Image 3.0 seed must be an integer from 0 to ${QWEN_IMAGE3_SEED_MAX}.`);
  }
  return seed;
}

function buildQwenImage3Request(input = {}) {
  const prompt = String(input.prompt || "").trim();
  if (!prompt) throw qwenImage3Error("QWEN_IMAGE3_PROMPT_REQUIRED", "Prompt is required.");
  const references = normalizeReferenceImages(input.referenceImages || input.images || []);
  const tier = normalizeQwenImage3Tier(input.tier, input.model);
  const model = qwenImage3ModelForTier(tier, input.model);
  const size = qwenImage3Size(input);
  const n = normalizeOutputCount(input.n ?? input.outputImageCount ?? 1);
  const seed = normalizeSeed(input.seed);
  const promptExtend = input.promptExtend !== false && input.prompt_extend !== false;
  const requestedPromptExtendMode = String(input.promptExtendMode || input.prompt_extend_mode || "").trim().toLowerCase();
  const promptExtendMode = references.length || requestedPromptExtendMode !== "agent" ? "direct" : "agent";
  const content = [
    ...references.map((image) => ({ image })),
    { text: prompt },
  ];
  const parameters = {
    size,
    n,
    prompt_extend: promptExtend,
    prompt_extend_mode: promptExtendMode,
    watermark: input.watermark === true,
  };
  const negativePrompt = String(input.negativePrompt || input.negative_prompt || "").trim();
  if (negativePrompt) parameters.negative_prompt = negativePrompt;
  if (seed !== null) parameters.seed = seed;
  return {
    model,
    input: { messages: [{ role: "user", content }] },
    parameters,
  };
}

function qwenImage3OfficialPricing({ tier = "pro", model = "", resolution = "2K", size = "", referenceImageCount = 0, outputImageCount = 1 } = {}) {
  const normalizedTier = normalizeQwenImage3Tier(tier, model);
  const normalizedResolution = size ? qwenImage3ResolutionForSize(size, resolution) : normalizeQwenImage3Resolution(resolution);
  const references = Math.max(0, Math.min(QWEN_IMAGE3_REFERENCE_LIMIT, Math.floor(Number(referenceImageCount) || 0)));
  const outputs = normalizeOutputCount(outputImageCount);
  const rates = QWEN_IMAGE3_OFFICIAL_USD[normalizedTier];
  const inputUsd = references * rates.inputPerReferenceImage;
  const outputUsd = outputs * rates.outputPerImage[normalizedResolution];
  return {
    tier: normalizedTier,
    model: QWEN_IMAGE3_MODELS[normalizedTier],
    resolution: normalizedResolution,
    referenceImageCount: references,
    outputImageCount: outputs,
    inputUsdPerReferenceImage: rates.inputPerReferenceImage,
    outputUsdPerImage: rates.outputPerImage[normalizedResolution],
    inputUsd,
    outputUsd,
    totalUsd: inputUsd + outputUsd,
  };
}

function qwenImage3OutputUrls(raw = {}) {
  const content = raw?.output?.choices?.flatMap((choice) => choice?.message?.content || []) || [];
  const direct = [
    ...content.map((item) => item?.image || item?.url || item?.image_url),
    ...(Array.isArray(raw?.output?.images) ? raw.output.images.map((item) => item?.url || item?.image || item?.image_url) : []),
    ...(Array.isArray(raw?.data) ? raw.data.map((item) => item?.url || item?.image || item?.image_url) : []),
  ];
  return [...new Set(direct.map((item) => String(item || "").trim()).filter(Boolean))];
}

module.exports = {
  QWEN_IMAGE3_ADVANCED_SIZES,
  QWEN_IMAGE3_MODELS,
  QWEN_IMAGE3_OFFICIAL_USD,
  QWEN_IMAGE3_OUTPUT_MAX,
  QWEN_IMAGE3_OUTPUT_MIN,
  QWEN_IMAGE3_REFERENCE_LIMIT,
  QWEN_IMAGE3_SEED_MAX,
  QWEN_IMAGE3_SIZE_MAX_PIXELS,
  QWEN_IMAGE3_SIZE_MIN_PIXELS,
  buildQwenImage3Request,
  normalizeQwenImage3Resolution,
  normalizeQwenImage3Tier,
  qwenImage3ModelForTier,
  qwenImage3OfficialPricing,
  qwenImage3OutputUrls,
  qwenImage3ResolutionForSize,
  qwenImage3Size,
  validateQwenImage3Size,
};
