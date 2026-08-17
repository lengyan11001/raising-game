"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
const html = fs.readFileSync(path.join(root, "platform.html"), "utf8");
const ui = fs.readFileSync(path.join(root, "platform.ui.js"), "utf8");
const create = fs.readFileSync(path.join(root, "platform.create.js"), "utf8");

test("Qwen3.7 Flash is available as a text-only Advanced model", () => {
  assert.match(html, /<option value="qwen37-flash">Qwen3\.7 Flash<\/option>/);
  assert.match(html, /id="advancedQwen37Thinking"[\s\S]*?<option value="false" selected>Off<\/option>/);
  assert.match(html, /id="advancedQwen37MaxTokens"/);
  assert.match(html, /id="advancedQwen37Temperature"/);
  assert.match(create, /if \(provider === "qwen37-flash"\) return \[\];/);
  assert.match(create, /\|\| isQwenText\s*\|\| usesDedicatedFrameUpload/);
});

test("Qwen3.7 Flash uses the Singapore OpenAI-compatible endpoint", () => {
  assert.match(server, /ALIYUN_QWEN37_BASE_URL/);
  assert.match(server, /\/compatible-mode\/v1\/chat\/completions/);
  assert.match(server, /authorization: `Bearer \$\{ALIYUN_QWEN37_API_KEY\}`/);
  assert.match(server, /"X-DashScope-DataInspection": ALIYUN_DASHSCOPE_DATA_INSPECTION_HEADER/);
  assert.match(server, /model: QWEN37_FLASH_MODEL,[\s\S]*messages: \[\{ role: "user", content: prompt \}\]/);
  assert.match(server, /enable_thinking: enableThinking === true/);
  assert.match(server, /max_tokens: maxTokens/);
});

test("Qwen3.7 Flash bills from actual token usage and exposes text results", () => {
  assert.match(server, /maxInputTokens: 32768, input: 0\.225, output: 0\.974/);
  assert.match(server, /function qwen37FlashUsage/);
  assert.match(server, /settleQwen37FlashUsage/);
  assert.match(server, /promptTokens: usage\.promptTokens/);
  assert.match(server, /completionTokens: usage\.completionTokens/);
  assert.match(server, /textResult,[\s\S]*responseText: textResult/);
  assert.match(create, /class="advanced-result-text"/);
  assert.match(create, /function renderAdvancedResultPanel\(\)[\s\S]*?querySelectorAll\("\[data-advanced-result-copy\]"\)/);
  assert.match(ui, /normalizedProvider === "qwen37-flash"/);
});

test("Qwen3.7 Flash estimate uses the estimate request parameters", () => {
  const start = server.indexOf("async function handleAdvancedEstimate(");
  const end = server.indexOf("async function buildTemplateModelDoc(", start);
  const handler = server.slice(start, end);
  assert.match(handler, /Buffer\.byteLength\(String\(params\.prompt \|\| ""\)/);
  assert.match(handler, /firstPresent\(params\.outputTokens, params\.max_tokens, params\.maxTokens, 1024\)/);
  assert.doesNotMatch(handler, /bodyParams/);
});
