const fsSync = require("node:fs");
const fs = require("node:fs/promises");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, "assets", "generated", "videos");
const RECORDS_PATH = path.join(ROOT, "data", "generation-records.json");

function loadLocalEnv(filePath) {
  if (!fsSync.existsSync(filePath)) return;
  const lines = fsSync.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
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
  const videoUrl =
    content?.video_url ||
    content?.videoUrl ||
    task?.video_url ||
    task?.videoUrl ||
    task?.output?.video_url ||
    task?.result?.video_url ||
    "";
  return {
    taskId: task?.id || task?.task_id || task?.taskId || raw?.id || raw?.task_id || raw?.taskId || "",
    status: task?.status || raw?.status || "",
    progress: task?.progress || raw?.progress || 0,
    videoUrl,
    error: task?.error?.message || task?.error || raw?.error?.message || raw?.error || "",
    raw,
  };
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
    const message = payload?.error?.message || payload?.message || text || `Ark request failed: ${response.status}`;
    throw new Error(message);
  }
  return payload;
}

async function downloadVideo(taskId, videoUrl) {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const response = await fetch(videoUrl);
  if (!response.ok) throw new Error(`Video download failed: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const fileName = `seductive-nonexplicit-${taskId}.mp4`;
  const filePath = path.join(OUT_DIR, fileName);
  await fs.writeFile(filePath, bytes);
  return {
    fileName,
    filePath,
    localVideoUrl: `/assets/generated/videos/${fileName}`,
    bytes: bytes.length,
  };
}

async function readRecords() {
  try {
    return JSON.parse(await fs.readFile(RECORDS_PATH, "utf8"));
  } catch {
    return [];
  }
}

async function writeRecord(record) {
  const records = await readRecords();
  const next = [record, ...records.filter((item) => item.taskId !== record.taskId)];
  await fs.mkdir(path.dirname(RECORDS_PATH), { recursive: true });
  await fs.writeFile(RECORDS_PATH, `${JSON.stringify(next, null, 2)}\n`);
}

async function main() {
  loadLocalEnv(path.join(ROOT, ".env.local"));
  if (!process.env.ARK_API_KEY) throw new Error("Missing ARK_API_KEY in .env.local");

  const model = process.env.SEEDANCE_ENDPOINT_ID || process.env.SEEDANCE_MODEL || "ep-20260429142513-zg667";
  const referenceAssetUri = process.env.SEEDANCE_REFERENCE_ASSET_URI || "asset://asset-20260429190434-6plrk";
  const prompt = [
    "Create a 15-second vertical cinematic image-to-video short drama shot featuring one original adult woman from the reference image.",
    "Mood: seductive, elegant, intimate, high-end romantic mobile drama, but strictly non-explicit.",
    "Scene: luxurious night suite beside a rain-streaked city window, warm lamp light, silk curtains, glass reflections, premium hotel atmosphere.",
    "Action timeline: 0-4s she stands by the window and slowly turns toward camera with confident eye contact; 4-9s she walks closer, gently adjusts one earring and smiles as if inviting the viewer into a secret conversation; 9-15s she leans lightly against the table, raises a wine glass, and gives a restrained flirtatious smile.",
    "Wardrobe: elegant black evening dress or fitted long-sleeve outfit, tasteful neckline, fully clothed, no nudity, no transparent clothing.",
    "Camera: slow push-in, shallow depth of field, soft film grain, natural motion blur, coherent face and hands, premium photorealistic lighting.",
    "Negative constraints: no nudity, no explicit sexual action, no minors, no fetish content, no text, no logo, no watermark, no extra people, no distorted body or duplicated face.",
  ].join(" ");

  const request = {
    model,
    content: [
      { type: "text", text: prompt },
      {
        type: "image_url",
        image_url: { url: referenceAssetUri },
        role: "reference_image",
      },
    ],
    generate_audio: false,
    ratio: "9:16",
    resolution: "720p",
    duration: 15,
    watermark: false,
  };

  console.log(`Submitting Seedance task with model ${model}`);
  const created = normalizeTask(await arkRequest("POST", "/contents/generations/tasks", request));
  if (!created.taskId) throw new Error(`No task id returned: ${JSON.stringify(created.raw)}`);
  console.log(`taskId=${created.taskId}`);

  let task = created;
  const startedAt = Date.now();
  while (Date.now() - startedAt < 16 * 60 * 1000) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    task = normalizeTask(await arkRequest("GET", `/contents/generations/tasks/${encodeURIComponent(created.taskId)}`));
    const status = String(task.status || "").toLowerCase();
    console.log(`status=${task.status || "unknown"} progress=${task.progress || 0}`);
    if (["succeeded", "success", "done", "completed"].includes(status)) break;
    if (["failed", "error", "cancelled", "canceled"].includes(status)) {
      throw new Error(task.error || "Seedance task failed.");
    }
  }

  const finalStatus = String(task.status || "").toLowerCase();
  if (!["succeeded", "success", "done", "completed"].includes(finalStatus)) {
    throw new Error(`Timed out waiting for task ${created.taskId}`);
  }
  if (!task.videoUrl) throw new Error("Task completed but no video URL was returned.");

  const local = await downloadVideo(created.taskId, task.videoUrl);
  const record = {
    createdAt: new Date().toISOString(),
    taskId: created.taskId,
    status: task.status,
    model,
    sceneId: "suite-seductive-nonexplicit",
    sceneName: "夜色套房诱惑短剧",
    companionId: "aria",
    companionName: "雅莉娅",
    referenceAssetUri,
    prompt,
    finalPrompt: prompt,
    ratio: request.ratio,
    resolution: request.resolution,
    duration: request.duration,
    quality: "high",
    remoteVideoUrl: task.videoUrl,
    localVideoUrl: local.localVideoUrl,
    localVideoPath: local.filePath,
    error: "",
    updatedAt: new Date().toISOString(),
  };
  await writeRecord(record);

  console.log(`saved=${local.localVideoUrl}`);
  console.log(`bytes=${local.bytes}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
