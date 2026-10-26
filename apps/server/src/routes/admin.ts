// 管理路由：/api/admin/* 需要通过环境变量配置管理密钥。
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { getLlmSettings, saveLlmSettings, clearSavedModel } from '../agent/settings.js';
import { unauthorized } from '../services/errors.js';

const ADMIN_KEY = process.env.ADMIN_KEY;

async function adminGuard(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const key = (req.headers['x-admin-key'] as string) ?? (req.query as { admin_key?: string })?.admin_key;
  if (!ADMIN_KEY || key !== ADMIN_KEY) throw unauthorized('管理密钥不正确');
}

const llmPatch = z.object({
  provider: z.enum(['zhipu', 'deepseek', 'custom']).optional(),
  baseUrl: z.string().url().optional(),
  apiKey: z.string().max(500).optional(),
  model: z.string().max(100).optional(),
});

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/admin/llm', { preHandler: [adminGuard] }, async () => {
    const s = await getLlmSettings();
    return { ...s, apiKey: s.apiKey ? `${s.apiKey.slice(0, 6)}…${s.apiKey.slice(-4)}` : '', apiKeySet: s.apiKey.length > 0 };
  });

  app.put('/api/admin/llm', { preHandler: [adminGuard] }, async (req) => {
    const input = llmPatch.parse(req.body);
    // 掩码值不覆盖已保存的 key
    if (input.apiKey !== undefined && /…/.test(input.apiKey)) delete input.apiKey;
    const saved = await saveLlmSettings(input);
    return { ok: true, model: saved.model, baseUrl: saved.baseUrl };
  });

  app.delete('/api/admin/llm/model', { preHandler: [adminGuard] }, async () => {
    const saved = await clearSavedModel();
    return { ok: true, model: saved.model, baseUrl: saved.baseUrl };
  });

}
