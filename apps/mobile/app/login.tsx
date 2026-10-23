import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { api, setToken, getApiBase, setApiBase } from '../lib/api';
import { C } from '../components/ui';

export default function Login() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [server, setServer] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setErr('');
    setBusy(true);
    try {
      if (server.trim()) await setApiBase(server.trim());
      const res = await api<{ token: string; user: { nickname: string } }>(mode === 'login' ? '/api/auth/login' : '/api/auth/register', {
        method: 'POST',
        json: mode === 'login' ? { email, password } : { email, password, nickname },
      });
      await setToken(res.token, res.user.nickname);
      router.replace('/');
    } catch (e) {
      setErr(e instanceof Error ? e.message : '操作失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.paper }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}>
        <View style={{ alignItems: 'center', marginBottom: 28 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: C.white, fontWeight: '900', fontSize: 14 }}>PP</Text>
            </View>
            <Text style={{ fontSize: 22, fontWeight: '900', color: C.ink }}>PathPilot AI</Text>
          </View>
          <Text style={{ color: C.slate, fontSize: 12, marginTop: 8 }}>岗位证据 · 能力档案 · 可执行的成长计划</Text>
        </View>

        <View style={{ backgroundColor: C.white, borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 20 }}>
          <View style={{ flexDirection: 'row', backgroundColor: '#EDE8DB', borderRadius: 10, padding: 3, marginBottom: 16 }}>
            {(['login', 'register'] as const).map((m) => (
              <TouchableOpacity
                key={m}
                style={{ flex: 1, paddingVertical: 9, borderRadius: 8, backgroundColor: mode === m ? C.white : 'transparent', alignItems: 'center' }}
                onPress={() => setMode(m)}
              >
                <Text style={{ fontWeight: '600', fontSize: 13, color: mode === m ? C.ink : C.slate }}>{m === 'login' ? '登录' : '注册'}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {mode === 'register' && (
            <TextInput
              style={s.input}
              placeholder="昵称"
              placeholderTextColor={C.slate2}
              value={nickname}
              onChangeText={setNickname}
              maxLength={30}
            />
          )}
          <TextInput style={s.input} placeholder="邮箱" placeholderTextColor={C.slate2} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
          <TextInput style={s.input} placeholder={mode === 'register' ? '密码（至少 8 位）' : '密码'} placeholderTextColor={C.slate2} value={password} onChangeText={setPassword} secureTextEntry />

          {err ? (
            <View style={{ backgroundColor: C.accentSoft, borderRadius: 8, padding: 10, marginBottom: 12 }}>
              <Text style={{ color: C.accent, fontSize: 12 }}>{err}</Text>
            </View>
          ) : null}

          <TouchableOpacity style={{ backgroundColor: busy ? C.slate2 : C.accent, borderRadius: 10, paddingVertical: 13, alignItems: 'center' }} onPress={submit} disabled={busy}>
            <Text style={{ color: C.white, fontWeight: '700', fontSize: 14 }}>{busy ? '请稍候…' : mode === 'login' ? '登录' : '创建账号'}</Text>
          </TouchableOpacity>

          <Text style={{ fontSize: 11, color: C.slate2, textAlign: 'center', marginTop: 14, lineHeight: 16 }}>
            演示账号：demo@pathpilot.ai / demo123456{'\n'}真机使用请将服务器地址改为电脑局域网 IP（可在登录页或「我的」中设置）
          </Text>
        </View>

        <View style={{ marginTop: 16, backgroundColor: C.white, borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 16 }}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: C.slate, marginBottom: 6 }}>服务器地址（默认 {server ? '' : 'http://10.0.2.2:3000（模拟器）'}）</Text>
          <TextInput
            style={s.input}
            placeholder={server || 'http://192.168.x.x:3000'}
            placeholderTextColor={C.slate2}
            value={server}
            onChangeText={setServer}
            autoCapitalize="none"
            onSubmitEditing={() => getApiBase()}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = {
  input: {
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: C.ink,
    backgroundColor: C.white,
    marginBottom: 12,
  },
} as const;
