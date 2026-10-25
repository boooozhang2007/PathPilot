// Drizzle schema — PRD §8 全部表 + users/会话表（SQLite，时间戳为 UTC ISO 文本，JSON 存 text）
import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';

const isoNow = () => new Date().toISOString();

export const users = sqliteTable(
  'users',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    createdAt: text('created_at').notNull().$defaultFn(isoNow),
    updatedAt: text('updated_at').notNull().$defaultFn(isoNow),
  },
  (t) => [uniqueIndex('users_email_uq').on(t.email)]
);

export const profiles = sqliteTable(
  'profiles',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    nickname: text('nickname').notNull(),
    school: text('school'),
    major: text('major'),
    grade: text('grade').notNull().default('sophomore'),
    graduationDate: text('graduation_date'),
    targetRole: text('target_role'),
    careerPath: text('career_path').notNull().default('undecided'),
    weeklyHours: integer('weekly_hours').notNull().default(8),
    /** MBTI 人格类型（16 型，如 INTJ）；未测为 null */
    mbti: text('mbti'),
    /** 头像 data URL（base64）；未设置为 null */
    avatar: text('avatar'),
    createdAt: text('created_at').notNull().$defaultFn(isoNow),
    updatedAt: text('updated_at').notNull().$defaultFn(isoNow),
  },
  (t) => [uniqueIndex('profiles_user_uq').on(t.userId)]
);

/** 技能词典（全局共享，含归一化别名，PRD 8.2） */
export const skills = sqliteTable(
  'skills',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    category: text('category').notNull(),
    aliases: text('aliases', { mode: 'json' }).$type<string[]>().notNull().default([]),
    createdAt: text('created_at').notNull().$defaultFn(isoNow),
  },
  (t) => [uniqueIndex('skills_name_uq').on(t.name)]
);

export const profileSkills = sqliteTable(
  'profile_skills',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    skillId: integer('skill_id').notNull().references(() => skills.id),
    level: integer('level').notNull().default(1), // 0-5
    evidenceStatus: text('evidence_status').notNull().default('unevaluated'),
    evidenceDescription: text('evidence_description'),
    evidenceUrl: text('evidence_url'),
    updatedAt: text('updated_at').notNull().$defaultFn(isoNow),
  },
  (t) => [uniqueIndex('profile_skills_uq').on(t.userId, t.skillId)]
);

export const experiences = sqliteTable(
  'experiences',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(), // course|project|contest|internship|practice
    title: text('title').notNull(),
    description: text('description'),
    technologies: text('technologies', { mode: 'json' }).$type<string[]>().notNull().default([]),
    role: text('role'),
    startDate: text('start_date'),
    endDate: text('end_date'),
    result: text('result'),
    evidenceUrl: text('evidence_url'),
    createdAt: text('created_at').notNull().$defaultFn(isoNow),
    updatedAt: text('updated_at').notNull().$defaultFn(isoNow),
  },
  (t) => [index('experiences_user_idx').on(t.userId, t.type)]
);

export const jobSources = sqliteTable(
  'job_sources',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id'), // 手动输入/实时分析归属用户；预置库为 null（全局共享）
    analysisId: integer('analysis_id'),
    title: text('title').notNull(),
    company: text('company'),
    location: text('location'),
    employmentType: text('employment_type'),
    educationRequirement: text('education_requirement'),
    experienceRequirement: text('experience_requirement'),
    description: text('description'),
    sourceUrl: text('source_url'),
    sourceType: text('source_type').notNull(), // web|manual|preset
    fetchedAt: text('fetched_at').notNull(),
    contentHash: text('content_hash').notNull(),
    parseStatus: text('parse_status').notNull().default('pending'),
    createdAt: text('created_at').notNull().$defaultFn(isoNow),
  },
  (t) => [index('job_sources_hash_idx').on(t.contentHash), index('job_sources_analysis_idx').on(t.analysisId)]
);

export const jobRequirements = sqliteTable(
  'job_requirements',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    jobSourceId: integer('job_source_id').notNull().references(() => jobSources.id, { onDelete: 'cascade' }),
    skillId: integer('skill_id'),
    originalText: text('original_text').notNull(),
    requirementType: text('requirement_type').notNull(), // skill|education|experience|responsibility|soft|bonus
    importance: text('importance').notNull().default('medium'), // high|medium|low
    evidenceText: text('evidence_text'),
  },
  (t) => [index('job_requirements_source_idx').on(t.jobSourceId)]
);

export const roadmaps = sqliteTable(
  'roadmaps',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    parentVersionId: integer('parent_version_id'),
    targetRole: text('target_role').notNull(),
    careerPath: text('career_path').notNull(),
    weeklyHours: integer('weekly_hours').notNull(),
    status: text('status').notNull().default('draft'), // draft|active|archived
    generationReason: text('generation_reason'),
    engine: text('engine').notNull().default('rules'),
    /** PRD §6.4 规划结构（semesters/goal/assumptions/risks/evidence_refs 等） */
    content: text('content', { mode: 'json' }).notNull(),
    createdAt: text('created_at').notNull().$defaultFn(isoNow),
  },
  (t) => [uniqueIndex('roadmaps_user_version_uq').on(t.userId, t.version)]
);

export const roadmapTasks = sqliteTable(
  'roadmap_tasks',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    roadmapId: integer('roadmap_id').notNull().references(() => roadmaps.id, { onDelete: 'cascade' }),
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    semester: integer('semester').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    estimatedHours: integer('estimated_hours').notNull(),
    priority: text('priority').notNull().default('medium'),
    status: text('status').notNull().default('not_started'),
    prerequisites: text('prerequisites', { mode: 'json' }).$type<string[]>().notNull().default([]),
    deliverable: text('deliverable'),
    acceptanceCriteria: text('acceptance_criteria'),
    relatedSkills: text('related_skills', { mode: 'json' }).$type<string[]>().notNull().default([]),
    completedAt: text('completed_at'),
    actualHours: integer('actual_hours'),
    evidenceUrl: text('evidence_url'),
    resultNote: text('result_note'),
    deferredReason: text('deferred_reason'),
    createdAt: text('created_at').notNull().$defaultFn(isoNow),
    updatedAt: text('updated_at').notNull().$defaultFn(isoNow),
  },
  (t) => [index('roadmap_tasks_user_idx').on(t.userId), index('roadmap_tasks_roadmap_idx').on(t.roadmapId)]
);

export const jobAnalyses = sqliteTable(
  'job_analyses',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    targetRole: text('target_role').notNull(),
    city: text('city'),
    employmentType: text('employment_type').notNull().default('internship'),
    sampleCount: integer('sample_count').notNull().default(0),
    /** PRD §6.4 岗位分析结构 */
    result: text('result', { mode: 'json' }).notNull(),
    engine: text('engine').notNull().default('rules'),
    createdAt: text('created_at').notNull().$defaultFn(isoNow),
  },
  (t) => [index('job_analyses_user_idx').on(t.userId)]
);

export const agentRuns = sqliteTable(
  'agent_runs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    taskType: text('task_type').notNull(),
    status: text('status').notNull().default('running'), // running|succeeded|failed
    inputSummary: text('input_summary'),
    errorCode: text('error_code'),
    resultType: text('result_type'), // job_analysis|roadmap
    resultId: integer('result_id'),
    errorDetail: text('error_detail'),
    startedAt: text('started_at').notNull().$defaultFn(isoNow),
    finishedAt: text('finished_at'),
  },
  (t) => [index('agent_runs_user_idx').on(t.userId, t.status)]
);

export const agentChatSessions = sqliteTable(
  'agent_chat_sessions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    /** 用户自定义标题（App 端重命名）；空则展示首条用户消息摘要 */
    title: text('title'),
    createdAt: text('created_at').notNull().$defaultFn(isoNow),
    updatedAt: text('updated_at').notNull().$defaultFn(isoNow),
  },
  (t) => [index('agent_chat_sessions_user_idx').on(t.userId)]
);

export const agentChatMessages = sqliteTable(
  'agent_chat_messages',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sessionId: integer('session_id').notNull().references(() => agentChatSessions.id, { onDelete: 'cascade' }),
    role: text('role').notNull(), // user|assistant
    content: text('content').notNull(),
    engine: text('engine'),
    /** 工具调用链路 [{name, summary}]（LLM 通道） */
    toolCalls: text('tool_calls', { mode: 'json' }).$type<{ name: string; summary: string }[] | null>(),
    createdAt: text('created_at').notNull().$defaultFn(isoNow),
  },
  (t) => [index('agent_chat_messages_session_idx').on(t.sessionId)]
);

/** 运行时应用设置（key-value；LLM baseUrl/key/model 由管理页写入，覆盖 .env） */
export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).notNull(),
  updatedAt: text('updated_at').notNull().$defaultFn(isoNow),
});
