// 时间预算计算（PRD 4.5：总任务量必须符合时间预算，预留机动空间）
// 学期映射纯函数来自 @pathpilot/shared（三端共用）
import type { Grade, Priority } from '@pathpilot/shared';
import { currentSemesterOf, MAX_SEMESTER, semesterLabel } from '@pathpilot/shared';

export { currentSemesterOf, MAX_SEMESTER, semesterLabel };

/** 每学期按 18 教学周、75% 利用率估算（预留 25% 机动空间，不允许超强度计划） */
export const WEEKS_PER_SEMESTER = 18;
export const UTILIZATION = 0.75;

/** 剩余学期列表（含当前学期） */
export function remainingSemesters(grade: Grade): number[] {
  const start = currentSemesterOf(grade);
  const total = grade === 'graduate' ? MAX_SEMESTER : 8;
  const list: number[] = [];
  for (let s = start; s <= total; s++) list.push(s);
  return list.length ? list : [start];
}

/** 某学期可用学习小时数 */
export function semesterBudget(weeklyHours: number): number {
  return Math.floor(WEEKS_PER_SEMESTER * UTILIZATION * weeklyHours);
}

/** 总预算（多学期） */
export function totalBudget(weeklyHours: number, semesterCount: number): number {
  return semesterBudget(weeklyHours) * semesterCount;
}

const PRIORITY_ORDER: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

export function comparePriority(a: Priority, b: Priority): number {
  return PRIORITY_ORDER[a] - PRIORITY_ORDER[b];
}

export interface BudgetPlan<T extends { semester: number; estimatedHours: number; priority: Priority; title: string; prerequisites: string[] }> {
  kept: T[];
  deferred: T[];
  perSemesterBudget: number;
  totalBudget: number;
  keptHours: number;
  deferredHours: number;
}

/**
 * 将任务裁剪进时间预算（PRD 4.5：超限时减少可选任务/调整优先级/延后，不得生成无法执行的计划）
 * 策略：按学期分组，学期内按 优先级→学期序 自然序贪心装入；装不下的任务标记延后（保留依赖完整）。
 */
export function fitTasksToBudget<T extends { semester: number; estimatedHours: number; priority: Priority; title: string; prerequisites: string[] }>(
  tasks: T[],
  weeklyHours: number
): BudgetPlan<T> {
  const perSemesterBudget = semesterBudget(weeklyHours);
  const kept: T[] = [];
  const deferred: T[] = [];
  const bySemester = new Map<number, T[]>();
  for (const t of tasks) {
    const list = bySemester.get(t.semester) ?? [];
    list.push(t);
    bySemester.set(t.semester, list);
  }
  for (const [, list] of [...bySemester.entries()].sort((a, b) => a[0] - b[0])) {
    list.sort((a, b) => comparePriority(a.priority, b.priority) || a.semester - b.semester);
    let used = 0;
    const keptTitles = new Set(kept.map((k) => k.title));
    for (const t of list) {
      const depsOk = t.prerequisites.every((p) => keptTitles.has(p));
      // 空学期允许放入单个超预算任务（占用整个学期，由调用方在 risks 中说明）
      if (depsOk && (used === 0 || used + t.estimatedHours <= perSemesterBudget)) {
        kept.push(t);
        keptTitles.add(t.title);
        used += t.estimatedHours;
      } else {
        deferred.push(t);
      }
    }
  }
  const keptHours = kept.reduce((s, t) => s + t.estimatedHours, 0);
  return {
    kept,
    deferred,
    perSemesterBudget,
    totalBudget: perSemesterBudget * bySemester.size,
    keptHours,
    deferredHours: deferred.reduce((s, t) => s + t.estimatedHours, 0),
  };
}
