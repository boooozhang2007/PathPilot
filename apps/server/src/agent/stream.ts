// SSE 只负责传输；模型循环、取消与工具预算统一由 Pi runtime 管理。
import { and, eq } from 'drizzle-orm';
import type { FastifyRequest, FastifyReply } from 'fastify';
import {
  agentChatInput, abortableDelay, applyAgentEvent, completedAgentTools,
  type AgentStreamEvent, type AgentStreamState, type ChatMessageDTO,
} from '@pathpilot/shared';
import { db } from '../db/client.js';
import { agentChatSessions, agentChatMessages } from '../db/schema.js';
import { getUserId } from '../auth/index.js';
import { config } from '../config.js';
import { badRequest, notFound } from '../services/errors.js';
import { buildAdvisorSystemPrompt, loadRecentHistory, summarizeToolResult, truncateForRegenerate } from './advisor.js';
import { buildUserContext } from './context.js';
import { isLlmConfigured } from './settings.js';
import { markFlowResult, prepareFlow } from './flow.js';
import { isSessionAutoWriteEnabled, setSessionAutoWrite } from './autoWrite.js';
import { beginSessionRequest, claimSessionExecution } from './sessionExecution.js';
import { runAgentWith } from './pi/runtime.js';
import { resolveModel } from './pi/provider.js';
import { buildAgentTools } from './pi/tools.js';

export type StreamEvent = AgentStreamEvent;

async function ensureSession(userId: number, sessionId?: number): Promise<number> {
  if (sessionId) {
    const found = db.select({ id: agentChatSessions.id }).from(agentChatSessions)
      .where(and(eq(agentChatSessions.id, sessionId), eq(agentChatSessions.userId, userId))).get();
    if (!found) throw notFound('对话已删除或无法访问，请开启新对话');
    return sessionId;
  }
  return db.insert(agentChatSessions).values({ userId }).returning({ id: agentChatSessions.id }).get().id;
}

export async function streamChat(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const userId = getUserId(req);
  const input = agentChatInput.parse(req.body ?? {});
  const request = beginSessionRequest(userId, input.sessionId);
  let sid: number;
  let execution: ReturnType<typeof claimSessionExecution>;
  try {
    sid = await ensureSession(userId, input.sessionId);
    execution = claimSessionExecution(sid, userId);
  } catch (error) {
    request.release();
    throw error;
  }
  let closed = false;
  let headersStarted = false;
  let heartbeat: NodeJS.Timeout | undefined;
  let usedModel: string | undefined;
  let state: AgentStreamState = { text: '', thinking: '', tools: [], startedAt: Date.now(), phase: 'connecting' };
  const disconnect = () => { closed = true; execution.abort(); };
  reply.raw.once('close', disconnect);
  reply.raw.on('error', disconnect);

  const emit = (event: AgentStreamEvent) => {
    state = applyAgentEvent(state, event);
    if (closed || reply.raw.destroyed) return;
    reply.raw.write('data: ' + JSON.stringify(event) + '\n\n');
  };
  const finish = (event: AgentStreamEvent) => {
    if (closed || reply.raw.destroyed) return;
    emit({ ...event, sessionId: sid });
    closed = true;
    reply.raw.end();
  };
  const persist = async (content: string, errorCode: string | null): Promise<ChatMessageDTO> => {
    const row = db.transaction((tx) => {
      const saved = tx.insert(agentChatMessages).values({
        sessionId: sid, role: 'assistant', content, engine: 'pi-llm',
        errorCode, thinking: state.thinking.trim() || null,
        toolCalls: completedAgentTools(state.tools),
      }).returning().get();
      tx.update(agentChatSessions).set({ updatedAt: new Date().toISOString() })
        .where(eq(agentChatSessions.id, sid)).run();
      return saved;
    });
    if (!errorCode && state.tools.some((tool) => tool.status === 'done')) await markFlowResult(sid);
    return { id: row.id, sessionId: sid, role: 'assistant', content: row.content,
      engine: 'pi-llm', errorCode: row.errorCode, thinking: row.thinking,
      toolCalls: row.toolCalls ?? [], createdAt: row.createdAt };
  };

  try {
    if (reply.raw.destroyed) return;
    const configured = await isLlmConfigured();
    // 重新生成先检查运行条件，不能因未配置模型删除原有回复。
    if (input.regenerateFrom && !configured) throw badRequest('未配置模型 API，暂时无法重新生成');
    if (input.regenerateFrom) await truncateForRegenerate(sid, input.regenerateFrom);
    if (typeof input.autoWrite === 'boolean') setSessionAutoWrite(sid, input.autoWrite);
    const autoWrite = isSessionAutoWriteEnabled(sid);
    const userMessage = db.insert(agentChatMessages).values({ sessionId: sid, role: 'user', content: input.message })
      .returning({ id: agentChatMessages.id }).get();
    const origin = req.headers.origin;
    const allowed = origin && config.corsOrigins.includes(origin) ? origin : undefined;
    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive', 'X-Accel-Buffering': 'no',
      ...(allowed ? { 'Access-Control-Allow-Origin': allowed, 'Access-Control-Allow-Credentials': 'true', Vary: 'Origin' } : {}),
    });
    headersStarted = true;
    heartbeat = setInterval(() => {
      if (!closed && !reply.raw.destroyed) reply.raw.write(': ping\n\n');
    }, 15_000);
    emit({ type: 'session', sessionId: sid, userMessageId: userMessage.id, autoWrite });
    let flow: Awaited<ReturnType<typeof prepareFlow>> | null = null;
    if (!closed) {
      try { flow = await prepareFlow(userId, sid, input.message); }
      catch (error) { req.log.warn({ error, sessionId: sid }, 'agent flow preparation failed'); }
    }

    let content = '';
    let errorCode: string | null = null;
    let failure = '';
    if (execution.signal.aborted) {
      failure = '已停止生成';
      errorCode = 'STOPPED';
    } else if (!configured) {
      failure = '未配置模型 API，请联系管理员完成模型设置后重试';
      errorCode = 'MODEL_NOT_CONFIGURED';
    } else if (!flow) {
      failure = '加载对话流程失败，请重试';
      errorCode = 'USER_CONTEXT_FAILED';
    } else {
      try {
        const ctx = await buildUserContext(userId);
        const summary = JSON.stringify({
          个人资料: ctx.profile,
          技能档案: ctx.skills.map((skill) => ({ name: skill.name, level: skill.level, status: skill.evidenceStatus })),
          经历: ctx.experiences.map((experience) => ({
            type: experience.type, title: experience.title, technologies: experience.technologies, result: experience.result,
          })),
          岗位分析: ctx.analysis ? {
            target: ctx.analysis.targetRole, sampleCount: ctx.analysis.sampleCount, topSkills: ctx.analysis.result.skills.slice(0, 12),
          } : null,
          当前任务: ctx.activeTasks.slice(0, 20).map((task) => ({
            id: task.id, title: task.title, status: task.status, priority: task.priority, parentTaskId: task.parentTaskId,
          })),
        });
        const history = await loadRecentHistory(sid);
        const deadline = Date.now() + config.agentLimits.chatWallClockMs;
        let toolAttempts = 0;
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const { models, model } = await resolveModel();
            usedModel = model.id;
            const outcome = await runAgentWith(models, model, {
              systemPrompt: buildAdvisorSystemPrompt(summary, flow, input.answerStyle, autoWrite),
              prompt: input.message, history,
              tools: buildAgentTools(userId, {
                autoWrite,
                onProgress: (name, message) => emit({ type: 'tool_progress', name, summary: message }),
              }),
              thinkingLevel: input.thinking ? 'low' : 'off',
              signal: execution.signal, wallClockMs: Math.max(1, deadline - Date.now()),
              onEvent: (event) => {
                if (event.type === 'message_update') {
                  const update = event.assistantMessageEvent;
                  if (update.type === 'thinking_delta') emit({ type: 'thinking', delta: update.delta });
                  if (update.type === 'text_delta') emit({ type: 'text', delta: update.delta });
                }
                if (event.type === 'tool_execution_start') {
                  toolAttempts++;
                  emit({ type: 'tool_start', name: event.toolName, toolCallId: event.toolCallId });
                }
                if (event.type === 'tool_execution_end') {
                  const fallback = event.result?.content?.find((part: { type?: string; text?: string }) => part.type === 'text')?.text ?? '';
                  emit({ type: 'tool_end', name: event.toolName, toolCallId: event.toolCallId,
                    summary: summarizeToolResult(event.toolName, event.result?.details, fallback, event.isError),
                    isError: event.isError });
                }
              },
            });
            content = outcome.text.trim();
            if (execution.signal.aborted || outcome.stopReason === 'stopped') {
              errorCode = 'STOPPED'; failure = '已停止生成，已保留收到的内容';
            } else if (outcome.stopReason === 'timeout' || outcome.aborted) {
              errorCode = 'AGENT_TIMEOUT'; failure = '生成超时，已保留收到的内容，可重试';
            } else if (outcome.stopReason === 'budget') {
              errorCode = 'TOOL_BUDGET'; failure = '已达到本次工具调用上限，可分步继续';
            }
            if (!content && !errorCode) {
              errorCode = 'EMPTY_RESPONSE'; failure = '模型没有返回内容，请重试';
            }
            break;
          } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            if (execution.signal.aborted) {
              errorCode = 'STOPPED'; failure = '已停止生成，已保留收到的内容'; break;
            }
            const canRetry = attempt === 0 && toolAttempts === 0 && !state.text && !state.thinking
              && /econn|fetch failed|network|50[234]/i.test(detail) && Date.now() + 2000 < deadline;
            if (canRetry) {
              await abortableDelay(2000, execution.signal);
              continue;
            }
            errorCode = 'MODEL_CALL_FAILED';
            failure = '模型调用失败：' + detail.slice(0, 160);
            req.log.warn({ error: detail, sessionId: sid }, 'agent chat failed');
            break;
          }
        }
      } catch (error) {
        errorCode = execution.signal.aborted ? 'STOPPED' : 'USER_CONTEXT_FAILED';
        failure = execution.signal.aborted ? '已停止生成' : '加载对话数据失败，请重试';
        if (!execution.signal.aborted) req.log.warn({ error, sessionId: sid }, 'agent context failed');
      }
    }

    content ||= state.text.trim() || (errorCode === 'STOPPED' ? '（已停止生成）' : failure);
    const saved = await persist(content, errorCode);
    if (errorCode && errorCode !== 'STOPPED') emit({ type: 'error', delta: failure, errorCode });
    finish({ type: 'done', engine: 'pi-llm', model: usedModel, messageId: saved.id,
      reply: saved, errorCode: errorCode ?? undefined, fallbackReason: failure || undefined });
  } catch (error) {
    if (!headersStarted) throw error;
    req.log.error({ error, sessionId: sid }, 'agent stream persistence failed');
    if (!closed && !reply.raw.destroyed) {
      emit({ type: 'error', delta: '回复未能保存，请重试', errorCode: 'DB_WRITE_FAILED' });
      finish({ type: 'done', errorCode: 'DB_WRITE_FAILED', fallbackReason: '回复未能保存' });
    }
  } finally {
    if (heartbeat) clearInterval(heartbeat);
    execution.release();
    request.release();
    reply.raw.removeListener('close', disconnect);
    reply.raw.removeListener('error', disconnect);
  }
}
