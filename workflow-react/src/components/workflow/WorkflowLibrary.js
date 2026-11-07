import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './WorkflowLibrary.css';

function requestJson(path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const headers = { Accept: 'application/json', ...(options.headers || {}) };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  return fetch(path, {
    method,
    credentials: 'include',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  }).then(async (response) => {
    const text = await response.text();
    let payload = {};
    try { payload = text ? JSON.parse(text) : {}; } catch { payload = { error: text }; }
    if (!response.ok) throw new Error(payload.error || payload.message || `请求失败 (${response.status})`);
    return payload;
  });
}

function formatProjectDate(value) {
  const time = Date.parse(String(value || ''));
  if (!Number.isFinite(time)) return '尚未编辑';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(time);
}

function coverUrl(project) {
  return project.thumbnailUrl || project.thumbnail_url || project.coverUrl || project.cover_url || '';
}

function previewNodes(project) {
  return Array.isArray(project.previewNodes) ? project.previewNodes.filter((node) => node && node.id) : [];
}

function projectPreviewImage(project) {
  return coverUrl(project) || '';
}

export function WorkflowLibrary({ onOpen, onCreate, createSignal = 0, className = '' }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [openProjectMenuId, setOpenProjectMenuId] = useState('');
  const [renaming, setRenaming] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const rootRef = useRef(null);
  const createSignalRef = useRef(createSignal);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const payload = await requestJson('/api/workflow/canvases');
      setProjects((payload.canvases || []).map((project) => ({
        ...project,
        id: String(project.id || project.uuid || ''),
        name: String(project.name || '未命名画布'),
        updatedAt: project.updatedAt || project.updated_at || project.createdAt || project.created_at || '',
        createdAt: project.createdAt || project.created_at || '',
      })).filter((project) => project.id));
    } catch (loadError) {
      setError(loadError.message || String(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  useEffect(() => {
    if (createSignal === createSignalRef.current) return;
    createSignalRef.current = createSignal;
    onCreate?.();
  }, [createSignal, onCreate]);

  useEffect(() => {
    if (!openProjectMenuId) return undefined;
    const close = (event) => {
      if (!event.target.closest?.('.InspirationCanvas-project-menu')) setOpenProjectMenuId('');
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [openProjectMenuId]);

  const sortedProjects = useMemo(() => [...projects].sort((left, right) => {
    const delta = Date.parse(right.updatedAt || '') - Date.parse(left.updatedAt || '');
    return Number.isFinite(delta) && delta !== 0 ? delta : String(left.id).localeCompare(String(right.id), undefined, { numeric: true });
  }), [projects]);

  const masonryColumns = useMemo(() => {
    const columns = [[], [], [], []];
    sortedProjects.forEach((project, index) => columns[index % columns.length].push(project));
    return columns;
  }, [sortedProjects]);

  const deleteProject = useCallback(async (project) => {
    if (!window.confirm(`删除画布“${project.name}”？此操作无法撤销。`)) return;
    setBusy(project.id);
    try {
      await requestJson(`/api/workflow/canvases/${encodeURIComponent(project.id)}`, { method: 'DELETE' });
      setProjects((current) => current.filter((item) => item.id !== project.id));
      setOpenProjectMenuId('');
    } catch (deleteError) {
      setError(deleteError.message || String(deleteError));
    } finally {
      setBusy('');
    }
  }, []);

  const saveRename = useCallback(async () => {
    if (!renaming) return;
    const name = renameValue.trim().slice(0, 80) || renaming.name;
    setBusy(renaming.id);
    try {
      const currentPayload = await requestJson(`/api/workflow/canvases/${encodeURIComponent(renaming.id)}`);
      const currentCanvas = currentPayload.canvas || {};
      const payload = await requestJson(`/api/workflow/canvases/${encodeURIComponent(renaming.id)}`, {
        method: 'PUT',
        body: { name, workflow: currentCanvas.workflow || { nodes: [], edges: [] } },
      });
      const saved = payload.canvas || {};
      setProjects((current) => current.map((project) => project.id === renaming.id
        ? { ...project, name: String(saved.name || name), updatedAt: saved.updatedAt || saved.updated_at || project.updatedAt }
        : project));
      setRenaming(null);
      setOpenProjectMenuId('');
    } catch (renameError) {
      setError(renameError.message || String(renameError));
    } finally {
      setBusy('');
    }
  }, [renameValue, renaming]);

  const openProject = useCallback((project) => {
    if (busy) return;
    onOpen?.(project);
  }, [busy, onOpen]);

  return (
    <section ref={rootRef} className={`InspirationCanvas-body is-mine WorkflowLibrary ${className}`} aria-label="我的画布">
      <main className="InspirationCanvas-main">
        <div className="InspirationCanvas-section-header">
          <div>
            <h2>我的项目</h2>
          </div>
          <button type="button" className="InspirationCanvas-create-project-button" onClick={onCreate}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            新建项目
          </button>
        </div>

        {error ? (
          <div className="InspirationCanvas-error">
            <p>{error}</p>
            <button type="button" onClick={loadProjects}>重试</button>
          </div>
        ) : null}

        {loading ? (
          <div className="InspirationCanvas-skeleton-grid is-mine-projects" aria-label="正在加载画布项目">
            {[0, 1, 2, 3].map((item) => <span key={item} className="InspirationCanvas-project-skeleton" />)}
          </div>
        ) : sortedProjects.length ? (
          <div className="InspirationCanvas-masonry-container is-mine-projects">
            {masonryColumns.map((column, columnIndex) => (
              <div className="InspirationCanvas-masonry-column" key={`canvas-column-${columnIndex}`}>
              {column.map((project) => {
                const isMenuOpen = openProjectMenuId === project.id;
                const image = projectPreviewImage(project);
                const miniNodes = previewNodes(project);
                const isRenaming = renaming?.id === project.id;
                return (
                  <div
                    key={project.id}
                    className="InspirationCanvas-masonry-item"
                    role="button"
                    tabIndex="0"
                    aria-label={`打开项目 ${project.name}`}
                    onClick={() => openProject(project)}
                    onKeyDown={(event) => {
                      if (event.target !== event.currentTarget) return;
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        openProject(project);
                      }
                    }}
                  >
                    <div className="InspirationCanvas-card-content is-mine-project">
                      <div className="InspirationCanvas-card-thumbnail">
                        {image ? (
                          <img src={image} alt={project.name} loading="lazy" decoding="async" />
                        ) : miniNodes.length ? (
                          <div className="InspirationCanvas-card-mini-canvas" aria-hidden="true">
                            <span className="InspirationCanvas-card-mini-grid" />
                            {miniNodes.slice(0, 6).map((node, nodeIndex) => (
                              <span
                                key={`${node.id}-${nodeIndex}`}
                                className={`InspirationCanvas-card-mini-node is-${node.type === 'unifiedVideoGen' ? 'video' : 'image'}`}
                                style={{
                                  left: `${10 + ((Number(node.x) || 0) / 1600) * 78}%`,
                                  top: `${15 + ((Number(node.y) || 0) / 900) * 58}%`,
                                }}
                              >
                                <i className={`bi ${node.type === 'unifiedVideoGen' ? 'bi-camera-video' : 'bi-image'}`} />
                              </span>
                            ))}
                          </div>
                        ) : (
                          <div className="InspirationCanvas-card-empty-create">
                            <span className="InspirationCanvas-card-empty-mark">＋</span>
                            <strong>空白画布</strong>
                            <small>点击进入并添加生成节点</small>
                          </div>
                        )}
                      </div>

                      <div className="InspirationCanvas-card-info">
                        <div className="InspirationCanvas-card-meta-row">
                          {isRenaming ? (
                            <input
                              autoFocus
                              className="InspirationCanvas-card-title-input"
                              value={renameValue}
                              maxLength={80}
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) => setRenameValue(event.target.value)}
                              onBlur={saveRename}
                              onKeyDown={(event) => {
                                event.stopPropagation();
                                if (event.key === 'Enter') saveRename();
                                if (event.key === 'Escape') setRenaming(null);
                              }}
                            />
                          ) : (
                            <h3 className="InspirationCanvas-card-title">{project.name}</h3>
                          )}
                          <div className="InspirationCanvas-project-menu">
                            <button
                              type="button"
                              className="InspirationCanvas-project-menu-trigger"
                              aria-label={`${project.name}更多操作`}
                              aria-haspopup="menu"
                              aria-expanded={isMenuOpen}
                              title="更多操作"
                              disabled={busy === project.id}
                              onClick={(event) => {
                                event.stopPropagation();
                                setOpenProjectMenuId(isMenuOpen ? '' : project.id);
                              }}
                            >
                              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                                <circle cx="5" cy="12" r="1.6" />
                                <circle cx="12" cy="12" r="1.6" />
                                <circle cx="19" cy="12" r="1.6" />
                              </svg>
                            </button>
                            {isMenuOpen ? (
                              <div className="InspirationCanvas-project-menu-popover" role="menu">
                                <button type="button" role="menuitem" onClick={(event) => {
                                  event.stopPropagation();
                                  setRenaming(project);
                                  setRenameValue(project.name);
                                  setOpenProjectMenuId('');
                                }}>重命名</button>
                                <span className="InspirationCanvas-project-menu-divider" role="separator" />
                                <button type="button" role="menuitem" className="is-danger" onClick={(event) => {
                                  event.stopPropagation();
                                  deleteProject(project);
                                }}>删除项目</button>
                              </div>
                            ) : null}
                          </div>
                        </div>
                        <time className="InspirationCanvas-project-date" dateTime={project.updatedAt}>
                          {formatProjectDate(project.updatedAt)}
                        </time>
                      </div>
                    </div>
                  </div>
                );
              })}
              </div>
            ))}
          </div>
        ) : (
          <button type="button" className="InspirationCanvas-empty-project" onClick={onCreate}>
            <span className="InspirationCanvas-empty-project-mark">＋</span>
            <strong>创建第一个画布项目</strong>
            <small>进入后添加图片生成或视频生成节点</small>
          </button>
        )}
      </main>
    </section>
  );
}

export default WorkflowLibrary;
