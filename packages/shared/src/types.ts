// API 响应 DTO（三端共享）
import type {
  CareerPath,
  EmploymentType,
  Engine,
  EvidenceStatus,
  ExperienceType,
  Grade,
  ParseStatus,
  Priority,
  RequirementType,
  RoadmapStatus,
  SkillCategory,
  SourceType,
  TaskStatus,
  AgentRunStatus,
} from './enums';
import type { JobAnalysisResult, RoadmapResult, RoadmapDiff, SkillGapItem, SkillGapResult } from './schemas';

export interface AuthUser {
  id: number;
  email: string;
  nickname: string;
}

export interface ProfileDTO {
  userId: number;
  nickname: string;
  school: string | null;
  major: string | null;
  grade: Grade;
  graduationDate: string;
  targetRole: string;
  careerPath: CareerPath;
  weeklyHours: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProfileSkillDTO {
  id: number;
  skillId: number;
  name: string;
  category: SkillCategory;
  level: number;
  evidenceStatus: EvidenceStatus;
  evidenceDescription: string | null;
  evidenceUrl: string | null;
  updatedAt: string;
}

export interface ExperienceDTO {
  id: number;
  type: ExperienceType;
  title: string;
  description: string | null;
  technologies: string[];
  role: string | null;
  startDate: string | null;
  endDate: string | null;
  result: string | null;
  evidenceUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SkillCatalogItem {
  id: number;
  name: string;
  category: SkillCategory;
  aliases: string[];
}

export interface JobSourceDTO {
  id: number;
  title: string;
  company: string | null;
  location: string | null;
  employmentType: EmploymentType | null;
  sourceUrl: string | null;
  sourceType: SourceType;
  parseStatus: ParseStatus;
  fetchedAt: string;
  analysisId: number | null;
}

export interface JobAnalysisDTO {
  id: number;
  targetRole: string;
  city: string | null;
  employmentType: EmploymentType;
  sampleCount: number;
  result: JobAnalysisResult;
  engine: Engine;
  createdAt: string;
}

export interface RoadmapTaskDTO {
  id: number;
  roadmapId: number;
  semester: number;
  title: string;
  description: string;
  estimatedHours: number;
  priority: Priority;
  status: TaskStatus;
  prerequisites: string[];
  deliverable: string | null;
  acceptanceCriteria: string | null;
  relatedSkills: string[];
  completedAt: string | null;
  actualHours: number | null;
  evidenceUrl: string | null;
  resultNote: string | null;
  deferredReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RoadmapDTO {
  id: number;
  version: number;
  parentVersionId: number | null;
  targetRole: string;
  careerPath: CareerPath;
  weeklyHours: number;
  status: RoadmapStatus;
  generationReason: string | null;
  engine: Engine;
  content: RoadmapResult;
  createdAt: string;
}

export interface RoadmapVersionSummary {
  id: number;
  version: number;
  weeklyHours: number;
  targetRole: string;
  status: RoadmapStatus;
  generationReason: string | null;
  createdAt: string;
}

export interface AgentRunDTO {
  id: number;
  taskType: string;
  status: AgentRunStatus;
  errorCode: string | null;
  /** 结果引用（如 analysisId / roadmapId），succeeded 时有值 */
  resultRef: { type: string; id: number } | null;
  inputSummary: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface ChatMessageDTO {
  id: number;
  sessionId: number;
  role: 'user' | 'assistant';
  content: string;
  engine: Engine | null;
  createdAt: string;
}

export interface DashboardData {
  profile: ProfileDTO | null;
  matchScore: number | null;
  matchSampleCount: number;
  topGaps: { skill: string; importance: string; userStatus: EvidenceStatus }[];
  currentSemester: { label: string; doneRatio: number; totalTasks: number; doneTasks: number } | null;
  recentTasks: RoadmapTaskDTO[];
  lastReplan: { version: number; createdAt: string; diff: RoadmapDiff } | null;
  activeRoadmapVersion: number | null;
}

export interface GrowthStats {
  semesterCompletionRate: number;
  completedSkills: number;
  completedProjects: number;
  totalTasks: number;
  doneTasks: number;
  deferredTasks: number;
  plannedHours: number;
  actualHours: number;
  upcomingCriticalTasks: RoadmapTaskDTO[];
}

/** 能力差距分析结果（与 skillGapResult schema 同构，snake_case） */
export type SkillGapDTO = SkillGapResult;

export interface ResumeDraftDTO {
  targetRole: string;
  summary: string;
  sections: { heading: string; items: string[] }[];
  notes: string[];
  engine: Engine;
}
