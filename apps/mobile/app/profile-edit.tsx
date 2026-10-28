// 个人信息修改：头像上传 / 年级两排（含博士、博士后）/ 年月选择器 / MBTI / 目标与路径
import { useEffect, useRef, useState } from 'react';
import { ScrollView, View, Text, TextInput, TouchableOpacity, Image, Alert, ActivityIndicator, KeyboardAvoidingView, Keyboard, Platform, type ScrollViewInstance, type TextInputInstance } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { api } from '../lib/api';
import { createProfileSaveQueue } from '../lib/profileSaveQueue';
import { C, SF, Btn, Loading, useSettings } from '../components/ui';
import { Icon } from '../components/icons';
import { MonthPicker } from '../components/MonthPicker';
import type { ProfileDTO } from '@pathpilot/shared';
import { GRADES, GRADE_LABELS, CAREER_PATHS, CAREER_PATH_LABELS, MBTI_DIMENSIONS, MIN_WEEKLY_HOURS, MAX_WEEKLY_HOURS, weeklyHoursSchema } from '@pathpilot/shared';

export default function ProfileEdit() {
  const router = useRouter();
  const { fs } = useSettings();
  const [profile, setProfile] = useState<ProfileDTO | null>(null);
  // 同步最新档案的 ref：连续快速修改多个选项时，savePatch 不会用到过期闭包
  const profileRef = useRef<ProfileDTO | null>(null);
  const activeSavesRef = useRef(0);
  const savesRef = useRef<ReturnType<typeof createProfileSaveQueue> | null>(null);
  const scrollRef = useRef<ScrollViewInstance | null>(null);
  const inputRefs = useRef<Record<string, TextInputInstance | null>>({});
  const focusedInputRef = useRef<TextInputInstance | null>(null);
  const scrollOffsetRef = useRef(0);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [finishing, setFinishing] = useState(false);
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [weeklyHoursDraft, setWeeklyHoursDraft] = useState('');
  const weeklyHoursDraftRef = useRef('');
  const debounceTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const debouncePatchesRef = useRef<Record<string, Partial<ProfileDTO>>>({});
  // MBTI 逐维选择状态（独立于 profile.mbti：选到一半也能保持高亮，凑齐 4 位才入库）
  const [mbtiSel, setMbtiSel] = useState<[string | null, string | null, string | null, string | null]>([null, null, null, null]);

  useEffect(() => {
    const timers = debounceTimersRef.current;
    return () => {
      Object.values(timers).forEach((t) => clearTimeout(t));
    };
  }, []);

  // 软键盘弹出及窗口缩小时，把当前输入框完整滚动到键盘上方。
  function revealFocusedInput() {
    const input = focusedInputRef.current;
    const scroll = scrollRef.current;
    if (!input?.isFocused() || !scroll) return;
    scroll.measureInWindow((_x, top, _width, height) => {
      input.measureInWindow((_ix, inputTop, _iw, inputHeight) => {
        if (focusedInputRef.current !== input || height <= 0) return;
        const bottom = Math.min(top + height, Keyboard.metrics()?.screenY ?? Infinity) - 16;
        const delta = inputTop + inputHeight > bottom
          ? inputTop + inputHeight - bottom
          : Math.min(0, inputTop - top - 16);
        if (delta) scroll.scrollTo({ y: Math.max(0, scrollOffsetRef.current + delta), animated: true });
      });
    });
  }

  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', () => requestAnimationFrame(revealFocusedInput));
    return () => shown.remove();
  }, []);

  function focusProps(key: string) {
    return {
      ref: (input: TextInputInstance | null) => { inputRefs.current[key] = input; },
      onFocus: () => {
        focusedInputRef.current = inputRefs.current[key];
        requestAnimationFrame(revealFocusedInput);
      },
      accessibilityLabel: ({ nickname: '昵称', school: '学校', major: '专业', targetRole: '目标岗位', weeklyHours: '每周可投入时间（小时）' } as Record<string, string>)[key],
      editable: !finishing,
    };
  }

  useEffect(() => {
    api<ProfileDTO | null>('/api/profile')
      .then((p) => {
        if (p) {
          profileRef.current = p;
          savesRef.current = createProfileSaveQueue({
            read: () => profileRef.current,
            apply: applyProfile,
            send: async (patch) => {
              const updated = await api<ProfileDTO>('/api/profile', { method: 'PUT', json: patch });
              await AsyncStorage.setItem('pp_nickname', updated.nickname).catch(() => {});
              return updated;
            },
            onError: (error) => setErr(error instanceof Error ? error.message : '保存失败'),
          });
          setProfile(p);
          setWeeklyHoursDraft(String(p.weeklyHours));
          weeklyHoursDraftRef.current = String(p.weeklyHours);
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
    setMsg('已自动保存');
    setTimeout(() => setMsg(''), 2500);
  }

  /** 每个资料项独立保存；请求只提交当前字段，不带上其它未保存的编辑。 */
  async function savePatch(patch: Partial<ProfileDTO>): Promise<boolean> {
    if (!savesRef.current) return false;
    activeSavesRef.current += 1;
    setBusy(true);
    setErr('');
    try {
      const saved = await savesRef.current.save(patch);
      if (saved && activeSavesRef.current === 1) flashSaved();
      return saved;
    } finally {
      activeSavesRef.current -= 1;
      setBusy(activeSavesRef.current > 0);
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
    const avatar = `data:image/jpeg;base64,${asset.base64}`;
    // 与服务端 schema 上限（760000 字符）对齐，超限先友好提示，避免上传才被拒
    if (avatar.length > 760_000) {
      Alert.alert('图片过大', '头像压缩后仍超过大小限制，请换一张更小的图片');
      return;
    }
    await savePatch({ avatar });
  }

  /** MBTI 点击某一维度：本地保持高亮，凑齐 4 位才写入档案并保存 */
  function tapMbti(dimIdx: number, opt: string) {
    const next = [...mbtiSel] as typeof mbtiSel;
    next[dimIdx] = next[dimIdx] === opt ? null : opt;
    setMbtiSel(next);
    const full = next.every((c) => c) ? next.join('') : null;
    if (full) savePatch({ mbti: full });
  }

  function debounceSave(key: string, patch: Partial<ProfileDTO>, delay = 800) {
    if (debounceTimersRef.current[key]) {
      clearTimeout(debounceTimersRef.current[key]);
    }
    debouncePatchesRef.current[key] = patch;
    debounceTimersRef.current[key] = setTimeout(() => {
      delete debounceTimersRef.current[key];
      delete debouncePatchesRef.current[key];
      savePatch(patch);
    }, delay);
  }

  function commitField(key: string, patch: Partial<ProfileDTO>) {
    if (debounceTimersRef.current[key]) {
      clearTimeout(debounceTimersRef.current[key]);
      delete debounceTimersRef.current[key];
    }
    delete debouncePatchesRef.current[key];
    return savePatch(patch);
  }

  function handleWeeklyHoursChange(val: string) {
    setWeeklyHoursDraft(val);
    weeklyHoursDraftRef.current = val;
    clearTimeout(debounceTimersRef.current.weeklyHours);
    delete debounceTimersRef.current.weeklyHours;
    delete debouncePatchesRef.current.weeklyHours;
    const num = Number(val);
    if (weeklyHoursSchema.safeParse(num).success) {
      debounceSave('weeklyHours', { weeklyHours: num });
    }
  }

  function commitWeeklyHours() {
    const num = Number(weeklyHoursDraftRef.current);
    if (!weeklyHoursSchema.safeParse(num).success) {
      setErr(`每周时长需为 ${MIN_WEEKLY_HOURS}-${MAX_WEEKLY_HOURS} 小时的整数`);
      return false;
    }
    commitField('weeklyHours', { weeklyHours: num });
    return true;
  }

  async function finishEditing() {
    if (finishing || !commitWeeklyHours()) return;
    setFinishing(true);
    Keyboard.dismiss();
    for (const [key, patch] of Object.entries(debouncePatchesRef.current)) commitField(key, patch);
    const saved = await savesRef.current?.flush();
    setFinishing(false);
    if (saved) router.back();
    else setErr('部分资料未保存，请重新修改后重试');
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
    <KeyboardAvoidingView style={{ flex: 1, ...SF.page }} behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined}>
      {/* 顶部浮动保存状态条：滚动时依然可见 */}
      {busy || msg ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 48,
            alignSelf: 'center',
            zIndex: 9999,
            backgroundColor: busy ? '#1E293B' : '#059669',
            paddingHorizontal: 16,
            paddingVertical: 7,
            borderRadius: 999,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 7,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.18,
            shadowRadius: 6,
            elevation: 8,
          }}
        >
          {busy ? (
            <>
              <ActivityIndicator size="small" color="#FFFFFF" />
              <Text style={{ color: '#FFFFFF', fontSize: fs(12), fontWeight: '700' }}>正在保存…</Text>
            </>
          ) : (
            <>
              <Text style={{ color: '#FFFFFF', fontSize: fs(13), fontWeight: '800' }}>✓</Text>
              <Text style={{ color: '#FFFFFF', fontSize: fs(12), fontWeight: '700' }}>已自动保存</Text>
            </>
          )}
        </View>
      ) : null}

      <ScrollView
        ref={scrollRef}
        pointerEvents={finishing ? 'none' : 'auto'}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingTop: 54, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        scrollsChildToFocus
        onScroll={(event) => { scrollOffsetRef.current = event.nativeEvent.contentOffset.y; }}
        scrollEventThrottle={16}
        onLayout={() => requestAnimationFrame(revealFocusedInput)}
      >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: C.ink }}>个人信息</Text>
          {busy ? (
            <Text style={{ fontSize: fs(11), color: C.accent, fontWeight: '600' }}>正在保存…</Text>
          ) : msg ? (
            <Text style={{ fontSize: fs(11), color: C.teal, fontWeight: '600' }}>✓ 已保存</Text>
          ) : null}
        </View>
        <TouchableOpacity
          disabled={finishing}
          onPress={finishEditing}
        >
          <Text style={{ fontSize: 13, color: C.accent, fontWeight: '700' }}>{finishing ? '保存中…' : '完成'}</Text>
        </TouchableOpacity>
      </View>

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
        <Text style={{ fontSize: fs(11), color: C.slate2, marginTop: 8 }}>点击更换头像（自动保存）</Text>
        {profile.avatar ? (
          <TouchableOpacity onPress={() => savePatch({ avatar: null })} style={{ marginTop: 4 }}>
            <Text style={{ fontSize: fs(11), color: '#E5484D' }}>移除头像</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={{ ...SF.card, padding: 16, gap: 12 }}>
        <View>
          <Text style={s.label}>昵称</Text>
          <TextInput
            {...focusProps('nickname')}
            style={inputSt}
            value={profile.nickname}
            onChangeText={(v) => { applyProfile({ ...profile, nickname: v }); debounceSave('nickname', { nickname: v }); }}
            onBlur={() => commitField('nickname', { nickname: profile.nickname })}
            onSubmitEditing={() => commitField('nickname', { nickname: profile.nickname })}
            maxLength={30}
            returnKeyType="done"
          />
        </View>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={s.label}>学校</Text>
            <TextInput
              {...focusProps('school')}
              style={inputSt}
              value={profile.school ?? ''}
              onChangeText={(v) => { applyProfile({ ...profile, school: v }); debounceSave('school', { school: v }); }}
              onBlur={() => commitField('school', { school: profile.school ?? '' })}
              onSubmitEditing={() => commitField('school', { school: profile.school ?? '' })}
              placeholder="填写就读学校"
              placeholderTextColor={C.slate2}
              returnKeyType="done"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.label}>专业</Text>
            <TextInput
              {...focusProps('major')}
              style={inputSt}
              value={profile.major ?? ''}
              onChangeText={(v) => { applyProfile({ ...profile, major: v }); debounceSave('major', { major: v }); }}
              onBlur={() => commitField('major', { major: profile.major ?? '' })}
              onSubmitEditing={() => commitField('major', { major: profile.major ?? '' })}
              placeholder="填写主修专业"
              placeholderTextColor={C.slate2}
              returnKeyType="done"
            />
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
          <TouchableOpacity style={[inputSt, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]} onPress={() => { Keyboard.dismiss(); setMonthPickerOpen(true); }}>
            <Text style={{ fontSize: 13, color: gradYM ? C.ink : C.slate2 }}>{gradYM || '点击选择（如 2028-06）'}</Text>
            <Icon name="calendar" size={16} color={C.slate2} />
          </TouchableOpacity>
        </View>

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
          <TextInput
            {...focusProps('targetRole')}
            style={inputSt}
            value={profile.targetRole}
            onChangeText={(v) => { applyProfile({ ...profile, targetRole: v }); debounceSave('targetRole', { targetRole: v }); }}
            onBlur={() => commitField('targetRole', { targetRole: profile.targetRole })}
            onSubmitEditing={() => commitField('targetRole', { targetRole: profile.targetRole })}
            placeholder="Java 后端开发"
            placeholderTextColor={C.slate2}
            returnKeyType="done"
          />
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

        <View>
          <Text style={s.label}>每周可投入时间（小时）</Text>
          <TextInput
            {...focusProps('weeklyHours')}
            style={inputSt}
            value={weeklyHoursDraft}
            onChangeText={handleWeeklyHoursChange}
            onBlur={commitWeeklyHours}
            onSubmitEditing={commitWeeklyHours}
            keyboardType="number-pad"
            maxLength={3}
            placeholder="例如 8"
            placeholderTextColor={C.slate2}
            returnKeyType="done"
          />
          <Text style={{ fontSize: fs(11), color: C.slate2, marginTop: 6 }}>{MIN_WEEKLY_HOURS}-{MAX_WEEKLY_HOURS} 小时 / 周</Text>
        </View>
      </View>

    </ScrollView>
      <MonthPicker
        visible={monthPickerOpen}
        value={gradYM}
        onClose={() => setMonthPickerOpen(false)}
        onPick={(ym) => savePatch({ graduationDate: `${ym}-01` })}
      />
  </KeyboardAvoidingView>
);
}

const s = {
  label: { fontSize: 12, fontWeight: '600', color: C.slate, marginBottom: 6 },
} as const;
