# PathPilot AI 架构设计文档

版本：V1.0 ｜ 对应 PRD V1.0 ｜ 更新日期：2026-10-24

## 1. 系统概览

PathPilot AI 是「Web + Android 共享一个后端」的职业成长规划平台，核心闭环：

```
岗位需求采集 → 技能分析 → 能力差距分析 → 四年成长规划 → 每周行动 → 进度记录 → 动态调整
```

### 1.1 顶层架构图

```
┌──────────────────┐      ┌──────────────────┐
│   Web (Next.js)   │      │  Android (Expo)  │
│  apps/web :3001   │      │  apps/mobile     │
└────────┬─────────┘      └────────┬─────────┘
         │        HTTPS/JSON (Bearer JWT)       │
         └───────────────┬─────────────────────┘
                         ▼
         ┌───────────────────────────────────┐
         │  统一 API 后端  apps/server :3000  │
         │  Fastify (ESM, Node ≥22.19)       │
         │  ┌─────────────────────────────┐  │
         │  │ 路由层 routes/ (PRD §9)      │  │
         │  │ 认证 auth/ (JWT)            │  │
         │  │ 业务服务 services/ (确定性)  │  │
         │  │ Agent 层 agent/ (Pi 集成)    │  │
         │  └─────────────────────────────┘  │
         │  Drizzle ORM │ SQLite (data/*.db)  │
         └───────────────────────────────────┘
                         │ (可切换 PostgreSQL，仅改驱动配置)
                         ▼
                    SQLite / PostgreSQL
```

### 1.2 关键决策（对应 PRD 要求）

| 决策 | 选择 | 依据 |
|---|---|---|
| 单仓多端 | npm workspaces：`packages/shared` + `apps/server` + `apps/web` + `apps/mobile` | PRD 7.2「数据模型与 API 类型尽量共享」 |
| 后端形态 | 独立 Fastify 服务（PRD 允许 Next Route Handlers 或独立 Node API） | 三端一后端，App 可直连；独立部署灵活 |
| 数据库 | SQLite（自包含）→ 可切 PostgreSQL | PRD 7.1 注明「可根据账号与预算调整」；演示零外部依赖 |
| ORM | Drizzle ORM（schema 可移植，迁移 SQL 入库） | PRD 7.2「数据库迁移必须纳入代码仓库」 |
| 认证 | bcryptjs + jose JWT（Bearer），服务端强制 user_id 过滤（等价 RLS） | PRD 4.1/8.10 |
| Agent 框架 | **Pi（@earendil-works/pi-agent-core + pi-ai v1.4.0）进程内嵌入** | PRD 6「核心框架 Pi-Agent（通过适配层集成）」 |
| LLM | OpenAI 兼容：GLM(open.bigmodel.cn) / DeepSeek / 自定义 baseUrl | 用户确认 |
| 降级 | 无 API key 时自动切规则引擎，响应标注 `engine` | PRD 4.2「必须标明数据来源类型」 |
| Android 打包 | Expo prebuild → Gradle assembleRelease（本地 APK） | PRD 13.7 只要求可安装测试包 |

## 2. Pi Agent 集成设计（PRD §6）

### 2.1 包与运行方式

- 依赖：`@earendil-works/pi-agent-core@1.4.0`、`@earendil-works/pi-ai@1.4.0`（npm 安装；仓库内 `pi/` 仅为源码参考）
- 运行方式：**进程内嵌入**。`AgentService` 用 Pi 的 `Agent` 类跑「LLM ↔ 工具调用」循环，不使用子进程 CLI/RPC，无文件/Shell 工具注册
- Pi 专用代码全部隔离在 `src/agent/pi/`，业务层（routes/services）不 import Pi 包 → 满足 PRD 6.2「不在业务层散布框架专用代码」

### 2.2 职责划分（PRD 6.1）

**Pi Agent 负责**：理解意图、组织规划内容、解释依据、生成建议（LLM 通道）
**确定性业务代码负责**：认证、DB 读写、技能归一化、频次/匹配度计算、时间预算校验、版本保存、任务状态、权限校验

### 2.3 工具集（PRD 6.3，全部为 `AgentTool`，TypeBox schema）

| 工具 | 实现（调 services 层，绝不直接写库） |
|---|---|
| `search_jobs` | JobSearchProvider 链：真实招聘站抓取 → 预置样本；返回样本+来源+采集状态 |
| `fetch_job_page` | 白名单 URL 抓取（超时/大小限制/HTML→文本），记录 parse_status |
| `extract_requirements` | LLM 结构化抽取（JD→技能/学历/经验/职责/加分项），Zod 校验 |
| `normalize_skills` | 词典归一化服务（skills.aliases），保留原始词条映射 |
| `get_user_profile` | 从 JWT 上下文取 user_id → 读档案（**不接受 Agent 指定用户 ID**） |
| `get_current_roadmap` | 读当前规划版本+任务状态 |
| `generate_roadmap` | 组装候选规划（LLM 或规则模板） |
| `validate_roadmap` | 时间预算+依赖+结构校验（纯函数） |
| `save_roadmap_version` | 经校验后写新版本（唯一允许落库的入口之一） |
| `update_task_status` | 调任务服务（状态机+乐观锁） |

### 2.4 运行限制与安全（PRD 6.6）

- API Key 仅服务端（`.env`），不下发客户端
- 每次运行：墙钟超时（`agent.abort()` + AbortSignal 传入工具）+ 工具调用次数上限（`finishTurn`/`beforeToolCall` 计数）
- 外部网页内容仅作为数据，system prompt 声明网页内指令不执行
- 不注册 Shell/文件系统工具
- `agent_runs` 表记录 task_type/status/input_summary/error_code/起止时间；日志不落密码与令牌

### 2.5 结构化输出（PRD 6.4）

所有 Agent 核心结果为 JSON：让模型调用带 TypeBox schema 的「提交」工具 → 服务端用 **Zod** 边界校验（schema 在 `@pathpilot/shared`）→ 非法重试 ≤2 次 → 仍失败返回 `AGENT_OUTPUT_INVALID`，**不落库**（旧规划不覆盖，PRD 10.3）。

### 2.6 双通道与降级

```
AgentService.generateRoadmap(input)
  ├─ AGENT_API_KEY 已配置 → Pi Agent 通道（LLM 生成内容 + 确定性校验）
  └─ 未配置/调用失败   → 规则引擎通道（任务库+依赖图+时间预算裁剪）
两者输出同一 Zod schema；响应带 engine: "pi-llm" | "rules"
```

## 3. 数据库设计（PRD §8）

SQLite via Drizzle；所有表含 created_at/updated_at（PRD 7.2）。迁移：`apps/server/drizzle/*.sql`，启动时自动应用（`_migrations` 表记录进度）。

```
users(id, email, password_hash, created_at, updated_at)
profiles(user_id→users, nickname, school, major, grade, graduation_date,
         target_role, career_path, weekly_hours, created_at, updated_at)   §8.1
skills(id, name, category, aliases[json], created_at)                      §8.2
profile_skills(id, user_id, skill_id, level, evidence_status,
         evidence_description, evidence_url, updated_at)                   §8.3
experiences(id, user_id, type[course|project|contest|internship|practice],
         title, description, technologies[json], role, start_date, end_date,
         result, evidence_url, created_at, updated_at)                     §8.4
job_sources(id, title, company, location, employment_type,
         education_requirement, experience_requirement, description,
         source_url, source_type[web|manual|preset], fetched_at,
         content_hash, parse_status[ok|failed|pending], analysis_id)       §8.5
job_requirements(id, job_source_id, skill_id, original_text,
         requirement_type[skill|education|experience|responsibility|soft|bonus],
         importance, evidence_text)                                        §8.6
roadmaps(id, user_id, version, parent_version_id, target_role, career_path,
         weekly_hours, status[draft|active|archived], generation_reason,
         engine, content[json:PRD§6.4规划结构], created_at)                §8.7
roadmap_tasks(id, roadmap_id, user_id, semester, title, description,
         estimated_hours, priority, status[not_started|in_progress|done|deferred],
         prerequisites[json], deliverable, acceptance_criteria, related_skills[json],
         completed_at, actual_hours, evidence_url, created_at, updated_at) §8.8
agent_runs(id, user_id, task_type, status[running|succeeded|failed],
         input_summary, error_code, result_ref, started_at, finished_at)   §8.9
agent_chat_sessions(id, user_id, created_at, updated_at)
agent_chat_messages(id, session_id, role, content, engine, created_at)
job_analyses(id, user_id, target_role, city, employment_type, sample_count,
         source_types[json], skills_freq[json], education_dist[json],
         experience_dist[json], limitations[json], sources[json],
         engine, created_at)          — 分析结果快照（PRD §6.4 岗位分析结构）
```

安全（PRD 8.10）：所有个人数据表在 service 层查询一律 `where user_id = ctx.userId`；SQLite 单文件位于服务端 `data/`（gitignore）；未来切 Supabase/Postgres 时补充 RLS 策略。

## 4. API 契约（PRD §9）

统一前缀 `/api`，认证走 `Authorization: Bearer <jwt>`。统一错误格式：

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "输入参数不合法" } }
```

错误码枚举（PRD 7.4 八类 + 常规）：
`VALIDATION_ERROR / UNAUTHORIZED / FORBIDDEN / NOT_FOUND / CONFLICT / NETWORK_ERROR / SEARCH_FAILED / MODEL_CALL_FAILED / AGENT_OUTPUT_INVALID / DB_WRITE_FAILED / BUDGET_EXCEEDED / SAMPLE_INSUFFICIENT / RATE_LIMITED / INTERNAL_ERROR`

端点（PRD §9 全集 + auth）：

```
POST /api/auth/register|login|logout   GET /api/auth/me
GET/PUT /api/profile                   导出: GET /api/profile/export, 删除账号: DELETE /api/account
POST /api/jobs/analyze (异步→agent_run) GET /api/jobs/sources  GET /api/jobs/analysis/:id
POST /api/jobs/manual (手动粘贴 JD)
GET/POST /api/skills  PATCH/DELETE /api/skills/:id   GET /api/skills/catalog
GET/POST /api/experiences  PATCH/DELETE /api/experiences/:id
POST /api/roadmaps (生成)  GET /api/roadmaps  GET /api/roadmaps/current
GET /api/roadmaps/:id  POST /api/roadmaps/:id/revise  GET /api/roadmaps/:id/versions
GET /api/roadmaps/:id/diff?compare=:otherId
GET /api/tasks  PATCH /api/tasks/:id  POST /api/tasks/:id/evidence
POST /api/agent/chat  GET /api/agent/runs/:id
POST /api/resume/draft  (P1)
GET /api/dashboard (首页聚合)   GET /api/stats/growth (成长统计)
```

异步任务（岗位分析、规划生成）：POST 返回 `{ run_id, status }`，客户端轮询 `GET /api/agent/runs/:id`；防重复提交（同用户同类型 running run 存在时返回 409 RATE_LIMITED，PRD 12）。

## 5. 岗位数据来源策略（PRD 4.2）

`JobSearchProvider` 接口，按序尝试、如实报告：

1. **WebSearchProvider**：真实招聘网站搜索/页面抓取（实现期实测确定可达源白名单；带超时、UA、大小限制；parse_status 记录成功/失败）
2. **PresetProvider**：预置真实样本库（开发期从公开招聘页采集，含真实 source_url/fetched_at，source_type=`preset`）
3. **ManualProvider**：用户粘贴 JD 文本（source_type=`manual`）

统计只基于 `parse_status=ok` 的样本；`sample_count`、`source_type` 分布如实返回；样本不足返回 `SAMPLE_INSUFFICIENT` 并说明，**绝不编造**（PRD 4.2 验收）。

## 6. 跨端同步（PRD 5.3）

- 所有正式数据仅存服务端，客户端经统一 API 读写；无本地缓存业务数据
- 任务更新成功即返回新状态；失败明确 `未同步` 提示
- 冲突检测：`PATCH /api/tasks/:id` 可带 `expected_updated_at`，不匹配返回 409 `CONFLICT`
- 规划重规划只创建新版本（version+1, parent_version_id），历史可追溯
- 登出清除客户端 token（Web localStorage / App AsyncStorage）

## 7. 前端架构

### 7.1 Web（apps/web）
- Next.js 15 App Router + TypeScript strict + Tailwind CSS + ECharts
- 视觉：复刻 `design/index.html` 设计系统（ink #0B2239 / paper #F5F2EA / accent #E8512A / teal #0E7C6B / 14px 圆角 / Noto Sans SC）
- 页面：登录/注册 + Dashboard、岗位洞察、成长路线、动态规划、能力档案、任务中心、AI 顾问（PRD 5.1）
- token 存 localStorage；统一 fetch 封装（401 跳登录）；加载/空/错误三态齐备

### 7.2 Android（apps/mobile）
- Expo SDK + expo-router（TypeScript），5 Tab：首页/成长路线/任务/AI 顾问/我的（PRD 5.2）
- API base URL：默认 `http://10.0.2.2:3000`（模拟器）→「我的」页可改（真机填局域网 IP，AsyncStorage 持久化）
- 图表：react-native-svg 轻量实现（匹配环、进度条）
- 打包：`expo prebuild -p android` → Gradle `assembleRelease`（自签 keystore，keytool 生成）→ `dist/PathPilot-v1.0.apk`

## 8. 测试策略（PRD 13.8）

vitest，覆盖：
1. 技能归一化（别名合并、原始词条保留、不合并近似技能）
2. 时间预算计算（学期周数×周时×利用率；超限裁剪顺序）
3. 规划 JSON 校验（结构/依赖/预算，非法不落库）
4. 用户数据权限（A 不能读 B）
5. 规划版本保存（版本链、失败不覆盖、已完成任务保留）
6. 任务状态更新（状态机、乐观锁冲突）
7. 跨端数据读取（同账号两客户端读写一致）
Agent 层用 `fauxProvider`（pi-ai）做无网络确定性测试。

## 9. 目录结构

```
PathPilot/
├── ARCHITECTURE.md  PRD.md  README.md  .env.example
├── design/                  # 高保真设计稿（视觉规范来源）
├── pi/                      # Pi 源码参考（gitignore，npm 安装 1.4.0）
├── packages/shared/         # @pathpilot/shared：类型+Zod schema+错误码（三端共享）
├── apps/server/             # Fastify 后端（本图 §1.1）
├── apps/web/                # Next.js Web
└── apps/mobile/             # Expo Android
```

## 10. 环境与配置

```ini
PORT=3000
JWT_SECRET=<随机长串>
DB_PATH=./data/pathpilot.db

# Pi Agent LLM（可选；未配置自动降级规则引擎）
AGENT_PROVIDER=zhipu          # zhipu | deepseek | custom
AGENT_BASE_URL=https://open.bigmodel.cn/api/paas/v4
AGENT_API_KEY=
AGENT_MODEL=glm-4.6

# 搜索（可选）
SEARCH_TIMEOUT_MS=15000
```

生产/开发分离：`.env`（gitignore）+ `.env.example`（入库）；APK 内服务器地址可配置。
