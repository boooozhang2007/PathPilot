// AgentService：PRD §6.2 六大业务接口的编排层
// 引擎选择：配置 AGENT_API_KEY → Pi LLM 通道；否则规则引擎降级（响应标注 engine）
import { and, eq, lt, or, isNull, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { agentRuns } from '../db/schema.js';
import { config, llmConfigured } from '../config.js';
import { rateLimited, notFound } from '../services/errors.js';
import type { AgentRunDTO } from '@pathpilot/shared';
import type { AgentRunStatus } from '@pathpilot/shared';

export function currentEngine(): 'pi-llm' | 'rules' {
  return llmConfigured() ? 'pi-llm' : 'rules';
}

export async function createRun(userId: number, taskType: string, inputSummary: string): Promise<number> {
  // 历史进程崩溃或请求超时后，旧任务不能永久阻塞同类任务。
  await recoverStaleRuns();
  // 防重复提交（PRD 12：防止重复提交产生重复版本）
  const running = await db
    .select({ id: agentRuns.id })
    .from(agentRuns)
    .where(and(eq(agentRuns.userId, userId), eq(agentRuns.taskType, taskType), or(eq(agentRuns.status, 'queued'), eq(agentRuns.status, 'running'))))
    .limit(1);
  if (running[0]) throw rateLimited('同类任务正在执行中，请等待完成后再试');
  const inserted = await db
    .insert(agentRuns)
    .values({ userId, taskType, status: 'queued', inputSummary, progress: 0, progressMessage: '等待执行' })
    .returning();
  return inserted[0].id;
}

export async function finishRun(
  runId: number,
  status: AgentRunStatus,
  extra: { errorCode?: string; errorDetail?: string; resultType?: string; resultId?: number } = {}
): Promise<void> {
  await db
    .update(agentRuns)
    .set({ status, finishedAt: new Date().toISOString(), progress: status === 'succeeded' ? 100 : undefined, progressMessage: status === 'succeeded' ? '已完成' : undefined, ...extra })
    .where(eq(agentRuns.id, runId));
}

export async function updateRunProgress(runId: number, progress: number, progressMessage: string): Promise<void> {
  await db.update(agentRuns).set({ progress: Math.max(0, Math.min(100, Math.round(progress))), progressMessage, status: 'running' }).where(eq(agentRuns.id, runId));
}

export async function cancelRun(userId: number, runId: number): Promise<void> {
  await db.update(agentRuns).set({ status: 'canceled', finishedAt: new Date().toISOString(), progressMessage: '已取消' }).where(and(eq(agentRuns.id, runId), eq(agentRuns.userId, userId), or(eq(agentRuns.status, 'queued'), eq(agentRuns.status, 'running'))));
}

export async function recoverStaleRuns(staleMs = 10 * 60 * 1000): Promise<number> {
  const cutoff = new Date(Date.now() - staleMs).toISOString();
  const staleCondition = and(
    or(eq(agentRuns.status, 'queued'), eq(agentRuns.status, 'running')),
    or(lt(agentRuns.startedAt, cutoff), lt(agentRuns.lockedAt, cutoff), and(eq(agentRuns.status, 'running'), isNull(agentRuns.lockedAt)))
  );
  const rows = await db.select({ id: agentRuns.id }).from(agentRuns).where(staleCondition);
  if (!rows.length) return 0;
  await db.update(agentRuns).set({
    status: 'failed',
    finishedAt: new Date().toISOString(),
    errorCode: 'STALE_RUN',
    errorDetail: '任务超过允许执行时间，已自动结束',
    lockedAt: null,
    workerId: null,
    progressMessage: '任务超时，已自动结束',
  }).where(staleCondition);
  return rows.length;
}

export async function getRun(userId: number, runId: number): Promise<AgentRunDTO> {
  const rows = await db.select().from(agentRuns).where(and(eq(agentRuns.id, runId), eq(agentRuns.userId, userId))).limit(1);
  const row = rows[0];
  if (!row) throw notFound('任务记录不存在');
  return {
    id: row.id,
    taskType: row.taskType,
    status: row.status as AgentRunStatus,
    errorCode: row.errorCode,
    resultRef: row.resultType && row.resultId ? { type: row.resultType, id: row.resultId } : null,
    inputSummary: row.inputSummary,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    progress: row.progress ?? 0,
    progressMessage: row.progressMessage ?? null,
  };
}

/** 异步执行（不阻塞请求；失败记录错误码） */
export function executeRun(runId: number, taskType: string, job: () => Promise<{ resultType: string; resultId: number }>): void {
  void (async () => {
    // Persist the running state before invoking the job. Without awaiting this
    // write, a fast follow-up tool call can still see the run as queued.
    await db
      .update(agentRuns)
      .set({
        status: 'running',
        startedAt: new Date().toISOString(),
        lockedAt: new Date().toISOString(),
        workerId: `worker-${process.pid}`,
        attemptCount: sql`${agentRuns.attemptCount} + 1`,
        progress: 5,
        progressMessage: '开始执行',
      })
      .where(eq(agentRuns.id, runId));
    return job();
  })()
    .then((r) => finishRun(runId, 'succeeded', r))
    .catch(async (err) => {
      const code = (err as { code?: string }).code ?? 'INTERNAL_ERROR';
      const detail = err instanceof Error ? err.message : String(err);
      const retryable = /timeout|network|fetch failed|ECONN|50[234]/i.test(detail);
      if (retryable) {
        const rows = await db.select({ attemptCount: agentRuns.attemptCount, maxAttempts: agentRuns.maxAttempts }).from(agentRuns).where(eq(agentRuns.id, runId)).limit(1);
        const attempt = rows[0]?.attemptCount ?? 1;
        const max = rows[0]?.maxAttempts ?? 2;
        if (attempt < max) {
          await db.update(agentRuns).set({ status: 'queued', nextRetryAt: new Date(Date.now() + 5000).toISOString(), lockedAt: null, workerId: null, progressMessage: `网络错误，${5} 秒后重试` }).where(eq(agentRuns.id, runId)).catch(() => {});
          setTimeout(() => executeRun(runId, taskType, job), 5000);
        } else await finishRun(runId, 'failed', { errorCode: code, errorDetail: detail.slice(0, 500) }).catch(() => {});
      }
      else await finishRun(runId, 'failed', { errorCode: code, errorDetail: detail.slice(0, 500) }).catch(() => {});
      if (code === 'INTERNAL_ERROR') console.error(`[agent-run:${runId}:${taskType}]`, err);
    });
}

export function agentConfigSummary(): { engine: 'pi-llm' | 'rules'; provider: string; model: string; baseUrl: string } {
  return { engine: currentEngine(), provider: config.agent.provider, model: config.agent.model, baseUrl: config.agent.baseUrl };
}
