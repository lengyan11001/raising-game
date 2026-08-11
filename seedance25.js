"use strict";

const SEEDANCE25_MODEL = "bytedance/seedance-2.5";
const SEEDANCE25_MODES = Object.freeze(["omini", "first_last_frame"]);
const SEEDANCE25_RATIOS = Object.freeze(["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"]);
const SEEDANCE25_RESOLUTIONS = Object.freeze(["480p", "720p"]);
const SEEDANCE25_POINTS_PER_SECOND = Object.freeze({ "480p": 60, "720p": 100 });
const SEEDANCE25_CNY_PER_POINT = 0.01;
const SEEDANCE25_CNY_PER_USD = 6.67;
const SEEDANCE25_SITE_CREDITS_PER_USD = 100;

function normalizeSeedance25Mode(value = "") {
  const normalized = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (["first_last_frame", "first_last", "first_and_last", "frames"].includes(normalized)) return "first_last_frame";
  if (!normalized || ["omini", "reference", "reference_video", "multimodal", "multimodal_reference"].includes(normalized)) return "omini";
  return normalized;
}

function seedance25Boolean(value, fallback = true) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  return !["0", "false", "off", "no"].includes(String(value).trim().toLowerCase());
}

function purchaseSiteCreditsPerSecond(resolution = "480p") {
  const normalized = SEEDANCE25_RESOLUTIONS.includes(String(resolution || "").toLowerCase())
    ? String(resolution).toLowerCase()
    : "480p";
  return Number((
    (SEEDANCE25_POINTS_PER_SECOND[normalized] * SEEDANCE25_CNY_PER_POINT / SEEDANCE25_CNY_PER_USD)
    * SEEDANCE25_SITE_CREDITS_PER_USD
  ).toFixed(6));
}

function requestError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = 400;
  error.details = details;
  return error;
}

function uniqueUrls(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => String(value || "").trim()).filter(Boolean))];
}

function validateSeedance25Input(input = {}) {
  const mode = normalizeSeedance25Mode(input.mode || input.functionMode);
  const prompt = String(input.prompt || "").trim();
  const resolution = String(input.resolution || "480p").trim().toLowerCase();
  const ratio = String(input.ratio || input.aspect_ratio || "16:9").trim().toLowerCase();
  const images = uniqueUrls(input.imageFiles || input.image_files);
  const videos = uniqueUrls(input.videoFiles || input.video_files);
  const audios = uniqueUrls(input.audioFiles || input.audio_files);
  const firstFrameUrl = String(input.firstFrameUrl || input.image_url || "").trim();
  const lastFrameUrl = String(input.lastFrameUrl || input.end_image_url || "").trim();
  const generateAudio = seedance25Boolean(input.generateAudio ?? input.generate_audio ?? input.audio, true);

  if (!prompt) throw requestError("SEEDANCE25_PROMPT_REQUIRED", "Prompt is required.");
  if (prompt.length > 5000) throw requestError("SEEDANCE25_PROMPT_TOO_LONG", "Prompt must not exceed 5000 characters.", { max: 5000 });
  if (!SEEDANCE25_MODES.includes(mode)) {
    throw requestError("SEEDANCE25_INVALID_MODE", "Seedance 2.5 supports multimodal references or first + last frame generation.", { allowed: SEEDANCE25_MODES });
  }
  if (!SEEDANCE25_RESOLUTIONS.includes(resolution)) {
    throw requestError("SEEDANCE25_INVALID_RESOLUTION", "Seedance 2.5 resolution must be 480p or 720p.", { allowed: SEEDANCE25_RESOLUTIONS });
  }
  if (!SEEDANCE25_RATIOS.includes(ratio)) {
    throw requestError("SEEDANCE25_INVALID_RATIO", "Seedance 2.5 ratio is not supported.", { allowed: SEEDANCE25_RATIOS });
  }

  const duration = Number(input.duration);
  const maxDuration = resolution === "720p" ? 29 : 30;
  if (!Number.isInteger(duration) || duration < 4 || duration > maxDuration) {
    throw requestError("SEEDANCE25_INVALID_DURATION", `Seedance 2.5 ${resolution.toUpperCase()} duration must be an integer from 4 to ${maxDuration} seconds.`, { min: 4, max: maxDuration, resolution });
  }

  if (mode === "omini") {
    if (images.length > 30) throw requestError("SEEDANCE25_TOO_MANY_IMAGES", "Seedance 2.5 supports at most 30 reference images.");
    if (videos.length > 10) throw requestError("SEEDANCE25_TOO_MANY_VIDEOS", "Seedance 2.5 supports at most 10 reference videos.");
    if (audios.length > 10) throw requestError("SEEDANCE25_TOO_MANY_AUDIOS", "Seedance 2.5 supports at most 10 reference audios.");
    if (images.length + videos.length + audios.length > 50) {
      throw requestError("SEEDANCE25_TOO_MANY_ASSETS", "Seedance 2.5 supports at most 50 reference assets in total.");
    }
    if (!images.length && !videos.length && !audios.length) {
      throw requestError("SEEDANCE25_REFERENCE_REQUIRED", "Multimodal reference mode requires at least one image, video, or audio reference.");
    }
    if (audios.length && !images.length && !videos.length) {
      throw requestError("SEEDANCE25_AUDIO_ONLY_UNSUPPORTED", "Audio references must be combined with an image or video reference.");
    }
  } else {
    if (!firstFrameUrl || !lastFrameUrl) {
      throw requestError("SEEDANCE25_FRAMES_REQUIRED", "First + Last Frame mode requires both images.");
    }
    if (images.length || videos.length || audios.length) {
      throw requestError("SEEDANCE25_INVALID_MEDIA_COMBINATION", "First + Last Frame mode cannot be mixed with reference assets.");
    }
  }

  return { mode, prompt, resolution, ratio, duration, images, videos, audios, firstFrameUrl, lastFrameUrl, generateAudio };
}

function buildSeedance25TaskPayload(input = {}, outerModel = "") {
  const normalized = validateSeedance25Input(input);
  const params = {
    prompt: normalized.prompt,
    duration: normalized.duration,
    resolution: normalized.resolution.toUpperCase(),
    aspect_ratio: normalized.ratio,
    audio: normalized.generateAudio,
  };
  if (normalized.mode === "omini") {
    if (normalized.images.length) params.reference_image_urls = normalized.images;
    if (normalized.videos.length) params.reference_video_urls = normalized.videos;
    if (normalized.audios.length) params.reference_audio_urls = normalized.audios;
  } else {
    params.image_url = normalized.firstFrameUrl;
    params.end_image_url = normalized.lastFrameUrl;
  }
  return {
    model: String(outerModel || SEEDANCE25_MODEL).trim(),
    params,
    channel: null,
    callback_url: null,
  };
}

module.exports = {
  SEEDANCE25_CNY_PER_POINT,
  SEEDANCE25_CNY_PER_USD,
  SEEDANCE25_MODEL,
  SEEDANCE25_MODES,
  SEEDANCE25_POINTS_PER_SECOND,
  SEEDANCE25_RESOLUTIONS,
  SEEDANCE25_RATIOS,
  SEEDANCE25_SITE_CREDITS_PER_USD,
  buildSeedance25TaskPayload,
  normalizeSeedance25Mode,
  purchaseSiteCreditsPerSecond,
  validateSeedance25Input,
};
