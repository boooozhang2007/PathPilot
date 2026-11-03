import type { FC } from 'react';
import { AbsoluteFill, interpolate, OffthreadVideo, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { Badge, BrowserFrame, Caption, GridBackdrop, Kicker, ToolChip } from '../components/frames';
import { C, F } from '../tokens';
import { FOOTAGE, SCENES } from '../timing';
import { TOOL_CHAIN, TOOL_LABELS, WEB_CAPTIONS } from '../data';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/** 主场景：真实 Web Agent 页面录屏（AI 顾问 + 工具调用链） */
export const WebAgent: FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const frameIn = interpolate(frame, [0, 20], [0, 1], clamp);
  const scale = interpolate(frame, [0, 40], [0.94, 1], clamp);

  return (
    <AbsoluteFill>
      <GridBackdrop tint={0.05} />
      <AbsoluteFill style={{ padding: '54px 90px 0 118px', flexDirection: 'row', gap: 44 }}>
        <div style={{ opacity: frameIn, transform: `scale(${scale})`, transformOrigin: 'left center' }}>
          <BrowserFrame url="localhost:3001/advisor" width={1180} height={700}>
            <OffthreadVideo
              src={staticFile(FOOTAGE.web.file)}
              startFrom={FOOTAGE.web.startFrom}
              playbackRate={FOOTAGE.web.playbackRate}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </BrowserFrame>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, paddingTop: 26, width: 560 }}>
          <Kicker text="REAL RUN · WEB" />
          <div style={{ fontSize: 34, fontWeight: 700, lineHeight: 1.3, color: C.white }}>
            Agent 在真实环境里
            <br />
            自己选工具、自己跑完
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
            {TOOL_CHAIN.map((name, i) => {
              const start = 6 + i * 8;
              const state: 'running' | 'done' = t > start + 7 ? 'done' : 'running';
              return t >= start ? <ToolChip key={name} label={TOOL_LABELS[name] ?? name} state={state} delay={start * fps} /> : null;
            })}
          </div>
          <div style={{ marginTop: 6 }}>
            <Badge text="真实模型 · 真实联网抓取" tone="teal" />
          </div>
          <div style={{ marginTop: 'auto', fontFamily: F.mono, fontSize: 13, letterSpacing: 2, color: 'rgba(255,255,255,.34)' }}>
            {`SCENE 03 / ${SCENES.webAgent / fps}s`}
          </div>
        </div>
      </AbsoluteFill>
      <Caption cues={WEB_CAPTIONS} />
    </AbsoluteFill>
  );
};
