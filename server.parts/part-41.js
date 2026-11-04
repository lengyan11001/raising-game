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
  view.mediaAssets = (Array.isArray(view.mediaAssets) ? view.mediaAssets : []).map((asset, index) => ({
    ...asset,
    adminPreviewUrl: adminGenerationReferenceMediaUrl(enrichedRecord.taskId, index),
    adminDownloadUrl: adminGenerationReferenceMediaUrl(enrichedRecord.taskId, index, { download: true }),
  }));
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
  if (!Number.isInteger(index) || index < 0 || index >= assets.length) {
    return sendJson(res, 404, { ok: false, message: "Reference media not found." });
  }
  const asset = assets[index] || {};
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

  return sendJson(res, 200, {
    ok: true,
    records: ownRecords.map((record) => publicGenerationRecord(record, generationRecordResponseOptionsForAuth(auth))),
    page,
    limit,
    total,
    totalPages,
    user: userView(auth.user),
  });
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

  let nextRecord = record;
  if (isStalePreSubmitGenerationRecord(record)) {
    nextRecord = await failStalePreSubmitGenerationRecord(record, "detail-stale-submit");
  } else if (needsApizFailureRefund(record)) {
    nextRecord = await settleApizGenerationRecord(record, { status: record.status || "failed", error: record.error || "" }, "detail");
  } else if (needsSeedanceFailureRefund(record)) {
    nextRecord = await settleSeedanceGenerationRecord(record, "detail");
  } else if (record.provider === "apiz" && (APIZ_API_KEY || record.upstreamSource === "gateway") && shouldRefreshGenerationRecord(record)) {
    // Status/media refresh runs in the bounded background queue. Never make a
    // browser detail request wait for an upstream download or R2 upload.
    queueGenerationRecordStatusRefresh(record, { priority: true, reason: "detail" });
  } else if (record.provider === "seedance25" && SEEDANCE25_API_KEY && shouldRefreshGenerationRecord(record)) {
    queueGenerationRecordStatusRefresh(record, { priority: true, reason: "detail" });
  } else if (record.upstreamSource === "tencent-vod" && shouldRefreshGenerationRecord(record)) {
    queueGenerationRecordStatusRefresh(record, { priority: true, reason: "detail" });
  } else if (record.upstreamSource === "gateway" && shouldRefreshGenerationRecord(record)) {
    queueGenerationRecordStatusRefresh(record, { priority: true, reason: "detail" });
  } else if (record.upstreamSource === "ignex" && shouldRefreshGenerationRecord(record)) {
    queueGenerationRecordStatusRefresh(record, { priority: true, reason: "detail" });
  } else if (["aliyun-wan30", "aliyun-wan27", "aliyun-happyhorse"].includes(record.provider) && (record.provider === "aliyun-wan30" ? ALIYUN_WAN30_API_KEY : ALIYUN_DASHSCOPE_API_KEY) && shouldRefreshGenerationRecord(record)) {
    // Do not make a browser detail poll wait on the upstream request. The
    // status queue performs the query and schedules media download/R2 upload;
    // the current record is safe to return immediately (R2-gated below).
    queueGenerationRecordStatusRefresh(record, { priority: true, reason: "detail" });
  } else if (record.provider === "aliyun-wan27-image" && ALIYUN_DASHSCOPE_API_KEY && shouldRefreshGenerationRecord(record)) {
    queueGenerationRecordStatusRefresh(record, { priority: true, reason: "detail" });
  } else if (ARK_API_KEY && shouldRefreshGenerationRecord(record) && !String(taskId).startsWith("demo-")) {
    queueGenerationRecordStatusRefresh(record, { priority: true, reason: "detail" });
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
    const filePath = path.normalize(path.isAbsolute(text) ? text : path.join(ROOT, text.replace(/^\/+/, "")));
    const relative = path.relative(ROOT, filePath);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) continue;
    return filePath;
  }
  return "";
}

function generationRecordDownloadTarget(record = {}, { r2Only = false } = {}) {
  const cdnVideoUrl = String(record.cdnVideoUrl || "").trim();
  const cdnImageUrl = String(record.cdnImageUrl || (Array.isArray(record.cdnImageUrls) ? record.cdnImageUrls.find((item) => String(item || "").trim()) : "") || "").trim();
  const videoUrl = r2Only ? cdnVideoUrl : generationRecordVideoUrl(record, { preferProviderVideoUrl: true });
  if (videoUrl) {
    const mime = videoMimeFromKnownPath(videoUrl) || "video/mp4";
    const ext = videoExtFromMime(mime, videoUrl);
    return {
      url: videoUrl,
      localPath: r2Only ? "" : localDownloadPathFromRecord(record, true, videoUrl),
      objectStorageUrl: cdnVideoUrl,
      mime,
      fileName: `${storagePathSegment(record.taskId || "generation", "generation")}${ext}`,
    };
  }
  const imageUrl = r2Only ? cdnImageUrl : (generationRecordProviderImageUrl(record) || generationRecordImageUrl(record));
  if (imageUrl) {
    const mime = imageMimeFromKnownPath(imageUrl) || "image/png";
    const ext = imageExtFromMime(mime);
    return {
      url: imageUrl,
      localPath: r2Only ? "" : localDownloadPathFromRecord(record, false, imageUrl),
      objectStorageUrl: cdnImageUrl,
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
    record.remoteImageUrl,
    record.providerImageUrl,
    record.upstreamImageUrl,
  ].map((item) => String(item || "").trim()).filter((item) => isPublicHttpUrl(item)))];
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

async function prepareGenerationRecordAdvancedDownload(record = {}) {
  if (!objectStorageEnabled() || !isSucceededStatus(record.status)) return record;
  const providerTarget = generationRecordProviderDownloadTarget(record);
  if (!providerTarget?.url) return record;
  if (generationRecordHasR2Download(record)) return record;

  const existing = await getGenerationRecord(record.taskId);
  if (!existing) return record;
  if (generationRecordHasR2Download(existing)) return existing;

  if (providerTarget.kind === "video") {
    const localVideo = await downloadGeneratedVideo(existing.taskId, providerTarget.url, { forceLocal: true });
    const poster = localVideo.localVideoPath
      ? await createGeneratedVideoPoster(existing.taskId, localVideo.localVideoPath)
      : { localPosterPath: "", localPosterUrl: "" };
    const cdn = await uploadGeneratedMediaToObjectStorage({
      taskId: existing.taskId,
      localVideoPath: localVideo.localVideoPath,
      localPosterPath: poster.localPosterPath,
      force: true,
    });
    if (!cdn.cdnVideoUrl) {
      const error = new Error(cdn.cdnError || "R2 upload failed.");
      error.statusCode = 502;
      error.code = "R2_UPLOAD_FAILED";
      throw error;
    }
    return updateGenerationRecordAdvancedDownloadInDb(existing.taskId, {
      localVideoUrl: localVideo.localVideoUrl,
      localVideoPath: localVideo.localVideoPath,
      localPosterUrl: poster.localPosterUrl,
      localPosterPath: poster.localPosterPath,
      playbackOptimizedAt: localVideo.playbackOptimizedAt || new Date().toISOString(),
      cdnVideoUrl: cdn.cdnVideoUrl,
      cdnPosterUrl: cdn.cdnPosterUrl,
      cdnError: "",
      advancedDownloadPreparedAt: new Date().toISOString(),
      advancedDownloadStatus: "ready",
      advancedDownloadError: "",
    });
  }

  const downloaded = await downloadRemoteFileToBuffer(providerTarget.url, { label: "advanced download image", maxBytes: 30 * 1024 * 1024 });
  const mime = String(downloaded.mime || "").startsWith("image/") ? downloaded.mime : providerTarget.mime;
  const saved = await saveGeneratedImageFile(existing.taskId, downloaded.bytes, mime, { publish: false, forceLocal: true });
  const upload = await uploadStaticAssetToObjectStorage({
    key: objectStoragePath("generated", "images", path.basename(saved.localImagePath)),
    bytes: downloaded.bytes,
    mime,
  });
  if (!upload.publicUrl) {
    const error = new Error("R2 upload completed without a public URL.");
    error.statusCode = 502;
    error.code = "R2_UPLOAD_FAILED";
    throw error;
  }
  await markPublishedFileSafely(saved.localImagePath);
  return updateGenerationRecordAdvancedDownloadInDb(existing.taskId, {
    localImageUrl: saved.localImageUrl,
    localImagePath: saved.localImagePath,
    imageResultUrl: upload.publicUrl,
    cdnImageUrl: upload.publicUrl,
    cdnImageUrls: [upload.publicUrl],
    cdnError: "",
    advancedDownloadPreparedAt: new Date().toISOString(),
    advancedDownloadStatus: "ready",
    advancedDownloadError: "",
  });
}

function generationImageResultUrl(record = {}, savedImage = null) {
  return String(
    savedImage?.cdnImageUrl
    || generationRecordProviderImageUrl(record)
    || record.remoteImageUrl
    || record.providerImageUrl
    || record.upstreamImageUrl
    || savedImage?.localImageUrl
    || record.localImageUrl
    || record.imageResultUrl
    || "",
  ).trim();
}

function generationRecordHasR2Download(record = {}) {
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

function r2KeyFromPublicDownloadUrl(value = "") {
  const text = String(value || "").trim();
  if (!text || !R2.publicDomain) return "";
  try {
    const publicBase = new URL(String(R2.publicDomain || "").replace(/\/+$/, ""));
    const parsed = new URL(text, configuredPublicBaseUrl() || "https://123vips.com");
    if (parsed.host === publicBase.host) return decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
    const siteBase = configuredPublicBaseUrl();
    if (siteBase) {
      const site = new URL(siteBase);
      if (parsed.host === site.host && parsed.pathname.startsWith("/assets/")) return decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
    }
  } catch {
    if (text.startsWith("/assets/")) return text.replace(/^\/+/, "");
  }
  if (text.startsWith("/assets/")) return text.replace(/^\/+/, "");
  return "";
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
  const key = r2KeyFromPublicDownloadUrl(target.objectStorageUrl);
  const signedUrl = key ? makeR2PresignedDownloadUrl({
    key,
    fileName: target.fileName,
    contentType: target.mime,
  }) : "";
  return {
    url: signedUrl || fallbackUrl || "",
    fileName: target.fileName || "generation",
    expiresIn: signedUrl ? 600 : 0,
    source: signedUrl ? "r2_signed" : "authenticated_proxy",
  };
}

async function handleGenerationRecordDownloadUrl(req, res, taskId, url = null) {
  const r2Only = String(url?.searchParams?.get("quality") || "").toLowerCase() === "r2";
  const auth = await requireUser(req, res);
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
  const fallbackUrl = `/api/generation-records/${encodeURIComponent(taskId)}/download${r2Only ? "?quality=r2" : ""}`;
  return sendJson(res, 200, { ok: true, ...generationRecordDownloadUrlPayload(target, fallbackUrl) });
}

async function handleDownloadGenerationRecord(req, res, taskId, url = null) {
  const r2Only = String(url?.searchParams?.get("quality") || "").toLowerCase() === "r2";
  const auth = await requireUser(req, res);
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

  const response = await fetch(target.url, { redirect: "follow", signal: AbortSignal.timeout(15 * 60 * 1000) });
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

  const body = await readJson(req);
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

const PRIVATE_STATIC_ROOT_FILES = new Set([
  "/.env.example",
  "/.gitignore",
  "/agents.md",
  "/aliyun-video.js",
  "/db.js",
  "/deploy.md",
  "/design_v1.md",
  "/media-inputs.js",
  "/package-lock.json",
  "/package.json",
  "/qwen-image3.js",
  "/readme.md",
  "/seedance25.js",
  "/seedance25-direct.js",
  "/server.js",
  "/server-source.js",
  "/session_handoff_2026-06-06.md",
  "/site-http.js",
  "/site-seo.js",
  "/telegram-bot.js",
  "/video-tools.js",
]);

function privateStaticPath(pathname = "") {
  const normalized = String(pathname || "").replace(/\\/g, "/").toLowerCase();
  return PRIVATE_STATIC_ROOT_FILES.has(normalized)
    || ["/.git/", "/data/", "/mobile/", "/scripts/", "/server.parts/", "/test/", "/tmp/"].some((prefix) => normalized.startsWith(prefix));
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

