// 个人信息修改：头像上传 / 年级两排（含博士、博士后）/ 年月选择器 / MBTI / 目标与路径
import { useEffect, useRef, useState } from 'react';
import { ScrollView, View, Text, TextInput, TouchableOpacity, Modal, Pressable, Image, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { api } from '../lib/api';
import { C, SF, Btn, Loading, useSettings } from '../components/ui';
import { Icon } from '../components/icons';
import type { ProfileDTO } from '@pathpilot/shared';
import { GRADES, GRADE_LABELS, CAREER_PATHS, CAREER_PATH_LABELS, MBTI_DIMENSIONS } from '@pathpilot/shared';

/** 年月选择器：两列滚动（年份 × 月份），自实现无原生依赖 */
function MonthPicker({
  visible,
  value,
  onClose,
  onPick,
}: {
  visible: boolean;
  value: string; // YYYY-MM
  onClose: () => void;
  onPick: (ym: string) => void;
}) {
  const { fs } = useSettings();
  const now = new Date();
  const years = Array.from({ length: 10 }, (_, i) => now.getFullYear() + i);
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const [year, setYear] = useState(Number(value.slice(0, 4)) || now.getFullYear() + 2);
  const [month, setMonth] = useState(Number(value.slice(5, 7)) || 6);
  const ROW = 44;

  useEffect(() => {
    if (visible) {
      setYear(Number(value.slice(0, 4)) || now.getFullYear() + 2);
      setMonth(Number(value.slice(5, 7)) || 6);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const col = (items: number[], picked: number, set: (n: number) => void, fmt: (n: number) => string, key: string) => (
    <View key={key} style={{ flex: 1 }}>
      <ScrollView showsVerticalScrollIndicator={false} snapToInterval={ROW} decelerationRate="fast" contentContainerStyle={{ paddingVertical: 3 * ROW }}>
        {items.map((n) => (
          <TouchableOpacity
            key={n}
            style={{ height: ROW, alignItems: 'center', justifyContent: 'center' }}
            onPress={() => set(n)}
          >
            <Text style={{ fontSize: fs(picked === n ? 17 : 15), fontWeight: picked === n ? '800' : '400', color: picked === n ? C.ink : C.slate }}>{fmt(n)}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      {/* 高亮选中区 */}
      <View pointerEvents="none" style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: ROW, marginTop: -ROW / 2, borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.line }} />
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: C.mask, justifyContent: 'flex-end' }} onPress={onClose}>
        <Pressable style={{ ...SF.sheet, paddingBottom: 30, paddingTop: 14 }} onPress={() => {}}>
          <View style={{ width: 36, height: 4, borderRadius: 999, backgroundColor: C.line, alignSelf: 'center', marginBottom: 10 }} />
          <Text style={{ fontSize: fs(15), fontWeight: '700', color: C.ink, textAlign: 'center', marginBottom: 8 }}>选择毕业时间（年月）</Text>
          <View style={{ height: ROW * 7, flexDirection: 'row', paddingHorizontal: 12 }}>
            {col(years, year, setYear, (n) => `${n} 年`, 'y')}
            {col(months, month, setMonth, (n) => `${String(n).padStart(2, '0')} 月`, 'm')}
          </View>
          <View style={{ paddingHorizontal: 16, marginTop: 10 }}>
            <Btn title="确定" onPress={() => { onPick(`${year}-${String(month).padStart(2, '0')}`); onClose(); }} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function ProfileEdit() {
  const router = useRouter();
  const { fs } = useSettings();
  const [profile, setProfile] = useState<ProfileDTO | null>(null);
  // 同步最新档案的 ref：连续快速修改多个选项时，savePatch 不会用到过期闭包
  const profileRef = useRef<ProfileDTO | null>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  // MBTI 逐维选择状态（独立于 profile.mbti：选到一半也能保持高亮，凑齐 4 位才入库）
  const [mbtiSel, setMbtiSel] = useState<[string | null, string | null, string | null, string | null]>([null, null, null, null]);

  useEffect(() => {
    api<ProfileDTO | null>('/api/profile')
      .then((p) => {
        if (p) {
          profileRef.current = p;
          setProfile(p);
          const m = p.mbti ?? '';
          setMbtiSel(m.length === 4 ? [m[0], m[1], m[2], m[3]] : [null, null, null, null]);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  function applyProfile(p: ProfileDTO) {
    profileRef.current = p;
    setProfile(p);
  }

  function flashSaved() {
    setMsg('已自动保存（Web 与手机端同步）');
    setTimeout(() => setMsg(''), 1800);
  }

  /** 即改即存：合并补丁后立刻 PUT（用于头像/年级/年月/路径/MBTI 等选项类设置） */
  async function savePatch(patch: Partial<ProfileDTO>, opts?: { silent?: boolean }) {
    const base = profileRef.current;
    if (!base) return;
    const next = { ...base, ...patch };
    applyProfile(next); // 乐观更新，失败回滚
    setBusy(true);
    setErr('');
    try {
      const updated = await api<ProfileDTO>('/api/profile', {
        method: 'PUT',
        json: {
          nickname: next.nickname,
          school: next.school ?? undefined,
          major: next.major ?? undefined,
          grade: next.grade,
          graduationDate: next.graduationDate,
          targetRole: next.targetRole,
          careerPath: next.careerPath,
          weeklyHours: next.weeklyHours,
          mbti: next.mbti ?? null,
          avatar: next.avatar ?? null,
        },
      });
      applyProfile(updated);
      await AsyncStorage.setItem('pp_nickname', updated.nickname);
      if (!opts?.silent) flashSaved();
    } catch (e) {
      applyProfile(base); // 回滚
      setErr(e instanceof Error ? e.message : '保存失败');
    } finally {
      setBusy(false);
    }
  }

  /** 头像：相册选图 → 裁剪为方形 → 压缩 base64 → 立即保存 */
  async function pickAvatar() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('需要相册权限', '请在系统设置中允许 PathPilot 访问相册后重试');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
      base64: true,
    });
    if (res.canceled || !res.assets?.[0]?.base64) return;
    const asset = res.assets[0];
    await savePatch({ avatar: `data:image/jpeg;base64,${asset.base64}` });
  }

  /** MBTI 点击某一维度：本地保持高亮，凑齐 4 位才写入档案并保存 */
  function tapMbti(dimIdx: number, opt: string) {
    const next = [...mbtiSel] as typeof mbtiSel;
    next[dimIdx] = next[dimIdx] === opt ? null : opt;
    setMbtiSel(next);
    const full = next.every((c) => c) ? next.join('') : null;
    savePatch({ mbti: full }, { silent: !full });
  }

  if (loading) return <Loading />;
  if (!profile) {
    return (
      <View style={{ flex: 1, ...SF.page, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ color: C.slate, fontSize: 13 }}>资料加载失败，请先登录</Text>
        <Btn title="返回" kind="ghost" onPress={() => router.back()} style={{ marginTop: 12, paddingHorizontal: 24 }} />
      </View>
    );
  }

  const gradYM = (profile.graduationDate || '').slice(0, 7);
  const inputSt = { ...SF.input, paddingHorizontal: 12, paddingVertical: 10, fontSize: fs(13), color: C.ink };

  return (
    <ScrollView style={{ flex: 1, ...SF.page }} contentContainerStyle={{ padding: 16, paddingTop: 54, paddingBottom: 40 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Text style={{ fontSize: 20, fontWeight: '800', color: C.ink }}>个人信息</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ fontSize: 13, color: C.accent, fontWeight: '700' }}>完成</Text>
        </TouchableOpacity>
      </View>

      {msg ? <View style={{ backgroundColor: C.tealSoft, borderRadius: 10, padding: 10, marginBottom: 12 }}><Text style={{ color: C.teal, fontSize: 12 }}>{msg}</Text></View> : null}
      {err ? <View style={{ backgroundColor: C.amberSoft, borderRadius: 10, padding: 10, marginBottom: 12 }}><Text style={{ color: C.amber, fontSize: 12 }}>{err}</Text></View> : null}

      {/* 头像 */}
      <View style={{ ...SF.card, padding: 16, marginBottom: 12, alignItems: 'center' }}>
        <TouchableOpacity onPress={pickAvatar}>
          {profile.avatar ? (
            <Image source={{ uri: profile.avatar }} style={{ width: 84, height: 84, borderRadius: 999 }} />
          ) : (
            <View style={{ width: 84, height: 84, borderRadius: 999, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: C.onAccent, fontSize: 30, fontWeight: '800' }}>{(profile.nickname || '同')[0]}</Text>
            </View>
          )}
          <View style={{ position: 'absolute', right: -2, bottom: -2, width: 28, height: 28, borderRadius: 999, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: C.paper }}>
            <Icon name="pen" size={13} color="#FFFFFF" />
          </View>
        </TouchableOpacity>
        <Text style={{ fontSize: fs(11), color: C.slate2, marginTop: 8 }}>点击更换头像（立即保存）</Text>
        {profile.avatar ? (
          <TouchableOpacity onPress={() => savePatch({ avatar: null })} style={{ marginTop: 4 }}>
            <Text style={{ fontSize: fs(11), color: '#E5484D' }}>移除头像</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={{ ...SF.card, padding: 16, gap: 12 }}>
        <View>
          <Text style={s.label}>昵称</Text>
          <TextInput style={inputSt} value={profile.nickname} onChangeText={(v) => applyProfile({ ...profile, nickname: v })} maxLength={30} />
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={s.label}>学校</Text>
            <TextInput style={inputSt} value={profile.school ?? ''} onChangeText={(v) => applyProfile({ ...profile, school: v })} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.label}>专业</Text>
            <TextInput style={inputSt} value={profile.major ?? ''} onChangeText={(v) => applyProfile({ ...profile, major: v })} />
          </View>
        </View>

        {/* 当前年级：平均两排（每排 4 个） */}
        <View>
          <Text style={s.label}>当前年级</Text>
          <View style={{ gap: 6 }}>
            {[0, 1].map((row) => (
              <View key={row} style={{ flexDirection: 'row', gap: 6 }}>
                {GRADES.slice(row * 4, row * 4 + 4).map((g) => (
                  <TouchableOpacity
                    key={g}
                    onPress={() => savePatch({ grade: g })}
                    style={{ ...SF.chip, flex: 1, borderRadius: 999, paddingVertical: 7, alignItems: 'center', backgroundColor: profile.grade === g ? C.accent : C.group, borderWidth: 0 }}
                  >
                    <Text style={{ fontSize: fs(12), fontWeight: '600', color: profile.grade === g ? C.onAccent : C.slate }}>{GRADE_LABELS[g]}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ))}
          </View>
        </View>

        {/* 预计毕业时间：年月选择器 */}
        <View>
          <Text style={s.label}>预计毕业时间（年月）</Text>
          <TouchableOpacity style={[inputSt, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]} onPress={() => setMonthPickerOpen(true)}>
            <Text style={{ fontSize: 13, color: gradYM ? C.ink : C.slate2 }}>{gradYM || '点击选择（如 2028-06）'}</Text>
            <Icon name="calendar" size={16} color={C.slate2} />
          </TouchableOpacity>
        </View>

        {/* MBTI：四维度二选一（独立高亮，凑齐 4 位自动保存） */}
        <View>
          <Text style={s.label}>MBTI 人格（选填，供 AI 针对性建议）</Text>
          <View style={{ gap: 6 }}>
            {MBTI_DIMENSIONS.map((dim, di) => (
              <View key={dim.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ width: 52, fontSize: fs(11), color: C.slate2 }}>{dim.dim}</Text>
                {dim.options.map((opt, oi) => {
                  const active = mbtiSel[di] === opt;
                  return (
                    <TouchableOpacity
                      key={opt}
                      onPress={() => tapMbti(di, opt)}
                      style={{ ...SF.chip, flex: 1, borderRadius: 10, paddingVertical: 8, alignItems: 'center', backgroundColor: active ? C.accent : C.group, borderWidth: 1.5, borderColor: active ? C.accent : C.line }}
                    >
                      <Text style={{ fontSize: fs(12), fontWeight: '600', color: active ? C.onAccent : C.slate }}>{dim.labels[oi]}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
            <Text style={{ fontSize: fs(12), color: profile.mbti ? C.accent : C.slate2, fontWeight: '700' }}>
              {profile.mbti ? `当前：${profile.mbti}` : '选齐四个维度后自动保存'}
            </Text>
            {(profile.mbti || mbtiSel.some(Boolean)) && (
              <TouchableOpacity
                onPress={() => {
                  setMbtiSel([null, null, null, null]);
                  savePatch({ mbti: null });
                }}
              >
                <Text style={{ fontSize: fs(11), color: C.slate2 }}>清除</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View>
          <Text style={s.label}>目标岗位</Text>
          <TextInput style={inputSt} value={profile.targetRole} onChangeText={(v) => applyProfile({ ...profile, targetRole: v })} placeholder="Java 后端开发" placeholderTextColor={C.slate2} />
        </View>
        <View>
          <Text style={s.label}>发展路径</Text>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {CAREER_PATHS.map((p) => (
              <TouchableOpacity key={p} onPress={() => savePatch({ careerPath: p })} style={{ ...SF.chip, flex: 1, borderRadius: 10, paddingVertical: 9, alignItems: 'center', backgroundColor: profile.careerPath === p ? C.accent : C.group, borderWidth: 0 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: profile.careerPath === p ? C.onAccent : C.slate }}>{CAREER_PATH_LABELS[p]}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <Btn title={busy ? '保存中…' : '保存（昵称/学校/岗位等文字信息）'} onPress={() => savePatch({})} disabled={busy} style={{ marginTop: 4 }} />
      </View>

      <MonthPicker
        visible={monthPickerOpen}
        value={gradYM}
        onClose={() => setMonthPickerOpen(false)}
        onPick={(ym) => savePatch({ graduationDate: `${ym}-01` })}
      />
    </ScrollView>
  );
}

const s = {
  label: { fontSize: 12, fontWeight: '600', color: C.slate, marginBottom: 6 },
} as const;
