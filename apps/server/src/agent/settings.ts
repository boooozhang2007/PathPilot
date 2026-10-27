// 运行时 Agent LLM 配置：管理页写入 app_settings（DB），覆盖 .env 默认值
// 管理页见 Web /admin（ADMIN_KEY 鉴权）；未配置 key 时走规则引擎
import { eq, sql } from 'drizzle-orm';
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
  // 原子读-改-写：json_patch 在数据库层合并，消除 get→write 竞态（并发管理页写入不互相覆盖）
  await db
    .insert(appSettings)
    .values({ key: SETTINGS_KEY, value: patch as never, updatedAt: new Date().toISOString() })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: {
        value: sql`json_patch(coalesce(${appSettings.value}, '{}'), json(${JSON.stringify(patch)}))`,
        updatedAt: new Date().toISOString(),
      },
    });
  const { invalidateModels } = await import('./pi/provider.js');
  invalidateModels();
  return getLlmSettings();
}

export async function clearSavedModel(): Promise<LlmSettings> {
  // 原子移除 model 字段（json_patch 无法删除键，用 json_remove）
  await db
    .insert(appSettings)
    .values({ key: SETTINGS_KEY, value: {} as never, updatedAt: new Date().toISOString() })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: {
        value: sql`json_remove(coalesce(${appSettings.value}, '{}'), '$.model')`,
        updatedAt: new Date().toISOString(),
      },
    });
  const { invalidateModels } = await import('./pi/provider.js');
  invalidateModels();
  return getLlmSettings();
}
export async function isLlmConfigured(): Promise<boolean> {
  return (await getLlmSettings()).apiKey.length > 0;
}
