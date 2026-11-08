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
  canDownload = false,
}) => {
  const { deleteElements } = useReactFlow();
  const [downloading, setDownloading] = React.useState(false);
  const downloadNode = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!canDownload || downloading) return;
    setDownloading(true);
    try {
      await window.downloadWorkflowNodeResult?.(id);
    } finally {
      setDownloading(false);
    }
  };
  const removeNode = (event) => {
    event.preventDefault();
    event.stopPropagation();
    // React Flow is a controlled view over the site's business workflow.
    // Remove the persisted node first so the next bridge sync cannot restore
    // it, then resync the canvas (including its connected edges).
    if (typeof window.removeWorkflowNode === 'function' && window.removeWorkflowNode(id)) {
      // Sync the controlled React Flow graph before notifying the removed
      // node's hook. Otherwise that hook briefly reads null and a result query
      // can throw, unmounting the whole editor.
      window.dispatchEvent(new CustomEvent('workflow-react:sync'));
      window.dispatchEvent(new CustomEvent('workflow-react-node-change', { detail: { nodeId: id } }));
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
        <span className="site-generation-card-actions">
          <button
            type="button"
            className="nodrag nopan site-generation-download"
            aria-label="下载节点生成内容"
            title={canDownload ? '下载节点生成内容' : '暂无可下载内容'}
            disabled={!canDownload || downloading}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={downloadNode}
          >
            <i className={`bi ${downloading ? 'bi-arrow-repeat' : 'bi-download'}`} aria-hidden="true" />
          </button>
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
        </span>
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
