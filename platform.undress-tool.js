"use strict";

const UNDRESS_TOOL_UPLOAD_CHUNK_BYTES = 8 * 1024 * 1024;
const UNDRESS_TOOL_EXAMPLE_MEDIA = Object.freeze({
  image: Object.freeze({
    input: "/api/undress-tool/examples/image/input?v=image-20260819115156-587c60",
    result: "/api/undress-tool/examples/image/result?v=image-20260819115156-587c60",
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
    signIn: "Sign in to see your price.",
    readFailed: "Unable to read this video.",
    imageRequired: "Upload an image for this type.",
    videoRequired: "Upload a video for this type.",
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
    signIn: "\u767b\u5f55\u540e\u663e\u793a\u4ef7\u683c\u3002",
    readFailed: "\u65e0\u6cd5\u8bfb\u53d6\u8fd9\u4e2a\u89c6\u9891\u3002",
    imageRequired: "\u8fd9\u4e2a\u7c7b\u578b\u9700\u8981\u4e0a\u4f20\u56fe\u7247\u3002",
    videoRequired: "\u8fd9\u4e2a\u7c7b\u578b\u9700\u8981\u4e0a\u4f20\u89c6\u9891\u3002",
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

function undressToolExampleHtml() {
  const example = UNDRESS_TOOL_EXAMPLE_MEDIA[undressToolState.generationType];
  if (!example) return "";
  const inputMedia = example.inputType === "video"
    ? undressToolExampleVideoHtml(example.input)
    : `<img src="${undressToolEscape(example.input)}" alt="" loading="eager" />`;
  const resultMedia = example.resultType === "video"
    ? undressToolExampleVideoHtml(example.result)
    : `<img src="${undressToolEscape(example.result)}" alt="" loading="eager" />`;
  return `
    <div class="undress-tool-example-flow" aria-label="Example result">
      <div class="undress-tool-example-media">${inputMedia}</div>
      <span class="undress-tool-example-arrow" aria-hidden="true"><i data-lucide="arrow-right"></i></span>
      <div class="undress-tool-example-media">${resultMedia}</div>
    </div>
  `;
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
  const body = document.querySelector("#videoToolDialogBody");
  const title = document.querySelector("#videoToolDialogTitle");
  const kicker = document.querySelector("#videoToolDialogKicker");
  if (!body) return;
  if (title) title.textContent = undressToolText("title");
  if (kicker) kicker.textContent = undressToolText("create");
  const file = undressToolState.file;
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
  body.innerHTML = `
    <div class="undress-tool-type-switch" role="group">
      ${typeOptions.map(([value, label, icon]) => `
        <button class="undress-tool-type-option${undressToolState.generationType === value ? " is-active" : ""}" type="button" data-undress-tool-type="${value}">
          <i data-lucide="${icon}"></i><span>${undressToolEscape(undressToolText(label))}</span>
        </button>
      `).join("")}
    </div>
    ${undressToolExampleHtml()}
    <div class="video-tool-form-grid is-single">
      <label class="video-tool-upload">
        <input type="file" accept="${undressToolAccept()}" data-undress-tool-input />
        ${mediaPreview || `<span class="video-tool-upload-placeholder"><i data-lucide="upload"></i><span>${undressToolEscape(undressToolText(expectedMediaKind === "video" ? "uploadVideo" : "uploadImage"))}</span></span>`}
        ${file ? `<span class="undress-tool-kind">${undressToolEscape(undressToolText(undressToolState.generationType === "image_video" ? "imageVideo" : undressToolState.generationType === "video" ? "videoOnly" : "imageOnly"))}</span><span class="video-tool-upload-name">${undressToolEscape(file.name || "")}</span>` : ""}
        ${undressToolState.submitting && undressToolState.uploadProgress < 100 ? `<span class="video-tool-upload-progress">${undressToolEscape(undressToolText("uploading"))} ${undressToolState.uploadProgress}%</span>` : ""}
      </label>
    </div>
    ${file ? `<div class="undress-tool-price-note">${undressToolEscape(undressToolState.estimating ? undressToolText("estimating") : priceText)}</div>` : ""}
    <div class="video-tool-submit-row">
      <div class="job-note">${undressToolEscape(undressToolState.message)}</div>
      <button class="generate-btn" type="button" data-undress-tool-submit ${undressToolCanSubmit() ? "" : "disabled"}>
        <i data-lucide="${undressToolState.submitting ? "loader-circle" : "sparkles"}"></i>
        ${undressToolEscape(undressToolState.submitting ? undressToolText("submitting") : undressToolText("generate"))}
      </button>
    </div>
  `;
  body.querySelectorAll("[data-undress-tool-type]").forEach((button) => button.addEventListener("click", handleUndressToolType));
  body.querySelector("[data-undress-tool-input]")?.addEventListener("change", handleUndressToolFile);
  body.querySelector("[data-undress-tool-submit]")?.addEventListener("click", submitUndressTool);
  bindUndressToolExampleVideos(body);
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
  try {
    const asset = await uploadUndressToolFile(undressToolState.file);
    const payload = await requestJson("/api/undress-tool/generate", {
      method: "POST",
      body: { assetId: asset.id, generationType: undressToolState.generationType },
    });
    if (payload.user) setUser(payload.user);
    undressToolDialog()?.close("submitted");
    showPlayfluxSubmittedHistory(payload.record || {
      taskId: payload.taskId,
      status: "queued",
      source: undressToolState.generationType === "video" ? "undress-tool-video" : undressToolState.generationType === "image_video" ? "undress-tool-image-video" : "undress-tool-image",
      kind: undressToolState.generationType === "video" ? "video-tool-undress-video" : undressToolState.generationType === "image_video" ? "video-tool-undress-image-video" : "image-tool-undress",
      createdAt: new Date().toISOString(),
    });
    resetUndressToolFile();
  } catch (error) {
    undressToolState.message = error.message || String(error);
    undressToolState.submitting = false;
    renderUndressToolDialog();
    if ((error.statusCode === 402 || error.code === "INSUFFICIENT_CREDITS") && typeof showUndressInsufficientCreditsDialog === "function") {
      await showUndressInsufficientCreditsDialog(error);
    }
  }
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
        <span class="undress-tool-mark"><i data-lucide="sparkles"></i></span>
        <div class="undress-tool-copy">
          <h2>${undressToolEscape(undressToolText("title"))}</h2>
          <p>${undressToolEscape(undressToolText("subtitle"))}</p>
        </div>
        <button class="undress-tool-create" type="button" data-undress-tool-open><i data-lucide="upload"></i>${undressToolEscape(undressToolText("create"))}</button>
      </div>
    </section>
  `;
  workspace.querySelector("[data-undress-tool-open]")?.addEventListener("click", () => openUndressToolDialog({ reset: true }));
  const ambient = workspace.querySelector("#undressAmbient");
  const ambientVideo = workspace.querySelector("#undressAmbientVideo");
  ambientVideo?.addEventListener("playing", () => ambient?.classList.add("is-playing"));
  ambientVideo?.addEventListener("pause", () => ambient?.classList.remove("is-playing"));
  syncUndressAmbientVideo(state.tab === DEFAULT_PLATFORM_TAB);
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
        openUndressToolDialog();
        estimateUndressTool();
      }
    }
    if (!undressToolState.autoOpened && state.config && document.body.classList.contains("age-gate-accepted")) {
      undressToolState.autoOpened = true;
      openUndressToolDialog();
    }
  }, 300);
}

initializeUndressTool();
