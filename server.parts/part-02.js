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

function publicUrlForAssetPath(localUrl = "") {
  const value = String(localUrl || "").trim();
  if (!value) return "";
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
      const publicUrl = publicUrlForAssetPath(text);
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

function isSoftDeleted(record) {
  return Boolean(record?.deletedAt);
}

async function writeDb(db) {
  return withAppStateWriteLock(() => replaceAppDbTables(db));
}

async function createSingleLoginSession(db, user, tenantId = DEFAULT_TENANT_ID) {
  const now = new Date().toISOString();
  const session = {
    token: crypto.randomBytes(32).toString("hex"),
    userId: String(user?.id || ""),
    tenantId: normalizeTenantId(tenantId),
    accountKey: loginAccountKey(user),
    createdAt: now,
    updatedAt: now,
  };
  if (!session.userId) throw new Error("Cannot create a login session without a user.");
  if (String(user?.role || "") === "admin") {
    db.sessions = Array.isArray(db.sessions) ? db.sessions : [];
    db.sessions.push(session);
    if (dbEnabled()) await createSessionInDb(session);
    else await writeDb(db);
    return session;
  }
  db.sessions = (db.sessions || []).filter((item) => (
    String(item.userId || "") !== session.userId
    && (!session.accountKey || String(item.accountKey || "") !== session.accountKey)
  ));
  db.sessions.push(session);
  if (dbEnabled()) await replaceUserSessionInDb(session);
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

function normalizeAdvancedPricing(pricing = {}) {
  const source = pricing && typeof pricing === "object" && !Array.isArray(pricing) ? pricing : {};
  const seedance25 = source.seedance25CreditsPerSecondByResolution && typeof source.seedance25CreditsPerSecondByResolution === "object"
    ? source.seedance25CreditsPerSecondByResolution
    : {};
  const h3Vega = source.h3VegaCreditsPerSecondByResolution && typeof source.h3VegaCreditsPerSecondByResolution === "object"
    ? source.h3VegaCreditsPerSecondByResolution
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
    const migratedValue = Number.isFinite(numeric) && [previousDefault, previousRoundedDefault, previousIntegerDefault, previousLegacyUiDefault].some((candidate) => Math.abs(numeric - candidate) < 0.0000001)
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
  const normalizeSeedreamUsdMap = (sourceMap = {}, fallbackMap = {}) => ({
    "1K": pricingNumber(firstPresent(sourceMap["1K"], sourceMap["1k"]), fallbackMap["1K"] ?? SEEDREAM5_PRO_1K_USD_PER_IMAGE, 0, 6),
    "2K": pricingNumber(firstPresent(sourceMap["2K"], sourceMap["2k"]), fallbackMap["2K"] ?? SEEDREAM5_PRO_2K_USD_PER_IMAGE, 0, 6),
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
    return {
      ...defaultTier,
      ...sourceTier,
      model: qwenImage3ModelForTier(tier, sourceTier.model || defaultTier.model),
      purchaseUsdPerImageByResolution: {
        "1K": pricingNumber(firstPresent(purchaseMap["1K"], purchaseMap["1k"]), defaultTier.purchaseUsdPerImageByResolution?.["1K"] ?? official.outputPerImage["1K"], 0, 6),
        "2K": pricingNumber(firstPresent(purchaseMap["2K"], purchaseMap["2k"]), defaultTier.purchaseUsdPerImageByResolution?.["2K"] ?? official.outputPerImage["2K"], 0, 6),
      },
      saleUsdPerImageByResolution: {
        "1K": pricingNumber(firstPresent(saleMap["1K"], saleMap["1k"]), defaultTier.saleUsdPerImageByResolution?.["1K"] ?? purchaseMap["1K"] ?? official.outputPerImage["1K"], 0, 6),
        "2K": pricingNumber(firstPresent(saleMap["2K"], saleMap["2k"]), defaultTier.saleUsdPerImageByResolution?.["2K"] ?? purchaseMap["2K"] ?? official.outputPerImage["2K"], 0, 6),
      },
      purchaseUsdPerReferenceImage: pricingNumber(sourceTier.purchaseUsdPerReferenceImage, defaultTier.purchaseUsdPerReferenceImage ?? official.inputPerReferenceImage, 0, 6),
      saleUsdPerReferenceImage: pricingNumber(sourceTier.saleUsdPerReferenceImage, defaultTier.saleUsdPerReferenceImage ?? sourceTier.purchaseUsdPerReferenceImage ?? official.inputPerReferenceImage, 0, 6),
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
    seedance25CreditsPerSecondByResolution: {
      "480p": normalizeSeedance25Credits(seedance25["480p"], DEFAULT_ADVANCED_PRICING.seedance25CreditsPerSecondByResolution["480p"], "480p"),
      "720p": normalizeSeedance25Credits(seedance25["720p"], DEFAULT_ADVANCED_PRICING.seedance25CreditsPerSecondByResolution["720p"], "720p"),
    },
    h3VegaCreditsPerSecondByResolution: {
      "480p": normalizeStoredCredits(h3Vega["480p"], 0, 6),
      "720p": normalizeStoredCredits(h3Vega["720p"], 0, 6),
      "1080p": normalizeStoredCredits(h3Vega["1080p"], 0, 6),
      "2k": normalizeStoredCredits(h3Vega["2k"], 0, 6),
      "4k": normalizeStoredCredits(h3Vega["4k"], 0, 6),
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
      "480p": normalizeStoredCredits(seedanceFast["480p"], DEFAULT_ADVANCED_PRICING.seedanceFastCreditsPerSecondByResolution["480p"]),
      "720p": normalizeStoredCredits(seedanceFast["720p"], DEFAULT_ADVANCED_PRICING.seedanceFastCreditsPerSecondByResolution["720p"]),
    },
    seedanceFastVideoInputCreditsPerSecondByResolution: {
      "480p": normalizeStoredCredits(seedanceFastVideoInput["480p"], DEFAULT_ADVANCED_PRICING.seedanceFastVideoInputCreditsPerSecondByResolution["480p"]),
      "720p": normalizeStoredCredits(seedanceFastVideoInput["720p"], DEFAULT_ADVANCED_PRICING.seedanceFastVideoInputCreditsPerSecondByResolution["720p"]),
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
        saleUsdPerImageByResolution: normalizeSeedreamUsdMap(seedreamProSale, seedreamDefault.pro?.saleUsdPerImageByResolution || seedreamProPurchase || {}),
        referenceUsdPerImageAfterFirst: pricingNumber(seedreamProSource.referenceUsdPerImageAfterFirst, seedreamDefault.pro?.referenceUsdPerImageAfterFirst ?? SEEDREAM5_PRO_REFERENCE_USD_PER_IMAGE_AFTER_FIRST, 0, 6),
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
    seedance25CreditsPerSecondByResolution: { ...normalized.seedance25CreditsPerSecondByResolution },
    h3VegaCreditsPerSecondByResolution: { ...normalized.h3VegaCreditsPerSecondByResolution },
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

