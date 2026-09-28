import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from './api';
import type { CatalogMaterial, Page, Session } from './api';

export const kindName: Record<string, string> = { raw: '原材料', semi: '半成品', finished: '成品', packaging: '包材', consumable: '辅料' };
type Draft = { sku: string; name: string; kind: string; unit: string; description: string; active: boolean };
const blank = (): Draft => ({ sku: '', name: '', kind: 'raw', unit: '件', description: '', active: true });

export function MaterialPicker({ value, selectedText, onChange, manufactured = false, excludeId, label }: {
  value: string; selectedText?: string; onChange: (item: CatalogMaterial | null) => void;
  manufactured?: boolean; excludeId?: string; label: string;
}) {
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<CatalogMaterial[]>([]);
  const [error, setError] = useState('');
  const [total, setTotal] = useState(0);
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ status: 'active', page_size: '50' });
      if (search.trim()) params.set('q', search.trim());
      if (manufactured) params.set('kind', 'manufactured');
      api<Page<CatalogMaterial>>(`/materials?${params}`).then(data => { if (active) { setItems(data.items); setTotal(data.total); setError(''); } }).catch(e => { if (active) setError(e.message); });
    }, 180);
    return () => { active = false; window.clearTimeout(timer); };
  }, [search, manufactured]);
  const visible = items.filter(item => item.id !== excludeId);
  return <div className="material-picker"><input aria-label={`搜索${label}`} placeholder="输入 SKU 或名称搜索" value={search} onChange={e => setSearch(e.target.value)}/><select aria-label={label} value={value} onChange={e => onChange(items.find(item => item.id === e.target.value) || null)} required><option value="">请选择{label}</option>{value && !visible.some(item => item.id === value) && <option value={value}>{selectedText || '已选物料'}</option>}{visible.map(item => <option key={item.id} value={item.id}>{item.sku} · {item.name} · {kindName[item.kind]} · {item.unit}</option>)}</select>{error && <small className="picker-error">{error}</small>}{total > 50 && <small className="muted">共 {total} 条；请输入关键字缩小范围</small>}</div>;
}

export function MaterialsPage({ session }: { session: Session }) {
  const canEdit = ['admin', 'planner'].includes(session.user.role);
  const [items, setItems] = useState<CatalogMaterial[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [status, setStatus] = useState('all');
  const [editing, setEditing] = useState<CatalogMaterial | null>(null);
  const [draft, setDraft] = useState<Draft>(blank());
  const [showForm, setShowForm] = useState(false);
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({ page: String(page), page_size: '20', status });
    if (term) params.set('q', term);
    api<Page<CatalogMaterial>>(`/materials?${params}`).then(data => { if (active) { setItems(data.items); setTotal(data.total); setError(''); } }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [page, term, status, tick]);
  function startCreate() { setEditing(null); setDraft(blank()); setShowForm(true); setError(''); }
  function startEdit(item: CatalogMaterial) { setEditing(item); setDraft({ sku: item.sku, name: item.name, kind: item.kind, unit: item.unit, description: item.description || '', active: item.active }); setShowForm(true); setError(''); }
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setSuccess('');
    try {
      if (editing) await api(`/materials/${editing.id}`, { version: editing.version, name: draft.name, kind: draft.kind, description: draft.description, active: draft.active }, 'PATCH');
      else await api('/materials', { sku: draft.sku, name: draft.name, kind: draft.kind, unit: draft.unit, description: draft.description });
      setShowForm(false); setTick(value => value + 1); setSuccess(editing ? '物料已更新' : '物料已创建');
    } catch (e) { setError(e instanceof Error ? e.message : '保存失败'); }
    finally { setBusy(false); }
  }
  return <><div className="page-head"><div className="page-heading"><div><h1>物料档案</h1><p>先维护成品、半成品和组件，再在 BOM 中选择</p></div></div>{canEdit && <button className="button primary" onClick={startCreate}>新建物料</button>}</div><div className="material-toolbar"><form onSubmit={e => { e.preventDefault(); setTerm(search.trim()); setPage(1); }}><input aria-label="搜索物料" placeholder="按 SKU 或名称搜索" value={search} onChange={e => setSearch(e.target.value)}/><button className="button secondary">搜索</button></form><select aria-label="物料状态" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="all">全部状态</option><option value="active">启用中</option><option value="inactive">已停用</option></select></div>{error && <div className="notice error" role="alert">{error}</div>}{success && <div className="notice success" role="status">{success}</div>}
    {showForm && <section className="panel"><h2>{editing ? `编辑 ${editing.sku}` : '新建物料'}</h2><form className="form" onSubmit={submit}><div className="form-grid"><label className="field"><span>物料 SKU</span><input value={draft.sku} onChange={e => setDraft({ ...draft, sku: e.target.value })} maxLength={80} disabled={Boolean(editing)} required/></label><label className="field"><span>名称</span><input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} maxLength={200} required/></label></div><div className="form-grid"><label className="field"><span>类型</span><select value={draft.kind} onChange={e => setDraft({ ...draft, kind: e.target.value })}>{Object.entries(kindName).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label><label className="field"><span>基础单位</span><input value={draft.unit} onChange={e => setDraft({ ...draft, unit: e.target.value })} maxLength={20} disabled={Boolean(editing)} required/></label></div><label className="field"><span>规格/说明</span><textarea rows={2} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })}/></label>{editing && <label className="material-status"><input type="checkbox" checked={draft.active} onChange={e => setDraft({ ...draft, active: e.target.checked })}/>启用该物料</label>}<p className="muted">成品和半成品目前以“件”为单位；SKU 和基础单位创建后固定。已发布 BOM 使用的物料不能停用，修改名称不会改写历史 BOM。</p><div className="form-actions"><button className="button primary" disabled={busy}>保存物料</button><button className="button secondary" type="button" onClick={() => setShowForm(false)}>取消</button></div></form></section>}
    <section className="panel"><h2>物料列表 · 共 {total} 条</h2>{items.length ? <div className="record-list">{items.map(item => <div className="record" key={item.id}><div><strong>{item.sku} · {item.name}</strong><span>{kindName[item.kind] || item.kind} · 单位 {item.unit}{item.description ? ` · ${item.description}` : ''}</span></div><span className={`badge ${item.active ? 'released' : 'archived'}`}>{item.active ? '启用' : '停用'}</span>{canEdit && <button className="button secondary" onClick={() => startEdit(item)}>编辑</button>}</div>)}</div> : <div className="empty">暂无物料。请先建立成品和组件档案。</div>}</section>{total > 20 && <div className="pager"><button className="button secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</button><span>第 {page} / {Math.ceil(total / 20)} 页</span><button className="button secondary" disabled={page >= Math.ceil(total / 20)} onClick={() => setPage(page + 1)}>下一页</button></div>}<p className="muted"><Link to="/boms">返回物料清单 BOM</Link></p></>;
}
