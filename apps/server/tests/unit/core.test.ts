import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../../src/db/client.js';
import { agentRuns, users } from '../../src/db/schema.js';
import { cancelRun, createRun, executeRun, finishRun, getRun, updateRunProgress } from '../../src/agent/core.js';

async function demoUserId(): Promise<number> {
  const row = await db.select({ id: users.id }).from(users).limit(1);
  if (!row[0]) throw new Error('test user missing');
  return row[0].id;
}

describe('Agent run lifecycle', () => {
  it('同类并发提交只创建一个任务', async () => {
    const userId = await demoUserId();
    const outcomes = await Promise.allSettled([
      createRun(userId, 'concurrent-run-test', 'first'),
      createRun(userId, 'concurrent-run-test', 'second'),
    ]);
    expect(outcomes.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((r) => r.status === 'rejected')).toHaveLength(1);
    const runId = (outcomes.find((r) => r.status === 'fulfilled') as PromiseFulfilledResult<number>).value;
    await cancelRun(userId, runId);
  });

  it('跨用户取消不会中止运行中的任务', async () => {
    const userId = await demoUserId();
    const runId = await createRun(userId, 'owner-cancel-test', 'owner');
    let signal: AbortSignal | undefined;
    let finish!: (result: { resultType: string; resultId: number }) => void;
    executeRun(runId, 'owner-cancel-test', async (ctx) => {
      signal = ctx.signal;
      return new Promise((resolve) => { finish = resolve; });
    });
    await expect(cancelRun(userId + 10000, runId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(signal?.aborted).toBe(false);
    expect((await getRun(userId, runId)).status).toBe('running');
    await cancelRun(userId, runId);
    expect(signal?.aborted).toBe(true);
    finish({ resultType: 'roadmap', resultId: 1 });
  });

  it('迟到的进度和完成回调不能重开或覆盖终态', async () => {
    const userId = await demoUserId();
    const runId = await createRun(userId, 'late-progress-test', 'progress');
    await finishRun(runId, 'succeeded', { resultType: 'roadmap', resultId: 9 });
    await updateRunProgress(runId, 30, '迟到的进度');
    await finishRun(runId, 'failed', { errorCode: 'INTERNAL_ERROR' });
    expect(await getRun(userId, runId)).toMatchObject({ status: 'succeeded', progress: 100, resultRef: { type: 'roadmap', id: 9 } });
  });

  it('重复调度只执行一次工作', async () => {
    const userId = await demoUserId();
    const runId = await createRun(userId, 'duplicate-dispatch-test', 'dispatch');
    let count = 0;
    const job = async () => { count++; return { resultType: 'roadmap', resultId: 1 }; };
    executeRun(runId, 'duplicate-dispatch-test', job);
    executeRun(runId, 'duplicate-dispatch-test', job);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(count).toBe(1);
    expect((await getRun(userId, runId)).status).toBe('succeeded');
  });
  it('cleans up stale runs before creating a same-type run', async () => {
    const userId = await demoUserId();
    const taskType = `stale-test-${Date.now()}`;
    const old = new Date(Date.now() - 11 * 60 * 1000).toISOString();
    const inserted = await db.insert(agentRuns).values({
      userId,
      taskType,
      status: 'running',
      startedAt: old,
      lockedAt: old,
      progress: 20,
      progressMessage: '测试旧任务',
    }).returning({ id: agentRuns.id });

    const runId = await createRun(userId, taskType, 'new request');
    expect(runId).not.toBe(inserted[0].id);
    const stale = await db.select({ status: agentRuns.status, errorCode: agentRuns.errorCode })
      .from(agentRuns).where(eq(agentRuns.id, inserted[0].id));
    expect(stale[0]).toEqual({ status: 'failed', errorCode: 'STALE_RUN' });
  });

  it('persists running and succeeded states for an async run', async () => {
    const userId = await demoUserId();
    const taskType = `lifecycle-test-${Date.now()}`;
    const runId = await createRun(userId, taskType, 'lifecycle');
    executeRun(runId, taskType, async () => ({ resultType: 'job_analysis', resultId: 1 }));

    for (let i = 0; i < 20; i += 1) {
      const run = await getRun(userId, runId);
      if (run.status === 'succeeded') {
        expect(run.resultRef).toEqual({ type: 'job_analysis', id: 1 });
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error('async run did not finish');
  });
});
