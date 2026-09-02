"use strict";

const UNDRESS_TOOL_UPLOAD_CHUNK_BYTES = 8 * 1024 * 1024;
const UNDRESS_TOOL_EXAMPLE_MEDIA = Object.freeze({
  image: Object.freeze({
    input: "/api/undress-tool/examples/image/input?v=image-20260819115156-587c60-webp1",
    result: "/api/undress-tool/examples/image/result?v=image-20260819115156-587c60-webp1",
    inputType: "image",
    resultType: "image",
  }),
  image_video: Object.freeze({
    input: "/api/undress-tool/examples/image_video/input",
    result: "https://media.123vips.com/undress-tool/examples/v1/image-video-result.mp4",
    inputType: "image",
    resultType: "video",
  }),
  video: Object.freeze({
    input: "https://media.123vips.com/undress-tool/examples/v1/video-input.mp4",
    result: "https://media.123vips.com/undress-tool/examples/v1/video-result.mp4",
    inputType: "video",
    resultType: "video",
  }),
});

const UNDRESS_TOOL_COPY = {
  en: {
    create: "Create",
    title: "Your fantasy, your rules.",
    subtitle: "Create custom adult images and turn your favorite photos into short AI videos.",
    imageOnly: "Image",
    imageVideo: "Image to video",
    videoOnly: "Video",
    uploadImage: "Upload image",
    uploadVideo: "Upload video",
    image: "Image",
    video: "Video",
    generate: "Generate",
    submitting: "Submitting...",
    uploading: "Uploading...",
    estimating: "Calculating...",
    firstFree: "First image generation is free. Unlock the completed result for {credits} credits.",
    imagePrice: "This image generation costs {credits} credits.",
    videoPrice: "{seconds} sec / {segments} segment(s) / {credits} credits",
    imageGuide: "Image: first generation is free; unlocking the completed result uses credits.",
    imageVideoGuide: "Image to video: upload an image and generation starts automatically; billed by output duration.",
    videoGuide: "Video: upload a video and processing starts automatically; billed by source duration.",
    signIn: "Sign in to see your price.",
    readFailed: "Unable to read this video.",
    imageRequired: "Upload an image for this type.",
    videoRequired: "Upload a video for this type.",
    template: "Template",
    submitted: "Generation started",
    generating: "Generating...",
    backToSubmit: "Back to upload",
    upload: "Upload",
  },
  zh: {
    create: "\u521b\u5efa",
    title: "\u4f60\u7684\u5e7b\u60f3\uff0c\u4f60\u505a\u4e3b\u3002",
    subtitle: "\u521b\u5efa\u81ea\u5b9a\u4e49\u7684\u6210\u4eba\u5185\u5bb9\u56fe\u7247\uff0c\u5c06\u4f60\u559c\u6b22\u7684\u56fe\u7247\u8f6c\u6362\u6210\u7b80\u77ed\u7684AI\u89c6\u9891\u3002",
    imageOnly: "\u56fe\u7247",
    imageVideo: "\u56fe\u7247\u751f\u89c6\u9891",
    videoOnly: "\u89c6\u9891",
    uploadImage: "\u4e0a\u4f20\u56fe\u7247",
    uploadVideo: "\u4e0a\u4f20\u89c6\u9891",
    image: "\u56fe\u7247",
    video: "\u89c6\u9891",
    generate: "\u751f\u6210",
    submitting: "\u63d0\u4ea4\u4e2d...",
    uploading: "\u4e0a\u4f20\u4e2d...",
    estimating: "\u8ba1\u7b97\u4e2d...",
    firstFree: "\u9996\u5f20\u56fe\u7247\u514d\u8d39\u751f\u6210\uff0c\u7ed3\u679c\u9700 {credits} \u79ef\u5206\u89e3\u9501\u3002",
    imagePrice: "\u672c\u6b21\u56fe\u7247\u751f\u6210\u9700 {credits} \u79ef\u5206\u3002",
    videoPrice: "{seconds} \u79d2 \u00b7 {segments} \u6bb5 \u00b7 {credits} \u79ef\u5206",
    imageGuide: "\u56fe\u7247\uff1a\u9996\u6b21\u751f\u6210\u514d\u8d39\uff0c\u5b8c\u6210\u540e\u89e3\u9501\u4f7f\u7528\u79ef\u5206\u3002",
    imageVideoGuide: "\u56fe\u7247\u751f\u89c6\u9891\uff1a\u4e0a\u4f20\u56fe\u7247\u540e\u81ea\u52a8\u5f00\u59cb\uff0c\u6309\u8f93\u51fa\u65f6\u957f\u8ba1\u8d39\u3002",
    videoGuide: "\u89c6\u9891\uff1a\u4e0a\u4f20\u540e\u81ea\u52a8\u5904\u7406\uff0c\u6309\u6e90\u89c6\u9891\u65f6\u957f\u8ba1\u8d39\u3002",
    signIn: "\u767b\u5f55\u540e\u663e\u793a\u4ef7\u683c\u3002",
    readFailed: "\u65e0\u6cd5\u8bfb\u53d6\u8fd9\u4e2a\u89c6\u9891\u3002",
    imageRequired: "\u8fd9\u4e2a\u7c7b\u578b\u9700\u8981\u4e0a\u4f20\u56fe\u7247\u3002",
    videoRequired: "\u8fd9\u4e2a\u7c7b\u578b\u9700\u8981\u4e0a\u4f20\u89c6\u9891\u3002",
    template: "\u6a21\u677f",
    submitted: "\u5df2\u5f00\u59cb\u751f\u6210",
    generating: "\u751f\u6210\u4e2d...",
    backToSubmit: "\u8fd4\u56de\u4e0a\u4f20",
    upload: "\u4e0a\u4f20",
  },
};

const undressToolState = {
  generationType: "image",
  file: null,
  objectUrl: "",
  mediaKind: "",
  durationSeconds: 0,
  estimate: null,
  estimating: false,
  submitting: false,
  uploadProgress: 0,
  homeRecord: null,
  homeResultUrl: "",
  homeResultKind: "",
  message: "",
  initialized: false,
  autoOpened: false,
  reopenAfterLogin: false,
  lastUserId: "",
};

function undressToolEnabled() {
  return document.body.classList.contains("tenant-tool-undress")
    || (typeof isTenantTool === "function" && isTenantTool("undress"));
}

function undressToolText(key, vars = {}) {
  const lang = state?.lang === "zh" ? "zh" : "en";
  return String(UNDRESS_TOOL_COPY[lang]?.[key] || UNDRESS_TOOL_COPY.en[key] || key)
    .replace(/\{(\w+)\}/g, (_, name) => vars[name] ?? "");
}

function undressToolCredits(value) {
  return typeof formatCredits === "function"
    ? formatCredits(value || 0)
    : Number(value || 0).toFixed(2).replace(/\.00$/, "");
}

function undressToolEscape(value = "") {
  return typeof escapeHtml === "function" ? escapeHtml(value) : String(value || "");
}

function undressToolDialog() {
  return document.querySelector("#videoToolDialog");
}

function undressToolBody() {
  return document.querySelector(".undress-tool-inline-body") || document.querySelector("#videoToolDialogBody");
}

function undressToolFileKind(file) {
  const mime = String(file?.type || "").toLowerCase();
  const extension = String(file?.name || "").split(".").pop().toLowerCase();
  return mime.startsWith("video/") || ["mp4", "webm", "mov", "m4v"].includes(extension) ? "video" : "image";
}

function undressToolExpectedMediaKind() {
  return undressToolState.generationType === "video" ? "video" : "image";
}

function undressToolAccept() {
  return undressToolExpectedMediaKind() === "video"
    ? "video/mp4,video/webm,video/quicktime,video/x-m4v"
    : "image/jpeg,image/png,image/webp,image/bmp";
}

function undressToolFileMime(file) {
  const declared = String(file?.type || "").toLowerCase();
  if (declared && declared !== "application/octet-stream") return declared;
  const extension = String(file?.name || "").split(".").pop().toLowerCase();
  return {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", bmp: "image/bmp",
    mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", m4v: "video/x-m4v",
  }[extension] || (undressToolFileKind(file) === "video" ? "video/mp4" : "image/jpeg");
}

function resetUndressToolFile() {
  if (undressToolState.objectUrl) URL.revokeObjectURL(undressToolState.objectUrl);
  undressToolState.file = null;
  undressToolState.objectUrl = "";
  undressToolState.mediaKind = "";
  undressToolState.durationSeconds = 0;
  undressToolState.estimate = null;
  undressToolState.estimating = false;
  undressToolState.submitting = false;
  undressToolState.message = "";
  undressToolState.uploadProgress = 0;
  undressToolState.homeRecord = null;
  undressToolState.homeResultUrl = "";
  undressToolState.homeResultKind = "";
}

function undressToolCanSubmit() {
  return Boolean(
    undressToolState.generationType
    && undressToolState.file
    && undressToolState.mediaKind === undressToolExpectedMediaKind()
    && !undressToolState.submitting
    && !undressToolState.estimating,
  );
}

function undressToolHomeGuide(type = undressToolState.generationType) {
  const key = type === "image_video" ? "imageVideoGuide" : type === "video" ? "videoGuide" : "imageGuide";
  return undressToolText(key);
}

function undressToolExampleHtml() {
  const example = UNDRESS_TOOL_EXAMPLE_MEDIA[undressToolState.generationType];
  if (!example) return "";
  const inputMedia = example.inputType === "video"
    ? undressToolExampleVideoHtml(example.input)
    : `<img src="${undressToolEscape(example.input)}" alt="" loading="lazy" decoding="async" fetchpriority="low" />`;
  const resultMedia = example.resultType === "video"
    ? undressToolExampleVideoHtml(example.result)
    : `<img src="${undressToolEscape(example.result)}" alt="" loading="lazy" decoding="async" fetchpriority="low" />`;
  return `
    <div class="undress-tool-example-flow" aria-label="Example result">
      <div class="undress-tool-example-media">${inputMedia}</div>
      <span class="undress-tool-example-arrow" aria-hidden="true"><i data-lucide="arrow-right"></i></span>
      <div class="undress-tool-example-media">${resultMedia}</div>
    </div>
  `;
}

function undressToolCaseHtml(type) {
  const example = UNDRESS_TOOL_EXAMPLE_MEDIA[type];
  if (!example) return "";
  if (type === "image") return `<div class="undress-case-media undress-case-image-switch"><img class="undress-case-layer is-original" src="${undressToolEscape(example.input)}" alt="" /><img class="undress-case-layer is-template" src="${undressToolEscape(example.result)}" alt="" /><span class="undress-case-shimmer" aria-hidden="true"></span></div>`;
  if (type === "image_video") return `<div class="undress-case-media undress-case-video"><video src="${undressToolEscape(example.result)}" autoplay muted loop playsinline preload="metadata"></video><img class="undress-case-source-thumb" src="${undressToolEscape(example.input)}" alt="" /><button class="undress-case-play" type="button" data-undress-example-play aria-label="Play video"><i data-lucide="play"></i></button></div>`;
  return `<div class="undress-case-media undress-case-video undress-case-video-switch"><video class="undress-case-layer is-original" src="${undressToolEscape(example.input)}" autoplay muted loop playsinline preload="metadata"></video><video class="undress-case-layer is-template" src="${undressToolEscape(example.result)}" autoplay muted loop playsinline preload="metadata"></video><span class="undress-case-shimmer" aria-hidden="true"></span><button class="undress-case-play" type="button" data-undress-example-play aria-label="Play video"><i data-lucide="play"></i></button></div>`;
}

function undressToolExampleVideoHtml(src) {
  return `
    <video src="${undressToolEscape(src)}" controls playsinline preload="auto"></video>
    <button class="undress-tool-example-play" type="button" data-undress-example-play aria-label="Play video">
      <i data-lucide="play"></i>
    </button>
  `;
}

function bindUndressToolExampleVideos(body) {
  body.querySelectorAll("[data-undress-example-play]").forEach((button) => {
    const video = button.parentElement?.querySelector("video");
    if (!video) return;
    const showButton = () => {
      button.classList.remove("is-playing", "is-loading");
    };
    video.addEventListener("playing", () => button.classList.add("is-playing"));
    video.addEventListener("waiting", () => button.classList.add("is-loading"));
    video.addEventListener("canplay", () => button.classList.remove("is-loading"));
    video.addEventListener("pause", showButton);
    video.addEventListener("ended", showButton);
    button.addEventListener("click", () => {
      button.classList.add("is-loading");
      const playback = video.play();
      if (playback?.catch) playback.catch(showButton);
    });
    video.load();
  });
}

function renderUndressToolDialog() {
  if (!undressToolEnabled()) return;
  const body = undressToolBody();
  const title = document.querySelector("#videoToolDialogTitle");
  const kicker = document.querySelector("#videoToolDialogKicker");
  if (!body) return;
  if (title) title.textContent = undressToolText("title");
  if (kicker) kicker.textContent = undressToolText("create");
  const file = undressToolState.file;
  const submitPanel = body.closest(".undress-tool-submit-panel");
  // The Undress tenant now runs entirely in the home workspace. Keep the
  // legacy inline panel mounted for polling/analytics compatibility, but never
  // expose it below the cases; the home state is the only visible surface.
  if (submitPanel) submitPanel.hidden = true;
  const mediaPreview = file
    ? undressToolState.mediaKind === "video"
      ? `<video class="video-tool-upload-preview" src="${undressToolEscape(undressToolState.objectUrl)}" muted playsinline preload="metadata"></video>`
      : `<img class="video-tool-upload-preview" src="${undressToolEscape(undressToolState.objectUrl)}" alt="" />`
    : "";
  const estimate = undressToolState.estimate;
  const expectedMediaKind = undressToolExpectedMediaKind();
  const typeOptions = [
    ["image", "imageOnly", "image"],
    ["image_video", "imageVideo", "clapperboard"],
    ["video", "videoOnly", "video"],
  ];
  let priceText = file
    ? (state.user ? undressToolText("estimating") : undressToolText("signIn"))
    : "";
  if (estimate) {
    if (undressToolState.generationType === "image") {
      priceText = estimate.freeImageAvailable
        ? undressToolText("firstFree", { credits: undressToolCredits(estimate.unlockCredits) })
        : undressToolText("imagePrice", { credits: undressToolCredits(estimate.chargeCredits) });
    } else {
      priceText = undressToolText("videoPrice", {
        seconds: Number(estimate.pricing?.durationSeconds || undressToolState.durationSeconds || 0).toFixed(2).replace(/\.00$/, ""),
        segments: estimate.pricing?.segmentCount || 1,
        credits: undressToolCredits(estimate.chargeCredits),
      });
    }
  }
  if (!file && !body.classList.contains("is-result")) {
    body.innerHTML = "";
    return;
  }
  body.innerHTML = `
    ${mediaPreview ? `<div class="undress-inline-upload-preview">${mediaPreview}</div>` : ""}
    <div class="undress-inline-status" data-undress-inline-status>
      <strong>${undressToolEscape(undressToolState.submitting ? undressToolText("uploading") : undressToolState.estimating ? undressToolText("estimating") : undressToolText("submitted"))}</strong>
      <span>${undressToolState.submitting && undressToolState.uploadProgress < 100 ? `${undressToolState.uploadProgress}%` : undressToolEscape(undressToolState.estimating ? "" : priceText)}</span>
    </div>
    ${file ? `<div class="undress-tool-price-note">${undressToolEscape(undressToolState.estimating ? undressToolText("estimating") : priceText)}</div>` : ""}
    ${undressToolState.message ? `<div class="job-note">${undressToolEscape(undressToolState.message)}</div>` : ""}
  `;
  if (typeof refreshIcons === "function") refreshIcons();
}

let undressAmbientLoadScheduled = false;

function undressAmbientCanPlay(active = state.tab === DEFAULT_PLATFORM_TAB) {
  return Boolean(
    active
    && isTenantTool("undress")
    && !window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches
    && !navigator.connection?.saveData
  );
}

function syncUndressAmbientVideo(active = state.tab === DEFAULT_PLATFORM_TAB) {
  const ambient = document.querySelector("#undressAmbient");
  const video = document.querySelector("#undressAmbientVideo");
  if (!video) return;
  if (!undressAmbientCanPlay(active)) {
    video.pause();
    ambient?.classList.remove("is-playing");
    return;
  }
  if (video.dataset.loaded === "true") {
    video.play().catch(() => {});
    return;
  }
  if (undressAmbientLoadScheduled) return;
  undressAmbientLoadScheduled = true;
  const hydrate = () => {
    undressAmbientLoadScheduled = false;
    if (!undressAmbientCanPlay(state.tab === DEFAULT_PLATFORM_TAB) || video.dataset.loaded === "true") return;
    video.querySelectorAll("source[data-src]").forEach((source) => {
      source.src = source.dataset.src || "";
    });
    video.dataset.loaded = "true";
    video.load();
    video.play().catch(() => {});
  };
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(hydrate, { timeout: 800 });
  } else {
    window.setTimeout(hydrate, 250);
  }
}

function readUndressVideoDuration(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const duration = Number(video.duration || 0);
      URL.revokeObjectURL(url);
      duration > 0 ? resolve(duration) : reject(new Error(undressToolText("readFailed")));
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(undressToolText("readFailed")));
    };
    video.src = url;
  });
}

async function estimateUndressTool() {
  if (!state.user || !undressToolState.generationType || !undressToolState.mediaKind) return;
  undressToolState.estimating = true;
  undressToolState.estimate = null;
  renderUndressToolDialog();
  try {
    undressToolState.estimate = await requestJson("/api/undress-tool/estimate", {
      method: "POST",
      body: {
        generationType: undressToolState.generationType,
        mediaKind: undressToolState.mediaKind,
        durationSeconds: undressToolState.durationSeconds,
      },
    });
  } catch (error) {
    undressToolState.message = error.message || String(error);
  } finally {
    undressToolState.estimating = false;
    renderUndressToolDialog();
  }
}

function handleUndressToolType(event) {
  const generationType = String(event.currentTarget.dataset.undressToolType || "");
  if (!["image", "image_video", "video"].includes(generationType) || generationType === undressToolState.generationType) return;
  resetUndressToolFile();
  undressToolState.generationType = generationType;
  renderUndressToolDialog();
}

async function handleUndressToolFile(event) {
  const file = event.currentTarget.files?.[0] || null;
  if (!file) return;
  const mediaKind = undressToolFileKind(file);
  const expectedMediaKind = undressToolExpectedMediaKind();
  if (mediaKind !== expectedMediaKind) {
    resetUndressToolFile();
    undressToolState.message = undressToolText(expectedMediaKind === "video" ? "videoRequired" : "imageRequired");
    renderUndressToolDialog();
    return;
  }
  if (undressToolState.objectUrl) URL.revokeObjectURL(undressToolState.objectUrl);
  undressToolState.file = file;
  undressToolState.objectUrl = URL.createObjectURL(file);
  undressToolState.mediaKind = mediaKind;
  undressToolState.durationSeconds = 0;
  undressToolState.estimate = null;
  undressToolState.message = "";
  renderUndressToolDialog();
  if (undressToolState.mediaKind === "video") {
    try {
      undressToolState.durationSeconds = await readUndressVideoDuration(file);
    } catch (error) {
      undressToolState.message = error.message || String(error);
      renderUndressToolDialog();
      return;
    }
  }
  await estimateUndressTool();
  renderUndressToolHomeState();
  // Selecting a valid file starts the generation flow immediately. The home
  // page remains in place and switches the case media to the upload/progress
  // state; there is no second-step Generate button.
  if (undressToolCanSubmit()) await submitUndressTool();
}

async function uploadUndressToolFile(file) {
  const uploadId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  const chunkCount = Math.max(1, Math.ceil(file.size / UNDRESS_TOOL_UPLOAD_CHUNK_BYTES));
  let asset = null;
  for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
    const chunk = file.slice(
      chunkIndex * UNDRESS_TOOL_UPLOAD_CHUNK_BYTES,
      Math.min(file.size, (chunkIndex + 1) * UNDRESS_TOOL_UPLOAD_CHUNK_BYTES),
    );
    const response = await fetch("/api/undress-tool/upload", {
      method: "POST",
      headers: {
        authorization: `Bearer ${state.token}`,
        "content-type": undressToolFileMime(file),
        "x-file-name": encodeURIComponent(file.name || (undressToolState.mediaKind === "video" ? "source.mp4" : "source.jpg")),
        "x-file-size": String(file.size),
        "x-upload-id": uploadId,
        "x-chunk-index": String(chunkIndex),
        "x-chunk-count": String(chunkCount),
        ...(undressToolState.mediaKind === "video" ? { "x-duration-seconds": String(undressToolState.durationSeconds || 0) } : {}),
      },
      body: chunk,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || `Upload failed (${response.status}).`);
    asset = payload.asset || asset;
    undressToolState.uploadProgress = Math.round(((chunkIndex + 1) / chunkCount) * 100);
    renderUndressToolDialog();
    renderUndressToolHomeState();
  }
  if (!asset?.id) throw new Error("Upload failed.");
  return asset;
}

async function submitUndressTool() {
  if (!undressToolCanSubmit()) return;
  if (!state.user) {
    undressToolState.reopenAfterLogin = true;
    undressToolDialog()?.close("login");
    openLogin();
    return;
  }
  undressToolState.submitting = true;
  undressToolState.uploadProgress = 0;
  undressToolState.message = "";
  renderUndressToolDialog();
  renderUndressToolHomeState();
  try {
    const asset = await uploadUndressToolFile(undressToolState.file);
    const payload = await requestJson("/api/undress-tool/generate", {
      method: "POST",
      body: { assetId: asset.id, generationType: undressToolState.generationType },
    });
    if (payload.user) setUser(payload.user);
    const record = payload.record || {
      taskId: payload.taskId,
      status: "queued",
      source: undressToolState.generationType === "video" ? "undress-tool-video" : undressToolState.generationType === "image_video" ? "undress-tool-image-video" : "undress-tool-image",
      kind: undressToolState.generationType === "video" ? "video-tool-undress-video" : undressToolState.generationType === "image_video" ? "video-tool-undress-image-video" : "image-tool-undress",
      createdAt: new Date().toISOString(),
    };
    showUndressInlineResult(record);
  } catch (error) {
    undressToolState.message = error.message || String(error);
    undressToolState.submitting = false;
    renderUndressToolDialog();
    if ((error.statusCode === 402 || error.code === "INSUFFICIENT_CREDITS") && typeof showUndressInsufficientCreditsDialog === "function") {
      await showUndressInsufficientCreditsDialog(error);
    }
  }
}

function showUndressInlineResult(record = {}) {
  // The shared history path remains available for analytics and fallback: showPlayfluxSubmittedHistory.
  const body = undressToolBody();
  // The upload has completed and the task is now owned by the async generator.
  // Keep the file on the page, but let the home progress state reflect queued/running
  // generation instead of remaining stuck on the upload phase.
  undressToolState.submitting = false;
  undressToolState.uploadProgress = 100;
  undressToolState.homeRecord = record;
  undressToolState.homeResultUrl = "";
  undressToolState.homeResultKind = "";
  renderUndressToolHomeState();
  if (!body) return;
  const status = body.querySelector("[data-undress-inline-status]");
  if (status) {
    status.hidden = false;
    status.innerHTML = `<strong>${undressToolEscape(undressToolText("submitted"))}</strong><span>${undressToolEscape(record.taskId || "")}</span>`;
  }
  body.classList.add("is-result");
  const result = document.createElement("div");
  result.className = "undress-inline-result";
  result.innerHTML = `<div class="undress-result-placeholder"><i data-lucide="loader-circle"></i><span>${undressToolEscape(undressToolText("generating"))}</span></div><button type="button" class="undress-inline-back" data-undress-inline-back><i data-lucide="arrow-left"></i>${undressToolEscape(undressToolText("backToSubmit"))}</button>`;
  body.appendChild(result);
  result.querySelector("[data-undress-inline-back]")?.addEventListener("click", () => {
    body.classList.remove("is-result");
    result.remove();
    renderUndressToolDialog();
  });
  if (typeof refreshIcons === "function") refreshIcons();
  if (record.taskId && typeof scheduleHistoryRefresh === "function") scheduleHistoryRefresh({ delayMs: 1200, force: true });
  watchUndressInlineResult(record.taskId, result);
}

async function watchUndressInlineResult(taskId, root) {
  if (!taskId || !root || typeof requestJson !== "function") return;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    await new Promise((resolve) => window.setTimeout(resolve, attempt ? 2500 : 900));
    if (!root.isConnected) return;
    try {
      const payload = await requestJson(`/api/generation-records/${encodeURIComponent(taskId)}`);
      const record = payload.record || payload;
      const videoUrl = typeof generationVideoUrl === "function" ? generationVideoUrl(record) : "";
      const imageUrl = typeof generationImageResultUrl === "function" ? generationImageResultUrl(record) : "";
      undressToolState.homeRecord = record;
      if (videoUrl || imageUrl) {
        undressToolState.homeResultUrl = videoUrl || imageUrl;
        undressToolState.homeResultKind = videoUrl ? "video" : "image";
        renderUndressToolHomeState();
      } else {
        renderUndressToolHomeState();
      }
      if (videoUrl || imageUrl) {
        root.innerHTML = `${videoUrl ? `<video src="${undressToolEscape(videoUrl)}" controls playsinline preload="metadata"></video>` : `<img src="${undressToolEscape(imageUrl)}" alt="" />`}<button type="button" class="undress-inline-back" data-undress-inline-back><i data-lucide="arrow-left"></i>${undressToolEscape(undressToolText("backToSubmit"))}</button>`;
        root.querySelector("[data-undress-inline-back]")?.addEventListener("click", () => { root.parentElement?.classList.remove("is-result"); root.remove(); renderUndressToolDialog(); });
        if (typeof refreshIcons === "function") refreshIcons();
        return;
      }
      if (["failed", "error", "cancelled"].includes(String(record.status || "").toLowerCase())) {
        undressToolState.message = record.error || record.status;
        renderUndressToolHomeState();
        root.querySelector(".undress-result-placeholder span")?.replaceChildren(document.createTextNode(record.error || record.status));
        root.querySelector(".undress-result-placeholder svg")?.remove();
        return;
      }
    } catch (error) {
      // History refresh remains the fallback if a detail request is temporarily unavailable.
    }
  }
}

function undressToolHomeProgress(record = {}) {
  if (undressToolState.submitting) return Math.max(2, Math.min(100, Number(undressToolState.uploadProgress || 0)));
  const explicit = Number(record.progress ?? record.progressPercent ?? record.percent);
  if (Number.isFinite(explicit) && explicit > 0) return Math.max(2, Math.min(99, Math.round(explicit)));
  const status = String(record.status || "").toLowerCase();
  if (["succeeded", "success", "completed", "done"].includes(status)) return 100;
  if (["running", "processing", "generating"].includes(status)) return 62;
  if (["submitted", "queued", "pending"].includes(status)) return 18;
  return 8;
}

function renderUndressToolHomeState() {
  const workspace = document.querySelector('[data-panel="gallery"]');
  const stage = workspace?.querySelector("[data-undress-case-stage]");
  const uploadButton = workspace?.querySelector("[data-undress-tool-upload]");
  if (!workspace || !stage) return;
  const record = undressToolState.homeRecord;
  const file = undressToolState.file;
  if (!file && !record) {
    stage.innerHTML = undressToolCaseHtml(undressToolState.generationType);
    bindUndressToolExampleVideos(stage);
    if (uploadButton) uploadButton.hidden = false;
    const guide = workspace.querySelector("[data-undress-home-guide]");
    if (guide) guide.textContent = undressToolHomeGuide();
    if (typeof refreshIcons === "function") refreshIcons();
    return;
  }
  if (uploadButton) uploadButton.hidden = true;
  const mediaUrl = undressToolState.homeResultUrl || undressToolState.objectUrl;
  const mediaKind = undressToolState.homeResultKind || undressToolState.mediaKind;
  const progress = undressToolHomeProgress(record || {});
  const failed = ["failed", "error", "cancelled"].includes(String(record?.status || "").toLowerCase());
  const active = Boolean(record && !undressToolState.homeResultUrl && !failed);
  const media = mediaUrl
    ? mediaKind === "video"
      ? `<video class="undress-home-media" src="${undressToolEscape(mediaUrl)}" ${active ? "muted autoplay loop" : "controls"} playsinline preload="metadata"></video>`
      : `<img class="undress-home-media" src="${undressToolEscape(mediaUrl)}" alt="" />`
    : `<div class="undress-home-media undress-home-media-empty"><i data-lucide="image"></i></div>`;
  const statusText = undressToolState.homeResultUrl
    ? undressToolText("submitted")
    : failed
      ? (undressToolState.message || undressToolText("generating"))
      : undressToolState.submitting
        ? undressToolText("uploading")
        : record
          ? undressToolText("generating")
          : undressToolText("generate");
  const hint = undressToolState.estimate
    ? undressToolState.generationType === "image"
      ? (undressToolState.estimate.freeImageAvailable
        ? undressToolText("firstFree", { credits: undressToolCredits(undressToolState.estimate.unlockCredits) })
        : undressToolText("imagePrice", { credits: undressToolCredits(undressToolState.estimate.chargeCredits) }))
      : undressToolText("videoPrice", {
        seconds: Number(undressToolState.estimate.pricing?.durationSeconds || undressToolState.durationSeconds || 0).toFixed(2).replace(/\.00$/, ""),
        segments: undressToolState.estimate.pricing?.segmentCount || 1,
        credits: undressToolCredits(undressToolState.estimate.chargeCredits),
      })
    : undressToolText("signIn");
  stage.innerHTML = `
    <div class="undress-home-submit" data-undress-home-submit>
      <div class="undress-home-media-wrap">
        ${media}
        ${active || undressToolState.submitting ? `<div class="undress-home-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}"><span style="width:${progress}%"></span><strong>${undressToolEscape(statusText)}</strong></div>` : ""}
      </div>
      <p class="undress-home-hint">${undressToolEscape(hint)}</p>
      ${failed || undressToolState.homeResultUrl ? `<button class="undress-home-reset" type="button" data-undress-home-reset>${undressToolEscape(undressToolText("backToSubmit"))}</button>` : ""}
    </div>
  `;
  stage.querySelector("[data-undress-home-reset]")?.addEventListener("click", () => {
    resetUndressToolFile();
    renderUndressToolHomeState();
  });
  if (typeof refreshIcons === "function") refreshIcons();
}

function openUndressToolDialog({ reset = false } = {}) {
  if (!undressToolEnabled()) return;
  if (reset) resetUndressToolFile();
  if (typeof prepareModalOpen === "function") prepareModalOpen();
  renderUndressToolDialog();
  const dialog = undressToolDialog();
  if (dialog && !dialog.open) dialog.showModal();
}

function renderUndressToolHome() {
  if (!undressToolEnabled() || document.querySelector(".undress-tool-home")) return;
  const workspace = document.querySelector('[data-panel="gallery"]');
  if (!workspace) return;
  workspace.innerHTML = `
    <section class="undress-tool-home">
      <div class="undress-ambient" id="undressAmbient" aria-hidden="true">
        <video id="undressAmbientVideo" muted loop playsinline preload="none" poster="https://media.123vips.com/assets/home/ambient/home-ambient-poster.webp" tabindex="-1">
          <source data-src="https://media.123vips.com/assets/home/ambient/home-ambient-desktop.webm" type="video/webm" media="(min-width: 721px)">
          <source data-src="https://media.123vips.com/assets/home/ambient/home-ambient-desktop.mp4" type="video/mp4" media="(min-width: 721px)">
          <source data-src="https://media.123vips.com/assets/home/ambient/home-ambient-mobile.webm" type="video/webm">
          <source data-src="https://media.123vips.com/assets/home/ambient/home-ambient-mobile.mp4" type="video/mp4">
        </video>
      </div>
      <div class="undress-tool-home-inner">
        <div class="undress-tool-copy" aria-hidden="true">
          <h2>${undressToolEscape(undressToolText("title"))}</h2>
          <p>${undressToolEscape(undressToolText("subtitle"))}</p>
        </div>
        <nav class="undress-case-tabs" role="tablist">
          <button class="undress-case-tab is-active" type="button" role="tab" aria-selected="true" data-undress-case="image">${undressToolEscape(undressToolText("imageOnly"))}</button>
          <button class="undress-case-tab" type="button" role="tab" aria-selected="false" data-undress-case="image_video">${undressToolEscape(undressToolText("imageVideo"))}</button>
          <button class="undress-case-tab" type="button" role="tab" aria-selected="false" data-undress-case="video">${undressToolEscape(undressToolText("videoOnly"))}</button>
        </nav>
        <div class="undress-case-stage" data-undress-case-stage>${undressToolCaseHtml("image")}</div>
        <button class="undress-tool-upload-button" type="button" data-undress-tool-upload><i data-lucide="upload"></i>${undressToolEscape(undressToolText("upload"))}</button>
        <p class="undress-home-guide" data-undress-home-guide>${undressToolEscape(undressToolHomeGuide("image"))}</p>
        <input class="undress-tool-home-input" type="file" accept="${undressToolAccept()}" data-undress-home-input tabindex="-1" aria-hidden="true" />
        <div class="undress-tool-submit-panel" hidden><div class="undress-tool-inline-body"></div></div>
      </div>
    </section>
  `;
  const homeInput = workspace.querySelector("[data-undress-home-input]");
  const uploadButton = workspace.querySelector("[data-undress-tool-upload]");
  uploadButton?.addEventListener("click", () => {
    resetUndressToolFile();
    renderUndressToolDialog();
    homeInput?.click();
  });
  homeInput?.addEventListener("change", handleUndressToolFile);
  document.querySelectorAll(".undress-case-tabs [data-undress-case]").forEach((button) => button.addEventListener("click", () => {
    const type = button.dataset.undressCase;
    if (!type || type === undressToolState.generationType) return;
    undressToolState.generationType = type;
    resetUndressToolFile();
    document.querySelectorAll(".undress-case-tabs [data-undress-case]").forEach((item) => { item.classList.toggle("is-active", item.dataset.undressCase === type); item.setAttribute("aria-selected", item.dataset.undressCase === type ? "true" : "false"); });
    if (homeInput) homeInput.accept = undressToolAccept();
    const stage = workspace.querySelector("[data-undress-case-stage]");
    if (stage) { stage.innerHTML = undressToolCaseHtml(type); bindUndressToolExampleVideos(stage); }
    const guide = workspace.querySelector("[data-undress-home-guide]");
    if (guide) guide.textContent = undressToolHomeGuide(type);
    renderUndressToolHomeState();
    renderUndressToolDialog();
  }));
  bindUndressToolExampleVideos(workspace);
  renderUndressToolDialog();
  const galleryTab = document.querySelector('[data-tab="gallery"]');
  const galleryLabel = galleryTab?.querySelector("span");
  if (galleryLabel) {
    galleryLabel.removeAttribute("data-i18n");
    galleryLabel.textContent = undressToolText("create");
  }
  if (typeof refreshIcons === "function") refreshIcons();
}

function initializeUndressTool() {
  if (!undressToolEnabled() || undressToolState.initialized) return;
  undressToolState.initialized = true;
  renderUndressToolHome();
  undressToolState.lastUserId = state.user?.id || "";
  window.setInterval(() => {
    if (!undressToolEnabled()) return;
    renderUndressToolHome();
    const nextUserId = state.user?.id || "";
    if (nextUserId !== undressToolState.lastUserId) {
      undressToolState.lastUserId = nextUserId;
      if (nextUserId && undressToolState.reopenAfterLogin) {
        undressToolState.reopenAfterLogin = false;
        renderUndressToolDialog();
        estimateUndressTool().then(() => {
          if (undressToolCanSubmit()) submitUndressTool();
        });
      }
    }
    if (!undressToolState.autoOpened && state.config && document.body.classList.contains("age-gate-accepted")) {
      undressToolState.autoOpened = true;
    }
  }, 300);
}

initializeUndressTool();
