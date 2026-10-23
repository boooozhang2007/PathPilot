// Seed：技能别名词典（PRD 4.3 归一化基础） + 预置真实岗位样本库（开发期联网采集，附真实来源链接）
// 演示账号：demo@pathpilot.ai / demo123456
import { eq } from 'drizzle-orm';
import { db, getDb } from './client.js';
import { skills, users, profiles, jobSources, jobRequirements } from './schema.js';
import { contentHash } from '../services/analysisService.js';
import { hashPassword } from '../auth/index.js';

interface SeedSkill {
  name: string;
  category: string;
  aliases: string[];
}

const SEED_SKILLS: SeedSkill[] = [
  { name: 'Java', category: 'language', aliases: ['java 语言', 'JAVA', 'Java8', 'Java 8'] },
  { name: 'Python', category: 'language', aliases: ['python 语言', 'PYTHON', 'Py'] },
  { name: 'JavaScript', category: 'language', aliases: ['JS', 'js', 'ECMAScript', 'ES6', 'ES6+'] },
  { name: 'TypeScript', category: 'language', aliases: ['TS'] },
  { name: 'Go', category: 'language', aliases: ['Golang', 'golang'] },
  { name: 'C++', category: 'language', aliases: ['cpp', 'C/C++', 'c++'] },
  { name: 'C', category: 'language', aliases: ['c 语言'] },
  { name: 'SQL', category: 'database', aliases: ['sql 语言', 'Sql'] },
  { name: 'MySQL', category: 'database', aliases: ['mysql 数据库', 'MySql'] },
  { name: 'Oracle', category: 'database', aliases: ['Oracle 数据库'] },
  { name: 'PostgreSQL', category: 'database', aliases: ['Postgres', 'PG'] },
  { name: 'Redis', category: 'database', aliases: ['redis 缓存'] },
  { name: 'HBase', category: 'database', aliases: ['hbase 数据库'] },
  { name: 'MongoDB', category: 'database', aliases: ['Mongo', 'mongo'] },
  { name: '数据结构与算法', category: 'algorithms', aliases: ['数据结构', '算法', '算法基础', '数据结构与算法基础'] },
  { name: 'Spring Boot', category: 'framework', aliases: ['SpringBoot', 'spring boot', 'Spring Boot 框架', 'Spring Boot 开发'] },
  { name: 'Spring', category: 'framework', aliases: ['Spring 框架', 'SpringFramework'] },
  { name: 'Spring Cloud', category: 'framework', aliases: ['SpringCloud', 'spring cloud'] },
  { name: 'MyBatis', category: 'framework', aliases: ['Mybatis', 'mybatis', 'MyBatis-Plus', 'Mybatis-Plus'] },
  { name: 'React', category: 'framework', aliases: ['React.js', 'ReactJS', 'reactjs'] },
  { name: 'Vue', category: 'framework', aliases: ['Vue.js', 'VueJS', 'vuejs'] },
  { name: 'Angular', category: 'framework', aliases: ['AngularJS', 'angular', 'Angular.js'] },
  { name: 'HTML', category: 'language', aliases: ['HTML5', 'H5', 'html/css'] },
  { name: 'CSS', category: 'language', aliases: ['CSS3', 'css3'] },
  { name: 'Node.js', category: 'framework', aliases: ['Node', 'nodejs', 'NodeJS'] },
  { name: 'Git', category: 'framework', aliases: ['Git 版本管理', 'git 版本控制'] },
  { name: 'Linux', category: 'system_design', aliases: ['Linux 基础', 'linux 命令', 'Shell'] },
  { name: 'Docker', category: 'testing', aliases: ['容器化', 'Docker 部署'] },
  { name: 'Tomcat', category: 'framework', aliases: ['Tomcat 容器'] },
  { name: '机器学习', category: 'system_design', aliases: ['ML', '机器学习算法', 'Machine Learning'] },
  { name: '深度学习', category: 'system_design', aliases: ['DL', 'Deep Learning', '神经网络'] },
  { name: 'Transformer', category: 'system_design', aliases: ['Transformer 架构', 'transformer'] },
  { name: 'Prompt 工程', category: 'framework', aliases: ['Prompt', 'Prompt Engineering', '提示词工程'] },
  { name: 'LLM 应用开发', category: 'framework', aliases: ['大模型应用', 'LLM', '大模型', 'LLM 开发', 'AIGC 开发'] },
  { name: 'RAG', category: 'framework', aliases: ['检索增强生成', 'Retrieval-Augmented Generation'] },
  { name: 'Agent 开发', category: 'framework', aliases: ['AI Agent', 'Agent', '智能体开发', '多智能体'] },
  { name: 'LangChain', category: 'framework', aliases: ['LlamaIndex', 'LangChain 框架'] },
  { name: '统计学', category: 'algorithms', aliases: ['统计', '统计基础', 'Statistics'] },
  { name: 'Pandas', category: 'framework', aliases: ['pandas', 'NumPy', 'numpy'] },
  { name: '数据可视化', category: 'project', aliases: ['可视化', 'Matplotlib', 'Seaborn', 'ECharts', 'Tableau'] },
  { name: 'Excel', category: 'framework', aliases: ['Excel 函数', '电子表格'] },
  { name: 'AWS', category: 'testing', aliases: ['GCP', '云计算', '阿里云'] },
  { name: '并发编程', category: 'system_design', aliases: ['多线程', 'JUC', 'Java 并发'] },
  { name: 'HTTP', category: 'system_design', aliases: ['HTTP 协议', 'HTTPS'] },
  { name: '浏览器原理', category: 'system_design', aliases: ['浏览器机制', 'DOM', 'AJAX', 'jQuery'] },
  { name: '沟通能力', category: 'soft', aliases: ['沟通', '沟通协调'] },
  { name: '团队协作', category: 'soft', aliases: ['协作', '团队合作', '协作精神'] },
  { name: '学习能力', category: 'soft', aliases: ['快速学习'] },
  { name: '问题分析与解决', category: 'soft', aliases: ['问题分析', '解决问题能力', '排查问题'] },
  { name: '考研数学', category: 'algorithms', aliases: ['数学一', '数学二', '考研数一'] },
  { name: '考研英语', category: 'soft', aliases: ['英语一', '考研英一'] },
  { name: '考研政治', category: 'soft', aliases: ['政治'] },
  { name: '操作系统', category: 'system_design', aliases: ['OS', '操作系统原理'] },
  { name: '计算机网络', category: 'system_design', aliases: ['网络原理', '计网'] },
  { name: '计算机组成原理', category: 'system_design', aliases: ['组成原理', '计组'] },
  { name: '简历', category: 'project', aliases: ['简历撰写'] },
  { name: '项目开发', category: 'project', aliases: ['项目经验', '项目实践'] },
  { name: '工程化', category: 'framework', aliases: ['前端工程化', 'Webpack', 'Vite', 'npm'] },
];

interface SeedJob {
  title: string;
  company: string | null;
  location: string | null;
  employmentType: 'internship' | 'full_time';
  education: string | null;
  experience: string | null;
  skills: string[];
  description: string;
  sourceUrl: string;
}

const FETCHED_AT = '2026-10-24T00:00:00.000Z'; // 采集日期：预置样本库构建时联网采集

const PRESET_JOBS: SeedJob[] = [
  // ---------- Java 后端 ----------
  { title: 'Java 应届生/实习生（后端开发）', company: null, location: null, employmentType: 'internship', education: '本科及以上（27 届毕业在校生）', experience: '在校生，可实习', skills: ['Java', 'Spring Boot', 'Vue'], description: '岗位职责：参与公司产品后端模块开发，基于 Java + Spring Boot 编写业务接口；配合设计稿完成联调。任职要求：计算机相关专业在校生，Java 基础扎实，了解 Spring Boot 框架；了解前端技术（Vue/React）者优先。实习薪资 100-150 元/天。', sourceUrl: 'https://www.zhipin.com/zhaopin/452359c96e1169190nV4290~' },
  { title: '软件开发实习生（Java / Spring Boot）', company: '约翰威立商务服务（北京）', location: '北京', employmentType: 'internship', education: '硕士及以上在读', experience: '在校生', skills: ['Java', 'Spring Boot', 'SQL'], description: '要求：计算机相关专业硕士在读，Java 编程基础，了解 Spring Boot 框架，具备基础 SQL 编写能力；良好的沟通能力与英文读写能力。', sourceUrl: 'https://cn.linkedin.com/jobs/view/%E8%BD%AF%E4%BB%B6%E5%BC%80%E5%8F%91%E5%AE%9E%E4%B9%A0%E7%94%9F%EF%BC%88java-spring-boot%EF%BC%89-at-%E7%BA%A6%E7%BF%B0%E5%A8%81%E7%AB%8B%E5%95%86%E5%8A%A1%E6%9C%8D%E5%8A%A1-%E5%8C%97%E4%BA%AC-%E6%9C%89%E9%99%90%E5%85%AC%E5%8F%B8-4474892042' },
  { title: 'JAVA 后端开发实习生', company: '亚信科技', location: null, employmentType: 'internship', education: '本科及以上', experience: '在校生', skills: ['Java', 'Vue', 'React', 'Tomcat'], description: '要求：Java 基础扎实，了解 Java 高级特性；熟悉前端技术（Vue/React 等）及 Tomcat 容器；具备良好的学习能力与团队协作能力。', sourceUrl: 'https://wap.shixiseng.com/intern/inn_3vwqv5gan7ln' },
  { title: 'Java 后端实习生', company: '京东', location: null, employmentType: 'internship', education: '本科及以上', experience: '有 Java 开发经验', skills: ['Java', 'Spring', 'Spring Boot', 'MyBatis', 'MySQL', 'Redis', 'Linux'], description: '要求：本科及以上，有 Java 开发经验；使用过 Spring、Spring Boot、Mybatis；使用过 MySQL、Redis；具备一定 Linux 基础；具备问题分析与解决能力。', sourceUrl: 'https://www.nowcoder.com/jobs/detail/29637' },
  { title: 'Java 研发实习生', company: '标新科技（北京）', location: '北京', employmentType: 'internship', education: '本科及以上', experience: '实习期 3 个月以上，每周至少 4 天', skills: ['Java'], description: '北京，招聘 3 人，实习期 3 个月以上，每周至少 4 天；参与公司 Java 后端开发，要求 Java 基础扎实、代码规范良好。', sourceUrl: 'http://www.csstgc.com.cn/lianxiwomen/zhaopin/9341.html' },
  { title: 'Java 后端开发实习生', company: '小米', location: null, employmentType: 'internship', education: '本科及以上', experience: '在校生', skills: ['Java', 'Spring Boot', 'MyBatis', 'SQL', 'MySQL', 'Oracle'], description: '要求：扎实的 Java 编程基础；至少掌握一种主流框架如 Spring Boot、Mybatis；能熟练编写 SQL，有 MySQL 或 Oracle 经验；有良好的编码习惯与沟通能力。', sourceUrl: 'https://www.wondercv.com/jobs/3T2nyA8.html' },
  { title: 'Java 后端开发实习生', company: null, location: null, employmentType: 'internship', education: '本科及以上', experience: '在校生', skills: ['MySQL', 'Oracle', 'HBase', 'Spring', 'Spring Boot', 'Spring Cloud'], description: '要求：熟悉 MySQL、Oracle、HBase 数据库；熟悉 Spring、SpringBoot、SpringCloud 等常用框架；编码规范良好，具备团队协作精神。', sourceUrl: 'https://www.chinahr.com/detail/663887c5579e0107e936bd7c' },

  // ---------- 前端 ----------
  { title: '前端开发实习生 - 中国交易与广告', company: '字节跳动', location: '北京', employmentType: 'internship', education: '本科及以上在读，计算机/软件工程优先', experience: '在校生，实习 3 个月以上', skills: ['HTML', 'CSS', 'JavaScript', 'React', 'Vue', 'Angular', '浏览器原理'], description: '职位要求：1、本科及以上学历在读，计算机、软件工程等相关专业优先；2、精通 HTML/CSS/JS，熟悉 HTML5/CSS3；3、有 React、Vue.js、AngularJS 等框架开发经验；4、熟悉 JavaScript、AJAX、DOM、jQuery 等技术。', sourceUrl: 'https://jobs.bytedance.com/campus/m/position/detail/7566240568168024373' },
  { title: 'Web 前端实习生', company: null, location: null, employmentType: 'internship', education: '计算机相关专业应届生', experience: '应届/在校', skills: ['HTML', 'JavaScript', 'HTTP'], description: '任职要求：计算机相关专业的应届毕业生，需熟练掌握 HTML、JavaScript 等优先；有 UI 设计经验的优先；熟悉 HTTP 协议及 W3C 相关互联网规范。薪资约 5-6K。', sourceUrl: 'https://www.zhipin.com' },
  { title: 'Web 前端开发实习生', company: '又为智能', location: null, employmentType: 'internship', education: '本科及以上，计算机/软件工程相关', experience: '在校生', skills: ['React', 'Vue', 'Angular', 'TypeScript'], description: '职位要求：1. 计算机、软件工程等相关专业，本科及以上；2. 熟练掌握常用前端设计模式，了解 React/Angular/Vue 至少一种框架及其原理；3. 掌握 TypeScript 者优先。', sourceUrl: 'https://wap.shixiseng.com' },
  { title: '大模型前端开发实习生', company: null, location: null, employmentType: 'internship', education: '本科及以上', experience: '在校生', skills: ['HTML', 'CSS', 'JavaScript', 'TypeScript', 'React', 'Vue', 'Node.js'], description: '要求：本科及以上，计算机相关专业；熟悉 HTML、CSS、JavaScript/TypeScript；熟练掌握 React、Vue.js 或 Angular 中至少一种框架，了解 React 服务端渲染技术；有 Node.js 经验者优先。', sourceUrl: 'https://www.nowcoder.com' },
  { title: '前端开发工程师（2027 届）', company: '海尔', location: null, employmentType: 'full_time', education: '本科及以上应届生，英语四级', experience: '应届生', skills: ['JavaScript', 'CSS', 'HTML'], description: '要求：本科及以上应届生，英语四级，计算机/软件专业优先；编程基础扎实，熟悉 JS/ES6、CSS/CSS3、HTML/H5；具备沟通与团队协作能力。', sourceUrl: 'https://www.chinahr.com' },
  { title: '前端开发实习生（内推 27 届）', company: null, location: null, employmentType: 'internship', education: '本科及以上', experience: '27 届在校生', skills: ['React', 'Vue', 'Git', 'JavaScript'], description: '核心技术栈 React/Vue（以具体部门要求为准），本科及以上学历；扎实的 JavaScript 基础，熟悉 JSON 数据处理；会使用 Git 版本管理。', sourceUrl: 'https://www.liepin.com' },

  // ---------- AI 应用开发 ----------
  { title: 'AI 应用开发实习生 - 财经业务', company: '字节跳动', location: null, employmentType: 'internship', education: '本科及以上在读，计算机/AI/自动化/数学优先', experience: '在校生', skills: ['Go', 'Python', 'C++', '数据结构与算法'], description: '要求：1、本科及以上学历在读，计算机、人工智能、自动化、数学相关专业优先；2、精通 Go、Python、C++ 等一种或多种编程语言，具备扎实的编程与算法能力；3、对大模型应用（LLM/Agent）有兴趣，具备团队协作与沟通能力。', sourceUrl: 'https://jobs.bytedance.com/campus/m/position/detail/7638932375973021957' },
  { title: 'AI Agent 算法实习生（企业智能）', company: '小红书', location: null, employmentType: 'internship', education: '本科及以上在读', experience: '在校生', skills: ['Agent 开发', 'RAG', 'LLM 应用开发', 'Python'], description: '方向：大模型应用、Agent、RAG、工具调用、模型评测。要求：熟悉大模型技术栈，具备 Python 工程能力；有 LLM 应用落地项目经验者优先；具备问题分析与解决能力。', sourceUrl: 'https://www.shixiseng.com/intern/inn_8s2zkxqufl9u' },
  { title: 'Agent 开发工程师实习生（暑假实习）', company: null, location: null, employmentType: 'internship', education: '本科及以上', experience: '暑假实习', skills: ['Agent 开发', 'LLM 应用开发', 'RAG', 'Python'], description: '职责：基于 LLM 的 AI Agent、工作流自动化、知识库问答、Tool Use、多智能体协作研发。要求：熟悉 LangChain 等框架，掌握 Prompt 工程与模型评测基础。', sourceUrl: 'https://www.ncss.cn/student/jobs/6QX4SBR1sDur3Q3mh3JRiR/detail.html' },
  { title: '大模型应用算法实习生（电商方向）', company: '阿里淘天集团', location: null, employmentType: 'internship', education: '大四或研究生在读', experience: '在读', skills: ['机器学习', '深度学习', '数据结构与算法', 'Python'], description: '要求：大四或研究生在读；熟悉机器学习/深度学习算法，扎实的数据结构与编码能力；了解 Transformer 架构与 Prompt 工程者优先。', sourceUrl: 'https://job.hdu.edu.cn/campus/view?id=7744' },
  { title: 'AI Agent 应用开发工程师（实习+应届）', company: 'Richinfo', location: null, employmentType: 'internship', education: '本科及以上', experience: '实习或应届', skills: ['Agent 开发', 'LLM 应用开发', 'RAG', 'Prompt 工程'], description: '生成式 AI 工程专项（LLM / RAG / Agent），涉及生产级系统开发。要求：熟悉大模型应用开发框架，掌握 Prompt 工程与检索增强生成技术。', sourceUrl: 'https://cn.linkedin.com/jobs/view/ai-agent-%E5%BA%94%E7%94%A8%E5%BC%80%E5%8F%91%E5%B7%A5%E7%A8%8B%E5%B8%88%E3%80%90%E5%AE%9E%E4%B9%A0%2B%E5%BA%94%E5%B1%8A%E3%80%91-at-richinfo-4447326457' },

  // ---------- 数据分析 ----------
  { title: '数据科学实习生 - 抖音体验', company: '字节跳动', location: null, employmentType: 'internship', education: '本科以上在读，数据科学/统计/计算机优先', experience: '在校生', skills: ['统计学', 'SQL', 'Python', '机器学习'], description: '要求：本科以上学历在读，数据科学、统计、计算机等相关专业优先；具备完备的统计学知识与娴熟的 SQL 技巧，具备基本的 Python 编程能力和机器学习/深度学习经验。', sourceUrl: 'https://jobs.bytedance.com/campus/m/position/detail/7290588080389753149' },
  { title: '数据科学/数据分析实习生', company: '薪程', location: null, employmentType: 'internship', education: '本科及以上', experience: '实习期 6 个月以上', skills: ['SQL', 'Python', '机器学习', 'AWS'], description: '要求：熟悉 SQL 或 Python；熟悉 GCP、AWS、云计算、机器学习算法者优先；有数据分析和数据收集经验者优先；工作细心、沟通能力强。', sourceUrl: 'https://www.shixiseng.com/intern/inn_un11bfrklaqg' },
  { title: 'Python 数据分析实习生', company: '快商通', location: '厦门·集美区', employmentType: 'internship', education: '本科及以上', experience: '实习到毕业可转正', skills: ['Python', 'SQL', '数据可视化'], description: 'Python 数据分析师（实习到毕业+可转正+落户），150-200 元/天。要求：掌握 Python 数据处理与 SQL，能产出分析报告；实习期表现优秀可转正。', sourceUrl: 'https://www.zhipin.com/zhaopin/4b8957c70aad44411n140tq5Fg~~' },
  { title: '软件开发工程师（数据开发方向，转正实习）', company: '美团', location: null, employmentType: 'internship', education: '本科及以上', experience: '转正实习', skills: ['统计学', 'SQL', 'Python', '机器学习'], description: '要求：本科及以上，统计学/应用数学/因果推断领域有科研经历优先；较强的调研能力，掌握 SQL、Python 等数据分析工具。', sourceUrl: 'https://zhaopin.meituan.com/m/position/detail?jobUnionId=2309561372' },
  { title: '数据分析实习生（多岗位）', company: null, location: null, employmentType: 'internship', education: '本科（对口专业优先）', experience: '在校生', skills: ['Excel', '统计学', '沟通能力'], description: '典型要求：本科学历（供应链/物流等对口专业优先）、熟悉 Excel 函数、英语 CET-4 以上、工作细心；具备基础数据分析与沟通表达能力。', sourceUrl: 'https://cn.indeed.com/q-%E6%95%B0%E6%8D%AE%E5%88%86%E6%9E%90%E5%AE%9E%E4%B9%A0%E7%94%9F-%E8%81%8C%E4%BD%8D.html' },
];

export async function seedIfNeeded(): Promise<void> {
  await seedSkills();
  await seedPresetJobs();
  await seedDemoAccount();
}

async function seedSkills(): Promise<void> {
  const existing = await db.select({ id: skills.id }).from(skills).limit(1);
  if (existing[0]) return;
  for (const s of SEED_SKILLS) {
    await db
      .insert(skills)
      .values({ name: s.name, category: s.category, aliases: s.aliases })
      .onConflictDoNothing();
  }
  console.log(`[seed] 技能词典已导入（${SEED_SKILLS.length} 项）`);
}

async function seedPresetJobs(): Promise<void> {
  const existing = await db.select({ id: jobSources.id }).from(jobSources).where(eq(jobSources.sourceType, 'preset')).limit(1);
  if (existing[0]) return;
  const catalog = await db.select().from(skills);
  const idByName = new Map(catalog.map((s) => [s.name, s.id]));
  for (const job of PRESET_JOBS) {
    const hash = contentHash(`${job.title}|${job.company ?? ''}|${job.description.slice(0, 500)}`);
    const inserted = await db
      .insert(jobSources)
      .values({
        userId: null,
        title: job.title,
        company: job.company,
        location: job.location,
        employmentType: job.employmentType,
        educationRequirement: job.education,
        experienceRequirement: job.experience,
        description: job.description,
        sourceUrl: job.sourceUrl,
        sourceType: 'preset',
        fetchedAt: FETCHED_AT,
        contentHash: hash,
        parseStatus: 'ok',
      })
      .returning();
    const sourceId = inserted[0].id;
    for (const skillName of job.skills) {
      await db.insert(jobRequirements).values({
        jobSourceId: sourceId,
        skillId: idByName.get(skillName) ?? null,
        originalText: skillName,
        requirementType: 'skill',
        importance: 'medium',
        evidenceText: job.description.slice(0, 200),
      });
    }
  }
  console.log(`[seed] 预置真实岗位样本已导入（${PRESET_JOBS.length} 条，采集于 ${FETCHED_AT.slice(0, 10)}，均附原始来源链接）`);
}

async function seedDemoAccount(): Promise<void> {
  const email = 'demo@pathpilot.ai';
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing[0]) return;
  const inserted = await db
    .insert(users)
    .values({ email, passwordHash: await hashPassword('demo123456') })
    .returning();
  await db.insert(profiles).values({
    userId: inserted[0].id,
    nickname: '演示同学',
    school: '演示大学',
    major: '计算机科学与技术',
    grade: 'sophomore',
    graduationDate: '2028-06-30',
    targetRole: 'Java 后端开发',
    careerPath: 'employment',
    weeklyHours: 10,
  });
  console.log('[seed] 演示账号已创建: demo@pathpilot.ai / demo123456');
}

// CLI: npm run db:seed
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop() ?? '')) {
  const { sqlite } = getDb();
  const { migrate, MIGRATIONS_DIR } = await import('./migrate.js');
  migrate(sqlite, MIGRATIONS_DIR);
  await seedIfNeeded();
  console.log('seed 完成');
}
