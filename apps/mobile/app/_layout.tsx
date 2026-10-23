import { Stack, useSegments, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { getToken } from '../lib/api';
import { C } from '../components/ui';

export default function RootLayout() {
  const segments = useSegments();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [logged, setLogged] = useState<boolean | null>(null);

  useEffect(() => {
    getToken().then((t) => {
      setLogged(!!t);
      setReady(true);
    });
  }, []);

  useEffect(() => {
    if (!ready) return;
    const inAuthGroup = segments[0] === 'login';
    if (logged === false && !inAuthGroup) router.replace('/login');
    if (logged === true && inAuthGroup) router.replace('/');
  }, [ready, logged, segments, router]);

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
