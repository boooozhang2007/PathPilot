import { Agent, type AgentMessage, type AgentTool } from '@earendil-works/pi-agent-core';
import { Type, type Api, type Model, type Models, type ModelThinkingLevel } from '@earendil-works/pi-ai';
import { z, type ZodType } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { config } from '../../config.js';
import { outputInvalid } from '../../services/errors.js';
import { resolveModel } from './provider.js';

interface RunOptions {
  systemPrompt: string;
  prompt: string;
  history?: unknown[];
  tools?: AgentTool<any>[];
  wallClockMs?: number;
  maxToolCalls?: number;
  thinkingLevel?: ModelThinkingLevel;
  signal?: AbortSignal;
  stopWhen?: () => boolean;
}

export interface AgentOutcome {
  text: string;
  toolCalls: string[];
  aborted: boolean;
}

export async function runAgentWith(models: Models, model: Model<Api>, opts: RunOptions): Promise<AgentOutcome> {
  const toolCalls: string[] = [];
  let aborted = false;
  let budgetExceeded = false;
  let wake: (() => void) | undefined;
  const agent = new Agent({
    initialState: {
      systemPrompt: opts.systemPrompt,
      model,
      messages: (opts.history ?? []) as AgentMessage[],
      tools: opts.tools ?? [],
      thinkingLevel: opts.thinkingLevel ?? 'off',
    },
    streamFn: models.streamSimple.bind(models),
    toolExecution: 'sequential',
    beforeToolCall: async () => {
      if (toolCalls.length > (opts.maxToolCalls ?? config.agentLimits.maxToolCalls)) {
        budgetExceeded = true;
        return { block: true, terminate: true, reason: '已达到工具调用次数上限' };
      }
      return undefined;
    },
    finishTurn: () => budgetExceeded || opts.stopWhen?.() ? { action: 'end' } : undefined,
  });
  const historyLength = agent.state.messages.length;
  // Pi checks the argument schema before beforeToolCall. Count every attempt,
  // including malformed or unknown tools, so those cannot loop past the budget.
  agent.subscribe((event) => {
    if (event.type === 'tool_execution_start') {
      toolCalls.push(event.toolName);
      if (toolCalls.length > (opts.maxToolCalls ?? config.agentLimits.maxToolCalls)) budgetExceeded = true;
    }
  });
  const abort = () => {
    aborted = true;
    agent.abort();
    wake?.();
  };
  const stopped = new Promise<void>((resolve) => { wake = resolve; });
  opts.signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, opts.wallClockMs ?? config.agentLimits.wallClockMs);
  try {
    if (opts.signal?.aborted) abort();
    else {
      const prompting = agent.prompt(opts.prompt);
      await Promise.race([prompting, stopped]);
      // abort 会在 race 中先胜出；仍须等待 Pi 完成取消与消息落尾，避免读取到中间状态。
      if (aborted) await prompting;
    }
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', abort);
  }
  const last = agent.state.messages.slice(historyLength).reverse().find((message) => message.role === 'assistant');
  if (last?.role === 'assistant') {
    // 超时/取消会把底层连接错误转换成 error；这类结果应如实标记 aborted，而不是误报为模型调用失败。
    if (last.stopReason === 'error' && aborted) {
      return {
        text: last.content.filter((part) => part.type === 'text').map((part) => part.text).join(''),
        toolCalls,
        aborted: true,
      };
    }
    if (last.stopReason === 'error') throw new Error(last.errorMessage || '模型返回错误');
    return {
      text: last.content.filter((part) => part.type === 'text').map((part) => part.text).join(''),
      toolCalls,
      aborted: aborted || last.stopReason === 'aborted',
    };
  }
  return { text: '', toolCalls, aborted };
}

/** Capture a schema-validated submission; invalid output never reaches persistence. */
export async function runStructuredAgent<T>(
  opts: Omit<RunOptions, 'stopWhen'> & { schema: ZodType<T, z.ZodTypeDef, any> },
  select?: (toolCalls: string[], captured: T[]) => unknown
): Promise<{ data: T; toolCalls: string[] }> {
  const { models, model } = await resolveModel();
  const deadline = Date.now() + (opts.wallClockMs ?? config.agentLimits.wallClockMs);
  const captured: T[] = [];
  const toolCalls: string[] = [];
  const submit: AgentTool<any> = {
    name: 'submit_result',
    label: '提交结果',
    description: '提交符合结构的最终结果，data 必须包含完整 JSON。',
    parameters: Type.Object({ data: Type.Unsafe(zodToJsonSchema(opts.schema, { $refStrategy: 'none' })) }),
    execute: async (_id, raw, signal) => {
      signal?.throwIfAborted();
      const data = opts.schema.parse((raw as { data: unknown }).data);
      captured.push(data);
      return { content: [{ type: 'text', text: '结果已通过校验。' }], details: {} };
    },
  };
  let error = '模型未调用 submit_result 提交有效结果';
  for (let attempt = 0; attempt <= config.agentLimits.maxRetries; attempt++) {
    opts.signal?.throwIfAborted();
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error('模型运行超时');
    const out = await runAgentWith(models, model, {
      ...opts,
      tools: [...(opts.tools ?? []), submit],
      wallClockMs: remaining,
      prompt: `${opts.prompt}${attempt ? `\n上次结果未通过校验：${error}。请修正并调用 submit_result。` : ''}`,
      stopWhen: () => captured.length > 0,
    });
    toolCalls.push(...out.toolCalls);
    if (out.aborted) throw new Error(opts.signal?.aborted ? '模型运行已取消' : '模型运行超时');
    const result = opts.schema.safeParse(select ? select(toolCalls, captured) : captured.at(-1));
    if (result.success) return { data: result.data, toolCalls };
    error = result.error.message;
  }
  throw outputInvalid(`模型输出未通过结构校验：${error}`);
}
