// 把 capture.mjs 产出的帧序列合成为 mp4（保留真实时序，输出 30fps CFR）
// 用法: node promo/tools/frames-to-mp4.mjs web|app [输出路径]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const FFMPEG = process.env.FFMPEG ?? path.join(process.env.LOCALAPPDATA ?? '', 'Microsoft', 'WinGet', 'Links', 'ffmpeg.exe');

const target = process.argv[2] ?? 'web';
const dir = path.join(root, 'promo', 'raw', target);
const out = process.argv[3] ?? path.join(root, 'promo', 'public', 'media', `${target}-agent.mp4`);

const listPath = path.join(dir, 'frames.txt');
if (!fs.existsSync(listPath)) throw new Error(`缺少帧列表：${listPath}（先跑 capture.mjs）`);
if (!fs.existsSync(FFMPEG)) throw new Error(`找不到 ffmpeg：${FFMPEG}（可用 FFMPEG 环境变量覆盖）`);

execFileSync(
  FFMPEG,
  ['-y', '-hide_banner', '-loglevel', 'warning', '-f', 'concat', '-safe', '0', '-i', 'frames.txt',
   '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
   '-movflags', '+faststart', out],
  { cwd: dir, stdio: 'inherit' },
);

const size = fs.statSync(out).size;
console.log(JSON.stringify({ target, out, sizeMB: Number((size / 1024 / 1024).toFixed(2)) }, null, 2));
