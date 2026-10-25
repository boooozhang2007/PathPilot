// AI 职业顾问（PRD 4.8）：LLM 通道挂载全模块工具集并记录工具调用链路
import { and, asc, desc, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { agentChatSessions, agentChatMessages } from '../db/schema.js';
import type { ChatMessageDTO, ChatSessionSummaryDTO } from '@pathpilot/shared';
import { skillGroupOf } from '@pathpilot/shared';
import { badRequest, modelCallFailed, notFound } from '../services/errors.js';
import { buildUserContext } from './context.js';
import { isLlmConfigured } from './settings.js';
import type { AgentTool } from '@earendil-works/pi-agent-core';

export interface ToolTraceEntry {
  name: string;
  summary: string;
}

/**
 * DB 聊天记录 → Pi 消息结构。
 * 关键：assistant 消息必须带完整 usage（零值）与 stopReason，否则 pi-ai 的
 * estimateContextTokens 读取 usage.totalTokens 会在会话第二轮起崩溃
 * （Cannot read properties of undefined (reading 'totalTokens')）。
 */
const ZERO_USAGE = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  reasoning: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

export function toPiHistory(rows: { role: 'user' | 'assistant'; content: string; createdAt: string }[]): unknown[] {
  return rows.map((m) =>
    m.role === 'assistant'
      ? {
          role: 'assistant',
          content: [{ type: 'text', text: m.content }],
          usage: ZERO_USAGE,
          stopReason: 'stop',
          api: 'openai-completions',
          provider: 'pathpilot',
          model: 'history',
          timestamp: Date.parse(m.createdAt),
        }
      : { role: 'user', content: m.content, timestamp: Date.parse(m.createdAt) }
  );
}

/** 包一层工具执行：记录调用与结果摘要（前端展示工具调用链路） */
export function tracedTools(tools: AgentTool<any>[], trace: ToolTraceEntry[]): AgentTool<any>[] {
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
): Promise<{ sessionId: number; reply: ChatMessageDTO; engine: 'pi-llm' | 'rules'; model?: string; fallbackReason?: string }> {
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
  let replyText = '';
  let engine: 'pi-llm' | 'rules' = 'rules';
  let usedModel: string | undefined;
  let fallbackReason = '';
  let toolTrace: ToolTraceEntry[] = [];

  if (!(await isLlmConfigured())) {
    throw badRequest('未配置模型 API：请管理员在 /admin 页面配置后使用 AI 对话');
  }

  const history = await db
    .select()
    .from(agentChatMessages)
    .where(eq(agentChatMessages.sessionId, sid))
    .orderBy(asc(agentChatMessages.id))
    .limit(200);
  const recent = toPiHistory(
    history.slice(-12).map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content, createdAt: m.createdAt }))
  );
  const ctxSummary = JSON.stringify(
    {
      个人资料: ctx.profile
        ? {
            昵称: ctx.profile.nickname,
            年级: ctx.profile.grade,
            毕业时间: ctx.profile.graduationDate,
            目标岗位: ctx.profile.targetRole,
            路径: ctx.profile.careerPath,
            每周可投入小时: ctx.profile.weeklyHours,
            MBTI: ctx.profile.mbti ?? '未测',
          }
        : null,
      技能档案: ctx.skills.map((s) => ({ name: s.name, 分组: skillGroupOf(s.category) === 'general' ? '通用能力' : '专业能力', level: s.level, status: s.evidenceStatus })),
      经历: ctx.experiences.map((e) => ({ type: e.type, title: e.title, technologies: e.technologies, result: e.result })),
      岗位分析: ctx.analysis
        ? { target: ctx.analysis.targetRole, sampleCount: analysis_sampleCount(ctx.analysis), topSkills: ctx.analysis.result.skills.slice(0, 12) }
        : null,
      当前任务: ctx.activeTasks.filter((t) => t.status !== 'done').slice(0, 15).map((t) => ({ title: t.title, status: t.status, priority: t.priority })),
    },
    null,
    1
  );
  let llmErr = '';
  const attemptLlm = async (modelId?: string): Promise<void> => {
    const { runAgentWith } = await import('./pi/runtime.js');
    const { resolveModel } = await import('./pi/provider.js');
    const { buildAgentTools } = await import('./pi/tools.js');
    const { models, model, cfg } = await resolveModel(modelId);
    usedModel = model.id ?? cfg.model;
    const trace: ToolTraceEntry[] = [];
    const outcome = await runAgentWith(models, model, {
      systemPrompt: `你是 PathPilot AI 职业顾问，服务对象是计算机专业大学生。\n回答规范：\n1. 基于用户真实数据作答。你可调用工具操作各模块：档案（get_user_profile、upsert_skill、create_experience）、任务（get_tasks、update_task_status，跟踪开始/暂停）、规划（get_current_roadmap、get_roadmap_versions、generate_roadmap、create_roadmap_revision、roadmap_add_task、roadmap_update_task、roadmap_remove_task，任务均可增删改）、岗位分析（get_job_analysis、analyze_jobs、analyze_skill_gap、search_jobs、fetch_job_page、extract_requirements、search_yjs_jobs（应届生求职网校招搜索）、parse_yjs_jobs（解析粘贴的岗位数据）、normalize_skills）、简历（generate_resume_draft）。需要细节或执行操作时调用工具。\n2. 回答应基于真实数据、言之有据，但无需在回复中显式标注【事实】【推断】【建议】等分类标签，自然表述即可。\n3. 工具操作即真实生效；执行后告知结果与查看入口。\n4. 中文回答，简洁分段，必要时给下一步行动。\n5. 技能建议区分「专业能力」（岗位技术栈）与「通用能力」（沟通表达、协作、学习习惯），通用能力落到具体场景任务而非空泛要求。\n6. 若用户档案含 MBTI，可结合性格特质给出更贴合的建议（如任务形式、协作与表达方式），但不因性格限制能力目标。\n\n用户数据摘要（授权范围）：\n${ctxSummary}`,
      prompt: input.message,
      history: recent,
      tools: tracedTools(buildAgentTools(userId), trace),
      wallClockMs: 300_000,
    });
    if (!outcome.text) throw new Error('模型返回为空');
    replyText = outcome.text;
    engine = 'pi-llm';
    toolTrace = trace;
  };
  try {
    await attemptLlm(input.model);
  } catch (err) {
    llmErr = err instanceof Error ? err.message : String(err);
    // 所选模型失败时降级到管理页配置的当前模型重试一次
    const { getLlmSettings } = await import('./settings.js');
    const cfg = await getLlmSettings();
    if (input.model && input.model !== cfg.model) {
      try {
        await attemptLlm(cfg.model);
        fallbackReason = `所选模型 ${input.model} 不可用（${llmErr.slice(0, 80)}），已用 ${cfg.model} 回答`;
        llmErr = '';
      } catch (err2) {
        llmErr = err2 instanceof Error ? err2.message : String(err2);
      }
    }
    if (llmErr && /timed? ?out|timeout|econn|fetch failed|network|50[234]/i.test(llmErr)) {
      // 瞬时错误（超时/网络/5xx）间隔 2s 再重试一次
      await new Promise((r) => setTimeout(r, 2000));
      try {
        await attemptLlm(cfg.model);
        llmErr = '';
        fallbackReason = '';
      } catch (err3) {
        llmErr = err3 instanceof Error ? err3.message : String(err3);
      }
    }
    if (llmErr) throw modelCallFailed(`模型调用失败：${llmErr.slice(0, 200)}`);
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
    fallbackReason: fallbackReason || undefined,
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

/** 会话摘要列表（侧栏）：标题取首条用户消息，按更新时间倒序 */
export async function listSessions(userId: number): Promise<ChatSessionSummaryDTO[]> {
  const sessions = await db
    .select()
    .from(agentChatSessions)
    .where(eq(agentChatSessions.userId, userId))
    .orderBy(desc(agentChatSessions.updatedAt))
    .limit(50);
  if (!sessions.length) return [];
  const firsts = await db
    .select({ sessionId: agentChatMessages.sessionId, role: agentChatMessages.role, content: agentChatMessages.content })
    .from(agentChatMessages)
    .orderBy(asc(agentChatMessages.id));
  const titleOf = new Map<number, string>();
  const countOf = new Map<number, number>();
  for (const m of firsts) {
    countOf.set(m.sessionId, (countOf.get(m.sessionId) ?? 0) + 1);
    if (!titleOf.has(m.sessionId) && m.role === 'user') {
      titleOf.set(m.sessionId, m.content.replace(/\s+/g, ' ').trim().slice(0, 30) || '新对话');
    }
  }
  return sessions.map((s) => ({
    id: s.id,
    title: s.title ?? titleOf.get(s.id) ?? '新对话',
    messageCount: countOf.get(s.id) ?? 0,
    updatedAt: s.updatedAt,
  }));
}

/** 重命名会话（App 端历史管理） */
export async function renameSession(userId: number, sessionId: number, title: string): Promise<void> {
  const found = await db
    .select()
    .from(agentChatSessions)
    .where(and(eq(agentChatSessions.id, sessionId), eq(agentChatSessions.userId, userId)))
    .limit(1);
  if (!found[0]) throw notFound('会话不存在');
  await db.update(agentChatSessions).set({ title: title.slice(0, 60), updatedAt: new Date().toISOString() }).where(eq(agentChatSessions.id, sessionId));
}

/** 清空全部会话 */
export async function clearAllSessions(userId: number): Promise<number> {
  const rows = await db.select({ id: agentChatSessions.id }).from(agentChatSessions).where(eq(agentChatSessions.userId, userId));
  for (const r of rows) {
    await db.delete(agentChatMessages).where(eq(agentChatMessages.sessionId, r.id));
  }
  await db.delete(agentChatSessions).where(eq(agentChatSessions.userId, userId));
  return rows.length;
}

export async function deleteSession(userId: number, sessionId: number): Promise<void> {
  const found = await db
    .select()
    .from(agentChatSessions)
    .where(and(eq(agentChatSessions.id, sessionId), eq(agentChatSessions.userId, userId)))
    .limit(1);
  if (!found[0]) throw notFound('会话不存在');
  await db.delete(agentChatMessages).where(eq(agentChatMessages.sessionId, sessionId));
  await db.delete(agentChatSessions).where(eq(agentChatSessions.id, sessionId));
}
