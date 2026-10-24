'use client';
// Agent 对话组件（真实 /api/agent/chat）：仪表盘与 AI 顾问页共用
// 含模型选择（目录来自 /api/agent/models）与工具调用链路展示
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
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
    setMessages((prev) => [...prev, { id: Date.now(), sessionId: sessionId ?? 0, role: 'user', content: message, engine: null, toolCalls: [], createdAt: new Date().toISOString() }]);
    try {
      const res = await api<{ sessionId: number; reply: ChatMessageDTO; fallbackReason?: string }>('/api/agent/chat', {
        method: 'POST',
        json: { sessionId, message, model: currentModel || undefined },
      });
      setSessionId(res.sessionId);
      setMessages((prev) => [...prev, res.reply]);
      if (res.fallbackReason) setErr(res.fallbackReason);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '发送失败');
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
                className={`whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-6 ${
                  m.role === 'user' ? 'ml-auto max-w-[85%] rounded-br-sm bg-ink text-white' : 'rounded-bl-sm border border-line bg-white'
                }`}
              >
                {m.content}
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
        {busy && (
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
