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
  return sendJson(res, 200, { ok: true, canvas: publicAssetUrlsForClient(publicWorkflowCanvasView(canvas)) });
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

const STORY_CONTRACT_VERSION = "story-p0-v1";
const STORY_CANVAS_LIMITS = Object.freeze({ maxNodes: 100, maxEdges: 200 });
const STORY_PORT_TYPES = Object.freeze(["text", "script", "episode", "asset", "shot", "prompt", "image", "video", "review"]);
const STORY_ASSET_KINDS = Object.freeze(["character", "scene", "prop", "style", "audio"]);
const STORY_CANVAS_SCOPES = Object.freeze([
  Object.freeze({
    scope: "project",
    purpose: "原始文稿、定稿、拆集、全局资产和交付审核",
    ...STORY_CANVAS_LIMITS,
    nodeTypes: ["script.input", "script.finalize", "episode.planner", "asset.extractor", "review.gate"],
  }),
  Object.freeze({
    scope: "episode",
    purpose: "单集场次、连续性、镜头规划和角色/场景引用",
    ...STORY_CANVAS_LIMITS,
    nodeTypes: ["asset.character", "asset.scene", "shot.planner", "prompt.composer", "review.gate"],
  }),
  Object.freeze({
    scope: "shot",
    purpose: "镜头提示词冻结、图片/视频生成引用和审核",
    ...STORY_CANVAS_LIMITS,
    nodeTypes: ["prompt.composer", "media.image_generate", "media.video_generate", "review.gate"],
  }),
]);
const STORY_NODE_CONTRACTS = Object.freeze([
  Object.freeze({ type: "script.input", scope: "project", title: "原始文稿", inputs: [], outputs: [{ type: "text", multiple: false }] }),
  Object.freeze({ type: "script.finalize", scope: "project", title: "定稿", inputs: [{ type: "text", multiple: false }], outputs: [{ type: "script", multiple: false }, { type: "episode", multiple: true }] }),
  Object.freeze({ type: "episode.planner", scope: "project", title: "拆集/拆场", inputs: [{ type: "script", multiple: false }], outputs: [{ type: "episode", multiple: true }] }),
  Object.freeze({ type: "asset.extractor", scope: "project", title: "资产提取", inputs: [{ type: "script", multiple: true }, { type: "episode", multiple: true }], outputs: [{ type: "asset", multiple: true }] }),
  Object.freeze({ type: "asset.character", scope: "episode", title: "角色设定", inputs: [{ type: "asset", multiple: true }, { type: "text", multiple: true }], outputs: [{ type: "asset", multiple: false }, { type: "prompt", multiple: false }, { type: "image", multiple: true }] }),
  Object.freeze({ type: "asset.scene", scope: "episode", title: "场景设定", inputs: [{ type: "asset", multiple: true }, { type: "text", multiple: true }], outputs: [{ type: "asset", multiple: false }, { type: "prompt", multiple: false }, { type: "image", multiple: true }] }),
  Object.freeze({ type: "shot.planner", scope: "episode", title: "分镜规划", inputs: [{ type: "episode", multiple: false }, { type: "asset", multiple: true }], outputs: [{ type: "shot", multiple: true }] }),
  Object.freeze({ type: "prompt.composer", scope: "episode", title: "镜头提示词", inputs: [{ type: "shot", multiple: false }, { type: "asset", multiple: true }], outputs: [{ type: "prompt", multiple: false }] }),
  Object.freeze({ type: "prompt.composer", scope: "shot", title: "最终提示词", inputs: [{ type: "shot", multiple: false }, { type: "asset", multiple: true }, { type: "text", multiple: true }], outputs: [{ type: "prompt", multiple: false }] }),
  Object.freeze({ type: "media.image_generate", scope: "shot", title: "图片生成", inputs: [{ type: "prompt", multiple: false }, { type: "image", multiple: true }], outputs: [{ type: "image", multiple: true }] }),
  Object.freeze({ type: "media.video_generate", scope: "shot", title: "视频生成", inputs: [{ type: "prompt", multiple: false }, { type: "image", multiple: true }, { type: "video", multiple: true }], outputs: [{ type: "video", multiple: true }] }),
  Object.freeze({ type: "review.gate", scope: "project", title: "项目审核", inputs: [{ type: "script", multiple: true }, { type: "episode", multiple: true }, { type: "asset", multiple: true }], outputs: [{ type: "review", multiple: false }] }),
  Object.freeze({ type: "review.gate", scope: "episode", title: "单集审核", inputs: [{ type: "shot", multiple: true }, { type: "image", multiple: true }], outputs: [{ type: "review", multiple: false }] }),
  Object.freeze({ type: "review.gate", scope: "shot", title: "镜头审核", inputs: [{ type: "image", multiple: true }, { type: "video", multiple: true }], outputs: [{ type: "review", multiple: false }] }),
]);

function storyContracts() {
  return {
    version: STORY_CONTRACT_VERSION,
    canvasLimits: STORY_CANVAS_LIMITS,
    portTypes: STORY_PORT_TYPES,
    assetKinds: STORY_ASSET_KINDS,
    scopes: STORY_CANVAS_SCOPES,
    nodes: STORY_NODE_CONTRACTS,
    rules: {
      businessData: "PostgreSQL only",
      canvasPayload: "layout and references only",
      versioning: "freeze script, asset, prompt, and generation references; upstream changes mark downstream outputs stale",
      generation: "image and video nodes reference generation records instead of embedding media metadata",
    },
  };
}

function storyProjectClientView(project = {}) {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    status: project.status,
    aspectRatio: project.aspectRatio,
    episodeTarget: project.episodeTarget,
    settings: project.settings,
    episodeCount: project.episodeCount,
    scriptVersionCount: project.scriptVersionCount,
    assetCount: project.assetCount,
    shotCount: project.shotCount,
    latestScriptAt: project.latestScriptAt,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

function storyAssetVariantClientView(variant = {}) {
  if (!variant || typeof variant !== "object") return variant;
  const metadata = variant.metadata && typeof variant.metadata === "object" ? { ...variant.metadata } : {};
  const generationRecordId = String(metadata.generationRecordId || "").trim();
  const mediaUrl = generationRecordId ? adminGenerationMediaUrl(generationRecordId) : "";
  if (mediaUrl) metadata.mediaUrl = mediaUrl;
  return {
    ...variant,
    metadata,
    mediaUrl: mediaUrl || String(variant.mediaUrl || metadata.mediaUrl || metadata.imageUrl || ""),
  };
}

function storyGenerationRefClientView(ref = {}) {
  if (!ref || typeof ref !== "object") return ref;
  const metadata = ref.metadata && typeof ref.metadata === "object" ? { ...ref.metadata } : {};
  const generationRecordId = String(ref.generationRecordId || metadata.generationRecordId || "").trim();
  const status = String(ref.status || metadata.generationStatus || "").toLowerCase();
  const completed = ["succeeded", "success", "completed", "complete"].includes(status);
  const mediaUrl = generationRecordId && ref.kind === "video" && completed ? adminGenerationMediaUrl(generationRecordId) : "";
  if (mediaUrl) metadata.videoUrl = mediaUrl;
  return { ...ref, metadata };
}

function storyInputText(value = "", maxLength = 2000) {
  return String(value || "").trim().slice(0, maxLength);
}

function storyProjectInput(body = {}) {
  const aspectRatio = ["9:16", "16:9", "1:1", "4:5"].includes(String(body.aspectRatio || "").trim())
    ? String(body.aspectRatio).trim()
    : "9:16";
  const episodeTarget = Math.max(1, Math.min(1000, Math.round(Number(body.episodeTarget || 1) || 1)));
  return {
    name: storyInputText(body.name, 120) || "未命名剧集项目",
    description: storyInputText(body.description, 4000),
    status: storyInputText(body.status, 40) || "draft",
    aspectRatio,
    episodeTarget,
    settings: body.settings && typeof body.settings === "object" && !Array.isArray(body.settings) ? body.settings : {},
  };
}

async function handleStoryContracts(req, res) {
  if (requestTenantDescriptor(req).toolOnly) return sendJson(res, 404, { ok: false, message: "API not found." });
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  return sendJson(res, 200, { ok: true, contract: storyContracts() });
}

async function handleListStoryProjects(req, res) {
  if (requestTenantDescriptor(req).toolOnly) return sendJson(res, 404, { ok: false, message: "API not found." });
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const projects = await listStoryProjectsFromDb(auth.user.id);
  if (projects === null) return sendJson(res, 503, { ok: false, code: "DATABASE_UNAVAILABLE", message: "剧集存储不可用。" });
  return sendJson(res, 200, { ok: true, contractVersion: STORY_CONTRACT_VERSION, projects: projects.map(storyProjectClientView) });
}

async function handleCreateStoryProject(req, res) {
  if (requestTenantDescriptor(req).toolOnly) return sendJson(res, 404, { ok: false, message: "API not found." });
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const body = await readJson(req, 256 * 1024);
  const project = await createStoryProjectInDb({
    id: randomId("story"),
    ownerUserId: auth.user.id,
    ...storyProjectInput(body),
  });
  if (!project) return sendJson(res, 503, { ok: false, code: "DATABASE_UNAVAILABLE", message: "剧集存储不可用。" });
  return sendJson(res, 201, { ok: true, project: storyProjectClientView(project) });
}

async function handleGetStoryProject(req, res, projectId = "") {
  if (requestTenantDescriptor(req).toolOnly) return sendJson(res, 404, { ok: false, message: "API not found." });
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const project = await getStoryProjectFromDb({ id: projectId, ownerUserId: auth.user.id });
  if (project === null && !dbEnabled()) return sendJson(res, 503, { ok: false, code: "DATABASE_UNAVAILABLE", message: "剧集存储不可用。" });
  if (!project) return sendJson(res, 404, { ok: false, code: "STORY_PROJECT_NOT_FOUND", message: "剧集项目不存在。" });
  const [episodes, canvasLinks, scripts, assets, assetVariants, promptVersions, generationRefs] = await Promise.all([
    listStoryEpisodesFromDb({ projectId, ownerUserId: auth.user.id }),
    listStoryCanvasLinksFromDb({ projectId, ownerUserId: auth.user.id }),
    listStoryScriptVersionsFromDb({ projectId, ownerUserId: auth.user.id }),
    listStoryAssetsFromDb({ projectId, ownerUserId: auth.user.id }),
    listStoryAssetVariantsFromDb({ projectId, ownerUserId: auth.user.id }),
    listStoryPromptVersionsFromDb({ projectId, ownerUserId: auth.user.id }),
    listStoryGenerationRefsFromDb({ projectId, ownerUserId: auth.user.id }),
  ]);
  return sendJson(res, 200, {
    ok: true,
    contractVersion: STORY_CONTRACT_VERSION,
    project: storyProjectClientView(project),
    episodes: episodes || [],
    scripts: scripts || [],
    assets: assets || [],
    assetVariants: (assetVariants || []).map(storyAssetVariantClientView),
    promptVersions: promptVersions || [],
    generationRefs: (generationRefs || []).map(storyGenerationRefClientView),
    productionModels: storyProductionModels(),
    canvasLinks: canvasLinks || [],
    contracts: storyContracts(),
  });
}

async function handleUpdateStoryProject(req, res, projectId = "") {
  if (requestTenantDescriptor(req).toolOnly) return sendJson(res, 404, { ok: false, message: "API not found." });
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const existing = await getStoryProjectFromDb({ id: projectId, ownerUserId: auth.user.id });
  if (existing === null && !dbEnabled()) return sendJson(res, 503, { ok: false, code: "DATABASE_UNAVAILABLE", message: "剧集存储不可用。" });
  if (!existing) return sendJson(res, 404, { ok: false, code: "STORY_PROJECT_NOT_FOUND", message: "剧集项目不存在。" });
  const body = await readJson(req, 256 * 1024);
  const merged = storyProjectInput({ ...storyProjectClientView(existing), ...body });
  const project = await updateStoryProjectInDb({ id: projectId, ownerUserId: auth.user.id, ...merged });
  if (!project) return sendJson(res, 404, { ok: false, code: "STORY_PROJECT_NOT_FOUND", message: "剧集项目不存在。" });
  return sendJson(res, 200, { ok: true, project: storyProjectClientView(project) });
}

const STORY_ANALYZER_SYSTEM_PROMPT = `你是专业中文影视编剧与制片拆解助手。你的任务是把用户提供的剧本或小说原文，整理成可制作的剧集开发结果。
只输出一个合法 JSON 对象，不要 Markdown，不要代码围栏，不要解释。所有叙事字段使用中文。
返回结构必须为：
{
  "summary": "整部作品一句话概述",
  "totalEpisodeSuggestion": 12,
  "episodes": [
    {
      "episodeNo": 1,
      "title": "本集标题",
      "synopsis": "本集可制作剧情大纲，240-500个中文字符，包含具体事件、人物动机、场景推进、冲突转折与结果",
      "hook": "30-100个中文字符的结尾钩子",
      "durationSeconds": 90,
      "characters": ["出场角色名"],
      "scenes": ["场景名"]
    }
  ],
  "characters": [
    {"name": "角色名", "role": "主角/配角/反派", "description": "身份、性格、关系", "appearance": "可持续复用的外形与服装特征"}
  ],
  "scenes": [
    {"name": "场景名", "description": "空间、时间、光线与美术特征"}
  ]
}
规则：
1. 先通读全文并按原文顺序覆盖剧情。通常一章或一个完整情节单元拆为一集；不要为了压缩集数把多章硬塞进一集，也不要把一集扩写成多集。
2. 如果用户给了目标集数，就按要求拆分；没给目标集数时，由你根据剧情容量判断，totalEpisodeSuggestion 给出建议总集数。
3. 第一版最多输出 30 集；如果建议总集数超过 30，先完整拆解前 30 集，并在 summary 末尾注明“本次拆解前30集”。
4. 每集 synopsis 必须为 240-500 个中文字符。必须写清具体事件、人物动机、场景推进、关键冲突、转折与结果；按“开场 → 发展 → 转折 → 结尾”连续叙述。禁止用“矛盾升级”“经历波折”“最终化解”等空泛套话，禁止只写一句话摘要。
5. hook 必须承接本集结尾并指向下一集，30-100 个中文字符；不要把 hook 重复写进 synopsis 末尾。
6. characters 和 scenes 去重，只保留对制作有用的稳定资产；角色外形要具体、可复用，不要写镜头动作。
7. 保持原文人物关系、时代、类型和核心冲突，不擅自改结局，不添加原文没有依据的主要事件。`;

function storyParseJsonObject(text = "") {
  const source = String(text || "").trim();
  if (!source) return null;
  const candidates = [];
  const fenced = source.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) candidates.push(fenced[1].trim());
  candidates.push(source);
  const first = source.indexOf("{");
  const last = source.lastIndexOf("}");
  if (first >= 0 && last > first) candidates.push(source.slice(first, last + 1));
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch {}
  }
  return null;
}

function storyTextList(value, maxItems = 24, maxLength = 120) {
  const list = Array.isArray(value) ? value : (value ? String(value).split(/[，,、\n]/) : []);
  return [...new Set(list.map((item) => storyInputText(item?.name || item, maxLength)).filter(Boolean))].slice(0, maxItems);
}

function storyAnalysisFromModel(payload = {}) {
  const root = payload.analysis && typeof payload.analysis === "object"
    ? payload.analysis
    : payload.data && typeof payload.data === "object"
      ? payload.data
      : payload;
  const rawEpisodes = Array.isArray(root.episodes) ? root.episodes : [];
  const episodes = rawEpisodes.map((episode, index) => {
    const episodeNo = Math.max(1, Math.round(Number(episode?.episodeNo || episode?.episode_no || index + 1) || index + 1));
    const characters = storyTextList(episode?.characters || episode?.roles, 24, 80);
    const scenes = storyTextList(episode?.scenes || episode?.locations, 24, 100);
    const hook = storyInputText(episode?.hook || episode?.cliffhanger || "", 500);
    return {
      episodeNo,
      title: storyInputText(episode?.title || `第 ${episodeNo} 集`, 160),
      synopsis: storyInputText(episode?.synopsis || episode?.summary || episode?.outline || "", 8000),
      status: "draft",
      durationSeconds: Math.max(0, Math.min(86400, Math.round(Number(episode?.durationSeconds || episode?.duration_seconds || 0) || 0))),
      metadata: { hook, characters, scenes },
    };
  }).filter((episode) => episode.title || episode.synopsis).slice(0, 30);
  const characters = (Array.isArray(root.characters) ? root.characters : []).map((character) => {
    const name = storyInputText(character?.name || character, 120);
    const role = storyInputText(character?.role || "", 120);
    const description = storyInputText(character?.description || character?.bio || "", 2400);
    const appearance = storyInputText(character?.appearance || character?.look || "", 1600);
    return {
      kind: "character",
      name,
      description: [role ? `定位：${role}` : "", description, appearance ? `外形：${appearance}` : ""].filter(Boolean).join("\n"),
      status: "planned",
      metadata: { role, appearance },
    };
  }).filter((asset) => asset.name).slice(0, 80);
  const scenes = (Array.isArray(root.scenes) ? root.scenes : []).map((scene) => ({
    kind: "scene",
    name: storyInputText(scene?.name || scene, 120),
    description: storyInputText(scene?.description || scene?.summary || "", 2400),
    status: "planned",
    metadata: {},
  })).filter((asset) => asset.name).slice(0, 120);
  return {
    summary: storyInputText(root.summary || root.logline || "", 3000),
    totalEpisodeSuggestion: Math.max(0, Math.min(1000, Math.round(Number(root.totalEpisodeSuggestion || root.total_episodes || episodes.length) || 0))),
    episodes,
    characters,
    scenes,
  };
}

function storyAnalyzerModel() {
  for (const id of ["qwen3.7-flash", "carrothub-papaya-1.0", "byteplus-language"]) {
    const model = promptOptimizerSelectedModel(id);
    if (model?.configured?.()) return model;
  }
  return null;
}

async function repairStoryAnalysisHooks({ analysis, model, deadline, usage }) {
  const missing = analysis.episodes.filter((episode) => !String(episode.metadata?.hook || "").trim());
  if (!missing.length) return analysis;
  const prompt = [
    "下面这些剧集缺少结尾钩子。请依据本集大纲和下一集开头，补齐能直接用于制作审稿的钩子。",
    "只输出合法 JSON：{\"hooks\":[{\"episodeNo\":1,\"hook\":\"30-100个中文字符\"}]}",
    "钩子必须承接本集最后一个具体画面或人物决定，并制造下一集必须继续观看的悬念；不得复述整段大纲。",
    JSON.stringify(analysis.episodes.map((episode, index) => ({
      episodeNo: episode.episodeNo,
      title: episode.title,
      synopsis: episode.synopsis,
      nextEpisodeTitle: analysis.episodes[index + 1]?.title || "",
      nextEpisodeOpening: analysis.episodes[index + 1]?.synopsis || "",
    }))),
  ].join("\n");
  try {
    const raw = await promptOptimizerUpstreamRequest({
      model: model.upstreamModel,
      messages: [
        { role: "system", content: "你是中文短剧总编剧，擅长写具体、有画面感、能驱动下一集的结尾钩子。" },
        { role: "user", content: prompt },
      ],
      temperature: 0.35,
      max_tokens: 2400,
    }, {
      deadline,
      requestContext: { storyAnalyzer: true, storyHookRepair: true, model: model.id },
      usage,
      optimizerModel: model,
    });
    const parsed = storyParseJsonObject(qwen37FlashResponseText(raw));
    const hooks = new Map((Array.isArray(parsed?.hooks) ? parsed.hooks : []).map((item) => [
      Math.max(1, Math.round(Number(item?.episodeNo || 0) || 0)),
      storyInputText(item?.hook, 500),
    ]));
    for (const episode of analysis.episodes) {
      const hook = hooks.get(episode.episodeNo);
      if (hook) episode.metadata = { ...(episode.metadata || {}), hook };
    }
  } catch {}
  return analysis;
}

const STORY_SHOT_PLANNER_SYSTEM_PROMPT = `你是专业中文影视分镜师。请把已经定稿的单集大纲拆成可连续制作、可逐镜审核的镜头清单。
只输出一个合法 JSON 对象，不要 Markdown，不要代码围栏，不要解释。返回结构：
{
  "hook": "如果输入钩子为空，补写30-100个中文字符的结尾钩子；否则原样返回",
  "shots": [
    {
      "shotNo": 1,
      "title": "12字以内镜头标题",
      "description": "80-220个中文字符的可执行分镜描述",
      "durationSeconds": 5,
      "shotSize": "远景/全景/中景/近景/特写",
      "camera": "固定/推/拉/摇/移/跟/手持等",
      "location": "具体场景",
      "characters": ["出场角色"],
      "dialogue": "对白、旁白或留空",
      "storyBeat": "本镜承担的剧情推进"
    }
  ]
}
规则：
1. 严格按大纲时间顺序覆盖开场、发展、转折、结尾，不新增原文没有依据的主要事件，不改变人物关系和结果。
2. 镜头数量按本集时长和剧情密度决定，通常每5-10秒一个镜头；90秒建议8-14个镜头，所有 shotNo 连续且唯一。
3. 每个镜头只表现一个清晰的视觉动作或信息变化。description 必须写清景别、人物动作、环境、关键道具、情绪和与前后镜头的连续性。
4. 充分使用输入的出场角色、场景和结尾钩子；必须有一个明确镜头落地钩子，不能只写在镜头外。
5. dialogue 只保留能推动剧情或揭示人物关系的关键对白，禁止长篇复述。
6. durationSeconds 为1-30的整数，所有镜头时长之和应接近本集目标时长，允许上下浮动10%。
7. hook 必须具体、有画面感，承接本集最后动作并指向下一集。`;

function storyAssetBelongsToEpisode(asset = {}, episode = {}) {
  const metadata = asset.metadata && typeof asset.metadata === "object" ? asset.metadata : {};
  const episodeId = String(episode.id || "");
  if (Array.isArray(metadata.episodeIds)) return metadata.episodeIds.map(String).includes(episodeId);
  const name = String(asset.name || "").trim();
  if (!name) return false;
  const episodeMetadata = episode.metadata && typeof episode.metadata === "object" ? episode.metadata : {};
  return [...storyTextList(episodeMetadata.characters, 40, 100), ...storyTextList(episodeMetadata.scenes, 40, 120)]
    .some((item) => item.includes(name) || name.includes(item));
}

function storyShotUsesAsset(asset = {}, shot = {}) {
  const shotNos = storyTextList(asset.metadata?.shotNos || [], 80, 24)
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item));
  if (shotNos.length) return shotNos.includes(Number(shot.shotNo || 0));
  const name = String(asset.name || "").trim();
  if (!name) return false;
  const metadata = shot.metadata && typeof shot.metadata === "object" ? shot.metadata : {};
  const kind = String(asset.kind || "");
  if (kind === "style") return true;
  if (kind === "character") {
    const characters = storyTextList(metadata.characters, 40, 100);
    if (characters.some((item) => item.includes(name) || name.includes(item))) return true;
  }
  if (kind === "scene") {
    const location = String(metadata.location || "").trim();
    if (location && (location.includes(name) || name.includes(location))) return true;
  }
  const haystack = [shot.title, shot.description, metadata.location, metadata.dialogue, metadata.storyBeat]
    .filter(Boolean)
    .join("\n");
  return Boolean(name && haystack.includes(name));
}

function storyApprovedVariantForAsset(asset = {}, variants = []) {
  const approvedId = String(asset.metadata?.approvedVariantId || "");
  const assetVariants = variants.filter((variant) => variant.assetId === asset.id);
  return variants.find((variant) => variant.id === approvedId && variant.status === "approved")
    || assetVariants.find((variant) => variant.status === "approved")
    || null;
}

function storyApprovedVariantHasImage(variant = {}) {
  if (!variant || variant.status !== "approved") return false;
  const metadata = variant.metadata && typeof variant.metadata === "object" ? variant.metadata : {};
  return Boolean(
    String(variant.mediaUrl || "").trim()
      || String(metadata.mediaUrl || "").trim()
      || String(metadata.imageUrl || "").trim()
      || String(metadata.generationRecordId || "").trim()
  );
}

function storyAssetDesignReady(asset = {}, variants = []) {
  return storyApprovedVariantHasImage(storyApprovedVariantForAsset(asset, variants));
}

function storyShotProductionPrompt({ project = {}, episode = {}, shot = {}, assets = [], variants = [] } = {}) {
  const metadata = shot.metadata && typeof shot.metadata === "object" ? shot.metadata : {};
  const relevantAssets = assets.filter((asset) => storyShotUsesAsset(asset, shot));
  const assetLines = relevantAssets.map((asset) => {
    const variant = storyApprovedVariantForAsset(asset, variants);
    const visual = variant?.description || asset.description || "";
    const imagePrompt = variant?.metadata?.imagePrompt || asset.metadata?.imagePrompt || "";
    const continuity = asset.metadata?.continuity || "";
    return [
      `- ${asset.kind === "character" ? "角色" : asset.kind === "scene" ? "场景" : asset.kind === "prop" ? "道具" : "资产"}：${asset.name}`,
      `  视觉定稿：${visual}`,
      continuity ? `  连续性：${continuity}` : "",
      imagePrompt ? `  设计图依据：${imagePrompt}` : "",
      String(variant?.metadata?.generationRecordId || "").trim() ? `  已定稿参考图记录：${String(variant.metadata.generationRecordId).trim()}` : "",
    ].filter(Boolean).join("\n");
  }).join("\n");
  return [
    `项目：${project.name || "未命名项目"}；画幅：${project.aspectRatio || "9:16"}`,
    `本集：E${String(episode.episodeNo || 1).padStart(2, "0")} ${episode.title || ""}；时长：${Number(shot.durationSeconds || 5)} 秒`,
    `镜头：S${String(shot.shotNo || 1).padStart(2, "0")} ${shot.title || ""}`,
    `画面内容：${shot.description || "无"}`,
    metadata.shotSize ? `景别：${metadata.shotSize}` : "",
    metadata.camera ? `运镜：${metadata.camera}` : "",
    metadata.location ? `地点：${metadata.location}` : "",
    Array.isArray(metadata.characters) && metadata.characters.length ? `出场角色：${metadata.characters.join("、")}` : "",
    metadata.dialogue ? `关键对白：${metadata.dialogue}` : "",
    metadata.storyBeat ? `叙事作用：${metadata.storyBeat}` : "",
    "已定稿资产（身份、服装、场景结构和关键道具必须严格延续）：",
    assetLines || "- 本镜头未绑定资产，按镜头描述和前后镜连续性执行",
    "请只生成这一镜可直接交给视频模型执行的提示词；不要拆成多镜，不要改写剧情，不要加入未定稿角色或道具。",
  ].filter(Boolean).join("\n");
}

async function analyzeStoryScript({ project = {}, script = {}, targetEpisodes = 0, targetEpisode = null, targetShot = null } = {}) {
  const model = storyAnalyzerModel();
  if (!model) {
    throw Object.assign(new Error("剧本拆解模型尚未配置。"), {
      statusCode: 503,
      code: "MISSING_STORY_ANALYZER_MODEL",
    });
  }
  const content = String(script.content || "").trim().slice(0, 120000);
  if (!content) {
    throw Object.assign(new Error("请先保存剧本或小说文本。"), { statusCode: 400, code: "STORY_SCRIPT_EMPTY" });
  }
  const target = Math.max(0, Math.min(50, Math.round(Number(targetEpisodes || 0) || 0)));
  const targetEpisodeLabel = targetEpisode
    ? `E${String(targetEpisode.episodeNo || 0).padStart(2, "0")} · ${String(targetEpisode.title || "未命名剧集")}`
    : "";
  const targetShotLabel = targetShot
    ? `S${String(targetShot.shotNo || 0).padStart(2, "0")} · ${String(targetShot.title || "未命名镜头")}`
    : "";
  const estimatedDurationSeconds = Math.max(0, Number(script.estimatedDurationSeconds || 0) || 0);
  const userPrompt = [
    `项目名：${String(project.name || "未命名项目")}`,
    `项目说明：${String(project.description || "无")}`,
    `画幅：${String(project.aspectRatio || "9:16")}`,
    target ? `目标集数：${target}` : "目标集数：由你根据内容判断",
    targetEpisodeLabel ? `目标分集：${targetEpisodeLabel}。优先把本次文稿整理为这一集可直接制作的剧情大纲，不要无意义扩散到其他集。` : "目标分集：未指定，由你按内容规划",
    targetShotLabel ? `目标分镜：${targetShotLabel}。拆解时保留该镜头在原分集中的位置和前后连续性。` : "目标分镜：未指定，由你按分集节奏规划",
    estimatedDurationSeconds ? `预计时长：约 ${estimatedDurationSeconds} 秒，请按这个时长控制内容密度。` : "预计时长：未指定，请根据剧情节奏规划",
    `文稿标题：${String(script.title || "未命名文稿")}`,
    "文稿开始",
    content,
    "文稿结束",
    "请严格输出约定的 JSON。",
  ].join("\n");
  const deadline = Date.now() + PROMPT_OPTIMIZER_TOTAL_BUDGET_MS;
  const usage = { attempts: 0 };
  const raw = await promptOptimizerUpstreamRequest({
    model: model.upstreamModel,
    messages: [
      { role: "system", content: STORY_ANALYZER_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.2,
    max_tokens: 7000,
  }, {
    deadline,
    requestContext: { storyAnalyzer: true, projectId: project.id, scriptVersionId: script.id, targetEpisodes: target, targetEpisodeId: script.targetEpisodeId || "", targetShotId: script.targetShotId || "", estimatedDurationSeconds },
    usage,
    optimizerModel: model,
  });
  const text = qwen37FlashResponseText(raw);
  const parsed = storyParseJsonObject(text);
  if (!parsed) {
    throw Object.assign(new Error("拆解模型没有返回有效 JSON，请重试。"), {
      statusCode: 502,
      code: "STORY_ANALYSIS_INVALID_JSON",
      responsePreview: String(text || "").slice(0, 600),
    });
  }
  const analysis = storyAnalysisFromModel(parsed);
  if (!analysis.episodes.length) {
    throw Object.assign(new Error("拆解结果没有有效剧集，请检查原文或重试。"), {
      statusCode: 502,
      code: "STORY_ANALYSIS_EMPTY",
    });
  }
  await repairStoryAnalysisHooks({ analysis, model, deadline, usage });
  return { analysis, model: model.id, attempts: usage.attempts };
}

function storyAnalysisPayload(body = {}) {
  const raw = body.analysis && typeof body.analysis === "object" ? body.analysis : body;
  const analysis = storyAnalysisFromModel(raw);
  return {
    summary: storyInputText(raw.summary || analysis.summary, 3000),
    totalEpisodeSuggestion: analysis.totalEpisodeSuggestion,
    episodes: analysis.episodes.slice(0, 100),
    assets: [...analysis.characters, ...analysis.scenes].slice(0, 200),
  };
}

async function handleListStoryScripts(req, res, projectId = "") {
  if (requestTenantDescriptor(req).toolOnly) return sendJson(res, 404, { ok: false, message: "API not found." });
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const project = await getStoryProjectFromDb({ id: projectId, ownerUserId: auth.user.id });
  if (project === null && !dbEnabled()) return sendJson(res, 503, { ok: false, code: "DATABASE_UNAVAILABLE", message: "剧集存储不可用。" });
  if (!project) return sendJson(res, 404, { ok: false, code: "STORY_PROJECT_NOT_FOUND", message: "剧集项目不存在。" });
  const scripts = await listStoryScriptVersionsFromDb({ projectId, ownerUserId: auth.user.id });
  return sendJson(res, 200, { ok: true, scripts: scripts || [] });
}

async function handleCreateStoryScript(req, res, projectId = "") {
  if (requestTenantDescriptor(req).toolOnly) return sendJson(res, 404, { ok: false, message: "API not found." });
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  let body = {};
  try {
    body = await readJson(req, 2 * 1024 * 1024);
  } catch (error) {
    return sendJson(res, error.statusCode || 400, { ok: false, code: error.code || "INVALID_JSON", message: error.message || "请求内容无效。" });
  }
  const title = storyInputText(body.title, 160) || "未命名文稿";
  const content = String(body.content || "").slice(0, 1500000);
  const targetEpisodeId = storyInputText(body.targetEpisodeId, 120);
  const targetShotId = storyInputText(body.targetShotId, 120);
  const estimatedDurationSeconds = Math.max(0, Math.min(24 * 60 * 60, Math.round(Number(body.estimatedDurationSeconds || body.durationSeconds || 0) || 0)));
  if (!content.trim()) return sendJson(res, 400, { ok: false, code: "STORY_CONTENT_REQUIRED", message: "请输入剧本或小说文本。" });
  const project = await getStoryProjectFromDb({ id: projectId, ownerUserId: auth.user.id });
  if (project === null && !dbEnabled()) return sendJson(res, 503, { ok: false, code: "DATABASE_UNAVAILABLE", message: "剧集存储不可用。" });
  if (!project) return sendJson(res, 404, { ok: false, code: "STORY_PROJECT_NOT_FOUND", message: "剧集项目不存在。" });
  if (targetEpisodeId) {
    const episodes = await listStoryEpisodesFromDb({ projectId, ownerUserId: auth.user.id });
    const episode = (episodes || []).find((item) => item.id === targetEpisodeId);
    if (!episode) return sendJson(res, 400, { ok: false, code: "STORY_TARGET_EPISODE_NOT_FOUND", message: "所选分集不存在。" });
    if (targetShotId) {
      const shots = await listStoryShotsFromDb({ projectId, ownerUserId: auth.user.id, episodeId: targetEpisodeId });
      if (!(shots || []).some((item) => item.id === targetShotId)) {
        return sendJson(res, 400, { ok: false, code: "STORY_TARGET_SHOT_NOT_FOUND", message: "所选分镜不存在或不属于该分集。" });
      }
    }
  } else if (targetShotId) {
    return sendJson(res, 400, { ok: false, code: "STORY_TARGET_EPISODE_REQUIRED", message: "选择分镜前请先选择分集。" });
  }
  const script = await createStoryScriptVersionInDb({
    id: randomId("script"),
    projectId,
    ownerUserId: auth.user.id,
    title,
    content,
    status: "draft",
    targetEpisodeId,
    targetShotId,
    estimatedDurationSeconds,
    createdBy: auth.user.id,
  });
  if (!script) return sendJson(res, 503, { ok: false, code: "DATABASE_UNAVAILABLE", message: "文稿保存失败。" });
  return sendJson(res, 201, { ok: true, script });
}

async function handleAnalyzeStoryProject(req, res, projectId = "") {
  if (requestTenantDescriptor(req).toolOnly) return sendJson(res, 404, { ok: false, message: "API not found." });
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  let body = {};
  try {
    body = await readJson(req, 256 * 1024);
  } catch (error) {
    return sendJson(res, error.statusCode || 400, { ok: false, code: error.code || "INVALID_JSON", message: error.message || "请求内容无效。" });
  }
  const project = await getStoryProjectFromDb({ id: projectId, ownerUserId: auth.user.id });
  if (project === null && !dbEnabled()) return sendJson(res, 503, { ok: false, code: "DATABASE_UNAVAILABLE", message: "剧集存储不可用。" });
  if (!project) return sendJson(res, 404, { ok: false, code: "STORY_PROJECT_NOT_FOUND", message: "剧集项目不存在。" });
  const scripts = await listStoryScriptVersionsFromDb({ projectId, ownerUserId: auth.user.id });
  const scriptId = String(body.scriptVersionId || "").trim();
  const script = scriptId ? (scripts || []).find((item) => item.id === scriptId) : scripts?.[0];
  if (!script) return sendJson(res, 400, { ok: false, code: "STORY_SCRIPT_REQUIRED", message: "请先保存一版剧本或小说文本。" });
  const targetEpisodes = script.targetEpisodeId
    ? await listStoryEpisodesFromDb({ projectId, ownerUserId: auth.user.id })
    : [];
  const targetEpisode = (targetEpisodes || []).find((episode) => episode.id === script.targetEpisodeId) || null;
  const targetShots = targetEpisode && script.targetShotId
    ? await listStoryShotsFromDb({ projectId, ownerUserId: auth.user.id, episodeId: targetEpisode.id })
    : [];
  const targetShot = (targetShots || []).find((shot) => shot.id === script.targetShotId) || null;
  try {
    const result = await analyzeStoryScript({ project, script, targetEpisodes: body.targetEpisodes, targetEpisode, targetShot });
    return sendJson(res, 200, { ok: true, scriptVersionId: script.id, ...result });
  } catch (error) {
    console.warn("[story-analyze-failed]", JSON.stringify({
      projectId,
      scriptVersionId: script.id,
      code: error.code || "",
      statusCode: error.statusCode || 0,
      message: String(error.message || error).slice(0, 240),
    }));
    return sendJson(res, error.statusCode || 502, {
      ok: false,
      code: error.code || "STORY_ANALYSIS_FAILED",
      message: error.message || "剧本拆解失败，请重试。",
    });
  }
}

async function handleImportStoryAnalysis(req, res, projectId = "") {
  if (requestTenantDescriptor(req).toolOnly) return sendJson(res, 404, { ok: false, message: "API not found." });
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  let body = {};
  try {
    body = await readJson(req, 512 * 1024);
  } catch (error) {
    return sendJson(res, error.statusCode || 400, { ok: false, code: error.code || "INVALID_JSON", message: error.message || "请求内容无效。" });
  }
  const payload = storyAnalysisPayload(body);
  if (!payload.episodes.length) return sendJson(res, 400, { ok: false, code: "STORY_ANALYSIS_EMPTY", message: "没有可写入的剧集。" });
  const imported = await importStoryAnalysisInDb({
    projectId,
    ownerUserId: auth.user.id,
    ...payload,
  });
  if (!imported) {
    if (!dbEnabled()) return sendJson(res, 503, { ok: false, code: "DATABASE_UNAVAILABLE", message: "剧集存储不可用。" });
    return sendJson(res, 404, { ok: false, code: "STORY_PROJECT_NOT_FOUND", message: "剧集项目不存在。" });
  }
  return sendJson(res, 200, {
    ok: true,
    project: imported.project ? storyProjectClientView(imported.project) : null,
    episodes: imported.episodes,
    assets: imported.assets,
  });
}

async function handleDeleteStoryEpisode(req, res, projectId = "", episodeId = "") {
  if (requestTenantDescriptor(req).toolOnly) return sendJson(res, 404, { ok: false, message: "API not found." });
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const deleted = await deleteStoryEpisodeFromDb({ projectId, ownerUserId: auth.user.id, episodeId });
  if (deleted === null && !dbEnabled()) return sendJson(res, 503, { ok: false, code: "DATABASE_UNAVAILABLE", message: "剧集存储不可用。" });
  if (!deleted) return sendJson(res, 404, { ok: false, code: "STORY_EPISODE_NOT_FOUND", message: "剧集不存在。" });
  return sendJson(res, 200, { ok: true, episode: deleted });
}

async function handleListStoryEpisodes(req, res, projectId = "") {
  if (requestTenantDescriptor(req).toolOnly) return sendJson(res, 404, { ok: false, message: "API not found." });
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const project = await getStoryProjectFromDb({ id: projectId, ownerUserId: auth.user.id });
  if (project === null && !dbEnabled()) return sendJson(res, 503, { ok: false, code: "DATABASE_UNAVAILABLE", message: "剧集存储不可用。" });
  if (!project) return sendJson(res, 404, { ok: false, code: "STORY_PROJECT_NOT_FOUND", message: "剧集项目不存在。" });
  const episodes = await listStoryEpisodesFromDb({ projectId, ownerUserId: auth.user.id });
  return sendJson(res, 200, { ok: true, episodes: episodes || [] });
}

async function handleCreateStoryEpisode(req, res, projectId = "") {
  if (requestTenantDescriptor(req).toolOnly) return sendJson(res, 404, { ok: false, message: "API not found." });
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const body = await readJson(req, 256 * 1024);
  const episode = await createStoryEpisodeInDb({
    id: randomId("episode"),
    projectId,
    ownerUserId: auth.user.id,
    episodeNo: Math.max(0, Math.round(Number(body.episodeNo || 0) || 0)),
    title: storyInputText(body.title, 160),
    synopsis: storyInputText(body.synopsis, 8000),
    status: storyInputText(body.status, 40) || "draft",
    durationSeconds: Math.max(0, Math.min(24 * 60 * 60, Math.round(Number(body.durationSeconds || 0) || 0))),
    metadata: body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata) ? body.metadata : {},
  });
  if (!episode) {
    if (!dbEnabled()) return sendJson(res, 503, { ok: false, code: "DATABASE_UNAVAILABLE", message: "剧集存储不可用。" });
    return sendJson(res, 404, { ok: false, code: "STORY_PROJECT_NOT_FOUND", message: "剧集项目不存在。" });
  }
  return sendJson(res, 201, { ok: true, episode });
}

async function handleUpdateStoryEpisode(req, res, projectId = "", episodeId = "") {
  if (requestTenantDescriptor(req).toolOnly) return sendJson(res, 404, { ok: false, message: "API not found." });
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const body = await readJson(req, 512 * 1024);
  const episode = await updateStoryEpisodeInDb({
    projectId,
    ownerUserId: auth.user.id,
    episodeId,
    title: storyInputText(body.title, 160),
    synopsis: storyInputText(body.synopsis, 8000),
    status: storyInputText(body.status, 40) || "draft",
    durationSeconds: Math.max(0, Math.min(24 * 60 * 60, Math.round(Number(body.durationSeconds || 0) || 0))),
    metadata: body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata) ? body.metadata : {},
  });
  if (!episode) {
    if (!dbEnabled()) return sendJson(res, 503, { ok: false, code: "DATABASE_UNAVAILABLE", message: "剧集存储不可用。" });
    return sendJson(res, 404, { ok: false, code: "STORY_EPISODE_NOT_FOUND", message: "剧集不存在。" });
  }
  return sendJson(res, 200, { ok: true, episode });
}

async function handlePlanStoryEpisodeShots(req, res, projectId = "", episodeId = "") {
  if (requestTenantDescriptor(req).toolOnly) return sendJson(res, 404, { ok: false, message: "API not found." });
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const project = await getStoryProjectFromDb({ id: projectId, ownerUserId: auth.user.id });
  if (project === null && !dbEnabled()) return sendJson(res, 503, { ok: false, code: "DATABASE_UNAVAILABLE", message: "剧集存储不可用。" });
  if (!project) return sendJson(res, 404, { ok: false, code: "STORY_PROJECT_NOT_FOUND", message: "剧集项目不存在。" });
  const episodes = await listStoryEpisodesFromDb({ projectId, ownerUserId: auth.user.id });
  const episode = (episodes || []).find((item) => item.id === episodeId);
  if (!episode) return sendJson(res, 404, { ok: false, code: "STORY_EPISODE_NOT_FOUND", message: "剧集不存在。" });
  if (!["outline_locked", "shots_planned"].includes(String(episode.status || ""))) {
    return sendJson(res, 409, { ok: false, code: "STORY_OUTLINE_NOT_LOCKED", message: "请先锁定本集大纲，再由 AI 拆分镜。" });
  }
  try {
    const result = await planStoryEpisodeShots({ project, episode });
    const metadata = { ...(episode.metadata || {}) };
    if (result.hook) metadata.hook = result.hook;
    const saved = await replaceStoryShotsInDb({
      projectId,
      episodeId,
      ownerUserId: auth.user.id,
      shots: result.shots,
      episodePatch: { status: "shots_planned", metadata },
    });
    if (!saved) {
      return sendJson(res, 503, { ok: false, code: "DATABASE_UNAVAILABLE", message: "分镜保存失败。" });
    }
    return sendJson(res, 200, {
      ok: true,
      model: result.model,
      attempts: result.attempts,
      episode: saved.episode,
      shots: saved.shots,
    });
  } catch (error) {
    console.warn("[story-shot-plan-failed]", JSON.stringify({
      projectId,
      episodeId,
      code: error.code || "",
      statusCode: error.statusCode || 0,
      message: String(error.message || error).slice(0, 240),
    }));
    return sendJson(res, error.statusCode || 502, {
      ok: false,
      code: error.code || "STORY_SHOT_PLAN_FAILED",
      message: error.message || "AI 分镜失败，请重试。",
    });
  }
}

async function handlePlanStoryEpisodeAssets(req, res, projectId = "", episodeId = "") {
  if (requestTenantDescriptor(req).toolOnly) return sendJson(res, 404, { ok: false, message: "API not found." });
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const project = await getStoryProjectFromDb({ id: projectId, ownerUserId: auth.user.id });
  if (project === null && !dbEnabled()) return sendJson(res, 503, { ok: false, code: "DATABASE_UNAVAILABLE", message: "剧集存储不可用。" });
  if (!project) return sendJson(res, 404, { ok: false, code: "STORY_PROJECT_NOT_FOUND", message: "剧集项目不存在。" });
  const episodes = await listStoryEpisodesFromDb({ projectId, ownerUserId: auth.user.id });
  const episode = (episodes || []).find((item) => item.id === episodeId);
  if (!episode) return sendJson(res, 404, { ok: false, code: "STORY_EPISODE_NOT_FOUND", message: "剧集不存在。" });
  const shots = await listStoryShotsFromDb({ projectId, ownerUserId: auth.user.id, episodeId });
  if (!Array.isArray(shots) || !shots.length) {
    return sendJson(res, 409, { ok: false, code: "STORY_ASSETS_REQUIRE_SHOTS", message: "请先生成并审核本集分镜。" });
  }
  try {
    const result = await planStoryEpisodeAssets({ project, episode, shots });
    const assets = await upsertStoryAssetPlanInDb({
      projectId,
      ownerUserId: auth.user.id,
      episodeId,
      assets: result.assets,
    });
    if (!assets) return sendJson(res, 503, { ok: false, code: "DATABASE_UNAVAILABLE", message: "资产需求保存失败。" });
    const metadata = { ...(episode.metadata || {}), assetsPlannedAt: new Date().toISOString() };
    const savedEpisode = await updateStoryEpisodeInDb({
      projectId,
      ownerUserId: auth.user.id,
      episodeId,
      title: episode.title,
      synopsis: episode.synopsis,
      status: "assets_planned",
      durationSeconds: episode.durationSeconds,
      metadata,
    });
    return sendJson(res, 200, {
      ok: true,
      model: result.model,
      attempts: result.attempts,
      episode: savedEpisode || { ...episode, status: "assets_planned", metadata },
      assets,
      models: storyProductionModels(),
    });
  } catch (error) {
    console.warn("[story-asset-plan-failed]", JSON.stringify({
      projectId,
      episodeId,
      code: error.code || "",
      statusCode: error.statusCode || 0,
      message: String(error.message || error).slice(0, 240),
    }));
    return sendJson(res, error.statusCode || 502, {
      ok: false,
      code: error.code || "STORY_ASSET_PLAN_FAILED",
      message: error.message || "AI 资产规划失败，请重试。",
    });
  }
}

async function handleCreateStoryAssetVariant(req, res, projectId = "", assetId = "") {
  if (requestTenantDescriptor(req).toolOnly) return sendJson(res, 404, { ok: false, message: "API not found." });
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const body = await readJson(req, 256 * 1024);
  const recordId = String(body.generationRecordId || body.taskId || "").trim();
  let generatedRecord = null;
  if (recordId) {
    generatedRecord = await getGenerationRecordFromDb(recordId);
    if (!generatedRecord || String(generatedRecord.userId || "") !== String(auth.user.id)) {
      return sendJson(res, 404, { ok: false, code: "STORY_ASSET_GENERATION_NOT_FOUND", message: "资产设计图生成记录不存在。" });
    }
  }
  const metadata = {
    ...(body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata) ? body.metadata : {}),
    ...(recordId ? { generationRecordId: recordId } : {}),
    ...(body.provider ? { provider: storyInputText(body.provider, 80) } : {}),
    ...(body.prompt ? { imagePrompt: storyInputText(body.prompt, 8000) } : {}),
  };
  if (generatedRecord) {
    metadata.imageUrl = String(generatedRecord.imageResultUrl || generatedRecord.imageUrl || generatedRecord.cdnImageUrl || metadata.imageUrl || "");
    metadata.generationStatus = String(generatedRecord.status || "");
    metadata.resultAssetId = String(generatedRecord.resultAssetId || metadata.resultAssetId || "");
    metadata.resultAssetIds = Array.isArray(generatedRecord.resultAssetIds)
      ? generatedRecord.resultAssetIds.map(String).filter(Boolean)
      : (Array.isArray(metadata.resultAssetIds) ? metadata.resultAssetIds.map(String).filter(Boolean) : []);
  }
  const variant = await createStoryAssetVariantInDb({
    id: randomId("asset-variant"),
    projectId,
    ownerUserId: auth.user.id,
    assetId,
    name: storyInputText(body.name, 240) || "设计图",
    description: storyInputText(body.description || body.prompt, 8000),
    status: storyInputText(body.status, 40) || "draft",
    metadata,
  });
  if (!variant) return sendJson(res, 404, { ok: false, code: "STORY_ASSET_NOT_FOUND", message: "资产不存在。" });
  return sendJson(res, 201, { ok: true, variant: storyAssetVariantClientView(variant) });
}

async function handleUpdateStoryAssetVariant(req, res, projectId = "", assetId = "", variantId = "") {
  if (requestTenantDescriptor(req).toolOnly) return sendJson(res, 404, { ok: false, message: "API not found." });
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const body = await readJson(req, 256 * 1024);
  const requestedStatus = storyInputText(body.status, 40);
  const status = ["draft", "generating", "ready", "failed"].includes(requestedStatus) ? requestedStatus : "";
  const variant = await updateStoryAssetVariantInDb({
    projectId,
    ownerUserId: auth.user.id,
    assetId,
    variantId,
    name: storyInputText(body.name, 240),
    description: storyInputText(body.description, 8000),
    status,
    metadata: body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata) ? body.metadata : null,
  });
  if (!variant) return sendJson(res, 404, { ok: false, code: "STORY_ASSET_VARIANT_NOT_FOUND", message: "资产设计图不存在。" });
  return sendJson(res, 200, { ok: true, variant: storyAssetVariantClientView(variant) });
}

async function handleApproveStoryAssetVariant(req, res, projectId = "", assetId = "", variantId = "") {
  if (requestTenantDescriptor(req).toolOnly) return sendJson(res, 404, { ok: false, message: "API not found." });
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const approved = await approveStoryAssetVariantInDb({ projectId, ownerUserId: auth.user.id, assetId, variantId });
  if (!approved) return sendJson(res, 404, { ok: false, code: "STORY_ASSET_VARIANT_NOT_FOUND", message: "资产设计图不存在。" });
  const episodeIds = storyTextList(approved.asset?.metadata?.episodeIds || [], 100, 80);
  if (episodeIds.length) {
    const [episodes, allAssets, allVariants] = await Promise.all([
      listStoryEpisodesFromDb({ projectId, ownerUserId: auth.user.id }),
      listStoryAssetsFromDb({ projectId, ownerUserId: auth.user.id }),
      listStoryAssetVariantsFromDb({ projectId, ownerUserId: auth.user.id }),
    ]);
    for (const episodeId of episodeIds) {
      const episode = (episodes || []).find((item) => item.id === episodeId);
      if (!episode) continue;
      const episodeAssets = (allAssets || []).filter((asset) => storyAssetBelongsToEpisode(asset, episode));
      if (!episodeAssets.length || episodeAssets.some((asset) => !storyAssetDesignReady(asset, allVariants || []))) continue;
      await updateStoryEpisodeInDb({
        projectId,
        ownerUserId: auth.user.id,
        episodeId,
        title: episode.title,
        synopsis: episode.synopsis,
        status: "assets_ready",
        durationSeconds: episode.durationSeconds,
        metadata: { ...(episode.metadata || {}), assetsApprovedAt: new Date().toISOString() },
      });
    }
  }
  return sendJson(res, 200, {
    ok: true,
    ...approved,
    variant: storyAssetVariantClientView(approved.variant),
  });
}

async function handleUseStoryAssetVariant(req, res, projectId = "", assetId = "") {
  if (requestTenantDescriptor(req).toolOnly) return sendJson(res, 404, { ok: false, message: "API not found." });
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const body = await readJson(req, 32 * 1024);
  const variantId = storyInputText(body.variantId, 160);
  if (!variantId) return sendJson(res, 400, { ok: false, code: "STORY_ASSET_VARIANT_REQUIRED", message: "请选择已定稿素材。" });
  const reused = await useStoryAssetVariantInDb({ projectId, ownerUserId: auth.user.id, assetId, variantId });
  if (!reused) return sendJson(res, 404, { ok: false, code: "STORY_ASSET_VARIANT_NOT_FOUND", message: "未找到可复用的已定稿素材，或素材类型不匹配。" });
  const episodeIds = storyTextList(reused.asset?.metadata?.episodeIds || [], 100, 80);
  if (episodeIds.length) {
    const [episodes, allAssets, allVariants] = await Promise.all([
      listStoryEpisodesFromDb({ projectId, ownerUserId: auth.user.id }),
      listStoryAssetsFromDb({ projectId, ownerUserId: auth.user.id }),
      listStoryAssetVariantsFromDb({ projectId, ownerUserId: auth.user.id }),
    ]);
    for (const episodeId of episodeIds) {
      const episode = (episodes || []).find((item) => item.id === episodeId);
      if (!episode) continue;
      const episodeAssets = (allAssets || []).filter((asset) => storyAssetBelongsToEpisode(asset, episode));
      if (!episodeAssets.length || episodeAssets.some((asset) => !storyAssetDesignReady(asset, allVariants || []))) continue;
      await updateStoryEpisodeInDb({
        projectId,
        ownerUserId: auth.user.id,
        episodeId,
        title: episode.title,
        synopsis: episode.synopsis,
        status: "assets_ready",
        durationSeconds: episode.durationSeconds,
        metadata: { ...(episode.metadata || {}), assetsApprovedAt: new Date().toISOString() },
      });
    }
  }
  return sendJson(res, 200, {
    ok: true,
    ...reused,
    variant: storyAssetVariantClientView(reused.variant),
  });
}

async function handlePlanStoryEpisodePrompts(req, res, projectId = "", episodeId = "") {
  if (requestTenantDescriptor(req).toolOnly) return sendJson(res, 404, { ok: false, message: "API not found." });
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const body = await readJson(req, 128 * 1024);
  const providerId = storyInputText(body.provider, 80);
  const provider = STORY_VIDEO_MODELS.find((model) => model.id === providerId);
  if (!provider) {
    return sendJson(res, 400, { ok: false, code: "STORY_VIDEO_MODEL_UNSUPPORTED", message: "请选择支持的视频模型。" });
  }
  if (!provider.promptOptimizer) {
    return sendJson(res, 409, {
      ok: false,
      code: "STORY_VIDEO_MODEL_OPTIMIZER_UNAVAILABLE",
      message: `${provider.label} 暂没有独立的提示词优化规则，请先选择 Seedance、Wan/W3 或已接入规则的同族模型。`,
    });
  }
  const optimizerModelId = storyInputText(body.optimizerModel || body.optimizerModelId, 120);
  const resolution = storyInputText(body.resolution, 24) || "720p";
  const targetShotId = storyInputText(body.shotId, 120);
  const project = await getStoryProjectFromDb({ id: projectId, ownerUserId: auth.user.id });
  if (project === null && !dbEnabled()) return sendJson(res, 503, { ok: false, code: "DATABASE_UNAVAILABLE", message: "剧集存储不可用。" });
  if (!project) return sendJson(res, 404, { ok: false, code: "STORY_PROJECT_NOT_FOUND", message: "剧集项目不存在。" });
  const [episodes, shots, allAssets, variants] = await Promise.all([
    listStoryEpisodesFromDb({ projectId, ownerUserId: auth.user.id }),
    listStoryShotsFromDb({ projectId, ownerUserId: auth.user.id, episodeId }),
    listStoryAssetsFromDb({ projectId, ownerUserId: auth.user.id }),
    listStoryAssetVariantsFromDb({ projectId, ownerUserId: auth.user.id }),
  ]);
  const episode = (episodes || []).find((item) => item.id === episodeId);
  if (!episode) return sendJson(res, 404, { ok: false, code: "STORY_EPISODE_NOT_FOUND", message: "剧集不存在。" });
  if (!Array.isArray(shots) || !shots.length) {
    return sendJson(res, 409, { ok: false, code: "STORY_PROMPTS_REQUIRE_SHOTS", message: "请先生成本集分镜。" });
  }
  const episodeAssets = (allAssets || []).filter((asset) => storyAssetBelongsToEpisode(asset, episode));
  if (!episodeAssets.length) {
    return sendJson(res, 409, { ok: false, code: "STORY_PROMPTS_REQUIRE_ASSETS", message: "请先让 AI 提取本集资产并生成设计稿。" });
  }
  if (targetShotId && !shots.some((shot) => shot.id === targetShotId)) {
    return sendJson(res, 404, { ok: false, code: "STORY_SHOT_NOT_FOUND", message: "要优化的镜头不存在。" });
  }
  const targetShot = targetShotId ? shots.find((shot) => shot.id === targetShotId) : null;
  const assets = targetShot ? episodeAssets.filter((asset) => storyShotUsesAsset(asset, targetShot)) : episodeAssets;
  if (!assets.length) {
    return sendJson(res, 409, { ok: false, code: "STORY_PROMPTS_REQUIRE_SHOT_ASSETS", message: "此镜还没有绑定资产，请先让 AI 提取本镜资产。" });
  }
  const unapproved = assets.filter((asset) => !storyAssetDesignReady(asset, variants || []));
  if (unapproved.length) {
    return sendJson(res, 409, {
      ok: false,
      code: "STORY_ASSETS_NOT_APPROVED",
      message: `还有 ${unapproved.length} 个资产未定稿或缺少已定稿设计图：${unapproved.map((asset) => asset.name).slice(0, 8).join("、")}`,
      details: { assets: unapproved.map((asset) => ({ id: asset.id, name: asset.name, kind: asset.kind, status: asset.status, hasApprovedImage: false })) },
    });
  }
  const updatedShots = [];
  const failures = [];
  const promptShots = targetShotId
    ? shots.filter((shot) => shot.id === targetShotId)
    : [...shots].sort((a, b) => a.shotNo - b.shotNo);
  for (const shot of promptShots) {
    try {
      const sourcePrompt = storyShotProductionPrompt({ project, episode, shot, assets, variants: variants || [] });
      const optimized = await optimizeStoryShotPrompt({
        prompt: sourcePrompt,
        provider: provider.id,
        providerLabel: provider.label,
        duration: shot.durationSeconds,
        resolution,
        optimizerModelId,
      });
      const saved = await createStoryPromptVersionInDb({
        id: randomId("prompt"),
        projectId,
        episodeId,
        ownerUserId: auth.user.id,
        shotId: shot.id,
        prompt: optimized.optimizedPrompt,
        status: "approved",
        createdBy: "story-ai",
        metadata: {
          provider: provider.id,
          providerLabel: provider.label,
          optimizerModel: optimized.model,
          optimizerMode: optimized.mode,
          resolution,
          assetIds: assets.filter((asset) => storyShotUsesAsset(asset, shot)).map((asset) => asset.id),
          optimizedAt: new Date().toISOString(),
        },
      });
      if (!saved?.shot) throw Object.assign(new Error("提示词已优化，但写入镜头失败。"), { code: "STORY_PROMPT_SAVE_FAILED" });
      updatedShots.push(saved.shot);
    } catch (error) {
      failures.push({
        shotId: shot.id,
        shotNo: shot.shotNo,
        code: error.code || "STORY_PROMPT_FAILED",
        upstreamCode: error.upstreamCode || error.cause?.code || "",
        upstreamStatus: Number(error.upstreamStatus || error.cause?.statusCode || 0) || 0,
        message: error.cause?.message || error.message || String(error),
      });
    }
  }
  if (!updatedShots.length) {
    return sendJson(res, 502, {
      ok: false,
      code: "STORY_PROMPTS_ALL_FAILED",
      message: failures[0]?.message || "全部镜头提示词优化失败，请重试。",
      failures,
    });
  }
  const savedEpisodes = await listStoryEpisodesFromDb({ projectId, ownerUserId: auth.user.id });
  return sendJson(res, 200, {
    ok: true,
    model: provider,
    optimizerModel: optimizerModelId,
    resolution,
    episode: (savedEpisodes || []).find((item) => item.id === episodeId) || episode,
    shots: updatedShots,
    assets,
    failures,
  });
}

async function handleCreateStoryGenerationRef(req, res, projectId = "", shotId = "") {
  if (requestTenantDescriptor(req).toolOnly) return sendJson(res, 404, { ok: false, message: "API not found." });
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  let body = {};
  try {
    body = await readJson(req, 256 * 1024);
  } catch (error) {
    return sendJson(res, error.statusCode || 400, { ok: false, code: error.code || "INVALID_JSON", message: error.message || "请求内容无效。" });
  }
  const ref = await createStoryGenerationRefInDb({
    id: randomId("storygen"),
    projectId,
    ownerUserId: auth.user.id,
    shotId,
    promptVersionId: storyInputText(body.promptVersionId, 120),
    generationRecordId: storyInputText(body.generationRecordId, 180),
    kind: storyInputText(body.kind, 40) || "video",
    status: storyInputText(body.status, 40) || "queued",
    metadata: body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata) ? body.metadata : {},
  });
  if (ref === null && !dbEnabled()) return sendJson(res, 503, { ok: false, code: "DATABASE_UNAVAILABLE", message: "剧集存储不可用。" });
  if (!ref) return sendJson(res, 404, { ok: false, code: "STORY_SHOT_NOT_FOUND", message: "分镜不存在。" });
  return sendJson(res, 201, { ok: true, generationRef: storyGenerationRefClientView(ref) });
}

async function handleUpdateStoryGenerationRef(req, res, projectId = "", refId = "") {
  if (requestTenantDescriptor(req).toolOnly) return sendJson(res, 404, { ok: false, message: "API not found." });
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  let body = {};
  try {
    body = await readJson(req, 256 * 1024);
  } catch (error) {
    return sendJson(res, error.statusCode || 400, { ok: false, code: error.code || "INVALID_JSON", message: error.message || "请求内容无效。" });
  }
  const ref = await updateStoryGenerationRefInDb({
    id: refId,
    projectId,
    ownerUserId: auth.user.id,
    status: storyInputText(body.status, 40),
    generationRecordId: storyInputText(body.generationRecordId, 180),
    metadata: body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata) ? body.metadata : {},
  });
  if (ref === null && !dbEnabled()) return sendJson(res, 503, { ok: false, code: "DATABASE_UNAVAILABLE", message: "剧集存储不可用。" });
  if (!ref) return sendJson(res, 404, { ok: false, code: "STORY_GENERATION_REF_NOT_FOUND", message: "生成记录不存在。" });
  return sendJson(res, 200, { ok: true, generationRef: storyGenerationRefClientView(ref) });
}

async function handleListStoryShots(req, res, projectId = "", episodeId = "") {
  if (requestTenantDescriptor(req).toolOnly) return sendJson(res, 404, { ok: false, message: "API not found." });
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const shots = await listStoryShotsFromDb({ projectId, ownerUserId: auth.user.id, episodeId });
  if (shots === null && !dbEnabled()) return sendJson(res, 503, { ok: false, code: "DATABASE_UNAVAILABLE", message: "剧集存储不可用。" });
  return sendJson(res, 200, { ok: true, shots: shots || [] });
}

async function handleCreateStoryShot(req, res, projectId = "", episodeId = "") {
  if (requestTenantDescriptor(req).toolOnly) return sendJson(res, 404, { ok: false, message: "API not found." });
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const body = await readJson(req, 512 * 1024);
  const shot = await createStoryShotInDb({
    id: randomId("shot"),
    projectId,
    episodeId,
    ownerUserId: auth.user.id,
    shotNo: Math.max(0, Math.round(Number(body.shotNo || 0) || 0)),
    title: storyInputText(body.title, 160),
    description: storyInputText(body.description, 4000),
    imagePrompt: storyInputText(body.imagePrompt, 8000),
    videoPrompt: storyInputText(body.videoPrompt, 8000),
    durationSeconds: Math.max(1, Math.min(300, Math.round(Number(body.durationSeconds || 5) || 5))),
    status: storyInputText(body.status, 40) || "draft",
    metadata: body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata) ? body.metadata : {},
  });
  if (!shot) {
    if (!dbEnabled()) return sendJson(res, 503, { ok: false, code: "DATABASE_UNAVAILABLE", message: "剧集存储不可用。" });
    return sendJson(res, 404, { ok: false, code: "STORY_EPISODE_NOT_FOUND", message: "剧集不存在。" });
  }
  return sendJson(res, 201, { ok: true, shot });
}

async function handleUpdateStoryShot(req, res, projectId = "", episodeId = "", shotId = "") {
  if (requestTenantDescriptor(req).toolOnly) return sendJson(res, 404, { ok: false, message: "API not found." });
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const body = await readJson(req, 512 * 1024);
  const shot = await updateStoryShotInDb({
    projectId,
    episodeId,
    ownerUserId: auth.user.id,
    shotId,
    title: storyInputText(body.title, 160),
    description: storyInputText(body.description, 4000),
    imagePrompt: storyInputText(body.imagePrompt, 8000),
    videoPrompt: storyInputText(body.videoPrompt, 8000),
    durationSeconds: Math.max(1, Math.min(300, Math.round(Number(body.durationSeconds || 5) || 5))),
    status: storyInputText(body.status, 40) || "draft",
    metadata: body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata) ? body.metadata : {},
  });
  if (!shot) {
    if (!dbEnabled()) return sendJson(res, 503, { ok: false, code: "DATABASE_UNAVAILABLE", message: "镜头存储不可用。" });
    return sendJson(res, 404, { ok: false, code: "STORY_SHOT_NOT_FOUND", message: "镜头不存在。" });
  }
  return sendJson(res, 200, { ok: true, shot });
}

async function handleDeleteStoryShot(req, res, projectId = "", episodeId = "", shotId = "") {
  if (requestTenantDescriptor(req).toolOnly) return sendJson(res, 404, { ok: false, message: "API not found." });
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const shot = await deleteStoryShotFromDb({ projectId, episodeId, ownerUserId: auth.user.id, shotId });
  if (!shot) {
    if (!dbEnabled()) return sendJson(res, 503, { ok: false, code: "DATABASE_UNAVAILABLE", message: "镜头存储不可用。" });
    return sendJson(res, 404, { ok: false, code: "STORY_SHOT_NOT_FOUND", message: "镜头不存在。" });
  }
  return sendJson(res, 200, { ok: true, shot });
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

