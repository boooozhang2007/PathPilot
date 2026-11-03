// 用一条外部音轨替换成片的音轨：只重混（画面直拷），不重编码，几秒完成。
// 用法: node promo/tools/replace-audio.mjs <音频文件> [音量系数=0.6] [成片路径]
// 例：  node promo/tools/replace-audio.mjs ~/Music/bgm.mp3 0.7
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const FFMPEG = process.env.FFMPEG ?? path.join(process.env.LOCALAPPDATA ?? '', 'Microsoft', 'WinGet', 'Links', 'ffmpeg.exe');
const FFPROBE = process.env.FFPROBE ?? FFMPEG.replace(/ffmpeg(\.exe)?$/i, (m) => (m.toLowerCase().endsWith('.exe') ? 'ffprobe.exe' : 'ffprobe'));

const audio = process.argv[2];
if (!audio) throw new Error('用法: node promo/tools/replace-audio.mjs <音频文件> [音量系数] [成片路径]');
const volume = Number(process.argv[3] ?? 0.6);
const video = process.argv[4] ?? path.join(root, 'promo', 'out', 'pathpilot-promo.mp4');

if (!fs.existsSync(audio)) throw new Error(`找不到音频文件：${audio}`);
if (!fs.existsSync(video)) throw new Error(`找不到成片：${video}`);
if (!fs.existsSync(FFMPEG)) throw new Error(`找不到 ffmpeg：${FFMPEG}（可用 FFMPEG 环境变量覆盖）`);

const raw = execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', video]).toString().trim();
const duration = Number(raw);
if (!Number.isFinite(duration) || duration <= 0) throw new Error(`读不出成片时长：${raw}`);

const fadeStart = Math.max(0, duration - 3);
const out = `${video}.tmp.mp4`;
execFileSync(
  FFMPEG,
  ['-y', '-hide_banner', '-loglevel', 'warning', '-i', video, '-i', audio,
   '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
   '-af', `volume=${volume},afade=t=out:st=${fadeStart.toFixed(2)}:d=3`,
   '-shortest', '-movflags', '+faststart', out],
  { stdio: 'inherit' },
);
fs.renameSync(out, video);
console.log(JSON.stringify({ video, audio, volume, duration: Number(duration.toFixed(2)) }, null, 2));
