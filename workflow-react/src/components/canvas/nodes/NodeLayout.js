/**
 * 站点生成节点外壳。交互沿用 React Flow，视觉只使用本站画布样式。
 */
import React, { memo } from 'react';
import { Handle, Position, useReactFlow } from '@xyflow/react';
import { selectSiteNode } from '../../../site/SiteBridge';

export const NodeLayout = memo(({
  id,
  type,
  title,
  children,
  showInputHandle = true,
  showOutputHandle = true,
  inputHandleId,
  isValidConnection,
  selected = false,
}) => {
  const { deleteElements } = useReactFlow();
  const removeNode = (event) => {
    event.preventDefault();
    event.stopPropagation();
    // React Flow is a controlled view over the site's business workflow.
    // Remove the persisted node first so the next bridge sync cannot restore
    // it, then resync the canvas (including its connected edges).
    if (typeof window.removeWorkflowNode === 'function' && window.removeWorkflowNode(id)) {
      window.dispatchEvent(new CustomEvent('workflow-react-node-change', { detail: { nodeId: id } }));
      window.dispatchEvent(new CustomEvent('workflow-react:sync'));
      const selectedId = typeof window.activeWorkflowSelectedNodeId === 'function'
        ? String(window.activeWorkflowSelectedNodeId() || '')
        : '';
      if (!selectedId) {
        window.dispatchEvent(new CustomEvent('workflow-react:select-node', { detail: { nodeId: '' } }));
      }
      return;
    }
    deleteElements({ nodes: [{ id }] }).catch((error) => {
      console.warn('Unable to delete canvas node', error);
    });
  };

  return (
    <div
      className={`site-generation-card${selected ? ' is-selected' : ''}`}
      data-node-id={id}
      data-node-type={type}
      onPointerDownCapture={() => {
        selectSiteNode(id);
      }}
    >
      {showInputHandle && (
        <Handle
          type="target"
          position={Position.Left}
          id={inputHandleId}
          className="site-generation-handle site-generation-handle-input"
          isValidConnection={isValidConnection}
        />
      )}

      <div className="site-generation-card-head site-generation-drag-handle">
        <span className="site-generation-card-icon">
          <i className={`bi ${type === 'unifiedVideoGen' ? 'bi-camera-video' : 'bi-image'}`} />
        </span>
        <span>{title}</span>
        <button
          type="button"
          className="nodrag nopan site-generation-delete"
          aria-label="删除节点"
          title="删除节点"
          onPointerDown={removeNode}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          <i className="bi bi-trash3" aria-hidden="true" />
        </button>
      </div>

      <div className="site-generation-card-content">{children}</div>

      {showOutputHandle && (
        <Handle
          type="source"
          position={Position.Right}
          id="output"
          className="site-generation-handle site-generation-handle-output"
          isValidConnection={isValidConnection}
        />
      )}
    </div>
  );
});

NodeLayout.displayName = 'NodeLayout';
