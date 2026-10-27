'use client';
// Agent 对话组件:
// full 模式 = 会话侧栏 + 全高消息流;紧凑模式供仪表盘嵌入
// 流式:thinking(可折叠)/ 工具调用链 / 增量文本 / 停止生成 / 逐条复制与重新生成
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, API_BASE, getToken } from '@/lib/api';
import { Markdown } from '@/components/Markdown';
import { Ic } from '@/components/Icon';
import type { ChatMessageDTO, ChatSessionSummaryDTO, ProfileDTO } from '@pathpilot/shared';

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
  const sessionIdRef = useRef<number | undefined>(undefined);
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
  // UI 杂项
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [resumeBusy, setResumeBusy] = useState(false);
  const [guideProfile, setGuideProfile] = useState<ProfileDTO | null>(null);
  const [guideReady, setGuideReady] = useState(false);
  const [guideStep, setGuideStep] = useState<'profile' | 'choice' | 'done'>('profile');
  const listRef = useRef<HTMLDivElement>(null);

  const loadSessions = useCallback(() => {
    if (!full) return;
    api<ChatSessionSummaryDTO[]>('/api/agent/sessions').then(setSessions).catch(() => {});
  }, [full]);

  useEffect(() => {
    if (full) {
      loadSessions();
      api<{ sessionId: number; messages: ChatMessageDTO[] } | null>('/api/agent/session')
        .then((s) => {
          if (s) {
            sessionIdRef.current = s.sessionId;
            setSessionId(s.sessionId);
            setMessages(s.messages);
          }
        })
        .catch(() => {});
    }
  }, [full, loadSessions]);

  useEffect(() => {
    api<ProfileDTO | null>('/api/profile')
      .then((p) => {
        setGuideProfile(p);
        setGuideStep(p?.targetRole && p.weeklyHours && p.grade ? 'choice' : 'profile');
      })
      .catch(() => setGuideStep('choice'))
      .finally(() => setGuideReady(true));
  }, []);

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

  function newChat() {
    abortRef.current?.abort();
    sessionIdRef.current = undefined;
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
      sessionIdRef.current = id;
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
      // 草稿仅存在于当前页面（未入库），用负数 id 标识并禁用重新生成
      setMessages((prev) => [...prev, { id: -Date.now(), sessionId: sessionIdRef.current ?? 0, role: 'assistant', content: text, engine: null, toolCalls: [], createdAt: new Date().toISOString() }]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '生成失败');
    } finally {
      setResumeBusy(false);
    }
  }

  /** 流式发送;regenerateFrom 时由服务端截断该回复及其后的消息后重答，避免用户消息重复入库 */
  async function send(text?: string, opts?: { regenerateFrom?: number; truncateTo?: number }) {
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
    let activeSessionId = sessionIdRef.current;
    setMessages((prev) => {
      const base = opts && opts.truncateTo !== undefined ? prev.slice(0, opts.truncateTo) : prev;
      return [...base, { id: Date.now(), sessionId: activeSessionId ?? 0, role: 'user', content: message, engine: null, toolCalls: [], createdAt: new Date().toISOString() }];
    });
    const controller = new AbortController();
    abortRef.current = controller;
    /** 从服务端恢复消息（请求失败/中断后对齐真实 id 与内容） */
    const syncSession = async () => {
      if (!activeSessionId) return;
      try {
        const msgs = await api<ChatMessageDTO[]>(`/api/agent/session/${activeSessionId}`);
        if (sessionIdRef.current === activeSessionId) setMessages(msgs);
      } catch {
        /* 忽略 */
      }
    };
    try {
      const token = getToken() ?? '';
      const res = await fetch(`${API_BASE}/api/agent/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ sessionId: activeSessionId, message, ...(opts?.regenerateFrom ? { regenerateFrom: opts.regenerateFrom } : {}) }),
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
      let doneMessageId: number | undefined;
      let fallback = '';
      let hadError = false;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop() ?? '';
        for (const part of parts) {
          const line = part.split('\n').find((l) => l.startsWith('data: '));
          if (!line) continue;
          let ev: { type: string; delta?: string; name?: string; summary?: string; engine?: 'pi-llm' | 'rules'; model?: string; fallbackReason?: string; sessionId?: number; messageId?: number };
          try {
            ev = JSON.parse(line.slice(6));
          } catch {
            continue;
          }
          if (ev.sessionId) {
            activeSessionId = ev.sessionId;
            sessionIdRef.current = ev.sessionId;
            setSessionId(ev.sessionId);
          }
          setStreaming((st) => {
            const cur = st ?? { text: '', thinking: '', tools: [], startedAt: Date.now() };
            switch (ev.type) {
              case 'thinking':
                return { ...cur, thinking: cur.thinking + (ev.delta ?? '') };
              case 'text':
                return { ...cur, text: cur.text + (ev.delta ?? '') };
              case 'tool_start':
                return { ...cur, tools: [...cur.tools, { name: ev.name ?? '', status: 'running' }] };
              case 'tool_progress': {
                const tools = [...cur.tools];
                for (let i = tools.length - 1; i >= 0; i--) {
                  if (tools[i].status === 'running' && (!ev.name || tools[i].name === ev.name)) {
                    tools[i] = { ...tools[i], summary: ev.summary };
                    break;
                  }
                }
                return { ...cur, tools };
              }
              case 'tool_end': {
                const tools = cur.tools.map((t) => (t.name === ev.name && t.status === 'running' ? { ...t, status: 'done' as const, summary: ev.summary } : t));
                return { ...cur, tools };
              }
              default:
                return cur;
            }
          });
          if (ev.type === 'error') {
            hadError = true;
            setErr(ev.delta ?? '生成出错');
          }
          if (ev.type === 'done') {
            doneEngine = ev.engine;
            doneMessageId = ev.messageId;
            if (ev.fallbackReason) fallback = ev.fallbackReason;
          }
        }
      }
      setStreaming((st) => {
        if (st && (st.text.trim() || st.thinking.trim())) {
          setMessages((prev) => [
            ...prev,
            {
              id: doneMessageId ?? Date.now(),
              sessionId: activeSessionId ?? 0,
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
      if (fallback && !hadError && !fallback.startsWith('已停止')) setNotice(fallback);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        // 用户停止:保留已生成的部分
        setStreaming((st) => {
          if (st && st.text.trim()) {
            setMessages((prev) => [
              ...prev,
              {
                id: Date.now(),
                sessionId: activeSessionId ?? 0,
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
        // 服务端也已中止并落库：稍后同步一次，用真实消息 id 替换本地临时 id（供重新生成使用）
        setTimeout(() => {
          if (!abortRef.current) void syncSession();
        }, 500);
      } else {
        setErr(e instanceof Error ? e.message : '发送失败');
        setStreaming(null);
        // 重新生成可能已被服务端拒绝（旧 id/会话不存在），恢复被乐观截断的消息
        await syncSession();
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

  /** 任意一条 assistant 消息的重新生成:服务端从该回复起截断后重答 */
  function regenerateAt(index: number) {
    const assistant = messages[index];
    for (let i = index - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        send(messages[i].content, { regenerateFrom: assistant.id, truncateTo: i });
        return;
      }
    }
  }

  return (
    <div className="relative flex h-full min-h-0 w-full">
      {/* ------- 会话侧栏(full 模式) ------- */}
      {full && (
        <aside className={`absolute inset-y-0 left-0 z-30 flex w-72 flex-col border-r border-line bg-white transition-transform duration-200 lg:static lg:translate-x-0 ${sidebarOpen ? 'translate-x-0 shadow-xl' : '-translate-x-full'}`}>
          <div className="p-3">
            <button className="flex w-full items-center justify-center gap-2 rounded-lg bg-ink px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ink-2" onClick={newChat}>
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
                  <div className="mt-2 text-sm text-slate-1">{guideStep === 'profile' ? '先告诉我你的目标和时间，我会为你安排下一步。' : '你想先从哪一件事开始？'}</div>
                  {guideReady && guideStep === 'profile' && (
                    <div className="mt-8 w-full max-w-xl rounded-xl border border-line bg-white p-5 text-left shadow-sm">
                      <div className="text-sm font-bold text-ink">先完善 3 项信息</div>
                      <div className="mt-2 text-xs leading-5 text-slate-1">目标岗位、当前年级、每周可投入时间会决定岗位检索关键词与规划节奏。</div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <a href="/profile" className="pp-btn pp-btn-primary px-4 py-2 text-xs">去填写资料</a>
                        <button className="pp-btn pp-btn-ghost px-4 py-2 text-xs" onClick={() => setGuideStep('choice')}>资料已完善，继续</button>
                      </div>
                      {guideProfile && <div className="mt-3 text-[11px] text-slate-2">已读取：{guideProfile.nickname} · {guideProfile.targetRole || '还未设置目标岗位'}</div>}
                    </div>
                  )}
                  {guideReady && guideStep === 'choice' && full && (
                    <div className="mt-8 grid w-full max-w-xl grid-cols-2 gap-2.5">
                      {[
                        ['岗位洞察', '分析目标岗位的真实招聘要求', '帮我搜索并分析目标岗位的真实招聘要求'],
                        ['能力差距', '找出当前技能与岗位要求的差距', '请结合我的档案做一次能力差距分析'],
                        ['成长路线', '生成分阶段的学习与项目路线', '请根据我的情况生成成长路线'],
                        ['任务拆解', '把大目标拆成可以逐项完成的任务', '请把我当前最重要的目标拆成可跟踪的子任务'],
                        ['简历准备', '把真实经历整理成简历素材', '请帮我整理简历并指出需要补充的真实证据'],
                        ['面试模拟', '按目标岗位开始一轮模拟面试', '请开始一轮针对我目标岗位的模拟面试'],
                      ].map(([title, desc, prompt], i) => (
                        <button key={title} className="group rounded-lg border border-line bg-white px-4 py-3 text-left transition hover:-translate-y-0.5 hover:border-accent hover:shadow-md" onClick={() => { setGuideStep('done'); send(prompt); }}>
                          <div className="flex items-center gap-2 text-[13px] font-semibold text-ink"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-paper-2 text-accent"><Ic name={SUGGEST_ICONS[i % SUGGEST_ICONS.length]} size={14} /></span>{title}</div>
                          <div className="mt-1 text-[11px] text-slate-2">{desc}</div>
                        </button>
                      ))}
                    </div>
                  )}
                  {guideReady && guideStep === 'choice' && !full && (
                    <div className="mt-6 grid w-full max-w-xl gap-2">
                      {suggestions.map((s) => (
                        <button key={s} className="rounded-lg border border-line bg-white px-4 py-2.5 text-left text-[13px] font-medium text-slate-1 transition hover:border-accent hover:text-accent-deep" onClick={() => { setGuideStep('done'); send(s); }}>
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {messages.map((m, i) => (
                <div key={m.id} className={`mb-6 flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                  {m.role === 'user' ? (
                    <div className="max-w-[80%] whitespace-pre-wrap rounded-lg rounded-br-sm bg-ink px-4 py-2.5 text-sm leading-6 text-white">{m.content}</div>
                  ) : (
                    <div className="w-full">
                      <div className="mb-1.5 flex items-center gap-2">
                        <AgentMark size={22} />
                        <span className="text-xs font-bold text-ink">PathPilot</span>
                      </div>
                      <div className={`pp-card rounded-lg rounded-tl-sm px-4 py-3 ${m.errorCode ? 'border-[#f0d3cf] bg-[#fdf8f7]' : ''}`}>
                        {m.errorCode && (
                          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-[#b3271d]">
                            <Ic name="warn" size={11} /> 本次回复未完成
                          </div>
                        )}
                        <Markdown text={m.content} />
                      </div>
                      {m.toolCalls.length > 0 && <ToolChain tools={m.toolCalls.map((t) => ({ ...t, status: 'done' as const }))} />}
                      {/* 操作条:复制 / 重新生成(每条回复) */}
                      <div className="mt-1.5 flex items-center gap-1">
                        <ActionBtn onClick={() => copyMessage(m)} label={copiedId === m.id ? '已复制' : '复制'}>
                          <Ic name={copiedId === m.id ? 'check' : 'copy'} size={13} />
                        </ActionBtn>
                        {full && !busy && m.id > 0 && (
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
                  <div className="flex gap-1 rounded-lg border border-line bg-white px-4 py-3">
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
                  className="flex items-center gap-1.5 rounded-md border border-line bg-white px-3 py-1.5 text-[11.5px] font-semibold text-slate-1 transition hover:border-accent hover:text-accent-deep"
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
            className="relative flex items-end gap-2 rounded-lg border border-line bg-white px-3 py-2.5 shadow-sm transition focus-within:border-accent focus-within:shadow-[0_0_0_3px_rgba(66,110,254,0.14)]"
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
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink text-white transition hover:bg-ink-2"
                onClick={() => abortRef.current?.abort()}
                title="停止生成"
              >
                <span className="block h-3 w-3 rounded-[3px] bg-white" />
              </button>
            ) : (
              <button
                type="submit"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-white transition hover:bg-accent-deep disabled:bg-slate-2"
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
    <details className="group mt-2 rounded-lg border border-line bg-paper-2/40">
      <summary className="flex cursor-pointer select-none list-none items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-1">
        <Ic name="wrench" size={13} className={running ? 'animate-spin' : ''} />
        {running ? `正在调用工具(${tools.filter((t) => t.status === 'running').length} 个)` : `使用了 ${tools.length} 个工具`}
        <Ic name="chevronDown" size={12} className="ml-auto text-slate-2 transition group-open:rotate-180" />
      </summary>
      <div className="space-y-1.5 border-t border-line/70 px-3 py-2">
        {tools.map((t, i) => (
          <details key={i} className="rounded-md bg-white/80">
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
          <details className="mb-2 rounded-lg border border-line bg-paper-2/40" open={thinkingActive}>
            <summary className="flex cursor-pointer select-none list-none items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-1">
              <Ic name="brain" size={13} className={thinkingActive ? 'text-accent' : ''} />
              <span className={thinkingActive ? 'text-accent' : ''}>{thinkingActive ? `思考中… ${elapsed}s` : `已思考 ${elapsed}s`}</span>
              <span className="num ml-auto text-[10px] text-slate-2">REASONING</span>
            </summary>
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap border-t border-line/70 px-3 py-2 text-[11px] leading-4 text-slate-2">{s.thinking}</pre>
          </details>
        )}
        <ToolChain tools={s.tools} />
        <div className="pp-card rounded-lg rounded-tl-sm px-4 py-3">
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
