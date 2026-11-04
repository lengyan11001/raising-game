const server = http.createServer((req, res) => {
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

/* WebSocket upgrade: Vidu control channel proxy for chat live sessions. */
server.on("upgrade", (req, socket, head) => {
  if (!String(req.url || "").startsWith("/api/chat-live/ws")) {
    socket.destroy();
    return;
  }
  handleChatLiveUpgrade(req, socket, head).catch((error) => {
    console.warn("[chat-live-ws] upgrade failed", error.message || error);
    try { socket.destroy(); } catch {}
  });
});

server.keepAliveTimeout = Number(process.env.HTTP_KEEP_ALIVE_TIMEOUT_MS || 65000);
server.headersTimeout = Number(process.env.HTTP_HEADERS_TIMEOUT_MS || 70000);
server.requestTimeout = Number(process.env.HTTP_REQUEST_TIMEOUT_MS || 180000);
server.maxRequestsPerSocket = Number(process.env.HTTP_MAX_REQUESTS_PER_SOCKET || 1000);
server.maxConnections = Number(process.env.HTTP_MAX_CONNECTIONS || 2000);

let staleSubmitScanRunning = false;

async function scanStalePreSubmitGenerationRecords(reason = "timer") {
  if (staleSubmitScanRunning) return;
  staleSubmitScanRunning = true;
  try {
    const records = await getStalePreSubmitGenerationRecordsFromDb({
      olderThanMs: GENERATION_SUBMIT_STALE_MS,
      limit: 10,
      providers: ["seedance", "seedance-nsfw", "seedance25", SEEDANCE25_DIRECT_PROVIDER, "aliyun-wan30", "aliyun-wan27", "aliyun-happyhorse", "apiz", "seedream5-image", "qwen-image3"],
    }) || [];
    const staleRecords = records
      .filter((record) => isStalePreSubmitGenerationRecord(record))
      .slice(0, 10);
    if (!staleRecords.length) return;
    const settled = [];
    for (const record of staleRecords) {
      try {
        const nextRecord = await failStalePreSubmitGenerationRecord(record, `${reason}-stale-submit`);
        settled.push(nextRecord.taskId || record.taskId);
      } catch (error) {
        console.warn("[stale-submit-generation-record-failed]", record.taskId, error.message || error);
      }
    }
    if (settled.length) {
      console.warn("[stale-submit-generation-records-settled]", { reason, count: settled.length, taskIds: settled });
    }
  } catch (error) {
    console.warn("[stale-submit-generation-record-scan-failed]", error.message || error);
  } finally {
    staleSubmitScanRunning = false;
  }
}

function startStaleSubmitGenerationRecordScheduler() {
  setTimeout(() => scanStalePreSubmitGenerationRecords("startup"), 5000).unref?.();
  setInterval(() => scanStalePreSubmitGenerationRecords("timer"), GENERATION_STALE_SUBMIT_SCAN_INTERVAL_MS).unref?.();
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
  return String(record.provider || "").toLowerCase() === "aliyun-wan27-image"
    ? "asset_image_modify_refund"
    : "generation_refund";
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

function startActiveGenerationRecordScheduler() {
  setTimeout(() => scanActiveGenerationRecords("startup"), 15000).unref?.();
  setInterval(() => scanActiveGenerationRecords("timer"), GENERATION_ACTIVE_SCAN_INTERVAL_MS).unref?.();
}

function startTelegramBotScheduler() {
  if (!TELEGRAM_BOT_TOKEN || !telegramBotClient.enabled) return;
  setTimeout(() => scanTelegramGenerationNotifications(), 10000).unref?.();
  setInterval(() => scanTelegramGenerationNotifications(), TELEGRAM_BOT_NOTIFIER_INTERVAL_MS).unref?.();
}

function startTelegramPaymentNotificationScheduler() {
  if (!telegramPaymentNotifierEnabled()) return;
  setTimeout(() => scanTelegramPaymentNotifications(), 5000).unref?.();
  setInterval(() => scanTelegramPaymentNotifications(), TELEGRAM_PAYMENT_NOTIFIER_INTERVAL_MS).unref?.();
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
  if (!dbEnabled()) {
    throw new Error("DATABASE_URL is required. Runtime data must be stored in PostgreSQL, not JSON files.");
  }
  const generationRecordMigration = await migrateGenerationRecordsKvToTable();
  if (generationRecordMigration?.migrated) {
    console.log(`Generation records migrated to table: ${generationRecordMigration.migrated}`);
  }
  const geoStatsMigration = await migrateGeoStatsKvToTables();
  if (geoStatsMigration?.migrated) {
    console.log(`GEO stats migrated to tables: ${geoStatsMigration.migratedKeys.join(", ")}`);
  }
  const catalogCounts = await verifyRequiredCatalogsInDb();
  console.log(`[catalog-check] ${JSON.stringify(catalogCounts)}`);
  const apiTokensMigrated = await ensureAllUsersApiTokens();
  if (apiTokensMigrated) {
    console.log("User API tokens migrated: yes");
  }
  startWalletScanScheduler();
  startStaleSubmitGenerationRecordScheduler();
  startActiveGenerationRecordScheduler();
  startTelegramBotScheduler();
  startTelegramPaymentNotificationScheduler();
  startVideoToolJobRecoveryScheduler();
  startVideoToolUploadCleanupScheduler();
  startLocalMediaCleanupScheduler();
  startGenerationRecordMediaRecoveryScheduler();
  startChatLiveSettlementScheduler();

  server.listen(PORT, "127.0.0.1", () => {
    console.log(`After Dark demo server: http://127.0.0.1:${PORT}/`);
    console.log(`Upstream mode: ${USE_GATEWAY_UPSTREAM ? "gateway" : "direct"}`);
    console.log(`Ark configured: ${ARK_API_KEY ? "yes" : "no"}`);
    console.log(`Database configured: ${DATABASE_URL ? "yes" : "no"}`);
  });
}

if (require.main === module) {
  bootstrap().catch((error) => {
    console.error("[bootstrap] failed", error);
    process.exit(1);
  });
}

module.exports = {
  handleAdvancedVegaGenerate,
  repairStalledGenerationRecords,
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
};
