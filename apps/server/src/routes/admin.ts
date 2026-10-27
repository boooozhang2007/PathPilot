// 管理路由：/api/admin/* 需要通过环境变量配置管理密钥。
// 密钥只接受 x-admin-key 请求头（不再读取 query，避免进入日志/浏览器历史），并用常量时间比较
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { getLlmSettings, saveLlmSettings, clearSavedModel } from '../agent/settings.js';
import { unauthorized } from '../services/errors.js';

const ADMIN_KEY = process.env.ADMIN_KEY;

function keyMatches(provided: string, expected: string): boolean {
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(provided, 'utf8'), Buffer.from(expected, 'utf8'));
}

async function adminGuard(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const key = req.headers['x-admin-key'];
  if (!ADMIN_KEY || typeof key !== 'string' || !keyMatches(key, ADMIN_KEY)) throw unauthorized('管理密钥不正确');
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
