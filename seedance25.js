"use strict";

const SEEDANCE25_MODES = Object.freeze(["omini", "edit", "extend", "first_last_frame"]);
const SEEDANCE25_RATIOS = Object.freeze(["16:9", "21:9", "9:16", "4:3", "3:4", "1:1", "adaptive"]);
const SEEDANCE25_RESOLUTIONS = Object.freeze(["480p", "720p"]);
const SEEDANCE25_INNER_MODEL = "Seedance_2.5";
const SEEDANCE25_POINTS_PER_SECOND = Object.freeze({ "480p": 130, "720p": 260 });
const SEEDANCE25_CNY_PER_POINT = 0.01;
const SEEDANCE25_CNY_PER_USD = 6.67;
const SEEDANCE25_SITE_CREDITS_PER_USD = 100;

function normalizeSeedance25Mode(value = "") {
  const normalized = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (["edit", "video_edit"].includes(normalized)) return "edit";
  if (["extend", "video_extend", "extension"].includes(normalized)) return "extend";
  if (["first_last_frame", "first_last", "first_and_last", "frames"].includes(normalized)) return "first_last_frame";
  return "omini";
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
  const requestedRatio = String(input.ratio || "adaptive").trim().toLowerCase();
  const ratio = mode === "omini" ? requestedRatio : "adaptive";
  const images = uniqueUrls(input.imageFiles || input.image_files);
  const videos = uniqueUrls(input.videoFiles || input.video_files);
  const audios = uniqueUrls(input.audioFiles || input.audio_files);
  const firstFrameUrl = String(input.firstFrameUrl || input.image_url || "").trim();
  const lastFrameUrl = String(input.lastFrameUrl || input.end_image_url || "").trim();
  const seed = input.seed === "" || input.seed === undefined || input.seed === null ? null : Number(input.seed);

  if (!prompt) throw requestError("SEEDANCE25_PROMPT_REQUIRED", "Prompt is required.");
  if (prompt.length > 6000) throw requestError("SEEDANCE25_PROMPT_TOO_LONG", "Prompt must not exceed 6000 characters.", { max: 6000 });
  if (!SEEDANCE25_RESOLUTIONS.includes(resolution)) {
    throw requestError("SEEDANCE25_INVALID_RESOLUTION", "Seedance 2.5 resolution must be 480p or 720p.", { allowed: SEEDANCE25_RESOLUTIONS });
  }
  if (!SEEDANCE25_RATIOS.includes(ratio)) {
    throw requestError("SEEDANCE25_INVALID_RATIO", "Seedance 2.5 ratio is not supported.", { allowed: SEEDANCE25_RATIOS });
  }
  if (seed !== null && (!Number.isInteger(seed) || seed < 0 || seed > 4294967295)) {
    throw requestError("SEEDANCE25_INVALID_SEED", "Seed must be an integer from 0 to 4294967295.");
  }

  let duration = null;
  if (mode !== "edit") {
    duration = Number(input.duration);
    if (!Number.isInteger(duration) || duration < 4 || duration > 30) {
      throw requestError("SEEDANCE25_INVALID_DURATION", "Seedance 2.5 duration must be an integer from 4 to 30 seconds.", { min: 4, max: 30 });
    }
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
  } else if (mode === "edit" || mode === "extend") {
    if (videos.length !== 1) throw requestError("SEEDANCE25_SOURCE_VIDEO_REQUIRED", `${mode === "edit" ? "Video edit" : "Video extend"} requires exactly one source video.`);
    if (images.length || audios.length || firstFrameUrl || lastFrameUrl) {
      throw requestError("SEEDANCE25_INVALID_MEDIA_COMBINATION", `${mode === "edit" ? "Video edit" : "Video extend"} only accepts one source video.`);
    }
  } else if (mode === "first_last_frame") {
    if (!firstFrameUrl || !lastFrameUrl) {
      throw requestError("SEEDANCE25_FRAMES_REQUIRED", "First + Last Frame mode requires both images.");
    }
    if (images.length || videos.length || audios.length) {
      throw requestError("SEEDANCE25_INVALID_MEDIA_COMBINATION", "First + Last Frame mode cannot be mixed with reference assets.");
    }
  }

  return { mode, prompt, resolution, ratio, duration, images, videos, audios, firstFrameUrl, lastFrameUrl, seed };
}

function buildSeedance25TaskPayload(input = {}, outerModel = "") {
  const normalized = validateSeedance25Input(input);
  const params = {
    model: SEEDANCE25_INNER_MODEL,
    functionMode: normalized.mode,
    prompt: normalized.prompt,
    resolution: normalized.resolution,
  };
  if (normalized.mode === "omini") {
    params.ratio = normalized.ratio;
    params.duration = normalized.duration;
    if (normalized.images.length) params.image_files = normalized.images;
    if (normalized.videos.length) params.video_files = normalized.videos;
    if (normalized.audios.length) params.audio_files = normalized.audios;
  } else if (normalized.mode === "edit") {
    params.video_url = normalized.videos[0];
  } else if (normalized.mode === "extend") {
    params.video_url = normalized.videos[0];
    params.ratio = "adaptive";
    params.duration = normalized.duration;
  } else {
    params.image_url = normalized.firstFrameUrl;
    params.end_image_url = normalized.lastFrameUrl;
    params.ratio = "adaptive";
    params.duration = normalized.duration;
  }
  if (normalized.seed !== null) params.seed = normalized.seed;
  return {
    model: String(outerModel || "").trim(),
    params,
    channel: null,
    callback_url: null,
  };
}

module.exports = {
  SEEDANCE25_CNY_PER_POINT,
  SEEDANCE25_CNY_PER_USD,
  SEEDANCE25_INNER_MODEL,
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
