// AI 顾问（PRD 5.2）：对话 + 推荐问题
import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { api } from '../../lib/api';
import { C, Tag } from '../../components/ui';
import type { ChatMessageDTO } from '@pathpilot/shared';

const SUGGESTIONS = ['我目前最应该学习什么？', '就业还是考研？', '我的项目经历缺哪些证据？', '换 AI 方向要补什么？'];

export default function AdvisorTab() {
  const [sessionId, setSessionId] = useState<number | undefined>();
  const [messages, setMessages] = useState<ChatMessageDTO[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
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
    setMessages((prev) => [...prev, { id: Date.now(), sessionId: sessionId ?? 0, role: 'user', content: message, engine: null, createdAt: new Date().toISOString() }]);
    try {
      const res = await api<{ sessionId: number; reply: ChatMessageDTO }>('/api/agent/chat', { method: 'POST', json: { sessionId, message } });
      setSessionId(res.sessionId);
      setMessages((prev) => [...prev, res.reply]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '发送失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.paper }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ paddingTop: 54, paddingHorizontal: 16 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: C.ink }}>AI 顾问</Text>
          <Tag tone="teal">基于你的真实数据</Tag>
        </View>
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
              <Text style={{ fontSize: 13, lineHeight: 20, color: m.role === 'user' ? '#fff' : C.ink }}>{m.content}</Text>
              {m.role === 'assistant' && m.engine ? <Text style={{ fontSize: 10, color: C.slate2, marginTop: 4 }}>{m.engine === 'pi-llm' ? 'AI 模型' : '规则引擎'} · 你的真实数据</Text> : null}
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
