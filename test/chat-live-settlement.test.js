"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const serverSource = fs.readFileSync(path.join(root, "server.js"), "utf8");
const dbSource = fs.readFileSync(path.join(root, "db.js"), "utf8");
const {
  chatLiveUpstreamBillingEvidence,
  chatLiveDisplayUpstreamEvidence,
  chatLiveSettlementDecision,
  chatLivePaidCoverageStatus,
  chatLiveBillableLimitSeconds,
  chatLiveSettlementBilling,
  chatLiveDisplayBilling,
  chatLiveSettlementLedgerAdjustment,
} = require(path.join(root, "server.js"));

const anomalySession = {
  id: "live-session-1",
  liveId: "1012328549924745216",
  userId: "999900190271877120",
  createdAt: "2026-10-26T15:44:10.000Z",
  maxMinutes: 10,
  freeSeconds: 0,
  saleCreditsPerMinute: 90,
};

function decision(session, detail) {
  return chatLiveSettlementDecision({ session, detail });
}

test("Vidu on_live and ending snapshots never settle even with billed_seconds=6498", () => {
  for (const status of ["on_live", "ending", "pending", "starting", "unknown", "", "   "]) {
    const result = decision(anomalySession, {
      live: { id: anomalySession.liveId, status, billed_seconds: 6498, __waitTimedOut: true },
      __waitTimedOut: true,
    });
    assert.equal(result.terminalStatus, false, status || "(empty)");
    assert.equal(result.shouldFinalize, false, status || "(empty)");
  }
});

test("Vidu terminal status requires authoritative billed_seconds", () => {
  for (const status of ["ended", "failed", "closed"]) {
    const result = decision(anomalySession, { live: { id: anomalySession.liveId, status } });
    assert.equal(result.terminalStatus, true, status);
    assert.equal(result.terminalBillingKnown, false, status);
    assert.equal(result.shouldFinalize, false, status);
  }
});

test("Vidu terminal 6498-second anomaly keeps the exact upstream evidence", () => {
  const result = decision(anomalySession, {
    live: {
      id: anomalySession.liveId,
      status: "ended",
      billed_seconds: 6498,
      credits_cost: 6498,
      close_reason: "credit_insufficient",
    },
  });
  assert.equal(result.terminalStatus, true);
  assert.equal(result.terminalBillingKnown, true);
  assert.equal(result.shouldFinalize, true);
  assert.deepEqual(result.billingEvidence, { known: true, seconds: 6498 });
  assert.equal(result.finalBilledSeconds, 108 * 60 + 18);
});

test("invalid billed_seconds is never authoritative evidence", () => {
  for (const value of [null, undefined, "", "   ", "unknown", true, false, -1, NaN, Infinity, [6498], {}, "0x10", "1e3", "-1"]) {
    const evidence = chatLiveUpstreamBillingEvidence({ billed_seconds: value });
    assert.equal(evidence.known, false, String(value));
  }
  assert.deepEqual(chatLiveUpstreamBillingEvidence({ billed_seconds: "6498" }), { known: true, seconds: 6498 });
  assert.deepEqual(chatLiveUpstreamBillingEvidence({ billed_seconds: 0 }), { known: true, seconds: 0 });
});

test("direct settlement details are accepted only for terminal upstream status", () => {
  assert.equal(decision(anomalySession, { status: "ended", billed_seconds: 100 }).shouldFinalize, true);
  assert.equal(decision(anomalySession, { status: "closed", billed_seconds: "100" }).shouldFinalize, true);
  assert.equal(decision(anomalySession, { status: "on_live", billed_seconds: 100 }).shouldFinalize, false);
  assert.equal(decision(anomalySession, null).shouldFinalize, false);
});

test("customer billing caps the 6498-second upstream anomaly at the product limit", () => {
  const billing = chatLiveSettlementBilling(anomalySession, 6498);
  assert.equal(billing.upstreamSeconds, 6498);
  assert.equal(billing.billingLimitSeconds, 600);
  assert.equal(billing.cappedUpstreamSeconds, 600);
  assert.equal(billing.freeSeconds, 0);
  assert.equal(billing.chargeableSeconds, 600);
  assert.equal(billing.chargeCredits, 900);
});

test("billing subtracts free seconds after capping and clamps maxMinutes", () => {
  const billing = chatLiveSettlementBilling({ ...anomalySession, freeSeconds: 15 }, 6498);
  assert.equal(billing.cappedUpstreamSeconds, 600);
  assert.equal(billing.chargeableSeconds, 585);
  assert.equal(billing.chargeCredits, 878);
  assert.equal(chatLiveBillableLimitSeconds({ maxMinutes: 0 }), 600);
  assert.equal(chatLiveBillableLimitSeconds({ maxMinutes: 10.5 }), 630);
  assert.equal(chatLiveBillableLimitSeconds({ maxMinutes: 999 }), 7200);
});

test("user-facing billing never exposes an upstream duration above the product limit", () => {
  const display = chatLiveDisplayBilling({
    ...anomalySession,
    billingPolicy: "entry",
    billableStartedAt: "2026-10-26T15:44:10.000Z",
    endedAt: "2026-10-26T17:32:28.000Z",
  }, 6498);
  assert.equal(display.upstreamSeconds, 6498);
  assert.equal(display.billingLimitSeconds, 600);
  assert.equal(display.cappedUpstreamSeconds, 600);
  assert.equal(display.billedSeconds, 600);
  assert.match(serverSource, /function publicChatLiveSession[\s\S]*?Math\.min\([\s\S]*?billingLimitSeconds,[\s\S]*?Number\(session\.billedSeconds/);
  assert.match(serverSource, /upstreamBilledSeconds,[\s\S]*?billingLimitSeconds: displayBilling\.billingLimitSeconds/);
});

test("user-facing display ignores in-progress and malformed upstream duration", () => {
  for (const detail of [
    { live: { status: "on_live", billed_seconds: 6498 } },
    { live: { status: "ending", billed_seconds: 6498 } },
    { live: { status: "ended", billed_seconds: "invalid" } },
    { live: { status: "ended" } },
  ]) {
    const display = chatLiveDisplayUpstreamEvidence(anomalySession, detail);
    assert.equal(display.known, false);
    assert.equal(display.seconds, 0);
  }
  assert.deepEqual(
    chatLiveDisplayUpstreamEvidence(anomalySession, { live: { status: "ended", billed_seconds: 6498 } }),
    { known: true, seconds: 6498, source: "terminal_upstream" },
  );
  assert.deepEqual(
    chatLiveDisplayUpstreamEvidence({ ...anomalySession, settled: true, upstreamBilledSeconds: 6498 }, null),
    { known: true, seconds: 6498, source: "settled_session" },
  );
});

test("ledger adjustment computes an exact supplemental charge or refund", () => {
  assert.deepEqual(chatLiveSettlementLedgerAdjustment({ netCharge: 15 }, 900), {
    known: true,
    expected: 900,
    actual: 15,
    chargeDue: 885,
    refundDue: 0,
    matches: false,
  });
  assert.deepEqual(chatLiveSettlementLedgerAdjustment({ netCharge: 950 }, 900), {
    known: true,
    expected: 900,
    actual: 950,
    chargeDue: 0,
    refundDue: 50,
    matches: false,
  });
  assert.deepEqual(chatLiveSettlementLedgerAdjustment({ netCharge: 900 }, 900), {
    known: true,
    expected: 900,
    actual: 900,
    chargeDue: 0,
    refundDue: 0,
    matches: true,
  });
  assert.equal(chatLiveSettlementLedgerAdjustment(null, 900).matches, false);
});

test("a repeated settlement sees a reconciled ledger and therefore makes no second adjustment", () => {
  const first = chatLiveSettlementLedgerAdjustment({ netCharge: 30 }, 900);
  assert.equal(first.chargeDue, 870);
  const afterRetry = chatLiveSettlementLedgerAdjustment({ netCharge: 900 }, 900);
  assert.equal(afterRetry.chargeDue, 0);
  assert.equal(afterRetry.refundDue, 0);
  assert.equal(afterRetry.matches, true);
});

test("retry after a committed supplemental charge only reconciles the remaining difference", () => {
  const expected = chatLiveSettlementBilling(anomalySession, 6498).chargeCredits;
  const afterFirstCharge = chatLiveSettlementLedgerAdjustment({ netCharge: 300 }, expected);
  assert.equal(afterFirstCharge.chargeDue, 600);
  assert.equal(afterFirstCharge.matches, false);
  const committedChargeOnRetry = chatLiveSettlementLedgerAdjustment({ netCharge: 900 }, expected);
  assert.equal(committedChargeOnRetry.chargeDue, 0);
  assert.equal(committedChargeOnRetry.refundDue, 0);
  assert.equal(committedChargeOnRetry.matches, true);
});

test("retry after a committed settlement refund never issues a duplicate refund", () => {
  const expected = chatLiveSettlementBilling(anomalySession, 100).chargeCredits;
  const beforeRefund = chatLiveSettlementLedgerAdjustment({ netCharge: expected + 50 }, expected);
  assert.equal(beforeRefund.refundDue, 50);
  const afterRefund = chatLiveSettlementLedgerAdjustment({ netCharge: expected }, expected);
  assert.equal(afterRefund.refundDue, 0);
  assert.equal(afterRefund.chargeDue, 0);
  assert.equal(afterRefund.matches, true);
});

test("partial adjustment retries converge on the exact expected charge", () => {
  const expected = chatLiveSettlementBilling(anomalySession, 6498).chargeCredits;
  const stages = [0, 300, 875, 899.5, 900];
  for (const netCharge of stages) {
    const adjustment = chatLiveSettlementLedgerAdjustment({ netCharge }, expected);
    assert.equal(adjustment.expected, 900);
    assert.equal(adjustment.chargeDue, Math.max(0, expected - netCharge));
    assert.equal(adjustment.refundDue, Math.max(0, netCharge - expected));
    assert.equal(adjustment.matches, netCharge === expected);
  }
});

test("sessions without a live id keep the existing non-upstream settlement path", () => {
  const result = decision({ ...anomalySession, liveId: "" }, null);
  assert.equal(result.shouldFinalize, true);
  assert.equal(result.finalBilledSeconds, 0);
});

test("cumulative free allocation uses finalized usage and legacy sessions stay readable", () => {
  assert.match(serverSource, /function chatLiveFreeAllocationSeconds\(session = \{\}\) \{/);
  assert.match(serverSource, /session\.freeAllocationVersion === "cumulative_v1"/);
  assert.match(serverSource, /session\.freeAllocationFinalized === true \|\| Boolean\(session\.freeAllocationFinalizedAt\)/);
  assert.match(serverSource, /finalized \? session\.freeUsedSeconds : session\.freeAllocatedSeconds/);
  assert.match(serverSource, /return Math\.max\(0, Number\(session\.freeSeconds \|\| 0\) \|\| 0\);/);
});

test("both room entry and new session creation prepare cumulative free allocation", () => {
  const joinBlock = serverSource.match(/async function handleJoinChatLiveRoom\([\s\S]*?\n}\n\nasync function handleListChatLiveRoomMessages/)[0];
  const createBlock = serverSource.match(/async function handleCreateChatLiveSession\([\s\S]*?\n}\n\nfunction sanitizeChatLiveDiagnosticText/)[0];
  assert.match(joinBlock, /entry = await prepareChatLiveFreeEntry\(\{/);
  assert.match(createBlock, /entry = await prepareChatLiveFreeEntry\(\{/);
  assert.match(joinBlock, /freeAllocationVersion: "cumulative_v1"/);
  assert.match(createBlock, /freeAllocationVersion: "cumulative_v1"/);
});

test("free exhaustion rejects insufficient credits before any Vidu request", () => {
  const createBlock = serverSource.match(/async function handleCreateChatLiveSession\([\s\S]*?\n}\n\nfunction sanitizeChatLiveDiagnosticText/)[0];
  const prepareCall = createBlock.indexOf("entry = await prepareChatLiveFreeEntry({");
  const viduCall = createBlock.indexOf('viduLiveRequestRetry("/live/s_avatar/realtime"');
  assert.ok(prepareCall >= 0 && viduCall > prepareCall);
  assert.match(createBlock, /code: "CHAT_LIVE_INSUFFICIENT_CREDITS"/);
  assert.match(serverSource, /wrapped\.code = insufficient \? "CHAT_LIVE_INSUFFICIENT_CREDITS"/);
  assert.match(serverSource, /const initialPrepaidSeconds = Math\.max\(/);
  assert.match(serverSource, /CHAT_LIVE_BILLING_BLOCK_SECONDS - Math\.min\(freeAllocatedSeconds, CHAT_LIVE_BILLING_BLOCK_SECONDS\)/);
  assert.match(createBlock, /免费时长已用完或不足以覆盖完整计费块，且当前积分不足，无法进入直播间。/);
});

test("partial free allocation reserves enough paid seconds before Vidu", () => {
  const prepareBlock = serverSource.match(/async function prepareChatLiveFreeEntry\([\s\S]*?\n}\n\nasync function rollbackChatLiveEntryAllocation/)[0];
  assert.match(prepareBlock, /const initialPrepaidSeconds = Math\.max\(/);
  assert.match(prepareBlock, /CHAT_LIVE_BILLING_BLOCK_SECONDS - Math\.min\(freeAllocatedSeconds, CHAT_LIVE_BILLING_BLOCK_SECONDS\)/);
  assert.match(prepareBlock, /if \(initialPrepaidSeconds > 0\) \{/);
  assert.match(prepareBlock, /reserveChatLiveBlock\(auth, \{[\s\S]*?\}, initialPrepaidSeconds\)/);
  assert.match(prepareBlock, /cancelChatLiveFreeAllocationInDb\(sessionId\)/);
  assert.match(prepareBlock, /wrapped\.statusCode = insufficient \? 402/);
});

test("entry persistence failures recover under the settlement lock and roll back holds", () => {
  const recoveryBlock = serverSource.match(/async function createChatLiveSessionWithEntryRecovery\([\s\S]*?\n}\n\nasync function handleJoinChatLiveRoom/)[0];
  assert.match(recoveryBlock, /createChatLiveSessionInDb\(session\)/);
  assert.match(recoveryBlock, /chatLiveComponent\.stopComponentSession\?\.\(componentLiveId\)/);
  assert.match(recoveryBlock, /await withChatLiveSessionSettlementLockInDb\(stored\.id, async \(lockedSession\) =>/);
  assert.doesNotMatch(recoveryBlock, /updateChatLiveSessionInDb\(/);
  const failureBranch = recoveryBlock.match(/const next = settled\s*\? \{([\s\S]*?)\}\s*:\s*\{/)[1];
  assert.doesNotMatch(failureBranch, /status:|settled:|settledAt:|endedAt:|billedSeconds:|chargedCredits:|refundedCredits:|holdSettled:/);
  assert.match(failureBranch, /entryRecoveryError/);
  assert.match(recoveryBlock, /status: "failed"/);
  assert.match(recoveryBlock, /settled: true/);
  assert.match(recoveryBlock, /rollbackChatLiveEntryAllocation\(session\?\.id \|\| "", auth, hold/);
  const persistedBranch = recoveryBlock.slice(
    recoveryBlock.indexOf("persisted = await createChatLiveSessionInDb(session);"),
    recoveryBlock.indexOf("} catch (error) {"),
  );
  assert.match(persistedBranch, /post_create_failed/);
  assert.match(persistedBranch, /withChatLiveSessionSettlementLockInDb\(persisted\.id/);
  assert.doesNotMatch(persistedBranch, /rollbackChatLiveEntryAllocation|cancelChatLiveFreeAllocationInDb|refundChatLiveHold/);
  const joinBlock = serverSource.match(/async function handleJoinChatLiveRoom\([\s\S]*?\n}\n\nasync function handleListChatLiveRoomMessages/)[0];
  const createBlock = serverSource.match(/async function handleCreateChatLiveSession\([\s\S]*?\n}\n\nfunction sanitizeChatLiveDiagnosticText/)[0];
  assert.match(joinBlock, /createChatLiveSessionWithEntryRecovery\(/);
  assert.match(createBlock, /createChatLiveSessionWithEntryRecovery\(/);
  assert.match(joinBlock, /join event failed/);
  assert.match(createBlock, /component join event failed/);
  assert.match(recoveryBlock, /if \(persisted\?\.id\) \{/);
  assert.match(recoveryBlock, /persisted_session_kept/);
  assert.doesNotMatch(serverSource, /updateChatLiveSessionInDb\(/);
});

test("entry rollback keeps free usage immutable after finalization and refunds holds idempotently", () => {
  const rollbackBlock = serverSource.match(/async function rollbackChatLiveEntryAllocation\([\s\S]*?\n}\n\nasync function createChatLiveSessionWithEntryRecovery/)[0];
  assert.match(rollbackBlock, /cancelChatLiveFreeAllocationInDb\(sessionId\)/);
  assert.match(rollbackBlock, /refundChatLiveHold\(auth, session \|\| \{ id: sessionId, liveId: "pending" \}, hold\.credits, hold\.holdId\)/);
  assert.match(rollbackBlock, /\[chat-live-entry-rollback-failed\]/);
  assert.doesNotMatch(rollbackBlock, /\.catch\(\(\) => \{\}\)/);
  assert.match(dbSource, /if \(row\.finalized === true\) \{[\s\S]*?return false;[\s\S]*?DELETE FROM app_chat_live_free_allocations/);
  assert.match(serverSource, /const refundId = session\.id \+ ':hold-refund:' \+ \(holdId \|\| Date\.now\(\)\);/);
  assert.match(serverSource, /taskId: refundId/);
});

test("settlement finalizes free usage inside the settlement lock and caps used seconds", () => {
  const settlementBlock = serverSource.match(/async function settleChatLiveSession\([\s\S]*?\n}\n\nasync function chargeChatLiveSettlementBalance/)[0];
  assert.match(settlementBlock, /withChatLiveSessionSettlementLockInDb\(initial\.id, async \(lockedSession\) =>/);
  assert.match(settlementBlock, /finalizeChatLiveFreeAllocationInDb\(/);
  assert.match(settlementBlock, /chatLiveBillableLimitSeconds\(current\)/);
  assert.match(settlementBlock, /client,\n      \);/);
  assert.match(settlementBlock, /const billing = chatLiveSettlementBilling\(billingSession, finalUpstreamSeconds\);/);
});

test("free allocation mutations serialize on one per-user advisory lock", () => {
  assert.match(dbSource, /function chatLiveFreeAdvisoryKey\(tenantId = DEFAULT_TENANT_ID, userId = ""\)/);
  assert.match(dbSource, /chat-live-free:\$\{normalizeTenantId\(tenantId\)\}:\$\{String\(userId \|\| ""\)\.trim\(\)\}/);
  const allocateBlock = dbSource.match(/async function allocateChatLiveFreeSecondsInDb\([\s\S]*?\n}\n\nasync function finalizeChatLiveFreeAllocationInDb/)[0];
  const finalizeBlock = dbSource.match(/async function finalizeChatLiveFreeAllocationInDb\([\s\S]*?\n}\n\nasync function cancelChatLiveFreeAllocationInDb/)[0];
  const cancelBlock = dbSource.match(/async function cancelChatLiveFreeAllocationInDb\([\s\S]*?\n}\n\n\/\*\n \* An allocation is reserved/)[0];
  for (const block of [allocateBlock, finalizeBlock, cancelBlock]) {
    assert.match(block, /pg_advisory_xact_lock\(hashtext\(\$1\)\)/);
    assert.match(block, /chatLiveFreeAdvisoryKey\(/);
  }
  assert.match(allocateBlock, /CHAT_LIVE_FREE_ALLOCATION_CONFLICT/);
  assert.match(finalizeBlock, /CHAT_LIVE_FREE_ALLOCATION_CONFLICT/);
  assert.match(cancelBlock, /CHAT_LIVE_FREE_ALLOCATION_CONFLICT/);
});

test("orphan allocation cleanup only releases old reservations without a session", () => {
  assert.match(dbSource, /async function cleanupOrphanedChatLiveFreeAllocationsInDb/);
  const cleanupBlock = dbSource.match(/async function cleanupOrphanedChatLiveFreeAllocationsInDb\([\s\S]*?\n}\n\nasync function listChatLiveSessionsInDb/)[0];
  assert.match(cleanupBlock, /LEFT JOIN app_chat_live_sessions/);
  assert.match(cleanupBlock, /a\.finalized = FALSE/);
  assert.match(cleanupBlock, /a\.created_at <= NOW\(\) - \(\$1 \* INTERVAL '1 second'\)/);
  assert.match(cleanupBlock, /pg_advisory_xact_lock\(hashtext\(\$1\)\)/);
  assert.match(cleanupBlock, /SELECT 1 FROM app_chat_live_sessions WHERE id = \$1/);
  assert.match(serverSource, /setInterval\(\(\) => cleanupOrphanedChatLiveFreeAllocations\(\).*10 \* 60 \* 1000/);
});

test("free allocation requires PostgreSQL and has no flat-file fallback", () => {
  const allocateBlock = dbSource.match(/async function allocateChatLiveFreeSecondsInDb\([\s\S]*?\n}\n\nasync function finalizeChatLiveFreeAllocationInDb/)[0];
  assert.match(allocateBlock, /if \(!dbEnabled\(\)\) throw new Error\("DATABASE_URL is required for chat-live free usage"\);/);
  assert.doesNotMatch(allocateBlock, /readDb\(|writeDb\(|\.json/);
});

test("settlement source is gated by terminal evidence and exact ledger reconciliation", () => {
  assert.match(serverSource, /const terminalBillingKnown = Boolean\(detail\) && terminalStatus && billingEvidence\.known;/);
  assert.match(serverSource, /const shouldFinalize = sharedRoomViewer \|\| !hasLiveId \|\| terminalBillingKnown;/);
  const settlementBlock = serverSource.match(/async function settleChatLiveSession\([\s\S]*?\n}\n\nasync function chargeChatLiveSettlementBalance/);
  assert.ok(settlementBlock, "settlement function is present");
  assert.match(settlementBlock[0], /const billing = chatLiveSettlementBilling\(billingSession, finalUpstreamSeconds\);/);
  assert.match(settlementBlock[0], /let ledgerAdjustment = chatLiveSettlementLedgerAdjustment\(null, billing\.chargeCredits\);/);
  assert.match(settlementBlock[0], /ledgerAdjustment = chatLiveSettlementLedgerAdjustment\(ledgerTotals, billing\.chargeCredits\);/);
  assert.match(settlementBlock[0], /const canFinalizeBilling = shouldFinalize && \(auth \? ledgerAdjustment\.matches : billing\.chargeCredits <= 0\);/);
  assert.match(settlementBlock[0], /settled: canFinalizeBilling/);
  assert.match(settlementBlock[0], /billedSeconds: canFinalizeBilling \? billing\.cappedUpstreamSeconds/);
  assert.match(settlementBlock[0], /upstreamBilledSeconds,/);
  assert.doesNotMatch(settlementBlock[0], /Math\.min\([^;\n]*prepaidSeconds|prepaidSeconds[^;\n]*Math\.min/);
  assert.doesNotMatch(settlementBlock[0], /const shouldFinalize = terminalStatus \|\| abandoned/);
});

test("ledger adjustments use attempt-suffixed idempotent task ids", () => {
  const adjustmentBlock = serverSource.slice(
    serverSource.indexOf("async function chargeChatLiveSettlementBalance"),
    serverSource.indexOf("async function chargeChatLiveSession"),
  );
  assert.match(adjustmentBlock, /type: "chat_live_settlement"/);
  assert.match(adjustmentBlock, /type: "chat_live_settlement_refund"/);
  assert.match(adjustmentBlock, /const taskId = `\$\{session\.id\}:settlement:\$\{attempt\}`;/);
  assert.match(adjustmentBlock, /const taskId = `\$\{session\.id\}:settlement-refund:\$\{attempt\}`;/);
  assert.match(adjustmentBlock, /amount: -amount/);
});

test("upstream terminal monitor settles instead of reserving another prepaid block", () => {
  const monitorBlock = serverSource.match(/async function monitorChatLiveSession\([\s\S]*?\n}\n\nasync function handleEndChatLiveSession/)[0];
  assert.match(monitorBlock, /const terminalStatus = chatLiveUpstreamIsTerminal\(liveStatus\);/);
  assert.match(monitorBlock, /if \(terminalStatus\) \{/);
  assert.match(monitorBlock, /shouldSettle: sharedRoomViewer \|\| billingEvidence\.known/);
  assert.match(monitorBlock, /return await settleChatLiveSessionById\(next\.id\)/);
  const terminalBranch = monitorBlock.match(/if \(terminalStatus\) \{[\s\S]*?\n      \}/)[0];
  assert.doesNotMatch(terminalBranch, /reserveChatLiveBlock|refundChatLiveHold|billingBlocked/);
  assert.match(monitorBlock, /const topUpTarget = Math\.min\(/);
  assert.match(monitorBlock, /prepaidBeforeTopUp \+ CHAT_LIVE_BILLING_TARGET_SECONDS/);
});

test("paid coverage starts exactly when cumulative free allowance is exhausted", () => {
  const beforeExhaustion = chatLivePaidCoverageStatus({
    freeAllocationVersion: "cumulative_v1",
    freeAllocatedSeconds: 30,
    prepaidSeconds: 10,
  }, 29);
  assert.deepEqual(beforeExhaustion, {
    observedLiveSeconds: 29,
    freeSeconds: 30,
    paidSeconds: 0,
    prepaidSeconds: 10,
    paidCoverageRemainingSeconds: 10,
    hasPaidCoverage: true,
  });

  const firstPaidSecond = chatLivePaidCoverageStatus({
    freeAllocationVersion: "cumulative_v1",
    freeAllocatedSeconds: 30,
    prepaidSeconds: 10,
  }, 31);
  assert.equal(firstPaidSecond.paidSeconds, 1);
  assert.equal(firstPaidSecond.paidCoverageRemainingSeconds, 9);
  assert.equal(firstPaidSecond.hasPaidCoverage, true);
});

test("renewal failure keeps watching while earlier prepaid coverage remains", () => {
  const stillCovered = chatLivePaidCoverageStatus({
    freeAllocationVersion: "cumulative_v1",
    freeAllocatedSeconds: 3,
    prepaidSeconds: 7,
  }, 5);
  assert.equal(stillCovered.paidSeconds, 2);
  assert.equal(stillCovered.paidCoverageRemainingSeconds, 5);
  assert.equal(stillCovered.hasPaidCoverage, true);

  const exhausted = chatLivePaidCoverageStatus({
    freeAllocationVersion: "cumulative_v1",
    freeAllocatedSeconds: 3,
    prepaidSeconds: 7,
  }, 10);
  assert.equal(exhausted.paidSeconds, 7);
  assert.equal(exhausted.paidCoverageRemainingSeconds, 0);
  assert.equal(exhausted.hasPaidCoverage, false);
});

test("free allowance boundary monitor only closes after prepaid coverage is exhausted", () => {
  const monitorBlock = serverSource.match(/async function monitorChatLiveSession\([\s\S]*?\n}\n\nasync function handleEndChatLiveSession/)[0];
  assert.match(monitorBlock, /const coverage = chatLivePaidCoverageStatus\(current, observedLiveSeconds\);/);
  assert.match(monitorBlock, /const \{ freeSeconds, paidSeconds \} = coverage;/);
  assert.match(monitorBlock, /if \(freeSeconds > 0 && observedLiveSeconds < freeSeconds\)/);
  assert.match(monitorBlock, /if \(!sharedRoomViewer && !current\.billableStartedAt/);
  assert.match(monitorBlock, /const coverageAfterFailure = chatLivePaidCoverageStatus\(/);
  assert.match(monitorBlock, /if \(coverageAfterFailure\.hasPaidCoverage\) \{/);
  assert.match(monitorBlock, /event: "prepaid_coverage_active"/);
  assert.match(monitorBlock, /billingBlocked: false/);
  assert.match(monitorBlock, /shouldSettle: false, closeInsufficient: false/);
  assert.match(monitorBlock, /current\.billingBlocked = !coverageAfterTopUp\.hasPaidCoverage && observedLiveSeconds > 0;/);
  assert.match(monitorBlock, /current\.endReason = 'insufficient_credits';/);
  assert.match(monitorBlock, /return \{ session: blocked, value: \{ session: blocked, shouldSettle: true, closeInsufficient: true \} \};/);
});

test("monitor and settlement share a session-level PostgreSQL transaction lock", () => {
  assert.match(dbSource, /async function withChatLiveSessionSettlementLockInDb/);
  assert.match(dbSource, /pg_advisory_xact_lock\(hashtext\(\$1\)\)/);
  assert.match(dbSource, /chat-live-settlement:\$\{id\}/);
  assert.match(dbSource, /SELECT payload FROM app_chat_live_sessions WHERE id = \$1 FOR UPDATE/);
  assert.match(serverSource, /withChatLiveSessionSettlementLockInDb\(initial\.id, async \(lockedSession\) =>/);
  assert.match(serverSource, /withChatLiveSessionSettlementLockInDb\(session\.id, async \(lockedSession\) =>/);
  const settlementBlock = serverSource.match(/async function settleChatLiveSession\([\s\S]*?\n}\n\nasync function chargeChatLiveSettlementBalance/)[0];
  const monitorBlock = serverSource.match(/async function monitorChatLiveSession\([\s\S]*?\n}\n\nasync function handleEndChatLiveSession/)[0];
  assert.doesNotMatch(settlementBlock, /await updateChatLiveSessionInDb\(/);
  assert.doesNotMatch(monitorBlock, /await updateChatLiveSessionInDb\(/);
});

test("runtime diagnostics use atomic JSON updates instead of stale whole-session writes", () => {
  const readyBlock = serverSource.match(/async function handleMarkChatLiveReady\([\s\S]*?\n}\n\nasync function handleReportChatLiveOperation/)[0];
  const operationBlock = serverSource.match(/async function handleReportChatLiveOperation\([\s\S]*?\n}\n\nfunction normalizeChatLiveUpstreamStatus/)[0];
  for (const block of [readyBlock, operationBlock]) {
    assert.match(block, /appendChatLiveDiagnosticInDb\(/);
    assert.doesNotMatch(block, /updateChatLiveSessionInDb\(/);
  }
  assert.match(operationBlock, /touchChatLiveSessionInDb\(id\)/);
  const diagnosticBlock = serverSource.match(/async function appendChatLiveDiagnosticInDb\([\s\S]*?\n}\n\nasync function touchChatLiveSessionInDb/)[0];
  assert.match(diagnosticBlock, /jsonb_set\(/);
  assert.match(diagnosticBlock, /payload->'diagnostics'/);
  assert.doesNotMatch(diagnosticBlock, /jsonb_set\([^;]+\{[^}]*status/i);
  const touchBlock = serverSource.match(/async function touchChatLiveSessionInDb\([\s\S]*?\n}\n\nasync function handleMarkChatLiveReady/)[0];
  assert.match(touchBlock, /payload->>'settled'/);
  assert.match(touchBlock, /payload->>'status'/);
});

test("issue and late-end request updates merge metadata only under the settlement lock", () => {
  assert.doesNotMatch(serverSource, /saveChatLiveSessionIssues/);
  const issueBlock = serverSource.match(/async function handleReportChatLiveSessionIssue\([\s\S]*?\n}\n\nasync function handleSaveChatLiveStoryState/)[0];
  assert.match(issueBlock, /withChatLiveSessionSettlementLockInDb\(id, async \(lockedSession\) =>/);
  assert.match(issueBlock, /appendChatLiveDiagnostic\(lockedSession,/);
  assert.doesNotMatch(issueBlock, /updateChatLiveSessionInDb\(/);

  const endBlock = serverSource.match(/async function handleEndChatLiveSession\([\s\S]*?\n}\n\nasync function handleReportChatLiveSessionIssue/)[0];
  assert.match(endBlock, /withChatLiveSessionSettlementLockInDb\(session\.id, async \(lockedSession\) =>/);
  assert.doesNotMatch(endBlock, /updateChatLiveSessionInDb\(/);
  const settledBranch = endBlock.match(/if \(session\.status === "ended" && session\.settled === true\) \{[\s\S]*?\n  }\n  const settled = /)[0];
  assert.match(settledBranch, /withChatLiveSessionSettlementLockInDb\(session\.id/);
  assert.match(settledBranch, /clientEndReason:/);
  assert.match(settledBranch, /clientEndNote:/);
  assert.match(settledBranch, /issues,/);
  assert.doesNotMatch(settledBranch, /settled:\s*false|billedSeconds:|chargedCredits:|refundedCredits:|status:\s*"ended"/);
  assert.match(settledBranch, /settleChatLiveSession\(updated, \{ auth \}\)/);
});

test("reconnect waits for settlement and cannot overwrite a committed settlement", () => {
  const releaseBlock = serverSource.match(/async function releaseChatLiveForReconnect\([\s\S]*?\n}\n\nfunction chatLiveSessionStillOpen/)[0];
  assert.match(releaseBlock, /withChatLiveSessionSettlementLockInDb\(session\.id/);
  assert.doesNotMatch(releaseBlock, /await updateChatLiveSessionInDb\(/);
  assert.match(releaseBlock, /const settled = await settleChatLiveSessionById\(session\.id\);/);
  assert.match(releaseBlock, /CHAT_LIVE_PREVIOUS_SESSION_SETTLEMENT_PENDING/);
  assert.match(releaseBlock, /statusCode = 503/);
  assert.doesNotMatch(releaseBlock, /settleChatLiveSessionById\([^)]*\)\.catch\(/);
  const giftBlock = serverSource.match(/async function handleChatLiveGift\([\s\S]*?\n}\n\nasync function handleChatLiveLook/)?.[0]
    || serverSource.slice(
      serverSource.indexOf("async function handleChatLiveGift"),
      serverSource.indexOf("async function handleChatLiveLook"),
    );
  assert.ok(giftBlock);
  assert.match(giftBlock, /withChatLiveSessionSettlementLockInDb\(session\.id/);
  const reactivationBlock = giftBlock.slice(giftBlock.indexOf('if (["ended", "closed", "failed"].includes(status))'), giftBlock.indexOf("const body = await readJson(req); const live"));
  assert.doesNotMatch(reactivationBlock, /updateChatLiveSessionInDb/);
});

test("settlement sweep scans all unsettled database rows", () => {
  assert.match(serverSource, /sessions = await listUnsettledChatLiveSessionsInDb\(\{ limit: 50, minAgeSeconds: 60 \}\);/);
  assert.doesNotMatch(serverSource, /sessions = await listChatLiveSessionsInDb\(\{ limit: 30 \}\);/);
  assert.match(dbSource, /async function listUnsettledChatLiveSessionsInDb/);
  assert.match(dbSource, /COALESCE\(payload->>'settled', 'false'\) NOT IN \('true', '1'\)/);
  assert.match(dbSource, /app_chat_live_sessions_unsettled_idx/);
});

test("ledger totals are scoped to the exact session and reconcile all chat-live rows", () => {
  const ledgerBlock = serverSource.match(/async function chatLiveLedgerTotalsInDb\([\s\S]*?\n}\n\nfunction chatLiveHoldRefundDue/);
  const ledgerSource = ledgerBlock?.[0] || serverSource.match(/async function chatLiveLedgerTotalsInDb\([\s\S]*?\n}\n\nasync function settleChatLiveSession/)[0];
  assert.match(ledgerSource, /COALESCE\(SUM\(delta\), 0\)::numeric AS net_delta/);
  assert.match(ledgerSource, /type = 'chat_live_hold'/);
  assert.match(ledgerSource, /chat_live_hold_subtoken_refund/);
  assert.match(ledgerSource, /chat_live_settlement_refund/);
  assert.match(ledgerSource, /chat_live_settlement_subtoken_refund/);
  assert.match(ledgerSource, /meta->>'sessionId'/);
  assert.match(ledgerSource, /\) = \$2/);
});

test("production code contains no one-off patch for the historical anomaly identifiers", () => {
  const productionSource = fs.readFileSync(path.join(root, "server.js"), "utf8")
    + fs.readFileSync(path.join(root, "db.js"), "utf8");
  assert.doesNotMatch(productionSource, /999900190271877120|1012328549924745216|6498/);
});

test("admin diagnostics distinguish raw upstream seconds from billable seconds", () => {
  const adminSource = fs.readFileSync(path.join(root, "admin.js"), "utf8");
  assert.match(adminSource, /上游计费秒数/);
  assert.match(adminSource, /产品计费上限（秒）/);
  assert.match(adminSource, /计费秒数/);
  assert.match(adminSource, /计费来源/);
  assert.match(adminSource, /主播上游计费秒数/);
  assert.match(adminSource, /terminal_upstream: "Vidu 终态权威"/);
  assert.match(adminSource, /shared_viewer_local: "观众本地进房时长"/);
  assert.match(adminSource, /video_ready: "首帧诊断"/);
  assert.doesNotMatch(adminSource, /未显示画面/);
  assert.doesNotMatch(adminSource, /video_ready: "首帧计时"/);
});

test("terminal video calls become idempotent private-chat history entries", () => {
  const historyBlock = serverSource.match(/async function persistChatLiveCallHistory\([\s\S]*?\n}\n\nasync function settleChatLiveSession/)[0];
  assert.match(historyBlock, /chatLiveSessionHistoryTerminal\(session\)/);
  assert.match(serverSource, /function chatLiveSessionHistoryTerminal/);
  assert.match(serverSource, /CHAT_LIVE_UPSTREAM_TERMINAL_STATUSES\.has\(status\)/);
  assert.match(serverSource, /CHAT_LIVE_UPSTREAM_TERMINAL_STATUSES\.has\(upstreamStatus\)/);
  assert.match(serverSource, /Boolean\(String\(session\.endedAt \|\| ""\)\.trim\(\)\)/);
  assert.match(historyBlock, /chatLiveHistoryDurationSeconds\(session\)/);
  assert.match(historyBlock, /findChatConversationByCharacterInDb\(userId, characterId\)/);
  assert.match(historyBlock, /id: `chat-live-history-\$\{userId\}-\$\{characterId\}`/);
  assert.match(historyBlock, /id: `video-call-\$\{sessionId\}`/);
  assert.match(historyBlock, /kind: "video_call"/);
  assert.match(historyBlock, /视频通话 · \$\{duration\} · 已结束/);
  assert.match(historyBlock, /shouldUpdateConversation/);
  assert.match(historyBlock, /insertChatMessagesIfAbsentInDb\(\[message\], shouldUpdateConversation \? nextConversation : null\)/);
  assert.doesNotMatch(historyBlock, /billedSeconds > 0/);
  assert.match(serverSource, /if \(chatLiveSessionHistoryTerminal\(updated\)\) \{\s*try \{\s*await persistChatLiveCallHistory\(updated\)/);
  const retryBlock = serverSource.match(/if \(initial\.status === "ended" && initial\.settled === true\) \{[\s\S]*?return initial;\n  \}/)[0];
  assert.match(retryBlock, /persistChatLiveCallHistory\(initial\)/);
  assert.match(dbSource, /async function findChatConversationByCharacterInDb/);
  assert.match(dbSource, /WHERE user_id = \$1 AND character_id = \$2 AND deleted_at IS NULL/);
});

test("terminal call history backfill is idempotent and does not overwrite newer chat previews", () => {
  assert.match(serverSource, /listTerminalChatLiveSessionsMissingHistoryInDb\(\{ limit: 25, minAgeSeconds: 30 \}\)/);
  assert.match(serverSource, /\[chat-live-history\] backfill failed/);
  assert.match(serverSource, /persistChatLiveCallHistory\(settled \|\| updated\)/);
  assert.match(dbSource, /async function listTerminalChatLiveSessionsMissingHistoryInDb/);
  assert.match(dbSource, /LOWER\(COALESCE\(s\.payload->>'status', ''\)\) IN \('ended', 'closed', 'failed'\)/);
  assert.match(dbSource, /LOWER\(COALESCE\(s\.payload->>'upstreamStatus', ''\)\) IN \('ended', 'closed', 'failed'\)/);
  assert.match(dbSource, /COALESCE\(s\.payload->>'endedAt', ''\) <> ''/);
  assert.match(dbSource, /m\.id = 'video-call-' \|\| s\.id/);
  assert.match(dbSource, /NOT EXISTS \(/);
});

test("message thread contact enrichment keeps real video-call previews", () => {
  const liveSource = fs.readFileSync(path.join(root, "live.js"), "utf8");
  const contactsBlock = liveSource.match(/for \(const item of contacts \|\| \[\]\) \{[\s\S]*?\n    \}/)?.[0] || "";
  assert.match(contactsBlock, /video: true/);
  assert.doesNotMatch(contactsBlock, /preview: "视频连线"/);
  assert.doesNotMatch(contactsBlock, /lastMessage: \{ content: "视频连线" \}/);
  assert.match(liveSource, /if \(!item\.preview && item\.hasVideo\) item\.preview = "视频连线";/);
  assert.doesNotMatch(liveSource, /视频连线 · \$\{textPreview\}/);
});

test("ending a video call requires confirmation and keeps the live thread in sync", () => {
  const chatLiveSource = fs.readFileSync(path.join(root, "chat-live.js"), "utf8");
  const liveSource = fs.readFileSync(path.join(root, "live.js"), "utf8");
  assert.match(chatLiveSource, /function requestEndCall\(\)/);
  assert.match(chatLiveSource, /function showEndCallConfirm\(\)/);
  assert.match(chatLiveSource, /overlay\.hangBtn\.onclick = requestEndCall/);
  assert.match(chatLiveSource, /overlay\.closeBtn\.onclick = requestEndCall/);
  assert.match(chatLiveSource, /结束后会停止计费，本次通话记录将保留在私信里。/);
  assert.match(chatLiveSource, /ask\.dataset\.endCall = "true"/);
  assert.doesNotMatch(chatLiveSource, /overlay\.closeBtn\.onclick = \(\) => \{\s*forceLeaveCall/);
  assert.match(liveSource, /kind === "video_call"/);
  assert.match(liveSource, /视频通话 ·/);
  assert.match(liveSource, /await refreshTextChatMessages\(state\.textChatId\)/);
});

test("support replies reach users through database-backed system notifications", () => {
  const adminSource = fs.readFileSync(path.join(root, "admin.js"), "utf8");
  const notificationBlock = dbSource.match(/async function createLiveNotificationInDb\([\s\S]*?\n}\n\nasync function listLiveNotificationsInDb/)[0];
  assert.match(notificationBlock, /INSERT INTO app_live_notifications/);
  assert.match(notificationBlock, /ON CONFLICT \(id\) DO UPDATE/);
  assert.match(notificationBlock, /WHEN app_live_notifications\.body IS DISTINCT FROM EXCLUDED\.body THEN NULL/);
  assert.doesNotMatch(notificationBlock, /readDb\(|writeDb\(|\.json/);
  const replyBlock = serverSource.match(/async function handleAdminReplySupportMessage\([\s\S]*?\n}\n\nasync function handleListApiSubtokens/)[0];
  assert.match(replyBlock, /id: `support-reply-\$\{messageId\}`/);
  assert.match(replyBlock, /kind: "support"/);
  assert.match(replyBlock, /title: "问题反馈已回复"/);
  assert.match(replyBlock, /createLiveNotificationInDb/);
  assert.match(replyBlock, /notificationSent: Boolean\(notification\)/);
  assert.match(adminSource, /已通过系统消息通知用户/);
});
