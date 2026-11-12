const http = require("node:http");
const { runWithSchedulerLease } = require("./lib-scheduler-lease");
const { executeRequestIdempotently, requestIdempotencyKey } = require("./lib-request-idempotency");
const crypto = require("node:crypto");
const { AsyncLocalStorage } = require("node:async_hooks");
const fsSync = require("node:fs");
const fs = require("node:fs/promises");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const tls = require("node:tls");
const dns = require("node:dns");
const chatLiveComponent = require("./chat-live-component");
const viduLiveRelay = require("./vidu-live-relay");
const { execFile } = require("node:child_process");
const { Readable } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const { URL } = require("node:url");
const {
  CAPABILITIES: ALIYUN_VIDEO_CAPABILITIES,
  OFFICIAL_SINGAPORE_LEGACY_USD_PER_SECOND: ALIYUN_VIDEO_OFFICIAL_LEGACY_PRICING,
  OFFICIAL_SINGAPORE_USD_PER_SECOND: ALIYUN_VIDEO_OFFICIAL_PRICING,
  buildAliyunVideoRequest,
  normalizeCapability: normalizeAliyunVideoCapability,
  officialSingaporePurchaseDetails,
} = require("./aliyun-video");
const mulerouterAliyun = require("./mulerouter-aliyun");
const {
  SEEDANCE25_DIRECT_SEED_MAX,
  normalizeOptionalSeed,
} = require("./seed-options");
const {
  SEEDANCE25_CNY_PER_POINT,
  SEEDANCE25_CNY_PER_USD,
  SEEDANCE25_MODEL,
  SEEDANCE25_POINTS_PER_SECOND,
  SEEDANCE25_RATIOS,
  buildSeedance25TaskPayload,
  normalizeSeedance25Mode,
  purchaseSiteCreditsPerSecond: seedance25PurchaseSiteCreditsPerSecond,
  seedance25TaskFailureMessage,
} = require("./seedance25");
const {
  SEEDANCE25_DIRECT_ENDPOINT_ID,
  SEEDANCE25_DIRECT_LABEL,
  SEEDANCE25_DIRECT_MODEL,
  SEEDANCE25_DIRECT_PROVIDER,
  SEEDANCE25_DIRECT_RATIOS,
  SEEDANCE25_DIRECT_RESOLUTIONS,
  SEEDANCE25_DIRECT_USD_PER_MILLION_TOKENS,
  buildSeedance25DirectTaskPayload,
  directEstimatedCompletionTokens,
  directPurchaseUsdPerSecond,
  normalizeSeedance25DirectMode,
} = require("./seedance25-direct");
const {
  QWEN_IMAGE3_MODELS,
  QWEN_IMAGE3_OFFICIAL_USD,
  QWEN_IMAGE3_OUTPUT_MAX,
  QWEN_IMAGE3_REFERENCE_LIMIT,
  QWEN_IMAGE3_SEED_MAX,
  QWEN_IMAGE3_SIZE_MAX_PIXELS,
  QWEN_IMAGE3_SIZE_MIN_PIXELS,
  buildQwenImage3Request,
  normalizeQwenImage3Resolution,
  normalizeQwenImage3Tier,
  qwenImage3ModelForTier,
  qwenImage3OfficialPricing,
  qwenImage3OutputUrls,
  qwenImage3ResolutionForSize,
  qwenImage3Size,
} = require("./qwen-image3");
const {
  VIDEO_TOOL_FACE_SWAP_PROMPT,
  IMAGE_TOOL_FACE_SWAP_PROMPT,
  VIDEO_TOOL_UNDRESS_KEYFRAME_PROMPT,
  VIDEO_TOOL_UNDRESS_TARGET_PROMPT,
  VIDEO_TOOL_UNDRESS_VIDEO_PROMPT,
  VIDEO_TOOL_UNDRESS_EDIT_PROMPT,
  VIDEO_TOOL_UNDRESS_IMAGE_VIDEO_PROMPT,
  planVideoEditSegments,
} = require("./video-tools");
const {
  DEFAULT_UNDRESS_PROMPTS,
  normalizeUndressPrompts,
  undressPromptForAction,
  validateUndressPrompts,
} = require("./undress-prompts");
const {
  WORKFLOW_CANVAS_LIMIT,
  WORKFLOW_CANVAS_WRITE_PAYLOAD_BYTES,
  defaultWorkflowCanvasState,
  normalizeWorkflowCanvasName,
  normalizeWorkflowCanvasState,
  validateWorkflowCanvasForWrite,
  publicWorkflowCanvasSummary,
  publicWorkflowCanvasView,
} = require("./workflow-canvases");
const { getOurDreamPresetLibrary } = require("./ourdream-presets");
const {
  closeHttpServerBounded,
  createHttpShutdownGate,
  createHttpSocketTracker,
} = require("./http-shutdown");
const { createBaselineMetrics, envFlag, normalizeRouteName } = require("./baseline-metrics");
const { createOperationalStatsReader } = require("./db-operational-stats");
const {
  COMPANION_LEVELS,
  INTIMACY_STAGES,
  companionLevelForRechargeUsd,
  companionLevelSummary,
  intimacyStageForDays,
  localDayKey,
  nextCharacterRelationship,
  publicCharacterRelationship,
} = require("./companion-domain");
const {
  SEEDANCE_REFERENCE_VIDEO_MIN_SECONDS,
  SEEDANCE_REFERENCE_VIDEO_MAX_SECONDS,
  minimumImageTargetDimensions,
  pngBufferHasTransparency,
  publicUrlMatchesStorageBase,
  referenceVideoDurationViolation,
} = require("./media-inputs");
const {
  markPublishedFileSafely,
  cleanupTransientMediaWorkspaces,
} = require("./local-media-retention");
const {
  smtpConfig,
  smtpConfigured,
  sendSmtpMail,
} = require("./email-smtp");
const {
  ossConfig,
  ossConfigured: ossStorageConfigured,
  ossEnabled: ossStorageEnabled,
  uploadObject: uploadOssObject,
  uploadFileObject: uploadOssFileObject,
  deleteObject: deleteOssObject,
  signedDownloadUrl: makeOssSignedDownloadUrl,
  signedCdnUrl: makeOssSignedCdnUrl,
  headObject: headOssObject,
  downloadObject: downloadOssObject,
} = require("./oss-storage");
const {
  DEFAULT_TENANT_ID,
  normalizeTenantId,
  dbEnabled,
  query,
  getPool,
  getSchedulerPool,
  readGeoVisitorStatsFromDb,
  recordGeoVisitorVisitInDb,
  readGeoCrawlerStatsFromDb,
  recordGeoCrawlerVisitInDb,
  readGeoCharacterVisitStatsFromDb,
  recordGeoCharacterVisitInDb,
  migrateGeoStatsKvToTables,
  migrateGenerationRecordsKvToTable,
  readAppDbFromTables,
  replaceAppDbTables,
  replaceCatalogEntriesInDb,
  countCatalogEntriesInDb,
  listCatalogEntriesFromDb,
  getCatalogMigrationStateInDb,
  markCatalogMigrationInDb,
  getRuntimeSettingFromDb,
  setRuntimeSettingInDb,
  applyCreditDeltaInDb,
  deleteUserSessionsInDb,
  replaceUserSessionInDb,
  incrementRateLimitInDb,
  recordRiskEventInDb,
  claimWebhookDeliveryInDb,
  releaseWebhookDeliveryClaimInDb,
  completeWebhookDeliveryClaimInDb,
  claimRequestIdempotencyInDb,
  releaseRequestIdempotencyClaimInDb,
  completeRequestIdempotencyInDb,
  getLoginFailureStateInDb,
  recordLoginFailureInDb,
  clearLoginFailuresInDb,
  cleanupAuthRiskDataInDb,
  getRiskSummaryFromDb,
  deleteSessionByTokenInDb,
  deleteUserWalletOrdersInDb,
  createWalletOrderInDb,
  createManualWalletOrderInDb,
  getUserByUsernameInDb,
  upsertEmailChallengeInDb,
  consumeEmailChallengeInDb,
  deleteEmailChallengeInDb,
  getUserByTelegramIdInDb,
  getUserByGoogleIdInDb,
  getUserByIdInDb,
  hasAnyActiveUserInDb,
  getUserByApiTokenInDb,
  getUsersByIdsInDb,
  createSessionInDb,
  getSessionByTokenInDb,
  getSessionByUserDeviceInDb,
  getUserByVerifiedEmailInDb,
  getWalletChainScanDataFromDb,
  getTelegramPaymentNotificationScanDataFromDb,
  claimTelegramPaymentNotificationRecipientInDb,
  confirmTelegramPaymentNotificationRecipientInDb,
  releaseTelegramPaymentNotificationRecipientClaimInDb,
  recordTelegramPaymentNotificationStateInDb,
  getWalletOrderByIdInDb,
  getPromotionPurchaseStateInDb,
  reservePromotionPurchaseInDb,
  markPromotionPurchasePaidInDb,
  markPromotionPurchaseFailedInDb,
  getPromotionPurchaseByOrderInDb,
  getWalletOrderByPaypalIdInDb,
  createReferralWithdrawalInDb,
  updateReferralWithdrawalInDb,
  getReferralWithdrawalByIdInDb,
  getReferralWithdrawalsPageFromDb,
  listBillingPlansInDb,
  getBillingPlanInDb,
  updateBillingPlansInDb,
  getUserSubscriptionInDb,
  upsertUserSubscriptionInDb,
  createMembershipActivationCodesInDb,
  listMembershipActivationCodesInDb,
  getAdminRechargeLedgerPageFromDb,
  getAdminUsersPageFromDb,
  getAdminWalletOrdersPageFromDb,
  getAdminUserAssetsPageFromDb,
  getUserAssetsPageFromDb,
  getUserWalletOrdersPageFromDb,
  getUserSpendingRecordsPageFromDb,
  getSpendingMonthlySummaryFromDb,
  getAdminUserCharactersPageFromDb,
  getUserCharactersPageFromDb,
  getAdminSupportMessagesPageFromDb,
  createSupportTicketInDb,
  listUserSupportTicketsInDb,
  countUserSupportUnreadFromDb,
  getSupportTicketForUserFromDb,
  getSupportTicketForAdminFromDb,
  listSupportTicketMessagesFromDb,
  appendSupportTicketMessageInDb,
  markSupportTicketReadInDb,
  updateSupportTicketInDb,
  getAdminSupportTicketsPageFromDb,
  listUserSupportMessagesInDb,
  listSystemNotificationsForUserFromDb,
  listAdminSystemNotificationsFromDb,
  createSystemNotificationInDb,
  updateSystemNotificationInDb,
  deleteSystemNotificationInDb,
  markSystemNotificationReadInDb,
  markAllSystemNotificationsReadInDb,
  createUserSupportMessageInDb,
  getSupportMessageByIdInDb,
  updateUserSupportMessageInDb,
  listLiveNotificationsInDb,
  createLiveNotificationInDb,
  markLiveNotificationReadInDb,
  markAllLiveNotificationsReadInDb,
  getLiveCheckinInDb,
  getLiveCheckinHistoryPageFromDb,
  createLiveCheckinWithCreditInDb,
  getLiveDailyTaskClaimsInDb,
  getLiveDailyTaskCompletionInDb,
  createLiveDailyTaskClaimWithCreditInDb,
  recordCreatorUsageEarningInDb,
  recordCreatorVideoViewEarningInDb,
  getCreatorIncomeInDb,
  createCreatorWithdrawalInDb,
  listCreatorWithdrawalsInDb,
  getAdminCreatorDataInDb,
  getAdminCreatorWithdrawalsPageFromDb,
  updateCreatorWithdrawalInDb,
  hasReferralRewardInDb,
  setMembershipActivationCodeStatusInDb,
  redeemMembershipActivationCodeInDb,
  updateWalletOrderInDb,
  updateUserInDb,
  revokeUserCredentialsInDb,
  patchUserPayloadInDb,
  upsertUserAssetInDb,
  getUserAssetFromDb,
  getUserAssetsForUserFromDb,
  getUserAuthSummaryFromDb,
  getUserAssetsByIdsFromDb,
  getVegaMediaLibraryEntryFromDb,
  getVegaMediaLibrarySourceUrlsByAssetUrisFromDb,
  upsertVegaMediaLibraryEntryInDb,
  getUserAssetIdsByUrlsFromDb,
  upsertUserCharacterInDb,
  listChatConversationsInDb,
  findChatConversationByCharacterInDb,
  getChatConversationInDb,
  upsertChatConversationInDb,
  getCharacterRelationshipInDb,
  upsertCharacterRelationshipInDb,
  getGuideStateInDb,
  upsertGuideStateInDb,
  listChatMessagesInDb,
  listChatMessagesAfterInDb,
  insertChatMessageInDb,
  insertChatMessagesIfAbsentInDb,
  updateChatMessageInDb,
  deleteChatMessageInDb,
  deleteChatMessagesAfterInDb,
  listChatLiveCharactersInDb,
  listChatLiveCharactersByOwnerInDb,
  getChatLiveCharacterInDb,
  getChatLiveCharacterByOwnerInDb,
  upsertChatLiveCharacterInDb,
  softDeleteChatLiveCharacterInDb,
  listActiveChatLiveSessionsByCharacterIdInDb,
  createChatLiveSessionInDb,
  getChatLiveSessionInDb,
  getChatLiveSessionByLiveIdInDb,
  getChatCharacterMemoryInDb,
  upsertChatCharacterMemoryInDb,
  withChatLiveSessionSettlementLockInDb,
  withWalletOrderSettlementLockInDb,
  withWalletUserSettlementLockInDb,
  withUserMutationLockInDb,
  allocateChatLiveFreeSecondsInDb,
  finalizeChatLiveFreeAllocationInDb,
  cancelChatLiveFreeAllocationInDb,
  cleanupOrphanedChatLiveFreeAllocationsInDb,
  listChatLiveSessionsInDb,
  listUnsettledChatLiveSessionsInDb,
  listTerminalChatLiveSessionsMissingHistoryInDb,
  upsertChatLiveRoomInDb,
  getChatLiveRoomInDb,
  listChatLiveRoomsInDb,
  upsertChatLiveRoomMemberInDb,
  insertChatLiveRoomMessageInDb,
  listChatLiveRoomMessagesInDb,
  query: dbQuery,
  upsertUserUnlockInDb,
  claimToolFreeGenerationInDb,
  getToolFreeGenerationClaimInDb,
  hasUserRechargeInDb,
  completeToolFreeGenerationInDb,
  markToolFreeGenerationUnlockedInDb,
  releaseToolFreeGenerationClaimInDb,
  listAdminHomeItemsFromDb,
  upsertAdminHomeItemInDb,
  replaceAdminHomeItemsInDb,
  softDeleteAdminHomeItemInDb,
  listWorkflowPresetsFromDb,
  listWorkflowCanvasesFromDb,
  getWorkflowCanvasFromDb,
  createWorkflowCanvasInDb,
  updateWorkflowCanvasInDb,
  deleteWorkflowCanvasInDb,
  findUserUnlockInDb,
  getKv,
  setKv,
  getKvUpdatedAt,
  checkDatabaseReadiness,
  checkDatabaseStartup,
  assertSchemaReady,
  listApiSubtokensFromDb,
  getApiSubtokenFromDbByToken,
  getApiSubtokenFromDbById,
  createApiSubtokenInDb,
  updateApiSubtokenInDb,
  revokeApiSubtokenInDb,
  recordApiSubtokenUsageInDb,
  getGenerationRecordsFromDb,
  getStalePreSubmitGenerationRecordsFromDb,
  getGenerationRecordsForScheduledMaintenanceFromDb,
  getGenerationRecordsNeedingPosterMaintenanceFromDb,
  getGenerationRecordsNeedingMediaPersistenceFromDb,
  getGenerationRecordsNeedingR2RecoveryFromDb,
  getUserGenerationRecordsPageFromDb,
  getAdminGenerationRecordsPageFromDb,
  getAdminDashboardStatsFromDb,
  getGenerationRecordFromDb,
  upsertGenerationRecordInDb,
  prepareGenerationSubmitInDb,
  getGenerationSubmitResumeStateInDb,
  claimNextGenerationSubmitJobsInDb,
  markGenerationSubmitJobSubmittingInDb,
  completeGenerationSubmitJobInDb,
  retryGenerationSubmitJobInDb,
  failGenerationSubmitJobInDb,
  getGenerationSubmitJobsNeedingReconciliationInDb,
  markGenerationSubmitJobUnknownInDb,
  claimTelegramGenerationNotificationInDb,
  confirmTelegramGenerationNotificationInDb,
  releaseTelegramGenerationNotificationClaimInDb,
  updateGenerationRecordAdvancedDownloadInDb,
  backfillGenerationRecordResultAssetMediaFieldsInDb,
  getGenerationRecordsNeedingResultAssetMediaBackfillFromDb,
  enqueueMediaIngestJobInDb,
  claimMediaIngestJobInDb,
  claimNextMediaIngestJobsInDb,
  completeMediaIngestJobInDb,
  expireExhaustedMediaIngestJobsInDb,
  syncFailedMediaIngestRecordStatusesInDb,
  failMediaIngestJobInDb,
  replaceGenerationRecordsInDb,
  patchGenerationRecordsInDb,
  insertWebVitalSamplesInDb,
  getWebVitalsSummaryFromDb,
} = require("./db");
const {
  buildSitemapXml: buildStableSitemapXml,
  canonicalHostname,
  canonicalizeOrigin,
  collectionUpdatedAt,
  itemUpdatedAt,
  latestIsoTimestamp,
  publicGeoMediaUrl,
  renderDiscoveryLinks,
  siteVerificationToken,
} = require("./site-seo");
const {
  applyPublicSecurityHeaders,
  httpsRedirectLocation,
  publicAdminMediaPath,
  publicStaticPath,
} = require("./site-http");
const {
  resolveLiveStaticRoot,
  shouldBlockLiveOwnedStatic,
} = require("./lib-live-surface");
const {
  createTelegramLoginNonce,
  createTelegramBotClient,
  parseTelegramLoginNonce,
  parseTelegramWebAppInitData,
  telegramStatusStage,
  telegramUserLabel: telegramBotUserLabel,
  verifyTelegramOidcIdToken,
} = require("./telegram-bot");

const {
  VEGA_ALL_RATIOS,
  VEGA_ALL_RESOLUTIONS,
  VEGA_CAPABILITIES,
  assertVegaPricingConfigured,
  buildVegaCreatePayload,
  callTencentVod,
  prepareVegaMediaLibraryFileInfos,
  resolveVegaMediaAssetSources,
  resolveVegaLiteMediaAssetSources,
  isVegaProvider,
  normalizeVegaDuration,
  normalizeVegaMediaMode,
  normalizeVegaRatio,
  normalizeVegaResolution,
  resolveVegaDraftSelection,
  normalizeVegaStatus,
  vegaCreateTaskId,
  vegaDurationBounds,
  vegaMediaSelection,
  vegaOutputLastFrameUrl,
  vegaOutputUsage,
  vegaOutputVideoUrl,
  vegaPricingUnavailableError,
  vegaProviderCapabilities,
  vegaProviderDefinition,
  vegaProviderLabel,
  vegaProviderUsesMediaLibrary,
  vegaTaskDetail,
  vegaTaskFailureMessage,
} = require("./tencent-vod-vega");
const {
  isSeedream5ImageProvider,
  isQwenImage3Provider,
  isQwen37FlashProvider,
  isByteplusLanguageProvider,
  isPapayaProvider,
  isWan27ImageProvider,
  normalizeAdvancedProvider,
  publicProviderId,
  publicProviderLabel,
  publicGenerationDisplayLabel,
  publicModelText,
  publicModelKey,
  publicModelValue,
  slimGenerationRecordValue,
  storageGenerationRecord,
  listGenerationRecordValue,
  publicPricingValue,
  publicDocsValue,
  normalizeSeedanceTier,
} = require("./lib-providers");
const {
  sendJson,
  sendText,
  sendHtml,
  publicLegalPageHtml,
  sendXml,
  sendCsv,
  csvValue,
  csvRows,
  htmlEscape,
  xmlEscape,
  requestCountryCode,
  parseCookieHeader,
  timingSafeEqualString,
  sendMarkdown,
  publicOriginFromRequest,
  requestOriginFromHeaders,
} = require("./lib-http");
const {
  createReadinessState,
  markReady,
  markStarting,
  markStopping,
  markFailed,
  readinessView,
  liveView,
  probeReadiness,
  readinessResponse,
} = require("./readiness");
const ROOT = __dirname;
const ASSETS_ROOT = path.join(ROOT, "assets");

function pathWithin(root, target, { allowRoot = false } = {}) {
  const rootPath = path.resolve(String(root || ""));
  const targetPath = path.resolve(String(target || ""));
  const relative = path.relative(rootPath, targetPath);
  if (!relative) return allowRoot;
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function safePathWithin(root, target, options = {}) {
  if (!pathWithin(root, target, options)) return "";
  const rootPath = path.resolve(String(root || ""));
  let rootReal = rootPath;
  try {
    rootReal = fsSync.realpathSync.native(rootPath);
  } catch {}
  let probe = path.resolve(String(target || ""));
  const suffix = [];
  while (true) {
    try {
      const real = fsSync.realpathSync.native(probe);
      const resolved = path.join(real, ...suffix.reverse());
      return pathWithin(rootReal, resolved, options) ? path.resolve(String(target || "")) : "";
    } catch {
      const parent = path.dirname(probe);
      if (parent === probe) return "";
      suffix.push(path.basename(probe));
      probe = parent;
    }
  }
}

function safeAssetPathFromUrl(value = "") {
  const text = String(value || "").trim().split("?")[0];
  if (!text.startsWith("/assets/")) return "";
  const target = path.resolve(ASSETS_ROOT, text.replace(/^\/+/, "").replace(/^assets\//, ""));
  return safePathWithin(ASSETS_ROOT, target);
}

const LIVE_STATIC_ROOT = resolveLiveStaticRoot(ROOT, process.env.LIVE_STATIC_ROOT);
const PLATFORM_ASSET_FILES = Object.freeze([
  "platform.html",
  "platform.css",
  "platform.prompt-editor.css",
  "platform.js",
  "platform-sw.js",
  "platform.config.js",
  "platform.vega-media.js",
  "platform.copy.js",
  "platform.ui.js",
  "platform.ui.parts/part-01.js",
  "platform.ui.parts/part-02.js",
  "platform.ui.parts/part-03.js",
  "platform.ui.parts/part-04.js",
  "platform.ui.parts/part-05.js",
  "platform.ui.parts/part-06.js",
  "platform.ui.parts/part-07.js",
  "platform.telegram.js",
  "platform.workflow-canvases.js",
  "platform.workflow-react.js",
  "workflow-react/dist/canvas.js",
  "workflow-react/dist/canvas.js.LICENSE.txt",
  "workflow-react/dist/assets/bootstrap-icons.woff",
  "workflow-react/dist/assets/bootstrap-icons.woff2",
  "workflow-react/vendor/react.production.min.js",
  "workflow-react/vendor/react-dom.production.min.js",
  "workflow-react/vendor/react-jsx-runtime-shim.js",
  "workflow-react/vendor/react-flow-12.11.3.umd.js",
  "workflow-react/vendor/react-flow-12.11.3.css",
  "platform.explore.js",
  "platform.cases.js",
  "platform.chat.js",
  "platform.create.js",
  "platform.create.parts/part-01.js",
  "platform.create.parts/part-02.js",
  "platform.create.parts/part-03.js",
  "platform.create.parts/part-04.js",
  "platform.create.parts/part-05.js",
  "platform.create.parts/part-06.js",
  "platform.video-tools.js",
  "platform.undress-tool.js",
  "platform.prompt-editor.js",
  "vendor/vipeak-prompt-editor.js",
  "platform.main.js",
  "site-123vipfans.js",
  "chat.html",
  "chat.css",
  "chat.js",
  "chat-live.js",
]);
const ADMIN_ASSET_VERSION = crypto
  .createHash("sha256")
  .update(fsSync.readFileSync(path.join(ROOT, "admin.css")))
  .update("\0")
  .update(fsSync.readFileSync(path.join(ROOT, "admin.js")))
  .digest("hex")
  .slice(0, 12);
const PLATFORM_ASSET_VERSION_CACHE_TTL_MS = 20_000;
let platformAssetVersionCache = { value: "", expiresAt: 0, promise: null };
const TOOL_VIDEO_STYLE_VERSION = crypto
  .createHash("sha256")
  .update(fsSync.readFileSync(path.join(ROOT, "tool-video.css")))
  .digest("hex")
  .slice(0, 12);
const TOOL_UNDRESS_STYLE_VERSION = crypto
  .createHash("sha256")
  .update(fsSync.readFileSync(path.join(ROOT, "tool-undress.css")))
  .digest("hex")
  .slice(0, 12);
const SITE_PROFILE_STYLE_VERSION = crypto
  .createHash("sha256")
  .update(fsSync.readFileSync(path.join(ROOT, "site-123vipfans.css")))
  .digest("hex")
  .slice(0, 12);
const SITE_PROFILE_SCRIPT_VERSION = crypto
  .createHash("sha256")
  .update(fsSync.readFileSync(path.join(ROOT, "site-123vipfans.js")))
  .digest("hex")
  .slice(0, 12);
const CHARACTER_TAKE_OFF_PROMPT = "脱掉所有衣服，保持裸体，不要出现肉色衣服";

function loadLocalEnv(filePath) {
  if (!fsSync.existsSync(filePath)) return;
  const lines = fsSync.readFileSync(filePath, "utf8").split(/\r?\n/);
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const index = trimmed.indexOf("=");
    if (index < 1) return;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  });
}

loadLocalEnv(path.join(ROOT, ".env.local"));
const {
  PLATFORM_SITE_PROFILE,
  defaultPageForHostname,
  normalizeHostname,
  standaloneLandingHostname,
  parseCsvList,
  toolVideoDefaultCapability,
  hostnameFromOrigin,
  requestHostname,
  tenantDescriptorFromOrigin,
  requestTenantDescriptor,
  requestTenantOptions,
  requestTenantId,
  recordTenantId,
  recordBelongsToTenant,
  pageOriginFromRequest,
} = require("./lib-tenants");

const DATABASE_URL = process.env.DATABASE_URL || "";
const BLOCK_MAINLAND_CHINA = /^(1|true|yes|on)$/i.test(String(process.env.BLOCK_MAINLAND_CHINA || "1").trim());
const MAINLAND_ALLOW_HOSTS = new Set(parseCsvList(process.env.MAINLAND_ALLOW_HOSTS || "live.123vipeak.com"));
const GEO_VISIT_STATS_ENABLED = /^(1|true|yes|on)$/i.test(String(process.env.GEO_VISIT_STATS_ENABLED || "0").trim());
const PUBLIC_ALIYUN_MODEL_EXPOSURE_ENABLED = /^(1|true|yes|on)$/i.test(String(process.env.PUBLIC_ALIYUN_MODEL_EXPOSURE_ENABLED || "0").trim());
const PUBLIC_WAN30_MODEL_EXPOSURE_ENABLED = /^(1|true|yes|on)$/i.test(String(process.env.PUBLIC_WAN30_MODEL_EXPOSURE_ENABLED || "0").trim());
const PUBLIC_WAN27_MODEL_EXPOSURE_ENABLED = /^(1|true|yes|on)$/i.test(String(process.env.PUBLIC_WAN27_MODEL_EXPOSURE_ENABLED || "0").trim());
const PUBLIC_HAPPYHORSE_MODEL_EXPOSURE_ENABLED = /^(1|true|yes|on)$/i.test(String(process.env.PUBLIC_HAPPYHORSE_MODEL_EXPOSURE_ENABLED || "0").trim());
const PUBLIC_QWEN_IMAGE3_EXPOSURE_ENABLED = /^(1|true|yes|on)$/i.test(String(process.env.PUBLIC_QWEN_IMAGE3_EXPOSURE_ENABLED || "0").trim());
const MAINLAND_BYPASS_TOKEN = String(process.env.MAINLAND_BYPASS_TOKEN || "").trim();
const MAINLAND_BYPASS_QUERY_PARAM = process.env.MAINLAND_BYPASS_QUERY_PARAM || "cnpass";
const MAINLAND_BYPASS_COOKIE = process.env.MAINLAND_BYPASS_COOKIE || "cnpass";
const MAINLAND_BYPASS_MAX_AGE_SECONDS = Math.max(
  60,
  Math.min(30 * 24 * 60 * 60, Number(process.env.MAINLAND_BYPASS_MAX_AGE_SECONDS || 24 * 60 * 60) || 24 * 60 * 60),
);

const PORT = Number(process.env.PORT || 4174);
const BACKGROUND_SCHEDULERS_ENABLED = /^(1|true|yes|on)$/i.test(String(process.env.BACKGROUND_SCHEDULERS_ENABLED || "1"));
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, "");
const CANONICAL_HOST_ALIASES = String(process.env.CANONICAL_HOST_ALIASES || "").trim();
const GOOGLE_SITE_VERIFICATION = String(process.env.GOOGLE_SITE_VERIFICATION || "").trim();
const GOOGLE_SITE_VERIFICATION_BY_HOST = String(process.env.GOOGLE_SITE_VERIFICATION_BY_HOST || "").trim();
const PAYMENT_HOSTS = new Set(parseCsvList(process.env.PAYMENT_HOSTS || "pay.seed2.io"));
const TOOL_VIDEO_SEEDANCE_MODEL = "ep-20260429142513-zg667";
const VIDEO_REPLACE_PROMPT = "将视频1中的人物替换成图片1中的人物。保持图片中人物的身份、脸部、发型、体型、肤色和服装特征，严格参考原视频的动作顺序、姿态变化、节奏、运镜、构图、场景、光线、剪辑、音频和时长。除人物身份替换外，不改变原视频内容，不添加文字、字幕、标志、水印或其他人物。";

const INDEXNOW_KEY = String(process.env.INDEXNOW_KEY || "").trim();
const TELEGRAM_SUPPORT_BOT_TOKEN = String(process.env.TELEGRAM_SUPPORT_BOT_TOKEN || "").trim();
const TELEGRAM_SUPPORT_ADMIN_CHAT_ID = String(process.env.TELEGRAM_SUPPORT_ADMIN_CHAT_ID || "").trim();
const TELEGRAM_SUPPORT_WEBHOOK_SECRET = String(process.env.TELEGRAM_SUPPORT_WEBHOOK_SECRET || "").trim();
const TELEGRAM_BOT_TOKEN = String(process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_UNDRESS_BOT_TOKEN || "").trim();
const TELEGRAM_LOGIN_BOT_TOKEN = String(process.env.TELEGRAM_LOGIN_BOT_TOKEN || TELEGRAM_BOT_TOKEN || "").trim();
const TELEGRAM_LOGIN_CLIENT_ID = String(process.env.TELEGRAM_LOGIN_CLIENT_ID || TELEGRAM_LOGIN_BOT_TOKEN.split(":")[0] || "").trim();
const GOOGLE_LOGIN_ENABLED = /^(1|true|yes|on)$/i.test(String(process.env.GOOGLE_LOGIN_ENABLED || "0").trim());
const GOOGLE_LOGIN_CLIENT_ID = String(process.env.GOOGLE_LOGIN_CLIENT_ID || "").trim();
const EMAIL_SMTP_CONFIG = smtpConfig();
const EMAIL_LOGIN_ENABLED = /^(1|true|yes|on)$/i.test(String(process.env.EMAIL_LOGIN_ENABLED || "0").trim()) || smtpConfigured(EMAIL_SMTP_CONFIG);
const processReadiness = createReadinessState();
const BASELINE_METRICS_ENABLED = envFlag(process.env.BASELINE_METRICS_ENABLED, false);
const baselineMetrics = createBaselineMetrics({
  enabled: BASELINE_METRICS_ENABLED,
  maxRoutes: process.env.BASELINE_METRICS_MAX_ROUTES,
  reservoirSize: process.env.BASELINE_METRICS_RESERVOIR_SIZE,
});
const operationalStats = createOperationalStatsReader({
  query,
  getPool,
  dbEnabled,
});

function baselineRouteLabel(pathname = "") {
  const path = String(pathname || "");
  if (path === "/api/health" || path === "/api/livez" || path === "/api/readyz") return path;
  if (path === "/api/config/public") return path;
  if (path === "/api/platform/playflux-templates") return path;
  if (path === "/api/generation-records") return path;
  if (/^\/api\/generation-records\/[^/]+$/.test(path)) return "/api/generation-records/:id";
  if (/^\/api\/workflow-canvases(?:\/[^/]+)?$/.test(path)) return "/api/workflow-canvases/:id";
  if (/^\/api\/admin\//.test(path)) return "/api/admin/*";
  if (/^\/api\/auth\//.test(path)) return "/api/auth/*";
  if (/^\/api\/billing\//.test(path)) return "/api/billing/*";
  if (/^\/api\/pay\//.test(path)) return "/api/pay/*";
  if (path.startsWith("/assets/")) return "/assets/*";
  if (path === "/" || /\.html?$/.test(path)) return "html";
  if (path.startsWith("/api/")) return normalizeRouteName(path.split("/").slice(0, 3).join("/") || "/api/*");
  return "static";
}
const publicConfigCache = new Map();
const publicPlayfluxTemplatesCache = new Map();
const TELEGRAM_BOT_WEBHOOK_SECRET = String(process.env.TELEGRAM_BOT_WEBHOOK_SECRET || "").trim();
const TELEGRAM_BOT_WEBAPP_URL = String(process.env.TELEGRAM_BOT_WEBAPP_URL || "https://undress.14vips.com/").trim();
const TELEGRAM_BOT_WEBHOOK_PATH = String(process.env.TELEGRAM_BOT_WEBHOOK_PATH || "/api/telegram/webhook").trim().replace(/\/$/, "") || "/api/telegram/webhook";
const TELEGRAM_BOT_NOTIFIER_INTERVAL_MS = Math.max(10000, Number(process.env.TELEGRAM_BOT_NOTIFIER_INTERVAL_MS || 15000) || 15000);
const TELEGRAM_GENERATION_NOTIFICATIONS_ENABLED = /^(1|true|yes|on)$/i.test(String(process.env.TELEGRAM_GENERATION_NOTIFICATIONS_ENABLED || "1").trim());
const TELEGRAM_PAYMENT_BOT_TOKEN = String(process.env.TELEGRAM_PAYMENT_BOT_TOKEN || TELEGRAM_BOT_TOKEN || TELEGRAM_SUPPORT_BOT_TOKEN || "").trim();
const TELEGRAM_PAYMENT_NOTIFICATIONS_ENABLED = /^(1|true|yes|on)$/i.test(String(process.env.TELEGRAM_PAYMENT_NOTIFICATIONS_ENABLED || "0").trim());
const TELEGRAM_PAYMENT_NOTIFY_CHAT_IDS = [...new Set(String(process.env.TELEGRAM_PAYMENT_NOTIFY_CHAT_IDS || "")
  .split(/[\s,;]+/)
  .map((value) => value.trim())
  .filter((value) => /^-?\d+$/.test(value)))];
const TELEGRAM_PAYMENT_NOTIFIER_INTERVAL_MS = Math.max(10000, Number(process.env.TELEGRAM_PAYMENT_NOTIFIER_INTERVAL_MS || 15000) || 15000);
const VIPEAK_X_URL = "https://x.com/VipeakAI";
const VIPEAK_TELEGRAM_CHANNEL_URL = "https://t.me/VipeakAILab";
const VIPEAK_TELEGRAM_SUPPORT_URL = "https://t.me/VipeakSupportBot";
const CHARACTER_UNLOCK_COST_CREDITS = 0;
const PUBLIC_CHARACTER_PAGE_SIZE = 20;
const REFERRAL_REWARD_CREDITS = 100;
const CREATOR_MEMBERSHIP_PLAN_ID = "plan-main-creator";
const CREATOR_MEMBERSHIP_PRICE_USD = 99;
const CREATOR_MEMBERSHIP_REFERRAL_TARGET = 100;
const API_DOCS_PRODUCT_ID = "api-docs-access";
const USER_UPLOAD_DIR = path.join(ROOT, "assets", "user-uploads");
const ADMIN_HOME_DIR = path.join(ROOT, "assets", "admin", "home");
const UNDRESS_TOOL_EXAMPLE_DIR = path.join(ROOT, "assets", "admin", "undress-examples");
const ADMIN_ADVANCED_CASE_DIR = path.join(ROOT, "assets", "admin", "advanced-cases");
const ADMIN_PLATFORM_TEMPLATE_DIR = path.join(ROOT, "assets", "admin", "platform-templates");
const GENERATED_VIDEO_DIR = path.join(ROOT, "assets", "generated", "videos");
const GENERATED_VIDEO_DOWNLOAD_MAX_ATTEMPTS = 4;
const GENERATED_VIDEO_DURATION_TOLERANCE_SECONDS = 0.75;
const GENERATED_VIDEO_DOWNLOAD_RETRY_DELAY_MS = 2500;
const GENERATED_POSTER_DIR = path.join(ROOT, "assets", "generated", "posters");
const GENERATED_IMAGE_DIR = path.join(ROOT, "assets", "generated", "images");
const GENERATED_LOCKED_PREVIEW_DIR = path.join(ROOT, "assets", "generated", "locked-previews");
const GENERATED_CHARACTER_DIR = path.join(ROOT, "assets", "generated", "characters", "apiz");
const VIDEO_TOOL_UPLOAD_PART_DIR = path.join(ROOT, "tmp", "video-tool-uploads");
const VIDEO_TOOL_SOURCE_UPLOAD_MAX_BYTES = 300 * 1024 * 1024;
const VIDEO_TOOL_UPLOAD_CHUNK_MAX_BYTES = 10 * 1024 * 1024;
const VIDEO_TOOL_UPLOAD_CHUNK_MAX_COUNT = 64;
const ARK_BASE_URL = process.env.ARK_BASE_URL || "https://ark.ap-southeast.bytepluses.com/api/v3";
const ARK_API_KEY =
  process.env.ARK_API_KEY ||
  process.env.BYTEPLUS_ARK_API_KEY ||
  process.env.MODELARK_API_KEY ||
  "";

/* Vidu S2-Avatar realtime (chat tool "在线聊天" / live video chat) */
const VIDU_API_BASE = String(process.env.VIDU_API_BASE || "https://api.vidu.com").replace(/\/+$/, "");
const VIDU_API_KEY = String(process.env.VIDU_API_KEY || "").trim();
const VIDU_API_BASE_OVERSEAS = String(process.env.VIDU_API_BASE_OVERSEAS || "https://api.vidu.com").replace(/\/+$/, "");
const VIDU_API_BASE_CN = String(process.env.VIDU_API_BASE_CN || "https://api.vidu.cn").replace(/\/+$/, "");
function viduBaseLooksOverseas(base = "") {
  try { return new URL(String(base || "")).hostname.toLowerCase() === "api.vidu.com"; } catch { return false; }
}
const VIDU_API_KEY_OVERSEAS = String(
  process.env.VIDU_API_KEY_OVERSEAS || (viduBaseLooksOverseas(VIDU_API_BASE) ? VIDU_API_KEY : ""),
).trim();
const VIDU_API_KEY_CN = String(
  process.env.VIDU_API_KEY_CN || (!viduBaseLooksOverseas(VIDU_API_BASE) ? VIDU_API_KEY : ""),
).trim();
let chatLiveRegionCache = "";
const VIDU_LIVE_MODEL = String(process.env.VIDU_LIVE_MODEL || "vidu-s2").trim() || "vidu-s2";
/* Vidu bills the realtime avatar at 1.5 credits/second → 90/minute. */
const CHAT_LIVE_DEFAULT_COST_CREDITS_PER_MINUTE = 90;
const CHAT_LIVE_BILLING_BLOCK_SECONDS = 10;
const CHAT_LIVE_BILLING_TARGET_SECONDS = 30;
const CHAT_LIVE_BILLING_TICK_MS = 5000;
const CHAT_LIVE_UPSTREAM_TERMINAL_STATUSES = new Set(["ended", "failed", "closed"]);
const chatLiveBillingLocks = new Set();
const chatLiveSockets = new Map();
/* 组件版（外接我们自己的 ASR/LLM/TTS）需要自建 RTC 频道：阿里云 ARTC */
const ARTC_APP_ID = String(process.env.ARTC_APP_ID || "").trim();
const ARTC_APP_KEY = String(process.env.ARTC_APP_KEY || "").trim();

function viduCredentialsForRegion(region = "") {
  const requested = region === "cn" || region === "overseas"
    ? region
    : (chatLiveRegionCache === "cn" || chatLiveRegionCache === "overseas"
      ? chatLiveRegionCache
      : (viduBaseLooksOverseas(VIDU_API_BASE) ? "overseas" : "cn"));
  if (requested === "cn") return { region: "cn", base: VIDU_API_BASE_CN, key: VIDU_API_KEY_CN };
  return { region: "overseas", base: VIDU_API_BASE_OVERSEAS, key: VIDU_API_KEY_OVERSEAS };
}

function viduLiveRegion() {
  return viduCredentialsForRegion(chatLiveRegionCache).region;
}

function chatLiveVoiceRegionError(provider = "") {
  const value = String(provider || "");
  const region = viduLiveRegion();
  if (region === "overseas" && value === "doubao_cn") {
    return "当前接入的是海外 Vidu，不能使用国内豆包音色。请改成 qwen_omni 或海外豆包。";
  }
  if (region === "cn" && value === "doubao_overseas") {
    return "当前接入的是国内 Vidu，不能使用海外豆包音色。请改成 qwen_omni 或国内豆包。";
  }
  return "";
}

const SEEDANCE_QUALITY_ENDPOINT_ID = "ep-20260429142513-zg667";
const SEEDANCE_FAST_ENDPOINT_ID = "ep-20260429142538-fkm9d";
const MODEL_FAST =
  process.env.SEEDANCE_FAST_ENDPOINT_ID ||
  process.env.SEEDANCE_FAST_MODEL ||
  SEEDANCE_FAST_ENDPOINT_ID;
const MODEL_QUALITY =
  process.env.SEEDANCE_ENDPOINT_ID ||
  process.env.SEEDANCE_MODEL ||
  SEEDANCE_QUALITY_ENDPOINT_ID;
const SEEDREAM5_LITE_ENDPOINT_ID =
  process.env.SEEDREAM5_LITE_ENDPOINT_ID ||
  process.env.ARK_SEEDREAM5_LITE_MODEL ||
  "ep-20260721180102-9hm6g";
const SEEDREAM5_PRO_ENDPOINT_ID =
  process.env.SEEDREAM5_PRO_ENDPOINT_ID ||
  process.env.ARK_SEEDREAM5_PRO_MODEL ||
  "ep-20260721175949-xw978";
const IGNEX_API_BASE_URL = (process.env.IGNEX_API_BASE_URL || "https://api.ignex.ai").replace(/\/+$/, "");
const IGNEX_API_KEY = String(process.env.IGNEX_API_KEY || "").trim();
const IGNEX_PROJECT_NAME = String(process.env.IGNEX_PROJECT_NAME || "default").trim() || "default";
const IGNEX_ASSET_GROUP_ID = String(process.env.IGNEX_ASSET_GROUP_ID || "").trim();
const IGNEX_ASSET_GROUP_NAME = String(process.env.IGNEX_ASSET_GROUP_NAME || "vipeak-seedance").trim() || "vipeak-seedance";
const IGNEX_SEEDANCE_QUALITY_MODEL = String(process.env.IGNEX_SEEDANCE_QUALITY_MODEL || "dreamina-seedance-2-0-260128").trim();
const IGNEX_SEEDANCE_FAST_MODEL = String(process.env.IGNEX_SEEDANCE_FAST_MODEL || "dreamina-seedance-2-0-fast-260128").trim();
const IGNEX_ENABLED_USER_KEYS = new Set(
  String(process.env.IGNEX_ENABLED_USERS || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean),
);
const IGNEX_ASSET_URI_CACHE = new Map();
let ignexAssetGroupCache = "";
const PIVOX_API_BASE_URL = "";
const PIVOX_API_KEY = "";
const PIVOX_SEEDANCE_QUALITY_MODEL = "";
const PIVOX_SEEDANCE_FAST_MODEL = "";
const PIVOX_ENABLED_USER_KEYS = new Set();
const PIVOX_ASSET_GROUP_CACHE = new Map();
const PIVOX_ASSET_URI_CACHE = new Map();
const SEEDREAM5_ASSET_URI_CACHE = new Map();
const SEEDREAM5_IMAGE_IN_FLIGHT = new Map();
const QWEN_IMAGE3_IN_FLIGHT = new Map();
let qwenImage3SubmitTail = Promise.resolve();
let qwenImage3LastSubmitAt = 0;

const APIZ_BASE_URL = (process.env.APIZ_BASE_URL || "https://api.apiz.ai").replace(/\/+$/, "");
const APIZ_API_KEY = process.env.APIZ_API_KEY || process.env.XSKILL_API_KEY || "";
const SEEDANCE25_API_BASE_URL = (process.env.SEEDANCE25_API_BASE_URL || "https://api.apiz.ai").replace(/\/+$/, "");
const SEEDANCE25_API_KEY = String(process.env.SEEDANCE25_API_KEY || "").trim();
const SEEDANCE25_MODEL_ID = SEEDANCE25_MODEL;
const SEEDANCE25_DIRECT_ENDPOINT = String(process.env.SEEDANCE25_DIRECT_ENDPOINT_ID || SEEDANCE25_DIRECT_ENDPOINT_ID).trim();
const APIZ_SEEDANCE_API_BASE_URL = "";
const APIZ_SEEDANCE_API_KEY = "";
const APIZ_SEEDANCE_MODEL_ID = "";
const APIZ_SEEDANCE_QUALITY_MODEL = "";
const APIZ_SEEDANCE_FAST_MODEL = "";
const APIZ_SEEDANCE_ASSET_URI_CACHE = new Map();
const UPSTREAM_MODE = String(process.env.UPSTREAM_MODE || "direct").trim().toLowerCase();
const USE_GATEWAY_UPSTREAM = ["gateway", "proxy", "api"].includes(UPSTREAM_MODE);
const UPSTREAM_BASE_URL = (process.env.UPSTREAM_BASE_URL || "https://123vips.com").replace(/\/+$/, "");
const UPSTREAM_API_TOKEN = String(process.env.UPSTREAM_API_TOKEN || "").trim();
const GATEWAY_PLATFORM_FALLBACK_CREDITS = Math.max(1, creditsAmount(process.env.GATEWAY_PLATFORM_FALLBACK_CREDITS || 1325));
const APIZ_PRICING_CACHE_TTL_MS = 60 * 60 * 1000;
const GENERATION_SUBMIT_QUEUE_ENABLED = /^(1|true|yes|on)$/i.test(String(process.env.GENERATION_SUBMIT_QUEUE_ENABLED || "0").trim());
const ADVANCED_GENERATION_SUBMIT_QUEUE_ENABLED = /^(1|true|yes|on)$/i.test(String(process.env.ADVANCED_GENERATION_SUBMIT_QUEUE_ENABLED || "0").trim());
const ADVANCED_GENERATION_SUBMIT_KIND = "advanced-generation";
const GENERATION_SUBMIT_WORKER_ENABLED = /^(1|true|yes|on)$/i.test(String(process.env.GENERATION_SUBMIT_WORKER_ENABLED || "0").trim());
const GENERATION_SUBMIT_WORKER_INTERVAL_MS = Math.max(1000, Number(process.env.GENERATION_SUBMIT_WORKER_INTERVAL_MS || 2000) || 2000);
const GENERATION_SUBMIT_WORKER_BATCH_SIZE = Math.max(1, Math.min(10, Number(process.env.GENERATION_SUBMIT_WORKER_BATCH_SIZE || 1) || 1));
const GENERATION_SUBMIT_STALE_MS = Math.max(5 * 60 * 1000, Number(process.env.GENERATION_SUBMIT_STALE_MS || 10 * 60 * 1000) || 10 * 60 * 1000);
const GENERATION_STALE_SUBMIT_SCAN_INTERVAL_MS = Math.max(60 * 1000, Number(process.env.GENERATION_STALE_SUBMIT_SCAN_INTERVAL_MS || 60 * 1000) || 60 * 1000);
const GENERATION_STALE_SUBMIT_SCAN_TIMEOUT_MS = Math.max(10000, Number(process.env.GENERATION_STALE_SUBMIT_SCAN_TIMEOUT_MS || 30000) || 30000);
const GENERATION_STALE_SUBMIT_RECORD_TIMEOUT_MS = Math.max(10000, Number(process.env.GENERATION_STALE_SUBMIT_RECORD_TIMEOUT_MS || 30000) || 30000);
const GENERATION_ACTIVE_SCAN_INTERVAL_MS = Math.max(30 * 1000, Number(process.env.GENERATION_ACTIVE_SCAN_INTERVAL_MS || 60 * 1000) || 60 * 1000);
const GENERATION_ACTIVE_SCAN_BATCH_SIZE = Math.max(1, Math.min(20, Number(process.env.GENERATION_ACTIVE_SCAN_BATCH_SIZE || 8) || 8));
const GENERATION_ACTIVE_SCAN_MAX_AGE_MS = Math.max(30 * 60 * 1000, Number(process.env.GENERATION_ACTIVE_SCAN_MAX_AGE_MS || 24 * 60 * 60 * 1000) || 24 * 60 * 60 * 1000);
const GENERATION_POSTER_BACKFILL_INTERVAL_MS = Math.max(15000, Number(process.env.GENERATION_POSTER_BACKFILL_INTERVAL_MS || 30000) || 30000);
const GENERATION_POSTER_BACKFILL_BATCH_SIZE = Math.max(1, Math.min(10, Number(process.env.GENERATION_POSTER_BACKFILL_BATCH_SIZE || 2) || 2));
const GENERATION_POSTER_BACKFILL_MAX_ATTEMPTS = Math.max(1, Math.min(10, Number(process.env.GENERATION_POSTER_BACKFILL_MAX_ATTEMPTS || 3) || 3));
const GENERATION_POSTER_BACKFILL_RETRY_DELAY_MS = Math.max(5 * 60 * 1000, Number(process.env.GENERATION_POSTER_BACKFILL_RETRY_DELAY_MS || 30 * 60 * 1000) || 30 * 60 * 1000);

const inFlightGenerationSubmissions = new Map();
const generationSubmissionDrainWaiters = new Set();
let generationSubmissionDraining = false;

function generationSubmissionShutdownError() {
  const error = new Error("Generation submission is unavailable while the server is shutting down.");
  error.statusCode = 503;
  error.code = "GENERATION_SUBMIT_SHUTTING_DOWN";
  error.retryable = true;
  return error;
}

function beginGenerationSubmission(label, taskId) {
  if (generationSubmissionDraining) throw generationSubmissionShutdownError();
  const token = { id: `${Date.now()}-${Math.random().toString(36).slice(2)}` };
  inFlightGenerationSubmissions.set(token, {
    label: String(label || "generation-submit"),
    taskId: String(taskId || ""),
    startedAt: Date.now(),
  });
  return token;
}

function finishGenerationSubmission(token) {
  if (!token || !inFlightGenerationSubmissions.delete(token)) return;
  if (!inFlightGenerationSubmissions.size) {
    for (const resolve of generationSubmissionDrainWaiters) resolve();
    generationSubmissionDrainWaiters.clear();
  }
}

function startTrackedGenerationJob(label, taskId, runner, onUnexpectedError) {
  /* Reserve before scheduling. A SIGTERM between the database/charge write and
     setImmediate must still wait for the runner instead of rejecting it. */
  const submission = beginGenerationSubmission(label, taskId);
  setImmediate(() => {
    Promise.resolve()
      .then(() => runner(submission))
      .catch(async (error) => {
        try {
          await onUnexpectedError?.(error);
        } catch (handlerError) {
          console.error("[generation-job-error-handler-failed]", label, taskId, handlerError.stack || handlerError.message || handlerError);
        }
      })
      .finally(() => finishGenerationSubmission(submission));
  });
  return submission;
}

function beginGenerationSubmissionDrain() {
  generationSubmissionDraining = true;
  return inFlightGenerationSubmissions.size;
}

async function waitForGenerationSubmissionsToDrain(timeoutMs = GENERATION_SUBMIT_DRAIN_TIMEOUT_MS) {
  const startedAt = Date.now();
  if (!inFlightGenerationSubmissions.size) return { drained: true, pending: 0, elapsedMs: 0 };
  let timer;
  let resolveDrained;
  const drainedPromise = new Promise((resolve) => {
    resolveDrained = resolve;
    generationSubmissionDrainWaiters.add(resolve);
  });
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(false), Math.max(0, Number(timeoutMs) || 0));
    timer.unref?.();
  });
  const drained = await Promise.race([drainedPromise.then(() => true), timeout]);
  clearTimeout(timer);
  generationSubmissionDrainWaiters.delete(resolveDrained);
  return {
    drained,
    pending: inFlightGenerationSubmissions.size,
    elapsedMs: Date.now() - startedAt,
  };
}
const GENERATION_MEDIA_PERSISTENCE_INTERVAL_MS = Math.max(60 * 1000, Number(process.env.GENERATION_MEDIA_PERSISTENCE_INTERVAL_MS || 2 * 60 * 1000) || 2 * 60 * 1000);
const GENERATION_MEDIA_PERSISTENCE_BATCH_SIZE = Math.max(1, Math.min(10, Number(process.env.GENERATION_MEDIA_PERSISTENCE_BATCH_SIZE || 2) || 2));
const GENERATION_MEDIA_PERSISTENCE_MAX_ATTEMPTS = Math.max(1, Math.min(10, Number(process.env.GENERATION_MEDIA_PERSISTENCE_MAX_ATTEMPTS || 3) || 3));
const GENERATION_MEDIA_PERSISTENCE_RETRY_DELAY_MS = Math.max(5 * 60 * 1000, Number(process.env.GENERATION_MEDIA_PERSISTENCE_RETRY_DELAY_MS || 30 * 60 * 1000) || 30 * 60 * 1000);
const GENERATION_MEDIA_PERSISTENCE_MAX_AGE_MS = Math.max(60 * 60 * 1000, Number(process.env.GENERATION_MEDIA_PERSISTENCE_MAX_AGE_MS || 24 * 60 * 60 * 1000) || 24 * 60 * 60 * 1000);
const apizPricingCache = new Map();
let apizModelListPricingCache = { expiresAt: 0, values: new Map() };
const DEFAULT_CREDITS_PER_USD = clampNumber(process.env.CREDITS_PER_USD || process.env.CREDITS_PER_USDT, 100, 0.0001, 100000);
const INTERNAL_CNY_PER_USD = clampNumber(process.env.INTERNAL_CNY_PER_USD || process.env.UPSTREAM_CNY_PER_USD || process.env.USD_CNY_RATE, 5, 0.0001, 100000);
const DEFAULT_USDT_CNY_CENTS = clampNumber(process.env.USDT_CNY_CENTS || process.env.CNY_CENTS_PER_USDT, INTERNAL_CNY_PER_USD * 100, 1, 100000);
const UPSTREAM_USD_CNY_RATE = clampNumber(process.env.UPSTREAM_USD_CNY_RATE || process.env.SEEDANCE_USD_CNY_RATE || process.env.USD_CNY_RATE, INTERNAL_CNY_PER_USD, 0.0001, 100000);
const PAYPAL_ENV = /sandbox/i.test(process.env.PAYPAL_ENV || process.env.PAYPAL_MODE || "") ? "sandbox" : "live";
const PAYPAL_ENABLED = /^(1|true|yes|on)$/i.test(String(process.env.PAYPAL_ENABLED || ""));
const PAYPAL_CLIENT_ID = String(process.env.PAYPAL_CLIENT_ID || "").trim();
const PAYPAL_CLIENT_SECRET = String(process.env.PAYPAL_CLIENT_SECRET || "").trim();
const PAYPAL_WEBHOOK_ID = String(process.env.PAYPAL_WEBHOOK_ID || "").trim();
const PAYPAL_CURRENCY = String(process.env.PAYPAL_CURRENCY || "USD").trim().toUpperCase() || "USD";
const PAYPAL_BRAND_NAME = String(process.env.PAYPAL_BRAND_NAME || "Vipeak AI").trim() || "Vipeak AI";
const PAYPAL_CHECKOUT_BASE_URL = String(
  process.env.PAYPAL_CHECKOUT_BASE_URL ||
  process.env.PAYMENT_BASE_URL ||
  "https://pay.seed2.io",
).trim().replace(/\/+$/, "");
const PAYPAL_CHECKOUT_SESSION_TTL_MS = Math.max(
  15 * 60 * 1000,
  Number(process.env.PAYPAL_CHECKOUT_SESSION_TTL_MS || 2 * 60 * 60 * 1000) || 2 * 60 * 60 * 1000,
);
const MIN_TOPUP_AMOUNT = clampNumber(process.env.MIN_TOPUP_AMOUNT, 1, 1, 100000);
const PAYPAL_MIN_AMOUNT = clampNumber(process.env.PAYPAL_MIN_AMOUNT, MIN_TOPUP_AMOUNT, 0.01, 100000);
const PAYPAL_MAX_AMOUNT = clampNumber(process.env.PAYPAL_MAX_AMOUNT, 10000, PAYPAL_MIN_AMOUNT, 1000000);
const TOPUP_PACKAGES = Object.freeze([
  Object.freeze({ id: "usd-20", amount: 20, credits: 2100, bonusPercent: 5 }),
  Object.freeze({ id: "usd-30", amount: 30, credits: 3300, bonusPercent: 10 }),
  Object.freeze({ id: "usd-50", amount: 50, credits: 5750, bonusPercent: 15 }),
  Object.freeze({ id: "usd-100", amount: 100, credits: 12000, bonusPercent: 20 }),
  Object.freeze({ id: "usd-200", amount: 200, credits: 24000, bonusPercent: 20 }),
  Object.freeze({ id: "usd-500", amount: 500, credits: 60000, bonusPercent: 20 }),
]);
const PAYPAL_CNY_CENTS_PER_UNIT_ENV =
  process.env.PAYPAL_CNY_CENTS_PER_UNIT ||
  process.env.PAYPAL_USD_CNY_CENTS ||
  process.env.USD_CNY_CENTS ||
  "";
let paypalTokenCache = { accessToken: "", expiresAt: 0 };
const STRIPE_SECRET_KEY = String(process.env.STRIPE_SECRET_KEY || "").trim();
const STRIPE_WEBHOOK_SECRET = String(process.env.STRIPE_WEBHOOK_SECRET || "").trim();
const STRIPE_PAY5_SECRET_KEY = String(process.env.STRIPE_PAY5_SECRET_KEY || "").trim();
const STRIPE_PAY5_WEBHOOK_SECRET = String(process.env.STRIPE_PAY5_WEBHOOK_SECRET || "").trim();
const STRIPE_PAY5_ACCOUNT_ID = String(process.env.STRIPE_PAY5_ACCOUNT_ID || "").trim();
const STRIPE_CURRENCY = String(process.env.STRIPE_CURRENCY || "usd").trim().toLowerCase() || "usd";
const STRIPE_CHECKOUT_SESSION_TTL_SECONDS = Math.max(300, Math.min(86400, Number(process.env.STRIPE_CHECKOUT_SESSION_TTL_SECONDS || 1800) || 1800));
const STRIPE_CHECKOUT_BASE_URL = String(
  process.env.STRIPE_CHECKOUT_BASE_URL ||
  "https://pay.storycut.club",
).trim().replace(/\/+$/, "");
const STRIPE_CHAT_CHECKOUT_BASE_URL = String(
  process.env.STRIPE_CHAT_CHECKOUT_BASE_URL ||
  "https://pay.5vips.com",
).trim().replace(/\/+$/, "");
const AIRWALLEX_CLIENT_ID = String(process.env.AIRWALLEX_CLIENT_ID || "").trim();
const AIRWALLEX_API_KEY = String(process.env.AIRWALLEX_API_KEY || "").trim();
const AIRWALLEX_ACCOUNT_ID = String(process.env.AIRWALLEX_ACCOUNT_ID || "").trim();
const AIRWALLEX_WEBHOOK_SECRET = String(process.env.AIRWALLEX_WEBHOOK_SECRET || "").trim();
const AIRWALLEX_ENV = String(process.env.AIRWALLEX_ENV || "prod").trim().toLowerCase() === "demo" ? "demo" : "prod";
const AIRWALLEX_API_BASE = AIRWALLEX_ENV === "demo" ? "https://api-demo.airwallex.com" : "https://api.airwallex.com";
const AIRWALLEX_CHECKOUT_BASE_URL = String(process.env.AIRWALLEX_CHECKOUT_BASE_URL || "https://pay.storycut.club").trim().replace(/\/+$/, "");
const LIVE_BILLING_RETURN_ORIGIN = "https://live.123vipeak.com";
let airwallexTokenCache = { token: "", expiresAt: 0 };

const WALLET_CHAIN_SCAN_ENABLED = !/^(0|false|no|off)$/i.test(String(process.env.WALLET_CHAIN_SCAN_ENABLED || "1"));
const WALLET_CHAIN_SCAN_INTERVAL_MS = Math.max(15000, Number(process.env.WALLET_CHAIN_SCAN_INTERVAL_MS || 60000) || 60000);
const WALLET_CHAIN_SCAN_ORDER_TTL_HOURS = Math.max(0.5, Math.min(24, Number(process.env.WALLET_CHAIN_SCAN_ORDER_TTL_HOURS || 1) || 1));
const WALLET_CHAIN_SCAN_LOOKBACK_LIMIT = Math.max(20, Math.min(500, Number(process.env.WALLET_CHAIN_SCAN_LOOKBACK_LIMIT || 120) || 120));
const WALLET_EVM_SCAN_BLOCK_LOOKBACK = Math.max(1000, Number(process.env.WALLET_EVM_SCAN_BLOCK_LOOKBACK || 140000) || 140000);
const WALLET_EVM_SCAN_CHUNK_SIZE = Math.max(50, Math.min(5000, Number(process.env.WALLET_EVM_SCAN_CHUNK_SIZE || 1000) || 1000));
const WALLET_EVM_SCAN_CURSOR_OVERLAP_BLOCKS = Math.max(20, Number(process.env.WALLET_EVM_SCAN_CURSOR_OVERLAP_BLOCKS || 200) || 200);
const WALLET_EVM_CONFIRMATIONS = Math.max(1, Number(process.env.WALLET_EVM_CONFIRMATIONS || 12) || 12);
const WALLET_SOLANA_CONFIRMATIONS = Math.max(1, Number(process.env.WALLET_SOLANA_CONFIRMATIONS || 32) || 32);
const WALLET_TRON_CONFIRMATIONS = Math.max(1, Number(process.env.WALLET_TRON_CONFIRMATIONS || 1) || 1);
const ETHERSCAN_API_KEY = String(process.env.ETHERSCAN_API_KEY || process.env.ETHERSCAN_V2_API_KEY || "").trim();
const BSCSCAN_API_KEY = String(process.env.BSCSCAN_API_KEY || process.env.BSC_SCAN_API_KEY || "").trim();
const BASESCAN_API_KEY = String(process.env.BASESCAN_API_KEY || process.env.BASE_SCAN_API_KEY || "").trim();
const SOLANA_RPC_URL = String(process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com").trim();
const TRONGRID_API_KEY = String(process.env.TRONGRID_API_KEY || process.env.TRON_GRID_API_KEY || "").trim();
const WALLET_USDT_CONTRACTS = {
  ethereum: String(process.env.WALLET_ETHEREUM_USDT_CONTRACT || "0xdAC17F958D2ee523a2206206994597C13D831ec7").trim(),
  bnb: String(process.env.WALLET_BNB_USDT_CONTRACT || "0x55d398326f99059fF775485246999027B3197955").trim(),
  base: String(process.env.WALLET_BASE_USDT_CONTRACT || "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2").trim(),
  tron: String(process.env.WALLET_TRON_USDT_CONTRACT || "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t").trim(),
  solana: String(process.env.WALLET_SOLANA_USDT_MINT || "Es9vMFrzaCERmJfrF4H2FYD4Sz7PZsrwLQomDpRg4E6B").trim(),
};
const WALLET_EVM_RPC_URLS = {
  ethereum: String(process.env.WALLET_ETHEREUM_RPC_URL || process.env.ETHEREUM_RPC_URL || "https://ethereum-rpc.publicnode.com,https://eth.drpc.org").split(",").map((url) => url.trim()).filter(Boolean),
  bnb: String(process.env.WALLET_BNB_RPC_URL || process.env.BNB_RPC_URL || "https://bsc.meowrpc.com,https://bsc-rpc.publicnode.com,https://bsc-dataseed.binance.org").split(",").map((url) => url.trim()).filter(Boolean),
  base: String(process.env.WALLET_BASE_RPC_URL || process.env.BASE_RPC_URL || "https://mainnet.base.org,https://base-rpc.publicnode.com").split(",").map((url) => url.trim()).filter(Boolean),
};
const GENERATION_PRICE_MARKUP = 1.2;
const ADVANCED_SEEDANCE_FPS = clampNumber(process.env.ADVANCED_SEEDANCE_FPS, 24, 1, 120);
const ADVANCED_SEEDANCE_720P_USD_PER_MILLION_TOKENS = clampNumber(process.env.ADVANCED_SEEDANCE_720P_USD_PER_MILLION_TOKENS, 7, 0.0001, 100000);
const ADVANCED_SEEDANCE_1080P_USD_PER_MILLION_TOKENS = clampNumber(process.env.ADVANCED_SEEDANCE_1080P_USD_PER_MILLION_TOKENS, 7.7, 0.0001, 100000);
const ADVANCED_SEEDANCE_4K_USD_PER_MILLION_TOKENS = clampNumber(process.env.ADVANCED_SEEDANCE_4K_USD_PER_MILLION_TOKENS, 4, 0.0001, 100000);
const ADVANCED_SEEDANCE_VIDEO_INPUT_720P_USD_PER_MILLION_TOKENS = clampNumber(process.env.ADVANCED_SEEDANCE_VIDEO_INPUT_720P_USD_PER_MILLION_TOKENS, 4.3, 0.0001, 100000);
const ADVANCED_SEEDANCE_VIDEO_INPUT_1080P_USD_PER_MILLION_TOKENS = clampNumber(process.env.ADVANCED_SEEDANCE_VIDEO_INPUT_1080P_USD_PER_MILLION_TOKENS, 4.7, 0.0001, 100000);
const ADVANCED_SEEDANCE_VIDEO_INPUT_4K_USD_PER_MILLION_TOKENS = clampNumber(process.env.ADVANCED_SEEDANCE_VIDEO_INPUT_4K_USD_PER_MILLION_TOKENS, 2.4, 0.0001, 100000);
const ADVANCED_SEEDANCE_FAST_USD_PER_MILLION_TOKENS = clampNumber(process.env.ADVANCED_SEEDANCE_FAST_USD_PER_MILLION_TOKENS, 5.6, 0.0001, 100000);
const ADVANCED_SEEDANCE_FAST_VIDEO_INPUT_USD_PER_MILLION_TOKENS = clampNumber(process.env.ADVANCED_SEEDANCE_FAST_VIDEO_INPUT_USD_PER_MILLION_TOKENS, 3.3, 0.0001, 100000);
const ADVANCED_SEEDANCE_EXAMPLE_USD_BY_RESOLUTION = {
  "480p": clampNumber(process.env.ADVANCED_SEEDANCE_480P_EXAMPLE_USD_PER_5S, 0.35, 0.0001, 100000),
  "720p": clampNumber(process.env.ADVANCED_SEEDANCE_720P_EXAMPLE_USD_PER_5S, 0.76, 0.0001, 100000),
  "1080p": clampNumber(process.env.ADVANCED_SEEDANCE_1080P_EXAMPLE_USD_PER_5S, 1.87, 0.0001, 100000),
  "4k": clampNumber(process.env.ADVANCED_SEEDANCE_4K_EXAMPLE_USD_PER_5S, 3.89, 0.0001, 100000),
};
const ADVANCED_SEEDANCE_VIDEO_INPUT_EXAMPLE_USD_RANGE_BY_RESOLUTION = {
  "480p": [
    clampNumber(process.env.ADVANCED_SEEDANCE_VIDEO_INPUT_480P_MIN_EXAMPLE_USD_PER_5S, 0.39, 0.0001, 100000),
    clampNumber(process.env.ADVANCED_SEEDANCE_VIDEO_INPUT_480P_MAX_EXAMPLE_USD_PER_5S, 0.86, 0.0001, 100000),
  ],
  "720p": [
    clampNumber(process.env.ADVANCED_SEEDANCE_VIDEO_INPUT_720P_MIN_EXAMPLE_USD_PER_5S, 0.84, 0.0001, 100000),
    clampNumber(process.env.ADVANCED_SEEDANCE_VIDEO_INPUT_720P_MAX_EXAMPLE_USD_PER_5S, 1.86, 0.0001, 100000),
  ],
  "1080p": [
    clampNumber(process.env.ADVANCED_SEEDANCE_VIDEO_INPUT_1080P_MIN_EXAMPLE_USD_PER_5S, 2.06, 0.0001, 100000),
    clampNumber(process.env.ADVANCED_SEEDANCE_VIDEO_INPUT_1080P_MAX_EXAMPLE_USD_PER_5S, 4.57, 0.0001, 100000),
  ],
  "4k": [
    clampNumber(process.env.ADVANCED_SEEDANCE_VIDEO_INPUT_4K_MIN_EXAMPLE_USD_PER_5S, 4.2, 0.0001, 100000),
    clampNumber(process.env.ADVANCED_SEEDANCE_VIDEO_INPUT_4K_MAX_EXAMPLE_USD_PER_5S, 9.33, 0.0001, 100000),
  ],
};
const ADVANCED_CREDITS_PER_CNY = pricingNumber(DEFAULT_CREDITS_PER_USD / INTERNAL_CNY_PER_USD, 20, 0.0001, 6);
const ADVANCED_SEEDANCE_720P_CREDITS_PER_SECOND = 30;
const ADVANCED_SEEDANCE_1080P_CREDITS_PER_SECOND = 60;
const ADVANCED_SEEDANCE_4K_CREDITS_PER_SECOND = 120;
const ADVANCED_SEEDANCE_VIDEO_INPUT_720P_CREDITS_PER_SECOND = 20;
const ADVANCED_SEEDANCE_VIDEO_INPUT_1080P_CREDITS_PER_SECOND = 40;
const ADVANCED_SEEDANCE_VIDEO_INPUT_4K_CREDITS_PER_SECOND = 80;
// BytePlus Fast: $5.6/M output tokens and $3.3/M input-video tokens at 24fps.
// These defaults sell at exactly 1.5x the upstream token cost.
const ADVANCED_SEEDANCE_FAST_480P_CREDITS_PER_SECOND = 8.1648;
const ADVANCED_SEEDANCE_FAST_720P_CREDITS_PER_SECOND = 17.29728;
const ADVANCED_SEEDANCE_FAST_VIDEO_INPUT_480P_CREDITS_PER_SECOND = 4.8114;
const ADVANCED_SEEDANCE_FAST_VIDEO_INPUT_720P_CREDITS_PER_SECOND = 10.19304;
const ADVANCED_WAN27_720P_CREDITS_PER_SECOND = 100;
const ADVANCED_WAN27_1080P_CREDITS_PER_SECOND = 250;
const ALIYUN_VIDEO_DEFAULT_MARKUP = 1.5;
const ALIYUN_WAN30_CNY_PER_USD = pricingNumber(process.env.ALIYUN_WAN30_CNY_PER_USD, 6.67, 0.0001, 6);
const ALIYUN_WAN30_OFFICIAL_CNY_PER_SECOND = Object.freeze({
  "480p": 0.3,
  "720p": 0.6,
  "1080p": 1.2,
  "2k": 2.4,
  "4k": 4.8,
});
const ALIYUN_WAN30_PRIME_PRICE_FACTOR = pricingNumber(process.env.ALIYUN_WAN30_PRIME_PRICE_FACTOR, 1.5, 1, 6);
const WAN30_PURCHASE_USD_PER_SECOND_BY_CAPABILITY = Object.freeze({
  "wan30-video": Object.freeze(Object.fromEntries(["480p", "720p", "1080p"].map((resolution) => [
    resolution,
    pricingNumber(ALIYUN_WAN30_OFFICIAL_CNY_PER_SECOND[resolution] / ALIYUN_WAN30_CNY_PER_USD, 0, 0, 8),
  ]))),
  "wan30-video-pro": Object.freeze(Object.fromEntries(["1080p", "2k", "4k"].map((resolution) => [
    resolution,
    pricingNumber(ALIYUN_WAN30_OFFICIAL_CNY_PER_SECOND[resolution] / ALIYUN_WAN30_CNY_PER_USD, 0, 0, 8),
  ]))),
  "wan30-video-prime": Object.freeze(Object.fromEntries(["480p", "720p", "1080p"].map((resolution) => [
    resolution,
    pricingNumber((ALIYUN_WAN30_OFFICIAL_CNY_PER_SECOND[resolution] * ALIYUN_WAN30_PRIME_PRICE_FACTOR) / ALIYUN_WAN30_CNY_PER_USD, 0, 0, 8),
  ]))),
  "wan30-video-prime-pro": Object.freeze(Object.fromEntries(["1080p", "2k", "4k"].map((resolution) => [
    resolution,
    pricingNumber((ALIYUN_WAN30_OFFICIAL_CNY_PER_SECOND[resolution] * ALIYUN_WAN30_PRIME_PRICE_FACTOR) / ALIYUN_WAN30_CNY_PER_USD, 0, 0, 8),
  ]))),
});
const WAN30_DEFAULT_SALE_CREDITS_PER_SECOND = Object.freeze({
  "wan30-video": Object.freeze({ "480p": 7, "720p": 15, "1080p": 30 }),
  "wan30-video-pro": Object.freeze({ "1080p": 26.986507, "2k": 53.973014, "4k": 107.946028 }),
  "wan30-video-prime": Object.freeze({ "480p": 10, "720p": 20, "1080p": 38 }),
  "wan30-video-prime-pro": Object.freeze({ "1080p": 40.479761, "2k": 80.959521, "4k": 161.919042 }),
});
const WAN27_IMAGE_PRO_MODEL = process.env.ALIYUN_WAN27_IMAGE_PRO_MODEL || "wan2.7-image-pro";
const WAN27_IMAGE_PRO_PURCHASE_USD = pricingNumber(process.env.ALIYUN_WAN27_IMAGE_PRO_PURCHASE_USD, 0.075, 0, 6);
const WAN27_IMAGE_PRO_PURCHASE_CNY = pricingNumber(process.env.ALIYUN_WAN27_IMAGE_PRO_PURCHASE_CNY, WAN27_IMAGE_PRO_PURCHASE_USD * INTERNAL_CNY_PER_USD, 0, 6);
const WAN27_IMAGE_PRO_MARKUP = pricingNumber(process.env.ALIYUN_WAN27_IMAGE_PRO_MARKUP, 1.5, 1);
const WAN27_IMAGE_PRO_SALE_CNY = pricingNumber(process.env.ALIYUN_WAN27_IMAGE_PRO_SALE_CNY, WAN27_IMAGE_PRO_PURCHASE_CNY * WAN27_IMAGE_PRO_MARKUP, 0, 6);
const SEEDREAM5_LITE_USD_PER_IMAGE = pricingNumber(process.env.SEEDREAM5_LITE_USD_PER_IMAGE, 0.035, 0, 6);
const SEEDREAM5_PRO_1K_USD_PER_IMAGE = pricingNumber(process.env.SEEDREAM5_PRO_1K_USD_PER_IMAGE, 0.045, 0, 6);
const SEEDREAM5_PRO_2K_USD_PER_IMAGE = pricingNumber(process.env.SEEDREAM5_PRO_2K_USD_PER_IMAGE, 0.09, 0, 6);
const SEEDREAM5_PRO_REFERENCE_USD_PER_IMAGE_AFTER_FIRST = pricingNumber(process.env.SEEDREAM5_PRO_REFERENCE_USD_PER_IMAGE_AFTER_FIRST, 0.003, 0, 6);
const SEEDREAM_QWEN_IMAGE_SALE_MARKUP = 1.5;

function defaultAliyunSaleCredits(capability, options = {}, fallback = ADVANCED_WAN27_720P_CREDITS_PER_SECOND) {
  const purchase = officialSingaporePurchaseDetails(capability, options);
  return purchase
    ? pricingNumber(purchase.usdPerSecond * DEFAULT_CREDITS_PER_USD * ALIYUN_VIDEO_DEFAULT_MARKUP, fallback)
    : fallback;
}

function wan30PurchaseUsdPerSecond(resolution = "1080p") {
  const normalized = normalizeAdvancedResolution(resolution);
  const cnyPerSecond = ALIYUN_WAN30_OFFICIAL_CNY_PER_SECOND[normalized] ?? ALIYUN_WAN30_OFFICIAL_CNY_PER_SECOND["1080p"];
  return pricingNumber(cnyPerSecond / ALIYUN_WAN30_CNY_PER_USD, 0, 0, 8);
}

function defaultWan30SaleCreditsPerSecond(resolution = "1080p") {
  const normalized = normalizeAdvancedResolution(resolution);
  const cnyPerSecond = ALIYUN_WAN30_OFFICIAL_CNY_PER_SECOND[normalized] ?? ALIYUN_WAN30_OFFICIAL_CNY_PER_SECOND["1080p"];
  return pricingNumber(
    (cnyPerSecond / ALIYUN_WAN30_CNY_PER_USD) * DEFAULT_CREDITS_PER_USD * ALIYUN_VIDEO_DEFAULT_MARKUP,
    0,
    0,
    6,
  );
}

function defaultSeedance25DirectSaleCreditsPerSecond(resolution = "480p", { hasVideoInput = false } = {}) {
  return pricingNumber(
    directPurchaseUsdPerSecond(resolution, { hasVideoInput }) * DEFAULT_CREDITS_PER_USD * ALIYUN_VIDEO_DEFAULT_MARKUP,
    0,
    0,
    6,
  );
}

function defaultAliyunLegacySaleCreditsByModel() {
  return Object.fromEntries(Object.entries(ALIYUN_VIDEO_OFFICIAL_LEGACY_PRICING).map(([model, rates]) => [
    model,
    Object.fromEntries(Object.keys(rates).map((rateKey) => [
      rateKey.toLowerCase(),
      defaultAliyunSaleCredits("wan-legacy", {
        model,
        resolution: rateKey.split("-")[0],
        audio: !rateKey.endsWith("-silent"),
      }),
    ])),
  ]));
}

const QWEN37_FLASH_MODEL = String(process.env.ALIYUN_QWEN37_MODEL || "qwen3.7-flash").trim() || "qwen3.7-flash";
const BYTEPLUS_LANGUAGE_MODEL = String(process.env.BYTEPLUS_LANGUAGE_MODEL || "ep-20260827122554-8fsgw").trim() || "ep-20260827122554-8fsgw";
const PAPAYA_MODEL = "carrothub-papaya-1.0";
const CHAT_MESSAGE_CREDITS = creditsAmount(process.env.CHAT_MESSAGE_CREDITS || 0.5);
const QWEN37_FLASH_MAX_OUTPUT_TOKENS = Math.floor(clampNumber(process.env.QWEN37_FLASH_MAX_OUTPUT_TOKENS, 8192, 1, 32768));
const QWEN37_FLASH_SINGAPORE_CNY_PER_MILLION_TOKENS = Object.freeze([
  Object.freeze({ maxInputTokens: 32768, input: 0.225, output: 0.974 }),
  Object.freeze({ maxInputTokens: 262144, input: 0.749, output: 2.998 }),
  Object.freeze({ maxInputTokens: 1000000, input: 1.499, output: 5.995 }),
]);

const SEEDANCE25_DEFAULT_SALE_MARKUP = 1.1;
function seedance25SaleSiteCreditsPerSecond(resolution = "480p") {
  return pricingNumber(
    seedance25PurchaseSiteCreditsPerSecond(resolution) * SEEDANCE25_DEFAULT_SALE_MARKUP,
    0,
    0,
    6,
  );
}

const DEFAULT_ADVANCED_PRICING = {
  unit: "credits",
  creditsPerCny: ADVANCED_CREDITS_PER_CNY,
  seedance25CreditsPerSecondByResolution: {
    "480p": seedance25SaleSiteCreditsPerSecond("480p"),
    "720p": seedance25SaleSiteCreditsPerSecond("720p"),
  },
  h3VegaCreditsPerSecondByResolution: {
    "480p": 6.75,
    "720p": 13.5,
    "1080p": 27,
    "2k": 32.4,
    "4k": 38.88,
  },
  h3VegaInputVideoCreditsPerSecondByResolution: {
    "480p": 6.75,
    "720p": 13.5,
    "1080p": 27,
    "2k": 27,
    "4k": 27,
  },
  h3VegaPurchaseUsdPerSecondByResolution: {
    "480p": 0.045,
    "720p": 0.09,
    "1080p": 0.18,
    "2k": 0.216,
    "4k": 0.2592,
  },
  h3VegaInputVideoPurchaseUsdPerSecondByResolution: {
    "480p": 0.045,
    "720p": 0.09,
    "1080p": 0.18,
    "2k": 0.18,
    "4k": 0.18,
  },
  vega10LiteCreditsPerSecondByResolution: {
    "480p": 6.855,
    "768p": 8.655,
    "1080p": 11.535,
    "2k": 14.43,
    "4k": 17.31,
  },
  vega10LiteInputVideoCreditsPerSecondByResolution: {
    "480p": 6.855,
    "768p": 8.655,
    "1080p": 11.535,
    "2k": 14.43,
    "4k": 17.31,
  },
  vega10LitePurchaseUsdPerSecondByResolution: {
    "480p": 0.0457,
    "768p": 0.0577,
    "1080p": 0.0769,
    "2k": 0.0962,
    "4k": 0.1154,
  },
  vega10LiteInputVideoPurchaseUsdPerSecondByResolution: {
    "480p": 0.0457,
    "768p": 0.0577,
    "1080p": 0.0769,
    "2k": 0.0962,
    "4k": 0.1154,
  },
  vega10LiteReferenceImageCreditsEach: 4.5,
  vega10LiteReferenceImagePurchaseUsdEach: 0.03,
  // Tencent VOD international list price x CREDITS_PER_USD (100) x 1.5 markup.
  // Vega 1.0 Pro has separate no-reference and reference-video output rates.
  vega10ProCreditsPerSecondByResolution: {
    "480p": 9.6,
    "720p": 18.345,
    "1080p": 39.93,
    "2k": 99.225,
    "4k": 113.07,
  },
  vega10ProInputVideoCreditsPerSecondByResolution: {
    "480p": 6.03,
    "720p": 11.535,
    "1080p": 24.93,
    "2k": 61.62,
    "4k": 69.225,
  },
  vega10ProPurchaseUsdPerSecondByResolution: {
    "480p": 0.064,
    "720p": 0.1223,
    "1080p": 0.2662,
    "2k": 0.6615,
    "4k": 0.7538,
  },
  vega10ProInputVideoPurchaseUsdPerSecondByResolution: {
    "480p": 0.0402,
    "720p": 0.0769,
    "1080p": 0.1662,
    "2k": 0.4108,
    "4k": 0.4615,
  },
  // Vega 1.5 Pro uses the same reference-video billing shape: input and
  // output are both charged at the reference-video rate.
  vega15ProCreditsPerSecondByResolution: {
    "480p": 13.98,
    "720p": 27.42,
    "1080p": 59.685,
    "2k": 147,
    "4k": 161.7,
  },
  vega15ProInputVideoCreditsPerSecondByResolution: {
    "480p": 8.385,
    "720p": 17.07,
    "1080p": 36.465,
    "2k": 89.07,
    "4k": 97.98,
  },
  vega15ProPurchaseUsdPerSecondByResolution: {
    "480p": 0.0932,
    "720p": 0.1828,
    "1080p": 0.3979,
    "2k": 0.98,
    "4k": 1.078,
  },
  vega15ProInputVideoPurchaseUsdPerSecondByResolution: {
    "480p": 0.0559,
    "720p": 0.1138,
    "1080p": 0.2431,
    "2k": 0.5938,
    "4k": 0.6532,
  },
  seedanceNsfwCreditsPerSecondByResolution: {
    "480p": defaultSeedance25DirectSaleCreditsPerSecond("480p"),
    "720p": defaultSeedance25DirectSaleCreditsPerSecond("720p"),
  },
  seedanceNsfwVideoCreditsPerSecondByResolution: {
    "480p": defaultSeedance25DirectSaleCreditsPerSecond("480p", { hasVideoInput: true }),
    "720p": defaultSeedance25DirectSaleCreditsPerSecond("720p", { hasVideoInput: true }),
  },
  seedanceCreditsPerSecondByResolution: {
    "480p": Math.ceil(ADVANCED_SEEDANCE_720P_CREDITS_PER_SECOND * 0.5),
    "720p": ADVANCED_SEEDANCE_720P_CREDITS_PER_SECOND,
    "1080p": ADVANCED_SEEDANCE_1080P_CREDITS_PER_SECOND,
    "4k": ADVANCED_SEEDANCE_4K_CREDITS_PER_SECOND,
  },
  seedanceVideoInputCreditsPerSecondByResolution: {
    "480p": Math.ceil(ADVANCED_SEEDANCE_VIDEO_INPUT_720P_CREDITS_PER_SECOND * 0.5),
    "720p": ADVANCED_SEEDANCE_VIDEO_INPUT_720P_CREDITS_PER_SECOND,
    "1080p": ADVANCED_SEEDANCE_VIDEO_INPUT_1080P_CREDITS_PER_SECOND,
    "4k": ADVANCED_SEEDANCE_VIDEO_INPUT_4K_CREDITS_PER_SECOND,
  },
  seedanceFastCreditsPerSecondByResolution: {
    "480p": ADVANCED_SEEDANCE_FAST_480P_CREDITS_PER_SECOND,
    "720p": ADVANCED_SEEDANCE_FAST_720P_CREDITS_PER_SECOND,
  },
  seedanceFastVideoInputCreditsPerSecondByResolution: {
    "480p": ADVANCED_SEEDANCE_FAST_VIDEO_INPUT_480P_CREDITS_PER_SECOND,
    "720p": ADVANCED_SEEDANCE_FAST_VIDEO_INPUT_720P_CREDITS_PER_SECOND,
  },
  wan30CreditsPerSecondByResolution: { ...WAN30_DEFAULT_SALE_CREDITS_PER_SECOND["wan30-video"] },
  wan30PrimeCreditsPerSecondByResolution: { ...WAN30_DEFAULT_SALE_CREDITS_PER_SECOND["wan30-video-prime"] },
  wan30ProCreditsPerSecondByResolution: { ...WAN30_DEFAULT_SALE_CREDITS_PER_SECOND["wan30-video-pro"] },
  wan30PrimeProCreditsPerSecondByResolution: { ...WAN30_DEFAULT_SALE_CREDITS_PER_SECOND["wan30-video-prime-pro"] },
  wan30PurchaseUsdPerSecondByResolution: { ...WAN30_PURCHASE_USD_PER_SECOND_BY_CAPABILITY["wan30-video"] },
  wan30PrimePurchaseUsdPerSecondByResolution: { ...WAN30_PURCHASE_USD_PER_SECOND_BY_CAPABILITY["wan30-video-prime"] },
  wan30ProPurchaseUsdPerSecondByResolution: { ...WAN30_PURCHASE_USD_PER_SECOND_BY_CAPABILITY["wan30-video-pro"] },
  wan30PrimeProPurchaseUsdPerSecondByResolution: { ...WAN30_PURCHASE_USD_PER_SECOND_BY_CAPABILITY["wan30-video-prime-pro"] },
  wan27CreditsPerSecondByResolution: {
    "720p": ADVANCED_WAN27_720P_CREDITS_PER_SECOND,
    "1080p": ADVANCED_WAN27_1080P_CREDITS_PER_SECOND,
  },
  happyhorseCreditsPerSecondByResolution: {
    "720p": Math.max(
      defaultAliyunSaleCredits("happyhorse-t2v", { resolution: "720p" }),
      defaultAliyunSaleCredits("happyhorse-i2v", { resolution: "720p" }),
      defaultAliyunSaleCredits("happyhorse-r2v", { resolution: "720p" }),
      defaultAliyunSaleCredits("happyhorse-video-edit", { resolution: "720p" }),
    ),
    "1080p": Math.max(
      defaultAliyunSaleCredits("happyhorse-t2v", { resolution: "1080p" }, ADVANCED_WAN27_1080P_CREDITS_PER_SECOND),
      defaultAliyunSaleCredits("happyhorse-i2v", { resolution: "1080p" }, ADVANCED_WAN27_1080P_CREDITS_PER_SECOND),
      defaultAliyunSaleCredits("happyhorse-r2v", { resolution: "1080p" }, ADVANCED_WAN27_1080P_CREDITS_PER_SECOND),
      defaultAliyunSaleCredits("happyhorse-video-edit", { resolution: "1080p" }, ADVANCED_WAN27_1080P_CREDITS_PER_SECOND),
    ),
  },
  aliyunVideoCreditsPerSecondByCapability: {
    "wan27-t2v": { "720p": ADVANCED_WAN27_720P_CREDITS_PER_SECOND, "1080p": ADVANCED_WAN27_1080P_CREDITS_PER_SECOND },
    "wan27-i2v": { "720p": ADVANCED_WAN27_720P_CREDITS_PER_SECOND, "1080p": ADVANCED_WAN27_1080P_CREDITS_PER_SECOND },
    "wan27-r2v": { "720p": ADVANCED_WAN27_720P_CREDITS_PER_SECOND, "1080p": ADVANCED_WAN27_1080P_CREDITS_PER_SECOND },
    "wan27-video-edit": { "720p": ADVANCED_WAN27_720P_CREDITS_PER_SECOND, "1080p": ADVANCED_WAN27_1080P_CREDITS_PER_SECOND },
    "wan-legacy": { "720p": ADVANCED_WAN27_720P_CREDITS_PER_SECOND, "1080p": ADVANCED_WAN27_1080P_CREDITS_PER_SECOND },
    "wan-animate-move": {
      "wan-std": defaultAliyunSaleCredits("wan-animate-move", { mode: "wan-std" }),
      "wan-pro": defaultAliyunSaleCredits("wan-animate-move", { mode: "wan-pro" }, ADVANCED_WAN27_1080P_CREDITS_PER_SECOND),
    },
    "wan-animate-mix": {
      "wan-std": defaultAliyunSaleCredits("wan-animate-mix", { mode: "wan-std" }),
      "wan-pro": defaultAliyunSaleCredits("wan-animate-mix", { mode: "wan-pro" }, ADVANCED_WAN27_1080P_CREDITS_PER_SECOND),
    },
    "happyhorse-t2v": {
      "720p": defaultAliyunSaleCredits("happyhorse-t2v", { resolution: "720p" }),
      "1080p": defaultAliyunSaleCredits("happyhorse-t2v", { resolution: "1080p" }, ADVANCED_WAN27_1080P_CREDITS_PER_SECOND),
    },
    "happyhorse-i2v": {
      "720p": defaultAliyunSaleCredits("happyhorse-i2v", { resolution: "720p" }),
      "1080p": defaultAliyunSaleCredits("happyhorse-i2v", { resolution: "1080p" }, ADVANCED_WAN27_1080P_CREDITS_PER_SECOND),
    },
    "happyhorse-r2v": {
      "720p": defaultAliyunSaleCredits("happyhorse-r2v", { resolution: "720p" }),
      "1080p": defaultAliyunSaleCredits("happyhorse-r2v", { resolution: "1080p" }, ADVANCED_WAN27_1080P_CREDITS_PER_SECOND),
    },
    "happyhorse-video-edit": {
      "720p": defaultAliyunSaleCredits("happyhorse-video-edit", { resolution: "720p" }),
      "1080p": defaultAliyunSaleCredits("happyhorse-video-edit", { resolution: "1080p" }, ADVANCED_WAN27_1080P_CREDITS_PER_SECOND),
    },
  },
  aliyunVideoCreditsPerSecondByModel: defaultAliyunLegacySaleCreditsByModel(),
  wan27ImagePro: {
    model: WAN27_IMAGE_PRO_MODEL,
    purchaseCnyPerImage: WAN27_IMAGE_PRO_PURCHASE_CNY,
    saleCnyPerImage: WAN27_IMAGE_PRO_SALE_CNY,
    resolutions: ["1K", "2K", "4K"],
    ratios: ["1:1", "3:4", "4:3", "9:16", "16:9"],
    defaultResolution: "2K",
    defaultRatio: "9:16",
  },
  zImageSpicyPro: {
    model: "z-image-spicy-pro",
    purchaseCnyPerImage: WAN27_IMAGE_PRO_PURCHASE_CNY,
    saleCnyPerImage: WAN27_IMAGE_PRO_SALE_CNY,
    resolutions: ["1K", "2K"],
    ratios: ["1:1", "3:4", "4:3", "9:16", "16:9"],
    defaultResolution: "2K",
    defaultRatio: "9:16",
  },
  qwenImageEditSpicy: {
    model: "qwen-image-edit-spicy",
    purchaseCnyPerImage: WAN27_IMAGE_PRO_PURCHASE_CNY,
    saleCnyPerImage: WAN27_IMAGE_PRO_SALE_CNY,
    resolutions: ["1K", "2K"],
    ratios: ["1:1", "3:4", "4:3", "9:16", "16:9"],
    defaultResolution: "2K",
    defaultRatio: "9:16",
  },
  seedream5Image: {
    lite: {
      model: SEEDREAM5_LITE_ENDPOINT_ID,
      purchaseUsdPerImage: SEEDREAM5_LITE_USD_PER_IMAGE,
      saleUsdPerImage: SEEDREAM5_LITE_USD_PER_IMAGE,
    },
    pro: {
      model: SEEDREAM5_PRO_ENDPOINT_ID,
      purchaseUsdPerImageByResolution: {
        "1K": SEEDREAM5_PRO_1K_USD_PER_IMAGE,
        "2K": SEEDREAM5_PRO_2K_USD_PER_IMAGE,
      },
      saleUsdPerImageByResolution: {
        "1K": pricingNumber(SEEDREAM5_PRO_1K_USD_PER_IMAGE * SEEDREAM_QWEN_IMAGE_SALE_MARKUP, SEEDREAM5_PRO_1K_USD_PER_IMAGE, 0, 6),
        "2K": pricingNumber(SEEDREAM5_PRO_2K_USD_PER_IMAGE * SEEDREAM_QWEN_IMAGE_SALE_MARKUP, SEEDREAM5_PRO_2K_USD_PER_IMAGE, 0, 6),
      },
      referenceUsdPerImageAfterFirst: pricingNumber(SEEDREAM5_PRO_REFERENCE_USD_PER_IMAGE_AFTER_FIRST * SEEDREAM_QWEN_IMAGE_SALE_MARKUP, SEEDREAM5_PRO_REFERENCE_USD_PER_IMAGE_AFTER_FIRST, 0, 6),
    },
    resolutions: ["1K", "2K"],
    defaultResolution: "2K",
    defaultTier: "pro",
  },
  qwenImage3: {
    pro: {
      model: QWEN_IMAGE3_MODELS.pro,
      purchaseUsdPerImageByResolution: { ...QWEN_IMAGE3_OFFICIAL_USD.pro.outputPerImage },
      saleUsdPerImageByResolution: {
        "1K": pricingNumber(QWEN_IMAGE3_OFFICIAL_USD.pro.outputPerImage["1K"] * SEEDREAM_QWEN_IMAGE_SALE_MARKUP, QWEN_IMAGE3_OFFICIAL_USD.pro.outputPerImage["1K"], 0, 6),
        "2K": pricingNumber(QWEN_IMAGE3_OFFICIAL_USD.pro.outputPerImage["2K"] * SEEDREAM_QWEN_IMAGE_SALE_MARKUP, QWEN_IMAGE3_OFFICIAL_USD.pro.outputPerImage["2K"], 0, 6),
      },
      purchaseUsdPerReferenceImage: QWEN_IMAGE3_OFFICIAL_USD.pro.inputPerReferenceImage,
      saleUsdPerReferenceImage: pricingNumber(QWEN_IMAGE3_OFFICIAL_USD.pro.inputPerReferenceImage * SEEDREAM_QWEN_IMAGE_SALE_MARKUP, QWEN_IMAGE3_OFFICIAL_USD.pro.inputPerReferenceImage, 0, 6),
    },
    standard: {
      model: QWEN_IMAGE3_MODELS.standard,
      purchaseUsdPerImageByResolution: { ...QWEN_IMAGE3_OFFICIAL_USD.standard.outputPerImage },
      saleUsdPerImageByResolution: {
        "1K": pricingNumber(QWEN_IMAGE3_OFFICIAL_USD.standard.outputPerImage["1K"] * SEEDREAM_QWEN_IMAGE_SALE_MARKUP, QWEN_IMAGE3_OFFICIAL_USD.standard.outputPerImage["1K"], 0, 6),
        "2K": pricingNumber(QWEN_IMAGE3_OFFICIAL_USD.standard.outputPerImage["2K"] * SEEDREAM_QWEN_IMAGE_SALE_MARKUP, QWEN_IMAGE3_OFFICIAL_USD.standard.outputPerImage["2K"], 0, 6),
      },
      purchaseUsdPerReferenceImage: QWEN_IMAGE3_OFFICIAL_USD.standard.inputPerReferenceImage,
      saleUsdPerReferenceImage: pricingNumber(QWEN_IMAGE3_OFFICIAL_USD.standard.inputPerReferenceImage * SEEDREAM_QWEN_IMAGE_SALE_MARKUP, QWEN_IMAGE3_OFFICIAL_USD.standard.inputPerReferenceImage, 0, 6),
    },
    resolutions: ["1K", "2K"],
    defaultResolution: "2K",
    defaultTier: "pro",
  },
  qwen37Flash: {
    model: QWEN37_FLASH_MODEL,
    inputCnyPerMillionTokens: QWEN37_FLASH_SINGAPORE_CNY_PER_MILLION_TOKENS[0].input,
    outputCnyPerMillionTokens: QWEN37_FLASH_SINGAPORE_CNY_PER_MILLION_TOKENS[0].output,
    defaultMaxTokens: 8192,
    defaultTemperature: 0.7,
    defaultThinking: false,
  },
};
const ADVANCED_GENERATION_MARKUP = clampNumber(process.env.ADVANCED_GENERATION_MARKUP, 1.5, 1, 100);
const ADVANCED_SEEDANCE_REFERENCE_LIMIT = Math.floor(clampNumber(process.env.ADVANCED_SEEDANCE_REFERENCE_LIMIT || process.env.ADVANCED_SEEDANCE_EXTRA_REFERENCE_LIMIT, 9, 1, 9));
const ADVANCED_SEEDANCE_VIDEO_REFERENCE_LIMIT = Math.floor(clampNumber(process.env.ADVANCED_SEEDANCE_VIDEO_REFERENCE_LIMIT, 3, 1, 3));
const ADVANCED_SEEDANCE_AUDIO_REFERENCE_LIMIT = Math.floor(clampNumber(process.env.ADVANCED_SEEDANCE_AUDIO_REFERENCE_LIMIT, 3, 1, 3));
const SEEDANCE_PREPROCESS_REFERENCE_VERSION = "preserve-source-v2";
const JSON_BODY_MAX_BYTES = Math.floor(clampNumber(process.env.JSON_BODY_MAX_MB, 1, 1, 8) * 1024 * 1024);
const JSON_MEDIA_BODY_MAX_BYTES = Math.floor(clampNumber(process.env.JSON_MEDIA_BODY_MAX_MB, 140, 16, 200) * 1024 * 1024);
const IMAGE_UPLOAD_MAX_BYTES = 20 * 1024 * 1024;
const MEDIA_UPLOAD_MAX_BYTES = 30 * 1024 * 1024;
const VEGA_10_LITE_IMAGE_UPLOAD_MAX_BYTES = 30 * 1024 * 1024;
const VEGA_10_LITE_VIDEO_UPLOAD_MAX_BYTES = 50 * 1024 * 1024;
const VEGA_10_LITE_AUDIO_UPLOAD_MAX_BYTES = 15 * 1024 * 1024;
const VEGA_15_LITE_IMAGE_UPLOAD_MAX_BYTES = 20 * 1024 * 1024;
const VEGA_15_LITE_VIDEO_UPLOAD_MAX_BYTES = 100 * 1024 * 1024;
const VEGA_15_LITE_AUDIO_UPLOAD_MAX_BYTES = 15 * 1024 * 1024;
const VEGA_15_PRO_IMAGE_UPLOAD_MAX_BYTES = 30 * 1024 * 1024;
const VEGA_15_PRO_VIDEO_UPLOAD_MAX_BYTES = 200 * 1024 * 1024;
const VEGA_15_PRO_AUDIO_UPLOAD_MAX_BYTES = 15 * 1024 * 1024;
const WAN30_VIDEO_UPLOAD_MAX_BYTES = 100 * 1024 * 1024;
const WAN30_AUDIO_UPLOAD_MAX_BYTES = 15 * 1024 * 1024;
const WAN30_DOCUMENT_UPLOAD_MAX_BYTES = 100 * 1024 * 1024;
const WAN30_DOCUMENT_EXTENSIONS = new Set([".docx", ".doc", ".xlsx", ".xls", ".pptx", ".ppt", ".pdf", ".txt", ".md"]);
const WAN30_DOCUMENT_MIMES = new Set([
  "application/pdf", "text/plain", "text/markdown", "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/octet-stream",
]);
const VIDEO_DURATION_PROBE_TIMEOUT_MS = Math.max(3000, Number(process.env.VIDEO_DURATION_PROBE_TIMEOUT_MS || 10000) || 10000);
const ALIYUN_DASHSCOPE_BASE_URL = (process.env.ALIYUN_DASHSCOPE_BASE_URL || "https://dashscope-intl.aliyuncs.com").replace(/\/+$/, "");
const ALIYUN_DASHSCOPE_API_KEY =
  process.env.ALIYUN_DASHSCOPE_API_KEY ||
  process.env.DASHSCOPE_API_KEY ||
  process.env.BAILIAN_API_KEY ||
  "";
const ALIYUN_QWEN37_BASE_URL = (process.env.ALIYUN_QWEN37_BASE_URL || ALIYUN_DASHSCOPE_BASE_URL || "https://dashscope-intl.aliyuncs.com").replace(/\/+$/, "");
const ALIYUN_QWEN37_API_KEY = String(process.env.ALIYUN_QWEN37_API_KEY || ALIYUN_DASHSCOPE_API_KEY || "").trim();
const QWEN_IMAGE3_SINGAPORE_BASE_URL = (process.env.ALIYUN_QWEN_IMAGE3_BASE_URL || ALIYUN_DASHSCOPE_BASE_URL || "https://dashscope-intl.aliyuncs.com").replace(/\/+$/, "");
const ALIYUN_QWEN_IMAGE3_API_KEY = String(process.env.ALIYUN_QWEN_IMAGE3_API_KEY || ALIYUN_DASHSCOPE_API_KEY || "").trim();
const ALIYUN_WAN30_BASE_URL = (process.env.ALIYUN_WAN30_BASE_URL || ALIYUN_DASHSCOPE_BASE_URL || "https://dashscope-intl.aliyuncs.com").replace(/\/+$/, "");
const ALIYUN_WAN30_API_KEY = process.env.ALIYUN_WAN30_API_KEY || ALIYUN_DASHSCOPE_API_KEY;
const ALIYUN_WAN30_MODEL = process.env.ALIYUN_WAN30_MODEL || "wan3.0-video";
const ALIYUN_WAN30_PRIME_MODEL = process.env.ALIYUN_WAN30_PRIME_MODEL || "wan3.0-video-prime";
// Agentic Mobile exposes Wan 3.0 Prime through a separate node-scoped API key.
// Keep it isolated from the existing DashScope Wan 3.0 account.
const ALIYUN_WAN30_PRIME_BASE_URL = (process.env.ALIYUN_WAN30_PRIME_BASE_URL
  || (process.env.ALIYUN_WAN30_PRIME_API_KEY
    ? "https://model-intl.aimobile.wuying.aliyuncs.com/us-east-1"
    : ALIYUN_WAN30_BASE_URL)).replace(/\/+$/, "");
const ALIYUN_WAN30_PRIME_API_KEY = String(process.env.ALIYUN_WAN30_PRIME_API_KEY || "").trim();
const ALIYUN_DASHSCOPE_DATA_INSPECTION_HEADER = process.env.ALIYUN_DASHSCOPE_DATA_INSPECTION_HEADER ||
  '{"input":"disable", "output":"disable"}';
const ALIYUN_WAN27_MODEL = process.env.ALIYUN_WAN27_MODEL || "wan2.7-i2v-2026-04-25";
const ALIYUN_WAN27_T2V_MODEL = process.env.ALIYUN_WAN27_T2V_MODEL || "wan2.7-t2v-2026-06-12";
const ALIYUN_WAN27_I2V_MODEL = process.env.ALIYUN_WAN27_I2V_MODEL || ALIYUN_WAN27_MODEL;
const ALIYUN_WAN27_R2V_MODEL = process.env.ALIYUN_WAN27_R2V_MODEL || "wan2.7-r2v-2026-06-12";
const ALIYUN_WAN27_VIDEO_EDIT_MODEL = process.env.ALIYUN_WAN27_VIDEO_EDIT_MODEL || "wan2.7-videoedit";
const ALIYUN_WAN_ANIMATE_MOVE_MODEL = process.env.ALIYUN_WAN_ANIMATE_MOVE_MODEL || "wan2.2-animate-move";
const ALIYUN_WAN_ANIMATE_MIX_MODEL = process.env.ALIYUN_WAN_ANIMATE_MIX_MODEL || "wan2.2-animate-mix";
const ALIYUN_HAPPYHORSE_T2V_MODEL = process.env.ALIYUN_HAPPYHORSE_T2V_MODEL || "happyhorse-1.1-t2v";
const ALIYUN_HAPPYHORSE_I2V_MODEL = process.env.ALIYUN_HAPPYHORSE_I2V_MODEL || "happyhorse-1.1-i2v";
const ALIYUN_HAPPYHORSE_R2V_MODEL = process.env.ALIYUN_HAPPYHORSE_R2V_MODEL || "happyhorse-1.1-r2v";
const ALIYUN_HAPPYHORSE_VIDEO_EDIT_MODEL = process.env.ALIYUN_HAPPYHORSE_VIDEO_EDIT_MODEL || "happyhorse-1.0-video-edit";
const APIZ_SEEDREAM_IMAGE_SIZES = new Set([
  "auto_2K",
  "auto_3K",
  "square_hd",
  "square",
  "portrait_4_3",
  "portrait_16_9",
  "landscape_4_3",
  "landscape_16_9",
]);

const R2 = {
  accessKey: process.env.R2_ACCESS_KEY_ID || process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
  secretKey: process.env.R2_SECRET_ACCESS_KEY || process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
  endpoint: process.env.R2_ENDPOINT || process.env.CLOUDFLARE_R2_ENDPOINT,
  region: process.env.R2_REGION || process.env.CLOUDFLARE_R2_REGION || "auto",
  bucket: process.env.R2_BUCKET || process.env.CLOUDFLARE_R2_BUCKET,
  publicDomain:
    process.env.R2_PUBLIC_BASE_URL ||
    process.env.R2_PUBLIC_DOMAIN ||
    process.env.CLOUDFLARE_R2_PUBLIC_BASE_URL ||
    process.env.CLOUDFLARE_R2_PUBLIC_DOMAIN,
};
// OSS configuration is validated eagerly. Selecting OSS with incomplete or
// mainland-China settings must fail startup instead of silently using R2.
const OSS = ossConfig(process.env);
const OSS_STORAGE_CONFIGURED = ossStorageConfigured(OSS);
const OSS_STORAGE_ENABLED = ossStorageEnabled(OSS);
const OBJECT_STORAGE_PROVIDER = (() => {
  const requested = String(process.env.STORAGE_PROVIDER || OSS.provider || "auto").trim().toLowerCase();
  if (requested === "oss") {
    if (!OSS_STORAGE_ENABLED) {
      throw Object.assign(new Error("STORAGE_PROVIDER=oss requires complete OSS configuration."), {
        code: "OSS_NOT_CONFIGURED",
        statusCode: 503,
      });
    }
    return "oss";
  }
  if (requested === "r2") return "";
  return OSS_STORAGE_ENABLED ? "oss" : "";
})();
const R2_UPLOAD_TIMEOUT_MS = Math.max(25000, Number(process.env.R2_UPLOAD_TIMEOUT_MS || 120000) || 120000);
const R2_UPLOAD_MAX_TIMEOUT_MS = Math.max(R2_UPLOAD_TIMEOUT_MS, Number(process.env.R2_UPLOAD_MAX_TIMEOUT_MS || 15 * 60 * 1000) || 15 * 60 * 1000);
const R2_UPLOAD_MIN_BYTES_PER_SECOND = Math.max(64 * 1024, Number(process.env.R2_UPLOAD_MIN_BYTES_PER_SECOND || 256 * 1024) || 256 * 1024);
const R2_UPLOAD_RETRY_COUNT = Math.max(1, Math.min(6, Number(process.env.R2_UPLOAD_RETRY_COUNT || 5) || 5));
const R2_UPLOAD_RETRY_BASE_DELAY_MS = Math.max(250, Math.min(10000, Number(process.env.R2_UPLOAD_RETRY_BASE_DELAY_MS || 1000) || 1000));
const R2_PUBLIC_READY_RETRY_COUNT = Math.max(1, Math.min(6, Number(process.env.R2_PUBLIC_READY_RETRY_COUNT || 4) || 4));
const R2_MULTIPART_THRESHOLD_BYTES = Math.max(8 * 1024 * 1024, Number(process.env.R2_MULTIPART_THRESHOLD_BYTES || 8 * 1024 * 1024) || 8 * 1024 * 1024);
const R2_MULTIPART_PART_SIZE_BYTES = Math.max(5 * 1024 * 1024, Number(process.env.R2_MULTIPART_PART_SIZE_BYTES || 5 * 1024 * 1024) || 5 * 1024 * 1024);
const R2_UPLOAD_CONCURRENCY = Math.max(1, Math.min(8, Number(process.env.R2_UPLOAD_CONCURRENCY || 2) || 2));
const GENERATED_ASSETS_ON_DEMAND = /^(1|true|yes|on)$/i.test(String(process.env.GENERATED_ASSETS_ON_DEMAND || "true"));
const DISABLE_R2_STORAGE = /^(1|true|yes|on)$/i.test(String(process.env.DISABLE_R2_STORAGE || process.env.DISABLE_OBJECT_STORAGE || ""));
// Generated outputs are intentionally served from the provider URL. User
// uploads still use the configured object storage so upstream APIs can read
// public reference media.
const DISABLE_GENERATED_R2_STORAGE = /^(1|true|yes|on)$/i.test(String(process.env.DISABLE_GENERATED_R2_STORAGE || ""));
const SITE_STORAGE_SLUG = storagePathSegment(
  process.env.SITE_STORAGE_SLUG || process.env.TENANT_SLUG || defaultStorageSlug(),
  "raising-game",
);
const OBJECT_STORAGE_KEY_PREFIX = storageKeyPrefix(
  process.env.STORAGE_KEY_PREFIX || process.env.OSS_KEY_PREFIX || process.env.R2_KEY_PREFIX || `seedance-assets/${SITE_STORAGE_SLUG}`,
);

function defaultStorageSlug() {
  try {
    const host = new URL(PUBLIC_BASE_URL || "https://raising-game.local").hostname;
    if (/cloudtoken/i.test(host)) return "cloudtoken";
    if (/(^|\.)667zui\.video$/i.test(host)) return "667zui";
  } catch {
    // Keep the legacy namespace when the public URL is not configured yet.
  }
  return "raising-game";
}

function storagePathSegment(value = "", fallback = "asset") {
  return String(value || fallback)
    .trim()
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 128) || fallback;
}

function storageKeyPrefix(value = "") {
  const prefix = String(value || "").trim().replace(/^\/+|\/+$/g, "");
  return prefix
    .split("/")
    .map((part) => storagePathSegment(part, ""))
    .filter(Boolean)
    .join("/") || "seedance-assets/raising-game";
}

function objectStoragePath(...parts) {
  const suffix = parts
    .flat()
    .map((part) => storagePathSegment(part, "asset"))
    .filter(Boolean)
    .join("/");
  return [OBJECT_STORAGE_KEY_PREFIX, suffix].filter(Boolean).join("/");
}

function storageObjectName(kind = "asset", id = "item") {
  return `${SITE_STORAGE_SLUG}-${storagePathSegment(kind)}-${storagePathSegment(id)}-${Date.now()}`;
}

const ARK_OPENAPI = {
  accessKey: process.env.BYTEPLUS_ACCESS_KEY_ID || process.env.VOLC_ACCESS_KEY_ID,
  secretKey: process.env.BYTEPLUS_SECRET_ACCESS_KEY || process.env.VOLC_ACCESS_KEY_SECRET,
  host: process.env.BYTEPLUS_OPENAPI_HOST || "ark.ap-southeast-1.byteplusapi.com",
  region: process.env.BYTEPLUS_OPENAPI_REGION || "ap-southeast-1",
  service: process.env.BYTEPLUS_OPENAPI_SERVICE || "ark",
  version: process.env.BYTEPLUS_OPENAPI_VERSION || "2024-01-01",
  groupId: process.env.BYTEPLUS_ASSET_GROUP_ID || "group-20260429190412-6lzgq",
  projectName: process.env.BYTEPLUS_PROJECT_NAME || "xin",
};

const demoTasks = new Map();
const requestContext = new AsyncLocalStorage();
let legacyAppStateWriteLock = Promise.resolve();

async function withAppStateWriteLock(fn) {
  let store = requestContext.getStore();
  if (!store) {
    return requestContext.run({ auth: null, appStateWriteLocked: false }, () => withAppStateWriteLock(fn));
  }
  if (store?.appStateWriteLocked) return await fn();
  if (!dbEnabled()) {
    const previous = legacyAppStateWriteLock;
    let release;
    legacyAppStateWriteLock = new Promise((resolve) => {
      release = resolve;
    });
    await previous.catch(() => {});
    try {
      store.appStateWriteLocked = true;
      try {
        return await fn();
      } finally {
        store.appStateWriteLocked = false;
      }
    } finally {
      release();
    }
  }
  store.appStateWriteLocked = true;
  try {
    return await fn();
  } finally {
    store.appStateWriteLocked = false;
  }
}

