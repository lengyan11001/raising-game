(function () {
  "use strict";

  var api = window.ReactFlow || {};
  var React = window.React;
  var ReactDOM = window.ReactDOM;
  var mounted = null;
  var ReactFlow = api.ReactFlow;
  var ReactFlowProvider = api.ReactFlowProvider;
  var Handle = api.Handle;
  var Position = api.Position;
  var Background = api.Background;
  var Controls = api.Controls;
  var MiniMap = api.MiniMap;
  var applyNodeChanges = api.applyNodeChanges;
  var applyEdgeChanges = api.applyEdgeChanges;
  var addEdge = api.addEdge;
  var useReactFlow = api.useReactFlow;
  var edgeId = function (source, target) { return String(source) + "->" + String(target); };
  window.reactFlowApi = api;
  var normalizePosition = function (value) {
    return {
      x: Math.max(0, Math.round(Number(value && value.x || 0))),
      y: Math.max(0, Math.round(Number(value && value.y || 0))),
    };
  };
  function mapNodes(options) {
    return ((options && options.nodes) || []).map(function (node) {
      return {
        id: node.id,
        type: "workflowNode",
        position: normalizePosition(node),
        data: node.data,
        draggable: true,
        selected: node.id === window.__workflowReactSelectedNodeId,
      };
    });
  }
  function runtimeNode(node) {
    return {
      id: node.id,
      type: "workflowNode",
      position: normalizePosition(node),
      data: {
        html: typeof window.renderWorkflowNode === "function" ? window.renderWorkflowNode(node) : "",
        sourceNode: node,
        inputUsed: typeof window.workflowIncomingEdges === "function" && window.workflowIncomingEdges(node.id).length > 0,
      },
      draggable: true,
      selected: node.id === window.__workflowReactSelectedNodeId,
    };
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

  function syncEdgeState(nextEdges) {
    if (typeof window.ensureWorkflowState !== "function") return;
    var workflow = window.ensureWorkflowState();
    workflow.edges = (nextEdges || []).map(function (edge) {
      return { from: edge.source || "", to: edge.target || "" };
    }).filter(function (edge) { return edge.from && edge.to; });
    if (typeof window.persistWorkflowState === "function") window.persistWorkflowState();
    syncCanvasMeta();
  }

  function deleteBusinessElements(elements) {
    var nodeIds = new Set(((elements && elements.nodes) || []).map(function (node) { return String(node.id || ""); }).filter(Boolean));
    var edgeIds = new Set(((elements && elements.edges) || []).map(function (edge) { return String(edge.id || ""); }).filter(Boolean));
    var workflow = workflowSnapshot();
    if (edgeIds.size) {
      workflow.edges = (workflow.edges || []).filter(function (edge) {
        return !edgeIds.has(edgeId(edge.from, edge.to));
      });
      if (typeof window.persistWorkflowState === "function") window.persistWorkflowState();
    }
    nodeIds.forEach(function (nodeId) {
      if (typeof window.removeWorkflowNode === "function") window.removeWorkflowNode(nodeId);
    });
    if (mounted && mounted.update) mounted.update();
    syncCanvasMeta();
    return true;
  }

  function workflowDeleteKeyBlocked(target) {
    return Boolean(target && target.closest && target.closest("input, textarea, select, [contenteditable], [contenteditable='true']"));
  }

  function handleWorkflowDeleteKeyDown(event) {
    if (event.defaultPrevented || !["Backspace", "Delete"].includes(event.key) || workflowDeleteKeyBlocked(event.target)) return;
    var host = mounted && mounted.host;
    var targetInsideHost = host && event.target && host.contains(event.target);
    var activeInsideHost = host && document.activeElement && host.contains(document.activeElement);
    if (!targetInsideHost && !activeInsideHost && event.target !== document.body) return;
    if (typeof window.deleteSelectedWorkflowNodes !== "function") return;
    event.preventDefault();
    event.stopPropagation();
    window.deleteSelectedWorkflowNodes();
  }

  function WorkflowNode(props) {
    // @xyflow/react v12 passes node data as flat props; React Flow v11 used props.node.
    var node = props.node || props;
    var data = node.data || {};
    var html = typeof data.html === "string" ? data.html : "";
    var acceptsInput = typeof window.workflowNodeAcceptsInput === "function" && window.workflowNodeAcceptsInput(data.sourceNode || {});
    var acceptsOutput = typeof window.workflowNodeAcceptsOutput === "function" && window.workflowNodeAcceptsOutput(data.sourceNode || {});
    var inputUsed = Boolean(data.inputUsed);
    var children = [];

    if (acceptsInput) {
      children.push(React.createElement(Handle, {
        key: "target-handle",
        type: "target",
        position: Position.Left,
        id: "in",
        className: "workflow-react-handle workflow-react-handle-in",
        isValidConnection: function (connection) {
          return connectionAllowed(connection.source, connection.target || props.id);
        },
        onClick: function (event) {
          event.stopPropagation();
          if (inputUsed) return;
          if (typeof window.createWorkflowInputNodeAndConnect === "function") {
            window.createWorkflowInputNodeAndConnect(props.id);
          }
        },
      }));
      children.push(React.createElement("span", {
        key: "target-label",
        className: "workflow-react-handle-label workflow-react-handle-label-in",
        "aria-hidden": "true",
      }, ""));
    }
    children.push(React.createElement("div", {
      key: "content",
      className: "workflow-react-node-content",
      dangerouslySetInnerHTML: { __html: html },
    }));
    if (acceptsOutput) {
      children.push(React.createElement(Handle, {
        key: "source-handle",
        type: "source",
        position: Position.Right,
        id: "out",
        className: "workflow-react-handle workflow-react-handle-out",
        isValidConnection: function (connection) {
          return connectionAllowed(connection.source || props.id, connection.target);
        },
      }));
      children.push(React.createElement("span", {
        key: "source-label",
        className: "workflow-react-handle-label workflow-react-handle-label-out",
        "aria-hidden": "true",
      }, ""));
    }
    return React.createElement("div", {
      className: "workflow-react-node-shell",
      "data-workflow-react-node": props.id,
    }, children);
  }

  var nodeTypes = { workflowNode: WorkflowNode };

  function CanvasInner(props) {
    var flow = useReactFlow();
    var nodesState = React.useState(function () { return mapNodes(buildOptions()); });
    var nodes = nodesState[0];
    var setNodes = nodesState[1];
    var edgesState = React.useState(function () { return mapEdges(buildOptions()); });
    var edges = edgesState[0];
    var setEdges = edgesState[1];

    React.useEffect(function () {
      // The adapter is the only bridge from our workflow business state into
      // the reference canvas. Every update rebuilds both collections from the
      // workflow snapshot, so a palette action/delete can never leave stale
      // React Flow nodes behind.
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
        mounted.deleteElements = deleteBusinessElements;
        mounted.getNodes = function () { return nodes; };
        mounted.getEdges = function () { return edges; };
        mounted.deleteBusinessElements = deleteBusinessElements;
      }
      window.__workflowReactApi = mounted;
      window.dispatchEvent(new CustomEvent("workflow-react-ready"));
    }, [flow.screenToFlowPosition, flow.fitView, flow.deleteElements, nodes, edges, setNodes, setEdges]);
    function onNodesChange(changes) {
      setNodes(function (current) {
        return applyNodeChanges(changes, current);
      });
    }
    function onEdgesChange(changes) {
      setEdges(function (current) {
        return applyEdgeChanges(changes, current);
      });
    }
    function onNodeClick(event, node) {
      if (!node || !node.id) return;
      if (mounted && mounted.host && mounted.host.focus) mounted.host.focus({ preventScroll: true });
      window.__workflowReactSelectedNodeId = node.id;
      if (typeof window.selectWorkflowNode === "function") {
        window.selectWorkflowNode(node.id, { render: false });
      }
      if (mounted && mounted.update) mounted.update();
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
      if (typeof window.updateWorkflowCanvasSaveStatus === "function") window.updateWorkflowCanvasSaveStatus();
      syncCanvasMeta();
    }
    function onConnect(connection) {
      if (!connectionAllowed(connection.source, connection.target)) return;
      var sourceId = connectionEndpointId(connection.source);
      var targetId = connectionEndpointId(connection.target);
      var next = addEdge({
        id: edgeId(sourceId, targetId),
        source: sourceId,
        target: targetId,
        type: "smoothstep",
      }, edges);
      setEdges(next);
      syncEdgeState(next);
    }
    function onEdgesDelete(deleted) {
      var ids = new Set((deleted || []).map(function (edge) { return edge.id; }));
      setEdges(function (current) {
        var next = current.filter(function (edge) { return !ids.has(edge.id); });
        syncEdgeState(next);
        return next;
      });
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
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
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
    function onNodesDelete(deleted) {
      // Native deletion stays disabled below. This is a safety bridge for any
      // programmatic React Flow deletion and always defers to our business
      // graph, which owns edge bridging and persistence.
      deleteBusinessElements({ nodes: deleted || [] });
    }

    return React.createElement(ReactFlow, {
      nodes: nodes,
      edges: edges,
      nodeTypes: nodeTypes,
      onNodesChange: onNodesChange,
      onEdgesChange: onEdgesChange,
      onNodeClick: onNodeClick,
      onNodeDragStop: onNodeDragStop,
      onConnect: onConnect,
      onEdgesDelete: onEdgesDelete,
      onNodesDelete: onNodesDelete,
      onDrop: onDrop,
      onDragOver: onDragOver,
      onDoubleClick: onDoubleClick,
      isValidConnection: function (connection) { return connectionAllowed(connection.source, connection.target); },
      deleteKeyCode: null,
      panOnScroll: true,
      panOnDrag: true,
      selectionOnDrag: false,
      fitView: true,
      fitViewOptions: { padding: 0.18, maxZoom: 1.2, minZoom: 0.15 },
      minZoom: 0.15,
      maxZoom: 1.8,
      zoomOnDoubleClick: false,
      className: "workflow-react-flow",
      proOptions: { hideAttribution: true },
    }, React.createElement(Background, { color: "rgba(255,255,255,.07)", gap: 28 }),
    React.createElement(Controls, { position: "bottom-right" }),
    React.createElement(MiniMap, {
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
      var html = typeof window.renderWorkflowNode === "function" ? window.renderWorkflowNode(node) : "";
      var incoming = typeof window.workflowIncomingEdges === "function" ? window.workflowIncomingEdges(node.id) : [];
      return {
        id: node.id,
        x: Number(node.x || 0),
        y: Number(node.y || 0),
        data: {
          html: html,
          sourceNode: node,
          inputUsed: incoming.length > 0,
        },
      };
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
    root.render(React.createElement(ReactFlowProvider, null,
      React.createElement(CanvasInner, { options: options })));
    if (typeof window.__workflowReactSelectedNodeId !== "string") {
      window.__workflowReactSelectedNodeId = "";
    }
    return mounted;
  }

  function refresh() {
    if (!mounted || !mounted.host || !mounted.host.isConnected) return false;
    return Boolean(mount(mounted.host));
  }

  function selectNode(nodeId) {
    if (!nodeId) return;
    window.__workflowReactSelectedNodeId = nodeId;
    window.setTimeout(function () {
      var element = document.querySelector('.react-flow__node[data-id="' + (window.CSS && CSS.escape ? CSS.escape(nodeId) : nodeId) + '"]');
      element?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    }, 0);
  }

  function screenToFlowPosition(point) {
    if (mounted && mounted.screenToFlowPosition) return mounted.screenToFlowPosition(point);
    return { x: Number(point?.x || 0), y: Number(point?.y || 0) };
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
    sync: function () { return refresh(); },
    remountPendingHost: remountPendingHost,
    selectNode: selectNode,
    screenToFlowPosition: screenToFlowPosition,
    buildOptions: buildOptions,
  };
  // platform.html may render the workflow shell before this deferred bundle
  // finishes loading. Hydrate that already-visible host immediately.
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
  window.workflowReactPersistEdges = syncEdgeState;
  window.createWorkflowNodeFromReact = function (action, position) {
    var node = typeof window.createWorkflowNode === "function" ? window.createWorkflowNode(action, normalizePosition(position)) : null;
    return node ? runtimeNode(node) : null;
  };
})();
