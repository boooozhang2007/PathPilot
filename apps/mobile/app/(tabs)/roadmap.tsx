// 成长路线：分学期时间轴 + 任务状态 + 页内生成/重新规划（轮询 agent run）
import { useCallback, useState } from 'react';
import { ScrollView, View, Text, RefreshControl, ActivityIndicator } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { api, pollRun } from '../../lib/api';
import { C, Card, Tag, Loading, ErrorBox, EmptyBox, Btn, useSettings } from '../../components/ui';
import type { RoadmapDTO, RoadmapTaskDTO } from '@pathpilot/shared';
import { TASK_STATUS_LABELS } from '@pathpilot/shared';

export default function RoadmapTab() {
  const { fs } = useSettings();
  const [data, setData] = useState<{ roadmap: RoadmapDTO; tasks: RoadmapTaskDTO[] } | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyText, setBusyText] = useState('');

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

  /** 生成第一版规划（页内按钮，不必再去 Web 端） */
  async function generate() {
    setErr('');
    setBusyText('正在生成你的成长规划…');
    try {
      const profile = await api<{ targetRole?: string } | null>('/api/profile').catch(() => null);
      if (!profile?.targetRole) throw new Error('请先在「我的」→ 个人信息中填写目标岗位');
      const run = await api<{ run_id: number }>('/api/roadmaps', { method: 'POST', json: {} });
      setBusyText('AI 正在按学期拆解任务，约 1-2 分钟…');
      await pollRun(run.run_id, 300000);
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '生成失败');
    } finally {
      setBusyText('');
    }
  }

  /** 基于当前条件重新规划（AI 可自由调整任务） */
  async function revise() {
    setErr('');
    setBusyText('正在重新规划…');
    try {
      if (!data) return;
      const run = await api<{ run_id: number }>(`/api/roadmaps/${data.roadmap.id}/revise`, { method: 'POST', json: {} });
      setBusyText('AI 正在生成新版本…');
      await pollRun(run.run_id, 300000);
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '重规划失败（原规划不受影响）');
    } finally {
      setBusyText('');
    }
  }

  if (loading) return <Loading />;

  if (busyText) {
    return (
      <View style={{ flex: 1, backgroundColor: C.paper, paddingTop: 54, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <ActivityIndicator color={C.accent} size="large" />
        <Text style={{ fontSize: fs(14), color: C.ink, fontWeight: '700', marginTop: 16, textAlign: 'center' }}>{busyText}</Text>
        <Text style={{ fontSize: fs(12), color: C.slate, marginTop: 6, textAlign: 'center' }}>生成中可以离开此页，稍后回来下拉刷新</Text>
      </View>
    );
  }

  if (!data) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: C.paper }} contentContainerStyle={{ padding: 16, paddingTop: 54 }}>
        <Text style={{ fontSize: 20, fontWeight: '800', color: C.ink, marginBottom: 12 }}>成长路线</Text>
        {err ? <View style={{ marginBottom: 12 }}><ErrorBox message={err} onRetry={load} /></View> : null}
        <EmptyBox title="还没有成长规划" hint="AI 会基于你的档案、岗位分析与每周可投入时间，按学期拆解成可执行的任务。" />
        <Btn title="生成成长路线" onPress={generate} style={{ marginTop: 12 }} />
      </ScrollView>
    );
  }

  const { roadmap, tasks } = data;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.paper }} contentContainerStyle={{ padding: 16, paddingTop: 54, paddingBottom: 28 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); setTimeout(() => setRefreshing(false), 800); }} tintColor={C.accent} />}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 20, fontWeight: '800', color: C.ink }}>成长路线</Text>
        <Tag tone="ink">v{roadmap.version}</Tag>
      </View>
      <Text style={{ fontSize: 12, color: C.slate, marginTop: 4, marginBottom: 14, lineHeight: 17 }}>
        {roadmap.content.goal}
      </Text>
      {err ? <View style={{ marginBottom: 12 }}><ErrorBox message={err} onRetry={load} /></View> : null}

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

      <Btn title="重新规划（AI 自由调整任务）" kind="ghost" onPress={revise} />
    </ScrollView>
  );
}
