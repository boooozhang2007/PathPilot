'use client';
// Agent 对话组件:
// full 模式 = 会话侧栏 + 模型选择器 + 全高消息流;紧凑模式供仪表盘嵌入
// 流式:thinking(可折叠)/ 工具调用链 / 增量文本 / 停止生成 / 逐条复制与重新生成
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, API_BASE, getToken } from '@/lib/api';
import { Markdown } from '@/components/Markdown';
import { Ic } from '@/components/Icon';
import type { ChatMessageDTO, ChatSessionSummaryDTO, ModelCatalogItem } from '@pathpilot/shared';

export const DEFAULT_SUGGESTIONS = ['我目前最应该学习什么？', '帮我分析北京的 Java 岗位', '把每周改成 8 小时并重新规划', '在规划里加一个 Redis 学习任务'];

type ToolState = { name: string; status: 'running' | 'done'; summary?: string };
type Streaming = { text: string; thinking: string; tools: ToolState[]; startedAt: number; engine?: 'pi-llm' | 'rules' };

const SUGGEST_ICONS = ['compass', 'globe', 'calendar', 'pen'];

/** 场景指令:一键进入面试模拟 / 简历优化等专门对话模式 */
const SCENARIOS: { icon: string; label: string; prompt: string }[] = [
  {
    icon: 'chat',
    label: '面试模拟',
    prompt: '我们来模拟一场针对我目标岗位的校招面试:你扮演面试官,一次只问一个问题,根据我的回答适度追问,从项目经历和技术基础开始,面试结束后给我逐题点评。现在请简短开场并抛出第一个问题。',
  },
  {
    icon: 'pen',
    label: '简历优化',
    prompt: '基于我档案里的真实经历,指出我简历最薄弱的三点,并给出具体的修改建议和可以补充的量化点;需要我补充信息时直接问我。',
  },
  {
    icon: 'roadmap',
    label: '定制学习计划',
    prompt: '结合我的能力档案、目标岗位与每周可投入时间,给出未来 4 周的学习重点与顺序,说明理由,并把关键项加入我的规划任务。',
  },
  {
    icon: 'target',
    label: '岗位怎么选',
    prompt: '结合我的技能档案与岗位市场情况,分析最适合我的 2-3 个岗位方向,从技能匹配度、准备成本、发展空间三个维度给出取舍建议。',
  },
  {
    icon: 'refresh',
    label: '本周复盘',
    prompt: '根据我最近完成的任务、投入时长与新增证据,做一次本周复盘:三个亮点、两个不足、下周的三条建议。可以用工具查我的任务与档案。',
  },
];

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return '刚刚';
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`;
  if (s < 86400 * 2) return '昨天';
  return new Date(iso).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 6) return '夜深了';
  if (h < 12) return '早上好';
  if (h < 18) return '下午好';
  return '晚上好';
}

/** 消息流顶部的 PathPilot 徽标 */
function AgentMark({ size = 24 }: { size?: number }) {
  return (
    <span className="flex items-center justify-center rounded-lg bg-accent text-white" style={{ width: size, height: size }}>
      <Ic name="spark" size={size * 0.55} strokeWidth={2} />
    </span>
  );
}

export function AgentChat({
  full = false,
  heightClass = 'h-[54vh]',
  suggestions = DEFAULT_SUGGESTIONS,
}: {
  full?: boolean;
  heightClass?: string;
  suggestions?: string[];
}) {
  // 会话与消息
  const [sessionId, setSessionId] = useState<number | undefined>();
  const [messages, setMessages] = useState<ChatMessageDTO[]>([]);
  const [sessions, setSessions] = useState<ChatSessionSummaryDTO[]>([]);
  // 流式状态
  const [streaming, setStreaming] = useState<Streaming | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [notice, setNotice] = useState('');
  // 输入
  const [input, setInput] = useState('');
  const taRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  // 模型
  const [catalog, setCatalog] = useState<ModelCatalogItem[]>([]);
  const [currentModel, setCurrentModel] = useState('');
  const [configured, setConfigured] = useState(false);
  const [availability, setAvailability] = useState<Record<string, { available: boolean; error?: string }> | null>(null);
  const [modelOpen, setModelOpen] = useState(false);
  // UI 杂项
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [resumeBusy, setResumeBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const loadSessions = useCallback(() => {
    if (!full) return;
    api<ChatSessionSummaryDTO[]>('/api/agent/sessions').then(setSessions).catch(() => {});
  }, [full]);

  useEffect(() => {
    api<{ catalog: ModelCatalogItem[]; current: string; configured: boolean; availability: Record<string, { available: boolean; error?: string }> | null }>('/api/agent/models?probe=1')
      .then((m) => {
        setCatalog(m.catalog);
        setCurrentModel(localStorage.getItem('pp_model') ?? m.current);
        setConfigured(m.configured);
        setAvailability(m.availability);
      })
      .catch(() => {});
    if (full) {
      loadSessions();
      api<{ sessionId: number; messages: ChatMessageDTO[] } | null>('/api/agent/session')
        .then((s) => {
          if (s) {
            setSessionId(s.sessionId);
            setMessages(s.messages);
          }
        })
        .catch(() => {});
    }
  }, [full, loadSessions]);

  // 滚动:贴底时自动跟随
  const scrollToEnd = useCallback((smooth = true) => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }, []);
  useEffect(() => {
    if (atBottom) scrollToEnd(false);
  }, [messages, streaming, atBottom, scrollToEnd]);

  function onListScroll() {
    const el = listRef.current;
    if (!el) return;
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
  }

  function autoGrow() {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 180)}px`;
  }

  function pickModel(id: string) {
    setCurrentModel(id);
    localStorage.setItem('pp_model', id);
    setModelOpen(false);
  }

  function newChat() {
    abortRef.current?.abort();
    setSessionId(undefined);
    setMessages([]);
    setStreaming(null);
    setErr('');
    setNotice('');
    setSidebarOpen(false);
    setInput('');
  }

  async function openSession(id: number) {
    if (busy) return;
    setSidebarOpen(false);
    if (id === sessionId) return;
    try {
      const msgs = await api<ChatMessageDTO[]>(`/api/agent/session/${id}`);
      setSessionId(id);
      setMessages(msgs);
      setErr('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : '加载会话失败');
    }
  }

  async function removeSession(id: number) {
    try {
      await api(`/api/agent/sessions/${id}`, { method: 'DELETE' });
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (id === sessionId) newChat();
    } catch {
      /* 忽略 */
    }
  }

  async function draftResume() {
    if (resumeBusy) return;
    setResumeBusy(true);
    setErr('');
    try {
      const res = await api<{ draft: { summary: string; sections: { heading: string; items: string[] }[] } }>('/api/resume/draft', { method: 'POST', json: {} });
      const text = `## 简历草稿\n\n${res.draft.summary}\n\n${res.draft.sections.map((s) => `**${s.heading}**\n${s.items.map((i) => `- ${i}`).join('\n')}`).join('\n\n')}`;
      setMessages((prev) => [...prev, { id: Date.now(), sessionId: sessionId ?? 0, role: 'assistant', content: text, engine: null, toolCalls: [], createdAt: new Date().toISOString() }]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '生成失败');
    } finally {
      setResumeBusy(false);
    }
  }

  /** 流式发送;regenerate=true 时去掉末尾的 assistant 消息重答 */
  async function send(text?: string, opts?: { regenerate?: boolean }) {
    const message = (text ?? input).trim();
    if (!message || busy) return;
    setInput('');
    requestAnimationFrame(() => {
      if (taRef.current) taRef.current.style.height = 'auto';
    });
    setErr('');
    setNotice('');
    setBusy(true);
    setAtBottom(true);
    setStreaming({ text: '', thinking: '', tools: [], startedAt: Date.now() });
    setMessages((prev) => {
      const base = opts?.regenerate && prev.length && prev[prev.length - 1].role === 'assistant' ? prev.slice(0, -1) : prev;
      return [...base, { id: Date.now(), sessionId: sessionId ?? 0, role: 'user', content: message, engine: null, toolCalls: [], createdAt: new Date().toISOString() }];
    });
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const token = getToken() ?? '';
      const res = await fetch(`${API_BASE}/api/agent/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ sessionId, message, model: currentModel || undefined }),
        signal: controller.signal,
      });
      if (res.status === 401 && typeof window !== 'undefined') {
        location.href = '/login';
        return;
      }
      if (!res.ok || !res.body) throw new Error(`请求失败(${res.status})`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let doneEngine: 'pi-llm' | 'rules' | undefined;
      let fallback = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop() ?? '';
        for (const part of parts) {
          const line = part.split('\n').find((l) => l.startsWith('data: '));
          if (!line) continue;
          let ev: { type: string; delta?: string; name?: string; summary?: string; engine?: 'pi-llm' | 'rules'; model?: string; fallbackReason?: string; sessionId?: number };
          try {
            ev = JSON.parse(line.slice(6));
          } catch {
            continue;
          }
          if (ev.sessionId) setSessionId(ev.sessionId);
          setStreaming((st) => {
            const cur = st ?? { text: '', thinking: '', tools: [], startedAt: Date.now() };
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
          if (ev.type === 'error') setErr(ev.delta ?? '生成出错');
          if (ev.type === 'done') {
            doneEngine = ev.engine;
            if (ev.fallbackReason) fallback = ev.fallbackReason;
          }
        }
      }
      setStreaming((st) => {
        if (st && (st.text.trim() || st.thinking.trim())) {
          setMessages((prev) => [
            ...prev,
            {
              id: Date.now(),
              sessionId: sessionId ?? 0,
              role: 'assistant',
              content: st.text.trim() || '（模型未返回内容）',
              engine: doneEngine ?? null,
              toolCalls: st.tools.filter((t) => t.status === 'done').map((t) => ({ name: t.name, summary: t.summary ?? '' })),
              createdAt: new Date().toISOString(),
            },
          ]);
        }
        return null;
      });
      if (fallback && !fallback.startsWith('已停止')) setNotice(fallback);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        // 用户停止:保留已生成的部分
        setStreaming((st) => {
          if (st && st.text.trim()) {
            setMessages((prev) => [
              ...prev,
              {
                id: Date.now(),
                sessionId: sessionId ?? 0,
                role: 'assistant',
                content: st.text,
                engine: null,
                toolCalls: st.tools.filter((t) => t.status === 'done').map((t) => ({ name: t.name, summary: t.summary ?? '' })),
                createdAt: new Date().toISOString(),
              },
            ]);
          }
          return null;
        });
      } else {
        setErr(e instanceof Error ? e.message : '发送失败');
        setStreaming(null);
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
      loadSessions();
    }
  }

  async function copyMessage(m: ChatMessageDTO) {
    try {
      await navigator.clipboard.writeText(m.content);
      setCopiedId(m.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      /* 忽略 */
    }
  }

  /** 任意一条 assistant 消息的重新生成:回退到它前面的用户消息重答 */
  function regenerateAt(index: number) {
    for (let i = index - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        setMessages((prev) => prev.slice(0, i));
        send(messages[i].content);
        return;
      }
    }
  }

  const activeModelName = catalog.find((c) => c.id === currentModel)?.name ?? currentModel ?? '选择模型';

  return (
    <div className="relative flex h-full min-h-0 w-full">
      {/* ------- 会话侧栏(full 模式) ------- */}
      {full && (
        <aside className={`absolute inset-y-0 left-0 z-30 flex w-72 flex-col border-r border-line bg-white transition-transform duration-200 lg:static lg:translate-x-0 ${sidebarOpen ? 'translate-x-0 shadow-xl' : '-translate-x-full'}`}>
          <div className="p-3">
            <button className="flex w-full items-center justify-center gap-2 rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ink-2" onClick={newChat}>
              <Ic name="plus" size={15} strokeWidth={2.2} /> 新对话
            </button>
          </div>
          <div className="num px-5 pb-1 pt-2 text-[10px] font-semibold tracking-[0.2em] text-slate-2">HISTORY</div>
          <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
            {sessions.length === 0 && <div className="px-3 py-6 text-center text-xs text-slate-2">还没有对话记录</div>}
            {sessions.map((s) => (
              <div
                key={s.id}
                className={`group flex cursor-pointer items-center gap-1 rounded-lg px-3 py-2 text-sm transition ${s.id === sessionId ? 'bg-accent-soft text-ink' : 'text-slate-1 hover:bg-paper'}`}
                onClick={() => openSession(s.id)}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium">{s.title}</div>
                  <div className="num text-[11px] text-slate-2">
                    {timeAgo(s.updatedAt)} · {s.messageCount} 条
                  </div>
                </div>
                <button
                  className="shrink-0 rounded p-1 text-slate-2 opacity-0 transition hover:bg-accent-soft hover:text-accent group-hover:opacity-100"
                  title="删除会话"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeSession(s.id);
                  }}
                >
                  <Ic name="trash" size={13} />
                </button>
              </div>
            ))}
          </div>
        </aside>
      )}
      {full && sidebarOpen && <div className="absolute inset-0 z-20 bg-ink/20 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* ------- 主区:顶栏 + 消息流 + 输入区 ------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* 顶栏:菜单 / 模型选择 / 简历草稿 */}
        <div className="flex items-center gap-2 border-b border-line bg-paper/60 px-4 py-2.5 backdrop-blur">
          {full && (
            <button className="rounded-lg p-2 text-slate-1 transition hover:bg-white lg:hidden" onClick={() => setSidebarOpen(true)} title="会话列表">
              <Ic name="menu" size={17} />
            </button>
          )}
          {/* 模型选择器(含可用性/价格) */}
          <div className="relative">
            <button
              className="flex items-center gap-2 rounded-full border border-line bg-white px-3.5 py-1.5 text-[13px] font-semibold text-ink transition hover:border-slate-2"
              onClick={() => (configured ? setModelOpen((v) => !v) : setModelOpen(false))}
              disabled={!full}
              title={full ? undefined : '模型选择请前往 AI 顾问页'}
            >
              <span className={`inline-block h-2 w-2 rounded-full ${availability?.[currentModel]?.available === false ? 'bg-amber' : 'bg-teal'}`} />
              {activeModelName}
              {full && <Ic name={modelOpen ? 'chevronUp' : 'chevronDown'} size={12} strokeWidth={2.4} className="text-slate-2" />}
            </button>
            {modelOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setModelOpen(false)} />
                <div className="glass absolute left-0 top-full z-50 mt-1.5 w-72 overflow-hidden">
                  <div className="num border-b border-line px-3 py-2 text-[10px] font-semibold tracking-[0.2em] text-slate-2">MODEL</div>
                  <div className="max-h-72 overflow-y-auto py-1">
                    {catalog.map((c) => {
                      const avail = availability?.[c.id];
                      const selected = c.id === currentModel;
                      return (
                        <button
                          key={c.id}
                          className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition hover:bg-paper ${avail && !avail.available ? 'opacity-55' : ''}`}
                          onClick={() => pickModel(c.id)}
                        >
                          <span className={`mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full ${avail ? (avail.available ? 'bg-teal' : 'bg-amber') : 'bg-slate-2'}`} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-semibold text-ink">{c.name}</span>
                            <span className="num block text-[11px] text-slate-2">
                              {c.price}
                              {avail && !avail.available ? ' · 不可用' : ''}
                            </span>
                          </span>
                          {selected && <Ic name="check" size={14} strokeWidth={2.6} className="shrink-0 text-accent" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
          <div className="flex-1" />
          {full && (
            <button className="pp-btn pp-btn-ghost px-3 py-1.5 text-xs" onClick={draftResume} disabled={resumeBusy}>
              <Ic name="download" size={13} /> {resumeBusy ? '生成中…' : '简历草稿'}
            </button>
          )}
        </div>

        {/* 消息流 */}
        <div className="relative min-h-0 flex-1">
          <div ref={listRef} onScroll={onListScroll} className={`h-full overflow-y-auto ${full ? '' : heightClass}`}>
            <div className={`mx-auto w-full px-4 ${full ? 'max-w-3xl py-6' : 'max-w-2xl py-4'}`}>
              {/* 空状态:问候 + 建议卡片 */}
              {messages.length === 0 && !streaming && (
                <div className="reveal flex flex-col items-center px-2 pt-[8vh] text-center">
                  <AgentMark size={52} />
                  <div className="font-display mt-4 text-2xl font-bold text-ink">{greeting()},同学</div>
                  <div className="mt-2 text-sm text-slate-1">查数据、改规划、管任务,一句话搞定</div>
                  <div className={`mt-8 grid w-full max-w-xl gap-2.5 ${full ? 'grid-cols-2' : 'grid-cols-1'}`}>
                    {suggestions.map((s, i) => (
                      <button
                        key={s}
                        className="group flex items-center gap-3 rounded-xl border border-line bg-white px-4 py-3.5 text-left text-[13px] text-slate-1 transition hover:-translate-y-0.5 hover:border-accent hover:text-ink hover:shadow-md"
                        style={{ animationDelay: `${i * 60 + 100}ms` }}
                        onClick={() => send(s)}
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-paper-2 text-slate-1 transition group-hover:bg-accent-soft group-hover:text-accent">
                          <Ic name={SUGGEST_ICONS[i % SUGGEST_ICONS.length]} size={14} />
                        </span>
                        <span className="min-w-0 flex-1">{s}</span>
                        <Ic name="chevronRight" size={13} className="text-slate-2 transition group-hover:translate-x-0.5 group-hover:text-accent" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((m, i) => (
                <div key={m.id} className={`mb-6 flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                  {m.role === 'user' ? (
                    <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-sm leading-6 text-white">{m.content}</div>
                  ) : (
                    <div className="w-full">
                      <div className="mb-1.5 flex items-center gap-2">
                        <AgentMark size={22} />
                        <span className="text-xs font-bold text-ink">PathPilot</span>
                      </div>
                      <div className="pp-card rounded-2xl rounded-tl-md px-4 py-3">
                        <Markdown text={m.content} />
                      </div>
                      {m.toolCalls.length > 0 && <ToolChain tools={m.toolCalls.map((t) => ({ ...t, status: 'done' as const }))} />}
                      {/* 操作条:复制 / 重新生成(每条回复) */}
                      <div className="mt-1.5 flex items-center gap-1">
                        <ActionBtn onClick={() => copyMessage(m)} label={copiedId === m.id ? '已复制' : '复制'}>
                          <Ic name={copiedId === m.id ? 'check' : 'copy'} size={13} />
                        </ActionBtn>
                        {full && !busy && (
                          <ActionBtn onClick={() => regenerateAt(i)} label="重新生成">
                            <Ic name="refresh" size={13} />
                          </ActionBtn>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* 流式中的 assistant 消息 */}
              {streaming && <StreamingMessage s={streaming} />}
              {busy && !streaming && (
                <div className="mb-6 flex items-start gap-2">
                  <AgentMark size={22} />
                  <div className="flex gap-1 rounded-2xl border border-line bg-white px-4 py-3">
                    <span className="h-2 w-2 animate-bounce rounded-full bg-slate-2 [animation-delay:0ms]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-slate-2 [animation-delay:150ms]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-slate-2 [animation-delay:300ms]" />
                  </div>
                </div>
              )}
            </div>
          </div>
          {/* 回到底部 */}
          {!atBottom && (
            <button
              className="absolute bottom-4 left-1/2 z-10 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border border-line bg-white text-slate-1 shadow-lg transition hover:text-accent"
              onClick={() => {
                setAtBottom(true);
                scrollToEnd();
              }}
              title="回到底部"
            >
              <Ic name="chevronDown" size={15} />
            </button>
          )}
        </div>

        {/* 通知 / 错误 */}
        {notice && (
          <div className="mx-auto w-full max-w-3xl px-4 pb-1">
            <div className="flex items-center gap-1.5 rounded-lg bg-amber-soft px-3 py-1.5 text-xs text-amber">
              <Ic name="info" size={12} /> {notice}
            </div>
          </div>
        )}
        {err && (
          <div className="mx-auto w-full max-w-3xl px-4 pb-1">
            <div className="flex items-center gap-1.5 rounded-lg bg-[#fdf1ef] px-3 py-1.5 text-xs text-[#b3271d]">
              <Ic name="warn" size={12} /> {err}
            </div>
          </div>
        )}

        {/* 输入区 */}
        <div className={`mx-auto w-full px-4 pb-4 pt-1 ${full ? 'max-w-3xl' : 'max-w-2xl'}`}>
          {/* 场景指令:一键进入专门对话模式 */}
          {full && !busy && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {SCENARIOS.map((s) => (
                <button
                  key={s.label}
                  className="flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1.5 text-[11.5px] font-semibold text-slate-1 transition hover:border-accent hover:text-accent-deep"
                  onClick={() => send(s.prompt)}
                  disabled={busy}
                  title={s.prompt.slice(0, 40) + '…'}
                >
                  <Ic name={s.icon} size={12} />
                  {s.label}
                </button>
              ))}
            </div>
          )}
          <form
            className="relative flex items-end gap-2 rounded-2xl border border-line bg-white px-3 py-2.5 shadow-sm transition focus-within:border-accent focus-within:shadow-[0_0_0_3px_rgba(66,110,254,0.14)]"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <textarea
              ref={taRef}
              className="max-h-[180px] min-h-[24px] flex-1 resize-none bg-transparent py-1.5 text-sm leading-6 text-ink outline-none placeholder:text-slate-2"
              placeholder="输入你的问题或指令…"
              rows={1}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                autoGrow();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            {busy ? (
              <button
                type="button"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ink text-white transition hover:bg-ink-2"
                onClick={() => abortRef.current?.abort()}
                title="停止生成"
              >
                <span className="block h-3 w-3 rounded-[3px] bg-white" />
              </button>
            ) : (
              <button
                type="submit"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-white transition hover:bg-accent-deep disabled:bg-slate-2"
                disabled={!input.trim()}
                title="发送"
              >
                <Ic name="arrowUp" size={16} strokeWidth={2.2} />
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}

/** 消息下方的小操作钮 */
function ActionBtn({ children, label, onClick }: { children: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-slate-2 transition hover:bg-paper-2 hover:text-ink" onClick={onClick}>
      {children}
      <span>{label}</span>
    </button>
  );
}

/** 工具调用链(可折叠)——历史消息与流式共用 */
function ToolChain({ tools }: { tools: ToolState[] }) {
  if (!tools.length) return null;
  const running = tools.some((t) => t.status === 'running');
  return (
    <details className="group mt-2 rounded-xl border border-line bg-paper-2/40">
      <summary className="flex cursor-pointer select-none list-none items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-1">
        <Ic name="wrench" size={13} className={running ? 'animate-spin' : ''} />
        {running ? `正在调用工具(${tools.filter((t) => t.status === 'running').length} 个)` : `使用了 ${tools.length} 个工具`}
        <Ic name="chevronDown" size={12} className="ml-auto text-slate-2 transition group-open:rotate-180" />
      </summary>
      <div className="space-y-1.5 border-t border-line/70 px-3 py-2">
        {tools.map((t, i) => (
          <details key={i} className="rounded-lg bg-white/80">
            <summary className="flex cursor-pointer select-none list-none items-center gap-2 px-2.5 py-1.5 text-[11px]">
              {t.status === 'running' ? <span className="inline-block h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-accent border-t-transparent" /> : <Ic name="checkCircle" size={12} className="shrink-0 text-teal" />}
              <span className="num text-ink">{t.name}</span>
              {t.summary && <span className="min-w-0 flex-1 truncate text-slate-2">{t.summary.slice(0, 60)}</span>}
            </summary>
            {t.summary && <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all px-3 pb-2 text-[11px] leading-4 text-slate-1">{t.summary}</pre>}
          </details>
        ))}
      </div>
    </details>
  );
}

/** 流式中的 assistant 消息:思考(可折叠+计时)→ 工具 → 增量文本 + 光标 */
function StreamingMessage({ s }: { s: Streaming }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - s.startedAt) / 1000)), 1000);
    return () => clearInterval(t);
  }, [s.startedAt]);
  const thinkingActive = !s.text && (!!s.thinking || s.tools.length === 0);

  return (
    <div className="mb-6 flex items-start gap-2">
      <AgentMark size={22} />
      <div className="min-w-0 flex-1">
        {/* 思考过程 */}
        {s.thinking && (
          <details className="mb-2 rounded-xl border border-line bg-paper-2/40" open={thinkingActive}>
            <summary className="flex cursor-pointer select-none list-none items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-1">
              <Ic name="brain" size={13} className={thinkingActive ? 'text-accent' : ''} />
              <span className={thinkingActive ? 'text-accent' : ''}>{thinkingActive ? `思考中… ${elapsed}s` : `已思考 ${elapsed}s`}</span>
              <span className="num ml-auto text-[10px] text-slate-2">REASONING</span>
            </summary>
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap border-t border-line/70 px-3 py-2 text-[11px] leading-4 text-slate-2">{s.thinking}</pre>
          </details>
        )}
        <ToolChain tools={s.tools} />
        <div className="pp-card rounded-2xl rounded-tl-md px-4 py-3">
          {s.text ? (
            <>
              <Markdown text={s.text} />
              <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-accent align-middle" />
            </>
          ) : (
            !s.thinking &&
            s.tools.length === 0 && <span className="inline-block h-3 w-3 animate-bounce rounded-full bg-slate-2" />
          )}
        </div>
      </div>
    </div>
  );
}
