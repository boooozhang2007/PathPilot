// 会话级执行互斥：多端同时发送、重新生成、删除会话时同一会话只允许一轮写入
import { describe, expect, it } from 'vitest';
import {
  beginSessionRequest,
  claimSessionExecution,
  stopSessionExecution,
  withSessionDeletion,
  withUserSessionCleanup,
} from '../../src/agent/sessionExecution.js';

describe('会话执行互斥', () => {
  it('同一会话同时只允许一轮生成，释放后可再次认领，不影响其他会话', () => {
    const first = claimSessionExecution(9001, 90);
    expect(() => claimSessionExecution(9001, 90)).toThrowError(/正在生成回复/);
    const other = claimSessionExecution(9002, 90);
    expect(other.signal.aborted).toBe(false);
    other.release();
    first.release();
    const again = claimSessionExecution(9001, 90);
    expect(again.signal.aborted).toBe(false);
    again.release();
  });

  it('停止会中止当前执行并等待其真正释放；没有执行中的会话直接返回', async () => {
    const execution = claimSessionExecution(9003, 90);
    let released = false;
    const stopping = stopSessionExecution(9003).then(() => { released = true; });
    expect(execution.signal.aborted).toBe(true);
    await Promise.resolve();
    expect(released).toBe(false);
    execution.release();
    await stopping;
    expect(released).toBe(true);
    await expect(stopSessionExecution(9999)).resolves.toBeUndefined();
  });

  it('迟到的 release 不会误删后续的新认领', () => {
    const stale = claimSessionExecution(9004, 90);
    stale.release();
    const fresh = claimSessionExecution(9004, 90);
    stale.release();
    expect(() => claimSessionExecution(9004, 90)).toThrowError(/正在生成回复/);
    fresh.release();
  });

  it('删除会话时封锁新请求，并等待已进入但尚未取得执行锁的请求', async () => {
    const request = beginSessionRequest(91, 9101);
    let removed = false;
    const deletion = withSessionDeletion(91, 9101, async () => { removed = true; });

    expect(() => beginSessionRequest(91, 9101)).toThrowError(/正在删除/);
    expect(() => claimSessionExecution(9101, 91)).toThrowError(/正在删除/);
    expect(removed).toBe(false);

    request.release();
    await deletion;
    expect(removed).toBe(true);
    claimSessionExecution(9101, 91).release();
  });

  it('清空会话时阻止新会话，并等待先前已准入的请求退出', async () => {
    const request = beginSessionRequest(92);
    let removed = false;
    const cleanup = withUserSessionCleanup(92, async () => { removed = true; });

    expect(() => beginSessionRequest(92)).toThrowError(/正在删除/);
    expect(() => claimSessionExecution(9201, 92)).toThrowError(/正在删除/);
    expect(removed).toBe(false);

    request.release();
    await cleanup;
    expect(removed).toBe(true);
    claimSessionExecution(9201, 92).release();
  });

  it('清空会话会中止运行中的回复并等待请求完成', async () => {
    const request = beginSessionRequest(93, 9301);
    const execution = claimSessionExecution(9301, 93);
    let removed = false;
    const cleanup = withUserSessionCleanup(93, async () => { removed = true; });

    expect(execution.signal.aborted).toBe(true);
    expect(removed).toBe(false);
    execution.release();
    request.release();
    await cleanup;
    expect(removed).toBe(true);
  });
});
