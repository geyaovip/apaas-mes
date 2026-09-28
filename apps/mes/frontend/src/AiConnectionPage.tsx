import { useEffect, useState } from 'react';
import { api as request } from './api';

const errorText = (error: unknown) => error instanceof Error ? error.message : '操作失败';
const api = <T,>(path: string, options: { method?: string; body?: unknown } = {}) => request<T>(path, options.body, options.method);
import './ai-connection.css';

type Settings = { configured: boolean; source: 'workspace' | 'environment' | 'none'; model: string; base_url: string; has_key: boolean; can_edit: boolean; updated_at: string | null };

export function AiConnectionPage({ embedded = false }: { embedded?: boolean }) {
  const [saved, setSaved] = useState<Settings | null>(null);
  const [model, setModel] = useState('');
  const [baseUrl, setBaseUrl] = useState('https://api.openai.com/v1');
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [tested, setTested] = useState(false);

  function apply(data: Settings) { setSaved(data); setModel(data.model); setBaseUrl(data.base_url); setApiKey(''); setTested(false); }
  useEffect(() => { api<Settings>('/ai/settings').then(apply).catch(e => setError(errorText(e))); }, []);
  async function run(kind: 'test' | 'save' | 'clear') {
    if (kind === 'clear' && !window.confirm('移除工作区模型接入配置？如果服务器配置了环境变量，移除后会恢复使用服务器配置。')) return;
    setBusy(true); setError(''); setMessage('');
    try {
      if (kind === 'clear') {
        apply(await api<Settings>('/ai/settings', { method: 'DELETE' }));
        setMessage('工作区配置已移除');
      } else {
        const body = { model: model.trim(), base_url: baseUrl.trim(), ...(apiKey.trim() ? { api_key: apiKey.trim() } : {}) };
        if (kind === 'test') {
          await api('/ai/settings/test', { method: 'POST', body });
          setTested(true); setMessage('连接成功，模型已响应测试请求。保存后即可使用 AI 助手。');
        } else {
          apply(await api<Settings>('/ai/settings', { method: 'PUT', body }));
          setMessage('模型接入配置已保存');
        }
      }
    } catch (e) { setError(errorText(e)); if (kind === 'test') setTested(false); }
    finally { setBusy(false); }
  }
  return <div className={embedded ? "ai-config-page embedded" : "ai-config-page"}>
    <div className="ai-config-heading">{embedded ? <h2>模型接入</h2> : <h1>模型接入</h1>}<p>配置兼容 OpenAI Responses API 的模型服务，供 AI 助手和业务建议使用。</p></div>
    <section className="ai-config-card" aria-label="模型连接状态">
      <div className="ai-config-row"><strong>连接状态</strong><span className={`ai-config-status ${saved?.configured ? 'is-on' : ''}`}>{saved ? (saved.configured ? '已配置' : '未配置') : '读取中'}</span></div>
      {saved?.configured && <p className="ai-config-muted">当前模型：{saved.model} · 来源：{saved.source === 'workspace' ? '工作区设置' : '服务器环境变量'}</p>}
      {saved?.updated_at && <p className="ai-config-muted">最近保存：{new Date(saved.updated_at).toLocaleString('zh-CN')}</p>}
    </section>
    <section className="ai-config-card">
      <h2>接入设置</h2>
      {!saved?.can_edit && saved && <div className="ai-config-notice">服务器尚未设置 AI_CONFIG_ENCRYPTION_KEY。请部署者配置后再保存模型密钥。</div>}
      <label>API 根地址<input type="url" autoComplete="url" placeholder="https://api.openai.com/v1" value={baseUrl} onChange={e => { setBaseUrl(e.target.value); setTested(false); }} disabled={!saved?.can_edit || busy}/></label>
      <label>模型名称<input type="text" placeholder="例如 gpt-4.1-mini" value={model} onChange={e => { setModel(e.target.value); setTested(false); }} disabled={!saved?.can_edit || busy}/></label>
      <label>API Key<input type="password" autoComplete="new-password" placeholder={saved?.has_key && baseUrl.trim() === saved.base_url ? '已保存；留空则继续使用当前密钥' : '请输入此 API 地址的 API Key'} value={apiKey} onChange={e => { setApiKey(e.target.value); setTested(false); }} disabled={!saved?.can_edit || busy}/></label>
      <p className="ai-config-muted">密钥由服务端加密保存，页面不会回显。连接测试会向模型发送一条简短请求。</p>
      {error && <div className="ai-config-error" role="alert">{error}</div>}{message && <div className="ai-config-success" role="status">{message}</div>}
      <div className="ai-config-actions"><button className="ai-config-button secondary" disabled={!saved?.can_edit || busy || !model.trim() || !baseUrl.trim()} onClick={() => void run('test')}>{busy ? '请稍候…' : '测试连接'}</button><button className="ai-config-button primary" disabled={!saved?.can_edit || busy || !model.trim() || !baseUrl.trim() || (!(saved?.has_key && baseUrl.trim() === saved.base_url) && !apiKey.trim())} onClick={() => void run('save')}>保存配置</button>{saved?.source === 'workspace' && <button className="ai-config-button text" disabled={busy} onClick={() => void run('clear')}>移除配置</button>}</div>
      {tested && <p className="ai-config-muted">测试通过。点击“保存配置”后，新会话将使用此模型。</p>}
    </section>
    <section className="ai-config-card"><h2>数据使用</h2><p className="ai-config-muted">使用 AI 助手或生成业务建议时，当前用户有权访问的相关业务数据会发送至所配置的模型服务。建议仅供人工核对，不会自动修改业务单据。</p></section>
  </div>;
}
