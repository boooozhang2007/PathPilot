import type { FC } from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { GridBackdrop, Kicker, Wordmark } from '../components/frames';
import { C, F } from '../tokens';
import { BRAND, PRINCIPLES } from '../data';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

export const Outro: FC = () => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [0, 24], [0, 1], clamp);
  return (
    <AbsoluteFill>
      <GridBackdrop />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', gap: 30 }}>
        <Kicker text="数据可信优先" />
        <div style={{ display: 'flex', gap: 22, opacity: p }}>
          {PRINCIPLES.map((text, i) => (
            <div
              key={text}
              style={{
                background: 'rgba(255,255,255,.06)',
                border: '1px solid rgba(255,255,255,.14)',
                borderRadius: 14,
                padding: '18px 26px',
                fontSize: 21,
                color: '#C8D6E4',
                opacity: interpolate(frame - i * 8, [0, 18], [0, 1], clamp),
              }}
            >
              {text}
            </div>
          ))}
        </div>
        <div style={{ marginTop: 26, opacity: interpolate(frame - 30, [0, 24], [0, 1], clamp) }}>
          <Wordmark size={104} />
        </div>
        <div style={{ fontSize: 26, letterSpacing: 4, color: '#9FB4C9', opacity: interpolate(frame - 44, [0, 20], [0, 1], clamp) }}>{BRAND.tag}</div>
        <div style={{ fontFamily: F.mono, fontSize: 17, color: C.accent, letterSpacing: 2, opacity: interpolate(frame - 54, [0, 20], [0, 1], clamp) }}>{BRAND.site}</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
