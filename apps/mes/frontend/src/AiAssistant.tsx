import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowUp, History, Plus, Sparkles, Trash2, X } from 'lucide-react';
import './ai.css';

type Variant = 'crm' | 'mes' | 'erp';
type Turn = { role: 'user' | 'assistant'; content: string };
type Context = { type: string; id?: string; label: string; href: string };
type Conversation = { id: string; title: string; contextType: string; contextId: string | null; updatedAt: string };

async function request<T>(path: string, body?: unknown, method?: string): Promise<T> {
  const response = await fetch(`/api/v1/ai${path}`, { method: method || (body === undefined ? 'GET' : 'POST'), credentials: 'include', headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || 'AI 服务请求失败');
  return data as T;
}

function pageContext(variant: Variant, pathname: string): Context {
  const parts = pathname.split('/').filter(Boolean);
  const id = parts[1];
  if (variant === 'crm' && id && ['leads', 'customers', 'opportunities'].includes(parts[0])) {
    const labels: Record<string, string> = { leads: '当前线索', customers: '当前客户', opportunities: '当前商机' };
    const types: Record<string, string> = { leads: 'lead', customers: 'customer', opportunities: 'opportunity' };
    return { type: types[parts[0]], id, label: labels[parts[0]], href: pathname };
  }
  if (variant === 'mes' && id && ['boms', 'plans'].includes(parts[0])) return { type: parts[0] === 'boms' ? 'bom' : 'plan', id, label: parts[0] === 'boms' ? '当前 BOM' : '当前生产计划', href: pathname };
  if (variant === 'erp' && id && ['purchases', 'contracts'].includes(parts[0])) return { type: parts[0] === 'purchases' ? 'purchase' : 'contract', id, label: parts[0] === 'purchases' ? '当前采购单' : '当前销售合同', href: pathname };
  return { type: 'dashboard', label: variant === 'crm' ? '销售工作台' : variant === 'mes' ? '车间工作台' : '经营概览', href: '/' };
}

function suggestions(variant: Variant, type: string) {
  if (variant === 'crm') return type === 'dashboard' ? ['今天应优先处理什么？'] : ['总结当前记录并给出下一步', '起草一条跟进记录'];
  if (variant === 'mes') return type === 'bom' ? ['复核这个 BOM 版本，指出变更和需核实项'] : type === 'plan' ? ['总结当前生产计划及待核实风险'] : ['概览当前生产情况'];
  return type === 'contract' ? ['检查当前合同的发货与库存风险'] : type === 'purchase' ? ['检查当前采购单的入库进度'] : ['总结当前经营待办'];
}

export function AiAssistant({ variant }: { variant: Variant }) {
  const location = useLocation();
  const current = pageContext(variant, location.pathname);
  const [open, setOpen] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [context, setContext] = useState<Context>(current);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [source, setSource] = useState<{ title: string; href: string } | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const tail = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLElement>(null);

  useEffect(() => { setContext(current); setConversationId(null); setMessages([]); setSource(null); setError(''); }, [location.pathname]);
  useEffect(() => {
    if (!open) return;
    request<{ configured: boolean }>('/status').then(value => setConfigured(value.configured)).catch(e => setError(e.message));
    request<Conversation[]>('/conversations').then(setConversations).catch(e => setError(e.message));
    window.requestAnimationFrame(() => dialog.current?.querySelector<HTMLElement>('.ai-head button')?.focus());
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); }
      if (event.key === 'Tab' && dialog.current) {
        const focusable = [...dialog.current.querySelectorAll<HTMLElement>('button:not([disabled]), textarea:not([disabled]), a[href]')].filter(item => item.getClientRects().length);
        if (!focusable.length) return;
        if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable.at(-1)?.focus(); }
        else if (!event.shiftKey && document.activeElement === focusable.at(-1)) { event.preventDefault(); focusable[0].focus(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  useEffect(() => { tail.current?.scrollIntoView({ block: 'end' }); }, [messages, busy]);

  function startNew() { setContext(current); setConversationId(null); setMessages([]); setSource(null); setDraft(''); setError(''); setHistoryOpen(false); setConfirmDeleteId(null); input.current?.focus(); }
  async function loadConversation(row: Conversation) {
    setError(''); setHistoryOpen(false); setConfirmDeleteId(null);
    try {
      const full = await request<{ messages: Turn[] }>(`/conversations/${row.id}`);
      setConversationId(row.id); setMessages(Array.isArray(full.messages) ? full.messages : []);
      setContext({ type: row.contextType, id: row.contextId || undefined, label: row.title, href: row.contextId ? `/${{ lead: 'leads', customer: 'customers', opportunity: 'opportunities', bom: 'boms', plan: 'plans', purchase: 'purchases', contract: 'contracts' }[row.contextType] || ''}/${row.contextId}` : '/' });
      setSource(null);
    } catch (e) { setError(e instanceof Error ? e.message : '对话加载失败'); }
  }
  async function removeConversation(row: Conversation) {
    setError('');
    try {
      await request(`/conversations/${row.id}`, undefined, 'DELETE');
      setConversations(items => items.filter(item => item.id !== row.id)); setConfirmDeleteId(null);
      if (conversationId === row.id) startNew();
    } catch (e) { setError(e instanceof Error ? e.message : '删除对话失败'); }
  }
  async function send(value: string) {
    const message = value.trim(); if (!message || busy || !configured) return;
    setBusy(true); setError(''); setDraft('');
    try {
      const result = await request<{ conversation_id: string; messages: Turn[]; sources: { title: string; href: string }[] }>('/chat', { conversation_id: conversationId || undefined, context_type: context.type, context_id: context.id, message });
      setConversationId(result.conversation_id); setMessages(result.messages); setSource(result.sources[0] || null);
      setConversations(await request<Conversation[]>('/conversations'));
    } catch (e) { setDraft(message); setError(e instanceof Error ? e.message : '回答失败'); }
    finally { setBusy(false); input.current?.focus(); }
  }
  function submit(event: FormEvent) { event.preventDefault(); void send(draft); }

  return <>
    <button ref={trigger} type="button" className={`ai-trigger ai-${variant}`} onClick={() => setOpen(true)} aria-label="打开 AI 助手" aria-haspopup="dialog" aria-expanded={open}><Sparkles size={19}/><span>AI 助手</span></button>
    {open && <div className="ai-layer"><button className="ai-scrim" type="button" aria-label="关闭 AI 助手" onClick={() => { setOpen(false); trigger.current?.focus(); }}/><section ref={dialog} className="ai-drawer" role="dialog" aria-modal="true" aria-label="AI 业务助手"><header className="ai-head"><div><small>业务助手</small><h2><Sparkles size={19}/> AI 助手</h2></div><button type="button" className="ai-icon" onClick={() => { setOpen(false); trigger.current?.focus(); }} aria-label="关闭"><X size={20}/></button></header>
      <div className="ai-toolbar"><button type="button" onClick={startNew}><Plus size={15}/>新对话</button><button type="button" onClick={() => setHistoryOpen(value => !value)} aria-expanded={historyOpen}><History size={15}/>历史对话</button></div>
      {historyOpen && <div className="ai-history">{conversations.length ? conversations.map(row => <div className="ai-history-row" key={row.id}><button type="button" onClick={() => void loadConversation(row)}><strong>{row.title}</strong><small>{new Date(row.updatedAt).toLocaleString('zh-CN')}</small></button><button type="button" className="ai-history-delete" aria-label={confirmDeleteId === row.id ? `确认删除对话 ${row.title}` : `删除对话 ${row.title}`} onClick={() => confirmDeleteId === row.id ? void removeConversation(row) : setConfirmDeleteId(row.id)}>{confirmDeleteId === row.id ? '确认' : <Trash2 size={15}/>}</button></div>) : <p>暂无历史对话</p>}</div>}
      <div className="ai-context"><span>参考范围</span><strong>{context.label}</strong>{context.href !== location.pathname && <Link to={context.href} onClick={() => setOpen(false)}>查看记录</Link>}</div>
      <div className="ai-messages" aria-live="polite">{!messages.length && <div className="ai-welcome"><Sparkles size={26}/><h3>从业务数据开始提问</h3><p>助手会读取你有权限查看的当前记录，并把结论与建议分开说明。</p><div className="ai-suggestions">{suggestions(variant, context.type).map(value => <button type="button" key={value} disabled={!configured || busy} onClick={() => void send(value)}>{value}</button>)}</div></div>}{messages.map((turn, index) => <div key={index} className={`ai-message ${turn.role}`}><span>{turn.role === 'user' ? '你' : 'AI 助手'}</span><p>{turn.content}</p></div>)}{busy && <p className="ai-thinking">正在分析当前业务数据…</p>}<div ref={tail}/></div>
      {source && <div className="ai-source">依据：<Link to={source.href} onClick={() => setOpen(false)}>{source.title}</Link></div>}
      {configured === false && <div className="ai-unavailable" role="status">AI 服务尚未配置。管理员配置模型后即可使用。</div>}
      {error && <div className="ai-error" role="alert">{error}</div>}
      <form className="ai-composer" onSubmit={submit}><textarea ref={input} aria-label="向 AI 助手提问" placeholder={configured === false ? '等待管理员配置模型' : '输入业务问题…'} value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(draft); } }} rows={2} maxLength={2000} disabled={!configured || busy}/><button type="submit" aria-label="发送问题" disabled={!draft.trim() || !configured || busy}><ArrowUp size={18}/></button></form><p className="ai-foot">AI 建议需人工核实；不会自动修改业务数据。</p>
    </section></div>}
  </>;
}
