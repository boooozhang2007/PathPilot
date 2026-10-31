// 学习提醒 & 周期总结：任务到期提醒 + 每周总结（确定性）
import { useCallback, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { api } from '../lib/api';
import { C, SF, Card, Tag, Loading, ErrorBox, EmptyBox, useSettings } from '../components/ui';
import { Icon } from '../components/icons';
import type { ReminderPayloadDTO, WeeklySummaryDTO } from '@pathpilot/shared';

export default function RemindersPage() {
  const router = useRouter();
  const { fs } = useSettings();
  const [payload, setPayload] = useState<ReminderPayloadDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(() => {
    api<ReminderPayloadDTO>('/api/reminders')
      .then((p) => {
        setPayload(p);
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

  async function dismiss(id: number) {
    await api(`/api/reminders/${id}/dismiss`, { method: 'POST' }).catch(() => {});
    setPayload((prev) => (prev ? { ...prev, reminders: prev.reminders.filter((r) => r.id !== id) } : prev));
  }

  return (
    <ScrollView
      style={{ flex: 1, ...SF.page }}
      contentContainerStyle={{ padding: 16, paddingTop: 54, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); setTimeout(() => setRefreshing(false), 800); }} tintColor={C.accent} />}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Text style={{ fontSize: fs(20), fontWeight: '800', color: C.ink }}>学习提醒</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ fontSize: fs(13), color: C.accent, fontWeight: '700' }}>完成</Text>
        </TouchableOpacity>
      </View>

      {err ? <View style={{ marginBottom: 12 }}><ErrorBox message={err} onRetry={load} /></View> : null}
      {loading ? <Loading /> : null}

      {payload?.weeklySummary ? <WeeklySummary s={payload.weeklySummary} fs={fs} /> : null}

      <View style={{ marginTop: payload?.weeklySummary ? 14 : 0 }}>
        <Text style={{ fontSize: fs(14), fontWeight: '700', color: C.ink, marginBottom: 8 }}>到期提醒（{payload?.reminders.length ?? 0}）</Text>
        {payload && payload.reminders.length === 0 ? (
          <EmptyBox title="暂无提醒" hint="未来 7 天内到期的任务会出现在这里" />
        ) : (
          (payload?.reminders ?? []).map((r) => (
            <Card key={r.id} style={{ marginBottom: 10, padding: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 34, height: 34, borderRadius: 9, backgroundColor: C.amberSoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="bell" size={16} color={C.amber} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: fs(13), fontWeight: '700', color: C.ink }} numberOfLines={1}>{r.title}</Text>
                  <Text style={{ fontSize: fs(11), color: C.slate, marginTop: 2 }} numberOfLines={2}>{r.message}</Text>
                </View>
                <TouchableOpacity onPress={() => dismiss(r.id)} style={{ paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: C.line }}>
                  <Text style={{ fontSize: fs(11), color: C.slate, fontWeight: '600' }}>已读</Text>
                </TouchableOpacity>
              </View>
            </Card>
          ))
        )}
      </View>
    </ScrollView>
  );
}

function WeeklySummary({ s, fs }: { s: WeeklySummaryDTO; fs: (n: number) => number }) {
  return (
    <Card style={{ padding: 16 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Text style={{ fontSize: fs(14), fontWeight: '700', color: C.ink }}>本周总结</Text>
        <Tag tone="teal">{s.semesterCompletionRate}% 完成率</Tag>
      </View>
      <View style={{ flexDirection: 'row', marginBottom: 12 }}>
        <MiniStat label="本周完成" value={`${s.tasksCompletedThisWeek}`} unit="项" fs={fs} />
        <MiniStat label="计划投入" value={`${s.hoursPlannedThisWeek}`} unit="h" fs={fs} />
        <MiniStat label="实际投入" value={`${s.hoursActualThisWeek}`} unit="h" fs={fs} />
        <MiniStat label="累计完成" value={`${s.totalDoneTasks}`} unit="项" fs={fs} />
      </View>
      {s.highlights.map((h, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 6, marginBottom: 4 }}>
          <Icon name="check" size={13} color={C.teal} strokeWidth={2.6} />
          <Text style={{ flex: 1, fontSize: fs(12), color: C.slate, lineHeight: fs(18) }}>{h}</Text>
        </View>
      ))}
    </Card>
  );
}

function MiniStat({ label, value, unit, fs }: { label: string; value: string; unit?: string; fs: (n: number) => number }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ fontSize: fs(10), color: C.slate2 }}>{label}</Text>
      <Text style={{ fontSize: fs(16), fontWeight: '800', color: C.ink, marginTop: 2 }}>
        {value}
        {unit ? <Text style={{ fontSize: fs(10), fontWeight: '600', color: C.slate2 }}> {unit}</Text> : null}
      </Text>
    </View>
  );
}
