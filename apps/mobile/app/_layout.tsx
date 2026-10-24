import { Stack, useSegments, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { getToken, isGuest } from '../lib/api';
import { C } from '../components/ui';

export default function RootLayout() {
  const segments = useSegments();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    Promise.all([getToken(), isGuest()]).then(() => setReady(true));
  }, []);

  // 路由守卫：每次导航都实时读取 token/访客标记（修复登录成功后被旧状态踢回登录页的问题）
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    Promise.all([getToken(), isGuest()]).then(([token, guest]) => {
      if (cancelled) return;
      const inAuthGroup = segments[0] === 'login';
      if (!token && !guest && !inAuthGroup) router.replace('/login');
      if ((token || guest) && inAuthGroup) router.replace('/');
    });
    return () => {
      cancelled = true;
    };
  }, [ready, segments, router]);

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.paper }}>
        <ActivityIndicator color={C.accent} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.paper }}>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.paper } }} />
    </View>
  );
}
