// 工具层集成测试（全模块工具集）：以演示账号验证各模块工具真实可用且归属校验生效
// LLM 通道 mock 为固定合法结果（无网络依赖）
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';

vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(async () => [{ address: '93.184.216.34', family: 4 }]),
}));

vi.mock('../../src/agent/search/liepin.js', () => ({
  liepinConfigured: () => false,
  liepinSearchJobs: vi.fn(async () => ({ samples: [], ok: false, note: '猎聘通道测试未启用' })),
}));

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

import { buildAgentTools } from '../../src/agent/pi/tools.js';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import { generateRoadmap } from '../../src/agent/planner.js';
import { db } from '../../src/db/client.js';
import { users } from '../../src/db/schema.js';
import { eq } from 'drizzle-orm';
import { getProfile, listProfileSkills, listExperiences } from '../../src/services/profileService.js';
import { listRoadmapTasks } from '../../src/services/roadmapService.js';

const DEMO_EMAIL = 'demo@pathpilot.ai';
let demoUserId: number;
let otherUserId: number;

async function call<T = any>(tool: AgentTool<any>, params: unknown): Promise<T> {
  const res = await tool.execute('test', params);
  return JSON.parse((res.content as { text: string }[])[0].text) as T;
}

beforeAll(async () => {
  demoUserId = (await db.select().from(users).where(eq(users.email, DEMO_EMAIL)).limit(1))[0]!.id;
  // 第二个用户用于越权验证
  const otherEmail = `tool-other-${Date.now()}@t.cn`;
  const inserted = await db.insert(users).values({ email: otherEmail, passwordHash: 'x' }).returning();
  otherUserId = inserted[0].id;
  // 演示账号生成规划（规则引擎，无网络依赖）
  await generateRoadmap(demoUserId, {});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('全模块 Agent 工具集', () => {
  const names = () => buildAgentTools(demoUserId).map((t) => t.name);
  // 写工具需要会话级「自动写入」开关（默认关闭，安全审查修复）
  const writeTools = () => buildAgentTools(demoUserId, { autoWrite: true });

  it('覆盖全部业务模块（20 个工具）', () => {
    const expected = [
      'get_user_profile', 'upsert_skill', 'create_experience', // 档案
      'get_tasks', 'update_task_status', // 任务
      'get_current_roadmap', 'get_roadmap_versions', 'generate_roadmap', 'create_roadmap_revision',
      'roadmap_add_task', 'roadmap_update_task', 'roadmap_remove_task', // 规划（含编辑）
      'get_job_analysis', 'analyze_jobs', 'analyze_skill_gap', 'search_jobs', 'fetch_job_page', 'extract_requirements', // 统一岗位搜索
      'normalize_skills', 'generate_resume_draft', // 归一化/简历
    ];
    expect(names().sort()).toEqual([...expected].sort());
  });

  it('岗位分析工具由 Pi 当前循环同步返回结果', () => {
    const tool = buildAgentTools(demoUserId).find((t) => t.name === 'analyze_jobs')!;
    expect(tool.description).toContain('同步完成');
    expect(tool.description).not.toContain('run_id');
  });

  it('档案：get_user_profile 返回真实档案', async () => {
    const tool = buildAgentTools(demoUserId).find((t) => t.name === 'get_user_profile')!;
    const data = await call<{ profile: { nickname: string } }>(tool, {});
    expect(data.profile.nickname).toBe('演示同学');
  });

  it('写工具默认被自动写入开关拦截（安全）', async () => {
    const tool = buildAgentTools(demoUserId).find((t) => t.name === 'update_task_status')!;
    const tasks = await listRoadmapTasks(demoUserId);
    await expect(call(tool, { task_id: tasks[0].id, status: 'in_progress' })).rejects.toThrow(/自动写入/);
  });

  it('档案：upsert_skill 归一化写入（JS → JavaScript）', async () => {
    const tool = writeTools().find((t) => t.name === 'upsert_skill')!;
    const res = await call<{ saved: string }>(tool, { skill_name: 'JS', level: 3, evidence_status: 'to_verify' });
    expect(res.saved).toBe('JavaScript'); // 词典归一化
    const skills = await listProfileSkills(demoUserId);
    expect(skills.some((s) => s.name === 'JavaScript' && s.evidenceStatus === 'to_verify')).toBe(true);
  });

  it('档案：模型声称已掌握但没有提供证据时保留待验证', async () => {
    const tool = writeTools().find((t) => t.name === 'upsert_skill')!;
    await call(tool, { skill_name: 'Redis', level: 3, evidence_status: 'evidenced' });
    expect((await listProfileSkills(demoUserId)).find((s) => s.name === 'Redis')?.evidenceStatus).toBe('to_verify');
  });

  it('档案：create_experience 记录真实经历', async () => {
    const tool = writeTools().find((t) => t.name === 'create_experience')!;
    const res = await call<{ saved: string }>(tool, { type: 'project', title: '课程设计：图书管理系统', technologies: ['Java', 'MySQL'] });
    expect(res.saved).toBe('课程设计：图书管理系统');
    const list = await listExperiences(demoUserId);
    expect(list.some((e) => e.title === '课程设计：图书管理系统')).toBe(true);
  });

  it('任务：get_tasks + update_task_status 状态机真实生效', async () => {
    const tasks = await listRoadmapTasks(demoUserId);
    expect(tasks.length).toBeGreaterThan(0);
    const getTool = buildAgentTools(demoUserId).find((t) => t.name === 'get_tasks')!;
    const list = await call<{ id: number; status: string }[]>(getTool, { status: 'not_started' });
    expect(list.length).toBeGreaterThan(0);
    const target = list[0];
    const updTool = writeTools().find((t) => t.name === 'update_task_status')!;
    const res = await call<{ updated: { id: number; status: string } }>(updTool, { task_id: target.id, status: 'in_progress', actual_hours: 3 });
    expect(res.updated.status).toBe('in_progress');
    // 已完成不可回退（状态机由 services 强制）
    await call(updTool, { task_id: target.id, status: 'done' });
    await expect(call(updTool, { task_id: target.id, status: 'not_started' })).rejects.toThrow();
  });

  it('任务：其他用户的任务不可操作（归属校验）', async () => {
    const demoTasks = await listRoadmapTasks(demoUserId);
    const otherTool = buildAgentTools(otherUserId, { autoWrite: true }).find((t) => t.name === 'update_task_status')!;
    await expect(call(otherTool, { task_id: demoTasks[0].id, status: 'done' })).rejects.toThrow(/不存在或不属于/);
  });

  it('规划：get_current_roadmap / get_roadmap_versions 返回版本数据', async () => {
    const cur = buildAgentTools(demoUserId).find((t) => t.name === 'get_current_roadmap')!;
    const data = await call<{ version: number; tasks: unknown[] }>(cur, {});
    expect(data.version).toBeGreaterThanOrEqual(1);
    expect(data.tasks.length).toBeGreaterThan(0);
    const ver = buildAgentTools(demoUserId).find((t) => t.name === 'get_roadmap_versions')!;
    const versions = await call<{ version: number }[]>(ver, {});
    expect(versions.length).toBeGreaterThanOrEqual(1);
  });

  it('规划：添加、编辑和删除任务同步真实任务与规划内容', async () => {
    const add = writeTools().find((t) => t.name === 'roadmap_add_task')!;
    const edit = writeTools().find((t) => t.name === 'roadmap_update_task')!;
    const remove = writeTools().find((t) => t.name === 'roadmap_remove_task')!;
    const result = await call<{ added: { id: number } }>(add, { title: '工具新建任务', semester: 3, description: '编写真实项目测试', estimated_hours: 2, priority: 'medium' });
    const changed = await call<{ updated: { title: string; estimatedHours: number } }>(edit, { task_id: result.added.id, title: '工具编辑任务', estimated_hours: 3 });
    expect(changed.updated.title).toBe('工具编辑任务');
    expect(changed.updated.estimatedHours).toBe(3);
    const current = buildAgentTools(demoUserId).find((t) => t.name === 'get_current_roadmap')!;
    const snapshot = await call<{ content: { tasks: { title: string }[] } }>(current, {});
    expect(snapshot.content.tasks.some((t) => t.title === '工具编辑任务')).toBe(true);
    await call(remove, { task_id: result.added.id });
    expect((await listRoadmapTasks(demoUserId)).some((t) => t.id === result.added.id)).toBe(false);
  });

  it('工具被取消时不会执行写入', async () => {
    const tool = writeTools().find((t) => t.name === 'upsert_skill')!;
    await expect(tool.execute('test', { skill_name: 'NeverAdded', level: 1, evidence_status: 'to_verify' }, AbortSignal.abort())).rejects.toThrow('取消');
    expect((await listProfileSkills(demoUserId)).some((s) => s.name === 'NeverAdded')).toBe(false);
  });

  it('规划：create_roadmap_revision 生成新版本且保留已完成任务（PRD 4.6）', async () => {
    // 先完成一个任务
    const tasks = await listRoadmapTasks(demoUserId);
    const { updateTask } = await import('../../src/services/roadmapService.js');
    await updateTask(demoUserId, tasks[0].id, { status: 'done', actualHours: 10 });
    const tool = buildAgentTools(demoUserId).find((t) => t.name === 'create_roadmap_revision')!;
    const res = await call<{ newVersion: number; parentVersion: number }>(tool, { weekly_hours: 6, reason: '工具测试：时间调整' });
    expect(res.newVersion).toBeGreaterThan(res.parentVersion);
    const after = await listRoadmapTasks(demoUserId);
    const doneKept = after.filter((t) => t.status === 'done');
    expect(doneKept.length).toBeGreaterThanOrEqual(1);
  });

  it('岗位：analyze_skill_gap 基于真实样本给出匹配结果', async () => {
    const tool = buildAgentTools(demoUserId).find((t) => t.name === 'analyze_skill_gap')!;
    const data = await call<{ target_role: string; rationale: string }>(tool, {});
    expect(data.rationale).toContain('匹配度');
  });

  it('归一化：normalize_skills 保留原始词条映射', async () => {
    const tool = buildAgentTools(demoUserId).find((t) => t.name === 'normalize_skills')!;
    const refs = await call<{ original: string; normalized: string }[]>(tool, { skills: ['JS', 'Postgres'] });
    expect(refs.map((r) => r.normalized)).toEqual(['JavaScript', 'PostgreSQL']);
  });

  it('岗位：extract_requirements 从 JD 文本抽取技能', async () => {
    const tool = buildAgentTools(demoUserId).find((t) => t.name === 'extract_requirements')!;
    const data = await call<{ skills: string[] }>(tool, {
      job_description: '岗位职责：负责后端开发。任职要求：本科及以上，熟悉 Java、Spring Boot、MySQL，具备良好的沟通能力与团队协作精神，有 Redis 经验优先。',
    });
    expect(data.skills).toEqual(expect.arrayContaining(['Java', 'Spring Boot', 'MySQL', 'Redis']));
  });

  it('岗位：fetch_job_page 接受非白名单公开招聘域名（不做域名准入）', async () => {
    const html = '<html><body>岗位职责：负责后端接口开发、需求评审、技术方案设计、单元测试与接口文档维护，参与代码评审并持续优化系统性能。任职要求：本科及以上，熟悉 Java、Spring Boot、MySQL，具备良好的沟通能力，能够定位并解决线上问题。这段正文包含足够完整的岗位信息。</body></html>';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(html)));
    const tool = buildAgentTools(demoUserId).find((t) => t.name === 'fetch_job_page')!;
    const result = await call<{ url: string; description: string }>(tool, { url: 'https://jobs.example.com/backend' });
    expect(result.url).toBe('https://jobs.example.com/backend');
    expect(result.description).toContain('网页内容开始');
    vi.unstubAllGlobals();
  });

  it('岗位：search_jobs 成功调用搜索服务并返回结构化结果', async () => {
    const target = 'https://jobs.example.com/frontend';
    const encoded = Buffer.from(target, 'utf8').toString('base64url');
    const searchHtml = `<html><li class="b_algo"><h2><a href="https://www.bing.com/ck/a?u=a1${encoded}">前端开发实习</a></h2></li></html>`;
    const pageHtml = '<html><body>岗位职责：负责 Web 前端页面开发、需求评审、技术方案设计、联调与单元测试，参与代码评审并持续优化页面性能。任职要求：本科及以上，熟悉 HTML、CSS、JavaScript、React，具备良好的沟通能力，能够定位并解决浏览器兼容问题。这段正文包含足够完整的岗位信息。</body></html>';
    vi.stubGlobal('fetch', vi.fn(async (url) => new Response(String(url).includes('bing.com/search') ? searchHtml : pageHtml)));
    const tool = buildAgentTools(demoUserId).find((t) => t.name === 'search_jobs')!;
    const result = await call<{ ok: boolean; samples: { source_url: string }[]; note: string }>(tool, {
      target_role: '前端开发', employment_type: 'internship', sample_limit: 3,
    });
    expect(result.ok).toBe(true);
    expect(result.samples.map((s) => s.source_url)).toContain(target);
    expect(result.note).not.toContain('白名单');
    vi.unstubAllGlobals();
  });

  it('岗位：search_jobs 失败时透传 SEARCH_FAILED 与具体原因', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('network down'))));
    const tool = buildAgentTools(demoUserId).find((t) => t.name === 'search_jobs')!;
    await expect(call(tool, { target_role: '后端开发', employment_type: 'full_time', sample_limit: 3 })).rejects.toMatchObject({
      code: 'SEARCH_FAILED',
      message: expect.stringContaining('network down'),
    });
    vi.unstubAllGlobals();
  });

  it('简历：generate_resume_draft 基于真实经历', async () => {
    const tool = buildAgentTools(demoUserId).find((t) => t.name === 'generate_resume_draft')!;
    const data = await call<{ draft: { sections: { heading: string }[] }; engine: string }>(tool, { target_role: 'Java 后端开发' });
    expect(data.draft.sections.length).toBeGreaterThan(0);
    expect(['pi-llm', 'rules']).toContain(data.engine);
  });
});
