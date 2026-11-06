/**
 * 站点生成节点外壳。交互沿用 React Flow，视觉只使用本站画布样式。
 */
import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';

export const NodeLayout = memo(({
  id,
  type,
  title,
  children,
  showInputHandle = true,
  showOutputHandle = true,
  inputHandleId,
  isValidConnection,
}) => {
  return (
    <div className="site-generation-card" data-node-id={id} data-node-type={type}>
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
