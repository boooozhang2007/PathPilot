// 档案服务：profiles / profile_skills / experiences（所有查询强制 user_id 过滤，等价 RLS）
import { and, eq, desc } from 'drizzle-orm';
import { db } from '../db/client.js';
import { profiles, profileSkills, skills, experiences, users } from '../db/schema.js';
import { notFound } from './errors.js';
import type { ProfileDTO, ProfileSkillDTO, ExperienceDTO, SkillCatalogItem } from '@pathpilot/shared';
import type { Grade, CareerPath } from '@pathpilot/shared';

function toProfileDTO(row: typeof profiles.$inferSelect): ProfileDTO {
  return {
    userId: row.userId,
    nickname: row.nickname,
    school: row.school,
    major: row.major,
    grade: row.grade as Grade,
    graduationDate: row.graduationDate ?? '',
    targetRole: row.targetRole ?? '',
    careerPath: row.careerPath as CareerPath,
    weeklyHours: row.weeklyHours,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function getProfile(userId: number): Promise<ProfileDTO | null> {
  const rows = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  return rows[0] ? toProfileDTO(rows[0]) : null;
}

export async function upsertProfile(userId: number, input: Partial<typeof profiles.$inferInsert>): Promise<ProfileDTO> {
  const existing = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  const now = new Date().toISOString();
  if (existing[0]) {
    const updated = await db
      .update(profiles)
      .set({ ...input, updatedAt: now })
      .where(eq(profiles.userId, userId))
      .returning();
    return toProfileDTO(updated[0]);
  }
  const inserted = await db
    .insert(profiles)
    .values({ userId, nickname: input.nickname ?? '同学', ...input, updatedAt: now })
    .returning();
  return toProfileDTO(inserted[0]);
}

// ---------- 技能词典 ----------
export async function getSkillCatalog(): Promise<SkillCatalogItem[]> {
  const rows = await db.select().from(skills);
  return rows.map((r) => ({ id: r.id, name: r.name, category: r.category as SkillCatalogItem['category'], aliases: r.aliases ?? [] }));
}

export async function findOrCreateTimeSkill(name: string, category: string): Promise<number> {
  const rows = await db.select().from(skills).where(eq(skills.name, name)).limit(1);
  if (rows[0]) return rows[0].id;
  const inserted = await db.insert(skills).values({ name, category, aliases: [] }).returning();
  return inserted[0].id;
}

// ---------- 用户技能档案 ----------
export async function listProfileSkills(userId: number): Promise<ProfileSkillDTO[]> {
  const rows = await db
    .select({ ps: profileSkills, s: skills })
    .from(profileSkills)
    .innerJoin(skills, eq(profileSkills.skillId, skills.id))
    .where(eq(profileSkills.userId, userId));
  return rows.map(({ ps, s }) => ({
    id: ps.id,
    skillId: ps.skillId,
    name: s.name,
    category: s.category as ProfileSkillDTO['category'],
    level: ps.level,
    evidenceStatus: ps.evidenceStatus as ProfileSkillDTO['evidenceStatus'],
    evidenceDescription: ps.evidenceDescription,
    evidenceUrl: ps.evidenceUrl,
    updatedAt: ps.updatedAt,
  }));
}

export async function upsertProfileSkill(
  userId: number,
  input: { skillName: string; level: number; evidenceStatus: string; evidenceDescription?: string; evidenceUrl?: string }
): Promise<void> {
  const catalog = await getSkillCatalog();
  const { buildNormalizer } = await import('./normalize.js');
  const n = buildNormalizer(catalog)(input.skillName);
  const skillId = await findOrCreateTimeSkill(n.matched ? n.canonical : input.skillName.trim(), n.category);
  const now = new Date().toISOString();
  await db
    .insert(profileSkills)
    .values({
      userId,
      skillId,
      level: input.level,
      evidenceStatus: input.evidenceStatus,
      evidenceDescription: input.evidenceDescription ?? null,
      evidenceUrl: input.evidenceUrl ?? null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [profileSkills.userId, profileSkills.skillId],
      set: {
        level: input.level,
        evidenceStatus: input.evidenceStatus,
        evidenceDescription: input.evidenceDescription ?? null,
        evidenceUrl: input.evidenceUrl ?? null,
        updatedAt: now,
      },
    });
}

export async function deleteProfileSkill(userId: number, id: number): Promise<void> {
  const rows = await db.select().from(profileSkills).where(and(eq(profileSkills.id, id), eq(profileSkills.userId, userId))).limit(1);
  if (!rows[0]) throw notFound('技能记录不存在');
  await db.delete(profileSkills).where(and(eq(profileSkills.id, id), eq(profileSkills.userId, userId)));
}

// ---------- 经历档案 ----------
function toExperienceDTO(row: typeof experiences.$inferSelect): ExperienceDTO {
  return {
    id: row.id,
    type: row.type as ExperienceDTO['type'],
    title: row.title,
    description: row.description,
    technologies: row.technologies ?? [],
    role: row.role,
    startDate: row.startDate,
    endDate: row.endDate,
    result: row.result,
    evidenceUrl: row.evidenceUrl,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listExperiences(userId: number, type?: string): Promise<ExperienceDTO[]> {
  const where = type ? and(eq(experiences.userId, userId), eq(experiences.type, type)) : eq(experiences.userId, userId);
  const rows = await db.select().from(experiences).where(where).orderBy(desc(experiences.updatedAt));
  return rows.map(toExperienceDTO);
}

export async function createExperience(userId: number, input: typeof experiences.$inferInsert): Promise<ExperienceDTO> {
  const inserted = await db.insert(experiences).values({ ...input, userId }).returning();
  return toExperienceDTO(inserted[0]);
}

export async function updateExperience(userId: number, id: number, input: Partial<typeof experiences.$inferInsert>): Promise<ExperienceDTO> {
  const updated = await db
    .update(experiences)
    .set({ ...input, updatedAt: new Date().toISOString() })
    .where(and(eq(experiences.id, id), eq(experiences.userId, userId)))
    .returning();
  if (!updated[0]) throw notFound('经历不存在');
  return toExperienceDTO(updated[0]);
}

export async function deleteExperience(userId: number, id: number): Promise<void> {
  const deleted = await db.delete(experiences).where(and(eq(experiences.id, id), eq(experiences.userId, userId))).returning();
  if (!deleted[0]) throw notFound('经历不存在');
}

// ---------- 账号 ----------
export async function deleteAccount(userId: number): Promise<void> {
  await db.delete(users).where(eq(users.id, userId)); // 级联清理关联数据
}
