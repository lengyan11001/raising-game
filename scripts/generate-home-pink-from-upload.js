const crypto = require("node:crypto");
const fsSync = require("node:fs");
const fs = require("node:fs/promises");
const path = require("node:path");
const { spawn } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const SOURCE_IMAGE = path.join(ROOT, "assets", "admin", "home", "pink-1777738973553-a9cfba.png");
const SYNTH_REF_PATH = path.join(ROOT, "assets", "admin", "home", "pink-upload-synthetic-reference.png");
const CONFIG_PATH = path.join(ROOT, "data", "app-config.json");
const RECORDS_PATH = path.join(ROOT, "data", "generation-records.json");
const VIDEO_DIR = path.join(ROOT, "assets", "generated", "videos");
const APIZ_BASE_URL = "https://api.apiz.ai";
const USE_EXISTING_REFERENCE = process.argv.includes("--use-existing-reference");

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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
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

async function uploadToTos(filePath, keyPrefix) {
  const body = await fs.readFile(filePath);
  const ext = path.extname(filePath).toLowerCase() || ".png";
  const contentType = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png";
  const key = `${keyPrefix}/reference-${Date.now()}${ext}`;
  const auth = makeTosAuth({ method: "PUT", key, body, contentType });
  const response = await fetch(auth.url, { method: "PUT", headers: auth.headers, body });
  const text = await response.text();
  if (!response.ok) throw new Error(`TOS upload failed: ${response.status} ${text}`);
  return {
    key,
    publicUrl: `${process.env.TOS_PUBLIC_DOMAIN.replace(/\/$/, "")}/${key}`,
  };
}

async function apizRequest(pathname, body) {
  const response = await fetch(`${process.env.APIZ_BASE_URL || APIZ_BASE_URL}${pathname}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.APIZ_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : {};
  if (!response.ok || (json.code && Number(json.code) >= 400)) {
    throw new Error(`APIZ ${pathname} failed: ${response.status} ${text}`);
  }
  return json.data || json;
}

function collectImageUrls(value, urls = []) {
  if (!value || urls.length > 20) return urls;
  if (typeof value === "string" && /^https?:\/\//i.test(value) && /\.(png|jpe?g|webp)(\?|$)/i.test(value)) {
    urls.push(value);
    return urls;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectImageUrls(item, urls));
    return urls;
  }
  if (typeof value === "object") Object.values(value).forEach((item) => collectImageUrls(item, urls));
  return urls;
}

function collectOutputImageUrls(task) {
  const output = task?.output || task?.result || task?.data?.output || {};
  const direct = [
    ...(Array.isArray(output.images) ? output.images.map((image) => image?.url || image?.image_url) : []),
    output.url,
    output.image_url,
    output.image?.url,
  ].filter(Boolean);
  return direct.length ? direct : collectImageUrls(output);
}

async function downloadWithCurl(url, target, maxTime = 900) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  await new Promise((resolve, reject) => {
    const child = spawn("curl.exe", ["-L", "--fail", "--continue-at", "-", "--max-time", String(maxTime), "--output", target, url], {
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`curl failed ${code}: ${stderr}`));
    });
  });
}

async function createSyntheticReference(sourcePublicUrl) {
  const prompt = [
    "Use Figure 1 as the strict visual reference for a synthetic original adult female character.",
    "Keep the same face impression, oval face shape, soft Asian facial features, long dark hair half-up with white ribbon accessory, body proportions, pink ribbed wrap V-neck long-sleeve top, gray leggings, and white sneakers.",
    "Generate one premium photorealistic full-body portrait, front-facing, head-to-shoes visible, clean soft studio background, natural skin texture, no anime, no CGI, no plastic doll look.",
    "The character should feel like the same uploaded character rebuilt as a fictional digital model, not a different woman.",
    "Tasteful alluring confidence, mature adult fashion look, non-nude, non-explicit, no transparent clothing.",
    "No text, no logo, no watermark, no extra people, no cropped feet, no distorted hands.",
  ].join(" ");
  const model = process.env.HOME_REFERENCE_MODEL || process.env.OFFICIAL_PRESET_MODEL || "fal-ai/bytedance/seedream/v5/lite/edit";
  const created = await apizRequest("/api/v3/tasks/create", {
    model,
    params: {
      prompt,
      image_urls: [sourcePublicUrl],
      image_size: "auto_3K",
      num_images: 1,
      max_images: 1,
      enhance_prompt_mode: "standard",
    },
    channel: null,
  });
  const taskId = created.task_id || created.taskId || created.id;
  if (!taskId) throw new Error(`No APIZ task id: ${JSON.stringify(created)}`);
  console.log(`[apiz] ${taskId}`);
  let task = created;
  for (let attempt = 1; attempt <= 90; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    task = await apizRequest("/api/v3/tasks/query", { task_id: taskId });
    const status = String(task.status || "").toLowerCase();
    console.log(`[1/6] synthetic reference ${status || "unknown"} attempt=${attempt}`);
    if (["completed", "succeeded", "success", "done"].includes(status)) break;
    if (["failed", "error", "canceled", "cancelled"].includes(status)) throw new Error(`Synthetic reference failed: ${JSON.stringify(task)}`);
  }
  const imageUrl = collectOutputImageUrls(task)[0];
  if (!imageUrl) throw new Error(`Synthetic reference completed without image: ${JSON.stringify(task)}`);
  await downloadWithCurl(imageUrl, SYNTH_REF_PATH, 600);
  return { taskId, imageUrl, prompt, model };
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

function normalizeTask(raw, fallbackTaskId = "") {
  const task = raw?.data || raw?.task || raw;
  const content = task?.content || raw?.content;
  return {
    taskId: task?.id || task?.task_id || task?.taskId || raw?.id || raw?.task_id || raw?.taskId || fallbackTaskId,
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

async function submitSeedance(request) {
  let lastError = "";
  for (let attempt = 1; attempt <= 18; attempt += 1) {
    try {
      return normalizeTask(await arkRequest("POST", "/contents/generations/tasks", request));
    } catch (error) {
      lastError = error.message || String(error);
      if (!/asset is still processing|not available yet/i.test(lastError)) throw error;
      console.log(`[4/6] asset still processing, retry ${attempt}/18`);
      await new Promise((resolve) => setTimeout(resolve, 10000));
    }
  }
  throw new Error(lastError || "Asset was not ready for Seedance");
}

function makeVideoPrompt() {
  return [
    "Create a 15-second vertical cinematic image-to-video short drama shot featuring the same original adult woman from the reference image.",
    "Identity lock: preserve her face impression, long dark half-up hairstyle with white ribbon accessory, pink ribbed wrap V-neck long-sleeve top, gray leggings, white sneakers, slim athletic body proportions, and soft confident expression.",
    "Mood: seductive, elegant, intimate, confident, premium mobile romance drama, strictly non-explicit.",
    "Scene: luxury private fitness studio lounge after closing, warm lamp light, mirrored wall, rain on tall windows, rose-gold highlights, polished high-end atmosphere.",
    "Action timeline: 0-4s she stands near the mirror and slowly turns toward camera with direct confident eye contact; 4-9s she walks closer naturally, gently adjusts the white hair ribbon, and gives a teasing smile; 9-15s she leans lightly against the mirrored wall, one hand at her waist, then gives a restrained flirtatious look as the camera pushes in.",
    "Camera: slow push-in, shallow depth of field, natural motion blur, soft film grain, premium photorealistic lighting, coherent face and hands, real body movement.",
    "Negative constraints: no nudity, no explicit sexual action, no minors, no fetish content, no transparent clothing, no text, no logo, no watermark, no extra people, no distorted body, no duplicated face, no simple pan-only motion.",
  ].join(" ");
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

async function main() {
  loadLocalEnv();
  requireValue("APIZ_API_KEY", process.env.APIZ_API_KEY);
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
  if (!fsSync.existsSync(SOURCE_IMAGE)) throw new Error(`Missing uploaded source image: ${SOURCE_IMAGE}`);

  let synthetic = { taskId: "", imageUrl: "", prompt: "", model: "" };
  if (USE_EXISTING_REFERENCE && fsSync.existsSync(SYNTH_REF_PATH)) {
    console.log("[0/6] use existing close synthetic reference");
  } else {
    console.log("[0/6] upload user source image");
    const sourceUploaded = await uploadToTos(SOURCE_IMAGE, "seedance-assets/raising-game/home-pink-upload-source");
    console.log("[1/6] create close synthetic reference from uploaded image");
    synthetic = await createSyntheticReference(sourceUploaded.publicUrl);
  }

  console.log("[2/6] upload synthetic reference");
  const refUploaded = await uploadToTos(SYNTH_REF_PATH, "seedance-assets/raising-game/home-pink-upload-synthetic");

  console.log("[3/6] create Ark asset");
  const createdAsset = await arkOpenApiAction("CreateAsset", {
    GroupId: process.env.BYTEPLUS_ASSET_GROUP_ID || "group-20260429190412-6lzgq",
    URL: refUploaded.publicUrl,
    AssetType: "Image",
    Name: `raising-game-home-pink-upload-${Date.now()}`,
    ProjectName: process.env.BYTEPLUS_PROJECT_NAME || "xin",
  });
  const assetId = extractAssetId(createdAsset);
  if (!assetId) throw new Error(`CreateAsset did not return asset id: ${JSON.stringify(createdAsset)}`);
  const referenceAssetUri = `asset://${assetId}`;

  console.log("[4/6] submit true Seedance video");
  const videoPrompt = makeVideoPrompt();
  const request = {
    model: process.env.SEEDANCE_ENDPOINT_ID,
    content: [
      { type: "text", text: videoPrompt },
      { type: "image_url", image_url: { url: referenceAssetUri }, role: "reference_image" },
    ],
    generate_audio: false,
    ratio: "9:16",
    resolution: "720p",
    duration: 15,
    watermark: false,
  };
  const submitted = await submitSeedance(request);
  if (!submitted.taskId) throw new Error("Seedance did not return task id");
  console.log(`[seedance] ${submitted.taskId}`);

  let task = submitted;
  for (let attempt = 1; attempt <= 240; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    task = normalizeTask(await arkRequest("GET", `/contents/generations/tasks/${encodeURIComponent(submitted.taskId)}`), submitted.taskId);
    const status = String(task.status || "").toLowerCase();
    console.log(`[5/6] video ${status || "unknown"} progress=${task.progress || 0}`);
    if (["succeeded", "success", "done", "completed"].includes(status)) break;
    if (["failed", "error", "cancelled", "canceled"].includes(status)) throw new Error(task.error || "Seedance task failed");
  }
  if (!["succeeded", "success", "done", "completed"].includes(String(task.status || "").toLowerCase())) {
    throw new Error(`Timed out waiting for ${submitted.taskId}`);
  }
  if (!task.videoUrl) throw new Error("Seedance succeeded but returned no video URL");

  console.log("[6/6] download video and update home config");
  const fileName = `home-role-pink-upload-seedance-${submitted.taskId}.mp4`;
  const localVideoPath = path.join(VIDEO_DIR, fileName);
  await downloadWithCurl(task.videoUrl, localVideoPath, 1200);
  const stat = await fs.stat(localVideoPath);
  if (stat.size < 500000) throw new Error(`Downloaded video is unexpectedly small: ${stat.size}`);

  const now = new Date().toISOString();
  const config = await readJson(CONFIG_PATH, {});
  const homeVideo = config.homeVideo || {};
  const existingItems = Array.isArray(homeVideo.items) ? homeVideo.items : [];
  const firstItem = existingItems.find((item) => item.id === "suite-seductive-demo") || existingItems[0];
  const secondItem = {
    id: "pink-1777738973553-a9cfba",
    name: "粉桃",
    title: "晨光私教",
    posterUrl: "/assets/admin/home/pink-upload-synthetic-reference.png",
    localImageUrl: "/assets/admin/home/pink-upload-synthetic-reference.png",
    sourceImageUrl: "/assets/admin/home/pink-1777738973553-a9cfba.png",
    imageMime: "image/png",
    publicImageUrl: refUploaded.publicUrl,
    referenceAssetUri,
    tosKey: refUploaded.key,
    videoUrl: `/assets/generated/videos/${fileName}`,
    localVideoUrl: `/assets/generated/videos/${fileName}`,
    localVideoPath,
    remoteVideoUrl: task.videoUrl,
    taskId: submitted.taskId,
    status: task.status,
    provider: "seedance",
    prompt: videoPrompt,
    syntheticReferenceTaskId: synthetic.taskId,
    syntheticReferenceUrl: synthetic.imageUrl,
    createdAt: now,
    updatedAt: now,
  };
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
    localVideoPath,
    remoteVideoUrl: task.videoUrl,
    taskId: submitted.taskId,
    status: task.status,
    prompt: videoPrompt,
    items: [firstItem, secondItem].filter(Boolean),
  };
  await writeJson(CONFIG_PATH, config);

  const records = await readJson(RECORDS_PATH, []);
  await writeJson(RECORDS_PATH, [
    {
      createdAt: now,
      taskId: submitted.taskId,
      status: task.status,
      model: process.env.SEEDANCE_ENDPOINT_ID,
      sceneId: "home-pink-upload-seductive",
      sceneName: "晨光私教",
      companionId: secondItem.id,
      companionName: secondItem.name,
      referenceAssetUri,
      prompt: videoPrompt,
      finalPrompt: videoPrompt,
      ratio: "9:16",
      resolution: "720p",
      duration: 15,
      quality: "high",
      remoteVideoUrl: task.videoUrl,
      localVideoUrl: secondItem.localVideoUrl,
      localVideoPath,
      error: "",
      updatedAt: now,
    },
    ...records.filter((item) => item.taskId !== submitted.taskId),
  ]);
  console.log(JSON.stringify({ ok: true, taskId: submitted.taskId, localVideoUrl: secondItem.localVideoUrl, bytes: stat.size }, null, 2));
}

main().catch((error) => {
  console.error(`[failed] ${error.message}`);
  process.exitCode = 1;
});
