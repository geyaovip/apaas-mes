import { useEffect, useRef, useState } from 'react';
import { LogOut, Settings, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PasswordSettings } from './PasswordSettings';
import './account-dock.css';

export function AccountDock({ name, email, role, onLogout, aiSettingsHref }: { name: string; email?: string; role: string; onLogout: () => void; aiSettingsHref?: string }) {
  const [open, setOpen] = useState(false);
  const dock = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    const outside = (event: MouseEvent) => { if (!dock.current?.contains(event.target as Node)) setOpen(false); };
    window.addEventListener('keydown', close); document.addEventListener('mousedown', outside);
    return () => { window.removeEventListener('keydown', close); document.removeEventListener('mousedown', outside); };
  }, [open]);
  return <div className="account-dock" ref={dock}>
    {open && <div className="account-popover" role="menu" aria-label="账号菜单">
      <div className="account-popover-head"><strong>{name}</strong><span>{email || role}</span></div>
      <div className="account-role">{role}</div>
      <div className="account-password"><PasswordSettings/></div>
      {aiSettingsHref && <Link className="account-ai-link" role="menuitem" to={aiSettingsHref} onClick={() => setOpen(false)}><Settings size={17}/>模型接入</Link>}
      <button type="button" role="menuitem" onClick={onLogout}><LogOut size={17}/>退出登录</button>
    </div>}
    <button type="button" className="account-identity" aria-label={`${name}，打开账号菜单`} aria-expanded={open} onClick={() => setOpen(value => !value)}>
      <span className="account-avatar">{name.slice(0, 1) || <UserRound size={18}/>}</span><span className="account-label"><strong>{name}</strong><small>{role}</small></span>
    </button>
    <button type="button" className="account-settings" aria-label="账号设置" title="账号设置" aria-expanded={open} onClick={() => setOpen(value => !value)}><Settings size={18}/></button>
  </div>;
}
