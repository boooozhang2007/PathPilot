import { Link, Stack } from 'expo-router';
import { Text, View } from 'react-native';
import { C } from '../components/ui';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: '页面不存在' }} />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: C.paper }}>
        <Text style={{ fontSize: 18, fontWeight: '700', color: C.ink }}>页面不存在</Text>
        <Link href="/" style={{ marginTop: 15, paddingVertical: 15 }}>
          <Text style={{ fontSize: 14, color: C.accent, fontWeight: '600' }}>返回首页</Text>
        </Link>
      </View>
    </>
  );
}
