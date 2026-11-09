import React from 'react';
import { BaseEdge, getBezierPath } from '@xyflow/react';

import './ConnectionGuideEdge.css';

/**
 * 保留 React Flow 默认贝塞尔连线，并在节点选中时叠加方向引导动画。
 */
export const ConnectionGuideEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  style,
  markerStart,
  markerEnd,
  interactionWidth,
  label,
  labelStyle,
  labelShowBg,
  labelBgStyle,
  labelBgPadding,
  labelBgBorderRadius,
  pathOptions,
}) => {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    curvature: pathOptions?.curvature,
  });
  const isGuideActive = Boolean(data?.connectionGuideActive);

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        labelX={labelX}
        labelY={labelY}
        label={label}
        labelStyle={labelStyle}
        labelShowBg={labelShowBg}
        labelBgStyle={labelBgStyle}
        labelBgPadding={labelBgPadding}
        labelBgBorderRadius={labelBgBorderRadius}
        style={style}
        markerStart={markerStart}
        markerEnd={markerEnd}
        interactionWidth={interactionWidth}
      />

      {isGuideActive && (
        <g className="ConnectionGuideEdge-guide-layer" aria-hidden="true">
          <path className="ConnectionGuideEdge-highlight" d={edgePath} />
          <circle className="ConnectionGuideEdge-particle" r="4.5">
            <animateMotion
              path={edgePath}
              dur="1.8s"
              repeatCount="indefinite"
            />
          </circle>
        </g>
      )}
    </>
  );
};
