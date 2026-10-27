import 'dotenv/config';

function requireEnv(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`缺少环境变量 ${name}（参考 .env.example 配置）`);
  return v;
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  jwtSecret: requireEnv('JWT_SECRET'),
  jwtExpiresIn: '7d',
  dbPath: process.env.DB_PATH ?? './data/pathpilot.db',

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
    timeoutMs: Number(process.env.SEARCH_TIMEOUT_MS ?? 15000),
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
