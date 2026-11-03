import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// 隔离外部依赖：shared 工具函数（网络/定时器无关）与全局 fetch。
vi.mock('@pathpilot/shared', () => ({
  abortableDelay: () => Promise.resolve(),
  abortError: () => new Error('aborted'),
}));

import { api, ApiError } from '../lib/api';

const fetchMock = vi.fn();
const respond = (status: number, body: string) => {
  fetchMock.mockResolvedValueOnce({ ok: status >= 200 && status < 300, status, text: async () => body });
};

describe('web api() 响应解析', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('HTTP 200 + JSON null 视为合法的“暂无数据”，返回 null（无规划/无档案等空态）', async () => {
    respond(200, 'null');
    await expect(api('/api/roadmaps/current')).resolves.toBeNull();
  });

  it('HTTP 204 返回 undefined', async () => {
    respond(204, '');
    await expect(api('/api/x', { method: 'DELETE' })).resolves.toBeUndefined();
  });

  it('HTTP 200 + 合法对象正常返回', async () => {
    respond(200, JSON.stringify({ id: 1, name: 'x' }));
    await expect(api('/api/x')).resolves.toEqual({ id: 1, name: 'x' });
  });

  it('HTTP 200 + 非 JSON 正文抛 INVALID_RESPONSE，服务端异常时不静默通过', async () => {
    respond(200, '<html>not json</html>');
    await expect(api('/api/x')).rejects.toMatchObject({ code: 'INVALID_RESPONSE', status: 502 });
  });

  it('非 2xx 携带服务端 error.code/message 时如实抛出', async () => {
    respond(400, JSON.stringify({ error: { code: 'VALIDATION_ERROR', message: '参数错误' } }));
    const err = await api('/api/x').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe('VALIDATION_ERROR');
    expect((err as ApiError).message).toBe('参数错误');
  });

  it('HTTP 401 无 token 时抛 UNAUTHORIZED，并保留服务端文案', async () => {
    respond(401, JSON.stringify({ error: { code: 'UNAUTHORIZED', message: '登录已过期' } }));
    await expect(api('/api/profile')).rejects.toMatchObject({ code: 'UNAUTHORIZED', message: '登录已过期' });
  });
});
