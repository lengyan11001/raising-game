import React, { useMemo, useRef, useState } from 'react';

function mentionAtCaret(value = '', caret = 0) {
  const end = Math.max(0, Math.min(Number(caret) || 0, value.length));
  const start = value.lastIndexOf('@', end - 1);
  if (start < 0) return null;
  const query = value.slice(start + 1, end);
  if (/[\s@]/.test(query)) return null;
  return { start, end, query };
}

function normalizedAlias(item = {}) {
  const alias = String(item.alias || '').trim().replace(/^@/, '').toLowerCase();
  if (alias) return alias;
  const label = String(item.label || '').trim().toLowerCase().replace(/\s+/g, '');
  return label || (item.kind === 'video' ? 'video1' : 'image1');
}

function mediaKind(item = {}, url = '') {
  if (item.kind) return item.kind;
  return /\.(mp4|webm|mov|m4v)(?:$|\?)/i.test(String(url)) ? 'video' : 'image';
}

export function PromptMentionTextarea({
  value = '',
  onChange,
  onBlur,
  placeholder = '',
  rows = 3,
  items = [],
}) {
  const textareaRef = useRef(null);
  const [mention, setMention] = useState(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const available = useMemo(() => (items || []).filter((item) => item?.url), [items]);
  const matches = useMemo(() => {
    const query = String(mention?.query || '').trim().toLowerCase();
    if (!query) return available;
    return available.filter((item) => {
      const haystack = `${normalizedAlias(item)} ${item.label || ''} ${item.kind || ''}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [available, mention?.query]);
  const open = Boolean(mention && matches.length);

  const refreshMention = (target = textareaRef.current) => {
    if (!target) return;
    setMention(mentionAtCaret(value, target.selectionStart));
    setActiveIndex(0);
  };

  const insertMention = (item) => {
    if (!item || !mention) return;
    const alias = normalizedAlias(item);
    const prefix = value.slice(0, mention.start);
    const suffix = value.slice(mention.end).replace(/^\s*/, '');
    const inserted = `@${alias} `;
    const next = `${prefix}${inserted}${suffix}`;
    onChange?.(next);
    setMention(null);
    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      const caret = prefix.length + inserted.length;
      textarea.setSelectionRange(caret, caret);
    });
  };

  const handleKeyDown = (event) => {
    if (!open) {
      if (event.key === '@') requestAnimationFrame(() => refreshMention(event.currentTarget));
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % matches.length);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + matches.length) % matches.length);
      return;
    }
    if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault();
      insertMention(matches[activeIndex] || matches[0]);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setMention(null);
    }
  };

  return (
    <div className="site-prompt-input-shell" onPointerDown={(event) => event.stopPropagation()}>
      <textarea
        ref={textareaRef}
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(event) => {
          onChange?.(event.target.value);
          setMention(mentionAtCaret(event.target.value, event.target.selectionStart));
          setActiveIndex(0);
        }}
        onClick={(event) => refreshMention(event.currentTarget)}
        onKeyUp={(event) => {
          if (!['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(event.key)) refreshMention(event.currentTarget);
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          setMention(null);
          onBlur?.();
        }}
      />
      {open && (
        <div className="site-prompt-mentions" role="listbox" aria-label="引用素材">
          {matches.map((item, index) => {
            const kind = mediaKind(item, item.url);
            return (
              <button
                key={`${item.url}-${index}`}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                className={`site-prompt-mention${index === activeIndex ? ' is-active' : ''}`}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => insertMention(item)}
              >
                <span className="site-prompt-mention-thumb">
                  {kind === 'video'
                    ? <video src={item.url} muted playsInline preload="metadata" />
                    : <img src={item.url} alt="" loading="lazy" decoding="async" />}
                </span>
                <span className="site-prompt-mention-copy">
                  <strong>@{normalizedAlias(item)}</strong>
                  <small>{item.label || (kind === 'video' ? '视频素材' : '图片素材')}</small>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
