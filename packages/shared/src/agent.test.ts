import { afterEach, describe, expect, it, vi } from 'vitest';
import { abortableDelay, applyAgentEvent, completedAgentTools, createAgentEventParser, readAgentStream, type AgentStreamEvent, type AgentStreamState } from './agent';
import { agentChatInput } from './schemas';

afterEach(() => vi.useRealTimers());

describe('Agent stream contract', () => {
  it('跨包 CRLF、多行 data、无空格 data 和尾部事件均可解析', () => {
    const events: AgentStreamEvent[] = [];
    const parser = createAgentEventParser((event) => events.push(event));
    parser.push(': ping\r\n\r\ndata:{"type":"text",\r\ndata: "delta":"中文"}\r');
    parser.push('\n\r');
    parser.push('\ndata: {"type":"done","messageId":3}');
    parser.finish();
    expect(events).toEqual([{ type: 'text', delta: '中文' }, { type: 'done', messageId: 3 }]);
  });

  it('不完整 JSON 不能悄悄当成已完成的回复', () => {
    const parser = createAgentEventParser(() => {});
    parser.push('data: {"type":"done"');
    expect(() => parser.finish()).toThrow('不完整');
  });

  it('连接关闭但没有 done 时不将回复报告为成功', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new TextEncoder().encode('data: {"type":"text","delta":"半条"}\n\n')); controller.close(); },
    });
    await expect(readAgentStream(body, () => {})).rejects.toMatchObject({ code: 'STREAM_INTERRUPTED' });
  });

  it('生成过程中取消读取会立即释放读取锁', async () => {
    let canceled = false;
    const body = new ReadableStream<Uint8Array>({ cancel() { canceled = true; } });
    const controller = new AbortController();
    const pending = readAgentStream(body, () => {}, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await Promise.resolve();
    expect(canceled).toBe(true);
  });

  it('同名工具按调用 ID 分别结束，中止不能显示成功', () => {
    let state: AgentStreamState = { text: '', thinking: '', tools: [], startedAt: 0 };
    state = applyAgentEvent(state, { type: 'tool_start', name: 'search_jobs', toolCallId: 'first' });
    state = applyAgentEvent(state, { type: 'tool_start', name: 'search_jobs', toolCallId: 'second' });
    state = applyAgentEvent(state, { type: 'tool_end', name: 'search_jobs', toolCallId: 'second', isError: true });
    expect(state.tools.map((tool) => tool.status)).toEqual(['running', 'error']);
    expect(completedAgentTools(state.tools).map((tool) => tool.status)).toEqual(['canceled', 'error']);
  });

  it('等待期间取消会立即结束并清理计时器', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const pending = abortableDelay(1200, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('空白消息及缺少会话的重新生成在写入前拒绝', () => {
    expect(agentChatInput.safeParse({ message: '  ' }).success).toBe(false);
    expect(agentChatInput.safeParse({ message: '问题', regenerateFrom: 1 }).success).toBe(false);
    expect(agentChatInput.parse({ message: '  问题  ' }).message).toBe('问题');
  });
});
