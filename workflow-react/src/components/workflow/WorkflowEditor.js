import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { Canvas } from '../canvas/Canvas';
import { toReactFlowGraph, writeReactFlowGraph, notifyNodeChanged } from '../../site/SiteBridge';
import { requestCanvasJson } from './canvasApi';
import './WorkflowEditor.css';

function projectName(project = {}) {
  return String(project.name || '未命名画布');
}

export function WorkflowEditor({ project, onBack, onCreate, onProjectChange }) {
  const [title, setTitle] = useState(projectName(project));
  const [editingTitle, setEditingTitle] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState('saved');
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
    writeReactFlowGraph(nodes || [], edges || []);
    const workflow = typeof window.ensureWorkflowState === 'function'
      ? window.ensureWorkflowState()
      : toReactFlowGraph();
    setSaving(true);
    setSaveState('saving');
    setError('');
    try {
      const payload = await requestCanvasJson(`/api/workflow/canvases/${encodeURIComponent(project.id)}`, {
        method: 'PUT',
        body: { name: titleRef.current, workflow },
      });
      const saved = payload.canvas || {};
      setSaveState('saved');
      onProjectChange?.({ ...project, ...saved, name: saved.name || titleRef.current });
    } catch (saveError) {
      setSaveState('error');
      setError(saveError.message || String(saveError));
      throw saveError;
    } finally {
      setSaving(false);
    }
  }, [onProjectChange, project]);

  const manualSave = useCallback(async () => {
    const graph = typeof window.WorkflowReactCanvas?.getGraph === 'function'
      ? window.WorkflowReactCanvas.getGraph()
      : null;
    return saveProject(graph?.nodes || [], graph?.edges || []);
  }, [saveProject]);

  const commitTitle = useCallback(async () => {
    const next = title.trim().slice(0, 80) || projectName(project);
    titleRef.current = next;
    setTitle(next);
    setEditingTitle(false);
    const graph = typeof window.WorkflowReactCanvas?.getGraph === 'function'
      ? window.WorkflowReactCanvas.getGraph()
      : null;
    await saveProject(graph?.nodes || [], graph?.edges || []);
  }, [project, saveProject, title]);

  const handleBack = useCallback(async () => {
    try {
      await manualSave();
    } catch (_) {
      return;
    }
    onBack?.();
  }, [manualSave, onBack]);

  return ReactDOM.createPortal(
    <section className="CanvasEditor-container WorkflowEditor" aria-label="画布编辑器">
      <div className="CanvasEditor-toolbar canvas-editor-header">
        <div className="CanvasEditor-toolbar-left">
          <button type="button" className="CanvasEditor-back-button" onClick={handleBack}>
            ← 返回
          </button>
          <div className="CanvasEditor-title-wrapper">
            {editingTitle ? (
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
                <button
                  type="button"
                  className="CanvasEditor-edit-button"
                  title="编辑标题"
                  onClick={() => setEditingTitle(true)}
                >
                  ✎
                </button>
              </>
            )}
          </div>
        </div>
        <div className="CanvasEditor-toolbar-right">
          {saving ? <span className="CanvasEditor-saving">保存中...</span> : null}
          <button type="button" className="CanvasEditor-save-button" onClick={manualSave} disabled={saving}>
            {saving ? '保存中...' : '保存'}
          </button>
          <button type="button" className="CanvasEditor-new-button" onClick={onCreate} disabled={saving}>
            ＋ 新建
          </button>
        </div>
      </div>

      {error ? <div className="WorkflowEditor-error" role="alert">{error}</div> : null}

      <div className="CanvasEditor-canvas" ref={canvasRef}>
        <Canvas
          key={project.id}
          initialNodes={initialGraph.current.nodes}
          initialEdges={initialGraph.current.edges}
          onSave={saveProject}
          onGraphChange={writeReactFlowGraph}
          onDeleteNode={(nodeId) => {
            if (typeof window.removeWorkflowNode !== 'function') return false;
            const removed = Boolean(window.removeWorkflowNode(nodeId));
            if (removed) notifyNodeChanged('');
            return removed;
          }}
        />
      </div>
    </section>,
    document.body
  );
}

export default WorkflowEditor;
