/**
 * 底部工具栏 - 移植自 canvas_web 的 Toolbar 交互。
 * 只保留本站业务需要的图片生成与视频生成两个工具。
 */
import React, { useRef, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import './Toolbar.css';

const TOOLS = [
  {
    id: 'add-image',
    label: '图片生成',
    icon: 'bi-image',
    description: '添加图片生成节点',
  },
  {
    id: 'add-video',
    label: '视频生成',
    icon: 'bi-camera-video',
    description: '添加视频生成节点',
  },
];

export const Toolbar = ({ disabled = false }) => {
  const [dragging, setDragging] = useState('');
  const addTimerRef = useRef(null);
  const { screenToFlowPosition } = useReactFlow();

  const addAtViewportCenter = (action) => {
    if (disabled || typeof window.addWorkflowNodeAt !== 'function') return;
    const center = screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });
    window.addWorkflowNodeAt(action, center);
  };

  const handleClick = (tool) => {
    clearTimeout(addTimerRef.current);
    addTimerRef.current = window.setTimeout(() => addAtViewportCenter(tool.id), 160);
  };

  return (
    <div className="Toolbar-wrapper">
      <div className="Toolbar-container" role="toolbar" aria-label="添加画布节点">
        {TOOLS.map((tool) => (
          <button
            key={tool.id}
            type="button"
            className={`Toolbar-button ${dragging === tool.id ? 'is-dragging' : ''}`}
            title={`${tool.description}；点击从视口中心添加，拖到画布指定位置`}
            draggable={!disabled}
            disabled={disabled}
            onDragStart={(event) => {
              setDragging(tool.id);
              event.dataTransfer.setData('application/reactflow', tool.id);
              event.dataTransfer.setData('application/x-workflow-node', tool.id);
              event.dataTransfer.effectAllowed = 'copy';
            }}
            onDragEnd={() => setDragging('')}
            onClick={() => handleClick(tool)}
          >
            <span className="Toolbar-icon"><i className={`bi ${tool.icon}`} /></span>
            <span className="Toolbar-label">{tool.label}</span>
            <span className="Toolbar-plus">＋</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default Toolbar;
