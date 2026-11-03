import type { FC } from 'react';
import { Composition } from 'remotion';
import { Promo } from './Promo';
import { FPS, TOTAL_FRAMES, VIDEO_HEIGHT, VIDEO_WIDTH } from './timing';

export const RemotionRoot: FC = () => (
  <Composition
    id="PathPilotPromo"
    component={Promo}
    durationInFrames={TOTAL_FRAMES}
    fps={FPS}
    width={VIDEO_WIDTH}
    height={VIDEO_HEIGHT}
  />
);
