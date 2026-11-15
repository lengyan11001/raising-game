const httpShutdownGate = createHttpShutdownGate();
const server = http.createServer((req, res) => {
  if (httpShutdownGate.shouldReject(req)) {
    httpShutdownGate.reject(req, res);
    return;
  }
  if (BASELINE_METRICS_ENABLED) {
    let routePath = "";
    try { routePath = new URL(req.url || "/", "http://localhost").pathname; } catch {}
    const route = baselineRouteLabel(routePath);
    const endRequest = baselineMetrics.beginRequest(route);
    const startedAt = baselineMetrics.monoNow();
    let recorded = false;
    const finalize = () => {
      if (recorded) return;
      recorded = true;
      endRequest();
      baselineMetrics.recordRequest({
        route,
        statusCode: res.statusCode,
        durationMs: baselineMetrics.monoNow() - startedAt,
        bytesInBytes: Number(req.headers["content-length"] || 0),
        bytesOutBytes: Number(res.getHeader("content-length") || 0),
      });
    };
    res.once("finish", finalize);
    res.once("close", finalize);
  }
  requestContext.run({ auth: null, appStateWriteLocked: false }, () => {
    Promise.resolve(handleRequest(req, res)).catch((error) => {
      console.error("[request-failed]", error.message || error);
      if (!res.headersSent) {
        sendJson(res, error.statusCode || 500, {
          ok: false,
          code: error.code || "SERVER_ERROR",
          message: error.message || "Server error",
        });
      } else {
        res.destroy(error);
      }
    });
  });
});

/* WebSocket upgrade: managed chat-live and merchant compute-relay channels. */
server.on("upgrade", (req, socket, head) => {
  if (httpShutdownGate.stopping) {
    httpShutdownGate.rejectUpgrade(socket);
    return;
  }
  Promise.resolve().then(async () => {
    const requestUrl = String(req.url || "");
    if (requestUrl.startsWith("/api/embed/live/sessions/")) {
      const handled = await viduLiveRelay.handleUpgrade(req, socket, head);
      if (handled) return;
    }
    if (requestUrl.startsWith("/api/chat-live/ws")) {
      await handleChatLiveUpgrade(req, socket, head);
      return;
    }
    socket.destroy();
  }).catch((error) => {
    console.warn("[ws-upgrade-failed]", error.message || error);
    try { socket.destroy(); } catch {}
  });
});

server.keepAliveTimeout = Number(process.env.HTTP_KEEP_ALIVE_TIMEOUT_MS || 65000);
server.headersTimeout = Number(process.env.HTTP_HEADERS_TIMEOUT_MS || 70000);
server.requestTimeout = Number(process.env.HTTP_REQUEST_TIMEOUT_MS || 180000);
server.maxRequestsPerSocket = Number(process.env.HTTP_MAX_REQUESTS_PER_SOCKET || 1000);
server.maxConnections = Number(process.env.HTTP_MAX_CONNECTIONS || 2000);
const httpSocketTracker = createHttpSocketTracker(server);

const GENERATION_SUBMIT_DRAIN_TIMEOUT_MS = Math.max(10000, Math.min(300000, Number(process.env.GENERATION_SUBMIT_DRAIN_TIMEOUT_MS || 180000) || 180000));
const HTTP_SHUTDOWN_GRACE_MS = Math.max(1000, Math.min(60000, Number(process.env.HTTP_SHUTDOWN_GRACE_MS || 30000) || 30000));
const HTTP_SHUTDOWN_SETTLE_MS = Math.max(100, Math.min(5000, Number(process.env.HTTP_SHUTDOWN_SETTLE_MS || 1000) || 1000));

let staleSubmitScanRunning = false;

function rejectAfterTimeout(promise, timeoutMs, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`${label} timed out after ${timeoutMs}ms`);
      error.code = "OPERATION_TIMEOUT";
      reject(error);
    }, timeoutMs);
    timer.unref?.();
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function scanStalePreSubmitGenerationRecords(reason = "timer") {
  if (staleSubmitScanRunning) return;
  staleSubmitScanRunning = true;
  const startedAt = Date.now();
  console.log("[stale-submit-generation-records-scan-start]", { reason });
  try {
    const records = await rejectAfterTimeout(
      getStalePreSubmitGenerationRecordsFromDb({
        olderThanMs: GENERATION_SUBMIT_STALE_MS,
        limit: 10,
        timeoutMs: GENERATION_STALE_SUBMIT_SCAN_TIMEOUT_MS,
        providers: ["seedance", "seedance-nsfw", "seedance25", SEEDANCE25_DIRECT_PROVIDER, "aliyun-wan30", "aliyun-wan27", "aliyun-happyhorse", "apiz", "seedream5-image", "qwen-image3"],
      }),
      GENERATION_STALE_SUBMIT_SCAN_TIMEOUT_MS,
      "stale-submit-generation-record-query",
    ) || [];
    const staleRecords = records
      .filter((record) => isStalePreSubmitGenerationRecord(record))
      .slice(0, 10);
    const settled = [];
    for (const record of staleRecords) {
      try {
        const nextRecord = await rejectAfterTimeout(
          failStalePreSubmitGenerationRecord(record, `${reason}-stale-submit`),
          GENERATION_STALE_SUBMIT_RECORD_TIMEOUT_MS,
          "stale-submit-generation-record-settle",
        );
        settled.push(nextRecord.taskId || record.taskId);
      } catch (error) {
        console.warn("[stale-submit-generation-record-failed]", record.taskId, error.message || error);
      }
    }
    if (settled.length) {
      console.warn("[stale-submit-generation-records-settled]", { reason, count: settled.length, taskIds: settled });
    }
    console.log("[stale-submit-generation-records-scan-end]", {
      reason,
      candidates: records.length,
      stale: staleRecords.length,
      settled: settled.length,
      elapsedMs: Date.now() - startedAt,
    });
  } catch (error) {
    console.warn("[stale-submit-generation-record-scan-failed]", {
      reason,
      code: error.code || "",
      message: error.message || String(error),
      elapsedMs: Date.now() - startedAt,
    });
  } finally {
    staleSubmitScanRunning = false;
  }
}

function runStaleSubmitGenerationRecordSchedulerTick(reason) {
  return runWithSchedulerLease("stale-submit-generation-records", () => (
    scanStalePreSubmitGenerationRecords(reason)
  ), {
    connect: () => getSchedulerPool().connect(),
    onError: (error) => console.warn("[stale-submit-generation-record-lease-failed]", error.message || error),
  });
}

function startStaleSubmitGenerationRecordScheduler() {
  scheduleStartupScheduler("stale-submit-generation-records", () => runStaleSubmitGenerationRecordSchedulerTick("startup"));
  setInterval(() => runStaleSubmitGenerationRecordSchedulerTick("timer"), GENERATION_STALE_SUBMIT_SCAN_INTERVAL_MS).unref?.();
}

let activeGenerationScanRunning = false;

const STALLED_GENERATION_ACTIVE_STATUSES = new Set([
  "submitting",
  "preparing",
  "submitted",
  "queued",
  "pending",
  "running",
  "processing",
  "generating",
]);

const STALLED_GENERATION_REFUND_PROVIDERS = new Set([
  "seedance",
  "seedance-nsfw",
  "seedance25",
  SEEDANCE25_DIRECT_PROVIDER,
  "aliyun-wan30",
  "aliyun-wan27",
  "aliyun-wan27-image",
  "aliyun-happyhorse",
  "apiz",
  "seedream5-image",
  "qwen-image3",
]);

const FAILED_REFUND_AUDIT_LEDGER_TYPES = new Map([
  ["seedream5-image", { charge: "advanced_seedream5_image", refunds: ["advanced_seedream5_image_refund", "generation_refund"] }],
  ["qwen-image3", { charge: "advanced_qwen_image3", refunds: ["advanced_qwen_image3_refund", "generation_refund"] }],
  ["qwen37-flash", { charge: "advanced_qwen37_flash", refunds: ["advanced_qwen37_flash_refund", "generation_refund"] }],
  ["papaya", { charge: "advanced_qwen37_flash", refunds: ["advanced_qwen37_flash_refund", "generation_refund"] }],
  ["byteplus-language", { charge: "advanced_qwen37_flash", refunds: ["advanced_qwen37_flash_refund", "generation_refund"] }],
  ["z-image-spicy-pro", { charge: "advanced_z_image_spicy_pro", refunds: ["advanced_z_image_spicy_pro_refund", "generation_refund"] }],
]);

const stalledGenerationRepairLocks = new Set();

async function withStalledGenerationRepairLock(taskId = "", callback = async () => null) {
  const key = String(taskId || "").trim();
  if (!key) return callback();
  if (stalledGenerationRepairLocks.has(key)) {
    throw new Error(`Generation record ${key} is already being repaired.`);
  }
  stalledGenerationRepairLocks.add(key);
  try {
    return await callback();
  } finally {
    stalledGenerationRepairLocks.delete(key);
  }
}

function isStalledGenerationRecordCandidate(record = {}, staleMs = 2 * 60 * 60 * 1000) {
  if (!record?.taskId || !record.userId || record.deletedAt) return false;
  if (!STALLED_GENERATION_ACTIVE_STATUSES.has(String(record.status || "").toLowerCase())) return false;
  const createdMs = generationRecordCreatedTime(record);
  return Boolean(createdMs) && Date.now() - createdMs >= Math.max(0, Number(staleMs || 0));
}

function stalledGenerationRefundType(record = {}) {
  const provider = String(record.provider || "").toLowerCase();
  if (provider === "aliyun-wan27-image") return "asset_image_modify_refund";
  const auditTypes = failedRefundAuditLedgerTypes(record);
  const auditRefundType = failedRefundAuditRefundTypes(auditTypes || {})[0] || "";
  return auditRefundType || "generation_refund";
}

async function refundPreDeductedStalledGenerationRecord(record = {}, reason = "stalled-generation-repair", { allowSettledRefund = false } = {}) {
  const preDeducted = creditsAmount(record.preDeductedCredits || 0);
  const billingStatus = String(record.billingStatus || "").toLowerCase();
  const finalCredits = record.finalCredits === undefined || record.finalCredits === null
    ? preDeducted
    : creditsAmount(record.finalCredits || 0);
  if (preDeducted <= 0) return record;
  if (billingStatus === "pre_deducted") {
    // The pre-deduction is still outstanding regardless of a partial final estimate.
  } else if (billingStatus === "settled" && allowSettledRefund) {
    // Historical settled records may already have finalCredits=0 while the
    // customer was charged the full pre-deducted amount. The maintenance
    // command explicitly opts into this legacy repair.
  } else {
    return record;
  }
  const refundType = stalledGenerationRefundType(record);
  const alreadyRefunded = await stalledGenerationRefundExists(record, refundType);
  if (!alreadyRefunded) {
    const db = await readDb();
    await changeUserCredits(db, record.userId, preDeducted, refundType, {
      taskId: record.taskId,
      provider: record.provider || "",
      reason,
      preDeducted,
      finalCredits: 0,
      refundedCredits: preDeducted,
      previousBillingStatus: billingStatus,
    });
    await recordSubtokenAdjustment(record, {
      taskId: record.taskId,
      type: refundType,
      amount: -preDeducted,
      meta: { provider: record.provider || "", reason, preDeducted, previousBillingStatus: billingStatus },
    });
    if (!dbEnabled()) await writeDb(db);
  }
  return upsertGenerationRecord({
    taskId: record.taskId,
    status: "failed",
    awaitingUpstreamTask: false,
    failedAt: record.failedAt || new Date().toISOString(),
    finalCredits: 0,
    originalFinalCredits: 0,
    billingStatus: "refunded",
    billingSettledAt: new Date().toISOString(),
    billingError: "",
    error: record.error || `Generation stalled without a terminal upstream result. The pre-deducted credits were ${alreadyRefunded ? "already refunded" : "refunded"}.`,
    lastUpdateReason: reason,
  });
}

async function stalledGenerationRefundExists(record = {}, refundType = stalledGenerationRefundType(record)) {
  if (!record.taskId) return false;
  const refundTypes = refundType === "asset_image_modify_refund"
    ? ["asset_image_modify_refund", "character_image_modify_refund"]
    : [refundType];
  if (dbEnabled()) {
    const { rows } = await dbQuery(`
      SELECT 1
      FROM app_credit_ledger
      WHERE type = ANY($1::text[])
        AND meta->>'taskId' = $2
      LIMIT 1
    `, [refundTypes, String(record.taskId || "")]);
    return rows.length > 0;
  }
  const db = await readDb();
  return (db.creditLedger || []).some((entry) => (
    refundTypes.includes(entry.type) && String(entry.meta?.taskId || "") === String(record.taskId || "")
  ));
}

function failedRefundAuditLedgerTypes(record = {}) {
  return FAILED_REFUND_AUDIT_LEDGER_TYPES.get(String(record.provider || "").toLowerCase()) || null;
}

function signedCreditsAmount(value, fallback = 0) {
  const next = Number(value);
  if (!Number.isFinite(next)) return Math.round(Number(fallback || 0) * 10000) / 10000;
  return Math.round(next * 10000) / 10000;
}

function failedRefundAuditRefundTypes(ledgerTypes = {}) {
  if (Array.isArray(ledgerTypes.refunds)) return ledgerTypes.refunds.filter(Boolean);
  return ledgerTypes.refund ? [ledgerTypes.refund] : [];
}

async function generationTaskLedgerSummary(record = {}, ledgerTypes = null) {
  const types = ledgerTypes || failedRefundAuditLedgerTypes(record);
  if (!record.taskId || !types) return [];
  if (!dbEnabled()) return [];
  const { rows } = await dbQuery(`
    SELECT type, COALESCE(SUM(delta), 0)::numeric AS total, COUNT(*)::int AS count
    FROM app_credit_ledger
    WHERE meta->>'taskId' = $1
      AND type = ANY($2::text[])
    GROUP BY type
  `, [String(record.taskId || ""), [types.charge, ...failedRefundAuditRefundTypes(types)]]);
  return rows.map((row) => ({
    type: String(row.type || ""),
    total: signedCreditsAmount(row.total || 0),
    count: Math.max(0, Math.trunc(Number(row.count || 0))),
  }));
}

function falseRefundedGenerationAudit(record = {}, ledgerSummary = []) {
  const ledgerTypes = failedRefundAuditLedgerTypes(record);
  const preDeducted = creditsAmount(record.preDeductedCredits || 0);
  const status = String(record.status || "").toLowerCase();
  const billingStatus = String(record.billingStatus || "").toLowerCase();
  if (!ledgerTypes) return { eligible: false, reason: "provider-not-allowlisted", preDeducted };
  if (!record.taskId || !record.userId || record.deletedAt) return { eligible: false, reason: "invalid-record", preDeducted };
  if (status !== "failed" || billingStatus !== "refunded" || preDeducted <= 0) {
    return { eligible: false, reason: "not-a-false-refunded-record", preDeducted };
  }
  const charge = ledgerSummary.find((entry) => entry.type === ledgerTypes.charge);
  const refundTypes = failedRefundAuditRefundTypes(ledgerTypes);
  const refund = ledgerSummary.find((entry) => refundTypes.includes(entry.type));
  const chargedCredits = charge ? Math.abs(Math.min(0, charge.total)) : 0;
  if (!charge || charge.count !== 1 || charge.total >= 0) return { eligible: false, reason: "charge-ledger-missing-or-invalid", preDeducted, chargedCredits };
  if (refund?.count > 0 || refund?.total > 0) return { eligible: false, reason: "refund-already-recorded", preDeducted, chargedCredits };
  if (Math.abs(chargedCredits - preDeducted) > 0.000001) return { eligible: false, reason: "charge-amount-mismatch", preDeducted, chargedCredits };
  return {
    eligible: true,
    reason: "refund-ledger-missing",
    preDeducted,
    refundCredits: chargedCredits,
    chargedCredits,
    ledgerTypes,
  };
}

async function listFailedRefundedGenerationRecordsForAudit({ taskIds = [], sinceMs = 30 * 24 * 60 * 60 * 1000, limit = 100 } = {}) {
  const ids = [...new Set((Array.isArray(taskIds) ? taskIds : []).map((value) => String(value || "").trim()).filter(Boolean))];
  if (ids.length) {
    const records = await Promise.all(ids.map((taskId) => getGenerationRecord(taskId)));
    return records.filter((record) => record && record.taskId);
  }
  if (!dbEnabled()) throw new Error("DATABASE_URL is required for failed refund audit.");
  const providers = [...FAILED_REFUND_AUDIT_LEDGER_TYPES.keys()];
  const safeLimit = Math.max(1, Math.min(500, Math.trunc(Number(limit || 100) || 100)));
  const sinceAt = new Date(Date.now() - Math.max(0, Number(sinceMs || 0))).toISOString();
  const { rows } = await dbQuery(`
    SELECT payload
    FROM app_generation_records
    WHERE COALESCE(payload->>'deletedAt', '') = ''
      AND LOWER(COALESCE(payload->>'status', '')) = 'failed'
      AND LOWER(COALESCE(payload->>'billingStatus', '')) = 'refunded'
      AND LOWER(COALESCE(payload->>'provider', '')) = ANY($1::text[])
      AND COALESCE(NULLIF(payload->>'createdAt', '')::timestamptz, created_at) >= $2::timestamptz
    ORDER BY COALESCE(NULLIF(payload->>'createdAt', '')::timestamptz, created_at) ASC
    LIMIT $3
  `, [providers, sinceAt, safeLimit]);
  return rows.map((row) => row.payload).filter(Boolean);
}

async function listFailedPreDeductedGenerationRecordsForAudit({ taskIds = [], sinceMs = 30 * 24 * 60 * 60 * 1000, limit = 100 } = {}) {
  const ids = [...new Set((Array.isArray(taskIds) ? taskIds : []).map((value) => String(value || "").trim()).filter(Boolean))];
  if (ids.length) {
    const records = await Promise.all(ids.map((taskId) => getGenerationRecord(taskId)));
    return records.filter((record) => record && record.taskId);
  }
  if (!dbEnabled()) throw new Error("DATABASE_URL is required for failed pre-deducted refund audit.");
  const providers = [...FAILED_REFUND_AUDIT_LEDGER_TYPES.keys()];
  const safeLimit = Math.max(1, Math.min(500, Math.trunc(Number(limit || 100) || 100)));
  const sinceAt = new Date(Date.now() - Math.max(0, Number(sinceMs || 0))).toISOString();
  const { rows } = await dbQuery(`
    SELECT payload
    FROM app_generation_records
    WHERE COALESCE(payload->>'deletedAt', '') = ''
      AND LOWER(COALESCE(payload->>'status', '')) = 'failed'
      AND LOWER(COALESCE(payload->>'billingStatus', '')) IN ('pre_deducted', 'refund_failed')
      AND LOWER(COALESCE(payload->>'provider', '')) = ANY($1::text[])
      AND COALESCE(NULLIF(payload->>'createdAt', '')::timestamptz, created_at) >= $2::timestamptz
    ORDER BY COALESCE(NULLIF(payload->>'createdAt', '')::timestamptz, created_at) ASC
    LIMIT $3
  `, [providers, sinceAt, safeLimit]);
  return rows.map((row) => row.payload).filter(Boolean);
}

async function repairFailedPreDeductedGenerationRecords({ apply = false, taskIds = [], sinceMs = 30 * 24 * 60 * 60 * 1000, limit = 100 } = {}) {
  const records = await listFailedPreDeductedGenerationRecordsForAudit({ taskIds, sinceMs, limit });
  const results = [];
  for (const record of records) {
    const base = {
      taskId: record.taskId,
      userId: record.userId,
      provider: record.provider || "",
      status: record.status || "",
      billingStatus: record.billingStatus || "",
      preDeductedCredits: creditsAmount(record.preDeductedCredits || 0),
    };
    if (!isFailedStatus(record.status) || !["pre_deducted", "refund_failed"].includes(String(record.billingStatus || "").toLowerCase())) {
      results.push({ ...base, action: "skipped", reason: "not-a-failed-pre-deducted-record" });
      continue;
    }
    const refundType = stalledGenerationRefundType(record);
    const alreadyRefunded = await stalledGenerationRefundExists(record, refundType);
    base.refundAlreadyRecorded = alreadyRefunded;
    if (!apply) {
      results.push({ ...base, action: "refund-pending", reason: alreadyRefunded ? "refund-ledger-already-recorded" : "refund-ledger-missing", refundType, refundCredits: alreadyRefunded ? 0 : base.preDeductedCredits });
      continue;
    }
    try {
      const nextRecord = await withStalledGenerationRepairLock(record.taskId, async () => {
        const current = await getGenerationRecord(record.taskId);
        if (!current || !isFailedStatus(current.status) || !["pre_deducted", "refund_failed"].includes(String(current.billingStatus || "").toLowerCase())) return current;
        return refundPreDeductedStalledGenerationRecord(current, "failed-pre-deducted-refund-repair");
      });
      results.push({
        ...base,
        action: "refunded",
        reason: alreadyRefunded ? "refund-ledger-already-recorded" : "refund-ledger-missing",
        refundType,
        refundCredits: alreadyRefunded ? 0 : base.preDeductedCredits,
        finalBillingStatus: nextRecord?.billingStatus || "",
      });
    } catch (error) {
      results.push({ ...base, action: "failed-to-repair", reason: String(error.message || error).slice(0, 240) });
    }
  }
  return {
    apply: Boolean(apply),
    mode: "failed-pre-deducted-refund-audit",
    scanned: records.length,
    repaired: results.filter((item) => item.action === "refunded").length,
    skipped: results.filter((item) => item.action === "skipped").length,
    failed: results.filter((item) => item.action === "failed-to-repair").length,
    results,
  };
}

async function repairFailedRefundedGenerationRecords({ apply = false, taskIds = [], sinceMs = 30 * 24 * 60 * 60 * 1000, limit = 100 } = {}) {
  const records = await listFailedRefundedGenerationRecordsForAudit({ taskIds, sinceMs, limit });
  const results = [];
  for (const record of records) {
    const base = {
      taskId: record.taskId,
      userId: record.userId,
      provider: record.provider || "",
      status: record.status || "",
      billingStatus: record.billingStatus || "",
      preDeductedCredits: creditsAmount(record.preDeductedCredits || 0),
    };
    const ledgerSummary = await generationTaskLedgerSummary(record);
    const audit = falseRefundedGenerationAudit(record, ledgerSummary);
    const auditLedgerTypes = failedRefundAuditLedgerTypes(record);
    base.refundAlreadyRecorded = Boolean(auditLedgerTypes && ledgerSummary.some((entry) => failedRefundAuditRefundTypes(auditLedgerTypes).includes(entry.type) && entry.count > 0));
    if (!audit.eligible) {
      results.push({ ...base, action: "skipped", reason: audit.reason });
      continue;
    }
    if (!apply) {
      results.push({ ...base, action: "refund-ledger-only", reason: audit.reason, refundCredits: audit.refundCredits });
      continue;
    }
    try {
      const result = await withStalledGenerationRepairLock(record.taskId, async () => {
        const current = await getGenerationRecord(record.taskId);
        const currentSummary = await generationTaskLedgerSummary(current || {});
        const currentAudit = falseRefundedGenerationAudit(current || {}, currentSummary);
        if (!currentAudit.eligible) return { record: current, audit: currentAudit, summary: currentSummary, inserted: false };
        const { charge } = currentAudit.ledgerTypes;
        const [refund] = failedRefundAuditRefundTypes(currentAudit.ledgerTypes);
        const refundCredits = currentAudit.refundCredits;
        const meta = {
          taskId: record.taskId,
          provider: record.provider || "",
          reason: "failed-refund-ledger-repair",
          preDeducted: currentAudit.preDeducted,
          chargedCredits: currentAudit.chargedCredits,
          refundedCredits: refundCredits,
          previousBillingStatus: "refunded",
          previousChargeType: charge,
        };
        if (dbEnabled()) {
          await applyCreditDeltaInDb({
            id: stableLedgerId(refund, meta),
            userId: current.userId,
            delta: refundCredits,
            type: refund,
            meta,
            payload: {
              userId: current.userId,
              delta: refundCredits,
              type: refund,
              meta,
              createdAt: new Date().toISOString(),
            },
          });
        } else {
          const db = await readDb();
          await changeUserCredits(db, current.userId, refundCredits, refund, meta);
          if (!dbEnabled()) await writeDb(db);
        }
        await recordSubtokenAdjustment(current, {
          taskId: current.taskId,
          type: refund,
          amount: -refundCredits,
          meta: { reason: "failed-refund-ledger-repair", previousChargeType: charge },
        }).catch((error) => console.error("[failed-refund-subtoken-adjustment-failed]", current.taskId, error.message || error));
        const nextRecord = await upsertGenerationRecord({
          taskId: current.taskId,
          billingStatus: "refunded",
          billingSettledAt: new Date().toISOString(),
          billingError: "",
          lastUpdateReason: "failed-refund-ledger-repair",
        });
        return { record: nextRecord, audit: currentAudit, summary: await generationTaskLedgerSummary(current), inserted: true };
      });
      results.push({
        ...base,
        action: result.inserted ? "refunded" : "skipped",
        reason: result.audit?.reason || "",
        refundCredits: result.inserted ? result.audit.refundCredits : 0,
        finalBillingStatus: result.record?.billingStatus || "",
      });
    } catch (error) {
      results.push({ ...base, action: "failed-to-repair", reason: String(error.message || error).slice(0, 240) });
    }
  }
  return {
    apply: Boolean(apply),
    mode: "failed-refund-ledger-audit",
    scanned: records.length,
    repaired: results.filter((item) => item.action === "refunded").length,
    skipped: results.filter((item) => item.action === "skipped").length,
    failed: results.filter((item) => item.action === "failed-to-repair").length,
    results,
  };
}

async function failStalledGenerationRecord(record = {}, reason = "stalled-generation-repair") {
  return withStalledGenerationRepairLock(record.taskId, async () => {
    return failStalledGenerationRecordUnlocked(record, reason);
  });
}

async function failStalledGenerationRecordUnlocked(record = {}, reason = "stalled-generation-repair") {
  if (!isStalledGenerationRecordCandidate(record, 0) && !isActiveGenerationStatus(record.status)) return record;
  const provider = String(record.provider || "").toLowerCase();
  const billingStatus = String(record.billingStatus || "").toLowerCase();
  const preDeducted = creditsAmount(record.preDeductedCredits || 0);
  if (preDeducted > 0 && ["pre_deducted", "settled"].includes(billingStatus) && STALLED_GENERATION_REFUND_PROVIDERS.has(provider)) {
    const failed = await upsertGenerationRecord({
      taskId: record.taskId,
      status: "failed",
      awaitingUpstreamTask: false,
      error: record.error || "Generation stalled without a terminal upstream result. The pre-deducted credits were refunded.",
      failedAt: record.failedAt || new Date().toISOString(),
      lastUpdateReason: reason,
    });
    return refundPreDeductedStalledGenerationRecord(failed, reason);
  }
  return upsertGenerationRecord({
    taskId: record.taskId,
    status: "failed",
    awaitingUpstreamTask: false,
    error: record.error || "Generation stalled without a terminal upstream result.",
    failedAt: record.failedAt || new Date().toISOString(),
    lastUpdateReason: reason,
  });
}

async function listStalledGenerationRecordsForRepair({ staleMs = 2 * 60 * 60 * 1000, limit = 100, taskIds = [] } = {}) {
  const ids = [...new Set((Array.isArray(taskIds) ? taskIds : []).map((value) => String(value || "").trim()).filter(Boolean))];
  if (ids.length) {
    const records = await Promise.all(ids.map((taskId) => getGenerationRecord(taskId)));
    return records.filter((record) => record && record.taskId);
  }
  if (!dbEnabled()) throw new Error("DATABASE_URL is required for stalled generation record repair.");
  const safeLimit = Math.max(1, Math.min(500, Math.trunc(Number(limit || 100) || 100)));
  const { rows } = await dbQuery(`
    SELECT payload
    FROM app_generation_records
    WHERE COALESCE(payload->>'deletedAt', '') = ''
      AND LOWER(COALESCE(payload->>'status', '')) = ANY($1::text[])
      AND COALESCE(NULLIF(payload->>'createdAt', '')::timestamptz, created_at) <= NOW() - ($2::int * INTERVAL '1 millisecond')
    ORDER BY COALESCE(NULLIF(payload->>'createdAt', '')::timestamptz, created_at) ASC
    LIMIT $3
  `, [[...STALLED_GENERATION_ACTIVE_STATUSES], Math.max(0, Number(staleMs || 0)), safeLimit]);
  return rows.map((row) => row.payload).filter(Boolean);
}

async function repairStalledGenerationRecords({ apply = false, staleMs = 2 * 60 * 60 * 1000, limit = 100, taskIds = [] } = {}) {
  const records = await listStalledGenerationRecordsForRepair({ staleMs, limit, taskIds });
  const results = [];
  for (const record of records) {
    const ageMs = Math.max(0, Date.now() - generationRecordCreatedTime(record));
    const base = {
      taskId: record.taskId,
      userId: record.userId,
      provider: record.provider || "",
      status: record.status || "",
      billingStatus: record.billingStatus || "",
      preDeductedCredits: creditsAmount(record.preDeductedCredits || 0),
      ageHours: Math.round((ageMs / 3600000) * 10) / 10,
      hasUpstreamTaskId: Boolean(record.upstreamTaskId),
      refundAlreadyRecorded: await stalledGenerationRefundExists(record),
    };
    if (!apply) {
      results.push({
        ...base,
        action: record.upstreamTaskId ? "query-upstream-then-terminalize" : "fail-and-refund-if-pre-deducted",
      });
      continue;
    }
    try {
      const nextRecord = await withStalledGenerationRepairLock(record.taskId, async () => {
        let current = record;
        if (record.upstreamTaskId) current = await refreshGenerationRecordStatus(record);
        const terminal = isSucceededStatus(current.status) || isFailedStatus(current.status);
        if (!terminal) current = await failStalledGenerationRecordUnlocked(current, "stalled-generation-repair");
        if (isFailedStatus(current.status) && ["pre_deducted", "settled"].includes(String(current.billingStatus || "").toLowerCase())) {
          current = await refundPreDeductedStalledGenerationRecord(current, "stalled-generation-repair", { allowSettledRefund: true });
        }
        return current;
      });
      results.push({
        ...base,
        action: "repaired",
        finalStatus: nextRecord.status || "",
        finalBillingStatus: nextRecord.billingStatus || "",
        error: String(nextRecord.error || "").slice(0, 240),
      });
    } catch (error) {
      results.push({
        ...base,
        action: "failed-to-repair",
        error: String(error.message || error).slice(0, 240),
      });
    }
  }
  return {
    apply: Boolean(apply),
    staleMs: Math.max(0, Number(staleMs || 0)),
    scanned: records.length,
    repaired: results.filter((item) => item.action === "repaired").length,
    failed: results.filter((item) => item.action === "failed-to-repair").length,
    results,
  };
}

function isActiveGenerationRecordForScan(record = {}) {
  if (!record?.taskId) return false;
  const status = String(record.status || "").toLowerCase();
  if (isSucceededStatus(status) || isFailedStatus(status)) return false;
  if (record.awaitingUpstreamTask && !record.upstreamTaskId) return false;
  const upstreamTaskId = String(record.upstreamTaskId || record.taskId || "");
  if (!upstreamTaskId || upstreamTaskId.startsWith("demo-")) return false;
  const time = generationRecordTime(record);
  if (time && Date.now() - time > GENERATION_ACTIVE_SCAN_MAX_AGE_MS) return false;
  return shouldRefreshGenerationRecord(record);
}

async function scanActiveGenerationRecords(reason = "timer") {
  if (activeGenerationScanRunning) return;
  activeGenerationScanRunning = true;
  try {
    const records = await getGenerationRecordsForScheduledMaintenanceFromDb({
      maxAgeMs: GENERATION_ACTIVE_SCAN_MAX_AGE_MS,
      limit: 100,
    }) || [];
    const refundableRecords = records
      .filter((record) => needsApizFailureRefund(record) || needsSeedanceFailureRefund(record))
      .slice(0, 10);
    queueGenerationRecordStatusRefreshes(refundableRecords, { reason: `${reason}-refund-scan` });
    const activeRecords = records
      .filter((record) => isActiveGenerationRecordForScan(record))
      .filter((record) => !refundableRecords.some((item) => item.taskId === record.taskId))
      .sort((a, b) => generationRecordTime(a) - generationRecordTime(b))
      .slice(0, GENERATION_ACTIVE_SCAN_BATCH_SIZE);
    if (!activeRecords.length) return;
    queueGenerationRecordStatusRefreshes(activeRecords, { reason: `${reason}-active-scan` });
  } catch (error) {
    console.warn("[active-generation-record-scan-failed]", error.message || error);
  } finally {
    activeGenerationScanRunning = false;
  }
}

function runActiveGenerationRecordSchedulerTick(reason) {
  return runWithSchedulerLease("active-generation-records", () => (
    scanActiveGenerationRecords(reason)
  ), {
    connect: () => getSchedulerPool().connect(),
    onError: (error) => console.warn("[active-generation-record-lease-failed]", error.message || error),
  });
}

function startActiveGenerationRecordScheduler() {
  scheduleStartupScheduler("active-generation-records", () => runActiveGenerationRecordSchedulerTick("startup"));
  setInterval(() => runActiveGenerationRecordSchedulerTick("timer"), GENERATION_ACTIVE_SCAN_INTERVAL_MS).unref?.();
}

function runTelegramBotSchedulerTick() {
  return runWithSchedulerLease("telegram-generation-notifications", () => (
    scanTelegramGenerationNotifications()
  ), {
    connect: () => getSchedulerPool().connect(),
    onError: (error) => console.warn("[telegram-generation-notification-lease-failed]", error.message || error),
  });
}

function startTelegramBotScheduler() {
  if (!telegramGenerationNotifierEnabled()) return;
  scheduleStartupScheduler("telegram-generation-notifications", () => runTelegramBotSchedulerTick());
  setInterval(() => runTelegramBotSchedulerTick(), TELEGRAM_BOT_NOTIFIER_INTERVAL_MS).unref?.();
}

function runTelegramPaymentNotificationSchedulerTick() {
  return runWithSchedulerLease("telegram-payment-notifications", () => (
    scanTelegramPaymentNotifications()
  ), {
    connect: () => getSchedulerPool().connect(),
    onError: (error) => console.warn("[telegram-payment-notification-lease-failed]", error.message || error),
  });
}

function startTelegramPaymentNotificationScheduler() {
  if (!telegramPaymentNotifierEnabled()) return;
  scheduleStartupScheduler("telegram-payment-notifications", () => runTelegramPaymentNotificationSchedulerTick());
  setInterval(() => runTelegramPaymentNotificationSchedulerTick(), TELEGRAM_PAYMENT_NOTIFIER_INTERVAL_MS).unref?.();
}

/*
 * A restart must not turn every maintenance scheduler into a thundering herd.
 * Only the first pass is serialized; steady-state intervals keep their normal
 * cadence. Keep a small gap between passes so pool recovery and request
 * traffic get event-loop and connection capacity first.
 */
const STARTUP_SCHEDULER_PAUSE_MS = 250;
let startupSchedulerQueue = Promise.resolve();

function scheduleStartupScheduler(name, task) {
  startupSchedulerQueue = startupSchedulerQueue
    .then(async () => {
      try {
        await task();
      } catch (error) {
        console.warn("[startup-scheduler-failed]", {
          name,
          code: error?.code || "",
          message: error?.message || String(error),
        });
      }
      await new Promise((resolve) => setTimeout(resolve, STARTUP_SCHEDULER_PAUSE_MS));
    });
}

const REQUIRED_CATALOGS = Object.freeze([
  { label: "OurDream presets", catalog: "ourdream_presets" },
  { label: "OurDream video actions", catalog: "ourdream_actions" },
  { label: "Realtime voices", catalog: "chat_live_voices", scope: "realtime" },
  { label: "Component voices", catalog: "chat_live_voices", scope: "component" },
  { label: "Showcase cases", catalog: "showcase_cases" },
]);

async function verifyRequiredCatalogsInDb() {
  const counts = {};
  for (const item of REQUIRED_CATALOGS) {
    const count = await countCatalogEntriesInDb(item.catalog, item.scope ? { scope: item.scope } : {});
    counts[item.scope ? `${item.catalog}:${item.scope}` : item.catalog] = count;
    if (count <= 0) {
      const error = new Error(`${item.label} is empty in PostgreSQL. Runtime catalogs must be seeded through PostgreSQL; JSON/file fallback is disabled.`);
      error.code = "POSTGRES_CATALOG_EMPTY";
      throw error;
    }
  }
  return counts;
}

async function bootstrap() {
  markStarting(processReadiness);
  if (!dbEnabled()) {
    const error = new Error("DATABASE_URL is required. Runtime data must be stored in PostgreSQL, not JSON files.");
    error.code = "DATABASE_UNAVAILABLE";
    markFailed(processReadiness, error);
    throw error;
  }
  const schemaMode = String(process.env.DB_SCHEMA_MIGRATION_MODE || "verify").trim().toLowerCase();
  await checkDatabaseStartup({ timeoutMs: 5000 });
  console.log("[database-check] ok");
  if (schemaMode === "bootstrap") {
    const generationRecordMigration = await migrateGenerationRecordsKvToTable();
    if (generationRecordMigration?.migrated) {
      console.log(`Generation records migrated to table: ${generationRecordMigration.migrated}`);
    }
    const geoStatsMigration = await migrateGeoStatsKvToTables();
    if (geoStatsMigration?.migrated) {
      console.log(`GEO stats migrated to tables: ${geoStatsMigration.migratedKeys.join(", ")}`);
    }
  } else {
    const schema = await assertSchemaReady();
    console.log(`[schema-check] ${JSON.stringify({ schemaVersion: schema.schemaVersion, tables: schema.requiredTables.length })}`);
  }
  const catalogCounts = await verifyRequiredCatalogsInDb();
  console.log(`[catalog-check] ${JSON.stringify(catalogCounts)}`);
  if (schemaMode === "bootstrap") {
    const apiTokensMigrated = await ensureAllUsersApiTokens();
    if (apiTokensMigrated) {
      console.log("User API tokens migrated: yes");
    }
  }
  /* Scheduler ownership is always PostgreSQL-leased. A replacement instance
     may disable timers while the old instance drains, then enable them once
     it is promoted; HTTP capacity never depends on this switch. */
  if (BACKGROUND_SCHEDULERS_ENABLED) {
    startWalletScanScheduler();
    startStaleSubmitGenerationRecordScheduler();
    startActiveGenerationRecordScheduler();
    startTelegramBotScheduler();
    startTelegramPaymentNotificationScheduler();
    startVideoToolJobRecoveryScheduler();
    startVideoToolUploadCleanupScheduler();
    startLocalMediaCleanupScheduler();
    startMediaIngestWorkerScheduler();
    startGenerationRecordMediaRecoveryScheduler();
    startGenerationRecordResultAssetMediaBackfillScheduler();
    startChatLiveSettlementScheduler();
  }
  /* Durable submit workers are promotion-gated independently from generic
     background scans. PostgreSQL leases still enforce one owner per tick. */
  startPlatformGenerationSubmitWorker();

  server.listen(PORT, "127.0.0.1", () => {
    markReady(processReadiness);
    console.log(`After Dark demo server: http://127.0.0.1:${PORT}/`);
    console.log(`Upstream mode: ${USE_GATEWAY_UPSTREAM ? "gateway" : "direct"}`);
    console.log(`Ark configured: ${ARK_API_KEY ? "yes" : "no"}`);
    console.log(`Database configured: ${DATABASE_URL ? "yes" : "no"}`);
  });
}

let gracefulShutdownStarted = false;

async function shutdownGracefully(signal = "SIGTERM") {
  if (gracefulShutdownStarted) return;
  gracefulShutdownStarted = true;
  markStopping(processReadiness);
  httpShutdownGate.begin();
  stopPlatformGenerationSubmitWorker();
  const startedAt = Date.now();
  const pendingSubmissions = beginGenerationSubmissionDrain();
  console.log("[graceful-shutdown-start]", { signal, pendingSubmissions });
  const forceExitTimer = setTimeout(() => {
    console.error("[graceful-shutdown-force-exit]", { signal, elapsedMs: Date.now() - startedAt });
    process.exit(1);
  }, GENERATION_SUBMIT_DRAIN_TIMEOUT_MS + HTTP_SHUTDOWN_SETTLE_MS + 5000);
  try {
    const serverClosed = closeHttpServerBounded(server, {
      socketTracker: httpSocketTracker,
      graceMs: Math.min(HTTP_SHUTDOWN_GRACE_MS, GENERATION_SUBMIT_DRAIN_TIMEOUT_MS),
      settleMs: HTTP_SHUTDOWN_SETTLE_MS,
    }).then((httpClose) => {
      if (httpClose.forced) {
        console.warn("[graceful-shutdown-http-force-close]", { signal, ...httpClose });
      }
      return httpClose;
    });
    const drain = await waitForGenerationSubmissionsToDrain(GENERATION_SUBMIT_DRAIN_TIMEOUT_MS);
    if (!drain.drained) {
      console.error("[graceful-shutdown-submit-drain-timeout]", drain);
      process.exit(1);
    }
    const httpClose = await serverClosed;
    clearTimeout(forceExitTimer);
    console.log("[graceful-shutdown-complete]", {
      signal,
      elapsedMs: Date.now() - startedAt,
      pendingSubmissions,
      httpClose,
    });
    process.exit(0);
  } catch (error) {
    clearTimeout(forceExitTimer);
    console.error("[graceful-shutdown-failed]", error.stack || error.message || error);
    process.exit(1);
  }
}

process.once("SIGTERM", () => shutdownGracefully("SIGTERM"));
process.once("SIGINT", () => shutdownGracefully("SIGINT"));

if (require.main === module) {
  bootstrap().catch((error) => {
    markFailed(processReadiness, error);
    console.error("[bootstrap] failed", error);
    process.exit(1);
  });
}

module.exports = {
  __httpServer: server,
  pathWithin,
  safePathWithin,
  safeAssetPathFromUrl,
  safePathWithinAssetRoots,
  resolveStaticFilePath,
  ASSETS_ROOT,
  RELEASE_ASSETS_ROOT,
  RUNTIME_MEDIA_ROOT,
  advancedModelPricing,
  publicAdvancedPricingRows,
  adminAdvancedPricingView,
  publicGenerationRecord,
  publicGenerationPollRecord,
  publicUserAsset,
  USER_UPLOAD_DIR,
  USER_CHARACTER_DIR,
  GENERATED_VIDEO_DIR,
  VIDEO_TOOL_UPLOAD_PART_DIR,
  publicUserCharacter,
  isProtectedLocalMediaPath,
  isLocalProtectedMediaAssetUrl,
  signLocalMediaPath,
  signLocalUserUploadPath,
  localMediaDeliveryUrl,
  localMediaDeliveryUrlForUpstream,
  publicUrlForLocalAsset,
  verifyLocalMediaSignature,
  verifyLocalUserUploadSignature,
  signedOssCdnUrlForDelivery,
  signedOssCdnUrlForUpstream,
  canonicalOssStorageUrlForCache,
  publicHttpUrlForUpstream,
  isPrivateVegaHostname,
  isPrivateIpAddress,
  resolvePublicRemoteUrl,
  fetchPublicRemoteUrl,
  downloadRemoteFileToBuffer,
  readResponseBodyWithLimit,
  objectStorageKeyFromPublicUrl,
  handleAdvancedVegaGenerate,
  startAdvancedGenerationJob,
  beginGenerationSubmission,
  finishGenerationSubmission,
  startTrackedGenerationJob,
  beginGenerationSubmissionDrain,
  waitForGenerationSubmissionsToDrain,
  shutdownGracefully,
  repairStalledGenerationRecords,
  repairFailedRefundedGenerationRecords,
  listFailedRefundedGenerationRecordsForAudit,
  repairFailedPreDeductedGenerationRecords,
  listFailedPreDeductedGenerationRecordsForAudit,
  listStalledGenerationRecordsForRepair,
  isStalledGenerationRecordCandidate,
  failStalledGenerationRecord,
  chatPersonaContrastAnchors,
  chatPromptReplyStyle,
  chatPromptBehaviorRules,
  chatSystemPrompt,
  chatLiveVoiceProfile,
  chatLiveCharacterVoiceLines,
  chatLiveCharacterPostureLines,
  chatLiveCharacterHasStrongStyle,
  chatReplyLivePersonaPosturePattern,
  chatLiveIntimateRewriteBeat,
  chatLiveIntimatePersonaPostureLine,
  chatIsImmediateIntimateScene,
  chatHasIntimateAction,
  chatIsIntimateForeplayScene,
  chatSceneExitIntent,
  chatSceneUserMessagesAfterLastExit,
  chatSceneStage,
  chatReplyHasBrokenLiveSpeech,
  chatReplyHasLiveDirtyTalk,
  chatReplyHasLivePersonaPosture,
  chatReplyLiveOpensSubmissive,
  chatReplyLiveStartsWithPersonaPosture,
  chatReplyLivePersonaPostureCount,
  chatReplyHasLiveSpokenTexture,
  chatReplyHasLiveIntimateDelivery,
  chatReplyHasPersonaContrast,
  chatReplyIntimateVocalReactionCount,
  chatReplyLiveBrokenSpeechCount,
  chatReplyLiveDirtyTalkCount,
  chatReplyLiveIntimateScore,
  chatReplyLiveShortSpokenBeatCount,
  chatReplyLiveReceivingStateCount,
  chatReplyLiveIntimateProcessCount,
  chatReplyLiveIntimateGaps,
  chatReplyLiveStockPhraseCount,
  chatReplyLiveRepeatedClauseCount,
  chatReplyLiveSimilarity,
  chatReplyRepairLiveIntimateLocally,
  chatReplyCopiesStyleExamples,
  chatReplyHasForeignVocalEnglish,
  chatReplyWithLivePersonaSlip,
  chatReplyLiveIntimateFallback,
  chatReplyNeedsLiveIntimateRewrite,
  chatLiveUpstreamIsTerminal,
  chatLiveUpstreamBillingEvidence,
  chatLiveDisplayUpstreamEvidence,
  chatLiveSettlementDecision,
  chatLivePaidCoverageStatus,
  chatLiveBillableLimitSeconds,
  chatLiveLocalBillableSeconds,
  chatLiveSettlementBilling,
  chatLiveDisplayBilling,
  chatLiveSettlementLedgerAdjustment,
  chatLiveHoldRefundDue,
  chatLiveLedgerMatchesCharge,
  chatLiveCharacterAutoProfilePrompt,
  parseChatLiveCharacterAutoProfile,
  filterChatLiveComponentVoiceCatalog,
  CHAT_LIVE_COMPONENT_VOICE_ALLOWLIST,
  viduLiveMerchantAuth,
  viduLiveExternalUserId,
  viduLiveRelayWebSocketUrl,
  viduLivePublicCharacter,
};
