"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

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
  assert.match(shutdown, /server\.close\(resolve\)/);
  assert.match(shutdown, /server\.closeIdleConnections\?\.\(\)/);
  assert.match(shutdown, /waitForGenerationSubmissionsToDrain\(GENERATION_SUBMIT_DRAIN_TIMEOUT_MS\)/);
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
  }
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
