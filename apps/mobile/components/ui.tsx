// 移动端 UI 基础组件：三套主题风格（极简 / 拟物 / 新拟物）× 深浅色 × 字号缩放
// C 为调色板 Proxy、SF 为材质表面 Proxy：渲染时读取当前主题，切换后全局生效（页面样式均为 render 时求值的内联样式）
import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity, Appearance, type ViewStyle } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { AppSettings, DEFAULT_SETTINGS, FONT_SCALE, loadSettings, saveSettings, resolveLang, type ThemeStyle } from '../lib/prefs';
import { Icon } from './icons';

// ---------- 调色板 ----------
export interface Palette {
  paper: string; // 页面底色
  white: string; // 卡片/面板底色
  group: string; // 分组卡 / 输入框底 / 次级容器
  line: string; // 分隔线 / 描边
  ink: string; // 主文字
  ink2: string; // 次级深文字
  slate: string; // 说明文字
  slate2: string; // 占位/禁用文字
  accent: string; // 主色
  accentSoft: string; // 主色浅底
  deep: string; // 主视觉面板底色
  deepText: string; // 主视觉面板上的主文字
  deepMuted: string; // 主视觉面板上的次级文字
  deepLine: string; // 主视觉面板上的描线/圆环轨道
  onAccent: string; // 主色按钮上的文字
  teal: string;
  tealSoft: string;
  amber: string;
  amberSoft: string;
  mask: string; // 遮罩
  tabActive: string; // 底栏选中色
  tabInactive: string; // 底栏未选中色
}

// 极简（默认，DeepSeek 式纯白）
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
  deepText: '#FFFFFF',
  deepMuted: 'rgba(255,255,255,0.68)',
  deepLine: 'rgba(255,255,255,0.16)',
  onAccent: '#FFFFFF',
  teal: '#0E7C6B',
  tealSoft: '#E7F5F1',
  amber: '#B97A0B',
  amberSoft: '#F8EED9',
  mask: 'rgba(0,0,0,0.35)',
  tabActive: '#426EFE',
  tabInactive: '#9AA1AB',
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
  deepText: '#FFFFFF',
  deepMuted: 'rgba(255,255,255,0.62)',
  deepLine: 'rgba(255,255,255,0.14)',
  onAccent: '#FFFFFF',
  teal: '#3BBBA8',
  tealSoft: '#1B2F2B',
  amber: '#D9A13B',
  amberSoft: '#3A2F1B',
  mask: 'rgba(0,0,0,0.55)',
  tabActive: '#5C7FFF',
  tabInactive: '#70757F',
};

// 拟物（胡桃木桌 · 皮革 · 牛皮纸 · 蓝图纸）
const SKEUO_LIGHT: Palette = {
  paper: '#e6dbc1',
  white: '#fbf5e4',
  group: '#ece2c8',
  line: '#c9b78e',
  ink: '#3a2812',
  ink2: '#4d3720',
  slate: '#7c6846',
  slate2: '#9c8867',
  accent: '#3d63e0',
  accentSoft: '#dde5fa',
  deep: '#12274a',
  deepText: '#f4f7fd',
  deepMuted: 'rgba(244,247,253,0.66)',
  deepLine: 'rgba(255,255,255,0.20)',
  onAccent: '#ffffff',
  teal: '#1a6e5c',
  tealSoft: '#dbeee5',
  amber: '#9a6b12',
  amberSoft: '#f3e7c8',
  mask: 'rgba(35,20,5,0.48)',
  tabActive: '#f6efdc',
  tabInactive: 'rgba(232,217,184,0.52)',
};

const SKEUO_DARK: Palette = {
  paper: '#241d13',
  white: '#332a1c',
  group: '#2b2316',
  line: '#4d4025',
  ink: '#ead9b0',
  ink2: '#d6c390',
  slate: '#b3a07e',
  slate2: '#87765a',
  accent: '#6e8dff',
  accentSoft: '#2b3150',
  deep: '#0d1e3b',
  deepText: '#eef3fb',
  deepMuted: 'rgba(238,243,251,0.62)',
  deepLine: 'rgba(255,255,255,0.16)',
  onAccent: '#ffffff',
  teal: '#3bbba8',
  tealSoft: '#1c322b',
  amber: '#d9a13b',
  amberSoft: '#3a2f14',
  mask: 'rgba(0,0,0,0.62)',
  tabActive: '#f0e2c0',
  tabInactive: 'rgba(232,217,184,0.42)',
};

// 新拟物（soft UI：同色浮雕 · 左上高光 · 右下阴影）
const NEU_LIGHT: Palette = {
  paper: '#e0e5ec',
  white: '#e0e5ec',
  group: '#e0e5ec',
  line: '#ccd4de',
  ink: '#3a4152',
  ink2: '#4d5566',
  slate: '#6b7280',
  slate2: '#9aa3b0',
  accent: '#6d5dfc',
  accentSoft: '#e3dffb',
  deep: '#e0e5ec',
  deepText: '#3a4152',
  deepMuted: '#6b7280',
  deepLine: '#ccd4de',
  onAccent: '#ffffff',
  teal: '#0e8f80',
  tealSoft: '#d9f0ec',
  amber: '#b07a12',
  amberSoft: '#f2e6cd',
  mask: 'rgba(58,65,82,0.35)',
  tabActive: '#6d5dfc',
  tabInactive: '#9aa3b0',
};

const NEU_DARK: Palette = {
  paper: '#2b2f36',
  white: '#2b2f36',
  group: '#2b2f36',
  line: '#3b4048',
  ink: '#e6e9ef',
  ink2: '#cfd4dc',
  slate: '#a3aab8',
  slate2: '#767e8c',
  accent: '#8b7dff',
  accentSoft: '#383352',
  deep: '#2b2f36',
  deepText: '#e6e9ef',
  deepMuted: '#a3aab8',
  deepLine: '#3b4048',
  onAccent: '#ffffff',
  teal: '#46c9b8',
  tealSoft: '#223b38',
  amber: '#d9a13b',
  amberSoft: '#3a2f1b',
  mask: 'rgba(0,0,0,0.62)',
  tabActive: '#8b7dff',
  tabInactive: '#767e8c',
};

const PALETTES: Record<ThemeStyle, { light: Palette; dark: Palette }> = {
  minimal: { light: LIGHT, dark: DARK },
  skeuo: { light: SKEUO_LIGHT, dark: SKEUO_DARK },
  neumorph: { light: NEU_LIGHT, dark: NEU_DARK },
};

// ---------- 材质表面 ----------
type Shadow = NonNullable<ViewStyle['boxShadow']>;

export interface Surface {
  page: ViewStyle; // 页面底色（拟物模式铺一层纸面渐变）
  card: ViewStyle; // 卡片
  hero: ViewStyle; // 主视觉面板
  inset: ViewStyle; // 内凹槽（分段控件 / 进度条底 / 引用块）
  raised: ViewStyle; // 可点凸起（图标钮 / 会话项 / 次级按钮）
  input: ViewStyle; // 输入框
  sheet: ViewStyle; // 底部弹层
  tabBar: ViewStyle; // 底部导航
  chip: ViewStyle; // 小标签
}

function makeSurface(style: ThemeStyle, p: Palette, dark: boolean): Surface {
  if (style === 'skeuo') {
    // 牛皮纸卡片：顶部高光 + 纸上投影；深色模式下旧纸在暗桌上
    const paperShadow: Shadow = dark
      ? [
          { inset: true, offsetX: 0, offsetY: 1, blurRadius: 0, color: 'rgba(255,240,200,0.10)' },
          { offsetX: 0, offsetY: 1, blurRadius: 2, color: 'rgba(0,0,0,0.45)' },
          { offsetX: 0, offsetY: 9, blurRadius: 16, spreadDistance: -6, color: 'rgba(0,0,0,0.55)' },
        ]
      : [
          { inset: true, offsetX: 0, offsetY: 1, blurRadius: 0, color: 'rgba(255,255,255,0.9)' },
          { offsetX: 0, offsetY: 1, blurRadius: 2, color: 'rgba(56,32,10,0.18)' },
          { offsetX: 0, offsetY: 9, blurRadius: 16, spreadDistance: -6, color: 'rgba(56,32,10,0.30)' },
        ];
    const slotShadow: Shadow = dark
      ? [{ inset: true, offsetX: 0, offsetY: 2, blurRadius: 4, color: 'rgba(0,0,0,0.5)' }]
      : [{ inset: true, offsetX: 0, offsetY: 2, blurRadius: 4, color: 'rgba(70,45,10,0.18)' }];
    return {
      page: {
        backgroundColor: p.paper,
        backgroundImage: dark
          ? 'radial-gradient(circle at 20% 0%, #322819 0%, #241d13 62%, #1a1409 100%)'
          : 'radial-gradient(circle at 20% 0%, #f0e6cd 0%, #e4d8bb 58%, #d8c9a6 100%)',
      },
      card: { backgroundColor: p.white, borderWidth: 1, borderColor: p.line, borderRadius: 10, boxShadow: paperShadow },
      hero: {
        backgroundColor: p.deep,
        borderWidth: 1,
        borderColor: dark ? '#050d1c' : '#081630',
        borderRadius: 12,
        boxShadow: dark
          ? [{ offsetX: 0, offsetY: 8, blurRadius: 18, spreadDistance: -8, color: 'rgba(0,0,0,0.7)' }]
          : [
              { inset: true, offsetX: 0, offsetY: 1, blurRadius: 0, color: 'rgba(255,255,255,0.14)' },
              { offsetX: 0, offsetY: 8, blurRadius: 18, spreadDistance: -8, color: 'rgba(25,12,0,0.45)' },
            ],
      },
      inset: { backgroundColor: p.group, borderWidth: 1, borderColor: dark ? '#3f3419' : '#a5905f', borderRadius: 8, boxShadow: slotShadow },
      raised: { backgroundColor: p.white, borderWidth: 1, borderColor: dark ? '#55462a' : '#a8956a', borderRadius: 8, boxShadow: paperShadow },
      input: { backgroundColor: p.group, borderWidth: 1, borderColor: dark ? '#4c3f24' : '#a5905f', borderRadius: 8, boxShadow: slotShadow },
      sheet: { backgroundColor: p.white, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderWidth: 1, borderBottomWidth: 0, borderColor: p.line, boxShadow: paperShadow },
      tabBar: {
        backgroundColor: dark ? '#2b2013' : '#46311d',
        borderTopWidth: 1,
        borderTopColor: dark ? '#0d0803' : '#1f130a',
        boxShadow: dark
          ? [{ inset: true, offsetX: 0, offsetY: 1, blurRadius: 0, color: 'rgba(255,240,200,0.06)' }]
          : [{ inset: true, offsetX: 0, offsetY: 1, blurRadius: 0, color: 'rgba(255,240,200,0.10)' }],
      },
      chip: { borderRadius: 4, borderWidth: 1, borderColor: dark ? 'rgba(255,235,190,0.14)' : 'rgba(110,85,40,0.28)' },
    };
  }

  if (style === 'neumorph') {
    const lightShadow = dark ? '#363b44' : '#ffffff';
    const darkShadow = dark ? '#1f2228' : '#b8bcc2';
    const raised: Shadow = [
      { offsetX: -6, offsetY: -6, blurRadius: 12, color: lightShadow },
      { offsetX: 6, offsetY: 6, blurRadius: 12, color: darkShadow },
    ];
    const raisedSm: Shadow = [
      { offsetX: -3, offsetY: -3, blurRadius: 6, color: lightShadow },
      { offsetX: 3, offsetY: 3, blurRadius: 6, color: darkShadow },
    ];
    const pressedSm: Shadow = [
      { inset: true, offsetX: -2, offsetY: -2, blurRadius: 4, color: lightShadow },
      { inset: true, offsetX: 2, offsetY: 2, blurRadius: 4, color: darkShadow },
    ];
    return {
      page: {
        backgroundColor: p.paper,
        backgroundImage: dark
          ? 'radial-gradient(circle at 18% 0%, #333842 0%, #2b2f36 60%, #23262c 100%)'
          : 'radial-gradient(circle at 18% 0%, #e9eef5 0%, #e0e5ec 58%, #d7dee7 100%)',
      },
      card: { backgroundColor: p.white, borderRadius: 20, boxShadow: raised },
      hero: { backgroundColor: p.deep, borderRadius: 24, boxShadow: raised },
      inset: { backgroundColor: p.group, borderRadius: 14, borderWidth: 1, borderColor: dark ? '#33373f' : '#d3dbe5', boxShadow: pressedSm },
      raised: { backgroundColor: p.white, borderRadius: 14, boxShadow: raisedSm },
      input: { backgroundColor: p.group, borderRadius: 14, borderWidth: 1, borderColor: dark ? '#33373f' : '#d3dbe5', boxShadow: pressedSm },
      sheet: {
        backgroundColor: p.white,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        boxShadow: [{ offsetX: 0, offsetY: -8, blurRadius: 20, color: darkShadow }],
      },
      tabBar: { backgroundColor: p.paper, borderTopWidth: 0, boxShadow: [{ offsetX: 0, offsetY: -4, blurRadius: 12, color: darkShadow }] },
      chip: { borderRadius: 8, boxShadow: raisedSm },
    };
  }

  // minimal
  return {
    page: { backgroundColor: p.paper },
    card: { backgroundColor: p.white, borderRadius: 16, borderWidth: 1, borderColor: p.line },
    hero: { backgroundColor: p.deep, borderRadius: 16 },
    inset: { backgroundColor: p.group, borderRadius: 10 },
    raised: { backgroundColor: p.white, borderRadius: 12, borderWidth: 1, borderColor: p.line },
    input: { backgroundColor: p.white, borderRadius: 10, borderWidth: 1, borderColor: p.line },
    sheet: { backgroundColor: p.white, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
    tabBar: { backgroundColor: p.paper, borderTopWidth: 1, borderTopColor: p.line },
    chip: { borderRadius: 999 },
  };
}

let currentPalette: Palette = LIGHT;
let currentSurface: Surface = makeSurface('minimal', LIGHT, false);

/** 设计令牌：属性读取时返回当前主题色（渲染期求值，随主题切换全局生效） */
export const C = new Proxy({} as Palette, {
  get: (_, key: string) => currentPalette[key as keyof Palette],
});

/** 材质表面：卡片/内凹/凸起/输入框/底栏等，随主题风格切换 */
export const SF = new Proxy({} as Surface, {
  get: (_, key: string) => currentSurface[key as keyof Surface],
});

// ---------- 设置上下文（外观 / 主题风格 / 语言 / 字号 / 个性化） ----------
interface SettingsCtx {
  settings: AppSettings;
  update: (patch: Partial<AppSettings>) => void;
  palette: Palette;
  surface: Surface;
  themeStyle: ThemeStyle;
  dark: boolean;
  /** 字号缩放：fs(13) → 按档位缩放 */
  fs: (size: number) => number;
  lang: 'zh' | 'en';
}

const Ctx = createContext<SettingsCtx>({
  settings: DEFAULT_SETTINGS,
  update: () => {},
  palette: LIGHT,
  surface: currentSurface,
  themeStyle: 'minimal',
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
  const themeStyle = settings.themeStyle;
  const palette = PALETTES[themeStyle][dark ? 'dark' : 'light'];
  const surface = makeSurface(themeStyle, palette, dark);
  // 调色板/材质写在模块级引用上：C 与 SF 是渲染期求值的 Proxy，放到 effect 里会让首帧读到上一套主题
  // eslint-disable-next-line react-hooks/globals
  currentPalette = palette;
  // eslint-disable-next-line react-hooks/globals
  currentSurface = surface;

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
      surface,
      themeStyle,
      dark,
      fs: (n: number) => Math.round(n * FONT_SCALE[settings.fontSize]),
      lang: resolveLang(settings.language),
    }),
    [settings, palette, surface, themeStyle, dark]
  );

  // 主题/字号都经由 context 下发：各页面消费 useSettings 后在原地重渲染，不会重置导航栈
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSettings(): SettingsCtx {
  return useContext(Ctx);
}

// ---------- 基础组件 ----------
export function Card({ children, style }: { children: ReactNode; style?: object }) {
  return <View style={[{ ...SF.card, padding: 16 }, style]}>{children}</View>;
}

/** 主视觉面板：拟物模式下带胶带与图纸描线，新拟物模式下是整块柔光浮雕 */
export function Panel({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const { themeStyle } = useSettings();
  return (
    <View style={[{ ...SF.hero, overflow: 'visible' }, style]}>
      {themeStyle === 'skeuo' ? (
        <>
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: -7,
              left: '50%',
              marginLeft: -28,
              width: 56,
              height: 15,
              borderRadius: 2,
              backgroundColor: 'rgba(246,232,190,0.78)',
              transform: [{ rotate: '-4deg' }],
              boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 2, color: 'rgba(30,16,2,0.35)' }],
            }}
          />
          <View pointerEvents="none" style={{ position: 'absolute', top: 7, left: 7, right: 7, bottom: 7, borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)', borderRadius: 3 }} />
        </>
      ) : null}
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
  const { fs, themeStyle } = useSettings();
  // 主色按钮：拟物=珐琅按键（内高光+外投影），新拟物=柔光浮起，极简=纯色
  const solid = (color: string): ViewStyle => {
    if (themeStyle === 'skeuo') {
      return {
        backgroundColor: color,
        borderWidth: 1,
        borderColor: 'rgba(10,22,70,0.55)',
        boxShadow: [
          { inset: true, offsetX: 0, offsetY: 1, blurRadius: 0, color: 'rgba(255,255,255,0.4)' },
          { offsetX: 0, offsetY: 2, blurRadius: 4, color: 'rgba(35,18,2,0.35)' },
        ],
      };
    }
    if (themeStyle === 'neumorph') {
      return {
        backgroundColor: color,
        boxShadow: [{ offsetX: 0, offsetY: 6, blurRadius: 14, color: 'rgba(58,65,82,0.30)' }],
      };
    }
    return { backgroundColor: color };
  };
  const ghost: ViewStyle =
    themeStyle === 'skeuo'
      ? { ...SF.raised }
      : themeStyle === 'neumorph'
        ? { ...SF.raised }
        : { backgroundColor: 'transparent', borderWidth: 1, borderColor: C.line };
  const radius = themeStyle === 'neumorph' ? 14 : themeStyle === 'skeuo' ? 8 : 12;
  return (
    <TouchableOpacity
      style={[
        { borderRadius: radius, paddingVertical: 12, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
        kind === 'primary' && (disabled ? { backgroundColor: C.slate2 } : solid(C.accent)),
        kind === 'teal' && solid(C.teal),
        kind === 'danger' && { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#E5484D', borderRadius: radius },
        kind === 'ghost' && ghost,
        disabled && { opacity: 0.6 },
        style,
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
    >
      <Text style={{ color: kind === 'ghost' || kind === 'danger' ? (kind === 'danger' ? '#E5484D' : C.ink) : C.onAccent, fontWeight: '700', fontSize: fs(14) }}>
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
    <View style={[{ ...SF.chip, backgroundColor: t.bg, paddingHorizontal: 8, paddingVertical: 2 }]}>
      <Text style={{ color: t.fg, fontSize: 11, fontWeight: '600' }}>{children}</Text>
    </View>
  );
}

export function Ring({
  value,
  size = 120,
  label,
  track,
  fg,
  labelColor,
  accentColor,
}: {
  value: number;
  size?: number;
  label?: string;
  /** 轨道色，默认取当前主题描边色 */
  track?: string;
  /** 中心数字颜色，默认主题主文字 */
  fg?: string;
  labelColor?: string;
  accentColor?: string;
}) {
  const { fs } = useSettings();
  const r = size / 2 - 7;
  const circ = 2 * Math.PI * r;
  const off = circ * (1 - Math.min(Math.max(value, 0), 100) / 100);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track ?? C.line} strokeWidth={9} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={accentColor ?? C.accent} strokeWidth={9} fill="none" strokeDasharray={circ} strokeDashoffset={off} strokeLinecap="round" />
      </Svg>
      <View style={{ position: 'absolute', alignItems: 'center' }}>
        <Text style={{ fontSize: fs(22), fontWeight: '700', color: fg ?? C.ink }}>{value}%</Text>
        {label ? <Text style={{ fontSize: fs(10), color: labelColor ?? C.slate }}>{label}</Text> : null}
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
    <View style={{ ...SF.card, backgroundColor: C.amberSoft, borderColor: C.amber + '40', padding: 14 }}>
      <Text style={{ color: C.amber, fontWeight: '700', fontSize: fs(13) }}>出错了</Text>
      <Text style={{ color: C.amber, fontSize: fs(12), lineHeight: fs(18), marginTop: 4 }}>{message}</Text>
      {onRetry ? <Btn title="重试" kind="ghost" onPress={onRetry} style={{ marginTop: 8, alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 14 }} /> : null}
    </View>
  );
}

export function EmptyBox({ title, hint }: { title: string; hint?: string }) {
  const { fs } = useSettings();
  return (
    <View style={{ ...SF.card, padding: 28, alignItems: 'center' }}>
      <Text style={{ fontWeight: '700', fontSize: fs(13), color: C.ink }}>{title}</Text>
      {hint ? <Text style={{ fontSize: fs(12), color: C.slate, textAlign: 'center', lineHeight: fs(18), marginTop: 4 }}>{hint}</Text> : null}
    </View>
  );
}

/** 设置行：左图标（SVG）+标题，右侧值/箭头 */
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
      style={[{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16 }, !last && { borderBottomWidth: 1, borderBottomColor: C.line }]}
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

/** 设置分组卡（组内行用 SettingRow） */
export function SettingGroup({ children }: { children: ReactNode }) {
  return <View style={{ ...SF.card, borderRadius: 16, marginBottom: 14, overflow: 'hidden' }}>{children}</View>;
}

/** 分组标题（小灰字） */
export function GroupTitle({ children }: { children: ReactNode }) {
  const { fs } = useSettings();
  return <Text style={{ fontSize: fs(12), color: C.slate2, marginLeft: 16, marginBottom: 6 }}>{children}</Text>;
}
