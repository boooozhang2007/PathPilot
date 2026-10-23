// 规划服务：版本管理（不可变版本链，PRD 10.3）、任务归属、差异对比
import { and, eq, desc, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { roadmaps, roadmapTasks } from '../db/schema.js';
import { notFound, conflict, badRequest } from './errors.js';
import type { RoadmapDTO, RoadmapTaskDTO, RoadmapVersionSummary, CareerPath, Engine, RoadmapStatus, TaskStatus, Priority } from '@pathpilot/shared';
import type { RoadmapResult } from '@pathpilot/shared';
import { diffRoadmaps } from './roadmapValidate.js';

function toTaskDTO(row: typeof roadmapTasks.$inferSelect): RoadmapTaskDTO {
  return {
    id: row.id,
    roadmapId: row.roadmapId,
    semester: row.semester,
    title: row.title,
    description: row.description,
    estimatedHours: row.estimatedHours,
    priority: row.priority as Priority,
    status: row.status as TaskStatus,
    prerequisites: row.prerequisites ?? [],
    deliverable: row.deliverable,
    acceptanceCriteria: row.acceptanceCriteria,
    relatedSkills: row.relatedSkills ?? [],
    completedAt: row.completedAt,
    actualHours: row.actualHours,
    evidenceUrl: row.evidenceUrl,
    resultNote: row.resultNote,
    deferredReason: row.deferredReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toRoadmapDTO(row: typeof roadmaps.$inferSelect): RoadmapDTO {
  return {
    id: row.id,
    version: row.version,
    parentVersionId: row.parentVersionId,
    targetRole: row.targetRole,
    careerPath: row.careerPath as CareerPath,
    weeklyHours: row.weeklyHours,
    status: row.status as RoadmapStatus,
    generationReason: row.generationReason,
    engine: row.engine as Engine,
    content: row.content as unknown as RoadmapResult,
    createdAt: row.createdAt,
  };
}

export async function getActiveRoadmap(userId: number): Promise<RoadmapDTO | null> {
  const rows = await db
    .select()
    .from(roadmaps)
    .where(and(eq(roadmaps.userId, userId), eq(roadmaps.status, 'active')))
    .orderBy(desc(roadmaps.version))
    .limit(1);
  return rows[0] ? toRoadmapDTO(rows[0]) : null;
}

export async function getRoadmap(userId: number, id: number): Promise<RoadmapDTO> {
  const rows = await db.select().from(roadmaps).where(and(eq(roadmaps.id, id), eq(roadmaps.userId, userId))).limit(1);
  if (!rows[0]) throw notFound('规划不存在');
  return toRoadmapDTO(rows[0]);
}

export async function listRoadmaps(userId: number): Promise<RoadmapVersionSummary[]> {
  const rows = await db.select().from(roadmaps).where(eq(roadmaps.userId, userId)).orderBy(desc(roadmaps.version));
  return rows.map((r) => ({
    id: r.id,
    version: r.version,
    weeklyHours: r.weeklyHours,
    targetRole: r.targetRole,
    status: r.status as RoadmapStatus,
    generationReason: r.generationReason,
    createdAt: r.createdAt,
  }));
}

export async function listRoadmapTasks(userId: number, roadmapId?: number): Promise<RoadmapTaskDTO[]> {
  const where = roadmapId
    ? and(eq(roadmapTasks.userId, userId), eq(roadmapTasks.roadmapId, roadmapId))
    : eq(roadmapTasks.userId, userId);
  const rows = await db.select().from(roadmapTasks).where(where).orderBy(roadmapTasks.semester, roadmapTasks.id);
  return rows.map(toTaskDTO);
}

export async function getTasksOfRoadmap(roadmapId: number): Promise<RoadmapTaskDTO[]> {
  const rows = await db.select().from(roadmapTasks).where(eq(roadmapTasks.roadmapId, roadmapId));
  return rows.map(toTaskDTO);
}

export interface SaveRoadmapInput {
  userId: number;
  parentVersionId: number | null;
  targetRole: string;
  careerPath: string;
  weeklyHours: number;
  content: RoadmapResult;
  engine: Engine;
  generationReason: string;
  /** 重规划时携带的已完成任务（状态与成果原样保留，PRD 10.1） */
  carryOverTasks?: RoadmapTaskDTO[];
}

/** 保存新版本：老版本转 archived，新版本 active（原子事务；失败不落库 → 旧规划不受影响） */
export async function saveRoadmapVersion(input: SaveRoadmapInput): Promise<{ roadmapId: number; version: number }> {
  const now = new Date().toISOString();
  const maxRow = await db
    .select({ v: roadmaps.version })
    .from(roadmaps)
    .where(eq(roadmaps.userId, input.userId))
    .orderBy(desc(roadmaps.version))
    .limit(1);
  const nextVersion = (maxRow[0]?.v ?? 0) + 1;

  const content = { ...input.content };
  // 将已完成任务状态合并进 content.tasks（以 carryOver 为准）
  if (input.carryOverTasks?.length) {
    const carry = new Map(input.carryOverTasks.map((t) => [t.title, t]));
    content.tasks = content.tasks.map((t) => {
      const c = carry.get(t.title);
      return c ? { ...t, status: c.status as RoadmapResult['tasks'][number]['status'] } : t;
    });
  }

  return db.transaction((tx) => {
    tx.update(roadmaps)
      .set({ status: 'archived' })
      .where(and(eq(roadmaps.userId, input.userId), eq(roadmaps.status, 'active')))
      .run();
    const inserted = tx
      .insert(roadmaps)
      .values({
        userId: input.userId,
        version: nextVersion,
        parentVersionId: input.parentVersionId,
        targetRole: input.targetRole,
        careerPath: input.careerPath,
        weeklyHours: input.weeklyHours,
        status: 'active',
        generationReason: input.generationReason,
        engine: input.engine,
        content: content as never,
        createdAt: now,
      })
      .returning()
      .get();
    const carryMap = new Map((input.carryOverTasks ?? []).map((t) => [t.title, t]));
    for (const task of content.tasks) {
      const carried = carryMap.get(task.title);
      tx.insert(roadmapTasks).values({
        roadmapId: inserted.id,
        userId: input.userId,
        semester: task.semester,
        title: task.title,
        description: task.description,
        estimatedHours: Math.round(task.estimated_hours),
        priority: task.priority,
        status: carried ? carried.status : task.status ?? 'not_started',
        prerequisites: task.prerequisites ?? [],
        deliverable: task.deliverable,
        acceptanceCriteria: task.acceptance_criteria,
        relatedSkills: task.related_skills ?? [],
        completedAt: carried?.completedAt ?? null,
        actualHours: carried?.actualHours ?? null,
        evidenceUrl: carried?.evidenceUrl ?? null,
        resultNote: carried?.resultNote ?? null,
        deferredReason: carried?.deferredReason ?? null,
        createdAt: now,
        updatedAt: now,
      }).run();
    }
    return { roadmapId: inserted.id, version: nextVersion };
  });
}

export async function diffRoadmapVersions(userId: number, newId: number, oldId?: number): Promise<ReturnType<typeof diffRoadmaps>> {
  const newer = await getRoadmap(userId, newId);
  const older = oldId
    ? await getRoadmap(userId, oldId)
    : newer.parentVersionId
      ? await getRoadmap(userId, newer.parentVersionId)
      : null;
  if (!older) throw badRequest('没有可对比的历史版本');
  const [oldTasks, newTasks] = await Promise.all([getTasksOfRoadmap(older.id), getTasksOfRoadmap(newer.id)]);
  return diffRoadmaps(
    { content: older.content, tasks: oldTasks.map((t) => ({ title: t.title, status: t.status, priority: t.priority, semester: t.semester })) },
    { content: newer.content, tasks: newTasks.map((t) => ({ title: t.title, status: t.status, priority: t.priority, semester: t.semester })) },
    newer.generationReason ? [newer.generationReason] : []
  );
}

// ---------- 任务更新（状态机 + 乐观锁，PRD 4.7/10.4） ----------
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  not_started: ['not_started', 'in_progress', 'done', 'deferred'],
  in_progress: ['in_progress', 'done', 'deferred', 'not_started'],
  done: ['done'], // 已完成任务不回退（成果保留）；如需重开需删除证据另行处理
  deferred: ['deferred', 'not_started', 'in_progress', 'done'],
};

export async function updateTask(
  userId: number,
  taskId: number,
  input: {
    status?: TaskStatus;
    actualHours?: number;
    evidenceUrl?: string;
    resultNote?: string;
    priority?: Priority;
    expectedUpdatedAt?: string;
    deferredReason?: string;
  }
): Promise<RoadmapTaskDTO> {
  const rows = await db.select().from(roadmapTasks).where(and(eq(roadmapTasks.id, taskId), eq(roadmapTasks.userId, userId))).limit(1);
  if (!rows[0]) throw notFound('任务不存在');
  const task = rows[0];
  if (input.expectedUpdatedAt && input.expectedUpdatedAt !== task.updatedAt) {
    throw conflict('任务已被其他设备修改，请刷新后重试');
  }
  if (input.status && !ALLOWED_TRANSITIONS[task.status]?.includes(input.status)) {
    throw badRequest(`任务状态不能从 ${task.status} 变为 ${input.status}`);
  }
  if (input.status === 'deferred' && !input.deferredReason && !task.deferredReason) {
    throw badRequest('延期任务必须填写原因');
  }
  const now = new Date().toISOString();
  const updated = await db
    .update(roadmapTasks)
    .set({
      status: input.status ?? task.status,
      actualHours: input.actualHours !== undefined ? Math.round(input.actualHours) : task.actualHours,
      evidenceUrl: input.evidenceUrl ?? task.evidenceUrl,
      resultNote: input.resultNote ?? task.resultNote,
      priority: input.priority ?? task.priority,
      deferredReason: input.deferredReason ?? task.deferredReason,
      completedAt: input.status === 'done' ? (task.completedAt ?? now) : input.status ? null : task.completedAt,
      updatedAt: now,
    })
    .where(and(eq(roadmapTasks.id, taskId), eq(roadmapTasks.userId, userId)))
    .returning();
  return toTaskDTO(updated[0]);
}

export async function addTaskEvidence(
  userId: number,
  taskId: number,
  input: { evidenceUrl: string; resultNote?: string; actualHours?: number }
): Promise<RoadmapTaskDTO> {
  return updateTask(userId, taskId, { evidenceUrl: input.evidenceUrl, resultNote: input.resultNote, actualHours: input.actualHours });
}

/** 当前学期序号 → 用于任务筛选 */
export async function tasksBySemester(userId: number): Promise<Map<number, RoadmapTaskDTO[]>> {
  const tasks = await listRoadmapTasks(userId);
  const map = new Map<number, RoadmapTaskDTO[]>();
  for (const t of tasks) {
    const list = map.get(t.semester) ?? [];
    list.push(t);
    map.set(t.semester, list);
  }
  return map;
}

export async function roadmapTitlesExist(userId: number, titles: string[]): Promise<boolean> {
  if (!titles.length) return true;
  const rows = await db
    .select({ id: roadmapTasks.id })
    .from(roadmapTasks)
    .where(and(eq(roadmapTasks.userId, userId), inArray(roadmapTasks.title, titles)))
    .limit(1);
  return rows.length > 0;
}
