// 首页（任务5改版）：问候 + 圆环展示本学期进度 + 独立进度卡 + 技能缺口 + 近期任务
import { useCallback, useState } from 'react';
import { ScrollView, View, Text, RefreshControl } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { api } from '../../lib/api';
import { C, Card, Tag, Ring, Loading, ErrorBox, Btn } from '../../components/ui';
import type { DashboardData, RoadmapTaskDTO } from '@pathpilot/shared';
import { TASK_STATUS_LABELS } from '@pathpilot/shared';

export default function Home() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => {
    api<DashboardData>('/api/dashboard')
      .then((d) => {
        setData(d);
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

  async function quickDone(task: RoadmapTaskDTO) {
    try {
      await api(`/api/tasks/${task.id}`, { method: 'PATCH', json: { status: 'done', expectedUpdatedAt: task.updatedAt } });
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '更新失败');
    }
  }

  if (loading) return <Loading />;
  const d = data;
  const sem = d?.currentSemester ?? null;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.paper }} contentContainerStyle={{ padding: 16, paddingTop: 54 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); setTimeout(() => setRefreshing(false), 800); }} tintColor={C.accent} />}>
      {/* 顶部 Hero：问候 + 进度圆环 */}
      <View style={{ backgroundColor: C.ink, borderRadius: 16, padding: 20, marginBottom: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flex: 1, paddingRight: 8 }}>
          <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800' }}>{d?.profile?.nickname ?? '同学'}，加油 🚀</Text>
          {d?.topGaps?.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
              {d.topGaps.slice(0, 3).map((g) => (
                <View key={g.skill} style={{ backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
                  <Text style={{ color: '#fff', fontSize: 11, fontWeight: '600' }}>{g.skill}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
        <Ring value={sem ? sem.doneRatio : 0} size={104} />
      </View>

      {err ? <View style={{ marginBottom: 12 }}><ErrorBox message={err} onRetry={load} /></View> : null}

      {/* 本学期进度（从 Hero 移入独立卡片） */}
      {sem ? (
        <Card style={{ marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: C.ink }}>{sem.label}</Text>
            <Tag tone="teal">{sem.doneRatio}%</Tag>
          </View>
          <View style={{ height: 8, borderRadius: 999, backgroundColor: '#EDE8DB', marginTop: 10, overflow: 'hidden' }}>
            <View style={{ height: 8, borderRadius: 999, backgroundColor: C.accent, width: `${sem.doneRatio}%` } as object} />
          </View>
          <Text style={{ fontSize: 12, color: C.slate, marginTop: 8 }}>已完成 {sem.doneTasks} / {sem.totalTasks} 项任务</Text>
        </Card>
      ) : null}

      {/* 技能缺口 */}
      {d?.topGaps?.length ? (
        <Card style={{ marginBottom: 12 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: C.ink, marginBottom: 10 }}>核心技能缺口</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {d.topGaps.map((g) => (
              <Tag key={g.skill} tone={g.importance === 'high' ? 'accent' : 'slate'}>
                {g.skill}
              </Tag>
            ))}
          </View>
        </Card>
      ) : null}

      {/* 近期任务 */}
      <Card>
        <Text style={{ fontSize: 14, fontWeight: '700', color: C.ink, marginBottom: 10 }}>近期任务</Text>
        {d?.recentTasks?.length ? (
          <View>
            {d.recentTasks.slice(0, 5).map((t) => (
              <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: C.line + '80' }}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: C.ink }} numberOfLines={1}>
                    {t.title}
                  </Text>
                  <Text style={{ fontSize: 11, color: C.slate, marginTop: 2 }}>
                    {t.estimatedHours}h · {TASK_STATUS_LABELS[t.status]}
                  </Text>
                </View>
                {t.status === 'in_progress' ? (
                  <Btn title="完成" kind="teal" onPress={() => quickDone(t)} style={{ paddingVertical: 6, paddingHorizontal: 12 }} />
                ) : (
                  <Tag tone="slate">{TASK_STATUS_LABELS[t.status]}</Tag>
                )}
              </View>
            ))}
          </View>
        ) : (
          <Text style={{ fontSize: 12, color: C.slate }}>暂无任务，去「成长路线」生成你的规划</Text>
        )}
      </Card>
    </ScrollView>
  );
}
