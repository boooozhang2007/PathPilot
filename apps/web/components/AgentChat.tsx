'use client';
// Agent 对话组件（真实 /api/agent/chat）：仪表盘与 AI 顾问页共用
// 含模型选择（目录来自 /api/agent/models）、工具调用链路展示、Markdown 渲染
import { useEffect, useRef, useState } from 'react';
import { api, API_BASE, getToken } from '@/lib/api';
import { Markdown } from '@/components/Markdown';
import type { ChatMessageDTO, ModelCatalogItem } from '@pathpilot/shared';

export const DEFAULT_SUGGESTIONS = ['我目前最应该学习什么？', '帮我分析北京的 Java 岗位', '把每周改成 8 小时并重新规划', '在规划里加一个 Redis 学习任务'];

export function AgentChat({
  heightClass = 'h-[60vh]',
  showModel = false,
  suggestions = DEFAULT_SUGGESTIONS,
}: {
  heightClass?: string;
  showModel?: boolean;
  suggestions?: string[];
}) {
  const [sessionId, setSessionId] = useState<number | undefined>();
  const [messages, setMessages] = useState<ChatMessageDTO[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  // 流式状态：正在生成的那条消息
  const [streaming, setStreaming] = useState<{ text: string; thinking: string; tools: { name: string; status: 'running' | 'done'; summary?: string }[] } | null>(null);
  const [catalog, setCatalog] = useState<ModelCatalogItem[]>([]);
  const [currentModel, setCurrentModel] = useState('');
  const [configured, setConfigured] = useState(false);
  const [availability, setAvailability] = useState<Record<string, { available: boolean; error?: string }> | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<{ catalog: ModelCatalogItem[]; current: string; configured: boolean; availability: Record<string, { available: boolean; error?: string }> | null }>('/api/agent/models?probe=1')
      .then((m) => {
        setCatalog(m.catalog);
        setCurrentModel(localStorage.getItem('pp_model') ?? m.current);
        setConfigured(m.configured);
        setAvailability(m.availability);
      })
      .catch(() => {});
    api<{ sessionId: number; messages: ChatMessageDTO[] } | null>('/api/agent/session')
      .then((s) => {
        if (s) {
          setSessionId(s.sessionId);
          setMessages(s.messages);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  function pickModel(id: string) {
    setCurrentModel(id);
    localStorage.setItem('pp_model', id);
  }

  async function send(text?: string) {
    const message = (text ?? input).trim();
    if (!message || busy) return;
    setInput('');
    setErr('');
    setBusy(true);
    setStreaming({ text: '', thinking: '', tools: [] });
    setMessages((prev) => [...prev, { id: Date.now(), sessionId: sessionId ?? 0, role: 'user', content: message, engine: null, toolCalls: [], createdAt: new Date().toISOString() }]);
    try {
      const token = getToken() ?? '';
      const res = await fetch(`${API_BASE}/api/agent/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ sessionId, message, model: currentModel || undefined }),
      });
      if (!res.ok || !res.body) throw new Error(`请求失败(${res.status})`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let doneEngine: string | undefined;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop() ?? '';
        for (const part of parts) {
          const line = part.split('\n').find((l) => l.startsWith('data: '));
          if (!line) continue;
          let ev: { type: string; delta?: string; name?: string; summary?: string; engine?: string; model?: string; fallbackReason?: string; sessionId?: number };
          try {
            ev = JSON.parse(line.slice(6));
          } catch {
            continue;
          }
          if (ev.sessionId) setSessionId(ev.sessionId);
          setStreaming((st) => {
            const cur = st ?? { text: '', thinking: '', tools: [] };
            switch (ev.type) {
              case 'thinking':
                return { ...cur, thinking: cur.thinking + (ev.delta ?? '') };
              case 'text':
                return { ...cur, text: cur.text + (ev.delta ?? '') };
              case 'tool_start':
                return { ...cur, tools: [...cur.tools, { name: ev.name ?? '', status: 'running' }] };
              case 'tool_end': {
                const tools = cur.tools.map((t) => (t.name === ev.name && t.status === 'running' ? { ...t, status: 'done' as const, summary: ev.summary } : t));
                return { ...cur, tools };
              }
              default:
                return cur;
            }
          });
          if (ev.type === 'done') {
            doneEngine = ev.engine;
            if (ev.fallbackReason) setErr(ev.fallbackReason);
          }
        }
      }
      // 流结束：把流式消息落为正式消息
      setStreaming((st) => {
        if (st && st.text.trim()) {
          setMessages((prev) => [
            ...prev,
            {
              id: Date.now(),
              sessionId: sessionId ?? 0,
              role: 'assistant',
              content: st.text,
              engine: (doneEngine as 'pi-llm' | 'rules') ?? null,
              toolCalls: st.tools.filter((t) => t.status === 'done').map((t) => ({ name: t.name, summary: t.summary ?? '' })),
              createdAt: new Date().toISOString(),
            },
          ]);
        }
        return null;
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : '发送失败');
      setStreaming(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col p-0">
      {showModel && (
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <div className="text-xs font-semibold text-slate-1">模型</div>
          <select className="pp-input w-60 py-1.5 text-xs" value={currentModel} onChange={(e) => pickModel(e.target.value)} disabled={!configured}>
            {catalog.map((c) => {
              const avail = availability?.[c.id];
              return (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.price}
                  {avail ? (avail.available ? ' ✓' : ' ✕不可用') : ''}
                </option>
              );
            })}
          </select>
        </div>
      )}
      <div ref={listRef} className={`flex-1 space-y-4 overflow-y-auto p-5 ${heightClass}`}>
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className="text-sm font-bold text-slate-1">直接让我查数据、改规划、更新任务</div>
            <div className="flex max-w-md flex-wrap justify-center gap-2">
              {suggestions.map((s) => (
                <button key={s} className="rounded-full border border-line bg-paper-2 px-3 py-1.5 text-xs transition hover:border-accent hover:text-accent" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] ${m.role === 'user' ? '' : 'w-full'}`}>
              <div
                className={`rounded-2xl px-4 py-2.5 text-sm leading-6 ${
                  m.role === 'user' ? 'ml-auto max-w-[85%] rounded-br-sm bg-ink text-white' : 'w-full rounded-bl-sm border border-line bg-white'
                }`}
              >
                {m.role === 'user' ? <span className="whitespace-pre-wrap">{m.content}</span> : <Markdown text={m.content} />}
              </div>
              {m.role === 'assistant' && m.toolCalls.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {m.toolCalls.map((tc, i) => (
                    <details key={i} className="group rounded-lg border border-line bg-paper-2/60 px-3 py-2">
                      <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-semibold text-slate-1">
                        <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-accent text-[10px] text-white">{i + 1}</span>
                        <span className="font-mono text-[11px] text-ink">{tc.name}</span>
                        <span className="text-slate-2 transition group-open:hidden">查看结果</span>
                      </summary>
                      <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all text-[11px] leading-4 text-slate-1">{tc.summary}</pre>
                    </details>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {streaming && (
          <div className="flex justify-start">
            <div className="w-full rounded-2xl rounded-bl-sm border border-line bg-white px-4 py-2.5">
              {streaming.thinking && (
                <details className="mb-2 rounded-lg bg-paper-2/60 px-3 py-2" open={false}>
                  <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-semibold text-slate-1">
                    <span className="animate-pulse">🧠</span> 思考中
                  </summary>
                  <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap text-[11px] leading-4 text-slate-2">{streaming.thinking}</pre>
                </details>
              )}
              {streaming.tools.length > 0 && (
                <div className="mb-2 space-y-1.5">
                  {streaming.tools.map((t, i) => (
                    <div key={i} className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs ${t.status === 'running' ? 'border-accent/40 bg-accent-soft/50' : 'border-line bg-paper-2/60'}`}>
                      {t.status === 'running' ? (
                        <>
                          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                          <span className="font-mono text-[11px] text-accent">{t.name}</span>
                          <span className="text-slate-2">调用中…</span>
                        </>
                      ) : (
                        <>
                          <span className="text-teal">✓</span>
                          <span className="font-mono text-[11px] text-ink">{t.name}</span>
                          {t.summary && <span className="truncate text-slate-2">{t.summary.slice(0, 60)}</span>}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {streaming.text ? (
                <Markdown text={streaming.text} />
              ) : (
                !streaming.thinking && streaming.tools.length === 0 && (
                  <span className="inline-block h-3 w-3 animate-bounce rounded-full bg-accent" />
                )
              )}
              <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-accent align-middle" />
            </div>
          </div>
        )}
        {busy && !streaming && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-sm border border-line bg-white px-4 py-3">
              <span className="inline-block h-3 w-3 animate-bounce rounded-full bg-accent [animation-delay:0ms]" />
              <span className="mx-1 inline-block h-3 w-3 animate-bounce rounded-full bg-accent [animation-delay:150ms]" />
              <span className="inline-block h-3 w-3 animate-bounce rounded-full bg-accent [animation-delay:300ms]" />
            </div>
          </div>
        )}
      </div>
      {err && <div className="px-5 pb-2 text-xs text-amber">{err}</div>}
      <form
        className="flex gap-2 border-t border-line p-4"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input className="pp-input flex-1" placeholder="输入你的问题或指令…" value={input} onChange={(e) => setInput(e.target.value)} />
        <button className="pp-btn pp-btn-primary px-5 text-sm" disabled={busy || !input.trim()}>发送</button>
      </form>
    </div>
  );
}
