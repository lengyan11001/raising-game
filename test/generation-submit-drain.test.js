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

test("generation submit drain rejects submissions while shutting down", async () => {
  assert.equal(server.beginGenerationSubmissionDrain(), 0);
  assert.throws(
    () => server.beginGenerationSubmission("after-drain", "task-rejected"),
    (error) => error.code === "GENERATION_SUBMIT_SHUTTING_DOWN" && error.statusCode === 503,
  );
});

test("all background generation runners enter the submit drain window", () => {
  const files = [
    "part-25.js",
    "part-26.js",
    "part-27.js",
    "part-28.js",
    "part-38.js",
  ];
  for (const file of files) {
    const source = fs.readFileSync(path.join(root, "server.parts", file), "utf8");
    assert.match(source, /beginGenerationSubmission\(/, `${file} must register submit work`);
    assert.match(source, /finishGenerationSubmission\(/, `${file} must release submit work`);
  }
  const shutdown = fs.readFileSync(path.join(root, "server.parts", "part-43.js"), "utf8");
  assert.match(shutdown, /process\.once\("SIGTERM"/);
  assert.match(shutdown, /process\.once\("SIGINT"/);
  assert.match(shutdown, /server\.close\(resolve\)/);
  assert.match(shutdown, /server\.closeIdleConnections\?\.\(\)/);
  assert.match(shutdown, /waitForGenerationSubmissionsToDrain\(GENERATION_SUBMIT_DRAIN_TIMEOUT_MS\)/);
});

test("Qwen jobs keep the submission tracked until the durable result is written", () => {
  const source = fs.readFileSync(path.join(root, "server.parts", "part-28.js"), "utf8");
  const qwen37 = source.slice(source.indexOf("async function runQwen37FlashGenerationJob"), source.indexOf("function startQwen37FlashGenerationJob"));
  assert.doesNotMatch(qwen37, /await aliyunQwen37FlashRequest\(upstreamPayload\);\s*finishGenerationSubmission/);
  assert.match(qwen37, /status: "succeeded"[\s\S]*?finishGenerationSubmission\(submission\)/);

  const qwenImage = source.slice(source.indexOf("async function runQwenImage3GenerationJob"), source.indexOf("function startQwenImage3GenerationJob"));
  assert.doesNotMatch(qwenImage, /queueQwenImage3Submit[\s\S]*?\)\);\s*finishGenerationSubmission/);
  assert.match(qwenImage, /status: "succeeded"[\s\S]*?finishGenerationSubmission\(submission\)/);
});

test("the shutdown drain is bounded to a finite three-minute window", () => {
  const source = fs.readFileSync(path.join(root, "server.parts", "part-43.js"), "utf8");
  assert.match(source, /GENERATION_SUBMIT_DRAIN_TIMEOUT_MS[\s\S]*?process\.env\.GENERATION_SUBMIT_DRAIN_TIMEOUT_MS \|\| 180000/);
  assert.match(source, /Math\.min\(300000/);
});
