"use strict";

const crypto = require("node:crypto");

const VEGA_MODEL_NAME = "wand-vega-video";
const VEGA_PROVIDERS = Object.freeze({
  "seedance20-vega": Object.freeze({
    id: "seedance20-vega",
    label: "Seedance 2.0（Vega）",
    modelName: VEGA_MODEL_NAME,
    modelVersion: "1.0-pro",
  }),
  "seedance25-vega": Object.freeze({
    id: "seedance25-vega",
    label: "Seedance 2.5（Vega）",
    modelName: VEGA_MODEL_NAME,
    modelVersion: "1.5-pro",
  }),
  "h3-vega": Object.freeze({
    id: "h3-vega",
    label: "H3（Vega）",
    modelName: VEGA_MODEL_NAME,
    modelVersion: "1.5-lite",
  }),
});
const VEGA_PROVIDER_IDS = Object.freeze(Object.keys(VEGA_PROVIDERS));
const VEGA_USAGES = Object.freeze(new Set(["FirstFrame", "LastFrame", "Reference"]));
const VEGA_RESOLUTIONS = Object.freeze(["768P", "1080P", "2K", "4K"]);
const VEGA_RATIOS = Object.freeze(["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"]);
const VEGA_MEDIA_MODES = Object.freeze({
  reference_video: Object.freeze({
    id: "reference_video",
    label: "Multimodal References",
  }),
  first_last_frame: Object.freeze({
    id: "first_last_frame",
    label: "First + Last Frame",
  }),
});

function isVegaProvider(value = "") {
  const normalized = String(value || "").trim().toLowerCase().replace(/[\s_]+/g, "-");
  return VEGA_PROVIDER_IDS.includes(normalized);
}

function vegaProviderDefinition(value = "") {
  const normalized = String(value || "").trim().toLowerCase().replace(/[\s_]+/g, "-");
  return VEGA_PROVIDERS[normalized] || null;
}

function vegaProviderLabel(value = "") {
  return vegaProviderDefinition(value)?.label || "";
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

function normalizeVegaMediaMode(value = "", input = {}) {
  const normalized = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (["first_last_frame", "first_last", "first_and_last", "start_end", "image_to_video", "i2v", "first_frame", "last_frame"].includes(normalized)) {
    return "first_last_frame";
  }
  if (["reference_video", "multimodal", "multi_modal", "references", "reference", "reference_images", "multi_reference", "omni", "omini"].includes(normalized)) {
    return "reference_video";
  }
  const hasFrames = Boolean(String(input.firstFrameUrl || "").trim() || String(input.lastFrameUrl || "").trim());
  const hasReferences = ["referenceImages", "referenceVideos", "referenceAudios"].some((key) => Array.isArray(input[key]) && input[key].length > 0);
  if (hasFrames && !hasReferences) return "first_last_frame";
  return "reference_video";
}

function vegaMediaSelection(input = {}) {
  const mode = normalizeVegaMediaMode(input.mediaMode || input.seedanceMode || input.functionMode, input);
  const firstFrameUrl = String(input.firstFrameUrl || "").trim();
  const lastFrameUrl = String(input.lastFrameUrl || "").trim();
  const referenceImages = Array.isArray(input.referenceImages) ? input.referenceImages.filter(Boolean) : [];
  const referenceVideos = Array.isArray(input.referenceVideos) ? input.referenceVideos.filter(Boolean) : [];
  const referenceAudios = Array.isArray(input.referenceAudios) ? input.referenceAudios.filter(Boolean) : [];
  const hasReferences = referenceImages.length + referenceVideos.length + referenceAudios.length > 0;
  const hasFrames = Boolean(firstFrameUrl || lastFrameUrl);
  if (mode === "first_last_frame") {
    if (hasReferences) {
      throw Object.assign(new Error("First + Last Frame cannot be combined with reference images, videos, or audio."), {
        statusCode: 400,
        code: "INVALID_MEDIA_COMBINATION",
      });
    }
    if (!firstFrameUrl || !lastFrameUrl) {
      throw Object.assign(new Error("First + Last Frame requires both a first frame and a last frame."), {
        statusCode: 400,
        code: "INVALID_MEDIA_COMBINATION",
      });
    }
  } else {
    if (hasFrames) {
      throw Object.assign(new Error("Multimodal References cannot be combined with first frame or last frame images."), {
        statusCode: 400,
        code: "INVALID_MEDIA_COMBINATION",
      });
    }
    if (!hasReferences) {
      throw Object.assign(new Error("Multimodal References requires at least one reference image, video, or audio."), {
        statusCode: 400,
        code: "INVALID_MEDIA_COMBINATION",
      });
    }
  }
  return {
    mode,
    firstFrameUrl,
    lastFrameUrl,
    referenceImages,
    referenceVideos,
    referenceAudios,
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
  try {
    parsed = new URL(raw);
  } catch {
    parsed = null;
  }
  if (!parsed || !["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || isPrivateVegaHostname(parsed.hostname)) {
    throw Object.assign(new Error(`${label} must be a public HTTP(S) URL.`), {
      statusCode: 400,
      code: "INVALID_MEDIA_URL",
      details: { url: raw },
    });
  }
  return raw;
}

function buildVegaFileInfos(input = {}) {
  const media = vegaMediaSelection(input);
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
  if (media.mode === "first_last_frame") {
    add("Image", media.firstFrameUrl, "FirstFrame", "First frame image");
    add("Image", media.lastFrameUrl, "LastFrame", "Last frame image");
  } else {
    media.referenceImages.forEach((url, index) => {
      add("Image", url, "Reference", `Reference image ${index + 1}`);
    });
    media.referenceVideos.forEach((url, index) => {
      add("Video", url, "Reference", `Reference video ${index + 1}`);
    });
    media.referenceAudios.forEach((url, index) => {
      add("Audio", url, "Reference", `Reference audio ${index + 1}`);
    });
  }
  return files;
}

function normalizeVegaDuration(provider = "", value) {
  const duration = Number(value ?? (String(provider).includes("h3") ? 6 : 5));
  if (!Number.isInteger(duration) || duration < 1 || duration > 15) {
    throw Object.assign(new Error("Vega duration must be an integer from 1 to 15 seconds."), {
      statusCode: 400,
      code: "INVALID_DURATION",
      details: { duration: value, min: 1, max: 15 },
    });
  }
  return duration;
}

function normalizeVegaResolution(value = "") {
  const raw = String(value || "1080P").trim().toUpperCase();
  const aliases = { "768p": "768P", "1080p": "1080P", "2k": "2K", "4k": "4K" };
  const normalized = aliases[raw.toLowerCase()] || raw;
  if (!VEGA_RESOLUTIONS.includes(normalized)) {
    throw Object.assign(new Error("Vega resolution must be one of 768P, 1080P, 2K, or 4K."), {
      statusCode: 400,
      code: "INVALID_RESOLUTION",
      details: { resolution: value, allowed: VEGA_RESOLUTIONS },
    });
  }
  return normalized;
}

function normalizeVegaRatio(value = "") {
  const normalized = String(value || "16:9").trim();
  if (!VEGA_RATIOS.includes(normalized)) {
    throw Object.assign(new Error(`Vega aspect ratio must be one of: ${VEGA_RATIOS.join(", ")}.`), {
      statusCode: 400,
      code: "INVALID_RATIO",
      details: { ratio: value, allowed: VEGA_RATIOS },
    });
  }
  return normalized;
}

function buildVegaCreatePayload(input = {}, { subAppId } = {}) {
  const provider = vegaProviderDefinition(input.provider);
  if (!provider) throw new Error("Unknown Vega provider.");
  if (!Number.isInteger(Number(subAppId)) || Number(subAppId) <= 0) {
    throw new Error("TENCENT_VOD_SUB_APP_ID must be a positive integer.");
  }
  if (!String(input.prompt || "").trim()) {
    throw Object.assign(new Error("Prompt is required."), { statusCode: 400, code: "PROMPT_REQUIRED" });
  }
  const media = vegaMediaSelection(input);
  const fileInfos = buildVegaFileInfos({ ...input, mediaMode: media.mode });
  return {
    SubAppId: Number(subAppId),
    ModelName: provider.modelName,
    ModelVersion: provider.modelVersion,
    FileInfos: fileInfos,
    Prompt: String(input.prompt).trim(),
    EnhancePromptMode: "disable",
    OutputConfig: {
      StorageMode: "Temporary",
      Duration: normalizeVegaDuration(provider.id, input.duration),
      Resolution: normalizeVegaResolution(input.resolution),
      AspectRatio: normalizeVegaRatio(input.ratio),
    },
    ...(input.seed === undefined || input.seed === null || input.seed === "" ? {} : { Seed: Number(input.seed) }),
  };
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
  const host = "vod.tencentcloudapi.com";
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
      "x-tc-region": String(env.TENCENT_VOD_REGION || "ap-guangzhou"),
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

function vegaOutputVideoUrl(task = {}) {
  const files = Array.isArray(task?.Output?.FileInfos) ? task.Output.FileInfos : [];
  const selected = files.find((item) => item && !String(item.UsageType || "").trim());
  return String(selected?.FileUrl || "").trim();
}

function vegaTaskFailureMessage(task = {}) {
  const message = String(task?.Message || "").trim();
  const code = String(task?.ErrCodeExt || "").trim();
  if (code && message) return `${code}: ${message}`;
  return message || code || "";
}

module.exports = {
  VEGA_MODEL_NAME,
  VEGA_PROVIDERS,
  VEGA_PROVIDER_IDS,
  VEGA_MEDIA_MODES,
  VEGA_RATIOS,
  VEGA_RESOLUTIONS,
  assertVegaPricingConfigured,
  buildVegaCreatePayload,
  buildVegaFileInfos,
  callTencentVod,
  isVegaProvider,
  normalizeVegaDuration,
  normalizeVegaMediaMode,
  normalizeVegaRatio,
  normalizeVegaResolution,
  normalizeVegaStatus,
  normalizeVegaUsage,
  isPrivateVegaHostname,
  publicVegaUrl,
  tencentTc3Authorization,
  vegaCreateTaskId,
  vegaOutputVideoUrl,
  vegaPricingUnavailableError,
  vegaProviderDefinition,
  vegaProviderLabel,
  vegaTaskDetail,
  vegaTaskFailureMessage,
  vegaMediaSelection,
};
