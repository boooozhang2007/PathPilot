// Pi Agent 运行时测试（fauxProvider，无网络依赖）：LLM ↔ 工具循环 / 工具次数限制（计划阶段 2.5 遗留项）
import { describe, it, expect } from 'vitest';
import { createModels, fauxProvider, fauxAssistantMessage, fauxToolCall, Type } from '@earendil-works/pi-ai';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import { runAgentWith } from '../../src/agent/pi/runtime.js';

const echoTool: AgentTool<any> = {
  label: '回声',
  name: 'echo',
  description: '返回输入文本',
  parameters: Type.Object({ text: Type.String() }),
  execute: async (_id, raw) => ({ content: [{ type: 'text', text: `echo:${(raw as { text: string }).text}` }], details: {} }),
};

function setupFaux(responses: ReturnType<typeof fauxAssistantMessage>[]) {
  const faux = fauxProvider({ models: [{ id: 'faux-test' }] });
  const models = createModels();
  models.setProvider(faux.provider);
  faux.setResponses(responses);
  return { models, model: faux.getModel(), faux };
}

describe('Pi Agent 运行时（fauxProvider）', () => {
  it('完整循环：模型调用工具 → 工具执行 → 模型给出最终文本', async () => {
    const { models, model } = setupFaux([
      fauxAssistantMessage([fauxToolCall('echo', { text: '你好' })], { stopReason: 'toolUse' }),
      fauxAssistantMessage('顾问回答：已完成 echo。'),
    ]);
    const out = await runAgentWith(models, model, { systemPrompt: 'test', prompt: '请调用 echo', tools: [echoTool] });
    expect(out.aborted).toBe(false);
    expect(out.toolCalls).toEqual(['echo']);
    expect(out.text).toContain('顾问回答');
  });

  it('无工具调用时直接返回文本', async () => {
    const { models, model } = setupFaux([fauxAssistantMessage('直接回答。')]);
    const out = await runAgentWith(models, model, { systemPrompt: 'test', prompt: 'hi' });
    expect(out.text).toBe('直接回答。');
    expect(out.toolCalls).toEqual([]);
  });

  it('工具次数超限被拦截并终止（maxToolCalls=0）', async () => {
    const { models, model } = setupFaux([
      fauxAssistantMessage([fauxToolCall('echo', { text: 'x' })], { stopReason: 'toolUse' }),
      fauxAssistantMessage('被拦截后的回答。'),
    ]);
    const out = await runAgentWith(models, model, { systemPrompt: 'test', prompt: 'go', tools: [echoTool], maxToolCalls: 0 });
    expect(out.toolCalls).toEqual(['echo']); // 计入审计
    expect(out.text).toBe(''); // terminate 结束，无最终文本
    expect(out.aborted).toBe(false);
  });

  it('带历史（assistant 缺 usage 的裸结构会导致 estimate 崩溃）——toPiHistory 映射后正常', async () => {
    const { toPiHistory } = await import('../../src/agent/advisor.js');
    const rows = [
      { role: 'user' as const, content: '第一问', createdAt: '2026-10-24T10:00:00.000Z' },
      { role: 'assistant' as const, content: '第一答', createdAt: '2026-10-24T10:00:05.000Z' },
    ];
    // 显式构造裸历史（旧 bug 形态）→ 证明会崩
    {
      const { models, model } = setupFaux([fauxAssistantMessage('任意')]);
      await expect(
        runAgentWith(models, model, { systemPrompt: 't', prompt: '第二问', history: rows.map((r) => ({ role: r.role, content: r.content, timestamp: 0 })) })
      ).rejects.toThrow(); // 裸 assistant 结构必然崩溃（真实场景崩在 usage.totalTokens）
    }
    // toPiHistory 映射后 → 正常
    {
      const { models, model } = setupFaux([fauxAssistantMessage('第二答')]);
      const out = await runAgentWith(models, model, { systemPrompt: 't', prompt: '第二问', history: toPiHistory(rows) });
      expect(out.text).toBe('第二答');
    }
  });

  it('模型错误 stopReason 抛 MODEL_CALL_FAILED', async () => {
    const { models, model } = setupFaux([fauxAssistantMessage('x', { stopReason: 'error', errorMessage: 'quota' })]);
    await expect(runAgentWith(models, model, { systemPrompt: 't', prompt: 'p' })).rejects.toThrow(/quota|模型返回错误/);
  });

  it('取消后不会把历史中的旧回答误认为本次模型结果', async () => {
    const { models, model } = setupFaux([fauxAssistantMessage('不应生成的新回答')]);
    const out = await runAgentWith(models, model, {
      systemPrompt: 't', prompt: '新问题', signal: AbortSignal.abort(),
      history: [fauxAssistantMessage('这是上一轮旧回答')],
    });
    expect(out.aborted).toBe(true);
    expect(out.text).toBe('');
  });
});
