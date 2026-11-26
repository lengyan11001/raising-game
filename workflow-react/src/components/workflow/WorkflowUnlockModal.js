import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { requestCanvasJson } from './canvasApi';
import './WorkflowModals.css';

export function WorkflowUnlockModal({
  template,
  initialCode = '',
  initialError = '',
  onClose,
  onUnlocked,
}) {
  const [inviteCode, setInviteCode] = useState(String(initialCode || ''));
  const [busyMethod, setBusyMethod] = useState('');
  const [error, setError] = useState(String(initialError || ''));
  const [insufficientCredits, setInsufficientCredits] = useState(false);

  useEffect(() => {
    setInviteCode(String(initialCode || ''));
  }, [initialCode, template?.id]);

  useEffect(() => {
    setError(String(initialError || ''));
    setInsufficientCredits(false);
  }, [initialError, template?.id]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !busyMethod) onClose?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [busyMethod, onClose]);

  if (!template?.id) return null;

  const canCreditUnlock = Boolean(template.allowCreditUnlock && Number(template.unlockCredits || 0) > 0);
  const canCodeUnlock = Boolean(template.allowCodeUnlock !== false || !canCreditUnlock);
  const userCredits = Number(template.userCredits ?? window.getPlatformAuthState?.()?.user?.credits ?? 0);
  const unlockCost = Number(template.unlockCredits || 0);
  const coverImage = template.thumbnailUrl || '';
  const coverVideo = !coverImage ? (template.thumbnailVideoUrl || '') : '';

  const unlockWithCredits = async () => {
    if (!canCreditUnlock || busyMethod) return;
    setBusyMethod('credits');
    setError('');
    setInsufficientCredits(false);
    try {
      const payload = await requestCanvasJson(`/api/workflow/canvases/${encodeURIComponent(template.id)}/unlock`, {
        method: 'POST',
        body: { method: 'credits' },
      });
      if (payload.user && typeof window.syncPlatformUser === 'function') {
        window.syncPlatformUser(payload.user);
      }
      onUnlocked?.(payload);
    } catch (unlockError) {
      if (unlockError.code === 'INSUFFICIENT_CREDITS' || unlockError.status === 402) {
        setInsufficientCredits(true);
      }
      setError(unlockError.message || String(unlockError));
    } finally {
      setBusyMethod('');
    }
  };

  const unlockWithCode = async (event) => {
    event?.preventDefault?.();
    if (!canCodeUnlock || busyMethod) return;
    const code = inviteCode.trim();
    if (!code) {
      setError('请输入该画布的邀请码。');
      return;
    }
    setBusyMethod('invite_code');
    setError('');
    setInsufficientCredits(false);
    try {
      const payload = await requestCanvasJson(`/api/workflow/canvases/${encodeURIComponent(template.id)}/unlock`, {
        method: 'POST',
        body: { method: 'invite_code', inviteCode: code },
      });
      onUnlocked?.(payload);
    } catch (unlockError) {
      setError(unlockError.message || String(unlockError));
    } finally {
      setBusyMethod('');
    }
  };

  const openTopup = () => {
    onClose?.();
    if (typeof window.openPlatformTopupTab === 'function') window.openPlatformTopupTab();
  };

  return ReactDOM.createPortal(
    <div className="WorkflowModal-backdrop" role="presentation" onClick={() => !busyMethod && onClose?.()}>
      <div
        className="WorkflowModal-card"
        role="dialog"
        aria-modal="true"
        aria-label="解锁半公开画布模版"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="WorkflowModal-head">
          <div>
            <h3>解锁半公开画布</h3>
            <p>未解锁前无法查看节点结构与提示词，解锁后可完整查看并复制到我的画布</p>
          </div>
          <button type="button" className="WorkflowModal-close" aria-label="关闭" disabled={Boolean(busyMethod)} onClick={onClose}>✕</button>
        </header>

        <div className="WorkflowModal-body">
          <div className="WorkflowUnlock-preview">
            <div className="WorkflowUnlock-cover">
              {coverImage ? (
                <img src={coverImage} alt={template.name || '模版封面'} />
              ) : coverVideo ? (
                <video src={coverVideo} muted playsInline preload="metadata" />
              ) : (
                <i className="bi bi-lock-fill" aria-hidden="true" />
              )}
            </div>
            <div className="WorkflowUnlock-meta">
              <strong>{template.name || '半公开画布'}</strong>
              <small>
                {template.ownerName ? `作者：${template.ownerName}` : '半公开模版'}
                {template.description ? ` · ${template.description}` : ''}
              </small>
            </div>
          </div>

          {canCodeUnlock ? (
            <form className="WorkflowModal-section" onSubmit={unlockWithCode}>
              <span className="WorkflowModal-label">方式一：使用邀请码解锁</span>
              <div className="WorkflowUnlock-code-row">
                <input
                  type="text"
                  className="WorkflowModal-input"
                  value={inviteCode}
                  maxLength={32}
                  placeholder="输入作者分享的专属邀请码"
                  disabled={Boolean(busyMethod)}
                  onChange={(event) => setInviteCode(event.target.value)}
                />
                <button
                  type="submit"
                  className="WorkflowModal-btn is-primary"
                  disabled={Boolean(busyMethod) || !inviteCode.trim()}
                >
                  {busyMethod === 'invite_code' ? '验证中...' : '验证并进入'}
                </button>
              </div>
              <span className="WorkflowModal-hint">验证通过后将永久保留你的解锁权限，即使后续邀请码刷新也无需重复输入。</span>
            </form>
          ) : null}

          {canCreditUnlock ? (
            <div className="WorkflowModal-section">
              <div className="WorkflowModal-row">
                <div>
                  <div className="WorkflowModal-label">{canCodeUnlock ? '方式二：积分解锁' : '积分解锁'}</div>
                  <div className="WorkflowModal-hint">
                    需要 <strong>{unlockCost}</strong> 积分 · 当前可用余额 <strong>{Number.isFinite(userCredits) ? userCredits : 0}</strong> 积分
                  </div>
                </div>
                <div className="WorkflowModal-code-actions">
                  {insufficientCredits || userCredits < unlockCost ? (
                    <button type="button" className="WorkflowModal-btn" onClick={openTopup}>
                      去充值积分
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="WorkflowModal-btn is-primary"
                    disabled={Boolean(busyMethod)}
                    onClick={unlockWithCredits}
                  >
                    {busyMethod === 'credits' ? '解锁中...' : `消耗 ${unlockCost} 积分解锁`}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {error ? <div className="WorkflowModal-error" role="alert">{error}</div> : null}
        </div>

        <footer className="WorkflowModal-foot">
          <button type="button" className="WorkflowModal-btn" disabled={Boolean(busyMethod)} onClick={onClose}>
            暂不解锁
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

export default WorkflowUnlockModal;
