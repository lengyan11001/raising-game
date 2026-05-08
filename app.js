const CREDIT_START = 0;
const MEET_COST = 12;
const PHOTO_COST = 18;
const DATE_VIDEO_COST = 25;
const UNLOCK_VIDEO_COST = 18;
const ASSET_VERSION = "official-2d-1";

const frameSet = (folder) => Array.from(
  { length: 8 },
  (_, index) => `./assets/generated/characters/${folder}/frame-${index}.png?v=${ASSET_VERSION}`,
);

const companions = [
  {
    id: "official2dLilac",
    name: "Lilac",
    title: "Official 2.5D · Violet hue",
    source: "Built from user reference image",
    bio: "Keeps the face, hair and violet outfit of the reference, presented as a dynamic photo card without face swap.",
    colors: ["#b77cff", "#150d1c", "#d8a85c", "#f1bd90"],
    sprite: `./assets/generated/characters/official-2d/lilac/sprite.png?v=${ASSET_VERSION}`,
    mode: "portrait2d",
    assetUri: "",
    stats: { bond: 46, mood: 86, energy: 68 },
  },
  {
    id: "official2dNoir",
    name: "Noir",
    title: "Official 2.5D · Black one-shoulder",
    source: "Built from user reference image",
    bio: "Keeps the persona of the black one-shoulder reference; rendered as a photo card with subtle parallax.",
    colors: ["#161116", "#07070a", "#d8a85c", "#efbd94"],
    sprite: `./assets/generated/characters/official-2d/noir/sprite.png?v=${ASSET_VERSION}`,
    mode: "portrait2d",
    assetUri: "",
    stats: { bond: 44, mood: 88, energy: 70 },
  },
  {
    id: "official2dPink",
    name: "Rose",
    title: "Official 2.5D · Pink workout",
    source: "Built from user reference image",
    bio: "Keeps the face and upper body of the pink fitness reference — fits gyms, rooftops and bright settings.",
    colors: ["#f08ab2", "#161116", "#d8a85c", "#f1bd90"],
    sprite: `./assets/generated/characters/official-2d/pink/sprite.png?v=${ASSET_VERSION}`,
    mode: "portrait2d",
    assetUri: "",
    stats: { bond: 42, mood: 90, energy: 76 },
  },
  {
    id: "aria",
    name: "Aria",
    title: "Free · Asian black gown",
    source: "AI realistic asset",
    bio: "27, editorial Asian look, black satin gown — perfect for the suite night and intimate dates.",
    colors: ["#111016", "#07070a", "#d8a85c", "#f1bd90"],
    sprite: "./assets/generated/characters/aria360/frame-0.png",
    frames: frameSet("aria360"),
    assetUri: "",
    stats: { bond: 42, mood: 84, energy: 66 },
  },
  {
    id: "bianca",
    name: "Bianca",
    title: "Free · Red satin",
    source: "AI realistic asset",
    bio: "31, mature Western aura, deep wine satin gown — premium red carpet and lounge drama.",
    colors: ["#7c1730", "#161018", "#d8a85c", "#efbd94"],
    sprite: "./assets/generated/characters/bianca/frame-0.png",
    frames: frameSet("bianca"),
    assetUri: "",
    stats: { bond: 38, mood: 78, energy: 72 },
  },
  {
    id: "camila",
    name: "Camila",
    title: "Free · Emerald gown",
    source: "AI realistic asset",
    bio: "29, Latin sultry vibe, emerald gown — great for neon rooftop and slow push-in shots.",
    colors: ["#0e6244", "#111717", "#d8a85c", "#d49a76"],
    sprite: "./assets/generated/characters/camila/frame-0.png",
    frames: frameSet("camila"),
    assetUri: "",
    stats: { bond: 35, mood: 88, energy: 78 },
  },
  {
    id: "selene",
    name: "Selene",
    title: "Backup · Illustration",
    source: "Legacy artwork",
    bio: "Legacy anime-style portrait, kept for comparing realistic vs illustrated assets.",
    colors: ["#9b2948", "#21131e", "#d8a85c", "#f1bd90"],
    sprite: "./assets/characters/selene.png",
    assetUri: "",
    stats: { bond: 32, mood: 74, energy: 70 },
  },
];

const scenes = [
  {
    id: "room",
    name: "Suite Night",
    shortName: "Suite",
    desc: "Default private suite. Daily companion vibe, outfit changes and intimate low-light interactions.",
    icon: "bed-double",
    skill: "scene-video.generator.suite",
    videoModel: "wan/v2.6/image-to-video",
  },
  {
    id: "cafe",
    name: "Wine Lounge",
    shortName: "Lounge",
    desc: "Mature lounge date — wine glasses, close conversation and jazz lighting.",
    icon: "martini",
    skill: "scene-video.generator.lounge",
    videoModel: "wan/v2.6/image-to-video",
  },
  {
    id: "park",
    name: "Neon Rooftop",
    shortName: "Rooftop",
    desc: "City night skyline — wind in her hair, neon backlight and slow push-in shots.",
    icon: "building-2",
    skill: "scene-video.generator.rooftop",
    videoModel: "wan/v2.6/image-to-video",
  },
  {
    id: "cinema",
    name: "Private Cinema",
    shortName: "Cinema",
    desc: "Low-light intimate date — projector beams, whispers and side-by-side seating.",
    icon: "clapperboard",
    skill: "scene-video.generator.cinema",
    videoModel: "wan/v2.6/image-to-video",
  },
];

const colorPalettes = [
  ["#9b2948", "#21131e", "#d8a85c", "#f1bd90"],
  ["#d1ad66", "#151a22", "#52c7c8", "#efbd94"],
  ["#e2396d", "#2b1730", "#d8a85c", "#f1c39b"],
  ["#20b8c2", "#1b151b", "#c7465c", "#edbc91"],
];

const outfitSprites = [
  `./assets/generated/characters/official-2d/lilac/sprite.png?v=${ASSET_VERSION}`,
  `./assets/generated/characters/official-2d/noir/sprite.png?v=${ASSET_VERSION}`,
  `./assets/generated/characters/official-2d/pink/sprite.png?v=${ASSET_VERSION}`,
  "./assets/generated/characters/aria360/frame-0.png",
  "./assets/generated/characters/bianca/frame-0.png",
  "./assets/generated/characters/camila/frame-0.png",
  "./assets/characters/selene.png",
];

const vrScenes = [
  {
    id: "suite",
    name: "Suite Night",
    src: "./assets/generated/panoramas/suite-vr-panorama-1648d303-0d3e-41c7-a5b2-40288dfa30fe-2x1.png",
    yaw: 6,
    pitch: -5,
    defaultSpot: "window",
  },
  {
    id: "rooftop",
    name: "Rooftop Pool",
    src: "./assets/generated/panoramas/rooftop-pool-vr-panorama-8289acdf-0ed2-48ee-9563-525c5b690cda-2x1.png",
    yaw: -98,
    pitch: -6,
  },
];

const scenePreviewImages = {
  room: "./assets/generated/backgrounds/suite.jpg",
  cafe: "./assets/backgrounds/cafe.jpg",
  park: "./assets/backgrounds/park.jpg",
  cinema: "./assets/backgrounds/cinema.jpg",
};

const suiteVrSpots = [
  {
    id: "window",
    label: "Window",
    companionId: "official2dLilac",
    viewYaw: 110,
    viewPitch: -7,
    yaw: 105,
    pitch: -33,
    distance: 60,
    width: 15.5,
    height: 25,
    phase: 0.2,
    opacity: 0.96,
  },
  {
    id: "bar",
    label: "Bar",
    companionId: "official2dNoir",
    viewYaw: -173,
    viewPitch: -5,
    yaw: -173,
    pitch: -30,
    distance: 58,
    width: 15,
    height: 24,
    phase: 1.6,
    opacity: 0.94,
  },
  {
    id: "bed",
    label: "Bedside",
    companionId: "official2dPink",
    viewYaw: -138,
    viewPitch: -6,
    yaw: -148,
    pitch: -32,
    distance: 54,
    width: 15,
    height: 24,
    phase: 2.7,
    opacity: 0.94,
  },
];

const state = {
  credits: CREDIT_START,
  authToken: localStorage.getItem("raisingGameToken") || "",
  soundEnabled: localStorage.getItem("raisingGameSoundEnabled") !== "0",
  user: null,
  loginMode: "login",
  config: null,
  homeVideo: null,
  homeVideoIndex: 0,
  homeSceneIndex: 0,
  homeSwipeStartX: 0,
  homeSwipeStartY: 0,
  homeSwipeTracking: false,
  intimacy: {},
  unlocks: [],
  frameCovers: {},
  frameCoverFailures: {},
  framePrewarmRunning: false,
  videoPreloadQueue: [],
  videoPreloadSeen: {},
  homeHeroStarted: false,
  awaitingSoundUnlock: false,
  welcomePromptShown: false,
  userAssets: [],
  selectedUserAssetId: "",
  selectedScenePartnerId: "",
  myCharacters: [],
  customCharacterDataUrl: "",
  customCharacterTimer: null,
  startingMainVideoCharacterId: "",
  customSceneTimers: new Map(),
  selectedCompanion: companions[0],
  currentVrSceneId: "suite",
  currentVrSpotId: "window",
  vr: null,
  currentScene: scenes[0],
  pendingSceneEntry: null,
  pendingScene: scenes[0],
  uploadedDataUrl: "",
  pendingPayment: null,
  characterTimer: null,
  characterRequestId: 0,
  sceneTimer: null,
  sceneRequestId: 0,
  sceneSubmitting: false,
  outfitIndex: 0,
  rotationFrame: 0,
  dragStartX: 0,
  dragStartFrame: 0,
  dragging: false,
  paymentRunning: false,
  eventsBound: false,
  stats: { ...companions[0].stats },
};

const els = {
  creditCount: document.querySelector("#creditCount"),
  topUpBtn: document.querySelector("#topUpBtn"),
  soundToggleBtn: document.querySelector("#soundToggleBtn"),
  generationHistoryBtn: document.querySelector("#generationHistoryBtn"),
  userBtn: document.querySelector("#userBtn"),
  sceneName: document.querySelector("#sceneName"),
  gameStage: document.querySelector("#gameStage"),
  openProfileBtn: document.querySelector("#openProfileBtn"),
  openWishBtn: document.querySelector("#openWishBtn"),
  openPhotoBtn: document.querySelector("#openPhotoBtn"),
  meetBtn: document.querySelector("#meetBtn"),
  chatBtn: document.querySelector("#chatBtn"),
  outfitBtn: document.querySelector("#outfitBtn"),
  openVrBtn: document.querySelector("#openVrBtn"),
  homeHeroVideo: document.querySelector("#homeHeroVideo"),
  homeHeroPoster: document.querySelector("#homeHeroPoster"),
  prevHomeBtn: document.querySelector("#prevHomeBtn"),
  nextHomeBtn: document.querySelector("#nextHomeBtn"),
  nextRoleHintBtn: document.querySelector("#nextRoleHintBtn"),
  unlockVideoBtn: document.querySelector("#unlockVideoBtn"),
  vrView: document.querySelector("#vrView"),
  vrCanvas: document.querySelector("#vrCanvas"),
  closeVrBtn: document.querySelector("#closeVrBtn"),
  vrSceneLabel: document.querySelector("#vrSceneLabel"),
  vrSceneTabs: document.querySelector("#vrSceneTabs"),
  vrSpotTabs: document.querySelector("#vrSpotTabs"),
  vrCompanionLayer: document.querySelector("#vrCompanionLayer"),
  vrCharacterSprite: document.querySelector("#vrCharacterSprite"),
  profileDialog: document.querySelector("#profileDialog"),
  wishDialog: document.querySelector("#wishDialog"),
  photoDialog: document.querySelector("#photoDialog"),
  dateDialog: document.querySelector("#dateDialog"),
  payDialog: document.querySelector("#payDialog"),
  welcomeDialog: document.querySelector("#welcomeDialog"),
  welcomeStartBtn: document.querySelector("#welcomeStartBtn"),
  presetGrid: document.querySelector("#presetGrid"),
  presetTemplate: document.querySelector("#presetTemplate"),
  sceneOrbit: document.querySelector("#sceneOrbit"),
  sceneHotspotTemplate: document.querySelector("#sceneHotspotTemplate"),
  characterPrompt: document.querySelector("#characterPrompt"),
  saveWishBtn: document.querySelector("#saveWishBtn"),
  wishGenerateBtn: document.querySelector("#wishGenerateBtn"),
  uploadInput: document.querySelector("#uploadInput"),
  uploadPreview: document.querySelector("#uploadPreview"),
  uploadGenerateBtn: document.querySelector("#uploadGenerateBtn"),
  dateDialogTitle: document.querySelector("#dateDialogTitle"),
  dateDialogDesc: document.querySelector("#dateDialogDesc"),
  scenePreview: document.querySelector("#scenePreview"),
  scenePrompt: document.querySelector("#scenePrompt"),
  scenePromptHint: document.querySelector("#scenePromptHint"),
  sceneGenerateBtn: document.querySelector("#sceneGenerateBtn"),
  openScenePickerBtn: document.querySelector("#openScenePickerBtn"),
  scenePickerDialog: document.querySelector("#scenePickerDialog"),
  scenePickerGrid: document.querySelector("#scenePickerGrid"),
  intimacyBadge: document.querySelector("#intimacyBadge"),
  intimacyValue: document.querySelector("#intimacyValue"),
  intimacyPill: document.querySelector("#intimacyPill"),
  intimacyPillValue: document.querySelector("#intimacyPillValue"),
  videoDialog: document.querySelector("#videoDialog"),
  resultVideo: document.querySelector("#resultVideo"),
  generationHistoryDialog: document.querySelector("#generationHistoryDialog"),
  generationHistoryList: document.querySelector("#generationHistoryList"),
  generationHistoryRefreshBtn: document.querySelector("#generationHistoryRefreshBtn"),
  avatarModel: document.querySelector("#avatarModel"),
  characterSprite: document.querySelector("#characterSprite"),
  referenceOverlay: document.querySelector("#referenceOverlay"),
  avatarSource: document.querySelector("#avatarSource"),
  avatarName: document.querySelector("#avatarName"),
  avatarNamePlate: document.querySelector("#avatarNamePlate"),
  avatarBio: document.querySelector("#avatarBio"),
  bondValue: document.querySelector("#bondValue"),
  moodValue: document.querySelector("#moodValue"),
  energyValue: document.querySelector("#energyValue"),
  jobPanel: document.querySelector("#jobPanel"),
  jobTitle: document.querySelector("#jobTitle"),
  jobDetail: document.querySelector("#jobDetail"),
  jobProgress: document.querySelector("#jobProgress"),
  payTitle: document.querySelector("#payTitle"),
  payDetail: document.querySelector("#payDetail"),
  confirmPayBtn: document.querySelector("#confirmPayBtn"),
  loginDialog: document.querySelector("#loginDialog"),
  loginTitle: document.querySelector("#loginTitle"),
  loginHint: document.querySelector("#loginHint"),
  loginUsername: document.querySelector("#loginUsername"),
  loginPassword: document.querySelector("#loginPassword"),
  loginSubmitBtn: document.querySelector("#loginSubmitBtn"),
  toggleLoginModeBtn: document.querySelector("#toggleLoginModeBtn"),
  rechargeDialog: document.querySelector("#rechargeDialog"),
  rechargeAmount: document.querySelector("#rechargeAmount"),
  createOrderBtn: document.querySelector("#createOrderBtn"),
  orderResult: document.querySelector("#orderResult"),
  staticWalletAddr: document.querySelector("#staticWalletAddr"),
  copyWalletBtn: document.querySelector("#copyWalletBtn"),
  userAssetList: document.querySelector("#userAssetList"),
  sceneAssetSelect: document.querySelector("#sceneAssetSelect"),
  sceneAssetRow: document.querySelector("#sceneAssetRow") || document.querySelector("#sceneAssetSelect")?.closest(".field-row"),
  boundSceneVideoPanel: document.querySelector("#boundSceneVideoPanel"),
  boundSceneVideoPlayer: document.querySelector("#boundSceneVideoPlayer"),
  boundSceneVideoNote: document.querySelector("#boundSceneVideoNote"),
  customCharacterBtn: document.querySelector("#customCharacterBtn"),
  customCharacterDialog: document.querySelector("#customCharacterDialog"),
  customCharacterInput: document.querySelector("#customCharacterInput"),
  customCharacterPreview: document.querySelector("#customCharacterPreview"),
  customCharacterName: document.querySelector("#customCharacterName"),
  customCharacterTitle: document.querySelector("#customCharacterTitle"),
  customCharacterSaveDraftBtn: document.querySelector("#customCharacterSaveDraftBtn"),
  customCharacterStatus: document.querySelector("#customCharacterStatus"),
  customCharacterTip: document.querySelector("#customCharacterTip"),
  customCharacterList: document.querySelector("#customCharacterList"),
};

function refreshIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function clamp(value) {
  return Math.max(0, Math.min(100, value));
}

function closeDialog(dialog) {
  if (dialog?.open) dialog.close("cancel");
}

function closeGameDialogs() {
  [els.profileDialog, els.wishDialog, els.photoDialog, els.dateDialog, els.videoDialog, els.customCharacterDialog, els.scenePickerDialog, els.generationHistoryDialog].forEach(closeDialog);
}

const INTIMACY_STORAGE_KEY = "raisingGameIntimacy";

function loadIntimacyMap() {
  try {
    const raw = localStorage.getItem(INTIMACY_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out = {};
    Object.keys(parsed).forEach((k) => {
      const v = Number(parsed[k]);
      if (Number.isFinite(v) && v >= 0) out[k] = Math.floor(v);
    });
    return out;
  } catch (error) {
    console.warn("Failed to load intimacy map", error);
    return {};
  }
}

function saveIntimacyMap() {
  try {
    localStorage.setItem(INTIMACY_STORAGE_KEY, JSON.stringify(state.intimacy || {}));
  } catch (error) {
    console.warn("Failed to save intimacy map", error);
  }
}

function getIntimacy(itemId) {
  if (!itemId) return 0;
  return Number(state.intimacy?.[itemId] || 0);
}

function bumpIntimacy(itemId, delta = 1) {
  if (!itemId) return 0;
  if (!state.intimacy) state.intimacy = {};
  const next = Math.max(0, getIntimacy(itemId) + Number(delta || 0));
  state.intimacy[itemId] = next;
  saveIntimacyMap();
  renderIntimacy(true);
  return next;
}

function renderIntimacy(animate = false) {
  const item = getActiveHomeVideoItem();
  const value = getIntimacy(item?.id);
  if (els.intimacyValue) els.intimacyValue.textContent = String(value);
  if (els.intimacyPillValue) els.intimacyPillValue.textContent = String(value);
  if (els.intimacyBadge) els.intimacyBadge.hidden = !item;
  if (els.intimacyPill) els.intimacyPill.hidden = !item;
  if (animate && els.intimacyPill) {
    els.intimacyPill.classList.remove("is-bumping");
    void els.intimacyPill.offsetWidth;
    els.intimacyPill.classList.add("is-bumping");
  }
}

function openDialog(dialog) {
  closeGameDialogs();
  dialog.showModal();
  refreshIcons();
}

function authHeaders() {
  return state.authToken ? { authorization: `Bearer ${state.authToken}` } : {};
}

function priceOf(key, fallback) {
  return Number(state.config?.prices?.[key] ?? fallback);
}

function syncUser(user) {
  state.user = user || null;
  if (state.user) {
    state.credits = Number(state.user.credits || 0);
  } else {
    state.credits = CREDIT_START;
    state.unlocks = [];
  }
  renderCredits();
  renderUnlockButton();
  els.userBtn?.classList.toggle("is-active", Boolean(state.user));
}

function renderLoginMode() {
  const isAccount = state.loginMode === "account" && state.user;
  els.loginUsername.hidden = isAccount;
  els.loginPassword.hidden = isAccount;
  els.loginSubmitBtn.hidden = isAccount;
  els.toggleLoginModeBtn.hidden = isAccount;
  if (isAccount) {
    els.loginTitle.textContent = "Account";
    els.loginHint.textContent = `${state.user.username} · balance ${state.credits} credits.`;
    refreshIcons();
    return;
  }

  const isRegister = state.loginMode === "register";
  els.loginTitle.textContent = isRegister ? "Sign up" : "Sign in";
  els.loginHint.textContent = isRegister ? "The first account that signs up automatically becomes admin." : "Sign in to generate, upload references and top up credits.";
  els.loginSubmitBtn.innerHTML = isRegister
    ? '<i data-lucide="user-plus"></i>Sign up'
    : '<i data-lucide="log-in"></i>Sign in';
  els.toggleLoginModeBtn.textContent = isRegister ? "Back to sign in" : "Sign up";
  refreshIcons();
}

function openLoginDialog(mode = state.user ? "account" : "login") {
  state.loginMode = mode === "register" ? "register" : mode === "account" && state.user ? "account" : "login";
  renderLoginMode();
  [els.welcomeDialog, els.payDialog, els.rechargeDialog].forEach(closeDialog);
  closeGameDialogs();
  if (!els.loginDialog.open) {
    els.loginDialog.showModal();
  }
  if (state.loginMode !== "account") {
    setTimeout(() => els.loginUsername.focus(), 60);
  }
}

function openRechargeDialog() {
  if (!state.user) {
    openLoginDialog();
    return;
  }
  els.orderResult.textContent = "";
  els.rechargeDialog.showModal();
  refreshIcons();
}

function getVrScene(sceneId) {
  return vrScenes.find((scene) => scene.id === sceneId) || vrScenes[0];
}

function getSuiteVrSpot(spotId) {
  return suiteVrSpots.find((spot) => spot.id === spotId) || suiteVrSpots[0];
}

function getCompanionById(companionId) {
  return companions.find((companion) => companion.id === companionId) || companions[0];
}

function sphericalPoint(yaw, pitch, distance) {
  const phi = THREE.MathUtils.degToRad(90 - pitch);
  const theta = THREE.MathUtils.degToRad(yaw);
  return new THREE.Vector3(
    distance * Math.sin(phi) * Math.cos(theta),
    distance * Math.cos(phi),
    distance * Math.sin(phi) * Math.sin(theta),
  );
}

function companionSpriteSrc(companion, frame = 0) {
  return companion.frames?.[frame] || companion.sprite;
}

function currentCompanionSpriteSrc() {
  return companionSpriteSrc(state.selectedCompanion, state.rotationFrame);
}

function resizeVrRenderer() {
  const vr = state.vr;
  if (!vr?.renderer || !els.vrCanvas) return;
  const width = Math.max(1, els.vrView.clientWidth || window.innerWidth);
  const height = Math.max(1, els.vrView.clientHeight || window.innerHeight);
  vr.renderer.setSize(width, height, false);
  vr.camera.aspect = width / height;
  vr.camera.updateProjectionMatrix();
}

function renderVrFrame() {
  const vr = state.vr;
  if (!vr?.active) return;

  const phi = THREE.MathUtils.degToRad(90 - vr.pitch);
  const theta = THREE.MathUtils.degToRad(vr.yaw);
  vr.camera.target.set(
    500 * Math.sin(phi) * Math.cos(theta),
    500 * Math.cos(phi),
    500 * Math.sin(phi) * Math.sin(theta),
  );
  vr.camera.lookAt(vr.camera.target);
  animateVrCompanions();
  vr.renderer.render(vr.scene, vr.camera);
  vr.animationId = window.requestAnimationFrame(renderVrFrame);
}

function animateVrCompanions() {
  const vr = state.vr;
  if (!vr?.companionSprites) return;

  const t = performance.now() * 0.001;
  vr.companionSprites.forEach((entry) => {
    if (!entry.sprite.visible || !entry.basePosition || !entry.baseScale) return;

    const breath = Math.sin(t * 1.25 + (entry.phase || 0));
    const sway = Math.sin(t * 0.55 + (entry.phase || 0)) * 0.12;
    entry.sprite.position.copy(entry.basePosition);
    entry.sprite.position.x += sway;
    entry.sprite.position.y += breath * 0.08;
    entry.sprite.scale.set(
      entry.baseScale.width * (1 + breath * 0.004),
      entry.baseScale.height * (1 + breath * 0.008),
      1,
    );

    if (entry.texture) {
      entry.material.opacity = (entry.opacity || 0.95) * (0.985 + breath * 0.015);
    }
  });
}

function ensureVrViewer() {
  if (state.vr) return true;
  if (!window.THREE) {
    updateJob("VR failed to load", "Three.js failed to load. Check your network and refresh.", 0);
    return false;
  }

  const renderer = new THREE.WebGLRenderer({
    canvas: els.vrCanvas,
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(76, 1, 0.1, 1100);
  camera.target = new THREE.Vector3(0, 0, 0);

  const geometry = new THREE.SphereGeometry(500, 96, 48);
  geometry.scale(-1, 1, 1);
  const material = new THREE.MeshBasicMaterial({ color: 0x111111 });
  const sphere = new THREE.Mesh(geometry, material);
  scene.add(sphere);

  const companionGroup = new THREE.Group();
  scene.add(companionGroup);

  state.vr = {
    active: false,
    scene,
    camera,
    renderer,
    geometry,
    material,
    sphere,
    companionGroup,
    companionSprites: new Map(),
    loader: new THREE.TextureLoader(),
    texture: null,
    yaw: -72,
    pitch: -4,
    dragging: false,
    lastX: 0,
    lastY: 0,
    animationId: 0,
  };

  resizeVrRenderer();
  return true;
}

function syncVrWorldCompanions() {
  const vr = state.vr;
  if (!vr?.companionGroup) return;
  if (els.vrCompanionLayer) els.vrCompanionLayer.hidden = true;

  const scene = getVrScene(state.currentVrSceneId);
  const shouldShow = scene.id === "suite";

  suiteVrSpots.forEach((spot) => {
    let entry = vr.companionSprites.get(spot.id);
    if (!entry) {
      const material = new THREE.SpriteMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        depthTest: false,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(material);
      sprite.center.set(0.5, 0);
      sprite.renderOrder = 5;
      vr.companionGroup.add(sprite);
      entry = { material, sprite, src: "", texture: null };
      vr.companionSprites.set(spot.id, entry);
    }

    const companion = getCompanionById(spot.companionId);
    const src = companionSpriteSrc(companion, 0);
    const isActiveSpot = spot.id === state.currentVrSpotId;
    entry.sprite.name = `${spot.label}-${companion.name}`;
    entry.sprite.userData = { spotId: spot.id, companionId: companion.id };
    entry.sprite.visible = shouldShow && isActiveSpot;
    entry.basePosition = sphericalPoint(spot.yaw, spot.pitch, spot.distance);
    entry.baseScale = { width: spot.width, height: spot.height };
    entry.phase = spot.phase || 0;
    entry.opacity = spot.opacity || 0.95;
    entry.sprite.position.copy(entry.basePosition);
    entry.sprite.scale.set(spot.width, spot.height, 1);
    if (entry.texture) entry.material.opacity = entry.sprite.visible ? entry.opacity : 0;

    if (!shouldShow || !src || entry.src === src) return;
    entry.src = src;
    entry.material.opacity = 0;
    vr.loader.load(
      src,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = Math.min(8, vr.renderer.capabilities.getMaxAnisotropy());
        if (entry.texture) entry.texture.dispose();
        entry.texture = texture;
        entry.material.map = texture;
        entry.material.opacity = entry.sprite.visible ? entry.opacity : 0;
        entry.material.needsUpdate = true;
      },
      undefined,
      () => updateJob("VR companion failed", `Failed to load companion asset for ${spot.label}.`, 0),
    );
  });
}

function setVrSuiteSpot(spotId, options = {}) {
  if (!ensureVrViewer()) return;
  const vr = state.vr;
  const spot = getSuiteVrSpot(spotId);
  state.currentVrSpotId = spot.id;
  els.vrSpotTabs?.querySelectorAll("button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.vrSpot === spot.id);
  });
  syncVrWorldCompanions();

  if (options.moveCamera !== false) {
    vr.yaw = spot.viewYaw;
    vr.pitch = spot.viewPitch;
  }
}

function setVrScene(sceneId, options = {}) {
  if (!ensureVrViewer()) return;
  const vr = state.vr;
  const scene = getVrScene(sceneId);
  state.currentVrSceneId = scene.id;
  els.vrSceneLabel.textContent = scene.name;
  if (els.vrSpotTabs) els.vrSpotTabs.hidden = scene.id !== "suite";
  els.vrSceneTabs?.querySelectorAll("button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.vrScene === scene.id);
  });

  if (!options.keepView) {
    vr.yaw = scene.yaw;
    vr.pitch = scene.pitch;
  }

  if (scene.id === "suite") {
    setVrSuiteSpot(scene.defaultSpot || state.currentVrSpotId, { moveCamera: !options.keepView });
  } else {
    syncVrWorldCompanions();
  }

  vr.loader.load(
    scene.src,
    (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = Math.min(8, vr.renderer.capabilities.getMaxAnisotropy());
      if (vr.texture) vr.texture.dispose();
      vr.texture = texture;
      vr.material.map = texture;
      vr.material.color.set(0xffffff);
      vr.material.needsUpdate = true;
    },
    undefined,
    () => updateJob("VR panorama failed", `Failed to load the panorama for ${scene.name}.`, 0),
  );
}

function openVrViewer(sceneId = state.currentVrSceneId) {
  if (!ensureVrViewer()) return;
  closeGameDialogs();
  els.vrView.hidden = false;
  state.vr.active = true;
  setVrScene(sceneId);
  resizeVrRenderer();
  window.cancelAnimationFrame(state.vr.animationId);
  renderVrFrame();
  refreshIcons();
}

function closeVrViewer() {
  if (!state.vr) {
    els.vrView.hidden = true;
    return;
  }
  state.vr.active = false;
  window.cancelAnimationFrame(state.vr.animationId);
  els.vrView.hidden = true;
}

function bindVrEvents() {
  if (!els.vrView) return;
  els.openVrBtn?.addEventListener("click", () => {
    const sceneId = state.currentScene.id === "park" ? "rooftop" : "suite";
    openVrViewer(sceneId);
  });
  els.closeVrBtn?.addEventListener("click", closeVrViewer);
  els.vrSceneTabs?.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => setVrScene(button.dataset.vrScene));
  });
  els.vrSpotTabs?.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => setVrSuiteSpot(button.dataset.vrSpot));
  });

  els.vrView.addEventListener("pointerdown", (event) => {
    if (event.target.closest("button")) return;
    state.vr.dragging = true;
    state.vr.lastX = event.clientX;
    state.vr.lastY = event.clientY;
    els.vrView.setPointerCapture?.(event.pointerId);
  });

  els.vrView.addEventListener("pointermove", (event) => {
    const vr = state.vr;
    if (!vr?.dragging) return;
    const deltaX = event.clientX - vr.lastX;
    const deltaY = event.clientY - vr.lastY;
    vr.lastX = event.clientX;
    vr.lastY = event.clientY;
    vr.yaw -= deltaX * 0.16;
    vr.pitch = Math.max(-72, Math.min(72, vr.pitch + deltaY * 0.12));
  });

  const stopDrag = (event) => {
    if (!state.vr) return;
    state.vr.dragging = false;
    els.vrView.releasePointerCapture?.(event.pointerId);
  };
  els.vrView.addEventListener("pointerup", stopDrag);
  els.vrView.addEventListener("pointercancel", stopDrag);
  window.addEventListener("resize", resizeVrRenderer);
}

function renderCredits() {
  els.creditCount.textContent = String(state.credits);
}

function renderStats() {
  els.bondValue.textContent = String(state.stats.bond);
  els.moodValue.textContent = String(state.stats.mood);
  els.energyValue.textContent = String(state.stats.energy);
}

function bumpStats(delta) {
  state.stats = {
    bond: clamp(state.stats.bond + (delta.bond || 0)),
    mood: clamp(state.stats.mood + (delta.mood || 0)),
    energy: clamp(state.stats.energy + (delta.energy || 0)),
  };
  renderStats();
}

function updateJob(title, detail, progress = 0) {
  els.jobPanel?.classList.add("is-active");
  if (els.jobTitle) els.jobTitle.textContent = title;
  if (els.jobDetail) els.jobDetail.textContent = detail;
  if (els.jobProgress) els.jobProgress.style.width = `${Math.max(0, Math.min(progress, 100))}%`;
}

function playVideo(videoEl, { allowMutedFallback = false } = {}) {
  if (!videoEl) return;
  const playPromise = videoEl.play();
  if (!playPromise?.catch) return;
  playPromise.catch(() => {
    if (!allowMutedFallback || !state.soundEnabled) return;
    state.awaitingSoundUnlock = true;
    videoEl.muted = true;
    videoEl.volume = 0;
    videoEl.play().catch(() => {});
  });
}

function applyVideoAudio(videoEl, { forcePlay = false, allowMutedFallback = false } = {}) {
  if (!videoEl) return;
  const muted = !state.soundEnabled || state.awaitingSoundUnlock;
  videoEl.muted = muted;
  videoEl.volume = muted ? 0 : 1;
  if (forcePlay) playVideo(videoEl, { allowMutedFallback });
}

function syncAllVideoAudio(options = {}) {
  applyVideoAudio(els.homeHeroVideo, options);
  applyVideoAudio(els.boundSceneVideoPlayer, options);
  applyVideoAudio(els.resultVideo, options);
}

function playHomeHeroWithSound() {
  state.soundEnabled = true;
  state.awaitingSoundUnlock = false;
  localStorage.setItem("raisingGameSoundEnabled", "1");
  renderSoundToggle();
  applyVideoAudio(els.homeHeroVideo, { forcePlay: true });
}

function renderSoundToggle() {
  if (!els.soundToggleBtn) return;
  els.soundToggleBtn.setAttribute("aria-pressed", String(state.soundEnabled));
  els.soundToggleBtn.setAttribute("aria-label", state.soundEnabled ? "Sound on" : "Sound off");
  els.soundToggleBtn.innerHTML = state.soundEnabled
    ? '<i data-lucide="volume-2"></i>'
    : '<i data-lucide="volume-x"></i>';
  refreshIcons();
}

function setSoundEnabled(nextValue) {
  state.soundEnabled = Boolean(nextValue);
  state.awaitingSoundUnlock = false;
  localStorage.setItem("raisingGameSoundEnabled", state.soundEnabled ? "1" : "0");
  renderSoundToggle();
  syncAllVideoAudio({ forcePlay: true });
}

function unlockSoundAfterGesture() {
  if (!state.awaitingSoundUnlock) return;
  state.awaitingSoundUnlock = false;
  syncAllVideoAudio({ forcePlay: true });
}

function openWelcomeDialog() {
  if (state.welcomePromptShown || !els.welcomeDialog || !state.soundEnabled) return;
  if (document.querySelector("dialog[open]")) return;
  state.welcomePromptShown = true;
  try {
    els.welcomeDialog.showModal();
  } catch {
    /* ignore */
  }
  refreshIcons();
}

function showVideoResult(videoUrl) {
  const url = String(videoUrl || "").trim();
  if (!url) return;
  els.resultVideo.loop = true;
  els.resultVideo.src = url;
  applyVideoAudio(els.resultVideo);
  openDialog(els.videoDialog);
  els.resultVideo.play().catch(() => {});
  refreshIcons();
}

function generationRecordVideoUrl(record) {
  return String(record?.localVideoUrl || record?.videoUrl || record?.remoteVideoUrl || "").trim();
}

function generationRecordKindLabel(record) {
  if (record?.kind === "unlock-video") return "Unlock video";
  return record?.kind === "main-video" ? "Main video" : "Scene video";
}

function generationRecordTitle(record) {
  const character = String(record?.companionName || "Character").trim();
  const sceneEntry = String(record?.sceneEntryName || "").trim();
  const scene = String(record?.sceneName || "").trim();
  if (record?.kind === "main-video") return `${character} main video`;
  return [character, sceneEntry || scene || "Scene video"].filter(Boolean).join(" / ");
}

function generationRecordStatusLabel(status) {
  const value = String(status || "submitted").toLowerCase();
  if (["succeeded", "success", "done", "completed"].includes(value)) return "Ready";
  if (["failed", "error"].includes(value)) return "Failed";
  if (["cancelled", "canceled"].includes(value)) return "Canceled";
  if (["running", "processing", "in_progress"].includes(value)) return "Generating";
  if (["queued", "pending", "submitted", "created"].includes(value)) return "Queued";
  return status || "Submitted";
}

function formatRecordDate(value) {
  const time = value ? new Date(value) : null;
  if (!time || Number.isNaN(time.getTime())) return "";
  return time.toLocaleString([], {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function generationRecordParams(record) {
  const lines = [
    ["Task ID", record.taskId],
    ["Status", record.status],
    ["Type", generationRecordKindLabel(record)],
    ["Character", record.companionName],
    ["Scene", record.sceneName],
    ["Entry", record.sceneEntryName],
    ["Partner", record.partnerCharacterName],
    ["Model", record.model],
    ["Ratio", record.ratio],
    ["Resolution", record.resolution],
    ["Duration", record.duration],
    ["Quality", record.quality],
    ["Prompt", record.prompt],
    ["Final prompt", record.finalPrompt],
    ["Video", generationRecordVideoUrl(record)],
    ["Error", record.error],
  ];
  return lines
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim())
    .map(([key, value]) => `${key}: ${String(value).trim()}`)
    .join("\n");
}

function renderGenerationHistory(records = [], { loading = false } = {}) {
  if (!els.generationHistoryList) return;
  if (loading) {
    els.generationHistoryList.innerHTML = '<div class="history-empty">Loading records...</div>';
    return;
  }
  if (!records.length) {
    els.generationHistoryList.innerHTML = '<div class="history-empty">No video generation tasks yet. Saving a custom character draft is not a video task; tap Main video or Generate video after saving to create one.</div>';
    return;
  }

  els.generationHistoryList.innerHTML = records.map((record, index) => {
    const videoUrl = generationRecordVideoUrl(record);
    const params = generationRecordParams(record);
    const status = generationRecordStatusLabel(record.status);
    const statusClass = status.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const meta = [
      generationRecordKindLabel(record),
      record.sceneName,
      record.sceneEntryName,
      formatRecordDate(record.updatedAt || record.createdAt),
    ].filter(Boolean).join(" / ");
    return `
      <article class="history-item" data-history-index="${index}">
        <header class="history-item-head">
          <div>
            <strong>${escapeHtmlSafe(generationRecordTitle(record))}</strong>
            <em>${escapeHtmlSafe(meta)}</em>
          </div>
          <span class="history-status is-${escapeHtmlSafe(statusClass)}">${escapeHtmlSafe(status)}</span>
        </header>
        <div class="history-actions">
          <button class="primary-btn compact-btn" type="button" data-history-action="play">
            <i data-lucide="${videoUrl ? "play" : "refresh-cw"}"></i>
            ${videoUrl ? "Play" : "Check"}
          </button>
          <button class="secondary-btn compact-btn" type="button" data-history-action="params">
            <i data-lucide="sliders-horizontal"></i>
            Params
          </button>
        </div>
        <pre class="history-params" hidden>${escapeHtmlSafe(params || "No parameters recorded.")}</pre>
      </article>
    `;
  }).join("");

  els.generationHistoryList.querySelectorAll("[data-history-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const item = button.closest(".history-item");
      const record = records[Number(item?.dataset.historyIndex || -1)];
      if (!record) return;
      if (button.dataset.historyAction === "play") {
        playGenerationHistoryRecord(record, button);
        return;
      }
      const params = item.querySelector(".history-params");
      if (params) params.hidden = !params.hidden;
    });
  });
  refreshIcons();
}

async function playGenerationHistoryRecord(record, button) {
  const existingUrl = generationRecordVideoUrl(record);
  const taskId = String(record?.taskId || "").trim();
  if (!taskId) {
    if (existingUrl) showVideoResult(existingUrl);
    return;
  }
  const previousHtml = button?.innerHTML || "";
  if (button) {
    button.disabled = true;
    button.innerHTML = '<i data-lucide="loader-circle"></i>Checking';
    refreshIcons();
  }
  try {
    const payload = await requestJson(`/api/generation-records/${encodeURIComponent(taskId)}`);
    const nextRecord = payload.record || {};
    const videoUrl = generationRecordVideoUrl(nextRecord);
    if (videoUrl) {
      showVideoResult(videoUrl);
    } else if (existingUrl) {
      showVideoResult(existingUrl);
    } else {
      updateJob("Video not ready", "Refresh the record later. The generation task is still in progress.", 0);
    }
    loadGenerationHistory();
  } catch (error) {
    updateJob("Record check failed", error.message || String(error), 0);
  } finally {
    if (button) {
      button.disabled = false;
      button.innerHTML = previousHtml;
      refreshIcons();
    }
  }
}

async function loadGenerationHistory() {
  renderGenerationHistory([], { loading: true });
  try {
    const payload = await requestJson("/api/generation-records?limit=80");
    renderGenerationHistory(Array.isArray(payload.records) ? payload.records : []);
  } catch (error) {
    if (error.status === 401 || error.code === "LOGIN_REQUIRED") {
      closeDialog(els.generationHistoryDialog);
      openLoginDialog();
      return;
    }
    els.generationHistoryList.innerHTML = `<div class="history-empty">Failed to load records: ${escapeHtmlSafe(error.message || String(error))}</div>`;
  }
}

function openGenerationHistoryDialog() {
  if (!state.user) {
    openLoginDialog();
    return;
  }
  if (els.generationHistoryDialog) openDialog(els.generationHistoryDialog);
  loadGenerationHistory();
}

function getHomeReferenceAssetUri() {
  // Only use the active item's own reference asset. Falling back to
  // `state.homeVideo.referenceAssetUri` would let a non-active character
  // pretend it has the active character's reference and would therefore
  // submit the wrong asset upstream.
  return String(getActiveHomeVideoItem()?.referenceAssetUri || "");
}

function adminHomeItems() {
  const homeVideo = state.config?.homeVideo || {};
  const items = Array.isArray(homeVideo.items)
    ? homeVideo.items.filter((item) => {
        const hasHomeSceneVideo = Object.values(item.homeSceneVideos || {}).some((entry) => entry?.videoUrl || entry?.localVideoUrl || entry?.remoteVideoUrl || entry?.taskId);
        return item.posterUrl || item.localImageUrl || item.videoUrl || hasHomeSceneVideo;
      })
    : [];
  if (items.length) return items.map((item) => ({ ...item, ownerType: "admin" }));
  return [{
    id: homeVideo.activeItemId || "home-default",
    ownerType: "admin",
    name: "Featured",
    title: homeVideo.videoUrl ? "Main video" : "Hero poster",
    posterUrl: homeVideo.posterUrl || "./assets/admin/home/default-hero.jpg",
    videoUrl: homeVideo.videoUrl || homeVideo.localVideoUrl || "",
    referenceAssetUri: homeVideo.referenceAssetUri || "",
    homeSceneVideos: {},
    sceneVideos: {},
  }];
}

function userHomeItems() {
  return state.myCharacters
    .filter((character) => {
      const video = String(character.videoUrl || "").trim();
      if (!video) return false;
      const st = String(character.status || "").toLowerCase();
      if (["failed", "error", "cancelled", "canceled"].includes(st)) return false;
      return true;
    })
    .map((character) => ({
      ...character,
      ownerType: "user",
      homeSceneVideos: {
        room: {
          sceneId: "room",
          sceneName: "Suite Night",
          videoUrl: character.videoUrl || character.localVideoUrl || "",
          posterUrl: character.posterUrl || character.localImageUrl || "",
          taskId: character.taskId || "",
          status: character.status || "",
        },
      },
    }));
}

function getHomeVideoItems() {
  return [...userHomeItems(), ...adminHomeItems()];
}

function getActiveHomeVideoItem() {
  const items = getHomeVideoItems();
  if (!items.length) return null;
  state.homeVideoIndex = ((state.homeVideoIndex % items.length) + items.length) % items.length;
  return items[state.homeVideoIndex];
}

function getSceneVideoForActive(sceneId) {
  const item = getActiveHomeVideoItem();
  if (!item || !sceneId) return null;
  const sceneVideos = item.sceneVideos || {};
  const entry = sceneVideos[sceneId] || Object.values(sceneVideos).find((candidate) => candidate?.sceneId === sceneId);
  if (!entry || typeof entry !== "object") return null;
  const url = String(entry.videoUrl || entry.localVideoUrl || entry.remoteVideoUrl || "").trim();
  if (!url) return null;
  return { item, entry: { ...entry, videoUrl: url } };
}

function getSavedScenePromptForActive(sceneId) {
  const item = getActiveHomeVideoItem();
  if (!item || !sceneId) return "";
  const sceneVideos = item.sceneVideos || {};
  const entry = sceneVideos[sceneId] || Object.values(sceneVideos).find((candidate) => candidate?.sceneId === sceneId);
  return String(entry?.userPrompt || entry?.savedPrompt || "").trim();
}

function getHomeSceneEntriesForActive() {
  return getHomeSceneEntriesForItem(getActiveHomeVideoItem());
}

function getHomeSceneEntriesForItem(item) {
  if (!item) return [];
  const entries = item.homeSceneVideos || {};
  return scenes.map((scene) => {
    const entry = entries[scene.id];
    const url = entry ? String(entry.videoUrl || entry.localVideoUrl || entry.remoteVideoUrl || "").trim() : "";
    return {
      scene,
      item,
      entry: entry && url ? { ...entry, videoUrl: url } : null,
    };
  });
}

function getActiveHomeSceneEntry() {
  const entries = getHomeSceneEntriesForActive();
  if (!entries.length) return null;
  state.homeSceneIndex = ((state.homeSceneIndex % entries.length) + entries.length) % entries.length;
  return entries[state.homeSceneIndex];
}

function getActiveHomeSceneVideoUrl() {
  const binding = getActiveHomeSceneEntry();
  return binding?.entry?.videoUrl || "";
}

function mediaUrlFromEntry(entry = {}) {
  return String(entry.videoUrl || entry.localVideoUrl || entry.remoteVideoUrl || "").trim();
}

function getActiveUnlockVideoMeta() {
  const item = getActiveHomeVideoItem();
  const scene = getActiveHomeSceneEntry()?.scene || state.currentScene || scenes[0];
  if (!item || !scene?.id) return null;
  const unlockVideos = item.unlockVideos || {};
  const entry =
    unlockVideos[scene.id] ||
    Object.values(unlockVideos).find((candidate) => candidate?.sceneId === scene.id);
  if (!entry || typeof entry !== "object") return null;
  return { item, scene, video: { ...entry, sceneId: entry.sceneId || scene.id } };
}

function unlockRecordKey(itemId, sceneId, sceneEntryId = "default") {
  return [itemId, sceneId, sceneEntryId || "default"].map((part) => String(part || "").trim()).join("::");
}

function hasUnlockForVideo(itemId, sceneId, sceneEntryId = "default") {
  const target = unlockRecordKey(itemId, sceneId, sceneEntryId);
  return state.unlocks.some((record) => unlockRecordKey(record.itemId, record.sceneId, record.sceneEntryId || "default") === target);
}

function renderUnlockButton() {
  const meta = getActiveUnlockVideoMeta();
  if (!els.unlockVideoBtn) return;
  if (!meta) {
    els.unlockVideoBtn.hidden = true;
    return;
  }
  const { item, scene, video } = meta;
  const price = Number(video.price ?? priceOf("unlockVideo", UNLOCK_VIDEO_COST));
  const owned = hasUnlockForVideo(item.id, scene.id, video.sceneEntryId || "default");
  els.unlockVideoBtn.hidden = false;
  els.unlockVideoBtn.disabled = String(video.status || "").toLowerCase() === "failed";
  els.unlockVideoBtn.classList.toggle("is-unlocked", owned);
  els.unlockVideoBtn.dataset.itemId = item.id || "";
  els.unlockVideoBtn.dataset.sceneId = scene.id || "";
  els.unlockVideoBtn.innerHTML = owned
    ? '<i data-lucide="play"></i><span>Play</span>'
    : `<i data-lucide="lock-keyhole"></i><span>Unlock ${price}</span>`;
}

async function loadUnlocks() {
  if (!state.user) {
    state.unlocks = [];
    renderUnlockButton();
    return;
  }
  try {
    const payload = await requestJson("/api/unlocks");
    state.unlocks = Array.isArray(payload.unlocks) ? payload.unlocks : [];
  } catch (error) {
    console.warn("unlocks unavailable", error);
    state.unlocks = [];
  }
  renderUnlockButton();
}

async function unlockActiveVideo(metaOverride = null) {
  const meta = metaOverride || getActiveUnlockVideoMeta();
  if (!meta) return;
  const { item, scene, video } = meta;
  try {
    const payload = await requestJson("/api/unlock-video", {
      method: "POST",
      body: JSON.stringify({
        itemId: item.id,
        sceneId: scene.id,
        sceneEntryId: video.sceneEntryId || "default",
      }),
    });
    if (payload.user) syncUser(payload.user);
    if (Array.isArray(payload.unlocks)) state.unlocks = payload.unlocks;
    renderUnlockButton();
    const playbackUrl = payload.video?.videoUrl || "";
    if (playbackUrl) showVideoResult(playbackUrl);
    updateJob(payload.charged ? "Unlocked" : "Playing unlocked video", payload.video?.title || scene.name || "Unlocked scene", 100);
  } catch (error) {
    updateJob("Unlock failed", error.message || String(error), 0);
    if (String(error?.code || "").includes("INSUFFICIENT")) openRechargeDialog();
  }
}

function handleUnlockVideoClick() {
  const meta = getActiveUnlockVideoMeta();
  if (!meta) return;
  const { item, scene, video } = meta;
  const owned = hasUnlockForVideo(item.id, scene.id, video.sceneEntryId || "default");
  if (owned) {
    unlockActiveVideo(meta);
    return;
  }
  openPayment({
    label: `Unlock "${video.title || scene.name}" video`,
    cost: Number(video.price ?? priceOf("unlockVideo", UNLOCK_VIDEO_COST)),
    run: () => unlockActiveVideo(meta),
  });
}

function resetBoundSceneVideoPlayer() {
  const video = els.boundSceneVideoPlayer;
  if (!video) return;
  try {
    video.pause();
  } catch {
    /* ignore */
  }
  video.removeAttribute("src");
  video.removeAttribute("poster");
  try {
    video.load();
  } catch {
    /* ignore */
  }
}

/** Bind the single preview <video> to exactly this scene's URL, or clear it. */
function applyBoundScenePreview(scene, bound) {
  resetBoundSceneVideoPlayer();
  if (!els.boundSceneVideoPanel) return;
  const url = bound?.entry?.videoUrl ? String(bound.entry.videoUrl).trim() : "";
  if (!url) {
    els.boundSceneVideoPanel.hidden = true;
    return;
  }
  els.boundSceneVideoPanel.hidden = false;
  els.boundSceneVideoPlayer.src = url;
  applyVideoAudio(els.boundSceneVideoPlayer);
}

function switchHomeVideoItem(direction) {
  const items = getHomeVideoItems();
  if (items.length <= 1) return;
  state.homeVideoIndex = (state.homeVideoIndex + direction + items.length) % items.length;
  state.homeSceneIndex = 0;
  renderHomeHero();
}

function switchHomeScene(direction) {
  const entries = getHomeSceneEntriesForActive();
  if (entries.length <= 1) return;
  state.homeSceneIndex = (state.homeSceneIndex + direction + entries.length) % entries.length;
  renderHomeHero();
}

function isSameVideoSrc(videoEl, url) {
  if (!videoEl || !url) return false;
  try {
    return videoEl.src === new URL(url, window.location.href).href;
  } catch {
    return videoEl.src === url;
  }
}

function homeCoverKey(item, sceneId = "") {
  if (!item?.id) return "";
  return `${item.id}::${sceneId || "home"}`;
}

function captureVideoFrame(videoEl, coverKey) {
  if (!coverKey || !videoEl) return false;
  if (state.frameCovers[coverKey]) return true;
  if (!videoEl.videoWidth || !videoEl.videoHeight) return false;
  try {
    const canvas = document.createElement("canvas");
    const w = Math.min(videoEl.videoWidth, 720);
    const ratio = videoEl.videoHeight / videoEl.videoWidth;
    canvas.width = w;
    canvas.height = Math.round(w * ratio);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.78);
    state.frameCovers[coverKey] = dataUrl;
    return true;
  } catch (error) {
    state.frameCoverFailures[coverKey] = String(error?.message || error || "tainted-canvas");
    return false;
  }
}

function getCoverForItem(item, sceneId = "") {
  if (!item) return "";
  return state.frameCovers?.[homeCoverKey(item, sceneId)] || "";
}

function homeSceneEntryForItem(item, sceneId) {
  if (!item || !sceneId) return null;
  const entry = item.homeSceneVideos?.[sceneId];
  const url = mediaUrlFromEntry(entry);
  return entry && url ? { ...entry, videoUrl: url } : null;
}

function enqueueHomeVideoPreload(item, sceneId, priority = 50) {
  const entry = homeSceneEntryForItem(item, sceneId);
  if (!item?.id || !sceneId || !entry?.videoUrl) return;
  const key = homeCoverKey(item, sceneId);
  if (state.videoPreloadSeen[key]) return;
  if (state.frameCovers[key] || state.frameCoverFailures[key]) return;
  state.videoPreloadSeen[key] = true;
  state.videoPreloadQueue.push({ item, sceneId, key, url: entry.videoUrl, priority });
  state.videoPreloadQueue.sort((a, b) => a.priority - b.priority);
}

function scheduleHomeVideoPreloads(activeItem = getActiveHomeVideoItem(), activeScene = state.currentScene) {
  const items = getHomeVideoItems();
  if (!items.length || !activeItem?.id) return;
  const scenesForItem = getHomeSceneEntriesForItem(activeItem);
  const activeItemIndex = items.findIndex((item) => item.id === activeItem.id);
  const activeSceneIndex = Math.max(0, scenesForItem.findIndex((entry) => entry.scene?.id === activeScene?.id));
  const sceneCount = Math.max(1, scenesForItem.length);
  const nextScene = scenesForItem[(activeSceneIndex + 1) % sceneCount]?.scene;
  const prevScene = scenesForItem[(activeSceneIndex - 1 + sceneCount) % sceneCount]?.scene;
  const nextItem = items[(activeItemIndex + 1 + items.length) % items.length];
  const prevItem = items[(activeItemIndex - 1 + items.length) % items.length];

  enqueueHomeVideoPreload(activeItem, nextScene?.id, 10);
  enqueueHomeVideoPreload(activeItem, prevScene?.id, 20);
  enqueueHomeVideoPreload(nextItem, "room", 30);
  enqueueHomeVideoPreload(prevItem, "room", 40);
  startHomeVideoPreloadWorker();
}

function idleDelay(ms = 800) {
  return new Promise((resolve) => {
    const run = () => window.setTimeout(resolve, ms);
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(run, { timeout: 1800 });
    } else {
      run();
    }
  });
}

function preloadVideoMetadata(url) {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      video.onloadedmetadata = null;
      video.onloadeddata = null;
      video.onerror = null;
      video.removeAttribute("src");
      try { video.load(); } catch {}
      video.remove();
      resolve();
    };
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.style.cssText = "position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;";
    video.onloadedmetadata = finish;
    video.onloadeddata = finish;
    video.onerror = finish;
    document.body.appendChild(video);
    window.setTimeout(finish, 5000);
    video.src = url;
  });
}

async function startHomeVideoPreloadWorker() {
  if (state.framePrewarmRunning) return;
  state.framePrewarmRunning = true;
  try {
    while (state.videoPreloadQueue.length) {
      const next = state.videoPreloadQueue.shift();
      await idleDelay(900);
      if (!next?.url || state.frameCovers[next.key]) continue;
      await preloadVideoMetadata(next.url);
    }
  } finally {
    state.framePrewarmRunning = false;
  }
}

function renderHomeHero() {
  const homeVideo = state.config?.homeVideo || {};
  const items = getHomeVideoItems();
  if (!state.homeVideo) {
    state.homeVideoIndex = 0;
    state.homeSceneIndex = 0;
  }
  const activeItem = getActiveHomeVideoItem() || {};
  const activeSceneBinding = getActiveHomeSceneEntry();
  const activeScene = activeSceneBinding?.scene || scenes[0];
  state.currentScene = activeScene;
  state.homeVideo = homeVideo;
  els.gameStage?.classList.add("is-home-mode");
  if (els.gameStage && activeScene?.id) els.gameStage.dataset.scene = activeScene.id;

  const cachedFrame = getCoverForItem(activeItem, activeScene?.id || "");
  // IMPORTANT: never fall back to `homeVideo.posterUrl` / `homeVideo.videoUrl`
  // here — those legacy fields hold the *active* item's media, so falling
  // back on them makes a character without its own video silently borrow
  // the active character's video, which looks like "all characters share
  // one video".
  const fallbackPoster =
    activeSceneBinding?.entry?.posterUrl ||
    activeItem.posterUrl ||
    activeItem.localImageUrl ||
    "./assets/admin/home/default-hero.jpg";
  const videoUrl = getActiveHomeSceneVideoUrl();

  const coverUrl = cachedFrame || fallbackPoster;

  if (els.homeHeroPoster) {
    if (coverUrl) {
      if (els.homeHeroPoster.src !== coverUrl) els.homeHeroPoster.src = coverUrl;
      els.homeHeroPoster.hidden = false;
    } else {
      els.homeHeroPoster.removeAttribute("src");
      els.homeHeroPoster.hidden = true;
    }
  }

  if (els.homeHeroVideo) {
    const video = els.homeHeroVideo;
    video.preload = state.homeHeroStarted ? "auto" : "metadata";
    video.onloadeddata = () => {
      if (els.homeHeroPoster) els.homeHeroPoster.hidden = true;
      captureVideoFrame(video, homeCoverKey(activeItem, activeScene?.id || ""));
      scheduleHomeVideoPreloads(activeItem, activeScene);
    };
    video.oncanplay = () => {
      state.homeHeroStarted = true;
      scheduleHomeVideoPreloads(activeItem, activeScene);
    };
    video.onerror = () => {
      video.hidden = true;
      if (els.homeHeroPoster) {
        if (cachedFrame) {
          els.homeHeroPoster.src = cachedFrame;
        } else if (fallbackPoster) {
          els.homeHeroPoster.src = fallbackPoster;
        }
        els.homeHeroPoster.hidden = false;
      }
    };

    if (videoUrl) {
      if (!isSameVideoSrc(video, videoUrl)) {
        video.src = videoUrl;
        video.load();
      }
      video.poster = coverUrl || "";
      applyVideoAudio(video);
      video.hidden = false;
      playVideo(video, { allowMutedFallback: true });
    } else {
      video.removeAttribute("src");
      video.hidden = true;
    }
  }

  if (els.sceneName) els.sceneName.textContent = activeScene?.name || activeItem.title || "Featured drama";
  if (els.avatarSource) els.avatarSource.textContent = activeScene?.name || activeItem.title || "Featured";
  if (els.avatarName) els.avatarName.textContent = activeItem.name || "Featured";
  if (els.sceneAssetRow) els.sceneAssetRow.hidden = Boolean(getHomeReferenceAssetUri());
  renderSceneHotspots(activeScene);

  const showArrows = getHomeSceneEntriesForActive().length > 1;
  if (els.prevHomeBtn) els.prevHomeBtn.hidden = !showArrows;
  if (els.nextHomeBtn) els.nextHomeBtn.hidden = !showArrows;
  if (els.nextRoleHintBtn) els.nextRoleHintBtn.hidden = items.length <= 1;
  renderIntimacy();
  renderUnlockButton();
  refreshIcons();
}

function applyCompanionColors(companion) {
  const [primary, secondary, accent, skin] = companion.colors;
  els.avatarModel.style.setProperty("--avatar-primary", primary);
  els.avatarModel.style.setProperty("--avatar-secondary", secondary);
  els.avatarModel.style.setProperty("--avatar-accent", accent);
  els.avatarModel.style.setProperty("--avatar-skin", skin);
}

function applyCompanionSprite(companion) {
  const sprite = companion.frames?.[state.rotationFrame] || companion.sprite;
  els.avatarModel.classList.toggle("is-portrait2d", companion.mode === "portrait2d");
  els.characterSprite.src = sprite;
  els.characterSprite.alt = `${companion.name} portrait`;
  if (state.vr?.active) syncVrWorldCompanions();
}

function selectCompanion(companion, options = {}) {
  state.selectedCompanion = companion;
  state.stats = { ...companion.stats };
  applyCompanionColors(companion);
  applyCompanionSprite(companion);
  renderStats();

  els.avatarSource.textContent = companion.source;
  els.avatarName.textContent = companion.name;
  els.avatarNamePlate.textContent = companion.name;
  els.avatarBio.textContent = companion.bio;

  if (options.referenceImage) {
    els.referenceOverlay.src = options.referenceImage;
    els.referenceOverlay.classList.add("ready");
  } else {
    els.referenceOverlay.removeAttribute("src");
    els.referenceOverlay.classList.remove("ready");
  }

  document.querySelectorAll(".preset-card").forEach((card) => {
    card.setAttribute("aria-pressed", String(card.dataset.companionId === companion.id));
  });
}

function selectScene(scene, options = {}) {
  state.currentScene = scene;
  els.gameStage.dataset.scene = scene.id;
  els.sceneName.textContent = scene.name;
  document.querySelectorAll(".scene-hotspot").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.sceneId === scene.id);
  });

  if (!options.silent) {
    updateJob("Scene switched", `${state.selectedCompanion.name} arrived at "${scene.name}".`, 0);
  }
}

function updateRotation(angle) {
  const normalized = (Number(angle) + 360) % 360;
  const frame = Math.round(normalized / 45) % 8;
  state.rotationFrame = frame;
  els.avatarModel.dataset.frame = String(frame);
  if (state.selectedCompanion.mode === "portrait2d") {
    const sway = Math.sin((normalized / 180) * Math.PI);
    els.avatarModel.style.setProperty("--portrait-x", `${Math.round(sway * 10)}px`);
    els.avatarModel.style.setProperty("--portrait-tilt", `${(sway * 1.4).toFixed(2)}deg`);
    els.avatarModel.style.setProperty("--portrait-scale", `${(1 + Math.abs(sway) * 0.012).toFixed(3)}`);
  } else {
    els.avatarModel.style.setProperty("--portrait-x", "0px");
    els.avatarModel.style.setProperty("--portrait-tilt", "0deg");
    els.avatarModel.style.setProperty("--portrait-scale", "1");
  }
  applyCompanionSprite(state.selectedCompanion);
  els.avatarModel.style.setProperty("--reference-tilt", `${frame * 18}deg`);
}

function updateRotationFrame(frame) {
  const nextFrame = ((Math.round(frame) % 8) + 8) % 8;
  updateRotation(nextFrame * 45);
}

function renderPresets() {
  els.presetGrid.innerHTML = "";
  companions.forEach((companion) => {
    const node = els.presetTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.companionId = companion.id;
    node.querySelector("strong").textContent = companion.name;
    node.querySelector("em").textContent = companion.title;
    const avatarImg = node.querySelector(".mini-avatar-img");
    avatarImg.src = companion.sprite;
    avatarImg.alt = `${companion.name} thumbnail`;
    node.style.setProperty("--avatar-primary", companion.colors[0]);
    node.setAttribute("aria-pressed", String(companion.id === state.selectedCompanion.id));
    node.addEventListener("click", () => {
      selectCompanion(companion);
      closeDialog(els.profileDialog);
      updateJob("Companion switched", `${companion.name} just moved into the suite. Build your bond from daily interactions.`, 0);
    });
    els.presetGrid.appendChild(node);
  });
}

function renderSceneHotspots(sceneOverride = null) {
  els.sceneOrbit.innerHTML = "";
  const scene = sceneOverride || getActiveHomeSceneEntry()?.scene || state.currentScene || scenes[0];
  getSceneEntries(scene).forEach((entry) => {
    const node = els.sceneHotspotTemplate.content.firstElementChild.cloneNode(true);
    const icon = node.querySelector(".short-card-media i") || node.querySelector("i");
    const label = entry.name || scene.shortName || scene.name;
    node.dataset.sceneId = scene.id;
    node.dataset.entryId = entry.id;
    node.title = label;
    node.setAttribute("aria-label", label);
    node.style.setProperty("--scene-card-image", `url("${scenePreviewImages[scene.id] || scenePreviewImages.room}")`);
    node.classList.add("is-active");
    icon.setAttribute("data-lucide", scene.icon || "video");
    node.querySelector(".short-card-copy strong").textContent = label;
    node.querySelector(".short-card-copy em").textContent = scene.shortName || scene.name;
    node.addEventListener("click", () => openDateDialog(scene, entry));
    els.sceneOrbit.appendChild(node);
  });
  refreshIcons();
}

function getSceneEntries(scene = {}) {
  const entries = Array.isArray(scene.entries) ? scene.entries.filter((entry) => entry?.enabled !== false) : [];
  if (entries.length) return entries;
  return [{ id: "default", name: scene.shortName || scene.name || "Default" }];
}

function renderScenePickerGrid() {
  if (!els.scenePickerGrid) return;
  els.scenePickerGrid.innerHTML = "";
  scenes.forEach((scene) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "scene-pick-card";
    card.dataset.sceneId = scene.id;
    if (scene.id === state.currentScene.id) card.classList.add("is-active");
    card.style.setProperty("--scene-pick-image", `url("${scenePreviewImages[scene.id] || scenePreviewImages.room}")`);
    const hasBound = Boolean(getSceneVideoForActive(scene.id));
    card.innerHTML = `
      <div class="scene-pick-thumb"><i data-lucide="${scene.icon || "video"}"></i></div>
      <div class="scene-pick-copy">
        <strong>${escapeHtmlSafe(scene.shortName || scene.name)}</strong>
        <em>${escapeHtmlSafe(scene.desc || scene.name)}</em>
        ${hasBound ? `<span class="scene-pick-badge"><i data-lucide="badge-check"></i>Default video</span>` : ""}
      </div>
    `;
    card.addEventListener("click", () => {
      closeDialog(els.scenePickerDialog);
      openDateDialog(scene);
    });
    els.scenePickerGrid.appendChild(card);
  });
  refreshIcons();
}

function escapeHtmlSafe(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function openScenePicker() {
  renderScenePickerGrid();
  if (els.scenePickerDialog) openDialog(els.scenePickerDialog);
}

function openDateDialog(scene, entry = null) {
  const sceneEntry = entry || getSceneEntries(scene)[0] || { id: "default", name: scene.shortName || scene.name };
  state.pendingScene = scene;
  state.pendingSceneEntry = sceneEntry;
  selectScene(scene, { silent: true });
  els.dateDialogTitle.textContent = sceneEntry.name || scene.name;
  els.dateDialogDesc.textContent = scene.shortName || scene.name;
  els.scenePreview.dataset.scene = scene.id;
  const savedPrompt = getSavedScenePromptForActive(scene.id);
  els.scenePrompt.value = savedPrompt;
  if (els.sceneAssetRow) els.sceneAssetRow.hidden = false;
  state.selectedScenePartnerId = "";

  if (els.scenePromptHint) {
    const def = String(scene.prompt || "").trim();
    if (def) {
      const teaser = def.length > 160 ? def.slice(0, 160) + "…" : def;
      els.scenePromptHint.textContent = savedPrompt ? "Default prompt loaded from this character and scene." : "Leave empty for default.";
    } else {
      els.scenePromptHint.textContent = savedPrompt ? "Default prompt loaded from this character and scene." : "Leave empty for default.";
    }
  }

  const bound = getSceneVideoForActive(scene.id);
  applyBoundScenePreview(scene, bound);
  if (bound) {
    els.boundSceneVideoNote.textContent = "Free preview.";
    els.sceneGenerateBtn.innerHTML = `<i data-lucide="wand-sparkles"></i>Generate my version · ${Number(scene.price || priceOf("dateVideo", DATE_VIDEO_COST))}`;
  } else {
    els.sceneGenerateBtn.innerHTML = `<i data-lucide="video"></i>Generate video · ${Number(scene.price || priceOf("dateVideo", DATE_VIDEO_COST))}`;
  }

  renderAssetLibrary();
  openDialog(els.dateDialog);
}

function openPayment(action) {
  if (!state.user) {
    state.pendingPayment = action;
    openLoginDialog();
    return;
  }

  closeGameDialogs();
  state.pendingPayment = action;
  els.payDialog.returnValue = "";

  const cost = Number(action.cost || 0);
  const canPay = state.credits >= cost;
  els.payTitle.textContent = canPay ? "Confirm credit spend" : "Not enough credits";
  els.payDetail.textContent = canPay
    ? `${action.label} costs ${cost} credits. Current balance: ${state.credits}.`
    : `${action.label} needs ${cost} credits but you only have ${state.credits}. Please create a USDT top-up order first.`;
  els.confirmPayBtn.innerHTML = canPay
    ? '<i data-lucide="check"></i>Confirm'
    : '<i data-lucide="plus"></i>Top up';

  refreshIcons();
  els.payDialog.showModal();
}

function handlePaymentClose() {
  if (els.payDialog.returnValue === "confirm") {
    runPendingPaymentAction();
    return;
  }
  if (!state.paymentRunning) {
    state.pendingPayment = null;
  }
}

function runPendingPaymentAction() {
  if (state.paymentRunning) return;
  const action = state.pendingPayment;
  if (!action) return;
  if (state.credits < action.cost) {
    state.pendingPayment = null;
    closeDialog(els.payDialog);
    openRechargeDialog();
    return;
  }

  state.paymentRunning = true;
  state.pendingPayment = null;
  closeDialog(els.payDialog);
  Promise.resolve()
    .then(() => action.run())
    .finally(() => {
      state.paymentRunning = false;
    });
}

function randomChoice(items) {
  return items[Math.floor(Math.random() * items.length)];
}

async function loadCharacterAssets() {
  try {
    const payload = await requestJson("/api/character-assets");
    const assets = payload.assets || {};
    companions.forEach((companion) => {
      if (assets[companion.id]?.assetUri) {
        companion.assetUri = assets[companion.id].assetUri;
      }
    });
  } catch (error) {
    console.warn("character assets unavailable", error);
  }
}

async function requestJson(url, options = {}) {
  const { auth, headers, ...fetchOptions } = options;
  const response = await fetch(url, {
    ...fetchOptions,
    headers: {
      "content-type": "application/json",
      ...(auth === false ? {} : authHeaders()),
      ...(headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.ok === false) {
    const error = new Error(payload.message || payload.detail || `Request failed: ${response.status}`);
    error.code = payload.code || "";
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

async function loadPublicConfig() {
  try {
    const payload = await requestJson("/api/config/public", { auth: false });
    state.config = payload.config || null;
    const configuredScenes = state.config?.scenes || [];
    configuredScenes.forEach((nextScene) => {
      const scene = scenes.find((item) => item.id === nextScene.id);
      if (scene) Object.assign(scene, nextScene);
    });
    els.wishGenerateBtn.innerHTML = `<i data-lucide="sparkles"></i>Generate · ${priceOf("meet", MEET_COST)}`;
    els.uploadGenerateBtn.innerHTML = `<i data-lucide="wand-sparkles"></i>Generate from photo · ${priceOf("photo", PHOTO_COST)}`;
    els.sceneGenerateBtn.innerHTML = `<i data-lucide="video"></i>Generate video · ${priceOf("dateVideo", DATE_VIDEO_COST)}`;
    renderHomeHero();
  } catch (error) {
    console.warn("public config unavailable", error);
  }
}

async function loadSession() {
  if (!state.authToken) {
    syncUser(null);
    return;
  }

  try {
    const payload = await requestJson("/api/auth/me");
    syncUser(payload.user || null);
    if (!payload.user) {
      localStorage.removeItem("raisingGameToken");
      state.authToken = "";
    }
  } catch (error) {
    localStorage.removeItem("raisingGameToken");
    state.authToken = "";
    syncUser(null);
  }
}

function renderAssetLibrary() {
  if (!els.userAssetList || !els.sceneAssetSelect) return;

  els.userAssetList.innerHTML = "";
  state.userAssets.forEach((asset) => {
    const chip = document.createElement("div");
    chip.className = "asset-chip-wrap";
    const button = document.createElement("button");
    button.className = "asset-chip";
    button.type = "button";
    button.setAttribute("aria-pressed", String(asset.id === state.selectedUserAssetId));
    button.innerHTML = `<img src="${asset.localUrl}" alt="${asset.name || "Asset"}" />`;
    button.addEventListener("click", () => {
      state.selectedUserAssetId = asset.id;
      renderAssetLibrary();
      updateJob("Asset selected", "This photo is selected.", 0);
    });
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "asset-delete-btn";
    deleteBtn.type = "button";
    deleteBtn.setAttribute("aria-label", `Delete ${asset.name || "asset"}`);
    deleteBtn.innerHTML = '<i data-lucide="x"></i>';
    deleteBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      deleteUserAsset(asset.id);
    });
    chip.append(button, deleteBtn);
    els.userAssetList.appendChild(chip);
  });

  const activeItem = getActiveHomeVideoItem();
  const currentId = String(activeItem?.id || "");
  const partnerChoices = state.myCharacters.filter((character) => String(character.id || "") !== currentId);

  els.sceneAssetSelect.innerHTML = '<option value="">No partner</option>';
  partnerChoices.forEach((character) => {
    const option = document.createElement("option");
    option.value = character.id;
    option.textContent = character.name || "My character";
    option.selected = character.id === state.selectedScenePartnerId;
    els.sceneAssetSelect.appendChild(option);
  });
}

async function deleteUserAsset(assetId) {
  if (!assetId) return;
  try {
    await requestJson(`/api/user-assets/${encodeURIComponent(assetId)}`, { method: "DELETE" });
    state.userAssets = state.userAssets.filter((asset) => asset.id !== assetId);
    if (state.selectedUserAssetId === assetId) {
      state.selectedUserAssetId = state.userAssets[0]?.id || "";
    }
    renderAssetLibrary();
    updateJob("Asset removed", "The upload is hidden from your library. Existing records stay archived.", 0);
  } catch (error) {
    updateJob("Remove failed", error.message || String(error), 0);
  }
}

async function loadUserAssets() {
  if (!state.user) {
    state.userAssets = [];
    renderAssetLibrary();
    return;
  }

  try {
    const payload = await requestJson("/api/user-assets");
    state.userAssets = payload.assets || [];
    renderAssetLibrary();
  } catch (error) {
    console.warn("user assets unavailable", error);
  }
}

async function loadMyCharacters() {
  if (!state.user) {
    state.myCharacters = [];
    renderCustomCharacterList();
    renderHomeHero();
    return;
  }
  try {
    const payload = await requestJson("/api/my/characters");
    state.myCharacters = (payload.characters || []).map((character) => ({
      ...character,
      ownerType: "user",
      posterUrl: character.posterUrl || "",
      videoUrl: character.videoUrl || "",
    }));
    renderCustomCharacterList();
    renderHomeHero();
  } catch (error) {
    console.warn("my characters unavailable", error);
  }
}

function renderCustomCharacterList() {
  if (!els.customCharacterList) return;
  els.customCharacterList.innerHTML = "";
  if (!state.myCharacters.length) {
    const empty = document.createElement("p");
    empty.className = "dialog-tip";
    empty.textContent = "No entries yet. Upload a full-body photo, enter a name, tap Save draft (free). Then use Main video on the card to spend credits — the home carousel only shows characters after the main video succeeds.";
    els.customCharacterList.appendChild(empty);
    return;
  }
  state.myCharacters.forEach((character) => {
    const card = document.createElement("div");
    card.className = "custom-character-card";
    const status = character.status || "unknown";
    const taskInfo = character.taskId ? ` · ${character.taskId.slice(0, 18)}` : "";
    card.innerHTML = `
      <img src="${character.posterUrl || "./assets/admin/home/default-hero.jpg"}" alt="${character.name}" />
      <div class="meta">
        <strong>${character.name || "My character"}</strong>
        <em>${character.title || ""} · ${status}${taskInfo}</em>
      </div>
      <div class="actions"></div>
    `;
    const actions = card.querySelector(".actions");
    const hasVideo = Boolean(String(character.videoUrl || "").trim());
    const st = String(character.status || "").toLowerCase();
    const canStartMain = !hasVideo && !character.taskId && (st === "draft" || st === "reference_failed" || st === "image_uploaded");

    if (hasVideo) {
      const playBtn = document.createElement("button");
      playBtn.type = "button";
      playBtn.innerHTML = '<i data-lucide="play"></i>Play';
      playBtn.addEventListener("click", () => {
        showVideoResult(character.videoUrl);
      });
      actions.appendChild(playBtn);

      const focusBtn = document.createElement("button");
      focusBtn.type = "button";
      focusBtn.innerHTML = '<i data-lucide="user-check"></i>Set as current';
      focusBtn.addEventListener("click", () => {
        const items = getHomeVideoItems();
        const index = items.findIndex((item) => item.id === character.id);
        if (index >= 0) state.homeVideoIndex = index;
        renderHomeHero();
        closeDialog(els.customCharacterDialog);
        updateJob("Switched to your character", `${character.name} is now the featured character. Tap any scene below to one-click generate.`, 0);
      });
      actions.appendChild(focusBtn);
    } else if (character.taskId) {
      const queryBtn = document.createElement("button");
      queryBtn.type = "button";
      queryBtn.innerHTML = '<i data-lucide="refresh-cw"></i>Refresh';
      queryBtn.addEventListener("click", () => pollMyCharacterMainOnce(character.id));
      actions.appendChild(queryBtn);
    } else if (canStartMain) {
      const cost = priceOf("customCharacter", 30);
      const startBtn = document.createElement("button");
      startBtn.type = "button";
      startBtn.disabled = state.startingMainVideoCharacterId === character.id;
      startBtn.innerHTML = `<i data-lucide="clapperboard"></i>Main video · ${cost}`;
      startBtn.addEventListener("click", () => startCustomCharacterMainVideo(character.id));
      actions.appendChild(startBtn);
    }

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "danger-action";
    deleteBtn.innerHTML = '<i data-lucide="trash-2"></i>Delete';
    deleteBtn.addEventListener("click", () => deleteMyCharacter(character.id));
    actions.appendChild(deleteBtn);

    els.customCharacterList.appendChild(card);
  });
  refreshIcons();
}

function setCustomCharacterStatus(text) {
  if (els.customCharacterStatus) els.customCharacterStatus.textContent = text || "";
}

async function deleteMyCharacter(characterId) {
  if (!characterId) return;
  try {
    await requestJson(`/api/my/characters/${encodeURIComponent(characterId)}`, { method: "DELETE" });
    state.myCharacters = state.myCharacters.filter((character) => character.id !== characterId);
    const activeItem = getActiveHomeVideoItem();
    if (activeItem?.id === characterId) {
      state.homeVideoIndex = 0;
      state.homeSceneIndex = 0;
    }
    renderCustomCharacterList();
    renderAssetLibrary();
    renderHomeHero();
    setCustomCharacterStatus("Character removed from your list. Generated files and task records stay archived.");
    updateJob("Character removed", "Hidden from your list and home carousel; records are kept safely.", 0);
  } catch (error) {
    setCustomCharacterStatus(error.message || String(error));
  }
}

function openCustomCharacterDialog() {
  if (!state.user) {
    state.pendingPayment = null;
    openLoginDialog();
    return;
  }
  state.customCharacterDataUrl = "";
  if (els.customCharacterPreview) {
    els.customCharacterPreview.removeAttribute("src");
    els.customCharacterPreview.classList.remove("ready");
  }
  if (els.customCharacterInput) els.customCharacterInput.value = "";
  if (els.customCharacterName) els.customCharacterName.value = "";
  if (els.customCharacterTitle) els.customCharacterTitle.value = "";
  setCustomCharacterStatus("");
  renderCustomCharacterList();
  if (els.customCharacterSaveDraftBtn) {
    els.customCharacterSaveDraftBtn.innerHTML = '<i data-lucide="save"></i>Save draft';
  }
  openDialog(els.customCharacterDialog);
}

function handleCustomCharacterUpload(event) {
  const [file] = event.target.files;
  if (!file) return;
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    state.customCharacterDataUrl = String(reader.result);
    if (els.customCharacterPreview) {
      els.customCharacterPreview.src = state.customCharacterDataUrl;
      els.customCharacterPreview.classList.add("ready");
    }
    setCustomCharacterStatus("Image selected. Enter a name, then tap Save draft (no charge).");
  });
  reader.readAsDataURL(file);
}

async function submitCustomCharacterSaveDraft() {
  if (!state.user) {
    openLoginDialog();
    return;
  }
  if (!state.customCharacterDataUrl) {
    setCustomCharacterStatus("Please upload a character photo first.");
    return;
  }
  const name = els.customCharacterName.value.trim();
  if (!name) {
    setCustomCharacterStatus("Please enter a name before saving draft.");
    return;
  }

  els.customCharacterSaveDraftBtn.disabled = true;
  setCustomCharacterStatus("Saving draft — no credits charged…");
  try {
    const payload = await requestJson("/api/my/characters/draft", {
      method: "POST",
      body: JSON.stringify({
        dataUrl: state.customCharacterDataUrl,
        name,
        title: els.customCharacterTitle.value.trim(),
      }),
    });
    await loadMyCharacters();
    setCustomCharacterStatus(
      `Draft saved: ${payload.character?.name || name}. Tap Main video on the card to spend credits. Progress appears here; the home carousel adds this character only after the video succeeds.`,
    );
    state.customCharacterDataUrl = "";
    if (els.customCharacterInput) els.customCharacterInput.value = "";
    if (els.customCharacterPreview) {
      els.customCharacterPreview.removeAttribute("src");
      els.customCharacterPreview.classList.remove("ready");
    }
  } catch (error) {
    setCustomCharacterStatus(error.message);
  } finally {
    els.customCharacterSaveDraftBtn.disabled = false;
    refreshIcons();
  }
}

async function startCustomCharacterMainVideo(characterId) {
  if (!state.user) {
    openLoginDialog();
    return;
  }
  if (!characterId) return;
  const cost = priceOf("customCharacter", 30);
  if (state.credits < cost) {
    setCustomCharacterStatus(`Not enough credits — needs ${cost}.`);
    openRechargeDialog();
    return;
  }
  if (state.startingMainVideoCharacterId) return;
  state.startingMainVideoCharacterId = characterId;
  renderCustomCharacterList();
  setCustomCharacterStatus("Starting main video — credits are charged only after the server accepts the task…");
  try {
    const payload = await requestJson(`/api/my/characters/${encodeURIComponent(characterId)}/start-main-video`, {
      method: "POST",
      body: JSON.stringify({ cost }),
    });
    if (payload.user) syncUser(payload.user);
    setCustomCharacterStatus(`Task ${payload.task?.taskId || ""} — main video generating. This line updates while the dialog is open.`);
    await loadMyCharacters();
    if (payload.task?.taskId) {
      pollMyCharacterMainTask(characterId, payload.task.taskId);
    }
  } catch (error) {
    setCustomCharacterStatus(error.message || String(error));
  } finally {
    state.startingMainVideoCharacterId = "";
    renderCustomCharacterList();
    refreshIcons();
  }
}

async function pollMyCharacterMainOnce(characterId) {
  try {
    const payload = await requestJson(`/api/my/characters/${encodeURIComponent(characterId)}/main-video`);
    state.myCharacters = state.myCharacters.map((entry) => (entry.id === characterId ? { ...entry, ...payload.character } : entry));
    renderCustomCharacterList();
    renderHomeHero();
    setCustomCharacterStatus(`"${payload.character?.name || ""}" status: ${payload.character?.status || "unknown"}`);
  } catch (error) {
    setCustomCharacterStatus(error.message);
  }
}

function pollMyCharacterMainTask(characterId, taskId) {
  if (!characterId || !taskId) return;
  if (state.customCharacterTimer) window.clearInterval(state.customCharacterTimer);
  let polling = false;
  const poll = async () => {
    if (polling) return;
    polling = true;
    try {
      const payload = await requestJson(`/api/my/characters/${encodeURIComponent(characterId)}/main-video`);
      const character = payload.character;
      state.myCharacters = state.myCharacters.map((entry) => (entry.id === characterId ? { ...entry, ...character } : entry));
      renderCustomCharacterList();
      renderHomeHero();
      const status = String(character?.status || "").toLowerCase();
      if (["succeeded", "success", "done", "completed"].includes(status)) {
        if (characterId && getIntimacy(characterId) === 0) bumpIntimacy(characterId, 2);
        setCustomCharacterStatus(`Main video completed — ${character?.name || ""} now appears on the home carousel.`);
      } else if (["failed", "error", "cancelled", "canceled"].includes(status)) {
        setCustomCharacterStatus(`Main video stopped: ${character?.status || "unknown"}${character?.error ? ` — ${character.error}` : ""}`);
      } else {
        setCustomCharacterStatus(`Main video progress: ${character?.status || "unknown"} · task ${character?.taskId ? String(character.taskId).slice(0, 14) : "—"}…`);
      }
      if (["succeeded", "success", "done", "completed", "failed", "error", "cancelled", "canceled"].includes(status)) {
        window.clearInterval(state.customCharacterTimer);
        state.customCharacterTimer = null;
      }
    } catch (error) {
      setCustomCharacterStatus(error.message);
    } finally {
      polling = false;
    }
  };
  poll();
  state.customCharacterTimer = window.setInterval(poll, 8000);
}

async function submitLogin() {
  const username = els.loginUsername.value.trim();
  const password = els.loginPassword.value;
  const endpoint = state.loginMode === "register" ? "/api/auth/register" : "/api/auth/login";

  try {
    const payload = await requestJson(endpoint, {
      method: "POST",
      auth: false,
      body: JSON.stringify({ username, password }),
    });
    state.authToken = payload.token;
    localStorage.setItem("raisingGameToken", state.authToken);
    syncUser(payload.user);
    closeDialog(els.loginDialog);
    await loadUnlocks();
    await loadUserAssets();
    await loadMyCharacters();
    updateJob(state.loginMode === "register" ? "Sign up succeeded" : "Signed in", `${payload.user.username} is now in.`, 0);
    if (state.pendingPayment) {
      openPayment(state.pendingPayment);
    }
  } catch (error) {
    updateJob("Sign in failed", error.message, 0);
  }
}

async function createRechargeOrder() {
  const amount = Number(els.rechargeAmount.value || 0);
  try {
    const payload = await requestJson("/api/pay/orders", {
      method: "POST",
      body: JSON.stringify({ amount }),
    });
    const order = payload.order;
    els.orderResult.innerHTML = [
      `<div class="order-pay-line"><span>Send</span> <strong>${order.payableAmountText || order.payableAmount} ${order.asset}</strong></div>`,
      `<div class="order-pay-line"><span>Suffix</span> <code>${order.suffix}</code></div>`,
      `<div class="order-pay-line"><span>Credits</span> <strong>${order.creditAmount ?? "—"}</strong> after paid</div>`,
    ].join("");
  } catch (error) {
    els.orderResult.textContent = error.message;
  }
}

async function spendCredits(cost, label) {
  const payload = await requestJson("/api/wallet/spend", {
    method: "POST",
    body: JSON.stringify({ cost, label }),
  });
  syncUser(payload.user);
  return payload;
}

function makeGeneratedCompanion(type) {
  const names = type === "photo"
    ? ["Her in the photo", "Mirror Mia", "Reference Vivian", "Private Natasha"]
    : ["Mia", "Natasha", "Camilla", "Isabella"];
  const prompt = els.characterPrompt.value;
  const promptText = prompt ? `Wish blended: "${prompt.slice(0, 28)}${prompt.length > 28 ? "..." : ""}"` : "Default mature evening date setting.";

  return {
    id: `${type}-${Date.now()}`,
    name: randomChoice(names),
    title: type === "photo" ? "Paid · Photo generated" : "Paid · AI meet",
    source: type === "photo" ? "Photo reference" : "AI meet",
    bio: `${promptText} 8-direction storyboard generated; rotate her 360 in the suite.`,
    colors: randomChoice(colorPalettes),
    sprite: randomChoice(outfitSprites),
    frames: randomChoice(companions.filter((item) => item.frames).map((item) => item.frames)),
    stats: { bond: 18, mood: 78, energy: 74 },
  };
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load character sheet"));
    image.src = src.startsWith("data:") ? src : `${src}${src.includes("?") ? "&" : "?"}t=${Date.now()}`;
  });
}

function colorDistanceSquared(a, b) {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}

function sampleCornerBackground(data, width, height) {
  const patch = Math.max(4, Math.min(18, Math.floor(Math.min(width, height) * 0.05)));
  const samples = [];
  const ranges = [
    [0, patch, 0, patch],
    [width - patch, width, 0, patch],
    [0, patch, height - patch, height],
    [width - patch, width, height - patch, height],
  ];

  ranges.forEach(([x0, x1, y0, y1]) => {
    let r = 0;
    let g = 0;
    let b = 0;
    let count = 0;
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const offset = (y * width + x) * 4;
        r += data[offset];
        g += data[offset + 1];
        b += data[offset + 2];
        count += 1;
      }
    }
    if (count) samples.push([r / count, g / count, b / count]);
  });

  return samples.reduce((best, sample) => {
    const score = samples.reduce((sum, other) => sum + colorDistanceSquared(sample, other), 0);
    return score < best.score ? { color: sample, score } : best;
  }, { color: samples[0] || [255, 255, 255], score: Infinity }).color;
}

function removeConnectedBackground(context, width, height) {
  const imageData = context.getImageData(0, 0, width, height);
  const { data } = imageData;
  const bg = sampleCornerBackground(data, width, height);
  const bgLightness = (bg[0] + bg[1] + bg[2]) / 3;
  const threshold = bgLightness > 220 ? 72 : 58;
  const thresholdSq = threshold * threshold;
  const visited = new Uint8Array(width * height);
  const queue = [];
  const isBackground = (x, y) => {
    const offset = (y * width + x) * 4;
    if (data[offset + 3] < 12) return true;
    return colorDistanceSquared([data[offset], data[offset + 1], data[offset + 2]], bg) <= thresholdSq;
  };
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const index = y * width + x;
    if (visited[index] || !isBackground(x, y)) return;
    visited[index] = 1;
    queue.push(index);
  };

  for (let x = 0; x < width; x += 1) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    push(0, y);
    push(width - 1, y);
  }

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const index = queue[cursor];
    const x = index % width;
    const y = Math.floor(index / width);
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }

  for (let index = 0; index < visited.length; index += 1) {
    if (!visited[index]) continue;
    data[index * 4 + 3] = 0;
  }
  context.putImageData(imageData, 0, 0);
}

function keepMainOpaqueRegion(context, width, height) {
  const imageData = context.getImageData(0, 0, width, height);
  const { data } = imageData;
  const visited = new Uint8Array(width * height);
  const components = [];
  const queue = [];
  const isOpaque = (index) => data[index * 4 + 3] > 18;

  for (let start = 0; start < visited.length; start += 1) {
    if (visited[start] || !isOpaque(start)) continue;
    let count = 0;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    const pixels = [];
    visited[start] = 1;
    queue.length = 0;
    queue.push(start);

    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const index = queue[cursor];
      const x = index % width;
      const y = Math.floor(index / width);
      pixels.push(index);
      count += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);

      const neighbors = [index + 1, index - 1, index + width, index - width];
      neighbors.forEach((next) => {
        if (next < 0 || next >= visited.length || visited[next] || !isOpaque(next)) return;
        const nx = next % width;
        if (Math.abs(nx - x) > 1) return;
        visited[next] = 1;
        queue.push(next);
      });
    }

    components.push({ count, minX, minY, maxX, maxY, pixels });
  }

  if (!components.length) return;
  components.sort((a, b) => b.count - a.count);
  const main = components[0];
  const keep = new Uint8Array(width * height);
  const pad = Math.round(Math.min(width, height) * 0.08);
  const expanded = {
    minX: Math.max(0, main.minX - pad),
    minY: Math.max(0, main.minY - pad),
    maxX: Math.min(width - 1, main.maxX + pad),
    maxY: Math.min(height - 1, main.maxY + pad),
  };

  components.forEach((component) => {
    const overlapsMain =
      component.maxX >= expanded.minX &&
      component.minX <= expanded.maxX &&
      component.maxY >= expanded.minY &&
      component.minY <= expanded.maxY;
    const largeEnough = component.count > main.count * 0.025;
    if (component === main || (overlapsMain && largeEnough)) {
      component.pixels.forEach((index) => {
        keep[index] = 1;
      });
    }
  });

  for (let index = 0; index < keep.length; index += 1) {
    if (!keep[index]) data[index * 4 + 3] = 0;
  }
  context.putImageData(imageData, 0, 0);
}

function getOpaqueBounds(context, width, height) {
  const { data } = context.getImageData(0, 0, width, height);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] <= 20) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) return null;
  const pad = Math.round(Math.min(width, height) * 0.018);
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(width - 1, maxX + pad);
  maxY = Math.min(height - 1, maxY + pad);
  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

function normalizeCharacterFrame(sourceCanvas, sourceContext, width, height) {
  keepMainOpaqueRegion(sourceContext, width, height);
  const bounds = getOpaqueBounds(sourceContext, width, height);
  const outputWidth = 768;
  const outputHeight = 1440;
  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = outputWidth;
  outputCanvas.height = outputHeight;
  const outputContext = outputCanvas.getContext("2d");
  outputContext.clearRect(0, 0, outputWidth, outputHeight);
  outputContext.imageSmoothingEnabled = true;
  outputContext.imageSmoothingQuality = "high";

  if (!bounds) return outputCanvas;

  const targetHeight = outputHeight * 0.972;
  const targetWidth = outputWidth * 0.94;
  const scale = Math.min(targetHeight / bounds.height, targetWidth / bounds.width);
  const drawWidth = bounds.width * scale;
  const drawHeight = bounds.height * scale;
  const drawX = (outputWidth - drawWidth) / 2;
  const drawY = outputHeight - drawHeight - 4;

  outputContext.drawImage(
    sourceCanvas,
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height,
    drawX,
    drawY,
    drawWidth,
    drawHeight,
  );
  return outputCanvas;
}

async function sliceSpriteSheet(sheetUrl) {
  const image = await loadImage(sheetUrl);
  const columns = 4;
  const rows = 2;
  const cellWidth = Math.floor(image.naturalWidth / columns);
  const cellHeight = Math.floor(image.naturalHeight / rows);
  const cellCanvas = document.createElement("canvas");
  cellCanvas.width = cellWidth;
  cellCanvas.height = cellHeight;
  const context = cellCanvas.getContext("2d");
  const frames = [];

  for (let index = 0; index < columns * rows; index += 1) {
    const sx = (index % columns) * cellWidth;
    const sy = Math.floor(index / columns) * cellHeight;
    context.clearRect(0, 0, cellWidth, cellHeight);
    context.drawImage(image, sx, sy, cellWidth, cellHeight, 0, 0, cellWidth, cellHeight);
    removeConnectedBackground(context, cellWidth, cellHeight);
    const normalized = normalizeCharacterFrame(cellCanvas, context, cellWidth, cellHeight);
    frames.push(normalized.toDataURL("image/png"));
  }

  return frames;
}

function pollCharacterImageTask(taskId, companion, requestId) {
  let attempts = 0;
  const poll = async () => {
    if (state.characterRequestId !== requestId) return;
    attempts += 1;
    try {
      const payload = await requestJson(`/api/character-image/${encodeURIComponent(taskId)}`);
      const status = String(payload.task?.status || "").toLowerCase();
      if (["completed", "succeeded", "success", "done"].includes(status) && payload.localSheetUrl) {
        const frames = await sliceSpriteSheet(payload.localSheetUrl);
        companion.frames = frames;
        companion.sprite = frames[0];
        window.clearInterval(state.characterTimer);
        companions.unshift(companion);
        renderPresets();
        selectCompanion(companion);
        updateRotationFrame(0);
        selectScene(scenes[0], { silent: true });
        closeDialog(els.photoDialog);
        updateJob("360 character ready", "Seedream output sliced into 8 frames — drag to view her front, side and back.", 100);
        return;
      }

      if (["failed", "error"].includes(status)) {
        window.clearInterval(state.characterTimer);
        updateJob("Character failed", payload.task?.error || "Seedream character task failed", 0);
        return;
      }
    } catch (error) {
      console.warn("character image poll failed", error.message);
    }

    if (attempts < 72 && state.characterRequestId === requestId) {
      window.setTimeout(poll, 5000);
    }
  };
  poll();
}

async function startCompanionJob(type) {
  window.clearInterval(state.characterTimer);
  const isPhoto = type === "photo";
  const requestId = Date.now();
  state.characterRequestId = requestId;
  const cost = isPhoto ? priceOf("photo", PHOTO_COST) : priceOf("meet", MEET_COST);
  try {
    await spendCredits(cost, isPhoto ? "Create from photo" : "Random AI meet");
  } catch (error) {
    updateJob("Spend failed", error.message, 0);
    return;
  }

  const generated = makeGeneratedCompanion(type);
  const steps = [
    "Sending the mature character brief to the apiz image pipeline.",
    "Generating 8-direction sheet: front, side, back and night-light variants.",
    "Processing into a rotatable portrait, preparing the suite.",
    "Adoption complete, refreshing the main scene.",
  ];
  let progress = 8;

  console.info("apiz character asset payload", {
    env: "APIZ_API_KEY",
    model: isPhoto
      ? "fal-ai/bytedance/seedream/v5/lite/edit"
      : "fal-ai/bytedance/seedream/v5/lite/text-to-image",
    source: isPhoto ? "photo_reference" : "text_prompt",
    prompt: els.characterPrompt.value.trim() ? els.characterPrompt.value : "adult virtual girlfriend, mature confident woman, elegant sensual non-nude evening outfit, overseas dating sim style, 8 direction character sheet",
  });

  requestJson("/api/character-image", {
    method: "POST",
    body: JSON.stringify({
      userAssetId: isPhoto ? state.selectedUserAssetId : "",
      prompt: els.characterPrompt.value,
    }),
  }).then((payload) => {
    console.info("apiz character task", payload);
    const taskId = payload.task?.task_id || payload.task?.taskId || payload.task?.id;
    if (taskId) pollCharacterImageTask(taskId, generated, requestId);
  }).catch((error) => {
    console.warn("apiz character task unavailable", error.message);
    window.clearInterval(state.characterTimer);
    updateJob("Submit failed", error.message, 0);
  });

  updateJob(isPhoto ? "Generating from photo" : "AI meet generating", "Submitting the Seedream character task and producing the 4×2 360 sheet.", progress);

  state.characterTimer = window.setInterval(() => {
    progress += randomChoice([8, 9, 10, 12]);
    const stepIndex = Math.min(Math.floor(progress / 30), steps.length - 1);
    updateJob("Creating companion", steps[stepIndex], progress);

    if (progress >= 100) {
      window.clearInterval(state.characterTimer);
      if (state.characterRequestId !== requestId) return;
      updateJob("Waiting for character", "Upstream generation submitted — waiting for the 4×2 sheet. We won't drop the raw image into the scene before it's ready.", 92);
    }
  }, 430);
}

async function startDateVideoJob(scene) {
  if (state.sceneSubmitting) return;
  state.sceneSubmitting = true;
  if (els.sceneGenerateBtn) els.sceneGenerateBtn.disabled = true;
  window.clearInterval(state.sceneTimer);
  const prompt = els.scenePrompt.value;
  const requestId = Date.now();
  state.sceneRequestId = requestId;
  const activeItem = getActiveHomeVideoItem();
  const sceneEntry = state.pendingSceneEntry || getSceneEntries(scene)[0] || { id: "default", name: scene.shortName || scene.name };

  selectScene(scene, { silent: true });

  const homeReferenceAssetUri = activeItem?.referenceAssetUri || getHomeReferenceAssetUri();
  const selectedPartnerId = state.selectedScenePartnerId || els.sceneAssetSelect.value || "";
  const submitDetail = selectedPartnerId
    ? `Preparing "${activeItem?.name || "this character"}" and partner for "${sceneEntry.name || scene.name}"...`
    : `Preparing "${activeItem?.name || "this character"}" for "${sceneEntry.name || scene.name}"...`;

  /* updateJob(
    "Submitting video task",
    `Preparing character reference and connecting to Seedance 2.0 for "${scene.name}" on ${activeItem?.name || "this character"}…`,
    10
  ); */
  closeDialog(els.dateDialog);
  updateJob("Submitting video task", submitDetail, 10);

  try {
    const created = await requestJson("/api/scene-video", {
      method: "POST",
      body: JSON.stringify({
        sceneId: scene.id,
        sceneName: scene.name,
        sceneEntryId: sceneEntry.id || "default",
        sceneEntryName: sceneEntry.name || scene.shortName || scene.name,
        companionId: activeItem?.id || state.selectedCompanion.id,
        companionName: activeItem?.name || state.selectedCompanion.name,
        // The backend will resolve referenceAssetUri from companionId via the
        // synthetic-reference pipeline. We still pass these as fallback hints
        // for cases where companionId is not in homeVideo.items / userCharacters.
        referenceAssetUri: homeReferenceAssetUri || state.selectedCompanion.assetUri || "",
        partnerCharacterId: selectedPartnerId,
        prompt,
        ratio: "9:16",
        resolution: "720p",
        duration: 15,
        quality: "high",
      }),
    });

    if (state.sceneRequestId !== requestId) return;

    const task = created.task || {};
    if (!task.taskId) {
      throw new Error("Backend didn't return a task id.");
    }

    if (created.user) syncUser(created.user);
    updateJob("Seedance submitted", `Task ${task.taskId.slice(0, 18)} is queued.`, 22);
    pollSceneVideoTask(task.taskId, scene, prompt, requestId, sceneEntry);
  } catch (error) {
    if (state.sceneRequestId !== requestId) return;
    let message = error.message || String(error);
    if (/REFERENCE_NOT_READY|REFERENCE_BUILD_FAILED|MISSING_REFERENCE_ASSET/i.test(message)) {
      message = "Character reference is still being prepared. Please try again shortly.";
    }
    updateJob("Submit failed", message, 0);
  } finally {
    state.sceneSubmitting = false;
    if (els.sceneGenerateBtn) els.sceneGenerateBtn.disabled = false;
    refreshIcons();
  }
}

async function startUserCharacterSceneJob(scene, character, requestId, prompt = "", entry = null) {
  const userPrompt = String(prompt || "");
  const sceneEntry = entry || state.pendingSceneEntry || getSceneEntries(scene)[0] || { id: "default", name: scene.shortName || scene.name };
  const promptHint = userPrompt.trim()
    ? `using your custom prompt (${userPrompt.length} chars)`
    : `using the scene's default prompt`;
  updateJob("Submitting video task", `Generating "${sceneEntry.name || scene.name}" for your character "${character.name}" ${promptHint}…`, 10);

  try {
    const created = await requestJson(`/api/my/characters/${encodeURIComponent(character.id)}/scene-video`, {
      method: "POST",
      body: JSON.stringify({
        sceneId: scene.id,
        sceneEntryId: sceneEntry.id || "default",
        sceneEntryName: sceneEntry.name || scene.shortName || scene.name,
        prompt: userPrompt,
      }),
    });
    if (state.sceneRequestId !== requestId) return;
    if (created.user) syncUser(created.user);

    const taskId = created.task?.taskId;
    if (!taskId) throw new Error("Backend didn't return a task id.");
    updateJob("Seedance submitted", `Task ${taskId.slice(0, 18)} is queued.`, 22);
    pollUserCharacterSceneTask(taskId, scene, character.id, requestId, sceneEntry);
  } catch (error) {
    if (state.sceneRequestId !== requestId) return;
    updateJob("Submit failed", error.message, 0);
  }
}

function pollUserCharacterSceneTask(taskId, scene, characterId, requestId, entry = null) {
  let progress = 26;
  let polling = false;
  let queryFailures = 0;

  const poll = async () => {
    if (polling || state.sceneRequestId !== requestId) return;
    polling = true;
    try {
      const result = await requestJson(`/api/my/scene-video/${encodeURIComponent(taskId)}`);
      const task = result.task || {};
      const status = String(task.status || "").toLowerCase();
      progress = Math.min(94, Number(task.progress) || progress + randomChoice([5, 6, 8]));

      if (["succeeded", "success", "done", "completed"].includes(status)) {
        window.clearInterval(state.sceneTimer);
        const playbackUrl = result.sceneVideo?.videoUrl || task.localVideoUrl || task.videoUrl || "";
        bumpStats({ bond: 4, mood: 6, energy: -5 });
        bumpIntimacy(characterId, 1);
        if (playbackUrl) showVideoResult(playbackUrl);
        await loadMyCharacters();
        const entryName = result.sceneVideo?.sceneEntryName || entry?.name || scene.name;
        updateJob(
          "Date video ready",
          playbackUrl ? `Video bound to "${result.character?.name || "your character"}" × "${entryName}". Opens above — loops until you close. Intimacy +1.` : `Task done — scene: ${entryName}. Intimacy +1.`,
          100,
        );
        return;
      }

      if (["failed", "error", "cancelled", "canceled"].includes(status)) {
        throw new Error(task.error || "Seedance task failed.");
      }

      queryFailures = 0;
      updateJob(status === "queued" ? "Seedance queued" : "Rendering date scene", `Scene: ${entry?.name || scene.name}; full-body long-leg drama prompt locked.`, progress);
    } catch (error) {
      queryFailures += 1;
      if (queryFailures < 5) {
        updateJob("Retrying query", `${error.message} — retry #${queryFailures}.`, progress);
      } else {
        window.clearInterval(state.sceneTimer);
        updateJob("Query failed", error.message, progress);
      }
    } finally {
      polling = false;
    }
  };

  poll();
  state.sceneTimer = window.setInterval(poll, 6000);
}

function pollSceneVideoTask(taskId, scene, prompt, requestId, entry = null) {
  let progress = 26;
  let polling = false;
  let queryFailures = 0;

  const poll = async () => {
    if (polling || state.sceneRequestId !== requestId) return;
    polling = true;

    try {
      const result = await requestJson(`/api/scene-video/${encodeURIComponent(taskId)}`);
      const task = result.task || {};
      const status = String(task.status || "").toLowerCase();
      progress = Math.min(94, Number(task.progress) || progress + randomChoice([5, 6, 8]));

      if (["succeeded", "success", "done", "completed"].includes(status)) {
        window.clearInterval(state.sceneTimer);
        const playbackUrl = task.localVideoUrl || task.videoUrl || "";
        bumpStats({ bond: 4, mood: 6, energy: -5 });
        const activeItem = getActiveHomeVideoItem();
        if (activeItem?.id) bumpIntimacy(activeItem.id, 1);
        if (playbackUrl) showVideoResult(playbackUrl);
        const entryName = entry?.name || scene.name;
        updateJob(
          "Date video ready",
          playbackUrl ? `Video saved — player opens above and loops. Scene: ${entryName}. Intimacy +1.` : `Task done — scene: ${entryName}. Intimacy +1.`,
          100,
        );
        if (task.remoteVideoUrl) console.info("Seedance remote video URL", task.remoteVideoUrl);
        return;
      }

      if (["failed", "error", "cancelled", "canceled"].includes(status)) {
        throw new Error(task.error || "Seedance task failed.");
      }

      queryFailures = 0;
      updateJob(status === "queued" ? "Seedance queued" : "Rendering date scene", `Scene: ${entry?.name || scene.name}; backend prompt locked.`, progress);
    } catch (error) {
      queryFailures += 1;
      if (queryFailures < 5) {
        updateJob("Retrying query", `${error.message} — retry #${queryFailures}.`, progress);
      } else {
        window.clearInterval(state.sceneTimer);
        updateJob("Query failed", error.message, progress);
      }
    } finally {
      polling = false;
    }
  };

  poll();
  state.sceneTimer = window.setInterval(poll, 5000);
}

function handleUpload(event) {
  if (!state.user) {
    event.target.value = "";
    openLoginDialog();
    return;
  }

  const [file] = event.target.files;
  if (!file) return;

  const reader = new FileReader();
  reader.addEventListener("load", async () => {
    state.uploadedDataUrl = String(reader.result);
    els.uploadPreview.src = state.uploadedDataUrl;
    els.uploadPreview.classList.add("ready");
    try {
      const payload = await requestJson("/api/user-assets", {
        method: "POST",
        body: JSON.stringify({ name: file.name, dataUrl: state.uploadedDataUrl }),
      });
      state.userAssets.unshift(payload.asset);
      state.selectedUserAssetId = payload.asset.id;
      renderAssetLibrary();
      updateJob(
        "Saved to library",
        "Nothing is generated yet — tap Generate from photo below and confirm payment for the 360° character. The full-screen home trailer is created in Custom character.",
        0,
      );
      els.uploadGenerateBtn?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    } catch (error) {
      updateJob("Asset save failed", error.message, 0);
    }
  });
  reader.readAsDataURL(file);
}

function handleChat() {
  const lines = [
    "She leans into the soft light and asks what you'd like to talk about tonight.",
    "You chat about the city lights and a film for a while — her mood lifts.",
    "She sets her glass down gently; bond ticks up just a little.",
  ];
  bumpStats({ bond: 2, mood: 3, energy: -2 });
  updateJob("Chat complete", randomChoice(lines), 0);
}

function handleOutfit() {
  state.outfitIndex = (state.outfitIndex + 1) % outfitSprites.length;
  const sprite = outfitSprites[state.outfitIndex];
  const companion = {
    ...state.selectedCompanion,
    sprite,
  };
  state.selectedCompanion = companion;
  applyCompanionSprite(companion);
  bumpStats({ mood: 2, energy: -1 });
  updateJob("Outfit changed", `${companion.name} switched into a look better suited to a night-out date — mood up.`, 0);
}

function handleDragStart(event) {
  if (event.target.closest("button, input, textarea, dialog")) return;
  unlockSoundAfterGesture();
  if (els.gameStage.classList.contains("is-home-mode")) {
    state.homeSwipeStartX = event.clientX;
    state.homeSwipeStartY = event.clientY;
    state.homeSwipeTracking = true;
    els.gameStage.setPointerCapture?.(event.pointerId);
    return;
  }
  state.dragging = true;
  state.dragStartX = event.clientX;
  state.dragStartFrame = state.rotationFrame;
  els.gameStage.classList.add("is-dragging");
  els.gameStage.setPointerCapture?.(event.pointerId);
}

function handleDragMove(event) {
  if (!state.dragging) return;
  const delta = event.clientX - state.dragStartX;
  const frameDelta = Math.round(delta / 36);
  updateRotationFrame(state.dragStartFrame - frameDelta);
}

function handleDragEnd(event) {
  if (state.homeSwipeTracking) {
    state.homeSwipeTracking = false;
    els.gameStage.releasePointerCapture?.(event.pointerId);
    const deltaX = event.clientX - state.homeSwipeStartX;
    const deltaY = event.clientY - state.homeSwipeStartY;
    if (Math.abs(deltaX) > 58 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2) {
      switchHomeScene(deltaX < 0 ? 1 : -1);
    } else if (Math.abs(deltaY) > 58 && Math.abs(deltaY) > Math.abs(deltaX) * 1.2) {
      switchHomeVideoItem(deltaY < 0 ? 1 : -1);
    }
    return;
  }
  if (!state.dragging) return;
  state.dragging = false;
  els.gameStage.classList.remove("is-dragging");
  els.gameStage.releasePointerCapture?.(event.pointerId);
}

function bindEvents() {
  if (state.eventsBound) return;
  state.eventsBound = true;
  bindVrEvents();
  document.addEventListener("click", unlockSoundAfterGesture, { capture: true });
  document.addEventListener("keydown", unlockSoundAfterGesture, { capture: true });

  els.topUpBtn.addEventListener("click", () => {
    openRechargeDialog();
  });
  els.soundToggleBtn?.addEventListener("click", () => {
    setSoundEnabled(!state.soundEnabled);
  });
  els.generationHistoryBtn?.addEventListener("click", openGenerationHistoryDialog);
  els.generationHistoryRefreshBtn?.addEventListener("click", loadGenerationHistory);
  els.welcomeStartBtn?.addEventListener("click", () => {
    closeDialog(els.welcomeDialog);
    playHomeHeroWithSound();
  });
  els.unlockVideoBtn?.addEventListener("click", handleUnlockVideoClick);
  els.userBtn?.addEventListener("click", () => {
    openLoginDialog(state.user ? "account" : "login");
  });

  els.customCharacterBtn?.addEventListener("click", openCustomCharacterDialog);
  els.customCharacterInput?.addEventListener("change", handleCustomCharacterUpload);
  els.customCharacterSaveDraftBtn?.addEventListener("click", submitCustomCharacterSaveDraft);

  els.openProfileBtn.addEventListener("click", () => openDialog(els.profileDialog));
  els.openWishBtn.addEventListener("click", () => openDialog(els.wishDialog));
  els.openPhotoBtn.addEventListener("click", () => {
    if (!state.user) return openLoginDialog();
    openDialog(els.photoDialog);
  });
  els.chatBtn.addEventListener("click", handleChat);
  els.outfitBtn.addEventListener("click", handleOutfit);

  els.meetBtn.addEventListener("click", () => {
    openPayment({
      label: "AI meet a companion",
      cost: priceOf("meet", MEET_COST),
      run: () => startCompanionJob("meet"),
    });
  });

  els.wishGenerateBtn.addEventListener("click", () => {
    openPayment({
      label: "Generate from your wish",
      cost: priceOf("meet", MEET_COST),
      run: () => startCompanionJob("meet"),
    });
  });

  els.saveWishBtn.addEventListener("click", () => {
    updateJob("Wish saved", "Tap the meet icon or the dialog's Generate button to use this mature setting.", 0);
  });

  els.uploadInput.addEventListener("change", handleUpload);

  els.uploadGenerateBtn.addEventListener("click", () => {
    if (!state.selectedUserAssetId) {
      updateJob("Upload a reference first", "Upload a photo, then you can start a paid generation.", 0);
      return;
    }

    openPayment({
      label: "Generate companion from photo",
      cost: priceOf("photo", PHOTO_COST),
      run: () => startCompanionJob("photo"),
    });
  });

  els.sceneGenerateBtn.addEventListener("click", () => {
    const scene = state.pendingScene;
    state.selectedScenePartnerId = els.sceneAssetSelect.value;
    if (!state.user) {
      state.pendingPayment = { label: "Generate date video", cost: Number(scene.price || priceOf("dateVideo", DATE_VIDEO_COST)), run: () => startDateVideoJob(scene) };
      openLoginDialog();
      return;
    }
    if (state.credits < Number(scene.price || priceOf("dateVideo", DATE_VIDEO_COST))) {
      openRechargeDialog();
      return;
    }
    startDateVideoJob(scene);
  });

  // `openDialog()` always calls `closeGameDialogs()` first — never clear the
  // bound-scene preview there, or the date dialog would wipe the <video> we
  // just configured. Clear only when this dialog actually closes.
  els.dateDialog?.addEventListener("close", () => {
    if (els.boundSceneVideoPanel) els.boundSceneVideoPanel.hidden = true;
    resetBoundSceneVideoPlayer();
  });

  els.sceneAssetSelect?.addEventListener("change", () => {
    state.selectedScenePartnerId = els.sceneAssetSelect.value;
    renderAssetLibrary();
  });

  els.toggleLoginModeBtn?.addEventListener("click", () => {
    state.loginMode = state.loginMode === "login" ? "register" : "login";
    renderLoginMode();
  });

  els.loginSubmitBtn?.addEventListener("click", submitLogin);
  els.createOrderBtn?.addEventListener("click", createRechargeOrder);
  els.confirmPayBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    runPendingPaymentAction();
  });

  els.copyWalletBtn?.addEventListener("click", async () => {
    const addr = els.staticWalletAddr?.textContent?.trim() || "";
    if (!addr) return;
    try {
      await navigator.clipboard.writeText(addr);
      updateJob("Copied", "Wallet address copied.", 0);
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = addr;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        updateJob("Copied", "Wallet address copied.", 0);
      } catch {
        updateJob("Copy failed", "Select the address and copy manually.", 0);
      }
    }
    refreshIcons();
  });

  els.videoDialog?.addEventListener("close", () => {
    try {
      els.resultVideo.pause();
    } catch {
      /* ignore */
    }
  });

  els.gameStage.addEventListener("pointerdown", handleDragStart);
  els.gameStage.addEventListener("pointermove", handleDragMove);
  els.gameStage.addEventListener("pointerup", handleDragEnd);
  els.gameStage.addEventListener("pointercancel", handleDragEnd);
  els.payDialog.addEventListener("close", handlePaymentClose);

  els.prevHomeBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    switchHomeScene(-1);
  });
  els.nextHomeBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    switchHomeScene(1);
  });
  els.nextRoleHintBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    switchHomeVideoItem(1);
  });

  els.openScenePickerBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    openScenePicker();
  });

  document.addEventListener("keydown", (event) => {
    if (event.target.closest("input, textarea, select, dialog[open]")) return;
    if (!els.gameStage?.classList.contains("is-home-mode")) return;
    if (event.key === "ArrowLeft") switchHomeScene(-1);
    else if (event.key === "ArrowRight") switchHomeScene(1);
    else if (event.key === "ArrowUp") switchHomeVideoItem(-1);
    else if (event.key === "ArrowDown") switchHomeVideoItem(1);
  });
}

function waitForHomeHeroReady(timeoutMs = 1800) {
  return new Promise((resolve) => {
    const poster = els.homeHeroPoster;
    const video = els.homeHeroVideo;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    const timer = setTimeout(finish, timeoutMs);
    const cleanupTimer = () => clearTimeout(timer);

    const posterReady = !poster?.src || poster.complete;
    const videoNeeded = video && !video.hidden && video.src && video.readyState < 2;

    if (posterReady && !videoNeeded) {
      cleanupTimer();
      finish();
      return;
    }

    let pending = 0;
    const tick = () => {
      pending -= 1;
      if (pending <= 0) {
        cleanupTimer();
        finish();
      }
    };

    if (poster && poster.src && !poster.complete) {
      pending += 1;
      poster.addEventListener("load", tick, { once: true });
      poster.addEventListener("error", tick, { once: true });
    }

    if (videoNeeded) {
      pending += 1;
      const onReady = () => tick();
      video.addEventListener("loadeddata", onReady, { once: true });
      video.addEventListener("error", onReady, { once: true });
      video.addEventListener("canplay", onReady, { once: true });
    }

    if (pending === 0) {
      cleanupTimer();
      finish();
    }
  });
}

function revealApp() {
  const body = document.body;
  if (!body.classList.contains("is-loading")) return;
  body.classList.remove("is-loading");
  setTimeout(() => {
    body.classList.add("app-ready");
  }, 360);
}

async function init() {
  try {
    state.intimacy = loadIntimacyMap();
    renderSoundToggle();
    bindEvents();
    await loadPublicConfig();
    await loadCharacterAssets();
    await loadSession();
    await loadUnlocks();
    await loadUserAssets();
    await loadMyCharacters();
    renderCredits();
    renderPresets();
    renderSceneHotspots();
    selectCompanion(state.selectedCompanion);
    selectScene(state.currentScene, { silent: true });
    renderHomeHero();
    updateRotation(0);
    syncAllVideoAudio();
    refreshIcons();
    await waitForHomeHeroReady();
    openWelcomeDialog();
  } catch (err) {
    console.error("[init] failed", err);
  } finally {
    revealApp();
  }
}

setTimeout(() => revealApp(), 8000);

init();
