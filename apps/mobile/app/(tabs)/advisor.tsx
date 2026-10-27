// AI 顾问（DeepSeek 式聊天）：侧栏历史（分组/重命名/批量删除）+ 新建对话 + 完整输入框
// 回复消息下方带 复制 / 重新生成；停止生成会真正中止服务端推理（SSE 断开即 abort）
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { View, Text, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, Modal, Pressable, type ScrollViewInstance } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { api, getApiBase, getToken } from '../../lib/api';
import { createUtf8StreamDecoder } from '../../lib/utf8';
import { C, SF, useSettings } from '../../components/ui';
import { Icon, LogoMark } from '../../components/icons';
import { Markdown } from '../../components/Markdown';
import { makeT } from '../../lib/i18n';
import type { ChatMessageDTO, ChatSessionSummaryDTO } from '@pathpilot/shared';

const SUGGESTIONS = ['我目前最应该学习什么？', '就业还是考研？', '我的项目经历缺哪些证据？', '换 AI 方向要补什么？'];

type ToolState = { name: string; status: 'running' | 'done'; summary?: string };
type StreamState = { text: string; thinking: string; tools: ToolState[]; startedAt: number };

function timeLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function groupOf(iso: string): 'today' | 'yesterday' | 'earlier' {
  const d = new Date(iso);
  const now = new Date();
  const yest = new Date(now);
  yest.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString()) return 'today';
  if (d.toDateString() === yest.toDateString()) return 'yesterday';
  return 'earlier';
}

export default function AdvisorTab() {
  const router = useRouter();
  const { settings, update, fs, lang } = useSettings();
  const t = makeT(lang);

  const [sessionId, setSessionId] = useState<number | undefined>();
  const sessionIdRef = useRef<number | undefined>(undefined);
  const [messages, setMessages] = useState<ChatMessageDTO[]>([]);
  const [sessions, setSessions] = useState<ChatSessionSummaryDTO[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [stream, setStream] = useState<StreamState | null>(null);
  const [err, setErr] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // 历史管理弹层：rename=重命名输入框 / manage=操作面板；selectMode=批量删除选择
  const [renameFor, setRenameFor] = useState<ChatSessionSummaryDTO | null>(null);
  const [renameText, setRenameText] = useState('');
  const [manageFor, setManageFor] = useState<ChatSessionSummaryDTO | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [guideStep, setGuideStep] = useState<'profile' | 'choice' | 'done'>('profile');
  const [guideReady, setGuideReady] = useState(false);
  const listRef = useRef<ScrollViewInstance | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const loadSessions = useCallback(() => {
    api<ChatSessionSummaryDTO[]>('/api/agent/sessions').then(setSessions).catch(() => {});
  }, []);

  const openSession = useCallback(
    (id: number) => {
      if (busy || id === sessionId) {
        setSidebarOpen(false);
        return;
      }
      api<ChatMessageDTO[]>(`/api/agent/session/${id}`)
        .then((msgs) => {
          sessionIdRef.current = id;
          setSessionId(id);
          setMessages(msgs);
          setErr('');
          setSidebarOpen(false);
        })
        .catch((e) => setErr(e instanceof Error ? e.message : '加载失败'));
    },
    [busy, sessionId]
  );

  useEffect(() => {
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
  }, [loadSessions]);

  useEffect(() => {
    api<{ targetRole?: string; weeklyHours?: number; grade?: string } | null>('/api/profile')
      .then((p) => setGuideStep(p?.targetRole && p.weeklyHours && p.grade ? 'choice' : 'profile'))
      .catch(() => setGuideStep('choice'))
      .finally(() => setGuideReady(true));
  }, []);

  function newChat() {
    abortRef.current?.abort();
    sessionIdRef.current = undefined;
    setSessionId(undefined);
    setMessages([]);
    setStream(null);
    setErr('');
    setInput('');
    setSidebarOpen(false);
  }

  async function rename(s: ChatSessionSummaryDTO, title: string) {
    if (!title.trim()) return;
    try {
      await api(`/api/agent/sessions/${s.id}`, { method: 'PATCH', json: { title: title.trim() } });
      setSessions((prev) => prev.map((x) => (x.id === s.id ? { ...x, title: title.trim() } : x)));
    } catch {
      setErr(t('renameFailed'));
    }
  }

  async function remove(s: ChatSessionSummaryDTO) {
    await api(`/api/agent/sessions/${s.id}`, { method: 'DELETE' }).catch(() => {});
    setSessions((prev) => prev.filter((x) => x.id !== s.id));
    if (s.id === sessionId) newChat();
  }

  /** 批量删除所选会话 */
  async function removeSelected() {
    const ids = [...selected];
    if (!ids.length) return;
    for (const id of ids) {
      await api(`/api/agent/sessions/${id}`, { method: 'DELETE' }).catch(() => {});
    }
    setSessions((prev) => prev.filter((x) => !selected.has(x.id)));
    if (sessionId != null && selected.has(sessionId)) newChat();
    setSelected(new Set());
    setSelectMode(false);
  }

  async function copyMessage(m: ChatMessageDTO) {
    try {
      await Clipboard.setStringAsync(m.content);
      setCopiedId(m.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      /* 忽略 */
    }
  }

  async function send(text?: string, opts?: { regenerateFrom?: number; truncateTo?: number }) {
    const message = (text ?? input).trim();
    if (!message || busy) return;
    setInput('');
    setErr('');
    setBusy(true);
    setStream({ text: '', thinking: '', tools: [], startedAt: Date.now() });
    let activeSessionId = sessionIdRef.current;
    setMessages((prev) => {
      const base = opts && opts.truncateTo !== undefined ? prev.slice(0, opts.truncateTo) : prev;
      return [...base, { id: Date.now(), sessionId: activeSessionId ?? 0, role: 'user', content: message, engine: null, toolCalls: [], createdAt: new Date().toISOString() }];
    });
    const controller = new AbortController();
    abortRef.current = controller;
    // 略大于服务端墙钟上限(300s)：让服务端先落库并下发 done，而不是客户端先断开
    const timer = setTimeout(() => controller.abort(), 330000);
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
      const base = await getApiBase();
      const token = (await getToken()) ?? '';
      const res = await fetch(`${base}/api/agent/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          sessionId: activeSessionId,
          message,
          answerStyle: settings.answerStyle,
          thinking: settings.showThinking,
          ...(opts?.regenerateFrom ? { regenerateFrom: opts.regenerateFrom } : {}),
        }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) throw new Error(`请求失败(${res.status})`);
      const reader = (res.body as unknown as { getReader: () => { read: () => Promise<{ done: boolean; value?: Uint8Array }> } }).getReader();
      // SSE 字节流按 UTF-8 增量解码（多字节中文可能被切断在块边界，不能按字节直接拼字符）
      const decode = createUtf8StreamDecoder();
      let buf = '';
      let doneEngine: string | undefined;
      let doneMessageId: number | undefined;
      let doneFallback: string | undefined;
      let hadError = false;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decode(value ?? new Uint8Array(0));
        const parts = buf.split('\n\n');
        buf = parts.pop() ?? '';
        for (const part of parts) {
          const line = part.split('\n').find((l) => l.startsWith('data: '));
          if (!line) continue;
          let ev: { type: string; delta?: string; name?: string; summary?: string; engine?: string; fallbackReason?: string; sessionId?: number; messageId?: number };
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
          if (ev.type === 'error') {
            hadError = true;
            setErr(ev.delta ?? '生成出错');
          }
          if (ev.type === 'done') {
            doneEngine = ev.engine;
            doneMessageId = ev.messageId;
            doneFallback = ev.fallbackReason;
          }
          setStream((st) => {
            const cur = st ?? { text: '', thinking: '', tools: [] as ToolState[], startedAt: Date.now() };
            if (ev.type === 'thinking') return { ...cur, thinking: cur.thinking + (ev.delta ?? '') };
            if (ev.type === 'text') return { ...cur, text: cur.text + (ev.delta ?? '') };
            if (ev.type === 'tool_start') return { ...cur, tools: [...cur.tools, { name: ev.name ?? '', status: 'running' }] };
            if (ev.type === 'tool_progress') {
              const tools = [...cur.tools];
              for (let i = tools.length - 1; i >= 0; i--) {
                if (tools[i].status === 'running' && (!ev.name || tools[i].name === ev.name)) {
                  tools[i] = { ...tools[i], summary: ev.summary };
                  break;
                }
              }
              return { ...cur, tools };
            }
            if (ev.type === 'tool_end') {
              return { ...cur, tools: cur.tools.map((x) => (x.name === ev.name && x.status === 'running' ? { ...x, status: 'done' as const, summary: ev.summary } : x)) };
            }
            return cur;
          });
        }
      }
      if (doneFallback && !hadError && doneFallback !== '已停止生成（保留已输出部分）' && doneFallback !== '已停止生成') setErr(doneFallback);
      setStream((st) => {
        if (st && (st.text.trim() || st.thinking.trim())) {
          setMessages((prev) => [
            ...prev,
            {
              id: doneMessageId ?? Date.now() + 1,
              sessionId: activeSessionId ?? 0,
              role: 'assistant',
              content: st.text.trim() || '（无内容）',
              engine: (doneEngine as never) ?? null,
              toolCalls: st.tools.filter((x) => x.status === 'done').map((x) => ({ name: x.name, summary: x.summary ?? '' })),
              createdAt: new Date().toISOString(),
            },
          ]);
        }
        return null;
      });
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        setStream((st) => {
          if (st && st.text.trim()) {
            setMessages((prev) => [
              ...prev,
              { id: Date.now() + 1, sessionId: activeSessionId ?? 0, role: 'assistant', content: st.text, engine: null, toolCalls: [], createdAt: new Date().toISOString() },
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
        setStream(null);
        // 重新生成可能已被服务端拒绝（旧 id/会话不存在），恢复被乐观截断的消息
        await syncSession();
      }
    } finally {
      clearTimeout(timer);
      abortRef.current = null;
      setBusy(false);
      loadSessions();
    }
  }

  /** 任意一条回复的重新生成：服务端从该回复起截断后重答 */
  function regenerateAt(index: number) {
    const assistant = messages[index];
    for (let i = index - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        send(messages[i].content, { regenerateFrom: assistant.id, truncateTo: i });
        return;
      }
    }
  }

  const grouped = {
    today: sessions.filter((s) => groupOf(s.updatedAt) === 'today'),
    yesterday: sessions.filter((s) => groupOf(s.updatedAt) === 'yesterday'),
    earlier: sessions.filter((s) => groupOf(s.updatedAt) === 'earlier'),
  };

  const currentTitle = sessions.find((s) => s.id === sessionId)?.title ?? 'PathPilot';

  return (
    <KeyboardAvoidingView style={{ flex: 1, ...SF.page }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* 顶栏：侧栏开关 / 标题 / 新建对话 */}
      <View style={{ paddingTop: 54, paddingHorizontal: 12, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: 1, borderBottomColor: C.line }}>
        <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} onPress={() => setSidebarOpen(true)}>
          <Icon name="menu" size={22} color={C.ink} />
        </TouchableOpacity>
        <Text style={{ flex: 1, fontSize: fs(15), fontWeight: '700', color: C.ink }} numberOfLines={1}>
          {messages.length === 0 && !busy ? 'PathPilot' : currentTitle}
        </Text>
        <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} onPress={newChat}>
          <View style={{ width: 30, height: 30, borderRadius: 999, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="plus" size={16} color={C.accent} strokeWidth={2.4} />
          </View>
        </TouchableOpacity>
      </View>

      {/* 消息流 */}
      <ScrollView
        ref={listRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 20 }}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.length === 0 && !stream && !busy && (
          <View style={{ alignItems: 'center', paddingVertical: '18%' }}>
            <View style={{ width: 58, height: 58, borderRadius: 18, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <LogoMark size={30} bg="transparent" fg="#FFFFFF" />
            </View>
            <Text style={{ fontSize: fs(20), fontWeight: '800', color: C.ink, marginBottom: 6 }}>{t('welcomeTitle')}</Text>
            <Text style={{ fontSize: fs(13), color: C.slate, marginBottom: 24, textAlign: 'center' }}>{guideStep === 'profile' ? '先完善目标岗位、年级和每周时间，再选择想要的就业建议。' : '你想先从哪一件事开始？'}</Text>
            {guideReady && guideStep === 'profile' ? (
              <View style={{ ...SF.card, width: '100%', padding: 16 }}>
                <Text style={{ fontSize: fs(14), fontWeight: '800', color: C.ink }}>先完善 3 项信息</Text>
                <Text style={{ fontSize: fs(12), color: C.slate, lineHeight: 19, marginTop: 6 }}>这些信息会影响岗位检索关键词与规划节奏。</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                  <TouchableOpacity style={{ ...SF.chip, flex: 1, backgroundColor: C.accent, borderWidth: 0, paddingVertical: 10, alignItems: 'center' }} onPress={() => router.push('/profile-edit')}><Text style={{ color: C.onAccent, fontWeight: '700', fontSize: fs(12) }}>去填写资料</Text></TouchableOpacity>
                  <TouchableOpacity style={{ ...SF.raised, flex: 1, paddingVertical: 10, alignItems: 'center' }} onPress={() => setGuideStep('choice')}><Text style={{ color: C.ink, fontWeight: '700', fontSize: fs(12) }}>继续</Text></TouchableOpacity>
                </View>
              </View>
            ) : guideReady && guideStep === 'choice' ? (
              <View style={{ width: '100%', gap: 8 }}>
                {[
                  ['岗位洞察', '分析真实招聘要求', '帮我搜索并分析目标岗位的真实招聘要求'],
                  ['能力差距', '找到当前技能缺口', '请结合我的档案做一次能力差距分析'],
                  ['成长路线', '生成分阶段路线', '请根据我的情况生成成长路线'],
                  ['任务拆解', '把大目标拆成子任务', '请把我当前最重要的目标拆成可跟踪的子任务'],
                  ['简历准备', '整理真实经历', '请帮我整理简历'],
                  ['面试模拟', '开始一轮模拟面试', '请开始一轮针对我目标岗位的模拟面试'],
                ].map(([title, desc, prompt]) => <TouchableOpacity key={title} style={{ ...SF.raised, padding: 12, borderRadius: 12 }} onPress={() => { setGuideStep('done'); send(prompt); }}><Text style={{ color: C.ink, fontWeight: '700', fontSize: fs(13) }}>{title}</Text><Text style={{ color: C.slate, fontSize: fs(11), marginTop: 3 }}>{desc}</Text></TouchableOpacity>)}
              </View>
            ) : null}
          </View>
        )}

        {messages.map((m, i) =>
          m.role === 'user' ? (
            <View key={m.id} style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 14 }}>
              <View style={{ ...SF.inset, maxWidth: '82%', borderRadius: 18, borderBottomRightRadius: 6, paddingHorizontal: 14, paddingVertical: 10 }}>
                <Text style={{ fontSize: fs(14), lineHeight: fs(21), color: C.ink }}>{m.content}</Text>
              </View>
            </View>
          ) : (
            <View key={m.id} style={{ marginBottom: 18 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <LogoMark size={20} bg={C.accent} fg="#FFFFFF" />
                <Text style={{ fontSize: fs(12), fontWeight: '700', color: C.ink }}>PathPilot</Text>
              </View>
              {m.errorCode ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                  <Icon name="warn" size={12} color={C.amber} />
                  <Text style={{ fontSize: fs(11), fontWeight: '600', color: C.amber }}>本次回复未完成</Text>
                </View>
              ) : null}
              <Markdown text={m.content} />
              {settings.showTools && m.toolCalls && m.toolCalls.length > 0 && <ToolList tools={m.toolCalls.map((tc: { name: string; summary: string }) => ({ ...tc, status: 'done' as const }))} />}
              {/* 回复操作：复制 + 重新生成（每条回复下方） */}
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
                <MsgAction
                  icon={copiedId === m.id ? 'check' : 'copy'}
                  label={copiedId === m.id ? t('copied') : t('copy')}
                  onPress={() => copyMessage(m)}
                />
                {!busy && <MsgAction icon="refresh" label={t('regenerate')} onPress={() => regenerateAt(i)} />}
              </View>
            </View>
          )
        )}

        {stream && <StreamBubble s={stream} />}

        {err ? (
          <View style={{ backgroundColor: C.amberSoft, borderRadius: 10, padding: 9, marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon name="warn" size={13} color={C.amber} />
            <Text style={{ flex: 1, fontSize: fs(11), color: C.amber }}>{err}</Text>
          </View>
        ) : null}
      </ScrollView>

      {/* 输入区（DeepSeek 式）：圆角容器 + 多行输入 + 功能开关 + 发送/停止 */}
      <View style={{ padding: 10, paddingBottom: 14, borderTopWidth: 1, borderTopColor: C.line }}>
        <View style={{ ...SF.inset, borderRadius: 18, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 8 }}>
          <TextInput
            style={{ fontSize: fs(14), color: C.ink, maxHeight: 110, minHeight: 24, padding: 0, textAlignVertical: 'center' }}
            placeholder={t('inputPlaceholder')}
            placeholderTextColor={C.slate2}
            value={input}
            onChangeText={setInput}
            multiline
          />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 5, backgroundColor: settings.showThinking ? C.accentSoft : 'transparent', borderWidth: 1, borderColor: settings.showThinking ? C.accent : C.line, boxShadow: settings.showThinking ? SF.chip.boxShadow : undefined }}
              onPress={() => update({ showThinking: !settings.showThinking })}
            >
              <Icon name="brain" size={14} color={settings.showThinking ? C.accent : C.slate} />
              <Text style={{ fontSize: fs(12), fontWeight: '600', color: settings.showThinking ? C.accent : C.slate }}>{t('think')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 5, backgroundColor: settings.answerStyle === 'concise' ? C.accentSoft : 'transparent', borderWidth: 1, borderColor: settings.answerStyle === 'concise' ? C.accent : C.line, boxShadow: settings.answerStyle === 'concise' ? SF.chip.boxShadow : undefined }}
              onPress={() => update({ answerStyle: settings.answerStyle === 'concise' ? 'detailed' : 'concise' })}
            >
              <Icon name="pen" size={14} color={settings.answerStyle === 'concise' ? C.accent : C.slate} />
              <Text style={{ fontSize: fs(12), fontWeight: '600', color: settings.answerStyle === 'concise' ? C.accent : C.slate }}>
                {settings.answerStyle === 'concise' ? t('concise') : t('detailed')}
              </Text>
            </TouchableOpacity>
            <View style={{ flex: 1 }} />
            {busy ? (
              <TouchableOpacity style={{ width: 34, height: 34, borderRadius: 999, backgroundColor: C.deep, alignItems: 'center', justifyContent: 'center' }} onPress={() => abortRef.current?.abort()}>
                <View style={{ width: 11, height: 11, borderRadius: 2.5, backgroundColor: C.paper }} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={{ width: 34, height: 34, borderRadius: 999, backgroundColor: input.trim() ? C.accent : C.slate2, alignItems: 'center', justifyContent: 'center' }}
                onPress={() => send()}
                disabled={!input.trim()}
              >
                <Icon name="arrowUp" size={18} color="#FFFFFF" strokeWidth={2.2} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      {/* 侧栏抽屉：历史对话（支持批量删除） */}
      <Modal visible={sidebarOpen} transparent animationType="none" onRequestClose={() => { setSidebarOpen(false); setSelectMode(false); }}>
        <Pressable style={{ flex: 1, flexDirection: 'row', backgroundColor: C.mask }} onPress={() => { setSidebarOpen(false); setSelectMode(false); }}>
          <Pressable style={{ width: '82%', maxWidth: 340, backgroundColor: C.paper, paddingTop: 54 }} onPress={() => {}}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 10 }}>
              <Text style={{ fontSize: fs(16), fontWeight: '800', color: C.ink }}>{t('history')}</Text>
              {sessions.length > 0 && (
                <TouchableOpacity
                  onPress={() => {
                    if (selectMode) {
                      setSelected(new Set());
                      setSelectMode(false);
                    } else {
                      setSelectMode(true);
                    }
                  }}
                >
                  <Text style={{ fontSize: fs(11), color: selectMode ? C.accent : '#E5484D', fontWeight: '600' }}>
                    {selectMode ? t('cancel') : t('batchDelete')}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* 批量删除操作条 */}
            {selectMode && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: C.line }}>
                <TouchableOpacity style={{ borderRadius: 8, borderWidth: 1, borderColor: C.line, paddingHorizontal: 10, paddingVertical: 5 }} onPress={() => setSelected(new Set(sessions.map((s) => s.id)))}>
                  <Text style={{ fontSize: fs(11), color: C.ink, fontWeight: '600' }}>{t('selectAll')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ borderRadius: 8, backgroundColor: selected.size ? '#E5484D' : C.slate2, paddingHorizontal: 10, paddingVertical: 5, flexDirection: 'row', alignItems: 'center', gap: 4 }}
                  disabled={!selected.size}
                  onPress={removeSelected}
                >
                  <Icon name="trash" size={12} color="#FFFFFF" />
                  <Text style={{ fontSize: fs(11), color: '#FFFFFF', fontWeight: '700' }}>{t('deleteSelected')}({selected.size})</Text>
                </TouchableOpacity>
              </View>
            )}

            <ScrollView contentContainerStyle={{ paddingHorizontal: 10, paddingBottom: 30 }}>
              {sessions.length === 0 && <Text style={{ fontSize: fs(12), color: C.slate2, textAlign: 'center', paddingVertical: 30 }}>{t('emptyHistory')}</Text>}
              {(['today', 'yesterday', 'earlier'] as const).map((g) =>
                grouped[g].length > 0 ? (
                  <View key={g}>
                    <Text style={{ fontSize: fs(11), color: C.slate2, marginLeft: 8, marginTop: 12, marginBottom: 4 }}>
                      {g === 'today' ? t('today') : g === 'yesterday' ? t('yesterday') : t('earlier')}
                    </Text>
                    {grouped[g].map((s) => (
                      <TouchableOpacity
                        key={s.id}
                        style={{ ...(!selectMode && s.id === sessionId ? SF.inset : { backgroundColor: 'transparent' }), borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}
                        onPress={() => {
                          if (selectMode) {
                            setSelected((prev) => {
                              const n = new Set(prev);
                              if (n.has(s.id)) n.delete(s.id);
                              else n.add(s.id);
                              return n;
                            });
                          } else {
                            openSession(s.id);
                          }
                        }}
                        onLongPress={() => setManageFor(s)}
                      >
                        {selectMode ? (
                          <View style={{ width: 18, height: 18, borderRadius: 5, borderWidth: 1.5, borderColor: selected.has(s.id) ? C.accent : C.line, backgroundColor: selected.has(s.id) ? C.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                            {selected.has(s.id) && <Icon name="check" size={11} color="#FFFFFF" strokeWidth={3} />}
                          </View>
                        ) : null}
                        <Text style={{ flex: 1, fontSize: fs(13), color: C.ink }} numberOfLines={1}>
                          {s.title}
                        </Text>
                        {!selectMode && <Text style={{ fontSize: fs(11), color: C.slate2 }}>{timeLabel(s.updatedAt)}</Text>}
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* 长按操作面板：重命名 / 删除 */}
      <Modal visible={!!manageFor} transparent animationType="fade" onRequestClose={() => setManageFor(null)}>
        <Pressable style={{ flex: 1, backgroundColor: C.mask, justifyContent: 'center', alignItems: 'center' }} onPress={() => setManageFor(null)}>
          <Pressable style={{ ...SF.card, width: '76%', overflow: 'hidden' }} onPress={() => {}}>
            <TouchableOpacity
              style={{ paddingVertical: 15, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: C.line }}
              onPress={() => {
                setRenameFor(manageFor);
                setRenameText(manageFor?.title ?? '');
                setManageFor(null);
              }}
            >
              <Text style={{ fontSize: fs(15), color: C.accent, fontWeight: '600' }}>{t('rename')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{ paddingVertical: 15, alignItems: 'center' }}
              onPress={() => {
                if (manageFor) remove(manageFor);
                setManageFor(null);
              }}
            >
              <Text style={{ fontSize: fs(15), color: '#E5484D', fontWeight: '600' }}>{t('deleteChat')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ paddingVertical: 15, alignItems: 'center', borderTopWidth: 1, borderTopColor: C.line }} onPress={() => setManageFor(null)}>
              <Text style={{ fontSize: fs(15), color: C.slate }}>{t('cancel')}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* 重命名对话框 */}
      <Modal visible={!!renameFor} transparent animationType="fade" onRequestClose={() => setRenameFor(null)}>
        <Pressable style={{ flex: 1, backgroundColor: C.mask, justifyContent: 'center', alignItems: 'center' }} onPress={() => setRenameFor(null)}>
          <Pressable style={{ ...SF.card, width: '80%', padding: 18 }} onPress={() => {}}>
            <Text style={{ fontSize: fs(15), fontWeight: '700', color: C.ink, marginBottom: 12 }}>{t('renameChat')}</Text>
            <TextInput
              style={{ ...SF.input, paddingHorizontal: 12, paddingVertical: 9, fontSize: fs(14), color: C.ink, marginBottom: 14 }}
              value={renameText}
              onChangeText={setRenameText}
              autoFocus
              maxLength={60}
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity style={{ flex: 1, borderRadius: 10, borderWidth: 1, borderColor: C.line, paddingVertical: 10, alignItems: 'center' }} onPress={() => setRenameFor(null)}>
                <Text style={{ fontSize: fs(14), color: C.slate, fontWeight: '600' }}>{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, borderRadius: 10, backgroundColor: C.accent, paddingVertical: 10, alignItems: 'center' }}
                onPress={() => {
                  if (renameFor) rename(renameFor, renameText);
                  setRenameFor(null);
                }}
              >
                <Text style={{ fontSize: fs(14), color: C.white, fontWeight: '700' }}>{t('confirm')}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

/** 回复消息下的小操作钮（图标+文字） */
function MsgAction({ icon, label, onPress }: { icon: 'copy' | 'check' | 'refresh'; label: string; onPress: () => void }) {
  const { fs } = useSettings();
  return (
    <TouchableOpacity style={{ ...SF.chip, flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: C.group }} onPress={onPress} activeOpacity={0.7}>
      <Icon name={icon} size={13} color={C.slate} />
      <Text style={{ fontSize: fs(11), color: C.slate }}>{label}</Text>
    </TouchableOpacity>
  );
}

/** 工具调用链（可折叠，按个性化设置展示） */
function ToolList({ tools }: { tools: ToolState[] }) {
  const { fs, settings, lang } = useSettings();
  const t = makeT(lang);
  const [open, setOpen] = useState(false);
  if (!settings.showTools || tools.length === 0) return null;
  const running = tools.some((x) => x.status === 'running');
  return (
    <TouchableOpacity style={{ ...SF.inset, borderRadius: 10, padding: 9, marginTop: 8 }} onPress={() => setOpen((v) => !v)} activeOpacity={0.7}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {running ? <Icon name="clock" size={13} color={C.slate} /> : <Icon name="wrench" size={13} color={C.slate} />}
        <Text style={{ fontSize: fs(11), color: C.slate }}>
          {tools.length} {t('usedTools')}
        </Text>
        <Icon name={open ? 'chevronUp' : 'chevronDown'} size={12} color={C.slate2} />
      </View>
      {open &&
        tools.map((x, i) => (
          <View key={i} style={{ marginTop: 7, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Icon name={x.status === 'running' ? 'clock' : 'checkCircle'} size={12} color={x.status === 'running' ? C.slate : C.teal} />
              <Text style={{ fontSize: fs(11), fontWeight: '700', color: C.ink }}>{x.name}</Text>
            </View>
            {x.summary ? (
              <Text style={{ fontSize: fs(10), color: C.slate, marginTop: 2 }} numberOfLines={4}>
                {x.summary}
              </Text>
            ) : null}
          </View>
        ))}
    </TouchableOpacity>
  );
}

/** 流式气泡：思考过程（个性化开关）→ 工具 → 增量文本 */
function StreamBubble({ s }: { s: StreamState }) {
  const { fs, settings, lang } = useSettings();
  const t = makeT(lang);
  const [elapsed, setElapsed] = useState(0);
  const [thinkOpen, setThinkOpen] = useState(true);
  useEffect(() => {
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - s.startedAt) / 1000)), 1000);
    return () => clearInterval(id);
  }, [s.startedAt]);
  const thinkingActive = !s.text;
  return (
    <View style={{ marginBottom: 18 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <LogoMark size={20} bg={C.accent} fg="#FFFFFF" />
        <Text style={{ fontSize: fs(12), fontWeight: '700', color: C.ink }}>PathPilot</Text>
      </View>
      {settings.showThinking && s.thinking ? (
        <TouchableOpacity style={{ ...SF.inset, borderRadius: 10, padding: 9, marginBottom: 8 }} onPress={() => setThinkOpen((v) => !v)} activeOpacity={0.7}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon name="brain" size={13} color={thinkingActive ? C.accent : C.slate} />
            <Text style={{ fontSize: fs(11), color: thinkingActive ? C.accent : C.slate, fontWeight: '600' }}>
              {thinkingActive ? `${t('thinking')}… ${elapsed}${t('seconds')}` : `${t('thoughtFor')} ${elapsed}${t('seconds')}`}
            </Text>
            <Icon name={thinkOpen ? 'chevronUp' : 'chevronDown'} size={12} color={C.slate2} />
          </View>
          {thinkOpen ? (
            <Text style={{ fontSize: fs(10), color: C.slate, lineHeight: fs(16), marginTop: 6 }} numberOfLines={thinkingActive ? 12 : 8}>
              {s.thinking}
            </Text>
          ) : null}
        </TouchableOpacity>
      ) : null}
      {settings.showTools && <ToolList tools={s.tools} />}
      {s.text ? (
        <Markdown text={s.text} />
      ) : (
        !s.thinking &&
        s.tools.length === 0 && (
          <View style={{ flexDirection: 'row', gap: 5, alignItems: 'center' }}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={{ width: 7, height: 7, borderRadius: 999, backgroundColor: C.slate2, opacity: 0.7 }} />
            ))}
          </View>
        )
      )}
    </View>
  );
}
