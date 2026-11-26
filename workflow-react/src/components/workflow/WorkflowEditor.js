import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { Canvas } from '../canvas/Canvas';
import { toReactFlowGraph, writeReactFlowGraph, notifyNodeChanged } from '../../site/SiteBridge';
import { buildWorkflowShareUrl, copyTextToClipboard } from './shareUtils';
import { WorkflowShareModal } from './WorkflowShareModal';
import './WorkflowEditor.css';

function projectName(project = {}) {
  return String(project.name || '未命名画布');
}

function visibilityLabel(visibility = 'private') {
  if (visibility === 'public') return '公开';
  if (visibility === 'semi_public') return '半公开';
  return '私有';
}

export function WorkflowEditor({
  project,
  readOnly = false,
  onBack,
  onFork,
  onProjectChange,
}) {
  const [title, setTitle] = useState(projectName(project));
  const [editingTitle, setEditingTitle] = useState(false);
  const [saving, setSaving] = useState(false);
  const [forking, setForking] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [copiedNotice, setCopiedNotice] = useState('');
  const [error, setError] = useState('');
  const canvasRef = useRef(null);
  const titleRef = useRef(title);
  const initialGraph = useRef(toReactFlowGraph());

  useEffect(() => {
    const next = projectName(project);
    titleRef.current = next;
    setTitle(next);
  }, [project]);

  const saveProject = useCallback(async (nodes, edges) => {
    if (readOnly) return null;
    writeReactFlowGraph(nodes || [], edges || []);
    setSaving(true);
    setError('');
    try {
      if (typeof window.saveWorkflowCanvasNow !== 'function') {
        throw new Error('画布保存桥接未加载');
      }
      const saved = await window.saveWorkflowCanvasNow({ name: titleRef.current });
      onProjectChange?.({ ...project, ...(saved || {}), name: saved?.name || titleRef.current });
      return saved;
    } catch (saveError) {
      setError(saveError.message || String(saveError));
      throw saveError;
    } finally {
      setSaving(false);
    }
  }, [onProjectChange, project, readOnly]);

  const manualSave = useCallback(async () => {
    if (readOnly) return null;
    const graph = typeof window.WorkflowReactCanvas?.getGraph === 'function'
      ? window.WorkflowReactCanvas.getGraph()
      : null;
    return saveProject(graph?.nodes || [], graph?.edges || []);
  }, [readOnly, saveProject]);

  const commitTitle = useCallback(async () => {
    if (readOnly) {
      setEditingTitle(false);
      return;
    }
    const next = title.trim().slice(0, 80) || projectName(project);
    titleRef.current = next;
    setTitle(next);
    setEditingTitle(false);
    const graph = typeof window.WorkflowReactCanvas?.getGraph === 'function'
      ? window.WorkflowReactCanvas.getGraph()
      : null;
    await saveProject(graph?.nodes || [], graph?.edges || []);
  }, [project, readOnly, saveProject, title]);

  const handleBack = useCallback(async () => {
    if (!readOnly) {
      try {
        await manualSave();
      } catch (_) {
        return;
      }
    }
    onBack?.();
  }, [manualSave, onBack, readOnly]);

  const handleFork = useCallback(async () => {
    if (!onFork || forking) return;
    setForking(true);
    setError('');
    try {
      await onFork(project);
    } catch (forkError) {
      setError(forkError.message || String(forkError));
    } finally {
      setForking(false);
    }
  }, [forking, onFork, project]);

  const handleCopyShareLink = useCallback(async () => {
    const url = buildWorkflowShareUrl(project?.id);
    const ok = await copyTextToClipboard(url);
    setCopiedNotice(ok ? '已复制分享链接' : '复制失败');
    window.setTimeout(() => setCopiedNotice(''), 2200);
  }, [project?.id]);

  const visibility = String(project?.visibility || 'private');

  return ReactDOM.createPortal(
    <section className={`CanvasEditor-container WorkflowEditor${readOnly ? ' is-readonly' : ''}`} aria-label="画布编辑器">
      <div className="CanvasEditor-toolbar canvas-editor-header">
        <div className="CanvasEditor-toolbar-left">
          <button type="button" className="CanvasEditor-back-button" onClick={handleBack}>
            ← 返回
          </button>
          <div className="CanvasEditor-title-wrapper">
            {!readOnly && editingTitle ? (
              <input
                autoFocus
                className="CanvasEditor-title-input"
                value={title}
                maxLength={80}
                onChange={(event) => setTitle(event.target.value)}
                onBlur={commitTitle}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') commitTitle();
                  if (event.key === 'Escape') {
                    setTitle(titleRef.current);
                    setEditingTitle(false);
                  }
                }}
              />
            ) : (
              <>
                <h2 className="CanvasEditor-title">{title}</h2>
                {!readOnly ? (
                  <button
                    type="button"
                    className="CanvasEditor-edit-button"
                    title="编辑标题"
                    onClick={() => setEditingTitle(true)}
                  >
                    ✎
                  </button>
                ) : (
                  <span className="CanvasEditor-readonly-badge">
                    {visibility === 'semi_public' ? '已解锁模版 · 只读' : '公开模版 · 只读'}
                    {project?.ownerName ? ` · 作者 ${project.ownerName}` : ''}
                  </span>
                )}
              </>
            )}
          </div>
        </div>
        <div className="CanvasEditor-toolbar-right">
          {copiedNotice ? <span className="CanvasEditor-saving">{copiedNotice}</span> : null}
          {!readOnly ? (
            <>
              {saving ? <span className="CanvasEditor-saving">保存中...</span> : null}
              <button
                type="button"
                className={`CanvasEditor-share-button is-${visibility}`}
                onClick={() => setShareModalOpen(true)}
                disabled={saving}
                title="设置画布公开状态与专属邀请码"
              >
                <i className={`bi ${visibility === 'public' ? 'bi-globe2' : visibility === 'semi_public' ? 'bi-key' : 'bi-lock'}`} aria-hidden="true" />
                <span>公开 / 邀请</span>
                <em className="CanvasEditor-visibility-pill">{visibilityLabel(visibility)}</em>
              </button>
              <button type="button" className="CanvasEditor-save-button" onClick={manualSave} disabled={saving}>
                {saving ? '保存中...' : '保存'}
              </button>
            </>
          ) : (
            <>
              <button type="button" className="CanvasEditor-share-button" onClick={handleCopyShareLink}>
                <i className="bi bi-link-45deg" aria-hidden="true" />
                <span>复制链接</span>
              </button>
              <button type="button" className="CanvasEditor-save-button" onClick={handleFork} disabled={forking}>
                {forking ? '复制中...' : '复制到我的画布'}
              </button>
            </>
          )}
        </div>
      </div>

      {error ? <div className="WorkflowEditor-error" role="alert">{error}</div> : null}

      <div className="CanvasEditor-canvas" ref={canvasRef}>
        <Canvas
          key={`${project.id}:${readOnly ? 'ro' : 'rw'}`}
          initialNodes={initialGraph.current.nodes}
          initialEdges={initialGraph.current.edges}
          readOnly={readOnly}
          onSave={readOnly ? undefined : saveProject}
          onGraphChange={readOnly ? undefined : writeReactFlowGraph}
          onDeleteNode={readOnly ? undefined : (nodeId) => {
            if (typeof window.removeWorkflowNode !== 'function') return false;
            const removed = Boolean(window.removeWorkflowNode(nodeId));
            if (removed) notifyNodeChanged('');
            return removed;
          }}
        />
      </div>

      {!readOnly && shareModalOpen ? (
        <WorkflowShareModal
          project={project}
          onClose={() => setShareModalOpen(false)}
          onUpdated={(updated) => {
            onProjectChange?.({ ...project, ...(updated || {}) });
          }}
        />
      ) : null}
    </section>,
    document.body,
  );
}

export default WorkflowEditor;
