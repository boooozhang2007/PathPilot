// 集成测试（PRD 13.8.4-7）：数据权限 / 规划版本 / 任务状态 / 跨端读取
// LLM 通道 mock 为固定合法结果（规则引擎兜底已移除，测试不再依赖网络）
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
let tokenA: string;
let tokenA2: string; // 同一账号第二台设备
let tokenB: string;
let userIdA: number;

async function register(email: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email, password: 'password123', nickname: '测试' },
  });
  expect(res.statusCode).toBe(200);
  return res.json().token;
}

async function putProfile(token: string): Promise<unknown> {
  return (
    await app.inject({
      method: 'PUT',
      url: '/api/profile',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        nickname: '测试同学',
        grade: 'sophomore',
        graduationDate: '2028-06-30',
        targetRole: 'Java 后端开发',
        careerPath: 'employment',
        weeklyHours: 10,
      },
    })
  ).json();
}

async function generateRoadmap(token: string): Promise<number> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/roadmaps',
    headers: { authorization: `Bearer ${token}` },
    payload: {},
  });
  expect(res.statusCode).toBe(202);
  const runId: number = res.json().run_id;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 200));
    const run = (await app.inject({ method: 'GET', url: `/api/agent/runs/${runId}`, headers: { authorization: `Bearer ${token}` } })).json();
    if (run.run.status === 'succeeded') return run.run.resultRef.id;
    if (run.run.status === 'failed') throw new Error(`roadmap failed: ${run.run.errorCode} ${run.run.errorDetail ?? ''}`);
  }
  throw new Error('roadmap run timeout');
}

beforeAll(async () => {
  app = await buildApp();
  tokenA = await register(`a${Date.now()}@t.cn`);
  tokenA2 = await register(`a${Date.now()}@t.cn`); // 另一账号用于设备B? 不 —— 跨端用同账号重新登录
  tokenB = tokenA2; // 先占位，实际跨端登录在用例内做
});

describe('用户系统与数据权限（PRD 13.1）', () => {
  it('未登录不能访问受保护数据', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/profile' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHORIZED');
  });

  it('登录后刷新可恢复（me 返回用户）', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { authorization: `Bearer ${tokenA}` } });
    expect(res.statusCode).toBe(200);
    userIdA = res.json().user.id;
  });

  it('同一账号在另一设备登录读取同样数据（跨端一致前提）', async () => {
    const email = `dup${Date.now()}@t.cn`;
    const t1 = await register(email);
    await putProfile(t1);
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password: 'password123' } });
    const t2: string = login.json().token;
    const p = (await app.inject({ method: 'GET', url: '/api/profile', headers: { authorization: `Bearer ${t2}` } })).json();
    expect(p.targetRole).toBe('Java 后端开发');
    expect(p.weeklyHours).toBe(10);
  });

  it('个人资料支持单字段保存且不会覆盖其它字段', async () => {
    const email = `patch${Date.now()}@t.cn`;
    const token = await register(email);
    const avatar = await app.inject({
      method: 'PUT',
      url: '/api/profile',
      headers: { authorization: `Bearer ${token}` },
      payload: { avatar: 'data:image/jpeg;base64,AA==' },
    });

    expect(avatar.statusCode).toBe(200);
    expect(avatar.json().avatar).toBe('data:image/jpeg;base64,AA==');
    expect(avatar.json().targetRole).toBe('');

    const nickname = await app.inject({
      method: 'PUT',
      url: '/api/profile',
      headers: { authorization: `Bearer ${token}` },
      payload: { nickname: '只保存昵称' },
    });
    expect(nickname.statusCode).toBe(200);
    expect(nickname.json().nickname).toBe('只保存昵称');
    expect(nickname.json().avatar).toBe('data:image/jpeg;base64,AA==');

    const clearedTarget = await app.inject({
      method: 'PUT',
      url: '/api/profile',
      headers: { authorization: `Bearer ${token}` },
      payload: { targetRole: '' },
    });
    expect(clearedTarget.statusCode).toBe(200);
    expect(clearedTarget.json().targetRole).toBe('');
    expect(clearedTarget.json().nickname).toBe('只保存昵称');
  });

  it('用户 A 无法读取用户 B 的资料/经历/任务（越权防护）', async () => {
    await putProfile(tokenA);
    await putProfile(tokenB);
    // A 给自己加一条经历
    const exp = await app.inject({
      method: 'POST',
      url: '/api/experiences',
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { type: 'project', title: 'A 的项目', technologies: ['Java'] },
    });
    const expId = exp.json().id;
    // B 尝试改 A 的经历
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/experiences/${expId}`,
      headers: { authorization: `Bearer ${tokenB}` },
      payload: { title: 'hack' },
    });
    expect(res.statusCode).toBe(404); // B 视角资源不存在（user_id 过滤）
    const del = await app.inject({ method: 'DELETE', url: `/api/experiences/${expId}`, headers: { authorization: `Bearer ${tokenB}` } });
    expect(del.statusCode).toBe(404);
  });
});

describe('规划版本与任务（PRD 13.4/13.5）', () => {
  let roadmapId: number;
  let taskId: number;

  it('生成分学期规划（每任务有时长与验收标准）', async () => {
    await putProfile(tokenA);
    roadmapId = await generateRoadmap(tokenA);
    const cur = (await app.inject({ method: 'GET', url: '/api/roadmaps/current', headers: { authorization: `Bearer ${tokenA}` } })).json();
    expect(cur.roadmap.version).toBe(1);
    expect(cur.tasks.length).toBeGreaterThan(3);
    for (const t of cur.tasks) {
      expect(t.estimatedHours).toBeGreaterThan(0);
      expect(t.acceptanceCriteria?.length).toBeGreaterThan(0);
    }
    taskId = cur.tasks[0].id;
  });

  it('任务状态更新 + 乐观锁冲突检测（PRD 10.4）', async () => {
    const task = (await app.inject({ method: 'GET', url: '/api/tasks', headers: { authorization: `Bearer ${tokenA}` } })).json().find((t: { id: number }) => t.id === taskId);
    // 设备1 用过期 updated_at 更新 → 409
    const stale = await app.inject({
      method: 'PATCH',
      url: `/api/tasks/${taskId}`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { status: 'in_progress', expectedUpdatedAt: '2020-01-01T00:00:00.000Z' },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.code).toBe('CONFLICT');
    // 正常更新（带正确 updated_at）
    const ok = await app.inject({
      method: 'PATCH',
      url: `/api/tasks/${taskId}`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { status: 'in_progress', expectedUpdatedAt: task.updatedAt },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().status).toBe('in_progress');
  });

  it('已完成任务状态不回退（状态机）', async () => {
    await app.inject({
      method: 'PATCH',
      url: `/api/tasks/${taskId}`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { status: 'done', actualHours: 40, evidenceUrl: 'https://github.com/x/y' },
    });
    const back = await app.inject({
      method: 'PATCH',
      url: `/api/tasks/${taskId}`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { status: 'not_started' },
    });
    expect(back.statusCode).toBe(400);
  });

  it('重规划生成新版本、保留已完成任务、旧版本不覆盖（PRD 4.6/10.3）', async () => {
    const run = await app.inject({
      method: 'POST',
      url: `/api/roadmaps/${roadmapId}/revise`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { weeklyHours: 6, reason: '测试重规划' },
    });
    expect(run.statusCode).toBe(202);
    const runId = run.json().run_id;
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 200));
      const s = (await app.inject({ method: 'GET', url: `/api/agent/runs/${runId}`, headers: { authorization: `Bearer ${tokenA}` } })).json();
      if (s.run.status === 'succeeded') break;
      if (s.run.status === 'failed') throw new Error(`revise failed: ${s.run.errorDetail}`);
    }
    const cur = (await app.inject({ method: 'GET', url: '/api/roadmaps/current', headers: { authorization: `Bearer ${tokenA}` } })).json();
    expect(cur.roadmap.version).toBe(2);
    expect(cur.roadmap.parentVersionId).toBe(roadmapId);
    // 已完成任务保留
    const done = cur.tasks.filter((t: { status: string }) => t.status === 'done');
    expect(done.length).toBe(1);
    expect(done[0].actualHours).toBe(40);
    // 历史版本仍可读
    const old = (await app.inject({ method: 'GET', url: `/api/roadmaps/${roadmapId}`, headers: { authorization: `Bearer ${tokenA}` } })).json();
    expect(old.roadmap.version).toBe(1);
    // 差异可见
    const diff = (await app.inject({ method: 'GET', url: `/api/roadmaps/${cur.roadmap.id}/diff`, headers: { authorization: `Bearer ${tokenA}` } })).json();
    expect(diff.hours_change.from).toBeGreaterThan(0);
    expect(Array.isArray(diff.reasons)).toBe(true);
  });

  it('/api/tasks 只返回当前生效版本的任务，不混入旧版本（回归）', async () => {
    const tasks = (await app.inject({ method: 'GET', url: '/api/tasks', headers: { authorization: `Bearer ${tokenA}` } })).json() as { title: string }[];
    const titles = tasks.map((t) => t.title);
    expect(titles).toEqual(expect.arrayContaining(['任务3', '任务5']));
    expect(titles).not.toContain('任务4');
    expect(titles).not.toContain('任务6');
  });

  it('跨端数据读取：设备2 重新登录读到设备1 的任务状态（PRD 13.6）', async () => {
    // 用 A 的凭据在“另一台设备”重新登录（新 token）
    const me = (await app.inject({ method: 'GET', url: '/api/auth/me', headers: { authorization: `Bearer ${tokenA}` } })).json();
    const email = `cross${me.user.id}@t.cn`;
    // 直接注册新用户模拟即可？不行——跨端必须是同账号。注册阶段的邮箱是随机的；
    // 这里改用 demo 账号双登录验证
    const demoLogin = async () =>
      (
        await app.inject({
          method: 'POST',
          url: '/api/auth/login',
          payload: { email: 'demo@pathpilot.ai', password: 'demo123456' },
        })
      ).json().token;
    const d1 = await demoLogin();
    const d2 = await demoLogin();
    // 设备1 更新任务（demo 账号任务 1）
    const tasks1 = (await app.inject({ method: 'GET', url: '/api/tasks', headers: { authorization: `Bearer ${d1}` } })).json();
    if (tasks1.length) {
      const upd = await app.inject({
        method: 'PATCH',
        url: `/api/tasks/${tasks1[0].id}`,
        headers: { authorization: `Bearer ${d1}` },
        payload: { status: 'in_progress' },
      });
      expect(upd.statusCode).toBe(200);
      // 设备2 读取到最新状态
      const tasks2 = (await app.inject({ method: 'GET', url: '/api/tasks', headers: { authorization: `Bearer ${d2}` } })).json();
      expect(tasks2.find((t: { id: number }) => t.id === tasks1[0].id).status).toBe('in_progress');
    }
  });

  it('B 用户不能修改/读取 A 的规划与任务（权限）', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/roadmaps/current', headers: { authorization: `Bearer ${tokenB}` } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toBeNull(); // B 没有规划，也不能看到 A 的
    const task = await app.inject({ method: 'PATCH', url: `/api/tasks/${taskId}`, headers: { authorization: `Bearer ${tokenB}` }, payload: { status: 'done' } });
    expect(task.statusCode).toBe(404);
  });
});

describe('统一错误格式（PRD §9）', () => {
  it('参数不合法返回 VALIDATION_ERROR', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/profile',
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { nickname: '', grade: 'bad-grade' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
    expect(res.json().error.message).toBeTruthy();
  });
});
