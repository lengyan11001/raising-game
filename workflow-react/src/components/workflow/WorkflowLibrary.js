import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { requestCanvasJson } from './canvasApi';
import { buildWorkflowShareUrl, copyTextToClipboard } from './shareUtils';
import { WorkflowShareModal } from './WorkflowShareModal';
import './WorkflowLibrary.css';

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

function projectPreviewMedia(project) {
  const image = coverUrl(project);
  const video = project.thumbnailVideoUrl || project.thumbnail_video_url || '';
  // Generated videos also carry a durable poster. Show that poster first so a
  // slow or expired video URL cannot turn the whole project card blank.
  if (image) return { kind: 'image', url: image, poster: '' };
  return video ? { kind: 'video', url: video, poster: '' } : null;
}

function previewNodes(project) {
  if (project?.locked) return [];
  return Array.isArray(project.previewNodes) ? project.previewNodes.filter((node) => node && node.id) : [];
}

function templateVisibilityBadge(project) {
  if (project.visibility === 'public') return { text: '公开', cls: 'is-public' };
  if (project.visibility === 'semi_public') return { text: '半公开', cls: 'is-semi' };
  return null;
}

function templatePriceBadge(project) {
  if (project.visibility !== 'semi_public') return null;
  if (project.unlocked) return { text: '已解锁', cls: 'is-unlocked' };
  const credits = Number(project.unlockCredits || 0);
  if (project.allowCreditUnlock && credits > 0) return { text: `${credits}积分/分`, cls: 'is-price' };
  if (project.allowCodeUnlock !== false) return { text: '邀请码', cls: 'is-price' };
  return null;
}

function ownerVisibilityBadge(project) {
  if (project.visibility === 'public') return { text: '公开', cls: 'is-public' };
  if (project.visibility === 'semi_public') return { text: '半公开', cls: 'is-semi' };
  return null;
}

export function WorkflowLibrary({
  activeTab = 'mine',
  onTabChange,
  onOpen,
  onCreate,
  createSignal = 0,
  authVersion = 0,
  className = '',
}) {
  const [projects, setProjects] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [error, setError] = useState('');
  const [templatesError, setTemplatesError] = useState('');
  const [needsLoginForMine, setNeedsLoginForMine] = useState(false);
  const [busy, setBusy] = useState('');
  const [openProjectMenuId, setOpenProjectMenuId] = useState('');
  const [renaming, setRenaming] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [sharingProject, setSharingProject] = useState(null);
  const [toastText, setToastText] = useState('');
  const [templateFilter, setTemplateFilter] = useState('all');
  const [templateSort, setTemplateSort] = useState('latest');
  const [templateSearch, setTemplateSearch] = useState('');
  const rootRef = useRef(null);
  const createSignalRef = useRef(createSignal);

  const flashToast = useCallback((message) => {
    setToastText(String(message || ''));
    window.setTimeout(() => setToastText(''), 2200);
  }, []);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    setError('');
    setNeedsLoginForMine(false);
    try {
      const payload = await requestCanvasJson('/api/workflow/canvases');
      setProjects((payload.canvases || []).map((project) => ({
        ...project,
        id: String(project.id || project.uuid || ''),
        name: String(project.name || '未命名画布'),
        updatedAt: project.updatedAt || project.updated_at || project.createdAt || project.created_at || '',
        createdAt: project.createdAt || project.created_at || '',
      })).filter((project) => project.id));
    } catch (loadError) {
      if (loadError.status === 401 || loadError.code === 'LOGIN_REQUIRED') {
        setProjects([]);
        setNeedsLoginForMine(true);
      } else {
        setError(loadError.message || String(loadError));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    setTemplatesError('');
    try {
      const params = new URLSearchParams();
      if (templateFilter !== 'all') params.set('visibility', templateFilter);
      if (templateSort) params.set('sort', templateSort);
      if (templateSearch.trim()) params.set('q', templateSearch.trim());
      const payload = await requestCanvasJson(`/api/workflow/templates?${params.toString()}`);
      setTemplates((payload.templates || []).map((item) => ({
        ...item,
        id: String(item.id || ''),
        name: String(item.name || '未命名画布'),
      })).filter((item) => item.id));
    } catch (loadError) {
      setTemplatesError(loadError.message || String(loadError));
    } finally {
      setTemplatesLoading(false);
    }
  }, [templateFilter, templateSearch, templateSort]);

  useEffect(() => {
    if (activeTab === 'mine') loadProjects();
  }, [activeTab, authVersion, loadProjects]);

  useEffect(() => {
    if (activeTab === 'templates') loadTemplates();
  }, [activeTab, authVersion, loadTemplates]);

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

  const templateColumns = useMemo(() => {
    const columns = [[], [], []];
    templates.forEach((item, index) => columns[index % columns.length].push(item));
    return columns;
  }, [templates]);

  const deleteProject = useCallback(async (project) => {
    if (!window.confirm(`删除画布“${project.name}”？此操作无法撤销。`)) return;
    setBusy(project.id);
    try {
      await requestCanvasJson(`/api/workflow/canvases/${encodeURIComponent(project.id)}`, { method: 'DELETE' });
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
      const currentPayload = await requestCanvasJson(`/api/workflow/canvases/${encodeURIComponent(renaming.id)}`);
      const currentCanvas = currentPayload.canvas || {};
      const payload = await requestCanvasJson(`/api/workflow/canvases/${encodeURIComponent(renaming.id)}`, {
        method: 'PUT',
        body: { name, workflow: currentCanvas.workflow || { nodes: [], edges: [] } },
      });
      const saved = payload.canvas || {};
      setProjects((current) => current.map((project) => (project.id === renaming.id
        ? { ...project, ...saved, name: saved.name || name }
        : project)));
      setRenaming(null);
      setRenameValue('');
    } catch (renameError) {
      setError(renameError.message || String(renameError));
    } finally {
      setBusy('');
    }
  }, [renameValue, renaming]);

  const openProject = useCallback((project, options = {}) => {
    if (busy) return;
    onOpen?.(project, options);
  }, [busy, onOpen]);

  const copyShareLink = useCallback(async (project) => {
    const ok = await copyTextToClipboard(buildWorkflowShareUrl(project.id));
    setOpenProjectMenuId('');
    flashToast(ok ? '已复制分享链接' : '复制链接失败');
  }, [flashToast]);

  const renderCardThumbnail = (project, { isTemplate = false } = {}) => {
    const preview = projectPreviewMedia(project);
    const miniNodes = previewNodes(project);
    const locked = Boolean(isTemplate && project.locked);
    return (
      <div className={`InspirationCanvas-card-thumbnail${locked ? ' is-locked-template' : ''}`}>
        {preview ? (
          preview.kind === 'video' ? (
            <video
              className="InspirationCanvas-card-thumbnail-video"
              src={preview.url}
              poster={preview.poster || undefined}
              muted
              playsInline
              preload="metadata"
              aria-label={project.name}
            />
          ) : (
            <img src={preview.url} alt={project.name} loading="lazy" decoding="async" />
          )
        ) : locked ? (
          <div className="InspirationCanvas-card-locked-placeholder">
            <i className="bi bi-lock-fill" aria-hidden="true" />
            <strong>半公开模版</strong>
            <small>解锁后可查看结构并复制</small>
          </div>
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
            <strong>{isTemplate ? '画布模版' : '空白画布'}</strong>
            <small>{isTemplate ? '点击打开查看模版结构' : '点击进入并添加生成节点'}</small>
          </div>
        )}

        {isTemplate ? (() => {
          const visibilityBadge = templateVisibilityBadge(project);
          const priceBadge = templatePriceBadge(project);
          return (
            <div className="InspirationCanvas-template-badges">
              {visibilityBadge ? (
                <span className={`InspirationCanvas-visibility-badge ${visibilityBadge.cls}`}>{visibilityBadge.text}</span>
              ) : null}
              {priceBadge ? (
                <span className={`InspirationCanvas-template-price ${priceBadge.cls}`}>{priceBadge.text}</span>
              ) : null}
            </div>
          );
        })() : (() => {
          const badge = ownerVisibilityBadge(project);
          return badge ? <span className={`InspirationCanvas-visibility-badge ${badge.cls}`}>{badge.text}</span> : null;
        })()}
      </div>
    );
  };

  return (
    <section ref={rootRef} className={`InspirationCanvas-body is-${activeTab} WorkflowLibrary ${className}`} aria-label="画布项目列表">
      <main className="InspirationCanvas-main">
        <div className="InspirationCanvas-section-header">
          <div className="InspirationCanvas-header-tabs" role="tablist" aria-label="画布列表视图">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'mine'}
              className={`InspirationCanvas-tab-button${activeTab === 'mine' ? ' is-active' : ''}`}
              onClick={() => onTabChange?.('mine')}
            >
              我的项目
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'templates'}
              className={`InspirationCanvas-tab-button${activeTab === 'templates' ? ' is-active' : ''}`}
              onClick={() => onTabChange?.('templates')}
            >
              公开模版
            </button>
          </div>
          {activeTab === 'mine' ? (
            <button type="button" className="InspirationCanvas-create-project-button" onClick={onCreate}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
              新建项目
            </button>
          ) : null}
        </div>

        {activeTab === 'templates' ? (
          <div className="InspirationCanvas-template-filters" role="search" aria-label="公开模版筛选">
            <div className="InspirationCanvas-filter-group" role="group" aria-label="可见性筛选">
              {[
                { id: 'all', label: '全部' },
                { id: 'public', label: '公开' },
                { id: 'semi_public', label: '半公开' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={`InspirationCanvas-filter-pill${templateFilter === opt.id ? ' is-active' : ''}`}
                  onClick={() => setTemplateFilter(opt.id)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="InspirationCanvas-template-query">
              <select
                className="InspirationCanvas-filter-select"
                aria-label="排序方式"
                value={templateSort}
                onChange={(event) => setTemplateSort(event.target.value)}
              >
                <option value="latest">最新发布</option>
                <option value="popular">最多使用</option>
              </select>
              <label className="InspirationCanvas-filter-search">
                <i className="bi bi-search" aria-hidden="true" />
                <input
                  type="search"
                  value={templateSearch}
                  placeholder="搜索模版或作者..."
                  aria-label="搜索模版或作者"
                  onChange={(event) => setTemplateSearch(event.target.value)}
                />
              </label>
            </div>
          </div>
        ) : null}

        {toastText ? <div className="InspirationCanvas-toast" role="status">{toastText}</div> : null}

        {activeTab === 'mine' ? (
          <>
            {error ? (
              <div className="InspirationCanvas-error">
                <p>{error}</p>
                <button type="button" onClick={loadProjects}>重试</button>
              </div>
            ) : null}

            {needsLoginForMine ? (
              <div className="InspirationCanvas-empty-project is-auth-prompt">
                <span className="InspirationCanvas-empty-project-mark">✦</span>
                <strong>登录后管理我的画布项目</strong>
                <small>你也可以先切换到「公开模版」浏览社区画布</small>
                <button
                  type="button"
                  className="InspirationCanvas-create-project-button"
                  onClick={() => window.openPlatformLoginModal?.()}
                >
                  立即登录
                </button>
              </div>
            ) : loading ? (
              <div className="InspirationCanvas-skeleton-grid is-mine-projects" aria-label="正在加载画布项目">
                {[0, 1, 2, 3].map((item) => <span key={item} className="InspirationCanvas-project-skeleton" />)}
              </div>
            ) : sortedProjects.length ? (
              <div className="InspirationCanvas-masonry-container is-mine-projects">
                {masonryColumns.map((column, columnIndex) => (
                  <div className="InspirationCanvas-masonry-column" key={`canvas-column-${columnIndex}`}>
                    {column.map((project) => {
                      const isMenuOpen = openProjectMenuId === project.id;
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
                            {renderCardThumbnail(project, { isTemplate: false })}
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
                                        setSharingProject(project);
                                        setOpenProjectMenuId('');
                                      }}>公开与邀请设置</button>
                                      {project.visibility && project.visibility !== 'private' ? (
                                        <button type="button" role="menuitem" onClick={(event) => {
                                          event.stopPropagation();
                                          copyShareLink(project);
                                        }}>复制分享链接</button>
                                      ) : null}
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
          </>
        ) : (
          <>
            {templatesError ? (
              <div className="InspirationCanvas-error">
                <p>{templatesError}</p>
                <button type="button" onClick={loadTemplates}>重试</button>
              </div>
            ) : null}

            {templatesLoading ? (
              <div className="InspirationCanvas-skeleton-grid is-templates-grid" aria-label="正在加载公开模版">
                {[0, 1, 2].map((item) => <span key={item} className="InspirationCanvas-project-skeleton" />)}
              </div>
            ) : templates.length ? (
              <div className="InspirationCanvas-masonry-container is-templates-grid">
                {templateColumns.map((column, columnIndex) => (
                  <div className="InspirationCanvas-masonry-column" key={`template-column-${columnIndex}`}>
                    {column.map((template) => (
                      <div
                        key={template.id}
                        className="InspirationCanvas-masonry-item"
                        role="button"
                        tabIndex="0"
                        aria-label={`查看模版 ${template.name}`}
                        onClick={() => openProject(template, { fromTemplates: true })}
                        onKeyDown={(event) => {
                          if (event.target !== event.currentTarget) return;
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            openProject(template, { fromTemplates: true });
                          }
                        }}
                      >
                        <div className="InspirationCanvas-card-content is-template">
                          {renderCardThumbnail(template, { isTemplate: true })}
                          <div className="InspirationCanvas-card-info">
                            <div className="InspirationCanvas-card-meta-row">
                              <h3 className="InspirationCanvas-card-title">{template.name}</h3>
                            </div>
                            {template.description ? (
                              <p className="InspirationCanvas-template-desc">{template.description}</p>
                            ) : null}
                            <div className="InspirationCanvas-template-submeta">
                              <span>{template.ownerName ? `作者 ${template.ownerName}` : '社区模版'}</span>
                              <span className="InspirationCanvas-template-stats">
                                {template.visibility === 'semi_public' ? <span>{template.unlockCount || 0} 解锁</span> : null}
                                <span>{template.forkCount || 0} 复制</span>
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <div className="InspirationCanvas-empty-project is-auth-prompt">
                <span className="InspirationCanvas-empty-project-mark">✦</span>
                <strong>暂无公开画布模版</strong>
                <small>在你的画布右上角点击「公开 / 邀请」即可发布为公开或半公开模版</small>
              </div>
            )}
          </>
        )}
      </main>

      {sharingProject ? (
        <WorkflowShareModal
          project={sharingProject}
          onClose={() => setSharingProject(null)}
          onUpdated={(updated) => {
            if (!updated?.id) return;
            setProjects((current) => current.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
            setSharingProject((prev) => (prev && prev.id === updated.id ? { ...prev, ...updated } : prev));
          }}
        />
      ) : null}
    </section>
  );
}

export default WorkflowLibrary;
