"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  VIDEO_TOOL_UNDRESS_EDIT_PROMPT,
  VIDEO_TOOL_UNDRESS_IMAGE_VIDEO_PROMPT,
  VIDEO_TOOL_UNDRESS_TARGET_PROMPT,
} = require("../video-tools");
const {
  DEFAULT_UNDRESS_PROMPTS,
  normalizeUndressPrompts,
  undressPromptForAction,
  validateUndressPrompts,
} = require("../undress-prompts");

test("Undress prompt config keeps current prompts as defaults", () => {
  assert.deepEqual(DEFAULT_UNDRESS_PROMPTS, {
    image: VIDEO_TOOL_UNDRESS_TARGET_PROMPT,
    imageVideo: VIDEO_TOOL_UNDRESS_IMAGE_VIDEO_PROMPT,
    video: VIDEO_TOOL_UNDRESS_EDIT_PROMPT,
  });
  assert.deepEqual(normalizeUndressPrompts(), DEFAULT_UNDRESS_PROMPTS);
});

test("Undress prompt config trims saved values and fills missing keys", () => {
  assert.deepEqual(normalizeUndressPrompts({ image: "  custom image prompt  " }), {
    image: "custom image prompt",
    imageVideo: VIDEO_TOOL_UNDRESS_IMAGE_VIDEO_PROMPT,
    video: VIDEO_TOOL_UNDRESS_EDIT_PROMPT,
  });
});

test("Undress prompt config rejects blank and oversized values when saving", () => {
  assert.throws(
    () => validateUndressPrompts({ ...DEFAULT_UNDRESS_PROMPTS, imageVideo: "   " }),
    (error) => error.code === "INVALID_UNDRESS_PROMPT" && error.field === "imageVideo",
  );
  assert.throws(
    () => validateUndressPrompts({ ...DEFAULT_UNDRESS_PROMPTS, video: "x".repeat(6001) }),
    (error) => error.code === "UNDRESS_PROMPT_TOO_LONG" && error.field === "video",
  );
});

test("Undress actions resolve to the configured prompt", () => {
  const prompts = {
    image: "image prompt",
    imageVideo: "image video prompt",
    video: "video prompt",
  };
  assert.equal(undressPromptForAction("undress", prompts), "image prompt");
  assert.equal(undressPromptForAction("undress-image-video", prompts), "image video prompt");
  assert.equal(undressPromptForAction("undress-video", prompts), "video prompt");
  assert.equal(undressPromptForAction("face-swap", prompts), "");
});

test("Server snapshots configured Undress prompts for async and recovered jobs", () => {
  const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  assert.match(server, /undressPrompts:\s*normalizeUndressPrompts/);
  assert.match(server, /prompt:\s*record\.finalPrompt\s*\|\|\s*record\.prompt/);
  assert.match(server, /prompt:\s*generation\.prompt/);
  assert.match(server, /prompt:\s*job\.prompt\s*\|\|\s*VIDEO_TOOL_UNDRESS_IMAGE_VIDEO_PROMPT/);
  assert.match(server, /undressVideo\s*\?\s*\(job\.prompt\s*\|\|\s*VIDEO_TOOL_UNDRESS_EDIT_PROMPT\)/);
});

test("Admin exposes one focused Undress prompt configuration route", () => {
  const adminHtml = fs.readFileSync(path.join(__dirname, "..", "admin.html"), "utf8");
  const adminJs = fs.readFileSync(path.join(__dirname, "..", "admin.js"), "utf8");
  assert.match(adminHtml, /data-route="undress-config"/);
  assert.match(adminJs, /id:\s*"undress-config"/);
  assert.match(adminJs, /function renderUndressConfig/);
  assert.match(adminJs, /undressPromptImage/);
  assert.match(adminJs, /undressPromptImageVideo/);
  assert.match(adminJs, /undressPromptVideo/);
});
