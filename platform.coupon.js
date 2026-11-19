(() => {
  "use strict";

  const MODAL_SHOWN_KEY = "coupon_modal_shown_date";
  const REMINDER_DISMISSED_KEY = "coupon_reminder_dismissed_date";
  const DEFAULT_COUPON = Object.freeze({ face_value: 500, threshold: 3000, scope: "recharge,membership" });

  const ui = {
    initialized: false,
    loading: false,
    requestSeq: 0,
    userId: "",
    pending: [],
    available: [],
    locked: [],
    used: [],
    expired: [],
    selectedCouponId: "",
    checkoutAmountCents: 0,
    checkoutScene: "recharge",
    timer: 0,
    lastFocus: null,
    refreshingTopup: false,
    claimedThisOpen: false,
  };
  const els = {};

  function appState() {
    return typeof state !== "undefined" ? state : null;
  }

  function appUser() {
    return appState()?.user || null;
  }

  function isZh() {
    return String(appState()?.lang || "").toLowerCase().startsWith("zh");
  }

  function copy(en, zh) {
    return isZh() ? zh : en;
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function safeHtml(value = "") {
    if (typeof escapeHtml === "function") return escapeHtml(String(value));
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[char]));
  }

  function money(cents = 0) {
    const value = Math.max(0, Math.trunc(Number(cents) || 0)) / 100;
    return `$${value.toFixed(value % 1 ? 2 : 0)}`;
  }

  function numberLabel(value = 0) {
    const number = Number(value) || 0;
    return number.toLocaleString(isZh() ? "zh-CN" : "en-US", { maximumFractionDigits: 2 });
  }

  function shanghaiDateKey(date = new Date()) {
    return new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  }

  function readStorage(key = "") {
    try {
      return localStorage.getItem(key) || "";
    } catch (error) {
      return "";
    }
  }

  function writeStorage(key = "", value = "") {
    try {
      if (value) localStorage.setItem(key, value);
      else localStorage.removeItem(key);
    } catch (error) {}
  }

  function activeCoupon(coupon = null) {
    if (!coupon || Number(coupon.status) !== 1 || coupon.risk_review) return false;
    const expireMs = coupon.expire_at ? Date.parse(coupon.expire_at) : 0;
    return !expireMs || expireMs > Date.now();
  }

  function pendingCoupon() {
    return ui.pending[0] || null;
  }

  function claimedCoupon() {
    return [...ui.available, ...ui.locked].find(activeCoupon) || null;
  }

  function scopeMatches(scope = "", scene = "recharge") {
    const requested = String(scene || "recharge").toLowerCase();
    const aliases = requested === "recharge" ? ["recharge", "recharge_wallet", "topup"] : [requested];
    return String(scope || "")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
      .some((item) => aliases.includes(item));
  }

  function couponForAmount(amountCents = 0, scene = "recharge") {
    const amount = Math.max(0, Math.trunc(Number(amountCents) || 0));
    const coupon = claimedCoupon();
    if (!coupon) return null;
    const threshold = Math.max(0, Number(coupon.threshold || DEFAULT_COUPON.threshold));
    const faceValue = Math.max(0, Number(coupon.face_value || DEFAULT_COUPON.face_value));
    if (amount < threshold || !scopeMatches(coupon.scope || DEFAULT_COUPON.scope, scene)) return null;
    return { coupon, discountCents: Math.min(faceValue, amount), threshold, faceValue };
  }

  function couponDiscountForAmount(amountDollars = 0) {
    const quote = couponForAmount(Math.round(Number(amountDollars || 0) * 100), "recharge");
    return quote ? quote.faceValue / 100 : 0;
  }

  function getSelectedCouponId() {
    const quote = couponForAmount(ui.checkoutAmountCents, ui.checkoutScene);
    return quote && quote.coupon.coupon_id === ui.selectedCouponId ? quote.coupon.coupon_id : "";
  }

  function countdownParts(expireAt = "") {
    const end = Date.parse(expireAt || "");
    const remaining = Number.isFinite(end) ? Math.max(0, end - Date.now()) : 0;
    return {
      expired: remaining <= 0,
      days: Math.floor(remaining / 86_400_000),
      hours: Math.floor((remaining % 86_400_000) / 3_600_000),
      minutes: Math.floor((remaining % 3_600_000) / 60_000),
      seconds: Math.floor((remaining % 60_000) / 1000),
    };
  }

  function countdownText(expireAt = "") {
    const part = countdownParts(expireAt);
    if (part.expired) return copy("Expired", "已过期");
    return `${part.days}d ${String(part.hours).padStart(2, "0")}:${String(part.minutes).padStart(2, "0")}:${String(part.seconds).padStart(2, "0")}`;
  }

  function cacheElements() {
    Object.assign(els, {
      reminder: byId("couponReminderBar"),
      reminderTitle: byId("couponReminderTitle"),
      reminderText: byId("couponReminderText"),
      reminderAction: byId("couponReminderAction"),
      reminderClose: byId("couponReminderClose"),
      dialog: byId("couponClaimDialog"),
      kicker: byId("couponDialogKicker"),
      title: byId("couponDialogTitle"),
      ticket: byId("couponTicket"),
      faceValue: byId("couponFaceValue"),
      rules: byId("couponRuleList"),
      success: byId("couponSuccessCopy"),
      actions: byId("couponDialogActions"),
      usedActions: byId("couponUsedActions"),
      claimBtn: byId("couponClaimBtn"),
      laterBtn: byId("couponLaterBtn"),
      goTopupBtn: byId("couponGoTopupBtn"),
      topupEntry: byId("couponTopupEntry"),
      checkout: byId("couponCheckoutSummary"),
      centerNav: byId("couponCenterNavBtn"),
      centerNavLabel: byId("couponCenterNavLabel"),
      centerNavDot: byId("couponCenterNavDot"),
      centerDialog: byId("couponCenterDialog"),
      centerClose: byId("couponCenterClose"),
      centerTitle: byId("couponCenterTitle"),
      centerSubtitle: byId("couponCenterSubtitle"),
      centerBody: byId("couponCenterBody"),
      activity: byId("couponActivityEntry"),
      activityCard: byId("couponActivityCard"),
      activityFlag: byId("couponActivityFlag"),
      activityTitle: byId("couponActivityTitle"),
      activityAction: byId("couponActivityAction"),
      activityDetail: byId("couponActivityDetail"),
      activityDots: document.querySelector("[data-coupon-activity-dots]"),
    });
  }

  function currentUserId() {
    return String(appUser()?.id || "").trim();
  }

  function hasPendingCoupon() {
    return Boolean(pendingCoupon());
  }

  function showCouponDialog({ force = false } = {}) {
    const coupon = pendingCoupon();
    if (!coupon || !els.dialog) return false;
    const today = shanghaiDateKey();
    if (!force && readStorage(MODAL_SHOWN_KEY) === today) return false;
    writeStorage(MODAL_SHOWN_KEY, today);
    ui.claimedThisOpen = false;
    ui.lastFocus = document.activeElement;
    renderCouponDialog();
    if (els.reminder) els.reminder.hidden = true;
    if (!els.dialog.open) els.dialog.showModal();
    return true;
  }

  function closeCouponDialog() {
    if (els.dialog?.open) els.dialog.close();
  }

  function renderCouponDialog() {
    if (!els.dialog) return;
    const coupon = pendingCoupon() || (ui.claimedThisOpen ? claimedCoupon() : null);
    const claimed = Boolean(ui.claimedThisOpen && claimedCoupon());
    if (!coupon) return;
    const face = money(coupon.face_value ?? DEFAULT_COUPON.face_value).replace("$", "");
    const threshold = money(coupon.threshold ?? DEFAULT_COUPON.threshold);
    if (els.kicker) els.kicker.textContent = claimed
      ? copy("CLAIMED · USE WITHIN 7 DAYS", "领取成功 · 7 天内使用")
      : copy("NEW USER ONLY · ONE COUPON", "新用户专享 · 仅此一张");
    if (els.title) els.title.textContent = claimed
      ? copy("Your cash coupon is ready", "现金券已到账")
      : copy("A cash coupon for you", "送你一张现金券");
    if (els.faceValue) els.faceValue.textContent = face;
    if (els.rules) {
      els.rules.innerHTML = `
        <li><b>✓</b><span>${safeHtml(copy(`Use on orders over ${threshold}`, `单笔满 ${threshold} 可用`))}</span></li>
        <li><b>✓</b><span>${safeHtml(copy("Valid for credit top-ups and membership", "购买积分、开通会员均可使用"))}</span></li>
        <li><b>✓</b><span>${safeHtml(copy("Valid for 7 days after claiming", "领取后 7 天内有效，过期不补"))}</span></li>
      `;
      els.rules.hidden = claimed;
    }
    if (els.ticket) els.ticket.classList.toggle("is-claimed", claimed);
    if (els.success) {
      els.success.hidden = !claimed;
      if (claimed) {
        const active = claimedCoupon() || coupon;
        els.success.innerHTML = `
          <div class="coupon-success-icon" aria-hidden="true">✓</div>
          <strong>${safeHtml(copy("Coupon claimed successfully", "领取成功"))}</strong>
          <span>${safeHtml(copy("Use it within 7 days. Unused coupons will not be restored.", "请在 7 天内使用，过期不补。"))}</span>
          <div class="coupon-countdown-box">
            <small>${safeHtml(copy("Expires in", "剩余有效期"))}</small>
            <b data-coupon-countdown>${safeHtml(countdownText(active.expire_at))}</b>
          </div>
        `;
      }
    }
    if (els.actions) els.actions.hidden = claimed;
    if (els.usedActions) els.usedActions.hidden = !claimed;
    if (els.claimBtn) {
      els.claimBtn.disabled = false;
      els.claimBtn.textContent = copy("Claim now", "立即领取");
    }
    if (els.laterBtn) els.laterBtn.textContent = copy("Not now", "暂不领取");
    if (els.goTopupBtn) els.goTopupBtn.textContent = copy("Use coupon", "去购买积分");
  }

  function renderCouponReminder() {
    if (!els.reminder) return;
    const coupon = pendingCoupon();
    const dismissedToday = readStorage(REMINDER_DISMISSED_KEY) === shanghaiDateKey();
    const visible = Boolean(coupon && !dismissedToday && !els.dialog?.open);
    els.reminder.hidden = !visible;
    if (!visible || !coupon) return;
    const threshold = money(coupon.threshold ?? DEFAULT_COUPON.threshold);
    if (els.reminderTitle) els.reminderTitle.textContent = copy("New user coupon", "新用户券");
    if (els.reminderText) {
      els.reminderText.textContent = copy(
        `${money(coupon.face_value ?? DEFAULT_COUPON.face_value)} off orders over ${threshold}`,
        `满 ${threshold} 可用 · 待领取`,
      );
    }
    if (els.reminderAction) els.reminderAction.textContent = copy("Claim", "立即领取");
  }

  function dismissCouponReminder() {
    writeStorage(REMINDER_DISMISSED_KEY, shanghaiDateKey());
    renderCouponReminder();
  }

  function couponActivityState() {
    const pending = pendingCoupon();
    if (pending) {
      return {
        type: "pending",
        coupon: pending,
        flag: copy("NEW USER", "新用户专享"),
        title: copy("$5 cash coupon", "$5 现金券"),
        action: copy("Claim now", "立即领取"),
        detail: copy("Orders over $30 · 7 days after claiming", "满 $30 可用 · 领取后 7 天有效"),
      };
    }
    const claimed = claimedCoupon();
    if (claimed) {
      const threshold = money(claimed.threshold ?? DEFAULT_COUPON.threshold);
      return {
        type: "claimed",
        coupon: claimed,
        flag: copy("CLAIMED", "已领取"),
        title: copy("$5 cash coupon", "$5 现金券"),
        action: copy("Use now", "去使用"),
        detail: copy(`${countdownText(claimed.expire_at)} left · Orders over ${threshold}`, `剩余 ${countdownText(claimed.expire_at)} · 满 ${threshold} 可用`),
      };
    }
    if (!appUser()?.id) {
      return {
        type: "login",
        flag: copy("NEW USER", "新用户专享"),
        title: copy("$5 cash coupon", "$5 现金券"),
        action: copy("Log in to claim", "登录领取"),
        detail: copy("Orders over $30 · Valid 7 days after claiming", "满 $30 可用 · 领取后 7 天有效"),
      };
    }
    return {
      type: "center",
      flag: copy("ACTIVITY", "活动"),
      title: copy("$5 cash coupon", "$5 现金券"),
      action: copy("View activity", "查看活动"),
      detail: copy("New-user cash coupon", "新用户现金券活动"),
    };
  }

  function renderCouponActivityEntry() {
    if (!els.activity || !els.activityCard) return;
    const entry = couponActivityState();
    els.activity.hidden = false;
    els.activityCard.dataset.couponActivityState = entry.type;
    els.activityCard.setAttribute("aria-label", `${entry.title} · ${entry.action}`);
    if (els.activityFlag) els.activityFlag.textContent = entry.flag;
    if (els.activityTitle) els.activityTitle.textContent = entry.title;
    if (els.activityAction) els.activityAction.textContent = entry.action;
    if (els.activityDetail) els.activityDetail.textContent = entry.detail;
    if (els.activityDots) els.activityDots.innerHTML = "";
  }

  function openCouponActivity() {
    const entry = couponActivityState();
    if (entry.type === "login") {
      if (typeof openLogin === "function") openLogin();
      return;
    }
    if (entry.type === "pending") {
      showCouponDialog({ force: true });
      return;
    }
    if (entry.type === "claimed") {
      goTopupWithCoupon();
      return;
    }
    openCouponCenter();
  }

  function couponCenterStatus(coupon = {}) {
    const status = Number(coupon.status || 0);
    if (status === 0) return "pending";
    if (status === 1) return "available";
    if (status === 2) return "locked";
    if (status === 3) return "used";
    return "expired";
  }

  function renderCouponCenterNav() {
    const signedIn = Boolean(appUser()?.id);
    if (els.centerNav) els.centerNav.hidden = !signedIn;
    if (els.centerNavDot) els.centerNavDot.hidden = !signedIn || !hasPendingCoupon();
    if (els.centerNavLabel) els.centerNavLabel.textContent = copy("Coupon center", "券中心");
    if (els.centerTitle) els.centerTitle.textContent = copy("Coupon center", "券中心");
    if (els.centerSubtitle) {
      els.centerSubtitle.textContent = copy(
        "Claim your new-user coupon and use it on eligible orders.",
        "领取新用户现金券，符合条件的充值或会员订单自动抵扣。",
      );
    }
  }

  function couponCenterCard(coupon = {}) {
    const status = couponCenterStatus(coupon);
    const face = money(coupon.face_value ?? DEFAULT_COUPON.face_value);
    const threshold = money(coupon.threshold ?? DEFAULT_COUPON.threshold);
    const expireAt = coupon.expire_at || "";
    let title = copy("New-user cash coupon", "新用户现金券");
    let detail = copy(`Save ${face} on orders over ${threshold}.`, `满 ${threshold} 可用，立减 ${face}。`);
    let action = "";
    if (status === "pending") {
      detail = copy(`Claim now. It stays valid for 7 days after claiming.`, `立即领取，领取后 7 天内有效。`);
      action = `<button class="coupon-center-action is-primary" type="button" data-coupon-center-claim="${safeHtml(coupon.coupon_id || "")}">${safeHtml(copy("Claim now", "立即领取"))}</button>`;
    } else if (status === "available") {
      if (coupon.risk_review) {
        title = copy("Coupon pending review", "现金券审核中");
        detail = copy("This coupon is temporarily unavailable. Please contact support.", "此券暂不可用，请联系客服处理。");
        action = `<button class="coupon-center-action" type="button" disabled>${safeHtml(copy("Under review", "审核中"))}</button>`;
      } else {
        detail = copy(`${countdownText(expireAt)} left · Orders over ${threshold}`, `剩余 ${countdownText(expireAt)} · 满 ${threshold} 可用`);
        action = `<button class="coupon-center-action is-primary" type="button" data-coupon-center-use="${safeHtml(coupon.coupon_id || "")}">${safeHtml(copy("Use coupon", "去使用"))}</button>`;
      }
    } else if (status === "locked") {
      title = copy("Coupon reserved for an order", "现金券已被订单占用");
      detail = copy(`Locked until ${coupon.lock_expire_at ? countdownText(coupon.lock_expire_at) : "the order expires"}.`, `订单锁定中，${coupon.lock_expire_at ? countdownText(coupon.lock_expire_at) : "15 分钟后自动释放"}。`);
    } else if (status === "used") {
      title = copy("Coupon used", "现金券已使用");
      detail = coupon.used_at
        ? copy(`Used on ${new Date(coupon.used_at).toLocaleDateString()}`, `使用于 ${new Date(coupon.used_at).toLocaleDateString()}`)
        : copy("This coupon has already been used.", "这张券已经核销。");
    } else {
      title = copy("Coupon expired", "现金券已过期");
      detail = copy("Expired coupons cannot be restored.", "过期现金券不可恢复。");
    }
    return `
      <article class="coupon-center-item is-${safeHtml(status)}">
        <div class="coupon-center-value"><strong>${safeHtml(face)}</strong><span>OFF</span></div>
        <div class="coupon-center-copy">
          <strong>${safeHtml(title)}</strong>
          <span>${safeHtml(detail)}</span>
        </div>
        ${action}
      </article>
    `;
  }

  function couponCenterSection(title, coupons = []) {
    if (!coupons.length) return "";
    return `
      <section class="coupon-center-section">
        <div class="coupon-center-section-head"><strong>${safeHtml(title)}</strong><span>${coupons.length}</span></div>
        <div class="coupon-center-list">${coupons.map(couponCenterCard).join("")}</div>
      </section>
    `;
  }

  function renderCouponCenter() {
    renderCouponCenterNav();
    if (!els.centerBody) return;
    if (!appUser()?.id) {
      els.centerBody.innerHTML = "";
      return;
    }
    const available = ui.available.filter((coupon) => Number(coupon.status) === 1);
    const history = [...ui.used, ...ui.expired];
    const sections = [
      couponCenterSection(copy("To claim", "待领取"), ui.pending),
      couponCenterSection(copy("Available", "可使用"), available),
      couponCenterSection(copy("Reserved", "订单锁定中"), ui.locked),
      couponCenterSection(copy("History", "已使用 / 已过期"), history),
    ].join("");
    els.centerBody.innerHTML = sections || `
      <div class="coupon-center-empty">
        <span aria-hidden="true">券</span>
        <strong>${safeHtml(copy("No coupons yet", "暂无现金券"))}</strong>
        <p>${safeHtml(copy("New-user coupons appear here after they are issued.", "新用户现金券发放后会显示在这里。"))}</p>
      </div>
    `;
    if (typeof refreshIcons === "function") refreshIcons();
  }

  function openCouponCenter() {
    if (!appUser()?.id) return;
    renderCouponCenter();
    if (els.centerDialog && !els.centerDialog.open) els.centerDialog.showModal();
    syncCouponAccount({ force: true });
  }

  function closeCouponCenter() {
    if (els.centerDialog?.open) els.centerDialog.close();
  }

  function couponEntryState() {
    const pending = pendingCoupon();
    if (pending) return { type: "pending", coupon: pending };
    const active = claimedCoupon();
    return active ? { type: "claimed", coupon: active } : null;
  }

  function renderCouponTopupEntry() {
    if (!els.topupEntry) return;
    const entry = couponEntryState();
    if (!entry || !appUser()) {
      els.topupEntry.hidden = true;
      els.topupEntry.innerHTML = "";
      return;
    }
    const coupon = entry.coupon;
    const face = money(coupon.face_value ?? DEFAULT_COUPON.face_value);
    const threshold = money(coupon.threshold ?? DEFAULT_COUPON.threshold);
    const pending = entry.type === "pending";
    els.topupEntry.hidden = false;
    els.topupEntry.innerHTML = `
      <div class="coupon-topup-icon" aria-hidden="true">${pending ? "券" : "✓"}</div>
      <div class="coupon-topup-copy">
        <div class="coupon-topup-title">
          <strong>${safeHtml(pending ? copy("New user coupon", "新用户专享券") : copy("$5 cash coupon claimed", "$5 现金券已领取"))}</strong>
          <span>${safeHtml(`${face} OFF`)}</span>
        </div>
        <small data-coupon-entry-desc>${safeHtml(pending
          ? copy(`Orders over ${threshold}. Valid for 7 days after claiming.`, `满 ${threshold} 可用 · 领取后 7 天有效`)
          : copy(`${countdownText(coupon.expire_at)} left · Orders over ${threshold}`, `剩余 ${countdownText(coupon.expire_at)} · 满 ${threshold} 可用`))}</small>
      </div>
      <button class="coupon-topup-btn ${pending ? "is-primary" : ""}" type="button" data-coupon-entry-action>
        ${safeHtml(pending ? copy("Claim now", "立即领取") : copy("Use coupon", "去使用"))}
      </button>
    `;
    els.topupEntry.querySelector("[data-coupon-entry-action]")?.addEventListener("click", () => {
      if (pending) claimCoupon({ fromDialog: false });
      else useCouponOnTopup();
    });
  }

  function refreshCouponTopupEntry() {
    renderCouponTopupEntry();
  }

  function selectedCheckout() {
    if (!appUser()) return null;
    const billingPlan = typeof selectedBillingPlan === "function" ? selectedBillingPlan() : null;
    const billingProduct = typeof selectedBillingProduct === "function" ? selectedBillingProduct() : null;
    const topupPackage = typeof selectedTopupPackage === "function" ? selectedTopupPackage() : null;
    const amount = Number(billingProduct?.amount || billingPlan?.amount || topupPackage?.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) return null;
    const membership = typeof isMembershipBillingPlan === "function" && isMembershipBillingPlan(billingPlan);
    return {
      billingPlan,
      billingProduct,
      topupPackage,
      amountCents: Math.round(amount * 100),
      scene: billingProduct ? "product" : membership ? "membership" : "recharge",
      credits: membership ? 0 : Number(billingProduct?.includedCredits ?? billingPlan?.includedCredits ?? topupPackage?.credits ?? 0),
      membership,
    };
  }

  function renderCouponCheckout(selection = selectedCheckout()) {
    if (!els.checkout) return;
    if (!selection) {
      els.checkout.hidden = true;
      els.checkout.innerHTML = "";
      return;
    }
    ui.checkoutAmountCents = selection.amountCents;
    ui.checkoutScene = selection.scene;
    const quote = couponForAmount(selection.amountCents, selection.scene);
    if (!quote) {
      els.checkout.hidden = true;
      els.checkout.innerHTML = "";
      return;
    }
    ui.selectedCouponId = quote.coupon.coupon_id || ui.selectedCouponId;
    const payAmount = selection.amountCents - quote.discountCents;
    els.checkout.hidden = false;
    els.checkout.innerHTML = `
      <div class="coupon-checkout-main">
        <span class="coupon-checkout-icon" aria-hidden="true">券</span>
        <span>${safeHtml(copy("New user coupon applied", "已使用新用户券"))}</span>
        <b>−${safeHtml(money(quote.discountCents))}</b>
      </div>
      <div class="coupon-checkout-meta">
        <span>${safeHtml(copy("Original", "原价"))} <s>${safeHtml(money(selection.amountCents))}</s></span>
        <span>${safeHtml(copy("Pay", "实付"))} <strong>${safeHtml(money(payAmount))}</strong></span>
        <span>${safeHtml(selection.membership
          ? copy("Lifetime access", "永久权益")
          : copy(`${numberLabel(selection.credits)} credits`, `到账 ${numberLabel(selection.credits)} 积分`))}</span>
      </div>
    `;
  }

  function refreshCouponCheckout() {
    renderCouponCheckout();
  }

  function selectCouponPackage() {
    const coupon = claimedCoupon();
    if (!coupon || typeof topupPackages !== "function" || !appState()) return false;
    const threshold = Math.max(0, Number(coupon.threshold || DEFAULT_COUPON.threshold));
    const eligible = topupPackages()
      .filter((item) => Math.round(Number(item.amount || 0) * 100) >= threshold)
      .sort((left, right) => Number(left.amount) - Number(right.amount));
    const selected = eligible[0];
    if (!selected) return false;
    appState().selectedBillingPlanId = "";
    appState().selectedProductId = "";
    appState().selectedTopupPackageId = selected.id;
    if (typeof renderTopupSummary === "function") renderTopupSummary();
    return true;
  }

  function useCouponOnTopup() {
    selectCouponPackage();
    renderCouponTopupEntry();
  }

  function applyCouponPayload(payload = {}) {
    ui.pending = Array.isArray(payload.pending_claim) ? payload.pending_claim.slice() : [];
    ui.available = Array.isArray(payload.available) ? payload.available.slice() : [];
    ui.locked = Array.isArray(payload.locked) ? payload.locked.slice() : [];
    ui.used = Array.isArray(payload.used) ? payload.used.slice() : [];
    ui.expired = Array.isArray(payload.expired) ? payload.expired.slice() : [];
    const active = claimedCoupon();
    ui.selectedCouponId = active?.coupon_id || "";
  }

  function resetCouponState() {
    ui.userId = "";
    ui.pending = [];
    ui.available = [];
    ui.locked = [];
    ui.used = [];
    ui.expired = [];
    ui.selectedCouponId = "";
    ui.claimedThisOpen = false;
    ui.loadedAt = 0;
    if (els.reminder) els.reminder.hidden = true;
    if (els.topupEntry) {
      els.topupEntry.hidden = true;
      els.topupEntry.innerHTML = "";
    }
    if (els.checkout) {
      els.checkout.hidden = true;
      els.checkout.innerHTML = "";
    }
    renderCouponActivityEntry();
    renderCouponCenterNav();
    if (els.centerBody) els.centerBody.innerHTML = "";
    closeCouponDialog();
    closeCouponCenter();
  }

  async function refreshCouponSession({ force = false, userChanged = false } = {}) {
    const userId = currentUserId();
    if (!userId) {
      resetCouponState();
      return;
    }
    if (!force && !userChanged && ui.userId === userId && ui.loadedAt && Date.now() - ui.loadedAt < 30_000) {
      refreshCouponTopupEntry();
      refreshCouponCheckout();
      return;
    }
    if (!force && ui.loading && ui.userId === userId) return;
    const requestSeq = ++ui.requestSeq;
    ui.loading = true;
    try {
      const payload = await requestJson("/api/coupon/list");
      if (requestSeq !== ui.requestSeq || userId !== currentUserId()) return;
      applyCouponPayload(payload);
      ui.userId = userId;
      ui.loadedAt = Date.now();
      refreshCouponTopupEntry();
      refreshCouponCheckout();
      renderCouponActivityEntry();
      renderCouponReminder();
      renderCouponCenter();
      showCouponDialog();
      if (els.dialog?.open) renderCouponDialog();
    } catch (error) {
      if (requestSeq === ui.requestSeq) console.warn("[coupon-load-failed]", error?.message || error);
    } finally {
      if (requestSeq === ui.requestSeq) ui.loading = false;
    }
  }

  async function claimCoupon({ fromDialog = false, couponId = "" } = {}) {
    const coupon = (couponId && ui.pending.find((item) => item.coupon_id === couponId)) || pendingCoupon();
    if (!coupon || !appUser()) return null;
    if (els.claimBtn) {
      els.claimBtn.disabled = true;
      els.claimBtn.textContent = copy("Claiming...", "领取中...");
    }
    try {
      const payload = await requestJson("/api/coupon/claim", {
        method: "POST",
        body: { couponId: coupon.coupon_id || "" },
      });
      const claimed = payload.coupon || {
        ...coupon,
        status: 1,
        claimed_at: payload.claimed_at || new Date().toISOString(),
        expire_at: payload.expire_at || "",
      };
      ui.pending = ui.pending.filter((item) => item.coupon_id !== coupon.coupon_id);
      ui.available = [claimed, ...ui.available.filter((item) => item.coupon_id !== claimed.coupon_id)];
      ui.selectedCouponId = claimed.coupon_id || coupon.coupon_id;
      ui.claimedThisOpen = true;
      ui.loadedAt = Date.now();
      refreshCouponTopupEntry();
      renderCouponActivityEntry();
      renderCouponCenter();
      if (fromDialog) {
        renderCouponDialog();
        refreshCouponCheckout();
      } else {
        renderCouponReminder();
        selectCouponPackage();
      }
      return claimed;
    } catch (error) {
      if (els.claimBtn) {
        els.claimBtn.disabled = false;
        els.claimBtn.textContent = copy("Try again", "重新领取");
      }
      if (els.reminderText) els.reminderText.textContent = error?.message || copy("Claim failed. Please try again.", "领取失败，请重试。");
      throw error;
    }
  }

  function goTopupWithCoupon() {
    closeCouponDialog();
    closeCouponCenter();
    if (typeof openTopupDialog !== "function") return;
    openTopupDialog();
    useCouponOnTopup();
  }

  function tickCouponClocks() {
    const countdown = els.dialog?.querySelector("[data-coupon-countdown]");
    if (countdown && claimedCoupon()) {
      countdown.textContent = countdownText(claimedCoupon().expire_at);
    }
    const entryDesc = els.topupEntry?.querySelector("[data-coupon-entry-desc]");
    const active = claimedCoupon();
    if (entryDesc && active) {
      const threshold = money(active.threshold ?? DEFAULT_COUPON.threshold);
      entryDesc.textContent = copy(
        `${countdownText(active.expire_at)} left · Orders over ${threshold}`,
        `剩余 ${countdownText(active.expire_at)} · 满 ${threshold} 可用`,
      );
    }
    if (!active && ui.available.length) {
      ui.available = [];
      refreshCouponTopupEntry();
      refreshCouponCheckout();
      renderCouponActivityEntry();
    }
  }

  function syncCouponAccount({ force = false } = {}) {
    const userId = currentUserId();
    if (!userId) {
      if (ui.userId || ui.pending.length || ui.available.length || els.dialog?.open) resetCouponState();
      return;
    }
    const userChanged = userId !== ui.userId;
    refreshCouponSession({ force: force || userChanged, userChanged });
  }

  function bindEvents() {
    if (!els.dialog) return;
    els.activity?.addEventListener("click", openCouponActivity);
    els.centerNav?.addEventListener("click", openCouponCenter);
    els.centerClose?.addEventListener("click", closeCouponCenter);
    els.centerDialog?.addEventListener("click", (event) => {
      if (event.target === els.centerDialog) closeCouponCenter();
    });
    els.centerBody?.addEventListener("click", (event) => {
      const claim = event.target.closest("[data-coupon-center-claim]");
      if (claim) {
        claim.disabled = true;
        claimCoupon({ couponId: claim.dataset.couponCenterClaim || "" })
          .then(() => renderCouponCenter())
          .catch(() => {
            claim.disabled = false;
            renderCouponCenter();
          });
        return;
      }
      const use = event.target.closest("[data-coupon-center-use]");
      if (use) goTopupWithCoupon();
    });
    els.claimBtn?.addEventListener("click", () => {
      claimCoupon({ fromDialog: true }).catch(() => {});
    });
    els.laterBtn?.addEventListener("click", () => {
      window.setTimeout(renderCouponReminder, 0);
    });
    els.goTopupBtn?.addEventListener("click", goTopupWithCoupon);
    els.reminderAction?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      showCouponDialog({ force: true });
    });
    els.reminder?.addEventListener("click", (event) => {
      if (event.target === els.reminderClose || els.reminderClose?.contains(event.target)) return;
      if (event.target === els.reminderAction || els.reminderAction?.contains(event.target)) return;
      showCouponDialog({ force: true });
    });
    els.reminderClose?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      dismissCouponReminder();
    });
    els.dialog.addEventListener("close", () => {
      ui.claimedThisOpen = false;
      renderCouponReminder();
      ui.lastFocus?.focus?.();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") syncCouponAccount({ force: true });
    });
    window.addEventListener("focus", () => {
      if (currentUserId()) syncCouponAccount();
    });
    window.setInterval(() => syncCouponAccount(), 30_000);
    window.setInterval(tickCouponClocks, 1_000);
  }

  function init() {
    if (ui.initialized) return;
    ui.initialized = true;
    cacheElements();
    if (!els.dialog) return;
    bindEvents();
    renderCouponActivityEntry();
    syncCouponAccount({ force: true });
  }

  window.couponDiscountForAmount = couponDiscountForAmount;
  window.getSelectedCouponId = getSelectedCouponId;
  window.refreshCouponTopupEntry = refreshCouponTopupEntry;
  window.refreshCouponCheckout = refreshCouponCheckout;
  window.refreshCouponSession = refreshCouponSession;
  window.showCouponDialog = showCouponDialog;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
