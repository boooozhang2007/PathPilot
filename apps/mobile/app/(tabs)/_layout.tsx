// 底部导航（AI 顾问居中）· 矢量图标组：首页（房子）/ 成长路线（里程碑旗）重设计，其余配套统一线型
import { Tabs } from 'expo-router';
import { Svg, Path, Circle } from 'react-native-svg';
import { C } from '../../components/ui';

function TabIcon({ name, color, focused }: { name: string; color: string; focused: boolean }) {
  const common = {
    stroke: color,
    strokeWidth: focused ? 2.2 : 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24">
      {name === 'index' && (
        <>
          {/* 房顶 */}
          <Path d="M4 11.2 12 4.6l8 6.6" {...common} />
          {/* 房体 */}
          <Path d="M6.6 9.8v9.7h10.8V9.8" {...common} />
          {/* 门 */}
          <Path d="M10.2 19.5v-4.4h3.6v4.4" {...common} />
        </>
      )}
      {name === 'roadmap' && (
        <>
          {/* 旗杆（成长路径主线） */}
          <Path d="M7.2 20.4V4.4" {...common} />
          {/* 里程碑旗 */}
          <Path d="M7.2 5.4h9.4l-2.8 3 2.8 3H7.2" {...common} />
          {/* 途中节点 */}
          <Circle cx="7.2" cy="14.6" r="1.2" fill={color} />
          <Circle cx="7.2" cy="20.2" r="1.2" fill={color} />
        </>
      )}
      {name === 'advisor' && (
        <Path d="M12 3.2 13.7 10l6.8 2-6.8 2L12 20.8 10.3 14l-6.8-2 6.8-2Z" {...common} />
      )}
      {name === 'tasks' && (
        <>
          <Circle cx="12" cy="12" r="8.4" {...common} />
          <Path d="m8.6 12.4 2.4 2.4 4.6-5" {...common} />
        </>
      )}
      {name === 'mine' && (
        <>
          <Circle cx="12" cy="8.2" r="3.4" {...common} />
          <Path d="M5.2 19.6c1.4-3.6 12.2-3.6 13.6 0" {...common} />
        </>
      )}
    </Svg>
  );
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
      <Tabs.Screen name="index" options={{ title: '首页', tabBarIcon: ({ color, focused }) => <TabIcon name="index" color={String(color) || C.ink} focused={focused} /> }} />
      <Tabs.Screen name="roadmap" options={{ title: '成长路线', tabBarIcon: ({ color, focused }) => <TabIcon name="roadmap" color={String(color) || C.ink} focused={focused} /> }} />
      <Tabs.Screen name="advisor" options={{ title: 'AI 顾问', tabBarIcon: ({ color, focused }) => <TabIcon name="advisor" color={String(color) || C.ink} focused={focused} /> }} />
      <Tabs.Screen name="tasks" options={{ title: '任务', tabBarIcon: ({ color, focused }) => <TabIcon name="tasks" color={String(color) || C.ink} focused={focused} /> }} />
      <Tabs.Screen name="mine" options={{ title: '我的', tabBarIcon: ({ color, focused }) => <TabIcon name="mine" color={String(color) || C.ink} focused={focused} /> }} />
    </Tabs>
  );
}
