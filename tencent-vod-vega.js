"use strict";

const crypto = require("node:crypto");

const VEGA_MODEL_NAME = "wand-vega-video";
const TENCENT_VOD_INTERNATIONAL_HOST = "vod.intl.tencentcloudapi.com";
const TENCENT_VOD_INTERNATIONAL_REGION = "ap-singapore";
const VEGA_MEDIA_LIBRARY_PROVIDERS = Object.freeze(new Set(["seedance20-vega", "seedance25-vega"]));
const VEGA_PROVIDERS = Object.freeze({
  "seedance20-vega": Object.freeze({
    id: "seedance20-vega",
    label: "Vega 1.0 Pro",
    modelName: VEGA_MODEL_NAME,
    modelVersion: "1.0-pro",
  }),
  "seedance25-vega": Object.freeze({
    id: "seedance25-vega",
    label: "Vega 1.5 Pro",
    modelName: VEGA_MODEL_NAME,
    modelVersion: "1.5-pro",
  }),
  "h3-vega": Object.freeze({
    id: "h3-vega",
    label: "Vega 1.5 Lite",
    modelName: VEGA_MODEL_NAME,
    modelVersion: "1.5-lite",
  }),
  "vega10-lite": Object.freeze({
    id: "vega10-lite",
    label: "Vega 1.0 Lite",
    modelName: VEGA_MODEL_NAME,
    modelVersion: "1.0-lite",
  }),
});
const VEGA_PROVIDER_IDS = Object.freeze(Object.keys(VEGA_PROVIDERS));
const VEGA_USAGES = Object.freeze(new Set(["FirstFrame", "LastFrame", "Reference"]));
const VEGA_MEDIA_MODES = Object.freeze({
  text_to_video: Object.freeze({ id: "text_to_video", label: "Text to Video" }),
  first_frame: Object.freeze({ id: "first_frame", label: "First Frame" }),
  last_frame: Object.freeze({ id: "last_frame", label: "Last Frame" }),
  first_last_frame: Object.freeze({ id: "first_last_frame", label: "First + Last Frame" }),
  reference_video: Object.freeze({ id: "reference_video", label: "Multimodal References" }),
  draft_followup: Object.freeze({ id: "draft_followup", label: "Draft to Final" }),
});
const VEGA_ALL_RESOLUTIONS = Object.freeze(["480P", "720P", "768P", "1080P", "2K", "4K"]);
const VEGA_ALL_RATIOS = Object.freeze(["21:9", "16:9", "4:3", "1:1", "3:4", "9:16", "adaptive"]);
const VEGA_COMMON_MODES = Object.freeze(["text_to_video", "first_frame", "last_frame", "first_last_frame", "reference_video"]);
const VEGA_15_PRO_LIMITS = Object.freeze({
  images: 30,
  videos: 10,
  audios: 10,
  total: 50,
  videoSeconds: 0,
  audioSeconds: 30,
  perFileMinSeconds: 2,
  perFileMaxSeconds: 30,
});
const VEGA_15_LITE_LIMITS = Object.freeze({ images: 10, videos: 5, audios: 5, total: 20, videoSeconds: 15, audioSeconds: 15 });
const VEGA_10_PRO_LIMITS = Object.freeze({ images: 9, videos: 3, audios: 3, total: 12, videoSeconds: 15, audioSeconds: 15 });
const VEGA_10_LITE_LIMITS = Object.freeze({ ...VEGA_10_PRO_LIMITS, perFileMinSeconds: 2, perFileMaxSeconds: 15 });

function capability(overrides = {}) {
  return Object.freeze({
    modes: VEGA_COMMON_MODES,
    resolutions: VEGA_ALL_RESOLUTIONS,
    ratios: VEGA_ALL_RATIOS,
    durationSeconds: Object.freeze({ min: 4, max: 15, fallback: 5, smart: false }),
    outputAudio: true,
    promptEnhancement: true,
    moderation: true,
    usage: true,
    generateMode: true,
    qualityMode: true,
    returnLastFrame: true,
    outputFormat: true,
    taskTypes: Object.freeze(["auto", "reference"]),
    draft: false,
    frameRatioFromInput: false,
    limits: VEGA_15_LITE_LIMITS,
    ...overrides,
  });
}

const VEGA_CAPABILITIES = Object.freeze({
  "seedance20-vega": capability({
    durationSeconds: Object.freeze({ min: 4, max: 15, fallback: 5, smart: false }),
    generateMode: false,
    qualityMode: false,
    limits: VEGA_10_PRO_LIMITS,
  }),
  "seedance25-vega": capability({
    durationSeconds: Object.freeze({ min: 4, max: 30, fallback: 5, smart: true }),
    taskTypes: Object.freeze(["auto", "reference", "edit", "extend"]),
    draft: true,
    limits: VEGA_15_PRO_LIMITS,
  }),
  "h3-vega": capability({
    resolutions: Object.freeze(["480P", "720P", "1080P", "2K", "4K"]),
    durationSeconds: Object.freeze({ min: 2, max: 30, fallback: 6, smart: true }),
    generateMode: false,
    qualityMode: false,
    limits: VEGA_15_LITE_LIMITS,
  }),
  "vega10-lite": capability({
    resolutions: Object.freeze(["480P", "768P", "1080P", "2K", "4K"]),
    durationSeconds: Object.freeze({ min: 4, max: 15, fallback: 5, smart: false }),
    frameRatioFromInput: true,
    returnLastFrame: false,
    limits: VEGA_10_LITE_LIMITS,
  }),
});
const VEGA_RESOLUTIONS = VEGA_ALL_RESOLUTIONS;
const VEGA_RATIOS = VEGA_ALL_RATIOS;

function normalizedProviderId(value = "") {
  return String(value || "").trim().toLowerCase().replace(/[\s_]+/g, "-");
}

function isVegaProvider(value = "") {
  return VEGA_PROVIDER_IDS.includes(normalizedProviderId(value));
}

function vegaProviderDefinition(value = "") {
  return VEGA_PROVIDERS[normalizedProviderId(value)] || null;
}

function vegaProviderCapabilities(value = "") {
  const id = vegaProviderDefinition(value)?.id || "";
  return id ? VEGA_CAPABILITIES[id] : null;
}

function vegaProviderLabel(value = "") {
  return vegaProviderDefinition(value)?.label || "";
}

function vegaProviderUsesMediaLibrary(value = "") {
  const id = vegaProviderDefinition(value)?.id || "";
  return VEGA_MEDIA_LIBRARY_PROVIDERS.has(id);
}

function vegaDurationBounds(value = "") {
  const caps = vegaProviderCapabilities(value);
  return caps ? { ...caps.durationSeconds } : { min: 4, max: 15, fallback: 5, smart: false };
}

function vegaPricingUnavailableError(provider = "") {
  const error = new Error(`${vegaProviderLabel(provider) || "Vega"} pricing is not configured. Generation was not started.`);
  error.statusCode = 422;
  error.code = "MODEL_PRICING_UNAVAILABLE";
  return error;
}

function assertVegaPricingConfigured(provider = "", pricing = null) {
  if (!pricing || !(Number(pricing.credits) > 0)) throw vegaPricingUnavailableError(provider);
  return pricing;
}

function normalizeVegaDraftTaskId(value = "") {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "";
  return ["undefined", "null", "nan"].includes(normalized.toLowerCase()) ? "" : normalized;
}

function normalizeVegaMediaMode(value = "", input = {}) {
  const normalized = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (["draft_followup", "draft_final", "draft_to_final"].includes(normalized)) return "draft_followup";
  if (["text_to_video", "text2video", "t2v", "text"].includes(normalized)) return "text_to_video";
  if (["first_frame", "first", "i2v", "image_to_video"].includes(normalized)) return "first_frame";
  if (["last_frame", "last", "end_frame", "last_frame_only"].includes(normalized)) return "last_frame";
  if (["first_last_frame", "first_last", "first_and_last", "start_end"].includes(normalized)) return "first_last_frame";
  if (["reference_video", "multimodal", "multi_modal", "references", "reference", "reference_images", "multi_reference", "omni", "omini"].includes(normalized)) return "reference_video";
  const hasFirst = Boolean(String(input.firstFrameUrl || "").trim());
  const hasLast = Boolean(String(input.lastFrameUrl || "").trim());
  const hasReferences = ["referenceImages", "referenceVideos", "referenceAudios"].some((key) => Array.isArray(input[key]) && input[key].length > 0);
  if (normalizeVegaDraftTaskId(input.draftTaskId)) return "draft_followup";
  if (hasFirst && hasLast) return "first_last_frame";
  if (hasFirst) return "first_frame";
  if (hasLast) return "last_frame";
  if (hasReferences) return "reference_video";
  return "text_to_video";
}

function mediaCombinationError(message) {
  return Object.assign(new Error(message), { statusCode: 400, code: "INVALID_MEDIA_COMBINATION" });
}

function vegaMediaSelection(input = {}) {
  const mode = normalizeVegaMediaMode(input.mediaMode || input.seedanceMode || input.functionMode, input);
  const firstFrameUrl = String(input.firstFrameUrl || "").trim();
  const lastFrameUrl = String(input.lastFrameUrl || "").trim();
  const referenceImages = Array.isArray(input.referenceImages) ? input.referenceImages.filter(Boolean) : [];
  const referenceVideos = Array.isArray(input.referenceVideos) ? input.referenceVideos.filter(Boolean) : [];
  const referenceAudios = Array.isArray(input.referenceAudios) ? input.referenceAudios.filter(Boolean) : [];
  const hasReferences = referenceImages.length + referenceVideos.length + referenceAudios.length > 0;
  if (mode === "text_to_video" && (firstFrameUrl || lastFrameUrl || hasReferences)) {
    throw mediaCombinationError("Text to Video cannot include frames or multimodal references.");
  }
  if (mode === "draft_followup" && (firstFrameUrl || lastFrameUrl || hasReferences)) {
    throw mediaCombinationError("Draft to Final does not accept prompt or media. Submit only the draft task id and output settings.");
  }
  if (["first_frame", "last_frame", "first_last_frame"].includes(mode)) {
    if (hasReferences) throw mediaCombinationError("Frame modes cannot be combined with reference images, videos, or audio.");
    if (mode === "first_frame" && (!firstFrameUrl || lastFrameUrl)) throw mediaCombinationError("First Frame requires exactly one first-frame image.");
    if (mode === "last_frame" && (!lastFrameUrl || firstFrameUrl)) throw mediaCombinationError("Last Frame requires exactly one last-frame image.");
    if (mode === "first_last_frame" && (!firstFrameUrl || !lastFrameUrl)) throw mediaCombinationError("First + Last Frame requires both a first frame and a last frame.");
  }
  if (mode === "reference_video" && (firstFrameUrl || lastFrameUrl)) {
    throw mediaCombinationError("Multimodal References cannot be combined with first frame or last frame images.");
  }
  return { mode, firstFrameUrl, lastFrameUrl, referenceImages, referenceVideos, referenceAudios };
}

function vegaMediaHasContent(media = {}) {
  return Boolean(
    String(media.firstFrameUrl || "").trim()
    || String(media.lastFrameUrl || "").trim()
    || (Array.isArray(media.referenceImages) && media.referenceImages.length)
    || (Array.isArray(media.referenceVideos) && media.referenceVideos.length)
    || (Array.isArray(media.referenceAudios) && media.referenceAudios.length)
  );
}

// Draft state can survive in browser/template/record state after a user switches
// models. Resolve it against the selected model before pricing or submission.
// For Lite, a prompt or any media proves this is an ordinary generation request;
// only a draft-only request is treated as explicit Draft-to-Final intent.
function resolveVegaDraftSelection(input = {}) {
  const provider = vegaProviderDefinition(input.provider)?.id || String(input.provider || "").trim();
  const caps = vegaProviderCapabilities(provider);
  if (!caps) throw new Error("Unknown Vega provider.");
  const requestedDraftTaskId = normalizeVegaDraftTaskId(input.draftTaskId);
  const templateDraftTaskId = normalizeVegaDraftTaskId(input.templateDraftTaskId);
  const requestedMediaMode = normalizeVegaMediaMode(input.mediaMode || "", {
    ...input.media,
    draftTaskId: requestedDraftTaskId,
  });
  const hasPrompt = Boolean(String(input.prompt || "").trim());
  const hasMedia = vegaMediaHasContent(input.media);
  const explicitDraftMode = requestedMediaMode === "draft_followup";
  const ordinaryGenerationRequested = hasPrompt || hasMedia;
  const effectiveDraftMode = explicitDraftMode && !ordinaryGenerationRequested;
  const draftRequested = effectiveDraftMode || Boolean(requestedDraftTaskId);
  if (!caps.draft) {
    if (draftRequested && !hasPrompt && !hasMedia) {
      throw vegaValidationError(`${vegaProviderLabel(provider)} does not support draft-to-final generation.`, "DRAFT_UNSUPPORTED");
    }
    return {
      draftTaskId: "",
      explicitDraftMode: false,
      ignoredStaleDraft: draftRequested,
      mediaMode: draftRequested ? normalizeVegaMediaMode("", input.media) : requestedMediaMode,
    };
  }
  const draftOnly = !hasPrompt && !hasMedia;
  const draftTaskId = draftOnly
    ? (requestedDraftTaskId || (explicitDraftMode ? templateDraftTaskId : ""))
    : "";
  if (effectiveDraftMode && draftOnly && !draftTaskId) {
    throw Object.assign(new Error("Draft to Final requires the upstream draft task ID."), {
      statusCode: 400,
      code: "DRAFT_TASK_ID_REQUIRED",
    });
  }
  const ignoredStaleDraft = !draftTaskId && draftRequested;
  return {
    draftTaskId,
    explicitDraftMode: Boolean(draftTaskId),
    ignoredStaleDraft,
    mediaMode: draftTaskId
      ? "draft_followup"
      : normalizeVegaMediaMode("", { ...input.media, draftTaskId: "" }),
  };
}

function normalizeVegaUsage(value = "") {
  const normalized = String(value || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (normalized === "firstframe") return "FirstFrame";
  if (normalized === "lastframe" || normalized === "endframe") return "LastFrame";
  if (normalized === "reference") return "Reference";
  return "";
}

function isPrivateVegaHostname(hostname = "") {
  const host = String(hostname || "").trim().toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host === "local" || host.endsWith(".local")) return true;
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const octets = ipv4.slice(1).map(Number);
    if (octets.some((part) => part > 255)) return true;
    const [a, b] = octets;
    return a === 0 || a === 10 || a === 127
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168);
  }
  if (!host.includes(":")) return false;
  const withoutZone = host.replace(/%.*$/, "");
  const mapped = withoutZone.match(/^(?:0*:)*0*:ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i);
  if (mapped) return isPrivateVegaHostname(mapped[1]);
  if (withoutZone === "::" || withoutZone === "::1") return true;
  const ipv4Tail = withoutZone.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  const expanded = withoutZone.includes("::")
    ? (() => {
        const [left, right] = withoutZone.split("::");
        const leftGroups = left ? left.split(":") : [];
        const rightGroups = right ? right.split(":") : [];
        if (ipv4Tail) rightGroups.splice(-1, 1, ...ipv4Tail[1].split(".").slice(0, 2).map((part) => Number(part).toString(16)), ...ipv4Tail[1].split(".").slice(2).map((part) => Number(part).toString(16)));
        return [...leftGroups, ...Array(Math.max(0, 8 - leftGroups.length - rightGroups.length)).fill("0"), ...rightGroups];
      })()
    : withoutZone.split(":");
  if (expanded.length === 8 && expanded.slice(0, 5).every((group) => parseInt(group || "0", 16) === 0) && parseInt(expanded[5] || "0", 16) === 0xffff) {
    const last = expanded.slice(6).map((group) => parseInt(group || "0", 16));
    return isPrivateVegaHostname(`${last[0] >> 8}.${last[0] & 255}.${last[1] >> 8}.${last[1] & 255}`);
  }
  const firstGroup = parseInt(expanded[0] || "0", 16) || 0;
  return (firstGroup & 0xfe00) === 0xfc00
    || (firstGroup & 0xffc0) === 0xfe80
    || (firstGroup & 0xff00) === 0xff00;
}

function publicVegaUrl(value = "", label = "media") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  let parsed;
  try { parsed = new URL(raw); } catch { parsed = null; }
  if (!parsed || !["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || isPrivateVegaHostname(parsed.hostname)) {
    throw Object.assign(new Error(`${label} must be a public HTTP(S) URL.`), {
      statusCode: 400,
      code: "INVALID_MEDIA_URL",
      details: { url: raw },
    });
  }
  return raw;
}

function vegaValidationError(message, code, details) {
  return Object.assign(new Error(message), { statusCode: 400, code, details });
}

function validateVegaMediaCounts(provider, media, input = {}) {
  const caps = vegaProviderCapabilities(provider);
  if (!caps) throw vegaValidationError("Unknown Vega provider.", "INVALID_PROVIDER");
  if (media.mode === "draft_followup") return;
  if (!caps.modes.includes(media.mode)) throw vegaValidationError(`${vegaProviderLabel(provider)} does not support ${VEGA_MEDIA_MODES[media.mode]?.label || media.mode}.`, "INVALID_MEDIA_MODE");
  if (media.mode === "text_to_video") return;
  if (media.mode !== "reference_video") return;
  const counts = { images: media.referenceImages.length, videos: media.referenceVideos.length, audios: media.referenceAudios.length };
  const total = counts.images + counts.videos + counts.audios;
  if (!total) throw mediaCombinationError("Multimodal References requires at least one reference image, video, or audio.");
  const limits = caps.limits;
  if (counts.images > limits.images || counts.videos > limits.videos || counts.audios > limits.audios || total > limits.total) {
    throw vegaValidationError(`Vega references exceed the ${vegaProviderLabel(provider)} limit.`, "MEDIA_LIMIT_EXCEEDED", { limits, counts });
  }
  if (counts.audios > 0 && counts.images + counts.videos === 0) {
    throw mediaCombinationError("Reference audio must be paired with at least one reference image or video.");
  }
  const videoDurationInput = Array.isArray(input.referenceVideoDurations) ? input.referenceVideoDurations : [];
  const audioDurationInput = Array.isArray(input.referenceAudioDurations) ? input.referenceAudioDurations : [];
  const videoDurations = videoDurationInput.map(Number).filter((n) => n > 0);
  const audioDurations = audioDurationInput.map(Number).filter((n) => n > 0);
  if (limits.perFileMinSeconds > 0 && limits.perFileMaxSeconds > 0) {
    for (const [kind, durations, expectedCount] of [["video", videoDurations, counts.videos], ["audio", audioDurations, counts.audios]]) {
      if (durations.length !== expectedCount) {
        throw vegaValidationError(`Each reference ${kind} must have a readable duration.`, "MEDIA_DURATION_REQUIRED", { kind, expectedCount, receivedCount: durations.length, min: limits.perFileMinSeconds, max: limits.perFileMaxSeconds });
      }
      const invalid = durations.find((seconds) => seconds < limits.perFileMinSeconds || seconds > limits.perFileMaxSeconds);
      if (invalid !== undefined) {
        throw vegaValidationError(`Each reference ${kind} must be ${limits.perFileMinSeconds}-${limits.perFileMaxSeconds} seconds.`, "MEDIA_DURATION_LIMIT_EXCEEDED", { kind, duration: invalid, min: limits.perFileMinSeconds, max: limits.perFileMaxSeconds });
      }
    }
  }
  if (limits.videoSeconds > 0 && videoDurations.reduce((sum, n) => sum + n, 0) > limits.videoSeconds) {
    throw vegaValidationError(`Reference videos exceed the ${limits.videoSeconds}s total limit.`, "MEDIA_DURATION_LIMIT_EXCEEDED", { limit: limits.videoSeconds });
  }
  if (limits.audioSeconds > 0 && audioDurations.reduce((sum, n) => sum + n, 0) > limits.audioSeconds) {
    throw vegaValidationError(`Reference audio exceeds the ${limits.audioSeconds}s total limit.`, "MEDIA_DURATION_LIMIT_EXCEEDED", { limit: limits.audioSeconds });
  }
}

function buildVegaFileInfos(input = {}) {
  const media = vegaMediaSelection(input);
  validateVegaMediaCounts(input.provider, media, input);
  const files = [];
  const seen = new Set();
  const add = (category, url, usage, label) => {
    const publicUrl = publicVegaUrl(url, label);
    if (!publicUrl) return;
    if (!VEGA_USAGES.has(usage)) throw new Error(`Invalid Vega media usage: ${usage}`);
    const key = `${category}\u0000${publicUrl}\u0000${usage}`;
    if (seen.has(key)) return;
    seen.add(key);
    files.push({ Type: "Url", Category: category, Url: publicUrl, Usage: usage });
  };
  if (media.mode === "first_frame") add("Image", media.firstFrameUrl, "FirstFrame", "First frame image");
  if (media.mode === "last_frame") add("Image", media.lastFrameUrl, "LastFrame", "Last frame image");
  if (media.mode === "first_last_frame") {
    add("Image", media.firstFrameUrl, "FirstFrame", "First frame image");
    add("Image", media.lastFrameUrl, "LastFrame", "Last frame image");
  }
  if (media.mode === "reference_video") {
    media.referenceImages.forEach((url, index) => add("Image", url, "Reference", `Reference image ${index + 1}`));
    media.referenceVideos.forEach((url, index) => add("Video", url, "Reference", `Reference video ${index + 1}`));
    media.referenceAudios.forEach((url, index) => add("Audio", url, "Reference", `Reference audio ${index + 1}`));
  }
  return files;
}

function normalizeVegaDuration(provider = "", value, options = {}) {
  const bounds = vegaDurationBounds(provider);
  const taskType = String(options.taskType || "").trim().toLowerCase();
  if (taskType === "edit") {
    if (value === undefined || value === null || value === "" || Number(value) === -1) return -1;
    throw vegaValidationError("Vega edit duration must be -1 because it follows the source video.", "INVALID_DURATION", { duration: value, taskType });
  }
  const duration = Number(value ?? (Number(value) === -1 ? -1 : bounds.fallback));
  if (duration === -1 && bounds.smart) return -1;
  if (!Number.isInteger(duration) || duration < bounds.min || duration > bounds.max) {
    throw vegaValidationError(`Vega duration must be an integer from ${bounds.min} to ${bounds.max} seconds${bounds.smart ? " or -1" : ""}.`, "INVALID_DURATION", { duration: value, ...bounds });
  }
  return duration;
}

function normalizeVegaResolution(value = "", provider = "") {
  const raw = String(value || "1080P").trim().toUpperCase();
  const aliases = { "480P": "480P", "720P": "720P", "768P": "768P", "1080P": "1080P", "2K": "2K", "4K": "4K" };
  const normalized = aliases[raw] || raw;
  const allowed = vegaProviderCapabilities(provider)?.resolutions || VEGA_ALL_RESOLUTIONS;
  if (!allowed.includes(normalized)) {
    throw vegaValidationError(`Vega resolution must be one of: ${allowed.join(", ")}.`, "INVALID_RESOLUTION", { resolution: value, allowed });
  }
  return normalized;
}

function normalizeVegaRatio(value = "", provider = "", options = {}) {
  if (options.frameRatioFromInput) return "";
  const caps = vegaProviderCapabilities(provider);
  const allowed = caps?.ratios || VEGA_ALL_RATIOS;
  const raw = String(value || (options.taskType === "edit" || options.taskType === "extend" ? "adaptive" : "16:9")).trim();
  const normalized = raw.toLowerCase() === "adaptive" ? "adaptive" : raw;
  if (!allowed.includes(normalized)) {
    throw vegaValidationError(`Vega aspect ratio must be one of: ${allowed.join(", ")}.`, "INVALID_RATIO", { ratio: value, allowed });
  }
  if (["edit", "extend"].includes(options.taskType) && normalized !== "adaptive") {
    throw vegaValidationError(`Vega ${options.taskType} requires adaptive aspect ratio.`, "INVALID_RATIO", { ratio: normalized, taskType: options.taskType });
  }
  return normalized;
}

function normalizeVegaSeed(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const seed = Number(value);
  if (!Number.isInteger(seed) || seed < 0 || seed > 4294967295) {
    throw vegaValidationError("Vega seed must be an integer from 0 to 4294967295.", "INVALID_SEED", { seed: value });
  }
  return seed;
}

function normalizeVegaPromptEnhanceMode(value = "", provider = "") {
  const raw = String(value || (vegaProviderDefinition(provider)?.modelVersion.includes("-lite") ? "enable" : "disable")).trim().toLowerCase();
  if (raw === "auto") return raw;
  if (raw === "enable" || raw === "disable") return raw;
  throw vegaValidationError("EnhancePromptMode must be auto, enable, or disable.", "INVALID_ENHANCE_PROMPT_MODE");
}

function normalizeVegaModerationMode(value = "") {
  const normalized = String(value || "Moderation_L1").trim();
  if (normalized === "Moderation_L1" || normalized === "Moderation_L2") return normalized;
  throw vegaValidationError("ModerationMode must be Moderation_L1 or Moderation_L2.", "INVALID_MODERATION_MODE");
}

function normalizeVegaGenerateMode(value = "") {
  const normalized = String(value || "Standard").trim();
  if (["Standard", "Fast", "StandardMovie"].includes(normalized)) return normalized;
  throw vegaValidationError("GenerateMode must be Standard, Fast, or StandardMovie.", "INVALID_GENERATE_MODE");
}

function normalizeVegaQualityMode(value = "") {
  const normalized = String(value || "Standard").trim();
  if (["Standard", "Fast", "SuperFast"].includes(normalized)) return normalized;
  throw vegaValidationError("VideoQualityMode must be Standard, Fast, or SuperFast.", "INVALID_QUALITY_MODE");
}

function normalizeVegaTaskType(value = "", provider = "") {
  const normalized = String(value || "auto").trim().toLowerCase();
  const caps = vegaProviderCapabilities(provider);
  if (!caps?.taskTypes.includes(normalized)) {
    throw vegaValidationError(`Vega task type must be one of: ${(caps?.taskTypes || ["auto", "reference"]).join(", ")}.`, "INVALID_TASK_TYPE", { taskType: value });
  }
  return normalized;
}

function normalizeVegaOutputFormat(value = "") {
  const normalized = String(value || "mp4").trim().toLowerCase();
  if (!["mp4", "mov"].includes(normalized)) throw vegaValidationError("output_format must be mp4 or mov.", "INVALID_OUTPUT_FORMAT");
  return normalized;
}

function normalizeVegaAudioGeneration(value, fallback = true) {
  if (value === undefined || value === null || value === "") return fallback ? "Enabled" : "Disabled";
  if (value === true || value === 1 || String(value).toLowerCase() === "true" || String(value).toLowerCase() === "enabled") return "Enabled";
  if (value === false || value === 0 || String(value).toLowerCase() === "false" || String(value).toLowerCase() === "disabled") return "Disabled";
  throw vegaValidationError("AudioGeneration must be Enabled or Disabled.", "INVALID_AUDIO_GENERATION");
}

function buildVegaExtInfo(input = {}, { taskType, draftTaskId } = {}) {
  const additional = {};
  const caps = vegaProviderCapabilities(input.provider);
  if (caps?.returnLastFrame && (input.returnLastFrame === true || input.returnLastFrame === "true")) additional.return_last_frame = true;
  const normalizedDraftTaskId = normalizeVegaDraftTaskId(draftTaskId);
  if (normalizedDraftTaskId) additional.draft_task_id = normalizedDraftTaskId;
  else if (input.draft === true || input.draft === "true") additional.draft = true;
  if (taskType && !["auto", "reference"].includes(taskType)) additional.omni_reference_task_type = taskType;
  if (String(input.assetGroupId || "").trim()) additional.asset_group_id = String(input.assetGroupId).trim();
  if (input.outputFormat) additional.output_format = normalizeVegaOutputFormat(input.outputFormat);
  const wand = {
    EnhancePromptMode: normalizeVegaPromptEnhanceMode(input.enhancePromptMode, input.provider),
    ModerationMode: normalizeVegaModerationMode(input.moderationMode),
    ReturnVegaUsage: Boolean(input.returnVegaUsage),
  };
  // Vega 1.0 Pro and Vega 1.5 Lite reject these fields in production.
  // Vega 1.0 Lite documents and supports both model controls.
  if (!caps || caps.generateMode) wand.GenerateMode = normalizeVegaGenerateMode(input.generateMode);
  if (!caps || caps.qualityMode) wand.VideoQualityMode = normalizeVegaQualityMode(input.videoQualityMode);
  const ext = {};
  if (Object.keys(additional).length) ext.AdditionalParameters = JSON.stringify(additional);
  ext.WandVegaParameters = JSON.stringify(wand);
  return JSON.stringify(ext);
}

function buildVegaCreatePayload(input = {}, { subAppId } = {}) {
  const provider = vegaProviderDefinition(input.provider);
  if (!provider) throw new Error("Unknown Vega provider.");
  const caps = vegaProviderCapabilities(provider.id);
  if (!Number.isInteger(Number(subAppId)) || Number(subAppId) <= 0) throw new Error("TENCENT_VOD_SUB_APP_ID must be a positive integer.");
  const prompt = String(input.prompt || "").trim();
  const requestedMedia = {
    firstFrameUrl: input.firstFrameUrl,
    lastFrameUrl: input.lastFrameUrl,
    referenceImages: input.referenceImages,
    referenceVideos: input.referenceVideos,
    referenceAudios: input.referenceAudios,
  };
  const draftSelection = resolveVegaDraftSelection({
    provider: provider.id,
    mediaMode: input.mediaMode,
    media: requestedMedia,
    prompt,
    draftTaskId: input.draftTaskId,
  });
  const draftTaskId = draftSelection.draftTaskId;
  const draft = Boolean(caps.draft) && (input.draft === true || input.draft === "true");
  // A platform regeneration can retain the previous generation's media in the
  // record. Draft-to-final only accepts the draft id and output settings, so
  // those stale fields must never reach media validation or the upstream body.
  const media = draftTaskId
    ? { mode: "draft_followup", firstFrameUrl: "", lastFrameUrl: "", referenceImages: [], referenceVideos: [], referenceAudios: [] }
    : vegaMediaSelection({ ...input, mediaMode: draftSelection.mediaMode });
  if (!draftTaskId && !prompt) throw Object.assign(new Error("Prompt is required."), { statusCode: 400, code: "PROMPT_REQUIRED" });
  if (prompt.length > 7000) throw vegaValidationError("Vega prompt must not exceed 7000 characters.", "PROMPT_TOO_LONG");
  const taskType = normalizeVegaTaskType(input.taskType, provider.id);
  if (draftTaskId && taskType !== "auto") throw vegaValidationError("Draft to Final does not accept omni_reference_task_type.", "INVALID_TASK_TYPE");
  if (["edit", "extend"].includes(taskType) && media.referenceVideos.length < 1) {
    throw mediaCombinationError(`Vega ${taskType} requires at least one reference video.`);
  }
  if (taskType === "edit" && media.mode !== "reference_video") throw mediaCombinationError("Vega edit requires multimodal reference mode with a source video.");
  if (taskType === "extend" && media.mode !== "reference_video") throw mediaCombinationError("Vega extend requires multimodal reference mode with a source video.");
  const fileInfos = draftTaskId ? [] : buildVegaFileInfos({ ...input, provider: provider.id, mediaMode: media.mode });
  const duration = normalizeVegaDuration(provider.id, input.duration, { taskType });
  const resolution = normalizeVegaResolution(input.resolution, provider.id);
  if (draft) {
    if (resolution !== "480P") throw vegaValidationError("Vega draft generation requires 480P resolution.", "INVALID_DRAFT_RESOLUTION");
  }
  const ratio = normalizeVegaRatio(input.ratio, provider.id, { taskType, frameRatioFromInput: caps.frameRatioFromInput && media.mode !== "reference_video" && media.mode !== "text_to_video" });
  const outputConfig = { StorageMode: "Temporary" };
  if (!draftTaskId) {
    outputConfig.Duration = duration;
    outputConfig.Resolution = resolution;
    if (ratio) outputConfig.AspectRatio = ratio;
    outputConfig.AudioGeneration = normalizeVegaAudioGeneration(input.generateAudio);
  } else {
    outputConfig.Resolution = resolution;
  }
  const payload = {
    SubAppId: Number(subAppId),
    ModelName: provider.modelName,
    ModelVersion: provider.modelVersion,
    OutputConfig: outputConfig,
    ExtInfo: buildVegaExtInfo({ ...input, provider: provider.id, draft }, { taskType, draftTaskId }),
  };
  if (!draftTaskId) {
    payload.FileInfos = fileInfos;
    payload.Prompt = prompt;
  }
  const seed = normalizeVegaSeed(input.seed);
  if (seed !== undefined && !draftTaskId) payload.Seed = seed;
  return payload;
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function hmacSha256(key, value, encoding) {
  return crypto.createHmac("sha256", key).update(value, "utf8").digest(encoding);
}

function tencentTc3Authorization({ secretId, secretKey, host, action, payload, timestamp = Math.floor(Date.now() / 1000) }) {
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const service = "vod";
  const contentType = "application/json; charset=utf-8";
  const canonicalHeaders = `content-type:${contentType}\nhost:${host}\n`;
  const signedHeaders = "content-type;host";
  const canonicalRequest = [
    "POST",
    "/",
    "",
    canonicalHeaders,
    signedHeaders,
    sha256Hex(payload),
  ].join("\n");
  const credentialScope = `${date}/${service}/tc3_request`;
  const stringToSign = `TC3-HMAC-SHA256\n${timestamp}\n${credentialScope}\n${sha256Hex(canonicalRequest)}`;
  const secretDate = hmacSha256(`TC3${secretKey}`, date);
  const secretService = hmacSha256(secretDate, service);
  const secretSigning = hmacSha256(secretService, "tc3_request");
  const signature = hmacSha256(secretSigning, stringToSign, "hex");
  return {
    authorization: `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    timestamp,
    date,
    contentType,
    canonicalRequest,
    stringToSign,
    signature,
  };
}

async function callTencentVod({ action, payload, env = process.env, fetchImpl = fetch, timestamp } = {}) {
  const secretId = String(env.TENCENTCLOUD_SECRET_ID || "").trim();
  const secretKey = String(env.TENCENTCLOUD_SECRET_KEY || "").trim();
  if (!secretId || !secretKey) {
    throw Object.assign(new Error("Tencent VOD credentials are not configured."), {
      statusCode: 503,
      code: "TENCENT_VOD_NOT_CONFIGURED",
    });
  }
  // This integration is for Tencent Cloud International VOD only. Do not use
  // the mainland host (vod.tencentcloudapi.com), whose credentials and
  // sub-applications are not interchangeable with the international site.
  const host = TENCENT_VOD_INTERNATIONAL_HOST;
  const body = JSON.stringify(payload || {});
  const signed = tencentTc3Authorization({ secretId, secretKey, host, action, payload: body, timestamp });
  const response = await fetchImpl(`https://${host}`, {
    method: "POST",
    headers: {
      authorization: signed.authorization,
      "content-type": signed.contentType,
      host,
      "x-tc-action": action,
      "x-tc-timestamp": String(signed.timestamp),
      "x-tc-version": "2018-07-17",
      "x-tc-region": String(env.TENCENT_VOD_REGION || TENCENT_VOD_INTERNATIONAL_REGION),
    },
    body,
  });
  const text = await response.text();
  let raw;
  try {
    raw = text ? JSON.parse(text) : {};
  } catch {
    raw = { Response: { Error: { Code: "INVALID_JSON_RESPONSE", Message: text.slice(0, 1000) } } };
  }
  const error = raw?.Response?.Error;
  if (!response.ok || error) {
    const upstreamError = new Error(error?.Message || `Tencent VOD ${action} failed with HTTP ${response.status}.`);
    upstreamError.statusCode = 502;
    upstreamError.code = error?.Code || "TENCENT_VOD_REQUEST_FAILED";
    upstreamError.payload = raw;
    throw upstreamError;
  }
  return raw;
}

function vegaMediaLibraryError(message, code, details, statusCode = 502) {
  return Object.assign(new Error(message), { statusCode, code, details });
}

function vegaPullUploadTask(response = {}) {
  return response?.Response?.PullUploadTask && typeof response.Response.PullUploadTask === "object"
    ? response.Response.PullUploadTask
    : null;
}

function vegaMediaName(url = "", category = "") {
  let basename = "";
  try {
    basename = decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).pop() || "");
  } catch {
    basename = "";
  }
  const safe = basename.replace(/[^\w.-]+/g, "_").slice(-100);
  return safe || `vega-${String(category || "media").toLowerCase()}-${sha256Hex(url).slice(0, 16)}`;
}

async function importVegaMediaLibraryFile({
  fileInfo = {},
  subAppId,
  env = process.env,
  callVod = callTencentVod,
  timeoutMs = Number(env.TENCENT_VOD_MEDIA_IMPORT_TIMEOUT_MS || 120000),
  pollIntervalMs = Number(env.TENCENT_VOD_MEDIA_IMPORT_POLL_MS || 1500),
  sleepImpl = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = Date.now,
  deadlineReached = () => false,
} = {}) {
  const sourceUrl = String(fileInfo.Url || "").trim();
  const category = String(fileInfo.Category || "").trim();
  if (fileInfo.Type !== "Url" || !sourceUrl) {
    throw vegaMediaLibraryError("Vega Pro media must be a public URL before it can be imported into the VOD media library.", "VEGA_MEDIA_LIBRARY_INVALID_SOURCE", { fileInfo }, 400);
  }
  const appId = Number(subAppId);
  if (!Number.isInteger(appId) || appId <= 0) throw new Error("TENCENT_VOD_SUB_APP_ID must be a positive integer.");

  let uploadResponse;
  try {
    uploadResponse = await callVod({
      action: "PullUpload",
      payload: {
        SubAppId: appId,
        MediaUrl: sourceUrl,
        MediaName: vegaMediaName(sourceUrl, category),
      },
      env,
    });
  } catch (error) {
    throw vegaMediaLibraryError(`Tencent VOD could not import ${category || "media"} into the media library: ${error.message || "PullUpload failed"}`, "VEGA_MEDIA_LIBRARY_IMPORT_FAILED", { sourceUrl, category, upstreamCode: error.code || "", payload: error.payload || null });
  }
  const taskId = String(uploadResponse?.Response?.TaskId || "").trim();
  if (!taskId) {
    throw vegaMediaLibraryError("Tencent VOD PullUpload did not return a task id.", "VEGA_MEDIA_LIBRARY_TASK_ID_MISSING", { sourceUrl, category, payload: uploadResponse });
  }

  const deadline = now() + Math.max(0, Number(timeoutMs) || 0);
  const interval = Math.max(0, Number(pollIntervalMs) || 0);
  while (true) {
    let detailResponse;
    try {
      detailResponse = await callVod({
        action: "DescribeTaskDetail",
        payload: { SubAppId: appId, TaskId: taskId },
        env,
      });
    } catch (error) {
      throw vegaMediaLibraryError(`Tencent VOD media-library import polling failed: ${error.message || "DescribeTaskDetail failed"}`, "VEGA_MEDIA_LIBRARY_IMPORT_FAILED", { sourceUrl, category, vodTaskId: taskId, upstreamCode: error.code || "", payload: error.payload || null });
    }
    const task = vegaPullUploadTask(detailResponse);
    const errCode = Number(task?.ErrCode || 0);
    const status = String(task?.Status || "").trim().toUpperCase();
    if (errCode !== 0) {
      throw vegaMediaLibraryError(`Tencent VOD media-library import failed: ${task?.Message || `error ${errCode}`}`, "VEGA_MEDIA_LIBRARY_IMPORT_FAILED", { sourceUrl, category, vodTaskId: taskId, errCode, message: task?.Message || "" });
    }
    if (status === "FINISH") {
      const fileId = String(task?.FileId || "").trim();
      if (!fileId) {
        throw vegaMediaLibraryError("Tencent VOD media-library import finished without a FileId.", "VEGA_MEDIA_LIBRARY_FILE_ID_MISSING", { sourceUrl, category, vodTaskId: taskId, payload: detailResponse });
      }
      return { fileId, vodTaskId: taskId, status: "succeeded", payload: task };
    }
    if (deadlineReached(deadline) || now() >= deadline) {
      throw vegaMediaLibraryError("Timed out while importing media into the Tencent VOD media library.", "VEGA_MEDIA_LIBRARY_TIMEOUT", { sourceUrl, category, vodTaskId: taskId, status, timeoutMs });
    }
    if (interval > 0) await sleepImpl(interval);
  }
}

function fileInfoFromMediaLibrary(entry = {}, fileInfo = {}) {
  return {
    Type: "File",
    Category: fileInfo.Category,
    Usage: fileInfo.Usage,
    FileId: entry.fileId,
  };
}

async function prepareVegaMediaLibraryFileInfos({
  provider = "",
  fileInfos = [],
  subAppId,
  userId = "",
  lookup,
  persist,
  ...importOptions
} = {}) {
  if (!vegaProviderUsesMediaLibrary(provider)) return fileInfos;
  if (!Array.isArray(fileInfos) || !fileInfos.length) return [];
  return Promise.all(fileInfos.map(async (fileInfo) => {
    if (fileInfo?.Type === "File" && String(fileInfo.FileId || "").trim()) return fileInfo;
    const sourceUrl = String(fileInfo?.Url || "").trim();
    const category = String(fileInfo?.Category || "").trim();
    if (lookup && userId && sourceUrl) {
      const cached = await lookup({ userId, sourceUrl, subAppId });
      if (cached?.status === "succeeded" && String(cached.fileId || "").trim()) return fileInfoFromMediaLibrary(cached, fileInfo);
    }
    try {
      const imported = await importVegaMediaLibraryFile({ fileInfo, subAppId, ...importOptions });
      if (persist && userId && sourceUrl) {
        await persist({
          userId,
          sourceUrl,
          subAppId,
          category,
          fileId: imported.fileId,
          vodTaskId: imported.vodTaskId,
          status: imported.status,
          payload: imported.payload,
        });
      }
      return fileInfoFromMediaLibrary(imported, fileInfo);
    } catch (error) {
      if (persist && userId && sourceUrl) {
        await Promise.resolve(persist({
          userId,
          sourceUrl,
          subAppId,
          category,
          status: "failed",
          payload: { code: error.code || "", message: error.message || "", details: error.details || null },
        })).catch(() => {});
      }
      throw error;
    }
  }));
}

function vegaCreateTaskId(response = {}) {
  return String(response?.Response?.TaskId || "").trim();
}

function vegaTaskDetail(response = {}) {
  return response?.Response?.AigcVideoTask && typeof response.Response.AigcVideoTask === "object"
    ? response.Response.AigcVideoTask
    : null;
}

function normalizeVegaStatus(value = "") {
  switch (String(value || "").trim().toUpperCase()) {
    case "FINISH": return "succeeded";
    case "ABORTED": return "failed";
    case "WAITING": return "queued";
    case "PROCESSING": return "running";
    default: return String(value || "").trim().toLowerCase() || "unknown";
  }
}

function vegaOutputFiles(task = {}) {
  return Array.isArray(task?.Output?.FileInfos) ? task.Output.FileInfos : [];
}

function vegaOutputVideoUrl(task = {}) {
  const files = vegaOutputFiles(task);
  const selected = files.find((item) => item && !String(item.UsageType || "").trim());
  return String(selected?.FileUrl || "").trim();
}

function vegaOutputLastFrameUrl(task = {}) {
  const files = vegaOutputFiles(task);
  const selected = files.find((item) => /last[_-]?frame/i.test(String(item?.UsageType || "")));
  return String(selected?.FileUrl || "").trim();
}

function vegaOutputUsage(task = {}) {
  const usage = task?.Usage || task?.Output?.Usage || {};
  return {
    completionTokens: Number(usage.CompletionTokens || 0) || 0,
    totalTokens: Number(usage.TotalTokens || 0) || 0,
  };
}

function vegaTaskFailureMessage(task = {}) {
  const message = String(task?.Message || "").trim();
  const code = String(task?.ErrCodeExt || "").trim();
  if (code && message) return `${code}: ${message}`;
  return message || code || "";
}

module.exports = {
  VEGA_MODEL_NAME,
  TENCENT_VOD_INTERNATIONAL_HOST,
  TENCENT_VOD_INTERNATIONAL_REGION,
  VEGA_PROVIDERS,
  VEGA_PROVIDER_IDS,
  VEGA_MEDIA_LIBRARY_PROVIDERS,
  VEGA_CAPABILITIES,
  VEGA_MEDIA_MODES,
  VEGA_ALL_RATIOS,
  VEGA_ALL_RESOLUTIONS,
  VEGA_RATIOS,
  VEGA_RESOLUTIONS,
  assertVegaPricingConfigured,
  buildVegaCreatePayload,
  buildVegaExtInfo,
  buildVegaFileInfos,
  callTencentVod,
  normalizeVegaDraftTaskId,
  importVegaMediaLibraryFile,
  isVegaProvider,
  normalizeVegaAudioGeneration,
  normalizeVegaDuration,
  normalizeVegaGenerateMode,
  normalizeVegaMediaMode,
  normalizeVegaModerationMode,
  normalizeVegaOutputFormat,
  normalizeVegaPromptEnhanceMode,
  normalizeVegaQualityMode,
  normalizeVegaRatio,
  normalizeVegaResolution,
  resolveVegaDraftSelection,
  normalizeVegaSeed,
  normalizeVegaStatus,
  normalizeVegaTaskType,
  normalizeVegaUsage,
  isPrivateVegaHostname,
  publicVegaUrl,
  tencentTc3Authorization,
  vegaCreateTaskId,
  vegaDurationBounds,
  vegaOutputFiles,
  vegaOutputLastFrameUrl,
  vegaOutputUsage,
  vegaOutputVideoUrl,
  vegaPricingUnavailableError,
  vegaProviderCapabilities,
  vegaProviderDefinition,
  vegaProviderLabel,
  vegaProviderUsesMediaLibrary,
  prepareVegaMediaLibraryFileInfos,
  vegaTaskDetail,
  vegaTaskFailureMessage,
  vegaMediaSelection,
};
