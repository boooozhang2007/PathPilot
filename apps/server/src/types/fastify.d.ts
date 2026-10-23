// Fastify 实例扩展声明：authPreHandler 装饰器
import 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    authPreHandler: (req: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => Promise<void>;
  }
}
