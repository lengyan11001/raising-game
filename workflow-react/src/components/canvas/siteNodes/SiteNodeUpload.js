import React, { useRef } from 'react';
import { MediaPreviewTrigger, useMediaPreview } from './MediaPreview';

export function SiteNodeUpload({
  id,
  accept = 'image/*',
  references = [],
  referenceLabels = [],
  label = '添加参考图',
  emptyLabel = '支持拖入或选择文件',
}) {
  const inputRef = useRef(null);
  const { openPreview, previewOverlay } = useMediaPreview();
  const values = Array.from(new Set((references || []).filter(Boolean)));
  const labels = values.map((_, index) => referenceLabels[index] || '');
  const node = typeof window.workflowNodeById === 'function' ? window.workflowNodeById(id) : null;
  const data = node?.data || {};
  const uploading = data.status === 'uploading';
  const uploadProgress = Math.max(0, Math.min(100, Math.round(Number(data.uploadProgress || 0))));
  const handleFiles = (event) => {
    event.stopPropagation();
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (files.length && typeof window.uploadWorkflowFilesToNode === 'function') {
      window.uploadWorkflowFilesToNode(files, id);
    }
  };
  return (
    <div className="site-node-upload" onPointerDown={(event) => event.stopPropagation()}>
      <div className="site-node-upload-head">
        <span>{label} <b>{values.length}</b></span>
        <small>{uploading ? `上传中 ${uploadProgress}%` : values.length ? emptyLabel : '图片 / 视频'}</small>
      </div>
      {uploading && (
        <div className="site-node-upload-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={uploadProgress}>
          <span style={{ width: `${uploadProgress}%` }} />
          <small>{data.uploadFileName || '正在上传素材'}</small>
        </div>
      )}
      {values.length > 0 && (
        <div className="site-node-upload-thumbs">
          {values.slice(0, 4).map((url, index) => {
            const kind = /\.(mp4|webm|mov|m4v)(?:$|\?)/i.test(url) ? 'video' : 'image';
            return (
              <MediaPreviewTrigger
                key={`${url}-${index}`}
                media={{ kind, url, label: `参考素材 ${index + 1}` }}
                onOpen={openPreview}
                title={`预览参考素材 ${index + 1} · 提示词输入 @ 引用`}
              >
                {kind === 'video'
                  ? <video src={url} muted playsInline preload="metadata" />
                  : <img src={url} alt={`参考素材 ${index + 1}`} loading="lazy" decoding="async" />}
              </MediaPreviewTrigger>
            );
          })}
          {values.length > 4 && <span className="site-node-upload-more">+{values.length - 4}</span>}
        </div>
      )}
      {previewOverlay}
      {values.length > 0 && <p className="site-node-upload-hint">在提示词中输入 <b>@</b> 选择并引用素材，例如 @image1</p>}
      <button type="button" className="site-node-upload-button" disabled={uploading} onClick={() => inputRef.current?.click()}>
        <i className="bi bi-upload" /> 上传素材
      </button>
      <input ref={inputRef} type="file" accept={accept} multiple hidden onChange={handleFiles} />
    </div>
  );
}
