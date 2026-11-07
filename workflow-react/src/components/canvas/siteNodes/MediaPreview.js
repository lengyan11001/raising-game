import React, { useCallback, useEffect, useState } from 'react';
import ReactDOM from 'react-dom';

const PREVIEW_MAX_WIDTH = 960;
const PREVIEW_MAX_HEIGHT = 680;

function previewViewportBounds() {
  const compact = window.innerWidth <= 640;
  return {
    width: Math.max(1, Math.min(PREVIEW_MAX_WIDTH, window.innerWidth - (compact ? 24 : 48))),
    height: Math.max(1, Math.min(PREVIEW_MAX_HEIGHT, window.innerHeight - (compact ? 66 : 80))),
  };
}

function fitPreviewDimensions(size = {}) {
  const width = Number(size.width || 0);
  const height = Number(size.height || 0);
  if (!(width > 0) || !(height > 0)) return null;
  const ratio = width / height;
  const bounds = previewViewportBounds();
  let fittedWidth = bounds.width;
  let fittedHeight = fittedWidth / ratio;
  if (fittedHeight > bounds.height) {
    fittedHeight = bounds.height;
    fittedWidth = fittedHeight * ratio;
  }
  return {
    width: Math.max(1, Math.round(fittedWidth)),
    height: Math.max(1, Math.round(fittedHeight)),
  };
}

export function mediaKindOf(media = {}) {
  if (media.kind) return media.kind;
  return /\.(mp4|webm|mov|m4v)(?:$|\?)/i.test(String(media.url || '')) ? 'video' : 'image';
}

function MediaPreviewOverlay({ media, onClose }) {
  const kind = mediaKindOf(media);
  const [mediaSize, setMediaSize] = useState(null);
  const [viewportTick, setViewportTick] = useState(0);
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

  useEffect(() => {
    const handleResize = () => setViewportTick((value) => value + 1);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const frameSize = fitPreviewDimensions(mediaSize);
  const rememberMediaSize = (event) => {
    const element = event.currentTarget;
    setMediaSize({
      width: element.naturalWidth || element.videoWidth || 0,
      height: element.naturalHeight || element.videoHeight || 0,
    });
  };

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
      <div className="site-media-preview-stage">
        <div
          className={`site-media-preview-frame is-${kind}${frameSize ? ' has-size' : ''}`}
          style={frameSize ? { width: `${frameSize.width}px`, height: `${frameSize.height}px` } : undefined}
          data-preview-width={frameSize?.width || ''}
          data-preview-height={frameSize?.height || ''}
        >
          {kind === 'video' ? (
            <video
              src={media.url}
              poster={media.poster || undefined}
              controls
              autoPlay
              playsInline
              preload="metadata"
              draggable={false}
              onLoadedMetadata={rememberMediaSize}
              onContextMenu={(event) => event.preventDefault()}
            />
          ) : (
            <img
              src={media.url}
              alt={media.label || '图片预览'}
              draggable={false}
              onLoad={rememberMediaSize}
              onContextMenu={(event) => event.preventDefault()}
            />
          )}
          <button type="button" className="site-media-preview-close" onClick={onClose} aria-label="关闭预览">
            <i className="bi bi-x-lg" />
          </button>
        </div>
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
