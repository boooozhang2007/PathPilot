import type { FC } from 'react';
import { AbsoluteFill, interpolate, OffthreadVideo, staticFile, useCurrentFrame } from 'remotion';
import { Caption, GridBackdrop, Kicker, Stat } from '../components/frames';
import { C, F } from '../tokens';
import { FOOTAGE } from '../timing';
import { APP_CAPTIONS, STATS } from '../data';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/**
 * 移动端场景。画面来自设计稿页面驱动录制（本机无真机/模拟器），
 * 所以不按“真机录屏”表述；录屏里已包含手机外框，这里直接展示不再套一层。
 */
export const AppAgent: FC = () => {
  const frame = useCurrentFrame();
  const phoneIn = interpolate(frame, [0, 24], [0, 1], clamp);
  const width = 440;
  return (
    <AbsoluteFill>
      <GridBackdrop tint={0.05} />
      <AbsoluteFill style={{ flexDirection: 'row', alignItems: 'center', padding: '0 140px', gap: 80 }}>
        <div
          style={{
            width,
            height: (width / 390) * 844,
            borderRadius: 28,
            overflow: 'hidden',
            opacity: phoneIn,
            transform: `translateY(${(1 - phoneIn) * 50}px)`,
            boxShadow: '0 44px 100px -34px rgba(0,0,0,.85), 0 0 120px -40px rgba(232,81,42,.28)',
          }}
        >
          <OffthreadVideo
            src={staticFile(FOOTAGE.app.file)}
            startFrom={FOOTAGE.app.startFrom}
            playbackRate={FOOTAGE.app.playbackRate}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 720 }}>
          <Kicker text="MOBILE UI · 设计还原" />
          <div style={{ fontSize: 46, fontWeight: 800, lineHeight: 1.24, color: C.white }}>
            同一个 Agent，
            <br />
            在手机上也是完整能力
          </div>
          <div style={{ fontSize: 22, lineHeight: 1.9, color: '#9FB4C9' }}>
            对话、工具进度、结果卡片与 Web 端一致，
            <br />
            任务与规划的改动在两端口径相同。
          </div>
          <div style={{ display: 'flex', gap: 40, marginTop: 10 }}>
            {STATS.map((s, i) => (
              <Stat key={s.l} value={s.v} label={s.l} delay={18 + i * 8} />
            ))}
          </div>
          <div style={{ fontFamily: F.mono, fontSize: 13, letterSpacing: 2, color: 'rgba(255,255,255,.32)' }}>
            ANDROID · MIN SDK 24 · 正式签名 APK
          </div>
        </div>
      </AbsoluteFill>
      <Caption cues={APP_CAPTIONS} />
    </AbsoluteFill>
  );
};
