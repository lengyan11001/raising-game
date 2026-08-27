"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const OUTPUT = path.join(ROOT, "assets", "ourdream", "presets", "video-actions.json");
const PAGE_URL = "https://ourdream.ai/generate";

function decodeString(value = "") {
  try {
    return JSON.parse(`"${value}"`);
  } catch {
    return value;
  }
}

function balancedSlice(source, start, open, close) {
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === open) depth += 1;
    else if (char === close) {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  return "";
}

function topLevelObjects(arraySource = "") {
  const items = [];
  for (let index = 1; index < arraySource.length - 1; index += 1) {
    if (arraySource[index] !== "{") continue;
    const objectSource = balancedSlice(arraySource, index, "{", "}");
    if (!objectSource) break;
    items.push(objectSource);
    index += objectSource.length - 1;
  }
  return items;
}

function fieldString(source, name) {
  const match = source.match(new RegExp(`${name}:"((?:\\\\.|[^"\\\\])*)"`));
  return match ? decodeString(match[1]) : "";
}

function objectField(source, name) {
  const marker = `${name}:{`;
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) return "";
  return balancedSlice(source, markerIndex + name.length + 1, "{", "}");
}

function parseTags(source) {
  const match = source.match(/tags:\[((?:"(?:\\.|[^"\\])*",?)*)\]/);
  if (!match) return [];
  return [...match[1].matchAll(/"((?:\\.|[^"\\])*)"/g)].map((item) => decodeString(item[1]));
}

function parseGenderVariant(source, gender, kind) {
  const block = objectField(source, gender);
  if (!block) return {};
  if (kind === "video") {
    return {
      videoUrl: fieldString(block, "videoUrl"),
      animeVideoUrl: fieldString(block, "animeVideoUrl"),
    };
  }
  const mediaPath = (name) => {
    const match = block.match(new RegExp(`${name}:\\(0,[^)]+\\)\\("((?:\\\\.|[^"\\\\])*)"\\)`));
    return match ? `https://media.ourdream.ai/${decodeString(match[1]).replace(/^\/+/, "")}` : fieldString(block, name);
  };
  return {
    thumbnailUrl: mediaPath("thumbnailUrl"),
    animeThumbnailUrl: mediaPath("animeThumbnailUrl"),
  };
}

function parseVideoActions(bundle = "") {
  const marker = '[{id:"custom",displayName:"Custom"';
  const start = bundle.indexOf(marker);
  if (start < 0) throw new Error("OurDream video action array was not found.");
  const arraySource = balancedSlice(bundle, start, "[", "]");
  const items = topLevelObjects(arraySource).map((source) => {
    const videosSource = objectField(source, "videos");
    const thumbnailsSource = objectField(source, "thumbnails");
    const videos = Object.fromEntries(["Female", "Male", "Trans"].map((gender) => [gender, parseGenderVariant(videosSource, gender, "video")]).filter(([, value]) => value.videoUrl || value.animeVideoUrl));
    const thumbnails = Object.fromEntries(["Female", "Male", "Trans"].map((gender) => [gender, parseGenderVariant(thumbnailsSource, gender, "thumbnail")]).filter(([, value]) => value.thumbnailUrl || value.animeThumbnailUrl));
    const femaleThumb = thumbnails.Female?.thumbnailUrl || thumbnails.Male?.thumbnailUrl || thumbnails.Trans?.thumbnailUrl || "";
    const femaleVideo = videos.Female?.videoUrl || videos.Male?.videoUrl || videos.Trans?.videoUrl || "";
    const promptPrefix = fieldString(source, "promptPrefix");
    return {
      id: fieldString(source, "id"),
      label: fieldString(source, "displayName"),
      displayName: fieldString(source, "displayName"),
      modelName: fieldString(source, "modelName"),
      category: parseTags(source)[0] || "Action",
      section: "Video Action",
      tags: parseTags(source),
      prompt: promptPrefix || fieldString(source, "displayName"),
      promptPrefix,
      imageUrl: femaleThumb,
      referenceImageUrl: femaleThumb,
      videoUrl: femaleVideo,
      videos,
      thumbnails,
      sourceType: "ourdream-video-action",
    };
  }).filter((item) => item.id && item.label && item.videoUrl);
  if (items.length < 20) throw new Error(`Only ${items.length} OurDream video actions were parsed.`);
  return items;
}

async function pageScripts(fetchImpl = fetch) {
  const html = await (await fetchImpl(PAGE_URL)).text();
  return [...html.matchAll(/<script[^>]+src="([^"]+\.js[^"]*)"/g)].map((match) => new URL(match[1], PAGE_URL).href);
}

async function findActionBundle(fetchImpl = fetch) {
  const scripts = await pageScripts(fetchImpl);
  for (let index = 0; index < scripts.length; index += 6) {
    const batch = scripts.slice(index, index + 6);
    const bodies = await Promise.all(batch.map(async (url) => ({ url, body: await (await fetchImpl(url)).text() })));
    const match = bodies.find((item) => item.body.includes('presets/video-action/') && item.body.includes('[{id:"custom",displayName:"Custom"'));
    if (match) return match;
  }
  throw new Error("OurDream video action bundle was not found.");
}

async function main() {
  const bundle = await findActionBundle();
  const items = parseVideoActions(bundle.body);
  const payload = {
    version: 1,
    source: bundle.url,
    generatedAt: new Date().toISOString(),
    items,
  };
  await fs.writeFile(OUTPUT, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`Wrote ${items.length} video actions to ${path.relative(ROOT, OUTPUT)}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}

module.exports = { balancedSlice, parseVideoActions };
