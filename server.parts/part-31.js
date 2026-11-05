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
    estimate = await makePlatformEstimate(template, {}, user, { channel: "api" });
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
  };
}

function buildAdvancedModelDoc(item, origin, user = null, options = {}) {
  const params = item.params && typeof item.params === "object" && !Array.isArray(item.params) ? item.params : {};
  const durationSeconds = durationSecondsFromParams(params) || 5;
  const provider = normalizeAdvancedProvider(item.provider || params.provider);
  const docModel = params.model || (provider === "wan27" ? ALIYUN_WAN27_MODEL : MODEL_QUALITY);
  let pricing = null;
  let pricingView;
  try {
    pricing = applyUserPricingToEstimate(advancedModelPricing(provider, {
      model: docModel,
      duration: durationSeconds,
      resolution: params.resolution,
      ratio: params.ratio || params.aspect_ratio,
      videoCapability: params.videoCapability,
      advancedPricing: options.advancedPricing,
    }), user || 1, { channel: "api" });
    pricingView = {
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
  } catch (error) {
    pricingView = {
      available: false,
      credits: null,
      baseCredits: null,
      originalCredits: null,
      userPricingMultiplier: 1,
      markup: 1,
      source: error.code || "model_pricing_unavailable",
      message: error.message || "Pricing is unavailable.",
      durationSeconds,
      creditsPerSecond: null,
      resolution: params.resolution || "",
      ratio: params.ratio || params.aspect_ratio || "",
      outputTokens: null,
      yuanPerMillionTokens: null,
    };
  }
  const exampleBody = {
    model: params.model || "dreamina-seedance-2-0-260128",
    content: [
      { type: "text", text: item.prompt || params.prompt || "Use Image 1 as the reference and generate a cinematic 5 second shot." },
    ],
    ratio: params.ratio || params.aspect_ratio || "9:16",
    resolution: params.resolution || "720p",
    duration: durationSeconds,
    generate_audio: true,
    watermark: false,
  };
  return {
    id: item.id,
    title: item.title,
    category: item.category,
    provider,
    model: publicModelText(docModel || pricing?.model || ""),
    description: item.description || "",
    pricing: options.tenantPublic ? tenantDocsPricingView(pricingView) : pricingView,
    coverUrl: item.coverUrl,
    previewUrl: item.previewUrl,
    prompt: item.prompt || params.prompt || "",
    requiresApproval: false,
    endpoint: {
      method: "POST",
      url: `${origin}/api/v3/contents/generations/tasks`,
      auth: "Bearer <user-token>",
    },
    requestFields: seedancePublicParameterFields(origin),
    exampleRequest: {
      method: "POST",
      url: `${origin}/api/v3/contents/generations/tasks`,
      headers: {
        Authorization: "Bearer <user-token>",
        "Content-Type": "application/json",
      },
      body: exampleBody,
    },
  };
}

async function buildModelDocs(req) {
  const auth = await getAuth(req, { loadDb: false });
  const origin = publicOriginFromRequest(req);
  const tenantOptions = requestTenantOptions(req);
  const tenantPublic = tenantOptions.tenantPublic;
  const config = await readAppConfig();
  const platform = normalizePlatformConfig(config.platform || {});
  const templates = [];
  const advancedCases = [];

  return {
    ok: true,
    title: `${platform.brand || "Vipeak AI"} Model Guide`,
    baseUrl: origin,
    updatedAt: new Date().toISOString(),
    userPricing: pricingMultiplierView(auth.user || 1, { channel: "api" }),
    billing: tenantPublic ? {
      unit: "credits",
      note: "Credits are deducted according to the selected model, resolution, duration, and your account pricing.",
    } : {
      unit: "credits",
      note: `1 USD equals ${DEFAULT_CREDITS_PER_USD} credits. Advanced generation is charged by the configured public rates.`,
      galleryMarkup: GENERATION_PRICE_MARKUP,
      creditsPerUsd: DEFAULT_CREDITS_PER_USD,
      advancedSeedanceCreditsPerSecondByResolution: platform.advancedPricing.seedanceCreditsPerSecondByResolution,
    },
    advancedExternalApi: externalAdvancedApiDoc(origin),
    endpoints: {
      docsMarkdown: `${origin}/docs/api.md`,
      docsJson: `${origin}/docs/api.json`,
      legacyDocsMarkdown: `${origin}/docs/models.md`,
      modelsJson: `${origin}/api/models`,
      byteplusGenerate: `${origin}/api/v3/contents/generations/tasks`,
      byteplusTaskDetail: `${origin}/api/v3/contents/generations/tasks/<taskId>`,
      seedream5ImageGenerate: `${origin}/api/v3/images/generations`,
      seedream5ImageTaskDetail: `${origin}/api/v3/contents/generations/tasks/<taskId>`,
      qwenImage3Generate: `${origin}/api/v3/images/generations`,
      qwenImage3TaskDetail: `${origin}/api/v3/contents/generations/tasks/<taskId>`,
      byteplusAssetAction: `${origin}/?Action=CreateAsset&Version=2024-01-01`,
      advancedAssetUpload: `${origin}/api/user-assets`,
      advancedGenerate: `${origin}/api/advanced/generate`,
      wan27ImageEdit: `${origin}/api/wan27/image-edit`,
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

function publicModelDocsView(docs = {}) {
  if (PUBLIC_ALIYUN_MODEL_EXPOSURE_ENABLED) return docs;
  const view = JSON.parse(JSON.stringify(docs || {}));
  const external = view.advancedExternalApi || {};
  const publicModelFamilies = [
    "Seedance 2.0 uses the V3 task route.",
    "Seedream 5.0 Pro uses the V3 images route.",
    "Vega 1.0 Pro, Vega 1.5 Pro, Vega 1.5 Lite, and Vega 1.0 Lite use the Advanced route.",
    ...(PUBLIC_WAN30_MODEL_EXPOSURE_ENABLED ? ["Wan3.0 uses the Advanced route."] : []),
    ...(PUBLIC_QWEN_IMAGE3_EXPOSURE_ENABLED ? ["Qwen Image 3.0 uses the image generation route."] : []),
  ];
  external.summary = `${publicModelFamilies.join(" ")} Other temporarily unavailable model families are omitted from this public guide.`;
  external.supportedModels = (Array.isArray(external.supportedModels) ? external.supportedModels : [])
    .filter((item) => !publicAliyunModelHidden(item.provider || item.model || item.name));
  if (external.constraints && typeof external.constraints === "object") {
    const restrictedConstraintKeys = [];
    if (!PUBLIC_WAN30_MODEL_EXPOSURE_ENABLED) restrictedConstraintKeys.push("wan30");
    restrictedConstraintKeys.push("wan27");
    if (!PUBLIC_QWEN_IMAGE3_EXPOSURE_ENABLED) restrictedConstraintKeys.push("qwenImage3");
    restrictedConstraintKeys.forEach((key) => delete external.constraints[key]);
  }
  if (!PUBLIC_QWEN_IMAGE3_EXPOSURE_ENABLED) ["qwenImage3Generate", "qwenImage3TaskDetail"].forEach((key) => delete external.endpoints?.[key]);
  if (!PUBLIC_QWEN_IMAGE3_EXPOSURE_ENABLED) ["qwenImage3ResponseShape", "qwenImage3Example"].forEach((key) => delete external[key]);
  if (!PUBLIC_WAN30_MODEL_EXPOSURE_ENABLED) ["wan30Example", "wan30ProExample", "wan30PrimeExample", "wan30PrimeProExample"].forEach((key) => delete external[key]);
  if (!PUBLIC_HAPPYHORSE_MODEL_EXPOSURE_ENABLED) delete external.happyhorseExample;
  ["wan27Example", "wanAnimateExample", "wan27ImageExample"].forEach((key) => delete external[key]);
  view.advancedExternalApi = external;
  if (!PUBLIC_QWEN_IMAGE3_EXPOSURE_ENABLED) ["qwenImage3Generate", "qwenImage3TaskDetail"].forEach((key) => delete view.endpoints?.[key]);
  if (view.advanced && Array.isArray(view.advanced.cases)) {
    view.advanced.cases = view.advanced.cases.filter((item) => !publicAliyunModelHidden(item.provider || item.model || item.params?.provider || item.params?.model));
  }
  return view;
}

function buildRestrictedModelDocsMarkdown(docs = {}) {
  const external = docs.advancedExternalApi || {};
  const route = (url, fallback = "") => String(url || fallback || "").replace(String(external.baseUrl || docs.baseUrl || ""), "");
  const supportedModels = Array.isArray(external.supportedModels) ? external.supportedModels : [];
  const supportedModelTable = markdownTable(["Model", "Model / Provider", "Capability", "Create", "Result"], supportedModels.map((item) => ({
    Model: item.name || "",
    "Model / Provider": item.model || item.provider || "",
    Capability: item.capability || "-",
    Create: item.create || "",
    Result: item.result || "",
  })));
  const lines = [
    `# ${docs.title}`,
    "",
    `Base URL: ${docs.baseUrl}`,
    "",
    "This is the caller-facing source of truth for currently available models, request fields, media combinations, and result polling.",
    "",
    "## Authentication",
    "",
    markdownCodeBlock("http", "Authorization: Bearer <user-token>"),
    "",
    mulerouterRoutingMarkdown(),
    "## Supported Models",
    "",
    supportedModelTable,
    "",
    "## Reusable Media",
    "",
    "For V3 requests, create an asset with the BytePlus-compatible action and use `asset://<asset-id>`. For Advanced requests, upload with `/api/user-assets` and use the returned `asset.id` without the `asset://` prefix.",
    "",
    markdownCodeBlock("http", [
      `POST ${route(external.endpoints?.byteplusAssetAction, "/?Action=CreateAsset&Version=2024-01-01")}`,
      "Authorization: Bearer <user-token>",
      "Content-Type: application/json",
      "",
      JSON.stringify({
        URL: "https://example.com/reference.png",
        AssetType: "Image",
        Name: "reference image",
        Moderation: { Strategy: "Skip" },
      }, null, 2),
    ].join("\n")),
    "",
    markdownCodeBlock("http", [
      `POST ${route(external.endpoints?.userAssets, "/api/user-assets")}`,
      "Authorization: Bearer <user-token>",
      "Content-Type: application/json",
      "",
      JSON.stringify({
        videoUrl: "https://example.com/reference.mp4",
        fileName: "reference.mp4",
        durationSeconds: 8,
      }, null, 2),
    ].join("\n")),
    "",
    "**Advanced asset fields**",
    "",
    docsParameterMarkdown(advancedAssetParameterFields()),
    "",
    "## Seedance 2.0 V3",
    "",
    markdownCodeBlock("http", [
      `POST ${route(external.endpoints?.byteplusGenerate, "/api/v3/contents/generations/tasks")}`,
      "Authorization: Bearer <user-token>",
      "Content-Type: application/json",
      "",
      JSON.stringify(external.byteplusExample?.body || {}, null, 2),
    ].join("\n")),
    "",
    "**Request fields and limits**",
    "",
    byteplusV3ParameterMarkdown(),
    "",
    "The create response returns `id`. Poll the V3 task endpoint until `status` is `succeeded` or `failed`.",
    "",
    markdownCodeBlock("http", [
      `GET ${route(external.endpoints?.byteplusTaskDetail, "/api/v3/contents/generations/tasks/<taskId>")}`,
      "Authorization: Bearer <user-token>",
    ].join("\n")),
    "",
    "## Seedream 5.0 Pro Image",
    "",
    markdownCodeBlock("http", [
      `POST ${route(external.endpoints?.seedream5ImageGenerate, "/api/v3/images/generations")}`,
      "Authorization: Bearer <user-token>",
      "Content-Type: application/json",
      "",
      JSON.stringify(external.seedream5ImageExample?.body || {}, null, 2),
    ].join("\n")),
    "",
    "**Request fields and limits**",
    "",
    docsParameterMarkdown(seedream5ImageParameterFields()),
    "",
    "The create response returns `id`/`task_id`. Poll the V3 task endpoint and read `content.image_url` after success.",
    "",
  ];

  if (external.qwenImage3Example) {
    lines.push(
      "## Qwen Image 3.0",
      "",
      markdownCodeBlock("http", [
        `POST ${route(external.endpoints?.qwenImage3Generate, "/api/v3/images/generations")}`,
        "Authorization: Bearer <user-token>",
        "Content-Type: application/json",
        "",
        JSON.stringify(external.qwenImage3Example.body || {}, null, 2),
      ].join("\n")),
      "",
      "**Request fields and limits**",
      "",
      docsParameterMarkdown(qwenImage3ParameterFields()),
      "",
      "The create response is asynchronous. Poll the V3 task endpoint and read `content.image_url`, `content.image_urls`, or `data[].url` after success.",
      "",
    );
  }

  const advancedSections = [
    { title: "W3.0 (w3.0-video)", example: external.wan30Example, fields: () => wan30VideoParameterFields("w3.0-video") },
    { title: "W3.0-Pro (w3.0-video-pro)", example: external.wan30ProExample, fields: () => wan30VideoParameterFields("w3.0-video-pro") },
    { title: "W3.0-Prime (w3.0-video-prime)", example: external.wan30PrimeExample, fields: () => wan30VideoParameterFields("w3.0-video-prime") },
    { title: "W3.0-VSR-Prime (w3.0-video-prime-pro)", example: external.wan30PrimeProExample, fields: () => wan30VideoParameterFields("w3.0-video-prime-pro") },
    { title: "Seedance 2.5 Video (seedance25)", example: external.seedance25Example, fields: seedance25VideoParameterFields },
    { title: "Seedance 2.5 Video (seedance-nsfw)", example: external.seedanceNsfwExample, fields: seedanceNsfwVideoParameterFields },
    { title: "Vega 1.0 Pro", example: external.vega10ProExample, fields: () => vegaVideoParameterFields("seedance20-vega") },
    { title: "Vega 1.5 Pro", example: external.seedance25VegaExample, fields: () => vegaVideoParameterFields("seedance25-vega") },
    { title: "Vega 1.5 Lite", example: external.h3VegaExample, fields: () => vegaVideoParameterFields("h3-vega") },
    { title: "Vega 1.0 Lite", example: external.vega10LiteExample, fields: () => vegaVideoParameterFields("vega10-lite") },
  ];
  for (const section of advancedSections) {
    if (!section.example) continue;
    lines.push(
      `## ${section.title}`,
      "",
      markdownCodeBlock("http", [
        `POST ${route(section.example.url || external.endpoints?.advancedGenerate, "/api/advanced/generate")}`,
        "Authorization: Bearer <user-token>",
        "Content-Type: application/json",
        "",
        JSON.stringify(section.example.body || {}, null, 2),
      ].join("\n")),
      "",
      "**Request fields and limits**",
      "",
      docsParameterMarkdown(section.fields()),
      "",
    );
  }

  if (advancedSections.some((section) => section.example)) {
    lines.push(
      "## Advanced Task Polling",
      "",
      "Advanced video tasks return `taskId`. Poll the generation record until its status is `succeeded` or `failed`.",
      "",
      markdownCodeBlock("http", [
        `GET ${route(external.endpoints?.generationRecordDetail, "/api/generation-records/<taskId>")}`,
        "Authorization: Bearer <user-token>",
      ].join("\n")),
      "",
    );
  }

  const imageSections = [
    { title: "Z-Image Spicy Pro", example: external.zImageSpicyProExample, fields: zImageSpicyProParameterFields },
    { title: "Qwen Image Edit Spicy", example: external.qwenImageEditSpicyExample, fields: qwenImageEditSpicyParameterFields },
  ];
  for (const section of imageSections) {
    if (!section.example) continue;
    lines.push(
      `## ${section.title}`,
      "",
      markdownCodeBlock("http", [
        `POST ${route(external.endpoints?.wan27ImageEdit, "/api/wan27/image-edit")}`,
        "Authorization: Bearer <user-token>",
        "Content-Type: application/json",
        "",
        JSON.stringify(section.example.body || {}, null, 2),
      ].join("\n")),
      "",
      "**Request fields and limits**",
      "",
      docsParameterMarkdown(section.fields()),
      "",
    );
  }

  lines.push(
    embedLiveIntegrationMarkdown(),
    "",
    "## Billing",
    "",
    docs.billing?.note || "Credits are deducted according to the selected model and configured public rates.",
    "",
    "## Endpoints",
    "",
    markdownCodeBlock("json", docs.endpoints || {}),
    "",
  );
  return lines.join("\n");
}

function templateDocMarkdown(item) {
  const lines = [
    `### ${markdownText(item.title, item.id)}`,
    "",
    `- templateId: \`${item.id}\``,
    `- type: \`${item.type}\``,
    `- model: \`${publicModelText(item.requestModel || item.model)}\``,
    `- duration: ${item.durationSeconds || "configured"}s`,
    `- estimated cost: ${item.pricing.available ? `${item.pricing.credits} credits` : "pricing unavailable"}`,
  ];
  if (item.previewUrl) lines.push(`- preview: ${item.previewUrl}`);
  if (item.coverUrl) lines.push(`- cover: ${item.coverUrl}`);
  if (item.prompt) lines.push("", "**Saved prompt**", "", item.prompt);
  lines.push("", "**Client request**", "", markdownCodeBlock("json", item.exampleRequest));
  return lines.join("\n");
}

function advancedDocMarkdown(item) {
  const lines = [
    `### ${markdownText(item.title, item.id)}`,
    "",
    `- caseId: \`${item.id}\``,
    `- provider: \`${item.provider || "seedance"}\``,
    item.model ? `- model: \`${publicModelText(item.model)}\`` : "",
    "- access: signed-in users",
    `- estimated cost: ${item.pricing.credits} credits`,
  ].filter(Boolean);
  if (item.description) lines.push(`- description: ${markdownText(item.description)}`);
  if (item.previewUrl) lines.push(`- preview: ${item.previewUrl}`);
  if (item.prompt) lines.push("", "**Saved prompt**", "", item.prompt);
  lines.push("", "Use the Seedance V3 task endpoint for external integrations. Submit content[] to `/api/v3/contents/generations/tasks` and poll `/api/v3/contents/generations/tasks/<taskId>` for progress and result.");
  lines.push("", "Seedance V3 inputs accept public URLs, supported data URLs, or asset:// ids returned by the BytePlus-compatible CreateAsset action. In prompts, refer to media as Image 1, Video 1, and Audio 1.");
  lines.push("", "**Client request**", "", markdownCodeBlock("json", item.exampleRequest));
  return lines.join("\n");
}

function advancedConstraintsMarkdown(doc = {}) {
  const constraints = doc.constraints || advancedGenerateConstraintsDoc();
  const seedance = constraints.seedance || {};
  const wan30 = constraints.wan30 || {};
  const seedance25 = constraints.seedance25 || {};
  const seedanceNsfw = constraints.seedanceNsfw || {};
  const vega = constraints.vega || {};
  const wan27 = constraints.wan27 || {};
  const wan27Image = constraints.wan27Image || {};
  const seedream5Image = constraints.seedream5Image || {};
  const qwenImage3 = constraints.qwenImage3 || {};
  return [
    "**Parameter Rules**",
    "",
    "These are the request fields and limits callers should follow.",
    "",
    "Seedance V3:",
    "",
    `- \`model\`: \`${seedance.model?.standard || "dreamina-seedance-2-0-260128"}\` for standard, \`${seedance.model?.fast || "dreamina-seedance-2-0-fast-260128"}\` for fast.`,
    "- `content`: 1-16 blocks. Include one non-empty `text` block. Supported media block types are `image_url`, `video_url`, and `audio_url`.",
    "- `content[].role`: images use `first_frame`, `last_frame`, or `reference_image`; videos use `reference_video`; audios use `reference_audio`.",
    `- \`duration\`: integer ${seedance.durationSeconds?.min ?? advancedDurationBounds("seedance").min}-${seedance.durationSeconds?.max ?? advancedDurationBounds("seedance").max} seconds.`,
    `- \`resolution\`: standard ${(seedance.resolution?.standard || []).map((item) => `\`${item}\``).join(", ")}; fast ${(seedance.resolution?.fast || []).map((item) => `\`${item}\``).join(", ")}.`,
    "- `generate_audio`: boolean, default `true`; set `false` to disable generated voice, effects, or background music.",
    `- Image inputs: JPG/PNG/WebP/BMP, max ${Math.round((seedance.imageInput?.maxBytes || IMAGE_UPLOAD_MAX_BYTES) / 1024 / 1024)}MB, width and height each ${seedance.imageInput?.widthPx?.min ?? SEEDANCE_IMAGE_DIMENSION_MIN}-${seedance.imageInput?.widthPx?.max ?? SEEDANCE_IMAGE_DIMENSION_MAX}px, aspect ratio ${seedance.imageInput?.aspectRatio?.min ?? SEEDANCE_IMAGE_ASPECT_RATIO_MIN}-${seedance.imageInput?.aspectRatio?.max ?? SEEDANCE_IMAGE_ASPECT_RATIO_MAX}.`,
    `- Video references: max ${seedance.referenceLimits?.videos ?? ADVANCED_SEEDANCE_VIDEO_REFERENCE_LIMIT} videos; pixel count ${seedance.videoInput?.pixelCount?.min ?? SEEDANCE_VIDEO_PIXEL_COUNT_MIN}-${seedance.videoInput?.pixelCount?.max ?? SEEDANCE_VIDEO_PIXEL_COUNT_MAX}. For 9:16 video, 480x854 is the smallest safe size.`,
    `- Max references: ${seedance.referenceLimits?.images ?? ADVANCED_SEEDANCE_REFERENCE_LIMIT} images total, ${seedance.referenceLimits?.videos ?? ADVANCED_SEEDANCE_VIDEO_REFERENCE_LIMIT} videos, ${seedance.referenceLimits?.audios ?? ADVANCED_SEEDANCE_AUDIO_REFERENCE_LIMIT} audios.`,
    "- `first_frame` and `last_frame` cannot be mixed with `reference_image`, `reference_video`, or `reference_audio` blocks.",
    `- Audio references: max ${seedance.referenceLimits?.audios ?? ADVANCED_SEEDANCE_AUDIO_REFERENCE_LIMIT} audios; supported uploaded/data URL audio types are MP3, WAV, M4A/MP4 audio, AAC, OGG, WebM; upload max ${Math.round((seedance.audioInput?.maxBytes || MEDIA_UPLOAD_MAX_BYTES) / 1024 / 1024)}MB. Audio references must be combined with image or video references; audio-only generation is rejected.`,
    "",
    "Tencent VOD Vega video:",
    "",
    `- Endpoint: \`${vega.route || "/api/advanced/generate"}\` with \`provider\`: ${(vega.providers || []).map((item) => `\`${item.id}\``).join(", ")}.`,
    `- \`modes\`: ${(vega.modes || ["text_to_video", "first_frame", "last_frame", "first_last_frame", "reference_video", "draft_followup"]).map((item) => `\`${item}\``).join(", ")}.`,
    `- \`duration\`: per-model limits: Vega 1.0 Pro ${advancedDurationBounds("seedance20-vega").min}-${advancedDurationBounds("seedance20-vega").max} with no -1; Vega 1.5 Pro ${advancedDurationBounds("seedance25-vega").min}-${advancedDurationBounds("seedance25-vega").max} or -1; Vega 1.5 Lite ${advancedDurationBounds("h3-vega").min}-${advancedDurationBounds("h3-vega").max} or -1; Vega 1.0 Lite ${advancedDurationBounds("vega10-lite").min}-${advancedDurationBounds("vega10-lite").max} with no smart duration.`,
    `- \`resolution\`: ${(vega.resolution || ["480P", "720P", "768P", "1080P", "2K", "4K"]).map((item) => `\`${item}\``).join(", ")} (per-model limits apply).`,
    `- \`ratio\`: ${(vega.ratio || ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16", "adaptive"]).map((item) => `\`${item}\``).join(", ")}.`,
    `- ${vega.mediaTransport || `${vega.mediaUrl || "Use public HTTP(S) URLs only."} FileInfos use Usage FirstFrame, LastFrame, or Reference.`}`,
    `- ${vega.taskTypeRule || "Vega 1.5 Pro supports auto, reference, edit, and extend. Edit and extend both require a reference video and adaptive ratio."}`,
    `- ${vega.draftRule || "Draft requires 480P; Draft to Final uses draft_task_id with no prompt or media inputs."}`,
    `- ExtInfo: ${(vega.extInfo || []).map((item) => `\`${item}\``).join(", ")}.`,
    `- ${vega.pricing || "Vega pricing is not configured; requests fail closed with HTTP 422 MODEL_PRICING_UNAVAILABLE."}`,
    "",
    "Seedream 5.0 image:",
    "",
    `- Endpoint: \`${seedream5Image.route || "/api/v3/images/generations"}\` with \`model: "seedream-5.0-pro"\`.`,
    "- Create is async: response returns `id`/`task_id` and `status`; poll `/api/v3/contents/generations/tasks/<taskId>` and read `content.image_url` when succeeded.",
    `- \`image\`: optional reference image or array of reference images, max ${seedream5Image.referenceImages?.max ?? ADVANCED_SEEDANCE_REFERENCE_LIMIT}. Use public URLs, supported image data URLs, or \`asset://\` ids.`,
    `- \`size\`: ${(seedream5Image.size || ["1K", "2K"]).map((item) => `\`${item}\``).join(", ")}.`,
    `- \`response_format\`: \`url\`. The async create response does not return base64 image data. \`output_format\`: ${(seedream5Image.output_format || ["png", "jpeg"]).map((item) => `\`${item}\``).join(", ")}.`,
    `- Reference image limits: max ${Math.round((seedream5Image.imageInput?.maxBytes || IMAGE_UPLOAD_MAX_BYTES) / 1024 / 1024)}MB, width/height > 14px, aspect ratio 1/16-16, total pixels <= ${seedream5Image.imageInput?.maxPixelCount || 36000000}.`,
    "- Unsupported for this model: `sequential_image_generation`, `sequential_image_generation_options`, `seed`, `guidance_scale`.",
    "",
    "Qwen Image 3.0:",
    "",
    `- Endpoint: \`${qwenImage3.route || "/api/v3/images/generations"}\` with \`model: "${qwenImage3.models?.pro || QWEN_IMAGE3_MODELS.pro}"\` or \`model: "${qwenImage3.models?.standard || QWEN_IMAGE3_MODELS.standard}"\`.`,
    "- Create is async: response returns `id`/`task_id`; poll `/api/v3/contents/generations/tasks/<taskId>` and read `content.image_url`, `content.image_urls`, or `data[].url` when succeeded.",
    `- \`image\`: optional reference image or array of 1-${qwenImage3.referenceImages?.max ?? QWEN_IMAGE3_REFERENCE_LIMIT} images. Use public URLs, supported image data URLs, or \`asset://\` ids.`,
    `- \`size\`: \`${(qwenImage3.size?.presets || ["1K", "2K"]).join("\`, \`")}\` or \`width*height\`; pixel area ${qwenImage3.size?.minPixelArea ?? QWEN_IMAGE3_SIZE_MIN_PIXELS}-${qwenImage3.size?.maxPixelArea ?? QWEN_IMAGE3_SIZE_MAX_PIXELS}, aspect ratio 1:8-8:1.`,
    `- \`n\`: integer ${qwenImage3.outputImages?.min ?? 1}-${qwenImage3.outputImages?.max ?? QWEN_IMAGE3_OUTPUT_MAX}. \`seed\`: integer ${qwenImage3.seed?.min ?? 0}-${qwenImage3.seed?.max ?? QWEN_IMAGE3_SEED_MAX}.`,
    "- `prompt_extend_mode`: `direct`; `agent` is accepted only for text-to-image without reference images.",
    "- Reference images: JPG/JPEG/PNG/BMP/TIFF/WebP/GIF, max 10MB each; recommended width and height 384-2048px.",
    "",
    "Wan 3.0 video:",
    "",
    `- Endpoint: \`${wan30.route || "/api/advanced/generate"}\` with \`provider: "wan30"\` and \`videoCapability\`: \`w3.0-video\`, \`w3.0-video-pro\`, \`w3.0-video-prime\`, or \`w3.0-video-prime-pro\`.`,
    `- \`mediaMode\`: ${(wan30.mediaMode || ["multimodal", "first_last_frame"]).map((item) => `\`${item}\``).join(", ")}. First/last frames cannot be mixed with reference media.`,
    `- \`duration\`: integer ${wan30.durationSeconds?.min ?? 2}-${wan30.durationSeconds?.max ?? 30} seconds, or \`-1\` for adaptive duration.`,
    "- `videoCapability`: `w3.0-video`, `w3.0-video-pro`, `w3.0-video-prime`, or `w3.0-video-prime-pro`.",
    ...Object.entries(wan30.resolutionsByCapability || {
      "w3.0-video": ["480p", "720p", "1080p"],
      "w3.0-video-pro": ["1080p", "2k", "4k"],
      "w3.0-video-prime": ["480p", "720p", "1080p"],
      "w3.0-video-prime-pro": ["1080p", "2k", "4k"],
    }).map(([capability, resolutions]) => `- \`${capability}\` resolution: ${resolutions.map((item) => `\`${item}\``).join(", ")}.`),
    `- \`ratio\`: ${(wan30.ratio || ["16:9", "4:3", "1:1", "3:4", "9:16", "adaptive"]).map((item) => `\`${item}\``).join(", ")}.`,
    `- References: max ${wan30.referenceLimits?.images ?? 10} images, ${wan30.referenceLimits?.videos ?? 5} videos, and ${wan30.referenceLimits?.audios ?? 5} audios.`,
    "- Images: JPG/JPEG/PNG/BMP/WebP, max 20MB, width/height 240-8000px, aspect ratio at most 8:1; transparent PNG is not supported.",
    "- Videos: MP4/MOV, smaller than 100MB, width/height 240-4096px, aspect ratio at most 8:1, each 1-15 seconds, total video references at most 15 seconds.",
    "- Audios: MP3/WAV, smaller than 15MB, each 1-15 seconds, total audio references at most 15 seconds.",
    "- With video references and a fixed output duration, input-video seconds plus output duration must not exceed 30 seconds.",
    "",
    "Seedance 2.5 video (provider `seedance25`):",
    "",
    `- Endpoint: \`${seedance25.route || "/api/advanced/generate"}\` with \`provider: "seedance25"\`.`,
    "- Modes: `reference`, `first_last_frame`. `omini` is accepted as the reference-mode alias.",
    "- `duration`: integer 4-30 seconds for `480p`, or 4-29 seconds for `720p`.",
    `- \`resolution\`: ${(seedance25.resolution || ["480p", "720p"]).map((item) => `\`${item}\``).join(", ")}.`,
    `- Reference mode: at least one reference; max ${seedance25.referenceLimits?.images ?? 30} images, ${seedance25.referenceLimits?.videos ?? 10} videos, ${seedance25.referenceLimits?.audios ?? 10} audios, and ${seedance25.referenceLimits?.total ?? 50} assets total. Audio-only is not supported.`,
    "- First/last frame mode requires both frame images and cannot be mixed with reference media. `generateAudio`/`generate_audio` defaults to `true` and does not change the upstream price.",
    "",
    "Seedance 2.5 video (provider `seedance-nsfw`):",
    "",
    `- Endpoint: \`${seedanceNsfw.route || "/api/advanced/generate"}\` with \`provider: "${seedanceNsfw.provider || SEEDANCE25_DIRECT_PROVIDER}"\`.`,
    "- Modes: `reference`, `first_last_frame`, `edit`, `extend`. `omini` is accepted as the reference-mode alias.",
    `- \`duration\`: integer ${seedanceNsfw.durationSeconds?.min ?? 4}-${seedanceNsfw.durationSeconds?.max ?? 30} seconds. Edit follows the source-video duration; extend uses duration as the extension length.`,
    `- \`resolution\`: ${(seedanceNsfw.resolution || SEEDANCE25_DIRECT_RESOLUTIONS).map((item) => `\`${item}\``).join(", ")}. \`ratio\`: ${(seedanceNsfw.ratio || SEEDANCE25_DIRECT_RATIOS).map((item) => `\`${item}\``).join(", ")}.`,
    `- References: max ${seedanceNsfw.referenceLimits?.images ?? 30} images, ${seedanceNsfw.referenceLimits?.videos ?? 10} videos, ${seedanceNsfw.referenceLimits?.audios ?? 10} audios, and ${seedanceNsfw.referenceLimits?.total ?? 50} assets total. Audio-only reference generation is supported.`,
    "- `generateAudio`/`generate_audio`: boolean, default `true`. First/last frame mode cannot be mixed with reference media; edit and extend require exactly one source video.",
    "",
    "Z-Image Spicy Pro (text-to-image):",
    "",
    "- Endpoint: `/api/wan27/image-edit` with no input image.",
    "- `resolution`: `1K` or `2K`. `ratio`: `1:1`, `3:4`, `4:3`, `9:16`, or `16:9`.",
    "- `size` accepts an explicit `width*height`; width and height must each stay within 256-2560px.",
    "- Single-image output only. Image inputs on this engine are treated as an image edit instead.",
    "",
    "Qwen Image Edit Spicy (image edit):",
    "",
    "- Endpoint: `/api/wan27/image-edit` with 1-3 input images.",
    "- The first image is the picture being edited; the remaining ones are optional references.",
    "- `resolution`: `1K` or `2K`. `ratio`: `1:1`, `3:4`, `4:3`, `9:16`, or `16:9`.",
    `- Image inputs: JPG/PNG/WebP/BMP, max ${Math.round((wan27Image.imageInput?.maxBytes || IMAGE_UPLOAD_MAX_BYTES) / 1024 / 1024)}MB.`,
    "",
  ].join("\n");
}

function externalAdvancedApiMarkdown(doc = {}) {
  const route = (url, fallback = "") => String(url || fallback || "").replace(String(doc.baseUrl || ""), "");
  const endpoints = doc.endpoints || {};
  const supportedModels = Array.isArray(doc.supportedModels) ? doc.supportedModels : [];
  const supportedModelTable = markdownTable(["Model", "Model / Provider", "Capability", "Create", "Result"], supportedModels.map((item) => ({
    Model: item.name || "",
    "Model / Provider": item.model || item.provider || "",
    Capability: item.capability || "-",
    Create: item.create || "",
    Result: item.result || "",
  })));
  return [
    "## Advanced External API",
    "",
    "Use this section to call video and image generation APIs and check parameter limits.",
    "",
    "**Supported models**",
    "",
    supportedModelTable,
    "",
    "Seedance 2.0 uses the V3 task route. Other video models use the Advanced route. Image models use the V3 image route or the dedicated Wan image route shown below.",
    "",
    "**Seedance through BytePlus-compatible V3**",
    "",
    markdownCodeBlock("http", [
      `POST ${route(endpoints.byteplusGenerate, "/api/v3/contents/generations/tasks")}`,
      "Authorization: Bearer <user-token>",
      "Content-Type: application/json",
      "",
      JSON.stringify(doc.byteplusExample?.body || {}, null, 2),
    ].join("\n")),
    "",
    "**V3 request fields**",
    "",
    byteplusV3ParameterMarkdown(),
    "",
    "**Response and polling**",
    "",
    "The create response returns only `id`. Poll the V3 task detail endpoint until `status` is `succeeded` or `failed`.",
    "",
    markdownCodeBlock("http", [
      `GET ${route(endpoints.byteplusTaskDetail, "/api/v3/contents/generations/tasks/<taskId>")}`,
      "Authorization: Bearer <user-token>",
    ].join("\n")),
    "",
    "**Seedream 5.0 image through V3**",
    "",
    markdownCodeBlock("http", [
      `POST ${route(endpoints.seedream5ImageGenerate, "/api/v3/images/generations")}`,
      "Authorization: Bearer <user-token>",
      "Content-Type: application/json",
      "",
      JSON.stringify(doc.seedream5ImageExample?.body || {}, null, 2),
    ].join("\n")),
    "",
    "**Seedream 5.0 image fields**",
    "",
    docsParameterMarkdown(seedream5ImageParameterFields()),
    "",
    "**Seedream 5.0 image response and polling**",
    "",
    "The create response returns `id`, `task_id`, `status`, and an empty `data` array while the task is queued or running. Poll the same V3 task detail endpoint used for video tasks. When `status` is `succeeded`, read `content.image_url`.",
    "",
    markdownCodeBlock("json", doc.seedream5ImageResponseShape || { id: "img-...", task_id: "img-...", status: "queued", data: [] }),
    "",
    markdownCodeBlock("http", [
      `GET ${route(endpoints.seedream5ImageTaskDetail || endpoints.byteplusTaskDetail, "/api/v3/contents/generations/tasks/<taskId>")}`,
      "Authorization: Bearer <user-token>",
    ].join("\n")),
    "",
    "**Qwen Image 3.0 through V3**",
    "",
    markdownCodeBlock("http", [
      `POST ${route(endpoints.qwenImage3Generate, "/api/v3/images/generations")}`,
      "Authorization: Bearer <user-token>",
      "Content-Type: application/json",
      "",
      JSON.stringify(doc.qwenImage3Example?.body || {}, null, 2),
    ].join("\n")),
    "",
    "**Qwen Image 3.0 fields**",
    "",
    docsParameterMarkdown(qwenImage3ParameterFields()),
    "",
    "**Qwen Image 3.0 response and polling**",
    "",
    "The create response is asynchronous. Poll the V3 task detail endpoint. When `status` is `succeeded`, read `content.image_url`, `content.image_urls`, or `data[].url`.",
    "",
    markdownCodeBlock("json", doc.qwenImage3ResponseShape || { id: "img-...", task_id: "img-...", status: "queued", data: [] }),
    "",
    markdownCodeBlock("http", [
      `GET ${route(endpoints.qwenImage3TaskDetail || endpoints.byteplusTaskDetail, "/api/v3/contents/generations/tasks/<taskId>")}`,
      "Authorization: Bearer <user-token>",
    ].join("\n")),
    "",
    "**Reusable assets for Advanced models**",
    "",
    "Upload by public URL or data URL, then reuse `asset.id` in Advanced requests. This asset id is not prefixed with `asset://`.",
    "",
    markdownCodeBlock("http", [
      `POST ${route(endpoints.userAssets, "/api/user-assets")}`,
      "Authorization: Bearer <user-token>",
      "Content-Type: application/json",
      "",
      JSON.stringify({
        videoUrl: "https://example.com/reference.mp4",
        fileName: "reference.mp4",
        durationSeconds: 8,
      }, null, 2),
    ].join("\n")),
    "",
    "**Advanced asset fields**",
    "",
    docsParameterMarkdown(advancedAssetParameterFields()),
    "",
    ...["w3.0-video", "w3.0-video-pro", "w3.0-video-prime", "w3.0-video-prime-pro"].flatMap((capability) => {
      const names = {
        "w3.0-video": ["W3.0", "wan30Example"],
        "w3.0-video-pro": ["W3.0-Pro", "wan30ProExample"],
        "w3.0-video-prime": ["W3.0-Prime", "wan30PrimeExample"],
        "w3.0-video-prime-pro": ["W3.0-VSR-Prime", "wan30PrimeProExample"],
      };
      const [name, exampleKey] = names[capability];
      return [
        `**${name} (\`${capability}\`)**`,
        "",
        markdownCodeBlock("http", [
          `POST ${route(endpoints.advancedGenerate, "/api/advanced/generate")}`,
          "Authorization: Bearer <user-token>",
          "Content-Type: application/json",
          "",
          JSON.stringify(doc[exampleKey]?.body || {}, null, 2),
        ].join("\n")),
        "",
        `**${name} fields**`,
        "",
        docsParameterMarkdown(wan30VideoParameterFields(capability)),
        "",
      ];
    }),
    "**Seedance 2.5 video**",
    "",
    markdownCodeBlock("http", [
      `POST ${route(endpoints.advancedGenerate, "/api/advanced/generate")}`,
      "Authorization: Bearer <user-token>",
      "Content-Type: application/json",
      "",
      JSON.stringify(doc.seedance25Example?.body || {}, null, 2),
    ].join("\n")),
    "",
    "**Seedance 2.5 fields (provider `seedance25`)**",
    "",
    docsParameterMarkdown(seedance25VideoParameterFields()),
    "",
    "**Seedance 2.5 video (provider `seedance-nsfw`)**",
    "",
    markdownCodeBlock("http", [
      `POST ${route(endpoints.advancedGenerate, "/api/advanced/generate")}`,
      "Authorization: Bearer <user-token>",
      "Content-Type: application/json",
      "",
      JSON.stringify(doc.seedanceNsfwExample?.body || {}, null, 2),
    ].join("\n")),
    "",
    "**Seedance 2.5 fields (provider `seedance-nsfw`)**",
    "",
    docsParameterMarkdown(seedanceNsfwVideoParameterFields()),
    "",
    "**Vega video models**",
    "",
    "`Vega 1.0 Pro`, `Vega 1.5 Pro`, `Vega 1.5 Lite`, and `Vega 1.0 Lite` use Tencent VOD International through the same Advanced route. All four support text, first frame, last frame, first + last frame, and multimodal references. Vega 1.5 Pro additionally supports edit, extend, Draft, and Draft to Final. Vega 1.0 Pro supports 480P/720P/768P/1080P/2K/4K, 4-15 second outputs, 9 images, 3 videos, 3 audios, and 12 references total. Vega 1.0 Lite supports 480P/768P/1080P/2K/4K with the same reference limits. Send public HTTP(S) media URLs only; asset IDs and data URLs are rejected. Vega output and reference-video input rates are stored separately in PostgreSQL; requests fail closed before charging or calling upstream when a required rate is missing.",
    "",
    ...["seedance20-vega", "seedance25-vega", "h3-vega", "vega10-lite"].flatMap((provider) => [
      `**${vegaProviderLabel(provider)} (provider \`${provider}\`)**`,
      "",
      markdownCodeBlock("http", [
        `POST ${route(endpoints.advancedGenerate, "/api/advanced/generate")}`,
        "Authorization: Bearer <user-token>",
        "Content-Type: application/json",
        "",
        JSON.stringify(vegaProviderExample(provider), null, 2),
      ].join("\n")),
      "",
      `**${vegaProviderLabel(provider)} fields**`,
      "",
      docsParameterMarkdown(vegaVideoParameterFields(provider)),
      "",
    ]),
    "**Advanced task polling**",
    "",
    "W3.0, W3.0-Pro, W3.0-Prime, W3.0-VSR-Prime, Seedance 2.5, and the Vega models return `taskId`. Poll the generation record until its status is terminal.",
    "",
    markdownCodeBlock("http", [
      `GET ${route(endpoints.generationRecordDetail, "/api/generation-records/<taskId>")}`,
      "Authorization: Bearer <user-token>",
    ].join("\n")),
    "",
    "**Z-Image Spicy Pro**",
    "",
    "Text-to-image engine on the dedicated image endpoint. Send no input image.",
    "",
    markdownCodeBlock("http", [
      `POST ${route(endpoints.wan27ImageEdit, "/api/wan27/image-edit")}`,
      "Authorization: Bearer <user-token>",
      "Content-Type: application/json",
      "",
      JSON.stringify(doc.zImageSpicyProExample?.body || {}, null, 2),
    ].join("\n")),
    "",
    "**Z-Image Spicy Pro fields**",
    "",
    docsParameterMarkdown(zImageSpicyProParameterFields()),
    "",
    "**Qwen Image Edit Spicy**",
    "",
    "Reference-image editing engine on the same dedicated image endpoint.",
    "",
    markdownCodeBlock("http", [
      `POST ${route(endpoints.wan27ImageEdit, "/api/wan27/image-edit")}`,
      "Authorization: Bearer <user-token>",
      "Content-Type: application/json",
      "",
      JSON.stringify(doc.qwenImageEditSpicyExample?.body || {}, null, 2),
    ].join("\n")),
    "",
    "**Qwen Image Edit Spicy fields**",
    "",
    docsParameterMarkdown(qwenImageEditSpicyParameterFields()),
    "",
    "**BytePlus-compatible asset upload**",
    "",
    "Optional: create a reusable asset first, then use `asset://<asset-id>` in `content[].image_url.url`, `content[].video_url.url`, or `content[].audio_url.url`.",
    "",
    markdownCodeBlock("http", [
      `POST ${route(endpoints.byteplusAssetAction, "/?Action=CreateAsset&Version=2024-01-01")}`,
      "Authorization: Bearer <user-token>",
      "Content-Type: application/json",
      "",
      JSON.stringify({
        GroupId: "group-id-optional",
        URL: "https://example.com/reference.png",
        AssetType: "Image",
        Name: "reference image",
        Moderation: { Strategy: "Skip" },
        ProjectName: "default",
      }, null, 2),
    ].join("\n")),
    "",
    advancedConstraintsMarkdown(doc),
    "",
    embedLiveIntegrationMarkdown(),
    "",
  ].join("\n");
}

function buildModelDocsMarkdown(docs) {
  if (!PUBLIC_ALIYUN_MODEL_EXPOSURE_ENABLED) return buildRestrictedModelDocsMarkdown(docs);
  return [
    `# ${docs.title}`,
    "",
    `Base URL: ${docs.baseUrl}`,
    "",
    "This is the caller-facing source of truth for supported models, request fields, media combinations, and result polling.",
    "",
    "## Authentication",
    "",
    "Use the token from your account page:",
    "",
    markdownCodeBlock("http", "Authorization: Bearer <user-token>"),
    "",
    mulerouterRoutingMarkdown(),
    externalAdvancedApiMarkdown(docs.advancedExternalApi),
    "",
    "## Quick Start",
    "",
    "1. Read `/api/models` or this Markdown file for request shapes and limits.",
    "2. For V3 reusable media, create assets with `/?Action=CreateAsset&Version=2024-01-01`, then use `asset://<asset-id>`. For Advanced models, upload with `/api/user-assets`, then use the returned `asset.id`.",
    "3. Create a Seedance video task with `/api/v3/contents/generations/tasks`; the create response returns `id`.",
    "4. Create a Seedream 5.0 Pro or Qwen Image 3.0 task with `/api/v3/images/generations`; the create response returns `id`/`task_id`.",
    "5. Create W3.0, W3.0-Pro, W3.0-Prime, W3.0-VSR-Prime, or Seedance 2.5 tasks with `/api/advanced/generate` and the documented provider plus Mulerouter node name in `videoCapability`.",
    "6. Create Z-Image Spicy Pro text-to-image tasks or Qwen Image Edit Spicy image-edit tasks with `/api/wan27/image-edit`.",
    "7. Poll `/api/v3/contents/generations/tasks/<taskId>` for V3 tasks and `/api/generation-records/<taskId>` for Advanced/Wan records.",
    "",
    "## Seedance V3 Example",
    "",
    "This is the recommended BytePlus-compatible Seedance flow.",
    "",
    markdownCodeBlock("http", [
      "POST /?Action=CreateAsset&Version=2024-01-01",
      "Authorization: Bearer <user-token>",
      "Content-Type: application/json",
      "",
      "{",
      '  "URL": "https://example.com/character-image1.png",',
      '  "AssetType": "Image",',
      '  "Name": "image1",',
      '  "Moderation": {"Strategy": "Skip"}',
      "}",
      "",
      "Response:",
      "{",
      '  "ResponseMetadata": {"RequestId": "req-...", "Action": "CreateAsset"},',
      '  "Result": {"Id": "asset-id-from-upload"}',
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
      '    {"type": "image_url", "image_url": {"url": "asset://asset-id-from-upload"}, "role": "reference_image"}',
      "  ],",
      '  "ratio": "9:16",',
      '  "resolution": "720p",',
      '  "duration": 5,',
      '  "generate_audio": true,',
      '  "watermark": false',
      "}",
    ].join("\n")),
    "",
    embedLiveIntegrationMarkdown(),
    "",
    "## Billing",
    "",
    docs.billing.note,
    "",
    "## Endpoints",
    "",
    markdownCodeBlock("json", docs.endpoints),
    "",
    docs.advanced.telegram ? `\nSupport: ${docs.advanced.telegram}\n` : "",
    "",
  ].join("\n");
}

function apiDocSlug(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/`/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "section";
}

function apiDocGroup(title = "") {
  const value = String(title || "").toLowerCase();
  if (/embedded live|embed live|实时/.test(value)) return "live";
  if (/reusable media|asset|upload|素材/.test(value)) return "assets";
  if (/seedance|wan|w3\.0|video|task polling/.test(value)) return "video";
  if (/seedream|qwen image|z-image|image/.test(value)) return "image";
  if (/authentication|quick start|billing|endpoint|mulerouter|supported model/.test(value)) return "basics";
  return "basics";
}

function splitMarkdownH2Sections(markdown = "") {
  const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
  const intro = [];
  const sections = [];
  let current = null;
  for (const line of lines) {
    const match = line.match(/^##\s+(.+?)\s*$/);
    if (match) {
      if (current) sections.push(current);
      current = { title: match[1].trim(), lines: [line] };
      continue;
    }
    if (current) current.lines.push(line);
    else intro.push(line);
  }
  if (current) sections.push(current);
  return {
    intro: intro.join("\n").replace(/^#\s+.*(?:\n|$)/, "").trim(),
    sections: sections.map((section) => ({
      title: section.title,
      markdown: section.lines.join("\n").trim(),
    })).filter((section) => section.title && section.markdown),
  };
}

function quickStartApiDocMarkdown(docs = {}) {
  return [
    "## Quick Start",
    "",
    "1. Keep your API token on your server and send it as `Authorization: Bearer <user-token>`.",
    "2. Query the model catalog with `GET /api/models` when you need machine-readable model metadata.",
    "3. Upload reusable media first when your model supports asset references, then use the returned asset id in generation requests.",
    "4. Create a video or image task with one of the documented endpoints and keep the returned task id.",
    "5. Poll the matching task endpoint until the status is `succeeded` or `failed`.",
    "6. Download successful output promptly; temporary upstream media links may expire.",
    "",
    `Base URL: ${docs.baseUrl || ""}`,
    "",
  ].join("\n");
}

function buildStructuredApiDocs(docs = {}) {
  // The restricted builder already emits one H2 per public model family and keeps
  // selective model exposure rules in one place. Use it as the canonical section
  // source so the web UI, Markdown download, and JSON download cannot drift apart.
  const source = buildRestrictedModelDocsMarkdown(docs);
  const parsed = splitMarkdownH2Sections(source);
  const sections = parsed.sections.slice();
  if (!sections.some((section) => /^quick start$/i.test(section.title))) {
    const insertAt = Math.max(1, sections.findIndex((section) => /^authentication$/i.test(section.title)) + 1);
    sections.splice(insertAt, 0, {
      title: "Quick Start",
      markdown: quickStartApiDocMarkdown(docs),
    });
  }
  const seen = new Map();
  return {
    version: "1.0",
    title: `${docs.title || "Vipeak AI"} API Documentation`,
    baseUrl: docs.baseUrl || "",
    updatedAt: docs.updatedAt || new Date().toISOString(),
    summary: parsed.intro || "Structured HTTP API documentation for generation, assets, polling, and embedded live chat.",
    groups: [
      { id: "basics", title: "基础与接入" },
      { id: "video", title: "视频生成" },
      { id: "image", title: "图片生成" },
      { id: "assets", title: "素材管理" },
      { id: "live", title: "实时聊天嵌入" },
    ],
    sections: sections.map((section) => {
      const baseId = apiDocSlug(section.title);
      const count = (seen.get(baseId) || 0) + 1;
      seen.set(baseId, count);
      return {
        id: count === 1 ? baseId : `${baseId}-${count}`,
        group: apiDocGroup(section.title),
        title: section.title,
        summary: markdownText(section.markdown.replace(/^##\s+.+$/m, "").replace(/[`*_#>|-]/g, " ")).slice(0, 180),
        markdown: section.markdown,
      };
    }),
  };
}

function buildStructuredApiDocsMarkdown(docs = {}) {
  const structured = buildStructuredApiDocs(docs);
  const contents = structured.sections.map((section) => `- [${section.title}](#${section.id})`).join("\n");
  return [
    `# ${structured.title}`,
    "",
    `- Version: ${structured.version}`,
    `- Last updated: ${structured.updatedAt}`,
    `- Base URL: ${structured.baseUrl}`,
    "",
    structured.summary,
    "",
    "## Table of Contents",
    "",
    contents,
    "",
    ...structured.sections.flatMap((section) => [section.markdown, "", "---", ""]),
  ].join("\n").trimEnd() + "\n";
}

async function handleModelsJson(req, res) {
  const auth = await requireApiDocsAccess(req, res);
  if (!auth) return;
  const docs = await buildModelDocs(req);
  return sendJson(res, 200, publicModelDocsView(docs));
}

async function handleModelsMarkdown(req, res) {
  const auth = await requireApiDocsAccess(req, res);
  if (!auth) return;
  const docs = await buildModelDocs(req);
  return sendMarkdown(res, 200, buildModelDocsMarkdown(publicModelDocsView(docs)));
}

async function handleApiDocsJson(req, res) {
  const auth = await requireApiDocsAccess(req, res);
  if (!auth) return;
  const docs = await buildModelDocs(req);
  return sendJson(res, 200, buildStructuredApiDocs(publicModelDocsView(docs)));
}

async function handleApiDocsMarkdown(req, res) {
  const auth = await requireApiDocsAccess(req, res);
  if (!auth) return;
  const docs = await buildModelDocs(req);
  return sendMarkdown(res, 200, buildStructuredApiDocsMarkdown(publicModelDocsView(docs)));
}

function apiAccessEnabledForRequest(req) {
  return requestTenantOptions(req).apiAccess !== false;
}

function sendApiAccessDisabled(res) {
  return sendJson(res, 404, {
    ok: false,
    code: "API_ACCESS_DISABLED",
    message: "External API access is not enabled for this domain.",
  });
}

function byteplusAssetActionRequested(url = null) {
  return Boolean(url && (url.searchParams.has("Action") || url.searchParams.has("action")));
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
  const media = isSucceededStatus(status) && (!record.localVideoUrl || !record.cdnVideoUrl)
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

async function refreshSeedance25GenerationRecord(record, reason = "query") {
  if (String(record.provider || "").toLowerCase() !== "seedance25") return record;
  const queryTaskId = record.upstreamTaskId || record.taskId;
  const task = await seedance25Request("/api/v3/tasks/query", { task_id: queryTaskId });
  const status = apizStatus(task);
  const resultUrl = apizResultUrl(task);
  const media = isSucceededStatus(status) && resultUrl && (!record.localVideoUrl || !record.cdnVideoUrl)
    ? await maybeDownloadApizVideo(record, resultUrl)
    : {};
  return upsertAndSettleGenerationRecord({
    taskId: record.taskId,
    upstreamTaskId: apizTaskId(task) || queryTaskId,
    status,
    awaitingUpstreamTask: false,
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
    error: (isFailedStatus(status) ? seedance25TaskFailureMessage(task) || "Seedance 2.5 generation failed." : "")
      || media.downloadError
      || "",
    queryResponse: task,
    completedAt: isSucceededStatus(status) ? (record.completedAt || new Date().toISOString()) : record.completedAt || "",
  }, `seedance25-${reason}`);
}

function isCompletedStatus(status) {
  return ["completed", "succeeded", "success", "done", "image_ready"].includes(String(status || "").toLowerCase());
}

async function downloadGeneratedCharacterSheet(taskId, imageUrl) {
  await fs.mkdir(path.join(GENERATED_CHARACTER_DIR, taskId), { recursive: true });
  const ext = path.extname(new URL(imageUrl).pathname).toLowerCase() || ".png";
  const fileName = `sheet${[".png", ".jpg", ".jpeg", ".webp"].includes(ext) ? ext : ".png"}`;
  const localPath = path.join(GENERATED_CHARACTER_DIR, taskId, fileName);
  const localUrl = `/assets/generated/characters/apiz/${taskId}/${fileName}`;
  try {
    await fs.access(localPath);
    const existingBytes = generatedOutputStorageEnabled() ? await fs.readFile(localPath) : null;
    const mirror = existingBytes && generatedOutputStorageEnabled()
      ? await uploadLocalAssetMirrorToObjectStorage({ localUrl, bytes: existingBytes, mime: imageMimeFromPath(localPath) })
      : {};
    return {
      localPath,
      localUrl,
      cdnImageUrl: mirror.publicUrl || "",
      objectStorageKey: mirror.key || "",
      cdnError: mirror.error || "",
    };
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
  const mirror = generatedOutputStorageEnabled()
    ? await uploadLocalAssetMirrorToObjectStorage({ localUrl, bytes, mime: imageMimeFromPath(localPath) })
    : {};
  return {
    localPath,
    localUrl,
    cdnImageUrl: mirror.publicUrl || "",
    objectStorageKey: mirror.key || "",
    cdnError: mirror.error || "",
  };
}

async function findGeneratedCharacterSheet(taskId) {
  const safeTaskId = String(taskId || "").trim();
  if (!safeTaskId) return null;
  for (const ext of [".png", ".jpg", ".jpeg", ".webp"]) {
    const fileName = `sheet${ext}`;
    const localPath = path.join(GENERATED_CHARACTER_DIR, safeTaskId, fileName);
    const localUrl = `/assets/generated/characters/apiz/${safeTaskId}/${fileName}`;
    try {
      await fs.access(localPath);
      const existingBytes = generatedOutputStorageEnabled() ? await fs.readFile(localPath) : null;
      const mirror = existingBytes && generatedOutputStorageEnabled()
        ? await uploadLocalAssetMirrorToObjectStorage({ localUrl, bytes: existingBytes, mime: imageMimeFromPath(localPath) })
        : {};
      return {
        localPath,
        localUrl,
        cdnImageUrl: mirror.publicUrl || "",
        objectStorageKey: mirror.key || "",
        cdnError: mirror.error || "",
      };
    } catch {
      // Try the next extension.
    }
  }
  return null;
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

