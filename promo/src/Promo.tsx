import type { FC } from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile, interpolate } from 'remotion';
import { C, F } from './tokens';
import { SCENES } from './timing';
import { Intro } from './scenes/Intro';
import { Problem } from './scenes/Problem';
import { WebAgent } from './scenes/WebAgent';
import { AppAgent } from './scenes/AppAgent';
import { Outro } from './scenes/Outro';

const at = {
  intro: 0,
  problem: SCENES.intro,
  webAgent: SCENES.intro + SCENES.problem,
  appAgent: SCENES.intro + SCENES.problem + SCENES.webAgent,
  outro: SCENES.intro + SCENES.problem + SCENES.webAgent + SCENES.appAgent,
};

export const Promo: FC = () => (
  <AbsoluteFill style={{ backgroundColor: C.ink, fontFamily: F.sans, color: C.white }}>
    {/* 音床：可替换为正式配乐（promo/public/audio/bed.wav） */}
    <Audio
      src={staticFile('audio/bed.wav')}
      volume={(f) => {
        const total = Object.values(SCENES).reduce((s, v) => s + v, 0);
        return interpolate(f, [0, 30, total - 45, total], [0, 0.5, 0.5, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
      }}
    />
    <Sequence from={at.intro} durationInFrames={SCENES.intro}>
      <Intro />
    </Sequence>
    <Sequence from={at.problem} durationInFrames={SCENES.problem}>
      <Problem />
    </Sequence>
    <Sequence from={at.webAgent} durationInFrames={SCENES.webAgent}>
      <WebAgent />
    </Sequence>
    <Sequence from={at.appAgent} durationInFrames={SCENES.appAgent}>
      <AppAgent />
    </Sequence>
    <Sequence from={at.outro} durationInFrames={SCENES.outro}>
      <Outro />
    </Sequence>
  </AbsoluteFill>
);
