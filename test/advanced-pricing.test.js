"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const server = fs.readFileSync(path.join(root, "server.js"), "utf8");

test("legacy Wan sale prices are stored and billed by model", () => {
  assert.match(server, /aliyunVideoCreditsPerSecondByModel:\s*defaultAliyunLegacySaleCreditsByModel\(\)/);
  assert.match(server, /configuredModelTable\s*=\s*capability === "wan-legacy"/);
  assert.match(server, /next\.aliyunVideoCreditsPerSecondByModel\?\.\[model\]/);
});

test("admin pricing rows use their server definition when saving", () => {
  assert.match(server, /ADVANCED_PRICING_ROWS_BY_KEY\.get\(key\)/);
  assert.match(server, /officialSingaporeLegacyPricingRows\(\)/);
});

test("duplicate generic Wan 2.7 pricing rows are not rendered", () => {
  const pricingRowsSource = server.slice(
    server.indexOf("const ADVANCED_PRICING_ROWS = ["),
    server.indexOf("const ADVANCED_PRICING_ROW_KEYS"),
  );
  assert.doesNotMatch(pricingRowsSource, /key: "wan27-(?:720p|1080p)"/);
});
