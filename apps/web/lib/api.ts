'use client';
// 统一 API 客户端：JWT 注入、401 跳登录、统一错误格式（PRD §9）
export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'https://pathpilot.070320.xyz';

export class ApiError extends Error {
  constructor(public code: string, message: string, public status: number) {
    super(message);
  }
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('pp_token');
}

export function setToken(token: string) {
  localStorage.setItem('pp_token', token);
}

export function clearToken() {
  localStorage.removeItem('pp_token');
  localStorage.removeItem('pp_nickname');
}

export async function api<T = unknown>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });
  if (res.status === 401 && typeof window !== 'undefined' && !location.pathname.startsWith('/login')) {
    clearToken();
    location.href = '/login';
    throw new ApiError('UNAUTHORIZED', '请重新登录', 401);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string } }).error;
    throw new ApiError(err?.code ?? 'INTERNAL_ERROR', err?.message ?? `请求失败(${res.status})`, res.status);
  }
  return data as T;
}

/** 轮询异步 agent run 直到完成（岗位分析/规划生成）；signal 用于页面卸载时取消轮询 */
export async function pollRun<T>(runId: number, onTick?: (status: string, progress?: number, progressMessage?: string) => void, timeoutMs = 120000, signal?: AbortSignal): Promise<T> {
  const start = Date.now();
  for (;;) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (Date.now() - start > timeoutMs) throw new ApiError('TIMEOUT', '任务执行超时', 504);
    const data = await api<{ run: { status: string; errorCode: string | null; errorDetail: string | null; progress?: number; progressMessage?: string } } & T>(`/api/agent/runs/${runId}`);
    onTick?.(data.run.status, data.run.progress, data.run.progressMessage ?? undefined);
    if (data.run.status === 'succeeded') return data;
    if (data.run.status === 'failed') throw new ApiError(data.run.errorCode ?? 'INTERNAL_ERROR', data.run.errorDetail ?? '任务失败', 500);
    if (data.run.status === 'canceled') throw new ApiError('CANCELED', '任务已取消', 409);
    await new Promise((r) => setTimeout(r, 1200));
  }
}
