/**
 * 主画布组件
 */
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  useReactFlow,
  useUpdateNodeInternals,
  useStore,
  getViewportForBounds,
  ReactFlowProvider,
} from '@xyflow/react';
import { nanoid } from 'nanoid';
import '@xyflow/react/dist/style.css';
import 'bootstrap-icons/font/bootstrap-icons.css';

import { nodeTypes } from './nodes/siteNodeTypes';
import {
  toReactFlowGraph,
  readCanvasViewport,
  writeCanvasViewport,
} from '../../site/SiteBridge';
import { NodeOperationsProvider } from './providers/NodeOperationsProvider';
import { NodeDropzoneProvider } from './providers/NodeDropzoneProvider';
import { Toolbar } from './Toolbar';
import { ConnectionGuideEdge } from './edges/ConnectionGuideEdge';
import {
  buildConnectionGuideEdges,
  CONNECTION_GUIDE_EDGE_TYPE,
} from './edges/connectionGuide';
import './Canvas.css';

const edgeTypes = {
  [CONNECTION_GUIDE_EDGE_TYPE]: ConnectionGuideEdge,
};

const CanvasInner = ({
  projectId,
  initialNodes = [],
  initialEdges = [],
  onSave,
  onGraphChange,
  onDeleteNode,
  readOnly = false,
}) => {
  const [nodes, setNodes] = useState(initialNodes);
  const [edges, setEdges] = useState(initialEdges);
  const [panMode, setPanMode] = useState(true);
  const canvasRootRef = useRef(null);
  const {
    screenToFlowPosition,
    getViewport,
    setViewport,
    getNodes,
    getEdges,
    deleteElements,
    getNodesBounds,
    fitView,
    viewportInitialized,
  } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const canvasWidth = useStore((state) => state.width);
  const canvasHeight = useStore((state) => state.height);
  // Reopen exactly where the user left off. Auto-fit is only a fallback for a
  // canvas that has never stored a viewport yet.
  const viewportRef = useRef(readCanvasViewport());
  const shouldAutoFitInitialGraphRef = useRef(initialNodes.length > 0);
  const hasAutoFittedRef = useRef(false);
  const lastPaneClickRef = useRef({ time: 0, x: 0, y: 0 });
  const lastAddNodeAtRef = useRef({ time: 0, x: 0, y: 0 });
  const connectingNodeId = useRef(null);
  const nodesRef = useRef(initialNodes);
  const edgesRef = useRef(initialEdges);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { edgesRef.current = edges; }, [edges]);

  const measuredHandleNodesRef = useRef(new Set());
  const nodeIdsKey = nodes.map((node) => node.id).join('|');

  const fitCanvasSafely = useCallback((targetNodes = nodesRef.current) => {
    if (!viewportInitialized) return false;
    const viewportElement = document.querySelector('.CanvasEditor-canvas > .react-flow');
    const measuredWidth = viewportElement?.clientWidth || canvasWidth;
    const measuredHeight = viewportElement?.clientHeight || canvasHeight;
    if (!targetNodes.length || !measuredWidth || !measuredHeight) return false;

    // React Flow measures custom nodes asynchronously. On a freshly opened
    // project getNodesBounds can still be empty during the first frame, so use
    // the same card dimensions as a conservative fallback instead of leaving
    // the graph under the toolbar/minimap.
    const measuredBounds = getNodesBounds(targetNodes);
    const fallbackBounds = targetNodes.reduce((box, node) => {
      const width = node.measured?.width || node.width || node.style?.width || 420;
      const height = node.measured?.height || node.height || node.style?.height || 620;
      const x = node.position?.x || 0;
      const y = node.position?.y || 0;
      return {
        x: Math.min(box.x, x),
        y: Math.min(box.y, y),
        right: Math.max(box.right, x + width),
        bottom: Math.max(box.bottom, y + height),
      };
    }, { x: Infinity, y: Infinity, right: -Infinity, bottom: -Infinity });
    const bounds = measuredBounds?.width > 0 && measuredBounds?.height > 0
      ? measuredBounds
      : {
          x: fallbackBounds.x,
          y: fallbackBounds.y,
          width: fallbackBounds.right - fallbackBounds.x,
          height: fallbackBounds.bottom - fallbackBounds.y,
        };
    if (!bounds.width || !bounds.height) return false;

    const viewport = getViewportForBounds(
      bounds,
      measuredWidth,
      measuredHeight,
      0.25,
      1,
      { top: 94, right: 76, bottom: 118, left: 76 },
    );
    setViewport(viewport, { duration: 0 });
    viewportRef.current = viewport;
    writeCanvasViewport(viewport);
    return true;
  }, [canvasHeight, canvasWidth, getNodesBounds, setViewport, viewportInitialized]);

  useEffect(() => {
    // An empty project has no graph to fit. Do not run auto-fit when the first
    // manually created node appears, because that would unexpectedly reset the
    // user's current viewport.
    if (!shouldAutoFitInitialGraphRef.current || !nodesRef.current.length || viewportRef.current) return undefined;
    let firstFrame;
    let secondFrame;
    let retryFrame;
    const tryFit = (remaining = 20) => {
      if (fitCanvasSafely(nodesRef.current)) {
        secondFrame = requestAnimationFrame(() => fitCanvasSafely(nodesRef.current));
        return;
      }
      if (remaining > 0) retryFrame = requestAnimationFrame(() => tryFit(remaining - 1));
    };
    if (viewportInitialized) {
      firstFrame = requestAnimationFrame(() => tryFit());
    } else {
      // Width/height become available before the pan/zoom instance exists.
      // Retry only while the instance is absent; use a zero-delay timer so
      // initialization is not tied to unrelated animation frames.
      firstFrame = window.setTimeout(() => tryFit(), 0);
    }
    return () => {
      if (firstFrame) window.clearTimeout(firstFrame);
      if (secondFrame) cancelAnimationFrame(secondFrame);
      if (retryFrame) cancelAnimationFrame(retryFrame);
    };
  }, [fitCanvasSafely, viewportInitialized]);

  // React 17 下节点首次挂载时，React Flow 的 ResizeObserver 可能只测量到节点
  // 尺寸而没有写入 Handle 边界，导致 Handle 可点击却无法开始连线。节点 DOM
  // 就绪后使用官方 API 强制补测一次，并在下一帧复核，以覆盖异步布局。
  useEffect(() => {
    if (readOnly || !nodes.length) return undefined;
    const frame = requestAnimationFrame(() => {
      const pending = [];
      nodesRef.current.forEach((node) => {
        if (measuredHandleNodesRef.current.has(node.id)) return;
        const nodeElement = document.querySelector(
          `.react-flow__node[data-id="${node.id}"]`
        );
        const handles = nodeElement?.querySelectorAll('.react-flow__handle');
        if (!nodeElement || !handles?.length) return;
        measuredHandleNodesRef.current.add(node.id);
        pending.push(node.id);
      });
      if (pending.length) updateNodeInternals(pending);
    });
    return () => cancelAnimationFrame(frame);
  }, [nodeIdsKey, nodes.length, readOnly, updateNodeInternals]);

  // 将压缩包画布的原生视口能力暴露给本站外壳。节点同步不会重新执行
  // fitView，因此上传、轮询和改控件时不会出现比例尺突然变大/变小。
  useEffect(() => {
    const readViewport = () => ({ ...getViewport() });
    const handleCaptureViewport = (event) => {
      const viewport = readViewport();
      viewportRef.current = viewport;
      writeCanvasViewport(viewport);
      if (event?.detail?.sink) event.detail.sink.viewport = viewport;
    };
    const handleSetViewport = (event) => {
      const viewport = event?.detail?.viewport;
      if (!viewport) return;
      viewportRef.current = viewport;
      setViewport(viewport, { duration: 0 });
    };
    const handleFitView = () => {
      fitCanvasSafely(nodesRef.current);
      window.setTimeout(() => handleCaptureViewport(), 0);
    };
    const handleScreenToFlowPosition = (event) => {
      const point = event?.detail?.point;
      const sink = event?.detail?.sink;
      if (sink) sink.value = screenToFlowPosition(point);
    };
    const api = {
      screenToFlowPosition: (point) => screenToFlowPosition(point),
      captureViewport: () => handleCaptureViewport(),
      setViewport: (viewport) => handleSetViewport({ detail: { viewport } }),
      fitView: () => handleFitView(),
      getViewport: readViewport,
      getGraph: () => ({
        nodes: nodesRef.current,
        edges: edgesRef.current,
      }),
    };
    window.WorkflowReactCanvas = { ...(window.WorkflowReactCanvas || {}), ...api };
    window.addEventListener('workflow-react:capture-viewport', handleCaptureViewport);
    window.addEventListener('workflow-react:screen-to-flow', handleScreenToFlowPosition);
    window.addEventListener('workflow-react:set-viewport', handleSetViewport);
    window.addEventListener('workflow-react:fit-view', handleFitView);
    return () => {
      window.removeEventListener('workflow-react:capture-viewport', handleCaptureViewport);
      window.removeEventListener('workflow-react:screen-to-flow', handleScreenToFlowPosition);
      window.removeEventListener('workflow-react:set-viewport', handleSetViewport);
      window.removeEventListener('workflow-react:fit-view', handleFitView);
    };
  }, [fitCanvasSafely, getViewport, screenToFlowPosition, setViewport]);

  // 业务状态更新（生成轮询、上传、节点控件）通过同一个 React Flow 实例同步，
  // 不再卸载并重建画布，避免节点和已有连线消失。
  useEffect(() => {
    const sync = () => {
      const graph = toReactFlowGraph();
      setNodes((current) => {
        const currentById = new Map(current.map((node) => [node.id, node]));
        const next = graph.nodes.map((node) => {
          const existing = currentById.get(node.id);
          if (!existing) return node;
          return {
            ...existing,
            ...node,
            position: node.position,
            selected: Boolean(existing.selected),
          };
        });
        nodesRef.current = next;
        return next;
      });
      setEdges(graph.edges);
      edgesRef.current = graph.edges;
    };
    const select = (event) => {
      const nodeId = String(event?.detail?.nodeId || '');
      if (!nodeId) return;
      setNodes((current) => {
        const next = current.map((node) => ({ ...node, selected: node.id === nodeId }));
        nodesRef.current = next;
        return next;
      });
    };
    window.addEventListener('workflow-react:sync', sync);
    window.addEventListener('workflow-react:select-node', select);
    return () => {
      window.removeEventListener('workflow-react:sync', sync);
      window.removeEventListener('workflow-react:select-node', select);
    };
  }, []);

  // React Flow's default backspace handler treats every selected element as
  // deletable. Keep the same interaction but own the keyboard path so an
  // empty selection can never mutate or clear the canvas.
  useEffect(() => {
    if (readOnly) return undefined;
    const handleDeleteKeyDown = (event) => {
      if (!['Backspace', 'Delete'].includes(event.key) || event.defaultPrevented) return;
      const target = event.target;
      if (target?.closest?.('input, textarea, select, [contenteditable], [contenteditable="true"]')) return;
      const root = canvasRootRef.current;
      const targetInsideCanvas = root?.contains(target);
      const focusInsideCanvas = root?.contains(document.activeElement);
      if (!targetInsideCanvas && !focusInsideCanvas && target !== document.body) return;

      // Always consume Backspace/Delete while the canvas owns focus. Otherwise
      // the browser treats Backspace as history navigation and leaves the
      // editor, which looks like the canvas was cleared.
      event.preventDefault();
      event.stopPropagation();
      const selectedNodes = getNodes().filter((node) => node.selected);
      const selectedEdges = getEdges().filter((edge) => edge.selected);
      if (!selectedNodes.length && !selectedEdges.length) return;

      deleteElements({ nodes: selectedNodes, edges: selectedEdges }).catch((error) => {
        console.warn('Unable to delete selected canvas elements', error);
      });
    };
    document.addEventListener('keydown', handleDeleteKeyDown, true);
    return () => document.removeEventListener('keydown', handleDeleteKeyDown, true);
  }, [deleteElements, getEdges, getNodes, readOnly]);
  const isMountedRef = useRef(true); // 追踪组件是否已挂载
  const displayEdges = useMemo(
    () => buildConnectionGuideEdges(edges, nodes),
    [edges, nodes]
  );

  // 组件卸载时的清理
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // 节点变化处理
  const onNodesChange = useCallback(
    (changes) => {
      // 只读模式下，只允许 'select' 和 'dimensions' 类型的变化，其他操作都禁止
      if (readOnly) {
        const allowedChanges = changes.filter(
          (change) => change.type === 'select' || change.type === 'dimensions'
        );
        setNodes((nds) => applyNodeChanges(allowedChanges, nds));
      } else {
        setNodes((nds) => applyNodeChanges(changes, nds));
      }
    },
    [readOnly]
  );

  // 连线变化处理
  const onEdgesChange = useCallback(
    (changes) => {
      // 只读模式下，只允许 'select' 类型的变化，其他操作都禁止
      if (readOnly) {
        const allowedChanges = changes.filter((change) => change.type === 'select');
        setEdges((eds) => applyEdgeChanges(allowedChanges, eds));
      } else {
        setEdges((eds) => applyEdgeChanges(changes, eds));
      }
    },
    [readOnly]
  );

  // 使用本站业务图的连接规则；交互仍由压缩包里的 React Flow 实现。
  const isValidConnection = useCallback((connection) => {
    if (!connection?.source || !connection?.target || connection.source === connection.target) return false;
    if (typeof window.workflowCanConnectNodes !== 'function') return true;
    return Boolean(window.workflowCanConnectNodes(connection.source, connection.target));
  }, []);

  // 创建连接
  const onConnect = useCallback(
    (connection) => {
      // 只读模式下禁止创建连接
      if (readOnly) {
        return;
      }

      const newEdge = {
        ...connection,
        id: nanoid(),
        type: 'default',
      };
      // React Flow 只负责交互；本站业务图才是持久化来源。先经过业务层
      // 的连接规则和写入，成功后才把边加入 React 状态，避免只出现视觉线。
      if (typeof window.connectWorkflowNodes === 'function') {
        const connected = window.connectWorkflowNodes(connection.source, connection.target);
        if (!connected) return;
        const graph = toReactFlowGraph();
        setEdges(graph.edges);
        edgesRef.current = graph.edges;
        onGraphChange?.(nodesRef.current, graph.edges);
        return;
      }
      setEdges((eds) => {
        const next = addEdge(newEdge, eds);
        if (onGraphChange) onGraphChange(nodesRef.current, next);
        return next;
      });
    },
    [onGraphChange, readOnly]
  );

  const addNodeAtPointer = useCallback(
    (event) => {
      const now = performance.now();
      const previous = lastAddNodeAtRef.current;
      if (now - previous.time < 420 && Math.hypot(event.clientX - previous.x, event.clientY - previous.y) <= 12) return;
      lastAddNodeAtRef.current = { time: now, x: event.clientX, y: event.clientY };
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      if (typeof window.addWorkflowNodeAt !== 'function') return;
      window.addWorkflowNodeAt(event.shiftKey ? 'add-video' : 'add-image', position);
    },
    [screenToFlowPosition]
  );

  // React Flow 的 pane 点击是最稳定的空白画布入口。浏览器合成 dblclick
  // 在缩放/拖拽模式下偶尔不会到达 React Flow，因此在 pane 上按时间和
  // 坐标自行识别双击，避免普通单击、拖拽或节点点击误触发。
  const handlePaneClick = useCallback(
    (event) => {
      if (readOnly) return;
      const now = performance.now();
      const previous = lastPaneClickRef.current;
      if (now - previous.time <= 360 && Math.hypot(event.clientX - previous.x, event.clientY - previous.y) <= 8) {
        lastPaneClickRef.current = { time: 0, x: 0, y: 0 };
        addNodeAtPointer(event);
        return;
      }
      lastPaneClickRef.current = { time: now, x: event.clientX, y: event.clientY };
    },
    [addNodeAtPointer, readOnly]
  );

  // 保留原生双击兼容路径；与 pane 点击识别去重。
  const handleDoubleClick = useCallback(
    (event) => {
      if (readOnly || event.target.closest?.('.react-flow__node, .react-flow__controls, .react-flow__minimap')) return;
      lastPaneClickRef.current = { time: 0, x: 0, y: 0 };
      addNodeAtPointer(event);
    },
    [addNodeAtPointer, readOnly]
  );

  // 处理拖放 - 允许拖放
  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  // 工具栏拖入时，直接创建本站图片/视频节点。
  const onDrop = useCallback(
    (event) => {
      event.preventDefault();
      if (readOnly) return;
      const mediaDrag = event.dataTransfer?.getData('application/x-workflow-media-result') || '';
      if (mediaDrag) {
        try {
          const media = JSON.parse(mediaDrag);
          const sourceNodeId = String(media.sourceNodeId || '');
          const targetNode = event.target.closest?.('.react-flow__node');
          let targetNodeId = String(targetNode?.dataset?.id || targetNode?.getAttribute?.('data-id') || '');
          if (!targetNodeId) {
            const point = screenToFlowPosition({ x: event.clientX, y: event.clientY });
            let nearest = null;
            let nearestDistance = Infinity;
            nodesRef.current.forEach((node) => {
              const x = Number(node.position?.x || 0);
              const y = Number(node.position?.y || 0);
              const distance = Math.hypot(point.x - x, point.y - y);
              if (distance < nearestDistance) {
                nearest = node;
                nearestDistance = distance;
              }
            });
            if (nearest && nearestDistance < 800) targetNodeId = String(nearest.id || '');
          }
          if (sourceNodeId && targetNodeId && sourceNodeId !== targetNodeId) {
            const target = typeof window.workflowNodeById === 'function'
              ? window.workflowNodeById(targetNodeId)
              : null;
            const mediaUrl = String(media.url || '').trim();
            if (target && mediaUrl) {
              const field = media.kind === 'video' ? 'referenceVideos' : 'referenceImages';
              const assetField = `${field}AssetIds`;
              const currentValues = Array.isArray(target.data?.[field]) ? target.data[field] : [];
              const currentAssetIds = Array.isArray(target.data?.[assetField]) ? target.data[assetField] : [];
              target.data = {
                ...(target.data || {}),
                [field]: [...new Set([...currentValues, mediaUrl].filter(Boolean))],
                ...(media.assetId
                  ? { [assetField]: [...new Set([...currentAssetIds, String(media.assetId)])] }
                  : {}),
              };
              if (typeof window.persistWorkflowState === 'function') {
                window.persistWorkflowState();
              }
              window.WorkflowReactCanvas?.sync?.();
            }
            if (typeof window.connectWorkflowNodes === 'function') {
              window.connectWorkflowNodes(sourceNodeId, targetNodeId);
            }
          }
        } catch (error) {
          console.warn('Unable to connect dropped generation result', error);
        }
        return;
      }
      const files = Array.from(event.dataTransfer?.files || []).filter((file) => /^(image|video)\//i.test(String(file.type || '')));
      if (files.length && typeof window.uploadWorkflowFilesToNode === 'function') {
        const targetNode = event.target.closest?.('.react-flow__node');
        let targetNodeId = String(targetNode?.dataset?.id || targetNode?.getAttribute?.('data-id') || '');
        if (!targetNodeId) {
          const point = screenToFlowPosition({ x: event.clientX, y: event.clientY });
          let nearest = null;
          let nearestDistance = Infinity;
          nodesRef.current.forEach((node) => {
            const distance = Math.hypot(point.x - Number(node.position?.x || 0), point.y - Number(node.position?.y || 0));
            if (distance < nearestDistance) {
              nearest = node;
              nearestDistance = distance;
            }
          });
          if (nearest && nearestDistance < 900) targetNodeId = String(nearest.id || '');
        }
        if (targetNodeId) window.uploadWorkflowFilesToNode(files, targetNodeId);
        return;
      }
      if (typeof window.addWorkflowNodeAt !== 'function') return;
      const action = event.dataTransfer?.getData('application/x-workflow-node')
        || event.dataTransfer?.getData('application/reactflow')
        || '';
      if (!['add-image', 'add-video', 'imageGenerate', 'unifiedVideoGen', 'video'].includes(action)) return;
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      window.addWorkflowNodeAt(action === 'add-video' || action === 'unifiedVideoGen' || action === 'video' ? 'add-video' : 'add-image', position);
    },
    [screenToFlowPosition, readOnly]
  );

  return (
    <NodeDropzoneProvider>
      <div ref={canvasRootRef} className="Canvas-wrapper reactflow-wrapper">{/* 添加 reactflow-wrapper 供引导定位 */}
        <ReactFlow
          nodes={nodes}
          nodesFocusable
          edgesFocusable
          connectionLineStyle={{ stroke: '#ff4fa3', strokeWidth: 2 }}
          connectionRadius={42}
          edges={displayEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onMoveEnd={(_, viewport) => {
            viewportRef.current = viewport;
            writeCanvasViewport(viewport);
          }}
          onPaneClick={handlePaneClick}
          onDoubleClick={handleDoubleClick}
          onDrop={onDrop}
          onDragOver={onDragOver}
          isValidConnection={isValidConnection}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          deleteKeyCode={null}
          nodesDraggable={!readOnly}
          nodesConnectable={!readOnly}
          elementsSelectable={true}
          onNodeDragStop={(_, node) => {
            const nextNodes = nodesRef.current.map((item) => item.id === node.id ? { ...item, position: node.position } : item);
            setNodes(nextNodes);
            nodesRef.current = nextNodes;
            onGraphChange?.(nextNodes, edgesRef.current);
          }}
          onNodesDelete={(deleted) => {
            if (!onDeleteNode) return;
            deleted.forEach((node) => onDeleteNode(node.id));
          }}
          onEdgesDelete={(deleted) => {
            const deletedKeys = new Set(deleted.map((edge) => `${edge.source}->${edge.target}`));
            const next = edgesRef.current.filter((edge) => !deletedKeys.has(`${edge.source}->${edge.target}`));
            edgesRef.current = next;
            if (onGraphChange) onGraphChange(nodesRef.current, next);
          }}
          panOnScroll
          panOnDrag={panMode}
          selectionOnDrag={!panMode}
          selectionMode={!panMode ? 'partial' : undefined}
          fitView={false}
          defaultViewport={viewportRef.current || { x: 0, y: 0, zoom: 1 }}
          fitViewOptions={{
            padding: { top: 94, right: 76, bottom: 118, left: 76 },
            minZoom: 0.25,
            maxZoom: 1,
          }}
          minZoom={0.25}
          maxZoom={1.5}
          zoomOnScroll
          zoomOnPinch
          preventScrolling={false}
          zoomOnDoubleClick={false}
          className="Canvas-reactflow"
        >
          <Background color="rgba(255,255,255,.13)" gap={24} />
          <Controls position="bottom-left" showInteractive={false} />
          <MiniMap
            position="bottom-right"
            pannable
            zoomable
            nodeColor={(node) => (node.type === 'siteVideoGeneration' ? '#9e7bff' : '#ff4fa3')}
            maskColor="rgba(8,8,10,.72)"
          />
        </ReactFlow>

        {/* 保存状态指示器 */}
        {/* {saveStatus && (
          <div className={`Canvas-save-indicator Canvas-save-indicator-${saveStatus}`}>
            {saveStatus === 'saving' ? (
              <>
                <span className="Canvas-save-spinner"></span>
                正在保存...
              </>
            ) : (
              <>
                <span className="Canvas-save-check">✓</span>
                已保存
              </>
            )}
          </div>
        )} */}

        {!readOnly && <Toolbar disabled={readOnly} />}

        {false && (
          <div className="Canvas-mode-toggle" role="group" aria-label="画布操作模式">
            <button
              type="button"
              className={`Canvas-mode-button ${panMode ? 'Canvas-mode-button-active' : ''}`}
              onClick={() => setPanMode(true)}
              title="抓取模式：拖动画布"
            >
              <span className="Canvas-mode-icon"><i className="bi bi-hand-index" /></span>
              <span className="Canvas-mode-label">抓取</span>
            </button>
            <button
              type="button"
              className={`Canvas-mode-button ${!panMode ? 'Canvas-mode-button-active' : ''}`}
              onClick={() => setPanMode(false)}
              title="选择模式：框选节点"
            >
              <span className="Canvas-mode-icon Canvas-mode-icon-flip"><i className="bi bi-cursor-fill" /></span>
              <span className="Canvas-mode-label">选择</span>
            </button>
          </div>
        )}
      </div>
    </NodeDropzoneProvider>
  );
};

export const Canvas = (props) => {
  return (
    <ReactFlowProvider>
      <NodeOperationsProvider>
        <CanvasInner {...props} />
      </NodeOperationsProvider>
    </ReactFlowProvider>
  );
};
