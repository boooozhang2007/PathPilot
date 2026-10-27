// 流式 AI 顾问（SSE）：实时推送 会话 / 思考增量 / 工具开始·进度·结束 / 回答增量 / 完成
// 复用 advisor 的会话管理；事件经 Pi Agent subscribe() 转发
// 客户端断开（停止生成/关页）→ agent.abort() 真正中止，已生成部分入库保留
// 生命周期：心跳保活、墙钟超时、工具次数上限、错误持久化（刷新后仍可见失败原因）
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { agentChatSessions, agentChatMessages } from '../db/schema.js';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { getUserId } from '../auth/index.js';
import {
  buildAdvisorSystemPrompt,
  loadRecentHistory,
  saveAssistantError,
  tracedTools,
  truncateForRegenerate,
  type ToolTraceEntry,
} from './advisor.js';
import { buildUserContext } from './context.js';
import { isLlmConfigured } from './settings.js';
import { config } from '../config.js';
import { agentChatInput, skillGroupOf } from '@pathpilot/shared';
import type { AgentEvent, AgentTurnDecision } from '@earendil-works/pi-agent-core';
import { markFlowResult, prepareFlow } from './flow.js';
import { isSessionAutoWriteEnabled } from './autoWrite.js';

export interface StreamEvent {
  type: 'session' | 'thinking' | 'tool_start' | 'tool_progress' | 'tool_end' | 'text' | 'done' | 'error';
  // thinking/text: 增量内容；tool_*: 工具名；done: 完整回复 + 工具链
  delta?: string;
  name?: string;
  summary?: string;
  engine?: 'pi-llm' | 'rules';
  model?: string;
  fallbackReason?: string;
  sessionId?: number;
  /** done：本次落库的 assistant 消息 id（前端用于重新生成） */
  messageId?: number;
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
 *   session(sessionId) → thinking(delta)… → [tool_start(name) → tool_progress(name,summary)* → tool_end(name,summary)]*
 *   （与 thinking/text 交错多轮）→ text(delta)… → done
 * LLM 未配置 / 失败 / 超时 / 工具超限：error(可读信息) → done(fallbackReason)，并把失败原因入库
 */
export async function streamChat(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const userId = getUserId(req);
  const parsed = agentChatInput.safeParse(req.body ?? {});
  if (!parsed.success) {
    reply.status(400).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; '),
      },
    });
    return;
  }
  const input = parsed.data;
  const message = input.message.trim();
  if (!message) {
    reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: '消息不能为空' } });
    return;
  }
  if (input.regenerateFrom && !input.sessionId) {
    reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: '重新生成需要指定会话' } });
    return;
  }

  const sid = await ensureSession(userId, input.sessionId);
  if (input.regenerateFrom) {
    try {
      await truncateForRegenerate(sid, input.regenerateFrom);
    } catch (err) {
      reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: err instanceof Error ? err.message : '无法重新生成该回复' },
      });
      return;
    }
  }
  await db.insert(agentChatMessages).values({ sessionId: sid, role: 'user', content: message });
  const flow = await prepareFlow(userId, sid, message);

  // 直接写 raw 响应会绕过 fastify 生命周期，@fastify/cors 的 hook 不会执行，
  // 必须手动补上 CORS 头，否则浏览器跨域读取 SSE 时报 "Failed to fetch"。
  // 头值必须过白名单（与 app.ts 一致），不能反射任意 Origin
  const origin = req.headers.origin;
  const allowedOrigin = origin && config.corsOrigins.includes(origin) ? origin : undefined;
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
    ...(allowedOrigin ? { 'Access-Control-Allow-Origin': allowedOrigin, 'Access-Control-Allow-Credentials': 'true', Vary: 'Origin' } : {}),
  });

  let closed = false;
  let heartbeat: NodeJS.Timeout | undefined;
  let clientGone = false;
  let activeAgent: { abort: () => void } | null = null;
  let stopResolve: (() => void) | null = null;
  // 注意：不能用 req.raw 的 close——Fastify 读完请求体后它会立即触发（实测 ~2ms），
  // 必须用 reply.raw 的 close 区分「正常结束」和「客户端提前断开」
  const disconnect = () => {
    if (clientGone) return;
    clientGone = true;
    closed = true;
    if (heartbeat) clearInterval(heartbeat);
    activeAgent?.abort();
    stopResolve?.(); // agent.prompt 被 abort 后可能不 settle，用 race 兜底放出
  };
  const send = (event: StreamEvent) => {
    if (closed) return;
    try {
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch {
      disconnect();
    }
  };
  const finish = (payload: StreamEvent) => {
    if (closed) return;
    closed = true;
    if (heartbeat) clearInterval(heartbeat);
    try {
      reply.raw.write(`data: ${JSON.stringify({ ...payload, sessionId: sid })}\n\n`);
      reply.raw.end();
    } catch {
      /* 客户端已断开 */
    }
  };
  // 心跳：长工具（岗位搜索/规划生成）期间避免代理或浏览器按空闲断开连接
  heartbeat = setInterval(() => {
    if (closed) return;
    try {
      reply.raw.write(': ping\n\n');
    } catch {
      disconnect();
    }
  }, 15_000);
  reply.raw.on('error', () => {
    /* 客户端断开后的写错误不应影响进程 */
  });
  reply.raw.on('close', () => {
    if (!closed) disconnect();
  });
  // 客户端在写响应头前就已断开（close 事件可能已错过）
  if (reply.raw.destroyed) disconnect();

  // 先下发会话 id：新建会话/会话已失效重建时，客户端能立即拿到正确 id
  send({ type: 'session', sessionId: sid });

  let ctx: Awaited<ReturnType<typeof buildUserContext>>;
  try {
    ctx = await buildUserContext(userId);
  } catch (err) {
    console.warn(`[agent-chat-stream] 构建用户上下文失败：${err instanceof Error ? err.message : err}`);
    const errorId = await saveAssistantError(sid, '用户数据加载失败，请稍后重试', 'USER_CONTEXT_FAILED').catch(() => undefined);
    send({ type: 'error', delta: '用户数据加载失败，请稍后重试' });
    finish({ type: 'done', engine: 'pi-llm', fallbackReason: '用户数据加载失败', messageId: errorId });
    return;
  }

  if (!(await isLlmConfigured())) {
    const msg = '未配置模型 API：请管理员在 /admin 页面配置后使用 AI 对话';
    const errorId = await saveAssistantError(sid, msg, 'MODEL_NOT_CONFIGURED').catch(() => undefined);
    send({ type: 'error', delta: msg });
    finish({ type: 'done', engine: 'pi-llm', fallbackReason: '未配置模型 API', messageId: errorId });
    return;
  }

  const recent = await loadRecentHistory(sid);
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
  let toolStarted = 0;
  let totalToolCalls = 0;
  let outOfBudget = false;
  let timedOut = false;
  let usedModel: string | undefined;

  /** 提取 Agent 消息流中最后一条 assistant 文本（停止/超时后也保留已生成部分） */
  const textOf = (agent: unknown): string => {
    const msgs = (agent as { state?: { messages?: unknown[] } }).state?.messages ?? [];
    const last = [...msgs].reverse().find((m: unknown) => (m as { role?: string }).role === 'assistant');
    return last && Array.isArray((last as { content?: unknown[] }).content)
      ? ((last as { content: { type: string; text?: string }[] }).content.filter((c) => c.type === 'text').map((c) => c.text ?? '').join('') as string)
      : '';
  };

  const attempt = async (): Promise<string> => {
    if (clientGone) return '';
    const { Agent } = await import('@earendil-works/pi-agent-core');
    const { resolveModel } = await import('./pi/provider.js');
    const { buildAgentTools } = await import('./pi/tools.js');
    const { models, model } = await resolveModel();
    usedModel = model.id;
    totalToolCalls = 0;
    outOfBudget = false;
    timedOut = false;
    const agent = new Agent({
      initialState: {
        systemPrompt: buildAdvisorSystemPrompt(ctxSummary, flow, input.answerStyle),
        model,
        tools: tracedTools(
          buildAgentTools(userId, {
            onProgress: (name, messageText) => send({ type: 'tool_progress', name, summary: messageText }),
            autoWrite: isSessionAutoWriteEnabled(sid),
          }),
          trace,
          () => {
            toolStarted++;
          }
        ),
        messages: recent as never[],
        thinkingLevel: input.thinking ? 'low' : 'off',
      },
      streamFn: models.streamSimple.bind(models) as never,
      beforeToolCall: async () => {
        totalToolCalls++;
        if (totalToolCalls > config.agentLimits.maxToolCalls) {
          outOfBudget = true;
          return { block: true, reason: '已达到工具调用次数上限，请直接给出最终回答', terminate: true };
        }
        return undefined;
      },
      finishTurn: (): AgentTurnDecision | undefined => {
        if (outOfBudget) return { action: 'end' };
        return undefined;
      },
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

    let timer: NodeJS.Timeout | undefined;
    let wake: (() => void) | undefined;
    timer = setTimeout(() => {
      timedOut = true;
      agent.abort();
      wake?.();
    }, config.agentLimits.chatWallClockMs);
    try {
      await Promise.race([
        agent.prompt(message),
        new Promise<void>((resolve) => {
          wake = resolve;
          stopResolve = resolve;
        }),
      ]);
    } catch (err) {
      // 客户端停止/超时触发的 abort 不视为模型错误
      if (!timedOut && !clientGone) throw err;
    } finally {
      if (timer) clearTimeout(timer);
      if (stopResolve === wake) stopResolve = null;
    }

    if (clientGone) return textOf(agent);
    const finalText = textOf(agent);
    if (!finalText.trim()) {
      if (timedOut) throw new Error('AGENT_TIMEOUT');
      if (outOfBudget) throw new Error('TOOL_BUDGET');
      throw new Error('模型返回为空');
    }
    return finalText;
  };

  let text = '';
  let stopReason: 'stopped' | 'timeout' | 'budget' | '' = '';
  try {
    text = await attempt();
    if (timedOut) stopReason = 'timeout';
    else if (outOfBudget) stopReason = 'budget';
  } catch (err) {
    if (clientGone) {
      stopReason = 'stopped';
    } else {
      let llmErr = err instanceof Error ? err.message : String(err);
      // 仅当本次尝试没有执行任何工具（无副作用）且非超时错误时才自动重试一次
      const canRetry = toolStarted === 0 && !timedOut && !/timed? ?out|timeout|超时|取消|abort/i.test(llmErr);
      if (canRetry && /econn|fetch failed|network|50[234]/i.test(llmErr)) {
        await new Promise((r) => setTimeout(r, 2000));
        if (clientGone) {
          stopReason = 'stopped';
          llmErr = '';
        } else {
          try {
            text = await attempt();
            llmErr = '';
            if (timedOut) stopReason = 'timeout';
            else if (outOfBudget) stopReason = 'budget';
          } catch (err3) {
            llmErr = err3 instanceof Error ? err3.message : String(err3);
          }
        }
      }
      if (llmErr) {
        console.warn(`[agent-chat-stream] LLM 失败：${llmErr}`);
        const errorCode = /AGENT_TIMEOUT|超时/.test(llmErr) ? 'AGENT_TIMEOUT' : /TOOL_BUDGET|工具调用次数/.test(llmErr) ? 'TOOL_BUDGET' : 'MODEL_CALL_FAILED';
        const friendly = /AGENT_TIMEOUT|超时/.test(llmErr)
          ? '生成超时，请重试'
          : /TOOL_BUDGET|工具调用次数/.test(llmErr)
            ? '工具调用次数已达上限，请缩小任务范围'
            : `模型调用失败：${llmErr.slice(0, 160)}`;
        const errorId = await saveAssistantError(sid, `本次回复生成失败：${friendly}`, errorCode).catch(() => undefined);
        send({ type: 'error', delta: friendly });
        finish({ type: 'done', engine: 'pi-llm', model: usedModel, fallbackReason: friendly, messageId: errorId });
        return;
      }
    }
  }
  if (clientGone) stopReason = 'stopped';

  // 无任何输出：落一条带 errorCode 的占位消息，前端可展示原因且不进入后续上下文
  if (!text.trim()) {
    const content =
      stopReason === 'stopped'
        ? '（已停止生成）'
        : stopReason === 'timeout'
          ? '（生成超时，请重试）'
          : stopReason === 'budget'
            ? '（工具调用次数已达上限，请缩小任务范围）'
            : '（本次回复没有产生内容，请重试）';
    const code = stopReason === 'stopped' ? 'STOPPED' : stopReason === 'timeout' ? 'AGENT_TIMEOUT' : stopReason === 'budget' ? 'TOOL_BUDGET' : 'EMPTY_RESPONSE';
    const errorId = await saveAssistantError(sid, content, code).catch(() => undefined);
    finish({ type: 'done', engine: 'pi-llm', model: usedModel, fallbackReason: stopReason === 'stopped' ? '已停止生成' : content, messageId: errorId });
    return;
  }

  const inserted = await db
    .insert(agentChatMessages)
    .values({
      sessionId: sid,
      role: 'assistant',
      content: text,
      engine: 'pi-llm',
      toolCalls: trace.length ? trace : null,
    })
    .returning();
  await db.update(agentChatSessions).set({ updatedAt: new Date().toISOString() }).where(eq(agentChatSessions.id, sid));
  if (trace.length) await markFlowResult(sid);
  const fallback =
    stopReason === 'stopped'
      ? '已停止生成（保留已输出部分）'
      : stopReason === 'timeout'
        ? '生成超时（保留已输出部分）'
        : stopReason === 'budget'
          ? '工具调用次数已达上限，回答可能不完整'
          : undefined;
  finish({ type: 'done', engine: 'pi-llm', model: usedModel, fallbackReason: fallback, messageId: inserted[0]?.id });
}
