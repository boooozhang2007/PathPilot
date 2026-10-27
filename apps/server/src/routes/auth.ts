// 认证路由：注册/登录/登出/me（PRD 4.1）
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { users, profiles } from '../db/schema.js';
import { registerInput, loginInput } from '@pathpilot/shared';
import { hashPassword, verifyPassword, signToken, getUserId } from '../auth/index.js';
import { badRequest, conflict, rateLimited, unauthorized } from '../services/errors.js';

// ---------- 登录限流（内存计数）：同一邮箱+IP 连续失败 5 次后拒绝 30 秒 ----------
const LOGIN_MAX_FAILURES = 5;
const LOGIN_BLOCK_MS = 30_000;
interface LoginAttempt {
  failures: number;
  blockedUntil: number; // 0 表示未封禁
}
const loginAttempts = new Map<string, LoginAttempt>();

// 定期清理过期记录，避免 Map 只增不减
const loginCleanup = setInterval(() => {
  const now = Date.now();
  for (const [key, attempt] of loginAttempts) {
    if (attempt.blockedUntil === 0 || attempt.blockedUntil <= now) loginAttempts.delete(key);
  }
}, 60_000);
loginCleanup.unref();

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE';
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/auth/register', async (req) => {
    const input = registerInput.parse(req.body);
    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1);
    if (existing[0]) throw badRequest('该邮箱已注册');
    let user: { id: number; email: string };
    try {
      const inserted = await db
        .insert(users)
        .values({ email: input.email, passwordHash: await hashPassword(input.password) })
        .returning();
      user = inserted[0];
    } catch (err) {
      // 并发注册同邮箱：唯一索引冲突转成 409，而不是 500
      if (isUniqueViolation(err)) throw conflict('该邮箱已注册');
      throw err;
    }
    await db.insert(profiles).values({ userId: user.id, nickname: input.nickname }).onConflictDoNothing();
    const token = await signToken(user.id);
    return { token, user: { id: user.id, email: user.email, nickname: input.nickname } };
  });

  app.post('/api/auth/login', async (req) => {
    const input = loginInput.parse(req.body);
    const attemptKey = `${input.email.toLowerCase()}|${req.ip}`;
    const attempt = loginAttempts.get(attemptKey);
    if (attempt?.blockedUntil && attempt.blockedUntil > Date.now()) {
      throw rateLimited('失败次数过多，请 30 秒后再试');
    }
    const rows = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
    const user = rows[0];
    if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
      const failures = (attempt?.failures ?? 0) + 1;
      loginAttempts.set(attemptKey, {
        failures,
        blockedUntil: failures >= LOGIN_MAX_FAILURES ? Date.now() + LOGIN_BLOCK_MS : 0,
      });
      throw unauthorized('邮箱或密码错误');
    }
    loginAttempts.delete(attemptKey);
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
