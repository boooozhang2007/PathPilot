// JWT 认证：bcryptjs 密码哈希 + jose 签发/校验（自包含，无外部依赖）
import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { users } from '../db/schema.js';
import { config } from '../config.js';
import { unauthorized } from '../services/errors.js';
import type { FastifyReply, FastifyRequest } from 'fastify';

const secret = new TextEncoder().encode(config.jwtSecret);

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function signToken(userId: number): Promise<string> {
  return new SignJWT({ sub: String(userId) })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(config.jwtExpiresIn)
    .sign(secret);
}

export async function verifyToken(token: string): Promise<number> {
  try {
    const { payload } = await jwtVerify(token, secret);
    const userId = Number(payload.sub);
    if (!Number.isInteger(userId) || userId <= 0) throw new Error('bad sub');
    return userId;
  } catch {
    throw unauthorized();
  }
}

/** Fastify 预处理：从 Authorization: Bearer 解出 userId 挂到 request.userId */
export async function authPreHandler(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw unauthorized();
  const userId = await verifyToken(header.slice(7).trim());
  // JWT 无状态：注销后 token 仍合法，必须回库确认账号存在（PRD 5.3 账号注销即时生效）
  const rows = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
  if (!rows[0]) throw unauthorized('账号已注销，请重新登录');
  (req as any).userId = userId;
}

/** 在路由内获取当前用户 ID（类型安全） */
export function getUserId(req: FastifyRequest): number {
  const id = (req as any).userId as number | undefined;
  if (!id) throw unauthorized();
  return id;
}
