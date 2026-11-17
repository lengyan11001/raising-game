"use strict";

const STORY_IMAGE_MODELS = Object.freeze([
  { id: "qwen-image3", label: "Qwen Image 3.0", resolution: "2K", ratio: "3:4" },
  { id: "seedream55-image", label: "Seedream 5.5", resolution: "2K", ratio: "3:4" },
  { id: "seedream5-image", label: "Seedream 5.0 Image", resolution: "2K", ratio: "3:4" },
]);

const STORY_VIDEO_MODELS = Object.freeze([
  { id: "seedance-nsfw", label: "Seedance 2.5", family: "seedance", promptOptimizer: true },
  { id: "wan30", label: "W3.0", family: "wan", promptOptimizer: true },
  { id: "wan30-prime", label: "W3.0 Prime", family: "wan", promptOptimizer: true },
  { id: "wan27", label: "Wan 2.7", family: "wan", promptOptimizer: true },
  { id: "seedance", label: "Seedance 2.0", family: "seedance", promptOptimizer: true },
  { id: "seedance-fast", label: "Seedance 2.0 Fast", family: "seedance", promptOptimizer: true },
  { id: "seedance25-flash", label: "Seedance 2.5 Flash", family: "seedance", promptOptimizer: true },
  { id: "seedance20-vega", label: "Vega 1.0 Pro", family: "seedance", promptOptimizer: true },
  { id: "seedance25-vega", label: "Vega 1.5 Pro", family: "seedance", promptOptimizer: true },
  { id: "h3-vega", label: "Vega 1.5 Lite", family: "vega", promptOptimizer: false },
  { id: "vega10-lite", label: "Vega 1.0 Lite", family: "vega", promptOptimizer: false },
]);

function storyProductionModels() {
  return {
    image: STORY_IMAGE_MODELS,
    video: STORY_VIDEO_MODELS,
    optimizer: ["carrothub-papaya-1.0", "qwen3.7-flash", "byteplus-language"].map((id) => {
      const model = promptOptimizerSelectedModel(id);
      return model ? { id: model.id, label: model.label, configured: model.configured() } : null;
    }).filter(Boolean),
  };
}

const STORY_ASSET_PLANNER_SYSTEM_PROMPT = `你是专业中文影视美术指导、角色设计和道具连续性负责人。请根据已定稿的单集大纲与镜头清单，提取这一集实际制作所需的资产设计需求。
只输出合法 JSON 对象，不要 Markdown，不要代码围栏，不要解释。返回结构：
{
  "assets": [
    {
      "kind": "character|scene|prop",
      "name": "稳定、简短、可复用的资产名",
      "description": "可直接交给美术/生成模型的外观与连续性说明",
      "imagePrompt": "用于生成资产设计图的完整中文提示词，包含主体、外观、材质、光线、构图、背景、画幅，不写剧情动作",
      "continuity": "跨镜头必须保持一致的识别特征",
      "shotNos": [1, 2]
    }
  ]
}
规则：
1. 只提取本集镜头实际出现或直接依赖的角色、场景、关键道具，不要凭空扩展世界观。
2. 角色必须写清年龄感、脸型、发型、体型、服装、妆造和状态；同名角色必须合并为一个资产。
3. 场景必须写清地点、时间、空间结构、光线、色调、关键陈设和可拍摄区域。
4. 关键道具必须写清材质、颜色、尺寸、磨损或状态；普通环境背景物不要拆成道具。
5. imagePrompt 必须适合单独出资产设计图，保持中性站姿或空场景，不包含连续剧情、复杂动作、台词和分镜编号。
6. shotNos 必须对应当前输入的镜头编号。最多返回 80 个资产。`;

function storyAssetsFromModel(payload = {}) {
  const root = payload?.data && typeof payload.data === "object" ? payload.data : payload;
  const items = Array.isArray(root?.assets) ? root.assets : (Array.isArray(root?.items) ? root.items : []);
  return items.map((item) => {
    const kind = ["character", "scene", "prop", "style", "audio"].includes(String(item?.kind || "").trim())
      ? String(item.kind).trim()
      : "character";
    return {
      kind,
      name: storyInputText(item?.name || item?.title || "", 200),
      description: storyInputText(item?.description || item?.visual || "", 8000),
      metadata: {
        imagePrompt: storyInputText(item?.imagePrompt || item?.image_prompt || item?.description || "", 8000),
        continuity: storyInputText(item?.continuity || "", 2000),
        shotNos: storyTextList(item?.shotNos || item?.shots, 80, 24),
      },
    };
  }).filter((item) => item.name && item.description);
}

function storyShotsFromModel(payload = {}, episode = {}) {
  const root = payload?.data && typeof payload.data === "object" ? payload.data : payload;
  const rawShots = Array.isArray(root?.shots) ? root.shots : (Array.isArray(root?.storyboard) ? root.storyboard : []);
  const shots = rawShots.map((shot, index) => ({
    shotNo: index + 1,
    title: storyInputText(shot?.title || shot?.name || `镜头 ${index + 1}`, 160),
    description: storyInputText(shot?.description || shot?.visual || shot?.action || "", 4000),
    durationSeconds: Math.max(1, Math.min(30, Math.round(Number(shot?.durationSeconds || shot?.duration_seconds || 5) || 5))),
    status: "planned",
    metadata: {
      shotSize: storyInputText(shot?.shotSize || shot?.shot_size || "", 80),
      camera: storyInputText(shot?.camera || shot?.cameraMovement || "", 120),
      location: storyInputText(shot?.location || shot?.scene || "", 160),
      characters: storyTextList(shot?.characters, 24, 80),
      dialogue: storyInputText(shot?.dialogue || shot?.lines || "", 1200),
      storyBeat: storyInputText(shot?.storyBeat || shot?.story_beat || "", 500),
    },
  })).filter((shot) => shot.title || shot.description).slice(0, 80);
  return {
    hook: storyInputText(root?.hook || episode?.metadata?.hook || "", 500),
    shots,
  };
}

async function planStoryEpisodeShots({ project = {}, episode = {} } = {}) {
  const model = storyAnalyzerModel();
  if (!model) {
    throw Object.assign(new Error("AI 分镜模型尚未配置。"), { statusCode: 503, code: "MISSING_STORY_SHOT_MODEL" });
  }
  if (!String(episode.synopsis || "").trim()) {
    throw Object.assign(new Error("单集大纲为空，无法拆分镜。"), { statusCode: 400, code: "STORY_EPISODE_SYNOPSIS_EMPTY" });
  }
  const metadata = episode.metadata && typeof episode.metadata === "object" ? episode.metadata : {};
  const userPrompt = [
    `项目：${String(project.name || "未命名项目")}`,
    `画幅：${String(project.aspectRatio || "9:16")}`,
    `集数：E${String(episode.episodeNo || 1).padStart(2, "0")}`,
    `标题：${String(episode.title || "")}`,
    `目标时长：${Math.max(1, Number(episode.durationSeconds || 90) || 90)}秒`,
    `出场角色：${storyTextList(metadata.characters, 30, 80).join("、") || "按大纲判断"}`,
    `场景：${storyTextList(metadata.scenes, 30, 100).join("、") || "按大纲判断"}`,
    `结尾钩子：${String(metadata.hook || "").trim() || "缺失，请根据本集结尾补写"}`,
    "单集大纲开始",
    String(episode.synopsis || "").trim(),
    "单集大纲结束",
    "请严格输出约定 JSON。",
  ].join("\n");
  const deadline = Date.now() + PROMPT_OPTIMIZER_TOTAL_BUDGET_MS;
  const usage = { attempts: 0 };
  const raw = await promptOptimizerUpstreamRequest({
    model: model.upstreamModel,
    messages: [
      { role: "system", content: STORY_SHOT_PLANNER_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.2,
    max_tokens: 6500,
  }, {
    deadline,
    requestContext: { storyShotPlanner: true, projectId: project.id, episodeId: episode.id },
    usage,
    optimizerModel: model,
  });
  const text = qwen37FlashResponseText(raw);
  const parsed = storyParseJsonObject(text);
  if (!parsed) {
    throw Object.assign(new Error("AI 分镜没有返回有效 JSON，请重试。"), {
      statusCode: 502,
      code: "STORY_SHOT_PLAN_INVALID_JSON",
      responsePreview: String(text || "").slice(0, 600),
    });
  }
  const plan = storyShotsFromModel(parsed, episode);
  if (!plan.shots.length) {
    throw Object.assign(new Error("AI 分镜结果为空，请重试。"), { statusCode: 502, code: "STORY_SHOT_PLAN_EMPTY" });
  }
  return { ...plan, model: model.id, attempts: usage.attempts };
}

async function planStoryEpisodeAssets({ project = {}, episode = {}, shots = [] } = {}) {
  const model = storyAnalyzerModel();
  if (!model) {
    throw Object.assign(new Error("AI 资产设计模型尚未配置。"), { statusCode: 503, code: "MISSING_STORY_ASSET_MODEL" });
  }
  if (!Array.isArray(shots) || !shots.length) {
    throw Object.assign(new Error("请先生成并审核本集分镜。"), { statusCode: 400, code: "STORY_ASSETS_REQUIRE_SHOTS" });
  }
  const metadata = episode.metadata && typeof episode.metadata === "object" ? episode.metadata : {};
  const shotContext = shots.map((shot) => ({
    shotNo: shot.shotNo,
    title: shot.title,
    description: shot.description,
    location: shot.metadata?.location || "",
    characters: shot.metadata?.characters || [],
    dialogue: shot.metadata?.dialogue || "",
    storyBeat: shot.metadata?.storyBeat || "",
  }));
  const userPrompt = [
    `项目：${String(project.name || "未命名项目")}`,
    `画幅：${String(project.aspectRatio || "9:16")}`,
    `集数：E${String(episode.episodeNo || 1).padStart(2, "0")}`,
    `标题：${String(episode.title || "")}`,
    `目标时长：${Math.max(1, Number(episode.durationSeconds || 90) || 90)}秒`,
    `已有角色名：${storyTextList(metadata.characters, 30, 80).join("、") || "按分镜判断"}`,
    `已有场景名：${storyTextList(metadata.scenes, 30, 100).join("、") || "按分镜判断"}`,
    `结尾钩子：${String(metadata.hook || "")}`,
    "单集大纲开始",
    String(episode.synopsis || "").trim(),
    "单集大纲结束",
    "镜头清单 JSON",
    JSON.stringify(shotContext),
    "请严格输出约定 JSON。",
  ].join("\n");
  const deadline = Date.now() + PROMPT_OPTIMIZER_TOTAL_BUDGET_MS;
  const usage = { attempts: 0 };
  const raw = await promptOptimizerUpstreamRequest({
    model: model.upstreamModel,
    messages: [
      { role: "system", content: STORY_ASSET_PLANNER_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.2,
    max_tokens: 6500,
  }, {
    deadline,
    requestContext: { storyAssetPlanner: true, projectId: project.id, episodeId: episode.id },
    usage,
    optimizerModel: model,
  });
  const text = qwen37FlashResponseText(raw);
  const parsed = storyParseJsonObject(text);
  if (!parsed) {
    throw Object.assign(new Error("AI 资产规划没有返回有效 JSON，请重试。"), {
      statusCode: 502,
      code: "STORY_ASSET_PLAN_INVALID_JSON",
      responsePreview: String(text || "").slice(0, 600),
    });
  }
  const assets = storyAssetsFromModel(parsed);
  if (!assets.length) {
    throw Object.assign(new Error("AI 资产规划结果为空，请重试。"), { statusCode: 502, code: "STORY_ASSET_PLAN_EMPTY" });
  }
  return { assets, model: model.id, attempts: usage.attempts };
}

async function optimizeStoryShotPrompt({ prompt = "", provider = "", providerLabel = "", duration = 5, resolution = "720p", optimizerModelId = "", references = [] } = {}) {
  const requestedOptimizerModel = promptOptimizerSelectedModel(optimizerModelId);
  if (!requestedOptimizerModel) {
    throw Object.assign(new Error("请选择支持的提示词优化模型。"), { statusCode: 400, code: "STORY_PROMPT_OPTIMIZER_UNSUPPORTED" });
  }
  if (!requestedOptimizerModel.configured()) {
    throw Object.assign(new Error(`${requestedOptimizerModel.label} 尚未配置，请更换优化模型。`), { statusCode: 503, code: "STORY_PROMPT_OPTIMIZER_UNCONFIGURED" });
  }
  let optimizerModel = requestedOptimizerModel;
  let fallbackReason = "";
  const seedanceRequest = seedancePromptOptimizerIsProvider(provider);
  const request = promptOptimizerRequestForPayload({
    prompt,
    provider,
    providerLabel,
    duration,
    resolution,
    language: "zh",
    references,
  });
  if (!request.originalPrompt) {
    throw Object.assign(new Error("镜头提示词为空。"), { statusCode: 400, code: "STORY_SHOT_PROMPT_EMPTY" });
  }
  const deadline = Date.now() + PROMPT_OPTIMIZER_TOTAL_BUDGET_MS;
  const usage = { attempts: 0 };
  const runStoryPromptOptimizerRequest = async (body, requestContext = {}) => {
    body.model = optimizerModel.upstreamModel;
    try {
      return await promptOptimizerUpstreamRequest(body, {
        deadline,
        requestContext: { storyShotPrompt: true, provider, optimizerModel: optimizerModel.id, ...requestContext },
        usage,
        optimizerModel,
      });
    } catch (error) {
      const papayaBlocked = optimizerModel.id === "carrothub-papaya-1.0"
        && String(error.upstreamCode || error.cause?.code || error.code || "") === "PAPAYA_CONTENT_BLOCKED";
      const fallbackModel = PROMPT_OPTIMIZER_MODELS["qwen3.7-flash"];
      if (!papayaBlocked || !fallbackModel?.configured()) throw error;
      fallbackReason = "papaya_content_blocked";
      optimizerModel = fallbackModel;
      body.model = optimizerModel.upstreamModel;
      console.warn("[story-prompt-optimizer-fallback]", JSON.stringify({
        from: requestedOptimizerModel.id,
        to: optimizerModel.id,
        reason: fallbackReason,
        provider,
      }));
      return await promptOptimizerUpstreamRequest(body, {
        deadline,
        requestContext: { storyShotPrompt: true, provider, optimizerModel: optimizerModel.id, fallbackFrom: requestedOptimizerModel.id, ...requestContext },
        usage,
        optimizerModel,
      });
    }
  };
  let raw = await runStoryPromptOptimizerRequest(request.body);
  let text = w3PromptOptimizerText(raw);
  let parsed = w3ParseOptimizerJson(text);
  let optimizedPrompt = parsed?.optimizedPrompt || w3OptimizerReadablePrompt(text);
  if (request.language === "zh" && !w3PromptIsMostlyChinese(optimizedPrompt)) {
    const correction = promptOptimizerRequestForPayload({
      prompt,
      provider,
      providerLabel,
      duration,
      resolution,
      language: "zh",
      references,
    }, { languageCorrection: true });
    raw = await runStoryPromptOptimizerRequest(correction.body, { languageCorrection: true });
    text = w3PromptOptimizerText(raw);
    parsed = w3ParseOptimizerJson(text);
    optimizedPrompt = parsed?.optimizedPrompt || w3OptimizerReadablePrompt(text);
  }
  if (!optimizedPrompt) {
    throw Object.assign(new Error("提示词优化结果为空。"), { statusCode: 502, code: "STORY_SHOT_PROMPT_OPTIMIZER_EMPTY" });
  }
  if (seedanceRequest) {
    optimizedPrompt = seedancePromptOptimizerRepairContent(optimizedPrompt, request.duration, request.originalPrompt);
  }
  optimizedPrompt = seedanceRequest
    ? w3NormalizeOptimizerPromptFormatting(scaleStoryPromptForProvider(optimizedPrompt, provider)).slice(0, W3_PROMPT_MAX_CHARS).trim()
    : w3TruncatePrompt(w3NormalizeConstraintStack(w3NormalizeWanPromptFormatting(optimizedPrompt)));
  return {
    optimizedPrompt,
    model: optimizerModel.id,
    mode: seedanceRequest ? "seedance" : "w3",
    referencePlan: parsed?.referencePlan || [],
    attempts: usage.attempts,
    fallbackFrom: fallbackReason ? requestedOptimizerModel.id : "",
    fallbackReason,
  };
}

function scaleStoryPromptForProvider(prompt = "", provider = "") {
  const text = String(prompt || "").trim();
  if (!text) return text;
  const label = String(provider || "").toLowerCase().includes("vega") ? "Vega" : "Seedance";
  return `${text}\n\n【${label} 执行约束】单一连续镜头；主体身份、服装、场景和关键道具跨镜保持一致；动作连续可执行；镜头稳定；画面清晰。`;
}
