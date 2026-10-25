// 岗位分析路由（PRD §9）：异步 analyze + sources + analysis 查询 + 手动粘贴
import type { FastifyInstance } from 'fastify';
import { jobAnalyzeInput, manualJobInput } from '@pathpilot/shared';
import { getUserId } from '../auth/index.js';
import { listSources, getAnalysis, latestAnalysis, listAnalyses } from '../services/analysisService.js';
import { analyzeJobs, analyzeManualJob } from '../agent/jobs.js';
import { createRun, executeRun, getRun } from '../agent/core.js';

export async function jobRoutes(app: FastifyInstance): Promise<void> {
  const auth = app.authPreHandler;

  app.post('/api/jobs/analyze', { preHandler: [auth] }, async (req, reply) => {
    const userId = getUserId(req);
    const input = jobAnalyzeInput.parse(req.body);
    const runId = await createRun(userId, 'analyze_jobs', `${input.targetRole}·${input.city ?? '不限'}·${input.employmentType}`);
    executeRun(runId, 'analyze_jobs', async () => {
      const analysis = await analyzeJobs(userId, input);
      return { resultType: 'job_analysis', resultId: analysis.id };
    });
    reply.code(202);
    return { run_id: runId, status: 'running' };
  });

  app.get('/api/agent/runs/:id', { preHandler: [auth] }, async (req) => {
    const { id } = req.params as { id: string };
    const run = await getRun(getUserId(req), Number(id));
    // 附带结果引用数据，客户端轮询一次拿全
    if (run.status === 'succeeded' && run.resultRef?.type === 'job_analysis') {
      const analysis = await getAnalysis(getUserId(req), run.resultRef.id);
      return { run, analysis };
    }
    return { run };
  });

  app.get('/api/jobs/sources', { preHandler: [auth] }, async (req) => {
    const { analysisId } = req.query as { analysisId?: string };
    return listSources(getUserId(req), analysisId ? Number(analysisId) : undefined);
  });

  app.get('/api/jobs/analysis/latest', { preHandler: [auth] }, async (req) => (await latestAnalysis(getUserId(req))) ?? null);

  /** 历史分析列表(岗位对比选择器) */
  app.get('/api/jobs/analyses', { preHandler: [auth] }, async (req) => listAnalyses(getUserId(req)));

  app.get('/api/jobs/analysis/:id', { preHandler: [auth] }, async (req) => {
    const { id } = req.params as { id: string };
    return getAnalysis(getUserId(req), Number(id));
  });

  app.post('/api/jobs/manual', { preHandler: [auth] }, async (req, reply) => {
    const userId = getUserId(req);
    const input = manualJobInput.parse(req.body);
    const runId = await createRun(userId, 'analyze_jobs', `手动输入·${input.targetRole}`);
    executeRun(runId, 'analyze_jobs', async () => {
      const analysis = await analyzeManualJob(userId, input);
      return { resultType: 'job_analysis', resultId: analysis.id };
    });
    reply.code(202);
    return { run_id: runId, status: 'running' };
  });
}
