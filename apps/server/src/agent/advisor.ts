// AI 职业顾问（PRD 4.8）：LLM 通道挂载全模块工具集并记录工具调用链路；无 Key 时规则模板回答
import { and, asc, desc, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { agentChatSessions, agentChatMessages } from '../db/schema.js';
import type { ChatMessageDTO } from '@pathpilot/shared';
import { chatByRules } from './rules/chat.js';
import { buildUserContext } from './context.js';
import { isLlmConfigured } from './settings.js';
import { notFound } from '../services/errors.js';
import type { AgentTool } from '@earendil-works/pi-agent-core';

export interface ToolTraceEntry {
  name: string;
  summary: string;
}

/** 包一层工具执行：记录调用与结果摘要（前端展示工具调用链路） */
function tracedTools(tools: AgentTool<any>[], trace: ToolTraceEntry[]): AgentTool<any>[] {
  return tools.map((tool) => ({
    ...tool,
    execute: async (id: string, params: unknown, signal?: AbortSignal, onUpdate?: (partial: unknown) => void) => {
      const res = await tool.execute(id, params, signal, onUpdate as never);
      const text = (res.content as { type?: string; text?: string }[])?.find?.((c) => c.type === 'text')?.text ?? '';
      trace.push({ name: tool.name, summary: text.replace(/\s+/g, ' ').slice(0, 160) });
      return res;
    },
  })) as AgentTool<any>[];
}

export async function chat(
  userId: number,
  input: { sessionId?: number; message: string; model?: string }
): Promise<{ sessionId: number; reply: ChatMessageDTO; engine: 'pi-llm' | 'rules'; model?: string }> {
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
  let usedModel: string | undefined;
  let toolTrace: ToolTraceEntry[] = [];

  if (await isLlmConfigured()) {
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
          ? { target: ctx.analysis.targetRole, sampleCount: analysis_sampleCount(ctx.analysis), topSkills: ctx.analysis.result.skills.slice(0, 12) }
          : null,
        当前任务: ctx.activeTasks.filter((t) => t.status !== 'done').slice(0, 15).map((t) => ({ title: t.title, status: t.status, priority: t.priority })),
      },
      null,
      1
    );
    try {
      const { runAgentWith } = await import('./pi/runtime.js');
      const { resolveModel } = await import('./pi/provider.js');
      const { buildAgentTools } = await import('./pi/tools.js');
      const { models, model, cfg } = await resolveModel(input.model);
      usedModel = model.id ?? cfg.model;
      const trace: ToolTraceEntry[] = [];
      const outcome = await runAgentWith(models, model, {
        systemPrompt: `你是 PathPilot AI 职业顾问，服务对象是计算机专业大学生。\n回答规范：\n1. 基于用户真实数据作答。你可调用工具操作各模块：档案（get_user_profile、upsert_skill、create_experience）、任务（get_tasks、update_task_status、跟踪开始/暂停）、规划（get_current_roadmap、get_roadmap_versions、generate_roadmap、create_roadmap_revision、roadmap_add_task、roadmap_update_task、roadmap_remove_task）、岗位分析（get_job_analysis、analyze_jobs、analyze_skill_gap、search_jobs、fetch_job_page、extract_requirements、search_yjs_jobs（应届生求职网校招搜索）、parse_yjs_jobs（解析粘贴的岗位数据）、normalize_skills）、简历（generate_resume_draft）。需要细节或执行操作时调用工具。\n2. 区分【事实】【推断】【建议】；事实判断给出数据依据。\n3. 工具操作即真实生效；执行后告知结果与查看入口。\n4. 不得访问或猜测其他用户数据；不得保证录用、薪资或升学结果。\n5. 中文回答，简洁分段，必要时给下一步行动。\n\n用户数据摘要（授权范围）：\n${ctxSummary}`,
        prompt: input.message,
        history: recent,
        tools: tracedTools(buildAgentTools(userId), trace),
        wallClockMs: 300_000,
      });
      if (!outcome.text) throw new Error('模型返回为空');
      replyText = outcome.text;
      engine = 'pi-llm';
      toolTrace = trace;
    } catch {
      replyText = chatByRules(input.message, ctx);
    }
  } else {
    replyText = chatByRules(input.message, ctx);
  }

  const inserted = await db
    .insert(agentChatMessages)
    .values({ sessionId: sid, role: 'assistant', content: replyText, engine, toolCalls: toolTrace.length ? toolTrace : null })
    .returning();
  await db.update(agentChatSessions).set({ updatedAt: new Date().toISOString() }).where(eq(agentChatSessions.id, sid));
  const row = inserted[0];
  return {
    sessionId: sid,
    engine,
    model: usedModel,
    reply: {
      id: row.id,
      sessionId: row.sessionId,
      role: 'assistant',
      content: row.content,
      engine,
      toolCalls: row.toolCalls ?? [],
      createdAt: row.createdAt,
    },
  };
}

function analysis_sampleCount(a: { sampleCount: number }): number {
  return a.sampleCount;
}

export async function chatHistory(userId: number, sessionId: number): Promise<ChatMessageDTO[]> {
  const found = await db
    .select()
    .from(agentChatSessions)
    .where(and(eq(agentChatSessions.id, sessionId), eq(agentChatSessions.userId, userId)))
    .limit(1);
  if (!found[0]) throw notFound('会话不存在');
  const rows = await db.select().from(agentChatMessages).where(eq(agentChatMessages.sessionId, sessionId)).orderBy(asc(agentChatMessages.id));
  return rows.map((r) => ({
    id: r.id,
    sessionId: r.sessionId,
    role: r.role as 'user' | 'assistant',
    content: r.content,
    engine: (r.engine as 'pi-llm' | 'rules') ?? null,
    toolCalls: r.toolCalls ?? [],
    createdAt: r.createdAt,
  }));
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
