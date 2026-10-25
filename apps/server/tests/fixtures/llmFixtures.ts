// 集成测试用确定性 LLM mock：规则引擎兜底已移除，规划/简历/抽取改为注入固定合法结果
// （无网络依赖；RoadmapResult 结构保证能通过 validateRoadmap 的时间预算/依赖校验）

const task = (title: string, semester: number, status: 'not_started' | 'done' = 'not_started') => ({
  title,
  semester,
  description:
    '详细说明：按《Java 核心技术》对应章节推进，完成章后练习并提交到 Git 仓库。例子：实现一个控制台图书管理小项目（实体建模 + 增删改查 + 单元测试）。',
  estimated_hours: 20,
  priority: 'medium' as const,
  prerequisites: [] as string[],
  deliverable: 'GitHub 仓库链接',
  acceptance_criteria: '全部单元测试通过且 README 完整',
  related_skills: ['Java'],
  status,
});

export const GEN_ROADMAP = {
  goal: '测试：Java 后端方向成长',
  assumptions: [],
  weekly_hours: 10,
  semesters: [3, 4, 5, 6, 7, 8].map((i) => ({
    index: i,
    label: `第${Math.ceil(i / 2)}学年 ${i % 2 === 1 ? '上' : '下'}学期`,
    goal: '打基础',
    focus_skills: ['Java'],
    recommended_courses: [],
    milestone: '完成阶段项目',
    estimated_hours: 40,
  })),
  tasks: [task('任务3', 3), task('任务4', 4), task('任务5', 5), task('任务6', 6)],
  total_estimated_hours: 80,
  risks: [],
  evidence_refs: [],
};

/** 重规划结果：保留任务3（done，延续成果），新增任务5，移除任务4 —— 体现“可自由调整” */
export const REVISE_ROADMAP = {
  ...GEN_ROADMAP,
  tasks: [task('任务3', 3, 'done'), task('任务5', 5)],
};

export const RESUME_DRAFT = {
  target_role: 'Java 后端开发',
  summary: '计算机专业学生，完成多个真实项目。',
  sections: [{ heading: '项目经历', items: ['图书管理系统：Spring Boot + MySQL，实现增删改查（附仓库链接）'] }],
  notes: [],
};

/** 替换 pi/runtime.js 的 runStructuredAgent：按 prompt 特征回放固定结果 */
export const runtimeMock = {
  runStructuredAgent: async (opts: { prompt?: string; schema: { parse: (d: unknown) => unknown } }) => {
    const p = opts.prompt ?? '';
    if (p.includes('生成分学期成长规划')) {
      const data = p.includes('当前规划任务') ? REVISE_ROADMAP : GEN_ROADMAP;
      return { data: opts.schema.parse(data), toolCalls: [] };
    }
    if (p.includes('简历草稿')) return { data: opts.schema.parse(RESUME_DRAFT), toolCalls: [] };
    if (p.includes('岗位描述')) return { data: opts.schema.parse({ jobs: [] }), toolCalls: [] };
    return { data: opts.schema.parse({}), toolCalls: [] };
  },
};

/** 替换 settings.js 的 LLM 配置判定：恒为已配置（避免测试触网） */
export const settingsMock = {
  isLlmConfigured: async () => true,
  getLlmSettings: async () => ({ provider: 'custom', baseUrl: 'http://mock.local', apiKey: 'test-key', model: 'mock-model' }),
};
