import { describe, expect, it, vi } from 'vitest';
import { createCareerPathSaveQueue } from '../lib/careerPathSaveQueue';

describe('发展路径保存顺序', () => {
  it('输入框失焦后立即选择预设时，旧请求先完成且不能覆盖新选择', async () => {
    let finishFirst!: (value: string) => void;
    const first = new Promise<string>((resolve) => { finishFirst = resolve; });
    const send = vi.fn().mockReturnValueOnce(first).mockResolvedValueOnce('employment');
    const success = vi.fn();
    const queue = createCareerPathSaveQueue(send, success, vi.fn());
    const oldSave = queue.save('留学');
    const newSave = queue.save('employment');
    await Promise.resolve();
    expect(send.mock.calls.map(([value]) => value)).toEqual(['留学']);
    finishFirst('留学');
    await oldSave;
    await newSave;
    expect(send.mock.calls.map(([value]) => value)).toEqual(['留学', 'employment']);
    expect(success.mock.calls).toEqual([['employment']]);
  });

  it('保存响应到达前继续输入时，不覆盖新的草稿', async () => {
    let finish!: (value: string) => void;
    const pending = new Promise<string>((resolve) => { finish = resolve; });
    const success = vi.fn();
    const queue = createCareerPathSaveQueue(() => pending, success, vi.fn());
    const save = queue.save('留学');
    queue.invalidate();
    finish('留学');
    await save;
    expect(success).not.toHaveBeenCalled();
  });

  it('旧请求失败不会阻断新的保存', async () => {
    const send = vi.fn().mockRejectedValueOnce(new Error('失败')).mockResolvedValueOnce('graduate_school');
    const success = vi.fn();
    const error = vi.fn();
    const queue = createCareerPathSaveQueue(send, success, error);
    const oldSave = queue.save('留学');
    const newSave = queue.save('graduate_school');
    await Promise.all([oldSave, newSave]);
    expect(error).not.toHaveBeenCalled();
    expect(success).toHaveBeenCalledWith('graduate_school');
  });
});
