// 学期映射（三端共用的纯函数）
import type { Grade } from './enums';

/** 年级 → 当前所处学期序号（1=大一上 … 8=大四下；研究生 9-14） */
export const GRADE_TO_CURRENT_SEMESTER: Record<Grade, number> = {
  freshman: 1,
  sophomore: 3,
  junior: 5,
  senior: 7,
  graduate: 9,
  other: 5,
};

export const MAX_SEMESTER = 14;

export function currentSemesterOf(grade: Grade): number {
  return GRADE_TO_CURRENT_SEMESTER[grade] ?? 5;
}

export function semesterLabel(index: number): string {
  const year = Math.ceil(index / 2);
  const half = index % 2 === 1 ? '上' : '下';
  return `第${year}学年 ${half}学期`;
}
