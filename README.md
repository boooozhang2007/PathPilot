# PathPilot AI

面向计算机专业大学生的 AI 职业成长规划与能力管理平台 —— 以岗位证据为依据、以个人成长记录为基础、以可执行行动计划为核心。

```
岗位需求采集 → 技能分析 → 能力差距分析 → 四年成长规划 → 每周行动 → 进度记录 → 动态调整
```

- **Web 端**（Next.js）：`http://localhost:3001`
- **Android App**（Expo/React Native）：安装 `dist/PathPilot-v1.0.apk`
- **统一后端**（Fastify + SQLite + Pi Agent）：`http://localhost:3000`，三端共享同一数据库

## 快速开始

```bash
npm install                 # 安装全部工作区依赖（Node ≥ 22.19）
npm run dev:server          # 启动后端 :3000（首次自动迁移 + seed）
npm run dev:web             # 启动 Web  :3001
```

演示账号：`demo@pathpilot.ai` / `demo123456`

**Android**：安装 `dist/PathPilot-v1.0.apk`（或用 `apps/mobile` 自行构建，见下文）。真机使用时在 App 登录页或「我的 → 服务器地址」填电脑局域网 IP（如 `http://192.168.x.x:3000`），模拟器用默认 `http://10.0.2.2:3000`。

## 环境配置

复制 `.env.example` 为 `apps/server/.env`：

| 变量 | 说明 |
|---|---|
| `JWT_SECRET` | 认证密钥（生产必改） |
| `AGENT_PROVIDER` | `zhipu`（GLM）/ `deepseek` / `custom` |
| `AGENT_BASE_URL` | OpenAI 兼容端点（默认智谱 `https://open.bigmodel.cn/api/paas/v4`） |
| `AGENT_API_KEY` | **可选**。不配置自动降级规则引擎，全流程照常可演示；配置后启用 Pi Agent LLM 通道 |
| `AGENT_MODEL` | 如 `glm-4.6` / `deepseek-chat` |
| `TAVILY_API_KEY` | **可选**。配置后启用实时联网岗位搜索 |

## 架构（摘要）

```
apps/server   Fastify(ESM) · Drizzle+SQLite · JWT · Pi Agent(@earendil-works/pi-agent-core v1.4)
              ├─ 确定性业务：技能归一化/频次统计/加权匹配度/时间预算/规划校验/版本管理
              ├─ Agent 层：Pi LLM 通道 ⇄ 规则引擎降级（响应标注 engine 来源）
              └─ 岗位数据：联网搜索(Tavily/必应) → 预置真实样本库 → 手动粘贴（来源全部如实标注）
apps/web      Next.js 15 · 8 页面 · ECharts · 复刻 design/ 设计系统
apps/mobile   Expo SDK 58 · expo-router · 5 Tab · 服务器地址可配 · react-native-svg
packages/shared 三端共享 TS 类型 + Zod schema + 枚举
```

详见 [ARCHITECTURE.md](./ARCHITECTURE.md)（模块图 / DB ER / API 契约 / 安全与降级策略）与 [PRD.md](./PRD.md)。

## 数据可信度规则（PRD 核心）

- 技能频次只基于成功解析的真实岗位样本统计，`sample_count` 如实展示
- 搜索失败自动回退预置真实样本库（23 条，开发期联网采集、附原始链接）或手动粘贴，来源类型全部标注
- 匹配度 = Σ(要求权重 × 满足系数) / Σ(要求权重)，透明可解释，不代表就业概率
- AI 通道输出必须通过 Zod 结构校验 + 时间预算校验才落库；失败不覆盖旧规划
- 已完成任务在重规划时永远保留；规划版本不可变（parent 链可追溯）

## 测试

```bash
npm test    # vitest：归一化/时间预算/规划校验/匹配度/数据权限/版本保存/任务乐观锁/跨端读取
```

## Android APK 构建

```bash
cd apps/mobile
npx expo prebuild -p android --no-install   # 生成 android/（首次）
cd android
# 签名：keystore.properties + pathpilot.keystore 已配置（app/build.gradle 已接 release 签名）
./gradlew assembleRelease
# 产物 → android/app/build/outputs/apk/release/app-release.apk
```

> `android/` 目录被 gitignore（由 prebuild 生成）。重跑 prebuild 后需重新应用 `app/build.gradle` 的 release 签名块（见 `scripts/android-signing.gradle.md` 或直接参考本文件历史）。

## 目录

```
ARCHITECTURE.md  PRD.md  design/           # 架构 / 需求 / 高保真设计稿
apps/server      后端（API 文档见 ARCHITECTURE §4）
apps/web         Web 端
apps/mobile      Android 端
packages/shared  共享类型与校验
dist/            PathPilot-v1.0.apk
```
