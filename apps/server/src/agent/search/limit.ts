// 轻量 FIFO 计数信号量：限制同时进行的异步任务数（无第三方依赖）。
// 用途：四个岗位通道并行抓取时，所有 HTTP 请求共享一个在途上限，避免同时打爆四个平台触发风控。
export interface Limiter {
  /** 排队执行 fn，最多 max 个同时进行；fn 抛错同样会释放槽位。 */
  run<T>(fn: () => Promise<T>): Promise<T>;
  /** 当前在途任务数（测试与进度展示用）。 */
  readonly active: number;
  /** 当前排队等待的任务数。 */
  readonly pending: number;
}

export function createLimiter(max: number): Limiter {
  const limit = Math.max(1, Math.floor(max));
  let active = 0;
  const queue: (() => void)[] = [];
  const release = () => {
    active--;
    if (active >= limit) return;
    const resume = queue.shift();
    if (!resume) return;
    active++;
    resume();
  };
  return {
    get active() {
      return active;
    },
    get pending() {
      return queue.length;
    },
    async run<T>(fn: () => Promise<T>): Promise<T> {
      if (active >= limit) await new Promise<void>((resolve) => queue.push(resolve));
      else active++;
      try {
        return await fn();
      } finally {
        release();
      }
    },
  };
}
