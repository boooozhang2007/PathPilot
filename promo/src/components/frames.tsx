import type { FC, ReactNode } from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, F } from '../tokens';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

export const GridBackdrop: FC<{ tint?: number }> = ({ tint = 0.06 }) => (
  <AbsoluteFill style={{ backgroundColor: C.ink }}>
    <AbsoluteFill
      style={{
        backgroundImage: `radial-gradient(rgba(255,255,255,${tint}) 1px, transparent 1px)`,
        backgroundSize: '30px 30px',
        opacity: 0.9,
      }}
    />
    <div style={{ position: 'absolute', right: -240, top: -240, width: 820, height: 820, borderRadius: '50%', border: '1px dashed rgba(255,255,255,.10)' }} />
    <div style={{ position: 'absolute', left: -200, bottom: -280, width: 640, height: 640, borderRadius: '50%', border: '1px dashed rgba(232,81,42,.22)' }} />
    <AbsoluteFill
      style={{
        background:
          'radial-gradient(1200px 700px at 20% 16%, rgba(232,81,42,.16), transparent 60%), radial-gradient(1000px 620px at 88% 92%, rgba(14,124,107,.18), transparent 62%)',
      }}
    />
  </AbsoluteFill>
);

export const Kicker: FC<{ text: string; delay?: number; color?: string }> = ({ text, delay = 0, color = C.dim }) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame - delay, [0, 18], [0, 1], clamp);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, opacity: p, transform: `translateY(${(1 - p) * 12}px)` }}>
      <span style={{ width: 26, height: 2, background: C.accent }} />
      <span style={{ fontFamily: F.mono, fontSize: 15, letterSpacing: 4, color }}>{text}</span>
    </div>
  );
};

export const Wordmark: FC<{ size?: number; progress?: number }> = ({ size = 96, progress = 1 }) => (
  <div style={{ display: 'flex', alignItems: 'baseline', gap: size * 0.12 }}>
    <span style={{ fontSize: size, fontWeight: 800, letterSpacing: -1.5, color: C.white }}>Path</span>
    <span style={{ fontSize: size, fontWeight: 800, letterSpacing: -1.5, color: C.accent }}>Pilot</span>
    <span style={{ width: size * 0.1, height: size * 0.1, borderRadius: '50%', background: C.accent, opacity: 0.9, transform: `scale(${progress})` }} />
  </div>
);

export const Badge: FC<{ text: string; tone?: 'accent' | 'teal' | 'ink'; delay?: number; dark?: boolean }> = ({
  text,
  tone = 'accent',
  delay = 0,
  dark = false,
}) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame - delay, [0, 15], [0, 1], clamp);
  const bg = dark ? 'rgba(255,255,255,.14)' : tone === 'teal' ? C.tealSoft : tone === 'ink' ? '#EAF0F6' : C.accentSoft;
  const fg = dark ? C.white : tone === 'teal' ? C.teal : tone === 'ink' ? C.ink2 : C.accent;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        background: bg,
        color: fg,
        borderRadius: 999,
        padding: '7px 15px',
        fontSize: 15,
        fontWeight: 600,
        opacity: p,
        transform: `translateY(${(1 - p) * 10}px)`,
      }}
    >
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: fg, opacity: 0.85 }} />
      {text}
    </span>
  );
};

export const BrowserFrame: FC<{ children: ReactNode; url?: string; width: number; height: number; opacity?: number }> = ({
  children,
  url = 'localhost:3001/advisor',
  width,
  height,
  opacity = 1,
}) => (
  <div
    style={{
      width,
      height,
      opacity,
      borderRadius: 18,
      overflow: 'hidden',
      background: C.card,
      display: 'flex',
      flexDirection: 'column',
      boxShadow: '0 44px 100px -34px rgba(0,0,0,.8), 0 0 0 1px rgba(255,255,255,.14)',
    }}
  >
    <div style={{ height: 46, background: '#F1EEE6', display: 'flex', alignItems: 'center', gap: 9, padding: '0 16px', borderBottom: `1px solid ${C.line}`, flexShrink: 0 }}>
      {['#E8512A', '#B97A0B', '#0E7C6B'].map((c) => (
        <span key={c} style={{ width: 11, height: 11, borderRadius: '50%', background: c, opacity: 0.85 }} />
      ))}
      <div style={{ marginLeft: 12, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 999, padding: '5px 16px', fontFamily: F.mono, fontSize: 13, color: C.slate }}>{url}</div>
    </div>
    <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: C.paper }}>{children}</div>
  </div>
);

export const PhoneFrame: FC<{ children: ReactNode; width: number; height: number }> = ({ children, width, height }) => (
  <div
    style={{
      width,
      height,
      background: '#000',
      borderRadius: width * 0.132,
      padding: Math.round(width * 0.028),
      position: 'relative',
      flexShrink: 0,
      boxShadow: '0 0 0 2px #2a3b4f, 0 44px 100px -34px rgba(0,0,0,.85), 0 0 120px -40px rgba(232,81,42,.3)',
    }}
  >
    <div style={{ position: 'absolute', top: Math.round(width * 0.033), left: '50%', transform: 'translateX(-50%)', width: 13, height: 13, background: '#000', borderRadius: '50%', zIndex: 40 }} />
    <div style={{ width: '100%', height: '100%', borderRadius: width * 0.105, overflow: 'hidden', background: C.paper, position: 'relative' }}>{children}</div>
  </div>
);

export const Caption: FC<{ cues: { at: number; text: string }[] }> = ({ cues }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  let idx = -1;
  for (let i = 0; i < cues.length; i += 1) if (t >= cues[i].at) idx = i;
  if (idx < 0) return null;
  const cue = cues[idx];
  const nextAt = cues[idx + 1]?.at ?? cue.at + 6;
  const inP = interpolate(t, [cue.at, cue.at + 0.35], [0, 1], clamp);
  const outP = interpolate(t, [nextAt - 0.35, nextAt], [1, 0], clamp);
  const opacity = Math.min(inP, outP);
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 54, display: 'flex', justifyContent: 'center', opacity }}>
      <div
        style={{
          maxWidth: 1180,
          background: 'rgba(8,20,34,.82)',
          border: '1px solid rgba(255,255,255,.14)',
          borderRadius: 14,
          padding: '16px 26px',
          fontSize: 27,
          lineHeight: 1.45,
          letterSpacing: 0.3,
          textAlign: 'center',
          color: C.white,
          transform: `translateY(${(1 - inP) * 14}px)`,
        }}
      >
        {cue.text}
      </div>
    </div>
  );
};

export const Stat: FC<{ value: string; label: string; delay?: number }> = ({ value, label, delay = 0 }) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame - delay, [0, 20], [0, 1], clamp);
  return (
    <div style={{ opacity: p, transform: `translateY(${(1 - p) * 18}px)`, minWidth: 220 }}>
      <div style={{ fontFamily: F.mono, fontSize: 68, fontWeight: 700, color: C.accent, lineHeight: 1 }}>{value}</div>
      <div style={{ marginTop: 10, fontSize: 19, color: '#9FB4C9', letterSpacing: 1 }}>{label}</div>
    </div>
  );
};

export const ToolChip: FC<{ label: string; state?: 'running' | 'done'; delay?: number }> = ({ label, state = 'done', delay = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = interpolate(frame - delay, [0, 12], [0, 1], clamp);
  const pulse = state === 'running' ? 0.85 + 0.15 * Math.sin((frame / fps) * 6) : 1;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        background: 'rgba(255,255,255,.07)',
        border: '1px solid rgba(255,255,255,.14)',
        borderRadius: 12,
        padding: '12px 18px',
        opacity: p,
        transform: `translateX(${(1 - p) * 18}px)`,
      }}
    >
      <span style={{ width: 9, height: 9, borderRadius: '50%', background: state === 'done' ? C.teal : C.accent, opacity: pulse }} />
      <span style={{ fontSize: 18, color: C.white }}>{label}</span>
      <span style={{ fontFamily: F.mono, fontSize: 12, color: state === 'done' ? C.teal : C.accent, marginLeft: 4 }}>{state === 'done' ? 'DONE' : 'RUNNING'}</span>
    </div>
  );
};
