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
  if (localStorage.getItem(AGE_GATE_ACCEPTED_KEY) === "1") return Promise.resolve(true);
  if (!els.ageGate || !els.ageConfirmBtn || !els.ageDeclineBtn) return Promise.resolve(true);
  els.ageGate.hidden = false;
  if (els.ageForbidden) els.ageForbidden.hidden = true;
  return new Promise((resolve) => {
    const cleanup = () => {
      els.ageConfirmBtn.removeEventListener("click", onConfirm);
      els.ageDeclineBtn.removeEventListener("click", onDecline);
    };
    const onConfirm = () => {
      localStorage.setItem(AGE_GATE_ACCEPTED_KEY, "1");
      els.ageGate.hidden = true;
      cleanup();
      resolve(true);
    };
    const onDecline = () => {
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
  const payload = await requestJson("/api/config/public");
  state.config = payload.config || null;
  const items = state.config?.homeVideo?.items || [];
  state.characters = items.filter((item) => videoEntries(item).length || posterUrl({}, item));
  renderCharacter();
}

function requireLogin() {
  if (state.user) return true;
  window.location.href = "./platform.html#account";
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
    if (error.status === 402) window.location.href = "./platform.html#account";
  } finally {
    els.unlockBtn.disabled = false;
  }
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

async function openCreateWithAsset(action) {
  if (!requireLogin()) return;
  try {
    state.busyAction = action;
    setActionBusy(true);
    if (action === "undress") {
      const asset = await createAssetFromCurrent("image");
      sessionStorage.setItem("vipeakGameCreateAction", JSON.stringify({
        action: "modify",
        assetId: asset.id,
        asset,
        prompt: "Remove clothes while preserving the same person, pose, face, body, lighting and background.",
      }));
    } else if (action === "replace") {
      const videoAsset = await createAssetFromCurrent("video");
      sessionStorage.setItem("vipeakGameCreateAction", JSON.stringify({ action: "replace", assetId: videoAsset.id, asset: videoAsset }));
    } else if (action === "extend") {
      const videoAsset = await createAssetFromCurrent("video");
      sessionStorage.setItem("vipeakGameCreateAction", JSON.stringify({ action: "extend", assetId: videoAsset.id, asset: videoAsset }));
    }
    window.location.href = "./platform.html#advanced";
  } catch (error) {
    showToast(error.message || "Unable to open Create");
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
  els.undressBtn.addEventListener("click", () => openCreateWithAsset("undress"));
  els.replaceBtn.addEventListener("click", () => openCreateWithAsset("replace"));
  els.extendBtn.addEventListener("click", () => openCreateWithAsset("extend"));
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
