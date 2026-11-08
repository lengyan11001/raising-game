const W3_PROMPT_MAX_CHARS = 5000;
const W3_PROMPT_OPTIMIZER_MODEL = "carrothub-papaya-1.0";

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
        return {
          optimizedPrompt: parsed.optimizedPrompt.trim(),
          notes: Array.isArray(parsed.notes) ? parsed.notes.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 8) : [],
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

async function handleAdvancedPromptOptimize(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  let body = {};
  try {
    body = await readJson(req, 64 * 1024);
  } catch (error) {
    return sendJson(res, error.statusCode || 400, { ok: false, code: error.code || "INVALID_JSON", message: error.message || "Invalid request." });
  }
  const request = w3PromptOptimizerRequest(body);
  if (!request.originalPrompt) return sendJson(res, 400, { ok: false, code: "PROMPT_REQUIRED", message: "Prompt is required." });
  if (request.originalPrompt.length > W3_PROMPT_MAX_CHARS) {
    return sendJson(res, 400, { ok: false, code: "PROMPT_TOO_LONG", message: `Prompt must be ${W3_PROMPT_MAX_CHARS} characters or fewer.` });
  }
  if (!String(process.env.MULEROUTER_API_KEY || "").trim()) {
    return sendJson(res, 503, { ok: false, code: "MISSING_MULEROUTER_API_KEY", message: "Prompt optimizer is not configured." });
  }
  try {
    let requestAttempt = request;
    let raw = await papayaLanguageRequest(requestAttempt.body, { timeoutMs: 180000 });
    let text = w3PromptOptimizerText(raw);
    if (!text) throw Object.assign(new Error("Prompt optimizer returned no text."), { statusCode: 502, code: "PROMPT_OPTIMIZER_EMPTY" });
    let parsed = w3ParseOptimizerJson(text);
    let optimizedPrompt = parsed?.optimizedPrompt || text.replace(/^```(?:json)?|```$/g, "").trim();
    if (request.language === "zh" && !w3PromptIsMostlyChinese(optimizedPrompt)) {
      requestAttempt = w3PromptOptimizerRequest(body, { languageCorrection: true });
      raw = await papayaLanguageRequest(requestAttempt.body, { timeoutMs: 180000 });
      text = w3PromptOptimizerText(raw);
      if (!text) throw Object.assign(new Error("Prompt optimizer returned no text."), { statusCode: 502, code: "PROMPT_OPTIMIZER_EMPTY" });
      parsed = w3ParseOptimizerJson(text);
      optimizedPrompt = parsed?.optimizedPrompt || text.replace(/^```(?:json)?|```$/g, "").trim();
      if (!w3PromptIsMostlyChinese(optimizedPrompt)) {
        throw Object.assign(new Error("Prompt optimizer did not preserve the source language."), { statusCode: 502, code: "PROMPT_OPTIMIZER_LANGUAGE_MISMATCH" });
      }
    }
    optimizedPrompt = w3TruncatePrompt(w3NormalizeConstraintStack(optimizedPrompt));
    if (!optimizedPrompt) throw Object.assign(new Error("Prompt optimizer returned an empty prompt."), { statusCode: 502, code: "PROMPT_OPTIMIZER_EMPTY" });
    return sendJson(res, 200, {
      ok: true,
      originalPrompt: request.originalPrompt,
      optimizedPrompt,
      notes: parsed?.notes || [],
      model: W3_PROMPT_OPTIMIZER_MODEL,
    });
  } catch (error) {
    const status = Number(error.statusCode) >= 400 ? Number(error.statusCode) : 502;
    return sendJson(res, status, { ok: false, code: error.code || "PROMPT_OPTIMIZER_FAILED", message: error.message || "Prompt optimization failed." });
  }
}
