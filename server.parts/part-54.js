// Workflow canvas visibility, dynamic invite codes, unlock & fork handlers.

const WORKFLOW_INVITE_RATE_WINDOW_MS = 10 * 60_000;
const WORKFLOW_INVITE_MAX_FAILURES = 10;
const workflowInviteFailureBuckets = new Map();

function checkWorkflowInviteRateLimit(keys = [], nowMs = Date.now()) {
  if (workflowInviteFailureBuckets.size > 4000) {
    for (const [k, entry] of workflowInviteFailureBuckets.entries()) {
      if (!entry || nowMs - entry.windowStart > WORKFLOW_INVITE_RATE_WINDOW_MS) workflowInviteFailureBuckets.delete(k);
    }
  }
  for (const key of keys) {
    if (!key) continue;
    const entry = workflowInviteFailureBuckets.get(key);
    if (!entry) continue;
    if (nowMs - entry.windowStart > WORKFLOW_INVITE_RATE_WINDOW_MS) {
      workflowInviteFailureBuckets.delete(key);
      continue;
    }
    if (entry.count >= WORKFLOW_INVITE_MAX_FAILURES) {
      const retryAfterSec = Math.max(1, Math.ceil((WORKFLOW_INVITE_RATE_WINDOW_MS - (nowMs - entry.windowStart)) / 1000));
      return { blocked: true, retryAfterSec };
    }
  }
  return { blocked: false, retryAfterSec: 0 };
}

function recordWorkflowInviteFailure(keys = [], nowMs = Date.now()) {
  for (const key of keys) {
    if (!key) continue;
    const entry = workflowInviteFailureBuckets.get(key);
    if (!entry || nowMs - entry.windowStart > WORKFLOW_INVITE_RATE_WINDOW_MS) {
      workflowInviteFailureBuckets.set(key, { count: 1, windowStart: nowMs });
    } else {
      entry.count += 1;
    }
  }
}

function clearWorkflowInviteFailures(keys = []) {
  for (const key of keys) {
    if (key) workflowInviteFailureBuckets.delete(key);
  }
}

async function hydrateSharedWorkflowUploadedMedia(canvas = {}, { stripOwnerAssetIds = false } = {}) {
  const workflow = canvas?.workflow && typeof canvas.workflow === "object" ? canvas.workflow : null;
  if (!workflow || !Array.isArray(workflow.nodes) || !workflow.nodes.length) return canvas;
  const uploadNodes = workflow.nodes.filter((node) => node?.data?.source === "upload");
  const assetIds = [...new Set(uploadNodes.flatMap((node) => [
    String(node.data?.resultImageAssetId || "").trim(),
    String(node.data?.resultVideoAssetId || "").trim(),
  ]).filter(Boolean))].slice(0, 50);
  const assetMap = new Map();
  if (assetIds.length && canvas.userId) {
    try {
      const rows = await getUserAssetsByIdsFromDb({ userId: canvas.userId, assetIds });
      rows.forEach((asset) => {
        const pub = publicUserAsset(asset);
        if (pub?.id) assetMap.set(String(pub.id), pub);
      });
    } catch {
      // Keep stored URLs if asset refresh transiently fails.
    }
  }
  const nodes = workflow.nodes.map((node) => {
    if (!node || typeof node !== "object") return node;
    const data = node.data && typeof node.data === "object" ? { ...node.data } : {};
    if (data.source === "upload") {
      const imgAsset = data.resultImageAssetId ? assetMap.get(String(data.resultImageAssetId).trim()) : null;
      const vidAsset = data.resultVideoAssetId ? assetMap.get(String(data.resultVideoAssetId).trim()) : null;
      if (imgAsset) {
        const url = String(imgAsset.previewUrl || imgAsset.publicUrl || imgAsset.localUrl || "").trim();
        const poster = String(imgAsset.posterUrl || url).trim();
        if (url) {
          data.resultImageUrl = url;
          data.resultImageUrls = [url];
          data.posterUrl = poster;
        }
      }
      if (vidAsset) {
        const url = String(vidAsset.previewUrl || vidAsset.publicUrl || vidAsset.localUrl || "").trim();
        const poster = String(vidAsset.posterUrl || vidAsset.previewUrl || vidAsset.publicUrl || "").trim();
        if (url) {
          data.resultVideoUrl = url;
          data.resultVideoUrls = [url];
          data.posterUrl = poster;
        }
      }
    }
    if (stripOwnerAssetIds) {
      delete data.resultImageAssetId;
      delete data.resultVideoAssetId;
      delete data.assetId;
    }
    return { ...node, data };
  });
  return { ...canvas, workflow: { ...workflow, nodes } };
}

async function authorizeWorkflowCanvasRead({ req, auth, canvasId = "" } = {}) {
  const canvas = await getWorkflowCanvasByIdFromDb(canvasId);
  if (canvas === null && !dbEnabled()) {
    return { ok: false, statusCode: 503, body: { ok: false, message: "Workflow storage is unavailable." } };
  }
  const tenantId = requestTenantId(req);
  if (!canvas || !recordBelongsToTenant(canvas, tenantId)) {
    return { ok: false, statusCode: 404, body: { ok: false, code: "WORKFLOW_CANVAS_NOT_FOUND", message: "画布不存在或已删除。" } };
  }
  const isOwner = canvas.userId === auth.user.id;
  if (isOwner) return { ok: true, canvas, isOwner: true, unlocked: true };
  if (canvas.visibility === "private") {
    return { ok: false, statusCode: 403, body: { ok: false, code: "WORKFLOW_CANVAS_PRIVATE", message: "该画布未公开，无权限查看。" } };
  }
  if (canvas.visibility === "public") {
    return { ok: true, canvas, isOwner: false, unlocked: true };
  }
  const unlock = await getWorkflowCanvasUnlockFromDb({ canvasId: canvas.id, userId: auth.user.id });
  if (unlock) return { ok: true, canvas, isOwner: false, unlocked: true, unlock };
  return {
    ok: false,
    statusCode: 403,
    body: {
      ok: false,
      code: "WORKFLOW_CANVAS_LOCKED",
      message: "该画布为教程模版，请通过积分解锁或输入邀请码后查看结构。",
      template: publicAssetUrlsForClient(publicWorkflowCanvasLockedView(canvas, { userCredits: auth.user?.credits || 0 })),
    },
  };
}


async function handleListPublicWorkflowTemplates(req, res, url) {
  if (requestTenantDescriptor(req).toolOnly) return sendJson(res, 404, { ok: false, message: "API not found." });
  const auth = await getAuth(req, { loadDb: false });
  const viewerUserId = auth?.user?.id || "";
  const visibility = url?.searchParams?.get("visibility") || "all";
  const sort = url?.searchParams?.get("sort") || "latest";
  const search = url?.searchParams?.get("q") || "";
  const limit = Number(url?.searchParams?.get("limit") || 60);
  const offset = Number(url?.searchParams?.get("offset") || 0);
  const rows = await listPublicWorkflowTemplatesFromDb({
    tenantId: requestTenantId(req),
    viewerUserId,
    visibility,
    sort,
    search,
    limit,
    offset,
  });
  if (rows === null) return sendJson(res, 503, { ok: false, message: "Workflow storage is unavailable." });
  const templates = rows.map((canvas) => {
    const isOwner = Boolean(viewerUserId && canvas.userId === viewerUserId);
    const unlocked = Boolean(isOwner || canvas.visibility === "public" || canvas.unlocked);
    return publicAssetUrlsForClient(publicWorkflowTemplateSummary(canvas, {
      isOwner,
      unlocked,
      includeOwnerControls: false,
    }));
  });
  return sendJson(res, 200, { ok: true, templates, loggedIn: Boolean(viewerUserId) });
}


async function handleUpdateWorkflowCanvasSharing(req, res, canvasId = "") {
  if (requestTenantDescriptor(req).toolOnly) return sendJson(res, 404, { ok: false, message: "API not found." });
  const auth = await requireUser(req, res, { loadDb: false });
  if (!auth) return;
  const existing = await getWorkflowCanvasFromDb({ id: canvasId, userId: auth.user.id });
  if (existing === null && !dbEnabled()) return sendJson(res, 503, { ok: false, message: "Workflow storage is unavailable." });
  if (!existing) return sendJson(res, 404, { ok: false, code: "WORKFLOW_CANVAS_NOT_FOUND", message: "Workflow not found." });
  try {
    const body = await readJson(req, 64 * 1024);
    const sharing = validateWorkflowSharingPatch(body, existing);
    const updated = await updateWorkflowCanvasSharingInDb({
      id: canvasId,
      userId: auth.user.id,
      tenantId: requestTenantId(req),
      sharing,
    });
    if (!updated) return sendJson(res, 404, { ok: false, code: "WORKFLOW_CANVAS_NOT_FOUND", message: "Workflow not found." });
    return sendJson(res, 200, {
      ok: true,
      canvas: publicAssetUrlsForClient(publicWorkflowCanvasSummary(updated, { isOwner: true, includeOwnerControls: true })),
    });
  } catch (error) {
    return sendWorkflowCanvasValidationError(res, error);
  }
}

async function handleRotateWorkflowCanvasInviteCode(req, res, canvasId = "") {
  if (requestTenantDescriptor(req).toolOnly) return sendJson(res, 404, { ok: false, message: "API not found." });
  const auth = await requireUser(req, res, { loadDb: false });
  if (!auth) return;
  const existing = await getWorkflowCanvasFromDb({ id: canvasId, userId: auth.user.id });
  if (existing === null && !dbEnabled()) return sendJson(res, 503, { ok: false, message: "Workflow storage is unavailable." });
  if (!existing) return sendJson(res, 404, { ok: false, code: "WORKFLOW_CANVAS_NOT_FOUND", message: "Workflow not found." });
  const updated = await rotateWorkflowCanvasInviteCodeInDb({
    id: canvasId,
    userId: auth.user.id,
    nextCode: generateStaticInviteCode(),
    nextSecret: existing.inviteSecret || generateInviteSecret(),
  });
  if (!updated) return sendJson(res, 404, { ok: false, code: "WORKFLOW_CANVAS_NOT_FOUND", message: "Workflow not found." });
  return sendJson(res, 200, {
    ok: true,
    canvas: publicAssetUrlsForClient(publicWorkflowCanvasSummary(updated, { isOwner: true, includeOwnerControls: true })),
  });
}

async function handleUnlockWorkflowCanvas(req, res, canvasId = "") {
  if (requestTenantDescriptor(req).toolOnly) return sendJson(res, 404, { ok: false, message: "API not found." });
  const auth = await requireUser(req, res, { loadDb: false });
  if (!auth) return;
  let body = {};
  try {
    body = await readJson(req, 32 * 1024);
  } catch (error) {
    return sendWorkflowCanvasValidationError(res, error);
  }
  const rawMethod = String(body.method || "").trim().toLowerCase();
  const method = rawMethod || (body.inviteCode || body.code ? "invite_code" : "credits");
  const tenantId = requestTenantId(req);

  if (method === "credits") {
    const result = await unlockWorkflowCanvasWithCreditsInDb({
      canvasId,
      userId: auth.user.id,
      tenantId,
      unlockId: randomId("wfu"),
      ledgerId: `wf_unlock:${canvasId}:${auth.user.id}`,
    });
    if (result === null) return sendJson(res, 503, { ok: false, message: "Workflow storage is unavailable." });
    if (!result.ok) {
      return sendJson(res, Number(result.statusCode || 400), {
        ok: false,
        code: result.code || "WORKFLOW_UNLOCK_FAILED",
        message: result.message || "积分解锁失败。",
        credits: result.credits,
        requiredCredits: result.requiredCredits,
      });
    }
    const isOwner = result.canvas.userId === auth.user.id;
    const hydrated = await hydrateSharedWorkflowUploadedMedia(result.canvas, { stripOwnerAssetIds: !isOwner });
    return sendJson(res, 200, {
      ok: true,
      unlocked: true,
      method: "credits",
      alreadyUnlocked: Boolean(result.alreadyUnlocked),
      charged: Boolean(result.charged),
      creditsSpent: Number(result.creditsSpent || 0),
      user: result.user ? userView(result.user) : undefined,
      canvas: publicAssetUrlsForClient(publicWorkflowCanvasView(hydrated, { isOwner, unlocked: true })),
    });
  }

  if (method === "invite_code") {
    const ip = authClientIp(req);
    const rateKeys = [`u:${auth.user.id}:${canvasId}`, ip ? `ip:${ip}:${canvasId}` : ""];
    const limit = checkWorkflowInviteRateLimit(rateKeys);
    if (limit.blocked) {
      return sendJson(res, 429, {
        ok: false,
        code: "INVITE_CODE_RATE_LIMITED",
        message: `邀请码尝试次数过多，请在 ${limit.retryAfterSec} 秒后重试。`,
        retryAfterSec: limit.retryAfterSec,
      });
    }
    const inviteCode = String(body.inviteCode || body.code || "").trim();
    const result = await unlockWorkflowCanvasWithCodeInDb({
      canvasId,
      userId: auth.user.id,
      tenantId,
      unlockId: randomId("wfu"),
      verifyFn: (canvas) => verifyWorkflowInviteCode(canvas, inviteCode),
    });
    if (result === null) return sendJson(res, 503, { ok: false, message: "Workflow storage is unavailable." });
    if (!result.ok) {
      if (["INVALID_INVITE_CODE", "INVITE_CODE_EXPIRED", "INVITE_CODE_EXHAUSTED"].includes(result.code)) {
        recordWorkflowInviteFailure(rateKeys);
      }
      return sendJson(res, Number(result.statusCode || 400), {
        ok: false,
        code: result.code || "INVALID_INVITE_CODE",
        message: result.message || "邀请码校验失败。",
      });
    }
    clearWorkflowInviteFailures(rateKeys);
    const isOwner = result.canvas.userId === auth.user.id;
    const hydrated = await hydrateSharedWorkflowUploadedMedia(result.canvas, { stripOwnerAssetIds: !isOwner });
    return sendJson(res, 200, {
      ok: true,
      unlocked: true,
      method: "invite_code",
      alreadyUnlocked: Boolean(result.alreadyUnlocked),
      charged: false,
      creditsSpent: 0,
      canvas: publicAssetUrlsForClient(publicWorkflowCanvasView(hydrated, { isOwner, unlocked: true })),
    });
  }

  return sendJson(res, 400, { ok: false, code: "INVALID_UNLOCK_METHOD", message: "不支持的解锁方式。" });
}

async function handleForkWorkflowCanvas(req, res, canvasId = "") {
  if (requestTenantDescriptor(req).toolOnly) return sendJson(res, 404, { ok: false, message: "API not found." });
  const auth = await requireUser(req, res, { loadDb: false });
  if (!auth) return;
  const access = await authorizeWorkflowCanvasRead({ req, auth, canvasId });
  if (!access.ok) return sendJson(res, access.statusCode, access.body);
  const existing = await listWorkflowCanvasesFromDb(auth.user.id);
  if (existing === null) return sendJson(res, 503, { ok: false, message: "Workflow storage is unavailable." });
  if (existing.length >= WORKFLOW_CANVAS_LIMIT) {
    return sendJson(res, 400, { ok: false, code: "WORKFLOW_CANVAS_LIMIT", message: `最多保存 ${WORKFLOW_CANVAS_LIMIT} 个画布项目，请先清理后再复制。` });
  }
  let body = {};
  try {
    body = await readJson(req, 32 * 1024);
  } catch {
    body = {};
  }
  const hydrated = await hydrateSharedWorkflowUploadedMedia(access.canvas, { stripOwnerAssetIds: true });
  const sanitized = sanitizeWorkflowForFork(hydrated.workflow);
  const defaultName = `${normalizeWorkflowCanvasName(access.canvas.name)}（副本）`;
  const created = await createWorkflowCanvasInDb({
    id: randomId("workflow"),
    userId: auth.user.id,
    tenantId: requestTenantId(req),
    name: normalizeWorkflowCanvasName(body.name || defaultName),
    workflow: sanitized,
    forkSourceId: access.canvas.id,
  });
  if (!created) return sendJson(res, 503, { ok: false, message: "Workflow storage is unavailable." });
  await incrementWorkflowCanvasForkCountInDb(access.canvas.id).catch(() => {});
  return sendJson(res, 201, {
    ok: true,
    canvas: publicAssetUrlsForClient(publicWorkflowCanvasView(created, { isOwner: true })),
  });
}


async function dispatchWorkflowSharingRoute(req, res, url) {
  const workflowShareLandingMatch = url.pathname.match(/^\/canvas\/([^/]+)\/?$/);
  if ((req.method === "GET" || req.method === "HEAD") && workflowShareLandingMatch) {
    const targetId = decodeURIComponent(workflowShareLandingMatch[1]);
    const hashParams = new URLSearchParams({ canvas: targetId });
    const code = String(url.searchParams.get("code") || "").trim();
    if (code) hashParams.set("code", code);
    res.writeHead(302, { Location: `/#workflow?${hashParams.toString()}` });
    res.end();
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/workflow/templates") {
    await handleListPublicWorkflowTemplates(req, res, url);
    return true;
  }

  const workflowCanvasSharingMatch = url.pathname.match(/^\/api\/workflow\/canvases\/([^/]+)\/sharing\/?$/);
  if (["PATCH", "PUT"].includes(req.method) && workflowCanvasSharingMatch) {
    await handleUpdateWorkflowCanvasSharing(req, res, decodeURIComponent(workflowCanvasSharingMatch[1]));
    return true;
  }

  const workflowCanvasRotateCodeMatch = url.pathname.match(/^\/api\/workflow\/canvases\/([^/]+)\/invite-code\/rotate\/?$/);
  if (req.method === "POST" && workflowCanvasRotateCodeMatch) {
    await handleRotateWorkflowCanvasInviteCode(req, res, decodeURIComponent(workflowCanvasRotateCodeMatch[1]));
    return true;
  }

  const workflowCanvasUnlockMatch = url.pathname.match(/^\/api\/workflow\/canvases\/([^/]+)\/unlock\/?$/);
  if (req.method === "POST" && workflowCanvasUnlockMatch) {
    await handleUnlockWorkflowCanvas(req, res, decodeURIComponent(workflowCanvasUnlockMatch[1]));
    return true;
  }

  const workflowCanvasForkMatch = url.pathname.match(/^\/api\/workflow\/canvases\/([^/]+)\/fork\/?$/);
  if (req.method === "POST" && workflowCanvasForkMatch) {
    await handleForkWorkflowCanvas(req, res, decodeURIComponent(workflowCanvasForkMatch[1]));
    return true;
  }

  return false;
}
