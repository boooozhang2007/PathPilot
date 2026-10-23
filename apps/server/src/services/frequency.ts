// 岗位样本频次统计（PRD 4.2）：频率必须基于实际取得且成功解析的样本计算
import type { JobSample } from '@pathpilot/shared';
import type { SkillNormalizer } from './normalize.js';

export interface SkillStat {
  name: string;
  category: string;
  count: number; // 出现该技能的样本数
  frequency: number; // count / 有效样本数
  required: boolean; // 出现率 ≥ 50% 视为核心必备（透明规则）
  originalTerms: string[]; // 归一化前的原始词条（保留依据）
}

export interface Distribution {
  label: string;
  count: number;
  ratio: number;
}

export interface JobStats {
  sampleCount: number;
  parseFailedCount: number;
  skills: SkillStat[];
  education: Distribution[];
  experience: Distribution[];
}

function dist(values: (string | null)[], total: number): Distribution[] {
  const counts = new Map<string, number>();
  for (const v of values) {
    const key = (v ?? '未明确').trim() || '未明确';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count, ratio: total > 0 ? count / total : 0 }))
    .sort((a, b) => b.count - a.count);
}

/**
 * 统计岗位样本技能频次。仅 parse 成功的样本计入分母；每个样本内同义技能去重后计 1 次。
 */
export function computeJobStats(samples: JobSample[], failedCount: number, normalize: SkillNormalizer): JobStats {
  const ok = samples; // 调用方保证传入的是成功解析样本
  const total = ok.length;
  const skillSampleCount = new Map<string, { category: string; count: number; terms: Set<string> }>();
  for (const s of ok) {
    const seen = new Set<string>();
    for (const raw of s.skills) {
      const n = normalize(raw);
      const entry = skillSampleCount.get(n.canonical) ?? { category: n.category, count: 0, terms: new Set<string>() };
      entry.terms.add(raw.trim()); // 保留全部原始词条（归一化依据）
      if (!seen.has(n.canonical)) {
        seen.add(n.canonical);
        entry.count += 1; // 样本内同义技能只计 1 次
      }
      skillSampleCount.set(n.canonical, entry);
    }
  }
  const skills: SkillStat[] = [...skillSampleCount.entries()]
    .map(([name, e]) => ({
      name,
      category: e.category,
      count: e.count,
      frequency: total > 0 ? e.count / total : 0,
      required: total > 0 && e.count / total >= 0.5,
      originalTerms: [...e.terms],
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return {
    sampleCount: total,
    parseFailedCount: failedCount,
    skills,
    education: dist(ok.map((s) => s.education_requirement), total),
    experience: dist(ok.map((s) => s.experience_requirement), total),
  };
}
