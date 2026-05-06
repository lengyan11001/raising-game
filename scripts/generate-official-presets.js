const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const APIZ_BASE_URL = (process.env.APIZ_BASE_URL || "https://api.apiz.ai").replace(/\/+$/, "");
const APIZ_API_KEY = process.env.APIZ_API_KEY || "";
const SELECTED_IDS = new Set(
  (process.env.OFFICIAL_PRESET_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean),
);

const TOS = {
  accessKey: process.env.TOS_ACCESS_KEY_ID,
  secretKey: process.env.TOS_SECRET_ACCESS_KEY,
  endpoint: process.env.TOS_ENDPOINT,
  region: process.env.TOS_REGION,
  bucket: process.env.TOS_BUCKET,
  publicDomain: process.env.TOS_PUBLIC_DOMAIN,
};

const jobs = [
  {
    id: "violet",
    name: "洛璃",
    source: "assets/source/official-presets-src/crop-01.jpg",
    style:
      "long black hair, soft Asian beauty, lavender satin mini dress with stiletto heels, luxury resort lounge mood, alluring confident gaze",
  },
  {
    id: "noir",
    name: "柠夏",
    source: "assets/source/official-presets-src/crop-02.jpg",
    style:
      "long dark brown hair, elegant Asian beauty, black one-shoulder asymmetrical bodycon jumpsuit with one bare leg and one full black legging, black stilettos, playful confident smile",
  },
  {
    id: "rose",
    name: "芙瑶",
    source: "assets/source/official-presets-src/crop-03.jpg",
    style:
      "high ponytail, real adult Asian fitness beauty, pale pink fitted sleeveless athletic mini dress with white trim and white sneakers, natural smartphone fashion photography, glossy premium gym-editorial mood, not CGI, not anime, not 3D render",
  },
];

function requireValue(label, value) {
  if (!value) throw new Error(`Missing ${label}`);
}

function sha256Hex(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function hmac(key, data, encoding) {
  return crypto.createHmac("sha256", key).update(data).digest(encoding);
}

function signKey(secret, date, region, service) {
  return hmac(hmac(hmac(hmac(secret, date), region), service), "request");
}

function amzDate() {
  const value = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { xDate: value, date: value.slice(0, 8) };
}

function encodePathname(input) {
  return input
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function makeTosAuth({ method, key, body, contentType }) {
  const host = `${TOS.bucket}.${TOS.endpoint}`;
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
  const scope = `${date}/${TOS.region}/tos/request`;
  const stringToSign = ["TOS4-HMAC-SHA256", xDate, scope, sha256Hex(canonicalRequest)].join("\n");
  const signature = hmac(signKey(TOS.secretKey, date, TOS.region, "tos"), stringToSign, "hex");

  return {
    host,
    canonicalUri,
    headers: {
      "content-type": contentType,
      "x-tos-content-sha256": payloadHash,
      "x-tos-date": xDate,
      authorization: `TOS4-HMAC-SHA256 Credential=${TOS.accessKey}/${scope},SignedHeaders=${signedHeaders},Signature=${signature}`,
    },
  };
}

async function uploadImage(filePath, id) {
  const body = await fs.readFile(filePath);
  const key = `seedance-assets/raising-game/official-presets/${id}/reference-${Date.now()}.jpg`;
  const auth = makeTosAuth({ method: "PUT", key, body, contentType: "image/jpeg" });
  const response = await fetch(`https://${auth.host}${auth.canonicalUri}`, {
    method: "PUT",
    headers: auth.headers,
    body,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`TOS upload failed for ${id}: ${response.status} ${text}`);
  return `${TOS.publicDomain.replace(/\/$/, "")}/${key}`;
}

async function apizRequest(pathname, body) {
  requireValue("APIZ_API_KEY", APIZ_API_KEY);
  const response = await fetch(`${APIZ_BASE_URL}${pathname}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${APIZ_API_KEY}`,
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

function promptFor(job) {
  return [
    "Use Figure 1 as the strict identity, face, hairstyle, body-proportion, outfit, and styling reference for this official premium mobile girlfriend game preset.",
    "The result is invalid if the face, age impression, hairstyle, body proportions, or outfit become a different person. Preserve the reference character as closely as possible while extending missing full-body details only where the source image is cropped.",
    "Remove app UI, text, icons, usernames, logos, overlays, and background from the reference. Do not invent a new character.",
    `Character direction: ${job.style}.`,
    "Photorealistic human fashion model, real skin texture, premium editorial lighting, seductive confident pose, mature alluring atmosphere, non-nude and non-explicit.",
    "Generate one complete 4x2 character turnaround sheet with exactly eight full-body views in this order: front, front-right, right side, back-right, back, back-left, left side, front-left.",
    "Every cell must show the entire body from head to shoes, centered, same face, same hairstyle, same body proportions, same outfit, same fabric texture, same adult age.",
    "Leave generous empty margin around each person so the body is never cropped. Feet and shoes must be visible in every view.",
    "Pure flat chroma green background #00ff00 in every cell for clean cutout. No room, no floor, no shadow, no labels, no text, no watermarks, no duplicate panels, no cropped body parts.",
  ].join(" ");
}

async function download(url, target) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed: ${response.status} ${url}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, buffer);
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
  if (typeof value === "object") {
    Object.values(value).forEach((item) => collectImageUrls(item, urls));
  }
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

async function runJob(job) {
  const outDir = path.join(ROOT, "assets", "generated", "characters", "official", job.id);
  await fs.mkdir(outDir, { recursive: true });

  if (!job.source) throw new Error(`${job.id} missing required reference source`);
  const sourcePath = path.join(ROOT, job.source);
  await fs.access(sourcePath);
  const referenceUrl = await uploadImage(sourcePath, job.id);
  const model = process.env.OFFICIAL_PRESET_MODEL || "fal-ai/bytedance/seedream/v5/lite/edit";
  const params = {
    prompt: promptFor(job),
    image_urls: [referenceUrl],
    image_size: "auto_3K",
    num_images: 1,
    max_images: 1,
    enhance_prompt_mode: "standard",
  };
  await fs.writeFile(path.join(outDir, "request.json"), `${JSON.stringify({ model, params }, null, 2)}\n`);
  const created = await apizRequest("/api/v3/tasks/create", { model, params, channel: null });
  const taskId = created.task_id || created.taskId || created.id;
  if (!taskId) throw new Error(`No task id for ${job.id}: ${JSON.stringify(created)}`);
  console.log(`[${job.id}] submitted ${taskId}`);

  let task = created;
  for (let attempt = 0; attempt < 90; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    task = await apizRequest("/api/v3/tasks/query", { task_id: taskId });
    const status = String(task.status || "").toLowerCase();
    console.log(`[${job.id}] ${status || "unknown"} attempt=${attempt + 1}`);
    if (["completed", "succeeded", "success", "done"].includes(status)) break;
    if (["failed", "error", "canceled", "cancelled"].includes(status)) {
      throw new Error(`${job.id} failed: ${JSON.stringify(task)}`);
    }
  }

  const imageUrl = collectOutputImageUrls(task)[0];
  if (!imageUrl) throw new Error(`No output image for ${job.id}: ${JSON.stringify(task)}`);
  await fs.writeFile(path.join(outDir, "task-result.json"), `${JSON.stringify(task, null, 2)}\n`);
  await download(imageUrl, path.join(outDir, "sheet.png"));
  return { ...job, taskId, imageUrl };
}

async function main() {
  requireValue("TOS_ACCESS_KEY_ID", TOS.accessKey);
  requireValue("TOS_SECRET_ACCESS_KEY", TOS.secretKey);
  requireValue("TOS_ENDPOINT", TOS.endpoint);
  requireValue("TOS_REGION", TOS.region);
  requireValue("TOS_BUCKET", TOS.bucket);
  requireValue("TOS_PUBLIC_DOMAIN", TOS.publicDomain);
  const selectedJobs = SELECTED_IDS.size ? jobs.filter((job) => SELECTED_IDS.has(job.id)) : jobs;
  const results = [];
  for (const job of selectedJobs) {
    results.push(await runJob(job));
  }
  console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
