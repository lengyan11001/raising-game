"use strict";

const SEEDANCE_REFERENCE_VIDEO_MIN_SECONDS = 1.8;
const SEEDANCE_REFERENCE_VIDEO_MAX_SECONDS = 15.2;

function finitePositiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function pngBufferHasTransparency(bytes) {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes || []);
  if (buffer.length < 33 || buffer[0] !== 0x89 || buffer.toString("ascii", 1, 4) !== "PNG") return false;
  const colorType = buffer[25];
  if (colorType === 4 || colorType === 6) return true;

  let offset = 8;
  while (offset + 12 <= buffer.length) {
    const chunkLength = buffer.readUInt32BE(offset);
    const chunkType = buffer.toString("ascii", offset + 4, offset + 8);
    if (chunkType === "tRNS") return true;
    if (chunkType === "IDAT" || chunkType === "IEND") return false;
    offset += chunkLength + 12;
  }
  return false;
}

function minimumImageTargetDimensions(width, height, { minDimension = 300, maxDimension = 6000 } = {}) {
  const sourceWidth = finitePositiveNumber(width);
  const sourceHeight = finitePositiveNumber(height);
  const minimum = finitePositiveNumber(minDimension);
  const maximum = finitePositiveNumber(maxDimension);
  if (!sourceWidth || !sourceHeight) throw new TypeError("Image dimensions must be positive numbers.");
  if (!minimum || !maximum || minimum > maximum) throw new TypeError("Image dimension bounds are invalid.");

  const scale = Math.max(1, minimum / sourceWidth, minimum / sourceHeight);
  const targetWidth = Math.ceil(sourceWidth * scale);
  const targetHeight = Math.ceil(sourceHeight * scale);
  if (targetWidth > maximum || targetHeight > maximum) {
    throw new RangeError(`Normalized image dimensions exceed ${maximum}px.`);
  }
  return {
    width: targetWidth,
    height: targetHeight,
    changed: targetWidth !== sourceWidth || targetHeight !== sourceHeight,
    scale,
  };
}

function referenceVideoDurationViolation(entries = [], {
  minSeconds = SEEDANCE_REFERENCE_VIDEO_MIN_SECONDS,
  maxSeconds = SEEDANCE_REFERENCE_VIDEO_MAX_SECONDS,
} = {}) {
  const minimum = finitePositiveNumber(minSeconds);
  const maximum = finitePositiveNumber(maxSeconds);
  if (!minimum || !maximum || minimum > maximum) throw new TypeError("Video duration bounds are invalid.");

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const durationSeconds = finitePositiveNumber(typeof entry === "object" ? entry?.durationSeconds : entry);
    if (!durationSeconds) continue;
    if (durationSeconds < minimum || durationSeconds > maximum) {
      return {
        index,
        label: typeof entry === "object" ? String(entry?.label || `Reference video ${index + 1}`) : `Reference video ${index + 1}`,
        durationSeconds,
        minSeconds: minimum,
        maxSeconds: maximum,
      };
    }
  }
  return null;
}

module.exports = {
  SEEDANCE_REFERENCE_VIDEO_MIN_SECONDS,
  SEEDANCE_REFERENCE_VIDEO_MAX_SECONDS,
  minimumImageTargetDimensions,
  pngBufferHasTransparency,
  referenceVideoDurationViolation,
};
