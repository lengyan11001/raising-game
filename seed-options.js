"use strict";

const DEFAULT_SEED_MAX = 2147483647;
const SEEDANCE25_DIRECT_SEED_MAX = 4294967295;

function normalizeOptionalSeed(value, { min = 1, max = DEFAULT_SEED_MAX } = {}) {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  if (!text) return undefined;
  const seed = Number(text);
  if (!Number.isSafeInteger(seed) || seed < min || seed > max) return undefined;
  return seed;
}

module.exports = {
  DEFAULT_SEED_MAX,
  SEEDANCE25_DIRECT_SEED_MAX,
  normalizeOptionalSeed,
};
