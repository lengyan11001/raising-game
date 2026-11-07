import React from 'react';
import ReactDOM from 'react-dom';
import { Canvas } from './components/canvas/Canvas';
import { WorkflowEditor } from './components/workflow/WorkflowEditor';
import { WorkflowLibrary } from './components/workflow/WorkflowLibrary';
import { requestCanvasJson } from './components/workflow/canvasApi';
import {
  toReactFlowGraph,
  writeReactFlowGraph,
  notifyNodeChanged,
} from './site/SiteBridge';
import './site/site.css';

let mountedHost = null;
const WORKFLOW_CANVAS_HISTORY_KEY = '__workflowCanvasProjectId';

function emptyWorkflow() {
  return {
    nodes: [],
    edges: [],
    physics: [],
    directorPrompt: '',
    zoom: 1,
    layoutVersion: 7,
    canvasWidth: 3200,
    canvasHeight: 720,
    scrollLeft: 0,
    scrollTop: 0,
    viewport: null,
  };
}

function WorkflowWorkspace() {
  const [view, setView] = React.useState('library');
  const [project, setProject] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [libraryVersion, setLibraryVersion] = React.useState(0);
  const [editorVersion, setEditorVersion] = React.useState(0);
  const projectRef = React.useRef(null);
  const editorOpenRef = React.useRef(false);
  const historyTokenRef = React.useRef('');
  const lastCanvasBackAtRef = React.useRef(0);

  React.useEffect(() => {
    projectRef.current = project;
  }, [project]);

  const rememberEditorHistory = React.useCallback((canvasId, replace = false) => {
    const state = window.history.state && typeof window.history.state === 'object'
      ? { ...window.history.state }
      : {};
    const historyToken = `${String(canvasId || '')}:${Date.now()}`;
    historyTokenRef.current = historyToken;
    state[WORKFLOW_CANVAS_HISTORY_KEY] = String(canvasId || '');
    state[`${WORKFLOW_CANVAS_HISTORY_KEY}Token`] = historyToken;
    const method = replace ? 'replaceState' : 'pushState';
    window.history[method](state, '', window.location.href);
  }, []);

  const returnToLibrary = React.useCallback(({ syncHistory = true } = {}) => {
    editorOpenRef.current = false;
    if (typeof window.deactivateWorkflowCanvasProject === 'function') {
      window.deactivateWorkflowCanvasProject();
    }
    if (syncHistory) {
      const state = window.history.state && typeof window.history.state === 'object'
        ? { ...window.history.state }
        : {};
      state[WORKFLOW_CANVAS_HISTORY_KEY] = '';
      window.history.replaceState(state, '', window.location.href);
    }
    setProject(null);
    setView('library');
    setLibraryVersion((value) => value + 1);
  }, []);

  const keepEditorOnHistoryBack = React.useCallback(() => {
    if (!editorOpenRef.current) return false;
    const projectId = String(projectRef.current?.id || '');
    if (!projectId) return false;
    const state = window.history.state && typeof window.history.state === 'object'
      ? { ...window.history.state }
      : {};
    state[WORKFLOW_CANVAS_HISTORY_KEY] = projectId;
    state[`${WORKFLOW_CANVAS_HISTORY_KEY}Token`] = `${projectId}:${Date.now()}`;
    // Back is an in-canvas delete gesture. Replace the entry the browser just
    // moved to with the editor entry again, otherwise the site shell can hide
    // the workflow tab or a second back can tear down the canvas.
    window.history.replaceState(state, '', `${window.location.pathname}${window.location.search}#workflow`);
    return true;
  }, []);

  const handleCanvasHistoryBack = React.useCallback(() => {
    if (!editorOpenRef.current) return false;
    const now = Date.now();
    // popstate and hashchange can both fire for one physical back gesture.
    // Consume the pair as one deletion, never two.
    if (now - lastCanvasBackAtRef.current > 180) {
      lastCanvasBackAtRef.current = now;
      if (typeof window.deleteSelectedWorkflowNodeFromCanvas === 'function') {
        window.deleteSelectedWorkflowNodeFromCanvas();
      }
    }
    keepEditorOnHistoryBack();
    return true;
  }, [keepEditorOnHistoryBack]);

  React.useEffect(() => {
    const handlePopState = (event) => {
      if (!editorOpenRef.current) return;
      event.stopImmediatePropagation?.();
      handleCanvasHistoryBack();
    };
    // The site shell's hash listener is registered before this component. Make
    // the bridge available to it so a hash back gesture can be resolved here
    // before setTab() hides the canvas.
    window.handleWorkflowCanvasHistoryBack = () => {
      return handleCanvasHistoryBack();
    };
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      if (window.handleWorkflowCanvasHistoryBack) delete window.handleWorkflowCanvasHistoryBack;
    };
  }, [handleCanvasHistoryBack]);

  const openProject = React.useCallback(async (summary) => {
    setLoading(true);
    setError('');
    try {
      const payload = await requestCanvasJson(`/api/workflow/canvases/${encodeURIComponent(summary.id)}`);
      const canvas = payload.canvas || {};
      if (!canvas.id || !canvas.workflow) throw new Error('画布数据为空');
      if (typeof window.activateWorkflowCanvasProject !== 'function') {
        throw new Error('画布站点桥接未加载');
      }
      if (!window.activateWorkflowCanvasProject(canvas)) throw new Error('画布激活失败');
      editorOpenRef.current = true;
      rememberEditorHistory(canvas.id);
      setProject(canvas);
      setEditorVersion((value) => value + 1);
      setView('editor');
    } catch (openError) {
      setError(openError.message || String(openError));
    } finally {
      setLoading(false);
    }
  }, [rememberEditorHistory]);

  const createProject = React.useCallback(async () => {
    const adjectives = ['创意', '智能', '未来', '梦想', '灵感', '神奇', '精彩', '炫酷', '极致', '超凡'];
    const nouns = ['画布', '项目', '创作', '空间', '作品', '设计', '方案'];
    const name = `${adjectives[Math.floor(Math.random() * adjectives.length)]}${nouns[Math.floor(Math.random() * nouns.length)]}_${Date.now().toString().slice(-4)}`;
    setLoading(true);
    setError('');
    try {
      const workflow = emptyWorkflow();
      const payload = await requestCanvasJson('/api/workflow/canvases', {
        method: 'POST',
        body: { name, workflow },
      });
      const canvas = payload.canvas || {};
      if (!canvas.id) throw new Error('画布创建失败');
      if (typeof window.activateWorkflowCanvasProject !== 'function') {
        throw new Error('画布站点桥接未加载');
      }
      if (!window.activateWorkflowCanvasProject({ ...canvas, workflow })) throw new Error('画布激活失败');
      editorOpenRef.current = true;
      rememberEditorHistory(canvas.id, Boolean(projectRef.current));
      setProject({ ...canvas, workflow });
      setEditorVersion((value) => value + 1);
      setView('editor');
    } catch (createError) {
      setError(createError.message || String(createError));
    } finally {
      setLoading(false);
    }
  }, [rememberEditorHistory]);

  const handleProjectChange = React.useCallback((nextProject) => {
    setProject((current) => ({ ...(current || {}), ...(nextProject || {}) }));
  }, []);

  if (loading) {
    return (
      <div className="WorkflowWorkspace-state" role="status">
        <span className="WorkflowWorkspace-spinner" aria-hidden="true" />
        <strong>正在打开画布…</strong>
      </div>
    );
  }

  if (error) {
    return (
      <div className="WorkflowWorkspace-state is-error" role="alert">
        <strong>画布操作失败</strong>
        <span>{error}</span>
        <button type="button" onClick={() => { setError(''); setView('library'); }}>
          返回项目列表
        </button>
      </div>
    );
  }

  if (view === 'editor' && project) {
    return (
      <WorkflowEditor
        key={`${project.id}:${editorVersion}`}
        project={project}
        onBack={returnToLibrary}
        onCreate={createProject}
        onProjectChange={handleProjectChange}
      />
    );
  }

  return (
    <WorkflowLibrary
      key={`library:${libraryVersion}`}
      onOpen={openProject}
      onCreate={createProject}
    />
  );
}

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
    <WorkflowWorkspace />,
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
  if (!mountedHost) return false;
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
