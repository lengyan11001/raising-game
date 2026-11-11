function creatorMembershipPayload(user = {}) {
  return user.membership && typeof user.membership === "object" ? user.membership : {};
}

function userHasCreatorMembership(user = {}) {
  const membership = creatorMembershipPayload(user || {});
  return membership.status === "active" && Boolean(membership.activatedAt || membership.source);
}

const SHOWCASE_CASES_PREVIEW_LIMIT = 2;
let showcaseCasesCache = null;

const SHOWCASE_CASE_TITLE_TERMS = {
  scenes: [
    { zh: "便利店后巷", en: "Convenience-store alley", needles: ["便利店后巷", "convenience store alley", "convenience-store alley"] },
    { zh: "水族馆", en: "Aquarium", needles: ["水族馆", "aquarium"] },
    { zh: "图书馆", en: "Library", needles: ["图书馆", "library"] },
    { zh: "便利店", en: "Convenience store", needles: ["便利店", "convenience store"] },
    { zh: "排练室", en: "Rehearsal room", needles: ["排练室", "练舞室", "ballet studio", "rehearsal room"] },
    { zh: "摄影棚", en: "Photo studio", needles: ["摄影棚", "photo studio", "photography studio"] },
    { zh: "楼梯间", en: "Stairwell", needles: ["楼梯间", "楼梯", "stairwell", "staircase"] },
    { zh: "淋浴间", en: "Shower", needles: ["淋浴", "shower"] },
    { zh: "办公室", en: "Office", needles: ["办公室", "office"] },
    { zh: "天台", en: "Rooftop", needles: ["天台", "屋顶", "rooftop"] },
    { zh: "厨房", en: "Kitchen", needles: ["厨房", "kitchen"] },
    { zh: "和室", en: "Tatami room", needles: ["和室", "榻榻米", "tatami"] },
    { zh: "教室", en: "Classroom", needles: ["教室", "classroom"] },
    { zh: "地铁", en: "Subway", needles: ["地铁", "subway"] },
    { zh: "酒店", en: "Hotel", needles: ["酒店", "hotel"] },
    { zh: "浴室", en: "Bathroom", needles: ["浴室", "bathroom"] },
    { zh: "卧室内", en: "Bedroom", needles: ["卧室", "bedroom"] },
    { zh: "床上", en: "On the bed", needles: ["床上", "床单", "床沿", "on the bed", "bed sheet", "bedroom"] },
    { zh: "溪流", en: "Forest creek", needles: ["溪流", "密林", "forest stream", "creek"] },
    { zh: "海滩", en: "Beach", needles: ["海滩", "沙滩", "beach"] },
    { zh: "车内", en: "In the car", needles: ["车内", "车里", "in the car", "car interior"] },
    { zh: "电梯", en: "Elevator", needles: ["电梯", "elevator"] },
  ],
  actions: [
    { zh: "肛交", en: "Anal", tags: ["anal"] },
    { zh: "深喉", en: "Deep throat", tags: ["blowjob"] },
    { zh: "乳交", en: "Titfuck", tags: ["titfuck"] },
    { zh: "后入", en: "Doggy", tags: ["doggy"] },
    { zh: "女上位", en: "Cowgirl", tags: ["cowgirl"] },
    { zh: "传教士", en: "Missionary", tags: ["missionary"] },
    { zh: "射精", en: "Cumshot", tags: ["cumshot"] },
    { zh: "自慰", en: "Masturbation", tags: ["masturbation"] },
    { zh: "单人姿势", en: "Solo pose", tags: ["solo"] },
    { zh: "换脸", en: "Face swap", needles: ["换脸", "face swap"] },
    { zh: "视频换人", en: "Video person swap", needles: ["视频换人", "换人", "person replacement"] },
    { zh: "肛交", en: "Anal", needles: ["肛交", "肛门", "anal"] },
    { zh: "口爆", en: "Oral finish", needles: ["口爆", "射在嘴里", "oral cumshot"] },
    { zh: "乳交", en: "Titfuck", needles: ["乳交", "乳沟", "titfuck", "between her breasts"] },
    { zh: "深喉", en: "Deep throat", needles: ["深喉", "顶到喉咙", "deep throat", "throat"] },
    { zh: "后入", en: "Doggy", needles: ["后入", "从背后", "背后插入", "rear entry", "doggy"] },
    { zh: "女上位", en: "Cowgirl", needles: ["女上位", "跨坐", "骑乘", "cowgirl", "riding"] },
    { zh: "传教士", en: "Missionary", needles: ["传教士", "missionary"] },
    { zh: "自慰", en: "Masturbation", needles: ["自慰", "手指插入", "masturbat", "fingers inside"] },
    { zh: "口交", en: "Oral", needles: ["口交", "含住", "oral", "mouth around"] },
    { zh: "射精", en: "Cumshot", needles: ["射精", "精液", "cumshot", "ejaculat"] },
    { zh: "换装", en: "Outfit change", needles: ["脱去所有衣物", "移除所有衣物", "undress", "remove all clothing"] },
    { zh: "单人姿势", en: "Solo pose", needles: ["改变姿势", "change pose", "solo"] },
  ],
  framings: [
    { zh: "极度特写", en: "Extreme close-up", needles: ["极度特写", "极端特写", "extreme close-up"] },
    { zh: "俯拍", en: "Top-down", needles: ["俯拍", "向下拍摄", "top-down", "looking down"] },
    { zh: "仰拍", en: "Low angle", needles: ["仰拍", "低角度", "low-angle", "looking up"] },
    { zh: "特写", en: "Close-up", needles: ["特写", "close-up", "close shot"] },
    { zh: "POV", en: "POV", needles: ["pov", "第一人称", "第一视角", "first-person"] },
    { zh: "侧视", en: "Side view", needles: ["侧视", "侧面", "side view", "profile"] },
    { zh: "背影", en: "Rear view", needles: ["背对镜头", "背影", "from behind", "rear view"] },
    { zh: "偷拍感", en: "Voyeur", needles: ["偷拍", "偷窥", "voyeur"] },
    { zh: "长镜头", en: "Long take", needles: ["长镜头", "long take"] },
  ],
  styles: [
    { zh: "新海诚动画", en: "Makoto Shinkai anime", needles: ["新海诚", "makoto shinkai"] },
    { zh: "赛璐珞动画", en: "Cel animation", needles: ["赛璐珞", "cel animation"] },
    { zh: "2D 手绘", en: "2D hand-drawn", needles: ["2d手绘", "2d动画", "2d hand-drawn", "2d animation"] },
    { zh: "复古数码", en: "Retro digital", needles: ["复古数码", "复古数字", "retro digital"] },
    { zh: "胶片", en: "Film look", needles: ["35mm", "胶片", "film look"] },
    { zh: "超写实", en: "Photoreal", needles: ["超写实", "照片级", "photoreal", "hyper-real"] },
  ],
};

function showcaseCaseTitleTerm(source, terms) {
  const text = String(source || "").toLowerCase();
  return terms.find((term) => (term.needles || []).some((needle) => text.includes(String(needle).toLowerCase()))) || null;
}

function showcaseCaseTagAction(item = {}) {
  const tags = new Set(Array.isArray(item.tags) ? item.tags.map((tag) => String(tag).toLowerCase()) : []);
  return SHOWCASE_CASE_TITLE_TERMS.actions.find((term) => term.tags?.some((tag) => tags.has(tag))) || null;
}

function showcaseCaseTitle(item = {}, language = "zh") {
  const lang = language === "en" ? "en" : "zh";
  const source = [
    item.prompt_zh,
    item.prompt_en,
    item.prompt,
    ...(Array.isArray(item.tags) ? item.tags : []),
  ].filter(Boolean).join("\n");
  const pick = (key) => showcaseCaseTitleTerm(source, SHOWCASE_CASE_TITLE_TERMS[key]);
  const scene = pick("scenes");
  const action = pick("actions") || showcaseCaseTagAction(item);
  const framing = pick("framings");
  const style = pick("styles");
  const category = lang === "zh"
    ? ({ image_gen: "文生图", i2v: "图生视频", image_edit: "图像编辑", swap: "视频换人" }[item.category] || "创作案例")
    : ({ image_gen: "Text to image", i2v: "Image to video", image_edit: "Image edit", swap: "Person swap" }[item.category] || "Creative case");
  const parts = [scene, action, framing || style].filter(Boolean).map((term) => term[lang]);
  if (!parts.length) parts.push(category);
  if (parts.length === 1 && style && style !== framing) parts.push(style[lang]);
  if (parts.length < 2) parts.push(category);
  const id = Number(item.id);
  return `${parts.slice(0, 3).join(" · ")}${Number.isFinite(id) ? ` · #${id}` : ""}`;
}

async function readShowcaseCases() {
  if (Array.isArray(showcaseCasesCache)) return showcaseCasesCache;
  const parsed = await listCatalogEntriesFromDb("showcase_cases");
  showcaseCasesCache = Array.isArray(parsed) ? parsed : [];
  return showcaseCasesCache;
}

function showcaseCasesView(items = [], unlocked = false) {
  const byCategory = {};
  items.forEach((item) => {
    const category = String(item?.category || "").trim();
    if (!category) return;
    byCategory[category] = (byCategory[category] || 0) + 1;
  });
  const totals = { all: items.length, byCategory };
  if (unlocked) {
    return {
      items: items.map((item) => ({
        ...item,
        title_zh: showcaseCaseTitle(item, "zh"),
        title_en: showcaseCaseTitle(item, "en"),
        locked: false,
      })),
      totals,
      previewCount: items.length,
      lockedCount: 0,
    };
  }
  const categoryCounts = {};
  let previewCount = 0;
  let lockedCount = 0;
  const visibleItems = items.map((item) => {
    const category = String(item?.category || "").trim();
    if (!category) return null;
    categoryCounts[category] = (categoryCounts[category] || 0) + 1;
    if (categoryCounts[category] <= SHOWCASE_CASES_PREVIEW_LIMIT) {
      previewCount += 1;
      return {
        ...item,
        title_zh: showcaseCaseTitle(item, "zh"),
        title_en: showcaseCaseTitle(item, "en"),
        locked: false,
      };
    }
    lockedCount += 1;
    return {
      id: item.id,
      created_at_str: item.created_at_str,
      model_key: item.model_key,
      model_label: item.model_label,
      category: item.category,
      category_label: item.category_label,
      title_zh: showcaseCaseTitle(item, "zh"),
      title_en: showcaseCaseTitle(item, "en"),
      locked: true,
    };
  }).filter(Boolean);
  return { items: visibleItems, totals, previewCount, lockedCount };
}

function userHasApiDocsAccess(user = {}) {
  const entitlement = user.apiDocsAccess && typeof user.apiDocsAccess === "object" ? user.apiDocsAccess : {};
  return entitlement.status === "active" && Boolean(entitlement.grantedAt || entitlement.orderId);
}

function publicCreatorMembership(user = {}) {
  const membership = creatorMembershipPayload(user);
  return {
    active: userHasCreatorMembership(user),
    status: userHasCreatorMembership(user) ? "active" : "inactive",
    planId: membership.planId || CREATOR_MEMBERSHIP_PLAN_ID,
    activatedAt: String(membership.activatedAt || ""),
    source: String(membership.source || ""),
  };
}

function publicApiDocsEntitlement(user = {}) {
  const entitlement = user.apiDocsAccess && typeof user.apiDocsAccess === "object" ? user.apiDocsAccess : {};
  return {
    active: userHasApiDocsAccess(user),
    status: userHasApiDocsAccess(user) ? "active" : "locked",
    productId: API_DOCS_PRODUCT_ID,
    grantedAt: String(entitlement.grantedAt || ""),
  };
}

async function activateCreatorMembership(db, user, { source = "payment", orderId = "", codeId = "", referralCount = 0 } = {}) {
  if (!user) return null;
  const now = new Date().toISOString();
  const current = creatorMembershipPayload(user);
  user.membership = {
    ...current,
    status: "active",
    planId: CREATOR_MEMBERSHIP_PLAN_ID,
    activatedAt: current.activatedAt || now,
    source: current.source || source,
    orderId: current.orderId || orderId,
    codeId: current.codeId || codeId,
    referralCount: Math.max(Number(current.referralCount || 0), Number(referralCount || 0)),
    updatedAt: now,
  };
  user.updatedAt = now;
  if (dbEnabled()) {
    const saved = await patchUserPayloadInDb(user.id, {
      membership: user.membership,
      updatedAt: user.updatedAt,
    });
    if (saved) Object.assign(user, saved);
    const existing = await getUserSubscriptionInDb(user.id, DEFAULT_TENANT_ID);
    await upsertUserSubscriptionInDb({
      ...existing,
      id: existing?.id || randomId("sub"),
      tenantId: DEFAULT_TENANT_ID,
      userId: user.id,
      planId: CREATOR_MEMBERSHIP_PLAN_ID,
      planName: "Creator Membership",
      status: "active",
      currentPeriodStart: existing?.currentPeriodStart || now,
      currentPeriodEnd: "",
      cancelAtPeriodEnd: false,
      provider: source,
      lastOrderId: orderId || existing?.lastOrderId || "",
      activationCodeId: codeId || existing?.activationCodeId || "",
      updatedAt: now,
      createdAt: existing?.createdAt || now,
    });
  }
  return user;
}

async function grantApiDocsAccess(db, user, { orderId = "", source = "payment" } = {}) {
  if (!user) return null;
  const now = new Date().toISOString();
  const current = user.apiDocsAccess && typeof user.apiDocsAccess === "object" ? user.apiDocsAccess : {};
  user.apiDocsAccess = {
    ...current,
    status: "active",
    productId: API_DOCS_PRODUCT_ID,
    grantedAt: current.grantedAt || now,
    source: current.source || source,
    orderId: current.orderId || orderId,
    updatedAt: now,
  };
  user.updatedAt = now;
  if (dbEnabled()) {
    const saved = await patchUserPayloadInDb(user.id, {
      apiDocsAccess: user.apiDocsAccess,
      updatedAt: user.updatedAt,
    });
    if (saved) Object.assign(user, saved);
  }
  return user;
}

function publicBillingPlan(plan = {}) {
  return {
    id: String(plan.id || ""),
    name: String(plan.name || "Pro"),
    currency: String(plan.currency || "USD").toUpperCase(),
    amount: creditsAmount(plan.amount || 0),
    intervalUnit: String(plan.intervalUnit || "month"),
    intervalCount: Math.max(1, Math.trunc(Number(plan.intervalCount || 1) || 1)),
    includedCredits: creditsAmount(plan.includedCredits || 0),
    lifetime: String(plan.intervalUnit || "").toLowerCase() === "lifetime",
    benefits: Array.isArray(plan.benefits) ? plan.benefits : [],
  };
}

function publicBillingSubscription(subscription = null, plan = null) {
  if (!subscription) return null;
  const periodEnd = String(subscription.currentPeriodEnd || "");
  const expired = periodEnd && Date.parse(periodEnd) <= Date.now();
  return {
    id: String(subscription.id || ""),
    planId: String(subscription.planId || ""),
    planName: String(plan?.name || subscription.planName || "Pro"),
    status: expired ? "expired" : String(subscription.status || "active"),
    currentPeriodStart: String(subscription.currentPeriodStart || ""),
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: Boolean(subscription.cancelAtPeriodEnd),
  };
}

const DEFAULT_TOOL_TOPUP_PACKAGES = Object.freeze([
  Object.freeze({ amount: 10, credits: 1000 }),
  Object.freeze({ amount: 20, credits: 2060 }),
  Object.freeze({ amount: 30, credits: 3180 }),
  Object.freeze({ amount: 50, credits: 5500 }),
  Object.freeze({ amount: 80, credits: 9000 }),
  Object.freeze({ amount: 100, credits: 11500 }),
]);

function toolTopupPackagesForPlan(plan = null) {
  const creditsPerUsd = Math.max(1, Number(plan?.topupCreditsPerUsd || DEFAULT_CREDITS_PER_USD) || DEFAULT_CREDITS_PER_USD);
  const explicit = Array.isArray(plan?.topupPackages) ? plan.topupPackages : [];
  const source = explicit.length
    ? explicit.map((item) => ({
      amount: Math.max(1, Math.round(Number(item?.amount || 0))),
      credits: creditsAmount(item?.credits),
    })).filter((item) => item.amount > 0 && item.credits > 0)
    : (Array.isArray(plan?.topupQuickAmounts) && plan.topupQuickAmounts.length
      ? plan.topupQuickAmounts.map((value) => {
        const amount = Math.max(1, Math.round(Number(value || 0)));
        return { amount, credits: creditsAmount(amount * creditsPerUsd) };
      }).filter((item) => item.amount > 0)
      : DEFAULT_TOOL_TOPUP_PACKAGES.map((item) => ({ amount: item.amount, credits: item.credits })));
  return source
    .filter((item, index, list) => list.findIndex((other) => other.amount === item.amount) === index)
    .slice(0, 6)
    .map((item) => ({
      id: `tool-usd-${item.amount}`,
      amount: item.amount,
      credits: creditsAmount(item.credits),
      bonusCredits: creditsAmount(Math.max(0, item.credits - item.amount * creditsPerUsd)),
      currency: "USD",
    }));
}

async function billingViewForRequest(req, auth = null) {
  const tenant = requestTenantDescriptor(req);
  const membershipProgram = Boolean(tenant.membershipProgram);
  if (!tenant.subscriptions && !membershipProgram) return { enabled: false, plans: [], subscription: null };
  const allPlans = await listBillingPlansInDb(tenant.tenantId);
  const plans = tenant.toolId === "live"
    ? allPlans.filter((plan) => /^plan-tool-chat-(weekly|monthly|quarterly|yearly)$/.test(plan.id))
    : membershipProgram
    ? allPlans.filter((plan) => plan.id === CREATOR_MEMBERSHIP_PLAN_ID)
    : allPlans;
  const primaryPlan = plans[0] || null;
  const subscription = auth?.user
    ? await getUserSubscriptionInDb(auth.user.id, tenant.tenantId)
    : null;
  return {
    enabled: true,
    tenantId: tenant.tenantId,
    membershipProgram,
    plans: plans.map(publicBillingPlan),
    subscription: publicBillingSubscription(subscription, plans.find((plan) => plan.id === subscription?.planId) || primaryPlan),
    membership: auth?.user ? publicCreatorMembership(auth.user) : publicCreatorMembership(),
    apiDocs: auth?.user ? publicApiDocsEntitlement(auth.user) : publicApiDocsEntitlement(),
    products: [],
    topupPackages: membershipProgram ? publicTopupPackages(auth?.user || null) : toolTopupPackagesForPlan(primaryPlan),
    recurringPaymentReady: false,
  };
}

async function attachBillingViewToPublicConfig(view = {}, req, auth = null) {
  const billing = await billingViewForRequest(req, auth);
  view.billing = billing;
  if (billing.enabled && view.wallet) view.wallet.topupPackages = billing.topupPackages;
  return view;
}

function publicConfig(config, origin = "", auth = null, tenantOptions = null) {
  const homeVideo = normalizeHomeVideo(config.homeVideo || {});
  const characterPage = publicCharacterPageFromItems(homeVideo.items, auth, {
    page: 1,
    limit: PUBLIC_CHARACTER_PAGE_SIZE,
  });
  const platform = normalizePlatformConfig(config.platform || {});
  const tenant = tenantOptions?.tenant || tenantOptions || tenantDescriptorFromOrigin(origin);
  const tenantPublic = Boolean(tenant.tenantPublic);
  const walletOptions = publicWalletOptions(config.wallet || {}, { tenantPublic });
  const publicWalletDefault = walletOptions[0] || {};
  const publicPlatform = {
    ...platform,
    brand: tenant.brand || platform.brand,
    accessCopy: tenantScopedAccessCopy(isLegacyAccessCopy(platform.accessCopy) ? DEFAULT_CONFIG.platform.accessCopy : platform.accessCopy, origin),
  };
  if (!PUBLIC_ALIYUN_MODEL_EXPOSURE_ENABLED) {
    publicPlatform.advanced = {
      ...publicPlatform.advanced,
      cases: (publicPlatform.advanced?.cases || []).filter((item) => !publicAliyunModelHidden(
        item.provider || item.model || item.params?.provider || item.params?.modelProvider || item.params?.model_provider || item.params?.model,
      )),
    };
  }
  if (tenantPublic) {
    publicPlatform.advanced = {
      ...publicPlatform.advanced,
      cases: (publicPlatform.advanced?.cases || []).map((item) => {
        const { creditsPerSecond, pricing, ...safeItem } = item;
        return safeItem;
      }),
    };
  }
  const normalizedAdvancedPricing = normalizeAdvancedPricing(publicPlatform.advancedPricing);
  const assetImageModifyPricing = normalizedAdvancedPricing.wan27ImagePro || DEFAULT_ADVANCED_PRICING.wan27ImagePro;
  publicPlatform.advancedPricing = publicAdvancedPricingView(normalizedAdvancedPricing);
  const view = {
    auth: {
      email: { enabled: EMAIL_LOGIN_ENABLED },
      google: {
        enabled: GOOGLE_LOGIN_ENABLED && Boolean(GOOGLE_LOGIN_CLIENT_ID),
        clientId: GOOGLE_LOGIN_ENABLED ? GOOGLE_LOGIN_CLIENT_ID : "",
      },
    },
    defaultCompanionId: config.defaultCompanionId,
    prices: { ...config.prices, unlockVideo: CHARACTER_UNLOCK_COST_CREDITS },
    tenantFeatures: publicTenantFeatures(tenant),
    assetImageModify: (PUBLIC_ALIYUN_MODEL_EXPOSURE_ENABLED || PUBLIC_WAN27_MODEL_EXPOSURE_ENABLED) ? {
      model: assetImageModifyPricing.model || WAN27_IMAGE_PRO_MODEL,
      costCredits: pricingNumber(Number(assetImageModifyPricing.saleCnyPerImage || 0) * Number(normalizedAdvancedPricing.creditsPerCny || ADVANCED_CREDITS_PER_CNY), 0, 0, 6),
      saleUsdPerImage: pricingNumber(Number(assetImageModifyPricing.saleCnyPerImage || 0) / INTERNAL_CNY_PER_USD, 0, 0, 6),
      resolutions: (assetImageModifyPricing.resolutions || ["1K", "2K", "4K"]).filter((item) => String(item || "").toUpperCase() !== "4K"),
      ratios: assetImageModifyPricing.ratios || ["1:1", "3:4", "4:3", "9:16", "16:9"],
      defaultResolution: assetImageModifyPricing.defaultResolution || "2K",
      defaultRatio: assetImageModifyPricing.defaultRatio || "9:16",
    } : {},
    wallet: {
      asset: publicWalletDefault.asset || config.wallet.asset,
      network: publicWalletDefault.network || config.wallet.network,
      address: publicWalletDefault.address || config.wallet.address,
      qrUrl: publicWalletDefault.qrUrl || config.wallet.qrUrl || "",
      explorerUrl: publicWalletDefault.explorerUrl || config.wallet.explorerUrl || "",
      options: walletOptions,
      suffixDigits: config.wallet.suffixDigits,
      creditsPerUsd: walletCreditsPerUsd(config.wallet),
      topupPackages: publicTopupPackages(auth?.user || null),
    },
    video: config.video,
    // The template gallery is large (hundreds of prompt/media records). It
    // is loaded on demand from /api/platform/playflux-templates so the first
    // page bootstrap stays small and fast.
    playfluxTemplates: [],
    homeVideo: {
      provider: homeVideo.provider || "seedance",
      posterUrl: homeVideo.posterUrl || "",
      videoUrl: homeVideo.videoUrl || "",
      taskId: homeVideo.taskId || "",
      status: homeVideo.status || "",
      referenceAssetUri: homeVideo.referenceAssetUri || "",
      activeItemId: homeVideo.activeItemId || "",
      characterUnlockCost: CHARACTER_UNLOCK_COST_CREDITS,
      items: characterPage.items,
      page: characterPage.page,
      limit: characterPage.limit,
      total: characterPage.total,
      totalPages: characterPage.totalPages,
      hasMore: characterPage.hasMore,
    },
    platform: publicPlatform,
    characterImage: (PUBLIC_ALIYUN_MODEL_EXPOSURE_ENABLED || PUBLIC_WAN27_MODEL_EXPOSURE_ENABLED) ? config.characterImage : {},
    scenes: config.scenes
      .filter((scene) => scene.enabled !== false)
      .map((scene) => {
        const { prompt, ...publicScene } = normalizeSceneConfig(scene);
        return publicScene;
      }),
  };
  if (tenant.toolId === "undress") {
    view.defaultCompanionId = "";
    view.prices = {};
    view.assetImageModify = {};
    view.video = {};
    view.playfluxTemplates = [];
    view.homeVideo = {
      provider: "",
      posterUrl: "",
      videoUrl: "",
      taskId: "",
      status: "",
      referenceAssetUri: "",
      activeItemId: "",
      characterUnlockCost: 0,
      items: [],
      page: 1,
      limit: 0,
      total: 0,
      totalPages: 1,
      hasMore: false,
    };
    view.platform = {
      brand: view.platform.brand || tenant.brand || "Undress",
      analytics: view.platform.analytics || {},
      googleMeasurementId: view.platform.googleMeasurementId || "",
      accessCopy: "",
      templates: [],
      categories: [],
      advanced: { cases: [] },
      advancedPricing: {},
    };
    view.characterImage = {};
    view.scenes = [];
  }
  return publicAssetUrlsForClient(view);
}

async function handlePublicCharacters(req, res, url) {
  let config = await readAppConfig();
  config = await refreshCompletedHomeVideoItems(config);
  const auth = await getAuth(req, { loadDb: false });
  if (auth.quarantined) return sendJson(res, 403, { ok: false, code: "ACCOUNT_QUARANTINED", message: "This account is under security review. Please contact support." });
  const homeVideo = normalizeHomeVideo(config.homeVideo || {});
  const paging = pagingFromUrl(url || new URL("http://localhost"), {
    defaultLimit: PUBLIC_CHARACTER_PAGE_SIZE,
    maxLimit: 50,
  });
  const page = publicCharacterPageFromItems(homeVideo.items, auth?.user ? auth : null, {
    ...paging,
    q: url?.searchParams?.get("q") || "",
    characterId: url?.searchParams?.get("id") || url?.searchParams?.get("characterId") || "",
  });
  return sendJson(res, 200, publicAssetUrlsForClient({ ok: true, ...page }));
}

function publicWorkflowPresetView(preset = {}) {
  return publicAssetUrlsForClient({
    id: String(preset.id || "").trim(),
    label: String(preset.label || preset.name || "").trim(),
    prompt: String(preset.prompt || preset.defaultPrompt || "").trim(),
    previewUrl: String(preset.previewUrl || "").trim(),
    posterUrl: String(preset.posterUrl || "").trim(),
    category: String(preset.category || "PlayFlux").trim() || "PlayFlux",
    source: String(preset.source || "").trim(),
    sourceId: String(preset.sourceId || "").trim(),
    sortOrder: Number(preset.sortOrder || 0) || 0,
  });
}

async function handleWorkflowPresets(req, res) {
  const presets = await listWorkflowPresetsFromDb({ includeDeleted: false }) || [];
  const list = presets
    .map(publicWorkflowPresetView)
    .filter((preset) => preset.id && preset.label && preset.prompt && preset.previewUrl)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
  return sendJson(res, 200, { ok: true, presets: list });
}

async function createDefaultWorkflowCanvasForUser(userId = "") {
  return createWorkflowCanvasInDb({
    id: randomId("workflow"),
    userId,
    name: "Untitled workflow",
    workflow: defaultWorkflowCanvasState(),
  });
}

async function ensureUserWorkflowCanvases(userId = "") {
  let canvases = await listWorkflowCanvasesFromDb(userId);
  if (canvases === null) return null;
  if (!canvases.length) {
    const created = await createDefaultWorkflowCanvasForUser(userId);
    canvases = created ? [created] : [];
  }
  return canvases;
}

function workflowCanvasListView(canvases = []) {
  // Canvas summaries are persisted snapshots. Their thumbnail fields can hold
  // OSS/CDN signatures that expire, so mint delivery URLs again at list time.
  return (Array.isArray(canvases) ? canvases : [])
    .map((canvas) => publicAssetUrlsForClient(publicWorkflowCanvasSummary(canvas)));
}

function sendWorkflowCanvasValidationError(res, error) {
  return sendJson(res, Number(error?.statusCode || 400), {
    ok: false,
    code: error?.code || "INVALID_WORKFLOW_CANVAS",
    message: error?.message || "Workflow canvas is invalid.",
  });
}

async function handleListWorkflowCanvases(req, res) {
  if (requestTenantDescriptor(req).toolOnly) return sendJson(res, 404, { ok: false, message: "API not found." });
  const auth = await requireUser(req, res, { loadDb: false });
  if (!auth) return;
  const canvases = await ensureUserWorkflowCanvases(auth.user.id);
  if (canvases === null) return sendJson(res, 503, { ok: false, message: "Workflow storage is unavailable." });
  return sendJson(res, 200, { ok: true, canvases: workflowCanvasListView(canvases) });
}

async function handleCreateWorkflowCanvas(req, res) {
  if (requestTenantDescriptor(req).toolOnly) return sendJson(res, 404, { ok: false, message: "API not found." });
  const auth = await requireUser(req, res, { loadDb: false });
  if (!auth) return;
  const existing = await listWorkflowCanvasesFromDb(auth.user.id);
  if (existing === null) return sendJson(res, 503, { ok: false, message: "Workflow storage is unavailable." });
  if (existing.length >= WORKFLOW_CANVAS_LIMIT) {
    return sendJson(res, 400, { ok: false, code: "WORKFLOW_CANVAS_LIMIT", message: `You can save up to ${WORKFLOW_CANVAS_LIMIT} workflows.` });
  }
  try {
    const body = await readJson(req, WORKFLOW_CANVAS_WRITE_PAYLOAD_BYTES);
    validateWorkflowCanvasForWrite(body.workflow || defaultWorkflowCanvasState());
    const canvas = await createWorkflowCanvasInDb({
      id: randomId("workflow"),
      userId: auth.user.id,
      name: normalizeWorkflowCanvasName(body.name),
      workflow: normalizeWorkflowCanvasState(body.workflow || defaultWorkflowCanvasState()),
    });
    return sendJson(res, 201, { ok: true, canvas: publicWorkflowCanvasView(canvas) });
  } catch (error) {
    return sendWorkflowCanvasValidationError(res, error);
  }
}

async function handleGetWorkflowCanvas(req, res, canvasId = "") {
  if (requestTenantDescriptor(req).toolOnly) return sendJson(res, 404, { ok: false, message: "API not found." });
  const auth = await requireUser(req, res, { loadDb: false });
  if (!auth) return;
  const canvas = await getWorkflowCanvasFromDb({ id: canvasId, userId: auth.user.id });
  if (!canvas) return sendJson(res, 404, { ok: false, code: "WORKFLOW_CANVAS_NOT_FOUND", message: "Workflow not found." });
  return sendJson(res, 200, { ok: true, canvas: publicWorkflowCanvasView(canvas) });
}

async function handleUpdateWorkflowCanvas(req, res, canvasId = "") {
  if (requestTenantDescriptor(req).toolOnly) return sendJson(res, 404, { ok: false, message: "API not found." });
  const auth = await requireUser(req, res, { loadDb: false });
  if (!auth) return;
  const updateKey = `${auth.user.id}:${canvasId}`;
  if (workflowCanvasUpdatesInFlight.has(updateKey)) {
    req.resume();
    return sendJson(res, 429, {
      ok: false,
      code: "WORKFLOW_CANVAS_UPDATE_IN_PROGRESS",
      message: "A workflow save is already in progress.",
    });
  }
  workflowCanvasUpdatesInFlight.add(updateKey);
  try {
    const body = await readJson(req, WORKFLOW_CANVAS_WRITE_PAYLOAD_BYTES);
    validateWorkflowCanvasForWrite(body.workflow);
    const canvas = await updateWorkflowCanvasInDb({
      id: canvasId,
      userId: auth.user.id,
      name: normalizeWorkflowCanvasName(body.name),
      workflow: normalizeWorkflowCanvasState(body.workflow),
    });
    if (!canvas) return sendJson(res, 404, { ok: false, code: "WORKFLOW_CANVAS_NOT_FOUND", message: "Workflow not found." });
    return sendJson(res, 200, { ok: true, canvas: publicWorkflowCanvasSummary(canvas) });
  } catch (error) {
    return sendWorkflowCanvasValidationError(res, error);
  } finally {
    workflowCanvasUpdatesInFlight.delete(updateKey);
  }
}

async function handleDeleteWorkflowCanvas(req, res, canvasId = "") {
  if (requestTenantDescriptor(req).toolOnly) return sendJson(res, 404, { ok: false, message: "API not found." });
  const auth = await requireUser(req, res, { loadDb: false });
  if (!auth) return;
  const deleted = await deleteWorkflowCanvasInDb({ id: canvasId, userId: auth.user.id });
  if (deleted === null && !dbEnabled()) return sendJson(res, 503, { ok: false, message: "Workflow storage is unavailable." });
  if (!deleted) return sendJson(res, 404, { ok: false, code: "WORKFLOW_CANVAS_NOT_FOUND", message: "Workflow not found." });
  const canvases = await ensureUserWorkflowCanvases(auth.user.id);
  return sendJson(res, 200, { ok: true, canvases: workflowCanvasListView(canvases), deletedId: canvasId });
}

function compactPlainText(value = "", maxLength = 220) {
  const text = String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!maxLength || text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
}

function slugSegment(value = "", fallback = "item") {
  return String(value || fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 140) || fallback;
}

function siteBrandFromConfig(config = {}) {
  return String(config.platform?.brand || DEFAULT_CONFIG.platform.brand || "Vipeak AI").trim() || "Vipeak AI";
}

function characterPublicPath(item = {}) {
  return `/characters/${encodeURIComponent(slugSegment(item.id || item.sourceDisplayId || item.name, "character"))}`;
}

function geoTagPublicPath(tag = "") {
  return `/tags/${encodeURIComponent(slugSegment(tag, "tag"))}`;
}

function geoCategoryPublicPath(category = {}) {
  return `/categories/${encodeURIComponent(slugSegment(category.id || category.label, "category"))}`;
}

function characterPosterForGeo(item = {}) {
  const posterUrl = String(
    item.posterUrl ||
      item.localImageUrl ||
      item.syntheticReferenceLocalUrl ||
      item.sourceImageUrl ||
      item.publicImageUrl ||
      item.coverUrl ||
      item.thumbnailUrl ||
      "/assets/admin/home/default-hero.jpg"
  ).trim();
  return publicGeoMediaUrl(posterUrl);
}

function characterTagsForGeo(item = {}, max = 10) {
  return (Array.isArray(item.tags) ? item.tags : [])
    .map((tag) => compactPlainText(tag, 32))
    .filter(Boolean)
    .filter((tag, index, list) => list.indexOf(tag) === index)
    .slice(0, max);
}

function characterSummaryForGeo(item = {}) {
  const parts = [
    item.description,
    item.title,
    characterTagsForGeo(item, 5).join(", "),
    item.style,
  ].filter(Boolean);
  return compactPlainText(parts.join(". "), 240) || "Explore this AI character profile and preview the available video scenes.";
}

function characterVideoDescriptionForGeo(item = {}, video = {}, index = 0) {
  const name = compactPlainText(item.name || item.title || "AI character", 80);
  const scene = compactPlainText(video.title || video.sceneId || `scene ${index + 1}`, 80);
  const tags = characterTagsForGeo(item, 4).join(", ");
  return compactPlainText(
    [
      `${name} ${scene} video preview.`,
      tags ? `Character tags: ${tags}.` : "",
      video.locked ? "This preview is listed for discovery and can be unlocked in the app." : "This is the first public preview listed for the character.",
    ].filter(Boolean).join(" "),
    220,
  );
}

function publicCharacterVideosForGeo(item = {}) {
  const fallbackPosterUrl = characterPosterForGeo(item);
  return publicCharacterVideoList(item).map(({ key, entry }, index) => {
    const posterUrl = String(entry.posterUrl || entry.coverUrl || entry.thumbnailUrl || fallbackPosterUrl).trim();
    return {
      key,
      title: compactPlainText(entry.title || entry.sceneEntryName || entry.sceneName || `Video ${index + 1}`, 90),
      sceneId: entry.sceneId || sceneIdFromVideoKey(key) || "",
      sceneEntryId: entry.sceneEntryId || "default",
      posterUrl: publicGeoMediaUrl(posterUrl, fallbackPosterUrl),
      duration: Number(entry.duration || item.duration || 0),
      locked: index > 0,
    };
  });
}

function addCharacterVideoDescriptionsForGeo(item = {}) {
  const videos = publicCharacterVideosForGeo(item);
  return videos.map((video, index) => ({
    ...video,
    description: characterVideoDescriptionForGeo(item, video, index),
  }));
}

function geoCharacterNames(items = [], max = 5) {
  return items
    .map((item) => compactPlainText(item.name || item.title || item.id, 48))
    .filter(Boolean)
    .slice(0, max);
}

function geoCollectionRelatedTagLabels(items = [], activeLabel = "", max = 8) {
  const counts = new Map();
  const active = String(activeLabel || "").toLowerCase();
  items.forEach((item) => {
    (item.geoTags || []).forEach((tag) => {
      const label = compactPlainText(tag, 36);
      if (!label || label.toLowerCase() === active) return;
      counts.set(label, (counts.get(label) || 0) + 1);
    });
  });
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([label, count]) => ({ label, count }));
}

function geoCollectionVideoCount(items = []) {
  return items.reduce((sum, item) => sum + (item.geoVideos || []).length, 0);
}

function buildGeoCollectionCopy({ label, characters = [], kind = "tag", baseSummary = "" } = {}) {
  const names = geoCharacterNames(characters, 5);
  const relatedTags = geoCollectionRelatedTagLabels(characters, label, 6);
  const videoCount = geoCollectionVideoCount(characters);
  const profileCount = characters.length;
  const topicLabel = compactPlainText(label || "AI character videos", 80);
  const lead = kind === "category"
    ? `${topicLabel} groups ${profileCount} crawlable AI character profiles with posters, scene metadata, and video preview context.`
    : `${topicLabel} is a crawlable topic collection with ${profileCount} AI character profiles and ${videoCount} listed video scenes.`;
  const namesText = names.length ? `Representative profiles include ${names.join(", ")}.` : "";
  const tagsText = relatedTags.length ? `Related discovery tags include ${relatedTags.map((item) => item.label).join(", ")}.` : "";
  const intro = compactPlainText([lead, baseSummary, namesText, tagsText].filter(Boolean).join(" "), 520);
  const highlights = [
    `${profileCount} public character ${profileCount === 1 ? "profile" : "profiles"}`,
    `${videoCount} listed video ${videoCount === 1 ? "scene" : "scenes"}`,
    relatedTags.length ? `Related tags: ${relatedTags.slice(0, 4).map((item) => item.label).join(", ")}` : "Structured profile and video metadata",
  ];
  const faq = [
    {
      question: `What is the ${topicLabel} collection?`,
      answer: compactPlainText(`${topicLabel} is a public collection of AI character profiles organized for browsing, search, and AI understanding.`, 220),
    },
    {
      question: `How many profiles are listed under ${topicLabel}?`,
      answer: `This collection currently lists ${profileCount} public profiles and ${videoCount} video scene entries.`,
    },
    {
      question: `Can these profiles be used for video generation?`,
      answer: "Open a profile in the app to review available scenes, public previews, and unlock options where configured.",
    },
  ];
  return {
    summary: compactPlainText(intro, 180),
    intro,
    highlights,
    relatedTags,
    faq,
    videoCount,
  };
}

function buildGeoTagsForSnapshot(characters = [], origin = "") {
  const tagMap = new Map();
  characters.forEach((item) => {
    (item.geoTags || []).forEach((tag) => {
      const label = compactPlainText(tag, 40);
      if (!label) return;
      const slug = slugSegment(label, "tag");
      const entry = tagMap.get(slug) || {
        id: slug,
        label,
        path: geoTagPublicPath(label),
        url: scopedApiUrl(origin, geoTagPublicPath(label)),
        characters: [],
      };
      entry.characters.push(item);
      tagMap.set(slug, entry);
    });
  });
  return [...tagMap.values()]
    .sort((a, b) => b.characters.length - a.characters.length || a.label.localeCompare(b.label))
    .map((entry) => {
      const copy = buildGeoCollectionCopy({ label: entry.label, characters: entry.characters, kind: "tag" });
      return {
        ...entry,
        ...copy,
        updatedAt: collectionUpdatedAt(entry.characters),
      };
    });
}

function buildGeoCategoriesForSnapshot(characters = [], origin = "") {
  const categories = [
    {
      id: "character-videos",
      label: "Character Videos",
      matcher: (item) => (item.geoVideos || []).length > 0,
      summary: "AI character profiles with listed video scenes and preview metadata.",
    },
    {
      id: "image-reference",
      label: "Image Reference Characters",
      matcher: (item) => Boolean(item.geoPoster),
      summary: "AI characters organized around reusable image references and portrait posters.",
    },
    {
      id: "unlockable-scenes",
      label: "Unlockable Scenes",
      matcher: (item) => (item.geoVideos || []).some((video) => video.locked),
      summary: "Character video scene libraries with public preview metadata and unlockable videos.",
    },
  ];
  return categories
    .map((category) => {
      const path = geoCategoryPublicPath(category);
      const matched = characters.filter(category.matcher);
      return {
        ...category,
        path,
        url: scopedApiUrl(origin, path),
        characters: matched,
        updatedAt: collectionUpdatedAt(matched),
        ...buildGeoCollectionCopy({
          label: category.label,
          characters: matched,
          kind: "category",
          baseSummary: category.summary,
        }),
      };
    })
    .filter((category) => category.characters.length > 0);
}

async function geoSiteSnapshot(req) {
  const origin = pageOriginFromRequest(req);
  const tenantOptions = requestTenantOptions(req);
  // Chat is a tool tenant, but its landing page intentionally showcases the
  // existing character catalogue. Keep other tool tenants lightweight while
  // allowing Chat to load the shared home items.
  const includeHomeItems = !tenantOptions.toolOnly || tenantOptions.toolId === "chat";
  const [config, configUpdatedAt] = await Promise.all([
    readAppConfig({ includeHomeItems }),
    tenantOptions.toolOnly ? Promise.resolve("") : getKvUpdatedAt("app_config"),
  ]);
  const platform = normalizePlatformConfig(config.platform || {});
  const homeVideo = normalizeHomeVideo(config.homeVideo || {});
  const allCharacters = (homeVideo.items || [])
    .filter((item) => item && !isSoftDeleted(item))
    .map((item) => ({
      ...item,
      geoPath: characterPublicPath(item),
      geoUrl: scopedApiUrl(origin, characterPublicPath(item)),
      geoPoster: characterPosterForGeo(item),
      geoPosterAbsolute: absoluteUrlFromBase(characterPosterForGeo(item), origin),
      geoUpdatedAt: itemUpdatedAt(item, configUpdatedAt),
      geoSummary: characterSummaryForGeo(item),
      geoTags: characterTagsForGeo(item),
      geoVideos: addCharacterVideoDescriptionsForGeo(item),
    }));
  const toolOnly = Boolean(tenantOptions.toolOnly);
  const characters = toolOnly && tenantOptions.toolId !== "chat" ? [] : allCharacters;
  characters.forEach((item) => {
    item.geoPosterAbsolute = absoluteUrlFromBase(item.geoPoster, origin);
  });
  const tags = buildGeoTagsForSnapshot(characters, origin);
  const categories = buildGeoCategoriesForSnapshot(characters, origin);
  tags.forEach((tag) => {
    tag.updatedAt = tag.updatedAt || collectionUpdatedAt(tag.characters, configUpdatedAt);
    tag.characters.forEach((item) => { item.geoPosterAbsolute ||= absoluteUrlFromBase(item.geoPoster, origin); });
  });
  categories.forEach((category) => {
    category.updatedAt = category.updatedAt || collectionUpdatedAt(category.characters, configUpdatedAt);
    category.characters.forEach((item) => { item.geoPosterAbsolute ||= absoluteUrlFromBase(item.geoPoster, origin); });
  });
  const updatedAt = latestIsoTimestamp([
    config.updatedAt,
    config.updated_at,
    platform.updatedAt,
    homeVideo.updatedAt,
    ...(toolOnly ? [] : characters.map((item) => item.geoUpdatedAt)),
  ], configUpdatedAt);
  return {
    origin,
    config,
    platform,
    brand: siteBrandFromConfig(config),
    homeVideo,
    characters: characters.map((item) => ({ ...item, looks: normalizeChatLiveLooks(item.looks) })),
    tags,
    categories,
    tenantOptions,
    toolOnly,
    updatedAt,
  };
}

function homeDescriptionForGeo(platform = {}) {
  return compactPlainText(
    platform.heroSubtitle ||
      platform.notice ||
      "Create AI character videos, browse public character profiles, and generate video scenes through the advanced API.",
    170,
  );
}

function indexNowKeyForOrigin(origin = "") {
  if (INDEXNOW_KEY) {
    const explicitKey = INDEXNOW_KEY.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 128);
    if (explicitKey) return explicitKey;
  }
  const source = [
    "raising-game-indexnow",
    PUBLIC_BASE_URL || origin || "local",
    String(process.env.SESSION_SECRET || "").trim(),
    String(process.env.ARK_API_KEY || "").trim(),
  ].filter(Boolean).join(":");
  return crypto.createHash("sha256").update(source).digest("hex").slice(0, 32);
}

function indexNowKeyLocation(snapshot) {
  const key = indexNowKeyForOrigin(snapshot.origin);
  return scopedApiUrl(snapshot.origin, `/${key}.txt`);
}

function indexNowUrls(snapshot) {
  return [
    scopedApiUrl(snapshot.origin, "/"),
    scopedApiUrl(snapshot.origin, "/sitemap.xml"),
    scopedApiUrl(snapshot.origin, "/llms.txt"),
    scopedApiUrl(snapshot.origin, "/llms-full.txt"),
    ...(snapshot.toolOnly ? [] : [
      scopedApiUrl(snapshot.origin, "/characters/"),
      scopedApiUrl(snapshot.origin, "/tags/"),
      scopedApiUrl(snapshot.origin, "/categories/"),
    ]),
    ...(snapshot.tags || []).map((item) => item.url).filter(Boolean),
    ...(snapshot.categories || []).map((item) => item.url).filter(Boolean),
    ...snapshot.characters.map((item) => item.geoUrl).filter(Boolean),
  ].filter((url, index, list) => url && list.indexOf(url) === index);
}

function isIndexNowKeyPath(req, pathname = "") {
  const origin = publicOriginFromRequest(req);
  return pathname === `/${indexNowKeyForOrigin(origin)}.txt`;
}

async function submitIndexNowSnapshot(snapshot, { limit = 10000 } = {}) {
  const key = indexNowKeyForOrigin(snapshot.origin);
  const urls = indexNowUrls(snapshot).slice(0, Math.max(1, Math.min(10000, Number(limit) || 10000)));
  const payload = {
    host: new URL(snapshot.origin).hostname,
    key,
    keyLocation: indexNowKeyLocation(snapshot),
    urlList: urls,
  };
  const response = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });
  const text = await response.text().catch(() => "");
  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    urlCount: urls.length,
    keyLocation: payload.keyLocation,
    responseText: compactPlainText(text, 500),
  };
}

async function readGeoIndexNowHistory() {
  const history = await getKv(GEO_INDEXNOW_HISTORY_KEY, []);
  return Array.isArray(history) ? history.slice(0, 20) : [];
}

async function appendGeoIndexNowHistory(snapshot, result = {}) {
  const history = await readGeoIndexNowHistory();
  const entry = {
    at: new Date().toISOString(),
    origin: snapshot.origin,
    ok: Boolean(result.ok),
    status: result.status || 0,
    statusText: result.statusText || "",
    urlCount: result.urlCount || 0,
    keyLocation: result.keyLocation || indexNowKeyLocation(snapshot),
    responseText: compactPlainText(result.responseText || "", 500),
  };
  await setKv(GEO_INDEXNOW_HISTORY_KEY, [entry, ...history].slice(0, 20));
  return entry;
}

const GEO_INDEXNOW_HISTORY_KEY = "geo_indexnow_history";
const GEO_AI_PROBES_KEY = "geo_ai_probes";
const GEO_CHARACTER_VISIT_DAYS = 90;
const GEO_CHARACTER_RECENT_LIMIT = 80;
const GEO_CRAWLERS = [
  { id: "OAI-SearchBot", pattern: /OAI-SearchBot/i },
  { id: "ChatGPT-User", pattern: /ChatGPT-User/i },
  { id: "PerplexityBot", pattern: /PerplexityBot/i },
  { id: "Perplexity-User", pattern: /Perplexity-User/i },
  { id: "Googlebot", pattern: /Googlebot/i },
  { id: "Bingbot", pattern: /bingbot/i },
  { id: "DuckDuckBot", pattern: /DuckDuckBot/i },
  { id: "Applebot", pattern: /Applebot/i },
  { id: "FacebookExternalHit", pattern: /facebookexternalhit/i },
  { id: "Twitterbot", pattern: /Twitterbot/i },
];

function classifyGeoCrawler(req) {
  const userAgent = String(req.headers["user-agent"] || "");
  if (!userAgent) return null;
  const match = GEO_CRAWLERS.find((item) => item.pattern.test(userAgent));
  return match ? { id: match.id, userAgent } : null;
}

function isLikelyAutomatedGeoRequest(req) {
  const userAgent = String(req.headers["user-agent"] || "");
  if (!userAgent) return true;
  if (classifyGeoCrawler(req)) return true;
  return /bot|crawl|spider|slurp|fetch|preview|monitor|probe|scan|headless|phantom|selenium|curl|wget|python|scrapy|httpclient|go-http-client|java|okhttp|axios|node-fetch|libwww|httpx|ahrefs|semrush|mj12|dotbot|yandex|baidu|sogou|bytespider|petalbot|uptime|archive\.org/i.test(userAgent);
}

function isGeoPublicPath(pathname = "") {
  return pathname === "/" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    pathname === "/llms.txt" ||
    pathname === "/llms-full.txt" ||
    /^\/tags\/[^/]+\/?$/.test(pathname) ||
    /^\/categories\/[^/]+\/?$/.test(pathname) ||
    /^\/characters\/[^/]+\/?$/.test(pathname);
}

function isGeoVisitorPath(pathname = "") {
  return pathname === "/" ||
    /^\/tags\/[^/]+\/?$/.test(pathname) ||
    /^\/categories\/[^/]+\/?$/.test(pathname) ||
    /^\/characters\/[^/]+\/?$/.test(pathname);
}

function requestIpForStats(req) {
  return String(
    req.headers["cf-connecting-ip"] ||
      req.headers["x-real-ip"] ||
      String(req.headers["x-forwarded-for"] || "").split(",")[0] ||
      req.socket?.remoteAddress ||
      "",
  ).trim();
}

function maskIpForStats(ip = "") {
  const value = String(ip || "").trim();
  if (!value) return "";
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(value)) {
    return value.replace(/\.\d{1,3}$/, ".*");
  }
  if (value.includes(":")) {
    return `${value.split(":").slice(0, 3).join(":")}:*`;
  }
  return value.slice(0, 3) ? `${value.slice(0, 3)}*` : "";
}

function ipHashForStats(ip = "") {
  const value = String(ip || "").trim();
  return value ? crypto.createHash("sha256").update(value).digest("hex").slice(0, 20) : "";
}

async function readGeoCrawlerStats() {
  return readGeoCrawlerStatsFromDb({ recentLimit: 80 });
}

async function readGeoVisitorStats() {
  return readGeoVisitorStatsFromDb({ recentLimit: 80 });
}

async function readGeoCharacterVisitStats() {
  return readGeoCharacterVisitStatsFromDb({ days: GEO_CHARACTER_VISIT_DAYS, recentLimit: GEO_CHARACTER_RECENT_LIMIT });
}

function sameOriginReferer(req, ref = "") {
  if (!ref) return null;
  try {
    const parsed = new URL(ref);
    const origin = new URL(publicOriginFromRequest(req));
    return parsed.host === origin.host ? parsed : null;
  } catch {
    return null;
  }
}

function characterVisitSourceFromRequest(req, url) {
  const explicit = String(url?.searchParams?.get("from") || url?.searchParams?.get("source") || url?.searchParams?.get("src") || "").trim().toLowerCase();
  if (["home", "gallery", "explore"].includes(explicit)) return "home";
  if (["direct", "external"].includes(explicit)) return explicit;
  const ref = String(req.headers.referer || req.headers.referrer || "").trim();
  const same = sameOriginReferer(req, ref);
  if (!ref) return "direct";
  if (same) {
    const pathname = same.pathname || "/";
    if (pathname === "/" || pathname === "/index.html" || pathname === "/platform.html") return "home";
    return "direct";
  }
  return "external";
}

async function recordGeoCharacterVisit({ req, url, character, source = "" } = {}) {
  if (!GEO_VISIT_STATS_ENABLED) return;
  try {
    if (!character?.id) return;
    if (req && req.method !== "GET" && req.method !== "HEAD" && req.method !== "POST") return;
    if (req && isLikelyAutomatedGeoRequest(req)) return;
    const now = new Date().toISOString();
    const normalizedSource = ["home", "direct", "external"].includes(source) ? source : "direct";
    const ip = req ? requestIpForStats(req) : "";
    await recordGeoCharacterVisitInDb({
      characterId: character.id,
      name: character.name || character.title || character.id,
      posterUrl: characterPosterForGeo(character),
      pagePath: url?.pathname || characterPublicPath(character),
      source: normalizedSource,
      ipHash: ip ? ipHashForStats(ip) : "",
      ipMasked: ip ? maskIpForStats(ip) : "",
      createdAt: now,
      retentionDays: GEO_CHARACTER_VISIT_DAYS,
    });
  } catch (error) {
    console.warn("Failed to record character visit stats:", error.message || error);
  }
}

function adminCharacterVisitDashboardStats(items = [], stats = {}) {
  const itemMap = new Map((items || []).filter(Boolean).map((item) => [String(item.id || ""), item]));
  const rows = Object.values(stats.byCharacter || {})
    .filter((entry) => itemMap.has(String(entry.id || "")))
    .map((entry) => {
      const item = itemMap.get(String(entry.id || ""));
      const direct = Number(entry.direct || 0) + Number(entry.external || 0);
      return {
        id: entry.id,
        name: item?.name || entry.name || entry.id,
        path: entry.path || characterPublicPath(item || entry),
        pv: Number(entry.pv ?? entry.total ?? 0),
        total: Number(entry.pv ?? entry.total ?? 0),
        uv: Number(entry.uv || 0),
        home: Number(entry.home || 0),
        direct,
        external: Number(entry.external || 0),
        lastSeen: entry.lastSeen || "",
      };
    })
    .sort((a, b) => b.pv - a.pv || String(b.lastSeen || "").localeCompare(String(a.lastSeen || "")));
  return {
    pv: rows.reduce((sum, row) => sum + row.pv, 0),
    total: rows.reduce((sum, row) => sum + row.pv, 0),
    uv: rows.reduce((sum, row) => sum + row.uv, 0),
    home: rows.reduce((sum, row) => sum + row.home, 0),
    direct: rows.reduce((sum, row) => sum + row.direct, 0),
    external: rows.reduce((sum, row) => sum + row.external, 0),
    updatedAt: stats.updatedAt || "",
    rows: rows.slice(0, 20),
  };
}

function geoVisitorStatsView(stats = {}) {
  const byPath = stats.byPath && typeof stats.byPath === "object" ? stats.byPath : {};
  const byCountry = stats.byCountry && typeof stats.byCountry === "object" ? stats.byCountry : {};
  const topPaths = Object.entries(byPath)
    .map(([pathKey, entry]) => ({
      path: pathKey,
      count: Number(entry?.count || 0),
      lastSeen: entry?.lastSeen || "",
    }))
    .sort((a, b) => b.count - a.count || String(b.lastSeen || "").localeCompare(String(a.lastSeen || "")))
    .slice(0, 30);
  const countries = Object.entries(byCountry)
    .map(([country, entry]) => ({
      country: country || "-",
      count: Number(entry?.count || 0),
      lastSeen: entry?.lastSeen || "",
    }))
    .sort((a, b) => b.count - a.count || a.country.localeCompare(b.country))
    .slice(0, 12);
  return {
    total: Number(stats.total || 0),
    uniqueIpCount: Number(stats.uniqueIpCount || 0),
    pathCount: Object.keys(byPath).length,
    countryCount: Object.keys(byCountry).length,
    topPaths,
    countries,
    recent: Array.isArray(stats.recent) ? stats.recent.slice(0, 80) : [],
    lastSeen: stats.lastSeen || "",
  };
}

function geoCoverageMetric(label, count, total) {
  const safeTotal = Math.max(0, Number(total || 0));
  const safeCount = Math.max(0, Math.min(safeTotal, Number(count || 0)));
  return {
    label,
    count: safeCount,
    total: safeTotal,
    percent: safeTotal ? Math.round((safeCount / safeTotal) * 100) : 0,
  };
}

function topGeoTags(snapshot, max = 18) {
  const counts = new Map();
  (snapshot.characters || []).forEach((item) => {
    (item.geoTags || characterTagsForGeo(item, 12)).forEach((tag) => {
      const key = compactPlainText(tag, 40);
      if (!key) return;
      counts.set(key, (counts.get(key) || 0) + 1);
    });
  });
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([tag, count]) => ({ tag, count }));
}

