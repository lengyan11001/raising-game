const http = require("node:http");
const crypto = require("node:crypto");
const fsSync = require("node:fs");
const fs = require("node:fs/promises");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { URL } = require("node:url");
const {
  dbEnabled,
  migrateFileDataToDb,
  getKv,
  setKv,
} = require("./db");

const ROOT = __dirname;

function loadLocalEnv(filePath) {
  if (!fsSync.existsSync(filePath)) return;
  const lines = fsSync.readFileSync(filePath, "utf8").split(/\r?\n/);
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const index = trimmed.indexOf("=");
    if (index < 1) return;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  });
}

loadLocalEnv(path.join(ROOT, ".env.local"));

const DATABASE_URL = process.env.DATABASE_URL || "";

const PORT = Number(process.env.PORT || 4174);
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, "");
const GENERATION_RECORDS_PATH = path.join(ROOT, "data", "generation-records.json");
const APP_DB_PATH = path.join(ROOT, "data", "app-db.json");
const APP_CONFIG_PATH = path.join(ROOT, "data", "app-config.json");
const USER_UPLOAD_DIR = path.join(ROOT, "assets", "user-uploads");
const ADMIN_HOME_DIR = path.join(ROOT, "assets", "admin", "home");
const GENERATED_VIDEO_DIR = path.join(ROOT, "assets", "generated", "videos");
const GENERATED_CHARACTER_DIR = path.join(ROOT, "assets", "generated", "characters", "apiz");
const GENERATED_PANORAMA_DIR = path.join(ROOT, "assets", "generated", "panoramas");
const ARK_BASE_URL = process.env.ARK_BASE_URL || "https://ark.ap-southeast.bytepluses.com/api/v3";
const ARK_API_KEY =
  process.env.ARK_API_KEY ||
  process.env.BYTEPLUS_ARK_API_KEY ||
  process.env.MODELARK_API_KEY ||
  "";

const MODEL_FAST =
  process.env.SEEDANCE_FAST_ENDPOINT_ID ||
  process.env.SEEDANCE_FAST_MODEL ||
  "dreamina-seedance-2-0-fast-260128";
const MODEL_QUALITY =
  process.env.SEEDANCE_ENDPOINT_ID ||
  process.env.SEEDANCE_MODEL ||
  "dreamina-seedance-2-0-260128";

const APIZ_BASE_URL = (process.env.APIZ_BASE_URL || "https://api.apiz.ai").replace(/\/+$/, "");
const APIZ_API_KEY = process.env.APIZ_API_KEY || process.env.XSKILL_API_KEY || "";
const APIZ_PRICING_CACHE_TTL_MS = 60 * 60 * 1000;
const apizPricingCache = new Map();
let apizModelListPricingCache = { expiresAt: 0, values: new Map() };
const DEFAULT_USDT_CNY_CENTS = clampNumber(process.env.USDT_CNY_CENTS || process.env.CNY_CENTS_PER_USDT, 720, 1, 100000);
const APIZ_SEEDREAM_IMAGE_SIZES = new Set([
  "auto_2K",
  "auto_3K",
  "square_hd",
  "square",
  "portrait_4_3",
  "portrait_16_9",
  "landscape_4_3",
  "landscape_16_9",
]);

const TOS = {
  accessKey: process.env.TOS_ACCESS_KEY_ID,
  secretKey: process.env.TOS_SECRET_ACCESS_KEY,
  endpoint: process.env.TOS_ENDPOINT,
  region: process.env.TOS_REGION,
  bucket: process.env.TOS_BUCKET,
  publicDomain: process.env.TOS_PUBLIC_DOMAIN,
};

const ARK_OPENAPI = {
  accessKey: process.env.BYTEPLUS_ACCESS_KEY_ID || process.env.VOLC_ACCESS_KEY_ID,
  secretKey: process.env.BYTEPLUS_SECRET_ACCESS_KEY || process.env.VOLC_ACCESS_KEY_SECRET,
  host: process.env.BYTEPLUS_OPENAPI_HOST || "ark.ap-southeast-1.byteplusapi.com",
  region: process.env.BYTEPLUS_OPENAPI_REGION || "ap-southeast-1",
  service: process.env.BYTEPLUS_OPENAPI_SERVICE || "ark",
  version: process.env.BYTEPLUS_OPENAPI_VERSION || "2024-01-01",
  groupId: process.env.BYTEPLUS_ASSET_GROUP_ID || "group-20260429190412-6lzgq",
  projectName: process.env.BYTEPLUS_PROJECT_NAME || "xin",
};

const demoTasks = new Map();

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".svg", "image/svg+xml"],
  [".mp4", "video/mp4"],
  [".webm", "video/webm"],
]);

const DEFAULT_DB = {
  users: [],
  sessions: [],
  walletOrders: [],
  creditLedger: [],
  userAssets: [],
  userCharacters: [],
  userUnlocks: [],
  adminHomeItems: [],
};

const FULL_BODY_LEG_DIRECTIVE = [
  "Framing: STRICT FULL-BODY HEAD-TO-SHOES SHOT every second. Vertical 9:16 portrait composition. NEVER crop above the knees. NEVER use upper-body-only or face close-up framing. Her entire body, including long elegant legs and shoes, must stay fully visible.",
  "Outfit: tasteful adult fashion that visually highlights long beautiful legs - short fitted dress, mini skirt, high-slit long dress with leg reveal, fitted leggings under cropped jacket, or thigh-high boots with short skirt. Fabric must be fully opaque, fully clothed, no nudity, no underwear shot, no see-through.",
  "Camera: prefer wide tracking, slow low-to-mid angle push-in, occasional gentle low-angle tilt that emphasizes long legs in a tasteful editorial way. 35mm photorealistic look, shallow depth of field, real motion, coherent face and hands.",
].join(" ");

const FULL_BODY_LEG_NEGATIVES = [
  "no half-body crop, no upper-body-only crop, no headshot, no close-up of face only,",
  "no nudity, no underwear visible, no explicit sexual action, no minors, no fetish content,",
  "no transparent clothing, no see-through fabric, no text, no logo, no watermark,",
  "no extra people, no distorted body, no duplicated face, no missing feet, no simple pan-only motion.",
].join(" ");

function decorateFullBodyLegPrompt(corePrompt, extraDirection = "") {
  const core = String(corePrompt || "").trim();
  const extra = String(extraDirection || "").trim();
  return [
    core,
    FULL_BODY_LEG_DIRECTIVE,
    extra ? `Reference direction: ${extra}` : "",
    `Negative constraints: ${FULL_BODY_LEG_NEGATIVES}`,
  ].filter(Boolean).join(" ");
}

const DEFAULT_ADMIN_HOME_ITEMS = [
  {
    id: "suite-seductive-demo",
    name: "Aria",
    title: "Rainy Suite",
    posterUrl: "/assets/admin/home/default-hero.jpg",
    localImageUrl: "/assets/admin/home/default-hero.jpg",
    sourceImageUrl: "/assets/admin/home/default-hero.jpg",
    imageMime: "image/jpeg",
    sourceImageMime: "image/jpeg",
    syntheticReferenceLocalUrl: "/assets/admin/home/default-hero.jpg",
    syntheticReferenceTaskId: "demo-seed",
    referenceAssetUri: "asset://asset-20260429190434-6plrk",
    videoUrl: "/assets/generated/videos/seductive-nonexplicit-cgt-20260502191234-jdb6s.mp4",
    localVideoUrl: "/assets/generated/videos/seductive-nonexplicit-cgt-20260502191234-jdb6s.mp4",
    taskId: "cgt-20260502191234-jdb6s",
    status: "succeeded",
    createdAt: "2026-05-02T11:17:48.000Z",
    sceneVideos: {},
  },
  {
    id: "pink-1777738973553-a9cfba",
    name: "Rose",
    title: "Morning Studio",
    posterUrl: "/assets/admin/home/pink-upload-synthetic-reference.png",
    localImageUrl: "/assets/admin/home/pink-upload-synthetic-reference.png",
    sourceImageUrl: "/assets/admin/home/pink-1777738973553-a9cfba.png",
    imageMime: "image/png",
    sourceImageMime: "image/png",
    referenceAssetUri: "",
    videoUrl: "",
    localVideoUrl: "",
    taskId: "",
    status: "draft",
    createdAt: "2026-05-03T13:54:33.753Z",
    sceneVideos: {},
  },
  {
    id: "demo-aria-vintage",
    name: "Mira",
    title: "Velvet Muse",
    posterUrl: "/assets/admin/home/demo-aria-reference.png",
    localImageUrl: "/assets/admin/home/demo-aria-reference.png",
    sourceImageUrl: "/assets/admin/home/demo-aria-reference.png",
    imageMime: "image/png",
    sourceImageMime: "image/png",
    syntheticReferenceLocalUrl: "/assets/admin/home/demo-aria-reference.png",
    syntheticReferenceTaskId: "demo-clean-frame",
    referenceAssetUri: "asset://asset-20260429190434-6plrk",
    videoUrl: "/assets/generated/videos/seductive-nonexplicit-cgt-20260502191234-jdb6s.mp4",
    localVideoUrl: "/assets/generated/videos/seductive-nonexplicit-cgt-20260502191234-jdb6s.mp4",
    taskId: "cgt-20260502191234-jdb6s",
    status: "succeeded",
    createdAt: "2026-05-02T11:17:48.000Z",
    sceneVideos: {},
  },
];

const DEFAULT_CONFIG = {
  defaultCompanionId: "aria",
  prices: {
    meet: 12,
    photo: 18,
    dateVideo: 25,
    customCharacter: 30,
    unlockVideo: 18,
  },
  wallet: {
    asset: "USDT",
    network: "TRC20",
    address: "TDqGn6PH4AmvzTwH77gopRGX2tyGBtpjFs",
    suffixDigits: 6,
    /** Credits use RMB cents, matching upstream billing points. 1 USDT -> CNY cents. */
    cnyCentsPerUsdt: DEFAULT_USDT_CNY_CENTS,
  },
  video: {
    ratio: "9:16",
    resolution: "720p",
    duration: 15,
    quality: "high",
    generateAudio: true,
  },
  platform: {
    brand: "Vipeak AI",
    heroTitle: "Create AI videos",
    heroSubtitle: "Choose a template, upload an image or enter text, and create a new video.",
    notice: "Generated results are saved in your history.",
    accessCopy:
      "POST /api/platform/generate\nAuthorization: Bearer <user-token>\nContent-Type: application/json\n\n{\"templateId\":\"template-id\",\"prompt\":\"...\",\"dataUrl\":\"data:image/png;base64,...\"}\n\nGET /api/generation-records\nGET /api/generation-records/<taskId>",
    categories: [
      { id: "featured", name: "精选模板" },
      { id: "i2v", name: "图生视频" },
      { id: "t2v", name: "文生视频" },
    ],
    advanced: {
      telegram: "",
      cases: [
        {
          id: "adv-soft-camera",
          title: "Soft Camera Move",
          category: "portrait",
          price: 25,
          coverUrl: "/assets/admin/home/demo-aria-reference.png",
          previewUrl: "",
          description: "A slow cinematic portrait movement with direct eye contact.",
          prompt: "A tasteful cinematic portrait video, soft light, slow camera push, confident expression, natural movement, premium fashion film style.",
          params: { ratio: "9:16", resolution: "720p", duration: 5 },
          enabled: true,
          sort: 0,
        },
      ],
    },
    templates: [
      {
        id: "angel-rise",
        title: "发条天使",
        category: "i2v",
        type: "image-to-video",
        coverUrl: "/assets/admin/home/demo-aria-reference.png",
        model: "bytedance/seedance-2.0/fast/image-to-video",
        badge: "Image to Video",
        prompt: "A cinematic vertical video where the uploaded character transforms into a radiant mechanical angel, glowing wings unfolding, dramatic clouds, golden light, slow heroic camera push, high detail, fantasy film style.",
        params: { aspect_ratio: "9:16", duration: "5", resolution: "720p" },
      },
      {
        id: "hero-rescue",
        title: "超级英雄救援",
        category: "i2v",
        type: "image-to-video",
        coverUrl: "/assets/admin/home/default-hero.jpg",
        model: "bytedance/seedance-2.0/fast/image-to-video",
        badge: "Hot",
        prompt: "Use the uploaded image as the main character reference. Create a dynamic superhero rescue video, urban basketball court, purple energy portal, dramatic action pose, cinematic camera shake, realistic motion, high contrast.",
        params: { aspect_ratio: "9:16", duration: "5", resolution: "720p" },
      },
      {
        id: "product-fire",
        title: "火力产品展示",
        category: "t2v",
        type: "text-to-video",
        coverUrl: "/assets/admin/home/pink-upload-synthetic-reference.png",
        model: "bytedance/seedance-2.0/fast/text-to-video",
        badge: "Text to Video",
        prompt: "A bold product commercial video with a glowing orange fire-powered object in a dark studio, sparks and smoke, dramatic hand gesture, premium advertisement lighting, slow orbit camera, cinematic energy.",
        params: { aspect_ratio: "16:9", duration: "5", resolution: "720p" },
      },
    ],
  },
  homeVideo: {
    provider: "seedance",
    posterUrl: "/assets/admin/home/default-hero.jpg",
    localImageUrl: "/assets/admin/home/default-hero.jpg",
    publicImageUrl: "",
    referenceAssetUri: "",
    videoUrl: "/assets/generated/videos/seductive-nonexplicit-cgt-20260502191234-jdb6s.mp4",
    taskId: "cgt-20260502191234-jdb6s",
    status: "succeeded",
    activeItemId: "demo-aria-vintage",
    items: [
      {
        id: "demo-aria-vintage",
        name: "Mira",
        title: "Velvet Muse",
        posterUrl: "/assets/admin/home/demo-aria-reference.png",
        localImageUrl: "/assets/admin/home/demo-aria-reference.png",
        sourceImageUrl: "/assets/admin/home/demo-aria-reference.png",
        imageMime: "image/png",
        sourceImageMime: "image/png",
        syntheticReferenceLocalUrl: "/assets/admin/home/demo-aria-reference.png",
        syntheticReferenceTaskId: "demo-clean-frame",
        referenceAssetUri: "asset://asset-20260429190434-6plrk",
        videoUrl: "/assets/generated/videos/seductive-nonexplicit-cgt-20260502191234-jdb6s.mp4",
        localVideoUrl: "/assets/generated/videos/seductive-nonexplicit-cgt-20260502191234-jdb6s.mp4",
        taskId: "cgt-20260502191234-jdb6s",
        status: "succeeded",
        createdAt: "2026-05-02T11:17:48.000Z",
        sceneVideos: {},
      },
    ],
    prompt: "",
  },
  ifilm: {
    cliPath: "ifilm",
    commandTemplate: "",
  },
  characterImage: {
    textModel: "fal-ai/bytedance/seedream/v5/lite/text-to-image",
    editModel: "fal-ai/bytedance/seedream/v5/lite/edit",
    imageSize: "1024x1536",
  },
  scenes: [
    {
      id: "room",
      name: "Suite Night",
      shortName: "Suite",
      icon: "bed-double",
      enabled: true,
      price: 25,
      entries: [{ id: "default", name: "Suite Night" }],
      prompt:
        "15-second photorealistic vertical cinematic full-body shot inside a luxurious modern apartment suite at night. Adult girlfriend in a tasteful short fitted dress or high-slit long dress, walking and turning slowly so her long legs stay visible the entire time, rain on the window, warm lamp light, teal and crimson highlights, slow tracking and low-to-mid angle camera, intimate but non-explicit mood.",
    },
    {
      id: "cafe",
      name: "Wine Lounge",
      shortName: "Lounge",
      icon: "martini",
      enabled: true,
      price: 25,
      entries: [{ id: "default", name: "Wine Lounge" }],
      prompt:
        "15-second photorealistic vertical cinematic full-body lounge date. Mature stylish woman in a high-slit red dress with long leg reveal walking past the bar, low jazz lighting, red wine glass, slow dolly camera framing her entire silhouette from head to heels, intimate eye contact, glossy reflections, premium overseas dating drama tone, non-explicit.",
    },
    {
      id: "park",
      name: "Neon Rooftop",
      shortName: "Rooftop",
      icon: "building-2",
      enabled: true,
      price: 25,
      entries: [{ id: "default", name: "Neon Rooftop" }],
      prompt:
        "15-second photorealistic vertical rooftop night full-body shot. Confident adult woman in a fitted mini dress or short skirt with thigh-high boots, neon city skyline behind her, breeze in hair and around her legs, slow walk and turn, low-angle wide camera that frames her full silhouette and long legs, cinematic teal and warm crimson palette, non-explicit.",
    },
    {
      id: "cinema",
      name: "Private Cinema",
      shortName: "Cinema",
      icon: "clapperboard",
      enabled: true,
      price: 25,
      entries: [{ id: "default", name: "Private Cinema" }],
      prompt:
        "15-second photorealistic vertical private cinema full-body shot. Elegant adult woman in a sleek short evening outfit walking down the aisle of a private theater, projector light streaks across her body, velvet seats around her, slow tracking camera that always shows her full body and long legs, intimate whispering mood, premium scene, non-explicit.",
    },
  ],
};

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(body);
}

function sendText(res, statusCode, body) {
  res.writeHead(statusCode, { "content-type": "text/plain; charset=utf-8" });
  res.end(body);
}

async function readJsonFile(filePath, fallback) {
  try {
    const data = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(data.replace(/^\uFEFF/, ""));
    if (Array.isArray(fallback)) return Array.isArray(parsed) ? parsed : fallback;
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch {
    return structuredClone(fallback);
  }
}

async function writeJsonFile(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

async function readDb() {
  const db = await getKv("app_db", DEFAULT_DB);
  return {
    users: Array.isArray(db.users) ? db.users : [],
    sessions: Array.isArray(db.sessions) ? db.sessions : [],
    walletOrders: Array.isArray(db.walletOrders) ? db.walletOrders : [],
    creditLedger: Array.isArray(db.creditLedger) ? db.creditLedger : [],
    userAssets: Array.isArray(db.userAssets) ? db.userAssets : [],
    userCharacters: Array.isArray(db.userCharacters) ? db.userCharacters : [],
    userUnlocks: Array.isArray(db.userUnlocks) ? db.userUnlocks : [],
    adminHomeItems: Array.isArray(db.adminHomeItems) ? db.adminHomeItems : [],
  };
}

function isSoftDeleted(record) {
  return Boolean(record?.deletedAt);
}

async function writeDb(db) {
  await setKv("app_db", db);
}

async function readAppConfig() {
  const saved = await getKv("app_config", DEFAULT_CONFIG);
  const bySceneId = new Map(DEFAULT_CONFIG.scenes.map((scene) => [scene.id, scene]));
  const scenes = Array.isArray(saved.scenes) ? saved.scenes : DEFAULT_CONFIG.scenes;
  const mergedHomeVideo = normalizeHomeVideo(seedSystemHomeVideoItems({ ...DEFAULT_CONFIG.homeVideo, ...(saved.homeVideo || {}) }));
  return {
    ...DEFAULT_CONFIG,
    ...saved,
    prices: { ...DEFAULT_CONFIG.prices, ...(saved.prices || {}) },
    wallet: { ...DEFAULT_CONFIG.wallet, ...(saved.wallet || {}) },
    video: { ...DEFAULT_CONFIG.video, ...(saved.video || {}), generateAudio: true },
    platform: normalizePlatformConfig(saved.platform || DEFAULT_CONFIG.platform),
    homeVideo: mergedHomeVideo,
    ifilm: { ...DEFAULT_CONFIG.ifilm, ...(saved.ifilm || {}) },
    characterImage: { ...DEFAULT_CONFIG.characterImage, ...(saved.characterImage || {}) },
    scenes: scenes.map((scene) => normalizeSceneConfig({ ...(bySceneId.get(scene.id) || {}), ...scene })),
  };
}

async function writeAppConfig(config) {
  await setKv("app_config", config);
}

async function ensureSceneEntriesPersisted(config) {
  const saved = await getKv("app_config", DEFAULT_CONFIG);
  const bySceneId = new Map(DEFAULT_CONFIG.scenes.map((scene) => [scene.id, scene]));
  const savedScenes = Array.isArray(saved.scenes) ? saved.scenes : DEFAULT_CONFIG.scenes;
  const nextScenes = savedScenes.map((scene) => normalizeSceneConfig({ ...(bySceneId.get(scene.id) || {}), ...scene }));
  const changed =
    savedScenes.some((scene) => !Array.isArray(scene.entries) || !scene.entries.length) ||
    JSON.stringify(nextScenes) !== JSON.stringify(savedScenes);
  if (!changed) return config;
  const nextConfig = { ...config, scenes: nextScenes, updatedAt: new Date().toISOString() };
  await writeAppConfig(nextConfig);
  return nextConfig;
}

function publicConfig(config) {
  const homeVideo = normalizeHomeVideo(config.homeVideo || {});
  return {
    defaultCompanionId: config.defaultCompanionId,
    prices: config.prices,
    wallet: {
      asset: config.wallet.asset,
      network: config.wallet.network,
      address: config.wallet.address,
      suffixDigits: config.wallet.suffixDigits,
      cnyCentsPerUsdt: walletCnyCentsPerUsdt(config.wallet),
    },
    video: config.video,
    homeVideo: {
      provider: homeVideo.provider || "seedance",
      posterUrl: homeVideo.posterUrl || "",
      videoUrl: homeVideo.videoUrl || "",
      taskId: homeVideo.taskId || "",
      status: homeVideo.status || "",
      referenceAssetUri: homeVideo.referenceAssetUri || "",
      activeItemId: homeVideo.activeItemId || "",
      items: homeVideo.items.map(publicHomeVideoItem),
    },
    platform: normalizePlatformConfig(config.platform || {}),
    characterImage: config.characterImage,
    scenes: config.scenes
      .filter((scene) => scene.enabled !== false)
      .map((scene) => {
        const { prompt, ...publicScene } = normalizeSceneConfig(scene);
        return publicScene;
      }),
  };
}

function normalizePlatformTemplate(template = {}, index = 0) {
  const fallbackId = `template-${index + 1}`;
  const type = String(template.type || "image-to-video").trim();
  const safeType = type === "text-to-video" ? "text-to-video" : "image-to-video";
  const id = String(template.id || fallbackId).trim().replace(/[^a-z0-9_-]/gi, "-").slice(0, 64) || fallbackId;
  const legacyParams = template.params && typeof template.params === "object" && !Array.isArray(template.params) ? template.params : {};
  const requestJson = template.requestJson && typeof template.requestJson === "object" && !Array.isArray(template.requestJson)
    ? template.requestJson
    : {
        model: resolvePlatformModelId(template.model, safeType),
        ...legacyParams,
        ...(typeof template.prompt === "string" && template.prompt ? { prompt: template.prompt } : {}),
        ...(typeof template.negativePrompt === "string" && template.negativePrompt ? { negative_prompt: template.negativePrompt } : {}),
      };
  const promptText = typeof template.prompt === "string" && template.prompt
    ? template.prompt
    : typeof requestJson.prompt === "string"
      ? requestJson.prompt
      : "";
  return {
    id,
    title: String(template.title || "Untitled template").trim().slice(0, 80) || "Untitled template",
    category: String(template.category || (safeType === "image-to-video" ? "i2v" : "t2v")).trim() || "featured",
    type: safeType,
    coverUrl: String(template.coverUrl || "").trim(),
    previewUrl: String(template.previewUrl || template.videoUrl || "").trim(),
    model: resolvePlatformModelId(template.model, safeType),
    badge: String(template.badge || "").trim().slice(0, 40),
    prompt: promptText,
    negativePrompt: typeof template.negativePrompt === "string" ? template.negativePrompt : "",
    params: legacyParams,
    requestJson,
    enabled: template.enabled !== false,
    sort: Number.isFinite(Number(template.sort)) ? Number(template.sort) : index,
  };
}

function normalizeAdvancedCase(item = {}, index = 0) {
  const fallbackId = `advanced-case-${index + 1}`;
  const params = item.params && typeof item.params === "object" && !Array.isArray(item.params) ? item.params : {};
  return {
    id: String(item.id || fallbackId).trim().replace(/[^a-z0-9_-]/gi, "-").slice(0, 64) || fallbackId,
    title: String(item.title || "Advanced case").trim().slice(0, 80) || "Advanced case",
    category: String(item.category || "advanced").trim().slice(0, 40) || "advanced",
    price: clampNumber(item.price, DEFAULT_CONFIG.prices.dateVideo, 0, 999999),
    coverUrl: String(item.coverUrl || "").trim(),
    previewUrl: String(item.previewUrl || "").trim(),
    description: String(item.description || "").trim().slice(0, 240),
    prompt: String(item.prompt || params.prompt || "").trim(),
    params,
    enabled: item.enabled !== false,
    sort: Number.isFinite(Number(item.sort)) ? Number(item.sort) : index,
  };
}

function normalizePlatformAdvancedConfig(advanced = {}) {
  const fallback = DEFAULT_CONFIG.platform?.advanced || {};
  const cases = Array.isArray(advanced.cases) ? advanced.cases : fallback.cases || [];
  return {
    ...fallback,
    ...advanced,
    telegram: String(advanced.telegram || fallback.telegram || "").trim(),
    cases: cases
      .map(normalizeAdvancedCase)
      .sort((a, b) => a.sort - b.sort),
  };
}

function cleanPlatformPublicCopy(value, fallback) {
  const text = String(value || "").trim();
  if (!text || /ap[i]z|upstream|admin|上游|后台|api\s*接入/i.test(text)) return String(fallback || "");
  return text;
}

function cleanPlatformHeroCopy(value, fallback) {
  const text = String(value || "").trim();
  if (!text || /[\u4e00-\u9fff]|template\s*plaza|模板广场|同款|same\s*style|ap[i]z|upstream|admin|上游|后台|api\s*接入/i.test(text)) {
    return String(fallback || "");
  }
  return text;
}

function resolvePlatformModelId(model, type = "image-to-video") {
  const raw = String(model || "").trim();
  const compact = raw.toLowerCase().replace(/[\s_-]+/g, "");
  if (["seedance20fast", "seedance2.0fast", "seedance20", "seedance2.0", "superseed2"].includes(compact)) {
    return "st-ai/super-seed2";
  }
  if (["seedance20fastdirect", "seedance20lite", "seedance2.0fastdirect", "seedance2.0lite", "superseed2lite"].includes(compact)) {
    return "st-ai/super-seed2-lite";
  }
  if (raw && raw !== "seedance") return raw;
  return type === "text-to-video"
    ? "bytedance/seedance-2.0/fast/text-to-video"
    : "bytedance/seedance-2.0/fast/image-to-video";
}

function isHiddenPlatformCategory(category = {}) {
  const value = `${category.id || ""} ${category.name || ""}`.toLowerCase();
  return value.includes("business") || value.includes("商业接入");
}

function normalizePlatformConfig(platform = {}) {
  const fallback = DEFAULT_CONFIG.platform || {};
  const categories = Array.isArray(platform.categories) ? platform.categories : fallback.categories || [];
  const templates = Array.isArray(platform.templates) ? platform.templates : fallback.templates || [];
  return {
    ...fallback,
    ...platform,
    brand: String(platform.brand || fallback.brand || "Vipeak AI"),
    heroTitle: cleanPlatformHeroCopy(platform.heroTitle, fallback.heroTitle || "Create AI videos"),
    heroSubtitle: cleanPlatformHeroCopy(platform.heroSubtitle, fallback.heroSubtitle || ""),
    notice: cleanPlatformHeroCopy(platform.notice, fallback.notice || ""),
    accessCopy: cleanPlatformPublicCopy(platform.accessCopy, fallback.accessCopy || ""),
    advanced: normalizePlatformAdvancedConfig(platform.advanced || fallback.advanced || {}),
    categories: categories
      .map((category, index) => ({
        id: String(category.id || `cat-${index + 1}`).trim().replace(/[^a-z0-9_-]/gi, "-") || `cat-${index + 1}`,
        name: String(category.name || category.id || `Category ${index + 1}`).trim(),
      }))
      .filter((category) => !isHiddenPlatformCategory(category)),
    templates: templates
      .map(normalizePlatformTemplate)
      .filter((template) => template.enabled !== false)
      .filter((template) => !isHiddenPlatformCategory({ id: template.category, name: template.category }))
      .sort((a, b) => a.sort - b.sort),
  };
}

function findPlatformTemplate(config, templateId) {
  const platform = normalizePlatformConfig(config.platform || {});
  return platform.templates.find((template) => template.id === String(templateId || "").trim()) || null;
}

function makeHomeVideoItemId() {
  return `home-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
}

function makeSceneEntryId() {
  return `entry-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
}

function normalizeSceneEntry(entry = {}, scene = {}) {
  const id = String(entry.id || "default").trim().replace(/[^a-z0-9_-]/gi, "-").slice(0, 48) || "default";
  const fallbackName = scene.shortName || scene.name || "Default";
  return {
    id,
    name: String(entry.name || fallbackName).trim().slice(0, 40) || fallbackName,
    enabled: entry.enabled !== false,
    createdAt: entry.createdAt || "",
    updatedAt: entry.updatedAt || "",
  };
}

function normalizeSceneEntries(scene = {}) {
  const entries = Array.isArray(scene.entries) ? scene.entries : [];
  const normalized = entries
    .map((entry) => normalizeSceneEntry(entry, scene))
    .filter((entry, index, list) => list.findIndex((item) => item.id === entry.id) === index);
  if (!normalized.length) {
    normalized.push(normalizeSceneEntry({
      id: "default",
      name: scene.shortName || scene.name || "Default",
    }, scene));
  }
  return normalized;
}

function normalizeSceneConfig(scene = {}) {
  return {
    ...scene,
    entries: normalizeSceneEntries(scene),
  };
}

function findSceneEntryConfig(scene = {}, entryId = "") {
  const entries = normalizeSceneEntries(scene);
  const requestedId = String(entryId || "").trim();
  return (
    entries.find((entry) => entry.id === requestedId && entry.enabled !== false) ||
    entries.find((entry) => entry.id === "default" && entry.enabled !== false) ||
    entries.find((entry) => entry.enabled !== false) ||
    entries[0] ||
    normalizeSceneEntry({ id: "default", name: scene.shortName || scene.name || "Default" }, scene)
  );
}

function makeSceneVideoKey(sceneId, sceneEntryId = "default") {
  const cleanSceneId = String(sceneId || "").trim();
  const cleanEntryId = String(sceneEntryId || "default").trim() || "default";
  return cleanEntryId === "default" ? cleanSceneId : `${cleanSceneId}__${cleanEntryId}`;
}

function sceneIdFromVideoKey(videoKey = "") {
  return String(videoKey || "").split("__")[0] || "";
}

function publicHomeVideoItem(item) {
  const hasSynth = Boolean(item.syntheticReferenceLocalUrl || item.syntheticReferenceUrl);
  const hasAsset = Boolean(item.referenceAssetUri);
  let referenceState = "missing";
  if (hasSynth && hasAsset) referenceState = "ready";
  else if (hasSynth) referenceState = "asset_pending";
  else if (item.status === "reference_failed") referenceState = "failed";
  else if (item.status === "image_uploaded") referenceState = "synth_pending";
  return {
    id: item.id || "",
    name: item.name || "Featured",
    title: item.title || "Featured drama",
    posterUrl: item.posterUrl || item.localImageUrl || "",
    videoUrl: item.videoUrl || item.localVideoUrl || "",
    taskId: item.taskId || "",
    status: item.status || "",
    referenceAssetUri: item.referenceAssetUri || "",
    referenceState,
    deletedAt: item.deletedAt || "",
    createdAt: item.createdAt || "",
    homeSceneVideos: publicSceneVideoMap(item.homeSceneVideos || {}),
    sceneVideos: publicSceneVideoMap(item.sceneVideos || {}),
    unlockVideos: publicUnlockVideoMap(item.unlockVideos || {}),
  };
}

function legacyHomeItem(homeVideo = {}) {
  return {
    id: homeVideo.activeItemId || "home-default",
    name: homeVideo.name || "Featured",
    title: homeVideo.title || "Featured drama",
    posterUrl: homeVideo.posterUrl || homeVideo.localImageUrl || "",
    localImageUrl: homeVideo.localImageUrl || homeVideo.posterUrl || "",
    imageMime: homeVideo.imageMime || "",
    publicImageUrl: homeVideo.publicImageUrl || "",
    referenceAssetUri: homeVideo.referenceAssetUri || "",
    videoUrl: homeVideo.videoUrl || homeVideo.localVideoUrl || "",
    localVideoUrl: homeVideo.localVideoUrl || homeVideo.videoUrl || "",
    remoteVideoUrl: homeVideo.remoteVideoUrl || "",
    localVideoPath: homeVideo.localVideoPath || "",
    taskId: homeVideo.taskId || "",
    status: homeVideo.status || "",
    prompt: homeVideo.prompt || "",
    createdAt: homeVideo.createdAt || "",
    updatedAt: homeVideo.updatedAt || "",
  };
}

function normalizeHomeVideo(homeVideo = {}) {
  const items = Array.isArray(homeVideo.items) ? homeVideo.items.filter(Boolean) : [];
  const normalized = (items.length ? items : [legacyHomeItem(homeVideo)].filter((item) => item.posterUrl || item.videoUrl))
    .filter((item) => !isSoftDeleted(item))
    .map((item) => ({
      ...item,
      homeSceneVideos: normalizeHomeSceneVideosForItem(item),
      sceneVideos: item.sceneVideos && typeof item.sceneVideos === "object" ? item.sceneVideos : {},
      unlockVideos: item.unlockVideos && typeof item.unlockVideos === "object" ? item.unlockVideos : {},
    }));
  const activeItemId = homeVideo.activeItemId || normalized[0]?.id || "";
  const active = normalized.find((item) => item.id === activeItemId) || normalized[0] || {};
  return {
    ...homeVideo,
    activeItemId: active.id || activeItemId,
    items: normalized,
    posterUrl: active.posterUrl || active.localImageUrl || homeVideo.posterUrl || "",
    localImageUrl: active.localImageUrl || active.posterUrl || homeVideo.localImageUrl || "",
    imageMime: active.imageMime || homeVideo.imageMime || "",
    publicImageUrl: active.publicImageUrl || homeVideo.publicImageUrl || "",
    referenceAssetUri: active.referenceAssetUri || homeVideo.referenceAssetUri || "",
    videoUrl: active.videoUrl || active.localVideoUrl || homeVideo.videoUrl || "",
    localVideoUrl: active.localVideoUrl || active.videoUrl || homeVideo.localVideoUrl || "",
    remoteVideoUrl: active.remoteVideoUrl || homeVideo.remoteVideoUrl || "",
    localVideoPath: active.localVideoPath || homeVideo.localVideoPath || "",
    taskId: active.taskId || homeVideo.taskId || "",
    status: active.status || homeVideo.status || "",
  };
}

function normalizeHomeSceneVideosForItem(item = {}) {
  const homeSceneVideos =
    item.homeSceneVideos && typeof item.homeSceneVideos === "object"
      ? { ...item.homeSceneVideos }
      : {};
  if (!homeSceneVideos.room) {
    const videoUrl = String(item.videoUrl || item.localVideoUrl || item.remoteVideoUrl || "").trim();
    const taskId = String(item.taskId || "").trim();
    if (videoUrl || taskId) {
      homeSceneVideos.room = {
        sceneId: "room",
        sceneName: "Suite Night",
        posterUrl: item.posterUrl || item.localImageUrl || "",
        prompt: item.prompt || "",
        finalPrompt: item.finalPrompt || item.prompt || "",
        referenceAssetUri: item.referenceAssetUri || "",
        model: item.model || MODEL_QUALITY,
        ratio: item.ratio || DEFAULT_CONFIG.video.ratio,
        resolution: item.resolution || DEFAULT_CONFIG.video.resolution,
        duration: item.duration || DEFAULT_CONFIG.video.duration,
        provider: item.provider || "seedance",
        taskId,
        status: item.status || "",
        videoUrl,
        localVideoUrl: item.localVideoUrl || "",
        localVideoPath: item.localVideoPath || "",
        remoteVideoUrl: item.remoteVideoUrl || "",
        createdAt: item.createdAt || "",
        updatedAt: item.updatedAt || item.createdAt || "",
        error: item.error || "",
        source: "legacy-home-video",
      };
    }
  }
  return homeSceneVideos;
}

function syncHomeVideoActiveFields(homeVideo = {}) {
  const normalized = normalizeHomeVideo(homeVideo);
  return normalized;
}

function findHomeVideoItem(homeVideo = {}, itemId = "") {
  const normalized = normalizeHomeVideo(homeVideo);
  if (itemId) return normalized.items.find((item) => item.id === itemId) || null;
  return normalized.items.find((item) => item.id === normalized.activeItemId) || normalized.items[0];
}

function normalizeUnlockVideo(entry = {}, videoKey = "") {
  if (!entry || typeof entry !== "object") return null;
  const sceneId = String(entry.sceneId || sceneIdFromVideoKey(videoKey) || "").trim();
  const videoUrl = String(entry.videoUrl || entry.localVideoUrl || entry.remoteVideoUrl || "").trim();
  const taskId = String(entry.taskId || "").trim();
  if (!sceneId || (!videoUrl && !taskId)) return null;
  return {
    ...entry,
    sceneId,
    sceneName: entry.sceneName || "",
    sceneEntryId: entry.sceneEntryId || "default",
    sceneEntryName: entry.sceneEntryName || "",
    title: String(entry.title || entry.sceneEntryName || entry.sceneName || "Unlocked video").trim(),
    price: clampNumber(entry.price, DEFAULT_CONFIG.prices.unlockVideo, 0, 9999),
    videoUrl,
    localVideoUrl: entry.localVideoUrl || "",
    remoteVideoUrl: entry.remoteVideoUrl || "",
    taskId,
    status: entry.status || "",
  };
}

function publicUnlockVideo(entry = {}, videoKey = "") {
  const normalized = normalizeUnlockVideo(entry, videoKey);
  if (!normalized) return null;
  return {
    sceneId: normalized.sceneId,
    sceneName: normalized.sceneName || "",
    sceneEntryId: normalized.sceneEntryId || "default",
    sceneEntryName: normalized.sceneEntryName || "",
    title: normalized.title || "Unlocked video",
    posterUrl: normalized.posterUrl || "",
    taskId: normalized.taskId || "",
    status: normalized.status || "",
    price: normalized.price,
    provider: normalized.provider || "seedance",
    updatedAt: normalized.updatedAt || "",
    createdAt: normalized.createdAt || "",
    error: normalized.error || "",
  };
}

function publicUnlockVideoMap(unlockVideos = {}) {
  if (!unlockVideos || typeof unlockVideos !== "object") return {};
  const out = {};
  Object.keys(unlockVideos).forEach((videoKey) => {
    const entry = publicUnlockVideo(unlockVideos[videoKey], videoKey);
    if (entry) out[videoKey] = entry;
  });
  Object.keys(out).forEach((videoKey) => {
    const entry = out[videoKey];
    if (entry.sceneEntryId === "default" && entry.sceneId && !out[entry.sceneId]) {
      out[entry.sceneId] = entry;
    }
  });
  return out;
}

function findUnlockVideoForItem(item = {}, sceneId = "", sceneEntryId = "") {
  const videos = item.unlockVideos && typeof item.unlockVideos === "object" ? item.unlockVideos : {};
  const requestedScene = String(sceneId || "").trim();
  const requestedEntry = String(sceneEntryId || "").trim();
  const exactKey = requestedEntry ? makeSceneVideoKey(requestedScene, requestedEntry) : requestedScene;
  const candidates = [
    exactKey,
    requestedScene,
    ...Object.keys(videos),
  ].filter(Boolean);
  for (const key of candidates) {
    const raw = videos[key];
    const entry = normalizeUnlockVideo(raw, key);
    if (!entry || entry.sceneId !== requestedScene) continue;
    if (requestedEntry && entry.sceneEntryId !== requestedEntry) continue;
    return { key, entry };
  }
  return null;
}

function makeUnlockRecordKey(itemId, sceneId, sceneEntryId = "default") {
  return [itemId, sceneId, sceneEntryId || "default"].map((part) => String(part || "").trim()).join("::");
}

function publicUserUnlock(record = {}) {
  return {
    id: record.id || "",
    itemId: record.itemId || "",
    itemName: record.itemName || "",
    sceneId: record.sceneId || "",
    sceneName: record.sceneName || "",
    sceneEntryId: record.sceneEntryId || "default",
    sceneEntryName: record.sceneEntryName || "",
    videoKey: record.videoKey || "",
    cost: Number(record.cost || 0),
    createdAt: record.createdAt || "",
  };
}

function findUserUnlock(db, userId, itemId, sceneId, sceneEntryId = "default") {
  const key = makeUnlockRecordKey(itemId, sceneId, sceneEntryId);
  return (db.userUnlocks || []).find((record) => {
    if (isSoftDeleted(record)) return false;
    if (record.userId !== userId) return false;
    const recordKey = makeUnlockRecordKey(record.itemId, record.sceneId, record.sceneEntryId || "default");
    return recordKey === key;
  }) || null;
}

const UNLOCK_STREAM_TTL_MS = 6 * 60 * 60 * 1000;

function unlockStreamSecret() {
  return process.env.UNLOCK_STREAM_SECRET || process.env.SESSION_SECRET || ARK_API_KEY || "raising-game-unlock-stream";
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlJson(value) {
  return base64UrlEncode(JSON.stringify(value));
}

function signUnlockStreamPayload(encodedPayload) {
  return crypto.createHmac("sha256", unlockStreamSecret()).update(encodedPayload).digest("base64url");
}

function makeUnlockStreamToken({ userId, itemId, sceneId, sceneEntryId = "default", videoKey = "" }) {
  const payload = base64UrlJson({
    userId,
    itemId,
    sceneId,
    sceneEntryId: sceneEntryId || "default",
    videoKey,
    exp: Date.now() + UNLOCK_STREAM_TTL_MS,
  });
  return `${payload}.${signUnlockStreamPayload(payload)}`;
}

function parseUnlockStreamToken(token = "") {
  const [payload, signature] = String(token || "").split(".");
  if (!payload || !signature) return null;
  const expected = signUnlockStreamPayload(payload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!decoded || Number(decoded.exp || 0) < Date.now()) return null;
    return decoded;
  } catch {
    return null;
  }
}

function getUnlockVideoUrl(entry = {}) {
  return String(entry.videoUrl || entry.localVideoUrl || entry.remoteVideoUrl || "").trim();
}

function secureUnlockVideoUrl({ userId, itemId, sceneId, sceneEntryId = "default", videoKey = "" }) {
  const token = makeUnlockStreamToken({ userId, itemId, sceneId, sceneEntryId, videoKey });
  return `/api/unlock-video/stream/${encodeURIComponent(token)}`;
}

function normalizePublicAssetPath(value = "") {
  const clean = String(value || "").split("?")[0].trim();
  if (!clean || /^https?:\/\//i.test(clean)) return "";
  return `/${clean.replace(/^\/+/, "")}`;
}

async function isProtectedUnlockAssetPath(publicPath = "") {
  const normalizedPath = normalizePublicAssetPath(publicPath);
  if (!normalizedPath.startsWith("/assets/generated/videos/")) return false;
  const config = await readAppConfig();
  const homeVideo = normalizeHomeVideo(config.homeVideo || {});
  return (homeVideo.items || []).some((item) => {
    const unlockVideos = item.unlockVideos && typeof item.unlockVideos === "object" ? item.unlockVideos : {};
    return Object.values(unlockVideos).some((entry) => {
      const localVideoPath = normalizePublicAssetPath(entry?.videoUrl || entry?.localVideoUrl || "");
      return localVideoPath && localVideoPath === normalizedPath;
    });
  });
}

function upsertHomeVideoItem(homeVideo = {}, item) {
  const normalized = normalizeHomeVideo(homeVideo);
  const items = normalized.items.filter((next) => next.id !== item.id);
  items.unshift(item);
  return syncHomeVideoActiveFields({ ...normalized, activeItemId: item.id, items });
}

function replaceHomeVideoItem(homeVideo = {}, item) {
  const normalized = normalizeHomeVideo(homeVideo);
  let found = false;
  const items = normalized.items.map((next) => {
    if (next.id !== item.id) return next;
    found = true;
    return { ...next, ...item };
  });
  return syncHomeVideoActiveFields(found ? { ...normalized, items } : normalized);
}

function seedSystemHomeVideoItems(homeVideo = {}) {
  const normalized = normalizeHomeVideo(homeVideo);
  const byId = new Map((normalized.items || []).map((item) => [item.id, item]));
  for (const item of DEFAULT_ADMIN_HOME_ITEMS) {
    if (!byId.has(item.id)) {
      byId.set(item.id, structuredClone(item));
    }
  }
  return {
    ...normalized,
    items: Array.from(byId.values()),
  };
}

function userView(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    role: user.role || "user",
    credits: Number(user.credits || 0),
    advancedAccess: user.advancedAccess === true,
    advancedAccessRequestedAt: user.advancedAccessRequestedAt || "",
    createdAt: user.createdAt,
  };
}

function creditsAmount(value, fallback = 0) {
  const next = Number(value);
  if (!Number.isFinite(next)) return Math.max(0, Math.round(Number(fallback || 0) * 10000) / 10000);
  return Math.max(0, Math.round(next * 10000) / 10000);
}

function positiveCreditsOrNull(value) {
  const next = Number(value);
  if (!Number.isFinite(next) || next <= 0) return null;
  return creditsAmount(next);
}

function insufficientCreditsMessage(cost, credits) {
  const need = creditsAmount(cost);
  const current = creditsAmount(credits);
  return `Not enough credits. This generation needs ${need} credits; your balance is ${current}. Please top up and try again.`;
}

function insufficientCreditsPayload(cost, credits, extra = {}) {
  return {
    ok: false,
    code: "INSUFFICIENT_CREDITS",
    message: insufficientCreditsMessage(cost, credits),
    cost: creditsAmount(cost),
    credits: creditsAmount(credits),
    ...extra,
  };
}

function appendCreditLedger(db, user, delta, type, meta = {}) {
  if (!db || !user) return null;
  const amount = Math.round(Number(delta || 0) * 10000) / 10000;
  if (!Number.isFinite(amount) || amount === 0) return null;
  db.creditLedger = Array.isArray(db.creditLedger) ? db.creditLedger : [];
  const record = {
    id: randomId("ledger"),
    userId: user.id,
    username: user.username || "",
    delta: amount,
    balanceAfter: creditsAmount(user.credits),
    type,
    meta,
    createdAt: new Date().toISOString(),
  };
  db.creditLedger.unshift(record);
  db.creditLedger = db.creditLedger.slice(0, 1000);
  return record;
}

function changeUserCredits(db, userId, delta, type, meta = {}) {
  const user = (db.users || []).find((entry) => entry.id === userId);
  if (!user) {
    const error = new Error("User not found for billing.");
    error.statusCode = 404;
    throw error;
  }
  const amount = Math.round(Number(delta || 0) * 10000) / 10000;
  if (!Number.isFinite(amount)) {
    const error = new Error("Invalid credit amount.");
    error.statusCode = 400;
    throw error;
  }
  const rawNext = Number(user.credits || 0) + amount;
  if (rawNext < -0.0001) {
    const error = new Error(insufficientCreditsMessage(-amount, user.credits));
    error.statusCode = 402;
    error.code = "INSUFFICIENT_CREDITS";
    error.credits = creditsAmount(user.credits);
    error.cost = creditsAmount(-amount);
    throw error;
  }
  user.credits = creditsAmount(rawNext);
  user.updatedAt = new Date().toISOString();
  appendCreditLedger(db, user, amount, type, meta);
  return user;
}

function randomId(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(String(password), salt, 120000, 32, "sha256").toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, expected] = String(stored || "").split(":");
  if (!salt || !expected) return false;
  const actual = hashPassword(password, salt).split(":")[1];
  return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

function getBearerToken(req) {
  const auth = req.headers.authorization || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

async function getAuth(req) {
  const token = getBearerToken(req);
  if (!token) return { db: await readDb(), user: null, session: null };
  const db = await readDb();
  const session = db.sessions.find((item) => item.token === token);
  if (!session) return { db, user: null, session: null };
  const user = db.users.find((item) => item.id === session.userId) || null;
  return { db, user, session };
}

async function requireUser(req, res) {
  const auth = await getAuth(req);
  if (!auth.user) {
    sendJson(res, 401, { ok: false, code: "LOGIN_REQUIRED", message: "Please sign in to continue." });
    return null;
  }
  return auth;
}

async function requireAdmin(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return null;
  if (auth.user.role !== "admin") {
    sendJson(res, 403, { ok: false, code: "ADMIN_REQUIRED", message: "需要管理员权限。" });
    return null;
  }
  return auth;
}

function makeUniquePaymentAmount(baseAmount, suffixDigits) {
  const amount = Math.max(1, Math.round(Number(baseAmount || 0)));
  const max = 10 ** suffixDigits;
  const suffixNumber = crypto.randomInt(1, max);
  const suffix = String(suffixNumber).padStart(suffixDigits, "0");
  const payableAmountText = `${amount}.${suffix}`;
  const payableAmount = Number(payableAmountText);
  return { amount, suffix, payableAmount, payableAmountText };
}

function walletCnyCentsPerUsdt(wallet = {}) {
  const explicit = wallet.cnyCentsPerUsdt ?? wallet.usdtCnyCents;
  if (explicit !== undefined && explicit !== null && explicit !== "") {
    return clampNumber(explicit, DEFAULT_USDT_CNY_CENTS, 1, 100000);
  }
  const legacy = Number(wallet.creditsPerUsdt);
  return Number.isFinite(legacy) && legacy >= 100
    ? clampNumber(legacy, DEFAULT_USDT_CNY_CENTS, 1, 100000)
    : DEFAULT_USDT_CNY_CENTS;
}

function walletCreditsForUsdtAmount(amount, wallet = {}) {
  return creditsAmount(Math.round(Number(amount || 0) * walletCnyCentsPerUsdt(wallet)));
}

function decodeDataUrl(dataUrl) {
  const match = String(dataUrl || "").match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,([a-z0-9+/=]+)$/i);
  if (!match) {
    const error = new Error("Only PNG/JPG/WebP images are supported.");
    error.statusCode = 400;
    throw error;
  }
  return {
    mime: match[1].replace("image/jpg", "image/jpeg"),
    bytes: Buffer.from(match[2], "base64"),
  };
}

function decodeImageDataUrl(dataUrl) {
  return decodeDataUrl(dataUrl);
}

function imageExtFromMime(mime) {
  if (mime === "image/png") return ".png";
  if (mime === "image/webp") return ".webp";
  return ".jpg";
}

function imageMimeFromPath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

function execFileJson(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: 120000, windowsHide: true, ...options }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      const text = String(stdout || "").trim();
      try {
        resolve(text ? JSON.parse(text) : {});
      } catch {
        resolve({ text, stderr: String(stderr || "") });
      }
    });
  });
}

function findSceneConfig(config, sceneId) {
  return config.scenes.find((scene) => scene.id === sceneId) || config.scenes[0] || DEFAULT_CONFIG.scenes[0];
}

function publicSceneVideo(entry = {}) {
  if (!entry || typeof entry !== "object") return null;
  const videoUrl = entry.videoUrl || entry.localVideoUrl || entry.remoteVideoUrl || "";
  const savedPrompt = String(entry.userPrompt || "").trim();
  if (!videoUrl && !entry.taskId && !savedPrompt) return null;
  return {
    sceneId: entry.sceneId || "",
    sceneName: entry.sceneName || "",
    videoUrl,
    posterUrl: entry.posterUrl || "",
    taskId: entry.taskId || "",
    status: entry.status || "",
    sceneEntryId: entry.sceneEntryId || "default",
    sceneEntryName: entry.sceneEntryName || "",
    referenceAssetUri: entry.referenceAssetUri || "",
    partnerCharacterId: entry.partnerCharacterId || "",
    partnerCharacterName: entry.partnerCharacterName || "",
    partnerReferenceAssetUri: entry.partnerReferenceAssetUri || "",
    savedPrompt,
    userPrompt: savedPrompt,
    model: entry.model || "",
    ratio: entry.ratio || "",
    resolution: entry.resolution || "",
    duration: entry.duration || 0,
    provider: entry.provider || "seedance",
    updatedAt: entry.updatedAt || "",
    createdAt: entry.createdAt || "",
    error: entry.error || "",
  };
}

function publicSceneVideoMap(sceneVideos = {}) {
  if (!sceneVideos || typeof sceneVideos !== "object") return {};
  const out = {};
  Object.keys(sceneVideos).forEach((videoKey) => {
    const rawEntry = sceneVideos[videoKey] || {};
    const sceneId = rawEntry.sceneId || sceneIdFromVideoKey(videoKey);
    const entry = publicSceneVideo({ ...rawEntry, sceneId });
    if (entry) out[videoKey] = entry;
  });
  Object.keys(out).forEach((videoKey) => {
    const entry = out[videoKey];
    if (entry.sceneEntryId === "default" && entry.sceneId && !out[entry.sceneId]) {
      out[entry.sceneId] = entry;
    }
  });
  return out;
}

function requireValue(label, value) {
  if (!value) {
    const error = new Error(`Missing ${label}`);
    error.statusCode = 503;
    throw error;
  }
}

function sha256Hex(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function hmac(key, data, encoding) {
  return crypto.createHmac("sha256", key).update(data).digest(encoding);
}

function signKey(secret, date, region, service) {
  return hmac(hmac(hmac(hmac(secret, date), region), service), "request");
}

function amzDate() {
  const value = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { xDate: value, date: value.slice(0, 8) };
}

function encodePathname(input) {
  return input
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function makeTosAuth({ method, key, body, contentType }) {
  const host = `${TOS.bucket}.${TOS.endpoint}`;
  const { xDate, date } = amzDate();
  const payloadHash = sha256Hex(body);
  const canonicalUri = `/${encodePathname(key)}`;
  const headers = {
    "content-type": contentType,
    host,
    "x-tos-content-sha256": payloadHash,
    "x-tos-date": xDate,
  };
  const sortedKeys = Object.keys(headers).sort();
  const signedHeaders = sortedKeys.join(";");
  const canonicalHeaders = sortedKeys.map((header) => `${header}:${headers[header]}\n`).join("");
  const canonicalRequest = [method, canonicalUri, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = `${date}/${TOS.region}/tos/request`;
  const stringToSign = ["TOS4-HMAC-SHA256", xDate, scope, sha256Hex(canonicalRequest)].join("\n");
  const signature = hmac(signKey(TOS.secretKey, date, TOS.region, "tos"), stringToSign, "hex");

  return {
    host,
    canonicalUri,
    headers: {
      "content-type": contentType,
      "x-tos-content-sha256": payloadHash,
      "x-tos-date": xDate,
      authorization: `TOS4-HMAC-SHA256 Credential=${TOS.accessKey}/${scope},SignedHeaders=${signedHeaders},Signature=${signature}`,
    },
  };
}

function makeArkOpenApiAuth({ action, body }) {
  const { xDate, date } = amzDate();
  const query = new URLSearchParams({ Action: action, Version: ARK_OPENAPI.version }).toString();
  const payloadHash = sha256Hex(body);
  const headers = {
    "content-type": "application/json",
    host: ARK_OPENAPI.host,
    "x-content-sha256": payloadHash,
    "x-date": xDate,
  };
  const sortedKeys = Object.keys(headers).sort();
  const signedHeaders = sortedKeys.join(";");
  const canonicalHeaders = sortedKeys.map((header) => `${header}:${headers[header]}\n`).join("");
  const canonicalRequest = ["POST", "/", query, canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = `${date}/${ARK_OPENAPI.region}/${ARK_OPENAPI.service}/request`;
  const stringToSign = ["HMAC-SHA256", xDate, scope, sha256Hex(canonicalRequest)].join("\n");
  const signature = hmac(signKey(ARK_OPENAPI.secretKey, date, ARK_OPENAPI.region, ARK_OPENAPI.service), stringToSign, "hex");

  return {
    url: `https://${ARK_OPENAPI.host}/?${query}`,
    headers: {
      ...headers,
      authorization: `HMAC-SHA256 Credential=${ARK_OPENAPI.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  };
}

async function uploadBufferToTos({ userId, assetId, bytes, mime }) {
  requireValue("TOS_ACCESS_KEY_ID", TOS.accessKey);
  requireValue("TOS_SECRET_ACCESS_KEY", TOS.secretKey);
  requireValue("TOS_ENDPOINT", TOS.endpoint);
  requireValue("TOS_REGION", TOS.region);
  requireValue("TOS_BUCKET", TOS.bucket);
  requireValue("TOS_PUBLIC_DOMAIN", TOS.publicDomain);

  const key = `seedance-assets/raising-game/users/${userId}/${assetId}-${Date.now()}${imageExtFromMime(mime)}`;
  const auth = makeTosAuth({ method: "PUT", key, body: bytes, contentType: mime });
  const url = `https://${auth.host}${auth.canonicalUri}`;
  const response = await fetch(url, { method: "PUT", headers: auth.headers, body: bytes });
  const text = await response.text();
  if (!response.ok) {
    const error = new Error(`TOS upload failed: ${response.status} ${text}`);
    error.statusCode = 502;
    throw error;
  }

  return {
    key,
    tosUrl: url,
    publicUrl: `${TOS.publicDomain.replace(/\/$/, "")}/${key}`,
  };
}

function makeHomeSyntheticReferencePrompt(item = {}) {
  const extra = String(item.referencePrompt || "").trim();
  return [
    "Use Figure 1 as the strict visual reference for a synthetic original adult female character.",
    "Keep the same face impression, adult age impression, hairstyle, body proportions, outfit silhouette, fabric colors, fabric textures, shoes, and visible accessories from the uploaded image.",
    "Generate one premium photorealistic FULL-BODY portrait, head-to-shoes fully visible inside the frame, front-facing, vertical 9:16 portrait composition, centered with generous margin, clean soft studio background, natural skin texture, no anime, no CGI, no plastic doll look.",
    "Composition must show her entire body from the top of her head down to her shoes; her long elegant legs must be clearly visible in the lower half of the image. Outfit should highlight her legs in a tasteful editorial way (short fitted dress, mini skirt, high-slit long dress, or fitted leggings) while remaining fully clothed.",
    "The character should feel like the same uploaded character rebuilt as a fictional digital model, not a different woman.",
    "Tasteful alluring confidence, mature adult fashion look, non-nude, non-explicit, no transparent clothing.",
    "No text, no logo, no watermark, no extra people, no cropped feet, no headshot, no upper-body-only crop, no distorted hands.",
    extra ? `Extra direction: ${extra}` : "",
  ].filter(Boolean).join(" ");
}

const HOME_SCENE_DIRECTIONS = {
  room: {
    label: "Suite Night",
    scene: "luxury private suite at night, rain on tall windows, warm lamp light, mirrored wall, rose-gold highlights",
    action:
      "0-4s she slowly opens the suite curtains and turns back toward camera; 4-9s she walks diagonally across the room in full-body view with relaxed hip sway and steady eye contact; 9-15s she leans against the mirrored wall, one leg forward, giving a soft teasing smile while speaking a short intimate line.",
  },
  cafe: {
    label: "Wine Lounge",
    scene: "upscale wine lounge with jazz lighting, glossy bar reflections, red wine glass, low amber and crimson light",
    action:
      "0-4s she glides past the bar with a wine glass in hand; 4-9s she pauses beside a lounge table, crosses one leg and gently lifts the glass toward camera; 9-15s she steps closer, places the glass down, and whispers a playful invitation with direct eye contact.",
  },
  park: {
    label: "Neon Rooftop",
    scene: "neon rooftop at night with city skyline, light breeze, wet floor reflections, cinematic teal and warm red highlights",
    action:
      "0-4s she walks along the rooftop edge with wind moving her hair and outfit; 4-9s she spins once under the neon sign, full silhouette visible from head to heels; 9-15s she rests both hands on the railing, looks over her shoulder, then turns back with a confident teasing line.",
  },
  cinema: {
    label: "Private Cinema",
    scene: "private cinema with velvet seats, projector beam, dim aisle lights, soft dust in the light shaft",
    action:
      "0-4s she walks down the cinema aisle between velvet seats; 4-9s she stops in the projector beam and slowly turns, letting the light trace her silhouette; 9-15s she sits on the armrest, leans toward camera, and murmurs a flirtatious non-explicit line.",
  },
};

function getHomeSceneDirection(scene = {}) {
  const id = String(scene?.id || "").trim();
  const fallback = {
    label: scene?.name || scene?.shortName || "Main Scene",
    scene: String(scene?.prompt || "").trim() || "premium intimate mobile romance drama setting",
    action:
      "0-4s she enters the scene in full-body view; 4-9s she performs a distinct slow movement suited to the setting; 9-15s she settles into an elegant flirtatious pose and speaks a short non-explicit teasing line.",
  };
  return { ...fallback, ...(HOME_SCENE_DIRECTIONS[id] || {}) };
}

function makeHomeVideoPrompt(item = {}, overridePrompt = "", { decorate = false, scene = null } = {}) {
  const rawPrompt = overridePrompt !== undefined && overridePrompt !== null ? String(overridePrompt) : String(item.prompt || "");
  if (rawPrompt.trim()) return rawPrompt;
  const sceneDirection = scene ? getHomeSceneDirection(scene) : null;
  const core = [
    "Create a 15-second vertical cinematic image-to-video FULL-BODY short drama shot featuring the same original adult woman from the reference image.",
    "Identity lock: preserve her face impression, adult age impression, hairstyle, outfit colors, outfit silhouette, body proportions, shoes, and visible accessories from the reference image.",
    "Mood: seductive, elegant, intimate, confident, premium mobile romance drama, strictly non-explicit.",
    "Audio: include soft sensual female voiceover and breathy teasing spoken lines, flirtatious and alluring, short intimate phrases, low-volume cinematic mix, no explicit sexual language.",
    sceneDirection
      ? `Scene: ${sceneDirection.scene}.`
      : "Scene: luxury private suite lounge with warm lamp light, mirrored wall, rain on tall windows, rose-gold highlights, polished high-end atmosphere.",
    sceneDirection
      ? `Action timeline: ${sceneDirection.action}`
      : "Action timeline: 0-4s she walks toward camera in full-body view, legs crossing naturally in stride, direct confident eye contact; 4-9s she stops, slowly turns 360 to show her full silhouette, hands resting at her hips, long legs clearly visible; 9-15s she leans against the mirrored wall, one leg slightly forward in a fashion editorial pose, slow low-angle camera tilt highlights her long legs while she gives a restrained flirtatious smile.",
  ].join(" ");
  return decorate ? decorateFullBodyLegPrompt(core) : core;
}

function makeSceneVideoPrompt(scene = {}, overridePrompt = "") {
  const userPrompt = String(overridePrompt || "");
  if (userPrompt.trim()) return userPrompt;
  return String(scene.prompt || "").trim() || `15-second vertical cinematic short drama in scene ${scene.name || scene.id || "scene"}.`;
}

function makeInteractiveSceneVideoPrompt(scene = {}, primaryName = "", partnerName = "", overridePrompt = "") {
  const userPrompt = String(overridePrompt || "");
  if (userPrompt.trim()) return userPrompt;
  const base = makeSceneVideoPrompt(scene, "");
  const who = primaryName || "the main woman";
  const withWho = partnerName || "the selected partner";
  const interaction = [
    `Feature two adult women together in the same shot: ${who} and ${withWho}.`,
    `Keep both identities distinct and consistent from their reference images.`,
    "They should interact naturally with eye contact, body turns, mirrored movement, and shared framing.",
    "Do not turn this into a solo portrait. Keep both characters visible in meaningful parts of the scene.",
    "Maintain tasteful non-explicit romance-drama energy.",
    "Audio: use soft seductive female voices with playful teasing dialogue and short spoken lines, intimate but non-explicit.",
  ].join(" ");
  return [userPrompt || base, interaction].filter(Boolean).join(" ");
}

async function submitSeedanceVideoTask({ config, prompt, referenceAssetUri, extraReferenceAssetUris = [], body = {}, slug = "" }) {
  const content = [{ type: "text", text: prompt }];
  if (referenceAssetUri && referenceAssetUri.startsWith("asset://")) {
    content.push({
      type: "image_url",
      image_url: { url: referenceAssetUri },
      role: "reference_image",
    });
  }
  extraReferenceAssetUris
    .filter((uri) => uri && uri.startsWith("asset://") && uri !== referenceAssetUri)
    .forEach((uri) => {
      content.push({
        type: "image_url",
        image_url: { url: uri },
        role: "reference_image",
      });
    });

  const payload = {
    model: MODEL_QUALITY,
    content,
    generate_audio: body.generateAudio === true || config.video.generateAudio === true,
    ratio: body.ratio || config.video.ratio || "9:16",
    resolution: body.resolution || config.video.resolution || "720p",
    duration: clampNumber(body.duration, config.video.duration || 15, 5, 15),
    watermark: false,
  };

  console.log(`[seedance-submit-${slug || "video"}]`, JSON.stringify(payload, null, 2));
  let raw;
  let lastSubmitError = "";
  for (let attempt = 0; attempt < 18; attempt += 1) {
    try {
      raw = await arkRequest("POST", "/contents/generations/tasks", payload);
      break;
    } catch (error) {
      lastSubmitError = error.message || String(error);
      if (!/asset is still processing|not available yet/i.test(lastSubmitError)) throw error;
      await delay(10000);
    }
  }
  if (!raw) {
    const error = new Error(lastSubmitError || "Upstream asset still processing, Seedance submit failed.");
    error.statusCode = 502;
    throw error;
  }
  return { task: normalizeTask(raw), payload };
}

async function downloadHomeReferenceImage(imageUrl, itemId) {
  const response = await fetch(imageUrl, { signal: AbortSignal.timeout(180000) });
  if (!response.ok) {
    const error = new Error(`Failed to download synthetic reference: ${response.status}`);
    error.statusCode = 502;
    throw error;
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const fileName = `home-ref-${String(itemId || "role").replace(/[^a-z0-9_-]/gi, "-")}-${Date.now()}.png`;
  const localPath = path.join(ADMIN_HOME_DIR, fileName);
  await fs.mkdir(ADMIN_HOME_DIR, { recursive: true });
  await fs.writeFile(localPath, bytes);
  return {
    bytes,
    localPath,
    localUrl: `/assets/admin/home/${fileName}`,
    mime: "image/png",
  };
}

async function createHomeSyntheticReference(item) {
  requireValue("APIZ_API_KEY", APIZ_API_KEY);
  const sourceUrl = item.sourceImageUrl || item.originalImageUrl || item.localImageUrl || item.posterUrl;
  if (!sourceUrl || /^https?:\/\//i.test(sourceUrl)) {
    const error = new Error("Save the home character locally first before generating a faithful reference image.");
    error.statusCode = 400;
    throw error;
  }

  const sourcePath = path.join(ROOT, sourceUrl.replace(/^\//, ""));
  const bytes = await fs.readFile(sourcePath);
  const uploaded = await uploadBufferToTos({
    userId: "admin",
    assetId: `${item.id || "home-role"}-source`,
    bytes,
    mime: item.sourceImageMime || item.imageMime || imageMimeFromPath(sourcePath),
  });
  const prompt = makeHomeSyntheticReferencePrompt(item);
  const model = process.env.HOME_REFERENCE_MODEL || process.env.OFFICIAL_PRESET_MODEL || DEFAULT_CONFIG.characterImage.editModel;
  const created = await apizRequest("/api/v3/tasks/create", {
    model,
    params: {
      prompt,
      image_urls: [uploaded.publicUrl],
      image_size: "auto_3K",
      num_images: 1,
      max_images: 1,
      enhance_prompt_mode: "standard",
    },
    channel: null,
  });
  const taskId = created.task_id || created.taskId || created.id;
  if (!taskId) {
    const error = new Error(`Seedream did not return task id: ${JSON.stringify(created)}`);
    error.statusCode = 502;
    throw error;
  }

  let task = created;
  for (let attempt = 0; attempt < 90; attempt += 1) {
    await delay(5000);
    task = await apizRequest("/api/v3/tasks/query", { task_id: taskId });
    if (isCompletedStatus(task.status)) break;
    if (isFailedStatus(task.status)) {
      const error = new Error(`Synthetic reference generation failed: ${task.error || task.message || JSON.stringify(task)}`);
      error.statusCode = 502;
      throw error;
    }
  }
  if (!isCompletedStatus(task.status)) {
    const error = new Error(`Synthetic reference generation timed out: ${taskId}`);
    error.statusCode = 504;
    throw error;
  }

  const imageUrl = collectOutputImageUrls(task)[0];
  if (!imageUrl) {
    const error = new Error(`Synthetic reference task returned no image: ${taskId}`);
    error.statusCode = 502;
    throw error;
  }

  const local = await downloadHomeReferenceImage(imageUrl, item.id);
  return {
    model,
    prompt,
    taskId,
    imageUrl,
    sourcePublicUrl: uploaded.publicUrl,
    sourceTosKey: uploaded.key,
    local,
  };
}

async function ensureHomeSyntheticReference(config) {
  config.homeVideo = normalizeHomeVideo(config.homeVideo || {});
  const item = findHomeVideoItem(config.homeVideo);
  if (!item) {
    const error = new Error("Please upload or select a home character first.");
    error.statusCode = 400;
    throw error;
  }
  return ensureSyntheticReferenceForHomeItem(config, item.id);
}

/**
 * Make sure the given home item has BOTH a high-quality apiz Seedream synthetic
 * reference image AND an upstream Seedance asset built from that image.
 * Self-heals if a previous version wrote referenceAssetUri straight from the
 * raw upload (i.e. syntheticReferenceLocalUrl missing).
 */
async function ensureSyntheticReferenceForHomeItem(config, itemId, options = {}) {
  // If a background scheduler is already building this item, wait for
  // it to finish to avoid firing two Seedream tasks for the same image.
  if (
    !options._fromScheduler &&
    typeof HOME_REFERENCE_BUILDS !== "undefined" &&
    HOME_REFERENCE_BUILDS &&
    HOME_REFERENCE_BUILDS.has(itemId)
  ) {
    try { await HOME_REFERENCE_BUILDS.get(itemId); } catch {}
    return await readAppConfig();
  }

  config.homeVideo = normalizeHomeVideo(config.homeVideo || {});
  const item = findHomeVideoItem(config.homeVideo, itemId);
  if (!item) {
    const error = new Error(`Home item ${itemId} not found.`);
    error.statusCode = 404;
    throw error;
  }

  const force = options.force === true;
  const hasSynthetic = Boolean(item.syntheticReferenceLocalUrl || item.syntheticReferenceUrl);
  const hasAsset = Boolean(item.referenceAssetUri);

  // Self-heal: a stale referenceAssetUri exists but no synthetic image was
  // ever produced. Treat it as invalid and rebuild from scratch.
  let working = item;
  if (force || (hasAsset && !hasSynthetic)) {
    working = {
      ...item,
      referenceAssetUri: "",
      publicImageUrl: "",
      tosKey: "",
    };
    config.homeVideo = replaceHomeVideoItem(config.homeVideo, working);
    await writeAppConfig(config);
  } else if (hasAsset && hasSynthetic) {
    return config;
  }

  let referenceItem = working;
  if (!referenceItem.syntheticReferenceLocalUrl && !referenceItem.syntheticReferenceUrl) {
    const synthetic = await createHomeSyntheticReference(referenceItem);
    referenceItem = {
      ...referenceItem,
      sourceImageUrl: referenceItem.sourceImageUrl || referenceItem.localImageUrl || referenceItem.posterUrl,
      sourceImageMime: referenceItem.sourceImageMime || referenceItem.imageMime || "",
      posterUrl: synthetic.local.localUrl,
      localImageUrl: synthetic.local.localUrl,
      imageMime: synthetic.local.mime,
      syntheticReferenceLocalUrl: synthetic.local.localUrl,
      syntheticReferenceUrl: synthetic.imageUrl,
      syntheticReferenceTaskId: synthetic.taskId,
      syntheticReferenceModel: synthetic.model,
      syntheticReferencePrompt: synthetic.prompt,
      sourcePublicUrl: synthetic.sourcePublicUrl,
      sourceTosKey: synthetic.sourceTosKey,
      status: "reference_ready",
      updatedAt: new Date().toISOString(),
    };
    config.homeVideo = replaceHomeVideoItem(config.homeVideo, referenceItem);
    await writeAppConfig(config);
  } else if (referenceItem.syntheticReferenceLocalUrl && referenceItem.localImageUrl !== referenceItem.syntheticReferenceLocalUrl) {
    referenceItem = {
      ...referenceItem,
      sourceImageUrl: referenceItem.sourceImageUrl || referenceItem.localImageUrl || referenceItem.posterUrl,
      posterUrl: referenceItem.syntheticReferenceLocalUrl,
      localImageUrl: referenceItem.syntheticReferenceLocalUrl,
      imageMime: "image/png",
      updatedAt: new Date().toISOString(),
    };
    config.homeVideo = replaceHomeVideoItem(config.homeVideo, referenceItem);
    await writeAppConfig(config);
  }

  return ensureSeedanceAssetForHomeItem(config, referenceItem.id);
}

async function ensureSeedanceAssetForHomeImage(config) {
  config.homeVideo = normalizeHomeVideo(config.homeVideo || {});
  const item = findHomeVideoItem(config.homeVideo);
  if (!item) {
    const error = new Error("Please upload or select a home character first.");
    error.statusCode = 400;
    throw error;
  }
  return ensureSeedanceAssetForHomeItem(config, item.id);
}

async function ensureSeedanceAssetForHomeItem(config, itemId) {
  config.homeVideo = normalizeHomeVideo(config.homeVideo || {});
  const item = findHomeVideoItem(config.homeVideo, itemId);
  if (!item) {
    const error = new Error(`Home item ${itemId} not found.`);
    error.statusCode = 404;
    throw error;
  }
  if (item.referenceAssetUri) return config;
  // Prefer the synthetic image as the reference, fall back to the local image.
  const localUrl = item.syntheticReferenceLocalUrl || item.localImageUrl || item.posterUrl;
  if (!localUrl || /^https?:\/\//i.test(localUrl)) {
    const error = new Error("The home image must be uploaded locally first before creating an upstream reference asset.");
    error.statusCode = 400;
    throw error;
  }

  const localPath = path.join(ROOT, localUrl.replace(/^\//, ""));
  const bytes = await fs.readFile(localPath);
  const uploaded = await uploadBufferToTos({
    userId: "admin",
    assetId: `${item.id || "home-video-reference"}-ref`,
    bytes,
    mime: item.imageMime || config.homeVideo?.imageMime || imageMimeFromPath(localPath),
  });
  const created = await arkOpenApiAction("CreateAsset", {
    GroupId: ARK_OPENAPI.groupId,
    URL: uploaded.publicUrl,
    AssetType: "Image",
    Name: `raising-game-home-${item.id}-${Date.now()}`,
    ProjectName: ARK_OPENAPI.projectName,
  });
  const assetId = extractAssetId(created);
  if (!assetId) {
    const error = new Error(`CreateAsset did not return asset id: ${JSON.stringify(created)}`);
    error.statusCode = 502;
    throw error;
  }

  const next = {
    ...item,
    publicImageUrl: uploaded.publicUrl,
    referenceAssetUri: `asset://${assetId}`,
    tosKey: uploaded.key,
    updatedAt: new Date().toISOString(),
  };
  config.homeVideo = replaceHomeVideoItem(config.homeVideo, next);
  return config;
}

function isPublicHttpUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return ["http:", "https:"].includes(url.protocol) && !["127.0.0.1", "localhost", "::1"].includes(url.hostname);
  } catch {
    return false;
  }
}

function normalizeSeedreamImageSize(value) {
  return APIZ_SEEDREAM_IMAGE_SIZES.has(value) ? value : "auto_3K";
}

async function ensurePublicUrlForUserAsset(db, userAsset) {
  if (isPublicHttpUrl(userAsset.publicUrl)) return userAsset;

  const localPath = path.join(ROOT, userAsset.localUrl.replace(/^\//, ""));
  const bytes = await fs.readFile(localPath);
  const uploaded = await uploadBufferToTos({
    userId: userAsset.userId,
    assetId: `${userAsset.id}-apiz`,
    bytes,
    mime: userAsset.mime || "image/png",
  });

  userAsset.publicUrl = uploaded.publicUrl;
  userAsset.publicTosKey = uploaded.key;
  userAsset.publicUploadedAt = new Date().toISOString();
  await writeDb(db);
  return userAsset;
}

async function arkOpenApiAction(action, payload) {
  requireValue("BYTEPLUS_ACCESS_KEY_ID or VOLC_ACCESS_KEY_ID", ARK_OPENAPI.accessKey);
  requireValue("BYTEPLUS_SECRET_ACCESS_KEY or VOLC_ACCESS_KEY_SECRET", ARK_OPENAPI.secretKey);

  const body = JSON.stringify(payload);
  const transientCodes = /InternalServiceTimeout|InternalServiceError|RequestTimeout|ServerBusy|TooManyRequests/i;
  let lastError = null;
  // Each iteration freshly signs the request because the signed timestamp
  // would otherwise drift between attempts.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const auth = makeArkOpenApiAuth({ action, body });
      const response = await fetch(auth.url, { method: "POST", headers: auth.headers, body });
      const text = await response.text();
      const json = text ? JSON.parse(text) : {};
      if (!response.ok || json.ResponseMetadata?.Error) {
        const detail = json.ResponseMetadata?.Error;
        const message = `${action} failed: ${detail?.Code || response.status} ${detail?.Message || text}`;
        const isTransient =
          (detail?.Code && transientCodes.test(detail.Code)) ||
          (detail?.Message && transientCodes.test(detail.Message)) ||
          (text && transientCodes.test(text)) ||
          response.status === 503 ||
          response.status === 504 ||
          response.status === 429;
        if (isTransient && attempt < 3) {
          lastError = message;
          const wait = 4000 * (attempt + 1);
          console.warn(`[ark-openapi] ${action} transient error: ${message} — retrying in ${wait}ms`);
          await delay(wait);
          continue;
        }
        const error = new Error(message);
        error.statusCode = response.ok ? 502 : response.status;
        error.payload = json;
        throw error;
      }
      return json.Result || json;
    } catch (error) {
      // Network-layer errors get one retry only when they look transient.
      const msg = String(error.message || error);
      if (attempt < 3 && /timeout|network|ECONN|fetch failed/i.test(msg)) {
        lastError = msg;
        const wait = 4000 * (attempt + 1);
        console.warn(`[ark-openapi] ${action} network error: ${msg} — retrying in ${wait}ms`);
        await delay(wait);
        continue;
      }
      throw error;
    }
  }
  const error = new Error(`${action} failed after retries: ${lastError || "unknown error"}`);
  error.statusCode = 502;
  throw error;
}

function extractAssetId(result) {
  return result.Id || result.AssetId || result.Asset?.Id || result.Asset?.AssetId || result.Item?.Id || "";
}

async function ensureSeedanceAssetForUserAsset(db, userAsset) {
  if (userAsset.assetUri) return userAsset;

  const localPath = path.join(ROOT, userAsset.localUrl.replace(/^\//, ""));
  const bytes = await fs.readFile(localPath);
  const uploaded = await uploadBufferToTos({
    userId: userAsset.userId,
    assetId: userAsset.id,
    bytes,
    mime: userAsset.mime || "image/png",
  });
  const created = await arkOpenApiAction("CreateAsset", {
    GroupId: ARK_OPENAPI.groupId,
    URL: uploaded.publicUrl,
    AssetType: "Image",
    Name: `raising-game-user-${userAsset.id}-${Date.now()}`,
    ProjectName: ARK_OPENAPI.projectName,
  });
  const assetId = extractAssetId(created);
  if (!assetId) {
    const error = new Error(`CreateAsset did not return asset id: ${JSON.stringify(created)}`);
    error.statusCode = 502;
    throw error;
  }

  userAsset.assetId = assetId;
  userAsset.assetUri = `asset://${assetId}`;
  userAsset.publicUrl = uploaded.publicUrl;
  userAsset.tosKey = uploaded.key;
  userAsset.upstreamCreatedAt = new Date().toISOString();
  await writeDb(db);
  return userAsset;
}

async function apizRequest(pathname, body) {
  if (!APIZ_API_KEY) {
    const error = new Error("Generation service is not configured.");
    error.statusCode = 503;
    error.code = "GENERATION_SERVICE_NOT_CONFIGURED";
    throw error;
  }

  const response = await fetch(`${APIZ_BASE_URL}${pathname}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${APIZ_API_KEY}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok || payload.code >= 400) {
    const error = new Error(payload.message || payload.detail || `Generation request failed: ${response.status}`);
    error.statusCode = response.status || 502;
    error.payload = payload;
    throw error;
  }
  return payload.data || payload;
}

function apizModelPathId(modelId = "") {
  return encodeURIComponent(String(modelId || "").trim()).replace(/%2F/gi, "/");
}

async function apizGet(pathname, query = {}) {
  if (!APIZ_API_KEY) {
    const error = new Error("Generation service is not configured.");
    error.statusCode = 503;
    error.code = "GENERATION_SERVICE_NOT_CONFIGURED";
    throw error;
  }

  const url = new URL(`${APIZ_BASE_URL}${pathname}`);
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  });
  const response = await fetch(url, {
    method: "GET",
    headers: {
      authorization: `Bearer ${APIZ_API_KEY}`,
      accept: "application/json",
    },
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok || payload.code >= 400) {
    const error = new Error(payload.message || payload.detail || `Generation metadata request failed: ${response.status}`);
    error.statusCode = response.status || 502;
    error.payload = payload;
    throw error;
  }
  return payload.data || payload;
}

function apizPricingNumber(value) {
  if (typeof value === "boolean") return null;
  if (typeof value === "string") {
    const text = value.trim();
    if (!text || /^auto$/i.test(text)) return null;
    const direct = Number(text);
    if (Number.isFinite(direct)) return direct;
    const match = text.match(/-?\d+(?:\.\d+)?/);
    if (!match) return null;
    const parsed = Number(match[0]);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function apizPricingBaseAmount(pricing = {}) {
  for (const key of ["base_price", "amount", "price", "credits", "credit_cost"]) {
    const next = apizPricingNumber(pricing?.[key]);
    if (next !== null) return next;
  }
  return null;
}

function apizCreditsFromPricingAmount(amount, unit = "") {
  const next = apizPricingNumber(amount);
  if (next === null || next < 0) return null;
  const normalizedUnit = String(unit || "").toLowerCase();
  if (normalizedUnit.includes("元") || normalizedUnit.includes("yuan") || normalizedUnit.includes("cny")) {
    return creditsAmount(next * 100);
  }
  return creditsAmount(next);
}

function durationSecondsFromParams(params = {}) {
  for (const key of ["duration", "duration_sec", "duration_seconds", "seconds", "length", "video_length", "audio_length"]) {
    const next = apizPricingNumber(params?.[key]);
    if (next !== null && next > 0) return next;
  }
  return 0;
}

function apizPricingText(value = {}) {
  if (!value || typeof value !== "object") return "";
  return [
    value.description,
    value.label,
    value.name,
    value.title,
    value.price_description,
    Array.isArray(value.price_factors) ? value.price_factors.join(" ") : "",
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function mediaValueLooksLikeVideo(value) {
  if (!value) return false;
  if (typeof value === "string") return /\.(mp4|mov|m4v|webm|avi|mkv)(?:[?#]|$)/i.test(value);
  if (Array.isArray(value)) return value.some(mediaValueLooksLikeVideo);
  if (typeof value === "object") {
    return mediaValueLooksLikeVideo(value.url || value.src || value.path || value.file || value.file_url || value.fileUrl);
  }
  return false;
}

function paramsHaveVideoInput(params = {}) {
  return Object.entries(params || {}).some(([key, value]) => {
    const normalizedKey = key.toLowerCase();
    if (/^video_(?:file|url)?_\d+$/.test(normalizedKey) || /^video_file_\d+$/.test(normalizedKey) || ["video_file", "video_url", "video_files", "video_urls"].includes(normalizedKey)) {
      return Boolean(value);
    }
    if (["media_files", "filepaths", "file_paths"].includes(normalizedKey)) {
      return mediaValueLooksLikeVideo(value);
    }
    return false;
  });
}

function modelVariantFromParams(params = {}) {
  const raw = String(params.model || params.model_type || params.variant || "").trim();
  const compact = raw.toLowerCase().replace(/[\s_/-]+/g, "");
  if (!compact) return { known: false, fast: null, vip: null };
  if (compact.includes("superseed2")) return { known: true, fast: true, vip: false };
  if (!compact.includes("seedance")) return { known: false, fast: null, vip: null };
  const vip = compact.includes("vip");
  const fast = compact.includes("fast");
  return { known: true, fast, vip };
}

function exampleMentionsVideoInput(text = "") {
  return /含\s*视频|视频素材|with\s+video|video\s+(?:material|input|reference|file)|video_file/i.test(text);
}

function exampleMentionsNoVideoInput(text = "") {
  return /文生视频|text\s*to\s*video|without\s+video|no\s+video/i.test(text);
}

function seedanceDynamicPerSecondRate(pricing = {}, params = {}) {
  const description = apizPricingText(pricing);
  if (!/seedance|fast|标准|standard/i.test(description)) return null;
  const variant = modelVariantFromParams(params);
  if (!variant.known) return null;
  const hasVideoInput = paramsHaveVideoInput(params);
  if (variant.fast && variant.vip) return hasVideoInput ? 240 : 120;
  if (variant.fast) return hasVideoInput ? 120 : 60;
  if (variant.vip) return hasVideoInput ? 300 : 150;
  return hasVideoInput ? 180 : 90;
}

function numOutputsFromParams(params = {}) {
  const next = apizPricingNumber(params.num_images ?? params.n ?? params.batch_size ?? params.num_outputs ?? 1);
  return Math.max(1, Math.ceil(next || 1));
}

function durationFromPricingExample(example = {}) {
  for (const key of ["duration", "duration_sec", "duration_seconds", "seconds", "length"]) {
    const next = apizPricingNumber(example?.[key]);
    if (next !== null && next > 0) return next;
  }
  const text = String(example.description || example.label || example.name || "");
  const match = text.match(/(\d+(?:\.\d+)?)\s*(?:秒|s|sec|second)/i);
  const parsed = match ? apizPricingNumber(match[1]) : null;
  return parsed && parsed > 0 ? parsed : 0;
}

function exampleMatchesPricingParams(example = {}, params = {}) {
  const text = apizPricingText(example);
  const resolution = String(params.resolution || params.quality || "").trim().toLowerCase();
  const modelVariant = modelVariantFromParams(params);
  const hasVideoInput = paramsHaveVideoInput(params);

  if (resolution && text && !text.includes(resolution)) {
    const mentionedResolution = /\b\d{3,4}p\b/i.test(text);
    if (mentionedResolution) return false;
  }
  if (modelVariant.known && text) {
    const mentionsVip = /\bvip\b/i.test(text);
    const mentionsFast = /\bfast\b/i.test(text);
    const mentionsStandard = /标准|standard/i.test(text);
    if (modelVariant.vip !== null && mentionsVip !== modelVariant.vip) return false;
    if (modelVariant.fast === true && mentionsStandard) return false;
    if (modelVariant.fast === false && mentionsFast) return false;
  }
  if (text) {
    if (exampleMentionsVideoInput(text) && !hasVideoInput) return false;
    if (exampleMentionsNoVideoInput(text) && hasVideoInput) return false;
  }
  return true;
}

function pricingExamplePrices(pricing = {}) {
  const examples = pricing.examples || pricing.duration_prices || pricing.prices || [];
  if (!Array.isArray(examples)) return [];
  return examples
    .map((example) => {
      if (!example || typeof example !== "object") return null;
      const price = apizPricingBaseAmount(example);
      if (price === null) return null;
      return { duration: durationFromPricingExample(example), price };
    })
    .filter(Boolean);
}

function priceFromDurationExamples(pricing = {}, params = {}) {
  const examples = pricing.examples || pricing.duration_prices || pricing.prices || [];
  const scopedExamples = Array.isArray(examples) ? examples.filter((example) => exampleMatchesPricingParams(example, params)) : [];
  const prices = pricingExamplePrices({ ...pricing, examples: scopedExamples.length ? scopedExamples : examples });
  if (!prices.length) return null;
  const duration = durationSecondsFromParams(params);
  if (duration > 0) {
    const withDuration = prices.filter((item) => item.duration > 0).sort((a, b) => a.duration - b.duration);
    const matched = withDuration.find((item) => duration <= item.duration);
    if (matched) {
      return Math.max(...withDuration.filter((item) => item.duration === matched.duration).map((item) => item.price));
    }
    if (withDuration.length) {
      const maxDuration = withDuration[withDuration.length - 1].duration;
      const maxDurationPrice = Math.max(...withDuration.filter((item) => item.duration === maxDuration).map((item) => item.price));
      if (maxDuration > 0) return Math.ceil((maxDurationPrice / maxDuration) * duration);
      return maxDurationPrice;
    }
  }
  return Math.max(...prices.map((item) => item.price));
}

function matrixPriceCandidates(value) {
  const direct = apizPricingNumber(value);
  if (direct !== null) return [direct];
  if (Array.isArray(value)) return value.flatMap(matrixPriceCandidates);
  if (value && typeof value === "object") {
    const base = apizPricingBaseAmount(value);
    const nested = Object.values(value).flatMap(matrixPriceCandidates);
    return base === null ? nested : [base, ...nested];
  }
  return [];
}

function priceFromQualitySizeMatrix(pricing = {}, params = {}) {
  const matrix = pricing.quality_size_matrix || pricing.matrix || pricing.size_quality_matrix;
  if (!matrix || typeof matrix !== "object" || Array.isArray(matrix)) return null;
  const qualities = ["quality", "image_quality", "resolution_quality", "mode", "resolution"]
    .map((key) => String(params[key] || "").trim())
    .filter(Boolean);
  const sizes = ["size", "image_size", "resolution", "aspect_ratio", "ratio"]
    .map((key) => String(params[key] || "").trim())
    .filter(Boolean);

  for (const quality of qualities) {
    const sub = matrix[quality];
    if (sub && typeof sub === "object") {
      for (const size of sizes) {
        const values = matrixPriceCandidates(sub[size]);
        if (values.length) return Math.max(...values);
      }
      const values = matrixPriceCandidates(sub);
      if (values.length) return Math.max(...values);
    }
  }
  for (const size of sizes) {
    const values = matrixPriceCandidates(matrix[size]);
    if (values.length) return Math.max(...values);
  }
  const values = matrixPriceCandidates(matrix);
  return values.length ? Math.max(...values) : null;
}

function defaultDurationFromDocs(docs = {}) {
  const properties = docs.params_schema?.properties;
  const durationSchema = properties?.duration;
  if (!durationSchema || typeof durationSchema !== "object") return 0;
  const direct = apizPricingNumber(durationSchema.default);
  if (direct && direct > 0) return direct;
  if (Array.isArray(durationSchema.enum)) {
    const values = durationSchema.enum.map(apizPricingNumber).filter((value) => value && value > 0);
    if (values.length) return Math.min(...values);
  }
  return 0;
}

function normalizeApizPricing(pricing, docs = {}) {
  if (!pricing || typeof pricing !== "object" || Array.isArray(pricing)) return null;
  const next = { ...pricing };
  const defaultDuration = defaultDurationFromDocs(docs);
  if (defaultDuration > 0) next._default_duration_seconds = defaultDuration;
  return next;
}

function pricingIsFreeFixed(pricing = {}) {
  const priceType = String(pricing.price_type || pricing.type || "").trim().toLowerCase();
  const amount = apizPricingBaseAmount(pricing);
  return priceType === "fixed" && amount === 0;
}

function estimateCreditsFromApizPricing(pricing = {}, params = {}) {
  if (!pricing || typeof pricing !== "object") return 0;
  const unit = pricing.price_unit || pricing.unit || "";
  const priceType = String(pricing.price_type || pricing.type || "").trim().toLowerCase();
  const baseAmount = apizPricingBaseAmount(pricing);
  const duration = durationSecondsFromParams(params) || apizPricingNumber(pricing._default_duration_seconds) || 0;

  if (priceType === "fixed" && baseAmount === 0) return 0;

  if (priceType === "per_second" || priceType === "dynamic_per_second") {
    const explicitRate = priceType === "dynamic_per_second" ? seedanceDynamicPerSecondRate(pricing, params) : null;
    if (explicitRate && explicitRate > 0) {
      return apizCreditsFromPricingAmount(Math.ceil((duration || 5) * explicitRate), unit) || 0;
    }
    const examplePrice = priceFromDurationExamples(pricing, params);
    if (examplePrice !== null) return apizCreditsFromPricingAmount(examplePrice, unit) || 0;
    let rate = apizPricingNumber(pricing.per_second);
    if (!rate || rate <= 0) {
      if (priceType === "dynamic_per_second" && baseAmount && pricing._default_duration_seconds) {
        rate = baseAmount / Number(pricing._default_duration_seconds);
      } else {
        rate = baseAmount;
      }
    }
    if (!rate || rate <= 0) return 0;
    return apizCreditsFromPricingAmount(Math.ceil(Math.max(duration, 5) * rate), unit) || 0;
  }

  if (priceType === "per_minute") {
    const rate = apizPricingNumber(pricing.per_minute) ?? baseAmount;
    if (!rate || rate <= 0) return 0;
    return apizCreditsFromPricingAmount(Math.max(1, Math.ceil(Math.max(duration, 60) / 60)) * rate, unit) || 0;
  }

  if (priceType === "duration_map" || priceType === "duration_based" || priceType === "duration_price") {
    const examplePrice = priceFromDurationExamples(pricing, params);
    if (examplePrice !== null) return apizCreditsFromPricingAmount(examplePrice, unit) || 0;
    if (!baseAmount || baseAmount <= 0) return 0;
    if (duration > 0 && priceType !== "duration_map") return apizCreditsFromPricingAmount(Math.ceil(duration * baseAmount), unit) || 0;
    return apizCreditsFromPricingAmount(baseAmount, unit) || 0;
  }

  if (priceType === "token_postcharge") {
    const examplePrice = priceFromDurationExamples(pricing, params);
    if (examplePrice !== null) return apizCreditsFromPricingAmount(examplePrice, unit) || 0;
    return apizCreditsFromPricingAmount(baseAmount || 0, unit) || 0;
  }

  if (priceType === "quantity_based") {
    if (!baseAmount || baseAmount <= 0) return 0;
    return apizCreditsFromPricingAmount(baseAmount * numOutputsFromParams(params), unit) || 0;
  }

  if (priceType === "quality_size_matrix" || priceType === "matrix") {
    const matrixPrice = priceFromQualitySizeMatrix(pricing, params);
    const amount = matrixPrice ?? baseAmount;
    if (!amount || amount <= 0) return 0;
    return apizCreditsFromPricingAmount(amount * numOutputsFromParams(params), unit) || 0;
  }

  if (priceType === "token_based") {
    if (!baseAmount || baseAmount <= 0) return 0;
    const tokens = Math.max(0, Number(params.prompt_tokens || 0) + Number(params.completion_tokens || 0));
    return apizCreditsFromPricingAmount(baseAmount * Math.max(1, Math.ceil(tokens / 1000)), unit) || 0;
  }

  if (priceType === "audio_duration_based" || priceType === "audio_duration" || priceType === "char_based") {
    if (!baseAmount || baseAmount <= 0) return 0;
    if (priceType === "char_based") {
      const chars = String(params.prompt || params.text || "").length || 100;
      return apizCreditsFromPricingAmount(baseAmount * Math.max(1, Math.ceil(chars / 1000)), unit) || 0;
    }
    return apizCreditsFromPricingAmount(baseAmount * Math.max(1, Math.ceil(duration || 1)), unit) || 0;
  }

  if (priceType === "resolution_quantity" || priceType === "size_based") {
    if (!baseAmount || baseAmount <= 0) return 0;
    return apizCreditsFromPricingAmount(baseAmount * numOutputsFromParams(params), unit) || 0;
  }

  return apizCreditsFromPricingAmount(baseAmount || 0, unit) || 0;
}

async function fetchApizModelPricing(modelId = "") {
  const model = String(modelId || "").trim();
  if (!model) return null;
  const cached = apizPricingCache.get(model);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  let value = null;
  try {
    const docs = await apizGet(`/api/v3/models/${apizModelPathId(model)}/docs`, { lang: "zh" });
    value = normalizeApizPricing(docs?.pricing, docs);
  } catch (error) {
    if (!error.statusCode || error.statusCode !== 404) {
      console.warn("[apiz-pricing-docs-failed]", model, error.message || error);
    }
  }

  if (!value) {
    try {
      const detail = await apizGet(`/api/v3/mcp/models/${apizModelPathId(model)}`, { lang: "zh" });
      value = normalizeApizPricing(detail?.pricing, detail);
    } catch (error) {
      if (!error.statusCode || error.statusCode !== 404) {
        console.warn("[apiz-pricing-detail-failed]", model, error.message || error);
      }
    }
  }

  if (!value) {
    value = await fetchApizModelListPricing(model);
  }

  apizPricingCache.set(model, { value, expiresAt: Date.now() + APIZ_PRICING_CACHE_TTL_MS });
  return value;
}

async function fetchApizModelListPricing(modelId = "") {
  const model = String(modelId || "").trim();
  if (!model) return null;
  if (apizModelListPricingCache.expiresAt <= Date.now()) {
    const values = new Map();
    try {
      const data = await apizGet("/api/v3/mcp/models", { lang: "zh-CN" });
      const models = Array.isArray(data?.models) ? data.models : [];
      models.forEach((item) => {
        const id = String(item?.id || "").trim();
        const pricing = normalizeApizPricing(item?.pricing, item);
        if (id && pricing) values.set(id, pricing);
      });
    } catch (error) {
      console.warn("[apiz-pricing-list-failed]", error.message || error);
    }
    apizModelListPricingCache = { expiresAt: Date.now() + APIZ_PRICING_CACHE_TTL_MS, values };
  }
  return apizModelListPricingCache.values.get(model) || null;
}

async function estimatePlatformPreDeductCredits(model, params = {}, template = {}) {
  const pricing = await fetchApizModelPricing(model);
  const estimated = estimateCreditsFromApizPricing(pricing, params);
  if (estimated > 0 || pricingIsFreeFixed(pricing)) {
    return { credits: estimated, source: "model_pricing", pricing };
  }

  const error = new Error("模型定价未配置，暂不能提交生成。请在后台模板里填写上游真实模型 ID。");
  error.statusCode = 422;
  error.code = "MODEL_PRICING_UNAVAILABLE";
  throw error;
}

async function readGenerationRecords() {
  const records = await getKv("generation_records", []);
  return Array.isArray(records) ? records : [];
}

async function writeGenerationRecords(records) {
  await setKv("generation_records", records);
}

async function upsertGenerationRecord(nextRecord) {
  const records = await readGenerationRecords();
  const index = records.findIndex((record) => record.taskId === nextRecord.taskId);
  const now = new Date().toISOString();
  const record = {
    ...(index >= 0 ? records[index] : { createdAt: now }),
    ...nextRecord,
    deletedAt: nextRecord.deletedAt ?? (index >= 0 ? records[index].deletedAt || "" : ""),
    updatedAt: now,
  };

  if (index >= 0) {
    records[index] = record;
  } else {
    records.unshift(record);
  }

  await writeGenerationRecords(records.slice(0, 500));
  return record;
}

async function getGenerationRecord(taskId) {
  const records = await readGenerationRecords();
  return records.find((record) => record.taskId === taskId) || null;
}

function isUserVisibleGenerationRecord(record) {
  return Boolean(record && record.taskId && !record.deletedAt);
}

function generationRecordKind(record = {}) {
  const source = String(record.source || "").trim();
  if (source === "user-character" || source.includes("home")) return "main-video";
  if (source.includes("unlock")) return "unlock-video";
  if (source.includes("advanced")) return "advanced-video";
  return "scene-video";
}

function generationRecordVideoUrl(record = {}) {
  return String(record.localVideoUrl || record.videoUrl || record.remoteVideoUrl || "");
}

function publicGenerationRecord(record = {}) {
  return {
    taskId: String(record.taskId || ""),
    status: String(record.status || "submitted"),
    source: String(record.source || ""),
    kind: String(record.kind || generationRecordKind(record)),
    templateId: String(record.templateId || ""),
    templateTitle: String(record.templateTitle || ""),
    sceneId: String(record.sceneId || ""),
    sceneName: String(record.sceneName || ""),
    sceneEntryId: String(record.sceneEntryId || ""),
    sceneEntryName: String(record.sceneEntryName || ""),
    companionId: String(record.companionId || ""),
    companionName: String(record.companionName || ""),
    partnerCharacterId: String(record.partnerCharacterId || ""),
    partnerCharacterName: String(record.partnerCharacterName || ""),
    imageUrl: String(record.imageUrl || ""),
    userAssetId: String(record.userAssetId || ""),
    prompt: String(record.prompt || ""),
    finalPrompt: String(record.finalPrompt || ""),
    params: record.params || null,
    model: String(record.model || ""),
    ratio: String(record.ratio || ""),
    resolution: String(record.resolution || ""),
    duration: record.duration || "",
    quality: String(record.quality || ""),
    videoUrl: generationRecordVideoUrl(record),
    localVideoUrl: String(record.localVideoUrl || ""),
    remoteVideoUrl: String(record.remoteVideoUrl || ""),
    error: String(record.error || ""),
    billing: publicBilling(record),
    createdAt: String(record.createdAt || ""),
    updatedAt: String(record.updatedAt || ""),
  };
}

function shouldRefreshGenerationRecord(record = {}) {
  if (record.provider === "apiz" && !record.billingSettledAt && record.taskId && !String(record.taskId).startsWith("demo-")) return true;
  const status = String(record.status || "").toLowerCase();
  if (isFailedStatus(status)) return false;
  if (isSucceededStatus(status)) return !generationRecordVideoUrl(record) && Boolean(record.taskId);
  return Boolean(record.taskId) && !String(record.taskId).startsWith("demo-");
}

async function refreshGenerationRecordStatus(record = {}) {
  if (record.provider === "apiz") {
    if (!APIZ_API_KEY || !shouldRefreshGenerationRecord(record)) return record;
    try {
      return await refreshApizGenerationRecord(record);
    } catch (error) {
      console.warn("[apiz-generation-record-refresh-failed]", record.taskId, error.message || error);
      return record;
    }
  }
  if (!ARK_API_KEY || !shouldRefreshGenerationRecord(record)) return record;
  try {
    const raw = await arkRequest("GET", `/contents/generations/tasks/${encodeURIComponent(record.taskId)}`);
    const task = normalizeTask(raw);
    return await upsertGenerationRecord({
      taskId: record.taskId,
      status: task.status || record.status || "unknown",
      remoteVideoUrl: task.videoUrl || record.remoteVideoUrl || "",
      localVideoUrl: record.localVideoUrl || "",
      localVideoPath: record.localVideoPath || "",
      error: task.error || record.error || "",
    });
  } catch (error) {
    console.warn("[generation-record-refresh-failed]", record.taskId, error.message || error);
    return record;
  }
}

function isSucceededStatus(status) {
  return ["succeeded", "success", "done", "completed"].includes(String(status || "").toLowerCase());
}

function isFailedStatus(status) {
  return ["failed", "error", "cancelled", "canceled"].includes(String(status || "").toLowerCase());
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function videoFileName(taskId) {
  return `${String(taskId).replace(/[^a-z0-9_-]/gi, "_")}.mp4`;
}

async function downloadGeneratedVideo(taskId, remoteVideoUrl) {
  const existing = await getGenerationRecord(taskId);
  if (existing?.localVideoUrl) {
    try {
      await fs.access(path.join(ROOT, existing.localVideoUrl.replace(/^\//, "")));
      return {
        localVideoPath: existing.localVideoPath,
        localVideoUrl: existing.localVideoUrl,
      };
    } catch {
      // Fall through and re-download if the record points to a missing file.
    }
  }

  await fs.mkdir(GENERATED_VIDEO_DIR, { recursive: true });
  const fileName = videoFileName(taskId);
  const localVideoPath = path.join(GENERATED_VIDEO_DIR, fileName);
  const localVideoUrl = `/assets/generated/videos/${fileName}`;

  const response = await fetch(remoteVideoUrl, { signal: AbortSignal.timeout(15 * 60 * 1000) });
  if (!response.ok) {
    throw new Error(`Failed to download generated video: ${response.status}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(localVideoPath, bytes);

  return { localVideoPath, localVideoUrl };
}

async function readJson(req) {
  const chunks = [];
  const maxBodySize = 15 * 1024 * 1024;
  for await (const chunk of req) {
    chunks.push(chunk);
    if (Buffer.concat(chunks).byteLength > maxBodySize) {
      throw new Error("Request body too large");
    }
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function clampNumber(value, fallback, min, max) {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.max(min, Math.min(max, next));
}

function makeScenePrompt(body) {
  return typeof body.prompt === "string" ? body.prompt : "";
}

function normalizeTask(raw) {
  const task = raw?.data || raw?.task || raw;
  const content = task?.content || raw?.content;
  const videoUrl =
    content?.video_url ||
    content?.[0]?.video_url ||
    task?.output?.video_url ||
    task?.result?.video_url ||
    findVideoUrl(task) ||
    "";

  return {
    taskId: task?.id || task?.task_id || task?.taskId || raw?.id || raw?.task_id || "",
    status: task?.status || task?.state || task?.task_status || raw?.status || "unknown",
    videoUrl,
    error: task?.error?.message || task?.error || raw?.error?.message || raw?.message || "",
  };
}

function findVideoUrl(value) {
  if (!value || typeof value !== "object") return "";
  if (typeof value.video_url === "string") return value.video_url;
  if (typeof value.url === "string" && /\.(mp4|mov|webm)(\?|$)/i.test(value.url)) return value.url;

  for (const item of Object.values(value)) {
    const found = Array.isArray(item)
      ? item.map(findVideoUrl).find(Boolean)
      : findVideoUrl(item);
    if (found) return found;
  }

  return "";
}

function collectImageUrls(value, urls = []) {
  if (!value || typeof value !== "object") return urls;
  if (typeof value.url === "string" && /\.(png|jpe?g|webp)(\?|$)/i.test(value.url)) urls.push(value.url);
  if (typeof value.image_url === "string") urls.push(value.image_url);
  if (typeof value.image === "string" && /^https?:\/\//i.test(value.image)) urls.push(value.image);
  if (typeof value.output === "string" && /^https?:\/\//i.test(value.output)) urls.push(value.output);

  for (const item of Object.values(value)) {
    if (Array.isArray(item)) item.forEach((child) => collectImageUrls(child, urls));
    else collectImageUrls(item, urls);
  }
  return [...new Set(urls)];
}

function collectOutputImageUrls(task) {
  const output = task?.output || task?.result || task?.data?.output || {};
  const direct = [
    ...(Array.isArray(output.images) ? output.images.map((image) => image?.url || image?.image_url) : []),
    output.url,
    output.image_url,
    output.image?.url,
  ].filter(Boolean);
  return direct.length ? direct : collectImageUrls(output);
}

function apizTaskId(task = {}) {
  return task.task_id || task.taskId || task.id || task.data?.task_id || task.data?.id || "";
}

function apizStatus(task = {}) {
  return task.status || task.state || task.task_status || task.data?.status || "submitted";
}

function apizResultUrl(task = {}) {
  return findVideoUrl(task) || collectOutputImageUrls(task)[0] || "";
}

async function settleApizGenerationRecord(record = {}, task = {}, reason = "query") {
  if (!record?.taskId || record.provider !== "apiz" || record.billingSettledAt) return record;
  const status = apizStatus(task) || record.status || "";
  if (!isSucceededStatus(status) && !isFailedStatus(status)) return record;

  const db = await readDb();
  let finalCredits = 0;
  let delta = 0;
  let billingStatus = "settled";
  const preDeducted = creditsAmount(record.preDeductedCredits || 0);

  if (isFailedStatus(status)) {
    finalCredits = 0;
    delta = preDeducted;
    billingStatus = "refunded";
  } else {
    const reported = extractApizReportedCredits(task) ?? (record.createReportedCredits === undefined ? null : creditsAmount(record.createReportedCredits));
    finalCredits = reported === null ? preDeducted : reported;
    delta = preDeducted - finalCredits;
  }

  try {
    if (delta > 0) {
      changeUserCredits(db, record.userId, delta, "generation_refund", {
        taskId: record.taskId,
        reason,
        preDeducted,
        finalCredits,
      });
      await writeDb(db);
    } else if (delta < 0) {
      changeUserCredits(db, record.userId, delta, "generation_settle", {
        taskId: record.taskId,
        reason,
        preDeducted,
        finalCredits,
      });
      await writeDb(db);
    }
  } catch (error) {
    if (error.code === "INSUFFICIENT_CREDITS") {
      billingStatus = "settle_pending_insufficient";
      return upsertGenerationRecord({
        taskId: record.taskId,
        finalCredits,
        billingStatus,
        billingError: error.message || "Not enough credits for final settlement.",
      });
    }
    throw error;
  }

  return upsertGenerationRecord({
    taskId: record.taskId,
    finalCredits,
    billingStatus,
    billingSettledAt: new Date().toISOString(),
    billingError: "",
  });
}

function extractApizReportedCredits(value, depth = 0) {
  if (value === null || value === undefined || depth > 40) return null;
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return null;
    if (text.startsWith("{") || text.startsWith("[")) {
      try {
        return extractApizReportedCredits(JSON.parse(text), depth + 1);
      } catch {
        return null;
      }
    }
    const number = Number(text);
    return Number.isFinite(number) && number >= 0 ? creditsAmount(number) : null;
  }
  if (typeof value === "number") return value >= 0 ? creditsAmount(value) : null;
  if (Array.isArray(value)) {
    let best = null;
    value.forEach((item) => {
      const next = extractApizReportedCredits(item, depth + 1);
      if (next !== null) best = Math.max(best ?? 0, next);
    });
    return best;
  }
  if (typeof value !== "object") return null;

  const billing = value.x_billing ?? value["X-Billing"] ?? value.billing;
  const billingCredits = billing ? extractApizReportedCredits(billing, depth + 1) : null;
  if (billingCredits !== null) return billingCredits;

  const balanceLike = Object.prototype.hasOwnProperty.call(value, "balance") || Object.prototype.hasOwnProperty.call(value, "balance_yuan");
  let best = null;
  for (const [key, item] of Object.entries(value)) {
    const lower = key.toLowerCase();
    if (["balance", "balance_yuan", "remaining", "account", "token"].includes(lower)) continue;
    if (["credits_used", "credits_charged", "credits_final", "credit_cost", "consumed_credits", "usage_credits", "price", "cost"].includes(lower)) {
      const next = extractApizReportedCredits(item, depth + 1);
      if (next !== null) best = Math.max(best ?? 0, next);
    } else if (lower === "credits" && !balanceLike) {
      const next = extractApizReportedCredits(item, depth + 1);
      if (next !== null) best = Math.max(best ?? 0, next);
    } else if (item && typeof item === "object") {
      const next = extractApizReportedCredits(item, depth + 1);
      if (next !== null) best = Math.max(best ?? 0, next);
    } else if (typeof item === "string" && item.trim().startsWith("{")) {
      const next = extractApizReportedCredits(item, depth + 1);
      if (next !== null) best = Math.max(best ?? 0, next);
    }
  }
  return best === null ? null : creditsAmount(best);
}

function publicBilling(record = {}) {
  return {
    preDeducted: creditsAmount(record.preDeductedCredits || 0),
    final: record.finalCredits === undefined || record.finalCredits === null ? null : creditsAmount(record.finalCredits || 0),
    settled: Boolean(record.billingSettledAt),
    status: record.billingStatus || "",
  };
}

function platformImageFieldKeys(payload = {}) {
  const keys = Object.keys(payload || {}).filter((key) => (
    /^image(?:_file)?_\d+$/i.test(key) ||
    /^image_url$/i.test(key) ||
    /^image_files$/i.test(key) ||
    /^filePaths$/i.test(key)
  ));
  if (keys.length) return keys;
  if (Array.isArray(payload.image_urls)) return ["image_urls"];
  return ["image_url"];
}

function replacePlatformPayloadImages(payload = {}, imageUrl = "") {
  if (!imageUrl) return payload;
  const next = { ...payload };
  platformImageFieldKeys(next).forEach((key) => {
    if (["image_urls", "image_files", "filePaths"].includes(key)) {
      next[key] = [imageUrl];
    } else {
      next[key] = imageUrl;
    }
  });
  return next;
}

function platformApizPayload({ template, prompt, imageUrl, overrides = {} }) {
  const configured = template.requestJson && typeof template.requestJson === "object" && !Array.isArray(template.requestJson)
    ? structuredClone(template.requestJson)
    : {};
  const model = resolvePlatformModelId(configured.model || template.model, template.type);
  const params = {
    ...(Object.keys(configured).length ? configured : { ...(template.params || {}), model }),
    ...(overrides && typeof overrides === "object" && !Array.isArray(overrides) ? overrides : {}),
  };
  if (!params.model) params.model = model;
  if (prompt && !params.prompt) params.prompt = prompt;
  if (params.ratio && !params.aspect_ratio) {
    params.aspect_ratio = params.ratio;
  }
  if ((model === "bytedance/seedance-2.0/fast/image-to-video" || model === "bytedance/seedance-2.0/fast/text-to-video") && !params.resolution) {
    params.resolution = "720p";
  }
  if (template.negativePrompt && !params.negative_prompt) params.negative_prompt = template.negativePrompt;
  const replacedParams = replacePlatformPayloadImages(params, imageUrl);
  return {
    model,
    params: replacedParams,
    channel: null,
  };
}

async function handlePlatformGenerate(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;

  const body = await readJson(req);
  const config = await readAppConfig();
  const template = findPlatformTemplate(config, body.templateId);
  if (!template) return sendJson(res, 404, { ok: false, message: "模板不存在或未启用。" });

  let imageUrl = "";
  let userAsset = null;
  if (template.type === "image-to-video") {
    if (body.dataUrl) {
      const { mime, bytes } = decodeDataUrl(body.dataUrl);
      if (bytes.byteLength > 8 * 1024 * 1024) {
        return sendJson(res, 400, { ok: false, message: "图片不能超过 8MB。" });
      }
      const assetId = randomId("asset");
      const fileName = `${assetId}${imageExtFromMime(mime)}`;
      const dir = path.join(USER_UPLOAD_DIR, auth.user.id);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, fileName), bytes);
      userAsset = {
        id: assetId,
        userId: auth.user.id,
        name: String(body.fileName || template.title || "Template upload").slice(0, 60),
        mime,
        localUrl: `/assets/user-uploads/${auth.user.id}/${fileName}`,
        publicUrl: "",
        assetUri: "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: "",
      };
      auth.db.userAssets.unshift(userAsset);
      await writeDb(auth.db);
      userAsset = await ensurePublicUrlForUserAsset(auth.db, userAsset);
      imageUrl = userAsset.publicUrl;
    } else if (body.userAssetId) {
      userAsset = auth.db.userAssets.find((asset) => asset.id === body.userAssetId && asset.userId === auth.user.id && !isSoftDeleted(asset));
      if (!userAsset) return sendJson(res, 404, { ok: false, message: "上传图片不存在。" });
      userAsset = await ensurePublicUrlForUserAsset(auth.db, userAsset);
      imageUrl = userAsset.publicUrl;
    }
    if (!imageUrl) return sendJson(res, 400, { ok: false, message: "这个模板需要先上传一张图片。" });
  }

  const configuredPrompt = typeof template.requestJson?.prompt === "string" ? template.requestJson.prompt : template.prompt;
  const prompt = typeof body.prompt === "string" && body.prompt.trim() ? body.prompt : configuredPrompt;
  if (!String(prompt || "").trim()) return sendJson(res, 400, { ok: false, message: "缺少 prompt。" });

  const upstreamPayload = platformApizPayload({
    template,
    prompt,
    imageUrl,
    overrides: body.params,
  });
  const pricingEstimate = await estimatePlatformPreDeductCredits(upstreamPayload.model, upstreamPayload.params, template);
  const preDeductedCredits = pricingEstimate.credits;
  if (auth.user.credits < preDeductedCredits) {
    return sendJson(res, 402, insufficientCreditsPayload(preDeductedCredits, auth.user.credits));
  }

  if (preDeductedCredits > 0) {
    changeUserCredits(auth.db, auth.user.id, -preDeductedCredits, "generation_pre_deduct", {
      source: "platform-template",
      templateId: template.id,
      templateTitle: template.title,
      pricingSource: pricingEstimate.source,
    });
    await writeDb(auth.db);
  }

  let task;
  try {
    task = await apizRequest("/api/v3/tasks/create", upstreamPayload);
  } catch (error) {
    if (preDeductedCredits > 0) {
      const refundDb = await readDb();
      changeUserCredits(refundDb, auth.user.id, preDeductedCredits, "generation_submit_refund", {
        source: "platform-template",
        templateId: template.id,
        reason: error.message || "submit failed",
      });
      await writeDb(refundDb);
    }
    throw error;
  }
  const taskId = apizTaskId(task);
  if (!taskId) {
    if (preDeductedCredits > 0) {
      const refundDb = await readDb();
      changeUserCredits(refundDb, auth.user.id, preDeductedCredits, "generation_submit_refund", {
        source: "platform-template",
        templateId: template.id,
        reason: "missing task id",
      });
      await writeDb(refundDb);
    }
    const error = new Error(`Generation service did not return task id: ${JSON.stringify(task)}`);
    error.statusCode = 502;
    throw error;
  }

  const record = await upsertGenerationRecord({
    taskId,
    status: apizStatus(task),
    model: upstreamPayload.model,
    provider: "apiz",
    source: "platform-template",
    kind: template.type,
    templateId: template.id,
    templateTitle: template.title,
    userId: auth.user.id,
    userAssetId: userAsset?.id || "",
    imageUrl,
    prompt,
    finalPrompt: prompt,
    params: upstreamPayload.params,
    upstreamPayload,
    preDeductedCredits,
    pricingEstimate: {
      source: pricingEstimate.source,
      pricing: pricingEstimate.pricing || null,
    },
    finalCredits: null,
    billingStatus: preDeductedCredits > 0 ? "pre_deducted" : "free",
    billingSettledAt: "",
    billingError: "",
    createResponse: task,
    createReportedCredits: extractApizReportedCredits(task),
    remoteVideoUrl: apizResultUrl(task),
    localVideoUrl: "",
    error: "",
  });
  const settledRecord = await settleApizGenerationRecord(record, task, "create");
  const latestDb = await readDb();
  const latestUser = latestDb.users.find((user) => user.id === auth.user.id) || auth.user;

  return sendJson(res, 200, {
    ok: true,
    task,
    taskId,
    record: publicGenerationRecord(settledRecord),
    user: userView(latestUser),
  });
}

async function handleAdvancedAccessRequest(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  if (!auth.user.advancedAccessRequestedAt) {
    auth.user.advancedAccessRequestedAt = new Date().toISOString();
    auth.user.updatedAt = new Date().toISOString();
    await writeDb(auth.db);
  }
  return sendJson(res, 200, { ok: true, user: userView(auth.user) });
}

async function handleAdvancedGenerate(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  if (auth.user.role !== "admin" && auth.user.advancedAccess !== true) {
    return sendJson(res, 403, { ok: false, code: "ADVANCED_ACCESS_REQUIRED", message: "Advanced generation requires approval." });
  }
  if (!ARK_API_KEY) {
    return sendJson(res, 503, { ok: false, code: "MISSING_ARK_API_KEY", message: "Seedance generation is not configured." });
  }

  const body = await readJson(req);
  const config = await readAppConfig();
  const advanced = config.platform?.advanced || {};
  const cases = Array.isArray(advanced.cases) ? advanced.cases : [];
  const selectedCase = cases.find((item) => item.id === String(body.caseId || "").trim());
  const caseParams = selectedCase?.params && typeof selectedCase.params === "object" ? selectedCase.params : {};
  const prompt = String(body.prompt || selectedCase?.prompt || caseParams.prompt || "").trim();
  if (!prompt) return sendJson(res, 400, { ok: false, message: "Prompt is required." });

  const requestParams = {
    ...caseParams,
    ratio: body.ratio || caseParams.ratio || caseParams.aspect_ratio || config.video.ratio || "9:16",
    resolution: body.resolution || caseParams.resolution || config.video.resolution || "720p",
    duration: clampNumber(body.duration ?? caseParams.duration, config.video.duration || 5, 5, 15),
    generateAudio: body.generateAudio !== false,
  };
  const cost = creditsAmount(selectedCase?.price ?? config.prices.dateVideo ?? DEFAULT_CONFIG.prices.dateVideo);
  if (auth.user.credits < cost) {
    return sendJson(res, 402, insufficientCreditsPayload(cost, auth.user.credits));
  }

  const { task, payload } = await submitSeedanceVideoTask({
    config,
    prompt,
    body: requestParams,
    slug: "advanced",
  });

  if (cost > 0) {
    changeUserCredits(auth.db, auth.user.id, -cost, "advanced_generation", {
      taskId: task.taskId,
      caseId: selectedCase?.id || "",
      caseTitle: selectedCase?.title || "",
    });
    await writeDb(auth.db);
  }

  const record = await upsertGenerationRecord({
    taskId: task.taskId,
    status: task.status,
    model: MODEL_QUALITY,
    provider: "seedance",
    source: "advanced-seedance",
    kind: "advanced-video",
    templateId: selectedCase?.id || "",
    templateTitle: selectedCase?.title || "Advanced generation",
    userId: auth.user.id,
    prompt,
    finalPrompt: prompt,
    params: requestParams,
    ratio: payload.ratio,
    resolution: payload.resolution,
    duration: payload.duration,
    quality: "high",
    remoteVideoUrl: task.videoUrl || "",
    localVideoUrl: "",
    error: "",
    preDeductedCredits: cost,
    finalCredits: cost,
    billingStatus: cost > 0 ? "settled" : "free",
    billingSettledAt: new Date().toISOString(),
  });
  const latestDb = await readDb();
  const latestUser = latestDb.users.find((user) => user.id === auth.user.id) || auth.user;
  return sendJson(res, 200, {
    ok: true,
    task,
    taskId: task.taskId,
    record: publicGenerationRecord(record),
    user: userView(latestUser),
    cost,
  });
}

async function handleAdminUploadPlatformCover(req, res) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const body = await readJson(req);
  const { mime, bytes } = decodeImageDataUrl(body.dataUrl || "");
  if (bytes.byteLength > 4 * 1024 * 1024) {
    return sendJson(res, 400, { ok: false, message: "Cover image must be 4MB or smaller." });
  }
  const safeName = String(body.name || "platform-cover").trim().replace(/[^a-z0-9_-]/gi, "-").slice(0, 50) || "platform-cover";
  const fileName = `${safeName}-${Date.now()}${imageExtFromMime(mime)}`;
  await fs.mkdir(ADMIN_HOME_DIR, { recursive: true });
  await fs.writeFile(path.join(ADMIN_HOME_DIR, fileName), bytes);
  return sendJson(res, 200, { ok: true, url: `/assets/admin/home/${fileName}` });
}

async function makePlatformEstimate(template, overrides = {}) {
  const prompt =
    typeof overrides.prompt === "string" && overrides.prompt.trim()
      ? overrides.prompt
      : template.prompt || "";
  const upstreamPayload = platformApizPayload({
    template,
    prompt,
    imageUrl: "",
    overrides: overrides.params,
  });
  const pricingEstimate = await estimatePlatformPreDeductCredits(upstreamPayload.model, upstreamPayload.params, template);
  const durationSeconds = durationSecondsFromParams(upstreamPayload.params) || apizPricingNumber(pricingEstimate.pricing?._default_duration_seconds) || 0;
  return {
    templateId: template.id,
    credits: creditsAmount(pricingEstimate.credits),
    source: pricingEstimate.source,
    model: upstreamPayload.model,
    requestModel: upstreamPayload.params.model || upstreamPayload.model,
    durationSeconds,
    available: true,
  };
}

async function handlePlatformEstimates(req, res, url) {
  const config = await readAppConfig();
  const requestedTemplateId = String(url.searchParams.get("templateId") || "").trim();
  const platform = normalizePlatformConfig(config.platform || {});
  const templates = requestedTemplateId
    ? platform.templates.filter((template) => template.id === requestedTemplateId)
    : platform.templates;

  if (requestedTemplateId && !templates.length) {
    return sendJson(res, 404, { ok: false, message: "Template not found." });
  }

  const estimates = await Promise.all(templates.map(async (template) => {
    try {
      return await makePlatformEstimate(template);
    } catch (error) {
      return {
        templateId: template.id,
        credits: null,
        source: "",
        available: false,
        code: error.code || "PRICING_UNAVAILABLE",
        message: error.message || "Pricing is unavailable.",
      };
    }
  }));

  return sendJson(res, 200, { ok: true, estimates });
}

async function refreshApizGenerationRecord(record) {
  if (record.provider !== "apiz") return record;
  const task = await apizRequest("/api/v3/tasks/query", { task_id: record.taskId });
  const resultUrl = apizResultUrl(task);
  const nextRecord = await upsertGenerationRecord({
    taskId: record.taskId,
    status: apizStatus(task),
    remoteVideoUrl: resultUrl || record.remoteVideoUrl || "",
    videoUrl: resultUrl || record.videoUrl || "",
    error: task.error?.message || task.error || task.message || "",
    queryResponse: task,
  });
  return settleApizGenerationRecord(nextRecord, task, "query");
}

function isCompletedStatus(status) {
  return ["completed", "succeeded", "success", "done"].includes(String(status || "").toLowerCase());
}

async function downloadGeneratedCharacterSheet(taskId, imageUrl) {
  await fs.mkdir(path.join(GENERATED_CHARACTER_DIR, taskId), { recursive: true });
  const ext = path.extname(new URL(imageUrl).pathname).toLowerCase() || ".png";
  const fileName = `sheet${[".png", ".jpg", ".jpeg", ".webp"].includes(ext) ? ext : ".png"}`;
  const localPath = path.join(GENERATED_CHARACTER_DIR, taskId, fileName);
  const localUrl = `/assets/generated/characters/apiz/${taskId}/${fileName}`;
  try {
    await fs.access(localPath);
    return { localPath, localUrl };
  } catch {
    // Continue and download.
  }

  const response = await fetch(imageUrl);
  if (!response.ok) {
    const error = new Error(`Failed to download character sheet: ${response.status}`);
    error.statusCode = 502;
    throw error;
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(localPath, bytes);
  return { localPath, localUrl };
}

async function downloadGeneratedPanorama(taskId, imageUrl, slug = "panorama") {
  await fs.mkdir(GENERATED_PANORAMA_DIR, { recursive: true });
  const safeSlug = String(slug || "panorama").replace(/[^a-z0-9_-]/gi, "-").slice(0, 60);
  const fileName = `${safeSlug}-${String(taskId).replace(/[^a-z0-9_-]/gi, "_")}.png`;
  const localPath = path.join(GENERATED_PANORAMA_DIR, fileName);
  const localUrl = `/assets/generated/panoramas/${fileName}`;
  try {
    await fs.access(localPath);
    return { localPath, localUrl };
  } catch {
    // Continue and download.
  }

  const response = await fetch(imageUrl);
  if (!response.ok) {
    const error = new Error(`Failed to download panorama: ${response.status}`);
    error.statusCode = 502;
    throw error;
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(localPath, bytes);
  return { localPath, localUrl };
}

async function arkRequest(method, pathname, body) {
  if (!ARK_API_KEY) {
    const error = new Error("Missing ARK_API_KEY");
    error.code = "MISSING_ARK_API_KEY";
    throw error;
  }

  const maxAttempts = method === "GET" ? 3 : 2;
  let response;
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      response = await fetch(`${ARK_BASE_URL}${pathname}`, {
        method,
        headers: {
          authorization: `Bearer ${ARK_API_KEY}`,
          "content-type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      break;
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 900));
      }
    }
  }

  if (!response) {
    const error = new Error(`Ark request failed: ${lastError?.cause?.code || lastError?.message || "fetch failed"}`);
    error.code = "ARK_FETCH_FAILED";
    error.cause = lastError;
    throw error;
  }

  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};

  if (!response.ok) {
    const error = new Error(payload?.error?.message || payload?.message || `Ark request failed: ${response.status}`);
    error.statusCode = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

function createDemoTask(body) {
  const taskId = `demo-${Date.now()}`;
  demoTasks.set(taskId, {
    taskId,
    createdAt: Date.now(),
    prompt: makeScenePrompt(body),
  });
  return { taskId, status: "queued", demo: true };
}

function getDemoTask(taskId) {
  const task = demoTasks.get(taskId);
  if (!task) return null;

  const elapsed = Date.now() - task.createdAt;
  if (elapsed < 5000) return { ...task, status: "queued", progress: 18, demo: true };
  if (elapsed < 14000) return { ...task, status: "running", progress: 58, demo: true };
  return {
    ...task,
    status: "succeeded",
    progress: 100,
    videoUrl: "",
    demo: true,
  };
}

async function handleRegister(req, res) {
  const body = await readJson(req);
  const username = String(body.username || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (!/^[a-z0-9_]{3,24}$/.test(username)) {
    return sendJson(res, 400, { ok: false, message: "Username must be 3-24 chars: letters, digits or underscores." });
  }
  if (password.length < 6) {
    return sendJson(res, 400, { ok: false, message: "Password must be at least 6 characters." });
  }

  const db = await readDb();
  if (db.users.some((user) => user.username === username)) {
    return sendJson(res, 409, { ok: false, message: "Username already exists — please sign in." });
  }

  const now = new Date().toISOString();
  const user = {
    id: randomId("user"),
    username,
    passwordHash: hashPassword(password),
    role: db.users.length === 0 ? "admin" : "user",
    credits: 0,
    createdAt: now,
    updatedAt: now,
  };
  const token = crypto.randomBytes(32).toString("hex");
  db.users.push(user);
  db.sessions.push({ token, userId: user.id, createdAt: now });
  await writeDb(db);
  return sendJson(res, 200, { ok: true, token, user: userView(user) });
}

async function handleLogin(req, res) {
  const body = await readJson(req);
  const username = String(body.username || "").trim().toLowerCase();
  const password = String(body.password || "");
  const db = await readDb();
  const user = db.users.find((item) => item.username === username);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return sendJson(res, 401, { ok: false, message: "Wrong username or password." });
  }

  const token = crypto.randomBytes(32).toString("hex");
  db.sessions.push({ token, userId: user.id, createdAt: new Date().toISOString() });
  await writeDb(db);
  return sendJson(res, 200, { ok: true, token, user: userView(user) });
}

async function handleMe(req, res) {
  const auth = await getAuth(req);
  return sendJson(res, 200, { ok: true, user: userView(auth.user) });
}

async function handleCreatePaymentOrder(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;

  const body = await readJson(req);
  const config = await readAppConfig();
  const amount = Number(body.amount || 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    return sendJson(res, 400, { ok: false, message: "Top-up amount is invalid." });
  }

  const suffixDigits = clampNumber(config.wallet.suffixDigits, 6, 3, 6);
  const payment = makeUniquePaymentAmount(amount, suffixDigits);
  const creditAmount = walletCreditsForUsdtAmount(payment.amount, config.wallet);
  const order = {
    id: randomId("order"),
    userId: auth.user.id,
    baseAmount: payment.amount,
    creditAmount,
    cnyCentsPerUsdt: walletCnyCentsPerUsdt(config.wallet),
    suffix: payment.suffix,
    payableAmount: payment.payableAmount,
    payableAmountText: payment.payableAmountText,
    asset: config.wallet.asset,
    network: config.wallet.network,
    address: config.wallet.address,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  auth.db.walletOrders.unshift(order);
  await writeDb(auth.db);
  return sendJson(res, 200, { ok: true, order });
}

async function handleListPaymentOrders(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const orders = auth.db.walletOrders.filter((order) => order.userId === auth.user.id).slice(0, 20);
  return sendJson(res, 200, { ok: true, orders });
}

async function handleSpendCredits(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const body = await readJson(req);
  const cost = clampNumber(body.cost, 0, 0, 9999);
  if (cost <= 0) return sendJson(res, 400, { ok: false, message: "Spend amount is invalid." });
  if (auth.user.credits < cost) {
    return sendJson(res, 402, insufficientCreditsPayload(cost, auth.user.credits));
  }
  auth.user.credits -= cost;
  auth.user.updatedAt = new Date().toISOString();
  await writeDb(auth.db);
  return sendJson(res, 200, { ok: true, user: userView(auth.user), cost, label: String(body.label || "") });
}

async function handleListUnlocks(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const unlocks = (auth.db.userUnlocks || [])
    .filter((record) => record.userId === auth.user.id && !isSoftDeleted(record))
    .map(publicUserUnlock);
  return sendJson(res, 200, { ok: true, unlocks });
}

async function handleUnlockVideo(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;

  const body = await readJson(req);
  const itemId = String(body.itemId || "").trim();
  const sceneId = String(body.sceneId || "").trim();
  const sceneEntryId = String(body.sceneEntryId || "").trim();
  if (!itemId || !sceneId) {
    return sendJson(res, 400, { ok: false, message: "Missing itemId or sceneId." });
  }

  let config = await readAppConfig();
  config.homeVideo = normalizeHomeVideo(config.homeVideo || {});
  const item = findHomeVideoItem(config.homeVideo, itemId);
  if (!item) return sendJson(res, 404, { ok: false, message: "Character not found." });

  const match = findUnlockVideoForItem(item, sceneId, sceneEntryId);
  if (!match) return sendJson(res, 404, { ok: false, message: "No unlock video for this scene yet." });

  const video = match.entry;
  const videoUrl = getUnlockVideoUrl(video);
  if (!videoUrl) {
    return sendJson(res, 409, { ok: false, message: "Unlock video is still generating.", video: publicUnlockVideo(video, match.key) });
  }

  const unlockSceneEntryId = video.sceneEntryId || "default";
  let unlock = findUserUnlock(auth.db, auth.user.id, item.id, video.sceneId, unlockSceneEntryId);
  const cost = clampNumber(video.price, config.prices?.unlockVideo || DEFAULT_CONFIG.prices.unlockVideo, 0, 9999);
  let charged = false;

  if (!unlock) {
    if (auth.user.credits < cost) {
      return sendJson(res, 402, insufficientCreditsPayload(cost, auth.user.credits));
    }
    auth.user.credits -= cost;
    auth.user.updatedAt = new Date().toISOString();
    unlock = {
      id: randomId("unlock"),
      userId: auth.user.id,
      itemId: item.id,
      itemName: item.name || "",
      sceneId: video.sceneId,
      sceneName: video.sceneName || "",
      sceneEntryId: unlockSceneEntryId,
      sceneEntryName: video.sceneEntryName || "",
      videoKey: match.key,
      cost,
      createdAt: new Date().toISOString(),
      deletedAt: "",
    };
    auth.db.userUnlocks.unshift(unlock);
    charged = cost > 0;
    await writeDb(auth.db);
  }

  const unlocks = (auth.db.userUnlocks || [])
    .filter((record) => record.userId === auth.user.id && !isSoftDeleted(record))
    .map(publicUserUnlock);
  return sendJson(res, 200, {
    ok: true,
    charged,
    cost: charged ? cost : 0,
    user: userView(auth.user),
    unlock: publicUserUnlock(unlock),
    unlocks,
    video: {
      ...publicUnlockVideo(video, match.key),
      videoUrl: secureUnlockVideoUrl({
        userId: auth.user.id,
        itemId: item.id,
        sceneId: video.sceneId,
        sceneEntryId: unlockSceneEntryId,
        videoKey: match.key,
      }),
    },
  });
}

async function streamVideoFile(req, res, filePath) {
  const stat = await fs.stat(filePath);
  const range = req.headers.range;
  if (range) {
    const match = range.match(/bytes=(\d*)-(\d*)/);
    const start = match?.[1] ? Number(match[1]) : 0;
    const end = match?.[2] ? Number(match[2]) : stat.size - 1;
    const chunkStart = Math.max(0, start);
    const chunkEnd = Math.min(stat.size - 1, end);

    if (chunkStart > chunkEnd || Number.isNaN(chunkStart) || Number.isNaN(chunkEnd)) {
      res.writeHead(416, { "content-range": `bytes */${stat.size}` });
      return res.end();
    }

    res.writeHead(206, {
      "content-type": "video/mp4",
      "content-length": chunkEnd - chunkStart + 1,
      "content-range": `bytes ${chunkStart}-${chunkEnd}/${stat.size}`,
      "accept-ranges": "bytes",
      "cache-control": "private, no-store",
    });
    if (req.method === "HEAD") return res.end();
    return fsSync.createReadStream(filePath, { start: chunkStart, end: chunkEnd }).pipe(res);
  }

  res.writeHead(200, {
    "content-type": "video/mp4",
    "content-length": stat.size,
    "accept-ranges": "bytes",
    "cache-control": "private, no-store",
  });
  if (req.method === "HEAD") return res.end();
  return fsSync.createReadStream(filePath).pipe(res);
}

async function handleStreamUnlockVideo(req, res, token) {
  const payload = parseUnlockStreamToken(token);
  if (!payload) return sendJson(res, 403, { ok: false, message: "Unlock video link expired." });

  const db = await readDb();
  const user = db.users.find((entry) => entry.id === payload.userId && !isSoftDeleted(entry));
  if (!user) return sendJson(res, 401, { ok: false, message: "Please sign in to continue." });
  const unlock = findUserUnlock(db, user.id, payload.itemId, payload.sceneId, payload.sceneEntryId || "default");
  if (!unlock) return sendJson(res, 403, { ok: false, message: "Unlock required." });

  let config = await readAppConfig();
  config.homeVideo = normalizeHomeVideo(config.homeVideo || {});
  const item = findHomeVideoItem(config.homeVideo, payload.itemId);
  const match = item ? findUnlockVideoForItem(item, payload.sceneId, payload.sceneEntryId || "default") : null;
  if (!match) return sendJson(res, 404, { ok: false, message: "Unlock video not found." });

  const videoUrl = getUnlockVideoUrl(match.entry);
  if (!videoUrl) return sendJson(res, 409, { ok: false, message: "Unlock video is still generating." });
  if (/^https?:\/\//i.test(videoUrl)) return res.writeHead(302, { location: videoUrl }).end();

  const localPath = path.normalize(path.join(ROOT, videoUrl.replace(/^\//, "")));
  const generatedRoot = path.normalize(GENERATED_VIDEO_DIR);
  if (!localPath.startsWith(generatedRoot)) return sendJson(res, 403, { ok: false, message: "Forbidden." });
  return streamVideoFile(req, res, localPath);
}

async function handleUploadUserAsset(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;

  const body = await readJson(req);
  const { mime, bytes } = decodeDataUrl(body.dataUrl);
  if (bytes.byteLength > 8 * 1024 * 1024) {
    return sendJson(res, 400, { ok: false, message: "Image must be 8MB or smaller." });
  }

  const assetId = randomId("asset");
  const fileName = `${assetId}${imageExtFromMime(mime)}`;
  const dir = path.join(USER_UPLOAD_DIR, auth.user.id);
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, fileName);
  await fs.writeFile(filePath, bytes);

  const userAsset = {
    id: assetId,
    userId: auth.user.id,
    name: String(body.name || "Upload").slice(0, 60),
    mime,
    localUrl: `/assets/user-uploads/${auth.user.id}/${fileName}`,
    publicUrl: PUBLIC_BASE_URL ? `${PUBLIC_BASE_URL}/assets/user-uploads/${auth.user.id}/${fileName}` : "",
    assetUri: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: "",
  };
  auth.db.userAssets.unshift(userAsset);
  await writeDb(auth.db);
  return sendJson(res, 200, { ok: true, asset: userAsset });
}

async function handleListUserAssets(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const assets = auth.db.userAssets
    .filter((asset) => asset.userId === auth.user.id && !isSoftDeleted(asset))
    .slice(0, 50);
  return sendJson(res, 200, { ok: true, assets });
}

async function handleDeleteUserAsset(req, res, assetId) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const asset = auth.db.userAssets.find((entry) => entry.id === assetId && entry.userId === auth.user.id);
  if (!asset || isSoftDeleted(asset)) {
    return sendJson(res, 404, { ok: false, message: "Asset not found." });
  }
  const nowIso = new Date().toISOString();
  asset.deletedAt = nowIso;
  asset.updatedAt = nowIso;
  auth.db.userAssets = auth.db.userAssets.map((entry) => (entry.id === asset.id ? asset : entry));
  await writeDb(auth.db);
  return sendJson(res, 200, { ok: true, asset });
}

const USER_CHARACTER_DIR = path.join(ROOT, "assets", "user-characters");

function publicUserCharacter(character) {
  if (!character) return null;
  return {
    id: character.id,
    name: character.name || "My character",
    title: character.title || "My drama",
    posterUrl: character.posterUrl || character.localImageUrl || "",
    videoUrl: character.videoUrl || character.localVideoUrl || "",
    taskId: character.taskId || "",
    status: character.status || "",
    error: character.error || "",
    referenceAssetUri: character.referenceAssetUri || "",
    sceneVideos: publicSceneVideoMap(character.sceneVideos || {}),
    deletedAt: character.deletedAt || "",
    createdAt: character.createdAt || "",
    updatedAt: character.updatedAt || "",
  };
}

async function ensureCharacterReferenceForRecord(record) {
  if (record.referenceAssetUri) return record;
  const sourceUrl = record.sourceImageUrl || record.localImageUrl || record.posterUrl;
  if (!sourceUrl || /^https?:\/\//i.test(sourceUrl)) {
    const error = new Error("Character image must be uploaded locally first before creating the upstream asset.");
    error.statusCode = 400;
    throw error;
  }

  if (!record.syntheticReferenceLocalUrl) {
    requireValue("APIZ_API_KEY", APIZ_API_KEY);
    const sourcePath = path.join(ROOT, sourceUrl.replace(/^\//, ""));
    const sourceBytes = await fs.readFile(sourcePath);
    const uploaded = await uploadBufferToTos({
      userId: record.userId || "user",
      assetId: `${record.id}-source`,
      bytes: sourceBytes,
      mime: record.sourceImageMime || record.imageMime || imageMimeFromPath(sourcePath),
    });
    const refPrompt = makeHomeSyntheticReferencePrompt(record);
    const model = process.env.HOME_REFERENCE_MODEL || process.env.OFFICIAL_PRESET_MODEL || DEFAULT_CONFIG.characterImage.editModel;
    const created = await apizRequest("/api/v3/tasks/create", {
      model,
      params: {
        prompt: refPrompt,
        image_urls: [uploaded.publicUrl],
        image_size: "auto_3K",
        num_images: 1,
        max_images: 1,
        enhance_prompt_mode: "standard",
      },
      channel: null,
    });
    const taskId = created.task_id || created.taskId || created.id;
    if (!taskId) {
      const error = new Error(`Seedream did not return task id: ${JSON.stringify(created)}`);
      error.statusCode = 502;
      throw error;
    }

    let task = created;
    for (let attempt = 0; attempt < 90; attempt += 1) {
      await delay(5000);
      task = await apizRequest("/api/v3/tasks/query", { task_id: taskId });
      if (isCompletedStatus(task.status)) break;
      if (isFailedStatus(task.status)) {
        const error = new Error(`Character synthetic reference failed: ${task.error || task.message || JSON.stringify(task)}`);
        error.statusCode = 502;
        throw error;
      }
    }
    if (!isCompletedStatus(task.status)) {
      const error = new Error(`Character synthetic reference timed out: ${taskId}`);
      error.statusCode = 504;
      throw error;
    }
    const imageUrl = collectOutputImageUrls(task)[0];
    if (!imageUrl) {
      const error = new Error(`Character synthetic reference returned no image: ${taskId}`);
      error.statusCode = 502;
      throw error;
    }

    const fileName = `ref-${String(record.id).replace(/[^a-z0-9_-]/gi, "-")}-${Date.now()}.png`;
    const localPath = path.join(USER_CHARACTER_DIR, record.userId || "user", fileName);
    await fs.mkdir(path.dirname(localPath), { recursive: true });
    const response = await fetch(imageUrl, { signal: AbortSignal.timeout(180000) });
    if (!response.ok) {
      const error = new Error(`Failed to download synthetic reference: ${response.status}`);
      error.statusCode = 502;
      throw error;
    }
    const refBytes = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(localPath, refBytes);

    record.syntheticReferenceLocalUrl = `/assets/user-characters/${record.userId || "user"}/${fileName}`;
    record.syntheticReferenceUrl = imageUrl;
    record.syntheticReferenceTaskId = taskId;
    record.syntheticReferenceModel = model;
    record.syntheticReferencePrompt = refPrompt;
    record.posterUrl = record.syntheticReferenceLocalUrl;
    record.localImageUrl = record.syntheticReferenceLocalUrl;
    record.imageMime = "image/png";
    record.sourcePublicUrl = uploaded.publicUrl;
    record.sourceTosKey = uploaded.key;
    record.status = "reference_ready";
    record.updatedAt = new Date().toISOString();
  }

  const localUrl = record.syntheticReferenceLocalUrl || record.localImageUrl || record.posterUrl;
  const localPath = path.join(ROOT, localUrl.replace(/^\//, ""));
  const refBytes = await fs.readFile(localPath);
  const uploadedRef = await uploadBufferToTos({
    userId: record.userId || "user",
    assetId: `${record.id}-ref`,
    bytes: refBytes,
    mime: record.imageMime || imageMimeFromPath(localPath),
  });
  const created = await arkOpenApiAction("CreateAsset", {
    GroupId: ARK_OPENAPI.groupId,
    URL: uploadedRef.publicUrl,
    AssetType: "Image",
    Name: `raising-game-user-${record.id}-${Date.now()}`,
    ProjectName: ARK_OPENAPI.projectName,
  });
  const assetId = extractAssetId(created);
  if (!assetId) {
    const error = new Error(`CreateAsset did not return asset id: ${JSON.stringify(created)}`);
    error.statusCode = 502;
    throw error;
  }

  record.publicImageUrl = uploadedRef.publicUrl;
  record.referenceAssetUri = `asset://${assetId}`;
  record.tosKey = uploadedRef.key;
  record.updatedAt = new Date().toISOString();
  return record;
}

async function finalizeUserCharacterMainVideoSubmit(auth, prepared, config, cost, userPrompt, seedanceBody = {}) {
  const prompt = makeHomeVideoPrompt(prepared, userPrompt, { decorate: true });
  const { task, payload } = await submitSeedanceVideoTask({
    config,
    prompt,
    referenceAssetUri: prepared.referenceAssetUri,
    body: { ...seedanceBody, generateAudio: true },
    slug: `user-character-${prepared.id}`,
  });

  auth.user.credits -= cost;
  auth.user.updatedAt = new Date().toISOString();
  await writeDb(auth.db);

  prepared.taskId = task.taskId;
  prepared.status = task.status;
  prepared.videoUrl = task.videoUrl || "";
  prepared.remoteVideoUrl = task.videoUrl || "";
  prepared.prompt = userPrompt || prompt;
  prepared.userPrompt = userPrompt;
  prepared.finalPrompt = prompt;
  prepared.updatedAt = new Date().toISOString();
  auth.db.userCharacters = auth.db.userCharacters.map((entry) => (entry.id === prepared.id ? { ...entry, ...prepared } : entry));
  await writeDb(auth.db);

  await upsertGenerationRecord({
    taskId: task.taskId,
    status: task.status,
    model: MODEL_QUALITY,
    sceneId: "user-character",
    sceneName: prepared.title || "User custom character",
    companionId: prepared.id,
    companionName: prepared.name,
    userId: auth.user.id,
    referenceAssetUri: prepared.referenceAssetUri,
    prompt: prompt,
    finalPrompt: prompt,
    ratio: payload.ratio,
    resolution: payload.resolution,
    duration: payload.duration,
    quality: "high",
    remoteVideoUrl: task.videoUrl || "",
    localVideoUrl: "",
    error: "",
    source: "user-character",
  });

  return { task, payload };
}

async function handleSaveMyCharacterDraft(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const body = await readJson(req);
  const { mime, bytes } = decodeDataUrl(body.dataUrl || "");
  if (bytes.byteLength > 8 * 1024 * 1024) {
    return sendJson(res, 400, { ok: false, message: "Image must be 8MB or smaller." });
  }
  const name = String(body.name || "").trim().slice(0, 32);
  if (!name) {
    return sendJson(res, 400, { ok: false, message: "Name is required." });
  }
  const title = String(body.title || "My drama").trim().slice(0, 32) || "My drama";

  const characterId = randomId("mychar");
  const fileName = `${characterId}-source${imageExtFromMime(mime)}`;
  const dir = path.join(USER_CHARACTER_DIR, auth.user.id);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, fileName), bytes);
  const localUrl = `/assets/user-characters/${auth.user.id}/${fileName}`;

  const nowIso = new Date().toISOString();
  const record = {
    id: characterId,
    userId: auth.user.id,
    name,
    title,
    posterUrl: localUrl,
    localImageUrl: localUrl,
    sourceImageUrl: localUrl,
    imageMime: mime,
    sourceImageMime: mime,
    publicImageUrl: "",
    referenceAssetUri: "",
    syntheticReferenceLocalUrl: "",
    syntheticReferenceUrl: "",
    syntheticReferenceTaskId: "",
    videoUrl: "",
    localVideoUrl: "",
    taskId: "",
    status: "draft",
    prompt: typeof body.prompt === "string" ? body.prompt : "",
    sceneVideos: {},
    deletedAt: "",
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  auth.db.userCharacters.unshift(record);
  await writeDb(auth.db);

  return sendJson(res, 200, { ok: true, character: publicUserCharacter(record) });
}

async function handleCreateMyCharacter(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const body = await readJson(req);
  const { mime, bytes } = decodeDataUrl(body.dataUrl || "");
  if (bytes.byteLength > 8 * 1024 * 1024) {
    return sendJson(res, 400, { ok: false, message: "Image must be 8MB or smaller." });
  }

  if (!ARK_API_KEY) {
    return sendJson(res, 503, { ok: false, code: "MISSING_ARK_API_KEY", message: "ARK_API_KEY is missing — character video tasks cannot be submitted." });
  }
  if (!APIZ_API_KEY) {
    return sendJson(res, 503, { ok: false, code: "GENERATION_SERVICE_NOT_CONFIGURED", message: "Generation service is not configured." });
  }

  const config = await readAppConfig();
  const cost = clampNumber(body.cost, Number(config.prices.customCharacter || 30), 0, 9999);
  if (auth.user.credits < cost) {
    return sendJson(res, 402, insufficientCreditsPayload(cost, auth.user.credits));
  }

  const characterId = randomId("mychar");
  const fileName = `${characterId}-source${imageExtFromMime(mime)}`;
  const dir = path.join(USER_CHARACTER_DIR, auth.user.id);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, fileName), bytes);
  const localUrl = `/assets/user-characters/${auth.user.id}/${fileName}`;

  const nowIso = new Date().toISOString();
  const record = {
    id: characterId,
    userId: auth.user.id,
    name: String(body.name || "My character").trim().slice(0, 32) || "My character",
    title: String(body.title || "My drama").trim().slice(0, 32) || "My drama",
    posterUrl: localUrl,
    localImageUrl: localUrl,
    sourceImageUrl: localUrl,
    imageMime: mime,
    sourceImageMime: mime,
    publicImageUrl: "",
    referenceAssetUri: "",
    syntheticReferenceLocalUrl: "",
    syntheticReferenceUrl: "",
    syntheticReferenceTaskId: "",
    videoUrl: "",
    localVideoUrl: "",
    taskId: "",
    status: "image_uploaded",
    prompt: typeof body.prompt === "string" ? body.prompt : "",
    sceneVideos: {},
    deletedAt: "",
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  auth.db.userCharacters.unshift(record);
  await writeDb(auth.db);

  let prepared;
  try {
    prepared = await ensureCharacterReferenceForRecord({ ...record });
  } catch (error) {
    record.status = "reference_failed";
    record.error = error.message || "Failed to create upstream asset.";
    auth.db.userCharacters = auth.db.userCharacters.map((entry) => (entry.id === record.id ? record : entry));
    await writeDb(auth.db);
    throw error;
  }

  const userPrompt = typeof body.prompt === "string" ? body.prompt : "";
  const { task } = await finalizeUserCharacterMainVideoSubmit(auth, prepared, config, cost, userPrompt, body);

  return sendJson(res, 200, {
    ok: true,
    character: publicUserCharacter(prepared),
    task: { taskId: task.taskId, status: task.status, videoUrl: task.videoUrl || "" },
    user: userView(auth.user),
    cost,
  });
}

async function handleStartMyCharacterMainVideo(req, res, characterId) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const body = await readJson(req);
  const record = auth.db.userCharacters.find((entry) => entry.id === characterId && entry.userId === auth.user.id && !isSoftDeleted(entry));
  if (!record) {
    return sendJson(res, 404, { ok: false, message: "Character not found." });
  }
  if (record.taskId) {
    return sendJson(res, 400, { ok: false, message: "Main video task already exists for this character — use refresh to check progress." });
  }
  const existingVideo = String(record.videoUrl || record.localVideoUrl || "").trim();
  if (existingVideo) {
    return sendJson(res, 400, { ok: false, message: "This character already has a main video." });
  }

  const st = String(record.status || "").toLowerCase();
  const canStart = st === "draft" || st === "reference_failed" || st === "image_uploaded";
  if (!canStart) {
    return sendJson(res, 400, { ok: false, message: "This character cannot start main video generation from its current status." });
  }

  if (!ARK_API_KEY) {
    return sendJson(res, 503, { ok: false, code: "MISSING_ARK_API_KEY", message: "ARK_API_KEY is missing — character video tasks cannot be submitted." });
  }
  if (!APIZ_API_KEY) {
    return sendJson(res, 503, { ok: false, code: "GENERATION_SERVICE_NOT_CONFIGURED", message: "Generation service is not configured." });
  }

  const config = await readAppConfig();
  const cost = clampNumber(body.cost, Number(config.prices.customCharacter || 30), 0, 9999);
  if (auth.user.credits < cost) {
    return sendJson(res, 402, insufficientCreditsPayload(cost, auth.user.credits));
  }

  if (st === "reference_failed") {
    record.referenceAssetUri = "";
    record.syntheticReferenceLocalUrl = "";
    record.syntheticReferenceUrl = "";
    record.syntheticReferenceTaskId = "";
    record.publicImageUrl = "";
    record.tosKey = "";
    record.error = "";
    const src = record.sourceImageUrl || record.localImageUrl || record.posterUrl;
    if (src) {
      record.posterUrl = src;
      record.localImageUrl = src;
    }
    record.status = "draft";
    auth.db.userCharacters = auth.db.userCharacters.map((entry) => (entry.id === record.id ? record : entry));
    await writeDb(auth.db);
  }

  let prepared;
  try {
    prepared = await ensureCharacterReferenceForRecord({ ...record });
  } catch (error) {
    record.status = "reference_failed";
    record.error = error.message || "Failed to create upstream asset.";
    auth.db.userCharacters = auth.db.userCharacters.map((entry) => (entry.id === record.id ? record : entry));
    await writeDb(auth.db);
    throw error;
  }

  const userPrompt = typeof body.prompt === "string" ? body.prompt : String(record.prompt || "");
  const { task } = await finalizeUserCharacterMainVideoSubmit(auth, prepared, config, cost, userPrompt, body);

  return sendJson(res, 200, {
    ok: true,
    character: publicUserCharacter(prepared),
    task: { taskId: task.taskId, status: task.status, videoUrl: task.videoUrl || "" },
    user: userView(auth.user),
    cost,
  });
}

async function handleListMyCharacters(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const characters = auth.db.userCharacters
    .filter((character) => character.userId === auth.user.id && !isSoftDeleted(character))
    .slice(0, 50)
    .map(publicUserCharacter);
  return sendJson(res, 200, { ok: true, characters });
}

async function handleGetMyCharacter(req, res, characterId) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const record = auth.db.userCharacters.find((entry) => entry.id === characterId && entry.userId === auth.user.id && !isSoftDeleted(entry));
  if (!record) return sendJson(res, 404, { ok: false, message: "Character not found." });
  return sendJson(res, 200, { ok: true, character: publicUserCharacter(record) });
}

async function handleDeleteMyCharacter(req, res, characterId) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const record = auth.db.userCharacters.find((entry) => entry.id === characterId && entry.userId === auth.user.id);
  if (!record || isSoftDeleted(record)) {
    return sendJson(res, 404, { ok: false, message: "Character not found." });
  }
  const nowIso = new Date().toISOString();
  record.deletedAt = nowIso;
  record.updatedAt = nowIso;
  auth.db.userCharacters = auth.db.userCharacters.map((entry) => (entry.id === record.id ? record : entry));

  const records = await readGenerationRecords();
  let changedRecords = false;
  const nextRecords = records.map((entry) => {
    if (entry.companionId !== record.id || entry.userId !== auth.user.id || entry.deletedAt) return entry;
    changedRecords = true;
    return { ...entry, deletedAt: nowIso, updatedAt: nowIso };
  });
  await writeDb(auth.db);
  if (changedRecords) await writeGenerationRecords(nextRecords);
  return sendJson(res, 200, { ok: true, character: publicUserCharacter(record) });
}

async function handleQueryMyCharacterMainVideo(req, res, characterId) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const record = auth.db.userCharacters.find((entry) => entry.id === characterId && entry.userId === auth.user.id && !isSoftDeleted(entry));
  if (!record) return sendJson(res, 404, { ok: false, message: "Character not found." });
  if (!record.taskId) return sendJson(res, 400, { ok: false, message: "This character has no video task yet." });

  const raw = await arkRequest("GET", `/contents/generations/tasks/${encodeURIComponent(record.taskId)}`);
  const task = normalizeTask(raw);
  let localVideoUrl = "";
  let localVideoPath = "";
  let downloadError = "";
  if (isSucceededStatus(task.status) && task.videoUrl) {
    try {
      const localVideo = await downloadGeneratedVideo(record.taskId, task.videoUrl);
      localVideoUrl = localVideo.localVideoUrl;
      localVideoPath = localVideo.localVideoPath;
    } catch (error) {
      downloadError = error.message || "Failed to download character video.";
    }
  }

  record.status = task.status;
  record.videoUrl = localVideoUrl || task.videoUrl || record.videoUrl || "";
  record.localVideoUrl = localVideoUrl || record.localVideoUrl || "";
  record.localVideoPath = localVideoPath || record.localVideoPath || "";
  record.remoteVideoUrl = task.videoUrl || record.remoteVideoUrl || "";
  record.error = task.error || downloadError || "";
  record.updatedAt = new Date().toISOString();
  auth.db.userCharacters = auth.db.userCharacters.map((entry) => (entry.id === record.id ? record : entry));
  await writeDb(auth.db);

  await upsertGenerationRecord({
    taskId: record.taskId,
    status: record.status,
    remoteVideoUrl: task.videoUrl || "",
    localVideoUrl,
    localVideoPath,
    error: task.error || downloadError || "",
  });

  return sendJson(res, 200, { ok: true, character: publicUserCharacter(record), task: { ...task, videoUrl: record.videoUrl } });
}

async function handleCreateMyCharacterSceneVideo(req, res, characterId) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const body = await readJson(req);
  const sceneId = String(body.sceneId || "").trim();
  if (!sceneId) return sendJson(res, 400, { ok: false, message: "Missing sceneId." });

  const record = auth.db.userCharacters.find((entry) => entry.id === characterId && entry.userId === auth.user.id && !isSoftDeleted(entry));
  if (!record) return sendJson(res, 404, { ok: false, message: "Character not found." });
  if (!record.referenceAssetUri) {
    return sendJson(res, 400, { ok: false, message: "This character isn't ready yet. Wait for the main video task to finish or recreate the character." });
  }
  if (!ARK_API_KEY) {
    return sendJson(res, 503, { ok: false, code: "MISSING_ARK_API_KEY", message: "ARK_API_KEY is missing — scene video tasks cannot be submitted." });
  }

  const config = await readAppConfig();
  const sceneConfig = findSceneConfig(config, sceneId);
  if (!sceneConfig || sceneConfig.id !== sceneId) {
    return sendJson(res, 404, { ok: false, message: "Scene not found." });
  }
  const sceneEntry = findSceneEntryConfig(sceneConfig, body.sceneEntryId);
  const sceneVideoKey = makeSceneVideoKey(sceneConfig.id, sceneEntry.id);

  const cost = clampNumber(body.cost, Number(sceneConfig.price || config.prices.dateVideo || 25), 0, 9999);
  if (auth.user.credits < cost) {
    return sendJson(res, 402, insufficientCreditsPayload(cost, auth.user.credits));
  }

  const userPrompt = typeof body.prompt === "string" ? body.prompt : "";
  const prompt = makeSceneVideoPrompt(sceneConfig, userPrompt);
  let task;
  let payload;
  try {
    const result = await submitSeedanceVideoTask({
      config,
      prompt,
      referenceAssetUri: record.referenceAssetUri,
      body: { ...body, generateAudio: true },
      slug: `user-scene-${characterId}-${sceneVideoKey}`,
    });
    task = result.task;
    payload = result.payload;
  } catch (error) {
    throw error;
  }

  auth.user.credits -= cost;
  auth.user.updatedAt = new Date().toISOString();

  const nowIso = new Date().toISOString();
  const sceneVideos = { ...(record.sceneVideos || {}) };
  sceneVideos[sceneVideoKey] = {
    sceneId: sceneConfig.id,
    sceneName: sceneConfig.name,
    sceneEntryId: sceneEntry.id,
    sceneEntryName: sceneEntry.name,
    posterUrl: record.posterUrl || record.localImageUrl || "",
    prompt: prompt,
    userPrompt,
    finalPrompt: prompt,
    referenceAssetUri: record.referenceAssetUri || "",
    model: MODEL_QUALITY,
    ratio: payload.ratio,
    resolution: payload.resolution,
    duration: payload.duration,
    provider: "seedance",
    taskId: task.taskId,
    status: task.status,
    videoUrl: "",
    localVideoUrl: "",
    remoteVideoUrl: task.videoUrl || "",
    createdAt: sceneVideos[sceneVideoKey]?.createdAt || nowIso,
    updatedAt: nowIso,
    error: "",
  };
  record.sceneVideos = sceneVideos;
  record.updatedAt = nowIso;

  auth.db.userCharacters = auth.db.userCharacters.map((entry) => (entry.id === record.id ? record : entry));
  await writeDb(auth.db);

  await upsertGenerationRecord({
    taskId: task.taskId,
    status: task.status,
    model: MODEL_QUALITY,
    sceneId: sceneConfig.id,
    sceneName: sceneConfig.name,
    sceneEntryId: sceneEntry.id,
    sceneEntryName: sceneEntry.name,
    companionId: record.id,
    companionName: record.name,
    userId: auth.user.id,
    referenceAssetUri: record.referenceAssetUri,
    prompt: prompt,
    finalPrompt: prompt,
    ratio: payload.ratio,
    resolution: payload.resolution,
    duration: payload.duration,
    quality: "high",
    remoteVideoUrl: task.videoUrl || "",
    localVideoUrl: "",
    error: "",
    source: "user-character-scene",
  });

  return sendJson(res, 200, {
    ok: true,
    character: publicUserCharacter(record),
    sceneVideo: sceneVideos[sceneVideoKey],
    task,
    user: userView(auth.user),
    cost,
  });
}

async function handleQueryMyCharacterSceneVideo(req, res, taskId) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  let record = null;
  let matchedSceneId = "";
  for (const entry of auth.db.userCharacters) {
    if (entry.userId !== auth.user.id) continue;
    if (isSoftDeleted(entry)) continue;
    const sceneVideos = entry.sceneVideos || {};
    for (const sceneId of Object.keys(sceneVideos)) {
      if (sceneVideos[sceneId]?.taskId === taskId) {
        record = entry;
        matchedSceneId = sceneId;
        break;
      }
    }
    if (record) break;
  }
  if (!record || !matchedSceneId) {
    return sendJson(res, 404, { ok: false, message: "No matching user-character scene video task found." });
  }
  const matchedVideoKey = matchedSceneId;
  const matchedSceneBaseId = sceneIdFromVideoKey(matchedVideoKey);

  const raw = await arkRequest("GET", `/contents/generations/tasks/${encodeURIComponent(taskId)}`);
  const task = normalizeTask(raw);
  let localVideoUrl = "";
  let localVideoPath = "";
  let downloadError = "";
  if (isSucceededStatus(task.status) && task.videoUrl) {
    try {
      const localVideo = await downloadGeneratedVideo(taskId, task.videoUrl);
      localVideoUrl = localVideo.localVideoUrl;
      localVideoPath = localVideo.localVideoPath;
    } catch (error) {
      downloadError = error.message || "Failed to download scene video.";
    }
  }

  const nowIso = new Date().toISOString();
  const sceneVideos = { ...(record.sceneVideos || {}) };
  const previous = sceneVideos[matchedVideoKey] || {};
  sceneVideos[matchedVideoKey] = {
    ...previous,
    sceneId: previous.sceneId || matchedSceneBaseId,
    taskId: task.taskId || taskId,
    status: task.status,
    videoUrl: localVideoUrl || task.videoUrl || previous.videoUrl || "",
    localVideoUrl: localVideoUrl || previous.localVideoUrl || "",
    localVideoPath: localVideoPath || previous.localVideoPath || "",
    remoteVideoUrl: task.videoUrl || previous.remoteVideoUrl || "",
    error: task.error || downloadError || "",
    updatedAt: nowIso,
  };
  record.sceneVideos = sceneVideos;
  record.updatedAt = nowIso;
  auth.db.userCharacters = auth.db.userCharacters.map((entry) => (entry.id === record.id ? record : entry));
  await writeDb(auth.db);

  await upsertGenerationRecord({
    taskId: task.taskId || taskId,
    status: task.status,
    remoteVideoUrl: task.videoUrl || "",
    localVideoUrl,
    localVideoPath,
    error: task.error || downloadError || "",
  });

  return sendJson(res, 200, { ok: true, character: publicUserCharacter(record), sceneVideo: sceneVideos[matchedVideoKey], task });
}

async function handleAdminGetConfig(req, res) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const config = await readAppConfig();
  return sendJson(res, 200, { ok: true, config });
}

async function handleAdminSaveConfig(req, res) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const body = await readJson(req);
  const current = await readAppConfig();
  const next = {
    ...current,
    ...(body.config || {}),
    prices: { ...current.prices, ...((body.config || {}).prices || {}) },
    wallet: { ...current.wallet, ...((body.config || {}).wallet || {}) },
    video: { ...current.video, ...((body.config || {}).video || {}) },
    platform: normalizePlatformConfig((body.config || {}).platform || current.platform || {}),
    homeVideo: { ...current.homeVideo, ...((body.config || {}).homeVideo || {}) },
    ifilm: { ...current.ifilm, ...((body.config || {}).ifilm || {}) },
    characterImage: { ...current.characterImage, ...((body.config || {}).characterImage || {}) },
    scenes: Array.isArray((body.config || {}).scenes) ? body.config.scenes : current.scenes,
    updatedAt: new Date().toISOString(),
  };
  await writeAppConfig(next);
  return sendJson(res, 200, { ok: true, config: next });
}

async function handleAdminList(req, res) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const records = await readGenerationRecords();
  return sendJson(res, 200, {
    ok: true,
    users: auth.db.users.map(userView),
    walletOrders: auth.db.walletOrders.slice(0, 100),
    userAssets: auth.db.userAssets.slice(0, 100),
    generationRecords: records.slice(0, 30),
  });
}

async function handleAdminUploadHomeImage(req, res) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const body = await readJson(req);
  const { mime, bytes } = decodeDataUrl(body.dataUrl || "");
  const ext = imageExtFromMime(mime);
  const fileName = `home-${Date.now()}-${crypto.randomBytes(3).toString("hex")}${ext}`;
  await fs.mkdir(ADMIN_HOME_DIR, { recursive: true });
  const localPath = path.join(ADMIN_HOME_DIR, fileName);
  await fs.writeFile(localPath, bytes);

  const config = await readAppConfig();
  const item = {
    id: makeHomeVideoItemId(),
    name: String(body.name || "新角色").trim() || "新角色",
    title: String(body.title || "待生成").trim() || "待生成",
    posterUrl: `/assets/admin/home/${fileName}`,
    localImageUrl: `/assets/admin/home/${fileName}`,
    sourceImageUrl: `/assets/admin/home/${fileName}`,
    imageMime: mime,
    sourceImageMime: mime,
    publicImageUrl: "",
    referenceAssetUri: "",
    syntheticReferenceLocalUrl: "",
    syntheticReferenceUrl: "",
    syntheticReferenceTaskId: "",
    videoUrl: "",
    localVideoUrl: "",
    taskId: "",
    status: "image_uploaded",
    prompt: typeof body.prompt === "string" ? body.prompt : "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  config.homeVideo = upsertHomeVideoItem(config.homeVideo, item);
  await writeAppConfig(config);

  // Kick off the synthetic-reference build in the background so the
  // admin doesn't have to wait, but the item is "ready" before any video
  // task touches it.
  scheduleHomeItemReferenceBuild(item.id).catch((error) => {
    console.warn(`[home-ref] background build failed for ${item.id}:`, error.message || error);
  });

  return sendJson(res, 200, { ok: true, homeVideo: config.homeVideo, item });
}

async function handleAdminRebuildHomeItemReference(req, res, itemId) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  let body = {};
  try { body = await readJson(req); } catch { body = {}; }
  const force = body.force !== false;

  const cfgInitial = await readAppConfig();
  const item = findHomeVideoItem(cfgInitial.homeVideo || {}, itemId);
  if (!item) return sendJson(res, 404, { ok: false, message: "没有找到这个角色。" });

  if (HOME_REFERENCE_BUILDS.has(itemId)) {
    return sendJson(res, 200, {
      ok: true,
      message: "参考图正在重建中，请稍候。",
      itemId,
      status: "building",
    });
  }

  // Wipe synthetic state if force=true so we re-run apiz Seedream.
  if (force) {
    const cfg = await readAppConfig();
    const before = findHomeVideoItem(cfg.homeVideo || {}, itemId);
    if (before) {
      cfg.homeVideo = replaceHomeVideoItem(cfg.homeVideo, {
        ...before,
        referenceAssetUri: "",
        publicImageUrl: "",
        tosKey: "",
        syntheticReferenceLocalUrl: "",
        syntheticReferenceUrl: "",
        syntheticReferenceTaskId: "",
        syntheticReferenceModel: "",
        syntheticReferencePrompt: "",
        // Restore poster/local to the original upload so the synthesizer
        // works on the source image again.
        posterUrl: before.sourceImageUrl || before.posterUrl,
        localImageUrl: before.sourceImageUrl || before.localImageUrl,
        imageMime: before.sourceImageMime || before.imageMime,
        status: "image_uploaded",
        updatedAt: new Date().toISOString(),
      });
      await writeAppConfig(cfg);
    }
  }

  scheduleHomeItemReferenceBuild(itemId).catch(() => {});

  return sendJson(res, 200, {
    ok: true,
    message: force ? "已清空旧参考图并重新合成。" : "已触发参考图合成。",
    itemId,
    status: "building",
  });
}

const HOME_REFERENCE_BUILDS = new Map();

function scheduleHomeItemReferenceBuild(itemId) {
  if (!itemId) return Promise.resolve();
  if (HOME_REFERENCE_BUILDS.has(itemId)) return HOME_REFERENCE_BUILDS.get(itemId);
  const promise = (async () => {
    try {
      let cfg = await readAppConfig();
      cfg = await ensureSyntheticReferenceForHomeItem(cfg, itemId, { force: false, _fromScheduler: true });
      const item = findHomeVideoItem(cfg.homeVideo || {}, itemId);
      if (item && (item.status === "reference_failed" || item.error)) {
        cfg.homeVideo = replaceHomeVideoItem(cfg.homeVideo, {
          ...item,
          status: "reference_ready",
          error: "",
          updatedAt: new Date().toISOString(),
        });
      }
      await writeAppConfig(cfg);
      console.log(`[home-ref] synthesized reference for item ${itemId}`);
    } catch (error) {
      console.warn(`[home-ref] failed to build reference for item ${itemId}:`, error.message || error);
      try {
        const cfg = await readAppConfig();
        const item = findHomeVideoItem(cfg.homeVideo || {}, itemId);
        if (item) {
          cfg.homeVideo = replaceHomeVideoItem(cfg.homeVideo, {
            ...item,
            status: "reference_failed",
            error: String(error.message || error),
            updatedAt: new Date().toISOString(),
          });
          await writeAppConfig(cfg);
        }
      } catch (writeError) {
        console.warn(`[home-ref] failed to persist failure state for ${itemId}:`, writeError.message || writeError);
      }
    } finally {
      HOME_REFERENCE_BUILDS.delete(itemId);
    }
  })();
  HOME_REFERENCE_BUILDS.set(itemId, promise);
  return promise;
}

async function handleAdminIfilmStatus(req, res) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const config = await readAppConfig();
  const cliPath = config.ifilm?.cliPath || "ifilm";
  try {
    const guide = await execFileJson(cliPath, ["guide", "--format", "json"], {
      env: { ...process.env, FLOW_API_KEY: process.env.FLOW_API_KEY || "" },
    });
    return sendJson(res, 200, { ok: true, installed: true, cliPath, guide });
  } catch (error) {
    return sendJson(res, 200, {
      ok: true,
      installed: false,
      cliPath,
      message: error.code === "ENOENT" ? "ifilm CLI 未安装或不在 PATH。" : error.message,
      stderr: error.stderr || "",
    });
  }
}

async function handleAdminCreateHomeVideo(req, res) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const body = await readJson(req);
  let config = await readAppConfig();
  config.homeVideo = normalizeHomeVideo({ ...config.homeVideo, ...(body.homeVideo || {}) });
  if (body.itemId) {
    const item = findHomeVideoItem(config.homeVideo, body.itemId);
    if (!item) return sendJson(res, 404, { ok: false, message: "没有找到这个首页角色。" });
    config.homeVideo.activeItemId = item.id;
    config.homeVideo = syncHomeVideoActiveFields(config.homeVideo);
  }
  const editableItem = findHomeVideoItem(config.homeVideo);
  if (editableItem && (body.name || body.title)) {
    config.homeVideo = upsertHomeVideoItem(config.homeVideo, {
      ...editableItem,
      name: String(body.name || editableItem.name || "新角色").trim() || "新角色",
      title: String(body.title || editableItem.title || "短剧角色").trim() || "短剧角色",
      updatedAt: new Date().toISOString(),
    });
  }
  const activeItem = findHomeVideoItem(config.homeVideo);
  const sceneId = String(body.sceneId || "room").trim() || "room";
  const sceneConfig = findSceneConfig(config, sceneId);
  const provider = String(body.provider || config.homeVideo.provider || "seedance");
  const submittedPrompt = typeof body.prompt === "string" ? body.prompt : "";
  const userPrompt = body.saveOnly === true ? submittedPrompt : (submittedPrompt.trim() ? submittedPrompt : String(activeItem?.prompt || ""));
  if (body.saveOnly === true) {
    const nowIso = new Date().toISOString();
    const sceneVideos = { ...(activeItem.homeSceneVideos || {}) };
    const previous = sceneVideos[sceneConfig.id] || {};
    sceneVideos[sceneConfig.id] = {
      ...previous,
      sceneId: sceneConfig.id,
      sceneName: sceneConfig.name,
      posterUrl: previous.posterUrl || activeItem.posterUrl || activeItem.localImageUrl || "",
      prompt: userPrompt,
      userPrompt,
      updatedAt: nowIso,
      createdAt: previous.createdAt || nowIso,
      source: previous.source || "admin-home-scene",
    };
    const nextItem = { ...activeItem, provider, homeSceneVideos: sceneVideos, updatedAt: nowIso };
    config.homeVideo = replaceHomeVideoItem(config.homeVideo, nextItem);
    await writeAppConfig(config);
    return sendJson(res, 200, { ok: true, saved: true, homeVideo: config.homeVideo, item: nextItem, homeSceneVideo: sceneVideos[sceneConfig.id] });
  }
  const prompt = makeHomeVideoPrompt(activeItem, userPrompt, { scene: sceneConfig });

  if (provider === "ifilm-cli") {
    return sendJson(res, 503, {
      ok: false,
      code: "IFILM_TEMPLATE_REQUIRED",
      message: "ifilm CLI 生成命令还未配置。先安装 CLI 后运行 ifilm guide，确认图片生视频命令格式，再写入后台 ifilm.commandTemplate。",
    });
  }

  if (!ARK_API_KEY) {
    return sendJson(res, 503, { ok: false, code: "MISSING_ARK_API_KEY", message: "缺少 ARK_API_KEY，不能提交 Seedance 视频任务。" });
  }

  config = await ensureSyntheticReferenceForHomeItem(config, activeItem.id);
  const referenceItem = findHomeVideoItem(config.homeVideo, activeItem.id);
  const { task, payload } = await submitSeedanceVideoTask({
    config,
    prompt,
    referenceAssetUri: referenceItem.referenceAssetUri || config.homeVideo.referenceAssetUri,
    body: { ...body, generateAudio: true },
    slug: "home-video",
  });

  const nextItem = {
    ...referenceItem,
    provider,
    prompt: referenceItem.prompt || "",
    taskId: task.taskId,
    status: task.status,
    updatedAt: new Date().toISOString(),
  };
  const nowIso = new Date().toISOString();
  const homeSceneVideos = { ...(referenceItem.homeSceneVideos || {}) };
  homeSceneVideos[sceneConfig.id] = {
    sceneId: sceneConfig.id,
    sceneName: sceneConfig.name,
    posterUrl: referenceItem.posterUrl || referenceItem.localImageUrl || "",
    prompt: prompt,
    userPrompt,
    finalPrompt: prompt,
    referenceAssetUri: nextItem.referenceAssetUri || referenceItem.referenceAssetUri || config.homeVideo.referenceAssetUri,
    model: MODEL_QUALITY,
    ratio: payload.ratio,
    resolution: payload.resolution,
    duration: payload.duration,
    provider: "seedance",
    taskId: task.taskId,
    status: task.status,
    videoUrl: "",
    localVideoUrl: "",
    remoteVideoUrl: task.videoUrl || "",
    createdAt: homeSceneVideos[sceneConfig.id]?.createdAt || nowIso,
    updatedAt: nowIso,
    error: "",
    source: "admin-home-scene",
  };
  nextItem.homeSceneVideos = homeSceneVideos;
  if (sceneConfig.id === "room") {
    nextItem.videoUrl = "";
    nextItem.localVideoUrl = "";
    nextItem.remoteVideoUrl = task.videoUrl || "";
  }
  config.homeVideo = replaceHomeVideoItem(config.homeVideo, nextItem);
  await writeAppConfig(config);
  await upsertGenerationRecord({
    taskId: task.taskId,
    status: task.status,
    model: MODEL_QUALITY,
    sceneId: "home",
    sceneName: referenceItem.title || "首页主视频",
    companionId: referenceItem.id || "home",
    companionName: referenceItem.name || "首页预设角色",
    userId: auth.user.id,
    sceneId: sceneConfig.id,
    sceneName: sceneConfig.name,
    referenceAssetUri: nextItem.referenceAssetUri || referenceItem.referenceAssetUri || config.homeVideo.referenceAssetUri,
    prompt: prompt,
    finalPrompt: prompt,
    ratio: payload.ratio,
    resolution: payload.resolution,
    duration: payload.duration,
    quality: "high",
    remoteVideoUrl: task.videoUrl || "",
    localVideoUrl: "",
    error: "",
    source: "admin-home-scene",
  });

  return sendJson(res, 200, { ok: true, homeVideo: config.homeVideo, item: nextItem, homeSceneVideo: homeSceneVideos[sceneConfig.id], task });
}

async function handleAdminCreateCharacterSceneVideo(req, res) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const body = await readJson(req);
  const itemId = String(body.itemId || "").trim();
  const sceneId = String(body.sceneId || "").trim();
  if (!itemId || !sceneId) {
    return sendJson(res, 400, { ok: false, message: "缺少 itemId 或 sceneId。" });
  }

  let config = await readAppConfig();
  config.homeVideo = normalizeHomeVideo(config.homeVideo || {});
  const item = findHomeVideoItem(config.homeVideo, itemId);
  if (!item || item.id !== itemId) {
    return sendJson(res, 404, { ok: false, message: "没有找到这个角色。" });
  }
  const sceneConfig = findSceneConfig(config, sceneId);
  if (!sceneConfig || sceneConfig.id !== sceneId) {
    return sendJson(res, 404, { ok: false, message: "没有找到这个场景。" });
  }
  if (!ARK_API_KEY) {
    return sendJson(res, 503, { ok: false, code: "MISSING_ARK_API_KEY", message: "缺少 ARK_API_KEY，不能提交 Seedance 视频任务。" });
  }

  config = await ensureSyntheticReferenceForHomeItem(config, item.id);
  const refItem = findHomeVideoItem(config.homeVideo, itemId) || item;
  const referenceAssetUri = refItem.referenceAssetUri || config.homeVideo.referenceAssetUri;
  if (!referenceAssetUri) {
    return sendJson(res, 400, { ok: false, message: "角色还没有可用的上游参考素材。" });
  }
  if (!refItem.syntheticReferenceLocalUrl) {
    return sendJson(res, 400, { ok: false, message: "该角色的合成参考图还没准备好，请稍候再试或先点'重建参考图'。" });
  }

  const userPrompt = typeof body.prompt === "string" ? body.prompt : "";
  if (body.saveOnly === true) {
    const nowIso = new Date().toISOString();
    const sceneVideos = { ...(item.sceneVideos || {}) };
    const previous = sceneVideos[sceneConfig.id] || {};
    sceneVideos[sceneConfig.id] = {
      ...previous,
      sceneId: sceneConfig.id,
      sceneName: sceneConfig.name,
      posterUrl: previous.posterUrl || item.posterUrl || item.localImageUrl || "",
      prompt: userPrompt,
      userPrompt,
      updatedAt: nowIso,
      createdAt: previous.createdAt || nowIso,
    };
    const nextItem = { ...item, sceneVideos, updatedAt: nowIso };
    config.homeVideo = replaceHomeVideoItem(config.homeVideo, nextItem);
    await writeAppConfig(config);
    return sendJson(res, 200, { ok: true, saved: true, item: nextItem, sceneVideo: sceneVideos[sceneConfig.id] });
  }
  const prompt = makeSceneVideoPrompt(sceneConfig, userPrompt);
  const { task, payload } = await submitSeedanceVideoTask({
    config,
    prompt,
    referenceAssetUri,
    body: { ...body, generateAudio: true },
    slug: `home-scene-${sceneConfig.id}`,
  });

  const nowIso = new Date().toISOString();
  const sceneVideos = { ...(refItem.sceneVideos || {}) };
  sceneVideos[sceneConfig.id] = {
    sceneId: sceneConfig.id,
    sceneName: sceneConfig.name,
    posterUrl: refItem.posterUrl || refItem.localImageUrl || "",
    prompt: prompt,
    userPrompt,
    finalPrompt: prompt,
    referenceAssetUri,
    model: MODEL_QUALITY,
    ratio: payload.ratio,
    resolution: payload.resolution,
    duration: payload.duration,
    provider: "seedance",
    taskId: task.taskId,
    status: task.status,
    videoUrl: "",
    localVideoUrl: "",
    remoteVideoUrl: task.videoUrl || "",
    createdAt: sceneVideos[sceneConfig.id]?.createdAt || nowIso,
    updatedAt: nowIso,
    error: "",
  };
  const nextItem = { ...refItem, sceneVideos, updatedAt: nowIso };
  config.homeVideo = replaceHomeVideoItem(config.homeVideo, nextItem);
  await writeAppConfig(config);

  await upsertGenerationRecord({
    taskId: task.taskId,
    status: task.status,
    model: MODEL_QUALITY,
    sceneId: sceneConfig.id,
    sceneName: sceneConfig.name,
    companionId: refItem.id,
    companionName: refItem.name,
    userId: auth.user.id,
    referenceAssetUri,
    prompt: prompt,
    finalPrompt: prompt,
    ratio: payload.ratio,
    resolution: payload.resolution,
    duration: payload.duration,
    quality: "high",
    remoteVideoUrl: task.videoUrl || "",
    localVideoUrl: "",
    error: "",
    source: "admin-character-scene",
  });

  return sendJson(res, 200, { ok: true, item: nextItem, sceneVideo: sceneVideos[sceneConfig.id], task });
}

async function handleAdminGetCharacterSceneVideo(req, res, taskId) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  let config = await readAppConfig();
  config.homeVideo = normalizeHomeVideo(config.homeVideo || {});

  let matchedItem = null;
  let matchedSceneId = "";
  for (const candidate of config.homeVideo.items) {
    const sceneVideos = candidate.sceneVideos || {};
    for (const sceneId of Object.keys(sceneVideos)) {
      if (sceneVideos[sceneId]?.taskId === taskId) {
        matchedItem = candidate;
        matchedSceneId = sceneId;
        break;
      }
    }
    if (matchedItem) break;
  }
  if (!matchedItem || !matchedSceneId) {
    return sendJson(res, 404, { ok: false, message: "找不到对应的场景视频任务。" });
  }

  const raw = await arkRequest("GET", `/contents/generations/tasks/${encodeURIComponent(taskId)}`);
  const task = normalizeTask(raw);
  let localVideoUrl = "";
  let localVideoPath = "";
  let downloadError = "";
  if (isSucceededStatus(task.status) && task.videoUrl) {
    try {
      const localVideo = await downloadGeneratedVideo(taskId, task.videoUrl);
      localVideoUrl = localVideo.localVideoUrl;
      localVideoPath = localVideo.localVideoPath;
    } catch (error) {
      downloadError = error.message || "下载场景视频失败";
    }
  }

  const nowIso = new Date().toISOString();
  const sceneVideos = { ...(matchedItem.sceneVideos || {}) };
  const previous = sceneVideos[matchedSceneId] || {};
  sceneVideos[matchedSceneId] = {
    ...previous,
    sceneId: matchedSceneId,
    taskId: task.taskId || taskId,
    status: task.status,
    videoUrl: localVideoUrl || task.videoUrl || previous.videoUrl || "",
    localVideoUrl: localVideoUrl || previous.localVideoUrl || "",
    localVideoPath: localVideoPath || previous.localVideoPath || "",
    remoteVideoUrl: task.videoUrl || previous.remoteVideoUrl || "",
    error: task.error || downloadError || "",
    updatedAt: nowIso,
  };
  const nextItem = { ...matchedItem, sceneVideos, updatedAt: nowIso };
  config.homeVideo = replaceHomeVideoItem(config.homeVideo, nextItem);
  await writeAppConfig(config);

  await upsertGenerationRecord({
    taskId: task.taskId || taskId,
    status: task.status,
    remoteVideoUrl: task.videoUrl || "",
    localVideoUrl,
    localVideoPath,
    error: task.error || downloadError || "",
  });

  return sendJson(res, 200, { ok: true, item: nextItem, sceneVideo: sceneVideos[matchedSceneId], task });
}

async function handleAdminGetHomeVideo(req, res, taskId) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  let config = await readAppConfig();
  const raw = await arkRequest("GET", `/contents/generations/tasks/${encodeURIComponent(taskId)}`);
  const task = normalizeTask(raw);
  let localVideoUrl = "";
  let localVideoPath = "";
  let downloadError = "";

  if (isSucceededStatus(task.status) && task.videoUrl) {
    try {
      const localVideo = await downloadGeneratedVideo(taskId, task.videoUrl);
      localVideoUrl = localVideo.localVideoUrl;
      localVideoPath = localVideo.localVideoPath;
    } catch (error) {
      downloadError = error.message || "下载首页视频失败";
    }
  }

  config.homeVideo = normalizeHomeVideo(config.homeVideo || {});
  let matchedItem = null;
  let matchedSceneId = "";
  for (const candidate of config.homeVideo.items || []) {
    const homeSceneVideos = candidate.homeSceneVideos || {};
    for (const sceneId of Object.keys(homeSceneVideos)) {
      if (homeSceneVideos[sceneId]?.taskId === taskId || homeSceneVideos[sceneId]?.taskId === task.taskId) {
        matchedItem = candidate;
        matchedSceneId = sceneId;
        break;
      }
    }
    if (matchedItem) break;
  }
  if (!matchedItem) {
    matchedItem = config.homeVideo.items.find((item) => item.taskId === taskId || item.taskId === task.taskId);
  }
  if (!matchedItem) {
    return sendJson(res, 404, { ok: false, message: "No matching home video task found." });
  }
  const nextItem = {
    ...matchedItem,
    taskId: task.taskId || taskId,
    status: task.status,
    videoUrl: localVideoUrl || task.videoUrl || matchedItem?.videoUrl || config.homeVideo.videoUrl || "",
    remoteVideoUrl: task.videoUrl || "",
    localVideoUrl,
    localVideoPath,
    error: task.error || downloadError || "",
    updatedAt: new Date().toISOString(),
  };
  if (matchedSceneId) {
    const homeSceneVideos = { ...(matchedItem.homeSceneVideos || {}) };
    const previous = homeSceneVideos[matchedSceneId] || {};
    homeSceneVideos[matchedSceneId] = {
      ...previous,
      sceneId: matchedSceneId,
      taskId: task.taskId || taskId,
      status: task.status,
      videoUrl: localVideoUrl || task.videoUrl || previous.videoUrl || "",
      localVideoUrl: localVideoUrl || previous.localVideoUrl || "",
      localVideoPath: localVideoPath || previous.localVideoPath || "",
      remoteVideoUrl: task.videoUrl || previous.remoteVideoUrl || "",
      error: task.error || downloadError || "",
      updatedAt: new Date().toISOString(),
    };
    nextItem.homeSceneVideos = homeSceneVideos;
    if (matchedSceneId !== "room") {
      nextItem.videoUrl = matchedItem.videoUrl || "";
      nextItem.localVideoUrl = matchedItem.localVideoUrl || "";
      nextItem.remoteVideoUrl = matchedItem.remoteVideoUrl || "";
      nextItem.localVideoPath = matchedItem.localVideoPath || "";
    }
  }
  config.homeVideo = replaceHomeVideoItem(config.homeVideo, nextItem);
  await writeAppConfig(config);
  await upsertGenerationRecord({
    taskId: task.taskId || taskId,
    status: task.status,
    remoteVideoUrl: task.videoUrl || "",
    localVideoUrl,
    localVideoPath,
    error: task.error || downloadError || "",
  });

  return sendJson(res, 200, { ok: true, homeVideo: config.homeVideo, item: nextItem, task: nextItem });
}

async function refreshCompletedHomeVideoItems(config) {
  let nextConfig = normalizeHomeVideo(config.homeVideo || {});
  let changed = false;

  for (const item of nextConfig.items || []) {
    const homeSceneVideos = { ...(item.homeSceneVideos || {}) };
    let updatedItem = item;
    for (const sceneId of Object.keys(homeSceneVideos)) {
      const entry = homeSceneVideos[sceneId] || {};
      const sceneTaskId = String(entry.taskId || "").trim();
      const sceneStatus = String(entry.status || "").toLowerCase();
      const sceneHasVideo = Boolean(String(entry.videoUrl || entry.localVideoUrl || "").trim());
      if (!sceneTaskId || sceneHasVideo || !sceneStatus || isFailedStatus(sceneStatus)) continue;

      let task;
      try {
        task = normalizeTask(await arkRequest("GET", `/contents/generations/tasks/${encodeURIComponent(sceneTaskId)}`));
      } catch {
        continue;
      }
      if (!isSucceededStatus(task.status) || !task.videoUrl) continue;

      let localVideoUrl = "";
      let localVideoPath = "";
      try {
        const localVideo = await downloadGeneratedVideo(task.taskId || sceneTaskId, task.videoUrl);
        localVideoUrl = localVideo.localVideoUrl;
        localVideoPath = localVideo.localVideoPath;
      } catch {}

      const nextEntry = {
        ...entry,
        taskId: task.taskId || sceneTaskId,
        status: task.status,
        videoUrl: localVideoUrl || task.videoUrl || entry.videoUrl || "",
        localVideoUrl: localVideoUrl || entry.localVideoUrl || "",
        localVideoPath: localVideoPath || entry.localVideoPath || "",
        remoteVideoUrl: task.videoUrl || entry.remoteVideoUrl || "",
        updatedAt: new Date().toISOString(),
        error: "",
      };
      homeSceneVideos[sceneId] = nextEntry;
      updatedItem = { ...updatedItem, homeSceneVideos, updatedAt: nextEntry.updatedAt };
      if (sceneId === "room") {
        updatedItem = {
          ...updatedItem,
          taskId: nextEntry.taskId,
          status: nextEntry.status,
          videoUrl: nextEntry.videoUrl,
          localVideoUrl: nextEntry.localVideoUrl,
          localVideoPath: nextEntry.localVideoPath || updatedItem.localVideoPath || "",
          remoteVideoUrl: nextEntry.remoteVideoUrl || updatedItem.remoteVideoUrl || "",
        };
      }
      nextConfig = replaceHomeVideoItem(nextConfig, updatedItem);
      await upsertGenerationRecord({
        taskId: task.taskId || sceneTaskId,
        status: task.status,
        remoteVideoUrl: task.videoUrl || "",
        localVideoUrl,
        localVideoPath,
        error: "",
        source: "admin-home-scene",
      });
      changed = true;
    }

    const taskId = String(item.taskId || "").trim();
    const status = String(item.status || "").toLowerCase();
    const hasVideo = Boolean(String(item.videoUrl || item.localVideoUrl || "").trim());
    if (!taskId || hasVideo || !status || isFailedStatus(status)) continue;

    let task;
    try {
      task = normalizeTask(await arkRequest("GET", `/contents/generations/tasks/${encodeURIComponent(taskId)}`));
    } catch {
      continue;
    }
    if (!isSucceededStatus(task.status) || !task.videoUrl) continue;

    let localVideoUrl = "";
    let localVideoPath = "";
    try {
      const localVideo = await downloadGeneratedVideo(task.taskId || taskId, task.videoUrl);
      localVideoUrl = localVideo.localVideoUrl;
      localVideoPath = localVideo.localVideoPath;
    } catch {}

    const legacyUpdatedItem = {
      ...item,
      taskId: task.taskId || taskId,
      status: task.status,
      videoUrl: localVideoUrl || task.videoUrl || item.videoUrl || "",
      localVideoUrl: localVideoUrl || item.localVideoUrl || "",
      localVideoPath: localVideoPath || item.localVideoPath || "",
      remoteVideoUrl: task.videoUrl || item.remoteVideoUrl || "",
      updatedAt: new Date().toISOString(),
      error: "",
    };
    nextConfig = replaceHomeVideoItem(nextConfig, legacyUpdatedItem);
    await upsertGenerationRecord({
      taskId: task.taskId || taskId,
      status: task.status,
      remoteVideoUrl: task.videoUrl || "",
      localVideoUrl,
      localVideoPath,
      error: "",
    });
    changed = true;
  }

  if (changed) {
    config.homeVideo = nextConfig;
    await writeAppConfig(config);
  } else {
    config.homeVideo = nextConfig;
  }

  return config;
}

function adminMyCharacterView(record, userMap) {
  if (!record) return null;
  const user = userMap?.get(record.userId);
  return {
    id: record.id,
    userId: record.userId,
    username: user?.username || "",
    name: record.name || "",
    title: record.title || "",
    posterUrl: record.posterUrl || record.localImageUrl || "",
    sourceImageUrl: record.sourceImageUrl || "",
    videoUrl: record.videoUrl || record.localVideoUrl || "",
    localVideoUrl: record.localVideoUrl || "",
    taskId: record.taskId || "",
    status: record.status || "",
    error: record.error || "",
    sceneVideos: publicSceneVideoMap(record.sceneVideos || {}),
    deletedAt: record.deletedAt || "",
    createdAt: record.createdAt || "",
    updatedAt: record.updatedAt || "",
  };
}

function adminWalletOrderView(order, userMap) {
  if (!order) return null;
  const user = userMap?.get(order.userId);
  return {
    id: order.id,
    userId: order.userId,
    username: user?.username || "",
    baseAmount: order.baseAmount,
    creditAmount: order.creditAmount ?? walletCreditsForUsdtAmount(order.baseAmount, { cnyCentsPerUsdt: order.cnyCentsPerUsdt }),
    cnyCentsPerUsdt: order.cnyCentsPerUsdt || "",
    suffix: order.suffix,
    payableAmount: order.payableAmount,
    payableAmountText: order.payableAmountText,
    asset: order.asset,
    network: order.network,
    address: order.address,
    status: order.status || "pending",
    createdAt: order.createdAt,
    paidAt: order.paidAt || "",
    note: order.note || "",
  };
}

function adminUserAssetView(asset, userMap) {
  if (!asset) return null;
  const user = userMap?.get(asset.userId);
  return {
    id: asset.id,
    userId: asset.userId,
    username: user?.username || "",
    url: asset.url || "",
    localUrl: asset.localUrl || "",
    publicUrl: asset.publicUrl || "",
    mime: asset.mime || "",
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt || "",
    deletedAt: asset.deletedAt || "",
  };
}

async function handleAdminDashboard(req, res) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const config = await readAppConfig();
  const records = await readGenerationRecords();
  const items = Array.isArray(config.homeVideo?.items) ? config.homeVideo.items : [];
  const sceneBindCount = items.reduce((sum, item) => sum + Object.keys(item.sceneVideos || {}).length, 0);
  const userCharacters = Array.isArray(auth.db.userCharacters) ? auth.db.userCharacters : [];
  const userSceneCount = userCharacters.reduce((sum, c) => sum + Object.keys(c.sceneVideos || {}).length, 0);
  const totalCredits = (auth.db.users || []).reduce((sum, u) => sum + Number(u.credits || 0), 0);
  const pendingOrders = (auth.db.walletOrders || []).filter((o) => o.status === "pending").length;
  const recentRecords = records.slice(0, 5);
  return sendJson(res, 200, {
    ok: true,
    stats: {
      users: (auth.db.users || []).length,
      admins: (auth.db.users || []).filter((u) => u.role === "admin").length,
      totalCredits,
      adminCharacters: items.length,
      userCharacters: userCharacters.length,
      sceneBindings: sceneBindCount,
      userSceneVideos: userSceneCount,
      walletOrders: (auth.db.walletOrders || []).length,
      pendingOrders,
      generationRecords: records.length,
      sessions: (auth.db.sessions || []).length,
      userAssets: (auth.db.userAssets || []).length,
      scenes: Array.isArray(config.scenes) ? config.scenes.length : 0,
    },
    activeHomeItemId: config.homeVideo?.activeItemId || "",
    recentRecords,
  });
}

async function handleAdminListUsers(req, res) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const userCharacters = Array.isArray(auth.db.userCharacters) ? auth.db.userCharacters : [];
  const charByUser = new Map();
  userCharacters.forEach((c) => {
    charByUser.set(c.userId, (charByUser.get(c.userId) || 0) + 1);
  });
  const orderByUser = new Map();
  (auth.db.walletOrders || []).forEach((o) => {
    orderByUser.set(o.userId, (orderByUser.get(o.userId) || 0) + 1);
  });
  const list = (auth.db.users || []).map((u) => ({
    ...userView(u),
    customCharacters: charByUser.get(u.id) || 0,
    walletOrders: orderByUser.get(u.id) || 0,
    advancedAccess: u.advancedAccess === true,
    advancedAccessRequestedAt: u.advancedAccessRequestedAt || "",
  }));
  list.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  return sendJson(res, 200, { ok: true, users: list });
}

async function handleAdminUpdateUser(req, res, userId) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const user = (auth.db.users || []).find((u) => u.id === userId);
  if (!user) return sendJson(res, 404, { ok: false, message: "用户不存在。" });
  const body = await readJson(req);
  let changed = false;
  if (typeof body.credits === "number" && Number.isFinite(body.credits)) {
    user.credits = Math.max(0, Math.round(body.credits));
    changed = true;
  } else if (typeof body.creditsDelta === "number" && Number.isFinite(body.creditsDelta)) {
    user.credits = Math.max(0, Math.round(Number(user.credits || 0) + body.creditsDelta));
    changed = true;
  }
  if (typeof body.role === "string" && ["admin", "user"].includes(body.role)) {
    if (user.role === "admin" && body.role !== "admin") {
      const admins = (auth.db.users || []).filter((u) => u.role === "admin");
      if (admins.length <= 1) {
        return sendJson(res, 400, { ok: false, message: "至少要保留一名管理员。" });
      }
    }
    user.role = body.role;
    changed = true;
  }
  if (typeof body.advancedAccess === "boolean") {
    user.advancedAccess = body.advancedAccess;
    if (body.advancedAccess) user.advancedAccessReviewedAt = new Date().toISOString();
    changed = true;
  }
  if (changed) {
    user.updatedAt = new Date().toISOString();
    await writeDb(auth.db);
  }
  return sendJson(res, 200, { ok: true, user: userView(user) });
}

async function handleAdminResetPassword(req, res, userId) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const user = (auth.db.users || []).find((u) => u.id === userId);
  if (!user) return sendJson(res, 404, { ok: false, message: "用户不存在。" });
  const body = await readJson(req);
  const password = String(body.password || "");
  if (password.length < 6) {
    return sendJson(res, 400, { ok: false, message: "密码至少 6 位。" });
  }
  user.passwordHash = hashPassword(password);
  user.updatedAt = new Date().toISOString();
  auth.db.sessions = (auth.db.sessions || []).filter((s) => s.userId !== userId || s.token === auth.session.token);
  await writeDb(auth.db);
  return sendJson(res, 200, { ok: true, user: userView(user) });
}

async function handleAdminDeleteUser(req, res, userId) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  if (auth.user.id === userId) {
    return sendJson(res, 400, { ok: false, message: "不能删除自己。" });
  }
  const user = (auth.db.users || []).find((u) => u.id === userId);
  if (!user) return sendJson(res, 404, { ok: false, message: "用户不存在。" });
  if (user.role === "admin") {
    const admins = (auth.db.users || []).filter((u) => u.role === "admin");
    if (admins.length <= 1) {
      return sendJson(res, 400, { ok: false, message: "至少要保留一名管理员。" });
    }
  }
  const nowIso = new Date().toISOString();
  auth.db.users = (auth.db.users || []).filter((u) => u.id !== userId);
  auth.db.sessions = (auth.db.sessions || []).filter((s) => s.userId !== userId);
  auth.db.walletOrders = (auth.db.walletOrders || []).filter((o) => o.userId !== userId);
  auth.db.userAssets = (auth.db.userAssets || []).map((a) => (a.userId === userId ? { ...a, deletedAt: a.deletedAt || nowIso, updatedAt: nowIso } : a));
  auth.db.userCharacters = (auth.db.userCharacters || []).map((c) => (c.userId === userId ? { ...c, deletedAt: c.deletedAt || nowIso, updatedAt: nowIso } : c));
  await writeDb(auth.db);
  return sendJson(res, 200, { ok: true });
}

async function handleAdminListMyCharacters(req, res) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const userMap = new Map((auth.db.users || []).map((u) => [u.id, u]));
  const list = (auth.db.userCharacters || []).map((r) => adminMyCharacterView(r, userMap));
  list.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  return sendJson(res, 200, { ok: true, characters: list });
}

async function handleAdminDeleteMyCharacter(req, res, characterId) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const record = (auth.db.userCharacters || []).find((c) => c.id === characterId);
  if (!record || isSoftDeleted(record)) {
    return sendJson(res, 404, { ok: false, message: "角色不存在。" });
  }
  const nowIso = new Date().toISOString();
  record.deletedAt = nowIso;
  record.updatedAt = nowIso;
  auth.db.userCharacters = (auth.db.userCharacters || []).map((c) => (c.id === characterId ? record : c));

  const records = await readGenerationRecords();
  let changedRecords = false;
  const nextRecords = records.map((entry) => {
    if (entry.companionId !== record.id || entry.deletedAt) return entry;
    changedRecords = true;
    return { ...entry, deletedAt: nowIso, updatedAt: nowIso };
  });
  await writeDb(auth.db);
  if (changedRecords) await writeGenerationRecords(nextRecords);
  return sendJson(res, 200, { ok: true });
}

async function handleAdminUpdateHomeItem(req, res, itemId) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const config = await readAppConfig();
  const items = Array.isArray(config.homeVideo?.items) ? config.homeVideo.items : [];
  const idx = items.findIndex((it) => it.id === itemId);
  if (idx < 0) return sendJson(res, 404, { ok: false, message: "角色不存在。" });
  const body = await readJson(req);
  const item = items[idx];
  if (typeof body.name === "string") item.name = body.name.trim().slice(0, 32) || item.name;
  if (typeof body.title === "string") item.title = body.title.trim().slice(0, 32) || item.title;
  if (typeof body.prompt === "string") item.prompt = body.prompt;
  item.updatedAt = new Date().toISOString();
  items[idx] = item;
  config.homeVideo.items = items;
  await writeAppConfig(config);
  return sendJson(res, 200, { ok: true, item, homeVideo: config.homeVideo });
}

async function handleAdminDeleteHomeItem(req, res, itemId) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const config = await readAppConfig();
  const items = Array.isArray(config.homeVideo?.items) ? config.homeVideo.items : [];
  const remaining = items.filter((it) => it.id !== itemId);
  if (remaining.length === items.length) {
    return sendJson(res, 404, { ok: false, message: "角色不存在。" });
  }
  const nowIso = new Date().toISOString();
  const deleted = items.find((it) => it.id === itemId);
  config.homeVideo.items = remaining;
  if (config.homeVideo.activeItemId === itemId) {
    config.homeVideo.activeItemId = remaining[0]?.id || "";
  }
  config.homeVideo = syncHomeVideoActiveFields(config.homeVideo);
  await writeAppConfig(config);
  if (deleted) {
    const records = await readGenerationRecords();
    const nextRecords = records.map((entry) => (
      entry.companionId === itemId && !entry.deletedAt
        ? { ...entry, deletedAt: nowIso, updatedAt: nowIso }
        : entry
    ));
    await writeGenerationRecords(nextRecords);
  }
  return sendJson(res, 200, { ok: true, homeVideo: config.homeVideo });
}

async function handleAdminSetHomeActive(req, res, itemId) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const config = await readAppConfig();
  const items = Array.isArray(config.homeVideo?.items) ? config.homeVideo.items : [];
  if (!items.find((it) => it.id === itemId)) {
    return sendJson(res, 404, { ok: false, message: "角色不存在。" });
  }
  config.homeVideo.activeItemId = itemId;
  config.homeVideo = syncHomeVideoActiveFields(config.homeVideo);
  await writeAppConfig(config);
  return sendJson(res, 200, { ok: true, homeVideo: config.homeVideo });
}

async function handleAdminListScenes(req, res) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const config = await readAppConfig();
  return sendJson(res, 200, { ok: true, scenes: Array.isArray(config.scenes) ? config.scenes : [] });
}

async function handleAdminUpdateScene(req, res, sceneId) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const config = await readAppConfig();
  const idx = (config.scenes || []).findIndex((s) => s.id === sceneId);
  if (idx < 0) return sendJson(res, 404, { ok: false, message: "场景不存在。" });
  const body = await readJson(req);
  const scene = config.scenes[idx];
  if (typeof body.name === "string") scene.name = body.name.trim() || scene.name;
  if (typeof body.shortName === "string") scene.shortName = body.shortName.trim() || scene.shortName;
  if (typeof body.icon === "string") scene.icon = body.icon.trim() || scene.icon;
  if (typeof body.enabled === "boolean") scene.enabled = body.enabled;
  if (typeof body.price === "number" && Number.isFinite(body.price)) scene.price = Math.max(0, Math.round(body.price));
  if (typeof body.prompt === "string") scene.prompt = body.prompt;
  config.scenes[idx] = normalizeSceneConfig(scene);
  await writeAppConfig(config);
  return sendJson(res, 200, { ok: true, scene: config.scenes[idx] });
}

async function handleAdminCreateSceneEntry(req, res, sceneId) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const config = await readAppConfig();
  const idx = (config.scenes || []).findIndex((s) => s.id === sceneId);
  if (idx < 0) return sendJson(res, 404, { ok: false, message: "场景不存在。" });
  const body = await readJson(req);
  const nowIso = new Date().toISOString();
  const scene = normalizeSceneConfig(config.scenes[idx]);
  const entry = normalizeSceneEntry({
    id: makeSceneEntryId(),
    name: String(body.name || "新入口").trim() || "新入口",
    enabled: body.enabled !== false,
    createdAt: nowIso,
    updatedAt: nowIso,
  }, scene);
  scene.entries = [...scene.entries, entry];
  scene.updatedAt = nowIso;
  config.scenes[idx] = scene;
  await writeAppConfig(config);
  return sendJson(res, 200, { ok: true, scene, entry });
}

async function handleAdminUpdateSceneEntry(req, res, sceneId, entryId) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const config = await readAppConfig();
  const idx = (config.scenes || []).findIndex((s) => s.id === sceneId);
  if (idx < 0) return sendJson(res, 404, { ok: false, message: "场景不存在。" });
  const body = await readJson(req);
  const scene = normalizeSceneConfig(config.scenes[idx]);
  const entryIdx = scene.entries.findIndex((entry) => entry.id === entryId);
  if (entryIdx < 0) return sendJson(res, 404, { ok: false, message: "入口不存在。" });
  const entry = { ...scene.entries[entryIdx] };
  if (typeof body.name === "string") entry.name = body.name.trim().slice(0, 40) || entry.name;
  if (typeof body.enabled === "boolean") entry.enabled = body.enabled;
  entry.updatedAt = new Date().toISOString();
  scene.entries[entryIdx] = normalizeSceneEntry(entry, scene);
  scene.updatedAt = entry.updatedAt;
  config.scenes[idx] = scene;
  await writeAppConfig(config);
  return sendJson(res, 200, { ok: true, scene, entry: scene.entries[entryIdx] });
}

async function handleAdminListWalletOrders(req, res) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const userMap = new Map((auth.db.users || []).map((u) => [u.id, u]));
  const list = (auth.db.walletOrders || []).map((o) => adminWalletOrderView(o, userMap));
  list.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  return sendJson(res, 200, { ok: true, orders: list });
}

async function handleAdminUpdateWalletOrder(req, res, orderId) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const order = (auth.db.walletOrders || []).find((o) => o.id === orderId);
  if (!order) return sendJson(res, 404, { ok: false, message: "订单不存在。" });
  const body = await readJson(req);
  if (typeof body.status === "string" && ["pending", "paid", "cancelled"].includes(body.status)) {
    if (body.status === "paid" && order.status !== "paid") {
      const user = (auth.db.users || []).find((u) => u.id === order.userId);
      if (user) {
        const config = await readAppConfig();
        const creditDelta = creditsAmount(order.creditAmount ?? walletCreditsForUsdtAmount(order.baseAmount, config.wallet));
        order.creditAmount = creditDelta;
        order.cnyCentsPerUsdt = order.cnyCentsPerUsdt || walletCnyCentsPerUsdt(config.wallet);
        user.credits = creditsAmount(Number(user.credits || 0) + creditDelta);
        user.updatedAt = new Date().toISOString();
      }
      order.paidAt = new Date().toISOString();
    }
    order.status = body.status;
  }
  if (typeof body.note === "string") order.note = body.note.slice(0, 200);
  await writeDb(auth.db);
  return sendJson(res, 200, { ok: true, order });
}

async function handleAdminListUserAssets(req, res) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const userMap = new Map((auth.db.users || []).map((u) => [u.id, u]));
  const list = (auth.db.userAssets || []).map((a) => adminUserAssetView(a, userMap));
  list.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  return sendJson(res, 200, { ok: true, assets: list });
}

async function handleAdminListGenerationRecords(req, res, url) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") || 80)));
  const records = await readGenerationRecords();
  return sendJson(res, 200, { ok: true, records: records.slice(0, limit), total: records.length });
}

async function handleListGenerationRecords(req, res, url) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 60)));
  const records = await readGenerationRecords();
  const ownRecords = records
    .filter((record) => record.userId === auth.user.id && isUserVisibleGenerationRecord(record))
    .slice(0, limit);

  const refreshable = ownRecords.filter(shouldRefreshGenerationRecord).slice(0, 8);
  if (refreshable.length) {
    const refreshedByTask = new Map(
      (await Promise.all(refreshable.map(refreshGenerationRecordStatus))).map((record) => [record.taskId, record]),
    );
    ownRecords.forEach((record, index) => {
      if (refreshedByTask.has(record.taskId)) ownRecords[index] = refreshedByTask.get(record.taskId);
    });
  }

  return sendJson(res, 200, {
    ok: true,
    records: ownRecords.map(publicGenerationRecord),
    total: ownRecords.length,
    user: userView((await readDb()).users.find((user) => user.id === auth.user.id) || auth.user),
  });
}

async function handleGetGenerationRecord(req, res, taskId) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const records = await readGenerationRecords();
  const record = records.find((entry) => entry.taskId === taskId && entry.userId === auth.user.id && isUserVisibleGenerationRecord(entry));
  if (!record) return sendJson(res, 404, { ok: false, message: "Generation record not found." });

  let nextRecord = record;
  if (record.provider === "apiz" && APIZ_API_KEY && !isFailedStatus(record.status)) {
    try {
      nextRecord = await refreshApizGenerationRecord(record);
    } catch (error) {
      console.warn("[apiz-generation-record-refresh-failed]", taskId, error.message || error);
    }
  } else if (ARK_API_KEY && !String(taskId).startsWith("demo-") && !isFailedStatus(record.status)) {
    try {
      const raw = await arkRequest("GET", `/contents/generations/tasks/${encodeURIComponent(taskId)}`);
      const task = normalizeTask(raw);
      let localVideoUrl = record.localVideoUrl || "";
      let localVideoPath = record.localVideoPath || "";
      let downloadError = "";
      const remoteVideoUrl = task.videoUrl || record.remoteVideoUrl || "";
      if (isSucceededStatus(task.status) && remoteVideoUrl) {
        try {
          const localVideo = await downloadGeneratedVideo(taskId, remoteVideoUrl);
          localVideoUrl = localVideo.localVideoUrl;
          localVideoPath = localVideo.localVideoPath;
        } catch (error) {
          downloadError = error.message || "Failed to download generated video.";
        }
      }
      nextRecord = await upsertGenerationRecord({
        taskId,
        status: task.status || record.status || "unknown",
        remoteVideoUrl,
        localVideoUrl,
        localVideoPath,
        error: task.error || downloadError || "",
      });
    } catch (error) {
      console.warn("[generation-record-detail-refresh-failed]", taskId, error.message || error);
    }
  }

  return sendJson(res, 200, {
    ok: true,
    record: publicGenerationRecord(nextRecord),
    user: userView((await readDb()).users.find((user) => user.id === auth.user.id) || auth.user),
  });
}

async function handleCreateCharacterImageLegacy(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;

  const body = await readJson(req);
  const config = await readAppConfig();
  const userAsset = body.userAssetId
    ? auth.db.userAssets.find((asset) => asset.id === body.userAssetId && asset.userId === auth.user.id)
    : null;
  const prompt = typeof body.prompt === "string" && body.prompt.trim() ? body.prompt : [
    "full body photorealistic mature virtual girlfriend character sheet",
    "eight clean turntable views in a 4x2 grid: front, front-right, right side, back-right, back, back-left, left side, front-left",
    "consistent face, hair, body proportions and outfit in every frame",
    "transparent or plain dark background, mobile dating game asset, elegant sensual fashion, no explicit nudity",
  ].join(", ");
  const model = userAsset ? config.characterImage.editModel : config.characterImage.textModel;
  const params = {
    prompt,
    image_size: config.characterImage.imageSize,
  };

  if (userAsset?.publicUrl) {
    params.image_url = userAsset.publicUrl;
  }

  const submitted = await apizRequest("/api/v3/tasks/create", { model, params });
  return sendJson(res, 200, {
    ok: true,
    task: submitted,
    model,
    note: "角色图会按 4x2 方向分镜生成；前端拿到结果图后可切成 8 帧用于拖动旋转。",
  });
}

async function handleCreateCharacterImage(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;

  const body = await readJson(req);
  const config = await readAppConfig();
  const userAsset = body.userAssetId
    ? auth.db.userAssets.find((asset) => asset.id === body.userAssetId && asset.userId === auth.user.id)
    : null;
  if (body.userAssetId && !userAsset) {
    return sendJson(res, 404, { ok: false, message: "User asset not found." });
  }

  const userPrompt = typeof body.prompt === "string" ? body.prompt : "";
  const prompt = userPrompt.trim() ? userPrompt : [
    userAsset
      ? "Use Figure 1 only as the identity and outfit reference. Rebuild it as a premium photorealistic human model asset, not anime, not illustration, not CGI, not doll-like."
      : "Create a premium photorealistic human model asset, not anime, not illustration, not CGI, not doll-like.",
    "Generate one complete 4x2 character turnaround sheet with exactly eight full-body views in this order: front, front-right, right side, back-right, back, back-left, left side, front-left.",
    "Keep the same face, hair, body proportions, outfit silhouette, fabric color, fabric texture, and adult age in every view.",
    "Each cell must contain one centered full-body woman from head to shoes, no cropping, no duplicate panels, no text labels, no UI, no room background.",
    "Use a pure flat chroma green background (#00ff00) in every cell for clean cutout; no gradient, no studio backdrop, no floor line, no cast shadow touching the frame border, and do not use green anywhere on the character.",
    "Mature seductive fashion editorial pose, confident eye contact, fitted evening or club outfit, elegant and sensual but non-nude and non-explicit.",
  ].filter(Boolean).join(" ");
  const model = userAsset ? config.characterImage.editModel : config.characterImage.textModel;
  const params = {
    prompt,
    image_size: normalizeSeedreamImageSize(config.characterImage.imageSize),
    num_images: 1,
    max_images: 1,
    enhance_prompt_mode: "standard",
  };

  if (userAsset) {
    const publicAsset = await ensurePublicUrlForUserAsset(auth.db, userAsset);
    params.image_urls = [publicAsset.publicUrl];
  }

  if (body.dryRun === true) {
    return sendJson(res, 200, { ok: true, dryRun: true, model, params });
  }

  console.log("[apiz-character-submit]", JSON.stringify({ model, params }, null, 2));
  const submitted = await apizRequest("/api/v3/tasks/create", { model, params });
  return sendJson(res, 200, {
    ok: true,
    task: submitted,
    model,
    params,
    note: "Character sheet task submitted. The frontend will slice the 4x2 result into 8 rotation frames.",
  });
}

async function handleGetCharacterImage(req, res, taskId) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const task = await apizRequest("/api/v3/tasks/query", { task_id: taskId });
  const imageUrls = collectImageUrls(task);
  let localSheetUrl = "";
  let localSheetPath = "";

  if (isCompletedStatus(task.status) && imageUrls[0]) {
    const local = await downloadGeneratedCharacterSheet(taskId, imageUrls[0]);
    localSheetUrl = local.localUrl;
    localSheetPath = local.localPath;
  }

  return sendJson(res, 200, { ok: true, task, imageUrls, localSheetUrl, localSheetPath });
}

async function handleCreatePanoramaImage(req, res) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;

  const body = await readJson(req);
  const prompt = typeof body.prompt === "string" ? body.prompt : "";
  if (!prompt) return sendJson(res, 400, { ok: false, message: "缺少全景图 prompt。" });

  const params = {
    prompt,
    image_size: body.image_size || "16:9",
    resolution: body.resolution || "4K",
    quality: body.quality || "medium",
    num_images: 1,
    output_format: "png",
  };
  const task = await apizRequest("/api/v3/tasks/create", {
    model: body.model || "openai/gpt-image-2",
    params,
    channel: null,
  });
  return sendJson(res, 200, { ok: true, task, params, slug: body.slug || "panorama" });
}

async function handleGetPanoramaImage(req, res, taskId, url) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;

  const task = await apizRequest("/api/v3/tasks/query", { task_id: taskId });
  const imageUrls = collectImageUrls(task);
  let localUrl = "";
  let localPath = "";
  if (isCompletedStatus(task.status) && imageUrls[0]) {
    const local = await downloadGeneratedPanorama(taskId, imageUrls[0], url.searchParams.get("slug") || "panorama");
    localUrl = local.localUrl;
    localPath = local.localPath;
  }

  return sendJson(res, 200, { ok: true, task, imageUrls, localUrl, localPath });
}

async function handleCreateSceneVideo(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;

  const body = await readJson(req);
  let config = await readAppConfig();
  const sceneConfig = findSceneConfig(config, body.sceneId);
  if (!sceneConfig || sceneConfig.id !== String(body.sceneId || "").trim()) {
    return sendJson(res, 404, { ok: false, message: "Scene not found." });
  }
  const sceneEntry = findSceneEntryConfig(sceneConfig, body.sceneEntryId);
  const userPrompt = makeScenePrompt(body);
  const prompt = makeSceneVideoPrompt(sceneConfig, userPrompt);
  const model = MODEL_QUALITY;
  const quality = "high";
  const dryRun = body.dryRun === true || process.env.SEEDANCE_DRY_RUN === "1";
  if (!prompt) {
    return sendJson(res, 400, { ok: false, message: "No prompt configured for this scene." });
  }

  const cost = clampNumber(body.cost, Number(sceneConfig.price || config.prices.dateVideo || 25), 0, 9999);
  if (auth.user.credits < cost) {
    return sendJson(res, 402, insufficientCreditsPayload(cost, auth.user.credits));
  }

  if (dryRun || !ARK_API_KEY) {
    return sendJson(res, dryRun ? 200 : 503, {
      ok: dryRun,
      code: dryRun ? "DRY_RUN" : "MISSING_ARK_API_KEY",
      message: dryRun ? "Demo task created locally." : "ARK_API_KEY is missing — real Seedance tasks cannot be submitted.",
      task: createDemoTask(body),
      model,
      request: { ratio: body.ratio || "9:16", resolution: body.resolution || "720p", duration: 15 },
    });
  }

  // Resolve the reference asset by character (admin home item OR user
  // custom character). We always go through the synthetic-reference
  // pipeline so the generated video shows the character, not just the
  // raw upload "moving a bit".
  let referenceAssetUri = "";
  let resolvedCompanionId = String(body.companionId || "").trim();
  let resolvedCompanionName = String(body.companionName || "").trim();
  let partnerCharacterId = String(body.partnerCharacterId || "").trim();
  let partnerCharacterName = "";
  let partnerReferenceAssetUri = "";

  if (resolvedCompanionId) {
    config.homeVideo = normalizeHomeVideo(config.homeVideo || {});
    const homeItem = findHomeVideoItem(config.homeVideo, resolvedCompanionId);
    if (homeItem) {
      try {
        config = await ensureSyntheticReferenceForHomeItem(config, homeItem.id);
        const refItem = findHomeVideoItem(config.homeVideo, homeItem.id);
        if (!refItem?.referenceAssetUri || !refItem?.syntheticReferenceLocalUrl) {
          return sendJson(res, 503, {
            ok: false,
            code: "REFERENCE_NOT_READY",
            message: "Character reference is still being built upstream — please retry in a few seconds.",
          });
        }
        referenceAssetUri = refItem.referenceAssetUri;
        resolvedCompanionId = refItem.id;
        resolvedCompanionName = refItem.name || resolvedCompanionName;
      } catch (error) {
        const status = error.statusCode || 502;
        return sendJson(res, status, {
          ok: false,
          code: "REFERENCE_BUILD_FAILED",
          message: `Failed to prepare character reference: ${error.message || error}`,
        });
      }
    } else {
      const userChar = (auth.db.userCharacters || []).find((entry) => entry.id === resolvedCompanionId && entry.userId === auth.user.id && !isSoftDeleted(entry));
      if (userChar) {
        try {
          const prepared = await ensureCharacterReferenceForRecord({ ...userChar });
          if (!prepared.referenceAssetUri) {
            return sendJson(res, 503, {
              ok: false,
              code: "REFERENCE_NOT_READY",
              message: "Custom character reference still building — please retry in a few seconds.",
            });
          }
          auth.db.userCharacters = auth.db.userCharacters.map((entry) => (entry.id === prepared.id ? prepared : entry));
          await writeDb(auth.db);
          referenceAssetUri = prepared.referenceAssetUri;
          resolvedCompanionName = prepared.name || resolvedCompanionName;
        } catch (error) {
          const status = error.statusCode || 502;
          return sendJson(res, status, {
            ok: false,
            code: "REFERENCE_BUILD_FAILED",
            message: `Failed to prepare custom character reference: ${error.message || error}`,
          });
        }
      }
    }
  }

  if (!referenceAssetUri) {
    referenceAssetUri = String(body.referenceAssetUri || "");
  }

  if (!referenceAssetUri) {
    return sendJson(res, 400, {
      ok: false,
      code: "MISSING_REFERENCE_ASSET",
      message: "No character reference is available — please pick a character first.",
    });
  }

  if (partnerCharacterId) {
    const partner = (auth.db.userCharacters || []).find((entry) => entry.id === partnerCharacterId && entry.userId === auth.user.id && !isSoftDeleted(entry));
    if (!partner) {
      return sendJson(res, 404, { ok: false, message: "Partner character not found." });
    }
    try {
      const preparedPartner = await ensureCharacterReferenceForRecord({ ...partner });
      if (!preparedPartner.referenceAssetUri) {
        return sendJson(res, 503, {
          ok: false,
          code: "REFERENCE_NOT_READY",
          message: "Partner character reference still building - please retry in a few seconds.",
        });
      }
      auth.db.userCharacters = auth.db.userCharacters.map((entry) => (entry.id === preparedPartner.id ? preparedPartner : entry));
      await writeDb(auth.db);
      partnerCharacterName = preparedPartner.name || "Partner";
      partnerReferenceAssetUri = preparedPartner.referenceAssetUri || "";
    } catch (error) {
      const status = error.statusCode || 502;
      return sendJson(res, status, {
        ok: false,
        code: "REFERENCE_BUILD_FAILED",
        message: `Failed to prepare partner character reference: ${error.message || error}`,
      });
    }
  }

  const finalPrompt = partnerReferenceAssetUri
    ? makeInteractiveSceneVideoPrompt(sceneConfig, resolvedCompanionName || body.companionName || "", partnerCharacterName, userPrompt)
    : prompt;

  const payload = {
    model,
    content: [{ type: "text", text: finalPrompt }],
    generate_audio: true,
    ratio: body.ratio || config.video.ratio || "9:16",
    resolution: body.resolution || config.video.resolution || "720p",
    duration: clampNumber(body.duration, config.video.duration || 15, 5, 15),
    watermark: false,
  };

  if (referenceAssetUri.startsWith("asset://")) {
    payload.content.push({
      type: "image_url",
      image_url: { url: referenceAssetUri },
      role: "reference_image",
    });
  }
  if (partnerReferenceAssetUri && partnerReferenceAssetUri.startsWith("asset://") && partnerReferenceAssetUri !== referenceAssetUri) {
    payload.content.push({
      type: "image_url",
      image_url: { url: partnerReferenceAssetUri },
      role: "reference_image",
    });
  }

  auth.user.credits -= cost;
  auth.user.updatedAt = new Date().toISOString();
  await writeDb(auth.db);

  console.log("[seedance-submit-payload]", JSON.stringify(payload, null, 2));
  let raw;
  try {
    raw = await arkRequest("POST", "/contents/generations/tasks", payload);
  } catch (error) {
    auth.user.credits += cost;
    await writeDb(auth.db);
    throw error;
  }
  const task = normalizeTask(raw);
  await upsertGenerationRecord({
    taskId: task.taskId,
    status: task.status,
    model,
    sceneId: body.sceneId || "",
    sceneName: body.sceneName || "",
    sceneEntryId: sceneEntry.id,
    sceneEntryName: sceneEntry.name,
    companionId: resolvedCompanionId || body.companionId || "",
    companionName: resolvedCompanionName || body.companionName || "",
    userId: auth.user.id,
    referenceAssetUri,
    partnerCharacterId,
    partnerCharacterName,
    partnerReferenceAssetUri,
    prompt: body.prompt || "",
    finalPrompt,
    ratio: payload.ratio,
    resolution: payload.resolution,
    duration: payload.duration,
    quality,
    remoteVideoUrl: task.videoUrl || "",
    localVideoUrl: "",
    error: "",
    source: "user-scene-video",
  });

  return sendJson(res, 200, {
    ok: true,
    model,
    task: {
      taskId: task.taskId,
      status: task.status,
      videoUrl: task.videoUrl,
    },
    user: userView(auth.user),
    cost,
    sceneEntry,
  });
}

async function handleGetSceneVideo(req, res, taskId) {
  if (taskId.startsWith("demo-")) {
    const task = getDemoTask(taskId);
    if (!task) return sendJson(res, 404, { ok: false, message: "Demo task not found." });
    return sendJson(res, 200, { ok: true, task });
  }

  const raw = await arkRequest("GET", `/contents/generations/tasks/${encodeURIComponent(taskId)}`);
  const task = normalizeTask(raw);
  let localVideoUrl = "";
  let localVideoPath = "";
  let downloadError = "";

  if (isSucceededStatus(task.status) && task.videoUrl) {
    try {
      const localVideo = await downloadGeneratedVideo(taskId, task.videoUrl);
      localVideoUrl = localVideo.localVideoUrl;
      localVideoPath = localVideo.localVideoPath;
    } catch (error) {
      downloadError = error.message || "Failed to download generated video.";
    }
  }

  await upsertGenerationRecord({
    taskId: task.taskId || taskId,
    status: task.status,
    remoteVideoUrl: task.videoUrl || "",
    localVideoUrl,
    localVideoPath,
    error: task.error || downloadError || "",
  });

  return sendJson(res, 200, {
    ok: true,
    task: {
      taskId: task.taskId || taskId,
      status: task.status,
      videoUrl: localVideoUrl || task.videoUrl,
      remoteVideoUrl: task.videoUrl,
      localVideoUrl,
      error: task.error || downloadError,
    },
  });
}

async function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname === "/" ? "/platform.html" : url.pathname);
  if (pathname === "/game" || pathname === "/game/") pathname = "/index.html";
  if (await isProtectedUnlockAssetPath(pathname)) {
    return sendText(res, 403, "Unlock required");
  }
  const filePath = path.normalize(path.join(ROOT, pathname));

  if (!filePath.startsWith(ROOT)) {
    return sendText(res, 403, "Forbidden");
  }

  try {
    const contentType = mimeTypes.get(path.extname(filePath).toLowerCase()) || "application/octet-stream";
    const stat = await fs.stat(filePath);
    const range = req.headers.range;

    if (range && contentType.startsWith("video/")) {
      const match = range.match(/bytes=(\d*)-(\d*)/);
      const start = match?.[1] ? Number(match[1]) : 0;
      const end = match?.[2] ? Number(match[2]) : stat.size - 1;
      const chunkStart = Math.max(0, start);
      const chunkEnd = Math.min(stat.size - 1, end);

      if (chunkStart > chunkEnd || Number.isNaN(chunkStart) || Number.isNaN(chunkEnd)) {
        res.writeHead(416, { "content-range": `bytes */${stat.size}` });
        return res.end();
      }

      res.writeHead(206, {
        "content-type": contentType,
        "content-length": chunkEnd - chunkStart + 1,
        "content-range": `bytes ${chunkStart}-${chunkEnd}/${stat.size}`,
        "accept-ranges": "bytes",
        "cache-control": "public, max-age=604800, immutable",
      });

      if (req.method === "HEAD") return res.end();
      return fsSync.createReadStream(filePath, { start: chunkStart, end: chunkEnd }).pipe(res);
    }

    const data = await fs.readFile(filePath);
    res.writeHead(200, {
      "content-type": contentType,
      "content-length": stat.size,
      "accept-ranges": contentType.startsWith("video/") ? "bytes" : "none",
      "cache-control": contentType.startsWith("text/")
        ? "no-cache"
        : contentType.startsWith("video/")
          ? "public, max-age=604800, immutable"
          : "public, max-age=60",
    });
    if (req.method === "HEAD") return res.end();
    res.end(data);
  } catch (error) {
    if (error.code === "ENOENT") return sendText(res, 404, "Not Found");
    throw error;
  }
}

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    if (req.method === "GET" && url.pathname === "/api/health") {
      return sendJson(res, 200, {
        ok: true,
        arkConfigured: Boolean(ARK_API_KEY),
        generationConfigured: Boolean(APIZ_API_KEY),
        baseUrl: ARK_BASE_URL,
        models: { fast: MODEL_FAST, quality: MODEL_QUALITY },
      });
    }

    if (req.method === "GET" && url.pathname === "/api/config/public") {
      let config = await readAppConfig();
      config = await ensureSceneEntriesPersisted(config);
      config = await refreshCompletedHomeVideoItems(config);
      return sendJson(res, 200, { ok: true, config: publicConfig(config) });
    }

    if (req.method === "POST" && url.pathname === "/api/auth/register") {
      return await handleRegister(req, res);
    }

    if (req.method === "POST" && url.pathname === "/api/auth/login") {
      return await handleLogin(req, res);
    }

    if (req.method === "GET" && url.pathname === "/api/auth/me") {
      return await handleMe(req, res);
    }

    if (req.method === "POST" && url.pathname === "/api/pay/orders") {
      return await handleCreatePaymentOrder(req, res);
    }

    if (req.method === "GET" && url.pathname === "/api/pay/orders") {
      return await handleListPaymentOrders(req, res);
    }

    if (req.method === "POST" && url.pathname === "/api/wallet/spend") {
      return await handleSpendCredits(req, res);
    }

    if (req.method === "GET" && url.pathname === "/api/unlocks") {
      return await handleListUnlocks(req, res);
    }

    if (req.method === "POST" && url.pathname === "/api/unlock-video") {
      return await handleUnlockVideo(req, res);
    }

    const unlockStreamMatch = url.pathname.match(/^\/api\/unlock-video\/stream\/([^/]+)$/);
    if ((req.method === "GET" || req.method === "HEAD") && unlockStreamMatch) {
      return await handleStreamUnlockVideo(req, res, unlockStreamMatch[1]);
    }

    if (req.method === "POST" && url.pathname === "/api/user-assets") {
      return await handleUploadUserAsset(req, res);
    }

    if (req.method === "POST" && url.pathname === "/api/platform/generate") {
      return await handlePlatformGenerate(req, res);
    }

    if (req.method === "POST" && url.pathname === "/api/advanced/request-access") {
      return await handleAdvancedAccessRequest(req, res);
    }

    if (req.method === "POST" && url.pathname === "/api/advanced/generate") {
      return await handleAdvancedGenerate(req, res);
    }

    if (req.method === "GET" && url.pathname === "/api/platform/estimates") {
      return await handlePlatformEstimates(req, res, url);
    }

    if (req.method === "GET" && url.pathname === "/api/user-assets") {
      return await handleListUserAssets(req, res);
    }

    const userAssetMatch = url.pathname.match(/^\/api\/user-assets\/([^/]+)$/);
    if (req.method === "DELETE" && userAssetMatch) {
      return await handleDeleteUserAsset(req, res, userAssetMatch[1]);
    }

    if (req.method === "POST" && url.pathname === "/api/character-image") {
      return await handleCreateCharacterImage(req, res);
    }

    const characterImageTaskMatch = url.pathname.match(/^\/api\/character-image\/([^/]+)$/);
    if (req.method === "GET" && characterImageTaskMatch) {
      return await handleGetCharacterImage(req, res, characterImageTaskMatch[1]);
    }

    if (req.method === "POST" && url.pathname === "/api/panorama-image") {
      return await handleCreatePanoramaImage(req, res);
    }

    const panoramaImageTaskMatch = url.pathname.match(/^\/api\/panorama-image\/([^/]+)$/);
    if (req.method === "GET" && panoramaImageTaskMatch) {
      return await handleGetPanoramaImage(req, res, panoramaImageTaskMatch[1], url);
    }

    if (req.method === "GET" && url.pathname === "/api/admin/config") {
      return await handleAdminGetConfig(req, res);
    }

    if (req.method === "PUT" && url.pathname === "/api/admin/config") {
      return await handleAdminSaveConfig(req, res);
    }

    if (req.method === "GET" && url.pathname === "/api/admin/overview") {
      return await handleAdminList(req, res);
    }

    if (req.method === "POST" && url.pathname === "/api/admin/home-image") {
      return await handleAdminUploadHomeImage(req, res);
    }

    if (req.method === "POST" && url.pathname === "/api/admin/platform-cover") {
      return await handleAdminUploadPlatformCover(req, res);
    }

    if (req.method === "POST" && url.pathname === "/api/admin/home-video") {
      return await handleAdminCreateHomeVideo(req, res);
    }

    const homeVideoTaskMatch = url.pathname.match(/^\/api\/admin\/home-video\/([^/]+)$/);
    if (req.method === "GET" && homeVideoTaskMatch) {
      return await handleAdminGetHomeVideo(req, res, homeVideoTaskMatch[1]);
    }

    if (req.method === "POST" && url.pathname === "/api/admin/character-scene-video") {
      return await handleAdminCreateCharacterSceneVideo(req, res);
    }

    const adminSceneVideoTaskMatch = url.pathname.match(/^\/api\/admin\/character-scene-video\/([^/]+)$/);
    if (req.method === "GET" && adminSceneVideoTaskMatch) {
      return await handleAdminGetCharacterSceneVideo(req, res, adminSceneVideoTaskMatch[1]);
    }

    if (req.method === "GET" && url.pathname === "/api/admin/ifilm/status") {
      return await handleAdminIfilmStatus(req, res);
    }

    if (req.method === "GET" && url.pathname === "/api/admin/dashboard") {
      return await handleAdminDashboard(req, res);
    }

    if (req.method === "GET" && url.pathname === "/api/admin/users") {
      return await handleAdminListUsers(req, res);
    }

    const adminUserMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
    if (req.method === "PATCH" && adminUserMatch) {
      return await handleAdminUpdateUser(req, res, adminUserMatch[1]);
    }
    if (req.method === "DELETE" && adminUserMatch) {
      return await handleAdminDeleteUser(req, res, adminUserMatch[1]);
    }

    const adminUserPwMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)\/password$/);
    if (req.method === "POST" && adminUserPwMatch) {
      return await handleAdminResetPassword(req, res, adminUserPwMatch[1]);
    }

    if (req.method === "GET" && url.pathname === "/api/admin/my-characters") {
      return await handleAdminListMyCharacters(req, res);
    }

    const adminMyCharMatch = url.pathname.match(/^\/api\/admin\/my-characters\/([^/]+)$/);
    if (req.method === "DELETE" && adminMyCharMatch) {
      return await handleAdminDeleteMyCharacter(req, res, adminMyCharMatch[1]);
    }

    const adminHomeItemMatch = url.pathname.match(/^\/api\/admin\/home-items\/([^/]+)$/);
    if (req.method === "PATCH" && adminHomeItemMatch) {
      return await handleAdminUpdateHomeItem(req, res, adminHomeItemMatch[1]);
    }
    if (req.method === "DELETE" && adminHomeItemMatch) {
      return await handleAdminDeleteHomeItem(req, res, adminHomeItemMatch[1]);
    }

    const adminHomeActiveMatch = url.pathname.match(/^\/api\/admin\/home-items\/([^/]+)\/active$/);
    if (req.method === "POST" && adminHomeActiveMatch) {
      return await handleAdminSetHomeActive(req, res, adminHomeActiveMatch[1]);
    }

    const adminHomeRebuildMatch = url.pathname.match(/^\/api\/admin\/home-items\/([^/]+)\/rebuild-reference$/);
    if (req.method === "POST" && adminHomeRebuildMatch) {
      return await handleAdminRebuildHomeItemReference(req, res, adminHomeRebuildMatch[1]);
    }

    if (req.method === "GET" && url.pathname === "/api/admin/scenes") {
      return await handleAdminListScenes(req, res);
    }

    const adminSceneMatch = url.pathname.match(/^\/api\/admin\/scenes\/([^/]+)$/);
    if (req.method === "PATCH" && adminSceneMatch) {
      return await handleAdminUpdateScene(req, res, adminSceneMatch[1]);
    }

    const adminSceneEntryCollectionMatch = url.pathname.match(/^\/api\/admin\/scenes\/([^/]+)\/entries$/);
    if (req.method === "POST" && adminSceneEntryCollectionMatch) {
      return await handleAdminCreateSceneEntry(req, res, adminSceneEntryCollectionMatch[1]);
    }

    const adminSceneEntryMatch = url.pathname.match(/^\/api\/admin\/scenes\/([^/]+)\/entries\/([^/]+)$/);
    if (req.method === "PATCH" && adminSceneEntryMatch) {
      return await handleAdminUpdateSceneEntry(req, res, adminSceneEntryMatch[1], adminSceneEntryMatch[2]);
    }

    if (req.method === "GET" && url.pathname === "/api/admin/wallet-orders") {
      return await handleAdminListWalletOrders(req, res);
    }

    const adminOrderMatch = url.pathname.match(/^\/api\/admin\/wallet-orders\/([^/]+)$/);
    if (req.method === "PATCH" && adminOrderMatch) {
      return await handleAdminUpdateWalletOrder(req, res, adminOrderMatch[1]);
    }

    if (req.method === "GET" && url.pathname === "/api/admin/user-assets") {
      return await handleAdminListUserAssets(req, res);
    }

    if (req.method === "GET" && url.pathname === "/api/admin/generation-records") {
      return await handleAdminListGenerationRecords(req, res, url);
    }

    if (req.method === "POST" && url.pathname === "/api/my/characters/draft") {
      return await handleSaveMyCharacterDraft(req, res);
    }

    const myCharacterStartMainMatch = url.pathname.match(/^\/api\/my\/characters\/([^/]+)\/start-main-video$/);
    if (req.method === "POST" && myCharacterStartMainMatch) {
      return await handleStartMyCharacterMainVideo(req, res, myCharacterStartMainMatch[1]);
    }

    if (req.method === "POST" && url.pathname === "/api/my/characters") {
      return await handleCreateMyCharacter(req, res);
    }

    if (req.method === "GET" && url.pathname === "/api/my/characters") {
      return await handleListMyCharacters(req, res);
    }

    const myCharacterMatch = url.pathname.match(/^\/api\/my\/characters\/([^/]+)$/);
    if (req.method === "GET" && myCharacterMatch) {
      return await handleGetMyCharacter(req, res, myCharacterMatch[1]);
    }
    if (req.method === "DELETE" && myCharacterMatch) {
      return await handleDeleteMyCharacter(req, res, myCharacterMatch[1]);
    }

    const myCharacterMainTaskMatch = url.pathname.match(/^\/api\/my\/characters\/([^/]+)\/main-video$/);
    if (req.method === "GET" && myCharacterMainTaskMatch) {
      return await handleQueryMyCharacterMainVideo(req, res, myCharacterMainTaskMatch[1]);
    }

    const myCharacterSceneCreateMatch = url.pathname.match(/^\/api\/my\/characters\/([^/]+)\/scene-video$/);
    if (req.method === "POST" && myCharacterSceneCreateMatch) {
      return await handleCreateMyCharacterSceneVideo(req, res, myCharacterSceneCreateMatch[1]);
    }

    const myCharacterSceneTaskMatch = url.pathname.match(/^\/api\/my\/scene-video\/([^/]+)$/);
    if (req.method === "GET" && myCharacterSceneTaskMatch) {
      return await handleQueryMyCharacterSceneVideo(req, res, myCharacterSceneTaskMatch[1]);
    }

    if (req.method === "GET" && url.pathname === "/api/character-assets") {
      const assets = await getKv("character_assets", {});
      return sendJson(res, 200, { ok: true, assets: assets && typeof assets === "object" ? assets : {} });
    }

    if (req.method === "GET" && url.pathname === "/api/generation-records") {
      return await handleListGenerationRecords(req, res, url);
    }

    const generationRecordMatch = url.pathname.match(/^\/api\/generation-records\/([^/]+)$/);
    if (req.method === "GET" && generationRecordMatch) {
      return await handleGetGenerationRecord(req, res, decodeURIComponent(generationRecordMatch[1]));
    }

    if (req.method === "POST" && url.pathname === "/api/scene-video") {
      return await handleCreateSceneVideo(req, res);
    }

    const taskMatch = url.pathname.match(/^\/api\/scene-video\/([^/]+)$/);
    if (req.method === "GET" && taskMatch) {
      return await handleGetSceneVideo(req, res, taskMatch[1]);
    }

    if (url.pathname.startsWith("/api/")) {
      return sendJson(res, 404, { ok: false, message: "API not found." });
    }

    return await serveStatic(req, res, url);
  } catch (error) {
    const statusCode = error.statusCode || (error.code === "MISSING_ARK_API_KEY" ? 503 : 500);
    console.error("[api-error]", {
      method: req.method,
      path: url.pathname,
      code: error.code || "SERVER_ERROR",
      message: error.message,
      cause: error.cause?.code || error.cause?.message || "",
    });
    return sendJson(res, statusCode, {
      ok: false,
      code: error.code || "SERVER_ERROR",
      message: error.message || "Server error",
      detail: error.payload?.error?.message || error.payload?.message || error.cause?.message || "",
    });
  }
}

const server = http.createServer((req, res) => {
  handleRequest(req, res);
});

async function bootstrap() {
  if (dbEnabled()) {
    await migrateFileDataToDb({
      defaultDb: DEFAULT_DB,
      defaultConfig: DEFAULT_CONFIG,
    });
  }

  server.listen(PORT, "127.0.0.1", () => {
    console.log(`After Dark demo server: http://127.0.0.1:${PORT}/`);
    console.log(`Ark configured: ${ARK_API_KEY ? "yes" : "no"}`);
    console.log(`Database configured: ${DATABASE_URL ? "yes" : "no"}`);
  });
}

bootstrap().catch((error) => {
  console.error("[bootstrap] failed", error);
  process.exit(1);
});
