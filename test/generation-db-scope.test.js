"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("advanced generation jobs load only the creating user and that user's assets", () => {
  const part01 = read("server.parts/part-01.js");
  const part02 = read("server.parts/part-02.js");
  const part26 = read("server.parts/part-26.js");
  const db = read("db.js");
  const jobStart = part26.indexOf("async function runAdvancedGenerationJob");
  const jobEnd = part26.indexOf("function byteplusRequestId", jobStart);
  const job = part26.slice(jobStart, jobEnd);

  assert.ok(jobStart > 0 && jobEnd > jobStart);
  assert.doesNotMatch(job, /\breadDb\s*\(/);
  assert.match(job, /readGenerationJobDb\(userId\)/);
  assert.match(part02, /async function readGenerationJobDb\(userId = ""\)/);
  assert.match(part02, /getUserByIdInDb\(cleanUserId\)/);
  assert.match(part02, /getUserAssetsForUserFromDb\(cleanUserId\)/);
  assert.match(part01, /getUserAssetsForUserFromDb/);
  assert.match(db, /async function getUserAssetsForUserFromDb\(userId = ""\)/);
  assert.match(db, /WHERE user_id = \$1[\s\S]*?deleted_at IS NULL/);
});
