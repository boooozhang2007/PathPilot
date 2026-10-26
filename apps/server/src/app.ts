// Fastify 应用工厂：统一错误格式（PRD §9）、CORS、路由注册、启动迁移
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { ZodError } from 'zod';
import { AppError } from './services/errors.js';
import { authPreHandler } from './auth/index.js';
import { authRoutes } from './routes/auth.js';
import { profileRoutes } from './routes/profile.js';
import { jobRoutes } from './routes/jobs.js';
import { roadmapRoutes } from './routes/roadmaps.js';
import { adminRoutes } from './routes/admin.js';
import { ERROR_MESSAGES, type ErrorCode } from '@pathpilot/shared';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' }, bodyLimit: 1_048_576 });

  await app.register(cors, { origin: true, credentials: true });

  app.decorate('authPreHandler', authPreHandler);

  // 统一错误处理（PRD 7.4：用户可理解的信息 + 服务端日志）
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ZodError) {
      req.log.warn({ issues: err.issues }, 'validation error');
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: err.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; '),
        },
      });
    }
    if (err instanceof AppError) {
      req.log.warn({ code: err.code }, err.message);
      return reply.status(err.statusCode).send({ error: { code: err.code, message: err.message, details: err.details } });
    }
    // fastify 4xx（如 JSON 解析失败）
    const statusCode = (err as { statusCode?: number }).statusCode;
    if (statusCode && statusCode >= 400 && statusCode < 500) {
      const code: ErrorCode = statusCode === 401 ? 'UNAUTHORIZED' : statusCode === 404 ? 'NOT_FOUND' : 'VALIDATION_ERROR';
      return reply.status(statusCode).send({ error: { code, message: (err as Error).message } });
    }
    req.log.error(err, 'internal error');
    return reply.status(500).send({ error: { code: 'INTERNAL_ERROR', message: ERROR_MESSAGES.INTERNAL_ERROR } });
  });

  app.get('/api/health', async () => ({ ok: true, time: new Date().toISOString() }));
  app.get('/api/motto', async () => {
    const mottos = ['路虽远，行则将至。', '把今天走稳，远方自会清晰。', '每一次积累，都会在未来回响。', '向着热爱深处，慢慢长成自己的答案。', '星光不问赶路人，时光不负有心人。'];
    return { text: mottos[Math.floor(Math.random() * mottos.length)] };
  });

  await app.register(authRoutes);
  await app.register(profileRoutes);
  await app.register(jobRoutes);
  await app.register(roadmapRoutes);
  await app.register(adminRoutes);

  return app;
}
