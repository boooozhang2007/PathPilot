// SSE 集成测试（真实 HTTP + faux 模型）：事件持续流出 / 重新生成截断 / 客户端中断后部分回复落库
// 回归点：不能监听 req.raw 的 close（请求体读完即触发，会误判客户端断开并吞掉整条流）
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

vi.mock('../../src/agent/settings.js', async (importOriginal) => {
  const mod = await importOriginal<Record<string, unknown>>();
  const { settingsMock } = await import('../fixtures/llmFixtures.js');
  return { ...mod, ...settingsMock };
});

vi.mock('../../src/agent/pi/provider.js', async () => {
  const pi = await import('@earendil-works/pi-ai');
  const faux = pi.fauxProvider({ models: [{ id: 'faux-stream' }], tokensPerSecond: 80 });
  const models = pi.createModels();
  models.setProvider(faux.provider);
  const queue: string[] = [];
  let counter = 0;
  return {
    resolveModel: async () => {
      const text = queue.shift() ?? `流式回答${++counter}`;
      faux.setResponses([pi.fauxAssistantMessage(text)]);
      return { models, model: faux.getModel() };
    },
    __setNextText: (text: string) => queue.push(text),
  };
});

import { buildApp } from '../../src/app.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;
let baseUrl = '';
let token = '';

type StreamEvent = { type: string; delta?: string; sessionId?: number; messageId?: number; fallbackReason?: string };

async function readEvents(res: Response): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split('\n\n');
    buf = parts.pop() ?? '';
    for (const part of parts) {
      const line = part.split('\n').find((l) => l.startsWith('data: '));
      if (!line) continue;
      events.push(JSON.parse(line.slice(6)) as StreamEvent);
    }
  }
  return events;
}

async function postStream(payload: unknown, signal?: AbortSignal): Promise<Response> {
  return fetch(`${baseUrl}/api/agent/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
    signal,
  });
}

async function sessionMessages(sessionId: number): Promise<{ id: number; role: string; content: string; errorCode?: string | null }[]> {
  const res = await fetch(`${baseUrl}/api/agent/session/${sessionId}`, { headers: { Authorization: `Bearer ${token}` } });
  expect(res.status).toBe(200);
  return (await res.json()) as { id: number; role: string; content: string; errorCode?: string | null }[];
}

beforeAll(async () => {
  app = await buildApp();
  await app.listen({ port: 0, host: '127.0.0.1' });
  const addr = app.server.address();
  baseUrl = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
  const reg = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email: `stream${Date.now()}@t.cn`, password: 'password123', nickname: '流式测试' },
  });
  expect(reg.statusCode).toBe(200);
  token = reg.json().token;
});

afterAll(async () => {
  await app.close();
});

describe('SSE 流式对话', () => {
  it('事件正常流出：session → text → done，并完整落库', async () => {
    const res = await postStream({ message: '你好' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const events = await readEvents(res);
    expect(events[0]?.type).toBe('session');
    const text = events.filter((e) => e.type === 'text').map((e) => e.delta ?? '').join('');
    expect(text).toContain('流式回答');
    const done = events.find((e) => e.type === 'done')!;
    expect(done).toBeTruthy();
    expect(done.messageId).toBeGreaterThan(0); // 前端据此对齐真实消息 id 以支持重新生成
    const sid = events.find((e) => e.type === 'session')!.sessionId!;
    const msgs = await sessionMessages(sid);
    expect(msgs.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(msgs[1].id).toBe(done.messageId);
    expect(msgs[1].content).toContain('流式回答');
  });

  it('重新生成：服务端截断旧回复，不重复累积用户消息', async () => {
    const first = await readEvents(await postStream({ message: '第一问' }));
    const sid = first.find((e) => e.type === 'session')!.sessionId!;
    const before = await sessionMessages(sid);
    expect(before).toHaveLength(2);
    const assistantId = before[1].id;

    const regenerated = await readEvents(await postStream({ sessionId: sid, message: '第一问', regenerateFrom: assistantId }));
    expect(regenerated.some((e) => e.type === 'done')).toBe(true);
    const after = await sessionMessages(sid);
    expect(after).toHaveLength(2);
    expect(after[0].content).toBe('第一问');
    expect(after[1].id).not.toBe(assistantId);
  });

  it('客户端中断：服务端中止生成，仍保留部分回复（或停止占位）', async () => {
    const provider = (await import('../../src/agent/pi/provider.js')) as unknown as { __setNextText: (t: string) => void };
    provider.__setNextText('这是一段用于中断测试的长回答。'.repeat(40));
    const controller = new AbortController();
    const res = await postStream({ message: '开始生成' }, controller.signal);
    expect(res.status).toBe(200);
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let sid = 0;
    let sawText = false;
    try {
      while (!sawText) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop() ?? '';
        for (const part of parts) {
          const line = part.split('\n').find((l) => l.startsWith('data: '));
          if (!line) continue;
          const ev = JSON.parse(line.slice(6)) as StreamEvent;
          if (ev.type === 'session') sid = ev.sessionId ?? 0;
          if (ev.type === 'text') sawText = true;
        }
      }
    } finally {
      controller.abort();
    }
    expect(sid).toBeGreaterThan(0);
    expect(sawText).toBe(true);
    // 等待服务端 abort → 落库
    let msgs: Awaited<ReturnType<typeof sessionMessages>> = [];
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 150));
      msgs = await sessionMessages(sid);
      if (msgs.some((m) => m.role === 'assistant')) break;
    }
    expect(msgs.map((m) => m.role)).toEqual(['user', 'assistant']);
  });
});
