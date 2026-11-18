"use strict";

const {
  SEEDANCE25_DIRECT_SEED_MAX,
  normalizeOptionalSeed,
} = require("./seed-options");
const {
  seedanceContentWithNoBgm,
  seedancePromptWithNoBgm,
} = require("./seedance-prompt");

const SEEDANCE25_FLASH_PROVIDER = "seedance25-flash";
const SEEDANCE25_FLASH_LABEL = "Seedance 2.5 Flash";
const SEEDANCE25_FLASH_ENDPOINT_ID = "ep-20261115193626-r5s4f";
const SEEDANCE25_FLASH_MODEL = "dreamina-seedance-2-5-flash-261115";
const SEEDANCE25_FLASH_RESOLUTIONS = Object.freeze(["480p", "720p"]);
const SEEDANCE25_FLASH_RATIOS = Object.freeze(["16:9", "21:9", "9:16", "4:3", "3:4", "1:1", "adaptive"]);
const SEEDANCE25_FLASH_USD_PER_MILLION_TOKENS = Object.freeze({
  withoutVideo: 7.0,
  withVideo: 4.3,
});
const SEEDANCE25_FLASH_FRAME_SIZE = Object.freeze({
  "480p": Object.freeze({ width: 854, height: 480 }),
  "720p": Object.freeze({ width: 1280, height: 720 }),
});
const SEEDANCE25_FLASH_FPS = 24;

function normalizeSeedance25FlashMode(value = "") {
  const normalized = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (["first_last_frame", "first_last", "first_and_last", "frames"].includes(normalized)) return "first_last_frame";
  if (["", "reference", "reference_video", "multi_reference", "multimodal", "text_to_video", "image_to_video", "omini"].includes(normalized)) return "omini";
  return normalized;
}

function flashInputError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = 400;
  error.details = details;
  return error;
}

function uniqueUris(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => String(value || "").trim()).filter(Boolean))];
}

function flashAssetUri(value, kind, index) {
  const uri = String(value || "").trim();
  if (!/^asset:\/\/[^/]+$/i.test(uri)) {
    throw flashInputError("SEEDANCE25_FLASH_INVALID_MEDIA_URL", `Seedance 2.5 Flash ${kind} ${index + 1} must reference an uploaded asset.`);
  }
  return uri;
}

function validateSeedance25FlashInput(input = {}) {
  const mode = normalizeSeedance25FlashMode(input.mode || input.functionMode || input.seedanceMode);
  const prompt = String(input.prompt || "").trim();
  const resolution = String(input.resolution || "480p").trim().toLowerCase();
  const ratio = String(input.ratio || "adaptive").trim().toLowerCase();
  const images = uniqueUris(input.imageAssets || input.imageFiles);
  const videos = uniqueUris(input.videoAssets || input.videoFiles);
  const audios = uniqueUris(input.audioAssets || input.audioFiles);
  const firstFrameAsset = String(input.firstFrameAsset || input.firstFrameUrl || "").trim();
  const lastFrameAsset = String(input.lastFrameAsset || input.lastFrameUrl || "").trim();
  const seed = normalizeOptionalSeed(input.seed, { max: SEEDANCE25_DIRECT_SEED_MAX }) ?? null;
  const generateAudio = input.generateAudio !== false && input.generate_audio !== false;

  if (!["omini", "first_last_frame"].includes(mode)) {
    throw flashInputError("SEEDANCE25_FLASH_INVALID_MODE", "Seedance 2.5 Flash supports reference and first + last frame modes.", { allowed: ["omini", "first_last_frame"] });
  }
  if (!prompt && !images.length && !videos.length && !audios.length && !firstFrameAsset) {
    throw flashInputError("SEEDANCE25_FLASH_CONTENT_REQUIRED", "Prompt or reference media is required.");
  }
  if (prompt.length > 6000) throw flashInputError("SEEDANCE25_FLASH_PROMPT_TOO_LONG", "Prompt must not exceed 6000 characters.", { max: 6000 });
  if (!SEEDANCE25_FLASH_RESOLUTIONS.includes(resolution)) {
    throw flashInputError("SEEDANCE25_FLASH_INVALID_RESOLUTION", "Seedance 2.5 Flash resolution must be 480p or 720p.", { allowed: SEEDANCE25_FLASH_RESOLUTIONS });
  }
  if (!SEEDANCE25_FLASH_RATIOS.includes(ratio)) {
    throw flashInputError("SEEDANCE25_FLASH_INVALID_RATIO", "Seedance 2.5 Flash ratio is not supported.", { allowed: SEEDANCE25_FLASH_RATIOS });
  }
  const duration = Number(input.duration);
  if (!Number.isInteger(duration) || duration < 4 || duration > 30) {
    throw flashInputError("SEEDANCE25_FLASH_INVALID_DURATION", "Seedance 2.5 Flash duration must be an integer from 4 to 30 seconds.", { min: 4, max: 30 });
  }

  const validatedImages = images.map((uri, index) => flashAssetUri(uri, "image", index));
  const validatedVideos = videos.map((uri, index) => flashAssetUri(uri, "video", index));
  const validatedAudios = audios.map((uri, index) => flashAssetUri(uri, "audio", index));
  let validatedFirstFrame = firstFrameAsset ? flashAssetUri(firstFrameAsset, "first frame", 0) : "";
  let validatedLastFrame = lastFrameAsset ? flashAssetUri(lastFrameAsset, "last frame", 0) : "";

  if (mode === "first_last_frame") {
    if (!validatedFirstFrame || !validatedLastFrame) {
      throw flashInputError("SEEDANCE25_FLASH_FRAMES_REQUIRED", "First + Last Frame mode requires both images.");
    }
    if (validatedImages.length || validatedVideos.length || validatedAudios.length) {
      throw flashInputError("SEEDANCE25_FLASH_INVALID_MEDIA_COMBINATION", "First + Last Frame mode cannot be mixed with reference assets.");
    }
  } else {
    if (validatedFirstFrame || validatedLastFrame) {
      throw flashInputError("SEEDANCE25_FLASH_INVALID_MEDIA_COMBINATION", "First + Last Frame images require first_last_frame mode.");
    }
    if (validatedImages.length > 10) throw flashInputError("SEEDANCE25_FLASH_TOO_MANY_IMAGES", "Seedance 2.5 Flash supports at most 10 reference images.", { max: 10 });
    if (validatedVideos.length > 5) throw flashInputError("SEEDANCE25_FLASH_TOO_MANY_VIDEOS", "Seedance 2.5 Flash supports at most 5 reference videos.", { max: 5 });
    if (validatedAudios.length > 5) throw flashInputError("SEEDANCE25_FLASH_TOO_MANY_AUDIOS", "Seedance 2.5 Flash supports at most 5 reference audios.", { max: 5 });
    if (validatedImages.length + validatedVideos.length + validatedAudios.length > 20) {
      throw flashInputError("SEEDANCE25_FLASH_TOO_MANY_ASSETS", "Seedance 2.5 Flash supports at most 20 reference assets in total.", { max: 20 });
    }
  }

  return {
    mode,
    prompt,
    resolution,
    ratio,
    duration,
    images: validatedImages,
    videos: validatedVideos,
    audios: validatedAudios,
    firstFrameAsset: validatedFirstFrame,
    lastFrameAsset: validatedLastFrame,
    seed,
    generateAudio,
  };
}

function buildSeedance25FlashTaskPayload(input = {}, endpointId = SEEDANCE25_FLASH_ENDPOINT_ID) {
  const normalized = validateSeedance25FlashInput(input);
  const content = [];
  if (normalized.prompt) content.push({ type: "text", text: seedancePromptWithNoBgm(normalized.prompt) });
  if (normalized.mode === "first_last_frame") {
    content.push({ type: "image_url", image_url: { url: normalized.firstFrameAsset }, role: "first_frame" });
    content.push({ type: "image_url", image_url: { url: normalized.lastFrameAsset }, role: "last_frame" });
  } else {
    normalized.images.forEach((url) => content.push({ type: "image_url", image_url: { url }, role: "reference_image" }));
    normalized.videos.forEach((url) => content.push({ type: "video_url", video_url: { url }, role: "reference_video" }));
    normalized.audios.forEach((url) => content.push({ type: "audio_url", audio_url: { url }, role: "reference_audio" }));
  }
  const payload = {
    model: String(endpointId || SEEDANCE25_FLASH_ENDPOINT_ID).trim(),
    content: seedanceContentWithNoBgm(content),
    resolution: normalized.resolution,
    duration: normalized.duration,
    generate_audio: normalized.generateAudio,
    output_format: "mp4",
    watermark: false,
  };
  if (normalized.mode !== "first_last_frame") payload.ratio = normalized.ratio;
  if (normalized.seed !== null) payload.seed = normalized.seed;
  return payload;
}

function flashEstimatedCompletionTokens({ resolution = "480p", outputSeconds = 4, inputVideoSeconds = 0 } = {}) {
  const normalizedResolution = SEEDANCE25_FLASH_RESOLUTIONS.includes(String(resolution || "").toLowerCase())
    ? String(resolution).toLowerCase()
    : "480p";
  const size = SEEDANCE25_FLASH_FRAME_SIZE[normalizedResolution];
  const totalSeconds = Math.max(0, Number(outputSeconds || 0)) + Math.max(0, Number(inputVideoSeconds || 0));
  return Math.ceil((totalSeconds * size.width * size.height * SEEDANCE25_FLASH_FPS) / 1024);
}

function flashPurchaseUsdPerSecond(resolution = "480p", { hasVideoInput = false } = {}) {
  const normalizedResolution = SEEDANCE25_FLASH_RESOLUTIONS.includes(String(resolution || "").toLowerCase())
    ? String(resolution).toLowerCase()
    : "480p";
  const size = SEEDANCE25_FLASH_FRAME_SIZE[normalizedResolution];
  const tokensPerSecond = (size.width * size.height * SEEDANCE25_FLASH_FPS) / 1024;
  const usdPerMillionTokens = hasVideoInput
    ? SEEDANCE25_FLASH_USD_PER_MILLION_TOKENS.withVideo
    : SEEDANCE25_FLASH_USD_PER_MILLION_TOKENS.withoutVideo;
  return Number(((tokensPerSecond * usdPerMillionTokens) / 1_000_000).toFixed(8));
}

module.exports = {
  SEEDANCE25_FLASH_ENDPOINT_ID,
  SEEDANCE25_FLASH_FPS,
  SEEDANCE25_FLASH_FRAME_SIZE,
  SEEDANCE25_FLASH_LABEL,
  SEEDANCE25_FLASH_MODEL,
  SEEDANCE25_FLASH_PROVIDER,
  SEEDANCE25_FLASH_RATIOS,
  SEEDANCE25_FLASH_RESOLUTIONS,
  SEEDANCE25_FLASH_USD_PER_MILLION_TOKENS,
  buildSeedance25FlashTaskPayload,
  flashEstimatedCompletionTokens,
  flashPurchaseUsdPerSecond,
  normalizeSeedance25FlashMode,
  validateSeedance25FlashInput,
};
