'use client';
// 页面 7：AI 职业顾问（PRD 5.1/4.8）：对话 + 上下文引用 + 推荐问题 + 简历草稿
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { Loading, ErrorState, Tag, PageHeader } from '@/components/ui';
import type { ChatMessageDTO, ResumeDraftDTO } from '@pathpilot/shared';

const SUGGESTIONS = ['我目前最应该学习什么？', '为什么推荐我完成这个项目？', '我适合优先准备就业还是考研？', '如果换成 AI 应用开发，还需要补充什么？', '我的项目经历还缺少哪些证据？'];

export default function AdvisorPage() {
  const [sessionId, setSessionId] = useState<number | undefined>();
  const [messages, setMessages] = useState<ChatMessageDTO[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [engine, setEngine] = useState('');
  const [resume, setResume] = useState<ResumeDraftDTO | null>(null);
  const [resumeBusy, setResumeBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<{ engine: string }>('/api/agent/config').then((c) => setEngine(c.engine)).catch(() => {});
    api<{ sessionId: number; messages: ChatMessageDTO[] } | null>('/api/agent/session').then((s) => {
      if (s) {
        setSessionId(s.sessionId);
        setMessages(s.messages);
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  async function send(text?: string) {
    const message = (text ?? input).trim();
    if (!message || busy) return;
    setInput('');
    setErr('');
    setBusy(true);
    setMessages((prev) => [...prev, { id: Date.now(), sessionId: sessionId ?? 0, role: 'user', content: message, engine: null, createdAt: new Date().toISOString() }]);
    try {
      const res = await api<{ sessionId: number; reply: ChatMessageDTO; engine: string }>('/api/agent/chat', { method: 'POST', json: { sessionId, message } });
      setSessionId(res.sessionId);
      setEngine(res.engine);
      setMessages((prev) => [...prev, res.reply]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '发送失败');
    } finally {
      setBusy(false);
    }
  }

  async function draftResume() {
    setResumeBusy(true);
    setResume(null);
    try {
      const res = await api<ResumeDraftDTO>('/api/resume/draft', { method: 'POST', json: {} });
      setResume(res);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '生成失败（先在能力档案添加真实经历）');
    } finally {
      setResumeBusy(false);
    }
  }

  return (
    <div className="pp-anim">
      <PageHeader
        title="AI 职业顾问"
        desc="回答基于你的档案、岗位分析与规划的最新数据；区分事实与建议"
        right={<Tag tone={engine === 'pi-llm' ? 'teal' : 'amber'}>{engine === 'pi-llm' ? 'AI 模型通道' : '规则引擎通道'}</Tag>}
      />

      <div className="grid grid-cols-12 gap-5">
        <div className="pp-card col-span-8 flex h-[70vh] flex-col p-0">
          <div ref={listRef} className="flex-1 space-y-4 overflow-y-auto p-5">
            {messages.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                <div className="text-sm font-bold text-slate-1">问我任何职业规划问题</div>
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
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-6 ${
                    m.role === 'user' ? 'rounded-br-sm bg-ink text-white' : 'rounded-bl-sm border border-line bg-white'
                  }`}
                >
                  {m.content}
                  {m.role === 'assistant' && m.engine && <div className="mt-1.5 text-[10px] text-slate-2">{m.engine === 'pi-llm' ? 'AI 模型 · 基于你的真实数据' : '规则引擎 · 基于你的真实数据'}</div>}
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
            <input className="pp-input flex-1" placeholder="输入你的问题…" value={input} onChange={(e) => setInput(e.target.value)} />
            <button className="pp-btn pp-btn-primary px-5 text-sm" disabled={busy || !input.trim()}>发送</button>
          </form>
        </div>

        <div className="col-span-4 space-y-5">
          <div className="pp-card p-5">
            <div className="mb-2 text-sm font-bold">简历草稿</div>
            <p className="mb-3 text-xs leading-5 text-slate-1">从你的真实经历生成结构化简历描述；不虚构数据与指标，可编辑后导出。</p>
            <button className="pp-btn pp-btn-primary w-full py-2 text-xs" onClick={draftResume} disabled={resumeBusy}>
              {resumeBusy ? '生成中…' : '生成简历草稿'}
            </button>
            {resume && (
              <div className="mt-4 space-y-3 text-xs leading-5">
                <div className="rounded-lg bg-paper-2 p-3">{resume.summary}</div>
                {resume.sections.map((s) => (
                  <div key={s.heading}>
                    <div className="mb-1 font-bold">{s.heading}</div>
                    <ul className="list-disc space-y-1 pl-4 text-slate-1">
                      {s.items.map((it, i) => (
                        <li key={i}>{it}</li>
                      ))}
                    </ul>
                  </div>
                ))}
                {resume.notes.length > 0 && (
                  <div className="rounded-lg bg-amber-soft p-3 text-amber">
                    {resume.notes.map((n, i) => (
                      <div key={i}>· {n}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="pp-card p-5 text-xs leading-5 text-slate-1">
            <div className="mb-1 text-sm font-bold text-ink">数据来源</div>
            回答引用你的档案、岗位分析与当前规划；每条回答标注生成引擎，事实判断附样本数据。
          </div>
        </div>
      </div>
    </div>
  );
}
