const fsSync = require("node:fs");
const fs = require("node:fs/promises");
const path = require("node:path");
const { createWriteStream } = require("node:fs");
const { pipeline } = require("node:stream/promises");

const ROOT = path.resolve(__dirname, "..");
const TASK_ID = process.argv[2] || "cgt-20260503210018-rfw5w";
const POSTER_URL = "/assets/admin/home/pink-seedance-rose-reference.png";
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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!process.env[key]) process.env[key] = value;
  }
}

async function arkRequest(method, pathname) {
  const baseUrl = process.env.ARK_BASE_URL || "https://ark.ap-southeast.bytepluses.com/api/v3";
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      authorization: `Bearer ${process.env.ARK_API_KEY || ""}`,
      "content-type": "application/json",
    },
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(payload?.error?.message || payload?.message || text || `Ark request failed: ${response.status}`);
  return payload;
}

function normalizeTask(raw) {
  const task = raw?.data || raw?.task || raw;
  const content = task?.content || raw?.content;
  return {
    taskId: task?.id || task?.task_id || task?.taskId || raw?.id || raw?.task_id || raw?.taskId || TASK_ID,
    status: task?.status || raw?.status || "",
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

async function downloadWithCurl(url, target) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const { spawn } = require("node:child_process");
  await new Promise((resolve, reject) => {
    const child = spawn("curl.exe", ["-L", "--fail", "--continue-at", "-", "--max-time", "900", "--output", target, url], {
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
  const task = normalizeTask(await arkRequest("GET", `/contents/generations/tasks/${encodeURIComponent(TASK_ID)}`));
  if (!["succeeded", "success", "done", "completed"].includes(String(task.status || "").toLowerCase())) {
    throw new Error(`Task is not succeeded yet: ${task.status || "unknown"} ${task.error || ""}`);
  }
  if (!task.videoUrl) throw new Error("Task succeeded but returned no video URL");

  const fileName = `home-role-pink-seedance-${TASK_ID}.mp4`;
  const localVideoPath = path.join(OUT_DIR, fileName);
  await downloadWithCurl(task.videoUrl, localVideoPath);
  const stat = await fs.stat(localVideoPath);
  if (stat.size < 500000) throw new Error(`Downloaded video is unexpectedly small: ${stat.size}`);

  const config = await readJson(CONFIG_PATH, {});
  const homeVideo = config.homeVideo || {};
  const existingItems = Array.isArray(homeVideo.items) ? homeVideo.items : [];
  const firstItem = existingItems.find((item) => item.id === "suite-seductive-demo") || existingItems[0];
  const priorSecond = existingItems.find((item) => item.id === "pink-1777738973553-a9cfba") || {};
  const now = new Date().toISOString();
  const secondItem = {
    ...priorSecond,
    id: "pink-1777738973553-a9cfba",
    name: "粉桃",
    title: "晨光私教",
    posterUrl: POSTER_URL,
    localImageUrl: POSTER_URL,
    imageMime: "image/png",
    referenceAssetUri: priorSecond.referenceAssetUri || "asset://asset-20260503210015-77ls7",
    videoUrl: `/assets/generated/videos/${fileName}`,
    localVideoUrl: `/assets/generated/videos/${fileName}`,
    localVideoPath,
    remoteVideoUrl: task.videoUrl,
    taskId: TASK_ID,
    status: task.status,
    provider: "seedance",
    prompt: priorSecond.prompt || homeVideo.prompt || "",
    updatedAt: now,
    createdAt: priorSecond.createdAt || now,
  };
  const items = [firstItem, secondItem].filter(Boolean);
  config.homeVideo = {
    ...homeVideo,
    provider: "seedance",
    activeItemId: secondItem.id,
    posterUrl: secondItem.posterUrl,
    localImageUrl: secondItem.localImageUrl,
    referenceAssetUri: secondItem.referenceAssetUri,
    videoUrl: secondItem.videoUrl,
    localVideoUrl: secondItem.localVideoUrl,
    localVideoPath,
    remoteVideoUrl: task.videoUrl,
    taskId: TASK_ID,
    status: task.status,
    items,
  };
  await writeJson(CONFIG_PATH, config);

  const records = await readJson(RECORDS_PATH, []);
  const existingRecord = records.find((item) => item.taskId === TASK_ID) || {};
  await writeJson(RECORDS_PATH, [
    {
      ...existingRecord,
      createdAt: existingRecord.createdAt || now,
      taskId: TASK_ID,
      status: task.status,
      model: process.env.SEEDANCE_ENDPOINT_ID || existingRecord.model || "",
      sceneId: "home-pink-seductive",
      sceneName: "晨光私教",
      companionId: secondItem.id,
      companionName: secondItem.name,
      referenceAssetUri: secondItem.referenceAssetUri,
      prompt: secondItem.prompt,
      finalPrompt: secondItem.prompt,
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
    ...records.filter((item) => item.taskId !== TASK_ID),
  ]);

  console.log(JSON.stringify({ ok: true, taskId: TASK_ID, localVideoUrl: secondItem.localVideoUrl, bytes: stat.size }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
