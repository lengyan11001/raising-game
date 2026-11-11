async function settleWan30AdaptiveDuration(record = {}, reason = "query") {
  if (!usesWan30AdaptiveDurationPricing(record) || !isSucceededStatus(record.status) || record.billingSettledAt) return record;
  const resultUrl = String(record.remoteVideoUrl || record.videoUrl || record.cdnVideoUrl || record.localVideoUrl || "").trim();
  if (!resultUrl) return record;
  const actualDuration = await probeVideoDurationSeconds(resultUrl);
  if (!(actualDuration > 0)) return record;

  const pricing = record.pricingEstimate || {};
  const creditsPerSecond = Number(pricing.creditsPerSecond || 0);
  const originalFinalCredits = creditsAmount(Math.min(30, actualDuration) * creditsPerSecond);
  const pricingMultiplier = normalizeUserPricingMultiplier(record.userPricingMultiplier ?? record.pricingMultiplier ?? pricing.userPricingMultiplier ?? 1);
  const finalCredits = applyUserPricingMultiplierToCredits(originalFinalCredits, pricingMultiplier);
  const preDeducted = creditsAmount(record.preDeductedCredits || 0);
  const delta = preDeducted - finalCredits;
  let billingStatus = "settled";
  const db = await readDb();

  try {
    if (delta > 0) {
      await changeUserCredits(db, record.userId, delta, "generation_refund", {
        taskId: record.taskId,
        provider: record.provider,
        reason,
        preDeducted,
        finalCredits,
        originalFinalCredits,
        pricingMultiplier,
        generatedDurationSeconds: actualDuration,
      });
      await recordSubtokenAdjustment(record, {
        taskId: record.taskId,
        type: "generation_refund",
        amount: -delta,
        meta: { provider: record.provider, reason, preDeducted, finalCredits, originalFinalCredits, generatedDurationSeconds: actualDuration },
      });
      if (!dbEnabled()) await writeDb(db);
    } else if (delta < 0) {
      await changeUserCredits(db, record.userId, delta, "generation_settle", {
        taskId: record.taskId,
        provider: record.provider,
        reason,
        preDeducted,
        finalCredits,
        originalFinalCredits,
        pricingMultiplier,
        generatedDurationSeconds: actualDuration,
      });
      await recordSubtokenAdjustment(record, {
        taskId: record.taskId,
        type: "generation_settle",
        amount: Math.abs(delta),
        meta: { provider: record.provider, reason, preDeducted, finalCredits, originalFinalCredits, generatedDurationSeconds: actualDuration },
      });
      if (!dbEnabled()) await writeDb(db);
    }
  } catch (error) {
    if (error.code === "INSUFFICIENT_CREDITS" || error.code === "SUBTOKEN_QUOTA_EXCEEDED") {
      billingStatus = "settle_pending_insufficient";
      return upsertGenerationRecord({
        taskId: record.taskId,
        finalCredits,
        originalFinalCredits,
        userPricingMultiplier: pricingMultiplier,
        generatedDurationSeconds: actualDuration,
        billingStatus,
        billingError: error.message || "Not enough credits or sub token quota for final settlement.",
      });
    }
    throw error;
  }

  return upsertGenerationRecord({
    taskId: record.taskId,
    finalCredits,
    originalFinalCredits,
    userPricingMultiplier: pricingMultiplier,
    generatedDurationSeconds: actualDuration,
    billingStatus,
    billingSettledAt: new Date().toISOString(),
    billingError: "",
  });
}

async function settleSeedanceGenerationRecord(record = {}, reason = "query") {
  const preDeducted = creditsAmount(record.preDeductedCredits || 0);
  if (usesWan30AdaptiveDurationPricing(record) && isSucceededStatus(record.status) && !record.billingSettledAt) {
    return settleWan30AdaptiveDuration(record, reason);
  }
  if (
    seedanceUsesTokenPricing(record) &&
    record.taskId &&
    record.userId &&
    isSucceededStatus(record.status) &&
    !record.billingSettledAt
  ) {
    const usage = seedanceFinalCreditsFromUsage(record);
    if (!usage) return record;
    const configuredSalePrice = seedanceUsesConfiguredSalePrice(record);
    const finalCredits = configuredSalePrice ? preDeducted : usage.credits;
    const originalFinalCredits = configuredSalePrice
      ? creditsAmount(record.originalPreDeductedCredits ?? preDeducted)
      : usage.originalCredits;
    const delta = preDeducted - finalCredits;
    let billingStatus = "settled";
    const db = await readDb();
    try {
      if (delta > 0) {
        await changeUserCredits(db, record.userId, delta, "generation_refund", {
          taskId: record.taskId,
          provider: record.provider || "seedance",
          reason,
          preDeducted,
          baseCredits: usage.baseCredits,
          finalCredits,
          originalFinalCredits,
          upstreamCalculatedCredits: usage.credits,
          upstreamOriginalCredits: usage.originalCredits,
          pricingMultiplier: usage.pricingMultiplier,
          markup: usage.markup,
          completionTokens: usage.completionTokens,
        });
        await recordSubtokenAdjustment(record, {
          taskId: record.taskId,
          type: "generation_refund",
          amount: -delta,
          meta: {
            provider: record.provider || "seedance",
            reason,
            preDeducted,
            finalCredits,
            originalFinalCredits,
            upstreamCalculatedCredits: usage.credits,
            upstreamOriginalCredits: usage.originalCredits,
          },
        });
        if (!dbEnabled()) await writeDb(db);
      } else if (delta < 0) {
        await changeUserCredits(db, record.userId, delta, "generation_settle", {
          taskId: record.taskId,
          provider: record.provider || "seedance",
          reason,
          preDeducted,
          baseCredits: usage.baseCredits,
          finalCredits,
          originalFinalCredits,
          upstreamCalculatedCredits: usage.credits,
          upstreamOriginalCredits: usage.originalCredits,
          pricingMultiplier: usage.pricingMultiplier,
          markup: usage.markup,
          completionTokens: usage.completionTokens,
        });
        await recordSubtokenAdjustment(record, {
          taskId: record.taskId,
          type: "generation_settle",
          amount: Math.abs(delta),
          meta: {
            provider: record.provider || "seedance",
            reason,
            preDeducted,
            finalCredits,
            originalFinalCredits,
            upstreamCalculatedCredits: usage.credits,
            upstreamOriginalCredits: usage.originalCredits,
          },
        });
        if (!dbEnabled()) await writeDb(db);
      }
    } catch (error) {
      if (error.code === "INSUFFICIENT_CREDITS" || error.code === "SUBTOKEN_QUOTA_EXCEEDED") {
        billingStatus = "settle_pending_insufficient";
        return upsertGenerationRecord({
          taskId: record.taskId,
          finalCredits,
          originalFinalCredits,
          userPricingMultiplier: usage.pricingMultiplier,
          billingStatus,
          billingError: error.message || "Not enough credits or sub token quota for final settlement.",
          usageCompletionTokens: usage.completionTokens,
          usageBaseCredits: usage.baseCredits,
          upstreamCalculatedCredits: usage.credits,
          upstreamOriginalCredits: usage.originalCredits,
          billingPriceSource: configuredSalePrice ? "configured_sale_price" : "upstream_token_usage",
        });
      }
      throw error;
    }
    return upsertGenerationRecord({
      taskId: record.taskId,
      finalCredits,
      originalFinalCredits,
      userPricingMultiplier: usage.pricingMultiplier,
      billingStatus,
      billingSettledAt: new Date().toISOString(),
      billingError: "",
      usageCompletionTokens: usage.completionTokens,
      usageBaseCredits: usage.baseCredits,
      upstreamCalculatedCredits: usage.credits,
      upstreamOriginalCredits: usage.originalCredits,
      billingPriceSource: configuredSalePrice ? "configured_sale_price" : "upstream_token_usage",
    });
  }

  if (!needsSeedanceFailureRefund(record)) return record;
  const db = await readDb();
  const alreadyRefunded = (db.creditLedger || []).some((entry) => (
    entry.userId === record.userId &&
    entry.type === "generation_refund" &&
    entry.meta?.taskId === record.taskId
  ));

  try {
    if (!alreadyRefunded) {
      await changeUserCredits(db, record.userId, preDeducted, "generation_refund", {
        taskId: record.taskId,
        provider: record.provider || "seedance",
        reason,
        preDeducted,
        finalCredits: 0,
        originalFinalCredits: 0,
        pricingMultiplier: normalizeUserPricingMultiplier(record.userPricingMultiplier ?? record.pricingMultiplier ?? 1),
      });
      await recordSubtokenAdjustment(record, {
        taskId: record.taskId,
        type: "generation_refund",
        amount: -preDeducted,
        meta: { provider: record.provider || "seedance", reason, preDeducted },
      });
      if (!dbEnabled()) await writeDb(db);
    }
    return upsertGenerationRecord({
      taskId: record.taskId,
      finalCredits: 0,
      originalFinalCredits: 0,
      userPricingMultiplier: normalizeUserPricingMultiplier(record.userPricingMultiplier ?? record.pricingMultiplier ?? 1),
      billingStatus: "refunded",
      billingSettledAt: new Date().toISOString(),
      billingError: "",
    });
  } catch (error) {
    return upsertGenerationRecord({
      taskId: record.taskId,
      billingStatus: "refund_failed",
      billingError: error.message || "Failed to refund failed generation.",
    });
  }
}

function extractApizReportedCredits(value, depth = 0) {
  if (value === null || value === undefined || depth > 40) return null;
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return null;
    if (text.startsWith("{") || text.startsWith("[")) {
      try {
        return extractApizReportedCredits(JSON.parse(text), depth + 1);
      } catch {
        return null;
      }
    }
    const number = Number(text);
    return Number.isFinite(number) && number >= 0 ? creditsAmount(number) : null;
  }
  if (typeof value === "number") return value >= 0 ? creditsAmount(value) : null;
  if (Array.isArray(value)) {
    let best = null;
    value.forEach((item) => {
      const next = extractApizReportedCredits(item, depth + 1);
      if (next !== null) best = Math.max(best ?? 0, next);
    });
    return best;
  }
  if (typeof value !== "object") return null;

  const billing = value.x_billing ?? value["X-Billing"] ?? value.billing;
  const billingCredits = billing ? extractApizReportedCredits(billing, depth + 1) : null;
  if (billingCredits !== null) return billingCredits;

  const balanceLike = Object.prototype.hasOwnProperty.call(value, "balance") || Object.prototype.hasOwnProperty.call(value, "balance_yuan");
  let best = null;
  for (const [key, item] of Object.entries(value)) {
    const lower = key.toLowerCase();
    if (["balance", "balance_yuan", "remaining", "account", "token"].includes(lower)) continue;
    if (["credits_used", "credits_charged", "credits_final", "credit_cost", "consumed_credits", "usage_credits", "price", "cost"].includes(lower)) {
      const next = extractApizReportedCredits(item, depth + 1);
      if (next !== null) best = Math.max(best ?? 0, next);
    } else if (lower === "credits" && !balanceLike) {
      const next = extractApizReportedCredits(item, depth + 1);
      if (next !== null) best = Math.max(best ?? 0, next);
    } else if (item && typeof item === "object") {
      const next = extractApizReportedCredits(item, depth + 1);
      if (next !== null) best = Math.max(best ?? 0, next);
    } else if (typeof item === "string" && item.trim().startsWith("{")) {
      const next = extractApizReportedCredits(item, depth + 1);
      if (next !== null) best = Math.max(best ?? 0, next);
    }
  }
  return best === null ? null : creditsAmount(best);
}

function publicBilling(record = {}) {
  return {
    preDeducted: creditsAmount(record.preDeductedCredits || 0),
    final: record.finalCredits === undefined || record.finalCredits === null ? null : creditsAmount(record.finalCredits || 0),
    originalPreDeducted: record.originalPreDeductedCredits === undefined || record.originalPreDeductedCredits === null ? null : creditsAmount(record.originalPreDeductedCredits || 0),
    originalFinal: record.originalFinalCredits === undefined || record.originalFinalCredits === null ? null : creditsAmount(record.originalFinalCredits || 0),
    pricingMultiplier: normalizeUserPricingMultiplier(record.userPricingMultiplier ?? record.pricingMultiplier ?? 1),
    settled: Boolean(record.billingSettledAt),
    status: record.billingStatus || "",
  };
}

function platformRecordKind(template = {}) {
  return template.type === "image-to-video" ? "image-to-video" : "text-to-video";
}

function startPlatformGenerationJob(job) {
  return startTrackedGenerationJob("platform-generation", job.taskId, (submission) => runPlatformGenerationJob(job, submission), (error) => {
    console.error("[platform-generation-job-failed]", job.taskId, error.message || error);
  });
}

async function platformGenerationProviderTask(job = {}, { onDispatch = null } = {}) {
  const {
    userId,
    templateId,
    prompt,
    userAssetId,
    upstreamPayload,
  } = job;
  const gatewayBody = {
    templateId,
    prompt,
    params: upstreamPayload?.params || {},
  };
  if (USE_GATEWAY_UPSTREAM && userAssetId) {
    const db = await readDb();
    const asset = (db.userAssets || []).find((entry) => entry.id === userAssetId && entry.userId === userId && !isSoftDeleted(entry));
    if (!asset) {
      const error = new Error("Reference image not found.");
      error.statusCode = 404;
      error.code = "REFERENCE_ASSET_UNAVAILABLE";
      throw error;
    }
    const preparedAsset = await ensurePublicUrlForUserAsset(db, asset);
    // Keep using the persisted asset record so the gateway receives the same
    // public URL contract regardless of whether preparation created a copy.
    Object.assign(asset, preparedAsset);
    gatewayBody.imageUrl = publicHttpUrlForUserAsset(asset);
    gatewayBody.fileName = asset.name || "";
  } else if (userAssetId) {
    gatewayBody.userAssetId = userAssetId;
  }
  /*
   * This is the durable dispatch boundary. Asset lookup/public URL preparation
   * happens before it, so those local failures remain safely retryable. Once
   * this callback runs, an interrupted request has an ambiguous provider outcome.
   */
  onDispatch?.();
  return USE_GATEWAY_UPSTREAM
    ? gatewaySubmitPlatformTask(gatewayBody)
    : apizRequest("/api/v3/tasks/create", upstreamPayload);
}

async function persistPlatformGenerationAccepted(job = {}, task = {}) {
  const {
    taskId,
    userId,
    templateId,
    templateTitle,
    templateType,
    prompt,
    imageUrl,
    userAssetId,
    upstreamPayload,
    pricingEstimate,
    preDeductedCredits,
  } = job;
  const upstreamTaskId = USE_GATEWAY_UPSTREAM ? task.taskId : apizTaskId(task);
  if (!upstreamTaskId) {
    const error = new Error(`Generation service did not return task id: ${JSON.stringify(task)}`);
    error.statusCode = 502;
    throw error;
  }
  const record = await upsertGenerationRecord({
    taskId,
    upstreamTaskId,
    awaitingUpstreamTask: false,
    status: USE_GATEWAY_UPSTREAM ? task.status : apizStatus(task),
    model: upstreamPayload.model,
    provider: "apiz",
    upstreamSource: USE_GATEWAY_UPSTREAM ? "gateway" : "direct",
    source: "platform-template",
    kind: platformRecordKind({ type: templateType }),
    templateId,
    templateTitle,
    userId,
    userAssetId: userAssetId || "",
    imageUrl,
    prompt,
    finalPrompt: prompt,
    params: upstreamPayload.params,
    upstreamPayload,
    preDeductedCredits,
    originalPreDeductedCredits: pricingEstimate.originalCredits ?? preDeductedCredits,
    userPricingMultiplier: pricingEstimate.userPricingMultiplier ?? 1,
    pricingEstimate: {
      source: pricingEstimate.source,
      pricing: pricingEstimate.pricing || null,
      baseCredits: pricingEstimate.baseCredits ?? null,
      originalCredits: pricingEstimate.originalCredits ?? null,
      userPricingMultiplier: pricingEstimate.userPricingMultiplier ?? 1,
      markup: pricingEstimate.markup ?? GENERATION_PRICE_MARKUP,
    },
    finalCredits: null,
    billingStatus: preDeductedCredits > 0 ? "pre_deducted" : "free",
    billingSettledAt: "",
    billingError: "",
    createResponse: task,
    createReportedCredits: USE_GATEWAY_UPSTREAM ? null : extractApizReportedCredits(task),
    remoteVideoUrl: USE_GATEWAY_UPSTREAM ? task.videoUrl : apizResultUrl(task),
    localVideoUrl: "",
    error: "",
    submittedAt: new Date().toISOString(),
  });
  if (USE_GATEWAY_UPSTREAM) {
    if (isSucceededStatus(record.status) || isFailedStatus(record.status)) {
      await settleApizGenerationRecord(record, {
        status: record.status,
        videoUrl: task.videoUrl,
        error: task.error,
      }, "create");
    }
  } else {
    await settleApizGenerationRecord(record, task, "create");
  }
  return record;
}

function platformGenerationSubmitRetryDelayMs(attempts = 0) {
  const safeAttempts = Math.max(1, Math.trunc(Number(attempts) || 1));
  return Math.min(5 * 60_000, 15_000 * (2 ** Math.min(5, safeAttempts - 1)));
}

function platformGenerationSubmitDefinitelyNotSent(error = null) {
  return Boolean(error?.definitelyNotSent)
    || ["REFERENCE_ASSET_UNAVAILABLE", "GENERATION_SERVICE_NOT_CONFIGURED", "GATEWAY_TOKEN_NOT_CONFIGURED"].includes(String(error?.code || ""));
}

function platformGenerationSubmitProviderRejected(error = null) {
  return Boolean(error?.providerRejected) && error?.ambiguous !== true;
}

async function markPlatformGenerationSubmitUnknown(job = {}, error = null) {
  const { taskId, templateTitle, templateId, upstreamPayload, pricingEstimate, preDeductedCredits } = job;
  try {
    const current = await getGenerationRecord(taskId);
    if (current?.upstreamTaskId) {
      /*
       * The accepted record is durable proof. A later bookkeeping failure
       * (for example queue completion) must not overwrite it as unknown.
       */
      return current;
    }
    await updateGenerationRecord(taskId, {
      status: "unknown",
      awaitingUpstreamTask: true,
      error: error?.message || "Provider submission outcome is unknown; reconciliation is required.",
      billingStatus: preDeductedCredits > 0 ? "pre_deducted" : "free",
      unknownAt: new Date().toISOString(),
      provider: "apiz",
      source: "platform-template",
      kind: platformRecordKind({ type: job.templateType }),
      templateId,
      templateTitle,
      model: upstreamPayload?.model || "",
      pricingEstimate: {
        source: pricingEstimate.source,
        pricing: pricingEstimate.pricing || null,
        baseCredits: pricingEstimate.baseCredits ?? null,
        originalCredits: pricingEstimate.originalCredits ?? null,
        userPricingMultiplier: pricingEstimate.userPricingMultiplier ?? 1,
        markup: pricingEstimate.markup ?? GENERATION_PRICE_MARKUP,
      },
      preDeductedCredits,
      originalPreDeductedCredits: pricingEstimate.originalCredits ?? preDeductedCredits,
      userPricingMultiplier: pricingEstimate.userPricingMultiplier ?? 1,
    }, "platform-submit-unknown");
  } catch (updateError) {
    console.error("[platform-generation-unknown-update-error]", taskId, updateError.message || updateError);
    throw updateError;
  }
}

async function markPlatformGenerationSubmitFailed(job = {}, error = null) {
  const {
    taskId,
    templateType,
    templateTitle,
    upstreamPayload,
    pricingEstimate,
    preDeductedCredits,
  } = job;
  try {
    const current = await getGenerationRecord(taskId);
    if (current?.upstreamTaskId) {
      /*
       * Provider rejection can only be terminal when no accepted upstream task
       * exists. Never turn an accepted record into failed due to stale error
       * handling after a takeover.
       */
      return current;
    }
    const failedRecord = await upsertGenerationRecord({
      taskId,
      status: "failed",
      awaitingUpstreamTask: false,
      error: error.message || "Generation submission failed.",
      billingError: "",
      failedAt: new Date().toISOString(),
      provider: "apiz",
      source: "platform-template",
      kind: platformRecordKind({ type: templateType }),
      templateId: job.templateId,
      templateTitle,
      model: upstreamPayload?.model || "",
      pricingEstimate: {
        source: pricingEstimate.source,
        pricing: pricingEstimate.pricing || null,
        baseCredits: pricingEstimate.baseCredits ?? null,
        originalCredits: pricingEstimate.originalCredits ?? null,
        userPricingMultiplier: pricingEstimate.userPricingMultiplier ?? 1,
        markup: pricingEstimate.markup ?? GENERATION_PRICE_MARKUP,
      },
      preDeductedCredits,
      originalPreDeductedCredits: pricingEstimate.originalCredits ?? preDeductedCredits,
      userPricingMultiplier: pricingEstimate.userPricingMultiplier ?? 1,
      lastUpdateReason: "platform-failed",
    });
    if (failedRecord) {
      return settleApizGenerationRecord(failedRecord, {
        status: "failed",
        error: error.message || "Generation submission failed.",
      }, "platform-submit-failed");
    }
  } catch (updateError) {
    console.error("[platform-generation-fail-update-error]", taskId, updateError.message || updateError);
    throw updateError;
  }
}

async function runPlatformGenerationJob(job = {}, submission = null) {
  const { taskId } = job;
  let providerDispatched = false;
  try {
    await updateGenerationRecord(taskId, {
      status: "submitting",
      awaitingUpstreamTask: true,
      error: "",
    }, "platform-submitting");
    const task = await platformGenerationProviderTask(job, {
      onDispatch: () => { providerDispatched = true; },
    });
    await persistPlatformGenerationAccepted(job, task);
  } catch (error) {
    console.warn("[platform-generation-job-error]", taskId, error.message || error);
    if (!providerDispatched || platformGenerationSubmitDefinitelyNotSent(error)) {
      await markPlatformGenerationSubmitFailed(job, error);
    } else if (platformGenerationSubmitProviderRejected(error)) {
      await markPlatformGenerationSubmitFailed(job, error);
    } else {
      await markPlatformGenerationSubmitUnknown(job, error);
    }
  } finally {
    finishGenerationSubmission(submission);
  }
}

async function processQueuedPlatformGenerationJob(job = {}) {
  const { taskId } = job;
  const jobInput = job.payload || {};
  const submission = beginGenerationSubmission("platform-generation-queue", taskId);
  try {
    await updateGenerationRecord(taskId, {
      status: "submitting",
      awaitingUpstreamTask: true,
      error: "",
    }, "platform-queue-submitting");
    const marked = await markGenerationSubmitJobSubmittingInDb({
      taskId,
      claimToken: job.claimToken,
    });
    if (!marked.marked) return { processed: false, reason: "claim-lost-before-submit" };
    let task;
    let providerDispatched = false;
    try {
      task = await platformGenerationProviderTask(jobInput, {
        onDispatch: () => { providerDispatched = true; },
      });
    } catch (error) {
      if (!providerDispatched) {
        const retried = await retryGenerationSubmitJobInDb({
          taskId,
          claimToken: job.claimToken,
          error: error.message || "Generation submission failed before dispatch.",
          retryAfterMs: platformGenerationSubmitRetryDelayMs(job.attempts),
          safeToRetry: true,
        });
        if (retried.retried) return { processed: false, reason: "retryable-pre-submit", error };
        await failGenerationSubmitJobInDb({
          taskId,
          claimToken: job.claimToken,
          error: error.message || "Generation submission failed before dispatch.",
        });
        try {
          await markPlatformGenerationSubmitFailed(jobInput, error);
        } catch (updateError) {
          return { processed: false, reason: "terminal-pre-submit-refund-pending", error, updateError };
        }
        return { processed: false, reason: "terminal-pre-submit", error };
      }
      if (platformGenerationSubmitProviderRejected(error)) {
        await failGenerationSubmitJobInDb({
          taskId,
          claimToken: job.claimToken,
          error: error.message || "Provider rejected the submission.",
        });
        try {
          await markPlatformGenerationSubmitFailed(jobInput, error);
        } catch (updateError) {
          return { processed: false, reason: "provider-rejected-refund-pending", error, updateError };
        }
        return { processed: false, reason: "provider-rejected", error };
      }
      await markGenerationSubmitJobUnknownInDb({
        taskId,
        claimToken: job.claimToken,
        error: error.message || "Provider submission outcome is unknown.",
      });
      await markPlatformGenerationSubmitUnknown(jobInput, error);
      return { processed: false, reason: "unknown-after-dispatch", error };
    }

    try {
      const record = await persistPlatformGenerationAccepted(jobInput, task);
      const completed = await completeGenerationSubmitJobInDb({
        taskId,
        claimToken: job.claimToken,
        upstreamTaskId: record?.upstreamTaskId || "",
      });
      if (!completed.completed) {
        console.error("[platform-generation-queue-completion-conflict]", taskId);
        return { processed: false, reason: "completion-conflict", record, error: new Error("Generation submit job completion conflict.") };
      }
      return { processed: true, record };
    } catch (error) {
      /*
       * If the accepted record reached the database, the provider outcome is no
       * longer ambiguous. Keep that record and let the next claim pass close the
       * queue row from the durable upstreamTaskId. Only a failure before the
       * record was persisted is genuinely unknown.
       */
      let acceptedRecord = null;
      try {
        acceptedRecord = await getGenerationRecord(taskId);
      } catch (lookupError) {
        console.error("[platform-generation-accepted-lookup-failed]", taskId, lookupError.message || lookupError);
      }
      if (acceptedRecord?.upstreamTaskId) {
        console.error("[platform-generation-queue-completion-pending]", taskId, error.message || error);
        return { processed: false, reason: "accepted-record-persisted-completion-pending", record: acceptedRecord, error };
      }
      await markGenerationSubmitJobUnknownInDb({
        taskId,
        claimToken: job.claimToken,
        error: `Provider accepted the task but local persistence failed: ${error.message || error}`,
      });
      await markPlatformGenerationSubmitUnknown(jobInput, error);
      return { processed: false, reason: "unknown-after-provider-accept", error };
    }
  } finally {
    finishGenerationSubmission(submission);
  }
}

async function reconcileFailedPlatformGenerationSubmitJobs(limit = 20) {
  const pending = await getGenerationSubmitJobsNeedingReconciliationInDb({ limit });
  const results = [];
  for (const item of pending) {
    const job = item.job || {};
    try {
      const record = await markPlatformGenerationSubmitFailed({
        ...(job.payload || {}),
        taskId: job.taskId,
      }, new Error(job.lastError || "Generation submission failed before provider acceptance."));
      results.push({ taskId: job.taskId, reconciled: true, record });
    } catch (error) {
      console.error("[platform-generation-reconcile-failed]", job.taskId, error.message || error);
      results.push({ taskId: job.taskId, reconciled: false, error });
    }
  }
  return results;
}

async function processPlatformGenerationSubmitQueue(limit = 1) {
  const claimed = await claimNextGenerationSubmitJobsInDb({
    limit,
    leaseMs: 10 * 60 * 1000,
    claimToken: `generation-submit-${process.pid}-${crypto.randomUUID()}`,
  });
  /*
   * A failed queue row is intentionally kept as a tombstone. Reconcile its
   * generation record and refund before claiming more work; the query remains
   * repeatable until billing reaches a terminal state.
   */
  const reconciliation = await reconcileFailedPlatformGenerationSubmitJobs(limit);
  const results = [];
  for (const item of claimed.jobs) {
    results.push(await processQueuedPlatformGenerationJob({
      ...item,
      claimToken: claimed.claimToken,
    }));
  }
  return { ...claimed, reconciliation, results };
}

let platformGenerationSubmitWorkerRunning = false;
let platformGenerationSubmitWorkerTimer = null;
let platformGenerationSubmitWorkerKickoffTimer = null;

async function runPlatformGenerationSubmitWorkerTick(reason = "timer") {
  if (platformGenerationSubmitWorkerRunning || generationSubmissionDraining) return { skipped: true };
  platformGenerationSubmitWorkerRunning = true;
  try {
    return await runWithSchedulerLease("generation-submit-worker", async () => {
      const result = await processPlatformGenerationSubmitQueue(GENERATION_SUBMIT_WORKER_BATCH_SIZE);
      const processed = result.results.filter((item) => item?.processed).length;
      const reconciled = result.reconciliation.filter((item) => item.reconciled).length;
      if (processed || result.jobs.length || result.unknownJobs?.length || result.reconciliation.length) {
        console.log("[generation-submit-worker]", {
          reason,
          claimed: result.jobs.length,
          processed,
          unknown: result.unknownJobs.length,
          reconciled,
        });
      }
      return result;
    }, {
      connect: () => getSchedulerPool().connect(),
      onError: (error) => console.error("[generation-submit-worker-lease-failed]", error.message || error),
    });
  } finally {
    platformGenerationSubmitWorkerRunning = false;
  }
}

function startPlatformGenerationSubmitWorker() {
  if (!GENERATION_SUBMIT_WORKER_ENABLED) return false;
  if (platformGenerationSubmitWorkerTimer) return true;
  platformGenerationSubmitWorkerKickoffTimer = setTimeout(
    () => runPlatformGenerationSubmitWorkerTick("startup"),
    1000,
  );
  platformGenerationSubmitWorkerKickoffTimer.unref?.();
  platformGenerationSubmitWorkerTimer = setInterval(
    () => runPlatformGenerationSubmitWorkerTick("timer"),
    GENERATION_SUBMIT_WORKER_INTERVAL_MS,
  );
  platformGenerationSubmitWorkerTimer.unref?.();
  return true;
}

function stopPlatformGenerationSubmitWorker() {
  if (platformGenerationSubmitWorkerKickoffTimer) clearTimeout(platformGenerationSubmitWorkerKickoffTimer);
  if (platformGenerationSubmitWorkerTimer) clearInterval(platformGenerationSubmitWorkerTimer);
  platformGenerationSubmitWorkerKickoffTimer = null;
  platformGenerationSubmitWorkerTimer = null;
}

function platformModelRejectsResolution(model = "", params = {}, type = "image-to-video") {
  const resolvedModel = resolvePlatformModelId(model, type);
  const compact = `${resolvedModel} ${params.model || ""}`.toLowerCase().replace(/[\s_/-]+/g, "");
  if (paramsHaveVideoInput(params)) return false;
  return compact.includes("arkseedance2.0") || compact.includes("dreaminaseedance") || compact.includes("seedance2.0fast");
}

function sanitizePlatformPayloadParamsForModel(model = "", params = {}, type = "image-to-video") {
  if (!params || typeof params !== "object" || Array.isArray(params)) return params;
  const next = { ...params };
  if (next.resolution && platformModelRejectsResolution(model, next, type)) {
    delete next.resolution;
  }
  return next;
}

function platformImageFieldKeys(payload = {}) {
  const keys = Object.keys(payload || {}).filter((key) => (
    /^image(?:_file)?_\d+$/i.test(key) ||
    /^image_url$/i.test(key) ||
    /^image_files$/i.test(key) ||
    /^filePaths$/i.test(key) ||
    /^images$/i.test(key) ||
    /^content$/i.test(key)
  ));
  if (keys.length) return keys;
  if (Array.isArray(payload.image_urls)) return ["image_urls"];
  return ["image_url"];
}

function replacePlatformPayloadImages(payload = {}, imageUrl = "") {
  if (!imageUrl) return payload;
  const next = { ...payload };
  platformImageFieldKeys(next).forEach((key) => {
    if (["image_urls", "image_files", "filePaths"].includes(key)) {
      next[key] = [imageUrl];
    } else if (key === "images") {
      const images = Array.isArray(next.images) && next.images.length
        ? next.images
        : [{ name: "image_1" }];
      next.images = images.map((item, index) => (
        item && typeof item === "object" && !Array.isArray(item)
          ? { ...item, url: imageUrl }
          : { url: imageUrl, name: `image_${index + 1}` }
      ));
    } else if (key === "content") {
      const content = Array.isArray(next.content) ? next.content : [];
      let replaced = false;
      next.content = content.map((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item) || item.type !== "image_url") return item;
        replaced = true;
        const imageValue = item.image_url && typeof item.image_url === "object" && !Array.isArray(item.image_url)
          ? { ...item.image_url, url: imageUrl }
          : { url: imageUrl };
        return { ...item, image_url: imageValue };
      });
      if (!replaced) {
        next.content.push({ type: "image_url", image_url: { url: imageUrl }, role: "reference_image" });
      }
    } else {
      next[key] = imageUrl;
    }
  });
  return next;
}

function platformApizPayload({ template, prompt, imageUrl, overrides = {} }) {
  const configured = template.requestJson && typeof template.requestJson === "object" && !Array.isArray(template.requestJson)
    ? structuredClone(template.requestJson)
    : {};
  const model = resolvePlatformModelId(configured.model || template.model, template.type);
  const params = {
    ...(Object.keys(configured).length ? configured : { ...(template.params || {}), model }),
    ...(overrides && typeof overrides === "object" && !Array.isArray(overrides) ? overrides : {}),
  };
  params.model = resolvePlatformRequestModel(params.model || model, model, template.type);
  if (prompt && !params.prompt) params.prompt = prompt;
  if (params.ratio && !params.aspect_ratio) {
    params.aspect_ratio = params.ratio;
  }
  if ((model === "bytedance/seedance-2.0/fast/image-to-video" || model === "bytedance/seedance-2.0/fast/text-to-video") && !params.resolution) {
    params.resolution = "720p";
  }
  if (template.negativePrompt && !params.negative_prompt) params.negative_prompt = template.negativePrompt;
  const safeParams = sanitizePlatformPayloadParamsForModel(model, params, template.type);
  const replacedParams = replacePlatformPayloadImages(safeParams, imageUrl);
  return {
    model,
    params: replacedParams,
    channel: null,
  };
}

function platformUploadDigest(dataUrl = "") {
  return crypto.createHash("sha256").update(String(dataUrl || "")).digest("hex");
}

function platformDeterministicAssetId(taskId = "", uploadSha256 = "") {
  if (!taskId || !uploadSha256) return "";
  const digest = crypto.createHash("sha256")
    .update(`${taskId}\0${uploadSha256}`)
    .digest("hex")
    .slice(0, 24);
  return `asset-${digest}`;
}

function sendRequestIdempotencyResult(res, result) {
  const headers = result?.headers && typeof result.headers === "object" ? result.headers : {};
  for (const [name, value] of Object.entries(headers)) {
    if (value !== undefined && value !== null && !res.headersSent) res.setHeader(name, String(value));
  }
  return sendJson(res, Number(result?.statusCode) || 200, result?.payload || {});
}

function platformGenerationRecordInput({
  taskId,
  auth,
  template,
  prompt,
  imageUrl,
  userAsset,
  upstreamPayload,
  pricingEstimate,
  preDeductedCredits,
}) {
  return storageGenerationRecord({
    taskId,
    status: "submitting",
    awaitingUpstreamTask: true,
    model: upstreamPayload.model,
    provider: "apiz",
    source: "platform-template",
    kind: platformRecordKind(template),
    templateId: template.id,
    templateTitle: template.title,
    userId: auth.user.id,
    userAssetId: userAsset?.id || "",
    imageUrl,
    prompt,
    finalPrompt: prompt,
    params: upstreamPayload.params,
    upstreamPayload,
    preDeductedCredits,
    originalPreDeductedCredits: pricingEstimate.originalCredits,
    userPricingMultiplier: pricingEstimate.userPricingMultiplier,
    pricingEstimate: {
      source: pricingEstimate.source,
      pricing: pricingEstimate.pricing || null,
      baseCredits: pricingEstimate.baseCredits ?? null,
      originalCredits: pricingEstimate.originalCredits ?? null,
      userPricingMultiplier: pricingEstimate.userPricingMultiplier ?? 1,
      markup: pricingEstimate.markup ?? GENERATION_PRICE_MARKUP,
    },
    finalCredits: null,
    billingStatus: preDeductedCredits > 0 ? "pre_deducted" : "free",
    billingSettledAt: "",
    billingError: "",
    createResponse: null,
    createReportedCredits: null,
    remoteVideoUrl: "",
    localVideoUrl: "",
    error: "",
    apiTokenId: auth.tokenRecord?.id || "",
    apiTokenName: auth.tokenRecord?.name || "",
    apiTokenType: auth.tokenRecord?.quotaType || "",
    apiTokenSource: auth.tokenSource || "",
    createdAt: new Date().toISOString(),
  });
}

function platformGenerationJobInput({
  taskId,
  userId,
  template,
  prompt,
  imageUrl,
  userAssetId,
  upstreamPayload,
  pricingEstimate,
  preDeductedCredits,
}) {
  return {
    taskId,
    userId,
    templateId: template.id,
    templateTitle: template.title,
    templateType: template.type,
    prompt,
    imageUrl,
    userAssetId: userAssetId || "",
    upstreamPayload,
    pricingEstimate,
    preDeductedCredits,
  };
}
