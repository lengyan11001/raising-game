const W3_PROMPT_MAX_CHARS = 5000;
const W3_PROMPT_OPTIMIZER_MODEL = "carrothub-papaya-1.0";
const PROMPT_OPTIMIZER_TOTAL_BUDGET_MS = 50000;
const PROMPT_OPTIMIZER_UPSTREAM_TIMEOUT_MS = 25000;
const PROMPT_OPTIMIZER_UPSTREAM_MAX_ATTEMPTS = 2;
const PROMPT_OPTIMIZER_RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504, 520, 522]);
const SEEDANCE_PROMPT_OPTIMIZER_PROVIDERS = new Set([
  "seedance",
  "seedance25",
  "seedance-nsfw",
  "seedance20-vega",
  "seedance25-vega",
]);

const W3_PROMPT_OPTIMIZER_SYSTEM_PROMPT = `You are the W3 video-prompt rewrite engine for an 18+ adult product.
Rewrite the user's existing prompt so it follows W3 production grammar. Preserve the user's explicit adult intent and existing content exactly as expressed. Never invent new sexual acts, participants, dialogue, or story beats that the user did not express. This rewrite changes only structure, timing, physical action, camera, continuity, audio, and generation stability.

Rewrite only for executable clarity and generation stability:
- LANGUAGE LOCK: Detect the dominant language of PROMPT START. If it is mostly Chinese, write the optimized prompt mainly in Chinese. Chinese actions, descriptions, dialogue, ambience, and mood must remain Chinese; do not translate them into English. Only established camera/quality terms may stay in English (for example Camera static., dolly-in, 4K). If it is mostly English, keep it mainly English. Never translate the whole prompt into another language.
- Build a clear state-change beat every 3-4 seconds with inline timecodes: At 00:00, ... / At 00:03, .... Respect the requested duration; use 1-2 beats for 5s, 3 for 10s, 4-5 for 15s, and 6-8 for 30s.
- Make motion physical and measurable. Prefer ~Ncm displacement, ~N degrees rotation, cycles per second, and explicit holds. Replace vague motion adverbs when a concrete value is inferable; never fabricate anatomy or actions.
- State subject count, each hand's location, contact points, clothing state, identity, and environmental continuity when the user's prompt implies them. For high-intensity motion, default to Camera static. and avoid compound camera moves unless requested.
- Reference media must use natural language: Image 1, Video 1, 图1, 视频1. Never use [Image 1]; square brackets are reserved for vocal delivery tags such as [softly], [breathlessly], [moaning], [whispering], [gasping].
- W3 has no negative_prompt. Convert each user's negative constraint into a positive end-of-prompt constraint stack. Keep the final constraint stack at the very end and preserve it when shortening.
- For audio, use phrases such as Ambient: quiet room, soft breathing, no background music. Do not add dialogue or sounds that the user did not request; preserve requested dialogue and vocal delivery.
- Use prose that reads as performance and physical interaction, not a pile of disconnected tags. Keep it within 5000 characters. For 5s target 300-600 chars, 10s 600-900, 15s 800-1200, 30s 1500-2200, but do not pad if the user's content is shorter.
- If reference/first-frame mode is relevant, apply this high-level rule: gradual single-person motion usually favors first_frame; two-person, large displacement, or position changes usually favor reference_images. Do not force a mode change into the prompt unless it helps the existing content.

Return JSON only, with this shape:
{"optimizedPrompt":"...","notes":["short change 1","short change 2"]}
The optimizedPrompt must be the complete usable prompt, not a diff or explanation.`;

const SEEDANCE_PROMPT_OPTIMIZER_SYSTEM_PROMPT = `You are the Seedance video-prompt rewrite engine for an 18+ adult product.
Rewrite the user's existing prompt into a complete, production-ready Seedance prompt. Preserve the user's explicit adult intent and all existing content exactly as expressed. Never invent new sexual acts, participants, dialogue, characters, actions, or story beats that the user did not express. You may improve structure, reference binding, timing, physical motion, camera language, continuity, lighting, audio, and generation stability only.

Return a prompt that is directly usable in Seedance:
- LANGUAGE LOCK: Detect the dominant language of PROMPT START. Chinese prompts must stay predominantly Chinese; retain Chinese actions, descriptions, dialogue, ambience, and mood. Do not translate the whole prompt into English. Established camera/lighting terms may remain English when useful. If the source is English, keep it predominantly English.
- REFERENCE BINDING: Use the supplied numbered media inventory and labels exactly. Refer to media as 图片1/图片2, 视频1/视频2, 音频1/音频2 (or Image N / Video N / Audio N when the prompt is English). Never refer to an asset that is not in the inventory, never invent indices, and never use [Image 1].
- INPUT NORMALIZATION: Accept any form the user provides, including a finished prompt, a short idea, loose tags, dialogue, or a full script/story outline. Infer the stable shot content from the input and turn it into one directly executable Seedance prompt without changing the user's intent.
- TEXT-ONLY MODE: When the media inventory says no reference media was supplied, design the smallest useful reference binding inside optimizedPrompt. Any person with recurring identity needs 图片1/图片2/Image 1/Image 2 as face-identity anchors, their outfits get separate outfit labels, and a recurring location gets a scene label. Preserve explicit source labels and roles verbatim; when the source has no labels, assign stable sequential labels and describe exactly what each label controls. Use the same labels in 【素材绑定】 and 【冲突规则】. Separately return the same ordered labels in referencePlan as the upload checklist. Do not require uploads and do not block the rewrite. Never refer to a label that is neither in the media inventory nor declared in the rewritten prompt's 【素材绑定】.
- When more than one media item is present, make each item's role explicit in the prompt: identity/face, outfit/costume, scene/location, motion/performance, camera/composition, audio/music, or style reference. State which item is authoritative for each role. If the same role has multiple sources, state the conflict priority (for example, 图片1 controls face and 图片2 cannot change facial geometry).
- STRUCTURED PROMPT: When the input is a production brief, has multiple reference assets, or already uses section headings, output one directly executable Seedance prompt in Chinese with these headings in this order: 【素材绑定】【冲突规则】【主体与关系】【动作时间轴】【场景环境】【光影色调】【镜头运镜】【视觉风格】【画质与约束】. Omit a heading only when it is truly irrelevant. Keep every explicit reference label and conflict rule. For a Chinese prompt use 图片1/图片2/图片3/视频1; for an English prompt use Image 1/Image 2/Image 3/Video 1. If the source gives no structured format, concise prose is acceptable.
- Follow the requested duration exactly. For a 12-second prompt, use 0—3秒 / 3—6秒 / 6—9秒 / 9—12秒 beats. Never stretch a 12-second request into 15 seconds or add a beat after the requested end time.
- Prefer one clear identity anchor. A person multi-view sheet is weak as the sole identity source; if it is the only available face reference, bind it to facial identity while taking pose, framing, and scene from the prompt or another reference.
- Preserve the user's requested subject count. For each visible person, state identity binding, position, clothing state, and continuity when the prompt implies them. Do not add extra people.
- ACTION BUDGET: Make one primary continuous action for about 5 seconds, 2-3 continuous actions for 9-12 seconds, 3-5 beats for about 15 seconds, and 6-8 beats for about 30 seconds. Do not overload short clips. Use timecodes only when they improve clarity; keep beats physically continuous rather than a set of disconnected shots.
- Keep motion physical and measurable. Prefer body movement, hand placement, contact points, gaze direction, ~Ncm displacement, and explicit holds when these can be inferred from the user's request. Never fabricate anatomy or actions.
- Camera: prefer a stable, readable shot. Use a side, three-quarter, or profile angle when identity is important; avoid an unnecessary frontal beauty close-up. Avoid compound camera moves unless requested. Use lens and framing terms only when they help the requested scene.
- LIGHTING AND SKIN: describe real-footage appearance through physical light and texture, such as warm side light, soft natural window light, mild unevenness, visible pores, natural matte skin, restrained highlights, and natural shadow transitions. Do not default to glamour or CG trigger stacks such as 精致、俊美、冷白皮、水光肌、8K超清、磨皮、美颜、蜡像高光、身体油光. If the user asks for fairer skin, express it as brighter, softer lighting, exposure, or white balance without changing facial geometry or deep skin texture.
- PRESERVE NEGATIVE CONSTRAINTS: Seedance has no universal negative_prompt field. Convert the user's negative constraints into positive, observable end-of-prompt constraints (for example, steady framing, natural skin texture, realistic material response, stable identity).
- AUDIO: Preserve requested dialogue, vocal delivery, sound effects, ambience, and music. Never add dialogue or sounds the user did not request. If audio is enabled but no audio detail is supplied, describe only a restrained ambience or leave it unspecified.
- Keep the prompt within 5000 characters. Do not pad. Prefer clear, executable prose over tag piles. The prompt must read as a Seedance instruction, not an explanation of your rewrite.

Return JSON only, with this shape:
{"optimizedPrompt":"...","notes":["short change 1","short change 2"],"referencePlan":["图片1：主角脸部身份参考","图片2：固定服装参考"]}
The optimizedPrompt must be the complete usable prompt, not a diff or explanation. In TEXT-ONLY MODE, referencePlan is the ordered future upload checklist and uses labels that match the prompt language. When reference media was supplied, referencePlan must be empty because the existing references are already bound. Never use referencePlan to modify, upload, replace, or delete media.`;

function w3PromptOptimizerText(raw = {}) {
  return qwen37FlashResponseText(raw);
}

function w3ParseOptimizerJson(text = "") {
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
      if (parsed && typeof parsed.optimizedPrompt === "string") {
        const referencePlan = Array.isArray(parsed.referencePlan)
          ? parsed.referencePlan.map((item) => String(item?.label || item?.text || item || "").trim()).filter(Boolean).slice(0, 12)
          : [];
        return {
          optimizedPrompt: parsed.optimizedPrompt.trim(),
          notes: Array.isArray(parsed.notes) ? parsed.notes.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 8) : [],
          referencePlan,
        };
      }
    } catch {}
  }
  return null;
}

function w3PromptHasChinese(text = "") {
  return /[\u3400-\u9fff]/.test(String(text || ""));
}

function w3NormalizeConstraintStack(text = "") {
  let source = String(text || "").trim();
  if (!source) return source;
  const replacements = [
    [/避免动作过快/g, "动作节奏平稳连续"],
    [/避免剧烈的动作变化/g, "动作节奏平稳连续"],
    [/避免剧烈动作/g, "动作节奏平稳连续"],
    [/确保光影过渡自然/g, "光影过渡自然"],
    [/避免背景杂乱/g, "背景干净简洁"],
    [/不要出现多余肢体/g, "肢体数量准确"],
    [/不要出现变形/g, "形体结构稳定"],
    [/画面不要抖动/g, "镜头稳定"],
    [/避免画面抖动/g, "镜头稳定"],
    [/不要切换镜头/g, "单一连续镜头"],
    [/avoid (?:fast|rapid) (?:motion|movement)/gi, "steady continuous motion"],
    [/avoid (?:background )?clutter/gi, "clean simple background"],
    [/no (?:distortion|deformation)/gi, "stable anatomical geometry"],
    [/no extra limbs/gi, "exactly two arms and two legs"],
    [/avoid camera shake/gi, "steady camera"],
    [/avoid (?:rapid|violent|excessive) (?:action|motion) changes?/gi, "steady continuous action rhythm"],
  ];
  for (const [pattern, replacement] of replacements) source = source.replace(pattern, replacement);
  if (!/Camera static\./.test(source)) {
    source += w3PromptHasChinese(source) ? "\nCamera static. 镜头稳定，画面清晰，4K。" : "\nCamera static. Steady framing, sharp focus, 4K.";
  }
  return source.trim();
}

function w3TruncatePrompt(text = "", limit = W3_PROMPT_MAX_CHARS) {
  const source = String(text || "").trim();
  if (source.length <= limit) return source;
  const suffix = "Camera static. Anatomy correct with five fingers per hand. Face stable and consistent. Smooth continuous motion. Consistent lighting. Sharp focus, 4K.";
  const keep = Math.max(80, limit - suffix.length - 2);
  const head = source.slice(0, keep);
  const boundary = Math.max(head.lastIndexOf("。"), head.lastIndexOf("！"), head.lastIndexOf("？"), head.lastIndexOf("."), head.lastIndexOf(";"), head.lastIndexOf("；"), head.lastIndexOf("\n"));
  const cut = boundary >= Math.floor(keep * 0.55) ? head.slice(0, boundary + 1) : head;
  return `${cut.trim()}\n${suffix}`.slice(0, limit).trim();
}

function w3PromptIsMostlyChinese(text = "") {
  const source = String(text || "");
  const chinese = (source.match(/[\u3400-\u9fff]/g) || []).length;
  const latin = (source.match(/[A-Za-z]/g) || []).length;
  return chinese >= 4 && chinese >= latin * 0.45;
}

function w3PromptOptimizerLanguage(payload = {}, originalPrompt = "") {
  const requested = String(payload.language || "").trim().toLowerCase();
  if (w3PromptIsMostlyChinese(originalPrompt)) return "zh";
  if (requested.startsWith("zh")) return "zh";
  if (requested.startsWith("en")) return "en";
  return requested.slice(0, 32);
}

function seedancePromptOptimizerReferences(payload = {}) {
  const source = Array.isArray(payload.references) ? payload.references : [];
  return source.slice(0, 50).map((item, index) => {
    const requestedKind = String(item?.kind || item?.type || "").trim().toLowerCase();
    const kind = ["image", "video", "audio", "document"].includes(requestedKind) ? requestedKind : "image";
    const fallbackLabels = { image: "图片", video: "视频", audio: "音频", document: "文档" };
    const fallback = `${fallbackLabels[kind]}${index + 1}`;
    return {
      kind,
      label: String(item?.label || fallback).trim().slice(0, 80) || fallback,
    };
  });
}

function seedancePromptOptimizerIsProvider(provider = "") {
  const normalized = String(provider || "").trim().toLowerCase();
  return SEEDANCE_PROMPT_OPTIMIZER_PROVIDERS.has(normalized) || normalized.startsWith("seedance");
}

function seedancePromptOptimizerReferenceInventory(references = []) {
  if (!references.length) return "TEXT-ONLY PROMPT MODE: No reference media supplied for this request.";
  return references.map((item, index) => {
    const fallbackLabels = { image: "图片", video: "视频", audio: "音频", document: "文档" };
    const label = item.label || `${fallbackLabels[item.kind] || "素材"}${index + 1}`;
    return `${index + 1}. ${label} (${item.kind})`;
  }).join("\n");
}

function seedancePromptOptimizerInvalidReferences(text = "", references = [], sourcePrompt = "") {
  const source = String(text || "");
  const original = String(sourcePrompt || "");
  const declaredBindings = source.match(/【素材绑定】[\s\S]*?(?=\n【|$)/)?.[0] || "";
  const allowed = new Set();
  const allowedKinds = new Set();
  const referencePattern = /(图片|图|视频|音频|文档|Image|Video|Audio|Document)\s*(\d+)/i;
  const kindAliases = {
    "图片": "image", "图": "image", image: "image",
    "视频": "video", video: "video",
    "音频": "audio", audio: "audio",
    "文档": "document", document: "document",
  };
  const rememberLabel = (label = "") => {
    const normalized = String(label || "").trim();
    if (!normalized) return;
    allowed.add(normalized);
    const match = normalized.match(referencePattern);
    if (match) allowedKinds.add(`${kindAliases[match[1].toLowerCase()]}:${Number(match[2])}`);
  };
  for (const item of references) rememberLabel(item?.label);
  const explicitSourceLabels = original.match(/(?:图片|图|视频|音频|文档|Image|Video|Audio|Document)\s*\d+/gi) || [];
  explicitSourceLabels.forEach(rememberLabel);
  const designedLabels = declaredBindings.match(/(?:图片|图|视频|音频|文档|Image|Video|Audio|Document)\s*\d+/gi) || [];
  designedLabels.forEach(rememberLabel);
  const found = source.match(/(?:图片|图|视频|音频|文档|Image|Video|Audio|Document)\s*\d+/gi) || [];
  return [...new Set(found.filter((label) => {
    const normalized = label.replace(/\s+/g, " ").trim();
    if (allowed.has(normalized)) return false;
    const match = normalized.match(referencePattern);
    return !match || !allowedKinds.has(`${kindAliases[match[1].toLowerCase()]}:${Number(match[2])}`);
  }))];
}

function seedancePromptOptimizerNeutralizeInvalidReferences(text = "", references = [], sourcePrompt = "") {
  let output = String(text || "");
  const invalid = seedancePromptOptimizerInvalidReferences(output, references, sourcePrompt);
  for (const label of invalid) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    output = output.replace(new RegExp(escaped, "gi"), references.length ? "对应素材" : "画面主体");
  }
  return { text: output, invalid };
}

function seedancePromptOptimizerRequest(payload = {}, { languageCorrection = false } = {}) {
  const originalPrompt = String(payload.prompt || payload.originalPrompt || "").trim();
  const duration = Math.max(2, Math.min(30, Math.floor(Number(payload.duration) || 5)));
  const provider = String(payload.provider || "seedance").trim().toLowerCase();
  const providerLabel = String(payload.providerLabel || provider || "Seedance").trim().slice(0, 80);
  const resolution = String(payload.resolution || "").trim().slice(0, 32);
  const mode = String(payload.mode || "").trim().slice(0, 80);
  const language = w3PromptOptimizerLanguage(payload, originalPrompt);
  const references = seedancePromptOptimizerReferences(payload);
  const languageInstruction = language === "zh"
    ? "LANGUAGE LOCK: The source prompt is Chinese. Keep the optimized prompt predominantly Chinese. Do not translate actions, descriptions, dialogue, ambience, or mood into English. Only established camera/lighting/quality terms may remain English."
    : language === "en"
      ? "LANGUAGE LOCK: The source prompt is English. Keep the optimized prompt predominantly English."
      : "LANGUAGE LOCK: Keep the source prompt's dominant language and language mix.";
  const actionBudget = duration <= 6
    ? "ACTION BUDGET: Use one primary continuous action."
    : duration <= 12
      ? "ACTION BUDGET: Use 2-3 continuous actions."
      : duration <= 16
        ? "ACTION BUDGET: Use 3-5 beats."
        : "ACTION BUDGET: Use 6-8 beats.";
  const referenceInstruction = references.length
    ? "Do not add or remove reference media. referencePlan must be an empty array."
    : "TEXT-ONLY PROMPT MODE: No reference media is supplied. Treat the input as any mix of finished prompt, idea, loose tags, dialogue, or full script. The optimizer, not the user, is responsible for filling the Seedance reference plan. You must make the rewritten prompt directly usable in Seedance by designing stable numbered reference bindings. Preserve explicit labels such as 图片1/图片2/图片3/视频1 or Image 1/Image 2/Image 3/Video 1 and their declared roles/conflict rules. If PROMPT START has no labels, assign sequential labels for each reusable identity, outfit, or scene, write them into 【素材绑定】 and bind them in 【冲突规则】; never leave people or recurring assets as vague 素材 references. Return the identical ordered labels with their exact roles in referencePlan as the upload checklist. Do not require uploads and do not block the rewrite.";
  const userPrompt = [
    `Provider: ${providerLabel} (${provider})`,
    `Duration: ${duration}s`,
    resolution ? `Resolution: ${resolution}` : "",
    mode ? `Mode: ${mode}` : "",
    `Source language: ${language}`,
    languageInstruction,
    actionBudget,
    languageCorrection ? "Your previous answer broke the source-language lock. Rewrite again and keep the original dominant language." : "",
    "MEDIA INVENTORY (ordered; these are the only valid reference labels):",
    seedancePromptOptimizerReferenceInventory(references),
    "",
    `Rewrite the following prompt according to the Seedance system rules. Preserve every explicit adult intention already present. ${referenceInstruction} Return JSON only.`,
    "PROMPT START",
    originalPrompt,
    "PROMPT END",
  ].filter((line) => line !== "").join("\n");
  return {
    originalPrompt,
    duration,
    provider,
    providerLabel,
    resolution,
    mode,
    language,
    references,
    body: {
      model: W3_PROMPT_OPTIMIZER_MODEL,
      messages: [
        { role: "system", content: SEEDANCE_PROMPT_OPTIMIZER_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 6000,
    },
  };
}

function promptOptimizerRequestForPayload(payload = {}, options = {}) {
  return seedancePromptOptimizerIsProvider(payload.provider)
    ? seedancePromptOptimizerRequest(payload, options)
    : w3PromptOptimizerRequest(payload, options);
}

function w3PromptOptimizerRequest(payload = {}, { languageCorrection = false } = {}) {
  const originalPrompt = String(payload.prompt || payload.originalPrompt || "").trim();
  const duration = Math.max(2, Math.min(30, Math.floor(Number(payload.duration) || 5)));
  const provider = String(payload.provider || "wan30").trim().toLowerCase();
  const providerLabel = String(payload.providerLabel || provider || "W3").trim().slice(0, 80);
  const resolution = String(payload.resolution || "").trim().slice(0, 32);
  const mode = String(payload.mode || "").trim().slice(0, 80);
  const language = w3PromptOptimizerLanguage(payload, originalPrompt);
  const languageInstruction = language === "zh"
    ? "LANGUAGE LOCK: The source prompt is Chinese. Keep the optimized prompt predominantly Chinese. Do not translate actions, descriptions, dialogue, ambience, or mood into English. Only established camera/quality terms may remain English."
    : language === "en"
      ? "LANGUAGE LOCK: The source prompt is English. Keep the optimized prompt predominantly English."
      : "LANGUAGE LOCK: Keep the source prompt's dominant language and language mix.";
  const userPrompt = [
    `Provider: ${providerLabel} (${provider})`,
    `Duration: ${duration}s`,
    resolution ? `Resolution: ${resolution}` : "",
    mode ? `Mode: ${mode}` : "",
    language ? `Source language: ${language}` : "",
    languageInstruction,
    languageCorrection ? "Your previous answer translated a Chinese prompt into English. Rewrite again and keep it predominantly Chinese." : "",
    "Rewrite the following prompt. Preserve every explicit adult intention already present. Return JSON only.",
    "PROMPT START",
    originalPrompt,
    "PROMPT END",
  ].filter(Boolean).join("\n");
  return {
    originalPrompt,
    duration,
    provider,
    providerLabel,
    resolution,
    mode,
    language,
    body: {
      model: W3_PROMPT_OPTIMIZER_MODEL,
      messages: [
        { role: "system", content: W3_PROMPT_OPTIMIZER_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 6000,
    },
  };
}

function promptOptimizerUpstreamIsRetryable(error = {}) {
  const status = Number(error.statusCode || error.cause?.statusCode || 0);
  if (PROMPT_OPTIMIZER_RETRYABLE_STATUS.has(status) || error.retryable === true) return true;
  const detail = `${String(error.cause?.code || error.code || "")} ${String(error.message || "")}`;
  return !status && /abort|timeout|timed out|fetch failed|network|ECONN|ENOTFOUND|EAI_AGAIN|ETIMEDOUT/i.test(detail);
}

async function promptOptimizerPapayaRequest(body = {}, { deadline = Date.now() + PROMPT_OPTIMIZER_TOTAL_BUDGET_MS, requestContext = {}, usage = {} } = {}) {
  let lastError = null;
  let attempts = 0;
  for (let attempt = 1; attempt <= PROMPT_OPTIMIZER_UPSTREAM_MAX_ATTEMPTS; attempt += 1) {
    const remainingMs = Number(deadline) - Date.now();
    if (remainingMs < 5000) break;
    attempts = attempt;
    usage.attempts = (Number(usage.attempts) || 0) + 1;
    try {
      return await papayaLanguageRequest(body, {
        timeoutMs: Math.min(PROMPT_OPTIMIZER_UPSTREAM_TIMEOUT_MS, remainingMs),
      });
    } catch (error) {
      lastError = error;
      if (attempt >= PROMPT_OPTIMIZER_UPSTREAM_MAX_ATTEMPTS || !promptOptimizerUpstreamIsRetryable(error)) break;
      console.warn("[prompt-optimizer-retry]", JSON.stringify({
        ...requestContext,
        attempt,
        maxAttempts: PROMPT_OPTIMIZER_UPSTREAM_MAX_ATTEMPTS,
        statusCode: Number(error.statusCode || 0),
        code: String(error.cause?.code || error.code || ""),
        elapsedMs: Math.max(0, PROMPT_OPTIMIZER_TOTAL_BUDGET_MS - Math.max(0, Number(deadline) - Date.now())),
      }));
      await delay(400 * attempt);
    }
  }
  const error = new Error("Prompt optimizer upstream is temporarily unavailable.");
  error.statusCode = 503;
  error.code = "PROMPT_OPTIMIZER_UPSTREAM_UNAVAILABLE";
  error.upstreamStatus = Number(lastError?.statusCode || 0);
  error.upstreamCode = String(lastError?.cause?.code || lastError?.code || "");
  error.attempts = attempts;
  error.cause = lastError;
  throw error;
}

async function handleAdvancedPromptOptimize(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  let body = {};
  try {
    body = await readJson(req, 64 * 1024);
  } catch (error) {
    return sendJson(res, error.statusCode || 400, { ok: false, code: error.code || "INVALID_JSON", message: error.message || "Invalid request." });
  }
  const request = promptOptimizerRequestForPayload(body);
  const seedanceRequest = seedancePromptOptimizerIsProvider(body.provider);
  if (!request.originalPrompt) return sendJson(res, 400, { ok: false, code: "PROMPT_REQUIRED", message: "Prompt is required." });
  if (request.originalPrompt.length > W3_PROMPT_MAX_CHARS) {
    return sendJson(res, 400, { ok: false, code: "PROMPT_TOO_LONG", message: `Prompt must be ${W3_PROMPT_MAX_CHARS} characters or fewer.` });
  }
  if (!String(process.env.MULEROUTER_API_KEY || "").trim()) {
    return sendJson(res, 503, { ok: false, code: "MISSING_MULEROUTER_API_KEY", message: "提示词优化服务暂时不可用，请稍后重试。" });
  }
  const requestId = `prompt-optimizer-${crypto.randomUUID()}`;
  const startedAt = Date.now();
  const deadline = startedAt + PROMPT_OPTIMIZER_TOTAL_BUDGET_MS;
  const usage = { attempts: 0 };
  const requestContext = {
    requestId,
    provider: request.provider,
    seedance: seedanceRequest,
    model: W3_PROMPT_OPTIMIZER_MODEL,
    duration: request.duration,
    language: request.language,
    referenceCount: Array.isArray(request.references) ? request.references.length : 0,
  };
  try {
    let requestAttempt = request;
    let raw = await promptOptimizerPapayaRequest(requestAttempt.body, { deadline, requestContext, usage });
    let text = w3PromptOptimizerText(raw);
    if (!text) throw Object.assign(new Error("Prompt optimizer returned no text."), { statusCode: 502, code: "PROMPT_OPTIMIZER_EMPTY" });
    let parsed = w3ParseOptimizerJson(text);
    let optimizedPrompt = parsed?.optimizedPrompt || text.replace(/^```(?:json)?|```$/g, "").trim();
    if (request.language === "zh" && !w3PromptIsMostlyChinese(optimizedPrompt)) {
      requestAttempt = promptOptimizerRequestForPayload(body, { languageCorrection: true });
      raw = await promptOptimizerPapayaRequest(requestAttempt.body, { deadline, requestContext, usage });
      text = w3PromptOptimizerText(raw);
      if (!text) throw Object.assign(new Error("Prompt optimizer returned no text."), { statusCode: 502, code: "PROMPT_OPTIMIZER_EMPTY" });
      parsed = w3ParseOptimizerJson(text);
      optimizedPrompt = parsed?.optimizedPrompt || text.replace(/^```(?:json)?|```$/g, "").trim();
      if (!w3PromptIsMostlyChinese(optimizedPrompt)) {
        throw Object.assign(new Error("Prompt optimizer did not preserve the source language."), { statusCode: 502, code: "PROMPT_OPTIMIZER_LANGUAGE_MISMATCH" });
      }
    }
    if (seedanceRequest) {
      const referenceRepair = seedancePromptOptimizerNeutralizeInvalidReferences(optimizedPrompt, request.references, request.originalPrompt);
      if (referenceRepair.invalid.length) {
        console.warn("[prompt-optimizer-reference-repaired]", JSON.stringify({
          ...requestContext,
          invalidReferences: referenceRepair.invalid,
          elapsedMs: Date.now() - startedAt,
        }));
        optimizedPrompt = referenceRepair.text;
      }
      optimizedPrompt = optimizedPrompt.slice(0, W3_PROMPT_MAX_CHARS).trim();
    } else {
      optimizedPrompt = w3TruncatePrompt(w3NormalizeConstraintStack(optimizedPrompt));
    }
    if (!optimizedPrompt) throw Object.assign(new Error("Prompt optimizer returned an empty prompt."), { statusCode: 502, code: "PROMPT_OPTIMIZER_EMPTY" });
    return sendJson(res, 200, {
      ok: true,
      originalPrompt: request.originalPrompt,
      optimizedPrompt,
      notes: parsed?.notes || [],
      referencePlan: seedanceRequest ? (parsed?.referencePlan || []) : [],
      model: W3_PROMPT_OPTIMIZER_MODEL,
      mode: seedanceRequest ? "seedance" : "w3",
    });
  } catch (error) {
    const rawStatus = Number(error.statusCode) || 0;
    const status = rawStatus >= 400 && rawStatus < 600 ? rawStatus : 502;
    const code = error.code || "PROMPT_OPTIMIZER_FAILED";
    console.warn("[prompt-optimizer-failed]", JSON.stringify({
      ...requestContext,
      status,
      code,
      upstreamStatus: Number(error.upstreamStatus || error.statusCode || 0),
      upstreamCode: String(error.upstreamCode || error.cause?.code || error.code || ""),
      attempts: Number(error.attempts || usage.attempts || 0),
      elapsedMs: Date.now() - startedAt,
    }));
    const message = code === "PROMPT_OPTIMIZER_UPSTREAM_UNAVAILABLE"
      ? "上游模型暂时繁忙，请稍后重试。"
      : (error.message || "Prompt optimization failed.");
    return sendJson(res, status, { ok: false, code, message, requestId });
  }
}
