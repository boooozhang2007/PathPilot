// 规划/任务/顾问/简历路由（PRD §9）
import type { FastifyInstance } from 'fastify';
import {
  generateRoadmapInput,
  reviseRoadmapInput,
  taskUpdateInput,
  taskBatchDeleteInput,
  taskEvidenceInput,
  agentChatInput,
  agentSessionRenameInput,
  resumeDraftInput,
} from '@pathpilot/shared';
import { getUserId } from '../auth/index.js';
import {
  getActiveRoadmap,
  getRoadmap,
  listRoadmaps,
  listRoadmapTasks,
  getTasksOfRoadmap,
  diffRoadmapVersions,
  updateTask,
  updateRoadmapTaskFields,
  removeRoadmapTask,
  removeRoadmapTasks,
  addTaskEvidence,
} from '../services/roadmapService.js';
import { generateRoadmap, reviseRoadmap } from '../agent/planner.js';
import { chat, chatHistory, latestSession, listSessions, deleteSession, renameSession, clearAllSessions } from '../agent/advisor.js';
import { resumeDraft } from '../agent/resume.js';
import { createRun, executeRun, getRun, agentConfigSummary } from '../agent/core.js';
import { analyzeGapByRules } from '../agent/rules/chat.js';
import { buildUserContext } from '../agent/context.js';
import { badRequest } from '../services/errors.js';
import { currentSemesterOf, semesterLabel } from '../services/semester.js';
import { getProfile, listExperiences, listProfileSkills } from '../services/profileService.js';
import { latestAnalysis } from '../services/analysisService.js';
import type { DashboardData, GrowthStats } from '@pathpilot/shared';

export async function roadmapRoutes(app: FastifyInstance): Promise<void> {
  const auth = app.authPreHandler;

  // ---------- 规划 ----------
  app.post('/api/roadmaps', { preHandler: [auth] }, async (req, reply) => {
    const userId = getUserId(req);
    const input = generateRoadmapInput.parse(req.body);
    const runId = await createRun(userId, 'generate_roadmap', `生成规划·${input.targetRole ?? '当前目标'}`);
    executeRun(runId, 'generate_roadmap', async () => {
      const outcome = await generateRoadmap(userId, input);
      return { resultType: 'roadmap', resultId: outcome.roadmap!.id };
    });
    reply.code(202);
    return { run_id: runId, status: 'running' };
  });

  app.get('/api/roadmaps', { preHandler: [auth] }, async (req) => listRoadmaps(getUserId(req)));

  app.get('/api/roadmaps/current', { preHandler: [auth] }, async (req) => {
    const roadmap = await getActiveRoadmap(getUserId(req));
    if (!roadmap) return null;
    const tasks = await getTasksOfRoadmap(roadmap.id);
    return { roadmap, tasks };
  });

  app.get('/api/roadmaps/:id', { preHandler: [auth] }, async (req) => {
    const { id } = req.params as { id: string };
    const roadmap = await getRoadmap(getUserId(req), Number(id));
    const tasks = await getTasksOfRoadmap(roadmap.id);
    return { roadmap, tasks };
  });

  app.post('/api/roadmaps/:id/revise', { preHandler: [auth] }, async (req, reply) => {
    const userId = getUserId(req);
    const { id } = req.params as { id: string };
    const current = await getRoadmap(userId, Number(id));
    const input = reviseRoadmapInput.parse(req.body);
    const runId = await createRun(userId, 'revise_roadmap', `重规划·${input.reason ?? '条件调整'}`);
    executeRun(runId, 'revise_roadmap', async () => {
      // 以指定版本为基线重规划
      const outcome = await reviseRoadmap(userId, input);
      return { resultType: 'roadmap', resultId: outcome.roadmap!.id };
    });
    void current;
    reply.code(202);
    return { run_id: runId, status: 'running' };
  });

  app.get('/api/roadmaps/:id/versions', { preHandler: [auth] }, async (req) => listRoadmaps(getUserId(req)));

  app.get('/api/roadmaps/:id/diff', { preHandler: [auth] }, async (req) => {
    const userId = getUserId(req);
    const { id } = req.params as { id: string };
    const { compare } = req.query as { compare?: string };
    return diffRoadmapVersions(userId, Number(id), compare ? Number(compare) : undefined);
  });

  // ---------- 任务 ----------
  app.get('/api/tasks', { preHandler: [auth] }, async (req) => {
    const { roadmapId } = req.query as { roadmapId?: string };
    return listRoadmapTasks(getUserId(req), roadmapId ? Number(roadmapId) : undefined);
  });

  app.patch('/api/tasks/:id', { preHandler: [auth] }, async (req) => {
    const userId = getUserId(req);
    const { id } = req.params as { id: string };
    const input = taskUpdateInput.parse(req.body);
    const taskId = Number(id);
    // 内容编辑字段（标题/学期/任务说明/时长/优先级/产出/验收）→ 走字段编辑；状态字段走状态机
    const contentKeys = ['title', 'semester', 'description', 'estimatedHours', 'deliverable', 'acceptanceCriteria'] as const;
    const contentPatch: Record<string, unknown> = {};
    for (const k of contentKeys) if (input[k] !== undefined) contentPatch[k] = input[k];
    const statusPatch = {
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.actualHours !== undefined ? { actualHours: input.actualHours } : {}),
      ...(input.evidenceUrl !== undefined ? { evidenceUrl: input.evidenceUrl } : {}),
      ...(input.resultNote !== undefined ? { resultNote: input.resultNote } : {}),
      ...(input.priority !== undefined && !contentPatch.priority ? { priority: input.priority } : {}),
      ...(input.deferredReason !== undefined ? { deferredReason: input.deferredReason } : {}),
      ...(input.parentTaskId !== undefined ? { parentTaskId: input.parentTaskId } : {}),
      ...(input.taskType !== undefined ? { taskType: input.taskType } : {}),
      ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
      ...(input.dependencyIds !== undefined ? { dependencyIds: input.dependencyIds } : {}),
      ...(input.completionRule !== undefined ? { completionRule: input.completionRule } : {}),
    };
    let updated = null as Awaited<ReturnType<typeof updateTask>> | null;
    if (Object.keys(contentPatch).length) {
      updated = await updateRoadmapTaskFields(userId, taskId, contentPatch as never);
    }
    if (Object.keys(statusPatch).length || input.expectedUpdatedAt) {
      updated = await updateTask(userId, taskId, { ...statusPatch, expectedUpdatedAt: input.expectedUpdatedAt });
    }
    if (!updated) throw badRequest('未提供任何更新字段');
    return updated;
  });

  app.delete('/api/tasks/:id', { preHandler: [auth] }, async (req) => {
    const { id } = req.params as { id: string };
    await removeRoadmapTask(getUserId(req), Number(id));
    return { ok: true };
  });

  app.post('/api/tasks/batch-delete', { preHandler: [auth] }, async (req) => {
    const input = taskBatchDeleteInput.parse(req.body);
    const deleted = await removeRoadmapTasks(getUserId(req), input.ids);
    return { ok: true, deleted };
  });

  app.post('/api/tasks/:id/evidence', { preHandler: [auth] }, async (req) => {
    const { id } = req.params as { id: string };
    const input = taskEvidenceInput.parse(req.body);
    return addTaskEvidence(getUserId(req), Number(id), input);
  });

  // ---------- AI 顾问 ----------
  app.post('/api/agent/chat/stream', { preHandler: [auth] }, async (req, reply) => {
    const { streamChat } = await import('../agent/stream.js');
    return streamChat(req, reply);
  });

  app.post('/api/agent/chat', { preHandler: [auth] }, async (req) => {
    const userId = getUserId(req);
    const input = agentChatInput.parse(req.body);
    return chat(userId, input); // input.model 由前端传入（模型选择器）
  });

  app.get('/api/agent/session', { preHandler: [auth] }, async (req) => latestSession(getUserId(req)));

  app.get('/api/agent/sessions', { preHandler: [auth] }, async (req) => listSessions(getUserId(req)));

  app.patch('/api/agent/sessions/:id', { preHandler: [auth] }, async (req) => {
    const { id } = req.params as { id: string };
    const input = agentSessionRenameInput.parse(req.body);
    await renameSession(getUserId(req), Number(id), input.title);
    return { ok: true };
  });

  app.delete('/api/agent/sessions/:id', { preHandler: [auth] }, async (req) => {
    const { id } = req.params as { id: string };
    await deleteSession(getUserId(req), Number(id));
    return { ok: true };
  });

  app.delete('/api/agent/sessions', { preHandler: [auth] }, async (req) => {
    const count = await clearAllSessions(getUserId(req));
    return { ok: true, deleted: count };
  });

  app.get('/api/agent/session/:id', { preHandler: [auth] }, async (req) => {
    const { id } = req.params as { id: string };
    return chatHistory(getUserId(req), Number(id));
  });

  app.get('/api/agent/config', { preHandler: [auth] }, async () => agentConfigSummary());

  // ---------- 能力差距 & 简历 ----------
  app.get('/api/skills/gap', { preHandler: [auth] }, async (req) => {
    const ctx = await buildUserContext(getUserId(req));
    return analyzeGapByRules(ctx);
  });

  app.post('/api/resume/draft', { preHandler: [auth] }, async (req) => {
    const input = resumeDraftInput.parse(req.body);
    return resumeDraft(getUserId(req), input);
  });

  // ---------- 仪表盘聚合 & 成长统计 ----------
  app.get('/api/dashboard', { preHandler: [auth] }, async (req) => {
    const userId = getUserId(req);
    const ctx = await buildUserContext(userId);
    const gap = analyzeGapByRules(ctx);
    const roadmap = ctx.profile ? await getActiveRoadmap(userId) : null;
    const currentSem = ctx.profile ? currentSemesterOf(ctx.profile.grade) : null;
    const semTasks = roadmap ? (await getTasksOfRoadmap(roadmap.id)).filter((t) => t.semester === currentSem) : [];
    const doneCount = semTasks.filter((t) => t.status === 'done').length;
    const recentTasks = (await listRoadmapTasks(userId)).filter((t) => t.status !== 'done').slice(0, 6);
    let lastReplan: DashboardData['lastReplan'] = null;
    if (roadmap?.parentVersionId) {
      const diff = await diffRoadmapVersions(userId, roadmap.id);
      lastReplan = { version: roadmap.version, createdAt: roadmap.createdAt, diff };
    }
    const data: DashboardData = {
      profile: ctx.profile,
      matchScore: gap.sample_count > 0 ? gap.match_score : null,
      matchSampleCount: gap.sample_count,
      jobSkills: ctx.analysis
        ? [...ctx.analysis.result.skills]
            .sort((a, b) => b.frequency - a.frequency)
            .slice(0, 6)
            .map((s) => ({ name: s.name, category: s.category, frequency: s.frequency, required: s.required }))
        : [],
      topGaps: gap.core_skills
        .filter((s) => s.gap && s.importance !== 'low')
        .slice(0, 5)
        .map((s) => ({ skill: s.skill, importance: s.importance, userStatus: s.user_status })),
      currentSemester:
        currentSem !== null
          ? {
              label: semesterLabel(currentSem),
              doneRatio: semTasks.length ? Math.round((doneCount / semTasks.length) * 100) : 0,
              totalTasks: semTasks.length,
              doneTasks: doneCount,
            }
          : null,
      recentTasks,
      lastReplan,
      activeRoadmapVersion: roadmap?.version ?? null,
    };
    return data;
  });

  app.get('/api/stats/growth', { preHandler: [auth] }, async (req) => {
    const userId = getUserId(req);
    const [profile, tasks, experiences, skills] = await Promise.all([
      getProfile(userId),
      listRoadmapTasks(userId),
      listExperiences(userId),
      listProfileSkills(userId),
    ]);
    const currentSem = profile ? currentSemesterOf(profile.grade) : null;
    const semTasks = tasks.filter((t) => t.semester === currentSem);
    const analysis = await latestAnalysis(userId);
    const coreSkillNames = new Set(analysis?.result.skills.filter((s) => s.required).map((s) => s.name) ?? []);
    const stats: GrowthStats = {
      semesterCompletionRate: semTasks.length ? Math.round((semTasks.filter((t) => t.status === 'done').length / semTasks.length) * 100) : 0,
      completedSkills: skills.filter((s) => s.evidenceStatus === 'evidenced' && coreSkillNames.has(s.name)).length,
      completedProjects: experiences.filter((e) => e.type === 'project').length,
      totalTasks: tasks.length,
      doneTasks: tasks.filter((t) => t.status === 'done').length,
      deferredTasks: tasks.filter((t) => t.status === 'deferred').length,
      plannedHours: tasks.reduce((s, t) => s + t.estimatedHours, 0),
      actualHours: tasks.reduce((s, t) => s + (t.actualHours ?? 0), 0),
      upcomingCriticalTasks: tasks
        .filter((t) => t.status !== 'done' && t.priority === 'high')
        .sort((a, b) => a.semester - b.semester)
        .slice(0, 5),
    };
    return stats;
  });
}
