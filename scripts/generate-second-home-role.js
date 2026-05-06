const fsSync = require("node:fs");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = path.join(__dirname, "..");
const INPUT_IMAGE = "E:\\微信缓存\\xwechat_files\\a158253524_523d\\temp\\RWTemp\\2026-04\\c623036d3e0174e1e1b87bd8ab619124\\efa472e3d52f4c78ee27e4745efc67b5.png";
const ADMIN_HOME_DIR = path.join(ROOT, "assets", "admin", "home");
const OUT_DIR = path.join(ROOT, "assets", "generated", "videos");
const APP_CONFIG_PATH = path.join(ROOT, "data", "app-config.json");
const RECORDS_PATH = path.join(ROOT, "data", "generation-records.json");

function loadLocalEnv(filePath) {
  if (!fsSync.existsSync(filePath)) return;
  for (const line of fsSync.readFileSync(filePath, "utf8").split(/\r?\n/)) {
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
    raw,
  };
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
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
  if (!response.ok) {
    throw new Error(payload?.error?.message || payload?.message || text || `Ark request failed: ${response.status}`);
  }
  return payload;
}

async function getCurrentHomeVideo() {
  try {
    const response = await fetch("http://127.0.0.1:4174/api/config/public");
    const payload = await response.json();
    return payload?.config?.homeVideo || {};
  } catch {
    return {};
  }
}

async function downloadVideo(taskId, videoUrl) {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const response = await fetch(videoUrl);
  if (!response.ok) throw new Error(`Video download failed: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const fileName = `home-role-pink-${taskId}.mp4`;
  const filePath = path.join(OUT_DIR, fileName);
  await fs.writeFile(filePath, bytes);
  return {
    filePath,
    localVideoUrl: `/assets/generated/videos/${fileName}`,
    bytes: bytes.length,
  };
}

async function main() {
  loadLocalEnv(path.join(ROOT, ".env.local"));
  if (!process.env.ARK_API_KEY) throw new Error("Missing ARK_API_KEY");
  if (!fsSync.existsSync(INPUT_IMAGE)) throw new Error(`Image not found: ${INPUT_IMAGE}`);

  await fs.mkdir(ADMIN_HOME_DIR, { recursive: true });
  const imageBytes = await fs.readFile(INPUT_IMAGE);
  const imageId = `pink-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
  const localImageFile = `${imageId}.png`;
  const localImagePath = path.join(ADMIN_HOME_DIR, localImageFile);
  await fs.writeFile(localImagePath, imageBytes);
  const localImageUrl = `/assets/admin/home/${localImageFile}`;
  const imageDataUrl = `data:image/png;base64,${imageBytes.toString("base64")}`;

  const model = process.env.SEEDANCE_ENDPOINT_ID || "ep-20260429142513-zg667";
  const prompt = [
    "Create a 15-second vertical cinematic image-to-video short drama shot featuring the original adult woman from the reference image.",
    "Preserve her face, hairstyle, soft pink wrap sweater, gray leggings, white sneakers, and clean feminine styling.",
    "Mood: alluring, bright, confident, elegant, intimate mobile romance drama, strictly non-explicit.",
    "Scene: premium private fitness studio lounge in soft morning light, pale curtains, mirrored wall, warm highlights, clean luxury atmosphere.",
    "Action timeline: 0-4s she stands in soft light and turns toward camera with warm eye contact; 4-9s she steps closer, gently adjusts the white hair ribbon and smiles; 9-15s she leans lightly near a mirror, stretches one shoulder, then gives a restrained flirtatious look.",
    "Wardrobe remains fully clothed and tasteful. No nudity, no transparent clothing, no explicit sexual action.",
    "Camera: slow push-in, shallow depth of field, premium photorealistic lighting, coherent hands and face, soft film grain, natural motion blur.",
    "Negative constraints: no minors, no extra people, no text, no logo, no watermark, no distorted body, no duplicated face.",
  ].join(" ");

  const request = {
    model,
    content: [
      { type: "text", text: prompt },
      { type: "image_url", image_url: { url: imageDataUrl }, role: "reference_image" },
    ],
    generate_audio: false,
    ratio: "9:16",
    resolution: "720p",
    duration: 15,
    watermark: false,
  };

  console.log(`Submitting second home role with model ${model}`);
  const created = normalizeTask(await arkRequest("POST", "/contents/generations/tasks", request));
  if (!created.taskId) throw new Error(`No task id returned: ${JSON.stringify(created.raw)}`);
  console.log(`taskId=${created.taskId}`);

  let task = created;
  const startedAt = Date.now();
  while (Date.now() - startedAt < 16 * 60 * 1000) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    task = normalizeTask(await arkRequest("GET", `/contents/generations/tasks/${encodeURIComponent(created.taskId)}`));
    console.log(`status=${task.status || "unknown"} progress=${task.progress || 0}`);
    const status = String(task.status || "").toLowerCase();
    if (["succeeded", "success", "done", "completed"].includes(status)) break;
    if (["failed", "error", "cancelled", "canceled"].includes(status)) throw new Error(task.error || "Seedance task failed.");
  }

  const status = String(task.status || "").toLowerCase();
  if (!["succeeded", "success", "done", "completed"].includes(status)) throw new Error(`Timed out: ${created.taskId}`);
  if (!task.videoUrl) throw new Error("Task completed without videoUrl.");

  const localVideo = await downloadVideo(created.taskId, task.videoUrl);
  const savedConfig = await readJson(APP_CONFIG_PATH, {});
  const currentHomeVideo = await getCurrentHomeVideo();
  const currentItems = Array.isArray(currentHomeVideo.items) ? currentHomeVideo.items : [];
  const item = {
    id: imageId,
    name: "粉桃",
    title: "晨光私教",
    posterUrl: localImageUrl,
    localImageUrl,
    imageMime: "image/png",
    referenceAssetUri: "",
    videoUrl: localVideo.localVideoUrl,
    localVideoUrl: localVideo.localVideoUrl,
    localVideoPath: localVideo.filePath,
    remoteVideoUrl: task.videoUrl,
    taskId: created.taskId,
    status: task.status,
    prompt,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const homeVideo = {
    ...currentHomeVideo,
    ...(savedConfig.homeVideo || {}),
    activeItemId: item.id,
    posterUrl: item.posterUrl,
    localImageUrl: item.localImageUrl,
    videoUrl: item.videoUrl,
    localVideoUrl: item.localVideoUrl,
    taskId: item.taskId,
    status: item.status,
    prompt,
    items: [item, ...currentItems.filter((next) => next.id !== item.id)],
  };
  await fs.mkdir(path.dirname(APP_CONFIG_PATH), { recursive: true });
  await fs.writeFile(APP_CONFIG_PATH, `${JSON.stringify({ ...savedConfig, homeVideo }, null, 2)}\n`);

  const records = await readJson(RECORDS_PATH, []);
  records.unshift({
    createdAt: item.createdAt,
    taskId: item.taskId,
    status: item.status,
    model,
    sceneId: "home-role-pink",
    sceneName: item.title,
    companionId: item.id,
    companionName: item.name,
    referenceAssetUri: "data-url-upload",
    prompt,
    finalPrompt: prompt,
    ratio: request.ratio,
    resolution: request.resolution,
    duration: request.duration,
    quality: "high",
    remoteVideoUrl: task.videoUrl,
    localVideoUrl: item.localVideoUrl,
    localVideoPath: item.localVideoPath,
    error: "",
    updatedAt: item.updatedAt,
  });
  await fs.writeFile(RECORDS_PATH, `${JSON.stringify(records, null, 2)}\n`);

  console.log(`saved=${item.localVideoUrl}`);
  console.log(`poster=${item.posterUrl}`);
  console.log(`bytes=${localVideo.bytes}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
