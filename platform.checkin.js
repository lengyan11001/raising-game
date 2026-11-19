(() => {
  "use strict";

  const CHECKIN_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;
  const ACCOUNT_WATCH_MS = 1000;
  const DAY_WATCH_MS = 30000;
  const DEFAULT_REWARDS = [5, 5, 8, 8, 8, 8, 30];
  const ui = {
    status: null,
    open: false,
    loading: false,
    submitting: false,
    requestSeq: 0,
    userId: "",
    currentDate: "",
    lastFocus: null,
    messageTimer: 0,
    flyTimer: 0,
    lastAttemptAt: 0,
    initialized: false,
  };
  const els = {};

  function byId(id) {
    return document.getElementById(id);
  }

  function numberValue(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
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

  function currentCheckinDate() {
    return new Date(Date.now() + CHECKIN_UTC_OFFSET_MS).toISOString().slice(0, 10);
  }

  function rewardForDay(day, rewards = DEFAULT_REWARDS) {
    const index = Math.min(6, Math.max(0, Math.floor(numberValue(day, 1)) - 1));
    return numberValue(rewards[index], DEFAULT_REWARDS[index]);
  }

  function currentCycleDay(status = ui.status) {
    if (!status) return 1;
    return Math.min(7, Math.max(1, Math.floor(numberValue(status.cycle_day, 1))));
  }

  function cycleState(status = ui.status) {
    const checked = Boolean(status?.checked_today);
    const current = currentCycleDay(status);
    return {
      checked,
      current,
      doneMax: checked ? current : Math.max(0, current - 1),
    };
  }

  function checkIcon() {
    return '<i data-lucide="check" aria-hidden="true"></i>';
  }

  function refreshIconsSoon() {
    if (typeof refreshIcons === "function") refreshIcons();
  }

  function setMessage(message = "", { error = false, timeoutMs = 0 } = {}) {
    if (!els.message) return;
    window.clearTimeout(ui.messageTimer);
    const text = String(message || "").trim();
    els.message.textContent = text;
    els.message.hidden = !text;
    els.message.classList.toggle("is-error", Boolean(error));
    if (text && timeoutMs > 0) {
      ui.messageTimer = window.setTimeout(() => {
        if (!els.message || els.message.textContent !== text) return;
        els.message.hidden = true;
        els.message.textContent = "";
        els.message.classList.remove("is-error");
      }, timeoutMs);
    }
  }

  function clearCheckinFly() {
    window.clearTimeout(ui.flyTimer);
    ui.flyTimer = 0;
    if (!els.fly) return;
    els.fly.classList.remove("is-active");
    els.fly.textContent = "";
  }

  function renderEntryDots(status = ui.status) {
    if (!els.entryDots) return;
    const rewards = Array.isArray(status?.rewards) && status.rewards.length === 7 ? status.rewards : DEFAULT_REWARDS;
    const cycle = status ? cycleState(status) : { checked: false, current: 0, doneMax: 0 };
    els.entryDots.innerHTML = Array.from({ length: 7 }, (_, index) => {
      const day = index + 1;
      const classes = [];
      if (day === 7) classes.push("is-gold");
      if (day <= cycle.doneMax) classes.push("is-on");
      else if (day === cycle.current && !cycle.checked) classes.push("is-current");
      return `<i class="${classes.join(" ")}" title="D${day} +${numberValue(rewards[index])}"></i>`;
    }).join("");
  }

  function renderEntry() {
    if (!els.entry) return;
    const user = typeof state !== "undefined" ? state.user : null;
    const status = user ? ui.status : null;
    const quarantined = Boolean(user && (user.riskStatus === "quarantined" || user.quarantined));
    const checked = Boolean(status?.checked_today);
    els.entry.classList.toggle("is-done", checked);
    els.entry.classList.toggle("is-disabled", quarantined);
    els.entry.disabled = quarantined;
    els.entry.setAttribute("aria-disabled", quarantined ? "true" : "false");
    els.entry.setAttribute("aria-expanded", ui.open ? "true" : "false");
    if (els.entryTitle) els.entryTitle.textContent = quarantined ? "账号异常" : "每日签到领积分";
    if (els.entryAction) els.entryAction.textContent = quarantined ? "暂不可用" : (checked ? "已签到" : "去签到");
    if (els.entryDot) els.entryDot.hidden = quarantined || checked;
    if (els.entryStreak) els.entryStreak.textContent = String(Math.max(0, numberValue(status?.current_streak)));
    if (els.entryPoints) {
      const points = checked
        ? numberValue(status?.next_day_points, rewardForDay((currentCycleDay(status) % 7) + 1))
        : numberValue(status?.today_points, rewardForDay(currentCycleDay(status)));
      els.entryPoints.textContent = `${checked ? "明日" : "今日"} +${points}`;
    }
    renderEntryDots(status);
  }

  function monthlyMilestone(status = ui.status) {
    const count = Math.max(0, Math.floor(numberValue(status?.month_count)));
    const milestones = Array.isArray(status?.monthly_milestones) ? status.monthly_milestones : [];
    const milestone10 = milestones.find((item) => numberValue(item?.count) === 10) || { count: 10, points: 20 };
    const milestone20 = milestones.find((item) => numberValue(item?.count) === 20) || { count: 20, points: 50 };
    if (count < 10) return { ...milestone10, remaining: 10 - count };
    if (count < 20) return { ...milestone20, remaining: 20 - count };
    return null;
  }

  function renderModal() {
    const status = ui.status;
    const user = typeof state !== "undefined" ? state.user : null;
    const quarantined = Boolean(user && (user.riskStatus === "quarantined" || user.quarantined));
    const rewards = Array.isArray(status?.rewards) && status.rewards.length === 7 ? status.rewards : DEFAULT_REWARDS;
    const checked = Boolean(status?.checked_today);
    const cycle = cycleState(status);
    const streak = Math.max(0, numberValue(status?.current_streak));
    const todayPoints = numberValue(status?.today_points, rewardForDay(cycle.current));
    const nextPoints = numberValue(status?.next_day_points, rewardForDay((cycle.current % 7) + 1));

    if (els.badge) els.badge.textContent = quarantined ? "账号异常" : `已连签 ${streak} 天`;
    if (els.subtitle) {
      if (quarantined) {
        els.subtitle.textContent = "账号状态异常，暂时无法签到。";
      } else if (!status) {
        els.subtitle.innerHTML = "正在读取签到进度…";
      } else if (checked) {
        els.subtitle.innerHTML = `今天已领取 <b>${todayPoints}</b> 积分，明天再来可得 <b>${nextPoints}</b> 积分`;
      } else if (cycle.current === 7) {
        els.subtitle.innerHTML = `今天是你连签的第 <b>7</b> 天，可领 <b>${todayPoints}</b> 积分（含周奖励 <b>25</b>）`;
      } else {
        els.subtitle.innerHTML = `今天签到可得 <b>${todayPoints}</b> 积分，连续签到第 7 天可领 <b>30</b> 积分`;
      }
    }

    if (els.days) {
      els.days.innerHTML = Array.from({ length: 7 }, (_, index) => {
        const day = index + 1;
        const classes = ["checkin-day"];
        if (day === 7) classes.push("is-gold");
        const done = day <= cycle.doneMax;
        const current = day === cycle.current && !checked;
        if (done) classes.push("is-done");
        if (current) classes.push("is-current");
        const stateHtml = done ? checkIcon() : (current ? "今天" : "");
        return `<div class="${classes.join(" ")}" data-checkin-day="${day}"><span class="checkin-day-label">D${day}</span><span class="checkin-day-points">+${numberValue(rewards[index])}</span><span class="checkin-day-state">${stateHtml}</span></div>`;
      }).join("");
    }

    if (els.action) {
      const disabled = !status || checked || quarantined || ui.submitting || ui.loading;
      els.action.disabled = disabled;
      els.action.classList.toggle("is-done", checked || quarantined);
      els.action.classList.toggle("is-gold", !checked && !quarantined && cycle.current === 7);
      els.action.classList.toggle("is-loading", ui.submitting);
      if (quarantined) els.action.textContent = "账号异常，暂不可签到";
      else if (checked) els.action.textContent = "今日已签到 · 明天再来";
      else if (ui.submitting) els.action.textContent = "签到中…";
      else if (ui.loading || !status) els.action.textContent = "正在读取签到进度…";
      else if (cycle.current === 7) els.action.innerHTML = `签到领 <b>${todayPoints}</b> 积分 · 周奖励`;
      else els.action.innerHTML = `立即签到 · 领 <b>${todayPoints}</b> 积分`;
    }

    const monthCount = Math.max(0, numberValue(status?.month_count));
    if (els.monthCount) els.monthCount.textContent = String(monthCount);
    if (els.progressFill) els.progressFill.style.width = `${Math.min(100, monthCount / 20 * 100)}%`;
    const nextMilestone = monthlyMilestone(status);
    if (els.monthNext) {
      els.monthNext.innerHTML = nextMilestone
        ? `再签 <b>${nextMilestone.remaining}</b> 天 <em>+${numberValue(nextMilestone.points)}</em>`
        : "本月奖励已达成";
    }
    const hit10 = monthCount >= 10;
    const hit20 = monthCount >= 20;
    els.tick10?.classList.toggle("is-hit", hit10);
    els.tick20?.classList.toggle("is-hit", hit20);
    els.mile10?.classList.toggle("is-hit", hit10);
    els.mile20?.classList.toggle("is-hit", hit20);
    refreshIconsSoon();
  }

  function render() {
    renderEntry();
    renderModal();
  }

  function signedInUser() {
    return typeof state !== "undefined" && state.user ? state.user : null;
  }

  function updateKnownBalance(balance) {
    const user = signedInUser();
    if (!user || balance === undefined || balance === null) return;
    user.credits = numberValue(balance, numberValue(user.credits));
    if (typeof renderTopupSummary === "function") renderTopupSummary();
  }

  async function loadCheckinStatus({ silent = true } = {}) {
    const user = signedInUser();
    if (!user || typeof requestJson !== "function") {
      ui.status = null;
      ui.loading = false;
      render();
      return null;
    }
    const requestSeq = ++ui.requestSeq;
    const userId = String(user.id || "");
    ui.loading = true;
    if (ui.open) renderModal();
    try {
      const payload = await requestJson("/api/checkin/status", { timeoutMs: 12000 });
      if (requestSeq !== ui.requestSeq || String(signedInUser()?.id || "") !== userId) return null;
      ui.status = payload?.data || null;
      ui.userId = userId;
      ui.currentDate = ui.status?.date || currentCheckinDate();
      if (ui.status) updateKnownBalance(ui.status.balance);
      setMessage("", {});
      return ui.status;
    } catch (error) {
      if (requestSeq !== ui.requestSeq || String(signedInUser()?.id || "") !== userId) return null;
      if (error?.statusCode === 401 || numberValue(error?.code) === 1001) {
        ui.status = null;
        if (typeof clearClientAuthState === "function") clearClientAuthState();
      } else if (!silent) {
        setMessage(error?.message || "签到状态加载失败，请稍后重试", { error: true, timeoutMs: 4500 });
      }
      return null;
    } finally {
      if (requestSeq === ui.requestSeq) ui.loading = false;
      render();
    }
  }

  function patchStatusFromResult(result = {}) {
    const previous = ui.status && typeof ui.status === "object" ? { ...ui.status } : {};
    const already = Boolean(result.already);
    const checkedBefore = Boolean(previous.checked_today);
    const cycleDay = Math.min(7, Math.max(1, Math.floor(numberValue(result.cycle_day, previous.cycle_day || 1))));
    const streak = Math.max(0, numberValue(result.streak, previous.current_streak));
    const points = Math.max(0, numberValue(result.points));
    const monthCount = already || checkedBefore
      ? numberValue(previous.month_count)
      : Math.max(0, numberValue(previous.month_count) + 1);
    ui.status = {
      ...previous,
      date: currentCheckinDate(),
      checked_today: true,
      current_streak: streak,
      cycle_day: cycleDay,
      today_points: points,
      next_day_points: rewardForDay((cycleDay % 7) + 1, previous.rewards || DEFAULT_REWARDS),
      week_reward_ready: cycleDay === 7,
      broken: false,
      month_count: monthCount,
      month_points: Math.max(0, numberValue(previous.month_points) + points),
    };
    updateKnownBalance(result.balance);
    ui.currentDate = ui.status.date;
    render();
  }

  function animateCheckin(points, cycleDay) {
    if (points > 0 && els.fly) {
      clearCheckinFly();
      els.fly.textContent = `+${points} 积分`;
      void els.fly.offsetWidth;
      els.fly.classList.add("is-active");
      ui.flyTimer = window.setTimeout(clearCheckinFly, 1300);
    }
    const cell = els.days?.querySelector(`[data-checkin-day="${Math.min(7, Math.max(1, Number(cycleDay) || 1))}"]`);
    if (cell) {
      cell.classList.remove("is-pop");
      void cell.offsetWidth;
      cell.classList.add("is-pop");
      window.setTimeout(() => cell.classList.remove("is-pop"), 540);
    }
  }

  async function submitCheckin() {
    const user = signedInUser();
    if (!user) return openCheckinModal();
    if (ui.submitting || !ui.status || ui.status.checked_today) return;
    if (user.riskStatus === "quarantined" || user.quarantined) {
      setMessage("账号状态异常，暂时无法签到", { error: true });
      return;
    }
    ui.submitting = true;
    setMessage("", {});
    render();
    try {
      const payload = await requestJson("/api/checkin", {
        method: "POST",
        body: { device_id: typeof sessionDeviceId === "function" ? sessionDeviceId() : "" },
        timeoutMs: 15000,
      });
      const result = payload?.data || {};
      ui.submitting = false;
      patchStatusFromResult(result);
      await loadCheckinStatus({ silent: true });
      render();
      animateCheckin(numberValue(result.points), numberValue(result.cycle_day, ui.status?.cycle_day));
      setMessage(
        result.already ? "今天已经签到过了"
          : result.capped && numberValue(result.points) === 0 ? "本月签到积分已达上限"
            : String(result.message || "签到成功"),
        { timeoutMs: 4200 },
      );
    } catch (error) {
      if (error?.statusCode === 401 || numberValue(error?.code) === 1001) {
        ui.status = null;
        if (typeof clearClientAuthState === "function") clearClientAuthState();
        closeCheckinModal({ restoreFocus: false });
        if (typeof openLogin === "function") openLogin();
        return;
      }
      const message = error?.statusCode === 429 || numberValue(error?.code) === 2003
        ? "请求过于频繁，请稍后再试"
        : error?.statusCode === 403 || numberValue(error?.code) === 1002
          ? "账号状态异常，暂时无法签到"
          : "签到失败，请稍后重试";
      setMessage(message, { error: true, timeoutMs: 5000 });
    } finally {
      ui.submitting = false;
      render();
    }
  }

  function openCheckinModal() {
    if (!signedInUser()) {
      if (typeof openLogin === "function") openLogin();
      return;
    }
    if (!els.modal || ui.open) return;
    ui.open = true;
    clearCheckinFly();
    setMessage("", {});
    ui.lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : els.entry;
    els.modal.hidden = false;
    document.body.classList.add("checkin-modal-open");
    if (els.entry) els.entry.setAttribute("aria-expanded", "true");
    render();
    loadCheckinStatus({ silent: false });
    window.requestAnimationFrame(() => els.close?.focus());
  }

  function closeCheckinModal({ restoreFocus = true } = {}) {
    if (!els.modal || !ui.open) return;
    ui.open = false;
    els.modal.hidden = true;
    document.body.classList.remove("checkin-modal-open");
    if (els.entry) els.entry.setAttribute("aria-expanded", "false");
    clearCheckinFly();
    setMessage("", {});
    if (restoreFocus) {
      const target = ui.lastFocus && document.contains(ui.lastFocus) ? ui.lastFocus : els.entry;
      target?.focus?.();
    }
  }

  function cacheElements() {
    Object.assign(els, {
      entry: byId("checkinEntry"),
      entryTitle: byId("checkinEntryTitle"),
      entryDot: byId("checkinEntryDot"),
      entryAction: byId("checkinEntryAction"),
      entryStreak: byId("checkinEntryStreak"),
      entryPoints: byId("checkinEntryPoints"),
      entryDots: byId("checkinEntryDots"),
      modal: byId("checkinModal"),
      close: byId("checkinClose"),
      fly: byId("checkinFly"),
      badge: byId("checkinBadge"),
      subtitle: byId("checkinSubtitle"),
      days: byId("checkinDays"),
      action: byId("checkinAction"),
      message: byId("checkinMessage"),
      monthCount: byId("checkinMonthCount"),
      monthNext: byId("checkinMonthNext"),
      progressFill: byId("checkinProgressFill"),
      tick10: byId("checkinTick10"),
      tick20: byId("checkinTick20"),
      mile10: byId("checkinMile10"),
      mile20: byId("checkinMile20"),
    });
  }

  function resetForAccountChange() {
    ui.requestSeq += 1;
    ui.status = null;
    ui.loading = false;
    ui.submitting = false;
    ui.lastAttemptAt = 0;
    clearCheckinFly();
    setMessage("", {});
    if (ui.open) closeCheckinModal({ restoreFocus: false });
    render();
  }

  function syncAccountState({ force = false } = {}) {
    const user = signedInUser();
    const userId = String(user?.id || "");
    const date = currentCheckinDate();
    if (!userId) {
      if (ui.userId || ui.status || ui.open) {
        ui.userId = "";
        ui.currentDate = date;
        resetForAccountChange();
      }
      return;
    }
    const userChanged = userId !== ui.userId;
    const dateChanged = date !== ui.currentDate;
    if (userChanged) {
      resetForAccountChange();
      ui.userId = userId;
      ui.currentDate = date;
      render();
    }
    const needsStatus = force || userChanged || dateChanged || !ui.status;
    if (!needsStatus || ui.loading) return;
    const retryDelay = ui.status ? 0 : 30000;
    if (!force && !userChanged && !dateChanged && Date.now() - ui.lastAttemptAt < retryDelay) return;
    ui.lastAttemptAt = Date.now();
    loadCheckinStatus({ silent: !ui.open });
  }

  function trapModalFocus(event) {
    if (!ui.open || event.key !== "Tab" || !els.modal) return;
    const focusable = Array.from(els.modal.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )).filter((node) => node instanceof HTMLElement && node.offsetParent !== null);
    if (!focusable.length) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function bindEvents() {
    if (!els.entry || !els.modal) return;
    els.entry.addEventListener("click", openCheckinModal);
    els.action?.addEventListener("click", submitCheckin);
    els.close?.addEventListener("click", () => closeCheckinModal());
    document.querySelectorAll("[data-checkin-close]").forEach((node) => {
      node.addEventListener("click", () => closeCheckinModal());
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && ui.open) {
        event.preventDefault();
        closeCheckinModal();
        return;
      }
      trapModalFocus(event);
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") syncAccountState({ force: Boolean(signedInUser()) });
    });
    window.setInterval(() => syncAccountState(), ACCOUNT_WATCH_MS);
    window.setInterval(() => {
      if (!ui.userId || currentCheckinDate() === ui.currentDate) return;
      syncAccountState({ force: true });
    }, DAY_WATCH_MS);
  }

  function init() {
    if (ui.initialized) return;
    ui.initialized = true;
    cacheElements();
    if (!els.entry || !els.modal) return;
    bindEvents();
    ui.currentDate = currentCheckinDate();
    render();
    syncAccountState({ force: true });
    refreshIconsSoon();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
