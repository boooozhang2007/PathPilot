// 档案路由：个人资料 / 技能 / 经历 / 账号（PRD §9）
import type { FastifyInstance } from 'fastify';
import { profilePatchInput, profileSkillInput, experienceInput, experienceUpdate } from '@pathpilot/shared';
import { getUserId } from '../auth/index.js';
import {
  getProfile,
  upsertProfile,
  listProfileSkills,
  upsertProfileSkill,
  deleteProfileSkill,
  getSkillCatalog,
  listExperiences,
  createExperience,
  updateExperience,
  deleteExperience,
  deleteAccount,
} from '../services/profileService.js';
import { badRequest } from '../services/errors.js';

export async function profileRoutes(app: FastifyInstance): Promise<void> {
  const auth = app.authPreHandler;

  app.get('/api/profile', { preHandler: [auth] }, async (req) => getProfile(getUserId(req)));

  app.put('/api/profile', { preHandler: [auth] }, async (req) => {
    const input = profilePatchInput.parse(req.body);
    return upsertProfile(getUserId(req), input);
  });

  app.get('/api/profile/export', { preHandler: [auth] }, async (req) => {
    const userId = getUserId(req);
    const [profile, skills, experiences] = await Promise.all([getProfile(userId), listProfileSkills(userId), listExperiences(userId)]);
    return { exportedAt: new Date().toISOString(), profile, skills, experiences };
  });

  app.delete('/api/account', { preHandler: [auth] }, async (req) => {
    await deleteAccount(getUserId(req));
    return { ok: true };
  });

  // ---------- 技能 ----------
  app.get('/api/skills', { preHandler: [auth] }, async (req) => listProfileSkills(getUserId(req)));

  app.get('/api/skills/catalog', { preHandler: [auth] }, async () => getSkillCatalog());

  app.post('/api/skills', { preHandler: [auth] }, async (req) => {
    const input = profileSkillInput.parse(req.body);
    await upsertProfileSkill(getUserId(req), input);
    return { ok: true };
  });

  app.patch('/api/skills/:id', { preHandler: [auth] }, async (req) => {
    const { id } = req.params as { id: string };
    const input = profileSkillInput.partial().parse(req.body);
    if (!Object.keys(input).length) throw badRequest('无更新字段');
    const userId = getUserId(req);
    // 技能名变化 → 重建条目；其余字段就地更新（走统一 upsert 语义）
    const existing = (await listProfileSkills(userId)).find((s) => s.id === Number(id));
    if (!existing) throw badRequest('技能记录不存在');
    const writtenId = await upsertProfileSkill(userId, {
      skillName: input.skillName ?? existing.name,
      level: input.level ?? existing.level,
      evidenceStatus: input.evidenceStatus ?? existing.evidenceStatus,
      evidenceDescription: input.evidenceDescription ?? existing.evidenceDescription ?? undefined,
      evidenceUrl: input.evidenceUrl ?? existing.evidenceUrl ?? undefined,
    });
    // 仅当新名落到另一条记录时才删除旧行；别名归一化命中同一行时（id 相同）不能删，否则整条记录丢失
    if (input.skillName && input.skillName !== existing.name && writtenId !== existing.id) {
      await deleteProfileSkill(userId, existing.id);
    }
    return { ok: true };
  });

  app.delete('/api/skills/:id', { preHandler: [auth] }, async (req) => {
    const { id } = req.params as { id: string };
    await deleteProfileSkill(getUserId(req), Number(id));
    return { ok: true };
  });

  // ---------- 经历 ----------
  app.get('/api/experiences', { preHandler: [auth] }, async (req) => {
    const { type } = req.query as { type?: string };
    return listExperiences(getUserId(req), type);
  });

  app.post('/api/experiences', { preHandler: [auth] }, async (req) => {
    const input = experienceInput.parse(req.body);
    return createExperience(getUserId(req), input as never);
  });

  app.patch('/api/experiences/:id', { preHandler: [auth] }, async (req) => {
    const { id } = req.params as { id: string };
    const input = experienceUpdate.parse(req.body);
    return updateExperience(getUserId(req), Number(id), input as never);
  });

  app.delete('/api/experiences/:id', { preHandler: [auth] }, async (req) => {
    const { id } = req.params as { id: string };
    await deleteExperience(getUserId(req), Number(id));
    return { ok: true };
  });
}
