"use strict";

const SEEDANCE_NO_BGM_INSTRUCTION = "Audio constraint: Do not generate background music (BGM), soundtrack, or any music. If audio is enabled, include only dialogue, voice, and natural diegetic sound effects explicitly described in the prompt.";

function seedancePromptWithNoBgm(value = "") {
  const prompt = String(value || "").trim();
  if (!prompt) return "";
  if (/do not generate background music \(bgm\)/i.test(prompt)) return prompt;
  return `${prompt}\n\n${SEEDANCE_NO_BGM_INSTRUCTION}`;
}

function seedanceContentWithNoBgm(content = []) {
  const items = Array.isArray(content) ? content : [];
  let updated = false;
  const next = items.map((item) => {
    if (updated || !item || typeof item !== "object" || Array.isArray(item)) return item;
    if (item.type !== "text" && item.text === undefined) return item;
    updated = true;
    return { ...item, text: seedancePromptWithNoBgm(item.text) };
  });
  return next;
}

module.exports = {
  SEEDANCE_NO_BGM_INSTRUCTION,
  seedanceContentWithNoBgm,
  seedancePromptWithNoBgm,
};
