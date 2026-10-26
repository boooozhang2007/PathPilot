import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../../src/db/client.js';
import { agentRuns, users } from '../../src/db/schema.js';
import { createRun, executeRun, getRun } from '../../src/agent/core.js';

async function demoUserId(): Promise<number> {
  const row = await db.select({ id: users.id }).from(users).limit(1);
  if (!row[0]) throw new Error('test user missing');
  return row[0].id;
}

describe('Agent run lifecycle', () => {
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
