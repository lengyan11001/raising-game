const assert = require("node:assert/strict");
const test = require("node:test");

const {
  SEEDANCE_NO_BGM_INSTRUCTION,
  seedanceContentWithNoBgm,
  seedancePromptWithNoBgm,
} = require("../seedance-prompt");

test("Seedance audio constraint is appended once and preserves @ references", () => {
  const prompt = "@image1 runs toward @image2 while @video1 keeps the camera moving";
  const augmented = seedancePromptWithNoBgm(prompt);

  assert.ok(augmented.startsWith(prompt));
  assert.ok(augmented.includes(SEEDANCE_NO_BGM_INSTRUCTION));
  assert.equal(seedancePromptWithNoBgm(augmented), augmented);
});

test("Seedance content gets one text constraint without changing media order", () => {
  const content = seedanceContentWithNoBgm([
    { type: "text", text: "Use @image1 as the subject" },
    { type: "image_url", image_url: { url: "asset://image-1" }, role: "reference_image" },
  ]);

  assert.equal(content[0].text, seedancePromptWithNoBgm("Use @image1 as the subject"));
  assert.equal(content[1].role, "reference_image");
  assert.equal(seedanceContentWithNoBgm(content)[0].text, content[0].text);
});
