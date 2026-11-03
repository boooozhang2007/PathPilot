// 移动端界面录制：本机没有真机/模拟器，Expo Web 端又渲染不出来，
// 改用设计稿页面 design/app.html（与移动端实现同一套设计令牌）驱动界面，录进手机尺寸。
// 为了让画面有足够多的变化（screencast 只在画面变化时出帧），脚本会走一遍主要页面。
// 片中会如实标注为「移动端界面 · 设计还原」；换成真机录屏时替换 public/media/app-agent.mp4 即可。
// 用法: node promo/tools/capture-design.mjs [秒数]
// 产物: promo/raw/app/f*.jpg + frames.txt（供 frames-to-mp4.mjs app 使用）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PAGE = path.join(root, 'design', 'app.html').replace(/\\/g, '/');
const ASK = '我现在最该学什么？';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const seconds = Number(process.argv[2] ?? 22);
  const outDir = path.join(root, 'promo', 'raw', 'app');
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const viewport = { width: 390, height: 844 };
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: [`--window-size=${viewport.width},${viewport.height + 140}`, '--hide-scrollbars'],
  });
  const context = await browser.newContext({ viewport, locale: 'zh-CN', timezoneId: 'Asia/Shanghai' });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);

  const frames = [];
  let capturing = false;
  cdp.on('Page.screencastFrame', (event) => {
    if (!capturing) {
      void cdp.send('Page.screencastFrameAck', { sessionId: event.sessionId });
      return;
    }
    const file = `f${String(frames.length).padStart(5, '0')}.jpg`;
    fs.writeFileSync(path.join(outDir, file), Buffer.from(event.data, 'base64'));
    frames.push({ file, t: Date.now() });
    void cdp.send('Page.screencastFrameAck', { sessionId: event.sessionId });
  });

  const tab = (name) => page.evaluate((t) => { if (typeof window.switchTab === 'function') window.switchTab(t); }, name);

  console.log('[capture-design] 打开设计稿页面:', PAGE);
  await page.goto(`file:///${PAGE}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#tabbar', { timeout: 30000 });
  await page.addStyleTag({
    content:
      '.show{display:none!important}' +
      '.stage{gap:0!important;padding:0!important;justify-content:center!important;align-items:flex-start!important}' +
      '.phone{height:844px!important;min-height:0!important;width:390px!important}',
  });
  await tab('home');
  await sleep(1200);
  console.log('[capture-design] 页面标题:', await page.title());

  console.log('[capture-design] 开始录屏…');
  const t0 = Date.now();
  capturing = true;
  await cdp.send('Page.startScreencast', {
    format: 'jpeg', quality: 92,
    maxWidth: viewport.width, maxHeight: viewport.height, everyNthFrame: 1,
  });

  // 1) AI 顾问：问一句，等回复出现
  await tab('advisor');
  await sleep(900);
  await page.click('#aInput');
  await page.type('#aInput', ASK, { delay: 90 });
  await sleep(600);
  await page.click('.chat-bar button');
  await sleep(3200);

  // 2) 依次走过主要页面，让画面持续有变化
  await tab('home');
  await sleep(1800);
  await tab('roadmap');
  await sleep(2000);
  await tab('tasks');
  await sleep(2000);
  await tab('advisor');
  await sleep(2200);
  await tab('me');
  await sleep(2000);
  await tab('home');
  await sleep(1600);

  await sleep(Math.max(0, seconds * 1000 - (Date.now() - t0)));
  await cdp.send('Page.stopScreencast');
  capturing = false;
  await browser.close();

  const lines = [];
  for (let i = 0; i < frames.length; i += 1) {
    const next = i + 1 < frames.length ? frames[i + 1].t : frames[i].t + 33;
    const duration = Math.max(0.008, Math.min(1.2, (next - frames[i].t) / 1000));
    lines.push(`file '${frames[i].file}'`, `duration ${duration.toFixed(3)}`);
  }
  if (frames.length) lines.push(`file '${frames[frames.length - 1].file}'`);
  fs.writeFileSync(path.join(outDir, 'frames.txt'), `${lines.join('\n')}\n`);

  const realSeconds = frames.length ? (frames[frames.length - 1].t - frames[0].t) / 1000 : 0;
  console.log(JSON.stringify({ target: 'app', frames: frames.length, realSeconds: Number(realSeconds.toFixed(2)), dir: outDir }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
