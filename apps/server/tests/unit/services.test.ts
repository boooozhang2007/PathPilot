// 单元测试：技能归一化 / 时间预算 / 规划校验 / 匹配度（PRD 13.8.1/2/3）
import { describe, it, expect } from 'vitest';
import { buildNormalizer, normalizeSkillList } from '../../src/services/normalize.js';
import { semesterBudget, fitTasksToBudget, remainingSemesters, totalBudget } from '../../src/services/semester.js';
import { validateRoadmap } from '../../src/services/roadmapValidate.js';
import { computeMatch, weightFromFrequency } from '../../src/services/match.js';
import { computeJobStats } from '../../src/services/frequency.js';
import type { SkillCatalogItem } from '@pathpilot/shared';

const catalog: SkillCatalogItem[] = [
  { id: 1, name: 'JavaScript', category: 'language', aliases: ['JS', 'ES6'] },
  { id: 2, name: 'PostgreSQL', category: 'database', aliases: ['Postgres', 'PG'] },
  { id: 3, name: 'Spring Boot', category: 'framework', aliases: ['SpringBoot', 'Spring Boot 开发'] },
  { id: 4, name: 'Java', category: 'language', aliases: ['JAVA'] },
];

describe('技能归一化（PRD 4.3）', () => {
  const normalize = buildNormalizer(catalog);

  it('JS 与 JavaScript 归一化到同一技能', () => {
    expect(normalize('JS').canonical).toBe('JavaScript');
    expect(normalize('JavaScript').canonical).toBe('JavaScript');
    expect(normalize('javascript').canonical).toBe('JavaScript');
  });

  it('Postgres 与 PostgreSQL 归一化；保留原始词条映射', () => {
    const { byCanonical } = normalizeSkillList(['Postgres', 'PostgreSQL', 'PG'], normalize);
    expect(byCanonical.get('PostgreSQL')!.map((r) => r.original)).toEqual(['Postgres', 'PostgreSQL', 'PG']);
  });

  it('“Spring Boot 开发” 修饰后缀被剥离并映射到 Spring Boot', () => {
    expect(normalize('Spring Boot 开发').canonical).toBe('Spring Boot');
  });

  it('语义相近但不等价的技能不合并（未命中词典原样返回）', () => {
    const r = normalize('Spring Cloud');
    expect(r.canonical).toBe('Spring Cloud');
    expect(r.matched).toBe(false);
  });
});

describe('时间预算（PRD 4.5）', () => {
  it('学期预算 = 周数 × 利用率 × 每周小时（预留机动空间）', () => {
    expect(semesterBudget(10)).toBe(Math.floor(18 * 0.75 * 10)); // 135
    expect(semesterBudget(4)).toBe(54);
  });

  it('年级映射剩余学期（大二 → 第 3-8 学期）', () => {
    expect(remainingSemesters('sophomore')).toEqual([3, 4, 5, 6, 7, 8]);
  });

  it('总预算按学期数累加', () => {
    expect(totalBudget(10, 6)).toBe(135 * 6);
  });

  it('超预算任务被延后，不生成无法执行的计划', () => {
    const tasks = [
      { title: 'A', semester: 3, estimatedHours: 80, priority: 'high' as const, prerequisites: [] },
      { title: 'B', semester: 3, estimatedHours: 80, priority: 'medium' as const, prerequisites: [] },
      { title: 'C', semester: 4, estimatedHours: 40, priority: 'high' as const, prerequisites: [] },
    ];
    const fit = fitTasksToBudget(tasks, 4); // 每学期预算 54
    expect(fit.kept.map((t) => t.title)).toContain('A'); // 空学期首任务允许放入
    expect(fit.kept.map((t) => t.title)).not.toContain('B'); // 同学期第二个 80h 超预算 → 延后
    expect(fit.kept.map((t) => t.title)).toContain('C');
    expect(fit.deferred.map((t) => t.title)).toContain('B');
  });

  it('依赖未满足的任务被延后', () => {
    const tasks = [
      { title: '基础', semester: 3, estimatedHours: 40, priority: 'high' as const, prerequisites: [] },
      { title: '进阶', semester: 3, estimatedHours: 40, priority: 'high' as const, prerequisites: ['不存在的前置'] },
    ];
    const fit = fitTasksToBudget(tasks, 10);
    expect(fit.deferred.map((t) => t.title)).toContain('进阶');
  });
});

describe('规划 JSON 校验（PRD 6.4 / 13.8.3）', () => {
  const base = {
    goal: '测试规划',
    assumptions: [],
    weekly_hours: 10,
    semesters: [{ index: 3, label: '第2学年 上学期', goal: 'g', focus_skills: [], recommended_courses: [], milestone: 'm', estimated_hours: 90 }],
    tasks: [
      { title: '任务一', semester: 3, description: 'd', estimated_hours: 50, priority: 'high', prerequisites: [], deliverable: '产出', acceptance_criteria: '验收', related_skills: [], status: 'not_started' },
      { title: '任务二', semester: 3, description: 'd', estimated_hours: 50, priority: 'medium', prerequisites: ['任务一'], deliverable: '产出', acceptance_criteria: '验收', related_skills: [], status: 'not_started' },
    ],
    total_estimated_hours: 100,
    risks: [],
    evidence_refs: [],
  };

  it('合法规划通过校验', () => {
    const { result, validation } = validateRoadmap(base, { grade: 'sophomore', weeklyHours: 10 });
    expect(validation.ok).toBe(true);
    expect(result).toBeDefined();
  });

  it('结构不合法（缺字段）被拒绝', () => {
    const broken = { ...base, tasks: [{ title: '缺字段' }] };
    const { result, validation } = validateRoadmap(broken, { grade: 'sophomore', weeklyHours: 10 });
    expect(result).toBeUndefined();
    expect(validation.ok).toBe(false);
    expect(validation.errors[0]).toContain('规划结构不合法');
  });

  it('学期超范围被拒绝', () => {
    const out = structuredClone(base);
    out.tasks[0].semester = 2; // 大二从学期 3 开始，2 超出剩余范围
    const { validation } = validateRoadmap(out, { grade: 'sophomore', weeklyHours: 10 });
    expect(validation.ok).toBe(false);
    expect(validation.errors.join()).toContain('超出剩余学期范围');
  });

  it('研究生/博士后的学期 13-14 可通过校验（学期上限 14）', () => {
    expect(remainingSemesters('postdoc')).toEqual([13, 14]);
    const postdoc = {
      goal: '博士后成长规划',
      assumptions: [],
      weekly_hours: 10,
      semesters: [13, 14].map((i) => ({
        index: i,
        label: `学期${i}`,
        goal: 'g',
        focus_skills: [],
        recommended_courses: [],
        milestone: 'm',
        estimated_hours: 20,
      })),
      tasks: [
        {
          title: '任务A',
          semester: 13,
          description: 'd',
          estimated_hours: 20,
          priority: 'high',
          prerequisites: [],
          deliverable: '产出',
          acceptance_criteria: '验收',
          related_skills: [],
          status: 'not_started',
        },
      ],
      total_estimated_hours: 20,
      risks: [],
      evidence_refs: [],
    };
    const { result, validation } = validateRoadmap(postdoc, { grade: 'postdoc', weeklyHours: 10 });
    expect(validation.ok).toBe(true);
    expect(result?.tasks[0].semester).toBe(13);
  });

  it('前置安排在更晚学期被拒绝', () => {
    const late = structuredClone(base);
    late.tasks[0].semester = 4; // 任务二(学期3)的前置任务一在学期4
    const { validation } = validateRoadmap(late, { grade: 'sophomore', weeklyHours: 10 });
    expect(validation.ok).toBe(false);
    expect(validation.errors.join()).toContain('更晚的学期');
  });

  it('多任务学期超预算被拒绝；单个超预算任务仅警告', () => {
    const over = structuredClone(base);
    over.tasks[0].estimated_hours = 70; // 学期3 共 120h > 135? no. 设 weekly 4 → 预算 54
    const multi = validateRoadmap(over, { grade: 'sophomore', weeklyHours: 4 });
    expect(multi.validation.ok).toBe(false);
    const single = structuredClone(base);
    single.tasks = [single.tasks[0]];
    single.tasks[0].estimated_hours = 60;
    single.total_estimated_hours = 60;
    const r = validateRoadmap(single, { grade: 'sophomore', weeklyHours: 4 });
    expect(r.validation.ok).toBe(true);
    expect(r.validation.warnings.join()).toContain('占用整个学期');
  });
});

describe('匹配度（PRD 4.3 透明公式）', () => {
  it('加权匹配：已有证据=1.0 待验证=0.5 未评估=0', () => {
    const r = computeMatch(
      [
        { skill: 'Java', weight: 3 },
        { skill: 'SQL', weight: 1 },
      ],
      [
        { skill: 'Java', status: 'evidenced' },
        { skill: 'SQL', status: 'to_verify' },
      ]
    );
    // (3*1 + 1*0.5) / 4 = 87.5% → 88
    expect(r.score).toBe(88);
  });

  it('频次映射权重：≥50%=3, ≥25%=2, 其他=1', () => {
    expect(weightFromFrequency(0.6)).toBe(3);
    expect(weightFromFrequency(0.3)).toBe(2);
    expect(weightFromFrequency(0.1)).toBe(1);
    expect(weightFromFrequency(0.9, true)).toBe(1);
  });
});

describe('频次统计（PRD 4.2：基于真实成功样本）', () => {
  const normalize = buildNormalizer(catalog);
  it('频率=出现样本数/有效样本数；样本内同义去重', () => {
    const samples = [
      { title: 'j1', company: null, location: null, employment_type: 'internship' as const, education_requirement: '本科', experience_requirement: null, skills: ['JS', 'JavaScript'], description: '', source_url: null, fetched_at: '', source_type: 'web' as const },
      { title: 'j2', company: null, location: null, employment_type: 'internship' as const, education_requirement: '本科', experience_requirement: null, skills: ['Java'], description: '', source_url: null, fetched_at: '', source_type: 'web' as const },
      { title: 'j3', company: null, location: null, employment_type: 'internship' as const, education_requirement: '硕士', experience_requirement: null, skills: [], description: '', source_url: null, fetched_at: '', source_type: 'web' as const },
    ];
    const stats = computeJobStats(samples, 2, normalize);
    expect(stats.sampleCount).toBe(3);
    const js = stats.skills.find((s) => s.name === 'JavaScript')!;
    expect(js.count).toBe(1); // 样本内去重
    expect(js.frequency).toBeCloseTo(1 / 3);
    expect(js.originalTerms).toEqual(['JS', 'JavaScript']);
    expect(stats.education.find((e) => e.label === '本科')!.count).toBe(2);
  });
});
