const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const CHARACTER_ID = process.env.CHARACTER_ID || "aria";
const IMAGE_PATH = path.resolve(ROOT, process.env.CHARACTER_IMAGE || "assets/generated/characters/aria360/frame-0.png");
const ASSET_DATA_PATH = path.resolve(ROOT, "data/character-assets.json");

const TOS = {
  accessKey: process.env.TOS_ACCESS_KEY_ID,
  secretKey: process.env.TOS_SECRET_ACCESS_KEY,
  endpoint: process.env.TOS_ENDPOINT,
  region: process.env.TOS_REGION,
  bucket: process.env.TOS_BUCKET,
  publicDomain: process.env.TOS_PUBLIC_DOMAIN,
};

const ARK_OPENAPI = {
  accessKey: process.env.BYTEPLUS_ACCESS_KEY_ID || process.env.VOLC_ACCESS_KEY_ID,
  secretKey: process.env.BYTEPLUS_SECRET_ACCESS_KEY || process.env.VOLC_ACCESS_KEY_SECRET,
  host: process.env.BYTEPLUS_OPENAPI_HOST || "ark.ap-southeast-1.byteplusapi.com",
  region: process.env.BYTEPLUS_OPENAPI_REGION || "ap-southeast-1",
  service: process.env.BYTEPLUS_OPENAPI_SERVICE || "ark",
  version: process.env.BYTEPLUS_OPENAPI_VERSION || "2024-01-01",
  groupId: process.env.BYTEPLUS_ASSET_GROUP_ID || "group-20260429190412-6lzgq",
  projectName: process.env.BYTEPLUS_PROJECT_NAME || "xin",
};

function requireEnv(label, value) {
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

function makeArkAuth({ action, body }) {
  const { xDate, date } = amzDate();
  const query = new URLSearchParams({ Action: action, Version: ARK_OPENAPI.version }).toString();
  const payloadHash = sha256Hex(body);
  const headers = {
    "content-type": "application/json",
    host: ARK_OPENAPI.host,
    "x-content-sha256": payloadHash,
    "x-date": xDate,
  };
  const sortedKeys = Object.keys(headers).sort();
  const signedHeaders = sortedKeys.join(";");
  const canonicalHeaders = sortedKeys.map((header) => `${header}:${headers[header]}\n`).join("");
  const canonicalRequest = ["POST", "/", query, canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = `${date}/${ARK_OPENAPI.region}/${ARK_OPENAPI.service}/request`;
  const stringToSign = ["HMAC-SHA256", xDate, scope, sha256Hex(canonicalRequest)].join("\n");
  const signature = hmac(signKey(ARK_OPENAPI.secretKey, date, ARK_OPENAPI.region, ARK_OPENAPI.service), stringToSign, "hex");

  return {
    url: `https://${ARK_OPENAPI.host}/?${query}`,
    headers: {
      ...headers,
      authorization: `HMAC-SHA256 Credential=${ARK_OPENAPI.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  };
}

async function arkAction(action, payload) {
  const body = JSON.stringify(payload);
  const auth = makeArkAuth({ action, body });
  const response = await fetch(auth.url, {
    method: "POST",
    headers: auth.headers,
    body,
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : {};
  if (!response.ok || json.ResponseMetadata?.Error) {
    const error = json.ResponseMetadata?.Error;
    throw new Error(`${action} failed: ${error?.Code || response.status} ${error?.Message || text}`);
  }
  return json.Result || json;
}

async function uploadToTos() {
  const body = await fs.readFile(IMAGE_PATH);
  const key = `seedance-assets/raising-game/${CHARACTER_ID}/frame-0-${Date.now()}.png`;
  const auth = makeTosAuth({
    method: "PUT",
    key,
    body,
    contentType: "image/png",
  });
  const url = `https://${auth.host}${auth.canonicalUri}`;
  const response = await fetch(url, {
    method: "PUT",
    headers: auth.headers,
    body,
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`TOS upload failed: ${response.status} ${text}`);
  }
  return {
    key,
    tosUrl: url,
    publicUrl: `${TOS.publicDomain.replace(/\/$/, "")}/${key}`,
  };
}

function extractAssetId(result) {
  return result.Id || result.AssetId || result.Asset?.Id || result.Asset?.AssetId || result.Item?.Id || "";
}

async function updateCharacterAsset(assetUri, publicUrl, assetId) {
  let data = {};
  try {
    data = JSON.parse(await fs.readFile(ASSET_DATA_PATH, "utf8"));
  } catch {
    data = {};
  }

  data[CHARACTER_ID] = {
    ...(data[CHARACTER_ID] || {}),
    assetUri,
    assetId,
    publicUrl,
    localImage: `./assets/generated/characters/${CHARACTER_ID === "aria" ? "aria360" : CHARACTER_ID}/frame-0.png`,
    source: "BytePlus asset library",
    updatedAt: new Date().toISOString(),
  };

  await fs.mkdir(path.dirname(ASSET_DATA_PATH), { recursive: true });
  await fs.writeFile(ASSET_DATA_PATH, `${JSON.stringify(data, null, 2)}\n`);
}

async function main() {
  requireEnv("TOS_ACCESS_KEY_ID", TOS.accessKey);
  requireEnv("TOS_SECRET_ACCESS_KEY", TOS.secretKey);
  requireEnv("TOS_ENDPOINT", TOS.endpoint);
  requireEnv("TOS_REGION", TOS.region);
  requireEnv("TOS_BUCKET", TOS.bucket);
  requireEnv("TOS_PUBLIC_DOMAIN", TOS.publicDomain);
  requireEnv("BYTEPLUS_ACCESS_KEY_ID or VOLC_ACCESS_KEY_ID", ARK_OPENAPI.accessKey);
  requireEnv("BYTEPLUS_SECRET_ACCESS_KEY or VOLC_ACCESS_KEY_SECRET", ARK_OPENAPI.secretKey);

  console.log(`Uploading ${CHARACTER_ID} image to TOS...`);
  const uploaded = await uploadToTos();
  console.log(`Uploaded public URL: ${uploaded.publicUrl}`);

  console.log("Creating ModelArk asset...");
  const created = await arkAction("CreateAsset", {
    GroupId: ARK_OPENAPI.groupId,
    URL: uploaded.publicUrl,
    AssetType: "Image",
    Name: `raising-game-${CHARACTER_ID}-front-${Date.now()}`,
    ProjectName: ARK_OPENAPI.projectName,
  });

  const assetId = extractAssetId(created);
  if (!assetId) {
    throw new Error(`CreateAsset did not return asset id: ${JSON.stringify(created)}`);
  }

  const assetUri = `asset://${assetId}`;
  await updateCharacterAsset(assetUri, uploaded.publicUrl, assetId);
  console.log(`Created ${CHARACTER_ID} asset: ${assetUri}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
