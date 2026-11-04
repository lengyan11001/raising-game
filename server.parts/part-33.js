async function handleTelegramBotWebhook(req, res) {
  if (!undressToolRequestAllowed(req)) return sendJson(res, 404, { ok: false, message: "API not found." });
  if (!telegramBotEnabled()) return sendJson(res, 404, { ok: false, message: "Telegram Undress bot is not enabled." });
  const pathSecret = String(req.url || "").split("?")[0].split("/").pop() || "";
  const headerSecret = String(req.headers["x-telegram-bot-api-secret-token"] || "");
  if (pathSecret !== TELEGRAM_BOT_WEBHOOK_SECRET && headerSecret !== TELEGRAM_BOT_WEBHOOK_SECRET) {
    return sendJson(res, 403, { ok: false, message: "Invalid Telegram webhook secret." });
  }
  const update = await readJson(req);
  const updateId = Number(update.update_id || 0);
  if (updateId > 0) {
    const now = Date.now();
    for (const [id, seenAt] of telegramProcessedUpdateIds) {
      if (now - seenAt > 60 * 60 * 1000) telegramProcessedUpdateIds.delete(id);
    }
    if (telegramProcessedUpdateIds.has(updateId)) return sendJson(res, 200, { ok: true, duplicate: true });
    telegramProcessedUpdateIds.set(updateId, now);
  }
  try {
    await telegramBotClient.processUpdate(update, {
      onSupportMessage: (message) => persistTelegramBotSupportMessage(message),
      onCallbackQuery: (callbackQuery) => handleTelegramNativeCallback(callbackQuery),
      onMessage: async (message) => {
        const account = await ensureTelegramUserAccount(message.from || {});
        const nativeMedia = telegramNativeMediaDescriptor(message);
        if (nativeMedia) return handleTelegramNativeMedia(message, account.user);
        return handleTelegramNativeText(message, account.user);
      },
    });
  } catch (error) {
    if (updateId > 0) telegramProcessedUpdateIds.delete(updateId);
    throw error;
  }
  return sendJson(res, 200, { ok: true });
}

const telegramNativeChatStates = new Map();
const telegramProcessedUpdateIds = new Map();

function telegramNativeRequest(user, method = "GET", pathname = "/") {
  return {
    method,
    url: pathname,
    headers: {
      host: "undress.14vips.com",
      authorization: `Bearer ${String(user?.apiToken || "")}`,
      "x-forwarded-proto": "https",
    },
    socket: { encrypted: true },
  };
}

async function invokeTelegramJsonHandler(handler, user, { method = "GET", pathname = "/", body = {}, args = [] } = {}) {
  const request = telegramNativeRequest(user, method, pathname);
  const captured = captureJsonResponse();
  const prepared = method === "GET" ? request : withJsonBody(request, body);
  await handler(prepared, captured, ...args);
  return { statusCode: captured.statusCode, payload: capturedJsonPayload(captured) };
}

function telegramNativeMediaMime(filePath = "", fallback = "") {
  const extension = path.extname(String(filePath || "").split("?")[0]).toLowerCase();
  if ([".jpg", ".jpeg"].includes(extension)) return "image/jpeg";
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  if (extension === ".mp4") return "video/mp4";
  if (extension === ".mov") return "video/quicktime";
  if (extension === ".webm") return "video/webm";
  return String(fallback || "").toLowerCase().split(";")[0].trim();
}

function telegramNativeMediaDescriptor(message = {}) {
  if (Array.isArray(message.photo) && message.photo.length) {
    const photo = [...message.photo].sort((left, right) => Number(left.file_size || 0) - Number(right.file_size || 0))[message.photo.length - 1];
    return { fileId: String(photo?.file_id || ""), mime: "image/jpeg", fileName: `telegram-${Date.now()}.jpg`, kind: "image" };
  }
  if (message.video?.file_id) {
    return {
      fileId: String(message.video.file_id),
      mime: String(message.video.mime_type || "video/mp4"),
      fileName: String(message.video.file_name || `telegram-${Date.now()}.mp4`),
      kind: "video",
    };
  }
  if (message.document?.file_id) {
    const mime = telegramNativeMediaMime(message.document.file_name, message.document.mime_type);
    const kind = mime.startsWith("video/") ? "video" : mime.startsWith("image/") ? "image" : "";
    if (!kind) return null;
    return {
      fileId: String(message.document.file_id),
      mime,
      fileName: String(message.document.file_name || `telegram-${Date.now()}`),
      kind,
    };
  }
  return null;
}

function telegramNativeState(chatId = "") {
  const key = String(chatId || "").trim();
  if (!key) return null;
  const current = telegramNativeChatStates.get(key);
  if (current && Date.now() - Number(current.updatedAt || 0) < 30 * 60 * 1000) return current;
  const next = { updatedAt: Date.now(), waitingFor: "", generationType: "", orderId: "" };
  telegramNativeChatStates.set(key, next);
  return next;
}

function clearTelegramNativeState(chatId = "") {
  const state = telegramNativeState(chatId);
  if (!state) return;
  state.waitingFor = "";
  state.generationType = "";
  state.orderId = "";
  state.updatedAt = Date.now();
}

function telegramNativePublicUrl(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";
  return publicUrlForAssetPath(text) || (isPublicHttpUrl(text) ? text : "");
}

function telegramNativeTaskLinks(record = {}) {
  const values = [
    record.videoUrl,
    record.imageResultUrl,
    record.downloadUrl,
    record.cdnVideoUrl,
    record.localVideoUrl,
    record.cdnImageUrl,
    record.localImageUrl,
  ];
  return [...new Set(values.map(telegramNativePublicUrl).filter(Boolean))];
}

function telegramNativeModeLabel(generationType = "") {
  return generationType === "video" ? "Video" : generationType === "image_video" ? "Image to Video" : "Image";
}

async function sendTelegramNativeCreateMenu(chatId) {
  return telegramBotClient.sendMessage(chatId, "Choose a generation type, then send the requested media.", {
    reply_markup: telegramBotClient.createMarkup(),
  });
}

async function requireApiDocsAccess(req, res) {
  if (!apiAccessEnabledForRequest(req)) {
    sendApiAccessDisabled(res);
    return null;
  }
  const auth = await requireUser(req, res);
  if (!auth) return null;
  if (!userHasApiDocsAccess(auth.user)) {
    sendJson(res, 402, {
      ok: false,
      code: "API_DOCS_PURCHASE_REQUIRED",
      message: "Purchase API Documentation Access to view the integration guide.",
      product: {
        id: API_DOCS_PRODUCT_ID,
        amount: API_DOCS_PRICE_USD,
        currency: "USD",
        includedCredits: API_DOCS_TEST_CREDITS,
      },
    });
    return null;
  }
  return auth;
}

// External API calls require the purchased API documentation entitlement;
// session-authenticated site requests continue to use the frontend normally.
async function requireExternalApiDocsAccess(req, res) {
  if (!apiAccessEnabledForRequest(req)) {
    sendApiAccessDisabled(res);
    return null;
  }
  const auth = await requireUser(req, res);
  if (!auth) return null;
  const tokenSource = String(auth.tokenSource || "").toLowerCase();
  if ((tokenSource === "api_token" || tokenSource === "subtoken") && !userHasApiDocsAccess(auth.user)) {
    sendJson(res, 402, {
      ok: false,
      code: "API_DOCS_ACCESS_REQUIRED",
      message: "API documentation access is required for external API calls.",
      product: {
        id: API_DOCS_PRODUCT_ID,
        amount: API_DOCS_PRICE_USD,
        currency: "USD",
        includedCredits: API_DOCS_TEST_CREDITS,
      },
    });
    return null;
  }
  return auth;
}

async function sendTelegramNativeRechargeMenu(chatId, user, paymentMethod = "stripe") {
  const method = String(paymentMethod || "").trim().toLowerCase() === "usdt" ? "usdt" : "stripe";
  const plan = await getBillingPlanInDb(UNDRESS_TOOL_TENANT_ID);
  const packages = toolTopupPackagesForPlan(plan);
  return telegramBotClient.sendMessage(
    chatId,
    `Recharge\nCurrent balance: ${Number(user?.credits || 0).toFixed(2)} credits\nPayment: ${method === "stripe" ? "Stripe" : "USDT"}\nChoose a package:`,
    { reply_markup: telegramBotClient.rechargeMarkup(packages, method) },
  );
}

async function sendTelegramNativeHistory(chatId, user) {
  const records = await listGenerationRecordsForUser(user.id, 12);
  if (!records.length) return telegramBotClient.sendMessage(chatId, "No generation records yet.");
  for (const record of records) {
    let latest = record;
    try {
      await invokeTelegramJsonHandler(handleGetGenerationRecord, user, {
        method: "GET",
        pathname: `/api/generation-records/${encodeURIComponent(record.taskId)}`,
        args: [record.taskId],
      });
      latest = await getGenerationRecord(record.taskId) || record;
    } catch (error) {
      console.warn("[telegram-history-refresh-failed]", record.taskId, error.message || error);
    }
    const view = publicGenerationRecord(latest, {
      preferProviderVideoUrl: false,
      providerOnlyVideoUrl: false,
      includeStoredVideoUrls: true,
      providerOnlyImageUrl: false,
      includeStoredImageUrls: true,
      includeLockedMedia: true,
    });
    const stage = telegramStatusStage(view.status);
    const lines = [`${telegramNativeModeLabel(latest.telegramGenerationType || latest.params?.generationType || "")} · ${stage}`, `Task: ${view.taskId}`];
    if (stage === "failed") lines.push(`Error: ${String(view.error || "Generation failed.").slice(0, 400)}`);
    if (view.resultLocked === true) {
      lines.push(`Unlock: ${Number(view.unlockCredits || 0).toFixed(2)} credits`);
      await telegramBotClient.sendMessage(chatId, lines.join("\n"), {
        reply_markup: { inline_keyboard: [[{ text: "Unlock result", callback_data: `tg:unlock:${view.taskId}` }]] },
      });
      continue;
    }
    const links = telegramNativeTaskLinks(view);
    if (links.length) lines.push(...links);
    await telegramBotClient.sendMessage(chatId, lines.join("\n"));
  }
}

async function telegramNativeGenerate(user, chatId, asset, generationType) {
  const result = await invokeTelegramJsonHandler(handleUndressToolGenerate, user, {
    method: "POST",
    pathname: "/api/undress-tool/generate",
    body: { assetId: asset.id, generationType },
  });
  if (result.statusCode >= 400 || !result.payload?.taskId) {
    const error = new Error(result.payload?.message || "Generation submission failed.");
    error.statusCode = result.statusCode || 400;
    error.payload = result.payload;
    throw error;
  }
  await upsertGenerationRecord({
    taskId: result.payload.taskId,
    telegramChatId: String(chatId || ""),
    telegramSource: "telegram-bot",
    telegramGenerationType: generationType,
  });
  return result.payload;
}

async function handleTelegramNativeMedia(message, user) {
  const chatId = String(message.chat?.id || "");
  const state = telegramNativeState(chatId);
  const descriptor = telegramNativeMediaDescriptor(message);
  if (!descriptor) return false;
  if (!state?.waitingFor) {
    await telegramBotClient.sendMessage(chatId, "Choose Create first, then send an image or video.");
    return true;
  }
  const expectedKind = state.waitingFor === "video" ? "video" : "image";
  if (descriptor.kind !== expectedKind) {
    await telegramBotClient.sendMessage(chatId, expectedKind === "video" ? "Please send a video for this mode." : "Please send an image for this mode.");
    return true;
  }
  try {
    await telegramBotClient.sendMessage(chatId, "Uploading your media...");
    const downloaded = await telegramBotClient.downloadFile(descriptor.fileId, { maxBytes: 20 * 1024 * 1024 });
    const mime = descriptor.mime.startsWith(`${descriptor.kind}/`) ? descriptor.mime : telegramNativeMediaMime(downloaded.filePath, downloaded.mime);
    const asset = await createUserMediaAssetFromBytes((await readDb()), user, {
      bytes: downloaded.bytes,
      mime: mime || (descriptor.kind === "video" ? "video/mp4" : "image/jpeg"),
      name: `Telegram ${descriptor.kind}`,
      fileName: descriptor.fileName,
      maxBytes: descriptor.kind === "video" ? MEDIA_UPLOAD_MAX_BYTES : IMAGE_UPLOAD_MAX_BYTES,
    });
    const generationType = state.generationType || (descriptor.kind === "video" ? "video" : "image");
    const payload = await telegramNativeGenerate(user, chatId, asset, generationType);
    clearTelegramNativeState(chatId);
    await telegramBotClient.sendMessage(chatId, `Submitted\nTask: ${payload.taskId}\nProgress will be sent here.`);
  } catch (error) {
    await telegramBotClient.sendMessage(chatId, String(error.message || "Upload or generation failed.").slice(0, 700), {
      reply_markup: error.statusCode === 402
        ? { inline_keyboard: [[{ text: "Recharge", callback_data: "tg:recharge" }]] }
        : telegramBotClient.menuMarkup(),
    });
  }
  return true;
}

async function telegramNativeCreatePayPalOrder(user, chatId, packageId) {
  const returnUrl = telegramBotClient.miniAppUrl("topups");
  const result = await invokeTelegramJsonHandler(createPayPalCheckoutSession, user, {
    method: "POST",
    pathname: "/api/pay/paypal/checkout-sessions",
    body: { packageId, returnUrl, cancelUrl: returnUrl },
  });
  if (result.statusCode >= 400 || !result.payload?.checkoutUrl) {
    throw new Error(result.payload?.message || "Unable to create a PayPal recharge order.");
  }
  const order = result.payload.order || result.payload.session?.order || {};
  const lines = [
    "PayPal recharge",
    `Pay: ${order.payableAmountText || order.payableAmount || order.amount} ${order.asset || "USD"}`,
    `Credits after payment: ${Number(order.creditAmount || 0).toFixed(2)}`,
    `Order: ${order.id || ""}`,
    "Tap the button below to continue on the secure payment page.",
  ];
  return telegramBotClient.sendMessage(chatId, lines.join("\n"), {
    reply_markup: {
      inline_keyboard: [
        [{ text: "Continue to PayPal", url: result.payload.checkoutUrl }],
        [{ text: "Use USDT instead", callback_data: `tg:topup:usdt:${String(packageId).slice(0, 48)}` }],
      ],
    },
  });
}

async function telegramNativeCreateUsdtOrder(user, chatId, packageId) {
  const result = await invokeTelegramJsonHandler(handleCreatePaymentOrder, user, {
    method: "POST",
    pathname: "/api/pay/orders",
    body: { packageId },
  });
  if (result.statusCode >= 400 || !result.payload?.order) {
    throw new Error(result.payload?.message || "Unable to create a recharge order.");
  }
  const order = result.payload.order;
  const lines = [
    "USDT recharge",
    `Pay: ${order.payableAmountText || order.payableAmount} ${order.asset || "USDT"}`,
    `Network: ${order.network || order.chain || ""}`,
    `Address: ${order.address || ""}`,
    `Credits after payment: ${Number(order.creditAmount || 0).toFixed(2)}`,
    `Order: ${order.id}`,
    "After payment, tap the button and send the transaction hash.",
  ];
  const markup = { inline_keyboard: [[{ text: "I paid / submit hash", callback_data: `tg:order:confirm:${order.id}` }]] };
  await telegramBotClient.sendMessage(chatId, lines.join("\n"), { reply_markup: markup });
  const qrUrl = telegramNativePublicUrl(order.qrUrl);
  if (qrUrl) await telegramBotClient.sendPhoto(chatId, qrUrl, `Scan to pay ${order.payableAmountText || order.payableAmount} ${order.asset || "USDT"}`).catch(() => {});
}

async function telegramNativeCreateStripeOrder(user, chatId, packageId) {
  const returnUrl = telegramBotClient.miniAppUrl("topups");
  const result = await invokeTelegramJsonHandler(createStripeCheckoutSession, user, {
    method: "POST",
    pathname: "/api/pay/stripe/checkout-sessions",
    body: { packageId, returnUrl, cancelUrl: returnUrl },
  });
  if (result.statusCode >= 400 || !result.payload?.checkoutUrl) {
    throw new Error(result.payload?.message || "Unable to create a Stripe recharge order.");
  }
  const order = result.payload.order || {};
  const lines = [
    "Stripe recharge",
    `Pay: ${order.payableAmountText || order.payableAmount || order.amount} ${order.currency || "USD"}`,
    `Credits after payment: ${Number(order.creditAmount || 0).toFixed(2)}`,
    `Order: ${order.id || ""}`,
    "Tap the button below to continue on the secure payment page.",
  ];
  return telegramBotClient.sendMessage(chatId, lines.join("\n"), {
    reply_markup: {
      inline_keyboard: [
        [{ text: "Continue to Stripe", url: result.payload.checkoutUrl }],
        [{ text: "Use USDT instead", callback_data: `tg:topup:usdt:${String(packageId).slice(0, 48)}` }],
      ],
    },
  });
}

async function telegramNativeCreateOrder(user, chatId, packageId, paymentMethod = "stripe") {
  if (String(paymentMethod || "").trim().toLowerCase() === "usdt") {
    return telegramNativeCreateUsdtOrder(user, chatId, packageId);
  }
  return telegramNativeCreateStripeOrder(user, chatId, packageId);
}

async function handleTelegramNativeText(message, user) {
  const chatId = String(message.chat?.id || "");
  const text = String(message.text || "").trim();
  const lower = text.toLowerCase();
  const state = telegramNativeState(chatId);
  if (state?.waitingFor === "payment_hash" && text && !lower.startsWith("/")) {
    try {
      const result = await invokeTelegramJsonHandler(handleConfirmPaymentOrder, user, {
        method: "POST",
        pathname: `/api/pay/orders/${encodeURIComponent(state.orderId)}/confirm`,
        body: { transactionHash: text },
        args: [state.orderId],
      });
      if (result.statusCode >= 400) throw new Error(result.payload?.message || "Transaction hash was not accepted.");
      clearTelegramNativeState(chatId);
      await telegramBotClient.sendMessage(chatId, "Transaction hash received. The order will be credited after verification.", { reply_markup: telegramBotClient.menuMarkup() });
    } catch (error) {
      await telegramBotClient.sendMessage(chatId, String(error.message || "Invalid transaction hash.").slice(0, 500));
    }
    return true;
  }
  if (["create", "/create"].includes(lower)) {
    await sendTelegramNativeCreateMenu(chatId);
    return true;
  }
  if (["history", "/history"].includes(lower)) {
    await sendTelegramNativeHistory(chatId, user);
    return true;
  }
  if (["recharge", "/recharge", "topup", "/topup"].includes(lower)) {
    await sendTelegramNativeRechargeMenu(chatId, user);
    return true;
  }
  if (["my", "/me", "/account"].includes(lower)) {
    await telegramBotClient.sendMessage(chatId, `Telegram account\nUser ID: ${user.telegramUserId}\nBalance: ${Number(user.credits || 0).toFixed(2)} credits`, { reply_markup: telegramBotClient.menuMarkup() });
    return true;
  }
  if (lower === "cancel") {
    clearTelegramNativeState(chatId);
    await telegramBotClient.sendStart(chatId);
    return true;
  }
  return false;
}

async function handleTelegramNativeCallback(callbackQuery) {
  const chatId = String(callbackQuery.message?.chat?.id || callbackQuery.from?.id || "");
  const account = await ensureTelegramUserAccount(callbackQuery.from || {});
  const user = account.user;
  const data = String(callbackQuery.data || "").trim();
  if (data === "tg:create") {
    await sendTelegramNativeCreateMenu(chatId);
    return;
  }
  const mode = data.match(/^tg:create:(image|image_video|video)$/)?.[1] || "";
  if (mode) {
    const state = telegramNativeState(chatId);
    state.generationType = mode;
    state.waitingFor = mode === "video" ? "video" : "image";
    state.updatedAt = Date.now();
    await telegramBotClient.sendMessage(chatId, mode === "video" ? "Send one video." : "Send one image.", { reply_markup: telegramBotClient.menuMarkup() });
    return;
  }
  if (data === "tg:recharge") {
    await sendTelegramNativeRechargeMenu(chatId, user);
    return;
  }
  const paymentMethod = data.match(/^tg:payment:(stripe|usdt)$/i)?.[1]?.toLowerCase() || "";
  if (paymentMethod) {
    await sendTelegramNativeRechargeMenu(chatId, user, paymentMethod);
    return;
  }
  const packageMatch = data.match(/^tg:topup:(stripe|usdt):([a-z0-9_-]+)$/i);
  const legacyPackageId = data.match(/^tg:topup:([a-z0-9_-]+)$/i)?.[1] || "";
  const packageId = packageMatch?.[2] || legacyPackageId;
  if (packageId) {
    try {
      await telegramNativeCreateOrder(user, chatId, packageId, packageMatch?.[1] || "stripe");
    } catch (error) {
      await telegramBotClient.sendMessage(chatId, String(error.message || "Unable to create a recharge order.").slice(0, 500));
    }
    return;
  }
  const orderId = data.match(/^tg:order:confirm:([a-z0-9_-]+)$/i)?.[1] || "";
  if (orderId) {
    const state = telegramNativeState(chatId);
    state.waitingFor = "payment_hash";
    state.orderId = orderId;
    state.updatedAt = Date.now();
    await telegramBotClient.sendMessage(chatId, "Send the transaction hash for this order.");
    return;
  }
  const taskId = data.match(/^tg:unlock:(.+)$/i)?.[1] || "";
  if (taskId) {
    const result = await invokeTelegramJsonHandler(handleUnlockUndressToolResult, user, {
      method: "POST",
      pathname: `/api/undress-tool/tasks/${encodeURIComponent(taskId)}/unlock`,
      args: [taskId],
    });
    if (result.statusCode >= 400) {
      await telegramBotClient.sendMessage(chatId, String(result.payload?.message || "Unable to unlock this result.").slice(0, 500), {
        reply_markup: result.statusCode === 402 ? { inline_keyboard: [[{ text: "Recharge", callback_data: "tg:recharge" }]] } : undefined,
      });
      return;
    }
    const record = result.payload.record || await getGenerationRecord(taskId);
    const links = telegramNativeTaskLinks(publicGenerationRecord(record || {}, { includeLockedMedia: true, includeStoredVideoUrls: true, includeStoredImageUrls: true }));
    await telegramBotClient.sendMessage(chatId, links.length ? `Unlocked\n${links.join("\n")}` : "Unlocked, but the result link is not ready yet.");
  }
}

async function telegramUserContextForGeneration(record = {}) {
  if (recordTenantId(record) !== UNDRESS_TOOL_TENANT_ID || !record.userId || !TELEGRAM_BOT_TOKEN) return null;
  const cached = telegramUserContextCache.get(record.userId);
  if (cached && cached.expiresAt > Date.now()) return cached.user;
  const dbUser = await getUserByIdInDb(record.userId);
  const db = dbUser ? null : await readDb();
  const user = dbUser || (db?.users || []).find((item) => item.id === record.userId) || null;
  if (!user || recordTenantId(user) !== UNDRESS_TOOL_TENANT_ID || !user.telegramChatId) return null;
  telegramUserContextCache.set(record.userId, { user, expiresAt: Date.now() + 60000 });
  return user;
}

async function notifyTelegramGenerationRecord(record = {}) {
  if (!TELEGRAM_BOT_TOKEN || !telegramBotClient.enabled || !record?.taskId) return;
  if (String(record.telegramSource || record.params?.telegramSource || "") !== "telegram-bot") return;
  const user = await telegramUserContextForGeneration(record);
  if (!user?.telegramChatId) return;
  const stage = telegramStatusStage(record.status);
  const key = String(record.taskId);
  if (telegramTaskNotificationStages.get(key) === stage) return;
  try {
    if (stage === "processing") {
      await telegramBotClient.sendMessage(user.telegramChatId, `Generation in progress\nTask: ${key}`);
    } else if (stage === "failed") {
      await telegramBotClient.sendMessage(user.telegramChatId, `Generation failed\nTask: ${key}\n${String(record.error || "Generation failed.").slice(0, 600)}`);
    } else if (stage === "completed") {
      const latest = await getGenerationRecord(key) || record;
      const view = publicGenerationRecord(latest, {
        preferProviderVideoUrl: false,
        providerOnlyVideoUrl: false,
        includeStoredVideoUrls: true,
        providerOnlyImageUrl: false,
        includeStoredImageUrls: true,
        includeLockedMedia: true,
      });
      if (view.resultLocked === true) {
        const previewUrl = telegramNativePublicUrl(view.lockedPreviewUrl);
        const markup = { inline_keyboard: [[{ text: "Unlock result", callback_data: `tg:unlock:${key}` }]] };
        if (previewUrl) {
          await telegramBotClient.sendPhoto(user.telegramChatId, previewUrl, `Generation complete\nUnlock for ${Number(view.unlockCredits || 0).toFixed(2)} credits`, { reply_markup: markup });
        } else {
          await telegramBotClient.sendMessage(user.telegramChatId, `Generation complete\nUnlock for ${Number(view.unlockCredits || 0).toFixed(2)} credits`, { reply_markup: markup });
        }
      } else {
        const links = telegramNativeTaskLinks(view);
        await telegramBotClient.sendMessage(user.telegramChatId, links.length ? `Generation complete\n${links.join("\n")}` : `Generation complete\nTask: ${key}`);
      }
    } else {
      await telegramBotClient.sendMessage(user.telegramChatId, `Generation status: ${stage}\nTask: ${key}`);
    }
    telegramTaskNotificationStages.set(key, stage);
  } catch (error) {
    console.warn("[telegram-generation-notify-failed]", key, error.message || error);
  }
}

let telegramGenerationScanRunning = false;
async function scanTelegramGenerationNotifications() {
  if (telegramGenerationScanRunning || !TELEGRAM_BOT_TOKEN || !telegramBotClient.enabled) return;
  telegramGenerationScanRunning = true;
  try {
    const records = (await readGenerationRecords())
      .filter((record) => recordTenantId(record) === UNDRESS_TOOL_TENANT_ID && record.userId && !record.deletedAt)
      .sort((left, right) => String(right.updatedAt || right.createdAt || "").localeCompare(String(left.updatedAt || left.createdAt || "")))
      .slice(0, 60);
    for (const record of records) {
      await notifyTelegramGenerationRecord(record);
    }
  } catch (error) {
    console.warn("[telegram-generation-scan-failed]", error.message || error);
  } finally {
    telegramGenerationScanRunning = false;
  }
}

async function handleReferralSummary(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  await ensureCreatorMembershipFromReferrals(auth.db, auth.user);
  await grantPendingReferralRewardsForMember(auth.db, auth.user);
  if (!dbEnabled()) await writeDb(auth.db);
  return sendJson(res, 200, {
    ok: true,
    referral: publicReferralSummary(req, auth.db, auth.user),
    user: userView(auth.user),
  });
}

function normalizeMembershipActivationCode(value = "") {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function membershipActivationCodeHash(value = "") {
  return crypto.createHash("sha256").update(normalizeMembershipActivationCode(value)).digest("hex");
}

function makeMembershipActivationCode() {
  const body = crypto.randomBytes(9).toString("base64url").toUpperCase().replace(/[^A-Z0-9]/g, "").padEnd(12, "X").slice(0, 12);
  return `VIP-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}`;
}

async function handleRedeemMembershipActivationCode(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const tenant = requestTenantDescriptor(req);
  if (!tenant.membershipProgram) {
    return sendJson(res, 404, { ok: false, code: "MEMBERSHIP_DISABLED", message: "Creator Membership is not available on this site." });
  }
  if (userHasCreatorMembership(auth.user)) {
    return sendJson(res, 200, { ok: true, alreadyActive: true, membership: publicCreatorMembership(auth.user), user: userView(auth.user) });
  }
  const body = await readJson(req);
  const normalizedCode = normalizeMembershipActivationCode(body.code || body.activationCode || "");
  if (normalizedCode.length < 10) {
    return sendJson(res, 400, { ok: false, code: "ACTIVATION_CODE_INVALID", message: "Enter a valid membership activation code." });
  }
  try {
    const redemption = await redeemMembershipActivationCodeInDb({
      tenantId: tenant.tenantId,
      codeHash: membershipActivationCodeHash(normalizedCode),
      userId: auth.user.id,
      redemptionId: randomId("membership-redemption"),
    });
    await activateCreatorMembership(auth.db, auth.user, {
      source: "activation_code",
      codeId: redemption.code?.id || "",
    });
    await grantPendingReferralRewardsForMember(auth.db, auth.user);
    return sendJson(res, 200, {
      ok: true,
      alreadyRedeemed: Boolean(redemption.alreadyRedeemed),
      membership: publicCreatorMembership(auth.user),
      user: userView(auth.user),
    });
  } catch (error) {
    return sendJson(res, error.statusCode || 400, {
      ok: false,
      code: error.code || "ACTIVATION_CODE_FAILED",
      message: error.message || "Activation code could not be redeemed.",
    });
  }
}

async function handleAdminListMembershipActivationCodes(req, res, url) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const paging = pagingFromUrl(url || new URL("http://localhost"), { defaultLimit: 30, maxLimit: 200 });
  const status = String(url?.searchParams?.get("status") || "").trim();
  const search = String(url?.searchParams?.get("q") || "").trim();
  const result = await listMembershipActivationCodesInDb(DEFAULT_TENANT_ID, {
    limit: paging.limit,
    offset: paging.offset,
    status,
    search,
  });
  return sendJson(res, 200, {
    ok: true,
    codes: result.items,
    page: paging.page,
    limit: paging.limit,
    total: result.total,
    totalPages: Math.max(1, Math.ceil(result.total / paging.limit)),
  });
}

async function handleAdminCreateMembershipActivationCodes(req, res) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const body = await readJson(req);
  const count = Math.max(1, Math.min(100, Math.trunc(Number(body.count || 1) || 1)));
  const maxRedemptions = Math.max(1, Math.min(10000, Math.trunc(Number(body.maxRedemptions || 1) || 1)));
  const notes = String(body.notes || "").trim().slice(0, 500);
  let expiresAt = "";
  if (body.expiresAt) {
    const parsed = Date.parse(body.expiresAt);
    if (!Number.isFinite(parsed) || parsed <= Date.now()) {
      return sendJson(res, 400, { ok: false, code: "INVALID_EXPIRY", message: "Expiration must be a future date." });
    }
    expiresAt = new Date(parsed).toISOString();
  }
  const now = new Date().toISOString();
  const rawCodes = Array.from({ length: count }, () => makeMembershipActivationCode());
  const created = await createMembershipActivationCodesInDb(rawCodes.map((code) => ({
    id: randomId("membership-code"),
    tenantId: DEFAULT_TENANT_ID,
    codeHash: membershipActivationCodeHash(code),
    code,
    codePrefix: code.slice(0, 9),
    expiresAt,
    maxRedemptions,
    notes,
    createdByUserId: auth.user.id,
    createdAt: now,
  })));
  return sendJson(res, 200, {
    ok: true,
    codes: created,
  });
}

async function handleAdminUpdateMembershipActivationCode(req, res, codeId) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const body = await readJson(req);
  const status = String(body.status || "").trim().toLowerCase();
  if (!["active", "disabled"].includes(status)) {
    return sendJson(res, 400, { ok: false, code: "INVALID_STATUS", message: "Status must be active or disabled." });
  }
  const code = await setMembershipActivationCodeStatusInDb(codeId, DEFAULT_TENANT_ID, status);
  if (!code) return sendJson(res, 404, { ok: false, code: "ACTIVATION_CODE_NOT_FOUND", message: "Activation code not found." });
  return sendJson(res, 200, { ok: true, code });
}

async function handleCreateSupportMessage(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  if (!dbEnabled()) return sendJson(res, 503, { ok: false, code: "DATABASE_REQUIRED", message: "问题反馈需要数据库服务。" });
  const body = await readJson(req);
  const email = String(body.email || auth.user.email || "").trim();
  const message = String(body.message || "").trim().slice(0, 5000);
  const subject = String(body.subject || "").trim().slice(0, 120);
  if (!message) {
    return sendJson(res, 400, { ok: false, message: "请填写问题描述。" });
  }
  const source = ["live feedback", "site form", "telegram"].includes(String(body.source || "").trim().toLowerCase())
    ? String(body.source || "").trim().toLowerCase()
    : "live feedback";
  const now = new Date().toISOString();
  const record = {
    id: randomId("support"),
    userId: auth.user.id,
    username: auth.user.username || "",
    email,
    subject,
    message,
    status: "open",
    reply: "",
    repliedAt: "",
    repliedBy: "",
    source,
    createdAt: now,
    updatedAt: now,
  };
  const saved = await createUserSupportMessageInDb(record);
  return sendJson(res, 200, { ok: true, messageRecord: supportMessageView(saved || record) });
}

async function handleListUserSupportMessages(req, res, url) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  if (!dbEnabled()) return sendJson(res, 503, { ok: false, code: "DATABASE_REQUIRED", message: "问题反馈需要数据库服务。" });
  const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit") || 30)));
  const records = await listUserSupportMessagesInDb(auth.user.id, limit);
  return sendJson(res, 200, {
    ok: true,
    messages: (records || []).map((record) => supportMessageView(record, new Map([[auth.user.id, auth.user]]))),
  });
}

const LIVE_DAILY_CHECKIN_CREDITS = 20;
const LIVE_DAILY_TASKS = Object.freeze([
  { key: "checkin", title: "每日签到", reward: 20, hint: "连签可得 20 积分", description: "每天来看看，连签不断", action: "立即领取", completed: true },
  { key: "text", title: "文字聊天", reward: 10, hint: "完成领 10 积分", description: "和 Ta 发几条消息", action: "去聊天", href: "text-chat" },
  { key: "video", title: "视频通话", reward: 50, hint: "完成领 50 积分", description: "和 Ta 视频 1 分钟", action: "去聊天", href: "video-call" },
  { key: "live", title: "观看直播", reward: 15, hint: "完成领 15 积分", description: "在直播间看 1 分钟", action: "去观看", href: "rooms" },
  { key: "create", title: "创建角色", reward: 20, hint: "完成领 20 积分", description: "创建一个人物角色", action: "去创建", href: "create" },
  { key: "invite", title: "邀请好友", reward: 0, hint: "双方都有礼物", description: "邀请朋友一起来", action: "去邀请", href: "referral" },
]);
const LIVE_DAILY_TASK_LEDGER_TYPES = Object.freeze({
  checkin: "live_daily_checkin",
  text: "live_daily_task_text",
  video: "live_daily_task_video",
  live: "live_daily_task_live",
  create: "live_daily_task_create",
});

function liveDailyTaskDayRange(taskDate = "") {
  const [year, month, day] = String(taskDate || "").split("-").map(Number);
  if (!year || !month || !day) throw new Error("每日任务日期无效。");
  const start = new Date(year, month - 1, day, 0, 0, 0, 0);
  const end = new Date(year, month - 1, day + 1, 0, 0, 0, 0);
  return { startAt: start.toISOString(), endAt: end.toISOString() };
}

function liveDailyTaskConfig(taskKey = "") {
  return LIVE_DAILY_TASKS.find((item) => item.key === String(taskKey || "")) || null;
}

async function liveDailyTaskView(userId, taskDate) {
  const [claims, completion, checkinSummary] = await Promise.all([
    getLiveDailyTaskClaimsInDb(userId, taskDate),
    getLiveDailyTaskCompletionInDb({ userId, ...liveDailyTaskDayRange(taskDate) }),
    getLiveCheckinInDb(userId, taskDate),
  ]);
  const claimByKey = new Map((claims || []).map((item) => [String(item.taskKey || ""), item]));
  const legacyCheckin = checkinSummary && !claimByKey.has("checkin") ? checkinSummary : null;
  const tasks = LIVE_DAILY_TASKS.map((task) => {
    const claim = claimByKey.get(task.key) || (task.key === "checkin" ? legacyCheckin : null);
    const claimed = Boolean(claim);
    return {
      ...task,
      completed: task.key === "checkin" || task.key === "invite" ? task.completed === true : completion?.[task.key] === true,
      claimed,
      claimable: !claimed && task.reward > 0 && (task.key === "checkin" || completion?.[task.key] === true),
      claimedAt: claim?.createdAt || "",
    };
  });
  const earnedCredits = tasks.reduce((sum, task) => sum + (task.claimed ? Number(task.reward || 0) : 0), 0);
  return {
    taskDate,
    credits: LIVE_DAILY_CHECKIN_CREDITS,
    todayEarned: earnedCredits,
    totalTasks: tasks.length,
    claimedTasks: tasks.filter((task) => task.claimed).length,
    tasks,
  };
}

async function handleListLiveNotifications(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  if (!dbEnabled()) return sendJson(res, 503, { ok: false, code: "DATABASE_REQUIRED", message: "系统消息需要数据库服务。" });
  const notifications = await listLiveNotificationsInDb(auth.user.id);
  return sendJson(res, 200, {
    ok: true,
    notifications,
    unreadCount: notifications.filter((item) => !item.readAt).length,
  });
}

async function handleReadLiveNotification(req, res, notificationId) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  if (!dbEnabled()) return sendJson(res, 503, { ok: false, code: "DATABASE_REQUIRED", message: "系统消息需要数据库服务。" });
  const notification = await markLiveNotificationReadInDb(auth.user.id, notificationId);
  if (!notification) return sendJson(res, 404, { ok: false, message: "消息不存在。" });
  return sendJson(res, 200, { ok: true, notification });
}

async function handleReadAllLiveNotifications(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  if (!dbEnabled()) return sendJson(res, 503, { ok: false, code: "DATABASE_REQUIRED", message: "系统消息需要数据库服务。" });
  const count = await markAllLiveNotificationsReadInDb(auth.user.id);
  return sendJson(res, 200, { ok: true, count });
}

async function handleGetLiveCheckin(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  if (!dbEnabled()) return sendJson(res, 503, { ok: false, code: "DATABASE_REQUIRED", message: "每日积分任务需要数据库服务。" });
  const taskDate = localDayKey(new Date());
  const checkin = await liveDailyTaskView(auth.user.id, taskDate);
  return sendJson(res, 200, { ok: true, checkin, user: userView(auth.user) });
}

async function handleListLiveCheckinHistory(req, res, url) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  if (!dbEnabled()) return sendJson(res, 503, { ok: false, code: "DATABASE_REQUIRED", message: "签到记录需要数据库服务。" });
  const { page, limit } = pagingFromUrl(url, { defaultLimit: 10, maxLimit: 100 });
  const result = await getLiveCheckinHistoryPageFromDb({ userId: auth.user.id, page, limit });
  if (!result) return sendJson(res, 503, { ok: false, code: "DATABASE_REQUIRED", message: "签到记录需要数据库服务。" });
  return sendJson(res, 200, {
    ok: true,
    records: result.items.map((item) => ({
      ...item,
      taskTitle: liveDailyTaskConfig(item.taskKey)?.title || item.taskTitle || "每日奖励",
    })),
    total: result.total,
    page: result.page,
    limit: result.limit,
    totalPages: result.totalPages,
  });
}

async function handleCreateLiveCheckin(req, res) {
  return handleClaimLiveDailyTask(req, res, "checkin");
}

async function handleClaimLiveDailyTask(req, res, taskKey = "") {
  const auth = await requireUser(req, res);
  if (!auth) return;
  if (!dbEnabled()) return sendJson(res, 503, { ok: false, code: "DATABASE_REQUIRED", message: "每日积分任务需要数据库服务。" });
  const task = liveDailyTaskConfig(taskKey);
  if (!task) return sendJson(res, 404, { ok: false, code: "LIVE_DAILY_TASK_NOT_FOUND", message: "每日任务不存在。" });
  if (task.reward <= 0) return sendJson(res, 400, { ok: false, code: "LIVE_DAILY_TASK_NOT_CLAIMABLE", message: "该任务没有可领取的积分。" });
  const taskDate = localDayKey(new Date());
  const completion = task.key === "checkin" ? true : (await getLiveDailyTaskCompletionInDb({ userId: auth.user.id, ...liveDailyTaskDayRange(taskDate) }))?.[task.key] === true;
  if (!completion) return sendJson(res, 409, { ok: false, code: "LIVE_DAILY_TASK_INCOMPLETE", message: `完成「${task.title}」后才能领取积分。` });
  const result = await createLiveDailyTaskClaimWithCreditInDb({
    id: randomId("daily-task"),
    userId: auth.user.id,
    taskDate,
    taskKey: task.key,
    credits: task.reward,
    ledgerId: `live-daily-task-ledger-${auth.user.id}-${taskDate}-${task.key}`,
    ledgerType: LIVE_DAILY_TASK_LEDGER_TYPES[task.key],
    ledgerMeta: { userId: auth.user.id, username: auth.user.username || "", taskDate, taskKey: task.key, taskTitle: task.title },
    payload: { taskTitle: task.title, reward: task.reward },
  });
  const user = result?.user || auth.user;
  return sendJson(res, 200, {
    ok: true,
    alreadyClaimed: result?.inserted === false,
    awardedCredits: result?.inserted ? task.reward : 0,
    taskKey: task.key,
    claim: result?.claim || null,
    user: userView(user),
  });
}
async function handleGetLiveCreatorIncome(req, res, url) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  if (!dbEnabled()) return sendJson(res, 503, { ok: false, code: "DATABASE_REQUIRED", message: "创作者收益需要数据库服务。" });
  const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit") || 50)));
  const income = await getCreatorIncomeInDb(auth.user.id, limit);
  if (!income) return sendJson(res, 503, { ok: false, code: "DATABASE_REQUIRED", message: "创作者收益需要数据库服务。" });
  return sendJson(res, 200, { ok: true, income });
}

async function handleCreateLiveCreatorWithdrawal(req, res) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  if (!dbEnabled()) return sendJson(res, 503, { ok: false, code: "DATABASE_REQUIRED", message: "提现需要数据库服务。" });
  const body = await readJson(req).catch(() => ({}));
  const withdrawal = await createCreatorWithdrawalInDb({
    userId: auth.user.id,
    amountCredits: body.amountCredits ?? body.amount ?? 0,
    network: body.network || "USDT-TRC20",
    address: body.address || body.walletAddress || "",
  });
  const income = await getCreatorIncomeInDb(auth.user.id, 50);
  return sendJson(res, 200, { ok: true, withdrawal, income });
}

async function handleListLiveCreatorWithdrawals(req, res, url) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  if (!dbEnabled()) return sendJson(res, 503, { ok: false, code: "DATABASE_REQUIRED", message: "提现记录需要数据库服务。" });
  const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit") || 20)));
  const withdrawals = await listCreatorWithdrawalsInDb(auth.user.id, limit);
  return sendJson(res, 200, { ok: true, withdrawals });
}

async function handleAdminGetCreatorData(req, res, url) {
  const auth = await requireAdmin(req, res, { loadDb: false });
  if (!auth) return;
  if (!dbEnabled()) return sendJson(res, 503, { ok: false, code: "DATABASE_REQUIRED", message: "创作者数据需要数据库服务。" });
  const paging = pagingFromUrl(url || new URL("http://localhost"), { defaultLimit: 20, maxLimit: 100 });
  const queryText = String((url || new URL("http://localhost")).searchParams.get("q") || "").trim();
  const data = await getAdminCreatorDataInDb({ page: paging.page, limit: paging.limit, queryText });
  return sendJson(res, 200, { ok: true, ...(data || { creators: [], total: 0, page: 1, limit: paging.limit, totalPages: 1 }) });
}

async function handleAdminListCreatorWithdrawals(req, res, url) {
  const auth = await requireAdmin(req, res, { loadDb: false });
  if (!auth) return;
  if (!dbEnabled()) return sendJson(res, 503, { ok: false, code: "DATABASE_REQUIRED", message: "创作者提现需要数据库服务。" });
  const paging = pagingFromUrl(url || new URL("http://localhost"), { defaultLimit: 20, maxLimit: 100 });
  const status = String((url || new URL("http://localhost")).searchParams.get("status") || "").trim().toLowerCase();
  const queryText = String((url || new URL("http://localhost")).searchParams.get("q") || "").trim();
  const data = await getAdminCreatorWithdrawalsPageFromDb({ page: paging.page, limit: paging.limit, status, queryText });
  return sendJson(res, 200, { ok: true, ...(data || { withdrawals: [], total: 0, page: 1, limit: paging.limit, totalPages: 1 }) });
}

async function handleAdminUpdateCreatorWithdrawal(req, res, withdrawalId) {
  const auth = await requireAdmin(req, res, { loadDb: false });
  if (!auth) return;
  if (!dbEnabled()) return sendJson(res, 503, { ok: false, code: "DATABASE_REQUIRED", message: "创作者提现需要数据库服务。" });
  const body = await readJson(req).catch(() => ({}));
  const withdrawal = await updateCreatorWithdrawalInDb({
    id: decodeURIComponent(String(withdrawalId || "")),
    status: body.status,
    txHash: body.txHash,
    note: body.note,
    rejectionReason: body.rejectionReason || body.note,
    adminUserId: auth.user.id,
  });
  return sendJson(res, 200, { ok: true, withdrawal });
}

function telegramSupportEnabled() {
  return Boolean(TELEGRAM_SUPPORT_BOT_TOKEN && TELEGRAM_SUPPORT_ADMIN_CHAT_ID && TELEGRAM_SUPPORT_WEBHOOK_SECRET);
}

function telegramSupportApiUrl(method) {
  return `https://api.telegram.org/bot${TELEGRAM_SUPPORT_BOT_TOKEN}/${method}`;
}

async function callTelegramSupportApi(method, payload = {}) {
  if (!TELEGRAM_SUPPORT_BOT_TOKEN) return null;
  try {
    const response = await fetch(telegramSupportApiUrl(method), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
      console.warn("Telegram support API failed:", method, response.status, data.description || data);
    }
    return data;
  } catch (error) {
    console.warn("Telegram support API error:", method, error.message || error);
    return null;
  }
}

function telegramUserLabel(user = {}, chat = {}) {
  const username = user.username || chat.username;
  const name = [user.first_name || chat.first_name, user.last_name || chat.last_name].filter(Boolean).join(" ").trim();
  if (username && name) return `${name} (@${username})`;
  if (username) return `@${username}`;
  return name || String(chat.id || user.id || "unknown");
}

function telegramMessageBody(message = {}) {
  if (typeof message.text === "string" && message.text.trim()) return message.text.trim();
  if (typeof message.caption === "string" && message.caption.trim()) return message.caption.trim();
  if (message.photo) return "[photo]";
  if (message.document) return `[document] ${message.document.file_name || ""}`.trim();
  if (message.video) return "[video]";
  if (message.voice) return "[voice]";
  if (message.audio) return "[audio]";
  if (message.sticker) return "[sticker]";
  return "[non-text message]";
}

function telegramSupportHelpText() {
  return [
    "Welcome to Vipeak AI Support.",
    "",
    "Send your issue or feedback here. For faster handling, include:",
    "- account email",
    "- task ID or order ID",
    "- browser/device",
    "- what happened and what you expected",
    "- screenshot if useful",
  ].join("\n");
}

async function persistTelegramSupportMessage(message = {}) {
  if (!dbEnabled()) throw Object.assign(new Error("Support database is unavailable."), { statusCode: 503, code: "DATABASE_REQUIRED" });
  const chat = message.chat || {};
  const from = message.from || {};
  const body = telegramMessageBody(message);
  const label = telegramUserLabel(from, chat);
  const now = new Date().toISOString();
  const record = {
    id: randomId("support"),
    userId: "",
    username: label,
    email: "",
    subject: "Telegram support",
    message: [
      `From: ${label}`,
      `Telegram chat ID: ${chat.id || ""}`,
      from.username ? `Telegram username: @${from.username}` : "",
      "",
      body,
    ].filter(Boolean).join("\n"),
    status: "open",
    reply: "",
    repliedAt: "",
    repliedBy: "",
    source: "telegram",
    telegramChatId: String(chat.id || ""),
    telegramUsername: from.username ? `@${from.username}` : "",
    telegramMessageId: String(message.message_id || ""),
    createdAt: now,
    updatedAt: now,
  };
  return (await createUserSupportMessageInDb(record)) || record;
}

async function notifyTelegramSupportAdmin(record = {}, message = {}) {
  if (!TELEGRAM_SUPPORT_ADMIN_CHAT_ID) return;
  const chat = message.chat || {};
  const from = message.from || {};
  const body = compactPlainText(telegramMessageBody(message), 2600);
  const label = telegramUserLabel(from, chat);
  const lines = [
    "New Vipeak Telegram support message",
    `Record: ${record.id || ""}`,
    `From: ${label}`,
    `Chat ID: ${chat.id || ""}`,
    "",
    body,
    "",
    `Reply with: /reply ${chat.id || ""} your message`,
  ];
  await callTelegramSupportApi("sendMessage", {
    chat_id: TELEGRAM_SUPPORT_ADMIN_CHAT_ID,
    text: lines.join("\n"),
    disable_web_page_preview: true,
  });
  if (!message.text && message.message_id && chat.id) {
    await callTelegramSupportApi("forwardMessage", {
      chat_id: TELEGRAM_SUPPORT_ADMIN_CHAT_ID,
      from_chat_id: chat.id,
      message_id: message.message_id,
    });
  }
}

async function handleTelegramSupportAdminReply(message = {}) {
  const text = String(message.text || "");
  const match = text.match(/^\/reply(?:@\w+)?\s+(-?\d+)\s+([\s\S]+)$/i);
  if (!match) {
    await callTelegramSupportApi("sendMessage", {
      chat_id: TELEGRAM_SUPPORT_ADMIN_CHAT_ID,
      text: `Admin mode is active.\nUse: /reply <telegram_chat_id> your message`,
    });
    return;
  }
  const targetChatId = match[1];
  const replyText = match[2].trim();
  if (!replyText) {
    await callTelegramSupportApi("sendMessage", { chat_id: TELEGRAM_SUPPORT_ADMIN_CHAT_ID, text: "Reply text is required." });
    return;
  }
  const result = await callTelegramSupportApi("sendMessage", {
    chat_id: targetChatId,
    text: replyText,
    disable_web_page_preview: true,
  });
  await callTelegramSupportApi("sendMessage", {
    chat_id: TELEGRAM_SUPPORT_ADMIN_CHAT_ID,
    text: result?.ok ? `Reply sent to ${targetChatId}.` : `Reply failed for ${targetChatId}.`,
  });
}

async function processTelegramSupportUpdate(update = {}) {
  const message = update.message || update.edited_message;
  if (!message || message.from?.is_bot) return;
  const chat = message.chat || {};
  const chatId = String(chat.id || "");
  const text = String(message.text || "").trim();
  const isAdmin = chatId && chatId === String(TELEGRAM_SUPPORT_ADMIN_CHAT_ID);
  if (isAdmin) {
    if (text.startsWith("/reply")) await handleTelegramSupportAdminReply(message);
    return;
  }
  if (chat.type && chat.type !== "private") return;
  const command = text.split(/\s+/)[0].replace(/@\w+$/, "").toLowerCase();
  if (["/start", "/help", "/feedback", "/bug"].includes(command)) {
    await callTelegramSupportApi("sendMessage", {
      chat_id: chat.id,
      text: telegramSupportHelpText(),
      disable_web_page_preview: true,
    });
    return;
  }
  const record = await persistTelegramSupportMessage(message);
  await notifyTelegramSupportAdmin(record, message);
  await callTelegramSupportApi("sendMessage", {
    chat_id: chat.id,
    text: "Received. Vipeak support will review this and reply here if follow-up is needed.",
    disable_web_page_preview: true,
  });
}

async function handleTelegramSupportWebhook(req, res, secret) {
  if (!telegramSupportEnabled()) return sendJson(res, 404, { ok: false, message: "Telegram support is not enabled." });
  if (!secret || secret !== TELEGRAM_SUPPORT_WEBHOOK_SECRET) return sendJson(res, 403, { ok: false, message: "Invalid webhook secret." });
  const update = await readJson(req);
  await processTelegramSupportUpdate(update);
  return sendJson(res, 200, { ok: true });
}

async function handleAdminListSupportMessages(req, res, url) {
  const auth = await requireAdmin(req, res, { loadDb: false });
  if (!auth) return;
  const paging = pagingFromUrl(url || new URL("http://localhost"), { defaultLimit: 20, maxLimit: 100 });
  const query = String((url || new URL("http://localhost")).searchParams.get("q") || "").trim().toLowerCase();
  const status = String((url || new URL("http://localhost")).searchParams.get("status") || "").trim().toLowerCase();
  const source = String((url || new URL("http://localhost")).searchParams.get("source") || "").trim().toLowerCase();
  if (dbEnabled()) {
    const result = await getAdminSupportMessagesPageFromDb({ page: paging.page, limit: paging.limit, queryText: query, status, source });
    if (result) {
      const userMap = new Map(result.items.map((m) => [m.userId, { username: m.username }]));
      return sendJson(res, 200, { ok: true, messages: result.items.map((m) => supportMessageView(m, userMap)), page: result.page, limit: result.limit, total: result.total, totalPages: Math.max(1, Math.ceil(result.total / result.limit)) });
    }
  }
  const userMap = new Map((auth.db.users || []).map((user) => [user.id, user]));
  let messages = (auth.db.supportMessages || [])
    .filter((record) => !isSoftDeleted(record))
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    .map((record) => supportMessageView(record, userMap));
  if (status) messages = messages.filter((record) => String(record.status || "open").toLowerCase() === status);
  if (source) messages = messages.filter((record) => String(record.source || "").toLowerCase() === source);
  if (query) {
    messages = messages.filter((record) => [
      record.id,
      record.username,
      record.userId,
      record.email,
      record.subject,
      record.message,
      record.reply,
      record.status,
      record.source,
    ].some((value) => String(value || "").toLowerCase().includes(query)));
  }
  const paged = pagedResponse(messages, paging);
  return sendJson(res, 200, { ok: true, messages: paged.items, page: paged.page, limit: paged.limit, total: paged.total, totalPages: paged.totalPages });
}

async function handleAdminReplySupportMessage(req, res, messageId) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const body = await readJson(req);
  const reply = String(body.reply || "").trim();
  if (!reply) return sendJson(res, 400, { ok: false, message: "Reply is required." });
  const record = (auth.db.supportMessages || []).find((item) => item.id === messageId && !isSoftDeleted(item));
  if (!record) return sendJson(res, 404, { ok: false, message: "Support message not found." });
  record.reply = reply;
  record.status = "replied";
  record.repliedAt = new Date().toISOString();
  record.repliedBy = auth.user.username || auth.user.id || "admin";
  record.updatedAt = record.repliedAt;
  if (dbEnabled()) {
    const stored = await updateUserSupportMessageInDb(messageId, record);
    if (stored) Object.assign(record, stored);
    const notification = String(record.userId || "").trim()
      ? await createLiveNotificationInDb({
        id: `support-reply-${messageId}`,
        userId: String(record.userId || "").trim(),
        kind: "support",
        title: "问题反馈已回复",
        body: reply,
        payload: {
          supportMessageId: String(messageId || ""),
          subject: String(record.subject || ""),
          repliedAt: String(record.repliedAt || ""),
        },
        pinned: false,
        createdAt: record.repliedAt,
        updatedAt: record.repliedAt,
      }).catch((error) => {
        console.warn("[support-reply-notification-failed]", messageId, error?.message || error);
        return null;
      })
      : null;
    return sendJson(res, 200, {
      ok: true,
      messageRecord: supportMessageView(record),
      notificationSent: Boolean(notification),
      notification: notification || null,
    });
  }
  return sendJson(res, 200, { ok: true, messageRecord: supportMessageView(record), notificationSent: false });
}

async function handleListApiSubtokens(req, res) {
  const auth = await requirePrimaryTokenOwner(req, res);
  if (!auth) return;
  const subtokens = await listApiSubtokensFromDb(auth.user.id);
  return sendJson(res, 200, {
    ok: true,
    subtokens: subtokens.map(apiSubtokenView).filter(Boolean),
  });
}

async function handleCreateApiSubtoken(req, res) {
  const auth = await requirePrimaryTokenOwner(req, res);
  if (!auth) return;
  const body = await readJson(req);
  const name = String(body.name || "").trim().slice(0, 80);
  if (!name) return sendJson(res, 400, { ok: false, message: "Sub token name is required." });
  const quotaType = String(body.quotaType || body.quota_type || "amount").trim().toLowerCase() === "count" ? "count" : "amount";
  const quotaLimitRaw = Number(body.quotaLimit ?? body.quota_limit ?? body.limit ?? 0);
  if (!Number.isFinite(quotaLimitRaw) || quotaLimitRaw <= 0) {
    return sendJson(res, 400, { ok: false, message: "Quota must be greater than 0." });
  }
  const expiresAtRaw = String(body.expiresAt || body.expires_at || "").trim();
  let expiresAt = "";
  if (expiresAtRaw) {
    const parsed = Date.parse(expiresAtRaw);
    if (!Number.isFinite(parsed)) {
      return sendJson(res, 400, { ok: false, message: "Invalid expiration time." });
    }
    expiresAt = new Date(parsed).toISOString();
  }
  const token = await makeUniqueSubtokenToken(auth.db, auth.user.id);
  const now = currentIso();
  const record = await createApiSubtokenInDb({
    id: randomId("sat"),
    token,
    parentUserId: auth.user.id,
    name,
    quotaType,
    quotaLimit: quotaType === "count" ? Math.max(1, Math.round(quotaLimitRaw)) : roundCredits(quotaLimitRaw, 6),
    usedAmount: 0,
    usedCount: 0,
    expiresAt,
    revokedAt: "",
    lastUsedAt: "",
    createdAt: now,
    updatedAt: now,
  });
  return sendJson(res, 200, {
    ok: true,
    subtoken: apiSubtokenView(record, { includeToken: true }),
  });
}

