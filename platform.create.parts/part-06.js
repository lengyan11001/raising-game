async function loadHistory({
  silent = false,
  refresh = false,
  page = currentHistoryPage(),
  append = false,
  preserveMobile = false,
} = {}) {
  if (!els.historyList) return;
  if (!state.user) {
      historyRecordsSignature = "";
    renderHistory([]);
    return;
  }
  if (historyLoading || historyRefreshInFlight) {
    if (append) return;
    return;
  }
  historyLoading = true;
  historyRefreshInFlight = true;
  const previousScrollTop = els.historyList.scrollTop || 0;
  const previousRecords = Array.isArray(state.historyRecords) ? state.historyRecords : [];
  const previousPage = Number(state.historyRecordsPage || 1);
  const requestedPage = Math.max(1, Number(page || 1) || 1);
  const requestedLimit = Math.max(1, Number(state.historyRecordsLimit || 8) || 8);
  // Account data is never persisted client-side. This tiny tab-memory cache
  // only absorbs rapid navigation/click bursts; explicit refreshes and paging
  // always go to the server, and the cache is scoped to this authenticated tab.
  const cacheKey = `${state.user?.id || ""}:${requestedPage}:${requestedLimit}`;
  const cached = refresh || append ? null : historyShortCache.get(cacheKey);
  if (cached && Date.now() - cached.at <= HISTORY_SHORT_CACHE_MS) {
    historyLoading = false;
    historyRefreshInFlight = false;
    if (!silent) {
      renderHistory(cached.payload.records || []);
      historyRecordsSignature = generationRecordsSignature(cached.payload.records || []);
    }
    return cached.payload;
  }
  if (!silent && !append) els.historyList.innerHTML = `<div class="job-note">${escapeHtml(t("history.loading"))}</div>`;
  try {
    const historyUrl = `/api/generation-records?page=${encodeURIComponent(requestedPage)}&limit=${encodeURIComponent(requestedLimit)}${refresh ? "&refresh=1" : ""}`;
    const payload = await requestJson(historyUrl);
    if (!refresh && !append) historyShortCache.set(cacheKey, { at: Date.now(), payload });
    if (payload.user) setUser(payload.user);
    const incomingRecords = payload.records || [];
    const mobileLayout = isMobileHistoryLayout();
    const shouldAppend = mobileLayout && append && requestedPage > 1;
    const shouldPreserve = mobileLayout && preserveMobile && previousRecords.length > 0;
    const records = shouldAppend
      ? mergeHistoryRecordPages(previousRecords, incomingRecords)
      : shouldPreserve
        ? mergeHistoryRecordPages(incomingRecords, previousRecords)
        : incomingRecords;
    // A page can disappear while the visitor is reading it (records deleted in
    // another tab). Step back to the last page that still exists instead of
    // showing an empty list.
    const lastPage = Math.max(1, Number(payload.totalPages || 1) || 1);
    if (!append && !shouldPreserve && requestedPage > lastPage) {
          // Wait for this call to release its in-flight guard before reloading, so a
      // step-back can never overlap the request that discovered the dead page.
      window.setTimeout(() => {
        loadHistory({ silent, refresh, page: lastPage, preserveMobile }).catch(() => {});
      }, 0);
      return null;
    }
    notifyGenerationCompletionChanges(previousRecords, records);
    state.historyRecordsPage = shouldAppend || shouldPreserve
      ? Math.max(previousPage, Number(payload.page || requestedPage))
      : payload.page || requestedPage;
    state.historyRecordsLimit = payload.limit || state.historyRecordsLimit || 8;
    state.historyRecordsTotal = payload.total || records.length;
    state.historyRecordsTotalPages = payload.totalPages || 1;
    state.historyRecords = records;
    const nextSignature = generationRecordsSignature(records);
    if (!silent || shouldAppend || nextSignature !== historyRecordsSignature) {
      renderHistory(records);
      historyRecordsSignature = nextSignature;
      if (!shouldAppend) els.historyList.scrollTop = previousScrollTop;
    }
    if (state.tab === "advanced" && state.advancedSideTab === "result" && !state.advancedResultRecords?.length) {
      renderAdvancedResultPanel();
      // History is only a list snapshot. Once it supplies the fallback task,
      // fetch its detail once so a stale list status cannot survive login.
      if (state.user) refreshAdvancedResultRecord();
    }
  } catch (error) {
    // requestJson() clears the account as soon as it sees an expired or replaced
    // session. Do not replace the login-required state with a generic load
    // error, which made stale history look recoverable while logged out.
    if (!state.user) {
      historyRecordsSignature = "";
      renderHistory([]);
    } else if (!silent) {
      els.historyList.innerHTML = `<div class="job-note">${escapeHtml(t("history.loadFailed", { message: error.message || String(error) }))}</div>`;
    }
  } finally {
    historyLoading = false;
    historyRefreshInFlight = false;
  }
}

function ledgerLoginCard() {
  return `
    <div class="history-empty-card">
      <strong>${escapeHtml(t("ledger.loginRequired"))}</strong>
      <p>${escapeHtml(t("ledger.loginDesc"))}</p>
      <button class="generate-btn" type="button" data-login-ledger>${escapeHtml(t("history.login"))}</button>
    </div>
  `;
}

function ledgerParams(kind, page = 1, exportCsv = false) {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(kind === "topups" ? state.topupRecords.limit : state.spendingRecords.limit),
  });
  const controls = kind === "topups"
    ? {
        q: els.topupSearch?.value,
        status: els.topupStatus?.value,
        from: els.topupFrom?.value,
        to: els.topupTo?.value,
      }
    : {
        q: els.spendingSearch?.value,
        type: els.spendingType?.value,
        from: els.spendingFrom?.value,
        to: els.spendingTo?.value,
      };
  Object.entries(controls).forEach(([key, value]) => {
    const text = String(value || "").trim();
    if (text) params.set(key, text);
  });
  if (exportCsv) params.set("export", "csv");
  return params;
}

function renderLedgerPager(kind) {
  const data = kind === "topups" ? state.topupRecords : state.spendingRecords;
  const holder = kind === "topups" ? els.topupPager : els.spendingPager;
  if (!holder) return;
  holder.innerHTML = `
    <button class="ghost-button" type="button" data-page="prev" ${data.page <= 1 ? "disabled" : ""}>${escapeHtml(t("ledger.prev"))}</button>
    <span>${escapeHtml(t("ledger.page", { page: data.page, totalPages: data.totalPages, total: data.total }))}</span>
    <button class="ghost-button" type="button" data-page="next" ${data.page >= data.totalPages ? "disabled" : ""}>${escapeHtml(t("ledger.next"))}</button>
  `;
  holder.querySelector('[data-page="prev"]')?.addEventListener("click", () => {
    if (data.page > 1) (kind === "topups" ? loadTopupRecords : loadSpendingRecords)(data.page - 1);
  });
  holder.querySelector('[data-page="next"]')?.addEventListener("click", () => {
    if (data.page < data.totalPages) (kind === "topups" ? loadTopupRecords : loadSpendingRecords)(data.page + 1);
  });
}

function renderTopupRecords() {
  if (!els.topupTable) return;
  if (!state.user) {
    els.topupTable.innerHTML = ledgerLoginCard();
    els.topupPager.innerHTML = "";
    els.topupTable.querySelector("[data-login-ledger]")?.addEventListener("click", openLogin);
    refreshIcons();
    return;
  }
  const records = state.topupRecords.records || [];
  if (!records.length) {
    els.topupTable.innerHTML = `<div class="history-empty-card"><strong>${escapeHtml(t("ledger.empty"))}</strong></div>`;
    renderLedgerPager("topups");
    return;
  }
  els.topupTable.innerHTML = `
    <table class="ledger-table">
      <thead>
        <tr>
          <th>${escapeHtml(t("ledger.orderId"))}</th>
          <th>${escapeHtml(t("ledger.status"))}</th>
          <th>${escapeHtml(t("ledger.amount"))}</th>
          <th>${escapeHtml(t("ledger.payable"))}</th>
          <th>${escapeHtml(t("ledger.credits"))}</th>
          <th>${escapeHtml(t("ledger.createdAt"))}</th>
        </tr>
      </thead>
      <tbody>
        ${records.map((order) => `
          <tr>
            <td data-label="${escapeHtml(t("ledger.orderId"))}"><code>${escapeHtml(order.id)}</code></td>
            <td data-label="${escapeHtml(t("ledger.status"))}"><span class="ledger-badge">${escapeHtml(order.status || "")}</span></td>
            <td data-label="${escapeHtml(t("ledger.amount"))}">${escapeHtml(formatCredits(order.amount))} ${escapeHtml(order.asset || "USDT")}</td>
            <td data-label="${escapeHtml(t("ledger.payable"))}"><strong>${escapeHtml(order.payableAmountText || order.payableAmount || "")}</strong><small>${escapeHtml([order.network, order.paymentProvider === "paypal" ? order.paypalOrderId : ""].filter(Boolean).join(" · "))}</small></td>
            <td data-label="${escapeHtml(t("ledger.credits"))}">${escapeHtml(formatCredits(order.creditAmount))}</td>
            <td data-label="${escapeHtml(t("ledger.createdAt"))}">${escapeHtml(formatDateTime(order.createdAt))}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
  renderLedgerPager("topups");
}

function renderReferral() {
  const referral = state.referral || null;
  const loggedIn = Boolean(state.user);
  const loading = loggedIn && Boolean(state.referralLoading);
  const invitedCount = Number(referral?.invitedCount || 0);
  const paidInviteCount = Math.max(0, Number(referral?.paidInviteCount || 0));
  const rewardCount = Math.max(0, Number(referral?.rewardCount || 0));
  const membershipTarget = Math.max(1, Number(referral?.membershipTarget || 100));
  const registrationProgress = Math.max(0, Math.min(100, (invitedCount / membershipTarget) * 100));
  const member = creatorMembershipActive();
  const invitedUsers = Math.max(invitedCount, Number(referral?.invitedUsers || 0));
  const withdrawableUsd = Number(referral?.withdrawableUsd ?? referral?.availableWithdrawableUsd ?? referral?.withdrawableAmount ?? referral?.availableCommissionUsd ?? 0);
  const totalEarnedUsd = Number(referral?.totalEarnedUsd ?? referral?.totalCommissionUsd ?? referral?.earnedUsd ?? 0);
  if (els.referralLink) els.referralLink.textContent = loggedIn
    ? loading ? t("ledger.loading") : (referral?.inviteUrl || "")
    : t("referral.login");
  if (els.referralProgressFill) els.referralProgressFill.style.width = `${paidInviteCount ? Math.min(100, (rewardCount / paidInviteCount) * 100) : 0}%`;
  if (els.referralInvitedCount) els.referralInvitedCount.textContent = loading
    ? t("ledger.loading")
    : t("referral.invitedCount", { count: invitedCount });
  if (els.referralRewardStatus) {
    els.referralRewardStatus.textContent = loading
      ? t("ledger.loading")
      : member
      ? t("membership.rewardStatusActive", { rewardCount, paidCount: paidInviteCount })
      : t("membership.rewardStatusInactive");
  }
  if (els.referralMembershipProgressText) els.referralMembershipProgressText.textContent = loading
    ? t("ledger.loading")
    : member
    ? t("membership.activeProgress")
    : t("membership.progressCount", { count: invitedCount, target: membershipTarget });
  if (els.referralMembershipProgressFill) els.referralMembershipProgressFill.style.width = `${member ? 100 : registrationProgress}%`;
  if (els.referralInvitedUsers) els.referralInvitedUsers.textContent = loading ? t("ledger.loading") : String(invitedUsers);
  if (els.referralWithdrawable) els.referralWithdrawable.textContent = loading ? t("ledger.loading") : formatReferralUsd(withdrawableUsd);
  if (els.referralTotalEarned) els.referralTotalEarned.textContent = loading ? t("ledger.loading") : formatReferralUsd(totalEarnedUsd);
  if (els.referralWalletAddress && !loading && document.activeElement !== els.referralWalletAddress) {
    els.referralWalletAddress.value = String(referral?.walletAddress || "");
  }
  renderReferralWithdrawals(referral?.withdrawals || referral?.withdrawalRecords || []);
  if (els.referralNote) els.referralNote.textContent = loading
    ? t("ledger.loading")
    : loggedIn
    ? member
      ? t("membership.rewardNote")
      : t("membership.unlockNote", { target: membershipTarget })
    : t("referral.login");
  if (els.copyReferralBtn) els.copyReferralBtn.disabled = !loggedIn || loading || !referral?.inviteUrl;
  renderMembershipCard();
  refreshIcons();
}

const MEMBERSHIP_PRICE_USD = 99;
const MEMBERSHIP_TOPUP_BONUS_RATE = 0.2;
const MEMBERSHIP_CALCULATOR_MAX = 5000;

function membershipCalculatorValues(amount) {
  const total = Math.max(0, Math.min(MEMBERSHIP_CALCULATOR_MAX, Number(amount) || 0));
  const extra = Math.round(total * 100 * MEMBERSHIP_TOPUP_BONUS_RATE);
  const net = total * MEMBERSHIP_TOPUP_BONUS_RATE - MEMBERSHIP_PRICE_USD;
  const effective = total > 0 ? 1 / (1 + MEMBERSHIP_TOPUP_BONUS_RATE) : 1;
  const payback = (total * MEMBERSHIP_TOPUP_BONUS_RATE / MEMBERSHIP_PRICE_USD) * 100;
  return { total, extra, net, effective, payback };
}

function drawMembershipCalculatorCurve(current) {
  const svg = els.membershipCalculatorCurve;
  if (!svg) return;
  const width = 640;
  const height = 130;
  const pad = 6;
  const points = [];
  for (let amount = 0; amount <= MEMBERSHIP_CALCULATOR_MAX; amount += 50) {
    points.push([amount, membershipCalculatorValues(amount).net]);
  }
  const maxNet = Math.max(50, ...points.map(([, net]) => net));
  const minNet = -MEMBERSHIP_PRICE_USD;
  const sx = (amount) => pad + (amount / MEMBERSHIP_CALCULATOR_MAX) * (width - pad * 2);
  const sy = (net) => height - pad - ((net - minNet) / (maxNet - minNet)) * (height - pad * 2);
  const zeroY = sy(0);
  const curve = points.map(([amount, net], index) => `${index ? "L" : "M"}${sx(amount).toFixed(1)} ${sy(net).toFixed(1)}`).join(" ");
  const currentNet = membershipCalculatorValues(current).net;
  const currentX = sx(current);
  const currentY = sy(currentNet);
  const area = `${curve} L${sx(MEMBERSHIP_CALCULATOR_MAX)} ${zeroY} L${sx(0)} ${zeroY} Z`;
  svg.innerHTML = `
    <defs><linearGradient id="membershipCurveGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#FFC24D" stop-opacity=".34"/><stop offset="100%" stop-color="#FFC24D" stop-opacity="0"/></linearGradient></defs>
    <line x1="${pad}" y1="${zeroY}" x2="${width - pad}" y2="${zeroY}" stroke="rgba(255,255,255,.18)" stroke-width="1" stroke-dasharray="3 3"/>
    <path d="${area}" fill="url(#membershipCurveGradient)"/>
    <path d="${curve}" fill="none" stroke="#FFC24D" stroke-width="2" stroke-linejoin="round"/>
    <circle cx="${currentX.toFixed(1)}" cy="${currentY.toFixed(1)}" r="11" fill="#F04496" opacity=".22"/>
    <circle cx="${currentX.toFixed(1)}" cy="${currentY.toFixed(1)}" r="5" fill="#fff" stroke="#F04496" stroke-width="2.5"/>
    <text x="${Math.min(currentX + 12, width - 90).toFixed(1)}" y="${Math.max(currentY - 9, 12).toFixed(1)}" fill="#FFD9A8" font-size="12" font-weight="700">${currentNet >= 0 ? "+" : "−"}$${Math.abs(currentNet).toFixed(0)}</text>`;
}

function renderMembershipCalculator() {
  const range = els.membershipCalculatorRange;
  if (!range) return;
  const values = membershipCalculatorValues(range.value);
  const paybackLabel = t("membership.calculatorPayback");
  const breakEven = Math.ceil(MEMBERSHIP_PRICE_USD / MEMBERSHIP_TOPUP_BONUS_RATE);
  if (els.membershipCalculatorAmount) els.membershipCalculatorAmount.textContent = `$${formatCredits(values.total)}`;
  if (els.membershipCalculatorExtra) {
    els.membershipCalculatorExtra.innerHTML = `${escapeHtml(formatCredits(values.extra))} <small>${escapeHtml(t("common.credits"))}</small>`;
  }
  if (els.membershipCalculatorDiscount) {
    els.membershipCalculatorDiscount.innerHTML = `${escapeHtml((values.effective * 100).toFixed(1).replace(/\.0$/, ""))}<small>%</small>`;
  }
  if (els.membershipCalculatorNet) {
    els.membershipCalculatorNet.textContent = `${values.net >= 0 ? "+" : "−"}$${formatCredits(Math.abs(values.net).toFixed(0))}`;
    els.membershipCalculatorNet.classList.toggle("is-positive", values.net >= 0);
    els.membershipCalculatorNet.classList.toggle("is-pending", values.net < 0);
  }
  if (els.membershipCalculatorProgressText) {
    const progress = Math.round(values.payback);
    els.membershipCalculatorProgressText.textContent = values.net >= 0
      ? `${Math.round(MEMBERSHIP_PRICE_USD + values.net)} / $${MEMBERSHIP_PRICE_USD} · ${progress}%`
      : `$${formatCredits(values.total)} / $${breakEven} · ${Math.max(0, progress)}%`;
    els.membershipCalculatorProgressText.dataset.label = paybackLabel;
  }
  if (els.membershipCalculatorProgressFill) {
    els.membershipCalculatorProgressFill.style.width = `${Math.max(0, Math.min(100, values.payback))}%`;
    els.membershipCalculatorProgressFill.closest(".membership-calculator-progress")?.classList.toggle("is-complete", values.net >= 0);
  }
  if (els.membershipCalculatorVerdict) {
    els.membershipCalculatorVerdict.textContent = values.net >= 0
      ? t("membership.calculatorVerdictReturned", { amount: `$${breakEven}`, net: formatCredits(values.net.toFixed(0)) })
      : t("membership.calculatorVerdictPending", { amount: `$${breakEven}`, remaining: formatCredits((MEMBERSHIP_PRICE_USD - values.net).toFixed(0)) });
  }
  range.style.setProperty("--membership-progress", `${((values.total - Number(range.min || 50)) / (Number(range.max || MEMBERSHIP_CALCULATOR_MAX) - Number(range.min || 50))) * 100}%`);
  drawMembershipCalculatorCurve(values.total);
}

function bindMembershipCalculator() {
  const range = els.membershipCalculatorRange;
  if (!range || range.dataset.membershipCalculatorBound === "1") {
    renderMembershipCalculator();
    return;
  }
  range.dataset.membershipCalculatorBound = "1";
  range.addEventListener("input", renderMembershipCalculator);
  renderMembershipCalculator();
}

function renderMembershipCard() {
  if (!els.membershipCard) return;
  els.membershipCard.hidden = !membershipProgramEnabled();
  if (els.topupMembershipLink) els.topupMembershipLink.hidden = !membershipProgramEnabled() || creatorMembershipActive();
  if (!membershipProgramEnabled()) return;
  const active = creatorMembershipActive();
  if (els.membershipState) {
    els.membershipState.textContent = t(active ? "membership.active" : "membership.notActive");
    els.membershipState.classList.toggle("is-active", active);
  }
  if (els.buyMembershipBtn) {
    els.buyMembershipBtn.hidden = active;
    els.buyMembershipBtn.disabled = !state.user;
  }
  if (els.membershipCodeForm) els.membershipCodeForm.hidden = active;
  if (els.membershipNote && active) els.membershipNote.textContent = t("membership.activeNote");
  bindMembershipCalculator();
}

async function startEntitlementCheckout(body = {}, statusElement = null) {
  if (!state.user) return openLogin();
  if (statusElement) statusElement.textContent = "Creating secure checkout...";
  const returnUrl = `${window.location.origin}${window.location.pathname}#${state.tab || "referral"}`;
  try {
    const payload = await requestJson("/api/pay/stripe/checkout-sessions", {
      method: "POST",
      body: { ...body, returnUrl, cancelUrl: returnUrl },
    });
    const checkoutUrl = String(payload.checkoutUrl || payload.session?.checkoutUrl || "").trim();
    if (!checkoutUrl) throw new Error("Stripe checkout page was not created.");
    window.location.href = checkoutUrl;
  } catch (error) {
    if (statusElement) statusElement.textContent = error.message || String(error);
  }
}

function openBillingPaymentChoice({ billingPlanId = "", productId = "", statusElement = null } = {}) {
  if (!state.user) return openLogin();
  const plan = billingPlanId
    ? (typeof billingPlans === "function" ? billingPlans() : []).find((item) => item.id === billingPlanId)
    : null;
  const product = productId
    ? (state.billing?.products || []).find((item) => item.id === productId)
    : null;
  if (!plan && !product) {
    if (statusElement) statusElement.textContent = "This product is not available.";
    return;
  }
  if (product?.owned) {
    if (statusElement) statusElement.textContent = "This product is already active.";
    return;
  }
  if (statusElement) statusElement.textContent = "";
  state.selectedBillingPlanId = plan?.id || "";
  if (product) state.selectedProductId = product.id;
  else state.selectedProductId = "";
  state.selectedTopupPackageId = "";
  prepareModalOpen();
  setTopupMethod("stripe", { skipSummary: true });
  setTopupStep("payment");
  renderTopupSummary();
  if (!els.topupDialog?.open) els.topupDialog?.showModal();
  if (stripeCheckoutVisible()) renderStripeCheckout();
  syncTopupAutoRefresh();
  refreshIcons();
}

function openEntitlementPaymentChoice(productId = "", statusElement = null) {
  return openBillingPaymentChoice({ productId, statusElement });
}

async function redeemMembershipCode(event) {
  event?.preventDefault?.();
  if (!state.user) return openLogin();
  const code = String(els.membershipCodeInput?.value || "").trim();
  if (!code) {
    if (els.membershipNote) els.membershipNote.textContent = t("membership.enterCode");
    return;
  }
  if (els.redeemMembershipCodeBtn) els.redeemMembershipCodeBtn.disabled = true;
  if (els.membershipNote) els.membershipNote.textContent = t("membership.redeeming");
  try {
    const payload = await requestJson("/api/membership/redeem", { method: "POST", body: { code } });
    if (payload.user) setUser(payload.user, { skipReferralRefresh: true });
    if (typeof refreshCaseLibraryAccess === "function") refreshCaseLibraryAccess();
    if (state.billing) state.billing = { ...state.billing, membership: payload.membership || state.billing.membership };
    if (els.membershipCodeInput) els.membershipCodeInput.value = "";
    if (els.membershipNote) els.membershipNote.textContent = t("membership.activated");
    await loadReferralSummary({ force: true });
    await refreshExploreMembershipAccess();
    await loadBillingSummary();
    renderMembershipCard();
  } catch (error) {
    if (els.membershipNote) els.membershipNote.textContent = error.message || String(error);
  } finally {
    if (els.redeemMembershipCodeBtn) els.redeemMembershipCodeBtn.disabled = false;
  }
}

async function loadReferralSummary({ force = false } = {}) {
  if (!state.user) {
    state.referral = null;
    state.referralLoadedUserId = "";
    state.referralLoadedAt = 0;
    renderReferral();
    return;
  }
  const userId = state.user.id || state.user.username || "";
  if (state.referralLoading) return;
  if (!force && state.referralLoadedUserId === userId && Number(state.referralLoadedAt || 0) > 0) {
    renderReferral();
    return;
  }
  state.referralLoading = true;
  // Render a stable loading state before the request starts so the panel does
  // not briefly expose the previous user's or previous request's values.
  renderReferral();
  try {
    const payload = await requestJson("/api/referral");
    let withdrawals = [];
    try {
      const withdrawalPayload = await requestJson("/api/referral/withdrawals?limit=20");
      withdrawals = withdrawalPayload.records || withdrawalPayload.withdrawals || [];
    } catch { /* summary remains usable if history endpoint is unavailable */ }
    state.referral = payload.referral ? { ...payload.referral, withdrawals } : null;
    state.referralLoadedUserId = userId;
    state.referralLoadedAt = Date.now();
    if (payload.user) setUser(payload.user, { skipReferralRefresh: true });
  } catch (error) {
    if (els.referralNote) els.referralNote.textContent = error.message || String(error);
  } finally {
    state.referralLoading = false;
  }
  renderReferral();
}

function renderSpendingTypeOptions(types = []) {
  if (!els.spendingType) return;
  const current = els.spendingType.value;
  els.spendingType.innerHTML = `<option value="">${escapeHtml(t("ledger.allTypes"))}</option>${types.map((type) => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`).join("")}`;
  if (types.includes(current)) els.spendingType.value = current;
}

function renderSpendingRecords() {
  if (!els.spendingTable) return;
  if (!state.user) {
    els.spendingTable.innerHTML = ledgerLoginCard();
    els.spendingPager.innerHTML = "";
    els.spendingTable.querySelector("[data-login-ledger]")?.addEventListener("click", openLogin);
    refreshIcons();
    return;
  }
  const records = state.spendingRecords.records || [];
  renderSpendingTypeOptions(state.spendingRecords.types || []);
  if (!records.length) {
    els.spendingTable.innerHTML = `<div class="history-empty-card"><strong>${escapeHtml(t("ledger.empty"))}</strong></div>`;
    renderLedgerPager("spending");
    return;
  }
  els.spendingTable.innerHTML = `
    <table class="ledger-table">
      <thead>
        <tr>
          <th>${escapeHtml(t("ledger.createdAt"))}</th>
          <th>${escapeHtml(t("ledger.type"))}</th>
          <th>${escapeHtml(t("ledger.title"))}</th>
          <th>${escapeHtml(t("ledger.credits"))}</th>
          <th>${escapeHtml(t("ledger.balanceAfter"))}</th>
          <th>${escapeHtml(t("ledger.taskId"))}</th>
        </tr>
      </thead>
      <tbody>
        ${records.map((entry) => `
          <tr>
            <td data-label="${escapeHtml(t("ledger.createdAt"))}">${escapeHtml(formatDateTime(entry.startedAt || entry.createdAt))}${entry.endedAt ? ` – ${escapeHtml(formatDateTime(entry.endedAt))}` : ""}</td>
            <td data-label="${escapeHtml(t("ledger.type"))}"><span class="ledger-badge">${escapeHtml(entry.type || "")}</span></td>
            <td data-label="${escapeHtml(t("ledger.title"))}"><strong>${escapeHtml(entry.title || entry.type || "")}</strong><small>${[entry.resolution, entry.duration ? `${entry.duration}s` : ""].filter(Boolean).join(" / ")}</small></td>
            <td data-label="${escapeHtml(t("ledger.credits"))}" class="ledger-negative">-${escapeHtml(formatCredits(entry.amount))}</td>
            <td data-label="${escapeHtml(t("ledger.balanceAfter"))}">${escapeHtml(formatCredits(entry.balanceAfter))}</td>
            <td data-label="${escapeHtml(t("ledger.taskId"))}"><code>${escapeHtml(entry.taskId || entry.id || "")}</code></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
  renderLedgerPager("spending");
}

async function loadTopupRecords(page = state.topupRecords.page || 1) {
  if (!els.topupTable) return;
  if (!state.user) {
    renderTopupRecords();
    return;
  }
  els.topupTable.innerHTML = `<div class="job-note">${escapeHtml(t("ledger.loading"))}</div>`;
  try {
    const payload = await requestJson(`/api/billing/topups?${ledgerParams("topups", page).toString()}`);
    if (payload.user) setUser(payload.user);
    state.topupRecords = {
      ...state.topupRecords,
      records: payload.records || [],
      page: payload.page || page,
      limit: payload.limit || state.topupRecords.limit,
      total: payload.total || 0,
      totalPages: payload.totalPages || 1,
    };
    renderTopupRecords();
  } catch (error) {
    els.topupTable.innerHTML = `<div class="job-note">${escapeHtml(t("ledger.loadFailed", { message: error.message || String(error) }))}</div>`;
  }
  refreshIcons();
}

function shouldAutoRefreshTopups() {
  return Boolean(
    state.user &&
    !document.hidden &&
    (state.tab === "topups" || els.topupQrDialog?.open)
  );
}

async function refreshTopupsQuietly() {
  if (!shouldAutoRefreshTopups() || state.topupRefreshInFlight) return;
  state.topupRefreshInFlight = true;
  try {
    const page = state.tab === "topups" ? (state.topupRecords.page || 1) : 1;
    const payload = await requestJson(`/api/billing/topups?${ledgerParams("topups", page).toString()}`);
    if (payload.user) setUser(payload.user);
    state.topupRecords = {
      ...state.topupRecords,
      records: payload.records || [],
      page: payload.page || page,
      limit: payload.limit || state.topupRecords.limit,
      total: payload.total || 0,
      totalPages: payload.totalPages || 1,
    };
    if (state.tab === "topups") renderTopupRecords();
    if (tenantFeature("subscriptions", false) && state.activeTopupOrder?.orderKind === "subscription") {
      await loadBillingSummary();
    }
    refreshIcons();
  } catch {
    // Keep the current table visible; the next interval can recover.
  } finally {
    state.topupRefreshInFlight = false;
  }
}

function syncTopupAutoRefresh() {
  const active = shouldAutoRefreshTopups();
  if (active && !state.topupRefreshTimer) {
    state.topupRefreshTimer = window.setInterval(refreshTopupsQuietly, TOPUP_RECORDS_AUTO_REFRESH_MS);
  } else if (!active && state.topupRefreshTimer) {
    window.clearInterval(state.topupRefreshTimer);
    state.topupRefreshTimer = 0;
  }
}

async function loadSpendingRecords(page = state.spendingRecords.page || 1) {
  if (!els.spendingTable) return;
  if (!state.user) {
    renderSpendingRecords();
    return;
  }
  els.spendingTable.innerHTML = `<div class="job-note">${escapeHtml(t("ledger.loading"))}</div>`;
  try {
    const payload = await requestJson(`/api/billing/spending?${ledgerParams("spending", page).toString()}`);
    if (payload.user) setUser(payload.user);
    state.spendingRecords = {
      ...state.spendingRecords,
      records: payload.records || [],
      types: payload.types || state.spendingRecords.types || [],
      page: payload.page || page,
      limit: payload.limit || state.spendingRecords.limit,
      total: payload.total || 0,
      totalPages: payload.totalPages || 1,
    };
    renderSpendingRecords();
  } catch (error) {
    els.spendingTable.innerHTML = `<div class="job-note">${escapeHtml(t("ledger.loadFailed", { message: error.message || String(error) }))}</div>`;
  }
  refreshIcons();
}

async function exportLedger(kind) {
  if (!state.user) return openLogin();
  const endpoint = kind === "topups" ? "/api/billing/topups" : "/api/billing/spending";
  const params = ledgerParams(kind, 1, true);
  const button = kind === "topups" ? els.exportTopupsBtn : els.exportSpendingBtn;
  const table = kind === "topups" ? els.topupTable : els.spendingTable;
  const filename = kind === "topups" ? "topup-records.csv" : "spending-records.csv";
  if (button) button.disabled = true;
  try {
    const response = await fetch(`${endpoint}?${params.toString()}`, {
      headers: state.token ? { authorization: `Bearer ${state.token}` } : {},
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.message || `Export failed: ${response.status}`);
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    if (table) {
      table.insertAdjacentHTML("afterbegin", `<div class="job-note">${escapeHtml(error.message || String(error))}</div>`);
    }
  } finally {
    if (button) button.disabled = false;
  }
}

function setLoginMethod(method = "email") {
  const emailEnabled = Boolean(state.config?.auth?.email?.enabled);
  const next = method === "password" || !emailEnabled ? "password" : "email";
  if (els.emailLoginTab) {
    const active = next === "email";
    els.emailLoginTab.classList.toggle("is-active", active);
    els.emailLoginTab.setAttribute("aria-selected", active ? "true" : "false");
  }
  if (els.passwordLoginTab) {
    const active = next === "password";
    els.passwordLoginTab.classList.toggle("is-active", active);
    els.passwordLoginTab.setAttribute("aria-selected", active ? "true" : "false");
  }
  if (els.emailLoginPanel) els.emailLoginPanel.hidden = next !== "email";
  if (els.passwordLoginPanel) els.passwordLoginPanel.hidden = next !== "password";
  if (els.loginMessage) els.loginMessage.textContent = "";
  window.requestAnimationFrame(() => {
    if (next === "email") els.loginEmail?.focus();
    else els.loginUsername?.focus();
  });
}

function openLogin() {
  if (state.user) return openAccount();
  prepareModalOpen();
  renderLoginForm();
  els.loginDialog.showModal();
  window.requestAnimationFrame(() => {
    renderGoogleLoginButton();
    setLoginMethod("email");
  });
}

function openAccount() {
  if (!state.user) return openLogin();
  prepareModalOpen();
  renderTokenDisplays();
  els.accountDialog?.showModal();
  refreshIcons();
}

function openEmailBinding({ focusEmail = false } = {}) {
  if (!state.user) return openLogin();
  if (!state.config?.auth?.email?.enabled) return openAccount();
  prepareModalOpen();
  renderTokenDisplays();
  const boundEmail = String(state.user?.email || "").trim();
  if (els.accountEmail) els.accountEmail.readOnly = Boolean(boundEmail);
  if (els.accountEmail) els.accountEmail.value = boundEmail;
  if (els.accountEmailStatus) {
    els.accountEmailStatus.textContent = boundEmail
      ? t("account.emailBindingEnabled", {}, "Email login is enabled for this account.")
      : t("account.emailBindingDesc", {}, "Bind an email to sign in with a code or reset your password.");
  }
  if (els.accountEmailBoundNote) els.accountEmailBoundNote.hidden = !boundEmail;
  if (els.accountEmailCode) els.accountEmailCode.value = "";
  if (els.accountSecurityMessage) els.accountSecurityMessage.textContent = "";
  const bindingForm = els.requestAccountEmailCodeBtn?.closest(".auth-email-row");
  if (bindingForm) bindingForm.hidden = Boolean(boundEmail);
  if (els.accountEmailCode?.parentElement) els.accountEmailCode.parentElement.hidden = Boolean(boundEmail);
  els.emailBindingDialog?.showModal();
  refreshIcons();
  if (focusEmail && !boundEmail) window.requestAnimationFrame(() => els.accountEmail?.focus());
}

async function logout() {
  if (state.logoutPending) return;
  if (state.user) {
    state.logoutPending = true;
    let confirmed = false;
    try {
      confirmed = await showInlineDialog({
        title: t("account.logoutConfirmTitle", {}, "Log out?"),
        body: `<p class="job-note">${escapeHtml(t("account.logoutConfirmBody", {}, "You will need to sign in again to view your account and generation history."))}</p>`,
        confirmText: t("account.logout", {}, "Log out"),
      }) === "confirm";
    } finally {
      state.logoutPending = false;
    }
    if (!confirmed) return;
  }
  closeMobileDrawer();
  const token = state.token;
  if (token) fetch("/api/auth/logout", { method: "POST", headers: { authorization: `Bearer ${token}` } }).catch(() => {});
  clearClientAuthState();
  els.accountDialog?.close();
  closeAccountMenu();
  if (state.tab === "topups") renderTopupRecords();
  if (state.tab === "spending") renderSpendingRecords();
  if (state.tab === "assets") renderAssets([]);
  if (state.tab === "access") renderApiSubtokens();
  if (state.tab === "referral") renderReferral();
  syncTopupAutoRefresh();
}

function renderLoginForm() {
  const label = t("nav.login");
  renderEmailLoginCodeCooldown();
  if (els.loginTitle) els.loginTitle.textContent = label;
  if (els.loginSubmit) els.loginSubmit.textContent = label;
  if (els.loginSubmit) els.loginSubmit.disabled = false;
  if (els.telegramLoginBtn) els.telegramLoginBtn.disabled = false;
  if (els.telegramLoginStatus) els.telegramLoginStatus.textContent = "";
  setGoogleLoginBusy(false);
  if (els.googleLoginStatus) {
    els.googleLoginStatus.textContent = "";
    els.googleLoginStatus.hidden = true;
  }
  if (els.loginMessage) els.loginMessage.textContent = "";
  const emailEnabled = Boolean(state.config?.auth?.email?.enabled);
  if (els.emailLoginTab) els.emailLoginTab.hidden = !emailEnabled;
  if (els.emailLoginPanel) els.emailLoginPanel.hidden = !emailEnabled;
  if (els.forgotPasswordBtn) els.forgotPasswordBtn.hidden = !emailEnabled;
  if (!emailEnabled) setLoginMethod("password");
}

function formatReferralUsd(value) {
  const amount = Number(value || 0);
  return `$${(Number.isFinite(amount) ? amount : 0).toFixed(2)}`;
}

function referralWithdrawStatusLabel(status = "pending") {
  const labels = { pending: "Processing", processing: "Processing", paid: "Paid", completed: "Paid", rejected: "Rejected", cancelled: "Rejected" };
  return labels[String(status || "pending").toLowerCase()] || String(status || "Processing");
}

function renderReferralWithdrawals(records = []) {
  if (!els.referralWithdrawals) return;
  const list = Array.isArray(records) ? records : [];
  if (!list.length) {
    els.referralWithdrawals.innerHTML = `<div class="referral-withdrawals-empty">${escapeHtml(t("referral.noWithdrawals"))}</div>`;
    return;
  }
  els.referralWithdrawals.innerHTML = `<div class="referral-withdrawals-title">${escapeHtml(t("referral.withdrawalHistory"))}</div>${list.slice(0, 20).map((item) => `
    <div class="referral-withdrawal-row">
      <div><strong>${escapeHtml(formatReferralUsd(item.amountUsd ?? item.amount ?? 0))}</strong><small>${escapeHtml(formatDateTime(item.requestedAt || item.createdAt || ""))}</small></div>
      <span class="referral-withdrawal-status is-${escapeHtml(String(item.status || "pending").toLowerCase())}">${escapeHtml(referralWithdrawStatusLabel(item.status))}</span>
      ${item.txHash ? `<code title="${escapeHtml(item.txHash)}">${escapeHtml(String(item.txHash).slice(0, 12))}...</code>` : ""}
      ${item.rejectionReason ? `<small class="referral-withdrawal-error">${escapeHtml(item.rejectionReason)}</small>` : ""}
    </div>`).join("")}`;
}

async function refreshAfterLogin() {
  if (state.tab === "access") renderAccessGuides();
  const refreshes = [];
  if (state.tab === "access") refreshes.push(loadApiSubtokens({ force: true }));
  if (state.tab === "history") refreshes.push(loadHistory());
  if (state.tab === "topups") refreshes.push(loadTopupRecords(1));
  if (state.tab === "spending") refreshes.push(loadSpendingRecords(1));
  if (state.tab === "assets") refreshes.push(loadUserAssets());
  if (state.tab === "referral") refreshes.push(loadReferralSummary());
  if (tenantFeature("subscriptions", false) || membershipProgramEnabled()) refreshes.push(loadBillingSummary());
  await Promise.allSettled(refreshes);
}

async function completeLogin(payload = {}) {
  const token = String(payload.token || "").trim();
  if (!token || !payload.user) throw new Error("Login response is invalid.");
  state.token = token;
  localStorage.setItem(TOKEN_KEY, token);
  setUser(payload.user);
  els.loginDialog?.close();
  await refreshAfterLogin();
}

const ACCOUNT_SECURITY_NOTICE_SEEN_LOCAL_KEY = "raisingGameAccountSecurityNoticeSeen";
const ACCOUNT_SECURITY_NOTICE_SEEN_PENDING_KEY = "raisingGameAccountSecurityNoticeSeenPending";
let accountSecurityNoticeTimer = 0;
let accountSecurityNoticeSaving = false;

function accountSecurityNoticeNeeded(user = state.user) {
  if (!user || !state.config?.auth?.email?.enabled) return false;
  return !String(user.email || "").trim() && user.googleLinked !== true;
}

function accountSecurityNoticeSeenLocally(user = state.user) {
  const userId = String(user?.id || "").trim();
  if (!userId) return false;
  try {
    const seen = JSON.parse(localStorage.getItem(ACCOUNT_SECURITY_NOTICE_SEEN_LOCAL_KEY) || "{}") || {};
    return seen[userId] === true;
  } catch {
    return false;
  }
}

function markAccountSecurityNoticeSeenLocally(user = state.user) {
  const userId = String(user?.id || "").trim();
  if (!userId) return;
  try {
    const seen = JSON.parse(localStorage.getItem(ACCOUNT_SECURITY_NOTICE_SEEN_LOCAL_KEY) || "{}") || {};
    seen[userId] = true;
    localStorage.setItem(ACCOUNT_SECURITY_NOTICE_SEEN_LOCAL_KEY, JSON.stringify(seen));
  } catch {
    // Local storage is an optional fast path; the server record remains authoritative.
  }
}

function accountSecurityNoticeSeen(user = state.user) {
  return Boolean(String(user?.securityNoticeSeenAt || "").trim()) || accountSecurityNoticeSeenLocally(user);
}

async function persistAccountSecurityNoticeSeen(user = state.user) {
  const userId = String(user?.id || "").trim();
  if (!userId || accountSecurityNoticeSaving) return;
  markAccountSecurityNoticeSeenLocally(user);
  const pendingKey = `${ACCOUNT_SECURITY_NOTICE_SEEN_PENDING_KEY}:${userId}`;
  try {
    if (sessionStorage.getItem(pendingKey) === "1") return;
    sessionStorage.setItem(pendingKey, "1");
  } catch {}
  accountSecurityNoticeSaving = true;
  try {
    const payload = await requestJson("/api/account/security-notice-seen", { method: "POST", body: {} });
    if (payload?.user && String(state.user?.id || "") === userId) setUser(payload.user);
    try { sessionStorage.removeItem(pendingKey); } catch {}
  } catch {
    // The local marker prevents repeated prompts in this browser; a later login retries the server write.
  } finally {
    accountSecurityNoticeSaving = false;
  }
}

function dismissAccountSecurityNotice() {
  markAccountSecurityNoticeSeenLocally();
  persistAccountSecurityNoticeSeen().catch(() => {});
}

function scheduleAccountSecurityNotice({ force = false } = {}) {
  if (typeof window === "undefined" || !els.accountSecurityNoticeDialog) return;
  window.clearTimeout(accountSecurityNoticeTimer);
  if (!accountSecurityNoticeNeeded()) {
    if (els.accountSecurityNoticeDialog.open) els.accountSecurityNoticeDialog.close("bound");
    return;
  }
  if (accountSecurityNoticeSeen()) {
    // Repair a server write that failed after the local marker was set. This
    // never opens the dialog again; it only synchronizes the account record.
    if (!String(state.user?.securityNoticeSeenAt || "").trim()) {
      persistAccountSecurityNoticeSeen().catch(() => {});
    }
    return;
  }
  accountSecurityNoticeTimer = window.setTimeout(() => {
    if (!accountSecurityNoticeNeeded() || accountSecurityNoticeSeen()) return;
    if (typeof document !== "undefined" && document.querySelector("dialog[open]")) {
      accountSecurityNoticeTimer = window.setTimeout(() => scheduleAccountSecurityNotice(), 1200);
      return;
    }
    prepareModalOpen();
    els.accountSecurityNoticeDialog.showModal();
    refreshIcons();
    // Mark at display time so a refresh or another tab cannot show it again,
    // even if the user closes the browser while the dialog is open.
    persistAccountSecurityNoticeSeen().catch(() => {});
  }, 500);
}

function openAccountEmailBindingFromNotice() {
  dismissAccountSecurityNotice();
  els.accountSecurityNoticeDialog?.close("bind-email");
  openEmailBinding({ focusEmail: true });
}

function openSupportFromSecurityNotice() {
  dismissAccountSecurityNotice();
  els.accountSecurityNoticeDialog?.close("support");
  if (typeof openSupportDialog === "function") {
    openSupportDialog({
      source: "security notice",
      subject: "Account security: email binding",
      message: "I need help binding an email to my account.",
    });
  }
}

async function submitLogin() {
  const username = els.loginUsername.value.trim();
  const password = els.loginPassword.value;
  // Existing accounts may still have legacy passwords shorter than the new
  // registration minimum. The backend enforces 10 characters only when it
  // creates a new account, so login must not reject those users client-side.
  if (!username || !password) {
    els.loginMessage.textContent = t("auth.invalid");
    return;
  }
  if (els.loginSubmit) els.loginSubmit.disabled = true;
  try {
    const payload = await requestJson("/api/auth/login", {
      method: "POST",
      body: {
        username,
        password,
        deviceId: sessionDeviceId(),
      },
    });
    await completeLogin(payload);
  } catch (error) {
    els.loginMessage.textContent = error.message;
  } finally {
    if (els.loginSubmit) els.loginSubmit.disabled = false;
  }
}

const EMAIL_LOGIN_CODE_COOLDOWN_SECONDS = 60;
let emailLoginCodeCooldownTimer = null;
let emailLoginCodeCooldownEndsAt = 0;

function renderEmailLoginCodeCooldown() {
  const button = els.requestEmailLoginCodeBtn;
  if (!button) return;
  const remainingSeconds = Math.max(0, Math.ceil((emailLoginCodeCooldownEndsAt - Date.now()) / 1000));
  if (remainingSeconds > 0) {
    button.disabled = true;
    button.textContent = t("auth.resendIn", { seconds: remainingSeconds }, `Resend in ${remainingSeconds}s`);
    return;
  }
  if (emailLoginCodeCooldownTimer) clearInterval(emailLoginCodeCooldownTimer);
  emailLoginCodeCooldownTimer = null;
  emailLoginCodeCooldownEndsAt = 0;
  button.disabled = false;
  button.textContent = t("common.sendCode", {}, "Send code");
}

function startEmailLoginCodeCooldown(seconds = EMAIL_LOGIN_CODE_COOLDOWN_SECONDS) {
  if (emailLoginCodeCooldownTimer) clearInterval(emailLoginCodeCooldownTimer);
  emailLoginCodeCooldownEndsAt = Date.now() + Math.max(0, Number(seconds) || 0) * 1000;
  renderEmailLoginCodeCooldown();
  emailLoginCodeCooldownTimer = setInterval(renderEmailLoginCodeCooldown, 1000);
}

async function requestEmailLoginCode() {
  const email = els.loginEmail?.value.trim() || "";
  if (els.requestEmailLoginCodeBtn) els.requestEmailLoginCodeBtn.disabled = true;
  let requestSucceeded = false;
  try {
    await requestJson("/api/auth/email/request", { method: "POST", body: { email } });
    requestSucceeded = true;
    startEmailLoginCodeCooldown();
    if (els.loginMessage) els.loginMessage.textContent = t("auth.emailCodeSent", {}, "Verification code sent. Check your inbox and spam folder.");
    els.loginEmailCode?.focus();
  } catch (error) {
    if (els.loginMessage) els.loginMessage.textContent = error.message;
  } finally {
    if (!requestSucceeded && els.requestEmailLoginCodeBtn) els.requestEmailLoginCodeBtn.disabled = false;
  }
}

async function verifyEmailLogin() {
  const email = els.loginEmail?.value.trim() || "";
  const code = els.loginEmailCode?.value.trim() || "";
  let registrationAttribution = {};
  try { registrationAttribution = JSON.parse(localStorage.getItem(REGISTRATION_ATTRIBUTION_KEY) || "{}") || {}; } catch { registrationAttribution = {}; }
  if (els.verifyEmailLoginBtn) els.verifyEmailLoginBtn.disabled = true;
  try {
    await completeLogin(await requestJson("/api/auth/email/verify", {
      method: "POST",
      body: {
        email,
        code,
        referralCode: localStorage.getItem(REFERRAL_CODE_KEY) || "",
        deviceId: sessionDeviceId(),
        channel: registrationAttribution.channel || "direct",
        attribution: registrationAttribution,
      },
    }));
  } catch (error) {
    if (els.loginMessage) els.loginMessage.textContent = error.message;
  } finally {
    if (els.verifyEmailLoginBtn) els.verifyEmailLoginBtn.disabled = false;
  }
}

async function forgotPassword() {
  const email = window.prompt(t("auth.forgotEmailPrompt", {}, "Enter your bound login email")); if (!email) return;
  try { await requestJson("/api/auth/password/reset/request", { method: "POST", body: { email } }); const code = window.prompt(t("auth.forgotCodePrompt", {}, "Enter the verification code")); const password = window.prompt(t("auth.forgotPasswordPrompt", {}, "Enter a new password (at least 10 characters)")); if (code && password) { await requestJson("/api/auth/password/reset", { method: "POST", body: { email, code, password } }); if (els.loginMessage) els.loginMessage.textContent = t("auth.passwordUpdated", {}, "Password updated. Please sign in."); } }
  catch (error) { if (els.loginMessage) els.loginMessage.textContent = error.message; }
}

async function requestAccountEmailCode() {
  try {
    await requestJson("/api/account/email/request", { method: "POST", body: { email: els.accountEmail?.value.trim() || "" } });
    if (els.accountSecurityMessage) els.accountSecurityMessage.textContent = t("account.verificationCodeSent", {}, "Verification code sent.");
  } catch (error) {
    if (els.accountSecurityMessage) els.accountSecurityMessage.textContent = error.message;
  }
}

async function verifyAccountEmail() {
  try {
    const payload = await requestJson("/api/account/email/verify", { method: "POST", body: { email: els.accountEmail?.value.trim() || "", code: els.accountEmailCode?.value.trim() || "" } });
    if (payload.user) {
      setUser(payload.user);
      openEmailBinding();
    }
  } catch (error) {
    if (els.accountSecurityMessage) els.accountSecurityMessage.textContent = error.message;
  }
}

async function loadMe() {
  if (!state.token) {
    setUser(null);
    return;
  }
  const restoreToken = String(state.token || "");
  try {
    const payload = await requestJson("/api/auth/me");
    // A login completed while this restore request was in flight. Its token
    // and user response are authoritative; do not overwrite them with the
    // older session response.
    if (restoreToken !== String(state.token || "")) return;
    setUser(payload.user);
  } catch (error) {
    // A database/pool timeout or transient 502 must not erase a valid browser
    // session. Only an explicit rejection for the token used by this restore
    // request means that token is unusable.
    if (error?.statusCode === 401 && restoreToken === String(state.token || "")) {
      state.token = "";
      localStorage.removeItem(TOKEN_KEY);
      setUser(null);
      return;
    }
    if (restoreToken === String(state.token || "")) {
      console.warn("session restore temporarily unavailable", error?.message || error);
    }
  }
}

async function loadBillingSummary() {
  if (!state.user || (!tenantFeature("subscriptions", false) && !membershipProgramEnabled())) return;
  const membershipWasActive = creatorMembershipActive();
  try {
    const payload = await requestJson("/api/billing/summary");
    state.billing = payload.billing || state.billing;
    if (payload.user) setUser(payload.user);
    if (Array.isArray(state.billing?.topupPackages)) {
      state.wallet = { ...(state.wallet || {}), topupPackages: state.billing.topupPackages };
    }
    if (!membershipWasActive && creatorMembershipActive() && typeof refreshCaseLibraryAccess === "function") {
      refreshCaseLibraryAccess();
    }
    renderTopupSummary();
    renderMembershipCard();
    renderAccessGuides();
  } catch (error) {
    console.warn("billing summary failed", error.message || error);
  }
}

async function refreshExploreMembershipAccess() {
  if (!state.user || !creatorMembershipActive()) return;
  const limit = Math.max(20, Math.min(100, Number(state.homeCharacters?.length || CHARACTER_PAGE_SIZE) || CHARACTER_PAGE_SIZE));
  try {
    const payload = await requestJson(`/api/public/characters?page=1&limit=${encodeURIComponent(String(limit))}`);
    state.homeCharacters = Array.isArray(payload.items) ? payload.items : state.homeCharacters;
    state.homeCharactersPage = Number(payload.page || 1) || 1;
    state.homeCharactersLimit = Number(payload.limit || limit) || limit;
    state.homeCharactersTotal = Number(payload.total || state.homeCharacters.length) || state.homeCharacters.length;
    state.homeCharactersTotalPages = Number(payload.totalPages || 1) || 1;
    if (state.tab === "gallery") renderTemplates();
    if (state.tab === "characters") renderCharactersPanel();
  } catch (error) {
    console.warn("membership Explore refresh failed", error.message || error);
  }
}

async function loadPlatformEstimates() {
  if (!state.templates.length) return;
  try {
    const payload = await requestJson("/api/platform/estimates");
    state.estimates = {};
    (payload.estimates || []).forEach((estimate) => {
      if (estimate?.templateId) state.estimates[estimate.templateId] = estimate;
    });
  } catch (error) {
    state.estimates = Object.fromEntries(state.templates.map((template) => [
      template.id,
      { templateId: template.id, available: false, credits: null, message: error.message },
    ]));
  }
  renderTemplates();
  updateSubmitButtonCost();
}

function captureReferralCodeFromUrl() {
  const params = new URLSearchParams(window.location.search || "");
  const ref = String(params.get("ref") || params.get("referral") || "").trim();
  if (ref) localStorage.setItem(REFERRAL_CODE_KEY, ref);
}

function captureRegistrationAttributionFromUrl() {
  const params = new URLSearchParams(window.location.search || "");
  const clean = (value, maxLength = 160) => String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
  let previous = {};
  try {
    previous = JSON.parse(localStorage.getItem(REGISTRATION_ATTRIBUTION_KEY) || "{}") || {};
  } catch {
    previous = {};
  }
  const query = { ...(previous.query && typeof previous.query === "object" ? previous.query : {}) };
  params.forEach((value, key) => {
    const safeKey = clean(key, 40).replace(/[^A-Za-z0-9_-]/g, "");
    const safeValue = clean(value, 180);
    if (safeKey && safeValue && Object.keys(query).length < 24) query[safeKey] = safeValue;
  });
  const priceChannels = String(params.get("channels") || params.get("priceChannels") || "")
    .split(/[|,]/).map((item) => clean(item, 80)).filter(Boolean).slice(0, 8);
  const previousChannels = Array.isArray(previous.priceChannels) ? previous.priceChannels : String(previous.priceChannels || "").split(/[|,]/);
  const mergedChannels = priceChannels.length ? priceChannels : previousChannels.map((item) => clean(item, 80)).filter(Boolean).slice(0, 8);
  const explicitChannel = clean(params.get("channel") || params.get("utm_source") || "", 80);
  const ref = clean(params.get("ref") || params.get("referral") || params.get("sharer") || params.get("sharerId") || "", 128);
  if (ref) {
    try { localStorage.setItem(REFERRAL_CODE_KEY, ref); } catch {}
  }
  if (!params.toString() && previous.capturedAt) return;
  const attribution = {
    channel: explicitChannel || previous.channel || "direct",
    medium: clean(params.get("utm_medium") || previous.medium || "", 80),
    campaign: clean(params.get("utm_campaign") || previous.campaign || "", 120),
    content: clean(params.get("utm_content") || previous.content || "", 120),
    landingPath: clean((window.location.pathname || "/") + (window.location.hash || ""), 500),
    capturedAt: new Date().toISOString(),
    priceChannel: clean(params.get("priceChannel") || params.get("price_channel") || params.get("pricingChannel") || previous.priceChannel || mergedChannels[0] || "", 80),
    priceChannels: mergedChannels,
    referralCode: ref || previous.referralCode || localStorage.getItem(REFERRAL_CODE_KEY) || "",
    query,
  };
  try { localStorage.setItem(REGISTRATION_ATTRIBUTION_KEY, JSON.stringify(attribution)); } catch {}
}

const BOOTSTRAP_CONFIG_KEY = "vipeakPlatformBootstrapConfigV1";
const BOOTSTRAP_CONFIG_MAX_AGE_MS = 5 * 60_000;

function bootstrapConfigSnapshot() {
  try {
    const cached = JSON.parse(sessionStorage.getItem(BOOTSTRAP_CONFIG_KEY) || "null");
    if (!cached?.config || Number(cached.savedAt || 0) < Date.now() - BOOTSTRAP_CONFIG_MAX_AGE_MS) return null;
    return cached.config;
  } catch {
    return null;
  }
}

function cacheBootstrapConfigSnapshot(config) {
  if (!config) return;
  try {
    sessionStorage.setItem(BOOTSTRAP_CONFIG_KEY, JSON.stringify({ config, savedAt: Date.now() }));
  } catch {}
}

function installBootstrapConfig(config) {
  if (!config) return;
  const platform = config.platform || {};
  state.config = config;
  state.wallet = config.wallet || null;
  state.billing = config.billing || null;
  state.templates = platform.templates || [];
  // The public config intentionally omits the large PlayFlux template catalog;
  // keep a catalog already loaded from /api/platform/playflux-templates when
  // later bootstrap/session config refreshes would otherwise wipe it out.
  const playfluxTemplates = Array.isArray(config.playfluxTemplates) ? config.playfluxTemplates : [];
  if (playfluxTemplates.length || !state.playfluxTemplatesLoaded || !state.playfluxTemplates.length) {
    state.playfluxTemplates = playfluxTemplates;
  }
  state.categories = platform.categories || [];
  state.advancedCases = platform.advanced?.cases || [];
  if (typeof scheduleAccountSecurityNotice === "function") scheduleAccountSecurityNotice();
  const homeVideo = config.homeVideo || {};
  state.homeCharacters = homeVideo.items || [];
  state.homeCharactersPage = Number(homeVideo.page || 1) || 1;
  state.homeCharactersLimit = Number(homeVideo.limit || CHARACTER_PAGE_SIZE) || CHARACTER_PAGE_SIZE;
  state.homeCharactersTotal = Number(homeVideo.total || state.homeCharacters.length) || state.homeCharacters.length;
  state.homeCharactersTotalPages = Number(homeVideo.totalPages || 1) || 1;
}

function renderBootstrapShell(config) {
  const platform = config?.platform || {};
  els.brandName.textContent = platform.brand || "Vipeak AI";
  applyTenantFeatures();
  normalizeTenantRouteAfterConfig();
  renderCategories();
  renderTemplates();
  renderAccessGuides();
  renderAdvanced();
  renderAssets();
  renderAccountMenu();
  renderTopupSummary();
  renderPricing();
  renderTokenDisplays();
  setTab(window.location.hash || tenantStringFeature("defaultRoute", "") || state.tab);
  refreshIcons();
  if (isTabAllowed("advanced")) scheduleAdvancedPresetsLoad();
}

function hydrateRouteCharacterInBackground() {
  ensureRouteHomeCharacterLoaded()
    .then(() => {
      if (!applyRouteCharacterDetail({ allowTabSwitch: true })) return;
      setTab(window.location.hash || tenantStringFeature("defaultRoute", "") || state.tab);
    })
    .catch((error) => console.warn("route character preload failed", error.message || error));
}

async function bootstrap() {
  captureReferralCodeFromUrl();
  captureRegistrationAttributionFromUrl();
  // Restore the last public config immediately on refresh so the shell and
  // gallery render without waiting for the network. Fresh config replaces it.
  const cachedConfig = bootstrapConfigSnapshot();
  if (cachedConfig) {
    installBootstrapConfig(cachedConfig);
    configureGoogleLogin();
    ensureSelectedWalletOption();
    applyRouteCharacterDetail({ allowTabSwitch: true });
    renderBootstrapShell(cachedConfig);
  }

  const hadStoredSession = Boolean(state.token);
  // For a returning signed-in visitor, skip the useless anonymous request and
  // fetch the authenticated config once after /api/auth/me. Guests still start
  // the anonymous config immediately so first paint is not serialized behind
  // session recovery.
  const publicConfigPromise = hadStoredSession ? null : requestJson("/api/config/public", { auth: false });
  const sessionPromise = (async () => {
    await loadTelegramMiniAppAuth().catch((error) => {
      console.warn("Telegram Mini App authentication failed", error.message || error);
    });
    await loadMe();
    if (!state.token) return publicConfigPromise || requestJson("/api/config/public", { auth: false });
    return requestJson("/api/config/public");
  })().catch(async (error) => {
    console.warn("session config refresh failed", error.message || error);
    return publicConfigPromise || requestJson("/api/config/public", { auth: false });
  });

  const applyPublicConfig = (payload) => {
    if (!payload?.config) return;
    const platform = payload.config?.platform || {};
    initGoogleAnalytics(platform.analytics?.googleMeasurementId || platform.googleMeasurementId || "");
    installBootstrapConfig(payload.config);
    if (!hadStoredSession) cacheBootstrapConfigSnapshot(payload.config);
    configureGoogleLogin();
    ensureSelectedWalletOption();
    applyRouteCharacterDetail({ allowTabSwitch: true });
    renderBootstrapShell(payload.config);
  };

  if (cachedConfig) {
    // The cached shell is already interactive. Refresh config in the
    // background so a public-origin TCP/TLS stall cannot freeze the refresh.
    eventSafeBackgroundTask(sessionPromise.then((payload) => {
      applyPublicConfig(payload);
      applyTelegramMiniAppRoute();
      hydrateRouteCharacterInBackground();
    }));
  } else {
    const payload = await sessionPromise;
    applyPublicConfig(payload);
    applyTelegramMiniAppRoute();
    hydrateRouteCharacterInBackground();
  }

  sessionPromise.then(() => {
    if (state.user && (tenantFeature("subscriptions", false) || membershipProgramEnabled())) {
      loadBillingSummary().catch((error) => console.warn("billing summary failed", error.message || error));
    }
  });
  if (!isTenantTool("undress")) loadPlatformEstimates();
}

function eventSafeBackgroundTask(promise) {
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(() => promise, { timeout: 1200 });
    return;
  }
  window.setTimeout(() => promise, 300);
}

function scheduleAdvancedPresetsLoad() {
  if (state.advancedPresetsLoaded || state.advancedPresetsLoading) return;
  const load = () => loadAdvancedPresets().catch((error) => {
    console.warn("advanced presets failed", error.message || error);
  });
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(load, { timeout: 1500 });
    return;
  }
  window.setTimeout(load, 800);
}
