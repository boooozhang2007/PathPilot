// AI 职业顾问（PRD 4.8）+ 简历草稿（PRD 4.9）
// 上下文引用授权数据；区分事实/推断/建议；不保证录用结果；无 Key 时规则模板回答
import { and, asc, desc, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { agentChatSessions, agentChatMessages } from '../db/schema.js';
import type { ChatMessageDTO, ExperienceDTO, ProfileDTO, ProfileSkillDTO, ResumeDraftResult } from '@pathpilot/shared';
import { getProfile, listProfileSkills, listExperiences } from '../services/profileService.js';
import { getActiveRoadmap, listRoadmapTasks } from '../services/roadmapService.js';
import { chatByRules, analyzeGapByRules, resumeDraftByRules, type UserContext } from './rules/chat.js';
import { runPiAgent, runStructuredAgent } from './pi/runtime.js';
import { llmConfigured } from '../config.js';
import { notFound, badRequest } from '../services/errors.js';
import { userLatestAnalysis } from './jobs.js';
import { resumeDraftResult } from '@pathpilot/shared';

export async function buildUserContext(userId: number): Promise<UserContext> {
  const [profile, skills, analysis, roadmap] = await Promise.all([
    getProfile(userId),
    listProfileSkills(userId),
    userLatestAnalysis(userId),
    getActiveRoadmap(userId),
  ]);
  const tasks = roadmap ? await listRoadmapTasks(userId, roadmap.id) : [];
  const experiences = await listExperiences(userId);
  return { profile, skills, experiences, analysis, activeTasks: tasks };
}

export async function chat(
  userId: number,
  input: { sessionId?: number; message: string }
): Promise<{ sessionId: number; reply: ChatMessageDTO; engine: 'pi-llm' | 'rules' }> {
  // 会话管理（会话记忆不代替正式业务记录，PRD 4.8）
  let sessionId = input.sessionId;
  if (sessionId) {
    const found = await db
      .select()
      .from(agentChatSessions)
      .where(and(eq(agentChatSessions.id, sessionId), eq(agentChatSessions.userId, userId)))
      .limit(1);
    if (!found[0]) throw notFound('会话不存在');
  } else {
    const inserted = await db.insert(agentChatSessions).values({ userId }).returning();
    sessionId = inserted[0].id;
  }
  const sid: number = sessionId;
  await db.insert(agentChatMessages).values({ sessionId: sid, role: 'user', content: input.message });

  const ctx = await buildUserContext(userId);
  let replyText: string;
  let engine: 'pi-llm' | 'rules' = 'rules';

  if (llmConfigured()) {
    const history = await db
      .select()
      .from(agentChatMessages)
      .where(eq(agentChatMessages.sessionId, sid))
      .orderBy(asc(agentChatMessages.id))
      .limit(200);
    const recent = history.slice(-12).map((m) => ({
      role: m.role,
      content: m.content,
      timestamp: Date.parse(m.createdAt),
    }));
    const ctxSummary = JSON.stringify(
      {
        个人资料: ctx.profile,
        技能档案: ctx.skills.map((s) => ({ name: s.name, level: s.level, status: s.evidenceStatus })),
        经历: ctx.experiences.map((e) => ({ type: e.type, title: e.title, technologies: e.technologies, result: e.result })),
        岗位分析: ctx.analysis
          ? { target: ctx.analysis.targetRole, sampleCount: ctx.analysis.sampleCount, topSkills: ctx.analysis.result.skills.slice(0, 12) }
          : null,
        当前任务: ctx.activeTasks.filter((t) => t.status !== 'done').slice(0, 15).map((t) => ({ title: t.title, status: t.status, priority: t.priority })),
      },
      null,
      1
    );
    try {
      const { runAgentWith, pilotModels } = await import('./pi/runtime.js');
      const { getPilotModel } = await import('./pi/provider.js');
      const { buildReadOnlyTools } = await import('./pi/tools.js');
      const models = pilotModels();
      const outcome = await runAgentWith(models, getPilotModel(models), {
        systemPrompt: `你是 PathPilot AI 职业顾问，服务对象是计算机专业大学生。\n回答规范：\n1. 基于用户真实数据作答：可通过工具读取档案、当前规划与岗位分析；上下文摘要已有部分数据，需要更多细节时调用工具。\n2. 区分【事实】【推断】【建议】；事实判断给出数据依据（如岗位样本频次）。\n3. 不得访问或猜测其他用户数据；不得保证录用、薪资或升学结果。\n4. 用户档案/规划变化后以工具读取的最新数据为准。\n5. 中文回答，简洁分段，必要时给下一步行动。\n\n用户数据摘要（授权范围）：\n${ctxSummary}`,
        prompt: input.message,
        history: recent,
        tools: buildReadOnlyTools(userId),
        wallClockMs: 120_000,
      });
      if (!outcome.text) throw new Error('模型返回为空');
      replyText = outcome.text;
      engine = 'pi-llm';
    } catch {
      replyText = `${chatByRules(input.message, ctx)}\n\n（AI 模型通道暂不可用，以上为规则引擎基于真实数据的回答。）`;
    }
  } else {
    replyText = chatByRules(input.message, ctx);
  }

  const inserted = await db.insert(agentChatMessages).values({ sessionId: sid, role: 'assistant', content: replyText, engine }).returning();
  await db.update(agentChatSessions).set({ updatedAt: new Date().toISOString() }).where(eq(agentChatSessions.id, sid));
  const row = inserted[0];
  return {
    sessionId,
    engine,
    reply: { id: row.id, sessionId: row.sessionId, role: 'assistant', content: row.content, engine, createdAt: row.createdAt },
  };
}

export async function chatHistory(userId: number, sessionId: number): Promise<ChatMessageDTO[]> {
  const found = await db
    .select()
    .from(agentChatSessions)
    .where(and(eq(agentChatSessions.id, sessionId), eq(agentChatSessions.userId, userId)))
    .limit(1);
  if (!found[0]) throw notFound('会话不存在');
  const rows = await db.select().from(agentChatMessages).where(eq(agentChatMessages.sessionId, sessionId)).orderBy(asc(agentChatMessages.id));
  return rows.map((r) => ({ id: r.id, sessionId: r.sessionId, role: r.role as 'user' | 'assistant', content: r.content, engine: (r.engine as 'pi-llm' | 'rules') ?? null, createdAt: r.createdAt }));
}

export async function latestSession(userId: number): Promise<{ sessionId: number; messages: ChatMessageDTO[] } | null> {
  const rows = await db
    .select()
    .from(agentChatSessions)
    .where(eq(agentChatSessions.userId, userId))
    .orderBy(desc(agentChatSessions.id))
    .limit(1);
  if (!rows[0]) return null;
  return { sessionId: rows[0].id, messages: await chatHistory(userId, rows[0].id) };
}

/** 简历草稿（PRD 4.9：只用真实经历，不虚构量化数据） */
export async function resumeDraft(userId: number, input: { targetRole: string; experienceIds?: number[] }): Promise<{ draft: ResumeDraftResult; engine: 'pi-llm' | 'rules' }> {
  const all = await listExperiences(userId);
  if (!all.length) throw badRequest('能力档案中暂无经历，请先添加真实经历');
  const selected = input.experienceIds?.length ? all.filter((e) => input.experienceIds!.includes(e.id)) : all;
  if (!selected.length) throw badRequest('所选经历不存在');
  if (llmConfigured()) {
    try {
      const { data } = await runStructuredAgent(
        {
          systemPrompt:
            '你是应届生简历撰写助手。规则：只使用用户提供的真实经历；不得虚构任何数据、指标、奖项、成果；用户未提供量化结果时不得编造百分比或数字；输出为结构化简历草稿。必须调用 submit_result 提交。',
          prompt: `目标岗位：${input.targetRole}\n\n真实经历（JSON）：\n${JSON.stringify(selected, null, 2)}\n\n请生成简历草稿：data 含 target_role/summary/sections(heading+items)/notes。notes 中说明哪些信息建议用户补充真实数据。`,
          schema: resumeDraftResult,
          wallClockMs: 120_000,
        },
        (_calls, captured) => (captured.length ? captured[captured.length - 1] : undefined)
      );
      return { draft: { ...data, notes: data.notes ?? [] }, engine: 'pi-llm' };
    } catch {
      // 降级规则
    }
  }
  return { draft: resumeDraftByRules(input.targetRole, selected), engine: 'rules' };
}
