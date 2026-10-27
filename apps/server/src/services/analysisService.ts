// 岗位分析持久化：job_sources / job_analyses（PRD 4.2/8.5/8.6）
import { createHash } from 'node:crypto';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '../db/client.js';
import { jobSources, jobRequirements, jobAnalyses } from '../db/schema.js';
import { notFound } from './errors.js';
import type { JobAnalysisDTO, JobSourceDTO } from '@pathpilot/shared';
import type { JobAnalysisResult, JobSample, Engine, EmploymentType } from '@pathpilot/shared';

export const contentHash = (text: string): string => createHash('sha256').update(text).digest('hex').slice(0, 32);

/** 事务句柄类型（db.transaction 回调参数） */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface RequirementRow {
  jobSourceId: number;
  skillId?: number | null;
  originalText: string;
  requirementType: string;
  importance: string;
  evidenceText?: string | null;
}

function toAnalysisDTO(row: typeof jobAnalyses.$inferSelect): JobAnalysisDTO {
  return {
    id: row.id,
    targetRole: row.targetRole,
    city: row.city,
    employmentType: row.employmentType as EmploymentType,
    sampleCount: row.sampleCount,
    result: row.result as unknown as JobAnalysisResult,
    engine: row.engine as Engine,
    createdAt: row.createdAt,
  };
}

/**
 * 插入样本（幂等）：按 (user_id, dedupe_key) 唯一约束 onConflictDoNothing，
 * 冲突时复用已有行——分析重试不会重复落库；返回的 id 顺序与入参样本一致。
 */
function insertSamples(tx: Tx, userId: number | null, samples: JobSample[], parseStatus: 'ok' | 'failed'): number[] {
  const rows: (typeof jobSources.$inferInsert)[] = [];
  const seen = new Set<string>();
  for (const s of samples) {
    const hash = contentHash(`${s.title}|${s.company ?? ''}|${s.description.slice(0, 500)}`);
    const dedupeKey = s.dedupe_key ?? (s.source_url ? s.source_url.replace(/\/$/, '').toLowerCase() : hash);
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    rows.push({
      userId,
      title: s.title,
      company: s.company ?? null,
      location: s.location ?? null,
      employmentType: s.employment_type,
      educationRequirement: s.education_requirement ?? null,
      experienceRequirement: s.experience_requirement ?? null,
      description: s.description,
      sourceUrl: s.source_url ?? null,
      sourceType: s.source_type,
      fetchedAt: s.fetched_at,
      contentHash: hash,
      parseStatus,
      relevanceScore: s.relevance_score ?? null,
      contentQualityScore: s.content_quality_score ?? Math.min(100, Math.round((s.description.length / 1200) * 100)),
      dedupeKey,
    });
  }
  if (rows.length) {
    tx.insert(jobSources).values(rows).onConflictDoNothing({ target: [jobSources.userId, jobSources.dedupeKey] }).run();
  }
  const keys = rows.map((r) => r.dedupeKey as string);
  if (!keys.length) return [];
  const owner = userId === null ? isNull(jobSources.userId) : eq(jobSources.userId, userId);
  const found = tx
    .select({ id: jobSources.id, dedupeKey: jobSources.dedupeKey })
    .from(jobSources)
    .where(and(owner, inArray(jobSources.dedupeKey, keys)))
    .all();
  const idByKey = new Map(found.map((r) => [r.dedupeKey as string, r.id]));
  const ids: number[] = [];
  for (const r of rows) {
    const id = idByKey.get(r.dedupeKey as string);
    if (id !== undefined) ids.push(id);
  }
  return ids;
}

function insertAnalysis(tx: Tx, userId: number, input: { targetRole: string; city?: string; employmentType: string; engine: Engine }, result: JobAnalysisResult): JobAnalysisDTO {
  const inserted = tx
    .insert(jobAnalyses)
    .values({
      userId,
      targetRole: input.targetRole,
      city: input.city ?? null,
      employmentType: input.employmentType,
      sampleCount: result.sample_count,
      result: result as never,
      engine: input.engine,
    })
    .returning()
    .get();
  return toAnalysisDTO(inserted);
}

/**
 * 分析结果整体落库（单事务）：样本 → 分析快照 → 样本关联 → 要求明细。
 * 四步任一失败整体回滚，避免半成品数据；样本插入幂等，重试安全。
 */
export async function persistAnalysis(
  userId: number,
  input: { targetRole: string; city?: string; employmentType: string; engine: Engine },
  result: JobAnalysisResult,
  samples: JobSample[],
  buildRequirementRows: (sourceIds: number[]) => RequirementRow[],
  parseStatus: 'ok' | 'failed' = 'ok'
): Promise<JobAnalysisDTO> {
  return db.transaction((tx) => {
    const sourceIds = insertSamples(tx, userId, samples, parseStatus);
    const analysis = insertAnalysis(tx, userId, input, result);
    if (sourceIds.length) tx.update(jobSources).set({ analysisId: analysis.id }).where(inArray(jobSources.id, sourceIds)).run();
    const rows = buildRequirementRows(sourceIds);
    if (rows.length) tx.insert(jobRequirements).values(rows.map((r) => ({ ...r, skillId: r.skillId ?? null, evidenceText: r.evidenceText ?? null }))).run();
    return analysis;
  });
}

/** 仅保存分析快照（无样本，如无有效样本时的空结果上报） */
export async function saveAnalysis(
  userId: number,
  input: { targetRole: string; city?: string; employmentType: string; engine: Engine },
  result: JobAnalysisResult
): Promise<JobAnalysisDTO> {
  const inserted = await db
    .insert(jobAnalyses)
    .values({
      userId,
      targetRole: input.targetRole,
      city: input.city ?? null,
      employmentType: input.employmentType,
      sampleCount: result.sample_count,
      result: result as any,
      engine: input.engine,
    })
    .returning();
  return toAnalysisDTO(inserted[0]);
}

export async function getAnalysis(userId: number, id: number): Promise<JobAnalysisDTO> {
  const rows = await db.select().from(jobAnalyses).where(and(eq(jobAnalyses.id, id), eq(jobAnalyses.userId, userId))).limit(1);
  if (!rows[0]) throw notFound('分析结果不存在');
  const row = rows[0];
  return {
    id: row.id,
    targetRole: row.targetRole,
    city: row.city,
    employmentType: row.employmentType as EmploymentType,
    sampleCount: row.sampleCount,
    result: row.result as unknown as JobAnalysisResult,
    engine: row.engine as Engine,
    createdAt: row.createdAt,
  };
}

export async function latestAnalysis(userId: number): Promise<JobAnalysisDTO | null> {
  const rows = await db.select().from(jobAnalyses).where(eq(jobAnalyses.userId, userId)).orderBy(desc(jobAnalyses.id)).limit(1);
  if (!rows[0]) return null;
  return getAnalysis(userId, rows[0].id);
}

/** 当前目标岗位对应的最近一次分析；没有匹配岗位时返回 null，避免用旧岗位结果算差距 */
export async function latestAnalysisFor(userId: number, targetRole?: string | null): Promise<JobAnalysisDTO | null> {
  const role = targetRole?.trim();
  if (!role) return latestAnalysis(userId);
  const rows = await db
    .select()
    .from(jobAnalyses)
    .where(and(eq(jobAnalyses.userId, userId), eq(jobAnalyses.targetRole, role)))
    .orderBy(desc(jobAnalyses.id))
    .limit(1);
  if (!rows[0]) return null;
  return getAnalysis(userId, rows[0].id);
}

/** 历史分析摘要列表(岗位对比用):最近 N 条 */
export interface AnalysisSummary {
  id: number;
  targetRole: string;
  city: string | null;
  sampleCount: number;
  createdAt: string;
}

export async function listAnalyses(userId: number, limit = 20): Promise<AnalysisSummary[]> {
  const rows = await db
    .select({ id: jobAnalyses.id, targetRole: jobAnalyses.targetRole, city: jobAnalyses.city, sampleCount: jobAnalyses.sampleCount, createdAt: jobAnalyses.createdAt })
    .from(jobAnalyses)
    .where(eq(jobAnalyses.userId, userId))
    .orderBy(desc(jobAnalyses.id))
    .limit(limit);
  return rows;
}

export async function listSources(userId: number, analysisId?: number): Promise<JobSourceDTO[]> {
  // 分析快照必须先验证归属，再读取关联来源。
  let rows;
  if (analysisId) {
    const owned = await db.select({ id: jobAnalyses.id }).from(jobAnalyses).where(and(eq(jobAnalyses.id, analysisId), eq(jobAnalyses.userId, userId))).limit(1);
    if (!owned[0]) throw notFound('分析结果不存在');
    rows = await db.select().from(jobSources).where(and(eq(jobSources.analysisId, analysisId), eq(jobSources.userId, userId))).orderBy(desc(jobSources.fetchedAt));
  } else {
    rows = await db.select().from(jobSources).where(eq(jobSources.userId, userId)).orderBy(desc(jobSources.fetchedAt)).limit(100);
  }
  return rows.map(toSourceDTO);
}

export async function presetSamplesFor(targetRole: string, employmentType: string, limit: number): Promise<JobSample[]> {
  // 从预置库（source_type=preset）读取匹配岗位样本；技能从 job_requirements 还原
  const all = await db.select().from(jobSources).where(eq(jobSources.sourceType, 'preset')).limit(500);
  const key = (s: string) => s.toLowerCase();
  const role = targetRole.toLowerCase();
  const firstRoleWord = role.split(/[\s/]+/)[0] ?? role;
  const matched = all.filter((r) => {
    const titleHit = key(r.title).includes(firstRoleWord) || firstRoleWord.includes(key(r.title).split(/[\s/]+/)[0] ?? '');
    const typeHit = !r.employmentType || r.employmentType === employmentType;
    return titleHit && typeHit;
  });
  // 只补充与目标岗位匹配的预置样本；没有匹配时如实返回空，绝不混入其它岗位
  const pool = matched.slice(0, limit);
  if (!pool.length) return [];
  const reqRows = await db
    .select()
    .from(jobRequirements)
    .where(inArray(jobRequirements.jobSourceId, pool.map((r) => r.id)));
  const skillsBySource = new Map<number, string[]>();
  for (const rq of reqRows) {
    if (rq.requirementType !== 'skill') continue;
    const list = skillsBySource.get(rq.jobSourceId) ?? [];
    list.push(rq.originalText);
    skillsBySource.set(rq.jobSourceId, list);
  }
  return pool.map((r) => ({
    title: r.title,
    company: r.company,
    location: r.location,
    employment_type: (r.employmentType ?? 'internship') as EmploymentType,
    education_requirement: r.educationRequirement,
    experience_requirement: r.experienceRequirement,
    skills: skillsBySource.get(r.id) ?? [],
    description: r.description ?? '',
    source_url: r.sourceUrl,
    fetched_at: r.fetchedAt,
    source_type: 'preset' as const,
  }));
}

function toSourceDTO(row: typeof jobSources.$inferSelect): JobSourceDTO {
  return {
    id: row.id,
    title: row.title,
    company: row.company,
    location: row.location,
    employmentType: (row.employmentType ?? null) as JobSourceDTO['employmentType'],
    sourceUrl: row.sourceUrl,
    sourceType: row.sourceType as JobSourceDTO['sourceType'],
    parseStatus: row.parseStatus as JobSourceDTO['parseStatus'],
    fetchedAt: row.fetchedAt,
    analysisId: row.analysisId,
    relevanceScore: row.relevanceScore ?? null,
    contentQualityScore: row.contentQualityScore ?? null,
    dedupeKey: row.dedupeKey ?? null,
  };
}
