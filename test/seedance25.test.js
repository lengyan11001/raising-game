const assert = require("node:assert/strict");
const test = require("node:test");

const {
  SEEDANCE25_POINTS_PER_SECOND,
  buildSeedance25TaskPayload,
  purchaseSiteCreditsPerSecond,
  validateSeedance25Input,
} = require("../seedance25");

const OUTER_MODEL = "st-ai/super-seed2-lite";

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
  assert.deepEqual(SEEDANCE25_POINTS_PER_SECOND, { "480p": 130, "720p": 260 });
  assert.equal(purchaseSiteCreditsPerSecond("480p"), 19.490255);
  assert.equal(purchaseSiteCreditsPerSecond("720p"), 38.98051);
  assert.equal(Number((purchaseSiteCreditsPerSecond("480p") * 4).toFixed(6)), 77.96102);
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
    model: "Seedance_2.5",
    functionMode: "omini",
    prompt: "Use Image 1 as the subject.",
    resolution: "480p",
    ratio: "9:16",
    duration: 4,
    image_files: ["https://cdn.example.com/image-1.png", "https://cdn.example.com/image-2.png"],
    video_files: ["https://cdn.example.com/video-1.mp4"],
    audio_files: ["https://cdn.example.com/audio-1.mp3"],
    seed: 42,
  });
  assert.equal("generate_audio" in payload.params, false);
});

test("video edit sends exactly one transferred video and omits duration and ratio", () => {
  const payload = buildSeedance25TaskPayload(baseInput({
    mode: "edit",
    imageFiles: [],
    videoFiles: ["https://cdn.example.com/transferred.mp4"],
    duration: 27,
  }), OUTER_MODEL);

  assert.deepEqual(payload.params, {
    model: "Seedance_2.5",
    functionMode: "edit",
    prompt: "Use Image 1 as the subject.",
    resolution: "480p",
    video_url: "https://cdn.example.com/transferred.mp4",
  });
});

test("video extend sends one video with adaptive ratio and extension duration", () => {
  const payload = buildSeedance25TaskPayload(baseInput({
    mode: "extend",
    imageFiles: [],
    videoFiles: ["https://cdn.example.com/source.mp4"],
    duration: 12,
  }), OUTER_MODEL);

  assert.equal(payload.params.functionMode, "extend");
  assert.equal(payload.params.video_url, "https://cdn.example.com/source.mp4");
  assert.equal(payload.params.ratio, "adaptive");
  assert.equal(payload.params.duration, 12);
});

test("first and last frame mode is exclusive and uses adaptive ratio", () => {
  const payload = buildSeedance25TaskPayload(baseInput({
    mode: "first_last_frame",
    imageFiles: [],
    firstFrameUrl: "https://cdn.example.com/first.png",
    lastFrameUrl: "https://cdn.example.com/last.png",
    duration: 8,
  }), OUTER_MODEL);

  assert.equal(payload.params.functionMode, "first_last_frame");
  assert.equal(payload.params.image_url, "https://cdn.example.com/first.png");
  assert.equal(payload.params.end_image_url, "https://cdn.example.com/last.png");
  assert.equal(payload.params.ratio, "adaptive");
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

test("mode-specific validation rejects mixed frame and edit references", () => {
  assert.throws(
    () => validateSeedance25Input(baseInput({
      mode: "first_last_frame",
      firstFrameUrl: "https://cdn.example.com/first.png",
      lastFrameUrl: "https://cdn.example.com/last.png",
    })),
    (error) => error.code === "SEEDANCE25_INVALID_MEDIA_COMBINATION",
  );
  assert.throws(
    () => validateSeedance25Input(baseInput({ mode: "edit", imageFiles: [], videoFiles: [] })),
    (error) => error.code === "SEEDANCE25_SOURCE_VIDEO_REQUIRED",
  );
});

test("duration, resolution, prompt length, and seed constraints are enforced", () => {
  assert.throws(() => validateSeedance25Input(baseInput({ duration: 3 })), (error) => error.code === "SEEDANCE25_INVALID_DURATION");
  assert.throws(() => validateSeedance25Input(baseInput({ duration: 31 })), (error) => error.code === "SEEDANCE25_INVALID_DURATION");
  assert.throws(() => validateSeedance25Input(baseInput({ resolution: "1080p" })), (error) => error.code === "SEEDANCE25_INVALID_RESOLUTION");
  assert.throws(() => validateSeedance25Input(baseInput({ prompt: "x".repeat(6001) })), (error) => error.code === "SEEDANCE25_PROMPT_TOO_LONG");
  assert.throws(() => validateSeedance25Input(baseInput({ seed: -1 })), (error) => error.code === "SEEDANCE25_INVALID_SEED");
  assert.throws(() => validateSeedance25Input(baseInput({ seed: 4294967296 })), (error) => error.code === "SEEDANCE25_INVALID_SEED");
});
