// AI 职业顾问（PRD 4.8）：LLM 通道挂载全模块工具集（agent/pi/tools），无 Key 时规则模板回答
import { and, asc, desc, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { agentChatSessions, agentChatMessages } from '../db/schema.js';
import type { ChatMessageDTO } from '@pathpilot/shared';
import { chatByRules, analyzeGapByRules } from './rules/chat.js';
import { buildUserContext } from './context.js';
import { llmConfigured } from '../config.js';
import { notFound } from '../services/errors.js';

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
      const { buildAgentTools } = await import('./pi/tools.js');
      const models = pilotModels();
      const outcome = await runAgentWith(models, getPilotModel(models), {
        systemPrompt: `你是 PathPilot AI 职业顾问，服务对象是计算机专业大学生。\n回答规范：\n1. 基于用户真实数据作答。你可以调用工具操作各模块：读取/维护档案（get_user_profile、upsert_skill、create_experience）、任务（get_tasks、update_task_status）、规划（get_current_roadmap、get_roadmap_versions、generate_roadmap、create_roadmap_revision）、岗位分析（get_job_analysis、analyze_jobs、analyze_skill_gap、search_jobs、fetch_job_page、extract_requirements、normalize_skills）、简历（generate_resume_draft）。上下文摘要已有基础数据，需要细节或执行操作时调用工具。\n2. 区分【事实】【推断】【建议】；事实判断给出数据依据（如岗位样本频次）。\n3. 工具操作即真实生效（如更新任务状态、生成新规划版本）；执行后告知用户结果与查看入口。\n4. 不得访问或猜测其他用户数据；不得保证录用、薪资或升学结果。\n5. 中文回答，简洁分段，必要时给下一步行动。\n\n用户数据摘要（授权范围）：\n${ctxSummary}`,
        prompt: input.message,
        history: recent,
        tools: buildAgentTools(userId),
        wallClockMs: 300_000,
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
