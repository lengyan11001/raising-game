"use strict";

const VIDEO_TOOL_COPY = {
  en: {
    undress: "Undress",
    faceSwap: "Face Swap",
    image: "Image",
    video: "Video",
    uploadImage: "Upload image",
    uploadVideo: "Upload video",
    duration: "Duration",
    segments: "Segments",
    price: "Price",
    seconds: "sec",
    credits: "credits",
    generate: "Generate",
    estimating: "Calculating...",
    uploading: "Uploading...",
    submitting: "Submitting...",
    readFailed: "Unable to read this video.",
    estimateFailed: "Unable to calculate the price.",
  },
  zh: {
    undress: "脱衣",
    faceSwap: "换脸",
    image: "图片",
    video: "视频",
    uploadImage: "上传图片",
    uploadVideo: "上传视频",
    duration: "时长",
    segments: "分段",
    price: "价格",
    seconds: "秒",
    credits: "积分",
    generate: "生成",
    estimating: "计算中...",
    uploading: "上传中...",
    submitting: "提交中...",
    readFailed: "无法读取这个视频。",
    estimateFailed: "暂时无法计算价格。",
  },
  vi: {
    undress: "Cởi đồ",
    faceSwap: "Đổi mặt",
    image: "Hình ảnh",
    video: "Video",
    uploadImage: "Tải ảnh lên",
    uploadVideo: "Tải video lên",
    duration: "Thời lượng",
    segments: "Đoạn",
    price: "Giá",
    seconds: "giây",
    credits: "điểm",
    generate: "Tạo",
    estimating: "Đang tính...",
    uploading: "Đang tải lên...",
    submitting: "Đang gửi...",
    readFailed: "Không thể đọc video này.",
    estimateFailed: "Không thể tính giá.",
  },
  ja: {
    undress: "脱衣",
    faceSwap: "顔交換",
    image: "画像",
    video: "動画",
    uploadImage: "画像をアップロード",
    uploadVideo: "動画をアップロード",
    duration: "長さ",
    segments: "分割",
    price: "価格",
    seconds: "秒",
    credits: "クレジット",
    generate: "生成",
    estimating: "計算中...",
    uploading: "アップロード中...",
    submitting: "送信中...",
    readFailed: "動画を読み取れません。",
    estimateFailed: "価格を計算できません。",
  },
  ko: {
    undress: "탈의",
    faceSwap: "얼굴 교체",
    image: "이미지",
    video: "동영상",
    uploadImage: "이미지 업로드",
    uploadVideo: "동영상 업로드",
    duration: "길이",
    segments: "분할",
    price: "가격",
    seconds: "초",
    credits: "크레딧",
    generate: "생성",
    estimating: "계산 중...",
    uploading: "업로드 중...",
    submitting: "제출 중...",
    readFailed: "동영상을 읽을 수 없습니다.",
    estimateFailed: "가격을 계산할 수 없습니다.",
  },
  id: {
    undress: "Lepas pakaian",
    faceSwap: "Tukar wajah",
    image: "Gambar",
    video: "Video",
    uploadImage: "Unggah gambar",
    uploadVideo: "Unggah video",
    duration: "Durasi",
    segments: "Segmen",
    price: "Harga",
    seconds: "dtk",
    credits: "kredit",
    generate: "Buat",
    estimating: "Menghitung...",
    uploading: "Mengunggah...",
    submitting: "Mengirim...",
    readFailed: "Video tidak dapat dibaca.",
    estimateFailed: "Harga tidak dapat dihitung.",
  },
};

const videoToolUiState = {
  action: "",
  imageFile: null,
  videoFile: null,
  imageObjectUrl: "",
  videoObjectUrl: "",
  durationSeconds: 0,
  pricing: null,
  estimating: false,
  submitting: false,
  uploadKinds: new Set(),
  uploadProgress: new Map(),
  message: "",
};

const VIDEO_TOOL_UPLOAD_CHUNK_BYTES = 8 * 1024 * 1024;

function videoToolCopy() {
  return VIDEO_TOOL_COPY[state.lang] || VIDEO_TOOL_COPY.en;
}

function videoToolIsEnabled() {
  return document.body.classList.contains("tenant-tool-video") || (typeof isTenantTool === "function" && isTenantTool("video"));
}

function videoToolCredits(value) {
  return typeof formatCredits === "function" ? formatCredits(value || 0) : Number(value || 0).toFixed(2).replace(/\.00$/, "");
}

function videoToolEscape(value = "") {
  return typeof escapeHtml === "function"
    ? escapeHtml(value)
    : String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function revokeVideoToolObjectUrl(key) {
  const value = videoToolUiState[key];
  if (value) URL.revokeObjectURL(value);
  videoToolUiState[key] = "";
}

function resetVideoToolDialogState(action = "") {
  revokeVideoToolObjectUrl("imageObjectUrl");
  revokeVideoToolObjectUrl("videoObjectUrl");
  videoToolUiState.action = action;
  videoToolUiState.imageFile = null;
  videoToolUiState.videoFile = null;
  videoToolUiState.durationSeconds = 0;
  videoToolUiState.pricing = null;
  videoToolUiState.estimating = false;
  videoToolUiState.submitting = false;
  videoToolUiState.uploadKinds = new Set();
  videoToolUiState.uploadProgress = new Map();
  videoToolUiState.message = "";
}

function videoToolReadDuration(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const duration = Number(video.duration || 0);
      URL.revokeObjectURL(url);
      if (duration > 0) resolve(duration);
      else reject(new Error("Invalid video duration."));
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Unable to read video metadata."));
    };
    video.src = url;
  });
}

async function estimateVideoToolAction() {
  const action = videoToolUiState.action;
  if (!action || (action === "face-swap" && !videoToolUiState.durationSeconds)) return;
  videoToolUiState.estimating = true;
  videoToolUiState.pricing = null;
  videoToolUiState.message = "";
  renderVideoToolDialog();
  try {
    const payload = await requestJson("/api/video-tools/estimate", {
      method: "POST",
      body: { action, durationSeconds: videoToolUiState.durationSeconds || undefined },
    });
    videoToolUiState.pricing = payload.pricing || null;
  } catch (error) {
    videoToolUiState.message = error.message || videoToolCopy().estimateFailed;
  } finally {
    videoToolUiState.estimating = false;
    renderVideoToolDialog();
  }
}

function videoToolUploadCard(kind, file, objectUrl) {
  const copy = videoToolCopy();
  const isVideo = kind === "video";
  const uploading = videoToolUiState.uploadKinds.has(kind);
  const uploadProgress = Number(videoToolUiState.uploadProgress.get(kind) || 0);
  return `
    <label class="video-tool-upload ${file ? "has-file" : ""}" data-video-tool-slot="${kind}">
      <input type="file" accept="${isVideo ? "video/mp4,video/webm,video/quicktime,video/*" : "image/jpeg,image/png,image/webp,image/bmp,image/*"}" data-video-tool-input="${kind}" ${videoToolUiState.submitting ? "disabled" : ""} />
      <span class="video-tool-upload-placeholder">
        <i data-lucide="${isVideo ? "video" : "image-up"}"></i>
        <strong>${videoToolEscape(isVideo ? copy.uploadVideo : copy.uploadImage)}</strong>
      </span>
      ${file && objectUrl ? (isVideo
        ? `<video class="video-tool-upload-preview" src="${videoToolEscape(objectUrl)}" muted playsinline preload="metadata"></video>`
        : `<img class="video-tool-upload-preview" src="${videoToolEscape(objectUrl)}" alt="" />`) : ""}
      ${file ? `<span class="video-tool-upload-name" title="${videoToolEscape(file.name || "")}">${videoToolEscape(file.name || (isVideo ? copy.video : copy.image))}</span>` : ""}
      ${uploading ? `<span class="video-tool-upload-progress">${videoToolEscape(copy.uploading)} ${uploadProgress}%</span>` : ""}
    </label>
  `;
}

function videoToolCanSubmit() {
  const hasInputs = Boolean(videoToolUiState.imageFile)
    && (videoToolUiState.action !== "face-swap" || Boolean(videoToolUiState.videoFile && videoToolUiState.durationSeconds));
  return hasInputs && Boolean(videoToolUiState.pricing) && !videoToolUiState.estimating && !videoToolUiState.submitting;
}

function renderVideoToolDialog() {
  const dialog = document.querySelector("#videoToolDialog");
  const body = document.querySelector("#videoToolDialogBody");
  const title = document.querySelector("#videoToolDialogTitle");
  if (!dialog || !body || !videoToolUiState.action) return;
  const copy = videoToolCopy();
  const faceSwap = videoToolUiState.action === "face-swap";
  if (title) title.textContent = faceSwap ? copy.faceSwap : copy.undress;
  const duration = Number(videoToolUiState.pricing?.durationSeconds || videoToolUiState.durationSeconds || (faceSwap ? 0 : 5));
  const segmentCount = Number(videoToolUiState.pricing?.segmentCount || (faceSwap && duration ? Math.ceil(duration / 10) : 1));
  const price = videoToolUiState.pricing?.credits;
  body.innerHTML = `
    <div class="video-tool-form-grid ${faceSwap ? "" : "is-single"}">
      ${videoToolUploadCard("image", videoToolUiState.imageFile, videoToolUiState.imageObjectUrl)}
      ${faceSwap ? videoToolUploadCard("video", videoToolUiState.videoFile, videoToolUiState.videoObjectUrl) : ""}
    </div>
    <div class="video-tool-summary">
      <span>${videoToolEscape(copy.duration)}<strong>${duration ? `${duration.toFixed(duration >= 10 ? 1 : 2).replace(/\.0+$|(?<=\.\d)0+$/g, "")} ${videoToolEscape(copy.seconds)}` : "-"}</strong></span>
      <span>${videoToolEscape(copy.segments)}<strong>${segmentCount || "-"}</strong></span>
      <span>${videoToolEscape(copy.price)}<strong>${videoToolUiState.estimating ? videoToolEscape(copy.estimating) : price !== undefined ? `${videoToolCredits(price)} ${videoToolEscape(copy.credits)}` : "-"}</strong></span>
    </div>
    <div class="video-tool-submit-row">
      <p class="job-note" data-video-tool-status>${videoToolEscape(videoToolUiState.message)}</p>
      <button class="generate-btn" type="button" data-video-tool-submit ${videoToolCanSubmit() ? "" : "disabled"}>
        <i data-lucide="${videoToolUiState.submitting ? "loader-circle" : "sparkles"}"></i>
        ${videoToolEscape(videoToolUiState.submitting ? copy.submitting : copy.generate)}
      </button>
    </div>
  `;
  body.querySelectorAll("[data-video-tool-input]").forEach((input) => input.addEventListener("change", handleVideoToolFileChange));
  body.querySelector("[data-video-tool-submit]")?.addEventListener("click", submitVideoToolAction);
  if (typeof refreshIcons === "function") refreshIcons();
}

async function handleVideoToolFileChange(event) {
  const kind = event.currentTarget.dataset.videoToolInput;
  const file = event.currentTarget.files?.[0] || null;
  if (!file) return;
  videoToolUiState.message = "";
  if (kind === "image") {
    revokeVideoToolObjectUrl("imageObjectUrl");
    videoToolUiState.imageFile = file;
    videoToolUiState.imageObjectUrl = URL.createObjectURL(file);
  } else {
    revokeVideoToolObjectUrl("videoObjectUrl");
    videoToolUiState.videoFile = file;
    videoToolUiState.videoObjectUrl = URL.createObjectURL(file);
    videoToolUiState.durationSeconds = 0;
    videoToolUiState.pricing = null;
    renderVideoToolDialog();
    try {
      videoToolUiState.durationSeconds = await videoToolReadDuration(file);
      await estimateVideoToolAction();
      return;
    } catch (error) {
      videoToolUiState.message = videoToolCopy().readFailed;
    }
  }
  renderVideoToolDialog();
}

async function uploadVideoToolFile(kind, file) {
  videoToolUiState.uploadKinds.add(kind);
  videoToolUiState.uploadProgress.set(kind, 0);
  renderVideoToolDialog();
  try {
    const uploadId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    const extension = String(file.name || "").split(".").pop().toLowerCase();
    const inferredMime = {
      jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", bmp: "image/bmp",
      mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", m4v: "video/x-m4v",
    }[extension] || "";
    const mime = file.type || inferredMime || (kind === "video" ? "video/mp4" : "image/jpeg");
    const chunkCount = Math.max(1, Math.ceil(file.size / VIDEO_TOOL_UPLOAD_CHUNK_BYTES));
    let finalAsset = null;
    for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
      const chunk = file.slice(chunkIndex * VIDEO_TOOL_UPLOAD_CHUNK_BYTES, Math.min(file.size, (chunkIndex + 1) * VIDEO_TOOL_UPLOAD_CHUNK_BYTES));
      const response = await fetch("/api/video-tools/upload", {
        method: "POST",
        headers: {
          authorization: `Bearer ${state.token}`,
          "content-type": mime,
          "x-file-name": encodeURIComponent(file.name || (kind === "video" ? "source-video.mp4" : "source-image.jpg")),
          "x-file-size": String(file.size),
          "x-upload-id": uploadId,
          "x-chunk-index": String(chunkIndex),
          "x-chunk-count": String(chunkCount),
          ...(kind === "video" ? { "x-duration-seconds": String(videoToolUiState.durationSeconds || 0) } : {}),
        },
        body: chunk,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || `Upload failed (${response.status}).`);
      finalAsset = payload.asset || finalAsset;
      videoToolUiState.uploadProgress.set(kind, Math.round(((chunkIndex + 1) / chunkCount) * 100));
      renderVideoToolDialog();
    }
    if (!finalAsset?.id) throw new Error("Upload failed.");
    return finalAsset;
  } finally {
    videoToolUiState.uploadKinds.delete(kind);
    videoToolUiState.uploadProgress.delete(kind);
    renderVideoToolDialog();
  }
}

async function submitVideoToolAction() {
  if (!videoToolCanSubmit()) return;
  if (!state.user) {
    document.querySelector("#videoToolDialog")?.close("login");
    openLogin();
    return;
  }
  videoToolUiState.submitting = true;
  videoToolUiState.message = "";
  renderVideoToolDialog();
  try {
    const imageAsset = await uploadVideoToolFile("image", videoToolUiState.imageFile);
    const videoAsset = videoToolUiState.action === "face-swap"
      ? await uploadVideoToolFile("video", videoToolUiState.videoFile)
      : null;
    const payload = await requestJson("/api/video-tools/generate", {
      method: "POST",
      body: {
        action: videoToolUiState.action,
        imageAssetId: imageAsset.id,
        videoAssetId: videoAsset?.id || undefined,
      },
    });
    if (payload.user) setUser(payload.user);
    document.querySelector("#videoToolDialog")?.close("submitted");
    showPlayfluxSubmittedHistory(payload.record || {
      taskId: payload.taskId,
      status: "queued",
      source: `video-tool-${videoToolUiState.action}`,
      kind: `video-tool-${videoToolUiState.action}`,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    videoToolUiState.message = error.message || String(error);
    videoToolUiState.submitting = false;
    renderVideoToolDialog();
  }
}

function openVideoToolDialog(action) {
  resetVideoToolDialogState(action);
  if (typeof prepareModalOpen === "function") prepareModalOpen();
  renderVideoToolDialog();
  document.querySelector("#videoToolDialog")?.showModal();
  if (action === "undress") estimateVideoToolAction();
}

function renderVideoToolActions() {
  const root = document.querySelector("#videoToolFabs");
  if (!root) return;
  root.hidden = !videoToolIsEnabled();
  if (root.hidden) return;
  const copy = videoToolCopy();
  root.querySelector('[data-video-tool-label="undress"]')?.replaceChildren(copy.undress);
  root.querySelector('[data-video-tool-label="face-swap"]')?.replaceChildren(copy.faceSwap);
  if (document.querySelector("#videoToolDialog")?.open && videoToolUiState.action) renderVideoToolDialog();
}

function initializeVideoTools() {
  renderVideoToolActions();
  document.querySelectorAll("[data-video-tool-action]").forEach((button) => {
    button.addEventListener("click", () => openVideoToolDialog(button.dataset.videoToolAction || ""));
  });
  document.querySelector("#videoToolDialog")?.addEventListener("close", () => resetVideoToolDialogState(""));
}

initializeVideoTools();
