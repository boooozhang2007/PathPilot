// 集成测试：学习提醒 / 周期总结 / 规划分享（PRD P1 / P2）
import { describe, it, expect, beforeAll, vi } from 'vitest';

vi.mock('../../src/agent/pi/runtime.js', async (importOriginal) => {
  const mod = await importOriginal<Record<string, unknown>>();
  const { runtimeMock } = await import('../fixtures/llmFixtures.js');
  return { ...mod, ...runtimeMock };
});
vi.mock('../../src/agent/settings.js', async (importOriginal) => {
  const mod = await importOriginal<Record<string, unknown>>();
  const { settingsMock } = await import('../fixtures/llmFixtures.js');
  return { ...mod, ...settingsMock };
});

import { buildApp } from '../../src/app.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;
let token: string;

async function register(email: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email, password: 'password123', nickname: '测试' },
  });
  expect(res.statusCode).toBe(200);
  return res.json().token;
}

async function putProfile(t: string): Promise<void> {
  await app.inject({
    method: 'PUT',
    url: '/api/profile',
    headers: { authorization: `Bearer ${t}` },
    payload: {
      nickname: '测试同学',
      grade: 'sophomore',
      graduationDate: '2028-06-30',
      targetRole: 'Java 后端开发',
      careerPath: 'employment',
      weeklyHours: 10,
    },
  });
}

async function generateRoadmap(t: string): Promise<number> {
  const res = await app.inject({ method: 'POST', url: '/api/roadmaps', headers: { authorization: `Bearer ${t}` }, payload: {} });
  expect(res.statusCode).toBe(202);
  const runId: number = res.json().run_id;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 200));
    const run = (await app.inject({ method: 'GET', url: `/api/agent/runs/${runId}`, headers: { authorization: `Bearer ${t}` } })).json();
    if (run.run.status === 'succeeded') return run.run.resultRef.id;
    if (run.run.status === 'failed') throw new Error(`roadmap failed: ${run.run.errorCode} ${run.run.errorDetail ?? ''}`);
  }
  throw new Error('roadmap run timeout');
}

beforeAll(async () => {
  app = await buildApp();
  token = await register(`rem${Date.now()}@t.cn`);
});

describe('学习提醒与周期总结（PRD P1）', () => {
  it('未登录访问被拒绝', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/reminders' });
    expect(res.statusCode).toBe(401);
  });

  it('有档案无任务时返回 weeklySummary 与空 reminders', async () => {
    await putProfile(token);
    const res = await app.inject({ method: 'GET', url: '/api/reminders', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.reminders)).toBe(true);
    expect(body.weeklySummary).not.toBeNull();
  });

  it('dismiss 不存在的提醒返回 404', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/reminders/999999/dismiss', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(404);
  });
});

describe('规划分享（PRD P2）', () => {
  it('分享不存在的规划返回 404', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/roadmaps/999999/share', headers: { authorization: `Bearer ${token}` }, payload: {} });
    expect(res.statusCode).toBe(404);
  });

  it('公开读取无效 token 返回 404', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/share/nonexistent-token' });
    expect(res.statusCode).toBe(404);
  });

  it('创建分享 → 公开只读 → 撤销 → 失效', async () => {
    const roadmapId = await generateRoadmap(token);

    const create = await app.inject({ method: 'POST', url: `/api/roadmaps/${roadmapId}/share`, headers: { authorization: `Bearer ${token}` }, payload: {} });
    expect(create.statusCode).toBe(200);
    const share = create.json();
    expect(share.token).toBeTruthy();
    expect(share.url).toContain(share.token);
    expect(share.expiresAt).toBeTruthy();

    const owner = await app.inject({ method: 'GET', url: `/api/roadmaps/${roadmapId}/share`, headers: { authorization: `Bearer ${token}` } });
    expect(owner.json().token).toBe(share.token);

    const pub = await app.inject({ method: 'GET', url: `/api/share/${share.token}` });
    expect(pub.statusCode).toBe(200);
    const pubBody = pub.json();
    expect(pubBody.targetRole).toBe('Java 后端开发');
    expect(Array.isArray(pubBody.tasks)).toBe(true);
    expect(pubBody.tasks.length).toBeGreaterThan(0);
    // 只读快照不泄露个人隐私
    expect(pubBody.userId).toBeUndefined();
    expect(pubBody.email).toBeUndefined();

    const del = await app.inject({ method: 'DELETE', url: `/api/roadmaps/${roadmapId}/share`, headers: { authorization: `Bearer ${token}` } });
    expect(del.statusCode).toBe(200);

    const after = await app.inject({ method: 'GET', url: `/api/share/${share.token}` });
    expect(after.statusCode).toBe(404);
  });
});
