/**
 * 站点生成节点外壳。交互沿用 React Flow，视觉只使用本站画布样式。
 */
import React, { memo } from 'react';
import { Handle, Position, useReactFlow } from '@xyflow/react';

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
    deleteElements({ nodes: [{ id }] }).catch((error) => {
      console.warn('Unable to delete canvas node', error);
    });
  };

  return (
    <div className={`site-generation-card${selected ? ' is-selected' : ''}`} data-node-id={id} data-node-type={type}>
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
          onPointerDown={(event) => event.stopPropagation()}
          onClick={removeNode}
        >
          ×
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
