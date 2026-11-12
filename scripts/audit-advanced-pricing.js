#!/usr/bin/env node
"use strict";

const { adminAdvancedPricingView } = require("../server");

const MARGIN_FLOOR = 1.5;
const MARGIN_TOLERANCE = 1e-5;

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function auditRow(row) {
  const purchase = finiteNumber(row.purchaseUsdPerSecond);
  const sale = finiteNumber(row.saleUsdPerSecond);
  const purchaseRange = Array.isArray(row.purchaseUsdPerSecondRange)
    ? row.purchaseUsdPerSecondRange.map(finiteNumber).filter((value) => value !== null)
    : [];

  if (purchase !== null && purchase > 0 && sale !== null) {
    const multiplier = sale / purchase;
    return {
      provider: row.provider || "",
      label: row.providerLabel || row.provider || "",
      key: row.key || "",
      resolution: row.resolution || "",
      rateKind: row.rateKind || row.unit || "",
      purchaseUsd: purchase,
      purchaseUsdLow: null,
      purchaseUsdHigh: null,
      saleUsd: sale,
      multiplier,
      multiplierLow: null,
      multiplierHigh: null,
      status: multiplier < MARGIN_FLOOR - MARGIN_TOLERANCE ? "LOW" : "OK",
      source: row.purchaseSource || "",
    };
  }

  if (purchaseRange.length === 2 && sale !== null) {
    const [purchaseUsdLow, purchaseUsdHigh] = purchaseRange;
    const multiplierLow = purchaseUsdHigh > 0 ? sale / purchaseUsdHigh : null;
    const multiplierHigh = purchaseUsdLow > 0 ? sale / purchaseUsdLow : null;
    return {
      provider: row.provider || "",
      label: row.providerLabel || row.provider || "",
      key: row.key || "",
      resolution: row.resolution || "",
      rateKind: row.rateKind || row.unit || "",
      purchaseUsd: null,
      purchaseUsdLow,
      purchaseUsdHigh,
      saleUsd: sale,
      multiplier: null,
      multiplierLow,
      multiplierHigh,
      status: multiplierLow !== null && multiplierLow < MARGIN_FLOOR - MARGIN_TOLERANCE ? "LOW" : "RANGE",
      source: row.purchaseSource || "",
    };
  }

  return {
    provider: row.provider || "",
    label: row.providerLabel || row.provider || "",
    key: row.key || "",
    resolution: row.resolution || "",
    rateKind: row.rateKind || row.unit || "",
    purchaseUsd: purchase,
    purchaseUsdLow: null,
    purchaseUsdHigh: null,
    saleUsd: sale,
    multiplier: null,
    multiplierLow: null,
    multiplierHigh: null,
    status: "MISSING",
    source: row.purchaseSource || "",
  };
}

function formatNumber(value, digits = 8) {
  return value === null || value === undefined ? "-" : Number(value).toFixed(digits).replace(/0+$/, "").replace(/\.$/, "");
}

function formatPurchase(row) {
  if (row.purchaseUsd !== null) return formatNumber(row.purchaseUsd);
  if (row.purchaseUsdLow !== null && row.purchaseUsdHigh !== null) {
    return `${formatNumber(row.purchaseUsdLow)}-${formatNumber(row.purchaseUsdHigh)}`;
  }
  return "-";
}

function formatMultiplier(row) {
  if (row.multiplier !== null) return `${row.multiplier.toFixed(6)}x`;
  if (row.multiplierLow !== null && row.multiplierHigh !== null) {
    return `${row.multiplierLow.toFixed(6)}x-${row.multiplierHigh.toFixed(6)}x`;
  }
  return "-";
}

async function main() {
  const json = process.argv.includes("--json");
  const view = await adminAdvancedPricingView({});
  const rows = view.rows.map(auditRow);
  const summary = rows.reduce((counts, row) => {
    counts.total += 1;
    counts[row.status] = (counts[row.status] || 0) + 1;
    return counts;
  }, { total: 0, OK: 0, LOW: 0, MISSING: 0, RANGE: 0 });

  if (json) {
    process.stdout.write(`${JSON.stringify({ summary, rows }, null, 2)}\n`);
    return;
  }

  console.log(`Advanced pricing audit: ${summary.total} rows`);
  console.log(`OK ${summary.OK || 0} | LOW ${summary.LOW || 0} | MISSING ${summary.MISSING || 0} | RANGE ${summary.RANGE || 0}`);
  console.log("");
  console.log(["STATUS", "PROVIDER", "LABEL", "KEY", "RESOLUTION", "RATE", "PURCHASE USD", "SALE USD", "MULTIPLIER", "SOURCE"].join("\t"));
  for (const row of rows) {
    console.log([
      row.status,
      row.provider,
      row.label,
      row.key,
      row.resolution,
      row.rateKind,
      formatPurchase(row),
      formatNumber(row.saleUsd),
      formatMultiplier(row),
      row.source,
    ].join("\t"));
  }
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});
