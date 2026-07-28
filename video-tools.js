"use strict";

const VIDEO_EDIT_SEGMENT_MAX_SECONDS = 10;

const VIDEO_TOOL_FACE_SWAP_PROMPT = [
  "Use the source video as the exact timeline, motion, action, pose, camera, framing, scene, lighting, cuts, and audio reference.",
  "Replace only the main adult subject's facial identity with the identity from the reference image.",
  "Preserve the source video's duration and every major action beat at the same relative timestamp.",
  "Keep the result temporally stable and photorealistic, with consistent facial identity in every frame.",
  "Do not change the body, clothing, background, camera motion, pacing, or audio unless required to blend the new face naturally.",
  "No text, subtitles, logos, watermarks, split screens, or extra people.",
].join(" ");

const IMAGE_TOOL_FACE_SWAP_PROMPT = [
  "Image 1 is the target photo. Preserve its composition, body, pose, clothing, hairstyle, background, lighting, camera angle, and image style.",
  "Image 2 is the facial identity reference. Replace only the main adult subject's facial identity in Image 1 with Image 2.",
  "Preserve Image 2's facial structure, eyes, eyebrows, nose, mouth, jawline, skin tone, and recognizable identity.",
  "Blend the new face naturally into Image 1 with matching perspective, expression, lighting, skin texture, and resolution.",
  "Do not change anything else in Image 1. Produce one photorealistic full-frame image, not a collage, comparison, split screen, or text layout.",
  "No text, subtitles, logos, watermarks, extra people, duplicated faces, or distorted facial features.",
].join(" ");

const VIDEO_TOOL_UNDRESS_KEYFRAME_PROMPT = [
  "Use Image 1 as the exact same consenting adult subject identity reference.",
  "Create the opening keyframe before clothing removal, preserving the clothing and outfit from Image 1.",
  "Render one photorealistic full-frame image with the same person, face, hairstyle, body type, lighting, and camera direction.",
  "Set up a natural cinematic standing pose suitable for an undress video.",
  "Do not create a collage, split screen, storyboard, text, subtitles, watermark, UI, or multiple frames.",
].join(" ");

const VIDEO_TOOL_UNDRESS_TARGET_PROMPT = [
  "Use Image 1 as the exact same keyframe, consenting adult subject, face, hairstyle, body type, camera angle, lighting, and background.",
  "Create one photorealistic target frame in the same scene and composition after the subject has removed all clothing and is nude.",
  "Keep identity, framing, pose continuity, scene, camera direction, and lighting consistent with Image 1.",
  "Do not redesign the person or scene. No text, watermark, collage, or split screen.",
].join(" ");

const VIDEO_TOOL_UNDRESS_VIDEO_PROMPT = [
  "Image 1 is the exact consenting adult subject identity and nude target state.",
  "Generate a natural cinematic undress sequence in which the same subject removes clothing and reaches that target state.",
  "Preserve the same face, body, hairstyle, scene, lighting, framing, and camera direction throughout.",
  "When a reference video is present, follow it for motion, pacing, pose changes, and camera movement while preserving Image 1 identity first.",
  "Smooth realistic motion, stable anatomy, no text, subtitles, logos, watermarks, split screens, or extra people.",
].join(" ");

function positiveDuration(value) {
  const duration = Number(value);
  return Number.isFinite(duration) && duration > 0 ? duration : 0;
}

function roundSeconds(value, precision = 4) {
  const factor = 10 ** precision;
  return Math.round(Number(value || 0) * factor) / factor;
}

function planVideoEditSegments(durationSeconds, maxSeconds = VIDEO_EDIT_SEGMENT_MAX_SECONDS) {
  const total = positiveDuration(durationSeconds);
  const segmentLimit = positiveDuration(maxSeconds);
  if (!total) throw new TypeError("Video duration must be greater than zero.");
  if (!segmentLimit) throw new TypeError("Segment duration limit must be greater than zero.");

  const segments = [];
  let startSeconds = 0;
  while (startSeconds < total - 0.0001) {
    const inputSeconds = Math.min(segmentLimit, total - startSeconds);
    const outputSeconds = Math.max(1, Math.min(segmentLimit, Math.round(inputSeconds)));
    segments.push({
      index: segments.length,
      startSeconds: roundSeconds(startSeconds),
      inputSeconds: roundSeconds(inputSeconds),
      outputSeconds,
    });
    startSeconds += inputSeconds;
  }
  return segments;
}

module.exports = {
  VIDEO_EDIT_SEGMENT_MAX_SECONDS,
  VIDEO_TOOL_FACE_SWAP_PROMPT,
  IMAGE_TOOL_FACE_SWAP_PROMPT,
  VIDEO_TOOL_UNDRESS_KEYFRAME_PROMPT,
  VIDEO_TOOL_UNDRESS_TARGET_PROMPT,
  VIDEO_TOOL_UNDRESS_VIDEO_PROMPT,
  planVideoEditSegments,
};
