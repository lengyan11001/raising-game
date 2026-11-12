"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const server = read("server.parts/part-45.js");
const route = read("server.parts/part-42.js");
const client = read("platform.prompt-optimizer.js");
const advancedHtml = read("platform.html");
const advancedConfig = read("platform.config.js");
const advancedControls = read("platform.create.parts/part-02.js");
const advancedMain = read("platform.main.js");
const reactFlow = read("workflow-react/src/components/canvas/siteNodes/SiteVideoGenerationNode.js");
const legacyEditor = read("platform.ui.parts/part-05.js");
const legacyEvents = read("platform.ui.parts/part-07.js");
const bridge = read("platform.workflow-react.js");
const css = read("platform.css");
const skill = fs.readFileSync(path.resolve(process.env.HOME || "", ".codex/skills/w3-prompt-optimizer/SKILL.md"), "utf8");

function extractFunction(source, name) {
  let start = source.search(new RegExp(`(?:^|\\n)(?:async\\s+)?function\\s+${name}\\s*\\(`));
  if (start >= 0 && source[start] === "\n") start += 1;
  if (start === -1) throw new Error(`missing function ${name}`);
  if (source.slice(Math.max(0, start - 6), start) === "async ") start -= 6;
  let parenDepth = 0;
  let parenQuote = "";
  let parenRegex = false;
  let bodyStart = -1;
  for (let index = source.indexOf("(", start); index < source.length; index += 1) {
    const char = source[index];
    if (parenQuote) {
      if (char === "\\") index += 1;
      else if (char === parenQuote) parenQuote = "";
      continue;
    }
    if (parenRegex) {
      if (char === "\\") index += 1;
      else if (char === "/") parenRegex = false;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") parenQuote = char;
    else if (char === "/" && parenDepth > 0 && source[index - 1] === "=") parenRegex = true;
    else if (char === "(") parenDepth += 1;
    else if (char === ")") {
      parenDepth -= 1;
      if (parenDepth === 0) {
        bodyStart = source.indexOf("{", index);
        break;
      }
    }
  }
  if (bodyStart < 0) throw new Error(`missing body for function ${name}`);
  let depth = 0;
  let templateDepth = 0;
  let quote = "";
  let regex = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    let previous = "";
    for (let lookback = index - 1; lookback >= bodyStart; lookback -= 1) {
      if (!/\s/.test(source[lookback])) {
        previous = source[lookback];
        break;
      }
    }
    if (quote) {
      if (char === "\\") index += 1;
      else if (quote === "`" && char === "$" && source[index + 1] === "{") {
        templateDepth += 1;
        index += 1;
      } else if (quote === "`" && templateDepth && char === "}") {
        templateDepth -= 1;
      } else if (char === quote && templateDepth === 0) quote = "";
      continue;
    }
    if (regex) {
      if (char === "\\") index += 1;
      else if (char === "/") regex = false;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "/" && source[index + 1] === "/") {
      index = source.indexOf("\n", index + 2);
      if (index === -1) break;
      continue;
    }
    if (char === "/" && source[index + 1] === "*") {
      index = source.indexOf("*/", index + 2) + 1;
      if (index <= 0) break;
      continue;
    }
    if (char === "/" && /[=(:,!&|?{};+\-*%^~<>]/.test(previous || "")) {
      regex = true;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`unterminated function ${name}`);
}

const helpers = new Function("papayaLanguageRequest", [
  "const W3_PROMPT_MAX_CHARS = 5000;",
  "const W3_PROMPT_OPTIMIZER_MODEL = \"carrothub-papaya-1.0\";",
  "const SEEDANCE_PROMPT_OPTIMIZER_PROVIDERS = new Set([\"seedance\",\"seedance25\",\"seedance-nsfw\",\"seedance20-vega\",\"seedance25-vega\"]);",
  `const W3_PROMPT_OPTIMIZER_SYSTEM_PROMPT = ${JSON.stringify(server.slice(server.indexOf("const W3_PROMPT_OPTIMIZER_SYSTEM_PROMPT = `") + "const W3_PROMPT_OPTIMIZER_SYSTEM_PROMPT = `".length, server.indexOf("`;\n\nconst SEEDANCE_PROMPT_OPTIMIZER_SYSTEM_PROMPT")))};`,
  `const SEEDANCE_PROMPT_OPTIMIZER_SYSTEM_PROMPT = ${JSON.stringify(server.slice(server.indexOf("const SEEDANCE_PROMPT_OPTIMIZER_SYSTEM_PROMPT = `") + "const SEEDANCE_PROMPT_OPTIMIZER_SYSTEM_PROMPT = `".length, server.indexOf("`;\n\nfunction w3PromptOptimizerText")))};`,
  extractFunction(server, "w3NormalizeOptimizerPromptFormatting"),
  extractFunction(server, "w3OptimizerReadablePrompt"),
  extractFunction(server, "w3ParseOptimizerJson"),
  extractFunction(server, "seedancePromptOptimizerDialogueLines"),
  extractFunction(server, "seedancePromptOptimizerComparable"),
  extractFunction(server, "seedancePromptOptimizerDialogueBody"),
  extractFunction(server, "seedancePromptOptimizerTimelineRanges"),
  extractFunction(server, "seedancePromptOptimizerRequestedDuration"),
  extractFunction(server, "seedancePromptOptimizerTimelineInstruction"),
  extractFunction(server, "seedancePromptOptimizerContentIssues"),
  extractFunction(server, "seedancePromptOptimizerRepairContent"),
  extractFunction(server, "seedancePromptOptimizerCorrectionInstruction"),
  extractFunction(server, "w3PromptHasChinese"),
  extractFunction(server, "w3NormalizeConstraintStack"),
  extractFunction(server, "w3TruncatePrompt"),
  extractFunction(server, "w3PromptIsMostlyChinese"),
  extractFunction(server, "w3PromptOptimizerLanguage"),
  extractFunction(server, "seedancePromptOptimizerReferences"),
  extractFunction(server, "seedancePromptOptimizerIsProvider"),
  extractFunction(server, "seedancePromptOptimizerReferenceInventory"),
  extractFunction(server, "seedancePromptOptimizerInvalidReferences"),
  extractFunction(server, "seedancePromptOptimizerNeutralizeInvalidReferences"),
  extractFunction(server, "seedancePromptOptimizerRequest"),
  extractFunction(server, "w3PromptOptimizerRequest"),
  extractFunction(server, "promptOptimizerRequestForPayload"),
  extractFunction(server, "promptOptimizerUpstreamIsRetryable"),
  extractFunction(server, "promptOptimizerPapayaRequest"),
  "const delay = async () => {};",
  "return { w3NormalizeOptimizerPromptFormatting, w3OptimizerReadablePrompt, w3ParseOptimizerJson, seedancePromptOptimizerDialogueLines, seedancePromptOptimizerTimelineRanges, seedancePromptOptimizerContentIssues, seedancePromptOptimizerRepairContent, seedancePromptOptimizerRequestedDuration, seedancePromptOptimizerTimelineInstruction, w3TruncatePrompt, w3PromptIsMostlyChinese, w3PromptOptimizerLanguage, w3PromptOptimizerRequest, w3NormalizeConstraintStack, seedancePromptOptimizerRequest, promptOptimizerRequestForPayload, seedancePromptOptimizerIsProvider, seedancePromptOptimizerInvalidReferences, seedancePromptOptimizerNeutralizeInvalidReferences, promptOptimizerUpstreamIsRetryable, promptOptimizerPapayaRequest };",
].join("\n"))(() => { throw new Error("papayaLanguageRequest mock missing"); });

test("optimizer route is authenticated in front of generate and uses Papaya", () => {
  const optimize = route.indexOf('url.pathname === "/api/advanced/prompt-optimize"');
  const generate = route.indexOf('url.pathname === "/api/advanced/generate"');
  assert.ok(optimize > 0 && optimize < generate);
  assert.match(route, /handleAdvancedPromptOptimize\(req, res\)/);
  assert.match(server, /carrothub-papaya-1\.0/);
  assert.match(server, /const auth = await requireUser\(req, res\);\s*if \(!auth\) return;/);
  assert.match(server, /promptOptimizerPapayaRequest\(requestAttempt\.body/);
});

test("optimizer validates prompt length and does not create generation records", () => {
  assert.match(server, /PROMPT_REQUIRED/);
  assert.match(server, /PROMPT_TOO_LONG/);
  assert.match(server, /W3_PROMPT_MAX_CHARS = 5000/);
  assert.doesNotMatch(server, /insertGeneration|generationRecords|扣除|charge/i);
});

test("optimizer accepts plain text, JSON, and fenced JSON", () => {
  assert.equal(helpers.w3ParseOptimizerJson("plain prompt"), null);
  assert.deepEqual(helpers.w3ParseOptimizerJson('{"optimizedPrompt":"one","notes":["n"]}'), {
    optimizedPrompt: "one",
    notes: ["n"],
    referencePlan: [],
  });
  assert.deepEqual(helpers.w3ParseOptimizerJson('```json\n{"optimizedPrompt":"two","notes":[]}\n```'), {
    optimizedPrompt: "two",
    notes: [],
    referencePlan: [],
  });
});

test("optimizer normalizes caller parameters and preserves adult intent in the system prompt", () => {
  const req = helpers.w3PromptOptimizerRequest({ prompt: "  explicit adult scene  ", duration: 99 });
  assert.equal(req.originalPrompt, "explicit adult scene");
  assert.equal(req.duration, 30);
  assert.match(req.body.messages[0].content, /18\+ adult product/);
  assert.match(req.body.messages[0].content, /Preserve the user's explicit adult intent/);
  assert.match(req.body.messages[0].content, /LANGUAGE LOCK/);
  assert.match(req.body.messages[1].content, /Preserve every explicit adult intention/);
  assert.doesNotMatch(req.body.messages[0].content, /moderation|compliance|minor|未成年|审核|合规|净化|sanitize/i);
});

test("Chinese source language wins over page language and is locked in the request", () => {
  const prompt = "情侣在酒店房间内接吻，女生轻轻抱住男生，镜头慢慢靠近，气氛暧昧，灯光柔和，画面稳定。";
  assert.equal(helpers.w3PromptIsMostlyChinese(prompt), true);
  assert.equal(helpers.w3PromptOptimizerLanguage({ language: "en" }, prompt), "zh");
  const req = helpers.w3PromptOptimizerRequest({ prompt, language: "en" });
  assert.equal(req.language, "zh");
  assert.match(req.body.messages[1].content, /Source language: zh/);
  assert.match(req.body.messages[1].content, /Keep the optimized prompt predominantly Chinese/);
  assert.match(req.body.messages[1].content, /Do not translate actions, descriptions, dialogue, ambience, or mood into English/);
});

test("client detects prompt language instead of sending page language", () => {
  const scope = { window: {}, document: { documentElement: { lang: "en" } }, localStorage: { getItem() { return ""; } } };
  new Function("window", "document", "localStorage", client)(scope.window, scope.document, scope.localStorage);
  assert.match(client, /language: options\.language \|\| detectPromptLanguage\(prompt\)/);
  assert.doesNotMatch(client, /language: options\.language \|\| document\.documentElement\.lang/);
});

test("negative residue is converted into a positive final constraint stack", () => {
  const result = helpers.w3NormalizeConstraintStack("保持清晰的轮廓，避免动作过快，避免剧烈的动作变化，确保光影过渡自然，避免背景杂乱。");
  assert.doesNotMatch(result, /避免/);
  assert.match(result, /动作节奏平稳连续/);
  assert.match(result, /背景干净简洁/);
  assert.match(result, /Camera static\./);
  assert.match(result, /镜头稳定/);
});

test("5000-character truncation keeps a positive final constraint stack and sentence boundary", () => {
  const source = `${"这是一个很长的镜头描述。".repeat(800)}END`;
  const result = helpers.w3TruncatePrompt(source);
  assert.ok(result.length <= 5000);
  assert.match(result, /Camera static\. Anatomy correct with five fingers per hand/);
  assert.doesNotMatch(result, /END$/);
});

test("Wan provider detection covers all Wan families and excludes non-Wan", () => {
  const scope = { window: {}, document: {}, localStorage: { getItem() { return ""; } } };
  new Function("window", "document", "localStorage", client)(scope.window, scope.document, scope.localStorage);
  for (const provider of ["wan30", "wan30-video-prime", "wan27", "wan-animate", "h3-vega", "wan-legacy"]) {
    assert.equal(scope.window.isWanPromptOptimizerProvider(provider), true, provider);
  }
  for (const provider of ["seedance", "seedance-nsfw", "papaya"]) {
    assert.equal(scope.window.isWanPromptOptimizerProvider(provider), false, provider);
  }
});

test("client writes readable prompt text rather than JSON into the input box", () => {
  const scope = { window: {}, document: {}, localStorage: { getItem() { return ""; } } };
  new Function("window", "document", "localStorage", client)(scope.window, scope.document, scope.localStorage);
  const readable = scope.window.W3PromptOptimizer.readableOptimizedPrompt;
  assert.equal(readable('{"optimizedPrompt":"【主体】角色A站在窗边。"}'), "【主体】角色A站在窗边。");
  assert.equal(readable(JSON.stringify({ optimizedPrompt: JSON.stringify({ optimizedPrompt: "【动作时间轴】\n0—4秒：抬头。" }) })), "【动作时间轴】\n0—4秒：抬头。");
  assert.doesNotMatch(readable({ optimizedPrompt: { optimizedPrompt: "【镜头运镜】缓慢推近。" } }), /^[{[]/);
});

test("modal applies only after explicit confirmation", () => {
  const open = client.indexOf("function ensureModal()");
  const apply = client.indexOf('modal.apply.addEventListener("click"');
  const run = client.indexOf("async function run(");
  assert.ok(open > 0 && apply > open);
  assert.ok(run > apply);
  assert.match(client, /const callback = modal\.onApply;[\s\S]*?if \(typeof callback === "function"\) callback\(value\);/);
  const inputListener = client.slice(client.indexOf('modal.result.addEventListener("input"'), client.indexOf('modal.retry.addEventListener("click"'));
  assert.doesNotMatch(inputListener, /onApply|\.apply\.click/);
  assert.match(css, /\.prompt-optimizer-dialog/);
  assert.match(css, /\.prompt-optimizer-field textarea/);
});

test("optimizer request is an explicit metadata-only whitelist", () => {
  assert.match(client, /const requestBody = \{/);
  assert.match(client, /references: normalizeReferences\(payload\.references\)/);
  assert.doesNotMatch(client, /body: JSON\.stringify\(\{ \.\.\.payload/);
  assert.match(client, /Array\.isArray\(value\) \? value : \[\]\)\.slice\(0, 50\)/);
});

test("advanced create page shows the optimizer for Wan and Seedance and writes back only on apply", () => {
  assert.match(advancedHtml, /id="advancedPromptOptimizeBtn"/);
  assert.match(advancedConfig, /advancedPromptOptimizeBtn:/);
  assert.match(advancedControls, /advancedPromptOptimizeBtn\.hidden = !window\.isPromptOptimizerProvider/);
  assert.match(advancedMain, /els\.advancedPromptOptimizeBtn\?\.addEventListener\("click"/);
  assert.match(advancedMain, /isPromptOptimizerProvider\?\.\(provider\)/);
  assert.match(advancedMain, /references: typeof advancedReferenceDisplayItems/);
  assert.match(advancedMain, /window\.setAdvancedPromptValue\?\.\(value, \{ emitInput: true, focus: true \}\)/);
});

test("React Flow, legacy workflow, and React bridge each expose the optimizer", () => {
  assert.match(reactFlow, /window\.isPromptOptimizerProvider\(model\.id\)/);
  assert.match(reactFlow, /window\.openPromptOptimizer/);
  assert.match(legacyEditor, /data-workflow-optimize-prompt/);
  assert.match(legacyEvents, /window\.openPromptOptimizer/);
  assert.match(legacyEvents, /workflowSetNodeData\(node\.id, \{ prompt: value \}\)/);
  assert.match(bridge, /window\.openPromptOptimizer/);
  assert.match(bridge, /node\.data\.prompt = value/);
});

test("Seedance optimizer preserves the source language and builds a dynamic media inventory", () => {
  const prompt = "林肆和沈屿川在办公室拥抱，林肆轻轻靠近沈屿川，镜头缓慢推近，气氛温柔。";
  const references = [
    { kind: "image", label: "图片1" },
    { kind: "image", label: "图片2" },
    { kind: "image", label: "图片3" },
    { kind: "video", label: "视频1" },
    { kind: "audio", label: "音频1" },
  ];
  const req = helpers.seedancePromptOptimizerRequest({ prompt, provider: "seedance25", language: "en", duration: 11, references });
  assert.equal(req.language, "zh");
  assert.equal(req.references.length, 5);
  assert.match(req.body.messages[0].content, /Seedance video-prompt rewrite engine/);
  assert.match(req.body.messages[0].content, /REFERENCE BINDING/);
  assert.match(req.body.messages[0].content, /conflict priority/);
  assert.match(req.body.messages[0].content, /水光肌/);
  assert.match(req.body.messages[1].content, /图片1 \(image\)[\s\S]*图片2 \(image\)[\s\S]*图片3 \(image\)[\s\S]*视频1 \(video\)[\s\S]*音频1 \(audio\)/);
  assert.match(req.body.messages[1].content, /ACTION BUDGET: Use 2-3 continuous actions/);
  assert.match(req.body.messages[1].content, /Keep the optimized prompt predominantly Chinese/);
  assert.doesNotMatch(req.body.messages[1].content, /fixed five|exactly 5 images/i);
});

test("Seedance optimizer normalizes scripts and returns a separate optional upload plan", () => {
  const prompt = "剧本：雨夜，林肆回到公寓，看到沈屿川在窗边等她。两人沉默对视，林肆走近，镜头缓慢推近，自然窗光，皮肤质感真实。";
  const req = helpers.seedancePromptOptimizerRequest({ prompt, provider: "seedance-nsfw" });
  assert.equal(req.references.length, 0);
  assert.match(req.body.messages[0].content, /INPUT NORMALIZATION/);
  assert.match(req.body.messages[0].content, /finished prompt, a short idea, loose tags, dialogue, or a full script/);
  assert.match(req.body.messages[0].content, /referencePlan/);
  assert.match(req.body.messages[0].content, /图片1：主角脸部身份参考/);
  assert.match(req.body.messages[1].content, /TEXT-ONLY PROMPT MODE: No reference media supplied/);
  assert.match(req.body.messages[1].content, /full script/);
  assert.match(req.body.messages[1].content, /assign sequential labels for each reusable identity, outfit, or scene/);
  assert.match(req.body.messages[1].content, /never leave people or recurring assets as vague 素材 references/);
  assert.match(req.body.messages[1].content, /Preserve explicit labels[\s\S]*declared roles\/conflict rules/);
  assert.match(req.body.messages[1].content, /referencePlan/);
  assert.match(req.body.messages[1].content, /Do not require uploads/);
  assert.doesNotMatch(req.body.messages[1].content, /exactly 5 images|fixed five/i);
});

test("Seedance optimizer preserves explicit source references in text-only mode", () => {
  const prompt = [
    "【素材绑定】",
    "图片1：角色A的脸部身份参考，只提供脸型、五官、发际线和骨相。",
    "图片2：角色A的全身服装参考，只提供身高、体型、服装款式和面料。",
    "【冲突规则】",
    "人物脸和身份发生冲突时，以图片1为准。",
    "服装发生冲突时，以图片2为准。",
  ].join("\n");
  const req = helpers.seedancePromptOptimizerRequest({ prompt, provider: "seedance25", duration: 12 });
  assert.equal(req.references.length, 0);
  assert.match(req.body.messages[0].content, /【素材绑定】/);
  assert.match(req.body.messages[0].content, /【冲突规则】/);
  assert.match(req.body.messages[0].content, /【画质与约束】/);
  assert.match(req.body.messages[0].content, /0—3秒 \/ 3—6秒 \/ 6—9秒 \/ 9—12秒/);
  const preserved = helpers.seedancePromptOptimizerNeutralizeInvalidReferences(
    "【素材绑定】\n图片1：角色A脸部身份参考。\n图片2：角色A服装参考。\n【冲突规则】\n脸部以图片1为准，服装以图片2为准。",
    [],
    prompt,
  );
  assert.deepEqual(preserved.invalid, []);
  assert.match(preserved.text, /图片1/);
  assert.match(preserved.text, /图片2/);
});

test("Seedance optimizer preserves explicit English image labels from the source", () => {
  const preserved = helpers.seedancePromptOptimizerNeutralizeInvalidReferences(
    "Image 1 controls facial identity. Image 2 controls wardrobe.",
    [],
    "Image 1: face identity reference. Image 2: full-body outfit reference.",
  );
  assert.deepEqual(preserved.invalid, []);
  assert.equal(preserved.text, "Image 1 controls facial identity. Image 2 controls wardrobe.");
});

test("Seedance optimizer assigns reference labels when a plain script omits them", () => {
  const prompt = "剧本：雨夜，林肆回到公寓，看到沈屿川在窗边等她。两人沉默对视，林肆走近，镜头缓慢推近，自然窗光，皮肤质感真实。";
  const req = helpers.seedancePromptOptimizerRequest({ prompt, provider: "seedance25", duration: 12 });
  assert.match(req.body.messages[0].content, /design the smallest useful reference binding inside optimizedPrompt/);
  assert.match(req.body.messages[0].content, /Any person with recurring identity needs 图片1\/图片2\/Image 1\/Image 2/);
  assert.match(req.body.messages[1].content, /You must make the rewritten prompt directly usable in Seedance/);
  assert.match(req.body.messages[1].content, /assign sequential labels for each reusable identity, outfit, or scene/);
  assert.match(req.body.messages[1].content, /identical ordered labels with their exact roles in referencePlan/);
  assert.match(req.body.messages[1].content, /The optimizer, not the user, is responsible for filling the Seedance reference plan/);
});

test("Seedance optimizer accepts labels that the model declares in its own material binding section", () => {
  const designed = helpers.seedancePromptOptimizerNeutralizeInvalidReferences(
    "【素材绑定】\n图片1：林肆脸部身份参考。\n图片2：林肆服装参考。\n图片3：沈屿川脸部身份参考。\n图片4：沈屿川服装参考。\n图片5：公寓场景参考。\n【冲突规则】\n脸部以图片1、图片3为准，服装以图片2、图片4为准，场景以图片5为准。",
    [],
    "雨夜，林肆回到公寓，看到沈屿川在窗边等她。",
  );
  assert.deepEqual(designed.invalid, []);
  assert.match(designed.text, /图片5/);
});

test("Seedance optimizer still removes labels that are used but never declared", () => {
  const invented = helpers.seedancePromptOptimizerNeutralizeInvalidReferences(
    "【素材绑定】\n图片1：主角脸部身份参考。\n【冲突规则】\n场景以图片2为准。",
    [],
    "雨夜，林肆回到公寓。",
  );
  assert.deepEqual(invented.invalid, ["图片2"]);
  assert.doesNotMatch(invented.text, /图片2/);
});

test("Seedance optimizer parses structured reference plans and never applies them to media", () => {
  const parsed = helpers.w3ParseOptimizerJson(JSON.stringify({
    optimizedPrompt: "人物坐在窗边，自然窗光。",
    notes: ["剧本压缩为单一连续镜头"],
    referencePlan: ["图片1：主角脸部身份参考", { label: "图片2：服装参考" }, ""],
  }));
  assert.deepEqual(parsed.referencePlan, ["图片1：主角脸部身份参考", "图片2：服装参考"]);
  assert.match(server, /referencePlan: seedanceRequest \? \(parsed\?\.referencePlan \|\| \[\]\) : \[\]/);
  assert.doesNotMatch(server, /referencePlan[\s\S]{0,120}(uploadFile|deleteFile|setAdvanced|applyReference)/i);
});

test("Seedance client shows optional upload suggestions without requiring uploads", () => {
  assert.match(client, /const hasReferences = Array\.isArray\(payload\.references\) && payload\.references\.length > 0/);
  assert.match(client, /纯文本提示词规则优化，素材可稍后添加/);
  assert.match(client, /data-prompt-optimizer-reference-plan/);
  assert.match(client, /建议补充素材（可选）/);
  assert.match(client, /result\.referencePlan/);
  assert.doesNotMatch(client, /请先上传(?:图片|素材)/);
});

test("prompt optimizer request branches by provider while W3 behavior remains intact", () => {
  const seedance = helpers.promptOptimizerRequestForPayload({ prompt: "a cinematic scene", provider: "seedance-nsfw" });
  const wan = helpers.promptOptimizerRequestForPayload({ prompt: "a cinematic scene", provider: "wan30" });
  assert.match(seedance.body.messages[0].content, /Seedance video-prompt rewrite engine/);
  assert.match(wan.body.messages[0].content, /W3 video-prompt rewrite engine/);
  assert.equal(helpers.seedancePromptOptimizerIsProvider("seedance-fast"), true);
  assert.equal(helpers.seedancePromptOptimizerIsProvider("wan30"), false);
});

test("Seedance optimizer rejects reference labels outside the supplied inventory", () => {
  const references = [{ kind: "image", label: "图片1" }, { kind: "image", label: "图片2" }];
  assert.deepEqual(helpers.seedancePromptOptimizerInvalidReferences("图片1控制脸，图片2控制服装。", references), []);
  assert.deepEqual(helpers.seedancePromptOptimizerInvalidReferences("图片1控制脸，图片3控制服装。", references), ["图片3"]);
  assert.deepEqual(helpers.seedancePromptOptimizerInvalidReferences("图片1控制脸，Video 2控制动作。", references), ["Video 2"]);
});

test("Seedance optimizer accepts equivalent Chinese and English reference labels", () => {
  const references = [{ kind: "image", label: "Image 1" }, { kind: "video", label: "Video 1" }];
  assert.deepEqual(helpers.seedancePromptOptimizerInvalidReferences("图片1控制脸，视频1控制动作。", references), []);
  assert.deepEqual(helpers.seedancePromptOptimizerInvalidReferences("图2控制脸。", references), ["图2"]);
});

test("Seedance optimizer neutralizes invented references without failing the request", () => {
  const noReferences = helpers.seedancePromptOptimizerNeutralizeInvalidReferences("图片1中的女生站在窗边，图片2控制服装。", []);
  assert.deepEqual(noReferences.invalid, ["图片1", "图片2"]);
  assert.equal(noReferences.text, "画面主体中的女生站在窗边，画面主体控制服装。");
  assert.deepEqual(helpers.seedancePromptOptimizerInvalidReferences(noReferences.text, []), []);
});

test("prompt optimizer retries one transient upstream failure and keeps the request bounded", async () => {
  const calls = [];
  const attemptHelpers = new Function("papayaLanguageRequest", [
    "const W3_PROMPT_MAX_CHARS = 5000;",
    "const W3_PROMPT_OPTIMIZER_MODEL = \"carrothub-papaya-1.0\";",
    "const PROMPT_OPTIMIZER_TOTAL_BUDGET_MS = 50000;",
    "const PROMPT_OPTIMIZER_UPSTREAM_TIMEOUT_MS = 25000;",
    "const PROMPT_OPTIMIZER_UPSTREAM_MAX_ATTEMPTS = 2;",
    "const PROMPT_OPTIMIZER_RETRYABLE_STATUS = new Set([408,425,429,500,502,503,504,520,522]);",
    "const delay = async () => {};",
    extractFunction(server, "promptOptimizerUpstreamIsRetryable"),
    extractFunction(server, "promptOptimizerPapayaRequest"),
    "return { promptOptimizerPapayaRequest, promptOptimizerUpstreamIsRetryable };",
  ].join("\n"))(async (body, options) => {
    calls.push({ body, options });
    if (calls.length === 1) throw Object.assign(new Error("temporary upstream failure"), { statusCode: 502 });
    return { choices: [{ message: { content: "ok" } }] };
  });
  const result = await attemptHelpers.promptOptimizerPapayaRequest({ prompt: "test" }, { deadline: Date.now() + 50000, requestContext: { requestId: "test" } });
  assert.equal(result.choices[0].message.content, "ok");
  assert.equal(calls.length, 2);
  assert.ok(calls.every((call) => call.options.timeoutMs <= 25000));
  assert.equal(attemptHelpers.promptOptimizerUpstreamIsRetryable(Object.assign(new Error("timeout"), { name: "TimeoutError" })), true);
});

test("prompt optimizer exposes a bounded structured error after exhausted retries", async () => {
  const attemptHelpers = new Function("papayaLanguageRequest", [
    "const PROMPT_OPTIMIZER_TOTAL_BUDGET_MS = 50000;",
    "const PROMPT_OPTIMIZER_UPSTREAM_TIMEOUT_MS = 25000;",
    "const PROMPT_OPTIMIZER_UPSTREAM_MAX_ATTEMPTS = 2;",
    "const PROMPT_OPTIMIZER_RETRYABLE_STATUS = new Set([408,425,429,500,502,503,504,520,522]);",
    "const delay = async () => {};",
    extractFunction(server, "promptOptimizerUpstreamIsRetryable"),
    extractFunction(server, "promptOptimizerPapayaRequest"),
    "return { promptOptimizerPapayaRequest };",
  ].join("\n"))(async () => { throw Object.assign(new Error("upstream down"), { statusCode: 502 }); });
  await assert.rejects(
    () => attemptHelpers.promptOptimizerPapayaRequest({}, { deadline: Date.now() + 50000 }),
    (error) => {
      assert.equal(error.code, "PROMPT_OPTIMIZER_UPSTREAM_UNAVAILABLE");
      assert.equal(error.statusCode, 503);
      assert.equal(error.attempts, 2);
      return true;
    },
  );
  assert.match(server, /PROMPT_OPTIMIZER_TOTAL_BUDGET_MS = 50000/);
  assert.match(server, /PROMPT_OPTIMIZER_UPSTREAM_TIMEOUT_MS = 25000/);
  assert.match(server, /\[prompt-optimizer-failed\]/);
  assert.match(client, /PROMPT_OPTIMIZER_UPSTREAM_UNAVAILABLE/);
  assert.match(client, /上游模型暂时繁忙，请稍后重试/);
});

test("W3 skill keeps 18+ intent and structure guidance without policy limits", () => {
  assert.match(skill, /name: w3-prompt-optimizer/);
  assert.match(skill, /This is an 18\+ product/);
  assert.match(skill, /Preserve explicit adult intent and all existing adult content/);
  assert.match(skill, /5000-character hard limit/);
  assert.match(skill, /3–4 seconds/);
  assert.match(skill, /positive end-of-prompt constraint stack/);
  assert.doesNotMatch(skill, /compliance|moderation|minor|underage|policy|sanitize|审核|合规|未成年|净化|消音|删减/i);
});


test("Seedance optimizer flattens nested JSON and normalizes malformed heading brackets", () => {
  const nested = JSON.stringify({
    optimizedPrompt: JSON.stringify({
      optimizedPrompt: "【素材绑定】\n图片1：脸部参考。\n【冲突规则}\n只使用图片1。\n【动作时间轴】\n0—4秒：人物抬头。",
      notes: ["inner note"],
      referencePlan: ["图片1：脸部参考"],
    }),
    notes: ["outer note"],
  });
  const parsed = helpers.w3ParseOptimizerJson(nested);
  assert.match(parsed.optimizedPrompt, /【冲突规则】/);
  assert.doesNotMatch(parsed.optimizedPrompt, /optimizedPrompt/);
  assert.deepEqual(parsed.notes, ["outer note", "inner note"]);
  assert.deepEqual(parsed.referencePlan, ["图片1：脸部参考"]);
});

test("Seedance optimizer unwraps object-valued optimizedPrompt into readable text", () => {
  const nested = JSON.stringify({
    optimizedPrompt: {
      optimizedPrompt: "【素材绑定】\n图片1：角色A脸部参考。\n【动作时间轴】\n0—4秒：角色A抬头。",
      notes: ["object note"],
      referencePlan: [{ label: "图片1：角色A脸部参考" }],
    },
  });
  const parsed = helpers.w3ParseOptimizerJson(nested);
  assert.match(parsed.optimizedPrompt, /^【素材绑定】/);
  assert.doesNotMatch(parsed.optimizedPrompt, /^\s*[{\[]/);
  assert.deepEqual(parsed.notes, ["object note"]);
  assert.deepEqual(parsed.referencePlan, ["图片1：角色A脸部参考"]);
  assert.equal(helpers.w3OptimizerReadablePrompt('"【主体】人物站在窗边。"'), "【主体】人物站在窗边。");
});

test("Seedance optimizer locks dialogue and uses the longest explicit duration", () => {
  const prompt = "15秒。林肆：你终于来了。\n沈屿川：外面下雨。\n0-5秒 两人在门口对视。";
  const req = helpers.seedancePromptOptimizerRequest({ prompt, provider: "seedance-nsfw", duration: 5 });
  assert.equal(req.duration, 15);
  assert.match(req.body.messages[1].content, /Duration: 15s/);
  assert.match(req.body.messages[1].content, /0—4秒 \/ 4—8秒 \/ 8—12秒 \/ 12—15秒/);
  assert.match(req.body.messages[1].content, /你终于来了/);
  assert.match(req.body.messages[1].content, /外面下雨/);
  assert.match(req.body.messages[1].content, /DIALOGUE LOCK/);
});

test("Seedance optimizer detects missing dialogue and short timelines and deterministically repairs them", () => {
  const source = "15秒。林肆：「你终于来了。」\n沈屿川：外面下雨。\n0-4秒 两人对视。";
  const output = "【素材绑定】\n图片1：林肆脸部参考。\n【动作时间轴】\n0—4秒：两人在门口对视。";
  const issues = helpers.seedancePromptOptimizerContentIssues(output, 15, source);
  assert.deepEqual(issues.map((issue) => issue.type), ["dialogue", "timeline"]);
  const repaired = helpers.seedancePromptOptimizerRepairContent(output, 15, source);
  assert.match(repaired, /你终于来了/);
  assert.match(repaired, /外面下雨/);
  assert.match(repaired, /15秒/);
  assert.equal(helpers.seedancePromptOptimizerContentIssues(repaired, 15, source).some((issue) => issue.type === "dialogue"), false);
});
