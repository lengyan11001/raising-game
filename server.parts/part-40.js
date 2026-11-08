async function handleAdminCreateCharacterSceneVideo(req, res) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const body = await readJson(req);
  const itemId = String(body.itemId || "").trim();
  const sceneId = String(body.sceneId || "").trim();
  if (!itemId || !sceneId) {
    return sendJson(res, 400, { ok: false, message: "缺少 itemId 或 sceneId。" });
  }

  let config = await readAppConfig();
  config.homeVideo = normalizeHomeVideo(config.homeVideo || {});
  const item = findHomeVideoItem(config.homeVideo, itemId);
  if (!item || item.id !== itemId) {
    return sendJson(res, 404, { ok: false, message: "没有找到这个角色。" });
  }
  const sceneConfig = findSceneConfig(config, sceneId);
  if (!sceneConfig || sceneConfig.id !== sceneId) {
    return sendJson(res, 404, { ok: false, message: "没有找到这个场景。" });
  }
  if (!USE_GATEWAY_UPSTREAM && !ARK_API_KEY) {
    return sendJson(res, 503, { ok: false, code: "MISSING_ARK_API_KEY", message: "缺少 ARK_API_KEY，不能提交 Seedance 视频任务。" });
  }

  config = await ensureSyntheticReferenceForHomeItem(config, item.id);
  const refItem = findHomeVideoItem(config.homeVideo, itemId) || item;
  const referenceAssetUri = refItem.referenceAssetUri || config.homeVideo.referenceAssetUri;
  if (!referenceAssetUri) {
    return sendJson(res, 400, { ok: false, message: "角色还没有可用的上游参考素材。" });
  }
  if (!USE_GATEWAY_UPSTREAM && !refItem.syntheticReferenceLocalUrl) {
    return sendJson(res, 400, { ok: false, message: "该角色的合成参考图还没准备好，请稍候再试或先点'重建参考图'。" });
  }

  const userPrompt = typeof body.prompt === "string" ? body.prompt : "";
  if (body.saveOnly === true) {
    const nowIso = new Date().toISOString();
    const sceneVideos = { ...(item.sceneVideos || {}) };
    const previous = sceneVideos[sceneConfig.id] || {};
    sceneVideos[sceneConfig.id] = {
      ...previous,
      sceneId: sceneConfig.id,
      sceneName: sceneConfig.name,
      posterUrl: previous.posterUrl || item.posterUrl || item.localImageUrl || "",
      prompt: userPrompt,
      userPrompt,
      updatedAt: nowIso,
      createdAt: previous.createdAt || nowIso,
    };
    const nextItem = { ...item, sceneVideos, updatedAt: nowIso };
    config.homeVideo = replaceHomeVideoItem(config.homeVideo, nextItem);
    await writeAppConfig(config);
    return sendJson(res, 200, { ok: true, saved: true, item: nextItem, sceneVideo: sceneVideos[sceneConfig.id] });
  }
  const prompt = makeSceneVideoPrompt(sceneConfig, userPrompt);
  const { task, payload } = await submitSeedanceVideoTask({
    config,
    prompt,
    referenceAssetUri,
    body: { ...body, generateAudio: true },
    slug: `home-scene-${sceneConfig.id}`,
  });

  const nowIso = new Date().toISOString();
  const sceneVideos = { ...(refItem.sceneVideos || {}) };
  sceneVideos[sceneConfig.id] = {
    sceneId: sceneConfig.id,
    sceneName: sceneConfig.name,
    posterUrl: refItem.posterUrl || refItem.localImageUrl || "",
    prompt: prompt,
    userPrompt,
    finalPrompt: prompt,
    referenceAssetUri,
    model: MODEL_QUALITY,
    ratio: payload.ratio,
    resolution: payload.resolution,
    duration: payload.duration,
    provider: "seedance",
    taskId: task.taskId,
    status: task.status,
    videoUrl: "",
    localVideoUrl: "",
    remoteVideoUrl: task.videoUrl || "",
    createdAt: sceneVideos[sceneConfig.id]?.createdAt || nowIso,
    updatedAt: nowIso,
    error: "",
  };
  const nextItem = { ...refItem, sceneVideos, updatedAt: nowIso };
  config.homeVideo = replaceHomeVideoItem(config.homeVideo, nextItem);
  await writeAppConfig(config);

  await upsertGenerationRecord({
    taskId: task.taskId,
    status: task.status,
    model: MODEL_QUALITY,
    sceneId: sceneConfig.id,
    sceneName: sceneConfig.name,
    companionId: refItem.id,
    companionName: refItem.name,
    userId: auth.user.id,
    referenceAssetUri,
    prompt: prompt,
    finalPrompt: prompt,
    ratio: payload.ratio,
    resolution: payload.resolution,
    duration: payload.duration,
    quality: "high",
    provider: "seedance",
    upstreamSource: USE_GATEWAY_UPSTREAM ? "gateway" : "direct",
    remoteVideoUrl: task.videoUrl || "",
    localVideoUrl: "",
    error: "",
    source: "admin-character-scene",
  });

  return sendJson(res, 200, { ok: true, item: nextItem, sceneVideo: sceneVideos[sceneConfig.id], task });
}

async function handleAdminGetCharacterSceneVideo(req, res, taskId) {
  const auth = await requireAdmin(req, res, { loadDb: false });
  if (!auth) return;
  let config = await readAppConfig();
  config.homeVideo = normalizeHomeVideo(config.homeVideo || {});

  let matchedItem = null;
  let matchedSceneId = "";
  for (const candidate of config.homeVideo.items) {
    const sceneVideos = candidate.sceneVideos || {};
    for (const sceneId of Object.keys(sceneVideos)) {
      if (sceneVideos[sceneId]?.taskId === taskId) {
        matchedItem = candidate;
        matchedSceneId = sceneId;
        break;
      }
    }
    if (matchedItem) break;
  }
  if (!matchedItem || !matchedSceneId) {
    return sendJson(res, 404, { ok: false, message: "找不到对应的场景视频任务。" });
  }

  const gatewayTask = USE_GATEWAY_UPSTREAM ? await gatewayQueryTask(taskId) : null;
  const raw = gatewayTask ? gatewayTask.raw : await arkRequest("GET", `/contents/generations/tasks/${encodeURIComponent(taskId)}`);
  const task = gatewayTask || normalizeTask(raw);
  let localVideoUrl = "";
  let localVideoPath = "";
  let downloadError = "";
  if (isSucceededStatus(task.status) && task.videoUrl) {
    try {
      const localVideo = await downloadGeneratedVideo(taskId, task.videoUrl);
      localVideoUrl = localVideo.localVideoUrl;
      localVideoPath = localVideo.localVideoPath;
    } catch (error) {
      downloadError = error.message || "下载场景视频失败";
    }
  }

  const nowIso = new Date().toISOString();
  const sceneVideos = { ...(matchedItem.sceneVideos || {}) };
  const previous = sceneVideos[matchedSceneId] || {};
  sceneVideos[matchedSceneId] = {
    ...previous,
    sceneId: matchedSceneId,
    taskId: task.taskId || taskId,
    status: task.status,
    videoUrl: localVideoUrl || task.videoUrl || previous.videoUrl || "",
    localVideoUrl: localVideoUrl || previous.localVideoUrl || "",
    localVideoPath: localVideoPath || previous.localVideoPath || "",
    remoteVideoUrl: task.videoUrl || previous.remoteVideoUrl || "",
    error: task.error || downloadError || "",
    updatedAt: nowIso,
  };
  const nextItem = { ...matchedItem, sceneVideos, updatedAt: nowIso };
  config.homeVideo = replaceHomeVideoItem(config.homeVideo, nextItem);
  await writeAppConfig(config);

  await upsertAndSettleGenerationRecord({
    taskId: task.taskId || taskId,
    status: task.status,
    remoteVideoUrl: task.videoUrl || "",
    localVideoUrl,
    localVideoPath,
    error: task.error || downloadError || "",
    queryResponse: raw,
  }, "admin-character-scene-query");

  return sendJson(res, 200, { ok: true, item: nextItem, sceneVideo: sceneVideos[matchedSceneId], task });
}

async function handleAdminGetHomeVideo(req, res, taskId) {
  const auth = await requireAdmin(req, res, { loadDb: false });
  if (!auth) return;
  let config = await readAppConfig();
  const gatewayTask = USE_GATEWAY_UPSTREAM ? await gatewayQueryTask(taskId) : null;
  const raw = gatewayTask ? gatewayTask.raw : await arkRequest("GET", `/contents/generations/tasks/${encodeURIComponent(taskId)}`);
  const task = gatewayTask || normalizeTask(raw);
  let localVideoUrl = "";
  let localVideoPath = "";
  let downloadError = "";

  if (isSucceededStatus(task.status) && task.videoUrl) {
    try {
      const localVideo = await downloadGeneratedVideo(taskId, task.videoUrl);
      localVideoUrl = localVideo.localVideoUrl;
      localVideoPath = localVideo.localVideoPath;
    } catch (error) {
      downloadError = error.message || "下载首页视频失败";
    }
  }

  config.homeVideo = normalizeHomeVideo(config.homeVideo || {});
  let matchedItem = null;
  let matchedSceneId = "";
  for (const candidate of config.homeVideo.items || []) {
    const homeSceneVideos = candidate.homeSceneVideos || {};
    for (const sceneId of Object.keys(homeSceneVideos)) {
      if (homeSceneVideos[sceneId]?.taskId === taskId || homeSceneVideos[sceneId]?.taskId === task.taskId) {
        matchedItem = candidate;
        matchedSceneId = sceneId;
        break;
      }
    }
    if (matchedItem) break;
  }
  if (!matchedItem) {
    matchedItem = config.homeVideo.items.find((item) => item.taskId === taskId || item.taskId === task.taskId);
  }
  if (!matchedItem) {
    return sendJson(res, 404, { ok: false, message: "No matching home video task found." });
  }
  const nextItem = {
    ...matchedItem,
    taskId: task.taskId || taskId,
    status: task.status,
    videoUrl: localVideoUrl || task.videoUrl || matchedItem?.videoUrl || config.homeVideo.videoUrl || "",
    remoteVideoUrl: task.videoUrl || "",
    localVideoUrl,
    localVideoPath,
    error: task.error || downloadError || "",
    updatedAt: new Date().toISOString(),
  };
  if (matchedSceneId) {
    const homeSceneVideos = { ...(matchedItem.homeSceneVideos || {}) };
    const previous = homeSceneVideos[matchedSceneId] || {};
    homeSceneVideos[matchedSceneId] = {
      ...previous,
      sceneId: matchedSceneId,
      taskId: task.taskId || taskId,
      status: task.status,
      videoUrl: localVideoUrl || task.videoUrl || previous.videoUrl || "",
      localVideoUrl: localVideoUrl || previous.localVideoUrl || "",
      localVideoPath: localVideoPath || previous.localVideoPath || "",
      remoteVideoUrl: task.videoUrl || previous.remoteVideoUrl || "",
      error: task.error || downloadError || "",
      updatedAt: new Date().toISOString(),
    };
    nextItem.homeSceneVideos = homeSceneVideos;
    if (matchedSceneId !== "room") {
      nextItem.videoUrl = matchedItem.videoUrl || "";
      nextItem.localVideoUrl = matchedItem.localVideoUrl || "";
      nextItem.remoteVideoUrl = matchedItem.remoteVideoUrl || "";
      nextItem.localVideoPath = matchedItem.localVideoPath || "";
    }
  }
  config.homeVideo = replaceHomeVideoItem(config.homeVideo, nextItem);
  await writeAppConfig(config);
  await upsertAndSettleGenerationRecord({
    taskId: task.taskId || taskId,
    status: task.status,
    remoteVideoUrl: task.videoUrl || "",
    localVideoUrl,
    localVideoPath,
    error: task.error || downloadError || "",
  }, "admin-home-query");

  return sendJson(res, 200, { ok: true, homeVideo: config.homeVideo, item: nextItem, task: nextItem });
}

async function refreshCompletedHomeVideoItems(config) {
  let nextConfig = normalizeHomeVideo(config.homeVideo || {});
  let changed = false;

  for (const item of nextConfig.items || []) {
    const homeSceneVideos = { ...(item.homeSceneVideos || {}) };
    let updatedItem = item;
    for (const sceneId of Object.keys(homeSceneVideos)) {
      const entry = homeSceneVideos[sceneId] || {};
      const sceneTaskId = String(entry.taskId || "").trim();
      const sceneStatus = String(entry.status || "").toLowerCase();
      const sceneHasVideo = Boolean(String(entry.videoUrl || entry.localVideoUrl || "").trim());
      if (!sceneTaskId || sceneHasVideo || !sceneStatus || isFailedStatus(sceneStatus)) continue;

      let task;
      try {
        task = USE_GATEWAY_UPSTREAM
          ? await gatewayQueryTask(sceneTaskId)
          : normalizeTask(await arkRequest("GET", `/contents/generations/tasks/${encodeURIComponent(sceneTaskId)}`));
      } catch {
        continue;
      }
      if (!isSucceededStatus(task.status) || !task.videoUrl) continue;

      let localVideoUrl = "";
      let localVideoPath = "";
      let cdnVideoUrl = "";
      let cdnPosterUrl = "";
      let cdnError = "";
      try {
        const localVideo = await downloadGeneratedVideo(task.taskId || sceneTaskId, task.videoUrl);
        localVideoUrl = localVideo.localVideoUrl;
        localVideoPath = localVideo.localVideoPath;
        cdnVideoUrl = localVideo.cdnVideoUrl || "";
        cdnPosterUrl = localVideo.cdnPosterUrl || "";
        cdnError = localVideo.cdnError || "";
      } catch {}

      const nextEntry = {
        ...entry,
        taskId: task.taskId || sceneTaskId,
        status: task.status,
        videoUrl: localPublicAssetStorageEnabled()
          ? (localVideoUrl || cdnVideoUrl || task.videoUrl || entry.videoUrl || "")
          : (cdnVideoUrl || localVideoUrl || task.videoUrl || entry.videoUrl || ""),
        localVideoUrl: localVideoUrl || entry.localVideoUrl || "",
        localVideoPath: localVideoPath || entry.localVideoPath || "",
        remoteVideoUrl: task.videoUrl || entry.remoteVideoUrl || "",
        cdnVideoUrl: cdnVideoUrl || entry.cdnVideoUrl || "",
        cdnPosterUrl: cdnPosterUrl || entry.cdnPosterUrl || "",
        cdnError: cdnError || entry.cdnError || "",
        updatedAt: new Date().toISOString(),
        error: "",
      };
      homeSceneVideos[sceneId] = nextEntry;
      updatedItem = { ...updatedItem, homeSceneVideos, updatedAt: nextEntry.updatedAt };
      if (sceneId === "room") {
        updatedItem = {
          ...updatedItem,
          taskId: nextEntry.taskId,
          status: nextEntry.status,
          videoUrl: nextEntry.videoUrl,
          localVideoUrl: nextEntry.localVideoUrl,
          localVideoPath: nextEntry.localVideoPath || updatedItem.localVideoPath || "",
          remoteVideoUrl: nextEntry.remoteVideoUrl || updatedItem.remoteVideoUrl || "",
        };
      }
      nextConfig = replaceHomeVideoItem(nextConfig, updatedItem);
      await upsertAndSettleGenerationRecord({
        taskId: task.taskId || sceneTaskId,
        status: task.status,
        remoteVideoUrl: task.videoUrl || "",
        localVideoUrl,
        localVideoPath,
        cdnVideoUrl,
        cdnPosterUrl,
        cdnError,
        error: "",
        source: "admin-home-scene",
      }, "home-config-refresh");
      changed = true;
    }

    const taskId = String(item.taskId || "").trim();
    const status = String(item.status || "").toLowerCase();
    const hasVideo = Boolean(String(item.videoUrl || item.localVideoUrl || "").trim());
    if (!taskId || hasVideo || !status || isFailedStatus(status)) continue;

    let task;
    try {
      task = USE_GATEWAY_UPSTREAM
        ? await gatewayQueryTask(taskId)
        : normalizeTask(await arkRequest("GET", `/contents/generations/tasks/${encodeURIComponent(taskId)}`));
    } catch {
      continue;
    }
    if (!isSucceededStatus(task.status) || !task.videoUrl) continue;

    let localVideoUrl = "";
    let localVideoPath = "";
    let cdnVideoUrl = "";
    let cdnPosterUrl = "";
    let cdnError = "";
    try {
      const localVideo = await downloadGeneratedVideo(task.taskId || taskId, task.videoUrl);
      localVideoUrl = localVideo.localVideoUrl;
      localVideoPath = localVideo.localVideoPath;
      cdnVideoUrl = localVideo.cdnVideoUrl || "";
      cdnPosterUrl = localVideo.cdnPosterUrl || "";
      cdnError = localVideo.cdnError || "";
    } catch {}

    const legacyUpdatedItem = {
      ...item,
      taskId: task.taskId || taskId,
      status: task.status,
      videoUrl: localPublicAssetStorageEnabled()
        ? (localVideoUrl || cdnVideoUrl || task.videoUrl || item.videoUrl || "")
        : (cdnVideoUrl || localVideoUrl || task.videoUrl || item.videoUrl || ""),
      localVideoUrl: localVideoUrl || item.localVideoUrl || "",
      localVideoPath: localVideoPath || item.localVideoPath || "",
      remoteVideoUrl: task.videoUrl || item.remoteVideoUrl || "",
      cdnVideoUrl: cdnVideoUrl || item.cdnVideoUrl || "",
      cdnPosterUrl: cdnPosterUrl || item.cdnPosterUrl || "",
      cdnError: cdnError || item.cdnError || "",
      updatedAt: new Date().toISOString(),
      error: "",
    };
    nextConfig = replaceHomeVideoItem(nextConfig, legacyUpdatedItem);
    await upsertAndSettleGenerationRecord({
      taskId: task.taskId || taskId,
      status: task.status,
      remoteVideoUrl: task.videoUrl || "",
      localVideoUrl,
      localVideoPath,
      cdnVideoUrl,
      cdnPosterUrl,
      cdnError,
      error: "",
    }, "home-config-refresh");
    changed = true;
  }

  if (changed) {
    config.homeVideo = nextConfig;
    await writeAppConfig(config);
  } else {
    config.homeVideo = nextConfig;
  }

  return config;
}

function adminMyCharacterView(record, userMap) {
  if (!record) return null;
  const user = userMap?.get(record.userId);
  const posterUrl = record.publicImageUrl || record.cdnImageUrl || record.posterUrl || record.localImageUrl || "";
  const sourceImageUrl = record.publicImageUrl || record.cdnImageUrl || record.sourceImageUrl || "";
  const videoUrl = record.cdnVideoUrl || record.videoUrl || record.localVideoUrl || "";
  return {
    id: record.id,
    userId: record.userId,
    username: user?.username || "",
    name: record.name || "",
    title: record.title || "",
    description: record.description || record.summary || record.bio || record.prompt || record.finalPrompt || "",
    prompt: record.prompt || record.finalPrompt || "",
    posterUrl,
    sourceImageUrl,
    publicImageUrl: record.publicImageUrl || "",
    cdnImageUrl: record.cdnImageUrl || "",
    videoUrl,
    cdnVideoUrl: record.cdnVideoUrl || "",
    localVideoUrl: record.localVideoUrl || "",
    taskId: record.taskId || "",
    status: record.status || "",
    error: record.error || "",
    sceneVideos: publicSceneVideoMap(record.sceneVideos || {}),
    deletedAt: record.deletedAt || "",
    createdAt: record.createdAt || "",
    updatedAt: record.updatedAt || "",
  };
}

function adminWalletOrderView(order, userMap) {
  if (!order) return null;
  const user = userMap?.get(order.userId);
  const paymentProvider = order.paymentProvider || (order.network === "PayPal" ? "paypal" : "manual");
  const cashierHost = paymentProvider === "stripe" ? stripeCashierHostForOrder(order) : "";
  return {
    id: order.id,
    userId: order.userId,
    username: user?.username || "",
    paymentProvider,
    cashierHost,
    sourceOrigin: String(order.sourceOrigin || ""),
    sourceHost: hostnameFromOrigin(order.sourceOrigin || ""),
    baseAmount: order.baseAmount,
    creditAmount: order.creditAmount ?? (
      order.packageCredits !== undefined
        ? creditsAmount(order.packageCredits)
        : creditsAmount(Number(order.baseAmount || 0) * Number(order.creditsPerUsd || DEFAULT_CREDITS_PER_USD))
    ),
    packageId: order.packageId || "",
    packageCredits: order.packageCredits ?? "",
    creditsPerUsd: order.creditsPerUsd || "",
    cnyCentsPerUsdt: order.cnyCentsPerUsdt || "",
    cnyCentsPerUnit: order.cnyCentsPerUnit || "",
    suffix: order.suffix,
    payableAmount: order.payableAmount,
    payableAmountText: order.payableAmountText,
    asset: order.asset,
    currency: order.currency || order.asset || "",
    walletOptionId: order.walletOptionId || "",
    network: order.network,
    chain: order.chain || normalizeWalletChain(order.network || ""),
    address: order.address,
    qrUrl: order.qrUrl || "",
    transactionHash: order.transactionHash || order.txHash || "",
    confirmations: Number(order.confirmations || 0),
    blockNumber: order.blockNumber || "",
    fromAddress: order.fromAddress || "",
    matchedAt: order.matchedAt || "",
    matchedAmountText: order.matchedAmountText || "",
    scanSource: order.scanSource || "",
    matched: Boolean(order.matched || order.transactionHash || order.txHash),
    matchedTransactions: Array.isArray(order.matchedTransactions) ? order.matchedTransactions : [],
    paypalOrderId: order.paypalOrderId || "",
    paypalCaptureId: order.paypalCaptureId || "",
    paypalStatus: order.paypalStatus || "",
    paypalPayerEmail: order.paypalPayerEmail || "",
    stripeCheckoutSessionId: order.stripeCheckoutSessionId || "",
    stripePaymentIntentId: order.stripePaymentIntentId || "",
    stripeChargeId: order.stripeChargeId || "",
    stripeCustomerId: order.stripeCustomerId || "",
    stripeCustomerEmail: order.stripeCustomerEmail || "",
    stripeCustomerName: order.stripeCustomerName || "",
    stripePaymentMethodType: order.stripePaymentMethodType || "",
    stripeFailureCode: order.stripeFailureCode || "",
    stripeFailureMessage: order.stripeFailureMessage || "",
    stripeAmountReceived: order.stripeAmountReceived ?? "",
    stripeRefundedAmount: order.stripeRefundedAmount ?? 0,
    stripeRefundStatus: order.stripeRefundStatus || "",
    stripeCreatedAt: order.stripeCreatedAt || "",
    stripeDetailsSyncedAt: order.stripeDetailsSyncedAt || "",
    status: order.status || "pending",
    createdAt: order.createdAt,
    paidAt: order.paidAt || "",
    note: order.note || "",
  };
}

function adminRechargeLedgerRecordView(record = {}, userMap = new Map()) {
  const user = userMap.get(record.userId) || {};
  const source = record.source || record.kind || "";
  const provider = record.paymentProvider || record.provider || "";
  const credits = record.delta !== undefined && record.delta !== null
    ? creditsAmount(record.delta)
    : creditsAmount(record.credits ?? record.creditAmount ?? 0);
  return {
    id: record.id || "",
    source,
    sourceLabel: source === "manual_admin" ? "Admin credit adjustment" : "User top-up",
    userId: record.userId || "",
    username: record.username || user.username || "",
    credits,
    delta: credits,
    direction: credits < 0 ? "subtract" : "add",
    amountUsd: record.amountUsd ?? record.baseAmount ?? "",
    payableAmount: record.payableAmount ?? "",
    payableAmountText: record.payableAmountText || "",
    asset: record.asset || "",
    network: record.network || record.chain || "",
    paymentProvider: provider,
    stripeCheckoutSessionId: record.stripeCheckoutSessionId || "",
    stripePaymentIntentId: record.stripePaymentIntentId || "",
    stripeChargeId: record.stripeChargeId || "",
    stripeCustomerId: record.stripeCustomerId || "",
    stripeCustomerEmail: record.stripeCustomerEmail || "",
    stripeCustomerName: record.stripeCustomerName || "",
    stripePaymentMethodType: record.stripePaymentMethodType || "",
    stripeFailureCode: record.stripeFailureCode || "",
    stripeFailureMessage: record.stripeFailureMessage || "",
    stripeAmountReceived: record.stripeAmountReceived ?? "",
    stripeRefundedAmount: record.stripeRefundedAmount ?? 0,
    stripeCreatedAt: record.stripeCreatedAt || "",
    stripeDetailsSyncedAt: record.stripeDetailsSyncedAt || "",
    transactionHash: record.transactionHash || record.txHash || "",
    paypalOrderId: record.paypalOrderId || "",
    adminUserId: record.adminUserId || "",
    adminUsername: record.adminUsername || "",
    note: record.note || "",
    createdAt: record.createdAt || "",
    paidAt: record.paidAt || "",
  };
}

function adminRechargeLedgerRecords(db = {}) {
  const users = Array.isArray(db.users) ? db.users : [];
  const userMap = new Map(users.map((u) => [u.id, u]));
  const paidOrders = (db.walletOrders || [])
    .filter((order) => String(order.status || "").toLowerCase() === "paid")
    .map((order) => adminRechargeLedgerRecordView({
      id: order.id,
      source: "user_topup",
      userId: order.userId,
      username: userMap.get(order.userId)?.username || order.username || "",
      credits: order.creditAmount ?? order.packageCredits ?? Number(order.baseAmount || 0) * Number(order.creditsPerUsd || DEFAULT_CREDITS_PER_USD),
      amountUsd: order.baseAmount,
      payableAmount: order.payableAmount,
      payableAmountText: order.payableAmountText,
      asset: order.asset || order.currency || "",
      network: order.network || order.chain || "",
      paymentProvider: order.paymentProvider || (order.network === "PayPal" ? "paypal" : "manual"),
      stripeCheckoutSessionId: order.stripeCheckoutSessionId || "",
      stripePaymentIntentId: order.stripePaymentIntentId || "",
      stripeChargeId: order.stripeChargeId || "",
      stripeCustomerId: order.stripeCustomerId || "",
      stripeCustomerEmail: order.stripeCustomerEmail || "",
      stripeCustomerName: order.stripeCustomerName || "",
      stripePaymentMethodType: order.stripePaymentMethodType || "",
      stripeFailureCode: order.stripeFailureCode || "",
      stripeFailureMessage: order.stripeFailureMessage || "",
      stripeAmountReceived: order.stripeAmountReceived ?? "",
      stripeRefundedAmount: order.stripeRefundedAmount ?? 0,
      stripeCreatedAt: order.stripeCreatedAt || "",
      transactionHash: order.transactionHash || order.txHash || "",
      paypalOrderId: order.paypalOrderId || "",
      note: order.note || "",
      createdAt: order.createdAt,
      paidAt: order.paidAt || order.matchedAt || order.updatedAt || order.createdAt,
    }, userMap));
  const manualEntries = (db.creditLedger || [])
    .filter((entry) => ["admin_credit_add", "admin_credit_subtract", "admin_credit_adjustment", "manual_credit_add", "manual_credit_adjustment"].includes(String(entry.type || "")))
    .map((entry) => {
      const meta = entry.meta && typeof entry.meta === "object" ? entry.meta : {};
      return adminRechargeLedgerRecordView({
        id: entry.id,
        source: "manual_admin",
        userId: entry.userId,
        username: entry.username || userMap.get(entry.userId)?.username || "",
        delta: entry.delta,
        adminUserId: meta.adminUserId || "",
        adminUsername: meta.adminUsername || "",
        note: meta.note || meta.reason || entry.type || "",
        createdAt: entry.createdAt,
        paidAt: entry.createdAt,
      }, userMap);
    });
  return [...paidOrders, ...manualEntries]
    .sort((a, b) => String(b.paidAt || b.createdAt || "").localeCompare(String(a.paidAt || a.createdAt || "")));
}

async function hydrateStripeOrdersForAdmin(orders = [], persist = false) {
  const candidates = orders.filter((order) =>
    String(order?.paymentProvider || "").toLowerCase() === "stripe" &&
    String(order.stripeCheckoutSessionId || "").trim() &&
    !order.stripeDetailsSyncedAt,
  ).slice(0, 20);
  if (!candidates.length) return orders;
  await Promise.all(candidates.map(async (order) => {
    await hydrateStripeOrderDetails(order, null, null, null, stripeConfigForOrder(order));
    if (persist) await updateWalletOrderInDb(order).catch(() => {});
  }));
  return orders;
}

function adminRechargeLedgerSummary(records = []) {
  const userTopups = records.filter((entry) => entry.source === "user_topup");
  const manualAdjustments = records.filter((entry) => entry.source === "manual_admin");
  const manualAdds = manualAdjustments.filter((entry) => Number(entry.credits || 0) > 0);
  const manualReductions = manualAdjustments.filter((entry) => Number(entry.credits || 0) < 0);
  const sumCredits = (items) => creditsAmount(items.reduce((sum, item) => sum + Number(item.credits || 0), 0));
  const sumUsd = (items) => creditsAmount(items.reduce((sum, item) => sum + Number(item.amountUsd || 0), 0));
  return {
    totalCount: records.length,
    totalCredits: sumCredits(records),
    userTopupCount: userTopups.length,
    userTopupCredits: sumCredits(userTopups),
    userTopupUsd: sumUsd(userTopups),
    manualCount: manualAdjustments.length,
    manualCredits: sumCredits(manualAdds),
    manualAddedCredits: sumCredits(manualAdds),
    manualReducedCredits: creditsAmount(Math.abs(sumCredits(manualReductions))),
    manualNetCredits: sumCredits(manualAdjustments),
  };
}

function adminUserAssetView(asset, userMap) {
  if (!asset) return null;
  const user = userMap?.get(asset.userId);
  const publicUrl = asset.cdnUrl || asset.publicUrl || "";
  return {
    id: asset.id,
    userId: asset.userId,
    username: user?.username || "",
    url: asset.url || "",
    localUrl: asset.localUrl || "",
    publicUrl,
    cdnUrl: asset.cdnUrl || "",
    mime: asset.mime || "",
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt || "",
    deletedAt: asset.deletedAt || "",
  };
}

async function handleAdminRiskSummary(req, res, url = new URL("http://localhost")) {
  const auth = await requireAdmin(req, res, { loadDb: false });
  if (!auth) return;
  const hours = Math.max(1, Math.min(168, Number(url.searchParams.get("hours") || 24) || 24));
  const risk = await getRiskSummaryFromDb({ sinceHours: hours });
  return sendJson(res, 200, { ok: true, risk });
}

async function handleAdminDashboard(req, res) {
  const auth = await requireAdmin(req, res, { loadDb: false });
  if (!auth) return;
  const [config, characterVisitStats, dashboardStats, riskSummary] = await Promise.all([
    readAppConfig(),
    readGeoCharacterVisitStats(),
    dbEnabled() ? getAdminDashboardStatsFromDb() : Promise.resolve(null),
    dbEnabled() ? getRiskSummaryFromDb({ sinceHours: 24 }) : Promise.resolve(null),
  ]);
  const items = Array.isArray(config.homeVideo?.items) ? config.homeVideo.items : [];
  const characterVisits = adminCharacterVisitDashboardStats(items, characterVisitStats);
  const sceneBindCount = items.reduce((sum, item) => sum + Object.keys(item.sceneVideos || {}).length, 0);
  const stats = dashboardStats || {
    users: (auth.db.users || []).length,
    admins: (auth.db.users || []).filter((u) => u.role === "admin").length,
    totalCredits: (auth.db.users || []).reduce((sum, u) => sum + Number(u.credits || 0), 0),
    userCharacters: (auth.db.userCharacters || []).length,
    userSceneVideos: (auth.db.userCharacters || []).reduce((sum, c) => sum + Object.keys(c.sceneVideos || {}).length, 0),
    walletOrders: (auth.db.walletOrders || []).length,
    pendingOrders: (auth.db.walletOrders || []).filter((o) => o.status === "pending").length,
    generationRecords: (auth.db.generationRecords || []).length,
    sessions: (auth.db.sessions || []).length,
    userAssets: (auth.db.userAssets || []).length,
  };
  return sendJson(res, 200, {
    ok: true,
    stats: {
      ...stats,
      adminCharacters: items.length,
      sceneBindings: sceneBindCount,
      scenes: Array.isArray(config.scenes) ? config.scenes.length : 0,
    },
    activeHomeItemId: config.homeVideo?.activeItemId || "",
    characterVisits,
    risk: riskSummary,
  });
}

async function handleAdminListUsers(req, res, url) {
  const auth = await requireAdmin(req, res, { loadDb: false });
  if (!auth) return;
  const paging = pagingFromUrl(url || new URL("http://localhost"), { defaultLimit: 20, maxLimit: 100 });
  const query = String((url || new URL("http://localhost")).searchParams.get("q") || "").trim().toLowerCase();
  const role = String((url || new URL("http://localhost")).searchParams.get("role") || "").trim().toLowerCase();
  const riskStatus = String((url || new URL("http://localhost")).searchParams.get("riskStatus") || "").trim().toLowerCase();
  if (dbEnabled()) {
    const result = await getAdminUsersPageFromDb({ page: paging.page, limit: paging.limit, queryText: query, role, riskStatus });
    if (result) {
      return sendJson(res, 200, { ok: true, users: result.items.map((user) => ({ ...userView(user), customCharacters: user.customCharacters, walletOrders: user.walletOrders, advancedAccess: user.advancedAccess === true, advancedAccessRequestedAt: user.advancedAccessRequestedAt || "", registrationChannel: user.registrationChannel || user.registrationAttribution?.channel || "", registrationAttribution: user.registrationAttribution && typeof user.registrationAttribution === "object" ? user.registrationAttribution : {} })), page: result.page, limit: result.limit, total: result.total, totalPages: Math.max(1, Math.ceil(result.total / result.limit)) });
    }
  }
  const userCharacters = Array.isArray(auth.db.userCharacters) ? auth.db.userCharacters : [];
  const charByUser = new Map();
  userCharacters.forEach((c) => {
    charByUser.set(c.userId, (charByUser.get(c.userId) || 0) + 1);
  });
  const orderByUser = new Map();
  (auth.db.walletOrders || []).forEach((o) => {
    orderByUser.set(o.userId, (orderByUser.get(o.userId) || 0) + 1);
  });
  let list = (auth.db.users || []).map((u) => ({
    ...userView(u),
    customCharacters: charByUser.get(u.id) || 0,
    walletOrders: orderByUser.get(u.id) || 0,
    advancedAccess: u.advancedAccess === true,
    advancedAccessRequestedAt: u.advancedAccessRequestedAt || "",
    registrationChannel: u.registrationChannel || u.registrationAttribution?.channel || "",
    registrationAttribution: u.registrationAttribution && typeof u.registrationAttribution === "object" ? u.registrationAttribution : {},
  }));
  if (query) {
    list = list.filter((user) => [user.username, user.id, user.tenantId, user.apiToken, user.role, user.registrationChannel, user.registrationAttribution?.host]
      .some((value) => String(value || "").toLowerCase().includes(query)));
  }
  if (role) list = list.filter((user) => String(user.role || "").toLowerCase() === role);
  if (riskStatus) list = list.filter((user) => String(user.riskStatus || "clear").toLowerCase() === riskStatus);
  list.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  const paged = pagedResponse(list, paging);
  return sendJson(res, 200, { ok: true, users: paged.items, page: paged.page, limit: paged.limit, total: paged.total, totalPages: paged.totalPages });
}

async function handleAdminUpdateUser(req, res, userId) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const user = (auth.db.users || []).find((u) => u.id === userId);
  if (!user) return sendJson(res, 404, { ok: false, message: "用户不存在。" });
  const body = await readJson(req);
  let changed = false;
  const adminCreditMeta = {
    adminUserId: auth.user.id,
    adminUsername: auth.user.username || "",
    targetUserId: user.id,
    targetUsername: user.username || "",
    note: "Admin user credit adjustment",
  };
  const creditsAdd = Number(body.creditsAdd);
  const creditsSubtract = Number(body.creditsSubtract);
  const hasCreditsAdd = Number.isFinite(creditsAdd) && creditsAdd > 0;
  const hasCreditsSubtract = Number.isFinite(creditsSubtract) && creditsSubtract > 0;
  if (hasCreditsAdd && hasCreditsSubtract) {
    return sendJson(res, 400, { ok: false, message: "Use either creditsAdd or creditsSubtract, not both." });
  }
  if (hasCreditsAdd) {
    const amount = roundCredits(creditsAdd, 6);
    await changeUserCredits(auth.db, user.id, amount, "admin_credit_add", {
      ...adminCreditMeta,
      mode: "add",
      amount,
    });
    changed = true;
  } else if (hasCreditsSubtract) {
    const amount = roundCredits(creditsSubtract, 6);
    await changeUserCredits(auth.db, user.id, -amount, "admin_credit_subtract", {
      ...adminCreditMeta,
      mode: "subtract",
      amount,
    });
    changed = true;
  } else if (Object.prototype.hasOwnProperty.call(body, "credits") || Object.prototype.hasOwnProperty.call(body, "creditsDelta")) {
    const hasLegacyCredits = Object.prototype.hasOwnProperty.call(body, "credits");
    const hasLegacyDelta = Object.prototype.hasOwnProperty.call(body, "creditsDelta");
    const legacyCreditsRaw = body.credits;
    const legacyDeltaRaw = body.creditsDelta;
    const legacyCreditsProvided = hasLegacyCredits && legacyCreditsRaw !== "" && legacyCreditsRaw !== null && legacyCreditsRaw !== undefined;
    const legacyDeltaProvided = hasLegacyDelta && legacyDeltaRaw !== "" && legacyDeltaRaw !== null && legacyDeltaRaw !== undefined;
    const legacyCredits = Number(legacyCreditsRaw);
    const legacyDelta = Number(legacyDeltaRaw);
    const creditsChanged = legacyCreditsProvided
      && Number.isFinite(legacyCredits)
      && Math.abs(roundCredits(legacyCredits, 6) - roundCredits(user.credits || 0, 6)) > 0.000001;
    const deltaChanged = legacyDeltaProvided && Number.isFinite(legacyDelta) && Math.abs(legacyDelta) > 0.000001;
    if (
      (legacyCreditsProvided && !Number.isFinite(legacyCredits)) ||
      (legacyDeltaProvided && !Number.isFinite(legacyDelta)) ||
      creditsChanged ||
      deltaChanged
    ) {
      return sendJson(res, 400, { ok: false, message: "Use creditsAdd to increase or creditsSubtract to decrease credits." });
    }
  }
  if (typeof body.role === "string" && ["admin", "user"].includes(body.role)) {
    if (user.role === "admin" && body.role !== "admin") {
      const admins = (auth.db.users || []).filter((u) => u.role === "admin");
      if (admins.length <= 1) {
        return sendJson(res, 400, { ok: false, message: "至少要保留一名管理员。" });
      }
    }
    user.role = body.role;
    changed = true;
  }
  if (typeof body.riskStatus === "string" && ["clear", "quarantined"].includes(body.riskStatus)) {
    const nextRiskStatus = body.riskStatus;
    user.riskStatus = nextRiskStatus;
    user.riskReviewedAt = new Date().toISOString();
    user.riskReviewedBy = auth.user.id;
    if (nextRiskStatus === "clear") {
      user.riskReasons = [];
      user.riskClearedAt = user.riskReviewedAt;
    } else {
      user.riskQuarantinedAt = user.riskReviewedAt;
      user.riskReasons = Array.isArray(user.riskReasons) && user.riskReasons.length ? user.riskReasons : ["manual_admin_quarantine"];
    }
    changed = true;
  }
  if (typeof body.advancedAccess === "boolean") {
    user.advancedAccess = body.advancedAccess;
    if (body.advancedAccess) user.advancedAccessReviewedAt = new Date().toISOString();
    changed = true;
  }
  if (typeof body.apiDocsAccess === "boolean") {
    const now = new Date().toISOString();
    const current = user.apiDocsAccess && typeof user.apiDocsAccess === "object" ? user.apiDocsAccess : {};
    user.apiDocsAccess = body.apiDocsAccess
      ? {
          ...current,
          status: "active",
          productId: API_DOCS_PRODUCT_ID,
          grantedAt: current.grantedAt || now,
          source: current.source || "admin",
          orderId: current.orderId || "",
          updatedAt: now,
        }
      : {
          ...current,
          status: "revoked",
          productId: API_DOCS_PRODUCT_ID,
          revokedAt: now,
          revokedBy: auth.user.id,
          updatedAt: now,
        };
    changed = true;
  }
  if (
    Object.prototype.hasOwnProperty.call(body, "pricingMultiplier") ||
    Object.prototype.hasOwnProperty.call(body, "priceMultiplier") ||
    Object.prototype.hasOwnProperty.call(body, "discount")
  ) {
    const rawMultiplier = body.pricingMultiplier ?? body.priceMultiplier ?? body.discount;
    const nextMultiplier = Number(rawMultiplier);
    if (!Number.isFinite(nextMultiplier) || nextMultiplier <= 0 || nextMultiplier > 100) {
      return sendJson(res, 400, { ok: false, message: "价格折扣比例必须大于 0，且不超过 100。" });
    }
    user.pricingMultiplier = normalizeUserPricingMultiplier(nextMultiplier);
    changed = true;
  }
  if (
    Object.prototype.hasOwnProperty.call(body, "apiPricingMultiplier") ||
    Object.prototype.hasOwnProperty.call(body, "apiPriceMultiplier") ||
    Object.prototype.hasOwnProperty.call(body, "apiDiscount")
  ) {
    const rawMultiplier = body.apiPricingMultiplier ?? body.apiPriceMultiplier ?? body.apiDiscount;
    const nextMultiplier = Number(rawMultiplier);
    if (!Number.isFinite(nextMultiplier) || nextMultiplier <= 0 || nextMultiplier > 100) {
      return sendJson(res, 400, { ok: false, message: "API 价格折扣比例必须大于 0，且不超过 100。" });
    }
    user.apiPricingMultiplier = normalizeUserPricingMultiplier(nextMultiplier);
    changed = true;
  }
  if (body.regenerateApiToken === true) {
    user.apiToken = makeUniqueApiToken(auth.db);
    changed = true;
  } else if (!user.apiToken) {
    ensureUserApiToken(user, auth.db);
    changed = true;
  }
  if (changed) {
    user.updatedAt = new Date().toISOString();
    if (dbEnabled()) await updateUserInDb(user);
    else await writeDb(auth.db);
    if (body.forceLogout === true) {
      if (dbEnabled()) await revokeUserCredentialsInDb(user.id);
      else auth.db.sessions = (auth.db.sessions || []).filter((session) => session.userId !== user.id);
    }
  }
  return sendJson(res, 200, { ok: true, user: userView(user) });
}

async function handleAdminResetPassword(req, res, userId) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const user = (auth.db.users || []).find((u) => u.id === userId);
  if (!user) return sendJson(res, 404, { ok: false, message: "用户不存在。" });
  const body = await readJson(req);
  const password = String(body.password || "");
  if (password.length < 10) {
    return sendJson(res, 400, { ok: false, message: "密码至少 10 位。" });
  }
  user.passwordHash = hashPassword(password);
  // A password change revokes the old primary API token, but not existing
  // browser sessions. Admins can still use the explicit forceLogout action.
  user.apiToken = makeUniqueApiToken(auth.db);
  user.updatedAt = new Date().toISOString();
  if (dbEnabled()) await updateUserInDb(user);
  else await writeDb(auth.db);
  return sendJson(res, 200, { ok: true, user: userView(user) });
}

async function handleAdminDeleteUser(req, res, userId) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  if (auth.user.id === userId) {
    return sendJson(res, 400, { ok: false, message: "不能删除自己。" });
  }
  const user = (auth.db.users || []).find((u) => u.id === userId);
  if (!user) return sendJson(res, 404, { ok: false, message: "用户不存在。" });
  if (user.role === "admin") {
    const admins = (auth.db.users || []).filter((u) => u.role === "admin");
    if (admins.length <= 1) {
      return sendJson(res, 400, { ok: false, message: "至少要保留一名管理员。" });
    }
  }
  const nowIso = new Date().toISOString();
  const assetsToDelete = (auth.db.userAssets || []).filter((a) => a.userId === userId);
  const charactersToDelete = (auth.db.userCharacters || []).filter((c) => c.userId === userId);
  user.deletedAt = user.deletedAt || nowIso;
  user.updatedAt = nowIso;
  auth.db.users = (auth.db.users || []).map((u) => (u.id === userId ? user : u));
  auth.db.sessions = (auth.db.sessions || []).filter((s) => s.userId !== userId);
  auth.db.walletOrders = (auth.db.walletOrders || []).filter((o) => o.userId !== userId);
  auth.db.userAssets = (auth.db.userAssets || []).map((a) => (a.userId === userId ? { ...a, deletedAt: a.deletedAt || nowIso, updatedAt: nowIso } : a));
  auth.db.userCharacters = (auth.db.userCharacters || []).map((c) => (c.userId === userId ? { ...c, deletedAt: c.deletedAt || nowIso, updatedAt: nowIso } : c));
  if (dbEnabled()) await updateUserInDb(user);
  else await writeDb(auth.db);
  if (dbEnabled()) {
    await Promise.all([
      ...assetsToDelete.map((asset) => upsertUserAssetInDb({ ...asset, deletedAt: asset.deletedAt || nowIso, updatedAt: nowIso })),
      ...charactersToDelete.map((character) => upsertUserCharacterInDb({ ...character, deletedAt: character.deletedAt || nowIso, updatedAt: nowIso })),
    ]);
  }
  await deleteUserSessionsInDb(userId);
  await deleteUserWalletOrdersInDb(userId);
  return sendJson(res, 200, { ok: true });
}

async function handleAdminListMyCharacters(req, res) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const userMap = new Map((auth.db.users || []).map((u) => [u.id, u]));
  const list = (auth.db.userCharacters || []).map((r) => adminMyCharacterView(r, userMap));
  list.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  return sendJson(res, 200, { ok: true, characters: list });
}

function adminTextMatches(record, query, fields = []) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return true;
  return fields.some((field) => String(record?.[field] || "").toLowerCase().includes(q));
}

function adminHomeItemView(item, activeId) {
  return {
    ...item,
    isActive: item?.id === activeId,
    description: item?.description || item?.summary || item?.bio || item?.prompt || item?.finalPrompt || "",
    prompt: item?.prompt || item?.finalPrompt || "",
  };
}

async function handleAdminListHomeItems(req, res, url) {
  const auth = await requireAdmin(req, res, { loadDb: false });
  if (!auth) return;
  const paging = pagingFromUrl(url || new URL("http://localhost"), { defaultLimit: 20, maxLimit: 100 });
  const q = String(url?.searchParams?.get("q") || "").trim().toLowerCase();
  const config = await readAppConfig();
  const activeId = config.homeVideo?.activeItemId || "";
  let list = (Array.isArray(config.homeVideo?.items) ? config.homeVideo.items : [])
    .map((item) => adminHomeItemView(item, activeId));
  if (q) {
    list = list.filter((item) => adminTextMatches(item, q, [
      "id",
      "name",
      "title",
      "description",
      "prompt",
      "status",
      "taskId",
      "upstreamTaskId",
      "referenceAssetUri",
    ]));
  }
  list.sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")));
  const paged = pagedResponse(list, paging);
  return sendJson(res, 200, {
    ok: true,
    items: paged.items,
    page: paged.page,
    limit: paged.limit,
    total: paged.total,
    totalPages: paged.totalPages,
  });
}

async function handleAdminListMyCharacters(req, res, url) {
  const auth = await requireAdmin(req, res, { loadDb: false });
  if (!auth) return;
  const paging = pagingFromUrl(url || new URL("http://localhost"), { defaultLimit: 20, maxLimit: 100 });
  const q = String(url?.searchParams?.get("q") || "").trim().toLowerCase();
  if (dbEnabled()) {
    const result = await getAdminUserCharactersPageFromDb({ page: paging.page, limit: paging.limit, queryText: q });
    if (result) {
      return sendJson(res, 200, { ok: true, characters: result.items.map((r) => adminMyCharacterView(r, new Map([[r.userId, { username: r.username }]]))), page: result.page, limit: result.limit, total: result.total, totalPages: Math.max(1, Math.ceil(result.total / result.limit)) });
    }
  }
  const userMap = new Map((auth.db.users || []).map((u) => [u.id, u]));
  let list = (auth.db.userCharacters || [])
    .filter((record) => !isSoftDeleted(record))
    .map((r) => adminMyCharacterView(r, userMap))
    .filter(Boolean);
  if (q) {
    list = list.filter((item) => adminTextMatches(item, q, [
      "id",
      "userId",
      "username",
      "name",
      "title",
      "description",
      "prompt",
      "status",
      "taskId",
      "upstreamTaskId",
    ]));
  }
  list.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  const paged = pagedResponse(list, paging);
  return sendJson(res, 200, {
    ok: true,
    characters: paged.items,
    page: paged.page,
    limit: paged.limit,
    total: paged.total,
    totalPages: paged.totalPages,
  });
}

async function handleAdminDeleteMyCharacter(req, res, characterId) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const record = (auth.db.userCharacters || []).find((c) => c.id === characterId);
  if (!record || isSoftDeleted(record)) {
    return sendJson(res, 404, { ok: false, message: "角色不存在。" });
  }
  const nowIso = new Date().toISOString();
  record.deletedAt = nowIso;
  record.updatedAt = nowIso;
  auth.db.userCharacters = (auth.db.userCharacters || []).map((c) => (c.id === characterId ? record : c));
  if (dbEnabled()) await upsertUserCharacterInDb(record);
  else await writeDb(auth.db);
  await softDeleteGenerationRecordsByCompanion(record.id);
  return sendJson(res, 200, { ok: true });
}

async function handleAdminUpdateHomeItem(req, res, itemId) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const config = await readAppConfig();
  const items = Array.isArray(config.homeVideo?.items) ? config.homeVideo.items : [];
  const idx = items.findIndex((it) => it.id === itemId);
  if (idx < 0) return sendJson(res, 404, { ok: false, message: "角色不存在。" });
  const body = await readJson(req);
  const item = items[idx];
  if (typeof body.name === "string") item.name = body.name.trim().slice(0, 32) || item.name;
  if (typeof body.title === "string") item.title = body.title.trim().slice(0, 32) || item.title;
  if (typeof body.prompt === "string") item.prompt = body.prompt;
  item.updatedAt = new Date().toISOString();
  items[idx] = item;
  config.homeVideo.items = items;
  await writeAppConfig(config);
  return sendJson(res, 200, { ok: true, item, homeVideo: config.homeVideo });
}

async function handleAdminDeleteHomeItem(req, res, itemId) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const config = await readAppConfig();
  const items = Array.isArray(config.homeVideo?.items) ? config.homeVideo.items : [];
  const remaining = items.filter((it) => it.id !== itemId);
  if (remaining.length === items.length) {
    return sendJson(res, 404, { ok: false, message: "角色不存在。" });
  }
  const nowIso = new Date().toISOString();
  const deleted = items.find((it) => it.id === itemId);
  config.homeVideo.items = remaining;
  if (config.homeVideo.activeItemId === itemId) {
    config.homeVideo.activeItemId = remaining[0]?.id || "";
  }
  config.homeVideo = syncHomeVideoActiveFields(config.homeVideo);
  await writeAppConfig(config);
  if (deleted) {
    await softDeleteGenerationRecordsByCompanion(itemId);
  }
  return sendJson(res, 200, { ok: true, homeVideo: config.homeVideo });
}

async function handleAdminSetHomeActive(req, res, itemId) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const config = await readAppConfig();
  const items = Array.isArray(config.homeVideo?.items) ? config.homeVideo.items : [];
  if (!items.find((it) => it.id === itemId)) {
    return sendJson(res, 404, { ok: false, message: "角色不存在。" });
  }
  config.homeVideo.activeItemId = itemId;
  config.homeVideo = syncHomeVideoActiveFields(config.homeVideo);
  await writeAppConfig(config);
  return sendJson(res, 200, { ok: true, homeVideo: config.homeVideo });
}

async function handleAdminListScenes(req, res) {
  const auth = await requireAdmin(req, res, { loadDb: false });
  if (!auth) return;
  const config = await readAppConfig();
  return sendJson(res, 200, { ok: true, scenes: Array.isArray(config.scenes) ? config.scenes : [] });
}

async function handleAdminUpdateScene(req, res, sceneId) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const config = await readAppConfig();
  const idx = (config.scenes || []).findIndex((s) => s.id === sceneId);
  if (idx < 0) return sendJson(res, 404, { ok: false, message: "场景不存在。" });
  const body = await readJson(req);
  const scene = config.scenes[idx];
  if (typeof body.name === "string") scene.name = body.name.trim() || scene.name;
  if (typeof body.shortName === "string") scene.shortName = body.shortName.trim() || scene.shortName;
  if (typeof body.icon === "string") scene.icon = body.icon.trim() || scene.icon;
  if (typeof body.enabled === "boolean") scene.enabled = body.enabled;
  if (typeof body.price === "number" && Number.isFinite(body.price)) scene.price = Math.max(0, Math.round(body.price));
  if (typeof body.prompt === "string") scene.prompt = body.prompt;
  config.scenes[idx] = normalizeSceneConfig(scene);
  await writeAppConfig(config);
  return sendJson(res, 200, { ok: true, scene: config.scenes[idx] });
}

async function handleAdminCreateSceneEntry(req, res, sceneId) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const config = await readAppConfig();
  const idx = (config.scenes || []).findIndex((s) => s.id === sceneId);
  if (idx < 0) return sendJson(res, 404, { ok: false, message: "场景不存在。" });
  const body = await readJson(req);
  const nowIso = new Date().toISOString();
  const scene = normalizeSceneConfig(config.scenes[idx]);
  const entry = normalizeSceneEntry({
    id: makeSceneEntryId(),
    name: String(body.name || "新入口").trim() || "新入口",
    enabled: body.enabled !== false,
    createdAt: nowIso,
    updatedAt: nowIso,
  }, scene);
  scene.entries = [...scene.entries, entry];
  scene.updatedAt = nowIso;
  config.scenes[idx] = scene;
  await writeAppConfig(config);
  return sendJson(res, 200, { ok: true, scene, entry });
}

async function handleAdminUpdateSceneEntry(req, res, sceneId, entryId) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const config = await readAppConfig();
  const idx = (config.scenes || []).findIndex((s) => s.id === sceneId);
  if (idx < 0) return sendJson(res, 404, { ok: false, message: "场景不存在。" });
  const body = await readJson(req);
  const scene = normalizeSceneConfig(config.scenes[idx]);
  const entryIdx = scene.entries.findIndex((entry) => entry.id === entryId);
  if (entryIdx < 0) return sendJson(res, 404, { ok: false, message: "入口不存在。" });
  const entry = { ...scene.entries[entryIdx] };
  if (typeof body.name === "string") entry.name = body.name.trim().slice(0, 40) || entry.name;
  if (typeof body.enabled === "boolean") entry.enabled = body.enabled;
  entry.updatedAt = new Date().toISOString();
  scene.entries[entryIdx] = normalizeSceneEntry(entry, scene);
  scene.updatedAt = entry.updatedAt;
  config.scenes[idx] = scene;
  await writeAppConfig(config);
  return sendJson(res, 200, { ok: true, scene, entry: scene.entries[entryIdx] });
}

async function handleAdminListWalletOrders(req, res, url) {
  const auth = await requireAdmin(req, res, { loadDb: false });
  if (!auth) return;
  const paging = pagingFromUrl(url || new URL("http://localhost"), { defaultLimit: 20, maxLimit: 100 });
  const status = String((url || new URL("http://localhost")).searchParams.get("status") || "").trim().toLowerCase();
  const query = String((url || new URL("http://localhost")).searchParams.get("q") || "").trim().toLowerCase();
  if (dbEnabled()) {
    const result = await getAdminWalletOrdersPageFromDb({ page: paging.page, limit: paging.limit, queryText: query, status });
    if (result) {
      await hydrateStripeOrdersForAdmin(result.items, true);
      const userMap = new Map(result.items.map((o) => [o.userId, { username: o.username }]));
      return sendJson(res, 200, { ok: true, orders: result.items.map((o) => adminWalletOrderView(o, userMap)), page: result.page, limit: result.limit, total: result.total, totalPages: Math.max(1, Math.ceil(result.total / result.limit)) });
    }
  }
  const userMap = new Map((auth.db.users || []).map((u) => [u.id, u]));
  await hydrateStripeOrdersForAdmin(auth.db.walletOrders || [], false);
  let list = (auth.db.walletOrders || []).map((o) => adminWalletOrderView(o, userMap));
  if (status) list = list.filter((order) => String(order.status || "").toLowerCase() === status);
  if (query) {
    list = list.filter((order) => [order.id, order.username, order.userId, order.chain, order.network, order.address, order.transactionHash, order.paypalOrderId, order.stripeChargeId, order.stripeCustomerEmail, order.stripeCustomerName, order.stripeFailureMessage]
      .some((value) => String(value || "").toLowerCase().includes(query)));
  }
  list.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  const paged = pagedResponse(list, paging);
  return sendJson(res, 200, { ok: true, orders: paged.items, page: paged.page, limit: paged.limit, total: paged.total, totalPages: paged.totalPages });
}

async function handleAdminListRechargeLedger(req, res, url) {
  const auth = await requireAdmin(req, res, { loadDb: false });
  if (!auth) return;
  const paging = pagingFromUrl(url || new URL("http://localhost"), { defaultLimit: 20, maxLimit: 200 });
  const source = String((url || new URL("http://localhost")).searchParams.get("source") || "").trim().toLowerCase();
  const query = String((url || new URL("http://localhost")).searchParams.get("q") || "").trim().toLowerCase();
  const fromDate = dateFromQuery((url || new URL("http://localhost")).searchParams.get("from"), false);
  const toDate = dateFromQuery((url || new URL("http://localhost")).searchParams.get("to"), true);
  if (dbEnabled()) {
    const result = await getAdminRechargeLedgerPageFromDb({
      page: paging.page,
      limit: paging.limit,
      source,
      queryText: query,
      fromDate,
      toDate,
    });
    if (result) {
      const userMap = new Map();
      const totalPages = Math.max(1, Math.ceil(Number(result.total || 0) / paging.limit));
      const page = Math.min(paging.page, totalPages);
      return sendJson(res, 200, {
        ok: true,
        records: result.items.map((entry) => adminRechargeLedgerRecordView(entry, userMap)),
        summary: result.summary,
        page,
        limit: paging.limit,
        total: Number(result.total || 0),
        totalPages,
      });
    }
  }
  let list = adminRechargeLedgerRecords(auth.db);
  if (source) list = list.filter((entry) => String(entry.source || "").toLowerCase() === source);
  if (fromDate || toDate) {
    list = list.filter((entry) => recordInDateRange(entry.paidAt || entry.createdAt, fromDate, toDate));
  }
  if (query) {
    list = list.filter((entry) => [
      entry.id,
      entry.username,
      entry.userId,
      entry.sourceLabel,
      entry.paymentProvider,
      entry.network,
      entry.asset,
      entry.transactionHash,
      entry.paypalOrderId,
      entry.adminUsername,
      entry.note,
    ].some((value) => String(value || "").toLowerCase().includes(query)));
  }
  const summary = adminRechargeLedgerSummary(list);
  const paged = pagedResponse(list, paging);
  return sendJson(res, 200, {
    ok: true,
    records: paged.items,
    summary,
    page: paged.page,
    limit: paged.limit,
    total: paged.total,
    totalPages: paged.totalPages,
  });
}

async function handleAdminUpdateWalletOrder(req, res, orderId) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const order = (auth.db.walletOrders || []).find((o) => o.id === orderId);
  if (!order) return sendJson(res, 404, { ok: false, message: "订单不存在。" });
  const body = await readJson(req);
  if (typeof body.status === "string" && ["pending", "paid", "cancelled"].includes(body.status)) {
    if (body.status === "paid" && order.status !== "paid") {
      const config = await readAppConfig();
      await settleWalletOrderPayment(auth.db, order, config, { note: "Marked paid by admin." });
    } else {
      order.status = body.status;
      order.updatedAt = new Date().toISOString();
    }
  }
  if (typeof body.note === "string") order.note = body.note.slice(0, 200);
  await updateWalletOrderInDb(order);
  if (!dbEnabled()) await writeDb(auth.db);
  return sendJson(res, 200, { ok: true, order });
}

