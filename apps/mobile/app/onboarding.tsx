// 新手引导页：首次启动展示（也可从「设置」重看）；横向滑动翻页 + 圆点指示器
import { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, useWindowDimensions, type ScrollViewInstance } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Path, Circle } from 'react-native-svg';
import { C, SF, useSettings } from '../components/ui';
import { getToken, isGuest } from '../lib/api';

export const KEY_ONBOARDED = 'pp_onboarded';

/** 与底部导航同款的线性插画（viewBox 0 0 24 24 放大绘制） */
function Illus({ name }: { name: string }) {
  const stroke = {
    stroke: C.accent,
    strokeWidth: 1.4,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };
  const soft = { ...stroke, stroke: C.teal };
  return (
    <Svg width={116} height={116} viewBox="0 0 24 24">
      {name === 'welcome' && (
        <>
          <Path d="M12 2.6 13.9 9.6l7 1.9-7 1.9L12 20.4l-1.9-7-7-1.9 7-1.9Z" {...stroke} />
          <Circle cx="19.4" cy="4.6" r="1.3" fill={C.teal} />
          <Circle cx="4.8" cy="18.6" r="1" fill={C.teal} />
          <Circle cx="4.2" cy="5.2" r="0.8" fill={C.slate2} />
        </>
      )}
      {name === 'profile' && (
        <>
          <Circle cx="12" cy="8.4" r="3.6" {...stroke} />
          <Path d="M4.8 20.4c1.5-4 12.9-4 14.4 0" {...stroke} />
          <Circle cx="18.6" cy="5" r="1.1" fill={C.teal} />
        </>
      )}
      {name === 'ask' && (
        <>
          <Path d="M4 5.6h16v10.8H9.2L5.6 19.6v-3.2H4Z" {...stroke} />
          <Path d="M12 7.6 12.9 10.3 15.6 11.2 12.9 12.1 12 14.8 11.1 12.1 8.4 11.2 11.1 10.3Z" {...soft} />
        </>
      )}
      {name === 'roadmap' && (
        <>
          <Path d="M6.4 21V3.6" {...stroke} />
          <Path d="M6.4 4.8h11l-3.2 3.4 3.2 3.4h-11" {...stroke} />
          <Circle cx="6.4" cy="14.8" r="1.4" fill={C.teal} />
          <Circle cx="6.4" cy="20.6" r="1.4" fill={C.teal} />
          <Circle cx="17.8" cy="19.4" r="0.9" fill={C.slate2} />
        </>
      )}
      {name === 'task' && (
        <>
          <Circle cx="12" cy="12" r="9" {...stroke} />
          <Path d="m7.8 12.2 2.8 2.8 5.6-6" {...soft} />
        </>
      )}
    </Svg>
  );
}

const SLIDES = [
  {
    key: 'welcome',
    title: '欢迎使用 PathPilot',
    desc: 'AI 职业成长规划平台\n接下来用 4 步带你上手',
  },
  {
    key: 'profile',
    title: '第 1 步 · 完善资料',
    desc: '「我的」页点账号卡\n填目标岗位和每周可投入时间',
  },
  {
    key: 'ask',
    title: '第 2 步 · 问 AI 顾问',
    desc: '有任何规划问题直接问\n查数据、改规划一句话搞定',
  },
  {
    key: 'roadmap',
    title: '第 3 步 · 生成路线',
    desc: '「成长路线」页一键生成\n按学期拆成可执行任务',
  },
  {
    key: 'task',
    title: '第 4 步 · 打卡攒证据',
    desc: '「任务」页完成打卡\n提交链接，攒简历里的真经历',
  },
];

export default function Onboarding() {
  const router = useRouter();
  const { fs } = useSettings();
  const [page, setPage] = useState(0);
  const scrollRef = useRef<ScrollViewInstance | null>(null);
  const { width } = useWindowDimensions();
  const last = page === SLIDES.length - 1;

  /** 完成：记录已看过；已登录返回上一页（设置重看场景，无返回栈则回首页），否则去登录 */
  async function finish() {
    await AsyncStorage.setItem(KEY_ONBOARDED, '1');
    const [token, guest] = await Promise.all([getToken(), isGuest()]);
    if (token || guest) {
      if (router.canGoBack()) router.back();
      else router.replace('/');
    } else {
      router.replace('/login');
    }
  }

  function go(i: number) {
    const target = Math.max(0, Math.min(SLIDES.length - 1, i));
    scrollRef.current?.scrollTo({ x: target * width, animated: true });
    setPage(target);
  }

  return (
    <View style={{ flex: 1, ...SF.page }}>
      {/* 顶部跳过 */}
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingTop: 54, paddingRight: 20 }}>
        {!last && (
          <TouchableOpacity onPress={finish} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={{ fontSize: 13, color: C.slate, fontWeight: '600' }}>跳过</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* 滑动页 */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        style={{ flex: 1 }}
        onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
        scrollEventThrottle={16}
      >
        {SLIDES.map((s) => (
          <View key={s.key} style={{ width, flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
            <View
              style={{
                ...SF.card,
                width: 180,
                height: 180,
                borderRadius: 40,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 30,
              }}
            >
              <Illus name={s.key} />
            </View>
            <Text style={{ fontSize: fs(22), fontWeight: '800', color: C.ink, textAlign: 'center', marginBottom: 12 }}>{s.title}</Text>
            <Text style={{ fontSize: fs(13), color: C.slate, lineHeight: 22, textAlign: 'center' }}>{s.desc}</Text>
          </View>
        ))}
      </ScrollView>

      {/* 底部：圆点 + 按钮 */}
      <View style={{ padding: 20, paddingBottom: 34, gap: 18 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 7 }}>
          {SLIDES.map((s, i) => (
            <View
              key={s.key}
              style={{
                width: i === page ? 22 : 7,
                height: 7,
                borderRadius: 999,
                backgroundColor: i === page ? C.accent : C.line,
              }}
            />
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {page > 0 && (
            <TouchableOpacity style={{ ...SF.raised, flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center' }} onPress={() => go(page - 1)}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: C.ink }}>上一步</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={{ ...SF.chip, flex: 2, borderRadius: 12, backgroundColor: C.accent, paddingVertical: 14, alignItems: 'center', borderWidth: 0 }}
            onPress={() => (last ? finish() : go(page + 1))}
            activeOpacity={0.85}
          >
            <Text style={{ fontSize: 14, fontWeight: '700', color: C.onAccent }}>{last ? '开始使用' : '下一步'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
