import { beforeEach, describe, expect, it, vi } from 'vitest';

// 隔离外部依赖：AsyncStorage / expo-fetch / shared 工具。
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
    multiSet: vi.fn(async () => undefined),
    multiRemove: vi.fn(async () => undefined),
  },
}));

const fetchMock = vi.fn();
vi.mock('expo/fetch', () => ({ fetch: (...args: unknown[]) => fetchMock(...args) }));

vi.mock('@pathpilot/shared', () => ({
  abortableDelay: () => Promise.resolve(),
  abortError: () => new Error('aborted'),
}));

import { api, ApiError } from './api.js';

function mockResponse(status: number, body: string) {
  fetchMock.mockResolvedValueOnce({ ok: status >= 200 && status < 300, status, text: async () => body });
}

describe('api() 响应解析', () => {
  beforeEach(() => fetchMock.mockReset());

  it('HTTP 200 + JSON null 视为合法的“暂无数据”，返回 null（路线地图/档案空态）', async () => {
    mockResponse(200, 'null');
    await expect(api('/api/roadmaps/current')).resolves.toBeNull();
  });

  it('HTTP 204 返回 undefined', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 204, text: async () => '' });
    await expect(api('/api/x')).resolves.toBeUndefined();
  });

  it('HTTP 200 + 合法对象正常返回', async () => {
    mockResponse(200, JSON.stringify({ id: 1, name: 'x' }));
    await expect(api('/api/x')).resolves.toEqual({ id: 1, name: 'x' });
  });

  it('HTTP 200 + 非 JSON 正文抛 INVALID_RESPONSE', async () => {
    mockResponse(200, '<html>not json</html>');
    await expect(api('/api/x')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('非 2xx 携带服务端 error.code/message 时如实抛出', async () => {
    mockResponse(400, JSON.stringify({ error: { code: 'VALIDATION_ERROR', message: '参数错误' } }));
    const err = await api('/api/x').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.message).toBe('参数错误');
  });
});
