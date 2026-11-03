// 真实画面录制：驱动系统 Chrome，用 CDP screencast 逐帧抓真实页面，再用 ffmpeg 合成 mp4。
// 用「注入登录态」直接进页面，录屏里不出现登录过程；模型网关偶发超时，所以先预热、录完检查
// 页面里有没有失败提示，失败就自动重录（最多 3 次）。
// 用法: node promo/tools/capture.mjs web|app [目标秒数]
// 产物: promo/raw/<target>/f*.jpg + frames.txt（每帧带真实时长，保持真实时序）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const API = 'http://localhost:3000';

const DEMO = { email: 'demo@pathpilot.ai', password: 'demo123456', nickname: '演示同学' };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const WEB_ASK = '我现在最该学什么？给出优先级，简短分点';
const APP_ASK = '我现在最该补什么？';
/** 产品引导层：先在 localStorage 打标记，再用 CSS 兜底隐藏 */
const TOUR_KEY = null;
const OVERLAY_CSS = 'div.fixed.inset-0[class*="z-["]{display:none!important}';

const FAILURE_MARKERS = ['本次回复未完成', '模型调用失败', '回复未完成'];

async function demoToken() {
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: DEMO.email, password: DEMO.password }),
  });
  if (!res.ok) throw new Error(`演示账号登录失败: ${res.status}`);
  const data = await res.json();
  const token = data.token ?? data?.data?.token;
  if (!token) throw new Error(`未识别的登录返回结构: ${Object.keys(data).join(',')}`);
  return token;
}

/** 先用 API 预热：网关偶发超时，先把它叫醒再录屏 */
async function warmUp(token, attempts = 2) {
  for (let i = 1; i <= attempts; i += 1) {
    const started = Date.now();
    try {
      const res = await fetch(`${API}/api/agent/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: WEB_ASK }),
      });
      const text = await res.text();
      const ok = text.includes('"type":"text"') && !text.includes('"type":"error"');
      console.log(`[warmup] 第 ${i} 次 ${ok ? '成功' : '失败'} ${((Date.now() - started) / 1000).toFixed(1)}s`);
      if (ok) return true;
    } catch (error) {
      console.log(`[warmup] 第 ${i} 次异常 ${String(error).slice(0, 120)}`);
    }
  }
  console.log('[warmup] 预热未成功，仍然尝试录制');
  return false;
}

/** 产品引导层（高层级全屏遮罩）会拦截点击，先移除 */
async function dismissOverlays(page) {
  await page.addStyleTag({ content: OVERLAY_CSS });
  await page.evaluate(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    document.querySelectorAll('div').forEach((el) => {
      const z = Number(getComputedStyle(el).zIndex);
      const box = el.getBoundingClientRect();
      if (z >= 60 && box.width > vw * 0.8 && box.height > vh * 0.8) {
        el.style.display = 'none';
        el.style.pointerEvents = 'none';
      }
    });
  });
  for (const name of [/跳过/, /知道了/, /开始使用/, /关闭/]) {
    const btn = page.getByRole('button', { name }).first();
    if (await btn.count().catch(() => 0)) {
      await btn.click({ timeout: 2000 }).catch(() => {});
      await sleep(300);
    }
  }
}

const TARGETS = {
  web: {
    viewport: { width: 1440, height: 900 },
    url: 'http://localhost:3001/advisor',
    ready: 'textarea',
    async act(page) {
      const box = 'textarea[placeholder="输入你的问题或指令…"]';
      await page.click(box, { force: true });
      await page.type(box, WEB_ASK, { delay: 55 });
      await sleep(500);
      await page.click('button[title="发送"]', { force: true });
    },
  },
  app: {
    viewport: { width: 390, height: 844 },
    url: 'http://localhost:8081/advisor',
    ready: 'input, textarea',
    async act(page) {
      const box = page.locator('[placeholder="输入消息…"], input, textarea').last();
      await box.click();
      await page.keyboard.type(APP_ASK, { delay: 75 });
      await sleep(400);
      await page.keyboard.press('Enter');
    },
  },
};

async function recordOnce({ cfg, token, seconds, outDir, attempt }) {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: [`--window-size=${cfg.viewport.width},${cfg.viewport.height + 140}`, '--hide-scrollbars'],
  });
  const context = await browser.newContext({ viewport: cfg.viewport, locale: 'zh-CN', timezoneId: 'Asia/Shanghai' });
  await context.addInitScript(
    ([base, auth, nickname, tourKey]) => {
      localStorage.setItem('pp_api_base', base);
      localStorage.setItem('pp_token', auth);
      localStorage.setItem('pp_nickname', nickname);
      localStorage.setItem('pp_theme', 'light');
      if (tourKey) localStorage.setItem(tourKey, '1');
    },
    [API, token, DEMO.nickname, TOUR_KEY],
  );

  const page = await context.newPage();
  page.on('pageerror', (error) => console.log('[pageerror]', String(error).slice(0, 200)));
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

  await page.goto(cfg.url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForSelector(cfg.ready, { timeout: 120000 });
  await sleep(900);
  await dismissOverlays(page);

  // 会话列表在页面挂载时拉取，所以预热产生的会话不会出现在这次录屏里
  await warmUp(token, attempt === 1 ? 1 : 2);

  console.log(`[capture] 第 ${attempt} 次录制开始`);
  const t0 = Date.now();
  capturing = true;
  await cdp.send('Page.startScreencast', {
    format: 'jpeg', quality: 92,
    maxWidth: cfg.viewport.width, maxHeight: cfg.viewport.height, everyNthFrame: 1,
  });

  await cfg.act(page);
  await sleep(Math.max(0, seconds * 1000 - (Date.now() - t0)));

  await cdp.send('Page.stopScreencast');
  capturing = false;

  const pageText = await page.evaluate(() => document.body.innerText || '').catch(() => '');
  await browser.close();

  const failed = FAILURE_MARKERS.some((marker) => pageText.includes(marker));
  const realSeconds = frames.length ? (frames[frames.length - 1].t - frames[0].t) / 1000 : 0;
  return { frames, failed, realSeconds };
}

async function main() {
  const target = process.argv[2] ?? 'web';
  const seconds = Number(process.argv[3] ?? 45);
  const cfg = TARGETS[target];
  if (!cfg) throw new Error(`未知目标: ${target}`);

  const outDir = path.join(root, 'promo', 'raw', target);
  const token = await demoToken();

  let result = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    fs.rmSync(outDir, { recursive: true, force: true });
    fs.mkdirSync(outDir, { recursive: true });
    result = await recordOnce({ cfg, token, seconds, outDir, attempt });
    console.log(`[capture] 第 ${attempt} 次结果: frames=${result.frames.length} 时长=${result.realSeconds.toFixed(1)}s 失败标记=${result.failed}`);
    if (!result.failed && result.frames.length > 10) break;
    if (attempt < 3) {
      console.log('[capture] 这次录屏里出现失败提示，重录…');
      await sleep(2000);
    }
  }

  if (!result || result.failed || result.frames.length <= 10) {
    console.log('[capture] 三次都没录到干净画面，请检查模型网关后重试');
    process.exit(2);
  }

  const lines = [];
  for (let i = 0; i < result.frames.length; i += 1) {
    const next = i + 1 < result.frames.length ? result.frames[i + 1].t : result.frames[i].t + 33;
    const duration = Math.max(0.008, Math.min(1.2, (next - result.frames[i].t) / 1000));
    lines.push(`file '${result.frames[i].file}'`, `duration ${duration.toFixed(3)}`);
  }
  lines.push(`file '${result.frames[result.frames.length - 1].file}'`);
  fs.writeFileSync(path.join(outDir, 'frames.txt'), `${lines.join('\n')}\n`);

  console.log(JSON.stringify({ target, frames: result.frames.length, realSeconds: Number(result.realSeconds.toFixed(2)), dir: outDir }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
