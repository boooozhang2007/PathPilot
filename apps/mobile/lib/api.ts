import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetch } from 'expo/fetch';
import { abortableDelay, abortError } from '@pathpilot/shared';

export const DEFAULT_BASE = 'https://pathpilot.070320.xyz';
const KEY_TOKEN = 'pp_token';
const KEY_BASE = 'pp_api_base';
const KEY_NICKNAME = 'pp_nickname';
const KEY_GUEST = 'pp_guest';

export class ApiError extends Error {
  constructor(public code: string, message: string) { super(message); this.name = 'ApiError'; }
}

let cachedBase: string | null = null;

export async function getApiBase(): Promise<string> {
  if (cachedBase) return cachedBase;
  cachedBase = (await AsyncStorage.getItem(KEY_BASE)) || DEFAULT_BASE;
  return cachedBase;
}

export async function setApiBase(url: string): Promise<void> {
  let parsed: URL;
  try { parsed = new URL(url.trim()); } catch { throw new ApiError('VALIDATION_ERROR', '请输入完整的 http 或 https 服务器地址'); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new ApiError('VALIDATION_ERROR', '服务器地址需使用 http 或 https，且不含账号、查询参数或片段');
  }
  const clean = parsed.toString().replace(/\/+$/, '');
  if (clean !== await getApiBase()) await clearAuth();
  await AsyncStorage.setItem(KEY_BASE, clean);
  cachedBase = clean;
}

export async function getToken(): Promise<string | null> { return AsyncStorage.getItem(KEY_TOKEN); }
export async function setToken(token: string, nickname: string): Promise<void> {
  await AsyncStorage.multiSet([[KEY_TOKEN, token], [KEY_NICKNAME, nickname]]);
  await AsyncStorage.removeItem(KEY_GUEST);
}
export async function getNickname(): Promise<string> { return (await AsyncStorage.getItem(KEY_NICKNAME)) ?? '同学'; }
export async function setGuest(on: boolean): Promise<void> {
  if (on) await AsyncStorage.setItem(KEY_GUEST, '1');
  else await AsyncStorage.removeItem(KEY_GUEST);
}
export async function isGuest(): Promise<boolean> { return (await AsyncStorage.getItem(KEY_GUEST)) === '1'; }
export async function clearAuth(): Promise<void> { await AsyncStorage.multiRemove([KEY_TOKEN, KEY_NICKNAME, KEY_GUEST]); }

export async function api<T = unknown>(
  path: string, init?: { method?: string; json?: unknown; timeoutMs?: number; signal?: AbortSignal }
): Promise<T> {
  const [base, token] = await Promise.all([getApiBase(), getToken()]);
  const controller = new AbortController();
  const abort = () => controller.abort();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, init?.timeoutMs ?? 30_000);
  init?.signal?.addEventListener('abort', abort, { once: true });
  if (init?.signal?.aborted) controller.abort();
  try {
    const res = await fetch(base + path, {
      method: init?.method ?? 'GET',
      headers: { Accept: 'application/json', ...(init?.json !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: init?.json !== undefined ? JSON.stringify(init.json) : undefined,
      signal: controller.signal,
    });
    if (res.status === 204 && res.ok) return undefined as T;
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const error = data?.error as { code?: string; message?: string } | undefined;
      if (res.status === 401 && !path.startsWith('/api/auth/')) {
        if (token && token === await getToken()) await clearAuth();
        throw new ApiError('UNAUTHORIZED', token ? '登录已过期，请到「我的」页重新登录' : '请到「我的」页登录后使用此功能');
      }
      throw new ApiError(error?.code ?? 'HTTP_ERROR', error?.message ?? '请求失败（' + res.status + '）');
    }
    if (data === null) throw new ApiError('INVALID_RESPONSE', '服务端响应格式异常，请重试');
    return data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (init?.signal?.aborted) throw abortError();
    if (timedOut) throw new ApiError('TIMEOUT', '请求超时，请稍后重试');
    throw new ApiError('NETWORK_ERROR', '连接服务失败，请检查网络与服务器地址');
  } finally {
    clearTimeout(timer);
    init?.signal?.removeEventListener('abort', abort);
  }
}

export async function pollRun(
  runId: number, onTick?: (status: string, progress?: number, progressMessage?: string) => void,
  timeoutMs = 300_000, signal?: AbortSignal
): Promise<{ run: { status: string; errorCode: string | null; errorDetail: string | null; progress?: number; progressMessage?: string } }> {
  const deadline = Date.now() + timeoutMs;
  let networkFailures = 0;
  for (;;) {
    if (signal?.aborted) throw abortError();
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new ApiError('TIMEOUT', '等待超时，任务可能仍在后台执行，请刷新查看结果');
    let data: { run: { status: string; errorCode: string | null; errorDetail: string | null; progress?: number; progressMessage?: string } };
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
    if (data.run.status === 'failed') throw new ApiError(data.run.errorCode ?? 'RUN_FAILED', data.run.errorDetail ?? '任务执行失败，请重试');
    if (data.run.status === 'canceled') throw new ApiError('CANCELED', '任务已取消');
    await abortableDelay(Math.min(1500, Math.max(1, deadline - Date.now())), signal);
  }
}
