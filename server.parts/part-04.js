function buildGeoCoverage(snapshot, visitorStats = {}, indexNowHistory = []) {
  const characters = snapshot.characters || [];
  const total = characters.length;
  const topics = [...(snapshot.tags || []), ...(snapshot.categories || [])];
  const withSummary = characters.filter((item) => item.geoSummary && item.geoSummary.length > 40).length;
  const withTags = characters.filter((item) => (item.geoTags || []).length > 0).length;
  const withPoster = characters.filter((item) => item.geoPoster && !String(item.geoPoster).includes("default-hero")).length;
  const withVideos = characters.filter((item) => (item.geoVideos || []).length > 0).length;
  const withThreeVideos = characters.filter((item) => (item.geoVideos || []).length >= 3).length;
  const withFaq = characters.filter((item) => characterFaqForGeo(item).length >= 3).length;
  const topicsWithIntro = topics.filter((item) => item.intro && item.intro.length > 160).length;
  const topicsWithFaq = topics.filter((item) => Array.isArray(item.faq) && item.faq.length >= 3).length;
  const byPath = visitorStats.byPath || {};
  const visitedCharacterPaths = Object.keys(byPath).filter((pathname) => /^\/characters\/[^/]+\/?$/.test(pathname));
  const topicCount = (snapshot.tags?.length || 0) + (snapshot.categories?.length || 0);
  const visitedPathCount = Object.keys(byPath).length;
  const metrics = [
    geoCoverageMetric("摘要", withSummary, total),
    geoCoverageMetric("标签", withTags, total),
    geoCoverageMetric("封面", withPoster, total),
    geoCoverageMetric("视频", withVideos, total),
    geoCoverageMetric("主题页", Math.min(topicCount, 20), 20),
    geoCoverageMetric("角色问答", withFaq, total),
    geoCoverageMetric("主题介绍", topicsWithIntro, topics.length),
    geoCoverageMetric("主题问答", topicsWithFaq, topics.length),
    geoCoverageMetric("3 个以上视频", withThreeVideos, total),
    geoCoverageMetric("真实访问页", Math.min(visitedPathCount, 20), 20),
  ];
  const contentPercent = total
    ? Math.round(((withSummary + withTags + withPoster + withVideos) / (total * 4)) * 100)
    : 0;
  const qualityPercent = Math.round((
    (total ? (withSummary / total) : 0) +
      (total ? (withTags / total) : 0) +
      (total ? (withVideos / total) : 0) +
      (total ? (withFaq / total) : 0) +
      (topics.length ? (topicsWithIntro / topics.length) : 0) +
      (topics.length ? (topicsWithFaq / topics.length) : 0)
  ) / 6 * 100);
  const submitted = indexNowHistory.length > 0;
  const visitorSeen = Number(visitorStats.total || 0) > 0;
  const score = Math.min(100, Math.round(
    (total ? 30 : 0) +
      contentPercent * 0.45 +
      (submitted ? 12 : 0) +
      (visitorSeen ? 13 : 0),
  ));
  const issues = [];
  characters.forEach((item) => {
    const missing = [];
    if (!item.geoSummary || item.geoSummary.length <= 40) missing.push("摘要");
    if (!(item.geoTags || []).length) missing.push("标签");
    if (!item.geoPoster || String(item.geoPoster).includes("default-hero")) missing.push("封面");
    if (!(item.geoVideos || []).length) missing.push("视频");
    if (missing.length) {
      issues.push({
        id: item.id,
        name: item.name || item.title || item.id,
        path: item.geoPath,
        missing,
      });
    }
  });
  return {
    score,
    status: score >= 85 ? "healthy" : score >= 65 ? "warming up" : "needs work",
    contentPercent,
    qualityPercent,
    metrics,
    qualityMetrics: [
      geoCoverageMetric("角色摘要", withSummary, total),
      geoCoverageMetric("角色标签", withTags, total),
      geoCoverageMetric("角色视频", withVideos, total),
      geoCoverageMetric("角色问答", withFaq, total),
      geoCoverageMetric("主题介绍", topicsWithIntro, topics.length),
      geoCoverageMetric("主题问答", topicsWithFaq, topics.length),
    ],
    topTags: topGeoTags(snapshot),
    issues: issues.slice(0, 24),
    issueCount: issues.length,
    visitedCharacterPathCount: visitedCharacterPaths.length,
    visitedPathCount,
    submitted,
    lastIndexNow: indexNowHistory[0] || null,
  };
}

function buildGeoOffsitePlan(snapshot) {
  const brand = snapshot.brand || "Vipeak AI";
  const origin = snapshot.origin || "";
  const tags = (snapshot.tags || []).slice(0, 8).map((item) => item.label || item.id).filter(Boolean);
  const characters = (snapshot.characters || []).slice(0, 6);
  const sampleCharacter = characters[0] || {};
  const sampleCharacterUrl = sampleCharacter.geoUrl || scopedApiUrl(origin, sampleCharacter.geoPath || "/");
  const sampleTag = (snapshot.tags || [])[0] || {};
  const sampleTagUrl = sampleTag.url || scopedApiUrl(origin, sampleTag.path || "/tags/ai-character-video");
  const createUrl = scopedApiUrl(origin, "/create");
  const homepageUrl = scopedApiUrl(origin, "/");
  const platformRows = [
    {
      group: "AI 工具目录",
      platforms: "Futurepedia, There's An AI For That, Toolify, AI Tool Hunt",
      purpose: "建立可被索引和引用的第三方 AI 工具信源。",
      cadence: "先提交一次，重大功能变化后再更新。",
      contentType: "产品收录",
      priority: "P0",
    },
    {
      group: "产品发布社区",
      platforms: "Product Hunt, Betalist, Indie Hackers",
      purpose: "建立品牌发布页，统一产品描述和回链。",
      cadence: "集中发布一次，之后每月更新。",
      contentType: "发布帖",
      priority: "P0",
    },
    {
      group: "长文平台",
      platforms: "Medium, Substack, Hashnode, dev.to",
      purpose: "围绕角色视频生成问题发布解答型指南。",
      cadence: "每周 2-3 篇，先完成前 20 篇。",
      contentType: "指南 / 对比",
      priority: "P1",
    },
    {
      group: "问答发现",
      platforms: "Quora, Reddit communities, niche AI forums",
      purpose: "回答真实问题，并指向相关主题页或角色页。",
      cadence: "每周 3-5 条有用回答。",
      contentType: "问答回复",
      priority: "P1",
    },
    {
      group: "视频 / 社媒信源",
      platforms: "YouTube Shorts, X, TikTok-safe previews where allowed",
      purpose: "给爬虫和用户提供生成视频样例的站外引用。",
      cadence: "每周 3 条短内容。",
      contentType: "短视频说明",
      priority: "P2",
    },
    {
      group: "搜索提交",
      platforms: "Google Search Console, Bing Webmaster, IndexNow",
      purpose: "新主题页或站外内容发布后，加速发现。",
      cadence: "每批内容发布后执行。",
      contentType: "站点地图 / URL 提交",
      priority: "P0",
    },
  ];
  const keywordSets = [
    {
      label: "搜索词",
      terms: [
        "AI character video generator",
        "image to video AI character",
        "AI companion video generator",
        "realistic AI girlfriend video generator",
        "anime character video generator",
        "create AI roleplay videos",
      ],
    },
    {
      label: "问答词",
      terms: [
        "How do I turn an AI character image into a video?",
        "What is the best AI tool for consistent character videos?",
        "Can I create short AI companion videos from one image?",
        "How do AI girlfriend video generators keep the same character?",
        "Where can I find AI character video examples?",
      ],
    },
    {
      label: "场景词",
      terms: [
        "walking character video",
        "talking AI avatar scene",
        "cinematic portrait video",
        "AI roleplay video scene",
        "image reference character animation",
        "short vertical AI video",
      ],
    },
  ];
  const drafts = [
    {
      id: "ai-directory-listing",
      channel: "AI 工具目录",
      platform: "Futurepedia / Toolify / There's An AI For That",
      title: `${brand} - AI character video generator for image-to-video scenes`,
      link: homepageUrl,
      summary: `${brand} helps creators explore AI character profiles, preview short video scenes, and generate character-focused image-to-video clips from simple prompts or reference images.`,
      body: [
        `${brand} is an AI character video platform for creators who want fast image-to-video workflows, public character examples, and reusable scene references.`,
        `Core use cases include AI companion videos, cinematic portrait clips, roleplay-style character scenes, and short vertical videos for social content.`,
        `Useful pages to cite: homepage ${homepageUrl}, create flow ${createUrl}, sample character ${sampleCharacterUrl}.`,
      ].join("\n\n"),
      cta: `Visit ${homepageUrl} to explore characters and generation examples.`,
      keywords: ["AI character video", "image to video", "AI companion", "character generator"],
      status: "Ready",
    },
    {
      id: "longform-guide",
      channel: "长文文章",
      platform: "Medium / Substack / Hashnode",
      title: "How to create AI character videos from a single reference image",
      link: createUrl,
      summary: "A practical guide explaining image-to-video character generation, reference images, prompt writing, and how to evaluate results.",
      body: [
        "AI character video generation works best when the source image, motion intent, and output format are clear. Start with a clean character reference, then describe the action in plain language.",
        `On ${brand}, users can browse public character examples, pick a visual direction, and create short video scenes without exposing advanced model settings.`,
        `For discovery, link the guide to a relevant character page such as ${sampleCharacterUrl} and a tag page such as ${sampleTagUrl}.`,
      ].join("\n\n"),
      cta: `Try the create flow: ${createUrl}`,
      keywords: ["image to video", "character consistency", "AI video guide"],
      status: "Ready",
    },
    {
      id: "qa-answer",
      channel: "问答回复",
      platform: "Quora / Reddit / AI forums",
      title: "What is a good AI character video generator for short vertical scenes?",
      link: sampleTagUrl,
      summary: "Answer-style post that compares the decision criteria and links to a relevant tag/topic page.",
      body: [
        "A good AI character video generator should make three things easy: choosing a character reference, describing the action, and previewing examples before spending credits.",
        `${brand} is built around character profiles and short scene previews, so users can start from examples instead of configuring every technical parameter.`,
        `For examples, see ${sampleTagUrl}. For direct generation, use ${createUrl}.`,
      ].join("\n\n"),
      cta: `Open examples: ${sampleTagUrl}`,
      keywords: ["best AI video generator", "vertical AI video", "character examples"],
      status: "Ready",
    },
    {
      id: "product-launch",
      channel: "发布帖",
      platform: "Product Hunt / Indie Hackers",
      title: `${brand}: create AI character videos from images and prompts`,
      link: homepageUrl,
      summary: "Launch copy that explains the product clearly without overloading users with model names.",
      body: [
        `${brand} is a creator-focused AI character video platform. It combines public character discovery, short video previews, and a simplified create flow for image-to-video and prompt-driven scenes.`,
        "The product is designed for users who want visual examples first, then a fast path to generate their own character videos.",
        `Explore the site at ${homepageUrl} or start creating at ${createUrl}.`,
      ].join("\n\n"),
      cta: `Launch page link: ${homepageUrl}`,
      keywords: ["Product Hunt", "AI video", "creator tool"],
      status: "Ready",
    },
    {
      id: "short-demo-script",
      channel: "短视频说明",
      platform: "YouTube Shorts / X / allowed social channels",
      title: "Turn one character image into a short AI video",
      link: createUrl,
      summary: "Short caption and script for a demo post.",
      body: [
        "Caption: Turn a single character reference into a short cinematic AI video.",
        "Script: Pick a character, add a reference image or prompt, choose the video flow, and preview the result in the result tab.",
        `Link: ${createUrl}`,
      ].join("\n\n"),
      cta: `Create a scene: ${createUrl}`,
      keywords: ["AI demo", "image to video", "short video"],
      status: "Draft",
    },
    {
      id: "brand-source-note",
      channel: "品牌源说明",
      platform: "GitHub Pages / public docs / brand profile",
      title: `${brand} public product note for AI search`,
      link: homepageUrl,
      summary: "A concise public source page that repeats the canonical brand description and important URLs.",
      body: [
        `${brand} is an AI character video generation site focused on discoverable character profiles, short video examples, and simple creation workflows.`,
        `Canonical homepage: ${homepageUrl}`,
        `Sitemap: ${scopedApiUrl(origin, "/sitemap.xml")}`,
        `LLM reference: ${scopedApiUrl(origin, "/llms.txt")}`,
      ].join("\n"),
      cta: `Use the canonical homepage when citing the product: ${homepageUrl}`,
      keywords: ["brand source", "AI search", "canonical"],
      status: "Ready",
    },
  ];
  const schedule = [
    { week: "第 1 周", task: "提交 AI 工具目录收录，并准备 Product Hunt / Indie Hackers 发布资料。", goal: "建立第一批站外品牌引用。" },
    { week: "第 1 周", task: "发布 3 篇长文解答，分别回链首页、生成页、一个标签页和一个角色页。", goal: "沉淀可抓取的站外问答内容。" },
    { week: "第 2 周", task: "回答 5 个真实问答或论坛问题，内容要有帮助，避免广告式灌水。", goal: "建立自然的问题答案引用。" },
    { week: "第 2 周", task: "发布 3 条短视频说明，链接到主题页或生成页。", goal: "补充社媒和视频信源。" },
    { week: "持续", task: "每批内容发布后提交 sitemap / IndexNow，并检查爬虫是否访问主题页和角色页。", goal: "闭合发布到抓取的链路。" },
  ];
  return {
    updatedAt: new Date().toISOString(),
    brand,
    homepageUrl,
    createUrl,
    sampleCharacterUrl,
    sampleTagUrl,
    platformRows,
    keywordSets,
    drafts,
    schedule,
    discoveredTags: tags,
  };
}

async function recordGeoCrawlerVisit(req, url) {
  try {
    if (!isGeoPublicPath(url.pathname)) return;
    const crawler = classifyGeoCrawler(req);
    if (!crawler) return;
    await recordGeoCrawlerVisitInDb({
      bot: crawler.id,
      pagePath: url.pathname || "/",
      ip: requestIpForStats(req),
      userAgent: compactPlainText(crawler.userAgent, 180),
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    console.warn("Failed to record GEO crawler visit:", error.message || error);
  }
}

async function recordGeoVisitorStats(req, url) {
  try {
    if (req.method !== "GET" && req.method !== "HEAD") return;
    if (!isGeoVisitorPath(url.pathname)) return;
    if (isLikelyAutomatedGeoRequest(req)) return;
    const ip = requestIpForStats(req);
    await recordGeoVisitorVisitInDb({
      pagePath: url.pathname || "/",
      country: requestCountryCode(req) || "UNKNOWN",
      ipHash: ipHashForStats(ip),
      ipMasked: maskIpForStats(ip),
      userAgent: compactPlainText(req.headers["user-agent"] || "", 180),
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    console.warn("Failed to record GEO visitor stats:", error.message || error);
  }
}

async function recordGeoVisitStats(req, url) {
  if (!GEO_VISIT_STATS_ENABLED) return;
  await recordGeoCrawlerVisit(req, url);
  await recordGeoVisitorStats(req, url);
}

function jsonLdScript(data) {
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;
}

function jsonScriptValue(data) {
  return JSON.stringify(data ?? {}).replace(/</g, "\\u003c");
}

function geoMetaTags({ title, description, url, image, type = "website", jsonLd = [] }) {
  let verificationToken = "";
  try {
    verificationToken = siteVerificationToken(
      new URL(url).hostname,
      GOOGLE_SITE_VERIFICATION,
      GOOGLE_SITE_VERIFICATION_BY_HOST,
    );
  } catch {}
  const verificationTag = verificationToken
    ? `\n    <meta name="google-site-verification" content="${htmlEscape(verificationToken)}" />`
    : "";
  const imageTag = image ? `
    <meta property="og:image" content="${htmlEscape(image)}" />
    <meta property="og:image:secure_url" content="${htmlEscape(image)}" />
    <meta property="og:image:type" content="image/png" />
    <meta property="og:image:width" content="512" />
    <meta property="og:image:height" content="512" />
    <meta name="twitter:image" content="${htmlEscape(image)}" />` : "";
  const ld = (Array.isArray(jsonLd) ? jsonLd : [jsonLd]).filter(Boolean).map(jsonLdScript).join("\n    ");
  return `
    <title>${htmlEscape(title)}</title>
    <meta name="description" content="${htmlEscape(description)}" />
    <meta name="robots" content="index,follow,max-image-preview:large,max-video-preview:30,max-snippet:-1" />${verificationTag}
    <link rel="canonical" href="${htmlEscape(url)}" />
    <meta property="og:type" content="${htmlEscape(type)}" />
    <meta property="og:title" content="${htmlEscape(title)}" />
    <meta property="og:description" content="${htmlEscape(description)}" />
    <meta property="og:url" content="${htmlEscape(url)}" />${imageTag}
    <meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}" />
    <meta name="twitter:title" content="${htmlEscape(title)}" />
    <meta name="twitter:description" content="${htmlEscape(description)}" />
    ${ld}`;
}

function injectPlatformGeoHead(html = "", snapshot, tenantOptions = null) {
  const { origin, brand, platform } = snapshot;
  const canonical = scopedApiUrl(origin, "/");
  const tenant = tenantOptions?.tenant || tenantOptions || {};
  const displayBrand = tenant.brand || brand;
  const description = tenant.description || homeDescriptionForGeo(platform);
  const image = absoluteUrlFromBase("/assets/brand/vipeak-google-logo.png?v=share-20260827-2", origin);
  const title = tenant.title || `${displayBrand} | AI Character Video Generator`;
  const sameAs = [VIPEAK_X_URL, VIPEAK_TELEGRAM_CHANNEL_URL];
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: displayBrand,
      url: canonical,
      description,
      sameAs,
      potentialAction: {
        "@type": "SearchAction",
        target: `${canonical}?q={search_term_string}`,
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: displayBrand,
      applicationCategory: "MultimediaApplication",
      operatingSystem: "Web",
      url: canonical,
      description,
      sameAs,
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "customer support",
        url: VIPEAK_TELEGRAM_SUPPORT_URL,
      },
      offers: {
        "@type": "Offer",
        priceCurrency: "USD",
      },
    },
  ];
  const tags = geoMetaTags({ title, description, url: canonical, image, jsonLd });
  const toolId = String(tenant.toolId || "").trim().toLowerCase();
  let withTenantShell = html;
  if (tenant.toolOnly && toolId) {
    withTenantShell = withTenantShell.replace(/<body\s+class="([^"]*)"/i, (match, classText) => {
      const classes = String(classText || "").split(/\s+/).filter(Boolean);
      const nextClasses = Array.from(new Set([...classes, "tenant-tool-shell", `tenant-tool-${toolId}`]));
      return match.replace(`class="${classText}"`, `class="${nextClasses.join(" ")}"`);
    });
    if (displayBrand) {
      withTenantShell = withTenantShell.replace(
        /(<h1\s+id="brandName"[^>]*>)([\s\S]*?)(<\/h1>)/i,
        `$1${htmlEscape(displayBrand)}$3`,
      );
      withTenantShell = withTenantShell.replace(
        /(<footer\s+class="site-foot"[\s\S]*?<strong>)([\s\S]*?)(<\/strong>)/i,
        `$1${htmlEscape(displayBrand)}$3`,
      );
    }
  }
  if (toolId === "video") {
    withTenantShell = withTenantShell
      .replace(/class="top-tab\s+is-active"\s+data-tab="gallery"/i, `class="top-tab" data-tab="gallery"`)
      .replace(/class="top-tab"\s+data-gallery-shortcut="playflux-video"/i, `class="top-tab is-active" data-gallery-shortcut="playflux-video"`);
    ["gallery", "characters", "advanced", "workflow", "referral", "access"].forEach((tab) => {
      withTenantShell = withTenantShell.replace(
        new RegExp(`(<button\\s+class="top-tab"\\s+data-tab="${tab}"\\s+)(type="button")`, "i"),
        "$1hidden $2",
      );
    });
    ["playflux-anime", "playflux-image"].forEach((shortcut) => {
      withTenantShell = withTenantShell.replace(
        new RegExp(`(<button\\s+class="top-tab"\\s+data-gallery-shortcut="${shortcut}"\\s+)(type="button")`, "i"),
        "$1hidden $2",
      );
    });
  }
  if (tenant.siteProfile && !toolId) {
    const profileTab = String(tenant.defaultTab || "").trim();
    const activeNavTab = tenant.defaultRoute === "custom" ? "custom" : profileTab;
    // First paint should already match the profile: highlight the entry the
    // profile lands on and hide the tabs it does not expose (the client
    // re-applies the same rules after the feature bootstrap loads).
    withTenantShell = withTenantShell.replace(
      /class="top-tab\s+is-active"\s+data-tab="gallery"/i,
      `class="top-tab" data-tab="gallery"`,
    );
    if (activeNavTab) {
      withTenantShell = withTenantShell.replace(
        new RegExp(`class="top-tab"\\s+data-tab="${activeNavTab}"`, "i"),
        `class="top-tab is-active" data-tab="${activeNavTab}"`,
      );
    }
    (tenant.disabledTabs || []).forEach((tab) => {
      withTenantShell = withTenantShell.replace(
        new RegExp(`(<button\\s+class="top-tab"\\s+data-tab="${tab}"\\s+)(type="button")`, "i"),
        "$1hidden $2",
      );
    });
    (tenant.hiddenNavTabs || []).forEach((tab) => {
      withTenantShell = withTenantShell.replace(
        new RegExp(`(<button\\s+class="top-tab"\\s+data-tab="${tab}"\\s+)(type="button")`, "i"),
        "$1hidden $2",
      );
    });
    // Cases are a main-site navigation entry. Profile hosts keep their own
    // reduced navigation, so hide it in the first paint before the client
    // feature bootstrap applies allowedTabs.
    withTenantShell = withTenantShell.replace(
      /(<button\s+class="top-tab"\s+data-tab="cases"\s+)(type="button")/i,
      "$1hidden $2",
    );
    ["playflux-video", "playflux-anime", "playflux-image"].forEach((shortcut) => {
      withTenantShell = withTenantShell.replace(
        new RegExp(`(<button\\s+class="top-tab"\\s+data-gallery-shortcut="${shortcut}"\\s+)(type="button")`, "i"),
        "$1hidden $2",
      );
    });
    // The profile ships its own brand + styling instead of inheriting the main
    // site look: body class, stylesheet, favicon, logo, and the brand link that
    // returns to the welcome page.
    if (PLATFORM_SITE_PROFILE.bodyClass) {
      withTenantShell = withTenantShell.replace(/<body\s+class="([^"]*)"/i, (match, classText) => {
        const classes = String(classText || "").split(/\s+/).filter(Boolean);
        // home-active hides the shell chrome so the very first paint is the
        // profile's welcome page instead of the workspace navigation.
        const extra = [PLATFORM_SITE_PROFILE.bodyClass, profileTab === "home" ? "home-active" : ""];
        const nextClasses = Array.from(new Set([...classes, ...extra.filter(Boolean)]));
        return match.replace(`class="${classText}"`, `class="${nextClasses.join(" ")}"`);
      });
    }
    if (tenant.navHome) {
      withTenantShell = withTenantShell.replace(
        /<button\b[^>]*data-tab="home"[^>]*>/i,
        (tag) => tag.replace(/\s+hidden(?=[\s>])/i, ""),
      );
    }
    // Only the profile's landing panel is visible on first paint.
    if (profileTab) {
      withTenantShell = withTenantShell.replace(/<section\b[^>]*data-panel="[^"]+"[^>]*>/gi, (tag) => {
        const panel = (tag.match(/data-panel="([^"]+)"/i) || [])[1] || "";
        const withoutHidden = tag.replace(/\s+hidden(?=[\s>])/i, "");
        return panel === profileTab ? withoutHidden : withoutHidden.replace(/>$/, " hidden>");
      });
    }
    if (PLATFORM_SITE_PROFILE.stylesheet) {
      withTenantShell = withTenantShell.replace(
        /<\/head>/i,
        `    <link rel="stylesheet" href="./${PLATFORM_SITE_PROFILE.stylesheet}?v=${SITE_PROFILE_STYLE_VERSION}" />\n  </head>`,
      );
    }
    withTenantShell = withTenantShell.replace(
      /<\/body>/i,
      `    <script src="./site-123vipfans.js?v=${SITE_PROFILE_SCRIPT_VERSION}" defer></script>\n  </body>`,
    );
    if (PLATFORM_SITE_PROFILE.favicon) {
      withTenantShell = withTenantShell
        .replace(/<link rel="icon"[^>]*>/i, `<link rel="icon" type="image/png" href="${PLATFORM_SITE_PROFILE.favicon}" />`)
        .replace(/<link rel="shortcut icon"[^>]*>/i, `<link rel="shortcut icon" href="${PLATFORM_SITE_PROFILE.favicon}" />`);
    }
    if (PLATFORM_SITE_PROFILE.logo) {
      withTenantShell = withTenantShell.replace(
        /(<span class="brand-mark"><img src=")[^"]*(")/i,
        `$1${PLATFORM_SITE_PROFILE.logo}$2`,
      );
    }
    withTenantShell = withTenantShell.replace(/(<a class="brand" href=")[^"]*(")/i, "$1#home$2");
  }
  const discoveryLinks = renderDiscoveryLinks(snapshot);
  if (discoveryLinks) {
    withTenantShell = withTenantShell.replace(/<footer\s+class="site-foot"/i, `${discoveryLinks}\n\n    <footer class="site-foot"`);
  }
  const bootstrapScript = (tenant.toolOnly && toolId) || tenant.siteProfile
    ? `    <script>window.__TENANT_FEATURES__=${jsonScriptValue(publicTenantFeatures(tenant))};</script>\n`
    : "";
  let withToolStyles = bootstrapScript && !withTenantShell.includes("window.__TENANT_FEATURES__")
    ? withTenantShell.replace(/<\/head>/i, `${bootstrapScript}  </head>`)
    : withTenantShell;
  if (toolId === "video" && !withToolStyles.includes("tool-video.css")) {
    withToolStyles = withToolStyles.replace(/<\/head>/i, `    <link rel="preload" href="./tool-video.css?v=${TOOL_VIDEO_STYLE_VERSION}" as="style" onload="this.onload=null;this.rel='stylesheet'" />\n    <noscript><link rel="stylesheet" href="./tool-video.css?v=${TOOL_VIDEO_STYLE_VERSION}" /></noscript>\n  </head>`);
  }
  if (toolId === "undress" && !withToolStyles.includes("tool-undress.css")) {
    withToolStyles = withToolStyles.replace(
      /<\/head>/i,
      `    <link rel="preload" href="https://media.123vips.com/assets/home/ambient/home-ambient-poster.webp" as="image" fetchpriority="high" />\n    <link rel="stylesheet" href="./tool-undress.css?v=${TOOL_UNDRESS_STYLE_VERSION}" />\n  </head>`,
    );
  }
  const withoutTitle = withToolStyles.replace(/<title>[\s\S]*?<\/title>/i, "");
  return withoutTitle.replace(/<\/head>/i, `${tags}\n  </head>`);
}

function renderCharacterGeoHtml(snapshot, item = {}) {
  const { origin, brand } = snapshot;
  const url = scopedApiUrl(origin, characterPublicPath(item));
  const poster = absoluteUrlFromBase(characterPosterForGeo(item), origin);
  const name = compactPlainText(item.name || item.title || "AI Character", 90);
  const duplicateNameCount = (snapshot.characters || []).filter((candidate) => (
    compactPlainText(candidate.name || candidate.title || "AI Character", 90).toLowerCase() === name.toLowerCase()
  )).length;
  const distinctiveTags = characterTagsForGeo(item, 8)
    .filter((tag) => !/^(adult|female|realistic)$/i.test(tag))
    .slice(0, 2);
  const titleQualifier = duplicateNameCount > 1 && distinctiveTags.length
    ? ` - ${distinctiveTags.join(", ")}`
    : "";
  const title = `${name}${titleQualifier} | ${brand}`;
  const description = characterSummaryForGeo(item);
  const tags = characterTagsForGeo(item, 12);
  const videos = item.geoVideos || addCharacterVideoDescriptionsForGeo(item);
  const related = relatedCharactersForGeo(snapshot, item, 6);
  const faq = characterFaqForGeo({ ...item, geoVideos: videos });
  const facts = [
    item.age ? `Age style: ${compactPlainText(item.age, 30)}` : "",
    item.style ? `Style: ${compactPlainText(item.style, 80)}` : "",
    item.sourceDisplayId ? `Profile ID: ${compactPlainText(item.sourceDisplayId, 80)}` : "",
    `${videos.length} listed video ${videos.length === 1 ? "scene" : "scenes"}`,
  ].filter(Boolean);
  const videoLd = videos.map((video, index) => ({
    "@type": "VideoObject",
    name: video.title || `${name} video ${index + 1}`,
    description: video.description || `${name} preview scene ${index + 1}.`,
    thumbnailUrl: [absoluteUrlFromBase(video.posterUrl || characterPosterForGeo(item), origin)].filter(Boolean),
    uploadDate: item.createdAt || new Date().toISOString(),
    isAccessibleForFree: index === 0,
  }));
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "ProfilePage",
      name: title,
      url,
      description,
      primaryImageOfPage: poster ? { "@type": "ImageObject", url: poster } : undefined,
      mainEntity: {
        "@type": "Person",
        name,
        description,
        image: poster || undefined,
        knowsAbout: tags,
      },
      hasPart: videoLd,
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: brand, item: scopedApiUrl(origin, "/") },
        { "@type": "ListItem", position: 2, name: "Characters", item: scopedApiUrl(origin, "/#gallery") },
        { "@type": "ListItem", position: 3, name, item: url },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faq.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: item.answer,
        },
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: `${name} video scenes`,
      itemListElement: videos.map((video, index) => ({
        "@type": "ListItem",
        position: index + 1,
        item: {
          "@type": "VideoObject",
          name: video.title || `${name} video ${index + 1}`,
          description: video.description || `${name} preview scene ${index + 1}.`,
          thumbnailUrl: [absoluteUrlFromBase(video.posterUrl || characterPosterForGeo(item), origin)].filter(Boolean),
          isAccessibleForFree: index === 0,
        },
      })),
    },
    ...videoLd.map((video) => ({ "@context": "https://schema.org", ...video })),
  ];
  const videoCards = videos.length ? videos.map((video, index) => `
          <article class="video-card">
            <img src="${htmlEscape(absoluteUrlFromBase(video.posterUrl || characterPosterForGeo(item), origin))}" alt="${htmlEscape(video.title || `${name} video`)}" loading="lazy" />
            <div>
              <strong>${htmlEscape(video.title || `Video ${index + 1}`)}</strong>
              <span>${index === 0 ? "Preview available after sign in" : "Unlock in app"}</span>
              <p>${htmlEscape(video.description || "")}</p>
            </div>
          </article>`).join("") : `<p class="muted">No public video previews are configured yet.</p>`;
  const relatedCards = related.length ? related.map((candidate) => `
          <a class="related-card" href="${htmlEscape(candidate.geoPath)}">
            <img src="${htmlEscape(absoluteUrlFromBase(candidate.geoPoster, origin))}" alt="${htmlEscape(candidate.name || candidate.title || "Related character")}" loading="lazy" />
            <span>${htmlEscape(candidate.name || candidate.title || candidate.id)}</span>
          </a>`).join("") : "";
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    ${geoMetaTags({ title, description, url, image: poster, type: "profile", jsonLd })}
    <style>
      :root { color-scheme: dark; --bg:#0b0b0f; --panel:#15151d; --line:rgba(255,255,255,.12); --ink:#f7f4fb; --muted:#aaa3b6; --pink:#ff45aa; }
      * { box-sizing: border-box; }
      body { margin:0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background:#0b0b0f; color:var(--ink); }
      main { width:min(1120px, calc(100% - 32px)); margin:0 auto; padding:32px 0 56px; }
      a { color:inherit; text-decoration:none; }
      .back { display:inline-flex; margin-bottom:18px; color:var(--muted); font-weight:700; }
      .hero { display:grid; grid-template-columns:minmax(240px, 360px) minmax(0, 1fr); gap:28px; align-items:end; }
      .hero img { width:100%; aspect-ratio:9/13; object-fit:cover; border-radius:18px; border:1px solid var(--line); background:#222; }
      .eyebrow { color:var(--pink); text-transform:uppercase; letter-spacing:.16em; font-size:12px; font-weight:900; }
      h1 { margin:.2em 0; font-size:clamp(36px, 6vw, 72px); line-height:.95; }
      p { color:var(--muted); line-height:1.7; font-size:16px; }
      .tags { display:flex; gap:8px; flex-wrap:wrap; margin:18px 0; }
      .tags span { padding:8px 12px; border:1px solid var(--line); border-radius:999px; background:rgba(255,255,255,.06); color:#ddd7e8; font-weight:700; font-size:13px; }
      .cta { display:inline-flex; align-items:center; justify-content:center; min-height:46px; padding:0 20px; border-radius:999px; background:var(--pink); color:white; font-weight:900; }
      .info { margin-top:28px; display:grid; grid-template-columns:1.1fr .9fr; gap:18px; }
      .panel { border:1px solid var(--line); border-radius:18px; padding:20px; background:rgba(255,255,255,.045); }
      .panel h2 { margin:0 0 10px; font-size:22px; }
      .facts { margin:0; padding:0; list-style:none; display:grid; gap:8px; color:#ddd7e8; font-weight:700; }
      .videos { margin-top:34px; display:grid; grid-template-columns:repeat(auto-fill, minmax(220px, 1fr)); gap:14px; }
      .video-card { overflow:hidden; border:1px solid var(--line); border-radius:16px; background:var(--panel); }
      .video-card img { width:100%; aspect-ratio:9/13; object-fit:cover; display:block; }
      .video-card div { padding:12px; display:grid; gap:4px; }
      .video-card span, .muted { color:var(--muted); font-size:13px; }
      .video-card p { margin:2px 0 0; font-size:13px; line-height:1.5; }
      .related { margin-top:34px; }
      .related-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(150px, 1fr)); gap:12px; }
      .related-card { display:grid; gap:8px; padding:10px; border:1px solid var(--line); border-radius:14px; background:rgba(255,255,255,.04); font-weight:800; }
      .related-card img { width:100%; aspect-ratio:9/13; object-fit:cover; border-radius:10px; }
      .faq { margin-top:34px; display:grid; gap:12px; }
      .faq article { padding:16px; border:1px solid var(--line); border-radius:16px; background:rgba(255,255,255,.04); }
      .faq h2 { margin:0 0 4px; font-size:18px; }
      @media (max-width: 760px) { .hero, .info { grid-template-columns:1fr; } }
    </style>
  </head>
  <body>
    <main>
      <a class="back" href="/">Back to ${htmlEscape(brand)}</a>
      <section class="hero">
        <img src="${htmlEscape(poster)}" alt="${htmlEscape(name)}" />
        <div>
          <div class="eyebrow">Character Profile</div>
          <h1>${htmlEscape(name)}</h1>
          <p>${htmlEscape(description)}</p>
          ${tags.length ? `<div class="tags">${tags.map((tag) => `<span>${htmlEscape(tag)}</span>`).join("")}</div>` : ""}
          <a class="cta" href="/#gallery">Open in app</a>
        </div>
      </section>
      <section class="info" aria-label="Character information">
        <article class="panel">
          <h2>About ${htmlEscape(name)}</h2>
          <p>${htmlEscape(description)} ${tags.length ? htmlEscape(`Common discovery tags include ${tags.slice(0, 6).join(", ")}.`) : ""}</p>
        </article>
        <aside class="panel">
          <h2>Profile signals</h2>
          <ul class="facts">${facts.map((fact) => `<li>${htmlEscape(fact)}</li>`).join("")}</ul>
        </aside>
      </section>
      <section class="videos" aria-label="Video previews">
        ${videoCards}
      </section>
      <section class="faq" aria-label="Frequently asked questions">
        ${faq.map((item) => `<article><h2>${htmlEscape(item.question)}</h2><p>${htmlEscape(item.answer)}</p></article>`).join("")}
      </section>
      ${relatedCards ? `<section class="related" aria-label="Related characters"><h2>Related characters</h2><div class="related-grid">${relatedCards}</div></section>` : ""}
    </main>
    <script>
      (() => {
        const characterId = ${JSON.stringify(String(item.id || ""))};
        if (!characterId) return;
        let source = "direct";
        try {
          if (document.referrer) {
            const ref = new URL(document.referrer);
            if (ref.host === window.location.host) {
              source = ["/", "/index.html", "/platform.html"].includes(ref.pathname || "/") ? "home" : "direct";
            } else {
              source = "external";
            }
          }
        } catch {}
        const payload = JSON.stringify({ characterId, source });
        const url = "/api/analytics/character-view";
        if (navigator.sendBeacon) {
          navigator.sendBeacon(url, new Blob([payload], { type: "application/json" }));
        } else {
          fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: payload, keepalive: true }).catch(() => {});
        }
      })();
    </script>
  </body>
</html>`;
}

function relatedCharactersForGeo(snapshot, item = {}, max = 6) {
  const tags = new Set(characterTagsForGeo(item, 12).map((tag) => tag.toLowerCase()));
  return (snapshot.characters || [])
    .filter((candidate) => candidate && candidate.id !== item.id)
    .map((candidate) => ({
      candidate,
      score: characterTagsForGeo(candidate, 12).filter((tag) => tags.has(tag.toLowerCase())).length,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map((entry) => entry.candidate);
}

function characterFaqForGeo(item = {}) {
  const name = compactPlainText(item.name || item.title || "this AI character", 80);
  const tags = characterTagsForGeo(item, 5);
  const videos = item.geoVideos || addCharacterVideoDescriptionsForGeo(item);
  return [
    {
      question: `What can I create with ${name}?`,
      answer: compactPlainText(`${name} can be used as a character reference for AI video scenes. ${tags.length ? `Common discovery tags include ${tags.join(", ")}.` : "Open the profile to review available scene metadata."}`, 260),
    },
    {
      question: `Are there video previews for ${name}?`,
      answer: `This profile lists ${videos.length} video ${videos.length === 1 ? "scene" : "scenes"}. The first scene is shown as the public preview when configured.`,
    },
    {
      question: `How do I unlock more ${name} videos?`,
      answer: "Sign in to the app, open the character profile, and use the unlock action where additional scenes are available.",
    },
  ];
}

function renderGeoCollectionHtml(snapshot, collection = {}, { kind = "tag" } = {}) {
  const { origin, brand } = snapshot;
  const label = compactPlainText(collection.label || collection.id || "Collection", 90);
  const url = collection.url || scopedApiUrl(origin, collection.path || "/");
  const characters = (collection.characters || []).slice(0, 48);
  const description = compactPlainText(
    collection.summary || `${label} AI character video profiles with crawlable character pages, tags, posters, and listed video scenes.`,
    180,
  );
  const intro = compactPlainText(collection.intro || description, 620);
  const highlights = Array.isArray(collection.highlights) ? collection.highlights.filter(Boolean).slice(0, 6) : [];
  const relatedTags = Array.isArray(collection.relatedTags) ? collection.relatedTags.slice(0, 10) : [];
  const faq = Array.isArray(collection.faq) ? collection.faq.slice(0, 4) : [];
  const image = characters[0]?.geoPoster ? absoluteUrlFromBase(characters[0].geoPoster, origin) : "";
  const title = `${label} | ${brand}`;
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: title,
      url,
      description,
      isPartOf: {
        "@type": "WebSite",
        name: brand,
        url: scopedApiUrl(origin, "/"),
      },
      mainEntity: {
        "@type": "ItemList",
        name: `${label} characters`,
        itemListElement: characters.map((item, index) => ({
          "@type": "ListItem",
          position: index + 1,
          url: item.geoUrl,
          name: item.name || item.title || item.id,
        })),
      },
    },
    faq.length ? {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faq.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: item.answer,
        },
      })),
    } : null,
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: brand, item: scopedApiUrl(origin, "/") },
        { "@type": "ListItem", position: 2, name: kind === "category" ? "Categories" : "Tags", item: scopedApiUrl(origin, kind === "category" ? "/categories/character-videos" : "/tags") },
        { "@type": "ListItem", position: 3, name: label, item: url },
      ],
    },
  ];
  const cards = characters.map((item) => `
        <a class="card" href="${htmlEscape(item.geoPath)}">
          <img src="${htmlEscape(absoluteUrlFromBase(item.geoPoster, origin))}" alt="${htmlEscape(item.name || item.title || "AI character")}" loading="lazy" />
          <span>${htmlEscape(item.name || item.title || item.id)}</span>
          <small>${htmlEscape((item.geoTags || []).slice(0, 4).join(", ") || `${item.geoVideos.length} videos`)}</small>
        </a>`).join("");
  const relatedLinks = [
    ...(snapshot.tags || []).filter((tag) => tag.id !== collection.id).slice(0, 12).map((tag) => ({ label: tag.label, path: tag.path })),
    ...(snapshot.categories || []).filter((category) => category.id !== collection.id).slice(0, 4).map((category) => ({ label: category.label, path: category.path })),
  ].slice(0, 14);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    ${geoMetaTags({ title, description, url, image, type: "website", jsonLd })}
    <style>
      :root { color-scheme: dark; --bg:#0b0b0f; --panel:#15151d; --line:rgba(255,255,255,.12); --ink:#f7f4fb; --muted:#aaa3b6; --pink:#ff45aa; }
      * { box-sizing: border-box; }
      body { margin:0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background:#0b0b0f; color:var(--ink); }
      main { width:min(1180px, calc(100% - 32px)); margin:0 auto; padding:34px 0 58px; }
      a { color:inherit; text-decoration:none; }
      .back { display:inline-flex; margin-bottom:18px; color:var(--muted); font-weight:800; }
      .hero { max-width:800px; margin-bottom:28px; }
      .eyebrow { color:var(--pink); text-transform:uppercase; letter-spacing:.16em; font-size:12px; font-weight:900; }
      h1 { margin:.18em 0; font-size:clamp(38px, 7vw, 84px); line-height:.93; }
      p { color:var(--muted); line-height:1.7; font-size:16px; }
      .intro { max-width:880px; margin:0 0 18px; }
      .facts { display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:10px; margin:0 0 26px; padding:0; list-style:none; }
      .facts li { padding:12px 14px; border:1px solid var(--line); border-radius:14px; background:rgba(255,255,255,.045); color:#ddd7e8; font-weight:800; }
      .links { display:flex; flex-wrap:wrap; gap:8px; margin:18px 0 28px; }
      .links a { padding:8px 12px; border:1px solid var(--line); border-radius:999px; background:rgba(255,255,255,.06); color:#ddd7e8; font-weight:800; font-size:13px; }
      .grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(170px, 1fr)); gap:14px; }
      .card { display:grid; gap:8px; padding:10px; border:1px solid var(--line); border-radius:16px; background:var(--panel); }
      .card img { width:100%; aspect-ratio:9/13; object-fit:cover; border-radius:12px; background:#24242b; }
      .card span { font-weight:900; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .card small { color:var(--muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .faq { margin-top:34px; display:grid; gap:12px; }
      .faq article { padding:16px; border:1px solid var(--line); border-radius:16px; background:rgba(255,255,255,.04); }
      .faq h2 { margin:0 0 4px; font-size:18px; }
    </style>
  </head>
  <body>
    <main>
      <a class="back" href="/">Back to ${htmlEscape(brand)}</a>
      <section class="hero">
        <div class="eyebrow">${htmlEscape(kind === "category" ? "Category" : "Tag")} collection</div>
        <h1>${htmlEscape(label)}</h1>
        <p>${htmlEscape(description)} This collection includes ${characters.length} crawlable profiles.</p>
      </section>
      <p class="intro">${htmlEscape(intro)}</p>
      ${highlights.length ? `<ul class="facts">${highlights.map((item) => `<li>${htmlEscape(item)}</li>`).join("")}</ul>` : ""}
      ${relatedLinks.length ? `<nav class="links" aria-label="Related topics">${relatedLinks.map((item) => `<a href="${htmlEscape(item.path)}">${htmlEscape(item.label)}</a>`).join("")}</nav>` : ""}
      ${relatedTags.length ? `<nav class="links" aria-label="Related tags">${relatedTags.map((item) => `<a href="${htmlEscape(geoTagPublicPath(item.label))}">${htmlEscape(item.label)} · ${htmlEscape(String(item.count))}</a>`).join("")}</nav>` : ""}
      <section class="grid" aria-label="${htmlEscape(label)} characters">
        ${cards || `<p class="muted">No public character profiles are available for this collection yet.</p>`}
      </section>
      ${faq.length ? `<section class="faq" aria-label="Frequently asked questions">${faq.map((item) => `<article><h2>${htmlEscape(item.question)}</h2><p>${htmlEscape(item.answer)}</p></article>`).join("")}</section>` : ""}
    </main>
  </body>
</html>`;
}

function renderGeoDirectoryHtml(snapshot, { kind = "characters" } = {}) {
  const { origin, brand } = snapshot;
  const definitions = {
    characters: {
      label: "AI Characters",
      description: `Browse all ${snapshot.characters.length} public AI character profiles.`,
      entries: snapshot.characters.map((item) => ({
        label: item.name || item.title || item.id,
        detail: (item.geoTags || []).slice(0, 4).join(", "),
        path: item.geoPath,
      })),
    },
    tags: {
      label: "Character Tags",
      description: `Browse all ${snapshot.tags.length} character topics and their public profiles.`,
      entries: snapshot.tags.map((item) => ({
        label: item.label,
        detail: `${item.characters.length} profiles`,
        path: item.path,
      })),
    },
    categories: {
      label: "Character Categories",
      description: `Browse all ${snapshot.categories.length} public character categories.`,
      entries: snapshot.categories.map((item) => ({
        label: item.label,
        detail: `${item.characters.length} profiles`,
        path: item.path,
      })),
    },
  };
  const directory = definitions[kind] || definitions.characters;
  const url = scopedApiUrl(origin, `/${kind}/`);
  const title = `${directory.label} | ${brand}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: title,
    url,
    description: directory.description,
    mainEntity: {
      "@type": "ItemList",
      itemListElement: directory.entries.map((entry, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: entry.label,
        url: scopedApiUrl(origin, entry.path),
      })),
    },
  };
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    ${geoMetaTags({ title, description: directory.description, url, type: "website", jsonLd })}
    <style>
      :root { color-scheme:dark; --bg:#0b0b0f; --panel:#15151d; --line:rgba(255,255,255,.12); --ink:#f7f4fb; --muted:#aaa3b6; --pink:#ff45aa; }
      * { box-sizing:border-box; }
      body { margin:0; font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; background:var(--bg); color:var(--ink); }
      main { width:min(1120px,calc(100% - 32px)); margin:0 auto; padding:34px 0 58px; }
      a { color:inherit; text-decoration:none; }
      .back { display:inline-flex; min-height:44px; align-items:center; color:var(--muted); font-weight:800; }
      h1 { margin:20px 0 8px; font-size:clamp(34px,6vw,68px); line-height:1; }
      p { margin:0 0 26px; color:var(--muted); line-height:1.6; }
      .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(210px,1fr)); gap:10px; }
      .item { display:grid; gap:4px; min-height:64px; padding:12px 14px; border:1px solid var(--line); border-radius:8px; background:var(--panel); }
      .item:hover { border-color:var(--pink); }
      .item strong { overflow-wrap:anywhere; }
      .item small { color:var(--muted); }
    </style>
  </head>
  <body>
    <main>
      <a class="back" href="/">Back to ${htmlEscape(brand)}</a>
      <h1>${htmlEscape(directory.label)}</h1>
      <p>${htmlEscape(directory.description)}</p>
      <nav class="grid" aria-label="${htmlEscape(directory.label)}">
        ${directory.entries.map((entry) => `<a class="item" href="${htmlEscape(entry.path)}"><strong>${htmlEscape(entry.label)}</strong><small>${htmlEscape(entry.detail || "View profile")}</small></a>`).join("")}
      </nav>
    </main>
  </body>
</html>`;
}

function buildRobotsTxt(snapshot) {
  const indexNowKey = indexNowKeyForOrigin(snapshot.origin);
  const toolDisallows = snapshot.toolOnly
    ? ["Disallow: /characters/", "Disallow: /tags/", "Disallow: /categories/"]
    : [];
  return [
    "User-agent: OAI-SearchBot",
    "Allow: /",
    "",
    "User-agent: ChatGPT-User",
    "Allow: /",
    "",
    "User-agent: PerplexityBot",
    "Allow: /",
    "",
    "User-agent: Perplexity-User",
    "Allow: /",
    "",
    "User-agent: Googlebot",
    "Allow: /",
    "",
    "User-agent: Bingbot",
    "Allow: /",
    "",
    "User-agent: *",
    "Allow: /",
    "Disallow: /api/",
    "Disallow: /admin.html",
    "Disallow: /assets/user-uploads/",
    ...toolDisallows,
    `Sitemap: ${scopedApiUrl(snapshot.origin, "/sitemap.xml")}`,
    `# IndexNow-Key: ${scopedApiUrl(snapshot.origin, `/${indexNowKey}.txt`)}`,
    "",
  ].join("\n");
}

function buildSitemapXml(snapshot) {
  return buildStableSitemapXml(snapshot);
}

function buildLlmsTxt(snapshot, { full = false, apiAccess = true } = {}) {
  const description = homeDescriptionForGeo(snapshot.platform);
  const topCharacters = snapshot.characters.slice(0, full ? 30 : 8);
  const topTags = (snapshot.tags || []).slice(0, full ? 30 : 10);
  const topCategories = (snapshot.categories || []).slice(0, full ? 12 : 6);
  const coreUrls = [
    `# ${snapshot.brand}`,
    "",
    `> ${description}`,
    "",
    "## Core URLs",
    `- Home: ${scopedApiUrl(snapshot.origin, "/")}`,
    `- Sitemap: ${scopedApiUrl(snapshot.origin, "/sitemap.xml")}`,
    `- Character library: ${scopedApiUrl(snapshot.origin, "/#gallery")}`,
    `- Create workspace: ${scopedApiUrl(snapshot.origin, "/#advanced")}`,
  ];
  if (apiAccess) coreUrls.push(`- API guide: ${scopedApiUrl(snapshot.origin, "/#access")}`);
  const apiLines = apiAccess ? [
    "## API",
    "- Seedance 2.0 video: POST /api/v3/contents/generations/tasks",
    "- Seedream 5.0 Pro and Qwen Image 3.0: POST /api/v3/images/generations",
    "- W3.0, W3.0-Pro, W3.0-Prime, W3.0-VSR-Prime, and Seedance 2.5: POST /api/advanced/generate",
    "- Z-Image Spicy Pro and Qwen Image Edit Spicy: POST /api/wan27/image-edit",
    "- Query V3 tasks: GET /api/v3/contents/generations/tasks/<taskId>",
    "- Query Advanced tasks: GET /api/generation-records/<taskId>",
    "- Public model guide: GET /models.md",
    "",
  ] : [];
  const lines = [
    ...coreUrls,
    "",
    ...apiLines,
    "## Content",
    `- Public character profiles: ${snapshot.characters.length}`,
    `- Public character videos listed: ${snapshot.characters.reduce((sum, item) => sum + item.geoVideos.length, 0)}`,
    `- Topic tag pages: ${snapshot.tags?.length || 0}`,
    `- Category pages: ${snapshot.categories?.length || 0}`,
    "",
    "## Topic Pages",
    ...topCategories.map((item) => `- ${item.label}: ${item.url} - ${compactPlainText(item.summary, full ? 180 : 110)}`),
    ...topTags.map((item) => `- ${item.label}: ${item.url} - ${compactPlainText(item.summary, full ? 180 : 110)}`),
    "",
    "## Featured Characters",
    ...topCharacters.map((item) => `- ${item.name || item.title || item.id}: ${item.geoUrl} - ${compactPlainText(item.geoSummary, full ? 180 : 110)}`),
  ];
  if (full) {
    lines.push(
      "",
      "## GEO Notes",
      "- The site exposes robots.txt, sitemap.xml, llms.txt, structured home metadata, and structured character profile pages.",
      "- Character pages include ProfilePage and VideoObject structured data for AI/search understanding.",
      "- Some videos require login or unlock in the application; public profile pages expose previews and metadata only.",
    );
  }
  return `${lines.join("\n")}\n`;
}

const platformHtmlSnapshotCache = new Map();
const PLATFORM_HTML_CACHE_TTL_MS = 20_000;

function platformHtmlCacheKey(req, version = "current") {
  const tenant = requestTenantOptions(req);
  return [
    pageOriginFromRequest(req),
    requestHostname(req),
    tenant.tenant?.tenantId || "",
    tenant.tenant?.toolId || "",
    tenant.tenant?.siteProfile || "",
    version,
  ].join("|");
}

async function renderPlatformHtmlSnapshot(req) {
  const filePath = path.join(ROOT, "platform.html");
  const html = await fs.readFile(filePath, "utf8");
  const version = await currentPlatformAssetVersion();
  const versionedHtml = applyPlatformAssetVersion(html, version);
  const snapshot = await geoSiteSnapshot(req);
  return injectPlatformGeoHead(versionedHtml, snapshot, requestTenantOptions(req));
}

function prunePlatformHtmlSnapshotCache(now = Date.now()) {
  for (const [key, entry] of platformHtmlSnapshotCache) {
    if (entry.expiresAt > now) continue;
    platformHtmlSnapshotCache.delete(key);
  }
}

async function platformHtmlSnapshot(req) {
  const version = await currentPlatformAssetVersion();
  const key = platformHtmlCacheKey(req, version);
  const now = Date.now();
  prunePlatformHtmlSnapshotCache(now);
  const cached = platformHtmlSnapshotCache.get(key);
  const cacheHit = Boolean(cached && cached.expiresAt > now);
  baselineMetrics.recordCache("platform_html", cacheHit);
  if (cacheHit) return cached.promise;
  const pending = renderPlatformHtmlSnapshot(req);
  const entry = { promise: pending, expiresAt: now + PLATFORM_HTML_CACHE_TTL_MS };
  platformHtmlSnapshotCache.set(key, entry);
  try {
    return await pending;
  } catch (error) {
    if (platformHtmlSnapshotCache.get(key) === entry) platformHtmlSnapshotCache.delete(key);
    throw error;
  }
}

async function currentPlatformAssetVersion() {
  if (!platformAssetVersionPromise) {
    // File mtimes are preserved by archive/copy based releases and can leave an
    // older, newer-mtime file dominating the cache key. Content hashes make the
    // public asset URL change whenever any shipped platform file changes.
    platformAssetVersionPromise = Promise.all(
      PLATFORM_ASSET_FILES.map(async (fileName) => {
        const content = await fs.readFile(path.join(ROOT, fileName));
        const digest = crypto.createHash("sha256").update(content).digest("hex").slice(0, 12);
        return `${fileName}:${digest}`;
      }),
    ).then((entries) => crypto.createHash("sha256").update(entries.join("\0")).digest("hex").slice(0, 12))
      .catch(() => "current");
  }
  return platformAssetVersionPromise;
}

function applyPlatformAssetVersion(html = "", version = "current") {
  return String(html).replace(
    /(\.\/platform\.(?:css|js))(?:\?v=[^"']*)?/g,
    `$1?v=${encodeURIComponent(version)}`,
  );
}

async function servePlatformHtmlWithGeo(req, res) {
  const html = await platformHtmlSnapshot(req);
  // This document is tenant metadata plus static client bootstrap; account
  // state is restored in the browser. Let Cloudflare absorb repeat refreshes
  // while keeping a short TTL so site copy and deployments become visible.
  return sendHtml(res, 200, html, {
    cacheControl: "public, max-age=0, s-maxage=15, stale-while-revalidate=60",
    head: req.method === "HEAD",
  });
}

async function handleRobotsTxt(req, res) {
  const snapshot = await geoSiteSnapshot(req);
  return sendText(res, 200, buildRobotsTxt(snapshot), {
    cacheControl: "public, max-age=3600, s-maxage=86400",
    head: req.method === "HEAD",
  });
}

async function handleSitemapXml(req, res) {
  const snapshot = await geoSiteSnapshot(req);
  return sendXml(res, 200, buildSitemapXml(snapshot), {
    cacheControl: "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
    head: req.method === "HEAD",
  });
}

async function handleLlmsTxt(req, res, { full = false } = {}) {
  const snapshot = await geoSiteSnapshot(req);
  return sendText(res, 200, buildLlmsTxt(snapshot, { full, apiAccess: requestTenantOptions(req).apiAccess !== false }), { head: req.method === "HEAD" });
}

async function handleIndexNowKey(req, res) {
  return sendText(res, 200, indexNowKeyForOrigin(publicOriginFromRequest(req)), { head: req.method === "HEAD" });
}

async function handleFavicon(req, res) {
  const filePath = path.join(ROOT, "assets", "brand", "favicon.svg");
  const data = await fs.readFile(filePath);
  res.writeHead(200, {
    "content-type": "image/svg+xml",
    "content-length": data.length,
    "cache-control": "public, max-age=604800, immutable",
  });
  if (req.method === "HEAD") return res.end();
  return res.end(data);
}

async function handleCharacterGeoPage(req, res, characterId) {
  const snapshot = await geoSiteSnapshot(req);
  const decoded = decodeURIComponent(String(characterId || ""));
  const item = snapshot.characters.find((candidate) => (
    slugSegment(candidate.id) === decoded ||
    slugSegment(candidate.sourceDisplayId) === decoded ||
    slugSegment(candidate.name) === decoded ||
    String(candidate.id || "") === decoded
  ));
  if (!item) return sendText(res, 404, "Character not found");
  return sendHtml(res, 200, renderCharacterGeoHtml(snapshot, item), {
    cacheControl: "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
    head: req.method === "HEAD",
  });
}

function webVitalRating(metric = "", value = 0) {
  const thresholds = {
    LCP: [2500, 4000],
    INP: [200, 500],
    CLS: [0.1, 0.25],
  }[metric];
  if (!thresholds) return "";
  if (value <= thresholds[0]) return "good";
  if (value <= thresholds[1]) return "needs-improvement";
  return "poor";
}

function webVitalDevice(req, value = "") {
  const supplied = String(value || "").trim().toLowerCase();
  if (["mobile", "desktop", "tablet"].includes(supplied)) return supplied;
  const userAgent = String(req.headers["user-agent"] || "");
  if (/ipad|tablet|playbook|silk/i.test(userAgent)) return "tablet";
  if (/mobile|iphone|ipod|android/i.test(userAgent)) return "mobile";
  return userAgent ? "desktop" : "unknown";
}

function webVitalPagePath(value = "") {
  const text = String(value || "/").trim().slice(0, 300);
  try {
    const parsed = new URL(text, "https://local.invalid");
    const hash = String(parsed.hash || "").replace(/[^#a-z0-9/_-]/gi, "").slice(0, 80);
    return `${parsed.pathname || "/"}${hash}`;
  } catch {
    return "/";
  }
}

async function handleWebVitals(req, res) {
  if (!dbEnabled()) return sendJson(res, 503, { ok: false, message: "Metrics storage is unavailable." });
  const body = await readJson(req).catch(() => ({}));
  const pageId = String(body.pageId || "").trim().replace(/[^a-z0-9_-]/gi, "").slice(0, 100) || crypto.randomUUID();
  const hostname = canonicalHostname(requestHostname(req), CANONICAL_HOST_ALIASES) || "unknown";
  const pagePath = webVitalPagePath(body.pagePath || body.path || "/");
  const device = webVitalDevice(req, body.device);
  const navigationType = compactPlainText(body.navigationType || "", 40);
  const limits = { LCP: 120000, INP: 120000, CLS: 10 };
  const samples = (Array.isArray(body.samples) ? body.samples : [])
    .slice(0, 3)
    .map((sample) => {
      const metric = String(sample?.metric || sample?.name || "").trim().toUpperCase();
      const value = Number(sample?.value);
      if (!Object.hasOwn(limits, metric) || !Number.isFinite(value) || value < 0 || value > limits[metric]) return null;
      return {
        eventId: `${pageId}:${metric}`,
        hostname,
        pagePath,
        device,
        metric,
        value,
        rating: webVitalRating(metric, value),
        navigationType,
      };
    })
    .filter(Boolean);
  if (!samples.length) return sendJson(res, 400, { ok: false, message: "No valid Web Vitals samples." });
  const inserted = await insertWebVitalSamplesInDb(samples);
  return sendJson(res, 202, { ok: true, accepted: samples.length, inserted });
}

async function handleTrackCharacterView(req, res) {
  if (req.method !== "POST") return sendJson(res, 405, { ok: false, message: "Method not allowed." });
  if (!GEO_VISIT_STATS_ENABLED) return sendJson(res, 200, { ok: true, disabled: true });
  const body = await readJson(req).catch(() => ({}));
  const characterId = String(body.characterId || body.id || "").trim();
  if (!characterId) return sendJson(res, 400, { ok: false, message: "Missing characterId." });
  const config = await readAppConfig();
  const homeVideo = normalizeHomeVideo(config.homeVideo || {});
  const item = (homeVideo.items || []).find((candidate) => String(candidate?.id || "") === characterId && !isSoftDeleted(candidate));
  if (!item) return sendJson(res, 404, { ok: false, message: "Character not found." });
  const url = new URL(req.url || "/api/analytics/character-view", publicOriginFromRequest(req));
  const source = ["home", "direct", "external"].includes(String(body.source || "").trim().toLowerCase())
    ? String(body.source || "").trim().toLowerCase()
    : characterVisitSourceFromRequest(req, url);
  await recordGeoCharacterVisit({ req, url, character: item, source });
  return sendJson(res, 200, { ok: true });
}

async function handleGeoTagPage(req, res, tagId) {
  const snapshot = await geoSiteSnapshot(req);
  const decoded = decodeURIComponent(String(tagId || ""));
  const tag = (snapshot.tags || []).find((candidate) => candidate.id === decoded || slugSegment(candidate.label) === decoded);
  if (!tag) return sendText(res, 404, "Tag not found", { head: req.method === "HEAD" });
  return sendHtml(res, 200, renderGeoCollectionHtml(snapshot, tag, { kind: "tag" }), {
    cacheControl: "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
    head: req.method === "HEAD",
  });
}

