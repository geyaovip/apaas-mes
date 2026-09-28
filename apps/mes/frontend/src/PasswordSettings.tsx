import { useState, type FormEvent } from 'react';
import './password-settings.css';

export function PasswordSettings() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

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

  return <section className="password-panel" aria-labelledby="password-title">
    <div className="password-panel-heading"><h2 id="password-title">修改密码</h2><p>保存后，其他设备上的会话也会失效。</p></div>
    <form onSubmit={submit}>
      <label>当前密码<input type="password" autoComplete="current-password" value={current} onChange={event => setCurrent(event.target.value)} required/></label>
      <label>新密码<input type="password" autoComplete="new-password" minLength={12} maxLength={200} value={next} onChange={event => setNext(event.target.value)} required/><small>至少 12 位</small></label>
      <label>确认新密码<input type="password" autoComplete="new-password" minLength={12} maxLength={200} value={confirm} onChange={event => setConfirm(event.target.value)} required/></label>
      {error && <p className="password-error" role="alert">{error}</p>}
      <div className="password-actions"><button type="submit" disabled={busy}>{busy ? '保存中…' : '保存并重新登录'}</button></div>
    </form>
  </section>;
}
