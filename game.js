const AGE_GATE_ACCEPTED_KEY = "raisingGameAgeGateAccepted";

const state = {
  token: localStorage.getItem("raisingGameToken") || "",
  user: null,
  config: null,
  characters: [],
  characterIndex: 0,
  videoIndex: 0,
  unlocks: [],
  startX: 0,
  startY: 0,
  tracking: false,
  busyAction: "",
};

const els = {
  stage: document.querySelector("#feedStage"),
  video: document.querySelector("#feedVideo"),
  poster: document.querySelector("#feedPoster"),
  creditCount: document.querySelector("#creditCount"),
  characterName: document.querySelector("#characterName"),
  characterMeta: document.querySelector("#characterMeta"),
  tagRow: document.querySelector("#tagRow"),
  videoIndex: document.querySelector("#videoIndex"),
  playBtn: document.querySelector("#playBtn"),
  unlockBtn: document.querySelector("#unlockBtn"),
  undressBtn: document.querySelector("#undressBtn"),
  replaceBtn: document.querySelector("#replaceBtn"),
  extendBtn: document.querySelector("#extendBtn"),
  toast: document.querySelector("#toast"),
  confirmDialog: document.querySelector("#confirmDialog"),
  confirmTitle: document.querySelector("#confirmTitle"),
  confirmText: document.querySelector("#confirmText"),
  confirmActionBtn: document.querySelector("#confirmActionBtn"),
  actionDialog: document.querySelector("#actionDialog"),
  actionTitle: document.querySelector("#actionTitle"),
  actionBody: document.querySelector("#actionBody"),
  actionSubmitBtn: document.querySelector("#actionSubmitBtn"),
  loginDialog: document.querySelector("#loginDialog"),
  loginUsername: document.querySelector("#loginUsername"),
  loginPassword: document.querySelector("#loginPassword"),
  loginStatus: document.querySelector("#loginStatus"),
  loginSubmitBtn: document.querySelector("#loginSubmitBtn"),
  loginRegisterBtn: document.querySelector("#loginRegisterBtn"),
  ageGate: document.querySelector("#ageGate"),
  ageForbidden: document.querySelector("#ageForbidden"),
  ageConfirmBtn: document.querySelector("#ageConfirmBtn"),
  ageDeclineBtn: document.querySelector("#ageDeclineBtn"),
};

function authHeaders() {
  return state.token ? { authorization: `Bearer ${state.token}` } : {};
}

async function requestJson(url, options = {}) {
  const { auth = true, headers, body, ...rest } = options;
  const response = await fetch(url, {
    ...rest,
    headers: {
      "content-type": "application/json",
      ...(auth ? authHeaders() : {}),
      ...(headers || {}),
    },
    body: body && typeof body !== "string" ? JSON.stringify(body) : body,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    const error = new Error(payload.message || payload.detail || `Request failed: ${response.status}`);
    error.status = response.status;
    error.code = payload.code || "";
    error.payload = payload;
    throw error;
  }
  return payload;
}

function showToast(message = "") {
  if (!els.toast) return;
  els.toast.textContent = message;
  els.toast.classList.add("is-visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => els.toast.classList.remove("is-visible"), 2600);
}

function refreshIcons() {
  if (window.lucide?.createIcons) window.lucide.createIcons();
}

function ensureAgeGate() {
  try {
    if (localStorage.getItem(AGE_GATE_ACCEPTED_KEY) === "1") {
      document.body.classList.add("age-gate-accepted");
      document.body.classList.remove("age-gate-denied", "age-gate-locked");
      return Promise.resolve(true);
    }
  } catch (error) {}
  if (!els.ageGate || !els.ageConfirmBtn || !els.ageDeclineBtn) return Promise.resolve(true);
  els.ageGate.hidden = false;
  if (els.ageForbidden) els.ageForbidden.hidden = true;
  return new Promise((resolve) => {
    const cleanup = () => {
      els.ageConfirmBtn.removeEventListener("click", onConfirm);
      els.ageDeclineBtn.removeEventListener("click", onDecline);
    };
    const onConfirm = () => {
      try {
        localStorage.setItem(AGE_GATE_ACCEPTED_KEY, "1");
      } catch (error) {}
      document.body.classList.add("age-gate-accepted");
      document.body.classList.remove("age-gate-denied", "age-gate-locked");
      els.ageGate.hidden = true;
      if (els.ageForbidden) els.ageForbidden.hidden = true;
      cleanup();
      resolve(true);
    };
    const onDecline = () => {
      document.body.classList.add("age-gate-denied");
      document.body.classList.remove("age-gate-accepted", "age-gate-locked");
      els.ageGate.hidden = true;
      if (els.ageForbidden) els.ageForbidden.hidden = false;
      cleanup();
      resolve(false);
    };
    els.ageConfirmBtn.addEventListener("click", onConfirm);
    els.ageDeclineBtn.addEventListener("click", onDecline);
  });
}

function mediaUrl(entry = {}) {
  return String(entry.videoUrl || entry.localVideoUrl || entry.remoteVideoUrl || "").trim();
}

function absoluteMediaUrl(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";
  try {
    return new URL(text, window.location.href).href;
  } catch {
    return text;
  }
}

function mediaDurationSeconds(entry = {}, fallback = 5) {
  const value = Number(entry?.durationSeconds || entry?.duration || entry?.videoDurationSeconds || fallback);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function posterUrl(entry = {}, character = {}) {
  return String(
    entry.posterUrl ||
    entry.coverUrl ||
    entry.thumbnailUrl ||
    character.posterUrl ||
    character.localImageUrl ||
    character.syntheticReferenceLocalUrl ||
    character.sourceImageUrl ||
    character.publicImageUrl ||
    "",
  ).trim();
}

function assetPreviewUrl(asset = {}) {
  return String(asset.previewUrl || asset.localUrl || asset.publicUrl || asset.url || "").trim();
}

function isSucceededStatus(status = "") {
  return ["succeeded", "success", "completed", "complete", "finished", "done"].includes(String(status || "").toLowerCase());
}

function isFailedStatus(status = "") {
  return ["failed", "error", "cancelled", "canceled", "rejected"].includes(String(status || "").toLowerCase());
}

function generationVideoUrl(record = {}) {
  return String(record.videoUrl || record.localVideoUrl || record.cdnVideoUrl || record.providerVideoUrl || record.remoteVideoUrl || "").trim();
}

function generationImageUrl(record = {}) {
  return String(record.imageResultUrl || record.localImageUrl || record.cdnImageUrl || record.providerImageUrl || record.remoteImageUrl || "").trim();
}

function videoEntries(character = {}) {
  const entries = [
    ...Object.entries(character.homeSceneVideos || {}),
    ...Object.entries(character.sceneVideos || {}),
    ...Object.entries(character.unlockVideos || {}),
  ];
  const seen = new Set();
  return entries
    .map(([key, entry], index) => ({ ...(entry || {}), key, index }))
    .filter((entry) => {
      const hasMedia = mediaUrl(entry) || posterUrl(entry, character) || entry.taskId;
      if (!hasMedia) return false;
      const dedupe = [entry.sceneId || "", entry.sceneEntryId || "default", mediaUrl(entry), entry.key].join("|");
      if (seen.has(dedupe)) return false;
      seen.add(dedupe);
      return true;
    });
}

function currentCharacter() {
  if (!state.characters.length) return null;
  state.characterIndex = (state.characterIndex + state.characters.length) % state.characters.length;
  return state.characters[state.characterIndex];
}

function currentVideos() {
  return videoEntries(currentCharacter() || {});
}

function currentVideo() {
  const videos = currentVideos();
  if (!videos.length) return null;
  state.videoIndex = (state.videoIndex + videos.length) % videos.length;
  return videos[state.videoIndex];
}

function isCurrentVideoLocked() {
  const video = currentVideo();
  if (!video) return false;
  return Boolean(video.locked) || !mediaUrl(video);
}

function renderVideoDots(videos = []) {
  els.videoIndex.innerHTML = videos
    .map((_, index) => `<span class="${index === state.videoIndex ? "is-active" : ""}"></span>`)
    .join("");
}

function renderCharacter() {
  const character = currentCharacter();
  const videos = currentVideos();
  const video = currentVideo();
  if (!character) {
    els.characterName.textContent = "No characters";
    els.characterMeta.textContent = "No mobile feed data yet";
    els.poster.hidden = true;
    els.video.hidden = true;
    return;
  }

  const name = character.name || character.title || "Character";
  const metaParts = [
    character.age ? `${character.age}` : "",
    character.style || character.gender || "",
    videos.length ? `${state.videoIndex + 1}/${videos.length}` : "0/0",
  ].filter(Boolean);
  els.characterName.textContent = name;
  els.characterMeta.textContent = metaParts.join(" · ") || "Swipe up/down for characters";
  els.tagRow.innerHTML = (Array.isArray(character.tags) ? character.tags : [])
    .slice(0, 5)
    .map((tag) => `<span>${escapeHtml(tag)}</span>`)
    .join("");
  renderVideoDots(videos);

  const cover = video ? posterUrl(video, character) : posterUrl({}, character);
  if (cover) {
    if (els.poster.src !== new URL(cover, window.location.href).href) els.poster.src = cover;
    els.poster.hidden = false;
  } else {
    els.poster.hidden = true;
  }

  const url = video ? mediaUrl(video) : "";
  if (url) {
    const nextSrc = new URL(url, window.location.href).href;
    if (els.video.src !== nextSrc) {
      if (cover) els.poster.hidden = false;
      els.video.src = url;
      els.video.load();
    }
    els.video.poster = cover || "";
    els.video.hidden = false;
    els.video.play().catch(() => {});
  } else {
    els.video.removeAttribute("src");
    els.video.hidden = true;
  }

  els.unlockBtn.hidden = !isCurrentVideoLocked();
  refreshIcons();
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function syncUser(user) {
  state.user = user || null;
  els.creditCount.textContent = Number(user?.credits || 0).toLocaleString("en-US");
}

async function submitLogin(mode = "login") {
  const username = els.loginUsername?.value.trim() || "";
  const password = els.loginPassword?.value || "";
  if (!username || !password) {
    if (els.loginStatus) els.loginStatus.textContent = "Enter username and password.";
    return;
  }
  const button = mode === "register" ? els.loginRegisterBtn : els.loginSubmitBtn;
  try {
    if (button) button.disabled = true;
    if (els.loginStatus) els.loginStatus.textContent = mode === "register" ? "Creating account..." : "Signing in...";
    const payload = await requestJson(mode === "register" ? "/api/auth/register" : "/api/auth/login", {
      method: "POST",
      auth: false,
      body: { username, password },
    });
    state.token = payload.token || "";
    if (state.token) localStorage.setItem("raisingGameToken", state.token);
    syncUser(payload.user || null);
    if (els.loginStatus) els.loginStatus.textContent = "Signed in";
    els.loginDialog?.close("confirm");
    await loadConfig();
  } catch (error) {
    if (els.loginStatus) els.loginStatus.textContent = error.message || "Sign in failed.";
  } finally {
    if (button) button.disabled = false;
  }
}

function openLoginDialog() {
  if (!els.loginDialog) return;
  if (els.loginStatus) els.loginStatus.textContent = "";
  els.loginDialog.showModal();
}

async function loadSession() {
  if (!state.token) {
    syncUser(null);
    return;
  }
  try {
    const payload = await requestJson("/api/auth/me");
    syncUser(payload.user || null);
    if (!payload.user) {
      localStorage.removeItem("raisingGameToken");
      state.token = "";
    }
  } catch {
    localStorage.removeItem("raisingGameToken");
    state.token = "";
    syncUser(null);
  }
}

async function loadConfig() {
  const payload = await requestJson("/api/game/feed", { auth: Boolean(state.token) });
  state.config = payload.config || null;
  const items = payload.items || state.config?.homeVideo?.items || [];
  state.characters = items.filter((item) => videoEntries(item).length || posterUrl({}, item));
  renderCharacter();
}

function requireLogin() {
  if (state.user) return true;
  openLoginDialog();
  return false;
}

function switchCharacter(direction) {
  if (state.characters.length <= 1) return;
  state.characterIndex = (state.characterIndex + direction + state.characters.length) % state.characters.length;
  state.videoIndex = 0;
  renderCharacter();
}

function switchVideo(direction) {
  const videos = currentVideos();
  if (videos.length <= 1) return;
  state.videoIndex = (state.videoIndex + direction + videos.length) % videos.length;
  renderCharacter();
}

function handlePointerDown(event) {
  if (event.target.closest("button, a, dialog")) return;
  state.tracking = true;
  state.startX = event.clientX;
  state.startY = event.clientY;
  els.stage.setPointerCapture?.(event.pointerId);
}

function handlePointerUp(event) {
  if (!state.tracking) return;
  state.tracking = false;
  els.stage.releasePointerCapture?.(event.pointerId);
  const dx = event.clientX - state.startX;
  const dy = event.clientY - state.startY;
  if (Math.abs(dx) > 52 && Math.abs(dx) > Math.abs(dy) * 1.15) {
    switchVideo(dx < 0 ? 1 : -1);
  } else if (Math.abs(dy) > 52 && Math.abs(dy) > Math.abs(dx) * 1.15) {
    switchCharacter(dy < 0 ? 1 : -1);
  }
}

function confirmAction({ title, text, confirmText = "Confirm" }) {
  if (!els.confirmDialog) return Promise.resolve(window.confirm(text));
  els.confirmTitle.textContent = title;
  els.confirmText.textContent = text;
  els.confirmActionBtn.textContent = confirmText;
  return new Promise((resolve) => {
    const onClose = () => {
      els.confirmDialog.removeEventListener("close", onClose);
      resolve(els.confirmDialog.returnValue === "confirm");
    };
    els.confirmDialog.addEventListener("close", onClose);
    els.confirmDialog.showModal();
  });
}

async function unlockCurrentVideo() {
  if (!requireLogin()) return;
  const character = currentCharacter();
  if (!character) return;
  const cost = Number(character.unlockCost || state.config?.homeVideo?.characterUnlockCost || 750);
  const ok = await confirmAction({
    title: "Unlock videos",
    text: `Unlock this character's locked videos for ${cost} credits?`,
    confirmText: "Unlock",
  });
  if (!ok) return;
  try {
    els.unlockBtn.disabled = true;
    const payload = await requestJson("/api/unlock-video", {
      method: "POST",
      body: { itemId: character.id },
    });
    if (payload.user) syncUser(payload.user);
    if (Array.isArray(payload.videos)) {
      const home = payload.videos[0] ? { [payload.videos[0].sceneId || "video-1"]: payload.videos[0] } : {};
      const locked = {};
      payload.videos.slice(1).forEach((video, index) => {
        locked[video.sceneId || `video-${index + 2}`] = video;
      });
      Object.assign(character, { homeSceneVideos: home, unlockVideos: locked, unlocked: true });
    }
    showToast(payload.charged ? "Unlocked" : "Already unlocked");
    renderCharacter();
  } catch (error) {
    showToast(error.message || "Unlock failed");
    if (error.status === 402) openTopupDialog(error.message || "Not enough credits.");
  } finally {
    els.unlockBtn.disabled = false;
  }
}

function openTopupDialog(message = "Not enough credits.") {
  showActionDialog({
    title: "Buy credits",
    submitText: "OK",
    body: `
      <p class="action-status">${escapeHtml(message)}</p>
      <p class="action-status">Your credits are not enough. Add credits before retrying.</p>
    `,
    onSubmit: async () => els.actionDialog?.close("confirm"),
  });
}

async function createAssetFromCurrent(kind = "image") {
  const character = currentCharacter();
  const video = currentVideo();
  if (!character) throw new Error("No character selected.");
  const body = { itemId: character.id };
  if (kind === "video") {
    if (!video) throw new Error("No video selected.");
    body.videoKey = video.key || "";
    body.sceneId = video.sceneId || "";
    body.sceneEntryId = video.sceneEntryId || "default";
    body.kind = "video";
  } else {
    body.kind = "image";
  }
  const payload = await requestJson("/api/game/assets/from-character-media", {
    method: "POST",
    body,
  });
  return payload.asset;
}

function actionPreviewMarkup({ image = "", video = "" } = {}) {
  if (video) return `<div class="action-preview"><video src="${escapeHtml(video)}" controls playsinline muted loop preload="metadata"></video></div>`;
  if (image) return `<div class="action-preview"><img src="${escapeHtml(image)}" alt="" /></div>`;
  return "";
}

function actionOptionsMarkup({ prompt = "", needImage = false, imageLabel = "Replacement image", imageHint = "Upload image", imageUrl = "", videoUrl = "", duration = 5, resolution = "720p" } = {}) {
  return `
    ${actionPreviewMarkup({ image: imageUrl, video: videoUrl })}
    ${needImage ? `
      <label class="action-upload">
        <input id="actionImageInput" type="file" accept="image/*" />
        <img id="actionImagePreview" alt="" hidden />
        <strong>${escapeHtml(imageLabel)}</strong>
        <span>${escapeHtml(imageHint)}</span>
      </label>
    ` : ""}
    <label class="action-field">
      <span>Prompt</span>
      <textarea id="actionPrompt">${escapeHtml(prompt)}</textarea>
    </label>
    <div class="action-grid">
      <label class="action-field">
        <span>Duration</span>
        <input id="actionDuration" type="number" min="5" max="15" value="${escapeHtml(duration)}" />
      </label>
      <label class="action-field">
        <span>Resolution</span>
        <select id="actionResolution">
          ${["480p", "720p", "1080p"].map((item) => `<option value="${item}" ${item === resolution ? "selected" : ""}>${item}</option>`).join("")}
        </select>
      </label>
    </div>
    <p class="action-status" id="actionStatus"></p>
    <div class="action-result" id="actionResult"></div>
  `;
}

function actionCostMarkup(cost = "") {
  return `
    <div class="action-cost">
      <strong>${escapeHtml(cost || "Checking...")}</strong>
    </div>
    <p class="action-status" id="actionStatus"></p>
    <div class="action-result" id="actionResult"></div>
  `;
}

function simpleVideoActionCost(duration = 5, { hasVideoInput = false, inputVideoSeconds = 0 } = {}) {
  const seconds = Math.max(5, Math.min(15, Number(duration || 5) || 5));
  const inputSeconds = Number(inputVideoSeconds || 0) > 0
    ? Number(inputVideoSeconds || 0)
    : (hasVideoInput ? seconds : 0);
  const pricing = state.config?.advancedPricing || {};
  const outputTable = pricing.seedanceCreditsPerSecondByResolution || {};
  const inputTable = pricing.seedanceVideoInputCreditsPerSecondByResolution || {};
  const outputRate = Number(outputTable["720p"] || 30);
  const inputRate = Number(inputTable["720p"] || 20);
  return Math.round((seconds * outputRate + inputSeconds * inputRate) * 10000) / 10000;
}

function simpleImageActionCost() {
  return Number(state.config?.assetImageModify?.costCredits || 16);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Failed to read file."));
    reader.readAsDataURL(file);
  });
}

function scaledCanvasSize(width = 0, height = 0, maxPixels = 2086876) {
  const w = Math.max(1, Number(width) || 1);
  const h = Math.max(1, Number(height) || 1);
  const pixels = w * h;
  if (pixels <= maxPixels) return { width: Math.round(w), height: Math.round(h) };
  const scale = Math.sqrt(maxPixels / pixels);
  return {
    width: Math.max(1, Math.floor(w * scale)),
    height: Math.max(1, Math.floor(h * scale)),
  };
}

async function captureLastFrameDataUrl(sourceUrl = "") {
  const absoluteUrl = absoluteMediaUrl(sourceUrl);
  if (!absoluteUrl) throw new Error("No source video selected.");
  let objectUrl = "";
  let videoSrc = absoluteUrl;
  try {
    if (new URL(absoluteUrl).origin !== window.location.origin) {
      const response = await fetch(absoluteUrl, { credentials: "same-origin" });
      if (!response.ok) throw new Error("Failed to load source video.");
      objectUrl = URL.createObjectURL(await response.blob());
      videoSrc = objectUrl;
    }
  } catch (error) {
    if (!objectUrl && videoSrc !== absoluteUrl) URL.revokeObjectURL(objectUrl);
    throw error;
  }
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  try {
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve;
      video.onerror = () => reject(new Error("Failed to read source video."));
      video.src = videoSrc;
      video.load?.();
    });
    const targetTime = Math.max(0, Number(video.duration || 0) - 0.08);
    await new Promise((resolve, reject) => {
      const timer = window.setTimeout(resolve, 1600);
      video.onseeked = () => {
        window.clearTimeout(timer);
        resolve();
      };
      video.onerror = () => {
        window.clearTimeout(timer);
        reject(new Error("Failed to read source video."));
      };
      video.currentTime = targetTime;
    });
    const size = scaledCanvasSize(video.videoWidth || 1, video.videoHeight || 1);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    canvas.getContext("2d").drawImage(video, 0, 0, size.width, size.height);
    return canvas.toDataURL("image/jpeg", 0.9);
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    video.removeAttribute("src");
    video.load?.();
  }
}

async function pollGeneration(taskId, root) {
  const status = root.querySelector("#actionStatus");
  const result = root.querySelector("#actionResult");
  for (let attempt = 0; attempt < 90; attempt += 1) {
    await new Promise((resolve) => window.setTimeout(resolve, attempt < 8 ? 1800 : 3500));
    const payload = await requestJson(`/api/generation-records/${encodeURIComponent(taskId)}?refresh=1`);
    if (payload.user) syncUser(payload.user);
    const record = payload.record || {};
    const stateLabel = record.status || "processing";
    if (status) status.textContent = `Status: ${stateLabel}`;
    const videoUrl = generationVideoUrl(record);
    const imageUrl = generationImageUrl(record);
    if (isSucceededStatus(record.status) && (videoUrl || imageUrl)) {
      if (result) {
        result.innerHTML = videoUrl
          ? `<video src="${escapeHtml(videoUrl)}" controls playsinline autoplay muted loop></video><a href="${escapeHtml(videoUrl)}" target="_blank" rel="noopener">Open result</a>`
          : `<img src="${escapeHtml(imageUrl)}" alt="" /><a href="${escapeHtml(imageUrl)}" target="_blank" rel="noopener">Open result</a>`;
      }
      if (status) status.textContent = "Done";
      return record;
    }
    if (isFailedStatus(record.status)) {
      throw new Error(record.error || "Generation failed.");
    }
  }
  throw new Error("Still processing. Check history later.");
}

async function showActionDialog({ title, body, submitText = "Generate", onOpen, onSubmit }) {
  if (!els.actionDialog) return;
  els.actionTitle.textContent = title;
  els.actionBody.innerHTML = body;
  els.actionSubmitBtn.textContent = submitText;
  els.actionSubmitBtn.disabled = false;
  refreshIcons();
  onOpen?.(els.actionBody);
  return new Promise((resolve) => {
    const onClose = () => {
      els.actionDialog.removeEventListener("close", onClose);
      els.actionSubmitBtn.removeEventListener("click", onSubmitClick);
      resolve(els.actionDialog.returnValue);
    };
    const onSubmitClick = async (event) => {
      event.preventDefault();
      try {
        els.actionSubmitBtn.disabled = true;
        await onSubmit?.(els.actionBody);
      } catch (error) {
        const status = els.actionBody.querySelector("#actionStatus");
        if (status) status.textContent = error.message || "Failed";
        showToast(error.message || "Failed");
      } finally {
        els.actionSubmitBtn.disabled = false;
      }
    };
    els.actionDialog.addEventListener("close", onClose);
    els.actionSubmitBtn.addEventListener("click", onSubmitClick);
    els.actionDialog.showModal();
  });
}

async function runGameAction(action) {
  if (!requireLogin()) return;
  const character = currentCharacter();
  const video = currentVideo();
  if (!character) return;
  if ((action === "replace" || action === "extend") && isCurrentVideoLocked()) {
    await unlockCurrentVideo();
    return;
  }
  try {
    state.busyAction = action;
    setActionBusy(true);
    if (action === "undress") {
      const sourceAsset = await createAssetFromCurrent("image");
      const cost = simpleImageActionCost();
      const options = state.config?.assetImageModify || {};
      await showActionDialog({
        title: "Undress",
        submitText: "Generate",
        body: actionCostMarkup(`${cost} credits`),
        onSubmit: async (root) => {
          const status = root.querySelector("#actionStatus");
          if (status) status.textContent = "Submitting...";
          const payload = await requestJson(`/api/user-assets/${encodeURIComponent(sourceAsset.id)}/modify`, {
            method: "POST",
            body: {
              prompt: "Remove clothes while preserving the same person, pose, face, body, lighting and background.",
              ratio: options.defaultRatio || "9:16",
              resolution: options.defaultResolution || "2K",
            },
          });
          if (payload.user) syncUser(payload.user);
          if (payload.record) {
            const imageUrl = generationImageUrl(payload.record);
            root.querySelector("#actionResult").innerHTML = imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="" />` : "";
          }
          if (status) status.textContent = payload.taskId ? `Done: ${payload.taskId}` : "Done";
        },
      });
    } else if (action === "replace") {
      const duration = 5;
      const inputVideoSeconds = mediaDurationSeconds(video, duration);
      const cost = simpleVideoActionCost(duration, { inputVideoSeconds });
      await showActionDialog({
        title: "Replace",
        submitText: "Generate",
        body: `
          <label class="action-upload">
            <input id="actionImageInput" type="file" accept="image/*" />
            <img id="actionImagePreview" alt="" hidden />
            <strong>Replacement image</strong>
            <span>Tap to upload</span>
          </label>
          ${actionCostMarkup(`${cost} credits`)}
        `,
        onOpen: (root) => {
          const input = root.querySelector("#actionImageInput");
          const preview = root.querySelector("#actionImagePreview");
          input?.addEventListener("change", async () => {
            const file = input.files?.[0];
            if (!file) return;
            preview.src = await fileToDataUrl(file);
            preview.hidden = false;
          });
        },
        onSubmit: async (root) => {
          const status = root.querySelector("#actionStatus");
          const file = root.querySelector("#actionImageInput")?.files?.[0];
          if (!file) throw new Error("Please upload replacement image.");
          if (status) status.textContent = "Uploading image...";
          const imageDataUrl = await fileToDataUrl(file);
          const imagePayload = await requestJson("/api/user-assets", {
            method: "POST",
            body: { dataUrl: imageDataUrl, name: file.name || "Replacement image", fileName: file.name || "replacement.png" },
          });
          if (status) status.textContent = "Submitting...";
          const payload = await requestJson("/api/advanced/generate", {
            method: "POST",
            body: {
              provider: "seedance",
              seedanceMode: "reference_video",
              prompt: "Replace the main person in [Video 1] with the person in [Image 1], preserving the original motion, camera, scene, and lighting.",
              referenceVideos: [{ url: absoluteMediaUrl(mediaUrl(video)), durationSeconds: inputVideoSeconds }],
              referenceImages: [{ assetId: imagePayload.asset?.id || "" }],
              inputVideoSeconds,
              referenceVideoDurationSeconds: inputVideoSeconds,
              ratio: "16:9",
              resolution: "720p",
              duration,
              params: { createKind: "video", createMode: "video-replace" },
            },
          });
          if (payload.user) syncUser(payload.user);
          if (status) status.textContent = `Submitted: ${payload.taskId || payload.task?.taskId || ""}`;
          const taskId = payload.taskId || payload.task?.taskId || payload.record?.taskId || "";
          if (!taskId) throw new Error("Generation task was not created.");
          await pollGeneration(taskId, root);
        },
      });
    } else if (action === "extend") {
      const duration = 5;
      const cost = simpleVideoActionCost(duration);
      await showActionDialog({
        title: "Extend",
        submitText: "Generate",
        body: `
          ${actionCostMarkup(`${cost} credits`)}
        `,
        onSubmit: async (root) => {
          const status = root.querySelector("#actionStatus");
          if (status) status.textContent = "Preparing video frame...";
          const frameDataUrl = await captureLastFrameDataUrl(mediaUrl(video));
          if (status) status.textContent = "Submitting...";
          const payload = await requestJson("/api/advanced/generate", {
            method: "POST",
            body: {
              provider: "seedance",
              seedanceMode: "first_frame",
              prompt: "Extend [Image 1] smoothly with the same subject, scene, motion, lighting and cinematic style.",
              firstFrameDataUrl: frameDataUrl,
              ratio: "16:9",
              resolution: "720p",
              duration,
              params: { createKind: "video", createMode: "video-extend" },
            },
          });
          if (payload.user) syncUser(payload.user);
          if (status) status.textContent = `Submitted: ${payload.taskId || payload.task?.taskId || ""}`;
          const taskId = payload.taskId || payload.task?.taskId || payload.record?.taskId || "";
          if (!taskId) throw new Error("Generation task was not created.");
          await pollGeneration(taskId, root);
        },
      });
    }
  } catch (error) {
    showToast(error.message || "Unable to generate");
  } finally {
    state.busyAction = "";
    setActionBusy(false);
  }
}

function setActionBusy(busy) {
  [els.undressBtn, els.replaceBtn, els.extendBtn].forEach((button) => {
    if (button) button.disabled = busy;
  });
}

function bindEvents() {
  els.stage.addEventListener("pointerdown", handlePointerDown);
  els.stage.addEventListener("pointerup", handlePointerUp);
  els.stage.addEventListener("pointercancel", handlePointerUp);
  els.playBtn.addEventListener("click", () => {
    if (isCurrentVideoLocked()) return unlockCurrentVideo();
    els.video.muted = false;
    els.video.play().catch(() => {});
  });
  els.unlockBtn.addEventListener("click", unlockCurrentVideo);
  els.undressBtn.addEventListener("click", () => runGameAction("undress"));
  els.replaceBtn.addEventListener("click", () => runGameAction("replace"));
  els.extendBtn.addEventListener("click", () => runGameAction("extend"));
  els.loginSubmitBtn?.addEventListener("click", () => submitLogin("login"));
  els.loginRegisterBtn?.addEventListener("click", () => submitLogin("register"));
  els.loginPassword?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") submitLogin("login");
  });
  els.video.addEventListener("loadeddata", () => {
    if (els.poster) els.poster.hidden = true;
  });
  els.video.addEventListener("error", () => {
    els.video.hidden = true;
    els.poster.hidden = false;
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") switchVideo(-1);
    else if (event.key === "ArrowRight") switchVideo(1);
    else if (event.key === "ArrowUp") switchCharacter(-1);
    else if (event.key === "ArrowDown") switchCharacter(1);
  });
}

async function init() {
  const allowed = await ensureAgeGate();
  if (!allowed) return;
  bindEvents();
  refreshIcons();
  await loadSession();
  await loadConfig();
}

init().catch((error) => {
  showToast(error.message || "Failed to load");
});
