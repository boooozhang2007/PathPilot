import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { api, setToken, setGuest } from '../lib/api';
import { C, SF, useSettings } from '../components/ui';

export default function Login() {
  const router = useRouter();
  const { fs } = useSettings();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const inputSt = { ...SF.input, paddingHorizontal: 12, paddingVertical: 10, fontSize: fs(14), color: C.ink, marginBottom: 12 };

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
    <KeyboardAvoidingView style={{ flex: 1, ...SF.page }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}>
        <View style={{ alignItems: 'center', marginBottom: 28 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: C.deep, alignItems: 'center', justifyContent: 'center', boxShadow: SF.card.boxShadow }}>
              <Text style={{ color: C.deepText, fontWeight: '900', fontSize: 14 }}>PP</Text>
            </View>
            <Text style={{ fontSize: 22, fontWeight: '900', color: C.ink }}>PathPilot AI</Text>
          </View>
        </View>

        <View style={{ ...SF.card, padding: 20 }}>
          <View style={{ ...SF.inset, flexDirection: 'row', padding: 3, marginBottom: 16 }}>
            {(['login', 'register'] as const).map((m) => (
              <TouchableOpacity
                key={m}
                style={{ flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: 'center', ...(mode === m ? { ...SF.raised, borderWidth: 0 } : {}) }}
                onPress={() => setMode(m)}
              >
                <Text style={{ fontWeight: '600', fontSize: 13, color: mode === m ? C.ink : C.slate }}>{m === 'login' ? '登录' : '注册'}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {mode === 'register' && (
            <TextInput style={inputSt} placeholder="昵称" placeholderTextColor={C.slate2} value={nickname} onChangeText={setNickname} maxLength={30} />
          )}
          <TextInput style={inputSt} placeholder="邮箱" placeholderTextColor={C.slate2} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
          <TextInput style={inputSt} placeholder={mode === 'register' ? '密码（至少 8 位）' : '密码'} placeholderTextColor={C.slate2} value={password} onChangeText={setPassword} secureTextEntry />

          {err ? (
            <View style={{ backgroundColor: C.amberSoft, borderRadius: 8, padding: 10, marginBottom: 12 }}>
              <Text style={{ color: C.amber, fontSize: 12 }}>{err}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={{ ...SF.chip, backgroundColor: busy ? C.slate2 : C.accent, borderRadius: 10, paddingVertical: 13, alignItems: 'center', borderWidth: 0 }}
            onPress={submit}
            disabled={busy}
            activeOpacity={0.85}
          >
            <Text style={{ color: C.onAccent, fontWeight: '700', fontSize: fs(14) }}>{busy ? '请稍候…' : mode === 'login' ? '登录' : '创建账号'}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={{ marginTop: 12, paddingVertical: 10, alignItems: 'center' }} onPress={skip}>
            <Text style={{ color: C.slate, fontSize: 13, fontWeight: '600' }}>跳过登录，先逛逛 ›</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}


