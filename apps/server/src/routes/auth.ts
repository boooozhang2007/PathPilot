// 认证路由：注册/登录/登出/me（PRD 4.1）
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { users, profiles } from '../db/schema.js';
import { registerInput, loginInput } from '@pathpilot/shared';
import { hashPassword, verifyPassword, signToken, getUserId } from '../auth/index.js';
import { badRequest, unauthorized } from '../services/errors.js';

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/auth/register', async (req) => {
    const input = registerInput.parse(req.body);
    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1);
    if (existing[0]) throw badRequest('该邮箱已注册');
    const inserted = await db
      .insert(users)
      .values({ email: input.email, passwordHash: await hashPassword(input.password) })
      .returning();
    const user = inserted[0];
    await db.insert(profiles).values({ userId: user.id, nickname: input.nickname }).onConflictDoNothing();
    const token = await signToken(user.id);
    return { token, user: { id: user.id, email: user.email, nickname: input.nickname } };
  });

  app.post('/api/auth/login', async (req) => {
    const input = loginInput.parse(req.body);
    const rows = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
    const user = rows[0];
    if (!user || !(await verifyPassword(input.password, user.passwordHash))) throw unauthorized('邮箱或密码错误');
    const token = await signToken(user.id);
    const profile = await db.select({ nickname: profiles.nickname }).from(profiles).where(eq(profiles.userId, user.id)).limit(1);
    return { token, user: { id: user.id, email: user.email, nickname: profile[0]?.nickname ?? '同学' } };
  });

  app.post('/api/auth/logout', async () => {
    // JWT 无状态：客户端丢弃 token 即可（客户端负责清除本地缓存，PRD 5.3）
    return { ok: true };
  });

  app.get('/api/auth/me', { preHandler: [app.authPreHandler] }, async (req) => {
    const userId = getUserId(req);
    const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!rows[0]) throw unauthorized();
    const profile = await db.select({ nickname: profiles.nickname }).from(profiles).where(eq(profiles.userId, userId)).limit(1);
    return { user: { id: rows[0].id, email: rows[0].email, nickname: profile[0]?.nickname ?? '同学' } };
  });
}
