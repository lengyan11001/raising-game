"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const R2 = {
  accessKey: process.env.R2_ACCESS_KEY_ID || process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
  secretKey: process.env.R2_SECRET_ACCESS_KEY || process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
  endpoint: process.env.R2_ENDPOINT || process.env.CLOUDFLARE_R2_ENDPOINT,
  region: process.env.R2_REGION || process.env.CLOUDFLARE_R2_REGION || "auto",
  bucket: process.env.R2_BUCKET || process.env.CLOUDFLARE_R2_BUCKET,
  publicDomain:
    process.env.R2_PUBLIC_BASE_URL
    || process.env.R2_PUBLIC_DOMAIN
    || process.env.CLOUDFLARE_R2_PUBLIC_BASE_URL
    || process.env.CLOUDFLARE_R2_PUBLIC_DOMAIN,
};

const FILES = [
  ["home-ambient-desktop.webm", "video/webm"],
  ["home-ambient-desktop.mp4", "video/mp4"],
  ["home-ambient-mobile.webm", "video/webm"],
  ["home-ambient-mobile.mp4", "video/mp4"],
  ["home-ambient-poster.webp", "image/webp"],
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

function uploadAuth(key, bytes, contentType) {
  const endpointText = String(R2.endpoint || "").trim().replace(/\/+$/, "");
  const endpoint = new URL(/^https?:\/\//i.test(endpointText) ? endpointText : `https://${endpointText}`);
  const xDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const date = xDate.slice(0, 8);
  const payloadHash = sha256(bytes);
  const canonicalUri = `/${encodeURIComponent(R2.bucket)}/${encodedPath(key)}`;
  const headers = {
    "cache-control": "public, max-age=31536000, immutable",
    "content-type": contentType,
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

async function uploadFile(name, contentType) {
  const key = `assets/home/ambient/${name}`;
  const filePath = path.join(ROOT, "assets", "home", "ambient", name);
  const bytes = await fs.readFile(filePath);
  const auth = uploadAuth(key, bytes, contentType);
  const response = await fetch(auth.url, { method: "PUT", headers: auth.headers, body: bytes });
  const responseText = await response.text();
  if (!response.ok) throw new Error(`R2 upload failed for ${name}: ${response.status} ${responseText}`);
  const publicUrl = `${String(R2.publicDomain).replace(/\/+$/, "")}/${key}`;
  let rangeStatus = 0;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const probe = await fetch(publicUrl, { headers: { range: "bytes=0-1023" }, cache: "no-store" });
    rangeStatus = probe.status;
    if ([200, 206].includes(rangeStatus)) break;
    await new Promise((resolve) => setTimeout(resolve, 750 * (attempt + 1)));
  }
  if (![200, 206].includes(rangeStatus)) throw new Error(`R2 public read failed for ${name}: ${rangeStatus}`);
  return { name, contentType, bytes: bytes.length, publicUrl, rangeStatus };
}

async function main() {
  required("R2_ACCESS_KEY_ID", R2.accessKey);
  required("R2_SECRET_ACCESS_KEY", R2.secretKey);
  required("R2_ENDPOINT", R2.endpoint);
  required("R2_BUCKET", R2.bucket);
  required("R2_PUBLIC_BASE_URL", R2.publicDomain);

  const results = [];
  for (const [name, contentType] of FILES) {
    results.push(await uploadFile(name, contentType));
  }
  console.log(JSON.stringify({ ok: true, bucket: R2.bucket, results }, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
