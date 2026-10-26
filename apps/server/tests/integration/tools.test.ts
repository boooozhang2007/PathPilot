// 工具层集成测试（全模块工具集）：以演示账号验证各模块工具真实可用且归属校验生效
// LLM 通道 mock 为固定合法结果（无网络依赖）
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

describe('全模块 Agent 工具集', () => {
  const names = () => buildAgentTools(demoUserId).map((t) => t.name);

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

  it('档案：upsert_skill 归一化写入（JS → JavaScript）', async () => {
    const tool = buildAgentTools(demoUserId).find((t) => t.name === 'upsert_skill')!;
    const res = await call<{ saved: string }>(tool, { skill_name: 'JS', level: 3, evidence_status: 'to_verify' });
    expect(res.saved).toBe('JavaScript'); // 词典归一化
    const skills = await listProfileSkills(demoUserId);
    expect(skills.some((s) => s.name === 'JavaScript' && s.evidenceStatus === 'to_verify')).toBe(true);
  });

  it('档案：create_experience 记录真实经历', async () => {
    const tool = buildAgentTools(demoUserId).find((t) => t.name === 'create_experience')!;
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
    const updTool = buildAgentTools(demoUserId).find((t) => t.name === 'update_task_status')!;
    const res = await call<{ updated: { id: number; status: string } }>(updTool, { task_id: target.id, status: 'in_progress', actual_hours: 3 });
    expect(res.updated.status).toBe('in_progress');
    // 已完成不可回退（状态机由 services 强制）
    await call(updTool, { task_id: target.id, status: 'done' });
    await expect(call(updTool, { task_id: target.id, status: 'not_started' })).rejects.toThrow();
  });

  it('任务：其他用户的任务不可操作（归属校验）', async () => {
    const demoTasks = await listRoadmapTasks(demoUserId);
    const otherTool = buildAgentTools(otherUserId).find((t) => t.name === 'update_task_status')!;
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

  it('岗位：fetch_job_page 拒绝白名单外域名（安全）', async () => {
    const tool = buildAgentTools(demoUserId).find((t) => t.name === 'fetch_job_page')!;
    await expect(call(tool, { url: 'https://evil.example.com/job' })).rejects.toThrow(/白名单/);
  });

  it('简历：generate_resume_draft 基于真实经历', async () => {
    const tool = buildAgentTools(demoUserId).find((t) => t.name === 'generate_resume_draft')!;
    const data = await call<{ draft: { sections: { heading: string }[] }; engine: string }>(tool, { target_role: 'Java 后端开发' });
    expect(data.draft.sections.length).toBeGreaterThan(0);
    expect(['pi-llm', 'rules']).toContain(data.engine);
  });
});
