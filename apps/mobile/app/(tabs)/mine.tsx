// 我的：账号卡（头像）点击进个人信息编辑 / 职业目标 / 技能分组（专业·通用）/ 规划历史可回溯
import { useCallback, useState } from 'react';
import { ScrollView, View, Text, Image, Alert, RefreshControl, TouchableOpacity } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { api, clearAuth, getNickname, isGuest, setGuest } from '../../lib/api';
import { toLocalDateStr } from '../../lib/date';
import { C, SF, Card, Panel, Tag, Btn, Body, Loading, SettingGroup, SettingRow, useSettings } from '../../components/ui';
import { Icon } from '../../components/icons';
import type { ProfileDTO, ProfileSkillDTO, RoadmapVersionSummary, RoadmapTaskDTO } from '@pathpilot/shared';
import { CAREER_PATH_LABELS, EVIDENCE_STATUS_LABELS, TASK_STATUS_LABELS, skillGroupOf, SKILL_GROUP_LABELS } from '@pathpilot/shared';

export default function MineTab() {
  const router = useRouter();
  const { fs } = useSettings();
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
          try {
            await api('/api/account', { method: 'DELETE' });
            await clearAuth();
            router.replace('/login');
          } catch (error) {
            Alert.alert('删除失败', error instanceof Error ? error.message : '账号未删除，请重试');
          }
        },
      },
    ]);
  }

  if (loading) return <Loading />;
  const evidenced = skills.filter((s) => s.evidenceStatus === 'evidenced').length;
  const professional = skills.filter((s) => skillGroupOf(s.category) === 'professional');
  const general = skills.filter((s) => skillGroupOf(s.category) === 'general');

  const renderAvatar = (size = 52) =>
    profile?.avatar ? (
      <Image source={{ uri: profile.avatar }} style={{ width: size, height: size, borderRadius: 999 }} />
    ) : (
      <View style={{ width: size, height: size, borderRadius: 999, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: C.onAccent, fontSize: size * 0.38, fontWeight: '800' }}>{(guest ? '访' : nickname || '同')[0]}</Text>
      </View>
    );

  const renderSkillRow = (s: ProfileSkillDTO) => (
    <View key={s.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: C.line + '70' }}>
      <Text style={{ fontSize: 12, fontWeight: '600', color: C.ink }}>{s.name} · Lv{s.level}</Text>
      <Text style={{ fontSize: 11, color: C.slate }}>{EVIDENCE_STATUS_LABELS[s.evidenceStatus]}</Text>
    </View>
  );

  return (
    <ScrollView style={{ flex: 1, ...SF.page }} contentContainerStyle={{ padding: 16, paddingTop: 54, paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); setTimeout(() => setRefreshing(false), 800); }} tintColor={C.accent} />}>
      {/* 账号卡：点击进入个人信息修改 */}
      <TouchableOpacity onPress={() => !guest && router.push('/profile-edit')}>
        <Panel style={{ padding: 18, marginBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          {renderAvatar()}
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ color: C.deepText, fontSize: 17, fontWeight: '800' }}>{guest ? '访客' : nickname}</Text>
              {profile?.mbti ? <Tag tone="ink">{profile.mbti}</Tag> : null}
            </View>
            <Text style={{ color: C.deepMuted, fontSize: 12, marginTop: 3 }}>{guest ? '未登录' : '点击修改个人信息'}</Text>
          </View>
          {!guest && <Icon name="chevronRight" size={20} color={C.deepMuted} strokeWidth={2} />}
        </Panel>
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
            <View style={{ ...SF.inset, padding: 14 }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: C.ink }}>{profile?.targetRole || '未设定目标岗位'}</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <Tag tone="ink">{profile ? CAREER_PATH_LABELS[profile.careerPath] : '—'}</Tag>
                <Tag tone="teal">技能 {skills.length} 项 · 有证据 {evidenced} 项</Tag>
              </View>
            </View>

            {/* 能力分组：专业能力 / 通用能力 */}
            {professional.length > 0 && (
              <View style={{ marginTop: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <Icon name="layers" size={13} color={C.accent} />
                  <Text style={{ fontSize: fs(12), fontWeight: '700', color: C.accent }}>{SKILL_GROUP_LABELS.professional}（{professional.length}）</Text>
                </View>
                {professional.slice(0, 8).map(renderSkillRow)}
              </View>
            )}
            {general.length > 0 && (
              <View style={{ marginTop: professional.length ? 8 : 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <Icon name="chat" size={13} color={C.teal} />
                  <Text style={{ fontSize: fs(12), fontWeight: '700', color: C.teal }}>{SKILL_GROUP_LABELS.general}（{general.length}）</Text>
                </View>
                {general.slice(0, 8).map(renderSkillRow)}
              </View>
            )}
            {skills.length > 8 && <Text style={{ fontSize: fs(11), color: C.slate2, marginTop: 6 }}>仅展示前 8 项，完整档案在 Web 端「能力档案」</Text>}
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
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text style={{ fontSize: 11, color: C.slate2 }}>{expanded === v.id ? '' : toLocalDateStr(v.createdAt) + ' '}</Text>
                      <Icon name={expanded === v.id ? 'chevronUp' : 'chevronDown'} size={13} color={C.slate2} />
                    </View>
                  </TouchableOpacity>
                  {expanded === v.id && (
                    <View style={{ ...SF.inset, marginTop: 8, padding: 10 }}>
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

      {/* 设置 / 关于（DeepSeek 式分组） */}
      <SettingGroup>
        <SettingRow icon={<Icon name="bell" size={16} color={C.ink} />} title="学习提醒" onPress={() => router.push('/reminders')} />
        <SettingRow icon={<Icon name="settings" size={16} color={C.ink} />} title="设置" onPress={() => router.push('/settings')} />
        <SettingRow icon={<Icon name="info" size={16} color={C.ink} />} title="关于 PathPilot" onPress={() => router.push('/about')} last />
      </SettingGroup>

      <View style={{ gap: 10 }}>
        {guest ? (
          <Btn title="登录账号" onPress={exitGuestToLogin} />
        ) : (
          <>
            <Btn title="退出登录" kind="ghost" onPress={logout} />
            <Btn title="删除账号与全部数据" kind="ghost" onPress={deleteAccount} />
          </>
        )}
        <Text style={{ fontSize: 11, color: C.slate2, textAlign: 'center', marginTop: 8 }}>PathPilot v{Constants.expoConfig?.version ?? '1.0.0'}</Text>
      </View>
    </ScrollView>
  );
}
