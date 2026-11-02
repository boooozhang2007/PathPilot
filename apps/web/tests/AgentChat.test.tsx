import { act } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentChat } from '../components/AgentChat';
import { api } from '../lib/api';

vi.mock('../lib/api', () => ({
  api: vi.fn(),
  getToken: () => 'test-token',
  clearToken: vi.fn(),
  API_BASE: 'http://localhost:3000',
}));
vi.mock('../components/Markdown', () => ({ Markdown: ({ text }: { text: string }) => <p data-message>{text}</p> }));
vi.mock('../components/Icon', () => ({ Ic: () => <span /> }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function stream() {
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start(value) { controller = value; } });
  return {
    response: new Response(body),
    push(event: object) { controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)); },
    close() { controller.close(); },
    abort() { controller.error(new DOMException('Aborted', 'AbortError')); },
  };
}

describe('AI 顾问流式会话', () => {
  let renderer: ReactTestRenderer;
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('window', { setTimeout, clearTimeout });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => callback(0));
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    vi.mocked(api).mockReset();
    vi.mocked(api).mockImplementation(async (path) => {
      if (path === '/api/profile') return { targetRole: 'Java', grade: 'freshman', weeklyHours: 8 };
      if (path === '/api/agent/sessions') return [];
      return null;
    });
  });

  afterEach(async () => {
    if (renderer) await act(async () => renderer.unmount());
    vi.unstubAllGlobals();
  });

  async function mount() {
    await act(async () => { renderer = create(<AgentChat full />); });
  }

  function scenario() {
    return renderer.root.findAllByType('button').find((node) => node.props.title?.startsWith('基于我档案'))!;
  }

  function newChat() {
    return renderer.root.findAllByType('button').find((node) => node.children.includes(' 新对话'))!;
  }

  function replies() {
    return renderer.root.findAllByType('p').filter((node) => node.props['data-message']).map((node) => node.children.join(''));
  }

  function text(value: string) {
    return renderer.root.findAll((node) => node.children.includes(value));
  }

  it('React 批处理流事件时，完成后保留全文、思考和服务端消息 ID', async () => {
    const reply = stream();
    reply.push({ type: 'session', sessionId: 7 });
    reply.push({ type: 'thinking', delta: '先分析' });
    reply.push({ type: 'text', delta: '完整' });
    reply.push({ type: 'text', delta: '回答' });
    reply.push({ type: 'done', engine: 'rules', messageId: 42 });
    reply.close();
    fetchMock.mockResolvedValue(reply.response);
    await mount();

    await act(async () => { await scenario().props.onClick(); });

    expect(replies()).toEqual(['完整回答']);
    expect(renderer.root.findAllByType('pre').map((node) => node.children.join(''))).toEqual(['先分析']);
    expect(renderer.root.findAllByProps({ title: '停止生成' })).toHaveLength(0);
    const regenerate = renderer.root.findByProps({ label: '重新生成' });
    const regenerated = stream();
    regenerated.push({ type: 'text', delta: '重新回答' });
    regenerated.push({ type: 'done', messageId: 43 });
    regenerated.close();
    fetchMock.mockResolvedValueOnce(regenerated.response);
    await act(async () => { regenerate.props.onClick(); });
    expect(JSON.parse(fetchMock.mock.calls[1][1]?.body as string).regenerateFrom).toBe(42);
  });

  it('停止生成后保留已到达的部分回复', async () => {
    const reply = stream();
    fetchMock.mockImplementation(async (_url, init) => {
      init?.signal?.addEventListener('abort', reply.abort, { once: true });
      return reply.response;
    });
    await mount();
    await act(async () => { void scenario().props.onClick(); });
    await act(async () => { reply.push({ type: 'text', delta: '未完成的回答' }); });

    await act(async () => { renderer.root.findByProps({ title: '停止生成' }).props.onClick(); });

    expect(replies()).toEqual(['未完成的回答']);
    expect(renderer.root.findAllByProps({ title: '停止生成' })).toHaveLength(0);
  });

  it('以服务器保存的部分回复和正式消息 ID 覆盖流式预览', async () => {
    const reply = stream();
    reply.push({ type: 'session', sessionId: 7 });
    reply.push({ type: 'text', delta: '未落库的流预览' });
    reply.push({ type: 'done', errorCode: 'STOPPED', messageId: 46, reply: {
      id: 46, sessionId: 7, role: 'assistant', content: '服务端确认的部分回复', engine: 'pi-llm',
      errorCode: 'STOPPED', toolCalls: [], createdAt: new Date().toISOString(),
    } });
    reply.close();
    fetchMock.mockResolvedValue(reply.response);
    await mount();

    await act(async () => { await scenario().props.onClick(); });

    expect(replies()).toEqual(['服务端确认的部分回复']);
  });

  it('显式开启自动写入后，在本轮请求中发送授权状态', async () => {
    const reply = stream();
    reply.push({ type: 'session', sessionId: 7, autoWrite: true });
    reply.push({ type: 'text', delta: '已完成' });
    reply.push({ type: 'done', messageId: 47 });
    reply.close();
    fetchMock.mockResolvedValue(reply.response);
    await mount();

    await act(async () => {
      renderer.root.findByProps({ title: '开启后允许 Agent 直接创建与修改任务/规划/档案' }).props.onClick();
      await scenario().props.onClick();
    });

    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string).autoWrite).toBe(true);
  });

  it('生成中开启新对话，旧请求的中止回调不能污染新会话', async () => {
    const oldReply = stream();
    fetchMock.mockImplementationOnce(async (_url, init) => {
      init?.signal?.addEventListener('abort', oldReply.abort, { once: true });
      return oldReply.response;
    });
    await mount();
    await act(async () => { void scenario().props.onClick(); });
    await act(async () => { oldReply.push({ type: 'text', delta: '旧会话的内容' }); });

    await act(async () => { newChat().props.onClick(); });
    expect(replies()).toEqual([]);
    expect(renderer.root.findAllByProps({ title: '停止生成' })).toHaveLength(0);

    const freshReply = stream();
    freshReply.push({ type: 'text', delta: '新会话的内容' });
    freshReply.push({ type: 'done', messageId: 45 });
    freshReply.close();
    fetchMock.mockResolvedValueOnce(freshReply.response);
    await act(async () => { await scenario().props.onClick(); });
    expect(replies()).toEqual(['新会话的内容']);
  });

  it('开启新对话后，迟到的默认历史请求不能恢复旧会话', async () => {
    const history = deferred<unknown>();
    vi.mocked(api).mockImplementation(async (path) => {
      if (path === '/api/agent/session') return history.promise;
      if (path === '/api/agent/sessions') return [];
      return null;
    });
    await mount();
    await act(async () => { newChat().props.onClick(); });

    await act(async () => {
      history.resolve({ sessionId: 3, messages: [{ id: 9, role: 'assistant', content: '过期历史', toolCalls: [] }] });
    });
    expect(replies()).toEqual([]);
  });

  it('真实搜索工具失败会显示调用失败，并支持从原回复重试', async () => {
    const reply = stream();
    reply.push({ type: 'session', sessionId: 7 });
    reply.push({ type: 'tool_start', name: 'search_jobs' });
    reply.push({ type: 'tool_end', name: 'search_jobs', summary: 'Bing: network down', isError: true });
    reply.push({ type: 'text', delta: '搜索未完成' });
    reply.push({ type: 'done', engine: 'pi-llm', messageId: 49 });
    reply.close();
    const retried = stream();
    retried.push({ type: 'session', sessionId: 7 });
    retried.push({ type: 'text', delta: '重试后成功' });
    retried.push({ type: 'done', engine: 'pi-llm', messageId: 50 });
    retried.close();
    fetchMock.mockResolvedValueOnce(reply.response).mockResolvedValueOnce(retried.response);
    await mount();

    await act(async () => { await scenario().props.onClick(); });

    expect(text('调用失败')).toHaveLength(1);
    expect(text('调用成功')).toHaveLength(0);
    expect(text('Bing: network down')).toHaveLength(1);
    const retry = renderer.root.findAllByType('button').find((node) => node.children.includes('重试'))!;
    await act(async () => { await retry.props.onClick(); });
    expect(JSON.parse(fetchMock.mock.calls[1][1]?.body as string).regenerateFrom).toBe(49);
    expect(replies()).toEqual(['重试后成功']);
  });

  it('搜索失败后可重试，复用原回复且不会重复累积用户消息', async () => {
    const message = '基于我档案里的真实经历,指出我简历最薄弱的三点,并给出具体的修改建议和可以补充的量化点;需要我补充信息时直接问我。';
    const failed = stream();
    failed.push({ type: 'session', sessionId: 7 });
    failed.push({ type: 'error', delta: 'Bing: network down' });
    failed.push({ type: 'done', messageId: 50 });
    failed.close();
    const retried = stream();
    retried.push({ type: 'session', sessionId: 7 });
    retried.push({ type: 'text', delta: '重试成功' });
    retried.push({ type: 'done', messageId: 51 });
    retried.close();
    fetchMock.mockResolvedValueOnce(failed.response).mockResolvedValueOnce(retried.response);
    vi.mocked(api).mockImplementation(async (path) => {
      if (path === '/api/profile') return { targetRole: 'Java', grade: 'freshman', weeklyHours: 8 };
      if (path === '/api/agent/sessions') return [];
      if (path === '/api/agent/session/7') {
        return [
          { id: 48, sessionId: 7, role: 'user', content: message, engine: null, toolCalls: [], createdAt: new Date().toISOString() },
          { id: 50, sessionId: 7, role: 'assistant', content: '搜索失败', engine: 'pi-llm', errorCode: 'SEARCH_FAILED', toolCalls: [], createdAt: new Date().toISOString() },
        ];
      }
      return null;
    });
    await mount();

    await act(async () => { await scenario().props.onClick(); });
    expect(text('Bing: network down').length).toBeGreaterThan(0);
    const retry = renderer.root.findAllByType('button').find((node) => node.children.includes('重试'))!;
    expect(retry).toBeDefined();

    await act(async () => { await retry.props.onClick(); });

    const firstBody = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    const retryBody = JSON.parse(fetchMock.mock.calls[1][1]?.body as string);
    expect(retryBody).toMatchObject({ message: firstBody.message, sessionId: 7, regenerateFrom: 50 });
    expect(replies()).toEqual(['重试成功']);
    const userMessages = renderer.root.findAllByType('div').filter((node) => node.props.className === 'mb-6 flex flex-col items-end');
    expect(userMessages).toHaveLength(1);
  });

  it('停止生成时流读取器抛出的普通 AbortError 也按停止处理，并对齐服务端落库内容', async () => {
    const reply = stream();
    // 不在 abort 时让流报错：模拟共享读取器自身因取消信号抛出的普通 Error（name=AbortError）
    fetchMock.mockResolvedValue(reply.response);
    vi.mocked(api).mockImplementation(async (path) => {
      if (path === '/api/profile') return { targetRole: 'Java', grade: 'freshman', weeklyHours: 8 };
      if (path === '/api/agent/sessions') return [];
      if (path === '/api/agent/session/7') {
        return [
          { id: 48, sessionId: 7, role: 'user', content: '问题', engine: null, toolCalls: [], createdAt: new Date().toISOString() },
          { id: 60, sessionId: 7, role: 'assistant', content: '服务端保留的部分回答', engine: 'pi-llm', errorCode: 'STOPPED', toolCalls: [], createdAt: new Date().toISOString() },
        ];
      }
      return null;
    });
    await mount();
    await act(async () => { void scenario().props.onClick(); });
    await act(async () => {
      reply.push({ type: 'session', sessionId: 7 });
      reply.push({ type: 'text', delta: '未完成的回答' });
    });

    await act(async () => { renderer.root.findByProps({ title: '停止生成' }).props.onClick(); });

    expect(text('操作已取消')).toHaveLength(0);
    expect(text('发送失败')).toHaveLength(0);
    expect(replies()).toEqual(['未完成的回答']);
    expect(renderer.root.findAllByProps({ title: '停止生成' })).toHaveLength(0);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 450)); });
    expect(replies()).toEqual(['服务端保留的部分回答']);
  });

  it('服务端拒绝请求时显示具体原因，而不是裸状态码', async () => {
    fetchMock.mockResolvedValue(new Response(
      JSON.stringify({ error: { code: 'CONFLICT', message: '此对话正在生成回复，请等待完成或停止后重试' } }),
      { status: 409, headers: { 'Content-Type': 'application/json' } },
    ));
    await mount();

    await act(async () => { await scenario().props.onClick(); });

    expect(text('此对话正在生成回复，请等待完成或停止后重试').length).toBeGreaterThan(0);
    expect(renderer.root.findAll((node) => typeof node.children[0] === 'string' && node.children[0].startsWith('请求失败'))).toHaveLength(0);
    expect(renderer.root.findAllByProps({ title: '停止生成' })).toHaveLength(0);
  });

  it('会话已在其他设备删除（404）时自动回到新对话，下一次发送不再带旧会话 ID', async () => {
    const now = new Date().toISOString();
    vi.mocked(api).mockImplementation(async (path) => {
      if (path === '/api/profile') return { targetRole: 'Java', grade: 'freshman', weeklyHours: 8 };
      if (path === '/api/agent/sessions') return [{ id: 7, title: '旧对话', messageCount: 2, updatedAt: now, autoWrite: true }];
      if (path === '/api/agent/session') {
        return { sessionId: 7, autoWrite: true, messages: [
          { id: 1, sessionId: 7, role: 'user', content: '旧问题', engine: null, toolCalls: [], createdAt: now },
          { id: 2, sessionId: 7, role: 'assistant', content: '旧回答', engine: 'pi-llm', toolCalls: [], createdAt: now },
        ] };
      }
      return null;
    });
    const fresh = stream();
    fresh.push({ type: 'session', sessionId: 8 });
    fresh.push({ type: 'text', delta: '新会话的回答' });
    fresh.push({ type: 'done', messageId: 70 });
    fresh.close();
    fetchMock
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ error: { code: 'NOT_FOUND', message: '对话已删除或无法访问，请开启新对话' } }),
        { status: 404, headers: { 'Content-Type': 'application/json' } },
      ))
      .mockResolvedValueOnce(fresh.response);
    await mount();
    expect(replies()).toEqual(['旧回答']);
    expect(renderer.root.findAllByProps({ 'aria-pressed': true })).toHaveLength(1);

    await act(async () => { await scenario().props.onClick(); });

    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string).sessionId).toBe(7);
    expect(text('对话已删除或无法访问，请开启新对话').length).toBeGreaterThan(0);
    expect(replies()).toEqual([]);
    expect(renderer.root.findAllByProps({ 'aria-pressed': true })).toHaveLength(0);

    await act(async () => { await scenario().props.onClick(); });
    expect(JSON.parse(fetchMock.mock.calls[1][1]?.body as string).sessionId).toBeUndefined();
    expect(replies()).toEqual(['新会话的回答']);
  });
});
