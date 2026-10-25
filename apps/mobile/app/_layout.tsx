import { Stack, useSegments, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getToken, isGuest } from '../lib/api';
import { C, SettingsProvider, useSettings } from '../components/ui';
import { KEY_ONBOARDED } from './onboarding';

function RootNavigator() {
  const { dark } = useSettings();
  const segments = useSegments();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  // 首次启动跳引导页期间，路由 segments 可能尚未更新——用标记防止登录守卫抢先踢到 /login
  const onboardingPending = useRef(false);

  // 启动：读登录态；首次使用（未看过引导）先进引导页
  useEffect(() => {
    Promise.all([getToken(), isGuest(), AsyncStorage.getItem(KEY_ONBOARDED)]).then(([token, guest, onboarded]) => {
      setReady(true);
      if (!onboarded) {
        onboardingPending.current = true;
        router.replace('/onboarding');
      } else if (!token && !guest) {
        router.replace('/login');
      }
    });
  }, [router]);

  // 路由守卫：每次导航都实时读取 token/访客标记（修复登录成功后被旧状态踢回登录页的问题）
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    Promise.all([getToken(), isGuest()]).then(([token, guest]) => {
      if (cancelled) return;
      const inAuthGroup = segments[0] === 'login';
      const inOnboarding = segments[0] === 'onboarding';
      if (inOnboarding) onboardingPending.current = false;
      if (!token && !guest && !inAuthGroup && !inOnboarding && !onboardingPending.current) router.replace('/login');
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
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.paper }, animation: 'fade' }} />
    </View>
  );
}

export default function RootLayout() {
  return (
    <SettingsProvider>
      <RootNavigator />
    </SettingsProvider>
  );
}
