import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { signToken } from '../../src/auth/index.js';
import { db } from '../../src/db/client.js';
import { users } from '../../src/db/schema.js';
import { addRoadmapTask, listRoadmapTasks, saveRoadmapVersion, updateTask } from '../../src/services/roadmapService.js';
import { GEN_ROADMAP } from '../fixtures/llmFixtures.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;
let userId: number;
let token: string;
let foreignTaskId: number;
let archivedTaskId: number;

beforeAll(async () => {
  app = await buildApp();
  const inserted = await db.insert(users).values([
    { email: `graph-${Date.now()}@t.cn`, passwordHash: 'unused' },
    { email: `graph-foreign-${Date.now()}@t.cn`, passwordHash: 'unused' },
  ]).returning();
  userId = inserted[0].id;
  token = await signToken(userId);
  const save = async (id: number) => saveRoadmapVersion({ userId: id, parentVersionId: null, targetRole: 'Java', careerPath: 'employment', weeklyHours: 10, content: structuredClone(GEN_ROADMAP), engine: 'pi-llm', generationReason: 'test' });
  await save(inserted[1].id);
  foreignTaskId = (await listRoadmapTasks(inserted[1].id))[0].id;
  await save(userId);
  archivedTaskId = (await listRoadmapTasks(userId))[0].id;
  await save(userId);
});

afterAll(async () => { await app.close(); });

async function task(title: string, parentTaskId?: number) {
  return addRoadmapTask(userId, { title, semester: 3, description: title, estimatedHours: 1, priority: 'medium', parentTaskId });
}

async function patch(id: number, payload: Record<string, unknown>) {
  return app.inject({ method: 'PATCH', url: `/api/tasks/${id}`, headers: { authorization: `Bearer ${token}` }, payload });
}

describe('任务关联隔离与状态一致性', () => {
  it.each(['parentTaskId', 'dependencyIds'])('%s 拒绝其他用户、历史版本与不存在的任务，且不修改记录', async (field) => {
    const current = await task(`isolated-${field}`);
    for (const id of [foreignTaskId, archivedTaskId, 99999999]) {
      const response = await patch(current.id, { [field]: field === 'dependencyIds' ? [id] : id });
      expect(response.statusCode).toBe(400);
    }
    const unchanged = (await listRoadmapTasks(userId)).find((t) => t.id === current.id)!;
    expect(unchanged.parentTaskId).toBeNull();
    expect(unchanged.dependencyIds).toEqual([]);
  });

  it('父任务不能指向自身或后代', async () => {
    const parent = await task('parent');
    const child = await task('child', parent.id);
    expect((await patch(parent.id, { parentTaskId: parent.id })).statusCode).toBe(400);
    expect((await patch(parent.id, { parentTaskId: child.id })).statusCode).toBe(400);
  });

  it('前置任务不能指向自身或形成循环', async () => {
    const first = await task('dependency-first');
    const second = await task('dependency-second');
    expect((await patch(first.id, { dependencyIds: [first.id] })).statusCode).toBe(400);
    expect((await patch(first.id, { dependencyIds: [second.id] })).statusCode).toBe(200);
    expect((await patch(second.id, { dependencyIds: [first.id] })).statusCode).toBe(400);
  });

  it('同时修改前置任务并开始任务时，校验新的前置任务', async () => {
    const blocked = await task('blocked');
    const prerequisite = await task('prerequisite');
    expect((await patch(blocked.id, { status: 'in_progress', dependencyIds: [prerequisite.id] })).statusCode).toBe(400);
    expect((await listRoadmapTasks(userId)).find((t) => t.id === blocked.id)?.status).toBe('not_started');
    await updateTask(userId, prerequisite.id, { status: 'done' });
    expect((await patch(blocked.id, { status: 'in_progress', dependencyIds: [prerequisite.id] })).statusCode).toBe(200);
  });

  it('Agent 新建任务同样拒绝跨用户和历史版本的前置任务', async () => {
    for (const id of [foreignTaskId, archivedTaskId]) {
      await expect(addRoadmapTask(userId, { title: 'invalid-dependency', semester: 3, description: 'test', estimatedHours: 1, priority: 'medium', dependencyIds: [id] })).rejects.toMatchObject({ statusCode: 400 });
    }
  });

  it('并发更新使用同一版本时只有一次写入成功', async () => {
    const current = await task('concurrent');
    const results = await Promise.allSettled([
      updateTask(userId, current.id, { title: 'device one', expectedUpdatedAt: current.updatedAt }),
      updateTask(userId, current.id, { title: 'device two', expectedUpdatedAt: current.updatedAt }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect((results.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason).toMatchObject({ statusCode: 409 });
  });
});
