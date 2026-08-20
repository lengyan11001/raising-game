"use strict";

const {
  VIDEO_TOOL_UNDRESS_EDIT_PROMPT,
  VIDEO_TOOL_UNDRESS_IMAGE_VIDEO_PROMPT,
  VIDEO_TOOL_UNDRESS_TARGET_PROMPT,
} = require("./video-tools");

const UNDRESS_PROMPT_MAX_LENGTH = 6000;
const UNDRESS_PROMPT_FIELDS = Object.freeze(["image", "imageVideo", "video"]);
const DEFAULT_UNDRESS_PROMPTS = Object.freeze({
  image: VIDEO_TOOL_UNDRESS_TARGET_PROMPT,
  imageVideo: VIDEO_TOOL_UNDRESS_IMAGE_VIDEO_PROMPT,
  video: VIDEO_TOOL_UNDRESS_EDIT_PROMPT,
});

function normalizedPrompt(value, fallback = "") {
  const prompt = typeof value === "string" ? value.trim() : "";
  return prompt || fallback;
}

function normalizeUndressPrompts(value = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    image: normalizedPrompt(source.image, DEFAULT_UNDRESS_PROMPTS.image),
    imageVideo: normalizedPrompt(source.imageVideo, DEFAULT_UNDRESS_PROMPTS.imageVideo),
    video: normalizedPrompt(source.video, DEFAULT_UNDRESS_PROMPTS.video),
  };
}

function validateUndressPrompts(value = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const next = {};
  for (const field of UNDRESS_PROMPT_FIELDS) {
    const prompt = typeof source[field] === "string" ? source[field].trim() : "";
    if (!prompt) {
      const error = new TypeError("Undress prompts cannot be empty.");
      error.code = "INVALID_UNDRESS_PROMPT";
      error.field = field;
      throw error;
    }
    if (prompt.length > UNDRESS_PROMPT_MAX_LENGTH) {
      const error = new RangeError(`Undress prompts cannot exceed ${UNDRESS_PROMPT_MAX_LENGTH} characters.`);
      error.code = "UNDRESS_PROMPT_TOO_LONG";
      error.field = field;
      throw error;
    }
    next[field] = prompt;
  }
  return next;
}

function undressPromptForAction(action = "", value = {}) {
  const prompts = normalizeUndressPrompts(value);
  const keyByAction = {
    undress: "image",
    "undress-image-video": "imageVideo",
    "undress-video": "video",
  };
  const key = keyByAction[String(action || "").trim().toLowerCase()];
  return key ? prompts[key] : "";
}

module.exports = {
  DEFAULT_UNDRESS_PROMPTS,
  UNDRESS_PROMPT_FIELDS,
  UNDRESS_PROMPT_MAX_LENGTH,
  normalizeUndressPrompts,
  undressPromptForAction,
  validateUndressPrompts,
};
