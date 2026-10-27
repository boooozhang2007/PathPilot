// 经历档案交叉校验：endDate 不得早于 startDate（新增 superRefine 的回归用例）
import { describe, expect, it } from 'vitest';
import { experienceInput, experienceUpdate } from './schemas';

const base = { type: 'project', title: '示例项目' } as const;

describe('experienceInput 日期交叉校验', () => {
  it('只填开始日期：通过', () => {
    expect(experienceInput.parse({ ...base, startDate: '2024-03-01' }).startDate).toBe('2024-03-01');
  });

  it('只填结束日期：通过', () => {
    expect(experienceInput.parse({ ...base, endDate: '2024-06-30' }).endDate).toBe('2024-06-30');
  });

  it('结束日期晚于开始日期：通过', () => {
    expect(experienceInput.safeParse({ ...base, startDate: '2024-03-01', endDate: '2024-06-30' }).success).toBe(true);
  });

  it('结束日期等于开始日期：通过', () => {
    expect(experienceInput.safeParse({ ...base, startDate: '2024-03-01', endDate: '2024-03-01' }).success).toBe(true);
  });

  it('结束日期早于开始日期：拒绝并定位到 endDate', () => {
    const r = experienceInput.safeParse({ ...base, startDate: '2024-06-30', endDate: '2024-03-01' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path[0] === 'endDate' && i.message === '结束日期不能早于开始日期')).toBe(true);
    }
  });

  it('日期格式非法（2023-13-45 之外的基础格式错误）：拒绝', () => {
    expect(experienceInput.safeParse({ ...base, startDate: '2024/03/01' }).success).toBe(false);
  });
});

describe('experienceUpdate 日期交叉校验', () => {
  it('仅更新日期且 endDate 早于 startDate：拒绝', () => {
    const r = experienceUpdate.safeParse({ startDate: '2024-06-30', endDate: '2024-03-01' });
    expect(r.success).toBe(false);
  });

  it('仅更新标题：通过', () => {
    expect(experienceUpdate.safeParse({ title: '新标题' }).success).toBe(true);
  });
});
