const W3_PROMPT_MAX_CHARS = 5000;
const W3_PROMPT_OPTIMIZER_MODEL = "carrothub-papaya-1.0";
const PROMPT_OPTIMIZER_TOTAL_BUDGET_MS = 170000;
const PROMPT_OPTIMIZER_UPSTREAM_TIMEOUT_MS = 165000;
const PROMPT_OPTIMIZER_UPSTREAM_MAX_ATTEMPTS = 2;
const PROMPT_OPTIMIZER_MODELS = Object.freeze({
  "carrothub-papaya-1.0": {
    id: "carrothub-papaya-1.0",
    label: "Papaya 1.0",
    upstreamModel: W3_PROMPT_OPTIMIZER_MODEL,
    request: (body, options) => papayaLanguageRequest(body, options),
    configured: () => Boolean(String(process.env.MULEROUTER_API_KEY || "").trim()),
    missingCode: "MISSING_MULEROUTER_API_KEY",
  },
  "qwen3.7-flash": {
    id: "qwen3.7-flash",
    label: "Qwen3.7 Flash",
    upstreamModel: QWEN37_FLASH_MODEL,
    request: (body, options) => aliyunQwen37FlashRequest(body, { ...options, maxAttempts: 1 }).catch((error) => { error.retryable = false; throw error; }),
    configured: () => Boolean(ALIYUN_QWEN37_API_KEY),
    missingCode: "MISSING_ALIYUN_QWEN37_API_KEY",
  },
  "byteplus-language": {
    id: "byteplus-language",
    label: "BytePlus Language",
    upstreamModel: BYTEPLUS_LANGUAGE_MODEL,
    request: (body, options) => byteplusLanguageRequest(body, options),
    configured: () => Boolean(ARK_API_KEY),
    missingCode: "MISSING_ARK_API_KEY",
  },
});
const PROMPT_OPTIMIZER_DEFAULT_MODEL = "carrothub-papaya-1.0";
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
- OUTPUT FORMAT LOCK: optimizedPrompt must be plain, readable, directly pasteable prose. Put each timecoded beat on its own line, for example a line beginning At 00:00, then a line beginning At 00:03, while keeping each beat internally continuous. Put the positive final constraint stack in its own final paragraph. Do not mash all beats into one giant paragraph. Do not use Markdown headings, code fences, bullet lists, numbered lists, tables, bold markers, or JSON-looking section wrappers inside the prompt.

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
- DURATION AND TIMELINE LOCK: Follow the authoritative duration supplied by the caller or explicitly stated in the source, whichever is longer. Use ordered, non-overlapping beats and make the last beat end exactly at the requested duration. Use 0—2秒 / 2—5秒 for 5 seconds, 0—3秒 / 3—6秒 / 6—9秒 / 9—12秒 for 12 seconds, and 0—4秒 / 4—8秒 / 8—12秒 / 12—15秒 for 15 seconds. Never collapse a 15-second request into only 0—5秒, never end before the requested duration, and never add a beat beyond it.
- Prefer one clear identity anchor. A person multi-view sheet is weak as the sole identity source; if it is the only available face reference, bind it to facial identity while taking pose, framing, and scene from the prompt or another reference.
- Preserve the user's requested subject count. For each visible person, state identity binding, position, clothing state, and continuity when the prompt implies them. Do not add extra people.
- ACTION BUDGET: Make one primary continuous action for about 5 seconds, 2-3 continuous actions for 9-12 seconds, 3-5 beats for about 15 seconds, and 6-8 beats for about 30 seconds. Do not overload short clips. Use timecodes only when they improve clarity; keep beats physically continuous rather than a set of disconnected shots.
- Keep motion physical and measurable. Prefer body movement, hand placement, contact points, gaze direction, ~Ncm displacement, and explicit holds when these can be inferred from the user's request. Never fabricate anatomy or actions.
- Camera: prefer a stable, readable shot. Use a side, three-quarter, or profile angle when identity is important; avoid an unnecessary frontal beauty close-up. Avoid compound camera moves unless requested. Use lens and framing terms only when they help the requested scene.
- LIGHTING AND SKIN: describe real-footage appearance through physical light and texture, such as warm side light, soft natural window light, mild unevenness, visible pores, natural matte skin, restrained highlights, and natural shadow transitions. Do not default to glamour or CG trigger stacks such as 精致、俊美、冷白皮、水光肌、8K超清、磨皮、美颜、蜡像高光、身体油光. If the user asks for fairer skin, express it as brighter, softer lighting, exposure, or white balance without changing facial geometry or deep skin texture.
- PRESERVE NEGATIVE CONSTRAINTS: Seedance has no universal negative_prompt field. Convert the user's negative constraints into positive, observable end-of-prompt constraints (for example, steady framing, natural skin texture, realistic material response, stable identity).
- DIALOGUE LOCK: Every explicit quoted line, script line, speaker/line pair, voice-over, and line inside 【对话】 must survive verbatim and stay assigned to the same speaker and beat. Do not paraphrase, omit, merge, translate, or replace dialogue with breathing, moaning, intimacy, or narration. A script's spoken lines and its visual action are separate requirements: preserving one never permits dropping the other. Never invent dialogue. If audio is enabled but no dialogue was supplied, describe only restrained ambience or leave it unspecified.
- Keep the prompt within 5000 characters. Do not pad. Prefer clear, executable prose over tag piles. The prompt must read as a Seedance instruction, not an explanation of your rewrite.

Return JSON only, with this shape:
{"optimizedPrompt":"...","notes":["short change 1","short change 2"],"referencePlan":["图片1：主角脸部身份参考","图片2：固定服装参考"]}
The optimizedPrompt must be the complete usable prompt, not a diff or explanation. In TEXT-ONLY MODE, referencePlan is the ordered future upload checklist and uses labels that match the prompt language. When reference media was supplied, referencePlan must be empty because the existing references are already bound. Never use referencePlan to modify, upload, replace, or delete media.`;

function w3PromptOptimizerText(raw = {}) {
  return qwen37FlashResponseText(raw);
}

function w3NormalizeOptimizerPromptFormatting(text = "") {
  return String(text || "")
    .replace(/【([^】\n]{1,40})}/g, "【$1】")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function w3WrapWanPromptParagraph(text = "", limit = 180) {
  const source = String(text || "").trim();
  if (!source) return "";
  if (source.length <= limit) return source;
  const sentences = source.match(/[^。！？!?]+[。！？!?]?/g) || [source];
  const lines = [];
  let current = "";
  for (const sentence of sentences) {
    const next = sentence.trim();
    if (!next) continue;
    if (current && current.length + next.length > limit) {
      lines.push(current.trim());
      current = next;
    } else {
      current += next;
    }
  }
  if (current.trim()) lines.push(current.trim());
  return lines.join("\n");
}

function w3NormalizeWanPromptFormatting(text = "") {
  let source = String(text || "").replace(/\r\n?/g, "\n").trim();
  if (!source) return "";
  source = source
    .replace(/^```(?:json|text|markdown|md)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .replace(/^[ \t]*#{1,6}[ \t]*/gm, "")
    .replace(/^[ \t]*(?:>[ \t]*)+/gm, "")
    .replace(/^[ \t]*(?:[-*+•]+|\d+[.)、])[ \t]+/gm, "")
    .replace(/^[ \t]*(?:[-*_]\s*){3,}$/gm, "")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/__([^_\n]+)__/g, "$1")
    .replace(/`([^`\n]+)`/g, "$1");
  source = source
    .replace(/(?<!\n)\s+(?=(?:【[^】\n]{1,40}】|At\s+\d{1,2}:\d{2}(?::\d{2})?|(?:Ambient|Camera static\.)\b))/gi, "\n")
    .replace(/([。！？!?])\s*(?=(?:At\s+\d{1,2}:\d{2}(?::\d{2})?|\d{1,2}(?:\s*[—–\-~至到]\s*)\d{1,2}\s*秒?\s*[：:]|(?:Ambient|Camera static\.)\b))/gi, "$1\n\n")
    .replace(/[ \t]+(?=\d{1,2}(?:\s*[—–\-~至到]\s*)\d{1,2}\s*秒?\s*[：:])/g, "\n")
    .replace(/([。！？!?])\s*(?=(?:正向约束|结尾约束|最终约束|Final constraints?)\s*[：:])/gi, "$1\n\n")
    .replace(/[ \t]+(?=(?:正向约束|结尾约束|最终约束|Final constraints?)\s*[：:])/gi, "\n\n");
  const lines = source.split("\n")
    .map((line) => line.trim())
    .filter((line, index, list) => line || (index > 0 && list[index - 1]))
    .filter((line) => !/^(?:W3|Wan|Seedance)?\s*(?:提示词|prompt)\s*[：:]?$|^优化后(?:的)?提示词\s*[：:]?$/i.test(line));
  const readable = [];
  for (const line of lines) {
    if (!line) {
      if (readable.length && readable[readable.length - 1] !== "") readable.push("");
      continue;
    }
    const isFinalStack = /^(?:Camera static\.|正向约束|结尾约束|最终约束|Final constraints?\s*[：:])/i.test(line);
    if (isFinalStack && readable.length && readable[readable.length - 1] !== "") readable.push("");
    readable.push(w3WrapWanPromptParagraph(line));
  }
  return w3NormalizeOptimizerPromptFormatting(readable.join("\n"));
}

function w3OptimizerReadablePrompt(value, depth = 0) {
  if (depth > 8 || value === null || value === undefined) return "";
  if (typeof value === "string") {
    const text = value.trim().replace(/^```(?:json|text)?\s*/i, "").replace(/\s*```$/i, "").trim();
    if (!text) return "";
    if (/^[{[]/.test(text) || (text.startsWith('"') && text.endsWith('"'))) {
      try {
        return w3OptimizerReadablePrompt(JSON.parse(text), depth + 1);
      } catch {}
    }
    return text;
  }
  if (Array.isArray(value)) return "";
  if (typeof value !== "object") return "";
  for (const key of ["optimizedPrompt", "optimized_prompt", "prompt", "text", "content", "result"]) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      const candidate = w3OptimizerReadablePrompt(value[key], depth + 1);
      if (candidate) return candidate;
    }
  }
  return "";
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
  const normalizePlan = (items) => Array.isArray(items)
    ? items.map((item) => String(item?.label || item?.text || item || "").trim()).filter(Boolean).slice(0, 12)
    : [];
  const mergeUnique = (firstItems = [], secondItems = []) => [...new Set([...firstItems, ...secondItems])].slice(0, 12);
  const collect = (value, depth = 0, state = { notes: [], referencePlan: [] }) => {
    if (!value || typeof value !== "object" || depth > 8) return state;
    state.notes = mergeUnique(state.notes, Array.isArray(value.notes) ? value.notes.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 8) : []);
    state.referencePlan = mergeUnique(state.referencePlan, normalizePlan(value.referencePlan));
    if (value.optimizedPrompt !== undefined) {
      let nested = value.optimizedPrompt;
      if (typeof nested === "string" && /^\s*\{/.test(nested)) {
        try { nested = JSON.parse(nested); } catch {}
      }
      if (nested && typeof nested === "object") collect(nested, depth + 1, state);
    }
    return state;
  };
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (!parsed || (typeof parsed !== "object" && typeof parsed !== "string")) continue;
      const optimizedPrompt = w3OptimizerReadablePrompt(parsed);
      if (!optimizedPrompt) continue;
      const collected = collect(parsed);
      return {
        optimizedPrompt: w3NormalizeOptimizerPromptFormatting(optimizedPrompt),
        notes: collected.notes,
        referencePlan: collected.referencePlan,
      };
    } catch {}
  }
  return null;
}

function seedancePromptOptimizerDialogueLines(source = "") {
  const text = String(source || "");
  const lines = [];
  const seen = new Set();
  const add = (value = "", speaker = "") => {
    const line = String(value || "").trim().replace(/^[：:，,\s]+|[。；;，,\s]+$/g, "");
    const name = String(speaker || "").trim().replace(/[：:\s]+$/g, "");
    if (line.length < 1 || line.length > 300) return;
    const rendered = name ? `${name}：${line}` : line;
    const key = rendered.replace(/\s+/g, "");
    if (seen.has(key)) return;
    seen.add(key);
    lines.push(rendered);
  };
  const quoted = /[“「『]([^”」』\n]{1,300})[”」』]|"([^"\n]{1,300})"/gu;
  let match = null;
  while ((match = quoted.exec(text)) && lines.length < 16) add(match[1] || match[2]);
  const nonSpeakerLabels = /^(?:环境|场景|镜头|运镜|动作|时长|总时长|风格|画质|光影|色调|素材|冲突|主体|视觉|参考|声音|音频|音乐|说明|备注)$/u;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.length > 220) continue;
    const labeled = line.match(/^(?:台词|对白|对话)\s*[：:]\s*(.+)$/);
    if (labeled) {
      add(labeled[1]);
      continue;
    }
    const speaker = line.match(/^([\p{L}\p{N}_·]{1,20})\s*[：:]\s*(.+)$/u);
    if (!speaker || nonSpeakerLabels.test(speaker[1]) || /^(?:图片|图|Image|Video|@)/i.test(speaker[2])) continue;
    if (/^(?:参考|使用|保持|位于|站在|坐在|镜头|场景|环境)/.test(speaker[2])) continue;
    add(speaker[2], speaker[1]);
  }
  return lines.slice(0, 16);
}

function seedancePromptOptimizerComparable(text = "") {
  return String(text || "").replace(/[\s“”「」『』"'，。！？、,.!?;；:：…—–\-]/g, "").toLowerCase();
}

function seedancePromptOptimizerDialogueBody(line = "") {
  return String(line || "").split(/[：:]/).slice(1).join("：") || String(line || "");
}

function seedancePromptOptimizerTimelineRanges(text = "") {
  const ranges = [];
  const pattern = /(\d+(?:\.\d+)?)\s*(?:秒|s)?\s*[—–\-~至到]\s*(\d+(?:\.\d+)?)\s*(?:秒|s)/gi;
  const source = String(text || "");
  let match = null;
  while ((match = pattern.exec(source))) {
    const start = Number(match[1]);
    const end = Number(match[2]);
    if (Number.isFinite(start) && Number.isFinite(end) && end >= start) ranges.push({ start, end });
  }
  return ranges;
}

function seedancePromptOptimizerRequestedDuration(payloadDuration, sourcePrompt = "") {
  const requested = Math.max(2, Math.min(30, Math.floor(Number(payloadDuration) || 5)));
  const source = String(sourcePrompt || "");
  const explicit = source.match(/(?:总时长|视频时长|时长|duration)\s*[：:]?\s*(\d+(?:\.\d+)?)\s*(?:秒|s)/i)
    || source.match(/^\s*(\d+(?:\.\d+)?)\s*(?:秒|s)\s*(?:[，,。\n]|$)/i);
  if (explicit) return Math.max(2, Math.min(30, Math.floor(Number(explicit[1]) || requested)));
  const timelineEnd = seedancePromptOptimizerTimelineRanges(source).reduce((max, range) => Math.max(max, range.end), 0);
  return timelineEnd > requested ? Math.max(2, Math.min(30, Math.ceil(timelineEnd))) : requested;
}

function seedancePromptOptimizerTimelineInstruction(duration) {
  const plans = {
    5: "0—2秒 / 2—5秒",
    10: "0—2.5秒 / 2.5—5秒 / 5—7.5秒 / 7.5—10秒",
    12: "0—3秒 / 3—6秒 / 6—9秒 / 9—12秒",
    15: "0—4秒 / 4—8秒 / 8—12秒 / 12—15秒",
    30: "0—4秒 / 4—8秒 / 8—12秒 / 12—16秒 / 16—20秒 / 20—24秒 / 24—27秒 / 27—30秒",
  };
  const required = plans[duration] || (duration <= 6
    ? "0—2秒 / 2—" + duration + "秒"
    : duration <= 12
      ? "four ordered beats that end exactly at " + duration + "秒"
      : "four to eight ordered beats that end exactly at " + duration + "秒");
  return `TIMELINE LOCK (authoritative): The requested duration is exactly ${duration} seconds. Required non-overlapping beat coverage: ${required}. Every timecode must stay within 0—${duration}秒. The final beat must end at ${duration}秒. Do not collapse the timeline to a shorter 0—5s clip when the requested duration is longer.`;
}

function seedancePromptOptimizerContentIssues(text = "", duration = 5, sourcePrompt = "") {
  const optimized = String(text || "");
  const issues = [];
  const optimizedComparable = seedancePromptOptimizerComparable(optimized);
  const missingDialogue = seedancePromptOptimizerDialogueLines(sourcePrompt).filter((line) => {
    const comparable = seedancePromptOptimizerComparable(line);
    const body = seedancePromptOptimizerComparable(seedancePromptOptimizerDialogueBody(line));
    return !optimizedComparable.includes(comparable) && !optimizedComparable.includes(body);
  });
  if (missingDialogue.length) issues.push({ type: "dialogue", lines: missingDialogue });
  const ranges = seedancePromptOptimizerTimelineRanges(optimized);
  const maxEnd = ranges.reduce((max, range) => Math.max(max, range.end), 0);
  if (maxEnd > Number(duration) + 0.25) {
    issues.push({ type: "timeline", message: `Timeline ends at ${maxEnd}s beyond requested ${duration}s.` });
  } else if (Number(duration) >= 10 && maxEnd < Number(duration) - 0.75) {
    issues.push({ type: "timeline", message: `Timeline ends at ${maxEnd || "no explicit beat"}s before requested ${duration}s.` });
  }
  return issues;
}

function seedancePromptOptimizerRepairContent(text = "", duration = 5, sourcePrompt = "") {
  let output = w3NormalizeOptimizerPromptFormatting(text);
  const issues = seedancePromptOptimizerContentIssues(output, duration, sourcePrompt);
  const dialogueIssue = issues.find((issue) => issue.type === "dialogue");
  if (dialogueIssue) {
    output += `\n【对白】\n${dialogueIssue.lines.join("\n")}`;
  }
  const timelineIssue = issues.find((issue) => issue.type === "timeline");
  if (timelineIssue) {
    const ranges = seedancePromptOptimizerTimelineRanges(output);
    if (ranges.length) {
      const last = ranges[ranges.length - 1];
      const tail = output.slice(output.lastIndexOf(String(last.end)));
      let replaced = false;
      output = output.replace(new RegExp(`(${last.start}\\s*(?:秒|s)?\\s*[—–\\-~至到]\\s*)${last.end}(\\s*(?:秒|s))`, "i"), (match, prefix, suffix) => {
        replaced = true;
        return `${prefix}${duration}${suffix}`;
      });
      if (!replaced && tail) output += `\n【时长约束】\n成片总时长严格为${duration}秒，动作与对白连续完成，并在${duration}秒处结束。`;
    } else {
      output += `\n【动作时间轴】\n0—${duration}秒：沿用上文动作与对白，动作连续，最后停在${duration}秒。`;
    }
  }
  return w3NormalizeOptimizerPromptFormatting(output);
}

function seedancePromptOptimizerCorrectionInstruction(issues = [], duration = 5) {
  const parts = [];
  const dialogue = issues.find((issue) => issue.type === "dialogue");
  if (dialogue) {
    parts.push(`DIALOGUE LOCK FAILED. Keep every line verbatim and keep each line assigned to the same speaker: ${dialogue.lines.map((line) => JSON.stringify(line)).join(" / ")}. Do not replace it with breathing, moaning, or a summary.`);
  }
  if (issues.some((issue) => issue.type === "timeline")) {
    parts.push(`TIMELINE LOCK FAILED. Rewrite with exact non-overlapping beats through ${duration}秒. Do not return only a 0—5s shot when ${duration} seconds was requested.`);
  }
  return parts.join("\n");
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
  const provider = String(payload.provider || "seedance").trim().toLowerCase();
  const providerLabel = String(payload.providerLabel || provider || "Seedance").trim().slice(0, 80);
  const resolution = String(payload.resolution || "").trim().slice(0, 32);
  const mode = String(payload.mode || "").trim().slice(0, 80);
  const language = w3PromptOptimizerLanguage(payload, originalPrompt);
  const references = seedancePromptOptimizerReferences(payload);
  const effectiveDuration = seedancePromptOptimizerRequestedDuration(payload.duration, originalPrompt);
  const timelineInstruction = seedancePromptOptimizerTimelineInstruction(effectiveDuration);
  const dialogueLines = seedancePromptOptimizerDialogueLines(originalPrompt);
  const dialogueInstruction = dialogueLines.length
    ? `DIALOGUE LOCK: Reproduce these explicit lines verbatim in their original language and keep each assigned to the same speaker: ${dialogueLines.map((line) => JSON.stringify(line)).join(" / ")}. Do not omit or replace them with breathing, moaning, or a summary.`
    : "DIALOGUE LOCK: If PROMPT START contains no explicit dialogue, do not invent any.";
  const languageInstruction = language === "zh"
    ? "LANGUAGE LOCK: The source prompt is Chinese. Keep the optimized prompt predominantly Chinese. Do not translate actions, descriptions, dialogue, ambience, or mood into English. Only established camera/lighting/quality terms may remain English."
    : language === "en"
      ? "LANGUAGE LOCK: The source prompt is English. Keep the optimized prompt predominantly English."
      : "LANGUAGE LOCK: Keep the source prompt's dominant language and language mix.";
  const actionBudget = effectiveDuration <= 6
    ? "ACTION BUDGET: Use one primary continuous action."
    : effectiveDuration <= 12
      ? "ACTION BUDGET: Use 2-3 continuous actions."
      : effectiveDuration <= 16
        ? "ACTION BUDGET: Use 3-5 beats."
        : "ACTION BUDGET: Use 6-8 beats.";
  const referenceInstruction = references.length
    ? "Do not add or remove reference media. referencePlan must be an empty array."
    : "TEXT-ONLY PROMPT MODE: No reference media is supplied. Treat the input as any mix of finished prompt, idea, loose tags, dialogue, or full script. The optimizer, not the user, is responsible for filling the Seedance reference plan. You must make the rewritten prompt directly usable in Seedance by designing stable numbered reference bindings. Preserve explicit labels such as 图片1/图片2/图片3/视频1 or Image 1/Image 2/Image 3/Video 1 and their declared roles/conflict rules. If PROMPT START has no labels, assign sequential labels for each reusable identity, outfit, or scene, write them into 【素材绑定】 and bind them in 【冲突规则】; never leave people or recurring assets as vague 素材 references. Return the identical ordered labels with their exact roles in referencePlan as the upload checklist. Do not require uploads and do not block the rewrite.";
  const userPrompt = [
    `Provider: ${providerLabel} (${provider})`,
    `Duration: ${effectiveDuration}s`,
    resolution ? `Resolution: ${resolution}` : "",
    mode ? `Mode: ${mode}` : "",
    `Source language: ${language}`,
    languageInstruction,
    actionBudget,
    languageCorrection ? "Your previous answer broke the source-language lock. Rewrite again and keep the original dominant language." : "",
    seedancePromptOptimizerCorrectionInstruction(payload.__correctionIssues || [], effectiveDuration),
    "MEDIA INVENTORY (ordered; these are the only valid reference labels):",
    seedancePromptOptimizerReferenceInventory(references),
    "",
    `Rewrite the following prompt according to the Seedance system rules. Preserve every explicit adult intention already present. ${timelineInstruction} ${dialogueInstruction} ${referenceInstruction} Return JSON only.`,
    "PROMPT START",
    originalPrompt,
    "PROMPT END",
  ].filter((line) => line !== "").join("\n");
  return {
    originalPrompt,
    duration: effectiveDuration,
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
  const duration = seedancePromptOptimizerRequestedDuration(payload.duration, originalPrompt);
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
  if (error.retryable === false) return false;
  const status = Number(error.statusCode || error.cause?.statusCode || 0);
  return PROMPT_OPTIMIZER_RETRYABLE_STATUS.has(status);
}

function promptOptimizerSelectedModel(value = "") {
  const id = String(value || "").trim() || PROMPT_OPTIMIZER_DEFAULT_MODEL;
  return PROMPT_OPTIMIZER_MODELS[id] || null;
}

function promptOptimizerTimeoutError(lastError) {
  const code = String(lastError?.cause?.code || lastError?.code || "");
  return /timeout|timed out|abort|ETIMEDOUT/i.test(`${code} ${String(lastError?.message || "")}`);
}

async function promptOptimizerUpstreamRequest(body = {}, { deadline = Date.now() + PROMPT_OPTIMIZER_TOTAL_BUDGET_MS, requestContext = {}, usage = {}, optimizerModel = null } = {}) {
  const selected = optimizerModel || PROMPT_OPTIMIZER_MODELS[PROMPT_OPTIMIZER_DEFAULT_MODEL];
  let lastError = null;
  let attempts = 0;
  for (let attempt = 1; attempt <= PROMPT_OPTIMIZER_UPSTREAM_MAX_ATTEMPTS; attempt += 1) {
    const remainingMs = Number(deadline) - Date.now();
    if (remainingMs < 5000) break;
    attempts = attempt;
    usage.attempts = (Number(usage.attempts) || 0) + 1;
    try {
      return await selected.request(body, {
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
  const timedOut = promptOptimizerTimeoutError(lastError);
  const error = new Error(timedOut ? "Prompt optimizer upstream timed out." : "Prompt optimizer upstream failed.");
  error.statusCode = 503;
  error.code = timedOut ? "PROMPT_OPTIMIZER_UPSTREAM_TIMEOUT" : "PROMPT_OPTIMIZER_UPSTREAM_UNAVAILABLE";
  error.upstreamStatus = Number(lastError?.statusCode || 0);
  error.upstreamCode = String(lastError?.cause?.code || lastError?.code || "");
  error.attempts = attempts;
  error.cause = lastError;
  throw error;
}

async function promptOptimizerPapayaRequest(body = {}, options = {}) {
  return promptOptimizerUpstreamRequest(body, {
    ...options,
    optimizerModel: PROMPT_OPTIMIZER_MODELS[PROMPT_OPTIMIZER_DEFAULT_MODEL],
  });
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
  const optimizerModel = promptOptimizerSelectedModel(body.optimizerModel || body.optimizer_model);
  if (!optimizerModel) {
    return sendJson(res, 400, { ok: false, code: "PROMPT_OPTIMIZER_MODEL_UNSUPPORTED", message: "不支持的优化模型，请重新选择。" });
  }
  if (!optimizerModel.configured()) {
    return sendJson(res, 503, { ok: false, code: optimizerModel.missingCode, message: `${optimizerModel.label} 尚未配置，请更换模型。` });
  }
  const request = promptOptimizerRequestForPayload(body);
  request.body.model = optimizerModel.upstreamModel;
  const seedanceRequest = seedancePromptOptimizerIsProvider(body.provider);
  if (!request.originalPrompt) return sendJson(res, 400, { ok: false, code: "PROMPT_REQUIRED", message: "Prompt is required." });
  if (request.originalPrompt.length > W3_PROMPT_MAX_CHARS) {
    return sendJson(res, 400, { ok: false, code: "PROMPT_TOO_LONG", message: `Prompt must be ${W3_PROMPT_MAX_CHARS} characters or fewer.` });
  }
  const requestId = `prompt-optimizer-${crypto.randomUUID()}`;
  const startedAt = Date.now();
  const deadline = startedAt + PROMPT_OPTIMIZER_TOTAL_BUDGET_MS;
  const usage = { attempts: 0 };
  const requestContext = {
    requestId,
    provider: request.provider,
    seedance: seedanceRequest,
    optimizerModel: optimizerModel.id,
    upstreamModel: optimizerModel.upstreamModel,
    duration: request.duration,
    language: request.language,
    referenceCount: Array.isArray(request.references) ? request.references.length : 0,
  };
  try {
    let requestAttempt = request;
    requestAttempt.body.model = optimizerModel.upstreamModel;
    let raw = await promptOptimizerUpstreamRequest(requestAttempt.body, { deadline, requestContext, usage, optimizerModel });
    let text = w3PromptOptimizerText(raw);
    if (!text) throw Object.assign(new Error("Prompt optimizer returned no text."), { statusCode: 502, code: "PROMPT_OPTIMIZER_EMPTY" });
    let parsed = w3ParseOptimizerJson(text);
    let optimizedPrompt = parsed?.optimizedPrompt || w3OptimizerReadablePrompt(text);
    if (request.language === "zh" && !w3PromptIsMostlyChinese(optimizedPrompt)) {
      requestAttempt = promptOptimizerRequestForPayload(body, { languageCorrection: true });
      requestAttempt.body.model = optimizerModel.upstreamModel;
      raw = await promptOptimizerUpstreamRequest(requestAttempt.body, { deadline, requestContext, usage, optimizerModel });
      text = w3PromptOptimizerText(raw);
      if (!text) throw Object.assign(new Error("Prompt optimizer returned no text."), { statusCode: 502, code: "PROMPT_OPTIMIZER_EMPTY" });
      parsed = w3ParseOptimizerJson(text);
      optimizedPrompt = parsed?.optimizedPrompt || w3OptimizerReadablePrompt(text);
      if (!w3PromptIsMostlyChinese(optimizedPrompt)) {
        throw Object.assign(new Error("Prompt optimizer did not preserve the source language."), { statusCode: 502, code: "PROMPT_OPTIMIZER_LANGUAGE_MISMATCH" });
      }
    }
    if (seedanceRequest) {
      const initialIssues = seedancePromptOptimizerContentIssues(optimizedPrompt, request.duration, request.originalPrompt);
      if (initialIssues.length) {
        requestAttempt = promptOptimizerRequestForPayload({ ...body, __correctionIssues: initialIssues }, { languageCorrection: request.language === "zh" && !w3PromptIsMostlyChinese(optimizedPrompt) });
        requestAttempt.body.model = optimizerModel.upstreamModel;
        raw = await promptOptimizerUpstreamRequest(requestAttempt.body, { deadline, requestContext, usage, optimizerModel });
        text = w3PromptOptimizerText(raw);
        if (!text) throw Object.assign(new Error("Prompt optimizer returned no text."), { statusCode: 502, code: "PROMPT_OPTIMIZER_EMPTY" });
        parsed = w3ParseOptimizerJson(text);
        optimizedPrompt = parsed?.optimizedPrompt || w3OptimizerReadablePrompt(text);
        const retryIssues = seedancePromptOptimizerContentIssues(optimizedPrompt, request.duration, request.originalPrompt);
        if (request.language === "zh" && !w3PromptIsMostlyChinese(optimizedPrompt)) {
          throw Object.assign(new Error("Prompt optimizer did not preserve the source language."), { statusCode: 502, code: "PROMPT_OPTIMIZER_LANGUAGE_MISMATCH" });
        }
        if (retryIssues.length) {
          optimizedPrompt = seedancePromptOptimizerRepairContent(optimizedPrompt, request.duration, request.originalPrompt);
          console.warn("[prompt-optimizer-content-repair]", JSON.stringify({
            ...requestContext,
            issues: retryIssues.map((issue) => issue.type),
            elapsedMs: Date.now() - startedAt,
          }));
        }
      }
      optimizedPrompt = w3NormalizeOptimizerPromptFormatting(optimizedPrompt);
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
      optimizedPrompt = w3TruncatePrompt(w3NormalizeConstraintStack(w3NormalizeWanPromptFormatting(optimizedPrompt)));
    }
    if (!optimizedPrompt) throw Object.assign(new Error("Prompt optimizer returned an empty prompt."), { statusCode: 502, code: "PROMPT_OPTIMIZER_EMPTY" });
    return sendJson(res, 200, {
      ok: true,
      originalPrompt: request.originalPrompt,
      optimizedPrompt,
      notes: parsed?.notes || [],
      referencePlan: seedanceRequest ? (parsed?.referencePlan || []) : [],
      model: optimizerModel.id,
      upstreamModel: optimizerModel.upstreamModel,
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
    const message = code === "PROMPT_OPTIMIZER_UPSTREAM_TIMEOUT"
      ? `${optimizerModel.label} 响应超时，请重试或更换模型。`
      : code === "PROMPT_OPTIMIZER_UPSTREAM_UNAVAILABLE"
        ? `${optimizerModel.label} 返回了明确的上游错误，请稍后重试或更换模型。`
        : (error.message || "Prompt optimization failed.");
    return sendJson(res, status, { ok: false, code, message, requestId });
  }
}
