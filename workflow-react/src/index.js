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

  const returnToLibrary = React.useCallback(() => {
    if (typeof window.deactivateWorkflowCanvasProject === 'function') {
      window.deactivateWorkflowCanvasProject();
    }
    setProject(null);
    setView('library');
    setLibraryVersion((value) => value + 1);
  }, []);

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
      setProject(canvas);
      setEditorVersion((value) => value + 1);
      setView('editor');
    } catch (openError) {
      setError(openError.message || String(openError));
    } finally {
      setLoading(false);
    }
  }, []);

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
      setProject({ ...canvas, workflow });
      setEditorVersion((value) => value + 1);
      setView('editor');
    } catch (createError) {
      setError(createError.message || String(createError));
    } finally {
      setLoading(false);
    }
  }, []);

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
