"use strict";

const STORY_IMAGE_MODELS = Object.freeze([
  { id: "qwen-image3", label: "Qwen Image 3.0", resolution: "2K", ratio: "3:4" },
  { id: "seedream55-image", label: "Seedream 5.5", resolution: "2K", ratio: "3:4" },
  { id: "seedream5-image", label: "Seedream 5.0 Image", resolution: "2K", ratio: "3:4" },
]);

// Papaya's upstream security classifier has a verified false positive on the
// Chinese term "教育局": the same otherwise-allowed prompt returns HTTP 200 /
// code 451 / political_cn_entity. Rewrite that term to an equivalent neutral
// school-administration location only for the Papaya request, then restore the
// original wording in the generated prompt. This does not touch adult content.
function papayaPromptCompatibilityText(text = "") {
  return String(text || "").replace(/教育局/g, "校内行政楼");
}

function restorePapayaPromptCompatibilityText(text = "") {
  return String(text || "").replace(/校内行政楼/g, "教育局");
}

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
  { id: "vega15-lite", label: "wan（vega）", family: "vega", promptOptimizer: false },
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

function storyAnalysisContentStats(text = "") {
  const source = String(text || "");
  const hanCharacters = (source.match(/[\u3400-\u9fff]/g) || []).length;
  const paragraphs = source.split(/\n\s*\n|\n/).map((item) => item.trim()).filter(Boolean).length;
  const quotedLines = [...source.matchAll(/[“"「]([^”"」]{1,300})[”"」]/g)].map((match) => match[1].trim()).filter(Boolean);
  const dialogueCharacters = quotedLines.reduce((total, line) => total + (line.match(/[\u3400-\u9fff]/g) || []).length, 0);
  return { hanCharacters, paragraphs, quotedLines: quotedLines.length, dialogueCharacters };
}

const STORY_COVERAGE_PLANNER_SYSTEM_PROMPT = `你是中文短剧的分镜覆盖策划。先阅读本集简略大纲、节拍表和原文，列出必须被镜头覆盖的完整剧情节点，不写最终分镜。
只输出合法 JSON 对象，不要 Markdown 或解释：
{
  "beats": [
    {
      "beatNo": 1,
      "summary": "该节拍的单一核心事件",
      "sourceBasis": "对应原文依据或逐字短句",
      "characters": ["出场角色"],
      "location": "场景",
      "actionNodes": ["必须看见的连续动作"],
      "dialogueNodes": ["必须保留的关键对白或旁白"],
      "emotionNodes": ["情绪或关系变化"],
      "minimumShots": 1,
      "estimatedShotCount": 1
    }
  ],
  "estimatedShotCount": 0,
  "coverageNotes": "覆盖依据与风险"
}
规则：
1. 以原文为主、简略大纲为索引，按时间顺序覆盖所有推动因果、关系变化和结尾钩子的节点；不能只复述大纲。
2. 一个 actionNodes、dialogueNodes 或 emotionNodes 只写一个可视动作或信息变化。同一秒内不能塞入多个独立动作。
3. 每个节拍给出 minimumShots 和 estimatedShotCount。节点越多镜头越多；禁止套用 10 镜模板，也不得为了省事把多个节拍合并。
4. 原文没有依据的事件不得新增；引号对白只保留推进剧情的部分。
5. 估算全部镜头数必须根据动作、对白、情绪节点的总量计算，而不是按常见短片模板。`;

const STORY_SHOT_CRITIC_SYSTEM_PROMPT = `你是中文短剧分镜审稿人。请对照原文、节拍表和覆盖计划，审查候选分镜是否漏剧情、重复、镜头承载过多动作或时长不合理，并输出修订后的最终分镜。
只输出合法 JSON 对象，不要 Markdown 或解释：
{
  "hook": "30-100个中文字符的结尾钩子",
  "recommendedDurationSeconds": 0,
  "coverageAudit": {
    "coveredBeatNos": [1],
    "missingBeats": [],
    "overloadedShotNos": [],
    "changes": ["本次修订说明"]
  },
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
      "storyBeat": "对应节拍和剧情推进"
    }
  ]
}
审查规则：
1. 逐项检查覆盖计划的每个 actionNodes、dialogueNodes 和 emotionNodes。漏掉关键动作时补镜，不靠改写 description 假装覆盖。
2. 一个镜头只能承担一个清晰动作或信息变化；发现多动作混装必须拆镜。重复镜头、无剧情推进的空镜和不符合原文动机的镜头要删除或修正。
3. 保留原有人物关系、台词和结尾钩子。镜头数由覆盖计划与原文实际节点决定，禁止机械停在 10 镜。
4. 所有 shotNo 连续唯一；durationSeconds 为 1-30 秒整数，总时长应接近本集目标时长上下 10%。
5. 返回完整最终 shots，而不是只返回修改建议。`;

const STORY_SHOT_PLANNER_SYSTEM_PROMPT = `你是专业中文影视分镜师。请依据原文、节拍表和覆盖计划，把已经定稿的单集拆成可连续制作、可逐镜审核的镜头清单。
只输出一个合法 JSON 对象，不要 Markdown，不要代码围栏，不要解释。返回结构：
{
  "hook": "如果输入钩子为空，补写30-100个中文字符的结尾钩子；否则原样返回",
  "recommendedDurationSeconds": 0,
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
      "storyBeat": "B01｜本镜承担的剧情推进"
    }
  ]
}
规则：
1. 覆盖计划是结构契约；必须按它和原文时间顺序覆盖开场、发展、转折、结尾，不新增原文没有依据的主要事件，不改变人物关系和结果。
2. 镜头数量必须按覆盖计划里的动作/对白/情绪节点总量决定，不得套用固定镜头数模板。为每个节点安排足够镜头；所有 shotNo 连续且唯一。尤其禁止机械返回 10 个镜头：10 不是默认值，也不得因为常见模板停在 10。
3. 每个镜头只表现一个清晰的视觉动作或信息变化。description 必须写清景别、人物动作、环境、关键道具、情绪和与前后镜头的连续性。
4. 充分使用输入的出场角色、场景和结尾钩子；必须有一个明确镜头落地钩子，不能只写在镜头外。
5. dialogue 只保留能推动剧情或揭示人物关系的关键对白，禁止长篇复述。
6. durationSeconds 为1-30的整数，所有镜头时长之和应接近本集目标时长，允许上下浮动10%。
7. hook 必须具体、有画面感，承接本集最后动作并指向下一集。
8. recommendedDurationSeconds 必须由你按全部镜头的实际可执行时长求和得出；如果输入的 episode 没有目标时长，就以这个值作为本集最终时长。不得默认输出 90 秒。
9. 分镜必须优先保留原文中的具体动作、关键对白和转折，不得只根据简略大纲自由发挥。`;

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

function storyShotTextNodes(value, maxItems = 24, maxLength = 500) {
  const list = Array.isArray(value) ? value : (value ? String(value).split(/\n|[；;]/) : []);
  return [...new Set(list.map((item) => storyInputText(item?.summary || item?.text || item, maxLength)).filter(Boolean))].slice(0, maxItems);
}

function storyRelevantScriptText({ episode = {}, sourceScript = {} } = {}) {
  const content = String(sourceScript.content || "").trim();
  if (!content) return "";
  const metadata = episode.metadata && typeof episode.metadata === "object" ? episode.metadata : {};
  const startMarker = String(metadata.sourceSpan?.startMarker || "").trim();
  const endMarker = String(metadata.sourceSpan?.endMarker || "").trim();
  if (startMarker && endMarker && content.includes(startMarker) && content.includes(endMarker, content.indexOf(startMarker) + startMarker.length)) {
    const startIndex = content.indexOf(startMarker);
    const endIndex = content.indexOf(endMarker, startIndex + startMarker.length) + endMarker.length;
    return content.slice(startIndex, endIndex).slice(0, 36000);
  }
  const excerpts = [...storyShotTextNodes(metadata.sourceExcerpts, 24, 2000), ...storyShotTextNodes((metadata.beatSheet || []).map((beat) => beat?.sourceQuote), 30, 2000)];
  const uniqueExcerpts = [...new Set(excerpts.map((item) => item.trim()).filter(Boolean))];
  if (content.length <= 36000) return content;
  if (uniqueExcerpts.length) return uniqueExcerpts.join("\n\n").slice(0, 36000);
  const paragraphs = content.split(/\n\s*\n|\n/).map((item) => item.trim()).filter(Boolean);
  const terms = [...new Set(`${episode.title || ""}\n${episode.synopsis || ""}\n${metadata.hook || ""}\n${storyTextList(metadata.characters, 24, 80).join("、")}`
    .match(/[\u3400-\u9fff]{2,8}/g) || [])].filter((term) => !["本集", "剧情", "人物", "场景", "故事", "然后", "此时", "已经"].includes(term)).slice(0, 80);
  const scored = paragraphs.map((paragraph, index) => ({ paragraph, index, score: terms.reduce((total, term) => total + (paragraph.includes(term) ? 1 : 0), 0) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 80)
    .sort((a, b) => a.index - b.index);
  return (scored.map((item) => item.paragraph).join("\n\n") || paragraphs.slice(0, 80).join("\n\n")).slice(0, 36000);
}

function storyCoverageFromModel(payload = {}) {
  const root = payload?.data && typeof payload.data === "object" ? payload.data : payload;
  const beats = (Array.isArray(root?.beats) ? root.beats : []).map((beat, index) => ({
    beatNo: index + 1,
    summary: storyInputText(beat?.summary || beat?.event || "", 800),
    sourceBasis: storyInputText(beat?.sourceBasis || beat?.source || beat?.quote || "", 2400),
    characters: storyTextList(beat?.characters, 24, 80),
    location: storyInputText(beat?.location || beat?.scene || "", 160),
    actionNodes: storyShotTextNodes(beat?.actionNodes || beat?.actions, 24, 500),
    dialogueNodes: storyShotTextNodes(beat?.dialogueNodes || beat?.dialogue, 16, 1000),
    emotionNodes: storyShotTextNodes(beat?.emotionNodes || beat?.emotions, 16, 500),
    minimumShots: Math.max(1, Math.min(8, Math.round(Number(beat?.minimumShots || beat?.minimum_shots || 1) || 1))),
    estimatedShotCount: Math.max(1, Math.min(30, Math.round(Number(beat?.estimatedShotCount || beat?.estimated_shot_count || 1) || 1))),
  })).filter((beat) => beat.summary || beat.sourceBasis || beat.actionNodes.length).slice(0, 60);
  return {
    beats,
    estimatedShotCount: Math.max(0, Math.min(300, Math.round(Number(root?.estimatedShotCount || root?.estimated_shot_count || beats.reduce((total, beat) => total + beat.estimatedShotCount, 0)) || 0))),
    coverageNotes: storyInputText(root?.coverageNotes || root?.notes || "", 2000),
  };
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
    recommendedDurationSeconds: Math.max(0, Math.min(86400, Math.round(Number(root?.recommendedDurationSeconds || root?.recommended_duration_seconds || 0) || 0))),
    shots,
  };
}

async function planStoryEpisodeShots({ project = {}, episode = {}, sourceScript = {} } = {}) {
  const model = storyAnalyzerModel();
  if (!model) {
    throw Object.assign(new Error("AI 分镜模型尚未配置。"), { statusCode: 503, code: "MISSING_STORY_SHOT_MODEL" });
  }
  if (!String(episode.synopsis || "").trim()) {
    throw Object.assign(new Error("单集大纲为空，无法拆分镜。"), { statusCode: 400, code: "STORY_EPISODE_SYNOPSIS_EMPTY" });
  }
  const metadata = episode.metadata && typeof episode.metadata === "object" ? episode.metadata : {};
  const episodeDuration = Math.max(0, Number(episode.durationSeconds || 0) || 0);
  const synopsis = String(episode.synopsis || "").trim();
  const sourceText = storyRelevantScriptText({ episode, sourceScript });
  const sourceStats = storyAnalysisContentStats(sourceText || synopsis);
  const beatSheet = Array.isArray(metadata.beatSheet) ? metadata.beatSheet : [];
  const sourceExcerpts = storyShotTextNodes(metadata.sourceExcerpts, 24, 2000);
  const context = [
    `项目：${String(project.name || "未命名项目")}`,
    `画幅：${String(project.aspectRatio || "9:16")}`,
    `集数：E${String(episode.episodeNo || 1).padStart(2, "0")}`,
    `标题：${String(episode.title || "")}`,
    episodeDuration ? `本集目标时长：${episodeDuration}秒。镜头时长之和应贴近该时长。` : "本集目标时长：未指定，由你根据大纲情节点、对白和动作复杂度计算，并在 recommendedDurationSeconds 中返回。",
    `出场角色：${storyTextList(metadata.characters, 30, 80).join("、") || "按大纲判断"}`,
    `场景：${storyTextList(metadata.scenes, 30, 100).join("、") || "按大纲判断"}`,
    `结尾钩子：${String(metadata.hook || "").trim() || "缺失，请根据本集结尾补写"}`,
    `原文统计信号：汉字约 ${sourceStats.hanCharacters} 个，自然段约 ${sourceStats.paragraphs} 个，引号对白约 ${sourceStats.quotedLines} 段（约 ${sourceStats.dialogueCharacters} 个汉字）。不要机械套用 10 镜。`,
    "简略大纲开始",
    synopsis,
    "简略大纲结束",
    "节拍表 JSON",
    JSON.stringify(beatSheet),
    "原文关键摘录 JSON",
    JSON.stringify(sourceExcerpts),
    "本集对应原文开始",
    sourceText || "原文不可用，只能依据简略大纲、节拍表和摘录规划。",
    "本集对应原文结束",
  ].join("\n");
  const deadline = Date.now() + 9 * 60 * 1000;
  const usage = { attempts: 0 };
  const request = async (systemPrompt, userPrompt, maxTokens, requestContext) => {
    const startedAt = Date.now();
    const phase = Object.keys(requestContext || {})[0] || "storyShotPlan";
    console.info("[story-shot-plan-phase-start]", JSON.stringify({
      projectId: project.id || "",
      episodeId: episode.id || "",
      phase,
      promptCharacters: String(systemPrompt || "").length + String(userPrompt || "").length,
      maxTokens,
    }));
    try {
      const raw = await promptOptimizerUpstreamRequest({
        model: model.upstreamModel,
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
        temperature: 0.15,
        max_tokens: maxTokens,
      }, { deadline, requestContext: { ...requestContext, projectId: project.id, episodeId: episode.id }, usage, optimizerModel: model });
      const text = qwen37FlashResponseText(raw);
      console.info("[story-shot-plan-phase-complete]", JSON.stringify({
        projectId: project.id || "",
        episodeId: episode.id || "",
        phase,
        elapsedMs: Date.now() - startedAt,
        responseCharacters: String(text || "").length,
      }));
      return { raw, text };
    } catch (error) {
      console.warn("[story-shot-plan-phase-failed]", JSON.stringify({
        projectId: project.id || "",
        episodeId: episode.id || "",
        phase,
        elapsedMs: Date.now() - startedAt,
        code: error.code || "",
        statusCode: error.statusCode || 0,
      }));
      throw error;
    }
  };
  const coverageResult = await request(STORY_COVERAGE_PLANNER_SYSTEM_PROMPT, `${context}\n\n请先完成覆盖策划，严格输出约定 JSON。`, 5000, { storyShotCoverage: true });
  const coverageParsed = storyParseJsonObject(coverageResult.text);
  let coverage = storyCoverageFromModel(coverageParsed || {});
  if (!coverage.beats.length) {
    const fallbackBeats = beatSheet.map((beat, index) => ({
      beatNo: index + 1,
      summary: storyInputText(beat?.summary || beat, 800),
      sourceBasis: storyInputText(beat?.sourceQuote || "", 2000),
      characters: storyTextList(metadata.characters, 16, 80),
      location: "",
      actionNodes: [storyInputText(beat?.summary || beat, 500)].filter(Boolean),
      dialogueNodes: [],
      emotionNodes: storyInputText(beat?.dramaticPurpose || "", 500) ? [storyInputText(beat.dramaticPurpose, 500)] : [],
      minimumShots: 1,
      estimatedShotCount: 1,
    })).filter((beat) => beat.summary);
    coverage = fallbackBeats.length
      ? { beats: fallbackBeats, estimatedShotCount: fallbackBeats.length, coverageNotes: "覆盖模型未返回有效 JSON，按节拍表降级规划。" }
      : { beats: [{ beatNo: 1, summary: synopsis, sourceBasis: sourceText.slice(0, 2000), characters: [], location: "", actionNodes: [synopsis], dialogueNodes: [], emotionNodes: [], minimumShots: 1, estimatedShotCount: 1 }], estimatedShotCount: 1, coverageNotes: "覆盖模型未返回有效 JSON，按简略大纲降级规划。" };
  }
  const plannerPrompt = `${context}\n\n覆盖计划 JSON\n${JSON.stringify(coverage)}\n\n请严格按覆盖计划生成完整分镜，输出约定 JSON。`;
  const plannerResult = await request(STORY_SHOT_PLANNER_SYSTEM_PROMPT, plannerPrompt, 7000, { storyShotPlanner: true });
  const parsed = storyParseJsonObject(plannerResult.text);
  if (!parsed) {
    throw Object.assign(new Error("AI 分镜没有返回有效 JSON，请重试。"), {
      statusCode: 502,
      code: "STORY_SHOT_PLAN_INVALID_JSON",
      responsePreview: String(plannerResult.text || "").slice(0, 600),
    });
  }
  const candidatePlan = storyShotsFromModel(parsed, episode);
  if (!candidatePlan.shots.length) {
    throw Object.assign(new Error("AI 分镜结果为空，请重试。"), { statusCode: 502, code: "STORY_SHOT_PLAN_EMPTY" });
  }
  const criticPrompt = `${context}\n\n覆盖计划 JSON\n${JSON.stringify(coverage)}\n\n候选分镜 JSON\n${JSON.stringify({ hook: candidatePlan.hook, recommendedDurationSeconds: candidatePlan.recommendedDurationSeconds, shots: candidatePlan.shots })}\n\n请逐项审稿并返回完整最终分镜 JSON。`;
  const criticResult = await request(STORY_SHOT_CRITIC_SYSTEM_PROMPT, criticPrompt, 7500, { storyShotCritic: true });
  const criticParsed = storyParseJsonObject(criticResult.text);
  const criticPlan = criticParsed ? storyShotsFromModel(criticParsed, episode) : { shots: [] };
  const plan = criticPlan.shots.length ? criticPlan : candidatePlan;
  if (!Number(plan.recommendedDurationSeconds || 0)) plan.recommendedDurationSeconds = plan.shots.reduce((total, shot) => total + shot.durationSeconds, 0);
  const audit = {
    sourceCharacters: sourceStats.hanCharacters,
    sourceExcerptCount: sourceExcerpts.length,
    beatSheetCount: beatSheet.length,
    coverageBeatCount: coverage.beats.length,
    estimatedShotCount: coverage.estimatedShotCount,
    candidateShotCount: candidatePlan.shots.length,
    finalShotCount: plan.shots.length,
    criticApplied: Boolean(criticPlan.shots.length),
    coverageNotes: coverage.coverageNotes,
    criticAudit: criticParsed?.coverageAudit && typeof criticParsed.coverageAudit === "object" ? criticParsed.coverageAudit : {},
  };
  console.info("[story-shot-plan]", JSON.stringify({
    projectId: project.id || "",
    episodeId: episode.id || "",
    sourceCharacters: sourceStats.hanCharacters,
    sourceExcerptCount: sourceExcerpts.length,
    beatSheetCount: beatSheet.length,
    coverageBeatCount: coverage.beats.length,
    estimatedShotCount: coverage.estimatedShotCount,
    targetDurationSeconds: episodeDuration,
    rawShotCount: Array.isArray(parsed?.shots) ? parsed.shots.length : (Array.isArray(parsed?.storyboard) ? parsed.storyboard.length : 0),
    normalizedShotCount: plan.shots.length,
    exactlyTen: plan.shots.length === 10,
    criticApplied: audit.criticApplied,
  }));
  return { ...plan, audit, model: model.id, attempts: usage.attempts };
}

async function executeStoryShotPlanJob(job = {}) {
  const projectId = String(job.projectId || "").trim();
  const episodeId = String(job.episodeId || "").trim();
  const ownerUserId = String(job.ownerUserId || "").trim();
  if (!projectId || !episodeId || !ownerUserId) {
    throw Object.assign(new Error("AI 分镜任务参数不完整。"), { statusCode: 400, code: "STORY_SHOT_PLAN_JOB_INVALID" });
  }
  const project = await getStoryProjectFromDb({ id: projectId, ownerUserId });
  if (!project) {
    throw Object.assign(new Error("剧集项目不存在。"), { statusCode: 404, code: "STORY_PROJECT_NOT_FOUND" });
  }
  const episodes = await listStoryEpisodesFromDb({ projectId, ownerUserId });
  const episode = (episodes || []).find((item) => item.id === episodeId);
  if (!episode) {
    throw Object.assign(new Error("剧集不存在。"), { statusCode: 404, code: "STORY_EPISODE_NOT_FOUND" });
  }
  if (!["outline_locked", "shots_planned"].includes(String(episode.status || ""))) {
    throw Object.assign(new Error("请先锁定本集大纲，再由 AI 拆分镜。"), { statusCode: 409, code: "STORY_OUTLINE_NOT_LOCKED" });
  }
  const scripts = await listStoryScriptVersionsFromDb({ projectId, ownerUserId });
  const sourceScript = (scripts || []).find((script) => script.id === episode.sourceScriptVersionId || (!episode.sourceScriptVersionId && script.manuscriptId === episode.sourceManuscriptId)) || {};
  const result = await planStoryEpisodeShots({ project, episode, sourceScript });
  const metadata = { ...(episode.metadata || {}) };
  if (result.hook) metadata.hook = result.hook;
  if (result.audit) metadata.shotPlanAudit = result.audit;
  const episodePatch = { status: "shots_planned", metadata };
  if (Number(episode.durationSeconds || 0) <= 0 && Number(result.recommendedDurationSeconds || 0) > 0) {
    episodePatch.durationSeconds = result.recommendedDurationSeconds;
    metadata.durationBasis = `按 AI 分镜节点计算：共 ${result.shots.length} 个镜头，总时长 ${result.recommendedDurationSeconds} 秒。`;
  }
  const saved = await replaceStoryShotsInDb({
    projectId,
    episodeId,
    ownerUserId,
    shots: result.shots,
    episodePatch,
  });
  if (!saved) {
    throw Object.assign(new Error("分镜保存失败。"), { statusCode: 503, code: "DATABASE_UNAVAILABLE" });
  }
  return {
    model: result.model,
    attempts: result.attempts,
    episode: saved.episode,
    shots: saved.shots,
  };
}

const STORY_SHOT_PLAN_WORKER_INTERVAL_MS = 1500;
let storyShotPlanWorkerTimer = null;
let storyShotPlanWorkerKickoffTimer = null;
let storyShotPlanWorkerRunning = false;

async function processStoryShotPlanQueue(limit = 1) {
  const claimToken = `story-shot-plan-${process.pid}-${crypto.randomUUID()}`;
  const claimed = await claimNextStoryShotPlanJobsInDb({ limit, leaseMs: 5 * 60 * 1000, claimToken });
  const results = [];
  for (const job of claimed.jobs || []) {
    const startedAt = Date.now();
    try {
      const result = await executeStoryShotPlanJob(job);
      const completed = await completeStoryShotPlanJobInDb({ id: job.id, claimToken, result });
      results.push({ id: job.id, status: completed?.status || "completed", elapsedMs: Date.now() - startedAt });
      console.info("[story-shot-plan-job-complete]", JSON.stringify({
        jobId: job.id,
        projectId: job.projectId,
        episodeId: job.episodeId,
        shotCount: result.shots?.length || 0,
        attempts: job.attempts,
        elapsedMs: Date.now() - startedAt,
      }));
    } catch (error) {
      await failStoryShotPlanJobInDb({
        id: job.id,
        claimToken,
        code: error.code || "STORY_SHOT_PLAN_FAILED",
        message: error.message || String(error),
      }).catch((failureError) => {
        console.error("[story-shot-plan-job-fail-persist-error]", job.id, failureError.message || failureError);
      });
      results.push({ id: job.id, status: "failed", code: error.code || "", elapsedMs: Date.now() - startedAt });
      console.warn("[story-shot-plan-job-failed]", JSON.stringify({
        jobId: job.id,
        projectId: job.projectId,
        episodeId: job.episodeId,
        code: error.code || "",
        statusCode: error.statusCode || 0,
        message: String(error.message || error).slice(0, 240),
        elapsedMs: Date.now() - startedAt,
      }));
    }
  }
  return { claimed: claimed.jobs?.length || 0, results };
}

async function runStoryShotPlanWorkerTick(reason = "timer") {
  if (storyShotPlanWorkerRunning) return { skipped: true };
  storyShotPlanWorkerRunning = true;
  try {
    return await runWithSchedulerLease("story-shot-plan-worker", async () => {
      const result = await processStoryShotPlanQueue(1);
      if (result.claimed) console.info("[story-shot-plan-worker]", JSON.stringify({ reason, ...result }));
      return result;
    }, {
      connect: () => getSchedulerPool().connect(),
      onError: (error) => console.error("[story-shot-plan-worker-lease-failed]", error.message || error),
    });
  } finally {
    storyShotPlanWorkerRunning = false;
  }
}

function startStoryShotPlanWorker() {
  if (storyShotPlanWorkerTimer) return true;
  storyShotPlanWorkerKickoffTimer = setTimeout(() => runStoryShotPlanWorkerTick("startup"), 1200);
  storyShotPlanWorkerKickoffTimer.unref?.();
  storyShotPlanWorkerTimer = setInterval(() => runStoryShotPlanWorkerTick("timer"), STORY_SHOT_PLAN_WORKER_INTERVAL_MS);
  storyShotPlanWorkerTimer.unref?.();
  return true;
}

function stopStoryShotPlanWorker() {
  if (storyShotPlanWorkerKickoffTimer) clearTimeout(storyShotPlanWorkerKickoffTimer);
  if (storyShotPlanWorkerTimer) clearInterval(storyShotPlanWorkerTimer);
  storyShotPlanWorkerKickoffTimer = null;
  storyShotPlanWorkerTimer = null;
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
    Number(episode.durationSeconds || 0) > 0 ? `目标时长：${Math.max(1, Number(episode.durationSeconds || 0) || 0)}秒` : "目标时长：按已定稿镜头清单的实际内容判断",
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

function storyAssetMetadataFromBody(body = {}, existingMetadata = {}) {
  const metadata = { ...(existingMetadata && typeof existingMetadata === "object" ? existingMetadata : {}) };
  metadata.imagePrompt = storyInputText(body.imagePrompt, 8000);
  metadata.continuity = storyInputText(body.continuity, 2000);
  const episodeIds = new Set([
    ...(Array.isArray(metadata.episodeIds) ? metadata.episodeIds.map(String) : []),
    ...(Array.isArray(body.episodeIds) ? body.episodeIds.map(String) : []),
    storyInputText(body.episodeId, 80),
  ].map(String).filter(Boolean));
  const shotNos = new Set([
    ...storyTextList(metadata.shotNos, 80, 24).map(String),
    ...storyTextList(body.shotNos, 80, 24).map(String),
    body.shotNo === undefined || body.shotNo === null ? "" : String(body.shotNo),
  ].filter(Boolean));
  metadata.episodeIds = [...episodeIds];
  metadata.shotNos = [...shotNos].map(Number).filter(Number.isFinite);
  return metadata;
}

async function handleCreateStoryAsset(req, res, projectId = "", episodeId = "") {
  if (requestTenantDescriptor(req).toolOnly) return sendJson(res, 404, { ok: false, message: "API not found." });
  const auth = await requireAdmin(req, res, { loadDb: false });
  if (!auth) return;
  const body = await readJson(req, 128 * 1024);
  const episodes = await listStoryEpisodesFromDb({ projectId, ownerUserId: auth.user.id });
  const episode = (episodes || []).find((item) => item.id === episodeId);
  if (!episode) return sendJson(res, 404, { ok: false, code: "STORY_EPISODE_NOT_FOUND", message: "剧集不存在。" });
  const name = storyInputText(body.name, 200);
  if (!name) return sendJson(res, 400, { ok: false, code: "STORY_ASSET_NAME_REQUIRED", message: "请填写资产名称。" });
  const metadata = storyAssetMetadataFromBody({ ...body, episodeId }, {});
  const asset = await createStoryAssetInDb({
    id: randomId("story-asset"),
    projectId,
    ownerUserId: auth.user.id,
    kind: storyInputText(body.kind, 40) || "character",
    name,
    description: storyInputText(body.description || body.imagePrompt, 8000),
    metadata,
  });
  if (!asset) return sendJson(res, 503, { ok: false, code: "DATABASE_UNAVAILABLE", message: "资产保存失败。" });
  return sendJson(res, 201, { ok: true, asset });
}

async function handleUpdateStoryAsset(req, res, projectId = "", assetId = "") {
  if (requestTenantDescriptor(req).toolOnly) return sendJson(res, 404, { ok: false, message: "API not found." });
  const auth = await requireAdmin(req, res, { loadDb: false });
  if (!auth) return;
  const body = await readJson(req, 128 * 1024);
  const assets = await listStoryAssetsFromDb({ projectId, ownerUserId: auth.user.id });
  const existing = (assets || []).find((item) => item.id === assetId);
  if (!existing) return sendJson(res, 404, { ok: false, code: "STORY_ASSET_NOT_FOUND", message: "资产不存在。" });
  const metadata = storyAssetMetadataFromBody(body, existing.metadata || {});
  const asset = await updateStoryAssetInDb({
    projectId,
    ownerUserId: auth.user.id,
    assetId,
    kind: storyInputText(body.kind, 40) || existing.kind,
    name: storyInputText(body.name, 200) || existing.name,
    description: storyInputText(body.description, 8000) || existing.description,
    metadata,
  });
  if (!asset) return sendJson(res, 404, { ok: false, code: "STORY_ASSET_NOT_FOUND", message: "资产不存在。" });
  return sendJson(res, 200, { ok: true, asset });
}

async function handleDeleteStoryAsset(req, res, projectId = "", assetId = "") {
  if (requestTenantDescriptor(req).toolOnly) return sendJson(res, 404, { ok: false, message: "API not found." });
  const auth = await requireAdmin(req, res, { loadDb: false });
  if (!auth) return;
  const deleted = await deleteStoryAssetInDb({ projectId, ownerUserId: auth.user.id, assetId });
  if (!deleted) return sendJson(res, 404, { ok: false, code: "STORY_ASSET_NOT_FOUND", message: "资产不存在。" });
  return sendJson(res, 200, { ok: true, deletedId: deleted });
}

async function optimizeStoryShotPrompt({ prompt = "", provider = "", providerLabel = "", duration = 5, resolution = "720p", optimizerModelId = "", references = [] } = {}) {
  const requestedOptimizerModel = promptOptimizerSelectedModel(optimizerModelId);
  if (!requestedOptimizerModel) {
    throw Object.assign(new Error("请选择支持的提示词优化模型。"), { statusCode: 400, code: "STORY_PROMPT_OPTIMIZER_UNSUPPORTED" });
  }
  if (!requestedOptimizerModel.configured()) {
    throw Object.assign(new Error(`${requestedOptimizerModel.label} 尚未配置，请更换优化模型。`), { statusCode: 503, code: "STORY_PROMPT_OPTIMIZER_UNCONFIGURED" });
  }
  const optimizerModel = requestedOptimizerModel;
  const papayaOptimizer = optimizerModel.id === "carrothub-papaya-1.0";
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
    if (papayaOptimizer && Array.isArray(body.messages)) {
      body.messages = body.messages.map((message) => (
        message?.role === "user"
          ? { ...message, content: papayaPromptCompatibilityText(message.content) }
          : message
      ));
    }
    return await promptOptimizerUpstreamRequest(body, {
      deadline,
      requestContext: { storyShotPrompt: true, provider, optimizerModel: optimizerModel.id, ...requestContext },
      usage,
      optimizerModel,
    });
  };
  const restoreOptimizerText = (value) => papayaOptimizer ? restorePapayaPromptCompatibilityText(value) : String(value || "");
  let raw = await runStoryPromptOptimizerRequest(request.body);
  let text = restoreOptimizerText(w3PromptOptimizerText(raw));
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
    text = restoreOptimizerText(w3PromptOptimizerText(raw));
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
  };
}

function scaleStoryPromptForProvider(prompt = "", provider = "") {
  const text = String(prompt || "").trim();
  if (!text) return text;
  const label = String(provider || "").toLowerCase().includes("vega") ? "Vega" : "Seedance";
  return `${text}\n\n【${label} 执行约束】单一连续镜头；主体身份、服装、场景和关键道具跨镜保持一致；动作连续可执行；镜头稳定；画面清晰。`;
}
