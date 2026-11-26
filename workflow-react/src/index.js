import React from 'react';
import ReactDOM from 'react-dom';
import { Canvas } from './components/canvas/Canvas';
import { WorkflowEditor } from './components/workflow/WorkflowEditor';
import { WorkflowLibrary } from './components/workflow/WorkflowLibrary';
import { WorkflowUnlockModal } from './components/workflow/WorkflowUnlockModal';
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

function parseWorkflowRouteFromWindow() {
  if (typeof window === 'undefined') return { canvasId: '', inviteCode: '', subTab: '' };
  if (typeof window.getWorkflowRouteParams === 'function') {
    const route = window.getWorkflowRouteParams();
    if (route && (route.canvasId || route.inviteCode || route.subTab)) return route;
  }
  const rawHash = String(window.location.hash || '').replace(/^#\/?/, '');
  const [tab = '', query = ''] = rawHash.split('?');
  const hashParams = tab === 'workflow' ? new URLSearchParams(query || '') : new URLSearchParams();
  const searchParams = new URLSearchParams(window.location.search || '');
  const subTab = String(hashParams.get('tab') || '').trim().toLowerCase();
  return {
    canvasId: String(hashParams.get('canvas') || searchParams.get('canvas') || '').trim(),
    inviteCode: String(hashParams.get('code') || searchParams.get('code') || '').trim(),
    subTab: ['mine', 'templates'].includes(subTab) ? subTab : '',
  };
}

function readAuthSnapshot() {
  if (typeof window !== 'undefined' && typeof window.getPlatformAuthState === 'function') {
    return window.getPlatformAuthState();
  }
  const hasToken = (() => {
    try { return Boolean(window.localStorage.getItem('raisingGameToken')); } catch { return false; }
  })();
  return { loggedIn: hasToken, authResolved: true, user: null };
}

function WorkflowWorkspace() {
  const initialRoute = React.useMemo(() => parseWorkflowRouteFromWindow(), []);
  const [view, setView] = React.useState('library');
  const [libraryTab, setLibraryTab] = React.useState(initialRoute.subTab || 'mine');
  const [project, setProject] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [pendingAccess, setPendingAccess] = React.useState(null);
  const [unlockPrompt, setUnlockPrompt] = React.useState(null);
  const [authVersion, setAuthVersion] = React.useState(0);
  const [libraryVersion, setLibraryVersion] = React.useState(0);
  const [editorVersion, setEditorVersion] = React.useState(0);
  const projectRef = React.useRef(null);
  const editorOpenRef = React.useRef(false);
  const historyTokenRef = React.useRef('');
  const lastCanvasBackAtRef = React.useRef(0);
  const pendingAccessRef = React.useRef(null);

  React.useEffect(() => {
    projectRef.current = project;
  }, [project]);

  React.useEffect(() => {
    pendingAccessRef.current = pendingAccess;
  }, [pendingAccess]);

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
    if (typeof window.setWorkflowRouteParams === 'function') {
      window.setWorkflowRouteParams({ canvasId: '', inviteCode: '', subTab: libraryTab === 'templates' ? 'templates' : '' });
    }
    if (syncHistory) {
      const state = window.history.state && typeof window.history.state === 'object'
        ? { ...window.history.state }
        : {};
      state[WORKFLOW_CANVAS_HISTORY_KEY] = '';
      window.history.replaceState(state, '', window.location.href);
    }
    setProject(null);
    setUnlockPrompt(null);
    setPendingAccess(null);
    setError('');
    setView('library');
    setLibraryVersion((value) => value + 1);
  }, [libraryTab]);

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
      if (projectRef.current?.canEdit !== false && typeof window.deleteSelectedWorkflowNodeFromCanvas === 'function') {
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

  const activateLoadedCanvas = React.useCallback(async (canvas, { replaceHistory = false } = {}) => {
    if (!canvas?.id || !canvas?.workflow) throw new Error('画布数据为空');
    if (typeof window.activateWorkflowCanvasProject !== 'function') {
      throw new Error('画布站点桥接未加载');
    }
    const readOnly = Boolean(canvas.canEdit === false || canvas.accessMode === 'template_readonly');
    const activated = await window.activateWorkflowCanvasProject(canvas, { readOnly });
    if (!activated) throw new Error('画布激活失败');
    if (typeof window.setWorkflowRouteParams === 'function') {
      window.setWorkflowRouteParams({ canvasId: canvas.id, inviteCode: '', subTab: '' });
    }
    editorOpenRef.current = true;
    if (replaceHistory) rememberEditorHistory(canvas.id, true);
    else rememberEditorHistory(canvas.id);
    setPendingAccess(null);
    setUnlockPrompt(null);
    setError('');
    setProject(canvas);
    setEditorVersion((value) => value + 1);
    setView('editor');
  }, [rememberEditorHistory]);

  const openCanvasById = React.useCallback(async (canvasId, { inviteCode = '', promptLogin = true } = {}) => {
    const cleanId = String(canvasId || '').trim();
    const cleanCode = String(inviteCode || '').trim();
    if (!cleanId) return;
    const auth = readAuthSnapshot();
    if (!auth.loggedIn) {
      setPendingAccess({ canvasId: cleanId, inviteCode: cleanCode });
      setUnlockPrompt(null);
      setError('');
      if (auth.authResolved && promptLogin && typeof window.openPlatformLoginModal === 'function') {
        window.openPlatformLoginModal();
      }
      return;
    }

    setLoading(true);
    setError('');
    setPendingAccess(null);
    try {
      const payload = await requestCanvasJson(`/api/workflow/canvases/${encodeURIComponent(cleanId)}`);
      await activateLoadedCanvas(payload.canvas);
    } catch (openError) {
      editorOpenRef.current = false;
      if (typeof window.deactivateWorkflowCanvasProject === 'function') {
        window.deactivateWorkflowCanvasProject();
      }
      setProject(null);
      setView('library');
      if (openError.status === 401 || openError.code === 'LOGIN_REQUIRED') {
        setPendingAccess({ canvasId: cleanId, inviteCode: cleanCode });
        if (promptLogin && typeof window.openPlatformLoginModal === 'function') {
          window.openPlatformLoginModal();
        }
        return;
      }
      if (openError.status === 403 && openError.code === 'WORKFLOW_CANVAS_LOCKED') {
        const lockedTemplate = openError.payload?.template || { id: cleanId };
        if (cleanCode) {
          try {
            const unlockPayload = await requestCanvasJson(`/api/workflow/canvases/${encodeURIComponent(cleanId)}/unlock`, {
              method: 'POST',
              body: { method: 'invite_code', inviteCode: cleanCode },
            });
            if (unlockPayload.user && typeof window.syncPlatformUser === 'function') {
              window.syncPlatformUser(unlockPayload.user);
            }
            await activateLoadedCanvas(unlockPayload.canvas);
            return;
          } catch (codeError) {
            setUnlockPrompt({
              template: lockedTemplate,
              initialCode: cleanCode,
              initialError: codeError.message || String(codeError),
            });
            return;
          }
        }
        setUnlockPrompt({ template: lockedTemplate, initialCode: '', initialError: '' });
        return;
      }
      setError(openError.message || String(openError));
    } finally {
      setLoading(false);
    }
  }, [activateLoadedCanvas]);

  const openProject = React.useCallback((summary) => {
    if (!summary?.id) return;
    openCanvasById(summary.id, { inviteCode: '', promptLogin: true });
  }, [openCanvasById]);

  const createProject = React.useCallback(async () => {
    const auth = readAuthSnapshot();
    if (!auth.loggedIn) {
      if (typeof window.openPlatformLoginModal === 'function') window.openPlatformLoginModal();
      return;
    }
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
      await activateLoadedCanvas({ ...canvas, workflow }, { replaceHistory: Boolean(projectRef.current) });
    } catch (createError) {
      setError(createError.message || String(createError));
    } finally {
      setLoading(false);
    }
  }, [activateLoadedCanvas]);

  const forkProject = React.useCallback(async (sourceProject) => {
    if (!sourceProject?.id) return;
    setLoading(true);
    setError('');
    try {
      const payload = await requestCanvasJson(`/api/workflow/canvases/${encodeURIComponent(sourceProject.id)}/fork`, {
        method: 'POST',
        body: {},
      });
      if (!payload.canvas?.id) throw new Error('复制画布失败');
      setLibraryTab('mine');
      await activateLoadedCanvas(payload.canvas, { replaceHistory: true });
    } catch (forkError) {
      setError(forkError.message || String(forkError));
    } finally {
      setLoading(false);
    }
  }, [activateLoadedCanvas]);

  const handleProjectChange = React.useCallback((nextProject) => {
    setProject((current) => ({ ...(current || {}), ...(nextProject || {}) }));
  }, []);

  const handleTabChange = React.useCallback((nextTab) => {
    const cleanTab = nextTab === 'templates' ? 'templates' : 'mine';
    setLibraryTab(cleanTab);
    if (typeof window.setWorkflowRouteParams === 'function') {
      window.setWorkflowRouteParams({ canvasId: '', inviteCode: '', subTab: cleanTab === 'templates' ? 'templates' : '' });
    }
  }, []);

  React.useEffect(() => {
    const route = parseWorkflowRouteFromWindow();
    if (route.subTab) setLibraryTab(route.subTab);
    if (route.canvasId) {
      openCanvasById(route.canvasId, { inviteCode: route.inviteCode, promptLogin: true });
    }
  }, [openCanvasById]);

  React.useEffect(() => {
    const onRouteChanged = (event) => {
      const detail = event?.detail || {};
      if (detail.subTab) setLibraryTab(detail.subTab === 'templates' ? 'templates' : 'mine');
      const targetId = String(detail.canvasId || '').trim();
      if (targetId && targetId !== String(projectRef.current?.id || '')) {
        openCanvasById(targetId, { inviteCode: detail.inviteCode || '', promptLogin: true });
      }
    };
    const onAuthChanged = (event) => {
      setAuthVersion((value) => value + 1);
      const detail = event?.detail || readAuthSnapshot();
      const pending = pendingAccessRef.current;
      if (pending?.canvasId) {
        if (detail.loggedIn) {
          openCanvasById(pending.canvasId, { inviteCode: pending.inviteCode, promptLogin: false });
        } else if (detail.authResolved && typeof window.openPlatformLoginModal === 'function') {
          window.openPlatformLoginModal();
        }
      }
    };
    window.addEventListener('workflow-route-changed', onRouteChanged);
    window.addEventListener('workflow-auth-changed', onAuthChanged);
    return () => {
      window.removeEventListener('workflow-route-changed', onRouteChanged);
      window.removeEventListener('workflow-auth-changed', onAuthChanged);
    };
  }, [openCanvasById]);

  if (loading) {
    return (
      <div className="WorkflowWorkspace-state" role="status">
        <span className="WorkflowWorkspace-spinner" aria-hidden="true" />
        <strong>正在打开画布…</strong>
      </div>
    );
  }

  if (pendingAccess && !editorOpenRef.current) {
    return (
      <div className="WorkflowWorkspace-state" role="status">
        <strong>请先登录后查看此画布</strong>
        <span>登录完成后将自动校验画布权限并继续打开</span>
        <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
          <button
            type="button"
            onClick={() => window.openPlatformLoginModal?.()}
          >
            立即登录
          </button>
          <button
            type="button"
            onClick={() => {
              setPendingAccess(null);
              if (typeof window.setWorkflowRouteParams === 'function') {
                window.setWorkflowRouteParams({ canvasId: '', inviteCode: '', subTab: 'templates' });
              }
              setLibraryTab('templates');
              setView('library');
            }}
          >
            浏览公开模版
          </button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="WorkflowWorkspace-state is-error" role="alert">
        <strong>无法打开画布</strong>
        <span>{error}</span>
        <button
          type="button"
          onClick={() => {
            setError('');
            if (typeof window.setWorkflowRouteParams === 'function') {
              window.setWorkflowRouteParams({ canvasId: '', inviteCode: '', subTab: libraryTab === 'templates' ? 'templates' : '' });
            }
            setView('library');
          }}
        >
          返回项目列表
        </button>
      </div>
    );
  }

  if (view === 'editor' && project && !project.locked && project.workflow && !unlockPrompt) {
    const readOnly = Boolean(project.canEdit === false || project.accessMode === 'template_readonly');
    return (
      <WorkflowEditor
        key={`${project.id}:${editorVersion}`}
        project={project}
        readOnly={readOnly}
        onBack={returnToLibrary}
        onFork={forkProject}
        onProjectChange={handleProjectChange}
      />
    );
  }

  return (
    <>
      <WorkflowLibrary
        key={`library:${libraryVersion}`}
        activeTab={libraryTab}
        onTabChange={handleTabChange}
        onOpen={openProject}
        onCreate={createProject}
        authVersion={authVersion}
      />
      {unlockPrompt ? (
        <WorkflowUnlockModal
          template={unlockPrompt.template}
          initialCode={unlockPrompt.initialCode}
          initialError={unlockPrompt.initialError}
          onClose={() => {
            setUnlockPrompt(null);
            if (typeof window.setWorkflowRouteParams === 'function') {
              window.setWorkflowRouteParams({ canvasId: '', inviteCode: '', subTab: libraryTab === 'templates' ? 'templates' : '' });
            }
          }}
          onUnlocked={async (payload) => {
            setUnlockPrompt(null);
            if (payload?.canvas) {
              try {
                await activateLoadedCanvas(payload.canvas);
              } catch (activateErr) {
                setError(activateErr.message || String(activateErr));
              }
            }
          }}
        />
      ) : null}
    </>
  );
}

class WorkflowErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error: error || new Error('画布渲染异常') };
  }
  componentDidCatch(error) {
    console.error('Workflow canvas render error:', error);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="WorkflowWorkspace-state is-error" role="alert">
          <strong>画布加载异常</strong>
          <span>{this.state.error?.message || String(this.state.error)}</span>
          <button
            type="button"
            onClick={() => {
              if (typeof window.deactivateWorkflowCanvasProject === 'function') {
                window.deactivateWorkflowCanvasProject();
              }
              if (typeof window.setWorkflowRouteParams === 'function') {
                window.setWorkflowRouteParams({ canvasId: '', inviteCode: '', subTab: '' });
              }
              this.setState({ error: null });
            }}
          >
            返回项目列表
          </button>
        </div>
      );
    }
    return this.props.children;
  }
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
    <WorkflowErrorBoundary>
      <WorkflowWorkspace />
    </WorkflowErrorBoundary>,
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
