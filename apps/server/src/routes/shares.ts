// 规划分享路由（PRD P2）：管理端 + 公开只读端点
import type { FastifyInstance } from 'fastify';
import { shareRoadmapInput } from '@pathpilot/shared';
import { getUserId } from '../auth/index.js';
import { shareRoadmap, getActiveShare, revokeShare, getSharedRoadmap } from '../services/shareService.js';

export async function shareRoutes(app: FastifyInstance): Promise<void> {
  const auth = app.authPreHandler;

  app.post('/api/roadmaps/:id/share', { preHandler: [auth] }, async (req) => {
    const { id } = req.params as { id: string };
    const input = shareRoadmapInput.parse(req.body ?? {});
    return shareRoadmap(getUserId(req), Number(id), input.expiresInDays);
  });

  app.get('/api/roadmaps/:id/share', { preHandler: [auth] }, async (req) => {
    const { id } = req.params as { id: string };
    return getActiveShare(getUserId(req), Number(id));
  });

  app.delete('/api/roadmaps/:id/share', { preHandler: [auth] }, async (req) => {
    const { id } = req.params as { id: string };
    await revokeShare(getUserId(req), Number(id));
    return { ok: true };
  });

  // 公开只读分享页：无需登录
  app.get('/api/share/:token', async (req) => {
    const { token } = req.params as { token: string };
    return getSharedRoadmap(token);
  });
}
