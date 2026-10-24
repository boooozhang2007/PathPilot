// 规则引擎：AI 顾问对话 + 能力差距分析 + 简历草稿（全部基于真实业务数据，PRD 4.3/4.8/4.9）
import type {
  ProfileDTO,
  ProfileSkillDTO,
  ExperienceDTO,
  RoadmapTaskDTO,
  JobAnalysisDTO,
  SkillGapResult,
  ResumeDraftResult,
} from '@pathpilot/shared';
import { computeMatch, weightFromFrequency, type UserSkillState, type RequirementWeight } from '../../services/match.js';
import { EVIDENCE_STATUS_LABELS, type EvidenceStatus } from '@pathpilot/shared';

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
    rationale: `匹配度 = Σ(要求权重 × 满足系数) / Σ(要求权重)，基于 ${analysis.sampleCount} 条真实岗位样本统计；已有证据=1.0、待验证=0.5、需要提升=0.2、未评估=0。该数值仅为辅助参考，不代表就业成功概率。`,
  };
}

/** 规则通道对话：基于真实数据的模板回答（明确标注引擎与数据来源） */
export function chatByRules(message: string, ctx: UserContext): string {
  const gap = analyzeGapByRules(ctx);
  const profile = ctx.profile;
  const pending = ctx.activeTasks.filter((t) => t.status !== 'done');
  const nextTask = pending
    .filter((t) => t.status !== 'deferred')
    .sort((a, b) => (a.priority === 'high' ? -1 : 1) - (b.priority === 'high' ? -1 : 1))[0];
  const q = message.toLowerCase();

  const dataLine = (extra = '') => (extra ? `\n\n数据来源：${extra}` : '');

  if (/学什么|应该学|推荐学|学哪些/.test(q)) {
    if (!gap.learning_order.length) {
      return `目前没有检测到明确技能缺口。可以先在「岗位洞察」发起目标岗位分析，或把已掌握技能补充进「能力档案」。${dataLine('技能统计')}`;
    }
    return `根据 ${gap.sample_count} 条「${gap.target_role}」真实岗位样本统计，你目前最值得优先补齐的技能是：
${gap.learning_order.slice(0, 5).map((s, i) => `${i + 1}. ${s}`).join('\n')}

建议从排第 1 的技能开始，配套完成一个可验证的小项目（有产出物与验收标准）再进入下一项。${dataLine('岗位样本频次统计')}`;
  }
  if (/为什么|理由|依据/.test(q)) {
    const top = gap.core_skills.filter((i) => i.required).slice(0, 3);
    return top.length
      ? `推荐依据来自岗位样本统计：${top.map((t) => `「${t.skill}」在样本中出现率≥50%（你的状态：${EVIDENCE_STATUS_LABELS[t.user_status]}）`).join('；')}。缺口按出现率与你的掌握状态排序，不是主观判断。${dataLine('频次与档案证据')}`
      : `当前没有岗位分析数据，无法给出有依据的推荐。请先发起岗位分析。${dataLine()}`;
  }
  if (/就业|考研|升学|工作还是/.test(q)) {
    const path = profile?.careerPath ?? 'undecided';
    const advice =
      path === 'graduate_school'
        ? '你当前选择的是考研路径：规划中已把备考任务放在主线，同时保留了就业基础单元作为退路。建议在大三下前确认目标院校与专业，避免两线都浅。'
        : path === 'employment'
          ? '你当前选择的是直接就业：建议优先把 1-2 个项目做到可部署、可演示，并尽早投递实习——实习经历对秋招价值很高。'
          : '你尚未确定路径。建议在大二结束前通过 1 次实习或 1 个完整项目验证兴趣与市场要求，再锁定方向；两种路径的前两年基础（语言、数据结构、数据库）是共享的。';
    return `${advice}${dataLine('档案路径设置')}`;
  }
  if (/换|转向|换方向|换成/.test(q)) {
    return `换方向的操作路径：在「动态规划」页修改目标岗位 → 系统重新分析该岗位真实样本 → 生成新版本规划（已完成任务与成果会保留，变化会逐项列出）。建议换向前先看新方向的岗位技能频次，评估与现有技能的重合度。${dataLine()}`;
  }
  if (/缺|证据|简历.*缺|还少/.test(q)) {
    const unverifed = ctx.skills.filter((s) => s.evidenceStatus === 'to_verify');
    return unverifed.length
      ? `你的档案中有 ${unverifed.length} 项技能标记为「待验证」（自述掌握但缺证据）：${unverifed.slice(0, 5).map((s) => s.name).join('、')}。建议为它们补充可访问的证据链接（代码仓库/证书/成绩单），简历中无证据的能力不会被写成已掌握。${dataLine('能力档案')}`
      : `你的技能档案暂无「待验证」项。继续保持为每项技能补充证据链接的习惯。${dataLine('能力档案')}`;
  }
  if (/任务|做什么|计划|下一步/.test(q)) {
    if (nextTask) {
      return `你当前规划中优先级最高的未完成任务是「${nextTask.title}」（预计 ${nextTask.estimatedHours} 小时，验收标准：${nextTask.acceptanceCriteria ?? '见任务详情'}）。完成它并提交成果链接后，进度会同步到 Web 端。${dataLine('当前规划任务')}`;
    }
    return pending.length
      ? `你有 ${pending.length} 个未完成任务，均处于延后状态。可在任务中心恢复或重新规划。${dataLine('当前规划任务')}`
      : `当前没有进行中的规划任务。可以先在「动态规划」页生成你的成长路线。${dataLine()}`;
  }
  // 兜底：档案概览
  const profileLine = profile
    ? `目标岗位：${profile.targetRole || '未设定'}；路径：${profile.careerPath}；每周可投入 ${profile.weeklyHours} 小时；匹配度 ${gap.sample_count ? gap.match_score + '%' : '（无岗位样本，暂无法计算）'}。`
    : '你还未填写个人资料，建议先完成「能力档案」与职业目标设置。';
  return `${profileLine}\n你可以问我：目前最该学什么 / 为什么推荐这个项目 / 就业还是考研 / 换方向需要补什么 / 项目经历缺哪些证据。${dataLine()}`;
}

/** 规则通道简历草稿：只用真实经历，不虚构量化数据（PRD 4.9） */
export function resumeDraftByRules(targetRole: string, experiences: ExperienceDTO[]): ResumeDraftResult {
  const projects = experiences.filter((e) => e.type === 'project');
  const contests = experiences.filter((e) => e.type === 'contest');
  const internships = experiences.filter((e) => e.type === 'internship');
  const courses = experiences.filter((e) => e.type === 'course');
  const notes: string[] = [];
  if (!experiences.length) notes.push('档案中暂无经历记录，简历内容为空——请先在能力档案中添加真实经历。');
  if (!projects.length) notes.push('建议至少补充 1 段项目经历（含技术栈与可访问链接）。');
  notes.push('所有条目均来自你的真实档案；未提供量化结果的条目不会虚构数据，请自行补充真实数字。');
  const fmt = (e: ExperienceDTO) => {
    const stack = e.technologies.length ? `技术栈：${e.technologies.join(' / ')}。` : '';
    const role = e.role ? `担任：${e.role}。` : '';
    const res = e.result ? `成果：${e.result}。` : '成果：待补充（请填写真实结果）。';
    const link = e.evidenceUrl ? `证据：${e.evidenceUrl}` : '证据：待补充链接。';
    return `${e.title}${e.startDate ? `（${e.startDate}${e.endDate ? ` 至 ${e.endDate}` : ' 至今'}）` : ''}。${role}${e.description ? `${e.description}。` : ''}${stack}${res}${link}`;
  };
  return {
    target_role: targetRole,
    summary: `计算机相关专业学生，求职方向：${targetRole}。${projects.length ? `完成 ${projects.length} 个项目` : ''}${internships.length ? `、${internships.length} 段实习` : ''}${contests.length ? `、${contests.length} 项竞赛经历` : ''}。`,
    sections: [
      projects.length ? { heading: '项目经历', items: projects.map(fmt) } : null,
      internships.length ? { heading: '实习经历', items: internships.map(fmt) } : null,
      contests.length ? { heading: '竞赛与荣誉', items: contests.map(fmt) } : null,
      courses.length ? { heading: '核心课程', items: [courses.map((c) => c.title).join('、')] } : null,
    ].filter((s): s is { heading: string; items: string[] } => s !== null),
    notes,
  };
}
