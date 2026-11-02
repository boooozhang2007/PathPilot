// 学习提醒 / 周期总结路由（PRD P1）
import type { FastifyInstance } from 'fastify';
import { getUserId } from '../auth/index.js';
import { listReminders, dismissReminder } from '../services/reminderService.js';

export async function reminderRoutes(app: FastifyInstance): Promise<void> {
  const auth = app.authPreHandler;

  app.get('/api/reminders', { preHandler: [auth] }, async (req) => listReminders(getUserId(req)));

  app.post('/api/reminders/:id/dismiss', { preHandler: [auth] }, async (req) => {
    const { id } = req.params as { id: string };
    await dismissReminder(getUserId(req), Number(id));
    return { ok: true };
  });
}
