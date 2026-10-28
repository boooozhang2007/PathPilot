import { describe, expect, it } from 'vitest';
import type { ProfileDTO } from '@pathpilot/shared';
import { createProfileSaveQueue } from './profileSaveQueue';

const initial: ProfileDTO = {
  userId: 1,
  nickname: '同学',
  school: '原学校',
  major: '计算机科学与技术',
  grade: 'sophomore',
  graduationDate: '2028-06-01',
  targetRole: 'Java 后端开发',
  careerPath: 'employment',
  weeklyHours: 8,
  mbti: null,
  avatar: null,
  createdAt: '2026-10-28T00:00:00.000Z',
  updatedAt: '2026-10-28T00:00:00.000Z',
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function fixture(send: (patch: Partial<ProfileDTO>) => Promise<ProfileDTO>) {
  let current = { ...initial };
  const errors: unknown[] = [];
  const queue = createProfileSaveQueue({
    read: () => current,
    apply: (profile) => { current = profile; },
    send,
    onError: (error) => errors.push(error),
  });
  return { queue, errors, read: () => current, edit: (patch: Partial<ProfileDTO>) => { current = { ...current, ...patch }; } };
}

describe('个人资料串行保存', () => {
  it('按顺序提交三次年月编辑，A→B→A 最后一次生效', async () => {
    const firstResponse = deferred<ProfileDTO>();
    const calls: Partial<ProfileDTO>[] = [];
    let server = { ...initial };
    const { queue, read } = fixture(async (patch) => {
      calls.push(patch);
      if (calls.length === 1) return firstResponse.promise;
      server = { ...server, ...patch };
      return server;
    });
    const first = queue.save({ graduationDate: '2031-11-01' });
    const second = queue.save({ graduationDate: '2032-12-01' });
    const third = queue.save({ graduationDate: '2031-11-01' });
    await Promise.resolve();
    expect(calls).toEqual([{ graduationDate: '2031-11-01' }]);
    expect(read().graduationDate).toBe('2031-11-01');
    server = { ...server, graduationDate: '2031-11-01' };
    firstResponse.resolve(server);
    expect(await Promise.all([first, second, third])).toEqual([true, true, true]);
    expect(calls.map((patch) => patch.graduationDate)).toEqual(['2031-11-01', '2032-12-01', '2031-11-01']);
    expect(read().graduationDate).toBe(server.graduationDate);
    expect(await queue.flush()).toBe(true);
  });

  it('相同年月的第一次提交失败不会回滚排队中的最新选择', async () => {
    const response = deferred<ProfileDTO>();
    let calls = 0;
    const { queue, read } = fixture(async (patch) => {
      calls += 1;
      if (calls === 1) return response.promise;
      return { ...initial, ...patch };
    });
    const first = queue.save({ graduationDate: '2031-11-01' });
    const retry = queue.save({ graduationDate: '2031-11-01' });
    response.reject(new Error('暂时离线'));
    expect(await first).toBe(false);
    expect(read().graduationDate).toBe('2031-11-01');
    expect(await retry).toBe(true);
    expect(read().graduationDate).toBe('2031-11-01');
    expect(await queue.flush()).toBe(true);
  });

  it('学校保存响应保留尚未提交的昵称草稿', async () => {
    const response = deferred<ProfileDTO>();
    const { queue, read, edit } = fixture(() => response.promise);
    const saving = queue.save({ school: '新学校' });
    edit({ nickname: '正在输入的昵称' });
    response.resolve({ ...initial, school: '新学校' });
    await saving;
    expect(read().nickname).toBe('正在输入的昵称');
    expect(read().school).toBe('新学校');
  });

  it('同一字段的保存响应保留随后输入但尚未提交的草稿', async () => {
    const response = deferred<ProfileDTO>();
    const { queue, read, edit } = fixture(() => response.promise);
    const saving = queue.save({ nickname: '第一次输入' });
    edit({ nickname: '继续输入' });
    response.resolve({ ...initial, nickname: '第一次输入' });
    await saving;
    expect(read().nickname).toBe('继续输入');
  });

  it('首个保存失败时回滚到加载值，不能把防抖草稿当作已确认值', async () => {
    const { queue, read, edit } = fixture(async () => { throw new Error('网络断开'); });
    edit({ nickname: '尚未保存的草稿' });
    expect(await queue.save({ nickname: '尚未保存的草稿' })).toBe(false);
    expect(read().nickname).toBe(initial.nickname);
    expect(await queue.flush()).toBe(false);
  });

  it('后一次失败回滚到前一次已确认值，重试成功解除失败状态', async () => {
    let calls = 0;
    const { queue, read, errors } = fixture(async (patch) => {
      calls += 1;
      if (calls === 2) throw new Error('网络断开');
      return { ...initial, ...patch };
    });
    expect(await queue.save({ weeklyHours: 100 })).toBe(true);
    expect(await queue.save({ weeklyHours: 168 })).toBe(false);
    expect(read().weeklyHours).toBe(100);
    expect(errors).toHaveLength(1);
    expect(await queue.flush()).toBe(false);
    expect(await queue.save({ weeklyHours: 168 })).toBe(true);
    expect(read().weeklyHours).toBe(168);
    expect(await queue.flush()).toBe(true);
  });

  it('其它字段成功不能掩盖尚未解决的保存失败', async () => {
    const { queue, read } = fixture(async (patch) => {
      if ('graduationDate' in patch) throw new Error('保存失败');
      return { ...initial, ...patch };
    });
    expect(await queue.save({ graduationDate: '2031-11-01' })).toBe(false);
    expect(await queue.save({ school: '新学校' })).toBe(true);
    expect(read().graduationDate).toBe(initial.graduationDate);
    expect(read().school).toBe('新学校');
    expect(await queue.flush()).toBe(false);
  });

  it('flush 等待期间追加的失焦保存也必须完成', async () => {
    const first = deferred<ProfileDTO>();
    const second = deferred<ProfileDTO>();
    let calls = 0;
    const { queue, read } = fixture(() => ++calls === 1 ? first.promise : second.promise);
    queue.save({ school: '新学校' });
    let flushed = false;
    const flushing = queue.flush().then((ok) => { flushed = true; return ok; });
    queue.save({ weeklyHours: 100 });
    first.resolve({ ...initial, school: '新学校' });
    await Promise.resolve();
    await Promise.resolve();
    expect(flushed).toBe(false);
    second.resolve({ ...initial, school: '新学校', weeklyHours: 100 });
    expect(await flushing).toBe(true);
    expect(read().weeklyHours).toBe(100);
  });
});
