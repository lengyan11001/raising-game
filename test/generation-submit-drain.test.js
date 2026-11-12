"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const server = require("../server");

test("generation submit drain waits for an in-flight submission", async () => {
  const submission = server.beginGenerationSubmission("drain-test", "task-wait");
  let settled = false;
  const pending = server.waitForGenerationSubmissionsToDrain(1000).then((result) => {
    settled = true;
    return result;
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(settled, false);
  server.finishGenerationSubmission(submission);
  const result = await pending;
  assert.equal(result.drained, true);
});

test("tracked generation job is reserved before its scheduled runner starts", async () => {
  let releaseRunner;
  const runnerGate = new Promise((resolve) => { releaseRunner = resolve; });
  const started = server.startTrackedGenerationJob(
    "tracked-drain-test",
    "task-tracked-wait",
    async () => runnerGate,
    (error) => assert.fail(error),
  );
  assert.ok(started, "the job must reserve a submission token synchronously");

  const pending = server.waitForGenerationSubmissionsToDrain(1000);
  await new Promise((resolve) => setTimeout(resolve, 20));
  releaseRunner();
  const result = await pending;
  assert.equal(result.drained, true);
});

test("advanced generation wrapper passes the complete job and submission to its runner", async () => {
  const job = {
    taskId: "advanced-contract-test",
    userId: "user-contract-test",
    provider: "seedance",
    requestParams: { mediaMode: "reference_video", ratio: "9:16", duration: 5 },
  };
  let receivedJob = null;
  let receivedSubmission = null;
  const submission = server.startAdvancedGenerationJob(job, async (runnerJob, runnerSubmission) => {
    receivedJob = runnerJob;
    receivedSubmission = runnerSubmission;
  });

  assert.ok(submission, "the advanced generation wrapper must reserve a submission synchronously");
  const result = await server.waitForGenerationSubmissionsToDrain(1000);
  assert.equal(result.drained, true);
  assert.equal(receivedJob, job, "the runner must receive the original job object");
  assert.equal(receivedJob.requestParams.mediaMode, "reference_video");
  assert.equal(receivedSubmission, submission, "the runner must receive the tracked submission token");
});

test("tracked generation job releases its reservation when the runner throws", async () => {
  let handledError;
  server.startTrackedGenerationJob(
    "tracked-error-test",
    "task-tracked-error",
    async () => { throw new Error("runner failed"); },
    (error) => { handledError = error; },
  );
  const result = await server.waitForGenerationSubmissionsToDrain(1000);
  assert.equal(result.drained, true);
  assert.equal(handledError?.message, "runner failed");
});

test("tracked generation job waits for an asynchronous error settlement", async () => {
  let settlementFinished = false;
  server.startTrackedGenerationJob(
    "tracked-async-error-test",
    "task-tracked-async-error",
    async () => { throw new Error("runner failed"); },
    async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      settlementFinished = true;
    },
  );
  const result = await server.waitForGenerationSubmissionsToDrain(1000);
  assert.equal(result.drained, true);
  assert.equal(settlementFinished, true);
});

test("tracked generation job releases its reservation when error handling also throws", async () => {
  server.startTrackedGenerationJob(
    "tracked-handler-error-test",
    "task-tracked-handler-error",
    async () => { throw new Error("runner failed"); },
    () => { throw new Error("handler failed"); },
  );
  const result = await server.waitForGenerationSubmissionsToDrain(1000);
  assert.equal(result.drained, true);
});

test("generation submit drain rejects submissions while shutting down", async () => {
  assert.equal(server.beginGenerationSubmissionDrain(), 0);
  assert.throws(
    () => server.beginGenerationSubmission("after-drain", "task-rejected"),
    (error) => error.code === "GENERATION_SUBMIT_SHUTTING_DOWN" && error.statusCode === 503,
  );
});

test("all background generation entrypoints reserve before scheduling", () => {
  const files = [
    "part-25.js",
    "part-26.js",
    "part-27.js",
    "part-28.js",
    "part-37.js",
    "part-48.js",
  ];
  for (const file of files) {
    const source = fs.readFileSync(path.join(root, "server.parts", file), "utf8");
    assert.match(source, /return startTrackedGenerationJob\(/, `${file} must reserve before setImmediate`);
    assert.doesNotMatch(source, /setImmediate\(\(\) => run[A-Za-z0-9]+GenerationJob/, `${file} must not schedule untracked work`);
  }
  const shutdown = fs.readFileSync(path.join(root, "server.parts", "part-43.js"), "utf8");
  assert.match(shutdown, /process\.once\("SIGTERM"/);
  assert.match(shutdown, /process\.once\("SIGINT"/);
  assert.match(shutdown, /closeHttpServerBounded\(server/);
  assert.match(shutdown, /httpShutdownGate\.begin\(\)/);
  assert.match(shutdown, /waitForGenerationSubmissionsToDrain\(GENERATION_SUBMIT_DRAIN_TIMEOUT_MS\)/);
  assert.match(shutdown, /HTTP_SHUTDOWN_GRACE_MS/);
  assert.match(shutdown, /GENERATION_SUBMIT_DRAIN_TIMEOUT_MS \+ HTTP_SHUTDOWN_SETTLE_MS \+ 5000/);
});

test("generation entrypoints reserve synchronously before returning", () => {
  const assertions = [
    ["part-25.js", "startPlatformGenerationJob"],
    ["part-26.js", "startAdvancedGenerationJob"],
    ["part-27.js", "startSeedream5ImageGenerationJob"],
    ["part-28.js", "startQwen37FlashGenerationJob"],
    ["part-28.js", "startQwenImage3GenerationJob"],
    ["part-37.js", "startMyCharacterImageGenerationJob"],
    ["part-48.js", "startSeedance25GenerationJob"],
  ];
  for (const [file, functionName] of assertions) {
    const source = fs.readFileSync(path.join(root, "server.parts", file), "utf8");
    const startIndex = source.indexOf(`function ${functionName}`);
    assert.notEqual(startIndex, -1, `${file} must define ${functionName}`);
    const endIndex = source.indexOf("\n}", startIndex);
    const body = source.slice(startIndex, endIndex + 2);
    assert.match(body, /return startTrackedGenerationJob\(/, `${functionName} must reserve synchronously`);
    assert.doesNotMatch(body, /setImmediate\(/, `${functionName} must not defer reservation`);
    assert.match(body, /\(submission\) => (?:runner|run[A-Za-z0-9]+GenerationJob)\(job, submission\)/, `${functionName} must pass both job and submission to its runner`);
  }
});

test("advanced generation failure settlement is refund-safe and uses the real task", () => {
  const source = fs.readFileSync(path.join(root, "server.parts", "part-26.js"), "utf8");
  const settlement = source.slice(
    source.indexOf("async function settleAdvancedGenerationJobFailure"),
    source.indexOf("async function runAdvancedGenerationJob"),
  );
  assert.match(settlement, /const currentRecord = await getGenerationRecord\(taskId\)/);
  assert.match(settlement, /advancedGenerationFailureShouldRefund/);
  assert.match(settlement, /refundBeforeDispatch/);
  assert.match(settlement, /refundCreditsWithSubtoken\(currentRecord \|\| \{ taskId, userId, provider \}, userId, preDeducted, "generation_refund"/);
  assert.match(settlement, /billingStatus: refunded \? "refunded" : preDeducted <= 0 \? "free" : currentBillingStatus === "settled" \? "settled" : "pre_deducted"/);
  assert.match(settlement, /billingSettledAt: refunded \? new Date\(\)\.toISOString\(\) : currentRecord\?\.billingSettledAt \|\| ""/);
  assert.match(settlement, /Automatic refund withheld because provider submission may have succeeded without a persisted upstream task id/);
  assert.match(settlement, /params: currentRecord\?\.params \|\| requestParams \|\| \{\}/);

  const runner = source.slice(
    source.indexOf("async function runAdvancedGenerationJob"),
    source.indexOf("function byteplusRequestId"),
  );
  assert.match(runner, /\[advanced-generation-job-error\]", taskId/);
  assert.match(runner, /await settleAdvancedGenerationJobFailure\(failureJob, error, "advanced-failed", \{/);
  assert.match(runner, /let providerDispatchStarted = false/);
  const outerTry = runner.indexOf("\n  try {");
  const declaration = runner.indexOf("let providerDispatchStarted = false");
  const catchUse = runner.indexOf("Boolean(providerDispatchStarted)", outerTry);
  assert.ok(declaration > 0 && declaration < outerTry, "dispatch flag must be declared outside the outer try/catch");
  assert.ok(catchUse > outerTry, "failure settlement must read the outer dispatch flag");
  assert.doesNotMatch(runner.slice(outerTry), /let providerDispatchStarted = false/, "the dispatch flag must not be redeclared inside try");
  assert.match(runner, /providerDispatchStarted = true;\s*const submitted = await submitAliyunVideoTask/);
  assert.match(runner, /providerDispatchStarted = true;\s*task = await gatewaySubmitAdvancedTask/);
  assert.match(runner, /providerDispatchStarted = true;\s*const submitted = await submitSeedanceTask/);
  assert.match(runner, /refundBeforeDispatch: !providerDispatchStarted/);
  assert.doesNotMatch(runner, /billingError: "",[\s\S]*?"advanced-failed"/);
});

test("advanced generation pre-dispatch database failure settles without a scope error", async () => {
  const source = fs.readFileSync(path.join(root, "server.parts", "part-26.js"), "utf8");
  const start = source.indexOf("async function runAdvancedGenerationJob");
  const end = source.indexOf("function byteplusRequestId", start);
  assert.ok(start > 0 && end > start, "runAdvancedGenerationJob must be extractable from source");

  const calls = { settlements: [], finished: 0, reported: [] };
  const context = {
    USE_GATEWAY_UPSTREAM: false,
    console: { warn() {} },
    isVegaProvider: () => false,
    requestParamsFromBody: (value) => value,
    advancedRuntimeForProvider: () => ({
      providerName: "seedance",
      recordSource: "advanced-seedance",
      model: "test-model",
      quality: "high",
    }),
    updateGenerationRecord: async () => {
      throw new Error("database unavailable before dispatch");
    },
    settleAdvancedGenerationJobFailure: async (...args) => {
      calls.settlements.push(args);
    },
    finishGenerationSubmission: () => {
      calls.finished += 1;
    },
  };
  vm.runInNewContext(`${source.slice(start, end)}\nthis.runAdvancedGenerationJob = runAdvancedGenerationJob;`, context);

  const job = {
    taskId: "advanced-pre-dispatch-db-failure",
    userId: "user-pre-dispatch-db-failure",
    provider: "seedance",
    requestParams: { ratio: "9:16", duration: 5 },
    pricing: { totalCredits: 150, userCredits: 150, originalCredits: 150 },
    cost: 150,
  };
  await context.runAdvancedGenerationJob(job, null, {
    onError: (error) => calls.reported.push(error),
  });
  assert.equal(calls.settlements.length, 1, "the failure must pass through the durable settlement helper");
  assert.equal(calls.settlements[0][0].taskId, job.taskId);
  assert.equal(calls.settlements[0][2], "advanced-failed");
  assert.equal(calls.settlements[0][3].refundBeforeDispatch, true);
  assert.equal(calls.settlements[0][1].providerDispatchStarted, false);
  assert.equal(calls.reported.length, 1);
  assert.equal(calls.reported[0].providerDispatchStarted, false);
  assert.equal(calls.finished, 1, "the tracked submission must always be released");
});

test("advanced generation pre-dispatch failures may refund, but ambiguous dispatch failures may not", () => {
  const source = fs.readFileSync(path.join(root, "server.parts", "part-26.js"), "utf8");
  const helper = source.slice(
    source.indexOf("function advancedGenerationFailureShouldRefund"),
    source.indexOf("async function settleAdvancedGenerationJobFailure"),
  );
  assert.match(helper, /creditsAmount\(preDeductedCredits\) > 0/);
  assert.match(helper, /String\(billingStatus \|\| ""\)\.toLowerCase\(\) === "pre_deducted"/);
  assert.match(helper, /&& refundBeforeDispatch/);

  const outer = source.slice(source.indexOf("function startAdvancedGenerationJob"), source.indexOf("function advancedGenerationFailureShouldRefund"));
  assert.match(outer, /refundBeforeDispatch: false/);
});

test("Qwen jobs keep the submission tracked until the durable result is written", () => {
  const source = fs.readFileSync(path.join(root, "server.parts", "part-28.js"), "utf8");
  const qwen37 = source.slice(source.indexOf("async function runQwen37FlashGenerationJob"), source.indexOf("function startQwen37FlashGenerationJob"));
  assert.doesNotMatch(qwen37, /await aliyunQwen37FlashRequest\(upstreamPayload\);\s*finishGenerationSubmission/);
  assert.match(qwen37, /finally\s*\{\s*finishGenerationSubmission\(submission\);\s*\}\s*$/m);

  const qwenImage = source.slice(source.indexOf("async function runQwenImage3GenerationJob"), source.indexOf("function startQwenImage3GenerationJob"));
  assert.doesNotMatch(qwenImage, /queueQwenImage3Submit[\s\S]*?\)\);\s*finishGenerationSubmission/);
  assert.match(qwenImage, /finally\s*\{\s*finishGenerationSubmission\(submission\);\s*\}\s*$/m);
});

test("the shutdown drain is bounded to a finite three-minute window", () => {
  const source = fs.readFileSync(path.join(root, "server.parts", "part-43.js"), "utf8");
  assert.match(source, /GENERATION_SUBMIT_DRAIN_TIMEOUT_MS[\s\S]*?process\.env\.GENERATION_SUBMIT_DRAIN_TIMEOUT_MS \|\| 180000/);
  assert.match(source, /Math\.min\(300000/);
});

test("platform pre-submit failure upserts once and settles through the explicit APIZ path", () => {
  const source = fs.readFileSync(path.join(root, "server.parts", "part-25.js"), "utf8");
  const failure = source.slice(
    source.indexOf("async function markPlatformGenerationSubmitFailed"),
    source.indexOf("async function runPlatformGenerationJob"),
  );
  assert.match(failure, /const failedRecord = await upsertGenerationRecord\(\{/);
  assert.match(failure, /return settleApizGenerationRecord\(failedRecord, \{/);
  assert.doesNotMatch(failure, /updateGenerationRecord\(taskId/);
  assert.doesNotMatch(failure, /upsertAndSettleGenerationRecord/);
  assert.equal((failure.match(/settleApizGenerationRecord\(/g) || []).length, 1);
});
