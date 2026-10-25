'use client';
// 模型管理页:Base URL + API Key → 拉取模型列表 → 设置当前模型
import { useEffect, useState } from 'react';
import { API_BASE } from '@/lib/api';
import { Ic, Logo } from '@/components/Icon';

interface CatalogItem {
  id: string;
  name: string;
  price: string;
}

export default function AdminPage() {
  const [adminKey, setAdminKey] = useState('');
  const [authed, setAuthed] = useState(false);
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiKeySet, setApiKeySet] = useState(false);
  const [model, setModel] = useState('');
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [remoteModels, setRemoteModels] = useState<string[]>([]);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');

  useEffect(() => {
    const saved = localStorage.getItem('pp_admin_key');
    if (saved) {
      setAdminKey(saved);
      load(saved);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load(key: string) {
    setBusy('读取配置…');
    setErr('');
    try {
      const res = await fetch(`${API_BASE}/api/admin/llm`, { headers: { 'x-admin-key': key } });
      if (!res.ok) throw new Error((await res.json())?.error?.message ?? '密钥不正确');
      const d = await res.json();
      setBaseUrl(d.baseUrl);
      setApiKey(d.apiKey);
      setApiKeySet(d.apiKeySet);
      setModel(d.model);
      setCatalog(d.catalog);
      setAuthed(true);
      localStorage.setItem('pp_admin_key', key);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '读取失败');
      setAuthed(false);
    } finally {
      setBusy('');
    }
  }

  async function save() {
    setBusy('保存…');
    setErr('');
    setMsg('');
    try {
      const res = await fetch(`${API_BASE}/api/admin/llm`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify({ baseUrl, apiKey: apiKey.includes('…') ? undefined : apiKey, model }),
      });
      if (!res.ok) throw new Error((await res.json())?.error?.message ?? '保存失败');
      setMsg('已保存,即刻生效');
      await load(adminKey);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '保存失败');
    } finally {
      setBusy('');
    }
  }

  async function fetchModels() {
    setBusy('获取模型列表…');
    setErr('');
    try {
      const res = await fetch(`${API_BASE}/api/admin/llm/models`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify({ baseUrl, apiKey: apiKey.includes('…') ? undefined : apiKey }),
      });
      if (!res.ok) throw new Error((await res.json())?.error?.message ?? '获取失败');
      const d = await res.json();
      setRemoteModels(d.models);
      setMsg(`获取到 ${d.models.length} 个模型`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '获取失败');
    } finally {
      setBusy('');
    }
  }

  if (!authed) {
    return (
      <main className="bp-grid flex min-h-screen items-center justify-center bg-paper px-4">
        <div className="pp-anim pp-card w-full max-w-sm p-6">
          <div className="mb-5 flex flex-col items-center gap-2.5">
            <Logo size={38} />
            <div className="font-display text-lg font-bold">PathPilot 模型管理</div>
            <div className="num text-[10px] tracking-[0.2em] text-slate-2">ADMIN CONSOLE</div>
          </div>
          <input className="pp-input mb-3" type="password" placeholder="ADMIN_KEY" value={adminKey} onChange={(e) => setAdminKey(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && adminKey && load(adminKey)} />
          {err && (
            <div className="mb-3 flex items-center gap-1.5 rounded-lg bg-[#fdf1ef] px-3 py-2 text-xs text-[#b3271d]">
              <Ic name="warn" size={12} /> {err}
            </div>
          )}
          <button className="pp-btn pp-btn-primary w-full py-2.5 text-sm" onClick={() => load(adminKey)} disabled={!adminKey || !!busy}>
            {busy || '进入'}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="bp-grid min-h-screen bg-paper px-6 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <div className="eyebrow mb-1.5">ADMIN</div>
            <h1 className="font-display text-2xl font-bold">模型管理</h1>
          </div>
          <div className="num text-[10px] tracking-widest text-slate-2">LLM CONFIG</div>
        </div>
        {err && <div className="mb-4 flex items-center gap-2 rounded-card border border-[#e8b4ae] bg-[#fdf1ef] px-4 py-3 text-sm text-[#b3271d]"><Ic name="warn" size={14} />{err}</div>}
        {msg && <div className="mb-4 flex items-center gap-2 rounded-card bg-teal-soft px-4 py-3 text-sm text-teal"><Ic name="checkCircle" size={14} />{msg}</div>}
        {busy && <div className="mb-4 rounded-card bg-paper-2 px-4 py-3 text-sm text-slate-1">{busy}</div>}

        <div className="pp-card mb-5 space-y-4 p-6">
          <div>
            <label className="pp-label">Base URL(OpenAI 兼容端点)</label>
            <input className="pp-input" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.deepseek.com" />
          </div>
          <div>
            <label className="pp-label">
              API Key
              {apiKeySet && <span className="ml-2 font-normal text-teal">已配置(留掩码不变则保留原值)</span>}
            </label>
            <input className="pp-input" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-…" type="password" />
          </div>
          <div className="flex gap-2">
            <button className="pp-btn pp-btn-ghost flex-1 py-2.5 text-sm" onClick={fetchModels} disabled={!!busy}>
              <Ic name="download" size={14} /> 获取模型
            </button>
            <button className="pp-btn pp-btn-primary flex-1 py-2.5 text-sm" onClick={save} disabled={!!busy}>
              <Ic name="check" size={14} /> 保存配置
            </button>
          </div>
          {remoteModels.length > 0 && (
            <div className="max-h-44 overflow-y-auto rounded-lg border border-line bg-paper/60 p-2">
              {remoteModels.map((m) => (
                <button
                  key={m}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-xs transition hover:bg-white ${model === m ? 'bg-white font-bold text-accent-deep' : 'text-slate-1'}`}
                  onClick={() => setModel(m)}
                >
                  <span className="num min-w-0 flex-1 truncate">{m}</span>
                  {model === m && <Ic name="check" size={13} strokeWidth={2.6} className="text-accent" />}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="pp-card p-6">
          <div className="mb-3 text-sm font-bold">
            当前模型:<span className="num text-accent-deep">{model || '未设置'}</span>
          </div>
          <div className="num mb-2 text-[10px] tracking-[0.2em] text-slate-2">CATALOG</div>
          <div className="space-y-2">
            {catalog.map((c) => (
              <button
                key={c.id}
                className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left text-sm transition ${model === c.id ? 'border-accent bg-accent-soft' : 'border-line hover:border-ink'}`}
                onClick={() => setModel(c.id)}
              >
                <span className="font-semibold">{c.name}</span>
                <span className="num text-xs text-slate-1">
                  {c.id} · {c.price}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
