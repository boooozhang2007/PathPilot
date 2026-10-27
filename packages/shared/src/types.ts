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
  /** MBTI 人格类型（如 INTJ），未设置为 null */
  mbti: string | null;
  /** 头像 data URL（base64），未设置为 null */
  avatar: string | null;
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
  relevanceScore: number | null;
  contentQualityScore: number | null;
  dedupeKey: string | null;
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
  parentTaskId: number | null;
  taskType: 'goal' | 'milestone' | 'task' | 'subtask';
  sortOrder: number;
  dueDate: string | null;
  dependencyIds: number[];
  completionRule: 'manual' | 'all_children' | 'percentage';
  childCount?: number;
  completedChildCount?: number;
  progressPercent?: number;
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
  /** 失败详情（服务端返回，前端可直接展示） */
  errorDetail: string | null;
  /** 结果引用（如 analysisId / roadmapId），succeeded 时有值 */
  resultRef: { type: string; id: number } | null;
  inputSummary: string | null;
  startedAt: string;
  finishedAt: string | null;
  progress: number;
  progressMessage: string | null;
}

export interface ChatMessageDTO {
  id: number;
  sessionId: number;
  role: 'user' | 'assistant';
  content: string;
  engine: Engine | null;
  /** 思考过程内容（DeepSeek 思考链） */
  thinking?: string | null;
  /** 本次回复失败/被停止时的错误码（正常回复为 null） */
  errorCode?: string | null;
  /** 工具调用链路（LLM 通道）：[{name, summary}] */
  toolCalls: { name: string; summary: string }[];
  createdAt: string;
}

export type AgentFlowState = 'profile_check' | 'profile_collect' | 'advice_intent_select' | 'intent_confirm' | 'tool_execution' | 'result_review' | 'next_action';
export type AdviceIntent = 'job_insight' | 'skill_gap' | 'roadmap' | 'task_breakdown' | 'resume' | 'interview';
export interface AgentFlowDTO {
  state: AgentFlowState;
  missingProfileFields: string[];
  selectedIntent: AdviceIntent | null;
  nextActions: { id: AdviceIntent | 'profile'; label: string }[];
}

/** 顾问会话摘要（侧栏列表项） */
export interface ChatSessionSummaryDTO {
  id: number;
  title: string;
  messageCount: number;
  updatedAt: string;
  flowState?: string;
  selectedIntent?: string | null;
}

export interface DashboardData {
  profile: ProfileDTO | null;
  matchScore: number | null;
  matchSampleCount: number;
  /** 岗位需求能力（最新岗位分析的高频技能，按 frequency 降序） */
  jobSkills: { name: string; category: string; frequency: number; required: boolean }[];
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
