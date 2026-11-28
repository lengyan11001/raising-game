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

async function executeStoryAssetPlanJob({ projectId, episodeId, ownerUserId }) {
  const [project, episodes, shots] = await Promise.all([
    getStoryProjectFromDb({ id: projectId, ownerUserId }),
    listStoryEpisodesFromDb({ projectId, ownerUserId }),
    listStoryShotsFromDb({ projectId, episodeId, ownerUserId }),
  ]);
  const episode = episodes?.find((item) => item.id === episodeId);
  if (!project || !episode || !shots?.length) {
    throw Object.assign(new Error("本集分镜不存在，请先生成分镜。"), { code: "STORY_ASSETS_REQUIRE_SHOTS" });
  }
  return saveStoryEpisodeAssetPlan({ project, episode, shots, ownerUserId });
}

async function executeStoryImageJob({ id, projectId, episodeId, ownerUserId, input }) {
  const [existing, user, episodes, assets] = await Promise.all([
    getPool().query(`SELECT task_id, payload FROM app_generation_records
      WHERE payload->>'userId' = $1 AND payload->'params'->>'storyJobId' = $2 LIMIT 1`, [ownerUserId, id]),
    getUserByIdInDb(ownerUserId),
    listStoryEpisodesFromDb({ projectId, ownerUserId }),
    listStoryAssetsFromDb({ projectId, ownerUserId }),
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
  const basePrompt = String(asset?.metadata?.imagePrompt || asset?.description || "").trim();
  if (!user || !episode || !asset || !storyAssetBelongsToEpisode(asset, episode) || !basePrompt || !model) {
    throw Object.assign(new Error("资产、分集或出图模型已变化，请重新提交。"), { code: "STORY_IMAGE_JOB_INVALID" });
  }
  const handlers = {
    "qwen-image3": handleAdvancedQwenImage3Generate,
    "seedream55-image": handleAdvancedSeedream55ImageGenerate,
    "seedream5-image": handleAdvancedSeedream5ImageGenerate,
  };
  const prompt = [basePrompt, input.revisionFeedback ? `本次重新生成的修改要求：${input.revisionFeedback}` : ""]
    .filter(Boolean).join("\n\n");
  const body = {
    provider: model.id, prompt, resolution: model.resolution, ratio: model.ratio, duration: 1,
    params: { createKind: "story-asset", projectId, episodeId, storyAssetId: asset.id,
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
  const inputs = assetIds.map((assetId) => ({ assetId, model: model.id, revisionFeedback: storyInputText(body.revisionFeedback, 4000) }));
  const jobs = await enqueueStoryBackgroundJobInDb({ projectId, episodeId, ownerUserId: auth.user.id, kind: "image", inputs });
  if (!jobs?.length) return sendJson(res, 503, { ok: false, message: "设计图任务未保存，请重试。" });
  return sendJson(res, 202, { ok: true, jobs: jobs.map((job) => ({ id: job.id, status: job.status })) });
}

async function reportStoryJobPhase(job, phase, counts = {}) {
  try {
    await getPool().query(
      `UPDATE app_story_shot_plan_jobs
       SET result = COALESCE(result, '{}'::jsonb) || jsonb_build_object('progress', $3::jsonb), updated_at = NOW()
       WHERE id = $1 AND claim_token = $2 AND status = 'billing_processing'`,
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
    const planned = await saveStoryEpisodeAssetPlan({ project, episode: saved.episode, shots: saved.shots, ownerUserId });
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
      const execute = { analysis: executeStoryAnalysisJob, assets: executeStoryAssetPlanJob, image: executeStoryImageJob, prompt: executeStoryPromptJob, shots: executeStoryShotPlanJob }[job.kind];
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

async function planStoryEpisodeAssets({ project = {}, episode = {}, shots = [], existingAssets = [] } = {}) {
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
  const characterBindings = normalizeStoryAssetCharacterBindings({ shots, assets: plannedAssets });
  const characterCoverage = auditStoryAssetCharacterCoverage({ shots, assets: characterBindings.assets });
  const sceneCoverage = repairStoryAssetSceneCoverage({ shots, assets: characterBindings.assets });
  const assets = sceneCoverage.assets;
  if (!assets.length) {
    throw Object.assign(new Error("AI 资产规划结果为空，请重试。"), { statusCode: 502, code: "STORY_ASSET_PLAN_EMPTY" });
  }
  return {
    assets,
    coverage: {
      characters: characterCoverage,
      characterBindings: characterBindings.audit,
      scenes: sceneCoverage.audit,
      complete: characterBindings.audit.complete && characterCoverage.complete && sceneCoverage.audit.complete,
    },
    model: model.id,
    attempts: usage.attempts,
  };
}

async function saveStoryEpisodeAssetPlan({ project, episode, shots, ownerUserId }) {
  const existingAssets = await listStoryAssetsFromDb({ projectId: project.id, ownerUserId });
  if (!existingAssets) {
    throw Object.assign(new Error("无法读取项目资产。"), { statusCode: 503, code: "DATABASE_UNAVAILABLE" });
  }
  const result = await planStoryEpisodeAssets({ project, episode, shots, existingAssets });
  if (!result.coverage.complete) {
    const { missing, conflicts } = result.coverage.characters;
    const labels = [...missing, ...conflicts].slice(0, 8).map(({ shotNo, characterName }) => `S${shotNo} ${characterName}`);
    const detail = labels.length ? `需核对：${labels.join("、")}。` : "";
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
