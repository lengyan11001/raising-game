import React from 'react';
import { MediaPreviewTrigger, useMediaPreview } from './MediaPreview';

function beginMediaDrag(event, { kind, url, index, sourceNodeId }) {
  event.stopPropagation();
  event.dataTransfer.effectAllowed = 'link';
  event.dataTransfer.setData('application/x-workflow-media-result', JSON.stringify({
    kind,
    url,
    index,
    sourceNodeId: String(sourceNodeId || ''),
  }));
  event.dataTransfer.setData('text/uri-list', url);
}

export function GenerationResultMedia({ kind = 'image', urls = [], poster = '', status = '', error = '', sourceNodeId = '', uploadProgress = 0, uploadFileName = '' }) {
  const { openPreview, previewOverlay } = useMediaPreview();
  if (status === 'uploading') {
    const progress = Math.max(0, Math.min(100, Math.round(Number(uploadProgress || 0))));
    return (
      <div className="site-generation-uploading" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={progress}>
        <i className="bi bi-cloud-arrow-up" />
        <strong>正在上传 {progress}%</strong>
        <div className="site-generation-uploading-track"><span style={{ width: `${progress}%` }} /></div>
        <small>{uploadFileName || '素材上传完成后会显示预览'}</small>
      </div>
    );
  }
  if (status === 'failed' && error) {
    return <div className="site-generation-empty is-error"><i className="bi bi-exclamation-circle"></i><span>{error}</span></div>;
  }
  if (!urls.length) {
    return (
      <div className="site-generation-empty">
        <i className={`bi ${kind === 'video' ? 'bi-play-btn' : 'bi-image'}`} />
        <span>生成结果会显示在这里</span>
      </div>
    );
  }
  if (kind === 'video') {
    return (
      <>
        <div className={`site-video-result-grid ${urls.length > 1 ? 'is-multiple' : ''}`}>
          {urls.map((url, index) => (
            <MediaPreviewTrigger
              key={`${url}-${index}`}
              media={{ kind, url, poster, label: `视频结果 ${index + 1}` }}
              onOpen={openPreview}
              className="site-video-result"
              draggable
              onDragStart={(event) => beginMediaDrag(event, { kind, url, index, sourceNodeId })}
            >
              <video src={url} poster={poster || undefined} muted playsInline preload="metadata" />
              <span className="site-media-preview-play"><i className="bi bi-play-fill" /></span>
            </MediaPreviewTrigger>
          ))}
        </div>
        {previewOverlay}
      </>
    );
  }
  return (
    <>
      <div className={`site-image-result-grid ${urls.length > 1 ? 'is-multiple' : ''}`}>
        {urls.map((url, index) => (
          <MediaPreviewTrigger
            key={`${url}-${index}`}
            media={{ kind, url, poster, label: `生成结果 ${index + 1}` }}
            onOpen={openPreview}
            className="site-image-result"
            draggable
            onDragStart={(event) => beginMediaDrag(event, { kind, url, index, sourceNodeId })}
          >
            <img src={url} alt={`生成结果 ${index + 1}`} loading="lazy" decoding="async" draggable={false} />
          </MediaPreviewTrigger>
        ))}
      </div>
      {previewOverlay}
    </>
  );
}
