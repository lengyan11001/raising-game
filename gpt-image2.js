"use strict";

const GPT_IMAGE2_PROVIDER = "gpt-image-2";
const GPT_IMAGE2_LABEL = "GPT Image 2";
const GPT_IMAGE2_TEXT_MODEL = "openai/gpt-image-2";
const GPT_IMAGE2_EDIT_MODEL = "openai/gpt-image-2/edit";

const GPT_IMAGE2_RESOLUTIONS = Object.freeze(["1K", "2K", "4K"]);
const GPT_IMAGE2_QUALITIES = Object.freeze(["low", "medium", "high"]);
const GPT_IMAGE2_OUTPUT_FORMATS = Object.freeze(["png", "jpeg", "webp"]);
const GPT_IMAGE2_RATIOS = Object.freeze([
  "1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "4:5", "5:4", "21:9",
]);
const GPT_IMAGE2_EDIT_RATIOS = Object.freeze(["auto", ...GPT_IMAGE2_RATIOS]);
const GPT_IMAGE2_DEFAULT_RESOLUTION = "1K";
const GPT_IMAGE2_DEFAULT_QUALITY = "medium";
const GPT_IMAGE2_DEFAULT_RATIO = "1:1";
const GPT_IMAGE2_DEFAULT_OUTPUT_FORMAT = "png";
const GPT_IMAGE2_REFERENCE_LIMIT = 10;

// APIZ bills in CNY points (100 points = 1 CNY). Site credits map to USD
// (100 credits = 1 USD) using the same 6.67 CNY/USD rate as APIZ Seedance 2.5.
const GPT_IMAGE2_CNY_PER_POINT = 0.01;
const GPT_IMAGE2_CNY_PER_USD = 6.67;
const GPT_IMAGE2_SITE_CREDITS_PER_USD = 100;
const GPT_IMAGE2_SALE_MARKUP = 1.5;

// Measured live on https://api.apiz.ai for openai/gpt-image-2 & /edit (2026-11-25).
const GPT_IMAGE2_UPSTREAM_POINTS_BY_SPEC = Object.freeze({
  "1K": Object.freeze({ low: 5, medium: 43, high: 170 }),
  "2K": Object.freeze({ low: 5, medium: 54, high: 345 }),
  "4K": Object.freeze({ low: 5, medium: 54, high: 345 }),
});
const GPT_IMAGE2_UPSTREAM_REFERENCE_POINTS = 7;

function roundPrice(value, digits = 6) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return 0;
  const scale = 10 ** Math.max(0, Math.min(8, Math.floor(digits)));
  return Math.round(num * scale) / scale;
}

function normalizeGptImage2Resolution(value = "", fallback = GPT_IMAGE2_DEFAULT_RESOLUTION) {
  const raw = String(value || "").trim().toUpperCase();
  if (GPT_IMAGE2_RESOLUTIONS.includes(raw)) return raw;
  if (raw === "1024" || raw === "1024X1024") return "1K";
  if (raw === "2048" || raw === "2048X2048") return "2K";
  if (raw === "4096" || raw === "2880" || raw === "3840") return "4K";
  return GPT_IMAGE2_RESOLUTIONS.includes(String(fallback || "").toUpperCase())
    ? String(fallback).toUpperCase()
    : GPT_IMAGE2_DEFAULT_RESOLUTION;
}

function normalizeGptImage2Quality(value = "", fallback = GPT_IMAGE2_DEFAULT_QUALITY) {
  const raw = String(value || "").trim().toLowerCase();
  if (GPT_IMAGE2_QUALITIES.includes(raw)) return raw;
  if (["standard", "normal", "mid", "balanced"].includes(raw)) return "medium";
  if (["fast", "draft", "lite"].includes(raw)) return "low";
  if (["pro", "hd", "ultra", "best"].includes(raw)) return "high";
  return GPT_IMAGE2_QUALITIES.includes(String(fallback || "").toLowerCase())
    ? String(fallback).toLowerCase()
    : GPT_IMAGE2_DEFAULT_QUALITY;
}

function normalizeGptImage2OutputFormat(value = "", fallback = GPT_IMAGE2_DEFAULT_OUTPUT_FORMAT) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "jpg") return "jpeg";
  if (GPT_IMAGE2_OUTPUT_FORMATS.includes(raw)) return raw;
  return GPT_IMAGE2_OUTPUT_FORMATS.includes(String(fallback || "").toLowerCase())
    ? String(fallback).toLowerCase()
    : GPT_IMAGE2_DEFAULT_OUTPUT_FORMAT;
}

function normalizeGptImage2Ratio(value = "", { allowAuto = false, fallback = GPT_IMAGE2_DEFAULT_RATIO } = {}) {
  const raw = String(value || "").trim().toLowerCase().replace(/\s+/g, "");
  if (raw === "auto" || raw === "adaptive") {
    return allowAuto ? "auto" : (GPT_IMAGE2_RATIOS.includes(fallback) ? fallback : GPT_IMAGE2_DEFAULT_RATIO);
  }
  const normalized = raw.replace(/[x×]/g, ":");
  if (GPT_IMAGE2_RATIOS.includes(normalized)) return normalized;
  if (allowAuto && fallback === "auto") return "auto";
  return GPT_IMAGE2_RATIOS.includes(fallback) ? fallback : GPT_IMAGE2_DEFAULT_RATIO;
}

function gptImage2PointsToPurchaseUsd(points, cnyPerUsd = GPT_IMAGE2_CNY_PER_USD) {
  const pts = Number(points);
  const rate = Number(cnyPerUsd) > 0 ? Number(cnyPerUsd) : GPT_IMAGE2_CNY_PER_USD;
  if (!Number.isFinite(pts) || pts <= 0) return 0;
  return roundPrice((pts * GPT_IMAGE2_CNY_PER_POINT) / rate, 6);
}

function gptImage2PointsToSaleUsd(points, {
  cnyPerUsd = GPT_IMAGE2_CNY_PER_USD,
  markup = GPT_IMAGE2_SALE_MARKUP,
} = {}) {
  const purchaseUsd = gptImage2PointsToPurchaseUsd(points, cnyPerUsd);
  const factor = Number(markup) > 0 ? Number(markup) : GPT_IMAGE2_SALE_MARKUP;
  return roundPrice(purchaseUsd * factor, 6);
}

function gptImage2UpstreamPoints(resolution = GPT_IMAGE2_DEFAULT_RESOLUTION, quality = GPT_IMAGE2_DEFAULT_QUALITY) {
  const res = normalizeGptImage2Resolution(resolution);
  const qual = normalizeGptImage2Quality(quality);
  return GPT_IMAGE2_UPSTREAM_POINTS_BY_SPEC[res]?.[qual] ?? GPT_IMAGE2_UPSTREAM_POINTS_BY_SPEC["1K"].medium;
}

function gptImage2PricingRowKey(resolution = GPT_IMAGE2_DEFAULT_RESOLUTION, quality = GPT_IMAGE2_DEFAULT_QUALITY) {
  return `gpt-image-2-${normalizeGptImage2Resolution(resolution).toLowerCase()}-${normalizeGptImage2Quality(quality)}`;
}

function buildGptImage2UpstreamPayload({
  prompt = "",
  ratio = GPT_IMAGE2_DEFAULT_RATIO,
  resolution = GPT_IMAGE2_DEFAULT_RESOLUTION,
  quality = GPT_IMAGE2_DEFAULT_QUALITY,
  outputFormat = GPT_IMAGE2_DEFAULT_OUTPUT_FORMAT,
  imageUrls = [],
  maskUrl = "",
} = {}) {
  const cleanPrompt = String(prompt || "").trim();
  const refs = (Array.isArray(imageUrls) ? imageUrls : []).map((u) => String(u || "").trim()).filter(Boolean);
  const isEdit = refs.length > 0;
  const cleanMask = isEdit ? String(maskUrl || "").trim() : "";
  const resolvedResolution = normalizeGptImage2Resolution(resolution);
  const resolvedQuality = normalizeGptImage2Quality(quality);
  const resolvedFormat = normalizeGptImage2OutputFormat(outputFormat);
  const resolvedSize = normalizeGptImage2Ratio(ratio, {
    allowAuto: isEdit,
    fallback: isEdit ? "auto" : GPT_IMAGE2_DEFAULT_RATIO,
  });
  const params = {
    prompt: cleanPrompt,
    image_size: resolvedSize,
    resolution: resolvedResolution,
    quality: resolvedQuality,
    num_images: 1,
    output_format: resolvedFormat,
  };
  if (isEdit) {
    params.image_urls = refs;
    if (cleanMask) params.mask_url = cleanMask;
  }
  return {
    model: isEdit ? GPT_IMAGE2_EDIT_MODEL : GPT_IMAGE2_TEXT_MODEL,
    params,
    channel: null,
  };
}

function extractGptImage2OutputUrls(task = null) {
  if (!task || typeof task !== "object") return [];
  const candidates = [
    ...(Array.isArray(task.output?.images) ? task.output.images : []),
    ...(Array.isArray(task.result?.images) ? task.result.images : []),
    ...(Array.isArray(task.images) ? task.images : []),
    ...(Array.isArray(task.data?.output?.images) ? task.data.output.images : []),
    ...(Array.isArray(task.data?.result?.images) ? task.data.result.images : []),
  ];
  const urls = [];
  for (const item of candidates) {
    const url = typeof item === "string" ? item.trim() : String(item?.url || item?.image_url || "").trim();
    if (/^https?:\/\//i.test(url) && !urls.includes(url)) urls.push(url);
  }
  return urls;
}

function extractGptImage2ReportedPoints(task = null) {
  if (!task || typeof task !== "object") return null;
  for (const candidate of [task.price, task.data?.price, task.billing?.price, task.billing?.points]) {
    const num = Number(candidate);
    if (Number.isFinite(num) && num > 0) return roundPrice(num, 4);
  }
  return null;
}

module.exports = {
  GPT_IMAGE2_PROVIDER,
  GPT_IMAGE2_LABEL,
  GPT_IMAGE2_TEXT_MODEL,
  GPT_IMAGE2_EDIT_MODEL,
  GPT_IMAGE2_RESOLUTIONS,
  GPT_IMAGE2_QUALITIES,
  GPT_IMAGE2_OUTPUT_FORMATS,
  GPT_IMAGE2_RATIOS,
  GPT_IMAGE2_EDIT_RATIOS,
  GPT_IMAGE2_DEFAULT_RESOLUTION,
  GPT_IMAGE2_DEFAULT_QUALITY,
  GPT_IMAGE2_DEFAULT_RATIO,
  GPT_IMAGE2_DEFAULT_OUTPUT_FORMAT,
  GPT_IMAGE2_REFERENCE_LIMIT,
  GPT_IMAGE2_CNY_PER_POINT,
  GPT_IMAGE2_CNY_PER_USD,
  GPT_IMAGE2_SITE_CREDITS_PER_USD,
  GPT_IMAGE2_SALE_MARKUP,
  GPT_IMAGE2_UPSTREAM_POINTS_BY_SPEC,
  GPT_IMAGE2_UPSTREAM_REFERENCE_POINTS,
  normalizeGptImage2Resolution,
  normalizeGptImage2Quality,
  normalizeGptImage2OutputFormat,
  normalizeGptImage2Ratio,
  gptImage2PointsToPurchaseUsd,
  gptImage2PointsToSaleUsd,
  gptImage2UpstreamPoints,
  gptImage2PricingRowKey,
  buildGptImage2UpstreamPayload,
  extractGptImage2OutputUrls,
  extractGptImage2ReportedPoints,
};
