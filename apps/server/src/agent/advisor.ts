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
import { flowPrompt, markFlowResult, prepareFlow } from './flow.js';

export interface ToolTraceEntry {
  name: string;
  summary: string;
}

export function buildAdvisorSystemPrompt(ctxSummary: string, flow: import('@pathpilot/shared').AgentFlowDTO): string {
  return `你是 PathPilot AI 职业顾问，服务对象是计算机专业大学生。${flowPrompt(flow)}当工具能帮助核对用户资料、岗位信息或完成操作时，调用合适的工具并结合返回结果继续回答。对用户明确的请求直接推进；只在关键信息缺失并影响结论时询问。遇到几十小时以上的大目标，保留父任务并用 roadmap_add_task 创建带 parent_task_id 的子任务，为每个子任务设置产出、验收标准和预计时长。中文回答，用 Markdown 排版。\n\n用户数据摘要：\n${ctxSummary}`;
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
  input: { sessionId?: number; message: string; answerStyle?: 'concise' | 'detailed' }
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
  const flow = await prepareFlow(userId, sid, input.message);

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
  const attemptLlm = async (): Promise<void> => {
    const { runAgentWith } = await import('./pi/runtime.js');
    const { resolveModel } = await import('./pi/provider.js');
    const { buildAgentTools } = await import('./pi/tools.js');
    const { models, model } = await resolveModel();
    usedModel = model.id;
    const trace: ToolTraceEntry[] = [];
    const outcome = await runAgentWith(models, model, {
      systemPrompt: buildAdvisorSystemPrompt(ctxSummary, flow),
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
    await attemptLlm();
  } catch (err) {
    llmErr = err instanceof Error ? err.message : String(err);
    if (llmErr && /timed? ?out|timeout|econn|fetch failed|network|50[234]/i.test(llmErr)) {
      // 瞬时错误（超时/网络/5xx）间隔 2s 再重试一次
      await new Promise((r) => setTimeout(r, 2000));
      try {
        await attemptLlm();
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
  if (toolTrace.length) await markFlowResult(sid);
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
    flowState: s.flowState,
    selectedIntent: s.selectedIntent,
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
