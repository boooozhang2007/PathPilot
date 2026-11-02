// 学习提醒与周期总结（PRD P1）：任务到期提醒（确定性）+ 每周总结（确定性，不依赖 LLM）
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db/client.js';
import { reminders } from '../db/schema.js';
import { getProfile } from './profileService.js';
import { listRoadmapTasks } from './roadmapService.js';
import { notFound } from './errors.js';
import { currentSemesterOf } from '@pathpilot/shared';
import type { ReminderDTO, ReminderPayloadDTO, WeeklySummaryDTO } from '@pathpilot/shared';

const DAY_MS = 24 * 60 * 60 * 1000;

function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function localDateOf(iso: string): string {
  return toLocalDateStr(new Date(iso));
}

/** 本周（周一至周日）的本地日期范围 */
function weekRange(): { start: string; end: string; label: string } {
  const now = new Date();
  const diffToMon = (now.getDay() + 6) % 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - diffToMon);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const start = toLocalDateStr(monday);
  const end = toLocalDateStr(sunday);
  return { start, end, label: `${start.slice(5).replace('-', '/')} ~ ${end.slice(5).replace('-', '/')}` };
}

function toReminderDTO(row: typeof reminders.$inferSelect): ReminderDTO {
  return {
    id: row.id,
    type: row.type as ReminderDTO['type'],
    title: row.title,
    message: row.message,
    taskId: row.taskId ?? null,
    scheduledAt: row.scheduledAt,
    dismissedAt: row.dismissedAt,
    createdAt: row.createdAt,
  };
}

/** 同步任务到期提醒：为未来 7 天内到期、未完成的任务生成提醒；清理已失效的提醒 */
async function syncReminders(userId: number): Promise<void> {
  const tasks = await listRoadmapTasks(userId);
  const today = toLocalDateStr(new Date());
  const horizon = toLocalDateStr(new Date(Date.now() + 7 * DAY_MS));
  const dueKeys = new Set<string>();
  const now = new Date().toISOString();

  for (const t of tasks) {
    if (!t.dueDate || t.status === 'done') continue;
    if (t.dueDate < today || t.dueDate > horizon) continue;
    const dedupeKey = `task_due:${t.id}:${t.dueDate}`;
    dueKeys.add(dedupeKey);
    await db
      .insert(reminders)
      .values({
        userId,
        type: 'task_due',
        dedupeKey,
        title: `任务到期：${t.title}`,
        message: `「${t.title}」将在 ${t.dueDate} 到期，预计投入 ${t.estimatedHours} 小时。`,
        taskId: t.id,
        scheduledAt: `${t.dueDate}T09:00:00.000Z`,
        createdAt: now,
      })
      .onConflictDoNothing();
  }

  // 清理：任务已完成 / 到期日被修改 / 已过期，对应提醒失效
  const existing = await db.select().from(reminders).where(and(eq(reminders.userId, userId), eq(reminders.type, 'task_due')));
  for (const r of existing) {
    if (!dueKeys.has(r.dedupeKey)) await db.delete(reminders).where(eq(reminders.id, r.id));
  }
}

/** 每周总结（确定性）：本周完成情况、投入时间、学期完成率、待办重点 */
async function buildWeeklySummary(userId: number): Promise<WeeklySummaryDTO | null> {
  const [profile, tasks] = await Promise.all([getProfile(userId), listRoadmapTasks(userId)]);
  if (!profile && !tasks.length) return null;

  const { start, end, label } = weekRange();
  const doneThisWeek = tasks.filter((t) => {
    if (t.status !== 'done' || !t.completedAt) return false;
    const d = localDateOf(t.completedAt);
    return d >= start && d <= end;
  });
  const hoursPlanned = doneThisWeek.reduce((s, t) => s + t.estimatedHours, 0);
  const hoursActual = doneThisWeek.reduce((s, t) => s + (t.actualHours ?? 0), 0);
  const currentSem = profile ? currentSemesterOf(profile.grade) : null;
  const semTasks = tasks.filter((t) => t.semester === currentSem);
  const semDone = semTasks.filter((t) => t.status === 'done').length;
  const semesterCompletionRate = semTasks.length ? Math.round((semDone / semTasks.length) * 100) : 0;
  const dueSoon = tasks.filter((t) => t.dueDate && t.status !== 'done' && t.dueDate >= start && t.dueDate <= end);
  const upcoming = tasks
    .filter((t) => t.status !== 'done' && t.priority === 'high')
    .sort((a, b) => a.semester - b.semester)
    .slice(0, 5);

  const highlights: string[] = [];
  if (doneThisWeek.length) highlights.push(`本周完成 ${doneThisWeek.length} 项任务，实际投入 ${hoursActual > 0 ? hoursActual : hoursPlanned} 小时`);
  else highlights.push('本周暂无已完成任务，从一项小任务开始吧');
  if (semTasks.length) highlights.push(`当前学期完成率 ${semesterCompletionRate}%（${semDone}/${semTasks.length}）`);
  if (dueSoon.length) highlights.push(`本周有 ${dueSoon.length} 项任务即将到期，记得跟进`);
  if (!tasks.length) highlights.push('还没有成长规划，先去「岗位洞察」分析目标岗位并生成路线');

  return {
    period: { start, end, label },
    tasksCompletedThisWeek: doneThisWeek.length,
    hoursPlannedThisWeek: hoursPlanned,
    hoursActualThisWeek: hoursActual,
    semesterCompletionRate,
    totalDoneTasks: tasks.filter((t) => t.status === 'done').length,
    highlights,
    upcomingCriticalTasks: upcoming,
    generatedAt: new Date().toISOString(),
  };
}

export async function listReminders(userId: number): Promise<ReminderPayloadDTO> {
  await syncReminders(userId);
  const rows = await db
    .select()
    .from(reminders)
    .where(and(eq(reminders.userId, userId), isNull(reminders.dismissedAt)))
    .orderBy(reminders.scheduledAt)
    .limit(50);
  return { reminders: rows.map(toReminderDTO), weeklySummary: await buildWeeklySummary(userId) };
}

export async function dismissReminder(userId: number, id: number): Promise<void> {
  const updated = await db
    .update(reminders)
    .set({ dismissedAt: new Date().toISOString() })
    .where(and(eq(reminders.id, id), eq(reminders.userId, userId)))
    .returning();
  if (!updated[0]) throw notFound('提醒不存在');
}
