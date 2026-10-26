// 规则引擎（确定性计算）：能力差距分析 —— 供仪表盘/顾问工具调用（非 LLM 兜底）
import type {
  ProfileDTO,
  ProfileSkillDTO,
  ExperienceDTO,
  RoadmapTaskDTO,
  JobAnalysisDTO,
  SkillGapResult,
} from '@pathpilot/shared';
import { computeMatch, weightFromFrequency, type UserSkillState, type RequirementWeight } from '../../services/match.js';
import type { EvidenceStatus } from '@pathpilot/shared';

export type { UserContext } from '../context.js';
import type { UserContext } from '../context.js';

/** 差距分析（确定性，PRD 4.3）：匹配度/学习顺序/建议项目全部可解释 */
export function analyzeGapByRules(ctx: UserContext): SkillGapResult {
  const analysis = ctx.analysis;
  if (!analysis || analysis.sampleCount === 0) {
    return {
      target_role: ctx.profile?.targetRole ?? '未设定',
      match_score: 0,
      sample_count: 0,
      core_skills: [],
      learning_order: [],
      suggested_projects: [],
      rationale: '暂无岗位分析样本。请先在「岗位洞察」发起岗位分析（真实样本统计后才能计算匹配度，不编造数据）。',
    };
  }
  const stats = analysis.result.skills;
  const userSkills: UserSkillState[] = ctx.skills.map((s) => ({ skill: s.name, status: s.evidenceStatus as EvidenceStatus }));
  const requirements: RequirementWeight[] = stats.map((s) => ({
    skill: s.name,
    weight: weightFromFrequency(s.frequency),
  }));
  const match = computeMatch(requirements, userSkills);
  const statusByName = new Map(ctx.skills.map((s) => [s.name, s.evidenceStatus as EvidenceStatus]));
  const items = stats.slice(0, 20).map((s) => ({
    skill: s.name,
    category: s.category,
    required: s.required,
    importance: (s.frequency >= 0.5 ? 'high' : s.frequency >= 0.25 ? 'medium' : 'low') as 'high' | 'medium' | 'low',
    user_status: statusByName.get(s.name) ?? 'unevaluated',
    gap: (statusByName.get(s.name) ?? 'unevaluated') !== 'evidenced',
    recommendation: undefined,
  }));
  const gapOrder = items
    .filter((i) => i.gap)
    .sort((a, b) => {
      const rank = { high: 0, medium: 1, low: 2 } as const;
      return rank[a.importance] - rank[b.importance];
    })
    .map((i) => i.skill);
  const projects = ctx.experiences.filter((e) => e.type === 'project');
  return {
    target_role: analysis.targetRole,
    match_score: match.score,
    sample_count: analysis.sampleCount,
    core_skills: items,
    learning_order: gapOrder.slice(0, 8),
    suggested_projects:
      projects.length > 0
        ? projects.slice(0, 3).map((p) => `完善既有项目「${p.title}」：补充 README、测试与部署证据`)
        : ['完成一个包含增删改查的小型项目并部署', '为项目补充 README 与技术选型说明', '将项目与岗位高频技能对应并加入简历'],
    rationale: `匹配度 = Σ(要求权重 × 满足系数) / Σ(要求权重)，基于 ${analysis.sampleCount} 条真实岗位样本统计；已有证据=1.0、待验证=0.5、需要提升=0.2、未评估=0。`,
  };
}
