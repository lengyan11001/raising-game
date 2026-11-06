import React from 'react';

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

export function GenerationResultMedia({ kind = 'image', urls = [], poster = '', status = '', error = '', sourceNodeId = '' }) {
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
      <div className={`site-video-result-grid ${urls.length > 1 ? 'is-multiple' : ''}`}>
        {urls.map((url, index) => (
          <div
            key={`${url}-${index}`}
            className="site-video-result"
            draggable
            onDragStart={(event) => beginMediaDrag(event, { kind, url, index, sourceNodeId })}
          >
            <video src={url} poster={poster || undefined} controls playsInline preload="metadata" />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className={`site-image-result-grid ${urls.length > 1 ? 'is-multiple' : ''}`}>
      {urls.map((url, index) => (
        <a
          key={`${url}-${index}`}
          className="site-image-result"
          href={url}
          target="_blank"
          rel="noreferrer"
          draggable
          onDragStart={(event) => {
            beginMediaDrag(event, { kind, url, index, sourceNodeId });
          }}
        >
          <img src={url} alt={`生成结果 ${index + 1}`} loading="lazy" decoding="async" />
        </a>
      ))}
    </div>
  );
}
