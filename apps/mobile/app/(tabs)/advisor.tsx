// AI 顾问（PRD 5.2）：对话 + 推荐问题
import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { api, getApiBase, getToken } from '../../lib/api';
import { C, Tag } from '../../components/ui';
import { Markdown } from '../../components/Markdown';
import type { ChatMessageDTO } from '@pathpilot/shared';

const SUGGESTIONS = ['我目前最应该学习什么？', '就业还是考研？', '我的项目经历缺哪些证据？', '换 AI 方向要补什么？'];

export default function AdvisorTab() {
  const [sessionId, setSessionId] = useState<number | undefined>();
  const [messages, setMessages] = useState<ChatMessageDTO[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [stream, setStream] = useState<{ text: string; thinking: string; tools: { name: string; status: 'running' | 'done'; summary?: string }[] } | null>(null);
  const listRef = useRef<React.ComponentRef<typeof ScrollView> | null>(null);

  const loadHistory = useCallback(() => {
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
    loadHistory();
  }, [loadHistory]);

  async function send(text?: string) {
    const message = (text ?? input).trim();
    if (!message || busy) return;
    setInput('');
    setErr('');
    setBusy(true);
    setStream({ text: '', thinking: '', tools: [] });
    setMessages((prev) => [...prev, { id: Date.now(), sessionId: sessionId ?? 0, role: 'user', content: message, engine: null, toolCalls: [], createdAt: new Date().toISOString() } as never]);
    try {
      const base = await getApiBase();
      const token = (await getToken()) ?? '';
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 300000);
      const res = await fetch(`${base}/api/agent/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ sessionId, message }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) throw new Error(`请求失败(${res.status})`);
      const reader = (res.body as unknown as { getReader: () => { read: () => Promise<{ done: boolean; value?: Uint8Array }> } }).getReader();
      let buf = '';
      let doneEngine: string | undefined;
      let doneFallback: string | undefined;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += String.fromCharCode(...Array.from(value ?? []));
        const parts = buf.split('\n\n');
        buf = parts.pop() ?? '';
        for (const part of parts) {
          const line = part.split('\n').find((l) => l.startsWith('data: '));
          if (!line) continue;
          let ev: { type: string; delta?: string; name?: string; summary?: string; engine?: string; fallbackReason?: string; sessionId?: number };
          try {
            ev = JSON.parse(line.slice(6));
          } catch {
            continue;
          }
          if (ev.sessionId) setSessionId(ev.sessionId);
          if (ev.type === 'done') {
            doneEngine = ev.engine;
            doneFallback = ev.fallbackReason;
          }
          setStream((st) => {
            const cur = st ?? { text: '', thinking: '', tools: [] as never[] };
            if (ev.type === 'thinking') return { ...cur, thinking: cur.thinking + (ev.delta ?? '') };
            if (ev.type === 'text') return { ...cur, text: cur.text + (ev.delta ?? '') };
            if (ev.type === 'tool_start') return { ...cur, tools: [...cur.tools, { name: ev.name ?? '', status: 'running' as const }] };
            if (ev.type === 'tool_end') {
              return { ...cur, tools: cur.tools.map((t) => (t.name === ev.name && t.status === 'running' ? { ...t, status: 'done' as const, summary: ev.summary } : t)) };
            }
            return cur;
          });
        }
      }
      clearTimeout(timer);
      if (doneFallback) setErr(doneFallback);
      // 落为正式消息
      setStream((st) => {
        if (st && st.text.trim()) {
          setMessages((prev) => [
            ...prev,
            { id: Date.now() + 1, sessionId: sessionId ?? 0, role: 'assistant', content: st.text, engine: (doneEngine as never) ?? null, toolCalls: st.tools.filter((t) => t.status === 'done').map((t) => ({ name: t.name, summary: t.summary ?? '' })), createdAt: new Date().toISOString() } as never,
          ]);
        }
        return null;
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : '发送失败');
      setStream(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.paper }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ paddingTop: 54, paddingHorizontal: 16 }}>
        <Text style={{ fontSize: 20, fontWeight: '800', color: C.ink }}>AI 顾问</Text>
      </View>

      <ScrollView ref={listRef} style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }} onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}>
        {messages.length === 0 && (
          <View style={{ alignItems: 'center', paddingVertical: 30 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: C.slate, marginBottom: 14 }}>问我任何职业规划问题</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
              {SUGGESTIONS.map((s2) => (
                <TouchableOpacity key={s2} style={{ backgroundColor: '#EDE8DB', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 }} onPress={() => send(s2)}>
                  <Text style={{ fontSize: 12, color: C.ink }}>{s2}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
        {messages.map((m) => (
          <View key={m.id} style={{ flexDirection: 'row', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 10 }}>
            <View
              style={{
                maxWidth: '85%',
                borderRadius: 16,
                borderBottomRightRadius: m.role === 'user' ? 4 : 16,
                borderBottomLeftRadius: m.role === 'user' ? 16 : 4,
                paddingHorizontal: 14,
                paddingVertical: 10,
                backgroundColor: m.role === 'user' ? C.ink : C.white,
                borderWidth: m.role === 'user' ? 0 : 1,
                borderColor: C.line,
              }}
            >
              {m.role === 'assistant'
                ? <Markdown text={m.content} />
                : <Text style={{ fontSize: 13, lineHeight: 20, color: '#fff' }}>{m.content}</Text>}
              {m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0 ? (
                <View style={{ marginTop: 8, gap: 6 }}>
                  {m.toolCalls.map((tc: { name: string; summary: string }, i: number) => (
                    <View key={i} style={{ backgroundColor: '#F5F2EA', borderRadius: 8, padding: 8, borderLeftWidth: 3, borderLeftColor: C.accent }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: C.ink, fontFamily: undefined }}>{tc.name}</Text>
                      <Text style={{ fontSize: 10, color: C.slate, marginTop: 2 }} numberOfLines={3}>{tc.summary}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          </View>
        ))}
        {busy && (
          <Text style={{ fontSize: 12, color: C.slate }}>思考中…</Text>
        )}
        {err ? <Text style={{ fontSize: 12, color: C.accent }}>{err}</Text> : null}
      </ScrollView>

      <View style={{ flexDirection: 'row', gap: 8, padding: 16, paddingTop: 8, backgroundColor: C.white, borderTopWidth: 1, borderTopColor: C.line }}>
        <TextInput
          style={{ flex: 1, borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: C.ink, backgroundColor: C.paper }}
          placeholder="输入你的问题…"
          placeholderTextColor={C.slate2}
          value={input}
          onChangeText={setInput}
          onSubmitEditing={() => send()}
          returnKeyType="send"
        />
        <TouchableOpacity style={{ backgroundColor: input.trim() && !busy ? C.accent : C.slate2, borderRadius: 10, paddingHorizontal: 18, justifyContent: 'center' }} onPress={() => send()} disabled={busy || !input.trim()}>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>发送</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}
