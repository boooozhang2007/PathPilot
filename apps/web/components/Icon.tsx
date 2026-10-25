'use client';
// 与移动端 components/icons.tsx 同源的线性 SVG 图标库(24×24 stroke)
// 用法:<Ic name="brain" size={14} className="text-accent" />
const PATHS: Record<string, string[]> = {
  menu: ['M4 6.5h16M4 12h16M4 17.5h16'],
  plus: ['M12 5v14M5 12h14'],
  spark: ['M12 3.2 13.6 9.4l6.2 1.6-6.2 1.6L12 18.8l-1.6-6.2-6.2-1.6 6.2-1.6Z'],
  brain: [
    'M9.5 4.5a3 3 0 0 0-3 3c-1.5.4-2.5 1.7-2.5 3.3 0 1.1.5 2 1.3 2.6-.5.6-.8 1.3-.8 2.1 0 1.9 1.6 3.5 3.5 3.5h1.5V4.5Z',
    'M14.5 4.5a3 3 0 0 1 3 3c1.5.4 2.5 1.7 2.5 3.3 0 1.1-.5 2-1.3 2.6.5.6.8 1.3.8 2.1 0 1.9-1.6 3.5-3.5 3.5h-1.5V4.5Z',
  ],
  pen: ['M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3Z', 'M13.5 6.5l3 3'],
  wrench: ['M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z'],
  clock: ['M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16Z', 'M12 8v4.5l3 1.8'],
  check: ['M20 6 9 17l-5-5'],
  checkCircle: ['M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16Z', 'm8.6 12.3 2.3 2.3 4.5-4.9'],
  warn: ['M12 4.5 21 19.5H3L12 4.5Z', 'M12 10v4', 'M12 17.2v.1'],
  play: ['M8 5.5v13l11-6.5-11-6.5Z'],
  pause: ['M8.5 5.5v13', 'M15.5 5.5v13'],
  expand: ['M4 9V4h5', 'M20 15v5h-5', 'M4 4l6 6', 'M20 20l-6-6'],
  collapse: ['M9 4v5H4', 'M15 20v-5h5', 'M10 10 4 4', 'M14 14l6 6'],
  chevronUp: ['m6 14 6-6 6 6'],
  chevronDown: ['m6 10 6 6 6-6'],
  chevronRight: ['m9 5 7 7-7 7'],
  close: ['M6 6l12 12', 'M18 6 6 18'],
  copy: ['M9 9h10v12H9z', 'M5 15V3h10'],
  refresh: ['M20.5 12a8.5 8.5 0 1 1-2.5-6', 'M20.5 3.5v5h-5'],
  arrowUp: ['M12 19V6', 'm5.5 12.5 6.5-6.5 6.5 6.5'],
  user: ['M12 4.8a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8Z', 'M5.2 19.6c1.4-3.6 12.2-3.6 13.6 0'],
  settings: [
    'M12 9.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6Z',
    'M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.9 19.3a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.7 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.08A1.7 1.7 0 0 0 10.2 3V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.08a1.7 1.7 0 0 0 1.56 1.03H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1.03Z'],
  info: ['M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16Z', 'M12 11v5', 'M12 8v.1'],
  globe: ['M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16Z', 'M4 12h16', 'M12 4c2.5 2.2 3.8 4.9 3.8 8s-1.3 5.8-3.8 8c-2.5-2.2-3.8-4.9-3.8-8s1.3-5.8 3.8-8Z'],
  moon: ['M20 13.5A8 8 0 0 1 10.5 4 8 8 0 1 0 20 13.5Z'],
  font: ['M5 19 11 5h2l6 14', 'M7.8 14h8.4'],
  folder: ['M3.5 6.5a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-11.5Z'],
  trash: ['M4 7h16', 'M9 7V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v2', 'M6.5 7l1 13h9l1-13'],
  door: ['M5 20.5h14', 'M7 20V4.5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1V20', 'M14.5 12.5v.1'],
  server: ['M4.5 4.5h15v5h-15z', 'M4.5 14.5h15v5h-15z', 'M8 7v.1', 'M8 17v.1'],
  compass: ['M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16Z', 'm14.8 9.2-1.6 4-4 1.6 1.6-4 4-1.6Z'],
  download: ['M12 4v10', 'm8 11 4 4 4-4', 'M5 19h14'],
  rocket: ['M12 3.5c3 1.2 5 4.3 5 8l-2.5 2.5h-5L7 11.5c0-3.7 2-6.8 5-8Z', 'M7 11.5 4.5 14 6 16l3-.5', 'M17 11.5 19.5 14 18 16l-3-.5', 'M12 14v6.5'],
  star: ['M12 4.2l2.3 4.9 5.2.7-3.8 3.7.9 5.3L12 16.3l-4.6 2.5.9-5.3-3.8-3.7 5.2-.7L12 4.2Z'],
  chat: ['M4 5.5h16v10.5H9.5L5.5 19.5v-3.5H4z', 'M8 9.5h8', 'M8 12.5h5'],
  roadmap: ['M7.2 20.5V4', 'M7.2 5h9.4l-2.8 3 2.8 3H7.2', 'M7.2 14.5h.1', 'M7.2 20.4h.1'],
  target: ['M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16Z', 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z', 'M12 11.2a.8.8 0 1 0 0 1.6.8.8 0 0 0 0-1.6Z'],
  layers: ['m12 4 8 4.2-8 4.2-8-4.2L12 4Z', 'm4.5 12.5 7.5 4 7.5-4', 'm4.5 16.5 7.5 4 7.5-4'],
  calendar: ['M4.5 6.5h15v13h-15z', 'M4.5 10.5h15', 'M8.5 4v3', 'M15.5 4v3'],
  trashSweep: ['M4 7h16', 'M9 7V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v2', 'M6.5 7l1 13h9l1-13', 'M10 11h5'],
  party: ['M4 19 11 6.5', 'M11 6.5c2.5.5 4 2 4.5 4.5', 'M4 19l3.4-1.2 1.2-3.4', 'M16 5v.1', 'M19.5 8l.1.1', 'M18.5 12.5l.1.1', 'M14.5 3.5l.1.1'],
};

export function Ic({ name, size = 16, className = '', strokeWidth = 1.8 }: { name: keyof typeof PATHS | string; size?: number; className?: string; strokeWidth?: number }) {
  const d = PATHS[name] ?? PATHS.spark;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden className={className} style={{ flexShrink: 0 }}>
      {d.map((p, i) => (
        <path key={i} d={p} stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  );
}

/** 品牌标:蓝图网格上的路线旗 */
export function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden>
      <rect width="40" height="40" rx="11" fill="#0B2239" />
      <path d="M2 8h36M2 20h36M2 32h36M10 2v36M22 2v36M34 2v36" stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
      <path d="M12 30V10" stroke="#426EFE" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M12 11h13.5l-3.4 3.6 3.4 3.6H12" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="12" cy="25" r="2.2" fill="#426EFE" />
      <circle cx="12" cy="30" r="2.2" fill="#fff" />
    </svg>
  );
}
