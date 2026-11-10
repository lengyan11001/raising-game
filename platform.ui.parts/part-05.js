function workflowExecutionClearPatch() {
  return {
    status: "",
    taskId: "",
    record: null,
    lastFrameUrl: "",
    keyframeImageUrl: "",
    keyframeTaskId: "",
    keyframeRecord: null,
    keyframeSourceKey: "",
    stripTargetImageUrl: "",
    stripTargetTaskId: "",
    stripTargetRecord: null,
    stripTargetSourceKey: "",
    error: "",
    videoUrls: [],
    taskIds: [],
  };
}

function workflowClearNodeExecution(node = null) {
  if (!node) return;
  if (["upload", "generated"].includes(node.data?.source)) return;
  node.data = { ...(node.data || {}), ...workflowExecutionClearPatch() };
}

function clearWorkflowExecutionResults({ fromNodeId = "", message = "Execution cleared.", render = true } = {}) {
  const ordered = workflowOrderedExecutableNodes();
  const startIndex = fromNodeId ? ordered.findIndex((node) => node.id === fromNodeId) : 0;
  ordered.slice(Math.max(0, startIndex)).forEach(workflowClearNodeExecution);
  state.workflowCancelRequested = false;
  state.workflowCancelNodeIds = [];
  state.workflowActiveNodeId = "";
  state.workflowRunningNodeIds = [];
  state.workflowMessage = message;
  persistWorkflowState();
  if (render) renderWorkflowPanel();
}

function workflowNodeIsRunning(node = {}) {
  return Array.isArray(state.workflowRunningNodeIds)
    && state.workflowRunningNodeIds.includes(String(node?.id || ""));
}

function workflowNodeRunState(node = {}) {
  if (workflowNodeIsRunning(node)) {
    return { canRun: false, disabled: true, icon: "loader-circle", label: "Running", reason: "This node is running." };
  }
  if (!node?.id || !["imageGenerate", "unifiedVideoGen"].includes(node.type)) {
    return { canRun: false, disabled: true, icon: "play", label: "Run", reason: "This node cannot run." };
  }
  const ordered = workflowOrderedExecutableNodes();
  const index = ordered.findIndex((item) => item.id === node.id);
  if (index < 0) {
    return { canRun: false, disabled: true, icon: "play", label: "Run", reason: "Connect this node into the workflow first." };
  }
  const dependencies = workflowIncomingEdges(node.id)
    .map((edge) => workflowNodeById(edge.from))
    .filter((item) => item && ["imageResult", "videoResult", "imageDisplay"].includes(item.type));
  if (dependencies.some((dependency) => !workflowNodeHasSuccessfulResult(dependency))) {
    return { canRun: false, disabled: true, icon: "play", label: "Run", reason: "Run connected input nodes first." };
  }
  return {
    canRun: true,
    disabled: false,
    icon: "play",
    label: workflowNodeHasSuccessfulResult(node) ? "Run again" : "Run",
    reason: "Run this node.",
  };
}

function workflowGeneratedResultChildren(node = {}) {
  if (!node?.id) return [];
  return (ensureWorkflowState().nodes || []).filter((item) => (
    item?.id !== node.id
    && String(item.data?.generatedFromNodeId || "") === String(node.id)
  ));
}

function workflowNodeOwnResultVideos(node = {}) {
  const data = node?.data || {};
  const uploadSource = data.source === "upload";
  const direct = Array.isArray(data.resultVideoUrls) ? data.resultVideoUrls : [];
  const taskVideos = Array.isArray(data.videoUrls) ? data.videoUrls : [];
  const record = data.record || {};
  const recordVideos = [
    ...(Array.isArray(record.cdnVideoUrls) ? record.cdnVideoUrls : []),
    ...(Array.isArray(record.videoUrls) ? record.videoUrls : []),
    ...(Array.isArray(record.resultVideoUrls) ? record.resultVideoUrls : []),
  ];
  const single = [
    data.resultVideoUrl,
    data.videoUrl,
    ...(!uploadSource ? [
      record.cdnVideoUrl,
      record.remoteVideoUrl,
      record.providerVideoUrl,
      record.upstreamVideoUrl,
      record.videoUrl,
      record.localVideoUrl,
      typeof generationVideoUrl === "function" ? generationVideoUrl(record) : "",
    ] : []),
  ];
  return [...new Set([...direct, ...taskVideos, ...(!uploadSource ? recordVideos : []), ...single]
    .map((value) => String(value || "").trim())
    .filter(Boolean))];
}

function workflowNodeResultVideos(node = {}) {
  if (node?.data?.source === "generated") return workflowNodeOwnResultVideos(node);
  return [...new Set([
    ...workflowNodeOwnResultVideos(node),
    ...workflowGeneratedResultChildren(node).flatMap((child) => workflowNodeOwnResultVideos(child)),
  ])];
}

function workflowNodeResultVideo(node = {}) {
  return workflowNodeResultVideos(node)[0] || "";
}

function workflowNodeOwnResultImages(node = {}) {
  const data = node?.data || {};
  const uploadSource = data.source === "upload";
  const direct = Array.isArray(data.resultImageUrls) ? data.resultImageUrls : [];
  const record = typeof generationImageResultUrls === "function" ? generationImageResultUrls(data.record || {}) : [];
  const single = [
    data.resultImageUrl,
    ...(!uploadSource ? [typeof generationImageResultUrl === "function" ? generationImageResultUrl(data.record || {}) : ""] : []),
  ];
  if (node?.type === "imageResult") single.unshift(data.imageUrl);
  return [...new Set([...direct, ...(!uploadSource ? record : []), ...single]
    .map((value) => String(value || "").trim())
    .filter(Boolean))];
}

function workflowNodeResultImages(node = {}) {
  if (node?.data?.source === "generated") return workflowNodeOwnResultImages(node);
  return [...new Set([
    ...workflowNodeOwnResultImages(node),
    ...workflowGeneratedResultChildren(node).flatMap((child) => workflowNodeOwnResultImages(child)),
  ])];
}

function workflowNodeResultImage(node = {}) {
  return workflowNodeResultImages(node)[0] || "";
}

function workflowNodePoster(node = {}) {
  return node?.data?.posterUrl
    || workflowNodeResultImage(node)
    || node?.data?.lastFrameUrl
    || node?.data?.stripTargetImageUrl
    || node?.data?.keyframeImageUrl
    || generationPosterUrl(node?.data?.record || {})
    || node?.data?.sourceImage
    || "";
}

function workflowPhysicsPrompt() {
  const active = new Set(ensureWorkflowState().physics || []);
  return WORKFLOW_PHYSICS_MODULES
    .filter((module) => active.has(module.id))
    .map((module) => module.prompt)
    .join(", ");
}

function workflowUpstreamPromptNodes(node = {}) {
  if (!node?.id) return [];
  const workflow = ensureWorkflowState();
  const nodeById = new Map(workflow.nodes.map((item) => [item.id, item]));
  const visited = new Set();
  const prompts = new Map();
  const visit = (nodeId) => {
    if (!nodeId || visited.has(nodeId)) return;
    visited.add(nodeId);
    workflow.edges
      .filter((edge) => edge.to === nodeId)
      .map((edge) => nodeById.get(edge.from))
      .filter(Boolean)
      .sort((left, right) => Number(left.x || 0) - Number(right.x || 0))
      .forEach((source) => {
        visit(source.id);
        if (source.type === "prompt" && String(source.data?.prompt || "").trim()) prompts.set(source.id, source);
      });
  };
  visit(node.id);
  return [...prompts.values()];
}

function workflowEffectivePrompt(node = {}) {
  const model = workflowNodeModel(node);
  const story = workflowUpstreamPromptNodes(node)
    .map((promptNode) => String(promptNode.data?.prompt || "").trim())
    .filter(Boolean)
    .join(". ");
  const base = String(node.data?.prompt || "").trim() || model.prompt;
  const physics = workflowPhysicsPrompt();
  return [story, base, physics].filter(Boolean).join(". ");
}

function workflowImageKey(value = "") {
  const text = String(value || "");
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
  }
  return `${text.length}:${Math.abs(hash)}`;
}

function workflowCostLabel(node = {}) {
  if (!node?.id || !node?.type) return "0";
  const isImage = ["imageDisplay", "imageGenerate"].includes(node.type);
  const model = isImage ? workflowImageModelById(node.data?.modelId) : workflowVideoModelById(node.data?.modelId);
  const modelId = model.id;
  const duration = isImage ? 1 : Number(node.data?.duration || 5);
  const resolution = node.data?.resolution || (isImage ? "2K" : "720p");
  const ratio = node.data?.ratio || (isImage ? "1:1" : "16:9");
  const videoConfig = isImage ? {} : workflowVideoProviderConfig(node);
  const incoming = workflowNodeIncomingMedia(node);
  const referenceVideos = [...incoming.videos, ...workflowNodeReferences(node, "referenceVideos")];
  return formatCredits(advancedPricing(duration, modelId, resolution, ratio, {
    seedanceTier: "standard",
    qwenTier: node.data?.qwenTier || "pro",
    seedreamTier: node.data?.seedreamTier || "pro",
    videoCapability: videoConfig.videoCapability,
    mode: node.data?.mode,
    referenceImageCount: workflowNodeReferences(node, "referenceImages").length + incoming.images.length,
    outputImageCount: Number(node.data?.outputImageCount || 1),
    referenceVideoUrls: referenceVideos,
    inputVideoSeconds: referenceVideos.length ? duration : 0,
  }).credits);
}

function workflowPromptPreview(model = {}, customPrompt = "") {
  const custom = String(customPrompt || "").trim();
  return custom || model.prompt || "";
}

function workflowReferenceImagePayload(sourceImage = "") {
  if (!sourceImage) return [];
  return [{
    dataUrl: dataUrlValue(sourceImage) || undefined,
    imageUrl: absoluteHttpUrl(sourceImage) || undefined,
    fileName: "workflow-source.png",
  }];
}

function workflowReferenceImageItems(images = []) {
  return images.filter(Boolean).map((image, index) => ({
    dataUrl: dataUrlValue(image) || undefined,
    imageUrl: absoluteHttpUrl(image) || (String(image || "").startsWith("/") ? image : undefined),
    fileName: `workflow-reference-${index + 1}.png`,
  }));
}

function workflowSeedanceReferenceImages(images = []) {
  const seen = new Set();
  return images
    .map((image, index) => {
      const value = String(image || "").trim();
      const dataUrl = dataUrlValue(value);
      const url = dataUrl ? "" : (absoluteHttpUrl(value) || (value.startsWith("/") ? value : ""));
      const key = dataUrl || url;
      if (!key || seen.has(key)) return null;
      seen.add(key);
      return {
        ...(dataUrl ? { dataUrl } : { imageUrl: url }),
        fileName: `workflow-reference-${index + 1}.png`,
        name: index === 0 ? "Workflow subject state" : "Workflow scene reference",
      };
    })
    .filter(Boolean)
    .slice(0, ADVANCED_SEEDANCE_REFERENCE_LIMIT);
}

function workflowModelReferenceImage(model = {}) {
  return String(model.posterUrl || model.imageUrl || model.referenceImageUrl || "").trim();
}

function workflowModelReferenceVideo(model = {}) {
  const value = String(model.previewUrl || model.videoUrl || "").trim();
  return absoluteHttpUrl(value) || (value.startsWith("data:") ? value : "");
}

function workflowImageRequestFields(value = "", prefix = "first") {
  const dataUrl = dataUrlValue(value);
  const publicUrl = absoluteHttpUrl(value) || (String(value || "").startsWith("/") ? value : "");
  if (prefix === "end") {
    return dataUrl
      ? { endImageDataUrl: dataUrl, endImageFileName: "workflow-end.png" }
      : publicUrl
        ? { endImageUrl: publicUrl }
        : {};
  }
  return dataUrl
    ? { firstFrameDataUrl: dataUrl, firstFrameFileName: "workflow-start.png" }
    : publicUrl
      ? { firstFrameUrl: publicUrl }
      : {};
}

function workflowFacePrompt(faceImage = "") {
  return faceImage ? "Preserve the same adult face identity and facial features consistently across all clips." : "";
}

function workflowNodeOptionEnabled(node = {}, key = "") {
  return node?.data?.[key] !== false;
}

function workflowStripPrompt(node = {}) {
  if (!workflowNodeOptionEnabled(node, "stripFirst")) return "";
  return "Strip Her Nude First is enabled: begin with the provided clothed first frame, then make the same consenting adult subject visibly remove clothing and transition into a nude state before continuing the selected action. Preserve the same face, body, pose continuity, lighting, and camera direction.";
}

function workflowKeyframeSourceKey(node = {}, baseImage = "", faceImage = "", { firstNode = false } = {}) {
  return [
    workflowImageKey(baseImage),
    workflowImageKey(faceImage),
    node.data?.modelId || "",
    workflowEffectivePrompt(node),
    node.data?.ratio || "9:16",
    firstNode ? "first" : "next",
    workflowNodeOptionEnabled(node, "stripFirst") ? "strip" : "no-strip",
  ].join("|");
}

function workflowStripSourceKey(node = {}, keyframeImage = "") {
  return [
    workflowImageKey(keyframeImage),
    node.data?.modelId || "",
    workflowEffectivePrompt(node),
    node.data?.ratio || "9:16",
  ].join("|");
}

function workflowKeyframePrompt(node = {}, { hasFaceReference = false, firstNode = false } = {}) {
  const action = workflowEffectivePrompt(node);
  const stripFirst = firstNode && workflowNodeOptionEnabled(node, "stripFirst");
  return [
    "Use Image 1 as the exact same consenting adult subject identity reference.",
    hasFaceReference ? "Use Image 2 as the face identity reference and preserve facial features closely." : "",
    stripFirst
      ? "Create the opening keyframe before clothing removal. Keep the clothing and outfit from Image 1, while setting up the scene, pose, camera angle, and action context."
      : firstNode
      ? "Create the opening keyframe for this workflow video segment."
      : "Create the next keyframe for this workflow video segment, continuing from Image 1 while changing only what the segment requires.",
    "Render one photorealistic full-frame image that already contains the intended scene, pose, action setup, camera angle, lighting, and composition.",
    "Keep the same person, face, hairstyle, body type, and visual continuity. Do not invent a different character.",
    action ? `Segment direction: ${action}` : "",
    "Do not create a collage, split screen, storyboard, text, subtitles, watermark, UI, or multiple frames.",
  ].filter(Boolean).join(" ");
}

function workflowStripImagePrompt(node = {}) {
  const action = workflowEffectivePrompt(node);
  return [
    "Use Image 1 as the exact same keyframe, consenting adult subject, face, hairstyle, body type, camera angle, lighting, and background.",
    "Create one photorealistic target frame in the same scene and composition after the subject has removed clothing and is nude.",
    "Keep identity, framing, pose continuity, scene, camera direction, and lighting consistent with Image 1. Do not redesign the person or scene.",
    action ? `The target frame should be suitable as the end frame for this video action: ${action}` : "",
    "No text, no watermark, no collage, no split screen.",
  ].filter(Boolean).join(" ");
}

async function workflowEnsureImageEditSources(images = [], nodeId = "", label = "Workflow keyframe source") {
  const imageAssetIds = [];
  for (let index = 0; index < images.length; index += 1) {
    const value = String(images[index] || "").trim();
    if (!value) continue;
    const dataUrl = dataUrlValue(value);
    const url = dataUrl ? "" : (absoluteHttpUrl(value) || (value.startsWith("/") ? absoluteHttpUrl(value) : ""));
    if (!dataUrl && !url) throw new Error("Workflow source image is not accessible.");
    const payload = await requestJson("/api/user-assets", {
      method: "POST",
      body: {
          ...(dataUrl ? { dataUrl } : { url }),
          name: label,
          fileName: `${nodeId || "workflow"}-${index + 1}.png`,
      },
    });
    const asset = payload.asset || null;
    if (!asset?.id) throw new Error("Failed to prepare workflow source image.");
    state.advancedAssets = [asset, ...(state.advancedAssets || []).filter((item) => item.id !== asset.id)];
    state.userAssets = [asset, ...(state.userAssets || []).filter((item) => item.id !== asset.id)];
    imageAssetIds.push(asset.id);
  }
  if (!imageAssetIds.length) throw new Error("Workflow source image is not accessible.");
  return { imageAssetIds };
}

async function workflowPrepareNodeKeyframe(node = {}, { baseImage = "", faceImage = "", model = {}, firstNode = false, storageNode = null } = {}) {
  const targetNode = storageNode || node;
  const sourceKey = workflowKeyframeSourceKey(node, baseImage, faceImage, { firstNode });
  if (targetNode.data?.keyframeImageUrl && targetNode.data?.keyframeSourceKey === sourceKey) {
    return targetNode.data.keyframeImageUrl;
  }
  workflowSetNodeData(targetNode.id, {
    status: "preparing",
    error: "",
    keyframeImageUrl: "",
    keyframeTaskId: "",
    keyframeRecord: null,
    keyframeSourceKey: sourceKey,
    stripTargetImageUrl: "",
    stripTargetTaskId: "",
    stripTargetRecord: null,
    stripTargetSourceKey: "",
  });
  state.workflowMessage = `Preparing keyframe for ${model.label || "workflow"}...`;
  workflowLog(`Preparing keyframe for ${model.label || "workflow"}.`);
  workflowThrowIfCancelled();
  const source = await workflowEnsureImageEditSources(
    [baseImage, faceImage].filter(Boolean),
    `${node.id}-keyframe`,
    "Workflow keyframe source",
  );
  workflowThrowIfCancelled();
  const payload = await requestJson("/api/wan27/image-edit", {
    method: "POST",
    body: {
      ...source,
      prompt: workflowKeyframePrompt(node, { hasFaceReference: Boolean(faceImage), firstNode }),
      ratio: node.data?.ratio || "9:16",
      resolution: "2K",
      params: {
        createKind: "workflow",
        workflowNodeId: node.id,
        workflowModelId: model.id || "",
        workflowStep: "node_keyframe",
      },
    },
  });
  if (payload.user) setUser(payload.user);
  const record = payload.record || null;
  const imageUrl = payload.imageUrl || record?.imageResultUrl || record?.localImageUrl || record?.cdnImageUrl || "";
  if (!imageUrl) throw new Error("Keyframe generation returned no image.");
  workflowSetNodeData(targetNode.id, {
    keyframeImageUrl: imageUrl,
    keyframeTaskId: payload.taskId || record?.taskId || "",
    keyframeRecord: record,
    keyframeSourceKey: sourceKey,
  });
  workflowLog("Keyframe ready.");
  return imageUrl;
}

async function workflowPrepareStripTargetImage(node = {}, keyframeImage = "", model = {}, { storageNode = null } = {}) {
  const targetNode = storageNode || node;
  const sourceKey = workflowStripSourceKey(node, keyframeImage);
  if (targetNode.data?.stripTargetImageUrl && targetNode.data?.stripTargetSourceKey === sourceKey) {
    return targetNode.data.stripTargetImageUrl;
  }
  workflowSetNodeData(targetNode.id, {
    status: "preparing",
    error: "",
    stripTargetImageUrl: "",
    stripTargetTaskId: "",
    stripTargetRecord: null,
    stripTargetSourceKey: sourceKey,
  });
  state.workflowMessage = `Preparing target frame for ${model.label || "workflow"}...`;
  workflowLog(`Preparing target frame for ${model.label || "workflow"}.`);
  workflowThrowIfCancelled();
  const source = await workflowEnsureImageEditSources([keyframeImage], `${node.id}-target`, "Workflow target frame source");
  workflowThrowIfCancelled();
  const payload = await requestJson("/api/wan27/image-edit", {
    method: "POST",
    body: {
      ...source,
      prompt: workflowStripImagePrompt(node),
      ratio: node.data?.ratio || "9:16",
      resolution: "2K",
      params: {
        createKind: "workflow",
        workflowNodeId: node.id,
        workflowModelId: model.id || "",
        workflowStep: "strip_target_image",
      },
    },
  });
  if (payload.user) setUser(payload.user);
  const record = payload.record || null;
  const imageUrl = payload.imageUrl || record?.imageResultUrl || record?.localImageUrl || record?.cdnImageUrl || "";
  if (!imageUrl) throw new Error("Target frame generation returned no image.");
  workflowSetNodeData(targetNode.id, {
    stripTargetImageUrl: imageUrl,
    stripTargetTaskId: payload.taskId || record?.taskId || "",
    stripTargetRecord: record,
    stripTargetSourceKey: sourceKey,
  });
  workflowLog("Target frame ready.");
  return imageUrl;
}

function workflowRecordFromPayload(payload = {}, fallback = {}) {
  const taskId = payload.taskId || payload.task?.taskId || payload.record?.taskId || payload.generation?.taskId || "";
  return payload.record || payload.generation || {
    taskId,
    status: payload.task?.status || "submitted",
    provider: "seedance",
    source: "workflow",
    kind: "workflow-video",
    prompt: fallback.prompt || "",
    model: fallback.model || "",
    ratio: fallback.ratio || "9:16",
    resolution: fallback.resolution || "720p",
    duration: fallback.duration || 5,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function workflowSetNodeData(nodeId = "", patch = {}) {
  const node = workflowNodeById(nodeId);
  if (!node) return null;
  node.data = { ...(node.data || {}), ...patch };
  persistWorkflowState();
  window.WorkflowReactCanvas?.sync?.();
  return node;
}

function workflowNodeActiveTab(node = {}) {
  return ["unifiedVideoGen", "video"].includes(node.type) && node.data?.activeTab === "params" ? "params" : "preview";
}

function workflowPreviewKindFromUrl(url = "", fallback = "video") {
  const value = String(url || "");
  if (/^data:image\//i.test(value) || /\.(?:avif|bmp|gif|jpe?g|png|svg|webp)(?:[?#].*)?$/i.test(value)) return "image";
  if (/^data:video\//i.test(value) || /\.(?:m4v|mov|mp4|webm)(?:[?#].*)?$/i.test(value)) return "video";
  return fallback;
}

function workflowPreviewAttrs({ url = "", kind = "", title = "", ratio = "9:16" } = {}) {
  if (!url) return "";
  return `data-workflow-preview-url="${escapeHtml(url)}" data-workflow-preview-kind="${escapeHtml(kind || workflowPreviewKindFromUrl(url))}" data-workflow-preview-title="${escapeHtml(title || "Workflow preview")}" data-workflow-preview-ratio="${escapeHtml(ratio || "9:16")}"`;
}

function renderWorkflowPreviewThumb({ url = "", poster = "", title = "", kind = "", badge = "", ratio = "9:16", icon = "play", className = "" } = {}) {
  const mediaKind = kind || workflowPreviewKindFromUrl(url);
  const previewAttrs = workflowPreviewAttrs({ url, kind: mediaKind, title, ratio });
  const media = url
    ? mediaKind === "image"
      ? `<img src="${escapeHtml(url)}" alt="" loading="lazy" decoding="async" />`
      : `<video src="${escapeHtml(url)}" ${poster ? `poster="${escapeHtml(poster)}"` : ""} muted loop playsinline autoplay preload="metadata"></video>`
    : `<img src="${escapeHtml(DEFAULT_TEMPLATE_COVER)}" alt="" loading="lazy" decoding="async" />`;
  return `
    <button class="workflow-node-preview-button ${escapeHtml(className)}" type="button" ${previewAttrs} ${url ? "" : "disabled"}>
      ${media}
      <span class="workflow-node-preview-play"><i data-lucide="${escapeHtml(icon)}"></i></span>
      ${badge ? `<span class="workflow-node-demo-badge">${escapeHtml(badge)}</span>` : ""}
    </button>
  `;
}

function renderWorkflowUploadSlot(node = {}, field = "startImage", label = "Start", icon = "image") {
  const value = node.data?.[field] || "";
  const fieldClass = [
    "workflow-upload-field",
    field === "startImage" ? "is-start" : "",
    field === "endImage" ? "is-end" : "",
    field === "faceImage" ? "is-face" : "",
  ].filter(Boolean).join(" ");
  const slotClass = [
    "workflow-upload-slot",
    field === "startImage" ? "is-primary" : "is-small",
    field === "faceImage" ? "is-face" : "",
  ].filter(Boolean).join(" ");
  const hint = field === "startImage" ? "required" : field === "faceImage" ? "for face swap" : "optional";
  const emptyText = field === "faceImage" ? "Drop face photo here" : "Drop here";
  return `
    <div class="${fieldClass}">
      <div class="workflow-upload-label">
        <strong>${escapeHtml(label)}</strong>
        <span>${escapeHtml(hint)}</span>
      </div>
      <div class="${slotClass}">
        <label class="workflow-upload-pick">
          <input type="file" accept="image/*" data-workflow-file="${escapeHtml(field)}" data-node-id="${escapeHtml(node.id)}" />
          <span class="workflow-upload-preview">
            ${value
              ? `<img src="${escapeHtml(value)}" alt="" loading="lazy" decoding="async" />`
              : `<span class="workflow-upload-empty"><i data-lucide="${escapeHtml(icon)}"></i><em>${escapeHtml(emptyText)}</em><b>Browse</b></span>`}
          </span>
        </label>
        ${value ? `
          <button class="workflow-upload-preview-open" type="button" ${workflowPreviewAttrs({ url: value, kind: "image", title: label, ratio: "1:1" })} aria-label="Preview ${escapeHtml(label)}">
            <i data-lucide="maximize-2"></i>
          </button>
        ` : ""}
      </div>
    </div>
  `;
}

function renderWorkflowUploadPreparedPreview(node = {}) {
  const keyframeUrl = node.data?.keyframeImageUrl || "";
  const targetUrl = node.data?.stripTargetImageUrl || "";
  if (!keyframeUrl && !targetUrl) return "";
  const item = (url, label) => url ? `
    <button class="workflow-upload-ready-pill" type="button" ${workflowPreviewAttrs({ url, kind: "image", title: label, ratio: "9:16" })}>
      <i data-lucide="check"></i>${escapeHtml(label)} Ready
    </button>
  ` : "";
  return `
    <div class="workflow-upload-ready-row">
      ${item(keyframeUrl, "Start Frame")}
      ${item(targetUrl, "Target")}
    </div>
  `;
}

function renderWorkflowMediaPreview(node = {}, model = null) {
  if (node.type === "upload") {
    const image = node.data?.startImage || "";
    return image
      ? renderWorkflowPreviewThumb({ url: image, title: node.title || "Start image", kind: "image", badge: "Start", ratio: "1:1", icon: "maximize-2" })
      : `<i data-lucide="image-up"></i><span>Start image</span>`;
  }
  const videoUrl = workflowNodeResultVideo(node);
  const posterUrl = workflowNodePoster(node);
  const preset = model || workflowNodeModel(node);
  const preparedImageUrl = !videoUrl ? (node.data?.stripTargetImageUrl || node.data?.keyframeImageUrl || "") : "";
  const previewUrl = videoUrl || preparedImageUrl || preset.previewUrl || "";
  const previewPoster = videoUrl ? posterUrl : (preset.posterUrl || posterUrl || "");
  const preparedBadge = node.data?.stripTargetImageUrl ? "Target" : "Keyframe";
  const badge = videoUrl ? "Result" : preparedImageUrl ? preparedBadge : "Demo";
  if (previewUrl) {
    return renderWorkflowPreviewThumb({
      url: previewUrl,
      poster: previewPoster,
      title: node.title || preset.label || "Workflow preview",
      kind: preparedImageUrl ? "image" : "video",
      badge,
      ratio: node.data?.ratio || "9:16",
      icon: preparedImageUrl ? "maximize-2" : "play",
    });
  }
  if (previewPoster) {
    return renderWorkflowPreviewThumb({
      url: previewPoster,
      title: node.title || preset.label || "Workflow preview",
      kind: "image",
      badge,
      ratio: node.data?.ratio || "9:16",
      icon: "maximize-2",
    });
  }
  const fallbackBadge = node.data?.status ? workflowNodeStatusText(node) : "Preview";
  return renderWorkflowPreviewThumb({
    badge: fallbackBadge,
    icon: node.data?.status === "running" ? "loader-circle" : "play",
  });
}

let activeWorkflowConnection = null;
let activeWorkflowNodeDrag = null;
let suppressWorkflowClickUntil = 0;
let suppressWorkflowClickNodeId = "";
let suppressWorkflowViewportSaveUntil = 0;

function revealWorkflowNode(nodeId = "") {
  const canvas = els.workflowRoot?.querySelector(".workflow-canvas");
  const node = workflowNodeById(nodeId);
  if (!canvas || !node) return;
  const zoom = workflowZoom();
  const padding = 32;
  const left = Number(node.x || 0) * zoom;
  const top = Number(node.y || 0) * zoom;
  const right = left + workflowNodeWidth(node) * zoom;
  const bottom = top + workflowNodeHeight(node) * zoom;
  let nextLeft = canvas.scrollLeft;
  let nextTop = canvas.scrollTop;
  if (left < nextLeft + padding) nextLeft = Math.max(0, left - padding);
  else if (right > nextLeft + canvas.clientWidth - padding) nextLeft = Math.max(0, right - canvas.clientWidth + padding);
  if (top < nextTop + padding) nextTop = Math.max(0, top - padding);
  else if (bottom > nextTop + canvas.clientHeight - padding) nextTop = Math.max(0, bottom - canvas.clientHeight + padding);
  suppressWorkflowViewportSaveUntil = Date.now() + 100;
  canvas.scrollLeft = nextLeft;
  canvas.scrollTop = nextTop;
  const workflow = ensureWorkflowState();
  workflow.scrollLeft = canvas.scrollLeft;
  workflow.scrollTop = canvas.scrollTop;
}

function workflowNodeAcceptsInput(node = null) {
  return Boolean(node && ["imageGenerate", "unifiedVideoGen", "imageResult", "videoResult", "imageDisplay"].includes(node.type));
}

function workflowNodeAcceptsOutput(node = null) {
  return Boolean(node && ["imageGenerate", "unifiedVideoGen", "imageResult", "videoResult", "imageDisplay"].includes(node.type));
}

function workflowNodeWidth(node = {}) {
  if (["imageResult", "videoResult"].includes(node.type)) return 360;
  if (["imageReference", "image", "upload", "videoReference"].includes(node.type)) return 300;
  if (["prompt", "output"].includes(node.type)) return 360;
  return WORKFLOW_NODE_WIDTH;
}

function workflowNodeHeight(node = {}) {
  if (["imageResult", "videoResult"].includes(node.type)) return 340;
  if (["imageReference", "image", "upload", "videoReference"].includes(node.type)) return 300;
  if (node.type === "prompt") return 300;
  if (node.type === "output") return 270;
  return selectedWorkflowNode()?.id === node.id ? 640 : 368;
}

function workflowNodeAnchor(node = {}, side = "out") {
  const yOffset = ["imageResult", "videoResult"].includes(node.type) ? 20
    : ["imageReference", "image", "upload", "videoReference"].includes(node.type) ? 150
    : node.type === "prompt" ? 145
      : node.type === "output" ? 105
        : node.type === "imageDisplay" || node.type === "imageGenerate" ? 170 : 190;
  return {
    x: Number(node.x || 0) + (side === "out" ? workflowNodeWidth(node) : 0),
    y: Number(node.y || 0) + yOffset,
  };
}

function workflowConnectionPath(x1 = 0, y1 = 0, x2 = 0, y2 = 0) {
  const direction = x2 >= x1 ? 1 : -1;
  const mid = Math.max(34, Math.round(Math.abs(x2 - x1) / 2));
  return `M ${x1} ${y1} C ${x1 + mid * direction} ${y1}, ${x2 - mid * direction} ${y2}, ${x2} ${y2}`;
}

function renderWorkflowConnectors(node = {}) {
  const nodeId = escapeHtml(node.id || "");
  return `
    ${workflowNodeAcceptsInput(node) ? `<button class="workflow-node-connect workflow-node-connect-in" type="button" data-workflow-connect="in" data-node-id="${nodeId}" aria-label="Connect into ${escapeHtml(node.title || "node")}"></button>` : ""}
    ${workflowNodeAcceptsOutput(node) ? `<button class="workflow-node-connect workflow-node-connect-out" type="button" data-workflow-connect="out" data-node-id="${nodeId}" aria-label="Connect from ${escapeHtml(node.title || "node")}"></button>` : ""}
  `;
}

function workflowImageModelById(modelId = "") {
  const library = Array.isArray(WORKFLOW_IMAGE_MODEL_LIBRARY) ? WORKFLOW_IMAGE_MODEL_LIBRARY.filter(Boolean) : [];
  return library.find((model) => model.id === modelId)
    || library[0]
    || { id: "", label: "", ratio: "1:1", resolution: "2K", ratios: ["1:1"], resolutions: ["2K"], outputCounts: [1] };
}

function workflowVideoModelById(modelId = "") {
  const normalizedModelId = modelId === "seedance25" ? "seedance-nsfw" : modelId;
  const library = Array.isArray(WORKFLOW_VIDEO_MODEL_LIBRARY) ? WORKFLOW_VIDEO_MODEL_LIBRARY.filter(Boolean) : [];
  return library.find((model) => model.id === normalizedModelId)
    || library[0]
    || { id: "", label: "", ratio: "16:9", resolution: "720p", durations: [4, 5, 8], ratios: ["16:9"], resolutions: ["480p", "720p"], modes: [] };
}

function workflowImageModelOptions(model = {}) {
  return Array.isArray(model.ratios) && model.ratios.length ? model.ratios : ["1:1", "3:4", "4:3", "9:16", "16:9"];
}

function workflowImageResolutionOptions(model = {}) {
  return Array.isArray(model.resolutions) && model.resolutions.length ? model.resolutions : ["1K", "2K"];
}

function workflowVideoResolutionOptions(model = {}) {
  return Array.isArray(model.resolutions) && model.resolutions.length ? model.resolutions : ["720p", "1080p"];
}

function workflowVideoRatioOptions(model = {}) {
  return Array.isArray(model.ratios) && model.ratios.length ? model.ratios : ["16:9", "9:16", "1:1"];
}

function workflowVideoDurationOptions(model = {}, resolution = "") {
  const values = Array.isArray(model.durations) && model.durations.length ? model.durations : [4, 5, 8, 10, 15, 20, 30];
  const filtered = values.filter((value) => !(model.id === "seedance25" && resolution === "720p" && Number(value) === 30));
  return [...new Set(filtered)].sort((left, right) => Number(left) - Number(right));
}

function workflowVideoModeOptions(model = {}) {
  if (Array.isArray(model.modes) && model.modes.length) return model.modes;
  return model.mode ? [{ value: model.mode, label: model.mode }] : [];
}

function workflowVideoMode(node = {}, model = {}) {
  const options = workflowVideoModeOptions(model);
  const selected = String(node.data?.mode || "").trim();
  return options.some((item) => item.value === selected) ? selected : (options[0]?.value || "");
}

function workflowNodeModel(node = {}) {
  return ["imageDisplay", "imageGenerate"].includes(node?.type)
    ? workflowImageModelById(node.data?.modelId)
    : workflowVideoModelById(node.data?.modelId);
}

function workflowNodeReferences(node = {}, field = "referenceImages") {
  return Array.isArray(node?.data?.[field]) ? node.data[field].filter(Boolean) : [];
}

function workflowNodeIncomingMedia(node = {}) {
  if (!node?.id) return { images: [], videos: [] };
  const images = [];
  const videos = [];
  const sources = workflowIncomingEdges(node.id)
    .map((edge, edgeIndex) => ({ source: workflowNodeById(edge.from), edgeIndex }))
    .filter((item) => item.source)
    .sort((left, right) => (
      Number(left.source.y || 0) - Number(right.source.y || 0)
      || Number(left.source.x || 0) - Number(right.source.x || 0)
      || left.edgeIndex - right.edgeIndex
    ));
  sources.forEach(({ source }) => {
    images.push(...workflowNodeResultImages(source));
    videos.push(...workflowNodeResultVideos(source));
  });
  return { images: [...new Set(images)], videos: [...new Set(videos)] };
}

function workflowReferencePreview(value = "", kind = "image") {
  const url = String(value || "");
  return kind === "audio"
    ? `<span class="workflow-reference-audio"><i data-lucide="music-2"></i></span>`
    : kind === "video"
      ? `<video src="${escapeHtml(url)}" muted playsinline preload="metadata"></video>`
      : `<img src="${escapeHtml(url)}" alt="" loading="lazy" decoding="async" />`;
}

function renderWorkflowReferenceList(node = {}, field = "referenceImages", kind = "image") {
  const values = workflowNodeReferences(node, field);
  if (!values.length) return "";
  return `<div class="workflow-reference-list">${values.map((value, index) => `
    <span class="workflow-reference-chip">
      ${workflowReferencePreview(value, kind)}
      <button type="button" data-workflow-remove-reference="${escapeHtml(field)}" data-node-id="${escapeHtml(node.id)}" data-reference-index="${index}" aria-label="Remove reference"><i data-lucide="x"></i></button>
    </span>
  `).join("")}</div>`;
}

function renderWorkflowReferencePicker(node = {}, field = "referenceImages", kind = "image", label = "Image") {
  const accept = kind === "video" ? "video/*" : kind === "audio" ? "audio/*" : "image/*";
  const icon = kind === "video" ? "video" : kind === "audio" ? "music-2" : "image-plus";
  return `
    <label class="workflow-reference-picker">
      <input type="file" accept="${accept}" multiple data-workflow-file="${escapeHtml(field)}" data-workflow-file-kind="${escapeHtml(kind)}" data-node-id="${escapeHtml(node.id)}" />
      <i data-lucide="${icon}"></i><span>${escapeHtml(label)}</span>
    </label>
  `;
}

function renderWorkflowNodeResult(node = {}) {
  const isImage = ["imageDisplay", "imageGenerate"].includes(node.type);
  const url = isImage ? workflowNodeResultImage(node) : workflowNodeResultVideo(node);
  const poster = workflowNodePoster(node);
  if (url) {
    return renderWorkflowPreviewThumb({
      url,
      poster,
      title: node.title || (isImage ? "Image result" : "Video result"),
      kind: isImage ? "image" : "video",
      badge: "Result",
      ratio: node.data?.ratio || (isImage ? "1:1" : "16:9"),
      icon: "maximize-2",
      className: "workflow-node-result-media",
    });
  }
  return `<div class="workflow-node-empty-result"><i data-lucide="${isImage ? "image" : "play"}"></i><span>生成结果会显示在这里</span></div>`;
}

function workflowSelectOptions(options = [], value = "") {
  return options.map((option) => `<option value="${escapeHtml(option.value || option.id)}" ${String(value) === String(option.value || option.id) ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("");
}

function renderWorkflowImageEditor(node = {}) {
  const model = workflowImageModelById(node.data?.modelId);
  const inputMedia = workflowNodeIncomingMedia(node);
  const references = inputMedia.images;
  const runState = workflowNodeRunState(node);
  const ratios = workflowImageModelOptions(model).map((value) => ({ value, label: value }));
  const resolutions = workflowImageResolutionOptions(model).map((value) => ({ value, label: value }));
  const tierOptions = (model.tiers || []).map((value) => ({ value, label: value === "standard" ? "Standard" : "Pro" }));
  const outputOptions = (model.outputCounts || [1]).map((value) => ({ value: String(value), label: `${value} image${value === 1 ? "" : "s"}` }));
  return `
    <div class="workflow-node-editor workflow-image-editor">
      <div class="workflow-editor-reference-row">
        <span class="workflow-editor-reference-note">${references.length ? `已连接 ${references.length} 个图片输入` : "连接图片输入节点；点击左侧空接口可自动补节点"}</span>
      </div>
      <label class="workflow-editor-prompt"><span>提示词</span><textarea rows="3" data-workflow-image-prompt="${escapeHtml(node.id)}" placeholder="描述你想生成的图片...">${escapeHtml(node.data?.prompt || "")}</textarea></label>
      <div class="workflow-editor-fields">
        <label><span>模型</span><select data-workflow-image-model="${escapeHtml(node.id)}">${workflowSelectOptions(WORKFLOW_IMAGE_MODEL_LIBRARY, node.data?.modelId || model.id)}</select></label>
        <label><span>比例</span><select data-workflow-ratio="${escapeHtml(node.id)}">${workflowSelectOptions(ratios, node.data?.ratio || model.ratio)}</select></label>
        <label><span>分辨率</span><select data-workflow-resolution="${escapeHtml(node.id)}">${workflowSelectOptions(resolutions, node.data?.resolution || model.resolution)}</select></label>
        ${tierOptions.length > 1 ? `<label><span>档位</span><select data-workflow-image-tier="${escapeHtml(node.id)}">${workflowSelectOptions(tierOptions, node.data?.qwenTier || node.data?.seedreamTier || model.defaultTier || tierOptions[0]?.value)}</select></label>` : ""}
        ${outputOptions.length > 1 ? `<label><span>数量</span><select data-workflow-output-count="${escapeHtml(node.id)}">${workflowSelectOptions(outputOptions, String(node.data?.outputImageCount || 1))}</select></label>` : ""}
      </div>
      ${model.id === "qwen-image3" ? `<div class="workflow-editor-inline-options">
        <label class="workflow-editor-check"><input type="checkbox" data-workflow-toggle="promptExtend" data-node-id="${escapeHtml(node.id)}" ${node.data?.promptExtend !== false ? "checked" : ""} /><span>扩展提示词</span></label>
        <label class="workflow-editor-check"><input type="checkbox" data-workflow-toggle="watermark" data-node-id="${escapeHtml(node.id)}" ${node.data?.watermark === true ? "checked" : ""} /><span>水印</span></label>
      </div>` : ""}
      <div class="workflow-editor-actions">
        <span class="workflow-editor-cost">${escapeHtml(workflowCostLabel(node))} 积分</span>
        <button class="workflow-node-generate" type="button" data-workflow-run-node="${escapeHtml(node.id)}" ${runState.disabled ? "disabled" : ""}><i data-lucide="${escapeHtml(runState.icon)}"></i>${escapeHtml(runState.label === "Run" ? "生成" : runState.label)}</button>
      </div>
    </div>
  `;
}

function renderWorkflowVideoEditor(node = {}) {
  const model = workflowVideoModelById(node.data?.modelId);
  const inputMedia = workflowNodeIncomingMedia(node);
  const imageCount = inputMedia.images.length;
  const videoCount = inputMedia.videos.length;
  const audioCount = 0;
  const runState = workflowNodeRunState(node);
  const modelValue = node.data?.modelId || model.id;
  const ratioOptions = workflowVideoRatioOptions(model).map((value) => ({ value, label: value === "adaptive" ? "自适应" : value }));
  const resolutionOptions = workflowVideoResolutionOptions(model).map((value) => ({ value, label: value === "4k" ? "4K" : value }));
  const durationOptions = workflowVideoDurationOptions(model, node.data?.resolution || model.resolution);
  const modeOptions = workflowVideoModeOptions(model);
  const selectedMode = workflowVideoMode(node, model);
  return `
    <div class="workflow-node-editor workflow-video-editor">
      <div class="workflow-editor-reference-row">
        <span class="workflow-editor-reference-note">连接图片/视频输入节点；点击左侧空接口可自动补节点</span>
      </div>
      <div class="workflow-editor-input-summary"><span>${imageCount} 图片</span><span>${videoCount} 视频</span><span>${audioCount} 音频</span></div>
      <label class="workflow-editor-prompt"><span>提示词</span><textarea rows="3" data-workflow-video-prompt="${escapeHtml(node.id)}" placeholder="描述你想生成的视频...">${escapeHtml(node.data?.prompt || "")}</textarea>${typeof window.isWanPromptOptimizerProvider === "function" && window.isWanPromptOptimizerProvider(modelValue) ? `<button class="prompt-optimizer-trigger workflow-prompt-optimizer-trigger" type="button" data-workflow-optimize-prompt="${escapeHtml(node.id)}"><i data-lucide="sparkles"></i>AI 优化</button>` : ""}</label>
      <div class="workflow-editor-fields">
        <label><span>模型</span><select data-workflow-video-model="${escapeHtml(node.id)}">${workflowSelectOptions(WORKFLOW_VIDEO_MODEL_LIBRARY, modelValue)}</select></label>
        <label><span>比例</span><select data-workflow-ratio="${escapeHtml(node.id)}">${workflowSelectOptions(ratioOptions, node.data?.ratio || model.ratio)}</select></label>
        <label><span>分辨率</span><select data-workflow-resolution="${escapeHtml(node.id)}">${workflowSelectOptions(resolutionOptions, node.data?.resolution || model.resolution)}</select></label>
        <label><span>时长</span><select data-workflow-duration="${escapeHtml(node.id)}">${durationOptions.map((value) => `<option value="${value}" ${Number(node.data?.duration || model.duration) === value ? "selected" : ""}>${value === -1 ? "自动" : `${value}s`}</option>`).join("")}</select></label>
        ${modeOptions.length ? `<label><span>模式</span><select data-workflow-mode="${escapeHtml(node.id)}">${workflowSelectOptions(modeOptions, selectedMode)}</select></label>` : ""}
      </div>
      <label class="workflow-editor-check"><input type="checkbox" data-workflow-toggle="addSound" data-node-id="${escapeHtml(node.id)}" ${node.data?.addSound !== false ? "checked" : ""} /><span>生成音频</span></label>
      <div class="workflow-editor-actions">
        <span class="workflow-editor-cost">${escapeHtml(workflowCostLabel(node))} 积分</span>
        <button class="workflow-node-generate" type="button" data-workflow-run-node="${escapeHtml(node.id)}" ${runState.disabled ? "disabled" : ""}><i data-lucide="${escapeHtml(runState.icon)}"></i>${escapeHtml(runState.label === "Run" ? "生成" : runState.label)}</button>
      </div>
    </div>
  `;
}

function renderWorkflowNode(node = {}) {
  const selected = selectedWorkflowNode()?.id === node.id;
  const style = `left:${Number(node.x || 0)}px;top:${Number(node.y || 0)}px`;
  const statusClassName = statusClass(node.data?.status || "ready");
  if (["imageReference", "image", "upload"].includes(node.type)) {
    const value = node.data?.imageUrl || node.data?.startImage || "";
    return `<article class="workflow-node workflow-node-upload workflow-node-image workflow-node-reference ${selected ? "is-selected" : ""}" style="${style}" data-workflow-node="${escapeHtml(node.id)}">
      ${renderWorkflowConnectors(node)}<header><span class="workflow-node-title-icon"><i data-lucide="image"></i></span><strong>${escapeHtml(node.title || "Image reference")}</strong><button type="button" data-workflow-delete="${escapeHtml(node.id)}" aria-label="Delete image node"><i data-lucide="trash-2"></i></button></header>
      <label class="workflow-reference-dropzone"><input type="file" accept="image/*" data-workflow-file="imageUrl" data-node-id="${escapeHtml(node.id)}" />${value ? `<img src="${escapeHtml(value)}" alt="" loading="lazy" decoding="async" />` : `<span><i data-lucide="upload"></i><strong>Add image</strong><small>Click or drop an image</small></span>`}</label>
      <footer><span>${value ? "Ready" : "Waiting for image"}</span><strong>Image reference</strong></footer></article>`;
  }
  if (node.type === "videoReference") {
    const value = node.data?.videoUrl || "";
    return `<article class="workflow-node workflow-node-upload workflow-node-video-reference workflow-node-reference ${selected ? "is-selected" : ""}" style="${style}" data-workflow-node="${escapeHtml(node.id)}">
      ${renderWorkflowConnectors(node)}<header><span class="workflow-node-title-icon"><i data-lucide="video"></i></span><strong>${escapeHtml(node.title || "Video reference")}</strong><button type="button" data-workflow-delete="${escapeHtml(node.id)}" aria-label="Delete video node"><i data-lucide="trash-2"></i></button></header>
      <label class="workflow-reference-dropzone"><input type="file" accept="video/*" data-workflow-file="videoUrl" data-node-id="${escapeHtml(node.id)}" />${value ? `<video src="${escapeHtml(value)}" controls playsinline preload="metadata"></video>` : `<span><i data-lucide="upload"></i><strong>Add video</strong><small>Click or drop a video</small></span>`}</label>
      <footer><span>${value ? "Ready" : "Waiting for video"}</span><strong>Video reference</strong></footer></article>`;
  }
  if (node.type === "prompt") {
    const downstreamCount = workflowDownstreamGenerationNodes(node.id).length;
    return `<article class="workflow-node workflow-node-prompt ${selected ? "is-selected" : ""}" style="${style}" data-workflow-node="${escapeHtml(node.id)}">
      ${renderWorkflowConnectors(node)}<header><span class="workflow-node-title-icon"><i data-lucide="notebook-pen"></i></span><strong>${escapeHtml(node.title || "Story Prompt")}</strong><button type="button" data-workflow-delete="${escapeHtml(node.id)}" aria-label="Delete prompt"><i data-lucide="trash-2"></i></button></header>
      <label class="workflow-field"><span>Story direction</span><textarea rows="7" data-workflow-story-prompt="${escapeHtml(node.id)}" placeholder="Describe the scene, subject, motion, camera, lighting, and continuity.">${escapeHtml(node.data?.prompt || "")}</textarea></label>
      <footer><span>${downstreamCount} connected generation${downstreamCount === 1 ? "" : "s"}</span><strong>Prompt</strong></footer></article>`;
  }
  if (node.type === "output") {
    const incoming = workflowIncomingEdges(node.id).map((edge) => workflowNodeById(edge.from)).filter(Boolean);
    const results = incoming.map((item) => ({ node: item, video: workflowNodeResultVideo(item), image: workflowNodeResultImage(item) })).filter((item) => item.video || item.image);
    const first = results[0] || {};
    return `<article class="workflow-node workflow-node-output ${selected ? "is-selected" : ""}" style="${style}" data-workflow-node="${escapeHtml(node.id)}">
      ${renderWorkflowConnectors(node)}<header><i data-lucide="sparkles"></i><strong>${escapeHtml(node.title || "Final Output")}</strong><button type="button" data-workflow-delete="${escapeHtml(node.id)}" aria-label="Delete output"><i data-lucide="trash-2"></i></button></header>
      ${first.video ? `<div class="workflow-node-media"><button class="workflow-node-preview-button" type="button" data-workflow-preview="${escapeHtml(first.node.id)}"><video src="${escapeHtml(first.video)}" muted loop playsinline autoplay preload="metadata"></video><span class="workflow-node-preview-play"><i data-lucide="play"></i></span></button></div>` : first.image ? `<div class="workflow-node-media"><img src="${escapeHtml(first.image)}" alt="" loading="lazy" /></div>` : ""}
      <div class="workflow-output-box">${results.length ? results.map((item) => `<button type="button" data-workflow-preview="${escapeHtml(item.node.id)}">${escapeHtml(item.node.title || "Result")}</button>`).join("") : "<span>Run a connected generation node to collect output</span>"}</div>
    </article>`;
  }
  if (!["imageDisplay", "imageGenerate", "unifiedVideoGen", "video"].includes(node.type)) return "";
  const isImage = ["imageDisplay", "imageGenerate"].includes(node.type);
  const model = workflowNodeModel(node);
  const runState = workflowNodeRunState(node);
  return `
    <article class="workflow-node ${isImage ? "workflow-node-image-display" : "workflow-node-unified-video"} ${selected ? "is-selected" : ""} is-${escapeHtml(statusClassName)}" style="${style}" data-workflow-node="${escapeHtml(node.id)}">
      ${renderWorkflowConnectors(node)}
      <header>
        <span class="workflow-node-title-icon"><i data-lucide="${isImage ? "image" : "video"}"></i></span>
        <strong>${escapeHtml(node.title || model.label)}</strong>
        <span class="workflow-node-model-label">${escapeHtml(model.label)}</span>
        <button class="workflow-node-header-run ${state.workflowActiveNodeId === node.id ? "is-running" : ""}" type="button" data-workflow-run-node="${escapeHtml(node.id)}" title="${escapeHtml(runState.reason)}" ${runState.disabled ? "disabled" : ""}><i data-lucide="${escapeHtml(runState.icon)}"></i></button>
        <button type="button" data-workflow-delete="${escapeHtml(node.id)}" aria-label="Delete node"><i data-lucide="trash-2"></i></button>
      </header>
      <div class="workflow-node-result ${isImage ? "is-image" : "is-video"}">${renderWorkflowNodeResult(node)}</div>
      ${selected ? (isImage ? renderWorkflowImageEditor(node) : renderWorkflowVideoEditor(node)) : ""}
      <footer><span>${escapeHtml(workflowNodeStatusText(node))}${node.data?.taskId ? ` · ${escapeHtml(node.data.taskId)}` : ""}</span><strong>${escapeHtml(workflowCostLabel(node))} 积分</strong></footer>
    </article>
  `;
}

function renderWorkflowNodeToggle(node = {}, key = "", label = "", hint = "", icon = "circle") {
  const checked = workflowNodeOptionEnabled(node, key);
  return `
    <label class="workflow-node-toggle">
      <input type="checkbox" data-workflow-toggle="${escapeHtml(key)}" data-node-id="${escapeHtml(node.id)}" ${checked ? "checked" : ""} />
      <span class="workflow-node-toggle-icon"><i data-lucide="${escapeHtml(icon)}"></i></span>
      <span class="workflow-node-toggle-copy">
        <strong>${escapeHtml(label)}</strong>
        ${hint ? `<small>${escapeHtml(hint)}</small>` : ""}
      </span>
    </label>
  `;
}

function renderWorkflowEdges() {
  const workflow = ensureWorkflowState();
  const nodeById = new Map(workflow.nodes.map((node) => [node.id, node]));
  return workflow.edges.map((edge) => {
    const from = nodeById.get(edge.from);
    const to = nodeById.get(edge.to);
    if (!from || !to) return "";
    const fromPoint = workflowNodeAnchor(from, "out");
    const toPoint = workflowNodeAnchor(to, "in");
    const path = workflowConnectionPath(fromPoint.x, fromPoint.y, toPoint.x, toPoint.y);
    const edgeAttrs = `data-edge-from="${escapeHtml(edge.from)}" data-edge-to="${escapeHtml(edge.to)}"`;
    return `
      <path class="workflow-edge-hit" d="${path}" data-workflow-edge-drag="to" ${edgeAttrs} />
      <path class="workflow-edge-path" d="${path}" />
      <circle class="workflow-edge-handle workflow-edge-handle-out" cx="${fromPoint.x}" cy="${fromPoint.y}" r="8" data-workflow-edge-handle="from" ${edgeAttrs} />
      <circle class="workflow-edge-handle workflow-edge-handle-in" cx="${toPoint.x}" cy="${toPoint.y}" r="8" data-workflow-edge-handle="to" ${edgeAttrs} />
    `;
  }).join("");
}

function renderWorkflowPicker() {
  const node = workflowNodeById(state.workflowPickerNodeId || "");
  if (!node || !["unifiedVideoGen", "video"].includes(node.type)) return "";
  const selectedModel = workflowVideoModelById(node.data?.modelId);
  const search = String(state.workflowPickerSearch || "").trim().toLowerCase();
  const presets = workflowFilteredPresets(search);
  return `
    <div class="workflow-picker-backdrop" data-workflow-close-picker>
      <section class="workflow-picker" aria-modal="true" role="dialog" aria-label="Choose workflow scene" data-workflow-picker>
        <header>
          <div>
            <span>Scene / action</span>
            <strong>Choose preview</strong>
          </div>
          <button type="button" data-workflow-close-picker aria-label="Close"><i data-lucide="x"></i></button>
        </header>
        <div class="workflow-picker-search">
          <i data-lucide="search"></i>
          <input type="search" value="${escapeHtml(state.workflowPickerSearch || "")}" placeholder="Search..." data-workflow-picker-search />
        </div>
        <div class="workflow-picker-grid">${renderWorkflowPickerCards(presets, selectedModel)}</div>
      </section>
    </div>
  `;
}

function workflowFilteredPresets(searchText = "") {
  const search = String(searchText || "").trim().toLowerCase();
  return workflowPresetLibrary()
    .map(normalizeWorkflowPreset)
    .filter((preset) => {
      if (!search) return true;
      return preset.label.toLowerCase().includes(search)
        || preset.id.toLowerCase().includes(search)
        || preset.category.toLowerCase().includes(search)
        || preset.prompt.toLowerCase().includes(search);
    });
}

function renderWorkflowPickerCards(presets = [], selectedModel = {}) {
  return presets.map((preset) => {
    const active = selectedModel.id === preset.id;
    const media = preset.previewUrl
      ? `<video src="${escapeHtml(preset.previewUrl)}" ${preset.posterUrl ? `poster="${escapeHtml(preset.posterUrl)}"` : ""} muted loop playsinline autoplay preload="metadata"></video>`
      : `<span class="workflow-picker-empty"><i data-lucide="clapperboard"></i></span>`;
    return `
      <button class="workflow-picker-card ${active ? "is-active" : ""}" type="button" data-workflow-select-model="${escapeHtml(preset.id)}" aria-label="${escapeHtml(preset.label || "Workflow action")}" title="${escapeHtml(preset.label || "Workflow action")}">
        <span class="workflow-picker-media">${media}</span>
      </button>
    `;
  }).join("");
}

function workflowStatusText() {
  return state.workflowMessage || `${workflowSourceNodes().length} inputs / ${workflowGenerationNodes().length} generation nodes`;
}

function syncWorkflowStatusText() {
  const element = els.workflowRoot?.querySelector(".workflow-status");
  if (element) element.textContent = workflowStatusText();
}

window.syncWorkflowStatusText = syncWorkflowStatusText;

function renderWorkflowPanel({ focusNodeId = "" } = {}) {
  if (!els.workflowRoot) return;
  let reactHost = els.workflowRoot.querySelector(".workflow-react-host");
  if (!reactHost) {
    els.workflowRoot.innerHTML = `<section class="workflow-react-host" aria-label="画布工作区"></section>`;
    reactHost = els.workflowRoot.querySelector(".workflow-react-host");
  }

  if (!reactHost) return;
  if (!window.WorkflowReactCanvas?.mount) {
    reactHost.innerHTML = `<div class="workflow-react-unavailable" role="alert">画布组件未能加载，请刷新页面后重试。</div>`;
    return;
  }
  if (!window.WorkflowReactCanvas.isMounted?.(reactHost)) window.WorkflowReactCanvas.mount(reactHost);
  else window.WorkflowReactCanvas.sync();
  if (focusNodeId) window.WorkflowReactCanvas.selectNode(focusNodeId);
}

window.renderWorkflowPanel = renderWorkflowPanel;
window.workflowNodeAcceptsInput = workflowNodeAcceptsInput;
window.workflowNodeAcceptsOutput = workflowNodeAcceptsOutput;
window.selectedWorkflowNode = selectedWorkflowNode;
window.workflowNodeModel = workflowNodeModel;
window.workflowNodeRunState = workflowNodeRunState;
window.workflowNodeResultImage = workflowNodeResultImage;
window.workflowNodeResultImages = workflowNodeResultImages;
window.workflowNodeOwnResultImages = workflowNodeOwnResultImages;
window.workflowNodeResultVideo = workflowNodeResultVideo;
window.workflowNodeResultVideos = workflowNodeResultVideos;
window.workflowNodeOwnResultVideos = workflowNodeOwnResultVideos;
window.workflowNodePoster = workflowNodePoster;
window.workflowNodeReferences = workflowNodeReferences;
window.workflowNodeIncomingMedia = workflowNodeIncomingMedia;
window.workflowCostLabel = workflowCostLabel;
window.workflowImageModelById = workflowImageModelById;
window.workflowVideoModelById = workflowVideoModelById;
window.workflowImageModelOptions = workflowImageModelOptions;
window.workflowImageResolutionOptions = workflowImageResolutionOptions;
window.workflowVideoResolutionOptions = workflowVideoResolutionOptions;
window.workflowVideoRatioOptions = workflowVideoRatioOptions;
window.workflowVideoDurationOptions = workflowVideoDurationOptions;
window.workflowVideoModeOptions = workflowVideoModeOptions;
window.workflowVideoMode = workflowVideoMode;
window.uploadWorkflowFile = uploadWorkflowFile;
window.clearWorkflowExecutionResults = clearWorkflowExecutionResults;
window.updateWorkflowNodeFromControl = updateWorkflowNodeFromControl;
window.WORKFLOW_IMAGE_MODEL_LIBRARY = WORKFLOW_IMAGE_MODEL_LIBRARY;
window.WORKFLOW_VIDEO_MODEL_LIBRARY = WORKFLOW_VIDEO_MODEL_LIBRARY;

function updateWorkflowNodeFromControl(control) {
  const nodeId = control.dataset.workflowPrompt
    || control.dataset.workflowImagePrompt
    || control.dataset.workflowVideoPrompt
    || control.dataset.workflowImageModel
    || control.dataset.workflowVideoModel
    || control.dataset.workflowImageTier
    || control.dataset.workflowOutputCount
    || control.dataset.workflowRatio
    || control.dataset.workflowDuration
    || control.dataset.workflowResolution
    || control.dataset.workflowMode
    || control.dataset.nodeId
    || "";
  const node = workflowNodeById(nodeId);
  if (!node) return;
  if (control.dataset.workflowPrompt || control.dataset.workflowImagePrompt || control.dataset.workflowVideoPrompt) {
    node.data.prompt = control.value || "";
  } else if (control.dataset.workflowImageModel || control.dataset.workflowVideoModel) {
    node.data.modelId = control.value || node.data.modelId;
    const isImageNode = ["imageDisplay", "imageGenerate"].includes(node.type);
    const model = isImageNode ? workflowImageModelById(node.data.modelId) : workflowVideoModelById(node.data.modelId);
    node.title = `${isImageNode ? "图片生成" : "视频生成"} ${isImageNode ? workflowImageNodes().findIndex((item) => item.id === node.id) + 1 : workflowVideoNodes().findIndex((item) => item.id === node.id) + 1}`;
    node.data.resolution = model.resolutions?.includes(node.data.resolution) ? node.data.resolution : model.resolution;
    node.data.ratio = model.ratios?.includes(node.data.ratio) ? node.data.ratio : model.ratio;
    if (node.type === "unifiedVideoGen") {
      node.data.duration = workflowVideoDurationOptions(model, node.data.resolution).includes(Number(node.data.duration)) ? node.data.duration : model.duration;
      node.data.mode = workflowVideoMode(node, model);
    } else {
      node.data.qwenTier = model.id === "qwen-image3" ? (model.defaultTier || "pro") : "";
      node.data.seedreamTier = model.id === "seedream5-image" ? (model.defaultTier || "pro") : "";
      node.data.outputImageCount = model.id === "qwen-image3" ? 1 : 1;
      node.data.promptExtend = model.id === "qwen-image3" ? true : false;
      node.data.watermark = false;
    }
  } else if (control.dataset.workflowImageTier) {
    const nodeModel = workflowImageModelById(node.data?.modelId);
    if (nodeModel.id === "qwen-image3") node.data.qwenTier = control.value || nodeModel.defaultTier || "pro";
    if (nodeModel.id === "seedream5-image") node.data.seedreamTier = control.value || nodeModel.defaultTier || "pro";
  } else if (control.dataset.workflowOutputCount) {
    node.data.outputImageCount = Math.max(1, Math.min(6, Number(control.value || 1) || 1));
  } else if (control.dataset.workflowRatio) {
    node.data.ratio = control.value || "16:9";
  } else if (control.dataset.workflowDuration) {
    node.data.duration = Number(control.value || 5);
  } else if (control.dataset.workflowResolution) {
    node.data.resolution = control.value || "720p";
  } else if (control.dataset.workflowMode) {
    node.data.mode = control.value || "";
  } else if (control.dataset.workflowToggle) {
    node.data[control.dataset.workflowToggle] = Boolean(control.checked);
  }
  persistWorkflowState();
  window.WorkflowReactCanvas?.sync?.();
}

function requestWorkflowUploadJson(url = "", { body, onUploadProgress = null } = {}) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", url);
    request.setRequestHeader("content-type", "application/json");
    if (state.token) request.setRequestHeader("authorization", `Bearer ${state.token}`);
    request.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable || typeof onUploadProgress !== "function") return;
      onUploadProgress(Math.max(1, Math.min(100, Math.round((event.loaded / event.total) * 100))));
    });
    request.addEventListener("load", () => {
      let payload = {};
      try {
        payload = JSON.parse(request.responseText || "{}");
      } catch {}
      if (request.status >= 200 && request.status < 300 && payload.ok !== false) {
        if (typeof onUploadProgress === "function") onUploadProgress(100);
        resolve(payload);
        return;
      }
      const sessionLost = request.status === 401 && Boolean(state.token)
        && (payload.code === "SESSION_REPLACED" || payload.code === "LOGIN_REQUIRED");
      if (sessionLost) clearClientAuthState();
      if (payload.code === "SESSION_REPLACED") {
        window.dispatchEvent(new CustomEvent("raising-session-replaced", { detail: payload }));
      }
      const error = new Error(payload.message || payload.detail || `Request failed: ${request.status}`);
      error.statusCode = request.status;
      error.code = payload.code || "";
      error.payload = payload;
      error.details = payload.details || null;
      reject(error);
    });
    request.addEventListener("error", () => reject(new Error("Upload failed. Check your network connection.")));
    request.addEventListener("abort", () => reject(new Error("Upload canceled.")));
    request.send(typeof body === "string" ? body : JSON.stringify(body || {}));
  });
}

async function uploadWorkflowMediaDataUrl(dataUrl = "", { name = "Workflow media", fileName = "workflow-media", onUploadProgress = null } = {}) {
  const body = { dataUrl, name, fileName };
  const payload = onUploadProgress
    ? await requestWorkflowUploadJson("/api/user-assets", { body, onUploadProgress })
    : await requestJson("/api/user-assets", { method: "POST", body });
  const asset = payload.asset || null;
  const url = String(asset?.publicUrl || asset?.localUrl || asset?.previewUrl || "").trim();
  if (!asset?.id || !url) throw new Error("Failed to store workflow media.");
  state.advancedAssets = [asset, ...(state.advancedAssets || []).filter((item) => item.id !== asset.id)];
  state.userAssets = [asset, ...(state.userAssets || []).filter((item) => item.id !== asset.id)];
  return { assetId: asset.id, url };
}

window.activeWorkflowCanvasId = () => String(state.workflowActiveCanvasId || "");

async function uploadWorkflowFile(file, nodeId = "", onProgress = null) {
  const reportProgress = (value) => {
    if (typeof onProgress === "function") onProgress(Math.max(0, Math.min(100, Math.round(Number(value) || 0))));
  };
  if (typeof window.markWorkflowCanvasLocalEdit === "function") window.markWorkflowCanvasLocalEdit();
  reportProgress(8);
  const dataUrl = await readFileAsDataUrl(file);
  reportProgress(35);
  return uploadWorkflowMediaDataUrl(dataUrl, {
    name: file.name || "Workflow media",
    fileName: file.name || `${nodeId || "workflow"}-media`,
    onUploadProgress: (value) => reportProgress(35 + Number(value || 0) * 0.6),
  });
}


const WORKFLOW_UPLOAD_NODE_TYPES = new Set(["imageGenerate", "unifiedVideoGen"]);

function workflowUploadKindForFile(file = {}) {
  return String(file.type || "").toLowerCase().startsWith("video/") ? "video" : "image";
}

function workflowUploadAcceptsFile(node = {}, file = {}) {
  if (!WORKFLOW_UPLOAD_NODE_TYPES.has(node.type)) return false;
  if (node.data?.status === "uploading") return false;
  const mime = String(file.type || "").toLowerCase();
  if (mime.startsWith("image/")) return true;
  return mime.startsWith("video/") && node.type === "unifiedVideoGen";
}

function workflowUploadedPreviewPatch(file = {}, uploaded = {}) {
  if (workflowUploadKindForFile(file) === "video") {
    return {
      source: "upload",
      status: "succeeded",
      error: "",
      resultVideoUrl: uploaded.url,
      resultVideoAssetId: uploaded.assetId || "",
      posterUrl: "",
    };
  }
  return {
    source: "upload",
    status: "succeeded",
    error: "",
    resultImageUrl: uploaded.url,
    resultImageUrls: [uploaded.url],
    resultImageAssetId: uploaded.assetId || "",
    posterUrl: uploaded.url,
  };
}

function workflowUploadedNodePosition(source = {}, index = 0) {
  const nodeWidth = typeof WORKFLOW_NODE_WIDTH === "number" ? WORKFLOW_NODE_WIDTH : 420;
  const nodeGap = typeof WORKFLOW_NODE_GAP === "number" ? WORKFLOW_NODE_GAP : 28;
  const rowHeight = 360 + 24;
  return {
    x: Number(source.x || 0) - nodeWidth - nodeGap,
    y: Number(source.y || 0) + Math.max(0, Number(index) || 0) * rowHeight,
  };
}

function workflowUploadingPreviewPatch(file = {}) {
  return {
    source: "upload",
    status: "uploading",
    uploadProgress: 5,
    uploadFileName: file.name || "素材",
    error: "",
  };
}

async function uploadWorkflowFilesToNode(files = [], nodeId = "") {
  const list = Array.from(files || []).filter(Boolean);
  if (!list.length) return false;
  const canvasId = String(state.workflowActiveCanvasId || "");
  const node = workflowNodeById(String(nodeId || ""));
  if (!node || !WORKFLOW_UPLOAD_NODE_TYPES.has(node.type)) return false;
  const accepted = list.filter((file) => workflowUploadAcceptsFile(node, file));
  if (!accepted.length) return false;
  state.workflowMessage = "正在上传素材...";
  try {
    const jobs = accepted.map((file, index) => {
      const current = workflowNodeById(node.id);
      if (!current || !WORKFLOW_UPLOAD_NODE_TYPES.has(current.type)) return null;
      const action = workflowUploadKindForFile(file) === "video" ? "add-video" : "add-image";
      const newNode = createWorkflowNode(action, workflowUploadedNodePosition(current, index));
      if (!newNode) throw new Error("Failed to create uploaded media node.");
      newNode.type = workflowUploadKindForFile(file) === "video" ? "videoResult" : "imageResult";
      newNode.title = `${newNode.type === "videoResult" ? "视频素材" : "图片素材"} ${workflowGeneratedResultChildren(current).length + 1}`;
      newNode.data = {
        ...(newNode.data || {}),
        ...workflowUploadingPreviewPatch(file),
      };
      window.connectWorkflowNodes?.(newNode.id, current.id);
      state.workflowSelectedNodeId = newNode.id;
      return { file, nodeId: newNode.id };
    }).filter(Boolean);
    if (!jobs.length) throw new Error("Failed to create uploaded media node.");
    persistWorkflowState();
    window.WorkflowReactCanvas?.sync?.();
    window.WorkflowReactCanvas?.selectNode?.(jobs[jobs.length - 1].nodeId);
    const results = await Promise.all(jobs.map(async ({ file, nodeId: uploadNodeId }) => {
      const updateProgress = (progress) => {
        if (String(state.workflowActiveCanvasId || "") !== canvasId) return;
        const uploadNode = workflowNodeById(uploadNodeId);
        if (!uploadNode) return;
        uploadNode.data = { ...(uploadNode.data || {}), uploadProgress: progress };
        persistWorkflowState({ skipServer: true });
        window.WorkflowReactCanvas?.sync?.();
      };
      try {
        const uploaded = await uploadWorkflowFile(file, uploadNodeId, updateProgress);
        if (String(state.workflowActiveCanvasId || "") !== canvasId) return false;
        const uploadNode = workflowNodeById(uploadNodeId);
        if (!uploadNode) return false;
        uploadNode.data = {
          ...(uploadNode.data || {}),
          ...workflowUploadedPreviewPatch(file, uploaded),
          uploadProgress: 100,
          uploadFileName: "",
        };
        persistWorkflowState();
        window.WorkflowReactCanvas?.sync?.();
        return true;
      } catch (error) {
        if (String(state.workflowActiveCanvasId || "") === canvasId) {
          const uploadNode = workflowNodeById(uploadNodeId);
          if (uploadNode) {
            uploadNode.data = {
              ...(uploadNode.data || {}),
              status: "failed",
              uploadProgress: 0,
              error: error.message || "Upload failed.",
            };
            persistWorkflowState();
            window.WorkflowReactCanvas?.sync?.();
          }
        }
        return false;
      }
    }));
    if (String(state.workflowActiveCanvasId || "") !== canvasId) return false;
    state.workflowMessage = "";
    return results.every(Boolean);
  } catch (error) {
    state.workflowMessage = "";
    console.error("Workflow upload failed", error);
    return false;
  }
}

window.uploadWorkflowFilesToNode = uploadWorkflowFilesToNode;

async function refreshWorkflowUploadedMediaUrls() {
  const canvasId = String(state.workflowActiveCanvasId || "");
  const workflow = ensureWorkflowState();
  const nodes = (workflow.nodes || []).filter((node) => node?.data?.source === "upload");
  const assetIds = [...new Set(nodes.flatMap((node) => [
    String(node.data?.resultImageAssetId || "").trim(),
    String(node.data?.resultVideoAssetId || "").trim(),
  ]).filter(Boolean))].slice(0, 50);
  if (!assetIds.length) return false;
  let payload = null;
  try {
    payload = await requestJson("/api/user-assets/resolve", {
      method: "POST",
      body: { assetIds },
    });
  } catch (error) {
    console.warn("Workflow uploaded media refresh failed", error);
    return false;
  }
  if (String(state.workflowActiveCanvasId || "") !== canvasId) return false;
  const assets = new Map((Array.isArray(payload?.assets) ? payload.assets : [])
    .map((asset) => [String(asset?.id || ""), asset])
    .filter(([id]) => id));
  let changed = false;
  for (const node of (ensureWorkflowState().nodes || [])) {
    const data = node?.data || {};
    if (data.source !== "upload") continue;
    const imageAssetId = String(data.resultImageAssetId || "").trim();
    const videoAssetId = String(data.resultVideoAssetId || "").trim();
    const imageAsset = imageAssetId ? assets.get(imageAssetId) : null;
    const videoAsset = videoAssetId ? assets.get(videoAssetId) : null;
    if (imageAsset) {
      const url = String(imageAsset.previewUrl || imageAsset.publicUrl || imageAsset.localUrl || "").trim();
      const posterUrl = String(imageAsset.posterUrl || url).trim();
      if (url && (data.resultImageUrl !== url || data.resultImageUrls?.[0] !== url || data.posterUrl !== posterUrl)) {
        node.data = {
          ...data,
          resultImageUrl: url,
          resultImageUrls: [url],
          posterUrl,
        };
        changed = true;
      }
    }
    if (videoAsset) {
      const url = String(videoAsset.previewUrl || videoAsset.publicUrl || videoAsset.localUrl || "").trim();
      const posterUrl = String(videoAsset.posterUrl || videoAsset.previewUrl || videoAsset.publicUrl || "").trim();
      if (url && (data.resultVideoUrl !== url || data.resultVideoUrls?.[0] !== url || data.posterUrl !== posterUrl)) {
        node.data = {
          ...data,
          resultVideoUrl: url,
          resultVideoUrls: [url],
          posterUrl,
        };
        changed = true;
      }
    }
  }
  if (changed) persistWorkflowState({ skipServer: true });
  return changed;
}

window.refreshWorkflowUploadedMediaUrls = refreshWorkflowUploadedMediaUrls;

async function migrateWorkflowEmbeddedMedia() {
  const workflow = ensureWorkflowState();
  let changed = false;
  for (const node of workflow.nodes) {
    const data = node.data || {};
    for (const field of ["imageUrl", "videoUrl", "audioUrl", "startImage"]) {
      const value = String(data[field] || "");
      if (!/^data:(?:image|video|audio)\//i.test(value)) continue;
      state.workflowCanvasMessage = "Migrating media...";
      updateWorkflowCanvasSaveStatus();
      const uploaded = await uploadWorkflowMediaDataUrl(value, {
        name: node.title || "Workflow media",
        fileName: `${node.id || "workflow"}-${field}`,
      });
      data[field] = uploaded.url;
      data[`${field}AssetId`] = uploaded.assetId;
      changed = true;
    }
    for (const field of ["referenceImages", "referenceVideos", "referenceAudios"]) {
      if (!Array.isArray(data[field])) continue;
      const values = [];
      const assetIds = [];
      for (let index = 0; index < data[field].length; index += 1) {
        const value = String(data[field][index] || "");
        if (!/^data:(?:image|video|audio)\//i.test(value)) {
          values.push(value);
          continue;
        }
        state.workflowCanvasMessage = "Migrating media...";
        updateWorkflowCanvasSaveStatus();
        const uploaded = await uploadWorkflowMediaDataUrl(value, {
          name: node.title || "Workflow media",
          fileName: `${node.id || "workflow"}-${field}-${index + 1}`,
        });
        values.push(uploaded.url);
        assetIds.push(uploaded.assetId);
        changed = true;
      }
      data[field] = values;
      if (assetIds.length) data[`${field}AssetIds`] = assetIds;
    }
    node.data = data;
  }
  if (changed) persistWorkflowState({ skipServer: true });
  return changed;
}

async function handleWorkflowFileInput(input) {
  const nodeId = input.dataset.nodeId || "";
  const field = input.dataset.workflowFile || "referenceImages";
  const files = Array.from(input.files || []);
  if (!files.length) return;
  const node = workflowNodeById(nodeId);
  if (!node) return;
  state.workflowMessage = "Uploading media...";
  window.WorkflowReactCanvas?.sync?.();
  const canvasId = String(state.workflowActiveCanvasId || "");
  for (const file of files) {
    const uploaded = await uploadWorkflowFile(file, node.id);
    if (String(state.workflowActiveCanvasId || "") !== canvasId) return;
    const current = workflowNodeById(node.id);
    if (!current) return;
    const singleValueField = ["imageUrl", "videoUrl", "audioUrl"].includes(field);
    current.data = {
      ...(current.data || {}),
      [field]: singleValueField ? uploaded.url : [...workflowNodeReferences(current, field), uploaded.url],
      ...(singleValueField
        ? { [`${field}AssetId`]: uploaded.assetId || "" }
        : { [`${field}AssetIds`]: [
            ...(Array.isArray(current.data?.[`${field}AssetIds`]) ? current.data[`${field}AssetIds`] : []),
            uploaded.assetId,
          ].filter(Boolean) }),
    };
    persistWorkflowState();
    window.WorkflowReactCanvas?.sync?.();
  }
  state.workflowMessage = "";
}

