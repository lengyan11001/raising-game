"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { promisify } = require("node:util");
const { execFile } = require("node:child_process");

const db = require("../db");

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(__dirname, "..");
const ASSET_ROOT = path.join(ROOT, "assets");
const PUBLIC_VERSION = "v1";

const R2 = {
  accessKey: process.env.R2_ACCESS_KEY_ID || process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
  secretKey: process.env.R2_SECRET_ACCESS_KEY || process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
  endpoint: process.env.R2_ENDPOINT || process.env.CLOUDFLARE_R2_ENDPOINT,
  region: process.env.R2_REGION || process.env.CLOUDFLARE_R2_REGION || "auto",
  bucket: process.env.R2_BUCKET || process.env.CLOUDFLARE_R2_BUCKET,
  publicDomain:
    process.env.R2_PUBLIC_BASE_URL ||
    process.env.R2_PUBLIC_DOMAIN ||
    process.env.CLOUDFLARE_R2_PUBLIC_BASE_URL ||
    process.env.CLOUDFLARE_R2_PUBLIC_DOMAIN,
};

const EXAMPLES = [
  {
    name: "image-video-result",
    taskId: "cgt-20260728161747-915edb",
    source: "result",
  },
  {
    name: "video-input",
    taskId: "video-20260806194724-f15971",
    source: "input",
  },
  {
    name: "video-result",
    taskId: "video-20260806194724-f15971",
    source: "result",
  },
];

function required(label, value) {
  if (!value) throw new Error(`Missing ${label}`);
}

function hmac(key, value, encoding) {
  return crypto.createHmac("sha256", key).update(value).digest(encoding);
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function signingKey(secret, date, region) {
  return hmac(hmac(hmac(hmac(`AWS4${secret}`, date), region), "s3"), "aws4_request");
}

function encodedPath(value) {
  return value.split("/").map(encodeURIComponent).join("/");
}

function uploadAuth(key, bytes) {
  const endpointText = String(R2.endpoint || "").trim().replace(/\/+$/, "");
  const endpoint = new URL(/^https?:\/\//i.test(endpointText) ? endpointText : `https://${endpointText}`);
  const xDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const date = xDate.slice(0, 8);
  const payloadHash = sha256(bytes);
  const canonicalUri = `/${encodeURIComponent(R2.bucket)}/${encodedPath(key)}`;
  const headers = {
    "cache-control": "public, max-age=31536000, immutable",
    "content-type": "video/mp4",
    host: endpoint.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": xDate,
  };
  const keys = Object.keys(headers).sort();
  const signedHeaders = keys.join(";");
  const canonicalHeaders = keys.map((header) => `${header}:${headers[header]}\n`).join("");
  const canonicalRequest = ["PUT", canonicalUri, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = `${date}/${R2.region}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", xDate, scope, sha256(canonicalRequest)].join("\n");
  const signature = hmac(signingKey(R2.secretKey, date, R2.region), stringToSign, "hex");
  return {
    url: `${endpoint.protocol}//${endpoint.host}${canonicalUri}`,
    headers: {
      ...headers,
      authorization: `AWS4-HMAC-SHA256 Credential=${R2.accessKey}/${scope},SignedHeaders=${signedHeaders},Signature=${signature}`,
    },
  };
}

function localAssetPath(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";
  const filePath = text.startsWith("/assets/")
    ? path.resolve(ROOT, text.replace(/^\/+/, ""))
    : path.isAbsolute(text)
      ? path.normalize(text)
      : "";
  if (!filePath) return "";
  const relative = path.relative(ASSET_ROOT, filePath);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative) ? filePath : "";
}

function sourcePath(record, source) {
  if (source === "input") {
    const media = (Array.isArray(record.mediaAssets) ? record.mediaAssets : [])
      .find((item) => item?.type === "video" || String(item?.mime || "").startsWith("video/"));
    return localAssetPath(media?.localUrl || media?.url || "");
  }
  return localAssetPath(record.localVideoPath || record.localVideoUrl || "");
}

async function transcode(inputPath, outputPath) {
  await execFileAsync("ffmpeg", [
    "-y",
    "-i", inputPath,
    "-map", "0:v:0",
    "-map", "0:a?",
    "-vf", "scale='min(540,iw)':-2:flags=lanczos",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "26",
    "-maxrate", "1200k",
    "-bufsize", "2400k",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", "96k",
    "-movflags", "+faststart",
    outputPath,
  ], { maxBuffer: 4 * 1024 * 1024, timeout: 10 * 60 * 1000 });
}

async function uploadExample(example, outputPath) {
  const bytes = await fs.readFile(outputPath);
  const key = `undress-tool/examples/${PUBLIC_VERSION}/${example.name}.mp4`;
  const auth = uploadAuth(key, bytes);
  const response = await fetch(auth.url, { method: "PUT", headers: auth.headers, body: bytes });
  const text = await response.text();
  if (!response.ok) throw new Error(`R2 upload failed for ${example.name}: ${response.status} ${text}`);
  const publicUrl = `${String(R2.publicDomain).replace(/\/+$/, "")}/${key}`;
  const probe = await fetch(publicUrl, { headers: { range: "bytes=0-1023" }, cache: "no-store" });
  if (![200, 206].includes(probe.status)) throw new Error(`Public video check failed for ${example.name}: ${probe.status}`);
  return { name: example.name, publicUrl, bytes: bytes.length, rangeStatus: probe.status };
}

async function main() {
  required("R2_ACCESS_KEY_ID", R2.accessKey);
  required("R2_SECRET_ACCESS_KEY", R2.secretKey);
  required("R2_ENDPOINT", R2.endpoint);
  required("R2_BUCKET", R2.bucket);
  required("R2_PUBLIC_BASE_URL", R2.publicDomain);

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "undress-examples-"));
  try {
    const results = [];
    for (const example of EXAMPLES) {
      const record = await db.getGenerationRecordFromDb(example.taskId);
      if (!record) throw new Error(`Task not found: ${example.taskId}`);
      const inputPath = sourcePath(record, example.source);
      if (!inputPath) throw new Error(`Local ${example.source} video not found for ${example.taskId}`);
      const outputPath = path.join(tempDir, `${example.name}.mp4`);
      await transcode(inputPath, outputPath);
      results.push(await uploadExample(example, outputPath));
    }
    console.log(JSON.stringify({ ok: true, version: PUBLIC_VERSION, results }, null, 2));
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
