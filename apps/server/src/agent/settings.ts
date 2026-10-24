// 运行时 Agent LLM 配置：管理页写入 app_settings（DB），覆盖 .env 默认值
// 管理页见 Web /admin（ADMIN_KEY 鉴权）；未配置 key 时走规则引擎
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { appSettings } from '../db/schema.js';
import { config } from '../config.js';

export interface LlmSettings {
  provider: string; // zhipu | deepseek | custom
  baseUrl: string;
  apiKey: string;
  model: string;
}

/** 前端可选模型目录（含计费倍率，用于展示；调用走当前配置的 baseUrl） */
export const MODEL_CATALOG = [
  { id: 'deepseek-v4.1-flash', name: 'DeepSeek-V4.1-Flash', price: '0.05x' },
  { id: 'minimax-m3.1-flash', name: 'Minimax M3.1 Flash', price: '0.07x' },
  { id: 'gemini-4-argon', name: 'Gemini-4-Argon', price: '0.3x' },
  { id: 'gpt-6.1-sol', name: 'GPT-6.1-sol', price: '0.5x' },
  { id: 'claude-opus-5.5', name: 'Claude Opus 5.5', price: '1.3x' },
] as const;

const SETTINGS_KEY = 'llm';

export async function getLlmSettings(): Promise<LlmSettings> {
  const rows = await db.select().from(appSettings).where(eq(appSettings.key, SETTINGS_KEY)).limit(1);
  const saved = (rows[0]?.value ?? {}) as Partial<LlmSettings>;
  return {
    provider: saved.provider ?? config.agent.provider,
    baseUrl: saved.baseUrl ?? config.agent.baseUrl,
    apiKey: saved.apiKey ?? config.agent.apiKey,
    model: saved.model ?? config.agent.model,
  };
}

export async function saveLlmSettings(patch: Partial<LlmSettings>): Promise<LlmSettings> {
  const current = await getLlmSettings();
  const next: LlmSettings = { ...current, ...patch };
  await db
    .insert(appSettings)
    .values({ key: SETTINGS_KEY, value: next as never, updatedAt: new Date().toISOString() })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: next as never, updatedAt: new Date().toISOString() } });
  const { invalidateModels } = await import('./pi/provider.js');
  invalidateModels();
  return next;
}

export async function isLlmConfigured(): Promise<boolean> {
  return (await getLlmSettings()).apiKey.length > 0;
}

/** 从目标端点拉取可用模型列表（OpenAI 兼容 GET /models） */
export async function fetchRemoteModels(baseUrl: string, apiKey: string): Promise<string[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { data?: { id: string }[] };
    return (data.data ?? []).map((m) => m.id).slice(0, 100);
  } finally {
    clearTimeout(timer);
  }
}
