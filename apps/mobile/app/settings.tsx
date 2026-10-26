// 设置页（DeepSeek 式）：账号管理 / 语言 / 外观 / 字体大小 / 个性化 / 关于 / 退出登录
import { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Switch, Modal, Alert, ToastAndroid, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { api, clearAuth, getApiBase, setApiBase, DEFAULT_BASE, isGuest, getNickname } from '../lib/api';
import { C, SF, useSettings, SettingRow, SettingGroup, GroupTitle } from '../components/ui';
import { Icon } from '../components/icons';
import { makeT } from '../lib/i18n';
import type { AppearanceMode, LanguageMode, FontSizeMode, AnswerStyle, ThemeStyle } from '../lib/prefs';

/** 主题风格卡片：三选一，缩略图直接画出该风格的卡片/输入槽质感 */
function StylePicker() {
  const { settings, update, fs, lang } = useSettings();
  const t = makeT(lang);
  const options: { value: ThemeStyle; label: string; desc: string }[] = [
    { value: 'minimal', label: t('styleMinimal'), desc: t('styleMinimalDesc') },
    { value: 'skeuo', label: t('styleSkeuo'), desc: t('styleSkeuoDesc') },
    { value: 'neumorph', label: t('styleNeumorph'), desc: t('styleNeumorphDesc') },
  ];
  return (
    <View style={{ ...SF.card, padding: 14, marginBottom: 14 }}>
      <Text style={{ fontSize: fs(14), fontWeight: '600', color: C.ink }}>{t('themeStyle')}</Text>
      <Text style={{ fontSize: fs(11), color: C.slate2, marginTop: 2 }}>{t('themePreview')}</Text>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
        {options.map((o) => {
          const active = settings.themeStyle === o.value;
          return (
            <TouchableOpacity
              key={o.value}
              style={{ flex: 1, borderRadius: 12, paddingVertical: 10, alignItems: 'center', gap: 8, backgroundColor: active ? C.accentSoft : C.group, borderWidth: 1.5, borderColor: active ? C.accent : C.line }}
              onPress={() => update({ themeStyle: o.value })}
              activeOpacity={0.75}
            >
              <StyleThumb kind={o.value} />
              <Text style={{ fontSize: fs(12), fontWeight: '700', color: active ? C.accent : C.ink }}>{o.label}</Text>
              <Text style={{ fontSize: fs(10), color: C.slate2, marginTop: -4 }}>{o.desc}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

/** 缩略图：用少量元素示意三种风格的材质差异 */
function StyleThumb({ kind }: { kind: ThemeStyle }) {
  if (kind === 'skeuo') {
    return (
      <View style={{ width: 56, height: 38, justifyContent: 'flex-end' }}>
        <View style={{ position: 'absolute', top: 4, left: 8, right: 8, bottom: 0, backgroundColor: '#fbf5e4', borderRadius: 6, borderWidth: 1, borderColor: '#c9b78e', boxShadow: [{ offsetX: 0, offsetY: 3, blurRadius: 6, color: 'rgba(56,32,10,0.35)' }] }} />
        <View style={{ position: 'absolute', top: 0, left: 16, width: 24, height: 8, backgroundColor: 'rgba(246,232,190,0.85)', borderRadius: 1, transform: [{ rotate: '-4deg' }] }} />
        <View style={{ position: 'absolute', bottom: 6, left: 14, right: 14, height: 8, backgroundColor: '#ece2c8', borderRadius: 4, borderWidth: 1, borderColor: '#a5905f' }} />
      </View>
    );
  }
  if (kind === 'neumorph') {
    return (
      <View style={{ width: 56, height: 38, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: 44, height: 30, backgroundColor: '#e0e5ec', borderRadius: 10, boxShadow: [{ offsetX: -3, offsetY: -3, blurRadius: 6, color: '#ffffff' }, { offsetX: 3, offsetY: 3, blurRadius: 6, color: '#b8bcc2' }] }} />
        <View style={{ position: 'absolute', width: 22, height: 8, backgroundColor: '#e0e5ec', borderRadius: 5, boxShadow: [{ inset: true, offsetX: 2, offsetY: 2, blurRadius: 4, color: '#b8bcc2' }, { inset: true, offsetX: -2, offsetY: -2, blurRadius: 4, color: '#ffffff' }] }} />
      </View>
    );
  }
  return (
    <View style={{ width: 56, height: 38, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 44, height: 30, backgroundColor: '#ffffff', borderRadius: 8, borderWidth: 1, borderColor: '#E8EAEF' }} />
      <View style={{ position: 'absolute', width: 22, height: 8, backgroundColor: '#F2F4F7', borderRadius: 4 }} />
    </View>
  );
}

/** 底部选项面板（DeepSeek 式 radio 列表） */
function OptionSheet<T extends string>({
  visible,
  title,
  options,
  value,
  onClose,
  onPick,
}: {
  visible: boolean;
  title: string;
  options: { value: T; label: string }[];
  value: T;
  onClose: () => void;
  onPick: (v: T) => void;
}) {
  const { fs } = useSettings();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={{ flex: 1, backgroundColor: C.mask, justifyContent: 'flex-end' }} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={{ ...SF.sheet, paddingBottom: 30, paddingTop: 14, paddingHorizontal: 16 }}>
          <View style={{ width: 36, height: 4, borderRadius: 999, backgroundColor: C.line, alignSelf: 'center', marginBottom: 12 }} />
          <Text style={{ fontSize: fs(15), fontWeight: '700', color: C.ink, textAlign: 'center', marginBottom: 8 }}>{title}</Text>
          {options.map((o) => (
            <TouchableOpacity
              key={o.value}
              style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: C.line + '60' }}
              onPress={() => {
                onPick(o.value);
                onClose();
              }}
            >
              <Text style={{ flex: 1, fontSize: fs(15), color: C.ink }}>{o.label}</Text>
              <View style={{ width: 20, height: 20, borderRadius: 999, borderWidth: 1.5, borderColor: value === o.value ? C.accent : C.line, alignItems: 'center', justifyContent: 'center' }}>
                {value === o.value ? <View style={{ width: 11, height: 11, borderRadius: 999, backgroundColor: C.accent }} /> : null}
              </View>
            </TouchableOpacity>
          ))}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

export default function Settings() {
  const router = useRouter();
  const { settings, update, fs, lang } = useSettings();
  const t = makeT(lang);

  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [guest, setGuest] = useState(false);
  const [sheet, setSheet] = useState<'none' | 'language' | 'appearance' | 'fontSize' | 'answerStyle'>('none');
  const [serverEdit, setServerEdit] = useState(false);
  const [base, setBase] = useState('');
  const [serverMsg, setServerMsg] = useState('');
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    getApiBase().then(setBase);
    isGuest().then(setGuest);
    getNickname().then(setNickname);
    api<{ user?: { email?: string }; email?: string }>('/api/auth/me')
      .then((r) => setEmail(String(r.user?.email ?? r.email ?? '')))
      .catch(() => {});
  }, []);

  function toast(msg: string) {
    if (Platform.OS === 'android') ToastAndroid.show(msg, ToastAndroid.SHORT);
    else Alert.alert('', msg);
  }

  async function testConn() {
    setTesting(true);
    setServerMsg('');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(`${base.trim().replace(/\/$/, '')}/api/health`, { signal: controller.signal });
      if (!res.ok) throw new Error();
      setServerMsg(t('connected'));
    } catch {
      setServerMsg(t('connectFailed'));
    } finally {
      clearTimeout(timer);
      setTesting(false);
    }
  }

  async function logout() {
    Alert.alert(t('logout'), t('logoutConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('confirm'),
        style: 'destructive',
        onPress: async () => {
          await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
          await clearAuth();
          router.replace('/login');
        },
      },
    ]);
  }

  function deleteAccount() {
    Alert.alert(t('deleteAccount'), t('deleteAllChatsConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('confirm'),
        style: 'destructive',
        onPress: async () => {
          await api('/api/account', { method: 'DELETE' }).catch(() => {});
          await clearAuth();
          router.replace('/login');
        },
      },
    ]);
  }

  function deleteAllChats() {
    Alert.alert(t('deleteAllChats'), t('deleteAllChatsConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('confirm'),
        style: 'destructive',
        onPress: async () => {
          await api('/api/agent/sessions', { method: 'DELETE' }).catch(() => {});
          toast(t('save'));
        },
      },
    ]);
  }

  const langLabel: Record<LanguageMode, string> = { system: t('system'), zh: '简体中文', en: 'English' };
  const appearLabel: Record<AppearanceMode, string> = { light: t('light'), dark: t('dark'), system: t('system') };
  const fontLabel: Record<FontSizeMode, string> = { small: t('fontSmall'), default: t('fontDefault'), large: t('fontLarge'), xlarge: t('fontXlarge') };
  const styleLabel: Record<AnswerStyle, string> = { concise: t('concise'), detailed: t('detailed') };

  return (
    <View style={{ flex: 1, ...SF.page }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 54, paddingBottom: 40 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <Text style={{ fontSize: fs(20), fontWeight: '800', color: C.ink }}>{t('settings')}</Text>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={{ fontSize: fs(13), color: C.accent, fontWeight: '700' }}>{t('done')}</Text>
          </TouchableOpacity>
        </View>

        {/* 资料区 */}
        <TouchableOpacity
          style={{ ...SF.card, padding: 16, marginBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 14 }}
          onPress={() => !guest && router.push('/profile-edit')}
          disabled={guest}
          activeOpacity={guest ? 1 : 0.6}
        >
          <View style={{ width: 48, height: 48, borderRadius: 999, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: C.onAccent, fontSize: 18, fontWeight: '800' }}>{(guest ? '客' : nickname || '同')[0]}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: fs(16), fontWeight: '800', color: C.ink }}>{guest ? t('guest') : nickname || '同学'}</Text>
            <Text style={{ fontSize: fs(12), color: C.slate2, marginTop: 2 }} numberOfLines={1}>
              {guest ? t('notLoggedIn') : email || '—'}
            </Text>
          </View>
          {!guest && <Text style={{ fontSize: fs(15), color: C.slate2 }}>›</Text>}
        </TouchableOpacity>

        {/* 通用：语言 / 外观 / 字体大小 */}
        <GroupTitle>{t('general')}</GroupTitle>
        <SettingGroup>
          <SettingRow icon={<Icon name="globe" size={16} color={C.ink} />} title={t('language')} value={langLabel[settings.language]} onPress={() => setSheet('language')} />
          <SettingRow icon={<Icon name="moon" size={16} color={C.ink} />} title={t('appearance')} value={appearLabel[settings.appearance]} onPress={() => setSheet('appearance')} />
          <SettingRow icon={<Icon name="font" size={16} color={C.ink} />} title={t('fontSize')} value={fontLabel[settings.fontSize]} onPress={() => setSheet('fontSize')} last />
        </SettingGroup>

        {/* 主题风格：三选一（极简 / 拟物 / 新拟物） */}
        <StylePicker />

        {/* 字体大小预览条 */}
        <View style={{ ...SF.card, padding: 14, marginBottom: 14, alignItems: 'center' }}>
          <Text style={{ fontSize: fs(13), color: C.slate, lineHeight: fs(22) }}>{t('fontPreview')}</Text>
        </View>

        {/* 个性化 */}
        <GroupTitle>{t('personalization')}</GroupTitle>
        <SettingGroup>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: C.line + '80' }}>
            <Icon name="brain" size={16} color={C.ink} />
            <View style={{ flex: 1, flexShrink: 1, paddingRight: 6 }}>
              <Text style={{ fontSize: fs(14), fontWeight: '500', color: C.ink }}>{t('showThinking')}</Text>
              <Text style={{ fontSize: fs(11), color: C.slate2, marginTop: 1 }}>{t('showThinkingDesc')}</Text>
            </View>
            <Switch
              value={settings.showThinking}
              onValueChange={(v) => update({ showThinking: v })}
              trackColor={{ false: C.line, true: C.accent }}
              thumbColor="#FFFFFF"
            />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: C.line + '80' }}>
            <Icon name="wrench" size={16} color={C.ink} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: fs(14), fontWeight: '500', color: C.ink }}>{t('showTools')}</Text>
              <Text style={{ fontSize: fs(11), color: C.slate2, marginTop: 1 }}>{t('showToolsDesc')}</Text>
            </View>
            <Switch value={settings.showTools} onValueChange={(v) => update({ showTools: v })} trackColor={{ false: C.line, true: C.accent }} thumbColor="#FFFFFF" />
          </View>
          <SettingRow icon={<Icon name="pen" size={16} color={C.ink} />} title={t('answerStyle')} value={styleLabel[settings.answerStyle]} onPress={() => setSheet('answerStyle')} last />
        </SettingGroup>

        {/* 账号管理 */}
        <GroupTitle>{t('account')}</GroupTitle>
        <SettingGroup>
          {!guest && <SettingRow icon={<Icon name="user" size={16} color={C.ink} />} title={t('profile')} onPress={() => router.push('/profile-edit')} />}
          {!guest && <SettingRow icon={<Icon name="folder" size={16} color={C.ink} />} title={t('deleteAllChats')} onPress={deleteAllChats} />}
          {!guest && <SettingRow icon={<Icon name="trash" size={16} color="#E5484D" />} title={t('deleteAccount')} onPress={deleteAccount} danger />}
          <SettingRow icon={<Icon name="door" size={16} color={C.ink} />} title={guest ? '登录 / Log in' : t('logout')} onPress={guest ? () => router.replace('/login') : logout} last />
        </SettingGroup>

        {/* 服务器 */}
        <GroupTitle>{t('server')}</GroupTitle>
        <SettingGroup>
          <SettingRow icon={<Icon name="server" size={16} color={C.ink} />} title={t('serverAddress')} value={base} onPress={() => setServerEdit((v) => !v)} />
          {serverEdit && (
            <View style={{ padding: 16, gap: 10 }}>
              <TextInput
                style={{ ...SF.input, paddingHorizontal: 12, paddingVertical: 10, fontSize: fs(13), color: C.ink }}
                value={base}
                onChangeText={setBase}
                autoCapitalize="none"
                keyboardType="url"
                placeholder="http://192.168.x.x:3000"
                placeholderTextColor={C.slate2}
              />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity style={{ flex: 1, borderRadius: 10, backgroundColor: C.accent, paddingVertical: 9, alignItems: 'center' }} onPress={() => setApiBase(base).then(() => setServerMsg(t('save')))}>
                  <Text style={{ color: C.white, fontWeight: '700', fontSize: fs(12) }}>{t('save')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={{ flex: 1, borderRadius: 10, borderWidth: 1, borderColor: C.line, paddingVertical: 9, alignItems: 'center' }} onPress={testConn} disabled={testing || !base.trim()}>
                  <Text style={{ color: C.ink, fontWeight: '700', fontSize: fs(12) }}>{testing ? '…' : t('test')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flex: 1, borderRadius: 10, borderWidth: 1, borderColor: C.line, paddingVertical: 9, alignItems: 'center' }}
                  onPress={() => {
                    setBase(DEFAULT_BASE);
                    setApiBase(DEFAULT_BASE);
                  }}
                >
                  <Text style={{ color: C.slate, fontWeight: '700', fontSize: fs(12) }}>{t('reset')}</Text>
                </TouchableOpacity>
              </View>
              {serverMsg ? <Text style={{ fontSize: fs(11), color: serverMsg === t('connected') || serverMsg === t('save') ? C.teal : '#E5484D' }}>{serverMsg}</Text> : null}
            </View>
          )}
          <SettingRow icon={<Icon name="compass" size={16} color={C.ink} />} title={t('retryOnboarding')} onPress={() => router.push('/onboarding')} last />
        </SettingGroup>

        {/* 关于 */}
        <GroupTitle>{t('about')}</GroupTitle>
        <SettingGroup>
          <SettingRow icon={<Icon name="info" size={16} color={C.ink} />} title={t('aboutPathPilot')} onPress={() => router.push('/about')} />
          <SettingRow icon={<Icon name="download" size={16} color={C.ink} />} title={t('checkUpdate')} value={`v${Constants.expoConfig?.version ?? '1.0.0'}`} onPress={() => toast(t('alreadyLatest'))} last />
        </SettingGroup>

        <Text style={{ fontSize: fs(11), color: C.slate2, textAlign: 'center', marginTop: 6 }}>PathPilot v{Constants.expoConfig?.version ?? '1.0.0'}</Text>
      </ScrollView>

      {/* 选项面板 */}
      <OptionSheet
        visible={sheet === 'language'}
        title={t('language')}
        value={settings.language}
        options={[
          { value: 'system', label: t('system') },
          { value: 'zh', label: '简体中文' },
          { value: 'en', label: 'English' },
        ]}
        onClose={() => setSheet('none')}
        onPick={(v) => update({ language: v as LanguageMode })}
      />
      <OptionSheet
        visible={sheet === 'appearance'}
        title={t('appearance')}
        value={settings.appearance}
        options={[
          { value: 'light', label: t('light') },
          { value: 'dark', label: t('dark') },
          { value: 'system', label: t('system') },
        ]}
        onClose={() => setSheet('none')}
        onPick={(v) => update({ appearance: v as AppearanceMode })}
      />
      <OptionSheet
        visible={sheet === 'fontSize'}
        title={t('fontSize')}
        value={settings.fontSize}
        options={[
          { value: 'small', label: t('fontSmall') },
          { value: 'default', label: t('fontDefault') },
          { value: 'large', label: t('fontLarge') },
          { value: 'xlarge', label: t('fontXlarge') },
        ]}
        onClose={() => setSheet('none')}
        onPick={(v) => update({ fontSize: v as FontSizeMode })}
      />
      <OptionSheet
        visible={sheet === 'answerStyle'}
        title={t('answerStyle')}
        value={settings.answerStyle}
        options={[
          { value: 'concise', label: t('concise') },
          { value: 'detailed', label: t('detailed') },
        ]}
        onClose={() => setSheet('none')}
        onPick={(v) => update({ answerStyle: v as AnswerStyle })}
      />
    </View>
  );
}
