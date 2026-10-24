// 统一 API 客户端（移动端）：服务器地址可配置（默认模拟器 10.0.2.2），token 存 AsyncStorage
import AsyncStorage from '@react-native-async-storage/async-storage';

export const DEFAULT_BASE = 'http://192.168.123.74:3000'; // 最终版硬编码服务器地址
const KEY_TOKEN = 'pp_token';
const KEY_BASE = 'pp_api_base';
const KEY_NICKNAME = 'pp_nickname';
const KEY_GUEST = 'pp_guest';

export class ApiError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

let cachedBase: string | null = null;

export async function getApiBase(): Promise<string> {
  if (cachedBase) return cachedBase;
  cachedBase = (await AsyncStorage.getItem(KEY_BASE)) || DEFAULT_BASE;
  return cachedBase;
}

export async function setApiBase(url: string): Promise<void> {
  const clean = url.trim().replace(/\/$/, '');
  cachedBase = clean;
  await AsyncStorage.setItem(KEY_BASE, clean);
}

export async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem(KEY_TOKEN);
}

export async function setToken(token: string, nickname: string): Promise<void> {
  await AsyncStorage.multiSet([[KEY_TOKEN, token], [KEY_NICKNAME, nickname]]);
  await AsyncStorage.removeItem(KEY_GUEST); // 正式登录清除访客标记
}

export async function getNickname(): Promise<string> {
  return (await AsyncStorage.getItem(KEY_NICKNAME)) ?? '同学';
}

/** 访客模式（跳过登录）：可浏览界面与配置服务器，业务操作需登录 */
export async function setGuest(on: boolean): Promise<void> {
  if (on) await AsyncStorage.setItem(KEY_GUEST, '1');
  else await AsyncStorage.removeItem(KEY_GUEST);
}

export async function isGuest(): Promise<boolean> {
  return (await AsyncStorage.getItem(KEY_GUEST)) === '1';
}

export async function clearAuth(): Promise<void> {
  // 退出登录：清除敏感本地缓存（PRD 5.3）
  await AsyncStorage.multiRemove([KEY_TOKEN, KEY_NICKNAME, KEY_GUEST]);
}

export async function api<T = unknown>(path: string, init?: { method?: string; json?: unknown; timeoutMs?: number }): Promise<T> {
  const base = await getApiBase();
  const token = await getToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init?.timeoutMs ?? 30000);
  try {
    const res = await fetch(`${base}${path}`, {
      method: init?.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: init?.json !== undefined ? JSON.stringify(init.json) : undefined,
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = (data as { error?: { code?: string; message?: string } }).error;
      if (res.status === 401) {
        throw new ApiError('UNAUTHORIZED', '此功能需要登录：请到「我的」页登录账号');
      }
      throw new ApiError(err?.code ?? 'HTTP_ERROR', err?.message ?? `请求失败(${res.status})`);
    }
    return data as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if (e instanceof Error && e.name === 'AbortError') throw new ApiError('NETWORK_ERROR', '请求超时（模型响应较慢，可稍后重试）');
    throw new ApiError('NETWORK_ERROR', '网络不可用：请检查服务器地址设置与后端是否运行（真机需填电脑局域网 IP）');
  } finally {
    clearTimeout(timer);
  }
}

/** 轮询异步 agent run（岗位分析/规划生成） */
export async function pollRun(runId: number, timeoutMs = 180000): Promise<{ run: { status: string; errorCode: string | null; errorDetail: string | null } }> {
  const start = Date.now();
  for (;;) {
    if (Date.now() - start > timeoutMs) throw new ApiError('TIMEOUT', '任务执行超时');
    const data = await api<{ run: { status: string; errorCode: string | null; errorDetail: string | null } }>(`/api/agent/runs/${runId}`);
    if (data.run.status === 'succeeded') return data;
    if (data.run.status === 'failed') throw new ApiError(data.run.errorCode ?? 'RUN_FAILED', data.run.errorDetail ?? '任务失败');
    await new Promise((r) => setTimeout(r, 1500));
  }
}
