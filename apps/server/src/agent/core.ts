// AgentService：PRD §6.2 六大业务接口的编排层
// 引擎选择：配置 AGENT_API_KEY → Pi LLM 通道；否则规则引擎降级（响应标注 engine）
import { and, eq } from 'drizzle-orm';
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
  // 防重复提交（PRD 12：防止重复提交产生重复版本）
  const running = await db
    .select({ id: agentRuns.id })
    .from(agentRuns)
    .where(and(eq(agentRuns.userId, userId), eq(agentRuns.taskType, taskType), eq(agentRuns.status, 'running')))
    .limit(1);
  if (running[0]) throw rateLimited('同类任务正在执行中，请等待完成后再试');
  const inserted = await db
    .insert(agentRuns)
    .values({ userId, taskType, status: 'running', inputSummary })
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
    .set({ status, finishedAt: new Date().toISOString(), ...extra })
    .where(eq(agentRuns.id, runId));
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
  };
}

/** 异步执行（不阻塞请求；失败记录错误码） */
export function executeRun(runId: number, taskType: string, job: () => Promise<{ resultType: string; resultId: number }>): void {
  job()
    .then((r) => finishRun(runId, 'succeeded', r))
    .catch(async (err) => {
      const code = (err as { code?: string }).code ?? 'INTERNAL_ERROR';
      const detail = err instanceof Error ? err.message : String(err);
      await finishRun(runId, 'failed', { errorCode: code, errorDetail: detail.slice(0, 500) }).catch(() => {});
      if (code === 'INTERNAL_ERROR') console.error(`[agent-run:${runId}:${taskType}]`, err);
    });
}

export function agentConfigSummary(): { engine: 'pi-llm' | 'rules'; provider: string; model: string; baseUrl: string } {
  return { engine: currentEngine(), provider: config.agent.provider, model: config.agent.model, baseUrl: config.agent.baseUrl };
}
