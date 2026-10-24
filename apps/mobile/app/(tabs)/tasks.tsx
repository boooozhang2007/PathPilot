// 任务（任务7改版）：点击空白关闭详情 / 任务说明板块 / 成果放大编辑 / 开始·暂停跟踪
import { useCallback, useState } from 'react';
import { ScrollView, View, Text, TextInput, Modal, RefreshControl, TouchableOpacity, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { api } from '../../lib/api';
import { C, Card, Tag, Loading, ErrorBox, EmptyBox, Btn, Body } from '../../components/ui';
import type { RoadmapTaskDTO } from '@pathpilot/shared';
import { TASK_STATUS_LABELS, PRIORITY_LABELS } from '@pathpilot/shared';

type View2 = 'today' | 'week' | 'all';

export default function TasksTab() {
  const [tasks, setTasks] = useState<RoadmapTaskDTO[]>([]);
  const [view, setView] = useState<View2>('today');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [detail, setDetail] = useState<RoadmapTaskDTO | null>(null);
  const [evUrl, setEvUrl] = useState('');
  const [evNote, setEvNote] = useState('');
  const [evHours, setEvHours] = useState('');
  const [noteMax, setNoteMax] = useState(false); // 成果说明放大编辑
  const [syncFail, setSyncFail] = useState('');
  const [curSemester, setCurSemester] = useState<number | null>(null);

  const load = useCallback(() => {
    Promise.all([api<RoadmapTaskDTO[]>('/api/tasks'), api<{ grade?: string } | null>('/api/profile').catch(() => null)])
      .then(([t, p]) => {
        setTasks(t);
        if (p?.grade) {
          const map: Record<string, number> = { freshman: 1, sophomore: 3, junior: 5, senior: 7, graduate: 9, other: 5 };
          setCurSemester(map[p.grade] ?? 5);
        }
        setErr('');
      })
      .catch((e) => setErr(e instanceof Error ? e.message : '加载失败'))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function update(task: RoadmapTaskDTO, patch: Record<string, unknown>) {
    setSyncFail('');
    try {
      const updated = await api<RoadmapTaskDTO>(`/api/tasks/${task.id}`, { method: 'PATCH', json: { ...patch, expectedUpdatedAt: task.updatedAt } });
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      setDetail((d) => (d && d.id === updated.id ? updated : d));
    } catch (e) {
      setSyncFail(e instanceof Error ? e.message : '未同步：更新失败，请重试');
      load();
    }
  }

  async function saveEvidence() {
    if (!detail) return;
    await update(detail, {
      ...(evUrl ? { evidenceUrl: evUrl } : {}),
      ...(evNote ? { resultNote: evNote } : {}),
      ...(evHours !== '' ? { actualHours: Number(evHours) } : {}),
    });
  }

  if (loading) return <Loading />;
  const today = new Date().toISOString().slice(0, 10);
  const visible =
    view === 'all' ? tasks : view === 'week' ? tasks.filter((t) => t.semester === curSemester) : tasks.filter((t) => t.status === 'in_progress' || (t.completedAt ?? '').startsWith(today));

  return (
    <View style={{ flex: 1, backgroundColor: C.paper, paddingTop: 54 }}>
      <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
        <Text style={{ fontSize: 20, fontWeight: '800', color: C.ink }}>任务</Text>
        {syncFail ? (
          <View style={{ backgroundColor: C.amberSoft, borderRadius: 10, padding: 10, marginTop: 10 }}>
            <Text style={{ color: C.amber, fontSize: 12 }}>{syncFail}</Text>
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', backgroundColor: '#EDE8DB', borderRadius: 10, padding: 3, marginTop: 12 }}>
          {([['today', '今日'], ['week', '本学期'], ['all', '全部']] as [View2, string][]).map(([k, label]) => (
            <TouchableOpacity key={k} style={{ flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: view === k ? C.white : 'transparent', alignItems: 'center' }} onPress={() => setView(k)}>
              <Text style={{ fontWeight: '600', fontSize: 13, color: view === k ? C.ink : C.slate }}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); setTimeout(() => setRefreshing(false), 800); }} tintColor={C.accent} />}>
        {err ? <ErrorBox message={err} onRetry={load} /> : null}
        {visible.length === 0 ? (
          <EmptyBox title="暂无任务" hint="下拉刷新；也可在 AI 顾问中让 Agent 添加任务" />
        ) : (
          visible.map((t) => (
            <Card key={t.id} style={{ marginBottom: 10 }}>
              <TouchableOpacity onPress={() => { setDetail(t); setEvUrl(t.evidenceUrl ?? ''); setEvNote(t.resultNote ?? ''); setEvHours(t.actualHours != null ? String(t.actualHours) : ''); }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: C.ink }} numberOfLines={2}>
                    {t.title}
                  </Text>
                  <Tag tone={t.status === 'done' ? 'teal' : t.status === 'in_progress' ? 'accent' : t.status === 'deferred' ? 'amber' : 'slate'}>
                    {TASK_STATUS_LABELS[t.status]}
                  </Tag>
                </View>
                {/* 详细说明板块 */}
                {t.description ? (
                  <Text style={{ fontSize: 12, color: C.slate, lineHeight: 18, marginTop: 6 }} numberOfLines={2}>
                    {t.description}
                  </Text>
                ) : null}
                <Text style={{ fontSize: 12, color: C.slate2, marginTop: 6 }}>
                  预计 {t.estimatedHours}h · 优先级{PRIORITY_LABELS[t.priority]}{t.actualHours != null ? ` · 实际 ${t.actualHours}h` : ''}
                </Text>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  {/* 跟踪：开始/暂停 */}
                  {t.status === 'not_started' && (
                    <Btn title="▶ 开始跟踪" kind="ghost" onPress={() => update(t, { status: 'in_progress' })} style={{ paddingVertical: 6, paddingHorizontal: 12 }} />
                  )}
                  {t.status === 'in_progress' && (
                    <>
                      <Btn title="⏸ 暂停" kind="ghost" onPress={() => update(t, { status: 'not_started' })} style={{ paddingVertical: 6, paddingHorizontal: 12 }} />
                      <Btn title="完成 ✓" kind="teal" onPress={() => update(t, { status: 'done', actualHours: t.actualHours ?? t.estimatedHours })} style={{ paddingVertical: 6, paddingHorizontal: 12 }} />
                    </>
                  )}
                  {t.status === 'deferred' && (
                    <Btn title="▶ 恢复跟踪" kind="ghost" onPress={() => update(t, { status: 'in_progress' })} style={{ paddingVertical: 6, paddingHorizontal: 12 }} />
                  )}
                  {t.status !== 'done' && t.status !== 'deferred' && (
                    <Btn title="延期" kind="ghost" onPress={() => update(t, { status: 'deferred', deferredReason: '手机端标记延期' })} style={{ paddingVertical: 6, paddingHorizontal: 12 }} />
                  )}
                  {t.evidenceUrl ? <Tag tone="teal">有成果</Tag> : null}
                </View>
              </TouchableOpacity>
            </Card>
          ))
        )}
      </ScrollView>

      {/* 任务详情/成果记录：点击上方空白处关闭 */}
      <Modal visible={!!detail} animationType="slide" transparent onRequestClose={() => setDetail(null)}>
        <Pressable style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(11,34,57,0.35)' }} onPress={() => setDetail(null)}>
          <Pressable onPress={(e) => e.stopPropagation()}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ backgroundColor: C.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '85%' }}>
              {detail ? (
                <>
                  <View style={{ width: 40, height: 4, borderRadius: 999, backgroundColor: C.line, alignSelf: 'center', marginBottom: 12 }} />
                  <Text style={{ fontSize: 16, fontWeight: '800', color: C.ink, marginBottom: 8 }}>{detail.title}</Text>
                  <Body muted style={{ marginBottom: 12 }}>{detail.description}</Body>
                  <View style={{ backgroundColor: '#F5F2EA', borderRadius: 10, padding: 10, marginBottom: 8 }}>
                    <Text style={{ fontSize: 12, color: C.ink, lineHeight: 18 }}><Text style={{ fontWeight: '700' }}>产出：</Text>{detail.deliverable}</Text>
                  </View>
                  <View style={{ backgroundColor: '#F5F2EA', borderRadius: 10, padding: 10, marginBottom: 14 }}>
                    <Text style={{ fontSize: 12, color: C.ink, lineHeight: 18 }}><Text style={{ fontWeight: '700' }}>验收：</Text>{detail.acceptanceCriteria}</Text>
                  </View>

                  <Text style={{ fontSize: 13, fontWeight: '700', color: C.ink, marginBottom: 8 }}>记录学习成果</Text>
                  <TextInput style={s.input} placeholder="成果链接（GitHub/部署地址）" placeholderTextColor={C.slate2} value={evUrl} onChangeText={setEvUrl} autoCapitalize="none" />
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                    <View style={{ flex: 1 }}>
                      <TextInput
                        style={[s.input, { minHeight: 60, textAlignVertical: 'top' }]}
                        placeholder="成果说明"
                        placeholderTextColor={C.slate2}
                        value={evNote}
                        onChangeText={setEvNote}
                        multiline
                      />
                      <TouchableOpacity onPress={() => setNoteMax(true)} style={{ position: 'absolute', right: 8, bottom: 10 }}>
                        <Text style={{ fontSize: 16 }}>⤢</Text>
                      </TouchableOpacity>
                    </View>
                    <TextInput style={[s.input, { width: 90 }]} placeholder="实际小时" placeholderTextColor={C.slate2} value={evHours} onChangeText={setEvHours} keyboardType="numeric" />
                  </View>
                  <Btn title="保存成果" onPress={saveEvidence} style={{ marginBottom: 8 }} />
                  <Btn title="关闭" kind="ghost" onPress={() => setDetail(null)} />
                </>
              ) : null}
            </KeyboardAvoidingView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* 成果说明放大编辑 */}
      <Modal visible={noteMax} animationType="fade" onRequestClose={() => setNoteMax(false)}>
        <View style={{ flex: 1, backgroundColor: C.paper, paddingTop: 54, paddingHorizontal: 16 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: C.ink }}>成果说明</Text>
            <TouchableOpacity onPress={() => setNoteMax(false)} style={{ padding: 6 }}>
              <Text style={{ fontSize: 13, color: C.accent, fontWeight: '700' }}>收起 ⤡</Text>
            </TouchableOpacity>
          </View>
          <TextInput
            style={{ flex: 1, backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 14, fontSize: 14, color: C.ink, textAlignVertical: 'top' }}
            value={evNote}
            onChangeText={setEvNote}
            multiline
            autoFocus
            placeholder="写下这个任务的真实成果：做了什么、用什么技术、结果如何…"
            placeholderTextColor={C.slate2}
          />
        </View>
      </Modal>
    </View>
  );
}

const s = {
  input: {
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: C.ink,
    backgroundColor: C.white,
    marginBottom: 10,
  },
} as const;
