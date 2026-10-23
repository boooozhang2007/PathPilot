// 规则引擎任务库：按目标方向组织的学习单元（PRD 4.5 示例任务对齐）
// 每个单元可验证产出 + 验收标准 + 先修依赖；由时间预算服务裁剪成可执行计划
import type { Priority } from '@pathpilot/shared';

export type RoleFamily = 'java-backend' | 'frontend' | 'ai-app' | 'data-analysis' | 'generic';
export type UnitPhase = 'foundation' | 'core' | 'practice' | 'advanced' | 'job_hunt' | 'kaoyan';

export interface StudyUnit {
  id: string;
  family: RoleFamily;
  phase: UnitPhase;
  skills: string[];
  title: string;
  description: string;
  hours: number;
  priority: Priority;
  deliverable: string;
  acceptance: string;
  prereq?: string;
  /** 考研路径下压缩/排除 */
  kaoyanKeep?: boolean;
}

const U = (u: StudyUnit): StudyUnit => u;

export const UNIT_LIBRARY: StudyUnit[] = [
  // ---------- Java 后端 ----------
  U({ family: 'java-backend', phase: 'foundation', id: 'jb-java-basics', skills: ['Java'], title: '完成 Java 基础学习并提交练习代码', description: '学习 Java 语法、面向对象、集合框架与异常处理，完成配套练习。', hours: 60, priority: 'high', deliverable: '一个含 30+ 练习题的 Java 基础代码仓库', acceptance: '仓库包含集合、泛型、IO、异常的练习代码并通过本地编译', kaoyanKeep: true }),
  U({ family: 'java-backend', phase: 'core', id: 'jb-concurrent-jvm', skills: ['Java', '并发编程'], title: '学习 Java 并发编程与 JVM 基础', description: '线程池、锁、JUC 常用类与 JVM 内存模型。', hours: 40, priority: 'medium', deliverable: '并发编程学习笔记与示例代码', acceptance: '能解释线程池参数并写出正确使用 JUC 的示例', prereq: 'jb-java-basics' }),
  U({ family: 'java-backend', phase: 'core', id: 'jb-mysql', skills: ['MySQL', 'SQL'], title: '学习 SQL 与 MySQL 并完成查询练习', description: 'SQL 增删改查、索引、事务与基本调优。', hours: 40, priority: 'high', deliverable: 'SQL 练习集与笔记', acceptance: '完成 50 道 SQL 查询练习，含多表连接与聚合', kaoyanKeep: true }),
  U({ family: 'java-backend', phase: 'core', id: 'jb-springboot', skills: ['Spring Boot'], title: '入门 Spring Boot 框架', description: 'IoC、AOP、Spring MVC、MyBatis/MyBatis-Plus 与 RESTful API。', hours: 50, priority: 'high', deliverable: '一个提供 5 个以上接口的示例服务', acceptance: '接口可通过 Postman/HTTP 调用并返回正确结果', prereq: 'jb-mysql' }),
  U({ family: 'java-backend', phase: 'practice', id: 'jb-project-crud', skills: ['Spring Boot', 'MySQL'], title: '实现包含增删改查功能的后端小项目', description: '设计表结构，实现完整业务接口与简单鉴权。', hours: 60, priority: 'high', deliverable: '可运行的后端项目（GitHub 仓库）', acceptance: '核心接口均有单元/接口测试，README 记录技术选型', prereq: 'jb-springboot' }),
  U({ family: 'java-backend', phase: 'core', id: 'jb-git-linux', skills: ['Git', 'Linux'], title: '掌握 Git 协作与 Linux 常用命令', description: '分支模型、远程协作、Shell 基础与服务部署命令。', hours: 20, priority: 'medium', deliverable: 'Git 协作记录（PR/提交历史）', acceptance: '完成一次多人/多分支模拟协作流程', kaoyanKeep: true }),
  U({ family: 'java-backend', phase: 'advanced', id: 'jb-redis', skills: ['Redis'], title: '学习 Redis 缓存与常见场景', description: '数据结构、缓存穿透/击穿/雪崩、分布式锁入门。', hours: 30, priority: 'medium', deliverable: 'Redis 实践示例与场景笔记', acceptance: '在示例项目中集成缓存并压测对比', prereq: 'jb-project-crud' }),
  U({ family: 'java-backend', phase: 'advanced', id: 'jb-mq-distribute', skills: ['消息队列'], title: '了解消息队列与分布式基础', description: 'MQ 用途、幂等、分布式事务概念。', hours: 25, priority: 'low', deliverable: 'MQ 入门示例代码', acceptance: '完成一个异步解耦示例', prereq: 'jb-project-crud' }),
  U({ family: 'java-backend', phase: 'practice', id: 'jb-deploy', skills: ['Docker'], title: '将项目部署到可访问的测试环境', description: 'Docker 化应用与数据库，部署到云服务器。', hours: 25, priority: 'high', deliverable: '可公网访问的部署地址 + 部署文档', acceptance: '他人可通过地址访问接口', prereq: 'jb-project-crud' }),
  U({ family: 'java-backend', phase: 'job_hunt', id: 'jb-resume', skills: ['简历'], title: '根据目标岗位完善项目说明与简历描述', description: '整理项目亮点、量化产出，撰写针对 Java 后端岗位的简历。', hours: 15, priority: 'high', deliverable: '一页简历 + 项目描述话术', acceptance: '简历中项目均有可验证产出与链接', prereq: 'jb-deploy' }),

  // ---------- 前端开发 ----------
  U({ family: 'frontend', phase: 'foundation', id: 'fe-html-css-js', skills: ['HTML', 'CSS', 'JavaScript'], title: '完成 HTML/CSS/JavaScript 基础与页面练习', description: '语义化标签、盒模型、JS 语法与 DOM 操作。', hours: 60, priority: 'high', deliverable: '3 个静态页面练习仓库', acceptance: '页面在移动端与桌面端均正常显示', kaoyanKeep: true }),
  U({ family: 'frontend', phase: 'core', id: 'fe-es6-tooling', skills: ['JavaScript', '工程化'], title: '掌握 ES6+ 与前端工程化基础', description: '模块化、异步、Vite/Webpack、npm。', hours: 30, priority: 'medium', deliverable: '一个用 Vite 搭建的工程化项目', acceptance: '包含构建脚本与代码规范配置', prereq: 'fe-html-css-js' }),
  U({ family: 'frontend', phase: 'core', id: 'fe-react', skills: ['React', 'TypeScript'], title: '学习 React 与 TypeScript 并完成组件练习', description: '组件化、Hooks、状态管理、TS 类型。', hours: 55, priority: 'high', deliverable: '10+ 可复用组件的练习仓库', acceptance: '组件含 TS 类型与基本交互测试', prereq: 'fe-es6-tooling' }),
  U({ family: 'frontend', phase: 'practice', id: 'fe-project', skills: ['React', 'TypeScript'], title: '实现一个完整前端项目（含接口联调）', description: '路由、请求封装、登录态、列表/表单页。', hours: 60, priority: 'high', deliverable: '可访问的前端应用（GitHub 仓库）', acceptance: '与真实后端接口联调并处理加载/错误状态', prereq: 'fe-react' }),
  U({ family: 'frontend', phase: 'core', id: 'fe-http-browser', skills: ['HTTP', '浏览器原理'], title: '学习 HTTP 协议与浏览器原理', description: '缓存、跨域、渲染流程、性能优化基础。', hours: 25, priority: 'medium', deliverable: '学习笔记 + 性能优化清单', acceptance: '能解释常见跨域与缓存问题并给出方案', kaoyanKeep: true }),
  U({ family: 'frontend', phase: 'practice', id: 'fe-deploy', skills: ['工程化'], title: '部署前端项目并编写构建文档', description: 'CI/静态托管/CDN 基础。', hours: 15, priority: 'high', deliverable: '可访问的部署地址', acceptance: '构建产物可在线访问', prereq: 'fe-project' }),
  U({ family: 'frontend', phase: 'advanced', id: 'fe-node', skills: ['Node.js'], title: '了解 Node.js 与全栈基础', description: 'Express/Koa、REST API、简单 BFF。', hours: 30, priority: 'low', deliverable: '一个 Node 服务示例', acceptance: '提供可用 REST 接口', prereq: 'fe-project' }),
  U({ family: 'frontend', phase: 'job_hunt', id: 'fe-resume', skills: ['简历'], title: '完善前端项目说明与简历描述', description: '性能、体验、工程化亮点整理。', hours: 15, priority: 'high', deliverable: '一页简历 + 项目描述话术', acceptance: '项目均有可验证产出与链接', prereq: 'fe-deploy' }),

  // ---------- AI 应用开发 ----------
  U({ family: 'ai-app', phase: 'foundation', id: 'ai-python', skills: ['Python'], title: '完成 Python 基础与数据处理练习', description: '语法、函数、模块、虚拟环境与 pip。', hours: 45, priority: 'high', deliverable: 'Python 基础练习仓库', acceptance: '完成 30 个以上练习并通过运行', kaoyanKeep: true }),
  U({ family: 'ai-app', phase: 'core', id: 'ai-algo', skills: ['数据结构与算法'], title: '学习数据结构与算法基础', description: '数组/链表/树/图、排序查找、刷题入门。', hours: 50, priority: 'high', deliverable: '50 道算法题解仓库', acceptance: '每题附思路注释与复杂度分析', kaoyanKeep: true }),
  U({ family: 'ai-app', phase: 'core', id: 'ai-ml-basics', skills: ['机器学习'], title: '学习机器学习基础', description: '监督学习、评估指标、经典模型。', hours: 45, priority: 'medium', deliverable: '经典数据集实验 Notebook', acceptance: '完成分类/回归实验并记录指标', prereq: 'ai-python' }),
  U({ family: 'ai-app', phase: 'core', id: 'ai-llm-dev', skills: ['LLM 应用开发', 'Prompt 工程'], title: '学习 LLM 应用开发（API/Prompt/RAG）', description: '模型 API 调用、Prompt 设计、Embedding 与 RAG 流程。', hours: 50, priority: 'high', deliverable: '一个可运行的 RAG 问答 demo', acceptance: '能针对给定文档正确回答问题', prereq: 'ai-python' }),
  U({ family: 'ai-app', phase: 'practice', id: 'ai-project', skills: ['LLM 应用开发', 'Python'], title: '实现一个 AI 应用项目', description: '结合 Agent/工具调用或 RAG 的完整应用。', hours: 60, priority: 'high', deliverable: '可演示的 AI 应用（仓库+说明）', acceptance: '包含输入输出示例与评测记录', prereq: 'ai-llm-dev' }),
  U({ family: 'ai-app', phase: 'core', id: 'ai-git-docker', skills: ['Git', 'Linux', 'Docker'], title: '掌握 Git/Linux 与应用容器化', description: '版本协作、服务器基础、Docker 部署。', hours: 30, priority: 'medium', deliverable: '容器化部署的 AI 应用', acceptance: '应用可通过 Docker 一键启动', prereq: 'ai-project' }),
  U({ family: 'ai-app', phase: 'job_hunt', id: 'ai-resume', skills: ['简历'], title: '完善 AI 项目说明与简历描述', description: '突出模型选型、评测与效果量化。', hours: 15, priority: 'high', deliverable: '一页简历 + 项目描述话术', acceptance: '项目均有可验证产出与链接', prereq: 'ai-git-docker' }),

  // ---------- 数据分析 ----------
  U({ family: 'data-analysis', phase: 'foundation', id: 'da-sql-python', skills: ['SQL', 'Python'], title: '掌握 SQL 与 Python 数据处理基础', description: 'SQL 查询、Pandas/NumPy。', hours: 55, priority: 'high', deliverable: 'SQL+Pandas 练习集', acceptance: '完成 50 道 SQL 与 20 个 Pandas 练习', kaoyanKeep: true }),
  U({ family: 'data-analysis', phase: 'core', id: 'da-statistics', skills: ['统计学'], title: '学习统计学基础', description: '描述统计、概率分布、假设检验、AB 测试。', hours: 40, priority: 'high', deliverable: '统计学习笔记与练习', acceptance: '能完整描述一次 AB 测试流程', kaoyanKeep: true }),
  U({ family: 'data-analysis', phase: 'core', id: 'da-viz', skills: ['数据可视化'], title: '学习数据可视化', description: 'Matplotlib/Seaborn 或 ECharts，图表设计原则。', hours: 25, priority: 'medium', deliverable: '一份完整的数据可视化报告', acceptance: '图表有标题、单位与结论', prereq: 'da-sql-python' }),
  U({ family: 'data-analysis', phase: 'core', id: 'da-ml', skills: ['机器学习'], title: '学习机器学习建模基础', description: '回归/分类/聚类与评估。', hours: 45, priority: 'medium', deliverable: '建模实验 Notebook', acceptance: '完成一个完整建模流程与评估', prereq: 'da-statistics' }),
  U({ family: 'data-analysis', phase: 'practice', id: 'da-project', skills: ['SQL', 'Python', '数据可视化'], title: '完成一个端到端数据分析项目', description: '提出业务问题→取数→分析→可视化→结论。', hours: 60, priority: 'high', deliverable: '分析报告（含数据来源说明）', acceptance: '结论有数据支撑且可复现', prereq: 'da-viz' }),
  U({ family: 'data-analysis', phase: 'job_hunt', id: 'da-resume', skills: ['简历'], title: '完善数据分析项目与简历描述', description: '突出业务理解与量化结论。', hours: 15, priority: 'high', deliverable: '一页简历 + 项目描述话术', acceptance: '项目均有可验证产出与链接', prereq: 'da-project' }),

  // ---------- 通用兜底 ----------
  U({ family: 'generic', phase: 'foundation', id: 'gen-language', skills: ['编程语言'], title: '选定主语言并完成基础学习', description: '按目标方向选择 Java/Python/JavaScript 完成基础。', hours: 50, priority: 'high', deliverable: '语言基础练习仓库', acceptance: '完成配套练习并通过运行', kaoyanKeep: true }),
  U({ family: 'generic', phase: 'core', id: 'gen-ds', skills: ['数据结构与算法'], title: '学习数据结构与算法', description: '常见结构与算法，配合刷题。', hours: 50, priority: 'high', deliverable: '30 道题解仓库', acceptance: '每题附思路与复杂度', kaoyanKeep: true }),
  U({ family: 'generic', phase: 'core', id: 'gen-db', skills: ['SQL'], title: '学习数据库与 SQL', description: '关系模型、SQL 查询、简单设计。', hours: 30, priority: 'high', deliverable: 'SQL 练习集', acceptance: '完成 40 道 SQL 练习', kaoyanKeep: true }),
  U({ family: 'generic', phase: 'practice', id: 'gen-project', skills: ['项目开发'], title: '完成一个方向相关小项目', description: '围绕目标岗位做一个可展示项目。', hours: 60, priority: 'high', deliverable: '项目仓库 + README', acceptance: '项目可运行且 README 完整', prereq: 'gen-ds' }),
  U({ family: 'generic', phase: 'job_hunt', id: 'gen-resume', skills: ['简历'], title: '完善简历与项目描述', description: '整理产出与亮点。', hours: 15, priority: 'high', deliverable: '一页简历', acceptance: '项目均可验证', prereq: 'gen-project' }),

  // ---------- 考研单元（graduate_school 路径追加） ----------
  U({ family: 'generic', phase: 'kaoyan', id: 'ky-math-1', skills: ['考研数学'], title: '考研数学一轮复习（高数+线代基础）', description: '教材+基础课程，完成基础题。', hours: 80, priority: 'high', deliverable: '一轮复习笔记与错题本', acceptance: '完成教材课后题正确率 80% 以上' }),
  U({ family: 'generic', phase: 'kaoyan', id: 'ky-408-ds', skills: ['数据结构与算法'], title: '408 数据结构考研复习', description: '按考纲复习并完成真题选择题。', hours: 50, priority: 'high', deliverable: '数据结构复习笔记+真题错题', acceptance: '近 10 年选择题正确率 70%+', prereq: 'ky-math-1' }),
  U({ family: 'generic', phase: 'kaoyan', id: 'ky-english', skills: ['考研英语'], title: '考研英语词汇与阅读训练', description: '词汇积累+精读训练。', hours: 40, priority: 'medium', deliverable: '词汇记录与阅读精读笔记', acceptance: '完成 30 篇精读' }),
  U({ family: 'generic', phase: 'kaoyan', id: 'ky-math-2', skills: ['考研数学'], title: '考研数学强化（真题训练）', description: '真题套卷+薄弱专题强化。', hours: 70, priority: 'high', deliverable: '近 15 年真题完成记录', acceptance: '套卷平均分达到目标院校线', prereq: 'ky-math-1' }),
  U({ family: 'generic', phase: 'kaoyan', id: 'ky-408-rest', skills: ['操作系统', '计算机网络', '计算机组成原理'], title: '408 操作系统/网络/组成原理复习', description: '三门专业课按考纲过一遍并刷题。', hours: 90, priority: 'high', deliverable: '三门课复习笔记+真题', acceptance: '各科真题选择正确率 65%+', prereq: 'ky-408-ds' }),
  U({ family: 'generic', phase: 'kaoyan', id: 'ky-politics', skills: ['考研政治'], title: '考研政治冲刺复习', description: '核心考点+时政+大题背诵。', hours: 40, priority: 'medium', deliverable: '政治背诵手册与模拟卷', acceptance: '完成 8 套模拟卷选择题' }),
  U({ family: 'generic', phase: 'kaoyan', id: 'ky-interview', skills: ['复试'], title: '复试项目与上机准备', description: '整理项目经历、准备机试与英语口语。', hours: 30, priority: 'high', deliverable: '复试项目陈述文档', acceptance: '完成 3 次模拟面试', prereq: 'ky-math-2' }),
];

/** 从目标岗位字符串推断方向族 */
export function familyOfRole(targetRole: string): RoleFamily {
  const r = targetRole.toLowerCase();
  if (/java|后端|backend|服务端/.test(r)) return 'java-backend';
  if (/前端|frontend|web|react|vue/.test(r)) return 'frontend';
  if (/ai|人工智能|机器学习|深度学习|llm|大模型|算法工程师/.test(r)) return 'ai-app';
  if (/数据|分析|bi|数仓/.test(r)) return 'data-analysis';
  return 'generic';
}
