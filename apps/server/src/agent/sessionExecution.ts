import { conflict } from '../services/errors.js';

type Execution = { userId: number; controller: AbortController; settled: Promise<void>; release: () => void };
type Counts = Map<number, number>;

const activeSessions = new Map<number, Execution>();
const activeRequestsByUser: Counts = new Map();
const activeRequestsBySession: Counts = new Map();
const deletingSessions = new Map<number, number>();
const deletingUsers = new Set<number>();
const waiters = new Set<() => void>();

function increment(counts: Counts, id: number) {
  counts.set(id, (counts.get(id) ?? 0) + 1);
}

function decrement(counts: Counts, id: number) {
  const next = (counts.get(id) ?? 1) - 1;
  if (next > 0) counts.set(id, next);
  else counts.delete(id);
}

function notifyWaiters() {
  for (const check of waiters) check();
}

function waitUntil(predicate: () => boolean): Promise<void> {
  if (predicate()) return Promise.resolve();
  return new Promise((resolve) => {
    const check = () => {
      if (!predicate()) return;
      waiters.delete(check);
      resolve();
    };
    waiters.add(check);
  });
}

/** 记录已进入的聊天请求，避免删除时漏掉尚未取得执行锁的请求。 */
export function beginSessionRequest(userId: number, sessionId?: number) {
  if (deletingUsers.has(userId) || (sessionId !== undefined && deletingSessions.has(sessionId))) {
    throw conflict('对话正在删除，请稍后重试');
  }

  increment(activeRequestsByUser, userId);
  if (sessionId !== undefined) increment(activeRequestsBySession, sessionId);
  let released = false;
  return {
    release: () => {
      if (released) return;
      released = true;
      decrement(activeRequestsByUser, userId);
      if (sessionId !== undefined) decrement(activeRequestsBySession, sessionId);
      notifyWaiters();
    },
  };
}

/** 同一会话只允许一轮写入，避免多端发送、重新生成或删除时交错。 */
export function claimSessionExecution(sessionId: number, userId: number) {
  if (deletingUsers.has(userId) || deletingSessions.has(sessionId)) throw conflict('对话正在删除，请稍后重试');
  if (activeSessions.has(sessionId)) throw conflict('此对话正在生成回复，请等待完成或停止后重试');
  const controller = new AbortController();
  let settle!: () => void;
  const settled = new Promise<void>((resolve) => { settle = resolve; });
  const execution: Execution = { userId, controller, settled, release: () => {
    if (activeSessions.get(sessionId) === execution) activeSessions.delete(sessionId);
    settle();
    notifyWaiters();
  } };
  activeSessions.set(sessionId, execution);
  return { signal: controller.signal, abort: () => controller.abort(), release: execution.release };
}

export async function stopSessionExecution(sessionId: number): Promise<void> {
  const execution = activeSessions.get(sessionId);
  if (!execution) return;
  execution.controller.abort();
  await execution.settled;
}

/** 封锁单个会话，停止已运行的回复并等待已准入请求退出后再删除。 */
export async function withSessionDeletion<T>(userId: number, sessionId: number, remove: () => Promise<T>): Promise<T> {
  if (deletingUsers.has(userId)) throw conflict('正在清空对话，请稍后重试');
  const existingOwner = deletingSessions.get(sessionId);
  if (existingOwner !== undefined) throw conflict('对话正在删除，请稍后重试');
  deletingSessions.set(sessionId, userId);
  try {
    const execution = activeSessions.get(sessionId);
    execution?.controller.abort();
    await waitUntil(() => (activeRequestsBySession.get(sessionId) ?? 0) === 0);
    await stopSessionExecution(sessionId);
    return await remove();
  } finally {
    deletingSessions.delete(sessionId);
    notifyWaiters();
  }
}

/** 封锁用户的新 Agent 请求，停止现有回复后再清空其全部会话。 */
export async function withUserSessionCleanup<T>(userId: number, remove: () => Promise<T>): Promise<T> {
  if (deletingUsers.has(userId)) throw conflict('正在清空对话，请稍后重试');
  deletingUsers.add(userId);
  try {
    for (const execution of activeSessions.values()) {
      if (execution.userId === userId) execution.controller.abort();
    }
    await waitUntil(() => (activeRequestsByUser.get(userId) ?? 0) === 0);
    const deletions = Array.from(deletingSessions, ([sessionId, ownerId]) => ownerId === userId ? sessionId : null)
      .filter((sessionId): sessionId is number => sessionId !== null);
    await waitUntil(() => deletions.every((sessionId) => !deletingSessions.has(sessionId)));
    return await remove();
  } finally {
    deletingUsers.delete(userId);
    notifyWaiters();
  }
}
