import React, { useState } from 'react';
import { NodeLayout } from '../nodes/NodeLayout';
import { useSiteNode, optionsFrom, selectedOption } from './useSiteNode';
import { SiteNodeUpload } from './SiteNodeUpload';

export function SiteImageGenerationNode({ id, selected = false }) {
  const { node, update, run } = useSiteNode(id);
  const data = node?.data || {};
  const [prompt, setPrompt] = useState(data.prompt || '');
  const model = typeof window.workflowImageModelById === 'function' ? window.workflowImageModelById(data.modelId) : { id: data.modelId, label: data.modelId };
  const library = window.WORKFLOW_IMAGE_MODEL_LIBRARY || [model];
  const ratios = optionsFrom(typeof window.workflowImageModelOptions === 'function' ? window.workflowImageModelOptions(model) : ['1:1']);
  const resolutions = optionsFrom(typeof window.workflowImageResolutionOptions === 'function' ? window.workflowImageResolutionOptions(model) : ['2K']);
  const tiers = optionsFrom(model.tiers || [], { standard: 'Standard', pro: 'Pro' });
  const outputCounts = optionsFrom(model.outputCounts || [1], Object.fromEntries((model.outputCounts || [1]).map((value) => [value, `${value} 张`])));
  // A controlled React Flow node can briefly outlive its business record while
  // deletion is being propagated. Do not call node helpers with null.
  if (!node?.data) return null;
  const busy = ['submitting', 'preparing', 'processing', 'running'].includes(data.status);
  const runState = typeof window.workflowNodeRunState === 'function' ? window.workflowNodeRunState(node) : { disabled: busy, label: busy ? '生成中' : '生成' };

  const savePrompt = () => update({ prompt });
  const changeModel = (modelId) => {
    const next = typeof window.workflowImageModelById === 'function' ? window.workflowImageModelById(modelId) : model;
    update({
      modelId: next.id,
      ratio: next.ratios?.includes(data.ratio) ? data.ratio : next.ratio,
      resolution: next.resolutions?.includes(data.resolution) ? data.resolution : next.resolution,
      qwenTier: next.id === 'qwen-image3' ? (data.qwenTier || next.defaultTier || 'pro') : data.qwenTier,
      seedreamTier: next.id === 'seedream5-image' ? (data.seedreamTier || next.defaultTier || 'pro') : data.seedreamTier,
      outputImageCount: Number(data.outputImageCount || 1),
    });
  };

  return (
    <NodeLayout
      id={id}
      type={node?.type}
      title={node?.title || '图片生成'}
      showInputHandle
      showOutputHandle
      showDuplicateButton={false}
      inputHandleLabel=""
      selected={selected}
      canDownload={false}
    >
      <div className="site-generation-node">
        <div className="site-generation-summary">
          <span><i className="bi bi-stars" /> {model.label || model.id || '图片生成'}</span>
          <small>{data.status ? String(data.status) : '就绪'} · {data.ratio || model.ratio || '1:1'} · {data.resolution || model.resolution || '2K'}</small>
        </div>
        <div className="site-generation-controls">
          <label className="site-field site-prompt-field">
            <span>提示词</span>
            <textarea
              rows={3}
              value={prompt}
              placeholder="描述你想要的画面..."
              onChange={(event) => setPrompt(event.target.value)}
              onBlur={savePrompt}
              onPointerDown={(event) => event.stopPropagation()}
            />
          </label>
          <SiteNodeUpload
            id={id}
            accept="image/*"
            references={data.referenceImages || []}
            label="参考图"
            emptyLabel="可拖入图片或点击上传"
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
              <select value={selectedOption(resolutions, data.resolution || model.resolution)} onChange={(event) => update({ resolution: event.target.value })}>
                {resolutions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            {tiers.length > 1 && (
              <label className="site-field">
                <span>档位</span>
                <select value={selectedOption(tiers, data.qwenTier || data.seedreamTier || model.defaultTier)} onChange={(event) => update(model.id === 'seedream5-image' ? { seedreamTier: event.target.value } : { qwenTier: event.target.value })}>
                  {tiers.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
            )}
            {outputCounts.length > 1 && (
              <label className="site-field">
                <span>数量</span>
                <select value={String(data.outputImageCount || 1)} onChange={(event) => update({ outputImageCount: Number(event.target.value) })}>
                  {outputCounts.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
            )}
          </div>
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
