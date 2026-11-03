'use client';
import { abortableDelay, abortError } from '@pathpilot/shared';

export const API_BASE = (process.env.NEXT_PUBLIC_API_URL
  ?? (process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : 'https://pathpilot.070320.xyz')).replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(public code: string, message: string, public status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  try { return localStorage.getItem('pp_token'); } catch { return null; }
}

export function setToken(token: string) { localStorage.setItem('pp_token', token); }

export function clearToken() {
  for (const key of ['pp_token', 'pp_nickname', 'pp_resume_draft']) {
    try { localStorage.removeItem(key); } catch { /* 浏览器禁用存储时仍能退出。 */ }
  }
}

export async function api<T = unknown>(path: string, init?: RequestInit & { json?: unknown; timeoutMs?: number }): Promise<T> {
  const { json, timeoutMs = 30_000, ...request } = init ?? {};
  const headers = new Headers(request.headers);
  headers.set('Accept', 'application/json');
  if (json !== undefined) headers.set('Content-Type', 'application/json');
  const token = getToken();
  if (token && !headers.has('Authorization')) headers.set('Authorization', 'Bearer ' + token);
  const controller = new AbortController();
  const abort = () => controller.abort();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  request.signal?.addEventListener('abort', abort, { once: true });
  if (request.signal?.aborted) controller.abort();
  try {
    const res = await fetch(API_BASE + path, {
      ...request, headers, body: json !== undefined ? JSON.stringify(json) : request.body, signal: controller.signal,
    });
    if (res.status === 401 && token === getToken()) {
      clearToken();
      if (typeof location !== 'undefined' && !location.pathname.startsWith('/login')) location.assign('/login');
    }
    if (res.status === 204 && res.ok) return undefined as T;
    const text = await res.text().catch(() => '');
    let data: unknown;
    let parsed = false;
    if (text) {
      try { data = JSON.parse(text); parsed = true; } catch { parsed = false; }
    }
    if (!res.ok) {
      const error = (data as { error?: { code?: string; message?: string } } | undefined)?.error;
      throw new ApiError(error?.code ?? (res.status === 401 ? 'UNAUTHORIZED' : 'HTTP_ERROR'),
        error?.message ?? '请求失败（' + res.status + '）', res.status);
    }
    // 服务端用 JSON `null` 表达“暂无数据”（无规划/无档案等），这是合法业务状态，不能当解析失败。
    if (!parsed) throw new ApiError('INVALID_RESPONSE', '服务端响应格式异常，请重试', 502);
    return data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (request.signal?.aborted) throw abortError();
    if (timedOut) throw new ApiError('TIMEOUT', '请求超时，请稍后重试', 504);
    throw new ApiError('NETWORK_ERROR', '连接服务失败，请检查网络后重试', 0);
  } finally {
    clearTimeout(timer);
    request.signal?.removeEventListener('abort', abort);
  }
}

/** 页面离开只停止观察；后端任务仍可完成，超时后可以刷新查看。 */
export async function pollRun<T>(
  runId: number, onTick?: (status: string, progress?: number, progressMessage?: string) => void,
  timeoutMs = 300_000, signal?: AbortSignal
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let networkFailures = 0;
  for (;;) {
    if (signal?.aborted) throw abortError();
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new ApiError('TIMEOUT', '等待超时，任务可能仍在后台执行，请刷新查看结果', 504);
    let data: { run: { status: string; errorCode: string | null; errorDetail: string | null; progress?: number; progressMessage?: string } } & T;
    try {
      data = await api('/api/agent/runs/' + runId, { signal, timeoutMs: Math.min(30_000, remaining) });
      networkFailures = 0;
    } catch (error) {
      if (error instanceof ApiError && (error.code === 'NETWORK_ERROR' || error.code === 'TIMEOUT') && ++networkFailures <= 3) {
        await abortableDelay(Math.min(1200 * networkFailures, Math.max(1, deadline - Date.now())), signal);
        continue;
      }
      throw error;
    }
    onTick?.(data.run.status, data.run.progress, data.run.progressMessage ?? undefined);
    if (data.run.status === 'succeeded') return data;
    if (data.run.status === 'failed') throw new ApiError(data.run.errorCode ?? 'RUN_FAILED', data.run.errorDetail ?? '任务执行失败，请重试', 500);
    if (data.run.status === 'canceled') throw new ApiError('CANCELED', '任务已取消', 409);
    await abortableDelay(Math.min(1200, Math.max(1, deadline - Date.now())), signal);
  }
}
