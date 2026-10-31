// 全局枚举与展示标签（三端共享）

export const GRADES = ['freshman', 'sophomore', 'junior', 'senior', 'graduate', 'phd', 'postdoc', 'other'] as const;
export type Grade = (typeof GRADES)[number];
export const GRADE_LABELS: Record<Grade, string> = {
  freshman: '大一',
  sophomore: '大二',
  junior: '大三',
  senior: '大四',
  graduate: '研究生',
  phd: '博士',
  postdoc: '博士后',
  other: '其他',
};

/** MBTI 四维度（E/I、S/N、T/F、J/P），组合成 16 型人格 */
export const MBTI_DIMENSIONS = [
  { key: 'EI', options: ['E', 'I'], labels: ['外向 E', '内向 I'], dim: '精力方向' },
  { key: 'SN', options: ['S', 'N'], labels: ['实感 S', '直觉 N'], dim: '信息获取' },
  { key: 'TF', options: ['T', 'F'], labels: ['思考 T', '情感 F'], dim: '决策方式' },
  { key: 'JP', options: ['J', 'P'], labels: ['判断 J', '知觉 P'], dim: '生活方式' },
] as const;
export const MBTI_RE = /^[EI][SN][TF][JP]$/;

export const CAREER_PATHS = ['employment', 'graduate_school', 'undecided'] as const;
export type CareerPath = (typeof CAREER_PATHS)[number];
export const CAREER_PATH_LABELS: Record<CareerPath, string> = {
  employment: '直接就业',
  graduate_school: '考研',
  undecided: '暂未确定',
};

export const TASK_STATUSES = ['not_started', 'in_progress', 'done', 'deferred'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  not_started: '未开始',
  in_progress: '进行中',
  done: '已完成',
  deferred: '已延期',
};

export const PRIORITIES = ['high', 'medium', 'low'] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PRIORITY_LABELS: Record<Priority, string> = {
  high: '高',
  medium: '中',
  low: '低',
};

/** 个人能力证据状态（PRD 4.3） */
export const EVIDENCE_STATUSES = ['evidenced', 'to_verify', 'needs_improvement', 'unevaluated'] as const;
export type EvidenceStatus = (typeof EVIDENCE_STATUSES)[number];
export const EVIDENCE_STATUS_LABELS: Record<EvidenceStatus, string> = {
  evidenced: '已有证据',
  to_verify: '待验证',
  needs_improvement: '需要提升',
  unevaluated: '未评估',
};

/** 技能分类（PRD 4.3） */
export const SKILL_CATEGORIES = [
  'language',
  'algorithms',
  'database',
  'framework',
  'system_design',
  'testing',
  'project',
  'soft',
] as const;
export type SkillCategory = (typeof SKILL_CATEGORIES)[number];
export const SKILL_CATEGORY_LABELS: Record<SkillCategory, string> = {
  language: '编程语言',
  algorithms: '数据结构与算法',
  database: '数据库',
  framework: '框架与开发工具',
  system_design: '系统设计',
  testing: '测试与部署',
  project: '项目开发能力',
  soft: '沟通与协作能力',
};

/** 技能大组：通用能力（软素质）/ 专业能力（技术）——界面与 Agent 提示词统一使用 */
export type SkillGroup = 'general' | 'professional';
export const SKILL_GROUP_LABELS: Record<SkillGroup, string> = {
  general: '通用能力',
  professional: '专业能力',
};
export function skillGroupOf(category: string): SkillGroup {
  return category === 'soft' ? 'general' : 'professional';
}

/** 岗位要求类型（PRD 4.2） */
export const REQUIREMENT_TYPES = [
  'skill',
  'education',
  'experience',
  'responsibility',
  'soft',
  'bonus',
] as const;
export type RequirementType = (typeof REQUIREMENT_TYPES)[number];
export const REQUIREMENT_TYPE_LABELS: Record<RequirementType, string> = {
  skill: '技术技能',
  education: '学历要求',
  experience: '经验要求',
  responsibility: '职责要求',
  soft: '通用能力',
  bonus: '加分项',
};

/** 岗位样本来源类型（PRD 4.2：必须标明数据来源类型） */
export const SOURCE_TYPES = ['web', 'manual', 'preset'] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];
export const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  web: '实时抓取',
  manual: '手动输入',
  preset: '预置样本库',
};

export const PARSE_STATUSES = ['ok', 'failed', 'pending'] as const;
export type ParseStatus = (typeof PARSE_STATUSES)[number];

/** 经历类型（PRD 8.4：课程/项目/竞赛/实习/实践） */
export const EXPERIENCE_TYPES = ['course', 'project', 'contest', 'internship', 'practice'] as const;
export type ExperienceType = (typeof EXPERIENCE_TYPES)[number];
export const EXPERIENCE_TYPE_LABELS: Record<ExperienceType, string> = {
  course: '课程',
  project: '项目',
  contest: '竞赛',
  internship: '实习',
  practice: '实践',
};

export const ROADMAP_STATUSES = ['draft', 'active', 'archived'] as const;
export type RoadmapStatus = (typeof ROADMAP_STATUSES)[number];

export const AGENT_RUN_STATUSES = ['queued', 'running', 'succeeded', 'failed', 'canceled'] as const;
export type AgentRunStatus = (typeof AGENT_RUN_STATUSES)[number];

/** 生成引擎：Pi LLM 通道 / 规则引擎降级通道 */
export const ENGINES = ['pi-llm', 'rules'] as const;
export type Engine = (typeof ENGINES)[number];
export const ENGINE_LABELS: Record<Engine, string> = {
  'pi-llm': 'AI 模型',
  rules: '规则引擎',
};

export const EMPLOYMENT_TYPES = ['internship', 'full_time'] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];
export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  internship: '实习',
  full_time: '正式就业',
};

/** 统一错误码（PRD 7.4 + 常规） */
export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'TIMEOUT',
  'NETWORK_ERROR',
  'SEARCH_FAILED',
  'MODEL_CALL_FAILED',
  'AGENT_OUTPUT_INVALID',
  'DB_WRITE_FAILED',
  'BUDGET_EXCEEDED',
  'SAMPLE_INSUFFICIENT',
  'INTERNAL_ERROR',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  VALIDATION_ERROR: '输入参数不合法',
  UNAUTHORIZED: '未登录或登录已过期',
  FORBIDDEN: '没有权限执行此操作',
  NOT_FOUND: '资源不存在',
  CONFLICT: '数据已被其他设备修改，请刷新后重试',
  RATE_LIMITED: '操作过于频繁，请稍后再试',
  TIMEOUT: '任务执行超时',
  NETWORK_ERROR: '网络不可用',
  SEARCH_FAILED: '搜索服务失败',
  MODEL_CALL_FAILED: '模型调用失败',
  AGENT_OUTPUT_INVALID: '模型输出不合法',
  DB_WRITE_FAILED: '数据写入失败',
  BUDGET_EXCEEDED: '规划时间预算超限',
  SAMPLE_INSUFFICIENT: '岗位样本不足',
  INTERNAL_ERROR: '服务器内部错误',
};

/** 统一错误响应格式（PRD §9） */
export interface ApiErrorBody {
  error: { code: ErrorCode; message: string; details?: unknown };
}

/** 提醒类型（reminders.type） */
export const REMINDER_TYPES = ['task_due', 'weekly_summary'] as const;
export type ReminderType = (typeof REMINDER_TYPES)[number];

/** Agent 业务任务类型（agent_runs.task_type） */
export const AGENT_TASK_TYPES = [
  'analyze_jobs',
  'generate_roadmap',
  'revise_roadmap',
  'chat',
  'resume_draft',
] as const;
export type AgentTaskType = (typeof AGENT_TASK_TYPES)[number];
