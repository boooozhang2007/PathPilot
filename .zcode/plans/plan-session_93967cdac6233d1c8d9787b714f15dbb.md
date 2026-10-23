# PathPilot AI 实施计划（基于 Pi 框架）：架构 → 后端/Web → Android → 可安装 APK

## 背景与已确认决策

- 仓库现状：仅 PRD.md + 2 个静态设计稿（`frontend/index.html` Web 7 页 / `app.html` 手机 5 Tab，含完整设计 token），所有代码从零搭建；`pi/` 为 Pi 框架源码 checkout（npm 上已有同版本 1.4.0，作参考用，gitignore）
- 已确认：**SQLite + JWT 自包含**；**LLM 走 Pi 框架接 OpenAI 兼容 API**（GLM/DeepSeek 可配）；**岗位数据来自真实招聘网站搜索工具**（+手动粘贴+预置真实样本兜底，来源全部标注）；**先本地运行**
- 环境：Node 24.21 ✓ / JDK 17 ✓ / Android SDK（build-tools 36 + cmdline-tools + platform-tools）✓，需补装 `platforms;android-36`

## Pi 框架集成方式（本次核心更新）

经深入调研 `D:\Projects\PathPilot\pi`（v1.4.0），集成方案确定为**进程内嵌入**：

- 依赖 `@earendil-works/pi-agent-core@1.4.0` + `@earendil-works/pi-ai@1.4.0`（npm 安装，ESM-only，Node≥22.19）
- 后端 `AgentService` 用 Pi 的 `Agent` 类跑「LLM↔工具调用」循环；PRD §6.3 的十个工具（search_jobs / fetch_job_page / extract_requirements / normalize_skills / get_user_profile / get_current_roadmap / generate_roadmap / validate_roadmap / save_roadmap_version / update_task_status）实现为 `AgentTool`（TypeBox 参数 schema），内部只调我们自己的 services 层——**满足 PRD「Agent 不得绕过业务 API 改库」**，Pi 专用代码隔离在 `src/agent/pi/` 目录
- LLM Provider：`AGENT_PROVIDER=zhipu|deepseek|custom` + `AGENT_BASE_URL` + `AGENT_API_KEY` + `AGENT_MODEL` 环境变量；DeepSeek 用内置 provider，GLM 用 `openAICompletionsApi` 自定义 provider（pi-ai 自动识别 bigmodel.cn 兼容层）；**未配 key 自动降级规则引擎**，响应标注引擎来源
- 安全与限制（PRD 6.6）：`finishTurn` 钩子计工具调用次数上限、`agent.abort()` 实现墙钟超时、工具 `execute` 收 `AbortSignal`；默认不注册任何 Shell/文件工具
- 结构化输出（PRD 6.4）：让模型调用带 schema 的提交工具产出 JSON → Zod 边界校验 → 非法重试≤2 次仍败则报错不落库；`fauxProvider` 支撑无网络单测

## 一、总体架构（npm workspaces 单仓三端）

```
PathPilot/
├── PRD.md / ARCHITECTURE.md / README.md / .env.example
├── design/                      # 原 HTML 设计稿移入
├── pi/                          # Pi 源码参考（gitignore）
├── packages/shared/             # @pathpilot/shared：TS 类型 + Zod schema + 错误码/枚举
├── apps/server/                 # Fastify(ESM) + TS 后端，Web/App 共用唯一 API
│   └── src/
│       ├── db/                  # Drizzle schema（PRD §8 十表 + users + agent_chat_messages）+ 迁移入库 + seed
│       ├── auth/                # bcrypt + jose JWT（Bearer）
│       ├── routes/              # PRD §9 全部端点，统一错误 {error:{code,message}}
│       ├── services/            # 确定性业务逻辑（单测核心）：归一化/频次/匹配度/时间预算/规划校验/版本差异
│       └── agent/
│           ├── core/            # AgentService：六业务接口（analyzeJobs/analyzeSkillGap/generateRoadmap/reviseRoadmap/answerCareerQuestion/generateResumeDraft）
│           ├── pi/              # Pi 集成层：Agent 构建、provider 注册、TypeBox 工具定义、超时/次数限制
│           ├── tools/           # 工具实现（调 services）：真实招聘源抓取（超时+parse_status）、JD 粘贴、预置样本
│           └── rules/           # 无 key 降级的规则引擎（任务库+依赖图+预算裁剪）
│   └── data/pathpilot.db        # SQLite（gitignore）
├── apps/web/                    # Next.js 15 App Router + Tailwind + ECharts（复刻设计稿 7 页 + 登录）
└── apps/mobile/                 # Expo + expo-router（5 Tab + 登录 + 服务器地址设置）
```

关键决策：三端一后端、正式数据以服务端为准（PRD 5.3）；service 层强制 `user_id` 过滤（等价 RLS）；规划版本不可变（parent_version_id 链，重规划保留已完成任务）；任务乐观锁（updated_at 冲突返回 409）；错误码覆盖 PRD 7.4 八类；岗位统计只基于成功解析样本、sample_count 如实展示、绝不编造。

## 二、实施步骤

### 阶段 1：架构与脚手架
- `ARCHITECTURE.md`（模块图、Pi 集成设计、数据流、API 契约、DB ER、安全与降级策略）+ workspaces 初始化 + `packages/shared`（含 PRD §6.4 全字段 Zod schema）+ 设计稿移入 `design/` + 提交 PRD

### 阶段 2：后端（含 Pi Agent 层）
1. Drizzle schema + 迁移 + seed（skills 别名词典、演示账号、预置真实岗位样本——开发期联网采集附真实链接）
2. 认证四端点 + JWT 中间件
3. profile / skills / experiences CRUD
4. 确定性服务 + vitest：归一化（保留原始词条）、频次统计、加权匹配度、时间预算计算与裁剪、规划结构校验+依赖检查、版本管理与差异
5. **Pi Agent 层**：provider 注册（GLM/DeepSeek）+ Agent 构建 + 十工具 + 超时/次数限制 + agent_runs 记录；`fauxProvider` 单测
6. 岗位分析流水线：`POST /api/jobs/analyze` 异步 run + 状态查询；搜索 provider 实测真实可达招聘源（来源链接、content_hash、parse_status）
7. 规划生成/重规划：LLM 通道（Pi Agent）+ 规则引擎降级双通道；已完成任务保留；差异对比
8. 任务管理（状态机、实际投入、成果、乐观锁）
9. AI 顾问 chat：Pi 多轮会话，`AgentMessage[]` 按 JSON 持久化到库，读取授权上下文
10. vitest 覆盖 PRD 13.8 全部七项

### 阶段 3：Web（加载 frontend-skill）
按设计稿复刻：登录/注册、Dashboard、岗位洞察（频次柱状/分类/学历经验分布 ECharts）、成长路线时间轴、动态规划（重规划+版本对比）、能力档案（雷达）、任务看板、AI 顾问；全部接真实 API。

### 阶段 4：Android（加载 android-dev）
Expo + expo-router 复刻 app.html：5 Tab + 登录 + 「我的」内服务器地址设置（默认 `10.0.2.2`/局域网 IP）；react-native-svg 轻量图表；失败明确显示未同步。

### 阶段 5：APK 打包（最终交付）
1. sdkmanager 补装 `platforms;android-36`
2. `npx expo prebuild -p android`（必要时配 Gradle/Maven 国内镜像）
3. keytool 生成 keystore（自动脚本，gitignore）
4. `gradlew assembleRelease` → **`dist/PathPilot-v1.0.apk`**
5. 验证：有真机则 `adb install` 实测；否则 apksigner 校验签名与结构

### 阶段 6：验收
对照 PRD §15 总表逐项跑通（注册登录/真实样本岗位分析/归一化频次/档案/分学期规划/时间变化重规划/已完成任务保留/版本历史/Web↔App 一致/图表真实数据/错误处理）；README 写清启动方式、`.env` 配置（LLM key 可选）、APK 安装说明。

## 交付物
1. `ARCHITECTURE.md` + 三端完整可运行代码 + 迁移 + 测试
2. **可直接安装的 `dist/PathPilot-v1.0.apk`**（release 签名）
3. 无 LLM key 时规则引擎保证全流程可演示；配 key（GLM/DeepSeek）后自动切换 Pi Agent 通道