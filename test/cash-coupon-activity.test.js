"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const serverCoupon = read("server.parts/part-52.js");
const database = read("db.js");

function sourceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing start marker: ${startMarker}`);
  const end = endMarker ? source.indexOf(endMarker, start + startMarker.length) : source.length;
  assert.notEqual(end, -1, `missing end marker: ${endMarker}`);
  return source.slice(start, end);
}

function loadServerCouponHelpers(extra = {}) {
  const pure = sourceBetween(serverCoupon, "const COUPON_NEW_USER_CODE", "async function handleListCoupons");
  const wallet = sourceBetween(serverCoupon, "async function prepareCouponForWalletOrder", "async function releaseCouponOnWalletOrderFailure");
  const context = vm.createContext({
    crypto,
    process: { env: {} },
    Date,
    Math,
    Number,
    String,
    Boolean,
    Array,
    Object,
    console,
    dbEnabled: () => true,
    lockUserCouponForOrderInDb: async () => null,
    ...extra,
  });
  vm.runInContext(`${pure}\n${wallet}\nthis.helpers = { couponRolloutBucket, couponRolloutEligible, couponIdFromRequest, couponSceneForOrderKind, publicCouponForClient, prepareCouponForWalletOrder, applyCouponFieldsToWalletOrder };`, context);
  return context.helpers;
}

function loadCouponRowHelpers(extra = {}) {
  const source = sourceBetween(database, "function couponDbInstant", "async function getCouponTemplateByCodeInDb");
  const context = vm.createContext({ Date, Number, String, Boolean, Object, Array, ...extra });
  vm.runInContext(`${source}\nthis.helpers = { couponFromRow, couponTemplateFromRow };`, context);
  return context.helpers;
}

function loadDatabaseCouponHelpers(extra = {}) {
  const source = sourceBetween(database, "function couponDbInstant", "function referralWithdrawalFromRow");
  const context = vm.createContext({
    crypto,
    Date,
    Math,
    Number,
    String,
    Boolean,
    Array,
    Object,
    console,
    dbEnabled: () => true,
    ensureSchema: async () => {},
    query: async () => ({ rows: [] }),
    getPool: () => ({ connect: async () => null }),
    ...extra,
  });
  vm.runInContext(`${source}\nthis.helpers = {
    couponFromRow,
    couponTemplateFromRow,
    couponSceneMatches,
    getAvailableCouponsInDb,
    lockUserCouponForOrderInDb,
    finalizeUserCouponForOrderInDb,
    releaseUserCouponForOrderInDb,
    backfillZeroBalanceCouponsInDb
  };`, context);
  return context.helpers;
}

function loadAvailabilityHelpers(listUserCouponsInDb) {
  const source = sourceBetween(database, "function couponSceneMatches", "async function lockUserCouponForOrderInDb");
  const context = vm.createContext({ Date, Number, String, Boolean, Array, Object, dbEnabled: () => true, listUserCouponsInDb });
  vm.runInContext(`${source}\nthis.helpers = { couponSceneMatches, getAvailableCouponsInDb };`, context);
  return context.helpers;
}

test("cash coupon template keeps the approved value, threshold, and unclaimed lifetime", () => {
  assert.match(database, /'NEWUSER_30_5OFF', '新用户专享券', 1, 500, 'USD', 3000, 0, 'recharge,membership', 7, 0, 0, 'register', 1/);
  assert.match(database, /CREATE UNIQUE INDEX IF NOT EXISTS user_coupon_user_template_uidx ON user_coupon \(user_id, template_id\)/);
  assert.match(database, /expire_at TIMESTAMPTZ,/);
  assert.match(database, /status SMALLINT NOT NULL DEFAULT 0/);
  assert.match(database, /UPDATE user_coupon\s+SET status = 4\s+WHERE user_id = \$1 AND status = 1 AND expire_at IS NOT NULL AND expire_at <= NOW\(\)/);
  assert.doesNotMatch(database, /UPDATE user_coupon\s+SET status = 4[\s\S]{0,100}WHERE[^;]*status = 0/);
});

test("coupon rows expose effective promo threshold and never invent an expiry", () => {
  const { couponFromRow, couponTemplateFromRow } = loadCouponRowHelpers();
  const pending = couponFromRow({
    id: "coupon_1",
    status: 0,
    face_value: "500",
    threshold: "3000",
    promo_threshold: "5000",
    scope: "recharge,membership",
    valid_days: "7",
    granted_at: "2026-11-19T00:00:00.000Z",
    expire_at: null,
  });
  assert.equal(pending.status, 0);
  assert.equal(pending.faceValue, 500);
  assert.equal(pending.threshold, 5000);
  assert.equal(pending.baseThreshold, 3000);
  assert.equal(pending.expireAt, "");
  assert.equal(couponTemplateFromRow({ threshold: 3000, promo_threshold: 0 }).effectiveThreshold, 3000);
  assert.equal(couponTemplateFromRow({ threshold: 3000, promo_threshold: 5000 }).effectiveThreshold, 5000);
});

test("claiming is a single-row transition with a seven-day expiry", () => {
  const claim = sourceBetween(database, "async function claimUserCouponInDb", "async function markUserCouponRiskInDb");
  assert.match(claim, /FOR UPDATE OF c/);
  assert.match(claim, /SET status = 1,\s+claimed_at = NOW\(\),\s+expire_at = NOW\(\) \+ make_interval\(days => t\.valid_days\)/);
  assert.match(claim, /WHERE c\.id = \$1 AND c\.user_id = \$2 AND c\.status = 0/);
  assert.match(claim, /else if \(Number\(row\.status\) !== 1\)/);
  assert.match(claim, /return couponFromRow\(row\)/);
});

test("availability applies scene, threshold, expiry, lock, and risk rules", () => {
  const available = sourceBetween(database, "async function getAvailableCouponsInDb", "async function lockUserCouponForOrderInDb");
  assert.match(available, /coupon\.status === 0[\s\S]*not_claimed/);
  assert.match(available, /coupon\.status === 4[\s\S]*expired/);
  assert.match(available, /couponSceneMatches\(coupon\.scope, scene\)/);
  assert.match(available, /coupon\.riskFlag[\s\S]*risk_review/);
  assert.match(available, /amount < coupon\.threshold[\s\S]*below_threshold/);
  assert.match(available, /coupon\.status === 2 && coupon\.lockExpireAt && Date\.parse\(coupon\.lockExpireAt\) > Date\.now\(\)/);
});

test("availability returns only coupons that can be used on the current order", async () => {
  const future = new Date(Date.now() + 60_000).toISOString();
  const helpers = loadAvailabilityHelpers(async () => [
      { couponId: "pending", status: 0, faceValue: 500, threshold: 3000, scope: "recharge" },
      { couponId: "risk", status: 1, riskFlag: true, faceValue: 500, threshold: 3000, scope: "recharge", expireAt: future },
      { couponId: "locked", status: 2, faceValue: 500, threshold: 3000, scope: "recharge", expireAt: future, lockExpireAt: future },
      { couponId: "low", status: 1, faceValue: 500, threshold: 5000, scope: "recharge", expireAt: future },
      { couponId: "wrong-scene", status: 1, faceValue: 500, threshold: 3000, scope: "membership", expireAt: future },
      { couponId: "usable", status: 1, faceValue: 500, threshold: 3000, scope: "recharge", expireAt: future },
  ]);
  const result = await helpers.getAvailableCouponsInDb({ userId: "user_1", amountCents: 3000, scene: "recharge" });
  assert.deepEqual(Array.from(result.available, (coupon) => coupon.couponId), ["usable"]);
  assert.equal(result.best, "usable");
  assert.equal(result.bestCoupon.discountAmount, 500);
  assert.equal(result.blockedReason, "not_claimed");
});

test("order creation locks a coupon for fifteen minutes and is idempotent for the same order", async () => {
  const row = {
    id: "coupon_1",
    user_id: "user_1",
    template_id: "1",
    code: "CPTEST",
    status: 1,
    face_value: 500,
    threshold: 3000,
    effective_threshold: 3000,
    promo_threshold: 0,
    scope: "recharge,membership",
    valid_days: 7,
    expire_at: new Date(Date.now() + 86_400_000).toISOString(),
    lock_order_no: "",
    lock_expire_at: null,
    risk_flag: 0,
  };
  const calls = [];
  const client = {
    release() {},
    async query(sql, params = []) {
      calls.push({ sql: String(sql).trim(), params });
      if (/^BEGIN|^COMMIT|^ROLLBACK/.test(String(sql).trim())) return { rows: [] };
      if (/SELECT c\.\*/.test(sql)) return { rows: [row] };
      if (/UPDATE user_coupon/.test(sql)) {
        return { rows: [{ ...row, status: 2, lock_order_no: params[1], lock_expire_at: new Date(Date.now() + 900_000).toISOString() }] };
      }
      return { rows: [] };
    },
  };
  const helpers = loadDatabaseCouponHelpers({ getPool: () => ({ connect: async () => client }) });
  const locked = await helpers.lockUserCouponForOrderInDb({
    userId: "user_1",
    couponId: "coupon_1",
    orderId: "order_1",
    amountCents: 3000,
    scene: "recharge",
  });
  assert.equal(locked.status, 2);
  assert.equal(locked.lockOrderNo, "order_1");
  assert.ok(calls.some((call) => /INTERVAL '15 minutes'/.test(call.sql)));

  const repeatedCalls = [];
  const sameOrderClient = {
    release() {},
    async query(sql) {
      repeatedCalls.push(String(sql).trim());
      if (/^BEGIN|^COMMIT|^ROLLBACK/.test(String(sql).trim())) return { rows: [] };
      return { rows: [{ ...row, status: 2, lock_order_no: "order_1", lock_expire_at: new Date(Date.now() + 900_000).toISOString() }] };
    },
  };
  const repeatedHelpers = loadDatabaseCouponHelpers({ getPool: () => ({ connect: async () => sameOrderClient }) });
  const repeated = await repeatedHelpers.lockUserCouponForOrderInDb({
    userId: "user_1",
    couponId: "coupon_1",
    orderId: "order_1",
    amountCents: 3000,
    scene: "recharge",
  });
  assert.equal(repeated.status, 2);
  assert.equal(repeatedCalls.filter((sql) => /UPDATE user_coupon/.test(sql)).length, 0);
});

test("coupon lock enforces scene, risk, threshold, ownership, and expiry", async () => {
  const baseRow = {
    id: "coupon_1",
    user_id: "user_1",
    status: 1,
    face_value: 500,
    threshold: 3000,
    effective_threshold: 3000,
    promo_threshold: 0,
    scope: "recharge",
    expire_at: new Date(Date.now() + 86_400_000).toISOString(),
    lock_expire_at: null,
    risk_flag: 0,
  };
  async function lockWith(row, overrides = {}) {
    const client = {
      release() {},
      async query(sql, params = []) {
        const text = String(sql).trim();
        if (/^BEGIN|^COMMIT|^ROLLBACK/.test(text)) return { rows: [] };
        if (/SELECT c\.\*/.test(sql)) return { rows: row ? [row] : [] };
        if (/UPDATE user_coupon/.test(sql)) return { rows: [{ ...row, status: 2, lock_order_no: params[1] }] };
        return { rows: [] };
      },
    };
    const helpers = loadDatabaseCouponHelpers({ getPool: () => ({ connect: async () => client }) });
    return helpers.lockUserCouponForOrderInDb({
      userId: "user_1",
      couponId: "coupon_1",
      orderId: "order_1",
      amountCents: 3000,
      scene: "recharge",
      ...overrides,
    });
  }
  await assert.rejects(lockWith({ ...baseRow, risk_flag: 1 }), /manual review/i);
  await assert.rejects(lockWith({ ...baseRow, expire_at: new Date(Date.now() - 1000).toISOString() }), /expired/i);
  await assert.rejects(lockWith(baseRow, { amountCents: 2000 }), /threshold/i);
  await assert.rejects(lockWith(baseRow, { scene: "membership" }), /scene/i);
  await assert.rejects(lockWith({ ...baseRow, status: 2, lock_order_no: "other", lock_expire_at: new Date(Date.now() + 60_000).toISOString() }), /locked/i);
  await assert.rejects(lockWith(null), /not found/i);
  const recovered = await lockWith({ ...baseRow, status: 2, lock_order_no: "old", lock_expire_at: new Date(Date.now() - 1000).toISOString() });
  assert.equal(recovered.status, 2);
  assert.equal(recovered.lockOrderNo, "order_1");
});

test("wallet coupon quote keeps the original package value and credits", async () => {
  const helpers = loadServerCouponHelpers({
    lockUserCouponForOrderInDb: async ({ amountCents, orderId, scene }) => ({
      couponId: "coupon_1",
      code: "CPTEST",
      faceValue: 500,
      lockExpireAt: new Date(Date.now() + 900_000).toISOString(),
      amountCents,
      orderId,
      scene,
    }),
  });
  const quote = await helpers.prepareCouponForWalletOrder({
    userId: "user_1",
    couponId: "coupon_1",
    orderId: "order_1",
    amountCents: 3000,
    scene: "recharge",
  });
  assert.equal(quote.originalAmountCents, 3000);
  assert.equal(quote.discountAmountCents, 500);
  assert.equal(quote.payAmountCents, 2500);
  const order = helpers.applyCouponFieldsToWalletOrder({ baseAmount: 30, creditAmount: 3000 }, quote);
  assert.equal(order.payableAmount, 25);
  assert.equal(order.payableAmountText, "25.00");
  assert.equal(order.creditAmount, 3000);
  const untouched = await helpers.prepareCouponForWalletOrder({ amountCents: 2000, scene: "recharge" });
  assert.equal(untouched.payAmountCents, 2000);
  assert.equal(untouched.discountAmountCents, 0);
});

test("settlement finalization allows late payment, is order-idempotent, and never restores on refund", () => {
  const finalize = sourceBetween(database, "async function finalizeUserCouponForOrderInDb", "async function releaseUserCouponForOrderInDb");
  assert.match(finalize, /status <> 0/);
  assert.doesNotMatch(finalize, /(^|[^_])expire_at\s*=/m);
  assert.match(finalize, /used_order_no IS NULL OR used_order_no = '' OR used_order_no = \$2/);
  assert.match(finalize, /lock_order_no IS NULL[\s\S]*lock_order_no = ''[\s\S]*lock_order_no = \$2/);
  const release = sourceBetween(database, "async function releaseUserCouponForOrderInDb", "async function backfillZeroBalanceCouponsInDb");
  assert.match(release, /status = CASE WHEN expire_at IS NOT NULL AND expire_at <= NOW\(\) THEN 4 ELSE 1 END/);
  const part34 = read("server.parts/part-34.js");
  const airwallexRefund = sourceBetween(part34, 'name === "refund.received"', "order.airwallexRefundedAt = new Date().toISOString()");
  assert.doesNotMatch(airwallexRefund, /coupon/i);
  const stripeRefund = sourceBetween(part34, 'if (event.type === "charge.refunded")', 'if (event.type === "checkout.session.async_payment_failed"');
  assert.doesNotMatch(stripeRefund, /coupon/i);
});

test("scene mapping and 30 percent rollout are deterministic", () => {
  const zero = loadServerCouponHelpers({ process: { env: { COUPON_ROLLOUT_PERCENT: "0" } } });
  const hundred = loadServerCouponHelpers({ process: { env: { COUPON_ROLLOUT_PERCENT: "100" } } });
  const thirty = loadServerCouponHelpers({ process: { env: { COUPON_ROLLOUT_PERCENT: "30" } } });
  assert.equal(zero.couponRolloutEligible("user_1"), false);
  assert.equal(hundred.couponRolloutEligible("user_1"), true);
  assert.equal(thirty.couponRolloutBucket("user_1"), thirty.couponRolloutBucket("user_1"));
  assert.equal(thirty.couponRolloutEligible("user_1"), thirty.couponRolloutBucket("user_1") < 30);
  assert.equal(thirty.couponSceneForOrderKind("topup"), "recharge");
  assert.equal(thirty.couponSceneForOrderKind("subscription"), "membership");
  assert.equal(thirty.couponSceneForOrderKind("product"), "product");
});

test("one-time backfill is idempotent and stops on an unexpected cohort size", () => {
  const { evaluateBackfillCounts, parseArgs } = require("../ops/archive/backfill-coupon-20261119");
  assert.deepEqual(evaluateBackfillCounts({ targetCount: 603, existingBackfillCount: 0, expected: 603 }), {
    targetCount: 603,
    existingBackfillCount: 0,
    expected: 603,
    alreadyComplete: false,
    safeToApply: true,
  });
  assert.equal(evaluateBackfillCounts({ targetCount: 503, existingBackfillCount: 100, expected: 603 }).safeToApply, true);
  assert.equal(evaluateBackfillCounts({ targetCount: 0, existingBackfillCount: 603, expected: 603 }).alreadyComplete, true);
  assert.equal(evaluateBackfillCounts({ targetCount: 602, existingBackfillCount: 0, expected: 603 }).safeToApply, false);
  assert.equal(evaluateBackfillCounts({ targetCount: 601, existingBackfillCount: 0, expected: 603, allowMismatch: true }).safeToApply, true);
  assert.equal(parseArgs(["--apply", "--expected", "603"]).apply, true);
  assert.equal(parseArgs(["--dry-run"]).apply, false);
  assert.doesNotMatch(read("ops/archive/backfill-coupon-20261119.js"), /(^|[^_])expire_at\s*=/m);
  assert.doesNotMatch(sourceBetween(database, "async function backfillZeroBalanceCouponsInDb", "function referralWithdrawalFromRow"), /expire_at\s*=/);
});

test("frontend coupon center shows review coupons, red dots pending coupons, and uses Shanghai calendar days", () => {
  const frontend = read("platform.coupon.js");
  const dateSource = sourceBetween(frontend, "function shanghaiDateKey", "function readStorage");
  const context = vm.createContext({ Intl, Date });
  vm.runInContext(`${dateSource}\nthis.dateKey = shanghaiDateKey;`, context);
  assert.equal(context.dateKey(new Date("2026-11-19T15:59:59.000Z")), "2026-11-19");
  assert.equal(context.dateKey(new Date("2026-11-19T16:00:00.000Z")), "2026-11-20");
  assert.match(frontend, /coupon_modal_shown_date/);
  assert.match(frontend, /coupon_reminder_dismissed_date/);
  assert.match(frontend, /const available = ui\.available\.filter\(\(coupon\) => Number\(coupon\.status\) === 1\)/);
  assert.match(frontend, /if \(coupon\.risk_review\)[\s\S]*Under review[\s\S]*审核中/);
  assert.match(frontend, /els\.centerNavDot\.hidden = !signedIn \|\| !hasPendingCoupon\(\)/);
  assert.match(frontend, /if \(!coupon \|\| Number\(coupon\.status\) !== 1 \|\| coupon\.risk_review\) return false/);
});

test("all four checkout families accept coupon ids and charge the discounted amount", () => {
  const stripeAirwallexUsdt = read("server.parts/part-34.js");
  const paypal = read("server.parts/part-35.js");
  assert.equal((stripeAirwallexUsdt.match(/couponIdFromRequest\(body\)/g) || []).length, 4);
  assert.equal((paypal.match(/couponIdFromRequest\(body\)/g) || []).length, 2);
  assert.match(stripeAirwallexUsdt, /const payment = makeUniquePaymentAmount\(coupon\.payAmountCents \/ 100, suffixDigits\)/);
  assert.match(stripeAirwallexUsdt, /createWalletOrderInDb\(couponOrder\)/);
  assert.match(stripeAirwallexUsdt, /stripeCheckoutUrl\(couponOrder\.id/);
  assert.match(paypal, /const amountValue = paypalMoneyValue\(coupon\.payAmountCents \/ 100\)/);
  assert.match(paypal, /paypalOrderBodyForCheckout[\s\S]*order\.payableAmount/);
  const publicOrder = paypal.slice(paypal.indexOf("function publicTopupOrder"));
  assert.match(publicOrder, /originalAmountCents/);
  assert.match(publicOrder, /discountAmountCents/);
  assert.match(publicOrder, /payAmountCents/);
  assert.match(publicOrder, /couponId/);
});

test("payment settlement grants original credits first, then finalizes the coupon retryably", () => {
  const settlement = sourceBetween(read("server.parts/part-13.js"), "async function settleWalletOrderPaymentUnlocked", "async function settleWalletOrderPayment(");
  const creditIndex = settlement.indexOf("await changeUserCredits(db, order.userId, creditDelta");
  const finalizeIndex = settlement.indexOf("await finalizeUserCouponForOrderInDb");
  assert.ok(creditIndex >= 0 && finalizeIndex > creditIndex);
  assert.match(settlement, /const creditDelta = creditsAmount\(order\.creditAmount \?\? Number\(order\.baseAmount \|\| 0\) \* creditsPerUsd\)/);
  assert.match(settlement, /order\.orderKind === "topup" \|\| order\.orderKind === "subscription"/);
  assert.match(settlement, /COUPON_FINALIZE_FAILED/);
  assert.match(settlement, /callback retryable/);
  assert.doesNotMatch(settlement, /releaseUserCouponForOrderInDb/);
});

test("registration flows issue coupons and public APIs keep pending coupons non-expiring", () => {
  const auth = read("server.parts/part-32.js");
  assert.equal((auth.match(/issueRegistrationCouponIfEligible\(/g) || []).length, 3);
  assert.match(read("server.parts/part-42.js"), /\/api\/coupon\/list/);
  assert.match(read("server.parts/part-42.js"), /\/api\/coupon\/claim/);
  assert.match(read("server.parts/part-42.js"), /\/api\/coupon\/available/);
  assert.match(serverCoupon, /requireUser\(req, res, \{ loadDb: false \}\)/);
  assert.match(serverCoupon, /expire_at: coupon\.status === 0 \? null : coupon\.expireAt/);
  assert.match(serverCoupon, /risk_review: Boolean\(coupon\.riskFlag\)/);
  assert.match(serverCoupon, /coupon = await markUserCouponRiskInDb\(auth\.user\.id, couponId, 1\) \|\| coupon/);
});

test("coupon assets are exposed by the runtime and release snapshot", () => {
  assert.match(read("platform.html"), /platform\.coupon\.css\?v=coupon-20261119-1/);
  assert.match(read("platform.html"), /platform\.js\?v=coupon-20261119-1/);
  assert.match(read("platform.js"), /"platform\.coupon\.js"/);
  assert.match(read("server.parts/part-01.js"), /"platform\.coupon\.css"/);
  assert.match(read("site-http.js"), /"\/platform\.coupon\.css"/);
  assert.match(read("scripts/build_release_snapshot.py"), /"platform\.coupon\.css"/);
  assert.match(read("scripts/sync_old_to_new2.py"), /"platform\.coupon\.css"/);
});
