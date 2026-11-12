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
const userCharacterPath = "/assets/user-characters/user-1/character-1.png";
const apizPath = "/assets/generated/characters/apiz/task-1/sheet.jpeg";
const panoramaPath = "/assets/generated/panoramas/user-1/scene-1.jpg";
const publicCharacterPath = "/assets/generated/characters/aria360/portrait.png";

function assertSignedUrl(url, pathname) {
  const escaped = pathname.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  assert.match(url, new RegExp(`^(?:https:\\/\\/123vips\\.com)?${escaped}\\?expires=\\d+&signature=`));
}

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

test("default local-media signatures stay stable inside the expiry bucket", () => {
  const originalNow = Date.now;
  const bucketStart = 1_800_000_000_000 - (1_800_000_000_000 % (15 * 60 * 1000));
  try {
    Date.now = () => bucketStart + 60_000;
    const first = application.signLocalMediaPath(uploadPath);
    Date.now = () => bucketStart + 14 * 60_000;
    const second = application.signLocalMediaPath(uploadPath);
    assert.deepEqual(second, first);
    assert.ok(first.expires > bucketStart + 14 * 60_000);

    Date.now = () => bucketStart + 15 * 60_000;
    const nextBucket = application.signLocalMediaPath(uploadPath);
    assert.notEqual(nextBucket.expires, first.expires);
    assert.equal(application.verifyLocalMediaSignature(uploadPath, new URLSearchParams({
      expires: String(first.expires),
      signature: first.signature,
    })), true);
  } finally {
    Date.now = originalNow;
  }
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

test("protected media signatures cover private character and panorama paths", () => {
  for (const pathname of [userCharacterPath, apizPath, panoramaPath]) {
    assert.equal(application.isProtectedLocalMediaPath(pathname), true, pathname);
    const signed = application.signLocalMediaPath(pathname, Date.now() + 60_000);
    assert.ok(signed?.signature, pathname);
    const params = new URLSearchParams({ expires: String(signed.expires), signature: signed.signature });
    assert.equal(application.verifyLocalMediaSignature(pathname, params), true, pathname);

    const tampered = new URLSearchParams(params);
    tampered.set("signature", `${signed.signature[0] === "A" ? "B" : "A"}${signed.signature.slice(1)}`);
    assert.equal(application.verifyLocalMediaSignature(pathname, tampered), false, pathname);

    const expiredAt = Date.now() - 60_000;
    const expiredSignature = crypto.createHmac("sha256", process.env.MEDIA_URL_SIGNING_SECRET)
      .update(`${pathname}\n${expiredAt}`)
      .digest("base64url");
    assert.equal(application.verifyLocalMediaSignature(pathname, new URLSearchParams({
      expires: String(expiredAt),
      signature: expiredSignature,
    })), false, pathname);
    assertSignedUrl(application.localMediaDeliveryUrl(pathname), pathname);
  }
  assert.equal(application.isProtectedLocalMediaPath(publicCharacterPath), false);
  assert.equal(application.localMediaDeliveryUrl(publicCharacterPath), "");
  assert.equal(application.verifyLocalMediaSignature(publicCharacterPath, new URLSearchParams()), false);
});

test("protected media signing rejects traversal and path confusion for every private prefix", () => {
  for (const pathname of [
    "/assets/user-characters/user-1/../admin/home/private.png",
    "/assets/generated/characters/apiz/task-1/%2e%2e/admin/home/private.png",
    "/assets/generated/panoramas/user-1\\private.jpg",
    "/assets/generated/panoramas/./user-1/private.jpg",
    "/assets/generated/panoramas//user-1/private.jpg",
  ]) {
    assert.equal(application.signLocalMediaPath(pathname), "", pathname);
  }
});

test("public user characters never expose bare protected local media URLs", () => {
  const character = application.publicUserCharacter({
    id: "character-1",
    userId: "user-1",
    name: "Private character",
    localImageUrl: userCharacterPath,
    posterUrl: userCharacterPath,
    sourceImageUrl: userCharacterPath,
    publicImageUrl: userCharacterPath,
    cdnImageUrl: userCharacterPath,
    videoUrl: apizPath,
    sceneVideos: {
      scene1: { videoUrl: panoramaPath, posterUrl: userCharacterPath },
    },
  });
  const serialized = JSON.stringify(character);
  for (const pathname of [userCharacterPath, apizPath, panoramaPath]) {
    assert.doesNotMatch(serialized, new RegExp(`"${pathname.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  }
  assertSignedUrl(character.localImageUrl, userCharacterPath);
  assertSignedUrl(character.posterUrl, userCharacterPath);
  assertSignedUrl(character.sourceImageUrl, userCharacterPath);
  assertSignedUrl(character.publicImageUrl, userCharacterPath);
  assertSignedUrl(character.cdnImageUrl, userCharacterPath);
  assertSignedUrl(character.videoUrl, apizPath);
  assertSignedUrl(character.sceneVideos.scene1.videoUrl, panoramaPath);
  assertSignedUrl(character.sceneVideos.scene1.posterUrl, userCharacterPath);
  assertSignedUrl(character.sceneVideos.scene1.localPosterUrl, userCharacterPath);
  assertSignedUrl(character.sceneVideos.scene1.coverUrl, userCharacterPath);
  assertSignedUrl(character.sceneVideos.scene1.thumbnailUrl, userCharacterPath);
});

test("upstream URLs sign private characters, APiz sheets, and panoramas", () => {
  for (const pathname of [userCharacterPath, apizPath, panoramaPath]) {
    assertSignedUrl(application.publicHttpUrlForUpstream(pathname), pathname);
    assertSignedUrl(application.publicHttpUrlForUpstream(`https://123vips.com${pathname}`), pathname);
  }
  assert.equal(application.publicHttpUrlForUpstream(publicCharacterPath), "https://123vips.com/assets/generated/characters/aria360/portrait.png");
});

test("upstream-only local media signatures outlive delivery signatures without changing normal previews", () => {
  const ordinary = new URL(application.localMediaDeliveryUrl(uploadPath, { absolute: true }));
  const upstream = new URL(application.localMediaDeliveryUrlForUpstream(uploadPath, { absolute: true }));
  const nowSeconds = Math.floor(Date.now() / 1000);
  assert.ok(Number(ordinary.searchParams.get("expires")) < Number(upstream.searchParams.get("expires")) - 11 * 60 * 60);
  assert.ok(Number(upstream.searchParams.get("expires")) > nowSeconds + 11 * 60 * 60);
  assert.ok(Number(new URL(application.publicHttpUrlForUpstream(uploadPath)).searchParams.get("expires")) > nowSeconds + 11 * 60 * 60);
  assert.equal(application.verifyLocalMediaSignature(uploadPath, upstream.searchParams), true);
});

test("public user assets fail closed for protected local paths without signing", () => {
  const original = process.env.MEDIA_URL_SIGNING_SECRET;
  process.env.MEDIA_URL_SIGNING_SECRET = "";
  process.env.SESSION_SECRET = "";
  try {
    const asset = application.publicUserAsset({
      id: "asset-1",
      userId: "user-1",
      name: "asset.png",
      localUrl: userCharacterPath,
      publicUrl: userCharacterPath,
      cdnUrl: userCharacterPath,
    });
    assert.equal(asset.localUrl, "");
    assert.equal(asset.localHttpUrl, "");
    assert.equal(asset.publicUrl, "");
    assert.equal(asset.previewUrl, "");
  } finally {
    process.env.MEDIA_URL_SIGNING_SECRET = original;
  }
});
