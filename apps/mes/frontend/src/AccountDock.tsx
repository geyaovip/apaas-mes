import { useEffect, useRef, useState } from 'react';
import { LogOut, Settings, UserRound } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import './account-dock.css';

export function AccountDock({ name, email, role, onLogout }: { name: string; email?: string; role: string; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const dock = useRef<HTMLDivElement>(null);
  const location = useLocation();
  useEffect(() => { setOpen(false); }, [location.pathname]);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    const outside = (event: MouseEvent) => { if (!dock.current?.contains(event.target as Node)) setOpen(false); };
    window.addEventListener('keydown', close); document.addEventListener('mousedown', outside);
    return () => { window.removeEventListener('keydown', close); document.removeEventListener('mousedown', outside); };
  }, [open]);
  return <div className="account-dock" ref={dock}>
    {open && <div id="account-popover" className="account-popover" aria-label="账号菜单">
      <div className="account-popover-head"><span className="account-popover-avatar" aria-hidden="true">{name.slice(0, 1) || <UserRound size={18}/>}</span><div><strong>{name}</strong>{email && <small>{email}</small>}</div></div>
      <span className="account-role">{role}</span>
      <div className="account-popover-actions"><Link to="/settings" onClick={() => setOpen(false)}><Settings size={17}/>设置</Link><button type="button" onClick={() => { setOpen(false); onLogout(); }}><LogOut size={17}/>退出登录</button></div>
    </div>}
    <button type="button" className="account-identity" aria-label={`${name}，打开账号菜单`} aria-expanded={open} aria-controls={open ? "account-popover" : undefined} onClick={() => setOpen(value => !value)}>
      <span className="account-avatar">{name.slice(0, 1) || <UserRound size={18}/>}</span><span className="account-label"><strong>{name}</strong><small>{role}</small></span>
    </button>
    <Link className="account-settings" to="/settings" aria-label="打开设置" title="设置" onClick={() => setOpen(false)}><Settings size={18}/></Link>
  </div>;
}
