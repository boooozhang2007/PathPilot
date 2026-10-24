'use client';
// 模型管理页（任务1）：填写 baseUrl + API Key → 拉取模型列表 → 设置当前模型
import { useEffect, useState } from 'react';
import { API_BASE } from '@/lib/api';

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
      setMsg('已保存，即刻生效');
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
      <main className="flex min-h-screen items-center justify-center bg-paper px-4">
        <div className="pp-card w-full max-w-sm p-6">
          <div className="mb-4 text-center">
            <div className="text-lg font-black">PathPilot 模型管理</div>
            <div className="mt-1 text-xs text-slate-1">输入管理密钥进入</div>
          </div>
          <input className="pp-input mb-3" type="password" placeholder="ADMIN_KEY" value={adminKey} onChange={(e) => setAdminKey(e.target.value)} />
          {err && <div className="mb-3 rounded-lg bg-accent-soft px-3 py-2 text-xs text-accent">{err}</div>}
          <button className="pp-btn pp-btn-primary w-full py-2.5 text-sm" onClick={() => load(adminKey)} disabled={!adminKey || !!busy}>
            {busy || '进入'}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">模型管理</h1>
        <div className="text-xs text-slate-1">Agent LLM 配置 · 即时生效</div>
      </div>
      {err && <div className="mb-4 rounded-card bg-accent-soft px-4 py-3 text-sm text-accent">{err}</div>}
      {msg && <div className="mb-4 rounded-card bg-teal-soft px-4 py-3 text-sm text-teal">{msg}</div>}
      {busy && <div className="mb-4 rounded-card bg-paper-2 px-4 py-3 text-sm text-slate-1">{busy}</div>}

      <div className="pp-card mb-5 space-y-4 p-6">
        <div>
          <label className="pp-label">Base URL（OpenAI 兼容端点）</label>
          <input className="pp-input" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.deepseek.com" />
        </div>
        <div>
          <label className="pp-label">API Key{apiKeySet && <span className="ml-2 text-teal">已配置（留掩码不变则保留原值）</span>}</label>
          <input className="pp-input" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-…" type="password" />
        </div>
        <div className="flex gap-2">
          <button className="pp-btn pp-btn-ghost flex-1 py-2.5 text-sm" onClick={fetchModels} disabled={!!busy}>获取模型</button>
          <button className="pp-btn pp-btn-primary flex-1 py-2.5 text-sm" onClick={save} disabled={!!busy}>保存配置</button>
        </div>
        {remoteModels.length > 0 && (
          <div className="max-h-44 overflow-y-auto rounded-xl border border-line bg-paper-2/50 p-2">
            {remoteModels.map((m) => (
              <button
                key={m}
                className={`block w-full rounded-lg px-3 py-1.5 text-left text-xs transition hover:bg-white ${model === m ? 'bg-white font-bold text-accent' : 'text-slate-1'}`}
                onClick={() => setModel(m)}
              >
                {m} {model === m && '✓'}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="pp-card p-6">
        <div className="mb-3 text-sm font-bold">当前模型：<span className="font-mono text-accent">{model || '未设置'}</span></div>
        <div className="mb-2 text-xs font-semibold text-slate-1">可选模型目录（前端选择器同步展示）</div>
        <div className="space-y-2">
          {catalog.map((c) => (
            <button
              key={c.id}
              className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left text-sm transition ${model === c.id ? 'border-accent bg-accent-soft' : 'border-line hover:border-ink'}`}
              onClick={() => setModel(c.id)}
            >
              <span className="font-semibold">{c.name}</span>
              <span className="font-mono text-xs text-slate-1">{c.id} · {c.price}</span>
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}
