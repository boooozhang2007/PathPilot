// 管理路由（任务1：模型配置管理页）：/api/admin/* 需 ADMIN_KEY（.env，默认 pathpilot-admin）
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { getLlmSettings, saveLlmSettings, fetchRemoteModels, MODEL_CATALOG, isLlmConfigured } from '../agent/settings.js';
import { unauthorized } from '../services/errors.js';

const ADMIN_KEY = process.env.ADMIN_KEY ?? 'pathpilot-admin';

async function adminGuard(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const key = (req.headers['x-admin-key'] as string) ?? (req.query as { admin_key?: string })?.admin_key;
  if (key !== ADMIN_KEY) throw unauthorized('管理密钥不正确');
}

const llmPatch = z.object({
  provider: z.enum(['zhipu', 'deepseek', 'custom']).optional(),
  baseUrl: z.string().url().optional(),
  apiKey: z.string().max(500).optional(),
  model: z.string().max(100).optional(),
});

const modelsQuery = z.object({
  baseUrl: z.string().url().optional(),
  apiKey: z.string().max(500).optional(),
});

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/admin/llm', { preHandler: [adminGuard] }, async () => {
    const s = await getLlmSettings();
    return { ...s, apiKey: s.apiKey ? `${s.apiKey.slice(0, 6)}…${s.apiKey.slice(-4)}` : '', apiKeySet: s.apiKey.length > 0, catalog: MODEL_CATALOG };
  });

  app.put('/api/admin/llm', { preHandler: [adminGuard] }, async (req) => {
    const input = llmPatch.parse(req.body);
    // 掩码值不覆盖已保存的 key
    if (input.apiKey !== undefined && /…/.test(input.apiKey)) delete input.apiKey;
    const saved = await saveLlmSettings(input);
    return { ok: true, model: saved.model, baseUrl: saved.baseUrl };
  });

  app.post('/api/admin/llm/models', { preHandler: [adminGuard] }, async (req) => {
    const input = modelsQuery.parse(req.body ?? {});
    const current = await getLlmSettings();
    const baseUrl = input.baseUrl ?? current.baseUrl;
    const apiKey = input.apiKey && !/…/.test(input.apiKey) ? input.apiKey : current.apiKey;
    const models = await fetchRemoteModels(baseUrl, apiKey);
    return { baseUrl, models };
  });

  /** 前端模型选择器数据（登录用户可访问） */
  app.get('/api/agent/models', { preHandler: [app.authPreHandler] }, async () => {
    const s = await getLlmSettings();
    return { catalog: MODEL_CATALOG, current: s.model, configured: await isLlmConfigured() };
  });
}
