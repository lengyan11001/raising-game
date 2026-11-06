"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");

const DEFAULT_PART_SIZE = 8 * 1024 * 1024;
const DEFAULT_MULTIPART_THRESHOLD = 8 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_RETRIES = 5;
const ALLOWED_OSS_REGIONS = new Set([
  "oss-ap-southeast-1",
  "oss-us-west-1",
  "oss-us-east-1",
]);

function positiveInt(value, fallback, min = 1) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min ? Math.floor(parsed) : fallback;
}

function boolValue(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return /^(1|true|yes|on)$/i.test(String(value).trim());
}

function trimSlash(value = "") {
  return String(value || "").trim().replace(/\/+$/, "");
}

function ossRegionAllowed(region = "") {
  return ALLOWED_OSS_REGIONS.has(String(region || "").trim().toLowerCase());
}

function ossEndpointRegion(endpoint = "") {
  const raw = trimSlash(endpoint);
  if (!raw) return "";
  let hostname = "";
  try {
    hostname = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.toLowerCase();
  } catch {
    return "";
  }
  const match = hostname.match(/^(oss-[a-z0-9-]+?)(?:-internal)?\.aliyuncs\.com$/i);
  return match ? match[1].toLowerCase() : "";
}

function assertOssRegionAllowed(region = "", endpoint = "") {
  const normalizedRegion = String(region || "").trim().toLowerCase();
  const endpointRegion = ossEndpointRegion(endpoint);
  if (!ossRegionAllowed(normalizedRegion)) {
    const error = new Error(`OSS_REGION must be Singapore or US only (allowed: ${[...ALLOWED_OSS_REGIONS].join(", ")}); got ${normalizedRegion || "<empty>"}.`);
    error.code = "OSS_REGION_NOT_ALLOWED";
    error.statusCode = 503;
    throw error;
  }
  if (!endpointRegion || endpointRegion !== normalizedRegion) {
    const error = new Error(`OSS_ENDPOINT must use the selected Singapore or US OSS region ${normalizedRegion}.`);
    error.code = "OSS_ENDPOINT_NOT_ALLOWED";
    error.statusCode = 503;
    throw error;
  }
  return true;
}

function assertOssCdnRegionAllowed(region = "", cdnRegion = "", cdnBaseUrl = "") {
  const normalizedRegion = String(region || "").trim().toLowerCase();
  const normalizedCdnRegion = String(cdnRegion || normalizedRegion).trim().toLowerCase();
  if (!ossRegionAllowed(normalizedCdnRegion)) {
    const error = new Error(`OSS_CDN_REGION must be Singapore or US only (allowed: ${[...ALLOWED_OSS_REGIONS].join(", ")}); got ${normalizedCdnRegion || "<empty>"}.`);
    error.code = "OSS_CDN_REGION_NOT_ALLOWED";
    error.statusCode = 503;
    throw error;
  }
  if (normalizedCdnRegion !== normalizedRegion) {
    const error = new Error(`OSS_CDN_REGION must match OSS_REGION (${normalizedRegion}); got ${normalizedCdnRegion}.`);
    error.code = "OSS_CDN_REGION_MISMATCH";
    error.statusCode = 503;
    throw error;
  }
  if (!cdnBaseUrl) return true;
  let hostname = "";
  try {
    const parsed = new URL(cdnBaseUrl);
    if (parsed.protocol !== "https:") throw new Error("not https");
    hostname = parsed.hostname.toLowerCase();
  } catch {
    const error = new Error("OSS_CDN_BASE_URL must be a valid HTTPS CDN hostname.");
    error.code = "OSS_CDN_BASE_URL_INVALID";
    error.statusCode = 503;
    throw error;
  }
  // A CDN base must be the accelerated hostname, never an OSS origin or a
  // mainland-China Alibaba endpoint. Custom CNAMEs can then be checked against
  // the selected CDN acceleration region in the deployment checklist.
  if (hostname === "aliyuncs.com" || hostname.endsWith(".aliyuncs.com") || /(^|\.)oss-cn-/i.test(hostname)) {
    const error = new Error("OSS_CDN_BASE_URL must use an overseas CDN hostname, not an Alibaba OSS origin or mainland endpoint.");
    error.code = "OSS_CDN_BASE_URL_NOT_ALLOWED";
    error.statusCode = 503;
    throw error;
  }
  return true;
}

function ossConfig(env = process.env) {
  const region = String(env.OSS_REGION || "oss-ap-southeast-1").trim().toLowerCase();
  const bucket = String(env.OSS_BUCKET || "").trim();
  const endpoint = trimSlash(env.OSS_ENDPOINT || (region ? `https://${region}.aliyuncs.com` : ""));
  const cdnRegion = String(env.OSS_CDN_REGION || region).trim().toLowerCase();
  const cdnBaseUrl = trimSlash(env.OSS_CDN_BASE_URL || env.OSS_PUBLIC_BASE_URL || "");
  const provider = String(env.STORAGE_PROVIDER || "").trim().toLowerCase();
  assertOssRegionAllowed(region, endpoint);
  assertOssCdnRegionAllowed(region, cdnRegion, cdnBaseUrl);
  const config = {
    provider,
    accessKeyId: String(env.OSS_ACCESS_KEY_ID || "").trim(),
    accessKeySecret: String(env.OSS_ACCESS_KEY_SECRET || "").trim(),
    region,
    bucket,
    endpoint,
    cdnBaseUrl,
    cdnRegion,
    keyPrefix: String(env.OSS_KEY_PREFIX || env.STORAGE_KEY_PREFIX || "").trim().replace(/^\/+|\/+$/g, ""),
    partSize: Math.max(5 * 1024 * 1024, positiveInt(env.OSS_MULTIPART_PART_SIZE_BYTES, DEFAULT_PART_SIZE)),
    multipartThreshold: Math.max(5 * 1024 * 1024, positiveInt(env.OSS_MULTIPART_THRESHOLD_BYTES, DEFAULT_MULTIPART_THRESHOLD)),
    concurrency: Math.max(1, Math.min(8, positiveInt(env.OSS_MULTIPART_CONCURRENCY, 3))),
    timeoutMs: Math.max(30_000, positiveInt(env.OSS_UPLOAD_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, 30_000)),
    signedUrlTtlSeconds: Math.max(60, Math.min(3600, positiveInt(env.OSS_SIGNED_URL_TTL_SECONDS, 600, 60))),
    // Alibaba Cloud OSS requires virtual-hosted bucket addressing for its
    // regional endpoints; path-style requests fail with
    // SecondLevelDomainForbidden. Ignore legacy OSS_FORCE_PATH_STYLE=1 values
    // instead of breaking an otherwise valid overseas deployment.
    forcePathStyle: false,
  };
  if (provider === "oss" && !ossConfigured(config)) {
    const missing = [
      ["OSS_ACCESS_KEY_ID", config.accessKeyId],
      ["OSS_ACCESS_KEY_SECRET", config.accessKeySecret],
      ["OSS_BUCKET", config.bucket],
      ["OSS_ENDPOINT", config.endpoint],
      ["OSS_CDN_BASE_URL", config.cdnBaseUrl],
    ].filter(([, value]) => !value).map(([name]) => name);
    const error = new Error(`STORAGE_PROVIDER=oss requires complete OSS configuration; missing: ${missing.join(", ")}.`);
    error.code = "OSS_NOT_CONFIGURED";
    error.statusCode = 503;
    throw error;
  }
  return config;
}

function ossConfigured(config = ossConfig()) {
  return Boolean(config.accessKeyId && config.accessKeySecret && config.bucket && config.endpoint && config.cdnBaseUrl);
}

function ossEnabled(config = ossConfig()) {
  if (config.provider && config.provider !== "oss") return false;
  return ossConfigured(config);
}

function encodeRfc3986(value) {
  return encodeURIComponent(String(value)).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function encodeKeyPath(key = "") {
  return String(key || "")
    .replace(/^\/+/, "")
    .split("/")
    .map((segment) => encodeRfc3986(segment))
    .join("/");
}

function endpointUrl(config = ossConfig()) {
  const raw = trimSlash(config.endpoint || "");
  if (!raw) throw Object.assign(new Error("Missing OSS_ENDPOINT"), { code: "OSS_NOT_CONFIGURED", statusCode: 503 });
  const parsed = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  return parsed;
}

function objectHost(config = ossConfig()) {
  const endpoint = endpointUrl(config);
  if (!config.forcePathStyle) return `${config.bucket}.${endpoint.host}`;
  return endpoint.host;
}

function objectPathname(config, key) {
  const encodedKey = encodeKeyPath(key);
  return config.forcePathStyle
    ? `/${encodeRfc3986(config.bucket)}/${encodedKey}`
    : `/${encodedKey}`;
}

function objectUrl(config, key) {
  const endpoint = endpointUrl(config);
  return `${endpoint.protocol}//${objectHost(config)}${objectPathname(config, key)}`;
}

function canonicalOssQuery(params = {}) {
  return Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => [String(key), String(value)])
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, value]) => `${encodeRfc3986(key)}=${encodeRfc3986(value)}`)
    .join("&");
}

function contentMd5(body = Buffer.alloc(0)) {
  return crypto.createHash("md5").update(body).digest("base64");
}

function ossAuthorization({ method, key, body = Buffer.alloc(0), contentType = "", headers = {}, query = {}, config = ossConfig() }) {
  const date = new Date().toUTCString();
  const ossHeaders = Object.entries({ "x-oss-date": date, ...headers })
    .filter(([name]) => name.toLowerCase().startsWith("x-oss-"))
    .map(([name, value]) => [name.toLowerCase(), String(value).trim()])
    .sort(([a], [b]) => a.localeCompare(b));
  const canonicalOssHeaders = ossHeaders.map(([name, value]) => `${name}:${value}\n`).join("");
  // OSS V1 CanonicalizedResource always begins with the bucket, including for
  // virtual-hosted requests. objectPathname() intentionally omits the bucket
  // from the HTTP path in virtual-host mode, so build the signing resource
  // separately.
  const resource = `/${encodeRfc3986(config.bucket)}/${encodeKeyPath(key)}`;
  const canonicalResource = `${resource}${Object.keys(query).length ? `?${canonicalOssQuery(query)}` : ""}`;
  const stringToSign = [
    method.toUpperCase(),
    body.length ? contentMd5(body) : "",
    String(contentType || "").trim(),
    date,
    `${canonicalOssHeaders}${canonicalResource}`,
  ].join("\n");
  const signature = crypto.createHmac("sha1", config.accessKeySecret).update(stringToSign).digest("base64");
  return {
    authorization: `OSS ${config.accessKeyId}:${signature}`,
    date,
    headers: Object.fromEntries(ossHeaders),
  };
}

function signedRequestOptions({ method, key, body = Buffer.alloc(0), contentType = "", query = {}, config = ossConfig() }) {
  const auth = ossAuthorization({ method, key, body, contentType, query, config });
  const queryText = canonicalOssQuery(query);
  return {
    url: `${objectUrl(config, key)}${queryText ? `?${queryText}` : ""}`,
    headers: {
      Date: auth.date,
      Authorization: auth.authorization,
      ...(contentType ? { "Content-Type": contentType } : {}),
      ...(body.length ? { "Content-MD5": contentMd5(body) } : {}),
      ...auth.headers,
    },
    auth,
  };
}

function responseError(label, response, text = "") {
  const error = new Error(`${label}: ${response.status} ${String(text || "").slice(0, 500)}`);
  error.statusCode = 502;
  error.retryable = response.status === 429 || response.status >= 500;
  return error;
}

async function requestWithRetry(run, label, config = ossConfig()) {
  let lastError = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      return await run(attempt);
    } catch (error) {
      lastError = error;
      const timeout = error?.name === "TimeoutError" || error?.name === "AbortError";
      const retryable = timeout || error?.retryable !== false;
      if (!retryable || attempt >= MAX_RETRIES) throw error;
      await new Promise((resolve) => setTimeout(resolve, Math.min(10_000, 500 * 2 ** (attempt - 1))));
    }
  }
  throw lastError || new Error(`${label} failed`);
}

async function putObject({ key, bytes, mime = "application/octet-stream", config = ossConfig() }) {
  const body = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  return requestWithRetry(async () => {
    const request = signedRequestOptions({ method: "PUT", key, body, contentType: mime, config });
    const response = await fetch(request.url, {
      method: "PUT",
      headers: request.headers,
      body,
      signal: AbortSignal.timeout(config.timeoutMs),
    });
    if (!response.ok) throw responseError("OSS PUT failed", response, await response.text());
    return { key, provider: "oss", publicUrl: publicUrlForKey(key, config), etag: response.headers.get("etag") || "" };
  }, `OSS PUT ${key}`, config);
}

async function deleteObject({ key, config = ossConfig() }) {
  const request = signedRequestOptions({ method: "DELETE", key, config });
  const response = await fetch(request.url, {
    method: "DELETE",
    headers: request.headers,
    signal: AbortSignal.timeout(config.timeoutMs),
  });
  if (!response.ok && response.status !== 404) throw responseError("OSS DELETE failed", response, await response.text());
  return true;
}

function parseUploadId(xml = "") {
  return String(xml).match(/<UploadId>([^<]+)<\/UploadId>/i)?.[1] || "";
}

async function initiateMultipart({ key, mime = "application/octet-stream", config = ossConfig() }) {
  return requestWithRetry(async () => {
    const request = signedRequestOptions({ method: "POST", key, contentType: mime, query: { uploads: "" }, config });
    const response = await fetch(request.url, {
      method: "POST",
      headers: request.headers,
      signal: AbortSignal.timeout(config.timeoutMs),
    });
    const text = await response.text();
    if (!response.ok) throw responseError("OSS multipart initiate failed", response, text);
    const uploadId = parseUploadId(text);
    if (!uploadId) throw new Error("OSS multipart initiate returned no upload id");
    return uploadId;
  }, `OSS multipart initiate ${key}`, config);
}

async function uploadPart({ key, uploadId, partNumber, body, config = ossConfig() }) {
  return requestWithRetry(async () => {
    const request = signedRequestOptions({
      method: "PUT",
      key,
      body,
      query: { partNumber: String(partNumber), uploadId },
      config,
    });
    const response = await fetch(request.url, {
      method: "PUT",
      headers: request.headers,
      body,
      signal: AbortSignal.timeout(config.timeoutMs),
    });
    const text = await response.text();
    if (!response.ok) throw responseError(`OSS multipart part ${partNumber} failed`, response, text);
    return { partNumber, etag: response.headers.get("etag") || "" };
  }, `OSS multipart part ${partNumber}`, config);
}

async function completeMultipart({ key, uploadId, parts, config = ossConfig() }) {
  const xml = Buffer.from(
    `<CompleteMultipartUpload>${parts
      .sort((a, b) => a.partNumber - b.partNumber)
      .map((part) => `<Part><PartNumber>${part.partNumber}</PartNumber><ETag>${part.etag.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</ETag></Part>`)
      .join("")}</CompleteMultipartUpload>`,
    "utf8",
  );
  return requestWithRetry(async () => {
    const request = signedRequestOptions({
      method: "POST",
      key,
      body: xml,
      contentType: "application/xml",
      query: { uploadId },
      config,
    });
    const response = await fetch(request.url, {
      method: "POST",
      headers: request.headers,
      body: xml,
      signal: AbortSignal.timeout(config.timeoutMs),
    });
    const text = await response.text();
    if (!response.ok) throw responseError("OSS multipart complete failed", response, text);
    return { key, provider: "oss", publicUrl: publicUrlForKey(key, config) };
  }, `OSS multipart complete ${key}`, config);
}

async function abortMultipart({ key, uploadId, config = ossConfig() }) {
  const request = signedRequestOptions({ method: "DELETE", key, query: { uploadId }, config });
  await fetch(request.url, {
    method: "DELETE",
    headers: request.headers,
    signal: AbortSignal.timeout(Math.min(config.timeoutMs, 60_000)),
  }).catch(() => {});
}

async function uploadMultipart({ key, bytes, mime, config = ossConfig() }) {
  const body = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const uploadId = await initiateMultipart({ key, mime, config });
  const parts = new Array(Math.ceil(body.length / config.partSize));
  try {
    const partCount = Math.ceil(body.length / config.partSize);
    let next = 0;
    const worker = async () => {
      while (true) {
        const index = next++;
        if (index >= partCount) return;
        const partNumber = index + 1;
        parts[partNumber - 1] = await uploadPart({
          key,
          uploadId,
          partNumber,
          body: body.subarray(index * config.partSize, Math.min(body.length, (index + 1) * config.partSize)),
          config,
        });
      }
    };
    await Promise.all(Array.from({ length: Math.min(config.concurrency, partCount) }, () => worker()));
    return await completeMultipart({ key, uploadId, parts, config });
  } catch (error) {
    await abortMultipart({ key, uploadId, config });
    throw error;
  }
}

async function uploadObject({ key, bytes, mime = "application/octet-stream", config = ossConfig() }) {
  const body = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  if (body.length >= config.multipartThreshold) return uploadMultipart({ key, bytes: body, mime, config });
  return putObject({ key, bytes: body, mime, config });
}

async function uploadFileObject({ key, filePath, mime = "application/octet-stream", config = ossConfig() }) {
  const file = await fs.open(filePath, "r");
  try {
    const stat = await file.stat();
    if (stat.size < config.multipartThreshold) {
      const body = await file.readFile();
      return putObject({ key, bytes: body, mime, config });
    }
    const uploadId = await initiateMultipart({ key, mime, config });
    const parts = new Array(Math.ceil(stat.size / config.partSize));
    try {
      const partCount = Math.ceil(stat.size / config.partSize);
      let next = 0;
      const worker = async () => {
        while (true) {
          const index = next++;
          if (index >= partCount) return;
          const partNumber = index + 1;
          const start = index * config.partSize;
          const length = Math.min(config.partSize, stat.size - start);
          const body = Buffer.allocUnsafe(length);
          const { bytesRead } = await file.read(body, 0, length, start);
          if (bytesRead !== length) throw new Error(`Short read for OSS part ${partNumber}: expected ${length}, got ${bytesRead}`);
          const uploaded = await uploadPart({ key, uploadId, partNumber, body, config });
          parts[partNumber - 1] = uploaded;
        }
      };
      await Promise.all(Array.from({ length: Math.min(config.concurrency, partCount) }, () => worker()));
      return await completeMultipart({ key, uploadId, parts, config });
    } catch (error) {
      await abortMultipart({ key, uploadId, config });
      throw error;
    }
  } finally {
    await file.close().catch(() => {});
  }
}

function publicUrlForKey(key = "", config = ossConfig()) {
  const cleanKey = String(key || "").replace(/^\/+/, "");
  return cleanKey && config.cdnBaseUrl ? `${trimSlash(config.cdnBaseUrl)}/${encodeKeyPath(cleanKey)}` : "";
}

function attachmentDisposition(fileName = "download") {
  return `attachment; filename="${String(fileName).replace(/[^a-z0-9._-]/gi, "-")}"; filename*=UTF-8''${encodeRfc3986(fileName)}`;
}

function signedMediaUrl({ key, fileName = "", contentType = "", download = false, expiresSeconds, config = ossConfig() }) {
  if (!ossConfigured(config) || !key) return "";
  const expires = Math.max(60, Math.min(3600, Number(expiresSeconds) || config.signedUrlTtlSeconds));
  const expiresAt = Math.floor(Date.now() / 1000) + expires;
  const query = {};
  if (download) query["response-content-disposition"] = attachmentDisposition(fileName || "download");
  // OSS V1 presigned URLs use Expires in the Date position of the string to
  // sign. Response overrides are subresources and are appended to the
  // CanonicalizedResource with their decoded values, matching the official
  // ali-oss SDK.
  const resource = `/${encodeRfc3986(config.bucket)}/${encodeKeyPath(key)}`;
  const canonicalQuery = Object.keys(query)
    .sort()
    .map((name) => `${name}=${query[name]}`)
    .join("&");
  const stringToSign = `GET\n\n\n${expiresAt}\n${resource}${canonicalQuery ? `?${canonicalQuery}` : ""}`;
  const signature = crypto.createHmac("sha1", config.accessKeySecret).update(stringToSign).digest("base64");
  const signedQuery = canonicalOssQuery({
    ...query,
    Expires: String(expiresAt),
    OSSAccessKeyId: config.accessKeyId,
    Signature: signature,
  });
  return `${objectUrl(config, key)}?${signedQuery}`;
}

function signedDownloadUrl(options = {}) {
  return signedMediaUrl({
    ...options,
    fileName: options.fileName || "download",
    download: true,
  });
}

function signedCdnUrl(options = {}) {
  const originUrl = signedMediaUrl(options);
  if (!originUrl) return "";
  const config = options.config || ossConfig();
  if (!config.cdnBaseUrl) return "";
  const signed = new URL(originUrl);
  const cdn = new URL(trimSlash(config.cdnBaseUrl));
  const basePath = cdn.pathname.replace(/\/+$/, "");
  cdn.pathname = `${basePath}/${encodeKeyPath(options.key)}`;
  cdn.search = signed.search;
  return cdn.toString();
}

async function headObject({ key, config = ossConfig() }) {
  const request = signedRequestOptions({ method: "HEAD", key, config });
  const response = await fetch(request.url, {
    method: "HEAD",
    headers: request.headers,
    signal: AbortSignal.timeout(Math.min(config.timeoutMs, 60_000)),
  });
  return {
    ok: response.ok,
    status: response.status,
    contentLength: Number(response.headers.get("content-length") || 0) || 0,
    etag: response.headers.get("etag") || "",
  };
}

module.exports = {
  ossConfig,
  ossConfigured,
  ossEnabled,
  ossRegionAllowed,
  ossEndpointRegion,
  assertOssCdnRegionAllowed,
  uploadObject,
  uploadFileObject,
  putObject,
  uploadMultipart,
  signedDownloadUrl,
  signedCdnUrl,
  publicUrlForKey,
  headObject,
  deleteObject,
  signedRequestOptions,
  encodeRfc3986,
};
