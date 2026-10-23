// 能力匹配度（PRD 4.3）：透明加权公式，仅作辅助参考指标
// 匹配度 = Σ(要求权重 × 用户满足系数) / Σ(要求权重) × 100
import type { EvidenceStatus } from '@pathpilot/shared';

/** 用户状态满足系数：已有证据=1.0 待验证=0.5 需要提升=0.2 未评估/未记录=0 */
export const EVIDENCE_SATISFACTION: Record<EvidenceStatus, number> = {
  evidenced: 1.0,
  to_verify: 0.5,
  needs_improvement: 0.2,
  unevaluated: 0,
};

export interface RequirementWeight {
  skill: string;
  /** 核心必备(required)=权重 3；出现率高但非必备=2；加分项=1 */
  weight: number;
}

export interface UserSkillState {
  skill: string;
  status: EvidenceStatus;
  level?: number;
}

export interface MatchResult {
  score: number; // 0-100
  satisfiedWeight: number;
  totalWeight: number;
  perSkill: {
    skill: string;
    weight: number;
    status: EvidenceStatus;
    satisfaction: number;
    gap: boolean;
  }[];
}

export function computeMatch(requirements: RequirementWeight[], userSkills: UserSkillState[]): MatchResult {
  const statusBySkill = new Map(userSkills.map((s) => [s.skill.toLowerCase(), s]));
  let satisfied = 0;
  let total = 0;
  const perSkill: MatchResult['perSkill'] = [];
  for (const req of requirements) {
    const user = statusBySkill.get(req.skill.toLowerCase());
    const status: EvidenceStatus = user?.status ?? 'unevaluated';
    const satisfaction = EVIDENCE_SATISFACTION[status];
    satisfied += req.weight * satisfaction;
    total += req.weight;
    perSkill.push({
      skill: req.skill,
      weight: req.weight,
      status,
      satisfaction,
      gap: satisfaction < 1,
    });
  }
  return {
    score: total > 0 ? Math.round((satisfied / total) * 100) : 0,
    satisfiedWeight: satisfied,
    totalWeight: total,
    perSkill: perSkill.sort((a, b) => b.weight - a.weight || a.satisfaction - b.satisfaction),
  };
}

/** 由频次统计推导要求权重（透明规则，PRD 4.3：权重由样本统计和配置规则共同确定） */
export function weightFromFrequency(frequency: number, isBonus = false): number {
  if (isBonus) return 1;
  if (frequency >= 0.5) return 3;
  if (frequency >= 0.25) return 2;
  return 1;
}
