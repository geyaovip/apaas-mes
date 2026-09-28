import { NavLink, useLocation } from 'react-router-dom';
import { KeyRound, Sparkles } from 'lucide-react';
import { PasswordSettings } from './PasswordSettings';
import { AiConnectionPage } from './AiConnectionPage';
import './settings-page.css';

export function SettingsPage({ name, email, role, isAdmin }: { name: string; email?: string; role: string; isAdmin: boolean }) {
  const location = useLocation();
  const aiSelected = isAdmin && location.pathname === '/settings/ai';
  return <div className="settings-page">
    <header className="settings-heading"><h1>设置</h1><p>管理账号安全与应用服务。</p></header>
    <div className="settings-layout">
      <nav className="settings-nav" aria-label="设置分类"><NavLink to="/settings" end><KeyRound size={18}/>账号与安全</NavLink>{isAdmin && <NavLink to="/settings/ai"><Sparkles size={18}/>模型接入</NavLink>}</nav>
      <div className="settings-body">{aiSelected ? <AiConnectionPage embedded/> : <>
        <section className="settings-profile" aria-label="当前账号"><div className="settings-profile-avatar" aria-hidden="true">{name.slice(0, 1)}</div><div><strong>{name}</strong>{email && <span>{email}</span>}</div><span className="settings-profile-role">{role}</span></section>
        <PasswordSettings/>
      </>}</div>
    </div>
  </div>;
}
