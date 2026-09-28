import { useEffect, useState, type FormEvent } from 'react';
import './password-settings.css';

export function PasswordSettings() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) setOpen(false); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [open, busy]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (next !== confirm) { setError('两次输入的新密码不一致'); return; }
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/v1/auth/password', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_password: current, new_password: next }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error?.message || '修改密码失败');
      window.location.assign('/');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '修改密码失败'); }
    finally { setBusy(false); }
  }

  return <>
    <button type="button" className="account-password-trigger" onClick={() => setOpen(true)}>修改密码</button>
    {open && <div className="account-password-backdrop" onMouseDown={() => { if (!busy) setOpen(false); }}>
      <section className="account-password-dialog" role="dialog" aria-modal="true" aria-label="修改密码" onMouseDown={event => event.stopPropagation()}>
        <div className="account-password-head"><h2>修改密码</h2><button type="button" onClick={() => setOpen(false)} disabled={busy} aria-label="关闭">×</button></div>
        <p>修改后，所有设备都需要使用新密码重新登录。</p>
        <form onSubmit={submit}>
          <label>当前密码<input autoFocus type="password" autoComplete="current-password" value={current} onChange={event => setCurrent(event.target.value)} required/></label>
          <label>新密码<input type="password" autoComplete="new-password" minLength={12} maxLength={200} value={next} onChange={event => setNext(event.target.value)} required/></label>
          <label>确认新密码<input type="password" autoComplete="new-password" minLength={12} maxLength={200} value={confirm} onChange={event => setConfirm(event.target.value)} required/></label>
          {error && <p className="account-password-error" role="alert">{error}</p>}
          <div className="account-password-actions"><button type="button" onClick={() => setOpen(false)} disabled={busy}>取消</button><button type="submit" disabled={busy}>{busy ? '保存中…' : '保存并重新登录'}</button></div>
        </form>
      </section>
    </div>}
  </>;
}
