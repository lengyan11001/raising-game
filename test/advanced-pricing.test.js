"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const server = fs.readFileSync(path.join(root, "server.js"), "utf8");

test("admin pricing rows use their server definition when saving", () => {
  assert.match(server, /ADVANCED_PRICING_ROWS_BY_KEY\.get\(key\)/);
});

test("admin pricing keeps current models and omits early Wan models", () => {
  const pricingRowsSource = server.slice(
    server.indexOf("const ADVANCED_PRICING_ROWS = ["),
    server.indexOf("const ADVANCED_PRICING_ROW_KEYS"),
  );
  assert.doesNotMatch(pricingRowsSource, /key: "wan27-(?:720p|1080p)"/);
  assert.doesNotMatch(pricingRowsSource, /officialSingaporeLegacyPricingRows\(\)/);
  assert.doesNotMatch(pricingRowsSource, /providerLabel: "Wan Legacy"/);
  assert.match(pricingRowsSource, /model: ALIYUN_WAN27_I2V_MODEL/);
  assert.match(pricingRowsSource, /model: ALIYUN_WAN_ANIMATE_MIX_MODEL/);
  assert.match(pricingRowsSource, /model: ALIYUN_HAPPYHORSE_I2V_MODEL/);
});
