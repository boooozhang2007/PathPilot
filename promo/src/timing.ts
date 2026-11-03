export const FPS = 30;
export const VIDEO_WIDTH = 1920;
export const VIDEO_HEIGHT = 1080;

/** 各场景帧数：按真实录屏长度校准（web 录制约 30 秒，实际有效画面 14 秒） */
export const SCENES = {
  intro: 6 * FPS,
  problem: 6 * FPS,
  webAgent: 19 * FPS,
  appAgent: 18 * FPS,
  outro: 11 * FPS,
} as const;

export const TOTAL_FRAMES = Object.values(SCENES).reduce((sum, v) => sum + v, 0);

/** 真实录屏素材的裁剪与节奏；hasBezel：素材里是否已经带手机外框 */
export const FOOTAGE = {
  web: { file: 'media/web-agent.mp4', startFrom: 0, playbackRate: 0.6 },
  app: { file: 'media/app-agent.mp4', startFrom: 0, playbackRate: 1, hasBezel: true },
} as const;
