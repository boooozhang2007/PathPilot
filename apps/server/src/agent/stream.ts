// 流式 AI 顾问（SSE）：实时推送 思考增量 / 工具开始·结束 / 回答增量 / 完成
// 复用 advisor 的会话管理；事件经 Pi Agent subscribe() 转发
// 客户端断开（停止生成/关页）→ agent.abort() 真正中止，已生成部分入库保留
import { and, asc, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { agentChatSessions, agentChatMessages } from '../db/schema.js';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { getUserId } from '../auth/index.js';
import { toPiHistory, tracedTools, type ToolTraceEntry } from './advisor.js';
import { buildUserContext } from './context.js';
import { isLlmConfigured, getLlmSettings } from './settings.js';
import { skillGroupOf } from '@pathpilot/shared';
import type { AgentEvent } from '@earendil-works/pi-agent-core';

export interface StreamEvent {
  type: 'thinking' | 'tool_start' | 'tool_end' | 'text' | 'done' | 'error';
  // thinking/text: 增量内容；tool_*: 工具名；done: 完整回复 + 工具链
  delta?: string;
  name?: string;
  summary?: string;
  engine?: 'pi-llm' | 'rules';
  model?: string;
  fallbackReason?: string;
  sessionId?: number;
}

async function ensureSession(userId: number, sessionId?: number): Promise<number> {
  if (sessionId) {
    const found = await db
      .select()
      .from(agentChatSessions)
      .where(and(eq(agentChatSessions.id, sessionId), eq(agentChatSessions.userId, userId)))
      .limit(1);
    // 会话可能已被删除（他端清理/重置）：自动新建会话兜底，避免整次对话 500
    if (found[0]) return sessionId;
  }
  const inserted = await db.insert(agentChatSessions).values({ userId }).returning();
  return inserted[0].id;
}

/**
 * SSE 流式对话。事件序列：
 *   thinking(delta)… → [tool_start(name) → tool_end(name,summary)]*（与 thinking/text 交错多轮）→ text(delta)… → done
 * LLM 未配置或彻底失败时：直接 text(规则引擎回答) → done(fallbackReason)
 */
export async function streamChat(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const userId = getUserId(req);
  const input = (req.body ?? {}) as { sessionId?: number; message?: string; model?: string };
  const message = (input.message ?? '').trim();
  if (!message) {
    reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: '消息不能为空' } });
    return;
  }

  const sid = await ensureSession(userId, input.sessionId);
  await db.insert(agentChatMessages).values({ sessionId: sid, role: 'user', content: message });

  // 直接写 raw 响应会绕过 fastify 生命周期，@fastify/cors 的 hook 不会执行，
  // 必须手动补上 CORS 头，否则浏览器跨域读取 SSE 时报 "Failed to fetch"
  const origin = req.headers.origin;
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
    ...(origin ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true', Vary: 'Origin' } : {}),
  });
  let closed = false;
  const send = (event: StreamEvent) => {
    if (!closed) reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
  };
  const finish = (payload: StreamEvent) => {
    if (closed) return;
    closed = true;
    reply.raw.write(`data: ${JSON.stringify({ ...payload, sessionId: sid })}\n\n`);
    reply.raw.end();
  };
  // 客户端断开（停止生成/关闭页面）：真正中止 Agent 推理，已生成部分保留
  let clientGone = false;
  let activeAgent: { abort: () => void } | null = null;
  let stopResolve: (() => void) | null = null;
  req.raw.on('close', () => {
    closed = true;
    clientGone = true;
    activeAgent?.abort();
    stopResolve?.(); // agent.prompt 被 abort 后可能不 settle，用 race 兜底放出
  });

  let ctx: Awaited<ReturnType<typeof buildUserContext>>;
  try {
    ctx = await buildUserContext(userId);
  } catch (err) {
    console.warn(`[agent-chat-stream] 构建用户上下文失败：${err instanceof Error ? err.message : err}`);
    send({ type: 'error', delta: '用户数据加载失败，请稍后重试' });
    finish({ type: 'done', engine: 'rules', fallbackReason: '用户数据加载失败' } as never);
    return;
  }

  if (!(await isLlmConfigured())) {
    send({ type: 'error', delta: '未配置模型 API：请管理员在 /admin 页面配置后使用 AI 对话' });
    finish({ type: 'done', engine: 'rules', fallbackReason: '未配置模型 API' });
    return;
  }

  const history = await db
    .select()
    .from(agentChatMessages)
    .where(eq(agentChatMessages.sessionId, sid))
    .orderBy(asc(agentChatMessages.id))
    .limit(200)
    .catch(() => [] as (typeof agentChatMessages.$inferSelect)[]);
  const recent = toPiHistory(
    history.slice(-13, -1).map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content, createdAt: m.createdAt }))
  );
  const ctxSummary = JSON.stringify({
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
    技能档案: ctx.skills.map((s: { name: string; category: string; level: number; evidenceStatus: string }) => ({
      name: s.name,
      分组: skillGroupOf(s.category) === 'general' ? '通用能力' : '专业能力',
      level: s.level,
      status: s.evidenceStatus,
    })),
    经历: ctx.experiences.map((e: { type: string; title: string }) => ({ type: e.type, title: e.title })),
    岗位分析: ctx.analysis ? { target: ctx.analysis.targetRole, sampleCount: ctx.analysis.sampleCount } : null,
    当前任务: ctx.activeTasks.filter((t: { status: string }) => t.status !== 'done').slice(0, 15).map((t: { title: string; status: string }) => ({ title: t.title, status: t.status })),
  });

  const trace: ToolTraceEntry[] = [];
  /** 提取 Agent 消息流中最后一条 assistant 文本（停止后也保留已生成部分） */
  const textOf = (agent: unknown): string => {
    const msgs = (agent as { state?: { messages?: unknown[] } }).state?.messages ?? [];
    const last = [...msgs].reverse().find((m: unknown) => (m as { role?: string }).role === 'assistant');
    return last && Array.isArray((last as { content?: unknown[] }).content)
      ? ((last as { content: { type: string; text?: string }[] }).content.filter((c) => c.type === 'text').map((c) => c.text ?? '').join('') as string)
      : '';
  };
  const attempt = async (modelId: string | undefined): Promise<string> => {
    const { Agent } = await import('@earendil-works/pi-agent-core');
    const { resolveModel } = await import('./pi/provider.js');
    const { buildAgentTools } = await import('./pi/tools.js');
    const { models, model } = await resolveModel(modelId);
    const agent = new Agent({
      initialState: {
        systemPrompt: ADVISOR_PROMPT(ctxSummary),
        model,
        tools: tracedTools(buildAgentTools(userId), trace),
        messages: recent as never[],
        thinkingLevel: 'off',
      },
      streamFn: models.streamSimple.bind(models) as never,
      toolExecution: 'sequential',
    });
    activeAgent = agent;
    agent.subscribe((event: AgentEvent) => {
      if (event.type === 'message_update') {
        const ev = (event as { assistantMessageEvent?: { type?: string; delta?: string } }).assistantMessageEvent;
        if (ev?.delta) {
          if (ev.type === 'thinking_delta') send({ type: 'thinking', delta: ev.delta });
          if (ev.type === 'text_delta') send({ type: 'text', delta: ev.delta });
        }
      }
      if (event.type === 'tool_execution_start') {
        send({ type: 'tool_start', name: (event as { toolName: string }).toolName });
      }
      if (event.type === 'tool_execution_end') {
        const e = event as { toolName: string; result?: { content?: { type?: string; text?: string }[] }; isError?: boolean };
        const text = e.result?.content?.find?.((c) => c.type === 'text')?.text ?? '';
        send({ type: 'tool_end', name: e.toolName, summary: (e.isError ? '⚠ ' : '') + text.replace(/\s+/g, ' ').slice(0, 160) });
      }
    });
    try {
      await Promise.race([agent.prompt(message), new Promise<void>((r) => (stopResolve = r))]);
    } catch (err) {
      // 客户端已停止：不再抛错，保留部分文本
      if (clientGone) return textOf(agent);
      throw err;
    }
    if (clientGone) return textOf(agent);
    const finalText = textOf(agent);
    if (!finalText.trim()) throw new Error('模型返回为空');
    return finalText;
  };

  let engine: 'pi-llm' | 'rules' = 'pi-llm';
  let usedModel: string | undefined;
  let text = '';
  let fallbackReason = '';
  let stopped = false;
  try {
    const { resolveModel } = await import('./pi/provider.js');
    const { model } = await resolveModel(input.model);
    usedModel = model.id;
    text = await attempt(input.model ?? usedModel);
  } catch (err) {
    if (clientGone) {
      stopped = true;
    } else {
      let llmErr = err instanceof Error ? err.message : String(err);
      const cfg = await getLlmSettings();
      if (input.model && input.model !== cfg.model) {
        try {
          text = await attempt(cfg.model);
          usedModel = cfg.model;
          fallbackReason = `所选模型不可用（${llmErr.slice(0, 60)}），已用 ${cfg.model} 回答`;
          llmErr = '';
        } catch (err2) {
          llmErr = err2 instanceof Error ? err2.message : String(err2);
        }
      }
      if (llmErr && !clientGone && /timed? ?out|timeout|econn|fetch failed|network|50[234]/i.test(llmErr)) {
        await new Promise((r) => setTimeout(r, 2000));
        try {
          text = await attempt(cfg.model);
          usedModel = cfg.model;
          llmErr = '';
        } catch (err3) {
          llmErr = err3 instanceof Error ? err3.message : String(err3);
        }
      }
      if (llmErr && !clientGone) {
        console.warn(`[agent-chat-stream] LLM 失败：${llmErr}`);
        send({ type: 'error', delta: `模型调用失败：${llmErr.slice(0, 160)}` });
        finish({ type: 'done', engine: 'rules', fallbackReason: `模型调用失败（${llmErr.slice(0, 100)}）` } as never);
        return;
      }
      if (clientGone) stopped = true;
    }
  }
  if (clientGone) stopped = true;

  // 停止且无任何输出 → 不落库空消息（用户消息保留，前端自行展示"已停止"）
  if (!text.trim()) {
    finish({ type: 'done', engine, model: usedModel, fallbackReason: stopped ? '已停止生成' : undefined } as never);
    return;
  }
  await db.insert(agentChatMessages).values({
    sessionId: sid,
    role: 'assistant',
    content: text,
    engine,
    toolCalls: trace.length ? trace : null,
  });
  await db.update(agentChatSessions).set({ updatedAt: new Date().toISOString() }).where(eq(agentChatSessions.id, sid));
  finish({ type: 'done', engine, model: usedModel, fallbackReason: stopped ? '已停止生成（保留已输出部分）' : fallbackReason || undefined } as never);
}

function ADVISOR_PROMPT(ctxSummary: string): string {
  return `你是 PathPilot AI 职业顾问，服务对象是计算机专业大学生。\n回答规范：\n1. 基于用户真实数据作答，可调用工具操作各模块（档案/任务/规划/岗位分析/简历）。需要细节或执行操作时调用工具。\n2. 回答应基于真实数据、言之有据，但无需在回复中显式标注【事实】【推断】【建议】等分类标签，自然表述即可。\n3. 工具操作即真实生效；执行后告知结果。\n4. 中文回答，用 Markdown 排版（列表/加粗/小标题）。\n5. 技能建议区分「专业能力」（岗位技术栈）与「通用能力」（沟通表达、协作、学习习惯），通用能力落到具体场景任务而非空泛要求。\n6. 若用户档案含 MBTI，可结合性格特质给出更贴合的建议（如任务形式、协作与表达方式），但不因性格限制能力目标。\n\n用户数据摘要（授权范围）：\n${ctxSummary}`;
}
