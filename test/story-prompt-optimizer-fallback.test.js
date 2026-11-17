"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const serverPart16 = read("server.parts/part-16.js");
const serverPart49 = read("server.parts/part-49.js");

function extractFunction(source, name) {
  const marker = new RegExp(`(?:^|\\n)(?:async\\s+)?function\\s+${name}\\s*\\(`);
  const match = marker.exec(source);
  assert.ok(match, `missing function ${name}`);
  let start = match.index + (source[match.index] === "\n" ? 1 : 0);
  if (source.slice(Math.max(0, start - 6), start) === "async ") start -= 6;
  const bodyStart = source.indexOf("{", source.indexOf(")", match.index));
  assert.ok(bodyStart >= 0, `missing body for ${name}`);
  let depth = 0;
  let quote = "";
  let regex = false;
  let templateDepth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    const previous = source.slice(bodyStart, index).trimEnd().slice(-1);
    if (quote) {
      if (char === "\\") index += 1;
      else if (quote === "`" && char === "$" && source[index + 1] === "{") {
        templateDepth += 1;
        index += 1;
      } else if (quote === "`" && templateDepth && char === "}") {
        templateDepth -= 1;
      } else if (char === quote && !templateDepth) {
        quote = "";
      }
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
    if (char === "/" && /[=(:,!&|?{};+\-*%^~<>]/.test(previous)) {
      regex = true;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}" && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`unterminated function ${name}`);
}

test("Papaya HTTP 200 content security blocks become PAPAYA_CONTENT_BLOCKED", async () => {
  const papayaLanguageRequest = new Function("fetch", "AbortSignal", "process", [
    extractFunction(serverPart16, "papayaLanguageRequest"),
    "return papayaLanguageRequest;",
  ].join("\n"))(
    async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        code: "451",
        message: "Content blocked by security check (political_cn_entity,political_cn_entity)",
      }),
    }),
    AbortSignal,
    { env: { MULEROUTER_API_KEY: "test-key" } },
  );

  await assert.rejects(papayaLanguageRequest({ messages: [] }, { timeoutMs: 5000 }), (error) => {
    assert.equal(error.code, "PAPAYA_CONTENT_BLOCKED");
    assert.equal(error.statusCode, 451);
    assert.match(error.message, /political_cn_entity/);
    return true;
  });
});

function loadStoryPromptOptimizer() {
  const calls = [];
  const models = {
    "carrothub-papaya-1.0": {
      id: "carrothub-papaya-1.0",
      label: "Papaya 1.0",
      upstreamModel: "carrothub-papaya-1.0",
      configured: () => true,
    },
    "qwen3.7-flash": {
      id: "qwen3.7-flash",
      label: "Qwen3.7 Flash",
      upstreamModel: "qwen3.7-flash",
      configured: () => true,
    },
  };
  const fn = new Function(
    "PROMPT_OPTIMIZER_MODELS",
    "PROMPT_OPTIMIZER_TOTAL_BUDGET_MS",
    "W3_PROMPT_MAX_CHARS",
    "calls",
    [
      "let upstreamImpl = null;",
      "const promptOptimizerUpstreamRequest = async (body, options) => {",
      "  calls.push({ model: body.model, optimizerModel: options.optimizerModel.id, context: options.requestContext });",
      "  if (!upstreamImpl) throw new Error('test upstream is not configured');",
      "  return upstreamImpl(body, options);",
      "};",
      "const promptOptimizerSelectedModel = (id) => PROMPT_OPTIMIZER_MODELS[id] || null;",
      "const seedancePromptOptimizerIsProvider = (provider) => /^seedance/.test(String(provider || ''));",
      "const promptOptimizerRequestForPayload = (payload) => ({ originalPrompt: String(payload.prompt || '').trim(), duration: payload.duration, language: 'zh', body: { messages: [{ role: 'user', content: payload.prompt }] } });",
      "const w3PromptOptimizerText = (raw) => String(raw?.choices?.[0]?.message?.content || '');",
      "const w3ParseOptimizerJson = () => null;",
      "const w3OptimizerReadablePrompt = (text) => text;",
      "const w3PromptIsMostlyChinese = () => true;",
      "const seedancePromptOptimizerRepairContent = (text) => text;",
      "const w3NormalizeOptimizerPromptFormatting = (text) => text;",
      "const w3TruncatePrompt = (text) => text;",
      "const w3NormalizeConstraintStack = (text) => text;",
      "const w3NormalizeWanPromptFormatting = (text) => text;",
      extractFunction(serverPart49, "scaleStoryPromptForProvider"),
      extractFunction(serverPart49, "optimizeStoryShotPrompt"),
      "return { optimizeStoryShotPrompt, calls, setUpstream(fn) { upstreamImpl = fn; } };",
    ].join("\n"),
  )(
    models,
    170000,
    5000,
    calls,
  );
  return fn;
}

test("story shot prompt optimization falls back to Qwen only for Papaya security blocks", async () => {
  const helpers = loadStoryPromptOptimizer();
  helpers.setUpstream(async () => {
    if (helpers.calls.length === 1) {
      throw Object.assign(new Error("Prompt optimizer upstream failed."), {
        statusCode: 503,
        code: "PROMPT_OPTIMIZER_UPSTREAM_UNAVAILABLE",
        upstreamCode: "PAPAYA_CONTENT_BLOCKED",
        cause: { code: "PAPAYA_CONTENT_BLOCKED" },
      });
    }
    return { choices: [{ message: { content: "学校办公室里，负责人把文件推到桌面中央，镜头缓慢推进。" } }] };
  });

  const result = await helpers.optimizeStoryShotPrompt({
    prompt: "学校办公室里，负责人把文件推到桌面中央，镜头缓慢推进。",
    provider: "seedance-nsfw",
    providerLabel: "Seedance 2.5",
    duration: 9,
    optimizerModelId: "carrothub-papaya-1.0",
  });

  assert.equal(helpers.calls.length, 2);
  assert.equal(helpers.calls[0].model, "carrothub-papaya-1.0");
  assert.equal(helpers.calls[1].model, "qwen3.7-flash");
  assert.equal(helpers.calls[1].context.fallbackFrom, "carrothub-papaya-1.0");
  assert.equal(result.model, "qwen3.7-flash");
  assert.equal(result.fallbackFrom, "carrothub-papaya-1.0");
  assert.equal(result.fallbackReason, "papaya_content_blocked");
});

test("story shot prompt optimization does not hide non-security upstream failures", async () => {
  const helpers = loadStoryPromptOptimizer();
  helpers.setUpstream(async () => {
    throw Object.assign(new Error("Prompt optimizer upstream failed."), {
      statusCode: 503,
      code: "PROMPT_OPTIMIZER_UPSTREAM_UNAVAILABLE",
      upstreamCode: "ETIMEDOUT",
    });
  });

  await assert.rejects(() => helpers.optimizeStoryShotPrompt({
    prompt: "办公室内，人物把文件推到桌面中央。",
    provider: "seedance-nsfw",
    duration: 5,
    optimizerModelId: "carrothub-papaya-1.0",
  }), /Prompt optimizer upstream failed/);
  assert.equal(helpers.calls.length, 1);
});
