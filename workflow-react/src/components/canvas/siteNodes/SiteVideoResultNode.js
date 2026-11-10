import React, { useEffect, useMemo } from 'react';
import { NodeLayout } from '../nodes/NodeLayout';
import { useSiteNode } from './useSiteNode';
import { GenerationResultMedia } from './GenerationResultMedia';

function resultVideos(node = {}, nodeId = '') {
  const sourceNode = (typeof window.workflowNodeById === 'function' && window.workflowNodeById(nodeId)) || node;
  if (!sourceNode?.data) return [];
  if (typeof window.workflowNodeOwnResultVideos === 'function') return window.workflowNodeOwnResultVideos(sourceNode);
  const data = sourceNode.data || {};
  return [...new Set([...(data.resultVideoUrls || []), ...(data.videoUrls || []), data.resultVideoUrl, data.videoUrl].filter(Boolean))];
}

export function SiteVideoResultNode({ id, selected = false }) {
  const { node } = useSiteNode(id);
  const data = node?.data || {};
  const results = useMemo(() => resultVideos(node, id), [node, id]);
  if (!node?.data) return null;
  const busy = ['submitting', 'preparing', 'processing', 'running', 'queued'].includes(data.status);
  const status = results.length ? 'succeeded' : data.status;
  useEffect(() => {
    if (!node?.data?.generationRunPlaceholder || !data.taskId) return;
    if (['succeeded', 'failed', 'cancelled', 'canceled'].includes(String(data.status || '').toLowerCase())) return;
    if (typeof window.resumeWorkflowResultNode !== 'function') return;
    const timer = window.setTimeout(() => window.resumeWorkflowResultNode(id), 0);
    return () => window.clearTimeout(timer);
  }, [id, node?.data?.generationRunPlaceholder, data.taskId, data.status]);

  return (
    <NodeLayout
      id={id}
      type={node.type}
      title={node.title || '视频结果'}
      showInputHandle
      showOutputHandle
      selected={selected}
      canDownload={results.length > 0}
      className="site-result-card is-video-result"
    >
      <div className="site-result-node is-video">
        <div className="site-result-node-meta">
          <span><i className="bi bi-stars" /> 生成结果</span>
          <small>{busy ? '生成中' : data.source === 'upload' ? '上传素材' : results.length ? '已完成' : '等待生成'}</small>
        </div>
        <div className="site-result-node-media">
          <GenerationResultMedia
            kind="video"
            urls={results}
            poster={data.posterUrl || ''}
            status={status}
            error={results.length ? '' : data.error}
            sourceNodeId={id}
            uploadProgress={data.uploadProgress}
            uploadFileName={data.uploadFileName}
          />
        </div>
      </div>
    </NodeLayout>
  );
}

SiteVideoResultNode.displayName = 'SiteVideoResultNode';
