// 成长路线（PRD 5.2）：分学期时间轴 + 任务状态 + 规划依据
import { useCallback, useState } from 'react';
import { ScrollView, View, Text, RefreshControl } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { api } from '../../lib/api';
import { C, Card, Tag, Loading, ErrorBox, EmptyBox } from '../../components/ui';
import type { RoadmapDTO, RoadmapTaskDTO } from '@pathpilot/shared';
import { TASK_STATUS_LABELS } from '@pathpilot/shared';

export default function RoadmapTab() {
  const [data, setData] = useState<{ roadmap: RoadmapDTO; tasks: RoadmapTaskDTO[] } | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => {
    api<{ roadmap: RoadmapDTO; tasks: RoadmapTaskDTO[] } | null>('/api/roadmaps/current')
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

  if (loading) return <Loading />;
  if (err) return <View style={{ padding: 16, paddingTop: 54 }}><ErrorBox message={err} onRetry={load} /></View>;
  if (!data)
    return (
      <View style={{ padding: 16, paddingTop: 54 }}>
        <Text style={{ fontSize: 20, fontWeight: '800', color: C.ink, marginBottom: 12 }}>成长路线</Text>
        <EmptyBox title="还没有成长规划" hint="到 Web 端「动态规划」页或在「我的」中调整每周时间后生成规划；Web 与手机端数据实时同步。" />
      </View>
    );

  const { roadmap, tasks } = data;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.paper }} contentContainerStyle={{ padding: 16, paddingTop: 54 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); setTimeout(() => setRefreshing(false), 800); }} tintColor={C.accent} />}>
      <Text style={{ fontSize: 20, fontWeight: '800', color: C.ink }}>成长路线</Text>
      <Text style={{ fontSize: 12, color: C.slate, marginTop: 4, marginBottom: 14, lineHeight: 17 }}>
        {roadmap.content.goal}
      </Text>

      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <Tag tone="ink">v{roadmap.version}</Tag>
        <Tag tone="slate">{roadmap.content.semesters.length} 学期</Tag>
        <Tag tone="slate">{roadmap.content.total_estimated_hours}h</Tag>
        <Tag tone="teal">已完成 {tasks.filter((t) => t.status === 'done').length}</Tag>
        <Tag tone="amber">{roadmap.engine === 'pi-llm' ? 'AI 生成' : '规则引擎'}</Tag>
      </View>

      {roadmap.content.semesters.map((sem, i) => {
        const semTasks = tasks.filter((t) => t.semester === sem.index);
        const done = semTasks.filter((t) => t.status === 'done').length;
        return (
          <View key={sem.index} style={{ flexDirection: 'row', marginBottom: 4 }}>
            {/* 时间轴 */}
            <View style={{ alignItems: 'center', width: 28 }}>
              <View style={{ width: 12, height: 12, borderRadius: 999, backgroundColor: done === semTasks.length && semTasks.length ? C.teal : i === 0 ? C.accent : C.line, marginTop: 4 }} />
              {i < roadmap.content.semesters.length - 1 && <View style={{ flex: 1, width: 2, backgroundColor: C.line, marginTop: 4 } as object} />}
            </View>
            <Card style={{ flex: 1, marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: C.ink }}>{sem.label}</Text>
                <Tag tone="slate">{sem.estimated_hours}h</Tag>
              </View>
              {i === 0 && <View style={{ alignSelf: 'flex-start', marginBottom: 6 }}><Tag tone="accent">本学期</Tag></View>}
              <Text style={{ fontSize: 12, color: C.slate, lineHeight: 17, marginBottom: 6 }}>{sem.milestone}</Text>
              {sem.focus_skills.length ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                  {sem.focus_skills.map((s) => (
                    <Tag key={s} tone="amber">{s}</Tag>
                  ))}
                </View>
              ) : null}
              {semTasks.map((t) => (
                <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 7, borderTopWidth: 1, borderTopColor: C.line + '70' }}>
                  <Text style={{ flex: 1, fontSize: 12, fontWeight: '600', color: C.ink }} numberOfLines={1}>
                    {t.title}
                  </Text>
                  <Tag tone={t.status === 'done' ? 'teal' : t.status === 'in_progress' ? 'accent' : t.status === 'deferred' ? 'amber' : 'slate'}>
                    {TASK_STATUS_LABELS[t.status]}
                  </Tag>
                </View>
              ))}
            </Card>
          </View>
        );
      })}

      {roadmap.content.assumptions.length ? (
        <Card>
          <Text style={{ fontSize: 13, fontWeight: '700', color: C.ink, marginBottom: 6 }}>规划依据</Text>
          {roadmap.content.assumptions.map((a, i) => (
            <Text key={i} style={{ fontSize: 12, color: C.slate, lineHeight: 18 }}>
              · {a}
            </Text>
          ))}
        </Card>
      ) : null}
    </ScrollView>
  );
}
