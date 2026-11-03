# PathPilot 宣传片（Remotion + 真实录屏）

重点演示 **Agent（AI 顾问）能力**。片中的 Web Agent 画面是本地真实运行的录屏，不是画出来的假界面。

## 素材真实性

| 素材 | 来源 | 说明 |
| --- | --- | --- |
| Web 端 Agent 画面 | **本地真实运行录屏** | `localhost:3001/advisor`，真实模型 + 真实岗位数据；录屏里能看到真实工具调用与流式回复 |
| 移动端画面 | `design/app.html` 设计稿页面驱动的界面录制 | 本机没有连接真机、也没有安装模拟器（Expo Web 端在本机渲染不出内容），所以片中标注为「移动端界面 · 设计还原」，不按真机录屏表述。换真机录屏见下方「换成真机录屏」 |
| 音轨 | `promo/tools/make_bed.py` 合成的配乐（I–vi–IV–V 垫底 + 铃铛琶音 + 低频脉冲，60 秒） | 想换正式配乐：`node promo/tools/replace-audio.mjs <音频文件>`，只重混音轨、不重编码画面 |
| 图形与字幕 | Remotion 合成（`promo/src/`） | 深墨蓝底 + 橙色点缀，与产品设计令牌一致 |

## 目录

```
promo/
├─ src/                  Remotion 工程
│  ├─ timing.ts          各场景帧数、录屏裁剪与播放倍速
│  ├─ data.ts            字幕文案与统计数字（数字来自本仓库实测）
│  ├─ tokens.ts          设计令牌（与 design/app.html 一致）
│  └─ scenes/            Intro / Problem / WebAgent / AppAgent / Outro
├─ public/
│  ├─ media/             真实素材（web-agent.mp4、app-agent.mp4）
│  └─ audio/bed.wav      音床
├─ raw/                  录制中间产物（帧序列，可删）
├─ tools/
│  ├─ dev-api.mjs        起隔离的演示后端（独立 SQLite + 演示账号 + CORS）
│  ├─ capture.mjs        Web 端真实页面录制（自动预热、失败重录）
│  ├─ capture-design.mjs 移动端界面录制（驱动 design/app.html）
│  ├─ frames-to-mp4.mjs  帧序列 → mp4（保持真实时序）
│  └─ make_bed.py        生成环境音垫
└─ out/                  渲染产物
```

## 依赖

- Node 22+（本机 24）、系统 Chrome（`C:/Program Files/Google/Chrome/Application/chrome.exe`）
- ffmpeg（本机用 winget 装的 `Gyan.FFmpeg`，可用 `FFMPEG` 环境变量覆盖）
- `cd promo && npm install`（remotion 4.0.x、react 19、playwright-core）

## 重做一遍

1. 起演示后端（独立库 `apps/server/data/promo.db`，内置演示账号 `demo@pathpilot.ai / demo123456`，端口 3000）：

```bash
node promo/tools/dev-api.mjs
```

2. 起 Web 界面（端口 3001）：

```bash
npm run dev -w @pathpilot/web
```

3. 录 Web 端真实画面（秒数自定；脚本会先调 API 预热，录完检查页面里有没有「本次回复未完成」之类的失败提示，失败自动重录，最多 3 次）：

```bash
node promo/tools/capture.mjs web 30
```

4. 录移动端界面（可选，走设计稿页面）：

```bash
node promo/tools/capture-design.mjs 22
```

5. 帧序列合成 mp4（直接覆盖 Remotion 使用的素材）：

```bash
node promo/tools/frames-to-mp4.mjs web
```

```bash
node promo/tools/frames-to-mp4.mjs app
```

6. 渲染成片（`out/pathpilot-promo.mp4`，1920×1080）：

```bash
cd promo && npm run render
```

更快的草稿（半分辨率）：

```bash
cd promo && npm run draft
```

预览与调参：`cd promo && npm run studio`

## 几个坑（都踩过）

- **模型选择（关键）**：演示后端用的是 `provider=custom`。实测结论（2026-11-04，网关 `api.070320.xyz`）：
  - `kimi-k3`：工具型提问两次都跑通，最终用这个；
  - `glm-5.3`：时好时坏；
  - `deepseek-v4.1-flash`：一度稳定，后来全部 `Request timed out`；
  - `claude-*`：`403 用户额度不足`；`grok-4.6`：`model_not_found`；`*-flash` 系多数模型 id 直接超时。
  - 用 `provider=deepseek`（而不是 `custom`）时 pi-ai 会带上思考参数，网关必超时：所以配置里必须是 `custom`。
  - 线上服务（`pathpilot.070320.xyz`）的模型调用当前正常（实测 2.5 秒返回），本地网关抽风时可以改指向线上做对照。
- **网关波动**：同一句提问约 1/3～2/3 概率报 `Request timed out`，所以录制脚本内置预热与重录，失败时先 `node promo/tools/capture.mjs web 30` 重跑。
- **引导遮罩**：Web 端首次进入会弹产品引导层（`z-[80]` 全屏遮罩），脚本会注入 CSS 隐藏并在点击时用 `force`，否则点击会被拦截。
- **录屏出帧规律**：CDP screencast 只在画面变化时出帧，静态页面几乎没有帧；所以 `timing.ts` 里的场景时长要与素材实际时长对齐（素材比场景短时，播完就没有画面了），必要时调 `FOOTAGE.*.playbackRate`。
- **APK 签名**：发布包必须补签 v1 签名（见仓库根 `README.md` 的发布注意）。

## 交付校验记录（2026-11-04）

- 成片：`out/pathpilot-promo.mp4`，60.00 秒 / 1920×1080 / 30fps / H.264 + AAC 立体声。
- 整片完整解码无错误：`ffmpeg -v error -i out/pathpilot-promo.mp4 -f null -` 没有任何输出。
- 三版（默认 pad / piano / rhythm）视频流完全一致，`ffmpeg -map 0:v:0 -c copy -f md5 -` 均为
  `7c7f4732478b4dd9f2f366f905083361`，证明换配乐只重混音轨、画面没有被重新编码。
- 音轨电平：默认版 mean -16.6 dB / max -2.0 dB；配乐文件峰值 0.88，首 1.5 秒淡入、末 5 秒淡出。
- 素材真实性：Web 段是本地真实运行录屏（真实模型 + 真实岗位数据，画面含「已深度思考」与工具链）；
  移动端段由 `design/app.html` 驱动录制，片中标注「MOBILE UI · 设计还原」，不以真机录屏表述。

## 换配乐的两种方式

1. 现成音频（剪映导出的音乐、无版权素材库下载的曲子等）：

```bash
node promo/tools/replace-audio.mjs <音频文件> 0.9
```

2. 重新生成合成配乐（三种风格）：

```bash
BED_STYLE=piano python promo/tools/make_bed.py 60 promo/public/audio/bed.wav
```

## 换成真机录屏（移动端 18 秒）

1. 手机开 USB 调试并连上，装好 APK、登录演示账号，停在 AI 顾问页：

```bash
adb devices
```

2. 开始录制，然后在手机上正常操作（提问、切页面）：

```bash
adb shell screenrecord --time-limit 25 /sdcard/pp-promo.mp4
```

3. 拉回本地并覆盖素材：

```bash
adb pull /sdcard/pp-promo.mp4 promo/public/media/app-agent.mp4
```

4. 把 `promo/src/timing.ts` 里 `FOOTAGE.app.hasBezel` 改成 `false`（真机录屏没有手机外框，
   场景会自动套上 `PhoneFrame`），按实际时长调整 `SCENES.appAgent`，然后：

```bash
cd promo && npm run render
```
