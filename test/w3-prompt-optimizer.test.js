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
  let start = source.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`missing function ${name}`);
  let parenDepth = 0;
  let bodyStart = -1;
  for (let index = source.indexOf("(", start); index < source.length; index += 1) {
    if (source[index] === "(") parenDepth += 1;
    else if (source[index] === ")") {
      parenDepth -= 1;
      if (parenDepth === 0) {
        bodyStart = source.indexOf("{", index);
        break;
      }
    }
  }
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`unterminated function ${name}`);
}

const helpers = new Function([
  "const W3_PROMPT_MAX_CHARS = 5000;",
  "const W3_PROMPT_OPTIMIZER_MODEL = \"carrothub-papaya-1.0\";",
  `const W3_PROMPT_OPTIMIZER_SYSTEM_PROMPT = ${JSON.stringify(server.slice(server.indexOf("const W3_PROMPT_OPTIMIZER_SYSTEM_PROMPT = `") + "const W3_PROMPT_OPTIMIZER_SYSTEM_PROMPT = `".length, server.indexOf("`;\n\nfunction w3PromptOptimizerText")))};`,
  extractFunction(server, "w3ParseOptimizerJson"),
  extractFunction(server, "w3PromptHasChinese"),
  extractFunction(server, "w3NormalizeConstraintStack"),
  extractFunction(server, "w3TruncatePrompt"),
  extractFunction(server, "w3PromptIsMostlyChinese"),
  extractFunction(server, "w3PromptOptimizerLanguage"),
  extractFunction(server, "w3PromptOptimizerRequest"),
  "return { w3ParseOptimizerJson, w3TruncatePrompt, w3PromptIsMostlyChinese, w3PromptOptimizerLanguage, w3PromptOptimizerRequest, w3NormalizeConstraintStack };",
].join("\n"))();

test("optimizer route is authenticated in front of generate and uses Papaya", () => {
  const optimize = route.indexOf('url.pathname === "/api/advanced/prompt-optimize"');
  const generate = route.indexOf('url.pathname === "/api/advanced/generate"');
  assert.ok(optimize > 0 && optimize < generate);
  assert.match(route, /handleAdvancedPromptOptimize\(req, res\)/);
  assert.match(server, /carrothub-papaya-1\.0/);
  assert.match(server, /const auth = await requireUser\(req, res\);\s*if \(!auth\) return;/);
  assert.match(server, /papayaLanguageRequest\(requestAttempt\.body/);
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
  });
  assert.deepEqual(helpers.w3ParseOptimizerJson('```json\n{"optimizedPrompt":"two","notes":[]}\n```'), {
    optimizedPrompt: "two",
    notes: [],
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

test("advanced create page shows the optimizer only for Wan and writes back on apply", () => {
  assert.match(advancedHtml, /id="advancedPromptOptimizeBtn"/);
  assert.match(advancedConfig, /advancedPromptOptimizeBtn:/);
  assert.match(advancedControls, /advancedPromptOptimizeBtn\.hidden = !window\.isWanPromptOptimizerProvider/);
  assert.match(advancedMain, /els\.advancedPromptOptimizeBtn\?\.addEventListener\("click"/);
  assert.match(advancedMain, /window\.setAdvancedPromptValue\?\.\(value, \{ emitInput: true, focus: true \}\)/);
});

test("React Flow, legacy workflow, and React bridge each expose the optimizer", () => {
  assert.match(reactFlow, /window\.isWanPromptOptimizerProvider\(model\.id\)/);
  assert.match(reactFlow, /window\.openPromptOptimizer/);
  assert.match(legacyEditor, /data-workflow-optimize-prompt/);
  assert.match(legacyEvents, /window\.openPromptOptimizer/);
  assert.match(legacyEvents, /workflowSetNodeData\(node\.id, \{ prompt: value \}\)/);
  assert.match(bridge, /window\.openPromptOptimizer/);
  assert.match(bridge, /node\.data\.prompt = value/);
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
