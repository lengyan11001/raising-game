const crypto = require("node:crypto");

const WORKFLOW_CANVAS_LIMIT = 50;
const WORKFLOW_CANVAS_VISIBILITIES = Object.freeze(["private", "public", "semi_public"]);
const WORKFLOW_CANVAS_INVITE_MODES = Object.freeze(["static", "rotating"]);
const WORKFLOW_CANVAS_DESCRIPTION_LIMIT = 240;
const WORKFLOW_CANVAS_UNLOCK_CREDITS_MAX = 100000;
const WORKFLOW_CANVAS_ROTATE_MIN_SEC = 300;
const WORKFLOW_CANVAS_ROTATE_MAX_SEC = 2592000;
const WORKFLOW_CANVAS_ROTATE_DEFAULT_SEC = 86400;
const WORKFLOW_CANVAS_INVITE_GRACE_SEC = 60;
const WORKFLOW_INVITE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const WORKFLOW_INVITE_CODE_LENGTH = 8;
const WORKFLOW_CANVAS_NAME_LIMIT = 80;
const WORKFLOW_CANVAS_NODE_LIMIT = 100;
const WORKFLOW_CANVAS_EDGE_LIMIT = 200;
const WORKFLOW_DIRECTOR_PROMPT_LIMIT = 6000;
const WORKFLOW_CANVAS_PAYLOAD_BYTES = 64 * 1024 * 1024;
const WORKFLOW_CANVAS_WRITE_PAYLOAD_BYTES = 8 * 1024 * 1024;

// New canvases start empty. Nodes are added explicitly, as in the reference editor.
const DEFAULT_NODES = Object.freeze([]);
const DEFAULT_EDGES = Object.freeze([]);

function plainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function boundedNumber(value, fallback, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
}

function safeJsonClone(value, fallback = {}) {
  try {
    const json = JSON.stringify(value);
    if (Buffer.byteLength(json, "utf8") > WORKFLOW_CANVAS_PAYLOAD_BYTES) {
      throw new Error("Workflow canvas is too large.");
    }
    return JSON.parse(json);
  } catch (error) {
    if (error?.message === "Workflow canvas is too large.") throw error;
    return fallback;
  }
}

function normalizeWorkflowVisibility(value = "", fallback = "private") {
  const clean = String(value || "").trim().toLowerCase();
  return WORKFLOW_CANVAS_VISIBILITIES.includes(clean) ? clean : fallback;
}

function normalizeWorkflowDescription(value = "") {
  return String(value || "").trim().slice(0, WORKFLOW_CANVAS_DESCRIPTION_LIMIT);
}

function normalizeWorkflowInviteMode(value = "", fallback = "static") {
  const clean = String(value || "").trim().toLowerCase();
  return WORKFLOW_CANVAS_INVITE_MODES.includes(clean) ? clean : fallback;
}

function normalizeWorkflowRotateInterval(value, fallback = WORKFLOW_CANVAS_ROTATE_DEFAULT_SEC) {
  const numeric = Math.trunc(Number(value));
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return Math.max(WORKFLOW_CANVAS_ROTATE_MIN_SEC, Math.min(WORKFLOW_CANVAS_ROTATE_MAX_SEC, numeric));
}

function normalizeWorkflowUnlockCredits(value = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  const clamped = Math.min(WORKFLOW_CANVAS_UNLOCK_CREDITS_MAX, numeric);
  return Math.round(clamped * 100) / 100;
}

function normalizeWorkflowInviteMaxUses(value = 0) {
  const numeric = Math.trunc(Number(value));
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.min(1000000, numeric);
}

function normalizeWorkflowInviteExpiresAt(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const time = Date.parse(raw);
  return Number.isFinite(time) ? new Date(time).toISOString() : "";
}

function normalizeInviteCodeInput(value = "") {
  return String(value || "")
    .toUpperCase()
    .replace(/[\s-]+/g, "")
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 32);
}

function generateStaticInviteCode(length = WORKFLOW_INVITE_CODE_LENGTH) {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += WORKFLOW_INVITE_ALPHABET[bytes[i] & 31];
  }
  return out;
}

function generateInviteSecret() {
  return crypto.randomBytes(24).toString("hex");
}

function timingSafeCodeEqual(left = "", right = "") {
  const a = Buffer.from(normalizeInviteCodeInput(left), "utf8");
  const b = Buffer.from(normalizeInviteCodeInput(right), "utf8");
  if (!a.length || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function computeRotatingInviteCode({
  canvasId = "",
  inviteSecret = "",
  inviteVersion = 1,
  intervalSec = WORKFLOW_CANVAS_ROTATE_DEFAULT_SEC,
  atMs = Date.now(),
  slotOffset = 0,
} = {}) {
  const cleanId = String(canvasId || "").trim();
  const secret = String(inviteSecret || "").trim();
  if (!cleanId || !secret) return { code: "", nextRotateAt: "", slot: 0 };
  const periodSec = normalizeWorkflowRotateInterval(intervalSec);
  const periodMs = periodSec * 1000;
  const baseSlot = Math.floor(Math.max(0, Number(atMs) || Date.now()) / periodMs);
  const slot = baseSlot + (Math.trunc(Number(slotOffset) || 0));
  const version = Math.max(1, Math.trunc(Number(inviteVersion) || 1));
  const digest = crypto.createHmac("sha256", secret)
    .update(`wf-invite:${cleanId}:${version}:${slot}`)
    .digest();
  let code = "";
  for (let i = 0; i < WORKFLOW_INVITE_CODE_LENGTH; i += 1) {
    code += WORKFLOW_INVITE_ALPHABET[digest[i] & 31];
  }
  const nextRotateAt = new Date((baseSlot + 1) * periodMs).toISOString();
  return { code, nextRotateAt, slot };
}

function normalizeWorkflowCanvasName(value = "", fallback = "Untitled workflow") {
  return String(value || "").trim().slice(0, WORKFLOW_CANVAS_NAME_LIMIT) || fallback;
}

function validateWorkflowCanvasForWrite(value = {}) {
  let json = "";
  try {
    json = JSON.stringify(value);
  } catch {
    throw new Error("Workflow canvas must be valid JSON.");
  }
  if (Buffer.byteLength(json, "utf8") > WORKFLOW_CANVAS_WRITE_PAYLOAD_BYTES) {
    const error = new Error("Workflow canvas is too large. Store media as uploaded asset references.");
    error.statusCode = 413;
    error.code = "WORKFLOW_CANVAS_TOO_LARGE";
    throw error;
  }
  const stack = [value];
  while (stack.length) {
    const current = stack.pop();
    if (typeof current === "string") {
      if (/^data:(?:image|video|audio)\/[a-z0-9.+-]+;base64,/i.test(current)) {
        const error = new Error("Workflow media must be uploaded and stored as an asset reference.");
        error.statusCode = 400;
        error.code = "WORKFLOW_EMBEDDED_MEDIA_NOT_ALLOWED";
        throw error;
      }
      continue;
    }
    if (Array.isArray(current)) {
      current.forEach((item) => stack.push(item));
    } else if (plainObject(current)) {
      Object.values(current).forEach((item) => stack.push(item));
    }
  }
  return value;
}

function defaultWorkflowCanvasState() {
  return {
    nodes: DEFAULT_NODES.map((node) => ({ ...node, data: { ...node.data } })),
    edges: DEFAULT_EDGES.map((edge) => ({ ...edge })),
    physics: [],
    directorPrompt: "",
    zoom: 1,
    layoutVersion: 7,
    canvasWidth: 3200,
    canvasHeight: 720,
    scrollLeft: 0,
    scrollTop: 0,
    viewport: null,
  };
}

function normalizeWorkflowCanvasState(value = {}) {
  if (!plainObject(value)) throw new Error("Workflow canvas must be an object.");
  const nodes = Array.isArray(value.nodes) ? value.nodes : [];
  const edges = Array.isArray(value.edges) ? value.edges : [];
  if (nodes.length > WORKFLOW_CANVAS_NODE_LIMIT) throw new Error(`Workflow canvas supports up to ${WORKFLOW_CANVAS_NODE_LIMIT} nodes.`);
  if (edges.length > WORKFLOW_CANVAS_EDGE_LIMIT) throw new Error(`Workflow canvas supports up to ${WORKFLOW_CANVAS_EDGE_LIMIT} edges.`);

  const normalizedNodes = nodes.map((node, index) => {
    if (!plainObject(node)) throw new Error(`Workflow node ${index + 1} is invalid.`);
    const id = String(node.id || "").trim().slice(0, 120);
    if (!id) throw new Error(`Workflow node ${index + 1} is missing an id.`);
    return {
      ...safeJsonClone(node, {}),
      id,
      type: String(node.type || "video").trim().slice(0, 40) || "video",
      title: String(node.title || "Node").trim().slice(0, 120) || "Node",
      x: boundedNumber(node.x, 0, -20000, 20000),
      y: boundedNumber(node.y, 0, -20000, 20000),
      data: plainObject(node.data) ? safeJsonClone(node.data, {}) : {},
    };
  });
  const nodeIds = new Set(normalizedNodes.map((node) => node.id));
  if (nodeIds.size !== normalizedNodes.length) throw new Error("Workflow node ids must be unique.");
  const normalizedEdges = edges
    .map((edge) => ({ from: String(edge?.from || "").trim().slice(0, 120), to: String(edge?.to || "").trim().slice(0, 120) }))
    .filter((edge) => edge.from && edge.to && edge.from !== edge.to && nodeIds.has(edge.from) && nodeIds.has(edge.to));

  const state = {
    nodes: normalizedNodes,
    edges: normalizedEdges,
    physics: Array.from(new Set((Array.isArray(value.physics) ? value.physics : []).map((item) => String(item || "").trim().slice(0, 80)).filter(Boolean))).slice(0, 3),
    directorPrompt: String(value.directorPrompt || "").slice(0, WORKFLOW_DIRECTOR_PROMPT_LIMIT),
    zoom: boundedNumber(value.zoom, 1, 0.55, 1.8),
    layoutVersion: Math.max(0, Math.min(100, Math.trunc(Number(value.layoutVersion || 0) || 0))),
    canvasWidth: boundedNumber(value.canvasWidth, 3200, 3200, 12000),
    canvasHeight: boundedNumber(value.canvasHeight, 720, 720, 3200),
    scrollLeft: boundedNumber(value.scrollLeft, 0, 0, 12000),
    scrollTop: boundedNumber(value.scrollTop, 0, 0, 3200),
    viewport: plainObject(value.viewport)
      && Number.isFinite(Number(value.viewport.x))
      && Number.isFinite(Number(value.viewport.y))
      && Number.isFinite(Number(value.viewport.zoom))
      && Number(value.viewport.zoom) > 0
      ? {
          x: boundedNumber(value.viewport.x, 0, -200000, 200000),
          y: boundedNumber(value.viewport.y, 0, -200000, 200000),
          zoom: boundedNumber(value.viewport.zoom, 1, 0.1, 2),
        }
      : null,
  };
  safeJsonClone(state);
  return state;
}

function resolveActiveInviteCode(record = {}, nowMs = Date.now()) {
  const mode = normalizeWorkflowInviteMode(record.inviteMode || record.invite_mode, "static");
  const version = Math.max(1, Math.trunc(Number(record.inviteVersion ?? record.invite_version ?? 1) || 1));
  const rotateIntervalSec = normalizeWorkflowRotateInterval(
    record.inviteRotateIntervalSec ?? record.invite_rotate_interval_sec,
    WORKFLOW_CANVAS_ROTATE_DEFAULT_SEC,
  );
  const expiresAt = normalizeWorkflowInviteExpiresAt(record.inviteExpiresAt || record.invite_expires_at || "");
  const maxUses = normalizeWorkflowInviteMaxUses(record.inviteMaxUses ?? record.invite_max_uses ?? 0);
  const usedCount = Math.max(0, Math.trunc(Number(record.inviteUsedCount ?? record.invite_used_count ?? 0) || 0));
  if (mode === "rotating") {
    const { code, nextRotateAt } = computeRotatingInviteCode({
      canvasId: record.id,
      inviteSecret: record.inviteSecret || record.invite_secret || "",
      inviteVersion: version,
      intervalSec: rotateIntervalSec,
      atMs: nowMs,
      slotOffset: 0,
    });
    return { mode, code, version, rotateIntervalSec, nextRotateAt, expiresAt, maxUses, usedCount };
  }
  return {
    mode: "static",
    code: normalizeInviteCodeInput(record.inviteCode || record.invite_code || ""),
    version,
    rotateIntervalSec,
    nextRotateAt: "",
    expiresAt,
    maxUses,
    usedCount,
  };
}

function verifyWorkflowInviteCode(record = {}, rawInput = "", nowMs = Date.now()) {
  const visibility = normalizeWorkflowVisibility(record.visibility, "private");
  const allowCodeUnlock = record.allowCodeUnlock !== false && record.allow_code_unlock !== false;
  if (visibility !== "semi_public" || !allowCodeUnlock) {
    return { ok: false, statusCode: 400, code: "INVITE_CODE_DISABLED", message: "该画布未开启邀请码解锁。" };
  }
  const input = normalizeInviteCodeInput(rawInput);
  if (!input) {
    return { ok: false, statusCode: 400, code: "INVITE_CODE_REQUIRED", message: "请输入邀请码。" };
  }
  const expiresAt = normalizeWorkflowInviteExpiresAt(record.inviteExpiresAt || record.invite_expires_at || "");
  if (expiresAt && Date.parse(expiresAt) <= nowMs) {
    return { ok: false, statusCode: 400, code: "INVITE_CODE_EXPIRED", message: "邀请码已过期，请联系作者获取最新邀请码。" };
  }
  const maxUses = normalizeWorkflowInviteMaxUses(record.inviteMaxUses ?? record.invite_max_uses ?? 0);
  const usedCount = Math.max(0, Math.trunc(Number(record.inviteUsedCount ?? record.invite_used_count ?? 0) || 0));
  if (maxUses > 0 && usedCount >= maxUses) {
    return { ok: false, statusCode: 400, code: "INVITE_CODE_EXHAUSTED", message: "该邀请码兑换次数已用完。" };
  }
  const mode = normalizeWorkflowInviteMode(record.inviteMode || record.invite_mode, "static");
  if (mode === "rotating") {
    const intervalSec = normalizeWorkflowRotateInterval(record.inviteRotateIntervalSec ?? record.invite_rotate_interval_sec);
    const secret = String(record.inviteSecret || record.invite_secret || "").trim();
    const version = Math.max(1, Math.trunc(Number(record.inviteVersion ?? record.invite_version ?? 1) || 1));
    const current = computeRotatingInviteCode({ canvasId: record.id, inviteSecret: secret, inviteVersion: version, intervalSec, atMs: nowMs, slotOffset: 0 });
    if (timingSafeCodeEqual(input, current.code)) return { ok: true, mode, version };
    const elapsedInSlotMs = (Math.max(0, Number(nowMs) || Date.now())) % (intervalSec * 1000);
    if (elapsedInSlotMs <= WORKFLOW_CANVAS_INVITE_GRACE_SEC * 1000) {
      const prev = computeRotatingInviteCode({ canvasId: record.id, inviteSecret: secret, inviteVersion: version, intervalSec, atMs: nowMs, slotOffset: -1 });
      if (timingSafeCodeEqual(input, prev.code)) return { ok: true, mode, version, grace: true };
    }
    return { ok: false, statusCode: 400, code: "INVALID_INVITE_CODE", message: "邀请码无效或已轮换过期，请核对后重试。" };
  }
  const expected = normalizeInviteCodeInput(record.inviteCode || record.invite_code || "");
  if (!expected || !timingSafeCodeEqual(input, expected)) {
    return { ok: false, statusCode: 400, code: "INVALID_INVITE_CODE", message: "邀请码错误，请核对后重试。" };
  }
  return { ok: true, mode: "static", version: Math.max(1, Math.trunc(Number(record.inviteVersion ?? record.invite_version ?? 1) || 1)) };
}

function validateWorkflowSharingPatch(body = {}, current = {}) {
  if (!plainObject(body)) {
    const err = new Error("Sharing settings must be an object.");
    err.statusCode = 400;
    err.code = "INVALID_WORKFLOW_SHARING";
    throw err;
  }
  const currentVis = normalizeWorkflowVisibility(current.visibility, "private");
  const visibility = body.visibility !== undefined
    ? normalizeWorkflowVisibility(body.visibility, "")
    : currentVis;
  if (!visibility) {
    const err = new Error("Unsupported workflow visibility.");
    err.statusCode = 400;
    err.code = "INVALID_WORKFLOW_VISIBILITY";
    throw err;
  }
  const description = body.description !== undefined
    ? normalizeWorkflowDescription(body.description)
    : normalizeWorkflowDescription(current.description);
  const unlockCredits = body.unlockCredits !== undefined
    ? normalizeWorkflowUnlockCredits(body.unlockCredits)
    : normalizeWorkflowUnlockCredits(current.unlockCredits ?? current.unlock_credits ?? 0);
  const allowCodeUnlock = body.allowCodeUnlock !== undefined
    ? Boolean(body.allowCodeUnlock)
    : (current.allowCodeUnlock !== undefined ? Boolean(current.allowCodeUnlock) : true);
  let allowCreditUnlock = body.allowCreditUnlock !== undefined
    ? Boolean(body.allowCreditUnlock)
    : (current.allowCreditUnlock !== undefined ? Boolean(current.allowCreditUnlock) : unlockCredits > 0);
  if (visibility === "semi_public") {
    if (allowCreditUnlock && unlockCredits <= 0) {
      if (body.allowCreditUnlock === true) {
        const err = new Error("开启积分解锁时，所需积分必须大于 0。");
        err.statusCode = 400;
        err.code = "INVALID_UNLOCK_CREDITS";
        throw err;
      }
      allowCreditUnlock = false;
    }
    if (!allowCreditUnlock && !allowCodeUnlock) {
      const err = new Error("教程画布至少需要开启「积分解锁」或「邀请码解锁」中的一项。");
      err.statusCode = 400;
      err.code = "UNLOCK_METHOD_REQUIRED";
      throw err;
    }
  }
  const inviteMode = body.inviteMode !== undefined
    ? normalizeWorkflowInviteMode(body.inviteMode, "static")
    : normalizeWorkflowInviteMode(current.inviteMode || current.invite_mode, "static");
  const inviteRotateIntervalSec = body.inviteRotateIntervalSec !== undefined
    ? normalizeWorkflowRotateInterval(body.inviteRotateIntervalSec)
    : normalizeWorkflowRotateInterval(current.inviteRotateIntervalSec ?? current.invite_rotate_interval_sec);
  const inviteExpiresAt = body.inviteExpiresAt !== undefined
    ? normalizeWorkflowInviteExpiresAt(body.inviteExpiresAt)
    : normalizeWorkflowInviteExpiresAt(current.inviteExpiresAt || current.invite_expires_at || "");
  const inviteMaxUses = body.inviteMaxUses !== undefined
    ? normalizeWorkflowInviteMaxUses(body.inviteMaxUses)
    : normalizeWorkflowInviteMaxUses(current.inviteMaxUses ?? current.invite_max_uses ?? 0);
  const inviteCode = normalizeInviteCodeInput(current.inviteCode || current.invite_code || "") || generateStaticInviteCode();
  const inviteSecret = String(current.inviteSecret || current.invite_secret || "").trim() || generateInviteSecret();
  return {
    visibility,
    description,
    unlockCredits: visibility === "semi_public" && allowCreditUnlock ? unlockCredits : (visibility === "semi_public" ? unlockCredits : 0),
    allowCreditUnlock: visibility === "semi_public" ? allowCreditUnlock : false,
    allowCodeUnlock: visibility === "semi_public" ? allowCodeUnlock : false,
    inviteMode,
    inviteRotateIntervalSec,
    inviteExpiresAt,
    inviteMaxUses,
    inviteCode,
    inviteSecret,
  };
}

function sanitizeWorkflowForFork(value = {}) {
  const normalized = normalizeWorkflowCanvasState(value || defaultWorkflowCanvasState());
  const transientKeys = [
    "status", "taskId", "remoteTaskId", "error", "errorMessage", "progress",
    "submitting", "submittedAt", "jobId", "activeJobId", "pollError", "recordId",
    "resultImageAssetId", "resultVideoAssetId", "assetId",
  ];
  const nodes = normalized.nodes.map((node) => {
    const nextData = plainObject(node.data) ? { ...node.data } : {};
    transientKeys.forEach((key) => { delete nextData[key]; });
    if (plainObject(nextData.record)) {
      const nextRecord = { ...nextData.record };
      delete nextRecord.userId;
      delete nextRecord.user_id;
      delete nextRecord.taskId;
      delete nextRecord.remoteTaskId;
      nextData.record = nextRecord;
    }
    return { ...node, data: nextData };
  });
  return normalizeWorkflowCanvasState({ ...normalized, nodes });
}

function workflowThumbnailValues(value) {
  if (Array.isArray(value)) return value.flatMap(workflowThumbnailValues);
  const url = String(value || "").trim();
  return url ? [url] : [];
}

function workflowNodeThumbnail(node = {}) {
  const data = node.data && typeof node.data === "object" ? node.data : {};
  const record = data.record && typeof data.record === "object" ? data.record : {};
  const latestFirst = (values) => workflowThumbnailValues(values).reverse()[0] || "";
  const posterUrl = latestFirst([
    data.thumbnailUrl,
    data.coverUrl,
    data.posterUrl,
    data.lastFrameUrl,
    record.thumbnailUrl,
    record.coverUrl,
    record.cdnPosterUrl,
    record.posterUrl,
    record.localPosterUrl,
  ]);
  const videoUrl = latestFirst([
    data.resultVideoUrl,
    data.videoUrl,
    data.resultVideoUrls,
    record.cdnVideoUrl,
    record.localVideoUrl,
    record.resultVideoUrl,
    record.resultVideoUrls,
    record.remoteVideoUrl,
    record.providerVideoUrl,
    record.upstreamVideoUrl,
    record.videoUrl,
  ]);
  if (videoUrl) return { kind: "video", url: videoUrl, posterUrl };

  const imageUrl = latestFirst([
    data.posterUrl,
    data.thumbnailUrl,
    data.coverUrl,
    data.lastFrameUrl,
    data.stripTargetImageUrl,
    data.keyframeImageUrl,
    data.resultImageUrl,
    data.imageUrl,
    data.resultImageUrls,
    data.imageUrls,
    record.cdnPosterUrl,
    record.posterUrl,
    record.thumbnailUrl,
    record.coverUrl,
    record.poster_url,
    record.thumbnail_url,
    record.cover_url,
    record.resultImageUrl,
    record.imageUrl,
    record.resultImageUrls,
    record.imageUrls,
    record.cdnImageUrls,
  ]);
  return imageUrl ? { kind: "image", url: imageUrl, posterUrl: "" } : null;
}

function workflowCanvasSharingOwnerView(record = {}, nowMs = Date.now()) {
  const activeInvite = resolveActiveInviteCode(record, nowMs);
  return {
    visibility: normalizeWorkflowVisibility(record.visibility, "private"),
    description: normalizeWorkflowDescription(record.description),
    unlockCredits: normalizeWorkflowUnlockCredits(record.unlockCredits ?? record.unlock_credits ?? 0),
    allowCreditUnlock: Boolean(record.allowCreditUnlock ?? record.allow_credit_unlock ?? false),
    allowCodeUnlock: Boolean(record.allowCodeUnlock ?? record.allow_code_unlock ?? true),
    inviteMode: activeInvite.mode,
    inviteCode: activeInvite.code,
    inviteVersion: activeInvite.version,
    inviteRotateIntervalSec: activeInvite.rotateIntervalSec,
    inviteNextRotateAt: activeInvite.nextRotateAt,
    inviteExpiresAt: activeInvite.expiresAt,
    inviteMaxUses: activeInvite.maxUses,
    inviteUsedCount: activeInvite.usedCount,
  };
}

function publicWorkflowCanvasSummary(record = {}, options = {}) {
  const workflow = record.workflow && typeof record.workflow === "object" ? record.workflow : {};
  const workflowNodes = Array.isArray(workflow.nodes) ? workflow.nodes : [];
  const visibility = normalizeWorkflowVisibility(record.visibility, "private");
  const isOwner = options.isOwner !== undefined ? Boolean(options.isOwner) : !options.templateCard;
  const unlocked = Boolean(isOwner || visibility === "public" || options.unlocked || record.unlocked);
  const locked = Boolean(!isOwner && visibility === "semi_public" && !unlocked);
  const canInspectStructure = Boolean(options.locked ? false : (isOwner || visibility === "public" || (visibility === "semi_public" && unlocked)));

  const previewNodes = canInspectStructure
    ? workflowNodes
      .filter((node) => node && node.id)
      .slice(0, 8)
      .map((node) => ({
        id: String(node.id || ""),
        type: String(node.type || ""),
        x: Number(node.x || 0),
        y: Number(node.y || 0),
      }))
    : [];
  const thumbnailNode = [...workflowNodes].reverse()
    .map(workflowNodeThumbnail)
    .find(Boolean) || null;
  const summary = {
    id: String(record.id || "").trim(),
    name: normalizeWorkflowCanvasName(record.name),
    description: normalizeWorkflowDescription(record.description),
    visibility,
    unlockCredits: visibility === "semi_public" ? normalizeWorkflowUnlockCredits(record.unlockCredits ?? record.unlock_credits ?? 0) : 0,
    allowCreditUnlock: visibility === "semi_public" ? Boolean(record.allowCreditUnlock ?? record.allow_credit_unlock ?? false) : false,
    allowCodeUnlock: visibility === "semi_public" ? Boolean(record.allowCodeUnlock ?? record.allow_code_unlock ?? true) : false,
    ownerName: String(record.ownerName || record.owner_name || "").trim(),
    isOwner,
    unlocked,
    locked,
    unlockCount: Math.max(0, Math.trunc(Number(record.unlockCount ?? record.unlock_count ?? 0) || 0)),
    forkCount: Math.max(0, Math.trunc(Number(record.forkCount ?? record.fork_count ?? 0) || 0)),
    createdAt: String(record.createdAt || record.created_at || "").trim(),
    updatedAt: String(record.updatedAt || record.updated_at || "").trim(),
    publishedAt: String(record.publishedAt || record.published_at || "").trim(),
    previewNodes,
    thumbnailUrl: thumbnailNode?.kind === "image" ? thumbnailNode.url : (thumbnailNode?.posterUrl || ""),
    thumbnailVideoUrl: thumbnailNode?.kind === "video" ? thumbnailNode.url : "",
  };
  if (options.includeOwnerControls && isOwner) {
    summary.sharing = workflowCanvasSharingOwnerView(record, options.nowMs);
  }
  return summary;
}

function publicWorkflowTemplateSummary(record = {}, { isOwner = false, unlocked = false, includeOwnerControls = false, nowMs = Date.now() } = {}) {
  return publicWorkflowCanvasSummary(record, {
    templateCard: true,
    isOwner,
    unlocked,
    includeOwnerControls: Boolean(includeOwnerControls && isOwner),
    nowMs,
  });
}

function publicWorkflowCanvasLockedView(record = {}, { userCredits = 0 } = {}) {
  const base = publicWorkflowCanvasSummary(record, {
    templateCard: true,
    isOwner: false,
    unlocked: false,
    locked: true,
    includeOwnerControls: false,
  });
  return {
    id: base.id,
    name: base.name,
    description: base.description,
    visibility: base.visibility,
    ownerName: base.ownerName,
    unlockCredits: base.unlockCredits,
    allowCreditUnlock: base.allowCreditUnlock,
    allowCodeUnlock: base.allowCodeUnlock,
    unlockCount: base.unlockCount,
    forkCount: base.forkCount,
    publishedAt: base.publishedAt,
    updatedAt: base.updatedAt,
    thumbnailUrl: base.thumbnailUrl,
    thumbnailVideoUrl: base.thumbnailVideoUrl,
    unlocked: false,
    locked: true,
    isOwner: false,
    previewNodes: [],
    userCredits: Math.max(0, Number(userCredits || 0)),
  };
}

function publicWorkflowCanvasView(record = {}, options = {}) {
  const isOwner = options.isOwner !== undefined ? Boolean(options.isOwner) : true;
  const unlocked = Boolean(isOwner || options.unlocked || normalizeWorkflowVisibility(record.visibility, "private") === "public");
  const summary = publicWorkflowCanvasSummary(record, {
    isOwner,
    unlocked,
    includeOwnerControls: isOwner,
    nowMs: options.nowMs,
  });
  return {
    ...summary,
    workflow: normalizeWorkflowCanvasState(record.workflow || defaultWorkflowCanvasState()),
    accessMode: isOwner ? "owner" : "template_readonly",
    canEdit: isOwner,
    canFork: Boolean(isOwner || unlocked),
  };
}

module.exports = {
  WORKFLOW_CANVAS_LIMIT,
  WORKFLOW_CANVAS_WRITE_PAYLOAD_BYTES,
  WORKFLOW_CANVAS_NAME_LIMIT,
  WORKFLOW_CANVAS_NODE_LIMIT,
  WORKFLOW_CANVAS_EDGE_LIMIT,
  WORKFLOW_CANVAS_VISIBILITIES,
  WORKFLOW_CANVAS_INVITE_MODES,
  WORKFLOW_CANVAS_DESCRIPTION_LIMIT,
  WORKFLOW_CANVAS_UNLOCK_CREDITS_MAX,
  WORKFLOW_CANVAS_ROTATE_MIN_SEC,
  WORKFLOW_CANVAS_ROTATE_MAX_SEC,
  WORKFLOW_CANVAS_ROTATE_DEFAULT_SEC,
  WORKFLOW_CANVAS_INVITE_GRACE_SEC,
  defaultWorkflowCanvasState,
  normalizeWorkflowCanvasName,
  normalizeWorkflowCanvasState,
  normalizeWorkflowVisibility,
  normalizeWorkflowDescription,
  normalizeWorkflowInviteMode,
  normalizeWorkflowRotateInterval,
  normalizeWorkflowUnlockCredits,
  normalizeWorkflowInviteMaxUses,
  normalizeWorkflowInviteExpiresAt,
  normalizeInviteCodeInput,
  generateStaticInviteCode,
  generateInviteSecret,
  computeRotatingInviteCode,
  resolveActiveInviteCode,
  verifyWorkflowInviteCode,
  validateWorkflowSharingPatch,
  sanitizeWorkflowForFork,
  workflowCanvasSharingOwnerView,
  validateWorkflowCanvasForWrite,
  publicWorkflowCanvasSummary,
  publicWorkflowTemplateSummary,
  publicWorkflowCanvasLockedView,
  publicWorkflowCanvasView,
};
