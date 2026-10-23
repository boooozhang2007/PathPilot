// 移动端 UI 基础组件（设计令牌与 Web/设计稿一致）
import type { ReactNode } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

export const C = {
  ink: '#0B2239',
  ink2: '#1C3A57',
  paper: '#F5F2EA',
  accent: '#E8512A',
  accentSoft: '#FBE9E2',
  teal: '#0E7C6B',
  tealSoft: '#E3F0ED',
  amber: '#B97A0B',
  amberSoft: '#F7EED9',
  slate: '#5B6B7C',
  slate2: '#8D99A8',
  line: '#E2DDD0',
  white: '#FFFFFF',
};

export function Card({ children, style }: { children: ReactNode; style?: object }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function H1({ children }: { children: ReactNode }) {
  return <Text style={styles.h1}>{children}</Text>;
}

export function Label({ children }: { children: ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

export function Body({ children, muted, style }: { children: ReactNode; muted?: boolean; style?: object }) {
  return <Text style={[styles.body, muted && { color: C.slate }, style]}>{children}</Text>;
}

export function Btn({ title, onPress, kind = 'primary', disabled, style }: { title: string; onPress: () => void; kind?: 'primary' | 'ghost' | 'teal'; disabled?: boolean; style?: object }) {
  return (
    <TouchableOpacity
      style={[
        styles.btn,
        kind === 'primary' && { backgroundColor: disabled ? C.slate2 : C.accent },
        kind === 'teal' && { backgroundColor: C.teal },
        kind === 'ghost' && { backgroundColor: 'transparent', borderWidth: 1, borderColor: C.line },
        disabled && { opacity: 0.6 },
        style,
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
    >
      <Text style={[styles.btnText, kind === 'ghost' && { color: C.ink }]}>{title}</Text>
    </TouchableOpacity>
  );
}

export function Tag({ children, tone = 'slate' }: { children: ReactNode; tone?: 'accent' | 'teal' | 'amber' | 'slate' | 'ink' }) {
  const map = {
    accent: { bg: C.accentSoft, fg: C.accent },
    teal: { bg: C.tealSoft, fg: C.teal },
    amber: { bg: C.amberSoft, fg: C.amber },
    slate: { bg: '#EDE8DB', fg: C.slate },
    ink: { bg: C.ink, fg: C.white },
  } as const;
  const t = map[tone];
  return (
    <View style={{ backgroundColor: t.bg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
      <Text style={{ color: t.fg, fontSize: 11, fontWeight: '600' }}>{children}</Text>
    </View>
  );
}

export function Ring({ value, size = 120, label }: { value: number; size?: number; label?: string }) {
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
        <Text style={{ fontSize: 22, fontWeight: '700', color: C.ink }}>{value}%</Text>
        {label ? <Text style={{ fontSize: 10, color: C.slate }}>{label}</Text> : null}
      </View>
    </View>
  );
}

export function Loading({ text = '加载中…' }: { text?: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'center', alignItems: 'center', paddingVertical: 40 }}>
      <ActivityIndicator color={C.accent} />
      <Text style={{ color: C.slate, fontSize: 13 }}>{text}</Text>
    </View>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card style={{ backgroundColor: C.accentSoft, borderColor: C.accent + '40', padding: 14 }}>
      <Text style={{ color: C.accent, fontWeight: '700', fontSize: 13 }}>出错了</Text>
      <Text style={{ color: C.accent, fontSize: 12, lineHeight: 18, marginTop: 4 }}>{message}</Text>
      {onRetry ? (
        <Btn title="重试" kind="ghost" onPress={onRetry} style={{ marginTop: 8, alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 14 }} />
      ) : null}
    </Card>
  );
}

export function EmptyBox({ title, hint }: { title: string; hint?: string }) {
  return (
    <Card style={{ padding: 28, alignItems: 'center', borderStyle: 'dashed' }}>
      <Text style={{ fontWeight: '700', fontSize: 13, color: C.ink }}>{title}</Text>
      {hint ? <Text style={{ fontSize: 12, color: C.slate, textAlign: 'center', lineHeight: 18, marginTop: 4 }}>{hint}</Text> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: C.white, borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 16 },
  h1: { fontSize: 22, fontWeight: '800', color: C.ink },
  label: { fontSize: 12, fontWeight: '600', color: C.slate, marginBottom: 4 },
  body: { fontSize: 13, color: C.ink, lineHeight: 20 },
  btn: { borderRadius: 10, paddingVertical: 11, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: C.white, fontWeight: '700', fontSize: 14 },
});
