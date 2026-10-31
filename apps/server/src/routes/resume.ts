// 简历 PDF 导出路由（PRD 4.9 P1）
import type { FastifyInstance } from 'fastify';
import { resumePdfInput } from '@pathpilot/shared';
import { getUserId } from '../auth/index.js';
import { buildResumePdf } from '../services/resumePdfService.js';

export async function resumeRoutes(app: FastifyInstance): Promise<void> {
  const auth = app.authPreHandler;

  app.post('/api/resume/pdf', { preHandler: [auth] }, async (req, reply) => {
    const userId = getUserId(req);
    const input = resumePdfInput.parse(req.body);
    const pdf = await buildResumePdf(input);
    const filename = `resume-${input.targetRole || 'pathpilot'}-${userId}.pdf`;
    reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`)
      .send(pdf);
  });
}
