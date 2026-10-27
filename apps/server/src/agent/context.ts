// Agent 授权上下文：组装当前用户的全部业务数据（各模块共享，无框架依赖）
import type { ProfileDTO, ProfileSkillDTO, ExperienceDTO, RoadmapTaskDTO, JobAnalysisDTO } from '@pathpilot/shared';
import { getProfile, listProfileSkills, listExperiences } from '../services/profileService.js';
import { getActiveRoadmap, listRoadmapTasks } from '../services/roadmapService.js';
import { latestAnalysisFor } from '../services/analysisService.js';

export interface UserContext {
  profile: ProfileDTO | null;
  skills: ProfileSkillDTO[];
  experiences: ExperienceDTO[];
  analysis: JobAnalysisDTO | null;
  activeTasks: RoadmapTaskDTO[];
}

export async function buildUserContext(userId: number): Promise<UserContext> {
  const [profile, skills, roadmap] = await Promise.all([getProfile(userId), listProfileSkills(userId), getActiveRoadmap(userId)]);
  const analysis = await latestAnalysisFor(userId, profile?.targetRole);
  const tasks = roadmap ? await listRoadmapTasks(userId, roadmap.id) : [];
  const experiences = await listExperiences(userId);
  return { profile, skills, experiences, analysis, activeTasks: tasks };
}
