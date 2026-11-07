import React, { useMemo, useState } from 'react';
import { NodeLayout } from '../nodes/NodeLayout';
import { useSiteNode, optionsFrom, selectedOption } from './useSiteNode';
import { GenerationResultMedia } from './GenerationResultMedia';
import { SiteNodeUpload } from './SiteNodeUpload';
import { PromptMentionTextarea } from './PromptMentionTextarea';

function videoResults(node = {}, nodeId = '') {
  const sourceNode = (typeof window.workflowNodeById === 'function' && window.workflowNodeById(nodeId)) || node;
  if (!sourceNode?.data) return [];
  if (typeof window.workflowNodeOwnResultVideos === 'function') return window.workflowNodeOwnResultVideos(sourceNode);
  if (typeof window.workflowNodeResultVideos === 'function') return window.workflowNodeResultVideos(sourceNode);
  if (typeof window.workflowNodeResultVideo === 'function') return [window.workflowNodeResultVideo(sourceNode)].filter(Boolean);
  const data = sourceNode.data || {};
  return [...new Set([...(data.resultVideoUrls || []), ...(data.videoUrls || []), data.resultVideoUrl, data.videoUrl].filter(Boolean))];
}

function canvasReferences(node = {}, nodeId = '') {
  const sourceNode = (typeof window.workflowNodeById === 'function' && window.workflowNodeById(nodeId)) || node;
  if (!sourceNode?.data) return { images: [], videos: [], audios: [] };
  if (typeof window.workflowNodeCanvasReferences === 'function') return window.workflowNodeCanvasReferences(sourceNode);
  const data = sourceNode.data || {};
  return {
    images: Array.isArray(data.referenceImages) ? data.referenceImages.filter(Boolean) : [],
    videos: Array.isArray(data.referenceVideos) ? data.referenceVideos.filter(Boolean) : [],
    audios: Array.isArray(data.referenceAudios) ? data.referenceAudios.filter(Boolean) : [],
  };
}

export function SiteVideoGenerationNode({ id, selected = false }) {
  const { node, update, run } = useSiteNode(id);
  const data = node?.data || {};
  const [prompt, setPrompt] = useState(data.prompt || '');
  const model = typeof window.workflowVideoModelById === 'function'
    ? window.workflowVideoModelById(data.modelId)
    : { id: data.modelId, label: data.modelId };
  const library = window.WORKFLOW_VIDEO_MODEL_LIBRARY || [model];
  const ratios = optionsFrom(typeof window.workflowVideoRatioOptions === 'function' ? window.workflowVideoRatioOptions(model) : ['16:9']);
  const resolutions = optionsFrom(typeof window.workflowVideoResolutionOptions === 'function' ? window.workflowVideoResolutionOptions(model) : ['720p']);
  const durations = optionsFrom(typeof window.workflowVideoDurationOptions === 'function' ? window.workflowVideoDurationOptions(model, data.resolution) : [5], { '-1': '自动' });
  const modes = (typeof window.workflowVideoModeOptions === 'function' ? window.workflowVideoModeOptions(model) : []);
  const results = useMemo(() => videoResults(node, id), [node, id]);
  const references = useMemo(() => canvasReferences(node, id), [node, id]);
  // A controlled React Flow node can briefly outlive its business record while
  // deletion is being propagated. Do not call node helpers with null.
  if (!node?.data) return null;
  const isSeedance = ['seedance', 'seedance25', 'seedance-nsfw'].includes(model.id);
  const frameMode = ['first_frame', 'first_last_frame'].includes(String(data.mode || model.mode || ''));
  const showReferenceLabels = isSeedance && !frameMode;
  const referenceValues = [...references.images, ...references.videos];
  const referenceLabels = showReferenceLabels
    ? [
      ...references.images.map((_, index) => `Image ${index + 1}`),
      ...references.videos.map((_, index) => `Video ${index + 1}`),
    ]
    : [];
  const mentionItems = showReferenceLabels
    ? [
      ...references.images.map((url, index) => ({ url, kind: 'image', label: `图片素材 ${index + 1}`, alias: `image${index + 1}` })),
      ...references.videos.map((url, index) => ({ url, kind: 'video', label: `视频素材 ${index + 1}`, alias: `video${index + 1}` })),
    ]
    : [];
  const poster = typeof window.workflowNodePoster === 'function' ? window.workflowNodePoster(node) : (data.posterUrl || '');
  const busy = ['submitting', 'preparing', 'processing', 'running'].includes(data.status);
  const runState = typeof window.workflowNodeRunState === 'function'
    ? window.workflowNodeRunState(node)
    : { disabled: busy, label: busy ? '生成中' : '生成' };

  const savePrompt = () => update({ prompt });
  const changeModel = (modelId) => {
    const next = typeof window.workflowVideoModelById === 'function' ? window.workflowVideoModelById(modelId) : model;
    const nextResolution = next.resolutions?.includes(data.resolution) ? data.resolution : next.resolution;
    const nextDurationOptions = typeof window.workflowVideoDurationOptions === 'function'
      ? window.workflowVideoDurationOptions(next, nextResolution)
      : [next.duration || 5];
    const nextModeOptions = typeof window.workflowVideoModeOptions === 'function' ? window.workflowVideoModeOptions(next) : [];
    update({
      modelId: next.id,
      ratio: next.ratios?.includes(data.ratio) ? data.ratio : next.ratio,
      resolution: nextResolution,
      duration: nextDurationOptions.includes(Number(data.duration)) ? data.duration : (next.duration || nextDurationOptions[0]),
      mode: nextModeOptions.some((option) => option.value === data.mode) ? data.mode : (nextModeOptions[0]?.value || ''),
    });
  };
  const changeResolution = (resolution) => {
    const nextDurations = typeof window.workflowVideoDurationOptions === 'function' ? window.workflowVideoDurationOptions(model, resolution) : durations.map((item) => item.value);
    update({ resolution, duration: nextDurations.includes(Number(data.duration)) ? data.duration : (nextDurations[0] || 5) });
  };

  return (
    <NodeLayout
      id={id}
      type={node?.type}
      title={node?.title || '视频生成'}
      showInputHandle
      inputHandleLabel="图片"
      showOutputHandle
      showDuplicateButton={false}
      selected={selected}
    >
      <div className="site-generation-node is-video">
        <div className="site-generation-result">
          <GenerationResultMedia
            kind="video"
            urls={results}
            poster={poster}
            status={results.length ? 'succeeded' : data.status}
            error={results.length ? '' : data.error}
            sourceNodeId={id}
          />
        </div>
        <div className="site-generation-controls is-selected-only">
          <label className="site-field site-prompt-field">
            <span>提示词</span>
            <PromptMentionTextarea
              rows={3}
              value={prompt}
              items={mentionItems}
              placeholder={mentionItems.length ? '描述视频画面，输入 @ 引用已连接素材...' : '描述视频的画面、动作、镜头和氛围...'}
              onChange={setPrompt}
              onBlur={savePrompt}
            />
          </label>
          <SiteNodeUpload
            id={id}
            accept="image/*,video/*"
            references={referenceValues}
            referenceLabels={referenceLabels}
            label="参考素材"
            emptyLabel="可拖入图片/视频或点击上传"
          />
          <div className="site-field-grid">
            <label className="site-field">
              <span>模型</span>
              <select value={selectedOption(library.map((item) => ({ value: item.id })), data.modelId)} onChange={(event) => changeModel(event.target.value)}>
                {library.map((item) => <option key={item.id} value={item.id}>{item.label || item.id}</option>)}
              </select>
            </label>
            <label className="site-field">
              <span>比例</span>
              <select value={selectedOption(ratios, data.ratio || model.ratio)} onChange={(event) => update({ ratio: event.target.value })}>
                {ratios.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label className="site-field">
              <span>分辨率</span>
              <select value={selectedOption(resolutions, data.resolution || model.resolution)} onChange={(event) => changeResolution(event.target.value)}>
                {resolutions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label className="site-field">
              <span>时长</span>
              <select value={selectedOption(durations, data.duration ?? model.duration ?? 5)} onChange={(event) => update({ duration: Number(event.target.value) })}>
                {durations.map((option) => <option key={option.value} value={option.value}>{typeof option.label === 'number' ? `${option.label} 秒` : option.label || `${option.value} 秒`}</option>)}
              </select>
            </label>
            {modes.length > 0 && (
              <label className="site-field">
                <span>模式</span>
                <select value={selectedOption(modes, data.mode || model.mode)} onChange={(event) => update({ mode: event.target.value })}>
                  {modes.map((option) => <option key={option.value} value={option.value}>{option.label || option.value}</option>)}
                </select>
              </label>
            )}
          </div>
          <label className="site-checkbox">
            <input type="checkbox" checked={data.addSound !== false} onChange={(event) => update({ addSound: event.target.checked })} />
            <span>生成音频</span>
          </label>
          <div className="site-generation-actions">
            <span>{(typeof window.workflowCostLabel === 'function' ? window.workflowCostLabel(node) : '')} 积分</span>
            <button type="button" disabled={runState.disabled} onClick={() => { savePrompt(); run(); }}>
              <i className={`bi ${busy ? 'bi-arrow-repeat' : 'bi-magic'}`} /> {runState.label === 'Run' ? '生成' : runState.label}
            </button>
          </div>
        </div>
      </div>
    </NodeLayout>
  );
}
