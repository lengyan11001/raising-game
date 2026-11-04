(function initAdvancedVegaMedia(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.AdvancedVegaMedia = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function advancedVegaMediaFactory() {
  "use strict";

  const VEGA_PUBLIC_URL_REQUIRED = "Vega requires a public HTTP(S) URL. Choose an asset stored in public object storage.";
  const TARGET_CONFIG = Object.freeze({
    primary: Object.freeze({ type: "image", accept: "image/*", multiple: false }),
    lastFrame: Object.freeze({ type: "image", accept: "image/*", multiple: false }),
    referenceImages: Object.freeze({ type: "image", accept: "image/*", multiple: true }),
    video: Object.freeze({ type: "video", accept: "video/mp4,video/webm,video/quicktime,video/*", multiple: true }),
    audio: Object.freeze({ type: "audio", accept: "audio/*", multiple: true }),
  });

  function publicHttpUrl(value = "") {
    const raw = String(value || "").trim();
    if (!raw) return "";
    let parsed;
    try {
      parsed = new URL(raw);
    } catch (_error) {
      return "";
    }
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) return "";
    const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
    if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) return "";
    const mappedIpv4 = hostname.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1] || "";
    const ipv4 = mappedIpv4 || (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) ? hostname : "");
    if (ipv4) {
      const parts = ipv4.split(".").map(Number);
      if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return "";
      if (parts[0] === 0 || parts[0] === 10 || parts[0] === 127 || parts[0] === 169 && parts[1] === 254
        || parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31
        || parts[0] === 192 && parts[1] === 168
        || parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return "";
    }
    if (hostname.includes(":") && (hostname === "::1" || hostname === "::" || hostname.startsWith("fc") || hostname.startsWith("fd") || /^fe[89ab]/.test(hostname))) return "";
    return raw;
  }

  function assetMediaKind(asset = {}) {
    const kind = String(asset.kind || "").toLowerCase();
    const mime = String(asset.mime || "").toLowerCase();
    if (kind === "video" || mime.startsWith("video/") || mime === "application/mp4") return "video";
    if (kind === "audio" || mime.startsWith("audio/")) return "audio";
    if (kind === "document") return "document";
    return "image";
  }

  function assetMediaUrl(asset = {}) {
    return publicHttpUrl(
      asset.publicUrl
      || asset.cdnUrl
      || asset.url
      || asset.imageUrl
      || asset.videoUrl
      || asset.audioUrl
      || asset.previewUrl
      || "",
    );
  }

  function uploadTargetConfig(targetId = "primary") {
    return TARGET_CONFIG[targetId] || TARGET_CONFIG.primary;
  }

  function selectionForAsset({ asset = {}, targetId = "primary" } = {}) {
    const target = TARGET_CONFIG[targetId];
    if (!target) return { ok: false, code: "INVALID_TARGET", message: "Choose a Vega media target." };
    const mediaKind = assetMediaKind(asset);
    if (target.type !== mediaKind) {
      return { ok: false, code: "WRONG_TYPE", mediaKind, targetType: target.type, message: `Choose ${target.type} media for this target.` };
    }
    const sourceUrl = assetMediaUrl(asset);
    if (!sourceUrl) return { ok: false, code: "PUBLIC_URL_REQUIRED", message: VEGA_PUBLIC_URL_REQUIRED };
    const ref = {
      assetId: asset.id || asset.assetId || "",
      dataUrl: sourceUrl,
      url: sourceUrl,
      publicUrl: sourceUrl,
      previewUrl: sourceUrl,
      fileName: asset.fileName || asset.name || "",
      name: asset.name || asset.fileName || (mediaKind === "audio" ? "Audio reference" : mediaKind === "video" ? "Video reference" : "Image reference"),
      durationSeconds: Number(asset.durationSeconds || asset.duration || 0) || 0,
      fromLibrary: true,
    };
    const action = targetId === "primary"
      ? "firstFrame"
      : targetId === "lastFrame"
      ? "lastFrame"
      : targetId === "referenceImages"
      ? "referenceImage"
      : targetId === "video"
      ? "videoReference"
      : "audioReference";
    return { ok: true, action, sourceUrl, ref };
  }

  return {
    VEGA_PUBLIC_URL_REQUIRED,
    assetMediaKind,
    assetMediaUrl,
    publicHttpUrl,
    selectionForAsset,
    uploadTargetConfig,
  };
});
