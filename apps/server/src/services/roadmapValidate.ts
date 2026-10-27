// 规划校验（PRD 4.5/6.4）：结构合法 + 依赖关系 + 时间预算；不合法不得保存为正式规划
import { roadmapResult, type RoadmapResult } from '@pathpilot/shared';
import { semesterBudget, remainingSemesters } from './semester.js';
import type { Grade } from '@pathpilot/shared';

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export function validateRoadmap(
  candidate: unknown,
  ctx: { grade: Grade; weeklyHours: number },
  opts: { allowedCompletedTitles?: Set<string> } = {}
): { result?: RoadmapResult; validation: ValidationResult } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1) 结构校验（Zod，PRD 6.4）
  const parsed = roadmapResult.safeParse(candidate);
  if (!parsed.success) {
    return {
      validation: {
        ok: false,
        errors: [...errors, `规划结构不合法: ${parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'} ${i.message}`).join('; ')}`],
        warnings,
      },
    };
  }
  const roadmap = parsed.data;

  // 模型不能凭空把任务标记为已完成；仅重规划时可延续真实已完成任务
  const allowedDone = opts.allowedCompletedTitles ?? new Set<string>();
  for (const t of roadmap.tasks) {
    if (t.status === 'done' && !allowedDone.has(t.title)) {
      t.status = 'not_started';
      warnings.push(`任务「${t.title}」没有历史完成记录，状态已重置为未开始`);
    }
  }

  // 2) 学期范围（已完成任务为历史记录，跳过范围与依赖检查）
  const allowed = new Set(remainingSemesters(ctx.grade));
  for (const t of roadmap.tasks) {
    if (t.status === 'done') continue;
    if (!allowed.has(t.semester)) errors.push(`任务「${t.title}」学期 ${t.semester} 超出剩余学期范围`);
  }
  for (const s of roadmap.semesters) {
    if (!allowed.has(s.index)) warnings.push(`学期 ${s.index}（${s.label}）不在剩余学期范围内`);
  }

  // 3) 依赖检查：前置任务必须存在且不晚于本任务学期
  const titleToSemester = new Map(roadmap.tasks.map((t) => [t.title, t.semester]));
  for (const t of roadmap.tasks) {
    if (t.status === 'done') continue;
    for (const pre of t.prerequisites) {
      if (!titleToSemester.has(pre)) {
        errors.push(`任务「${t.title}」的前置「${pre}」不存在`);
      } else if (titleToSemester.get(pre)! > t.semester) {
        errors.push(`任务「${t.title}」的前置「${pre}」安排在更晚的学期`);
      }
    }
  }

  // 4) 时间预算（按学期；已完成任务不占未来预算；单个超预算任务独占学期视为可执行并警告）
  const bySemester = new Map<number, { hours: number; count: number }>();
  for (const t of roadmap.tasks) {
    if (t.status === 'done') continue;
    const cur = bySemester.get(t.semester) ?? { hours: 0, count: 0 };
    cur.hours += t.estimated_hours;
    cur.count += 1;
    bySemester.set(t.semester, cur);
  }
  const budget = semesterBudget(ctx.weeklyHours);
  for (const [sem, { hours, count }] of bySemester) {
    if (hours > budget && count > 1) errors.push(`学期 ${sem} 任务共 ${hours}h 超过预算 ${budget}h`);
    if (hours > budget && count === 1) warnings.push(`学期 ${sem} 的单个任务（${hours}h）超过预算 ${budget}h，将占用整个学期；建议提高每周投入或拆分任务`);
  }
  if (roadmap.total_estimated_hours !== roadmap.tasks.reduce((s, t) => s + t.estimated_hours, 0)) {
    warnings.push('total_estimated_hours 与任务总和不一致，已按任务总和修正');
    roadmap.total_estimated_hours = roadmap.tasks.reduce((s, t) => s + t.estimated_hours, 0);
  }
  if (roadmap.weekly_hours !== ctx.weeklyHours) {
    warnings.push(`weekly_hours(${roadmap.weekly_hours}) 与输入(${ctx.weeklyHours}) 不一致，已按输入修正`);
    roadmap.weekly_hours = ctx.weeklyHours;
  }
  return { result: roadmap, validation: { ok: errors.length === 0, errors, warnings } };
}

/** 规划差异对比（PRD 4.6：新增/删除/延后/优先级变化/时间变化/里程碑变化） */
export function diffRoadmaps(
  oldRoadmap: { content: RoadmapResult; tasks: { title: string; status: string; priority: string; semester: number }[] },
  newRoadmap: { content: RoadmapResult; tasks: { title: string; status: string; priority: string; semester: number }[] },
  reasons: string[]
) {
  const oldTitles = new Map(oldRoadmap.tasks.map((t) => [t.title, t]));
  const newTitles = new Map(newRoadmap.tasks.map((t) => [t.title, t]));
  const added = [...newTitles.keys()].filter((t) => !oldTitles.has(t));
  const removed = [...oldTitles.keys()].filter((t) => !newTitles.has(t));
  const deferred: string[] = [];
  const priorityChanges: { title: string; from: string; to: string }[] = [];
  const milestoneChanges: string[] = [];
  for (const [title, nt] of newTitles) {
    const ot = oldTitles.get(title);
    if (!ot) continue;
    if (nt.semester > ot.semester) deferred.push(title);
    if (nt.priority !== ot.priority) priorityChanges.push({ title, from: ot.priority, to: nt.priority });
  }
  const oldMilestones = oldRoadmap.content.semesters.map((s) => `${s.label}: ${s.milestone}`);
  const newMilestones = newRoadmap.content.semesters.map((s) => `${s.label}: ${s.milestone}`);
  for (const m of newMilestones) if (!oldMilestones.includes(m)) milestoneChanges.push(m);
  // 已完成任务的删除必须显式说明（PRD：已完成任务不得自动删除）
  const removedDone = removed.filter((t) => oldTitles.get(t)?.status === 'done');
  for (const t of removedDone) {
    if (!reasons.some((r) => r.includes(t))) reasons.push(`已完成任务「${t}」被移除，需用户确认`);
  }
  return {
    added_tasks: added,
    removed_tasks: removed,
    deferred_tasks: deferred,
    priority_changes: priorityChanges,
    hours_change: {
      from: oldRoadmap.content.total_estimated_hours,
      to: newRoadmap.content.total_estimated_hours,
    },
    milestone_changes: milestoneChanges,
    reasons,
  };
}
