"use strict";

const { getRuntimeSettingFromDb, setRuntimeSettingInDb } = require("./db");

const BASE_URL = String(process.env.MULEROUTER_API_BASE || "https://api.mulerouter.ai").replace(/\/$/, "");
const ROUTE_SETTING_KEY = "mulerouter_route";
const FORCED_USERNAMES = new Set(
  String(process.env.MULEROUTER_FORCE_USERNAMES || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean),
);

const MAPPED = Object.freeze([
  { from: "wan30-video", to: "w3.0-video", note: "480p/720p/1080p；参数不兼容时明确报错" },
  { from: "wan30-video-pro", to: "w3.0-video-pro", note: "1080p/2k/4k；Mulerouter-only，不回退阿里" },
  { from: "wan30-video-prime", to: "w3.0-video-prime", note: "480p/720p/1080p；参数不兼容时明确报错" },
  { from: "wan30-video-prime-pro", to: "w3.0-video-prime-pro", note: "1080p/2k/4k；Mulerouter-only，不回退阿里" },
  { from: "wan27-i2v", to: "wan2.7-i2v-spicy", note: "仅首帧，可选驱动音频和反向提示词；尾帧或首段视频仍走阿里" },
  { from: "wan-animate-move", to: "wan-animate", note: "mode=animate，分辨率只接受 480p/720p" },
  { from: "wan-animate-mix", to: "wan-animate", note: "角色替换走官方 mode=replace；wan-pro 仍走阿里" },
    { from: "image-edit-single", to: "qwen-image-edit-spicy", note: "主图加最多 2 张参考图；n>1、水印或超过 3 张仍走阿里。输出尺寸跟随主图" },
  { from: "image-text-to-image", to: "z-image-spicy-pro", note: "无输入图走文生图；prompt 必填，可传 width/height/seed；4K 超出 2560 上限仍走阿里" },
]);

const UNMAPPED = Object.freeze([
  "HappyHorse 全部能力",
  "Wan2.7 文生视频 / 参考生视频 / 视频编辑",
    "Qwen 语言模型",
]);

const W30_RATIOS = Object.freeze(["adaptive", "16:9", "4:3", "1:1", "3:4", "9:16"]);
const SEED_MAX = 2147483647;

async function readRouteConfig() {
  const parsed = await getRuntimeSettingFromDb(ROUTE_SETTING_KEY, { enabled: false, updatedAt: "" });
  return {
    enabled: parsed?.enabled === true,
    updatedAt: String(parsed?.updatedAt || ""),
  };
}

async function writeRouteConfig(enabled) {
  const next = {
    enabled: enabled === true,
    updatedAt: new Date().toISOString(),
  };
  await setRuntimeSettingInDb(ROUTE_SETTING_KEY, next);
  return next;
}

function hasKey() {
  return Boolean(String(process.env.MULEROUTER_API_KEY || "").trim());
}

function usernameOf(user = null) {
  return String(user?.username || user?.name || user?.handle || "").trim().toLowerCase();
}

function userForced(user = null) {
  const name = usernameOf(user);
  return Boolean(name) && FORCED_USERNAMES.has(name);
}

async function routeActive(user = null) {
  return userForced(user) || (await readRouteConfig()).enabled === true;
}

function mulerouterOnlyCapability(capability = "") {
  return ["wan30-video-pro", "wan30-video-prime-pro"].includes(String(capability || "").trim());
}

async function publicStatus() {
  const config = await readRouteConfig();
  return {
    enabled: config.enabled,
    updatedAt: config.updatedAt,
    keyConfigured: hasKey(),
    baseUrl: BASE_URL,
    forcedUsernames: [...FORCED_USERNAMES],
    mapped: MAPPED,
    unmapped: UNMAPPED,
  };
}

function specified(value) {
  return !(value === undefined || value === null || value === "");
}

function integerOrNull(value) {
  if (!specified(value)) return null;
  const number = Number(value);
  if (!Number.isInteger(number)) return null;
  return number;
}

function seedOrFallback(value) {
  const seed = integerOrNull(value);
  if (seed === null) return { ok: true, value: null };
  if (seed < 0 || seed > SEED_MAX) return { ok: false };
  return { ok: true, value: seed };
}

function choiceOrFallback(value, allowed) {
  if (!specified(value)) return { ok: true, value: null };
  const text = String(value).trim().toLowerCase();
  if (allowed.includes(text)) return { ok: true, value: text };
  return { ok: false };
}

function mediaOf(media = [], type) {
  return (Array.isArray(media) ? media : []).filter((item) => item && item.type === type && item.url);
}

function cannot(reason, mappingMissing = false) {
  return { use: false, reason, mappingMissing };
}

function textOrEmpty(value) {
  return String(value || "").trim();
}

async function decideVideo({ user = null, capability = "", media = [], parameters = {}, prompt = "" } = {}) {
  if (!(await routeActive(user))) return cannot("aliyun-default");
  const params = parameters && typeof parameters === "object" ? parameters : {};
  const mulerouterOnly = capability === "wan30-video-pro" || capability === "wan30-video-prime-pro";
  if (!mulerouterOnly && (params.prompt_extend_text || params.audio_setting === "origin")) return cannot("aliyun-only-parameter");
  if (params.watermark === true) return cannot("watermark-not-supported");
  const seed = seedOrFallback(params.seed);
  if (!seed.ok) return cannot("seed-out-of-range");

  if (capability === "wan30-video" || capability === "wan30-video-pro" || capability === "wan30-video-prime" || capability === "wan30-video-prime-pro") {
    const frames = [...mediaOf(media, "first_frame"), ...mediaOf(media, "last_frame")];
    const linkItems = mediaOf(media, "link");
    const link = textOrEmpty(linkItems[0]?.url || params.link || params.reference_link || params.referenceLink);
    const refs = ["reference_image", "reference_video", "reference_audio", "file", "link"]
      .flatMap((type) => mediaOf(media, type));
    if (link && !linkItems.length) refs.push({ type: "link", url: link });
    if (frames.length && (refs.length || link)) return cannot("keyframe-reference-mix");
    if (linkItems.length > 1) return cannot("too-many-links");
    if (mediaOf(media, "reference_image").length > 10) return cannot("too-many-reference-images");
    if (mediaOf(media, "reference_video").length > 5) return cannot("too-many-reference-videos");
    if (mediaOf(media, "reference_audio").length > 5) return cannot("too-many-reference-audios");
    const file = mediaOf(media, "file");
    if (file.length > 1) return cannot("too-many-files");
    if (file.length && link) return cannot("file-link-exclusive");
    const duration = integerOrNull(params.duration);
    if (duration !== null && duration !== -1 && (duration < 2 || duration > 30)) return cannot("duration-out-of-range");
    const slugByCapability = {
      "wan30-video": "w3.0-video",
      "wan30-video-pro": "w3.0-video-pro",
      "wan30-video-prime": "w3.0-video-prime",
      "wan30-video-prime-pro": "w3.0-video-prime-pro",
    };
    const resolutionsByCapability = {
      "wan30-video": ["480p", "720p", "1080p"],
      "wan30-video-pro": ["1080p", "2k", "4k"],
      "wan30-video-prime": ["480p", "720p", "1080p"],
      "wan30-video-prime-pro": ["1080p", "2k", "4k"],
    };
    const slug = slugByCapability[capability];
    const resolution = choiceOrFallback(params.resolution, resolutionsByCapability[capability]);
    if (!resolution.ok) return cannot("resolution-not-supported");
    const ratio = choiceOrFallback(params.ratio, W30_RATIOS);
    if (!ratio.ok) return cannot("ratio-not-supported");
    const body = {};
    const promptText = textOrEmpty(prompt);
    if (promptText) body.prompt = promptText;
    if (resolution.value) body.resolution = resolution.value;
    if (ratio.value) body.ratio = ratio.value;
    if (duration !== null) body.duration = duration;
    if (specified(params.audio)) body.audio = params.audio !== false;
    if (specified(params.prompt_extend)) body.prompt_extend = params.prompt_extend !== false;
    if (seed.value !== null) body.seed = seed.value;
    const first = mediaOf(media, "first_frame")[0];
    const last = mediaOf(media, "last_frame")[0];
    if (first) body.first_frame = first.url;
    if (last) body.last_frame = last.url;
    if (!frames.length) {
      const images = mediaOf(media, "reference_image").map((item) => item.url);
      const videos = mediaOf(media, "reference_video").map((item) => item.url);
      const audios = mediaOf(media, "reference_audio").map((item) => item.url);
      if (images.length) body.reference_images = images;
      if (videos.length) body.reference_videos = videos;
      if (audios.length) body.reference_audios = audios;
      if (file[0]) body.file = file[0].url;
      if (link) body.link = link;
    }
    if (!body.prompt && !body.first_frame && !body.last_frame && !body.reference_images && !body.reference_videos && !body.reference_audios && !body.file && !body.link) {
      return cannot("missing-prompt-or-media");
    }
    return { use: true, vendor: "carrothub", slug, body, kind: "video" };
  }

  if (capability === "wan27-i2v") {
    const allowedTypes = new Set(["first_frame", "driving_audio"]);
    if ((media || []).some((item) => item && !allowedTypes.has(item.type))) return cannot("i2v-extra-media");
    const first = mediaOf(media, "first_frame");
    const audio = mediaOf(media, "driving_audio");
    if (first.length !== 1 || audio.length > 1) return cannot("i2v-shape");
    const promptText = textOrEmpty(prompt);
    if (!promptText) return cannot("missing-prompt");
    const duration = integerOrNull(params.duration);
    if (duration !== null && (duration < 2 || duration > 15)) return cannot("duration-out-of-range");
    const resolution = choiceOrFallback(params.resolution, ["720p", "1080p"]);
    if (!resolution.ok) return cannot("resolution-not-supported");
    const body = {
      prompt: promptText,
      image: first[0].url,
    };
    if (resolution.value) body.resolution = resolution.value;
    if (duration !== null) body.duration = duration;
    if (specified(params.prompt_extend)) body.prompt_extend = params.prompt_extend !== false;
    const negative = textOrEmpty(params.negative_prompt || params.negativePrompt);
    if (negative) body.negative_prompt = negative;
    if (audio[0]) body.audio_url = audio[0].url;
    if (params.audio === false) body.audio = false;
    else if (specified(params.audio)) body.audio = true;
    if (seed.value !== null) body.seed = seed.value;
    return { use: true, vendor: "carrothub", slug: "wan2.7-i2v-spicy", body, kind: "video" };
  }

  if (capability === "wan-animate-move" || capability === "wan-animate-mix") {
    const requestedMode = String(params.mode || "").trim().toLowerCase();
    if (requestedMode === "wan-pro") return cannot("animate-pro-not-supported");
    if (requestedMode && !["wan-std", "animate", "replace"].includes(requestedMode)) return cannot("animate-mode-not-supported");
    const image = mediaOf(media, "image_url");
    const video = mediaOf(media, "video_url");
    if (image.length !== 1 || video.length !== 1 || (media || []).length !== 2) return cannot("animate-shape");
    const resolution = choiceOrFallback(params.resolution, ["480p", "720p"]);
    if (!resolution.ok) return cannot("animate-resolution");
    const body = {
      image: image[0].url,
      video: video[0].url,
      mode: capability === "wan-animate-mix" || requestedMode === "replace" ? "replace" : "animate",
    };
    if (resolution.value) body.resolution = resolution.value;
    const promptText = textOrEmpty(prompt);
    if (promptText) body.prompt = promptText;
    if (seed.value !== null) body.seed = seed.value;
    return { use: true, vendor: "carrothub", slug: "wan-animate", body, kind: "video" };
  }

  return cannot("no-mulerouter-equivalent", mulerouterOnly);
}

async function decideImageEdit({ user = null, imageUrls = [], prompt = "", parameters = {} } = {}) {
  if (!(await routeActive(user))) return cannot("aliyun-default");
  const params = parameters && typeof parameters === "object" ? parameters : {};
  const urls = (Array.isArray(imageUrls) ? imageUrls : []).map((item) => String(item || "").trim()).filter(Boolean);
  if (!urls.length) return cannot("missing-image");
  if (urls.length > 3) return cannot("too-many-images");
  const count = Number(params.n);
  if (Number.isFinite(count) && count > 1) return cannot("multi-output-stays-aliyun");
  if (params.watermark === true) return cannot("watermark-not-supported");
  const promptText = textOrEmpty(prompt);
  if (!promptText) return cannot("missing-prompt");
  const seed = seedOrFallback(params.seed);
  if (!seed.ok) return cannot("seed-out-of-range");
  const body = {
    image: urls[0],
    prompt: promptText,
  };
  if (urls.length > 1) body.reference_images = urls.slice(1, 3);
  if (seed.value !== null) body.seed = seed.value;
  return {
    use: true,
    vendor: "carrothub",
    slug: "qwen-image-edit-spicy",
    body,
    kind: "image",
  };
}


async function decideTextToImage({ user = null, prompt = "", parameters = {} } = {}) {
  if (!(await routeActive(user))) return cannot("aliyun-default");
  const params = parameters && typeof parameters === "object" ? parameters : {};
  const promptText = textOrEmpty(prompt);
  if (!promptText) return cannot("missing-prompt");
  const count = Number(params.n);
  if (Number.isFinite(count) && count > 1) return cannot("multi-output-stays-aliyun");
  if (params.watermark === true) return cannot("watermark-not-supported");
  const seed = seedOrFallback(params.seed);
  if (!seed.ok) return cannot("seed-out-of-range");
  const body = { prompt: promptText };
  const size = String(params.size || "").trim();
  if (size) {
    const parsed = size.match(/^(\d{3,5})\s*[x*×]\s*(\d{3,5})$/i);
    if (!parsed) return cannot("size-not-recognized");
    const width = Number(parsed[1]);
    const height = Number(parsed[2]);
    if (width < 256 || width > 2560 || height < 256 || height > 2560) return cannot("size-out-of-range");
    body.width = width;
    body.height = height;
  }
  if (specified(params.prompt_extend)) body.prompt_extend = params.prompt_extend !== false;
  if (seed.value !== null) body.seed = seed.value;
  return {
    use: true,
    vendor: "carrothub",
    slug: "z-image-spicy-pro",
    body,
    kind: "image",
  };
}

function missingKeyError() {
  const error = new Error("Mulerouter API key is not configured. Add MULEROUTER_API_KEY before using the new Alibaba replacement.");
  error.statusCode = 503;
  error.code = "MISSING_MULEROUTER_API_KEY";
  return error;
}

async function request(pathname, { method = "GET", body = null, timeoutMs = 180000 } = {}) {
  const apiKey = String(process.env.MULEROUTER_API_KEY || "").trim();
  if (!apiKey) throw missingKeyError();
  const response = await fetch(`${BASE_URL}${pathname}`, {
    method,
    headers: {
      authorization: `Bearer ${apiKey}`,
      accept: "application/json",
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { text };
  }
  if (!response.ok) {
    const error = new Error(payload.detail || payload.title || payload.message || payload.error?.detail || payload.error?.message || `Mulerouter request failed: ${response.status}`);
    error.statusCode = response.status || 502;
    error.payload = payload;
    error.code = payload.error_code || payload.code || payload.error?.code || "MULEROUTER_REQUEST_FAILED";
    throw error;
  }
  return payload;
}

function generationPath(vendor, slug, taskId = "") {
  const base = `/vendors/${vendor}/v1/${slug}/generation`;
  return taskId ? `${base}/${encodeURIComponent(taskId)}` : base;
}

function taskInfoOf(raw = {}) {
  return raw.task_info || raw.taskInfo || {};
}

function extractTaskId(raw = {}) {
  const info = taskInfoOf(raw);
  return String(
    info.id
    || raw.task_id
    || raw.taskId
    || raw.id
    || raw.data?.task_id
    || raw.data?.taskId
    || raw.output?.task_id
    || raw.task?.id
    || "",
  ).trim();
}

function mediaUrls(value) {
  const list = Array.isArray(value) ? value : (value ? [value] : []);
  return list.map((item) => {
    if (typeof item === "string") return item.trim();
    if (!item || typeof item !== "object") return "";
    return String(item.url || item.video_url || item.image_url || item.image || "").trim();
  }).filter(Boolean);
}

function extractError(raw = {}) {
  const info = taskInfoOf(raw);
  const error = info.error || raw.error || {};
  if (typeof error === "string") return error;
  return String(error.detail || error.message || error.title || raw.detail || raw.message || raw.output?.message || "").trim();
}

function encodeRef(slug, taskId) {
  return `mr:${slug}:${taskId}`;
}

function parseRef(value = "") {
  const text = String(value || "").trim();
  const match = text.match(/^mr:([^:]+):(.+)$/);
  if (!match) return { source: "aliyun", slug: "", taskId: text };
  return { source: "mulerouter", slug: match[1], taskId: match[2] };
}

function normalizeTask(raw = {}, slug = "") {
  const info = taskInfoOf(raw);
  const taskId = extractTaskId(raw);
  const status = String(info.status || raw.status || raw.output?.status || raw.task_status || "pending").trim().toLowerCase();
  const videos = mediaUrls(raw.videos || raw.output?.videos || raw.output?.video_url);
  const images = mediaUrls(raw.images || raw.output?.images || raw.output?.image_url || raw.output?.url);
  const imageJob = slug.includes("image") || (images.length > 0 && videos.length === 0);
  return {
    taskId: taskId ? encodeRef(slug, taskId) : "",
    status,
    videoUrl: imageJob ? "" : (videos[0] || ""),
    imageUrls: imageJob ? images : [],
    error: extractError(raw),
    raw,
  };
}

async function submit(decision) {
  if (!decision?.use) throw new Error("Mulerouter route was not selected.");
  if (!hasKey()) throw missingKeyError();
  const raw = await request(generationPath(decision.vendor, decision.slug), {
    method: "POST",
    body: decision.body,
  });
  return { raw, task: normalizeTask(raw, decision.slug), slug: decision.slug };
}

async function query(ref) {
  const parsed = typeof ref === "string" ? parseRef(ref) : ref;
  if (parsed.source !== "mulerouter") {
    const error = new Error("Not a Mulerouter task.");
    error.statusCode = 400;
    throw error;
  }
  const raw = await request(generationPath("carrothub", parsed.slug, parsed.taskId), { method: "GET", timeoutMs: 30000 });
  return { raw, task: normalizeTask(raw, parsed.slug) };
}

function shapeQuery(raw = {}, slug = "") {
  return { raw, task: normalizeTask(raw, slug) };
}

module.exports = {
  FORCED_USERNAMES,
  MAPPED,
  UNMAPPED,
  decideImageEdit,
  decideTextToImage,
  decideVideo,
  encodeRef,
  hasKey,
  missingKeyError,
  mulerouterOnlyCapability,
  parseRef,
  publicStatus,
  query,
  shapeQuery,
  readRouteConfig,
  routeActive,
  submit,
  userForced,
  writeRouteConfig,
};
