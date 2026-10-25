// 移动端 UI 基础组件：DeepSeek 客户端设计语言（主色 #426EFE · 纯白极简 · 深浅色主题 · 字号缩放）
// C 为 Proxy：渲染时读取当前调色板，主题切换后全局生效（页面样式均为 render 时求值的内联样式）
import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useMemo, useState, Fragment } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity, Appearance } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { AppSettings, DEFAULT_SETTINGS, FONT_SCALE, loadSettings, saveSettings, resolveLang } from '../lib/prefs';
import { Icon } from './icons';

// ---------- 调色板（DeepSeek 风格） ----------
export interface Palette {
  paper: string; // 页面底色
  white: string; // 卡片/面板底色
  group: string; // 分组卡 / 用户气泡 / 输入框底
  line: string; // 分隔线 / 描边
  ink: string; // 主文字
  ink2: string; // 次级深文字
  slate: string; // 说明文字
  slate2: string; // 占位/禁用文字
  accent: string; // 主色（DeepSeek 蓝）
  accentSoft: string; // 主色浅底
  deep: string; // 强调卡背景（深浅色模式下都保持深色，卡内白字恒成立）
  teal: string;
  tealSoft: string;
  amber: string;
  amberSoft: string;
  mask: string; // 遮罩
}

export const LIGHT: Palette = {
  paper: '#FFFFFF',
  white: '#FFFFFF',
  group: '#F2F4F7',
  line: '#E8EAEF',
  ink: '#1F2023',
  ink2: '#3D4148',
  slate: '#5E6772',
  slate2: '#9AA1AB',
  accent: '#426EFE',
  accentSoft: '#EBEFFF',
  deep: '#1F2023',
  teal: '#0E7C6B',
  tealSoft: '#E7F5F1',
  amber: '#B97A0B',
  amberSoft: '#F8EED9',
  mask: 'rgba(0,0,0,0.35)',
};

export const DARK: Palette = {
  paper: '#131314',
  white: '#1D1E20',
  group: '#26272A',
  line: '#34363B',
  ink: '#E8E9EA',
  ink2: '#C4C6CA',
  slate: '#A4A9B2',
  slate2: '#70757F',
  accent: '#5C7FFF',
  accentSoft: '#25304F',
  deep: '#2A2C31',
  teal: '#3BBBA8',
  tealSoft: '#1B2F2B',
  amber: '#D9A13B',
  amberSoft: '#3A2F1B',
  mask: 'rgba(0,0,0,0.55)',
};

let currentPalette: Palette = LIGHT;

/** 设计令牌：属性读取时返回当前主题色（渲染期求值，随主题切换全局生效） */
export const C = new Proxy({} as Palette, {
  get: (_, key: string) => currentPalette[key as keyof Palette],
});

// ---------- 设置上下文（外观 / 语言 / 字号 / 个性化） ----------
interface SettingsCtx {
  settings: AppSettings;
  update: (patch: Partial<AppSettings>) => void;
  palette: Palette;
  dark: boolean;
  /** 字号缩放：fs(13) → 按档位缩放 */
  fs: (size: number) => number;
  lang: 'zh' | 'en';
}

const Ctx = createContext<SettingsCtx>({
  settings: DEFAULT_SETTINGS,
  update: () => {},
  palette: LIGHT,
  dark: false,
  fs: (n) => n,
  lang: 'zh',
});

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [systemDark, setSystemDark] = useState(Appearance.getColorScheme() === 'dark');

  useEffect(() => {
    loadSettings().then(setSettings);
    const sub = Appearance.addChangeListener(({ colorScheme }) => setSystemDark(colorScheme === 'dark'));
    return () => sub.remove();
  }, []);

  const dark = settings.appearance === 'dark' || (settings.appearance === 'system' && systemDark);
  const palette = dark ? DARK : LIGHT;
  currentPalette = palette; // Proxy 立即生效；下面 useMemo 触发消费组件重渲染

  const value = useMemo<SettingsCtx>(
    () => ({
      settings,
      update: (patch: Partial<AppSettings>) => {
        setSettings((prev) => {
          const next = { ...prev, ...patch };
          saveSettings(next).catch(() => {});
          return next;
        });
      },
      palette,
      dark,
      fs: (n: number) => Math.round(n * FONT_SCALE[settings.fontSize]),
      lang: resolveLang(settings.language),
    }),
    [settings, palette, dark]
  );

  // key 变化强制整棵子树重建：未消费 context 的页面也能即时换肤（expo-router 路由状态在其内部 store，不受影响）
  return (
    <Ctx.Provider value={value}>
      <Fragment key={`${dark ? 'dark' : 'light'}-${settings.fontSize}`}>{children}</Fragment>
    </Ctx.Provider>
  );
}

export function useSettings(): SettingsCtx {
  return useContext(Ctx);
}

// ---------- 基础组件 ----------
export function Card({ children, style }: { children: ReactNode; style?: object }) {
  return (
    <View style={[{ backgroundColor: C.white, borderRadius: 16, borderWidth: 1, borderColor: C.line, padding: 16 }, style]}>
      {children}
    </View>
  );
}

export function H1({ children }: { children: ReactNode }) {
  const { fs } = useSettings();
  return <Text style={{ fontSize: fs(22), fontWeight: '800', color: C.ink }}>{children}</Text>;
}

export function Label({ children }: { children: ReactNode }) {
  const { fs } = useSettings();
  return <Text style={{ fontSize: fs(12), fontWeight: '600', color: C.slate, marginBottom: 4 }}>{children}</Text>;
}

export function Body({ children, muted, style }: { children: ReactNode; muted?: boolean; style?: object }) {
  const { fs } = useSettings();
  return <Text style={[{ fontSize: fs(13), color: muted ? C.slate : C.ink, lineHeight: fs(20) }, style]}>{children}</Text>;
}

export function Btn({
  title,
  onPress,
  kind = 'primary',
  disabled,
  style,
}: {
  title: string;
  onPress: () => void;
  kind?: 'primary' | 'ghost' | 'teal' | 'danger';
  disabled?: boolean;
  style?: object;
}) {
  const { fs } = useSettings();
  return (
    <TouchableOpacity
      style={[
        { borderRadius: 12, paddingVertical: 12, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
        kind === 'primary' && { backgroundColor: disabled ? C.slate2 : C.accent },
        kind === 'teal' && { backgroundColor: C.teal },
        kind === 'danger' && { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#E5484D' },
        kind === 'ghost' && { backgroundColor: 'transparent', borderWidth: 1, borderColor: C.line },
        disabled && { opacity: 0.6 },
        style,
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
    >
      <Text style={{ color: kind === 'ghost' || kind === 'danger' ? (kind === 'danger' ? '#E5484D' : C.ink) : C.white, fontWeight: '700', fontSize: fs(14) }}>
        {title}
      </Text>
    </TouchableOpacity>
  );
}

export function Tag({ children, tone = 'slate' }: { children: ReactNode; tone?: 'accent' | 'teal' | 'amber' | 'slate' | 'ink' }) {
  const map = {
    accent: { bg: C.accentSoft, fg: C.accent },
    teal: { bg: C.tealSoft, fg: C.teal },
    amber: { bg: C.amberSoft, fg: C.amber },
    slate: { bg: C.group, fg: C.slate },
    ink: { bg: C.ink, fg: C.paper },
  } as const;
  const t = map[tone];
  return (
    <View style={{ backgroundColor: t.bg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
      <Text style={{ color: t.fg, fontSize: 11, fontWeight: '600' }}>{children}</Text>
    </View>
  );
}

export function Ring({ value, size = 120, label }: { value: number; size?: number; label?: string }) {
  const { fs } = useSettings();
  const r = size / 2 - 7;
  const circ = 2 * Math.PI * r;
  const off = circ * (1 - Math.min(Math.max(value, 0), 100) / 100);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={C.line} strokeWidth={9} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={C.accent} strokeWidth={9} fill="none" strokeDasharray={circ} strokeDashoffset={off} strokeLinecap="round" />
      </Svg>
      <View style={{ position: 'absolute', alignItems: 'center' }}>
        <Text style={{ fontSize: fs(22), fontWeight: '700', color: C.ink }}>{value}%</Text>
        {label ? <Text style={{ fontSize: fs(10), color: C.slate }}>{label}</Text> : null}
      </View>
    </View>
  );
}

export function Loading({ text = '加载中…' }: { text?: string }) {
  const { fs } = useSettings();
  return (
    <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'center', alignItems: 'center', paddingVertical: 40 }}>
      <ActivityIndicator color={C.accent} />
      <Text style={{ color: C.slate, fontSize: fs(13) }}>{text}</Text>
    </View>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { fs } = useSettings();
  return (
    <Card style={{ backgroundColor: C.accentSoft, borderColor: C.accent + '40', padding: 14 }}>
      <Text style={{ color: C.accent, fontWeight: '700', fontSize: fs(13) }}>出错了</Text>
      <Text style={{ color: C.accent, fontSize: fs(12), lineHeight: fs(18), marginTop: 4 }}>{message}</Text>
      {onRetry ? <Btn title="重试" kind="ghost" onPress={onRetry} style={{ marginTop: 8, alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 14 }} /> : null}
    </Card>
  );
}

export function EmptyBox({ title, hint }: { title: string; hint?: string }) {
  const { fs } = useSettings();
  return (
    <Card style={{ padding: 28, alignItems: 'center', borderStyle: 'dashed' }}>
      <Text style={{ fontWeight: '700', fontSize: fs(13), color: C.ink }}>{title}</Text>
      {hint ? <Text style={{ fontSize: fs(12), color: C.slate, textAlign: 'center', lineHeight: fs(18), marginTop: 4 }}>{hint}</Text> : null}
    </Card>
  );
}

/** DeepSeek 式设置行：左图标（SVG）+标题，右侧值/箭头 */
export function SettingRow({
  icon,
  title,
  value,
  onPress,
  danger,
  last,
}: {
  icon?: ReactNode;
  title: string;
  value?: string;
  onPress?: () => void;
  danger?: boolean;
  last?: boolean;
}) {
  const { fs } = useSettings();
  return (
    <TouchableOpacity
      style={[
        { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16 },
        !last && { borderBottomWidth: 1, borderBottomColor: C.line + '80' },
      ]}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={onPress ? 0.6 : 1}
    >
      {icon ? <View style={{ width: 24, alignItems: 'center' }}>{icon}</View> : null}
      <Text style={{ flex: 1, fontSize: fs(14), fontWeight: '500', color: danger ? '#E5484D' : C.ink }}>{title}</Text>
      {value ? <Text style={{ fontSize: fs(13), color: C.slate2, maxWidth: 160 }} numberOfLines={1}>{value}</Text> : null}
      {onPress ? <Icon name="chevronRight" size={fs(15)} color={C.slate2} strokeWidth={2} /> : null}
    </TouchableOpacity>
  );
}

/** DeepSeek 式设置分组卡（组内行用 SettingRow） */
export function SettingGroup({ children }: { children: ReactNode }) {
  return <View style={{ backgroundColor: C.white, borderRadius: 16, borderWidth: 1, borderColor: C.line, marginBottom: 14, overflow: 'hidden' }}>{children}</View>;
}

/** 分组标题（小灰字） */
export function GroupTitle({ children }: { children: ReactNode }) {
  const { fs } = useSettings();
  return <Text style={{ fontSize: fs(12), color: C.slate2, marginLeft: 16, marginBottom: 6 }}>{children}</Text>;
}
