// AgentService：PRD §6.2 六大业务接口的编排层
// 引擎选择：配置 AGENT_API_KEY → Pi LLM 通道；否则规则引擎降级（响应标注 engine）
import { and, eq, lt, or, isNull, ne, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { agentRuns } from '../db/schema.js';
import { getLlmSettings, isLlmConfigured } from './settings.js';
import { rateLimited, notFound } from '../services/errors.js';
import type { AgentRunDTO } from '@pathpilot/shared';
import type { AgentRunStatus } from '@pathpilot/shared';

export async function currentEngine(): Promise<'pi-llm' | 'rules'> {
  return (await isLlmConfigured()) ? 'pi-llm' : 'rules';
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
  // 用户已取消的 run 不允许被后台完成回调覆盖
  await db
    .update(agentRuns)
    .set({ status, finishedAt: new Date().toISOString(), progress: status === 'succeeded' ? 100 : undefined, progressMessage: status === 'succeeded' ? '已完成' : undefined, ...extra })
    .where(and(eq(agentRuns.id, runId), ne(agentRuns.status, 'canceled')));
}

export async function updateRunProgress(runId: number, progress: number, progressMessage: string): Promise<void> {
  await db
    .update(agentRuns)
    .set({ progress: Math.max(0, Math.min(100, Math.round(progress))), progressMessage, status: 'running' })
    .where(and(eq(agentRuns.id, runId), ne(agentRuns.status, 'canceled')));
}

/** 运行中的任务控制器：取消时真正中止搜索/LLM/工具循环 */
const runControllers = new Map<number, AbortController>();

export async function cancelRun(userId: number, runId: number): Promise<void> {
  const controller = runControllers.get(runId);
  controller?.abort();
  await db
    .update(agentRuns)
    .set({ status: 'canceled', finishedAt: new Date().toISOString(), progressMessage: '已取消' })
    .where(and(eq(agentRuns.id, runId), eq(agentRuns.userId, userId), or(eq(agentRuns.status, 'queued'), eq(agentRuns.status, 'running'))));
  runControllers.delete(runId);
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
    errorDetail: row.errorDetail,
    resultRef: row.resultType && row.resultId ? { type: row.resultType, id: row.resultId } : null,
    inputSummary: row.inputSummary,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    progress: row.progress ?? 0,
    progressMessage: row.progressMessage ?? null,
  };
}

export interface RunJobContext {
  signal: AbortSignal;
  onProgress: (progress: number, message: string) => void;
}

/** 异步执行（不阻塞请求；失败记录错误码；支持进度上报与真正取消） */
export function executeRun(runId: number, taskType: string, job: (ctx: RunJobContext) => Promise<{ resultType: string; resultId: number }>): void {
  const controller = new AbortController();
  runControllers.set(runId, controller);
  void (async (): Promise<{ resultType: string; resultId: number } | null> => {
    const current = await db.select({ status: agentRuns.status }).from(agentRuns).where(eq(agentRuns.id, runId)).limit(1);
    if (!current[0] || current[0].status === 'canceled') return null;
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
      .where(and(eq(agentRuns.id, runId), ne(agentRuns.status, 'canceled')));
    return job({
      signal: controller.signal,
      onProgress: (progress, message) => {
        if (!controller.signal.aborted) void updateRunProgress(runId, progress, message).catch(() => {});
      },
    });
  })()
    .then((r) => (r ? finishRun(runId, 'succeeded', r) : null))
    .catch(async (err) => {
      if (controller.signal.aborted) return; // cancelRun 已经写入 canceled
      const code = (err as { code?: string }).code ?? 'INTERNAL_ERROR';
      const detail = err instanceof Error ? err.message : String(err);
      const retryable = /timeout|network|fetch failed|ECONN|50[234]/i.test(detail);
      if (retryable) {
        const rows = await db.select({ attemptCount: agentRuns.attemptCount, maxAttempts: agentRuns.maxAttempts, status: agentRuns.status }).from(agentRuns).where(eq(agentRuns.id, runId)).limit(1);
        if (rows[0]?.status === 'canceled') return;
        const attempt = rows[0]?.attemptCount ?? 1;
        const max = rows[0]?.maxAttempts ?? 2;
        if (attempt < max) {
          await db.update(agentRuns).set({ status: 'queued', nextRetryAt: new Date(Date.now() + 5000).toISOString(), lockedAt: null, workerId: null, progressMessage: '网络错误，5 秒后重试' }).where(and(eq(agentRuns.id, runId), ne(agentRuns.status, 'canceled'))).catch(() => {});
          setTimeout(() => executeRun(runId, taskType, job), 5000);
        } else await finishRun(runId, 'failed', { errorCode: code, errorDetail: detail.slice(0, 500) }).catch(() => {});
      }
      else await finishRun(runId, 'failed', { errorCode: code, errorDetail: detail.slice(0, 500) }).catch(() => {});
      if (code === 'INTERNAL_ERROR') console.error(`[agent-run:${runId}:${taskType}]`, err);
    })
    .finally(() => {
      if (runControllers.get(runId) === controller) runControllers.delete(runId);
    });
}

export async function agentConfigSummary(): Promise<{ engine: 'pi-llm' | 'rules'; provider: string; model: string; baseUrl: string }> {
  const [engine, cfg] = await Promise.all([currentEngine(), getLlmSettings()]);
  return { engine, provider: cfg.provider, model: cfg.model, baseUrl: cfg.baseUrl };
}
