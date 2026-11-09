async function handleGeoCategoryPage(req, res, categoryId) {
  const snapshot = await geoSiteSnapshot(req);
  const decoded = decodeURIComponent(String(categoryId || ""));
  const category = (snapshot.categories || []).find((candidate) => candidate.id === decoded || slugSegment(candidate.label) === decoded);
  if (!category) return sendText(res, 404, "Category not found", { head: req.method === "HEAD" });
  return sendHtml(res, 200, renderGeoCollectionHtml(snapshot, category, { kind: "category" }), {
    cacheControl: "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
    head: req.method === "HEAD",
  });
}

async function handleAdminSubmitIndexNow(req, res) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const body = await readJson(req).catch(() => ({}));
  const snapshot = await geoSiteSnapshot(req);
  try {
    const result = await submitIndexNowSnapshot(snapshot, { limit: body.limit });
    const historyEntry = await appendGeoIndexNowHistory(snapshot, result);
    return sendJson(res, 200, {
      ok: true,
      accepted: result.ok,
      result,
      historyEntry,
    });
  } catch (error) {
    const historyEntry = await appendGeoIndexNowHistory(snapshot, {
      ok: false,
      status: 0,
      statusText: "请求失败",
      urlCount: indexNowUrls(snapshot).length,
      keyLocation: indexNowKeyLocation(snapshot),
      responseText: error.message || "IndexNow 提交失败",
    }).catch(() => null);
    return sendJson(res, 200, {
      ok: true,
      accepted: false,
      error: error.message || "IndexNow 提交失败",
      historyEntry,
    });
  }
}

function buildGeoAiProbePlan(snapshot = {}) {
  const brand = snapshot.brand || "Vipeak AI";
  const origin = snapshot.origin || "";
  const sampleCharacter = (snapshot.characters || []).find((item) => item.geoUrl && (item.geoVideos || []).length) || (snapshot.characters || [])[0] || null;
  return {
    updatedAt: new Date().toISOString(),
    results: [],
    questions: [
      {
        id: "brand-video-generator",
        question: `What is ${brand} and what can users create there?`,
        intent: "品牌识别",
        targetUrl: origin || "/",
        expectedSignals: [brand, "AI character video", "video generator"],
        status: "待测试",
      },
      {
        id: "api-access",
        question: `Which public API endpoint should developers use for ${brand} video generation?`,
        intent: "接口发现",
        targetUrl: scopedApiUrl(origin, "/llms.txt"),
        expectedSignals: ["/api/v3/contents/generations/tasks", "Authorization", "credits"],
        status: "待测试",
      },
      {
        id: "character-discovery",
        question: `Can ${brand} expose a public character profile page with playable video metadata?`,
        intent: "角色页结构",
        targetUrl: sampleCharacter?.geoUrl || scopedApiUrl(origin, "/sitemap.xml"),
        expectedSignals: sampleCharacter
          ? ["ProfilePage", "VideoObject", sampleCharacter.name || sampleCharacter.id]
          : ["/characters/"],
        status: "待测试",
      },
      {
        id: "support-contact",
        question: `How can a user contact ${brand} support?`,
        intent: "客服入口",
        targetUrl: origin || "/",
        expectedSignals: ["Telegram", "VipeakSupportBot", "customer support"],
        status: "待测试",
      },
    ],
  };
}

async function readGeoAiProbes(snapshot = {}) {
  const plan = buildGeoAiProbePlan(snapshot);
  const providers = geoExternalProbeProviders().map((provider) => ({
    id: provider.id,
    label: provider.label,
    model: provider.model,
    configured: provider.configured,
  }));
  const stored = await getKv(GEO_AI_PROBES_KEY, null).catch(() => null);
  if (!stored || typeof stored !== "object") return { ...plan, providers };
  const results = Array.isArray(stored.results) ? stored.results.slice(0, 80) : [];
  return {
    ...plan,
    updatedAt: stored.updatedAt || plan.updatedAt,
    results,
    providers,
  };
}

function normalizeGeoProbeQuestions(questions = [], snapshot = {}) {
  const fallback = buildGeoAiProbePlan(snapshot).questions || [];
  const list = Array.isArray(questions) && questions.length ? questions : fallback;
  return list
    .map((item, index) => {
      const targetUrl = String(item.targetUrl || item.url || "").trim() || snapshot.origin || "/";
      return {
        id: String(item.id || `probe-${index + 1}`).trim().slice(0, 80) || `probe-${index + 1}`,
        question: compactPlainText(item.question || item.prompt || "", 260),
        intent: compactPlainText(item.intent || "", 80),
        targetUrl: /^https?:\/\//i.test(targetUrl) ? targetUrl : scopedApiUrl(snapshot.origin || "", targetUrl),
        expectedSignals: (Array.isArray(item.expectedSignals) ? item.expectedSignals : Array.isArray(item.expect) ? item.expect : [])
          .map((value) => String(value || "").trim())
          .filter(Boolean)
          .slice(0, 12),
      };
    })
    .filter((item) => item.question && item.targetUrl);
}

function geoExternalProbeProviders() {
  const customProviders = (() => {
    try {
      const parsed = JSON.parse(process.env.GEO_AI_PROVIDERS_JSON || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  })();
  const providers = [
    {
      id: "perplexity",
      label: "Perplexity",
      model: process.env.GEO_PERPLEXITY_MODEL || "sonar-pro",
      apiKey: process.env.GEO_PERPLEXITY_API_KEY || process.env.PERPLEXITY_API_KEY || "",
      type: "openai-compatible",
      endpoint: "https://api.perplexity.ai/chat/completions",
    },
    {
      id: "openai",
      label: "ChatGPT / OpenAI",
      model: process.env.GEO_OPENAI_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini",
      apiKey: process.env.GEO_OPENAI_API_KEY || process.env.OPENAI_API_KEY || "",
      type: "openai-compatible",
      endpoint: "https://api.openai.com/v1/chat/completions",
    },
    {
      id: "gemini",
      label: "Google Gemini",
      model: process.env.GEO_GEMINI_MODEL || "gemini-2.5-flash",
      apiKey: process.env.GEO_GEMINI_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "",
      type: "gemini",
    },
    ...customProviders.map((item, index) => ({
      id: String(item.id || `custom-${index + 1}`).trim(),
      label: String(item.label || item.name || `Custom ${index + 1}`).trim(),
      model: String(item.model || "").trim(),
      apiKey: String(item.apiKey || item.key || "").trim(),
      type: String(item.type || "openai-compatible").trim(),
      endpoint: String(item.endpoint || item.url || "").trim(),
    })),
  ].filter((provider) => provider.id && provider.label);
  return providers.map((provider) => ({
    ...provider,
    configured: Boolean(provider.apiKey && (provider.type === "gemini" || provider.endpoint) && provider.model),
  }));
}

function geoExternalProbePrompt(question = {}, snapshot = {}) {
  const brand = snapshot.brand || "Vipeak AI";
  const origin = snapshot.origin || "";
  return [
    "You are being used for a GEO visibility check.",
    "Answer the user's question naturally, using your normal external knowledge or search capability if available.",
    "Do not invent facts. If you cannot find the answer, say what is missing.",
    "Include source names or URLs when the platform supports it.",
    "",
    `Brand/site being evaluated: ${brand}`,
    `Official site: ${origin}`,
    `Question: ${question.question || ""}`,
  ].join("\n");
}

async function callOpenAiCompatibleGeoProvider(provider = {}, prompt = "") {
  const response = await fetch(provider.endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${provider.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: provider.model,
      messages: [
        { role: "system", content: "You answer concise GEO visibility test questions." },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
      max_tokens: 700,
    }),
    signal: AbortSignal.timeout(45000),
  });
  const text = await response.text().catch(() => "");
  let payload = null;
  try { payload = JSON.parse(text); } catch { payload = null; }
  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || text.slice(0, 220) || `HTTP ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return String(payload?.choices?.[0]?.message?.content || payload?.choices?.[0]?.text || "").trim();
}

async function callGeminiGeoProvider(provider = {}, prompt = "") {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(provider.model)}:generateContent?key=${encodeURIComponent(provider.apiKey)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 700 },
    }),
    signal: AbortSignal.timeout(45000),
  });
  const text = await response.text().catch(() => "");
  let payload = null;
  try { payload = JSON.parse(text); } catch { payload = null; }
  if (!response.ok) {
    const message = payload?.error?.message || text.slice(0, 220) || `HTTP ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return String((payload?.candidates || []).flatMap((item) => item?.content?.parts || []).map((part) => part.text || "").join("\n")).trim();
}

function evaluateGeoExternalAnswer(answer = "", expectedSignals = []) {
  const haystack = String(answer || "").toLowerCase();
  const matched = expectedSignals.filter((signal) => haystack.includes(String(signal).toLowerCase()));
  const missing = expectedSignals.filter((signal) => !matched.includes(signal));
  return {
    matched,
    missing,
    hit: expectedSignals.length ? missing.length === 0 : Boolean(answer),
  };
}

async function runGeoProbeQuestion(provider = {}, question = {}, snapshot = {}) {
  const expectedSignals = Array.isArray(question.expectedSignals) ? question.expectedSignals : [];
  const startedAt = new Date().toISOString();
  if (!provider.configured) {
    return {
      at: startedAt,
      id: question.id,
      providerId: provider.id,
      platform: provider.label,
      model: provider.model || provider.label,
      question: question.question,
      intent: question.intent,
      targetUrl: question.targetUrl,
      hit: false,
      state: "not_configured",
      status: 0,
      summary: `${provider.label} 未配置 API Key 或模型，未执行外部平台检测。`,
      answer: "",
      expectedSignals,
      matchedSignals: [],
      missingSignals: expectedSignals,
      bytes: 0,
    };
  }
  const prompt = geoExternalProbePrompt(question, snapshot);
  try {
    const answer = provider.type === "gemini"
      ? await callGeminiGeoProvider(provider, prompt)
      : await callOpenAiCompatibleGeoProvider(provider, prompt);
    const evaluated = evaluateGeoExternalAnswer(answer, expectedSignals);
    return {
      at: startedAt,
      id: question.id,
      providerId: provider.id,
      platform: provider.label,
      model: provider.model || provider.label,
      question: question.question,
      intent: question.intent,
      targetUrl: question.targetUrl,
      hit: evaluated.hit,
      state: evaluated.hit ? "hit" : "miss",
      status: 200,
      summary: evaluated.hit
        ? `${provider.label} 回答命中 ${evaluated.matched.length}/${expectedSignals.length} 个信号。`
        : `${provider.label} 回答命中 ${evaluated.matched.length}/${expectedSignals.length} 个信号，缺少：${evaluated.missing.join(", ") || "有效回答"}。`,
      answer: compactPlainText(answer, 1400),
      expectedSignals,
      matchedSignals: evaluated.matched,
      missingSignals: evaluated.missing,
      bytes: answer.length,
    };
  } catch (error) {
    return {
      at: startedAt,
      id: question.id,
      providerId: provider.id,
      platform: provider.label,
      model: provider.model || provider.label,
      question: question.question,
      intent: question.intent,
      targetUrl: question.targetUrl,
      hit: false,
      state: "error",
      status: error.status || 0,
      summary: `${provider.label} 调用失败：${error.message || "外部平台请求失败"}`,
      answer: "",
      expectedSignals,
      matchedSignals: [],
      missingSignals: expectedSignals,
      bytes: 0,
    };
  }
}

async function handleAdminGeoRealtimeTest(req, res) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const body = await readJson(req).catch(() => ({}));
  const snapshot = await geoSiteSnapshot(req);
  const questions = normalizeGeoProbeQuestions(body.questions || [], snapshot).slice(0, 20);
  const providers = geoExternalProbeProviders();
  const results = [];
  for (const provider of providers) {
    for (const question of questions) {
      // Keep this sequential to avoid rate-limit spikes across external AI platforms.
      results.push(await runGeoProbeQuestion(provider, question, snapshot));
    }
  }
  const previous = await getKv(GEO_AI_PROBES_KEY, {}).catch(() => ({}));
  const updatedAt = new Date().toISOString();
  const nextResults = [
    ...results,
    ...(Array.isArray(previous.results) ? previous.results : []),
  ].slice(0, 80);
  await setKv(GEO_AI_PROBES_KEY, { updatedAt, results: nextResults });
  return sendJson(res, 200, {
    ok: true,
    updatedAt,
    aiProbes: {
      updatedAt,
      questions,
      providers: providers.map((provider) => ({
        id: provider.id,
        label: provider.label,
        model: provider.model,
        configured: provider.configured,
      })),
      results: nextResults,
    },
  });
}

async function handleAdminGeoReport(req, res) {
  const auth = await requireAdmin(req, res, { loadDb: false });
  if (!auth) return;
  const snapshot = await geoSiteSnapshot(req);
  const visitorStats = await readGeoVisitorStats();
  const visitorStatsForAdmin = geoVisitorStatsView(visitorStats);
  const indexNowHistory = await readGeoIndexNowHistory();
  const coverage = buildGeoCoverage(snapshot, visitorStats, indexNowHistory);
  const offsitePlan = buildGeoOffsitePlan(snapshot);
  const aiProbes = await readGeoAiProbes(snapshot);
  const webVitals = await getWebVitalsSummaryFromDb({ days: 28 }).catch((error) => ({
    days: 28,
    sampleCount: 0,
    overall: [],
    byHost: [],
    byRoute: [],
    error: compactPlainText(error?.message || error, 180),
  }));
  const sampleCharacter = snapshot.characters[0] || null;
  const sampleTag = (snapshot.tags || [])[0] || null;
  const sampleCategory = (snapshot.categories || [])[0] || null;
  const endpoints = [
    { id: "home", label: "首页技术入口", path: "/", url: scopedApiUrl(snapshot.origin, "/"), expect: ["application/ld+json", "canonical", snapshot.brand] },
    { id: "home-brand", label: "首页品牌与生成信号", path: "/", url: scopedApiUrl(snapshot.origin, "/"), expect: [snapshot.brand, "AI character video", "video generator"] },
    { id: "support-contact", label: "客服入口信号", path: "/", url: scopedApiUrl(snapshot.origin, "/"), expect: ["Telegram", "VipeakSupportBot"] },
    { id: "robots", label: "robots.txt", path: "/robots.txt", url: scopedApiUrl(snapshot.origin, "/robots.txt"), expect: ["Sitemap:", "/sitemap.xml", "OAI-SearchBot", "PerplexityBot"] },
    { id: "sitemap", label: "sitemap.xml", path: "/sitemap.xml", url: scopedApiUrl(snapshot.origin, "/sitemap.xml"), expect: ["<urlset", "/characters/"] },
    { id: "llms", label: "llms.txt 基础信号", path: "/llms.txt", url: scopedApiUrl(snapshot.origin, "/llms.txt"), expect: [snapshot.brand, "/api/v3/contents/generations/tasks"] },
    { id: "api-access-signal", label: "API 接入信号", path: "/llms.txt", url: scopedApiUrl(snapshot.origin, "/llms.txt"), expect: ["/api/v3/contents/generations/tasks", "Authorization", "credits"] },
    { id: "llms-full", label: "llms-full.txt", path: "/llms-full.txt", url: scopedApiUrl(snapshot.origin, "/llms-full.txt"), expect: ["GEO Notes", "VideoObject"] },
    {
      id: "indexnow-key",
      label: "IndexNow 验证文件",
      path: `/${indexNowKeyForOrigin(snapshot.origin)}.txt`,
      url: indexNowKeyLocation(snapshot),
      expect: [indexNowKeyForOrigin(snapshot.origin)],
    },
  ];
  if (sampleCategory) {
    endpoints.push({
      id: "category",
      label: "分类页样例",
      path: sampleCategory.path,
      url: sampleCategory.url,
      expect: ["CollectionPage", "ItemList", sampleCategory.label],
    });
  }
  if (sampleTag) {
    endpoints.push({
      id: "tag",
      label: "标签页样例",
      path: sampleTag.path,
      url: sampleTag.url,
      expect: ["CollectionPage", "ItemList", sampleTag.label],
    });
  }
  if (sampleCharacter) {
    endpoints.push({
      id: "character",
      label: "角色页结构化视频信号",
      path: sampleCharacter.geoPath,
      url: sampleCharacter.geoUrl,
      expect: ["ProfilePage", "VideoObject", "Related characters", sampleCharacter.name || sampleCharacter.id],
    });
  }
  return sendJson(res, 200, {
    ok: true,
    generatedAt: new Date().toISOString(),
    baseUrl: snapshot.origin,
    brand: snapshot.brand,
    summary: {
      characterCount: snapshot.characters.length,
      videoCount: snapshot.characters.reduce((sum, item) => sum + item.geoVideos.length, 0),
      tagCount: snapshot.tags?.length || 0,
      categoryCount: snapshot.categories?.length || 0,
      sitemapUrlCount: 1 + (snapshot.tags?.length || 0) + (snapshot.categories?.length || 0) + snapshot.characters.length,
      llmsUrl: scopedApiUrl(snapshot.origin, "/llms.txt"),
      sitemapUrl: scopedApiUrl(snapshot.origin, "/sitemap.xml"),
      indexNowUrlCount: indexNowUrls(snapshot).length,
      indexNowKeyLocation: indexNowKeyLocation(snapshot),
      realUserVisits: visitorStatsForAdmin.total,
      uniqueVisitorCount: visitorStatsForAdmin.uniqueIpCount,
      visitedPathCount: visitorStatsForAdmin.pathCount,
      visitorCountryCount: visitorStatsForAdmin.countryCount,
      geoScore: coverage.score,
      geoStatus: coverage.status,
      contentCoveragePercent: coverage.contentPercent,
      contentQualityPercent: coverage.qualityPercent,
      visitedCharacterPathCount: coverage.visitedCharacterPathCount,
    },
    checks: endpoints,
    visitorStats: visitorStatsForAdmin,
    indexNowHistory,
    coverage,
    aiProbes,
    webVitals,
    offsitePlan,
    sampleTopics: [
      ...(snapshot.categories || []).slice(0, 6).map((item) => ({
        id: item.id,
        label: item.label,
        type: "category",
        path: item.path,
        url: item.url,
        count: item.characters.length,
        summary: item.summary,
      })),
      ...(snapshot.tags || []).slice(0, 12).map((item) => ({
        id: item.id,
        label: item.label,
        type: "tag",
        path: item.path,
        url: item.url,
        count: item.characters.length,
        summary: item.summary,
      })),
    ],
    sampleCharacters: snapshot.characters.slice(0, 12).map((item) => ({
      id: item.id,
      name: item.name || item.title || item.id,
      path: item.geoPath,
      url: item.geoUrl,
      posterUrl: absoluteUrlFromBase(item.geoPoster, snapshot.origin),
      videoCount: item.geoVideos.length,
      tags: item.geoTags,
      summary: item.geoSummary,
    })),
    recommendations: [
      "保持角色名称、摘要、标签和封面图描述清晰。",
      "把标签页和分类页作为 AI / 搜索可抓取的主题入口。",
      "导入新角色批次或切换域名后，运行 GEO 检查。",
      "站点地图或角色页变化后提交 IndexNow，然后在这里观察真实用户访问。",
      "对外接口文档统一使用 BytePlus-compatible V3 /api/v3/contents/generations/tasks 参数，旧 /api/advanced/generate 仅作为兼容入口。",
    ],
  });
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

function isExternalPlatformTemplate(template = {}) {
  const model = String(template.model || template.requestJson?.model || "").trim().toLowerCase();
  if (!model || model === "advanced-link") return false;
  if (template.action === "advanced" || template.targetTab === "advanced") return false;
  return template.enabled !== false;
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

/* ------------------------------------------------------------------ *
 * Chat live — Vidu S2-Avatar realtime video chat for the chat tool     *
 * ------------------------------------------------------------------ */

function normalizeChatLiveConfig(raw = {}) {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const integer = (value, fallback, minimum, maximum) => {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(maximum, Math.max(minimum, Math.round(number)));
  };
  return {
    enabled: source.enabled !== false,
    /* Vidu 侧成本（1.5 积分/秒 ≈ 90 积分/分钟），后台可改，仅用于展示和报价参考 */
    costCreditsPerMinute: integer(source.costCreditsPerMinute, CHAT_LIVE_DEFAULT_COST_CREDITS_PER_MINUTE, 0, 1000000),
    /* 卖给用户的积分/分钟，0 表示后台还没定价（此时不允许开聊） */
    saleCreditsPerMinute: integer(source.saleCreditsPerMinute, 0, 0, 1000000),
    /* 0 = 跟单人卖价相同 */
    sharedRoomSaleCreditsPerMinute: integer(source.sharedRoomSaleCreditsPerMinute, 0, 0, 1000000),
    freeSeconds: integer(source.freeSeconds, 0, 0, 3600),
    maxMinutes: integer(source.maxMinutes, 10, 1, 120),
    model: String(source.model || VIDU_LIVE_MODEL).trim() || VIDU_LIVE_MODEL,
    callMode: source.callMode === "audio" ? "audio" : "video",
    /* 对话模式：realtime = Vidu 内置 LLM（一体化）；component = 外接我们自己的 ASR/LLM/TTS */
    defaultMode: source.defaultMode === "component" ? "component" : "realtime",
    languageModel: ["papaya", "papaya-1.0", "carrothub-papaya-1.0"].includes(String(source.languageModel || "").trim().toLowerCase()) ? "papaya" : "byteplus",
    videoChatEnabled: source.videoChatEnabled !== false,
    region: String(source.region || "").trim().toLowerCase() === "cn"
      ? "cn"
      : (String(source.region || "").trim().toLowerCase() === "overseas"
        ? "overseas"
        : (viduBaseLooksOverseas(VIDU_API_BASE) ? "overseas" : "cn")),
    looks: normalizeChatLiveLooks(source.looks),
    gifts: normalizeChatLiveGifts(source.gifts),
    updatedAt: source.updatedAt || "",
  };
}

function chatLiveSharedRoomSaleCredits(live = {}) {
  const shared = Number(live.sharedRoomSaleCreditsPerMinute || 0) || 0;
  if (shared > 0) return shared;
  return Number(live.saleCreditsPerMinute || 0) || 0;
}

function liveMemberSaleCredits(credits, isMember = false) {
  const value = Number(credits || 0) || 0;
  return isMember ? creditsAmount(value * 0.8) : creditsAmount(value);
}

function chatLiveConfigValue(config = {}) {
  const live = normalizeChatLiveConfig((config && config.platform && config.platform.chatLive) || {});
  chatLiveRegionCache = live.region === "cn" ? "cn" : "overseas";
  return live;
}

/**
 * 阿里云 ARTC 单参数 token：sha256(appId+appKey+channelId+userId+nonce+timestamp) 的 hex，
 * 和 appid/channelid/userid/nonce/timestamp 一起 JSON 后 base64。不是 HMAC。AppKey 只留在服务端。
 */
function artcToken({ channelId = "", userId = "", ttlSeconds = 3600 } = {}) {
  if (!ARTC_APP_ID || !ARTC_APP_KEY) throw new Error("ARTC is not configured.");
  const safeChannel = String(channelId || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
  const safeUser = String(userId || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
  if (!safeChannel || !safeUser) throw new Error("ARTC channel or user id is invalid.");
  const nonce = "";
  const timestamp = Math.floor(Date.now() / 1000) + Math.max(60, Number(ttlSeconds) || 3600);
  const content = `${ARTC_APP_ID}${ARTC_APP_KEY}${safeChannel}${safeUser}${nonce}${timestamp}`;
  const signature = crypto.createHash("sha256").update(content).digest("hex");
  return Buffer.from(JSON.stringify({
    appid: ARTC_APP_ID,
    channelid: safeChannel,
    userid: safeUser,
    nonce,
    timestamp,
    token: signature,
  })).toString("base64");
}

function logViduLiveFailure(error, extra = {}) {
  const detail = {
    status: Number(error?.upstreamStatus || error?.statusCode || 0) || 0,
    reason: sanitizeChatLiveDiagnosticText(error?.code || "", 80),
    message: sanitizeChatLiveDiagnosticText(error?.message || "", 160),
    bytes: Number(error?.upstreamBytes || 0) || 0,
    path: sanitizeChatLiveDiagnosticText(extra.path || "", 80),
    region: sanitizeChatLiveDiagnosticText(extra.region || "", 16),
    attempt: Number(extra.attempt || 0) || 0,
    characterId: String(extra.characterId || "").replace(/\s+/g, "").slice(0, 80),
    model: sanitizeChatLiveDiagnosticText(extra.model || "", 40),
    callMode: sanitizeChatLiveDiagnosticText(extra.callMode || "", 16),
    requestBody: extra.requestBody || undefined,
    responseBody: extra.responseBody || undefined,
  };
  console.warn("[vidu-live]", JSON.stringify(detail));
}

function chatLiveDiagnosticValue(value, max = 1200) {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    return sanitizeChatLiveDiagnosticText(value
      .replace(/([?&](?:x-amz-[^=]+|signature|token|authorization))=[^&]+/gi, "$1=[redacted]")
      .replace(/(bearer\s+|Token\s+)[^\s,}]+/gi, "$1[redacted]"), max);
  }
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => chatLiveDiagnosticValue(item, 300));
  if (typeof value === "object") {
    const out = {};
    for (const [key, item] of Object.entries(value).slice(0, 40)) {
      if (/key|token|secret|authorization|signature|credential|password/i.test(key)) out[key] = "[redacted]";
      else if (/image_uri|imageUrl|avatarUrl|url/i.test(key) && typeof item === "string") out[key] = String(item).split("?")[0].slice(0, 300);
      else out[key] = chatLiveDiagnosticValue(item, 500);
    }
    return out;
  }
  return value;
}

function chatLiveUpstreamSummary(payload = {}, status = 0) {
  const live = payload?.live || payload || {};
  return chatLiveDiagnosticValue({
    httpStatus: Number(status || 0) || 0,
    traceId: live.trace_id || payload.trace_id || payload.traceId || "",
    liveId: live.id || "",
    status: live.status || "",
    callMode: live.call_mode || "",
    model: live.model || "",
    billedSeconds: live.billed_seconds,
    creditsCost: live.credits_cost,
    closeReason: live.close_reason || "",
    rtc: payload.rtc ? { hasRtc: true, keys: Object.keys(payload.rtc).slice(0, 20) } : null,
    keys: Object.keys(payload || {}).slice(0, 30),
  }, 1800);
}

function chatLiveDiagnosticEvent(session = {}, event = {}) {
  return {
    at: event.at || new Date().toISOString(),
    phase: String(event.phase || "runtime").slice(0, 32),
    event: String(event.event || "event").slice(0, 48),
    liveId: String(event.liveId || session.liveId || "").slice(0, 80),
    traceId: String(event.traceId || session.upstreamTraceId || "").slice(0, 100),
    data: chatLiveDiagnosticValue(event.data || {}, 1800),
  };
}

function appendChatLiveDiagnostic(session = {}, event = {}) {
  const prior = Array.isArray(session.diagnostics) ? session.diagnostics : [];
  return [...prior, chatLiveDiagnosticEvent(session, event)].slice(-30);
}

function viduCreateIsTransient(error) {
  const status = Number(error?.upstreamStatus || 0);
  const message = String(error?.message || "").trim().toLowerCase();
  if ([400, 401, 403, 404, 409, 422].includes(status)) return false;
  if (error?.code === "VIDU_TIMEOUT" || error?.code === "VIDU_NETWORK") {
    return Number(error?.elapsedMs || 0) < 12000;
  }
  if ([408, 429, 500, 502, 503, 504].includes(status)) return true;
  return ["timeout", "unknown", "aborted", "failure"].includes(message);
}

async function viduLiveRequest(pathname, { method = "GET", body, timeoutMs = 30000, region = "", logMeta = null } = {}) {
  const creds = viduCredentialsForRegion(region);
  if (!creds.key) {
    const error = new Error("Vidu live chat is not configured.");
    error.statusCode = 503;
    error.code = "VIDU_NOT_CONFIGURED";
    throw error;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  const fail = (error) => {
    error.elapsedMs = Date.now() - started;
    logViduLiveFailure(error, {
      path: pathname,
      region: creds.region,
      requestBody: pathname.startsWith("/live/") ? chatLiveDiagnosticValue(body, 1800) : undefined,
      responseBody: pathname.startsWith("/live/") ? error?.upstreamPayload : undefined,
      ...(logMeta && typeof logMeta === "object" ? logMeta : {}),
    });
    return error;
  };
  try {
    let response;
    try {
      response = await fetch(`${creds.base}${pathname}`, {
        method,
        headers: {
          Authorization: `Token ${creds.key}`,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      const aborted = error?.name === "AbortError";
      const wrapped = new Error(aborted ? "timeout" : (error?.message || "network"));
      wrapped.code = aborted ? "VIDU_TIMEOUT" : "VIDU_NETWORK";
      wrapped.upstreamStatus = 0;
      wrapped.upstreamBytes = 0;
      wrapped.statusCode = aborted ? 504 : 502;
      throw fail(wrapped);
    }
    const text = await response.text();
    let payload = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      const error = new Error("invalid");
      error.upstreamStatus = response.status;
      error.upstreamBytes = Buffer.byteLength(text || "");
      error.statusCode = response.status === 401 || response.status === 403 ? 502 : response.status;
      error.code = "VIDU_RESPONSE_INVALID";
      throw fail(error);
    }
    if (!response.ok) {
      const error = new Error(payload?.message || payload?.reason || `Vidu request failed (${response.status})`);
      error.upstreamStatus = response.status;
      error.upstreamBytes = Buffer.byteLength(text || "");
      error.statusCode = response.status === 401 || response.status === 403 ? 502 : response.status;
      error.code = payload?.reason || "VIDU_REQUEST_FAILED";
      error.upstreamPayload = chatLiveDiagnosticValue(payload, 1800);
      throw fail(error);
    }
    if (pathname.startsWith("/live/")) {
      console.info("[vidu-live-response]", JSON.stringify({
        path: pathname,
        method,
        region: creds.region,
        status: response.status,
        elapsedMs: Date.now() - started,
        request: chatLiveDiagnosticValue(body, 1800),
        response: chatLiveUpstreamSummary(payload, response.status),
      }));
    }
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

async function viduLiveRequestRetry(pathname, options = {}, meta = {}) {
  let last = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await viduLiveRequest(pathname, {
        ...options,
        logMeta: {
          attempt,
          characterId: String(meta.characterId || "").slice(0, 80),
          model: String(meta.model || options?.body?.model || "").slice(0, 40),
          callMode: String(meta.callMode || options?.body?.call_mode || "").slice(0, 16),
        },
      });
    } catch (error) {
      last = error;
      if (attempt >= 3 || !viduCreateIsTransient(error)) break;
      await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
    }
  }
  throw last;
}

function chatLiveUpstreamBalanceUnavailable(error) {
  const code = String(error?.code || "").trim().toLowerCase();
  const message = String(error?.message || "").trim().toLowerCase();
  return ["insufficient_credits", "insufficient_credit", "insufficient_balance", "balance_not_enough", "not_enough_credits"].includes(code)
    || /(?:insufficient|not enough)\s+(?:credits?|balance)/.test(message)
    || /余额不足|额度不足|账户余额/.test(String(error?.message || ""));
}

function publicChatLiveUpstreamMessage(error) {
  if (chatLiveUpstreamBalanceUnavailable(error)) {
    return "视频服务额度暂时不足，请联系客服处理。";
  }
  const raw = sanitizeChatLiveDiagnosticText(error?.message || "", 160);
  if (!raw) return "创建在线聊天失败。";
  if (/[\u4e00-\u9fff]/.test(raw)) return raw;
  if (["timeout", "unknown", "aborted", "failure"].includes(raw.toLowerCase())) {
    return "暂时没有接通，请稍后再联系。";
  }
  return raw;
}

function sendChatLiveCreateError(res, error) {
  const upstreamBalanceUnavailable = chatLiveUpstreamBalanceUnavailable(error);
  const status = Number(error?.statusCode || 502);
  const safeStatus = upstreamBalanceUnavailable ? 424 : (status === 502 || status === 504 ? 424 : status);
  return sendJson(res, safeStatus, {
    ok: false,
    code: upstreamBalanceUnavailable ? "CHAT_LIVE_UPSTREAM_BALANCE_UNAVAILABLE" : (error?.code || "CHAT_LIVE_CREATE_FAILED"),
    message: publicChatLiveUpstreamMessage(error),
  });
}

function normalizeChatLiveTags(value) {
  const list = Array.isArray(value) ? value : String(value || "").split(/[,，]/);
  return list
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, 12)
    .map((item) => item.slice(0, 24));
}

const CHAT_LIVE_STORY_STAGES = ["casual", "flirting", "foreplay", "intimate", "aftercare"];
const CHAT_LIVE_STORY_STAGE_LABELS = {
  casual: "日常",
  flirting: "暧昧",
  foreplay: "前戏",
  intimate: "亲密",
  aftercare: "余韵",
};

function normalizeChatLiveStoryUrl(value = "") {
  const url = String(value || "").trim().slice(0, 1000);
  if (!url) return "";
  if (/^https:\/\/\S+$/i.test(url) || /^\/assets\/[^\s]+$/i.test(url)) return url;
  return "";
}

function normalizeChatLiveStoryId(value = "", fallback = "") {
  return String(value || fallback || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 64) || fallback;
}

function normalizeChatLiveStory(raw = {}, existing = null) {
  const source = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw
    : (existing && typeof existing === "object" && !Array.isArray(existing) ? existing : {});
  const seenLocations = new Set();
  const locations = (Array.isArray(source.locations) ? source.locations : []).slice(0, 12).map((item, index) => {
    const id = normalizeChatLiveStoryId(item?.id, `location-${index + 1}`);
    if (!id || seenLocations.has(id)) return null;
    seenLocations.add(id);
    return {
      id,
      name: String(item?.name || `场景 ${index + 1}`).trim().slice(0, 40),
      description: String(item?.description || "").trim().slice(0, 240),
      keywords: String(item?.keywords || "").trim().slice(0, 240),
      imageUrl: normalizeChatLiveStoryUrl(item?.imageUrl || item?.lookImageUrl),
      lookId: String(item?.lookId || `story-location-${id}`).trim().slice(0, 80),
    };
  }).filter(Boolean);
  const locationIds = new Set(locations.map((item) => item.id));
  const stages = (Array.isArray(source.stages) && source.stages.length ? source.stages : CHAT_LIVE_STORY_STAGES)
    .map((item) => String(item || "").trim().toLowerCase())
    .filter((item, index, list) => CHAT_LIVE_STORY_STAGES.includes(item) && list.indexOf(item) === index)
    .slice(0, CHAT_LIVE_STORY_STAGES.length);
  const actions = (Array.isArray(source.actions) ? source.actions : []).slice(0, 120).map((item, index) => {
    const id = normalizeChatLiveStoryId(item?.id, `action-${index + 1}`);
    if (!id) return null;
    const allowedStages = (Array.isArray(item?.stages) ? item.stages : [item?.stage])
      .map((stage) => String(stage || "").trim().toLowerCase())
      .filter((stage) => CHAT_LIVE_STORY_STAGES.includes(stage));
    const allowedLocations = (Array.isArray(item?.locations) ? item.locations : [])
      .map((location) => normalizeChatLiveStoryId(location))
      .filter((location) => locationIds.has(location));
    return {
      id,
      name: String(item?.name || `动作 ${index + 1}`).trim().slice(0, 40),
      stages: allowedStages.length ? [...new Set(allowedStages)] : CHAT_LIVE_STORY_STAGES.slice(),
      locations: allowedLocations.length ? [...new Set(allowedLocations)] : [...locationIds],
      imageUrl: normalizeChatLiveStoryUrl(item?.imageUrl || item?.thumbnailUrl),
      videoUrl: normalizeChatLiveStoryUrl(item?.videoUrl),
      spot: String(item?.spot || "").trim().slice(0, 40),
      poseLabel: String(item?.poseLabel || "").trim().slice(0, 60),
      action: String(item?.action || item?.prompt || item?.name || "").trim().slice(0, 160),
      userText: String(item?.userText || "").trim().slice(0, 200),
    };
  }).filter(Boolean);
  const initialLocationId = locationIds.has(normalizeChatLiveStoryId(source.initialLocationId))
    ? normalizeChatLiveStoryId(source.initialLocationId)
    : (locations[0]?.id || "");
  const switchCooldownRaw = Number(source.switchCooldownSeconds);
  return {
    enabled: source.enabled === true || (locations.length > 0 && source.enabled !== false),
    initialLocationId,
    switchCooldownSeconds: Number.isFinite(switchCooldownRaw) ? Math.max(0, Math.min(900, Math.round(switchCooldownRaw))) : 60,
    stages: stages.length ? stages : CHAT_LIVE_STORY_STAGES.slice(),
    locations,
    actions,
  };
}

function chatLiveStoryLocation(story = {}, locationId = "") {
  const id = normalizeChatLiveStoryId(locationId);
  return (Array.isArray(story.locations) ? story.locations : []).find((item) => item.id === id) || null;
}

function chatLiveStoryAction(story = {}, actionId = "") {
  const id = normalizeChatLiveStoryId(actionId);
  return (Array.isArray(story.actions) ? story.actions : []).find((item) => item.id === id) || null;
}

function chatLiveSceneSelectionForText(story = {}, {
  text = "",
  currentStage = "casual",
  currentLocationId = "",
  recentActionIds = [],
  history = [],
} = {}) {
  const normalized = normalizeChatLiveStory(story);
  if (!normalized.enabled || !normalized.locations.length) return null;
  const fallback = chatLiveStoryDirectorSelection(normalized, {
    text,
    currentStage,
    currentLocationId,
    recentActionIds,
    history,
  });
  if (!fallback) return null;
  const keywords = [...new Set([
    ...String(text || "").split(/[\s,.，。！？!?；;:：]+/u),
    ...(Array.isArray(history) ? history : []).slice(-2)
      .filter((item) => item?.role === "user")
      .map((item) => String(item?.content || ""))
      .join(" ")
      .split(/[\s,.，。！？!?；;:：]+/u),
  ])].map((item) => String(item || "").trim().toLowerCase()).filter((item) => item.length >= 2).slice(-12);
  const scored = normalized.locations.map((location) => {
    const terms = chatLiveStoryLocationKeywords(location);
    const score = keywords.reduce((sum, keyword) => sum + (terms.some((term) => term.includes(keyword) || keyword.includes(term)) ? 1 : 0), 0);
    return { id: location.id, score };
  }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score);
  const actions = normalized.actions.filter((item) => item.locations.includes(fallback.locationId));
  const action = keywords.length && actions.length ? actions.map((item) => {
    const haystack = [item.name, item.action, item.spot, item.poseLabel, ...(item.stages || [])]
      .map((value) => String(value || "").toLowerCase()).join(" ");
    const stageTerm = CHAT_LIVE_STORY_STAGE_LABELS[fallback.stage] || "";
    const score = keywords.reduce((sum, keyword) => sum + (haystack.includes(keyword) ? 1 : 0), 0)
      + (stageTerm && haystack.includes(stageTerm) ? 0.5 : 0);
    return { id: item.id, score };
  }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score)[0] : null;
  return {
    ...fallback,
    requestedLocationId: scored.length ? scored[0].id : fallback.requestedLocationId,
    sceneActionHint: action?.id || fallback.actionId,
    sceneSource: "keywords",
  };
}

async function aiSelectChatLiveScene(selection = {}, { text = "", history = [] } = {}) {
  if (!ALIYUN_QWEN37_API_KEY) return null;
  const story = normalizeChatLiveStory(selection.story || {});
  if (!story.enabled || !story.locations.length) return null;
  const nodes = [
    ...story.locations.map((item) => ({ type: "location", id: item.id, name: item.name, desc: item.description, keywords: item.keywords })),
    ...story.actions.map((item) => ({
      type: "action", id: item.id, name: item.name, desc: item.action, locationIds: item.locations,
      stageIds: item.stages, spot: item.spot, pose: item.poseLabel,
    })),
    ...story.looks.map((item) => ({ type: item.kind, id: item.id, name: item.name })),
  ];
  const stageIds = story.stages.map((item) => item.id);
  const currentStage = stageIds.includes(selection.stage) ? selection.stage : stageIds[0];
  const currentLocationId = story.locations.some((item) => item.id === selection.locationId)
    ? selection.locationId
    : story.initialLocationId;
  const prompt = [
    "你是单人直播的画面导演。根据最新用户发言和最近对话，选择接下来最合适的画面节点。",
    "只输出 JSON：{\"stageId\":\"...\",\"locationId\":\"...\",\"actionId\":\"\",\"lookId\":\"\",\"reason\":\"...\"}。",
    "规则：locationId 必须是场景 id；actionId 必须属于该场景且与 stageId 兼容；lookId 只在用户明确要换外观、道具或背景时填；不确定就返回当前 stage/location 且 actionId/lookId 为空；不要生成 Markdown。",
    `阶段：${JSON.stringify(stageIds)}`,
    `当前阶段：${currentStage}`,
    `当前场景：${currentLocationId}`,
    `节点：${JSON.stringify(nodes)}`,
    `最近对话：${JSON.stringify((Array.isArray(history) ? history : []).slice(-4).map((item) => ({ role: item?.role || "user", content: String(item?.content || "").slice(0, 200) })))}`,
    `最新用户发言：${String(text || "").slice(0, 1000)}`,
    `关键词初选：${JSON.stringify({ stageId: currentStage, locationId: selection.locationId, actionId: selection.sceneActionHint || selection.actionId })}`,
  ].join("\n");
  const raw = await aliyunQwen37FlashRequest({
    model: QWEN37_FLASH_MODEL,
    messages: [{ role: "user", content: prompt }],
    enable_thinking: false,
    max_tokens: 240,
    temperature: 0.2,
  }, { timeoutMs: 12000 });
  const textResult = qwen37FlashResponseText(raw).replace(/^```(?:json)?|```$/g, "").trim();
  const start = textResult.indexOf("{");
  const end = textResult.lastIndexOf("}");
  const parsed = start >= 0 && end > start ? JSON.parse(textResult.slice(start, end + 1)) : {};
  const stageId = stageIds.includes(String(parsed.stageId || "")) ? String(parsed.stageId) : currentStage;
  const locationId = story.locations.some((item) => item.id === String(parsed.locationId || "")) ? String(parsed.locationId) : currentLocationId;
  const action = story.actions.find((item) => item.id === String(parsed.actionId || "")
    && item.locations.includes(locationId) && item.stages.includes(stageId)) || null;
  const look = story.looks.find((item) => item.id === String(parsed.lookId || "") && item.enabled !== false) || null;
  return {
    stageId,
    locationId,
    actionId: action?.id || "",
    lookId: look?.id || "",
    reason: String(parsed.reason || "").slice(0, 200),
  };
}

async function saveChatLiveSceneSelection(sessionId = "", selection = {}) {
  const id = String(sessionId || "").trim();
  if (!id) return null;
  const stage = CHAT_LIVE_STORY_STAGES.includes(String(selection.stage || "")) ? String(selection.stage) : "casual";
  const locationId = normalizeChatLiveStoryId(selection.locationId);
  const actionId = normalizeChatLiveStoryId(selection.actionId);
  const lookId = String(selection.lookId || "").trim().slice(0, 80);
  const lookKind = ["garment", "object", "background"].includes(String(selection.lookKind || "")) ? String(selection.lookKind) : "";
  const lookImageUrl = normalizeChatLiveStoryUrl(selection.lookImageUrl);
  const lookUserText = String(selection.lookUserText || "").trim().slice(0, 200);
  const recentActionIds = (Array.isArray(selection.recentActionIds) ? selection.recentActionIds : [])
    .map((item) => normalizeChatLiveStoryId(item)).filter(Boolean).slice(-8);
  const lastSwitchAt = String(selection.lastSwitchAt || "").trim().slice(0, 40);
  const { rows } = await dbQuery(`
    UPDATE app_chat_live_sessions
    SET payload = jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(
                  jsonb_set(
                    jsonb_set(COALESCE(payload, '{}'::jsonb), '{liveStoryStage}', to_jsonb($2::text), true),
                  '{liveStoryLocationId}', to_jsonb($3::text), true),
                '{liveStoryRecentActionIds}', $4::jsonb, true),
              '{liveStoryLastSwitchAt}', to_jsonb($5::text), true),
            '{liveStoryLookId}', to_jsonb($6::text), true),
          '{liveStoryLookKind}', to_jsonb($7::text), true),
        '{liveStoryLookImageUrl}', to_jsonb($8::text), true),
      '{updatedAt}', to_jsonb($9::text), true),
      updated_at = $9::timestamptz
    WHERE id = $1
    RETURNING payload
  `, [id, stage, locationId, JSON.stringify(recentActionIds), lastSwitchAt, lookId, lookKind, lookImageUrl, new Date().toISOString()]);
  const payload = rows[0]?.payload || null;
  if (payload && lookId && lookKind && lookImageUrl) {
    payload.liveStoryLookUserText = lookUserText;
  }
  return payload;
}

function publicChatLiveStory(raw = {}) {
  const story = normalizeChatLiveStory(raw);
  if (!story.enabled || !story.locations.length) return null;
  return {
    enabled: true,
    initialLocationId: story.initialLocationId,
    switchCooldownSeconds: story.switchCooldownSeconds,
    stages: story.stages.map((id) => ({ id, label: CHAT_LIVE_STORY_STAGE_LABELS[id] || id })),
    locations: story.locations.map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      imageUrl: item.imageUrl,
      lookId: item.lookId,
    })),
    actions: story.actions.map((item) => ({
      id: item.id,
      name: item.name,
      stages: item.stages,
      locations: item.locations,
      imageUrl: item.imageUrl,
      videoUrl: item.videoUrl,
      spot: item.spot,
      poseLabel: item.poseLabel,
      action: item.action,
    })),
  };
}

function chatLiveStoryStageForText(text = "", currentStage = "casual", history = []) {
  const latest = String(text || "").trim();
  const mapped = chatSceneStage(latest, Array.isArray(history) ? history : [], null);
  if (mapped && CHAT_LIVE_STORY_STAGES.includes(mapped)) return mapped;
  return CHAT_LIVE_STORY_STAGES.includes(currentStage) ? currentStage : "casual";
}

const CHAT_LIVE_STORY_LOCATION_ALIASES = {
  kitchen: ["厨房", "灶台", "做饭"],
  living_room: ["客厅", "沙发", "茶几"],
  bedroom: ["卧室", "床上", "床边", "枕头"],
  bathroom: ["浴室", "卫生间", "淋浴", "浴缸"],
  balcony: ["阳台", "露台"],
  study: ["书房", "书桌"],
  dining_room: ["餐厅", "餐桌"],
  entryway: ["玄关", "门口"],
};

function chatLiveStoryLocationKeywords(location = {}) {
  const id = normalizeChatLiveStoryId(location.id);
  const values = [
    location.name,
    id.replace(/[_-]+/g, " "),
    ...String(location.keywords || "").split(/[,，、\n]/),
    ...String(location.description || "").split(/[,，、。；;:：\n]/),
    ...(CHAT_LIVE_STORY_LOCATION_ALIASES[id] || []),
  ];
  return [...new Set(values.map((item) => String(item || "").trim().toLowerCase()).filter((item) => item.length >= 2))]
    .sort((a, b) => b.length - a.length)
    .slice(0, 20);
}

function chatLiveStoryLocationForText(story = {}, text = "", currentLocationId = "") {
  const normalizedText = String(text || "").trim().toLowerCase();
  if (!normalizedText) return "";
  const matches = [];
  for (const location of Array.isArray(story.locations) ? story.locations : []) {
    for (const keyword of chatLiveStoryLocationKeywords(location)) {
      let from = 0;
      while (from < normalizedText.length) {
        const index = normalizedText.indexOf(keyword, from);
        if (index < 0) break;
        const before = normalizedText.slice(Math.max(0, index - 8), index);
        const negated = /(?:不去|别去|不要去|不想去|不回|别回|不要回|离开)[^，。！？!?]{0,4}$/u.test(before);
        if (!negated) matches.push({ id: location.id, keyword, index, length: keyword.length });
        from = index + keyword.length;
      }
    }
  }
  if (!matches.length) return "";
  matches.sort((a, b) => b.length - a.length || a.index - b.index);
  const best = matches[0];
  /* Prefer the current room when phrases mention both it and a merely visible
     adjacent area, unless the longer match names a different destination. */
  const current = normalizeChatLiveStoryId(currentLocationId);
  if (best.id === current) return current;
  return best.id;
}

