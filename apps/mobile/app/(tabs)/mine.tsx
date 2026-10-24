// 我的（任务9改版）：账号卡点击进个人信息编辑 / 加大职业目标 / 删每周时间 / 规划历史可回溯 / 服务器地址隐藏
import { useCallback, useState } from 'react';
import { ScrollView, View, Text, Alert, RefreshControl, TouchableOpacity } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { api, clearAuth, getNickname, isGuest, setGuest } from '../../lib/api';
import { C, Card, Tag, Btn, Body, Loading } from '../../components/ui';
import type { ProfileDTO, ProfileSkillDTO, RoadmapVersionSummary, RoadmapTaskDTO } from '@pathpilot/shared';
import { CAREER_PATH_LABELS, EVIDENCE_STATUS_LABELS, TASK_STATUS_LABELS } from '@pathpilot/shared';

export default function MineTab() {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileDTO | null>(null);
  const [skills, setSkills] = useState<ProfileSkillDTO[]>([]);
  const [versions, setVersions] = useState<RoadmapVersionSummary[]>([]);
  const [nickname, setNicknameState] = useState('同学');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [guest, setGuestMode] = useState(false);
  // 规划历史回溯：展开某版本加载其任务
  const [expanded, setExpanded] = useState<number | null>(null);
  const [versionTasks, setVersionTasks] = useState<Record<number, RoadmapTaskDTO[]>>({});

  const load = useCallback(() => {
    isGuest().then(setGuestMode);
    Promise.all([
      api<ProfileDTO | null>('/api/profile').catch(() => null),
      api<ProfileSkillDTO[]>('/api/skills').catch(() => []),
      api<RoadmapVersionSummary[]>('/api/roadmaps').catch(() => []),
      getNickname(),
    ])
      .then(([p, s, v, n]) => {
        setProfile(p);
        setSkills(s);
        setVersions(v);
        setNicknameState(n);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function openVersion(v: RoadmapVersionSummary) {
    if (expanded === v.id) {
      setExpanded(null);
      return;
    }
    setExpanded(v.id);
    if (!versionTasks[v.id]) {
      const d = await api<{ tasks: RoadmapTaskDTO[] }>(`/api/roadmaps/${v.id}`).catch(() => null);
      if (d) setVersionTasks((prev) => ({ ...prev, [v.id]: d.tasks }));
    }
  }

  async function exitGuestToLogin() {
    await setGuest(false);
    router.replace('/login');
  }

  async function logout() {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    await clearAuth();
    router.replace('/login');
  }

  function deleteAccount() {
    Alert.alert('删除账号', '将删除你的全部个人数据（档案、规划、任务记录），不可恢复。确定？', [
      { text: '取消', style: 'cancel' },
      {
        text: '确认删除',
        style: 'destructive',
        onPress: async () => {
          await api('/api/account', { method: 'DELETE' }).catch(() => {});
          await clearAuth();
          router.replace('/login');
        },
      },
    ]);
  }

  if (loading) return <Loading />;
  const evidenced = skills.filter((s) => s.evidenceStatus === 'evidenced').length;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.paper }} contentContainerStyle={{ padding: 16, paddingTop: 54, paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); setTimeout(() => setRefreshing(false), 800); }} tintColor={C.accent} />}>
      {/* 账号卡：点击进入个人信息修改 */}
      <TouchableOpacity onPress={() => !guest && router.push('/profile-edit')}>
        <View style={{ backgroundColor: C.ink, borderRadius: 16, padding: 18, marginBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={{ width: 52, height: 52, borderRadius: 999, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 20, fontWeight: '800' }}>{(guest ? '访' : nickname || '同')[0]}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#fff', fontSize: 17, fontWeight: '800' }}>{guest ? '访客' : nickname}</Text>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 3 }}>{guest ? '未登录' : '点击修改个人信息 ›'}</Text>
          </View>
          {!guest && <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 20 }}>›</Text>}
        </View>
      </TouchableOpacity>

      {guest ? (
        <Card style={{ marginBottom: 12, backgroundColor: C.amberSoft, borderColor: C.amber + '40' }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: C.amber, marginBottom: 6 }}>访客模式</Text>
          <Text style={{ fontSize: 12, color: C.slate, lineHeight: 18, marginBottom: 10 }}>登录后可使用完整功能。</Text>
          <Btn title="登录 / 注册" onPress={exitGuestToLogin} />
        </Card>
      ) : (
        <>
          {/* 职业目标（加大板块） */}
          <Card style={{ marginBottom: 12 }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: C.ink, marginBottom: 10 }}>职业目标</Text>
            <View style={{ backgroundColor: '#F5F2EA', borderRadius: 12, padding: 14 }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: C.ink }}>{profile?.targetRole || '未设定目标岗位'}</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <Tag tone="ink">{profile ? CAREER_PATH_LABELS[profile.careerPath] : '—'}</Tag>
                <Tag tone="teal">技能 {skills.length} 项 · 有证据 {evidenced} 项</Tag>
              </View>
            </View>
            {skills.slice(0, 8).map((s) => (
              <View key={s.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: C.line + '70' }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: C.ink }}>{s.name} · Lv{s.level}</Text>
                <Text style={{ fontSize: 11, color: C.slate }}>{EVIDENCE_STATUS_LABELS[s.evidenceStatus]}</Text>
              </View>
            ))}
          </Card>

          {/* 规划历史（可回溯：展开查看版本任务） */}
          <Card style={{ marginBottom: 12 }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: C.ink, marginBottom: 8 }}>规划历史（{versions.length} 个版本）</Text>
            {versions.length === 0 ? (
              <Body muted>暂无规划</Body>
            ) : (
              versions.map((v) => (
                <View key={v.id} style={{ borderTopWidth: 1, borderTopColor: C.line + '70', paddingTop: 8, marginTop: 8 }}>
                  <TouchableOpacity onPress={() => openVersion(v)} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontSize: 13, color: C.ink, fontWeight: v.status === 'active' ? '800' : '500' }}>
                      v{v.version} · {v.weeklyHours}h/周{v.status === 'active' ? ' · 当前' : ''}
                    </Text>
                    <Text style={{ fontSize: 11, color: C.slate2 }}>{expanded === v.id ? '收起 ▲' : v.createdAt.slice(0, 10) + ' ▼'}</Text>
                  </TouchableOpacity>
                  {expanded === v.id && (
                    <View style={{ marginTop: 8, backgroundColor: '#F5F2EA', borderRadius: 10, padding: 10 }}>
                      {(versionTasks[v.id] ?? []).length === 0 ? (
                        <Text style={{ fontSize: 11, color: C.slate2 }}>加载中…</Text>
                      ) : (
                        versionTasks[v.id].map((t) => (
                          <View key={t.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
                            <Text style={{ fontSize: 12, color: C.ink, flex: 1, paddingRight: 8 }} numberOfLines={1}>
                              {t.title}
                            </Text>
                            <Tag tone={t.status === 'done' ? 'teal' : t.status === 'in_progress' ? 'accent' : 'slate'}>{TASK_STATUS_LABELS[t.status]}</Tag>
                          </View>
                        ))
                      )}
                    </View>
                  )}
                </View>
              ))
            )}
          </Card>
        </>
      )}

      <View style={{ gap: 10 }}>
        {guest ? (
          <Btn title="登录账号" onPress={exitGuestToLogin} />
        ) : (
          <>
            <Btn title="退出登录" kind="ghost" onPress={logout} />
            <Btn title="删除账号与全部数据" kind="ghost" onPress={deleteAccount} />
          </>
        )}
        <Text style={{ fontSize: 11, color: C.slate2, textAlign: 'center', marginTop: 8 }}>PathPilot Android v1.0</Text>
      </View>
    </ScrollView>
  );
}
