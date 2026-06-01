const http = require("node:http");
const crypto = require("node:crypto");
const { AsyncLocalStorage } = require("node:async_hooks");
const fsSync = require("node:fs");
const fs = require("node:fs/promises");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { URL } = require("node:url");
const {
  dbEnabled,
  migrateFileDataToDb,
  migrateGenerationRecordsKvToTable,
  readAppDbFromTables,
  replaceAppDbTables,
  applyCreditDeltaInDb,
  deleteUserSessionsInDb,
  deleteUserWalletOrdersInDb,
  createWalletOrderInDb,
  createManualWalletOrderInDb,
  getUserByUsernameInDb,
  getUserByIdInDb,
  createSessionInDb,
  getSessionByTokenInDb,
  getWalletOrderByIdInDb,
  getWalletOrderByPaypalIdInDb,
  updateWalletOrderInDb,
  updateUserInDb,
  upsertUserAssetInDb,
  upsertUserCharacterInDb,
  upsertUserUnlockInDb,
  findUserUnlockInDb,
  getKv,
  setKv,
  listApiSubtokensFromDb,
  getApiSubtokenFromDbByToken,
  getApiSubtokenFromDbById,
  createApiSubtokenInDb,
  updateApiSubtokenInDb,
  revokeApiSubtokenInDb,
  recordApiSubtokenUsageInDb,
  getGenerationRecordsFromDb,
  getGenerationRecordFromDb,
  upsertGenerationRecordInDb,
  replaceGenerationRecordsInDb,
  patchGenerationRecordsInDb,
} = require("./db");

const ROOT = __dirname;
const CHARACTER_TAKE_OFF_PROMPT = "脱掉所有衣服，保持裸体，不要出现肉色衣服";

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
const BLOCK_MAINLAND_CHINA = false;
const MAINLAND_BYPASS_TOKEN = String(process.env.MAINLAND_BYPASS_TOKEN || "").trim();
const MAINLAND_BYPASS_QUERY_PARAM = process.env.MAINLAND_BYPASS_QUERY_PARAM || "cnpass";
const MAINLAND_BYPASS_COOKIE = process.env.MAINLAND_BYPASS_COOKIE || "cnpass";
const MAINLAND_BYPASS_MAX_AGE_SECONDS = Math.max(
  60,
  Math.min(30 * 24 * 60 * 60, Number(process.env.MAINLAND_BYPASS_MAX_AGE_SECONDS || 24 * 60 * 60) || 24 * 60 * 60),
);

const PORT = Number(process.env.PORT || 4174);
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, "");
const GENERATION_RECORDS_PATH = path.join(ROOT, "data", "generation-records.json");
const APP_DB_PATH = path.join(ROOT, "data", "app-db.json");
const APP_CONFIG_PATH = path.join(ROOT, "data", "app-config.json");
const USER_UPLOAD_DIR = path.join(ROOT, "assets", "user-uploads");
const ADMIN_HOME_DIR = path.join(ROOT, "assets", "admin", "home");
const ADMIN_ADVANCED_CASE_DIR = path.join(ROOT, "assets", "admin", "advanced-cases");
const ADMIN_PLATFORM_TEMPLATE_DIR = path.join(ROOT, "assets", "admin", "platform-templates");
const GENERATED_VIDEO_DIR = path.join(ROOT, "assets", "generated", "videos");
const GENERATED_POSTER_DIR = path.join(ROOT, "assets", "generated", "posters");
const GENERATED_IMAGE_DIR = path.join(ROOT, "assets", "generated", "images");
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
const UPSTREAM_MODE = String(process.env.UPSTREAM_MODE || "direct").trim().toLowerCase();
const USE_GATEWAY_UPSTREAM = ["gateway", "proxy", "api"].includes(UPSTREAM_MODE);
const UPSTREAM_BASE_URL = (process.env.UPSTREAM_BASE_URL || "https://123vips.com").replace(/\/+$/, "");
const UPSTREAM_API_TOKEN = String(process.env.UPSTREAM_API_TOKEN || "").trim();
const GATEWAY_PLATFORM_FALLBACK_CREDITS = Math.max(1, creditsAmount(process.env.GATEWAY_PLATFORM_FALLBACK_CREDITS || 1325));
const APIZ_PRICING_CACHE_TTL_MS = 60 * 60 * 1000;
const apizPricingCache = new Map();
let apizModelListPricingCache = { expiresAt: 0, values: new Map() };
const DEFAULT_USDT_CNY_CENTS = clampNumber(process.env.USDT_CNY_CENTS || process.env.CNY_CENTS_PER_USDT, 720, 1, 100000);
const PAYPAL_ENV = /sandbox/i.test(process.env.PAYPAL_ENV || process.env.PAYPAL_MODE || "") ? "sandbox" : "live";
const PAYPAL_CLIENT_ID = String(process.env.PAYPAL_CLIENT_ID || "").trim();
const PAYPAL_CLIENT_SECRET = String(process.env.PAYPAL_CLIENT_SECRET || "").trim();
const PAYPAL_WEBHOOK_ID = String(process.env.PAYPAL_WEBHOOK_ID || "").trim();
const PAYPAL_CURRENCY = String(process.env.PAYPAL_CURRENCY || "USD").trim().toUpperCase() || "USD";
const PAYPAL_BRAND_NAME = String(process.env.PAYPAL_BRAND_NAME || "Vipeak AI").trim() || "Vipeak AI";
const MIN_TOPUP_AMOUNT = clampNumber(process.env.MIN_TOPUP_AMOUNT, 1, 1, 100000);
const PAYPAL_MIN_AMOUNT = clampNumber(process.env.PAYPAL_MIN_AMOUNT, MIN_TOPUP_AMOUNT, 0.01, 100000);
const PAYPAL_MAX_AMOUNT = clampNumber(process.env.PAYPAL_MAX_AMOUNT, 10000, PAYPAL_MIN_AMOUNT, 1000000);
const PAYPAL_CNY_CENTS_PER_UNIT_ENV =
  process.env.PAYPAL_CNY_CENTS_PER_UNIT ||
  process.env.PAYPAL_USD_CNY_CENTS ||
  process.env.USD_CNY_CENTS ||
  "";
let paypalTokenCache = { accessToken: "", expiresAt: 0 };
const WALLET_CHAIN_SCAN_ENABLED = !/^(0|false|no|off)$/i.test(String(process.env.WALLET_CHAIN_SCAN_ENABLED || "1"));
const WALLET_CHAIN_SCAN_INTERVAL_MS = Math.max(15000, Number(process.env.WALLET_CHAIN_SCAN_INTERVAL_MS || 60000) || 60000);
const WALLET_CHAIN_SCAN_ORDER_TTL_HOURS = Math.max(1, Number(process.env.WALLET_CHAIN_SCAN_ORDER_TTL_HOURS || 72) || 72);
const WALLET_CHAIN_SCAN_LOOKBACK_LIMIT = Math.max(20, Math.min(500, Number(process.env.WALLET_CHAIN_SCAN_LOOKBACK_LIMIT || 120) || 120));
const WALLET_EVM_SCAN_BLOCK_LOOKBACK = Math.max(1000, Number(process.env.WALLET_EVM_SCAN_BLOCK_LOOKBACK || 140000) || 140000);
const WALLET_EVM_SCAN_CHUNK_SIZE = Math.max(500, Math.min(10000, Number(process.env.WALLET_EVM_SCAN_CHUNK_SIZE || 5000) || 5000));
const WALLET_EVM_CONFIRMATIONS = Math.max(1, Number(process.env.WALLET_EVM_CONFIRMATIONS || 12) || 12);
const WALLET_SOLANA_CONFIRMATIONS = Math.max(1, Number(process.env.WALLET_SOLANA_CONFIRMATIONS || 32) || 32);
const WALLET_TRON_CONFIRMATIONS = Math.max(1, Number(process.env.WALLET_TRON_CONFIRMATIONS || 1) || 1);
const ETHERSCAN_API_KEY = String(process.env.ETHERSCAN_API_KEY || process.env.ETHERSCAN_V2_API_KEY || "").trim();
const BSCSCAN_API_KEY = String(process.env.BSCSCAN_API_KEY || process.env.BSC_SCAN_API_KEY || "").trim();
const BASESCAN_API_KEY = String(process.env.BASESCAN_API_KEY || process.env.BASE_SCAN_API_KEY || "").trim();
const SOLANA_RPC_URL = String(process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com").trim();
const TRONGRID_API_KEY = String(process.env.TRONGRID_API_KEY || process.env.TRON_GRID_API_KEY || "").trim();
const WALLET_USDT_CONTRACTS = {
  ethereum: String(process.env.WALLET_ETHEREUM_USDT_CONTRACT || "0xdAC17F958D2ee523a2206206994597C13D831ec7").trim(),
  bnb: String(process.env.WALLET_BNB_USDT_CONTRACT || "0x55d398326f99059fF775485246999027B3197955").trim(),
  base: String(process.env.WALLET_BASE_USDT_CONTRACT || "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2").trim(),
  tron: String(process.env.WALLET_TRON_USDT_CONTRACT || "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t").trim(),
  solana: String(process.env.WALLET_SOLANA_USDT_MINT || "Es9vMFrzaCERmJfrF4H2FYD4Sz7PZsrwLQomDpRg4E6B").trim(),
};
const WALLET_EVM_RPC_URLS = {
  ethereum: String(process.env.WALLET_ETHEREUM_RPC_URL || process.env.ETHEREUM_RPC_URL || "https://ethereum-rpc.publicnode.com,https://eth.drpc.org").split(",").map((url) => url.trim()).filter(Boolean),
  bnb: String(process.env.WALLET_BNB_RPC_URL || process.env.BNB_RPC_URL || "https://bsc-rpc.publicnode.com,https://bsc-dataseed.binance.org").split(",").map((url) => url.trim()).filter(Boolean),
  base: String(process.env.WALLET_BASE_RPC_URL || process.env.BASE_RPC_URL || "https://mainnet.base.org,https://base-rpc.publicnode.com").split(",").map((url) => url.trim()).filter(Boolean),
};
const GENERATION_PRICE_MARKUP = 1.2;
const ADVANCED_SEEDANCE_FPS = clampNumber(process.env.ADVANCED_SEEDANCE_FPS, 24, 1, 120);
const ADVANCED_SEEDANCE_720P_CNY_PER_MILLION_TOKENS = clampNumber(process.env.ADVANCED_SEEDANCE_720P_CNY_PER_MILLION_TOKENS, 46, 0.0001, 100000);
const ADVANCED_SEEDANCE_1080P_CNY_PER_MILLION_TOKENS = clampNumber(process.env.ADVANCED_SEEDANCE_1080P_CNY_PER_MILLION_TOKENS, 51, 0.0001, 100000);
const ADVANCED_CREDITS_PER_CNY = 100;
const ADVANCED_SEEDANCE_720P_CREDITS_PER_SECOND = 150;
const ADVANCED_SEEDANCE_1080P_CREDITS_PER_SECOND = 300;
const ADVANCED_SEEDANCE_VIDEO_INPUT_720P_CREDITS_PER_SECOND = 100;
const ADVANCED_SEEDANCE_VIDEO_INPUT_1080P_CREDITS_PER_SECOND = 200;
const ADVANCED_SEEDANCE_FAST_DISCOUNT = clampNumber(process.env.ADVANCED_SEEDANCE_FAST_DISCOUNT, 0.8, 0.01, 1);
const ADVANCED_WAN27_720P_CREDITS_PER_SECOND = 100;
const ADVANCED_WAN27_1080P_CREDITS_PER_SECOND = 250;
const WAN27_IMAGE_PRO_MODEL = process.env.ALIYUN_WAN27_IMAGE_PRO_MODEL || "wan2.7-image-pro";
const WAN27_IMAGE_PRO_PURCHASE_CNY = pricingNumber(process.env.ALIYUN_WAN27_IMAGE_PRO_PURCHASE_CNY, 0.562065, 0, 6);
const WAN27_IMAGE_PRO_MARKUP = pricingNumber(process.env.ALIYUN_WAN27_IMAGE_PRO_MARKUP, 1.5, 1);
const WAN27_IMAGE_PRO_SALE_CNY = pricingNumber(process.env.ALIYUN_WAN27_IMAGE_PRO_SALE_CNY, WAN27_IMAGE_PRO_PURCHASE_CNY * WAN27_IMAGE_PRO_MARKUP, 0, 6);
const DEFAULT_ADVANCED_PRICING = {
  unit: "credits",
  creditsPerCny: ADVANCED_CREDITS_PER_CNY,
  seedanceCreditsPerSecondByResolution: {
    "480p": Math.ceil(ADVANCED_SEEDANCE_720P_CREDITS_PER_SECOND * 0.5),
    "720p": ADVANCED_SEEDANCE_720P_CREDITS_PER_SECOND,
    "1080p": ADVANCED_SEEDANCE_1080P_CREDITS_PER_SECOND,
  },
  seedanceVideoInputCreditsPerSecondByResolution: {
    "480p": Math.ceil(ADVANCED_SEEDANCE_VIDEO_INPUT_720P_CREDITS_PER_SECOND * 0.5),
    "720p": ADVANCED_SEEDANCE_VIDEO_INPUT_720P_CREDITS_PER_SECOND,
    "1080p": ADVANCED_SEEDANCE_VIDEO_INPUT_1080P_CREDITS_PER_SECOND,
  },
  wan27CreditsPerSecondByResolution: {
    "720p": ADVANCED_WAN27_720P_CREDITS_PER_SECOND,
    "1080p": ADVANCED_WAN27_1080P_CREDITS_PER_SECOND,
  },
  wan27ImagePro: {
    model: WAN27_IMAGE_PRO_MODEL,
    purchaseCnyPerImage: WAN27_IMAGE_PRO_PURCHASE_CNY,
    saleCnyPerImage: WAN27_IMAGE_PRO_SALE_CNY,
    resolutions: ["1K", "2K"],
    ratios: ["1:1", "3:4", "4:3", "9:16", "16:9"],
    defaultResolution: "2K",
    defaultRatio: "9:16",
  },
};
const ADVANCED_GENERATION_MARKUP = clampNumber(process.env.ADVANCED_GENERATION_MARKUP, 1.5, 1, 100);
const ADVANCED_SEEDANCE_REFERENCE_LIMIT = Math.floor(clampNumber(process.env.ADVANCED_SEEDANCE_REFERENCE_LIMIT || process.env.ADVANCED_SEEDANCE_EXTRA_REFERENCE_LIMIT, 9, 1, 9));
const ADVANCED_SEEDANCE_VIDEO_REFERENCE_LIMIT = Math.floor(clampNumber(process.env.ADVANCED_SEEDANCE_VIDEO_REFERENCE_LIMIT, 3, 1, 3));
const ADVANCED_SEEDANCE_AUDIO_REFERENCE_LIMIT = Math.floor(clampNumber(process.env.ADVANCED_SEEDANCE_AUDIO_REFERENCE_LIMIT, 3, 1, 3));
const JSON_BODY_MAX_BYTES = Math.floor(clampNumber(process.env.JSON_BODY_MAX_MB, 80, 1, 200) * 1024 * 1024);
const VIDEO_DURATION_PROBE_TIMEOUT_MS = Math.max(3000, Number(process.env.VIDEO_DURATION_PROBE_TIMEOUT_MS || 10000) || 10000);
const ALIYUN_DASHSCOPE_BASE_URL = (process.env.ALIYUN_DASHSCOPE_BASE_URL || "https://dashscope-intl.aliyuncs.com").replace(/\/+$/, "");
const ALIYUN_DASHSCOPE_API_KEY =
  process.env.ALIYUN_DASHSCOPE_API_KEY ||
  process.env.DASHSCOPE_API_KEY ||
  process.env.BAILIAN_API_KEY ||
  "";
const ALIYUN_DASHSCOPE_DATA_INSPECTION_HEADER = process.env.ALIYUN_DASHSCOPE_DATA_INSPECTION_HEADER ||
  '{"input":"disable", "output":"disable"}';
const ALIYUN_WAN27_MODEL = process.env.ALIYUN_WAN27_MODEL || "wan2.7-i2v-2026-04-25";
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
const DISABLE_TOS_STORAGE = /^(1|true|yes|on)$/i.test(String(process.env.DISABLE_TOS_STORAGE || ""));
const SITE_STORAGE_SLUG = storagePathSegment(
  process.env.SITE_STORAGE_SLUG || process.env.TENANT_SLUG || defaultStorageSlug(),
  "raising-game",
);
const TOS_KEY_PREFIX = storageKeyPrefix(
  process.env.TOS_KEY_PREFIX || process.env.STORAGE_KEY_PREFIX || `seedance-assets/${SITE_STORAGE_SLUG}`,
);

function defaultStorageSlug() {
  try {
    const host = new URL(PUBLIC_BASE_URL || "https://raising-game.local").hostname;
    if (/cloudtoken/i.test(host)) return "cloudtoken";
  } catch {
    // Keep the legacy namespace when the public URL is not configured yet.
  }
  return "raising-game";
}

function storagePathSegment(value = "", fallback = "asset") {
  return String(value || fallback)
    .trim()
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 128) || fallback;
}

function storageKeyPrefix(value = "") {
  const prefix = String(value || "").trim().replace(/^\/+|\/+$/g, "");
  return prefix
    .split("/")
    .map((part) => storagePathSegment(part, ""))
    .filter(Boolean)
    .join("/") || "seedance-assets/raising-game";
}

function tosStorageKey(...parts) {
  const suffix = parts
    .flat()
    .map((part) => storagePathSegment(part, "asset"))
    .filter(Boolean)
    .join("/");
  return [TOS_KEY_PREFIX, suffix].filter(Boolean).join("/");
}

function storageObjectName(kind = "asset", id = "item") {
  return `${SITE_STORAGE_SLUG}-${storagePathSegment(kind)}-${storagePathSegment(id)}-${Date.now()}`;
}

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
const requestContext = new AsyncLocalStorage();
let legacyAppStateWriteLock = Promise.resolve();

async function withAppStateWriteLock(fn) {
  let store = requestContext.getStore();
  if (!store) {
    return requestContext.run({ auth: null, appStateWriteLocked: false }, () => withAppStateWriteLock(fn));
  }
  if (store?.appStateWriteLocked) return await fn();
  if (!dbEnabled()) {
    const previous = legacyAppStateWriteLock;
    let release;
    legacyAppStateWriteLock = new Promise((resolve) => {
      release = resolve;
    });
    await previous.catch(() => {});
    try {
      store.appStateWriteLocked = true;
      try {
        return await fn();
      } finally {
        store.appStateWriteLocked = false;
      }
    } finally {
      release();
    }
  }
  store.appStateWriteLocked = true;
  try {
    return await fn();
  } finally {
    store.appStateWriteLocked = false;
  }
}

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
  [".mov", "video/quicktime"],
  [".m4v", "video/x-m4v"],
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
  apiSubtokens: [],
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
    address: "TBaZJZrLdqwb4bSDQnp2LzRaBo3RkhJ6rA",
    qrUrl: "/assets/wallet/usdt-trc20-qr.png",
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
    notice: "Generated results are saved in history. Video links may expire after 24 hours, so download and save them in time.",
    accessCopy:
      "POST /api/platform/generate\nAuthorization: Bearer <user-token>\nContent-Type: application/json\n\n{\"templateId\":\"template-id\",\"prompt\":\"...\",\"dataUrl\":\"data:image/png;base64,...\"}\n\nGET /api/generation-records\nGET /api/generation-records/<taskId>\n\nImportant: returned video URLs may expire after 24 hours. Download and save successful videos promptly.",
    advancedPricing: DEFAULT_ADVANCED_PRICING,
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

const OLD_SITE_TRON_WALLET_OPTION = {
  id: "tron",
  label: "Tron",
  network: "TRC20 / Tron",
  asset: "USDT",
  address: "TBaZJZrLdqwb4bSDQnp2LzRaBo3RkhJ6rA",
  qrUrl: "/assets/wallet/usdt-trc20-qr.png",
  explorerUrl: "https://tronscan.org/#/address/TBaZJZrLdqwb4bSDQnp2LzRaBo3RkhJ6rA",
};

const CLOUDTOKEN_TRON_WALLET_OPTION = {
  id: "trc20",
  label: "TRC20",
  network: "TRC20",
  asset: "USDT",
  address: "TFLCCcZoNyavF5nGFYHKHitWLZ88888888",
  qrUrl: "/assets/wallet/cloudtoken-usdt-trc20-qr.png",
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

function sendCsv(res, filename, body) {
  const safeName = String(filename || "export.csv").replace(/[^a-z0-9._-]/gi, "-") || "export.csv";
  res.writeHead(200, {
    "content-type": "text/csv; charset=utf-8",
    "content-disposition": `attachment; filename="${safeName}"`,
    "cache-control": "no-store",
  });
  res.end(`\uFEFF${body}`);
}

function csvValue(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvRows(headers, rows) {
  return [
    headers.map(({ label }) => csvValue(label)).join(","),
    ...rows.map((row) => headers.map(({ key }) => csvValue(row[key])).join(",")),
  ].join("\n");
}

function requestCountryCode(req) {
  return String(
    req.headers["cf-ipcountry"] ||
      req.headers["x-vercel-ip-country"] ||
      req.headers["x-country-code"] ||
      "",
  ).trim().toUpperCase();
}

function parseCookieHeader(header = "") {
  const cookies = {};
  String(header || "").split(";").forEach((part) => {
    const index = part.indexOf("=");
    if (index < 0) return;
    const key = part.slice(0, index).trim();
    if (!key) return;
    cookies[key] = decodeURIComponent(part.slice(index + 1).trim());
  });
  return cookies;
}

function timingSafeEqualString(a = "", b = "") {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function requestHasMainlandBypass(req, url) {
  if (!MAINLAND_BYPASS_TOKEN) return false;
  const queryToken = url.searchParams.get(MAINLAND_BYPASS_QUERY_PARAM) || "";
  if (queryToken && timingSafeEqualString(queryToken, MAINLAND_BYPASS_TOKEN)) return true;
  const cookies = parseCookieHeader(req.headers.cookie || "");
  return timingSafeEqualString(cookies[MAINLAND_BYPASS_COOKIE] || "", MAINLAND_BYPASS_TOKEN);
}

function setMainlandBypassCookie(res) {
  if (!MAINLAND_BYPASS_TOKEN) return;
  const cookie = [
    `${MAINLAND_BYPASS_COOKIE}=${encodeURIComponent(MAINLAND_BYPASS_TOKEN)}`,
    "Path=/",
    `Max-Age=${MAINLAND_BYPASS_MAX_AGE_SECONDS}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
  ].join("; ");
  const previous = res.getHeader("set-cookie");
  const next = previous ? (Array.isArray(previous) ? [...previous, cookie] : [previous, cookie]) : cookie;
  res.setHeader("set-cookie", next);
}

function redirectWithoutBypassParam(res, url) {
  const redirectUrl = new URL(url.pathname + url.search, "https://123vips.com");
  redirectUrl.searchParams.delete(MAINLAND_BYPASS_QUERY_PARAM);
  const location = `${redirectUrl.pathname}${redirectUrl.search}${url.hash || ""}` || "/";
  res.writeHead(302, {
    location,
    "cache-control": "no-store",
  });
  return res.end();
}

function shouldCleanBypassUrl(req, url) {
  return req.method === "GET" && !url.pathname.startsWith("/api/") && url.searchParams.has(MAINLAND_BYPASS_QUERY_PARAM);
}

function isMainlandChinaRequest(req) {
  return BLOCK_MAINLAND_CHINA && requestCountryCode(req) === "CN";
}

function sendMainlandBlocked(req, res, url) {
  const headers = {
    "cache-control": "no-store",
    "vary": "CF-IPCountry",
    "x-region-blocked": "CN",
  };
  if (url.pathname.startsWith("/api/")) {
    res.writeHead(451, { ...headers, "content-type": "application/json; charset=utf-8" });
    return res.end(JSON.stringify({
      ok: false,
      code: "REGION_BLOCKED",
      message: "Service is not available in this region.",
    }));
  }
  res.writeHead(451, { ...headers, "content-type": "text/plain; charset=utf-8" });
  return res.end("Service is not available in this region.");
}

function sendMarkdown(res, statusCode, body) {
  res.writeHead(statusCode, {
    "content-type": "text/markdown; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(body);
}

function publicOriginFromRequest(req) {
  if (PUBLIC_BASE_URL) return PUBLIC_BASE_URL;
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
  if (!host) return "https://123vips.com";
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const localHost = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host);
  const protocol = forwardedProto || (localHost ? "http" : "https");
  return `${protocol}://${host}`.replace(/\/+$/, "");
}

function configuredPublicBaseUrl() {
  return (PUBLIC_BASE_URL || "").replace(/\/+$/, "");
}

function publicUrlForAssetPath(localUrl = "") {
  const value = String(localUrl || "").trim();
  if (!value) return "";
  if (isPublicHttpUrl(value)) return value;
  const baseUrl = configuredPublicBaseUrl();
  if (!baseUrl) return "";
  return `${baseUrl}/${value.replace(/^\/+/, "")}`;
}

function absoluteUrlFromBase(value = "", baseUrl = "") {
  const text = String(value || "").trim();
  if (!text || isPublicHttpUrl(text)) return text;
  const base = String(baseUrl || "").trim().replace(/\/+$/, "");
  if (!base || !text.startsWith("/")) return text;
  return `${base}${text}`;
}

function requestTenantOptions(req) {
  return { tenantPublic: isTenantPublicOrigin(publicOriginFromRequest(req)) };
}

function isLocalPublicAssetUrl(value = "") {
  const baseUrl = configuredPublicBaseUrl();
  return Boolean(baseUrl && String(value || "").startsWith(`${baseUrl}/assets/`));
}

function isTenantPublicOrigin(origin = "") {
  const value = String(origin || "").trim();
  if (!value) return false;
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    return /(^|\.)cloudtoken\.ai$/i.test(url.hostname);
  } catch {
    return /(^|\.)cloudtoken\.ai(?::|\/|$)/i.test(value);
  }
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
  const db = dbEnabled()
    ? (await readAppDbFromTables(DEFAULT_DB) || DEFAULT_DB)
    : await getKv("app_db", DEFAULT_DB);
  return {
    users: Array.isArray(db.users) ? db.users : [],
    sessions: Array.isArray(db.sessions) ? db.sessions : [],
    walletOrders: Array.isArray(db.walletOrders) ? db.walletOrders : [],
    creditLedger: Array.isArray(db.creditLedger) ? db.creditLedger : [],
    userAssets: Array.isArray(db.userAssets) ? db.userAssets : [],
    userCharacters: Array.isArray(db.userCharacters) ? db.userCharacters : [],
    userUnlocks: Array.isArray(db.userUnlocks) ? db.userUnlocks : [],
    adminHomeItems: Array.isArray(db.adminHomeItems) ? db.adminHomeItems : [],
    apiSubtokens: Array.isArray(db.apiSubtokens) ? db.apiSubtokens : [],
  };
}

function isSoftDeleted(record) {
  return Boolean(record?.deletedAt);
}

async function writeDb(db) {
  return withAppStateWriteLock(() => (
    dbEnabled() ? replaceAppDbTables(db) : setKv("app_db", db)
  ));
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
  return withAppStateWriteLock(() => setKv("app_config", config));
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

function scopedApiUrl(origin, pathname = "/") {
  const base = String(origin || "").replace(/\/+$/, "");
  if (!base) return pathname;
  const pathValue = String(pathname || "/");
  const normalizedPath = pathValue.startsWith("/") ? pathValue : `/${pathValue}`;
  return `${base}${normalizedPath}`;
}

function tenantScopedAccessCopy(copy = "", origin = "") {
  const text = String(copy || "");
  const base = String(origin || "").replace(/\/+$/, "");
  if (!base) return text;
  const legacyOriginPattern = new RegExp(["https?:\\/\\/(?:www\\.|api\\.)?", "123", "vips\\.com"].join(""), "gi");
  return text
    .replace(legacyOriginPattern, base)
    .replace(/\b(POST|GET|PUT|PATCH|DELETE)\s+(\/api\/[^\s]+)/gi, (_match, method, pathname) => {
      return `${String(method).toUpperCase()} ${scopedApiUrl(base, pathname)}`;
    })
    .replace(/(^|[\s(["'`])((?:\/api\/)[^\s"'`),.]+)/g, (_match, prefix, pathname) => {
      return `${prefix}${scopedApiUrl(base, pathname)}`;
    });
}

function pricingNumber(value, fallback = 0, min = 0, digits = 4) {
  const scale = 10 ** Math.max(0, Math.min(8, Math.floor(Number(digits) || 4)));
  const next = Number(value);
  if (!Number.isFinite(next) || next < min) return Math.max(min, Math.round(Number(fallback || 0) * scale) / scale);
  return Math.round(next * scale) / scale;
}

function normalizeAdvancedPricing(pricing = {}) {
  const source = pricing && typeof pricing === "object" && !Array.isArray(pricing) ? pricing : {};
  const seedance = source.seedanceCreditsPerSecondByResolution && typeof source.seedanceCreditsPerSecondByResolution === "object"
    ? source.seedanceCreditsPerSecondByResolution
    : {};
  const seedanceVideoInput = source.seedanceVideoInputCreditsPerSecondByResolution && typeof source.seedanceVideoInputCreditsPerSecondByResolution === "object"
    ? source.seedanceVideoInputCreditsPerSecondByResolution
    : {};
  const wan27 = source.wan27CreditsPerSecondByResolution && typeof source.wan27CreditsPerSecondByResolution === "object"
    ? source.wan27CreditsPerSecondByResolution
    : {};
  const rawWan27ImageSource = source.wan27ImagePro && typeof source.wan27ImagePro === "object" && !Array.isArray(source.wan27ImagePro)
    ? source.wan27ImagePro
    : {};
  const wan27ImageSource = { ...rawWan27ImageSource };
  if (Number(wan27ImageSource.saleCnyPerImage) === 0.8432 && !rawWan27ImageSource.userConfigured) {
    wan27ImageSource.saleCnyPerImage = WAN27_IMAGE_PRO_SALE_CNY;
  }
  if (Number(wan27ImageSource.purchaseCnyPerImage) === 0.5621 && !rawWan27ImageSource.userConfigured) {
    wan27ImageSource.purchaseCnyPerImage = WAN27_IMAGE_PRO_PURCHASE_CNY;
  }
  const wan27ImageDefault = DEFAULT_ADVANCED_PRICING.wan27ImagePro || {};
  return {
    unit: "credits",
    creditsPerCny: pricingNumber(source.creditsPerCny, DEFAULT_ADVANCED_PRICING.creditsPerCny, 0.0001),
    seedanceCreditsPerSecondByResolution: {
      "480p": pricingNumber(seedance["480p"], DEFAULT_ADVANCED_PRICING.seedanceCreditsPerSecondByResolution["480p"]),
      "720p": pricingNumber(seedance["720p"], DEFAULT_ADVANCED_PRICING.seedanceCreditsPerSecondByResolution["720p"]),
      "1080p": pricingNumber(seedance["1080p"], DEFAULT_ADVANCED_PRICING.seedanceCreditsPerSecondByResolution["1080p"]),
    },
    seedanceVideoInputCreditsPerSecondByResolution: {
      "480p": pricingNumber(seedanceVideoInput["480p"], DEFAULT_ADVANCED_PRICING.seedanceVideoInputCreditsPerSecondByResolution["480p"]),
      "720p": pricingNumber(seedanceVideoInput["720p"], DEFAULT_ADVANCED_PRICING.seedanceVideoInputCreditsPerSecondByResolution["720p"]),
      "1080p": pricingNumber(seedanceVideoInput["1080p"], DEFAULT_ADVANCED_PRICING.seedanceVideoInputCreditsPerSecondByResolution["1080p"]),
    },
    wan27CreditsPerSecondByResolution: {
      "720p": pricingNumber(wan27["720p"], DEFAULT_ADVANCED_PRICING.wan27CreditsPerSecondByResolution["720p"]),
      "1080p": pricingNumber(wan27["1080p"], DEFAULT_ADVANCED_PRICING.wan27CreditsPerSecondByResolution["1080p"]),
    },
    wan27ImagePro: {
      ...wan27ImageDefault,
      ...wan27ImageSource,
      model: String(wan27ImageSource.model || wan27ImageDefault.model || WAN27_IMAGE_PRO_MODEL),
      purchaseCnyPerImage: pricingNumber(wan27ImageSource.purchaseCnyPerImage, wan27ImageDefault.purchaseCnyPerImage ?? WAN27_IMAGE_PRO_PURCHASE_CNY, 0, 6),
      saleCnyPerImage: pricingNumber(wan27ImageSource.saleCnyPerImage, wan27ImageDefault.saleCnyPerImage ?? WAN27_IMAGE_PRO_SALE_CNY, 0, 6),
      resolutions: Array.isArray(wan27ImageSource.resolutions) && wan27ImageSource.resolutions.length ? wan27ImageSource.resolutions : wan27ImageDefault.resolutions,
      ratios: Array.isArray(wan27ImageSource.ratios) && wan27ImageSource.ratios.length ? wan27ImageSource.ratios : wan27ImageDefault.ratios,
      defaultResolution: String(wan27ImageSource.defaultResolution || wan27ImageDefault.defaultResolution || "2K"),
      defaultRatio: String(wan27ImageSource.defaultRatio || wan27ImageDefault.defaultRatio || "9:16"),
    },
  };
}

function publicConfig(config, origin = "") {
  const homeVideo = normalizeHomeVideo(config.homeVideo || {});
  const platform = normalizePlatformConfig(config.platform || {});
  const tenantPublic = isTenantPublicOrigin(origin);
  const walletOptions = publicWalletOptions(config.wallet || {}, { tenantPublic });
  const publicWalletDefault = walletOptions[0] || {};
  const publicPlatform = {
    ...platform,
    accessCopy: tenantScopedAccessCopy(platform.accessCopy, origin),
  };
  if (tenantPublic) {
    publicPlatform.advanced = {
      ...publicPlatform.advanced,
      cases: (publicPlatform.advanced?.cases || []).map((item) => {
        const { creditsPerSecond, pricing, ...safeItem } = item;
        return safeItem;
      }),
    };
  }
  publicPlatform.advancedPricing = normalizeAdvancedPricing(publicPlatform.advancedPricing);
  const assetImageModifyPricing = publicPlatform.advancedPricing.wan27ImagePro || DEFAULT_ADVANCED_PRICING.wan27ImagePro;
  return {
    defaultCompanionId: config.defaultCompanionId,
    prices: config.prices,
    tenantFeatures: {
      tenantPublic,
      assetLibrary: !tenantPublic,
      accountMenu: true,
    },
    assetImageModify: {
      model: assetImageModifyPricing.model || WAN27_IMAGE_PRO_MODEL,
      costCredits: pricingNumber(Number(assetImageModifyPricing.saleCnyPerImage || 0) * Number(publicPlatform.advancedPricing.creditsPerCny || ADVANCED_CREDITS_PER_CNY), 0, 0, 6),
      saleCnyPerImage: assetImageModifyPricing.saleCnyPerImage,
      resolutions: assetImageModifyPricing.resolutions || ["1K", "2K"],
      ratios: assetImageModifyPricing.ratios || ["1:1", "3:4", "4:3", "9:16", "16:9"],
      defaultResolution: assetImageModifyPricing.defaultResolution || "2K",
      defaultRatio: assetImageModifyPricing.defaultRatio || "9:16",
    },
    wallet: {
      asset: publicWalletDefault.asset || config.wallet.asset,
      network: publicWalletDefault.network || config.wallet.network,
      address: publicWalletDefault.address || config.wallet.address,
      qrUrl: publicWalletDefault.qrUrl || config.wallet.qrUrl || "",
      explorerUrl: publicWalletDefault.explorerUrl || config.wallet.explorerUrl || "",
      options: walletOptions,
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
    platform: publicPlatform,
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
  const action = String(template.action || "").trim().toLowerCase();
  const targetTab = String(template.targetTab || template.openTab || "").trim().toLowerCase();
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
    hoverPreviewUrl: String(template.hoverPreviewUrl || "").trim(),
    model: resolvePlatformModelId(template.model, safeType),
    badge: String(template.badge || "").trim().slice(0, 40),
    prompt: promptText,
    negativePrompt: typeof template.negativePrompt === "string" ? template.negativePrompt : "",
    price: positiveCreditsOrNull(template.price ?? template.credits ?? template.estimatedCredits),
    params: legacyParams,
    requestJson,
    action: action === "advanced" ? "advanced" : "",
    targetTab: targetTab === "advanced" ? "advanced" : "",
    advancedCaseId: String(template.advancedCaseId || template.caseId || "").trim(),
    buttonLabel: String(template.buttonLabel || "").trim().slice(0, 40),
    enabled: template.enabled !== false,
    sort: Number.isFinite(Number(template.sort)) ? Number(template.sort) : index,
  };
}

function normalizeAdvancedCaseCategory(value = "") {
  const raw = String(value || "").trim().toLowerCase();
  if (raw.includes("extend")) return "extend";
  if (raw.includes("replace")) return "replace";
  if (raw === "hot" || raw.includes("popular")) return "hot";
  return "hot";
}

function normalizeAdvancedCase(item = {}, index = 0, advancedPricing = DEFAULT_ADVANCED_PRICING) {
  const fallbackId = `advanced-case-${index + 1}`;
  const params = item.params && typeof item.params === "object" && !Array.isArray(item.params) ? item.params : {};
  const provider = normalizeAdvancedProvider(item.provider || params.provider || params.modelProvider || params.model_provider);
  const bounds = advancedDurationBounds(provider);
  const duration = clampNumber(item.duration ?? params.duration, bounds.fallback, bounds.min, bounds.max);
  const pricing = advancedModelPricing(provider, {
    duration,
    resolution: item.resolution || params.resolution,
    ratio: item.ratio || params.ratio || params.aspect_ratio,
    advancedPricing,
  });
  const estimatedCredits = pricing.credits;
  const mediaMode = provider === "wan27" ? normalizeWan27MediaMode(item.mediaMode || params.mediaMode) : "";
  return {
    id: String(item.id || fallbackId).trim().replace(/[^a-z0-9_-]/gi, "-").slice(0, 64) || fallbackId,
    title: String(item.title || "Advanced case").trim().slice(0, 80) || "Advanced case",
    category: normalizeAdvancedCaseCategory(item.category || item.caseCategory || item.tab),
    provider,
    price: estimatedCredits,
    creditsPerSecond: pricing.creditsPerSecond,
    estimatedCredits,
    pricing,
    coverUrl: String(item.coverUrl || "").trim(),
    previewUrl: String(item.previewUrl || "").trim(),
    hoverPreviewUrl: String(item.hoverPreviewUrl || "").trim(),
    outputPosterUrl: String(item.outputPosterUrl || "").trim(),
    resultPosterUrl: String(item.resultPosterUrl || item.outputPosterUrl || "").trim(),
    inputImageUrl: String(item.inputImageUrl || item.sourceImageUrl || item.referenceImageUrl || item.imageUrl || "").trim(),
    inputVideoUrl: String(item.inputVideoUrl || "").trim(),
    inputVideoPosterUrl: String(item.inputVideoPosterUrl || "").trim(),
    sourceImageUrl: String(item.sourceImageUrl || item.inputImageUrl || "").trim(),
    sourceVideoUrl: String(item.sourceVideoUrl || "").trim(),
    sourceCoverUrl: String(item.sourceCoverUrl || "").trim(),
    mediaSourceVideoUrl: String(item.mediaSourceVideoUrl || item.sourceVideoUrl || "").trim(),
    mediaSourceCoverUrl: String(item.mediaSourceCoverUrl || item.sourceCoverUrl || "").trim(),
    localVideoUrl: String(item.localVideoUrl || "").trim(),
    localCoverUrl: String(item.localCoverUrl || "").trim(),
    cdnVideoUrl: String(item.cdnVideoUrl || "").trim(),
    cdnCoverUrl: String(item.cdnCoverUrl || "").trim(),
    description: String(item.description || "").trim().slice(0, 240),
    prompt: String(item.prompt || params.prompt || "").trim(),
    params: provider === "wan27" ? { ...params, mediaMode } : params,
    mediaMode,
    enabled: item.enabled !== false,
    sort: Number.isFinite(Number(item.sort)) ? Number(item.sort) : index,
  };
}

function normalizePlatformAdvancedConfig(advanced = {}, advancedPricing = DEFAULT_ADVANCED_PRICING) {
  const fallback = DEFAULT_CONFIG.platform?.advanced || {};
  const cases = Array.isArray(advanced.cases) ? advanced.cases : fallback.cases || [];
  return {
    ...fallback,
    ...advanced,
    telegram: String(advanced.telegram || fallback.telegram || "").trim(),
    cases: cases
      .map((item, index) => normalizeAdvancedCase(item, index, advancedPricing))
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
  if (/^ep-\d+-[a-z0-9]+$/i.test(raw)) {
    return "ark/seedance-2.0";
  }
  if (compact.startsWith("dreaminaseedance2.0")) {
    return "st-ai/pippit-seed2";
  }
  if (["seedance20fast", "seedance2.0fast", "seedance20fastvip", "seedance2.0fastvip", "seedance20vip", "seedance2.0vip", "seedance20", "seedance2.0", "superseed2"].includes(compact)) {
    return "st-ai/super-seed2";
  }
  if (["seedance20direct", "seedance2.0direct", "seedance20fastdirect", "seedance20lite", "seedance2.0fastdirect", "seedance2.0lite", "superseed2lite"].includes(compact)) {
    return "st-ai/super-seed2-lite";
  }
  if (raw && raw !== "seedance") return raw;
  return type === "text-to-video"
    ? "bytedance/seedance-2.0/fast/text-to-video"
    : "bytedance/seedance-2.0/fast/image-to-video";
}

function resolvePlatformRequestModel(model, platformModel, type = "image-to-video") {
  const raw = String(model || "").trim();
  const compact = raw.toLowerCase().replace(/[\s_-]+/g, "");
  const resolvedPlatformModel = resolvePlatformModelId(platformModel || raw, type);

  if (resolvedPlatformModel === "ark/seedance-2.0") {
    if (/^ep-\d+-[a-z0-9]+$/i.test(raw)) return raw;
    if (compact.includes("fast")) return MODEL_FAST;
    return MODEL_QUALITY;
  }
  if (resolvedPlatformModel === "st-ai/super-seed2") {
    return compact.includes("fast") ? "seedance_2.0_fast" : "seedance_2.0";
  }
  if (resolvedPlatformModel === "st-ai/super-seed2-lite") {
    return compact.includes("fast") ? "seedance2.0_fast_direct" : "seedance2.0_direct";
  }
  if (resolvedPlatformModel === "st-ai/pippit-seed2") {
    return "dreamina_seedance_2.0";
  }

  return raw || resolvedPlatformModel;
}

function isHiddenPlatformCategory(category = {}) {
  const value = `${category.id || ""} ${category.name || ""}`.toLowerCase();
  return value.includes("business") || value.includes("商业接入");
}

function normalizePlatformConfig(platform = {}) {
  const fallback = DEFAULT_CONFIG.platform || {};
  const categories = Array.isArray(platform.categories) ? platform.categories : fallback.categories || [];
  const templates = Array.isArray(platform.templates) ? platform.templates : fallback.templates || [];
  const advancedPricing = normalizeAdvancedPricing(platform.advancedPricing || fallback.advancedPricing || DEFAULT_ADVANCED_PRICING);
  return {
    ...fallback,
    ...platform,
    brand: String(platform.brand || fallback.brand || "Vipeak AI"),
    heroTitle: cleanPlatformHeroCopy(platform.heroTitle, fallback.heroTitle || "Create AI videos"),
    heroSubtitle: cleanPlatformHeroCopy(platform.heroSubtitle, fallback.heroSubtitle || ""),
    notice: cleanPlatformHeroCopy(platform.notice, fallback.notice || ""),
    accessCopy: cleanPlatformPublicCopy(platform.accessCopy, fallback.accessCopy || ""),
    advancedPricing,
    advanced: normalizePlatformAdvancedConfig(platform.advanced || fallback.advanced || {}, advancedPricing),
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
    posterUrl: item.posterUrl || item.localImageUrl || item.syntheticReferenceLocalUrl || item.sourceImageUrl || item.publicImageUrl || item.coverUrl || "",
    localImageUrl: item.localImageUrl || item.posterUrl || "",
    syntheticReferenceLocalUrl: item.syntheticReferenceLocalUrl || "",
    sourceImageUrl: item.sourceImageUrl || "",
    publicImageUrl: item.publicImageUrl || "",
    coverUrl: item.coverUrl || "",
    videoUrl: item.videoUrl || item.localVideoUrl || item.remoteVideoUrl || "",
    localVideoUrl: item.localVideoUrl || item.videoUrl || "",
    remoteVideoUrl: item.remoteVideoUrl || "",
    taskId: item.taskId || "",
    status: item.status || "",
    provider: item.provider || "",
    resolution: item.resolution || "",
    duration: item.duration || 0,
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
    videoUrl: "",
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
    apiToken: String(user.apiToken || ""),
    pricingMultiplier: normalizeUserPricingMultiplier(user),
    advancedAccess: user.advancedAccess === true,
    advancedAccessLevel: user.advancedAccess === true ? "advanced" : "platform",
    advancedAccessRequestedAt: user.advancedAccessRequestedAt || "",
    createdAt: user.createdAt,
  };
}

function apiSubtokenView(record = {}, { includeToken = false } = {}) {
  const normalized = typeof record === "object" && record && record.id ? record : null;
  if (!normalized) return null;
  const quotaType = String(record.quotaType || "").trim().toLowerCase() === "count" ? "count" : "amount";
  const quotaLimit = roundCredits(record.quotaLimit || 0, 6);
  const usedAmount = roundCredits(record.usedAmount || 0, 6);
  const usedCount = Math.max(0, Math.round(Number(record.usedCount || 0) || 0));
  const remaining = quotaType === "count"
    ? Math.max(0, roundCredits(quotaLimit - usedCount, 6))
    : Math.max(0, roundCredits(quotaLimit - usedAmount, 6));
  return {
    id: String(record.id || ""),
    token: includeToken ? String(record.token || "") : "",
    tokenPreview: String(record.tokenPreview || ""),
    parentUserId: String(record.parentUserId || ""),
    name: String(record.name || ""),
    quotaType,
    quotaLimit,
    usedAmount,
    usedCount,
    remaining,
    expiresAt: String(record.expiresAt || ""),
    revokedAt: String(record.revokedAt || ""),
    lastUsedAt: String(record.lastUsedAt || ""),
    createdAt: String(record.createdAt || ""),
    updatedAt: String(record.updatedAt || ""),
    status: String(record.status || ""),
    active: record.active === true,
  };
}

function creditsAmount(value, fallback = 0) {
  const next = Number(value);
  if (!Number.isFinite(next)) return Math.max(0, Math.round(Number(fallback || 0) * 10000) / 10000);
  return Math.max(0, Math.round(next * 10000) / 10000);
}

function roundCredits(value, digits = 6) {
  const next = Number(value);
  if (!Number.isFinite(next)) return 0;
  const scale = 10 ** Math.max(0, Math.min(8, Math.floor(Number(digits) || 6)));
  return Math.round(next * scale) / scale;
}

function normalizeUserPricingMultiplier(userOrValue = 1) {
  const raw = userOrValue && typeof userOrValue === "object"
    ? (userOrValue.pricingMultiplier ?? userOrValue.priceMultiplier ?? userOrValue.discountMultiplier ?? userOrValue.discount)
    : userOrValue;
  const next = Number(raw);
  if (!Number.isFinite(next) || next <= 0) return 1;
  return Math.round(Math.max(0.01, Math.min(100, next)) * 10000) / 10000;
}

function applyUserPricingMultiplierToCredits(credits, userOrValue = 1) {
  const multiplier = normalizeUserPricingMultiplier(userOrValue);
  return creditsAmount(Number(credits || 0) * multiplier);
}

function pricingMultiplierView(userOrValue = 1) {
  return {
    multiplier: normalizeUserPricingMultiplier(userOrValue),
  };
}

function applyUserPricingToEstimate(estimate = {}, userOrValue = 1) {
  const multiplier = normalizeUserPricingMultiplier(userOrValue);
  const originalCredits = creditsAmount(estimate.credits || 0);
  const originalBaseCredits = estimate.baseCredits === undefined || estimate.baseCredits === null
    ? originalCredits
    : creditsAmount(estimate.baseCredits || 0);
  return {
    ...estimate,
    credits: applyUserPricingMultiplierToCredits(originalCredits, multiplier),
    baseCredits: originalBaseCredits,
    originalCredits,
    userPricingMultiplier: multiplier,
    pricingMultiplier: multiplier,
  };
}

function sellingCredits(value) {
  return creditsAmount(Number(value || 0) * GENERATION_PRICE_MARKUP);
}

function costBreakdown(baseCredits, source = "") {
  const base = creditsAmount(baseCredits);
  const credits = sellingCredits(base);
  return {
    credits,
    baseCredits: base,
    markup: GENERATION_PRICE_MARKUP,
    source,
  };
}

function fixedCreditsBreakdown(credits, source = "") {
  const amount = creditsAmount(credits);
  return {
    credits: amount,
    baseCredits: amount,
    markup: 1,
    source,
  };
}

function fixedCnyPricingEstimate(cny, source = "", details = {}, creditsPerCny = ADVANCED_CREDITS_PER_CNY) {
  const baseCredits = creditsAmount(Number(cny || 0) * Number(creditsPerCny || ADVANCED_CREDITS_PER_CNY));
  return {
    ...fixedCreditsBreakdown(baseCredits, source ? `${source}_sale_price` : "fixed_sale_price"),
    baseCredits,
    originalCredits: baseCredits,
    userPricingMultiplier: 1,
    pricingMultiplier: 1,
    ...details,
  };
}

function normalizeAdvancedProvider(value = "") {
  const normalized = String(value || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (!normalized) return "wan27";
  if (["wan27", "wan2.7", "wan"].includes(normalized) || normalized.includes("wan27") || normalized.includes("wan2.7")) return "wan27";
  return "seedance";
}

function normalizeSeedanceTier(value = "") {
  return String(value || "").trim().toLowerCase() === "fast" ? "fast" : "standard";
}

function normalizeAdvancedResolution(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "480p") return "480p";
  return normalized === "1080p" ? "1080p" : "720p";
}

function normalizeVideoRatio(value = "") {
  const normalized = String(value || "").trim().replace(/[：xX]/g, ":");
  if (/^\d+\s*:\s*\d+$/.test(normalized)) {
    const [width, height] = normalized.split(":").map((part) => Math.max(1, Number(part.trim()) || 1));
    return `${width}:${height}`;
  }
  return "16:9";
}

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function firstPresent(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function boolFromRequest(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function requestParamsFromBody(body = {}) {
  return plainObject(body.params);
}

function mergedRequestForMedia(body = {}, caseParams = {}) {
  return {
    ...caseParams,
    ...requestParamsFromBody(body),
    ...body,
  };
}

function pickRequestFields(source = {}, fields = []) {
  const picked = {};
  fields.forEach((field) => {
    if (source[field] !== undefined && source[field] !== null && source[field] !== "") picked[field] = source[field];
  });
  return picked;
}

function copyIfPresent(target = {}, source = {}, fromKey = "", toKey = fromKey) {
  if (source[fromKey] !== undefined && source[fromKey] !== null && source[fromKey] !== "") target[toKey] = source[fromKey];
}

function nestedMediaUrl(value) {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const key of ["url", "uri", "assetUri", "imageUrl", "videoUrl", "audioUrl", "image_url", "video_url", "audio_url"]) {
      const found = nestedMediaUrl(value[key]);
      if (found) return found;
    }
  }
  return "";
}

function normalizeSeedanceContentItem(item = {}) {
  if (typeof item === "string") return { type: "text", text: item };
  if (!item || typeof item !== "object" || Array.isArray(item)) return item;
  const type = String(item.type || (item.text !== undefined ? "text" : "")).trim();
  if (type === "text") return { ...item, type, text: String(item.text || "") };
  if (type === "image_url") {
    const url = nestedMediaUrl(item.image_url) || nestedMediaUrl(item.imageUrl) || nestedMediaUrl(item.url) || nestedMediaUrl(item);
    const imageUrl = item.image_url && typeof item.image_url === "object" && !Array.isArray(item.image_url)
      ? { ...item.image_url, url }
      : { url };
    return { ...item, image_url: imageUrl, imageUrl: undefined, url: undefined };
  }
  if (type === "video_url") {
    const url = nestedMediaUrl(item.video_url) || nestedMediaUrl(item.videoUrl) || nestedMediaUrl(item.url) || nestedMediaUrl(item);
    const source = item.video_url && typeof item.video_url === "object" && !Array.isArray(item.video_url)
      ? item.video_url
      : {};
    const videoUrl = { ...source, url };
    const duration = firstPresent(item.durationSeconds, item.duration, source.durationSeconds, source.duration);
    if (duration !== undefined) videoUrl.durationSeconds = duration;
    return { ...item, video_url: videoUrl, videoUrl: undefined, url: undefined };
  }
  if (type === "audio_url") {
    const url = nestedMediaUrl(item.audio_url) || nestedMediaUrl(item.audioUrl) || nestedMediaUrl(item.url) || nestedMediaUrl(item);
    const audioUrl = item.audio_url && typeof item.audio_url === "object" && !Array.isArray(item.audio_url)
      ? { ...item.audio_url, url }
      : { url };
    return { ...item, audio_url: audioUrl, audioUrl: undefined, url: undefined };
  }
  return item;
}

function pushSeedanceContentMedia(content = [], type = "image_url", url = "", role = "", extras = {}) {
  const value = String(url || "").trim();
  if (!value) return;
  const exists = content.some((item) => {
    if (!item || item.type !== type) return false;
    const key = type === "video_url" ? "video_url" : type === "audio_url" ? "audio_url" : "image_url";
    return nestedMediaUrl(item[key]) === value && String(item.role || "") === String(role || "");
  });
  if (exists) return;
  const key = type === "video_url" ? "video_url" : type === "audio_url" ? "audio_url" : "image_url";
  const media = { url: value };
  if (extras.durationSeconds !== undefined) media.durationSeconds = extras.durationSeconds;
  content.push({ type, [key]: media, ...(role ? { role } : {}) });
}

function stripSeedanceCompatibilityAliases(payload = {}) {
  [
    "prompt",
    "params",
    "image_url",
    "end_image_url",
    "reference_images",
    "reference_videos",
    "reference_audios",
    "imageUrl",
    "firstFrameUrl",
    "first_frame_url",
    "lastFrameUrl",
    "last_frame_url",
    "endImageUrl",
    "referenceImages",
    "referenceVideos",
    "referenceAudios",
    "generateAudio",
    "webSearch",
    "durationSeconds",
    "aspect_ratio",
  ].forEach((key) => {
    delete payload[key];
  });
  return payload;
}

function normalizeWan27ImageRatio(value = "") {
  const ratio = normalizeVideoRatio(value);
  return new Set(["1:1", "3:4", "4:3", "9:16", "16:9"]).has(ratio) ? ratio : "9:16";
}

function normalizeWan27ImageResolution(value = "") {
  const normalized = String(value || "").trim().toUpperCase();
  return normalized === "1K" ? "1K" : "2K";
}

function wan27ImageSize(resolution = "2K", ratio = "9:16") {
  const tier = normalizeWan27ImageResolution(resolution);
  const normalizedRatio = normalizeWan27ImageRatio(ratio);
  const sizes = {
    "1K": {
      "1:1": "1024*1024",
      "3:4": "768*1024",
      "4:3": "1024*768",
      "9:16": "720*1280",
      "16:9": "1280*720",
    },
    "2K": {
      "1:1": "2048*2048",
      "3:4": "1536*2048",
      "4:3": "2048*1536",
      "9:16": "1440*2560",
      "16:9": "2560*1440",
    },
  };
  return sizes[tier]?.[normalizedRatio] || tier;
}

function videoPixelDimensions(resolution = "720p", ratio = "16:9") {
  const shortSide = normalizeAdvancedResolution(resolution) === "1080p" ? 1080 : 720;
  const [ratioW, ratioH] = normalizeVideoRatio(ratio).split(":").map((part) => Math.max(1, Number(part) || 1));
  if (ratioW >= ratioH) {
    return {
      width: Math.max(1, Math.round((shortSide * ratioW) / ratioH)),
      height: shortSide,
    };
  }
  const width = shortSide;
  const height = Math.max(1, Math.round((shortSide * ratioH) / ratioW));
  return { width, height };
}

function seedanceTokenPricing(options = {}) {
  const resolution = normalizeAdvancedResolution(options.resolution);
  const ratio = normalizeVideoRatio(options.ratio || options.aspect_ratio || "16:9");
  const duration = clampNumber(options.duration ?? options.durationSeconds, advancedDurationBounds("seedance").fallback, advancedDurationBounds("seedance").min, advancedDurationBounds("seedance").max);
  const fps = clampNumber(options.fps || ADVANCED_SEEDANCE_FPS, ADVANCED_SEEDANCE_FPS, 1, 120);
  const { width, height } = videoPixelDimensions(resolution, ratio);
  const outputTokens = Math.ceil((duration * width * height * fps) / 1024);
  const yuanPerMillionTokens = resolution === "1080p"
    ? ADVANCED_SEEDANCE_1080P_CNY_PER_MILLION_TOKENS
    : ADVANCED_SEEDANCE_720P_CNY_PER_MILLION_TOKENS;
  const baseCredits = creditsAmount((outputTokens * yuanPerMillionTokens * 100) / 1000000);
  return {
    resolution,
    ratio,
    duration,
    fps,
    width,
    height,
    outputTokens,
    yuanPerMillionTokens,
    baseCredits,
  };
}

function advancedDurationBounds(provider = "seedance") {
  return normalizeAdvancedProvider(provider) === "wan27"
    ? { fallback: 5, min: 2, max: 15 }
    : { fallback: 5, min: 5, max: 15 };
}

function advancedModelPricing(provider = "seedance", options = {}) {
  const normalizedProvider = normalizeAdvancedProvider(provider);
  const bounds = advancedDurationBounds(normalizedProvider);
  const minDuration = normalizedProvider === "seedance" && options.allowFourSecondSeedance === true ? 4 : bounds.min;
  const duration = clampNumber(options.duration ?? options.durationSeconds, bounds.fallback, minDuration, bounds.max);
  const advancedPricing = normalizeAdvancedPricing(options.advancedPricing || options.pricing || DEFAULT_ADVANCED_PRICING);
  const priceTable = normalizedProvider === "wan27"
    ? advancedPricing.wan27CreditsPerSecondByResolution
    : advancedPricing.seedanceCreditsPerSecondByResolution;
  if (normalizedProvider === "wan27") {
    const resolution = normalizeWan27Resolution(options.resolution);
    const publicResolution = normalizeAdvancedResolution(resolution);
    const creditsPerSecond = priceTable[publicResolution] || DEFAULT_ADVANCED_PRICING.wan27CreditsPerSecondByResolution["720p"];
    const credits = creditsAmount(duration * creditsPerSecond);
    return {
      provider: "wan27",
      providerLabel: "Wan2.7",
      model: options.model || ALIYUN_WAN27_MODEL,
      duration,
      resolution,
      publicResolution,
      creditsPerSecond,
      baseCredits: credits,
      credits,
      markup: 1,
      source: "public_duration_rate",
    };
  }
  const resolution = normalizeAdvancedResolution(options.resolution);
  const ratio = normalizeVideoRatio(options.ratio || options.aspect_ratio || "16:9");
  const seedanceTier = normalizeSeedanceTier(options.seedanceTier);
  const tierDiscount = seedanceTier === "fast" ? ADVANCED_SEEDANCE_FAST_DISCOUNT : 1;
  const creditsPerSecond = priceTable[resolution] || DEFAULT_ADVANCED_PRICING.seedanceCreditsPerSecondByResolution["720p"];
  const videoInputSeconds = durationSecondsFromValue(firstPresent(
    options.videoInputSeconds,
    options.inputVideoSeconds,
    options.referenceVideoDurationSeconds,
    options.referenceVideoSeconds,
  ));
  const videoInputTable = advancedPricing.seedanceVideoInputCreditsPerSecondByResolution || {};
  const videoInputCreditsPerSecond = videoInputTable[resolution] || DEFAULT_ADVANCED_PRICING.seedanceVideoInputCreditsPerSecondByResolution["720p"];
  const outputCredits = creditsAmount(duration * creditsPerSecond * tierDiscount);
  const videoInputCredits = creditsAmount(videoInputSeconds * videoInputCreditsPerSecond * tierDiscount);
  const credits = creditsAmount(outputCredits + videoInputCredits);
  return {
    provider: "seedance",
    providerLabel: "Seedance",
    model: options.model || (seedanceTier === "fast" ? MODEL_FAST : MODEL_QUALITY),
    seedanceTier,
    tierDiscount,
    duration,
    ratio,
    resolution,
    creditsPerSecond,
    outputCredits,
    videoInputSeconds,
    videoInputCreditsPerSecond,
    videoInputCredits,
    hasVideoInput: videoInputSeconds > 0,
    baseCredits: credits,
    credits,
    markup: 1,
    source: "public_duration_rate",
  };
}

function advancedGenerationCost(durationSeconds = 5, provider = "seedance", options = {}) {
  return advancedModelPricing(provider, { ...options, duration: durationSeconds }).credits;
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

function stableLedgerId(type = "", meta = {}) {
  const cleanType = String(type || "ledger").trim() || "ledger";
  const stableKey = String(
    meta?.orderId ||
    meta?.taskId ||
    meta?.unlockId ||
    meta?.transactionHash ||
    meta?.paypalOrderId ||
    "",
  ).trim();
  if (!stableKey) return randomId("ledger");
  const digest = crypto.createHash("sha256").update(`${cleanType}:${stableKey}`).digest("hex").slice(0, 24);
  return `ledger-${digest}`;
}

async function appendCreditLedger(db, user, delta, type, meta = {}) {
  if (!db || !user) return null;
  const amount = Math.round(Number(delta || 0) * 10000) / 10000;
  if (!Number.isFinite(amount) || amount === 0) return null;
  db.creditLedger = Array.isArray(db.creditLedger) ? db.creditLedger : [];
  const normalizedMeta = attachAuthContextToMeta(meta);
  const record = {
    id: stableLedgerId(type, normalizedMeta),
    userId: user.id,
    username: user.username || "",
    delta: amount,
    balanceAfter: creditsAmount(user.credits),
    type,
    meta: normalizedMeta,
    createdAt: new Date().toISOString(),
  };
  if (dbEnabled()) {
    const applied = await applyCreditDeltaInDb({
      id: record.id,
      userId: user.id,
      delta: amount,
      type,
      meta: normalizedMeta,
      payload: record,
    });
    if (applied?.user) {
      Object.assign(user, applied.user);
      record.balanceAfter = creditsAmount(applied.user.credits);
    }
    if (applied?.ledger) Object.assign(record, applied.ledger);
  }
  db.creditLedger.unshift(record);
  db.creditLedger = db.creditLedger.slice(0, 1000);
  return record;
}

function currentAuthContext() {
  return requestContext.getStore()?.auth || null;
}

function tokenContextFromRecord(record = {}) {
  if (!record?.apiTokenId) return null;
  return {
    id: String(record.apiTokenId || ""),
    name: String(record.apiTokenName || ""),
    quotaType: String(record.apiTokenType || "") === "count" ? "count" : "amount",
    parentUserId: String(record.userId || ""),
  };
}

function attachAuthContextToMeta(meta = {}, auth = currentAuthContext()) {
  if (!auth?.tokenRecord?.id) return meta;
  return {
    ...meta,
    apiTokenId: auth.tokenRecord.id,
    apiTokenName: auth.tokenRecord.name || "",
    apiTokenType: auth.tokenRecord.quotaType || "",
    apiTokenSource: auth.tokenSource || "subtoken",
  };
}

function subtokenCostAmount(cost = 0) {
  return roundCredits(cost, 6);
}

function subtokenUsageEventKey(prefix = "spend", taskId = "", type = "") {
  const base = String(taskId || "").trim() || randomId("usage");
  return `${prefix}:${String(type || "credits").trim()}:${base}`;
}

function subtokenFailurePayload(cost = 0, remaining = 0, extra = {}) {
  return {
    ok: false,
    code: "SUBTOKEN_QUOTA_EXCEEDED",
    message: `Sub token quota is not enough. This request needs ${formatServerCredits(cost)}; remaining ${formatServerCredits(remaining)}.`,
    cost: roundCredits(cost, 6),
    remaining: roundCredits(remaining, 6),
    ...extra,
  };
}

function upstreamResourceMissing(error = {}) {
  return /resource .*not found|is not found|not found/i.test(String(error?.message || error || ""));
}

function formatServerCredits(value) {
  const next = roundCredits(value, 6);
  return Number.isInteger(next) ? String(next) : next.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}

function assertSubtokenCanSpend(auth, cost = 0) {
  const amount = subtokenCostAmount(cost);
  if (!auth?.tokenRecord?.id || amount <= 0) return;
  const token = auth.tokenRecord;
  if (!token.active) {
    const error = new Error(token.status === "expired" ? "Sub token expired." : "Sub token revoked.");
    error.statusCode = 401;
    error.code = token.status === "expired" ? "SUBTOKEN_EXPIRED" : "SUBTOKEN_REVOKED";
    throw error;
  }
  if (token.quotaType === "amount" && amount - Number(token.remaining || 0) > 0.000001) {
    const error = new Error("Sub token quota is not enough.");
    error.statusCode = 402;
    error.code = "SUBTOKEN_QUOTA_EXCEEDED";
    error.payload = subtokenFailurePayload(amount, token.remaining, { quotaType: token.quotaType });
    throw error;
  }
  if (token.quotaType === "count" && Number(token.remaining || 0) < 1) {
    const error = new Error("Sub token count quota is not enough.");
    error.statusCode = 402;
    error.code = "SUBTOKEN_QUOTA_EXCEEDED";
    error.payload = subtokenFailurePayload(1, token.remaining, { quotaType: token.quotaType });
    throw error;
  }
}

async function recordSubtokenSpend(auth, { taskId = "", type = "spend", amount = 0, meta = {} } = {}) {
  if (!auth?.tokenRecord?.id) return null;
  const token = auth.tokenRecord;
  const cost = subtokenCostAmount(amount);
  const deltaAmount = token.quotaType === "amount" ? cost : 0;
  const deltaCount = token.quotaType === "count" ? 1 : 0;
  if (deltaAmount <= 0 && deltaCount <= 0) return null;
  const usage = await recordApiSubtokenUsageInDb({
    tokenId: token.id,
    parentUserId: auth.user?.id || token.parentUserId,
    eventKey: subtokenUsageEventKey("charge", taskId || meta.taskId, type),
    deltaAmount,
    deltaCount,
    meta: {
      ...meta,
      type,
      taskId: taskId || meta.taskId || "",
      amount: cost,
    },
  });
  if (usage?.token) {
    auth.tokenRecord = usage.token;
    const store = requestContext.getStore();
    if (store) store.auth = auth;
  }
  return usage;
}

async function recordSubtokenAdjustment(authOrRecord, { taskId = "", type = "adjust", amount = 0, meta = {} } = {}) {
  const token = authOrRecord?.tokenRecord || (authOrRecord?.apiTokenId ? tokenContextFromRecord(authOrRecord) : authOrRecord);
  if (!token?.id) return null;
  const signedAmount = Number(amount || 0);
  const adjustmentType = String(type || meta.adjustmentType || "").toLowerCase();
  const adjustmentAmount = token.quotaType === "amount" ? subtokenCostAmount(signedAmount) : 0;
  let adjustmentCount = 0;
  if (token.quotaType === "count") {
    if (adjustmentType.includes("refund") && signedAmount < 0) adjustmentCount = -1;
    else if (adjustmentType.includes("refund") && signedAmount > 0) adjustmentCount = 1;
    else adjustmentCount = 0;
  }
  if (adjustmentAmount === 0 && adjustmentCount === 0) return null;
  return await recordApiSubtokenUsageInDb({
    tokenId: token.id,
    parentUserId: token.parentUserId,
    eventKey: subtokenUsageEventKey("adjust", taskId || meta.taskId, type),
    deltaAmount: adjustmentAmount,
    deltaCount: adjustmentCount,
    meta: {
      ...meta,
      type,
      taskId: taskId || meta.taskId || "",
      amount: signedAmount,
    },
  });
}

async function consumeSubtokenForRequest(auth, { taskId = "", cost = 0, type = "spend", meta = {} } = {}) {
  const amount = subtokenCostAmount(cost);
  if (!auth?.tokenRecord?.id || amount <= 0) return;
  assertSubtokenCanSpend(auth, amount);
  await recordSubtokenSpend(auth, { taskId, type, amount, meta });
}

async function chargeUserWithSubtoken(auth, { cost = 0, type = "spend", taskId = "", meta = {} } = {}) {
  const amount = creditsAmount(cost);
  if (amount <= 0) return null;
  await changeUserCredits(auth.db, auth.user.id, -amount, type, meta);
  try {
    await consumeSubtokenForRequest(auth, {
      taskId,
      cost: amount,
      type,
      meta,
    });
  } catch (error) {
    await changeUserCredits(auth.db, auth.user.id, amount, `${type}_subtoken_refund`, {
      ...meta,
      taskId,
      reason: error.message || "Sub token charge failed.",
    });
    throw error;
  }
  return auth.user;
}

async function changeUserCredits(db, userId, delta, type, meta = {}) {
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
  if (dbEnabled()) {
    await appendCreditLedger(db, user, amount, type, meta);
    return user;
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
  await appendCreditLedger(db, user, amount, type, meta);
  return user;
}

function randomId(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

function localGenerationTaskId(prefix = "cgt") {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join("");
  return `${prefix}-${stamp}-${crypto.randomBytes(3).toString("hex")}`;
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

function makeApiToken() {
  return `sk-${crypto.randomBytes(32).toString("hex")}`;
}

function makeUniqueApiToken(db) {
  const existing = new Set((db?.users || []).map((user) => String(user.apiToken || "")).filter(Boolean));
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const token = makeApiToken();
    if (!existing.has(token)) return token;
  }
  return makeApiToken();
}

function makeSubtokenValue() {
  return `sk-${crypto.randomBytes(40).toString("hex")}`;
}

async function makeUniqueSubtokenToken(db, parentUserId = "") {
  const existing = new Set([
    ...(db?.users || []).map((user) => String(user.apiToken || "")).filter(Boolean),
  ]);
  const subtokens = Array.isArray(db?.apiSubtokens) ? db.apiSubtokens : [];
  for (const record of subtokens) {
    const token = String(record?.token || "").trim();
    if (token) existing.add(token);
  }
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const token = makeSubtokenValue();
    if (existing.has(token)) continue;
    const dbMatch = await getApiSubtokenFromDbByToken(token);
    if (!dbMatch) return token;
  }
  return makeSubtokenValue();
}

function ensureUserApiToken(user, db = null) {
  if (!user) return "";
  if (!user.apiToken) {
    user.apiToken = makeUniqueApiToken(db);
    user.updatedAt = new Date().toISOString();
  }
  return user.apiToken;
}

async function ensureAllUsersApiTokens() {
  const db = await readDb();
  let changed = false;
  for (const user of db.users || []) {
    if (!user.apiToken) {
      ensureUserApiToken(user, db);
      if (dbEnabled()) await updateUserInDb(user);
      changed = true;
    }
  }
  if (changed && !dbEnabled()) await writeDb(db);
  return changed;
}

function authUserContext(user = null, token = "", tokenSource = "", tokenRecord = null) {
  return {
    token: String(token || ""),
    tokenSource: String(tokenSource || ""),
    tokenRecord: tokenRecord || null,
    tokenId: String(tokenRecord?.id || ""),
    tokenName: String(tokenRecord?.name || ""),
    tokenType: String(tokenRecord?.quotaType || ""),
    tokenPreview: String(tokenRecord?.tokenPreview || ""),
    isSubtoken: tokenSource === "subtoken",
    isApiToken: tokenSource === "api_token",
    isSession: tokenSource === "session",
    user,
  };
}

function currentIso() {
  return new Date().toISOString();
}

function getBearerToken(req) {
  const auth = req.headers.authorization || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function withJsonBody(req, body = {}) {
  return Object.create(req, {
    [Symbol.asyncIterator]: {
      value: async function* iterator() {
        yield Buffer.from(JSON.stringify(body), "utf8");
      },
    },
  });
}

async function getAuth(req) {
  const token = getBearerToken(req);
  if (!token) return { db: await readDb(), user: null, session: null, token: "", tokenSource: "", tokenRecord: null };
  if (dbEnabled()) {
    const db = await readDb();
    const session = await getSessionByTokenInDb(token);
    if (session) {
      const user = await getUserByIdInDb(session.userId);
      const auth = { db, user, session, ...authUserContext(user, token, "session", null) };
      const store = requestContext.getStore();
      if (store) store.auth = auth;
      return auth;
    }
    const user = db.users.find((item) => item.apiToken === token) || null;
    if (user) {
      const auth = { db, user, session: null, ...authUserContext(user, token, "api_token", null) };
      const store = requestContext.getStore();
      if (store) store.auth = auth;
      return auth;
    }
    const subtoken = await getApiSubtokenFromDbByToken(token);
    if (subtoken) {
      const parent = await getUserByIdInDb(subtoken.parentUserId);
      if (parent) {
        const auth = {
          db,
          user: parent,
          session: null,
          ...authUserContext(parent, token, "subtoken", subtoken),
        };
        const store = requestContext.getStore();
        if (store) store.auth = auth;
        return auth;
      }
    }
    return { db, user: null, session: null, token, tokenSource: "", tokenRecord: null };
  }
  const db = await readDb();
  const session = db.sessions.find((item) => item.token === token);
  if (session) {
    const user = db.users.find((item) => item.id === session.userId) || null;
    const auth = { db, user, session, ...authUserContext(user, token, "session", null) };
    const store = requestContext.getStore();
    if (store) store.auth = auth;
    return auth;
  }
  const user = db.users.find((item) => item.apiToken === token) || null;
  if (user) {
    const auth = { db, user, session: null, ...authUserContext(user, token, "api_token", null) };
    const store = requestContext.getStore();
    if (store) store.auth = auth;
    return auth;
  }
  const subtoken = await getApiSubtokenFromDbByToken(token);
  if (subtoken) {
    const parent = db.users.find((item) => item.id === subtoken.parentUserId) || null;
    if (parent) {
      const auth = {
        db,
        user: parent,
        session: null,
        ...authUserContext(parent, token, "subtoken", subtoken),
      };
      const store = requestContext.getStore();
      if (store) store.auth = auth;
      return auth;
    }
  }
  return { db, user: null, session: null, token, tokenSource: "", tokenRecord: null };
}

async function requireUser(req, res) {
  const auth = await getAuth(req);
  if (!auth.user) {
    sendJson(res, 401, { ok: false, code: "LOGIN_REQUIRED", message: "Please sign in to continue." });
    return null;
  }
  return auth;
}

async function requirePrimaryTokenOwner(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return null;
  if (auth.tokenSource === "subtoken") {
    sendJson(res, 403, {
      ok: false,
      code: "SUBTOKEN_MANAGEMENT_FORBIDDEN",
      message: "Please use the parent account token or session to manage sub tokens.",
    });
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

function normalizeWalletOption(option = {}, index = 0) {
  const id = String(option.id || option.network || `wallet-${index + 1}`)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || `wallet-${index + 1}`;
  return {
    id,
    label: String(option.label || option.network || id).trim(),
    network: String(option.network || option.label || id).trim(),
    asset: String(option.asset || "USDT").trim() || "USDT",
    address: String(option.address || "").trim(),
    qrUrl: String(option.qrUrl || "").trim(),
    explorerUrl: String(option.explorerUrl || option.explorer || "").trim(),
  };
}

function walletOptions(wallet = {}, options = {}) {
  const configured = Array.isArray(wallet.options) ? wallet.options : [];
  let list = configured
    .map((option, index) => normalizeWalletOption(option, index))
    .filter((option) => option.address);
  if (options.tenantPublic) {
    const tenantTron = normalizeWalletOption(CLOUDTOKEN_TRON_WALLET_OPTION, 0);
    const configuredTenantOptions = list.filter((option) => option.address !== OLD_SITE_TRON_WALLET_OPTION.address);
    return configuredTenantOptions.length ? configuredTenantOptions : [tenantTron];
  }
  const oldSiteTron = normalizeWalletOption(OLD_SITE_TRON_WALLET_OPTION, list.length);
  const hasOldSiteTron = list.some((option) => (
    option.id === oldSiteTron.id ||
    option.address === oldSiteTron.address ||
    (normalizeWalletChain(option.network) === "tron" && option.address === oldSiteTron.address)
  ));
  if (oldSiteTron.address && !hasOldSiteTron) list = [...list, oldSiteTron];
  if (list.length) return list;
  const fallback = normalizeWalletOption({
    id: wallet.network || "wallet",
    label: wallet.network || "USDT",
    network: wallet.network || "TRC20",
    asset: wallet.asset || "USDT",
    address: wallet.address || "",
    qrUrl: wallet.qrUrl || "",
    explorerUrl: wallet.explorerUrl || "",
  }, 0);
  return fallback.address ? [fallback] : [];
}

function findWalletOption(wallet = {}, selectedId = "", options = {}) {
  const walletOptionItems = walletOptions(wallet, options);
  const normalizedId = String(selectedId || "").trim().toLowerCase();
  return walletOptionItems.find((option) => option.id === normalizedId || option.network.toLowerCase() === normalizedId) || walletOptionItems[0] || null;
}

function publicWalletOptions(wallet = {}, options = {}) {
  return walletOptions(wallet, options).map((option) => ({
    id: option.id,
    label: option.label,
    network: option.network,
    asset: option.asset,
    address: option.address,
    qrUrl: option.qrUrl,
    explorerUrl: option.explorerUrl,
  }));
}

function normalizeWalletChain(network = "") {
  const value = String(network || "").trim().toLowerCase();
  if (!value) return "";
  if (value.includes("bnb") || value.includes("bsc") || value.includes("binance")) return "bnb";
  if (value.includes("sol")) return "solana";
  if (value.includes("base")) return "base";
  if (value.includes("eth") || value.includes("erc")) return "ethereum";
  if (value.includes("tron") || value.includes("trc")) return "tron";
  return value.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function normalizeChainAddress(address = "", chain = "") {
  const value = String(address || "").trim();
  return ["bnb", "base", "ethereum"].includes(chain) ? value.toLowerCase() : value;
}

function walletScanConfirmations(chain = "") {
  if (chain === "solana") return WALLET_SOLANA_CONFIRMATIONS;
  if (chain === "tron") return WALLET_TRON_CONFIRMATIONS;
  return WALLET_EVM_CONFIRMATIONS;
}

function tokenUnitAmount(value, decimals = 6) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const negative = text.startsWith("-");
  const clean = negative ? text.slice(1) : text;
  const [wholeRaw, fractionRaw = ""] = clean.split(".");
  const whole = wholeRaw.replace(/\D/g, "") || "0";
  const fraction = fractionRaw.replace(/\D/g, "").padEnd(decimals, "0").slice(0, decimals);
  try {
    const units = BigInt(whole) * (10n ** BigInt(decimals)) + BigInt(fraction || "0");
    return negative ? -units : units;
  } catch {
    return null;
  }
}

function tokenAmountFromUnits(units, decimals = 6) {
  let value;
  try {
    value = typeof units === "bigint" ? units : BigInt(String(units || "0"));
  } catch {
    value = 0n;
  }
  const negative = value < 0n;
  if (negative) value = -value;
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const fraction = String(value % base).padStart(decimals, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole.toString()}${fraction ? `.${fraction}` : ""}`;
}

function normalizeTokenUnits(units, fromDecimals = 6, toDecimals = 6) {
  let value;
  try {
    value = typeof units === "bigint" ? units : BigInt(String(units || "0"));
  } catch {
    value = 0n;
  }
  const from = Math.max(0, Number(fromDecimals || 0));
  const to = Math.max(0, Number(toDecimals || 0));
  if (from === to) return value;
  if (from > to) return value / (10n ** BigInt(from - to));
  return value * (10n ** BigInt(to - from));
}

function orderExpectedUnits(order = {}) {
  return tokenUnitAmount(order.payableAmountText || order.payableAmount || order.baseAmount, 6);
}

function walletTransactionKey(chain = "", hash = "") {
  return `${normalizeWalletChain(chain)}:${String(hash || "").trim().toLowerCase()}`;
}

function usedWalletTransactionKeys(db = {}) {
  const keys = new Set();
  (db.walletOrders || []).forEach((order) => {
    const hash = order.transactionHash || order.txHash || order.hash || "";
    if (hash) keys.add(walletTransactionKey(order.chain || order.network, hash));
    if (Array.isArray(order.matchedTransactions)) {
      order.matchedTransactions.forEach((tx) => {
        if (tx?.hash) keys.add(walletTransactionKey(tx.chain || order.chain || order.network, tx.hash));
      });
    }
  });
  return keys;
}

function walletScanSupported(chain = "") {
  return ["bnb", "base", "ethereum", "solana", "tron"].includes(normalizeWalletChain(chain));
}

async function scanFetchJson(url, { headers = {}, timeoutMs = 20000, method = "GET", body } = {}) {
  const response = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text.replace(/^\uFEFF/, "")) : null;
  } catch {
    payload = { raw: text };
  }
  if (!response.ok) {
    const error = new Error(`Chain API request failed: ${response.status}`);
    error.statusCode = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function evmRpc(chain, method, params = []) {
  const urls = WALLET_EVM_RPC_URLS[chain] || [];
  if (!urls.length) throw new Error(`No RPC configured for ${chain}.`);
  let lastError = null;
  for (const url of urls) {
    try {
      const payload = await scanFetchJson(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: { jsonrpc: "2.0", id: `wallet-${Date.now()}`, method, params },
        timeoutMs: 15000,
      });
      if (payload?.error) throw new Error(payload.error.message || `RPC ${method} failed`);
      return payload?.result;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error(`RPC ${method} failed for ${chain}`);
}

function evmTopicAddress(address = "") {
  const hex = String(address || "").trim().replace(/^0x/i, "").toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(hex)) return "";
  return `0x${hex.padStart(64, "0")}`;
}

function evmHex(value) {
  const number = typeof value === "bigint" ? value : BigInt(Math.max(0, Number(value || 0)));
  return `0x${number.toString(16)}`;
}

function evmHexToBigInt(hex = "0x0") {
  try {
    return BigInt(String(hex || "0x0"));
  } catch {
    return 0n;
  }
}

function evmAddressFromTopic(topic = "") {
  const hex = String(topic || "").replace(/^0x/i, "");
  return hex.length >= 40 ? `0x${hex.slice(-40)}` : "";
}

function evmScanConfig(chain = "") {
  const makeV2Url = (chainId, contract) => (address) => `https://api.etherscan.io/v2/api?chainid=${encodeURIComponent(chainId)}&module=account&action=tokentx&contractaddress=${encodeURIComponent(contract)}&address=${encodeURIComponent(address)}&page=1&offset=${WALLET_CHAIN_SCAN_LOOKBACK_LIMIT}&sort=desc&apikey=${encodeURIComponent(ETHERSCAN_API_KEY)}`;
  if (chain === "bnb") {
    if (ETHERSCAN_API_KEY) {
      return {
        apiBase: "https://api.etherscan.io/v2/api",
        apiKey: ETHERSCAN_API_KEY,
        usdtContract: WALLET_USDT_CONTRACTS.bnb,
        publicTokenUrl: makeV2Url("56", WALLET_USDT_CONTRACTS.bnb),
        source: "etherscan-v2",
      };
    }
    return {
      apiBase: "https://api.bscscan.com/api",
      apiKey: BSCSCAN_API_KEY,
      usdtContract: WALLET_USDT_CONTRACTS.bnb,
      publicTokenUrl: (address) => `https://api.bscscan.com/api?module=account&action=tokentx&contractaddress=${encodeURIComponent(WALLET_USDT_CONTRACTS.bnb)}&address=${encodeURIComponent(address)}&page=1&offset=${WALLET_CHAIN_SCAN_LOOKBACK_LIMIT}&sort=desc${BSCSCAN_API_KEY ? `&apikey=${encodeURIComponent(BSCSCAN_API_KEY)}` : ""}`,
      source: BSCSCAN_API_KEY ? "bscscan" : "public-bscscan",
    };
  }
  if (chain === "base") {
    if (ETHERSCAN_API_KEY) {
      return {
        apiBase: "https://api.etherscan.io/v2/api",
        apiKey: ETHERSCAN_API_KEY,
        usdtContract: WALLET_USDT_CONTRACTS.base,
        publicTokenUrl: makeV2Url("8453", WALLET_USDT_CONTRACTS.base),
        source: "etherscan-v2",
      };
    }
    return {
      apiBase: "https://api.basescan.org/api",
      apiKey: BASESCAN_API_KEY,
      usdtContract: WALLET_USDT_CONTRACTS.base,
      publicTokenUrl: (address) => `https://api.basescan.org/api?module=account&action=tokentx&contractaddress=${encodeURIComponent(WALLET_USDT_CONTRACTS.base)}&address=${encodeURIComponent(address)}&page=1&offset=${WALLET_CHAIN_SCAN_LOOKBACK_LIMIT}&sort=desc${BASESCAN_API_KEY ? `&apikey=${encodeURIComponent(BASESCAN_API_KEY)}` : ""}`,
      source: BASESCAN_API_KEY ? "basescan" : "public-basescan",
    };
  }
  if (ETHERSCAN_API_KEY) {
    return {
      apiBase: "https://api.etherscan.io/v2/api",
      apiKey: ETHERSCAN_API_KEY,
      usdtContract: WALLET_USDT_CONTRACTS.ethereum,
      publicTokenUrl: makeV2Url("1", WALLET_USDT_CONTRACTS.ethereum),
      source: "etherscan-v2",
    };
  }
  return {
    apiBase: "https://api.etherscan.io/api",
    apiKey: ETHERSCAN_API_KEY,
    usdtContract: WALLET_USDT_CONTRACTS.ethereum,
    publicTokenUrl: (address) => `https://api.etherscan.io/api?module=account&action=tokentx&contractaddress=${encodeURIComponent(WALLET_USDT_CONTRACTS.ethereum)}&address=${encodeURIComponent(address)}&page=1&offset=${WALLET_CHAIN_SCAN_LOOKBACK_LIMIT}&sort=desc${ETHERSCAN_API_KEY ? `&apikey=${encodeURIComponent(ETHERSCAN_API_KEY)}` : ""}`,
    source: "public-etherscan",
  };
}

async function scanEvmUsdtTransfersByRpc(chain, address) {
  const config = evmScanConfig(chain);
  const currentBlockHex = await evmRpc(chain, "eth_blockNumber", []);
  const currentBlock = Number(evmHexToBigInt(currentBlockHex));
  if (!currentBlock) return [];
  const fromBlock = Math.max(0, currentBlock - WALLET_EVM_SCAN_BLOCK_LOOKBACK);
  const transferTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
  const toTopic = evmTopicAddress(address);
  if (!toTopic) return [];
  const logs = [];
  for (let start = fromBlock; start <= currentBlock; start += WALLET_EVM_SCAN_CHUNK_SIZE) {
    const end = Math.min(currentBlock, start + WALLET_EVM_SCAN_CHUNK_SIZE - 1);
    const chunk = await evmRpc(chain, "eth_getLogs", [{
      fromBlock: evmHex(start),
      toBlock: evmHex(end),
      address: config.usdtContract,
      topics: [transferTopic, null, toTopic],
    }]);
    if (Array.isArray(chunk)) logs.push(...chunk);
    if (logs.length >= WALLET_CHAIN_SCAN_LOOKBACK_LIMIT) break;
  }
  return logs
    .slice(-WALLET_CHAIN_SCAN_LOOKBACK_LIMIT)
    .reverse()
    .map((log) => {
      const blockNumber = Number(evmHexToBigInt(log.blockNumber || "0x0"));
      const value = evmHexToBigInt(log.data || "0x0");
      return {
        chain,
        hash: String(log.transactionHash || ""),
        to: evmAddressFromTopic(log.topics?.[2] || ""),
        from: evmAddressFromTopic(log.topics?.[1] || ""),
        amountUnits: normalizeTokenUnits(value, 6, 6),
        amountText: tokenAmountFromUnits(value, 6),
        decimals: 6,
        confirmations: currentBlock && blockNumber ? Math.max(0, currentBlock - blockNumber + 1) : 0,
        blockNumber,
        timestamp: "",
        source: `${chain}-rpc`,
      };
    });
}

async function scanEvmUsdtTransfers(chain, address) {
  const config = evmScanConfig(chain);
  let payload = null;
  try {
    payload = await scanFetchJson(config.publicTokenUrl(address));
  } catch (error) {
    return await scanEvmUsdtTransfersByRpc(chain, address);
  }
  if (payload && payload.status === "0" && !Array.isArray(payload.result)) {
    return await scanEvmUsdtTransfersByRpc(chain, address);
  }
  const result = Array.isArray(payload?.result) ? payload.result : [];
  if (!result.length && !config.apiKey) {
    return await scanEvmUsdtTransfersByRpc(chain, address);
  }
  const currentBlock = Math.max(...result.map((tx) => Number(tx.blockNumber || 0)).filter(Boolean), 0);
  return result
    .filter((tx) => normalizeChainAddress(tx.to, chain) === normalizeChainAddress(address, chain))
    .filter((tx) => normalizeChainAddress(tx.contractAddress || tx.tokenContractAddress, chain) === normalizeChainAddress(config.usdtContract, chain))
    .map((tx) => {
      const blockNumber = Number(tx.blockNumber || 0);
      const confirmations = Number(tx.confirmations || 0) || (currentBlock && blockNumber ? Math.max(0, currentBlock - blockNumber + 1) : 0);
      const decimals = Number(tx.tokenDecimal || 6) || 6;
      return {
        chain,
        hash: String(tx.hash || ""),
        to: tx.to || "",
        from: tx.from || "",
        amountUnits: normalizeTokenUnits(tokenUnitAmount(tx.value || "0", 0) || 0n, decimals, 6),
        amountText: tokenAmountFromUnits(tx.value || "0", decimals),
        decimals,
        confirmations,
        blockNumber,
        timestamp: tx.timeStamp ? new Date(Number(tx.timeStamp) * 1000).toISOString() : "",
        source: config.source || (config.apiKey ? "scan-api" : "public-scan-api"),
      };
    });
}

async function solanaRpc(method, params = []) {
  return await scanFetchJson(SOLANA_RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: { jsonrpc: "2.0", id: `wallet-${Date.now()}`, method, params },
    timeoutMs: 25000,
  });
}

function solanaTokenBalanceUnits(balance = {}) {
  const amount = balance?.uiTokenAmount?.amount ?? balance?.uiAmountString ?? "";
  if (balance?.uiTokenAmount?.amount !== undefined) return tokenUnitAmount(amount, 0) || 0n;
  return tokenUnitAmount(amount, 6) || 0n;
}

async function scanSolanaUsdtTransfers(address) {
  const tokenAccountsPayload = await solanaRpc("getTokenAccountsByOwner", [
    address,
    { mint: WALLET_USDT_CONTRACTS.solana },
    { encoding: "jsonParsed" },
  ]).catch(() => null);
  const tokenAccounts = Array.isArray(tokenAccountsPayload?.result?.value)
    ? tokenAccountsPayload.result.value.map((item) => item.pubkey).filter(Boolean)
    : [];
  const scanAddresses = Array.from(new Set([address, ...tokenAccounts])).slice(0, 8);
  const signatureMap = new Map();
  for (const scanAddress of scanAddresses) {
    const signaturesPayload = await solanaRpc("getSignaturesForAddress", [
      scanAddress,
      { limit: Math.min(WALLET_CHAIN_SCAN_LOOKBACK_LIMIT, 50) },
    ]).catch(() => null);
    const signatures = Array.isArray(signaturesPayload?.result) ? signaturesPayload.result : [];
    signatures.forEach((sig) => {
      if (sig?.signature && !signatureMap.has(sig.signature)) signatureMap.set(sig.signature, sig);
    });
  }
  const signatures = Array.from(signatureMap.values());
  const transfers = [];
  const finalizedSlotPayload = await solanaRpc("getSlot", [{ commitment: "finalized" }]).catch(() => null);
  const finalizedSlot = Number(finalizedSlotPayload?.result || 0);
  for (const sig of signatures.slice(0, 30)) {
    const hash = sig.signature;
    if (!hash || sig.err) continue;
    const txPayload = await solanaRpc("getTransaction", [
      hash,
      { encoding: "jsonParsed", maxSupportedTransactionVersion: 0, commitment: "finalized" },
    ]).catch(() => null);
    const tx = txPayload?.result;
    if (!tx?.meta) continue;
    const pre = Array.isArray(tx.meta.preTokenBalances) ? tx.meta.preTokenBalances : [];
    const post = Array.isArray(tx.meta.postTokenBalances) ? tx.meta.postTokenBalances : [];
    const candidates = post.filter((balance) => (
      String(balance.mint || "") === WALLET_USDT_CONTRACTS.solana &&
      String(balance.owner || "") === address
    ));
    for (const postBalance of candidates) {
      const matchingPre = pre.find((balance) => (
        balance.accountIndex === postBalance.accountIndex &&
        String(balance.mint || "") === String(postBalance.mint || "")
      ));
      const delta = solanaTokenBalanceUnits(postBalance) - solanaTokenBalanceUnits(matchingPre || {});
      if (delta <= 0n) continue;
      transfers.push({
        chain: "solana",
        hash,
        to: address,
        from: "",
        amountUnits: normalizeTokenUnits(delta, Number(postBalance.uiTokenAmount?.decimals || 6) || 6, 6),
        amountText: tokenAmountFromUnits(delta, Number(postBalance.uiTokenAmount?.decimals || 6) || 6),
        decimals: Number(postBalance.uiTokenAmount?.decimals || 6) || 6,
        confirmations: finalizedSlot && tx.slot ? Math.max(0, finalizedSlot - Number(tx.slot) + 1) : WALLET_SOLANA_CONFIRMATIONS,
        blockNumber: tx.slot || sig.slot || 0,
        timestamp: tx.blockTime ? new Date(Number(tx.blockTime) * 1000).toISOString() : "",
        source: "solana-rpc",
      });
    }
  }
  return transfers;
}

async function scanTronUsdtTransfers(address) {
  const url = `https://api.trongrid.io/v1/accounts/${encodeURIComponent(address)}/transactions/trc20?only_confirmed=true&limit=${Math.min(WALLET_CHAIN_SCAN_LOOKBACK_LIMIT, 200)}&contract_address=${encodeURIComponent(WALLET_USDT_CONTRACTS.tron)}`;
  const headers = TRONGRID_API_KEY ? { "TRON-PRO-API-KEY": TRONGRID_API_KEY } : {};
  const payload = await scanFetchJson(url, { headers, timeoutMs: 25000 });
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  return rows
    .filter((tx) => String(tx.to || "") === address)
    .map((tx) => ({
      chain: "tron",
      hash: String(tx.transaction_id || tx.hash || ""),
      to: tx.to || "",
      from: tx.from || "",
      amountUnits: normalizeTokenUnits(tokenUnitAmount(tx.value || "0", 0) || 0n, Number(tx.token_info?.decimals || 6) || 6, 6),
      amountText: tokenAmountFromUnits(tx.value || "0", Number(tx.token_info?.decimals || 6) || 6),
      decimals: Number(tx.token_info?.decimals || 6) || 6,
      confirmations: WALLET_TRON_CONFIRMATIONS,
      blockNumber: Number(tx.block_number || 0),
      timestamp: tx.block_timestamp ? new Date(Number(tx.block_timestamp)).toISOString() : "",
      source: TRONGRID_API_KEY ? "trongrid" : "public-trongrid",
    }));
}

async function scanWalletTransfers(chain, address) {
  if (chain === "solana") return await scanSolanaUsdtTransfers(address);
  if (chain === "tron") return await scanTronUsdtTransfers(address);
  if (["bnb", "base", "ethereum"].includes(chain)) return await scanEvmUsdtTransfers(chain, address);
  return [];
}

function pendingWalletOrdersForScan(db = {}) {
  const minCreatedAt = Date.now() - WALLET_CHAIN_SCAN_ORDER_TTL_HOURS * 60 * 60 * 1000;
  return (db.walletOrders || [])
    .filter((order) => (order.status || "pending") === "pending")
    .filter((order) => !order.paymentProvider || order.paymentProvider === "manual")
    .filter((order) => order.address && order.payableAmountText)
    .filter((order) => walletScanSupported(order.chain || order.network))
    .filter((order) => {
      const time = new Date(order.createdAt || 0).getTime();
      return !Number.isFinite(time) || !time || time >= minCreatedAt;
    });
}

function sameWalletAddress(a = "", b = "", chain = "") {
  return normalizeChainAddress(a, chain) === normalizeChainAddress(b, chain);
}

function walletTransferMatchesOrder(order = {}, tx = {}, usedKeys = new Set()) {
  const chain = normalizeWalletChain(order.chain || order.network);
  if (!chain || tx.chain !== chain) return false;
  if (!tx.hash || usedKeys.has(walletTransactionKey(chain, tx.hash))) return false;
  if (!sameWalletAddress(tx.to, order.address, chain)) return false;
  const expected = orderExpectedUnits(order);
  if (expected === null || tx.amountUnits === undefined || tx.amountUnits === null) return false;
  let amount;
  try {
    amount = typeof tx.amountUnits === "bigint" ? tx.amountUnits : BigInt(String(tx.amountUnits || "0"));
  } catch {
    return false;
  }
  if (amount !== expected) return false;
  if (Number(tx.confirmations || 0) < walletScanConfirmations(chain)) return false;
  const createdAt = new Date(order.createdAt || "").getTime();
  const txTime = new Date(tx.timestamp || "").getTime();
  if (Number.isFinite(createdAt) && Number.isFinite(txTime) && txTime + 5 * 60 * 1000 < createdAt) return false;
  return true;
}

function walletScanGroups(orders = []) {
  const groups = new Map();
  orders.forEach((order) => {
    const chain = normalizeWalletChain(order.chain || order.network);
    const address = normalizeChainAddress(order.address || "", chain);
    if (!chain || !address) return;
    const key = `${chain}:${address}`;
    if (!groups.has(key)) groups.set(key, { chain, address: order.address, orders: [] });
    groups.get(key).orders.push(order);
  });
  return Array.from(groups.values());
}

async function scanAndSettleWalletOrders({ limit = 100, force = false } = {}) {
  const startedAt = new Date().toISOString();
  if (!WALLET_CHAIN_SCAN_ENABLED && !force) {
    return { ok: true, enabled: false, scanned: 0, matched: 0, errors: [], startedAt, finishedAt: new Date().toISOString() };
  }
  const db = await readDb();
  const config = await readAppConfig();
  const pending = pendingWalletOrdersForScan(db).slice(0, limit);
  const usedKeys = usedWalletTransactionKeys(db);
  const errors = [];
  let scanned = 0;
  let matched = 0;
  for (const group of walletScanGroups(pending)) {
    let transfers = [];
    try {
      transfers = await scanWalletTransfers(group.chain, group.address);
      scanned += 1;
    } catch (error) {
      errors.push({
        chain: group.chain,
        address: group.address,
        message: error.message || "Scan failed",
        detail: error.payload?.message || error.payload?.result || "",
      });
      continue;
    }
    for (const order of group.orders) {
      if ((order.status || "pending") !== "pending") continue;
      const tx = transfers.find((item) => walletTransferMatchesOrder(order, item, usedKeys));
      if (!tx) continue;
      const key = walletTransactionKey(tx.chain, tx.hash);
      const result = await settleWalletOrderPayment(db, order, config, {
        note: `Auto matched on ${tx.chain}.`,
        chain: tx.chain,
        transactionHash: tx.hash,
        confirmations: tx.confirmations,
        blockNumber: tx.blockNumber,
        fromAddress: tx.from,
        matchedAmountText: tx.amountText,
        matchedAt: new Date().toISOString(),
        scanSource: tx.source,
      });
      if (result.settled) {
        usedKeys.add(key);
        matched += 1;
      }
    }
  }
  if (matched) {
    if (dbEnabled()) {
      for (const order of pending) {
        if (order.status === "paid") await updateWalletOrderInDb(order);
      }
    } else {
      await writeDb(db);
    }
  }
  return {
    ok: true,
    enabled: WALLET_CHAIN_SCAN_ENABLED,
    scanned,
    pending: pending.length,
    matched,
    errors,
    startedAt,
    finishedAt: new Date().toISOString(),
  };
}

let walletScanRunning = false;
let walletScanTimer = null;

async function runWalletScanTick(reason = "timer") {
  if (walletScanRunning) return;
  walletScanRunning = true;
  try {
    const result = await withAppStateWriteLock(() => scanAndSettleWalletOrders({ limit: 100 }));
    if (result.matched || result.errors?.length) {
      console.log("[wallet-scan]", { reason, matched: result.matched, scanned: result.scanned, errors: result.errors?.length || 0 });
    }
  } catch (error) {
    console.error("[wallet-scan] failed", error.message || error);
  } finally {
    walletScanRunning = false;
  }
}

function startWalletScanScheduler() {
  if (!WALLET_CHAIN_SCAN_ENABLED || walletScanTimer) return;
  walletScanTimer = setInterval(() => {
    runWalletScanTick("timer");
  }, WALLET_CHAIN_SCAN_INTERVAL_MS);
  walletScanTimer.unref?.();
  setTimeout(() => runWalletScanTick("startup"), 10000).unref?.();
}

function paypalEnabled() {
  return Boolean(PAYPAL_CLIENT_ID && PAYPAL_CLIENT_SECRET);
}

function paypalApiBaseUrl() {
  return PAYPAL_ENV === "sandbox" ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com";
}

function paypalCnyCentsPerUnit(wallet = {}) {
  if (PAYPAL_CNY_CENTS_PER_UNIT_ENV !== "") {
    return clampNumber(PAYPAL_CNY_CENTS_PER_UNIT_ENV, DEFAULT_USDT_CNY_CENTS, 1, 100000);
  }
  return walletCnyCentsPerUsdt(wallet);
}

function paypalCreditsForAmount(amount, wallet = {}) {
  return creditsAmount(Math.round(Number(amount || 0) * paypalCnyCentsPerUnit(wallet)));
}

function paypalMoneyValue(amount) {
  return (Math.round(Number(amount || 0) * 100) / 100).toFixed(2);
}

function paypalPublicConfig() {
  return {
    enabled: paypalEnabled(),
    clientId: PAYPAL_CLIENT_ID,
    currency: PAYPAL_CURRENCY,
    environment: PAYPAL_ENV,
    minAmount: PAYPAL_MIN_AMOUNT,
    maxAmount: PAYPAL_MAX_AMOUNT,
  };
}

async function getPayPalAccessToken() {
  if (!paypalEnabled()) {
    const error = new Error("PayPal is not configured.");
    error.statusCode = 503;
    throw error;
  }
  if (paypalTokenCache.accessToken && Date.now() < paypalTokenCache.expiresAt - 60_000) {
    return paypalTokenCache.accessToken;
  }
  const credentials = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString("base64");
  const response = await fetch(`${paypalApiBaseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      authorization: `Basic ${credentials}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    const error = new Error(payload.error_description || payload.message || "Failed to authenticate PayPal.");
    error.statusCode = response.status || 502;
    error.details = payload;
    throw error;
  }
  paypalTokenCache = {
    accessToken: payload.access_token,
    expiresAt: Date.now() + Math.max(60, Number(payload.expires_in || 300)) * 1000,
  };
  return paypalTokenCache.accessToken;
}

async function paypalRequest(pathname, { method = "GET", body, headers = {} } = {}) {
  const accessToken = await getPayPalAccessToken();
  const response = await fetch(`${paypalApiBaseUrl()}${pathname}`, {
    method,
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message || payload.error_description || payload.name || "PayPal request failed.");
    error.statusCode = response.status || 502;
    error.details = payload;
    throw error;
  }
  return payload;
}

function findPayPalApprovalLink(orderPayload = {}) {
  const links = Array.isArray(orderPayload.links) ? orderPayload.links : [];
  return links.find((link) => String(link.rel || "").toLowerCase() === "approve")?.href || "";
}

function paypalCaptureFromOrder(payload = {}) {
  const purchaseUnits = Array.isArray(payload.purchase_units) ? payload.purchase_units : [];
  for (const unit of purchaseUnits) {
    const captures = Array.isArray(unit?.payments?.captures) ? unit.payments.captures : [];
    const capture = captures.find(Boolean);
    if (capture) return capture;
  }
  return null;
}

async function settleWalletOrderPayment(db, order, config, meta = {}) {
  if (!order) {
    const error = new Error("Payment order not found.");
    error.statusCode = 404;
    throw error;
  }
  const now = new Date().toISOString();
  if (order.status === "paid") {
    return { settled: false, user: (db.users || []).find((u) => u.id === order.userId) || null };
  }
  const rate = order.paymentProvider === "paypal"
    ? (order.cnyCentsPerUnit || paypalCnyCentsPerUnit(config.wallet))
    : (order.cnyCentsPerUsdt || walletCnyCentsPerUsdt(config.wallet));
  const creditDelta = creditsAmount(order.creditAmount ?? Math.round(Number(order.baseAmount || 0) * rate));
  order.creditAmount = creditDelta;
  if (order.paymentProvider === "paypal") order.cnyCentsPerUnit = rate;
  else order.cnyCentsPerUsdt = rate;
  if (meta.paypalCaptureId) order.paypalCaptureId = meta.paypalCaptureId;
  if (meta.paypalPayerEmail) order.paypalPayerEmail = meta.paypalPayerEmail;
  if (meta.paypalStatus) order.paypalStatus = meta.paypalStatus;
  if (meta.transactionHash) order.transactionHash = meta.transactionHash;
  if (meta.chain) order.chain = meta.chain;
  if (meta.transactionHash) order.matched = true;
  if (meta.confirmations !== undefined) order.confirmations = Number(meta.confirmations || 0);
  if (meta.blockNumber !== undefined) order.blockNumber = Number(meta.blockNumber || 0);
  if (meta.fromAddress) order.fromAddress = meta.fromAddress;
  if (meta.matchedAmountText) order.matchedAmountText = meta.matchedAmountText;
  if (meta.matchedAt) order.matchedAt = meta.matchedAt;
  if (meta.scanSource) order.scanSource = meta.scanSource;
  if (meta.transactionHash) {
    order.matchedTransactions = Array.isArray(order.matchedTransactions) ? order.matchedTransactions : [];
    if (!order.matchedTransactions.some((tx) => walletTransactionKey(tx.chain || order.chain || order.network, tx.hash) === walletTransactionKey(meta.chain || order.chain || order.network, meta.transactionHash))) {
      order.matchedTransactions.unshift({
        chain: meta.chain || order.chain || order.network || "",
        hash: meta.transactionHash,
        amount: meta.matchedAmountText || order.payableAmountText || "",
        confirmations: Number(meta.confirmations || 0),
        blockNumber: Number(meta.blockNumber || 0),
        from: meta.fromAddress || "",
        source: meta.scanSource || "",
        matchedAt: meta.matchedAt || now,
      });
    }
  }
  const user = await changeUserCredits(db, order.userId, creditDelta, "wallet_topup", {
    orderId: order.id,
    amount: order.baseAmount,
    asset: order.asset,
    network: order.network,
    provider: order.paymentProvider || "manual",
    paypalOrderId: order.paypalOrderId || "",
    paypalCaptureId: order.paypalCaptureId || "",
    transactionHash: order.transactionHash || "",
    chain: order.chain || order.network || "",
  });
  order.status = "paid";
  order.paidAt = order.paidAt || now;
  order.updatedAt = now;
  if (meta.note && !order.note) order.note = String(meta.note).slice(0, 200);
  return { settled: true, user };
}

async function safeSettleWalletOrderPayment(db, order, config, meta = {}) {
  try {
    return await settleWalletOrderPayment(db, order, config, meta);
  } catch (error) {
    order.status = order.status === "paid" ? "pending" : (order.status || "pending");
    order.note = error.message || "Failed to settle payment.";
    order.updatedAt = new Date().toISOString();
    return { settled: false, error };
  }
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
  if (mime === "image/bmp") return ".bmp";
  return ".jpg";
}

function imageMimeFromPath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".bmp") return "image/bmp";
  return "image/jpeg";
}

function imageMimeFromKnownPath(filePath) {
  const ext = path.extname(String(filePath || "").split("?")[0]).toLowerCase();
  if (![".jpg", ".jpeg", ".png", ".webp", ".bmp"].includes(ext)) return "";
  return imageMimeFromPath(filePath);
}

function videoExtFromMime(mime = "", fallbackPath = "") {
  const cleanMime = String(mime || "").split(";")[0].trim().toLowerCase();
  if (cleanMime === "video/webm") return ".webm";
  if (cleanMime === "video/quicktime") return ".mov";
  if (cleanMime === "video/x-m4v") return ".m4v";
  const ext = path.extname(String(fallbackPath || "").split("?")[0]).toLowerCase();
  if ([".mp4", ".webm", ".mov", ".m4v"].includes(ext)) return ext;
  return ".mp4";
}

function videoMimeFromPath(filePath = "") {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".webm") return "video/webm";
  if (ext === ".mov") return "video/quicktime";
  if (ext === ".m4v") return "video/x-m4v";
  return "video/mp4";
}

function videoMimeFromKnownPath(filePath = "") {
  const ext = path.extname(String(filePath || "").split("?")[0]).toLowerCase();
  if (![".mp4", ".webm", ".mov", ".m4v"].includes(ext)) return "";
  return videoMimeFromPath(filePath);
}

function audioMimeFromPath(filePath = "") {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".wav") return "audio/wav";
  if (ext === ".m4a" || ext === ".mp4") return "audio/mp4";
  if (ext === ".aac") return "audio/aac";
  if (ext === ".ogg") return "audio/ogg";
  if (ext === ".webm") return "audio/webm";
  return "audio/mpeg";
}

function audioMimeFromKnownPath(filePath = "") {
  const ext = path.extname(String(filePath || "").split("?")[0]).toLowerCase();
  if (![".mp3", ".wav", ".m4a", ".aac", ".ogg", ".webm"].includes(ext)) return "";
  return audioMimeFromPath(filePath);
}

function audioExtFromMime(mime = "", fallbackPath = "") {
  const cleanMime = String(mime || "").split(";")[0].trim().toLowerCase();
  if (cleanMime === "audio/mpeg" || cleanMime === "audio/mp3") return ".mp3";
  if (cleanMime === "audio/wav" || cleanMime === "audio/x-wav") return ".wav";
  if (cleanMime === "audio/mp4" || cleanMime === "audio/aac") return ".m4a";
  if (cleanMime === "audio/webm") return ".webm";
  if (cleanMime === "audio/ogg") return ".ogg";
  const ext = path.extname(String(fallbackPath || "").split("?")[0]).toLowerCase();
  if ([".mp3", ".wav", ".m4a", ".aac", ".ogg", ".webm"].includes(ext)) return ext;
  return ".mp3";
}

function mediaExtFromMime(mime = "", fallbackPath = "") {
  const cleanMime = String(mime || "").split(";")[0].trim().toLowerCase();
  if (cleanMime.startsWith("image/")) return imageExtFromMime(cleanMime);
  if (cleanMime.startsWith("video/")) return videoExtFromMime(cleanMime, fallbackPath);
  if (cleanMime.startsWith("audio/")) return audioExtFromMime(cleanMime, fallbackPath);
  const fallbackExt = path.extname(String(fallbackPath || "").split("?")[0]).toLowerCase();
  if (fallbackExt) return fallbackExt;
  if (cleanMime === "application/octet-stream") return ".bin";
  return "";
}

function decodeWanMediaDataUrl(dataUrl = "") {
  const match = String(dataUrl || "").match(/^data:((?:image\/(?:png|jpeg|jpg|webp|bmp))|(?:audio\/(?:mpeg|mp3|wav|x-wav|mp4|aac|ogg|webm))|(?:video\/(?:mp4|webm|quicktime|x-m4v)));base64,([a-z0-9+/=]+)$/i);
  if (!match) {
    const error = new Error("Only image, audio, or video data URLs are supported.");
    error.statusCode = 400;
    throw error;
  }
  return {
    mime: match[1].replace("image/jpg", "image/jpeg").replace("audio/mp3", "audio/mpeg"),
    bytes: Buffer.from(match[2], "base64"),
  };
}

async function createUserMediaAssetFromBytes(db, user, { bytes, mime, name = "Upload", fileName = "", maxBytes = 8 * 1024 * 1024, durationSeconds = 0 } = {}) {
  if (bytes.byteLength > maxBytes) {
    const label = mime.startsWith("image/") ? "Image" : mime.startsWith("audio/") ? "Audio" : "Media";
    const error = new Error(`${label} must be ${Math.round(maxBytes / 1024 / 1024)}MB or smaller.`);
    error.statusCode = 400;
    throw error;
  }

  const assetId = randomId("asset");
  const fallbackExt = mime.startsWith("image/") ? imageExtFromMime(mime) : ".bin";
  const storedFileName = `${assetId}${mediaExtFromMime(mime, fileName) || fallbackExt}`;
  const dir = path.join(USER_UPLOAD_DIR, user.id);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, storedFileName), bytes);

  const displayName = String(fileName || name || "Upload")
    .split(/[\\/]/)
    .pop()
    .slice(0, 60);
  const userAsset = {
    id: assetId,
    userId: user.id,
    name: displayName || "Upload",
    mime,
    localUrl: `/assets/user-uploads/${user.id}/${storedFileName}`,
    publicUrl: publicUrlForAssetPath(`/assets/user-uploads/${user.id}/${storedFileName}`),
    assetUri: "",
    durationSeconds: mime.startsWith("video/") || mime.startsWith("audio/")
      ? durationSecondsFromValue(durationSeconds)
      : 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: "",
  };
  db.userAssets.unshift(userAsset);
  if (dbEnabled()) await upsertUserAssetInDb(userAsset);
  else await writeDb(db);
  return userAsset;
}

async function createUserAssetFromDataUrl(db, user, { dataUrl, name = "Upload", fileName = "" } = {}) {
  const { mime, bytes } = decodeDataUrl(dataUrl);
  return createUserMediaAssetFromBytes(db, user, {
    bytes,
    mime,
    name,
    fileName,
    maxBytes: 8 * 1024 * 1024,
  });
}

async function createUserWanMediaAssetFromDataUrl(db, user, { dataUrl, name = "Wan media", fileName = "" } = {}) {
  const { mime, bytes } = decodeWanMediaDataUrl(dataUrl);
  const isImage = mime.startsWith("image/");
  return createUserMediaAssetFromBytes(db, user, {
    bytes,
    mime,
    name,
    fileName,
    maxBytes: isImage ? 20 * 1024 * 1024 : 30 * 1024 * 1024,
  });
}

async function createUserMediaAssetFromPublicUrl(db, user, { url, name = "Upload", fileName = "", durationSeconds = 0 } = {}) {
  const mediaUrl = String(url || "").trim();
  if (!isPublicHttpUrl(mediaUrl)) {
    const error = new Error("Asset URL must be a public http(s) URL.");
    error.statusCode = 400;
    throw error;
  }
  const fallbackName = path.basename(new URL(mediaUrl).pathname) || "";
  const downloaded = await downloadRemoteFileToBuffer(mediaUrl, {
    label: "asset",
    maxBytes: 30 * 1024 * 1024,
    timeoutMs: 120000,
  });
  const pathname = new URL(mediaUrl).pathname;
  const responseMime = String(downloaded.mime || "").replace("image/jpg", "image/jpeg");
  const mime = responseMime.startsWith("image/")
    ? responseMime
    : responseMime.startsWith("video/")
      ? responseMime
      : responseMime.startsWith("audio/")
        ? responseMime.replace("audio/mp3", "audio/mpeg")
        : imageMimeFromKnownPath(pathname) || videoMimeFromKnownPath(pathname) || audioMimeFromKnownPath(pathname);
  if (!mime || (!mime.startsWith("image/") && !mime.startsWith("video/") && !mime.startsWith("audio/"))) {
    const error = new Error("Asset URL must point to an image, video, or audio file.");
    error.statusCode = 400;
    throw error;
  }
  if (mime.startsWith("image/") && !["image/jpeg", "image/png", "image/webp", "image/bmp"].includes(mime)) {
    const error = new Error("Asset image URL must point to a JPG, PNG, WebP, or BMP file.");
    error.statusCode = 400;
    throw error;
  }
  if (mime.startsWith("video/") && !["video/mp4", "video/webm", "video/quicktime", "video/x-m4v"].includes(mime)) {
    const error = new Error("Asset video URL must point to an MP4, WebM, MOV, or M4V file.");
    error.statusCode = 400;
    throw error;
  }
  if (mime.startsWith("audio/") && !["audio/mpeg", "audio/wav", "audio/x-wav", "audio/mp4", "audio/aac", "audio/ogg", "audio/webm"].includes(mime)) {
    const error = new Error("Asset audio URL must point to an MP3, WAV, M4A, AAC, OGG, or WebM audio file.");
    error.statusCode = 400;
    throw error;
  }
  const maxBytes = mime.startsWith("image/") ? 8 * 1024 * 1024 : 30 * 1024 * 1024;
  return createUserMediaAssetFromBytes(db, user, {
    bytes: downloaded.bytes,
    mime,
    name,
    fileName: fileName || fallbackName,
    maxBytes,
    durationSeconds,
  });
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

function execFileQuiet(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: 120000, windowsHide: true, ...options }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function probeVideoDurationSeconds(videoUrl = "") {
  const url = String(videoUrl || "").trim();
  if (!url || !isPublicHttpUrl(url)) return 0;
  try {
    const result = await execFileJson("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "json",
      url,
    ], { timeout: VIDEO_DURATION_PROBE_TIMEOUT_MS });
    return durationSecondsFromValue(result?.format?.duration);
  } catch (error) {
    console.warn("[video-duration-probe-failed]", url, error.message || error);
    return 0;
  }
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

async function uploadBufferToTos({ userId, assetId, bytes, mime, extension = "" }) {
  requireValue("TOS_ACCESS_KEY_ID", TOS.accessKey);
  requireValue("TOS_SECRET_ACCESS_KEY", TOS.secretKey);
  requireValue("TOS_ENDPOINT", TOS.endpoint);
  requireValue("TOS_REGION", TOS.region);
  requireValue("TOS_BUCKET", TOS.bucket);
  requireValue("TOS_PUBLIC_DOMAIN", TOS.publicDomain);

  const fileName = `${storagePathSegment(assetId, "asset")}-${Date.now()}${extension || mediaExtFromMime(mime) || imageExtFromMime(mime)}`;
  const key = tosStorageKey("users", userId, fileName);
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

function tosEnabled() {
  if (DISABLE_TOS_STORAGE) return false;
  return Boolean(TOS.accessKey && TOS.secretKey && TOS.endpoint && TOS.region && TOS.bucket && TOS.publicDomain);
}

function localPublicAssetStorageEnabled() {
  return DISABLE_TOS_STORAGE || !tosEnabled();
}

async function uploadStaticAssetToTos({ key, bytes, mime }) {
  requireValue("TOS_ACCESS_KEY_ID", TOS.accessKey);
  requireValue("TOS_SECRET_ACCESS_KEY", TOS.secretKey);
  requireValue("TOS_ENDPOINT", TOS.endpoint);
  requireValue("TOS_REGION", TOS.region);
  requireValue("TOS_BUCKET", TOS.bucket);
  requireValue("TOS_PUBLIC_DOMAIN", TOS.publicDomain);

  const auth = makeTosAuth({ method: "PUT", key, body: bytes, contentType: mime });
  const url = `https://${auth.host}${auth.canonicalUri}`;
  const response = await fetch(url, { method: "PUT", headers: auth.headers, body: bytes });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`TOS upload failed: ${response.status} ${text}`);
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

function seedanceContentFromReferences({
  prompt = "",
  referenceAssetUri = "",
  extraReferenceAssetUris = [],
  firstFrameAssetUri = "",
  lastFrameAssetUri = "",
  referenceVideoAssetUri = "",
  extraReferenceVideoAssetUris = [],
  referenceAudioAssetUris = [],
  body = {},
} = {}) {
  const content = [{ type: "text", text: String(prompt || "") }];
  if (firstFrameAssetUri) {
    content.push({
      type: "image_url",
      image_url: { url: firstFrameAssetUri },
      role: "first_frame",
    });
  }
  if (lastFrameAssetUri) {
    content.push({
      type: "image_url",
      image_url: { url: lastFrameAssetUri },
      role: "last_frame",
    });
  }
  const videoUris = [referenceVideoAssetUri, ...extraReferenceVideoAssetUris]
    .filter((uri, index, list) => uri && list.indexOf(uri) === index);
  const rawReferenceVideos = arrayFromBody(body?.reference_videos)
    .map((item) => (typeof item === "string" ? item : String(item?.url || item?.videoUrl || item?.video_url || item?.assetUri || "")))
    .filter(Boolean);
  rawReferenceVideos.forEach((uri) => {
    if (!videoUris.includes(uri) && videoUris.length < ADVANCED_SEEDANCE_VIDEO_REFERENCE_LIMIT) videoUris.push(uri);
  });
  videoUris.forEach((uri) => {
    content.push({
      type: "video_url",
      video_url: { url: uri },
      role: "reference_video",
    });
  });
  const rawReferenceAudios = [
    ...arrayFromBody(referenceAudioAssetUris),
    ...arrayFromBody(body?.reference_audios)
      .map((item) => (typeof item === "string" ? item : String(item?.url || item?.audioUrl || item?.audio_url || item?.assetUri || ""))),
  ]
    .filter((uri, index, list) => uri && typeof uri === "string" && list.indexOf(uri) === index)
    .slice(0, ADVANCED_SEEDANCE_AUDIO_REFERENCE_LIMIT);
  rawReferenceAudios.forEach((uri) => {
    content.push({
      type: "audio_url",
      audio_url: { url: uri },
      role: "reference_audio",
    });
  });
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
  return content;
}

const SEEDANCE_TOP_LEVEL_PASSTHROUGH_FIELDS = [
  "model",
  "ratio",
  "resolution",
  "duration",
  "generate_audio",
  "web_search",
  "seed",
  "watermark",
  "fps",
  "camera_fixed",
  "content",
  "reference_images",
  "reference_videos",
  "reference_audios",
];

function seedancePayloadFromBody({ config = {}, prompt = "", content = [], body = {} } = {}) {
  const source = { ...requestParamsFromBody(body), ...body };
  const parameterExtras = plainObject(source.parameters);
  const payload = pickRequestFields(source, SEEDANCE_TOP_LEVEL_PASSTHROUGH_FIELDS);
  const requestedContent = Array.isArray(source.content) ? source.content : null;
  const fallbackContent = Array.isArray(content) ? content : [];
  payload.model = String(firstPresent(source.model, MODEL_QUALITY));
  payload.content = requestedContent || fallbackContent;
  payload.generate_audio = boolFromRequest(
    firstPresent(source.generate_audio, source.generateAudio),
    config.video?.generateAudio === true,
  );
  payload.ratio = String(firstPresent(source.ratio, source.aspect_ratio, config.video?.ratio, "9:16"));
  payload.resolution = normalizeAdvancedResolution(firstPresent(source.resolution, config.video?.resolution, "720p"));
  payload.duration = clampNumber(
    firstPresent(source.duration, source.durationSeconds),
    config.video?.duration || advancedDurationBounds("seedance").fallback,
    advancedDurationBounds("seedance").min,
    advancedDurationBounds("seedance").max,
  );
  const seedValue = firstPresent(source.seed, parameterExtras.seed);
  if (seedValue !== undefined) payload.seed = seedValue;
  const webSearchValue = firstPresent(source.web_search, source.webSearch, parameterExtras.web_search, parameterExtras.webSearch);
  if (webSearchValue !== undefined) payload.web_search = boolFromRequest(webSearchValue, false);
  payload.watermark = boolFromRequest(firstPresent(source.watermark, parameterExtras.watermark), false);
  if (Array.isArray(payload.reference_images) && payload.reference_images.length) {
    payload.reference_images = payload.reference_images.map((item) => (
      typeof item === "string" ? item : String(item?.url || item?.image_url || item?.assetUri || item || "")
    )).filter(Boolean);
  }
  if (Array.isArray(payload.reference_videos) && payload.reference_videos.length) {
    payload.reference_videos = payload.reference_videos.map((item) => (
      typeof item === "string" ? item : String(item?.url || item?.videoUrl || item?.video_url || item?.assetUri || item || "")
    )).filter(Boolean);
  }
  if (Array.isArray(payload.reference_audios) && payload.reference_audios.length) {
    payload.reference_audios = payload.reference_audios.map((item) => (
      typeof item === "string" ? item : String(item?.url || item?.audioUrl || item?.audio_url || item?.assetUri || item || "")
    )).filter(Boolean);
  }
  if (!Array.isArray(payload.content) || !payload.content.length) payload.content = [{ type: "text", text: String(prompt || "") }];
  return payload;
}

async function submitSeedanceVideoTask({
  config,
  prompt,
  referenceAssetUri,
  extraReferenceAssetUris = [],
  firstFrameAssetUri = "",
  lastFrameAssetUri = "",
  referenceVideoAssetUri = "",
  extraReferenceVideoAssetUris = [],
  referenceAudioAssetUris = [],
  body = {},
  slug = "",
}) {
  const content = seedanceContentFromReferences({
    prompt,
    referenceAssetUri,
    extraReferenceAssetUris,
    firstFrameAssetUri,
    lastFrameAssetUri,
    referenceVideoAssetUri,
    extraReferenceVideoAssetUris,
    referenceAudioAssetUris,
    body,
  });

  const payload = seedancePayloadFromBody({ config, prompt, content, body });

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
  return { task: normalizeTask(raw), payload, raw };
}

function cloneJson(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function mediaUrlFromOfficialItem(item = {}, key = "image_url") {
  const value = item?.[key];
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return String(value.url || value.uri || value.assetUri || "").trim();
  }
  return "";
}

function setOfficialMediaUrl(item = {}, key = "image_url", url = "") {
  const current = item?.[key];
  if (current && typeof current === "object" && !Array.isArray(current)) {
    return { ...item, [key]: { ...current, url } };
  }
  return { ...item, [key]: { url } };
}

function officialSeedancePrompt(payload = {}) {
  if (typeof payload.prompt === "string" && payload.prompt.trim()) return payload.prompt.trim();
  const content = Array.isArray(payload.content) ? payload.content : [];
  return content
    .map((item) => {
      if (typeof item === "string") return item;
      if (!item || typeof item !== "object") return "";
      if (item.type === "text" || item.text !== undefined) return String(item.text || "");
      return "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

function officialSeedanceVideoInputsForPricing(payload = {}) {
  const content = Array.isArray(payload.content) ? payload.content : [];
  const videos = content
    .filter((item) => item && typeof item === "object" && item.type === "video_url")
    .map((item) => ({
      url: mediaUrlFromOfficialItem(item, "video_url"),
      durationSeconds: firstPresent(
        item.durationSeconds,
        item.duration,
        item.videoDurationSeconds,
        item.inputVideoSeconds,
        item.video_url?.durationSeconds,
        item.video_url?.duration,
      ),
    }))
    .filter((item) => item.url);
  return {
    ...payload,
    reference_videos: [
      ...arrayFromBody(payload.reference_videos),
      ...arrayFromBody(payload.referenceVideos),
      ...videos,
    ],
  };
}

async function prepareOfficialSeedanceImageUrl(db, user, url = "", name = "Seedance reference image") {
  const text = String(url || "").trim();
  if (!text || text.startsWith("asset://")) return text;
  let userAsset = null;
  if (/^data:image\//i.test(text)) {
    const { mime, bytes } = decodeWanMediaDataUrl(text);
    userAsset = await createUserMediaAssetFromBytes(db, user, {
      bytes,
      mime,
      name,
      fileName: `${String(name || "image").replace(/[^a-z0-9_-]+/gi, "-").slice(0, 40) || "image"}.png`,
      maxBytes: 8 * 1024 * 1024,
    });
  } else if (isPublicHttpUrl(text)) {
    userAsset = await createUserMediaAssetFromPublicUrl(db, user, {
      url: text,
      name,
      fileName: `${String(name || "image").replace(/[^a-z0-9_-]+/gi, "-").slice(0, 40) || "image"}.png`,
    });
  }
  if (!userAsset) return text;
  const prepared = await prepareSeedanceReferenceAsset(db, userAsset, false);
  return prepared.referenceAssetUri || prepared.asset?.assetUri || text;
}

async function prepareOfficialSeedancePayloadForArk(db, user, body = {}, { prepareImages = true } = {}) {
  const source = { ...plainObject(body.params), ...cloneJson(body) };
  delete source.params;
  const payload = cloneJson(source) || {};
  payload.model = String(payload.model || MODEL_QUALITY);
  copyIfPresent(payload, source, "aspect_ratio", "ratio");
  copyIfPresent(payload, source, "durationSeconds", "duration");
  copyIfPresent(payload, source, "generateAudio", "generate_audio");
  copyIfPresent(payload, source, "webSearch", "web_search");
  copyIfPresent(payload, source, "firstFrameUrl", "image_url");
  copyIfPresent(payload, source, "first_frame_url", "image_url");
  copyIfPresent(payload, source, "imageUrl", "image_url");
  copyIfPresent(payload, source, "lastFrameUrl", "end_image_url");
  copyIfPresent(payload, source, "last_frame_url", "end_image_url");
  copyIfPresent(payload, source, "endImageUrl", "end_image_url");
  if (payload.draft !== undefined) payload.draft = boolFromRequest(payload.draft, false);
  if (payload.generate_audio !== undefined) payload.generate_audio = boolFromRequest(payload.generate_audio, false);
  if (payload.web_search !== undefined) payload.web_search = boolFromRequest(payload.web_search, false);
  if (payload.watermark !== undefined) payload.watermark = boolFromRequest(payload.watermark, false);
  if (payload.camera_fixed !== undefined) payload.camera_fixed = boolFromRequest(payload.camera_fixed, false);
  if (!Array.isArray(payload.content) || !payload.content.length) {
    const prompt = officialSeedancePrompt(payload);
    payload.content = prompt ? [{ type: "text", text: prompt }] : [];
  }
  payload.content = payload.content.map(normalizeSeedanceContentItem);

  pushSeedanceContentMedia(payload.content, "image_url", payload.image_url, "first_frame");
  pushSeedanceContentMedia(payload.content, "image_url", payload.end_image_url, "last_frame");
  [
    ...arrayFromBody(payload.reference_images),
    ...arrayFromBody(source.referenceImages),
  ].forEach((item) => {
    const url = nestedMediaUrl(item);
    pushSeedanceContentMedia(payload.content, "image_url", url, "reference_image");
  });
  [
    ...arrayFromBody(payload.reference_videos),
    ...arrayFromBody(source.referenceVideos),
  ].forEach((item) => {
    const url = nestedMediaUrl(item);
    const durationSeconds = typeof item === "object" && item ? firstPresent(item.durationSeconds, item.duration, item.video_url?.durationSeconds, item.video_url?.duration) : undefined;
    pushSeedanceContentMedia(payload.content, "video_url", url, "reference_video", { durationSeconds });
  });
  [
    ...arrayFromBody(payload.reference_audios),
    ...arrayFromBody(source.referenceAudios),
  ].forEach((item) => {
    const url = nestedMediaUrl(item);
    pushSeedanceContentMedia(payload.content, "audio_url", url, "reference_audio");
  });
  if (!prepareImages) {
    payload.content = payload.content.map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return item;
      return Object.fromEntries(Object.entries(item).filter(([, value]) => value !== undefined));
    });
    return payload;
  }

  if (typeof payload.image_url === "string") {
    payload.image_url = await prepareOfficialSeedanceImageUrl(db, user, payload.image_url, "Seedance first frame");
  }
  if (typeof payload.end_image_url === "string") {
    payload.end_image_url = await prepareOfficialSeedanceImageUrl(db, user, payload.end_image_url, "Seedance last frame");
  }
  if (Array.isArray(payload.reference_images)) {
    const preparedImages = [];
    for (let index = 0; index < payload.reference_images.length; index += 1) {
      const item = payload.reference_images[index];
      const url = typeof item === "string" ? item : String(item?.url || item?.image_url || item?.assetUri || "");
      const preparedUrl = await prepareOfficialSeedanceImageUrl(db, user, url, `Seedance reference image ${index + 1}`);
      if (preparedUrl) preparedImages.push(preparedUrl);
    }
    payload.reference_images = preparedImages;
  }
  if (Array.isArray(payload.content)) {
    const preparedContent = [];
    for (let index = 0; index < payload.content.length; index += 1) {
      const item = payload.content[index];
      if (!item || typeof item !== "object" || Array.isArray(item) || item.type !== "image_url") {
        preparedContent.push(item);
        continue;
      }
      const url = mediaUrlFromOfficialItem(item, "image_url");
      const preparedUrl = await prepareOfficialSeedanceImageUrl(db, user, url, `Seedance content image ${index + 1}`);
      preparedContent.push(preparedUrl ? setOfficialMediaUrl(item, "image_url", preparedUrl) : item);
    }
    payload.content = preparedContent;
  }
  payload.content = payload.content.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return item;
    return Object.fromEntries(Object.entries(item).filter(([, value]) => value !== undefined));
  });
  stripSeedanceCompatibilityAliases(payload);
  return payload;
}

function validateOfficialSeedancePayloadBeforeCharge(payload = {}) {
  const errors = [];
  const resolution = String(payload.resolution || "720p").trim().toLowerCase();
  if (!["480p", "720p", "1080p"].includes(resolution)) errors.push("resolution must be 480p, 720p, or 1080p.");
  const duration = Number(payload.duration ?? advancedDurationBounds("seedance").fallback);
  if (!Number.isFinite(duration) || !Number.isInteger(duration) || duration < 4 || duration > 15) {
    errors.push("duration must be an integer from 4 to 15 seconds.");
  }
  const model = String(payload.model || "").toLowerCase();
  if (model.includes("fast") && resolution === "1080p") errors.push("dreamina-seedance-2-0-fast does not support 1080p.");
  const content = Array.isArray(payload.content) ? payload.content : [];
  const unsupportedContent = content.find((item) => item && typeof item === "object" && item.type && !["text", "image_url", "video_url", "audio_url"].includes(String(item.type)));
  if (unsupportedContent) errors.push(`unsupported content type: ${unsupportedContent.type}.`);
  const imageCount = content.filter((item) => item && item.type === "image_url").length;
  const videoCount = content.filter((item) => item && item.type === "video_url").length;
  const audioCount = content.filter((item) => item && item.type === "audio_url").length;
  if (imageCount > ADVANCED_SEEDANCE_REFERENCE_LIMIT) errors.push(`Seedance supports at most ${ADVANCED_SEEDANCE_REFERENCE_LIMIT} image inputs.`);
  if (videoCount > ADVANCED_SEEDANCE_VIDEO_REFERENCE_LIMIT) errors.push(`Seedance supports at most ${ADVANCED_SEEDANCE_VIDEO_REFERENCE_LIMIT} video inputs.`);
  if (audioCount > ADVANCED_SEEDANCE_AUDIO_REFERENCE_LIMIT) errors.push(`Seedance supports at most ${ADVANCED_SEEDANCE_AUDIO_REFERENCE_LIMIT} audio inputs.`);
  const missingMedia = content.find((item) => {
    if (!item || typeof item !== "object") return false;
    if (item.type === "image_url") return !mediaUrlFromOfficialItem(item, "image_url");
    if (item.type === "video_url") return !mediaUrlFromOfficialItem(item, "video_url");
    if (item.type === "audio_url") return !mediaUrlFromOfficialItem(item, "audio_url");
    return false;
  });
  if (missingMedia) errors.push(`${missingMedia.type || "media"} content requires a url.`);
  if (errors.length) {
    const error = new Error(errors.join(" "));
    error.statusCode = 400;
    error.code = "INVALID_SEEDANCE_REQUEST";
    throw error;
  }
}

function officialSeedanceResponseFromRecord(record = {}) {
  const videoUrl = generationRecordProviderVideoUrl(record);
  const status = record.status || "unknown";
  const usage = record.usageCompletionTokens
    ? { completion_tokens: record.usageCompletionTokens, total_tokens: record.usageCompletionTokens }
    : undefined;
  return {
    id: record.upstreamTaskId || record.taskId || "",
    task_id: record.upstreamTaskId || record.taskId || "",
    status,
    model: record.model || MODEL_QUALITY,
    content: videoUrl ? { video_url: videoUrl } : undefined,
    usage,
    error: record.error ? { message: record.error } : undefined,
    created_at: record.createdAt || "",
    updated_at: record.updatedAt || "",
  };
}

async function findOwnGenerationRecordByTaskId(auth, taskId = "") {
  const id = String(taskId || "").trim();
  if (!id) return null;
  const direct = await getGenerationRecord(id);
  if (direct && direct.userId === auth.user.id && !isSoftDeleted(direct)) return direct;
  const records = await listGenerationRecordsForUser(auth.user.id, 1000);
  return records.find((record) => record.upstreamTaskId === id && !isSoftDeleted(record)) || null;
}

async function handleVolcengineCreateGenerationTask(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  if (USE_GATEWAY_UPSTREAM) {
    return sendJson(res, 503, { error: { code: "GATEWAY_MODE_NOT_SUPPORTED", message: "Volcengine-compatible API requires direct Ark upstream mode." } });
  }
  if (!ARK_API_KEY) {
    return sendJson(res, 503, { error: { code: "MISSING_ARK_API_KEY", message: "Seedance generation is not configured." } });
  }

  const body = await readJson(req);
  const config = await readAppConfig();
  const payloadForValidation = await prepareOfficialSeedancePayloadForArk(auth.db, auth.user, body, { prepareImages: false });
  let payload = payloadForValidation;
  const prompt = officialSeedancePrompt(payload);
  if (!prompt) {
    return sendJson(res, 400, { error: { code: "MISSING_PROMPT", message: "content text or prompt is required." } });
  }
  try {
    validateOfficialSeedancePayloadBeforeCharge(payloadForValidation);
  } catch (error) {
    return sendJson(res, error.statusCode || 400, {
      error: { code: error.code || "INVALID_SEEDANCE_REQUEST", message: error.message || "Seedance request is invalid." },
    });
  }

  const pricingBody = officialSeedanceVideoInputsForPricing(payloadForValidation);
  const requestParams = {
    ...payloadForValidation,
    provider: "seedance",
    duration: clampNumber(payloadForValidation.duration, advancedDurationBounds("seedance").fallback, 4, advancedDurationBounds("seedance").max),
    resolution: String(payloadForValidation.resolution || "720p").toLowerCase() === "1080p"
      ? "1080p"
      : String(payloadForValidation.resolution || "720p").toLowerCase() === "480p"
      ? "480p"
      : "720p",
    ratio: normalizeVideoRatio(payloadForValidation.ratio || payloadForValidation.aspect_ratio || "9:16"),
  };
  requestParams.inputVideoSeconds = await seedanceVideoInputSecondsForPricingWithProbe(pricingBody, { requestParams });
  const rawPricing = advancedModelPricing("seedance", {
    ...requestParams,
    model: payloadForValidation.model,
    advancedPricing: config.platform?.advancedPricing,
    allowFourSecondSeedance: true,
  });
  const pricing = applyUserPricingToEstimate(rawPricing, auth.user);
  const cost = pricing.credits;
  if (auth.user.credits < cost) {
    return sendJson(res, 402, { error: { code: "INSUFFICIENT_CREDITS", message: insufficientCreditsMessage(cost, auth.user.credits) }, cost, credits: creditsAmount(auth.user.credits) });
  }
  try {
    assertSubtokenCanSpend(auth, cost);
  } catch (error) {
    return sendJson(res, error.statusCode || 402, {
      error: { code: error.code || "SUBTOKEN_QUOTA_EXCEEDED", message: error.message || "Sub token quota is not enough." },
      ...(error.payload || {}),
    });
  }

  const fallbackTaskId = localGenerationTaskId("ark");
  if (cost > 0) {
    await chargeUserWithSubtoken(auth, {
      cost,
      type: "volcengine_generation",
      taskId: fallbackTaskId,
      meta: {
        taskId: fallbackTaskId,
        provider: "seedance",
        model: payloadForValidation.model,
        duration: requestParams.duration,
        resolution: requestParams.resolution,
        ratio: requestParams.ratio,
        inputVideoSeconds: requestParams.inputVideoSeconds || 0,
        originalCost: pricing.originalCredits,
        pricingMultiplier: pricing.userPricingMultiplier,
        pricingSource: pricing.source || "duration_rate",
      },
    });
    if (!dbEnabled()) await writeDb(auth.db);
  }

  try {
    payload = await prepareOfficialSeedancePayloadForArk(auth.db, auth.user, body, { prepareImages: true });
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
    const task = normalizeTask(raw);
    const taskId = fallbackTaskId;
    await upsertGenerationRecord({
      taskId,
      upstreamTaskId: task.taskId || "",
      status: task.status || "submitted",
      model: payload.model || MODEL_QUALITY,
      provider: "seedance",
      upstreamSource: "direct",
      source: "volcengine-compatible",
      kind: "advanced-video",
      userId: auth.user.id,
      prompt,
      finalPrompt: prompt,
      params: requestParams,
      upstreamPayload: payload,
      ratio: requestParams.ratio || payload.ratio || "",
      resolution: requestParams.resolution || payload.resolution || "",
      duration: requestParams.duration || payload.duration || "",
      remoteVideoUrl: task.videoUrl || "",
      preDeductedCredits: cost,
      originalPreDeductedCredits: pricing.originalCredits,
      finalCredits: cost,
      originalFinalCredits: pricing.originalCredits,
      userPricingMultiplier: pricing.userPricingMultiplier,
      billingStatus: cost > 0 ? "settled" : "free",
      billingSettledAt: cost > 0 ? new Date().toISOString() : "",
      pricingEstimate: pricing,
      createResponse: raw,
      awaitingUpstreamTask: false,
      apiTokenId: auth.tokenRecord?.id || "",
      apiTokenName: auth.tokenRecord?.name || "",
      apiTokenType: auth.tokenRecord?.quotaType || "",
      apiTokenSource: auth.tokenSource || "",
    });
    return sendJson(res, 200, raw);
  } catch (error) {
    await upsertGenerationRecord({
      taskId: fallbackTaskId,
      status: "failed",
      model: payload.model || MODEL_QUALITY,
      provider: "seedance",
      upstreamSource: "direct",
      source: "volcengine-compatible",
      kind: "advanced-video",
      userId: auth.user.id,
      prompt,
      finalPrompt: prompt,
      params: requestParams,
      upstreamPayload: payload,
      ratio: requestParams.ratio || payload.ratio || "",
      resolution: requestParams.resolution || payload.resolution || "",
      duration: requestParams.duration || payload.duration || "",
      error: error.message || "Upstream submit failed.",
      preDeductedCredits: cost,
      originalPreDeductedCredits: pricing.originalCredits,
      finalCredits: 0,
      originalFinalCredits: 0,
      userPricingMultiplier: pricing.userPricingMultiplier,
      billingStatus: cost > 0 ? "refunded" : "free",
      billingSettledAt: new Date().toISOString(),
      billingError: "",
      pricingEstimate: pricing,
      createResponse: error.payload || null,
      awaitingUpstreamTask: false,
      apiTokenId: auth.tokenRecord?.id || "",
      apiTokenName: auth.tokenRecord?.name || "",
      apiTokenType: auth.tokenRecord?.quotaType || "",
      apiTokenSource: auth.tokenSource || "",
    });
    if (cost > 0) {
      await changeUserCredits(auth.db, auth.user.id, cost, "volcengine_generation_submit_refund", {
        taskId: fallbackTaskId,
        provider: "seedance",
        reason: error.message || "submit failed",
      });
      await recordSubtokenAdjustment(auth, {
        taskId: fallbackTaskId,
        type: "volcengine_generation_submit_refund",
        amount: -cost,
        meta: { provider: "seedance", reason: error.message || "submit failed" },
      });
      if (!dbEnabled()) await writeDb(auth.db);
    }
    return sendJson(res, error.statusCode || 502, {
      error: {
        code: error.code || "UPSTREAM_SUBMIT_FAILED",
        message: error.message || "Upstream submit failed.",
      },
      detail: error.payload?.error?.message || error.payload?.message || "",
    });
  }
}

async function handleVolcengineGetGenerationTask(req, res, taskId) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const record = await findOwnGenerationRecordByTaskId(auth, taskId);
  if (!record) {
    return sendJson(res, 404, { error: { code: "TASK_NOT_FOUND", message: "Generation task not found." } });
  }
  const upstreamTaskId = record.upstreamTaskId || record.taskId;
  let raw = record.queryResponse || record.createResponse || officialSeedanceResponseFromRecord(record);
  if (ARK_API_KEY && shouldRefreshGenerationRecord(record)) {
    try {
      raw = await arkRequest("GET", `/contents/generations/tasks/${encodeURIComponent(upstreamTaskId)}`);
      const task = normalizeTask(raw);
      await upsertAndSettleGenerationRecord({
        taskId: record.taskId,
        upstreamTaskId: task.taskId || upstreamTaskId,
        status: task.status || record.status || "unknown",
        remoteVideoUrl: task.videoUrl || record.remoteVideoUrl || "",
        error: task.error || "",
        queryResponse: raw,
      }, "volcengine-query");
    } catch (error) {
      raw = record.queryResponse || record.createResponse || officialSeedanceResponseFromRecord(record);
    }
  } else if (needsSeedanceFailureRefund(record) || (seedanceUsesTokenPricing(record) && isSucceededStatus(record.status) && !record.billingSettledAt)) {
    await settleSeedanceGenerationRecord(record, "volcengine-query");
  }
  return sendJson(res, 200, raw);
}

function normalizeWan27Resolution(value = "") {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "1080P") return "1080P";
  return "720P";
}

function optionalWan27Seed(value) {
  if (value === undefined || value === null || value === "") return null;
  const seed = Number(value);
  if (!Number.isFinite(seed) || seed < 0) return null;
  return Math.min(2147483647, Math.floor(seed));
}

function normalizeWan27Task(raw = {}) {
  const output = raw.output || raw.data?.output || raw.data || raw;
  const task = raw.task || raw.data?.task || {};
  return {
    taskId:
      output.task_id ||
      output.taskId ||
      task.task_id ||
      task.taskId ||
      raw.task_id ||
      raw.taskId ||
      raw.id ||
      "",
    status:
      output.task_status ||
      output.status ||
      task.task_status ||
      task.status ||
      raw.task_status ||
      raw.status ||
      "unknown",
    videoUrl:
      output.video_url ||
      output.videoUrl ||
      output.results?.[0]?.url ||
      output.results?.[0]?.video_url ||
      findVideoUrl(raw) ||
      "",
    error:
      output.message ||
      output.error_message ||
      output.error?.message ||
      raw.message ||
      raw.error_message ||
      raw.error?.message ||
      "",
  };
}

async function aliyunDashscopeRequest(pathname, { method = "POST", body = null, asyncTask = false } = {}) {
  if (!ALIYUN_DASHSCOPE_API_KEY) {
    const error = new Error("Wan2.7 generation is not configured.");
    error.statusCode = 503;
    error.code = "MISSING_ALIYUN_DASHSCOPE_API_KEY";
    throw error;
  }
  const response = await fetch(`${ALIYUN_DASHSCOPE_BASE_URL}${pathname}`, {
    method,
    headers: {
      authorization: `Bearer ${ALIYUN_DASHSCOPE_API_KEY}`,
      accept: "application/json",
      ...(body ? { "content-type": "application/json" } : {}),
      ...(body && ALIYUN_DASHSCOPE_DATA_INSPECTION_HEADER ? { "X-DashScope-DataInspection": ALIYUN_DASHSCOPE_DATA_INSPECTION_HEADER } : {}),
      ...(asyncTask ? { "X-DashScope-Async": "enable" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(180000),
  });
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { text };
  }
  if (!response.ok || payload.code >= 400) {
    const error = new Error(payload.message || payload.error?.message || payload.output?.message || `Wan2.7 request failed: ${response.status}`);
    error.statusCode = response.status || 502;
    error.payload = payload;
    error.code = payload.code || payload.error?.code || "";
    throw error;
  }
  return payload;
}

function normalizeWan27MediaItem(item = {}) {
  const type = String(item.type || "").trim();
  const url = String(item.url || "").trim();
  if (!type || !isPublicHttpUrl(url)) {
    const error = new Error(`Wan2.7 ${type || "media"} requires a public URL.`);
    error.statusCode = 400;
    throw error;
  }
  return { type, url };
}

async function dataUrlForUserAsset(asset = {}) {
  if (!asset?.localUrl) return "";
  const localPath = path.normalize(path.join(ROOT, String(asset.localUrl || "").replace(/^\//, "")));
  if (!localPath.startsWith(ROOT)) {
    const error = new Error("Asset path is invalid.");
    error.statusCode = 400;
    throw error;
  }
  const bytes = await fs.readFile(localPath);
  return `data:${asset.mime || "application/octet-stream"};base64,${bytes.toString("base64")}`;
}

function validateWan27MediaCombination(media = []) {
  const types = media.map((item) => item.type).join("|");
  const valid = new Set([
    "first_frame",
    "first_frame|last_frame",
    "first_frame|driving_audio",
    "first_frame|last_frame|driving_audio",
    "first_clip",
    "first_clip|last_frame",
  ]);
  if (!valid.has(types)) {
    const error = new Error(`Wan2.7 unsupported media combination: ${types || "empty"}.`);
    error.statusCode = 400;
    throw error;
  }
}

async function submitWan27VideoTask({ prompt, imageUrl = "", media = [], body = {} }) {
  const source = { ...requestParamsFromBody(body), ...body };
  const normalizedMedia = Array.isArray(media) && media.length
    ? media.map(normalizeWan27MediaItem)
    : [normalizeWan27MediaItem({ type: "first_frame", url: imageUrl })];
  validateWan27MediaCombination(normalizedMedia);
  const wanBounds = advancedDurationBounds("wan27");
  const parameterExtras = plainObject(source.parameters);
  const inputExtras = plainObject(source.input);
  const duration = clampNumber(firstPresent(parameterExtras.duration, source.duration, source.durationSeconds), wanBounds.fallback, wanBounds.min, wanBounds.max);
  const seed = optionalWan27Seed(firstPresent(parameterExtras.seed, source.seed));
  const parameters = {
    ...parameterExtras,
    resolution: normalizeWan27Resolution(firstPresent(parameterExtras.resolution, source.resolution)),
    duration,
    prompt_extend: boolFromRequest(firstPresent(parameterExtras.prompt_extend, source.prompt_extend, source.promptExtend), false),
    watermark: boolFromRequest(firstPresent(parameterExtras.watermark, source.watermark), false),
  };
  if (seed !== null) parameters.seed = seed;

  const payload = {
    model: String(firstPresent(source.model, ALIYUN_WAN27_MODEL)),
    input: {
      ...inputExtras,
      prompt,
      media: normalizedMedia,
    },
    parameters,
  };
  if (source.promptExtendText || source.prompt_extend_text || parameterExtras.prompt_extend_text) {
    payload.parameters.prompt_extend = true;
    payload.parameters.prompt_extend_text = String(firstPresent(parameterExtras.prompt_extend_text, source.prompt_extend_text, source.promptExtendText));
  }
  console.log("[wan27-submit-advanced]", JSON.stringify({
    model: payload.model,
    mediaTypes: payload.input.media.map((item) => item.type),
    mediaHosts: payload.input.media.map((item) => {
      try {
        return new URL(item.url).host;
      } catch {
        return "";
      }
    }),
    promptLength: prompt.length,
    parameters,
  }, null, 2));
  const raw = await aliyunDashscopeRequest("/api/v1/services/aigc/video-generation/video-synthesis", {
    method: "POST",
    body: payload,
    asyncTask: true,
  });
  return { task: normalizeWan27Task(raw), payload, raw };
}

function normalizeWan27ImageTask(raw = {}) {
  const output = raw.output || raw.data?.output || raw.data || raw;
  const imageUrls = collectOutputImageUrls(raw);
  return {
    taskId: output.task_id || output.taskId || raw.task_id || raw.taskId || raw.request_id || raw.requestId || "",
    status: output.task_status || output.status || raw.task_status || raw.status || (imageUrls.length ? "completed" : "pending"),
    imageUrls,
    error: output.message || output.error_message || output.error?.message || raw.message || raw.error_message || raw.error?.message || "",
  };
}

async function resolveWan27ImageResult(raw = {}, { timeoutMs = 10 * 60 * 1000, pollIntervalMs = 3000 } = {}) {
  let task = normalizeWan27ImageTask(raw);
  if ((task.imageUrls.length && isCompletedStatus(task.status)) || (task.imageUrls.length && !task.taskId)) return task;
  if (isFailedStatus(task.status)) return task;
  if (!task.taskId) return task;

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await delay(pollIntervalMs);
    const queried = await aliyunDashscopeRequest(`/api/v1/tasks/${encodeURIComponent(task.taskId)}`, {
      method: "GET",
    });
    task = normalizeWan27ImageTask(queried);
    if (task.imageUrls.length && isCompletedStatus(task.status)) return task;
    if (isFailedStatus(task.status)) return task;
  }
  return task;
}

function wan27ImageRequestOptions(body = {}, { defaultModel = WAN27_IMAGE_PRO_MODEL, defaultRatio = "9:16", defaultResolution = "2K" } = {}) {
  const source = { ...requestParamsFromBody(body), ...body };
  const ratio = normalizeWan27ImageRatio(firstPresent(source.ratio, source.aspect_ratio, defaultRatio));
  const resolution = normalizeWan27ImageResolution(firstPresent(source.resolution, defaultResolution));
  const parameters = {
    ...plainObject(source.parameters),
    ...plainObject(source.parameter),
  };
  if (firstPresent(source.size, parameters.size) !== undefined) parameters.size = String(firstPresent(source.size, parameters.size));
  else parameters.size = wan27ImageSize(resolution, ratio);
  parameters.n = Number(firstPresent(parameters.n, source.n, 1)) || 1;
  parameters.watermark = boolFromRequest(firstPresent(parameters.watermark, source.watermark), false);
  return {
    model: String(firstPresent(source.model, defaultModel, WAN27_IMAGE_PRO_MODEL)),
    ratio,
    resolution,
    input: plainObject(source.input),
    parameters,
  };
}

function exposedWan27ImageParams(imageOptions = {}) {
  const parameters = { ...plainObject(imageOptions.parameters) };
  const size = parameters.size;
  delete parameters.size;
  return {
    ratio: imageOptions.ratio,
    resolution: imageOptions.resolution,
    model: imageOptions.model,
    ...(size ? { size } : {}),
    ...(Object.keys(parameters).length ? { parameters } : {}),
  };
}

async function submitWan27ImageModify({
  imageUrl,
  imageUrls,
  prompt,
  ratio = "9:16",
  resolution = "2K",
  model = WAN27_IMAGE_PRO_MODEL,
  input = {},
  parameters = {},
} = {}) {
  const orderedImages = arrayFromBody(imageUrls).map((item) => String(item || "").trim()).filter(Boolean);
  if (!orderedImages.length && imageUrl) orderedImages.push(String(imageUrl || "").trim());
  if (orderedImages.length > 9) {
    const error = new Error("Wan2.7 image supports at most 9 input images.");
    error.statusCode = 400;
    error.code = "TOO_MANY_IMAGES";
    throw error;
  }
  const content = [
    ...orderedImages.map((url) => ({ image: url })),
    { text: prompt },
  ];
  const payload = {
    model: model || WAN27_IMAGE_PRO_MODEL,
    input: {
      ...plainObject(input),
      messages: [
        {
          role: "user",
          content,
        },
      ],
    },
    parameters: {
      ...plainObject(parameters),
      size: firstPresent(parameters.size, wan27ImageSize(resolution, ratio)),
      n: firstPresent(parameters.n, 1),
      watermark: firstPresent(parameters.watermark, false),
    },
  };
  payload.parameters.n = Number(firstPresent(parameters.n, payload.parameters.n, 1)) || 1;
  payload.parameters.watermark = boolFromRequest(firstPresent(parameters.watermark, payload.parameters.watermark), false);
  const raw = await aliyunDashscopeRequest("/api/v1/services/aigc/image-generation/generation", {
    method: "POST",
    body: payload,
    asyncTask: true,
  });
  return { task: await resolveWan27ImageResult(raw), payload, raw };
}

async function submitWan27ImageTextGenerate({
  prompt,
  ratio = "9:16",
  resolution = "2K",
  model = WAN27_IMAGE_PRO_MODEL,
  input = {},
  parameters = {},
} = {}) {
  const payload = {
    model: model || WAN27_IMAGE_PRO_MODEL,
    input: {
      ...plainObject(input),
      messages: [
        {
          role: "user",
          content: [
            { text: prompt },
          ],
        },
      ],
    },
    parameters: {
      ...plainObject(parameters),
      size: firstPresent(parameters.size, wan27ImageSize(resolution, ratio)),
      n: firstPresent(parameters.n, 1),
      watermark: firstPresent(parameters.watermark, false),
    },
  };
  payload.parameters.n = Number(firstPresent(parameters.n, payload.parameters.n, 1)) || 1;
  payload.parameters.watermark = boolFromRequest(firstPresent(parameters.watermark, payload.parameters.watermark), false);
  const raw = await aliyunDashscopeRequest("/api/v1/services/aigc/image-generation/generation", {
    method: "POST",
    body: payload,
    asyncTask: true,
  });
  return { task: await resolveWan27ImageResult(raw), payload, raw };
}

async function refreshWan27GenerationRecord(record = {}, { download = false, reason = "query" } = {}) {
  const queryTaskId = record.upstreamTaskId || record.taskId;
  if (!queryTaskId) return record;
  const raw = await aliyunDashscopeRequest(`/api/v1/tasks/${encodeURIComponent(queryTaskId)}`, {
    method: "GET",
  });
  const task = normalizeWan27Task(raw);
  let localVideoUrl = record.localVideoUrl || "";
  let localVideoPath = record.localVideoPath || "";
  let localPosterUrl = record.localPosterUrl || "";
  let localPosterPath = record.localPosterPath || "";
  let cdnVideoUrl = record.cdnVideoUrl || "";
  let cdnPosterUrl = record.cdnPosterUrl || "";
  let cdnError = record.cdnError || "";
  let downloadError = "";
  const remoteVideoUrl = task.videoUrl || record.remoteVideoUrl || "";
  if (download && isSucceededStatus(task.status) && remoteVideoUrl) {
    try {
      const localVideo = await downloadGeneratedVideo(record.taskId, remoteVideoUrl);
      localVideoUrl = localVideo.localVideoUrl;
      localVideoPath = localVideo.localVideoPath;
      localPosterUrl = localVideo.localPosterUrl || localPosterUrl;
      localPosterPath = localVideo.localPosterPath || localPosterPath;
      cdnVideoUrl = localVideo.cdnVideoUrl || cdnVideoUrl;
      cdnPosterUrl = localVideo.cdnPosterUrl || cdnPosterUrl;
      cdnError = localVideo.cdnError || cdnError;
    } catch (error) {
      downloadError = error.message || "Failed to download generated video.";
    }
  }
  return upsertAndSettleGenerationRecord({
    taskId: record.taskId,
    upstreamTaskId: task.taskId || queryTaskId,
    status: task.status || record.status || "unknown",
    remoteVideoUrl,
    localVideoUrl,
    localVideoPath,
    localPosterUrl,
    localPosterPath,
    posterUrl: localPublicAssetStorageEnabled()
      ? (localPosterUrl || cdnPosterUrl || record.posterUrl || "")
      : (cdnPosterUrl || localPosterUrl || record.posterUrl || ""),
    cdnVideoUrl,
    cdnPosterUrl,
    cdnError,
    error: task.error || downloadError || record.error || "",
    queryResponse: raw,
    completedAt: isSucceededStatus(task.status) ? (record.completedAt || new Date().toISOString()) : record.completedAt || "",
  }, reason);
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
  const localSourcePublicUrl = publicUrlForAssetPath(sourceUrl);
  let uploaded = { publicUrl: localSourcePublicUrl, key: "" };
  if (!uploaded.publicUrl) {
    uploaded = await uploadBufferToTos({
      userId: "admin",
      assetId: `${item.id || "home-role"}-source`,
      bytes,
      mime: item.sourceImageMime || item.imageMime || imageMimeFromPath(sourcePath),
    });
  }
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
  if (item.referenceAssetUri && (!localPublicAssetStorageEnabled() || isLocalPublicAssetUrl(item.publicImageUrl))) return config;
  // Prefer the synthetic image as the reference, fall back to the local image.
  const localUrl = item.syntheticReferenceLocalUrl || item.localImageUrl || item.posterUrl;
  if (!localUrl || /^https?:\/\//i.test(localUrl)) {
    const error = new Error("The home image must be uploaded locally first before creating an upstream reference asset.");
    error.statusCode = 400;
    throw error;
  }

  const localPath = path.join(ROOT, localUrl.replace(/^\//, ""));
  const bytes = await fs.readFile(localPath);
  const localPublicUrl = publicUrlForAssetPath(localUrl);
  let uploaded = { publicUrl: localPublicUrl, key: "" };
  if (!uploaded.publicUrl) {
    uploaded = await uploadBufferToTos({
      userId: "admin",
      assetId: `${item.id || "home-video-reference"}-ref`,
      bytes,
      mime: item.imageMime || config.homeVideo?.imageMime || imageMimeFromPath(localPath),
    });
  }
  const created = await arkOpenApiAction("CreateAsset", {
    GroupId: ARK_OPENAPI.groupId,
    URL: uploaded.publicUrl,
    AssetType: "Image",
    Moderation: { Strategy: "Skip" },
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

const WAN27_MEDIA_MODE = new Set([
  "first_frame",
  "first_last_frame",
  "first_frame_audio",
  "first_last_frame_audio",
  "first_clip",
  "first_clip_last_frame",
]);

function normalizeWan27MediaMode(value = "") {
  const normalized = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (["image", "single_image", "first", "single"].includes(normalized)) return "first_frame";
  if (["multi_image", "two_images", "first_last", "first_and_last", "last_frame"].includes(normalized)) return "first_last_frame";
  if (["image_audio", "audio", "first_audio", "first_and_audio"].includes(normalized)) return "first_frame_audio";
  if (["multi_image_audio", "two_images_audio", "first_last_audio", "first_last_and_audio"].includes(normalized)) return "first_last_frame_audio";
  if (["extend", "video", "clip", "continue", "continuation"].includes(normalized)) return "first_clip";
  if (["extend_last", "clip_last", "video_last", "continuation_last"].includes(normalized)) return "first_clip_last_frame";
  return WAN27_MEDIA_MODE.has(normalized) ? normalized : "first_frame";
}

function wan27ModeNeedsFirstFrame(mode) {
  return ["first_frame", "first_last_frame", "first_frame_audio", "first_last_frame_audio"].includes(normalizeWan27MediaMode(mode));
}

function wan27ModeNeedsLastFrame(mode) {
  return ["first_last_frame", "first_last_frame_audio", "first_clip_last_frame"].includes(normalizeWan27MediaMode(mode));
}

function wan27ModeNeedsAudio(mode) {
  return ["first_frame_audio", "first_last_frame_audio"].includes(normalizeWan27MediaMode(mode));
}

function wan27ModeNeedsClip(mode) {
  return ["first_clip", "first_clip_last_frame"].includes(normalizeWan27MediaMode(mode));
}

function wan27MediaSlotsForMode(mode) {
  const normalizedMode = normalizeWan27MediaMode(mode);
  const slots = [];
  if (wan27ModeNeedsFirstFrame(normalizedMode)) slots.push({ key: "firstFrame", type: "first_frame", mediaKind: "image", label: "First frame" });
  if (wan27ModeNeedsClip(normalizedMode)) slots.push({ key: "firstClip", type: "first_clip", mediaKind: "video", label: "First clip" });
  if (wan27ModeNeedsLastFrame(normalizedMode)) slots.push({ key: "lastFrame", type: "last_frame", mediaKind: "image", label: "Last frame" });
  if (wan27ModeNeedsAudio(normalizedMode)) slots.push({ key: "drivingAudio", type: "driving_audio", mediaKind: "audio", label: "Driving audio" });
  return slots;
}

function mediaUrlFromBody(body = {}, key = "") {
  return String(body[`${key}Url`] || body[`${key}_url`] || body[`${key}MediaUrl`] || "").trim();
}

function mediaDataUrlFromBody(body = {}, key = "") {
  return String(body[`${key}DataUrl`] || body[`${key}_dataUrl`] || body[`${key}_data_url`] || "");
}

function mediaFileNameFromBody(body = {}, key = "") {
  return String(body[`${key}FileName`] || body[`${key}_fileName`] || body[`${key}_file_name`] || "");
}

function mediaAssetIdFromBody(body = {}, key = "") {
  return String(body[`${key}AssetId`] || body[`${key}_assetId`] || body[`${key}_asset_id`] || "").trim();
}

function arrayFromBody(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

const SEEDANCE_MEDIA_MODES = new Set([
  "text_to_video",
  "first_frame",
  "first_last_frame",
  "reference_images",
  "reference_video",
]);

function normalizeSeedanceMode(value = "", body = {}) {
  const raw = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (["text", "txt", "t2v", "text_video", "text_to_video"].includes(raw)) return "text_to_video";
  if (["image", "i2v", "image_to_video", "first", "first_image", "first_frame", "image_url", "single_image"].includes(raw)) return "first_frame";
  if (["first_last", "first_last_frame", "first_and_last", "start_end", "start_end_frame", "image_to_video_end", "end_image", "last_frame"].includes(raw)) return "first_last_frame";
  if (["reference", "references", "reference_image", "reference_images", "multi_reference", "multi_images"].includes(raw)) return "reference_images";
  if (["reference_video", "video_reference", "video"].includes(raw)) return "reference_video";
  if (SEEDANCE_MEDIA_MODES.has(raw)) return raw;

  const merged = body || {};
  if (firstPresent(
    merged.endImageUrl,
    merged.end_image_url,
    merged.lastFrameUrl,
    merged.last_frame_url,
    merged.endImageDataUrl,
    merged.lastFrameDataUrl,
    merged.endImageAssetId,
    merged.lastFrameAssetId,
  )) return "first_last_frame";
  if (firstPresent(
    merged.image_url,
    merged.imageUrl,
    merged.firstFrameUrl,
    merged.first_frame_url,
    merged.imageDataUrl,
    merged.firstFrameDataUrl,
    merged.imageAssetId,
    merged.firstFrameAssetId,
  )) return "first_frame";
  if (
    seedanceReferenceVideoAssetIdsFromBody(merged).length ||
    seedanceReferenceVideoUrlInputsFromBody(merged).length ||
    Array.isArray(merged.reference_videos)
  ) return "reference_video";
  if (
    arrayFromBody(merged.referenceImages).length ||
    arrayFromBody(merged.referenceImageDataUrls).length ||
    arrayFromBody(merged.referenceImageAssetUris).length ||
    arrayFromBody(merged.seedanceReferenceAssetUris).length ||
    arrayFromBody(merged.referenceImages).some((item) => (
      typeof item === "object" && item && (item.assetUri || item.referenceAssetUri || item.seedanceAssetUri)
    )) ||
    firstPresent(merged.reference_images, merged.seedanceReferenceAssetUri, merged.seedanceCharacterAssetUri, merged.userAssetId, merged.referenceImageAssetId)
  ) return "reference_images";
  return "text_to_video";
}

function seedanceModeNeedsFirstFrame(mode) {
  return ["first_frame", "first_last_frame"].includes(normalizeSeedanceMode(mode));
}

function seedanceModeNeedsEndFrame(mode) {
  return normalizeSeedanceMode(mode) === "first_last_frame";
}

function seedanceFirstFrameInputFromBody(body = {}, { includeDataUrlFallback = false, includeUserAssetId = false } = {}) {
  const assetId = String(firstPresent(body.firstFrameAssetId, body.first_frame_asset_id, body.imageAssetId, body.image_asset_id, includeUserAssetId ? body.userAssetId : "") || "").trim();
  if (assetId) return { assetId, name: "Seedance first frame" };
  const dataUrl = String(firstPresent(
    body.firstFrameDataUrl,
    body.first_frame_data_url,
    body.imageDataUrl,
    body.image_data_url,
    includeDataUrlFallback ? body.dataUrl : "",
  ) || "");
  if (dataUrl) {
    return {
      dataUrl,
      fileName: firstPresent(body.firstFrameFileName, body.imageFileName, body.fileName, ""),
      name: "Seedance first frame",
    };
  }
  const url = String(firstPresent(
    body.firstFrameUrl,
    body.first_frame_url,
    body.imageUrl,
    body.image_url_public,
    isPublicHttpUrl(body.image_url) ? body.image_url : "",
  ) || "").trim();
  if (url) {
    return {
      url,
      fileName: firstPresent(body.firstFrameFileName, body.imageFileName, body.fileName, ""),
      name: "Seedance first frame",
    };
  }
  return null;
}

function seedanceEndFrameInputFromBody(body = {}) {
  const assetId = String(firstPresent(body.endImageAssetId, body.end_image_asset_id, body.lastFrameAssetId, body.last_frame_asset_id) || "").trim();
  if (assetId) return { assetId, name: "Seedance end frame" };
  const dataUrl = String(firstPresent(body.endImageDataUrl, body.end_image_data_url, body.lastFrameDataUrl, body.last_frame_data_url) || "");
  if (dataUrl) {
    return {
      dataUrl,
      fileName: firstPresent(body.endImageFileName, body.lastFrameFileName, body.fileName, ""),
      name: "Seedance end frame",
    };
  }
  const url = String(firstPresent(
    body.endImageUrl,
    body.end_image_public_url,
    body.lastFrameUrl,
    body.last_frame_url,
    isPublicHttpUrl(body.end_image_url) ? body.end_image_url : "",
  ) || "").trim();
  if (url) {
    return {
      url,
      fileName: firstPresent(body.endImageFileName, body.lastFrameFileName, body.fileName, ""),
      name: "Seedance end frame",
    };
  }
  return null;
}

async function createSingleSeedanceImageAssetFromInput(db, user, input, { name = "Seedance frame" } = {}) {
  if (!input) return null;
  const assets = await createUserImageAssetsFromInputs(db, user, [{ ...input, name: input.name || name }], { name });
  const asset = assets[0] || null;
  if (asset) validateWan27MediaKind(asset, "image", name);
  return asset;
}

function seedanceReferenceInputsFromBody(body = {}, { includeDataUrlFallback = true } = {}) {
  const inputs = [
    ...arrayFromBody(body.referenceImages),
    ...arrayFromBody(body.referenceImageDataUrls),
  ];
  const filteredInputs = inputs.filter((item) => {
    if (!item) return false;
    if (typeof item === "string") {
      const text = item.trim();
      return text && !text.startsWith("asset://");
    }
    return item.dataUrl || item.assetId || item.url || item.imageUrl;
  });
  if (filteredInputs.length > ADVANCED_SEEDANCE_REFERENCE_LIMIT) {
    const error = new Error(`Seedance supports up to ${ADVANCED_SEEDANCE_REFERENCE_LIMIT} reference images.`);
    error.statusCode = 400;
    throw error;
  }
  if (filteredInputs.length) return filteredInputs;
  const fallbackInputs = [
    includeDataUrlFallback && body.dataUrl ? { dataUrl: body.dataUrl, fileName: body.fileName || "", name: "Advanced reference 1" } : null,
    ...seedanceExtraReferenceInputsFromBody(body),
  ].filter(Boolean);
  if (fallbackInputs.length > ADVANCED_SEEDANCE_REFERENCE_LIMIT) {
    const error = new Error(`Seedance supports up to ${ADVANCED_SEEDANCE_REFERENCE_LIMIT} reference images.`);
    error.statusCode = 400;
    throw error;
  }
  return fallbackInputs;
}

function seedanceExtraReferenceInputsFromBody(body = {}) {
  const inputs = [
    ...arrayFromBody(body.extraReferenceDataUrls),
    ...arrayFromBody(body.extraReferenceImages),
    ...arrayFromBody(body.extraDataUrls),
    ...arrayFromBody(body.referenceDataUrls),
  ].filter((item) => {
    if (!item) return false;
    if (typeof item === "string") {
      const text = item.trim();
      return text && !text.startsWith("asset://");
    }
    return item.dataUrl || item.assetId || item.url || item.imageUrl;
  });
  if (inputs.length > ADVANCED_SEEDANCE_REFERENCE_LIMIT) {
    const error = new Error(`Seedance supports up to ${ADVANCED_SEEDANCE_REFERENCE_LIMIT} reference images.`);
    error.statusCode = 400;
    throw error;
  }
  return inputs;
}

function seedanceExtraReferenceAssetIdsFromBody(body = {}) {
  const assetIds = [
    ...arrayFromBody(body.extraReferenceAssetIds),
    ...arrayFromBody(body.extraUserAssetIds),
  ].map((item) => String(item || "").trim()).filter(Boolean);
  if (assetIds.length > ADVANCED_SEEDANCE_REFERENCE_LIMIT) {
    const error = new Error(`Seedance supports up to ${ADVANCED_SEEDANCE_REFERENCE_LIMIT} reference images.`);
    error.statusCode = 400;
    throw error;
  }
  return assetIds;
}

function seedanceReferenceAssetIdsFromBody(body = {}, { includeUserAssetId = true, includeImageAssetId = true } = {}) {
  const assetIds = [
    includeUserAssetId ? body.userAssetId : "",
    body.referenceImageAssetId,
    includeImageAssetId ? body.imageAssetId : "",
    ...seedanceExtraReferenceAssetIdsFromBody(body),
  ].map((item) => String(item || "").trim()).filter(Boolean);
  if (assetIds.length > ADVANCED_SEEDANCE_REFERENCE_LIMIT) {
    const error = new Error(`Seedance supports up to ${ADVANCED_SEEDANCE_REFERENCE_LIMIT} reference images.`);
    error.statusCode = 400;
    throw error;
  }
  return assetIds;
}

function seedanceReferenceAssetUrisFromBody(body = {}) {
  const explicitInputs = [
    body.seedanceCharacterAssetUri,
    body.seedanceReferenceAssetUri,
    ...arrayFromBody(body.seedanceReferenceAssetUris),
    ...arrayFromBody(body.referenceImageAssetUris),
  ].map((item) => String(item || "").trim()).filter(Boolean);
  const referenceImageInputs = [
    ...arrayFromBody(body.referenceImages).map((item) => (
      typeof item === "string"
        ? (item.trim().startsWith("asset://") ? item : "")
        : (item?.assetId || item?.userAssetId || item?.imageAssetId
          ? ""
          : String(item?.assetUri || item?.referenceAssetUri || item?.seedanceAssetUri || ""))
    )),
  ].map((item) => String(item || "").trim()).filter(Boolean);
  const inputs = [...explicitInputs, ...referenceImageInputs];
  const invalid = inputs.find((uri) => !uri.startsWith("asset://"));
  if (invalid) {
    const error = new Error("Seedance reference assetUri must start with asset://.");
    error.statusCode = 400;
    throw error;
  }
  const unique = [...new Set(inputs)];
  if (unique.length > ADVANCED_SEEDANCE_REFERENCE_LIMIT) {
    const error = new Error(`Seedance supports up to ${ADVANCED_SEEDANCE_REFERENCE_LIMIT} reference images.`);
    error.statusCode = 400;
    throw error;
  }
  return unique;
}

function seedanceReferenceVideoAssetIdsFromBody(body = {}) {
  const ids = [
    body.referenceVideoAssetId,
    body.videoAssetId,
    body.firstClipAssetId,
    ...arrayFromBody(body.referenceVideoAssetIds),
    ...arrayFromBody(body.videoAssetIds),
  ].map((item) => String(item || "").trim()).filter(Boolean);
  if (ids.length > ADVANCED_SEEDANCE_VIDEO_REFERENCE_LIMIT) {
    const error = new Error(`Seedance supports up to ${ADVANCED_SEEDANCE_VIDEO_REFERENCE_LIMIT} reference videos.`);
    error.statusCode = 400;
    throw error;
  }
  return ids;
}

function seedanceReferenceVideoUrlInputsFromBody(body = {}) {
  const inputs = [
    ...arrayFromBody(body.referenceVideos),
    ...arrayFromBody(body.referenceVideoUrls),
    ...arrayFromBody(body.videoUrls),
  ].filter((item) => {
    if (!item) return false;
    if (typeof item === "string") return item.trim();
    return item.url || item.videoUrl || item.video_url || item.assetUri;
  });
  if (inputs.length > ADVANCED_SEEDANCE_VIDEO_REFERENCE_LIMIT) {
    const error = new Error(`Seedance supports up to ${ADVANCED_SEEDANCE_VIDEO_REFERENCE_LIMIT} reference videos.`);
    error.statusCode = 400;
    throw error;
  }
  return inputs.map((item) => {
    if (typeof item === "string") return item.trim();
    return String(item.url || item.videoUrl || item.video_url || item.assetUri || "").trim();
  }).filter(Boolean);
}

function durationSecondsFromValue(value, fallback = 0) {
  return pricingNumber(value, fallback, 0, 4);
}

function seedanceVideoInputDurationFromItem(item = {}) {
  if (!item || typeof item !== "object") return 0;
  return durationSecondsFromValue(firstPresent(
    item.durationSeconds,
    item.duration,
    item.inputVideoSeconds,
    item.inputVideoDurationSeconds,
    item.inputVideoDuration,
    item.videoDurationSeconds,
    item.videoDuration,
  ));
}

function seedanceExplicitVideoInputSecondsFromBody(body = {}) {
  return durationSecondsFromValue(firstPresent(
    body.inputVideoSeconds,
    body.inputVideoDurationSeconds,
    body.inputVideoDuration,
    body.referenceVideoSeconds,
    body.referenceVideoDurationSeconds,
    body.referenceVideoDuration,
    body.videoInputSeconds,
    body.videoDurationSeconds,
    body.videoDuration,
    body.sourceVideoDurationSeconds,
  ));
}

function seedanceReferenceVideoUrlItemsFromBody(body = {}) {
  return [
    ...arrayFromBody(body.referenceVideos),
    ...arrayFromBody(body.referenceVideoUrls),
    ...arrayFromBody(body.videoUrls),
    ...arrayFromBody(body.reference_videos),
  ].filter((item) => {
    if (!item) return false;
    if (typeof item === "string") return item.trim();
    return item.url || item.videoUrl || item.video_url || item.assetUri;
  });
}

function seedanceReferenceVideoInputCountFromBody(body = {}) {
  const scalarIds = [
    body.referenceVideoAssetId,
    body.videoAssetId,
    body.firstClipAssetId,
  ].map((item) => String(item || "").trim()).filter(Boolean).length;
  const arrayIds = [
    ...arrayFromBody(body.referenceVideoAssetIds),
    ...arrayFromBody(body.videoAssetIds),
  ].map((item) => String(item || "").trim()).filter(Boolean).length;
  const arrayVideos = seedanceReferenceVideoUrlItemsFromBody(body).length;
  return scalarIds + arrayIds + arrayVideos;
}

function seedanceVideoInputSecondsFromBody(body = {}, { fallbackSeconds = 0 } = {}) {
  const videoItems = seedanceReferenceVideoUrlItemsFromBody(body);
  const itemDurations = videoItems.map(seedanceVideoInputDurationFromItem);
  const floorSeconds = durationSecondsFromValue(fallbackSeconds);
  const knownSeconds = itemDurations.reduce((sum, seconds) => {
    const value = durationSecondsFromValue(seconds);
    return value > 0 ? sum + Math.max(value, floorSeconds) : sum;
  }, 0);
  const unknownCount = itemDurations.filter((seconds) => !seconds).length;
  if (knownSeconds > 0 || unknownCount > 0) {
    return durationSecondsFromValue(knownSeconds + unknownCount * floorSeconds);
  }
  return 0;
}

function seedanceVideoInputSecondsFromAssets(assets = [], { fallbackSeconds = 0, expectedCount = null } = {}) {
  const list = (assets || []).filter(Boolean);
  const floorSeconds = durationSecondsFromValue(fallbackSeconds);
  const knownSeconds = list.reduce((sum, asset) => {
    const seconds = durationSecondsFromValue(firstPresent(asset?.durationSeconds, asset?.duration));
    return seconds > 0 ? sum + Math.max(seconds, floorSeconds) : sum;
  }, 0);
  const knownCount = list.filter((asset) => durationSecondsFromValue(firstPresent(asset?.durationSeconds, asset?.duration)) > 0).length;
  const totalCount = expectedCount === null || expectedCount === undefined ? list.length : Math.max(0, Number(expectedCount || 0));
  const unknownCount = Math.max(0, totalCount - knownCount);
  return durationSecondsFromValue(knownSeconds + unknownCount * floorSeconds);
}

function seedanceVideoInputSecondsForPricing(body = {}, { requestParams = {}, assets = [], assetIds = [] } = {}) {
  const explicitTotal = seedanceExplicitVideoInputSecondsFromBody(body);
  const fallbackSeconds = durationSecondsFromValue(requestParams.duration, advancedDurationBounds("seedance").fallback);
  const assetSeconds = seedanceVideoInputSecondsFromAssets(assets, {
    fallbackSeconds,
    expectedCount: Math.max(arrayFromBody(assetIds).filter(Boolean).length, (assets || []).filter(Boolean).length),
  });
  const urlSeconds = seedanceVideoInputSecondsFromBody(body, { fallbackSeconds });
  const minimumSeconds = durationSecondsFromValue(assetSeconds + urlSeconds);
  return durationSecondsFromValue(Math.max(explicitTotal, minimumSeconds));
}

async function seedanceVideoInputSecondsForPricingWithProbe(body = {}, { requestParams = {}, assets = [], assetIds = [] } = {}) {
  const fallbackSeconds = durationSecondsFromValue(requestParams.duration, advancedDurationBounds("seedance").fallback);
  const videoItems = seedanceReferenceVideoUrlItemsFromBody(body);
  const explicitTotal = seedanceExplicitVideoInputSecondsFromBody(body);
  if (!videoItems.length) {
    return seedanceVideoInputSecondsForPricing(body, { requestParams, assets, assetIds });
  }
  const probedItems = [];
  for (const item of videoItems) {
    if (item && typeof item === "object" && seedanceVideoInputDurationFromItem(item) > 0) {
      probedItems.push(item);
      continue;
    }
    const url = typeof item === "string"
      ? item.trim()
      : String(item?.url || item?.videoUrl || item?.video_url || item?.assetUri || "").trim();
    const probedSeconds = await probeVideoDurationSeconds(url);
    probedItems.push(item && typeof item === "object"
      ? { ...item, durationSeconds: probedSeconds || undefined }
      : { url, durationSeconds: probedSeconds || undefined });
  }
  const probedMinimumSeconds = seedanceVideoInputSecondsForPricing({
    ...body,
    inputVideoSeconds: undefined,
    inputVideoDurationSeconds: undefined,
    inputVideoDuration: undefined,
    referenceVideoSeconds: undefined,
    referenceVideoDurationSeconds: undefined,
    referenceVideoDuration: undefined,
    videoInputSeconds: undefined,
    videoDurationSeconds: undefined,
    videoDuration: undefined,
    sourceVideoDurationSeconds: undefined,
    referenceVideos: probedItems,
    referenceVideoUrls: [],
    videoUrls: [],
    reference_videos: [],
  }, { requestParams: { ...requestParams, duration: fallbackSeconds }, assets, assetIds });
  return durationSecondsFromValue(Math.max(explicitTotal, probedMinimumSeconds));
}

function seedanceReferenceAudioAssetIdsFromBody(body = {}) {
  const ids = [
    body.referenceAudioAssetId,
    body.audioAssetId,
    body.drivingAudioAssetId,
    ...arrayFromBody(body.referenceAudioAssetIds),
    ...arrayFromBody(body.audioAssetIds),
  ].map((item) => String(item || "").trim()).filter(Boolean);
  if (ids.length > ADVANCED_SEEDANCE_AUDIO_REFERENCE_LIMIT) {
    const error = new Error(`Seedance supports up to ${ADVANCED_SEEDANCE_AUDIO_REFERENCE_LIMIT} reference audios.`);
    error.statusCode = 400;
    throw error;
  }
  return ids;
}

function seedanceReferenceAudioInputsFromBody(body = {}) {
  const inputs = [
    ...arrayFromBody(body.referenceAudios),
    ...arrayFromBody(body.referenceAudioUrls),
  ].filter((item) => {
    if (!item) return false;
    if (typeof item === "string") return item.trim();
    return item.url || item.audioUrl || item.audio_url || item.assetUri;
  });
  if (inputs.length > ADVANCED_SEEDANCE_AUDIO_REFERENCE_LIMIT) {
    const error = new Error(`Seedance supports up to ${ADVANCED_SEEDANCE_AUDIO_REFERENCE_LIMIT} reference audios.`);
    error.statusCode = 400;
    throw error;
  }
  return inputs.map((item) => {
    if (typeof item === "string") return item.trim();
    return String(item.url || item.audioUrl || item.audio_url || item.assetUri || "").trim();
  }).filter(Boolean);
}

async function createUserImageAssetsFromInputs(db, user, inputs = [], { name = "Reference" } = {}) {
  const assets = [];
  for (let index = 0; index < inputs.length; index += 1) {
    const item = inputs[index];
    if (!item) continue;
    if (typeof item === "string") {
      const text = item.trim();
      if (!text || text.startsWith("asset://")) continue;
      if (isPublicHttpUrl(text)) {
        const pathname = new URL(text).pathname;
        const asset = await createUserMediaAssetFromPublicUrl(db, user, {
          url: text,
          fileName: path.basename(pathname) || "",
          name: `${name} ${index + 1}`,
        });
        validateWan27MediaKind(asset, "image", `${name} ${index + 1}`);
        assets.push(asset);
      } else {
        assets.push(await createUserAssetFromDataUrl(db, user, {
          dataUrl: text,
          name: `${name} ${index + 1}`,
        }));
      }
      continue;
    }
    if (item.dataUrl) {
      assets.push(await createUserAssetFromDataUrl(db, user, {
        dataUrl: item.dataUrl,
        fileName: item.fileName || "",
        name: item.name || `${name} ${index + 1}`,
      }));
    } else if (item.url || item.imageUrl) {
      const imageUrl = String(item.url || item.imageUrl || "").trim();
      if (!isPublicHttpUrl(imageUrl)) {
        const error = new Error("Reference image URL must be a public http(s) URL.");
        error.statusCode = 400;
        throw error;
      }
      const downloaded = await downloadRemoteFileToBuffer(imageUrl, {
        label: `reference image ${index + 1}`,
        maxBytes: 8 * 1024 * 1024,
        timeoutMs: 120000,
      });
      const pathname = new URL(imageUrl).pathname;
      const mime = String(downloaded.mime || "").startsWith("image/") ? downloaded.mime : imageMimeFromKnownPath(pathname);
      if (!String(mime || "").startsWith("image/") || !["image/jpeg", "image/png", "image/webp", "image/bmp"].includes(mime)) {
        const error = new Error("Reference image URL must point to an image file.");
        error.statusCode = 400;
        throw error;
      }
      assets.push(await createUserMediaAssetFromBytes(db, user, {
        bytes: downloaded.bytes,
        mime,
        fileName: item.fileName || path.basename(pathname) || "",
        name: item.name || `${name} ${index + 1}`,
        maxBytes: 8 * 1024 * 1024,
      }));
    } else if (item.assetId) {
      const asset = (db.userAssets || []).find((entry) => entry.id === String(item.assetId || "").trim() && entry.userId === user.id && !isSoftDeleted(entry));
      if (!asset) {
        const error = new Error("Reference image not found.");
        error.statusCode = 404;
        throw error;
      }
      assets.push(asset);
    }
  }
  return assets;
}

function validateWan27MediaKind(assetOrUrl = {}, expectedKind = "image", label = "Media") {
  const mime = String(assetOrUrl.mime || "").toLowerCase();
  if (mime) {
    if (expectedKind === "image" && !mime.startsWith("image/")) throw new Error(`${label} must be an image.`);
    if (expectedKind === "audio" && !mime.startsWith("audio/")) throw new Error(`${label} must be audio.`);
    if (expectedKind === "video" && !mime.startsWith("video/")) throw new Error(`${label} must be a video.`);
  }
  const url = String(assetOrUrl.url || assetOrUrl.publicUrl || assetOrUrl.localUrl || "");
  const ext = path.extname(url.split("?")[0]).toLowerCase();
  if (!mime && ext) {
    if (expectedKind === "image" && ![".jpg", ".jpeg", ".png", ".bmp", ".webp"].includes(ext)) throw new Error(`${label} must be an image URL.`);
    if (expectedKind === "audio" && ![".mp3", ".wav", ".m4a", ".aac", ".ogg"].includes(ext)) throw new Error(`${label} must be an audio URL.`);
    if (expectedKind === "video" && ![".mp4", ".webm", ".mov", ".m4v"].includes(ext)) throw new Error(`${label} must be a video URL.`);
  }
}

async function resolveWan27MediaSlot({ db, user, body, slot, fallbackAsset = null } = {}) {
  let asset = null;
  let url = mediaUrlFromBody(body, slot.key);
  const dataUrl = mediaDataUrlFromBody(body, slot.key);
  const assetId = mediaAssetIdFromBody(body, slot.key);
  if (!url && slot.key === "firstFrame" && body.dataUrl) {
    asset = fallbackAsset;
  } else if (dataUrl) {
    asset = await createUserWanMediaAssetFromDataUrl(db, user, {
      dataUrl,
      fileName: mediaFileNameFromBody(body, slot.key),
      name: `Wan ${slot.label}`,
    });
  } else if (assetId) {
    asset = (db.userAssets || []).find((entry) => entry.id === assetId && entry.userId === user.id && !isSoftDeleted(entry));
    if (!asset) {
      const error = new Error(`${slot.label} asset not found.`);
      error.statusCode = 404;
      throw error;
    }
  }

  if (asset) {
    validateWan27MediaKind(asset, slot.mediaKind, slot.label);
    asset = await ensurePublicUrlForUserMediaAsset(db, asset);
    url = publicUrlForLocalAsset(asset);
  }
  if (!url || !isPublicHttpUrl(url)) {
    const error = new Error(`Wan2.7 requires ${slot.label}.`);
    error.statusCode = 400;
    throw error;
  }
  validateWan27MediaKind({ url }, slot.mediaKind, slot.label);
  return {
    type: slot.type,
    url,
    key: slot.key,
    mediaKind: slot.mediaKind,
    userAssetId: asset?.id || "",
    localUrl: asset?.localUrl || "",
    mime: asset?.mime || "",
  };
}

async function resolveWan27Media({ db, user, body, requestParams, fallbackAsset = null } = {}) {
  const mediaMode = normalizeWan27MediaMode(requestParams.mediaMode || body.mediaMode || body.wanMode || body.wanMediaMode);
  const slots = wan27MediaSlotsForMode(mediaMode);
  const media = [];
  for (const slot of slots) {
    media.push(await resolveWan27MediaSlot({ db, user, body, slot, fallbackAsset }));
  }
  return { mediaMode, media };
}

function publicUrlForLocalAsset(asset = {}) {
  if (isPublicHttpUrl(asset.publicUrl)) return asset.publicUrl;
  return publicUrlForAssetPath(asset.localUrl);
}

async function ensurePublicUrlForUserMediaAsset(db, userAsset) {
  if (isPublicHttpUrl(userAsset.publicUrl) && (!localPublicAssetStorageEnabled() || !userAsset.localUrl)) return userAsset;
  const localPublicUrl = publicUrlForAssetPath(userAsset.localUrl);
  if (localPublicUrl) {
    userAsset.publicUrl = localPublicUrl;
    userAsset.updatedAt = new Date().toISOString();
    db.userAssets = (db.userAssets || []).map((asset) => (asset.id === userAsset.id ? userAsset : asset));
    if (dbEnabled()) await upsertUserAssetInDb(userAsset);
    else await writeDb(db);
    return userAsset;
  }

  const localPath = path.join(ROOT, String(userAsset.localUrl || "").replace(/^\//, ""));
  const bytes = await fs.readFile(localPath);
  const uploaded = await uploadBufferToTos({
    userId: userAsset.userId,
    assetId: `${userAsset.id}-wan`,
    bytes,
    mime: userAsset.mime || "application/octet-stream",
    extension: path.extname(localPath),
  });
  userAsset.publicUrl = uploaded.publicUrl;
  userAsset.publicTosKey = uploaded.key;
  userAsset.publicUploadedAt = new Date().toISOString();
  userAsset.updatedAt = new Date().toISOString();
  db.userAssets = (db.userAssets || []).map((asset) => (asset.id === userAsset.id ? userAsset : asset));
  if (dbEnabled()) await upsertUserAssetInDb(userAsset);
  else await writeDb(db);
  return userAsset;
}

function normalizeSeedreamImageSize(value) {
  return APIZ_SEEDREAM_IMAGE_SIZES.has(value) ? value : "auto_3K";
}

async function ensurePublicUrlForUserAsset(db, userAsset) {
  if (isPublicHttpUrl(userAsset.publicUrl) && (!localPublicAssetStorageEnabled() || !userAsset.localUrl)) return userAsset;
  const localPublicUrl = publicUrlForAssetPath(userAsset.localUrl);
  if (localPublicUrl) {
    userAsset.publicUrl = localPublicUrl;
    userAsset.updatedAt = new Date().toISOString();
    db.userAssets = (db.userAssets || []).map((asset) => (asset.id === userAsset.id ? userAsset : asset));
    if (dbEnabled()) await upsertUserAssetInDb(userAsset);
    else await writeDb(db);
    return userAsset;
  }

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
  if (dbEnabled()) await upsertUserAssetInDb(userAsset);
  else await writeDb(db);
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

function seedanceAssetTypeForUserAsset(userAsset = {}) {
  const mime = String(userAsset.mime || "").toLowerCase();
  if (mime.startsWith("video/")) return "Video";
  if (mime.startsWith("audio/")) return "Audio";
  return "Image";
}

function seedanceAssetCacheField(userAsset = {}) {
  const assetType = seedanceAssetTypeForUserAsset(userAsset);
  if (assetType === "Video") return "seedanceVideoAssetUri";
  if (assetType === "Audio") return "seedanceAudioAssetUri";
  return "assetUri";
}

async function ensureSeedanceAssetForUserAsset(db, userAsset) {
  const assetType = seedanceAssetTypeForUserAsset(userAsset);
  const cacheField = seedanceAssetCacheField(userAsset);
  if (userAsset[cacheField] && (!localPublicAssetStorageEnabled() || !userAsset.localUrl || isLocalPublicAssetUrl(userAsset.publicUrl))) return userAsset;

  const localPath = path.join(ROOT, userAsset.localUrl.replace(/^\//, ""));
  const bytes = await fs.readFile(localPath);
  const localPublicUrl = publicUrlForAssetPath(userAsset.localUrl);
  let uploaded = { publicUrl: localPublicUrl, key: "" };
  if (!uploaded.publicUrl) {
    uploaded = await uploadBufferToTos({
      userId: userAsset.userId,
      assetId: userAsset.id,
      bytes,
      mime: userAsset.mime || "image/png",
    });
  }
  const created = await arkOpenApiAction("CreateAsset", {
    GroupId: ARK_OPENAPI.groupId,
    URL: uploaded.publicUrl,
    AssetType: assetType,
    Moderation: { Strategy: "Skip" },
    Name: storageObjectName("user", userAsset.id),
    ProjectName: ARK_OPENAPI.projectName,
  });
  const assetId = extractAssetId(created);
  if (!assetId) {
    const error = new Error(`CreateAsset did not return asset id: ${JSON.stringify(created)}`);
    error.statusCode = 502;
    throw error;
  }

  if (assetType === "Video") {
    userAsset.seedanceVideoAssetId = assetId;
    userAsset.seedanceVideoAssetUri = `asset://${assetId}`;
  } else if (assetType === "Audio") {
    userAsset.seedanceAudioAssetId = assetId;
    userAsset.seedanceAudioAssetUri = `asset://${assetId}`;
  } else {
    userAsset.assetId = assetId;
    userAsset.assetUri = `asset://${assetId}`;
  }
  userAsset.publicUrl = uploaded.publicUrl;
  userAsset.tosKey = uploaded.key;
  userAsset.upstreamCreatedAt = new Date().toISOString();
  userAsset.updatedAt = new Date().toISOString();
  if (dbEnabled()) await upsertUserAssetInDb(userAsset);
  else await writeDb(db);
  return userAsset;
}

async function ensureSyntheticReferenceForUserAsset(db, userAsset) {
  if (!userAsset) return null;
  if (userAsset.syntheticReferenceAssetUri) return userAsset;

  const prepared = await ensureCharacterReferenceForRecord({
    id: userAsset.id,
    userId: userAsset.userId,
    name: userAsset.name || "Advanced reference",
    title: userAsset.name || "Advanced reference",
    sourceImageUrl: userAsset.sourceImageUrl || userAsset.localUrl,
    localImageUrl: userAsset.sourceImageUrl || userAsset.localUrl,
    posterUrl: userAsset.sourceImageUrl || userAsset.localUrl,
    sourceImageMime: userAsset.sourceImageMime || userAsset.mime || "",
    imageMime: userAsset.sourceImageMime || userAsset.mime || "",
    syntheticReferenceLocalUrl: userAsset.syntheticReferenceLocalUrl || "",
    syntheticReferenceUrl: userAsset.syntheticReferenceUrl || "",
    syntheticReferenceTaskId: userAsset.syntheticReferenceTaskId || "",
    syntheticReferenceModel: userAsset.syntheticReferenceModel || "",
    syntheticReferencePrompt: userAsset.syntheticReferencePrompt || "",
    referenceAssetUri: userAsset.syntheticReferenceAssetUri || "",
  });

  const next = {
    ...userAsset,
    sourceImageUrl: userAsset.sourceImageUrl || userAsset.localUrl,
    sourceImageMime: userAsset.sourceImageMime || userAsset.mime || "",
    syntheticReferenceLocalUrl: prepared.syntheticReferenceLocalUrl || userAsset.syntheticReferenceLocalUrl || "",
    syntheticReferenceUrl: prepared.syntheticReferenceUrl || userAsset.syntheticReferenceUrl || "",
    syntheticReferenceTaskId: prepared.syntheticReferenceTaskId || userAsset.syntheticReferenceTaskId || "",
    syntheticReferenceModel: prepared.syntheticReferenceModel || userAsset.syntheticReferenceModel || "",
    syntheticReferencePrompt: prepared.syntheticReferencePrompt || userAsset.syntheticReferencePrompt || "",
    syntheticReferenceAssetUri: prepared.referenceAssetUri || userAsset.syntheticReferenceAssetUri || "",
    syntheticReferencePublicUrl: prepared.publicImageUrl || userAsset.syntheticReferencePublicUrl || "",
    syntheticReferenceTosKey: prepared.tosKey || userAsset.syntheticReferenceTosKey || "",
    sourcePublicUrl: prepared.sourcePublicUrl || userAsset.sourcePublicUrl || "",
    sourceTosKey: prepared.sourceTosKey || userAsset.sourceTosKey || "",
    updatedAt: new Date().toISOString(),
  };

  db.userAssets = (db.userAssets || []).map((asset) => (asset.id === next.id ? next : asset));
  if (dbEnabled()) await upsertUserAssetInDb(next);
  else await writeDb(db);
  return next;
}

async function prepareSeedanceReferenceAsset(db, userAsset, preprocess = false) {
  if (!userAsset) return { asset: null, referenceAssetUri: "", imageUrl: "", sourceImageUrl: "" };
  validateWan27MediaKind(userAsset, "image", "Seedance reference image");
  const prepared = preprocess
    ? await ensureSyntheticReferenceForUserAsset(db, userAsset)
    : await ensureSeedanceAssetForUserAsset(db, userAsset);
  return {
    asset: prepared,
    referenceAssetUri: preprocess ? (prepared.syntheticReferenceAssetUri || prepared.assetUri || "") : (prepared.assetUri || ""),
    imageUrl: preprocess
      ? (prepared.syntheticReferenceLocalUrl || prepared.syntheticReferenceUrl || prepared.publicUrl || prepared.localUrl || "")
      : (prepared.publicUrl || prepared.localUrl || ""),
    sourceImageUrl: prepared.sourceImageUrl || prepared.localUrl || "",
  };
}

async function prepareSeedanceVideoAsset(db, userAsset) {
  if (!userAsset) return { asset: null, referenceAssetUri: "", videoUrl: "" };
  validateWan27MediaKind(userAsset, "video", "Seedance reference video");
  const prepared = await ensureSeedanceAssetForUserAsset(db, userAsset);
  return {
    asset: prepared,
    referenceAssetUri: prepared.seedanceVideoAssetUri || "",
    videoUrl: prepared.publicUrl || prepared.localUrl || "",
  };
}

async function prepareSeedanceAudioAsset(db, userAsset) {
  if (!userAsset) return { asset: null, referenceAssetUri: "", audioUrl: "" };
  validateWan27MediaKind(userAsset, "audio", "Seedance reference audio");
  try {
    const prepared = await ensureSeedanceAssetForUserAsset(db, userAsset);
    return {
      asset: prepared,
      referenceAssetUri: prepared.seedanceAudioAssetUri || "",
      audioUrl: prepared.publicUrl || prepared.localUrl || "",
    };
  } catch (error) {
    const prepared = await ensurePublicUrlForUserMediaAsset(db, userAsset);
    return {
      asset: prepared,
      referenceAssetUri: publicUrlForLocalAsset(prepared),
      audioUrl: publicUrlForLocalAsset(prepared),
    };
  }
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
  if (typeof value === "string") return isLikelyVideoUrl(value) || /\.(avi|mkv)(?:[?#]|$)/i.test(value);
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

  if (pricing.pricing_mode === "token") {
    const inputRate = apizPricingNumber(pricing.input_price_credits_per_1m);
    const outputRate = apizPricingNumber(pricing.output_price_credits_per_1m);
    const promptTokens = Math.max(0, Number(params.prompt_tokens || params.input_tokens || 0));
    const completionTokens = Math.max(0, Number(params.completion_tokens || params.output_tokens || 0));
    const promptText = String(params.prompt || params.text || "");
    const fallbackInputTokens = promptText ? Math.ceil(promptText.length / 3) : 1000;
    const fallbackOutputTokens = Math.max(1000, Math.ceil(Math.max(duration, 5) * 21780));
    if (inputRate !== null || outputRate !== null) {
      const inputCredits = ((inputRate || 0) * (promptTokens || fallbackInputTokens)) / 1000000;
      const outputCredits = ((outputRate || 0) * (completionTokens || fallbackOutputTokens)) / 1000000;
      return creditsAmount(inputCredits + outputCredits);
    }
  }

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
    try {
      value = normalizeApizPricing(await apizGet(`/v1/pricing/${encodeURIComponent(model)}`), {});
    } catch (error) {
      if (!error.statusCode || error.statusCode !== 404) {
        console.warn("[apiz-pricing-v1-failed]", model, error.message || error);
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
  if (USE_GATEWAY_UPSTREAM) {
    return fixedCreditsBreakdown(template.price || GATEWAY_PLATFORM_FALLBACK_CREDITS, "gateway_fixed");
  }
  const pricing = await fetchApizModelPricing(model);
  const estimated = estimateCreditsFromApizPricing(pricing, params);
  if (estimated > 0 || pricingIsFreeFixed(pricing)) {
    return { ...costBreakdown(estimated, "model_pricing"), pricing };
  }

  const error = new Error("模型定价未配置，暂不能提交生成。请在后台模板里填写上游真实模型 ID。");
  error.statusCode = 422;
  error.code = "MODEL_PRICING_UNAVAILABLE";
  throw error;
}

async function readGenerationRecords() {
  if (dbEnabled()) {
    const records = await getGenerationRecordsFromDb({ limit: 500, includeDeleted: true });
    return Array.isArray(records) ? records : [];
  }
  const records = await getKv("generation_records", []);
  return Array.isArray(records) ? records : [];
}

async function writeGenerationRecords(records) {
  return withAppStateWriteLock(async () => {
    if (dbEnabled()) {
      await replaceGenerationRecordsInDb(records);
      return;
    }
    await setKv("generation_records", records);
  });
}

async function upsertGenerationRecord(nextRecord) {
  if (dbEnabled()) {
    return upsertGenerationRecordInDb(nextRecord);
  }
  return withAppStateWriteLock(async () => {
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
  });
}

async function upsertAndSettleGenerationRecord(nextRecord, reason = "query") {
  const record = await upsertGenerationRecord(nextRecord);
  return settleSeedanceGenerationRecord(record, reason);
}

async function updateGenerationRecord(taskId, updates = {}, reason = "update") {
  if (!taskId) return null;
  const nextRecord = { ...updates, taskId };
  if (reason) nextRecord.lastUpdateReason = reason;
  return upsertAndSettleGenerationRecord(nextRecord, reason);
}

async function getGenerationRecord(taskId) {
  if (dbEnabled()) {
    return getGenerationRecordFromDb(taskId);
  }
  const records = await readGenerationRecords();
  return records.find((record) => record.taskId === taskId) || null;
}

async function listGenerationRecordsForUser(userId, limit = 60) {
  if (dbEnabled()) {
    const records = await getGenerationRecordsFromDb({
      userId,
      limit,
      includeDeleted: false,
    });
    return Array.isArray(records) ? records : [];
  }
  const records = await readGenerationRecords();
  return records
    .filter((record) => record.userId === userId && isUserVisibleGenerationRecord(record))
    .slice(0, limit);
}

async function softDeleteGenerationRecordsByCompanion(companionId, { userId = "" } = {}) {
  if (!companionId) return [];
  const nowIso = new Date().toISOString();
  if (dbEnabled()) {
    return patchGenerationRecordsInDb({
      companionId,
      userId,
      notDeleted: true,
    }, {
      deletedAt: nowIso,
    });
  }
  const records = await readGenerationRecords();
  let changedRecords = false;
  const nextRecords = records.map((entry) => {
    if (entry.companionId !== companionId || entry.deletedAt) return entry;
    if (userId && entry.userId !== userId) return entry;
    changedRecords = true;
    return { ...entry, deletedAt: nowIso, updatedAt: nowIso };
  });
  if (changedRecords) await writeGenerationRecords(nextRecords);
  return changedRecords ? nextRecords : [];
}

async function softDeleteGenerationRecordForUser(taskId, userId) {
  const id = String(taskId || "").trim();
  const ownerId = String(userId || "").trim();
  if (!id || !ownerId) return null;
  const record = await getGenerationRecord(id);
  if (!record || record.userId !== ownerId || !isUserVisibleGenerationRecord(record)) return null;
  const nowIso = new Date().toISOString();
  return upsertGenerationRecord({
    ...record,
    taskId: id,
    deletedAt: nowIso,
    updatedAt: nowIso,
  });
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

function generationRecordProviderVideoUrl(record = {}) {
  return String(
    record.remoteVideoUrl ||
    record.providerVideoUrl ||
    record.upstreamVideoUrl ||
    findVideoUrl(record.queryResponse) ||
    findVideoUrl(record.createResponse) ||
    "",
  ).trim();
}

function generationRecordStoredVideoUrl(record = {}) {
  if (localPublicAssetStorageEnabled()) {
    return String(record.localVideoUrl || record.videoUrl || record.cdnVideoUrl || record.remoteVideoUrl || "");
  }
  return String(record.cdnVideoUrl || record.localVideoUrl || record.videoUrl || record.remoteVideoUrl || "");
}

function generationRecordVideoUrl(record = {}, options = {}) {
  const providerUrl = generationRecordProviderVideoUrl(record);
  const storedUrl = generationRecordStoredVideoUrl(record);
  return options.preferProviderVideoUrl ? (providerUrl || storedUrl) : (storedUrl || providerUrl);
}

function generationRecordImageUrl(record = {}) {
  if (localPublicAssetStorageEnabled()) {
    return String(record.localImageUrl || record.imageResultUrl || record.cdnImageUrl || record.remoteImageUrl || record.imageUrl || "");
  }
  return String(record.cdnImageUrl || record.imageResultUrl || record.localImageUrl || record.remoteImageUrl || record.imageUrl || "");
}

function generationRecordProviderImageUrl(record = {}) {
  return String(
    record.remoteImageUrl ||
    record.providerImageUrl ||
    record.upstreamImageUrl ||
    collectOutputImageUrls(record.queryResponse)[0] ||
    collectOutputImageUrls(record.createResponse)[0] ||
    "",
  ).trim();
}

function generationRecordResponseOptionsForAuth(auth = {}) {
  const tokenSource = String(auth?.tokenSource || "").toLowerCase();
  const externalApiCaller = tokenSource === "api_token" || tokenSource === "subtoken" || auth?.isApiToken === true;
  return {
    preferProviderVideoUrl: true,
    providerOnlyVideoUrl: externalApiCaller,
    includeStoredVideoUrls: !externalApiCaller,
    providerOnlyImageUrl: externalApiCaller,
    includeStoredImageUrls: !externalApiCaller,
  };
}

function publicGenerationRecord(record = {}, options = {}) {
  const providerVideoUrl = generationRecordProviderVideoUrl(record);
  const providerOnlyVideoUrl = options.providerOnlyVideoUrl === true;
  const publicVideoUrl = providerOnlyVideoUrl ? providerVideoUrl : generationRecordVideoUrl(record, options);
  const includeStoredVideoUrls = options.includeStoredVideoUrls !== false;
  const storedPosterUrl = String(localPublicAssetStorageEnabled() ? (record.localPosterUrl || record.posterUrl || record.cdnPosterUrl || "") : (record.posterUrl || ""));
  const providerPosterUrl = String(record.providerPosterUrl || record.upstreamPosterUrl || record.remotePosterUrl || "");
  const providerImageUrl = generationRecordProviderImageUrl(record);
  const providerOnlyImageUrl = options.providerOnlyImageUrl === true;
  const publicImageUrl = providerOnlyImageUrl ? providerImageUrl : generationRecordImageUrl(record);
  const includeStoredImageUrls = options.includeStoredImageUrls !== false;
  const publicRecord = {
    taskId: String(record.taskId || ""),
    upstreamTaskId: String(record.upstreamTaskId || ""),
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
    sourceImageUrl: String(record.sourceImageUrl || ""),
    syntheticReferenceLocalUrl: String(record.syntheticReferenceLocalUrl || ""),
    syntheticReferenceUrl: String(record.syntheticReferenceUrl || ""),
    userAssetId: String(record.userAssetId || ""),
    referenceAssetUri: String(record.referenceAssetUri || ""),
    mediaMode: String(record.mediaMode || record.params?.mediaMode || ""),
    mediaAssets: Array.isArray(record.mediaAssets) ? record.mediaAssets : [],
    posterUrl: includeStoredVideoUrls ? storedPosterUrl : providerPosterUrl,
    prompt: String(record.prompt || ""),
    finalPrompt: String(record.finalPrompt || ""),
    params: record.params || null,
    model: String(record.model || ""),
    provider: String(record.provider || ""),
    ratio: String(record.ratio || ""),
    resolution: String(record.resolution || ""),
    duration: record.duration || "",
    quality: String(record.quality || ""),
    videoUrl: publicVideoUrl,
    downloadUrl: providerOnlyVideoUrl ? providerVideoUrl : (providerVideoUrl || publicVideoUrl),
    providerVideoUrl,
    upstreamVideoUrl: providerVideoUrl,
    remoteVideoUrl: String(record.remoteVideoUrl || ""),
    imageResultUrl: publicImageUrl,
    providerImageUrl,
    upstreamImageUrl: providerImageUrl,
    remoteImageUrl: String(record.remoteImageUrl || ""),
    error: String(record.error || ""),
    cdnError: String(record.cdnError || ""),
    billing: publicBilling(record),
    createdAt: String(record.createdAt || ""),
    updatedAt: String(record.updatedAt || ""),
    awaitingUpstreamTask: record.awaitingUpstreamTask === true,
    apiTokenId: String(record.apiTokenId || ""),
    apiTokenName: String(record.apiTokenName || ""),
    apiTokenType: String(record.apiTokenType || ""),
  };
  if (includeStoredVideoUrls) {
    publicRecord.localVideoUrl = String(record.localVideoUrl || "");
    publicRecord.cdnVideoUrl = String(record.cdnVideoUrl || "");
    publicRecord.localPosterUrl = String(record.localPosterUrl || "");
    publicRecord.cdnPosterUrl = String(record.cdnPosterUrl || "");
  }
  if (includeStoredImageUrls) {
    publicRecord.localImageUrl = String(record.localImageUrl || "");
    publicRecord.cdnImageUrl = String(record.cdnImageUrl || "");
  }
  return publicRecord;
}

function adminGenerationRecordView(record = {}, userMap = new Map()) {
  const user = userMap.get(record.userId);
  const publicRecord = publicGenerationRecord(record);
  const inferredProvider = record.provider || (String(record.source || "").includes("platform") ? "apiz" : "seedance");
  return {
    ...publicRecord,
    userId: String(record.userId || ""),
    username: user?.username || "",
    provider: String(inferredProvider || ""),
    upstreamPayload: record.upstreamPayload || null,
    pricingEstimate: record.pricingEstimate || null,
    createResponse: record.createResponse || null,
    queryResponse: record.queryResponse || null,
    createReportedCredits: record.createReportedCredits === undefined ? null : record.createReportedCredits,
    billingError: String(record.billingError || ""),
    partnerReferenceAssetUri: String(record.partnerReferenceAssetUri || ""),
  };
}

function generationRecordMatchesQuery(record = {}, query = "") {
  const needle = String(query || "").trim().toLowerCase();
  if (!needle) return true;
  return [
    record.taskId,
    record.upstreamTaskId,
    record.userId,
    record.username,
    record.source,
    record.kind,
    record.provider,
    record.status,
    record.templateId,
    record.templateTitle,
    record.sceneId,
    record.sceneName,
    record.sceneEntryId,
    record.sceneEntryName,
    record.companionId,
    record.companionName,
    record.prompt,
    record.finalPrompt,
    record.model,
    record.error,
  ].some((value) => String(value || "").toLowerCase().includes(needle));
}

function shouldRefreshGenerationRecord(record = {}) {
  if (needsApizFailureRefund(record)) return true;
  if (needsSeedanceFailureRefund(record)) return true;
  if (record.awaitingUpstreamTask && !record.upstreamTaskId) return false;
  if (record.provider === "apiz" && !record.billingSettledAt && (record.upstreamTaskId || record.taskId) && !String(record.upstreamTaskId || record.taskId).startsWith("demo-")) return true;
  if (record.localVideoUrl && (!record.localPosterUrl || (tosEnabled() && !record.cdnVideoUrl))) return true;
  const status = String(record.status || "").toLowerCase();
  if (isFailedStatus(status)) return false;
  if (isSucceededStatus(status)) {
    if (seedanceUsesTokenPricing(record) && !record.billingSettledAt) return Boolean(record.upstreamTaskId || record.taskId);
    return Boolean(record.taskId) && !record.localVideoUrl;
  }
  if (String(record.provider || "").toLowerCase() === "seedance" && record.source === "advanced-seedance") {
    return Boolean(record.upstreamTaskId) && !String(record.upstreamTaskId).startsWith("demo-");
  }
  if (String(record.provider || "").toLowerCase() === "apiz") {
    return Boolean(record.upstreamTaskId) && !String(record.upstreamTaskId).startsWith("demo-");
  }
  return Boolean(record.taskId) && !String(record.taskId).startsWith("demo-");
}

function generationListRefreshRequested(url) {
  return ["1", "true", "yes", "on"].includes(String(url.searchParams.get("refresh") || "").toLowerCase());
}

const GENERATION_LIST_REFRESH_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function generationRecordTime(record = {}) {
  const value = Date.parse(record.updatedAt || record.createdAt || "");
  return Number.isFinite(value) ? value : 0;
}

function shouldRefreshGenerationRecordFromList(record = {}) {
  if (!shouldRefreshGenerationRecord(record)) return false;
  if (record.localVideoUrl && (!record.localPosterUrl || (tosEnabled() && !record.cdnVideoUrl))) return true;
  const time = generationRecordTime(record);
  return !time || Date.now() - time <= GENERATION_LIST_REFRESH_MAX_AGE_MS;
}

async function ensureGenerationRecordMediaOptimized(record = {}) {
  if (!record?.taskId || !record.localVideoUrl) return record;
  const localVideoPath = record.localVideoPath || path.join(ROOT, String(record.localVideoUrl || "").replace(/^\//, ""));
  const currentVideoUrl = generationRecordVideoUrl(record);
  try {
    await fs.access(localVideoPath);
  } catch {
    return record;
  }
  let localPosterPath = record.localPosterPath || "";
  let localPosterUrl = record.localPosterUrl || "";
  let cdnVideoUrl = record.cdnVideoUrl || "";
  let cdnPosterUrl = record.cdnPosterUrl || "";
  let cdnError = record.cdnError || "";
  if (!localPosterUrl) {
    const poster = await createGeneratedVideoPoster(record.taskId, localVideoPath);
    localPosterPath = poster.localPosterPath || localPosterPath;
    localPosterUrl = poster.localPosterUrl || localPosterUrl;
  }
  if (tosEnabled() && (!cdnVideoUrl || (localPosterPath && !cdnPosterUrl))) {
    const cdn = await uploadGeneratedMediaToTos({ taskId: record.taskId, localVideoPath, localPosterPath });
    cdnVideoUrl = cdn.cdnVideoUrl || cdnVideoUrl;
    cdnPosterUrl = cdn.cdnPosterUrl || cdnPosterUrl;
    cdnError = cdn.cdnError || cdnError;
  }
  if (
    localPosterUrl === (record.localPosterUrl || "") &&
    cdnVideoUrl === (record.cdnVideoUrl || "") &&
    cdnPosterUrl === (record.cdnPosterUrl || "") &&
    cdnError === (record.cdnError || "")
  ) {
    return record;
  }
  return upsertGenerationRecord({
    taskId: record.taskId,
    localVideoPath,
    localVideoUrl: record.localVideoUrl,
    videoUrl: localPublicAssetStorageEnabled()
      ? (record.localVideoUrl || record.cdnVideoUrl || currentVideoUrl)
      : (record.cdnVideoUrl || record.localVideoUrl || currentVideoUrl),
    localPosterPath,
    localPosterUrl,
    posterUrl: localPublicAssetStorageEnabled()
      ? (localPosterUrl || cdnPosterUrl)
      : (cdnPosterUrl || localPosterUrl),
    cdnVideoUrl,
    cdnPosterUrl,
    cdnError,
  });
}

async function refreshGenerationRecordStatus(record = {}) {
  if (needsApizFailureRefund(record)) {
    return settleApizGenerationRecord(record, { status: record.status || "failed", error: record.error || "" }, "refresh");
  }
  if (needsSeedanceFailureRefund(record)) {
    return settleSeedanceGenerationRecord(record, "refresh");
  }
  if (record.localVideoUrl && (!record.localPosterUrl || (tosEnabled() && !record.cdnVideoUrl))) {
    try {
      return await ensureGenerationRecordMediaOptimized(record);
    } catch (error) {
      console.warn("[generation-record-media-optimize-failed]", record.taskId, error.message || error);
      return record;
    }
  }
  if (record.provider === "apiz") {
    if ((!APIZ_API_KEY && record.upstreamSource !== "gateway") || !shouldRefreshGenerationRecord(record)) return record;
    try {
      return await refreshApizGenerationRecord(record);
    } catch (error) {
      console.warn("[apiz-generation-record-refresh-failed]", record.taskId, error.message || error);
      return record;
    }
  }
  if (record.upstreamSource === "gateway") {
    if (!shouldRefreshGenerationRecord(record)) return record;
    try {
      const queryTaskId = record.upstreamTaskId || record.taskId;
      const task = await gatewayQueryTask(queryTaskId);
      const media = isSucceededStatus(task.status) && task.videoUrl && !record.localVideoUrl
        ? await maybeDownloadApizVideo(record, task.videoUrl)
        : {};
      return await upsertAndSettleGenerationRecord({
        taskId: record.taskId,
        upstreamTaskId: task.taskId || queryTaskId,
        status: task.status || record.status || "unknown",
        remoteVideoUrl: task.videoUrl || record.remoteVideoUrl || "",
        videoUrl: localPublicAssetStorageEnabled()
          ? (media.localVideoUrl || media.cdnVideoUrl || task.videoUrl || record.videoUrl || "")
          : (media.cdnVideoUrl || media.localVideoUrl || task.videoUrl || record.videoUrl || ""),
        localVideoUrl: media.localVideoUrl || record.localVideoUrl || "",
        localVideoPath: media.localVideoPath || record.localVideoPath || "",
        localPosterUrl: media.localPosterUrl || record.localPosterUrl || "",
        localPosterPath: media.localPosterPath || record.localPosterPath || "",
        posterUrl: localPublicAssetStorageEnabled()
          ? (media.localPosterUrl || media.cdnPosterUrl || record.posterUrl || "")
          : (media.cdnPosterUrl || media.localPosterUrl || record.posterUrl || ""),
        cdnVideoUrl: media.cdnVideoUrl || record.cdnVideoUrl || "",
        cdnPosterUrl: media.cdnPosterUrl || record.cdnPosterUrl || "",
        cdnError: media.cdnError || record.cdnError || "",
        error: task.error || media.downloadError || record.error || "",
        queryResponse: task.raw,
        completedAt: isSucceededStatus(task.status) ? (record.completedAt || new Date().toISOString()) : record.completedAt || "",
      }, "gateway-query");
    } catch (error) {
      console.warn("[gateway-generation-record-refresh-failed]", record.taskId, error.message || error);
      return record;
    }
  }
  if (record.provider === "aliyun-wan27") {
    if (!ALIYUN_DASHSCOPE_API_KEY || !shouldRefreshGenerationRecord(record)) return record;
    try {
      return await refreshWan27GenerationRecord(record, { download: true, reason: "query" });
    } catch (error) {
      console.warn("[wan27-generation-record-refresh-failed]", record.taskId, error.message || error);
      if (upstreamResourceMissing(error)) {
        return await upsertAndSettleGenerationRecord({
          taskId: record.taskId,
          status: "failed",
          error: error.message || "Upstream task resource not found.",
          queryResponse: error.payload || record.queryResponse || null,
          finalCredits: 0,
          originalFinalCredits: 0,
        }, "wan27-missing-resource");
      }
      return record;
    }
  }
  if (!ARK_API_KEY || !shouldRefreshGenerationRecord(record)) return record;
  try {
    const queryTaskId = record.upstreamTaskId || record.taskId;
    const raw = await arkRequest("GET", `/contents/generations/tasks/${encodeURIComponent(queryTaskId)}`);
    const task = normalizeTask(raw);
    let localVideoUrl = record.localVideoUrl || "";
    let localVideoPath = record.localVideoPath || "";
    let localPosterUrl = record.localPosterUrl || "";
    let localPosterPath = record.localPosterPath || "";
    let cdnVideoUrl = record.cdnVideoUrl || "";
    let cdnPosterUrl = record.cdnPosterUrl || "";
    let cdnError = record.cdnError || "";
    let downloadError = "";
    const remoteVideoUrl = task.videoUrl || record.remoteVideoUrl || "";
    if (isSucceededStatus(task.status) && remoteVideoUrl && !localVideoUrl) {
      try {
        const localVideo = await downloadGeneratedVideo(record.taskId, remoteVideoUrl);
        localVideoUrl = localVideo.localVideoUrl;
        localVideoPath = localVideo.localVideoPath;
        localPosterUrl = localVideo.localPosterUrl || localPosterUrl;
        localPosterPath = localVideo.localPosterPath || localPosterPath;
        cdnVideoUrl = localVideo.cdnVideoUrl || cdnVideoUrl;
        cdnPosterUrl = localVideo.cdnPosterUrl || cdnPosterUrl;
        cdnError = localVideo.cdnError || cdnError;
      } catch (error) {
        downloadError = error.message || "Failed to download generated video.";
      }
    }
    return await upsertAndSettleGenerationRecord({
      taskId: record.taskId,
      upstreamTaskId: task.taskId || queryTaskId,
      status: task.status || record.status || "unknown",
      remoteVideoUrl,
      localVideoUrl,
      localVideoPath,
      localPosterUrl,
      localPosterPath,
      posterUrl: localPublicAssetStorageEnabled()
        ? (localPosterUrl || cdnPosterUrl || record.posterUrl || "")
        : (cdnPosterUrl || localPosterUrl || record.posterUrl || ""),
      cdnVideoUrl,
      cdnPosterUrl,
      cdnError,
      error: task.error || downloadError || record.error || "",
      queryResponse: raw,
    }, "query");
  } catch (error) {
    console.warn("[generation-record-refresh-failed]", record.taskId, error.message || error);
    if (upstreamResourceMissing(error)) {
      return await upsertAndSettleGenerationRecord({
        taskId: record.taskId,
        status: "failed",
        error: error.message || "Upstream task resource not found.",
        queryResponse: error.payload || record.queryResponse || null,
        finalCredits: 0,
        originalFinalCredits: 0,
      }, "missing-resource");
    }
    if (needsSeedanceFailureRefund(record) || (seedanceUsesTokenPricing(record) && isSucceededStatus(record.status) && !record.billingSettledAt)) {
      return settleSeedanceGenerationRecord(record, "refresh-fallback");
    }
    return record;
  }
}

function isSucceededStatus(status) {
  return ["succeeded", "success", "done", "completed"].includes(String(status || "").toLowerCase());
}

function isFailedStatus(status) {
  return ["failed", "error", "cancelled", "canceled"].includes(String(status || "").toLowerCase());
}

function normalizeErrorPayload(error = {}) {
  const payload = error?.payload && typeof error.payload === "object" ? error.payload : null;
  return {
    message: error?.message || payload?.message || payload?.output?.message || "",
    code: error?.code || payload?.code || payload?.error?.code || "",
    statusCode: error?.statusCode || 0,
    payload,
  };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function videoFileName(taskId) {
  return `${String(taskId).replace(/[^a-z0-9_-]/gi, "_")}.mp4`;
}

function posterFileName(taskId) {
  return `${String(taskId).replace(/[^a-z0-9_-]/gi, "_")}.jpg`;
}

async function createGeneratedVideoPoster(taskId, videoPath) {
  if (!taskId || !videoPath) return { localPosterPath: "", localPosterUrl: "" };
  await fs.mkdir(GENERATED_POSTER_DIR, { recursive: true });
  const fileName = posterFileName(taskId);
  const localPosterPath = path.join(GENERATED_POSTER_DIR, fileName);
  const localPosterUrl = `/assets/generated/posters/${fileName}`;
  try {
    await fs.access(localPosterPath);
    return { localPosterPath, localPosterUrl };
  } catch {
    // Capture below.
  }
  const captured = await captureVideoPosterFrame(videoPath, localPosterPath);
  return captured ? { localPosterPath, localPosterUrl } : { localPosterPath: "", localPosterUrl: "" };
}

async function uploadGeneratedMediaToTos({ taskId, localVideoPath, localPosterPath = "" } = {}) {
  const result = { cdnVideoUrl: "", cdnPosterUrl: "", cdnError: "" };
  if (!tosEnabled()) return result;
  try {
    if (localVideoPath) {
      const videoBytes = await fs.readFile(localVideoPath);
      const videoExt = path.extname(localVideoPath) || ".mp4";
      const videoUpload = await uploadStaticAssetToTos({
        key: tosStorageKey("generated", "videos", `${storagePathSegment(taskId || "video")}${videoExt}`),
        bytes: videoBytes,
        mime: videoMimeFromPath(localVideoPath),
      });
      result.cdnVideoUrl = videoUpload.publicUrl;
    }
    if (localPosterPath) {
      const posterBytes = await fs.readFile(localPosterPath);
      const posterUpload = await uploadStaticAssetToTos({
        key: tosStorageKey("generated", "posters", `${storagePathSegment(taskId || "poster")}.jpg`),
        bytes: posterBytes,
        mime: "image/jpeg",
      });
      result.cdnPosterUrl = posterUpload.publicUrl;
    }
  } catch (error) {
    result.cdnError = error.message || "CDN upload failed";
  }
  return result;
}

function pipeFileStream(res, filePath, options = {}) {
  const stream = fsSync.createReadStream(filePath, options);
  stream.on("error", (error) => {
    if (!res.headersSent) {
      res.writeHead(error.code === "ENOENT" ? 404 : 500, { "content-type": "text/plain; charset=utf-8" });
    }
    res.end(error.code === "ENOENT" ? "Not Found" : "File stream error");
  });
  return stream.pipe(res);
}

function internalAssetRedirectPath(filePath = "") {
  const relative = path.relative(path.join(ROOT, "assets"), filePath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return "";
  return `/__protected_assets__/${relative.split(path.sep).map(encodeURIComponent).join("/")}`;
}

function sendInternalAsset(res, filePath, contentType, stat, { privateCache = false } = {}) {
  const redirectPath = internalAssetRedirectPath(filePath);
  if (!redirectPath) return false;
  res.writeHead(200, {
    "content-type": contentType,
    "cache-control": privateCache ? "private, no-store" : "public, max-age=604800, immutable",
    "x-accel-redirect": redirectPath,
  });
  res.end();
  return true;
}

async function downloadGeneratedVideo(taskId, remoteVideoUrl) {
  const existing = await getGenerationRecord(taskId);
  if (existing?.localVideoUrl) {
    try {
      const existingVideoPath = existing.localVideoPath || path.join(ROOT, existing.localVideoUrl.replace(/^\//, ""));
      await fs.access(existingVideoPath);
      let optimized = existing;
      if (!existing.localPosterUrl || (tosEnabled() && !existing.cdnVideoUrl)) {
        optimized = await ensureGenerationRecordMediaOptimized(existing);
      }
      return {
        localVideoPath: optimized.localVideoPath || existingVideoPath,
        localVideoUrl: optimized.localVideoUrl || existing.localVideoUrl,
        localPosterPath: optimized.localPosterPath || "",
        localPosterUrl: optimized.localPosterUrl || "",
        cdnVideoUrl: optimized.cdnVideoUrl || "",
        cdnPosterUrl: optimized.cdnPosterUrl || "",
        cdnError: optimized.cdnError || "",
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
  const poster = await createGeneratedVideoPoster(taskId, localVideoPath);
  const cdn = await uploadGeneratedMediaToTos({
    taskId,
    localVideoPath,
    localPosterPath: poster.localPosterPath,
  });

  return {
    localVideoPath,
    localVideoUrl,
    ...poster,
    ...cdn,
  };
}

function imageFileName(taskId, mime = "image/png") {
  return `${String(taskId || randomId("img")).replace(/[^a-z0-9_-]/gi, "_")}${imageExtFromMime(mime)}`;
}

async function saveGeneratedImageFile(taskId, bytes, mime = "image/png") {
  const imageMime = String(mime || "").startsWith("image/") ? mime : "image/png";
  await fs.mkdir(GENERATED_IMAGE_DIR, { recursive: true });
  const fileName = imageFileName(taskId, imageMime);
  const localImagePath = path.join(GENERATED_IMAGE_DIR, fileName);
  const localImageUrl = `/assets/generated/images/${fileName}`;
  await fs.writeFile(localImagePath, bytes);
  const result = {
    localImagePath,
    localImageUrl,
    cdnImageUrl: "",
    cdnError: "",
  };
  if (tosEnabled()) {
    try {
      const upload = await uploadStaticAssetToTos({
        key: tosStorageKey("generated", "images", fileName),
        bytes,
        mime: imageMime,
      });
      result.cdnImageUrl = upload.publicUrl || "";
    } catch (error) {
      result.cdnError = error.message || "CDN upload failed";
    }
  }
  return result;
}

function requireHttpUrl(value = "", label = "URL") {
  let parsed;
  try {
    parsed = new URL(String(value || "").trim());
  } catch {
    const error = new Error(`${label} must be a valid http or https URL.`);
    error.statusCode = 400;
    throw error;
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    const error = new Error(`${label} must use http or https.`);
    error.statusCode = 400;
    throw error;
  }
  return parsed.toString();
}

async function downloadRemoteFileToBuffer(fileUrl, { label = "file", maxBytes = 200 * 1024 * 1024, timeoutMs = 15 * 60 * 1000 } = {}) {
  const response = await fetch(fileUrl, { redirect: "follow", signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) {
    const error = new Error(`Failed to download ${label}: ${response.status}`);
    error.statusCode = 400;
    throw error;
  }
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength && contentLength > maxBytes) {
    const error = new Error(`${label} is too large. Max ${Math.round(maxBytes / 1024 / 1024)}MB.`);
    error.statusCode = 400;
    throw error;
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength > maxBytes) {
    const error = new Error(`${label} is too large. Max ${Math.round(maxBytes / 1024 / 1024)}MB.`);
    error.statusCode = 400;
    throw error;
  }
  return {
    bytes,
    mime: String(response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase(),
  };
}

async function captureVideoPosterFrame(videoPath, posterPath) {
  try {
    await execFileQuiet("ffmpeg", [
      "-y",
      "-ss",
      "00:00:00.500",
      "-i",
      videoPath,
      "-frames:v",
      "1",
      "-q:v",
      "3",
      posterPath,
    ], { timeout: 60000 });
    await fs.access(posterPath);
    return true;
  } catch {
    return false;
  }
}

async function ingestAdvancedCaseMedia({ videoUrl, coverUrl = "", caseId = "" } = {}) {
  const sourceVideoUrl = requireHttpUrl(videoUrl, "Video URL");
  const sourceCoverUrl = String(coverUrl || "").trim() ? requireHttpUrl(coverUrl, "Cover URL") : "";
  const safeId = String(caseId || `advanced-${Date.now()}`).trim().replace(/[^a-z0-9_-]/gi, "-").slice(0, 64) || `advanced-${Date.now()}`;
  await fs.mkdir(ADMIN_ADVANCED_CASE_DIR, { recursive: true });

  const videoDownload = await downloadRemoteFileToBuffer(sourceVideoUrl, { label: "video", maxBytes: 300 * 1024 * 1024 });
  const videoPathname = new URL(sourceVideoUrl).pathname;
  if (!String(videoDownload.mime || "").startsWith("video/") && !isLikelyVideoUrl(videoPathname)) {
    const error = new Error("Video URL must point to a video file.");
    error.statusCode = 400;
    throw error;
  }
  const videoExt = videoExtFromMime(videoDownload.mime, sourceVideoUrl);
  const videoName = `${safeId}-video-${Date.now()}${videoExt}`;
  const videoPath = path.join(ADMIN_ADVANCED_CASE_DIR, videoName);
  const localVideoUrl = `/assets/admin/advanced-cases/${videoName}`;
  await fs.writeFile(videoPath, videoDownload.bytes);

  let localCoverUrl = "";
  let coverPath = "";
  let coverBytes = null;
  let coverMime = "";
  if (sourceCoverUrl) {
    const coverDownload = await downloadRemoteFileToBuffer(sourceCoverUrl, { label: "cover", maxBytes: 8 * 1024 * 1024, timeoutMs: 120000 });
    const coverPathname = new URL(sourceCoverUrl).pathname;
    if (!String(coverDownload.mime || "").startsWith("image/") && !/\.(png|jpe?g|webp)$/i.test(coverPathname)) {
      const error = new Error("Cover URL must point to an image file.");
      error.statusCode = 400;
      throw error;
    }
    coverMime = coverDownload.mime && coverDownload.mime.startsWith("image/") ? coverDownload.mime : "image/jpeg";
    const coverExt = imageExtFromMime(coverMime);
    const coverName = `${safeId}-cover-${Date.now()}${coverExt}`;
    coverPath = path.join(ADMIN_ADVANCED_CASE_DIR, coverName);
    localCoverUrl = `/assets/admin/advanced-cases/${coverName}`;
    coverBytes = coverDownload.bytes;
    await fs.writeFile(coverPath, coverBytes);
  } else {
    const coverName = `${safeId}-cover-${Date.now()}.jpg`;
    coverPath = path.join(ADMIN_ADVANCED_CASE_DIR, coverName);
    const captured = await captureVideoPosterFrame(videoPath, coverPath);
    if (captured) {
      localCoverUrl = `/assets/admin/advanced-cases/${coverName}`;
      coverMime = "image/jpeg";
      coverBytes = await fs.readFile(coverPath);
    }
  }

  const result = {
    sourceVideoUrl,
    sourceCoverUrl,
    localVideoUrl,
    localCoverUrl,
    previewUrl: localVideoUrl,
    coverUrl: localCoverUrl,
    cdnVideoUrl: "",
    cdnCoverUrl: "",
    cdnEnabled: tosEnabled(),
    cdnError: "",
  };

  if (tosEnabled()) {
    try {
      const baseKey = tosStorageKey("admin", "advanced-cases", safeId, Date.now());
      const videoUpload = await uploadStaticAssetToTos({
        key: `${baseKey}${videoExt}`,
        bytes: videoDownload.bytes,
        mime: videoDownload.mime && videoDownload.mime.startsWith("video/") ? videoDownload.mime : videoMimeFromPath(videoName),
      });
      result.cdnVideoUrl = videoUpload.publicUrl;
      result.previewUrl = videoUpload.publicUrl;
      if (coverBytes && localCoverUrl) {
        const coverUpload = await uploadStaticAssetToTos({
          key: `${baseKey}-cover${path.extname(coverPath) || ".jpg"}`,
          bytes: coverBytes,
          mime: coverMime || "image/jpeg",
        });
        result.cdnCoverUrl = coverUpload.publicUrl;
        result.coverUrl = coverUpload.publicUrl;
      }
    } catch (error) {
      result.cdnError = error.message || "CDN upload failed";
    }
  }

  return result;
}

async function ingestPlatformTemplateMedia({ videoUrl, coverUrl = "", templateId = "" } = {}) {
  const sourceVideoUrl = requireHttpUrl(videoUrl, "Video URL");
  const sourceCoverUrl = String(coverUrl || "").trim() ? requireHttpUrl(coverUrl, "Cover URL") : "";
  const safeId = String(templateId || `template-${Date.now()}`).trim().replace(/[^a-z0-9_-]/gi, "-").slice(0, 64) || `template-${Date.now()}`;
  await fs.mkdir(ADMIN_PLATFORM_TEMPLATE_DIR, { recursive: true });

  const videoDownload = await downloadRemoteFileToBuffer(sourceVideoUrl, { label: "video", maxBytes: 300 * 1024 * 1024 });
  const videoPathname = new URL(sourceVideoUrl).pathname;
  if (!String(videoDownload.mime || "").startsWith("video/") && !isLikelyVideoUrl(videoPathname)) {
    const error = new Error("Video URL must point to a video file.");
    error.statusCode = 400;
    throw error;
  }
  const videoExt = videoExtFromMime(videoDownload.mime, sourceVideoUrl);
  const stamp = Date.now();
  const videoName = `${safeId}-video-${stamp}${videoExt}`;
  const videoPath = path.join(ADMIN_PLATFORM_TEMPLATE_DIR, videoName);
  const localVideoUrl = `/assets/admin/platform-templates/${videoName}`;
  await fs.writeFile(videoPath, videoDownload.bytes);

  let localCoverUrl = "";
  let coverPath = "";
  let coverBytes = null;
  let coverMime = "";
  if (sourceCoverUrl) {
    const coverDownload = await downloadRemoteFileToBuffer(sourceCoverUrl, { label: "cover", maxBytes: 8 * 1024 * 1024, timeoutMs: 120000 });
    const coverPathname = new URL(sourceCoverUrl).pathname;
    if (!String(coverDownload.mime || "").startsWith("image/") && !/\.(png|jpe?g|webp)$/i.test(coverPathname)) {
      const error = new Error("Cover URL must point to an image file.");
      error.statusCode = 400;
      throw error;
    }
    coverMime = coverDownload.mime && coverDownload.mime.startsWith("image/") ? coverDownload.mime : "image/jpeg";
    const coverExt = imageExtFromMime(coverMime);
    const coverName = `${safeId}-cover-${stamp}${coverExt}`;
    coverPath = path.join(ADMIN_PLATFORM_TEMPLATE_DIR, coverName);
    localCoverUrl = `/assets/admin/platform-templates/${coverName}`;
    coverBytes = coverDownload.bytes;
    await fs.writeFile(coverPath, coverBytes);
  } else {
    const coverName = `${safeId}-cover-${stamp}.jpg`;
    coverPath = path.join(ADMIN_PLATFORM_TEMPLATE_DIR, coverName);
    const captured = await captureVideoPosterFrame(videoPath, coverPath);
    if (captured) {
      localCoverUrl = `/assets/admin/platform-templates/${coverName}`;
      coverMime = "image/jpeg";
      coverBytes = await fs.readFile(coverPath);
    }
  }

  const result = {
    sourceVideoUrl,
    sourceCoverUrl,
    localVideoUrl,
    localCoverUrl,
    previewUrl: localVideoUrl,
    coverUrl: localCoverUrl,
    cdnVideoUrl: "",
    cdnCoverUrl: "",
    cdnEnabled: tosEnabled(),
    cdnError: "",
  };

  if (tosEnabled()) {
    try {
      const baseKey = tosStorageKey("admin", "platform-templates", safeId, stamp);
      const videoUpload = await uploadStaticAssetToTos({
        key: `${baseKey}${videoExt}`,
        bytes: videoDownload.bytes,
        mime: videoDownload.mime && videoDownload.mime.startsWith("video/") ? videoDownload.mime : videoMimeFromPath(videoName),
      });
      result.cdnVideoUrl = videoUpload.publicUrl;
      result.previewUrl = videoUpload.publicUrl;
      if (coverBytes && localCoverUrl) {
        const coverUpload = await uploadStaticAssetToTos({
          key: `${baseKey}-cover${path.extname(coverPath) || ".jpg"}`,
          bytes: coverBytes,
          mime: coverMime || "image/jpeg",
        });
        result.cdnCoverUrl = coverUpload.publicUrl;
        result.coverUrl = coverUpload.publicUrl;
      }
    } catch (error) {
      result.cdnError = error.message || "CDN upload failed";
    }
  }

  return result;
}

async function readRawBody(req) {
  const chunks = [];
  let byteLength = 0;
  for await (const chunk of req) {
    chunks.push(chunk);
    byteLength += Buffer.byteLength(chunk);
    if (byteLength > JSON_BODY_MAX_BYTES) {
      throw new Error("Request body too large");
    }
  }

  return Buffer.concat(chunks).toString("utf8");
}

async function readJson(req) {
  const raw = await readRawBody(req);
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
    status: task?.status || task?.state || task?.task_status || raw?.status || "",
    videoUrl,
    error: task?.error?.message || task?.error || raw?.error?.message || raw?.message || "",
  };
}

function findVideoUrl(value) {
  if (!value || typeof value !== "object") return "";
  if (typeof value.video_url === "string") return value.video_url;
  if (typeof value.videoUrl === "string") return value.videoUrl;
  if (typeof value.url === "string" && isLikelyVideoUrl(value.url)) return value.url;

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
    ...(Array.isArray(output.results) ? output.results.map((image) => image?.url || image?.image_url || image?.image) : []),
    output.url,
    output.image_url,
    output.image?.url,
  ].filter(Boolean);
  return direct.length ? direct : collectImageUrls(output);
}

async function gatewayRequest(method, pathname, body = null) {
  if (!UPSTREAM_API_TOKEN) {
    const error = new Error("Gateway upstream token is not configured.");
    error.statusCode = 503;
    error.code = "GATEWAY_TOKEN_NOT_CONFIGURED";
    throw error;
  }
  const response = await fetch(`${UPSTREAM_BASE_URL}${pathname}`, {
    method,
    headers: {
      authorization: `Bearer ${UPSTREAM_API_TOKEN}`,
      accept: "application/json",
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { ok: false, message: text };
  }
  if (!response.ok || payload.ok === false || payload.code >= 400) {
    const error = new Error(payload.message || payload.detail || `Gateway upstream request failed: ${response.status}`);
    error.statusCode = response.status || 502;
    error.code = payload.code || "GATEWAY_UPSTREAM_FAILED";
    error.payload = payload;
    throw error;
  }
  return payload;
}

function gatewayTaskFromPayload(payload = {}) {
  const record = payload.record || payload.data?.record || {};
  const task = payload.task || payload.data?.task || record || payload;
  return {
    taskId: record.taskId || task.taskId || payload.taskId || payload.data?.taskId || "",
    upstreamTaskId: record.upstreamTaskId || task.upstreamTaskId || "",
    status: record.status || task.status || "submitted",
    videoUrl: record.videoUrl || task.videoUrl || findVideoUrl(payload) || "",
    error: record.error || task.error || payload.error || "",
    record,
    raw: payload,
  };
}

async function gatewaySubmitPlatformTask(body = {}) {
  const payload = await gatewayRequest("POST", "/api/platform/generate", body);
  return gatewayTaskFromPayload(payload);
}

async function gatewaySubmitAdvancedTask(body = {}) {
  const payload = await gatewayRequest("POST", "/api/advanced/generate", body);
  return gatewayTaskFromPayload(payload);
}

async function gatewayQueryTask(taskId) {
  const payload = await gatewayRequest("GET", `/api/generation-records/${encodeURIComponent(taskId)}`);
  return gatewayTaskFromPayload(payload);
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

function isLikelyVideoUrl(value = "") {
  return /\.(mp4|webm|mov|m4v)(?:[?#]|$)/i.test(String(value || ""));
}

async function maybeDownloadApizVideo(record = {}, resultUrl = "") {
  if (!record?.taskId || !resultUrl || !isLikelyVideoUrl(resultUrl)) return {};
  try {
    return await downloadGeneratedVideo(record.taskId, resultUrl);
  } catch (error) {
    return { downloadError: error.message || "Failed to download generated video." };
  }
}

async function settleApizGenerationRecord(record = {}, task = {}, reason = "query") {
  if (!record?.taskId || record.provider !== "apiz") return record;
  const status = apizStatus(task) || record.status || "";
  if (!isSucceededStatus(status) && !isFailedStatus(status)) return record;
  if (record.billingSettledAt) {
    const resultUrl = apizResultUrl(task) || record.remoteVideoUrl || "";
    if (isSucceededStatus(status) && resultUrl && !record.localVideoUrl && isLikelyVideoUrl(resultUrl)) {
      const media = await maybeDownloadApizVideo(record, resultUrl);
      if (media.localVideoUrl || media.cdnVideoUrl || media.localPosterUrl) {
        return upsertGenerationRecord({
          taskId: record.taskId,
          videoUrl: localPublicAssetStorageEnabled()
            ? (media.localVideoUrl || media.cdnVideoUrl || record.videoUrl || resultUrl)
            : (media.cdnVideoUrl || media.localVideoUrl || record.videoUrl || resultUrl),
          localVideoUrl: media.localVideoUrl || record.localVideoUrl || "",
          localVideoPath: media.localVideoPath || record.localVideoPath || "",
          localPosterUrl: media.localPosterUrl || record.localPosterUrl || "",
          localPosterPath: media.localPosterPath || record.localPosterPath || "",
          posterUrl: localPublicAssetStorageEnabled()
            ? (media.localPosterUrl || media.cdnPosterUrl || record.posterUrl || "")
            : (media.cdnPosterUrl || media.localPosterUrl || record.posterUrl || ""),
          cdnVideoUrl: media.cdnVideoUrl || record.cdnVideoUrl || "",
          cdnPosterUrl: media.cdnPosterUrl || record.cdnPosterUrl || "",
          cdnError: media.cdnError || record.cdnError || "",
          error: media.downloadError || record.error || "",
        });
      }
    }
    return record;
  }

  let mediaUpdates = {};
  if (isSucceededStatus(status)) {
    const resultUrl = apizResultUrl(task) || record.remoteVideoUrl || "";
    const media = !record.localVideoUrl && isLikelyVideoUrl(resultUrl)
      ? await maybeDownloadApizVideo(record, resultUrl)
      : {};
    if (media.localVideoUrl || media.cdnVideoUrl || media.localPosterUrl || media.downloadError) {
      mediaUpdates = {
        videoUrl: localPublicAssetStorageEnabled()
          ? (media.localVideoUrl || media.cdnVideoUrl || record.videoUrl || resultUrl)
          : (media.cdnVideoUrl || media.localVideoUrl || record.videoUrl || resultUrl),
        localVideoUrl: media.localVideoUrl || record.localVideoUrl || "",
        localVideoPath: media.localVideoPath || record.localVideoPath || "",
        localPosterUrl: media.localPosterUrl || record.localPosterUrl || "",
        localPosterPath: media.localPosterPath || record.localPosterPath || "",
        posterUrl: localPublicAssetStorageEnabled()
          ? (media.localPosterUrl || media.cdnPosterUrl || record.posterUrl || "")
          : (media.cdnPosterUrl || media.localPosterUrl || record.posterUrl || ""),
        cdnVideoUrl: media.cdnVideoUrl || record.cdnVideoUrl || "",
        cdnPosterUrl: media.cdnPosterUrl || record.cdnPosterUrl || "",
        cdnError: media.cdnError || record.cdnError || "",
        error: media.downloadError || record.error || "",
      };
    }
  }

  const db = await readDb();
  let finalCredits = 0;
  let originalFinalCredits = 0;
  let delta = 0;
  let billingStatus = "settled";
  const preDeducted = creditsAmount(record.preDeductedCredits || 0);
  const pricingMultiplier = normalizeUserPricingMultiplier(record.userPricingMultiplier ?? record.pricingMultiplier ?? (db.users || []).find((user) => user.id === record.userId));

  if (isFailedStatus(status)) {
    finalCredits = 0;
    originalFinalCredits = 0;
    delta = preDeducted;
    billingStatus = "refunded";
  } else {
    const reported = extractApizReportedCredits(task) ?? (record.createReportedCredits === undefined ? null : creditsAmount(record.createReportedCredits));
    originalFinalCredits = reported === null
      ? creditsAmount(record.originalPreDeductedCredits ?? record.pricingEstimate?.originalCredits ?? preDeducted)
      : sellingCredits(reported);
    finalCredits = reported === null ? preDeducted : applyUserPricingMultiplierToCredits(originalFinalCredits, pricingMultiplier);
    delta = preDeducted - finalCredits;
  }

  try {
    if (delta > 0) {
      await changeUserCredits(db, record.userId, delta, "generation_refund", {
        taskId: record.taskId,
        reason,
        preDeducted,
        finalCredits,
        originalFinalCredits,
        pricingMultiplier,
      });
      await recordSubtokenAdjustment(record, {
        taskId: record.taskId,
        type: "generation_refund",
        amount: -delta,
        meta: { reason, preDeducted, finalCredits, originalFinalCredits, pricingMultiplier },
      });
      if (!dbEnabled()) await writeDb(db);
    } else if (delta < 0) {
      await changeUserCredits(db, record.userId, delta, "generation_settle", {
        taskId: record.taskId,
        reason,
        preDeducted,
        finalCredits,
        originalFinalCredits,
        pricingMultiplier,
      });
      await recordSubtokenAdjustment(record, {
        taskId: record.taskId,
        type: "generation_settle",
        amount: Math.abs(delta),
        meta: { reason, preDeducted, finalCredits, originalFinalCredits, pricingMultiplier },
      });
      if (!dbEnabled()) await writeDb(db);
    }
  } catch (error) {
    if (error.code === "INSUFFICIENT_CREDITS" || error.code === "SUBTOKEN_QUOTA_EXCEEDED") {
      billingStatus = "settle_pending_insufficient";
      return upsertGenerationRecord({
        taskId: record.taskId,
        finalCredits,
        originalFinalCredits,
        userPricingMultiplier: pricingMultiplier,
        billingStatus,
        billingError: error.message || "Not enough credits or sub token quota for final settlement.",
      });
    }
    throw error;
  }

  return upsertGenerationRecord({
    taskId: record.taskId,
    ...mediaUpdates,
    finalCredits,
    originalFinalCredits,
    userPricingMultiplier: pricingMultiplier,
    billingStatus,
    billingSettledAt: new Date().toISOString(),
    billingError: "",
  });
}

function needsApizFailureRefund(record = {}) {
  if (String(record.provider || "").toLowerCase() !== "apiz") return false;
  if (!record.taskId || !record.userId || !isFailedStatus(record.status)) return false;
  if (String(record.billingStatus || "").toLowerCase() === "refunded") return false;
  const preDeducted = creditsAmount(record.preDeductedCredits || 0);
  const finalCredits = record.finalCredits === undefined || record.finalCredits === null
    ? preDeducted
    : creditsAmount(record.finalCredits || 0);
  return preDeducted > 0 && finalCredits > 0;
}

function needsSeedanceFailureRefund(record = {}) {
  const provider = String(record.provider || "").toLowerCase();
  if (!["seedance", "aliyun-wan27"].includes(provider)) return false;
  if (!record.taskId || !record.userId || !isFailedStatus(record.status)) return false;
  if (String(record.billingStatus || "").toLowerCase() === "refunded") return false;
  const preDeducted = creditsAmount(record.preDeductedCredits || 0);
  const finalCredits = record.finalCredits === undefined || record.finalCredits === null
    ? preDeducted
    : creditsAmount(record.finalCredits || 0);
  return preDeducted > 0 && finalCredits > 0;
}

function seedanceUsesTokenPricing(record = {}) {
  if (String(record.provider || "").toLowerCase() !== "seedance") return false;
  if (record.awaitingUpstreamTask && !record.upstreamTaskId) return false;
  const pricing = record.pricingEstimate && typeof record.pricingEstimate === "object" ? record.pricingEstimate : {};
  if (String(pricing.source || "") === "public_duration_rate") return false;
  if (String(pricing.source || "") === "seedance_token_estimate") return true;
  return String(record.source || "").includes("advanced") && record.billingSettledAt === "";
}

function extractUsageCompletionTokens(value, depth = 0) {
  if (value === null || value === undefined || depth > 30) return null;
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return null;
    if (text.startsWith("{") || text.startsWith("[")) {
      try {
        return extractUsageCompletionTokens(JSON.parse(text), depth + 1);
      } catch {
        return null;
      }
    }
    return null;
  }
  if (Array.isArray(value)) {
    let best = null;
    value.forEach((item) => {
      const next = extractUsageCompletionTokens(item, depth + 1);
      if (next !== null) best = Math.max(best ?? 0, next);
    });
    return best;
  }
  if (typeof value !== "object") return null;

  const usage = value.usage && typeof value.usage === "object" ? value.usage : value;
  for (const key of ["completion_tokens", "output_tokens", "video_tokens"]) {
    const next = Number(usage[key]);
    if (Number.isFinite(next) && next > 0) return Math.ceil(next);
  }

  let best = null;
  for (const item of Object.values(value)) {
    if (!item || typeof item !== "object") continue;
    const next = extractUsageCompletionTokens(item, depth + 1);
    if (next !== null) best = Math.max(best ?? 0, next);
  }
  return best;
}

function seedanceFinalCreditsFromUsage(record = {}) {
  const completionTokens = extractUsageCompletionTokens(record.queryResponse) ?? extractUsageCompletionTokens(record.createResponse);
  if (!completionTokens) return null;
  const pricing = record.pricingEstimate && typeof record.pricingEstimate === "object" ? record.pricingEstimate : {};
  const resolution = normalizeAdvancedResolution(record.resolution || pricing.resolution || record.params?.resolution);
  const yuanPerMillionTokens = Number(pricing.yuanPerMillionTokens || (resolution === "1080p"
    ? ADVANCED_SEEDANCE_1080P_CNY_PER_MILLION_TOKENS
    : ADVANCED_SEEDANCE_720P_CNY_PER_MILLION_TOKENS));
  const markup = Number(pricing.markup || ADVANCED_GENERATION_MARKUP) || ADVANCED_GENERATION_MARKUP;
  const baseCredits = creditsAmount((completionTokens * yuanPerMillionTokens * 100) / 1000000);
  const originalCredits = creditsAmount(Math.round(baseCredits * markup));
  const pricingMultiplier = normalizeUserPricingMultiplier(record.userPricingMultiplier ?? record.pricingMultiplier ?? pricing.userPricingMultiplier ?? 1);
  return {
    completionTokens,
    yuanPerMillionTokens,
    baseCredits,
    markup,
    originalCredits,
    pricingMultiplier,
    credits: applyUserPricingMultiplierToCredits(originalCredits, pricingMultiplier),
  };
}

async function settleSeedanceGenerationRecord(record = {}, reason = "query") {
  const preDeducted = creditsAmount(record.preDeductedCredits || 0);
  if (
    seedanceUsesTokenPricing(record) &&
    record.taskId &&
    record.userId &&
    isSucceededStatus(record.status) &&
    !record.billingSettledAt
  ) {
    const usage = seedanceFinalCreditsFromUsage(record);
    if (!usage) return record;
    const finalCredits = usage.credits;
    const delta = preDeducted - finalCredits;
    let billingStatus = "settled";
    const db = await readDb();
    try {
      if (delta > 0) {
        await changeUserCredits(db, record.userId, delta, "generation_refund", {
          taskId: record.taskId,
          provider: record.provider || "seedance",
          reason,
          preDeducted,
          baseCredits: usage.baseCredits,
          finalCredits,
          originalFinalCredits: usage.originalCredits,
          pricingMultiplier: usage.pricingMultiplier,
          markup: usage.markup,
          completionTokens: usage.completionTokens,
        });
        await recordSubtokenAdjustment(record, {
          taskId: record.taskId,
          type: "generation_refund",
          amount: -delta,
          meta: {
            provider: record.provider || "seedance",
            reason,
            preDeducted,
            finalCredits,
            originalFinalCredits: usage.originalCredits,
          },
        });
        if (!dbEnabled()) await writeDb(db);
      } else if (delta < 0) {
        await changeUserCredits(db, record.userId, delta, "generation_settle", {
          taskId: record.taskId,
          provider: record.provider || "seedance",
          reason,
          preDeducted,
          baseCredits: usage.baseCredits,
          finalCredits,
          originalFinalCredits: usage.originalCredits,
          pricingMultiplier: usage.pricingMultiplier,
          markup: usage.markup,
          completionTokens: usage.completionTokens,
        });
        await recordSubtokenAdjustment(record, {
          taskId: record.taskId,
          type: "generation_settle",
          amount: Math.abs(delta),
          meta: {
            provider: record.provider || "seedance",
            reason,
            preDeducted,
            finalCredits,
            originalFinalCredits: usage.originalCredits,
          },
        });
        if (!dbEnabled()) await writeDb(db);
      }
    } catch (error) {
      if (error.code === "INSUFFICIENT_CREDITS" || error.code === "SUBTOKEN_QUOTA_EXCEEDED") {
        billingStatus = "settle_pending_insufficient";
        return upsertGenerationRecord({
          taskId: record.taskId,
          finalCredits,
          originalFinalCredits: usage.originalCredits,
          userPricingMultiplier: usage.pricingMultiplier,
          billingStatus,
          billingError: error.message || "Not enough credits or sub token quota for final settlement.",
          usageCompletionTokens: usage.completionTokens,
          usageBaseCredits: usage.baseCredits,
        });
      }
      throw error;
    }
    return upsertGenerationRecord({
      taskId: record.taskId,
      finalCredits,
      originalFinalCredits: usage.originalCredits,
      userPricingMultiplier: usage.pricingMultiplier,
      billingStatus,
      billingSettledAt: new Date().toISOString(),
      billingError: "",
      usageCompletionTokens: usage.completionTokens,
      usageBaseCredits: usage.baseCredits,
    });
  }

  if (!needsSeedanceFailureRefund(record)) return record;
  const db = await readDb();
  const alreadyRefunded = (db.creditLedger || []).some((entry) => (
    entry.userId === record.userId &&
    entry.type === "generation_refund" &&
    entry.meta?.taskId === record.taskId
  ));

  try {
    if (!alreadyRefunded) {
      await changeUserCredits(db, record.userId, preDeducted, "generation_refund", {
        taskId: record.taskId,
        provider: record.provider || "seedance",
        reason,
        preDeducted,
        finalCredits: 0,
        originalFinalCredits: 0,
        pricingMultiplier: normalizeUserPricingMultiplier(record.userPricingMultiplier ?? record.pricingMultiplier ?? 1),
      });
      await recordSubtokenAdjustment(record, {
        taskId: record.taskId,
        type: "generation_refund",
        amount: -preDeducted,
        meta: { provider: record.provider || "seedance", reason, preDeducted },
      });
      if (!dbEnabled()) await writeDb(db);
    }
    return upsertGenerationRecord({
      taskId: record.taskId,
      finalCredits: 0,
      originalFinalCredits: 0,
      userPricingMultiplier: normalizeUserPricingMultiplier(record.userPricingMultiplier ?? record.pricingMultiplier ?? 1),
      billingStatus: "refunded",
      billingSettledAt: new Date().toISOString(),
      billingError: "",
    });
  } catch (error) {
    return upsertGenerationRecord({
      taskId: record.taskId,
      billingStatus: "refund_failed",
      billingError: error.message || "Failed to refund failed generation.",
    });
  }
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
    originalPreDeducted: record.originalPreDeductedCredits === undefined || record.originalPreDeductedCredits === null ? null : creditsAmount(record.originalPreDeductedCredits || 0),
    originalFinal: record.originalFinalCredits === undefined || record.originalFinalCredits === null ? null : creditsAmount(record.originalFinalCredits || 0),
    pricingMultiplier: normalizeUserPricingMultiplier(record.userPricingMultiplier ?? record.pricingMultiplier ?? 1),
    settled: Boolean(record.billingSettledAt),
    status: record.billingStatus || "",
  };
}

function platformRecordKind(template = {}) {
  return template.type === "image-to-video" ? "image-to-video" : "text-to-video";
}

function startPlatformGenerationJob(job) {
  setImmediate(() => {
    runPlatformGenerationJob(job).catch((error) => {
      console.error("[platform-generation-job-failed]", job.taskId, error.message || error);
    });
  });
}

async function runPlatformGenerationJob(job = {}) {
  const {
    taskId,
    userId,
    templateId,
    templateTitle,
    templateType,
    prompt,
    imageUrl,
    userAssetId,
    upstreamPayload,
    pricingEstimate,
    preDeductedCredits,
  } = job;

  try {
    await updateGenerationRecord(taskId, {
      status: "submitting",
      awaitingUpstreamTask: true,
      error: "",
    }, "platform-submitting");

    const gatewayBody = {
      templateId,
      prompt,
      params: upstreamPayload?.params || {},
    };
    if (USE_GATEWAY_UPSTREAM && userAssetId) {
      const db = await readDb();
      const asset = (db.userAssets || []).find((entry) => entry.id === userAssetId && entry.userId === userId && !isSoftDeleted(entry));
      if (!asset) {
        const error = new Error("Reference image not found.");
        error.statusCode = 404;
        throw error;
      }
      gatewayBody.dataUrl = await dataUrlForUserAsset(asset);
      gatewayBody.fileName = asset.name || "";
    } else if (userAssetId) {
      gatewayBody.userAssetId = userAssetId;
    }
    const task = USE_GATEWAY_UPSTREAM
      ? await gatewaySubmitPlatformTask(gatewayBody)
      : await apizRequest("/api/v3/tasks/create", upstreamPayload);
    const upstreamTaskId = USE_GATEWAY_UPSTREAM ? task.taskId : apizTaskId(task);
    if (!upstreamTaskId) {
      const error = new Error(`Generation service did not return task id: ${JSON.stringify(task)}`);
      error.statusCode = 502;
      throw error;
    }

    const record = await upsertGenerationRecord({
      taskId,
      upstreamTaskId,
      awaitingUpstreamTask: false,
      status: USE_GATEWAY_UPSTREAM ? task.status : apizStatus(task),
      model: upstreamPayload.model,
      provider: "apiz",
      upstreamSource: USE_GATEWAY_UPSTREAM ? "gateway" : "direct",
      source: "platform-template",
      kind: platformRecordKind({ type: templateType }),
      templateId,
      templateTitle,
      userId,
      userAssetId: userAssetId || "",
      imageUrl,
      prompt,
      finalPrompt: prompt,
      params: upstreamPayload.params,
      upstreamPayload,
      preDeductedCredits,
      originalPreDeductedCredits: pricingEstimate.originalCredits ?? preDeductedCredits,
      userPricingMultiplier: pricingEstimate.userPricingMultiplier ?? 1,
      pricingEstimate: {
        source: pricingEstimate.source,
        pricing: pricingEstimate.pricing || null,
        baseCredits: pricingEstimate.baseCredits ?? null,
        originalCredits: pricingEstimate.originalCredits ?? null,
        userPricingMultiplier: pricingEstimate.userPricingMultiplier ?? 1,
        markup: pricingEstimate.markup ?? GENERATION_PRICE_MARKUP,
      },
      finalCredits: null,
      billingStatus: preDeductedCredits > 0 ? "pre_deducted" : "free",
      billingSettledAt: "",
      billingError: "",
      createResponse: task,
      createReportedCredits: USE_GATEWAY_UPSTREAM ? null : extractApizReportedCredits(task),
      remoteVideoUrl: USE_GATEWAY_UPSTREAM ? task.videoUrl : apizResultUrl(task),
      localVideoUrl: "",
      error: "",
      submittedAt: new Date().toISOString(),
    });
    if (USE_GATEWAY_UPSTREAM) {
      if (isSucceededStatus(record.status) || isFailedStatus(record.status)) {
        await settleApizGenerationRecord(record, {
          status: record.status,
          videoUrl: task.videoUrl,
          error: task.error,
        }, "create");
      }
    } else {
      await settleApizGenerationRecord(record, task, "create");
    }
  } catch (error) {
    console.warn("[platform-generation-job-error]", taskId, error.message || error);
    try {
      const failedRecord = await updateGenerationRecord(taskId, {
        status: "failed",
        awaitingUpstreamTask: false,
        error: error.message || "Generation submission failed.",
        billingError: "",
        failedAt: new Date().toISOString(),
        provider: "apiz",
        source: "platform-template",
        kind: platformRecordKind({ type: templateType }),
        templateId,
        templateTitle,
        model: upstreamPayload?.model || "",
        pricingEstimate: {
          source: pricingEstimate.source,
          pricing: pricingEstimate.pricing || null,
          baseCredits: pricingEstimate.baseCredits ?? null,
          originalCredits: pricingEstimate.originalCredits ?? null,
          userPricingMultiplier: pricingEstimate.userPricingMultiplier ?? 1,
          markup: pricingEstimate.markup ?? GENERATION_PRICE_MARKUP,
        },
        preDeductedCredits,
        originalPreDeductedCredits: pricingEstimate.originalCredits ?? preDeductedCredits,
        userPricingMultiplier: pricingEstimate.userPricingMultiplier ?? 1,
      }, "platform-failed");
      if (failedRecord) {
        await settleApizGenerationRecord(failedRecord, {
          status: "failed",
          error: error.message || "Generation submission failed.",
        }, "platform-submit-failed");
      }
    } catch (updateError) {
      console.error("[platform-generation-fail-update-error]", taskId, updateError.message || updateError);
    }
  }
}

function platformModelRejectsResolution(model = "", params = {}, type = "image-to-video") {
  const resolvedModel = resolvePlatformModelId(model, type);
  const compact = `${resolvedModel} ${params.model || ""}`.toLowerCase().replace(/[\s_/-]+/g, "");
  if (paramsHaveVideoInput(params)) return false;
  return compact.includes("arkseedance2.0") || compact.includes("dreaminaseedance") || compact.includes("seedance2.0fast");
}

function sanitizePlatformPayloadParamsForModel(model = "", params = {}, type = "image-to-video") {
  if (!params || typeof params !== "object" || Array.isArray(params)) return params;
  const next = { ...params };
  if (next.resolution && platformModelRejectsResolution(model, next, type)) {
    delete next.resolution;
  }
  return next;
}

function platformImageFieldKeys(payload = {}) {
  const keys = Object.keys(payload || {}).filter((key) => (
    /^image(?:_file)?_\d+$/i.test(key) ||
    /^image_url$/i.test(key) ||
    /^image_files$/i.test(key) ||
    /^filePaths$/i.test(key) ||
    /^images$/i.test(key) ||
    /^content$/i.test(key)
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
    } else if (key === "images") {
      const images = Array.isArray(next.images) && next.images.length
        ? next.images
        : [{ name: "image_1" }];
      next.images = images.map((item, index) => (
        item && typeof item === "object" && !Array.isArray(item)
          ? { ...item, url: imageUrl }
          : { url: imageUrl, name: `image_${index + 1}` }
      ));
    } else if (key === "content") {
      const content = Array.isArray(next.content) ? next.content : [];
      let replaced = false;
      next.content = content.map((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item) || item.type !== "image_url") return item;
        replaced = true;
        const imageValue = item.image_url && typeof item.image_url === "object" && !Array.isArray(item.image_url)
          ? { ...item.image_url, url: imageUrl }
          : { url: imageUrl };
        return { ...item, image_url: imageValue };
      });
      if (!replaced) {
        next.content.push({ type: "image_url", image_url: { url: imageUrl }, role: "reference_image" });
      }
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
  params.model = resolvePlatformRequestModel(params.model || model, model, template.type);
  if (prompt && !params.prompt) params.prompt = prompt;
  if (params.ratio && !params.aspect_ratio) {
    params.aspect_ratio = params.ratio;
  }
  if ((model === "bytedance/seedance-2.0/fast/image-to-video" || model === "bytedance/seedance-2.0/fast/text-to-video") && !params.resolution) {
    params.resolution = "720p";
  }
  if (template.negativePrompt && !params.negative_prompt) params.negative_prompt = template.negativePrompt;
  const safeParams = sanitizePlatformPayloadParamsForModel(model, params, template.type);
  const replacedParams = replacePlatformPayloadImages(safeParams, imageUrl);
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
      userAsset = await createUserAssetFromDataUrl(auth.db, auth.user, {
        dataUrl: body.dataUrl,
        fileName: body.fileName,
        name: template.title || "Template upload",
      });
      if (USE_GATEWAY_UPSTREAM) {
        imageUrl = userAsset.localUrl || "";
      } else {
        userAsset.publicUrl = "";
        userAsset = await ensurePublicUrlForUserAsset(auth.db, userAsset);
        imageUrl = userAsset.publicUrl;
      }
    } else if (body.userAssetId) {
      userAsset = auth.db.userAssets.find((asset) => asset.id === body.userAssetId && asset.userId === auth.user.id && !isSoftDeleted(asset));
      if (!userAsset) return sendJson(res, 404, { ok: false, message: "上传图片不存在。" });
      if (USE_GATEWAY_UPSTREAM) {
        imageUrl = userAsset.localUrl || userAsset.publicUrl || "";
      } else {
        userAsset = await ensurePublicUrlForUserAsset(auth.db, userAsset);
        imageUrl = userAsset.publicUrl;
      }
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
  const rawPricingEstimate = await estimatePlatformPreDeductCredits(upstreamPayload.model, upstreamPayload.params, template);
  const pricingEstimate = applyUserPricingToEstimate(rawPricingEstimate, auth.user);
  const preDeductedCredits = pricingEstimate.credits;
  if (auth.user.credits < preDeductedCredits) {
    return sendJson(res, 402, insufficientCreditsPayload(preDeductedCredits, auth.user.credits));
  }
  try {
    assertSubtokenCanSpend(auth, preDeductedCredits);
  } catch (error) {
    return sendJson(res, error.statusCode || 402, error.payload || { ok: false, code: error.code || "SUBTOKEN_UNAVAILABLE", message: error.message });
  }

  const taskId = localGenerationTaskId("cgt");

  const record = await upsertGenerationRecord({
    taskId,
    status: "submitting",
    model: upstreamPayload.model,
    provider: "apiz",
    source: "platform-template",
    kind: platformRecordKind(template),
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
    originalPreDeductedCredits: pricingEstimate.originalCredits,
    userPricingMultiplier: pricingEstimate.userPricingMultiplier,
    pricingEstimate: {
      source: pricingEstimate.source,
      pricing: pricingEstimate.pricing || null,
      baseCredits: pricingEstimate.baseCredits ?? null,
      originalCredits: pricingEstimate.originalCredits ?? null,
      userPricingMultiplier: pricingEstimate.userPricingMultiplier ?? 1,
      markup: pricingEstimate.markup ?? GENERATION_PRICE_MARKUP,
    },
    finalCredits: null,
    billingStatus: preDeductedCredits > 0 ? "pre_deducted" : "free",
    billingSettledAt: "",
    billingError: "",
    createResponse: null,
    createReportedCredits: null,
    remoteVideoUrl: "",
    localVideoUrl: "",
    error: "",
    apiTokenId: auth.tokenRecord?.id || "",
    apiTokenName: auth.tokenRecord?.name || "",
    apiTokenType: auth.tokenRecord?.quotaType || "",
    apiTokenSource: auth.tokenSource || "",
  });

  if (preDeductedCredits > 0) {
    await chargeUserWithSubtoken(auth, {
      cost: preDeductedCredits,
      type: "generation_pre_deduct",
      taskId,
      meta: {
        source: "platform-template",
        templateId: template.id,
        templateTitle: template.title,
        pricingSource: pricingEstimate.source,
        originalCost: pricingEstimate.originalCredits,
        pricingMultiplier: pricingEstimate.userPricingMultiplier,
        taskId,
      },
    });
    if (!dbEnabled()) await writeDb(auth.db);
  }

  startPlatformGenerationJob({
    taskId,
    userId: auth.user.id,
    templateId: template.id,
    templateTitle: template.title,
    templateType: template.type,
    prompt,
    imageUrl,
    userAssetId: userAsset?.id || "",
    upstreamPayload,
    pricingEstimate,
    preDeductedCredits,
  });
  const latestDb = await readDb();
  const latestUser = latestDb.users.find((user) => user.id === auth.user.id) || auth.user;

  return sendJson(res, 200, {
    ok: true,
    task: { taskId, status: record.status },
    taskId,
    record: publicGenerationRecord(record, generationRecordResponseOptionsForAuth(auth)),
    user: userView(latestUser),
  });
}

async function handleAdvancedAccessRequest(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  auth.user.advancedAccess = true;
  auth.user.advancedAccessReviewedAt = auth.user.advancedAccessReviewedAt || new Date().toISOString();
  auth.user.updatedAt = new Date().toISOString();
  if (dbEnabled()) await updateUserInDb(auth.user);
  else await writeDb(auth.db);
  return sendJson(res, 200, { ok: true, user: userView(auth.user) });
}

function advancedRuntimeForProvider(provider, requestParams = {}) {
  if (provider === "wan27") {
    return {
      providerName: "aliyun-wan27",
      recordSource: "advanced-wan27",
      model: requestParams.model || ALIYUN_WAN27_MODEL,
      quality: normalizeWan27Resolution(requestParams.resolution),
    };
  }
  return {
    providerName: "seedance",
    recordSource: "advanced-seedance",
    model: requestParams.model || MODEL_QUALITY,
    quality: "high",
  };
}

function startAdvancedGenerationJob(job) {
  setImmediate(() => {
    runAdvancedGenerationJob(job).catch((error) => {
      console.error("[advanced-generation-job-failed]", job.taskId, error.message || error);
    });
  });
}

async function runAdvancedGenerationJob(job = {}) {
  const {
    taskId,
    userId,
    userAssetId,
    extraUserAssetIds = [],
    provider,
    prompt,
    requestParams,
    seedanceMode = "",
    seedanceFirstFrameAssetId = "",
    seedanceEndFrameAssetId = "",
    wan27MediaMode,
    wan27Media,
    pricing,
    cost,
    caseId,
    caseTitle,
    referenceVideoAssetId = "",
    referenceVideoAssetIds = [],
    referenceVideoAssetUris = [],
    referenceAudioAssetUris = [],
    referenceAudioAssetIds = [],
    referenceImageAssetUris = [],
  } = job;
  const bodyParams = requestParams && typeof requestParams === "object" ? requestParamsFromBody(requestParams) : {};
  const runtime = advancedRuntimeForProvider(provider, requestParams);
  let userAsset = null;
  let referenceAssetUri = "";
  let imageUrl = "";
  let sourceImageUrl = "";
  let syntheticReferenceLocalUrl = "";
  let syntheticReferenceUrl = "";
  let seedanceMediaAssets = [];
  let extraReferenceAssetUris = [];
  let seedanceVideoAsset = null;
  let extraSeedanceVideoAssets = [];
  let seedanceAudioAssets = [];
  let seedanceFirstFrameAsset = null;
  let seedanceEndFrameAsset = null;
  let seedanceImageUrl = "";
  let seedanceEndImageUrl = "";
  let referenceVideoAssetUri = "";
  let extraReferenceVideoAssetUris = [];
  let resolvedReferenceAudioAssetUris = [];
  const directReferenceAssetUris = Array.isArray(referenceImageAssetUris)
    ? [...new Set(referenceImageAssetUris.map((uri) => String(uri || "").trim()).filter((uri) => uri.startsWith("asset://")))]
    : [];
  let payload = null;
  let createResponse = null;

  try {
    await updateGenerationRecord(taskId, {
      status: "preparing",
      awaitingUpstreamTask: true,
      error: "",
    }, "advanced-preparing");

    let db = await readDb();
    if (userAssetId) {
      userAsset = (db.userAssets || []).find((asset) => asset.id === userAssetId && asset.userId === userId && !isSoftDeleted(asset));
      if (!userAsset) {
        const error = new Error("Reference image not found.");
        error.statusCode = 404;
        throw error;
      }
    }
    const requestedExtraAssetIds = Array.isArray(extraUserAssetIds) ? extraUserAssetIds.map((id) => String(id || "").trim()).filter(Boolean) : [];
    const extraUserAssets = requestedExtraAssetIds.map((assetId) => (
      (db.userAssets || []).find((asset) => asset.id === assetId && asset.userId === userId && !isSoftDeleted(asset))
    ));
    if (extraUserAssets.some((asset) => !asset)) {
      const error = new Error("Extra reference image not found.");
      error.statusCode = 404;
      throw error;
    }
    if (referenceVideoAssetId) {
      seedanceVideoAsset = (db.userAssets || []).find((asset) => asset.id === referenceVideoAssetId && asset.userId === userId && !isSoftDeleted(asset));
      if (!seedanceVideoAsset) {
        const error = new Error("Reference video not found.");
        error.statusCode = 404;
        throw error;
      }
      validateWan27MediaKind(seedanceVideoAsset, "video", "Seedance reference video");
    }
    const requestedVideoIds = Array.isArray(referenceVideoAssetIds)
      ? referenceVideoAssetIds.map((id) => String(id || "").trim()).filter(Boolean).slice(0, ADVANCED_SEEDANCE_VIDEO_REFERENCE_LIMIT)
      : [];
    const seenRequestedVideoIds = new Set([referenceVideoAssetId].filter(Boolean));
    extraSeedanceVideoAssets = requestedVideoIds
      .filter((assetId) => {
        if (!assetId || seenRequestedVideoIds.has(assetId)) return false;
        seenRequestedVideoIds.add(assetId);
        return true;
      })
      .map((assetId) => (db.userAssets || []).find((asset) => asset.id === assetId && asset.userId === userId && !isSoftDeleted(asset)));
    if (extraSeedanceVideoAssets.some((asset) => !asset)) {
      const error = new Error("Extra reference video not found.");
      error.statusCode = 404;
      throw error;
    }
    extraSeedanceVideoAssets.forEach((asset) => validateWan27MediaKind(asset, "video", "Extra Seedance reference video"));
    const requestedAudioIds = Array.isArray(referenceAudioAssetIds)
      ? referenceAudioAssetIds.map((id) => String(id || "").trim()).filter(Boolean).slice(0, ADVANCED_SEEDANCE_AUDIO_REFERENCE_LIMIT)
      : [];
    seedanceAudioAssets = requestedAudioIds
      .map((assetId) => (db.userAssets || []).find((asset) => asset.id === assetId && asset.userId === userId && !isSoftDeleted(asset)));
    if (seedanceAudioAssets.some((asset) => !asset)) {
      const error = new Error("Reference audio not found.");
      error.statusCode = 404;
      throw error;
    }
    seedanceAudioAssets.forEach((asset) => validateWan27MediaKind(asset, "audio", "Seedance reference audio"));
    if (seedanceFirstFrameAssetId) {
      seedanceFirstFrameAsset = (db.userAssets || []).find((asset) => asset.id === seedanceFirstFrameAssetId && asset.userId === userId && !isSoftDeleted(asset));
      if (!seedanceFirstFrameAsset) {
        const error = new Error("Seedance first-frame image not found.");
        error.statusCode = 404;
        throw error;
      }
      validateWan27MediaKind(seedanceFirstFrameAsset, "image", "Seedance first-frame image");
    }
    if (seedanceEndFrameAssetId) {
      seedanceEndFrameAsset = (db.userAssets || []).find((asset) => asset.id === seedanceEndFrameAssetId && asset.userId === userId && !isSoftDeleted(asset));
      if (!seedanceEndFrameAsset) {
        const error = new Error("Seedance end-frame image not found.");
        error.statusCode = 404;
        throw error;
      }
      validateWan27MediaKind(seedanceEndFrameAsset, "image", "Seedance end-frame image");
    }

    if (userAsset) {
      if (provider === "seedance") {
        if (USE_GATEWAY_UPSTREAM) {
          imageUrl = userAsset.localUrl || userAsset.publicUrl || "";
          sourceImageUrl = userAsset.sourceImageUrl || userAsset.localUrl || "";
        } else {
          const prepared = await prepareSeedanceReferenceAsset(db, userAsset, false);
          userAsset = prepared.asset;
          referenceAssetUri = prepared.referenceAssetUri;
          imageUrl = prepared.imageUrl;
          sourceImageUrl = prepared.sourceImageUrl;
          syntheticReferenceLocalUrl = userAsset.syntheticReferenceLocalUrl || "";
          syntheticReferenceUrl = userAsset.syntheticReferenceUrl || "";
        }
      } else {
        userAsset = await ensurePublicUrlForUserAsset(db, userAsset);
        imageUrl = userAsset.publicUrl || userAsset.localUrl || "";
        sourceImageUrl = userAsset.sourceImageUrl || userAsset.localUrl || "";
      }
    }
    if (provider === "seedance" && directReferenceAssetUris.length) {
      const directQueue = directReferenceAssetUris
        .filter((uri) => uri && uri !== referenceAssetUri)
        .slice(0, ADVANCED_SEEDANCE_REFERENCE_LIMIT);
      if (!referenceAssetUri && directQueue.length) {
        referenceAssetUri = directQueue.shift();
      }
      directQueue.forEach((uri) => {
        if (uri !== referenceAssetUri && !extraReferenceAssetUris.includes(uri)) extraReferenceAssetUris.push(uri);
      });
      extraReferenceAssetUris = extraReferenceAssetUris.slice(0, Math.max(0, ADVANCED_SEEDANCE_REFERENCE_LIMIT - 1));
    }
    if (provider === "seedance" && seedanceVideoAsset) {
      if (USE_GATEWAY_UPSTREAM) {
        imageUrl = imageUrl || seedanceVideoAsset.localUrl || seedanceVideoAsset.publicUrl || "";
      } else {
        const preparedVideo = await prepareSeedanceVideoAsset(db, seedanceVideoAsset);
        seedanceVideoAsset = preparedVideo.asset;
        referenceVideoAssetUri = preparedVideo.referenceAssetUri;
        imageUrl = imageUrl || preparedVideo.videoUrl;
      }
    }
    const extraReferenceVideoUriQueue = [];
    if (provider === "seedance" && extraSeedanceVideoAssets.length && !USE_GATEWAY_UPSTREAM) {
      for (const asset of extraSeedanceVideoAssets) {
        const preparedVideo = await prepareSeedanceVideoAsset(db, asset);
        if (preparedVideo.referenceAssetUri && preparedVideo.referenceAssetUri !== referenceVideoAssetUri && !extraReferenceVideoAssetUris.includes(preparedVideo.referenceAssetUri)) {
          extraReferenceVideoAssetUris.push(preparedVideo.referenceAssetUri);
          extraReferenceVideoUriQueue.push(preparedVideo.referenceAssetUri);
        }
      }
    }
    const audioReferenceUriByAssetId = new Map();
    if (provider === "seedance") {
      resolvedReferenceAudioAssetUris = referenceAudioAssetUris
        .map((uri) => String(uri || "").trim())
        .filter(Boolean);
      if (seedanceAudioAssets.length && !USE_GATEWAY_UPSTREAM) {
        for (const asset of seedanceAudioAssets) {
          const preparedAudio = await prepareSeedanceAudioAsset(db, asset);
          const uri = preparedAudio.referenceAssetUri || preparedAudio.audioUrl || "";
          if (uri && !resolvedReferenceAudioAssetUris.includes(uri)) {
            resolvedReferenceAudioAssetUris.push(uri);
            audioReferenceUriByAssetId.set(asset.id, uri);
          }
        }
      } else if (seedanceAudioAssets.length) {
        for (const asset of seedanceAudioAssets) {
          const uri = asset.localUrl || asset.publicUrl || "";
          if (uri && !resolvedReferenceAudioAssetUris.includes(uri)) {
            resolvedReferenceAudioAssetUris.push(uri);
            audioReferenceUriByAssetId.set(asset.id, uri);
          }
        }
      }
      resolvedReferenceAudioAssetUris = resolvedReferenceAudioAssetUris.slice(0, ADVANCED_SEEDANCE_AUDIO_REFERENCE_LIMIT);
    }
    if (provider === "seedance" && seedanceFirstFrameAsset) {
      if (USE_GATEWAY_UPSTREAM) {
        imageUrl = imageUrl || seedanceFirstFrameAsset.localUrl || seedanceFirstFrameAsset.publicUrl || "";
        sourceImageUrl = sourceImageUrl || seedanceFirstFrameAsset.sourceImageUrl || seedanceFirstFrameAsset.localUrl || "";
      } else {
        const preparedFrame = await prepareSeedanceReferenceAsset(db, seedanceFirstFrameAsset, false);
        seedanceFirstFrameAsset = preparedFrame.asset;
        seedanceImageUrl = preparedFrame.referenceAssetUri;
        imageUrl = imageUrl || preparedFrame.imageUrl;
        sourceImageUrl = sourceImageUrl || preparedFrame.sourceImageUrl;
      }
    }
    if (provider === "seedance" && seedanceEndFrameAsset) {
      if (!USE_GATEWAY_UPSTREAM) {
        const preparedEndFrame = await prepareSeedanceReferenceAsset(db, seedanceEndFrameAsset, false);
        seedanceEndFrameAsset = preparedEndFrame.asset;
        seedanceEndImageUrl = preparedEndFrame.referenceAssetUri;
      }
    }
    if (provider === "seedance") {
      const frameMediaAssets = [
        ...(seedanceFirstFrameAsset ? [{
          type: "image_url",
          key: "image_url",
          userAssetId: seedanceFirstFrameAsset.id,
          referenceAssetUri: seedanceImageUrl,
          imageUrl: seedanceFirstFrameAsset.localUrl || seedanceFirstFrameAsset.publicUrl || imageUrl || "",
          sourceImageUrl: seedanceFirstFrameAsset.sourceImageUrl || seedanceFirstFrameAsset.localUrl || "",
          localUrl: seedanceFirstFrameAsset.localUrl || "",
          mime: seedanceFirstFrameAsset.mime || "",
        }] : []),
        ...(seedanceEndFrameAsset ? [{
          type: "end_image_url",
          key: "end_image_url",
          userAssetId: seedanceEndFrameAsset.id,
          referenceAssetUri: seedanceEndImageUrl,
          imageUrl: seedanceEndFrameAsset.localUrl || seedanceEndFrameAsset.publicUrl || "",
          sourceImageUrl: seedanceEndFrameAsset.sourceImageUrl || seedanceEndFrameAsset.localUrl || "",
          localUrl: seedanceEndFrameAsset.localUrl || "",
          mime: seedanceEndFrameAsset.mime || "",
        }] : []),
      ];
      const videoMediaAsset = [seedanceVideoAsset, ...extraSeedanceVideoAssets].filter(Boolean)
        .slice(0, ADVANCED_SEEDANCE_VIDEO_REFERENCE_LIMIT)
        .map((asset, index) => ({
          type: "reference_video",
          key: `video_${index + 1}`,
          userAssetId: asset.id,
          referenceAssetUri: asset.id === seedanceVideoAsset?.id ? referenceVideoAssetUri : extraReferenceVideoUriQueue.shift() || "",
          videoUrl: asset.localUrl || asset.publicUrl || imageUrl || "",
          localUrl: asset.localUrl || "",
          mime: asset.mime || "",
        }));
      const publicVideoMediaAsset = referenceVideoAssetUris.map((uri, index) => ({
        type: "reference_video",
        key: `video_url_${index + 1}`,
        videoUrl: uri,
      }));
      const publicAudioMediaAssets = referenceAudioAssetUris.map((uri, index) => ({
        type: "reference_audio",
        key: `audio_url_${index + 1}`,
        audioUrl: uri,
      }));
      const assetAudioMediaAssets = seedanceAudioAssets.map((asset, index) => ({
        type: "reference_audio",
        key: `audio_asset_${index + 1}`,
        userAssetId: asset.id,
        referenceAssetUri: audioReferenceUriByAssetId.get(asset.id) || "",
        audioUrl: audioReferenceUriByAssetId.get(asset.id) || asset.publicUrl || asset.localUrl || "",
        localUrl: asset.localUrl || "",
        mime: asset.mime || "",
      }));
      const audioMediaAssets = [...publicAudioMediaAssets, ...assetAudioMediaAssets].slice(0, ADVANCED_SEEDANCE_AUDIO_REFERENCE_LIMIT);
      const directReferenceMediaAssets = extraReferenceAssetUris
        .filter((uri) => directReferenceAssetUris.includes(uri))
        .map((uri, index) => ({
          type: "reference_image",
          key: `seedance_asset_${index + 1}`,
          referenceAssetUri: uri,
          imageUrl: uri,
        }));
      const primaryMediaAsset = USE_GATEWAY_UPSTREAM && userAsset ? [{
        type: "reference_image",
        key: "image_1",
        userAssetId: userAsset.id,
        referenceAssetUri: "",
        imageUrl,
        sourceImageUrl,
        localUrl: userAsset.localUrl || "",
        mime: userAsset.mime || "",
      }] : referenceAssetUri ? [{
        type: "reference_image",
        key: "image_1",
        userAssetId: userAsset?.id || "",
        referenceAssetUri,
        imageUrl,
        sourceImageUrl,
        localUrl: userAsset?.localUrl || "",
        mime: userAsset?.mime || "",
      }] : [];
      const extraMediaAssets = [];
      for (let index = 0; index < extraUserAssets.length; index += 1) {
        if (USE_GATEWAY_UPSTREAM) {
          const asset = extraUserAssets[index];
          extraMediaAssets.push({
            type: "reference_image",
            key: `extra_${index + 1}`,
            userAssetId: asset?.id || "",
            referenceAssetUri: "",
            imageUrl: asset?.localUrl || asset?.publicUrl || "",
            sourceImageUrl: asset?.sourceImageUrl || asset?.localUrl || "",
            localUrl: asset?.localUrl || "",
            mime: asset?.mime || "",
          });
          continue;
        }
        const prepared = await prepareSeedanceReferenceAsset(db, extraUserAssets[index], false);
        if (!prepared.referenceAssetUri || prepared.referenceAssetUri === referenceAssetUri || extraReferenceAssetUris.includes(prepared.referenceAssetUri)) continue;
        extraReferenceAssetUris.push(prepared.referenceAssetUri);
        extraMediaAssets.push({
          type: "reference_image",
          key: `extra_${index + 1}`,
          userAssetId: prepared.asset?.id || extraUserAssets[index]?.id || "",
          referenceAssetUri: prepared.referenceAssetUri,
          imageUrl: prepared.imageUrl,
          sourceImageUrl: prepared.sourceImageUrl,
          localUrl: prepared.asset?.localUrl || "",
          mime: prepared.asset?.mime || "",
        });
      }
      seedanceMediaAssets = [...frameMediaAssets, ...videoMediaAsset, ...publicVideoMediaAsset, ...audioMediaAssets, ...primaryMediaAsset, ...extraMediaAssets, ...directReferenceMediaAssets];
    }

    let resolvedWan27MediaMode = wan27MediaMode || requestParams.mediaMode || "first_frame";
    let resolvedWan27Media = Array.isArray(wan27Media) ? wan27Media : [];
    if (provider === "wan27" && !resolvedWan27Media.length) {
      const resolved = await resolveWan27Media({
        db,
        user: { id: userId },
        body: { dataUrl: userAsset ? "asset" : "", mediaMode: resolvedWan27MediaMode },
        requestParams,
        fallbackAsset: userAsset,
      });
      resolvedWan27MediaMode = resolved.mediaMode;
      resolvedWan27Media = resolved.media;
    }
    if (provider === "wan27" && resolvedWan27Media[0]) {
      imageUrl = resolvedWan27Media.find((item) => item.type === "first_frame" || item.type === "first_clip")?.url || imageUrl;
      sourceImageUrl = imageUrl || sourceImageUrl;
    }

    await updateGenerationRecord(taskId, {
      status: "submitting",
      imageUrl,
      sourceImageUrl,
      syntheticReferenceLocalUrl,
      syntheticReferenceUrl,
      referenceAssetUri,
      mediaMode: provider === "wan27" ? resolvedWan27MediaMode : (seedanceMode || (referenceVideoAssetUri ? "reference_video" : extraReferenceAssetUris.length ? "multi_reference" : "text_to_video")),
      mediaAssets: provider === "wan27" ? resolvedWan27Media : seedanceMediaAssets,
      error: "",
    }, "advanced-reference-ready");

    const config = job.config || await readAppConfig();
    let task = null;
    if (USE_GATEWAY_UPSTREAM) {
      const gatewayBody = {
        ...bodyParams,
        caseId,
        provider,
        prompt,
        ratio: requestParams.ratio,
        resolution: requestParams.resolution,
        duration: requestParams.duration,
        generateAudio: requestParams.generateAudio,
        model: requestParams.model,
        parameters: Object.keys(plainObject(requestParams.parameters)).length ? requestParams.parameters : undefined,
        input: Object.keys(plainObject(requestParams.input)).length ? requestParams.input : undefined,
        mediaMode: provider === "wan27" ? resolvedWan27MediaMode : (seedanceMode || undefined),
        seedanceMode: provider === "seedance" ? (seedanceMode || undefined) : undefined,
        seed: requestParams.seed === undefined || requestParams.seed === "" ? undefined : requestParams.seed,
      };
      if (provider === "seedance") {
        const webSearchValue = firstPresent(requestParams.web_search, requestParams.webSearch, requestParams.parameters?.web_search, requestParams.parameters?.webSearch);
        const watermarkValue = firstPresent(requestParams.watermark, requestParams.parameters?.watermark);
        if (webSearchValue !== undefined) gatewayBody.web_search = boolFromRequest(webSearchValue, false);
        if (watermarkValue !== undefined) gatewayBody.watermark = boolFromRequest(watermarkValue, false);
      }
      if (provider === "wan27") {
        const dbForGateway = await readDb();
        const assetMap = new Map((dbForGateway.userAssets || []).map((asset) => [asset.id, asset]));
        for (const item of resolvedWan27Media) {
          const asset = item.userAssetId ? assetMap.get(item.userAssetId) : null;
          if (asset) {
            gatewayBody[`${item.key}DataUrl`] = await dataUrlForUserAsset(asset);
            gatewayBody[`${item.key}FileName`] = asset.name || "";
          } else if (item.url) {
            gatewayBody[`${item.key}Url`] = item.url;
          }
        }
      } else {
        const dbForGateway = await readDb();
        const assetMap = new Map((dbForGateway.userAssets || []).map((asset) => [asset.id, asset]));
        const referenceImages = [];
        const gatewayVideoIds = [];
        for (const item of seedanceMediaAssets) {
          const asset = item.userAssetId ? assetMap.get(item.userAssetId) : null;
          if (asset && item.type === "reference_video") {
            gatewayVideoIds.push(asset.id);
          } else if (asset && item.type === "image_url") {
            gatewayBody.firstFrameDataUrl = await dataUrlForUserAsset(asset);
            gatewayBody.seedanceMode = seedanceMode || "first_frame";
          } else if (asset && item.type === "end_image_url") {
            gatewayBody.endImageDataUrl = await dataUrlForUserAsset(asset);
            gatewayBody.seedanceMode = "first_last_frame";
          } else if (asset) {
            referenceImages.push({
              dataUrl: await dataUrlForUserAsset(asset),
              fileName: asset.name || "",
              name: asset.name || "Reference",
            });
          }
        }
        if (gatewayVideoIds.length) {
          gatewayBody.referenceVideoAssetId = gatewayVideoIds[0];
          gatewayBody.referenceVideoAssetIds = gatewayVideoIds;
        }
        if (referenceVideoAssetUris.length) gatewayBody.referenceVideoUrls = referenceVideoAssetUris;
        if (resolvedReferenceAudioAssetUris.length) gatewayBody.referenceAudios = resolvedReferenceAudioAssetUris;
        if (referenceImages.length) gatewayBody.referenceImages = referenceImages;
      }
      task = await gatewaySubmitAdvancedTask(gatewayBody);
      payload = gatewayBody;
      createResponse = task.raw;
    } else if (provider === "wan27") {
      if (!resolvedWan27Media.length) {
        const error = new Error("Wan2.7 requires media input.");
        error.statusCode = 400;
        throw error;
      }
      const submitted = await submitWan27VideoTask({
        prompt,
        media: resolvedWan27Media,
        body: requestParams,
      });
      task = submitted.task;
      payload = submitted.payload;
      createResponse = submitted.raw;
    } else {
      const submitted = await submitSeedanceVideoTask({
        config,
        prompt,
        referenceAssetUri,
        extraReferenceAssetUris,
        firstFrameAssetUri: seedanceImageUrl || requestParams.image_url || "",
        lastFrameAssetUri: seedanceEndImageUrl || requestParams.end_image_url || "",
        referenceVideoAssetUri,
        extraReferenceVideoAssetUris: [...extraReferenceVideoAssetUris, ...referenceVideoAssetUris],
        referenceAudioAssetUris: resolvedReferenceAudioAssetUris,
        body: {
          ...requestParams,
        },
        slug: "advanced",
      });
      task = submitted.task;
      payload = submitted.payload;
      createResponse = submitted.raw || task;
    }

    const upstreamTaskId = task?.taskId || "";
    if (!upstreamTaskId) {
      const error = new Error(`Generation service did not return task id: ${JSON.stringify(task || createResponse || {})}`);
      error.statusCode = 502;
      throw error;
    }

    const submittedAt = new Date().toISOString();
    const fixedBilling = {
      finalCredits: cost,
      originalFinalCredits: pricing?.originalCredits ?? cost,
      userPricingMultiplier: pricing?.userPricingMultiplier ?? 1,
      billingStatus: cost > 0 ? "settled" : "free",
      billingSettledAt: cost > 0 ? submittedAt : "",
    };
    await updateGenerationRecord(taskId, {
      status: task.status || "submitted",
      upstreamTaskId,
      awaitingUpstreamTask: false,
      model: runtime.model,
      provider: runtime.providerName,
      upstreamSource: USE_GATEWAY_UPSTREAM ? "gateway" : "direct",
      source: runtime.recordSource,
      kind: "advanced-video",
      imageUrl,
      sourceImageUrl,
      syntheticReferenceLocalUrl,
      syntheticReferenceUrl,
      referenceAssetUri,
      mediaMode: provider === "wan27" ? resolvedWan27MediaMode : (seedanceMode || (referenceVideoAssetUri ? "reference_video" : extraReferenceAssetUris.length ? "multi_reference" : "text_to_video")),
      mediaAssets: provider === "wan27" ? resolvedWan27Media : seedanceMediaAssets,
      upstreamPayload: payload,
      ratio: payload?.ratio || requestParams.ratio || "",
      resolution: payload?.resolution || payload?.parameters?.resolution || requestParams.resolution || "",
      duration: payload?.duration || payload?.parameters?.duration || requestParams.duration,
      quality: runtime.quality,
      remoteVideoUrl: task.videoUrl || "",
      error: "",
      createResponse,
      submittedAt,
      ...fixedBilling,
    }, "advanced-submit");
  } catch (error) {
    console.warn("[advanced-generation-job-error]", taskId, error.message || error);
    try {
      await updateGenerationRecord(taskId, {
        status: "failed",
        awaitingUpstreamTask: false,
        error: error.message || "Advanced generation failed.",
        billingError: "",
        failedAt: new Date().toISOString(),
        provider: runtime.providerName,
        source: runtime.recordSource,
        model: runtime.model,
        kind: "advanced-video",
        pricingEstimate: pricing,
        preDeductedCredits: cost,
        originalPreDeductedCredits: pricing?.originalCredits ?? cost,
        userPricingMultiplier: pricing?.userPricingMultiplier ?? 1,
        templateId: caseId || "",
        templateTitle: caseTitle || "Advanced generation",
      }, "advanced-failed");
    } catch (updateError) {
      console.error("[advanced-generation-fail-update-error]", taskId, updateError.message || updateError);
    }
  }
}

async function handleAdvancedGenerate(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;

  const body = await readJson(req);
  const config = await readAppConfig();
  const advanced = config.platform?.advanced || {};
  const cases = Array.isArray(advanced.cases) ? advanced.cases : [];
  const bodyParams = requestParamsFromBody(body);
  const selectedCase = cases.find((item) => item.id === String(firstPresent(body.caseId, bodyParams.caseId, "")).trim());
  const caseParams = selectedCase?.params && typeof selectedCase.params === "object" ? selectedCase.params : {};
  const mergedBody = mergedRequestForMedia(body, caseParams);
  const provider = normalizeAdvancedProvider(firstPresent(
    body.provider,
    bodyParams.provider,
    selectedCase?.provider,
    caseParams.provider,
    caseParams.modelProvider,
    caseParams.model_provider,
  ));
  if (USE_GATEWAY_UPSTREAM && !UPSTREAM_API_TOKEN) {
    return sendJson(res, 503, { ok: false, code: "GATEWAY_TOKEN_NOT_CONFIGURED", message: "Gateway upstream token is not configured." });
  }
  if (!USE_GATEWAY_UPSTREAM && provider === "seedance" && !ARK_API_KEY) {
    return sendJson(res, 503, { ok: false, code: "MISSING_ARK_API_KEY", message: "Seedance generation is not configured." });
  }
  if (!USE_GATEWAY_UPSTREAM && provider === "wan27" && !ALIYUN_DASHSCOPE_API_KEY) {
    return sendJson(res, 503, { ok: false, code: "MISSING_ALIYUN_DASHSCOPE_API_KEY", message: "Wan2.7 generation is not configured." });
  }
  const prompt = String(firstPresent(body.prompt, bodyParams.prompt, selectedCase?.prompt, caseParams.prompt, "")).trim();
  if (!prompt) return sendJson(res, 400, { ok: false, message: "Prompt is required." });
  const durationBounds = advancedDurationBounds(provider);
  const mergedProviderParameters = {
    ...plainObject(caseParams.parameters),
    ...plainObject(bodyParams.parameters),
    ...plainObject(body.parameters),
  };

  const requestParams = {
    ...caseParams,
    ...bodyParams,
    provider,
    seedanceTier: normalizeSeedanceTier(firstPresent(body.seedanceTier, bodyParams.seedanceTier, caseParams.seedanceTier)),
    ratio: firstPresent(body.ratio, body.aspect_ratio, bodyParams.ratio, bodyParams.aspect_ratio, caseParams.ratio, caseParams.aspect_ratio, config.video.ratio, "9:16"),
    resolution: firstPresent(body.resolution, bodyParams.resolution, mergedProviderParameters.resolution, caseParams.resolution, config.video.resolution, "720p"),
    duration: clampNumber(
      firstPresent(body.duration, body.durationSeconds, bodyParams.duration, bodyParams.durationSeconds, mergedProviderParameters.duration, caseParams.duration),
      config.video.duration || durationBounds.fallback,
      durationBounds.min,
      durationBounds.max,
    ),
    generateAudio: boolFromRequest(firstPresent(body.generateAudio, body.generate_audio, bodyParams.generateAudio, bodyParams.generate_audio, caseParams.generateAudio, caseParams.generate_audio), true),
  };
  requestParams.ratio = normalizeVideoRatio(requestParams.ratio);
  requestParams.resolution = provider === "wan27" ? normalizeWan27Resolution(requestParams.resolution) : normalizeAdvancedResolution(requestParams.resolution);
  requestParams.preprocessReference = false;
  requestParams.seed = firstPresent(body.seed, bodyParams.seed, mergedProviderParameters.seed, caseParams.seed, "");
  requestParams.model = String(firstPresent(
    body.model,
    bodyParams.model,
    caseParams.model,
    provider === "wan27"
      ? ALIYUN_WAN27_MODEL
      : requestParams.seedanceTier === "fast"
      ? MODEL_FAST
      : MODEL_QUALITY,
  ));
  requestParams.input = plainObject(firstPresent(body.input, bodyParams.input, caseParams.input, {}));
  requestParams.parameters = mergedProviderParameters;
  if (provider === "seedance" && requestParams.seedanceTier === "fast" && requestParams.resolution === "1080p") {
    return sendJson(res, 400, { ok: false, code: "INVALID_SEEDANCE_FAST_RESOLUTION", message: "Seedance Fast does not support 1080p." });
  }
  if (provider === "seedance") {
    [
      "image_url",
      "end_image_url",
      "reference_images",
      "content",
      "web_search",
      "webSearch",
      "watermark",
      "seed",
      "fps",
      "camera_fixed",
    ].forEach((field) => {
      const value = firstPresent(body[field], bodyParams[field], caseParams[field]);
      if (value !== undefined) requestParams[field] = value;
    });
  }
  let userAsset = null;
  let extraUserAssets = [];
  let extraUserAssetIds = [];
  let seedanceVideoAsset = null;
  let seedanceVideoAssets = [];
  let seedanceAudioAssets = [];
  let referenceVideoAssetIds = [];
  let referenceVideoAssetUris = [];
  let referenceAudioAssetUris = [];
  let referenceAudioAssetIds = [];
  let referenceImageAssetUris = [];
  let seedanceMode = "";
  let seedanceFirstFrameAsset = null;
  let seedanceEndFrameAsset = null;
  if (provider !== "wan27") {
    seedanceMode = normalizeSeedanceMode(firstPresent(body.seedanceMode, body.mediaMode, bodyParams.seedanceMode, bodyParams.mediaMode, caseParams.seedanceMode, caseParams.mediaMode), mergedBody);
    requestParams.seedanceMode = seedanceMode;
    const firstFrameInput = seedanceFirstFrameInputFromBody(mergedBody, {
      includeDataUrlFallback: seedanceModeNeedsFirstFrame(seedanceMode),
      includeUserAssetId: seedanceModeNeedsFirstFrame(seedanceMode),
    });
    const endFrameInput = seedanceEndFrameInputFromBody(mergedBody);
    if (seedanceModeNeedsFirstFrame(seedanceMode)) {
      seedanceFirstFrameAsset = await createSingleSeedanceImageAssetFromInput(auth.db, auth.user, firstFrameInput, { name: "Seedance first frame" });
      const rawFirstFrameUrl = String(firstPresent(mergedBody.image_url, mergedBody.firstFrameRawUrl, "") || "").trim();
      if (!seedanceFirstFrameAsset && !rawFirstFrameUrl) {
        return sendJson(res, 400, { ok: false, message: "Seedance image-to-video requires imageUrl, firstFrameUrl, imageAssetId, firstFrameAssetId, or dataUrl." });
      }
    }
    if (seedanceModeNeedsEndFrame(seedanceMode)) {
      seedanceEndFrameAsset = await createSingleSeedanceImageAssetFromInput(auth.db, auth.user, endFrameInput, { name: "Seedance end frame" });
      const rawEndFrameUrl = String(firstPresent(mergedBody.end_image_url, mergedBody.endImageRawUrl, "") || "").trim();
      if (!seedanceEndFrameAsset && !rawEndFrameUrl) {
        return sendJson(res, 400, { ok: false, message: "Seedance first/last-frame mode requires endImageUrl, lastFrameUrl, endImageAssetId, lastFrameAssetId, or endImageDataUrl." });
      }
    } else if (endFrameInput) {
      seedanceEndFrameAsset = await createSingleSeedanceImageAssetFromInput(auth.db, auth.user, endFrameInput, { name: "Seedance end frame" });
      if (seedanceEndFrameAsset) {
        seedanceMode = "first_last_frame";
        requestParams.seedanceMode = seedanceMode;
      }
    }
    referenceVideoAssetIds = seedanceReferenceVideoAssetIdsFromBody(mergedBody);
    if (referenceVideoAssetIds.length) {
      seedanceVideoAsset = auth.db.userAssets.find((asset) => asset.id === referenceVideoAssetIds[0] && asset.userId === auth.user.id && !isSoftDeleted(asset));
      if (!seedanceVideoAsset) return sendJson(res, 404, { ok: false, message: "Reference video not found." });
      try {
        validateWan27MediaKind(seedanceVideoAsset, "video", "Seedance reference video");
      } catch (error) {
        return sendJson(res, 400, { ok: false, message: error.message || "Seedance reference video must be a video." });
      }
      seedanceVideoAssets = referenceVideoAssetIds.map((assetId) => auth.db.userAssets.find((asset) => asset.id === assetId && asset.userId === auth.user.id && !isSoftDeleted(asset)));
      if (seedanceVideoAssets.some((asset) => !asset)) return sendJson(res, 404, { ok: false, message: "Reference video not found." });
      try {
        seedanceVideoAssets.forEach((asset) => validateWan27MediaKind(asset, "video", "Seedance reference video"));
      } catch (error) {
        return sendJson(res, 400, { ok: false, message: error.message || "Seedance reference video must be a video." });
      }
    }
    try {
      referenceImageAssetUris = seedanceReferenceAssetUrisFromBody(mergedBody);
      if (referenceImageAssetUris.length) requestParams.referenceImageAssetUris = referenceImageAssetUris;
    } catch (error) {
      return sendJson(res, error.statusCode || 400, { ok: false, message: error.message || "Seedance reference image assetUri is invalid." });
    }
    try {
      referenceVideoAssetUris = seedanceReferenceVideoUrlInputsFromBody(mergedBody);
      if (referenceVideoAssetUris.length) requestParams.reference_videos = referenceVideoAssetUris;
    } catch (error) {
      return sendJson(res, error.statusCode || 400, { ok: false, message: error.message || "Seedance reference video is invalid." });
    }
    try {
      referenceAudioAssetUris = seedanceReferenceAudioInputsFromBody(mergedBody);
      referenceAudioAssetIds = seedanceReferenceAudioAssetIdsFromBody(mergedBody);
    } catch (error) {
      return sendJson(res, error.statusCode || 400, { ok: false, message: error.message || "Seedance reference audio is invalid." });
    }
    if (referenceAudioAssetIds.length) {
      seedanceAudioAssets = referenceAudioAssetIds.map((assetId) => auth.db.userAssets.find((asset) => asset.id === assetId && asset.userId === auth.user.id && !isSoftDeleted(asset)));
      if (seedanceAudioAssets.some((asset) => !asset)) return sendJson(res, 404, { ok: false, message: "Reference audio not found." });
      try {
        seedanceAudioAssets.forEach((asset) => validateWan27MediaKind(asset, "audio", "Seedance reference audio"));
      } catch (error) {
        return sendJson(res, 400, { ok: false, message: error.message || "Seedance reference audio must be audio." });
      }
    }
    if (referenceAudioAssetUris.length) {
      requestParams.reference_audios = referenceAudioAssetUris;
    }
    if (referenceVideoAssetIds.length || referenceVideoAssetUris.length) {
      seedanceMode = "reference_video";
      requestParams.seedanceMode = seedanceMode;
    }
    const referenceInputs = seedanceReferenceInputsFromBody(mergedBody, { includeDataUrlFallback: !seedanceModeNeedsFirstFrame(seedanceMode) });
    const createdReferenceAssets = await createUserImageAssetsFromInputs(auth.db, auth.user, referenceInputs, {
      name: selectedCase?.title || "Advanced reference",
    });
    if (createdReferenceAssets.length) {
      [userAsset, ...extraUserAssets] = createdReferenceAssets;
    } else {
      const referenceAssetIds = seedanceReferenceAssetIdsFromBody(mergedBody, {
        includeUserAssetId: !seedanceModeNeedsFirstFrame(seedanceMode),
        includeImageAssetId: !seedanceModeNeedsFirstFrame(seedanceMode),
      });
      if (referenceAssetIds.length) {
        const foundAssets = referenceAssetIds.map((assetId) => auth.db.userAssets.find((asset) => asset.id === assetId && asset.userId === auth.user.id && !isSoftDeleted(asset)));
        if (foundAssets.some((asset) => !asset)) return sendJson(res, 404, { ok: false, message: "Reference image not found." });
        try {
          foundAssets.forEach((asset) => validateWan27MediaKind(asset, "image", "Seedance reference image"));
        } catch (error) {
          return sendJson(res, 400, { ok: false, message: error.message || "Seedance reference image must be an image." });
        }
        [userAsset, ...extraUserAssets] = foundAssets;
      }
    }
    const seenSeedanceAssetIds = new Set([
      userAsset?.id,
      seedanceFirstFrameAsset?.id,
      seedanceEndFrameAsset?.id,
      ...extraUserAssets.map((asset) => asset?.id || ""),
    ].filter(Boolean));
    for (const assetId of seedanceExtraReferenceAssetIdsFromBody(mergedBody)) {
      if (seenSeedanceAssetIds.has(assetId) || extraUserAssets.length >= ADVANCED_SEEDANCE_REFERENCE_LIMIT - 1) continue;
      const asset = auth.db.userAssets.find((entry) => entry.id === assetId && entry.userId === auth.user.id && !isSoftDeleted(entry));
      if (!asset) return sendJson(res, 404, { ok: false, message: "Extra reference image not found." });
      try {
        validateWan27MediaKind(asset, "image", "Extra reference image");
      } catch (error) {
        return sendJson(res, 400, { ok: false, message: error.message || "Extra reference image must be an image." });
      }
      extraUserAssets.push(asset);
      seenSeedanceAssetIds.add(asset.id);
    }
    extraUserAssets = extraUserAssets.slice(0, Math.max(0, ADVANCED_SEEDANCE_REFERENCE_LIMIT - 1));
    extraUserAssetIds = extraUserAssets.map((asset) => asset.id);
  } else {
    const firstFrameDataUrl = firstPresent(body.firstFrameDataUrl, body.first_frame_data_url, body.dataUrl, bodyParams.firstFrameDataUrl, bodyParams.first_frame_data_url, bodyParams.dataUrl);
    if (firstFrameDataUrl) {
      userAsset = await createUserWanMediaAssetFromDataUrl(auth.db, auth.user, {
        dataUrl: firstFrameDataUrl,
        fileName: firstPresent(body.firstFrameFileName, body.fileName, bodyParams.firstFrameFileName, bodyParams.fileName, ""),
        name: selectedCase?.title || "Advanced reference",
      });
    } else if (firstPresent(body.userAssetId, body.firstFrameAssetId, bodyParams.userAssetId, bodyParams.firstFrameAssetId)) {
      const firstAssetId = firstPresent(body.firstFrameAssetId, body.userAssetId, bodyParams.firstFrameAssetId, bodyParams.userAssetId);
      userAsset = auth.db.userAssets.find((asset) => asset.id === firstAssetId && asset.userId === auth.user.id && !isSoftDeleted(asset));
      if (!userAsset) return sendJson(res, 404, { ok: false, message: "Reference image not found." });
    }
  }
  let wan27MediaMode = "";
  let wan27Media = [];
  if (provider === "wan27") {
    requestParams.mediaMode = normalizeWan27MediaMode(firstPresent(
      body.mediaMode,
      body.wanMode,
      body.wanMediaMode,
      bodyParams.mediaMode,
      bodyParams.wanMode,
      bodyParams.wanMediaMode,
      caseParams.mediaMode,
      "first_frame",
    ));
    const resolved = await resolveWan27Media({
      db: auth.db,
      user: auth.user,
      body: mergedBody,
      requestParams,
      fallbackAsset: userAsset,
    });
    wan27MediaMode = resolved.mediaMode;
    wan27Media = resolved.media;
  }
  if (provider === "seedance") {
    requestParams.inputVideoSeconds = await seedanceVideoInputSecondsForPricingWithProbe(mergedBody, {
      requestParams,
      assets: seedanceVideoAssets,
      assetIds: referenceVideoAssetIds,
    });
  }
  const rawPricing = advancedModelPricing(provider, {
    ...requestParams,
    advancedPricing: config.platform?.advancedPricing,
  });
  const pricing = applyUserPricingToEstimate(rawPricing, auth.user);
  const cost = pricing.credits;
  if (auth.user.credits < cost) {
    return sendJson(res, 402, insufficientCreditsPayload(cost, auth.user.credits));
  }
  try {
    assertSubtokenCanSpend(auth, cost);
  } catch (error) {
    return sendJson(res, error.statusCode || 402, error.payload || {
      ok: false,
      code: error.code || "SUBTOKEN_QUOTA_EXCEEDED",
      message: error.message || "Sub token quota is not enough.",
    });
  }
  const runtime = advancedRuntimeForProvider(provider, requestParams);
  const taskId = localGenerationTaskId("cgt");
  const primaryWanMedia = wan27Media.find((item) => item.type === "first_frame" || item.type === "first_clip") || wan27Media[0] || null;
  const seedancePrimaryVisual = seedanceFirstFrameAsset || userAsset || seedanceVideoAsset || null;
  const initialImageUrl = primaryWanMedia?.localUrl || primaryWanMedia?.url || seedancePrimaryVisual?.localUrl || seedancePrimaryVisual?.publicUrl || "";
  const initialSourceImageUrl = primaryWanMedia?.localUrl || seedanceFirstFrameAsset?.sourceImageUrl || seedanceFirstFrameAsset?.localUrl || userAsset?.sourceImageUrl || userAsset?.localUrl || "";
  const initialSeedanceMediaAssets = provider === "seedance"
    ? [
        ...(seedanceFirstFrameAsset ? [{
          type: "image_url",
          key: "image_url",
          userAssetId: seedanceFirstFrameAsset.id,
          imageUrl: seedanceFirstFrameAsset.localUrl || seedanceFirstFrameAsset.publicUrl || "",
          sourceImageUrl: seedanceFirstFrameAsset.sourceImageUrl || seedanceFirstFrameAsset.localUrl || "",
          localUrl: seedanceFirstFrameAsset.localUrl || "",
          mime: seedanceFirstFrameAsset.mime || "",
        }] : []),
        ...(seedanceEndFrameAsset ? [{
          type: "end_image_url",
          key: "end_image_url",
          userAssetId: seedanceEndFrameAsset.id,
          imageUrl: seedanceEndFrameAsset.localUrl || seedanceEndFrameAsset.publicUrl || "",
          sourceImageUrl: seedanceEndFrameAsset.sourceImageUrl || seedanceEndFrameAsset.localUrl || "",
          localUrl: seedanceEndFrameAsset.localUrl || "",
          mime: seedanceEndFrameAsset.mime || "",
        }] : []),
        ...seedanceVideoAssets.map((asset, index) => ({
          type: "reference_video",
          key: `video_${index + 1}`,
          userAssetId: asset.id,
          videoUrl: asset.localUrl || asset.publicUrl || "",
          localUrl: asset.localUrl || "",
          mime: asset.mime || "",
        })),
        ...referenceAudioAssetUris.map((uri, index) => ({
          type: "reference_audio",
          key: `audio_${index + 1}`,
          audioUrl: uri,
        })),
        ...seedanceAudioAssets.map((asset, index) => ({
          type: "reference_audio",
          key: `audio_asset_${index + 1}`,
          userAssetId: asset.id,
          audioUrl: asset.localUrl || asset.publicUrl || "",
          localUrl: asset.localUrl || "",
          mime: asset.mime || "",
        })),
        ...(userAsset ? [{
          type: "reference_image",
          key: "image_1",
          userAssetId: userAsset.id,
          imageUrl: userAsset.localUrl || userAsset.publicUrl || "",
          sourceImageUrl: userAsset.sourceImageUrl || userAsset.localUrl || "",
          localUrl: userAsset.localUrl || "",
          mime: userAsset.mime || "",
        }] : []),
        ...extraUserAssets.map((asset, index) => ({
          type: "reference_image",
          key: `extra_${index + 1}`,
          userAssetId: asset.id,
          imageUrl: asset.localUrl || asset.publicUrl || "",
          sourceImageUrl: asset.sourceImageUrl || asset.localUrl || "",
          localUrl: asset.localUrl || "",
          mime: asset.mime || "",
        })),
      ]
    : [];
  const initialMediaMode = provider === "wan27" ? wan27MediaMode : seedanceMode;

  if (cost > 0) {
    await chargeUserWithSubtoken(auth, {
      cost,
      type: "advanced_generation",
      taskId,
      meta: {
        taskId,
        provider: runtime.providerName,
        model: runtime.model,
        caseId: selectedCase?.id || "",
        caseTitle: selectedCase?.title || "",
        duration: requestParams.duration,
        creditsPerSecond: pricing.creditsPerSecond,
        outputCredits: pricing.outputCredits,
        inputVideoSeconds: pricing.videoInputSeconds || 0,
        videoInputCreditsPerSecond: pricing.videoInputCreditsPerSecond || 0,
        videoInputCredits: pricing.videoInputCredits || 0,
        baseCredits: pricing.baseCredits,
        originalCost: pricing.originalCredits,
        pricingMultiplier: pricing.userPricingMultiplier,
        markup: pricing.markup,
        resolution: pricing.resolution || requestParams.resolution,
        ratio: pricing.ratio || requestParams.ratio,
        outputTokens: pricing.outputTokens || null,
        yuanPerMillionTokens: pricing.yuanPerMillionTokens || null,
        pricingSource: pricing.source || "duration_rate",
        preprocessReference: requestParams.preprocessReference,
        userAssetId: userAsset?.id || "",
        seedanceFirstFrameAssetId: seedanceFirstFrameAsset?.id || "",
        seedanceEndFrameAssetId: seedanceEndFrameAsset?.id || "",
        referenceVideoAssetId: seedanceVideoAsset?.id || "",
        referenceVideoAssetIds,
        referenceVideoAssetUris,
        referenceAudioAssetUris,
        referenceAudioAssetIds,
        referenceImageAssetUris,
        extraUserAssetIds,
        mediaMode: provider === "seedance" ? initialMediaMode : wan27MediaMode,
        mediaAssets: provider === "wan27"
          ? wan27Media.map((item) => ({ type: item.type, key: item.key, userAssetId: item.userAssetId || "", mediaKind: item.mediaKind || "" }))
          : initialSeedanceMediaAssets.map((item) => ({ type: item.type, key: item.key, userAssetId: item.userAssetId || "", audioUrl: item.audioUrl || "", videoUrl: item.videoUrl || "" })),
        referenceAssetUri: "",
      },
    });
    if (!dbEnabled()) await writeDb(auth.db);
  }

  const record = await upsertGenerationRecord({
    taskId,
    status: "preparing",
    model: runtime.model,
    provider: runtime.providerName,
    source: runtime.recordSource,
    kind: "advanced-video",
    templateId: selectedCase?.id || "",
    templateTitle: selectedCase?.title || "Advanced generation",
    userId: auth.user.id,
    userAssetId: userAsset?.id || "",
    mediaMode: provider === "seedance" ? initialMediaMode : wan27MediaMode,
    mediaAssets: provider === "wan27" ? wan27Media : initialSeedanceMediaAssets,
    imageUrl: initialImageUrl,
    sourceImageUrl: initialSourceImageUrl,
    syntheticReferenceLocalUrl: "",
    syntheticReferenceUrl: "",
    referenceAssetUri: "",
    prompt,
    finalPrompt: prompt,
    params: requestParams,
    upstreamPayload: null,
    ratio: requestParams.ratio || "",
    resolution: requestParams.resolution || "",
    duration: requestParams.duration,
    quality: runtime.quality,
    remoteVideoUrl: "",
    localVideoUrl: "",
    error: "",
    preDeductedCredits: cost,
    originalPreDeductedCredits: pricing.originalCredits,
    finalCredits: cost,
    originalFinalCredits: pricing.originalCredits,
    userPricingMultiplier: pricing.userPricingMultiplier,
    billingStatus: cost > 0 ? "settled" : "free",
    billingSettledAt: cost > 0 ? new Date().toISOString() : "",
    pricingEstimate: pricing,
    createResponse: null,
    awaitingUpstreamTask: true,
    apiTokenId: auth.tokenRecord?.id || "",
    apiTokenName: auth.tokenRecord?.name || "",
    apiTokenType: auth.tokenRecord?.quotaType || "",
    apiTokenSource: auth.tokenSource || "",
  });
  startAdvancedGenerationJob({
    taskId,
    userId: auth.user.id,
    userAssetId: userAsset?.id || "",
    extraUserAssetIds,
    referenceVideoAssetId: seedanceVideoAsset?.id || "",
    referenceVideoAssetIds,
    referenceVideoAssetUris,
    referenceAudioAssetUris,
    referenceAudioAssetIds,
    referenceImageAssetUris,
    seedanceMode,
    seedanceFirstFrameAssetId: seedanceFirstFrameAsset?.id || "",
    seedanceEndFrameAssetId: seedanceEndFrameAsset?.id || "",
    wan27MediaMode,
    wan27Media,
    provider,
    prompt,
    requestParams,
    pricing,
    cost,
    caseId: selectedCase?.id || "",
    caseTitle: selectedCase?.title || "",
    config,
  });
  const latestDb = await readDb();
  const latestUser = latestDb.users.find((user) => user.id === auth.user.id) || auth.user;
  return sendJson(res, 200, {
    ok: true,
    task: { taskId, status: record.status },
    taskId,
    record: publicGenerationRecord(record, generationRecordResponseOptionsForAuth(auth)),
    user: userView(latestUser),
    referenceAsset: userAsset ? {
      userAssetId: userAsset.id,
      imageUrl: initialImageUrl,
      sourceImageUrl: initialSourceImageUrl,
      syntheticReferenceLocalUrl: "",
      syntheticReferenceUrl: "",
      referenceAssetUri: "",
    } : null,
    extraReferences: extraUserAssets.map((asset) => ({
      userAssetId: asset.id,
      imageUrl: asset.localUrl || asset.publicUrl || "",
      sourceImageUrl: asset.sourceImageUrl || asset.localUrl || "",
      referenceAssetUri: "",
    })),
    pricing,
    cost,
  });
}

async function handleAdminAdvancedGenerate(req, res) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  return handleAdvancedGenerate(req, res);
}

function mediaAssetIdsByType(record = {}, type = "") {
  return (Array.isArray(record.mediaAssets) ? record.mediaAssets : [])
    .filter((asset) => asset && asset.type === type && asset.userAssetId)
    .map((asset) => String(asset.userAssetId || "").trim())
    .filter(Boolean);
}

function mediaAssetIdsByTypes(record = {}, types = []) {
  const wanted = new Set(types);
  return (Array.isArray(record.mediaAssets) ? record.mediaAssets : [])
    .filter((asset) => asset && wanted.has(asset.type) && asset.userAssetId)
    .map((asset) => String(asset.userAssetId || "").trim())
    .filter(Boolean);
}

function mediaAssetUrlByType(record = {}, type = "") {
  const asset = (Array.isArray(record.mediaAssets) ? record.mediaAssets : []).find((item) => item && item.type === type);
  return String(asset?.url || asset?.imageUrl || asset?.videoUrl || asset?.audioUrl || asset?.localUrl || "").trim();
}

function platformRegenerateBody(record = {}) {
  const body = {
    templateId: record.templateId || "",
    prompt: record.finalPrompt || record.prompt || "",
  };
  if (record.userAssetId) body.userAssetId = record.userAssetId;
  if (record.params && typeof record.params === "object" && !Array.isArray(record.params)) {
    body.params = { ...record.params };
  }
  return body;
}

function advancedRegenerateBody(record = {}) {
  const params = record.params && typeof record.params === "object" && !Array.isArray(record.params) ? record.params : {};
  const provider = normalizeAdvancedProvider(record.provider || params.provider);
  const body = {
    caseId: record.templateId || "",
    provider,
    prompt: record.finalPrompt || record.prompt || params.prompt || "",
    ratio: record.ratio || params.ratio || params.aspect_ratio || "9:16",
    resolution: record.resolution || params.resolution || "720p",
    duration: record.duration || params.duration || 5,
  };
  if (provider === "wan27") {
    const mediaMode = normalizeWan27MediaMode(record.mediaMode || params.mediaMode);
    body.mediaMode = mediaMode;
    const firstFrame = mediaAssetIdsByType(record, "first_frame")[0] || record.userAssetId || "";
    const lastFrame = mediaAssetIdsByType(record, "last_frame")[0] || "";
    const firstClip = mediaAssetIdsByType(record, "first_clip")[0] || "";
    const drivingAudio = mediaAssetIdsByType(record, "driving_audio")[0] || "";
    if (firstFrame) body.firstFrameAssetId = firstFrame;
    else if (mediaAssetUrlByType(record, "first_frame")) body.firstFrameUrl = mediaAssetUrlByType(record, "first_frame");
    if (lastFrame) body.lastFrameAssetId = lastFrame;
    else if (mediaAssetUrlByType(record, "last_frame")) body.lastFrameUrl = mediaAssetUrlByType(record, "last_frame");
    if (firstClip) body.firstClipAssetId = firstClip;
    else if (mediaAssetUrlByType(record, "first_clip")) body.firstClipUrl = mediaAssetUrlByType(record, "first_clip");
    if (drivingAudio) body.drivingAudioAssetId = drivingAudio;
    else if (mediaAssetUrlByType(record, "driving_audio")) body.drivingAudioUrl = mediaAssetUrlByType(record, "driving_audio");
    if (!drivingAudio && (params.drivingAudioUrl || params.driving_audio_url)) body.drivingAudioUrl = params.drivingAudioUrl || params.driving_audio_url;
    if (!firstClip && (params.firstClipUrl || params.first_clip_url)) body.firstClipUrl = params.firstClipUrl || params.first_clip_url;
    if (params.seed) body.seed = params.seed;
  } else {
    const referenceIds = [
      ...mediaAssetIdsByType(record, "reference_image"),
      record.userAssetId || "",
    ].map((id) => String(id || "").trim()).filter(Boolean);
    const uniqueIds = [...new Set(referenceIds)].slice(0, ADVANCED_SEEDANCE_REFERENCE_LIMIT);
    if (uniqueIds.length) {
      body.userAssetId = uniqueIds[0];
      if (uniqueIds.length > 1) body.extraReferenceAssetIds = uniqueIds.slice(1);
    }
    const referenceVideoIds = [...new Set(mediaAssetIdsByTypes(record, ["reference_video", "first_clip"]))];
    if (referenceVideoIds.length) body.referenceVideoAssetId = referenceVideoIds[0];
    const referenceVideoUrls = (Array.isArray(record.mediaAssets) ? record.mediaAssets : [])
      .filter((asset) => asset?.type === "reference_video" && !asset.userAssetId)
      .map((asset) => String(asset.videoUrl || asset.url || "").trim())
      .filter(Boolean);
    if (referenceVideoUrls.length) body.referenceVideoUrls = referenceVideoUrls.slice(0, ADVANCED_SEEDANCE_VIDEO_REFERENCE_LIMIT);
    const referenceAudioIds = [...new Set(mediaAssetIdsByType(record, "reference_audio"))];
    if (referenceAudioIds.length) body.referenceAudioAssetIds = referenceAudioIds.slice(0, ADVANCED_SEEDANCE_AUDIO_REFERENCE_LIMIT);
    const referenceAudioUrls = (Array.isArray(record.mediaAssets) ? record.mediaAssets : [])
      .filter((asset) => asset?.type === "reference_audio" && !asset.userAssetId)
      .map((asset) => String(asset.audioUrl || asset.url || "").trim())
      .filter(Boolean);
    if (referenceAudioUrls.length) body.referenceAudioUrls = referenceAudioUrls.slice(0, ADVANCED_SEEDANCE_AUDIO_REFERENCE_LIMIT);
  }
  return body;
}

async function handleRegenerateGenerationRecord(req, res, taskId) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const record = await getGenerationRecord(taskId);
  if (!record || record.userId !== auth.user.id || !isUserVisibleGenerationRecord(record)) {
    return sendJson(res, 404, { ok: false, message: "Generation record not found." });
  }

  const source = String(record.source || "").toLowerCase();
  const kind = String(record.kind || "").toLowerCase();
  if (source === "platform-template" || (record.templateId && ["image-to-video", "text-to-video"].includes(kind))) {
    return handlePlatformGenerate(withJsonBody(req, platformRegenerateBody(record)), res);
  }
  if (source.includes("advanced") || ["seedance", "aliyun-wan27"].includes(String(record.provider || "").toLowerCase())) {
    return handleAdvancedGenerate(withJsonBody(req, advancedRegenerateBody(record)), res);
  }
  return sendJson(res, 400, { ok: false, message: "This record cannot be regenerated yet." });
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

async function handleAdminIngestAdvancedCaseMedia(req, res) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const body = await readJson(req);
  try {
    const media = await ingestAdvancedCaseMedia({
      videoUrl: body.videoUrl,
      coverUrl: body.coverUrl,
      caseId: body.caseId || body.name || "advanced-case",
    });
    return sendJson(res, 200, { ok: true, media });
  } catch (error) {
    return sendJson(res, error.statusCode || 500, { ok: false, message: error.message || "Failed to ingest media." });
  }
}

async function handleAdminIngestPlatformTemplateMedia(req, res) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const body = await readJson(req);
  try {
    const media = await ingestPlatformTemplateMedia({
      videoUrl: body.videoUrl,
      coverUrl: body.coverUrl,
      templateId: body.templateId || body.name || "platform-template",
    });
    return sendJson(res, 200, { ok: true, media });
  } catch (error) {
    return sendJson(res, error.statusCode || 500, { ok: false, message: error.message || "Failed to ingest media." });
  }
}

function platformTemplateFromGenerationRecord(record = {}, media = {}, index = 0) {
  const taskId = String(record.taskId || Date.now()).replace(/[^a-z0-9_-]/gi, "-").slice(0, 48);
  const title = record.templateTitle || record.sceneEntryName || record.sceneName || record.companionName || record.kind || "Gallery video";
  const prompt = record.finalPrompt || record.prompt || title;
  const ratio = record.ratio || record.params?.ratio || record.params?.aspect_ratio || "16:9";
  const duration = record.duration || record.params?.duration || 5;
  const resolution = record.resolution || record.params?.resolution || "720p";
  return normalizePlatformTemplate({
    id: `gallery-record-${taskId}`,
    title: String(title || "Gallery video").slice(0, 80),
    category: "featured",
    type: "text-to-video",
    badge: "Advanced",
    previewUrl: media.previewUrl || record.localVideoUrl || record.videoUrl || record.remoteVideoUrl || "",
    coverUrl: media.coverUrl || record.localPosterUrl || record.posterUrl || record.imageUrl || "",
    hoverPreviewUrl: media.previewUrl || "",
    model: "advanced-link",
    prompt,
    requestJson: {
      model: "advanced-link",
      prompt,
      ratio,
      duration,
      resolution,
    },
    action: "advanced",
    targetTab: "advanced",
    buttonLabel: "Advanced",
    enabled: true,
    sort: index,
  }, index);
}

async function handleAdminPromoteRecordToPlatform(req, res, taskId) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const records = await readGenerationRecords();
  const record = records.find((entry) => entry.taskId === taskId);
  if (!record) return sendJson(res, 404, { ok: false, message: "Generation record not found." });
  const sourceVideoUrl = generationRecordVideoUrl(record);
  if (!sourceVideoUrl) return sendJson(res, 400, { ok: false, message: "This record has no video result." });

  const config = await readAppConfig();
  const platform = config.platform || {};
  const templates = Array.isArray(platform.templates) ? platform.templates : [];
  const templateId = `gallery-record-${String(record.taskId || Date.now()).replace(/[^a-z0-9_-]/gi, "-").slice(0, 48)}`;
  let media = {
    previewUrl: sourceVideoUrl,
    coverUrl: record.localPosterUrl || record.posterUrl || record.imageUrl || "",
  };
  try {
    media = await ingestPlatformTemplateMedia({
      videoUrl: absolutePublicUrl(sourceVideoUrl),
      coverUrl: media.coverUrl ? absolutePublicUrl(media.coverUrl) : "",
      templateId,
    });
  } catch (error) {
    console.warn("[promote-platform-media-failed]", taskId, error.message || error);
  }
  const nextTemplate = platformTemplateFromGenerationRecord(record, media, templates.length);
  const nextTemplates = [
    ...templates.filter((item) => item.id !== nextTemplate.id),
    nextTemplate,
  ];
  const nextConfig = {
    ...config,
    platform: {
      ...platform,
      templates: nextTemplates,
    },
    updatedAt: new Date().toISOString(),
  };
  await writeAppConfig(nextConfig);
  return sendJson(res, 200, { ok: true, template: nextTemplate, config: nextConfig });
}

async function makePlatformEstimate(template, overrides = {}, user = null) {
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
  const rawPricingEstimate = await estimatePlatformPreDeductCredits(upstreamPayload.model, upstreamPayload.params, template);
  const pricingEstimate = user ? applyUserPricingToEstimate(rawPricingEstimate, user) : rawPricingEstimate;
  const durationSeconds = durationSecondsFromParams(upstreamPayload.params) || apizPricingNumber(pricingEstimate.pricing?._default_duration_seconds) || 0;
  return {
    templateId: template.id,
    credits: creditsAmount(pricingEstimate.credits),
    baseCredits: creditsAmount(pricingEstimate.baseCredits ?? pricingEstimate.credits),
    originalCredits: pricingEstimate.originalCredits === undefined || pricingEstimate.originalCredits === null ? null : creditsAmount(pricingEstimate.originalCredits),
    userPricingMultiplier: pricingEstimate.userPricingMultiplier ?? normalizeUserPricingMultiplier(user || 1),
    markup: pricingEstimate.markup ?? GENERATION_PRICE_MARKUP,
    source: pricingEstimate.source,
    model: upstreamPayload.model,
    requestModel: upstreamPayload.params.model || upstreamPayload.model,
    durationSeconds,
    available: true,
  };
}

async function handlePlatformEstimates(req, res, url) {
  const auth = await getAuth(req);
  const body = req.method === "POST" ? await readJson(req) : {};
  const config = await readAppConfig();
  const requestedTemplateId = String(url.searchParams.get("templateId") || body.templateId || "").trim();
  const platform = normalizePlatformConfig(config.platform || {});
  const templates = requestedTemplateId
    ? platform.templates.filter((template) => template.id === requestedTemplateId)
    : platform.templates;

  if (requestedTemplateId && !templates.length) {
    return sendJson(res, 404, { ok: false, message: "Template not found." });
  }

  const estimates = await Promise.all(templates.map(async (template) => {
    try {
      return await makePlatformEstimate(template, requestedTemplateId === template.id ? body : {}, auth.user);
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

  return sendJson(res, 200, {
    ok: true,
    userPricing: pricingMultiplierView(auth.user || 1),
    estimates,
  });
}

function docsJsonBlock(value) {
  return JSON.stringify(value, null, 2);
}

function markdownCodeBlock(language, value) {
  return [
    `\`\`\`${language}`,
    typeof value === "string" ? value : docsJsonBlock(value),
    "```",
  ].join("\n");
}

function markdownText(value, fallback = "") {
  return String(value || fallback || "")
    .replace(/\r?\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function docsPlatformExampleBody(template = {}) {
  const body = {
    templateId: template.id || "template-id",
  };
  if (template.type === "image-to-video") body.dataUrl = "data:image/png;base64,...";
  body.prompt = "optional override";
  return body;
}

function docsAdvancedExampleBody(item = {}) {
  const params = item.params && typeof item.params === "object" && !Array.isArray(item.params) ? item.params : {};
  const provider = normalizeAdvancedProvider(item.provider || params.provider);
  const body = {
    caseId: item.id || "case-id",
    provider,
    prompt: item.prompt || params.prompt || "your prompt",
    dataUrl: "data:image/png;base64,...",
    ratio: params.ratio || params.aspect_ratio || "9:16",
    resolution: params.resolution || "720p",
    duration: durationSecondsFromParams(params) || 5,
    seed: provider === "wan27" ? optionalWan27Seed(params.seed) ?? undefined : undefined,
    generateAudio: params.generateAudio !== false,
    params: provider === "wan27"
      ? {
        model: params.model || ALIYUN_WAN27_MODEL,
        input: {},
        parameters: {
          prompt_extend: false,
          watermark: false,
          ...(params.seed !== undefined && params.seed !== null && params.seed !== "" ? { seed: params.seed } : {}),
        },
      }
      : {
        model: params.model || MODEL_QUALITY,
        generate_audio: params.generateAudio !== false,
        web_search: false,
        watermark: false,
        seed: params.seed || 123456,
      },
  };
  if (provider === "seedance") {
    body.referenceImages = [
      { url: "https://example.com/image1.png", fileName: "image1.png" },
      { url: "https://example.com/image2.png", fileName: "image2.png" },
    ];
    if (normalizeSeedanceMode(params.seedanceMode || params.mediaMode || item.mediaMode) === "reference_video") {
      body.referenceVideoUrls = ["https://example.com/video1.mp4"];
      body.referenceAudioUrls = ["https://example.com/audio1.mp3"];
    }
  }
  return body;
}

function docsPricingView(estimate = {}) {
  if (!estimate.available) {
    return {
      available: false,
      credits: null,
      source: "",
      message: estimate.message || "Pricing is unavailable.",
    };
  }
  return {
    available: true,
    credits: creditsAmount(estimate.credits),
    baseCredits: creditsAmount(estimate.baseCredits ?? estimate.credits),
    originalCredits: estimate.originalCredits === undefined || estimate.originalCredits === null ? null : creditsAmount(estimate.originalCredits),
    userPricingMultiplier: estimate.userPricingMultiplier ?? 1,
    markup: estimate.markup ?? GENERATION_PRICE_MARKUP,
    source: estimate.source || "model_pricing",
    durationSeconds: estimate.durationSeconds || 0,
  };
}

function tenantDocsPricingView(pricing = {}) {
  return pricing && pricing.available === false
    ? {
      available: false,
      credits: null,
      message: pricing.message || "Pricing is unavailable.",
    }
    : {
      available: true,
      credits: creditsAmount(pricing.credits),
    };
}

async function buildUserAdvancedEstimate(provider = "seedance", params = {}, user = null) {
  const config = await readAppConfig();
  const normalizedProvider = normalizeAdvancedProvider(provider);
  const inputVideoSeconds = normalizedProvider === "seedance"
    ? await seedanceVideoInputSecondsForPricingWithProbe(params, { requestParams: params })
    : firstPresent(params.inputVideoSeconds, params.videoInputSeconds, params.referenceVideoDurationSeconds, params.referenceVideoSeconds);
  const rawPricing = advancedModelPricing(provider, {
    duration: params.duration ?? params.durationSeconds,
    resolution: params.resolution,
    ratio: params.ratio || params.aspect_ratio,
    inputVideoSeconds,
    seedanceTier: params.seedanceTier,
    advancedPricing: config.platform?.advancedPricing,
    allowFourSecondSeedance: params.allowFourSecondSeedance === true,
  });
  return applyUserPricingToEstimate(rawPricing, user || 1);
}

async function handleAdvancedEstimate(req, res) {
  const auth = await getAuth(req);
  const body = req.method === "POST" ? await readJson(req) : {};
  const url = new URL(req.url || "/", "http://localhost");
  const tenantPublic = isTenantPublicOrigin(publicOriginFromRequest(req));
  const provider = normalizeAdvancedProvider(body.provider || url.searchParams.get("provider"));
  const duration = body.duration ?? url.searchParams.get("duration");
  const params = {
    ...plainObject(body.params),
    ...body,
    duration,
    resolution: body.resolution ?? url.searchParams.get("resolution"),
    ratio: body.ratio ?? body.aspect_ratio ?? url.searchParams.get("ratio") ?? url.searchParams.get("aspect_ratio"),
  };
  params.inputVideoSeconds = firstPresent(
    body.inputVideoSeconds,
    body.videoInputSeconds,
    body.referenceVideoDurationSeconds,
    body.referenceVideoSeconds,
    url.searchParams.get("inputVideoSeconds"),
    url.searchParams.get("referenceVideoDurationSeconds"),
  );
  params.allowFourSecondSeedance = body.allowFourSecondSeedance === true || url.searchParams.get("allowFourSecondSeedance") === "true";
  const pricing = await buildUserAdvancedEstimate(provider, params, auth.user);
  const publicPricing = tenantPublic
    ? {
      provider: pricing.provider,
      credits: pricing.credits,
      duration: pricing.duration,
      resolution: pricing.resolution,
      ratio: pricing.ratio,
    }
    : pricing;
  return sendJson(res, 200, {
    ok: true,
    userPricing: pricingMultiplierView(auth.user || 1),
    pricing: publicPricing,
  });
}

async function buildTemplateModelDoc(template, origin, user = null, options = {}) {
  const configuredPrompt = typeof template.requestJson?.prompt === "string" ? template.requestJson.prompt : template.prompt;
  const imagePlaceholder = template.type === "image-to-video" ? `${origin}/example-reference.png` : "";
  const upstreamPayload = platformApizPayload({
    template,
    prompt: configuredPrompt,
    imageUrl: imagePlaceholder,
  });
  let estimate;
  try {
    estimate = await makePlatformEstimate(template, {}, user);
  } catch (error) {
    estimate = {
      available: false,
      message: error.message || "Pricing is unavailable.",
      code: error.code || "PRICING_UNAVAILABLE",
    };
  }

  const durationSeconds =
    durationSecondsFromParams(upstreamPayload.params) ||
    estimate.durationSeconds ||
    0;

  const pricing = docsPricingView(estimate);
  return {
    id: template.id,
    title: template.title,
    type: template.type,
    category: template.category,
    badge: template.badge,
    model: upstreamPayload.model,
    requestModel: upstreamPayload.params?.model || upstreamPayload.model,
    durationSeconds,
    pricing: options.tenantPublic ? tenantDocsPricingView(pricing) : pricing,
    coverUrl: template.coverUrl,
    previewUrl: template.previewUrl,
    prompt: configuredPrompt || "",
    negativePrompt: template.negativePrompt || "",
    endpoint: {
      method: "POST",
      url: `${origin}/api/platform/generate`,
      auth: "Bearer <user-token>",
    },
    requestFields: [
      { name: "templateId", type: "string", required: true, description: "Template id from this document." },
      { name: "dataUrl", type: "string", required: template.type === "image-to-video", description: "Base64 data URL. Required for image-to-video templates." },
      { name: "prompt", type: "string", required: false, description: "Optional prompt override. Leave empty to use the saved template prompt." },
      { name: "params", type: "object", required: false, description: "Optional advanced overrides. Most clients should omit this." },
    ],
    exampleRequest: {
      method: "POST",
      url: `${origin}/api/platform/generate`,
      headers: {
        Authorization: "Bearer <user-token>",
        "Content-Type": "application/json",
      },
      body: docsPlatformExampleBody(template),
    },
    upstreamJson: upstreamPayload.params,
  };
}

function buildAdvancedModelDoc(item, origin, user = null, options = {}) {
  const params = item.params && typeof item.params === "object" && !Array.isArray(item.params) ? item.params : {};
  const durationSeconds = durationSecondsFromParams(params) || 5;
  const provider = normalizeAdvancedProvider(item.provider || params.provider);
  const docModel = params.model || (provider === "wan27" ? ALIYUN_WAN27_MODEL : MODEL_QUALITY);
  const pricing = applyUserPricingToEstimate(advancedModelPricing(provider, {
    model: docModel,
    duration: durationSeconds,
    resolution: params.resolution,
    ratio: params.ratio || params.aspect_ratio,
    advancedPricing: options.advancedPricing,
  }), user || 1);
  const pricingView = {
    available: true,
    credits: pricing.credits,
    baseCredits: pricing.baseCredits,
    originalCredits: pricing.originalCredits ?? null,
    userPricingMultiplier: pricing.userPricingMultiplier ?? 1,
    markup: pricing.markup ?? 1,
    source: pricing.source || "duration_rate",
    durationSeconds,
    creditsPerSecond: pricing.creditsPerSecond,
    resolution: pricing.resolution || params.resolution || "",
    ratio: pricing.ratio || params.ratio || params.aspect_ratio || "",
    outputTokens: pricing.outputTokens || null,
    yuanPerMillionTokens: pricing.yuanPerMillionTokens || null,
  };
  return {
    id: item.id,
    title: item.title,
    category: item.category,
    provider,
    model: docModel || pricing.model,
    description: item.description || "",
    pricing: options.tenantPublic ? tenantDocsPricingView(pricingView) : pricingView,
    coverUrl: item.coverUrl,
    previewUrl: item.previewUrl,
    prompt: item.prompt || params.prompt || "",
    params,
    requiresApproval: false,
    endpoint: {
      method: "POST",
      url: `${origin}/api/advanced/generate`,
      auth: "Bearer <user-token>",
    },
    requestFields: [
      { name: "caseId", type: "string", required: false, description: "Advanced case id. Omit only when sending all parameters manually." },
      { name: "provider", type: "string", required: false, description: "`wan27` or `seedance`. Defaults to the saved case provider, or Wan2.7 when no case/provider is supplied." },
      { name: "prompt", type: "string", required: true, description: "Prompt submitted exactly as entered." },
      { name: "seedanceMode", type: "string", required: false, description: "Seedance only. text_to_video, first_frame, first_last_frame, reference_images, or reference_video." },
      { name: "dataUrl", type: "string", required: provider === "wan27", description: "Uploaded base64 image. Required for Wan2.7 first-frame generation; accepted as Seedance first frame when seedanceMode is first_frame/first_last_frame." },
      { name: "imageUrl / firstFrameUrl", type: "string", required: false, description: "Seedance first-frame public URL. The server downloads it, uploads it to Ark assets, and sends upstream image_url." },
      { name: "imageAssetId / firstFrameAssetId", type: "string", required: false, description: "Seedance first-frame asset id returned by /api/user-assets." },
      { name: "endImageUrl / lastFrameUrl", type: "string", required: false, description: "Seedance last-frame public URL for first_last_frame. The server prepares it as upstream end_image_url." },
      { name: "endImageAssetId / lastFrameAssetId", type: "string", required: false, description: "Seedance last-frame asset id for first_last_frame." },
      { name: "referenceImages", type: "array", required: false, description: "Seedance reference_images mode. One or more images in the same field. Each item can use url/imageUrl + fileName, dataUrl + fileName, or assetId." },
      { name: "referenceImages[].assetUri", type: "string", required: false, description: "Seedance-ready asset:// URI returned by /api/seedance/characters/upload. Use assetId when possible; assetUri is accepted for upstream pass-through." },
      { name: "seedanceReferenceAssetUri / seedanceCharacterAssetUri", type: "string", required: false, description: "Seedance-ready asset:// URI returned by /api/seedance/characters/upload." },
      { name: "referenceImageAssetUris / seedanceReferenceAssetUris", type: "array", required: false, description: "Seedance-ready asset:// URI array returned by /api/seedance/characters/upload." },
      { name: "referenceVideos / referenceVideoUrls", type: "array", required: false, description: "Seedance reference_video/edit/extend public video URLs. Up to 3 URLs." },
      { name: "referenceVideoAssetId", type: "string", required: false, description: "Seedance reference_video mode. Existing uploaded video asset id." },
      { name: "referenceVideoAssetIds", type: "array", required: false, description: "Seedance multimodal/edit/extend. Up to 3 existing uploaded video asset ids." },
      { name: "inputVideoSeconds / referenceVideoDurationSeconds", type: "number", required: false, description: "Total input video duration for Seedance reference-video/edit/extend billing. The server pre-deducts output seconds plus this input-video branch before submitting upstream. If omitted for a video input, the output duration is used as a conservative fallback.", default: "0" },
      { name: "referenceAudios / referenceAudioUrls", type: "array", required: false, description: "Seedance multimodal reference audio public URLs. Up to 3 URLs; text+audio without image/video is not supported upstream." },
      { name: "referenceAudioAssetId / referenceAudioAssetIds", type: "string|array", required: false, description: "Seedance multimodal audio references from /api/user-assets. Up to 3 audio assets." },
      { name: "prompt asset labels", type: "string", required: false, description: "When referencing materials in prompt text, use Image 1, Video 1, or Audio 1. Do not write raw asset ids in the prompt." },
      { name: "userAssetId", type: "string", required: false, description: "Optional existing uploaded asset id. For Seedance first_frame it is the first frame; otherwise it is a reference image." },
      { name: "extraReferenceDataUrls", type: "array", required: false, description: "Seedance compatibility field. Prefer referenceImages for new integrations; referenceImages now supports URL items." },
      { name: "extraReferenceAssetIds", type: "array", required: false, description: "Seedance only. Optional existing uploaded asset ids for additional references." },
      { name: "ratio", type: "string", required: false, description: "Video ratio, for example 9:16, 16:9, or 1:1." },
      { name: "resolution", type: "string", required: false, description: "720p or 1080p." },
      { name: "duration", type: "number", required: false, description: "Duration in seconds. Seedance is clamped to 5-15; Wan2.7 is clamped to 2-15." },
      { name: "seed", type: "number", required: false, description: "Provider pass-through random seed. The API forwards it when supplied; upstream decides whether it takes effect." },
      { name: "params", type: "object", required: false, description: "Provider pass-through object. Seedance forwards model/content/reference_* fields; Wan2.7 forwards model plus input/parameters." },
      { name: "params.model", type: "string", required: false, description: "Override the upstream model id when the provider supports it." },
      { name: "params.input", type: "object", required: false, description: "Wan2.7 only. Extra DashScope input fields; prompt/media are still set by this API." },
      { name: "params.parameters", type: "object", required: false, description: "Wan2.7 and Wan2.7 image. Extra DashScope parameters merged into the upstream payload." },
      { name: "Wan2.7 image edit", type: "endpoint", required: false, description: "Use /api/wan27/image-edit with imageAssetIds containing 0-9 images. The image order maps to Image 1, Image 2, etc. Results are saved to history/admin records first; add to assets from history when needed." },
      { name: "params.generate_audio", type: "boolean", required: false, description: "Seedance only. Generate synchronized voice/effects/background music." },
      { name: "params.image_url", type: "string", required: false, description: "Seedance raw upstream first-frame URL or asset:// URI. Friendly imageUrl/firstFrameUrl is preferred." },
      { name: "params.end_image_url", type: "string", required: false, description: "Seedance raw upstream last-frame URL or asset:// URI. Friendly endImageUrl/lastFrameUrl is preferred." },
      { name: "params.reference_images", type: "array", required: false, description: "Seedance only. Raw upstream reference image URLs or asset:// URIs for advanced callers." },
      { name: "params.reference_videos", type: "array", required: false, description: "Seedance only. Raw upstream reference video URLs or asset:// URIs for advanced callers." },
      { name: "params.reference_audios", type: "array", required: false, description: "Seedance only. Raw upstream reference audio URLs or asset:// URIs for advanced callers." },
      { name: "params.web_search / params.webSearch", type: "boolean", required: false, description: "Seedance pass-through. Enable upstream web-search enhancement where available; upstream decides whether it takes effect." },
      { name: "params.watermark", type: "boolean", required: false, description: "Seedance pass-through watermark flag. Upstream decides whether it takes effect." },
      { name: "params.seed", type: "number", required: false, description: "Seedance pass-through random seed. Upstream decides whether it takes effect." },
      { name: "record.videoUrl / record.downloadUrl", type: "string", required: false, description: "Task query returns only the upstream provider video URL for API-token callers. For Seedance this may be a BytePlus/Volcengine temporary URL; for APIZ it may be an Aliyun URL. Our stored copies are internal site playback/backup data." },
    ],
    exampleRequest: {
      method: "POST",
      url: `${origin}/api/advanced/generate`,
      headers: {
        Authorization: "Bearer <user-token>",
        "Content-Type": "application/json",
      },
      body: docsAdvancedExampleBody(item),
    },
  };
}

async function buildModelDocs(req) {
  const auth = await getAuth(req);
  const origin = publicOriginFromRequest(req);
  const tenantPublic = isTenantPublicOrigin(origin);
  const config = await readAppConfig();
  const platform = normalizePlatformConfig(config.platform || {});
  const templates = await Promise.all(platform.templates.map((template) => buildTemplateModelDoc(template, origin, auth.user, { tenantPublic })));
  const advancedCases = (platform.advanced?.cases || [])
    .filter((item) => item.enabled !== false)
    .map((item) => buildAdvancedModelDoc(item, origin, auth.user, { tenantPublic, advancedPricing: platform.advancedPricing }));

  return {
    ok: true,
    title: `${platform.brand || "Vipeak AI"} Model Guide`,
    baseUrl: origin,
    updatedAt: new Date().toISOString(),
    userPricing: pricingMultiplierView(auth.user || 1),
    billing: tenantPublic ? {
      unit: "credits",
      note: "Credits are deducted according to the selected model, resolution, duration, and your account pricing.",
    } : {
      unit: "credits",
      note: `1 CNY equals ${platform.advancedPricing.creditsPerCny} credits. Advanced generation is charged by the configured per-second public rates.`,
      galleryMarkup: GENERATION_PRICE_MARKUP,
      advancedCreditsPerCny: platform.advancedPricing.creditsPerCny,
      advancedSeedanceCreditsPerSecondByResolution: platform.advancedPricing.seedanceCreditsPerSecondByResolution,
      advancedWan27CreditsPerSecondByResolution: platform.advancedPricing.wan27CreditsPerSecondByResolution,
      wan27ImagePro: platform.advancedPricing.wan27ImagePro,
    },
    endpoints: {
      docsMarkdown: `${origin}/docs/models.md`,
      modelsJson: `${origin}/api/models`,
      platformGenerate: `${origin}/api/platform/generate`,
      advancedGenerate: `${origin}/api/advanced/generate`,
      volcengineCompatibleGenerate: `${origin}/api/v3/contents/generations/tasks`,
      volcengineCompatibleTask: `${origin}/api/v3/contents/generations/tasks/<taskId>`,
      userAssets: `${origin}/api/user-assets`,
      seedanceCharacterUpload: `${origin}/api/seedance/characters/upload`,
      wan27ImageTextToImage: `${origin}/api/characters/generate`,
      wan27ImageEdit: `${origin}/api/wan27/image-edit`,
      wan27ImageEditAsset: `${origin}/api/user-assets/<assetId>/modify`,
      wan27ImageEditSystemCharacter: `${origin}/api/characters/<characterId>/modify`,
      generationRecords: `${origin}/api/generation-records`,
      generationRecordDetail: `${origin}/api/generation-records/<taskId>`,
    },
    templates,
    advanced: {
      requiresApproval: false,
      telegram: String(platform.advanced?.telegram || ""),
      cases: advancedCases,
    },
  };
}

function templateDocMarkdown(item) {
  const lines = [
    `### ${markdownText(item.title, item.id)}`,
    "",
    `- templateId: \`${item.id}\``,
    `- type: \`${item.type}\``,
    `- model: \`${item.requestModel || item.model}\``,
    `- duration: ${item.durationSeconds || "configured"}s`,
    `- estimated cost: ${item.pricing.available ? `${item.pricing.credits} credits` : "pricing unavailable"}`,
  ];
  if (item.previewUrl) lines.push(`- preview: ${item.previewUrl}`);
  if (item.coverUrl) lines.push(`- cover: ${item.coverUrl}`);
  if (item.prompt) lines.push("", "**Saved prompt**", "", item.prompt);
  lines.push("", "**Client request**", "", markdownCodeBlock("json", item.exampleRequest));
  lines.push("", "**Server-side upstream JSON**", "", markdownCodeBlock("json", item.upstreamJson));
  return lines.join("\n");
}

function advancedDocMarkdown(item) {
  const lines = [
    `### ${markdownText(item.title, item.id)}`,
    "",
    `- caseId: \`${item.id}\``,
    `- provider: \`${item.provider || "seedance"}\``,
    item.model ? `- model: \`${item.model}\`` : "",
    "- access: signed-in users",
    `- estimated cost: ${item.pricing.credits} credits`,
  ].filter(Boolean);
  if (item.description) lines.push(`- description: ${markdownText(item.description)}`);
  if (item.previewUrl) lines.push(`- preview: ${item.previewUrl}`);
  if (item.prompt) lines.push("", "**Saved prompt**", "", item.prompt);
  lines.push("", "New Seedance integrations should use `/api/v3/contents/generations/tasks` with the Volcengine-style `content[]` body. The legacy `/api/advanced/generate` path remains available for the site UI and older internal flows.");
  lines.push("", "Seedance character upload: optionally call `/api/seedance/characters/upload` with `url`/`imageUrl`, `dataUrl`, or an existing `assetId`. The response returns `reference.assetUri`; put that value into `content[].image_url.url` with role `reference_image`. In prompts, refer to inputs as Image 1, Video 1, and Audio 1; do not put asset ids in the prompt text.");
  lines.push("", "Wan2.7 image edit: call `/api/wan27/image-edit` with `imageAssetIds` containing 0-9 image assets. The order maps to Image 1, Image 2, and so on in the prompt; with no images it works as text-to-image through the same endpoint. Results are saved to generation history first. Use the history Add asset action when the result should enter the asset library.");
  lines.push("", "Reference image: Wan2.7 uses `dataUrl` as the first frame and optional last-frame fields. Seedance uses `content[]` image/video/audio objects; public/base64 image URLs are prepared into Ark assets before submit.");
  lines.push("", "Provider passthrough: Seedance accepts a Volcengine-style root body and also accepts upstream-only aliases in `params`. Fields such as `model`, `content`, `image_url`, `end_image_url`, `generate_audio`/`generateAudio`, `reference_images`/`referenceImages`, `reference_videos`/`referenceVideos`, `reference_audios`/`referenceAudios`, `web_search`/`webSearch`, `watermark`, `seed`, `fps`, `camera_fixed`, `draft`, and `service_tier` are forwarded or normalized into the Ark request. Use `dreamina-seedance-2-0-260128` for Standard, or `dreamina-seedance-2-0-fast-260128` for Fast. Wan2.7 forwards `params.input` into DashScope `input` and `params.parameters` into DashScope `parameters`. Upstream decides whether each provider-specific field takes effect.");
  lines.push("", "Billing: Seedance-compatible calls are pre-deducted before upstream submission. Failed submissions and failed tasks are refunded. Duration must be a 4-15 second integer; Fast is billed at 80% of the Standard Seedance rate; fast 1080p is rejected before charging.");
  lines.push("", "Task query: use `/api/v3/contents/generations/tasks/<taskId>` for Seedance-compatible task responses. The response keeps the upstream video URL when available; the legacy record endpoints remain available for site history.");
  lines.push("", "**Client request**", "", markdownCodeBlock("json", item.exampleRequest));
  return lines.join("\n");
}

function seedanceOfficialExampleMarkdown(docs) {
  const endpoint = docs.endpoints.volcengineCompatibleGenerate || `${docs.baseUrl}/api/v3/contents/generations/tasks`;
  const detailEndpoint = docs.endpoints.volcengineCompatibleTask || `${docs.baseUrl}/api/v3/contents/generations/tasks/<taskId>`;
  const request = {
    model: "dreamina-seedance-2-0-260128",
    content: [
      { type: "text", text: "Use Image 1 as the character reference. Generate a cinematic 5 second shot, no subtitles, no watermark." },
      { type: "image_url", image_url: { url: "asset://seedance-uploaded-character-or-public-url" }, role: "reference_image" },
    ],
    ratio: "9:16",
    resolution: "720p",
    duration: 5,
    generate_audio: true,
    watermark: false,
  };
  return [
    "## Seedance / Volcengine-Compatible API",
    "",
    "Use this section for new integrations. The request body follows the Volcengine Ark Seedance task shape; vip123 still handles authentication, pre-deduction, history, and refunds internally.",
    "",
    "Model values:",
    "",
    "- Standard: `dreamina-seedance-2-0-260128`",
    "- Fast: `dreamina-seedance-2-0-fast-260128`",
    "- Old-site production endpoint ids are also accepted: `ep-20260429142513-zg667` (Standard) and `ep-20260429142538-fkm9d` (Fast)",
    "",
    "Parameter ranges:",
    "",
    "- `resolution`: `480p`, `720p`, `1080p`",
    "- `duration`: integer `4` to `15`",
    "- `ratio`: UI-safe values `9:16`, `16:9`, `1:1`; direct callers may forward other upstream ratio strings",
    "- Fast does not support `1080p`",
    "- Fast is billed at 80% of the Standard vip123 Seedance rate",
    "",
    markdownCodeBlock("http", [
      `POST ${endpoint.replace(docs.baseUrl, "")}`,
      "Authorization: Bearer <user-token>",
      "Content-Type: application/json",
      "",
      JSON.stringify(request, null, 2),
    ].join("\n")),
    "",
    "Query the task with the same Volcengine-style path. The response is the upstream task response when available, including provider output URLs and `usage` fields returned by the provider.",
    "",
    markdownCodeBlock("http", [
      `GET ${detailEndpoint.replace(docs.baseUrl, "")}`,
      "Authorization: Bearer <user-token>",
    ].join("\n")),
    "",
    "Supported media inputs in `content`: `text`, `image_url`, `video_url`, and `audio_url`. Use `role` values such as `first_frame`, `last_frame`, `reference_image`, `reference_video`, and `reference_audio` to match Seedance modes. Public image URLs and base64 image data URLs are accepted for image inputs and are prepared into Ark assets before submission; `asset://` URLs pass through directly. Include `content[].video_url.durationSeconds` when known; otherwise the server probes the URL and falls back conservatively for pre-deduction.",
    "",
    "Billing guardrails: `duration` must be an integer from 4 to 15 seconds. `resolution` may be `480p`, `720p`, or `1080p`; the fast model does not accept `1080p`, so vip123 rejects that combination before charging.",
    "",
  ].join("\n");
}

function buildModelDocsMarkdown(docs) {
  const templateSections = docs.templates.length
    ? docs.templates.map(templateDocMarkdown).join("\n\n")
    : "No public templates are configured.";
  const advancedSections = docs.advanced.cases.length
    ? docs.advanced.cases.map(advancedDocMarkdown).join("\n\n")
    : "No advanced cases are configured.";

  return [
    `# ${docs.title}`,
    "",
    `Base URL: ${docs.baseUrl}`,
    "",
    "This document is generated from the live admin configuration. When templates or cases change, this page changes with them.",
    "",
    "## Authentication",
    "",
    "Use the token from your account page:",
    "",
    markdownCodeBlock("http", "Authorization: Bearer <user-token>"),
    "",
    "## Wan2.7 Image Edit",
    "",
    "Use `/api/wan27/image-edit` for Wan2.7 image text generation, single-image editing, or multi-image fusion/reference editing. Pass `imageAssetIds` with 0 to 9 uploaded image assets; the array order maps to Image 1, Image 2, and so on in the prompt. Results are saved to History and admin generation records first; use History -> Add asset when the result should enter Assets.",
    "",
    markdownCodeBlock("http", [
      "POST /api/wan27/image-edit",
      "Authorization: Bearer <user-token>",
      "Content-Type: application/json",
      "",
      "{",
      '  "prompt": "Use Image 1 as the person and Image 2 as the outfit reference. Create a realistic full-body portrait.",',
      '  "imageAssetIds": ["asset-image-1", "asset-image-2"],',
      '  "ratio": "9:16",',
      '  "resolution": "2K",',
      '  "params": {',
      '    "model": "wan2.7-image-pro",',
      '    "parameters": {"n": 1, "watermark": false}',
      "  }",
      "}",
    ].join("\n")),
    "",
    "## Quick Start",
    "",
    "1. Read `/api/models` or this Markdown file to choose a template.",
    "2. For image-to-video templates, send `templateId` and `dataUrl` to `/api/platform/generate`.",
    "3. For text-to-video templates, send `templateId` and an optional `prompt` to `/api/platform/generate`.",
    "4. Optional: upload a reusable image, video, or audio with `/api/user-assets`, using either `dataUrl` or public `url`/`imageUrl`/`videoUrl`/`audioUrl`, then reuse `asset.id`.",
    "5. For Seedance generation, call `/api/v3/contents/generations/tasks` with a Volcengine-style `content[]` body.",
    "6. Optional Seedance character upload: POST `/api/seedance/characters/upload` with the character image, then put returned `reference.assetUri` into `content[].image_url.url`.",
    "7. For advanced Wan2.7 generation, call `/api/advanced/generate` with `provider: \"wan27\"`, a reference image, `resolution`, optional pass-through parameters, and duration.",
    "8. For Wan2.7 image generation/editing, call `/api/characters/generate` for text-to-image or `/api/wan27/image-edit` with `imageAssetIds` containing 0-9 images. The array order maps to Image 1, Image 2, and so on in the prompt.",
    "9. Query Seedance tasks with `/api/v3/contents/generations/tasks/<taskId>`. Legacy history remains at `/api/generation-records`.",
    "10. Seedance-compatible task query returns the upstream task payload when available. Our saved copy is kept internally for site playback/backup.",
    "",
    "## Seedance Character Upload Example",
    "",
    "This is the Seedance-specific role-image preparation flow. It is not the generic asset upload flow.",
    "",
    markdownCodeBlock("http", [
      "POST /api/seedance/characters/upload",
      "Authorization: Bearer <user-token>",
      "Content-Type: application/json",
      "",
      "{",
      '  "url": "https://example.com/character-image1.png",',
      '  "fileName": "image1.png",',
      '  "name": "image1"',
      "}",
      "",
      "Response:",
      "{",
      '  "ok": true,',
      '  "reference": {"assetId": "asset-id-from-upload", "assetUri": "asset://seedance-asset-id", "fileName": "image1.png", "imageLabel": "Image 1"}',
      "}",
      "",
      "POST /api/v3/contents/generations/tasks",
      "Authorization: Bearer <user-token>",
      "Content-Type: application/json",
      "",
      "{",
      '  "model": "dreamina-seedance-2-0-260128",',
      '  "content": [',
      '    {"type": "text", "text": "Use Image 1 as the main character. Keep the same face, hairstyle, body shape, and outfit. Create a cinematic 5 second shot."},',
      '    {"type": "image_url", "image_url": {"url": "asset://seedance-asset-id"}, "role": "reference_image"}',
      "  ],",
      '  "ratio": "9:16",',
      '  "resolution": "720p",',
      '  "duration": 5,',
      '  "generate_audio": true,',
      '  "watermark": false',
      "}",
    ].join("\n")),
    "",
    "## Billing",
    "",
    docs.billing.note,
    "",
    "## Endpoints",
    "",
    markdownCodeBlock("json", docs.endpoints),
    "",
    seedanceOfficialExampleMarkdown(docs),
    "## Template Gallery Models",
    "",
    templateSections,
    "",
    "## Advanced Generate",
    "",
    "Legacy advanced generation is still available for the site UI and Wan2.7 flows. New Seedance integrations should use `/api/v3/contents/generations/tasks` above.",
    docs.advanced.telegram ? `\nSupport: ${docs.advanced.telegram}\n` : "",
    advancedSections,
    "",
  ].join("\n");
}

async function handleModelsJson(req, res) {
  const docs = await buildModelDocs(req);
  return sendJson(res, 200, docs);
}

async function handleModelsMarkdown(req, res) {
  const docs = await buildModelDocs(req);
  return sendMarkdown(res, 200, buildModelDocsMarkdown(docs));
}

async function refreshApizGenerationRecord(record) {
  if (record.provider !== "apiz") return record;
  const queryTaskId = record.upstreamTaskId || record.taskId;
  const gatewayTask = record.upstreamSource === "gateway"
    ? await gatewayQueryTask(queryTaskId)
    : null;
  const task = gatewayTask ? gatewayTask.raw : await apizRequest("/api/v3/tasks/query", { task_id: queryTaskId });
  const status = gatewayTask ? gatewayTask.status : apizStatus(task);
  const resultUrl = gatewayTask ? absoluteUrlFromBase(gatewayTask.videoUrl, UPSTREAM_BASE_URL) : apizResultUrl(task);
  const media = isSucceededStatus(status) && !record.localVideoUrl
    ? await maybeDownloadApizVideo(record, resultUrl)
    : {};
  const nextRecord = await upsertGenerationRecord({
    taskId: record.taskId,
    upstreamTaskId: gatewayTask?.taskId || apizTaskId(task) || queryTaskId,
    status,
    remoteVideoUrl: resultUrl || record.remoteVideoUrl || "",
    videoUrl: localPublicAssetStorageEnabled()
      ? (media.localVideoUrl || media.cdnVideoUrl || resultUrl || record.videoUrl || "")
      : (media.cdnVideoUrl || media.localVideoUrl || resultUrl || record.videoUrl || ""),
    localVideoUrl: media.localVideoUrl || record.localVideoUrl || "",
    localVideoPath: media.localVideoPath || record.localVideoPath || "",
    localPosterUrl: media.localPosterUrl || record.localPosterUrl || "",
    localPosterPath: media.localPosterPath || record.localPosterPath || "",
    posterUrl: localPublicAssetStorageEnabled()
      ? (media.localPosterUrl || media.cdnPosterUrl || record.posterUrl || "")
      : (media.cdnPosterUrl || media.localPosterUrl || record.posterUrl || ""),
    cdnVideoUrl: media.cdnVideoUrl || record.cdnVideoUrl || "",
    cdnPosterUrl: media.cdnPosterUrl || record.cdnPosterUrl || "",
    cdnError: media.cdnError || record.cdnError || "",
    error: gatewayTask?.error || task.error?.message || task.error || task.message || media.downloadError || "",
    queryResponse: task,
  });
  return settleApizGenerationRecord(nextRecord, gatewayTask ? { ...task, status, videoUrl: resultUrl, error: gatewayTask.error } : task, "query");
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
  const existingUser = await getUserByUsernameInDb(username);
  if (existingUser || db.users.some((user) => user.username === username)) {
    return sendJson(res, 409, { ok: false, message: "Username already exists — please sign in." });
  }

  const now = new Date().toISOString();
  const user = {
    id: randomId("user"),
    username,
    passwordHash: hashPassword(password),
    role: db.users.length === 0 ? "admin" : "user",
    credits: 0,
    apiToken: makeUniqueApiToken(db),
    createdAt: now,
    updatedAt: now,
  };
  const token = crypto.randomBytes(32).toString("hex");
  const session = { token, userId: user.id, createdAt: now };
  db.users.push(user);
  db.sessions.push(session);
  if (dbEnabled()) {
    await updateUserInDb(user);
    await createSessionInDb(session);
  } else {
    await writeDb(db);
  }
  return sendJson(res, 200, { ok: true, token, user: userView(user) });
}

async function handleLogin(req, res) {
  const body = await readJson(req);
  const username = String(body.username || "").trim().toLowerCase();
  const password = String(body.password || "");
  const db = await readDb();
  const user = await getUserByUsernameInDb(username) || db.users.find((item) => item.username === username);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return sendJson(res, 401, { ok: false, message: "Wrong username or password." });
  }

  ensureUserApiToken(user, db);
  const token = crypto.randomBytes(32).toString("hex");
  const session = { token, userId: user.id, createdAt: new Date().toISOString() };
  db.sessions.push(session);
  if (dbEnabled()) {
    await updateUserInDb(user);
    await createSessionInDb(session);
  } else {
    await writeDb(db);
  }
  return sendJson(res, 200, { ok: true, token, user: userView(user) });
}

async function handleMe(req, res) {
  const auth = await getAuth(req);
  if (auth.user && !auth.user.apiToken) {
    ensureUserApiToken(auth.user, auth.db);
    if (dbEnabled()) await updateUserInDb(auth.user);
    else await writeDb(auth.db);
  }
  const user = userView(auth.user);
  if (user && auth.tokenSource) {
    user.accessTokenSource = auth.tokenSource;
    user.accessTokenId = auth.tokenRecord?.id || "";
    user.accessTokenName = auth.tokenRecord?.name || "";
    user.accessTokenType = auth.tokenRecord?.quotaType || "";
    user.accessTokenPreview = auth.tokenRecord?.tokenPreview || "";
  }
  return sendJson(res, 200, { ok: true, user });
}

async function handleListApiSubtokens(req, res) {
  const auth = await requirePrimaryTokenOwner(req, res);
  if (!auth) return;
  const subtokens = await listApiSubtokensFromDb(auth.user.id);
  return sendJson(res, 200, {
    ok: true,
    subtokens: subtokens.map(apiSubtokenView).filter(Boolean),
  });
}

async function handleCreateApiSubtoken(req, res) {
  const auth = await requirePrimaryTokenOwner(req, res);
  if (!auth) return;
  const body = await readJson(req);
  const name = String(body.name || "").trim().slice(0, 80);
  if (!name) return sendJson(res, 400, { ok: false, message: "Sub token name is required." });
  const quotaType = String(body.quotaType || body.quota_type || "amount").trim().toLowerCase() === "count" ? "count" : "amount";
  const quotaLimitRaw = Number(body.quotaLimit ?? body.quota_limit ?? body.limit ?? 0);
  if (!Number.isFinite(quotaLimitRaw) || quotaLimitRaw <= 0) {
    return sendJson(res, 400, { ok: false, message: "Quota must be greater than 0." });
  }
  const expiresAtRaw = String(body.expiresAt || body.expires_at || "").trim();
  let expiresAt = "";
  if (expiresAtRaw) {
    const parsed = Date.parse(expiresAtRaw);
    if (!Number.isFinite(parsed)) {
      return sendJson(res, 400, { ok: false, message: "Invalid expiration time." });
    }
    expiresAt = new Date(parsed).toISOString();
  }
  const token = await makeUniqueSubtokenToken(auth.db, auth.user.id);
  const now = currentIso();
  const record = await createApiSubtokenInDb({
    id: randomId("sat"),
    token,
    parentUserId: auth.user.id,
    name,
    quotaType,
    quotaLimit: quotaType === "count" ? Math.max(1, Math.round(quotaLimitRaw)) : roundCredits(quotaLimitRaw, 6),
    usedAmount: 0,
    usedCount: 0,
    expiresAt,
    revokedAt: "",
    lastUsedAt: "",
    createdAt: now,
    updatedAt: now,
  });
  return sendJson(res, 200, {
    ok: true,
    subtoken: apiSubtokenView(record, { includeToken: true }),
  });
}

async function handleUpdateApiSubtoken(req, res, tokenId) {
  const auth = await requirePrimaryTokenOwner(req, res);
  if (!auth) return;
  const current = await getApiSubtokenFromDbById(tokenId, auth.user.id);
  if (!current) return sendJson(res, 404, { ok: false, message: "Sub token not found." });
  const body = await readJson(req);
  const next = {};
  if (typeof body.name === "string") next.name = body.name.trim().slice(0, 80);
  if (Object.prototype.hasOwnProperty.call(body, "quotaLimit") || Object.prototype.hasOwnProperty.call(body, "quota_limit")) {
    const raw = Number(body.quotaLimit ?? body.quota_limit);
    if (!Number.isFinite(raw) || raw <= 0) {
      return sendJson(res, 400, { ok: false, message: "Quota must be greater than 0." });
    }
    next.quotaLimit = current.quotaType === "count" ? Math.max(1, Math.round(raw)) : roundCredits(raw, 6);
  }
  const hasRemaining =
    Object.prototype.hasOwnProperty.call(body, "remaining") ||
    Object.prototype.hasOwnProperty.call(body, "remainingAmount") ||
    Object.prototype.hasOwnProperty.call(body, "remaining_amount") ||
    Object.prototype.hasOwnProperty.call(body, "remainingCount") ||
    Object.prototype.hasOwnProperty.call(body, "remaining_count");
  if (hasRemaining) {
    const rawRemaining = current.quotaType === "count"
      ? Number(body.remainingCount ?? body.remaining_count ?? body.remaining)
      : Number(body.remainingAmount ?? body.remaining_amount ?? body.remaining);
    if (!Number.isFinite(rawRemaining) || rawRemaining < 0) {
      return sendJson(res, 400, { ok: false, message: "Remaining quota must be 0 or greater." });
    }
    const used = current.quotaType === "count"
      ? Math.max(0, Math.round(Number(current.usedCount || 0) || 0))
      : roundCredits(current.usedAmount || 0, 6);
    const remaining = current.quotaType === "count"
      ? Math.max(0, Math.round(rawRemaining))
      : roundCredits(rawRemaining, 6);
    next.quotaLimit = current.quotaType === "count"
      ? used + remaining
      : roundCredits(used + remaining, 6);
  }
  if (Object.prototype.hasOwnProperty.call(body, "expiresAt") || Object.prototype.hasOwnProperty.call(body, "expires_at")) {
    const expiresAtRaw = String(body.expiresAt ?? body.expires_at ?? "").trim();
    if (!expiresAtRaw) {
      next.expiresAt = "";
    } else {
      const parsed = Date.parse(expiresAtRaw);
      if (!Number.isFinite(parsed)) return sendJson(res, 400, { ok: false, message: "Invalid expiration time." });
      next.expiresAt = new Date(parsed).toISOString();
    }
  }
  const updated = await updateApiSubtokenInDb(tokenId, auth.user.id, next);
  return sendJson(res, 200, { ok: true, subtoken: apiSubtokenView(updated) });
}

async function handleRevokeApiSubtoken(req, res, tokenId) {
  const auth = await requirePrimaryTokenOwner(req, res);
  if (!auth) return;
  const current = await getApiSubtokenFromDbById(tokenId, auth.user.id);
  if (!current) return sendJson(res, 404, { ok: false, message: "Sub token not found." });
  const revoked = await revokeApiSubtokenInDb(tokenId, auth.user.id, currentIso());
  return sendJson(res, 200, { ok: true, subtoken: apiSubtokenView(revoked) });
}

async function handleCreatePaymentOrder(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;

  const body = await readJson(req);
  const config = await readAppConfig();
  const amount = Number(body.amount || 0);
  if (!Number.isFinite(amount) || amount < MIN_TOPUP_AMOUNT) {
    return sendJson(res, 400, { ok: false, message: `Top-up amount must be at least ${MIN_TOPUP_AMOUNT}.` });
  }
  const walletOption = findWalletOption(config.wallet || {}, body.walletOptionId || body.walletNetwork || body.network, requestTenantOptions(req));
  if (!walletOption?.address) {
    return sendJson(res, 503, { ok: false, code: "WALLET_NOT_CONFIGURED", message: "USDT top-up is not configured." });
  }

  const suffixDigits = clampNumber(config.wallet.suffixDigits, 6, 3, 6);
  const payment = makeUniquePaymentAmount(amount, suffixDigits);
  const baseAmount = Math.max(1, Math.round(Number(amount || 0)));
  const creditAmount = walletCreditsForUsdtAmount(baseAmount, config.wallet);
  if (!dbEnabled()) {
    payment.amount = baseAmount;
    payment.payableAmountText = `${baseAmount}.${payment.suffix}`;
    payment.payableAmount = Number(payment.payableAmountText);
  }
  let order = {
    id: randomId("order"),
    userId: auth.user.id,
    baseAmount,
    creditAmount,
    cnyCentsPerUsdt: walletCnyCentsPerUsdt(config.wallet),
    suffix: payment.suffix,
    payableAmount: payment.payableAmount,
    payableAmountText: payment.payableAmountText,
    asset: walletOption.asset || config.wallet.asset,
    network: walletOption.network,
    chain: normalizeWalletChain(walletOption.network),
    walletOptionId: walletOption.id,
    address: walletOption.address,
    qrUrl: walletOption.qrUrl,
    explorerUrl: walletOption.explorerUrl || "",
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  auth.db.walletOrders.unshift(order);
  if (dbEnabled()) {
    order = await createManualWalletOrderInDb({ order, suffixDigits });
    auth.db.walletOrders[0] = order;
  } else {
    await writeDb(auth.db);
  }
  return sendJson(res, 200, { ok: true, order });
}

async function handleListPaymentOrders(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const orders = auth.db.walletOrders.filter((order) => order.userId === auth.user.id).slice(0, 20);
  return sendJson(res, 200, { ok: true, orders });
}

async function handlePayPalConfig(req, res) {
  return sendJson(res, 200, { ok: true, paypal: paypalPublicConfig() });
}

async function handleCreatePayPalOrder(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const body = await readJson(req);
  const config = await readAppConfig();
  const tenantOptions = requestTenantOptions(req);
  const rawAmount = Number(body.amount || 0);
  if (!Number.isFinite(rawAmount) || rawAmount < PAYPAL_MIN_AMOUNT || rawAmount > PAYPAL_MAX_AMOUNT) {
    return sendJson(res, 400, {
      ok: false,
      message: `PayPal amount must be between ${PAYPAL_MIN_AMOUNT} and ${PAYPAL_MAX_AMOUNT} ${PAYPAL_CURRENCY}.`,
    });
  }
  if (!paypalEnabled()) {
    return sendJson(res, 503, { ok: false, code: "PAYPAL_NOT_CONFIGURED", message: "PayPal is not configured." });
  }

  const amountValue = paypalMoneyValue(rawAmount);
  const amount = Number(amountValue);
  const localOrderId = randomId("paypal");
  const origin = publicOriginFromRequest(req);
  const paypalOrder = await paypalRequest("/v2/checkout/orders", {
    method: "POST",
    headers: {
      "paypal-request-id": localOrderId,
    },
    body: {
      intent: "CAPTURE",
      purchase_units: [{
        reference_id: localOrderId,
        custom_id: localOrderId,
        invoice_id: localOrderId,
        description: `${PAYPAL_BRAND_NAME} credits`,
        amount: {
          currency_code: PAYPAL_CURRENCY,
          value: amountValue,
        },
      }],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: PAYPAL_BRAND_NAME,
            landing_page: "LOGIN",
            shipping_preference: "NO_SHIPPING",
            user_action: "PAY_NOW",
            return_url: `${origin}/#topups`,
            cancel_url: `${origin}/#topups`,
          },
        },
      },
    },
  });

  const rate = paypalCnyCentsPerUnit(config.wallet);
  const order = {
    id: localOrderId,
    userId: auth.user.id,
    paymentProvider: "paypal",
    baseAmount: amount,
    creditAmount: paypalCreditsForAmount(amount, config.wallet),
    cnyCentsPerUnit: rate,
    currency: PAYPAL_CURRENCY,
    payableAmount: amount,
    payableAmountText: amountValue,
    asset: PAYPAL_CURRENCY,
    network: "PayPal",
    chain: "paypal",
    address: "",
    status: "pending",
    paypalOrderId: paypalOrder.id || "",
    paypalStatus: paypalOrder.status || "",
    approvalUrl: findPayPalApprovalLink(paypalOrder),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  auth.db.walletOrders.unshift(order);
  if (dbEnabled()) {
    await createWalletOrderInDb(order);
  } else {
    await writeDb(auth.db);
  }
  return sendJson(res, 200, {
    ok: true,
    paypalOrderId: order.paypalOrderId,
    approvalUrl: order.approvalUrl,
    order: publicTopupOrder(order, config.wallet, tenantOptions),
  });
}

async function handleCapturePayPalOrder(req, res, paypalOrderId) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const config = await readAppConfig();
  const tenantOptions = requestTenantOptions(req);
  const order = await getWalletOrderByPaypalIdInDb(paypalOrderId) || (auth.db.walletOrders || []).find((entry) => (
    entry.userId === auth.user.id &&
    entry.paymentProvider === "paypal" &&
    entry.paypalOrderId === paypalOrderId
  ));
  if (!order) return sendJson(res, 404, { ok: false, message: "PayPal order not found." });

  if (order.status === "paid") {
    return sendJson(res, 200, { ok: true, order: publicTopupOrder(order, config.wallet, tenantOptions), user: userView(auth.user) });
  }

  let capturePayload;
  try {
    capturePayload = await paypalRequest(`/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`, {
      method: "POST",
      headers: {
        "paypal-request-id": `${order.id}-capture`,
      },
      body: {},
    });
  } catch (error) {
    if (error.statusCode !== 422) throw error;
    capturePayload = await paypalRequest(`/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}`);
  }

  const capture = paypalCaptureFromOrder(capturePayload);
  order.paypalStatus = capturePayload.status || capture?.status || order.paypalStatus || "";
  order.paypalCaptureId = capture?.id || order.paypalCaptureId || "";
  order.paypalPayerId = capturePayload.payer?.payer_id || order.paypalPayerId || "";
  order.paypalPayerEmail = capturePayload.payer?.email_address || order.paypalPayerEmail || "";
  order.updatedAt = new Date().toISOString();

  const completed = String(capturePayload.status || "").toUpperCase() === "COMPLETED" ||
    String(capture?.status || "").toUpperCase() === "COMPLETED";
  if (!completed) {
    await updateWalletOrderInDb(order);
    if (!dbEnabled()) await writeDb(auth.db);
    return sendJson(res, 409, {
      ok: false,
      code: "PAYPAL_NOT_COMPLETED",
      message: "PayPal payment is not completed yet.",
      order: publicTopupOrder(order, config.wallet, tenantOptions),
    });
  }

  const capturedAmount = Number(capture?.amount?.value || 0);
  const capturedCurrency = String(capture?.amount?.currency_code || PAYPAL_CURRENCY).toUpperCase();
  if (capturedCurrency !== PAYPAL_CURRENCY || Math.abs(capturedAmount - Number(order.baseAmount || 0)) > 0.009) {
    order.status = "pending";
    order.note = "PayPal capture amount mismatch. Manual review required.";
    await updateWalletOrderInDb(order);
    if (!dbEnabled()) await writeDb(auth.db);
    return sendJson(res, 409, {
      ok: false,
      code: "PAYPAL_AMOUNT_MISMATCH",
      message: "PayPal payment amount does not match the top-up order.",
      order: publicTopupOrder(order, config.wallet, tenantOptions),
    });
  }

  const { user } = await settleWalletOrderPayment(auth.db, order, config, {
    paypalCaptureId: order.paypalCaptureId,
    paypalPayerEmail: order.paypalPayerEmail,
    paypalStatus: order.paypalStatus,
  });
  await updateWalletOrderInDb(order);
  if (!dbEnabled()) await writeDb(auth.db);
  return sendJson(res, 200, { ok: true, order: publicTopupOrder(order, config.wallet, tenantOptions), user: userView(user) });
}

async function verifyPayPalWebhookEvent(req, event) {
  if (!PAYPAL_WEBHOOK_ID || !paypalEnabled()) return false;
  const payload = await paypalRequest("/v1/notifications/verify-webhook-signature", {
    method: "POST",
    body: {
      auth_algo: String(req.headers["paypal-auth-algo"] || ""),
      cert_url: String(req.headers["paypal-cert-url"] || ""),
      transmission_id: String(req.headers["paypal-transmission-id"] || ""),
      transmission_sig: String(req.headers["paypal-transmission-sig"] || ""),
      transmission_time: String(req.headers["paypal-transmission-time"] || ""),
      webhook_id: PAYPAL_WEBHOOK_ID,
      webhook_event: event,
    },
  });
  return payload.verification_status === "SUCCESS";
}

function findWalletOrderForPayPalEvent(db, event = {}) {
  const resource = event.resource || {};
  const relatedOrderId = resource.supplementary_data?.related_ids?.order_id || "";
  const captureId = String(event.event_type || "").startsWith("PAYMENT.CAPTURE.") ? resource.id : "";
  const candidateIds = [
    resource.custom_id,
    resource.invoice_id,
    relatedOrderId,
    String(event.event_type || "").startsWith("CHECKOUT.ORDER.") ? resource.id : "",
  ].filter(Boolean).map(String);
  return (db.walletOrders || []).find((order) => {
    if (captureId && order.paypalCaptureId === captureId) return true;
    if (candidateIds.includes(order.id)) return true;
    if (order.paypalOrderId && candidateIds.includes(order.paypalOrderId)) return true;
    return false;
  }) || null;
}

async function applyPayPalWebhookToOrder(db, event, config) {
  const type = String(event.event_type || "");
  const resource = event.resource || {};
  const order = findWalletOrderForPayPalEvent(db, event);
  if (!order) return false;
  order.updatedAt = new Date().toISOString();
  if (type === "PAYMENT.CAPTURE.COMPLETED") {
    const amount = Number(resource.amount?.value || 0);
    const currency = String(resource.amount?.currency_code || order.currency || "").toUpperCase();
    if (currency !== String(order.currency || PAYPAL_CURRENCY).toUpperCase() || Math.abs(amount - Number(order.baseAmount || 0)) > 0.009) {
      order.status = "pending";
      order.paypalStatus = resource.status || type;
      order.note = "PayPal webhook amount mismatch. Manual review required.";
      return true;
    }
    await safeSettleWalletOrderPayment(db, order, config, {
      paypalCaptureId: resource.id || order.paypalCaptureId,
      paypalStatus: resource.status || "COMPLETED",
      note: "Paid by PayPal webhook.",
    });
    return true;
  }
  if (type === "CHECKOUT.ORDER.COMPLETED") {
    const capture = paypalCaptureFromOrder(resource);
    const amount = Number(capture?.amount?.value || order.baseAmount || 0);
    const currency = String(capture?.amount?.currency_code || order.currency || "").toUpperCase();
    if (currency !== String(order.currency || PAYPAL_CURRENCY).toUpperCase() || Math.abs(amount - Number(order.baseAmount || 0)) > 0.009) {
      order.status = "pending";
      order.paypalStatus = resource.status || capture?.status || type;
      order.note = "PayPal webhook amount mismatch. Manual review required.";
      return true;
    }
    await safeSettleWalletOrderPayment(db, order, config, {
      paypalCaptureId: capture?.id || order.paypalCaptureId,
      paypalPayerEmail: resource.payer?.email_address || order.paypalPayerEmail,
      paypalStatus: resource.status || capture?.status || "COMPLETED",
      note: "Paid by PayPal webhook.",
    });
    return true;
  }
  if (["PAYMENT.CAPTURE.DENIED", "CHECKOUT.ORDER.VOIDED"].includes(type) && order.status !== "paid") {
    order.status = "cancelled";
    order.paypalStatus = resource.status || type;
    order.note = order.note || `PayPal event: ${type}`;
    return true;
  }
  return false;
}

async function handlePayPalWebhook(req, res) {
  let event;
  try {
    const raw = await readRawBody(req);
    event = raw ? JSON.parse(raw) : {};
  } catch {
    return sendJson(res, 400, { ok: false, message: "Invalid PayPal webhook body." });
  }
  if (!PAYPAL_WEBHOOK_ID || !paypalEnabled()) {
    return sendJson(res, 200, { ok: true, ignored: true, reason: "PayPal webhook is not configured." });
  }
  const verified = await verifyPayPalWebhookEvent(req, event);
  if (!verified) return sendJson(res, 400, { ok: false, message: "PayPal webhook verification failed." });
  const db = await readDb();
  const config = await readAppConfig();
  const changed = await applyPayPalWebhookToOrder(db, event, config);
  if (changed) {
    if (dbEnabled()) {
      const order = findWalletOrderForPayPalEvent(db, event);
      if (order) await updateWalletOrderInDb(order);
    } else {
      await writeDb(db);
    }
  }
  return sendJson(res, 200, { ok: true, handled: changed });
}

function pagingFromUrl(url, { defaultLimit = 12, maxLimit = 100 } = {}) {
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") || "1", 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, Number.parseInt(url.searchParams.get("limit") || String(defaultLimit), 10) || defaultLimit));
  return { page, limit, offset: (page - 1) * limit };
}

function dateFromQuery(value, endOfDay = false) {
  const text = String(value || "").trim();
  if (!text) return null;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(text)
    ? `${text}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`
    : text;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function recordInDateRange(createdAt, fromDate, toDate) {
  const date = new Date(createdAt || "");
  if (Number.isNaN(date.getTime())) return true;
  if (fromDate && date < fromDate) return false;
  if (toDate && date > toDate) return false;
  return true;
}

function publicTopupOrder(order = {}, wallet = {}, options = {}) {
  const paymentProvider = order.paymentProvider || (order.network === "PayPal" ? "paypal" : "manual");
  const cnyCentsPerUsdt = order.cnyCentsPerUsdt || walletCnyCentsPerUsdt(wallet);
  const cnyCentsPerUnit = order.cnyCentsPerUnit || (paymentProvider === "paypal" ? paypalCnyCentsPerUnit(wallet) : cnyCentsPerUsdt);
  const creditAmount = order.creditAmount ?? (
    order.baseAmount
      ? creditsAmount(Math.round(Number(order.baseAmount || 0) * cnyCentsPerUnit))
      : 0
  );
  const walletOption = findWalletOption(wallet, order.walletOptionId || order.network, options);
  return {
    id: order.id || "",
    paymentProvider,
    amount: order.baseAmount ?? "",
    creditAmount: creditsAmount(creditAmount),
    cnyCentsPerUsdt,
    cnyCentsPerUnit,
    payableAmount: order.payableAmount ?? "",
    payableAmountText: order.payableAmountText || String(order.payableAmount || order.baseAmount || ""),
    asset: order.asset || order.currency || "USDT",
    currency: order.currency || order.asset || "",
    walletOptionId: order.walletOptionId || "",
    network: order.network || "",
    chain: order.chain || normalizeWalletChain(order.network || ""),
    address: order.address || "",
    qrUrl: order.qrUrl || walletOption?.qrUrl || wallet.qrUrl || "",
    explorerUrl: order.explorerUrl || walletOption?.explorerUrl || "",
    status: order.status || "pending",
    transactionHash: order.transactionHash || order.txHash || "",
    confirmations: Number(order.confirmations || 0),
    blockNumber: order.blockNumber || "",
    matchedAt: order.matchedAt || "",
    matchedAmountText: order.matchedAmountText || "",
    scanSource: order.scanSource || "",
    matched: Boolean(order.matched || order.transactionHash || order.txHash),
    paypalOrderId: order.paypalOrderId || "",
    paypalCaptureId: order.paypalCaptureId || "",
    paypalStatus: order.paypalStatus || "",
    createdAt: order.createdAt || "",
    paidAt: order.paidAt || "",
    note: order.note || "",
  };
}

function publicSpendingLedger(entry = {}) {
  const meta = entry.meta && typeof entry.meta === "object" ? entry.meta : {};
  const amount = Math.abs(Number(entry.delta || 0));
  return {
    id: entry.id || "",
    amount: creditsAmount(amount),
    delta: Number(entry.delta || 0),
    balanceAfter: creditsAmount(entry.balanceAfter || 0),
    type: entry.type || "",
    title: meta.templateTitle || meta.caseTitle || meta.sceneName || meta.label || meta.source || entry.type || "",
    taskId: meta.taskId || "",
    templateId: meta.templateId || meta.caseId || "",
    provider: meta.provider || "",
    resolution: meta.resolution || "",
    duration: meta.duration || "",
    createdAt: entry.createdAt || "",
  };
}

function billingQueryFilters(url) {
  return {
    q: String(url.searchParams.get("q") || "").trim().toLowerCase(),
    status: String(url.searchParams.get("status") || "").trim().toLowerCase(),
    type: String(url.searchParams.get("type") || "").trim().toLowerCase(),
    fromDate: dateFromQuery(url.searchParams.get("from"), false),
    toDate: dateFromQuery(url.searchParams.get("to"), true),
    exportCsv: String(url.searchParams.get("export") || "").toLowerCase() === "csv",
  };
}

async function handleListTopupRecords(req, res, url) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const config = await readAppConfig();
  const tenantOptions = requestTenantOptions(req);
  const { page, limit, offset } = pagingFromUrl(url, { defaultLimit: 12, maxLimit: 200 });
  const { q, status, fromDate, toDate, exportCsv } = billingQueryFilters(url);
  const records = (auth.db.walletOrders || [])
    .filter((order) => order.userId === auth.user.id)
    .map((order) => publicTopupOrder(order, config.wallet, tenantOptions))
    .filter((order) => {
      if (status && String(order.status || "").toLowerCase() !== status) return false;
      if (!recordInDateRange(order.createdAt, fromDate, toDate)) return false;
      if (!q) return true;
      return [order.id, order.payableAmountText, order.asset, order.network, order.status, order.note, order.paymentProvider, order.paypalOrderId]
        .some((value) => String(value || "").toLowerCase().includes(q));
    });

  if (exportCsv) {
    const rows = records.map((order) => ({
      id: order.id,
      provider: order.paymentProvider,
      status: order.status,
      amount: order.amount,
      payableAmount: order.payableAmountText || order.payableAmount,
      asset: order.asset,
      network: order.network,
      paypalOrderId: order.paypalOrderId,
      credits: order.creditAmount,
      createdAt: order.createdAt,
      paidAt: order.paidAt,
      note: order.note,
    }));
    return sendCsv(res, "topup-records.csv", csvRows([
      { key: "id", label: "Order ID" },
      { key: "provider", label: "Provider" },
      { key: "status", label: "Status" },
      { key: "amount", label: "Amount" },
      { key: "payableAmount", label: "Payable Amount" },
      { key: "asset", label: "Asset" },
      { key: "network", label: "Network" },
      { key: "paypalOrderId", label: "PayPal Order ID" },
      { key: "credits", label: "Credits" },
      { key: "createdAt", label: "Created At" },
      { key: "paidAt", label: "Paid At" },
      { key: "note", label: "Note" },
    ], rows));
  }

  return sendJson(res, 200, {
    ok: true,
    records: records.slice(offset, offset + limit),
    total: records.length,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(records.length / limit)),
    user: userView(auth.user),
  });
}

async function handleListSpendingRecords(req, res, url) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const { page, limit, offset } = pagingFromUrl(url, { defaultLimit: 12, maxLimit: 200 });
  const { q, type, fromDate, toDate, exportCsv } = billingQueryFilters(url);
  const records = (auth.db.creditLedger || [])
    .filter((entry) => entry.userId === auth.user.id && Number(entry.delta || 0) < 0)
    .map(publicSpendingLedger)
    .filter((entry) => {
      if (type && String(entry.type || "").toLowerCase() !== type) return false;
      if (!recordInDateRange(entry.createdAt, fromDate, toDate)) return false;
      if (!q) return true;
      return [entry.id, entry.type, entry.title, entry.taskId, entry.templateId, entry.provider, entry.resolution]
        .some((value) => String(value || "").toLowerCase().includes(q));
    });

  const types = Array.from(new Set((auth.db.creditLedger || [])
    .filter((entry) => entry.userId === auth.user.id && Number(entry.delta || 0) < 0)
    .map((entry) => String(entry.type || "").trim())
    .filter(Boolean))).sort();

  if (exportCsv) {
    const rows = records.map((entry) => ({
      id: entry.id,
      type: entry.type,
      title: entry.title,
      amount: entry.amount,
      balanceAfter: entry.balanceAfter,
      taskId: entry.taskId,
      provider: entry.provider,
      resolution: entry.resolution,
      duration: entry.duration,
      createdAt: entry.createdAt,
    }));
    return sendCsv(res, "spending-records.csv", csvRows([
      { key: "id", label: "Ledger ID" },
      { key: "type", label: "Type" },
      { key: "title", label: "Title" },
      { key: "amount", label: "Credits Spent" },
      { key: "balanceAfter", label: "Balance After" },
      { key: "taskId", label: "Task ID" },
      { key: "provider", label: "Provider" },
      { key: "resolution", label: "Resolution" },
      { key: "duration", label: "Duration" },
      { key: "createdAt", label: "Created At" },
    ], rows));
  }

  return sendJson(res, 200, {
    ok: true,
    records: records.slice(offset, offset + limit),
    total: records.length,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(records.length / limit)),
    types,
    user: userView(auth.user),
  });
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
  try {
    assertSubtokenCanSpend(auth, cost);
  } catch (error) {
    return sendJson(res, error.statusCode || 402, error.payload || { ok: false, code: error.code || "SUBTOKEN_UNAVAILABLE", message: error.message });
  }
  await chargeUserWithSubtoken(auth, {
    cost,
    type: "spend",
    taskId: randomId("spend"),
    meta: { label: String(body.label || "") },
  });
  if (!dbEnabled()) await writeDb(auth.db);
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
    try {
      assertSubtokenCanSpend(auth, cost);
    } catch (error) {
      return sendJson(res, error.statusCode || 402, error.payload || { ok: false, code: error.code || "SUBTOKEN_UNAVAILABLE", message: error.message });
    }
    await chargeUserWithSubtoken(auth, {
      cost,
      type: "unlock_video",
      taskId: `${item.id}:${video.sceneId}:${unlockSceneEntryId}`,
      meta: { itemId: item.id, sceneId: video.sceneId, sceneEntryId: unlockSceneEntryId, videoKey: match.key },
    });
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
    if (dbEnabled()) await upsertUserUnlockInDb(unlock);
    else await writeDb(auth.db);
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
  if (sendInternalAsset(res, filePath, "video/mp4", stat, { privateCache: true })) return;
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
  const unlock = await findUserUnlockInDb({
    userId: user.id,
    itemId: payload.itemId,
    sceneId: payload.sceneId,
    sceneEntryId: payload.sceneEntryId || "default",
  }) || findUserUnlock(db, user.id, payload.itemId, payload.sceneId, payload.sceneEntryId || "default");
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
  const publicUrl = String(body.url || body.imageUrl || body.videoUrl || body.audioUrl || "").trim();
  if (publicUrl) {
    const userAsset = await createUserMediaAssetFromPublicUrl(auth.db, auth.user, {
      url: publicUrl,
      name: body.name || body.fileName || "Upload",
      fileName: body.fileName || body.name || "",
      durationSeconds: firstPresent(body.durationSeconds, body.duration, body.videoDurationSeconds, body.audioDurationSeconds),
    });
    return sendJson(res, 200, { ok: true, asset: publicUserAsset(userAsset) });
  }

  const { mime, bytes } = decodeWanMediaDataUrl(body.dataUrl || "");
  if (!mime.startsWith("image/") && !mime.startsWith("video/") && !mime.startsWith("audio/")) {
    return sendJson(res, 400, { ok: false, message: "Only image, video, or audio assets are supported." });
  }
  const maxBytes = mime.startsWith("image/") ? 8 * 1024 * 1024 : 30 * 1024 * 1024;
  const userAsset = await createUserMediaAssetFromBytes(auth.db, auth.user, {
    bytes,
    mime,
    name: body.name || "Upload",
    fileName: body.fileName || body.name || "",
    maxBytes,
    durationSeconds: firstPresent(body.durationSeconds, body.duration, body.videoDurationSeconds, body.audioDurationSeconds),
  });
  return sendJson(res, 200, { ok: true, asset: publicUserAsset(userAsset) });
}

async function handleUploadSeedanceCharacter(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  if (!USE_GATEWAY_UPSTREAM) {
    try {
      requireValue("ARK_API_KEY", ARK_API_KEY);
      requireValue("BYTEPLUS_ACCESS_KEY_ID or VOLC_ACCESS_KEY_ID", ARK_OPENAPI.accessKey);
      requireValue("BYTEPLUS_SECRET_ACCESS_KEY or VOLC_ACCESS_KEY_SECRET", ARK_OPENAPI.secretKey);
    } catch (error) {
      return sendJson(res, error.statusCode || 503, {
        ok: false,
        code: "SEEDANCE_ASSET_UPLOAD_NOT_CONFIGURED",
        message: "Seedance character upload is not configured.",
      });
    }
  }

  const body = await readJson(req);
  let userAsset = null;
  const assetId = String(firstPresent(body.assetId, body.userAssetId, body.imageAssetId, "") || "").trim();
  if (assetId) {
    userAsset = (auth.db.userAssets || []).find((asset) => asset.id === assetId && asset.userId === auth.user.id && !isSoftDeleted(asset));
    if (!userAsset) return sendJson(res, 404, { ok: false, message: "Seedance character image not found." });
  } else {
    const publicUrl = String(firstPresent(body.url, body.imageUrl, body.characterImageUrl, "") || "").trim();
    if (publicUrl) {
      userAsset = await createUserMediaAssetFromPublicUrl(auth.db, auth.user, {
        url: publicUrl,
        name: body.name || body.fileName || "Seedance character image1",
        fileName: body.fileName || body.name || "image1.png",
      });
    } else if (body.dataUrl) {
      const { mime, bytes } = decodeWanMediaDataUrl(body.dataUrl);
      if (!mime.startsWith("image/")) {
        return sendJson(res, 400, { ok: false, message: "Seedance character upload only accepts image dataUrl." });
      }
      userAsset = await createUserMediaAssetFromBytes(auth.db, auth.user, {
        bytes,
        mime,
        name: body.name || "Seedance character image1",
        fileName: body.fileName || body.name || "image1.png",
        maxBytes: 8 * 1024 * 1024,
      });
    }
  }

  if (!userAsset) {
    return sendJson(res, 400, { ok: false, message: "Provide url, imageUrl, dataUrl, or assetId for the Seedance character image." });
  }
  try {
    validateWan27MediaKind(userAsset, "image", "Seedance character image");
  } catch (error) {
    return sendJson(res, 400, { ok: false, message: error.message || "Seedance character image must be an image." });
  }

  let prepared = { asset: userAsset, referenceAssetUri: userAsset.assetUri || "", imageUrl: userAsset.publicUrl || userAsset.localUrl || "" };
  if (!USE_GATEWAY_UPSTREAM) {
    prepared = await prepareSeedanceReferenceAsset(auth.db, userAsset, false);
  }
  const finalAsset = prepared.asset || userAsset;
  const fileName = String(body.fileName || finalAsset.name || "image1.png").trim() || "image1.png";
  const reference = {
    assetId: finalAsset.id,
    assetUri: prepared.referenceAssetUri || finalAsset.assetUri || "",
    fileName,
    name: String(body.name || finalAsset.name || "image1").trim() || "image1",
    imageLabel: "Image 1",
  };
  return sendJson(res, 200, {
    ok: true,
    asset: publicUserAsset(finalAsset),
    reference,
    referenceImages: [{
      assetId: reference.assetId,
      assetUri: reference.assetUri,
      fileName: reference.fileName,
      name: reference.name,
    }],
    generateRequest: {
      provider: "seedance",
      seedanceMode: "reference_images",
      prompt: "Use Image 1 as the main character. Keep the same identity and generate a cinematic shot.",
      referenceImages: [{ assetId: reference.assetId, fileName: reference.fileName }],
      ratio: "9:16",
      resolution: "720p",
      duration: 5,
      params: { generate_audio: true },
    },
  });
}

function generationRecordAssetName(record = {}) {
  const base = record.templateTitle || record.sceneEntryName || record.sceneName || record.companionName || record.kind || record.taskId || "Generated video";
  return String(base || "Generated video").trim().slice(0, 60) || "Generated video";
}

async function bytesForGenerationRecordVideo(record = {}) {
  const localUrl = record.localVideoUrl || "";
  if (localUrl && !/^https?:\/\//i.test(localUrl)) {
    const localPath = path.normalize(path.join(ROOT, localUrl.replace(/^\//, "")));
    const assetsRoot = path.normalize(path.join(ROOT, "assets"));
    if (!localPath.startsWith(assetsRoot)) {
      const error = new Error("Generation video path is not allowed.");
      error.statusCode = 403;
      throw error;
    }
    return {
      bytes: await fs.readFile(localPath),
      mime: videoMimeFromPath(localPath),
      fileName: path.basename(localPath),
    };
  }
  const videoUrl = generationRecordVideoUrl(record);
  if (!videoUrl) {
    const error = new Error("Generation record has no video result.");
    error.statusCode = 400;
    throw error;
  }
  if (!/^https?:\/\//i.test(videoUrl)) {
    const localPath = path.normalize(path.join(ROOT, videoUrl.replace(/^\//, "")));
    const assetsRoot = path.normalize(path.join(ROOT, "assets"));
    if (!localPath.startsWith(assetsRoot)) {
      const error = new Error("Generation video path is not allowed.");
      error.statusCode = 403;
      throw error;
    }
    return {
      bytes: await fs.readFile(localPath),
      mime: videoMimeFromPath(localPath),
      fileName: path.basename(localPath),
    };
  }
  const downloaded = await downloadRemoteFileToBuffer(videoUrl, {
    label: "generation video",
    maxBytes: 30 * 1024 * 1024,
  });
  return {
    bytes: downloaded.bytes,
    mime: downloaded.mime && downloaded.mime.startsWith("video/") ? downloaded.mime : videoMimeFromPath(videoUrl),
    fileName: path.basename(new URL(videoUrl).pathname) || `${record.taskId || "generated"}.mp4`,
  };
}

async function bytesForGenerationRecordImage(record = {}) {
  const localUrl = record.localImageUrl || record.imageResultUrl || "";
  if (localUrl && !/^https?:\/\//i.test(localUrl)) {
    const localPath = path.normalize(path.join(ROOT, localUrl.replace(/^\//, "")));
    const assetsRoot = path.normalize(path.join(ROOT, "assets"));
    if (!localPath.startsWith(assetsRoot)) {
      const error = new Error("Generation image path is not allowed.");
      error.statusCode = 403;
      throw error;
    }
    return {
      bytes: await fs.readFile(localPath),
      mime: imageMimeFromPath(localPath),
      fileName: path.basename(localPath),
    };
  }
  const imageUrl = generationRecordImageUrl(record);
  if (!imageUrl) {
    const error = new Error("Generation record has no image result.");
    error.statusCode = 400;
    throw error;
  }
  if (!/^https?:\/\//i.test(imageUrl)) {
    const localPath = path.normalize(path.join(ROOT, imageUrl.replace(/^\//, "")));
    const assetsRoot = path.normalize(path.join(ROOT, "assets"));
    if (!localPath.startsWith(assetsRoot)) {
      const error = new Error("Generation image path is not allowed.");
      error.statusCode = 403;
      throw error;
    }
    return {
      bytes: await fs.readFile(localPath),
      mime: imageMimeFromPath(localPath),
      fileName: path.basename(localPath),
    };
  }
  const downloaded = await downloadRemoteFileToBuffer(imageUrl, {
    label: "generation image",
    maxBytes: 20 * 1024 * 1024,
  });
  const pathname = new URL(imageUrl).pathname;
  const mime = downloaded.mime && downloaded.mime.startsWith("image/")
    ? downloaded.mime
    : imageMimeFromKnownPath(pathname) || "image/png";
  return {
    bytes: downloaded.bytes,
    mime,
    fileName: path.basename(pathname) || `${record.taskId || "generated"}${imageExtFromMime(mime)}`,
  };
}

async function handleAddGenerationRecordToAssets(req, res, taskId) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const records = await readGenerationRecords();
  const record = records.find((entry) => entry.taskId === taskId && entry.userId === auth.user.id && isUserVisibleGenerationRecord(entry));
  if (!record) return sendJson(res, 404, { ok: false, message: "Generation record not found." });
  if (!isSucceededStatus(record.status)) return sendJson(res, 400, { ok: false, message: "Generation is not completed yet." });
  const existingAssetId = String(record.resultAssetId || "").trim();
  if (existingAssetId) {
    const existingAsset = (auth.db.userAssets || []).find((entry) => entry.id === existingAssetId && entry.userId === auth.user.id && !isSoftDeleted(entry));
    if (existingAsset) return sendJson(res, 200, { ok: true, asset: publicUserAsset(existingAsset), alreadyAdded: true });
  }
  const isImageRecord = Boolean(generationRecordImageUrl(record)) && !generationRecordVideoUrl(record);
  const media = isImageRecord ? await bytesForGenerationRecordImage(record) : await bytesForGenerationRecordVideo(record);
  const fileName = media.fileName || (isImageRecord ? `${taskId}${imageExtFromMime(media.mime)}` : `${taskId}.mp4`);
  const asset = await createUserMediaAssetFromBytes(auth.db, auth.user, {
    bytes: media.bytes,
    mime: isImageRecord
      ? (media.mime && media.mime.startsWith("image/") ? media.mime : "image/png")
      : (media.mime && media.mime.startsWith("video/") ? media.mime : "video/mp4"),
    name: generationRecordAssetName(record),
    fileName,
    maxBytes: 30 * 1024 * 1024,
  });
  if (isImageRecord) {
    if (String(record.kind || "").includes("character") || String(record.source || "").includes("character")) {
      asset.sourceCharacterId = record.characterId || "";
      asset.characterPrompt = record.prompt || "";
      asset.characterFinalPrompt = record.finalPrompt || record.prompt || "";
      asset.characterModel = record.model || "";
      asset.characterTaskId = record.upstreamTaskId || record.taskId || "";
      asset.characterParams = record.params || null;
    }
    if (record.userAssetId) asset.sourceAssetId = record.userAssetId;
    if (Array.isArray(record.userAssetIds)) asset.sourceAssetIds = record.userAssetIds;
    if (record.prompt) asset.modifyPrompt = record.prompt;
    if (record.model) asset.modifyModel = record.model;
    if (record.upstreamTaskId || record.taskId) asset.modifyTaskId = record.upstreamTaskId || record.taskId;
    if (record.params) asset.modifyParams = record.params;
    asset.updatedAt = new Date().toISOString();
    auth.db.userAssets = (auth.db.userAssets || []).map((entry) => (entry.id === asset.id ? asset : entry));
    if (dbEnabled()) await upsertUserAssetInDb(asset);
    else await writeDb(auth.db);
  }
  await updateGenerationRecord(taskId, {
    resultAssetId: asset.id,
    assetAddedAt: new Date().toISOString(),
  }, "history-add-asset");
  return sendJson(res, 200, { ok: true, asset: publicUserAsset(asset) });
}

function publicUserAsset(asset = {}) {
  const mime = String(asset.mime || "").toLowerCase();
  const kind = mime.startsWith("video/") ? "video" : mime.startsWith("audio/") ? "audio" : "image";
  const isCharacterAsset = Boolean(asset.characterPrompt || asset.characterFinalPrompt || asset.characterModel || asset.characterTaskId);
  return {
    id: asset.id,
    userId: asset.userId,
    name: asset.name || "Upload",
    kind,
    mime: asset.mime || "",
    localUrl: asset.localUrl || "",
    publicUrl: asset.publicUrl || "",
    previewUrl: asset.localUrl || asset.publicUrl || "",
    durationSeconds: durationSecondsFromValue(firstPresent(asset.durationSeconds, asset.duration)),
    assetUri: kind === "image" ? asset.assetUri || "" : "",
    seedanceAssetUri: kind === "video" ? asset.seedanceVideoAssetUri || "" : kind === "audio" ? asset.seedanceAudioAssetUri || "" : asset.assetUri || "",
    seedanceReady: Boolean(kind === "video" ? asset.seedanceVideoAssetUri : kind === "audio" ? asset.seedanceAudioAssetUri || asset.publicUrl : asset.assetUri),
    isCharacterAsset,
    characterPrompt: asset.characterPrompt || "",
    characterTaskId: asset.characterTaskId || "",
    createdAt: asset.createdAt || "",
    updatedAt: asset.updatedAt || "",
    deletedAt: asset.deletedAt || "",
  };
}

function wan27ImageModifyPricing(config = {}, user = null) {
  const pricing = normalizeAdvancedPricing(config.platform?.advancedPricing);
  const imagePricing = pricing.wan27ImagePro || DEFAULT_ADVANCED_PRICING.wan27ImagePro;
  const raw = fixedCnyPricingEstimate(imagePricing.saleCnyPerImage, "wan27_image_modify", {
    purchaseCnyPerImage: imagePricing.purchaseCnyPerImage,
    saleCnyPerImage: imagePricing.saleCnyPerImage,
    model: imagePricing.model || WAN27_IMAGE_PRO_MODEL,
  }, pricing.creditsPerCny);
  return user ? applyUserPricingToEstimate(raw, user) : raw;
}

function composeWan27CharacterPrompt(userPrompt = "", { mode = "create" } = {}) {
  const core = String(userPrompt || "").trim();
  if (mode === "take_off") {
    return CHARACTER_TAKE_OFF_PROMPT;
  }
  return core;
}

function firstPosterFromVideoMap(map = {}) {
  if (!map || typeof map !== "object") return "";
  for (const entry of Object.values(map)) {
    const poster = String(entry?.posterUrl || entry?.localPosterUrl || entry?.coverUrl || "").trim();
    if (poster) return poster;
  }
  return "";
}

async function localAssetUrlExists(value = "") {
  let publicPath = normalizePublicAssetPath(value);
  if (!publicPath && isPublicHttpUrl(value)) {
    try {
      const parsed = new URL(value);
      const base = configuredPublicBaseUrl() || "https://123vips.com";
      const baseHost = new URL(base).host;
      if (parsed.host === baseHost) publicPath = normalizePublicAssetPath(parsed.pathname);
    } catch {}
  }
  if (!publicPath || !publicPath.startsWith("/assets/")) return false;
  const filePath = path.normalize(path.join(ROOT, publicPath.replace(/^\/+/, "")));
  const assetsRoot = path.normalize(path.join(ROOT, "assets"));
  if (!filePath.startsWith(assetsRoot)) return false;
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

async function systemCharacterImageUrl(item = {}) {
  const candidates = [
    item.sourceImageUrl,
    item.localImageUrl,
    item.posterUrl,
    item.syntheticReferenceLocalUrl,
    item.publicImageUrl,
    item.imageUrl,
    item.coverUrl,
    item.thumbnailUrl,
    firstPosterFromVideoMap(item.homeSceneVideos),
    firstPosterFromVideoMap(item.sceneVideos),
    firstPosterFromVideoMap(item.unlockVideos),
  ];
  for (const candidate of candidates) {
    const value = String(candidate || "").trim();
    if (!value) continue;
    if (await localAssetUrlExists(value)) return value;
    if (isPublicHttpUrl(value) && !isLocalPublicAssetUrl(value)) return value;
  }
  return "";
}

async function handleGenerateUserCharacterImage(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  if (!ALIYUN_DASHSCOPE_API_KEY) {
    return sendJson(res, 503, { ok: false, code: "MISSING_ALIYUN_DASHSCOPE_API_KEY", message: "Wan2.7 image generation is not configured." });
  }
  const body = await readJson(req);
  const userPrompt = String(body.prompt || "").trim();
  if (!userPrompt) return sendJson(res, 400, { ok: false, message: "Prompt is required." });

  const config = await readAppConfig();
  const pricingConfig = normalizeAdvancedPricing(config.platform?.advancedPricing).wan27ImagePro;
  const imageOptions = wan27ImageRequestOptions(body, {
    defaultModel: pricingConfig.model || WAN27_IMAGE_PRO_MODEL,
    defaultRatio: pricingConfig.defaultRatio || "9:16",
    defaultResolution: pricingConfig.defaultResolution || "2K",
  });
  const { ratio, resolution, model } = imageOptions;
  const pricing = wan27ImageModifyPricing(config, auth.user);
  const cost = pricing.credits;
  if (auth.user.credits < cost) return sendJson(res, 402, insufficientCreditsPayload(cost, auth.user.credits));
  try {
    assertSubtokenCanSpend(auth, cost);
  } catch (error) {
    return sendJson(res, error.statusCode || 402, error.payload || { ok: false, code: error.code || "SUBTOKEN_UNAVAILABLE", message: error.message });
  }

  const taskId = localGenerationTaskId("char");
  const prompt = composeWan27CharacterPrompt(userPrompt, { mode: "create" });
  const initialRecord = {
    taskId,
    status: "submitting",
    model,
    source: "character-image-generate",
    kind: "character-image",
    provider: "aliyun-wan27-image",
    userId: auth.user.id,
    prompt: userPrompt,
    finalPrompt: prompt,
    params: { provider: "wan27-image", action: "character_create", ...exposedWan27ImageParams(imageOptions) },
    ratio,
    resolution,
    preDeductedCredits: cost,
    originalPreDeductedCredits: pricing.originalCredits ?? cost,
    finalCredits: null,
    originalFinalCredits: null,
    userPricingMultiplier: pricing.userPricingMultiplier ?? 1,
    billingStatus: cost > 0 ? "pre_deducted" : "free",
    billingSettledAt: "",
    pricingEstimate: pricing,
    awaitingUpstreamTask: true,
    upstreamPayload: null,
    createResponse: null,
    remoteImageUrl: "",
    localImageUrl: "",
    error: "",
    apiTokenId: auth.tokenRecord?.id || "",
    apiTokenName: auth.tokenRecord?.name || "",
    apiTokenType: auth.tokenRecord?.quotaType || "",
    apiTokenSource: auth.tokenSource || "",
  };
  await updateAssetImageModifyRecord(taskId, initialRecord, "character-image-create");
  if (cost > 0) {
    await chargeUserWithSubtoken(auth, {
      cost,
      type: "character_image_generate",
      taskId,
      meta: { taskId, model, ratio, resolution, baseCredits: pricing.baseCredits, originalCost: pricing.originalCredits, pricingMultiplier: pricing.userPricingMultiplier },
    });
    if (!dbEnabled()) await writeDb(auth.db);
  }

  try {
    const submitted = await submitWan27ImageTextGenerate({
      prompt,
      ratio,
      resolution,
      model,
      input: imageOptions.input,
      parameters: imageOptions.parameters,
    });
    const imageUrl = submitted.task.imageUrls[0];
    await updateAssetImageModifyRecord(taskId, {
      upstreamTaskId: submitted.task.taskId || "",
      awaitingUpstreamTask: false,
      status: imageUrl ? (submitted.task.status || "succeeded") : "failed",
      upstreamPayload: submitted.payload,
      createResponse: submitted.raw,
      remoteImageUrl: imageUrl || "",
      error: imageUrl ? "" : (submitted.task.error || "Wan2.7 character image returned no image."),
    }, "character-image-submit");
    if (!imageUrl) {
      const error = new Error(submitted.task.error || "Wan2.7 character image returned no image.");
      error.statusCode = 502;
      error.payload = submitted.raw;
      throw error;
    }
    const downloaded = await downloadRemoteFileToBuffer(imageUrl, { label: "character image", maxBytes: 20 * 1024 * 1024 });
    const mime = String(downloaded.mime || "").startsWith("image/") ? downloaded.mime : "image/png";
    const savedImage = await saveGeneratedImageFile(taskId, downloaded.bytes, mime);
    await updateAssetImageModifyRecord(taskId, {
      status: "succeeded",
      awaitingUpstreamTask: false,
      imageResultUrl: savedImage.cdnImageUrl || savedImage.localImageUrl,
      localImageUrl: savedImage.localImageUrl,
      localImagePath: savedImage.localImagePath,
      cdnImageUrl: savedImage.cdnImageUrl,
      cdnError: savedImage.cdnError,
      remoteImageUrl: imageUrl,
      finalCredits: cost,
      originalFinalCredits: pricing.originalCredits ?? cost,
      billingStatus: cost > 0 ? "settled" : "free",
      billingSettledAt: new Date().toISOString(),
      error: "",
    }, "character-image-succeeded");
    const latestUser = (auth.db.users || []).find((entry) => entry.id === auth.user.id) || auth.user;
    const publicRecord = publicGenerationRecord(await getGenerationRecord(taskId) || { taskId }, generationRecordResponseOptionsForAuth(auth));
    return sendJson(res, 200, {
      ok: true,
      taskId,
      upstreamTaskId: submitted.task.taskId || "",
      imageUrl: publicRecord.imageResultUrl || savedImage.localImageUrl,
      user: userView(latestUser),
      pricing,
      cost,
      record: publicRecord,
      params: exposedWan27ImageParams(imageOptions),
    });
  } catch (error) {
    const errorInfo = normalizeErrorPayload(error);
    console.warn("[character-image-error]", taskId, errorInfo.message || error.message || error, JSON.stringify(errorInfo.payload || {}).slice(0, 1000));
    if (cost > 0) {
      try {
        const db = await readDb();
        await changeUserCredits(db, auth.user.id, cost, "character_image_generate_refund", { taskId, error: error.message || "Wan2.7 character image failed." });
        await recordSubtokenAdjustment(auth, { taskId, type: "character_image_generate_refund", amount: -cost, meta: { error: error.message || "Wan2.7 character image failed." } });
        if (!dbEnabled()) await writeDb(db);
      } catch (refundError) {
        console.error("[character-image-refund-failed]", refundError.message || refundError);
      }
    }
    await updateAssetImageModifyRecord(taskId, {
      status: "failed",
      awaitingUpstreamTask: false,
      error: errorInfo.message || "Wan2.7 character image failed.",
      code: errorInfo.code || "",
      errorPayload: errorInfo.payload || null,
      createResponse: errorInfo.payload || null,
      finalCredits: 0,
      originalFinalCredits: 0,
      billingStatus: cost > 0 ? "refunded" : "free",
      billingSettledAt: new Date().toISOString(),
      failedAt: new Date().toISOString(),
    }, "character-image-failed");
    return sendJson(res, error.statusCode || 502, {
      ok: false,
      message: error.message || "Wan2.7 character image failed.",
      code: error.code || "",
      taskId,
      record: publicGenerationRecord(await getGenerationRecord(taskId) || { taskId }, generationRecordResponseOptionsForAuth(auth)),
      payload: error.payload || null,
    });
  }
}

async function handleModifySystemCharacterImage(req, res, characterId) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  if (!ALIYUN_DASHSCOPE_API_KEY) return sendJson(res, 503, { ok: false, message: "DashScope API key is not configured." });
  const config = await readAppConfig();
  config.homeVideo = normalizeHomeVideo(config.homeVideo || {});
  const character = findHomeVideoItem(config.homeVideo, characterId);
  if (!character || isSoftDeleted(character)) return sendJson(res, 404, { ok: false, message: "Character not found." });
  const imageUrl = await systemCharacterImageUrl(character);
  if (!imageUrl) return sendJson(res, 400, { ok: false, message: "Character has no image." });

  const body = await readJson(req);
  const mode = String(body.mode || "modify").trim().toLowerCase();
  const userPrompt = String(body.prompt || "").trim();
  const displayPrompt = mode === "take_off" ? CHARACTER_TAKE_OFF_PROMPT : userPrompt;
  const prompt = composeWan27CharacterPrompt(displayPrompt, {
    mode: mode === "take_off" ? "take_off" : "modify",
  });
  if (mode !== "take_off" && !userPrompt) return sendJson(res, 400, { ok: false, message: "Prompt is required." });

  const pricingConfig = normalizeAdvancedPricing(config.platform?.advancedPricing).wan27ImagePro;
  const imageOptions = wan27ImageRequestOptions(body, {
    defaultModel: pricingConfig.model || WAN27_IMAGE_PRO_MODEL,
    defaultRatio: pricingConfig.defaultRatio || "9:16",
    defaultResolution: pricingConfig.defaultResolution || "2K",
  });
  const { ratio, resolution, model } = imageOptions;
  const pricing = wan27ImageModifyPricing(config, auth.user);
  const cost = pricing.credits;
  if (auth.user.credits < cost) return sendJson(res, 402, insufficientCreditsPayload(cost, auth.user.credits));
  try {
    assertSubtokenCanSpend(auth, cost);
  } catch (error) {
    return sendJson(res, error.statusCode || 402, error.payload || { ok: false, code: error.code || "SUBTOKEN_UNAVAILABLE", message: error.message });
  }

  const taskId = localGenerationTaskId("char");
  const initialRecord = {
    taskId,
    status: "submitting",
    model,
    source: "character-image-modify",
    kind: "character-image",
    provider: "aliyun-wan27-image",
    userId: auth.user.id,
    characterId: character.id || "",
    characterName: character.name || "",
    imageUrl,
    sourceImageUrl: imageUrl,
    prompt: displayPrompt,
    finalPrompt: prompt,
    params: { provider: "wan27-image", action: mode === "take_off" ? "take_off" : "character_modify", ...exposedWan27ImageParams(imageOptions) },
    ratio,
    resolution,
    preDeductedCredits: cost,
    originalPreDeductedCredits: pricing.originalCredits ?? cost,
    finalCredits: null,
    originalFinalCredits: null,
    userPricingMultiplier: pricing.userPricingMultiplier ?? 1,
    billingStatus: cost > 0 ? "pre_deducted" : "free",
    billingSettledAt: "",
    pricingEstimate: pricing,
    awaitingUpstreamTask: true,
    upstreamPayload: null,
    createResponse: null,
    remoteImageUrl: "",
    localImageUrl: "",
    error: "",
    apiTokenId: auth.tokenRecord?.id || "",
    apiTokenName: auth.tokenRecord?.name || "",
    apiTokenType: auth.tokenRecord?.quotaType || "",
    apiTokenSource: auth.tokenSource || "",
  };
  await updateAssetImageModifyRecord(taskId, initialRecord, "character-image-modify-create");
  if (cost > 0) {
    await chargeUserWithSubtoken(auth, {
      cost,
      type: "character_image_modify",
      taskId,
      meta: { taskId, characterId: character.id || "", model, ratio, resolution, action: initialRecord.params.action },
    });
    if (!dbEnabled()) await writeDb(auth.db);
  }

  try {
    const publicSourceUrl = /^https?:\/\//i.test(imageUrl) ? imageUrl : publicUrlForAssetPath(imageUrl);
    const submitted = await submitWan27ImageModify({
      imageUrl: publicSourceUrl,
      prompt,
      ratio,
      resolution,
      model,
      input: imageOptions.input,
      parameters: imageOptions.parameters,
    });
    const resultUrl = submitted.task.imageUrls[0];
    await updateAssetImageModifyRecord(taskId, {
      upstreamTaskId: submitted.task.taskId || "",
      awaitingUpstreamTask: false,
      status: resultUrl ? (submitted.task.status || "succeeded") : "failed",
      upstreamPayload: submitted.payload,
      createResponse: submitted.raw,
      remoteImageUrl: resultUrl || "",
      error: resultUrl ? "" : (submitted.task.error || "Wan2.7 character modify returned no image."),
    }, "character-image-modify-submit");
    if (!resultUrl) {
      const error = new Error(submitted.task.error || "Wan2.7 character modify returned no image.");
      error.statusCode = 502;
      error.payload = submitted.raw;
      throw error;
    }
    const downloaded = await downloadRemoteFileToBuffer(resultUrl, { label: "character modified image", maxBytes: 20 * 1024 * 1024 });
    const mime = String(downloaded.mime || "").startsWith("image/") ? downloaded.mime : "image/png";
    const savedImage = await saveGeneratedImageFile(taskId, downloaded.bytes, mime);
    await updateAssetImageModifyRecord(taskId, {
      status: "succeeded",
      awaitingUpstreamTask: false,
      imageResultUrl: savedImage.cdnImageUrl || savedImage.localImageUrl,
      localImageUrl: savedImage.localImageUrl,
      localImagePath: savedImage.localImagePath,
      cdnImageUrl: savedImage.cdnImageUrl,
      cdnError: savedImage.cdnError,
      remoteImageUrl: resultUrl,
      finalCredits: cost,
      originalFinalCredits: pricing.originalCredits ?? cost,
      billingStatus: cost > 0 ? "settled" : "free",
      billingSettledAt: new Date().toISOString(),
      error: "",
    }, "character-image-modify-succeeded");
    const latestUser = (auth.db.users || []).find((entry) => entry.id === auth.user.id) || auth.user;
    const publicRecord = publicGenerationRecord(await getGenerationRecord(taskId) || { taskId }, generationRecordResponseOptionsForAuth(auth));
    return sendJson(res, 200, {
      ok: true,
      taskId,
      upstreamTaskId: submitted.task.taskId || "",
      imageUrl: publicRecord.imageResultUrl || savedImage.localImageUrl,
      sourceCharacter: { id: character.id || "", name: character.name || "", imageUrl },
      user: userView(latestUser),
      pricing,
      cost,
      record: publicRecord,
      params: { mode, ...exposedWan27ImageParams(imageOptions) },
    });
  } catch (error) {
    const errorInfo = normalizeErrorPayload(error);
    console.warn("[character-image-modify-error]", taskId, errorInfo.message || error.message || error, JSON.stringify(errorInfo.payload || {}).slice(0, 1000));
    if (cost > 0) {
      try {
        const db = await readDb();
        await changeUserCredits(db, auth.user.id, cost, "character_image_modify_refund", { taskId, characterId: character.id || "", error: error.message || "Wan2.7 character modify failed." });
        await recordSubtokenAdjustment(auth, { taskId, type: "character_image_modify_refund", amount: -cost, meta: { characterId: character.id || "", error: error.message || "Wan2.7 character modify failed." } });
        if (!dbEnabled()) await writeDb(db);
      } catch (refundError) {
        console.error("[character-image-modify-refund-failed]", refundError.message || refundError);
      }
    }
    await updateAssetImageModifyRecord(taskId, {
      status: "failed",
      awaitingUpstreamTask: false,
      error: errorInfo.message || "Wan2.7 character modify failed.",
      code: errorInfo.code || "",
      errorPayload: errorInfo.payload || null,
      createResponse: errorInfo.payload || null,
      finalCredits: 0,
      originalFinalCredits: 0,
      billingStatus: cost > 0 ? "refunded" : "free",
      billingSettledAt: new Date().toISOString(),
      failedAt: new Date().toISOString(),
    }, "character-image-modify-failed");
    return sendJson(res, error.statusCode || 502, {
      ok: false,
      message: error.message || "Wan2.7 character modify failed.",
      code: error.code || "",
      taskId,
      record: publicGenerationRecord(await getGenerationRecord(taskId) || { taskId }, generationRecordResponseOptionsForAuth(auth)),
      payload: error.payload || null,
    });
  }
}

async function updateAssetImageModifyRecord(taskId, updates = {}, reason = "asset-image-modify") {
  const existing = await getGenerationRecord(taskId).catch(() => null);
  return upsertGenerationRecord({
    taskId,
    source: existing?.source || "asset-image-modify",
    kind: existing?.kind || "asset-image",
    provider: existing?.provider || "aliyun-wan27-image",
    ...updates,
    lastUpdateReason: reason,
  });
}

function imageEditAssetIdsFromBody(body = {}) {
  const ids = [];
  for (const key of ["imageAssetIds", "image_asset_ids", "assetIds", "asset_ids", "userAssetIds", "user_asset_ids"]) {
    if (body[key] !== undefined && body[key] !== null && body[key] !== "") ids.push(...arrayFromBody(body[key]));
  }
  for (const key of ["imageAssetId", "image_asset_id", "assetId", "asset_id", "userAssetId", "user_asset_id"]) {
    if (body[key] !== undefined && body[key] !== null && body[key] !== "") ids.push(...arrayFromBody(body[key]));
  }
  return ids.map((value) => String(value || "").trim()).filter(Boolean);
}

async function handleWan27ImageEdit(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  if (!ALIYUN_DASHSCOPE_API_KEY) {
    return sendJson(res, 503, { ok: false, code: "MISSING_ALIYUN_DASHSCOPE_API_KEY", message: "Wan2.7 image generation is not configured." });
  }

  const body = await readJson(req);
  const prompt = String(body.prompt || "").trim();
  if (!prompt) return sendJson(res, 400, { ok: false, message: "Prompt is required." });
  const bodyParams = requestParamsFromBody(body);
  const mergedBody = { ...bodyParams, ...body };
  const assetIds = imageEditAssetIdsFromBody(mergedBody);
  if (assetIds.length > 9) {
    return sendJson(res, 400, { ok: false, code: "TOO_MANY_IMAGES", message: "Wan2.7 image edit supports 0 to 9 input images." });
  }

  const sourceAssets = [];
  for (const assetId of assetIds) {
    const asset = auth.db.userAssets.find((entry) => entry.id === assetId && entry.userId === auth.user.id && !isSoftDeleted(entry));
    if (!asset) return sendJson(res, 404, { ok: false, message: `Asset not found: ${assetId}` });
    if (!String(asset.mime || "").toLowerCase().startsWith("image/")) {
      return sendJson(res, 400, { ok: false, message: "Wan2.7 image edit only accepts image assets." });
    }
    sourceAssets.push(asset);
  }

  const config = await readAppConfig();
  const pricingConfig = normalizeAdvancedPricing(config.platform?.advancedPricing).wan27ImagePro;
  const imageOptions = wan27ImageRequestOptions(mergedBody, {
    defaultModel: pricingConfig.model || WAN27_IMAGE_PRO_MODEL,
    defaultRatio: pricingConfig.defaultRatio || "9:16",
    defaultResolution: pricingConfig.defaultResolution || "2K",
  });
  const { ratio, resolution, model } = imageOptions;
  const pricing = wan27ImageModifyPricing(config, auth.user);
  const cost = pricing.credits;
  if (auth.user.credits < cost) {
    return sendJson(res, 402, insufficientCreditsPayload(cost, auth.user.credits));
  }
  try {
    assertSubtokenCanSpend(auth, cost);
  } catch (error) {
    return sendJson(res, error.statusCode || 402, error.payload || { ok: false, code: error.code || "SUBTOKEN_UNAVAILABLE", message: error.message });
  }

  const taskId = localGenerationTaskId("img");
  const previewUrls = sourceAssets.map((asset) => asset.localUrl || asset.publicUrl || "");
  const initialRecord = {
    taskId,
    status: "submitting",
    model,
    source: "asset-image-modify",
    kind: "asset-image",
    provider: "aliyun-wan27-image",
    userId: auth.user.id,
    userAssetIds: sourceAssets.map((asset) => asset.id),
    userAssetId: sourceAssets[0]?.id || "",
    imageUrl: previewUrls[0] || "",
    imageUrls: previewUrls,
    sourceImageUrl: previewUrls[0] || "",
    sourceImageUrls: previewUrls,
    prompt,
    finalPrompt: prompt,
    params: {
      provider: "wan27-image",
      action: sourceAssets.length ? "image_edit" : "text_to_image",
      imageCount: sourceAssets.length,
      ...exposedWan27ImageParams(imageOptions),
    },
    ratio,
    resolution,
    preDeductedCredits: cost,
    originalPreDeductedCredits: pricing.originalCredits ?? cost,
    finalCredits: null,
    originalFinalCredits: null,
    userPricingMultiplier: pricing.userPricingMultiplier ?? 1,
    billingStatus: cost > 0 ? "pre_deducted" : "free",
    billingSettledAt: "",
    pricingEstimate: pricing,
    awaitingUpstreamTask: true,
    upstreamPayload: null,
    createResponse: null,
    queryResponse: null,
    remoteImageUrl: "",
    localImageUrl: "",
    error: "",
    apiTokenId: auth.tokenRecord?.id || "",
    apiTokenName: auth.tokenRecord?.name || "",
    apiTokenType: auth.tokenRecord?.quotaType || "",
    apiTokenSource: auth.tokenSource || "",
  };
  await updateAssetImageModifyRecord(taskId, initialRecord, "wan27-image-edit-create");
  if (cost > 0) {
    await chargeUserWithSubtoken(auth, {
      cost,
      type: "asset_image_modify",
      taskId,
      meta: {
        taskId,
        assetIds: sourceAssets.map((asset) => asset.id),
        model,
        ratio,
        resolution,
        imageCount: sourceAssets.length,
        baseCredits: pricing.baseCredits,
        originalCost: pricing.originalCredits,
        pricingMultiplier: pricing.userPricingMultiplier,
        purchaseCnyPerImage: pricing.purchaseCnyPerImage,
        saleCnyPerImage: pricing.saleCnyPerImage,
        pricingSource: pricing.source,
      },
    });
    if (!dbEnabled()) await writeDb(auth.db);
  }

  try {
    const preparedAssets = [];
    for (const asset of sourceAssets) {
      preparedAssets.push(await ensurePublicUrlForUserMediaAsset(auth.db, asset));
    }
    const publicImageUrls = preparedAssets.map((asset) => asset.publicUrl || publicUrlForLocalAsset(asset)).filter(Boolean);
    if (publicImageUrls.length !== sourceAssets.length) {
      const error = new Error("Failed to prepare all source images for Wan2.7 image edit.");
      error.statusCode = 502;
      throw error;
    }
    const referenceUrls = preparedAssets.map((asset) => asset.localUrl || asset.publicUrl || "");
    await updateAssetImageModifyRecord(taskId, {
      imageUrl: referenceUrls[0] || "",
      imageUrls: referenceUrls,
      sourceImageUrl: referenceUrls[0] || "",
      sourceImageUrls: referenceUrls,
      status: "running",
    }, "wan27-image-edit-references-ready");
    const submitted = await submitWan27ImageModify({
      imageUrls: publicImageUrls,
      prompt,
      ratio,
      resolution,
      model,
      input: imageOptions.input,
      parameters: imageOptions.parameters,
    });
    const imageUrl = submitted.task.imageUrls[0];
    await updateAssetImageModifyRecord(taskId, {
      upstreamTaskId: submitted.task.taskId || "",
      awaitingUpstreamTask: false,
      status: imageUrl ? (submitted.task.status || "succeeded") : "failed",
      upstreamPayload: submitted.payload,
      createResponse: submitted.raw,
      remoteImageUrl: imageUrl || "",
      error: imageUrl ? "" : (submitted.task.error || "Wan2.7 image edit returned no image."),
    }, "wan27-image-edit-submit");
    if (!imageUrl) {
      const error = new Error(submitted.task.error || "Wan2.7 image edit returned no image.");
      error.statusCode = 502;
      error.payload = submitted.raw;
      throw error;
    }
    const downloaded = await downloadRemoteFileToBuffer(imageUrl, { label: "edited image", maxBytes: 20 * 1024 * 1024 });
    const mime = String(downloaded.mime || "").startsWith("image/") ? downloaded.mime : "image/png";
    const savedImage = await saveGeneratedImageFile(taskId, downloaded.bytes, mime);
    await updateAssetImageModifyRecord(taskId, {
      status: "succeeded",
      awaitingUpstreamTask: false,
      imageResultUrl: savedImage.cdnImageUrl || savedImage.localImageUrl,
      localImageUrl: savedImage.localImageUrl,
      localImagePath: savedImage.localImagePath,
      cdnImageUrl: savedImage.cdnImageUrl,
      cdnError: savedImage.cdnError,
      remoteImageUrl: imageUrl,
      finalCredits: cost,
      originalFinalCredits: pricing.originalCredits ?? cost,
      billingStatus: cost > 0 ? "settled" : "free",
      billingSettledAt: new Date().toISOString(),
      error: "",
    }, "wan27-image-edit-succeeded");
    const latestUser = (auth.db.users || []).find((entry) => entry.id === auth.user.id) || auth.user;
    const publicRecord = publicGenerationRecord(await getGenerationRecord(taskId) || { taskId }, generationRecordResponseOptionsForAuth(auth));
    return sendJson(res, 200, {
      ok: true,
      taskId,
      upstreamTaskId: submitted.task.taskId || "",
      imageUrl: publicRecord.imageResultUrl || savedImage.localImageUrl,
      sourceAssets: sourceAssets.map(publicUserAsset),
      sourceAsset: sourceAssets[0] ? publicUserAsset(sourceAssets[0]) : null,
      user: userView(latestUser),
      pricing,
      cost,
      record: publicRecord,
      params: {
        ...exposedWan27ImageParams(imageOptions),
        imageCount: sourceAssets.length,
      },
    });
  } catch (error) {
    const errorInfo = normalizeErrorPayload(error);
    console.warn("[wan27-image-edit-error]", taskId, errorInfo.message || error.message || error, JSON.stringify(errorInfo.payload || {}).slice(0, 1000));
    if (cost > 0) {
      try {
        const db = await readDb();
        await changeUserCredits(db, auth.user.id, cost, "asset_image_modify_refund", {
          taskId,
          assetIds: sourceAssets.map((asset) => asset.id),
          error: error.message || "Wan2.7 image edit failed.",
        });
        await recordSubtokenAdjustment(auth, {
          taskId,
          type: "asset_image_modify_refund",
          amount: -cost,
          meta: { assetIds: sourceAssets.map((asset) => asset.id), error: error.message || "Wan2.7 image edit failed." },
        });
        if (!dbEnabled()) await writeDb(db);
      } catch (refundError) {
        console.error("[wan27-image-edit-refund-failed]", refundError.message || refundError);
      }
    }
    await updateAssetImageModifyRecord(taskId, {
      status: "failed",
      awaitingUpstreamTask: false,
      error: errorInfo.message || "Wan2.7 image edit failed.",
      code: errorInfo.code || "",
      errorPayload: errorInfo.payload || null,
      createResponse: errorInfo.payload || null,
      finalCredits: 0,
      originalFinalCredits: 0,
      billingStatus: cost > 0 ? "refunded" : "free",
      billingSettledAt: new Date().toISOString(),
      failedAt: new Date().toISOString(),
    }, "wan27-image-edit-failed");
    return sendJson(res, error.statusCode || 502, {
      ok: false,
      message: error.message || "Wan2.7 image edit failed.",
      code: error.code || "",
      taskId,
      record: publicGenerationRecord(await getGenerationRecord(taskId) || { taskId }, generationRecordResponseOptionsForAuth(auth)),
      payload: error.payload || null,
    });
  }
}

async function handleModifyUserAssetImage(req, res, assetId) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  if (!ALIYUN_DASHSCOPE_API_KEY) {
    return sendJson(res, 503, { ok: false, code: "MISSING_ALIYUN_DASHSCOPE_API_KEY", message: "Wan2.7 image generation is not configured." });
  }
  const asset = auth.db.userAssets.find((entry) => entry.id === assetId && entry.userId === auth.user.id && !isSoftDeleted(entry));
  if (!asset) return sendJson(res, 404, { ok: false, message: "Asset not found." });
  if (!String(asset.mime || "").toLowerCase().startsWith("image/")) {
    return sendJson(res, 400, { ok: false, message: "Only image assets can be modified." });
  }

  const body = await readJson(req);
  const prompt = String(body.prompt || "").trim();
  if (!prompt) return sendJson(res, 400, { ok: false, message: "Prompt is required." });
  const config = await readAppConfig();
  const pricingConfig = normalizeAdvancedPricing(config.platform?.advancedPricing).wan27ImagePro;
  const imageOptions = wan27ImageRequestOptions(body, {
    defaultModel: pricingConfig.model || WAN27_IMAGE_PRO_MODEL,
    defaultRatio: pricingConfig.defaultRatio || "9:16",
    defaultResolution: pricingConfig.defaultResolution || "2K",
  });
  const { ratio, resolution, model } = imageOptions;
  const pricing = wan27ImageModifyPricing(config, auth.user);
  const cost = pricing.credits;
  if (auth.user.credits < cost) {
    return sendJson(res, 402, insufficientCreditsPayload(cost, auth.user.credits));
  }
  try {
    assertSubtokenCanSpend(auth, cost);
  } catch (error) {
    return sendJson(res, error.statusCode || 402, error.payload || { ok: false, code: error.code || "SUBTOKEN_UNAVAILABLE", message: error.message });
  }

  const taskId = localGenerationTaskId("img");
  const assetPreviewUrl = asset.localUrl || asset.publicUrl || "";
  const initialRecord = {
    taskId,
    status: "submitting",
    model,
    source: "asset-image-modify",
    kind: "asset-image",
    provider: "aliyun-wan27-image",
    userId: auth.user.id,
    userAssetId: asset.id,
    imageUrl: assetPreviewUrl,
    sourceImageUrl: assetPreviewUrl,
    prompt,
    finalPrompt: prompt,
    params: {
      provider: "wan27-image",
      action: "modify",
      ...exposedWan27ImageParams(imageOptions),
    },
    ratio,
    resolution,
    preDeductedCredits: cost,
    originalPreDeductedCredits: pricing.originalCredits ?? cost,
    finalCredits: null,
    originalFinalCredits: null,
    userPricingMultiplier: pricing.userPricingMultiplier ?? 1,
    billingStatus: cost > 0 ? "pre_deducted" : "free",
    billingSettledAt: "",
    pricingEstimate: pricing,
    awaitingUpstreamTask: true,
    upstreamPayload: null,
    createResponse: null,
    queryResponse: null,
    remoteImageUrl: "",
    localImageUrl: "",
    error: "",
    apiTokenId: auth.tokenRecord?.id || "",
    apiTokenName: auth.tokenRecord?.name || "",
    apiTokenType: auth.tokenRecord?.quotaType || "",
    apiTokenSource: auth.tokenSource || "",
  };
  await updateAssetImageModifyRecord(taskId, initialRecord, "asset-image-modify-create");
  if (cost > 0) {
    await chargeUserWithSubtoken(auth, {
      cost,
      type: "asset_image_modify",
      taskId,
      meta: {
        taskId,
        assetId,
        model,
        ratio,
        resolution,
        baseCredits: pricing.baseCredits,
        originalCost: pricing.originalCredits,
        pricingMultiplier: pricing.userPricingMultiplier,
        purchaseCnyPerImage: pricing.purchaseCnyPerImage,
        saleCnyPerImage: pricing.saleCnyPerImage,
        pricingSource: pricing.source,
      },
    });
    if (!dbEnabled()) await writeDb(auth.db);
  }

  try {
    const publicAsset = await ensurePublicUrlForUserMediaAsset(auth.db, asset);
    await updateAssetImageModifyRecord(taskId, {
      imageUrl: publicAsset.localUrl || publicAsset.publicUrl || assetPreviewUrl,
      sourceImageUrl: publicAsset.localUrl || publicAsset.publicUrl || assetPreviewUrl,
      status: "running",
    }, "asset-image-modify-reference-ready");
    const submitted = await submitWan27ImageModify({
      imageUrl: publicAsset.publicUrl || publicUrlForLocalAsset(publicAsset),
      prompt,
      ratio,
      resolution,
      model,
      input: imageOptions.input,
      parameters: imageOptions.parameters,
    });
    const imageUrl = submitted.task.imageUrls[0];
    await updateAssetImageModifyRecord(taskId, {
      upstreamTaskId: submitted.task.taskId || "",
      awaitingUpstreamTask: false,
      status: imageUrl ? (submitted.task.status || "succeeded") : "failed",
      upstreamPayload: submitted.payload,
      createResponse: submitted.raw,
      remoteImageUrl: imageUrl || "",
      error: imageUrl ? "" : (submitted.task.error || "Wan2.7 image modify returned no image."),
    }, "asset-image-modify-submit");
    if (!imageUrl) {
      const error = new Error(submitted.task.error || "Wan2.7 image modify returned no image.");
      error.statusCode = 502;
      error.payload = submitted.raw;
      throw error;
    }
    const downloaded = await downloadRemoteFileToBuffer(imageUrl, { label: "modified image", maxBytes: 20 * 1024 * 1024 });
    const mime = String(downloaded.mime || "").startsWith("image/") ? downloaded.mime : "image/png";
    const savedImage = await saveGeneratedImageFile(taskId, downloaded.bytes, mime);
    await updateAssetImageModifyRecord(taskId, {
      status: "succeeded",
      awaitingUpstreamTask: false,
      imageResultUrl: savedImage.cdnImageUrl || savedImage.localImageUrl,
      localImageUrl: savedImage.localImageUrl,
      localImagePath: savedImage.localImagePath,
      cdnImageUrl: savedImage.cdnImageUrl,
      cdnError: savedImage.cdnError,
      remoteImageUrl: imageUrl,
      finalCredits: cost,
      originalFinalCredits: pricing.originalCredits ?? cost,
      billingStatus: cost > 0 ? "settled" : "free",
      billingSettledAt: new Date().toISOString(),
      error: "",
    }, "asset-image-modify-succeeded");
    const latestUser = (auth.db.users || []).find((entry) => entry.id === auth.user.id) || auth.user;
    const publicRecord = publicGenerationRecord(await getGenerationRecord(taskId) || { taskId }, generationRecordResponseOptionsForAuth(auth));
    return sendJson(res, 200, {
      ok: true,
      taskId,
      upstreamTaskId: submitted.task.taskId || "",
      imageUrl: publicRecord.imageResultUrl || savedImage.localImageUrl,
      sourceAsset: publicUserAsset(asset),
      user: userView(latestUser),
      pricing,
      cost,
      record: publicRecord,
      params: exposedWan27ImageParams(imageOptions),
    });
  } catch (error) {
    const errorInfo = normalizeErrorPayload(error);
    console.warn("[asset-image-modify-error]", taskId, errorInfo.message || error.message || error, JSON.stringify(errorInfo.payload || {}).slice(0, 1000));
    if (cost > 0) {
      try {
        const db = await readDb();
        await changeUserCredits(db, auth.user.id, cost, "asset_image_modify_refund", {
          taskId,
          assetId,
          error: error.message || "Wan2.7 image modify failed.",
        });
        await recordSubtokenAdjustment(auth, {
          taskId,
          type: "asset_image_modify_refund",
          amount: -cost,
          meta: { assetId, error: error.message || "Wan2.7 image modify failed." },
        });
        if (!dbEnabled()) await writeDb(db);
      } catch (refundError) {
        console.error("[asset-image-modify-refund-failed]", refundError.message || refundError);
      }
    }
    await updateAssetImageModifyRecord(taskId, {
      status: "failed",
      awaitingUpstreamTask: false,
      error: errorInfo.message || "Wan2.7 image modify failed.",
      code: errorInfo.code || "",
      errorPayload: errorInfo.payload || null,
      createResponse: errorInfo.payload || null,
      finalCredits: 0,
      originalFinalCredits: 0,
      billingStatus: cost > 0 ? "refunded" : "free",
      billingSettledAt: new Date().toISOString(),
      failedAt: new Date().toISOString(),
    }, "asset-image-modify-failed");
    return sendJson(res, error.statusCode || 502, {
      ok: false,
      message: error.message || "Wan2.7 image modify failed.",
      code: error.code || "",
      taskId,
      record: publicGenerationRecord(await getGenerationRecord(taskId) || { taskId }, generationRecordResponseOptionsForAuth(auth)),
      payload: error.payload || null,
    });
  }
}

async function handleListUserAssets(req, res, url = null) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const params = url?.searchParams || new URLSearchParams();
  const q = String(params.get("q") || "").trim().toLowerCase();
  const type = String(params.get("type") || "").trim().toLowerCase();
  const { page, limit, offset } = pagingFromUrl(url || new URL("http://localhost"), { defaultLimit: 8, maxLimit: 50 });
  const filtered = auth.db.userAssets
    .filter((asset) => asset.userId === auth.user.id && !isSoftDeleted(asset))
    .map(publicUserAsset)
    .filter((asset) => !type || asset.kind === type)
    .filter((asset) => !q || [asset.name, asset.id, asset.mime].some((value) => String(value || "").toLowerCase().includes(q)))
    .sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || "")));
  const total = filtered.length;
  const assets = filtered.slice(offset, offset + limit);
  return sendJson(res, 200, {
    ok: true,
    assets,
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
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
  if (dbEnabled()) await upsertUserAssetInDb(asset);
  else await writeDb(auth.db);
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
  if (record.referenceAssetUri && (!localPublicAssetStorageEnabled() || isLocalPublicAssetUrl(record.publicImageUrl))) return record;
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
    const localSourcePublicUrl = publicUrlForAssetPath(sourceUrl);
    let uploaded = { publicUrl: localSourcePublicUrl, key: "" };
    if (!uploaded.publicUrl) {
      uploaded = await uploadBufferToTos({
        userId: record.userId || "user",
        assetId: `${record.id}-source`,
        bytes: sourceBytes,
        mime: record.sourceImageMime || record.imageMime || imageMimeFromPath(sourcePath),
      });
    }
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
  const localRefPublicUrl = publicUrlForAssetPath(localUrl);
  let uploadedRef = { publicUrl: localRefPublicUrl, key: "" };
  if (!uploadedRef.publicUrl) {
    uploadedRef = await uploadBufferToTos({
      userId: record.userId || "user",
      assetId: `${record.id}-ref`,
      bytes: refBytes,
      mime: record.imageMime || imageMimeFromPath(localPath),
    });
  }
  const created = await arkOpenApiAction("CreateAsset", {
    GroupId: ARK_OPENAPI.groupId,
    URL: uploadedRef.publicUrl,
    AssetType: "Image",
    Moderation: { Strategy: "Skip" },
    Name: storageObjectName("user", record.id),
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

  await chargeUserWithSubtoken(auth, {
    cost,
    type: "user_character_main_video",
    taskId: task.taskId,
    meta: { characterId: prepared.id, duration: payload.duration },
  });
  if (!dbEnabled()) await writeDb(auth.db);

  prepared.taskId = task.taskId;
  prepared.status = task.status;
  prepared.videoUrl = task.videoUrl || "";
  prepared.remoteVideoUrl = task.videoUrl || "";
  prepared.prompt = userPrompt || prompt;
  prepared.userPrompt = userPrompt;
  prepared.finalPrompt = prompt;
  prepared.updatedAt = new Date().toISOString();
  auth.db.userCharacters = auth.db.userCharacters.map((entry) => (entry.id === prepared.id ? { ...entry, ...prepared } : entry));
  if (dbEnabled()) await upsertUserCharacterInDb(prepared);
  else await writeDb(auth.db);

  await upsertAndSettleGenerationRecord({
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
    provider: "seedance",
    kind: "main-video",
    params: payload,
    upstreamPayload: payload,
    remoteVideoUrl: task.videoUrl || "",
    localVideoUrl: "",
    error: "",
    source: "user-character",
    preDeductedCredits: cost,
    finalCredits: cost,
    billingStatus: cost > 0 ? "settled" : "free",
    billingSettledAt: new Date().toISOString(),
    createResponse: task,
    apiTokenId: auth.tokenRecord?.id || "",
    apiTokenName: auth.tokenRecord?.name || "",
    apiTokenType: auth.tokenRecord?.quotaType || "",
    apiTokenSource: auth.tokenSource || "",
  }, "create");

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
  if (dbEnabled()) await upsertUserCharacterInDb(record);
  else await writeDb(auth.db);

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
  try {
    assertSubtokenCanSpend(auth, cost);
  } catch (error) {
    return sendJson(res, error.statusCode || 402, error.payload || { ok: false, code: error.code || "SUBTOKEN_UNAVAILABLE", message: error.message });
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
  if (dbEnabled()) await upsertUserCharacterInDb(record);
  else await writeDb(auth.db);

  let prepared;
  try {
    prepared = await ensureCharacterReferenceForRecord({ ...record });
  } catch (error) {
    record.status = "reference_failed";
    record.error = error.message || "Failed to create upstream asset.";
    auth.db.userCharacters = auth.db.userCharacters.map((entry) => (entry.id === record.id ? record : entry));
    if (dbEnabled()) await upsertUserCharacterInDb(record);
    else await writeDb(auth.db);
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
  try {
    assertSubtokenCanSpend(auth, cost);
  } catch (error) {
    return sendJson(res, error.statusCode || 402, error.payload || { ok: false, code: error.code || "SUBTOKEN_UNAVAILABLE", message: error.message });
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
    if (dbEnabled()) await upsertUserCharacterInDb(record);
    else await writeDb(auth.db);
  }

  let prepared;
  try {
    prepared = await ensureCharacterReferenceForRecord({ ...record });
  } catch (error) {
    record.status = "reference_failed";
    record.error = error.message || "Failed to create upstream asset.";
    auth.db.userCharacters = auth.db.userCharacters.map((entry) => (entry.id === record.id ? record : entry));
    if (dbEnabled()) await upsertUserCharacterInDb(record);
    else await writeDb(auth.db);
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
  if (dbEnabled()) await upsertUserCharacterInDb(record);
  else await writeDb(auth.db);
  await softDeleteGenerationRecordsByCompanion(record.id, { userId: auth.user.id });
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
  if (dbEnabled()) await upsertUserCharacterInDb(record);
  else await writeDb(auth.db);

  await upsertAndSettleGenerationRecord({
    taskId: record.taskId,
    status: record.status,
    remoteVideoUrl: task.videoUrl || "",
    localVideoUrl,
    localVideoPath,
    error: task.error || downloadError || "",
    queryResponse: raw,
  }, "character-main-query");

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
  try {
    assertSubtokenCanSpend(auth, cost);
  } catch (error) {
    return sendJson(res, error.statusCode || 402, error.payload || { ok: false, code: error.code || "SUBTOKEN_UNAVAILABLE", message: error.message });
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

  await chargeUserWithSubtoken(auth, {
    cost,
    type: "user_character_scene_video",
    taskId: task.taskId,
    meta: { characterId, sceneId: sceneConfig.id, sceneEntryId: sceneEntry.id, duration: payload.duration },
  });

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
  if (dbEnabled()) await upsertUserCharacterInDb(record);
  else await writeDb(auth.db);

  await upsertAndSettleGenerationRecord({
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
    provider: "seedance",
    kind: "scene-video",
    params: payload,
    upstreamPayload: payload,
    remoteVideoUrl: task.videoUrl || "",
    localVideoUrl: "",
    error: "",
    source: "user-character-scene",
    preDeductedCredits: cost,
    finalCredits: cost,
    billingStatus: cost > 0 ? "settled" : "free",
    billingSettledAt: new Date().toISOString(),
    createResponse: task,
    apiTokenId: auth.tokenRecord?.id || "",
    apiTokenName: auth.tokenRecord?.name || "",
    apiTokenType: auth.tokenRecord?.quotaType || "",
    apiTokenSource: auth.tokenSource || "",
  }, "create");

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
  if (dbEnabled()) await upsertUserCharacterInDb(record);
  else await writeDb(auth.db);

  await upsertAndSettleGenerationRecord({
    taskId: task.taskId || taskId,
    status: task.status,
    remoteVideoUrl: task.videoUrl || "",
    localVideoUrl,
    localVideoPath,
    error: task.error || downloadError || "",
    queryResponse: raw,
  }, "character-scene-query");

  return sendJson(res, 200, { ok: true, character: publicUserCharacter(record), sceneVideo: sceneVideos[matchedVideoKey], task });
}

async function handleAdminGetConfig(req, res) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const config = await readAppConfig();
  return sendJson(res, 200, { ok: true, config });
}

const ADVANCED_PRICING_ROWS = [
  { key: "seedance-480p", provider: "seedance", providerLabel: "Seedance", resolution: "480p", rateKind: "output", unit: "output_second" },
  { key: "seedance-720p", provider: "seedance", providerLabel: "Seedance", resolution: "720p", rateKind: "output", unit: "output_second" },
  { key: "seedance-1080p", provider: "seedance", providerLabel: "Seedance", resolution: "1080p", rateKind: "output", unit: "output_second" },
  { key: "seedance-video-input-480p", provider: "seedance", providerLabel: "Seedance video input", resolution: "480p", rateKind: "video_input", unit: "input_second" },
  { key: "seedance-video-input-720p", provider: "seedance", providerLabel: "Seedance 视频输入", resolution: "720p", rateKind: "video_input", unit: "input_second" },
  { key: "seedance-video-input-1080p", provider: "seedance", providerLabel: "Seedance 视频输入", resolution: "1080p", rateKind: "video_input", unit: "input_second" },
  { key: "wan27-720p", provider: "wan27", providerLabel: "Wan2.7", resolution: "720p", rateKind: "output", unit: "output_second" },
  { key: "wan27-1080p", provider: "wan27", providerLabel: "Wan2.7", resolution: "1080p", rateKind: "output", unit: "output_second" },
];

function yuanPerSecondFromCredits(creditsPerSecond, creditsPerCny) {
  if (creditsPerSecond === null || creditsPerSecond === undefined) return null;
  return pricingNumber(Number(creditsPerSecond || 0) / Number(creditsPerCny || ADVANCED_CREDITS_PER_CNY), 0);
}

function advancedSaleCreditsPerSecond(pricing = DEFAULT_ADVANCED_PRICING, provider = "seedance", resolution = "720p", rateKind = "output") {
  const normalized = normalizeAdvancedPricing(pricing);
  const normalizedProvider = normalizeAdvancedProvider(provider);
  const table = normalizedProvider === "seedance" && rateKind === "video_input"
    ? normalized.seedanceVideoInputCreditsPerSecondByResolution
    : normalizedProvider === "wan27"
    ? normalized.wan27CreditsPerSecondByResolution
    : normalized.seedanceCreditsPerSecondByResolution;
  return pricingNumber(table[normalizeAdvancedResolution(resolution)], 0);
}

function advancedSaleImageCredits(pricing = DEFAULT_ADVANCED_PRICING) {
  const normalized = normalizeAdvancedPricing(pricing);
  return pricingNumber(Number(normalized.wan27ImagePro.saleCnyPerImage || 0) * Number(normalized.creditsPerCny || ADVANCED_CREDITS_PER_CNY), 0, 0, 6);
}

async function advancedPurchaseCreditsPerSecond(provider = "seedance", resolution = "720p", rateKind = "output") {
  const normalizedProvider = normalizeAdvancedProvider(provider);
  const publicResolution = normalizeAdvancedResolution(resolution);
  const duration = normalizedProvider === "wan27" ? 5 : 5;
  if (normalizedProvider === "seedance" && rateKind === "video_input") {
    return {
      creditsPerSecond: DEFAULT_ADVANCED_PRICING.seedanceVideoInputCreditsPerSecondByResolution[publicResolution],
      source: "configured_video_input_rate",
      message: "Seedance 2.0 input-with-video is billed separately from output duration; this is the configured public input-second add-on.",
    };
  }
  if (USE_GATEWAY_UPSTREAM && typeof gatewayAdvancedEstimate === "function") {
    try {
      const estimate = await gatewayAdvancedEstimate(normalizedProvider, {
        duration,
        resolution: publicResolution,
        ratio: "16:9",
      });
      return {
        creditsPerSecond: pricingNumber(Number(estimate.credits || 0) / Number(estimate.duration || duration), 0),
        source: "gateway_upstream",
      };
    } catch (error) {
      return {
        creditsPerSecond: null,
        source: "gateway_unavailable",
        message: error.message || String(error),
      };
    }
  }
  if (normalizedProvider === "seedance") {
    const tokenPricing = seedanceTokenPricing({ duration, resolution: publicResolution, ratio: "16:9" });
    return {
      creditsPerSecond: pricingNumber(tokenPricing.baseCredits / tokenPricing.duration, 0),
      source: "seedance_token_estimate",
    };
  }
  return {
    creditsPerSecond: DEFAULT_ADVANCED_PRICING.wan27CreditsPerSecondByResolution[publicResolution],
    source: "wan27_configured_upstream_rate",
  };
}

async function adminAdvancedPricingView(config = {}) {
  const pricing = normalizeAdvancedPricing(config.platform?.advancedPricing);
  const rows = await Promise.all(ADVANCED_PRICING_ROWS.map(async (row) => {
    const saleCreditsPerSecond = advancedSaleCreditsPerSecond(pricing, row.provider, row.resolution, row.rateKind);
    const purchase = await advancedPurchaseCreditsPerSecond(row.provider, row.resolution, row.rateKind);
    return {
      ...row,
      purchaseCreditsPerSecond: purchase.creditsPerSecond,
      purchaseYuanPerSecond: yuanPerSecondFromCredits(purchase.creditsPerSecond, pricing.creditsPerCny),
      purchaseSource: purchase.source,
      purchaseMessage: purchase.message || "",
      saleCreditsPerSecond,
      saleYuanPerSecond: yuanPerSecondFromCredits(saleCreditsPerSecond, pricing.creditsPerCny),
    };
  }));
  rows.push({
    provider: "wan27-image",
    providerLabel: "Wan2.7 Image Pro",
    resolution: "image",
    unit: "image",
    purchaseCreditsPerSecond: pricingNumber(pricing.wan27ImagePro.purchaseCnyPerImage * pricing.creditsPerCny, 0),
    purchaseYuanPerSecond: pricing.wan27ImagePro.purchaseCnyPerImage,
    purchaseSource: "aliyun_model_pricing",
    purchaseMessage: "Official unit price per generated image. Failed calls are not charged upstream.",
    saleCreditsPerSecond: advancedSaleImageCredits(pricing),
    saleYuanPerSecond: pricing.wan27ImagePro.saleCnyPerImage,
    model: pricing.wan27ImagePro.model,
  });
  return {
    unit: "credits",
    creditsPerCny: pricing.creditsPerCny,
    upstreamMode: USE_GATEWAY_UPSTREAM ? "gateway" : "direct",
    pricing,
    rows,
  };
}

function advancedPricingFromBody(body = {}, currentPricing = DEFAULT_ADVANCED_PRICING) {
  const base = normalizeAdvancedPricing(body.advancedPricing || body.pricing || currentPricing);
  if (!Array.isArray(body.rows)) return base;
  const next = normalizeAdvancedPricing(base);
  for (const row of body.rows) {
    const provider = normalizeAdvancedProvider(row.provider);
    const resolution = normalizeAdvancedResolution(row.resolution);
    const rateKind = String(row.rateKind || row.unit || "").toLowerCase() === "video_input" || String(row.key || "").includes("video-input")
      ? "video_input"
      : "output";
    if (String(row.provider || "").toLowerCase() === "wan27-image") {
      const rawSale = row.saleYuanPerSecond !== undefined
        ? Number(row.saleYuanPerSecond)
        : Number(row.saleCnyPerImage);
      if (Number.isFinite(rawSale) && rawSale >= 0) next.wan27ImagePro.saleCnyPerImage = pricingNumber(rawSale, next.wan27ImagePro.saleCnyPerImage, 0, 6);
      next.wan27ImagePro.userConfigured = true;
      continue;
    }
    const rawCredits = row.saleCreditsPerSecond !== undefined
      ? Number(row.saleCreditsPerSecond)
      : Number(row.saleYuanPerSecond) * next.creditsPerCny;
    if (!Number.isFinite(rawCredits) || rawCredits < 0) continue;
    const credits = pricingNumber(rawCredits, 0);
    if (provider === "wan27") {
      next.wan27CreditsPerSecondByResolution[resolution] = credits;
    } else if (rateKind === "video_input") {
      next.seedanceVideoInputCreditsPerSecondByResolution[resolution] = credits;
    } else {
      next.seedanceCreditsPerSecondByResolution[resolution] = credits;
    }
  }
  const hasSeedance480Row = body.rows.some((row) => String(row?.key || "") === "seedance-480p" || (normalizeAdvancedProvider(row?.provider) === "seedance" && normalizeAdvancedResolution(row?.resolution) === "480p" && String(row?.rateKind || row?.unit || "").toLowerCase() !== "video_input"));
  const hasSeedanceVideo480Row = body.rows.some((row) => String(row?.key || "") === "seedance-video-input-480p" || (normalizeAdvancedProvider(row?.provider) === "seedance" && normalizeAdvancedResolution(row?.resolution) === "480p" && (String(row?.rateKind || row?.unit || "").toLowerCase() === "video_input" || String(row?.key || "").includes("video-input"))));
  const seedance720 = next.seedanceCreditsPerSecondByResolution["720p"];
  const seedanceVideo720 = next.seedanceVideoInputCreditsPerSecondByResolution["720p"];
  if (!hasSeedance480Row) {
    next.seedanceCreditsPerSecondByResolution["480p"] = pricingNumber(seedance720 * 0.5, DEFAULT_ADVANCED_PRICING.seedanceCreditsPerSecondByResolution["480p"]);
  }
  if (!hasSeedanceVideo480Row) {
    next.seedanceVideoInputCreditsPerSecondByResolution["480p"] = pricingNumber(seedanceVideo720 * 0.5, DEFAULT_ADVANCED_PRICING.seedanceVideoInputCreditsPerSecondByResolution["480p"]);
  }
  return normalizeAdvancedPricing(next);
}

async function handleAdminGetPricing(req, res) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const config = await readAppConfig();
  return sendJson(res, 200, { ok: true, pricing: await adminAdvancedPricingView(config) });
}

async function handleAdminSavePricing(req, res) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const body = await readJson(req);
  const current = await readAppConfig();
  const nextPricing = advancedPricingFromBody(body, current.platform?.advancedPricing);
  const next = {
    ...current,
    platform: normalizePlatformConfig({
      ...(current.platform || {}),
      advancedPricing: nextPricing,
    }),
    updatedAt: new Date().toISOString(),
  };
  await writeAppConfig(next);
  return sendJson(res, 200, { ok: true, config: next, pricing: await adminAdvancedPricingView(next) });
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

  await upsertAndSettleGenerationRecord({
    taskId: task.taskId || taskId,
    status: task.status,
    remoteVideoUrl: task.videoUrl || "",
    localVideoUrl,
    localVideoPath,
    error: task.error || downloadError || "",
    queryResponse: raw,
  }, "admin-character-scene-query");

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
  await upsertAndSettleGenerationRecord({
    taskId: task.taskId || taskId,
    status: task.status,
    remoteVideoUrl: task.videoUrl || "",
    localVideoUrl,
    localVideoPath,
    error: task.error || downloadError || "",
  }, "admin-home-query");

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
      await upsertAndSettleGenerationRecord({
        taskId: task.taskId || sceneTaskId,
        status: task.status,
        remoteVideoUrl: task.videoUrl || "",
        localVideoUrl,
        localVideoPath,
        error: "",
        source: "admin-home-scene",
      }, "home-config-refresh");
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
    await upsertAndSettleGenerationRecord({
      taskId: task.taskId || taskId,
      status: task.status,
      remoteVideoUrl: task.videoUrl || "",
      localVideoUrl,
      localVideoPath,
      error: "",
    }, "home-config-refresh");
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
  const paymentProvider = order.paymentProvider || (order.network === "PayPal" ? "paypal" : "manual");
  return {
    id: order.id,
    userId: order.userId,
    username: user?.username || "",
    paymentProvider,
    baseAmount: order.baseAmount,
    creditAmount: order.creditAmount ?? creditsAmount(Math.round(Number(order.baseAmount || 0) * (
      paymentProvider === "paypal"
        ? (order.cnyCentsPerUnit || paypalCnyCentsPerUnit())
        : (order.cnyCentsPerUsdt || DEFAULT_USDT_CNY_CENTS)
    ))),
    cnyCentsPerUsdt: order.cnyCentsPerUsdt || "",
    cnyCentsPerUnit: order.cnyCentsPerUnit || "",
    suffix: order.suffix,
    payableAmount: order.payableAmount,
    payableAmountText: order.payableAmountText,
    asset: order.asset,
    currency: order.currency || order.asset || "",
    walletOptionId: order.walletOptionId || "",
    network: order.network,
    chain: order.chain || normalizeWalletChain(order.network || ""),
    address: order.address,
    qrUrl: order.qrUrl || "",
    transactionHash: order.transactionHash || order.txHash || "",
    confirmations: Number(order.confirmations || 0),
    blockNumber: order.blockNumber || "",
    fromAddress: order.fromAddress || "",
    matchedAt: order.matchedAt || "",
    matchedAmountText: order.matchedAmountText || "",
    scanSource: order.scanSource || "",
    matched: Boolean(order.matched || order.transactionHash || order.txHash),
    matchedTransactions: Array.isArray(order.matchedTransactions) ? order.matchedTransactions : [],
    paypalOrderId: order.paypalOrderId || "",
    paypalCaptureId: order.paypalCaptureId || "",
    paypalStatus: order.paypalStatus || "",
    paypalPayerEmail: order.paypalPayerEmail || "",
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
    user.credits = roundCredits(Math.max(0, Number(body.credits)), 6);
    changed = true;
  } else if (typeof body.creditsDelta === "number" && Number.isFinite(body.creditsDelta)) {
    user.credits = roundCredits(Math.max(0, Number(user.credits || 0) + Number(body.creditsDelta || 0)), 6);
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
  if (
    Object.prototype.hasOwnProperty.call(body, "pricingMultiplier") ||
    Object.prototype.hasOwnProperty.call(body, "priceMultiplier") ||
    Object.prototype.hasOwnProperty.call(body, "discount")
  ) {
    const rawMultiplier = body.pricingMultiplier ?? body.priceMultiplier ?? body.discount;
    const nextMultiplier = Number(rawMultiplier);
    if (!Number.isFinite(nextMultiplier) || nextMultiplier <= 0 || nextMultiplier > 100) {
      return sendJson(res, 400, { ok: false, message: "价格折扣比例必须大于 0，且不超过 100。" });
    }
    user.pricingMultiplier = normalizeUserPricingMultiplier(nextMultiplier);
    changed = true;
  }
  if (body.regenerateApiToken === true) {
    user.apiToken = makeUniqueApiToken(auth.db);
    changed = true;
  } else if (!user.apiToken) {
    ensureUserApiToken(user, auth.db);
    changed = true;
  }
  if (changed) {
    user.updatedAt = new Date().toISOString();
    if (dbEnabled()) await updateUserInDb(user);
    else await writeDb(auth.db);
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
  if (dbEnabled()) await updateUserInDb(user);
  else await writeDb(auth.db);
  await deleteUserSessionsInDb(userId, auth.session?.token || "");
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
  const assetsToDelete = (auth.db.userAssets || []).filter((a) => a.userId === userId);
  const charactersToDelete = (auth.db.userCharacters || []).filter((c) => c.userId === userId);
  user.deletedAt = user.deletedAt || nowIso;
  user.updatedAt = nowIso;
  auth.db.users = (auth.db.users || []).map((u) => (u.id === userId ? user : u));
  auth.db.sessions = (auth.db.sessions || []).filter((s) => s.userId !== userId);
  auth.db.walletOrders = (auth.db.walletOrders || []).filter((o) => o.userId !== userId);
  auth.db.userAssets = (auth.db.userAssets || []).map((a) => (a.userId === userId ? { ...a, deletedAt: a.deletedAt || nowIso, updatedAt: nowIso } : a));
  auth.db.userCharacters = (auth.db.userCharacters || []).map((c) => (c.userId === userId ? { ...c, deletedAt: c.deletedAt || nowIso, updatedAt: nowIso } : c));
  if (dbEnabled()) await updateUserInDb(user);
  else await writeDb(auth.db);
  if (dbEnabled()) {
    await Promise.all([
      ...assetsToDelete.map((asset) => upsertUserAssetInDb({ ...asset, deletedAt: asset.deletedAt || nowIso, updatedAt: nowIso })),
      ...charactersToDelete.map((character) => upsertUserCharacterInDb({ ...character, deletedAt: character.deletedAt || nowIso, updatedAt: nowIso })),
    ]);
  }
  await deleteUserSessionsInDb(userId);
  await deleteUserWalletOrdersInDb(userId);
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
  if (dbEnabled()) await upsertUserCharacterInDb(record);
  else await writeDb(auth.db);
  await softDeleteGenerationRecordsByCompanion(record.id);
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
    await softDeleteGenerationRecordsByCompanion(itemId);
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
      const config = await readAppConfig();
      await settleWalletOrderPayment(auth.db, order, config, { note: "Marked paid by admin." });
    } else {
      order.status = body.status;
      order.updatedAt = new Date().toISOString();
    }
  }
  if (typeof body.note === "string") order.note = body.note.slice(0, 200);
  await updateWalletOrderInDb(order);
  if (!dbEnabled()) await writeDb(auth.db);
  return sendJson(res, 200, { ok: true, order });
}

async function handleAdminScanWalletOrders(req, res) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const result = await scanAndSettleWalletOrders({ force: true, limit: 200 });
  return sendJson(res, 200, result);
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
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") || 160)));
  const query = String(url.searchParams.get("q") || "").trim();
  const provider = String(url.searchParams.get("provider") || "").trim();
  const status = String(url.searchParams.get("status") || "").trim().toLowerCase();
  const kind = String(url.searchParams.get("kind") || "").trim();
  const userMap = new Map((auth.db.users || []).map((user) => [user.id, user]));
  let records = await readGenerationRecords();
  const refreshRequested = generationListRefreshRequested(url);
  const refundable = records.filter((record) => needsApizFailureRefund(record) || needsSeedanceFailureRefund(record)).slice(0, 100);
  const statusRefreshable = refreshRequested
    ? records
      .filter((record) => !needsApizFailureRefund(record) && !needsSeedanceFailureRefund(record) && shouldRefreshGenerationRecordFromList(record))
      .filter((record) => !query || generationRecordMatchesQuery(record, query))
      .slice(0, 12)
    : [];
  const refreshable = [...refundable, ...statusRefreshable];
  if (refreshable.length) {
    const refreshedByTask = new Map(
      (await Promise.all(refreshable.map(refreshGenerationRecordStatus))).map((record) => [record.taskId, record]),
    );
    records = records.map((record) => refreshedByTask.get(record.taskId) || record);
  }
  const enriched = records.map((record) => adminGenerationRecordView(record, userMap));
  const filtered = enriched.filter((record) => {
    if (provider && record.provider !== provider) return false;
    if (kind && record.kind !== kind) return false;
    if (status && String(record.status || "").toLowerCase() !== status) return false;
    return generationRecordMatchesQuery(record, query);
  });
  return sendJson(res, 200, {
    ok: true,
    records: filtered.slice(0, limit),
    total: records.length,
    filtered: filtered.length,
  });
}

async function handleListGenerationRecords(req, res, url) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const { page, limit, offset } = pagingFromUrl(url, { defaultLimit: 8, maxLimit: 50 });
  const allOwnRecords = await listGenerationRecordsForUser(auth.user.id, Math.max(500, offset + limit));
  const ownRecords = allOwnRecords.slice(offset, offset + limit);

  const refreshRequested = generationListRefreshRequested(url);
  const refundable = ownRecords.filter((record) => needsApizFailureRefund(record) || needsSeedanceFailureRefund(record)).slice(0, 50);
  const statusRefreshable = refreshRequested
    ? ownRecords
      .filter((record) => !needsApizFailureRefund(record) && !needsSeedanceFailureRefund(record) && shouldRefreshGenerationRecordFromList(record))
      .slice(0, 8)
    : [];
  const refreshable = [...refundable, ...statusRefreshable];
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
    records: ownRecords.map((record) => publicGenerationRecord(record, generationRecordResponseOptionsForAuth(auth))),
    page,
    limit,
    total: allOwnRecords.length,
    totalPages: Math.max(1, Math.ceil(allOwnRecords.length / limit)),
    user: userView((await readDb()).users.find((user) => user.id === auth.user.id) || auth.user),
  });
}

async function handleGetGenerationRecord(req, res, taskId) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const record = await getGenerationRecord(taskId);
  if (!record || record.userId !== auth.user.id || !isUserVisibleGenerationRecord(record)) {
    return sendJson(res, 404, { ok: false, message: "Generation record not found." });
  }

  let nextRecord = record;
  if (needsApizFailureRefund(record)) {
    nextRecord = await settleApizGenerationRecord(record, { status: record.status || "failed", error: record.error || "" }, "detail");
  } else if (needsSeedanceFailureRefund(record)) {
    nextRecord = await settleSeedanceGenerationRecord(record, "detail");
  } else if (record.provider === "apiz" && (APIZ_API_KEY || record.upstreamSource === "gateway") && shouldRefreshGenerationRecord(record)) {
    try {
      nextRecord = await refreshApizGenerationRecord(record);
    } catch (error) {
      console.warn("[apiz-generation-record-refresh-failed]", taskId, error.message || error);
    }
  } else if (record.upstreamSource === "gateway" && shouldRefreshGenerationRecord(record)) {
    try {
      nextRecord = await refreshGenerationRecordStatus(record);
    } catch (error) {
      console.warn("[gateway-generation-record-detail-refresh-failed]", taskId, error.message || error);
    }
  } else if (record.provider === "aliyun-wan27" && ALIYUN_DASHSCOPE_API_KEY && shouldRefreshGenerationRecord(record)) {
    try {
      nextRecord = await refreshWan27GenerationRecord(record, { download: true, reason: "detail" });
    } catch (error) {
      console.warn("[wan27-generation-record-detail-refresh-failed]", taskId, error.message || error);
    }
  } else if (ARK_API_KEY && shouldRefreshGenerationRecord(record) && !String(taskId).startsWith("demo-")) {
    try {
      const queryTaskId = record.upstreamTaskId || taskId;
      const raw = await arkRequest("GET", `/contents/generations/tasks/${encodeURIComponent(queryTaskId)}`);
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
      nextRecord = await upsertAndSettleGenerationRecord({
        taskId,
        upstreamTaskId: task.taskId || queryTaskId,
        status: task.status || record.status || "unknown",
        remoteVideoUrl,
        localVideoUrl,
        localVideoPath,
        error: task.error || downloadError || "",
        queryResponse: raw,
      }, "detail");
    } catch (error) {
      console.warn("[generation-record-detail-refresh-failed]", taskId, error.message || error);
    }
  }

  return sendJson(res, 200, {
    ok: true,
    record: publicGenerationRecord(nextRecord, generationRecordResponseOptionsForAuth(auth)),
    user: userView((await readDb()).users.find((user) => user.id === auth.user.id) || auth.user),
  });
}

async function handleDeleteGenerationRecord(req, res, taskId) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const record = await softDeleteGenerationRecordForUser(taskId, auth.user.id);
  if (!record) {
    return sendJson(res, 404, { ok: false, message: "Generation record not found." });
  }
  return sendJson(res, 200, { ok: true, record: publicGenerationRecord(record, generationRecordResponseOptionsForAuth(auth)) });
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
          if (dbEnabled()) await upsertUserCharacterInDb(prepared);
          else await writeDb(auth.db);
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
      if (dbEnabled()) await upsertUserCharacterInDb(preparedPartner);
      else await writeDb(auth.db);
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

  await chargeUserWithSubtoken(auth, {
    cost,
    type: "user_scene_video",
    taskId: randomId("scene"),
    meta: { sceneId: body.sceneId || "", sceneEntryId: sceneEntry.id, companionId: resolvedCompanionId || body.companionId || "" },
  });
  if (!dbEnabled()) await writeDb(auth.db);

  console.log("[seedance-submit-payload]", JSON.stringify(payload, null, 2));
  let raw;
  try {
    raw = await arkRequest("POST", "/contents/generations/tasks", payload);
  } catch (error) {
    await changeUserCredits(auth.db, auth.user.id, cost, "user_scene_video_submit_refund", {
      sceneId: body.sceneId || "",
      sceneEntryId: sceneEntry.id,
      reason: error.message || "submit failed",
    });
    await recordSubtokenAdjustment(auth, {
      taskId: randomId("scene-refund"),
      type: "user_scene_video_submit_refund",
      amount: -cost,
      meta: { sceneId: body.sceneId || "", sceneEntryId: sceneEntry.id, reason: error.message || "submit failed" },
    });
    if (!dbEnabled()) await writeDb(auth.db);
    throw error;
  }
  const task = normalizeTask(raw);
  await upsertAndSettleGenerationRecord({
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
    provider: "seedance",
    kind: "scene-video",
    params: payload,
    upstreamPayload: payload,
    remoteVideoUrl: task.videoUrl || "",
    localVideoUrl: "",
    error: "",
    source: "user-scene-video",
    preDeductedCredits: cost,
    finalCredits: cost,
    billingStatus: cost > 0 ? "settled" : "free",
    billingSettledAt: new Date().toISOString(),
    createResponse: task,
    apiTokenId: auth.tokenRecord?.id || "",
    apiTokenName: auth.tokenRecord?.name || "",
    apiTokenType: auth.tokenRecord?.quotaType || "",
    apiTokenSource: auth.tokenSource || "",
  }, "create");

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

  await upsertAndSettleGenerationRecord({
    taskId: task.taskId || taskId,
    status: task.status,
    remoteVideoUrl: task.videoUrl || "",
    localVideoUrl,
    localVideoPath,
    error: task.error || downloadError || "",
    queryResponse: raw,
  }, "scene-query");

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

    if (contentType.startsWith("video/") && sendInternalAsset(res, filePath, contentType, stat)) return;
    if (filePath.startsWith(path.normalize(GENERATED_POSTER_DIR)) && sendInternalAsset(res, filePath, contentType, stat)) return;
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
      return pipeFileStream(res, filePath, { start: chunkStart, end: chunkEnd });
    }

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
    return pipeFileStream(res, filePath);
  } catch (error) {
    if (error.code === "ENOENT") return sendText(res, 404, "Not Found");
    throw error;
  }
}

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    if (isMainlandChinaRequest(req)) {
      if (requestHasMainlandBypass(req, url)) {
        setMainlandBypassCookie(res);
        if (shouldCleanBypassUrl(req, url)) {
          return redirectWithoutBypassParam(res, url);
        }
      } else {
        return sendMainlandBlocked(req, res, url);
      }
    } else if (url.searchParams.has(MAINLAND_BYPASS_QUERY_PARAM) && requestHasMainlandBypass(req, url)) {
      setMainlandBypassCookie(res);
      if (shouldCleanBypassUrl(req, url)) {
        return redirectWithoutBypassParam(res, url);
      }
    }

    if (req.method === "GET" && url.pathname === "/api/health") {
      return sendJson(res, 200, {
        ok: true,
        upstreamMode: USE_GATEWAY_UPSTREAM ? "gateway" : "direct",
        gatewayConfigured: USE_GATEWAY_UPSTREAM ? Boolean(UPSTREAM_API_TOKEN) : false,
        arkConfigured: USE_GATEWAY_UPSTREAM ? false : Boolean(ARK_API_KEY),
        aliyunConfigured: USE_GATEWAY_UPSTREAM ? false : Boolean(ALIYUN_DASHSCOPE_API_KEY),
        generationConfigured: USE_GATEWAY_UPSTREAM ? Boolean(UPSTREAM_API_TOKEN) : Boolean(APIZ_API_KEY),
        baseUrl: publicOriginFromRequest(req),
        models: { fast: MODEL_FAST, quality: MODEL_QUALITY, wan27: ALIYUN_WAN27_MODEL },
      });
    }

    if (req.method === "GET" && url.pathname === "/api/config/public") {
      let config = await readAppConfig();
      config = await ensureSceneEntriesPersisted(config);
      config = await refreshCompletedHomeVideoItems(config);
      return sendJson(res, 200, { ok: true, config: publicConfig(config, publicOriginFromRequest(req)) });
    }

    const volcengineTaskMatch = url.pathname.match(/^\/(?:(?:api\/v3|v3)\/)?contents\/generations\/tasks\/([^/]+)\/?$/);
    if (req.method === "POST" && /^\/(?:(?:api\/v3|v3)\/)?contents\/generations\/tasks\/?$/.test(url.pathname)) {
      return await handleVolcengineCreateGenerationTask(req, res);
    }
    if (req.method === "GET" && volcengineTaskMatch) {
      return await handleVolcengineGetGenerationTask(req, res, decodeURIComponent(volcengineTaskMatch[1]));
    }

    if (req.method === "GET" && url.pathname === "/api/models") {
      return await handleModelsJson(req, res);
    }

    if ((req.method === "GET" || req.method === "POST") && url.pathname === "/api/advanced/estimate") {
      return await handleAdvancedEstimate(req, res);
    }

    if (req.method === "GET" && (url.pathname === "/docs/models.md" || url.pathname === "/models.md")) {
      return await handleModelsMarkdown(req, res);
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

    if (req.method === "GET" && url.pathname === "/api/access/subtokens") {
      return await handleListApiSubtokens(req, res);
    }

    if (req.method === "POST" && url.pathname === "/api/access/subtokens") {
      return await handleCreateApiSubtoken(req, res);
    }

    const accessSubtokenMatch = url.pathname.match(/^\/api\/access\/subtokens\/([^/]+)$/);
    if (req.method === "PATCH" && accessSubtokenMatch) {
      return await handleUpdateApiSubtoken(req, res, decodeURIComponent(accessSubtokenMatch[1]));
    }
    if (req.method === "DELETE" && accessSubtokenMatch) {
      return await handleRevokeApiSubtoken(req, res, decodeURIComponent(accessSubtokenMatch[1]));
    }

    if (req.method === "GET" && url.pathname === "/api/pay/paypal/config") {
      return await handlePayPalConfig(req, res);
    }

    if (req.method === "POST" && url.pathname === "/api/pay/paypal/orders") {
      return await handleCreatePayPalOrder(req, res);
    }

    const paypalCaptureMatch = url.pathname.match(/^\/api\/pay\/paypal\/orders\/([^/]+)\/capture$/);
    if (req.method === "POST" && paypalCaptureMatch) {
      return await handleCapturePayPalOrder(req, res, decodeURIComponent(paypalCaptureMatch[1]));
    }

    if (req.method === "POST" && url.pathname === "/api/pay/paypal/webhook") {
      return await handlePayPalWebhook(req, res);
    }

    if (req.method === "POST" && url.pathname === "/api/pay/orders") {
      return await handleCreatePaymentOrder(req, res);
    }

    if (req.method === "GET" && url.pathname === "/api/pay/orders") {
      return await handleListPaymentOrders(req, res);
    }

    if (req.method === "GET" && url.pathname === "/api/billing/topups") {
      return await handleListTopupRecords(req, res, url);
    }

    if (req.method === "GET" && url.pathname === "/api/billing/spending") {
      return await handleListSpendingRecords(req, res, url);
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

    if (req.method === "POST" && url.pathname === "/api/seedance/characters/upload") {
      return await handleUploadSeedanceCharacter(req, res);
    }

    if (req.method === "POST" && url.pathname === "/api/characters/generate") {
      return await handleGenerateUserCharacterImage(req, res);
    }

    const characterModifyMatch = url.pathname.match(/^\/api\/characters\/([^/]+)\/modify$/);
    if (req.method === "POST" && characterModifyMatch) {
      return await handleModifySystemCharacterImage(req, res, decodeURIComponent(characterModifyMatch[1]));
    }

    const addGenerationRecordAssetMatch = url.pathname.match(/^\/api\/generation-records\/([^/]+)\/add-asset$/);
    if (req.method === "POST" && addGenerationRecordAssetMatch) {
      return await handleAddGenerationRecordToAssets(req, res, decodeURIComponent(addGenerationRecordAssetMatch[1]));
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
    if (req.method === "POST" && url.pathname === "/api/admin/advanced/generate") {
      return await handleAdminAdvancedGenerate(req, res);
    }

    if ((req.method === "GET" || req.method === "POST") && url.pathname === "/api/platform/estimates") {
      return await handlePlatformEstimates(req, res, url);
    }

    if (req.method === "GET" && url.pathname === "/api/user-assets") {
      return await handleListUserAssets(req, res, url);
    }

    if (req.method === "POST" && url.pathname === "/api/wan27/image-edit") {
      return await handleWan27ImageEdit(req, res);
    }

    const userAssetModifyMatch = url.pathname.match(/^\/api\/user-assets\/([^/]+)\/modify$/);
    if (req.method === "POST" && userAssetModifyMatch) {
      return await handleModifyUserAssetImage(req, res, userAssetModifyMatch[1]);
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

    if (req.method === "GET" && url.pathname === "/api/admin/pricing") {
      return await handleAdminGetPricing(req, res);
    }

    if (req.method === "PUT" && url.pathname === "/api/admin/pricing") {
      return await handleAdminSavePricing(req, res);
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

    if (req.method === "POST" && url.pathname === "/api/admin/platform-template-media") {
      return await handleAdminIngestPlatformTemplateMedia(req, res);
    }

    if (req.method === "POST" && url.pathname === "/api/admin/advanced-case-media") {
      return await handleAdminIngestAdvancedCaseMedia(req, res);
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

    if (req.method === "POST" && url.pathname === "/api/admin/wallet-orders/scan") {
      return await handleAdminScanWalletOrders(req, res);
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
    const adminPromotePlatformMatch = url.pathname.match(/^\/api\/admin\/generation-records\/([^/]+)\/promote-platform$/);
    if (adminPromotePlatformMatch && req.method === "POST") {
      return await handleAdminPromoteRecordToPlatform(req, res, decodeURIComponent(adminPromotePlatformMatch[1]));
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
    if (req.method === "DELETE" && generationRecordMatch) {
      return await handleDeleteGenerationRecord(req, res, decodeURIComponent(generationRecordMatch[1]));
    }
    const regenerateGenerationRecordMatch = url.pathname.match(/^\/api\/generation-records\/([^/]+)\/regenerate$/);
    if (req.method === "POST" && regenerateGenerationRecordMatch) {
      return await handleRegenerateGenerationRecord(req, res, decodeURIComponent(regenerateGenerationRecordMatch[1]));
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
  requestContext.run({ auth: null, appStateWriteLocked: false }, () => {
    Promise.resolve(handleRequest(req, res)).catch((error) => {
      console.error("[request-failed]", error.message || error);
      if (!res.headersSent) {
        sendJson(res, error.statusCode || 500, {
          ok: false,
          code: error.code || "SERVER_ERROR",
          message: error.message || "Server error",
        });
      } else {
        res.destroy(error);
      }
    });
  });
});
server.keepAliveTimeout = Number(process.env.HTTP_KEEP_ALIVE_TIMEOUT_MS || 65000);
server.headersTimeout = Number(process.env.HTTP_HEADERS_TIMEOUT_MS || 70000);
server.requestTimeout = Number(process.env.HTTP_REQUEST_TIMEOUT_MS || 180000);
server.maxRequestsPerSocket = Number(process.env.HTTP_MAX_REQUESTS_PER_SOCKET || 1000);
server.maxConnections = Number(process.env.HTTP_MAX_CONNECTIONS || 2000);

async function bootstrap() {
  if (dbEnabled()) {
    await migrateFileDataToDb({
      defaultDb: DEFAULT_DB,
      defaultConfig: DEFAULT_CONFIG,
    });
    const generationRecordMigration = await migrateGenerationRecordsKvToTable();
    if (generationRecordMigration?.migrated) {
      console.log(`Generation records migrated to table: ${generationRecordMigration.migrated}`);
    }
  }
  const apiTokensMigrated = await ensureAllUsersApiTokens();
  if (apiTokensMigrated) {
    console.log("User API tokens migrated: yes");
  }
  startWalletScanScheduler();

  server.listen(PORT, "127.0.0.1", () => {
    console.log(`After Dark demo server: http://127.0.0.1:${PORT}/`);
    console.log(`Upstream mode: ${USE_GATEWAY_UPSTREAM ? "gateway" : "direct"}`);
    console.log(`Ark configured: ${ARK_API_KEY ? "yes" : "no"}`);
    console.log(`Database configured: ${DATABASE_URL ? "yes" : "no"}`);
  });
}

bootstrap().catch((error) => {
  console.error("[bootstrap] failed", error);
  process.exit(1);
});
