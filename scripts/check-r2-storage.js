"use strict";

const crypto = require("node:crypto");

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

function requireValue(label, value) {
  if (!value) throw new Error(`Missing ${label}`);
}

function hmac(key, data, encoding) {
  return crypto.createHmac("sha256", key).update(data).digest(encoding);
}

function sha256Hex(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function signAwsKey(secret, date, region, service) {
  return hmac(hmac(hmac(hmac(`AWS4${secret}`, date), region), service), "aws4_request");
}

function encodePathname(value) {
  return value.split("/").map((part) => encodeURIComponent(part)).join("/");
}

function uploadAuth(key, body, contentType) {
  const endpointText = String(R2.endpoint || "").trim().replace(/\/+$/, "");
  const endpoint = new URL(/^https?:\/\//i.test(endpointText) ? endpointText : `https://${endpointText}`);
  const xDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const date = xDate.slice(0, 8);
  const payloadHash = sha256Hex(body);
  const canonicalUri = `/${encodeURIComponent(R2.bucket)}/${encodePathname(key)}`;
  const headers = {
    "content-type": contentType,
    host: endpoint.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": xDate,
  };
  const sortedKeys = Object.keys(headers).sort();
  const signedHeaders = sortedKeys.join(";");
  const canonicalHeaders = sortedKeys.map((header) => `${header}:${headers[header]}\n`).join("");
  const canonicalRequest = ["PUT", canonicalUri, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = `${date}/${R2.region}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", xDate, scope, sha256Hex(canonicalRequest)].join("\n");
  const signature = hmac(signAwsKey(R2.secretKey, date, R2.region, "s3"), stringToSign, "hex");
  return {
    url: `${endpoint.protocol}//${endpoint.host}${canonicalUri}`,
    headers: {
      ...headers,
      authorization: `AWS4-HMAC-SHA256 Credential=${R2.accessKey}/${scope},SignedHeaders=${signedHeaders},Signature=${signature}`,
    },
  };
}

async function main() {
  requireValue("R2_ACCESS_KEY_ID", R2.accessKey);
  requireValue("R2_SECRET_ACCESS_KEY", R2.secretKey);
  requireValue("R2_ENDPOINT", R2.endpoint);
  requireValue("R2_BUCKET", R2.bucket);
  requireValue("R2_PUBLIC_BASE_URL", R2.publicDomain);

  const slug = String(process.env.SITE_STORAGE_SLUG || "site").replace(/[^a-z0-9._-]+/gi, "-");
  const key = `healthchecks/${slug}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.txt`;
  const body = Buffer.from(`r2-storage-ok:${new Date().toISOString()}\n`);
  const auth = uploadAuth(key, body, "text/plain; charset=utf-8");
  const upload = await fetch(auth.url, { method: "PUT", headers: auth.headers, body });
  const uploadText = await upload.text();
  if (!upload.ok) throw new Error(`R2 upload failed: ${upload.status} ${uploadText}`);

  const publicUrl = `${String(R2.publicDomain).replace(/\/+$/, "")}/${key}`;
  let lastStatus = 0;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const response = await fetch(`${publicUrl}?check=${Date.now()}`, { cache: "no-store" });
    lastStatus = response.status;
    if (response.ok && Buffer.from(await response.arrayBuffer()).equals(body)) {
      console.log(JSON.stringify({ ok: true, bucket: R2.bucket, publicUrl }, null, 2));
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error(`R2 public read failed: ${lastStatus} ${publicUrl}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
