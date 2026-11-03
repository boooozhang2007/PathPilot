import { describe, expect, it } from 'vitest';
import { createLimiter } from '../../src/agent/search/limit.js';

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

/** 让已排队的微任务全部跑完（闸门的交接发生在微任务里）。 */
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('createLimiter 并发闸门', () => {
  it('同时在途不超过上限，超出的排队等待，释放后立刻补位', async () => {
    const limiter = createLimiter(2);
    let running = 0;
    let maxRunning = 0;
    const gates = [deferred(), deferred(), deferred()];

    const tasks = gates.map((gate) =>
      limiter.run(async () => {
        running += 1;
        maxRunning = Math.max(maxRunning, running);
        await gate.promise;
        running -= 1;
      })
    );

    // 前两个同步进入临界区，第三个排队
    expect(limiter.active).toBe(2);
    expect(limiter.pending).toBe(1);
    expect(maxRunning).toBe(2);

    gates[0].resolve();
    await tick();
    expect(limiter.active).toBe(2);
    expect(limiter.pending).toBe(0);
    expect(maxRunning).toBe(2);

    gates[1].resolve();
    gates[2].resolve();
    await Promise.all(tasks);
    expect(limiter.active).toBe(0);
    expect(limiter.pending).toBe(0);
    expect(maxRunning).toBe(2);
  });

  it('任务抛错也会释放槽位', async () => {
    const limiter = createLimiter(1);
    await expect(limiter.run(async () => {
      throw new Error('boom');
    })).rejects.toThrow('boom');
    expect(limiter.active).toBe(0);
    await expect(limiter.run(async () => 'ok')).resolves.toBe('ok');
    expect(limiter.active).toBe(0);
  });

  it('上限小于 1 时按 1 处理，且按先进先出放行', async () => {
    const limiter = createLimiter(0);
    const order: number[] = [];
    await Promise.all([
      limiter.run(async () => {
        order.push(1);
      }),
      limiter.run(async () => {
        order.push(2);
      }),
      limiter.run(async () => {
        order.push(3);
      }),
    ]);
    expect(order).toEqual([1, 2, 3]);
  });
});
