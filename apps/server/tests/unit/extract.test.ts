// 关键词抽取回归：英文缩写按词边界匹配，避免 ML/HTML、Go/MongoDB、OS/position、Java/JavaScript 子串误判
import { describe, it, expect } from 'vitest';
import { extractRequirementsByKeywords } from '../../src/agent/search/extract.js';
import { buildNormalizer } from '../../src/services/normalize.js';
import type { JobSample, SkillCatalogItem } from '@pathpilot/shared';

const catalog: SkillCatalogItem[] = [
  { id: 1, name: 'HTML', category: 'language', aliases: [] },
  { id: 2, name: 'CSS', category: 'language', aliases: [] },
  { id: 3, name: 'JavaScript', category: 'language', aliases: ['JS'] },
  { id: 4, name: 'TypeScript', category: 'language', aliases: ['TS'] },
  { id: 5, name: 'MongoDB', category: 'database', aliases: [] },
  { id: 6, name: 'Django', category: 'framework', aliases: [] },
];

const sample: JobSample = {
  title: '前端开发',
  company: null,
  location: null,
  employment_type: 'full_time',
  education_requirement: null,
  experience_requirement: null,
  skills: [],
  description: '熟悉 MongoDB、TypeScript、Django 与 HTML/CSS，具备 JavaScript 基础；负责 position 相关页面。',
  source_url: null,
  fetched_at: new Date().toISOString(),
  source_type: 'manual',
};

describe('关键词抽取词边界（回归）', () => {
  const normalize = buildNormalizer(catalog);

  it('仅匹配完整词条：HTML 不产出 ML、MongoDB 不产出 Go、position 不产出 OS、JavaScript 不产出 Java', () => {
    const terms = ['ML', 'Go', 'OS', 'Java', 'HTML', 'CSS', 'JavaScript', 'TypeScript', 'MongoDB', 'Django'];
    const found = extractRequirementsByKeywords(sample, normalize, terms).skills;
    expect(new Set(found)).toEqual(new Set(['HTML', 'CSS', 'JavaScript', 'TypeScript', 'MongoDB', 'Django']));
    expect(found).not.toContain('ML');
    expect(found).not.toContain('Go');
    expect(found).not.toContain('OS');
    expect(found).not.toContain('Java');
  });
});
