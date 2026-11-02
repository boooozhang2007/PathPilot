// 规划分享（PRD P2）：只读链接，同一规划同一时刻仅保留一个有效分享
import { randomBytes } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db/client.js';
import { roadmapShares, roadmaps } from '../db/schema.js';
import { getRoadmap, getTasksOfRoadmap } from './roadmapService.js';
import { notFound } from './errors.js';
import { config } from '../config.js';
import type { RoadmapShareDTO, SharedRoadmapDTO, SharedRoadmapTaskDTO, CareerPath, RoadmapStatus, Engine, RoadmapResult } from '@pathpilot/shared';

const DAY_MS = 24 * 60 * 60 * 1000;

function makeToken(): string {
  return randomBytes(24).toString('base64url');
}

function shareUrl(token: string): string {
  return `${config.publicBaseUrl}/share/${token}`;
}

function toShareDTO(row: typeof roadmapShares.$inferSelect): RoadmapShareDTO {
  return { token: row.token, url: shareUrl(row.token), expiresAt: row.expiresAt, createdAt: row.createdAt };
}

/** 创建分享：撤销该规划既有有效分享后新建（保证同一规划只保留一个） */
export async function shareRoadmap(userId: number, roadmapId: number, expiresInDays: number): Promise<RoadmapShareDTO> {
  await getRoadmap(userId, roadmapId); // 校验归属
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + expiresInDays * DAY_MS).toISOString();
  const token = makeToken();
  db.transaction((tx) => {
    tx.update(roadmapShares)
      .set({ revokedAt: now })
      .where(and(eq(roadmapShares.userId, userId), eq(roadmapShares.roadmapId, roadmapId), isNull(roadmapShares.revokedAt)))
      .run();
    tx.insert(roadmapShares).values({ userId, roadmapId, token, expiresAt, createdAt: now }).run();
  });
  return { token, url: shareUrl(token), expiresAt, createdAt: now };
}

export async function getActiveShare(userId: number, roadmapId: number): Promise<RoadmapShareDTO | null> {
  const rows = await db
    .select()
    .from(roadmapShares)
    .where(and(eq(roadmapShares.userId, userId), eq(roadmapShares.roadmapId, roadmapId), isNull(roadmapShares.revokedAt)))
    .limit(1);
  return rows[0] ? toShareDTO(rows[0]) : null;
}

export async function revokeShare(userId: number, roadmapId: number): Promise<void> {
  await db
    .update(roadmapShares)
    .set({ revokedAt: new Date().toISOString() })
    .where(and(eq(roadmapShares.userId, userId), eq(roadmapShares.roadmapId, roadmapId), isNull(roadmapShares.revokedAt)));
}

/** 公开只读：按 token 读取规划快照，不含 userId/email 等个人隐私 */
export async function getSharedRoadmap(token: string): Promise<SharedRoadmapDTO> {
  const shareRows = await db
    .select()
    .from(roadmapShares)
    .where(and(eq(roadmapShares.token, token), isNull(roadmapShares.revokedAt)))
    .limit(1);
  const share = shareRows[0];
  if (!share) throw notFound('分享链接不存在或已失效');
  if (share.expiresAt && share.expiresAt < new Date().toISOString()) throw notFound('分享链接已过期');

  const rmRows = await db.select().from(roadmaps).where(eq(roadmaps.id, share.roadmapId)).limit(1);
  const rm = rmRows[0];
  if (!rm) throw notFound('规划不存在');

  const tasks = await getTasksOfRoadmap(share.roadmapId);
  const publicTasks: SharedRoadmapTaskDTO[] = tasks.map((t) => ({
    title: t.title,
    semester: t.semester,
    status: t.status,
    estimatedHours: t.estimatedHours,
    priority: t.priority,
    deliverable: t.deliverable,
    acceptanceCriteria: t.acceptanceCriteria,
  }));

  return {
    targetRole: rm.targetRole,
    version: rm.version,
    weeklyHours: rm.weeklyHours,
    careerPath: rm.careerPath as CareerPath,
    status: rm.status as RoadmapStatus,
    engine: rm.engine as Engine,
    content: rm.content as unknown as RoadmapResult,
    tasks: publicTasks,
    sharedAt: share.createdAt,
    expiresAt: share.expiresAt,
  };
}
