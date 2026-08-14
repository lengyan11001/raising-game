"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
  minimumImageTargetDimensions,
  pngBufferHasTransparency,
  publicUrlMatchesStorageBase,
  referenceVideoDurationViolation,
} = require("../media-inputs");

const server = fs.readFileSync(path.resolve(__dirname, "..", "server.js"), "utf8");
const admin = fs.readFileSync(path.resolve(__dirname, "..", "admin.js"), "utf8");
const adminCss = fs.readFileSync(path.resolve(__dirname, "..", "admin.css"), "utf8");
const explore = fs.readFileSync(path.resolve(__dirname, "..", "platform.explore.js"), "utf8");
const officialPresets = fs.readFileSync(path.resolve(__dirname, "..", "scripts", "generate-official-presets.js"), "utf8");

test("small reference images are enlarged proportionally to the upstream minimum", () => {
  assert.deepEqual(minimumImageTargetDimensions(204, 204), {
    width: 300,
    height: 300,
    changed: true,
    scale: 300 / 204,
  });
  assert.deepEqual(minimumImageTargetDimensions(400, 600), {
    width: 400,
    height: 600,
    changed: false,
    scale: 1,
  });
});

test("PNG alpha channels and transparency chunks are detected without false positives", () => {
  const pngHeader = Buffer.alloc(33);
  pngHeader[0] = 0x89;
  pngHeader.write("PNG", 1, "ascii");
  pngHeader.writeUInt32BE(13, 8);
  pngHeader.write("IHDR", 12, "ascii");
  pngHeader[25] = 6;
  assert.equal(pngBufferHasTransparency(pngHeader), true);

  pngHeader[25] = 2;
  pngHeader.writeUInt32BE(0, 8);
  pngHeader.write("IDAT", 12, "ascii");
  assert.equal(pngBufferHasTransparency(pngHeader), false);

  const transparentPalettePng = Buffer.alloc(45);
  pngHeader.copy(transparentPalettePng, 0, 0, 33);
  transparentPalettePng.writeUInt32BE(1, 8);
  transparentPalettePng.write("tRNS", 12, "ascii");
  assert.equal(pngBufferHasTransparency(transparentPalettePng), true);
});

test("object storage mirrors must belong to the currently configured public domain", () => {
  assert.equal(
    publicUrlMatchesStorageBase(
      "https://media.123vips.com/seedance-assets/raising-game/users/reference.png",
      "https://media.123vips.com",
    ),
    true,
  );
  assert.equal(
    publicUrlMatchesStorageBase(
      "https://media.123vips.com/assets/user-uploads/reference.png",
      "https://pub-new2.r2.dev",
    ),
    false,
  );
});

test("every Seedance reference video is checked against the asset duration bounds", () => {
  assert.equal(referenceVideoDurationViolation([
    { label: "Video 1", durationSeconds: 8 },
    { label: "Video 2", durationSeconds: 15.2 },
  ]), null);
  assert.deepEqual(referenceVideoDurationViolation([
    { label: "Video 1", durationSeconds: 8 },
    { label: "Video 2", durationSeconds: 15.9667 },
  ]), {
    index: 1,
    label: "Video 2",
    durationSeconds: 15.9667,
    minSeconds: 1.8,
    maxSeconds: 15.2,
  });
});

test("server applies media checks before upstream generation and mirrors tool uploads", () => {
  assert.match(server, /function seedanceContentFromReferences\(\{[\s\S]*?referenceAudioAssetUris = \[\],[\s\S]*?body = \{\},/);
  assert.match(server, /await validateSeedanceReferenceVideoDurationsForRequest\(\{ urls: pricingBody\.reference_videos \}\)/);
  assert.match(server, /referenceVideoAssets: seedanceVideoAssets/);
  assert.match(server, /const objectStorage = await uploadLocalAssetMirrorToObjectStorage\(\{ localUrl, bytes: mirrorBytes, mime \}\)/);
  assert.match(server, /objectStorageKey: objectStorage\.key \|\| ""/);
  assert.match(server, /userAsset = await normalizeUserImageAssetForUpstream/);
  assert.match(server, /flattenedTransparency: true/);
  assert.match(server, /format=rgb24/);
  assert.match(server, /imageMinDimension: wan30 \? 240/);
  assert.match(server, /if \(wan30\) asset = await ensureWan30R2MirrorForUserMediaAsset\(db, asset\)/);
  assert.match(server, /userAsset\.wan30PublicUrl = uploaded\.publicUrl/);
  assert.match(server, /if \(!r2Enabled\(\)\) \{/);
  assert.match(server, /userAsset\.wan30R2Key = uploaded\.key/);
  assert.doesNotMatch(server, /\bTOS\b|TOS_|makeTosAuth|uploadStaticAssetToTos|uploadBufferToTos/);
  assert.doesNotMatch(officialPresets, /\bTOS\b|TOS_|makeTosAuth/);
  assert.doesNotMatch(server, /publicOriginUrlForUpstreamAsset/);
  assert.match(server, /url = publicUrlForLocalAsset\(asset\)/);
  assert.match(server, /!userAssetHasConfiguredObjectStorageMirror\(userAsset\)/);
  assert.match(server, /\[advanced-generation-job-error\]", taskId, error\.stack \|\| error\.message/);
});

test("R2 failures are terminal and never silently fall back to the origin", () => {
  assert.match(server, /async function uploadLocalAssetMirrorToObjectStorage[\s\S]*?const upload = await uploadStaticAssetToObjectStorage/);
  assert.match(server, /R2 upload completed without a public URL/);
  assert.doesNotMatch(server, /async function uploadLocalAssetMirrorToObjectStorage[\s\S]*?catch \(error\) \{[\s\S]*?publicUrl: ""/);
  assert.match(server, /async function uploadGeneratedMediaToObjectStorage[\s\S]*?const videoUpload = await uploadStaticAssetToObjectStorage/);
  assert.match(server, /async function saveGeneratedImageFile[\s\S]*?const upload = await uploadStaticAssetToObjectStorage/);
  assert.match(server, /async function uploadStaticAssetToR2[\s\S]*?signal: AbortSignal\.timeout\(25000\)/);
  assert.match(server, /R2 upload timed out after 25 seconds/);
  assert.match(server, /publicUrlMatchesStorageBase\(userAsset\.publicUrl, R2\.publicDomain\)[\s\S]*?userAsset\.wan30PublicUrl = userAsset\.publicUrl/);
});

test("Alibaba task polling cannot block generation status for minutes", () => {
  assert.match(server, /const queryRequest = normalizedMethod === "GET"/);
  assert.match(server, /const submitRequest = normalizedMethod === "POST"/);
  assert.match(server, /const maxAttempts = queryRequest \? 2 : \(submitRequest \? 3 : 2\)/);
  assert.match(server, /queryRequest \? 20000 : 180000/);
  assert.match(server, /transientNetworkError = \(queryRequest \|\| submitRequest\)/);
  assert.match(server, /\[aliyun-dashscope-retry\]/);
  assert.match(server, /ALIYUN_DASHSCOPE_NETWORK_ERROR/);
  assert.match(server, /await Promise\.all\(activeRecords\.map\(async \(record\) => \{/);
});

test("new2 gateway preserves its own R2 URLs for every video provider", () => {
  assert.match(server, /gatewayBody\.imageUrl = publicHttpUrlForUserAsset\(asset\)/);
  assert.match(server, /gatewayBody\.preservePublicMediaUrls = true/);
  assert.match(server, /gatewayBody\.referenceImageAssetUris = allImages/);
  assert.match(server, /gatewayBody\.referenceVideoUrls = allVideos/);
  assert.match(server, /gatewayBody\.referenceAudioUrls = allAudios/);
  assert.match(server, /const entry = \{ url: publicUrl, fileName: asset\?\.name \|\| "" \}/);
  assert.doesNotMatch(server, /gatewayBody\.firstFrameDataUrl = await dataUrlForUserAsset/);
  assert.doesNotMatch(server, /gatewayBody\[`\$\{item\.key\}DataUrl`\] = await dataUrlForUserAsset/);
  assert.doesNotMatch(server, /gatewayBody\.referenceVideoAssetIds = gatewayVideoIds/);
});

test("Seedance gateway URLs enter the upstream asset library without an old-site R2 copy", () => {
  assert.match(server, /async function ensureSeedanceAssetUriForPublicUrl/);
  assert.match(server, /URL: publicUrl,[\s\S]*?AssetType: normalizedType/);
  assert.match(server, /ensureSeedanceAssetUriForPublicUrl\(uri, "Video"/);
  assert.match(server, /ensureSeedanceAssetUriForPublicUrl\(uri, "Audio"/);
  assert.match(server, /ensureSeedanceAssetUriForPublicUrl\(requestParams\.image_url, "Image"/);
  assert.match(server, /provider: "seedance25",[\s\S]*?preservePublicMediaUrls: true/);
  assert.doesNotMatch(server, /normalizeAdvancedProvider\(input\.provider \|\| ""\) === "wan30" && url/);
});

test("Seedance API references are deduplicated before the nine-image limit and upstream upload", () => {
  assert.match(server, /function uniqueSeedanceReferenceImageInputs\(inputs = \[\]\)/);
  assert.match(server, /const inputs = uniqueSeedanceReferenceImageInputs\(\[[\s\S]*?body\.referenceImages[\s\S]*?body\.reference_images/);
  assert.match(server, /const localReferenceUriKeys = new Set\(localReferenceInputs\.map/);
  assert.match(server, /referenceImageAssetUris = referenceImageAssetUris\.filter\(\(uri\) => \([\s\S]*?!localReferenceUriKeys\.has/);
  assert.match(server, /else delete requestParams\.referenceImageAssetUris/);
});

test("all multimodal adapters deduplicate compatibility aliases before counting and sending", () => {
  assert.match(server, /function seedanceReferenceAudioInputsFromBody[\s\S]*?const seen = new Set\(\)/);
  assert.match(server, /function seedance25ReferenceInputs[\s\S]*?const seenItems = new Set\(\)/);
  assert.match(server, /const imageUrls = \[\.\.\.new Set\(\[\.\.\.await seedance25PublicAssetUrls/);
  assert.match(server, /function aliyunMediaInputs[\s\S]*?const seen = new Set\(\)/);
  assert.match(server, /function uniqueResolvedAliyunMedia/);
  assert.match(server, /const media = uniqueResolvedAliyunMedia\(resolvedMedia\)/);
  assert.match(server, /const inputs = uniqueSeedanceReferenceImageInputs\(\[[\s\S]*?assetIds\.map/);
  assert.match(server, /function imageEditAssetIdsFromBody[\s\S]*?return \[\.\.\.new Set/);
  assert.match(server, /const publicImageUrls = \[\.\.\.new Set\(\[/);
});

test("public asset ingestion retries transient source failures and reports them as gateway errors", () => {
  assert.match(server, /label: "asset",[\s\S]*?retryCount: 2,[\s\S]*?retryDelayMs: 750/);
  assert.match(server, /const retryableStatus = \[408, 425, 429\]\.includes\(response\.status\) \|\| response\.status >= 500/);
  assert.match(server, /error\.statusCode = 502;[\s\S]*?error\.code = "REMOTE_DOWNLOAD_FAILED"/);
});

test("BytePlus CreateAsset relays source URLs upstream and V3 reuses the returned asset id", () => {
  assert.match(server, /async function createByteplusUpstreamAsset[\s\S]*?arkOpenApiAction\("CreateAsset", payload\)/);
  assert.match(server, /if \(USE_GATEWAY_UPSTREAM\)[\s\S]*?Action=CreateAsset&Version=2024-01-01/);
  assert.match(server, /byteplusUpstreamAsset: true/);
  assert.match(server, /const passthroughAssetUri = localAsset\?\.byteplusUpstreamAsset/);
  assert.match(server, /target\.referenceImageAssetUris\.push\(directValue\)/);
  assert.match(server, /if \(actionKey === "createasset"\) \{[\s\S]*?const created = await createByteplusUpstreamAsset/);
  assert.match(server, /GroupId: USE_GATEWAY_UPSTREAM \? "" : ARK_OPENAPI\.groupId/);
  assert.match(server, /ProjectName: USE_GATEWAY_UPSTREAM \? "" : ARK_OPENAPI\.projectName/);
  assert.match(server, /byteplusActionEnvelope\("CreateAsset", \{ Id: assetId \}\)/);
});

test("Seedance 2.5 and Seedream use the gateway without copying new2 media into the old bucket", () => {
  assert.match(server, /if \(!direct && !USE_GATEWAY_UPSTREAM && !SEEDANCE25_API_KEY\)/);
  assert.match(server, /if \(direct && !ARK_API_KEY\)/);
  assert.match(server, /record\.provider === "seedance25" && record\.upstreamSource !== "gateway"/);
  assert.match(server, /provider: "seedance25",[\s\S]*?referenceImages: upstreamInput\.imageFiles\.map/);
  assert.match(server, /if \(!USE_GATEWAY_UPSTREAM && !ARK_API_KEY\)/);
  assert.match(server, /provider: "seedream5-image",[\s\S]*?referenceImages: referencePayloadUrls\.map/);
  assert.match(server, /const publicInputs = preservePublicMediaUrls[\s\S]*?createSeedream5ImageAssetUrisFromUrls\(publicInputs/);
  assert.match(server, /record\.referenceAssetUri = publicUrl/);
  assert.match(server, /gatewayBody\.imageUrl = publicInputImageUrl/);
  assert.doesNotMatch(server, /gatewayBody\.dataUrl = await dataUrlForUserAsset/);
});

test("admin reference previews fall back from upstream asset URIs to playable video URLs", () => {
  assert.match(admin, /const candidates = \[asset\.videoUrl, asset\.url, asset\.localUrl, asset\.publicUrl\]/);
  assert.match(admin, /candidates\.find\(\(url\) => isPreviewableVideoUrl\(url\)\)/);
  assert.match(admin, /candidates\.find\(\(url\) => !isInternalAssetUrl\(url\)\)/);
});

test("admin user actions stay visible in wide tables", () => {
  assert.match(admin, /class="adm-text-right adm-user-actions-cell"/);
  assert.match(admin, /class="adm-btn adm-btn-sm adm-btn-ghost adm-user-action-btn"/);
  assert.match(adminCss, /\.adm-user-table th\.adm-user-actions-cell,[\s\S]*?position: sticky;[\s\S]*?right: 0;/);
  assert.match(adminCss, /\.adm-user-table \.adm-user-action-btn \{[\s\S]*?width: 34px;[\s\S]*?height: 34px;/);
});

test("admin generation search queries the complete database instead of the latest 500 records", () => {
  const dbSource = fs.readFileSync(path.join(__dirname, "..", "db.js"), "utf8");
  const serverSource = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  assert.match(dbSource, /async function getAdminGenerationRecordsPageFromDb/);
  assert.match(dbSource, /LEFT JOIN app_users users ON users\.id = records\.payload->>'userId'/);
  assert.match(dbSource, /users\.username/);
  assert.match(serverSource, /getAdminGenerationRecordsPageFromDb\(\{/);
});

test("owner and admin parameter views show the payload actually sent upstream", () => {
  assert.match(server, /includeUpstreamPayload: !externalApiCaller/);
  assert.match(server, /publicRecord\.upstreamPayload = listGenerationRecordValue\(record\.upstreamPayload \|\| null\)/);
  assert.match(explore, /params: record\.upstreamPayload \|\| record\.params \|\| null/);
  assert.match(admin, /recordDetailJsonSectionHtml\("upstream", "实际发送参数", record\.upstreamPayload \|\| record\.params\)/);
});
