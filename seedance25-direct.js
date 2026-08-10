"use strict";

const SEEDANCE25_DIRECT_PROVIDER = "seedance-nsfw";
const SEEDANCE25_DIRECT_LABEL = "Seedance (NSFW)";
const SEEDANCE25_DIRECT_MODEL = "dreamina-seedance-2-5-260628";
const SEEDANCE25_DIRECT_ENDPOINT_ID = "ep-20260810163546-xzn5m";
const SEEDANCE25_DIRECT_RESOLUTIONS = Object.freeze(["480p", "720p"]);
const SEEDANCE25_DIRECT_RATIOS = Object.freeze(["16:9", "21:9", "9:16", "4:3", "3:4", "1:1", "adaptive"]);
const SEEDANCE25_DIRECT_USD_PER_MILLION_TOKENS = Object.freeze({
  withoutVideo: 10.7,
  withVideo: 6.4,
});
const SEEDANCE25_DIRECT_FRAME_SIZE = Object.freeze({
  "480p": Object.freeze({ width: 854, height: 480 }),
  "720p": Object.freeze({ width: 1280, height: 720 }),
});
const SEEDANCE25_DIRECT_FPS = 24;

function normalizeSeedance25DirectMode(value = "") {
  const normalized = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (["edit", "video_edit"].includes(normalized)) return "edit";
  if (["extend", "video_extend", "extension"].includes(normalized)) return "extend";
  if (["first_last_frame", "first_last", "first_and_last", "frames"].includes(normalized)) return "first_last_frame";
  return "omini";
}

function directPurchaseUsdPerSecond(resolution = "480p", { hasVideoInput = false } = {}) {
  const normalizedResolution = SEEDANCE25_DIRECT_RESOLUTIONS.includes(String(resolution || "").toLowerCase())
    ? String(resolution).toLowerCase()
    : "480p";
  const size = SEEDANCE25_DIRECT_FRAME_SIZE[normalizedResolution];
  const tokensPerSecond = (size.width * size.height * SEEDANCE25_DIRECT_FPS) / 1024;
  const usdPerMillionTokens = hasVideoInput
    ? SEEDANCE25_DIRECT_USD_PER_MILLION_TOKENS.withVideo
    : SEEDANCE25_DIRECT_USD_PER_MILLION_TOKENS.withoutVideo;
  return Number(((tokensPerSecond * usdPerMillionTokens) / 1_000_000).toFixed(8));
}

function directEstimatedCompletionTokens({ resolution = "480p", outputSeconds = 4, inputVideoSeconds = 0 } = {}) {
  const normalizedResolution = SEEDANCE25_DIRECT_RESOLUTIONS.includes(String(resolution || "").toLowerCase())
    ? String(resolution).toLowerCase()
    : "480p";
  const size = SEEDANCE25_DIRECT_FRAME_SIZE[normalizedResolution];
  const totalSeconds = Math.max(0, Number(outputSeconds || 0)) + Math.max(0, Number(inputVideoSeconds || 0));
  return Math.ceil((totalSeconds * size.width * size.height * SEEDANCE25_DIRECT_FPS) / 1024);
}

function directInputError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = 400;
  error.details = details;
  return error;
}

function uniqueUris(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => String(value || "").trim()).filter(Boolean))];
}

function validateSeedance25DirectInput(input = {}) {
  const mode = normalizeSeedance25DirectMode(input.mode || input.functionMode);
  const prompt = String(input.prompt || "").trim();
  const resolution = String(input.resolution || "480p").trim().toLowerCase();
  const ratio = String(input.ratio || "adaptive").trim().toLowerCase();
  const images = uniqueUris(input.imageAssets || input.imageFiles);
  const videos = uniqueUris(input.videoAssets || input.videoFiles);
  const audios = uniqueUris(input.audioAssets || input.audioFiles);
  const firstFrameAsset = String(input.firstFrameAsset || input.firstFrameUrl || "").trim();
  const lastFrameAsset = String(input.lastFrameAsset || input.lastFrameUrl || "").trim();
  const seed = input.seed === "" || input.seed === undefined || input.seed === null ? null : Number(input.seed);
  const generateAudio = input.generateAudio !== false && input.generate_audio !== false;

  if (!prompt && !images.length && !videos.length && !audios.length && !firstFrameAsset) {
    throw directInputError("SEEDANCE25_DIRECT_CONTENT_REQUIRED", "Prompt or reference media is required.");
  }
  if (prompt.length > 6000) throw directInputError("SEEDANCE25_DIRECT_PROMPT_TOO_LONG", "Prompt must not exceed 6000 characters.", { max: 6000 });
  if (!SEEDANCE25_DIRECT_RESOLUTIONS.includes(resolution)) {
    throw directInputError("SEEDANCE25_DIRECT_INVALID_RESOLUTION", "Seedance (NSFW) resolution must be 480p or 720p.", { allowed: SEEDANCE25_DIRECT_RESOLUTIONS });
  }
  if (!SEEDANCE25_DIRECT_RATIOS.includes(ratio)) {
    throw directInputError("SEEDANCE25_DIRECT_INVALID_RATIO", "Seedance (NSFW) ratio is not supported.", { allowed: SEEDANCE25_DIRECT_RATIOS });
  }
  if (seed !== null && (!Number.isInteger(seed) || seed < -1 || seed > 4294967295)) {
    throw directInputError("SEEDANCE25_DIRECT_INVALID_SEED", "Seed must be -1 or an integer from 0 to 4294967295.");
  }

  let duration = Number(input.duration);
  if (mode === "edit" && Number(input.inputVideoSeconds) > 0) duration = Math.ceil(Number(input.inputVideoSeconds));
  if (!Number.isInteger(duration) || duration < 4 || duration > 30) {
    throw directInputError("SEEDANCE25_DIRECT_INVALID_DURATION", "Seedance (NSFW) duration must be an integer from 4 to 30 seconds.", { min: 4, max: 30 });
  }

  if (mode === "omini") {
    if (images.length > 30) throw directInputError("SEEDANCE25_DIRECT_TOO_MANY_IMAGES", "Seedance (NSFW) supports at most 30 reference images.");
    if (videos.length > 10) throw directInputError("SEEDANCE25_DIRECT_TOO_MANY_VIDEOS", "Seedance (NSFW) supports at most 10 reference videos.");
    if (audios.length > 10) throw directInputError("SEEDANCE25_DIRECT_TOO_MANY_AUDIOS", "Seedance (NSFW) supports at most 10 reference audios.");
    if (images.length + videos.length + audios.length > 50) throw directInputError("SEEDANCE25_DIRECT_TOO_MANY_ASSETS", "Seedance (NSFW) supports at most 50 reference assets in total.");
  } else if (mode === "edit" || mode === "extend") {
    if (videos.length !== 1) throw directInputError("SEEDANCE25_DIRECT_SOURCE_VIDEO_REQUIRED", `${mode === "edit" ? "Video edit" : "Video extend"} requires exactly one source video.`);
    if (images.length || audios.length || firstFrameAsset || lastFrameAsset) {
      throw directInputError("SEEDANCE25_DIRECT_INVALID_MEDIA_COMBINATION", `${mode === "edit" ? "Video edit" : "Video extend"} only accepts one source video.`);
    }
  } else if (mode === "first_last_frame") {
    if (!firstFrameAsset || !lastFrameAsset) throw directInputError("SEEDANCE25_DIRECT_FRAMES_REQUIRED", "First + Last Frame mode requires both images.");
    if (images.length || videos.length || audios.length) throw directInputError("SEEDANCE25_DIRECT_INVALID_MEDIA_COMBINATION", "First + Last Frame mode cannot be mixed with reference assets.");
  }

  return { mode, prompt, resolution, ratio, duration, images, videos, audios, firstFrameAsset, lastFrameAsset, seed, generateAudio };
}

function buildSeedance25DirectTaskPayload(input = {}, endpointId = SEEDANCE25_DIRECT_ENDPOINT_ID) {
  const normalized = validateSeedance25DirectInput(input);
  const content = [];
  if (normalized.prompt) content.push({ type: "text", text: normalized.prompt });
  if (normalized.mode === "first_last_frame") {
    content.push({ type: "image_url", image_url: { url: normalized.firstFrameAsset }, role: "first_frame" });
    content.push({ type: "image_url", image_url: { url: normalized.lastFrameAsset }, role: "last_frame" });
  } else {
    normalized.images.forEach((url) => content.push({ type: "image_url", image_url: { url }, role: "reference_image" }));
    normalized.videos.forEach((url) => content.push({ type: "video_url", video_url: { url }, role: "reference_video" }));
    normalized.audios.forEach((url) => content.push({ type: "audio_url", audio_url: { url }, role: "reference_audio" }));
  }
  const payload = {
    model: String(endpointId || SEEDANCE25_DIRECT_ENDPOINT_ID).trim(),
    content,
    ratio: normalized.ratio,
    resolution: normalized.resolution,
    duration: normalized.duration,
    generate_audio: normalized.generateAudio,
    output_format: "mp4",
    watermark: false,
    Moderation: { Strategy: "Skip" },
  };
  if (normalized.seed !== null) payload.seed = normalized.seed;
  return payload;
}

module.exports = {
  SEEDANCE25_DIRECT_ENDPOINT_ID,
  SEEDANCE25_DIRECT_FPS,
  SEEDANCE25_DIRECT_FRAME_SIZE,
  SEEDANCE25_DIRECT_LABEL,
  SEEDANCE25_DIRECT_MODEL,
  SEEDANCE25_DIRECT_PROVIDER,
  SEEDANCE25_DIRECT_RATIOS,
  SEEDANCE25_DIRECT_RESOLUTIONS,
  SEEDANCE25_DIRECT_USD_PER_MILLION_TOKENS,
  buildSeedance25DirectTaskPayload,
  directEstimatedCompletionTokens,
  directPurchaseUsdPerSecond,
  normalizeSeedance25DirectMode,
  validateSeedance25DirectInput,
};
