import type { FC } from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { Badge, GridBackdrop, Kicker, Wordmark } from '../components/frames';
import { C, F } from '../tokens';
import { BRAND } from '../data';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

export const Intro: FC = () => {
  const frame = useCurrentFrame();
  const reveal = interpolate(frame, [6, 40], [0, 1], clamp);
  const underline = interpolate(frame, [30, 62], [0, 1], clamp);
  const tagline = interpolate(frame, [46, 74], [0, 1], clamp);
  return (
    <AbsoluteFill>
      <GridBackdrop />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', gap: 26 }}>
        <Kicker text="PATHPLOT · CAREER AGENT" />
        <div style={{ opacity: reveal, transform: `translateY(${(1 - reveal) * 26}px)` }}>
          <Wordmark size={118} progress={reveal} />
        </div>
        <div style={{ width: 520 * underline, height: 3, background: `linear-gradient(90deg, ${C.accent}, rgba(232,81,42,0))`, borderRadius: 3 }} />
        <div style={{ fontSize: 34, letterSpacing: 6, color: '#C8D6E4', opacity: tagline }}>{BRAND.tag}</div>
        <div style={{ marginTop: 16, opacity: tagline }}>
          <Badge text={BRAND.sub} dark delay={62} />
        </div>
        <div style={{ position: 'absolute', bottom: 52, fontFamily: F.mono, fontSize: 14, letterSpacing: 3, color: 'rgba(255,255,255,.32)' }}>{BRAND.site}</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
