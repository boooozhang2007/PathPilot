// 规则引擎：成长规划生成（PRD 4.5）——任务库 + 时间预算分配 + 已掌握技能跳过
import type { CareerPath, Grade, Priority, RoadmapResult, RoadmapTaskDTO, ProfileSkillDTO } from '@pathpilot/shared';
import { UNIT_LIBRARY, familyOfRole, type StudyUnit } from './library.js';
import { remainingSemesters, semesterBudget, semesterLabel, fitTasksToBudget } from '../../services/semester.js';

export interface RulesRoadmapInput {
  targetRole: string;
  careerPath: CareerPath;
  grade: Grade;
  weeklyHours: number;
  userSkills: ProfileSkillDTO[];
  /** 岗位分析得出的高频技能（用于 evidence_refs 与重点技能排序） */
  topJobSkills?: string[];
  /** 重规划时需排除（已完成）的任务标题 */
  excludeTitles?: Set<string>;
}

interface DraftTask {
  unit: StudyUnit;
  semester: number;
}

/** 已掌握判定：level>=3 且有证据（PRD：已掌握技能不重复安排基础学习） */
function masteredSkills(userSkills: ProfileSkillDTO[]): Set<string> {
  return new Set(userSkills.filter((s) => s.level >= 3 && s.evidenceStatus === 'evidenced').map((s) => s.name));
}

function kaoyanDeadlineSemesters(semesters: number[]): number[] {
  // 考研复习集中在最后 4 个学期（倒计时冲刺）
  return semesters.slice(-4);
}

/** 规则通道生成规划草稿（结构符合 PRD §6.4；最终仍需 validateRoadmap 校验后落库） */
export function generateRoadmapByRules(input: RulesRoadmapInput): { roadmap: RoadmapResult; notes: string[] } {
  const notes: string[] = [];
  const family = familyOfRole(input.targetRole);
  const mastered = masteredSkills(input.userSkills);
  const semesters = remainingSemesters(input.grade);
  const isKaoyan = input.careerPath === 'graduate_school';

  // 1) 选择学习单元：跳过已全部掌握的单元；考研路径剔除非保留的 advanced 单元
  let units = UNIT_LIBRARY.filter((u) => u.family === family || (isKaoyan && u.phase === 'kaoyan'));
  if (isKaoyan) {
    units = units.filter((u) => {
      if (u.phase === 'kaoyan') return true; // 考研单元全部保留
      if (u.family !== family) return false; // 只保留本方向单元 + 考研单元
      if (u.phase === 'advanced' && !u.kaoyanKeep) return false; // 备考期压缩进阶选修
      return true;
    });
  }
  const skipped: string[] = [];
  units = units.filter((u) => {
    if (u.phase === 'kaoyan') return isKaoyan;
    if (input.excludeTitles?.has(u.title)) return false; // 已完成的历史任务不重新安排
    if (u.skills.length && u.skills.every((s) => mastered.has(s))) {
      skipped.push(u.title);
      return false;
    }
    return true;
  });
  if (skipped.length) notes.push(`以下内容因已有证据表明掌握而未重复安排：${skipped.join('；')}`);

  // 2) 学期分配：顺序装入，预算用尽进入下一学期；考研单元集中在最后 4 个学期
  const budget = semesterBudget(input.weeklyHours);
  const kaoyanSlots = new Set(isKaoyan ? kaoyanDeadlineSemesters(semesters) : []);
  const placed: DraftTask[] = [];
  let cursor = 0; // 普通单元当前学期指针
  const usage = new Map<number, number>();
  const place = (unit: StudyUnit, semester: number) => {
    placed.push({ unit, semester });
    usage.set(semester, (usage.get(semester) ?? 0) + unit.hours);
  };
  const earliestFor = (unit: StudyUnit): number => {
    if (unit.phase === 'kaoyan') return Math.min(...kaoyanSlots);
    return semesters[Math.min(cursor, semesters.length - 1)];
  };
  for (const unit of units) {
    let semester = earliestFor(unit);
    // 依赖单元所在学期之后
    const prereq = unit.prereq ? placed.find((p) => p.unit.id === unit.prereq) : undefined;
    if (prereq) semester = Math.max(semester, prereq.semester);
    // 考研单元仅在考研学期槽内分配
    if (unit.phase === 'kaoyan') {
      const slots = [...kaoyanSlots].filter((s) => s >= semester);
      semester = slots.find((s) => (usage.get(s) ?? 0) + unit.hours <= budget) ?? slots[slots.length - 1];
    } else {
      while (semester < semesters[semesters.length - 1] && (usage.get(semester) ?? 0) + unit.hours > budget) {
        cursor = Math.min(cursor + 1, semesters.length - 1);
        semester = semesters[cursor];
      }
    }
    place(unit, semester);
  }

  // 3) 组装任务（PRD §6.4 每任务字段；先修单元若已掌握/已完成被过滤，则不再作为前置）
  const allUnits = new Map(UNIT_LIBRARY.map((u) => [u.id, u]));
  const tasks: RoadmapResult['tasks'] = placed.map(({ unit, semester }) => ({
    title: unit.title,
    semester,
    description: unit.description,
    estimated_hours: unit.hours,
    priority: unit.priority,
    prerequisites: unit.prereq && units.some((u) => u.id === unit.prereq) ? [allUnits.get(unit.prereq)!.title] : [],
    deliverable: unit.deliverable,
    acceptance_criteria: unit.acceptance,
    related_skills: unit.skills,
    status: 'not_started' as const,
  }));

  // 4) 时间预算终检（确定性兜底，确保绝不超预算）
  const fitInput = tasks.map((t) => ({
    task: t,
    semester: t.semester,
    estimatedHours: t.estimated_hours,
    priority: t.priority,
    title: t.title,
    prerequisites: t.prerequisites,
  }));
  const fit = fitTasksToBudget(fitInput, input.weeklyHours);
  const keptTasks = fit.kept.map((f) => f.task);
  const deferredTitles = new Set(fit.deferred.map((f) => f.title));
  if (fit.deferred.length) {
    notes.push(`以下任务超出时间预算被延后（可在动态规划中调整每周时间后重新规划）：${[...deferredTitles].join('；')}`);
  }

  // 5) 学期视图
  const semesterViews = [...new Set(keptTasks.map((t) => t.semester))].sort((a, b) => a - b).map((sem) => {
    const semTasks = keptTasks.filter((t) => t.semester === sem);
    const milestoneTask = semTasks.find((t) => t.priority === 'high') ?? semTasks[0];
    const focus = [...new Set(semTasks.flatMap((t) => t.related_skills))].slice(0, 4);
    return {
      index: sem,
      label: semesterLabel(sem),
      goal: `${semTasks[0]?.title.split('，')[0] ?? '学习'}等 ${semTasks.length} 项任务`,
      focus_skills: focus,
      recommended_courses: semTasks.map((t) => t.title).slice(0, 3),
      milestone: milestoneTask ? `完成里程碑产出：${milestoneTask.deliverable}` : '本学期按计划推进',
      estimated_hours: semTasks.reduce((s, t) => s + t.estimated_hours, 0),
    };
  });

  const roadmap: RoadmapResult = {
    goal: `围绕「${input.targetRole}」岗位要求，在剩余 ${semesters.length} 个学期内完成能力储备${isKaoyan ? '（考研路径：以备考为主线，兼顾就业基础）' : ''}`,
    assumptions: [
      `当前年级：${input.grade}；剩余 ${semesters.length} 个学期`,
      `每周可投入 ${input.weeklyHours} 小时，按每学期 18 周、75% 利用率预估`,
      `生成引擎：规则引擎（任务库 + 时间预算分配）`,
      ...(input.topJobSkills?.length ? [`参考岗位分析高频技能：${input.topJobSkills.slice(0, 8).join('、')}`] : []),
    ],
    weekly_hours: input.weeklyHours,
    semesters: semesterViews,
    tasks: keptTasks,
    total_estimated_hours: fit.keptHours,
    risks: [
      ...(fit.deferred.length ? [`时间预算不足，${fit.deferred.length} 项任务被延后`] : []),
      ...(input.weeklyHours < 6 ? ['每周投入时间较少，建议优先保证高优先级任务'] : []),
      '规则引擎基于任务库模板生成，建议结合 AI 模型通道（配置 API Key 后）获得更个性化规划',
    ],
    evidence_refs: [
      ...(input.topJobSkills?.length ? [`岗位分析：${input.topJobSkills.slice(0, 5).join(' / ')}`] : []),
      ...(skipped.length ? [`个人能力档案：已掌握 ${skipped.length} 项（依据档案证据）`] : []),
    ],
  };
  return { roadmap, notes };
}

/** 重规划（规则通道）：已完成任务成果原样保留（PRD 4.6/10.1，不占未来预算） */
export function reviseRoadmapByRules(input: RulesRoadmapInput & { currentTasks: RoadmapTaskDTO[] }): { roadmap: RoadmapResult; notes: string[] } {
  const doneTasks = input.currentTasks.filter((t) => t.status === 'done');
  // 生成剩余计划时排除已完成任务（历史成果单列）
  const { roadmap, notes } = generateRoadmapByRules({ ...input, excludeTitles: new Set(doneTasks.map((t) => t.title)) });
  const keptTitles = new Set(roadmap.tasks.map((t) => t.title));
  const preserved: RoadmapResult['tasks'] = doneTasks.map((t) => ({
    title: t.title,
    semester: t.semester,
    description: t.description,
    estimated_hours: t.estimatedHours,
    priority: t.priority,
    prerequisites: t.prerequisites,
    deliverable: t.deliverable ?? '历史任务产出（见成果记录）',
    acceptance_criteria: t.acceptanceCriteria ?? '已完成（见成果记录）',
    related_skills: t.relatedSkills,
    status: 'done' as const,
  }));
  roadmap.tasks = [...preserved.filter((p) => !keptTitles.has(p.title)), ...roadmap.tasks];
  roadmap.total_estimated_hours = roadmap.tasks.filter((t) => t.status !== 'done').reduce((s, t) => s + t.estimated_hours, 0);
  notes.push(`重规划保留已完成任务 ${preserved.length} 项（含成果记录，不占用剩余时间预算）`);
  return { roadmap, notes };
}
