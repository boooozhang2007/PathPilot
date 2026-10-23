// 任务（PRD 5.2）：今日/本周/全部 + 完成/延期 + 成果记录（记录后同步 Web）
import { useCallback, useState } from 'react';
import { ScrollView, View, Text, TextInput, Modal, RefreshControl, TouchableOpacity } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { api } from '../../lib/api';
import { C, Card, Tag, Loading, ErrorBox, EmptyBox, Btn, Body } from '../../components/ui';
import type { RoadmapTaskDTO, ProfileDTO } from '@pathpilot/shared';
import { TASK_STATUS_LABELS, currentSemesterOf } from '@pathpilot/shared';

type View2 = 'today' | 'week' | 'all';

export default function TasksTab() {
  const [tasks, setTasks] = useState<RoadmapTaskDTO[]>([]);
  const [profile, setProfile] = useState<ProfileDTO | null>(null);
  const [view, setView] = useState<View2>('today');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [detail, setDetail] = useState<RoadmapTaskDTO | null>(null);
  const [evUrl, setEvUrl] = useState('');
  const [evNote, setEvNote] = useState('');
  const [evHours, setEvHours] = useState('');
  const [syncFail, setSyncFail] = useState('');

  const load = useCallback(() => {
    Promise.all([api<RoadmapTaskDTO[]>('/api/tasks'), api<ProfileDTO | null>('/api/profile')])
      .then(([t, p]) => {
        setTasks(t);
        setProfile(p);
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
      setDetail(null);
    } catch (e) {
      // 网络失败明确显示未同步（PRD 5.3）
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
  const sem = profile ? currentSemesterOf(profile.grade) : null;
  const today = new Date().toISOString().slice(0, 10);
  const visible =
    view === 'all' ? tasks : view === 'week' ? tasks.filter((t) => t.semester === sem) : tasks.filter((t) => t.status === 'in_progress' || (t.completedAt ?? '').startsWith(today));

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
          <EmptyBox title="暂无任务" hint="下拉刷新；任务来自当前生效的成长规划" />
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
                <Text style={{ fontSize: 12, color: C.slate, marginTop: 6 }}>
                  学期 {t.semester} · 预计 {t.estimatedHours}h{t.actualHours != null ? ` · 实际 ${t.actualHours}h` : ''}
                </Text>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                  {t.status !== 'done' && t.status !== 'in_progress' && (
                    <Btn title="开始" kind="ghost" onPress={() => update(t, { status: 'in_progress' })} style={{ paddingVertical: 6, paddingHorizontal: 14 }} />
                  )}
                  {t.status === 'in_progress' && (
                    <Btn title="完成 ✓" kind="teal" onPress={() => update(t, { status: 'done', actualHours: t.actualHours ?? t.estimatedHours })} style={{ paddingVertical: 6, paddingHorizontal: 14 }} />
                  )}
                  {t.status !== 'done' && t.status !== 'deferred' && (
                    <Btn title="延期" kind="ghost" onPress={() => update(t, { status: 'deferred', deferredReason: '手机端标记延期' })} style={{ paddingVertical: 6, paddingHorizontal: 14 }} />
                  )}
                  {t.evidenceUrl ? <Tag tone="teal">有成果</Tag> : null}
                </View>
              </TouchableOpacity>
            </Card>
          ))
        )}
      </ScrollView>

      {/* 任务详情/成果记录弹层 */}
      <Modal visible={!!detail} animationType="slide" transparent onRequestClose={() => setDetail(null)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(11,34,57,0.35)' }}>
          <View style={{ backgroundColor: C.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '85%' }}>
            {detail ? (
              <>
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
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TextInput style={[s.input, { flex: 1 }]} placeholder="成果说明" placeholderTextColor={C.slate2} value={evNote} onChangeText={setEvNote} />
                  <TextInput style={[s.input, { width: 90 }]} placeholder="实际小时" placeholderTextColor={C.slate2} value={evHours} onChangeText={setEvHours} keyboardType="numeric" />
                </View>
                <Btn title="保存成果（同步到 Web 端）" onPress={saveEvidence} style={{ marginBottom: 8 }} />
                <Btn title="关闭" kind="ghost" onPress={() => setDetail(null)} />
              </>
            ) : null}
          </View>
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
