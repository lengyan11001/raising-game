const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"],
  [".xml", "application/xml; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".svg", "image/svg+xml"],
  [".mp4", "video/mp4"],
  [".webm", "video/webm"],
  [".mov", "video/quicktime"],
  [".m4v", "video/x-m4v"],
  [".wav", "audio/wav"],
  [".mp3", "audio/mpeg"],
  [".m4a", "audio/mp4"],
  [".aac", "audio/aac"],
  [".ogg", "audio/ogg"],
  [".apk", "application/vnd.android.package-archive"],
  [".mobileconfig", "application/x-apple-aspen-config"],
]);

const DEFAULT_DB = {
  users: [],
  sessions: [],
  walletOrders: [],
  referralWithdrawals: [],
  creditLedger: [],
  userAssets: [],
  userCharacters: [],
  userUnlocks: [],
  apiSubtokens: [],
  supportMessages: [],
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

const DEFAULT_CONFIG = {
  defaultCompanionId: "aria",
  undressPrompts: { ...DEFAULT_UNDRESS_PROMPTS },
  prices: {
    meet: 12,
    photo: 18,
    dateVideo: 25,
    customCharacter: 30,
    unlockVideo: CHARACTER_UNLOCK_COST_CREDITS,
  },
  wallet: {
    asset: "USDT",
    network: "TRC20",
    address: "TBaZJZrLdqwb4bSDQnp2LzRaBo3RkhJ6rA",
    qrUrl: "/assets/wallet/usdt-trc20-qr.png",
    options: [
      {
        id: "bnb",
        label: "BNB Chain",
        network: "BNB Chain",
        asset: "USDT",
        address: "0xe5D6Dc1691458d0F18e1503e58C4D3398B8901f5",
        qrUrl: "/assets/wallet/old-usdt-bnb.png",
      },
      {
        id: "solana",
        label: "Solana",
        network: "Solana",
        asset: "USDT",
        address: "CE1vLWK1u6QDgzx1LH5J5JW8HWwo5sGQKse5SzXcNoxd",
        qrUrl: "/assets/wallet/old-usdt-solana.png",
      },
      {
        id: "base",
        label: "Base",
        network: "Base",
        asset: "USDT",
        address: "0xe5D6Dc1691458d0F18e1503e58C4D3398B8901f5",
        qrUrl: "/assets/wallet/old-usdt-base.png",
      },
      {
        id: "ethereum",
        label: "Ethereum",
        network: "Ethereum",
        asset: "USDT",
        address: "0xe5D6Dc1691458d0F18e1503e58C4D3398B8901f5",
        qrUrl: "/assets/wallet/old-usdt-ethereum.png",
      },
      {
        id: "tron",
        label: "Tron",
        network: "TRC20 / Tron",
        asset: "USDT",
        address: "TBaZJZrLdqwb4bSDQnp2LzRaBo3RkhJ6rA",
        qrUrl: "/assets/wallet/usdt-trc20-qr.png",
        explorerUrl: "https://tronscan.org/#/address/TBaZJZrLdqwb4bSDQnp2LzRaBo3RkhJ6rA",
      },
    ],
    suffixDigits: 6,
    creditsPerUsd: DEFAULT_CREDITS_PER_USD,
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
      "POST /api/v3/contents/generations/tasks\nAuthorization: Bearer <user-token>\nContent-Type: application/json\n\n{\"model\":\"dreamina-seedance-2-0-260128\",\"content\":[{\"type\":\"text\",\"text\":\"Use Image 1 as the character reference and Video 1 as motion reference. Generate a cinematic 5 second shot.\"},{\"type\":\"image_url\",\"image_url\":{\"url\":\"https://example.com/image1.png\"},\"role\":\"reference_image\"},{\"type\":\"video_url\",\"video_url\":{\"url\":\"https://example.com/video1.mp4\"},\"role\":\"reference_video\"}],\"ratio\":\"9:16\",\"resolution\":\"720p\",\"duration\":5,\"generate_audio\":true,\"watermark\":false}\n\nGET /api/v3/contents/generations/tasks/<taskId>",
    advancedPricing: DEFAULT_ADVANCED_PRICING,
    analytics: {
      googleMeasurementId: "",
    },
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
  playfluxTemplates: [],
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
    textModel: SEEDREAM5_PRO_ENDPOINT_ID,
    editModel: SEEDREAM5_PRO_ENDPOINT_ID,
    imageSize: "2K",
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

function isMainlandAllowHostRequest(req) {
  return MAINLAND_ALLOW_HOSTS.has(requestHostname(req));
}

function isMainlandChinaRequest(req) {
  if (!BLOCK_MAINLAND_CHINA || requestCountryCode(req) !== "CN") return false;
  return !isMainlandAllowHostRequest(req);
}

function isMainlandAdminAllowedRequest(req, url) {
  return isCmsHostRequest(req);
}

function publicAliyunModelHidden(value = "") {
  if (PUBLIC_ALIYUN_MODEL_EXPOSURE_ENABLED) return false;
  const raw = String(value || "").trim().toLowerCase();
  const normalized = normalizeAdvancedProvider(value);
  const wan30Value = normalized === "wan30" || raw.includes("wan3.0") || raw.includes("wan30");
  const wan27Value = normalized === "wan27"
    || normalized === "wan27-image"
    || normalized === "wan27-image-edit"
    || raw.includes("wan2.7")
    || raw.includes("wan27")
    || raw.includes("wan-animate")
    || raw.includes("wananimate");
  const happyhorseValue = normalized === "happyhorse" || raw.includes("happyhorse");
  const qwenImage3Value = normalized === "qwen-image3"
    || raw.includes("qwen-image-3")
    || raw.includes("qwenimage3");
  if (PUBLIC_WAN30_MODEL_EXPOSURE_ENABLED && wan30Value) return false;
  if (PUBLIC_WAN27_MODEL_EXPOSURE_ENABLED && wan27Value) return false;
  if (PUBLIC_HAPPYHORSE_MODEL_EXPOSURE_ENABLED && happyhorseValue) return false;
  if (PUBLIC_QWEN_IMAGE3_EXPOSURE_ENABLED && qwenImage3Value) return false;
  return ["wan30", "wan27", "happyhorse", "qwen-image3", "wan27-image-edit"].includes(normalized)
    || raw.includes("wan-animate")
    || raw.includes("wananimate")
    || raw.includes("wan2.7")
    || raw.includes("wan27")
    || raw.includes("happyhorse")
    || raw.includes("qwen-image-3");
}

function publicAliyunModelBlockedForRequest(req, value = "") {
  if (!publicAliyunModelHidden(value)) return false;
  const url = new URL(req.url || "/", "http://localhost");
  if (isCmsHostRequest(req) || url.pathname.startsWith("/api/admin/")) return false;
  const tenant = requestTenantDescriptor(req);
  const configuredToolProvider = normalizeAdvancedProvider(tenant.videoProvider || "");
  return !(tenant.toolId === "video" && configuredToolProvider === normalizeAdvancedProvider(value));
}

function sendPublicAliyunModelUnavailable(res) {
  return sendJson(res, 404, {
    ok: false,
    code: "MODEL_TEMPORARILY_UNAVAILABLE",
    message: "This model is temporarily unavailable.",
  });
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

function isCmsHostRequest(req) {
  return requestHostname(req).startsWith("cms.");
}

function paymentCheckoutHostname() {
  return normalizeHostname(PAYPAL_CHECKOUT_BASE_URL);
}

function stripeCheckoutHostname() {
  return normalizeHostname(STRIPE_CHECKOUT_BASE_URL);
}

function stripeChatCheckoutHostname() {
  return normalizeHostname(STRIPE_CHAT_CHECKOUT_BASE_URL);
}

function stripeCheckoutBaseUrlForRequest(req = null) {
  return req && requestTenantDescriptor(req).toolId === "chat"
    ? STRIPE_CHAT_CHECKOUT_BASE_URL
    : STRIPE_CHECKOUT_BASE_URL;
}

function stripeCashierHostForOrder(order = {}) {
  const explicit = normalizeHostname(order.cashierHost || order.cashierUrl || "");
  if (explicit) return explicit;
  if (String(order.stripeAccountId || "") === STRIPE_PAY5_ACCOUNT_ID && STRIPE_PAY5_ACCOUNT_ID) return normalizeHostname(STRIPE_CHAT_CHECKOUT_BASE_URL);
  if (String(order.paymentProvider || "").toLowerCase() === "stripe") return normalizeHostname(STRIPE_CHECKOUT_BASE_URL);
  try { return normalizeHostname(new URL(order.sourceOrigin || "").hostname); } catch { return ""; }
}

function airwallexCheckoutHostname() {
  return normalizeHostname(AIRWALLEX_CHECKOUT_BASE_URL);
}

function isPaymentHostRequest(req) {
  const host = requestHostname(req);
  return Boolean(host && (PAYMENT_HOSTS.has(host) || host === paymentCheckoutHostname() || host === stripeCheckoutHostname() || host === stripeChatCheckoutHostname() || host === airwallexCheckoutHostname()));
}

function sendPayPalCheckoutHostRequired(res) {
  return sendJson(res, 409, {
    ok: false,
    code: "PAYPAL_CHECKOUT_REQUIRED",
    message: "PayPal payments must be started from the secure checkout page.",
    checkoutBaseUrl: PAYPAL_CHECKOUT_BASE_URL,
  });
}

function configuredPublicBaseUrl() {
  return (PUBLIC_BASE_URL || "").replace(/\/+$/, "");
}

const LOCAL_MEDIA_SIGNATURE_TTL_MS = 60 * 60 * 1000;

function localMediaSigningSecret() {
  const dedicated = String(process.env.MEDIA_URL_SIGNING_SECRET || "").trim();
  if (dedicated) return dedicated;
  // Session cookies are opaque random tokens, so an existing deployment's
  // secret is an independent media key without changing login behaviour.
  return String(process.env.SESSION_SECRET || "").trim();
}

const PROTECTED_LOCAL_MEDIA_PREFIXES = Object.freeze([
  "/assets/user-uploads/",
  "/assets/user-characters/",
  "/assets/generated/characters/apiz/",
  "/assets/generated/panoramas/",
]);

function protectedLocalMediaPrefix(pathname = "") {
  const value = String(pathname || "");
  return PROTECTED_LOCAL_MEDIA_PREFIXES.find((prefix) => value.startsWith(prefix)) || "";
}

function isProtectedLocalMediaPath(value = "") {
  return Boolean(protectedLocalMediaPrefix(String(value || "")));
}

function normalizedProtectedLocalMediaPath(value = "") {
  const text = String(value || "").trim();
  if (!text || text.includes("\0") || text.includes("\\")) return "";
  let pathname = "";
  try {
    pathname = isPublicHttpUrl(text) ? new URL(text).pathname : text.split(/[?#]/, 1)[0];
  } catch {
    return "";
  }
  if (!protectedLocalMediaPrefix(pathname)) return "";
  if (/%2e|%2f|%5c/i.test(pathname)) return "";
  try {
    pathname = decodeURIComponent(pathname);
  } catch {
    return "";
  }
  if (!protectedLocalMediaPrefix(pathname) || pathname.includes("\\")) return "";
  const normalized = path.posix.normalize(pathname);
  if (normalized !== pathname || normalized.includes("//")) return "";
  if (normalized.split("/").some((segment) => segment === "." || segment === ".." || segment.startsWith("."))) return "";
  return normalized;
}

function normalizedUserUploadPath(value = "") {
  const pathname = normalizedProtectedLocalMediaPath(value);
  return pathname.startsWith("/assets/user-uploads/") ? pathname : "";
}

function configuredAssetHostname(value = "") {
  try {
    return value ? new URL(String(value)).hostname.toLowerCase() : "";
  } catch {
    return "";
  }
}

function isManagedAssetHostname(hostname = "") {
  const host = String(hostname || "").toLowerCase();
  if (!host) return false;
  const configuredHosts = [
    configuredAssetHostname(configuredPublicBaseUrl()),
    configuredAssetHostname(R2.publicDomain),
    configuredAssetHostname(OSS.cdnBaseUrl),
    configuredAssetHostname(OSS.endpoint),
  ].filter(Boolean);
  return host === "123vips.com"
    || host === "www.123vips.com"
    || host === "media.123vips.com"
    || configuredHosts.includes(host);
}

function isLocalApplicationAssetHostname(hostname = "") {
  const host = String(hostname || "").toLowerCase();
  if (!host) return false;
  const configuredHost = configuredAssetHostname(configuredPublicBaseUrl());
  return host === "123vips.com" || host === "www.123vips.com" || (configuredHost && host === configuredHost);
}

function signLocalMediaPath(pathname = "", expiresAt = Date.now() + LOCAL_MEDIA_SIGNATURE_TTL_MS) {
  const normalizedPath = normalizedProtectedLocalMediaPath(pathname);
  const secret = localMediaSigningSecret();
  if (!normalizedPath || !secret) return "";
  const expiry = Math.max(Date.now() + 60 * 1000, Number(expiresAt) || 0);
  const signature = crypto.createHmac("sha256", secret)
    .update(`${normalizedPath}\n${expiry}`)
    .digest("base64url");
  return { expires: expiry, signature };
}

function signLocalUserUploadPath(pathname = "", expiresAt = Date.now() + LOCAL_MEDIA_SIGNATURE_TTL_MS) {
  return signLocalMediaPath(pathname, expiresAt);
}

function isLocalProtectedMediaAssetUrl(value = "") {
  const text = String(value || "").trim();
  const normalizedPath = normalizedProtectedLocalMediaPath(text);
  if (!normalizedPath) return false;
  if (!isPublicHttpUrl(text)) return true;
  try {
    return isLocalApplicationAssetHostname(new URL(text).hostname);
  } catch {
    return false;
  }
}

function isLocalUserUploadAssetUrl(value = "") {
  return isLocalProtectedMediaAssetUrl(value)
    && normalizedProtectedLocalMediaPath(value).startsWith("/assets/user-uploads/");
}

function localMediaDeliveryUrl(value = "", { absolute = false } = {}) {
  if (!isLocalProtectedMediaAssetUrl(value)) return "";
  const normalizedPath = normalizedProtectedLocalMediaPath(value);
  const signed = signLocalMediaPath(normalizedPath);
  if (!signed) return "";
  const pathWithSignature = `${normalizedPath}?expires=${signed.expires}&signature=${encodeURIComponent(signed.signature)}`;
  if (!absolute) return pathWithSignature;
  const base = configuredPublicBaseUrl() || "https://123vips.com";
  return `${base.replace(/\/+$/, "")}${pathWithSignature}`;
}

function localUserUploadDeliveryUrl(value = "", options = {}) {
  return localMediaDeliveryUrl(value, options);
}

function verifyLocalMediaSignature(pathname = "", searchParams = null) {
  const normalizedPath = normalizedProtectedLocalMediaPath(pathname);
  const secret = localMediaSigningSecret();
  if (!normalizedPath || !secret) return false;
  const params = searchParams instanceof URLSearchParams
    ? searchParams
    : new URLSearchParams(String(searchParams || ""));
  const expires = Number(params.get("expires") || 0);
  const signature = String(params.get("signature") || "");
  if (!Number.isFinite(expires) || expires < Date.now() || !signature) return false;
  const expected = crypto.createHmac("sha256", secret)
    .update(`${normalizedPath}\n${expires}`)
    .digest("base64url");
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function verifyLocalUserUploadSignature(pathname = "", searchParams = null) {
  return verifyLocalMediaSignature(pathname, searchParams);
}

function publicUrlForAssetPath(localUrl = "") {
  const value = String(localUrl || "").trim();
  if (!value) return "";
  // Legacy /assets URLs are still hosted by R2. Switching uploads to OSS must
  // not rewrite those historical files to the OSS CDN host.
  const r2BaseUrl = !DISABLE_R2_STORAGE && R2.publicDomain ? String(R2.publicDomain || "").replace(/\/+$/, "") : "";
  if (isPublicHttpUrl(value)) {
    try {
      const parsed = new URL(value);
      const publicBase = configuredPublicBaseUrl();
      const publicHost = publicBase ? new URL(publicBase).host : "";
      if (r2BaseUrl && parsed.pathname.startsWith("/assets/") && (!publicHost || parsed.host === publicHost || parsed.hostname === "123vips.com")) {
        return `${r2BaseUrl}${parsed.pathname}${parsed.search || ""}`;
      }
    } catch {
      return value;
    }
    return value;
  }
  if (value.startsWith("/assets/") && r2BaseUrl) {
    return `${r2BaseUrl}/${value.replace(/^\/+/, "")}`;
  }
  const baseUrl = configuredPublicBaseUrl();
  if (!baseUrl) return "";
  return `${baseUrl}/${value.replace(/^\/+/, "")}`;
}

function shouldKeepLocalAssetField(key = "") {
  const name = String(key || "");
  return /(?:Path|Key)$/i.test(name);
}

function shouldRewritePublicAssetField(key = "", value = "") {
  if (shouldKeepLocalAssetField(key)) return false;
  const text = String(value || "").trim();
  if (!text) return false;
  if (text.startsWith("/assets/")) return true;
  if (isPublicHttpUrl(text)) return true;
  return /(?:Url|URL|Uri|URI|Href|href|Src|src)$/i.test(String(key || ""));
}

function publicAssetUrlsForClient(value, key = "") {
  if (typeof value === "string") {
    const text = value.trim();
    if (shouldRewritePublicAssetField(key, text)) {
      // A protected path on the application origin is a local-only fallback.
      // Sign it before R2/OSS rewriting so a missing mirror cannot turn into
      // either a bare local path or a dead unsigned CDN URL.
      const localDeliveryUrl = localMediaDeliveryUrl(text, { absolute: isPublicHttpUrl(text) });
      if (localDeliveryUrl) return localDeliveryUrl;
      // OSS is private. Serialization must mint a fresh CDN signature instead
      // of exposing a stale or unsigned stored URL. Key fields remain untouched.
      const publicUrl = publicUrlForAssetPath(text);
      const deliveryUrl = signedOssCdnUrlForDelivery(publicUrl || text);
      if (deliveryUrl) return deliveryUrl;
      // For protected local paths, never fall back to an unsigned CDN/origin
      // URL when signing is unavailable. Let the caller fail closed.
      if (isProtectedLocalMediaPath(text)) return "";
      if (publicUrl && publicUrl !== text) return publicUrl;
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => publicAssetUrlsForClient(item, key));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [
      entryKey,
      publicAssetUrlsForClient(entryValue, entryKey),
    ]));
  }
  return value;
}

function absoluteUrlFromBase(value = "", baseUrl = "") {
  const text = String(value || "").trim();
  if (!text || isPublicHttpUrl(text)) return text;
  const base = String(baseUrl || "").trim().replace(/\/+$/, "");
  if (!base || !text.startsWith("/")) return text;
  return `${base}${text}`;
}

function canonicalRedirectLocation(req, url) {
  if (req.method !== "GET" && req.method !== "HEAD") return "";
  if (String(url.pathname || "").startsWith("/api/")) return "";
  const hostname = requestHostname(req);
  if (!hostname || /^(localhost|127\.0\.0\.1|::1)$/i.test(hostname)) return "";
  const canonicalHost = canonicalHostname(hostname, CANONICAL_HOST_ALIASES);
  if (!canonicalHost || canonicalHost === hostname) return "";
  const protocol = String(req.headers["x-forwarded-proto"] || "https").split(",")[0].trim() || "https";
  return `${protocol}://${canonicalHost}${url.pathname || "/"}${url.search || ""}`;
}

function sendCanonicalRedirect(req, res, url) {
  const location = canonicalRedirectLocation(req, url);
  if (!location) return false;
  res.writeHead(308, {
    location,
    "cache-control": "public, max-age=3600",
  });
  res.end();
  return true;
}

function sendHttpsRedirect(req, res, url) {
  const location = httpsRedirectLocation(req, url);
  if (!location) return false;
  res.writeHead(308, {
    location,
    "cache-control": "public, max-age=3600",
  });
  res.end();
  return true;
}

function isLocalPublicAssetUrl(value = "") {
  const baseUrl = configuredPublicBaseUrl();
  return Boolean(baseUrl && String(value || "").startsWith(`${baseUrl}/assets/`));
}

async function readDb(options = {}) {
  const db = (await readAppDbFromTables(DEFAULT_DB, {
    includeUserAssets: options.includeUserAssets !== false,
  })) || DEFAULT_DB;
  const users = Array.isArray(db.users)
    ? db.users.map((user) => ({ ...user, tenantId: recordTenantId(user) }))
    : [];
  const sessions = Array.isArray(db.sessions)
    ? db.sessions.map((session) => ({ ...session, tenantId: recordTenantId(session) }))
    : [];
  return {
    users,
    sessions,
    walletOrders: Array.isArray(db.walletOrders) ? db.walletOrders : [],
    referralWithdrawals: Array.isArray(db.referralWithdrawals) ? db.referralWithdrawals : [],
    creditLedger: Array.isArray(db.creditLedger) ? db.creditLedger : [],
    userAssets: Array.isArray(db.userAssets) ? db.userAssets : [],
    userCharacters: Array.isArray(db.userCharacters) ? db.userCharacters : [],
    userUnlocks: Array.isArray(db.userUnlocks) ? db.userUnlocks : [],
    apiSubtokens: Array.isArray(db.apiSubtokens) ? db.apiSubtokens : [],
    supportMessages: Array.isArray(db.supportMessages) ? db.supportMessages : [],
  };
}

async function readGenerationJobDb(userId = "") {
  if (!dbEnabled()) return readDb();
  const cleanUserId = String(userId || "").trim();
  if (!cleanUserId) {
    return {
      ...DEFAULT_DB,
      users: [],
      userAssets: [],
    };
  }
  // Generation preparation only needs the creating user and that user's own
  // reference assets. Loading the entire application snapshot here exhausted
  // the shared PostgreSQL pool under concurrent traffic.
  const user = await getUserByIdInDb(cleanUserId);
  const userAssets = user ? await getUserAssetsForUserFromDb(cleanUserId) : [];
  return {
    ...DEFAULT_DB,
    users: user ? [user] : [],
    userAssets,
  };
}

function isSoftDeleted(record) {
  return Boolean(record?.deletedAt);
}

async function writeDb(db) {
  return withAppStateWriteLock(() => replaceAppDbTables(db));
}

async function createSingleLoginSession(db, user, tenantId = DEFAULT_TENANT_ID, deviceId = "") {
  const now = new Date().toISOString();
  // Only new sessions receive a finite lifetime. Existing rows that predate
  // this field intentionally remain valid so this security change never signs
  // out users who are already logged in.
  const sessionTtlDays = Math.max(1, Math.min(365, Number(process.env.SESSION_TTL_DAYS || 90) || 90));
  const expiresAt = new Date(Date.parse(now) + sessionTtlDays * 24 * 60 * 60 * 1000).toISOString();
  const userId = String(user?.id || "");
  const normalizedTenantId = normalizeTenantId(tenantId);
  const normalizedDeviceId = String(deviceId || "").trim().slice(0, 128);
  if (!userId) throw new Error("Cannot create a login session without a user.");
  // Every device keeps an independent persistent session. Re-login on the
  // same browser reuses its token; a new browser gets a new token. Never
  // delete another device's session as a side effect of login.
  let existing = normalizedDeviceId
    ? (db.sessions || []).find((item) => (
      String(item.userId || "") === userId
      && normalizeTenantId(item.tenantId || item.tenant_id || DEFAULT_TENANT_ID) === normalizedTenantId
      && String(item.deviceId || "") === normalizedDeviceId
    ))
    : null;
  if (!existing && normalizedDeviceId && dbEnabled()) {
    existing = await getSessionByUserDeviceInDb(userId, normalizedTenantId, normalizedDeviceId);
    if (existing) {
      db.sessions = Array.isArray(db.sessions) ? db.sessions : [];
      if (!db.sessions.some((item) => item.token === existing.token)) db.sessions.push(existing);
    }
  }
  if (existing?.token) {
    existing.updatedAt = now;
    // Legacy sessions remain valid indefinitely. Do not backfill expiresAt on
    // an existing row, otherwise a harmless same-device login would change the
    // user's already-established session lifetime.
    if (dbEnabled()) await createSessionInDb(existing);
    return existing;
  }
  const session = {
    token: crypto.randomBytes(32).toString("hex"),
    userId,
    tenantId: normalizedTenantId,
    deviceId: normalizedDeviceId,
    accountKey: loginAccountKey(user),
    expiresAt,
    createdAt: now,
    updatedAt: now,
  };
  db.sessions = Array.isArray(db.sessions) ? db.sessions : [];
  db.sessions.push(session);
  if (dbEnabled()) await createSessionInDb(session);
  else await writeDb(db);
  return session;
}

function loginAccountKey(user = {}) {
  const email = String(user.email || "").trim().toLowerCase();
  if (email) return `email:${email}`;
  const googleId = String(user.googleId || "").trim();
  if (googleId) return `google:${googleId}`;
  const telegramId = String(user.telegramUserId || "").trim();
  if (telegramId) return `telegram:${telegramId}`;
  const username = String(user.username || "").trim().toLowerCase();
  return username ? `username:${username}` : `user:${String(user.id || "")}`;
}

async function readAdminHomeItemsStore() {
  return (await listAdminHomeItemsFromDb()) || [];
}

async function replaceAdminHomeItemsStore(items = []) {
  const normalized = (Array.isArray(items) ? items : []).filter((item) => item && String(item.id || "").trim());
  await replaceAdminHomeItemsInDb(normalized);
  return normalized;
}

async function upsertAdminHomeItemStore(item = {}) {
  if (!item?.id) return null;
  return await upsertAdminHomeItemInDb(item);
}

async function softDeleteAdminHomeItemStore(itemId = "") {
  const id = String(itemId || "").trim();
  if (!id) return null;
  const nowIso = new Date().toISOString();
  return await softDeleteAdminHomeItemInDb(id, nowIso);
}

async function readAppConfig({ includeHomeItems = true } = {}) {
  const saved = await getKv("app_config", DEFAULT_CONFIG);
  const bySceneId = new Map(DEFAULT_CONFIG.scenes.map((scene) => [scene.id, scene]));
  const scenes = Array.isArray(saved.scenes) ? saved.scenes : DEFAULT_CONFIG.scenes;
  let storedHomeItems = includeHomeItems ? await readAdminHomeItemsStore() : [];
  const savedHomeItems = includeHomeItems && Array.isArray(saved.homeVideo?.items)
    ? saved.homeVideo.items.filter((item) => item && !isSoftDeleted(item))
    : [];
  const storedHomeIds = new Set(storedHomeItems.map((item) => String(item.id || "")));
  const missingSavedHomeItems = savedHomeItems.filter((item) => item?.id && !storedHomeIds.has(String(item.id)));
  if (missingSavedHomeItems.length) {
    await replaceAdminHomeItemsStore([...storedHomeItems, ...missingSavedHomeItems]);
    storedHomeItems = await readAdminHomeItemsStore();
  }
  const mergedHomeVideo = normalizeHomeVideo({
    ...DEFAULT_CONFIG.homeVideo,
    ...(saved.homeVideo || {}),
    items: storedHomeItems,
  });
  return {
    ...DEFAULT_CONFIG,
    ...saved,
    prices: { ...DEFAULT_CONFIG.prices, ...(saved.prices || {}) },
    wallet: { ...DEFAULT_CONFIG.wallet, ...(saved.wallet || {}) },
    video: { ...DEFAULT_CONFIG.video, ...(saved.video || {}), generateAudio: true },
    undressPrompts: normalizeUndressPrompts(saved.undressPrompts),
    platform: normalizePlatformConfig(saved.platform || DEFAULT_CONFIG.platform),
    homeVideo: mergedHomeVideo,
    ifilm: { ...DEFAULT_CONFIG.ifilm, ...(saved.ifilm || {}) },
    characterImage: { ...DEFAULT_CONFIG.characterImage, ...(saved.characterImage || {}) },
    scenes: scenes.map((scene) => normalizeSceneConfig({ ...(bySceneId.get(scene.id) || {}), ...scene })),
  };
}

async function writeAppConfig(config) {
  const next = {
    ...config,
    undressPrompts: normalizeUndressPrompts(config?.undressPrompts),
  };
  if (Array.isArray(next.homeVideo?.items)) {
    await replaceAdminHomeItemsStore(next.homeVideo.items);
    next.homeVideo = { ...next.homeVideo, items: [] };
  }
  return withAppStateWriteLock(() => setKv("app_config", next));
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

function isLegacyAccessCopy(copy = "") {
  const text = String(copy || "");
  if (/api\/platform\/generate|api\/v3\/contents\/generations\/tasks/i.test(text)) return true;
  if (/Vipeak 2/i.test(text)) return true;
  return /api\/advanced\/generate/i.test(text) && !/dreamina-seedance-2-0(?:-fast)?-260128/i.test(text);
}

function pricingNumber(value, fallback = 0, min = 0, digits = 4) {
  const scale = 10 ** Math.max(0, Math.min(8, Math.floor(Number(digits) || 4)));
  const next = Number(value);
  if (!Number.isFinite(next) || next < min) return Math.max(min, Math.round(Number(fallback || 0) * scale) / scale);
  return Math.round(next * scale) / scale;
}

function advancedPricingModelKey(provider = "", options = {}) {
  const normalized = normalizeAdvancedProvider(provider);
  const optionValue = (key) => String(options?.[key] || "").trim().toLowerCase();
  if (normalized === "seedance") {
    return normalizeSeedanceTier(options?.seedanceTier || options?.tier || "") === "fast"
      ? "seedance-fast"
      : "seedance-standard";
  }
  if (normalized === "wan30") {
    const capability = optionValue("capability");
    const model = optionValue("model");
    if (capability === "wan30-video-prime-pro" || model.includes("prime-pro") || model.includes("vsr-prime")) return "wan30-prime-pro";
    if (capability === "wan30-video-pro" || model.endsWith("-pro")) return "wan30-pro";
    if (capability === "wan30-video-prime" || model.includes("prime")) return "wan30-prime";
    return "wan30";
  }
  if (normalized === "qwen-image3") {
    const tier = String(options?.qwenTier || options?.tier || "pro").trim().toLowerCase() === "standard" ? "standard" : "pro";
    return `qwen-image3-${tier}`;
  }
  if (normalized === "wan27") {
    const capability = optionValue("capability");
    if (capability === "wan-animate-move" || capability === "wan-animate-mix") return capability;
    return "wan27";
  }
  return normalized;
}

function normalizeAdvancedModelSettings(value = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const next = {};
  for (const [rawKey, rawSetting] of Object.entries(source).slice(0, 120)) {
    const key = String(rawKey || "").trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
    if (!key) continue;
    const setting = rawSetting && typeof rawSetting === "object" && !Array.isArray(rawSetting) ? rawSetting : {};
    const discount = Number(setting.discount);
    next[key] = {
      displayName: String(setting.displayName || "").trim().slice(0, 80),
      subtitle: String(setting.subtitle || "").trim().slice(0, 160),
      discount: Number.isFinite(discount) && discount >= 0.01 && discount <= 10 ? Math.round(discount * 10000) / 10000 : 1,
    };
  }
  return next;
}

function advancedModelSetting(pricing = {}, modelKey = "") {
  const key = String(modelKey || "").trim().toLowerCase();
  const settings = pricing?.modelSettings && typeof pricing.modelSettings === "object" ? pricing.modelSettings : {};
  const setting = settings[key] && typeof settings[key] === "object" ? settings[key] : {};
  const discount = Number(setting.discount);
  return {
    displayName: String(setting.displayName || "").trim(),
    subtitle: String(setting.subtitle || "").trim(),
    discount: Number.isFinite(discount) && discount >= 0.01 && discount <= 10 ? discount : 1,
  };
}

function applyAdvancedModelDiscount(credits, pricing = {}, modelKey = "") {
  const amount = Number(credits || 0);
  if (!(amount > 0)) return 0;
  const discount = advancedModelSetting(pricing, modelKey).discount;
  return pricingNumber(amount * discount, amount, 0, 6);
}

function normalizeAdvancedPricing(pricing = {}) {
  const source = pricing && typeof pricing === "object" && !Array.isArray(pricing) ? pricing : {};
  const seedance25 = source.seedance25CreditsPerSecondByResolution && typeof source.seedance25CreditsPerSecondByResolution === "object"
    ? source.seedance25CreditsPerSecondByResolution
    : {};
  const h3Vega = source.h3VegaCreditsPerSecondByResolution && typeof source.h3VegaCreditsPerSecondByResolution === "object"
    ? source.h3VegaCreditsPerSecondByResolution
    : {};
  const h3VegaInputVideo = source.h3VegaInputVideoCreditsPerSecondByResolution && typeof source.h3VegaInputVideoCreditsPerSecondByResolution === "object"
    ? source.h3VegaInputVideoCreditsPerSecondByResolution
    : {};
  const h3VegaPurchase = source.h3VegaPurchaseUsdPerSecondByResolution && typeof source.h3VegaPurchaseUsdPerSecondByResolution === "object"
    ? source.h3VegaPurchaseUsdPerSecondByResolution
    : {};
  const h3VegaInputVideoPurchase = source.h3VegaInputVideoPurchaseUsdPerSecondByResolution && typeof source.h3VegaInputVideoPurchaseUsdPerSecondByResolution === "object"
    ? source.h3VegaInputVideoPurchaseUsdPerSecondByResolution
    : {};
  const vega10Lite = source.vega10LiteCreditsPerSecondByResolution && typeof source.vega10LiteCreditsPerSecondByResolution === "object"
    ? source.vega10LiteCreditsPerSecondByResolution
    : {};
  const vega10LiteInputVideo = source.vega10LiteInputVideoCreditsPerSecondByResolution && typeof source.vega10LiteInputVideoCreditsPerSecondByResolution === "object"
    ? source.vega10LiteInputVideoCreditsPerSecondByResolution
    : {};
  const vega10LitePurchase = source.vega10LitePurchaseUsdPerSecondByResolution && typeof source.vega10LitePurchaseUsdPerSecondByResolution === "object"
    ? source.vega10LitePurchaseUsdPerSecondByResolution
    : {};
  const vega10LiteInputVideoPurchase = source.vega10LiteInputVideoPurchaseUsdPerSecondByResolution && typeof source.vega10LiteInputVideoPurchaseUsdPerSecondByResolution === "object"
    ? source.vega10LiteInputVideoPurchaseUsdPerSecondByResolution
    : {};
  const vega10Pro = source.vega10ProCreditsPerSecondByResolution && typeof source.vega10ProCreditsPerSecondByResolution === "object"
    ? source.vega10ProCreditsPerSecondByResolution
    : {};
  const vega10ProInputVideo = source.vega10ProInputVideoCreditsPerSecondByResolution && typeof source.vega10ProInputVideoCreditsPerSecondByResolution === "object"
    ? source.vega10ProInputVideoCreditsPerSecondByResolution
    : {};
  const vega10ProPurchase = source.vega10ProPurchaseUsdPerSecondByResolution && typeof source.vega10ProPurchaseUsdPerSecondByResolution === "object"
    ? source.vega10ProPurchaseUsdPerSecondByResolution
    : {};
  const vega10ProInputVideoPurchase = source.vega10ProInputVideoPurchaseUsdPerSecondByResolution && typeof source.vega10ProInputVideoPurchaseUsdPerSecondByResolution === "object"
    ? source.vega10ProInputVideoPurchaseUsdPerSecondByResolution
    : {};
  const vega15Pro = source.vega15ProCreditsPerSecondByResolution && typeof source.vega15ProCreditsPerSecondByResolution === "object"
    ? source.vega15ProCreditsPerSecondByResolution
    : {};
  const vega15ProInputVideo = source.vega15ProInputVideoCreditsPerSecondByResolution && typeof source.vega15ProInputVideoCreditsPerSecondByResolution === "object"
    ? source.vega15ProInputVideoCreditsPerSecondByResolution
    : {};
  const vega15ProPurchase = source.vega15ProPurchaseUsdPerSecondByResolution && typeof source.vega15ProPurchaseUsdPerSecondByResolution === "object"
    ? source.vega15ProPurchaseUsdPerSecondByResolution
    : {};
  const vega15ProInputVideoPurchase = source.vega15ProInputVideoPurchaseUsdPerSecondByResolution && typeof source.vega15ProInputVideoPurchaseUsdPerSecondByResolution === "object"
    ? source.vega15ProInputVideoPurchaseUsdPerSecondByResolution
    : {};
  const seedanceNsfw = source.seedanceNsfwCreditsPerSecondByResolution && typeof source.seedanceNsfwCreditsPerSecondByResolution === "object"
    ? source.seedanceNsfwCreditsPerSecondByResolution
    : {};
  const seedanceNsfwVideo = source.seedanceNsfwVideoCreditsPerSecondByResolution && typeof source.seedanceNsfwVideoCreditsPerSecondByResolution === "object"
    ? source.seedanceNsfwVideoCreditsPerSecondByResolution
    : {};
  const seedance = source.seedanceCreditsPerSecondByResolution && typeof source.seedanceCreditsPerSecondByResolution === "object"
    ? source.seedanceCreditsPerSecondByResolution
    : {};
  const seedanceVideoInput = source.seedanceVideoInputCreditsPerSecondByResolution && typeof source.seedanceVideoInputCreditsPerSecondByResolution === "object"
    ? source.seedanceVideoInputCreditsPerSecondByResolution
    : {};
  const seedanceFast = source.seedanceFastCreditsPerSecondByResolution && typeof source.seedanceFastCreditsPerSecondByResolution === "object"
    ? source.seedanceFastCreditsPerSecondByResolution
    : {};
  const seedanceFastVideoInput = source.seedanceFastVideoInputCreditsPerSecondByResolution && typeof source.seedanceFastVideoInputCreditsPerSecondByResolution === "object"
    ? source.seedanceFastVideoInputCreditsPerSecondByResolution
    : {};
  const wan30 = source.wan30CreditsPerSecondByResolution && typeof source.wan30CreditsPerSecondByResolution === "object"
    ? source.wan30CreditsPerSecondByResolution
    : {};
  const wan30Prime = source.wan30PrimeCreditsPerSecondByResolution && typeof source.wan30PrimeCreditsPerSecondByResolution === "object"
    ? source.wan30PrimeCreditsPerSecondByResolution
    : {};
  const wan30Pro = source.wan30ProCreditsPerSecondByResolution && typeof source.wan30ProCreditsPerSecondByResolution === "object"
    ? source.wan30ProCreditsPerSecondByResolution
    : {};
  const wan30PrimePro = source.wan30PrimeProCreditsPerSecondByResolution && typeof source.wan30PrimeProCreditsPerSecondByResolution === "object"
    ? source.wan30PrimeProCreditsPerSecondByResolution
    : {};
  const wan30Purchase = source.wan30PurchaseUsdPerSecondByResolution && typeof source.wan30PurchaseUsdPerSecondByResolution === "object"
    ? source.wan30PurchaseUsdPerSecondByResolution
    : {};
  const wan30PrimePurchase = source.wan30PrimePurchaseUsdPerSecondByResolution && typeof source.wan30PrimePurchaseUsdPerSecondByResolution === "object"
    ? source.wan30PrimePurchaseUsdPerSecondByResolution
    : {};
  const wan30ProPurchase = source.wan30ProPurchaseUsdPerSecondByResolution && typeof source.wan30ProPurchaseUsdPerSecondByResolution === "object"
    ? source.wan30ProPurchaseUsdPerSecondByResolution
    : {};
  const wan30PrimeProPurchase = source.wan30PrimeProPurchaseUsdPerSecondByResolution && typeof source.wan30PrimeProPurchaseUsdPerSecondByResolution === "object"
    ? source.wan30PrimeProPurchaseUsdPerSecondByResolution
    : {};
  const wan27 = source.wan27CreditsPerSecondByResolution && typeof source.wan27CreditsPerSecondByResolution === "object"
    ? source.wan27CreditsPerSecondByResolution
    : {};
  const happyhorse = source.happyhorseCreditsPerSecondByResolution && typeof source.happyhorseCreditsPerSecondByResolution === "object"
    ? source.happyhorseCreditsPerSecondByResolution
    : {};
  const aliyunVideoSource = source.aliyunVideoCreditsPerSecondByCapability && typeof source.aliyunVideoCreditsPerSecondByCapability === "object"
    ? source.aliyunVideoCreditsPerSecondByCapability
    : {};
  const aliyunVideoModelSource = source.aliyunVideoCreditsPerSecondByModel && typeof source.aliyunVideoCreditsPerSecondByModel === "object"
    ? source.aliyunVideoCreditsPerSecondByModel
    : {};
  const rawWan27ImageSource = source.wan27ImagePro && typeof source.wan27ImagePro === "object" && !Array.isArray(source.wan27ImagePro)
    ? source.wan27ImagePro
    : {};
  const rawSeedream5ImageSource = source.seedream5Image && typeof source.seedream5Image === "object" && !Array.isArray(source.seedream5Image)
    ? source.seedream5Image
    : {};
  const rawQwenImage3Source = source.qwenImage3 && typeof source.qwenImage3 === "object" && !Array.isArray(source.qwenImage3)
    ? source.qwenImage3
    : {};
  const rawQwen37FlashSource = source.qwen37Flash && typeof source.qwen37Flash === "object" && !Array.isArray(source.qwen37Flash)
    ? source.qwen37Flash
    : {};
  const wan27ImageSource = { ...rawWan27ImageSource };
  if (Number(wan27ImageSource.saleCnyPerImage) === 0.8432 && !rawWan27ImageSource.userConfigured) {
    wan27ImageSource.saleCnyPerImage = WAN27_IMAGE_PRO_SALE_CNY;
  }
  if (Number(wan27ImageSource.purchaseCnyPerImage) === 0.5621 && !rawWan27ImageSource.userConfigured) {
    wan27ImageSource.purchaseCnyPerImage = WAN27_IMAGE_PRO_PURCHASE_CNY;
  }
  const wan27ImageDefault = DEFAULT_ADVANCED_PRICING.wan27ImagePro || {};
  const rawCreditsPerCny = Number(source.creditsPerCny);
  const hasLegacyCnyPricing = Number.isFinite(rawCreditsPerCny) && rawCreditsPerCny > ADVANCED_CREDITS_PER_CNY && !source.usdBillingConfigured;
  const legacyPricingScale = hasLegacyCnyPricing ? ADVANCED_CREDITS_PER_CNY / rawCreditsPerCny : 1;
  const creditsPerCny = hasLegacyCnyPricing
    ? ADVANCED_CREDITS_PER_CNY
    : pricingNumber(source.creditsPerCny, DEFAULT_ADVANCED_PRICING.creditsPerCny, 0.0001);
  const normalizeStoredCredits = (value, fallback, digits = 4) => {
    const normalized = pricingNumber(value, fallback, 0, digits);
    return pricingNumber(normalized * legacyPricingScale, fallback, 0, digits);
  };
  const normalizeSeedanceFastCredits = (value, fallback, previousDefaults = []) => {
    const numeric = Number(value);
    const migratedValue = Number.isFinite(numeric) && previousDefaults.some((candidate) => Math.abs(numeric - Number(candidate)) < 0.0000001)
      ? fallback
      : value;
    return normalizeStoredCredits(migratedValue, fallback, 6);
  };
  const normalizeSeedance25Credits = (value, fallback, resolution) => {
    const numeric = Number(value);
    const previousPointsPerSecond = resolution === "720p" ? 260 : 130;
    const previousDefault = pricingNumber(
      (previousPointsPerSecond * SEEDANCE25_CNY_PER_POINT / SEEDANCE25_CNY_PER_USD) * DEFAULT_CREDITS_PER_USD,
      0,
      0,
      6,
    );
    const previousRoundedDefault = pricingNumber(previousDefault, previousDefault);
    const previousIntegerDefault = Math.round(previousDefault);
    const previousLegacyUiDefault = resolution === "720p" ? 40 : 20;
    const previousSimplifiedUiDefault = resolution === "720p" ? 16 : 9;
    const previousPurchaseDefault = seedance25PurchaseSiteCreditsPerSecond(resolution);
    const previousPurchaseRoundedDefault = pricingNumber(previousPurchaseDefault, previousPurchaseDefault, 0, 4);
    const migratedValue = Number.isFinite(numeric) && [
      previousDefault,
      previousRoundedDefault,
      previousIntegerDefault,
      previousLegacyUiDefault,
      previousSimplifiedUiDefault,
      previousPurchaseDefault,
      previousPurchaseRoundedDefault,
    ].some((candidate) => Math.abs(numeric - candidate) < 0.0000001)
      ? fallback
      : value;
    return normalizeStoredCredits(migratedValue, fallback, 6);
  };
  const imageResolutionValues = Array.isArray(wan27ImageSource.resolutions) && wan27ImageSource.resolutions.length
    ? wan27ImageSource.resolutions
    : (Array.isArray(wan27ImageDefault.resolutions) ? wan27ImageDefault.resolutions : ["1K", "2K"]);
  const normalizedImageResolutions = [];
  for (const value of [...imageResolutionValues, "4K"]) {
    const normalizedResolution = normalizeWan27ImageResolution(value);
    if (!normalizedImageResolutions.includes(normalizedResolution)) normalizedImageResolutions.push(normalizedResolution);
  }
  const seedreamDefault = DEFAULT_ADVANCED_PRICING.seedream5Image || {};
  const seedreamSource = { ...rawSeedream5ImageSource };
  const seedreamLiteSource = seedreamSource.lite && typeof seedreamSource.lite === "object" && !Array.isArray(seedreamSource.lite) ? seedreamSource.lite : {};
  const seedreamProSource = seedreamSource.pro && typeof seedreamSource.pro === "object" && !Array.isArray(seedreamSource.pro) ? seedreamSource.pro : {};
  const seedreamProPurchase = {};
  const seedreamProSaleSource = seedreamProSource.saleUsdPerImageByResolution && typeof seedreamProSource.saleUsdPerImageByResolution === "object"
    ? seedreamProSource.saleUsdPerImageByResolution
    : {};
  const seedreamProSale = { ...seedreamProSaleSource };
  if (!seedreamProSource.userConfigured && Number(seedreamProSale["1K"] || seedreamProSale["1k"]) === SEEDREAM5_PRO_1K_USD_PER_IMAGE && Number(seedreamProSale["2K"] || seedreamProSale["2k"]) === SEEDREAM5_PRO_1K_USD_PER_IMAGE) {
    delete seedreamProSale["2K"];
    delete seedreamProSale["2k"];
  }
  const migrateSeedreamSaleUsd = (value, purchaseUsd) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) && Math.abs(numeric - purchaseUsd) < 0.0000001
      ? purchaseUsd * SEEDREAM_QWEN_IMAGE_SALE_MARKUP
      : value;
  };
  const normalizeSeedreamUsdMap = (sourceMap = {}, fallbackMap = {}) => ({
    "1K": pricingNumber(firstPresent(sourceMap["1K"], sourceMap["1k"]), fallbackMap["1K"] ?? SEEDREAM5_PRO_1K_USD_PER_IMAGE, 0, 6),
    "2K": pricingNumber(firstPresent(sourceMap["2K"], sourceMap["2k"]), fallbackMap["2K"] ?? SEEDREAM5_PRO_2K_USD_PER_IMAGE, 0, 6),
  });
  const normalizeSeedreamSaleUsdMap = (sourceMap = {}, fallbackMap = {}) => ({
    "1K": pricingNumber(migrateSeedreamSaleUsd(firstPresent(sourceMap["1K"], sourceMap["1k"]), SEEDREAM5_PRO_1K_USD_PER_IMAGE), fallbackMap["1K"] ?? SEEDREAM5_PRO_1K_USD_PER_IMAGE, 0, 6),
    "2K": pricingNumber(migrateSeedreamSaleUsd(firstPresent(sourceMap["2K"], sourceMap["2k"]), SEEDREAM5_PRO_2K_USD_PER_IMAGE), fallbackMap["2K"] ?? SEEDREAM5_PRO_2K_USD_PER_IMAGE, 0, 6),
  });
  const normalizedSeedreamResolutions = ["1K", "2K"];
  const qwenImage3Default = DEFAULT_ADVANCED_PRICING.qwenImage3 || {};
  const normalizeQwenImage3TierPricing = (tier) => {
    const sourceTier = rawQwenImage3Source[tier] && typeof rawQwenImage3Source[tier] === "object"
      ? rawQwenImage3Source[tier]
      : {};
    const defaultTier = qwenImage3Default[tier] || {};
    const official = QWEN_IMAGE3_OFFICIAL_USD[tier];
    const purchaseMap = sourceTier.purchaseUsdPerImageByResolution && typeof sourceTier.purchaseUsdPerImageByResolution === "object"
      ? sourceTier.purchaseUsdPerImageByResolution
      : {};
    const saleMap = sourceTier.saleUsdPerImageByResolution && typeof sourceTier.saleUsdPerImageByResolution === "object"
      ? sourceTier.saleUsdPerImageByResolution
      : {};
    const migrateQwenSaleUsd = (value, purchaseUsd) => {
      const numeric = Number(value);
      return Number.isFinite(numeric) && Math.abs(numeric - purchaseUsd) < 0.0000001
        ? purchaseUsd * SEEDREAM_QWEN_IMAGE_SALE_MARKUP
        : value;
    };
    return {
      ...defaultTier,
      ...sourceTier,
      model: qwenImage3ModelForTier(tier, sourceTier.model || defaultTier.model),
      purchaseUsdPerImageByResolution: {
        "1K": pricingNumber(firstPresent(purchaseMap["1K"], purchaseMap["1k"]), defaultTier.purchaseUsdPerImageByResolution?.["1K"] ?? official.outputPerImage["1K"], 0, 6),
        "2K": pricingNumber(firstPresent(purchaseMap["2K"], purchaseMap["2k"]), defaultTier.purchaseUsdPerImageByResolution?.["2K"] ?? official.outputPerImage["2K"], 0, 6),
      },
      saleUsdPerImageByResolution: {
        "1K": pricingNumber(migrateQwenSaleUsd(firstPresent(saleMap["1K"], saleMap["1k"]), official.outputPerImage["1K"]), defaultTier.saleUsdPerImageByResolution?.["1K"] ?? official.outputPerImage["1K"], 0, 6),
        "2K": pricingNumber(migrateQwenSaleUsd(firstPresent(saleMap["2K"], saleMap["2k"]), official.outputPerImage["2K"]), defaultTier.saleUsdPerImageByResolution?.["2K"] ?? official.outputPerImage["2K"], 0, 6),
      },
      purchaseUsdPerReferenceImage: pricingNumber(sourceTier.purchaseUsdPerReferenceImage, defaultTier.purchaseUsdPerReferenceImage ?? official.inputPerReferenceImage, 0, 6),
      saleUsdPerReferenceImage: pricingNumber(migrateQwenSaleUsd(sourceTier.saleUsdPerReferenceImage, official.inputPerReferenceImage), defaultTier.saleUsdPerReferenceImage ?? official.inputPerReferenceImage, 0, 6),
      userConfigured: sourceTier.userConfigured === true,
    };
  };
  const normalizedWan27Rates = {
    "720p": normalizeStoredCredits(wan27["720p"], DEFAULT_ADVANCED_PRICING.wan27CreditsPerSecondByResolution["720p"]),
    "1080p": normalizeStoredCredits(wan27["1080p"], DEFAULT_ADVANCED_PRICING.wan27CreditsPerSecondByResolution["1080p"]),
  };
  const happyhorseCapabilities = ["happyhorse-t2v", "happyhorse-i2v", "happyhorse-r2v", "happyhorse-video-edit"];
  const normalizedHappyhorseRates = Object.fromEntries(["720p", "1080p"].map((resolution) => {
    const legacyRates = happyhorseCapabilities
      .map((capability) => aliyunVideoSource[capability]?.[resolution])
      .filter((value) => Number.isFinite(Number(value)) && Number(value) >= 0)
      .map((value) => normalizeStoredCredits(value, 0));
    const fallback = legacyRates.length
      ? Math.max(...legacyRates)
      : DEFAULT_ADVANCED_PRICING.happyhorseCreditsPerSecondByResolution[resolution];
    return [resolution, normalizeStoredCredits(happyhorse[resolution], fallback)];
  }));
  const aliyunVideoCreditsPerSecondByCapability = {};
  for (const [capability, fallbackRates] of Object.entries(DEFAULT_ADVANCED_PRICING.aliyunVideoCreditsPerSecondByCapability || {})) {
    const sourceRates = aliyunVideoSource[capability] && typeof aliyunVideoSource[capability] === "object"
      ? aliyunVideoSource[capability]
      : {};
    const inheritsWan27Rates = capability.startsWith("wan27-") || capability === "wan-legacy";
    const inheritsHappyhorseRates = capability.startsWith("happyhorse-");
    aliyunVideoCreditsPerSecondByCapability[capability] = Object.fromEntries(
      Object.keys(fallbackRates).map((rateKey) => {
        const inheritedFallback = inheritsHappyhorseRates && normalizedHappyhorseRates[rateKey] !== undefined
          ? normalizedHappyhorseRates[rateKey]
          : inheritsWan27Rates && normalizedWan27Rates[rateKey] !== undefined
          ? normalizedWan27Rates[rateKey]
          : fallbackRates[rateKey];
        const value = inheritsHappyhorseRates ? normalizedHappyhorseRates[rateKey] : sourceRates[rateKey];
        return [rateKey, normalizeStoredCredits(value, inheritedFallback)];
      }),
    );
  }
  const aliyunVideoCreditsPerSecondByModel = {};
  const legacyCapabilityRates = aliyunVideoSource["wan-legacy"] && typeof aliyunVideoSource["wan-legacy"] === "object"
    ? aliyunVideoSource["wan-legacy"]
    : {};
  for (const [model, fallbackRates] of Object.entries(DEFAULT_ADVANCED_PRICING.aliyunVideoCreditsPerSecondByModel || {})) {
    const sourceRates = aliyunVideoModelSource[model] && typeof aliyunVideoModelSource[model] === "object"
      ? aliyunVideoModelSource[model]
      : {};
    aliyunVideoCreditsPerSecondByModel[model] = Object.fromEntries(
      Object.keys(fallbackRates).map((rateKey) => {
        const resolution = rateKey.split("-")[0];
        const inheritedLegacyRate = legacyCapabilityRates[resolution];
        const fallback = Number.isFinite(Number(inheritedLegacyRate))
          ? inheritedLegacyRate
          : fallbackRates[rateKey];
        return [rateKey, normalizeStoredCredits(sourceRates[rateKey], fallback)];
      }),
    );
  }
  return {
    unit: "credits",
    creditsPerCny,
    creditsPerUsd: DEFAULT_CREDITS_PER_USD,
    internalCnyPerUsd: INTERNAL_CNY_PER_USD,
    usdBillingConfigured: true,
    modelSettings: normalizeAdvancedModelSettings(source.modelSettings),
    seedance25CreditsPerSecondByResolution: {
      "480p": normalizeSeedance25Credits(seedance25["480p"], DEFAULT_ADVANCED_PRICING.seedance25CreditsPerSecondByResolution["480p"], "480p"),
      "720p": normalizeSeedance25Credits(seedance25["720p"], DEFAULT_ADVANCED_PRICING.seedance25CreditsPerSecondByResolution["720p"], "720p"),
    },
    h3VegaCreditsPerSecondByResolution: {
      "480p": normalizeStoredCredits(h3Vega["480p"], DEFAULT_ADVANCED_PRICING.h3VegaCreditsPerSecondByResolution["480p"], 6),
      "720p": normalizeStoredCredits(h3Vega["720p"], DEFAULT_ADVANCED_PRICING.h3VegaCreditsPerSecondByResolution["720p"], 6),
      "1080p": normalizeStoredCredits(h3Vega["1080p"], DEFAULT_ADVANCED_PRICING.h3VegaCreditsPerSecondByResolution["1080p"], 6),
      "2k": normalizeStoredCredits(h3Vega["2k"], DEFAULT_ADVANCED_PRICING.h3VegaCreditsPerSecondByResolution["2k"], 6),
      "4k": normalizeStoredCredits(h3Vega["4k"], DEFAULT_ADVANCED_PRICING.h3VegaCreditsPerSecondByResolution["4k"], 6),
    },
    h3VegaInputVideoCreditsPerSecondByResolution: {
      "480p": normalizeStoredCredits(h3VegaInputVideo["480p"], DEFAULT_ADVANCED_PRICING.h3VegaInputVideoCreditsPerSecondByResolution["480p"], 6),
      "720p": normalizeStoredCredits(h3VegaInputVideo["720p"], DEFAULT_ADVANCED_PRICING.h3VegaInputVideoCreditsPerSecondByResolution["720p"], 6),
      "1080p": normalizeStoredCredits(h3VegaInputVideo["1080p"], DEFAULT_ADVANCED_PRICING.h3VegaInputVideoCreditsPerSecondByResolution["1080p"], 6),
      "2k": normalizeStoredCredits(h3VegaInputVideo["2k"], DEFAULT_ADVANCED_PRICING.h3VegaInputVideoCreditsPerSecondByResolution["2k"], 6),
      "4k": normalizeStoredCredits(h3VegaInputVideo["4k"], DEFAULT_ADVANCED_PRICING.h3VegaInputVideoCreditsPerSecondByResolution["4k"], 6),
    },
    h3VegaPurchaseUsdPerSecondByResolution: {
      "480p": pricingNumber(h3VegaPurchase["480p"], DEFAULT_ADVANCED_PRICING.h3VegaPurchaseUsdPerSecondByResolution["480p"], 0, 8),
      "720p": pricingNumber(h3VegaPurchase["720p"], DEFAULT_ADVANCED_PRICING.h3VegaPurchaseUsdPerSecondByResolution["720p"], 0, 8),
      "1080p": pricingNumber(h3VegaPurchase["1080p"], DEFAULT_ADVANCED_PRICING.h3VegaPurchaseUsdPerSecondByResolution["1080p"], 0, 8),
      "2k": pricingNumber(h3VegaPurchase["2k"], DEFAULT_ADVANCED_PRICING.h3VegaPurchaseUsdPerSecondByResolution["2k"], 0, 8),
      "4k": pricingNumber(h3VegaPurchase["4k"], DEFAULT_ADVANCED_PRICING.h3VegaPurchaseUsdPerSecondByResolution["4k"], 0, 8),
    },
    h3VegaInputVideoPurchaseUsdPerSecondByResolution: {
      "480p": pricingNumber(h3VegaInputVideoPurchase["480p"], DEFAULT_ADVANCED_PRICING.h3VegaInputVideoPurchaseUsdPerSecondByResolution["480p"], 0, 8),
      "720p": pricingNumber(h3VegaInputVideoPurchase["720p"], DEFAULT_ADVANCED_PRICING.h3VegaInputVideoPurchaseUsdPerSecondByResolution["720p"], 0, 8),
      "1080p": pricingNumber(h3VegaInputVideoPurchase["1080p"], DEFAULT_ADVANCED_PRICING.h3VegaInputVideoPurchaseUsdPerSecondByResolution["1080p"], 0, 8),
      "2k": pricingNumber(h3VegaInputVideoPurchase["2k"], DEFAULT_ADVANCED_PRICING.h3VegaInputVideoPurchaseUsdPerSecondByResolution["2k"], 0, 8),
      "4k": pricingNumber(h3VegaInputVideoPurchase["4k"], DEFAULT_ADVANCED_PRICING.h3VegaInputVideoPurchaseUsdPerSecondByResolution["4k"], 0, 8),
    },
    vega10LiteCreditsPerSecondByResolution: {
      "480p": normalizeStoredCredits(vega10Lite["480p"], DEFAULT_ADVANCED_PRICING.vega10LiteCreditsPerSecondByResolution["480p"], 6),
      "768p": normalizeStoredCredits(vega10Lite["768p"], DEFAULT_ADVANCED_PRICING.vega10LiteCreditsPerSecondByResolution["768p"], 6),
      "1080p": normalizeStoredCredits(vega10Lite["1080p"], DEFAULT_ADVANCED_PRICING.vega10LiteCreditsPerSecondByResolution["1080p"], 6),
      "2k": normalizeStoredCredits(vega10Lite["2k"], DEFAULT_ADVANCED_PRICING.vega10LiteCreditsPerSecondByResolution["2k"], 6),
      "4k": normalizeStoredCredits(vega10Lite["4k"], DEFAULT_ADVANCED_PRICING.vega10LiteCreditsPerSecondByResolution["4k"], 6),
    },
    vega10LiteInputVideoCreditsPerSecondByResolution: {
      "480p": normalizeStoredCredits(vega10LiteInputVideo["480p"], DEFAULT_ADVANCED_PRICING.vega10LiteInputVideoCreditsPerSecondByResolution["480p"], 6),
      "768p": normalizeStoredCredits(vega10LiteInputVideo["768p"], DEFAULT_ADVANCED_PRICING.vega10LiteInputVideoCreditsPerSecondByResolution["768p"], 6),
      "1080p": normalizeStoredCredits(vega10LiteInputVideo["1080p"], DEFAULT_ADVANCED_PRICING.vega10LiteInputVideoCreditsPerSecondByResolution["1080p"], 6),
      "2k": normalizeStoredCredits(vega10LiteInputVideo["2k"], DEFAULT_ADVANCED_PRICING.vega10LiteInputVideoCreditsPerSecondByResolution["2k"], 6),
      "4k": normalizeStoredCredits(vega10LiteInputVideo["4k"], DEFAULT_ADVANCED_PRICING.vega10LiteInputVideoCreditsPerSecondByResolution["4k"], 6),
    },
    vega10LiteReferenceImageCreditsEach: normalizeStoredCredits(source.vega10LiteReferenceImageCreditsEach, DEFAULT_ADVANCED_PRICING.vega10LiteReferenceImageCreditsEach, 6),
    vega10LitePurchaseUsdPerSecondByResolution: {
      "480p": pricingNumber(vega10LitePurchase["480p"], DEFAULT_ADVANCED_PRICING.vega10LitePurchaseUsdPerSecondByResolution["480p"], 0, 8),
      "768p": pricingNumber(vega10LitePurchase["768p"], DEFAULT_ADVANCED_PRICING.vega10LitePurchaseUsdPerSecondByResolution["768p"], 0, 8),
      "1080p": pricingNumber(vega10LitePurchase["1080p"], DEFAULT_ADVANCED_PRICING.vega10LitePurchaseUsdPerSecondByResolution["1080p"], 0, 8),
      "2k": pricingNumber(vega10LitePurchase["2k"], DEFAULT_ADVANCED_PRICING.vega10LitePurchaseUsdPerSecondByResolution["2k"], 0, 8),
      "4k": pricingNumber(vega10LitePurchase["4k"], DEFAULT_ADVANCED_PRICING.vega10LitePurchaseUsdPerSecondByResolution["4k"], 0, 8),
    },
    vega10LiteInputVideoPurchaseUsdPerSecondByResolution: {
      "480p": pricingNumber(vega10LiteInputVideoPurchase["480p"], DEFAULT_ADVANCED_PRICING.vega10LiteInputVideoPurchaseUsdPerSecondByResolution["480p"], 0, 8),
      "768p": pricingNumber(vega10LiteInputVideoPurchase["768p"], DEFAULT_ADVANCED_PRICING.vega10LiteInputVideoPurchaseUsdPerSecondByResolution["768p"], 0, 8),
      "1080p": pricingNumber(vega10LiteInputVideoPurchase["1080p"], DEFAULT_ADVANCED_PRICING.vega10LiteInputVideoPurchaseUsdPerSecondByResolution["1080p"], 0, 8),
      "2k": pricingNumber(vega10LiteInputVideoPurchase["2k"], DEFAULT_ADVANCED_PRICING.vega10LiteInputVideoPurchaseUsdPerSecondByResolution["2k"], 0, 8),
      "4k": pricingNumber(vega10LiteInputVideoPurchase["4k"], DEFAULT_ADVANCED_PRICING.vega10LiteInputVideoPurchaseUsdPerSecondByResolution["4k"], 0, 8),
    },
    vega10LiteReferenceImagePurchaseUsdEach: pricingNumber(source.vega10LiteReferenceImagePurchaseUsdEach, DEFAULT_ADVANCED_PRICING.vega10LiteReferenceImagePurchaseUsdEach, 0, 8),
    vega10ProCreditsPerSecondByResolution: {
      "480p": normalizeStoredCredits(vega10Pro["480p"], DEFAULT_ADVANCED_PRICING.vega10ProCreditsPerSecondByResolution["480p"], 6),
      "720p": normalizeStoredCredits(vega10Pro["720p"], DEFAULT_ADVANCED_PRICING.vega10ProCreditsPerSecondByResolution["720p"], 6),
      "1080p": normalizeStoredCredits(vega10Pro["1080p"], DEFAULT_ADVANCED_PRICING.vega10ProCreditsPerSecondByResolution["1080p"], 6),
      "2k": normalizeStoredCredits(vega10Pro["2k"], DEFAULT_ADVANCED_PRICING.vega10ProCreditsPerSecondByResolution["2k"], 6),
      "4k": normalizeStoredCredits(vega10Pro["4k"], DEFAULT_ADVANCED_PRICING.vega10ProCreditsPerSecondByResolution["4k"], 6),
    },
    vega10ProInputVideoCreditsPerSecondByResolution: {
      "480p": normalizeStoredCredits(vega10ProInputVideo["480p"], DEFAULT_ADVANCED_PRICING.vega10ProInputVideoCreditsPerSecondByResolution["480p"], 6),
      "720p": normalizeStoredCredits(vega10ProInputVideo["720p"], DEFAULT_ADVANCED_PRICING.vega10ProInputVideoCreditsPerSecondByResolution["720p"], 6),
      "1080p": normalizeStoredCredits(vega10ProInputVideo["1080p"], DEFAULT_ADVANCED_PRICING.vega10ProInputVideoCreditsPerSecondByResolution["1080p"], 6),
      "2k": normalizeStoredCredits(vega10ProInputVideo["2k"], DEFAULT_ADVANCED_PRICING.vega10ProInputVideoCreditsPerSecondByResolution["2k"], 6),
      "4k": normalizeStoredCredits(vega10ProInputVideo["4k"], DEFAULT_ADVANCED_PRICING.vega10ProInputVideoCreditsPerSecondByResolution["4k"], 6),
    },
    vega10ProPurchaseUsdPerSecondByResolution: {
      "480p": pricingNumber(vega10ProPurchase["480p"], DEFAULT_ADVANCED_PRICING.vega10ProPurchaseUsdPerSecondByResolution["480p"], 0, 8),
      "720p": pricingNumber(vega10ProPurchase["720p"], DEFAULT_ADVANCED_PRICING.vega10ProPurchaseUsdPerSecondByResolution["720p"], 0, 8),
      "1080p": pricingNumber(vega10ProPurchase["1080p"], DEFAULT_ADVANCED_PRICING.vega10ProPurchaseUsdPerSecondByResolution["1080p"], 0, 8),
      "2k": pricingNumber(vega10ProPurchase["2k"], DEFAULT_ADVANCED_PRICING.vega10ProPurchaseUsdPerSecondByResolution["2k"], 0, 8),
      "4k": pricingNumber(vega10ProPurchase["4k"], DEFAULT_ADVANCED_PRICING.vega10ProPurchaseUsdPerSecondByResolution["4k"], 0, 8),
    },
    vega10ProInputVideoPurchaseUsdPerSecondByResolution: {
      "480p": pricingNumber(vega10ProInputVideoPurchase["480p"], DEFAULT_ADVANCED_PRICING.vega10ProInputVideoPurchaseUsdPerSecondByResolution["480p"], 0, 8),
      "720p": pricingNumber(vega10ProInputVideoPurchase["720p"], DEFAULT_ADVANCED_PRICING.vega10ProInputVideoPurchaseUsdPerSecondByResolution["720p"], 0, 8),
      "1080p": pricingNumber(vega10ProInputVideoPurchase["1080p"], DEFAULT_ADVANCED_PRICING.vega10ProInputVideoPurchaseUsdPerSecondByResolution["1080p"], 0, 8),
      "2k": pricingNumber(vega10ProInputVideoPurchase["2k"], DEFAULT_ADVANCED_PRICING.vega10ProInputVideoPurchaseUsdPerSecondByResolution["2k"], 0, 8),
      "4k": pricingNumber(vega10ProInputVideoPurchase["4k"], DEFAULT_ADVANCED_PRICING.vega10ProInputVideoPurchaseUsdPerSecondByResolution["4k"], 0, 8),
    },
    vega15ProCreditsPerSecondByResolution: {
      "480p": normalizeStoredCredits(vega15Pro["480p"], DEFAULT_ADVANCED_PRICING.vega15ProCreditsPerSecondByResolution["480p"], 6),
      "720p": normalizeStoredCredits(vega15Pro["720p"], DEFAULT_ADVANCED_PRICING.vega15ProCreditsPerSecondByResolution["720p"], 6),
      "1080p": normalizeStoredCredits(vega15Pro["1080p"], DEFAULT_ADVANCED_PRICING.vega15ProCreditsPerSecondByResolution["1080p"], 6),
      "2k": normalizeStoredCredits(vega15Pro["2k"], DEFAULT_ADVANCED_PRICING.vega15ProCreditsPerSecondByResolution["2k"], 6),
      "4k": normalizeStoredCredits(vega15Pro["4k"], DEFAULT_ADVANCED_PRICING.vega15ProCreditsPerSecondByResolution["4k"], 6),
    },
    vega15ProInputVideoCreditsPerSecondByResolution: {
      "480p": normalizeStoredCredits(vega15ProInputVideo["480p"], DEFAULT_ADVANCED_PRICING.vega15ProInputVideoCreditsPerSecondByResolution["480p"], 6),
      "720p": normalizeStoredCredits(vega15ProInputVideo["720p"], DEFAULT_ADVANCED_PRICING.vega15ProInputVideoCreditsPerSecondByResolution["720p"], 6),
      "1080p": normalizeStoredCredits(vega15ProInputVideo["1080p"], DEFAULT_ADVANCED_PRICING.vega15ProInputVideoCreditsPerSecondByResolution["1080p"], 6),
      "2k": normalizeStoredCredits(vega15ProInputVideo["2k"], DEFAULT_ADVANCED_PRICING.vega15ProInputVideoCreditsPerSecondByResolution["2k"], 6),
      "4k": normalizeStoredCredits(vega15ProInputVideo["4k"], DEFAULT_ADVANCED_PRICING.vega15ProInputVideoCreditsPerSecondByResolution["4k"], 6),
    },
    vega15ProPurchaseUsdPerSecondByResolution: {
      "480p": pricingNumber(vega15ProPurchase["480p"], DEFAULT_ADVANCED_PRICING.vega15ProPurchaseUsdPerSecondByResolution["480p"], 0, 8),
      "720p": pricingNumber(vega15ProPurchase["720p"], DEFAULT_ADVANCED_PRICING.vega15ProPurchaseUsdPerSecondByResolution["720p"], 0, 8),
      "1080p": pricingNumber(vega15ProPurchase["1080p"], DEFAULT_ADVANCED_PRICING.vega15ProPurchaseUsdPerSecondByResolution["1080p"], 0, 8),
      "2k": pricingNumber(vega15ProPurchase["2k"], DEFAULT_ADVANCED_PRICING.vega15ProPurchaseUsdPerSecondByResolution["2k"], 0, 8),
      "4k": pricingNumber(vega15ProPurchase["4k"], DEFAULT_ADVANCED_PRICING.vega15ProPurchaseUsdPerSecondByResolution["4k"], 0, 8),
    },
    vega15ProInputVideoPurchaseUsdPerSecondByResolution: {
      "480p": pricingNumber(vega15ProInputVideoPurchase["480p"], DEFAULT_ADVANCED_PRICING.vega15ProInputVideoPurchaseUsdPerSecondByResolution["480p"], 0, 8),
      "720p": pricingNumber(vega15ProInputVideoPurchase["720p"], DEFAULT_ADVANCED_PRICING.vega15ProInputVideoPurchaseUsdPerSecondByResolution["720p"], 0, 8),
      "1080p": pricingNumber(vega15ProInputVideoPurchase["1080p"], DEFAULT_ADVANCED_PRICING.vega15ProInputVideoPurchaseUsdPerSecondByResolution["1080p"], 0, 8),
      "2k": pricingNumber(vega15ProInputVideoPurchase["2k"], DEFAULT_ADVANCED_PRICING.vega15ProInputVideoPurchaseUsdPerSecondByResolution["2k"], 0, 8),
      "4k": pricingNumber(vega15ProInputVideoPurchase["4k"], DEFAULT_ADVANCED_PRICING.vega15ProInputVideoPurchaseUsdPerSecondByResolution["4k"], 0, 8),
    },
    seedanceNsfwCreditsPerSecondByResolution: {
      "480p": normalizeStoredCredits(seedanceNsfw["480p"], DEFAULT_ADVANCED_PRICING.seedanceNsfwCreditsPerSecondByResolution["480p"], 6),
      "720p": normalizeStoredCredits(seedanceNsfw["720p"], DEFAULT_ADVANCED_PRICING.seedanceNsfwCreditsPerSecondByResolution["720p"], 6),
    },
    seedanceNsfwVideoCreditsPerSecondByResolution: {
      "480p": normalizeStoredCredits(seedanceNsfwVideo["480p"], DEFAULT_ADVANCED_PRICING.seedanceNsfwVideoCreditsPerSecondByResolution["480p"], 6),
      "720p": normalizeStoredCredits(seedanceNsfwVideo["720p"], DEFAULT_ADVANCED_PRICING.seedanceNsfwVideoCreditsPerSecondByResolution["720p"], 6),
    },
    seedanceCreditsPerSecondByResolution: {
      "480p": normalizeStoredCredits(seedance["480p"], DEFAULT_ADVANCED_PRICING.seedanceCreditsPerSecondByResolution["480p"]),
      "720p": normalizeStoredCredits(seedance["720p"], DEFAULT_ADVANCED_PRICING.seedanceCreditsPerSecondByResolution["720p"]),
      "1080p": normalizeStoredCredits(seedance["1080p"], DEFAULT_ADVANCED_PRICING.seedanceCreditsPerSecondByResolution["1080p"]),
      "4k": normalizeStoredCredits(seedance["4k"], DEFAULT_ADVANCED_PRICING.seedanceCreditsPerSecondByResolution["4k"]),
    },
    seedanceVideoInputCreditsPerSecondByResolution: {
      "480p": normalizeStoredCredits(seedanceVideoInput["480p"], DEFAULT_ADVANCED_PRICING.seedanceVideoInputCreditsPerSecondByResolution["480p"]),
      "720p": normalizeStoredCredits(seedanceVideoInput["720p"], DEFAULT_ADVANCED_PRICING.seedanceVideoInputCreditsPerSecondByResolution["720p"]),
      "1080p": normalizeStoredCredits(seedanceVideoInput["1080p"], DEFAULT_ADVANCED_PRICING.seedanceVideoInputCreditsPerSecondByResolution["1080p"]),
      "4k": normalizeStoredCredits(seedanceVideoInput["4k"], DEFAULT_ADVANCED_PRICING.seedanceVideoInputCreditsPerSecondByResolution["4k"]),
    },
    seedanceFastCreditsPerSecondByResolution: {
      "480p": normalizeSeedanceFastCredits(seedanceFast["480p"], DEFAULT_ADVANCED_PRICING.seedanceFastCreditsPerSecondByResolution["480p"], [8, 9.6, 12, 4.0824]),
      "720p": normalizeSeedanceFastCredits(seedanceFast["720p"], DEFAULT_ADVANCED_PRICING.seedanceFastCreditsPerSecondByResolution["720p"], [20, 19.2, 24, 8.64864]),
    },
    seedanceFastVideoInputCreditsPerSecondByResolution: {
      "480p": normalizeSeedanceFastCredits(seedanceFastVideoInput["480p"], DEFAULT_ADVANCED_PRICING.seedanceFastVideoInputCreditsPerSecondByResolution["480p"], [5, 6.4, 8, 2.4057]),
      "720p": normalizeSeedanceFastCredits(seedanceFastVideoInput["720p"], DEFAULT_ADVANCED_PRICING.seedanceFastVideoInputCreditsPerSecondByResolution["720p"], [10, 12.8, 16, 5.09652]),
    },
    wan30CreditsPerSecondByResolution: {
      "480p": normalizeStoredCredits(wan30["480p"], DEFAULT_ADVANCED_PRICING.wan30CreditsPerSecondByResolution["480p"], 6),
      "720p": normalizeStoredCredits(wan30["720p"], DEFAULT_ADVANCED_PRICING.wan30CreditsPerSecondByResolution["720p"], 6),
      "1080p": normalizeStoredCredits(wan30["1080p"], DEFAULT_ADVANCED_PRICING.wan30CreditsPerSecondByResolution["1080p"], 6),
    },
    wan30PrimeCreditsPerSecondByResolution: {
      "480p": normalizeStoredCredits(wan30Prime["480p"], DEFAULT_ADVANCED_PRICING.wan30PrimeCreditsPerSecondByResolution["480p"], 6),
      "720p": normalizeStoredCredits(wan30Prime["720p"], DEFAULT_ADVANCED_PRICING.wan30PrimeCreditsPerSecondByResolution["720p"], 6),
      "1080p": normalizeStoredCredits(wan30Prime["1080p"], DEFAULT_ADVANCED_PRICING.wan30PrimeCreditsPerSecondByResolution["1080p"], 6),
    },
    wan30ProCreditsPerSecondByResolution: {
      "1080p": normalizeStoredCredits(wan30Pro["1080p"], DEFAULT_ADVANCED_PRICING.wan30ProCreditsPerSecondByResolution["1080p"], 6),
      "2k": normalizeStoredCredits(wan30Pro["2k"], DEFAULT_ADVANCED_PRICING.wan30ProCreditsPerSecondByResolution["2k"], 6),
      "4k": normalizeStoredCredits(wan30Pro["4k"], DEFAULT_ADVANCED_PRICING.wan30ProCreditsPerSecondByResolution["4k"], 6),
    },
    wan30PrimeProCreditsPerSecondByResolution: {
      "1080p": normalizeStoredCredits(wan30PrimePro["1080p"], DEFAULT_ADVANCED_PRICING.wan30PrimeProCreditsPerSecondByResolution["1080p"], 6),
      "2k": normalizeStoredCredits(wan30PrimePro["2k"], DEFAULT_ADVANCED_PRICING.wan30PrimeProCreditsPerSecondByResolution["2k"], 6),
      "4k": normalizeStoredCredits(wan30PrimePro["4k"], DEFAULT_ADVANCED_PRICING.wan30PrimeProCreditsPerSecondByResolution["4k"], 6),
    },
    wan30PurchaseUsdPerSecondByResolution: {
      "480p": pricingNumber(wan30Purchase["480p"], DEFAULT_ADVANCED_PRICING.wan30PurchaseUsdPerSecondByResolution["480p"], 0, 8),
      "720p": pricingNumber(wan30Purchase["720p"], DEFAULT_ADVANCED_PRICING.wan30PurchaseUsdPerSecondByResolution["720p"], 0, 8),
      "1080p": pricingNumber(wan30Purchase["1080p"], DEFAULT_ADVANCED_PRICING.wan30PurchaseUsdPerSecondByResolution["1080p"], 0, 8),
    },
    wan30PrimePurchaseUsdPerSecondByResolution: {
      "480p": pricingNumber(wan30PrimePurchase["480p"], DEFAULT_ADVANCED_PRICING.wan30PrimePurchaseUsdPerSecondByResolution["480p"], 0, 8),
      "720p": pricingNumber(wan30PrimePurchase["720p"], DEFAULT_ADVANCED_PRICING.wan30PrimePurchaseUsdPerSecondByResolution["720p"], 0, 8),
      "1080p": pricingNumber(wan30PrimePurchase["1080p"], DEFAULT_ADVANCED_PRICING.wan30PrimePurchaseUsdPerSecondByResolution["1080p"], 0, 8),
    },
    wan30ProPurchaseUsdPerSecondByResolution: {
      "1080p": pricingNumber(wan30ProPurchase["1080p"], DEFAULT_ADVANCED_PRICING.wan30ProPurchaseUsdPerSecondByResolution["1080p"], 0, 8),
      "2k": pricingNumber(wan30ProPurchase["2k"], DEFAULT_ADVANCED_PRICING.wan30ProPurchaseUsdPerSecondByResolution["2k"], 0, 8),
      "4k": pricingNumber(wan30ProPurchase["4k"], DEFAULT_ADVANCED_PRICING.wan30ProPurchaseUsdPerSecondByResolution["4k"], 0, 8),
    },
    wan30PrimeProPurchaseUsdPerSecondByResolution: {
      "1080p": pricingNumber(wan30PrimeProPurchase["1080p"], DEFAULT_ADVANCED_PRICING.wan30PrimeProPurchaseUsdPerSecondByResolution["1080p"], 0, 8),
      "2k": pricingNumber(wan30PrimeProPurchase["2k"], DEFAULT_ADVANCED_PRICING.wan30PrimeProPurchaseUsdPerSecondByResolution["2k"], 0, 8),
      "4k": pricingNumber(wan30PrimeProPurchase["4k"], DEFAULT_ADVANCED_PRICING.wan30PrimeProPurchaseUsdPerSecondByResolution["4k"], 0, 8),
    },
    wan27CreditsPerSecondByResolution: normalizedWan27Rates,
    happyhorseCreditsPerSecondByResolution: normalizedHappyhorseRates,
    aliyunVideoCreditsPerSecondByCapability,
    aliyunVideoCreditsPerSecondByModel,
    wan27ImagePro: {
      ...wan27ImageDefault,
      ...wan27ImageSource,
      model: String(wan27ImageSource.model || wan27ImageDefault.model || WAN27_IMAGE_PRO_MODEL),
      purchaseCnyPerImage: pricingNumber(wan27ImageSource.purchaseCnyPerImage, wan27ImageDefault.purchaseCnyPerImage ?? WAN27_IMAGE_PRO_PURCHASE_CNY, 0, 6),
      saleCnyPerImage: pricingNumber(wan27ImageSource.saleCnyPerImage, wan27ImageDefault.saleCnyPerImage ?? WAN27_IMAGE_PRO_SALE_CNY, 0, 6),
      resolutions: normalizedImageResolutions,
      ratios: Array.isArray(wan27ImageSource.ratios) && wan27ImageSource.ratios.length ? wan27ImageSource.ratios : wan27ImageDefault.ratios,
      defaultResolution: String(wan27ImageSource.defaultResolution || wan27ImageDefault.defaultResolution || "2K"),
      defaultRatio: String(wan27ImageSource.defaultRatio || wan27ImageDefault.defaultRatio || "9:16"),
    },
    seedream5Image: {
      lite: {
        ...(seedreamDefault.lite || {}),
        ...seedreamLiteSource,
        model: String(seedreamLiteSource.model || seedreamDefault.lite?.model || SEEDREAM5_LITE_ENDPOINT_ID),
        purchaseUsdPerImage: pricingNumber(seedreamLiteSource.purchaseUsdPerImage, seedreamDefault.lite?.purchaseUsdPerImage ?? SEEDREAM5_LITE_USD_PER_IMAGE, 0, 6),
        saleUsdPerImage: pricingNumber(seedreamLiteSource.saleUsdPerImage, seedreamDefault.lite?.saleUsdPerImage ?? seedreamLiteSource.purchaseUsdPerImage ?? SEEDREAM5_LITE_USD_PER_IMAGE, 0, 6),
      },
      pro: {
        ...(seedreamDefault.pro || {}),
        ...seedreamProSource,
        model: String(seedreamProSource.model || seedreamDefault.pro?.model || SEEDREAM5_PRO_ENDPOINT_ID),
        purchaseUsdPerImageByResolution: normalizeSeedreamUsdMap(seedreamProPurchase, seedreamDefault.pro?.purchaseUsdPerImageByResolution || {}),
        saleUsdPerImageByResolution: normalizeSeedreamSaleUsdMap(seedreamProSale, seedreamDefault.pro?.saleUsdPerImageByResolution || seedreamProPurchase || {}),
        referenceUsdPerImageAfterFirst: pricingNumber(
          migrateSeedreamSaleUsd(seedreamProSource.referenceUsdPerImageAfterFirst, SEEDREAM5_PRO_REFERENCE_USD_PER_IMAGE_AFTER_FIRST),
          seedreamDefault.pro?.referenceUsdPerImageAfterFirst ?? SEEDREAM5_PRO_REFERENCE_USD_PER_IMAGE_AFTER_FIRST,
          0,
          6,
        ),
      },
      resolutions: normalizedSeedreamResolutions,
      defaultResolution: normalizeSeedream5Resolution(seedreamSource.defaultResolution || seedreamDefault.defaultResolution || "2K"),
      defaultTier: "pro",
    },
    qwenImage3: {
      pro: normalizeQwenImage3TierPricing("pro"),
      standard: normalizeQwenImage3TierPricing("standard"),
      resolutions: ["1K", "2K"],
      defaultResolution: normalizeQwenImage3Resolution(rawQwenImage3Source.defaultResolution || qwenImage3Default.defaultResolution || "2K"),
      defaultTier: normalizeQwenImage3Tier(rawQwenImage3Source.defaultTier || qwenImage3Default.defaultTier || "pro"),
    },
    qwen37Flash: {
      ...DEFAULT_ADVANCED_PRICING.qwen37Flash,
      ...rawQwen37FlashSource,
      model: QWEN37_FLASH_MODEL,
      inputCnyPerMillionTokens: pricingNumber(
        rawQwen37FlashSource.inputCnyPerMillionTokens,
        DEFAULT_ADVANCED_PRICING.qwen37Flash.inputCnyPerMillionTokens,
        0,
        6,
      ),
      outputCnyPerMillionTokens: pricingNumber(
        rawQwen37FlashSource.outputCnyPerMillionTokens,
        DEFAULT_ADVANCED_PRICING.qwen37Flash.outputCnyPerMillionTokens,
        0,
        6,
      ),
      defaultMaxTokens: Math.floor(clampNumber(
        rawQwen37FlashSource.defaultMaxTokens,
        DEFAULT_ADVANCED_PRICING.qwen37Flash.defaultMaxTokens,
        1,
        QWEN37_FLASH_MAX_OUTPUT_TOKENS,
      )),
      defaultTemperature: clampNumber(
        rawQwen37FlashSource.defaultTemperature,
        DEFAULT_ADVANCED_PRICING.qwen37Flash.defaultTemperature,
        0,
        2,
      ),
      defaultThinking: boolFromRequest(rawQwen37FlashSource.defaultThinking, false),
    },
  };
}

function publicAdvancedPricingView(pricing = {}) {
  const normalized = normalizeAdvancedPricing(pricing);
  const imagePricing = normalized.wan27ImagePro || DEFAULT_ADVANCED_PRICING.wan27ImagePro || {};
  const seedreamPricing = normalized.seedream5Image || DEFAULT_ADVANCED_PRICING.seedream5Image || {};
  const qwenPricing = normalized.qwenImage3 || DEFAULT_ADVANCED_PRICING.qwenImage3 || {};
  const qwen37Pricing = normalized.qwen37Flash || DEFAULT_ADVANCED_PRICING.qwen37Flash || {};
  const imageCostCredits = pricingNumber(
    Number(imagePricing.saleCnyPerImage || 0) * Number(normalized.creditsPerCny || ADVANCED_CREDITS_PER_CNY),
    0,
    0,
    6,
  );
  const view = {
    unit: "credits",
    creditsPerUsd: normalized.creditsPerUsd || DEFAULT_CREDITS_PER_USD,
    creditsPerCny: normalized.creditsPerCny || ADVANCED_CREDITS_PER_CNY,
    modelSettings: { ...normalized.modelSettings },
    seedance25CreditsPerSecondByResolution: { ...normalized.seedance25CreditsPerSecondByResolution },
    h3VegaCreditsPerSecondByResolution: { ...normalized.h3VegaCreditsPerSecondByResolution },
    h3VegaInputVideoCreditsPerSecondByResolution: { ...normalized.h3VegaInputVideoCreditsPerSecondByResolution },
    vega10LiteCreditsPerSecondByResolution: { ...normalized.vega10LiteCreditsPerSecondByResolution },
    vega10LiteInputVideoCreditsPerSecondByResolution: { ...normalized.vega10LiteInputVideoCreditsPerSecondByResolution },
    vega10LiteReferenceImageCreditsEach: normalized.vega10LiteReferenceImageCreditsEach,
    vega10ProCreditsPerSecondByResolution: { ...normalized.vega10ProCreditsPerSecondByResolution },
    vega10ProInputVideoCreditsPerSecondByResolution: { ...normalized.vega10ProInputVideoCreditsPerSecondByResolution },
    vega15ProCreditsPerSecondByResolution: { ...normalized.vega15ProCreditsPerSecondByResolution },
    vega15ProInputVideoCreditsPerSecondByResolution: { ...normalized.vega15ProInputVideoCreditsPerSecondByResolution },
    seedanceNsfwCreditsPerSecondByResolution: { ...normalized.seedanceNsfwCreditsPerSecondByResolution },
    seedanceNsfwVideoCreditsPerSecondByResolution: { ...normalized.seedanceNsfwVideoCreditsPerSecondByResolution },
    seedanceCreditsPerSecondByResolution: { ...normalized.seedanceCreditsPerSecondByResolution },
    seedanceVideoInputCreditsPerSecondByResolution: { ...normalized.seedanceVideoInputCreditsPerSecondByResolution },
    seedanceFastCreditsPerSecondByResolution: { ...normalized.seedanceFastCreditsPerSecondByResolution },
    seedanceFastVideoInputCreditsPerSecondByResolution: { ...normalized.seedanceFastVideoInputCreditsPerSecondByResolution },
    wan30CreditsPerSecondByResolution: { ...normalized.wan30CreditsPerSecondByResolution },
    wan30ProCreditsPerSecondByResolution: { ...normalized.wan30ProCreditsPerSecondByResolution },
    wan30PrimeCreditsPerSecondByResolution: { ...normalized.wan30PrimeCreditsPerSecondByResolution },
    wan30PrimeProCreditsPerSecondByResolution: { ...normalized.wan30PrimeProCreditsPerSecondByResolution },
    wan27CreditsPerSecondByResolution: { ...normalized.wan27CreditsPerSecondByResolution },
    happyhorseCreditsPerSecondByResolution: { ...normalized.happyhorseCreditsPerSecondByResolution },
    aliyunVideoCreditsPerSecondByCapability: {
      "wan-animate-move": { ...normalized.aliyunVideoCreditsPerSecondByCapability["wan-animate-move"] },
      "wan-animate-mix": { ...normalized.aliyunVideoCreditsPerSecondByCapability["wan-animate-mix"] },
    },
    vipeak1Image: {
      model: imagePricing.model || WAN27_IMAGE_PRO_MODEL,
      costCredits: imageCostCredits,
      saleUsdPerImage: pricingNumber(Number(imagePricing.saleCnyPerImage || 0) / INTERNAL_CNY_PER_USD, 0, 0, 6),
      resolutions: imagePricing.resolutions || ["1K", "2K", "4K"],
      ratios: imagePricing.ratios || ["1:1", "3:4", "4:3", "9:16", "16:9"],
      defaultResolution: imagePricing.defaultResolution || "2K",
      defaultRatio: imagePricing.defaultRatio || "9:16",
    },
    seedream5Image: {
      resolutions: seedreamPricing.resolutions || ["1K", "2K"],
      defaultResolution: seedreamPricing.defaultResolution || "2K",
      defaultTier: "pro",
      pro: {
        saleUsdPerImageByResolution: {
          ...(seedreamPricing.pro?.saleUsdPerImageByResolution || DEFAULT_ADVANCED_PRICING.seedream5Image.pro.saleUsdPerImageByResolution),
        },
        referenceUsdPerImageAfterFirst: seedreamPricing.pro?.referenceUsdPerImageAfterFirst ?? SEEDREAM5_PRO_REFERENCE_USD_PER_IMAGE_AFTER_FIRST,
      },
    },
    qwenImage3: {
      resolutions: ["1K", "2K"],
      defaultResolution: qwenPricing.defaultResolution || "2K",
      defaultTier: qwenPricing.defaultTier || "pro",
      pro: {
        saleUsdPerImageByResolution: { ...qwenPricing.pro.saleUsdPerImageByResolution },
        saleUsdPerReferenceImage: qwenPricing.pro.saleUsdPerReferenceImage,
      },
      standard: {
        saleUsdPerImageByResolution: { ...qwenPricing.standard.saleUsdPerImageByResolution },
        saleUsdPerReferenceImage: qwenPricing.standard.saleUsdPerReferenceImage,
      },
    },
    qwen37Flash: {
      model: QWEN37_FLASH_MODEL,
      inputCnyPerMillionTokens: qwen37Pricing.inputCnyPerMillionTokens,
      outputCnyPerMillionTokens: qwen37Pricing.outputCnyPerMillionTokens,
      defaultMaxTokens: qwen37Pricing.defaultMaxTokens,
      defaultTemperature: qwen37Pricing.defaultTemperature,
      defaultThinking: qwen37Pricing.defaultThinking === true,
    },
    rows: publicAdvancedPricingRows(normalized),
  };
  const selectiveAliyunExposureEnabled = PUBLIC_WAN30_MODEL_EXPOSURE_ENABLED
    || PUBLIC_WAN27_MODEL_EXPOSURE_ENABLED
    || PUBLIC_HAPPYHORSE_MODEL_EXPOSURE_ENABLED
    || PUBLIC_QWEN_IMAGE3_EXPOSURE_ENABLED;
  if (!PUBLIC_ALIYUN_MODEL_EXPOSURE_ENABLED && !selectiveAliyunExposureEnabled) {
    delete view.wan30CreditsPerSecondByResolution;
    delete view.wan30ProCreditsPerSecondByResolution;
    delete view.wan30PrimeCreditsPerSecondByResolution;
    delete view.wan30PrimeProCreditsPerSecondByResolution;
    delete view.wan27CreditsPerSecondByResolution;
    delete view.happyhorseCreditsPerSecondByResolution;
    delete view.aliyunVideoCreditsPerSecondByCapability;
    delete view.vipeak1Image;
    delete view.qwenImage3;
  } else if (!PUBLIC_ALIYUN_MODEL_EXPOSURE_ENABLED) {
    if (!PUBLIC_WAN30_MODEL_EXPOSURE_ENABLED) {
      delete view.wan30CreditsPerSecondByResolution;
      delete view.wan30ProCreditsPerSecondByResolution;
      delete view.wan30PrimeCreditsPerSecondByResolution;
      delete view.wan30PrimeProCreditsPerSecondByResolution;
    }
    if (!PUBLIC_WAN27_MODEL_EXPOSURE_ENABLED) {
      delete view.wan27CreditsPerSecondByResolution;
      delete view.vipeak1Image;
      delete view.aliyunVideoCreditsPerSecondByCapability;
    }
    if (!PUBLIC_HAPPYHORSE_MODEL_EXPOSURE_ENABLED) delete view.happyhorseCreditsPerSecondByResolution;
    if (!PUBLIC_QWEN_IMAGE3_EXPOSURE_ENABLED) delete view.qwenImage3;
  }
  delete view.happyhorseCreditsPerSecondByResolution;
  return view;
}

function publicCharacterPageFromItems(items = [], auth = null, paging = {}) {
  const list = (Array.isArray(items) ? items : []).filter((item) => item && !isSoftDeleted(item));
  let filtered = list;
  const q = String(paging.q || "").trim().toLowerCase();
  const characterId = String(paging.characterId || "").trim();
  if (characterId) {
    filtered = filtered.filter((item) => String(item.id || "") === characterId);
  } else if (q) {
    filtered = filtered.filter((item) => [
      item.id,
      item.name,
      item.title,
      item.description,
      item.gender,
      item.style,
      item.model,
      item.creatorUsername,
      ...(Array.isArray(item.tags) ? item.tags : []),
    ].some((value) => String(value || "").toLowerCase().includes(q)));
  }
  const paged = pagedResponse(filtered, {
    page: paging.page || 1,
    limit: paging.limit || PUBLIC_CHARACTER_PAGE_SIZE,
  });
  return {
    items: paged.items.map((item) => publicHomeVideoItem(item, auth)),
    page: paged.page,
    limit: paged.limit,
    total: paged.total,
    totalPages: paged.totalPages,
    hasMore: paged.page < paged.totalPages,
  };
}

function publicTenantFeatures(tenant = {}) {
  return {
    tenantPublic: Boolean(tenant.tenantPublic),
    tenantMode: tenant.tenantMode || "platform",
    tenantId: normalizeTenantId(tenant.tenantId || DEFAULT_TENANT_ID),
    toolOnly: Boolean(tenant.toolOnly),
    toolId: tenant.toolId || "",
    brand: tenant.brand || "",
    title: tenant.title || "",
    defaultTab: tenant.defaultTab || "gallery",
    defaultGalleryMode: tenant.defaultGalleryMode || "characters",
    allowedTabs: Array.isArray(tenant.allowedTabs) ? tenant.allowedTabs : [],
    allowedGalleryModes: Array.isArray(tenant.allowedGalleryModes) ? tenant.allowedGalleryModes : [],
    hiddenNavTabs: Array.isArray(tenant.hiddenNavTabs) ? tenant.hiddenNavTabs : [],
    defaultRoute: tenant.defaultRoute || "",
    navHome: Boolean(tenant.navHome),
    disabledTabs: Array.isArray(tenant.disabledTabs) ? tenant.disabledTabs : [],
    apiAccess: tenant.apiAccess !== false,
    aliyunModels: PUBLIC_ALIYUN_MODEL_EXPOSURE_ENABLED,
    aliyunWan30Models: PUBLIC_WAN30_MODEL_EXPOSURE_ENABLED,
    aliyunWan27Models: PUBLIC_WAN27_MODEL_EXPOSURE_ENABLED,
    aliyunHappyHorseModels: PUBLIC_HAPPYHORSE_MODEL_EXPOSURE_ENABLED,
    aliyunQwenImage3Models: PUBLIC_QWEN_IMAGE3_EXPOSURE_ENABLED,
    assetLibrary: tenant.assetLibrary !== false,
    accountMenu: tenant.accountMenu !== false,
    subscriptions: Boolean(tenant.subscriptions),
    membershipProgram: Boolean(tenant.membershipProgram),
    videoProvider: tenant.videoProvider || "",
    siteProfile: tenant.siteProfile || "",
  };
}

