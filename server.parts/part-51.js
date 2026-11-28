async function executeStoryAnalysisJob({ projectId, ownerUserId, input }) {
  const [project, scripts, episodes] = await Promise.all([
    getStoryProjectFromDb({ id: projectId, ownerUserId }),
    listStoryScriptVersionsFromDb({ projectId, ownerUserId }),
    listStoryEpisodesFromDb({ projectId, ownerUserId }),
  ]);
  const script = scripts?.find((item) => item.id === input.scriptVersionId);
  if (!project || !script) throw Object.assign(new Error("来源剧本已删除。"), { code: "STORY_SCRIPT_REQUIRED" });
  const result = await analyzeStoryScript({
    project, script, targetEpisodes: input.targetEpisodes, targetDurationSeconds: input.targetDurationSeconds,
    targetEpisode: episodes?.find((episode) => episode.id === script.targetEpisodeId) || null,
    startEpisodeNo: storyStartEpisodeNoForScript(script, episodes || []),
  });
  return { scriptVersionId: script.id, ...result };
}

async function executeStoryAssetPlanJob(job) {
  const { projectId, episodeId, ownerUserId } = job;
  const [project, episodes, shots] = await Promise.all([
    getStoryProjectFromDb({ id: projectId, ownerUserId }),
    listStoryEpisodesFromDb({ projectId, ownerUserId }),
    listStoryShotsFromDb({ projectId, episodeId, ownerUserId }),
  ]);
  const episode = episodes?.find((item) => item.id === episodeId);
  if (!project || !episode || !shots?.length) {
    throw Object.assign(new Error("本集分镜不存在，请先生成分镜。"), { code: "STORY_ASSETS_REQUIRE_SHOTS" });
  }
  return saveStoryEpisodeAssetPlan({ project, episode, shots, ownerUserId, onRepair: () => reportStoryJobPhase(job, "asset-repair", { shots: shots.length }) });
}

function storyCharacterBase(asset, assets, variants) {
  if (asset?.kind !== "character") return null;
  const key = storyAssetCharacterName(asset);
  if (!key) return null;
  const group = assets.filter((item) => item.kind === "character" && storyAssetCharacterName(item) === key);
  const pinned = group.find((item) => item.metadata?.characterBaseVariantId);
  if (pinned) {
    const variant = variants.find((item) => item.id === pinned.metadata.characterBaseVariantId && [pinned.id, pinned.metadata.approvedSourceAssetId].includes(item.assetId));
    if (variant) return { asset: pinned, variant };
  }
  const approved = group
    .filter((item) => storyAssetDesignReady(item, variants))
    .sort((a, b) => String(a.metadata?.approvedAt || a.createdAt).localeCompare(String(b.metadata?.approvedAt || b.createdAt)));
  return approved.length ? { asset: approved[0], variant: storyApprovedVariantForAsset(approved[0], variants) } : null;
}

async function storyVariantImageInput(variant, ownerUserId) {
  const metadata = variant?.metadata || {};
  const ids = [metadata.resultAssetId, ...(Array.isArray(metadata.resultAssetIds) ? metadata.resultAssetIds : []),
    metadata.userAssetId, metadata.assetId].filter(Boolean);
  for (const id of new Set(ids)) {
    const asset = await getUserAssetFromDb(id);
    if (asset?.userId === ownerUserId && !isSoftDeleted(asset)) return { assetId: asset.id };
  }
  const record = metadata.generationRecordId ? await getGenerationRecordFromDb(metadata.generationRecordId) : null;
  const url = record?.userId === ownerUserId
    ? record.cdnImageUrl || record.imageResultUrl || record.imageUrl || record.resultImageUrl || metadata.imageUrl
    : metadata.imageUrl;
  if (isPublicHttpUrl(url)) return { url };
  throw Object.assign(new Error("定稿图片暂时没有可用的参考素材，请重新加入资产库。"), { code: "STORY_IMAGE_REFERENCE_MISSING" });
}

function storyFrameReferenceLimit(model) {
  if (model.id === "qwen-image3") return QWEN_IMAGE3_REFERENCE_LIMIT;
  if (model.id === "seedream55-image") return SEEDREAM55_REFERENCE_LIMIT;
  return ADVANCED_SEEDANCE_REFERENCE_LIMIT;
}

function storyFrameAssetSelection(episode, shot, assets, variants) {
  const relevant = assets.filter((asset) => ["character", "scene", "prop"].includes(asset.kind)
    && storyAssetBelongsToEpisode(asset, episode) && storyShotUsesAsset(asset, shot));
  if (!relevant.length || relevant.some((asset) => !storyAssetDesignReady(asset, variants))) {
    throw Object.assign(new Error("请先定稿本镜的角色、场景和关键道具图片。"), { statusCode: 409, code: "STORY_FRAME_ASSETS_NOT_READY" });
  }
  return relevant.map((asset) => ({ asset, variant: storyApprovedVariantForAsset(asset, variants) }));
}

async function executeStoryImageJob({ id, projectId, episodeId, ownerUserId, kind, input }) {
  const [existing, user, episodes, assets, variants] = await Promise.all([
    getPool().query(`SELECT task_id, payload FROM app_generation_records
      WHERE payload->>'userId' = $1 AND payload->'params'->>'storyJobId' = $2 LIMIT 1`, [ownerUserId, id]),
    getUserByIdInDb(ownerUserId),
    listStoryEpisodesFromDb({ projectId, ownerUserId }),
    listStoryAssetsFromDb({ projectId, ownerUserId }),
    listStoryAssetVariantsFromDb({ projectId, ownerUserId }),
  ]);
  const existingRecord = existing.rows[0];
  if (existingRecord) {
    const record = existingRecord.payload;
    if (record.status === "failed") {
      throw Object.assign(new Error(record.error || "设计图任务提交失败，请重试。"), { code: "STORY_IMAGE_SUBMIT_FAILED" });
    }
    return { taskId: existingRecord.task_id };
  }
  const episode = episodes?.find((item) => item.id === episodeId);
  const asset = assets?.find((item) => item.id === input.assetId);
  const model = STORY_IMAGE_MODELS.find((item) => item.id === input.model);
  const frame = kind === "frame";
  if (!user || !episode || !model || (!frame && (!asset || !storyAssetBelongsToEpisode(asset, episode)))) {
    throw Object.assign(new Error("资产、分集或出图模型已变化，请重新提交。"), { code: "STORY_IMAGE_JOB_INVALID" });
  }
  let basePrompt = String(asset?.metadata?.imagePrompt || asset?.description || "").trim();
  let references = [];
  let sourceVariantIds = [];
  if (frame) {
    const [shots, project] = await Promise.all([
      listStoryShotsFromDb({ projectId, ownerUserId, episodeId }), getStoryProjectFromDb({ id: projectId, ownerUserId }),
    ]);
    const shot = shots?.find((item) => item.id === input.shotId);
    if (!shot || !project) throw Object.assign(new Error("分镜已变化，请刷新后重试。"), { code: "STORY_FRAME_SHOT_MISSING" });
    const selected = storyFrameAssetSelection(episode, shot, assets || [], variants || []);
    if (selected.length > storyFrameReferenceLimit(model)) throw Object.assign(new Error("本镜参考图超出当前出图模型上限，请切换出图模型。"), { code: "STORY_FRAME_REFERENCE_LIMIT" });
    sourceVariantIds = selected.map(({ variant }) => variant.id).sort();
    references = await Promise.all(selected.map(({ variant }) => storyVariantImageInput(variant, ownerUserId)));
    basePrompt = [
      "生成一张写实影视镜头的首帧。按参考图保留角色身份、当前造型、场景布局和关键道具。",
      "画面是动作开始时的单帧。保持角色外貌与服装一致，不拼贴，不出现字幕或设计稿标注。",
      `画幅：${project.aspectRatio || "9:16"}。地点：${shot.metadata?.location || ""}。`,
      `构图：${shot.metadata?.shotSize || ""}。${shot.metadata?.camera || ""}。`,
      `镜头描述：${shot.description || shot.title}。`,
      ...selected.map(({ asset }, index) => `参考图 ${index + 1}：${asset.name}。`),
    ].join("\n");
    input = { ...input, ratio: project.aspectRatio || "9:16" };
  } else {
    const base = storyCharacterBase(asset, assets || [], variants || []);
    if (!base && asset.kind === "character") {
      const related = (assets || []).filter((item) => item.kind === "character" && item.id !== asset.id
        && storyAssetCharacterName(item) === storyAssetCharacterName(asset));
      if ((variants || []).some((variant) => related.some((item) => item.id === variant.assetId)
        && ["generating", "ready"].includes(variant.status))) {
        throw Object.assign(new Error("先确认该角色已生成的基准形象，再生成其他造型。"), { code: "STORY_CHARACTER_BASE_PENDING" });
      }
    }
    if (base) {
      references = [await storyVariantImageInput(base.variant, ownerUserId)];
      sourceVariantIds = [base.variant.id];
      basePrompt = `图 1 是角色的定稿身份参考。保留五官、肤色、年龄感、体型和人物辨识度；按以下要求改变本镜造型。\n${basePrompt}`;
    }
    if (asset.kind === "scene") basePrompt = `${basePrompt}\n输出可复用的空场景设计图。画面不出现人物。`;
  }
  if (!basePrompt) throw Object.assign(new Error("资产缺少出图描述。"), { code: "STORY_IMAGE_JOB_INVALID" });
  const handlers = {
    "qwen-image3": handleAdvancedQwenImage3Generate,
    "seedream55-image": handleAdvancedSeedream55ImageGenerate,
    "seedream5-image": handleAdvancedSeedream5ImageGenerate,
  };
  const prompt = [basePrompt, input.revisionFeedback ? `本次重新生成的修改要求：${input.revisionFeedback}` : ""]
    .filter(Boolean).join("\n\n");
  const body = {
    provider: model.id, prompt, resolution: model.resolution, ratio: input.ratio || model.ratio, duration: 1,
    ...(references.length ? { referenceImages: references } : {}),
    params: { createKind: frame ? "story-frame" : "story-asset", projectId, episodeId, storyAssetId: asset?.id,
      shotId: input.shotId, sourceVariantIds,
      storyImageModel: model.id, storyJobId: id, revisionFeedback: input.revisionFeedback },
  };
  // Reuse the provider's billing, validation and durable submission path.
  let statusCode = 500;
  let result;
  const response = {
    writeHead(code) { statusCode = code; },
    end(json) { result = JSON.parse(json); },
  };
  try {
    await handlers[model.id]({ method: "POST", url: "/api/advanced/generate", headers: {}, socket: {} }, response, {
      auth: { user, db: { ...lightweightAuthDb(), users: [user] } }, body, bodyParams: body.params, prompt,
    });
  } catch (error) {
    const message = error.message === "User not found for billing."
      ? "计费初始化失败，图片任务未提交。请重试。" : error.message || "设计图任务提交失败。";
    await failUnsubmittedStoryImageInDb({ jobId: id, userId: ownerUserId, message }).catch((failure) => {
      console.error("[story-image-submit-cleanup-failed]", id, failure.message);
    });
    throw Object.assign(new Error(message), { code: error.code || "STORY_IMAGE_SUBMIT_FAILED" });
  }
  if (statusCode >= 400 || !result?.taskId) {
    throw Object.assign(new Error(result?.message || "设计图任务提交失败。"), { code: result?.code || "STORY_IMAGE_SUBMIT_FAILED" });
  }
  return { taskId: result.taskId };
}

async function handleQueueStoryAssetImages(req, res, projectId, episodeId) {
  if (requestTenantDescriptor(req).toolOnly) return sendJson(res, 404, { ok: false, message: "API not found." });
  const auth = await requireAdmin(req, res, { loadDb: false });
  if (!auth) return;
  if (!await enforceBusinessRateLimit(req, res, auth, { action: "story_asset_image_batch", limit: 10, windowMs: 10 * 60_000 })) return;
  const body = await readJson(req, 128 * 1024);
  const model = STORY_IMAGE_MODELS.find((item) => item.id === body.model);
  const assetIds = [...new Set(storyTextList(body.assetIds, 80, 120))];
  const episodes = await listStoryEpisodesFromDb({ projectId, ownerUserId: auth.user.id });
  const episode = episodes?.find((item) => item.id === episodeId);
  if (!model || !assetIds.length || !episode) return sendJson(res, 400, { ok: false, message: "请选择本集资产和出图模型。" });
  const assets = await listStoryAssetsFromDb({ projectId, ownerUserId: auth.user.id });
  if (assetIds.some((assetId) => !assets?.some((asset) => asset.id === assetId && storyAssetBelongsToEpisode(asset, episode)))) {
    return sendJson(res, 409, { ok: false, message: "本集资产已变化，请刷新。" });
  }
  const variants = await listStoryAssetVariantsFromDb({ projectId, ownerUserId: auth.user.id });
  const waitingForBase = new Set();
  const anchors = new Set();
  const inputs = [];
  for (const assetId of assetIds) {
    const asset = assets.find((item) => item.id === assetId);
    const key = asset.kind === "character" ? storyAssetCharacterName(asset) : "";
    if (key && !storyCharacterBase(asset, assets, variants || [])) {
      const relatedInProgress = (variants || []).some((variant) => ["generating", "ready"].includes(variant.status)
        && variant.assetId !== assetId && assets.some((item) => item.id === variant.assetId && item.kind === "character"
          && storyAssetCharacterName(item) === key));
      if (anchors.has(key) || relatedInProgress) {
        waitingForBase.add(key);
        continue;
      }
      anchors.add(key);
    }
    inputs.push({ assetId, model: model.id, revisionFeedback: storyInputText(body.revisionFeedback, 4000) });
  }
  if (!inputs.length && waitingForBase.size) {
    return sendJson(res, 409, { ok: false, code: "STORY_CHARACTER_BASE_PENDING",
      message: `请先定稿 ${[...waitingForBase].join("、")} 已生成的基准形象，再生成其他造型。` });
  }
  const jobs = await enqueueStoryBackgroundJobInDb({ projectId, episodeId, ownerUserId: auth.user.id, kind: "image", inputs });
  if (!jobs?.length) return sendJson(res, 503, { ok: false, message: "设计图任务未保存，请重试。" });
  return sendJson(res, 202, { ok: true, awaitingCharacterBases: [...waitingForBase], jobs: jobs.map((job) => ({ id: job.id, status: job.status })) });

}

async function handleStoryShotFrame(req, res, projectId, episodeId, shotId) {
  if (requestTenantDescriptor(req).toolOnly) return sendJson(res, 404, { ok: false, message: "API not found." });
  const auth = await requireAdmin(req, res, { loadDb: false });
  if (!auth) return;
  const ownerUserId = auth.user.id;
  const body = await readJson(req, 128 * 1024);
  const [episodes, shots, assets, variants] = await Promise.all([
    listStoryEpisodesFromDb({ projectId, ownerUserId }),
    listStoryShotsFromDb({ projectId, episodeId, ownerUserId }),
    listStoryAssetsFromDb({ projectId, ownerUserId }),
    listStoryAssetVariantsFromDb({ projectId, ownerUserId }),
  ]);
  const episode = episodes?.find((item) => item.id === episodeId);
  const shot = shots?.find((item) => item.id === shotId);
  if (!episode || !shot) return sendJson(res, 404, { ok: false, message: "分镜不存在。" });
  if (req.method === "PUT" && body.frameId === "") {
    await getPool().query(
      `UPDATE app_story_shots s SET metadata = s.metadata - 'approvedFrameRefId', updated_at = NOW()
       FROM app_story_projects p WHERE s.id=$1 AND s.episode_id=$2 AND s.project_id=$3
       AND p.id=s.project_id AND p.owner_user_id=$4`, [shotId, episodeId, projectId, ownerUserId],
    );
    return sendJson(res, 200, { ok: true, approvedFrameRefId: "" });
  }
  try {
    const selected = storyFrameAssetSelection(episode, shot, assets || [], variants || []);
    if (req.method === "POST") {
      if (!await enforceBusinessRateLimit(req, res, auth, { action: "story_asset_image_batch", limit: 10, windowMs: 10 * 60_000 })) return;
      const model = STORY_IMAGE_MODELS.find((item) => item.id === body.model);
      if (!model) return sendJson(res, 400, { ok: false, message: "请选择出图模型。" });
      if (selected.length > storyFrameReferenceLimit(model)) return sendJson(res, 409, { ok: false, message: "本镜参考图超出当前出图模型上限，请切换出图模型。" });
      const jobs = await enqueueStoryBackgroundJobInDb({
        projectId, episodeId, ownerUserId, kind: "frame",
        inputs: [{ shotId, model: model.id, revisionFeedback: storyInputText(body.revisionFeedback, 4000) }],
      });
      if (!jobs?.length) return sendJson(res, 503, { ok: false, message: "首帧任务未保存，请重试。" });
      return sendJson(res, 202, { ok: true, job: { id: jobs[0].id, status: jobs[0].status } });
    }
    const refs = await listStoryGenerationRefsFromDb({ projectId, ownerUserId });
    const ref = refs?.find((item) => item.id === body.frameId && item.shotId === shotId && item.kind === "frame"
      && item.status === "succeeded" && item.metadata?.imageUrl);
    const sourceIds = selected.map(({ variant }) => variant.id).sort();
    if (!ref || JSON.stringify(ref.metadata.sourceVariantIds) !== JSON.stringify(sourceIds)) {
      return sendJson(res, 409, { ok: false, message: "首帧尚未就绪，或定稿参考图已变化。请重新生成首帧。" });
    }
    const { rows } = await getPool().query(
      `UPDATE app_story_shots s SET metadata = s.metadata || jsonb_build_object('approvedFrameRefId', $5::text), updated_at = NOW()
       FROM app_story_projects p WHERE s.id=$1 AND s.episode_id=$2 AND s.project_id=$3
       AND p.id=s.project_id AND p.owner_user_id=$4 RETURNING s.id`,
      [shotId, episodeId, projectId, ownerUserId, ref.id],
    );
    if (!rows.length) return sendJson(res, 404, { ok: false, message: "分镜不存在。" });
    return sendJson(res, 200, { ok: true, approvedFrameRefId: ref.id });
  } catch (error) {
    if (!error.statusCode) throw error;
    return sendJson(res, error.statusCode, { ok: false, code: error.code, message: error.message });
  }
}

async function reportStoryJobPhase(job, phase, counts = {}) {
  try {
    await getPool().query(
      `UPDATE app_story_shot_plan_jobs
       SET result = COALESCE(result, '{}'::jsonb) || jsonb_build_object('progress', $3::jsonb), updated_at = NOW()
       WHERE id = $1 AND claim_token = $2 AND status = 'media_processing'`,
      [job.id, job.claimToken, JSON.stringify({ phase, ...counts })],
    );
  } catch (error) {
    console.warn("[story-job-progress]", job.id, error.message);
  }
}

async function executeStoryShotPlanJob(job = {}) {
  const projectId = String(job.projectId || "").trim();
  const episodeId = String(job.episodeId || "").trim();
  const ownerUserId = String(job.ownerUserId || "").trim();
  if (!projectId || !episodeId || !ownerUserId) {
    throw Object.assign(new Error("AI 分镜任务参数不完整。"), { statusCode: 400, code: "STORY_SHOT_PLAN_JOB_INVALID" });
  }
  const project = await getStoryProjectFromDb({ id: projectId, ownerUserId });
  if (!project) {
    throw Object.assign(new Error("剧集项目不存在。"), { statusCode: 404, code: "STORY_PROJECT_NOT_FOUND" });
  }
  const episodes = await listStoryEpisodesFromDb({ projectId, ownerUserId });
  const episode = (episodes || []).find((item) => item.id === episodeId);
  if (!episode) {
    throw Object.assign(new Error("剧集不存在。"), { statusCode: 404, code: "STORY_EPISODE_NOT_FOUND" });
  }
  let result;
  let saved;
  if (episode.metadata?.shotPlanJobId === job.id) {
    const shots = await listStoryShotsFromDb({ projectId, ownerUserId, episodeId });
    saved = { episode, shots: shots || [] };
    result = {};
    if (episode.metadata.assetsPlannedAt) {
      const assets = await listStoryAssetsFromDb({ projectId, ownerUserId });
      return { ...saved, assetPlan: { count: (assets || []).filter((asset) => storyAssetBelongsToEpisode(asset, episode)).length } };
    }
  } else {
    if (!["outline_locked", "shots_planned"].includes(String(episode.status || ""))) {
      throw Object.assign(new Error("请先锁定本集大纲，再由 AI 拆分镜。"), { statusCode: 409, code: "STORY_OUTLINE_NOT_LOCKED" });
    }
    const scripts = await listStoryScriptVersionsFromDb({ projectId, ownerUserId });
    const sourceScript = (scripts || []).find((script) => script.id === episode.sourceScriptVersionId || (!episode.sourceScriptVersionId && script.manuscriptId === episode.sourceManuscriptId)) || {};
    result = await planStoryEpisodeShots({ project, episode, sourceScript, onPhase: (phase) => reportStoryJobPhase(job, phase) });
    await reportStoryJobPhase(job, "save-shots", { shots: result.shots.length });
    const metadata = { ...(episode.metadata || {}), assetsPlannedAt: null, shotPlanJobId: job.id };
    if (result.hook) metadata.hook = result.hook;
    if (result.audit) metadata.shotPlanAudit = result.audit;
    const episodePatch = { status: "shots_planned", metadata };
    if (Number(episode.durationSeconds || 0) <= 0 && Number(result.recommendedDurationSeconds || 0) > 0) {
      episodePatch.durationSeconds = result.recommendedDurationSeconds;
      metadata.durationBasis = `按 AI 分镜节点计算：共 ${result.shots.length} 个镜头，总时长 ${result.recommendedDurationSeconds} 秒。`;
    }
    saved = await replaceStoryShotsInDb({
      projectId,
      episodeId,
      ownerUserId,
      shots: result.shots,
      episodePatch,
    });
    if (!saved) {
      throw Object.assign(new Error("分镜保存失败。"), { statusCode: 503, code: "DATABASE_UNAVAILABLE" });
    }
  }
  let assetPlan;
  await reportStoryJobPhase(job, "assets", { shots: saved.shots.length });
  try {
    const planned = await saveStoryEpisodeAssetPlan({ project, episode: saved.episode, shots: saved.shots, ownerUserId,
      onRepair: () => reportStoryJobPhase(job, "asset-repair", { shots: saved.shots.length }) });
    saved.episode = planned.episode;
    assetPlan = { count: planned.assets.length };
  } catch (error) {
    assetPlan = { errorCode: error.code || "STORY_ASSET_PLAN_FAILED", errorMessage: error.message || String(error) };
    console.warn("[story-asset-plan-failed]", JSON.stringify({ projectId, episodeId, code: assetPlan.errorCode }));
  }
  return {
    model: result.model,
    attempts: result.attempts,
    episode: saved.episode,
    shots: saved.shots,
    assetPlan,
  };
}

const STORY_SHOT_PLAN_JOB_LEASE_MS = 30 * 60 * 1000;
const STORY_SHOT_PLAN_WORKER_INTERVAL_MS = 1500;
let storyShotPlanWorkerTimer = null;
let storyShotPlanWorkerKickoffTimer = null;
let storyShotPlanWorkerRunning = false;

async function processStoryShotPlanQueue(limit = 1) {
  const claimToken = `story-shot-plan-${process.pid}-${crypto.randomUUID()}`;
  const claimed = await claimNextStoryShotPlanJobsInDb({ limit, leaseMs: STORY_SHOT_PLAN_JOB_LEASE_MS, claimToken });
  const results = [];
  for (const job of claimed.jobs || []) {
    const startedAt = Date.now();
    try {
      const execute = { analysis: executeStoryAnalysisJob, assets: executeStoryAssetPlanJob, image: executeStoryImageJob, frame: executeStoryImageJob, prompt: executeStoryPromptJob, shots: executeStoryShotPlanJob }[job.kind];
      if (job.kind !== "shots") await reportStoryJobPhase(job, job.kind);
      const result = await execute(job);
      const completed = await completeStoryShotPlanJobInDb({ id: job.id, claimToken, result });
      results.push({ id: job.id, status: completed?.status || "completed", elapsedMs: Date.now() - startedAt });
      console.info("[story-shot-plan-job-complete]", JSON.stringify({
        jobId: job.id,
        kind: job.kind,
        projectId: job.projectId,
        episodeId: job.episodeId,
        shotCount: result.shots?.length || 0,
        attempts: job.attempts,
        elapsedMs: Date.now() - startedAt,
      }));
    } catch (error) {
      await failStoryShotPlanJobInDb({
        id: job.id,
        claimToken,
        code: error.code || "STORY_SHOT_PLAN_FAILED",
        message: error.message || String(error),
      }).catch((failureError) => {
        console.error("[story-shot-plan-job-fail-persist-error]", job.id, failureError.message || failureError);
      });
      results.push({ id: job.id, status: "failed", code: error.code || "", elapsedMs: Date.now() - startedAt });
      console.warn("[story-shot-plan-job-failed]", JSON.stringify({
        jobId: job.id,
        kind: job.kind,
        projectId: job.projectId,
        episodeId: job.episodeId,
        code: error.code || "",
        statusCode: error.statusCode || 0,
        message: String(error.message || error).slice(0, 240),
        elapsedMs: Date.now() - startedAt,
      }));
    }
  }
  return { claimed: claimed.jobs?.length || 0, results };
}

async function runStoryShotPlanWorkerTick(reason = "timer") {
  if (storyShotPlanWorkerRunning) return { skipped: true };
  storyShotPlanWorkerRunning = true;
  try {
    return await runWithSchedulerLease("story-shot-plan-worker", async () => {
      const result = await processStoryShotPlanQueue(1);
      if (result.claimed) console.info("[story-shot-plan-worker]", JSON.stringify({ reason, ...result }));
      return result;
    }, {
      connect: () => getSchedulerPool().connect(),
      onError: (error) => console.error("[story-shot-plan-worker-lease-failed]", error.message || error),
    });
  } finally {
    storyShotPlanWorkerRunning = false;
  }
}

function startStoryShotPlanWorker() {
  if (storyShotPlanWorkerTimer) return true;
  storyShotPlanWorkerKickoffTimer = setTimeout(() => runStoryShotPlanWorkerTick("startup"), 1200);
  storyShotPlanWorkerKickoffTimer.unref?.();
  storyShotPlanWorkerTimer = setInterval(() => runStoryShotPlanWorkerTick("timer"), STORY_SHOT_PLAN_WORKER_INTERVAL_MS);
  storyShotPlanWorkerTimer.unref?.();
  return true;
}

function stopStoryShotPlanWorker() {
  if (storyShotPlanWorkerKickoffTimer) clearTimeout(storyShotPlanWorkerKickoffTimer);
  if (storyShotPlanWorkerTimer) clearInterval(storyShotPlanWorkerTimer);
  storyShotPlanWorkerKickoffTimer = null;
  storyShotPlanWorkerTimer = null;
}

function storyAssetCharacterName(asset = {}) {
  const metadata = asset.metadata && typeof asset.metadata === "object" ? asset.metadata : {};
  return storyInputText(metadata.characterKey || asset.name || "", 120).split(/[·｜|_/—\-]/)[0].trim();
}

function storyAssetHasShotNo(asset = {}, shotNo = 0) {
  return storyTextList(asset.metadata?.shotNos || [], 80, 24)
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item))
    .includes(Number(shotNo));
}

function storyAssetKnownCharacter(asset = {}, characterNames = []) {
  const metadata = asset.metadata && typeof asset.metadata === "object" ? asset.metadata : {};
  const values = [metadata.characterKey, asset.name].map((item) => storyInputText(item || "", 200));
  return characterNames.find((name) => values.some((value) => value === name || value.includes(name))) || "";
}

const STORY_CHARACTER_SURNAME_PINYIN = {
  白: "bai", 高: "gao", 李: "li", 王: "wang", 张: "zhang", 刘: "liu", 陈: "chen", 杨: "yang",
  赵: "zhao", 黄: "huang", 周: "zhou", 吴: "wu", 徐: "xu", 孙: "sun", 胡: "hu", 朱: "zhu",
  马: "ma", 郭: "guo", 林: "lin", 何: "he", 罗: "luo", 郑: "zheng", 梁: "liang", 谢: "xie",
  宋: "song", 唐: "tang", 许: "xu", 韩: "han", 冯: "feng", 邓: "deng", 曹: "cao", 彭: "peng",
  曾: "zeng", 肖: "xiao", 田: "tian", 董: "dong", 袁: "yuan", 潘: "pan", 蔡: "cai", 蒋: "jiang",
  余: "yu", 于: "yu", 杜: "du", 叶: "ye", 程: "cheng", 魏: "wei", 苏: "su", 吕: "lv",
  丁: "ding", 任: "ren", 沈: "shen", 姚: "yao", 卢: "lu", 姜: "jiang", 崔: "cui", 钟: "zhong",
  谭: "tan", 陆: "lu", 汪: "wang", 范: "fan", 金: "jin", 石: "shi", 廖: "liao", 贾: "jia",
  夏: "xia", 韦: "wei", 傅: "fu", 方: "fang", 邹: "zou", 孟: "meng", 熊: "xiong", 秦: "qin",
  邱: "qiu", 江: "jiang", 尹: "yin", 薛: "xue", 闫: "yan", 段: "duan", 雷: "lei", 侯: "hou",
  龙: "long", 史: "shi", 陶: "tao", 黎: "li", 贺: "he", 顾: "gu", 毛: "mao", 郝: "hao",
  龚: "gong", 邵: "shao", 万: "wan", 钱: "qian", 严: "yan", 覃: "qin", 武: "wu", 戴: "dai",
};

function storyLatinCharacterKeySurname(asset = {}) {
  const metadata = asset.metadata && typeof asset.metadata === "object" ? asset.metadata : {};
  const key = storyInputText(metadata.characterKey || asset.name || "", 200).toLowerCase();
  return key.match(/^[a-z]+/)?.[0] || "";
}

function inferStoryAssetCharacter(asset = {}, shots = [], characterNames = []) {
  const direct = storyAssetKnownCharacter(asset, characterNames);
  if (direct) return { characterName: direct, method: "explicit" };
  const latinSurname = storyLatinCharacterKeySurname(asset);
  if (latinSurname) {
    const pinyinMatches = characterNames.filter((name) => STORY_CHARACTER_SURNAME_PINYIN[name[0]] === latinSurname);
    if (pinyinMatches.length === 1) return { characterName: pinyinMatches[0], method: "pinyin_surname" };
  }
  const shotNos = new Set(storyTextList(asset.metadata?.shotNos || [], 80, 24).map((item) => Number(item)).filter(Number.isFinite));
  const scores = characterNames.map((characterName) => {
    let occurrences = 0;
    let exclusive = 0;
    for (const shot of shots) {
      if (!shotNos.has(Number(shot.shotNo || 0))) continue;
      const characters = storyTextList(shot.metadata?.characters, 40, 100);
      if (!characters.includes(characterName)) continue;
      occurrences += 1;
      if (characters.length === 1) exclusive += 1;
    }
    return { characterName, occurrences, exclusive };
  }).filter((item) => item.occurrences > 0)
    .sort((a, b) => b.exclusive - a.exclusive || b.occurrences - a.occurrences || a.characterName.localeCompare(b.characterName));
  if (!scores.length) return { characterName: "", method: "unbound" };
  if (scores.length > 1 && scores[0].exclusive === scores[1].exclusive && scores[0].occurrences === scores[1].occurrences) {
    return { characterName: "", method: "ambiguous" };
  }
  return { characterName: scores[0].characterName, method: "shot_cooccurrence" };
}

function normalizeStoryAssetCharacterBindings({ shots = [], assets = [] } = {}) {
  const characterNames = [...new Set(shots.flatMap((shot) => storyTextList(shot.metadata?.characters, 40, 100)))];
  const bound = [];
  const unbound = [];
  for (const asset of assets.filter((item) => item.kind === "character")) {
    const inferred = inferStoryAssetCharacter(asset, shots, characterNames);
    if (!inferred.characterName) {
      unbound.push({ assetName: asset.name, reason: inferred.method });
      continue;
    }
    const metadata = asset.metadata && typeof asset.metadata === "object" ? asset.metadata : {};
    metadata.characterKey = inferred.characterName;
    metadata.shotNos = storyTextList(metadata.shotNos || [], 80, 24)
      .map((item) => Number(item))
      .filter((shotNo) => shots.some((shot) => Number(shot.shotNo || 0) === shotNo
        && storyTextList(shot.metadata?.characters, 40, 100).includes(inferred.characterName)))
      .filter((shotNo, index, list) => list.indexOf(shotNo) === index)
      .sort((a, b) => a - b);
    asset.metadata = metadata;
    bound.push({ assetName: asset.name, characterName: inferred.characterName, method: inferred.method });
  }
  return { assets, audit: { bound, unbound, characterNames, complete: unbound.length === 0 } };
}

function auditStoryAssetCharacterCoverage({ shots = [], assets = [] } = {}) {
  const missing = [];
  const conflicts = [];
  for (const shot of shots) {
    const shotNo = Number(shot.shotNo || 0);
    for (const characterName of new Set(storyTextList(shot.metadata?.characters, 40, 100))) {
      const matches = assets.filter((asset) => asset.kind === "character"
        && asset.metadata?.characterKey === characterName
        && String(asset.metadata?.stateLabel || "").trim()
        && storyAssetHasShotNo(asset, shotNo));
      if (!matches.length) missing.push({ shotNo, characterName });
      if (matches.length > 1) conflicts.push({ shotNo, characterName });
    }
  }
  return { missing, conflicts, complete: !missing.length && !conflicts.length };
}

function storyAssetLocationText(value = "") {
  return storyInputText(value, 200).replace(/[·｜|_/—\-]/g, "").replace(/内景|外景|场景|室内|室外/g, "").trim();
}

function storySceneMatchesLocation(asset = {}, location = "") {
  const target = storyAssetLocationText(location);
  const key = storyAssetLocationText(asset.metadata?.locationKey || "");
  const name = storyAssetLocationText(asset.name || "");
  if (!target) return false;
  if (key && (target === key || target.includes(key) || key.includes(target))) return true;
  if (!name) return false;
  return target === name || target.includes(name) || name.includes(target);
}

function storyNearestSceneAsset(assets = [], location = "", shotNo = 0) {
  const candidates = assets.filter((asset) => asset.kind === "scene" && storySceneMatchesLocation(asset, location));
  if (!candidates.length) return null;
  const ranked = candidates.map((asset) => {
    const shotNos = storyTextList(asset.metadata?.shotNos || [], 80, 24)
      .map((item) => Number(item))
      .filter((item) => Number.isFinite(item));
    const previousDistance = shotNos.filter((item) => item <= Number(shotNo)).map((item) => Number(shotNo) - item);
    const distances = shotNos.map((item) => Math.abs(item - Number(shotNo)));
    return {
      asset,
      previous: previousDistance.length ? Math.min(...previousDistance) : Number.MAX_SAFE_INTEGER,
      distance: distances.length ? Math.min(...distances) : Number.MAX_SAFE_INTEGER,
    };
  });
  return ranked.filter((item) => item.previous !== Number.MAX_SAFE_INTEGER).sort((a, b) => a.previous - b.previous)[0]?.asset
    || ranked.sort((a, b) => a.distance - b.distance)[0]?.asset
    || null;
}

function repairStoryAssetSceneCoverage({ shots = [], assets = [] } = {}) {
  const repaired = [];
  const missing = [];
  for (const shot of shots) {
    const shotNo = Number(shot.shotNo || 0);
    const location = storyInputText(shot.metadata?.location || "", 200);
    if (!location) continue;
    const covered = assets.some((asset) => asset.kind === "scene" && storyAssetHasShotNo(asset, shotNo));
    if (covered) continue;
    const asset = storyNearestSceneAsset(assets, location, shotNo);
    if (!asset) {
      missing.push({ shotNo, location });
      continue;
    }
    const metadata = asset.metadata && typeof asset.metadata === "object" ? asset.metadata : {};
    metadata.shotNos = [...new Set([...storyTextList(metadata.shotNos || [], 80, 24), String(shotNo)])]
      .map((item) => Number(item))
      .filter((item) => Number.isFinite(item))
      .sort((a, b) => a - b);
    asset.metadata = metadata;
    repaired.push({ shotNo, location, assetName: asset.name, reason: "matched_scene_location" });
  }
  return { assets, audit: { repaired, missing, complete: missing.length === 0 } };
}

function auditStoryAssetPlan(shots, plannedAssets) {
  const characterBindings = normalizeStoryAssetCharacterBindings({ shots, assets: plannedAssets });
  const characterCoverage = auditStoryAssetCharacterCoverage({ shots, assets: characterBindings.assets });
  const sceneCoverage = repairStoryAssetSceneCoverage({ shots, assets: characterBindings.assets });
  return {
    assets: sceneCoverage.assets,
    coverage: {
      characters: characterCoverage,
      characterBindings: characterBindings.audit,
      scenes: sceneCoverage.audit,
      complete: characterBindings.audit.complete && characterCoverage.complete && sceneCoverage.audit.complete,
    },
  };
}

function mergeStoryCharacterBindingRepairs(assets, repairedAssets, issues) {
  const needsRepair = (characterKey, shotNo) => issues.some((issue) =>
    issue.characterName === characterKey && issue.shotNo === Number(shotNo));
  const merged = assets.flatMap((asset) => {
    if (asset.kind !== "character") return [asset];
    const { characterKey, shotNos = [] } = asset.metadata || {};
    const unaffected = shotNos.filter((shotNo) => !needsRepair(characterKey, shotNo));
    return characterKey && unaffected.length ? [{ ...asset, metadata: { ...asset.metadata, shotNos: unaffected } }] : [];
  });
  for (const asset of repairedAssets) {
    const { characterKey, stateLabel, shotNos = [] } = asset.metadata || {};
    if (asset.kind !== "character" || !characterKey || !stateLabel) continue;
    const repairedShotNos = shotNos.map(Number).filter((shotNo) => needsRepair(characterKey, shotNo));
    if (!repairedShotNos.length) continue;
    const sameLook = merged.find((item) => item.kind === "character"
      && item.metadata?.characterKey === characterKey && item.metadata?.stateLabel === stateLabel)
      || assets.find((item) => item.kind === "character"
        && item.metadata?.characterKey === characterKey && item.metadata?.stateLabel === stateLabel);
    if (sameLook && merged.includes(sameLook)) {
      sameLook.metadata.shotNos = [...new Set([...sameLook.metadata.shotNos, ...repairedShotNos])];
    } else {
      const definition = sameLook || asset;
      merged.push({ ...definition, metadata: { ...definition.metadata, shotNos: [...new Set(repairedShotNos)] } });
    }
  }
  return merged;
}

async function tryRepairStoryAssetCharacterBindings({ plan, shots, shotContext, knownLooks, model, requestContext, usage }) {
  const { missing, conflicts } = plan.coverage.characters;
  const issues = [...missing, ...conflicts];
  if (!issues.length || issues.length > 24) return plan;
  const shotNos = new Set(issues.map((issue) => issue.shotNo));
  const characterNames = new Set(issues.map((issue) => issue.characterName));
  const existingLooks = plan.assets.filter((asset) => asset.kind === "character" && characterNames.has(asset.metadata?.characterKey))
    .map(({ name, description, metadata }) => ({ name, description: String(description || "").slice(0, 500),
      characterKey: metadata.characterKey, stateLabel: metadata.stateLabel, shotNos: metadata.shotNos }));
  try {
    const raw = await promptOptimizerUpstreamRequest({
      model: model.upstreamModel,
      messages: [
        { role: "system", content: STORY_ASSET_PLANNER_SYSTEM_PROMPT },
        { role: "user", content: [
          "你正在修复一个已有资产清单。只输出需要修复的角色资产，不输出场景、道具或其他镜头。",
          "每个待修复的角色和镜号必须有且只有一个明确造型。冲突时根据本镜画面选中唯一造型；换装过程用一个明确起止状态的造型。不得凭相邻镜头盲选。",
          "同一造型沿用已有 stateLabel；不同造型保留角色身份并给出明确描述。",
          `缺失绑定：${JSON.stringify(missing)}`,
          `冲突绑定：${JSON.stringify(conflicts)}`,
          `待修复镜头：${JSON.stringify(shotContext.filter((shot) => shotNos.has(Number(shot.shotNo))))}`,
          `现有造型：${JSON.stringify(existingLooks)}`,
          `项目已知造型：${JSON.stringify(knownLooks.filter((look) => characterNames.has(look.characterKey)))}`,
        ].join("\n") },
      ],
      temperature: 0.1,
      max_tokens: 5000,
    }, {
      deadline: Date.now() + PROMPT_OPTIMIZER_TOTAL_BUDGET_MS,
      requestContext: { ...requestContext, storyAssetBindingRepair: true }, usage, optimizerModel: model,
    });
    const parsed = storyParseJsonObject(qwen37FlashResponseText(raw));
    if (!parsed) return plan;
    const repaired = mergeStoryCharacterBindingRepairs(plan.assets, storyAssetsFromModel(parsed), issues);
    const checked = auditStoryAssetPlan(shots, repaired);
    return checked.coverage.complete ? checked : plan;
  } catch (error) {
    console.warn("[story-asset-binding-repair-failed]", JSON.stringify({ ...requestContext, code: error.code || "", shotNos: [...shotNos] }));
    return plan;
  }
}

async function planStoryEpisodeAssets({ project = {}, episode = {}, shots = [], existingAssets = [], onRepair = async () => {} } = {}) {
  const model = storyAnalyzerModel();
  if (!model) {
    throw Object.assign(new Error("AI 资产设计模型尚未配置。"), { statusCode: 503, code: "MISSING_STORY_ASSET_MODEL" });
  }
  if (!Array.isArray(shots) || !shots.length) {
    throw Object.assign(new Error("请先生成并审核本集分镜。"), { statusCode: 400, code: "STORY_ASSETS_REQUIRE_SHOTS" });
  }
  const metadata = episode.metadata && typeof episode.metadata === "object" ? episode.metadata : {};
  const shotContext = shots.map((shot) => ({
    shotNo: shot.shotNo,
    title: shot.title,
    description: shot.description,
    location: shot.metadata?.location || "",
    characters: shot.metadata?.characters || [],
    dialogue: shot.metadata?.dialogue || "",
    dialogueLines: Array.isArray(shot.metadata?.dialogueLines) ? shot.metadata.dialogueLines : [],
    storyBeat: shot.metadata?.storyBeat || "",
  }));
  const knownLooks = existingAssets.filter((asset) => asset.kind === "character"
    && shotContext.some((shot) => shot.characters.includes(asset.metadata?.characterKey)))
    .map((asset) => ({
      characterKey: asset.metadata.characterKey,
      stateLabel: asset.metadata.stateLabel,
      continuity: asset.metadata.continuity || "",
    })).filter((asset) => asset.stateLabel).slice(0, 80);
  const userPrompt = [
    `项目：${String(project.name || "未命名项目")}`,
    `画幅：${String(project.aspectRatio || "9:16")}`,
    `集数：E${String(episode.episodeNo || 1).padStart(2, "0")}`,
    `标题：${String(episode.title || "")}`,
    Number(episode.durationSeconds || 0) > 0 ? `目标时长：${Math.max(1, Number(episode.durationSeconds || 0) || 0)}秒` : "目标时长：按已定稿镜头清单的实际内容判断",
    `已有角色名：${storyTextList(metadata.characters, 30, 80).join("、") || "按分镜判断"}`,
    `已有场景名：${storyTextList(metadata.scenes, 30, 100).join("、") || "按分镜判断"}`,
    `结尾钩子：${String(metadata.hook || "")}`,
    "单集大纲开始",
    String(episode.synopsis || "").trim(),
    "单集大纲结束",
    "项目既有角色造型，身份特征保持一致；仅在实际造型相同时复用原 stateLabel。",
    JSON.stringify(knownLooks),
    "镜头清单 JSON",
    JSON.stringify(shotContext),
    "请严格输出约定 JSON。",
  ].join("\n");
  const deadline = Date.now() + PROMPT_OPTIMIZER_TOTAL_BUDGET_MS;
  const usage = { attempts: 0 };
  const raw = await promptOptimizerUpstreamRequest({
    model: model.upstreamModel,
    messages: [
      { role: "system", content: STORY_ASSET_PLANNER_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.2,
    max_tokens: 6500,
  }, {
    deadline,
    requestContext: { storyAssetPlanner: true, projectId: project.id, episodeId: episode.id },
    usage,
    optimizerModel: model,
  });
  const text = qwen37FlashResponseText(raw);
  const parsed = storyParseJsonObject(text);
  if (!parsed) {
    throw Object.assign(new Error("AI 资产规划没有返回有效 JSON，请重试。"), {
      statusCode: 502,
      code: "STORY_ASSET_PLAN_INVALID_JSON",
      responsePreview: String(text || "").slice(0, 600),
    });
  }
  const plannedAssets = storyAssetsFromModel(parsed);
  if (!plannedAssets.length) {
    throw Object.assign(new Error("AI 资产规划结果为空，请重试。"), { statusCode: 502, code: "STORY_ASSET_PLAN_EMPTY" });
  }
  let plan = auditStoryAssetPlan(shots, plannedAssets);
  if (!plan.coverage.complete && !plan.coverage.characters.complete) {
    await onRepair();
    plan = await tryRepairStoryAssetCharacterBindings({
      plan, shots, shotContext, knownLooks, model, usage,
      requestContext: { storyAssetPlanner: true, projectId: project.id, episodeId: episode.id },
    });
  }
  return { ...plan, model: model.id, attempts: usage.attempts };
}

async function saveStoryEpisodeAssetPlan({ project, episode, shots, ownerUserId, onRepair }) {
  const existingAssets = await listStoryAssetsFromDb({ projectId: project.id, ownerUserId });
  if (!existingAssets) {
    throw Object.assign(new Error("无法读取项目资产。"), { statusCode: 503, code: "DATABASE_UNAVAILABLE" });
  }
  const result = await planStoryEpisodeAssets({ project, episode, shots, existingAssets, onRepair });
  if (!result.coverage.complete) {
    const { missing, conflicts } = result.coverage.characters;
    const issueGroups = [
      [missing, "缺少造型"], [conflicts, "造型冲突"],
      [result.coverage.scenes.missing, "缺少场景"],
    ];
    const labels = issueGroups.flatMap(([items, label]) => items
      .map(({ shotNo, characterName, location }) => `S${shotNo} ${characterName || location}（${label}）`)).slice(0, 8);
    const detail = labels.length ? `需核对：${labels.join("、")}。` : "部分角色无法确认身份。";
    console.warn("[story-asset-binding-unresolved]", JSON.stringify({
      projectId: project.id, episodeId: episode.id,
      missing: missing.map((issue) => issue.shotNo), conflicts: conflicts.map((issue) => issue.shotNo),
      unbound: result.coverage.characterBindings.unbound.length, scenes: result.coverage.scenes.missing.map((issue) => issue.shotNo),
    }));
    throw Object.assign(new Error(`资产与分镜的绑定不完整。${detail}请重新提取本集资产。`), {
      statusCode: 422, code: "STORY_ASSET_BINDINGS_INCOMPLETE",
    });
  }
  const saved = await upsertStoryAssetPlanInDb({ projectId: project.id, ownerUserId, episodeId: episode.id, assets: result.assets, shots });
  if (!saved) {
    throw Object.assign(new Error("资产需求保存失败。"), { statusCode: 503, code: "DATABASE_UNAVAILABLE" });
  }
  return { ...saved, model: result.model, attempts: result.attempts };
}

function storyAssetMetadataFromBody(body = {}, existingMetadata = {}) {
  const metadata = { ...(existingMetadata && typeof existingMetadata === "object" ? existingMetadata : {}) };
  metadata.imagePrompt = storyInputText(body.imagePrompt, 8000);
  metadata.continuity = storyInputText(body.continuity, 2000);
  if (body.locationKey !== undefined || body.location_key !== undefined) {
    metadata.locationKey = storyInputText(body.locationKey || body.location_key, 120);
  }
  if (body.characterKey !== undefined || body.character_key !== undefined) {
    metadata.characterKey = storyInputText(body.characterKey || body.character_key, 120);
  }
  if (body.stateLabel !== undefined || body.state_label !== undefined || body.variantLabel !== undefined) {
    metadata.stateLabel = storyInputText(body.stateLabel || body.state_label || body.variantLabel, 120);
  }
  const episodeIds = new Set([
    ...(Array.isArray(metadata.episodeIds) ? metadata.episodeIds.map(String) : []),
    ...(Array.isArray(body.episodeIds) ? body.episodeIds.map(String) : []),
    storyInputText(body.episodeId, 80),
  ].map(String).filter(Boolean));
  const shotNos = new Set([
    ...storyTextList(metadata.shotNos, 80, 24).map(String),
    ...storyTextList(body.shotNos, 80, 24).map(String),
    body.shotNo === undefined || body.shotNo === null ? "" : String(body.shotNo),
  ].filter(Boolean));
  metadata.episodeIds = [...episodeIds];
  metadata.shotNos = [...shotNos].map(Number).filter(Number.isFinite);
  return metadata;
}

async function handleCreateStoryAsset(req, res, projectId = "", episodeId = "") {
  if (requestTenantDescriptor(req).toolOnly) return sendJson(res, 404, { ok: false, message: "API not found." });
  const auth = await requireAdmin(req, res, { loadDb: false });
  if (!auth) return;
  const body = await readJson(req, 128 * 1024);
  const episodes = await listStoryEpisodesFromDb({ projectId, ownerUserId: auth.user.id });
  const episode = (episodes || []).find((item) => item.id === episodeId);
  if (!episode) return sendJson(res, 404, { ok: false, code: "STORY_EPISODE_NOT_FOUND", message: "剧集不存在。" });
  const name = storyInputText(body.name, 200);
  if (!name) return sendJson(res, 400, { ok: false, code: "STORY_ASSET_NAME_REQUIRED", message: "请填写资产名称。" });
  const metadata = storyAssetMetadataFromBody({ ...body, episodeId }, {});
  const asset = await createStoryAssetInDb({
    id: randomId("story-asset"),
    projectId,
    ownerUserId: auth.user.id,
    kind: storyInputText(body.kind, 40) || "character",
    name,
    description: storyInputText(body.description || body.imagePrompt, 8000),
    metadata,
  });
  if (!asset) return sendJson(res, 503, { ok: false, code: "DATABASE_UNAVAILABLE", message: "资产保存失败。" });
  return sendJson(res, 201, { ok: true, asset });
}

async function handleUpdateStoryAsset(req, res, projectId = "", assetId = "") {
  if (requestTenantDescriptor(req).toolOnly) return sendJson(res, 404, { ok: false, message: "API not found." });
  const auth = await requireAdmin(req, res, { loadDb: false });
  if (!auth) return;
  const body = await readJson(req, 128 * 1024);
  const assets = await listStoryAssetsFromDb({ projectId, ownerUserId: auth.user.id });
  const existing = (assets || []).find((item) => item.id === assetId);
  if (!existing) return sendJson(res, 404, { ok: false, code: "STORY_ASSET_NOT_FOUND", message: "资产不存在。" });
  const metadata = storyAssetMetadataFromBody(body, existing.metadata || {});
  const asset = await updateStoryAssetInDb({
    projectId,
    ownerUserId: auth.user.id,
    assetId,
    kind: storyInputText(body.kind, 40) || existing.kind,
    name: storyInputText(body.name, 200) || existing.name,
    description: storyInputText(body.description, 8000) || existing.description,
    metadata,
  });
  if (!asset) return sendJson(res, 404, { ok: false, code: "STORY_ASSET_NOT_FOUND", message: "资产不存在。" });
  return sendJson(res, 200, { ok: true, asset });
}

async function handleDeleteStoryAsset(req, res, projectId = "", assetId = "") {
  if (requestTenantDescriptor(req).toolOnly) return sendJson(res, 404, { ok: false, message: "API not found." });
  const auth = await requireAdmin(req, res, { loadDb: false });
  if (!auth) return;
  const deleted = await deleteStoryAssetInDb({ projectId, ownerUserId: auth.user.id, assetId });
  if (!deleted) return sendJson(res, 404, { ok: false, code: "STORY_ASSET_NOT_FOUND", message: "资产不存在。" });
  return sendJson(res, 200, { ok: true, deletedId: deleted });
}
