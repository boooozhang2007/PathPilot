/** 片中出现的真实事实与文案（数字均来自本仓库实测，不虚构） */

export const BRAND = {
  name: 'PathPilot',
  tag: 'AI 职业成长领航员',
  sub: 'Agent 能力演示 · 真实运行画面',
  site: 'pathpilot.070320.xyz',
};

export const PROBLEM_LINES = ['岗位要求看不懂', '四年规划没方向', '学了却没人给反馈'];
export const PROBLEM_PIVOT = '把整条成长链路，交给 Agent';

/** 与 packages/shared/src/agent.ts 的 AGENT_TOOL_LABELS 一致 */
export const TOOL_LABELS: Record<string, string> = {
  get_user_profile: '读取能力档案',
  get_tasks: '查询任务',
  generate_roadmap: '生成成长路线',
  create_roadmap_revision: '调整成长路线',
  roadmap_add_task: '添加任务',
  update_task_status: '更新任务状态',
  get_job_analysis: '读取岗位洞察',
  analyze_jobs: '分析招聘需求',
  analyze_skill_gap: '评估能力差距',
  search_jobs: '搜索招聘岗位',
  fetch_job_page: '读取岗位详情',
  extract_requirements: '提取任职要求',
  normalize_skills: '匹配技能',
  upsert_skill: '更新技能',
  create_experience: '记录经历',
  generate_resume_draft: '整理简历草稿',
};

/** 演示里真实出现的调用顺序 */
export const TOOL_CHAIN = ['get_user_profile', 'analyze_skill_gap', 'get_current_roadmap'];

export const STATS = [
  { v: '20', l: 'AGENT 工具' },
  { v: '4', l: '业务模块' },
  { v: '3', l: '端数据一致' },
];

export const PRINCIPLES = ['样本不足如实标注', '超时保留部分结果并说明', '校验不通过不落库、不覆盖旧规划'];

/** Web Agent 场景字幕（at 为场景内秒数，对应提问「我现在最该学什么？给出优先级，简短分点」） */
export const WEB_CAPTIONS: { at: number; text: string }[] = [
  { at: 0.6, text: '「我现在最该学什么？」——一句话交给 Agent' },
  { at: 4.5, text: '它先读能力档案，再对照 40 条真实岗位样本' },
  { at: 8.5, text: '思考过程与工具调用都摊开在对话里' },
  { at: 12.5, text: '结论按 P0 / P1 排优先级，并给出频次依据' },
  { at: 16.2, text: '全程真实运行：真实模型 + 真实岗位数据' },
];

/** 移动端场景字幕（画面来自设计稿页面驱动，片中不以“真机录屏”表述） */
export const APP_CAPTIONS: { at: number; text: string }[] = [
  { at: 0.8, text: '移动端界面：按同一套设计令牌还原' },
  { at: 4.0, text: 'AI 顾问 · 对话与结果卡片与 Web 端一致' },
  { at: 7.2, text: '首页 · 目标、匹配度与今日任务' },
  { at: 9.0, text: '成长路线 · 六学期时间轴' },
  { at: 11.0, text: '任务中心 · 完成与延期一目了然' },
  { at: 15.0, text: '我的 · 能力档案与规划设置' },
];
