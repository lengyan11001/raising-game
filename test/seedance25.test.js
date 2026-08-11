const assert = require("node:assert/strict");
const test = require("node:test");

const {
  SEEDANCE25_MODEL,
  SEEDANCE25_POINTS_PER_SECOND,
  buildSeedance25TaskPayload,
  purchaseSiteCreditsPerSecond,
  validateSeedance25Input,
} = require("../seedance25");

const OUTER_MODEL = SEEDANCE25_MODEL;

function baseInput(overrides = {}) {
  return {
    mode: "omini",
    prompt: "Use Image 1 as the subject.",
    ratio: "9:16",
    resolution: "480p",
    duration: 4,
    imageFiles: ["https://cdn.example.com/image-1.png"],
    ...overrides,
  };
}

test("Seedance 2.5 APIZ points are converted through CNY and USD to site credits", () => {
  assert.deepEqual(SEEDANCE25_POINTS_PER_SECOND, { "480p": 60, "720p": 100 });
  assert.equal(purchaseSiteCreditsPerSecond("480p"), 8.995502);
  assert.equal(purchaseSiteCreditsPerSecond("720p"), 14.992504);
  assert.equal(Number((purchaseSiteCreditsPerSecond("480p") * 4).toFixed(6)), 35.982008);
});

test("multimodal payload preserves ordered media and supported parameters", () => {
  const payload = buildSeedance25TaskPayload(baseInput({
    imageFiles: ["https://cdn.example.com/image-1.png", "https://cdn.example.com/image-2.png"],
    videoFiles: ["https://cdn.example.com/video-1.mp4"],
    audioFiles: ["https://cdn.example.com/audio-1.mp3"],
    seed: 42,
  }), OUTER_MODEL);

  assert.equal(payload.model, OUTER_MODEL);
  assert.deepEqual(payload.params, {
    prompt: "Use Image 1 as the subject.",
    duration: 4,
    resolution: "480P",
    aspect_ratio: "9:16",
    audio: true,
    reference_image_urls: ["https://cdn.example.com/image-1.png", "https://cdn.example.com/image-2.png"],
    reference_video_urls: ["https://cdn.example.com/video-1.mp4"],
    reference_audio_urls: ["https://cdn.example.com/audio-1.mp3"],
  });
  assert.equal("functionMode" in payload.params, false);
  assert.equal("model" in payload.params, false);
});

test("unsupported legacy edit and extend modes are rejected", () => {
  for (const mode of ["edit", "extend"]) {
    assert.throws(
      () => validateSeedance25Input(baseInput({ mode })),
      (error) => error.code === "SEEDANCE25_INVALID_MODE",
    );
  }
});

test("first and last frame mode uses the public APIZ fields", () => {
  const payload = buildSeedance25TaskPayload(baseInput({
    mode: "first_last_frame",
    imageFiles: [],
    firstFrameUrl: "https://cdn.example.com/first.png",
    lastFrameUrl: "https://cdn.example.com/last.png",
    duration: 8,
  }), OUTER_MODEL);

  assert.equal(payload.params.image_url, "https://cdn.example.com/first.png");
  assert.equal(payload.params.end_image_url, "https://cdn.example.com/last.png");
  assert.equal(payload.params.aspect_ratio, "9:16");
  assert.equal(payload.params.duration, 8);
});

test("multimodal validation enforces reference limits and rejects audio-only input", () => {
  assert.throws(
    () => validateSeedance25Input(baseInput({ imageFiles: [], audioFiles: ["https://cdn.example.com/audio.mp3"] })),
    (error) => error.code === "SEEDANCE25_AUDIO_ONLY_UNSUPPORTED",
  );
  assert.throws(
    () => validateSeedance25Input(baseInput({ imageFiles: Array.from({ length: 31 }, (_, index) => `https://cdn.example.com/${index}.png`) })),
    (error) => error.code === "SEEDANCE25_TOO_MANY_IMAGES",
  );
  const maximum = validateSeedance25Input(baseInput({
    imageFiles: Array.from({ length: 30 }, (_, index) => `https://cdn.example.com/image-${index}.png`),
    videoFiles: Array.from({ length: 10 }, (_, index) => `https://cdn.example.com/video-${index}.mp4`),
    audioFiles: Array.from({ length: 10 }, (_, index) => `https://cdn.example.com/audio-${index}.mp3`),
  }));
  assert.equal(maximum.images.length + maximum.videos.length + maximum.audios.length, 50);
});

test("frame validation rejects mixed references", () => {
  assert.throws(
    () => validateSeedance25Input(baseInput({
      mode: "first_last_frame",
      firstFrameUrl: "https://cdn.example.com/first.png",
      lastFrameUrl: "https://cdn.example.com/last.png",
    })),
    (error) => error.code === "SEEDANCE25_INVALID_MEDIA_COMBINATION",
  );
});

test("resolution-specific duration and prompt limits are enforced", () => {
  assert.throws(() => validateSeedance25Input(baseInput({ duration: 3 })), (error) => error.code === "SEEDANCE25_INVALID_DURATION");
  assert.throws(() => validateSeedance25Input(baseInput({ duration: 31 })), (error) => error.code === "SEEDANCE25_INVALID_DURATION");
  assert.throws(() => validateSeedance25Input(baseInput({ resolution: "720p", duration: 30 })), (error) => error.code === "SEEDANCE25_INVALID_DURATION");
  assert.equal(validateSeedance25Input(baseInput({ resolution: "480p", duration: 30 })).duration, 30);
  assert.equal(validateSeedance25Input(baseInput({ resolution: "720p", duration: 29 })).duration, 29);
  assert.throws(() => validateSeedance25Input(baseInput({ resolution: "1080p" })), (error) => error.code === "SEEDANCE25_INVALID_RESOLUTION");
  assert.throws(() => validateSeedance25Input(baseInput({ prompt: "x".repeat(5001) })), (error) => error.code === "SEEDANCE25_PROMPT_TOO_LONG");
});
