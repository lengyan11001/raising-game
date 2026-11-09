async function handleAdminScanWalletOrders(req, res) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const result = await scanAndSettleWalletOrders({ force: true, limit: 200 });
  return sendJson(res, 200, result);
}

async function handleAdminListUserAssets(req, res, url) {
  const auth = await requireAdmin(req, res, { loadDb: false });
  if (!auth) return;
  const paging = pagingFromUrl(url || new URL("http://localhost"), { defaultLimit: 20, maxLimit: 100 });
  const query = String((url || new URL("http://localhost")).searchParams.get("q") || "").trim().toLowerCase();
  if (dbEnabled()) {
    const result = await getAdminUserAssetsPageFromDb({ page: paging.page, limit: paging.limit, queryText: query });
    if (result) {
      const userMap = new Map(result.items.map((a) => [a.userId, { username: a.username }]));
      return sendJson(res, 200, { ok: true, assets: result.items.map((a) => adminUserAssetView(a, userMap)), page: result.page, limit: result.limit, total: result.total, totalPages: Math.max(1, Math.ceil(result.total / result.limit)) });
    }
  }
  const userMap = new Map((auth.db.users || []).map((u) => [u.id, u]));
  let list = (auth.db.userAssets || []).map((a) => adminUserAssetView(a, userMap));
  if (query) {
    list = list.filter((asset) => [asset.id, asset.username, asset.userId, asset.mime, asset.localUrl, asset.publicUrl]
      .some((value) => String(value || "").toLowerCase().includes(query)));
  }
  list.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  const paged = pagedResponse(list, paging);
  return sendJson(res, 200, { ok: true, assets: paged.items, page: paged.page, limit: paged.limit, total: paged.total, totalPages: paged.totalPages });
}

async function handleAdminListGenerationRecords(req, res, url) {
  const auth = await requireAdmin(req, res, { loadDb: false });
  if (!auth) return;
  const paging = pagingFromUrl(url, { defaultLimit: 20, maxLimit: 100 });
  const query = String(url.searchParams.get("q") || "").trim();
  const provider = String(url.searchParams.get("provider") || "").trim();
  const status = String(url.searchParams.get("status") || "").trim().toLowerCase();
  const kind = String(url.searchParams.get("kind") || "").trim();
  const refreshRequested = generationListRefreshRequested(url);
  if (dbEnabled()) {
    const loadPage = () => getAdminGenerationRecordsPageFromDb({
      page: paging.page,
      limit: paging.limit,
      search: query,
      provider,
      status,
      kind,
    });
    const result = await loadPage();
    if (refreshRequested) {
      const refreshable = result.records
        .filter((record) => needsApizFailureRefund(record)
          || needsSeedanceFailureRefund(record)
          || shouldRefreshGenerationRecordFromList(record))
        .slice(0, 20);
      queueGenerationRecordStatusRefreshes(refreshable, { reason: "admin-list" });
    }
    const users = await getUsersByIdsInDb(result.records.map((record) => record.userId));
    const userMap = new Map(users.map((user) => [user.id, user]));
    return sendJson(res, 200, {
      ok: true,
      records: result.records.map((record) => adminGenerationRecordListView(record, userMap)),
      page: result.page,
      limit: result.limit,
      total: result.total,
      filtered: result.filtered,
      totalPages: result.totalPages,
    });
  }
  const records = await readGenerationRecords();
  const refundable = refreshRequested
    ? records.filter((record) => needsApizFailureRefund(record) || needsSeedanceFailureRefund(record)).slice(0, 20)
    : [];
  const statusRefreshable = refreshRequested
    ? records
      .filter((record) => !needsApizFailureRefund(record) && !needsSeedanceFailureRefund(record) && shouldRefreshGenerationRecordFromList(record))
      .filter((record) => !query || generationRecordMatchesQuery(record, query))
      .slice(0, 4)
    : [];
  const refreshable = [...refundable, ...statusRefreshable];
  queueGenerationRecordStatusRefreshes(refreshable, { reason: "admin-list" });
  const userMap = new Map((auth.db.users || []).map((user) => [user.id, user]));
  const enriched = records.map((record) => adminGenerationRecordListView(record, userMap));
  const filtered = enriched.filter((record) => {
    if (provider && record.provider !== provider) return false;
    if (kind && record.kind !== kind) return false;
    if (status && String(record.status || "").toLowerCase() !== status) return false;
    return generationRecordMatchesQuery(record, query);
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / paging.limit));
  const page = Math.min(paging.page, totalPages);
  const offset = (page - 1) * paging.limit;
  return sendJson(res, 200, {
    ok: true,
    records: filtered.slice(offset, offset + paging.limit),
    page,
    limit: paging.limit,
    total: records.length,
    filtered: filtered.length,
    totalPages,
  });
}

async function handleAdminGetGenerationRecord(req, res, taskId) {
  const auth = await requireAdmin(req, res, { loadDb: false });
  if (!auth) return;
  const record = await getGenerationRecord(decodeURIComponent(taskId));
  if (!record) return sendJson(res, 404, { ok: false, message: "Generation record not found." });
  const enrichedRecord = await enrichAdminGenerationRecordMedia(record);
  const user = record.userId ? await getUserByIdInDb(record.userId) : null;
  const userMap = new Map(user ? [[user.id, user]] : []);
  const view = adminGenerationRecordView(enrichedRecord, userMap);
  const target = generationRecordDownloadTarget(enrichedRecord);
  if (target?.localPath || isPublicHttpUrl(target?.url || "")) {
    view.adminResultPreviewUrl = adminGenerationMediaUrl(enrichedRecord.taskId);
    view.adminResultPreviewType = String(target.mime || "").startsWith("video/") ? "video" : "image";
  }
  view.mediaAssets = (Array.isArray(view.mediaAssets) ? view.mediaAssets : []).map((asset, index) => {
    const referenceIndex = Number.isInteger(Number(asset?.referenceIndex)) && Number(asset.referenceIndex) >= 0
      ? Number(asset.referenceIndex)
      : index;
    const signedPreviewUrl = adminGenerationReferenceMediaUrl(enrichedRecord.taskId, referenceIndex);
    const directPreviewUrl = adminRecordMediaAssetUrl(asset);
    return {
      ...asset,
      referenceIndex,
      adminPreviewUrl: signedPreviewUrl || directPreviewUrl,
      adminSourcePreviewUrl: directPreviewUrl,
      adminDownloadUrl: signedPreviewUrl
        ? adminGenerationReferenceMediaUrl(enrichedRecord.taskId, referenceIndex, { download: true })
        : directPreviewUrl,
    };
  });
  return sendJson(res, 200, { ok: true, record: view });
}

async function handleAdminGenerationRecordReferenceMedia(req, res, taskId, referenceIndex, url) {
  const mediaToken = url?.searchParams?.get("token") || "";
  const tokenPayload = mediaToken ? parseAdminGenerationReferenceMediaToken(mediaToken) : null;
  const decodedTaskId = decodeURIComponent(taskId);
  const index = Number(referenceIndex);
  if (tokenPayload && (tokenPayload.taskId !== decodedTaskId || Number(tokenPayload.referenceIndex) !== index)) {
    return sendJson(res, 403, { ok: false, message: "Media token does not match this reference." });
  }
  if (!tokenPayload) {
    const auth = await requireAdmin(req, res, { loadDb: false });
    if (!auth) return;
  }
  const record = await getGenerationRecord(decodedTaskId);
  if (!record) return sendJson(res, 404, { ok: false, message: "Generation record not found." });
  const assets = Array.isArray(record.mediaAssets) ? record.mediaAssets : [];
  const indexedAsset = Number.isInteger(index) && index >= 0
    ? assets.find((asset) => Number.isInteger(Number(asset?.referenceIndex)) && Number(asset.referenceIndex) === index)
    : null;
  const assetIndex = indexedAsset ? assets.indexOf(indexedAsset) : index;
  if (!Number.isInteger(assetIndex) || assetIndex < 0 || assetIndex >= assets.length) {
    return sendJson(res, 404, { ok: false, message: "Reference media not found." });
  }
  const asset = assets[assetIndex] || {};
  let linked = null;
  if (asset.userAssetId) {
    linked = await getUserAssetFromDb(asset.userAssetId);
  }
  const localUrl = String(linked?.localUrl || asset.localUrl || asset.localImageUrl || asset.localVideoUrl || "").trim();
  let localPath = "";
  if (localUrl && !/^https?:\/\//i.test(localUrl) && !/^asset:\/\//i.test(localUrl)) {
    try { localPath = localPathForUserAsset({ localUrl }); } catch { localPath = ""; }
  }
  const remoteUrl = adminRecordMediaAssetUrl(asset, new Map(linked ? [[String(linked.id), linked]] : []));
  const download = url?.searchParams?.get("download") === "1";
  const fileName = String(linked?.name || asset.fileName || asset.name || `reference-${index + 1}`).replace(/[^a-z0-9._-]/gi, "-") || `reference-${index + 1}`;
  const fallbackMime = String(linked?.mime || asset.mime || "").split(";")[0].trim() || (isVideoUrl(remoteUrl) ? "video/mp4" : "image/png");
  const disposition = download ? attachmentDisposition(fileName) : `inline; filename="${fileName}"`;
  const headers = { "cache-control": "private, no-store", "content-disposition": disposition };
  if (localPath) {
    try {
      const stat = await fs.stat(localPath);
      return sendMediaFile(req, res, localPath, { contentType: fallbackMime, stat, headers });
    } catch {
      // Use the durable public/R2 copy below when the local upload was cleaned up.
    }
  }
  if (!isPublicHttpUrl(remoteUrl)) return sendJson(res, 404, { ok: false, message: "Reference media is unavailable." });
  return proxyRemoteMedia(req, res, remoteUrl, { fallbackMime, headers });
}

async function handleAdminGenerationRecordMedia(req, res, taskId) {
  const mediaToken = new URL(req.url || "/", "http://localhost").searchParams.get("token") || "";
  const tokenPayload = mediaToken ? parseAdminGenerationMediaToken(mediaToken) : null;
  const decodedTaskId = decodeURIComponent(taskId);
  if (tokenPayload && tokenPayload.taskId !== decodedTaskId) {
    return sendJson(res, 403, { ok: false, message: "Media token does not match this generation record." });
  }
  if (!tokenPayload) {
    const auth = await requireAdmin(req, res, { loadDb: false });
    if (!auth) return;
  }
  const record = await getGenerationRecord(decodedTaskId);
  if (!record) return sendJson(res, 404, { ok: false, message: "Generation record not found." });
  const target = generationRecordDownloadTarget(record);
  if (!target) return sendJson(res, 404, { ok: false, message: "Generated media is unavailable." });
  const localPath = target.localPath || localDownloadPathFromRecord(record, !isImageGenerationRecord(record), target.url || "");
  const mime = target.mime || (isImageGenerationRecord(record) ? imageMimeFromKnownPath(target.url || localPath) || "image/png" : videoMimeFromKnownPath(target.url || localPath) || "video/mp4");
  const dispositionName = (target.fileName || path.basename(localPath || "generation")).replace(/[^a-z0-9._-]/gi, "-") || "generation";
  const headers = { "content-disposition": `inline; filename="${dispositionName}"` };
  if (localPath) {
    const normalizedPath = path.normalize(localPath);
    const relative = path.relative(ROOT, normalizedPath);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
      return sendJson(res, 403, { ok: false, message: "Generated media path is not allowed." });
    }
    try {
      const stat = await fs.stat(normalizedPath);
      return sendMediaFile(req, res, normalizedPath, { contentType: mime, stat, headers });
    } catch (error) {
      if (!isPublicHttpUrl(target.url || "")) {
        return sendJson(res, error.code === "ENOENT" ? 404 : 500, { ok: false, message: error.code === "ENOENT" ? "Generated media is missing." : "Generated media could not be opened." });
      }
    }
  }
  if (!isPublicHttpUrl(target.url || "")) return sendJson(res, 404, { ok: false, message: "Generated media is unavailable." });
  return proxyRemoteMedia(req, res, target.url, { fallbackMime: mime, headers });
}

function generationRecordMediaAssetIds(record = {}) {
  const params = record.params && typeof record.params === "object" ? record.params : {};
  const ids = [];
  const add = (value) => {
    const id = typeof value === "object"
      ? String(firstPresent(value?.userAssetId, value?.assetId, value?.id, "") || "").trim()
      : String(value || "").trim();
    if (id && !ids.includes(id)) ids.push(id);
  };
  (Array.isArray(record.mediaAssets) ? record.mediaAssets : []).forEach(add);
  add(record.resultAssetId);
  (Array.isArray(record.resultAssetIds) ? record.resultAssetIds : []).forEach(add);
  [
    params.firstFrameAssetId,
    params.first_frame_asset_id,
    params.lastFrameAssetId,
    params.last_frame_asset_id,
    ...(Array.isArray(params.referenceImageAssetIds) ? params.referenceImageAssetIds : []),
    ...(Array.isArray(params.reference_image_asset_ids) ? params.reference_image_asset_ids : []),
    ...(Array.isArray(params.referenceVideoAssetIds) ? params.referenceVideoAssetIds : []),
    ...(Array.isArray(params.reference_video_asset_ids) ? params.reference_video_asset_ids : []),
    ...(Array.isArray(params.referenceAudioAssetIds) ? params.referenceAudioAssetIds : []),
    ...(Array.isArray(params.reference_audio_asset_ids) ? params.reference_audio_asset_ids : []),
  ].forEach(add);
  return ids;
}

function generationRecordResultAssetMediaFields(asset = {}) {
  if (!asset || typeof asset !== "object") return {};
  const mime = String(asset.mime || "").toLowerCase();
  const kind = String(asset.kind || "").toLowerCase();
  const isVideo = kind === "video" || mime.startsWith("video/");
  const isImage = kind === "image" || mime.startsWith("image/");
  if (!isVideo && !isImage) return {};
  const localMediaUrl = String(asset.localUrl || asset.localImageUrl || asset.localVideoUrl || "").trim();
  const storedMediaUrl = String(asset.cdnUrl || asset.publicUrl || "").trim();
  const storageKey = String(asset.objectStorageKey || asset.storageKey || asset.r2Key || "").trim();
  if (isVideo) {
    const localPosterUrl = String(asset.localPosterUrl || "").trim();
    const storedPosterUrl = String(asset.posterUrl || asset.thumbnailUrl || asset.coverUrl || "").trim();
    const posterStorageKey = String(asset.posterStorageKey || asset.posterObjectStorageKey || asset.posterR2Key || "").trim();
    return {
      localVideoUrl: localMediaUrl,
      cdnVideoUrl: storedMediaUrl,
      videoUrl: storedMediaUrl || localMediaUrl,
      storageProvider: String(asset.storageProvider || "").trim(),
      storageKey,
      localPosterUrl,
      cdnPosterUrl: storedPosterUrl,
      posterUrl: storedPosterUrl || localPosterUrl,
      posterStorageProvider: String(asset.posterStorageProvider || "").trim(),
      posterStorageKey,
    };
  }
  return {
    localImageUrl: localMediaUrl,
    cdnImageUrl: storedMediaUrl,
    imageResultUrl: storedMediaUrl || localMediaUrl,
    storageProvider: String(asset.storageProvider || "").trim(),
    storageKey,
  };
}

function hydrateGenerationRecordResultAsset(record = {}, asset = null) {
  if (!record || typeof record !== "object" || !asset) return record;
  const fields = generationRecordResultAssetMediaFields(asset);
  const next = { ...record };
  Object.entries(fields).forEach(([key, value]) => {
    if (!String(value || "").trim() || String(next[key] || "").trim()) return;
    next[key] = value;
  });
  return next;
}

function hydratedGenerationRecordMediaAsset(item = {}, resolvedAsset = null) {
  if (!item || typeof item !== "object" || !resolvedAsset) return item;
  const publicAsset = publicUserAsset(resolvedAsset);
  const previewUrl = String(publicAsset.previewUrl || publicAsset.publicUrl || "").trim();
  const safePreviewUrl = previewUrl && !previewUrl.startsWith("asset://") ? previewUrl : "";
  const posterUrl = String(publicAsset.posterUrl || publicAsset.thumbnailUrl || publicAsset.coverUrl || "").trim();
  const safePosterUrl = posterUrl && !posterUrl.startsWith("asset://") ? posterUrl : "";
  const type = String(item.type || item.key || "").toLowerCase();
  const kind = String(publicAsset.kind || "").toLowerCase();
  const isVideo = type.includes("video") || kind === "video";
  const isAudio = type.includes("audio") || kind === "audio";
  const assetUri = String(item.assetUri || item.referenceAssetUri || publicAsset.assetUri || publicAsset.seedanceAssetUri || "").trim();
  if (!safePreviewUrl && !assetUri) return item;
  return {
    ...item,
    ...(safePreviewUrl ? {
      ...(isVideo ? { videoUrl: safePreviewUrl } : isAudio ? { audioUrl: safePreviewUrl } : { imageUrl: safePreviewUrl }),
      url: safePreviewUrl,
      publicUrl: safePreviewUrl,
      cdnUrl: safePreviewUrl,
      previewUrl: safePreviewUrl,
      ...(safePosterUrl ? {
        posterUrl: safePosterUrl,
        thumbnailUrl: safePosterUrl,
        coverUrl: safePosterUrl,
      } : {}),
    } : {}),
    ...(Array.isArray(publicAsset.assetUrls) && publicAsset.assetUrls.length ? { assetUrls: publicAsset.assetUrls } : {}),
    ...(assetUri ? { assetUri, referenceAssetUri: item.referenceAssetUri || assetUri } : {}),
  };
}

function hydrateGenerationRecordMediaAssetsWithMap(record = {}, assetsById = new Map()) {
  const ids = generationRecordMediaAssetIds(record);
  if (!record || !ids.length || !(assetsById instanceof Map)) return record;
  const mediaAssets = (Array.isArray(record.mediaAssets) ? record.mediaAssets : []).map((item) => {
    const assetId = typeof item === "object"
      ? String(firstPresent(item.userAssetId, item.assetId, item.id, "") || "").trim()
      : "";
    return hydratedGenerationRecordMediaAsset(item, assetsById.get(assetId));
  });
  return hydrateGenerationRecordResultAsset({ ...record, mediaAssets }, assetsById.get(String(record.resultAssetId || "").trim()));
}

function generationRecordResultAssetBackfillPatch(original = {}, hydrated = {}) {
  if (!String(hydrated?.resultAssetId || "").trim()) return {};
  const video = Boolean(String(hydrated.localVideoUrl || hydrated.cdnVideoUrl || "").trim());
  const fields = {
    ...(video ? {
      localVideoUrl: hydrated.localVideoUrl || "",
      cdnVideoUrl: hydrated.cdnVideoUrl || "",
      videoUrl: hydrated.videoUrl || hydrated.cdnVideoUrl || hydrated.localVideoUrl || "",
      localPosterUrl: hydrated.localPosterUrl || "",
      cdnPosterUrl: hydrated.cdnPosterUrl || "",
      posterUrl: hydrated.posterUrl || hydrated.cdnPosterUrl || hydrated.localPosterUrl || "",
      posterStorageProvider: hydrated.posterStorageProvider || "",
      posterStorageKey: hydrated.posterStorageKey || "",
    } : {
      localImageUrl: hydrated.localImageUrl || "",
      cdnImageUrl: hydrated.cdnImageUrl || "",
      imageResultUrl: hydrated.imageResultUrl || hydrated.cdnImageUrl || hydrated.localImageUrl || "",
    }),
    storageProvider: hydrated.storageProvider || "",
    storageKey: hydrated.storageKey || "",
  };
  return Object.fromEntries(Object.entries(fields).filter(([key, value]) => (
    String(value || "").trim() && !String(original?.[key] || "").trim()
  )));
}

async function persistGenerationRecordResultAssetMediaBackfill(original = {}, hydrated = {}) {
  const taskId = String(hydrated?.taskId || original?.taskId || "").trim();
  const patch = generationRecordResultAssetBackfillPatch(original, hydrated);
  if (!taskId || !Object.keys(patch).length || !dbEnabled()) return hydrated;
  const updated = await backfillGenerationRecordResultAssetMediaFieldsInDb(taskId, patch);
  return updated ? { ...hydrated, ...updated } : hydrated;
}

async function persistGenerationRecordResultAssetMediaBackfills(originals = [], hydratedRecords = []) {
  const originalByTaskId = new Map((Array.isArray(originals) ? originals : [originals])
    .map((record) => [String(record?.taskId || "").trim(), record])
    .filter(([taskId]) => taskId));
  return Promise.all((Array.isArray(hydratedRecords) ? hydratedRecords : [hydratedRecords]).map((record) => (
    persistGenerationRecordResultAssetMediaBackfill(originalByTaskId.get(String(record?.taskId || "").trim()) || record, record)
  )));
}

async function hydrateGenerationRecordMediaAssets(records = [], userId = "") {
  const list = (Array.isArray(records) ? records : [records]).filter(Boolean);
  if (!list.length) return Array.isArray(records) ? records : records;
  const ids = [...new Set(list.flatMap(generationRecordMediaAssetIds))].slice(0, 200);
  if (!ids.length) return Array.isArray(records) ? records : records;
  const assets = await getUserAssetsByIdsFromDb({ userId, assetIds: ids });
  const assetsById = new Map(assets.map((asset) => [String(asset.id || "").trim(), asset]).filter(([id]) => id));
  const hydrated = list.map((record) => hydrateGenerationRecordMediaAssetsWithMap(record, assetsById));
  return Array.isArray(records) ? hydrated : hydrated[0];
}

let resultAssetMediaBackfillRunning = false;

async function scanGenerationRecordResultAssetMediaBackfill(reason = "timer") {
  if (resultAssetMediaBackfillRunning || !dbEnabled()) return;
  resultAssetMediaBackfillRunning = true;
  try {
    const records = await getGenerationRecordsNeedingResultAssetMediaBackfillFromDb({ limit: 50 });
    let updated = 0;
    for (const record of records) {
      const asset = await getUserAssetFromDb(String(record.resultAssetId || "").trim());
      if (!asset || String(asset.userId || "") !== String(record.userId || "")) continue;
      const hydrated = hydrateGenerationRecordResultAsset(record, asset);
      const patch = generationRecordResultAssetBackfillPatch(record, hydrated);
      if (!Object.keys(patch).length) {
        await backfillGenerationRecordResultAssetMediaFieldsInDb(record.taskId, {
          resultAssetMediaBackfillCompletedAt: new Date().toISOString(),
        });
        continue;
      }
      const saved = await backfillGenerationRecordResultAssetMediaFieldsInDb(record.taskId, {
        ...patch,
        resultAssetMediaBackfillCompletedAt: new Date().toISOString(),
      });
      if (saved) updated += 1;
    }
    if (updated || records.length) console.log("[generation-result-asset-backfill]", reason, { scanned: records.length, updated });
  } catch (error) {
    console.warn("[generation-result-asset-backfill-scan-failed]", error.message || error);
  } finally {
    resultAssetMediaBackfillRunning = false;
  }
}

function startGenerationRecordResultAssetMediaBackfillScheduler() {
  setTimeout(() => scanGenerationRecordResultAssetMediaBackfill("startup"), 15000).unref?.();
  setInterval(() => scanGenerationRecordResultAssetMediaBackfill("timer"), 5 * 60 * 1000).unref?.();
}

async function handleListGenerationRecords(req, res, url) {
  const auth = await requireUser(req, res, { loadDb: false });
  if (!auth) return;
  const { page, limit, offset } = pagingFromUrl(url, { defaultLimit: 8, maxLimit: 50 });
  let allOwnRecords = [];
  let ownRecords = [];
  let totalPages = 1;
  let total = 0;
  if (dbEnabled()) {
    const result = await getUserGenerationRecordsPageFromDb({ userId: auth.user.id, page, limit });
    allOwnRecords = result?.records || [];
    ownRecords = allOwnRecords;
    total = Number(result?.total || 0);
    totalPages = Number(result?.totalPages || 1);
  } else {
    allOwnRecords = await listGenerationRecordsForUser(auth.user.id, Math.max(500, offset + limit));
    ownRecords = allOwnRecords.slice(offset, offset + limit);
    total = allOwnRecords.length;
    totalPages = Math.max(1, Math.ceil(total / limit));
  }

  const refreshRequested = generationListRefreshRequested(url);
  const refundable = ownRecords.filter((record) => needsApizFailureRefund(record) || needsSeedanceFailureRefund(record)).slice(0, 50);
  const statusRefreshable = refreshRequested
    ? ownRecords
      .filter((record) => !needsApizFailureRefund(record) && !needsSeedanceFailureRefund(record) && shouldRefreshGenerationRecordFromList(record))
      .slice(0, 8)
    : [];
  const refreshable = [...refundable, ...statusRefreshable];
  queueGenerationRecordStatusRefreshes(refreshable, { reason: "user-list" });
  ownRecords
    .filter((record) => generationRecordNeedsPosterMaintenance(record))
    .forEach((record) => queueGenerationRecordMediaMaintenance(record));

  if (undressToolRequestAllowed(req)) {
    const optimizedRecords = [];
    for (const record of ownRecords) {
      if (record.localVideoUrl) queueGenerationRecordMediaMaintenance(record);
      optimizedRecords.push(await ensureUndressLockedPreview(record));
    }
    optimizedRecords.forEach((record, index) => { ownRecords[index] = record; });
  }

  const hydratedRecords = await hydrateGenerationRecordMediaAssets(ownRecords, auth.user.id);
  const persistedRecords = await persistGenerationRecordResultAssetMediaBackfills(ownRecords, hydratedRecords);
  return sendJson(res, 200, {
    ok: true,
    records: persistedRecords.map((record) => publicGenerationRecord(record, generationRecordResponseOptionsForAuth(auth))),
    page,
    limit,
    total,
    totalPages,
    user: userView(auth.user),
  });
}

function vegaRecordMediaUrlValues(value = []) {
  const list = Array.isArray(value) ? value : [value];
  return list.flatMap((item) => {
    if (typeof item === "string") return [item];
    if (!item || typeof item !== "object") return [];
    return [
      item.url,
      item.imageUrl,
      item.image_url,
      item.videoUrl,
      item.video_url,
      item.audioUrl,
      item.audio_url,
      item.localUrl,
      item.publicUrl,
      item.cdnUrl,
      item.previewUrl,
      item.sourceUrl,
      item.Url,
      item.URL,
      item.image_url?.url,
      item.imageUrl?.url,
      item.video_url?.url,
      item.videoUrl?.url,
      item.audio_url?.url,
      item.audioUrl?.url,
    ];
  }).map((value) => String(value || "").trim()).filter(Boolean);
}

function vegaRecordAssetUriValues(value = []) {
  const list = Array.isArray(value) ? value : [value];
  return list.flatMap((item) => {
    if (typeof item === "string") return [item];
    if (!item || typeof item !== "object") return [];
    return [
      item.assetUri,
      item.referenceAssetUri,
      item.seedanceAssetUri,
      item.Url,
      item.URL,
      item.url,
      item.image_url?.url,
      item.imageUrl?.url,
      item.video_url?.url,
      item.videoUrl?.url,
      item.audio_url?.url,
      item.audioUrl?.url,
    ];
  }).map((value) => String(value || "").trim()).filter((value) => value.startsWith("asset://"));
}

function vegaRecordUpstreamMediaValues(record = {}) {
  const payload = record.upstreamPayload && typeof record.upstreamPayload === "object" ? record.upstreamPayload : {};
  return [
    ...(Array.isArray(payload.FileInfos) ? payload.FileInfos : []),
    ...(Array.isArray(payload.Content) ? payload.Content : []),
    ...(Array.isArray(payload.content) ? payload.content : []),
  ];
}

function vegaRecordMediaPublicUrl(item = {}) {
  if (typeof item === "string") return String(item || "").trim().startsWith("asset://") ? "" : String(item || "").trim();
  if (!item || typeof item !== "object") return "";
  return String(firstPresent(
    item.url,
    item.imageUrl,
    item.image_url,
    item.videoUrl,
    item.video_url,
    item.audioUrl,
    item.audio_url,
    item.localUrl,
    item.publicUrl,
    item.cdnUrl,
    item.previewUrl,
    item.sourceUrl,
    item.Url,
    item.URL,
    item.image_url?.url,
    item.imageUrl?.url,
    item.video_url?.url,
    item.videoUrl?.url,
    item.audio_url?.url,
    item.audioUrl?.url,
    "",
  ) || "").trim();
}

function vegaRecordMediaKind(item = {}, typeHint = "") {
  if (typeof item === "string") {
    return String(typeHint || "").toLowerCase().includes("video")
      ? "video"
      : String(typeHint || "").toLowerCase().includes("audio")
      ? "audio"
      : "image";
  }
  const hint = String(typeHint || item?.type || item?.Category || item?.category || item?.Usage || item?.usage || "").toLowerCase();
  if (hint.includes("video")) return "video";
  if (hint.includes("audio")) return "audio";
  if (hint.includes("image") || hint.includes("frame")) return "image";
  if (item?.videoUrl || item?.video_url) return "video";
  if (item?.audioUrl || item?.audio_url) return "audio";
  return "image";
}

function vegaRecordMediaType(item = {}, typeHint = "") {
  // Usage/role carries the frame semantics supplied by VOD while Category is
  // the media container (Image/Video/Audio). Inspect both: a generic list hint
  // such as "reference_image" must not turn an old video/audio FileInfo into
  // an image, and Category=Image must not erase Usage=FirstFrame.
  const hint = String([
    typeHint,
    item?.Usage,
    item?.usage,
    item?.role,
    item?.Role,
    item?.type,
    item?.Category,
    item?.category,
  ].filter(Boolean).join(" ")).toLowerCase();
  if (hint.includes("video") || hint.includes("clip")) return "reference_video";
  if (hint.includes("audio")) return "reference_audio";
  if (hint.includes("last") || hint.includes("end")) return "last_frame";
  if (hint.includes("first")) return "first_frame";
  return "reference_image";
}

function withVegaRecordMediaSource(item, sourceUrl, assetUri = "", typeHint = "") {
  if (typeof item === "string") {
    if (String(item).trim().startsWith("asset://")) {
      const uri = String(item).trim();
      const kind = vegaRecordMediaKind(item, typeHint);
      const source = sourceUrl || uri;
      return {
        url: source,
        ...(kind === "video" ? { videoUrl: source } : kind === "audio" ? { audioUrl: source } : { imageUrl: source }),
        assetUri: uri,
        referenceAssetUri: uri,
      };
    }
    return item;
  }
  if (!item || typeof item !== "object") return item;
  const uri = String(assetUri || item.assetUri || item.referenceAssetUri || "").trim() ||
    (String(vegaRecordMediaPublicUrl(item)).startsWith("asset://") ? String(vegaRecordMediaPublicUrl(item)).trim() : "");
  const kind = vegaRecordMediaKind(item, typeHint);
  if (!sourceUrl && !uri) return item;
  const typedKey = kind === "video" ? "videoUrl" : kind === "audio" ? "audioUrl" : "imageUrl";
  const typedUrl = String(item[typedKey] || "").trim();
  const shouldReplaceTyped = !typedUrl || typedUrl.startsWith("asset://");
  return {
    ...item,
    ...(sourceUrl ? { url: sourceUrl } : {}),
    ...(sourceUrl && shouldReplaceTyped ? { [typedKey]: sourceUrl } : {}),
    ...(uri ? { assetUri: uri, referenceAssetUri: item.referenceAssetUri || uri } : {}),
  };
}

async function hydrateVegaRecordMediaAssetIds(record = {}, userId = "") {
  if (!record || !isVegaProvider(record.provider || record.params?.provider)) return record;
  const mediaAssets = Array.isArray(record.mediaAssets) ? record.mediaAssets : [];
  const params = record.params && typeof record.params === "object" ? record.params : {};
  const upstreamItems = vegaRecordUpstreamMediaValues(record);
  const paramValues = [
    params.firstFrameUrl || params.first_frame_url,
    params.lastFrameUrl || params.last_frame_url,
    params.referenceImages || params.reference_images,
    params.referenceVideos || params.reference_videos,
    params.referenceAudios || params.reference_audios,
  ];
  const hasMissingAssetId = mediaAssets.some((asset) => !String(asset?.userAssetId || asset?.assetId || asset?.id || "").trim() && vegaRecordMediaUrlValues(asset).length);
  const hasOnlyUrlParams = !mediaAssets.length && paramValues.some((value) => vegaRecordMediaUrlValues(value).length);
  const assetUris = [...new Set([
    ...mediaAssets.flatMap((asset) => vegaRecordAssetUriValues(asset)),
    ...paramValues.flatMap((value) => vegaRecordAssetUriValues(value)),
    ...upstreamItems.flatMap((item) => vegaRecordAssetUriValues(item)),
    ...(Array.isArray(params.referenceImageAssetUris) ? params.referenceImageAssetUris : []),
    ...(Array.isArray(params.referenceVideoAssetUris) ? params.referenceVideoAssetUris : []),
    ...(Array.isArray(params.referenceAudioAssetUris) ? params.referenceAudioAssetUris : []),
    params.firstFrameAssetUri,
    params.lastFrameAssetUri,
  ].map((value) => String(value || "").trim()).filter((value) => value.startsWith("asset://")))];
  const urls = [
    ...mediaAssets.flatMap((asset) => vegaRecordMediaUrlValues(asset)),
    ...paramValues.flatMap((value) => vegaRecordMediaUrlValues(value)),
    ...upstreamItems.flatMap((item) => vegaRecordMediaUrlValues(item)),
  ].filter((url) => !url.startsWith("asset://"));
  if (!assetUris.length && !urls.length) return record;
  const [sourceUrlsByAssetUri, assetIdsByUrl] = await Promise.all([
    assetUris.length ? getVegaMediaLibrarySourceUrlsByAssetUrisFromDb({ userId, assetUris }) : Promise.resolve({}),
    urls.length ? getUserAssetIdsByUrlsFromDb({ userId, urls }) : Promise.resolve({}),
  ]);
  if (!Object.keys(sourceUrlsByAssetUri).length && !Object.keys(assetIdsByUrl).length && !assetUris.length && !hasMissingAssetId && !hasOnlyUrlParams) return record;

  const sourceFor = (item) => {
    const uri = vegaRecordAssetUriValues(item)[0] || "";
    const directUrl = vegaRecordMediaPublicUrl(item);
    return String(sourceUrlsByAssetUri[uri] || directUrl || "").trim();
  };
  const assetIdFor = (item) => {
    const direct = typeof item === "object" ? String(firstPresent(item?.userAssetId, item?.assetId, item?.id, "") || "").trim() : "";
    const url = vegaRecordMediaPublicUrl(item);
    return String(direct || assetIdsByUrl[url] || "").trim();
  };
  const hydrate = (item, typeHint = "") => {
    const uri = vegaRecordAssetUriValues(item)[0] || "";
    const sourceUrl = sourceFor(item);
    const next = withVegaRecordMediaSource(item, sourceUrl, uri, typeHint);
    const assetId = assetIdFor(item);
    return next && typeof next === "object" && assetId ? { ...next, userAssetId: assetId } : next;
  };

  // Older Vega records can have no mediaAssets at all: the only original input
  // evidence is upstreamPayload.FileInfos/Content. Rebuild those entries so the
  // detail/regenerate path receives the same typed, ordered media as new rows.
  const recoveredAssets = upstreamItems.map((item) => {
    const type = vegaRecordMediaType(item);
    const next = hydrate(item, type);
    if (!next || typeof next !== "object") return null;
    return { ...next, type: next.type || type };
  }).filter(Boolean);
  const combinedAssets = [...mediaAssets, ...recoveredAssets];
  // FileInfos and Content may describe the same input with different metadata
  // (one has userAssetId, the other only has asset://). Treat every identity
  // as a duplicate key instead of letting that split one asset into two.
  const seenAssetIds = new Set();
  const seenAssetUris = new Set();
  const seenAssetUrls = new Set();
  const nextAssets = combinedAssets.filter((asset) => {
    const assetId = String(firstPresent(asset?.userAssetId, asset?.assetId, asset?.id, "") || "").trim();
    const assetUri = vegaRecordAssetUriValues(asset)[0] || "";
    const sourceUrl = vegaRecordMediaPublicUrl(asset);
    if ((assetId && seenAssetIds.has(assetId))
      || (assetUri && seenAssetUris.has(assetUri))
      || (sourceUrl && seenAssetUrls.has(sourceUrl))) return false;
    if (assetId) seenAssetIds.add(assetId);
    if (assetUri) seenAssetUris.add(assetUri);
    if (sourceUrl) seenAssetUrls.add(sourceUrl);
    return true;
  }).map((asset) => hydrate(asset, asset?.type || asset?.Category || asset?.category || ""));
  const nextParams = { ...params };
  const hydrateFrame = (raw, frameKey, uriKey, typeHint) => {
    const value = raw || params[uriKey] || "";
    const source = sourceFor(value);
    const next = hydrate(value, typeHint);
    const uri = vegaRecordAssetUriValues(next)[0] || vegaRecordAssetUriValues(value)[0] || "";
    nextParams[frameKey] = source || (typeof next === "string" ? next : next?.url) || (typeof value === "string" ? value : "") || "";
    if (uri) nextParams[uriKey] = uri;
  };
  hydrateFrame(params.firstFrameUrl || params.first_frame_url, "firstFrameUrl", "firstFrameAssetUri", "first_frame");
  hydrateFrame(params.lastFrameUrl || params.last_frame_url, "lastFrameUrl", "lastFrameAssetUri", "last_frame");
  const hydrateList = (key, urlKey, uriKey, typeHint) => {
    // Legacy rows often store the display URL and the Pro media-library URI in
    // parallel arrays. Merge them positionally; an explicitly empty canonical
    // array must not hide either source.
    const lists = [params[key], params[urlKey], params[uriKey]].filter(Array.isArray);
    const length = Math.max(0, ...lists.map((list) => list.length));
    if (!length) return;
    nextParams[key] = Array.from({ length }, (_unused, index) => {
      const candidates = lists.map((list) => list[index]).filter((item) => item !== undefined && item !== null && item !== "");
      const object = candidates.find((item) => item && typeof item === "object" && !Array.isArray(item)) || {};
      const urlCandidate = candidates.find((item) => typeof item === "string" && !item.trim().startsWith("asset://"));
      const uriCandidate = candidates.find((item) => typeof item === "string" && item.trim().startsWith("asset://"));
      const assetUri = vegaRecordAssetUriValues(candidates)[0] || "";
      const merged = {
        ...object,
        ...(urlCandidate && !vegaRecordMediaPublicUrl(object) ? { url: urlCandidate } : {}),
        ...(assetUri && !vegaRecordAssetUriValues(object).length ? { assetUri, referenceAssetUri: assetUri } : {}),
      };
      const hydrated = hydrate(candidates.length === 1 ? candidates[0] : merged, typeHint);
      if (hydrated && typeof hydrated === "object") {
        return { ...hydrated, type: hydrated.type || vegaRecordMediaType(merged, typeHint) };
      }
      return hydrated;
    }).filter(Boolean);
    const uris = nextParams[key].map((item) => vegaRecordAssetUriValues(item)[0] || "").filter(Boolean);
    if (uris.length) nextParams[uriKey] = uris;
  };
  hydrateList("referenceImages", "reference_image_urls", "referenceImageAssetUris", "reference_image");
  hydrateList("referenceVideos", "reference_video_urls", "referenceVideoAssetUris", "reference_video");
  hydrateList("referenceAudios", "reference_audio_urls", "referenceAudioAssetUris", "reference_audio");
  const sourceForAssetType = (type) => nextAssets.find((asset) => vegaRecordMediaType(asset) === type);
  const deriveFrame = (frameKey, uriKey, type) => {
    const asset = sourceForAssetType(type);
    if (!asset) return;
    const source = sourceFor(asset) || vegaRecordMediaPublicUrl(asset);
    const uri = vegaRecordAssetUriValues(asset)[0] || "";
    if (!nextParams[frameKey] && source) nextParams[frameKey] = source;
    if (!nextParams[uriKey] && uri) nextParams[uriKey] = uri;
  };
  deriveFrame("firstFrameUrl", "firstFrameAssetUri", "first_frame");
  deriveFrame("lastFrameUrl", "lastFrameAssetUri", "last_frame");
  const deriveList = (key, uriKey, type) => {
    if (Array.isArray(nextParams[key]) && nextParams[key].length) return;
    const assets = nextAssets.filter((asset) => vegaRecordMediaType(asset) === type);
    if (assets.length) nextParams[key] = assets;
    const uris = assets.map((asset) => vegaRecordAssetUriValues(asset)[0] || "").filter(Boolean);
    if (!Array.isArray(nextParams[uriKey]) || !nextParams[uriKey].length) {
      if (uris.length) nextParams[uriKey] = uris;
    }
  };
  deriveList("referenceImages", "referenceImageAssetUris", "reference_image");
  deriveList("referenceVideos", "referenceVideoAssetUris", "reference_video");
  deriveList("referenceAudios", "referenceAudioAssetUris", "reference_audio");
  const idsByType = (type) => nextAssets.filter((asset) => asset?.type === type && asset.userAssetId).map((asset) => asset.userAssetId);
  const firstFrameAssetId = idsByType("first_frame")[0] || params.firstFrameAssetId || params.first_frame_asset_id || "";
  const lastFrameAssetId = idsByType("last_frame")[0] || params.lastFrameAssetId || params.last_frame_asset_id || "";
  const referenceImageAssetIds = idsByType("reference_image");
  const referenceVideoAssetIds = idsByType("reference_video");
  const referenceAudioAssetIds = idsByType("reference_audio");
  if (firstFrameAssetId) nextParams.firstFrameAssetId = firstFrameAssetId;
  if (lastFrameAssetId) nextParams.lastFrameAssetId = lastFrameAssetId;
  if (referenceImageAssetIds.length) nextParams.referenceImageAssetIds = referenceImageAssetIds;
  if (referenceVideoAssetIds.length) nextParams.referenceVideoAssetIds = referenceVideoAssetIds;
  if (referenceAudioAssetIds.length) nextParams.referenceAudioAssetIds = referenceAudioAssetIds;
  return { ...record, mediaAssets: nextAssets, params: nextParams };
}

async function handleGetGenerationRecord(req, res, taskId) {
  // Detail polling only needs the session/user row and the requested record.
  // Loading every application table here makes a single slow refresh block
  // behind unrelated wallet/assets/history queries and can hit the proxy 524.
  const auth = await requireUser(req, res, { loadDb: false });
  if (!auth) return;
  const record = await getGenerationRecord(taskId);
  if (!record || record.userId !== auth.user.id || !isUserVisibleGenerationRecord(record)) {
    return sendJson(res, 404, { ok: false, message: "Generation record not found." });
  }

  let nextRecord = await hydrateVegaRecordMediaAssetIds(record, auth.user.id);
  const recordBeforeResultAssetHydration = nextRecord;
  nextRecord = await hydrateGenerationRecordMediaAssets(nextRecord, auth.user.id);
  nextRecord = await persistGenerationRecordResultAssetMediaBackfill(recordBeforeResultAssetHydration, nextRecord);
  if (isStalePreSubmitGenerationRecord(nextRecord)) {
    nextRecord = await failStalePreSubmitGenerationRecord(nextRecord, "detail-stale-submit");
  } else if (needsApizFailureRefund(nextRecord)) {
    nextRecord = await settleApizGenerationRecord(nextRecord, { status: record.status || "failed", error: record.error || "" }, "detail");
  } else if (needsSeedanceFailureRefund(nextRecord)) {
    nextRecord = await settleSeedanceGenerationRecord(nextRecord, "detail");
  } else if (nextRecord.provider === "apiz" && (APIZ_API_KEY || nextRecord.upstreamSource === "gateway") && shouldRefreshGenerationRecord(nextRecord)) {
    // Status/media refresh runs in the bounded background queue. Never make a
    // browser detail request wait for an upstream download or R2 upload.
    queueGenerationRecordStatusRefresh(nextRecord, { priority: true, reason: "detail" });
  } else if (nextRecord.provider === "seedance25" && SEEDANCE25_API_KEY && shouldRefreshGenerationRecord(nextRecord)) {
    queueGenerationRecordStatusRefresh(nextRecord, { priority: true, reason: "detail" });
  } else if (nextRecord.upstreamSource === "tencent-vod" && shouldRefreshGenerationRecord(nextRecord)) {
    queueGenerationRecordStatusRefresh(nextRecord, { priority: true, reason: "detail" });
  } else if (nextRecord.upstreamSource === "gateway" && shouldRefreshGenerationRecord(nextRecord)) {
    queueGenerationRecordStatusRefresh(nextRecord, { priority: true, reason: "detail" });
  } else if (nextRecord.upstreamSource === "ignex" && shouldRefreshGenerationRecord(nextRecord)) {
    queueGenerationRecordStatusRefresh(nextRecord, { priority: true, reason: "detail" });
  } else if (["aliyun-wan30", "aliyun-wan27", "aliyun-happyhorse"].includes(nextRecord.provider) && (nextRecord.provider === "aliyun-wan30" ? ALIYUN_WAN30_API_KEY : ALIYUN_DASHSCOPE_API_KEY) && shouldRefreshGenerationRecord(nextRecord)) {
    // Do not make a browser detail poll wait on the upstream request. The
    // status queue performs the query and schedules media download/R2 upload;
    // the current record is safe to return immediately (R2-gated below).
    queueGenerationRecordStatusRefresh(nextRecord, { priority: true, reason: "detail" });
  } else if (nextRecord.provider === "aliyun-wan27-image" && ALIYUN_DASHSCOPE_API_KEY && shouldRefreshGenerationRecord(nextRecord)) {
    queueGenerationRecordStatusRefresh(nextRecord, { priority: true, reason: "detail" });
  } else if (ARK_API_KEY && shouldRefreshGenerationRecord(nextRecord) && !String(taskId).startsWith("demo-")) {
    queueGenerationRecordStatusRefresh(nextRecord, { priority: true, reason: "detail" });
  }

  if (generationRecordNeedsPosterMaintenance(nextRecord)) {
    queueGenerationRecordMediaMaintenance(nextRecord);
  }
  if (
    generatedOutputStorageEnabled()
    && !generationRecordIsApiTask(nextRecord)
    && generationRecordR2PublicationPending(nextRecord)
  ) {
    const remoteVideo = generationRecordProviderVideoUrl(nextRecord);
    if (remoteVideo) queueGeneratedVideoDownload(nextRecord.taskId, remoteVideo, "detail-r2-mirror");
    else queueGenerationRecordMediaMaintenance(nextRecord);
  }

  if (undressToolRequestAllowed(req)) {
    if (nextRecord.localVideoUrl) queueGenerationRecordMediaMaintenance(nextRecord);
    nextRecord = await ensureUndressLockedPreview(nextRecord);
  }

  return sendJson(res, 200, {
    ok: true,
    record: publicGenerationRecord(nextRecord, generationRecordResponseOptionsForAuth(auth)),
    user: userView(auth.user),
  });
}

function attachmentDisposition(fileName = "generation.mp4") {
  const safeName = String(fileName || "generation.mp4").replace(/[^a-z0-9._-]/gi, "-") || "generation.mp4";
  return `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

function localDownloadPathFromRecord(record = {}, isVideo = true, url = "") {
  const candidates = isVideo
    ? [record.localVideoPath, localAssetPathFromPublicValue(record.localVideoUrl || record.videoUrl || url)]
    : [record.localImagePath, localAssetPathFromPublicValue(record.localImageUrl || record.imageResultUrl || url)];
  for (const candidate of candidates) {
    const text = String(candidate || "").trim();
    if (!text) continue;
    const filePath = safePathWithin(ASSETS_ROOT, path.isAbsolute(text) ? text : path.join(ROOT, text.replace(/^\/+/, "")));
    if (!filePath) continue;
    return filePath;
  }
  return "";
}

function generationRecordDownloadTarget(record = {}, { r2Only = false } = {}) {
  const cdnVideoUrl = String(record.cdnVideoUrl || "").trim();
  const cdnImageUrls = [...new Set([
    ...(Array.isArray(record.cdnImageUrls) ? record.cdnImageUrls : []),
    record.cdnImageUrl,
  ].map((item) => String(item || "").trim()).filter(Boolean))];
  const cdnImageStorageKeys = generationRecordImageStorageKeys(record);
  const cdnImageUrl = cdnImageUrls[0] || "";
  const videoUrl = r2Only ? cdnVideoUrl : generationRecordVideoUrl(record, { preferProviderVideoUrl: true });
  if (videoUrl) {
    const mime = videoMimeFromKnownPath(videoUrl) || "video/mp4";
    const ext = videoExtFromMime(mime, videoUrl);
    return {
      url: videoUrl,
      localPath: r2Only ? "" : localDownloadPathFromRecord(record, true, videoUrl),
      objectStorageUrl: cdnVideoUrl,
      storageProvider: record.storageProvider || "",
      storageKey: record.storageKey || "",
      mime,
      fileName: `${storagePathSegment(record.taskId || "generation", "generation")}${ext}`,
    };
  }
  const imageUrl = r2Only ? cdnImageUrl : (generationRecordProviderImageUrl(record) || generationRecordImageUrl(record));
  if (imageUrl) {
    const mime = imageMimeFromKnownPath(imageUrl) || "image/png";
    const ext = imageExtFromMime(mime);
    const imageIndex = cdnImageUrls.indexOf(imageUrl);
    return {
      url: imageUrl,
      localPath: r2Only ? "" : localDownloadPathFromRecord(record, false, imageUrl),
      objectStorageUrl: cdnImageUrl,
      storageProvider: record.storageProvider || record.imageStorageProvider || "",
      storageKey: imageIndex >= 0 ? (cdnImageStorageKeys[imageIndex] || "") : (record.storageKey || record.imageStorageKey || ""),
      mime,
      fileName: `${storagePathSegment(record.taskId || "generation", "generation")}${ext}`,
    };
  }
  return null;
}

function generationRecordProviderDownloadTarget(record = {}) {
  if (record.resultLocked === true) return null;
  const providerVideoUrl = generationRecordProviderVideoUrl(record);
  if (providerVideoUrl) {
    const mime = videoMimeFromKnownPath(providerVideoUrl) || "video/mp4";
    const ext = videoExtFromMime(mime, providerVideoUrl);
    return {
      kind: "video",
      url: providerVideoUrl,
      mime,
      fileName: `${storagePathSegment(record.taskId || "generation", "generation")}${ext}`,
    };
  }
  const providerImageUrls = [...new Set([
    ...(Array.isArray(record.remoteImageUrls) ? record.remoteImageUrls : []),
    ...(Array.isArray(record.providerImageUrls) ? record.providerImageUrls : []),
    ...collectOutputImageUrls(record.queryResponse),
    ...collectOutputImageUrls(record.createResponse),
    record.remoteImageUrl,
    record.providerImageUrl,
    record.upstreamImageUrl,
  ].map((item) => String(item || "").trim()).filter((item) => isPublicHttpUrl(item) && isGenerationImageOutputUrl(item)))];
  const providerImageUrl = providerImageUrls[0] || generationRecordProviderImageUrl(record);
  if (!providerImageUrl) return null;
  if (!isSucceededStatus(record.status) && !providerVideoUrl) return null;
  const mime = imageMimeFromKnownPath(providerImageUrl) || "image/png";
  const ext = imageExtFromMime(mime);
  return {
    kind: "image",
    url: providerImageUrl,
    urls: providerImageUrls.length ? providerImageUrls : [providerImageUrl],
    mime,
    fileName: `${storagePathSegment(record.taskId || "generation", "generation")}${ext}`,
  };
}

function generationRecordProviderImageUrls(record = {}) {
  return [...new Set([
    ...(Array.isArray(record.remoteImageUrls) ? record.remoteImageUrls : []),
    ...(Array.isArray(record.providerImageUrls) ? record.providerImageUrls : []),
    ...collectOutputImageUrls(record.queryResponse),
    ...collectOutputImageUrls(record.createResponse),
    record.remoteImageUrl,
    record.providerImageUrl,
    record.upstreamImageUrl,
  ].map((item) => String(item || "").trim()).filter((item) => isPublicHttpUrl(item) && isGenerationImageOutputUrl(item)))];
}

const advancedDownloadPreparationQueued = new Set();

function isRetryableMediaIngestError(error = {}) {
  if (error?.retryable === false) return false;
  if (error?.retryable === true) return true;
  const message = String(error?.message || error || "");
  const status = Number(error?.statusCode || error?.status || 0);
  if (status === 408 || status === 425 || status === 429 || status >= 500) return true;
  if (/\b(408|425|429|50[0234])\b/.test(message)) return true;
  if (/abort|timeout|timed out|network|socket|ECONN|ETIMEDOUT/i.test(message)) return true;
  // Signed provider media URLs are commonly permanent 403/404 after expiry.
  // Retrying those five times only delays the queue and cannot recover them.
  if (/\b(400|401|403|404|410)\b/.test(message)) return false;
  return false;
}

function advancedDownloadFailureMessage(error = {}) {
  const message = String(error?.message || error || "").trim();
  if (!message) return "Advanced download preparation failed.";
  if (/abort|timeout/i.test(message)) return "Source media download timed out. Please retry download2.";
  return message.slice(0, 500);
}

function queueGenerationRecordAdvancedDownload(record = {}, { retryFailed = false } = {}) {
  const taskId = String(record?.taskId || "").trim();
  if (
    !taskId
    || !dbEnabled()
    || !generatedOutputStorageEnabled()
    || !isSucceededStatus(record?.status)
    || (!retryFailed && String(record?.advancedDownloadStatus || "").toLowerCase() === "failed")
    || !generationRecordProviderDownloadTarget(record)?.url
    || generationRecordHasR2Download(record)
    || advancedDownloadPreparationQueued.has(taskId)
  ) return false;
  advancedDownloadPreparationQueued.add(taskId);
  setImmediate(() => Promise.resolve().then(async () => {
    try {
      await enqueueMediaIngestJobInDb(taskId, {
        userId: record.userId || "",
        kind: "advanced_download",
        sourceUrl: generationRecordProviderDownloadTarget(record)?.url || "",
      });
      await updateGenerationRecordAdvancedDownloadInDb(taskId, {
        advancedDownloadStatus: "preparing",
        advancedDownloadError: "",
      });
      void scanMediaIngestQueue();
    } catch (error) {
      console.warn("[advanced-download-enqueue-failed]", taskId, error?.message || error);
    } finally {
      advancedDownloadPreparationQueued.delete(taskId);
    }
  }));
  return true;
}

const MEDIA_INGEST_CONCURRENCY = Math.max(1, Math.min(8, Number(process.env.MEDIA_INGEST_CONCURRENCY || 3) || 3));
const mediaIngestRunning = new Set();
let mediaIngestScanRunning = false;

async function scanMediaIngestQueue() {
  if (mediaIngestScanRunning || !dbEnabled()) return;
  mediaIngestScanRunning = true;
  try {
    const slots = MEDIA_INGEST_CONCURRENCY - mediaIngestRunning.size;
    if (slots <= 0) return;
    // Claim only as many rows as we can start immediately. Claiming a batch
    // would leave unclaimed-but-processing rows stuck until stale recovery.
    // Older releases could leave rows at attempts >= 5 in "queued" or stale
    // "processing"; they are not claimable and otherwise inflate the backlog.
    await expireExhaustedMediaIngestJobsInDb(5, { staleMinutes: 20 });
    await syncFailedMediaIngestRecordStatusesInDb(200);
    const jobs = await claimNextMediaIngestJobsInDb(slots, { staleMinutes: 20 });
    for (const job of jobs) {
      const id = String(job.task_id || "").trim();
      if (!id || mediaIngestRunning.has(id)) continue;
      mediaIngestRunning.add(id);
      void runClaimedMediaIngestJob(job).finally(() => {
        mediaIngestRunning.delete(id);
        // Completion is the only event that can free a slot. Do not spin when
        // the queue is empty; enqueue and the 15s safety scan provide wakeups.
        void scanMediaIngestQueue();
      });
    }
  } catch (error) {
    console.warn("[media-ingest-worker-failed]", error?.message || error);
  } finally {
    mediaIngestScanRunning = false;
  }
}

async function runClaimedMediaIngestJob(job = {}) {
  const id = String(job.task_id || "").trim();
  if (!id) return null;
  try {
    const record = await getGenerationRecord(id);
    if (!record) throw new Error("Generation record not found for media ingest.");
    const prepared = await prepareGenerationRecordAdvancedDownload(record);
    const target = generationRecordDownloadTarget(prepared, { r2Only: true });
    if (!target?.url) {
      const error = new Error("The source media is no longer available for transfer.");
      error.code = "ADVANCED_DOWNLOAD_SOURCE_UNAVAILABLE";
      throw error;
    }
    await completeMediaIngestJobInDb(id, {
      storageProvider: target.storageProvider || objectStorageProvider(),
      storageKey: target.storageKey || "",
      cdnUrl: target.objectStorageUrl || target.url || "",
      bytes: Number(prepared.videoBytes || 0) + Number(prepared.posterBytes || 0) + Number(prepared.imageBytes || 0),
    });
    return prepared;
  } catch (error) {
    const failed = await failMediaIngestJobInDb(id, advancedDownloadFailureMessage(error), {
      retryAfterSeconds: Math.min(15 * 60, 30 * Math.max(1, Number(job.attempts) || 1)),
      maxAttempts: 5,
      retryable: isRetryableMediaIngestError(error),
    }).catch(() => null);
    if (failed?.status === "failed") {
      await updateGenerationRecordAdvancedDownloadInDb(id, {
        advancedDownloadStatus: "failed",
        advancedDownloadError: advancedDownloadFailureMessage(error),
      }).catch(() => {});
    }
    console.warn("[advanced-download-preparation-failed]", id, error?.message || error);
    return null;
  }
}

async function prepareGenerationRecordAdvancedDownload(record = {}) {
  if (!objectStorageEnabled() || !isSucceededStatus(record.status)) return record;
  const providerTarget = generationRecordProviderDownloadTarget(record);
  if (!providerTarget?.url) return record;
  if (generationRecordHasR2Download(record)) return record;

  const existing = await getGenerationRecord(record.taskId);
  if (!existing) return record;
  if (generationRecordHasR2Download(existing)) return existing;

  if (providerTarget.kind === "video") {
    // downloadGeneratedVideo owns a temporary workspace and removes it before
    // returning. Only the OSS object is durable.
    const media = await downloadGeneratedVideo(existing.taskId, providerTarget.url, { forceLocal: true });
    if (!media.cdnVideoUrl || !media.storageKey) {
      const error = new Error(media.cdnError || "Object storage upload failed.");
      error.statusCode = 502;
      error.retryable = true;
      error.code = "OBJECT_STORAGE_UPLOAD_FAILED";
      await updateGenerationRecordAdvancedDownloadInDb(existing.taskId, {
        cdnError: media.cdnError || error.message,
        advancedDownloadStatus: "preparing",
        advancedDownloadError: error.message,
      }).catch(() => {});
      throw error;
    }
    const updated = await updateGenerationRecordAdvancedDownloadInDb(existing.taskId, {
      localVideoUrl: "",
      localVideoPath: "",
      localPosterUrl: "",
      localPosterPath: "",
      playbackOptimizedAt: media.playbackOptimizedAt || existing.playbackOptimizedAt || new Date().toISOString(),
      cdnVideoUrl: media.cdnVideoUrl,
      cdnPosterUrl: media.cdnPosterUrl || "",
      storageProvider: media.storageProvider || objectStorageProvider(),
      storageKey: media.storageKey,
      posterStorageProvider: media.posterStorageProvider || media.storageProvider || objectStorageProvider(),
      posterStorageKey: media.posterStorageKey || "",
      cdnError: "",
      advancedDownloadPreparedAt: new Date().toISOString(),
      advancedDownloadStatus: "ready",
      advancedDownloadError: "",
    });
    return {
      ...updated,
      videoBytes: Number(media.videoBytes || 0),
      posterBytes: Number(media.posterBytes || 0),
    };
  }

  const imageUrls = generationRecordProviderImageUrls(existing);
  const sources = imageUrls.length ? imageUrls : [providerTarget.url];
  const savedImages = [];
  const uploads = [];
  const uploadedBytes = [];
  const errors = [];
  for (let index = 0; index < sources.length; index += 1) {
    const sourceUrl = sources[index];
    try {
      const downloaded = await downloadRemoteFileToBuffer(sourceUrl, { label: "advanced download image", maxBytes: 30 * 1024 * 1024 });
      const mime = String(downloaded.mime || "").startsWith("image/") ? downloaded.mime : providerTarget.mime;
      const imageTaskId = index === 0 ? existing.taskId : `${existing.taskId}-${index + 1}`;
      const fileName = imageFileName(imageTaskId, mime);
      const upload = await uploadStaticAssetToObjectStorage({
        key: objectStoragePath("generated", "images", fileName),
        bytes: downloaded.bytes,
        mime,
      });
      await verifyObjectStorageMedia(upload, { expectedBytes: downloaded.bytes.length, label: "Generated image" });
      uploads.push(upload);
      uploadedBytes.push(downloaded.bytes.length);
      await updateGenerationRecordAdvancedDownloadInDb(existing.taskId, {
        localImageUrl: "",
        localImagePath: "",
        imageResultUrl: uploads[0]?.publicUrl || "",
        cdnImageUrl: uploads[0]?.publicUrl || "",
        cdnImageUrls: uploads.map((item) => item.publicUrl).filter(Boolean),
        cdnImageStorageKeys: uploads.map((item) => item.key || objectStorageKeyFromPublicUrl(item.publicUrl || "", item.provider || objectStorageProvider()).key || ""),
        storageProvider: uploads[0]?.provider || objectStorageProvider(),
        storageKey: uploads[0]?.key || objectStorageKeyFromPublicUrl(uploads[0]?.publicUrl || "", uploads[0]?.provider || objectStorageProvider()).key || "",
        cdnError: errors.join("; "),
        advancedDownloadStatus: "preparing",
        advancedDownloadError: errors.join("; "),
      });
    } catch (error) {
      errors.push(`Image ${index + 1}: ${error.message || error}`);
    }
  }
  const updated = await updateGenerationRecordAdvancedDownloadInDb(existing.taskId, {
    localImageUrl: "",
    localImagePath: "",
    imageResultUrl: uploads[0]?.publicUrl || "",
    cdnImageUrl: uploads[0]?.publicUrl || "",
    cdnImageUrls: uploads.map((item) => item.publicUrl).filter(Boolean),
    cdnImageStorageKeys: uploads.map((item) => item.key || objectStorageKeyFromPublicUrl(item.publicUrl || "", item.provider || objectStorageProvider()).key || ""),
    storageProvider: uploads[0]?.provider || objectStorageProvider(),
    storageKey: uploads[0]?.key || objectStorageKeyFromPublicUrl(uploads[0]?.publicUrl || "", uploads[0]?.provider || objectStorageProvider()).key || "",
    cdnError: errors.join("; "),
    advancedDownloadPreparedAt: new Date().toISOString(),
    advancedDownloadStatus: errors.length ? "preparing" : "ready",
    advancedDownloadError: errors.join("; "),
  });
  if (errors.length) {
    const error = new Error(errors.join("; "));
    error.code = "OBJECT_STORAGE_UPLOAD_FAILED";
    throw error;
  }
  return {
    ...updated,
    imageBytes: uploadedBytes.reduce((total, bytes) => total + Number(bytes || 0), 0),
  };
}

function generationImageResultUrl(record = {}, savedImage = null) {
  return [
    savedImage?.cdnImageUrl,
    generationRecordProviderImageUrl(record),
    record.remoteImageUrl,
    record.providerImageUrl,
    record.upstreamImageUrl,
    savedImage?.localImageUrl,
    record.localImageUrl,
    record.imageResultUrl,
  ].map((value) => String(value || "").trim()).find(isGenerationImageOutputUrl) || "";
}

function generationRecordHasR2Download(record = {}) {
  const providerTarget = generationRecordProviderDownloadTarget(record);
  if (providerTarget?.kind === "video") {
    return Boolean(String(record.cdnVideoUrl || "").trim() && String(record.storageKey || "").trim());
  }
  if (providerTarget?.kind === "image") {
    const expected = generationRecordProviderImageUrls(record);
    const stored = [...new Set([
      ...(Array.isArray(record.cdnImageUrls) ? record.cdnImageUrls : []),
      record.cdnImageUrl,
    ].map((item) => String(item || "").trim()).filter(Boolean))];
    return expected.length > 0 && stored.length >= expected.length && generationRecordImageStorageReady(record);
  }
  return Boolean(generationRecordDownloadTarget(record, { r2Only: true })?.url);
}

function awsQueryEncode(value = "") {
  return encodeURIComponent(String(value)).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function awsCanonicalQuery(params = []) {
  return params
    .map(([key, value]) => [awsQueryEncode(key), awsQueryEncode(value)])
    // AWS canonical query ordering is bytewise ASCII, not locale-sensitive.
    .sort((left, right) => {
      if (left[0] === right[0]) return left[1] < right[1] ? -1 : left[1] > right[1] ? 1 : 0;
      return left[0] < right[0] ? -1 : 1;
    })
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

function objectStorageKeyFromPublicUrl(value = "", provider = "") {
  const text = String(value || "").trim();
  if (!text) return { provider: "", key: "" };
  try {
    const parsed = new URL(text, configuredPublicBaseUrl() || "https://123vips.com");
    const hostname = parsed.hostname.toLowerCase();
    const bucket = String(OSS.bucket || "").trim().toLowerCase();
    const ossRegion = String(OSS.region || "").trim().toLowerCase();
    const ossOriginSuffix = ossRegion
      ? `${ossRegion.startsWith("oss-") ? ossRegion : `oss-${ossRegion}`}.aliyuncs.com`.toLowerCase()
      : "";
    let key = "";
    if (bucket && ossOriginSuffix && hostname === `${bucket}.${ossOriginSuffix}`) {
      key = parsed.pathname.replace(/^\/+/, "");
    } else if (bucket && ossOriginSuffix && hostname === ossOriginSuffix && parsed.pathname.toLowerCase().startsWith(`/${bucket}/`)) {
      key = parsed.pathname.slice(bucket.length + 2);
    }
    if (key) return { provider: "oss", key: decodeURIComponent(key) };

    const publicBaseUrl = provider === "oss"
      ? String(OSS.cdnBaseUrl || "")
      : provider === "r2"
        ? String(R2.publicDomain || "")
        : "";
    if (publicBaseUrl) {
      const publicBase = new URL(publicBaseUrl.replace(/\/+$/, ""));
      const basePath = publicBase.pathname.replace(/\/+$/, "");
      if (parsed.host === publicBase.host && (!basePath || parsed.pathname.startsWith(`${basePath}/`))) {
        return {
          provider,
          key: decodeURIComponent(parsed.pathname.slice(basePath.length).replace(/^\/+/, "")),
        };
      }
    }
    // Backward compatibility: historical lookups did not always pass a
    // provider. Recognize both configured public domains in that case.
    if (!provider) {
      for (const [candidate, configuredBase] of [["oss", OSS.cdnBaseUrl], ["r2", R2.publicDomain]]) {
        if (!configuredBase) continue;
        const base = new URL(String(configuredBase).replace(/\/+$/, ""));
        const basePath = base.pathname.replace(/\/+$/, "");
        if (parsed.host === base.host && (!basePath || parsed.pathname.startsWith(`${basePath}/`))) {
          return { provider: candidate, key: decodeURIComponent(parsed.pathname.slice(basePath.length).replace(/^\/+/, "")) };
        }
      }
    }
    const siteBase = configuredPublicBaseUrl();
    if (siteBase) {
      const site = new URL(siteBase);
      if (parsed.host === site.host && parsed.pathname.startsWith("/assets/")) {
        return { provider: "r2", key: decodeURIComponent(parsed.pathname.replace(/^\/+/, "")) };
      }
    }
  } catch {
    // Handle relative /assets paths below.
  }
  if (text.startsWith("/assets/")) return { provider: "r2", key: text.replace(/^\/+/, "") };
  return { provider: "", key: "" };
}

function r2KeyFromPublicDownloadUrl(value = "") {
  const match = objectStorageKeyFromPublicUrl(value, "r2");
  return match.provider === "r2" ? match.key : "";
}

function inferObjectStorageProviderFromUrl(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";
  const match = objectStorageKeyFromPublicUrl(text);
  if (match.provider) return match.provider;
  if (publicUrlMatchesStorageBase(text, OSS.cdnBaseUrl)) return "oss";
  if (publicUrlMatchesStorageBase(text, R2.publicDomain)) return "r2";
  return "";
}

function objectStorageDownloadKey(target = {}) {
  const declaredProvider = String(target.storageProvider || "").trim().toLowerCase();
  const urlProvider = inferObjectStorageProviderFromUrl(target.objectStorageUrl);
  const provider = declaredProvider || urlProvider || objectStorageProvider();
  const declaredKey = String(target.storageKey || "").trim();
  if (declaredKey) return { provider, key: declaredKey };
  const fromUrl = objectStorageKeyFromPublicUrl(target.objectStorageUrl, provider);
  return fromUrl.provider ? fromUrl : { provider: "", key: "" };
}

function makeR2PresignedDownloadUrl({ key, fileName, contentType = "application/octet-stream", expiresSeconds = 600 }) {
  if (!r2Enabled() || !key) return "";
  const endpoint = r2EndpointUrl();
  const { xDate, date } = amzDate();
  const canonicalUri = `/${encodeURIComponent(R2.bucket)}/${encodePathname(key)}`;
  const scope = `${date}/${R2.region || "auto"}/s3/aws4_request`;
  const signedHeaders = "host";
  const queryParams = [
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", `${R2.accessKey}/${scope}`],
    ["X-Amz-Date", xDate],
    ["X-Amz-Expires", String(Math.max(60, Math.min(3600, Number(expiresSeconds) || 600)))],
    ["X-Amz-SignedHeaders", signedHeaders],
    ["response-content-disposition", attachmentDisposition(fileName)],
    ["response-content-type", contentType || "application/octet-stream"],
  ];
  const canonicalQuery = awsCanonicalQuery(queryParams);
  const canonicalHeaders = `host:${endpoint.host}\n`;
  const canonicalRequest = ["GET", canonicalUri, canonicalQuery, canonicalHeaders, signedHeaders, "UNSIGNED-PAYLOAD"].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", xDate, scope, sha256Hex(canonicalRequest)].join("\n");
  const signature = hmac(signAwsKey(R2.secretKey, date, R2.region || "auto", "s3"), stringToSign, "hex");
  return `${endpoint.protocol}//${endpoint.host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

function generationRecordDownloadUrlPayload(target = {}, fallbackUrl = "") {
  const storage = objectStorageDownloadKey(target);
  // New media is stored in OSS. R2 signing is retained only for historical
  // media.123vips.com records that have not yet been migrated.
  const signedUrl = storage.provider === "r2" && storage.key
    ? makeR2PresignedDownloadUrl({
      key: storage.key,
      fileName: target.fileName,
      contentType: target.mime,
    })
    : storage.provider === "oss" && storage.key
      ? makeOssSignedCdnUrl({
        key: storage.key,
        fileName: target.fileName,
        contentType: target.mime,
        download: true,
        config: OSS,
      })
      : "";
  return {
    url: signedUrl || fallbackUrl || "",
    fileName: target.fileName || "generation",
    expiresIn: signedUrl ? (storage.provider === "oss" ? OSS.signedUrlTtlSeconds : 600) : 0,
    source: signedUrl ? `${storage.provider}_signed` : "authenticated_proxy",
  };
}

async function handleGenerationRecordDownloadUrl(req, res, taskId, url = null) {
  const r2Only = String(url?.searchParams?.get("quality") || "").toLowerCase() === "r2";
  const auth = await requireUser(req, res, { loadDb: false });
  if (!auth) return;
  let record = await getGenerationRecord(taskId);
  if (!record || record.userId !== auth.user.id || !isUserVisibleGenerationRecord(record)) {
    return sendJson(res, 404, { ok: false, message: "Generation record not found." });
  }
  if (record.resultLocked === true) {
    return sendJson(res, 423, { ok: false, code: "RESULT_LOCKED", message: "Unlock this result first." });
  }
  if (r2Only && !generationRecordHasR2Download(record)) {
    const taskId = String(record.taskId || "");
    const retry = ["1", "true", "yes"].includes(String(url?.searchParams?.get("retry") || "").toLowerCase());
    const preparationStatus = String(record.advancedDownloadStatus || "").toLowerCase();
    if (preparationStatus === "failed" && !retry) {
      return sendJson(res, 202, {
        ok: true,
        status: "failed",
        message: record.advancedDownloadError || "Advanced download preparation failed. Retry download2.",
      });
    }
    // If the process restarted mid-transfer, the database can still say
    // "preparing" while no local job exists. Requeue in that case instead of
    // leaving the record stuck forever.
    const queued = queueGenerationRecordAdvancedDownload(record, { retryFailed: retry });
    void scanMediaIngestQueue();
    if (queued || advancedDownloadPreparationQueued.has(taskId)) {
      return sendJson(res, 202, {
        ok: true,
        status: "preparing",
        message: "Advanced download is being prepared.",
      });
    }
    const error = new Error("Advanced download preparation could not be queued.");
    error.statusCode = 503;
    error.code = "ADVANCED_DOWNLOAD_QUEUE_UNAVAILABLE";
    return sendJson(res, error.statusCode, {
      ok: false,
      code: error.code,
      message: error.message,
    });
  }
  const target = generationRecordDownloadTarget(record, { r2Only });
  if (!target?.url && !target?.localPath) {
    return sendJson(res, r2Only ? 409 : 404, {
      ok: false,
      code: r2Only ? "R2_DOWNLOAD_NOT_READY" : "GENERATED_MEDIA_UNAVAILABLE",
      message: r2Only ? "Advanced R2 download is not ready yet." : "Generated media is not available.",
    });
  }
  const fallbackUrl = `/api/generation-records/${encodeURIComponent(taskId)}/download${r2Only ? "?quality=r2" : ""}`;
  return sendJson(res, 200, { ok: true, ...generationRecordDownloadUrlPayload(target, fallbackUrl) });
}

async function handleDownloadGenerationRecord(req, res, taskId, url = null) {
  const r2Only = String(url?.searchParams?.get("quality") || "").toLowerCase() === "r2";
  const auth = await requireUser(req, res, { loadDb: false });
  if (!auth) return;
  let record = await getGenerationRecord(taskId);
  if (!record || record.userId !== auth.user.id || !isUserVisibleGenerationRecord(record)) {
    return sendJson(res, 404, { ok: false, message: "Generation record not found." });
  }
  if (record.resultLocked === true) {
    return sendJson(res, 423, { ok: false, code: "RESULT_LOCKED", message: "Unlock this result first." });
  }
  if (r2Only && !generationRecordHasR2Download(record)) {
    try {
      record = await prepareGenerationRecordAdvancedDownload(record);
    } catch (error) {
      return sendJson(res, Number(error.statusCode) || 502, {
        ok: false,
        code: error.code || "ADVANCED_DOWNLOAD_FAILED",
        message: error.message || "Advanced download preparation failed.",
      });
    }
  }
  const target = generationRecordDownloadTarget(record, { r2Only });
  if (!target?.url && !target?.localPath) {
    return sendJson(res, r2Only ? 409 : 404, {
      ok: false,
      code: r2Only ? "R2_DOWNLOAD_NOT_READY" : "GENERATED_MEDIA_UNAVAILABLE",
      message: r2Only ? "Advanced R2 download is not ready yet." : "Generated media is not available.",
    });
  }

  const headers = {
    "content-type": target.mime || "application/octet-stream",
    "content-disposition": attachmentDisposition(target.fileName),
    "cache-control": "private, no-store",
  };
  if (target.localPath) {
    try {
      const stat = await fs.stat(target.localPath);
      headers["content-length"] = stat.size;
      res.writeHead(200, headers);
      if (req.method === "HEAD") return res.end();
      return pipeFileStream(res, target.localPath);
    } catch {
      // Fall through to the public URL copy below.
    }
  }

  if (!isPublicHttpUrl(target.url)) {
    return sendJson(res, 404, { ok: false, message: "Generated media file is missing." });
  }

  const response = await fetchPublicRemoteUrl(target.url, { signal: AbortSignal.timeout(15 * 60 * 1000) }, { label: "Generated media" });
  if (!response.ok || !response.body) {
    return sendJson(res, 502, { ok: false, message: `Failed to download generated media: ${response.status}` });
  }
  const remoteMime = String(response.headers.get("content-type") || "").split(";")[0].trim();
  if (remoteMime) headers["content-type"] = remoteMime;
  const contentLength = response.headers.get("content-length");
  if (contentLength) headers["content-length"] = contentLength;
  res.writeHead(200, headers);
  if (req.method === "HEAD") return res.end();
  return Readable.fromWeb(response.body).pipe(res);
}

async function handleDeleteGenerationRecord(req, res, taskId) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const record = await softDeleteGenerationRecordForUser(taskId, auth.user.id);
  if (!record) {
    return sendJson(res, 404, { ok: false, message: "Generation record not found." });
  }
  return sendJson(res, 200, { ok: true, record: publicGenerationRecord(record, generationRecordResponseOptionsForAuth(auth)) });
}

async function handleCreateCharacterImage(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;

  const body = await readJson(req, JSON_MEDIA_BODY_MAX_BYTES);
  const config = await readAppConfig();
  let userAsset = null;
  let publicInputImageUrl = "";
  if (body.dataUrl) {
    userAsset = await createUserAssetFromDataUrl(auth.db, auth.user, {
      dataUrl: body.dataUrl,
      name: body.name || "Character reference",
      fileName: body.fileName || "character-reference.png",
    });
  } else if (body.userAssetId) {
    userAsset = auth.db.userAssets.find((asset) => asset.id === body.userAssetId && asset.userId === auth.user.id);
  } else if (isPublicHttpUrl(body.imageUrl)) {
    publicInputImageUrl = publicHttpUrlForUpstream(body.imageUrl);
  }
  if (body.userAssetId && !userAsset) {
    return sendJson(res, 404, { ok: false, message: "User asset not found." });
  }

  const userPrompt = typeof body.prompt === "string" ? body.prompt : "";
  const prompt = userPrompt.trim() ? userPrompt : [
    userAsset
      ? "Use Figure 1 only as the identity and outfit reference. Rebuild it as a premium photorealistic human model asset, not anime, not illustration, not CGI, not doll-like."
      : "Create a premium photorealistic human model asset, not anime, not illustration, not CGI, not doll-like.",
    "Generate one complete 4x2 character turnaround sheet with exactly eight full-body views in this order: front, front-right, right side, back-right, back, back-left, left side, front-left.",
    "Keep the same face, hair, body proportions, outfit silhouette, fabric color, fabric texture, and adult age in every view.",
    "Each cell must contain one centered full-body woman from head to shoes, no cropping, no duplicate panels, no text labels, no UI, no room background.",
    "Use a pure flat chroma green background (#00ff00) in every cell for clean cutout; no gradient, no studio backdrop, no floor line, no cast shadow touching the frame border, and do not use green anywhere on the character.",
    "Mature seductive fashion editorial pose, confident eye contact, fitted evening or club outfit, elegant and sensual but non-nude and non-explicit.",
  ].filter(Boolean).join(" ");
  const model = userAsset || publicInputImageUrl ? config.characterImage.editModel : config.characterImage.textModel;
  const params = {
    prompt,
    image_size: normalizeSeedreamImageSize(config.characterImage.imageSize),
    num_images: 1,
    max_images: 1,
    enhance_prompt_mode: "standard",
  };

  if (userAsset) {
    const publicAsset = await ensurePublicUrlForUserAsset(auth.db, userAsset);
    params.image_urls = [publicAsset.publicUrl];
    publicInputImageUrl = publicAsset.publicUrl;
  } else if (publicInputImageUrl) {
    params.image_urls = [publicInputImageUrl];
  }

  if (body.dryRun === true) {
    return sendJson(res, 200, { ok: true, dryRun: true, model, params });
  }

  if (USE_GATEWAY_UPSTREAM) {
    const gatewayBody = { prompt };
    if (publicInputImageUrl) {
      gatewayBody.imageUrl = publicInputImageUrl;
      gatewayBody.fileName = userAsset?.name || body.fileName || "";
    }
    const submitted = await gatewayRequest("POST", "/api/character-image", gatewayBody);
    return sendJson(res, 200, submitted);
  }

  const generated = await createSeedream5ImageDirect({
    prompt,
    imageUrls: params.image_urls || [],
    resolution: process.env.CHARACTER_SEEDREAM_SIZE || "2K",
    model: process.env.CHARACTER_SEEDREAM_MODEL || (/^ep-/i.test(String(model || "")) ? model : ""),
    tier: process.env.CHARACTER_SEEDREAM_TIER || "pro",
  });
  const taskId = String(generated.raw?.id || generated.raw?.task_id || generated.raw?.taskId || randomId("img"));
  const local = await downloadGeneratedCharacterSheet(taskId, generated.imageUrl);
  const submitted = {
    ...generated.raw,
    task_id: taskId,
    taskId,
    id: taskId,
    status: "succeeded",
    output: { url: generated.imageUrl },
  };
  return sendJson(res, 200, {
    ok: true,
    task: submitted,
    model: generated.payload.model,
    params,
    payload: generated.payload,
    imageUrls: [local.cdnImageUrl, local.localUrl, generated.imageUrl].filter(Boolean),
    localSheetUrl: local.localUrl,
    localSheetPath: local.localPath,
    note: "Character sheet generated. The frontend will slice the 4x2 result into 8 rotation frames.",
  });
}

async function handleGetCharacterImage(req, res, taskId) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const existingSheet = await findGeneratedCharacterSheet(taskId);
  if (existingSheet) {
    const imageUrls = [existingSheet.cdnImageUrl, existingSheet.localUrl].filter(Boolean);
    return sendJson(res, 200, {
      ok: true,
      task: { taskId, task_id: taskId, id: taskId, status: "succeeded", output: { url: imageUrls[0] || existingSheet.localUrl } },
      imageUrls,
      localSheetUrl: existingSheet.localUrl,
      localSheetPath: existingSheet.localPath,
    });
  }
  if (USE_GATEWAY_UPSTREAM) {
    const payload = await gatewayRequest("GET", `/api/character-image/${encodeURIComponent(taskId)}`);
    const task = payload.task || payload;
    const imageUrls = [
      ...(Array.isArray(payload.imageUrls) ? payload.imageUrls : []),
      payload.localSheetUrl,
      payload.localUrl,
      collectImageUrls(task)[0],
    ].map(gatewayAbsoluteAssetUrl).filter(Boolean);
    let localSheetUrl = "";
    let localSheetPath = "";
    if (isCompletedStatus(task.status) && imageUrls[0]) {
      const local = await downloadGeneratedCharacterSheet(taskId, imageUrls[0]);
      localSheetUrl = local.localUrl;
      localSheetPath = local.localPath;
    }
    return sendJson(res, 200, { ...payload, ok: true, task, imageUrls, localSheetUrl: localSheetUrl || payload.localSheetUrl || "", localSheetPath });
  }
  const task = await apizRequest("/api/v3/tasks/query", { task_id: taskId });
  const imageUrls = collectImageUrls(task);
  let localSheetUrl = "";
  let localSheetPath = "";

  if (isCompletedStatus(task.status) && imageUrls[0]) {
    const local = await downloadGeneratedCharacterSheet(taskId, imageUrls[0]);
    localSheetUrl = local.localUrl;
    localSheetPath = local.localPath;
  }

  return sendJson(res, 200, { ok: true, task, imageUrls, localSheetUrl, localSheetPath });
}

async function handleCreateSceneVideo(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  if (!await enforceBusinessRateLimit(req, res, auth, { action: "scene_video_create", limit: 10, windowMs: 10 * 60_000 })) return;

  const body = await readJson(req);
  let config = await readAppConfig();
  const sceneConfig = findSceneConfig(config, body.sceneId);
  if (!sceneConfig || sceneConfig.id !== String(body.sceneId || "").trim()) {
    return sendJson(res, 404, { ok: false, message: "Scene not found." });
  }
  const sceneEntry = findSceneEntryConfig(sceneConfig, body.sceneEntryId);
  const userPrompt = makeScenePrompt(body);
  const prompt = makeSceneVideoPrompt(sceneConfig, userPrompt);
  const model = MODEL_QUALITY;
  const quality = "high";
  const dryRun = body.dryRun === true || process.env.SEEDANCE_DRY_RUN === "1";
  if (!prompt) {
    return sendJson(res, 400, { ok: false, message: "No prompt configured for this scene." });
  }

  if (dryRun || (!USE_GATEWAY_UPSTREAM && !ARK_API_KEY)) {
    return sendJson(res, dryRun ? 200 : 503, {
      ok: dryRun,
      code: dryRun ? "DRY_RUN" : "MISSING_ARK_API_KEY",
      message: dryRun ? "Demo task created locally." : "ARK_API_KEY is missing — real Seedance tasks cannot be submitted.",
      task: createDemoTask(body),
      model,
      request: { ratio: body.ratio || "9:16", resolution: body.resolution || "720p", duration: 15 },
    });
  }

  // Resolve the reference asset by character (admin home item OR user
  // custom character). We always go through the synthetic-reference
  // pipeline so the generated video shows the character, not just the
  // raw upload "moving a bit".
  let referenceAssetUri = "";
  let resolvedCompanionId = String(body.companionId || "").trim();
  let resolvedCompanionName = String(body.companionName || "").trim();
  let partnerCharacterId = String(body.partnerCharacterId || "").trim();
  let partnerCharacterName = "";
  let partnerReferenceAssetUri = "";

  if (resolvedCompanionId) {
    config.homeVideo = normalizeHomeVideo(config.homeVideo || {});
    const homeItem = findHomeVideoItem(config.homeVideo, resolvedCompanionId);
    if (homeItem) {
      try {
        config = await ensureSyntheticReferenceForHomeItem(config, homeItem.id);
        const refItem = findHomeVideoItem(config.homeVideo, homeItem.id);
        if (!refItem?.referenceAssetUri || (!USE_GATEWAY_UPSTREAM && !refItem?.syntheticReferenceLocalUrl)) {
          return sendJson(res, 503, {
            ok: false,
            code: "REFERENCE_NOT_READY",
            message: "Character reference is still being built upstream — please retry in a few seconds.",
          });
        }
        referenceAssetUri = refItem.referenceAssetUri;
        resolvedCompanionId = refItem.id;
        resolvedCompanionName = refItem.name || resolvedCompanionName;
      } catch (error) {
        const status = error.statusCode || 502;
        return sendJson(res, status, {
          ok: false,
          code: "REFERENCE_BUILD_FAILED",
          message: `Failed to prepare character reference: ${error.message || error}`,
        });
      }
    } else {
      const userChar = (auth.db.userCharacters || []).find((entry) => entry.id === resolvedCompanionId && entry.userId === auth.user.id && !isSoftDeleted(entry));
      if (userChar) {
        try {
          const prepared = await ensureCharacterReferenceForRecord({ ...userChar });
          if (!prepared.referenceAssetUri) {
            return sendJson(res, 503, {
              ok: false,
              code: "REFERENCE_NOT_READY",
              message: "Custom character reference still building — please retry in a few seconds.",
            });
          }
          auth.db.userCharacters = auth.db.userCharacters.map((entry) => (entry.id === prepared.id ? prepared : entry));
          if (dbEnabled()) await upsertUserCharacterInDb(prepared);
          else await writeDb(auth.db);
          referenceAssetUri = prepared.referenceAssetUri;
          resolvedCompanionName = prepared.name || resolvedCompanionName;
        } catch (error) {
          const status = error.statusCode || 502;
          return sendJson(res, status, {
            ok: false,
            code: "REFERENCE_BUILD_FAILED",
            message: `Failed to prepare custom character reference: ${error.message || error}`,
          });
        }
      }
    }
  }

  if (!referenceAssetUri) {
    referenceAssetUri = String(body.referenceAssetUri || "");
  }

  if (!referenceAssetUri) {
    return sendJson(res, 400, {
      ok: false,
      code: "MISSING_REFERENCE_ASSET",
      message: "No character reference is available — please pick a character first.",
    });
  }

  if (partnerCharacterId) {
    const partner = (auth.db.userCharacters || []).find((entry) => entry.id === partnerCharacterId && entry.userId === auth.user.id && !isSoftDeleted(entry));
    if (!partner) {
      return sendJson(res, 404, { ok: false, message: "Partner character not found." });
    }
    try {
      const preparedPartner = await ensureCharacterReferenceForRecord({ ...partner });
      if (!preparedPartner.referenceAssetUri) {
        return sendJson(res, 503, {
          ok: false,
          code: "REFERENCE_NOT_READY",
          message: "Partner character reference still building - please retry in a few seconds.",
        });
      }
      auth.db.userCharacters = auth.db.userCharacters.map((entry) => (entry.id === preparedPartner.id ? preparedPartner : entry));
      if (dbEnabled()) await upsertUserCharacterInDb(preparedPartner);
      else await writeDb(auth.db);
      partnerCharacterName = preparedPartner.name || "Partner";
      partnerReferenceAssetUri = preparedPartner.referenceAssetUri || "";
    } catch (error) {
      const status = error.statusCode || 502;
      return sendJson(res, status, {
        ok: false,
        code: "REFERENCE_BUILD_FAILED",
        message: `Failed to prepare partner character reference: ${error.message || error}`,
      });
    }
  }

  const finalPrompt = partnerReferenceAssetUri
    ? makeInteractiveSceneVideoPrompt(sceneConfig, resolvedCompanionName || body.companionName || "", partnerCharacterName, userPrompt)
    : prompt;
  const submittedFinalPrompt = finalPrompt;

  const payload = {
    model,
    content: [{ type: "text", text: submittedFinalPrompt }],
    generate_audio: true,
    ratio: body.ratio || config.video.ratio || "9:16",
    resolution: body.resolution || config.video.resolution || "720p",
    duration: clampNumber(body.duration, config.video.duration || 15, 5, 15),
    watermark: false,
  };

  if (referenceAssetUri.startsWith("asset://")) {
    payload.content.push({
      type: "image_url",
      image_url: { url: referenceAssetUri },
      role: "reference_image",
    });
  }
  if (partnerReferenceAssetUri && partnerReferenceAssetUri.startsWith("asset://") && partnerReferenceAssetUri !== referenceAssetUri) {
    payload.content.push({
      type: "image_url",
      image_url: { url: partnerReferenceAssetUri },
      role: "reference_image",
    });
  }

  const pricing = await seedanceVideoPricingForPayload(auth, config, payload, body);
  const cost = pricing.credits;
  if (auth.user.credits < cost) {
    return sendJson(res, 402, insufficientCreditsPayload(cost, auth.user.credits));
  }
  try {
    assertSubtokenCanSpend(auth, cost);
  } catch (error) {
    return sendJson(res, error.statusCode || 402, error.payload || { ok: false, code: error.code || "SUBTOKEN_UNAVAILABLE", message: error.message });
  }

  await chargeUserWithSubtoken(auth, {
    cost,
    type: "user_scene_video",
    taskId: randomId("scene"),
    meta: {
      sceneId: body.sceneId || "",
      sceneEntryId: sceneEntry.id,
      companionId: resolvedCompanionId || body.companionId || "",
      duration: payload.duration,
      resolution: payload.resolution,
      provider: pricing.provider || "seedance",
      originalCost: pricing.originalCredits,
      pricingMultiplier: pricing.userPricingMultiplier,
      pricingSource: pricing.source || "public_duration_rate",
    },
  });
  if (!dbEnabled()) await writeDb(auth.db);

  console.log("[seedance-submit-payload]", JSON.stringify(payload, null, 2));
  let raw;
  let task;
  try {
    if (USE_GATEWAY_UPSTREAM) {
      const gatewayBody = await gatewaySeedanceBodyFromReferences({
        config,
        prompt: submittedFinalPrompt,
        referenceAssetUri,
        extraReferenceAssetUris: partnerReferenceAssetUri ? [partnerReferenceAssetUri] : [],
        body: {
          ...body,
          ratio: payload.ratio,
          resolution: payload.resolution,
          duration: payload.duration,
          generateAudio: true,
        },
      });
      const gatewayTask = await gatewaySubmitAdvancedTask(gatewayBody);
      task = gatewayTask;
      raw = gatewayTask.raw || gatewayTask;
      Object.assign(payload, gatewayBody);
    } else {
      raw = await arkRequest("POST", "/contents/generations/tasks", payload);
      task = normalizeTask(raw);
    }
  } catch (error) {
    await changeUserCredits(auth.db, auth.user.id, cost, "user_scene_video_submit_refund", {
      sceneId: body.sceneId || "",
      sceneEntryId: sceneEntry.id,
      reason: error.message || "submit failed",
    });
    await recordSubtokenAdjustment(auth, {
      taskId: randomId("scene-refund"),
      type: "user_scene_video_submit_refund",
      amount: -cost,
      meta: { sceneId: body.sceneId || "", sceneEntryId: sceneEntry.id, reason: error.message || "submit failed" },
    });
    if (!dbEnabled()) await writeDb(auth.db);
    throw error;
  }
  if (!task) task = normalizeTask(raw);
  await upsertAndSettleGenerationRecord({
    taskId: task.taskId,
    status: task.status,
    model,
    sceneId: body.sceneId || "",
    sceneName: body.sceneName || "",
    sceneEntryId: sceneEntry.id,
    sceneEntryName: sceneEntry.name,
    companionId: resolvedCompanionId || body.companionId || "",
    companionName: resolvedCompanionName || body.companionName || "",
    userId: auth.user.id,
    referenceAssetUri,
    partnerCharacterId,
    partnerCharacterName,
    partnerReferenceAssetUri,
    prompt: body.prompt || "",
    finalPrompt: submittedFinalPrompt,
    ratio: payload.ratio,
    resolution: payload.resolution,
    duration: payload.duration,
    quality,
    provider: "seedance",
    upstreamSource: USE_GATEWAY_UPSTREAM ? "gateway" : "direct",
    kind: "scene-video",
    params: payload,
    upstreamPayload: payload,
    remoteVideoUrl: task.videoUrl || "",
    localVideoUrl: "",
    error: "",
    source: "user-scene-video",
    preDeductedCredits: cost,
    originalPreDeductedCredits: pricing.originalCredits ?? cost,
    finalCredits: cost,
    originalFinalCredits: pricing.originalCredits ?? cost,
    userPricingMultiplier: pricing.userPricingMultiplier ?? 1,
    billingStatus: cost > 0 ? "settled" : "free",
    billingSettledAt: new Date().toISOString(),
    pricingEstimate: pricing,
    createResponse: task,
    apiTokenId: auth.tokenRecord?.id || "",
    apiTokenName: auth.tokenRecord?.name || "",
    apiTokenType: auth.tokenRecord?.quotaType || "",
    apiTokenSource: auth.tokenSource || "",
  }, "create");

  return sendJson(res, 200, {
    ok: true,
    model,
    task: {
      taskId: task.taskId,
      status: task.status,
      videoUrl: task.videoUrl,
    },
    user: userView(auth.user),
    cost,
    sceneEntry,
  });
}

async function handleGetSceneVideo(req, res, taskId) {
  if (taskId.startsWith("demo-")) {
    const task = getDemoTask(taskId);
    if (!task) return sendJson(res, 404, { ok: false, message: "Demo task not found." });
    return sendJson(res, 200, { ok: true, task });
  }

  const gatewayTask = USE_GATEWAY_UPSTREAM ? await gatewayQueryTask(taskId) : null;
  const raw = gatewayTask ? gatewayTask.raw : await arkRequest("GET", `/contents/generations/tasks/${encodeURIComponent(taskId)}`);
  const task = gatewayTask || normalizeTask(raw);
  const localVideoUrl = "";
  const localVideoPath = "";
  const downloadError = "";
  if (isSucceededStatus(task.status) && task.videoUrl) {
    queueGeneratedVideoDownload(task.taskId || taskId, task.videoUrl, "scene-background-download");
  }

  await upsertAndSettleGenerationRecord({
    taskId: task.taskId || taskId,
    status: task.status,
    remoteVideoUrl: task.videoUrl || "",
    localVideoUrl,
    localVideoPath,
    error: task.error || downloadError || "",
    queryResponse: raw,
  }, "scene-query");

  return sendJson(res, 200, {
    ok: true,
    task: {
      taskId: task.taskId || taskId,
      status: task.status,
      videoUrl: task.videoUrl || localVideoUrl,
      remoteVideoUrl: task.videoUrl,
      localVideoUrl,
      error: task.error || downloadError,
    },
  });
}

function renderAdminHtml(html = "") {
  return String(html).replace(
    /(\.\/admin\.(?:css|js))\?v=[^"'\s>]*/g,
    (_match, assetPath) => `${assetPath}?v=${ADMIN_ASSET_VERSION}`,
  );
}

async function sendAdminHtml(req, res, filePath) {
  const html = renderAdminHtml(await fs.readFile(filePath, "utf8"));
  const body = Buffer.from(html);
  res.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "content-length": body.length,
    "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
    pragma: "no-cache",
    expires: "0",
    "cdn-cache-control": "no-store",
    "cloudflare-cdn-cache-control": "no-store",
  });
  res.end(req.method === "HEAD" ? undefined : body);
}

