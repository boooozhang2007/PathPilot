import 'dotenv/config';

function requireEnv(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v.trim().length === 0) throw new Error(`缺少环境变量 ${name}（参考 .env.example 配置）`);
  return v;
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  jwtSecret: requireEnv('JWT_SECRET'),
  jwtExpiresIn: '7d',
  dbPath: process.env.DB_PATH ?? './data/pathpilot.db',
  /** CORS 允许来源（逗号分隔的环境变量白名单；无 Origin 的同源/非浏览器请求放行） */
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000,http://localhost:3001,http://localhost:5173,http://127.0.0.1:3000,http://127.0.0.1:3001,http://127.0.0.1:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  /** Pi Agent LLM 配置；未配置 AGENT_API_KEY 时自动降级规则引擎 */
  agent: {
    provider: process.env.AGENT_PROVIDER ?? 'zhipu', // zhipu | deepseek | custom
    baseUrl:
      process.env.AGENT_BASE_URL ??
      (process.env.AGENT_PROVIDER === 'deepseek' ? 'https://api.deepseek.com' : 'https://open.bigmodel.cn/api/paas/v4'),
    apiKey: process.env.AGENT_API_KEY ?? '',
    model: process.env.AGENT_MODEL ?? 'glm-4.6',
  },
  search: {
    /** 一次联网搜索（四个平台通道并行）的总预算；各通道内部还有更小的 deadline。 */
    timeoutMs: Number(process.env.SEARCH_TIMEOUT_MS ?? 60_000),
    /** 所有通道共享的在途 HTTP 请求上限，避免并行抓取时同时打爆四个平台触发风控。 */
    maxInFlight: Number(process.env.SEARCH_MAX_INFLIGHT ?? 8),
    /** 单页抓取超时（fetch_job_page 与搜索引擎回退的详情页）；与总预算分开，避免一个挂死页面吃掉整个预算。 */
    pageTimeoutMs: Number(process.env.SEARCH_PAGE_TIMEOUT_MS ?? 15_000),
  },
  /** Agent 运行限制（PRD 6.6） */
  agentLimits: {
    wallClockMs: Number(process.env.AGENT_TIMEOUT_MS ?? 180_000),
    /** 流式聊天允许更长时间，覆盖聊天内的规划/岗位分析工具 */
    chatWallClockMs: Number(process.env.AGENT_CHAT_TIMEOUT_MS ?? 300_000),
    maxToolCalls: Number(process.env.AGENT_MAX_TOOL_CALLS ?? 40),
    maxRetries: 2, // 结构化输出校验失败重试次数（PRD 6.4 有限次数重试）
  },
} as const;

export function llmConfigured(): boolean {
  return config.agent.apiKey.length > 0;
}
