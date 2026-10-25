import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { api, setToken, setGuest } from '../lib/api';
import { C } from '../components/ui';

export default function Login() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function skip() {
    await setGuest(true);
    router.replace('/');
  }

  async function submit() {
    setErr('');
    setBusy(true);
    try {
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
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: C.deep, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: C.white, fontWeight: '900', fontSize: 14 }}>PP</Text>
            </View>
            <Text style={{ fontSize: 22, fontWeight: '900', color: C.ink }}>PathPilot AI</Text>
          </View>
        </View>

        <View style={{ backgroundColor: C.white, borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 20 }}>
          <View style={{ flexDirection: 'row', backgroundColor: C.group, borderRadius: 10, padding: 3, marginBottom: 16 }}>
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
            <TextInput style={s.input} placeholder="昵称" placeholderTextColor={C.slate2} value={nickname} onChangeText={setNickname} maxLength={30} />
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

          <TouchableOpacity style={{ marginTop: 12, paddingVertical: 10, alignItems: 'center' }} onPress={skip}>
            <Text style={{ color: C.slate, fontSize: 13, fontWeight: '600' }}>跳过登录，先逛逛 ›</Text>
          </TouchableOpacity>
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
