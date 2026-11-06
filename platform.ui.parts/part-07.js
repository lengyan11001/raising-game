function handleWorkflowClick(event) {
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
    if (removeWorkflowNode(nodeId)) renderWorkflowPanel();
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
    if (action === "add-image") addWorkflowImageNode();
    if (action === "add-video") addWorkflowVideoNode();
    if (action === "add-image-reference") addWorkflowReferenceNode("image");
    if (action === "add-video-reference") addWorkflowReferenceNode("video");
    if (action === "add-prompt") addWorkflowPromptNode();
    if (action === "add-output") addWorkflowOutputNode();
    return;
  }
  const nodeEl = event.target.closest("[data-workflow-node]");
  if (nodeEl) {
    state.workflowSelectedNodeId = nodeEl.dataset.workflowNode || "";
    renderWorkflowPanel();
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
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", setupDoubleTopupPromo);
else setupDoubleTopupPromo();
