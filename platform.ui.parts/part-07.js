function handleWorkflowClick(event) {
  // React Flow owns every pointer interaction inside its canvas. The old
  // canvas click handler used to rerender the whole panel here, which
  // unmounted the reference canvas mid-gesture and left stale nodes in view.
  if (event.target.closest?.(".workflow-react-host")) return;
  if (typeof handleWorkflowCanvasClick === "function" && handleWorkflowCanvasClick(event)) return;
  const clickedNodeId = event.target.closest("[data-workflow-node]")?.dataset.workflowNode || "";
  if (Date.now() < suppressWorkflowClickUntil && clickedNodeId && clickedNodeId === suppressWorkflowClickNodeId) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  if (event.target.closest("[data-workflow-connect]")) {
    event.preventDefault();
    return;
  }
  const openPickerButton = event.target.closest("[data-workflow-open-picker]");
  if (openPickerButton) {
    event.stopPropagation();
    state.workflowPickerNodeId = openPickerButton.dataset.workflowOpenPicker || "";
    state.workflowPickerSearch = "";
    renderWorkflowPanel();
    return;
  }
  const selectModelButton = event.target.closest("[data-workflow-select-model]");
  if (selectModelButton) {
    event.stopPropagation();
    const node = workflowNodeById(state.workflowPickerNodeId || "");
    if (node && ["imageDisplay", "imageGenerate", "unifiedVideoGen", "video"].includes(node.type)) {
      const library = ["imageDisplay", "imageGenerate"].includes(node.type) ? WORKFLOW_IMAGE_MODEL_LIBRARY : WORKFLOW_VIDEO_MODEL_LIBRARY;
      const model = library.find((item) => item.id === selectModelButton.dataset.workflowSelectModel) || library[0];
      node.data.modelId = model.id;
      node.title = `${["imageDisplay", "imageGenerate"].includes(node.type) ? "Image generation" : "Video generation"} ${["imageDisplay", "imageGenerate"].includes(node.type) ? workflowImageNodes().findIndex((item) => item.id === node.id) + 1 : workflowVideoNodes().findIndex((item) => item.id === node.id) + 1}`;
      state.workflowSelectedNodeId = node.id;
      state.workflowPickerNodeId = "";
      state.workflowPickerSearch = "";
      persistWorkflowState();
      renderWorkflowPanel();
    }
    return;
  }
  const closePicker = event.target.closest("[data-workflow-close-picker]");
  if (closePicker && (!event.target.closest("[data-workflow-picker]") || closePicker.tagName === "BUTTON")) {
    state.workflowPickerNodeId = "";
    state.workflowPickerSearch = "";
    renderWorkflowPanel();
    return;
  }
  const deleteButton = event.target.closest("[data-workflow-delete]");
  if (deleteButton) {
    event.stopPropagation();
    const nodeId = deleteButton.dataset.workflowDelete || "";
    if (removeWorkflowNode(nodeId) && !window.WorkflowReactCanvas?.sync?.()) {
      renderWorkflowPanel();
    }
    return;
  }
  const removeReferenceButton = event.target.closest("[data-workflow-remove-reference]");
  if (removeReferenceButton) {
    event.stopPropagation();
    const node = workflowNodeById(removeReferenceButton.dataset.nodeId || "");
    const field = removeReferenceButton.dataset.workflowRemoveReference || "referenceImages";
    const index = Number(removeReferenceButton.dataset.referenceIndex);
    if (node && Number.isInteger(index)) {
      node.data[field] = workflowNodeReferences(node, field).filter((_, itemIndex) => itemIndex !== index);
      clearWorkflowExecutionResults({ fromNodeId: node.id, message: "Reference removed. Run the node again.", render: false });
      persistWorkflowState();
      renderWorkflowPanel({ focusNodeId: node.id });
    }
    return;
  }
  const nodeTabButton = event.target.closest("[data-workflow-node-tab]");
  if (nodeTabButton) {
    event.stopPropagation();
    const node = workflowNodeById(nodeTabButton.dataset.nodeId || "");
    if (node?.type === "video") {
      node.data = { ...(node.data || {}), activeTab: nodeTabButton.dataset.workflowNodeTab === "params" ? "params" : "preview" };
      state.workflowSelectedNodeId = node.id;
      persistWorkflowState();
      renderWorkflowPanel();
    }
    return;
  }
  const runNodeButton = event.target.closest("[data-workflow-run-node]");
  if (runNodeButton) {
    event.stopPropagation();
    if (!runNodeButton.disabled) runWorkflowSingleNode(runNodeButton.dataset.workflowRunNode || "");
    return;
  }
  const directPreviewButton = event.target.closest("[data-workflow-preview-url]");
  if (directPreviewButton) {
    event.preventDefault();
    event.stopPropagation();
    const url = directPreviewButton.dataset.workflowPreviewUrl || "";
    const kind = directPreviewButton.dataset.workflowPreviewKind || workflowPreviewKindFromUrl(url);
    const title = directPreviewButton.dataset.workflowPreviewTitle || "Workflow preview";
    const ratio = directPreviewButton.dataset.workflowPreviewRatio || "9:16";
    if (!url) return;
    if (kind === "image") previewImage({ title, imageUrl: url });
    else playPreview({ title, previewUrl: url, ratio });
    return;
  }
  const previewButton = event.target.closest("[data-workflow-preview]");
  if (previewButton) {
    event.preventDefault();
    event.stopPropagation();
    const node = workflowNodeById(previewButton.dataset.workflowPreview || "");
    const model = workflowNodeModel(node || {});
    const videoUrl = workflowNodeResultVideo(node || {}) || model.previewUrl || "";
    const imageUrl = node?.data?.stripTargetImageUrl || node?.data?.keyframeImageUrl || node?.data?.startImage || "";
    if (videoUrl) playPreview({ title: node?.title || model.label || "Workflow preview", previewUrl: videoUrl, ratio: node?.data?.ratio || "9:16" });
    else if (imageUrl) previewImage({ title: node?.title || model.label || "Workflow preview", imageUrl });
    return;
  }
  if (workflowControlInteractionTarget(event.target)) {
    event.stopPropagation();
    return;
  }
  const action = event.target.closest("[data-workflow-action]")?.dataset.workflowAction || "";
  if (action) {
    event.stopPropagation();
    if (action === "run") runWorkflow();
    if (action === "cancel") requestWorkflowCancel();
    if (action === "clear-results") clearWorkflowExecutionResults();
    if (action === "add-image") addWorkflowNodeAt("add-image");
    if (action === "add-video") addWorkflowNodeAt("add-video");
    if (action === "add-image-reference") addWorkflowNodeAt("add-image-reference");
    if (action === "add-video-reference") addWorkflowNodeAt("add-video-reference");
    if (action === "add-prompt") addWorkflowNodeAt("add-prompt");
    if (action === "add-output") addWorkflowNodeAt("add-output");
    return;
  }
  const nodeEl = event.target.closest("[data-workflow-node]");
  if (nodeEl) {
    selectWorkflowNode(nodeEl.dataset.workflowNode || "");
    return;
  }
  const physicsButton = event.target.closest("[data-workflow-physics]");
  if (physicsButton) {
    const workflow = ensureWorkflowState();
    const active = new Set(workflow.physics || []);
    const id = physicsButton.dataset.workflowPhysics || "";
    if (active.has(id)) active.delete(id);
    else if (active.size < 3) active.add(id);
    workflow.physics = [...active];
    persistWorkflowState();
    renderWorkflowPanel();
  }
}

function handleWorkflowInput(event) {
  const target = event.target;
  if (typeof handleWorkflowCanvasInput === "function" && handleWorkflowCanvasInput(event)) return;
  if (target.matches("[data-workflow-picker-search]")) {
    state.workflowPickerSearch = target.value || "";
    const node = workflowNodeById(state.workflowPickerNodeId || "");
    const grid = els.workflowRoot?.querySelector(".workflow-picker-grid");
    if (grid) {
      grid.innerHTML = renderWorkflowPickerCards(workflowFilteredPresets(state.workflowPickerSearch), workflowNodeModel(node || {}));
      refreshIcons();
    }
    return;
  }
  if (target.matches("[data-workflow-prompt]")) {
    const node = workflowNodeById(target.dataset.workflowPrompt || "");
    if (node) {
      node.data.prompt = target.value || "";
      persistWorkflowState();
    }
    return;
  }
  if (target.matches("[data-workflow-image-prompt], [data-workflow-video-prompt]")) {
    const node = workflowNodeById(target.dataset.workflowImagePrompt || target.dataset.workflowVideoPrompt || "");
    if (node) {
      node.data.prompt = target.value || "";
      persistWorkflowState();
    }
    return;
  }
  if (target.matches("[data-workflow-story-prompt]")) {
    const node = workflowNodeById(target.dataset.workflowStoryPrompt || "");
    if (node) {
      node.data = { ...(node.data || {}), prompt: target.value || "" };
      persistWorkflowState();
    }
    return;
  }
  if (target.matches("[data-workflow-prompt], [data-workflow-image-model], [data-workflow-video-model], [data-workflow-ratio], [data-workflow-duration], [data-workflow-resolution], [data-workflow-mode], [data-workflow-toggle]")) {
    updateWorkflowNodeFromControl(target);
  }
}


function setupDoubleTopupPromo() {
  const banners = Array.from(document.querySelectorAll(".double-topup-banner"));
  const dialog = document.querySelector("#doubleTopupDialog");
  const payBtn = document.querySelector("#doubleTopupPayBtn");
  if (!banners.length || !dialog || !payBtn || dialog.dataset.bound === "1") return;
  dialog.dataset.bound = "1";
  const storageKey = "double-topup-20261015-window";
  let promo = null;
  let timer = 0;
  let paying = false;
  const readWindow = () => { try { return localStorage.getItem(storageKey) || ""; } catch (error) { return ""; } };
  const writeWindow = (value) => { try { localStorage.setItem(storageKey, value); } catch (error) {} };
  const pad = (value) => String(value).padStart(2, "0");
  const formatLeft = (endsAt) => {
    const left = Math.max(0, Date.parse(endsAt || "") - Date.now());
    const total = Math.floor(left / 1000);
    const days = Math.floor(total / 86400);
    const clock = `${pad(Math.floor(total % 86400 / 3600))}:${pad(Math.floor(total % 3600 / 60))}:${pad(total % 60)}`;
    return `${days}天 ${clock}`;
  };
  const paint = () => {
    const text = promo && promo.visible ? formatLeft(promo.endsAt) : "";
    banners.forEach((banner) => { banner.hidden = !promo || !promo.visible; });
    const nodes = Array.from(document.querySelectorAll(".double-topup-countdown, #doubleTopupDialogCountdown"));
    nodes.forEach((node) => { if (node) node.textContent = text; });
  };
  const refresh = async () => {
    const hinted = readWindow();
    const query = hinted ? `?windowStartedAt=${encodeURIComponent(hinted)}` : "";
    const payload = await requestJson(`/api/promo/double-topup${query}`);
    promo = payload.promo || { visible: false };
    if (promo.visible && promo.endsAt) {
      const start = Date.parse(promo.endsAt) - 3 * 24 * 60 * 60 * 1000;
      if (Number.isFinite(start)) writeWindow(new Date(start).toISOString());
    }
    paint();
  };
  banners.forEach((banner) => banner.addEventListener("click", () => {
    refresh().then(() => {
      if (promo && promo.visible && typeof dialog.showModal === "function") dialog.showModal();
    }).catch(() => {});
  }));
  payBtn.addEventListener("click", async () => {
    if (paying) return;
    if (!state.token || !state.user) {
      dialog.close();
      if (typeof openLogin === "function") openLogin();
      return;
    }
    paying = true;
    payBtn.disabled = true;
    try {
      const payload = await requestJson("/api/promo/double-topup/checkout", { method: "POST", body: {} });
      if (payload.checkoutUrl) window.location.assign(payload.checkoutUrl);
    } catch (error) {
      if (error.code === "PROMO_ALREADY_USED") {
        promo = { visible: false, claimed: true };
        paint();
        dialog.close();
      } else if (error.statusCode === 401 && typeof openLogin === "function") {
        dialog.close();
        openLogin();
      } else {
        window.alert(error.message || "暂时不能发起充值");
      }
    } finally {
      paying = false;
      payBtn.disabled = false;
    }
  });
  refresh().catch(() => {});
  timer = window.setInterval(() => { paint(); }, 1000);
  window.addEventListener("pagehide", () => window.clearInterval(timer), { once: true });
}
function setupElevenElevenPromo() {
  const entries = Array.from(document.querySelectorAll(".eleven-eleven-entry"));
  const dialog = document.querySelector("#elevenElevenDialog");
  const main = document.querySelector("#elevenElevenMain");
  const done = document.querySelector("#elevenElevenDone");
  const ended = document.querySelector("#elevenElevenEnded");
  const buyBtn = document.querySelector("#elevenElevenBuyBtn");
  const errorBox = document.querySelector("#elevenElevenError");
  const cards = Array.from(document.querySelectorAll("[data-eleven-sku]"));
  if (!entries.length || !dialog || !main || !done || !ended || !buyBtn || dialog.dataset.bound === "1") return;
  dialog.dataset.bound = "1";
  let promo = null;
  let selected = "";
  let paying = false;
  let statusTimer = 0;
  let clockTimer = 0;
  let pollTimer = 0;
  let refreshInFlight = false;
  let lastPeriodStartedAt = "";
  const params = new URLSearchParams(window.location.search);
  const isReturningFromCheckout = params.get("promo") === "1111" && Boolean(params.get("stripe_session_id"));
  const isCancelledCheckout = params.get("promo") === "1111" && params.get("promo_cancelled") === "1";
  const returningSkuId = params.get("promo_sku") || "";
  const pad = (value) => String(value).padStart(2, "0");
  const formatLeft = (endsAt) => {
    const left = Math.max(0, Date.parse(endsAt || "") - Date.now());
    const total = Math.floor(left / 1000);
    return `${pad(Math.floor(total / 86400))}:${pad(Math.floor(total % 86400 / 3600))}:${pad(Math.floor(total % 3600 / 60))}:${pad(total % 60)}`;
  };
  const currentSku = () => (promo?.skus || []).find((item) => item.id === selected) || null;
  const money = (value) => `$${Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  const setError = (message = "") => {
    if (!errorBox) return;
    errorBox.textContent = message;
    errorBox.hidden = !message;
  };
  const setView = (view = "main") => {
    main.hidden = view !== "main";
    done.hidden = view !== "done";
    ended.hidden = view !== "ended";
  };
  const paintCountdowns = () => {
    const timing = promo?.visible ? (promo.started ? { target: promo.endsAt, label: "距结束" } : { target: promo.startsAt, label: "距开始" }) : null;
    const text = timing ? formatLeft(timing.target) : "";
    const shortText = timing ? text.replace(/^00:/, "") : "";
    entries.forEach((entry) => { entry.hidden = !promo?.visible; });
    document.querySelectorAll("#elevenElevenCountdown, .eleven-eleven-modal-time").forEach((node) => { node.textContent = text || "--:--:--"; });
    document.querySelectorAll("[data-eleven-time-label]").forEach((node) => { node.textContent = timing?.label || "距结束"; });
    const mobileCountdown = document.querySelector("#elevenElevenMobileCountdown");
    if (mobileCountdown) mobileCountdown.textContent = shortText || "--:--:--";
    if (promo?.active && promo.endsAt && Date.parse(promo.endsAt) <= Date.now() && !refreshInFlight) {
      refreshInFlight = true;
      refresh().catch(() => {}).finally(() => { refreshInFlight = false; });
    }
  };
  const paintCards = () => {
    cards.forEach((card) => {
      const sku = (promo?.skus || []).find((item) => item.id === card.dataset.elevenSku);
      const rib = card.querySelector(".eleven-eleven-rib");
      const sold = card.querySelector("[data-eleven-sold]");
      const disabled = !sku || sku.purchased || sku.owned || !promo?.active;
      card.classList.toggle("is-disabled", disabled);
      card.classList.toggle("is-selected", Boolean(sku) && !disabled && selected === sku.id);
      card.setAttribute("aria-disabled", disabled ? "true" : "false");
      if (sold) sold.textContent = `已售 ${Number(sku?.sold || 0).toLocaleString()}`;
      if (rib) {
        rib.hidden = !sku || (!sku.purchased && !sku.owned);
        rib.textContent = sku?.purchased ? "已购买" : "已拥有";
      }
    });
    const sku = currentSku();
    if (!sku || sku.purchased || sku.owned || !promo?.active) {
      selected = "";
      buyBtn.disabled = true;
      buyBtn.textContent = !promo?.started ? "活动尚未开始" : !promo?.active ? "本次活动已结束" : "选择一档立即购买";
    } else {
      buyBtn.disabled = paying;
      buyBtn.textContent = paying ? "支付处理中…" : `确认支付 ${money(sku.amount)}`;
    }
  };
  const refresh = async (command = "") => {
    const payload = await requestJson(`/api/promo/1111${command ? `?command=${encodeURIComponent(command)}` : ""}`);
    promo = payload.promo || null;
    const nextPeriodStartedAt = String(promo?.startsAt || "");
    const renewed = Boolean(lastPeriodStartedAt && nextPeriodStartedAt && nextPeriodStartedAt !== lastPeriodStartedAt);
    lastPeriodStartedAt = nextPeriodStartedAt;
    paintCountdowns();
    paintCards();
    if (renewed && !promo?.skus?.some((item) => item.owned || item.purchased)) setError("11.11 新一期活动已开始，倒计时已重新计算。");
    return promo;
  };
  const open = async () => {
    setError("");
    paintCards();
    if (!promo?.visible) {
      setView("ended");
    } else if (!promo.started) {
      setView("main");
      setError("活动尚未开始。");
    } else {
      setView(promo.active ? "main" : "ended");
    }
    if (typeof dialog.showModal === "function" && !dialog.open) dialog.showModal();
  };
  const close = () => {
    if (dialog.open) dialog.close();
    selected = "";
    setError("");
    setView("main");
    paintCards();
  };
  const select = (id) => {
    const sku = (promo?.skus || []).find((item) => item.id === id);
    if (!promo?.active || !sku || sku.purchased || sku.owned) {
      setError(sku?.owned ? "您已开通创作者终身权益，无需重复购买。" : sku?.purchased ? "创作者终身权益每个账号限购一次，本档已购买。" : !promo?.started ? "活动尚未开始。" : "本次活动已结束。");
      return;
    }
    selected = id;
    setError("");
    paintCards();
  };
  const finish = async () => {
    const latest = await refresh().catch(() => promo);
    const completed = (latest?.skus || []).find((item) => item.id === returningSkuId && (item.purchased || item.orderStatus === "paid"))
      || (latest?.skus || []).find((item) => item.purchased)
      || currentSku();
    if (!completed || (!completed.purchased && completed.orderStatus !== "paid")) return false;
    if (completed.id === "credits") {
      try {
        const payload = await requestJson("/api/auth/me");
        if (payload.user && typeof setUser === "function") setUser(payload.user);
      } catch {}
    }
    setView("done");
    const title = document.querySelector("#elevenElevenDoneTitle");
    const body = document.querySelector("#elevenElevenDoneBody");
    const balance = document.querySelector("#elevenElevenDoneBalance");
    if (completed.id === "member") {
      if (title) title.textContent = "开通成功";
      if (body) body.textContent = "创作者终身权益已生效";
      if (balance) balance.innerHTML = `有效期　<b>终身</b>`;
    } else {
      if (title) title.textContent = "支付成功";
      if (body) body.textContent = `${Number(completed.credits || 9000).toLocaleString()} 积分已到账`;
      if (balance) balance.innerHTML = `当前积分余额　<b>${Number(state.user?.credits || 0).toLocaleString()}</b>`;
    }
    return true;
  };
  const pollForSettlement = async (attempt = 0) => {
    if (await finish()) return;
    if (attempt < 20) pollTimer = window.setTimeout(() => pollForSettlement(attempt + 1), 1500);
    else {
      setView("main");
      setError("支付结果确认中，请稍后刷新页面查看。");
    }
  };
  entries.forEach((entry) => entry.addEventListener("click", () => { open().catch(() => setError("活动信息暂时无法加载，请稍后再试。")); }));
  ["#elevenElevenCloseBtn", "#elevenElevenEndedBtn", "#elevenElevenDoneBtn"].forEach((selector) => {
    document.querySelector(selector)?.addEventListener("click", close);
  });
  cards.forEach((card) => {
    card.addEventListener("click", () => select(card.dataset.elevenSku));
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        select(card.dataset.elevenSku);
      }
    });
  });
  dialog.addEventListener("close", () => { selected = ""; setError(""); setView("main"); paintCards(); });
  dialog.addEventListener("click", (event) => { if (event.target === dialog) close(); });
  buyBtn.addEventListener("click", async () => {
    if (paying) return;
    const sku = currentSku();
    if (!sku) return;
    if (!state.token || !state.user) {
      close();
      if (typeof openLogin === "function") openLogin();
      return;
    }
    paying = true;
    buyBtn.disabled = true;
    setError("");
    paintCards();
    try {
      const payload = await requestJson("/api/promo/1111/checkout", { method: "POST", body: { sku: sku.id } });
      if (payload.checkoutUrl) window.location.assign(payload.checkoutUrl);
    } catch (error) {
      paying = false;
      if (error.statusCode === 401 && typeof openLogin === "function") {
        close();
        openLogin();
        return;
      }
      setError(error.message || "支付未完成，请重试或更换支付方式。");
      if (["PROMO_ALREADY_PURCHASED", "PROMO_CLOSED", "MEMBERSHIP_ALREADY_ACTIVE"].includes(error.code)) await refresh().catch(() => {});
    } finally {
      paying = false;
      paintCards();
    }
  });
  refresh().then(async () => {
    paintCountdowns();
    if (isReturningFromCheckout) {
      await open();
      pollForSettlement();
    } else if (isCancelledCheckout) {
      await open();
      selected = (promo?.skus || []).some((item) => item.id === returningSkuId && !item.purchased && !item.owned) ? returningSkuId : "";
      paintCards();
      setError("支付未完成，请重试或更换支付方式。");
    }
  }).catch(() => {});
  clockTimer = window.setInterval(paintCountdowns, 1000);
  statusTimer = window.setInterval(() => { refresh("refresh").catch(() => {}); }, 60000);
  window.addEventListener("pagehide", () => {
    window.clearInterval(clockTimer);
    window.clearInterval(statusTimer);
    window.clearTimeout(pollTimer);
  }, { once: true });
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", setupElevenElevenPromo);
else setupElevenElevenPromo();
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", setupDoubleTopupPromo);
else setupDoubleTopupPromo();
