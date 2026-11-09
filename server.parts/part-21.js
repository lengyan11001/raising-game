function adminGenerationMediaUrl(taskId = "") {
  if (!taskId) return "";
  return `/api/admin/generation-records/${encodeURIComponent(taskId)}/media?token=${encodeURIComponent(makeAdminGenerationMediaToken(taskId))}`;
}

function signAdminGenerationReferenceMediaPayload(encodedPayload = "") {
  return crypto.createHmac("sha256", unlockStreamSecret()).update(`admin-generation-reference-media:${encodedPayload}`).digest("base64url");
}

function makeAdminGenerationReferenceMediaToken(taskId = "", referenceIndex = 0) {
  const payload = base64UrlJson({
    kind: "admin-generation-reference-media",
    taskId: String(taskId || ""),
    referenceIndex: Number(referenceIndex),
    exp: Date.now() + ADMIN_GENERATION_MEDIA_TTL_MS,
  });
  return `${payload}.${signAdminGenerationReferenceMediaPayload(payload)}`;
}

function parseAdminGenerationReferenceMediaToken(token = "") {
  const [payload, signature] = String(token || "").split(".");
  if (!payload || !signature) return null;
  const expected = signAdminGenerationReferenceMediaPayload(payload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!decoded || decoded.kind !== "admin-generation-reference-media" || Number(decoded.exp || 0) < Date.now()) return null;
    return decoded;
  } catch {
    return null;
  }
}

function adminGenerationReferenceMediaUrl(taskId = "", referenceIndex = 0, { download = false } = {}) {
  if (!taskId || !Number.isInteger(Number(referenceIndex))) return "";
  const token = encodeURIComponent(makeAdminGenerationReferenceMediaToken(taskId, referenceIndex));
  return `/api/admin/generation-records/${encodeURIComponent(taskId)}/references/${encodeURIComponent(referenceIndex)}/media?token=${token}${download ? "&download=1" : ""}`;
}

function generationRecordMatchesQuery(record = {}, query = "") {
  const needle = String(query || "").trim().toLowerCase();
  if (!needle) return true;
  return [
    record.taskId,
    record.upstreamTaskId,
    record.userId,
    record.username,
    record.source,
    record.kind,
    record.provider,
    record.status,
    record.templateId,
    record.templateTitle,
    record.sceneId,
    record.sceneName,
    record.sceneEntryId,
    record.sceneEntryName,
    record.companionId,
    record.companionName,
    record.prompt,
    record.finalPrompt,
    record.model,
    record.error,
  ].some((value) => String(value || "").toLowerCase().includes(needle));
}

function shouldRefreshGenerationRecord(record = {}) {
  if (isChatCompletionGenerationRecord(record)) return false;
  if (needsApizFailureRefund(record)) return true;
  if (needsSeedanceFailureRefund(record)) return true;
  if (generationRecordR2Expired(record)) return false;
  if (record.upstreamSource === "video-tool-orchestrator") return false;
  if (["seedream5-image", "qwen-image3"].includes(String(record.provider || "").toLowerCase())) {
    if (record.awaitingUpstreamTask && !record.upstreamTaskId) return false;
    const imageStatus = String(record.status || "").toLowerCase();
    if (isFailedStatus(imageStatus)) return false;
    if (isSucceededStatus(imageStatus)) return !generationRecordImageUrl(record);
    const queryTaskId = String(record.upstreamTaskId || record.taskId || "");
    return Boolean(queryTaskId) && !queryTaskId.startsWith("demo-");
  }
  if (String(record.provider || "").toLowerCase() === "aliyun-wan27-image") {
    if (record.awaitingUpstreamTask && !record.upstreamTaskId) return false;
    const imageStatus = String(record.status || "").toLowerCase();
    if (isFailedStatus(imageStatus)) return false;
    if (isSucceededStatus(imageStatus)) return !generationRecordImageUrl(record);
    return Boolean(record.upstreamTaskId || record.taskId) && !String(record.upstreamTaskId || record.taskId).startsWith("demo-");
  }
  if (isImageGenerationRecord(record)) return false;
  if (record.awaitingUpstreamTask && !record.upstreamTaskId) return false;
  if (record.provider === "apiz" && !record.billingSettledAt && (record.upstreamTaskId || record.taskId) && !String(record.upstreamTaskId || record.taskId).startsWith("demo-")) return true;
  const status = String(record.status || "").toLowerCase();
  if (record.localVideoUrl && isSucceededStatus(status)) {
    // R2 publication is asynchronous media maintenance. It must not keep an
    // already completed task in the status-refresh loop.
    if (seedanceUsesTokenPricing(record) && !record.billingSettledAt) return Boolean(record.upstreamTaskId || record.taskId);
    return false;
  }
  if (isFailedStatus(status)) return false;
  if (isSucceededStatus(status)) {
    if (seedanceUsesTokenPricing(record) && !record.billingSettledAt) return Boolean(record.upstreamTaskId || record.taskId);
    return Boolean(record.taskId)
      && !record.localVideoUrl
      && !record.cdnVideoUrl
      && !generationRecordProviderVideoUrl(record);
  }
  if (String(record.provider || "").toLowerCase() === "seedance" && record.source === "advanced-seedance") {
    return Boolean(record.upstreamTaskId) && !String(record.upstreamTaskId).startsWith("demo-");
  }
  if (String(record.provider || "").toLowerCase() === "apiz") {
    return Boolean(record.upstreamTaskId) && !String(record.upstreamTaskId).startsWith("demo-");
  }
  return Boolean(record.taskId) && !String(record.taskId).startsWith("demo-");
}

function isStalePreSubmitGenerationRecord(record = {}, staleMs = GENERATION_SUBMIT_STALE_MS) {
  if (!record?.taskId || !record.userId) return false;
  if (!record.awaitingUpstreamTask || record.upstreamTaskId) return false;
  if (isSucceededStatus(record.status) || isFailedStatus(record.status)) return false;
  const provider = String(record.provider || "").toLowerCase();
  if (!["seedance", "seedance-nsfw", "seedance25", "aliyun-wan30", "aliyun-wan27", "aliyun-happyhorse", "apiz", "seedream5-image", "qwen-image3"].includes(provider) && !isVegaProvider(provider)) return false;
  const status = String(record.status || "").toLowerCase();
  if (!["preparing", "submitting", "submitted", "running", "processing", "queued", "pending"].includes(status)) return false;
  const time = generationRecordCreatedTime(record);
  return Boolean(time) && Date.now() - time >= staleMs;
}

async function failStalePreSubmitGenerationRecord(record = {}, reason = "stale-submit") {
  if (!isStalePreSubmitGenerationRecord(record, 0)) return record;
  const failedRecord = await upsertGenerationRecord({
    taskId: record.taskId,
    status: "failed",
    awaitingUpstreamTask: false,
    error: "Generation submission timed out before an upstream task id was returned. The pre-deducted credits were refunded.",
    failedAt: new Date().toISOString(),
    lastUpdateReason: reason,
  });
  const provider = String(failedRecord.provider || "").toLowerCase();
  if (provider === "apiz") {
    return settleApizGenerationRecord(failedRecord, {
      status: "failed",
      error: failedRecord.error,
    }, reason);
  }
  return settleSeedanceGenerationRecord(failedRecord, reason);
}

function generationListRefreshRequested(url) {
  return ["1", "true", "yes", "on"].includes(String(url.searchParams.get("refresh") || "").toLowerCase());
}

const GENERATION_LIST_REFRESH_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const GENERATION_RECORD_REFRESH_CONCURRENCY = Math.max(1, Math.min(10, Number(process.env.GENERATION_RECORD_REFRESH_CONCURRENCY || 3) || 3));
const GENERATION_RECORD_REFRESH_COOLDOWN_MS = Math.max(1000, Number(process.env.GENERATION_RECORD_REFRESH_COOLDOWN_MS || 12 * 1000) || 12 * 1000);

function generationRecordTime(record = {}) {
  const value = Date.parse(record.updatedAt || record.createdAt || "");
  return Number.isFinite(value) ? value : 0;
}

function generationRecordCreatedTime(record = {}) {
  const value = Date.parse(record.createdAt || record.updatedAt || "");
  return Number.isFinite(value) ? value : 0;
}

function shouldRefreshGenerationRecordFromList(record = {}) {
  if (isStalePreSubmitGenerationRecord(record)) return true;
  if (!shouldRefreshGenerationRecord(record)) return false;
  const time = generationRecordTime(record);
  return !time || Date.now() - time <= GENERATION_LIST_REFRESH_MAX_AGE_MS;
}

const generationRecordRefreshQueue = [];
const generationRecordRefreshQueued = new Set();
const generationRecordRefreshLastStartedAt = new Map();
let generationRecordRefreshActive = 0;
let generationRecordRefreshDrainScheduled = false;

function scheduleGenerationRecordRefreshDrain() {
  if (generationRecordRefreshDrainScheduled) return;
  generationRecordRefreshDrainScheduled = true;
  setImmediate(() => {
    generationRecordRefreshDrainScheduled = false;
    drainGenerationRecordRefreshQueue();
  });
}

const workflowCanvasUpdatesInFlight = new Set();

function mulerouterWebhookConfigured() {
  return Boolean(String(process.env.MULEROUTER_WEBHOOK_SECRET || "").trim());
}

function isMulerouterGenerationRecord(record = {}) {
  return String(record.upstreamSource || "") === "mulerouter"
    || String(record.upstreamTaskId || record.taskId || "").startsWith("mr:");
}

function queueGenerationRecordStatusRefresh(record = {}, { priority = false, reason = "list" } = {}) {
  const taskId = String(record.taskId || "");
  if (!taskId || generationRecordRefreshQueued.has(taskId)) return false;
  const lastStartedAt = generationRecordRefreshLastStartedAt.get(taskId) || 0;
  const cooldownMs = isMulerouterGenerationRecord(record) && mulerouterWebhookConfigured()
    ? Math.max(GENERATION_RECORD_REFRESH_COOLDOWN_MS, 8 * 60 * 1000)
    : GENERATION_RECORD_REFRESH_COOLDOWN_MS;
  if (Date.now() - lastStartedAt < cooldownMs) return false;
  if (isMulerouterGenerationRecord(record) && mulerouterWebhookConfigured() && !String(reason).startsWith("mulerouter-webhook")) {
    const age = Date.now() - Date.parse(record.createdAt || record.updatedAt || 0);
    if (!Number.isFinite(age) || age < 8 * 60 * 1000) return false;
  }
  generationRecordRefreshQueued.add(taskId);
  const item = { taskId, record, reason };
  if (priority) generationRecordRefreshQueue.unshift(item);
  else generationRecordRefreshQueue.push(item);
  scheduleGenerationRecordRefreshDrain();
  return true;
}

function queueGenerationRecordStatusRefreshes(records = [], { reason = "list" } = {}) {
  let queued = 0;
  for (const record of records) {
    if (queueGenerationRecordStatusRefresh(record, {
      priority: needsApizFailureRefund(record) || needsSeedanceFailureRefund(record) || isStalePreSubmitGenerationRecord(record),
      reason,
    })) queued += 1;
  }
  return queued;
}

function drainGenerationRecordRefreshQueue() {
  while (generationRecordRefreshActive < GENERATION_RECORD_REFRESH_CONCURRENCY && generationRecordRefreshQueue.length) {
    const item = generationRecordRefreshQueue.shift();
    generationRecordRefreshActive += 1;
    const startedAt = Date.now();
    generationRecordRefreshLastStartedAt.set(item.taskId, startedAt);
    setTimeout(() => {
      if (generationRecordRefreshLastStartedAt.get(item.taskId) === startedAt) {
        generationRecordRefreshLastStartedAt.delete(item.taskId);
      }
    }, GENERATION_RECORD_REFRESH_COOLDOWN_MS).unref?.();
    Promise.resolve().then(async () => {
      const current = await getGenerationRecord(item.taskId) || item.record;
      const nextRecord = await refreshGenerationRecordStatus(current);
      if (nextRecord && (nextRecord.status !== current.status || nextRecord.billingStatus !== current.billingStatus)) {
        console.log("[generation-record-background-refresh]", item.reason, item.taskId, `${current.status || ""}->${nextRecord.status || ""}`, `${current.billingStatus || ""}->${nextRecord.billingStatus || ""}`);
      }
    }).catch((error) => {
      console.warn("[generation-record-background-refresh-failed]", item.reason, item.taskId, error.message || error);
    }).finally(() => {
      generationRecordRefreshActive -= 1;
      generationRecordRefreshQueued.delete(item.taskId);
      scheduleGenerationRecordRefreshDrain();
    });
  }
}

async function ensureGenerationRecordMediaOptimized(record = {}, { allowObjectStorageUpload = true } = {}) {
  if (DISABLE_GENERATED_R2_STORAGE) return record;
  if (!record?.taskId) return record;
  if (GENERATED_ASSETS_ON_DEMAND) {
    if (!generationRecordNeedsPosterMaintenance(record)) return record;
    const remoteVideo = generationRecordProviderVideoUrl(record);
    const downloaded = await downloadGeneratedVideo(record.taskId, remoteVideo, { forceLocal: true, posterOnly: true });
    return upsertGenerationRecord({
      taskId: record.taskId,
      localVideoPath: "",
      localVideoUrl: "",
      videoUrl: downloaded.cdnVideoUrl || record.cdnVideoUrl || record.videoUrl || "",
      localPosterPath: "",
      localPosterUrl: "",
      posterUrl: downloaded.cdnPosterUrl || record.cdnPosterUrl || record.posterUrl || "",
      cdnVideoUrl: downloaded.cdnVideoUrl || record.cdnVideoUrl || "",
      cdnPosterUrl: downloaded.cdnPosterUrl || record.cdnPosterUrl || "",
      storageProvider: downloaded.storageProvider || record.storageProvider || "",
      storageKey: downloaded.storageKey || record.storageKey || "",
      posterStorageProvider: downloaded.posterStorageProvider || record.posterStorageProvider || "",
      posterStorageKey: downloaded.posterStorageKey || record.posterStorageKey || "",
      cdnError: downloaded.cdnError || "",
      playbackOptimizedAt: downloaded.playbackOptimizedAt || record.playbackOptimizedAt || "",
      lastUpdateReason: "generated-poster-recovery",
    });
  }
  const recovered = await recoverGenerationRecordR2Urls(record);
  if (!recovered?.localVideoUrl) return recovered;
  record = recovered;
  const localVideoPath = safePathWithin(ASSETS_ROOT, record.localVideoPath)
    || safeAssetPathFromUrl(record.localVideoUrl || "");
  if (!localVideoPath) return record;
  const currentVideoUrl = generationRecordVideoUrl(record);
  try {
    await fs.access(localVideoPath);
  } catch {
    return record;
  }
  let localPosterPath = record.localPosterPath || "";
  let localPosterUrl = record.localPosterUrl || "";
  let cdnVideoUrl = record.cdnVideoUrl || "";
  let cdnPosterUrl = record.cdnPosterUrl || "";
  let storageProvider = record.storageProvider || "";
  let storageKey = record.storageKey || "";
  let posterStorageProvider = record.posterStorageProvider || "";
  let posterStorageKey = record.posterStorageKey || "";
  let cdnError = record.cdnError || "";
  const fastStartNeeded = await generatedVideoNeedsFastStart(localVideoPath);
  const fastStartUpdated = fastStartNeeded
    ? await ensureGeneratedVideoFastStart(localVideoPath)
    : false;
  const playbackOptimizedAt = !fastStartNeeded || fastStartUpdated
    ? (String(record.playbackOptimizedAt || "") || new Date().toISOString())
    : "";
  if (!localPosterUrl) {
    const poster = await createGeneratedVideoPoster(record.taskId, localVideoPath);
    localPosterPath = poster.localPosterPath || localPosterPath;
    localPosterUrl = poster.localPosterUrl || localPosterUrl;
  }
  if (allowObjectStorageUpload && objectStorageEnabled() && (fastStartUpdated || !cdnVideoUrl || (localPosterPath && !cdnPosterUrl))) {
    const cdn = await uploadGeneratedMediaToObjectStorage({ taskId: record.taskId, localVideoPath, localPosterPath });
    cdnVideoUrl = fastStartUpdated
      ? cacheBustedMediaUrl(cdn.cdnVideoUrl || cdnVideoUrl, Date.now())
      : (cdn.cdnVideoUrl || cdnVideoUrl);
    cdnPosterUrl = cdn.cdnPosterUrl || cdnPosterUrl;
    cdnError = cdn.cdnError || "";
  }
  if (
    localPosterUrl === (record.localPosterUrl || "") &&
    cdnVideoUrl === (record.cdnVideoUrl || "") &&
    cdnPosterUrl === (record.cdnPosterUrl || "") &&
    cdnError === (record.cdnError || "") &&
    playbackOptimizedAt === String(record.playbackOptimizedAt || "")
  ) {
    return record;
  }
  return upsertGenerationRecord({
    taskId: record.taskId,
    localVideoPath,
    localVideoUrl: record.localVideoUrl,
    videoUrl: localPublicAssetStorageEnabled()
      ? (record.localVideoUrl || record.cdnVideoUrl || currentVideoUrl)
      : (record.cdnVideoUrl || record.localVideoUrl || currentVideoUrl),
    localPosterPath,
    localPosterUrl,
    posterUrl: localPublicAssetStorageEnabled()
      ? (localPosterUrl || cdnPosterUrl)
      : (cdnPosterUrl || localPosterUrl),
    cdnVideoUrl,
    cdnPosterUrl,
    cdnError,
    playbackOptimizedAt,
  });
}

const GENERATED_MEDIA_R2_RETRY_MAX_ATTEMPTS = 3;
const GENERATED_MEDIA_R2_RETRY_COOLDOWN_MS = 30 * 60 * 1000;
function posterMaintenanceFailureUpdates(previousAttempts = 0, error = null, now = Date.now()) {
  const attempts = Math.min(
    GENERATION_POSTER_BACKFILL_MAX_ATTEMPTS,
    Math.max(0, Number(previousAttempts || 0)) + 1,
  );
  const terminal = attempts >= GENERATION_POSTER_BACKFILL_MAX_ATTEMPTS;
  return {
    posterMaintenanceAttempts: attempts,
    posterMaintenanceRetryAt: terminal
      ? ""
      : new Date(now + GENERATION_POSTER_BACKFILL_RETRY_DELAY_MS * attempts).toISOString(),
    posterMaintenanceError: String(error?.message || error || "Poster maintenance failed.").slice(0, 500),
    posterMaintenanceTerminalAt: terminal ? new Date(now).toISOString() : "",
  };
}

const generatedMediaMaintenanceQueue = [];
const generatedMediaMaintenanceQueued = new Set();
let generatedMediaMaintenanceRunning = false;
const generatedVideoDownloadQueued = new Set();

function generationRecordVideoDownloadCoolingDown(record = {}) {
  const attempts = Math.max(0, Number(record.cdnRetryCount || 0));
  if (attempts >= GENERATED_MEDIA_R2_RETRY_MAX_ATTEMPTS) return true;
  const retryAt = Date.parse(record.cdnRetryAt || "");
  return Boolean(retryAt && retryAt > Date.now());
}

function queueGeneratedVideoDownload(taskId, remoteVideoUrl, reason = "background-download", { repairPoster = false } = {}) {
  const cleanTaskId = String(taskId || "").trim();
  const remote = String(remoteVideoUrl || "").trim();
  // On-demand storage deliberately avoids every full video download except the
  // one maintenance path that repairs a missing thumbnail for a succeeded task.
  if (GENERATED_ASSETS_ON_DEMAND && !repairPoster) return false;
  if (!cleanTaskId || !remote || generatedVideoDownloadQueued.has(cleanTaskId)) return false;
  generatedVideoDownloadQueued.add(cleanTaskId);
  setImmediate(() => Promise.resolve().then(async () => {
    const current = await getGenerationRecord(cleanTaskId);
    if (!current) return;
    if (generationRecordVideoDownloadCoolingDown(current)) return;
    if ((current.cdnVideoUrl || current.videoUrl) && (!repairPoster || (current.cdnPosterUrl && current.posterStorageKey))) return;
    const downloaded = await downloadGeneratedVideo(cleanTaskId, remote, { forceLocal: true, posterOnly: repairPoster });
    if (!downloaded.cdnVideoUrl || !downloaded.storageKey) {
      throw new Error(downloaded.cdnError || "Generated video was not persisted to object storage.");
    }
    if (repairPoster && !String(downloaded.cdnPosterUrl || "").trim()) {
      throw new Error("Poster frame was not created.");
    }
    const posterMaintenanceUpdates = repairPoster ? {
      posterMaintenanceAttempts: Number(current.posterMaintenanceAttempts || 0),
      posterMaintenanceRetryAt: "",
      posterMaintenanceError: "",
      posterMaintenanceCompletedAt: new Date().toISOString(),
      posterMaintenanceTerminalAt: "",
    } : {};
    await upsertAndSettleGenerationRecord({
      taskId: cleanTaskId,
      status: current.status,
      remoteVideoUrl: remote,
      localVideoUrl: "",
      localVideoPath: "",
      localPosterUrl: "",
      localPosterPath: "",
      videoUrl: downloaded.cdnVideoUrl || current.videoUrl || "",
      posterUrl: downloaded.cdnPosterUrl || current.posterUrl || "",
      cdnVideoUrl: downloaded.cdnVideoUrl || "",
      cdnPosterUrl: downloaded.cdnPosterUrl || "",
      storageProvider: downloaded.storageProvider || current.storageProvider || "",
      storageKey: downloaded.storageKey || current.storageKey || "",
      posterStorageProvider: downloaded.posterStorageProvider || current.posterStorageProvider || "",
      posterStorageKey: downloaded.posterStorageKey || current.posterStorageKey || "",
      cdnError: downloaded.cdnError || "",
      error: current.error || "",
      ...posterMaintenanceUpdates,
    }, reason);
  }).catch(async (error) => {
    console.warn("[generated-video-background-download-failed]", cleanTaskId, error.message || error);
    const current = await getGenerationRecord(cleanTaskId).catch(() => null);
    if (!current) return;
    const attempts = Math.max(0, Number(current.cdnRetryCount || 0)) + 1;
    const terminal = attempts >= GENERATED_MEDIA_R2_RETRY_MAX_ATTEMPTS;
    await upsertGenerationRecord({
      taskId: cleanTaskId,
      cdnRetryCount: attempts,
      cdnRetryAt: terminal
        ? new Date().toISOString()
        : new Date(Date.now() + GENERATED_MEDIA_R2_RETRY_COOLDOWN_MS * attempts).toISOString(),
      cdnError: String(error.message || error || "Generated video download failed.").slice(0, 500),
      ...(repairPoster ? {
        ...posterMaintenanceFailureUpdates(current.posterMaintenanceAttempts, error),
        posterMaintenanceLastDurationMs: 0,
      } : {}),
    }).catch(() => {});
  }).finally(() => {
    generatedVideoDownloadQueued.delete(cleanTaskId);
  }));
  return true;
}

function adminRecordMediaAssetUrl(asset = {}, userAssetMap = new Map()) {
  const linked = asset.userAssetId ? userAssetMap.get(String(asset.userAssetId)) : null;
  const candidates = [
    linked?.cdnUrl,
    linked?.publicUrl,
    linked?.sourcePublicUrl,
    linked?.localUrl,
    asset.adminPreviewUrl,
    asset.cdnUrl,
    asset.publicUrl,
    asset.imageUrl,
    asset.sourceImageUrl,
    asset.localImageUrl,
    asset.videoUrl,
    asset.localVideoUrl,
    asset.audioUrl,
    asset.localAudioUrl,
    asset.localUrl,
    asset.sourceUrl,
    asset.previewUrl,
    asset.url,
  ];
  return candidates.map((value) => String(value || "").trim()).find((value) => /^https?:\/\//i.test(value) || value.startsWith("/")) || "";
}

async function enrichAdminGenerationRecordMedia(record = {}, db = null) {
  const assets = Array.isArray(record.mediaAssets) ? record.mediaAssets : [];
  const ids = [...new Set(assets.map((asset) => String(asset?.userAssetId || "").trim()).filter(Boolean))];
  const userAssetMap = new Map();
  for (const id of ids) {
    const found = (db?.userAssets || []).find((asset) => String(asset?.id || "") === id && !isSoftDeleted(asset))
      || await getUserAssetFromDb(id);
    if (found) userAssetMap.set(id, found);
  }
  const enrich = (asset, index) => {
    const url = adminRecordMediaAssetUrl(asset, userAssetMap);
    if (!url) return { ...asset, referenceIndex: index };
    const type = String(asset.type || "").toLowerCase();
    const next = { ...asset, referenceIndex: index, adminPreviewUrl: url, adminDownloadUrl: url };
    if (type.includes("video") || String(asset.mime || "").startsWith("video/")) next.videoUrl = url;
    else if (type.includes("audio") || String(asset.mime || "").startsWith("audio/")) next.audioUrl = url;
    else {
      next.imageUrl = url;
      next.sourceImageUrl = url;
    }
    return next;
  };
  return { ...record, mediaAssets: assets.map(enrich) };
}

async function ensureGenerationRecordImageR2Published(record = {}, { allowObjectStorageUpload = true } = {}) {
  if (!record?.taskId || generationRecordIsApiTask(record)) return record;
  let current = await recoverGenerationRecordR2Urls(record);
  if (generationRecordImageStorageReady(current)) return current;
  if (!allowObjectStorageUpload || !generatedOutputStorageEnabled()) return current;
  const candidates = [...new Set([
    current.localImagePath,
    localDownloadPathFromRecord(current, false),
    ...generationRecordProviderImageUrls(current),
  ].map((item) => String(item || "").trim()).filter(Boolean))];
  if (!candidates.length) return current;
  let lastError = null;
  for (let index = 0; index < candidates.length; index += 1) {
    const source = candidates[index];
    try {
      const localPath = safePathWithin(ASSETS_ROOT, source) || localAssetPathFromPublicValue(source);
      const downloaded = localPath
        ? { bytes: await fs.readFile(localPath), mime: imageMimeFromKnownPath(localPath) || "image/png" }
        : await downloadRemoteFileToBuffer(source, { label: "generated image", maxBytes: 30 * 1024 * 1024 });
      const mime = String(downloaded.mime || "").startsWith("image/") ? downloaded.mime : "image/png";
      const fileName = imageFileName(index ? `${current.taskId}-${index + 1}` : current.taskId, mime);
      const upload = await uploadStaticAssetToObjectStorage({
        key: objectStoragePath("generated", "images", fileName),
        bytes: downloaded.bytes,
        mime,
      });
      await verifyObjectStorageMedia(upload, { expectedBytes: downloaded.bytes.length, label: "Generated image" });
      const storageKey = upload.key || objectStorageKeyFromPublicUrl(upload.publicUrl || "", upload.provider || objectStorageProvider()).key || "";
      if (!upload.publicUrl || !storageKey) throw new Error("Generated image object storage upload did not return a public URL and key.");
      current = await upsertGenerationRecord({
        taskId: current.taskId,
        localImageUrl: "",
        localImagePath: "",
        imageResultUrl: upload.publicUrl,
        cdnImageUrl: upload.publicUrl,
        cdnImageUrls: [upload.publicUrl],
        cdnImageStorageKeys: [storageKey],
        storageProvider: upload.provider || objectStorageProvider(),
        storageKey,
        cdnError: "",
        lastUpdateReason: "r2-image-record-recovered",
      });
      console.log("[generation-record-r2-recovered]", current.taskId, ["cdnImageUrl"]);
      return current;
    } catch (error) {
      lastError = error;
    }
  }
  await upsertGenerationRecord({
    taskId: current.taskId,
    cdnError: lastError?.message || "Generated image R2 upload failed.",
  }).catch(() => {});
  return current;
}

async function recoverGenerationRecordR2Urls(record = {}) {
  if (!record?.taskId || !generatedOutputStorageEnabled() || generationRecordIsApiTask(record)) return record;
  const taskId = storagePathSegment(record.taskId, "generation");
  const updates = {};
  if (!String(record.cdnVideoUrl || "").trim()) {
    const found = await findUploadedR2Object(objectStoragePath("generated", "videos", `${taskId}.mp4`));
    if (found?.publicUrl) {
      updates.cdnVideoUrl = found.publicUrl;
      updates.storageKey = objectStoragePath("generated", "videos", `${taskId}.mp4`);
      if (found.provider) updates.storageProvider = found.provider;
    }
  }
  if (!String(record.cdnPosterUrl || "").trim()) {
    const found = await findUploadedR2Object(objectStoragePath("generated", "posters", `${taskId}.jpg`));
    if (found?.publicUrl) {
      updates.cdnPosterUrl = found.publicUrl;
      updates.posterStorageKey = objectStoragePath("generated", "posters", `${taskId}.jpg`);
      if (found.provider) updates.posterStorageProvider = found.provider;
    }
  }
  if (!String(record.cdnImageUrl || "").trim()) {
    const imageCandidates = [];
    const localImage = String(record.localImageUrl || record.imageResultUrl || "").split("?")[0];
    const localName = localImage.match(/\/([^/]+\.(?:png|jpe?g|webp))$/i)?.[1];
    if (localName) imageCandidates.push(localName);
    imageCandidates.push(`${taskId}.png`, `${taskId}.jpg`, `${taskId}.jpeg`, `${taskId}.webp`);
    for (const name of [...new Set(imageCandidates)]) {
      const found = await findUploadedR2Object(objectStoragePath("generated", "images", name));
      if (found?.publicUrl) {
        updates.cdnImageUrl = found.publicUrl;
        updates.cdnImageUrls = [found.publicUrl];
        updates.cdnImageStorageKeys = [objectStoragePath("generated", "images", name)];
        updates.storageKey = updates.cdnImageStorageKeys[0];
        if (found.provider) updates.storageProvider = found.provider;
        break;
      }
    }
  }
  if (!Object.keys(updates).length) return record;
  const next = await upsertGenerationRecord({
    taskId: record.taskId,
    ...updates,
    videoUrl: updates.cdnVideoUrl || record.videoUrl || "",
    posterUrl: updates.cdnPosterUrl || record.posterUrl || "",
    cdnError: "",
    lastUpdateReason: "r2-record-recovery",
  });
  console.log("[generation-record-r2-recovered]", record.taskId, Object.keys(updates));
  return next || { ...record, ...updates };
}

function generationRecordNeedsPosterMaintenance(record = {}) {
  if (!record?.taskId || generationRecordIsApiTask(record)) return false;
  if (!isSucceededStatus(record.status) || !generationRecordIsVideoOutput(record)) return false;
  if (String(record.cdnPosterUrl || record.posterUrl || '').trim()) return false;
  if (String(record.posterMaintenanceTerminalAt || "").trim()) return false;
  if (Number(record.posterMaintenanceAttempts || 0) >= GENERATION_POSTER_BACKFILL_MAX_ATTEMPTS) return false;
  const retryAt = Date.parse(record.posterMaintenanceRetryAt || '');
  if (retryAt && retryAt > Date.now()) return false;
  return Boolean(
    generationRecordProviderVideoUrl(record)
    || String(record.localVideoUrl || '').trim()
  );
}

function generationRecordNeedsMediaMaintenance(record = {}) {
  if (DISABLE_GENERATED_R2_STORAGE || generationRecordR2Expired(record)) return false;
  if (!record?.taskId || generationRecordIsApiTask(record)) return false;
  if (GENERATED_ASSETS_ON_DEMAND) return generationRecordNeedsPosterMaintenance(record);
  if (isImageGenerationRecord(record)) {
    const hasProviderImage = generationRecordProviderImageUrls(record).length > 0;
    const hasLocalImage = Boolean(String(record.localImagePath || "").trim() || String(record.localImageUrl || "").trim() || String(record.imageResultUrl || "").trim());
    return generatedOutputStorageEnabled() && (hasProviderImage || hasLocalImage) && !generationRecordImageStorageReady(record);
  }
  const videoReady = Boolean(String(record.cdnVideoUrl || "").trim() && String(record.storageKey || "").trim());
  const posterReady = Boolean(String(record.cdnPosterUrl || record.posterUrl || "").trim());
  return !videoReady || !posterReady;
}

function generationRecordCanRetryR2(record = {}) {
  if (!objectStorageEnabled() || generationRecordIsApiTask(record)) return false;
  const attempts = Number(record.cdnRetryCount || 0);
  if (attempts >= GENERATED_MEDIA_R2_RETRY_MAX_ATTEMPTS) return false;
  const retryAt = Date.parse(record.cdnRetryAt || "");
  return !retryAt || Date.now() - retryAt >= GENERATED_MEDIA_R2_RETRY_COOLDOWN_MS;
}

function queueGenerationRecordMediaMaintenance(record = {}) {
  if (!generationRecordNeedsMediaMaintenance(record)) return false;
  if (GENERATED_ASSETS_ON_DEMAND && generationRecordNeedsPosterMaintenance(record) && !record.localVideoUrl) {
    return queueGeneratedVideoDownload(record.taskId, generationRecordProviderVideoUrl(record), "poster-maintenance", { repairPoster: true });
  }
  const needsImageR2 = isImageGenerationRecord(record)
    && generatedOutputStorageEnabled()
    && !String(record.cdnImageUrl || "").trim()
    && !(Array.isArray(record.cdnImageUrls) && record.cdnImageUrls.some((item) => String(item || "").trim()));
  const needsR2 = needsImageR2 || generatedOutputStorageEnabled() && (!record.cdnVideoUrl || (record.localPosterUrl && !record.cdnPosterUrl));
  const allowObjectStorageUpload = needsR2 && generationRecordCanRetryR2(record);
  if (!allowObjectStorageUpload && needsR2 && !needsImageR2 && record.localPosterUrl && record.playbackOptimizedAt) return false;
  const taskId = String(record.taskId || "");
  if (!taskId || generatedMediaMaintenanceQueued.has(taskId)) return false;
  generatedMediaMaintenanceQueued.add(taskId);
  generatedMediaMaintenanceQueue.push({ taskId, record, allowObjectStorageUpload });
  setImmediate(() => drainGenerationRecordMediaMaintenance().catch((error) => {
    console.warn("[generation-record-media-maintenance-failed]", error.message || error);
  }));
  return true;
}

async function drainGenerationRecordMediaMaintenance() {
  if (generatedMediaMaintenanceRunning) return;
  generatedMediaMaintenanceRunning = true;
  try {
    while (generatedMediaMaintenanceQueue.length) {
      const item = generatedMediaMaintenanceQueue.shift();
      const taskId = item.taskId;
      try {
        const current = await getGenerationRecord(taskId) || item.record;
        if (!generationRecordNeedsMediaMaintenance(current)) continue;
        const allowObjectStorageUpload = item.allowObjectStorageUpload && generationRecordCanRetryR2(current);
        const retryCount = Number(current.cdnRetryCount || 0) + (allowObjectStorageUpload ? 1 : 0);
        if (isImageGenerationRecord(current)) {
          await ensureGenerationRecordImageR2Published(current, { allowObjectStorageUpload });
        } else {
          await ensureGenerationRecordMediaOptimized(current, { allowObjectStorageUpload });
        }
        if (allowObjectStorageUpload) {
          await upsertGenerationRecord({
            taskId,
            cdnRetryCount: retryCount,
            cdnRetryAt: new Date().toISOString(),
          });
        }
      } catch (error) {
        console.warn("[generation-record-media-maintenance-task-failed]", taskId, error.message || error);
        if (item.allowObjectStorageUpload) {
          const current = await getGenerationRecord(taskId).catch(() => null);
          if (current) {
            await upsertGenerationRecord({
              taskId,
              cdnRetryCount: Number(current.cdnRetryCount || 0) + 1,
              cdnRetryAt: new Date().toISOString(),
              cdnError: error.message || "Generated media R2 upload failed.",
            }).catch(() => {});
          }
        }
      } finally {
        generatedMediaMaintenanceQueued.delete(taskId);
      }
    }
  } finally {
    generatedMediaMaintenanceRunning = false;
  }
}

async function refreshPivoxGenerationRecord(record = {}, reason = "pivox-query") {
  if (!PIVOX_API_KEY || !shouldRefreshGenerationRecord(record)) return record;
  const queryTaskId = record.upstreamTaskId || record.taskId;
  const raw = await pivoxRequest("GET", `/v1/video/tasks/${encodeURIComponent(queryTaskId)}`);
  const task = normalizePivoxTask(raw);
  let localVideoUrl = record.localVideoUrl || "";
  let localVideoPath = record.localVideoPath || "";
  let localPosterUrl = record.localPosterUrl || "";
  let localPosterPath = record.localPosterPath || "";
  let cdnVideoUrl = record.cdnVideoUrl || "";
  let cdnPosterUrl = record.cdnPosterUrl || "";
  let storageProvider = record.storageProvider || "";
  let storageKey = record.storageKey || "";
  let posterStorageProvider = record.posterStorageProvider || "";
  let posterStorageKey = record.posterStorageKey || "";
  let cdnError = record.cdnError || "";
  let downloadError = "";
  const remoteVideoUrl = task.videoUrl || record.remoteVideoUrl || "";
  if (isSucceededStatus(task.status) && remoteVideoUrl && (!localVideoUrl || !cdnVideoUrl)) {
    try {
      const localVideo = await downloadGeneratedVideo(record.taskId, remoteVideoUrl);
      localVideoUrl = localVideo.localVideoUrl;
      localVideoPath = localVideo.localVideoPath;
      localPosterUrl = localVideo.localPosterUrl || localPosterUrl;
      localPosterPath = localVideo.localPosterPath || localPosterPath;
      cdnVideoUrl = localVideo.cdnVideoUrl || cdnVideoUrl;
      cdnPosterUrl = localVideo.cdnPosterUrl || cdnPosterUrl;
      storageProvider = localVideo.storageProvider || storageProvider;
      storageKey = localVideo.storageKey || storageKey;
      posterStorageProvider = localVideo.posterStorageProvider || posterStorageProvider;
      posterStorageKey = localVideo.posterStorageKey || posterStorageKey;
      cdnError = localVideo.cdnError || cdnError;
    } catch (error) {
      downloadError = error.message || "Failed to download generated video.";
    }
  }
  return await upsertAndSettleGenerationRecord({
    taskId: record.taskId,
    upstreamTaskId: task.taskId || queryTaskId,
    status: task.status || record.status || "unknown",
    upstreamSource: "pivoxapi",
    remoteVideoUrl,
    videoUrl: localPublicAssetStorageEnabled()
      ? (localVideoUrl || cdnVideoUrl || remoteVideoUrl || record.videoUrl || "")
      : (cdnVideoUrl || localVideoUrl || remoteVideoUrl || record.videoUrl || ""),
    localVideoUrl,
    localVideoPath,
    localPosterUrl,
    localPosterPath,
    posterUrl: localPublicAssetStorageEnabled()
      ? (localPosterUrl || cdnPosterUrl || record.posterUrl || "")
      : (cdnPosterUrl || localPosterUrl || record.posterUrl || ""),
    cdnVideoUrl,
    cdnPosterUrl,
    storageProvider,
    storageKey,
    posterStorageProvider,
    posterStorageKey,
    cdnError,
    error: task.error || downloadError || record.error || "",
    queryResponse: raw,
    completedAt: isSucceededStatus(task.status) ? (record.completedAt || new Date().toISOString()) : record.completedAt || "",
  }, reason);
}

async function refreshApizSeedanceGenerationRecord(record = {}, reason = "apiz-seedance-query") {
  if (!APIZ_SEEDANCE_API_KEY || !shouldRefreshGenerationRecord(record)) return record;
  const queryTaskId = record.upstreamTaskId || record.taskId;
  const raw = await apizSeedanceRequest("/api/v3/tasks/query", { task_id: queryTaskId });
  const task = normalizeApizSeedanceTask(raw);
  let localVideoUrl = record.localVideoUrl || "";
  let localVideoPath = record.localVideoPath || "";
  let localPosterUrl = record.localPosterUrl || "";
  let localPosterPath = record.localPosterPath || "";
  let cdnVideoUrl = record.cdnVideoUrl || "";
  let cdnPosterUrl = record.cdnPosterUrl || "";
  let storageProvider = record.storageProvider || "";
  let storageKey = record.storageKey || "";
  let posterStorageProvider = record.posterStorageProvider || "";
  let posterStorageKey = record.posterStorageKey || "";
  let cdnError = record.cdnError || "";
  let downloadError = "";
  const remoteVideoUrl = task.videoUrl || record.remoteVideoUrl || "";
  if (isSucceededStatus(task.status) && remoteVideoUrl && (!localVideoUrl || !cdnVideoUrl)) {
    try {
      const localVideo = await downloadGeneratedVideo(record.taskId, remoteVideoUrl);
      localVideoUrl = localVideo.localVideoUrl;
      localVideoPath = localVideo.localVideoPath;
      localPosterUrl = localVideo.localPosterUrl || localPosterUrl;
      localPosterPath = localVideo.localPosterPath || localPosterPath;
      cdnVideoUrl = localVideo.cdnVideoUrl || cdnVideoUrl;
      cdnPosterUrl = localVideo.cdnPosterUrl || cdnPosterUrl;
      storageProvider = localVideo.storageProvider || storageProvider;
      storageKey = localVideo.storageKey || storageKey;
      posterStorageProvider = localVideo.posterStorageProvider || posterStorageProvider;
      posterStorageKey = localVideo.posterStorageKey || posterStorageKey;
      cdnError = localVideo.cdnError || cdnError;
    } catch (error) {
      downloadError = error.message || "Failed to download generated video.";
    }
  }
  return await upsertAndSettleGenerationRecord({
    taskId: record.taskId,
    upstreamTaskId: task.taskId || queryTaskId,
    status: task.status || record.status || "unknown",
    upstreamSource: "apiz-seedance",
    remoteVideoUrl,
    videoUrl: localPublicAssetStorageEnabled()
      ? (localVideoUrl || cdnVideoUrl || remoteVideoUrl || record.videoUrl || "")
      : (cdnVideoUrl || localVideoUrl || remoteVideoUrl || record.videoUrl || ""),
    localVideoUrl,
    localVideoPath,
    localPosterUrl,
    localPosterPath,
    posterUrl: localPublicAssetStorageEnabled()
      ? (localPosterUrl || cdnPosterUrl || record.posterUrl || "")
      : (cdnPosterUrl || localPosterUrl || record.posterUrl || ""),
    cdnVideoUrl,
    cdnPosterUrl,
    storageProvider,
    storageKey,
    posterStorageProvider,
    posterStorageKey,
    cdnError,
    error: task.error || downloadError || record.error || "",
    queryResponse: raw,
    completedAt: isSucceededStatus(task.status) ? (record.completedAt || new Date().toISOString()) : record.completedAt || "",
  }, reason);
}

async function refreshIgnexGenerationRecord(record = {}, reason = "ignex-query") {
  if (!IGNEX_API_KEY || !shouldRefreshGenerationRecord(record)) return record;
  const queryTaskId = record.upstreamTaskId || record.taskId;
  const raw = await ignexRequest("GET", `/api/v3/contents/generations/tasks/${encodeURIComponent(queryTaskId)}`);
  const task = normalizeIgnexTask(raw);
  let localVideoUrl = record.localVideoUrl || "";
  let localVideoPath = record.localVideoPath || "";
  let localPosterUrl = record.localPosterUrl || "";
  let localPosterPath = record.localPosterPath || "";
  let cdnVideoUrl = record.cdnVideoUrl || "";
  let cdnPosterUrl = record.cdnPosterUrl || "";
  let storageProvider = record.storageProvider || "";
  let storageKey = record.storageKey || "";
  let posterStorageProvider = record.posterStorageProvider || "";
  let posterStorageKey = record.posterStorageKey || "";
  let cdnError = record.cdnError || "";
  let downloadError = "";
  const remoteVideoUrl = task.videoUrl || record.remoteVideoUrl || "";
  if (isSucceededStatus(task.status) && remoteVideoUrl && (!localVideoUrl || !cdnVideoUrl)) {
    try {
      const localVideo = await downloadGeneratedVideo(record.taskId, remoteVideoUrl);
      localVideoUrl = localVideo.localVideoUrl;
      localVideoPath = localVideo.localVideoPath;
      localPosterUrl = localVideo.localPosterUrl || localPosterUrl;
      localPosterPath = localVideo.localPosterPath || localPosterPath;
      cdnVideoUrl = localVideo.cdnVideoUrl || cdnVideoUrl;
      cdnPosterUrl = localVideo.cdnPosterUrl || cdnPosterUrl;
      storageProvider = localVideo.storageProvider || storageProvider;
      storageKey = localVideo.storageKey || storageKey;
      posterStorageProvider = localVideo.posterStorageProvider || posterStorageProvider;
      posterStorageKey = localVideo.posterStorageKey || posterStorageKey;
      cdnError = localVideo.cdnError || cdnError;
    } catch (error) {
      downloadError = error.message || "Failed to download generated video.";
    }
  }
  return await upsertAndSettleGenerationRecord({
    taskId: record.taskId,
    upstreamTaskId: task.taskId || queryTaskId,
    status: task.status || record.status || "unknown",
    upstreamSource: "ignex",
    remoteVideoUrl,
    videoUrl: localPublicAssetStorageEnabled()
      ? (localVideoUrl || cdnVideoUrl || remoteVideoUrl || record.videoUrl || "")
      : (cdnVideoUrl || localVideoUrl || remoteVideoUrl || record.videoUrl || ""),
    localVideoUrl,
    localVideoPath,
    localPosterUrl,
    localPosterPath,
    posterUrl: localPublicAssetStorageEnabled()
      ? (localPosterUrl || cdnPosterUrl || record.posterUrl || "")
      : (cdnPosterUrl || localPosterUrl || record.posterUrl || ""),
    cdnVideoUrl,
    cdnPosterUrl,
    storageProvider,
    storageKey,
    posterStorageProvider,
    posterStorageKey,
    cdnError,
    error: task.error || downloadError || record.error || "",
    queryResponse: raw,
    completedAt: isSucceededStatus(task.status) ? (record.completedAt || new Date().toISOString()) : record.completedAt || "",
  }, reason);
}

async function refreshVegaGenerationRecord(record = {}, reason = "vega-query") {
  const subAppId = Number(process.env.TENCENT_VOD_SUB_APP_ID || 0);
  if (!record.upstreamTaskId || !Number.isInteger(subAppId) || subAppId <= 0) return record;
  const queryPayload = { SubAppId: subAppId, TaskId: record.upstreamTaskId };
  const raw = await callTencentVod({ action: "DescribeTaskDetail", payload: queryPayload });
  const task = vegaTaskDetail(raw);
  if (!task) {
    throw Object.assign(new Error("Tencent VOD returned no AigcVideoTask detail."), {
      statusCode: 502,
      code: "TENCENT_VOD_TASK_DETAIL_MISSING",
      payload: raw,
    });
  }
  const status = normalizeVegaStatus(task.Status);
  const succeeded = isSucceededStatus(status);
  const remoteVideoUrl = succeeded ? (vegaOutputVideoUrl(task) || record.remoteVideoUrl || "") : record.remoteVideoUrl || "";
  const lastFrameUrl = succeeded ? (vegaOutputLastFrameUrl(task) || record.lastFrameUrl || "") : record.lastFrameUrl || "";
  const vegaUsage = vegaOutputUsage(task);
  const failed = isFailedStatus(status) || (succeeded && !remoteVideoUrl);
  let media = {};
  let downloadError = "";
  if (succeeded && remoteVideoUrl && (!record.localVideoUrl || !record.cdnVideoUrl)) {
    try {
      media = await downloadGeneratedVideo(record.taskId, remoteVideoUrl);
    } catch (error) {
      downloadError = error.message || "Failed to download generated video.";
    }
  }
  const failureMessage = failed
    ? (vegaTaskFailureMessage(task) || (succeeded ? "Tencent VOD returned no output video." : record.error || "Tencent VOD generation failed."))
    : "";
  const preDeducted = creditsAmount(record.preDeductedCredits || 0);
  return upsertAndSettleGenerationRecord({
    taskId: record.taskId,
    upstreamTaskId: record.upstreamTaskId,
    status: succeeded && remoteVideoUrl ? "succeeded" : failed ? "failed" : status,
    awaitingUpstreamTask: !succeeded && !failed,
    remoteVideoUrl,
    videoUrl: localPublicAssetStorageEnabled()
      ? (media.localVideoUrl || media.cdnVideoUrl || remoteVideoUrl || record.videoUrl || "")
      : (media.cdnVideoUrl || media.localVideoUrl || remoteVideoUrl || record.videoUrl || ""),
    localVideoUrl: media.localVideoUrl || record.localVideoUrl || "",
    localVideoPath: media.localVideoPath || record.localVideoPath || "",
    localPosterUrl: media.localPosterUrl || record.localPosterUrl || "",
    localPosterPath: media.localPosterPath || record.localPosterPath || "",
    posterUrl: localPublicAssetStorageEnabled()
      ? (media.localPosterUrl || media.cdnPosterUrl || record.posterUrl || "")
      : (media.cdnPosterUrl || media.localPosterUrl || record.posterUrl || ""),
    cdnVideoUrl: media.cdnVideoUrl || record.cdnVideoUrl || "",
    cdnPosterUrl: media.cdnPosterUrl || record.cdnPosterUrl || "",
    storageProvider: media.storageProvider || record.storageProvider || "",
    storageKey: media.storageKey || record.storageKey || "",
    posterStorageProvider: media.posterStorageProvider || record.posterStorageProvider || "",
    posterStorageKey: media.posterStorageKey || record.posterStorageKey || "",
    cdnError: media.cdnError || record.cdnError || "",
    error: failureMessage || downloadError,
    queryResponse: raw,
    ...(succeeded && remoteVideoUrl ? {
      finalCredits: preDeducted,
      originalFinalCredits: creditsAmount(record.originalPreDeductedCredits ?? record.originalFinalCredits ?? preDeducted),
      billingStatus: preDeducted > 0 ? "settled" : "free",
      billingSettledAt: record.billingSettledAt || new Date().toISOString(),
      completedAt: record.completedAt || new Date().toISOString(),
    } : failed ? {
      finalCredits: 0,
      originalFinalCredits: 0,
    } : {}),
  }, reason);
}

async function refreshGenerationRecordStatus(record = {}) {
  if (isChatCompletionGenerationRecord(record)) return record;
  if (needsApizFailureRefund(record)) {
    return settleApizGenerationRecord(record, { status: record.status || "failed", error: record.error || "" }, "refresh");
  }
  if (needsSeedanceFailureRefund(record)) {
    return settleSeedanceGenerationRecord(record, "refresh");
  }
  if (isStalePreSubmitGenerationRecord(record)) {
    return failStalePreSubmitGenerationRecord(record, "refresh-stale-submit");
  }
  if (
    String(record.provider || "").toLowerCase() === "seedream5-image" &&
    String(record.source || "").toLowerCase() === "my-character-image-generate"
  ) {
    return refreshMyCharacterImageGenerationRecord(record, "generation-record-refresh");
  }
  if (record.upstreamSource === "tencent-vod") {
    if (!shouldRefreshGenerationRecord(record)) return record;
    try {
      return await refreshVegaGenerationRecord(record, "vega-query");
    } catch (error) {
      console.warn("[vega-generation-record-refresh-failed]", record.taskId, error.message || error);
      if (upstreamResourceMissing(error)) {
        return await upsertAndSettleGenerationRecord({
          taskId: record.taskId,
          status: "failed",
          error: error.message || "Tencent VOD task resource not found.",
          queryResponse: error.payload || record.queryResponse || null,
          finalCredits: 0,
          originalFinalCredits: 0,
        }, "vega-missing-resource");
      }
      return upsertGenerationRecord({
        taskId: record.taskId,
        statusQueryError: error.message || "Failed to query Tencent VOD task status.",
        statusQueryStatusCode: error.statusCode || 0,
        statusQueryPayload: error.payload || null,
        statusQueryCheckedAt: new Date().toISOString(),
        lastUpdateReason: "vega-status-query-failed",
      });
    }
  }
  if (record.provider === "apiz") {
    if ((!APIZ_API_KEY && record.upstreamSource !== "gateway") || !shouldRefreshGenerationRecord(record)) return record;
    try {
      return await refreshApizGenerationRecord(record);
    } catch (error) {
      console.warn("[apiz-generation-record-refresh-failed]", record.taskId, error.message || error);
      return record;
    }
  }
  if (record.provider === "seedance25" && record.upstreamSource !== "gateway") {
    if (!SEEDANCE25_API_KEY || !shouldRefreshGenerationRecord(record)) return record;
    try {
      return await refreshSeedance25GenerationRecord(record, "query");
    } catch (error) {
      console.warn("[seedance25-generation-record-refresh-failed]", record.taskId, error.message || error);
      return record;
    }
  }
  if (record.upstreamSource === "gateway") {
    if (!shouldRefreshGenerationRecord(record)) return record;
    try {
      const queryTaskId = record.upstreamTaskId || record.taskId;
      const task = await gatewayQueryTask(queryTaskId);
      if (isImageGenerationRecord(record)) {
        const remoteImageUrls = [...new Set([
          ...(Array.isArray(task.imageUrls) ? task.imageUrls : []),
          task.imageUrl,
          ...(Array.isArray(record.remoteImageUrls) ? record.remoteImageUrls : []),
          record.remoteImageUrl,
        ].map((value) => String(value || "").trim()).filter(Boolean))];
        const imageUrl = remoteImageUrls[0] || "";
        const failed = isFailedStatus(task.status);
        if (!imageUrl && !failed) {
          return await updateAssetImageModifyRecord(record.taskId, {
            upstreamTaskId: task.taskId || queryTaskId,
            status: task.status || record.status || "running",
            awaitingUpstreamTask: true,
            queryResponse: task.raw,
            error: task.error || "",
          }, "gateway-image-query");
        }
        if (failed && !imageUrl) {
          if (Number(record.preDeductedCredits || 0) > 0 && record.billingStatus === "pre_deducted") {
            try {
              const db = await readDb();
              await changeUserCredits(db, record.userId, Number(record.preDeductedCredits || 0), "asset_image_modify_refund", {
                taskId: record.taskId,
                error: task.error || "Gateway image generation failed.",
              });
              await recordSubtokenAdjustment(record, {
                taskId: record.taskId,
                type: "asset_image_modify_refund",
                amount: -Number(record.preDeductedCredits || 0),
                meta: { error: task.error || "Gateway image generation failed." },
              });
              if (!dbEnabled()) await writeDb(db);
            } catch (refundError) {
              console.error("[gateway-image-refresh-refund-failed]", record.taskId, refundError.message || refundError);
            }
          }
          return await updateAssetImageModifyRecord(record.taskId, {
            upstreamTaskId: task.taskId || queryTaskId,
            status: "failed",
            awaitingUpstreamTask: false,
            queryResponse: task.raw,
            error: task.error || "Gateway image generation failed.",
            finalCredits: 0,
            originalFinalCredits: 0,
            billingStatus: Number(record.preDeductedCredits || 0) > 0 ? "refunded" : "free",
            billingSettledAt: new Date().toISOString(),
            failedAt: new Date().toISOString(),
          }, "gateway-image-failed");
        }
        const storedImageUrls = [...new Set([
          ...(Array.isArray(record.imageResultUrls) ? record.imageResultUrls : []),
          ...(Array.isArray(record.cdnImageUrls) ? record.cdnImageUrls : []),
          ...(Array.isArray(record.localImageUrls) ? record.localImageUrls : []),
          record.imageResultUrl,
          record.cdnImageUrl,
          record.localImageUrl,
        ].map((value) => String(value || "").trim()).filter(Boolean))];
        const savedImages = [];
        if (imageUrl && storedImageUrls.length < remoteImageUrls.length) {
          for (let index = 0; index < remoteImageUrls.length; index += 1) {
            savedImages.push(await saveRemoteGeneratedImage(index ? `${record.taskId}-${index + 1}` : record.taskId, remoteImageUrls[index]));
          }
        }
        const localImageUrls = savedImages.length ? savedImages.map((item) => item.localImageUrl).filter(Boolean) : (record.localImageUrls || []);
        const cdnImageUrls = savedImages.length ? savedImages.map((item) => item.cdnImageUrl).filter(Boolean) : (record.cdnImageUrls || []);
        const resultImageUrls = savedImages.length
          ? savedImages.map((item, index) => item.cdnImageUrl || remoteImageUrls[index] || item.localImageUrl).filter(Boolean)
          : (record.imageResultUrls?.length ? record.imageResultUrls : storedImageUrls.length ? storedImageUrls : remoteImageUrls);
        const savedImage = savedImages[0] || null;
        return await updateAssetImageModifyRecord(record.taskId, {
          upstreamTaskId: task.taskId || queryTaskId,
          status: "succeeded",
          awaitingUpstreamTask: false,
          imageResultUrl: resultImageUrls[0] || imageUrl,
          imageResultUrls: resultImageUrls,
          localImageUrl: "",
          localImageUrls: savedImages.length ? [] : [],
          localImagePath: "",
          cdnImageUrl: savedImage?.cdnImageUrl || record.cdnImageUrl || "",
          cdnImageUrls,
          cdnImageStorageKeys: savedImages.length
            ? savedImages.map((item) => item.storageKey || "")
            : generationRecordImageStorageKeys(record),
          storageProvider: savedImage?.storageProvider || record.storageProvider || "",
          storageKey: savedImage?.storageKey || generationRecordImageStorageKeys(record)[0] || record.storageKey || "",
          cdnError: savedImages.map((item) => item.cdnError).filter(Boolean).join("; ") || record.cdnError || "",
          remoteImageUrl: imageUrl,
          remoteImageUrls,
          queryResponse: task.raw,
          finalCredits: record.preDeductedCredits || record.finalCredits || 0,
          originalFinalCredits: record.originalPreDeductedCredits || record.originalFinalCredits || 0,
          billingStatus: Number(record.preDeductedCredits || 0) > 0 ? "settled" : "free",
          billingSettledAt: record.billingSettledAt || new Date().toISOString(),
          completedAt: record.completedAt || new Date().toISOString(),
          error: "",
        }, "gateway-image-succeeded");
      }
      const media = isSucceededStatus(task.status) && task.videoUrl && (!record.localVideoUrl || !record.cdnVideoUrl)
        ? await maybeDownloadApizVideo(record, task.videoUrl)
        : {};
      return await upsertAndSettleGenerationRecord({
        taskId: record.taskId,
        upstreamTaskId: task.taskId || queryTaskId,
        status: task.status || record.status || "unknown",
        remoteVideoUrl: task.videoUrl || record.remoteVideoUrl || "",
        videoUrl: localPublicAssetStorageEnabled()
          ? (media.localVideoUrl || media.cdnVideoUrl || task.videoUrl || record.videoUrl || "")
          : (media.cdnVideoUrl || media.localVideoUrl || task.videoUrl || record.videoUrl || ""),
        localVideoUrl: media.localVideoUrl || record.localVideoUrl || "",
        localVideoPath: media.localVideoPath || record.localVideoPath || "",
        localPosterUrl: media.localPosterUrl || record.localPosterUrl || "",
        localPosterPath: media.localPosterPath || record.localPosterPath || "",
        posterUrl: localPublicAssetStorageEnabled()
          ? (media.localPosterUrl || media.cdnPosterUrl || record.posterUrl || "")
          : (media.cdnPosterUrl || media.localPosterUrl || record.posterUrl || ""),
        cdnVideoUrl: media.cdnVideoUrl || record.cdnVideoUrl || "",
        cdnPosterUrl: media.cdnPosterUrl || record.cdnPosterUrl || "",
        storageProvider: media.storageProvider || record.storageProvider || "",
        storageKey: media.storageKey || record.storageKey || "",
        posterStorageProvider: media.posterStorageProvider || record.posterStorageProvider || "",
        posterStorageKey: media.posterStorageKey || record.posterStorageKey || "",
        cdnError: media.cdnError || record.cdnError || "",
        error: task.error || media.downloadError || record.error || "",
        queryResponse: task.raw,
        completedAt: isSucceededStatus(task.status) ? (record.completedAt || new Date().toISOString()) : record.completedAt || "",
      }, "gateway-query");
    } catch (error) {
      console.warn("[gateway-generation-record-refresh-failed]", record.taskId, error.message || error);
      return record;
    }
  }
  if (record.upstreamSource === "apiz-seedance") {
    return record;
  }
  if (record.upstreamSource === "pivoxapi") {
    return record;
  }
  if (record.upstreamSource === "ignex") {
    if (!shouldRefreshGenerationRecord(record)) return record;
    try {
      return await refreshIgnexGenerationRecord(record, "ignex-query");
    } catch (error) {
      console.warn("[ignex-generation-record-refresh-failed]", record.taskId, error.message || error);
      return record;
    }
  }
  if (["aliyun-wan30", "aliyun-wan27", "aliyun-happyhorse"].includes(record.provider)) {
    const isPrimeRecord = record.provider === "aliyun-wan30"
      && String(record.videoCapability || record.params?.videoCapability || "").toLowerCase() === "wan30-video-prime";
    const configured = record.provider === "aliyun-wan30"
      ? (isPrimeRecord ? (ALIYUN_WAN30_PRIME_API_KEY || ALIYUN_WAN30_API_KEY) : ALIYUN_WAN30_API_KEY)
      : ALIYUN_DASHSCOPE_API_KEY;
    if (!configured || !shouldRefreshGenerationRecord(record)) return record;
    try {
      return await refreshWan27GenerationRecord(record, { download: false, reason: "query" });
    } catch (error) {
      console.warn("[wan27-generation-record-refresh-failed]", record.taskId, error.message || error);
      if (upstreamResourceMissing(error)) {
        return await upsertAndSettleGenerationRecord({
          taskId: record.taskId,
          status: "failed",
          error: error.message || "Upstream task resource not found.",
          queryResponse: error.payload || record.queryResponse || null,
          finalCredits: 0,
          originalFinalCredits: 0,
        }, "wan27-missing-resource");
      }
      return record;
    }
  }
  if (record.provider === "aliyun-wan27-image") {
    if (!ALIYUN_DASHSCOPE_API_KEY || !shouldRefreshGenerationRecord(record)) return record;
    try {
      return await refreshWan27ImageGenerationRecord(record, { reason: "query" });
    } catch (error) {
      console.warn("[wan27-image-generation-record-refresh-failed]", record.taskId, error.message || error);
      return record;
    }
  }
  if (!ARK_API_KEY || !shouldRefreshGenerationRecord(record)) return record;
  try {
    const queryTaskId = record.upstreamTaskId || record.taskId;
    const raw = await arkRequest("GET", `/contents/generations/tasks/${encodeURIComponent(queryTaskId)}`);
    const task = normalizeTask(raw);
    let localVideoUrl = record.localVideoUrl || "";
    let localVideoPath = record.localVideoPath || "";
    let localPosterUrl = record.localPosterUrl || "";
    let localPosterPath = record.localPosterPath || "";
    let cdnVideoUrl = record.cdnVideoUrl || "";
    let cdnPosterUrl = record.cdnPosterUrl || "";
    let storageProvider = record.storageProvider || "";
    let storageKey = record.storageKey || "";
    let posterStorageProvider = record.posterStorageProvider || "";
    let posterStorageKey = record.posterStorageKey || "";
    let cdnError = record.cdnError || "";
    let downloadError = "";
    const remoteVideoUrl = task.videoUrl || record.remoteVideoUrl || "";
    if (isSucceededStatus(task.status) && remoteVideoUrl && (!localVideoUrl || !cdnVideoUrl)) {
      try {
        const localVideo = await downloadGeneratedVideo(record.taskId, remoteVideoUrl);
        localVideoUrl = localVideo.localVideoUrl;
        localVideoPath = localVideo.localVideoPath;
        localPosterUrl = localVideo.localPosterUrl || localPosterUrl;
        localPosterPath = localVideo.localPosterPath || localPosterPath;
        cdnVideoUrl = localVideo.cdnVideoUrl || cdnVideoUrl;
        cdnPosterUrl = localVideo.cdnPosterUrl || cdnPosterUrl;
        storageProvider = localVideo.storageProvider || storageProvider;
        storageKey = localVideo.storageKey || storageKey;
        posterStorageProvider = localVideo.posterStorageProvider || posterStorageProvider;
        posterStorageKey = localVideo.posterStorageKey || posterStorageKey;
        cdnError = localVideo.cdnError || cdnError;
      } catch (error) {
        downloadError = error.message || "Failed to download generated video.";
      }
    }
    return await upsertAndSettleGenerationRecord({
      taskId: record.taskId,
      upstreamTaskId: task.taskId || queryTaskId,
      status: task.status || record.status || "unknown",
      remoteVideoUrl,
      localVideoUrl,
      localVideoPath,
      localPosterUrl,
      localPosterPath,
      posterUrl: localPublicAssetStorageEnabled()
        ? (localPosterUrl || cdnPosterUrl || record.posterUrl || "")
        : (cdnPosterUrl || localPosterUrl || record.posterUrl || ""),
      cdnVideoUrl,
      cdnPosterUrl,
      storageProvider,
      storageKey,
      posterStorageProvider,
      posterStorageKey,
      cdnError,
      error: task.error || downloadError || record.error || "",
      queryResponse: raw,
    }, "query");
  } catch (error) {
    console.warn("[generation-record-refresh-failed]", record.taskId, error.message || error);
    if (upstreamResourceMissing(error)) {
      if (isChatCompletionGenerationRecord(record) || String(record.textResult || record.responseText || "").trim()) {
        console.warn("[generation-record-refresh-ignored-missing-chat]", record.taskId);
        return record;
      }
      return await upsertAndSettleGenerationRecord({
        taskId: record.taskId,
        status: "failed",
        error: error.message || "Upstream task resource not found.",
        queryResponse: error.payload || record.queryResponse || null,
        finalCredits: 0,
        originalFinalCredits: 0,
      }, "missing-resource");
    }
    if (needsSeedanceFailureRefund(record) || (seedanceUsesTokenPricing(record) && isSucceededStatus(record.status) && !record.billingSettledAt)) {
      return settleSeedanceGenerationRecord(record, "refresh-fallback");
    }
    return upsertGenerationRecord({
      taskId: record.taskId,
      statusQueryError: error.message || "Failed to query upstream task status.",
      statusQueryStatusCode: error.statusCode || 0,
      statusQueryPayload: error.payload || null,
      statusQueryCheckedAt: new Date().toISOString(),
      lastUpdateReason: "status-query-failed",
    });
  }
}

function isSucceededStatus(status) {
  return ["succeeded", "success", "done", "completed", "image_ready"].includes(String(status || "").toLowerCase());
}

function isFailedStatus(status) {
  return ["failed", "error", "cancelled", "canceled", "image_failed", "unknown"].includes(String(status || "").toLowerCase());
}

function isActiveGenerationStatus(status) {
  const normalized = String(status || "").toLowerCase();
  return ["submitting", "preparing", "submitted", "queued", "pending", "running", "processing", "generating"].includes(normalized);
}

function generationRecordCreatedMs(record = {}) {
  const value = Date.parse(record.createdAt || record.submittedAt || record.updatedAt || "");
  return Number.isFinite(value) ? value : 0;
}

function generationRecordUpdatedMs(record = {}) {
  const value = Date.parse(record.updatedAt || record.completedAt || record.billingSettledAt || record.createdAt || "");
  return Number.isFinite(value) ? value : 0;
}

function seedream5ImageRecordHasResult(record = {}) {
  return Boolean(record.imageResultUrl || record.localImageUrl || record.cdnImageUrl || record.remoteImageUrl || record.providerImageUrl || record.upstreamImageUrl);
}

function seedream5ImageRequestFingerprint({ userId = "", model = "", prompt = "", resolution = "", tier = "", outputFormat = "", optimizePromptOptions = null, referenceInputs = [] } = {}) {
  const normalizedReferences = (Array.isArray(referenceInputs) ? referenceInputs : [])
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (!item || typeof item !== "object") return "";
      return String(item.assetId || item.assetUri || item.referenceAssetUri || item.seedanceAssetUri || item.url || item.imageUrl || item.fileName || "").trim();
    })
    .filter(Boolean);
  return crypto
    .createHash("sha256")
    .update(JSON.stringify({
      provider: "seedream5-image",
      userId: String(userId || ""),
      model: String(model || ""),
      prompt: String(prompt || "").trim(),
      resolution: String(resolution || ""),
      tier: String(tier || ""),
      outputFormat: String(outputFormat || ""),
      optimizePromptOptions: optimizePromptOptions || null,
      references: normalizedReferences,
    }))
    .digest("hex")
    .slice(0, 32);
}

async function findActiveSeedream5ImageDuplicate({ userId = "", fingerprint = "", windowMs = 5 * 60 * 1000, recentSettledWindowMs = 3 * 60 * 1000 } = {}) {
  const cleanFingerprint = String(fingerprint || "").trim();
  if (!userId || !cleanFingerprint) return null;
  const cutoff = Date.now() - Math.max(30 * 1000, Number(windowMs) || 0);
  const settledCutoff = Date.now() - Math.max(0, Number(recentSettledWindowMs) || 0);
  const records = await listGenerationRecordsForUser(userId, 80);
  return records.find((record) => (
    record &&
    record.provider === "seedream5-image" &&
    record.kind === "advanced-image" &&
    String(record.requestFingerprint || record.params?.requestFingerprint || "") === cleanFingerprint &&
    (
      (isActiveGenerationStatus(record.status) && generationRecordCreatedMs(record) >= cutoff) ||
      (isSucceededStatus(record.status) && seedream5ImageRecordHasResult(record) && generationRecordUpdatedMs(record) >= settledCutoff)
    )
  )) || null;
}

function requestTraceForGeneration(req) {
  if (!req || !req.headers) return {};
  const ip = requestIpForStats(req);
  return {
    requestIp: ip,
    requestIpHash: ipHashForStats(ip),
    requestUserAgent: compactPlainText(req.headers["user-agent"] || "", 220),
    requestReferer: compactPlainText(req.headers.referer || req.headers.referrer || "", 260),
  };
}

async function withSeedream5ImageInFlight(fingerprint, fn) {
  const key = String(fingerprint || "").trim();
  if (!key) return await fn();
  while (SEEDREAM5_IMAGE_IN_FLIGHT.has(key)) {
    await SEEDREAM5_IMAGE_IN_FLIGHT.get(key).catch(() => {});
  }
  let release = () => {};
  const lock = new Promise((resolve) => {
    release = resolve;
  });
  SEEDREAM5_IMAGE_IN_FLIGHT.set(key, lock);
  try {
    return await fn();
  } finally {
    if (SEEDREAM5_IMAGE_IN_FLIGHT.get(key) === lock) {
      SEEDREAM5_IMAGE_IN_FLIGHT.delete(key);
    }
    release();
  }
}

function normalizeErrorPayload(error = {}) {
  const payload = error?.payload && typeof error.payload === "object" ? error.payload : null;
  return {
    message: error?.message || payload?.message || payload?.output?.message || "",
    code: error?.code || payload?.code || payload?.error?.code || "",
    statusCode: error?.statusCode || 0,
    payload,
  };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function videoFileName(taskId) {
  return `${String(taskId).replace(/[^a-z0-9_-]/gi, "_")}.mp4`;
}

function expectedGeneratedVideoDurationSeconds(record = {}) {
  const candidates = [
    record.expectedDurationSeconds,
    record.duration,
    record.params?.duration,
    record.pricingEstimate?.requestedDuration,
    record.queryResponse?.duration,
    record.queryResponse?.output?.duration,
    record.queryResponse?.data?.duration,
  ];
  for (const candidate of candidates) {
    const seconds = durationSecondsFromValue(candidate);
    if (seconds > 0) return seconds;
  }
  return 0;
}

function generatedVideoIsTooShort(actualSeconds, expectedSeconds) {
  return actualSeconds > 0
    && expectedSeconds > 0
    && actualSeconds + GENERATED_VIDEO_DURATION_TOLERANCE_SECONDS < expectedSeconds;
}

