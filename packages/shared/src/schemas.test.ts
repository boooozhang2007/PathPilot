// 经历档案交叉校验：endDate 不得早于 startDate（新增 superRefine 的回归用例）
import { describe, expect, it } from 'vitest';
import { experienceInput, experienceUpdate, profileInput, profilePatchInput, generateRoadmapInput, reviseRoadmapInput, roadmapResult } from './schemas';

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

describe('每周投入时长在档案与规划中保持一致', () => {
  const inputs = [profileInput.pick({ weeklyHours: true }), profilePatchInput, generateRoadmapInput, reviseRoadmapInput];

  it.each([1, 80, 100, 168])('档案、规划生成/调整和模型输出均接受 %i 小时', (hours) => {
    for (const schema of inputs) expect(schema.parse({ weeklyHours: hours }).weeklyHours).toBe(hours);
    expect(roadmapResult.pick({ weekly_hours: true }).parse({ weekly_hours: hours }).weekly_hours).toBe(hours);
  });

  it.each([0, -1, 169, 8.5])('各入口均拒绝非法时长 %s', (hours) => {
    for (const schema of inputs) expect(schema.safeParse({ weeklyHours: hours }).success).toBe(false);
    expect(roadmapResult.pick({ weekly_hours: true }).safeParse({ weekly_hours: hours }).success).toBe(false);
  });
});
