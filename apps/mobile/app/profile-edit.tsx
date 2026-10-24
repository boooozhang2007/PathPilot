// 个人信息修改（任务9）：从「我的」页账号卡进入
import { useState } from 'react';
import { ScrollView, View, Text, TextInput, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../lib/api';
import { C, Btn, Loading } from '../components/ui';
import type { ProfileDTO } from '@pathpilot/shared';
import { GRADES, GRADE_LABELS, CAREER_PATHS, CAREER_PATH_LABELS } from '@pathpilot/shared';

export default function ProfileEdit() {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileDTO | null>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useState(() => {
    api<ProfileDTO | null>('/api/profile')
      .then((p) => {
        if (p) setProfile(p);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  });

  async function save() {
    if (!profile) return;
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      const updated = await api<ProfileDTO>('/api/profile', {
        method: 'PUT',
        json: {
          nickname: profile.nickname,
          school: profile.school ?? undefined,
          major: profile.major ?? undefined,
          grade: profile.grade,
          graduationDate: profile.graduationDate,
          targetRole: profile.targetRole,
          careerPath: profile.careerPath,
          weeklyHours: profile.weeklyHours,
        },
      });
      setProfile(updated);
      await AsyncStorage.setItem('pp_nickname', updated.nickname);
      setMsg('已保存（Web 与手机端同步）');
    } catch (e) {
      setErr(e instanceof Error ? e.message : '保存失败');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Loading />;
  if (!profile) {
    return (
      <View style={{ flex: 1, backgroundColor: C.paper, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ color: C.slate, fontSize: 13 }}>资料加载失败，请先登录</Text>
        <Btn title="返回" kind="ghost" onPress={() => router.back()} style={{ marginTop: 12, paddingHorizontal: 24 }} />
      </View>
    );
  }

  const set = (patch: Partial<ProfileDTO>) => setProfile({ ...profile, ...patch });

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.paper }} contentContainerStyle={{ padding: 16, paddingTop: 54, paddingBottom: 40 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Text style={{ fontSize: 20, fontWeight: '800', color: C.ink }}>个人信息</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ fontSize: 13, color: C.accent, fontWeight: '700' }}>完成</Text>
        </TouchableOpacity>
      </View>

      {msg ? <View style={{ backgroundColor: C.tealSoft, borderRadius: 10, padding: 10, marginBottom: 12 }}><Text style={{ color: C.teal, fontSize: 12 }}>{msg}</Text></View> : null}
      {err ? <View style={{ backgroundColor: C.accentSoft, borderRadius: 10, padding: 10, marginBottom: 12 }}><Text style={{ color: C.accent, fontSize: 12 }}>{err}</Text></View> : null}

      <View style={{ backgroundColor: C.white, borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 16, gap: 12 }}>
        <View>
          <Text style={s.label}>昵称</Text>
          <TextInput style={s.input} value={profile.nickname} onChangeText={(v) => set({ nickname: v })} maxLength={30} />
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={s.label}>学校</Text>
            <TextInput style={s.input} value={profile.school ?? ''} onChangeText={(v) => set({ school: v })} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.label}>专业</Text>
            <TextInput style={s.input} value={profile.major ?? ''} onChangeText={(v) => set({ major: v })} />
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={s.label}>当前年级</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {GRADES.map((g) => (
                <TouchableOpacity key={g} onPress={() => set({ grade: g })} style={{ borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: profile.grade === g ? C.ink : '#EDE8DB' }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: profile.grade === g ? C.white : C.slate }}>{GRADE_LABELS[g]}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
        <View>
          <Text style={s.label}>预计毕业时间</Text>
          <TextInput style={s.input} value={profile.graduationDate} onChangeText={(v) => set({ graduationDate: v })} placeholder="2028-06-30" placeholderTextColor={C.slate2} />
        </View>
        <View>
          <Text style={s.label}>目标岗位</Text>
          <TextInput style={s.input} value={profile.targetRole} onChangeText={(v) => set({ targetRole: v })} placeholder="Java 后端开发" placeholderTextColor={C.slate2} />
        </View>
        <View>
          <Text style={s.label}>发展路径</Text>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {CAREER_PATHS.map((p) => (
              <TouchableOpacity key={p} onPress={() => set({ careerPath: p })} style={{ flex: 1, borderRadius: 10, paddingVertical: 9, alignItems: 'center', backgroundColor: profile.careerPath === p ? C.ink : '#EDE8DB' }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: profile.careerPath === p ? C.white : C.slate }}>{CAREER_PATH_LABELS[p]}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <Btn title={busy ? '保存中…' : '保存'} onPress={save} disabled={busy} style={{ marginTop: 4 }} />
      </View>
    </ScrollView>
  );
}

const s = {
  label: { fontSize: 12, fontWeight: '600', color: C.slate, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: C.ink,
    backgroundColor: C.white,
  },
} as const;
