// 新手引导任务卡（首页）：手把手四步教会用 App，完成状态实时检测，右上角 × 关闭
import { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
import { api, getToken, isGuest } from '../lib/api';
import { C, useSettings } from './ui';
import { Icon, type IconName } from './icons';
import type { ProfileDTO, ChatSessionSummaryDTO, RoadmapVersionSummary } from '@pathpilot/shared';

const KEY_DISMISS = 'pp_guide_dismissed';

interface Step {
  key: string;
  icon: IconName;
  title: string;
  how: string;
  route: string;
  check: (ctx: { profile: ProfileDTO | null; sessions: ChatSessionSummaryDTO[]; roadmaps: RoadmapVersionSummary[]; doneTasks: number }) => boolean;
}

const STEPS: Step[] = [
  {
    key: 'profile',
    icon: 'user',
    title: '完善个人资料',
    how: '「我的」→ 点账号卡 → 填目标岗位、每周时间并保存',
    route: '/profile-edit',
    check: (c) => !!c.profile?.targetRole,
  },
  {
    key: 'ask',
    icon: 'chat',
    title: '问 AI 顾问一个问题',
    how: '「AI 顾问」页输入问题发送，如“我目前最应该学什么？”',
    route: '/advisor',
    check: (c) => c.sessions.length > 0,
  },
  {
    key: 'roadmap',
    icon: 'roadmap',
    title: '生成成长路线',
    how: '「成长路线」页点击生成，按学期拆解成可执行任务',
    route: '/roadmap',
    check: (c) => c.roadmaps.length > 0,
  },
  {
    key: 'task',
    icon: 'checkCircle',
    title: '完成第一个任务',
    how: '「任务」页打卡完成，做完可提交证据链接攒经历',
    route: '/tasks',
    check: (c) => c.doneTasks > 0,
  },
];

export function GuideTasks() {
  const router = useRouter();
  const { fs } = useSettings();
  const [authed, setAuthed] = useState(false);
  const [dismissed, setDismissed] = useState(true); // 读取存储前不渲染
  const [doneMap, setDoneMap] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(() => {
    Promise.all([getToken(), isGuest(), AsyncStorage.getItem(KEY_DISMISS)]).then(([token, guest, dis]) => {
      setDismissed(dis === '1');
      if (!token || guest) {
        setAuthed(false);
        return;
      }
      setAuthed(true);
      setLoading(true);
      Promise.all([
        api<ProfileDTO | null>('/api/profile').catch(() => null),
        api<ChatSessionSummaryDTO[]>('/api/agent/sessions').catch(() => []),
        api<RoadmapVersionSummary[]>('/api/roadmaps').catch(() => []),
        api<{ doneTasks: number }>('/api/stats/growth').catch(() => ({ doneTasks: 0 })),
      ])
        .then(([profile, sessions, roadmaps, growth]) => {
          const ctx = { profile, sessions, roadmaps, doneTasks: growth.doneTasks };
          setDoneMap(Object.fromEntries(STEPS.map((s) => [s.key, s.check(ctx)])));
        })
        .finally(() => setLoading(false));
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  if (!authed || dismissed) return null;

  const doneCount = STEPS.filter((s) => doneMap[s.key]).length;
  const allDone = doneCount === STEPS.length;
  // 第一个未完成的步骤（引导用户按顺序做）
  const activeIdx = STEPS.findIndex((s) => !doneMap[s.key]);

  async function dismiss() {
    await AsyncStorage.setItem(KEY_DISMISS, '1');
    setDismissed(true);
  }

  return (
    <View style={{ backgroundColor: C.white, borderRadius: 16, borderWidth: 1, borderColor: C.line, marginBottom: 12, overflow: 'hidden' }}>
      {/* 头部：进度 + × 关闭 */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {allDone ? <Icon name="party" size={16} color={C.teal} /> : null}
          <Text style={{ fontSize: fs(14), fontWeight: '800', color: C.ink }}>{allDone ? '上手完成' : '新手引导'}</Text>
          {!allDone && (
            <View style={{ backgroundColor: C.accentSoft, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
              <Text style={{ fontSize: fs(11), fontWeight: '700', color: C.accent }}>
                {doneCount}/{STEPS.length}
              </Text>
            </View>
          )}
        </View>
        <TouchableOpacity
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          onPress={dismiss}
          style={{ width: 26, height: 26, borderRadius: 999, backgroundColor: C.group, alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon name="close" size={13} color={C.slate} strokeWidth={2.2} />
        </TouchableOpacity>
      </View>

      {/* 步骤列表 */}
      {allDone ? (
        <Text style={{ fontSize: fs(12), color: C.slate, lineHeight: fs(19), paddingHorizontal: 16, paddingBottom: 14 }}>
          四步全部完成！接下来让 AI 顾问陪你按学期推进，随时在对话里调整规划。
        </Text>
      ) : (
        <View>
          {STEPS.map((s, i) => {
            const done = doneMap[s.key];
            const active = i === activeIdx;
            return (
              <TouchableOpacity
                key={s.key}
                style={[
                  { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 11, borderTopWidth: 1, borderTopColor: C.line + '70' },
                  active && !done && { backgroundColor: C.accentSoft + '66' },
                ]}
                onPress={() => router.push(s.route as never)}
                activeOpacity={0.7}
              >
                <View
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 999,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: done ? C.teal : active ? C.accent : C.group,
                  }}
                >
                  {done ? <Icon name="check" size={13} color="#FFFFFF" strokeWidth={3} /> : <Icon name={s.icon} size={13} color={active ? '#FFFFFF' : C.slate} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: fs(13), fontWeight: '700', color: done ? C.slate : C.ink }}>
                    {s.title}
                    {done ? ' · 已完成' : ''}
                  </Text>
                  <Text style={{ fontSize: fs(11), color: C.slate, marginTop: 2, lineHeight: fs(16) }}>{s.how}</Text>
                </View>
                {!done && <Icon name="chevronRight" size={13} color={active ? C.accent : C.slate2} strokeWidth={2.2} />}
              </TouchableOpacity>
            );
          })}
          {loading ? (
            <Text style={{ fontSize: fs(10), color: C.slate2, paddingHorizontal: 16, paddingVertical: 6 }}>检查完成状态…</Text>
          ) : null}
        </View>
      )}
    </View>
  );
}
