import type { FC } from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { GridBackdrop, Kicker } from '../components/frames';
import { C, F } from '../tokens';
import { PROBLEM_LINES, PROBLEM_PIVOT } from '../data';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

export const Problem: FC = () => {
  const frame = useCurrentFrame();
  const pivot = interpolate(frame, [96, 130], [0, 1], clamp);
  return (
    <AbsoluteFill>
      <GridBackdrop tint={0.045} />
      <AbsoluteFill style={{ padding: '150px 0 0 190px', gap: 34, alignItems: 'flex-start' }}>
        <Kicker text="现实是" />
        {PROBLEM_LINES.map((line, i) => {
          const p = interpolate(frame - 18 - i * 20, [0, 22], [0, 1], clamp);
          return (
            <div
              key={line}
              style={{
                fontSize: 62,
                fontWeight: 700,
                letterSpacing: 1,
                color: C.white,
                opacity: p * (1 - pivot * 0.45),
                transform: `translateX(${(1 - p) * 40}px)`,
                display: 'flex',
                alignItems: 'center',
                gap: 22,
              }}
            >
              <span style={{ fontFamily: F.mono, fontSize: 20, color: C.slate2 }}>0{i + 1}</span>
              {line}
            </div>
          );
        })}
        <div style={{ marginTop: 34, opacity: pivot, transform: `translateY(${(1 - pivot) * 22}px)`, fontSize: 52, fontWeight: 800, color: C.accent, letterSpacing: 1 }}>
          {PROBLEM_PIVOT}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
