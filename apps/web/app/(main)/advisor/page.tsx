'use client';
// AI 职业顾问：模型选择（任务4）+ 工具调用链路展示（任务3）
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/ui';
import type { ChatMessageDTO, ModelCatalogItem } from '@pathpilot/shared';

const SUGGESTIONS = ['我目前最应该学习什么？', '帮我分析北京的 Java 岗位', '把每周改成 8 小时并重新规划', '帮我在规划里加一个 Redis 学习任务', '生成我的简历草稿'];

export default function AdvisorPage() {
  const [sessionId, setSessionId] = useState<number | undefined>();
  const [messages, setMessages] = useState<ChatMessageDTO[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [catalog, setCatalog] = useState<ModelCatalogItem[]>([]);
  const [currentModel, setCurrentModel] = useState('');
  const [configured, setConfigured] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<{ catalog: ModelCatalogItem[]; current: string; configured: boolean }>('/api/agent/models')
      .then((m) => {
        setCatalog(m.catalog);
        setCurrentModel(localStorage.getItem('pp_model') ?? m.current);
        setConfigured(m.configured);
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
      const res = await api<{ sessionId: number; reply: ChatMessageDTO }>('/api/agent/chat', {
        method: 'POST',
        json: { sessionId, message, model: currentModel || undefined },
      });
      setSessionId(res.sessionId);
      setMessages((prev) => [...prev, res.reply]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '发送失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pp-anim">
      <PageHeader
        title="AI 顾问"
        right={
          <div className="flex items-center gap-2">
            <select className="pp-input w-56 py-2 text-xs" value={currentModel} onChange={(e) => pickModel(e.target.value)} disabled={!configured}>
              {catalog.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.price}
                </option>
              ))}
            </select>
          </div>
        }
      />

      <div className="grid grid-cols-12 gap-5">
        <div className="pp-card col-span-8 flex h-[70vh] flex-col p-0">
          <div ref={listRef} className="flex-1 space-y-4 overflow-y-auto p-5">
            {messages.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                <div className="text-sm font-bold text-slate-1">问我任何职业规划问题，或直接让我操作</div>
                <div className="flex max-w-md flex-wrap justify-center gap-2">
                  {SUGGESTIONS.map((s) => (
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
          {err && <div className="px-5 pb-2 text-xs text-accent">{err}</div>}
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

        <div className="col-span-4 space-y-5">
          <div className="pp-card p-5">
            <div className="mb-2 text-sm font-bold">当前模型</div>
            {configured ? (
              <div className="rounded-lg bg-paper-2 p-3 text-xs">
                <div className="font-mono font-bold text-ink">{currentModel}</div>
                <div className="mt-1 text-slate-1">{catalog.find((c) => c.id === currentModel)?.price ?? ''} 计费倍率</div>
              </div>
            ) : (
              <div className="rounded-lg bg-paper-2 p-3 text-xs text-slate-1">未配置模型 API（/admin 页面填写 Base URL 与 Key 后启用）</div>
            )}
          </div>
          <div className="pp-card p-5">
            <div className="mb-2 text-sm font-bold">简历草稿</div>
            <button
              className="pp-btn pp-btn-primary w-full py-2 text-xs"
              onClick={async () => {
                setBusy(true);
                try {
                  const res = await api<{ draft: { summary: string; sections: { heading: string; items: string[] }[] } }>('/api/resume/draft', { method: 'POST', json: {} });
                  setMessages((prev) => [
                    ...prev,
                    { id: Date.now() + 1, sessionId: sessionId ?? 0, role: 'assistant', engine: null, toolCalls: [], createdAt: new Date().toISOString(), content: `【简历草稿】\n${res.draft.summary}\n\n${res.draft.sections.map((s) => `▪ ${s.heading}\n${s.items.map((i) => `  · ${i}`).join('\n')}`).join('\n')}` },
                  ]);
                } catch (e) {
                  setErr(e instanceof Error ? e.message : '生成失败');
                } finally {
                  setBusy(false);
                }
              }}
              disabled={busy}
            >
              生成简历草稿
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
