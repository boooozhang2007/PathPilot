// 首页（PRD 5.2）：目标概览 + 匹配环 + 今日任务 + 最近调整
import { useCallback, useState } from 'react';
import { ScrollView, View, Text, RefreshControl } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { api } from '../../lib/api';
import { C, Card, H1, Body, Tag, Ring, Loading, ErrorBox, Btn } from '../../components/ui';
import type { DashboardData, RoadmapTaskDTO } from '@pathpilot/shared';
import { TASK_STATUS_LABELS, GRADE_LABELS } from '@pathpilot/shared';

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

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.paper }} contentContainerStyle={{ padding: 16, paddingTop: 54 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); setTimeout(() => setRefreshing(false), 800); }} tintColor={C.accent} />}>
      {/* 顶部 Hero */}
      <View style={{ backgroundColor: C.ink, borderRadius: 16, padding: 20, marginBottom: 16 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#fff', fontSize: 20, fontWeight: '800' }}>{d?.profile?.nickname ?? '同学'}，加油 🚀</Text>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 6, lineHeight: 18 }}>
              {d?.profile ? `${GRADE_LABELS[d.profile.grade]} · ${d.profile.targetRole || '未设目标'} · 每周 ${d.profile.weeklyHours}h` : '先完善个人资料开始规划'}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              {d?.activeRoadmapVersion ? <View style={{ backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}><Text style={{ color: '#fff', fontSize: 11, fontWeight: '600' }}>当前规划 v{d.activeRoadmapVersion}</Text></View> : null}
              {d?.currentSemester ? <View style={{ backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}><Text style={{ color: '#fff', fontSize: 11, fontWeight: '600' }}>{d.currentSemester.label} {d.currentSemester.doneRatio}%</Text></View> : null}
            </View>
          </View>
          {d?.matchScore !== null && d?.matchScore !== undefined ? (
            <Ring value={d.matchScore} size={92} label={`${d.matchSampleCount} 样本`} />
          ) : (
            <View style={{ width: 92, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, textAlign: 'center' }}>暂无岗位样本{'\n'}匹配度待分析</Text>
            </View>
          )}
        </View>
      </View>

      {err ? <View style={{ marginBottom: 12 }}><ErrorBox message={err} onRetry={load} /></View> : null}

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

      {/* 今日任务 */}
      <Card style={{ marginBottom: 12 }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: C.ink, marginBottom: 10 }}>近期任务</Text>
        {d?.recentTasks?.length ? (
          <View>
            {d.recentTasks.slice(0, 4).map((t) => (
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
          <Body muted>暂无任务，去「成长路线」生成你的规划</Body>
        )}
      </Card>

      {/* 最近调整 */}
      {d?.lastReplan ? (
        <Card>
          <Text style={{ fontSize: 14, fontWeight: '700', color: C.ink, marginBottom: 8 }}>最近一次规划调整（v{d.lastReplan.version}）</Text>
          <Body muted style={{ lineHeight: 19 }}>
            预计投入 {d.lastReplan.diff.hours_change.from}h → {d.lastReplan.diff.hours_change.to}h；新增 {d.lastReplan.diff.added_tasks.length} 项 · 移除 {d.lastReplan.diff.removed_tasks.length} 项 · 延后 {d.lastReplan.diff.deferred_tasks.length} 项
            {d.lastReplan.diff.reasons[0] ? `\n原因：${d.lastReplan.diff.reasons[0].slice(0, 80)}` : ''}
          </Body>
        </Card>
      ) : null}
    </ScrollView>
  );
}
