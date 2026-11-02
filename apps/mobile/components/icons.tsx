// 通用 SVG 图标库（线性风格 24x24）：全 App 禁用 emoji 作图标，统一从这里取
// 用法：<Icon name="brain" size={14} color={C.accent} />
import Svg, { Path, Circle } from 'react-native-svg';

export type IconName =
  | 'menu' | 'plus' | 'spark' | 'brain' | 'pen' | 'wrench' | 'clock' | 'check' | 'checkCircle'
  | 'warn' | 'play' | 'pause' | 'expand' | 'collapse' | 'chevronUp' | 'chevronDown' | 'chevronRight'
  | 'close' | 'copy' | 'refresh' | 'arrowUp' | 'user' | 'settings' | 'info' | 'globe' | 'moon'
  | 'font' | 'folder' | 'trash' | 'door' | 'server' | 'compass' | 'download' | 'rocket' | 'star'
  | 'chat' | 'roadmap' | 'target' | 'layers' | 'calendar' | 'trashSweep' | 'party'
  | 'bell' | 'share';

const P = (d: string) => d;

const PATHS: Record<IconName, string[]> = {
  menu: [P('M4 6.5h16M4 12h16M4 17.5h16')],
  plus: [P('M12 5v14M5 12h14')],
  spark: [P('M12 3.2 13.6 9.4l6.2 1.6-6.2 1.6L12 18.8l-1.6-6.2-6.2-1.6 6.2-1.6Z')],
  brain: [
    P('M9.5 4.5a3 3 0 0 0-3 3c-1.5.4-2.5 1.7-2.5 3.3 0 1.1.5 2 1.3 2.6-.5.6-.8 1.3-.8 2.1 0 1.9 1.6 3.5 3.5 3.5h1.5V4.5Z'),
    P('M14.5 4.5a3 3 0 0 1 3 3c1.5.4 2.5 1.7 2.5 3.3 0 1.1-.5 2-1.3 2.6.5.6.8 1.3.8 2.1 0 1.9-1.6 3.5-3.5 3.5h-1.5V4.5Z'),
  ],
  pen: [P('M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3Z'), P('M13.5 6.5l3 3')],
  wrench: [P('M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z')],
  clock: [P('M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16Z'), P('M12 8v4.5l3 1.8')],
  check: [P('M20 6 9 17l-5-5')],
  checkCircle: [P('M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16Z'), P('m8.6 12.3 2.3 2.3 4.5-4.9')],
  warn: [P('M12 4.5 21 19.5H3L12 4.5Z'), P('M12 10v4'), P('M12 17.2v.1')],
  play: [P('M8 5.5v13l11-6.5-11-6.5Z')],
  pause: [P('M8.5 5.5v13'), P('M15.5 5.5v13')],
  expand: [P('M4 9V4h5'), P('M20 15v5h-5'), P('M4 4l6 6'), P('M20 20l-6-6')],
  collapse: [P('M9 4v5H4'), P('M15 20v-5h5'), P('M10 10 4 4'), P('M14 14l6 6')],
  chevronUp: [P('m6 14 6-6 6 6')],
  chevronDown: [P('m6 10 6 6 6-6')],
  chevronRight: [P('m9 5 7 7-7 7')],
  close: [P('M6 6l12 12'), P('M18 6 6 18')],
  copy: [P('M9 9h10v12H9z'), P('M5 15V3h10')],
  refresh: [P('M20.5 12a8.5 8.5 0 1 1-2.5-6'), P('M20.5 3.5v5h-5')],
  arrowUp: [P('M12 19V6'), P('m5.5 12.5 6.5-6.5 6.5 6.5')],
  user: [P('M12 4.8a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8Z'), P('M5.2 19.6c1.4-3.6 12.2-3.6 13.6 0')],
  settings: [
    P('M12 9.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6Z'),
    P('M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.9 19.3a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.7 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.08A1.7 1.7 0 0 0 10.2 3V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.08a1.7 1.7 0 0 0 1.56 1.03H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1.03Z'),
  ],
  info: [P('M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16Z'), P('M12 11v5'), P('M12 8v.1')],
  globe: [P('M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16Z'), P('M4 12h16'), P('M12 4c2.5 2.2 3.8 4.9 3.8 8s-1.3 5.8-3.8 8c-2.5-2.2-3.8-4.9-3.8-8s1.3-5.8 3.8-8Z')],
  moon: [P('M20 13.5A8 8 0 0 1 10.5 4 8 8 0 1 0 20 13.5Z')],
  font: [P('M5 19 11 5h2l6 14'), P('M7.8 14h8.4')],
  folder: [P('M3.5 6.5a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-11.5Z')],
  trash: [P('M4 7h16'), P('M9 7V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v2'), P('M6.5 7l1 13h9l1-13')],
  door: [P('M5 20.5h14'), P('M7 20V4.5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1V20'), P('M14.5 12.5v.1')],
  server: [P('M4.5 4.5h15v5h-15z'), P('M4.5 14.5h15v5h-15z'), P('M8 7v.1'), P('M8 17v.1')],
  compass: [P('M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16Z'), P('m14.8 9.2-1.6 4-4 1.6 1.6-4 4-1.6Z')],
  download: [P('M12 4v10'), P('m8 11 4 4 4-4'), P('M5 19h14')],
  rocket: [
    P('M12 3.5c3 1.2 5 4.3 5 8l-2.5 2.5h-5L7 11.5c0-3.7 2-6.8 5-8Z'),
    P('M7 11.5 4.5 14 6 16l3-.5'),
    P('M17 11.5 19.5 14 18 16l-3-.5'),
    P('M12 14v6.5'),
  ],
  star: [P('M12 4.2l2.3 4.9 5.2.7-3.8 3.7.9 5.3L12 16.3l-4.6 2.5.9-5.3-3.8-3.7 5.2-.7L12 4.2Z')],
  chat: [P('M4 5.5h16v10.5H9.5L5.5 19.5v-3.5H4z'), P('M8 9.5h8'), P('M8 12.5h5')],
  roadmap: [P('M7.2 20.5V4'), P('M7.2 5h9.4l-2.8 3 2.8 3H7.2'), P('M7.2 14.5h.1'), P('M7.2 20.4h.1')],
  target: [P('M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16Z'), P('M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z'), P('M12 11.2a.8.8 0 1 0 0 1.6.8.8 0 0 0 0-1.6Z')],
  layers: [P('m12 4 8 4.2-8 4.2-8-4.2L12 4Z'), P('m4.5 12.5 7.5 4 7.5-4'), P('m4.5 16.5 7.5 4 7.5-4')],
  calendar: [P('M4.5 6.5h15v13h-15z'), P('M4.5 10.5h15'), P('M8.5 4v3'), P('M15.5 4v3')],
  trashSweep: [P('M4 7h16'), P('M9 7V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v2'), P('M6.5 7l1 13h9l1-13'), P('M10 11h5')],
  party: [P('M4 19 11 6.5'), P('M11 6.5c2.5.5 4 2 4.5 4.5'), P('M4 19l3.4-1.2 1.2-3.4'), P('M16 5v.1'), P('M19.5 8l.1.1'), P('M18.5 12.5l.1.1'), P('M14.5 3.5l.1.1')],
  bell: [P('M18 9.5a6 6 0 1 0-12 0c0 5-2.5 6.5-2.5 6.5h17S18 14.5 18 9.5'), P('M10.3 19.2a1.9 1.9 0 0 0 3.4 0')],
  share: [P('M12 3.5v11'), P('m7.5 7 4.5-4.5L16.5 7'), P('M5 12.5v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6')],
};

export function Icon({ name, size = 16, color = '#000', strokeWidth = 1.8 }: { name: IconName; size?: number; color?: string; strokeWidth?: number }) {
  const common = {
    stroke: color,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {PATHS[name].map((d, i) => (
        <Path key={i} d={d} {...common} />
      ))}
    </Svg>
  );
}

/** 填充型小圆点（时间轴节点等） */
export function Dot({ size = 12, color = '#000' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="10" fill={color} />
    </Svg>
  );
}

/** 主题化 Logo（PathPilot 星形） */
export function LogoMark({ size = 20, bg = '#426EFE', fg = '#FFFFFF' }: { size?: number; bg?: string; fg?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="12" fill={bg} />
      <Path d="M12 6.2 13.4 10.6l4.4 1.4-4.4 1.4L12 17.8l-1.4-4.4-4.4-1.4 4.4-1.4Z" fill={fg} />
    </Svg>
  );
}
