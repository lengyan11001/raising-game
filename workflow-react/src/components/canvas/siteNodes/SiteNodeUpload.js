import React, { useRef } from 'react';

export function SiteNodeUpload({
  id,
  accept = 'image/*',
  references = [],
  referenceLabels = [],
  label = '添加参考图',
  emptyLabel = '支持拖入或选择文件',
}) {
  const inputRef = useRef(null);
  const values = Array.from(new Set((references || []).filter(Boolean)));
  const labels = values.map((_, index) => referenceLabels[index] || '');
  const showNumbers = labels.some(Boolean);
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
        <small>{values.length ? emptyLabel : '图片 / 视频'}</small>
      </div>
      {values.length > 0 && (
        <div className="site-node-upload-thumbs">
          {values.slice(0, 4).map((url, index) => (
            <a key={`${url}-${index}`} href={url} target="_blank" rel="noreferrer" title={`参考素材 ${index + 1}${labels[index] ? ` · 提示词写 ${labels[index]}` : ''}`}>
              {accept.includes('video') && /\.(mp4|webm|mov|m4v)(?:$|\?)/i.test(url)
                ? <video src={url} muted playsInline preload="metadata" />
                : <img src={url} alt={`参考素材 ${index + 1}`} loading="lazy" decoding="async" />}
              {labels[index] && <span className="site-node-upload-index">{labels[index]}</span>}
            </a>
          ))}
          {values.length > 4 && <span className="site-node-upload-more">+{values.length - 4}</span>}
        </div>
      )}
      {showNumbers && (
        <p className="site-node-upload-hint">
          提示词中用 <b>{labels.filter(Boolean).slice(0, 2).join('</b>、<b>')}</b> 引用上方素材，按显示顺序编号。
        </p>
      )}
      <button type="button" className="site-node-upload-button" onClick={() => inputRef.current?.click()}>
        <i className="bi bi-upload" /> 上传素材
      </button>
      <input ref={inputRef} type="file" accept={accept} multiple hidden onChange={handleFiles} />
    </div>
  );
}
