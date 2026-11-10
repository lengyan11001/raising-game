const AUTH_JSON_BODY_MAX_BYTES = 32 * 1024;

async function pivoxRequest(method, pathname, body = null) {
  if (!PIVOX_API_KEY) {
    const error = new Error("Missing PIVOX_API_KEY");
    error.code = "MISSING_PIVOX_API_KEY";
    error.statusCode = 503;
    throw error;
  }

  const maxAttempts = method === "GET" ? 3 : 2;
  let response;
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      response = await fetch(`${PIVOX_API_BASE_URL}${pathname}`, {
        method,
        headers: {
          authorization: `Bearer ${PIVOX_API_KEY}`,
          accept: "application/json",
          ...(body ? { "content-type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(method === "GET" ? 60000 : 180000),
      });
      break;
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) await delay(attempt * 900);
    }
  }
  if (!response) {
    const error = new Error(`Pivoxapi request failed: ${lastError?.cause?.code || lastError?.message || "fetch failed"}`);
    error.code = "PIVOX_FETCH_FAILED";
    error.statusCode = 502;
    error.cause = lastError;
    throw error;
  }

  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { message: text };
  }
  if (!response.ok || payload?.error || payload?.code >= 400) {
    const error = new Error(payload?.error?.message || payload?.message || payload?.detail || `Pivoxapi request failed: ${response.status}`);
    error.statusCode = response.status || 502;
    error.code = payload?.error?.code || payload?.code || "PIVOX_REQUEST_FAILED";
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function apizSeedanceRequest(pathname, body = {}, options = {}) {
  if (!APIZ_SEEDANCE_API_KEY) {
    const error = new Error("Missing APIZ_SEEDANCE_API_KEY");
    error.code = "MISSING_APIZ_SEEDANCE_API_KEY";
    error.statusCode = 503;
    throw error;
  }

  const method = String(options.method || "POST").toUpperCase();
  const hasBody = body !== undefined && body !== null && method !== "GET" && method !== "HEAD";
  let response;
  let lastError;
  const maxAttempts = method === "GET" ? 3 : 2;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      response = await fetch(`${APIZ_SEEDANCE_API_BASE_URL}${pathname}`, {
        method,
        headers: {
          authorization: `Bearer ${APIZ_SEEDANCE_API_KEY}`,
          accept: "application/json",
          ...(hasBody ? { "content-type": "application/json" } : {}),
        },
        body: hasBody ? JSON.stringify(body || {}) : undefined,
        signal: AbortSignal.timeout(method === "GET" ? 60000 : 180000),
      });
      break;
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) await delay(attempt * 900);
    }
  }
  if (!response) {
    const error = new Error(`APIZ Seedance request failed: ${lastError?.cause?.code || lastError?.message || "fetch failed"}`);
    error.code = "APIZ_SEEDANCE_FETCH_FAILED";
    error.statusCode = 502;
    error.cause = lastError;
    throw error;
  }

  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { message: text };
  }
  if (!response.ok || payload?.error || payload?.code >= 400) {
    const error = new Error(payload?.error?.message || payload?.message || payload?.detail || `APIZ Seedance request failed: ${response.status}`);
    error.statusCode = response.status || 502;
    error.code = payload?.error?.code || payload?.code || "APIZ_SEEDANCE_REQUEST_FAILED";
    error.payload = payload;
    throw error;
  }
  return payload.data || payload;
}

function ignexAssetCacheKey(assetType = "Image", sourceUrl = "") {
  const digest = crypto
    .createHash("sha1")
    .update(`${IGNEX_PROJECT_NAME}:${String(assetType || "").toLowerCase()}:${String(sourceUrl || "").trim()}`)
    .digest("hex");
  return `ignex_asset_uri:${digest}`;
}

function normalizeIgnexAssetUri(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";
  const match = text.match(/^asset:\/\/(.+)$/i);
  return match ? `asset://${match[1]}` : "";
}

function extractIgnexAssetId(raw = {}) {
  return String(firstPresent(
    raw?.Result?.Id,
    raw?.Result?.id,
    raw?.result?.Id,
    raw?.result?.id,
    raw?.Id,
    raw?.id,
    raw?.asset_id,
    raw?.assetId,
    "",
  ) || "").trim();
}

async function ignexRequest(method, pathname, body = null) {
  if (!IGNEX_API_KEY) {
    const error = new Error("Missing IGNEX_API_KEY");
    error.code = "MISSING_IGNEX_API_KEY";
    error.statusCode = 503;
    throw error;
  }
  const requestUrl = /^https?:\/\//i.test(String(pathname || ""))
    ? String(pathname)
    : `${IGNEX_API_BASE_URL}${pathname}`;
  const upperMethod = String(method || "GET").toUpperCase();
  const hasBody = body !== undefined && body !== null && upperMethod !== "GET" && upperMethod !== "HEAD";
  const maxAttempts = upperMethod === "GET" ? 3 : 2;
  let response;
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      response = await fetch(requestUrl, {
        method: upperMethod,
        headers: {
          authorization: `Bearer ${IGNEX_API_KEY}`,
          accept: "application/json",
          ...(hasBody ? { "content-type": "application/json" } : {}),
        },
        body: hasBody ? JSON.stringify(body || {}) : undefined,
        signal: AbortSignal.timeout(upperMethod === "GET" ? 60000 : 180000),
      });
      break;
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) await delay(attempt * 900);
    }
  }
  if (!response) {
    const error = new Error(`Ignex request failed: ${lastError?.cause?.code || lastError?.message || "fetch failed"}`);
    error.code = "IGNEX_FETCH_FAILED";
    error.statusCode = 502;
    error.cause = lastError;
    throw error;
  }

  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { message: text };
  }
  const responseError = payload?.ResponseMetadata?.Error || payload?.error;
  if (!response.ok || responseError || payload?.code >= 400) {
    const error = new Error(
      responseError?.Message ||
      responseError?.message ||
      payload?.message ||
      payload?.detail ||
      `Ignex request failed: ${response.status}`,
    );
    error.statusCode = response.status || 502;
    error.code = responseError?.Code || responseError?.code || payload?.code || "IGNEX_REQUEST_FAILED";
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function ignexAssetAction(action = "", body = {}) {
  const actionName = String(action || "").trim();
  if (!actionName) {
    const error = new Error("Missing Ignex action.");
    error.statusCode = 500;
    throw error;
  }
  return ignexRequest("POST", `/?Action=${encodeURIComponent(actionName)}&Version=2024-01-01`, body);
}

async function ignexAssetGroupId() {
  if (IGNEX_ASSET_GROUP_ID) return IGNEX_ASSET_GROUP_ID;
  if (ignexAssetGroupCache) return ignexAssetGroupCache;
  const kvKey = `ignex_asset_group:${IGNEX_PROJECT_NAME}:${IGNEX_ASSET_GROUP_NAME}`;
  const cached = String(await getKv(kvKey, "") || "").trim();
  if (cached) {
    ignexAssetGroupCache = cached;
    return cached;
  }
  const list = await ignexAssetAction("ListAssetGroups", {
    PageNumber: 1,
    PageSize: 50,
    ProjectName: IGNEX_PROJECT_NAME,
    Filter: { GroupType: "AIGC" },
  });
  const groups = Array.isArray(list?.Result?.Items) ? list.Result.Items : [];
  const existing = groups.find((item) => String(item?.Name || item?.name || "").trim() === IGNEX_ASSET_GROUP_NAME);
  const existingId = String(existing?.Id || existing?.id || "").trim();
  if (existingId) {
    ignexAssetGroupCache = existingId;
    await setKv(kvKey, existingId);
    return existingId;
  }
  const created = await ignexAssetAction("CreateAssetGroup", {
    Name: IGNEX_ASSET_GROUP_NAME,
    Description: "Reusable Seedance references",
    GroupType: "AIGC",
    ProjectName: IGNEX_PROJECT_NAME,
  });
  const createdId = extractIgnexAssetId(created);
  if (!createdId) {
    const error = new Error(`Ignex CreateAssetGroup did not return group id: ${JSON.stringify(created || {})}`);
    error.statusCode = 502;
    error.code = "IGNEX_ASSET_GROUP_FAILED";
    error.payload = created;
    throw error;
  }
  ignexAssetGroupCache = createdId;
  await setKv(kvKey, createdId);
  return createdId;
}

function userAssetIdFromAssetUri(value = "") {
  const match = String(value || "").trim().match(/^asset:\/\/([^/?#]+)$/i);
  return match ? match[1] : "";
}

async function publicIgnexMediaSourceUrl(db, user, value = "", name = "Seedance media") {
  const text = String(value || "").trim();
  if (!text) return "";
  const localAssetId = userAssetIdFromAssetUri(text);
  if (localAssetId && db?.userAssets && user?.id) {
    const asset = (db.userAssets || []).find((item) => item.id === localAssetId && item.userId === user.id && !isSoftDeleted(item));
    if (asset) {
      const prepared = await ensurePublicUrlForUserMediaAsset(db, asset);
      return publicHttpUrlForUserAsset(prepared);
    }
  }
  if (normalizeIgnexAssetUri(text)) return normalizeIgnexAssetUri(text);
  const publicUrl = publicHttpUrlForUpstream(text);
  if (publicUrl) return publicUrl;
  if (!/^data:(image|video|audio)\//i.test(text) || !db || !user?.id) return "";
  const { mime, bytes } = decodeWanMediaDataUrl(text);
  const maxBytes = mime.startsWith("image/") ? IMAGE_UPLOAD_MAX_BYTES : MEDIA_UPLOAD_MAX_BYTES;
  const ext = mime.startsWith("video/") ? ".mp4" : mime.startsWith("audio/") ? ".mp3" : imageExtFromMime(mime);
  const userAsset = await createUserMediaAssetFromBytes(db, user, {
    bytes,
    mime,
    name,
    fileName: `${String(name || "media").replace(/[^a-z0-9_-]+/gi, "-").slice(0, 40) || "media"}${ext}`,
    maxBytes,
  });
  const publicAsset = await ensurePublicUrlForUserMediaAsset(db, userAsset);
  return publicHttpUrlForUserAsset(publicAsset);
}

async function uploadIgnexSeedanceAsset({ db = null, user = {}, url = "", assetType = "Image", name = "reference-media" } = {}) {
  const sourceUrl = await publicIgnexMediaSourceUrl(db, user, url, name);
  if (!sourceUrl) return "";
  const existingAssetUri = normalizeIgnexAssetUri(sourceUrl);
  if (existingAssetUri && !isPublicHttpUrl(sourceUrl)) return existingAssetUri;
  const normalizedType = String(assetType || "Image").trim() || "Image";
  const cacheKey = ignexAssetCacheKey(normalizedType, sourceUrl);
  const cachedAssetUri = IGNEX_ASSET_URI_CACHE.get(cacheKey) || String(await getKv(cacheKey, "") || "").trim();
  if (cachedAssetUri) {
    IGNEX_ASSET_URI_CACHE.set(cacheKey, cachedAssetUri);
    return cachedAssetUri;
  }
  const groupId = await ignexAssetGroupId();
  const uploadPayload = {
    GroupId: groupId,
    URL: sourceUrl,
    AssetType: normalizedType,
    Name: name,
    Moderation: { Strategy: "Skip" },
    ProjectName: IGNEX_PROJECT_NAME,
  };
  console.log("[ignex-seedance-asset-upload]", JSON.stringify({
    action: "CreateAsset",
    assetType: normalizedType,
    name,
    sourceUrl,
  }));
  const raw = await ignexAssetAction("CreateAsset", uploadPayload);
  const assetId = extractIgnexAssetId(raw);
  if (!assetId) {
    const error = new Error(`Ignex CreateAsset did not return asset id: ${JSON.stringify(raw || {})}`);
    error.statusCode = 502;
    error.code = "IGNEX_ASSET_UPLOAD_FAILED";
    error.payload = raw;
    throw error;
  }
  const assetUri = `asset://${assetId}`;
  IGNEX_ASSET_URI_CACHE.set(cacheKey, assetUri);
  await setKv(cacheKey, assetUri);
  return assetUri;
}

async function prepareIgnexSeedancePayloadAssets(payload = {}, { db = null, user = {} } = {}) {
  const uploadCache = new Map();
  const toAsset = async (value = "", assetType = "Image", name = "reference-media") => {
    const sourceKey = `${assetType}:${String(value || "").trim()}`;
    if (!String(value || "").trim()) return "";
    if (!uploadCache.has(sourceKey)) {
      uploadCache.set(sourceKey, uploadIgnexSeedanceAsset({ db, user, url: value, assetType, name }));
    }
    return await uploadCache.get(sourceKey);
  };
  if (payload.image_url) payload.image_url = await toAsset(payload.image_url, "Image", "first-frame");
  if (payload.end_image_url) payload.end_image_url = await toAsset(payload.end_image_url, "Image", "last-frame");
  if (Array.isArray(payload.reference_images)) {
    const refs = [];
    for (let index = 0; index < payload.reference_images.length; index += 1) {
      const assetUri = await toAsset(nestedMediaUrl(payload.reference_images[index]), "Image", `reference-image-${index + 1}`);
      if (assetUri && !refs.includes(assetUri)) refs.push(assetUri);
    }
    payload.reference_images = refs;
  }
  if (Array.isArray(payload.reference_videos)) {
    const refs = [];
    for (let index = 0; index < payload.reference_videos.length; index += 1) {
      const assetUri = await toAsset(nestedMediaUrl(payload.reference_videos[index]), "Video", `reference-video-${index + 1}`);
      if (assetUri && !refs.includes(assetUri)) refs.push(assetUri);
    }
    payload.reference_videos = refs;
  }
  if (Array.isArray(payload.reference_audios)) {
    const refs = [];
    for (let index = 0; index < payload.reference_audios.length; index += 1) {
      const assetUri = await toAsset(nestedMediaUrl(payload.reference_audios[index]), "Audio", `reference-audio-${index + 1}`);
      if (assetUri && !refs.includes(assetUri)) refs.push(assetUri);
    }
    payload.reference_audios = refs;
  }
  if (Array.isArray(payload.content)) {
    const preparedContent = [];
    for (let index = 0; index < payload.content.length; index += 1) {
      const item = normalizeSeedanceContentItem(payload.content[index]);
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        preparedContent.push(item);
        continue;
      }
      if (item.type === "image_url") {
        const assetUri = await toAsset(mediaUrlFromOfficialItem(item, "image_url"), "Image", `content-image-${index + 1}`);
        preparedContent.push(assetUri ? setOfficialMediaUrl(item, "image_url", assetUri) : item);
        continue;
      }
      if (item.type === "video_url") {
        const assetUri = await toAsset(mediaUrlFromOfficialItem(item, "video_url"), "Video", `content-video-${index + 1}`);
        preparedContent.push(assetUri ? setOfficialMediaUrl(item, "video_url", assetUri) : item);
        continue;
      }
      if (item.type === "audio_url") {
        const assetUri = await toAsset(mediaUrlFromOfficialItem(item, "audio_url"), "Audio", `content-audio-${index + 1}`);
        preparedContent.push(assetUri ? setOfficialMediaUrl(item, "audio_url", assetUri) : item);
        continue;
      }
      preparedContent.push(item);
    }
    payload.content = preparedContent;
  }
  if (Array.isArray(payload.reference_images) && !payload.reference_images.length) delete payload.reference_images;
  if (Array.isArray(payload.reference_videos) && !payload.reference_videos.length) delete payload.reference_videos;
  if (Array.isArray(payload.reference_audios) && !payload.reference_audios.length) delete payload.reference_audios;
  return payload;
}

function createDemoTask(body) {
  const taskId = `demo-${Date.now()}`;
  demoTasks.set(taskId, {
    taskId,
    createdAt: Date.now(),
    prompt: makeScenePrompt(body),
  });
  return { taskId, status: "queued", demo: true };
}

function getDemoTask(taskId) {
  const task = demoTasks.get(taskId);
  if (!task) return null;

  const elapsed = Date.now() - task.createdAt;
  if (elapsed < 5000) return { ...task, status: "queued", progress: 18, demo: true };
  if (elapsed < 14000) return { ...task, status: "running", progress: 58, demo: true };
  return {
    ...task,
    status: "succeeded",
    progress: 100,
    videoUrl: "",
    demo: true,
  };
}

function landingFieldsFromBody(body = {}) {
  const clean = (value, maxLength = 160) => String(value || "")
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
  const raw = body.attribution && typeof body.attribution === "object" && !Array.isArray(body.attribution) ? body.attribution : {};
  const queryIn = raw.query && typeof raw.query === "object" && !Array.isArray(raw.query) ? raw.query : {};
  const priceChannels = [];
  const pushChannels = (value) => {
    String(value || "").split(/[|,]/).map((item) => clean(item, 80)).filter(Boolean).forEach((item) => {
      if (!priceChannels.includes(item) && priceChannels.length < 8) priceChannels.push(item);
    });
  };
  pushChannels(body.priceChannel || body.priceChannels || body.pricingChannel);
  pushChannels(raw.priceChannel);
  if (Array.isArray(raw.priceChannels)) raw.priceChannels.forEach(pushChannels);
  else pushChannels(raw.priceChannels || raw.pricingChannel);
  pushChannels(queryIn.priceChannel || queryIn.price_channel || queryIn.pricingChannel || queryIn.channels || queryIn.priceChannels);
  const query = {};
  for (const [key, value] of Object.entries(queryIn)) {
    const safeKey = clean(key, 40).replace(/[^A-Za-z0-9_-]/g, "");
    const safeValue = clean(Array.isArray(value) ? value.join(",") : value, 180);
    if (!safeKey || !safeValue || Object.keys(query).length >= 24) continue;
    query[safeKey] = safeValue;
  }
  const referralCode = normalizeReferralCode(
    body.referralCode || body.referral || body.ref || raw.referralCode || raw.ref || raw.sharerId || query.ref || query.referral || query.sharer || query.sharerId || ""
  );
  return {
    referralCode,
    sharerId: userIdFromReferralCode(referralCode),
    priceChannel: priceChannels[0] || "",
    priceChannels,
    query,
    medium: clean(raw.medium || query.utm_medium, 80),
    campaign: clean(raw.campaign || query.utm_campaign, 120),
    content: clean(raw.content || query.utm_content, 120),
    landingPath: clean(raw.landingPath, 500),
    capturedAt: clean(raw.capturedAt, 40),
    channel: clean(body.channel || raw.channel || query.channel || query.utm_source, 80),
  };
}

function attachRegistrationLanding(user, landing = {}, referrer = null, now = "", host = "") {
  if (!user || !landing) return user;
  const previous = user.registrationAttribution && typeof user.registrationAttribution === "object" ? user.registrationAttribution : {};
  user.registrationAttribution = {
    ...previous,
    channel: user.registrationChannel || landing.channel || previous.channel || "direct",
    medium: landing.medium || previous.medium || "",
    campaign: landing.campaign || previous.campaign || "",
    content: landing.content || previous.content || "",
    landingPath: landing.landingPath || previous.landingPath || "/",
    host: String(host || previous.host || "").slice(0, 160),
    capturedAt: landing.capturedAt || previous.capturedAt || "",
    registeredAt: now || previous.registeredAt || new Date().toISOString(),
    sourceChannel: landing.channel || previous.sourceChannel || "",
    priceChannel: landing.priceChannel || previous.priceChannel || "",
    priceChannels: landing.priceChannels && landing.priceChannels.length ? landing.priceChannels : (previous.priceChannels || []),
    sharerId: (referrer && referrer.id) || landing.sharerId || previous.sharerId || "",
    referralCode: landing.referralCode || previous.referralCode || "",
    query: landing.query && Object.keys(landing.query).length ? landing.query : (previous.query || {}),
  };
  if (landing.channel && (!user.registrationChannel || user.registrationChannel === "direct")) user.registrationChannel = landing.channel;
  if (referrer && referrer.id && referrer.id !== user.id && !user.referral) {
    user.referral = {
      referredByUserId: referrer.id,
      referredByUsername: referrer.username || "",
      referralCode: landing.referralCode || "",
      registeredAt: now,
    };
  }
  return user;
}

function passwordRegistrationDisabledResponse(res) {
  return sendJson(res, 403, {
    ok: false,
    code: "PASSWORD_REGISTRATION_DISABLED",
    message: "Password registration is disabled. Use email-code or Google sign-in.",
  });
}

async function registerWithBody(req, res) {
  return passwordRegistrationDisabledResponse(res);
}

async function handleRegister(req, res) {
  return passwordRegistrationDisabledResponse(res);
}

async function loginWithBody(req, res, body = {}) {
  const tenantId = requestTenantId(req);
  const username = String(body.username || "").trim().toLowerCase();
  const password = String(body.password || "");
  const requestRisk = await enforceLoginRequestRisk(req, body);
  if (!requestRisk.ok) return authRateLimitedResponse(res, requestRisk);
  const lock = await loginLockState(req, username);
  if (lock?.lockedUntil) return lockedAuthResponse(res, lock);
  const user = await getUserByUsernameInDb(username, tenantId);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    const failure = await recordAuthLoginFailure(req, username);
    if (failure?.lockedUntil) return lockedAuthResponse(res, {
      retryAfterSeconds: Math.max(1, Math.ceil((Date.parse(failure.lockedUntil) - Date.now()) / 1000)),
    });
    return sendJson(res, 401, { ok: false, message: "Wrong username or password." });
  }
  if (user.riskStatus === "quarantined") {
    await recordAuthLoginFailure(req, username);
    return sendJson(res, 403, { ok: false, code: "ACCOUNT_QUARANTINED", message: "This account is under security review. Please contact support." });
  }
  await clearAuthLoginFailures(req, username);

  ensureUserApiToken(user, null);
  if (dbEnabled()) {
    await updateUserInDb(user);
  }
  const session = await createSingleLoginSession({ ...lightweightAuthDb(), users: [user] }, user, tenantId, body.deviceId || body.device_id || "");
  return sendJson(res, 200, { ok: true, token: session.token, user: userView(user) });
}

async function handleLogin(req, res) {
  return loginWithBody(req, res, await readJson(req, AUTH_JSON_BODY_MAX_BYTES));
}

function normalizeEmail(value = "") {
  const email = String(value || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 254 ? email : "";
}

async function sendEmailMessage({ to, subject, text = "", html = "" }) {
  if (!EMAIL_LOGIN_ENABLED || !smtpConfigured(EMAIL_SMTP_CONFIG)) {
    const error = new Error("Email service is not configured.");
    error.statusCode = 503;
    error.code = "EMAIL_NOT_CONFIGURED";
    throw error;
  }
  return sendSmtpMail({ to, subject, text, html }, EMAIL_SMTP_CONFIG);
}

async function issueEmailCode(req, res, { kind = "login", email = "" } = {}) {
  const normalized = normalizeEmail(email);
  if (!normalized) return sendJson(res, 400, { ok: false, message: "Enter a valid email address." });
  const tenantId = requestTenantId(req);
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  const sentAt = new Date();
  const expiresAt = new Date(sentAt.getTime() + 10 * 60_000);
  const codeHash = crypto.createHash("sha256").update(code).digest("hex");
  try {
    const issued = await upsertEmailChallengeInDb({
      kind,
      email: normalized,
      tenantId,
      codeHash,
      sentAt,
      expiresAt,
      minimumIntervalMs: 60_000,
    });
    if (!issued) return sendJson(res, 429, { ok: false, message: "Please wait before requesting another code." });
  } catch (error) {
    console.error("[email-challenge-db]", error?.message || error);
    return sendJson(res, 503, { ok: false, code: "EMAIL_STORAGE_UNAVAILABLE", message: "Email verification is temporarily unavailable." });
  }
  const text = `Your Vipeak verification code is ${code}. It expires in 10 minutes. If you did not request this, ignore this email.`;
  try {
    await sendEmailMessage({
      to: normalized,
      subject: "Your Vipeak verification code",
      text,
      html: `<p>Your verification code is <strong style="font-size:24px;letter-spacing:4px">${code}</strong>.</p><p>It expires in 10 minutes. If you did not request this, ignore this email.</p>`,
    });
  } catch (error) {
    await deleteEmailChallengeInDb({ kind, email: normalized, tenantId, codeHash }).catch((cleanupError) => {
      console.error("[email-challenge-cleanup]", cleanupError?.message || cleanupError);
    });
    return sendJson(res, error.statusCode || 502, { ok: false, code: error.code || "EMAIL_SEND_FAILED", message: error.message });
  }
  return sendJson(res, 200, { ok: true, expiresIn: 600 });
}

async function consumeEmailCode(kind, email, tenantId, code) {
  try {
    return await consumeEmailChallengeInDb({ kind, email, tenantId, code });
  } catch (error) {
    console.error("[email-challenge-db]", error?.message || error);
    error.statusCode = 503;
    error.code = "EMAIL_STORAGE_UNAVAILABLE";
    error.message = "Email verification is temporarily unavailable.";
    throw error;
  }
}

function emailUsernameCandidate(db, email, tenantId) {
  const base = `e_${email.split("@")[0].replace(/[^a-z0-9_]+/g, "_").slice(0, 20) || "user"}`.slice(0, 24);
  let candidate = base;
  let suffix = 1;
  while ((db.users || []).some((user) => user.username === candidate && recordBelongsToTenant(user, tenantId))) {
    const suffixText = `_${suffix++}`;
    candidate = `${base.slice(0, 24 - suffixText.length)}${suffixText}`;
  }
  return candidate;
}

async function allocateUsername(base, tenantId, db = null) {
  const normalizedBase = String(base || "user").slice(0, 24) || "user";
  for (let suffix = 1; suffix <= 100; suffix += 1) {
    const suffixText = suffix === 1 ? "" : `_${suffix}`;
    const candidate = `${normalizedBase.slice(0, 24 - suffixText.length)}${suffixText}`;
    if (!dbEnabled()) {
      if (!(db?.users || []).some((user) => user.username === candidate && recordBelongsToTenant(user, tenantId))) return candidate;
      continue;
    }
    if (!await getUserByUsernameInDb(candidate, tenantId)) return candidate;
  }
  const suffixText = `_${crypto.randomBytes(4).toString("hex")}`;
  return `${normalizedBase.slice(0, 24 - suffixText.length)}${suffixText}`;
}

function verifiedEmailForUser(user = {}) {
  return normalizeEmail(user.email) || normalizeEmail(user.googleEmail);
}

function findUserByVerifiedEmailInDb(db, email = "", tenantId = DEFAULT_TENANT_ID) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  return (db?.users || []).find((item) => verifiedEmailForUser(item) === normalized && recordBelongsToTenant(item, tenantId)) || null;
}

async function createEmailSession(req, res, email, body = {}) {
  const tenantId = requestTenantId(req);
  let db = lightweightAuthDb();
  let user = dbEnabled() ? await getUserByVerifiedEmailInDb(email, tenantId) : (db = await readDb(), findUserByVerifiedEmailInDb(db, email, tenantId));
  if (user) db.users = [user];
  if (user?.riskStatus === "quarantined") {
    return sendJson(res, 403, { ok: false, code: "ACCOUNT_QUARANTINED", message: "This account is under security review. Please contact support." });
  }
  const now = new Date().toISOString();
  if (!user) {
    const landingPreview = landingFieldsFromBody(body);
    const referrerId = userIdFromReferralCode(landingPreview.referralCode);
    const referrer = referrerId ? (await getUserByIdInDb(referrerId) || (db.users || []).find((item) => item.id === referrerId)) : null;
    user = { id: randomId("user"), tenantId, username: await allocateUsername(emailUsernameCandidate(db, email, tenantId), tenantId, db), passwordHash: hashPassword(crypto.randomBytes(24).toString("hex")), role: "user", credits: 0, pricingMultiplier: 1, apiPricingMultiplier: 1, apiToken: makeUniqueApiToken(db), email, emailVerifiedAt: now, registrationChannel: "email", createdAt: now, updatedAt: now };
    attachRegistrationLanding(user, landingPreview, referrer && recordBelongsToTenant(referrer, tenantId) ? referrer : null, now, requestHostname(req));
    db.users.push(user);
  } else {
    user.email = email;
    user.emailVerifiedAt = now;
    user.updatedAt = now;
  }
  try {
    if (dbEnabled()) await updateUserInDb(user);
    else await writeDb(db);
  } catch (error) {
    if (String(error?.code || "") === "23505") {
      // A concurrent email-code login may have created the canonical account
      // between our lookup and insert. Re-read once and reuse that identity
      // instead of turning a valid login into an error.
      const canonical = dbEnabled()
        ? await getUserByVerifiedEmailInDb(email, tenantId)
        : findUserByVerifiedEmailInDb(await readDb(), email, tenantId);
      if (canonical && canonical.id !== user.id) {
        if (canonical.riskStatus === "quarantined") {
          return sendJson(res, 403, { ok: false, code: "ACCOUNT_QUARANTINED", message: "This account is under security review. Please contact support." });
        }
        user = canonical;
        user.email = email;
        user.emailVerifiedAt = user.emailVerifiedAt || now;
        user.updatedAt = now;
        try {
          if (dbEnabled()) await updateUserInDb(user);
        } catch (retryError) {
          if (String(retryError?.code || "") !== "23505") throw retryError;
          return sendJson(res, 409, { ok: false, code: "EMAIL_IDENTITY_CONFLICT", message: "This email is already linked to another account. Please sign in with that method." });
        }
      } else {
        return sendJson(res, 409, { ok: false, code: "EMAIL_IDENTITY_CONFLICT", message: "This email is already linked to another account. Please sign in with that method." });
      }
    }
    else throw error;
  }
  const session = await createSingleLoginSession(db, user, tenantId, body.deviceId || body.device_id || "");
  return sendJson(res, 200, { ok: true, token: session.token, user: userView(user) });
}

async function handleEmailLoginRequest(req, res) {
  const body = await readJson(req, AUTH_JSON_BODY_MAX_BYTES);
  const requestRisk = await enforceEmailRequestRisk(req, "login", body.email);
  if (!requestRisk.ok) return authRateLimitedResponse(res, requestRisk);
  return issueEmailCode(req, res, { kind: "login", email: body.email });
}

async function handleEmailLoginVerify(req, res) {
  const body = await readJson(req, AUTH_JSON_BODY_MAX_BYTES); const email = normalizeEmail(body.email);
  const verifyRisk = await enforceEmailVerifyRisk(req, email);
  if (!verifyRisk.ok) return authRateLimitedResponse(res, verifyRisk);
  if (!email || !await consumeEmailCode("login", email, requestTenantId(req), body.code)) return sendJson(res, 401, { ok: false, message: "Invalid or expired verification code." });
  return createEmailSession(req, res, email, body);
}

async function handlePasswordResetRequest(req, res) {
  const body = await readJson(req, AUTH_JSON_BODY_MAX_BYTES); const email = normalizeEmail(body.email);
  if (!email) return sendJson(res, 400, { ok: false, message: "Enter a valid email address." });
  const requestRisk = await enforceEmailRequestRisk(req, "reset", email);
  if (!requestRisk.ok) return authRateLimitedResponse(res, requestRisk);
  const user = dbEnabled()
    ? await getUserByVerifiedEmailInDb(email, requestTenantId(req))
    : findUserByVerifiedEmailInDb(await readDb(), email, requestTenantId(req));
  if (!user) return sendJson(res, 200, { ok: true, expiresIn: 600 });
  return issueEmailCode(req, res, { kind: "reset", email });
}

async function handlePasswordReset(req, res) {
  const body = await readJson(req, AUTH_JSON_BODY_MAX_BYTES); const email = normalizeEmail(body.email); const password = String(body.password || "");
  const verifyRisk = await enforceEmailVerifyRisk(req, email);
  if (!verifyRisk.ok) return authRateLimitedResponse(res, verifyRisk);
  if (!email || password.length < 10 || !await consumeEmailCode("reset", email, requestTenantId(req), body.code)) return sendJson(res, 400, { ok: false, message: "Invalid code or password. Password must be at least 10 characters." });
  const db = dbEnabled() ? lightweightAuthDb() : await readDb();
  const user = dbEnabled()
    ? await getUserByVerifiedEmailInDb(email, requestTenantId(req))
    : findUserByVerifiedEmailInDb(db, email, requestTenantId(req));
  if (!user) return sendJson(res, 400, { ok: false, message: "Invalid code or password." });
  user.passwordHash = hashPassword(password);
  // A reset revokes copied API tokens, but existing browser sessions are
  // intentionally preserved so normal users are not logged out.
  user.apiToken = makeUniqueApiToken(db);
  user.updatedAt = new Date().toISOString();
  if (dbEnabled()) await updateUserInDb(user); else await writeDb(db);
  return sendJson(res, 200, { ok: true });
}

async function requireSessionAuth(req, res) {
  const auth = await requireUser(req, res); if (!auth) return null;
  if (auth.tokenSource !== "session") {
    sendJson(res, 403, {
      ok: false,
      code: "SESSION_REQUIRED",
      message: "Please use an active browser session to manage account security.",
    });
    return null;
  }
  return auth;
}

async function handleAccountEmailRequest(req, res) {
  const auth = await requireSessionAuth(req, res); if (!auth) return;
  const body = await readJson(req, AUTH_JSON_BODY_MAX_BYTES); const email = normalizeEmail(body.email);
  if (!email) return sendJson(res, 400, { ok: false, message: "Enter a valid email address." });
  // Binding relies on an active browser session plus proof of email ownership.
  // Do not require the legacy password: imported/Telegram accounts may not know it.
  const requestRisk = await enforceEmailRequestRisk(req, "bind", email);
  if (!requestRisk.ok) return authRateLimitedResponse(res, requestRisk);
  return issueEmailCode(req, res, { kind: "bind", email });
}

async function handleAccountEmailVerify(req, res) {
  const auth = await requireSessionAuth(req, res); if (!auth) return;
  const body = await readJson(req, AUTH_JSON_BODY_MAX_BYTES); const email = normalizeEmail(body.email);
  if (!email) return sendJson(res, 400, { ok: false, message: "Invalid or expired verification code." });
  const verifyRisk = await enforceEmailVerifyRisk(req, email);
  if (!verifyRisk.ok) return authRateLimitedResponse(res, verifyRisk);
  const db = dbEnabled() ? lightweightAuthDb() : await readDb();
  const duplicate = dbEnabled()
    ? await getUserByVerifiedEmailInDb(email, requestTenantId(req))
    : findUserByVerifiedEmailInDb(db, email, requestTenantId(req));
  if (duplicate && duplicate.id !== auth.user.id) return sendJson(res, 409, { ok: false, message: "This email is already bound to another account." });
  if (!await consumeEmailCode("bind", email, requestTenantId(req), body.code)) return sendJson(res, 400, { ok: false, message: "Invalid or expired verification code." });
  auth.user.email = email; auth.user.emailVerifiedAt = new Date().toISOString(); auth.user.updatedAt = new Date().toISOString();
  try {
    if (dbEnabled()) await updateUserInDb(auth.user); else { const index = db.users.findIndex((item) => item.id === auth.user.id); if (index >= 0) db.users[index] = auth.user; await writeDb(db); }
  } catch (error) {
    if (String(error?.code || "") === "23505") {
      return sendJson(res, 409, { ok: false, code: "EMAIL_IDENTITY_CONFLICT", message: "This email is already bound to another account." });
    }
    throw error;
  }
  return sendJson(res, 200, { ok: true, user: userView(auth.user) });
}

async function handleLoginOrRegister(req, res) {
  const body = await readJson(req, AUTH_JSON_BODY_MAX_BYTES);
  return loginWithBody(req, res, body);
}

function googleUserFromDb(db, googleId = "", tenantId = DEFAULT_TENANT_ID) {
  const id = String(googleId || "").trim();
  if (!id) return null;
  return (db?.users || []).find((user) => String(user.googleId || "") === id && recordBelongsToTenant(user, tenantId)) || null;
}

function googleUsernameCandidate(claims = {}) {
  const email = String(claims.email || "").trim().toLowerCase();
  const local = email.split("@")[0] || String(claims.sub || "").slice(-12);
  const clean = local.replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 17) || "user";
  return `g_${clean}`.slice(0, 24);
}

function uniqueGoogleUsername(db, claims = {}, tenantId = DEFAULT_TENANT_ID) {
  const base = googleUsernameCandidate(claims);
  let candidate = base;
  let suffix = 1;
  while ((db.users || []).some((user) => user.username === candidate && recordBelongsToTenant(user, tenantId))) {
    const suffixText = `_${suffix}`;
    candidate = `${base.slice(0, 24 - suffixText.length)}${suffixText}`;
    suffix += 1;
  }
  return candidate;
}

async function verifyGoogleIdToken(idToken = "") {
  const token = String(idToken || "").trim();
  if (!token || token.length > 12000) {
    const error = new Error("Google login response is invalid.");
    error.statusCode = 401;
    error.code = "GOOGLE_LOGIN_INVALID";
    throw error;
  }
  if (!GOOGLE_LOGIN_ENABLED || !GOOGLE_LOGIN_CLIENT_ID) {
    const error = new Error("Google login is not configured.");
    error.statusCode = 503;
    error.code = "GOOGLE_LOGIN_NOT_CONFIGURED";
    throw error;
  }
  let response;
  try {
    response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    const error = new Error("Google authentication service is unavailable.");
    error.statusCode = 503;
    error.code = "GOOGLE_LOGIN_UNAVAILABLE";
    throw error;
  }
  let claims = {};
  try { claims = await response.json(); } catch { claims = {}; }
  const issuer = String(claims.iss || "").trim();
  const audience = String(claims.aud || "").trim();
  const subject = String(claims.sub || "").trim();
  const expiresAt = Number(claims.exp || 0);
  const email = String(claims.email || "").trim().toLowerCase();
  const emailVerified = claims.email_verified === true || String(claims.email_verified || "").toLowerCase() === "true";
  if (!response.ok || !subject || audience !== GOOGLE_LOGIN_CLIENT_ID
    || !["accounts.google.com", "https://accounts.google.com"].includes(issuer)
    || !Number.isFinite(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)
    || !email || !emailVerified) {
    const error = new Error("Google account verification failed.");
    error.statusCode = 401;
    error.code = "GOOGLE_LOGIN_INVALID";
    throw error;
  }
  return {
    sub: subject,
    email,
    name: String(claims.name || "").trim().slice(0, 120),
    picture: String(claims.picture || "").trim().slice(0, 1000),
  };
}

async function ensureGoogleUserAccount(claims = {}, { tenantId = DEFAULT_TENANT_ID, host = "", referralCode = "", attribution = null } = {}) {
  const normalizedTenant = normalizeTenantId(tenantId);
  const googleId = String(claims.sub || "").trim();
  if (!googleId) {
    const error = new Error("Google account information is missing.");
    error.statusCode = 401;
    error.code = "GOOGLE_USER_MISSING";
    throw error;
  }
  const now = new Date().toISOString();
  const db = lightweightAuthDb();
  let user = await getUserByGoogleIdInDb(googleId, normalizedTenant)
    || await getUserByVerifiedEmailInDb(claims.email, normalizedTenant)
    || googleUserFromDb(db, googleId, normalizedTenant);
  let created = false;
  let referrer = null;
  if (user) db.users = [user];
  if (!user) {
    const emailUser = await getUserByVerifiedEmailInDb(claims.email, normalizedTenant);
    if (emailUser?.googleId && String(emailUser.googleId) !== googleId) {
      const error = new Error("This email is already linked to a different Google account.");
      error.statusCode = 409;
      error.code = "GOOGLE_IDENTITY_CONFLICT";
      throw error;
    }
    user = emailUser;
  }
  if (!user) {
    const landingPreview = landingFieldsFromBody({ referralCode, attribution });
    const normalizedReferralCode = landingPreview.referralCode || normalizeReferralCode(referralCode);
    const referrerId = userIdFromReferralCode(normalizedReferralCode);
    referrer = referrerId ? (await getUserByIdInDb(referrerId) || db.users.find((item) => item.id === referrerId)) : null;
    user = {
      id: randomId("user"),
      tenantId: normalizedTenant,
      username: await allocateUsername(googleUsernameCandidate(claims), normalizedTenant, db),
      passwordHash: hashPassword(crypto.randomBytes(32).toString("hex")),
      role: await hasAnyActiveUserInDb() ? "user" : "admin",
      credits: 0,
      pricingMultiplier: 1,
      apiPricingMultiplier: 1,
      apiToken: makeUniqueApiToken(db),
      registrationChannel: "google",
      registrationAttribution: {
        channel: "google",
        medium: "google-oauth",
        landingPath: "/",
        host: String(host || "").trim().slice(0, 160),
        registeredAt: now,
      },
      createdAt: now,
      updatedAt: now,
    };
    if (referrer?.id && recordBelongsToTenant(referrer, normalizedTenant)) {
      user.referral = {
        referredByUserId: referrer.id,
        referredByUsername: referrer.username || "",
        referralCode: normalizedReferralCode,
        registeredAt: now,
      };
    }
    attachRegistrationLanding(user, landingPreview, referrer, now, host);
    db.users.push(user);
    created = true;
  }
  user.tenantId = normalizedTenant;
  user.googleId = googleId;
  user.googleEmail = normalizeEmail(claims.email) || String(claims.email || "").trim().toLowerCase().slice(0, 320);
  if (!normalizeEmail(user.email) && user.googleEmail) {
    user.email = user.googleEmail;
    if (!user.emailVerifiedAt) user.emailVerifiedAt = now;
  }
  user.googleName = String(claims.name || "").trim().slice(0, 120);
  user.googleAvatarUrl = String(claims.picture || "").trim().slice(0, 1000);
  if (created && (!Array.isArray(user.profilePhotos) || !user.profilePhotos.length)) {
    user.profilePhotos = [user.googleAvatarUrl || "/assets/brand/default-avatar.jpg"];
  }
  user.googleUpdatedAt = now;
  user.updatedAt = now;
  ensureUserApiToken(user, db);
  try {
    if (dbEnabled()) await updateUserInDb(user);
    else await writeDb(db);
  } catch (error) {
    if (String(error?.code || "") === "23505") {
      const canonical = await getUserByGoogleIdInDb(googleId, normalizedTenant)
        || await getUserByVerifiedEmailInDb(claims.email, normalizedTenant);
      if (canonical && canonical.id !== user.id && String(canonical.googleId || "") === googleId) {
        return { db: { ...db, users: [canonical] }, user: canonical };
      }
      const conflict = new Error("This email is already linked to another account. Please use email sign-in for that account.");
      conflict.statusCode = 409;
      conflict.code = "GOOGLE_IDENTITY_CONFLICT";
      throw conflict;
    }
    throw error;
  }
  if (created && referrer?.id) {
    const wasMember = userHasCreatorMembership(referrer);
    await ensureCreatorMembershipFromReferrals(db, referrer);
    if (!wasMember && userHasCreatorMembership(referrer)) await grantPendingReferralRewardsForMember(db, referrer);
    if (!dbEnabled()) await writeDb(db);
  }
  return { db, user };
}

async function handleGoogleLogin(req, res) {
  if (!GOOGLE_LOGIN_ENABLED || !GOOGLE_LOGIN_CLIENT_ID) {
    return sendJson(res, 503, { ok: false, code: "GOOGLE_LOGIN_NOT_CONFIGURED", message: "Google login is not configured." });
  }
  const tenant = requestTenantDescriptor(req);
  const body = await readJson(req, AUTH_JSON_BODY_MAX_BYTES);
  const googleRisk = await enforceGoogleLoginRisk(req);
  if (!googleRisk.ok) return authRateLimitedResponse(res, googleRisk);
  try {
    const claims = await verifyGoogleIdToken(body.credential || body.idToken || body.id_token || "");
    const existingGoogleAccount = await getUserByGoogleIdInDb(String(claims.sub || claims.googleId || ""), tenant.tenantId);
    if (existingGoogleAccount?.riskStatus === "quarantined") {
      return sendJson(res, 403, { ok: false, code: "ACCOUNT_QUARANTINED", message: "This account is under security review. Please contact support." });
    }
    const account = await ensureGoogleUserAccount(claims, {
      tenantId: tenant.tenantId,
      host: requestHostname(req),
      referralCode: body.referralCode || body.referral || body.ref || "",
      attribution: body.attribution || null,
    });
    const session = await createSingleLoginSession(account.db, account.user, tenant.tenantId, body.deviceId || body.device_id || "");
    return sendJson(res, 200, { ok: true, token: session.token, user: userView(account.user) });
  } catch (error) {
    return sendJson(res, error.statusCode || 401, { ok: false, code: error.code || "GOOGLE_LOGIN_INVALID", message: error.message || "Google login failed." });
  }
}

async function handleMe(req, res) {
  const auth = await getAuth(req, { includeUserAssets: false });
  if (auth.quarantined) return sendJson(res, 403, { ok: false, code: "ACCOUNT_QUARANTINED", message: "This account is under security review. Please contact support." });
  if (auth.user && !auth.user.apiToken) {
    ensureUserApiToken(auth.user, auth.db);
    if (dbEnabled()) await updateUserInDb(auth.user);
    else await writeDb(auth.db);
  }
  const user = userView(auth.user);
  if (user && auth.user) user.companionLevel = companionLevelSummary(auth.db, auth.user.id);
  if (user && auth.user) user.profileStats = publicProfileStats(auth.db, auth.user);
  if (user && auth.tokenSource) {
    user.accessTokenSource = auth.tokenSource;
    user.accessTokenId = auth.tokenRecord?.id || "";
    user.accessTokenName = auth.tokenRecord?.name || "";
    user.accessTokenType = auth.tokenRecord?.quotaType || "";
    user.accessTokenPreview = auth.tokenRecord?.tokenPreview || "";
  }
  return sendJson(res, 200, { ok: true, user });
}

async function handleGetCompanionLevel(req, res) {
  const auth = await requireUser(req, res, { includeUserAssets: false });
  if (!auth) return;
  return sendJson(res, 200, { ok: true, companionLevel: companionLevelSummary(auth.db, auth.user.id) });
}

async function handleGetCharacterRelationship(req, res, characterId) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const cleanCharacterId = String(characterId || "").trim();
  if (!cleanCharacterId) return sendJson(res, 400, { ok: false, message: "characterId is required." });
  const relationship = await getCharacterRelationshipInDb(auth.user.id, cleanCharacterId);
  return sendJson(res, 200, { ok: true, relationship: publicCharacterRelationship(relationship, cleanCharacterId) });
}

function publicOnboardingGuide(state = null, guideKey = "") {
  return {
    guideKey: String(guideKey || state?.guideKey || ""),
    seen: Boolean(state?.seenAt),
    completed: Boolean(state?.completedAt),
    seenAt: String(state?.seenAt || ""),
    completedAt: String(state?.completedAt || ""),
  };
}

async function handleGetOnboarding(req, res, url) {
  const guideKey = String(url.searchParams.get("guide") || "video-companion").trim().slice(0, 80) || "video-companion";
  const auth = await getAuth(req, { loadDb: false });
  if (auth.quarantined) return sendJson(res, 403, { ok: false, code: "ACCOUNT_QUARANTINED", message: "This account is under security review. Please contact support." });
  if (!auth.user) return sendJson(res, 200, { ok: true, guide: publicOnboardingGuide(null, guideKey), sessionOnly: true });
  const state = await getGuideStateInDb(auth.user.id, guideKey);
  return sendJson(res, 200, { ok: true, guide: publicOnboardingGuide(state, guideKey) });
}

async function handleUpdateOnboarding(req, res, guideKey, action) {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const cleanKey = String(guideKey || "").trim().slice(0, 80);
  if (!cleanKey) return sendJson(res, 400, { ok: false, message: "guideKey is required." });
  const nowIso = new Date().toISOString();
  const current = await getGuideStateInDb(auth.user.id, cleanKey);
  const next = {
    ...(current || {}),
    userId: auth.user.id,
    guideKey: cleanKey,
    seenAt: current?.seenAt || nowIso,
    completedAt: action === "complete" ? (current?.completedAt || nowIso) : String(current?.completedAt || ""),
    updatedAt: nowIso,
  };
  await upsertGuideStateInDb(next);
  return sendJson(res, 200, { ok: true, guide: publicOnboardingGuide(next, cleanKey) });
}

async function handleLogout(req, res) {
  const token = getBearerToken(req);
  if (token && dbEnabled()) await deleteSessionByTokenInDb(token);
  if (token && !dbEnabled()) {
    const db = await readDb();
    db.sessions = (db.sessions || []).filter((session) => session.token !== token);
    await writeDb(db);
  }
  return sendJson(res, 200, { ok: true });
}

const telegramBotClient = createTelegramBotClient({
  token: TELEGRAM_BOT_TOKEN,
  webAppUrl: TELEGRAM_BOT_WEBAPP_URL,
  telegramChannelUrl: VIPEAK_TELEGRAM_CHANNEL_URL,
  xUrl: VIPEAK_X_URL,
});
const telegramTaskNotificationStages = new Map();
const telegramUserContextCache = new Map();

function telegramBotEnabled() {
  return Boolean(TELEGRAM_BOT_TOKEN && TELEGRAM_BOT_WEBHOOK_SECRET && telegramBotClient.enabled);
}

function telegramBotWebhookPathMatches(pathname = "") {
  const basePath = TELEGRAM_BOT_WEBHOOK_PATH;
  const pathValue = String(pathname || "");
  return pathValue === basePath
    || (TELEGRAM_BOT_WEBHOOK_SECRET && pathValue === `${basePath}/${TELEGRAM_BOT_WEBHOOK_SECRET}`);
}

const TELEGRAM_OIDC_JWKS_URL = "https://oauth.telegram.org/.well-known/jwks.json";
let telegramOidcJwksCache = { expiresAt: 0, value: null };

async function telegramOidcJwks() {
  if (telegramOidcJwksCache.value && telegramOidcJwksCache.expiresAt > Date.now()) {
    return telegramOidcJwksCache.value;
  }
  const response = await fetch(TELEGRAM_OIDC_JWKS_URL, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    const error = new Error(`Telegram signing keys are unavailable (${response.status}).`);
    error.statusCode = 503;
    error.code = "TELEGRAM_LOGIN_UNAVAILABLE";
    throw error;
  }
  const value = await response.json();
  if (!Array.isArray(value?.keys) || !value.keys.length) {
    const error = new Error("Telegram signing keys are unavailable.");
    error.statusCode = 503;
    error.code = "TELEGRAM_LOGIN_UNAVAILABLE";
    throw error;
  }
  telegramOidcJwksCache = { expiresAt: Date.now() + 60 * 60 * 1000, value };
  return value;
}

function telegramLoginConfigured() {
  return Boolean(TELEGRAM_LOGIN_BOT_TOKEN && /^\d+$/.test(TELEGRAM_LOGIN_CLIENT_ID));
}

function telegramUserFromDb(db, telegramUserId = "", tenantId = UNDRESS_TOOL_TENANT_ID) {
  const id = String(telegramUserId || "").trim();
  if (!id) return null;
  return (db?.users || []).find((user) => String(user.telegramUserId || "") === id && recordBelongsToTenant(user, tenantId)) || null;
}

function telegramUsernameCandidate(telegramUser = {}) {
  const source = String(telegramUser.username || `user_${telegramUser.id || ""}`).trim().toLowerCase();
  const clean = source.replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 18) || `user_${String(telegramUser.id || "0")}`;
  return `tg_${clean}`.slice(0, 24);
}

function uniqueTelegramUsername(db, telegramUser = {}, tenantId = UNDRESS_TOOL_TENANT_ID) {
  const base = telegramUsernameCandidate(telegramUser);
  let candidate = base;
  let suffix = 1;
  while ((db.users || []).some((user) => user.username === candidate && recordBelongsToTenant(user, tenantId))) {
    const suffixText = `_${suffix}`;
    candidate = `${base.slice(0, 24 - suffixText.length)}${suffixText}`;
    suffix += 1;
  }
  return candidate;
}

async function ensureTelegramUserAccount(telegramUser = {}, {
  tenantId = UNDRESS_TOOL_TENANT_ID,
  host = "",
  registrationMedium = "telegram-mini-app",
  referralCode = "",
  attribution = null,
} = {}) {
  const normalizedTenant = normalizeTenantId(tenantId);
  const telegramUserId = String(telegramUser.id || "").trim();
  if (!telegramUserId) {
    const error = new Error("Telegram user information is missing.");
    error.statusCode = 401;
    error.code = "TELEGRAM_USER_MISSING";
    throw error;
  }
  const now = new Date().toISOString();
  const db = lightweightAuthDb();
  let user = await getUserByTelegramIdInDb(telegramUserId, normalizedTenant)
    || telegramUserFromDb(db, telegramUserId, normalizedTenant);
  if (user) db.users = [user];
  let created = false;
  let referrer = null;
  if (!user) {
    const landingPreview = landingFieldsFromBody({ referralCode, attribution });
    const normalizedReferralCode = landingPreview.referralCode || normalizeReferralCode(referralCode);
    const referrerId = userIdFromReferralCode(normalizedReferralCode);
    referrer = referrerId ? (await getUserByIdInDb(referrerId) || db.users.find((item) => item.id === referrerId)) : null;
    user = {
      id: randomId("user"),
      tenantId: normalizedTenant,
      username: await allocateUsername(telegramUsernameCandidate(telegramUser), normalizedTenant, db),
      passwordHash: hashPassword(crypto.randomBytes(32).toString("hex")),
      role: "user",
      credits: 0,
      pricingMultiplier: 1,
      apiPricingMultiplier: 1,
      apiToken: makeUniqueApiToken(db),
      registrationChannel: "telegram",
      registrationAttribution: {
        channel: "telegram",
        medium: String(registrationMedium || "telegram-login").slice(0, 80),
        landingPath: "/",
        host: String(host || "").trim().slice(0, 160),
        registeredAt: now,
      },
      createdAt: now,
      updatedAt: now,
    };
    if (referrer?.id && recordBelongsToTenant(referrer, normalizedTenant)) {
      user.referral = {
        referredByUserId: referrer.id,
        referredByUsername: referrer.username || "",
        referralCode: normalizedReferralCode,
        registeredAt: now,
      };
    }
    attachRegistrationLanding(user, landingPreview, referrer, now, host);
    db.users.push(user);
    created = true;
  }

  user.tenantId = normalizedTenant;
  user.telegramUserId = telegramUserId;
  user.telegramChatId = telegramUserId;
  user.telegramUsername = String(telegramUser.username || "").trim();
  user.telegramFirstName = String(telegramUser.first_name || "").trim().slice(0, 80);
  user.telegramLastName = String(telegramUser.last_name || "").trim().slice(0, 80);
  user.telegramLanguageCode = String(telegramUser.language_code || "").trim().slice(0, 16);
  user.telegramPhotoUrl = String(telegramUser.photo_url || "").trim().slice(0, 1000);
  user.telegramPhoneNumber = String(telegramUser.phone_number || "").trim().slice(0, 40);
  user.telegramUpdatedAt = now;
  user.updatedAt = now;
  ensureUserApiToken(user, db);

  if (dbEnabled()) await updateUserInDb(user);
  else await writeDb(db);
  if (created && referrer?.id) {
    const wasMember = userHasCreatorMembership(referrer);
    await ensureCreatorMembershipFromReferrals(db, referrer);
    if (!wasMember && userHasCreatorMembership(referrer)) await grantPendingReferralRewardsForMember(db, referrer);
    if (!dbEnabled()) await writeDb(db);
  }
  telegramUserContextCache.set(user.id, { user, expiresAt: Date.now() + 60000 });
  return { db, user, telegram: { id: telegramUserId, label: telegramBotUserLabel(telegramUser) } };
}

async function createTelegramUserSession(account, tenantId = UNDRESS_TOOL_TENANT_ID, deviceId = "") {
  const normalizedTenant = normalizeTenantId(tenantId);
  const session = await createSingleLoginSession(account.db, account.user, normalizedTenant, deviceId);
  return { token: session.token, user: account.user, telegram: account.telegram, tenantId: normalizedTenant };
}

async function telegramUserSessionFromInitData(initData = "", { tenantId = UNDRESS_TOOL_TENANT_ID, host = "", referralCode = "", attribution = null, deviceId = "" } = {}) {
  const parsed = parseTelegramWebAppInitData(initData, TELEGRAM_BOT_TOKEN);
  const account = await ensureTelegramUserAccount(parsed.user || {}, { tenantId, host, registrationMedium: "telegram-mini-app", referralCode, attribution });
  return createTelegramUserSession(account, tenantId, deviceId);
}

async function handleTelegramWebAppAuth(req, res) {
  if (!TELEGRAM_BOT_TOKEN) return sendJson(res, 503, { ok: false, message: "Telegram login is not configured." });
  const tenant = requestTenantDescriptor(req);
  const body = await readJson(req, AUTH_JSON_BODY_MAX_BYTES);
  const telegramRisk = await enforceGoogleLoginRisk(req);
  if (!telegramRisk.ok) return authRateLimitedResponse(res, telegramRisk);
  const result = await telegramUserSessionFromInitData(body.initData || "", { tenantId: tenant.tenantId, host: requestHostname(req), referralCode: body.referralCode || body.referral || body.ref || "", attribution: body.attribution || null, deviceId: body.deviceId || body.device_id || "" });
  return sendJson(res, 200, {
    ok: true,
    token: result.token,
    user: userView(result.user),
    tenantId: result.tenantId,
    telegram: result.telegram,
  });
}

function telegramUserFromOidcClaims(claims = {}) {
  return {
    id: String(claims.sub || claims.id || "").trim(),
    username: String(claims.preferred_username || claims.username || "").trim(),
    first_name: String(claims.given_name || claims.first_name || claims.name || "").trim(),
    last_name: String(claims.family_name || claims.last_name || "").trim(),
    language_code: String(claims.locale || claims.language_code || "").trim(),
    photo_url: String(claims.picture || claims.photo_url || "").trim(),
    phone_number: String(claims.phone_number || "").trim(),
  };
}

async function handleTelegramLoginOptions(req, res) {
  if (!telegramLoginConfigured()) {
    return sendJson(res, 503, { ok: false, code: "TELEGRAM_LOGIN_NOT_CONFIGURED", message: "Telegram login is not configured." });
  }
  const tenant = requestTenantDescriptor(req);
  const host = requestHostname(req);
  const nonce = createTelegramLoginNonce(TELEGRAM_LOGIN_BOT_TOKEN, { tenantId: tenant.tenantId, host });
  return sendJson(res, 200, { ok: true, clientId: TELEGRAM_LOGIN_CLIENT_ID, nonce });
}

async function handleTelegramLogin(req, res) {
  if (!telegramLoginConfigured()) {
    return sendJson(res, 503, { ok: false, code: "TELEGRAM_LOGIN_NOT_CONFIGURED", message: "Telegram login is not configured." });
  }
  const tenant = requestTenantDescriptor(req);
  const host = requestHostname(req);
  const body = await readJson(req, AUTH_JSON_BODY_MAX_BYTES);
  const telegramRisk = await enforceGoogleLoginRisk(req);
  if (!telegramRisk.ok) return authRateLimitedResponse(res, telegramRisk);
  const idToken = String(body.idToken || body.id_token || "").trim();
  const tokenParts = idToken.split(".");
  if (tokenParts.length !== 3) return sendJson(res, 401, { ok: false, code: "TELEGRAM_LOGIN_INVALID", message: "Telegram login response is invalid." });
  let unsignedClaims = null;
  try {
    unsignedClaims = JSON.parse(Buffer.from(tokenParts[1], "base64url").toString("utf8"));
  } catch {
    unsignedClaims = null;
  }
  const nonce = String(unsignedClaims?.nonce || "").trim();
  parseTelegramLoginNonce(nonce, TELEGRAM_LOGIN_BOT_TOKEN, { tenantId: tenant.tenantId, host });
  const claims = verifyTelegramOidcIdToken(idToken, {
    clientId: TELEGRAM_LOGIN_CLIENT_ID,
    expectedNonce: nonce,
    jwks: await telegramOidcJwks(),
  });
  const account = await ensureTelegramUserAccount(telegramUserFromOidcClaims(claims), {
    tenantId: tenant.tenantId,
    host,
    registrationMedium: "telegram-oidc",
    referralCode: body.referralCode || body.referral || body.ref || "",
    attribution: body.attribution || null,
  });
  const result = await createTelegramUserSession(account, tenant.tenantId, body.deviceId || body.device_id || "");
  return sendJson(res, 200, {
    ok: true,
    token: result.token,
    user: userView(result.user),
    tenantId: result.tenantId,
    telegram: result.telegram,
  });
}

async function persistTelegramBotSupportMessage(message = {}) {
  const record = await persistTelegramSupportMessage(message);
  const telegramUserId = String(message.from?.id || "").trim();
  if (!telegramUserId) return record;
  const user = await getUserByTelegramIdInDb(telegramUserId, UNDRESS_TOOL_TENANT_ID);
  if (!user) return record;
  const updatedAt = new Date().toISOString();
  const patch = {
    userId: user.id,
    tenantId: UNDRESS_TOOL_TENANT_ID,
    source: "telegram-undress",
    updatedAt,
  };
  const stored = await updateUserSupportMessageInDb(record.id, patch);
  return stored || { ...record, ...patch };
}

