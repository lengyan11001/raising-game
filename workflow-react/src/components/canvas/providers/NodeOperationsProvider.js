/**
 * 节点操作上下文提供者
 */
import React, { createContext, useContext, useCallback } from 'react';
import { useReactFlow, useUpdateNodeInternals, addEdge } from '@xyflow/react';
import { nanoid } from 'nanoid';
import { toast } from 'react-toastify';

// 节点 Handle 连接数量限制配置
const NODE_HANDLE_LIMITS = {
  gptImage2: {
    prompt: 1,
    image: 6,
  },
  nanoBanana2: {
    prompt: 1,
    image: 14,
  },
  minimaxH3Video: {
    prompt: 1,
    image: 9,
    video: 3,
  },
  klingO3ReferenceVideo: {
    prompt: 1,
    image: 4,
    video: 4,
  },
  geminiOmniFlashVideo: {
    prompt: 1,
    image: 5,
  },
  superSeed2LiteVideo: {
    prompt: 1,
    image: 30,
    video: 10,
    audio: 10,
  },
  googleBanana: {
    prompt: 1,    // 文本输入：1个
    image: 10,    // 图片输入：10个
  },
  minimaxImage: {
    prompt: 1,
    image: 5,
  },
  imengImageGen: {
    prompt: 1,
    image: 4,
  },
  klingVideo: {
    prompt: 1,
    image: 1,
  },
  hailuo23Video: {
    prompt: 1,
    image: 1,
  },
  doubaoVideo: {
    prompt: 1,
    image: 1,
  },
  veo3Video: {
    prompt: 1,
    image: 1,
  },
  sora2Video: {
    prompt: 1,
    image: 1,
  },
  klingLipSync: {
    prompt: 1,
    video: 1,
    audio: 1,
  },
  textToImage: {
    prompt: 1,
  },
  referenceToImage: {
    prompt: 1,
    image: 5,
  },
  videoFaceSwap: {
    face: 1,      // 人脸图片：1个
    video: 1,     // 视频输入：1个
  },
  textToAudio: {
    prompt: 1,    // 文本输入：1个
  },
  hailuoMusic: {
    prompt: 1,    // 提示词：1个
    lyrics: 1,    // 歌词：1个
  },
  sunoMusic: {
    lyrics: 1,    // 歌词：1个
  },
};

const NodeOperationsContext = createContext(undefined);
const MAX_HANDLE_READY_FRAMES = 30;

/**
 * 智能计算新节点的最佳位置
 * 避免与现有节点重叠，考虑画布边界
 * @param {Object} targetNode - 目标节点
 * @param {string} nodeType - 新节点类型
 * @param {Array} existingNodes - 现有节点列表
 * @returns {Object} - 最佳位置 {x, y}
 */
const calculateOptimalPosition = (targetNode, nodeType, existingNodes) => {
  // 节点尺寸估算（根据类型）
  const nodeSizes = {
    promptInput: { width: 300, height: 200 },
    imageReference: { width: 280, height: 320 },
    videoReference: { width: 300, height: 200 },
    audioReference: { width: 300, height: 180 },
  };

  const newNodeSize = nodeSizes[nodeType] || { width: 300, height: 200 };
  const spacing = 50; // 节点之间的最小间距
  const horizontalOffset = 350; // 水平偏移距离

  // 首选位置：目标节点左侧
  let candidatePositions = [
    {
      x: targetNode.position.x - horizontalOffset,
      y: targetNode.position.y,
      priority: 1, // 最高优先级
    },
  ];

  // 备选位置1：左侧上方
  candidatePositions.push({
    x: targetNode.position.x - horizontalOffset,
    y: targetNode.position.y - 150,
    priority: 2,
  });

  // 备选位置2：左侧下方
  candidatePositions.push({
    x: targetNode.position.x - horizontalOffset,
    y: targetNode.position.y + 150,
    priority: 3,
  });

  // 备选位置3：左侧更远处（如果左侧拥挤）
  candidatePositions.push({
    x: targetNode.position.x - horizontalOffset - 200,
    y: targetNode.position.y,
    priority: 4,
  });

  // 检测位置是否与现有节点重叠
  const isOverlapping = (pos, size) => {
    return existingNodes.some(node => {
      // 跳过目标节点本身
      if (node.id === targetNode.id) return false;

      // 估算现有节点的尺寸（使用通用尺寸）
      const existingSize = { width: 320, height: 200 };

      // 检测矩形是否重叠（带间距）
      const overlapX =
        pos.x < node.position.x + existingSize.width + spacing &&
        pos.x + size.width + spacing > node.position.x;

      const overlapY =
        pos.y < node.position.y + existingSize.height + spacing &&
        pos.y + size.height + spacing > node.position.y;

      return overlapX && overlapY;
    });
  };

  // 按优先级排序候选位置
  candidatePositions.sort((a, b) => a.priority - b.priority);

  // 找到第一个不重叠的位置
  for (const candidate of candidatePositions) {
    if (!isOverlapping(candidate, newNodeSize)) {
      return { x: candidate.x, y: candidate.y };
    }
  }

  // 如果所有候选位置都重叠，使用智能偏移策略
  // 在首选位置基础上，逐步向下偏移直到找到空位
  let bestPosition = {
    x: targetNode.position.x - horizontalOffset,
    y: targetNode.position.y,
  };

  let verticalOffset = 0;
  const maxAttempts = 20;
  let attempts = 0;

  while (isOverlapping(bestPosition, newNodeSize) && attempts < maxAttempts) {
    verticalOffset += 100; // 每次向下偏移100px

    // 交替尝试向上和向下
    if (attempts % 2 === 0) {
      bestPosition.y = targetNode.position.y + verticalOffset;
    } else {
      bestPosition.y = targetNode.position.y - verticalOffset;
    }

    attempts++;
  }

  // 如果还是重叠，就在更远的左侧位置
  if (isOverlapping(bestPosition, newNodeSize)) {
    bestPosition.x = targetNode.position.x - horizontalOffset - 250;
    bestPosition.y = targetNode.position.y;
  }

  return bestPosition;
};

export const NodeOperationsProvider = ({ children }) => {
  const updateNodeInternals = useUpdateNodeInternals();
  const {
    getNodes,
    setNodes,
    setEdges,
    getEdges,
    getNode,
    getInternalNode,
    screenToFlowPosition,
    getViewport,
  } = useReactFlow();

  /**
   * 添加新节点
   */
  const addNode = useCallback((
    type,
    options = {}
  ) => {
    const id = nanoid();

    // 如果没有指定位置，使用视口中心
    let position = options?.position;
    if (!position) {
      const viewport = getViewport();
      position = screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      });
    }

    const newNode = {
      id,
      type,
      position,
      data: options?.data || {},
      origin: [0, 0.5],
    };

    setNodes((nodes) => [...nodes, newNode]);
    return id;
  }, [setNodes, screenToFlowPosition, getViewport]);

  /**
   * 复制节点
   */
  const duplicateNode = useCallback((nodeId) => {
    const nodes = getNodes();
    const nodeToDuplicate = nodes.find((node) => node.id === nodeId);

    if (!nodeToDuplicate) {
      return;
    }

    const newNode = {
      ...nodeToDuplicate,
      id: nanoid(),
      position: {
        x: nodeToDuplicate.position.x + 50,
        y: nodeToDuplicate.position.y + 50,
      },
      selected: false,
    };

    setNodes((nodes) => [...nodes, newNode]);
  }, [getNodes, setNodes]);

  /**
   * 统一的添加节点和连线方法
   * 等待新增节点的连接点完成测量后再添加边，避免边存在但无法计算路径。
   * @param {Array} nodesToAdd - 要添加的节点数组
   * @param {Array} edgesToAdd - 要添加的边数组（可选）
   * @returns {Promise} - 返回Promise，确保操作完成
   */
  const addNodesWithEdges = useCallback((nodesToAdd, edgesToAdd = []) => {
    return new Promise((resolve) => {
      // 先添加节点到受控状态
      setNodes((nds) => [...nds, ...nodesToAdd]);

      // 如果有边要添加，等待新增端点的 Handle 坐标可用。
      if (edgesToAdd.length > 0) {
        const addedNodeIdList = nodesToAdd.map(node => node.id);
        const addedNodeIds = new Set(addedNodeIdList);
        const hasRequiredHandle = (nodeId, handleType, handleId) => {
          if (!addedNodeIds.has(nodeId)) return true;

          const handles = getInternalNode(nodeId)?.internals?.handleBounds?.[handleType];
          if (!Array.isArray(handles) || handles.length === 0) return false;
          return handleId == null || handles.some(handle => handle.id === handleId);
        };
        const areEdgeEndpointsReady = () => edgesToAdd.every(edge => (
          hasRequiredHandle(edge.source, 'source', edge.sourceHandle)
          && hasRequiredHandle(edge.target, 'target', edge.targetHandle)
        ));
        const commitEdges = () => {
          setEdges((eds) => {
            let updatedEdges = eds;
            edgesToAdd.forEach(edge => {
              updatedEdges = addEdge(edge, updatedEdges);
            });
            return updatedEdges;
          });
          resolve();
        };
        const waitForHandles = (attempt = 0) => {
          if (areEdgeEndpointsReady() || attempt >= MAX_HANDLE_READY_FRAMES) {
            commitEdges();
            return;
          }

          // 新节点已进入受控 state，但 React Flow 可能尚未收集其 Handle 坐标。
          // 主动刷新 internals，避免边只能等到超时甚至页面刷新后才渲染。
          updateNodeInternals(addedNodeIdList);
          requestAnimationFrame(() => waitForHandles(attempt + 1));
        };

        requestAnimationFrame(() => waitForHandles());
      } else {
        resolve();
      }
    });
  }, [getInternalNode, setNodes, setEdges, updateNodeInternals]);

  /**
   * 智能创建节点并自动连接
   * 根据 Handle 类型创建对应的输入节点，并检查连接数量限制
   * @param {string} targetNodeId - 目标节点（被点击的节点）的ID
   * @param {string} targetNodeType - 目标节点的类型
   * @param {string} targetHandleId - 被点击的Handle ID（如'prompt'或'image'）
   * @param {string} targetHandleType - Handle类型（'text'或'image'或'video'或'audio'）
   * @param {number} maxConnections - 最大连接数（可选，从配置中自动获取）
   * @returns {Promise<string|null>} - 返回新创建的节点ID，如果创建失败返回null
   */
  const createNodeAndConnect = useCallback(async (
    targetNodeId,
    targetNodeType,
    targetHandleId,
    targetHandleType,
    maxConnections = null
  ) => {
    try {
      // 1. 获取目标节点
      const targetNode = getNode(targetNodeId);
      if (!targetNode) {
        toast.error('目标节点不存在');
        return null;
      }

      // 2. 确定最大连接数
      let limit = maxConnections;
      if (!limit) {
        // 从配置中获取
        const nodeLimits = NODE_HANDLE_LIMITS[targetNodeType];
        if (nodeLimits && nodeLimits[targetHandleId] !== undefined) {
          limit = nodeLimits[targetHandleId];
        } else {
          // 默认限制
          limit = targetHandleType === 'text' ? 1 : 5;
        }
      }

      // 3. 检查当前连接数
      const edges = getEdges();
      const currentConnections = edges.filter(
        edge => edge.target === targetNodeId && edge.targetHandle === targetHandleId
      );

      if (currentConnections.length >= limit) {
        if (targetHandleType === 'text') {
          toast.warning('文本输入已连接，请使用已有节点');
        } else if (targetHandleType === 'image') {
          toast.warning(`最多支持${limit}张参考图片`);
        } else if (targetHandleType === 'video') {
          toast.warning(`最多支持${limit}个视频输入`);
        } else if (targetHandleType === 'audio') {
          toast.warning(`最多支持${limit}个音频输入`);
        } else {
          toast.warning(`该接入点最多支持${limit}个连接`);
        }
        return null;
      }

      // 4. 根据类型创建节点
      let nodeType, nodeData, nodeTypeName;

      switch (targetHandleType) {
        case 'text':
          nodeType = 'promptInput';
          nodeData = { prompt: '' };
          nodeTypeName = '文本输入';
          break;
        case 'image':
          nodeType = 'imageReference';
          nodeData = { imageUrl: '' };
          nodeTypeName = '图片参考';
          break;
        case 'video':
          nodeType = 'videoReference';
          nodeData = { videoUrl: '' };
          nodeTypeName = '视频参考';
          break;
        case 'audio':
          nodeType = 'audioReference';
          nodeData = { audioUrl: '' };
          nodeTypeName = '音频参考';
          break;
        default:
          toast.error('不支持的Handle类型');
          return null;
      }

      // 5. 智能计算新节点位置
      const newNodePosition = calculateOptimalPosition(
        targetNode,
        nodeType,
        getNodes()
      );

      // 6. 创建节点对象
      const newNodeId = nanoid();
      const newNode = {
        id: newNodeId,
        type: nodeType,
        position: newNodePosition,
        data: nodeData,
      };

      // 7. 创建连接边
      const newEdge = {
        id: nanoid(),
        source: newNodeId,
        target: targetNodeId,
        targetHandle: targetHandleId,
        type: 'default',
      };

      // 8. 添加节点和连接
      await addNodesWithEdges([newNode], [newEdge]);

      // 9. 成功提示
      toast.success(`已创建${nodeTypeName}节点并自动连接`);

      return newNodeId;
    } catch (error) {
      console.error('创建节点并连接失败:', error);
      toast.error('创建节点失败，请重试');
      return null;
    }
  }, [getNode, getEdges, addNodesWithEdges]);

  return (
    <NodeOperationsContext.Provider value={{
      addNode,
      duplicateNode,
      addNodesWithEdges,
      createNodeAndConnect,
    }}>
      {children}
    </NodeOperationsContext.Provider>
  );
};

export const useNodeOperations = () => {
  const context = useContext(NodeOperationsContext);
  if (!context) {
    throw new Error('useNodeOperations must be used within a NodeOperationsProvider');
  }
  return context;
};
