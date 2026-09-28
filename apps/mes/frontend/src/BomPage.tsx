import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowLeft, ArrowRight, Plus } from 'lucide-react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, date } from './api';
import type { Bom, Page, Session } from './api';
import { MaterialPicker } from './MaterialPage';

type DraftItem = { material_id: string; component_sku: string; component_name: string; unit: string; quantity_per_unit: string; scrap_rate: string };
type BomReview = { summary: string; issues: { severity: 'high' | 'medium' | 'low'; bom_item_id: string; evidence: string; suggestion: string; confidence: number }[] };
const emptyItem = (): DraftItem => ({ material_id: '', component_sku: '', component_name: '', unit: '', quantity_per_unit: '1', scrap_rate: '0' });

export function BomsPage({ session }: { session: Session }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const copyId = searchParams.get('copy');
  const [boms, setBoms] = useState<Bom[]>([]);
  const [total, setTotal] = useState(0); const [page, setPage] = useState(1); const [search, setSearch] = useState(''); const [term, setTerm] = useState(''); const [status, setStatus] = useState('all');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [productId, setProductId] = useState('');
  const [note, setNote] = useState('');
  const [items, setItems] = useState<DraftItem[]>([emptyItem()]);

  useEffect(() => { let active = true; setLoading(true); const params = new URLSearchParams({ page: String(page) }); if (status !== 'all') params.set('status', status); if (term) params.set('q', term); api<Page<Bom>>(`/boms/page?${params}`).then(data => { if (active) { setBoms(data.items); setTotal(data.total); setError(''); } }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [page, term, status]);
  useEffect(() => {
    if (!copyId) return;
    let active = true;
    api<Bom>(`/boms/${copyId}`).then(source => {
      if (!active) return;
      setSku(source.productSku); setName(source.productName); setProductId(source.productMaterialId || ''); setNote(source.note || '');
      setItems(source.items?.map(item => ({ material_id: item.materialId || '', component_sku: item.componentSku, component_name: item.componentName, unit: item.unit, quantity_per_unit: item.quantityPerUnit, scrap_rate: item.scrapRate })) || [emptyItem()]);
      setCreating(true);
    }).catch(e => { if (active) setError(e instanceof Error ? e.message : '读取 BOM 失败'); });
    return () => { active = false; };
  }, [copyId]);
  function resetDraft() { setSku(''); setName(''); setProductId(''); setNote(''); setItems([emptyItem()]); setCreating(false); if (copyId) navigate('/boms'); }
  function change(index: number, patch: Partial<DraftItem>) { setItems(rows => rows.map((row, i) => i === index ? { ...row, ...patch } : row)); }
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const bom = await api<Bom>('/boms', { product_material_id: productId, note, items: items.map(item => ({ material_id: item.material_id, quantity_per_unit: item.quantity_per_unit, scrap_rate: item.scrap_rate })) });
      navigate(`/boms/${bom.id}`);
    } catch (e) { setError(e instanceof Error ? e.message : '保存失败'); }
    finally { setBusy(false); }
  }

  return <><div className="page-head"><div className="page-heading"><div><h1>物料清单 BOM</h1><p>按产品 SKU 管理版本，发布后用于生产计划的物料需求计算</p></div></div>{['admin','planner'].includes(session.user.role) && <button className="button primary" onClick={() => { if (copyId) navigate('/boms'); resetDraft(); setCreating(true); }}><Plus size={17}/>新建版本</button>}</div>{error && <div className="notice error" role="alert">{error}</div>}
    {creating && <section className="panel"><h2>新建 BOM 草稿</h2><form className="form" onSubmit={submit}><div className="field"><span>成品 / 半成品</span><MaterialPicker label="成品或半成品" manufactured value={productId} selectedText={`${sku} · ${name}`} onChange={material => { setProductId(material?.id || ''); setSku(material?.sku || ''); setName(material?.name || ''); setItems(rows => rows.map(row => row.material_id === material?.id ? emptyItem() : row)); }}/></div><p className="muted">先在 <Link to="/materials">物料档案</Link> 创建产品和组件。相同成品 SKU 会自动生成下一版；组件如果有已发布 BOM，计划会继续展开。</p><div className="line-editor"><div className="line-editor-head"><strong>组件明细</strong><button className="text-button" type="button" disabled={items.length >= 50} onClick={() => setItems(rows => [...rows, emptyItem()])}><Plus size={15}/>添加组件</button></div>{items.map((item,index) => <div className="bom-item-edit" key={index}><MaterialPicker label={`第${index+1}项组件`} value={item.material_id} selectedText={`${item.component_sku} · ${item.component_name} · ${item.unit}`} excludeId={productId} onChange={material => change(index,{ material_id: material?.id || '', component_sku: material?.sku || '', component_name: material?.name || '', unit: material?.unit || '' })}/><label className="field"><span>单位用量（{item.unit || '基础单位'}）</span><input aria-label={`第${index+1}项单位用量`} type="number" min="0.001" step="0.001" value={item.quantity_per_unit} onChange={e => change(index,{quantity_per_unit:e.target.value})} required/></label><label className="field"><span>损耗率（%）</span><input aria-label={`第${index+1}项损耗率`} type="number" min="0" max="99.99" step="0.01" value={item.scrap_rate} onChange={e => change(index,{scrap_rate:e.target.value})} required/></label><button type="button" className="icon-button" disabled={items.length===1} onClick={() => setItems(rows => rows.filter((_,i) => i!==index))} aria-label="删除组件">×</button></div>)}</div><label className="field"><span>备注</span><textarea rows={2} value={note} onChange={e => setNote(e.target.value)}/></label><div className="form-actions"><button className="button primary" disabled={busy}>保存草稿</button><button className="button secondary" type="button" onClick={resetDraft}>取消</button></div></form></section>}
    <section className="panel"><h2>版本列表 · 共 {total} 条</h2><div className="material-toolbar"><form onSubmit={event => { event.preventDefault(); setPage(1); setTerm(search.trim()); }}><input aria-label="搜索 BOM" placeholder="按产品 SKU 或名称搜索" value={search} onChange={event => setSearch(event.target.value)}/><button className="button secondary">搜索</button></form><select aria-label="BOM 状态" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="all">全部状态</option><option value="draft">草稿</option><option value="released">已发布</option><option value="archived">已归档</option></select></div>{loading ? <div className="loading">正在加载…</div> : boms.length ? <div className="record-list">{boms.map(bom => <Link className="record" to={`/boms/${bom.id}`} key={bom.id}><div><strong>{bom.productSku} · {bom.productName} · V{bom.revision}</strong><span>{bom._count?.items ?? 0} 种组件 · {bom._count?.plans ?? 0} 个计划引用</span></div><span className={`badge ${bom.status}`}>{bom.status==='released'?'已发布':bom.status==='archived'?'已归档':'草稿'}</span><ArrowRight size={17}/></Link>)}</div> : <div className="empty">没有匹配的 BOM。</div>}</section>{total > 20 && <div className="pager"><button className="button secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</button><span>第 {page} / {Math.ceil(total / 20)} 页 · 共 {total} 条</span><button className="button secondary" disabled={page >= Math.ceil(total / 20)} onClick={() => setPage(page + 1)}>下一页</button></div>}</>;
}

export function BomDetail({ session }: { session: Session }) {
  const { id } = useParams();
  const [bom, setBom] = useState<Bom | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState<BomReview | null>(null);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewError, setReviewError] = useState('');
  useEffect(() => { if (id) api<Bom>(`/boms/${id}`).then(setBom).catch(e => setError(e.message)); }, [id]);
  useEffect(() => { if (!id) return; let active = true; api<{ review: BomReview | null }>(`/ai/bom-reviews/${id}`).then(value => { if (active) setReview(value.review); }).catch(() => {}); return () => { active = false; }; }, [id]);
  async function runReview() {
    if (!bom) return;
    setReviewBusy(true); setReviewError('');
    try { const result = await api<{ review: BomReview }>(`/ai/bom-reviews/${bom.id}`, { version: bom.version }); setReview(result.review); }
    catch (e) { setReviewError(e instanceof Error ? e.message : 'AI 审查失败'); }
    finally { setReviewBusy(false); }
  }
  async function release() {
    if (!bom) return;
    setBusy(true); setError('');
    try { setBom(await api<Bom>(`/boms/${bom.id}/release`, { version: bom.version })); }
    catch (e) { setError(e instanceof Error ? e.message : '发布失败'); }
    finally { setBusy(false); }
  }
  if (!bom) return <>{error ? <div className="notice error" role="alert">{error}</div> : <div className="loading">正在加载…</div>}</>;
  return <><div className="page-head"><div className="page-heading"><Link className="back" to="/boms"><ArrowLeft size={18}/></Link><div><h1>{bom.productSku} · {bom.productName}</h1><p>版本 V{bom.revision} · 创建于 {date((bom as Bom & {createdAt:string}).createdAt)}</p></div></div><span className={`badge ${bom.status}`}>{bom.status==='released'?'已发布':bom.status==='archived'?'已归档':'草稿'}</span></div>{error && <div className="notice error" role="alert">{error}</div>}<div className="detail-grid"><section className="panel"><h2>组件用量</h2><div className="record-list">{bom.items?.map(item => <div className="record" key={item.id}><div><strong>{item.componentSku} · {item.componentName}</strong><span>损耗率 {item.scrapRate}%</span></div><span className="badge">{item.quantityPerUnit} {item.unit}/成品</span></div>)}</div>{bom.note && <p className="muted">备注：{bom.note}</p>}</section><aside className="panel side-panel"><h2>版本操作</h2><button className="button secondary full" type="button" onClick={runReview} disabled={reviewBusy}>{reviewBusy ? "正在审查…" : review ? "重新进行 AI 审查" : "AI 审查 BOM"}</button>{bom.status==='draft' && ['admin','planner'].includes(session.user.role) ? <button className="button primary full" onClick={release} disabled={busy}>发布 BOM</button> : <p className="muted">已发布的版本可用于新计划；创建新版并发布后，旧版会归档，已有计划的物料需求不变。</p>}{['admin','planner'].includes(session.user.role) && <Link className="button secondary full" to={`/boms?copy=${bom.id}`}>复制为新修订版</Link>}</aside></div>{reviewError && <div className="notice error" role="alert">{reviewError}</div>}{review && <section className="panel bom-review"><h2>AI 审查结果</h2><p className="muted">建议仅供核对，发布仍需人工确认。引用的行号以当前及上一版 BOM 为准。</p><p>{review.summary}</p>{review.issues.length ? <div className="record-list">{review.issues.map((issue,index) => <div className="record bom-review-issue" key={`${issue.bom_item_id}-${index}`}><div><strong>{issue.severity === "high" ? "高优先级" : issue.severity === "medium" ? "中优先级" : "低优先级"} · {bom.items?.find(item => item.id === issue.bom_item_id)?.componentSku || "上一版组件"}</strong><span>{issue.evidence}</span><span>建议：{issue.suggestion}</span><small>关联行 {issue.bom_item_id} · 置信度 {Math.round(issue.confidence * 100)}%</small></div></div>)}</div> : <p className="muted">未发现有依据的审查问题。</p>}</section>}</>;
}
