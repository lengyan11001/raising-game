import React, { useCallback, useEffect, useState } from 'react';
import ReactDOM from 'react-dom';

export function mediaKindOf(media = {}) {
  if (media.kind) return media.kind;
  return /\.(mp4|webm|mov|m4v)(?:$|\?)/i.test(String(media.url || '')) ? 'video' : 'image';
}

function MediaPreviewOverlay({ media, onClose }) {
  const kind = mediaKindOf(media);
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return ReactDOM.createPortal(
    <div
      className="site-media-preview-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={kind === 'video' ? '视频预览' : '图片预览'}
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <button type="button" className="site-media-preview-close" onClick={onClose} aria-label="关闭预览">
        <i className="bi bi-x-lg" />
      </button>
      <div className="site-media-preview-stage">
        {kind === 'video' ? (
          <video
            src={media.url}
            poster={media.poster || undefined}
            controls
            autoPlay
            playsInline
            preload="metadata"
            draggable={false}
            onContextMenu={(event) => event.preventDefault()}
          />
        ) : (
          <img
            src={media.url}
            alt={media.label || '图片预览'}
            draggable={false}
            onContextMenu={(event) => event.preventDefault()}
          />
        )}
      </div>
    </div>,
    document.body,
  );
}

export function useMediaPreview() {
  const [preview, setPreview] = useState(null);
  const closePreview = useCallback(() => setPreview(null), []);
  const openPreview = useCallback((media) => {
    if (media?.url) setPreview(media);
  }, []);
  const previewOverlay = preview ? <MediaPreviewOverlay media={preview} onClose={closePreview} /> : null;
  return { openPreview, previewOverlay };
}

export function MediaPreviewTrigger({ media, onOpen, className = '', title = '点击预览', children, ...props }) {
  const activate = (event) => {
    event.preventDefault();
    event.stopPropagation();
    onOpen(media);
  };
  return (
    <div
      {...props}
      className={`site-media-preview-trigger ${className}`.trim()}
      role="button"
      tabIndex={0}
      title={title}
      onClick={activate}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') activate(event);
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {children}
    </div>
  );
}
