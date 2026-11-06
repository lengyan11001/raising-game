export const CONNECTION_GUIDE_EDGE_TYPE = 'connectionGuide';

/**
 * 为 React Flow 派生仅用于展示的连线数据。
 * 原始 edges 不会被修改，因此引导动画状态不会进入画布快照。
 */
export const buildConnectionGuideEdges = (edges = [], nodes = []) => {
  const selectedNodeIds = new Set(
    nodes
      .filter((node) => node.selected)
      .map((node) => node.id)
  );

  return edges.map((edge) => {
    // 当前项目只创建 default 边；保留未知边类型，避免影响旧快照中的特殊连线。
    if (edge.type && !['default', CONNECTION_GUIDE_EDGE_TYPE].includes(edge.type)) {
      return edge;
    }

    const isActive = selectedNodeIds.has(edge.source) || selectedNodeIds.has(edge.target);

    return {
      ...edge,
      type: CONNECTION_GUIDE_EDGE_TYPE,
      data: {
        ...edge.data,
        connectionGuideActive: isActive,
      },
    };
  });
};
