const crypto = require("node:crypto");
const fsSync = require("node:fs");
const fs = require("node:fs/promises");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const SOURCE_IMAGE = path.join(ROOT, "assets", "generated", "characters", "official", "rose", "portrait.png");
const POSTER_PATH = path.join(ROOT, "assets", "admin", "home", "pink-seedance-rose-reference.png");
const CONFIG_PATH = path.join(ROOT, "data", "app-config.json");
const RECORDS_PATH = path.join(ROOT, "data", "generation-records.json");
const OUT_DIR = path.join(ROOT, "assets", "generated", "videos");

function loadLocalEnv() {
  const envPath = path.join(ROOT, ".env.local");
  if (!fsSync.existsSync(envPath)) return;
  for (const line of fsSync.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index < 1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function requireValue(label, value) {
  if (!value) throw new Error(`Missing ${label}`);
}

function sha256Hex(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function hmac(key, data, encoding) {
  return crypto.createHmac("sha256", key).update(data, "utf8").digest(encoding);
}

function signKey(secret, date, region, service) {
  return hmac(hmac(hmac(hmac(secret, date), region), service), "request");
}

function amzDate() {
  const value = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { xDate: value, date: value.slice(0, 8) };
}

function encodePathname(input) {
  return input.split("/").map((part) => encodeURIComponent(part)).join("/");
}

function makeTosAuth({ method, key, body, contentType }) {
  const host = `${process.env.TOS_BUCKET}.${process.env.TOS_ENDPOINT}`;
  const { xDate, date } = amzDate();
  const payloadHash = sha256Hex(body);
  const canonicalUri = `/${encodePathname(key)}`;
  const headers = {
    "content-type": contentType,
    host,
    "x-tos-content-sha256": payloadHash,
    "x-tos-date": xDate,
  };
  const sortedKeys = Object.keys(headers).sort();
  const signedHeaders = sortedKeys.join(";");
  const canonicalHeaders = sortedKeys.map((header) => `${header}:${headers[header]}\n`).join("");
  const canonicalRequest = [method, canonicalUri, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = `${date}/${process.env.TOS_REGION}/tos/request`;
  const stringToSign = ["TOS4-HMAC-SHA256", xDate, scope, sha256Hex(canonicalRequest)].join("\n");
  const signature = hmac(signKey(process.env.TOS_SECRET_ACCESS_KEY, date, process.env.TOS_REGION, "tos"), stringToSign, "hex");
  return {
    url: `https://${host}${canonicalUri}`,
    headers: {
      ...headers,
      authorization: `TOS4-HMAC-SHA256 Credential=${process.env.TOS_ACCESS_KEY_ID}/${scope},SignedHeaders=${signedHeaders},Signature=${signature}`,
    },
  };
}

function makeArkAuth({ action, body }) {
  const host = process.env.BYTEPLUS_OPENAPI_HOST || "ark.ap-southeast-1.byteplusapi.com";
  const region = process.env.BYTEPLUS_OPENAPI_REGION || "ap-southeast-1";
  const service = process.env.BYTEPLUS_OPENAPI_SERVICE || "ark";
  const version = process.env.BYTEPLUS_OPENAPI_VERSION || "2024-01-01";
  const { xDate, date } = amzDate();
  const query = new URLSearchParams({ Action: action, Version: version }).toString();
  const payloadHash = sha256Hex(body);
  const headers = {
    "content-type": "application/json",
    host,
    "x-content-sha256": payloadHash,
    "x-date": xDate,
  };
  const sortedKeys = Object.keys(headers).sort();
  const signedHeaders = sortedKeys.join(";");
  const canonicalHeaders = sortedKeys.map((header) => `${header}:${headers[header]}\n`).join("");
  const canonicalRequest = ["POST", "/", query, canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = `${date}/${region}/${service}/request`;
  const stringToSign = ["HMAC-SHA256", xDate, scope, sha256Hex(canonicalRequest)].join("\n");
  const secret = process.env.BYTEPLUS_SECRET_ACCESS_KEY || process.env.VOLC_ACCESS_KEY_SECRET;
  const access = process.env.BYTEPLUS_ACCESS_KEY_ID || process.env.VOLC_ACCESS_KEY_ID;
  const signature = hmac(signKey(secret, date, region, service), stringToSign, "hex");
  return {
    url: `https://${host}/?${query}`,
    headers: {
      ...headers,
      authorization: `HMAC-SHA256 Credential=${access}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  };
}

async function uploadToTos(filePath) {
  const body = await fs.readFile(filePath);
  const key = `seedance-assets/raising-game/home-pink/reference-${Date.now()}.png`;
  const auth = makeTosAuth({ method: "PUT", key, body, contentType: "image/png" });
  const response = await fetch(auth.url, { method: "PUT", headers: auth.headers, body });
  const text = await response.text();
  if (!response.ok) throw new Error(`TOS upload failed: ${response.status} ${text}`);
  return {
    key,
    publicUrl: `${process.env.TOS_PUBLIC_DOMAIN.replace(/\/$/, "")}/${key}`,
  };
}

async function arkOpenApiAction(action, payload) {
  const body = JSON.stringify(payload);
  const auth = makeArkAuth({ action, body });
  const response = await fetch(auth.url, { method: "POST", headers: auth.headers, body });
  const text = await response.text();
  const json = text ? JSON.parse(text) : {};
  if (!response.ok || json.ResponseMetadata?.Error) {
    const error = json.ResponseMetadata?.Error;
    throw new Error(`${action} failed: ${error?.Code || response.status} ${error?.Message || text}`);
  }
  return json.Result || json;
}

function extractAssetId(result) {
  return result.Id || result.AssetId || result.Asset?.Id || result.Asset?.AssetId || result.Item?.Id || "";
}

async function arkRequest(method, pathname, body) {
  const baseUrl = process.env.ARK_BASE_URL || "https://ark.ap-southeast.bytepluses.com/api/v3";
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      authorization: `Bearer ${process.env.ARK_API_KEY || ""}`,
      "content-type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = { raw: text };
  }
  if (!response.ok) throw new Error(payload?.error?.message || payload?.message || text || `Ark request failed: ${response.status}`);
  return payload;
}

async function submitSeedanceWhenAssetReady(request) {
  let lastError = "";
  for (let attempt = 1; attempt <= 18; attempt += 1) {
    try {
      return normalizeTask(await arkRequest("POST", "/contents/generations/tasks", request));
    } catch (error) {
      lastError = error.message || String(error);
      if (!/asset is still processing|not available yet/i.test(lastError)) throw error;
      console.log(`[3/5] asset still processing, retry ${attempt}/18`);
      await new Promise((resolve) => setTimeout(resolve, 10000));
    }
  }
  throw new Error(lastError || "Asset was not ready for Seedance");
}

function normalizeTask(raw) {
  const task = raw?.data || raw?.task || raw;
  const content = task?.content || raw?.content;
  return {
    taskId: task?.id || task?.task_id || task?.taskId || raw?.id || raw?.task_id || raw?.taskId || "",
    status: task?.status || raw?.status || "",
    progress: task?.progress || raw?.progress || 0,
    videoUrl:
      content?.video_url ||
      content?.videoUrl ||
      task?.video_url ||
      task?.videoUrl ||
      task?.output?.video_url ||
      task?.result?.video_url ||
      "",
    error: task?.error?.message || task?.error || raw?.error?.message || raw?.error || "",
  };
}

function isSucceededStatus(status) {
  return ["succeeded", "success", "done", "completed"].includes(String(status || "").toLowerCase());
}

function isFailedStatus(status) {
  return ["failed", "error", "cancelled", "canceled"].includes(String(status || "").toLowerCase());
}

async function downloadVideo(taskId, videoUrl) {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const response = await fetch(videoUrl);
  if (!response.ok) throw new Error(`Video download failed: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const fileName = `home-role-pink-seedance-${taskId}.mp4`;
  const filePath = path.join(OUT_DIR, fileName);
  await fs.writeFile(filePath, bytes);
  return {
    bytes: bytes.length,
    filePath,
    localVideoUrl: `/assets/generated/videos/${fileName}`,
  };
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function makePrompt() {
  return [
    "Create a 15-second vertical cinematic image-to-video short drama shot featuring one original adult woman from the reference image.",
    "Preserve her youthful adult face impression, high ponytail, pale pink fitness-fashion styling, slim athletic body proportions, and white sneakers.",
    "Mood: seductive, elegant, intimate, confident, premium mobile romance drama, strictly non-explicit.",
    "Scene: luxury private fitness studio lounge at night after closing, rain on tall windows, warm side lamp, mirror reflections, soft rose-gold highlights, high-end atmosphere.",
    "Action timeline: 0-4s she stands near the mirror and slowly turns toward camera with direct confident eye contact; 4-9s she walks closer with natural hip and shoulder motion, gently adjusts her hair ribbon and gives a teasing smile; 9-15s she leans lightly against the mirrored wall, one hand at her waist, breathes softly, then gives a restrained flirtatious look as the camera pushes in.",
    "Wardrobe: fitted pale pink athletic mini dress or elegant fitted pink long-sleeve top with gray leggings, tasteful neckline, fully clothed, no transparent fabric.",
    "Camera: slow push-in, shallow depth of field, natural motion blur, soft film grain, premium photorealistic lighting, coherent face and hands, realistic body movement, no still-image sliding.",
    "Negative constraints: no nudity, no explicit sexual action, no minors, no fetish content, no text, no logo, no watermark, no extra people, no distorted body, no duplicated face, no frozen pose, no simple pan-only motion.",
  ].join(" ");
}

async function main() {
  loadLocalEnv();
  requireValue("ARK_API_KEY", process.env.ARK_API_KEY);
  requireValue("SEEDANCE_ENDPOINT_ID", process.env.SEEDANCE_ENDPOINT_ID);
  requireValue("TOS_ACCESS_KEY_ID", process.env.TOS_ACCESS_KEY_ID);
  requireValue("TOS_SECRET_ACCESS_KEY", process.env.TOS_SECRET_ACCESS_KEY);
  requireValue("TOS_ENDPOINT", process.env.TOS_ENDPOINT);
  requireValue("TOS_REGION", process.env.TOS_REGION);
  requireValue("TOS_BUCKET", process.env.TOS_BUCKET);
  requireValue("TOS_PUBLIC_DOMAIN", process.env.TOS_PUBLIC_DOMAIN);
  requireValue("BYTEPLUS_ACCESS_KEY_ID", process.env.BYTEPLUS_ACCESS_KEY_ID || process.env.VOLC_ACCESS_KEY_ID);
  requireValue("BYTEPLUS_SECRET_ACCESS_KEY", process.env.BYTEPLUS_SECRET_ACCESS_KEY || process.env.VOLC_ACCESS_KEY_SECRET);
  if (!fsSync.existsSync(SOURCE_IMAGE)) throw new Error(`Missing source image: ${SOURCE_IMAGE}`);

  await fs.mkdir(path.dirname(POSTER_PATH), { recursive: true });
  await fs.copyFile(SOURCE_IMAGE, POSTER_PATH);

  console.log("[1/5] uploading original generated character reference");
  const uploaded = await uploadToTos(SOURCE_IMAGE);
  console.log(`[2/5] creating Ark image asset from ${uploaded.publicUrl}`);
  const created = await arkOpenApiAction("CreateAsset", {
    GroupId: process.env.BYTEPLUS_ASSET_GROUP_ID || "group-20260429190412-6lzgq",
    URL: uploaded.publicUrl,
    AssetType: "Image",
    Name: `raising-game-home-pink-${Date.now()}`,
    ProjectName: process.env.BYTEPLUS_PROJECT_NAME || "xin",
  });
  const assetId = extractAssetId(created);
  if (!assetId) throw new Error(`CreateAsset did not return asset id: ${JSON.stringify(created)}`);
  const referenceAssetUri = `asset://${assetId}`;
  console.log(`[asset] ${referenceAssetUri}`);

  const prompt = makePrompt();
  const model = process.env.SEEDANCE_ENDPOINT_ID;
  const request = {
    model,
    content: [
      { type: "text", text: prompt },
      { type: "image_url", image_url: { url: referenceAssetUri }, role: "reference_image" },
    ],
    generate_audio: false,
    ratio: "9:16",
    resolution: "720p",
    duration: 15,
    watermark: false,
  };

  console.log(`[3/5] submitting true Seedance task with ${model}`);
  const submitted = await submitSeedanceWhenAssetReady(request);
  if (!submitted.taskId) throw new Error("Seedance did not return task id");
  console.log(`[task] ${submitted.taskId}`);

  let task = submitted;
  const started = Date.now();
  while (Date.now() - started < 20 * 60 * 1000) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    task = normalizeTask(await arkRequest("GET", `/contents/generations/tasks/${encodeURIComponent(submitted.taskId)}`));
    console.log(`[4/5] status=${task.status || "unknown"} progress=${task.progress || 0}`);
    if (isSucceededStatus(task.status)) break;
    if (isFailedStatus(task.status)) throw new Error(task.error || "Seedance task failed");
  }
  if (!isSucceededStatus(task.status)) throw new Error(`Timed out waiting for ${submitted.taskId}`);
  if (!task.videoUrl) throw new Error("Seedance succeeded but did not return a video URL");

  console.log("[5/5] downloading and writing app config");
  const localVideo = await downloadVideo(submitted.taskId, task.videoUrl);
  const now = new Date().toISOString();
  const config = await readJson(CONFIG_PATH, {});
  const homeVideo = config.homeVideo || {};
  const existingItems = Array.isArray(homeVideo.items) ? homeVideo.items : [];
  const firstItem = existingItems.find((item) => item.id === "suite-seductive-demo") || existingItems[0];
  const secondItem = {
    id: "pink-1777738973553-a9cfba",
    name: "粉桃",
    title: "晨光私教",
    posterUrl: "/assets/admin/home/pink-seedance-rose-reference.png",
    localImageUrl: "/assets/admin/home/pink-seedance-rose-reference.png",
    imageMime: "image/png",
    publicImageUrl: uploaded.publicUrl,
    referenceAssetUri,
    tosKey: uploaded.key,
    videoUrl: localVideo.localVideoUrl,
    localVideoUrl: localVideo.localVideoUrl,
    localVideoPath: localVideo.filePath,
    remoteVideoUrl: task.videoUrl,
    taskId: submitted.taskId,
    status: task.status,
    prompt,
    provider: "seedance",
    createdAt: now,
    updatedAt: now,
  };
  const items = [firstItem, secondItem].filter(Boolean);
  config.homeVideo = {
    ...homeVideo,
    provider: "seedance",
    activeItemId: secondItem.id,
    posterUrl: secondItem.posterUrl,
    localImageUrl: secondItem.localImageUrl,
    publicImageUrl: secondItem.publicImageUrl,
    referenceAssetUri,
    videoUrl: secondItem.videoUrl,
    localVideoUrl: secondItem.localVideoUrl,
    remoteVideoUrl: secondItem.remoteVideoUrl,
    taskId: secondItem.taskId,
    status: secondItem.status,
    prompt,
    items,
  };
  await writeJson(CONFIG_PATH, config);

  const records = await readJson(RECORDS_PATH, []);
  const record = {
    createdAt: now,
    taskId: submitted.taskId,
    status: task.status,
    model,
    sceneId: "home-pink-seductive",
    sceneName: "晨光私教",
    companionId: secondItem.id,
    companionName: secondItem.name,
    referenceAssetUri,
    prompt,
    finalPrompt: prompt,
    ratio: request.ratio,
    resolution: request.resolution,
    duration: request.duration,
    quality: "high",
    remoteVideoUrl: task.videoUrl,
    localVideoUrl: secondItem.localVideoUrl,
    localVideoPath: secondItem.localVideoPath,
    error: "",
    updatedAt: now,
  };
  await writeJson(RECORDS_PATH, [record, ...records.filter((item) => item.taskId !== record.taskId)]);
  console.log(`[done] ${secondItem.localVideoUrl}`);
}

main().catch((error) => {
  console.error(`[failed] ${error.message}`);
  process.exitCode = 1;
});
