// 我的（PRD 5.2）：档案概览 + 每周时间调整 + 重规划 + 服务器地址 + 退出（含访客模式）
import { useCallback, useState } from 'react';
import { ScrollView, View, Text, TextInput, Alert, RefreshControl } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { api, clearAuth, getApiBase, setApiBase, getNickname, isGuest, setGuest } from '../../lib/api';
import { C, Card, Tag, Btn, Body, Loading } from '../../components/ui';
import type { ProfileDTO, ProfileSkillDTO, RoadmapVersionSummary } from '@pathpilot/shared';
import { GRADE_LABELS, CAREER_PATH_LABELS, EVIDENCE_STATUS_LABELS } from '@pathpilot/shared';

export default function MineTab() {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileDTO | null>(null);
  const [skills, setSkills] = useState<ProfileSkillDTO[]>([]);
  const [versions, setVersions] = useState<RoadmapVersionSummary[]>([]);
  const [nickname, setNicknameState] = useState('同学');
  const [weekly, setWeekly] = useState(8);
  const [server, setServer] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [connResult, setConnResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [guest, setGuestMode] = useState(false);

  async function testConnection() {
    setConnResult(null);
    try {
      await setApiBase(server);
      const h = await api<{ ok: boolean; time: string }>('/api/health');
      setConnResult({ ok: true, message: `连接成功（服务器时间 ${h.time.slice(11, 19)}）。现在可以登录使用。` });
    } catch (e) {
      setConnResult({
        ok: false,
        message: `连接失败：${e instanceof Error ? e.message : '未知错误'}\n排查：1) 手机与电脑连同一 WiFi；2) 电脑后端已运行；3) 地址填电脑局域网 IP；4) 电脑防火墙已放行 3000 端口。`,
      });
    }
  }

  const load = useCallback(() => {
    isGuest().then(setGuestMode);
    Promise.all([api<ProfileDTO | null>('/api/profile').catch(() => null), api<ProfileSkillDTO[]>('/api/skills').catch(() => []), api<RoadmapVersionSummary[]>('/api/roadmaps').catch(() => []), getNickname(), getApiBase()])
      .then(([p, s, v, n, base]) => {
        setProfile(p);
        setSkills(s);
        setVersions(v);
        setNicknameState(n);
        setWeekly(p?.weeklyHours ?? 8);
        setServer(base);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function exitGuestToLogin() {
    await setGuest(false);
    router.replace('/login');
  }

  async function saveWeekly() {
    if (!profile) return;
    setBusy('保存每周时间并重规划…');
    setMsg('');
    try {
      await api('/api/profile', { method: 'PUT', json: { ...profile, targetRole: profile.targetRole, nickname: profile.nickname, grade: profile.grade, graduationDate: profile.graduationDate, weeklyHours: weekly } });
      const cur = await api<{ roadmap: { id: number } } | null>('/api/roadmaps/current');
      if (cur) {
        const run = await api<{ run_id: number }>(`/api/roadmaps/${cur.roadmap.id}/revise`, { method: 'POST', json: { weeklyHours: weekly } });
        const { pollRun } = await import('../../lib/api');
        await pollRun(run.run_id);
        setMsg('重规划完成：新版本已生成，已完成任务保留');
      } else {
        setMsg('每周时间已保存');
      }
      load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '操作失败（原规划不受影响）');
    } finally {
      setBusy('');
    }
  }

  async function saveServer() {
    await setApiBase(server);
    setMsg('服务器地址已更新');
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
      <View style={{ backgroundColor: C.ink, borderRadius: 16, padding: 18, marginBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={{ width: 52, height: 52, borderRadius: 999, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#fff', fontSize: 20, fontWeight: '800' }}>{(guest ? '访' : nickname || '同')[0]}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#fff', fontSize: 17, fontWeight: '800' }}>{guest ? '访客' : nickname}</Text>
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 3 }}>
            {guest ? '未登录 · 可浏览界面与配置服务器' : profile ? `${GRADE_LABELS[profile.grade]} · ${profile.major || '专业未知'} · ${profile.graduationDate} 毕业` : '资料未完善'}
          </Text>
        </View>
      </View>

      {msg ? (
        <View style={{ backgroundColor: C.tealSoft, borderRadius: 10, padding: 10, marginBottom: 12 }}>
          <Text style={{ color: C.teal, fontSize: 12, lineHeight: 17 }}>{msg}</Text>
        </View>
      ) : null}
      {busy ? (
        <View style={{ backgroundColor: C.amberSoft, borderRadius: 10, padding: 10, marginBottom: 12 }}>
          <Text style={{ color: C.amber, fontSize: 12 }}>{busy}</Text>
        </View>
      ) : null}

      {guest ? (
        <Card style={{ marginBottom: 12, backgroundColor: C.amberSoft, borderColor: C.amber + '40' }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: C.amber, marginBottom: 6 }}>访客模式</Text>
          <Text style={{ fontSize: 12, color: C.slate, lineHeight: 18, marginBottom: 10 }}>可浏览界面与配置服务器；档案、任务、规划等操作登录后可用。</Text>
          <Btn title="登录 / 注册" onPress={exitGuestToLogin} />
        </Card>
      ) : (
        <>
          <Card style={{ marginBottom: 12 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: C.ink, marginBottom: 8 }}>职业目标</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <Tag tone="ink">{profile?.targetRole || '未设定'}</Tag>
              <Tag tone="slate">{profile ? CAREER_PATH_LABELS[profile.careerPath] : '—'}</Tag>
              <Tag tone="teal">技能 {skills.length} 项 · 有证据 {evidenced} 项</Tag>
            </View>
            {skills.slice(0, 6).map((s) => (
              <View key={s.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.line + '70' }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: C.ink }}>{s.name} · Lv{s.level}</Text>
                <Text style={{ fontSize: 11, color: C.slate }}>{EVIDENCE_STATUS_LABELS[s.evidenceStatus]}</Text>
              </View>
            ))}
          </Card>

          <Card style={{ marginBottom: 12 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: C.ink, marginBottom: 4 }}>每周可投入时间</Text>
            <Text style={{ fontSize: 12, color: C.slate, marginBottom: 10 }}>调整后可一键重规划（生成新版本，已完成任务与成果保留）</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <Btn title="−" kind="ghost" onPress={() => setWeekly(Math.max(1, weekly - 1))} style={{ width: 42, paddingVertical: 8 }} />
              <Text style={{ fontSize: 22, fontWeight: '800', color: C.accent, minWidth: 70, textAlign: 'center' }}>{weekly} 小时</Text>
              <Btn title="+" kind="ghost" onPress={() => setWeekly(Math.min(80, weekly + 1))} style={{ width: 42, paddingVertical: 8 }} />
            </View>
            <Btn title={profile ? '保存并重规划' : '保存'} onPress={saveWeekly} disabled={!!busy} />
          </Card>

          <Card style={{ marginBottom: 12 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: C.ink, marginBottom: 8 }}>规划历史（{versions.length} 个版本）</Text>
            {versions.slice(0, 5).map((v) => (
              <View key={v.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
                <Text style={{ fontSize: 12, color: C.ink, fontWeight: v.status === 'active' ? '700' : '400' }}>
                  v{v.version} · {v.weeklyHours}h/周 {v.status === 'active' ? '· 当前' : ''}
                </Text>
                <Text style={{ fontSize: 11, color: C.slate2 }}>{v.createdAt.slice(0, 10)}</Text>
              </View>
            ))}
            {versions.length === 0 ? <Body muted>暂无规划</Body> : null}
          </Card>
        </>
      )}

      <Card style={{ marginBottom: 12 }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: C.ink, marginBottom: 4 }}>服务器地址</Text>
        <Text style={{ fontSize: 12, color: C.slate, marginBottom: 8 }}>真机连电脑：填电脑局域网 IP（如 http://192.168.1.100:3000）；模拟器用 http://10.0.2.2:3000</Text>
        <TextInput
          style={{ borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: C.ink, marginBottom: 10 }}
          value={server}
          onChangeText={setServer}
          autoCapitalize="none"
          placeholder="http://10.0.2.2:3000"
          placeholderTextColor={C.slate2}
        />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Btn title="测试连接" kind="ghost" onPress={testConnection} style={{ flex: 1 }} />
          <Btn title="保存地址" onPress={saveServer} style={{ flex: 1 }} />
        </View>
        {connResult ? (
          <View style={{ backgroundColor: connResult.ok ? C.tealSoft : C.accentSoft, borderRadius: 10, padding: 10, marginTop: 10 }}>
            <Text style={{ color: connResult.ok ? C.teal : C.accent, fontSize: 12, lineHeight: 17 }}>{connResult.message}</Text>
          </View>
        ) : null}
      </Card>

      <View style={{ gap: 10 }}>
        {guest ? (
          <Btn title="登录账号" onPress={exitGuestToLogin} />
        ) : (
          <>
            <Btn title="退出登录" kind="ghost" onPress={logout} />
            <Btn title="删除账号与全部数据" kind="ghost" onPress={deleteAccount} />
          </>
        )}
        <Text style={{ fontSize: 11, color: C.slate2, textAlign: 'center', marginTop: 8 }}>PathPilot Android v1.0 · 与 Web 端实时同步</Text>
      </View>
    </ScrollView>
  );
}
