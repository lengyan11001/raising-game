"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const create = fs.readFileSync(path.join(root, "platform.create.js"), "utf8");

function functionSource(name) {
  const match = create.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`));
  assert.ok(match, `${name} should exist`);
  return match[0];
}

const source = [
  functionSource("advancedResultRecordTimestamp"),
  functionSource("sortAdvancedResultRecords"),
  create.match(/const ADVANCED_RESULT_MEDIA_FIELDS = \[[\s\S]*?\n\];/)?.[0] || "",
  functionSource("advancedResultRecordWithMediaFallback"),
  functionSource("mergeAdvancedResultRecord"),
  "function advancedResultHistoryFallbackRecords() { return state.historyRecords || []; }",
  functionSource("advancedResultDisplayRecords"),
].join("\n");

const load = (state) => new Function("state", `${source}\nreturn { mergeAdvancedResultRecord, advancedResultDisplayRecords };`)(state);

test("result records are sorted by creation time, newest first", () => {
  const state = { advancedResultRecords: [], historyRecords: [] };
  const { mergeAdvancedResultRecord } = load(state);
  mergeAdvancedResultRecord({ taskId: "old", createdAt: "2026-11-01T08:00:00.000Z" });
  mergeAdvancedResultRecord({ taskId: "new", createdAt: "2026-11-03T08:00:00.000Z" });
  mergeAdvancedResultRecord({ taskId: "middle", createdAt: "2026-11-02T08:00:00.000Z" });
  assert.deepEqual(state.advancedResultRecords.map((record) => record.taskId), ["new", "middle", "old"]);
});

test("refreshing an old task cannot move it ahead of a newer task", () => {
  const state = { advancedResultRecords: [], historyRecords: [] };
  const { mergeAdvancedResultRecord } = load(state);
  mergeAdvancedResultRecord({ taskId: "new", createdAt: "2026-11-03T08:00:00.000Z", status: "running" });
  mergeAdvancedResultRecord({ taskId: "old", createdAt: "2026-11-01T08:00:00.000Z", status: "running" });
  mergeAdvancedResultRecord({ taskId: "old", updatedAt: "2026-11-03T09:00:00.000Z", status: "succeeded" });

  assert.deepEqual(state.advancedResultRecords.map((record) => record.taskId), ["new", "old"]);
  assert.equal(state.advancedResultRecords[1].status, "succeeded");
});

test("history fallback cannot erase a detail poster with empty media fields", () => {
  const state = {
    advancedResultRecords: [{
      taskId: "video-1",
      status: "succeeded",
      createdAt: "2026-11-03T08:00:00.000Z",
      cdnPosterUrl: "https://media.123vips.com/generated/posters/video-1.jpg",
      cdnVideoUrl: "https://media.123vips.com/generated/videos/video-1.mp4",
    }],
    historyRecords: [{
      taskId: "video-1",
      status: "succeeded",
      createdAt: "2026-11-03T08:00:00.000Z",
      cdnPosterUrl: "",
      posterUrl: "",
      localPosterUrl: "",
      cdnVideoUrl: "",
    }],
  };
  const { advancedResultDisplayRecords } = load(state);
  const [record] = advancedResultDisplayRecords();
  assert.equal(record.cdnPosterUrl, "https://media.123vips.com/generated/posters/video-1.jpg");
  assert.equal(record.cdnVideoUrl, "https://media.123vips.com/generated/videos/video-1.mp4");
});

test("a partial detail refresh cannot erase an existing poster", () => {
  const state = { advancedResultRecords: [], historyRecords: [] };
  const { mergeAdvancedResultRecord } = load(state);
  mergeAdvancedResultRecord({
    taskId: "video-2",
    cdnPosterUrl: "https://media.123vips.com/generated/posters/video-2.jpg",
  });
  mergeAdvancedResultRecord({ taskId: "video-2", status: "succeeded", cdnPosterUrl: "" });
  assert.equal(state.advancedResultRecords[0].cdnPosterUrl, "https://media.123vips.com/generated/posters/video-2.jpg");
  assert.equal(state.advancedResultRecords[0].status, "succeeded");
});

test("result panel keeps and displays more than six records", () => {
  const state = {
    advancedResultRecords: Array.from({ length: 7 }, (_, index) => ({
      taskId: `task-${index + 1}`,
      createdAt: `2026-11-03T0${index}:00:00.000Z`,
    })),
    historyRecords: [
      { taskId: "task-7", createdAt: "2026-11-03T06:00:00.000Z", status: "running" },
      { taskId: "task-8", createdAt: "2026-11-03T07:00:00.000Z", status: "succeeded" },
    ],
  };
  const { advancedResultDisplayRecords } = load(state);
  const records = advancedResultDisplayRecords();
  assert.equal(records.length, 8);
  assert.deepEqual(records.slice(0, 2).map((record) => record.taskId), ["task-8", "task-7"]);
  assert.equal(records.find((record) => record.taskId === "task-7").status, "running");
  assert.doesNotMatch(functionSource("mergeAdvancedResultRecord"), /slice\(0, 6\)/);
});
