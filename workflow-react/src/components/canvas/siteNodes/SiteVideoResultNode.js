import React, { useEffect, useMemo } from 'react';
import { NodeLayout } from '../nodes/NodeLayout';
import { useSiteNode } from './useSiteNode';
import { GenerationResultMedia } from './GenerationResultMedia';

function uniqueResultVideos(values = []) {
  const seen = new Set();
  return values.map((value) => String(value || '').trim()).filter((value) => {
    if (!value) return false;
    let key = value;
    try {
      key = new URL(value, 'https://canvas.local').pathname || value;
    } catch {
      key = value.split(/[?#]/, 1)[0];
    }
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function resultVideos(node = {}, nodeId = '') {
  const sourceNode = (typeof window.workflowNodeById === 'function' && window.workflowNodeById(nodeId)) || node;
  if (!sourceNode?.data) return [];
  if (typeof window.workflowNodeOwnResultVideos === 'function') return window.workflowNodeOwnResultVideos(sourceNode);
  const data = sourceNode.data || {};
  const record = data.record || {};
  const direct = [...(data.resultVideoUrls || []), data.resultVideoUrl];
  const durable = [...(record.cdnVideoUrls || []), record.cdnVideoUrl, record.localVideoUrl];
  const provider = [
    ...(record.remoteVideoUrls || []),
    ...(record.providerVideoUrls || []),
    record.remoteVideoUrl,
    record.providerVideoUrl,
    record.upstreamVideoUrl,
    record.videoUrl,
    data.videoUrl,
  ];
  // `videoUrls` on a composed result are input clips. Never render them as outputs.
  const durableUrls = uniqueResultVideos(durable);
  if (durableUrls.length) return durableUrls;
  const directUrls = uniqueResultVideos(direct);
  if (directUrls.length) return directUrls;
  return uniqueResultVideos(provider);
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
