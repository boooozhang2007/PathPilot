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

export async function clearSavedModel(): Promise<LlmSettings> {
  const rows = await db.select().from(appSettings).where(eq(appSettings.key, SETTINGS_KEY)).limit(1);
  const value = { ...((rows[0]?.value ?? {}) as Partial<LlmSettings>) };
  delete value.model;
  await db
    .insert(appSettings)
    .values({ key: SETTINGS_KEY, value: value as never, updatedAt: new Date().toISOString() })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: value as never, updatedAt: new Date().toISOString() } });
  const { invalidateModels } = await import('./pi/provider.js');
  invalidateModels();
  return getLlmSettings();
}
export async function isLlmConfigured(): Promise<boolean> {
  return (await getLlmSettings()).apiKey.length > 0;
}
