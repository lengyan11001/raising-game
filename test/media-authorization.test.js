const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

process.env.MEDIA_URL_SIGNING_SECRET = "media-authorization-test-secret";
process.env.DISABLE_R2_STORAGE = "1";
process.env.STORAGE_PROVIDER = "local";

const application = require("../server");

const uploadPath = "/assets/user-uploads/user-1/asset-1.png";

test("release tooling can create the media key before the service restarts", () => {
  const root = path.resolve(__dirname, "..");
  const builder = fs.readFileSync(path.join(root, "scripts", "build_release_snapshot.py"), "utf8");
  const deploy = fs.readFileSync(path.join(root, "scripts", "deploy_site.py"), "utf8");
  const helper = fs.readFileSync(path.join(root, "scripts", "ensure_media_signing_secret.py"), "utf8");
  assert.match(builder, /scripts\/ensure_media_signing_secret\.py/);
  assert.match(deploy, /scripts\/ensure_media_signing_secret\.py/);
  assert.match(helper, /MEDIA_URL_SIGNING_SECRET/);
  assert.doesNotMatch(helper, /print\((?:value|secret)/i);
});

test("local user-upload signatures accept only the exact unexpired path", () => {
  const signed = application.signLocalUserUploadPath(uploadPath, Date.now() + 60_000);
  assert.ok(signed?.signature);
  const params = new URLSearchParams({ expires: String(signed.expires), signature: signed.signature });
  assert.equal(application.verifyLocalUserUploadSignature(uploadPath, params), true);

  const tampered = new URLSearchParams(params);
  tampered.set("signature", `${signed.signature[0] === "A" ? "B" : "A"}${signed.signature.slice(1)}`);
  assert.equal(application.verifyLocalUserUploadSignature(uploadPath, tampered), false);
  assert.equal(application.verifyLocalUserUploadSignature("/assets/user-uploads/user-1/asset-2.png", params), false);

  const expiredAt = Date.now() - 60_000;
  const expiredSignature = crypto.createHmac("sha256", process.env.MEDIA_URL_SIGNING_SECRET)
    .update(`${uploadPath}\n${expiredAt}`)
    .digest("base64url");
  assert.equal(application.verifyLocalUserUploadSignature(uploadPath, new URLSearchParams({
    expires: String(expiredAt),
    signature: expiredSignature,
  })), false);
});

test("local user-upload signing rejects traversal and encoded path confusion", () => {
  for (const pathname of [
    "/assets/user-uploads/user-1/../admin/home/private.png",
    "/assets/user-uploads/user-1/%2e%2e/admin/home/private.png",
    "/assets/user-uploads/user-1\\admin\\private.png",
    "/assets/user-uploads/./user-1/private.png",
    "/assets/user-uploads//user-1/private.png",
  ]) {
    assert.equal(application.signLocalUserUploadPath(pathname), "", pathname);
  }
});

test("public user assets and generation records never expose bare local upload URLs", () => {
  const asset = application.publicUserAsset({
    id: "asset-1",
    userId: "user-1",
    name: "asset.png",
    mime: "image/png",
    localUrl: uploadPath,
    publicUrl: uploadPath,
    cdnUrl: uploadPath,
  });
  const serializedAsset = JSON.stringify(asset);
  assert.doesNotMatch(serializedAsset, /"\/assets\/user-uploads\/user-1\/asset-1\.png"/);
  assert.match(asset.localUrl, /^\/assets\/user-uploads\/user-1\/asset-1\.png\?expires=\d+&signature=/);
  assert.match(asset.localHttpUrl, /^https:\/\/123vips\.com\/assets\/user-uploads\/user-1\/asset-1\.png\?expires=\d+&signature=/);

  const record = application.publicGenerationRecord({
    taskId: "task-1",
    status: "succeeded",
    mediaAssets: [{ id: "asset-1", name: "asset.png", localUrl: uploadPath, url: uploadPath }],
  });
  const serializedRecord = JSON.stringify(record.mediaAssets);
  assert.doesNotMatch(serializedRecord, /"\/assets\/user-uploads\/user-1\/asset-1\.png"/);
  assert.match(serializedRecord, /expires=\d+&signature=/);
});

test("uploaded assets prefer an object-storage mirror and use local signatures only as fallback", () => {
  const asset = application.publicUserAsset({
    id: "asset-1",
    userId: "user-1",
    name: "asset.png",
    mime: "image/png",
    localUrl: uploadPath,
    publicUrl: "https://media.123vips.com/assets/user-uploads/user-1/asset-1.png",
    cdnUrl: "https://media.123vips.com/assets/user-uploads/user-1/asset-1.png",
  });
  assert.equal(asset.publicUrl, "https://media.123vips.com/assets/user-uploads/user-1/asset-1.png");
  assert.equal(asset.previewUrl, "https://media.123vips.com/assets/user-uploads/user-1/asset-1.png");
  assert.match(asset.localUrl, /^\/assets\/user-uploads\/user-1\/asset-1\.png\?expires=\d+&signature=/);
  assert.match(application.publicHttpUrlForUpstream(uploadPath), /^https:\/\/123vips\.com\/assets\/user-uploads\/user-1\/asset-1\.png\?expires=\d+&signature=/);
  assert.match(application.publicHttpUrlForUpstream(asset.localUrl), /^https:\/\/123vips\.com\/assets\/user-uploads\/user-1\/asset-1\.png\?expires=\d+&signature=/);
});
