(function () {
  "use strict";

  var api = window.ReactFlow || {};
  var React = window.React;
  var ReactDOM = window.ReactDOM;
  var mounted = null;
  var savedViewport = null;
  var ReactFlow = api.ReactFlow;
  var ReactFlowProvider = api.ReactFlowProvider;
  var Handle = api.Handle;
  var Position = api.Position;
  var Background = api.Background;
  var Controls = api.Controls;
  var MiniMap = api.MiniMap;
  var applyNodeChanges = api.applyNodeChanges;
  var applyEdgeChanges = api.applyEdgeChanges;
  var useReactFlow = api.useReactFlow;
  var h = React && React.createElement;
  var edgeId = function (source, target) { return String(source) + "->" + String(target); };
  window.reactFlowApi = api;

  function normalizePosition(value) {
    return {
      x: Math.max(0, Math.round(Number(value && value.x || 0))),
      y: Math.max(0, Math.round(Number(value && value.y || 0))),
    };
  }

  function nodeWidth(node) {
    if (["imageReference", "image", "upload", "videoReference"].includes(node.type)) return 300;
    if (["prompt", "output"].includes(node.type)) return 360;
    return 520;
  }

  function nodeFamily(node) {
    if (["imageReference", "image", "upload"].includes(node.type)) return "image-reference";
    if (node.type === "videoReference") return "video-reference";
    if (node.type === "prompt") return "prompt";
    if (node.type === "output") return "output";
    if (["imageDisplay", "imageGenerate"].includes(node.type)) return "image-generation";
    if (["unifiedVideoGen", "video"].includes(node.type)) return "video-generation";
    return "unknown";
  }

  function nodeData(node) {
    var source = node && node.data || {};
    return Object.assign({}, source, {
      sourceNode: node,
      inputUsed: typeof window.workflowIncomingEdges === "function" && window.workflowIncomingEdges(node.id).length > 0,
    });
  }

  function workflowNodeReference(nodeId) {
    var workflow = workflowSnapshot();
    return (workflow.nodes || []).find(function (node) { return String(node.id || "") === String(nodeId || ""); }) || null;
  }

  function mapNodes(options) {
    return ((options && options.nodes) || []).map(function (node) {
      return {
        id: node.id,
        type: "workflowNode",
        position: normalizePosition(node),
        data: nodeData(node),
        style: { width: nodeWidth(node) + "px" },
        draggable: true,
        selected: node.id === window.__workflowReactSelectedNodeId,
      };
    });
  }

  function runtimeNode(node) {
    return mapNodes({ nodes: [node] })[0];
  }

  function mapEdges(options) {
    return ((options && options.edges) || []).map(function (edge) {
      return {
        id: edgeId(edge.from, edge.to),
        source: edge.from,
        target: edge.to,
        type: "smoothstep",
      };
    });
  }

  function connectionEndpointId(value) {
    if (value && typeof value === "object") return String(value.id || value.nodeId || "");
    return String(value || "");
  }

  function connectionAllowed(source, target) {
    var sourceId = connectionEndpointId(source);
    var targetId = connectionEndpointId(target);
    if (!sourceId || !targetId || sourceId === targetId) return false;
    return typeof window.workflowCanConnectNodes === "function"
      ? window.workflowCanConnectNodes(sourceId, targetId)
      : false;
  }

  function workflowSnapshot() {
    return typeof window.ensureWorkflowState === "function"
      ? window.ensureWorkflowState()
      : { nodes: [], edges: [] };
  }

  function persistNode(node, patch) {
    if (!node) return;
    node.data = Object.assign({}, node.data || {}, patch || {});
    if (typeof window.persistWorkflowState === "function") window.persistWorkflowState();
  }

  function refreshCanvas() {
    if (mounted && mounted.update) mounted.update();
    if (typeof window.refreshIcons === "function") window.refreshIcons();
  }

  function selectNode(nodeId) {
    window.__workflowReactSelectedNodeId = String(nodeId || "");
    refreshCanvas();
  }

  function syncWorkflowStatus() {
    if (typeof window.syncWorkflowStatusText === "function") {
      window.syncWorkflowStatusText();
      return;
    }
    var element = document.querySelector(".workflow-status");
    if (!element) return;
    var workflow = workflowSnapshot();
    var sourceTypes = { imageReference: true, image: true, upload: true, videoReference: true, prompt: true };
    var generationTypes = { imageDisplay: true, unifiedVideoGen: true, imageGenerate: true, video: true };
    var inputs = (workflow.nodes || []).filter(function (node) { return sourceTypes[node.type]; }).length;
    var generations = (workflow.nodes || []).filter(function (node) { return generationTypes[node.type]; }).length;
    element.textContent = inputs + " inputs / " + generations + " generation nodes";
  }

  function syncCanvasMeta() {
    syncWorkflowStatus();
    if (typeof window.updateWorkflowCanvasSaveStatus === "function") window.updateWorkflowCanvasSaveStatus();
  }

  function workflowEdgeKey(edge) {
    return String(edge && (edge.from || edge.source) || "") + "\n" + String(edge && (edge.to || edge.target) || "");
  }

  function deleteBusinessElements(elements) {
    var nodeIds = new Set(((elements && elements.nodes) || []).map(function (node) { return String(node.id || ""); }).filter(Boolean));
    var edgeKeys = new Set(((elements && elements.edges) || []).map(workflowEdgeKey).filter(function (key) { return !key.startsWith("\n") && !key.endsWith("\n"); }));
    nodeIds.forEach(function (nodeId) {
      if (typeof window.removeWorkflowNode === "function") window.removeWorkflowNode(nodeId);
    });
    if (edgeKeys.size) {
      var workflow = workflowSnapshot();
      var nextEdges = (workflow.edges || []).filter(function (edge) { return !edgeKeys.has(workflowEdgeKey(edge)); });
      if (nextEdges.length !== (workflow.edges || []).length) {
        workflow.edges = nextEdges;
        if (typeof window.persistWorkflowState === "function") window.persistWorkflowState();
      }
    }
    if (mounted && mounted.update) mounted.update();
    syncCanvasMeta();
    return nodeIds.size > 0 || edgeKeys.size > 0;
  }

  function workflowDeleteKeyBlocked(target) {
    return Boolean(target && target.closest && target.closest("input, textarea, select, video, [contenteditable], [contenteditable='true']"));
  }

  function handleWorkflowDeleteKeyDown(event) {
    if (event.defaultPrevented || !["Backspace", "Delete"].includes(event.key) || workflowDeleteKeyBlocked(event.target)) return;
    var host = mounted && mounted.host;
    var targetInsideHost = host && event.target && host.contains(event.target);
    var activeInsideHost = host && document.activeElement && host.contains(document.activeElement);
    if (!targetInsideHost && !activeInsideHost && event.target !== document.body) return;
    var selectedNodes = mounted && typeof mounted.getNodes === "function" ? mounted.getNodes().filter(function (node) { return node.selected; }) : [];
    var selectedEdges = mounted && typeof mounted.getEdges === "function" ? mounted.getEdges().filter(function (edge) { return edge.selected; }) : [];
    if (!selectedNodes.length && !selectedEdges.length) {
      if (typeof window.deleteSelectedWorkflowNodes !== "function") return;
      event.preventDefault();
      event.stopPropagation();
      window.deleteSelectedWorkflowNodes();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (mounted && typeof mounted.deleteElements === "function") {
      mounted.deleteElements({ nodes: selectedNodes, edges: selectedEdges });
    }
  }

  function applyNodeControl(nodeId, datasetKey, value, checked) {
    if (typeof window.updateWorkflowNodeFromControl !== "function") return;
    var control = { dataset: {}, value: value, checked: Boolean(checked) };
    control.dataset[datasetKey] = nodeId;
    if (datasetKey === "workflowToggle") control.dataset.nodeId = nodeId;
    window.updateWorkflowNodeFromControl(control);
  }

  function stopNodeEvent(event) {
    event.stopPropagation();
  }

  function icon(name, className) {
    return h("i", { "data-lucide": name, className: className || "", "aria-hidden": "true" });
  }

  function iconButton(label, iconName, onClick, extraClass) {
    return h("button", {
      type: "button",
      className: "nodrag workflow-react-icon-button " + (extraClass || ""),
      title: label,
      "aria-label": label,
      onClick: function (event) { event.stopPropagation(); onClick(event); },
      onPointerDown: stopNodeEvent,
    }, icon(iconName));
  }

  function Header(node, title, iconName, actions) {
    return h("header", { className: "workflow-react-card-header" },
      h("span", { className: "workflow-react-title-icon" }, icon(iconName)),
      h("strong", null, title || "Node"),
      h("span", { className: "workflow-react-header-actions" }, actions || null)
    );
  }

  function deleteAction(node) {
    return iconButton("Delete node", "trash-2", function () {
      if (typeof window.removeWorkflowNode === "function") window.removeWorkflowNode(node.id);
      refreshCanvas();
    });
  }

  function statusText(node) {
    var record = node.data && node.data.record;
    var transferStatus = record ? String(record.advancedDownloadStatus || "").toLowerCase() : "";
    if (!record || !record.r2DownloadReady) {
      if (transferStatus === "preparing" || transferStatus === "queued" || transferStatus === "processing") return "已完成 · 素材加速中…";
      if (transferStatus === "failed") return "已完成 · 素材加速失败，可重试 download2";
    }
    if (node.data && node.data.error) return String(node.data.error);
    if (node.data && node.data.status) return String(node.data.status);
    return "Ready";
  }

  function Footer(node, left, right) {
    return h("footer", { className: "workflow-react-card-footer" },
      h("span", null, left || statusText(node)),
      h("strong", null, right || "")
    );
  }

  function Preview(node, url, kind) {
    if (!url) {
      return h("div", { className: "workflow-react-empty-result" },
        icon(kind === "image" ? "image" : "play"),
        h("span", null, "生成结果会显示在这里")
      );
    }
    var poster = typeof window.workflowNodePoster === "function" ? window.workflowNodePoster(node) : "";
    var content = kind === "image"
      ? h("img", { src: url, alt: "", loading: "lazy", decoding: "async" })
      : h("video", { src: url, poster: poster || undefined, muted: true, loop: true, playsInline: true, autoPlay: true, preload: "metadata" });
    return h("button", {
      type: "button",
      className: "nodrag workflow-react-result-media",
      onClick: function (event) {
        event.stopPropagation();
        var title = node.title || "Workflow result";
        if (kind === "image" && typeof window.previewImage === "function") window.previewImage({ title: title, imageUrl: url });
        else if (kind === "video" && typeof window.playPreview === "function") window.playPreview({ title: title, previewUrl: url, posterUrl: poster, ratio: node.data && node.data.ratio || "16:9" });
      },
      onPointerDown: stopNodeEvent,
    }, content, h("span", { className: "workflow-react-result-badge" }, "Result"));
  }

  function field(label, control) {
    return h("label", { className: "nodrag workflow-react-field" }, h("span", null, label), control);
  }

  function selectControl(node, datasetKey, value, options, disabled) {
    return h("select", {
      value: String(value == null ? "" : value),
      disabled: Boolean(disabled),
      className: "nodrag nowheel",
      onPointerDown: stopNodeEvent,
      onChange: function (event) { event.stopPropagation(); applyNodeControl(node.id, datasetKey, event.target.value); },
    }, (options || []).map(function (option) {
      var optionValue = option && typeof option === "object" ? (option.value == null ? option.id : option.value) : option;
      var optionLabel = option && typeof option === "object" ? (option.label == null ? optionValue : option.label) : option;
      return h("option", { key: String(optionValue), value: String(optionValue) }, String(optionLabel));
    }));
  }

  function textArea(node, value, placeholder) {
    return h("textarea", {
      rows: 3,
      defaultValue: value || "",
      placeholder: placeholder || "",
      className: "nodrag nowheel",
      onPointerDown: stopNodeEvent,
      onInput: function (event) {
        if (!node.data) node.data = {};
        node.data.prompt = event.target.value || "";
        if (typeof window.persistWorkflowState === "function") window.persistWorkflowState();
        if (typeof window.updateWorkflowCanvasSaveStatus === "function") window.updateWorkflowCanvasSaveStatus();
      },
    });
  }

  function checkbox(node, datasetKey, key, label, checked) {
    return h("label", { className: "nodrag workflow-react-check" },
      h("input", {
        type: "checkbox",
        checked: Boolean(checked),
        onChange: function (event) { event.stopPropagation(); applyNodeControl(node.id, datasetKey, key, event.target.checked); },
        onPointerDown: stopNodeEvent,
      }),
      h("span", null, label)
    );
  }

  function UploadReference(node, kind) {
    var value = node.data && node.data[kind === "video" ? "videoUrl" : "imageUrl"] || "";
    var fileInput = h("input", {
      type: "file",
      accept: kind + "/*",
      onChange: function (event) {
        var files = Array.from(event.target.files || []);
        if (!files.length || typeof window.uploadWorkflowFilesToNode !== "function") return;
        event.stopPropagation();
        event.target.value = "";
        window.uploadWorkflowFilesToNode(files, node.id);
      },
    });
    var media = value
      ? kind === "video"
        ? h("video", { src: value, controls: true, playsInline: true, preload: "metadata", className: "nodrag nowheel", onPointerDown: stopNodeEvent })
        : h("img", { src: value, alt: "", loading: "lazy", decoding: "async" })
      : h("span", { className: "workflow-react-upload-copy" }, icon("upload"), h("strong", null, "Add " + kind), h("small", null, node.data && node.data.error ? node.data.error : "Click or drop a file"));
    return h("article", { className: "workflow-react-card is-reference is-" + kind + " " + (node.id === window.__workflowReactSelectedNodeId ? "is-selected" : ""), "data-workflow-react-node": node.id },
      Header(node, node.title, kind === "video" ? "video" : "image", deleteAction(node)),
      h("label", { className: "nodrag workflow-react-dropzone", onPointerDown: stopNodeEvent }, fileInput, media),
      h("div", { className: "workflow-react-reference-meta" }, h("span", null, value ? "Input ready" : "Waiting for " + kind), h("strong", null, "Reference"))
    );
  }

  function PromptNode(node) {
    var downstream = typeof window.workflowOutgoingEdges === "function" ? window.workflowOutgoingEdges(node.id).length : 0;
    return h("article", { className: "workflow-react-card is-prompt " + (node.id === window.__workflowReactSelectedNodeId ? "is-selected" : ""), "data-workflow-react-node": node.id },
      Header(node, node.title || "Story Prompt", "notebook-pen", deleteAction(node)),
      h("label", { className: "nodrag workflow-react-prompt-field", onPointerDown: stopNodeEvent },
        h("span", null, "Story direction"),
        textArea(node, node.data && node.data.prompt, "Describe the scene, subject, motion, camera, lighting, and continuity.")
      ),
      Footer(node, downstream + " connected generation" + (downstream === 1 ? "" : "s"), "Prompt")
    );
  }

  function resultForNode(node) {
    var image = typeof window.workflowNodeResultImage === "function" ? window.workflowNodeResultImage(node) : "";
    var video = typeof window.workflowNodeResultVideo === "function" ? window.workflowNodeResultVideo(node) : "";
    return video ? { kind: "video", url: video } : image ? { kind: "image", url: image } : null;
  }

  function OutputNode(node) {
    var workflow = workflowSnapshot();
    var byId = new Map((workflow.nodes || []).map(function (item) { return [item.id, item]; }));
    var results = (workflow.edges || []).filter(function (edge) { return edge.to === node.id; })
      .map(function (edge) { return byId.get(edge.from); })
      .filter(Boolean)
      .map(function (source) { return { node: source, result: resultForNode(source) }; })
      .filter(function (item) { return item.result; });
    var first = results[0];
    return h("article", { className: "workflow-react-card is-output " + (node.id === window.__workflowReactSelectedNodeId ? "is-selected" : ""), "data-workflow-react-node": node.id },
      Header(node, node.title || "Final Output", "sparkles", deleteAction(node)),
      first ? Preview(first.node, first.result.url, first.result.kind) : h("div", { className: "workflow-react-empty-result" }, icon("panel-top"), h("span", null, "Run a connected generation node to collect output")),
      h("div", { className: "workflow-react-output-list" },
        results.length ? results.map(function (item) {
          return h("button", {
            type: "button",
            key: item.node.id,
            className: "nodrag",
            onClick: function (event) {
              event.stopPropagation();
              if (item.result.kind === "image" && typeof window.previewImage === "function") window.previewImage({ title: item.node.title, imageUrl: item.result.url });
              else if (typeof window.playPreview === "function") window.playPreview({ title: item.node.title, previewUrl: item.result.url });
            },
            onPointerDown: stopNodeEvent,
          }, item.node.title || "Result");
        }) : h("span", null, "No connected result yet")
      )
    );
  }

  function ImageGenerationNode(node) {
    var model = typeof window.workflowImageModelById === "function" ? window.workflowImageModelById(node.data && node.data.modelId) : {};
    var result = resultForNode(node);
    var runState = typeof window.workflowNodeRunState === "function" ? window.workflowNodeRunState(node) : { disabled: true, label: "Run", reason: "Run unavailable" };
    var selected = node.id === window.__workflowReactSelectedNodeId;
    var ratios = (typeof window.workflowImageModelOptions === "function" ? window.workflowImageModelOptions(model) : ["1:1"]).map(function (value) { return { value: value, label: value }; });
    var resolutions = (typeof window.workflowImageResolutionOptions === "function" ? window.workflowImageResolutionOptions(model) : ["1K", "2K"]).map(function (value) { return { value: value, label: value }; });
    var tiers = (model.tiers || []).map(function (value) { return { value: value, label: value === "standard" ? "Standard" : "Pro" }; });
    var counts = (model.outputCounts || [1]).map(function (value) { return { value: String(value), label: value + (value === 1 ? " image" : " images") }; });
    var runButton = h("button", {
      type: "button",
      className: "nodrag workflow-react-run-button",
      disabled: Boolean(runState.disabled),
      title: runState.reason || "",
      onPointerDown: stopNodeEvent,
      onClick: function (event) { event.stopPropagation(); if (typeof window.runWorkflowSingleNode === "function") window.runWorkflowSingleNode(node.id); },
    }, icon(runState.icon || "play"), runState.label === "Run" ? "生成" : runState.label);
    return h("article", { className: "workflow-react-card is-generation is-image-generation " + (selected ? "is-selected" : ""), "data-workflow-react-node": node.id },
      Header(node, node.title || model.label || "Image generation", "image", h(React.Fragment, null, runButton, deleteAction(node))),
      h("div", { className: "workflow-react-model-line" }, h("span", null, model.label || "Image model"), h("strong", null, (typeof window.workflowCostLabel === "function" ? window.workflowCostLabel(node) : "0") + " 积分")),
      h("div", { className: "workflow-react-result" }, result ? Preview(node, result.url, result.kind) : h("div", { className: "workflow-react-empty-result" }, icon("image"), h("span", null, "生成结果会显示在这里"))),
      selected ? h("div", { className: "workflow-react-editor" },
        h("label", { className: "nodrag workflow-react-prompt-field", onPointerDown: stopNodeEvent }, h("span", null, "提示词"), textArea(node, node.data && node.data.prompt, "描述你想生成的图片...")),
        h("div", { className: "workflow-react-fields" },
          field("模型", selectControl(node, "workflowImageModel", node.data && node.data.modelId || model.id, window.WORKFLOW_IMAGE_MODEL_LIBRARY || [])),
          field("比例", selectControl(node, "workflowRatio", node.data && node.data.ratio || model.ratio, ratios)),
          field("分辨率", selectControl(node, "workflowResolution", node.data && node.data.resolution || model.resolution, resolutions)),
          tiers.length > 1 ? field("档位", selectControl(node, "workflowImageTier", node.data && (node.data.qwenTier || node.data.seedreamTier) || model.defaultTier, tiers)) : null,
          counts.length > 1 ? field("数量", selectControl(node, "workflowOutputCount", node.data && node.data.outputImageCount || 1, counts)) : null
        ),
        model.id === "qwen-image3" ? h("div", { className: "workflow-react-inline-checks" },
          checkbox(node, "workflowToggle", "promptExtend", "扩展提示词", node.data && node.data.promptExtend !== false),
          checkbox(node, "workflowToggle", "watermark", "水印", node.data && node.data.watermark === true)
        ) : null,
        h("div", { className: "workflow-react-editor-actions" }, h("span", null, statusText(node)), h("strong", null, (typeof window.workflowCostLabel === "function" ? window.workflowCostLabel(node) : "0") + " 积分"))
      ) : Footer(node, statusText(node), (typeof window.workflowCostLabel === "function" ? window.workflowCostLabel(node) : "0") + " 积分")
    );
  }

  function VideoGenerationNode(node) {
    var model = typeof window.workflowVideoModelById === "function" ? window.workflowVideoModelById(node.data && node.data.modelId) : {};
    var result = resultForNode(node);
    var runState = typeof window.workflowNodeRunState === "function" ? window.workflowNodeRunState(node) : { disabled: true, label: "Run", reason: "Run unavailable" };
    var selected = node.id === window.__workflowReactSelectedNodeId;
    var ratios = (typeof window.workflowVideoRatioOptions === "function" ? window.workflowVideoRatioOptions(model) : ["16:9"]).map(function (value) { return { value: value, label: value === "adaptive" ? "自适应" : value }; });
    var resolutions = (typeof window.workflowVideoResolutionOptions === "function" ? window.workflowVideoResolutionOptions(model) : ["720p"]).map(function (value) { return { value: value, label: value === "4k" ? "4K" : value }; });
    var durations = (typeof window.workflowVideoDurationOptions === "function" ? window.workflowVideoDurationOptions(model, node.data && node.data.resolution || model.resolution) : [5]).map(function (value) { return { value: String(value), label: Number(value) === -1 ? "自动" : value + "s" }; });
    var modes = typeof window.workflowVideoModeOptions === "function" ? window.workflowVideoModeOptions(model) : [];
    var selectedMode = typeof window.workflowVideoMode === "function" ? window.workflowVideoMode(node, model) : (modes[0] && modes[0].value || "");
    var runButton = h("button", {
      type: "button",
      className: "nodrag workflow-react-run-button",
      disabled: Boolean(runState.disabled),
      title: runState.reason || "",
      onPointerDown: stopNodeEvent,
      onClick: function (event) { event.stopPropagation(); if (typeof window.runWorkflowSingleNode === "function") window.runWorkflowSingleNode(node.id); },
    }, icon(runState.icon || "play"), runState.label === "Run" ? "生成" : runState.label);
    return h("article", { className: "workflow-react-card is-generation is-video-generation " + (selected ? "is-selected" : ""), "data-workflow-react-node": node.id },
      Header(node, node.title || model.label || "Video generation", "video", h(React.Fragment, null, runButton, deleteAction(node))),
      h("div", { className: "workflow-react-model-line" }, h("span", null, model.label || "Video model"), h("strong", null, (typeof window.workflowCostLabel === "function" ? window.workflowCostLabel(node) : "0") + " 积分")),
      h("div", { className: "workflow-react-result" }, result ? Preview(node, result.url, result.kind) : h("div", { className: "workflow-react-empty-result" }, icon("play"), h("span", null, "生成结果会显示在这里"))),
      selected ? h("div", { className: "workflow-react-editor" },
        h("label", { className: "nodrag workflow-react-prompt-field", onPointerDown: stopNodeEvent }, h("span", null, "提示词"), textArea(node, node.data && node.data.prompt, "描述你想生成的视频..."),
          typeof window.isWanPromptOptimizerProvider === "function" && window.isWanPromptOptimizerProvider(model.id)
            ? h("button", {
              type: "button",
              className: "prompt-optimizer-trigger workflow-prompt-optimizer-trigger",
              onPointerDown: stopNodeEvent,
              onClick: function (event) {
                event.preventDefault();
                event.stopPropagation();
                var prompt = String((node.data && node.data.prompt) || "");
                window.openPromptOptimizer?.({
                  prompt: prompt,
                  provider: model.id,
                  providerLabel: model.label || model.id,
                  duration: Number(node.data && node.data.duration || model.duration || 0) || undefined,
                  resolution: String(node.data && node.data.resolution || model.resolution || ""),
                  mode: String(node.data && node.data.mode || model.mode || ""),
                  onApply: function (value) {
                    if (!node.data) node.data = {};
                    node.data.prompt = value;
                    if (typeof window.persistWorkflowState === "function") window.persistWorkflowState();
                    if (typeof window.updateWorkflowCanvasSaveStatus === "function") window.updateWorkflowCanvasSaveStatus();
                    window.WorkflowReactCanvas?.sync?.();
                  },
                });
              },
            }, icon("sparkles"), "AI 优化")
            : null
        ),
        h("div", { className: "workflow-react-fields" },
          field("模型", selectControl(node, "workflowVideoModel", node.data && node.data.modelId || model.id, window.WORKFLOW_VIDEO_MODEL_LIBRARY || [])),
          field("比例", selectControl(node, "workflowRatio", node.data && node.data.ratio || model.ratio, ratios)),
          field("分辨率", selectControl(node, "workflowResolution", node.data && node.data.resolution || model.resolution, resolutions)),
          field("时长", selectControl(node, "workflowDuration", node.data && node.data.duration || model.duration, durations)),
          modes.length ? field("模式", selectControl(node, "workflowMode", selectedMode, modes)) : null
        ),
        h("div", { className: "workflow-react-inline-checks" }, checkbox(node, "workflowToggle", "addSound", "生成音频", node.data && node.data.addSound !== false)),
        h("div", { className: "workflow-react-editor-actions" }, h("span", null, statusText(node)), h("strong", null, (typeof window.workflowCostLabel === "function" ? window.workflowCostLabel(node) : "0") + " 积分"))
      ) : Footer(node, statusText(node), (typeof window.workflowCostLabel === "function" ? window.workflowCostLabel(node) : "0") + " 积分")
    );
  }

  function WorkflowNode(props) {
    var nodeId = String(props.id || "");
    var node = props.data && props.data.sourceNode || workflowNodeReference(nodeId);
    if (!node || !node.type) return h("div", { className: "workflow-react-node-shell", "data-workflow-react-node": nodeId });
    var acceptsInput = typeof window.workflowNodeAcceptsInput === "function" && window.workflowNodeAcceptsInput(node);
    var acceptsOutput = typeof window.workflowNodeAcceptsOutput === "function" && window.workflowNodeAcceptsOutput(node);
    var inputUsed = Boolean(props.data && props.data.inputUsed);
    var body = null;
    if (["imageReference", "image", "upload"].includes(node.type)) body = UploadReference(node, "image");
    else if (node.type === "videoReference") body = UploadReference(node, "video");
    else if (node.type === "prompt") body = PromptNode(node);
    else if (node.type === "output") body = OutputNode(node);
    else if (["imageDisplay", "imageGenerate"].includes(node.type)) body = ImageGenerationNode(node);
    else if (["unifiedVideoGen", "video"].includes(node.type)) body = VideoGenerationNode(node);

    var inputHandle = acceptsInput ? h(Handle, {
      type: "target",
      position: Position.Left,
      id: "in",
      className: "workflow-react-handle workflow-react-handle-in",
      isValidConnection: function (connection) { return connectionAllowed(connection.source, connection.target || node.id); },
      onClick: function (event) {
        event.stopPropagation();
        if (inputUsed) return;
        if (typeof window.createWorkflowInputNodeAndConnect === "function") window.createWorkflowInputNodeAndConnect(node.id);
      },
    }) : null;
    var outputHandle = acceptsOutput ? h(Handle, {
      type: "source",
      position: Position.Right,
      id: "out",
      className: "workflow-react-handle workflow-react-handle-out",
      isValidConnection: function (connection) { return connectionAllowed(connection.source || node.id, connection.target); },
    }) : null;
    return h("div", { className: "workflow-react-node-shell", "data-workflow-react-node": node.id },
      body,
      inputHandle || outputHandle ? h("div", {
        className: "workflow-react-connector-layer",
        "aria-hidden": "true",
      }, inputHandle, outputHandle) : null
    );
  }

  var nodeTypes = { workflowNode: WorkflowNode };

  function CanvasInner() {
    var flow = useReactFlow();
    var nodesState = React.useState(function () { return mapNodes(buildOptions()); });
    var nodes = nodesState[0];
    var setNodes = nodesState[1];
    var edgesState = React.useState(function () { return mapEdges(buildOptions()); });
    var edges = edgesState[0];
    var setEdges = edgesState[1];
    var firstRender = React.useRef(true);

    React.useEffect(function () {
      var update = function () {
        var next = buildOptions();
        setNodes(mapNodes(next));
        setEdges(mapEdges(next));
        syncCanvasMeta();
      };
      if (mounted) {
        mounted.update = update;
        mounted.setNodes = setNodes;
        mounted.setEdges = setEdges;
        mounted.screenToFlowPosition = flow.screenToFlowPosition;
        mounted.fitView = flow.fitView;
        mounted.getViewport = flow.getViewport;
        mounted.setViewport = flow.setViewport;
        mounted.deleteElements = deleteBusinessElements;
        mounted.getNodes = function () { return nodes; };
        mounted.getEdges = function () { return edges; };
      }
      window.__workflowReactApi = mounted;
      window.dispatchEvent(new CustomEvent("workflow-react-ready"));
    }, [flow.screenToFlowPosition, flow.fitView, flow.getViewport, flow.setViewport, nodes, edges, setNodes, setEdges]);

    React.useEffect(function () {
      if (typeof window.refreshIcons === "function") window.refreshIcons();
    }, [nodes, edges]);

    React.useEffect(function () {
      if (!firstRender.current) return;
      firstRender.current = false;
      if (!savedViewport && nodes.length && mounted && mounted.fitView) {
        window.setTimeout(function () { mounted.fitView({ padding: 0.2, maxZoom: 1, minZoom: 0.1, duration: 180 }); }, 30);
      }
    }, [nodes.length]);

    function onNodesChange(changes) {
      setNodes(function (current) { return applyNodeChanges(changes, current); });
    }
    function onEdgesChange(changes) {
      setEdges(function (current) { return applyEdgeChanges(changes, current); });
    }
    function onNodeClick(event, node) {
      if (!node || !node.id) return;
      if (mounted && mounted.host && mounted.host.focus) mounted.host.focus({ preventScroll: true });
      window.__workflowReactSelectedNodeId = node.id;
      if (typeof window.selectWorkflowNode === "function") window.selectWorkflowNode(node.id, { render: false });
      refreshCanvas();
      syncCanvasMeta();
    }
    function onNodeDragStop(event, node) {
      var sourceNode = typeof window.workflowNodeById === "function" ? window.workflowNodeById(node.id) : null;
      if (!sourceNode) return;
      var position = normalizePosition(node.position);
      sourceNode.x = position.x;
      sourceNode.y = position.y;
      window.__workflowReactSelectedNodeId = node.id;
      if (typeof window.persistWorkflowState === "function") window.persistWorkflowState();
      syncCanvasMeta();
    }
    function onConnect(connection) {
      var sourceId = connectionEndpointId(connection.source);
      var targetId = connectionEndpointId(connection.target);
      if (!connectionAllowed(sourceId, targetId)) return;
      var connected = typeof window.connectWorkflowNodes === "function"
        ? window.connectWorkflowNodes(sourceId, targetId)
        : false;
      if (connected && mounted && mounted.update) mounted.update();
    }
    function onEdgesDelete(deleted) {
      var removed = new Set((deleted || []).map(function (edge) {
        return connectionEndpointId(edge.source) + "\n" + connectionEndpointId(edge.target);
      }));
      var workflow = workflowSnapshot();
      var nextEdges = (workflow.edges || []).filter(function (edge) {
        return !removed.has(String(edge.from || "") + "\n" + String(edge.to || ""));
      });
      if (nextEdges.length !== (workflow.edges || []).length) {
        workflow.edges = nextEdges;
        if (typeof window.persistWorkflowState === "function") window.persistWorkflowState();
        if (typeof window.updateWorkflowCanvasSaveStatus === "function") window.updateWorkflowCanvasSaveStatus();
      }
      setEdges(mapEdges(workflow));
    }
    function onDrop(event) {
      event.preventDefault();
      var action = event.dataTransfer && (event.dataTransfer.getData("application/reactflow")
        || event.dataTransfer.getData("application/x-workflow-node"));
      if (!action) return;
      var position = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
      var node = typeof window.createWorkflowNode === "function"
        ? window.createWorkflowNode(action, normalizePosition(position))
        : null;
      if (!node) return;
      if (typeof window.persistWorkflowState === "function") window.persistWorkflowState();
      if (mounted && mounted.update) mounted.update();
    }
    function onDragOver(event) {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    }
    function onDoubleClick(event) {
      if (event.target.closest(".workflow-react-node-shell")) return;
      var position = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
      var node = typeof window.createWorkflowNode === "function"
        ? window.createWorkflowNode("add-prompt", normalizePosition(position))
        : null;
      if (!node) return;
      if (typeof window.persistWorkflowState === "function") window.persistWorkflowState();
      if (mounted && mounted.update) mounted.update();
    }
    function onMoveEnd(event, viewport) {
      savedViewport = { x: viewport.x, y: viewport.y, zoom: viewport.zoom };
    }

    return h(ReactFlow, {
      nodes: nodes,
      edges: edges,
      nodeTypes: nodeTypes,
      onNodesChange: onNodesChange,
      onEdgesChange: onEdgesChange,
      onNodeClick: onNodeClick,
      onNodeDragStop: onNodeDragStop,
      onConnect: onConnect,
      onEdgesDelete: onEdgesDelete,
      onDrop: onDrop,
      onDragOver: onDragOver,
      onDoubleClick: onDoubleClick,
      onMoveEnd: onMoveEnd,
      isValidConnection: function (connection) { return connectionAllowed(connection.source, connection.target); },
      deleteKeyCode: null,
      panOnScroll: false,
      zoomOnScroll: true,
      zoomOnPinch: true,
      panOnDrag: true,
      selectionOnDrag: false,
      elevateNodesOnSelect: false,
      fitView: false,
      minZoom: 0.1,
      maxZoom: 2,
      zoomOnDoubleClick: false,
      defaultViewport: savedViewport || { x: 0, y: 0, zoom: 1 },
      className: "workflow-react-flow",
      proOptions: { hideAttribution: true },
    }, h(Background, { color: "rgba(255,255,255,.07)", gap: 28 }),
      h(Controls, { position: "bottom-right" }),
      h(MiniMap, {
        position: "bottom-left",
        pannable: true,
        zoomable: true,
        nodeColor: function (node) {
          var type = node && node.data && node.data.sourceNode && node.data.sourceNode.type;
          return type === "prompt" ? "#ffd166" : type === "output" ? "#8b5cf6" : "#ff47ad";
        },
        maskColor: "rgba(2,2,5,.76)",
      }));
  }

  function buildOptions() {
    var workflow = typeof window.ensureWorkflowState === "function" ? window.ensureWorkflowState() : { nodes: [], edges: [] };
    var seen = new Set();
    var nodes = (workflow.nodes || []).map(function (node) {
      return { id: node.id, x: Number(node.x || 0), y: Number(node.y || 0), data: nodeData(node) };
    });
    var edges = (workflow.edges || []).filter(function (edge) {
      var id = edgeId(edge.from, edge.to);
      if (seen.has(id)) return false;
      seen.add(id);
      return Boolean(edge.from && edge.to);
    });
    return { nodes: nodes, edges: edges };
  }

  function mount(host) {
    if (!host || !React || !ReactDOM || !api.ReactFlow) return null;
    var options = buildOptions();
    if (mounted && mounted.host === host && host.isConnected && mounted.update) {
      mounted.options = options;
      mounted.update();
      return mounted;
    }
    host.innerHTML = "";
    host.tabIndex = -1;
    if (!host.dataset.workflowDeleteFallback) {
      host.dataset.workflowDeleteFallback = "true";
      host.addEventListener("keydown", handleWorkflowDeleteKeyDown);
    }
    window.__workflowReactOptions = options;
    var root = ReactDOM.render
      ? { render: function (element) { ReactDOM.render(element, host); } }
      : { render: function () { throw new Error("ReactDOM.render unavailable"); } };
    mounted = { host: host, root: root, options: options };
    root.render(h(ReactFlowProvider, null, h(CanvasInner)));
    if (typeof window.__workflowReactSelectedNodeId !== "string") window.__workflowReactSelectedNodeId = "";
    return mounted;
  }

  function refresh() {
    if (!mounted || !mounted.host || !mounted.host.isConnected) return false;
    if (mounted.update) mounted.update();
    return true;
  }

  function syncExisting() {
    if (!mounted || !mounted.host || !mounted.host.isConnected) return false;
    if (!document.querySelector(".workflow-react-host")) return false;
    if (mounted.update) mounted.update();
    if (typeof window.refreshIcons === "function") window.refreshIcons();
    return true;
  }

  function captureViewport() {
    if (!mounted || typeof mounted.getViewport !== "function") return savedViewport;
    try {
      savedViewport = mounted.getViewport();
    } catch (_) {}
    return savedViewport;
  }

  function restoreViewport(viewport) {
    if (!viewport || !mounted) return false;
    savedViewport = { x: Number(viewport.x || 0), y: Number(viewport.y || 0), zoom: Number(viewport.zoom || 1) };
    if (typeof mounted.setViewport === "function") {
      mounted.setViewport(savedViewport, { duration: 0 });
      return true;
    }
    return false;
  }

  function screenToFlowPosition(point) {
    if (mounted && mounted.screenToFlowPosition) return mounted.screenToFlowPosition(point);
    return { x: Number(point && point.x || 0), y: Number(point && point.y || 0) };
  }

  function remountPendingHost() {
    if (mounted && mounted.host && mounted.host.isConnected && mounted.update) return false;
    var host = document.querySelector(".workflow-react-host");
    if (!host || !host.isConnected) return false;
    return Boolean(mount(host));
  }

  window.WorkflowReactCanvas = {
    mount: mount,
    refresh: refresh,
    sync: refresh,
    syncExisting: syncExisting,
    remountPendingHost: remountPendingHost,
    selectNode: selectNode,
    captureViewport: captureViewport,
    restoreViewport: restoreViewport,
    screenToFlowPosition: screenToFlowPosition,
    buildOptions: buildOptions,
  };
  if (!document.__workflowDeleteFallback) {
    document.__workflowDeleteFallback = true;
    document.addEventListener("keydown", handleWorkflowDeleteKeyDown, true);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", remountPendingHost, { once: true });
  } else {
    window.setTimeout(remountPendingHost, 0);
  }
  window.workflowReactCreateNode = function (action, position) {
    return typeof window.createWorkflowNode === "function" ? window.createWorkflowNode(action, normalizePosition(position)) : null;
  };
  window.workflowReactCanConnect = connectionAllowed;
  window.createWorkflowNodeFromReact = function (action, position) {
    var node = typeof window.createWorkflowNode === "function" ? window.createWorkflowNode(action, normalizePosition(position)) : null;
    return node ? runtimeNode(node) : null;
  };
})();
