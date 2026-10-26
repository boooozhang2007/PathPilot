// Zod schema：API 输入校验 + Agent 输出校验（PRD §6.4）
// 所有用于前端展示的核心业务结果必须是结构化 JSON，经这些 schema 校验后方可落库/返回
import { z } from 'zod';
import {
  CAREER_PATHS,
  EVIDENCE_STATUSES,
  EXPERIENCE_TYPES,
  GRADES,
  MBTI_RE,
  PRIORITIES,
  SOURCE_TYPES,
  TASK_STATUSES,
  EMPLOYMENT_TYPES,
} from './enums';

// ---------- 通用 ----------
export const idSchema = z.number().int().positive();
export const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式应为 YYYY-MM-DD');

// ---------- 认证 ----------
export const registerInput = z.object({
  email: z.string().email('邮箱格式不正确'),
  password: z.string().min(8, '密码至少 8 位').max(72),
  nickname: z.string().min(1, '昵称不能为空').max(30),
});
export type RegisterInput = z.infer<typeof registerInput>;

export const loginInput = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginInput>;

// ---------- 个人资料（PRD 4.1 / 8.1） ----------
export const profileInput = z.object({
  nickname: z.string().min(1).max(30),
  school: z.string().max(50).optional(),
  major: z.string().max(50).optional(),
  grade: z.enum(GRADES),
  graduationDate: dateString,
  targetRole: z.string().min(1, '目标岗位不能为空').max(50),
  careerPath: z.enum(CAREER_PATHS),
  weeklyHours: z.number().int().min(1).max(80),
  /** MBTI 人格类型（16 型，如 INTJ）；未测可为空 */
  mbti: z.string().regex(MBTI_RE, 'MBTI 格式应为 4 位（如 INTJ）').nullable().optional(),
  /** 头像（data:image/... base64，≤512KB）；null 清除头像 */
  avatar: z.string().max(760_000).nullable().optional(),
});
export type ProfileInput = z.infer<typeof profileInput>;
/** 局部资料更新：头像、昵称等可以独立保存，不要求同时填写其它资料。 */
export const profilePatchInput = profileInput.partial();
export type ProfilePatchInput = z.infer<typeof profilePatchInput>;

// ---------- 技能档案（PRD 8.3） ----------
export const profileSkillInput = z.object({
  skillName: z.string().min(1).max(60),
  level: z.number().int().min(0).max(5),
  evidenceStatus: z.enum(EVIDENCE_STATUSES),
  evidenceDescription: z.string().max(500).optional(),
  evidenceUrl: z.string().url().optional(),
});
export const profileSkillUpdate = profileSkillInput.partial();

// ---------- 经历档案（PRD 8.4） ----------
export const experienceInput = z.object({
  type: z.enum(EXPERIENCE_TYPES),
  title: z.string().min(1).max(100),
  description: z.string().max(2000).optional(),
  technologies: z.array(z.string().max(40)).max(20).default([]),
  role: z.string().max(60).optional(),
  startDate: dateString.optional(),
  endDate: dateString.optional(),
  result: z.string().max(500).optional(),
  evidenceUrl: z.string().url().optional(),
});
export const experienceUpdate = experienceInput.partial();

// ---------- 岗位分析（PRD 4.2 / 6.4） ----------
export const jobAnalyzeInput = z.object({
  targetRole: z.string().min(1).max(50),
  city: z.string().max(30).optional(),
  employmentType: z.enum(EMPLOYMENT_TYPES).default('internship'),
  educationFilter: z.string().max(20).optional(),
  /** 期望采集样本数上限 */
  sampleLimit: z.number().int().min(3).max(30).default(18),
});
export type JobAnalyzeInput = z.infer<typeof jobAnalyzeInput>;

export const manualJobInput = z.object({
  targetRole: z.string().min(1).max(50),
  title: z.string().min(1).max(100),
  company: z.string().max(60).optional(),
  location: z.string().max(30).optional(),
  employmentType: z.enum(EMPLOYMENT_TYPES).default('internship'),
  description: z.string().min(30, '岗位描述至少 30 字').max(8000),
  sourceUrl: z.string().url().optional(),
});

/** 单条岗位样本（PRD 4.2 数据字段） */
export const jobSampleSchema = z.object({
  title: z.string(),
  company: z.string().nullable(),
  location: z.string().nullable(),
  employment_type: z.enum(EMPLOYMENT_TYPES),
  education_requirement: z.string().nullable(),
  experience_requirement: z.string().nullable(),
  skills: z.array(z.string()),
  description: z.string(),
  source_url: z.string().nullable(),
  fetched_at: z.string(),
  source_type: z.enum(SOURCE_TYPES),
  relevance_score: z.number().min(0).max(100).optional(),
  content_quality_score: z.number().min(0).max(100).optional(),
  dedupe_key: z.string().optional(),
});
export type JobSample = z.infer<typeof jobSampleSchema>;

/** Agent 岗位分析结果（PRD 6.4） */
export const jobAnalysisResult = z.object({
  target_role: z.string(),
  sample_count: z.number().int().min(0),
  skills: z.array(
    z.object({
      name: z.string(),
      category: z.string(),
      count: z.number().int().min(1),
      frequency: z.number().min(0).max(1),
      required: z.boolean(),
      original_terms: z.array(z.string()).default([]),
    })
  ),
  education_requirements: z.array(z.object({ label: z.string(), count: z.number().int(), ratio: z.number() })),
  experience_requirements: z.array(z.object({ label: z.string(), count: z.number().int(), ratio: z.number() })),
  sources: z.array(
    z.object({
      title: z.string(),
      source_url: z.string().nullable(),
      source_type: z.enum(SOURCE_TYPES),
      parse_status: z.string(),
      fetched_at: z.string(),
      relevance_score: z.number().nullable().optional(),
      content_quality_score: z.number().nullable().optional(),
    })
  ),
  limitations: z.array(z.string()).default([]),
});
export type JobAnalysisResult = z.infer<typeof jobAnalysisResult>;

// ---------- 成长规划（PRD 4.5 / 6.4） ----------
export const semesterSchema = z.object({
  /** 学期序号：1=大一上 … 8=大四下；剩余学期从当前年级起 */
  index: z.number().int().min(1).max(12),
  label: z.string(),
  goal: z.string(),
  focus_skills: z.array(z.string()).default([]),
  recommended_courses: z.array(z.string()).default([]),
  milestone: z.string(),
  estimated_hours: z.number().min(0),
});
export type SemesterPlan = z.infer<typeof semesterSchema>;

export const roadmapTaskSchema = z.object({
  title: z.string().min(1),
  parent_task_id: z.number().int().positive().nullable().optional(),
  semester: z.number().int().min(1).max(12),
  description: z.string().min(1),
  estimated_hours: z.number().min(0.5),
  priority: z.enum(PRIORITIES),
  prerequisites: z.array(z.string()).default([]),
  deliverable: z.string().min(1),
  acceptance_criteria: z.string().min(1),
  related_skills: z.array(z.string()).default([]),
  status: z.enum(TASK_STATUSES).default('not_started'),
});
export type RoadmapTaskDraft = z.infer<typeof roadmapTaskSchema>;

/** Agent 成长规划结果（PRD 6.4） */
export const roadmapResult = z.object({
  goal: z.string(),
  assumptions: z.array(z.string()).default([]),
  weekly_hours: z.number().int().min(1).max(80),
  semesters: z.array(semesterSchema).min(1),
  tasks: z.array(roadmapTaskSchema).min(1),
  total_estimated_hours: z.number().min(0),
  risks: z.array(z.string()).default([]),
  evidence_refs: z.array(z.string()).default([]),
});
export type RoadmapResult = z.infer<typeof roadmapResult>;

export const generateRoadmapInput = z.object({
  /** 缺省使用 profile 中的当前值 */
  weeklyHours: z.number().int().min(1).max(80).optional(),
  targetRole: z.string().min(1).max(50).optional(),
  careerPath: z.enum(CAREER_PATHS).optional(),
  jobAnalysisId: z.number().int().positive().optional(),
});
export type GenerateRoadmapInput = z.infer<typeof generateRoadmapInput>;

export const reviseRoadmapInput = z.object({
  weeklyHours: z.number().int().min(1).max(80).optional(),
  targetRole: z.string().min(1).max(50).optional(),
  careerPath: z.enum(CAREER_PATHS).optional(),
  reason: z.string().max(200).optional(),
});
export type ReviseRoadmapInput = z.infer<typeof reviseRoadmapInput>;

// ---------- 任务管理（PRD 4.7） ----------
export const taskUpdateInput = z.object({
  status: z.enum(TASK_STATUSES).optional(),
  actualHours: z.number().min(0).max(500).optional(),
  evidenceUrl: z.string().url().optional(),
  resultNote: z.string().max(500).optional(),
  priority: z.enum(PRIORITIES).optional(),
  /** 乐观锁：客户端读取时的 updated_at（ISO 字符串） */
  expectedUpdatedAt: z.string().datetime().optional(),
  deferredReason: z.string().max(200).optional(),
  // ---- 内容编辑（完成前后均可改，含任务说明） ----
  title: z.string().min(1).max(100).optional(),
  semester: z.number().int().min(1).max(14).optional(),
  description: z.string().min(1).max(2000).optional(),
  estimatedHours: z.number().min(0.5).max(300).optional(),
  deliverable: z.string().max(500).optional(),
  acceptanceCriteria: z.string().max(500).optional(),
  parentTaskId: z.number().int().positive().nullable().optional(),
  taskType: z.enum(['goal', 'milestone', 'task', 'subtask']).optional(),
  dueDate: dateString.nullable().optional(),
  dependencyIds: z.array(z.number().int().positive()).max(30).optional(),
  completionRule: z.enum(['manual', 'all_children', 'percentage']).optional(),
});
export type TaskUpdateInput = z.infer<typeof taskUpdateInput>;

/** 批量删除任务（完成前后均可删） */
export const taskBatchDeleteInput = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(100),
});

export const taskEvidenceInput = z.object({
  evidenceUrl: z.string().url(),
  resultNote: z.string().max(500).optional(),
  actualHours: z.number().min(0).max(500).optional(),
});

// ---------- AI 顾问（PRD 4.8） ----------
export const agentChatInput = z.object({
  sessionId: z.number().int().positive().optional(),
  message: z.string().min(1).max(2000),
  /** 前端选择的模型 id（模型目录见 GET /api/agent/models） */
  model: z.string().max(100).optional(),
  answerStyle: z.enum(['concise', 'detailed']).optional(),
});
export type AgentChatInput = z.infer<typeof agentChatInput>;

/** 会话重命名（App 端历史管理） */
export const agentSessionRenameInput = z.object({
  title: z.string().min(1).max(60),
});
export type AgentSessionRenameInput = z.infer<typeof agentSessionRenameInput>;


// ---------- 能力差距分析（PRD 4.3） ----------
export const skillGapItem = z.object({
  skill: z.string(),
  category: z.string(),
  required: z.boolean(),
  importance: z.enum(['high', 'medium', 'low']),
  user_status: z.enum(EVIDENCE_STATUSES),
  gap: z.boolean(),
  recommendation: z.string().optional(),
});
export type SkillGapItem = z.infer<typeof skillGapItem>;

export const skillGapResult = z.object({
  target_role: z.string(),
  match_score: z.number().min(0).max(100),
  sample_count: z.number().int().min(0),
  core_skills: z.array(skillGapItem),
  learning_order: z.array(z.string()).default([]),
  suggested_projects: z.array(z.string()).default([]),
  rationale: z.string(),
});
export type SkillGapResult = z.infer<typeof skillGapResult>;

// ---------- 简历草稿（PRD 4.9，P1） ----------
export const resumeDraftInput = z.object({
  targetRole: z.string().min(1).max(50),
  experienceIds: z.array(z.number().int().positive()).default([]),
});
export const resumeDraftResult = z.object({
  target_role: z.string(),
  summary: z.string(),
  sections: z.array(
    z.object({
      heading: z.string(),
      items: z.array(z.string()),
    })
  ),
  notes: z.array(z.string()).default([]),
});
export type ResumeDraftResult = z.infer<typeof resumeDraftResult>;

// ---------- 规划差异（PRD 4.6 对比内容） ----------
export const roadmapDiff = z.object({
  added_tasks: z.array(z.string()),
  removed_tasks: z.array(z.string()),
  deferred_tasks: z.array(z.string()),
  priority_changes: z.array(z.object({ title: z.string(), from: z.string(), to: z.string() })),
  hours_change: z.object({ from: z.number(), to: z.number() }),
  milestone_changes: z.array(z.string()),
  reasons: z.array(z.string()),
});
export type RoadmapDiff = z.infer<typeof roadmapDiff>;
