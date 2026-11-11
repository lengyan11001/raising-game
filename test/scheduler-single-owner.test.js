"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (name) => fs.__sourceCompatReadFileSync
  ? fs.__sourceCompatReadFileSync(path.join(root, name), "utf8")
  : fs.readFileSync(path.join(root, name), "utf8");

const schedulerParts = ["part-12.js", "part-23.js", "part-41.js", "part-43.js"]
  .map((name) => read(path.join("server.parts", name)))
  .join("\n");

test("all background scheduler entrypoints use the PostgreSQL scheduler lease", () => {
  const requiredLeaseNames = [
    "wallet-chain-scan",
    "stale-submit-generation-records",
    "active-generation-records",
    "telegram-generation-notifications",
    "telegram-payment-notifications",
    "video-tool-job-recovery",
    "video-tool-upload-cleanup",
    "local-media-cleanup",
    "generated-r2-expiry",
    "media-ingest-worker",
    "generation-record-media-recovery",
    "generation-record-media-persistence",
    "generation-poster-backfill",
    "generation-result-asset-backfill",
    "chat-live-stale-settlement",
    "chat-live-orphan-cleanup",
    "auth-risk-cleanup",
    "chat-live-billing-monitor",
  ];
  for (const name of requiredLeaseNames) {
    assert.match(schedulerParts, new RegExp(`runWithSchedulerLease\\(\\s*"${name}"`), `missing scheduler lease: ${name}`);
  }
  assert.match(schedulerParts, /getSchedulerPool\(\)\.connect\(\)/);
  assert.doesNotMatch(schedulerParts, /setInterval\([^\n]*scanMediaIngestQueue\(\)/);
  assert.doesNotMatch(schedulerParts, /setInterval\([^\n]*cleanupStaleLocalMedia\(\)/);
  assert.doesNotMatch(schedulerParts, /setInterval\([^\n]*settleStaleChatLiveSessions\(\)/);
});

test("scheduler lease tests cover ownership takeover and release", () => {
  const leaseTest = read("test/scheduler-lease.test.js");
  assert.match(leaseTest, /cannot run one job concurrently/);
  assert.match(leaseTest, /release allows the next tick or standby instance/);
  assert.match(leaseTest, /job failure and connection release still release the lease/);
});
