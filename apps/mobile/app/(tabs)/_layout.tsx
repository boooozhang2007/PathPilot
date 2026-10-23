// 底部导航 5 Tab（PRD 5.2）：首页 / 成长路线 / 任务 / AI 顾问 / 我的
import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { C } from '../../components/ui';

const ICONS: Record<string, string> = {
  index: '◧',
  roadmap: '◇',
  tasks: '✓',
  advisor: '✦',
  mine: '☰',
};

function Icon({ name, color }: { name: string; color: unknown }) {
  const c = typeof color === 'string' ? color : typeof color === 'number' ? String(color) : C.ink;
  return <Text style={{ fontSize: 17, color: c, fontWeight: '600' }}>{ICONS[name] ?? '•'}</Text>;
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.accent,
        tabBarInactiveTintColor: C.slate2,
        tabBarStyle: { backgroundColor: C.white, borderTopColor: C.line, height: 56, paddingBottom: 4 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: '首页', tabBarIcon: ({ color }) => <Icon name="index" color={color} /> }} />
      <Tabs.Screen name="roadmap" options={{ title: '成长路线', tabBarIcon: ({ color }) => <Icon name="roadmap" color={color} /> }} />
      <Tabs.Screen name="tasks" options={{ title: '任务', tabBarIcon: ({ color }) => <Icon name="tasks" color={color} /> }} />
      <Tabs.Screen name="advisor" options={{ title: 'AI 顾问', tabBarIcon: ({ color }) => <Icon name="advisor" color={color} /> }} />
      <Tabs.Screen name="mine" options={{ title: '我的', tabBarIcon: ({ color }) => <Icon name="mine" color={color} /> }} />
    </Tabs>
  );
}
