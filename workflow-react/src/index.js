import React from 'react';
import ReactDOM from 'react-dom';
import { Canvas } from './components/canvas/Canvas';
import {
  toReactFlowGraph,
  writeReactFlowGraph,
  notifyNodeChanged,
} from './site/SiteBridge';
import './site/site.css';

let mountedHost = null;

function mount(host) {
  if (!host) return null;
  if (mountedHost === host) {
    sync();
    return host;
  }
  if (mountedHost) ReactDOM.unmountComponentAtNode(mountedHost);
  mountedHost = host;
  const graph = toReactFlowGraph();
  ReactDOM.render(
    <Canvas
      initialNodes={graph.nodes}
      initialEdges={graph.edges}
      onSave={(nodes, edges) => writeReactFlowGraph(nodes, edges)}
      onGraphChange={(nodes, edges) => writeReactFlowGraph(nodes, edges)}
      onDeleteNode={(nodeId) => {
        if (typeof window.removeWorkflowNode !== 'function') return false;
        const removed = Boolean(window.removeWorkflowNode(nodeId));
        if (removed) notifyNodeChanged("");
        return removed;
      }}
    />,
    host,
  );
  return host;
}

function unmount() {
  if (mountedHost) ReactDOM.unmountComponentAtNode(mountedHost);
  mountedHost = null;
}

function sync() {
  if (!mountedHost) return false;
  window.dispatchEvent(new CustomEvent('workflow-react:sync'));
  return true;
}

function selectNode(nodeId = '') {
  if (!mountedHost || !nodeId) return false;
  window.dispatchEvent(new CustomEvent('workflow-react:select-node', { detail: { nodeId } }));
  return true;
}

function isMounted(host = null) {
  return Boolean(mountedHost && (!host || mountedHost === host));
}

function screenToFlowPosition(point = {}) {
  const dispatch = () => {
    let position = null;
    const detail = {
      point,
      sink: {
        set value(value) { position = value; },
        get value() { return position; },
      },
    };
    window.dispatchEvent(new CustomEvent('workflow-react:screen-to-flow', { detail }));
    return detail.sink.value;
  };
  return dispatch();
}

function captureViewport() {
  const detail = { sink: { viewport: null } };
  window.dispatchEvent(new CustomEvent('workflow-react:capture-viewport', { detail }));
  return detail.sink.viewport;
}

function setViewport(viewport) {
  if (!viewport) return false;
  window.dispatchEvent(new CustomEvent('workflow-react:set-viewport', { detail: { viewport } }));
  return true;
}

function restoreViewport(viewport) {
  return setViewport(viewport);
}

function fitView() {
  window.dispatchEvent(new CustomEvent('workflow-react:fit-view'));
}

window.WorkflowReactCanvas = {
  mount,
  unmount,
  sync,
  selectNode,
  isMounted,
  screenToFlowPosition,
  captureViewport,
  setViewport,
  restoreViewport,
  fitView,
};
