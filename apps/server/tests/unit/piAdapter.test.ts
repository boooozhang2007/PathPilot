import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type IncomingHttpHeaders, type ServerResponse } from 'node:http';
import { z } from 'zod';
import { config } from '../../src/config.js';
import { getLlmSettings, saveLlmSettings, type LlmSettings } from '../../src/agent/settings.js';
import { invalidateModels, resolveModel } from '../../src/agent/pi/provider.js';
import { runAgentWith, runStructuredAgent } from '../../src/agent/pi/runtime.js';

interface RequestRecord {
  path: string;
  headers: IncomingHttpHeaders;
  body: Record<string, unknown>;
}

const requests: RequestRecord[] = [];
let respond: (res: ServerResponse, request: RequestRecord) => void;
let baseUrl: string;
let previous: LlmSettings;

function stream(res: ServerResponse, delta: Record<string, unknown>, finishReason = 'stop') {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'close' });
  const chunk = (change: Record<string, unknown>, finish: string | null) => ({
    id: 'chatcmpl-local-test',
    object: 'chat.completion.chunk',
    created: 1,
    model: 'adapter-test',
    choices: [{ index: 0, delta: change, finish_reason: finish }],
  });
  res.write(`data: ${JSON.stringify(chunk({ role: 'assistant', ...delta }, null))}\n\n`);
  res.write(`data: ${JSON.stringify(chunk({}, finishReason))}\n\n`);
  res.end('data: [DONE]\n\n');
}

function submit(res: ServerResponse, data: unknown) {
  stream(res, {
    tool_calls: [{ index: 0, id: 'call-submit', type: 'function', function: { name: 'submit_result', arguments: JSON.stringify({ data }) } }],
  }, 'tool_calls');
}

const server = createServer(async (req, res) => {
  // 请求头到达即记录；取消可能抢在请求体读完之前，不能让超时断言受记录时机影响。
  const request: RequestRecord = { path: req.url ?? '', headers: req.headers, body: {} };
  requests.push(request);
  let body = '';
  try {
    for await (const part of req) body += part;
  } catch (error) {
    // Cancellation may close the socket while Node is still reading the body.
    if (req.destroyed) return;
    throw error;
  }
  request.body = JSON.parse(body) as Record<string, unknown>;
  respond(res, request);
});

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Local test server did not start');
  baseUrl = `http://127.0.0.1:${address.port}/compatible/v1`;
});

beforeEach(async () => {
  previous = await getLlmSettings();
  requests.length = 0;
  respond = (res) => stream(res, { content: '已读取本地模型配置。' });
  await saveLlmSettings({ provider: 'custom', baseUrl: `${baseUrl}/`, apiKey: 'local-adapter-test-key', model: 'adapter-test' });
});

afterEach(async () => {
  server.closeAllConnections();
  await saveLlmSettings(previous);
  invalidateModels();
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

describe('Pi adapter with a local OpenAI-compatible server', () => {
  it('uses saved base URL, API key and model and parses streamed Chinese text', async () => {
    const { models, model } = await resolveModel();
    const out = await runAgentWith(models, model, { systemPrompt: 'Local test', prompt: '你好' });
    expect(out).toMatchObject({ text: '已读取本地模型配置。', aborted: false });
    expect(requests).toHaveLength(1);
    expect(requests[0].path).toBe('/compatible/v1/chat/completions');
    expect(requests[0].headers.authorization).toBe('Bearer local-adapter-test-key');
    expect(requests[0].body).toMatchObject({ model: 'adapter-test', stream: true });
    expect(requests[0].body.messages).toEqual(expect.arrayContaining([
      { role: 'user', content: [{ type: 'text', text: '你好' }] },
    ]));
  });

  it('refreshes cached model and authentication when admin settings change', async () => {
    await resolveModel();
    await saveLlmSettings({ apiKey: 'replacement-local-key', model: 'replacement-model' });
    const { models, model } = await resolveModel();
    await runAgentWith(models, model, { systemPrompt: 'test', prompt: 'hello' });
    expect(requests[0].headers.authorization).toBe('Bearer replacement-local-key');
    expect(requests[0].body.model).toBe('replacement-model');
  });

  it('accepts schema-valid submit_result output and advertises its input schema', async () => {
    respond = (res) => submit(res, { answer: '合法结果', count: 2 });
    const result = await runStructuredAgent({
      systemPrompt: 'Return a structured result',
      prompt: 'Submit the result',
      schema: z.object({ answer: z.string().min(1), count: z.number().int().positive() }),
    });
    expect(result.data).toEqual({ answer: '合法结果', count: 2 });
    expect(result.toolCalls).toEqual(['submit_result']);
    expect(requests[0].body.tools).toEqual(expect.arrayContaining([
      expect.objectContaining({ function: expect.objectContaining({ name: 'submit_result', parameters: expect.objectContaining({ type: 'object' }) }) }),
    ]));
  });

  it('rejects invalid submitted data after a bounded number of attempts', async () => {
    respond = (res) => submit(res, { answer: '', count: -1 });
    const error = await runStructuredAgent({
      systemPrompt: 'test',
      prompt: 'Submit a valid result',
      schema: z.object({ answer: z.string().min(1), count: z.number().int().positive() }),
      maxToolCalls: 1,
      wallClockMs: 5000,
    }).then(() => null, (error: unknown) => error);
    expect(requests.length).toBeLessThanOrEqual((config.agentLimits.maxRetries + 1) * 2);
    expect(error).toMatchObject({ code: 'AGENT_OUTPUT_INVALID' });
  });

  it('stops a hanging model request at its wall-clock limit', async () => {
    respond = (res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', Connection: 'close' });
      res.flushHeaders();
    };
    const { models, model } = await resolveModel();
    const started = Date.now();
    const out = await runAgentWith(models, model, { systemPrompt: 'test', prompt: 'wait', wallClockMs: 200 });
    expect(out.aborted).toBe(true);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(requests).toHaveLength(1);
  });

  it('propagates caller cancellation during a hanging request', async () => {
    const controller = new AbortController();
    respond = (res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', Connection: 'close' });
      res.flushHeaders();
      controller.abort();
    };
    const { models, model } = await resolveModel();
    const out = await runAgentWith(models, model, { systemPrompt: 'test', prompt: 'wait', wallClockMs: 5000, signal: controller.signal });
    expect(out.aborted).toBe(true);
    expect(requests).toHaveLength(1);
  });

  it('never sends a request for a pre-canceled structured run', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(runStructuredAgent({ systemPrompt: 'test', prompt: 'wait', schema: z.object({ answer: z.string() }), signal: controller.signal })).rejects.toThrow();
    expect(requests).toHaveLength(0);
  });
});
