import React, { useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom';
import { requestCanvasJson } from './canvasApi';
import { buildWorkflowShareUrl, copyTextToClipboard } from './shareUtils';
import './WorkflowModals.css';

const ROTATE_OPTIONS = [
  { value: 3600, label: '每 1 小时' },
  { value: 21600, label: '每 6 小时' },
  { value: 86400, label: '每 24 小时' },
  { value: 604800, label: '每 7 天' },
];

function formatCountdown(iso, nowMs) {
  const target = Date.parse(String(iso || ''));
  if (!Number.isFinite(target)) return '';
  const diffSec = Math.max(0, Math.floor((target - nowMs) / 1000));
  const days = Math.floor(diffSec / 86400);
  const hours = Math.floor((diffSec % 86400) / 3600);
  const mins = Math.floor((diffSec % 3600) / 60);
  const secs = diffSec % 60;
  if (days > 0) return `${days}天 ${hours}小时`;
  if (hours > 0) return `${hours}小时 ${mins}分`;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function WorkflowShareModal({ project, onClose, onUpdated }) {
  const initialSharing = project?.sharing || {};
  const [visibility, setVisibility] = useState(project?.visibility || initialSharing.visibility || 'private');
  const [description, setDescription] = useState(project?.description || initialSharing.description || '');
  const [allowCreditUnlock, setAllowCreditUnlock] = useState(
    Boolean(initialSharing.allowCreditUnlock ?? project?.allowCreditUnlock ?? false),
  );
  const [unlockCredits, setUnlockCredits] = useState(
    String((initialSharing.unlockCredits ?? project?.unlockCredits) || 10),
  );
  const [allowCodeUnlock, setAllowCodeUnlock] = useState(
    initialSharing.allowCodeUnlock !== false && project?.allowCodeUnlock !== false,
  );
  const [inviteMode, setInviteMode] = useState(initialSharing.inviteMode || 'static');
  const [inviteRotateIntervalSec, setInviteRotateIntervalSec] = useState(
    Number(initialSharing.inviteRotateIntervalSec || 86400),
  );
  const [inviteMaxUses, setInviteMaxUses] = useState(
    String(initialSharing.inviteMaxUses ?? 0),
  );
  const [inviteInfo, setInviteInfo] = useState({
    code: initialSharing.inviteCode || '',
    mode: initialSharing.inviteMode || 'static',
    nextRotateAt: initialSharing.inviteNextRotateAt || '',
    usedCount: Number(initialSharing.inviteUsedCount || 0),
    maxUses: Number(initialSharing.inviteMaxUses || 0),
  });
  const [saving, setSaving] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [nowMs, setNowMs] = useState(Date.now());

  useEffect(() => {
    if (inviteInfo.mode !== 'rotating' || !inviteInfo.nextRotateAt) return undefined;
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [inviteInfo.mode, inviteInfo.nextRotateAt]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const countdown = useMemo(
    () => (inviteInfo.mode === 'rotating' ? formatCountdown(inviteInfo.nextRotateAt, nowMs) : ''),
    [inviteInfo.mode, inviteInfo.nextRotateAt, nowMs],
  );

  const applySavedCanvas = (saved) => {
    if (!saved) return;
    const nextSharing = saved.sharing || {};
    setVisibility(saved.visibility || nextSharing.visibility || visibility);
    setDescription(saved.description ?? nextSharing.description ?? description);
    setInviteInfo({
      code: nextSharing.inviteCode || '',
      mode: nextSharing.inviteMode || inviteMode,
      nextRotateAt: nextSharing.inviteNextRotateAt || '',
      usedCount: Number(nextSharing.inviteUsedCount || 0),
      maxUses: Number(nextSharing.inviteMaxUses || 0),
    });
    onUpdated?.(saved);
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const payload = await requestCanvasJson(`/api/workflow/canvases/${encodeURIComponent(project.id)}/sharing`, {
        method: 'PATCH',
        body: {
          visibility,
          description,
          allowCreditUnlock: visibility === 'semi_public' ? allowCreditUnlock : false,
          unlockCredits: visibility === 'semi_public' && allowCreditUnlock ? Number(unlockCredits || 0) : 0,
          allowCodeUnlock: visibility === 'semi_public' ? allowCodeUnlock : false,
          inviteMode,
          inviteRotateIntervalSec: Number(inviteRotateIntervalSec || 86400),
          inviteMaxUses: Math.max(0, Math.trunc(Number(inviteMaxUses || 0) || 0)),
        },
      });
      applySavedCanvas(payload.canvas);
      setNotice('公开与邀请设置已保存。');
    } catch (saveError) {
      setError(saveError.message || String(saveError));
    } finally {
      setSaving(false);
    }
  };

  const handleRotateCode = async () => {
    if (!project?.id) return;
    setRotating(true);
    setError('');
    setNotice('');
    try {
      const payload = await requestCanvasJson(`/api/workflow/canvases/${encodeURIComponent(project.id)}/invite-code/rotate`, {
        method: 'POST',
        body: {},
      });
      applySavedCanvas(payload.canvas);
      setNotice('已生成新邀请码，旧邀请码已失效（已解锁用户不受影响）。');
    } catch (rotateError) {
      setError(rotateError.message || String(rotateError));
    } finally {
      setRotating(false);
    }
  };

  const handleCopy = async (text, label) => {
    const ok = await copyTextToClipboard(text);
    setNotice(ok ? `已复制${label}` : `复制${label}失败，请手动选择复制`);
  };

  const savedVisibility = project?.visibility || initialSharing.visibility || 'private';
  const shareUrl = buildWorkflowShareUrl(project?.id);
  const shareWithCodeUrl = inviteInfo.code ? buildWorkflowShareUrl(project?.id, inviteInfo.code) : '';

  return ReactDOM.createPortal(
    <div className="WorkflowModal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="WorkflowModal-card"
        role="dialog"
        aria-modal="true"
        aria-label="公开与邀请设置"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="WorkflowModal-head">
          <div>
            <h3>公开与邀请设置</h3>
            <p>{project?.name || '未命名画布'} · 控制教程模版展示与访问权限</p>
          </div>
          <button type="button" className="WorkflowModal-close" aria-label="关闭" onClick={onClose}>✕</button>
        </header>

        <div className="WorkflowModal-body">
          <div className="WorkflowModal-field">
            <span className="WorkflowModal-label">可见范围</span>
            <div className="WorkflowModal-visibility-grid">
              {[
                { id: 'private', title: '私有', desc: '仅自己可见' },
                { id: 'public', title: '公开', desc: '登录后可看可复制' },
                { id: 'semi_public', title: '教程', desc: '积分或邀请码解锁' },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`WorkflowModal-visibility-option${visibility === item.id ? ' is-active' : ''}`}
                  onClick={() => setVisibility(item.id)}
                >
                  <strong>{item.title}</strong>
                  <small>{item.desc}</small>
                </button>
              ))}
            </div>
          </div>

          {visibility !== 'private' ? (
            <label className="WorkflowModal-field">
              <span className="WorkflowModal-label">模版说明（可选）</span>
              <textarea
                className="WorkflowModal-textarea"
                rows={1}
                maxLength={240}
                value={description}
                placeholder="简要说明用途或效果（展示在教程模版与解锁弹窗）"
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
          ) : null}

          {visibility === 'semi_public' ? (
            <div className="WorkflowModal-section">
              <div className="WorkflowModal-option-row">
                <label className="WorkflowModal-toggle">
                  <input
                    type="checkbox"
                    checked={allowCreditUnlock}
                    onChange={(event) => setAllowCreditUnlock(event.target.checked)}
                  />
                  <span>支持积分解锁</span>
                </label>
                {allowCreditUnlock ? (
                  <div className="WorkflowModal-credits-inline">
                    <input
                      type="number"
                      min="0.01"
                      max="100000"
                      step="1"
                      className="WorkflowModal-input"
                      value={unlockCredits}
                      onChange={(event) => setUnlockCredits(event.target.value)}
                      aria-label="解锁所需积分"
                    />
                    <span className="WorkflowModal-hint">积分</span>
                  </div>
                ) : (
                  <span className="WorkflowModal-hint">未开启</span>
                )}
              </div>

              <div className="WorkflowModal-option-row">
                <label className="WorkflowModal-toggle">
                  <input
                    type="checkbox"
                    checked={allowCodeUnlock}
                    onChange={(event) => setAllowCodeUnlock(event.target.checked)}
                  />
                  <span>支持邀请码解锁（此画布专属码）</span>
                </label>
                <span className="WorkflowModal-hint">{allowCodeUnlock ? '已开启' : '未开启'}</span>
              </div>

              {allowCodeUnlock ? (
                <>
                  <div className={inviteMode === 'rotating' ? 'WorkflowModal-grid-3' : 'WorkflowModal-grid-2'}>
                    <label className="WorkflowModal-field">
                      <span className="WorkflowModal-label">邀请码类型</span>
                      <select
                        className="WorkflowModal-select"
                        value={inviteMode}
                        onChange={(event) => setInviteMode(event.target.value)}
                      >
                        <option value="static">固定码（可手动刷新）</option>
                        <option value="rotating">动态码（定时轮换）</option>
                      </select>
                    </label>
                    {inviteMode === 'rotating' ? (
                      <label className="WorkflowModal-field">
                        <span className="WorkflowModal-label">轮换周期</span>
                        <select
                          className="WorkflowModal-select"
                          value={inviteRotateIntervalSec}
                          onChange={(event) => setInviteRotateIntervalSec(Number(event.target.value))}
                        >
                          {ROTATE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    <label className="WorkflowModal-field">
                      <span className="WorkflowModal-label">次数上限（0不限）</span>
                      <input
                        type="number"
                        min="0"
                        max="1000000"
                        className="WorkflowModal-input"
                        value={inviteMaxUses}
                        onChange={(event) => setInviteMaxUses(event.target.value)}
                      />
                    </label>
                  </div>

                  {inviteInfo.code ? (
                    <div className="WorkflowModal-code-box">
                      <div>
                        <div className="WorkflowModal-code-value">{inviteInfo.code}</div>
                        <div className="WorkflowModal-hint">
                          {inviteInfo.mode === 'rotating' && countdown
                            ? `动态码 · ${countdown} 后更新`
                            : '当前有效邀请码'}
                          {inviteInfo.maxUses > 0
                            ? ` · 已用 ${inviteInfo.usedCount}/${inviteInfo.maxUses}`
                            : ` · 已兑换 ${inviteInfo.usedCount} 次`}
                        </div>
                      </div>
                      <div className="WorkflowModal-code-actions">
                        <button
                          type="button"
                          className="WorkflowModal-btn"
                          onClick={() => handleCopy(inviteInfo.code, '邀请码')}
                        >
                          复制码
                        </button>
                        <button
                          type="button"
                          className="WorkflowModal-btn"
                          disabled={rotating}
                          onClick={handleRotateCode}
                        >
                          {rotating ? '刷新中...' : '换码'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="WorkflowModal-hint">保存教程设置后自动生成专属邀请码。</div>
                  )}
                </>
              ) : null}
            </div>
          ) : null}

          {savedVisibility !== 'private' ? (
            <div className="WorkflowModal-section">
              <div className="WorkflowModal-row">
                <span className="WorkflowModal-label">分享链接</span>
                <div className="WorkflowModal-code-actions">
                  <button
                    type="button"
                    className="WorkflowModal-btn"
                    onClick={() => handleCopy(shareUrl, '分享链接')}
                  >
                    复制链接
                  </button>
                  {savedVisibility === 'semi_public' && allowCodeUnlock && shareWithCodeUrl ? (
                    <button
                      type="button"
                      className="WorkflowModal-btn"
                      onClick={() => handleCopy(shareWithCodeUrl, '带邀请码链接')}
                    >
                      复制含码链接
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {error ? <div className="WorkflowModal-error" role="alert">{error}</div> : null}
          {notice ? <div className="WorkflowModal-notice" role="status">{notice}</div> : null}
        </div>

        <footer className="WorkflowModal-foot">
          <button type="button" className="WorkflowModal-btn" onClick={onClose}>关闭</button>
          <button type="button" className="WorkflowModal-btn is-primary" disabled={saving} onClick={handleSave}>
            {saving ? '保存中...' : '保存设置'}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

export default WorkflowShareModal;
