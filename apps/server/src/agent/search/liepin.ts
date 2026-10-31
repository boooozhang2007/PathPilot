// 猎聘官方接入（岗位搜索通道）：liepin-cli（github.com/liepin-tech-2026/liepin-cil，Python CLI）
// 链路：CLI 搜索职位（--output json）→ 逐条抓取岗位详情页正文 → 组装为统一 JobSample，技能抽取由主管线完成
// 鉴权：LIEPIN_USER_TOKEN 环境变量（服务端持有，不下发客户端；liepin.com/mcp/auth 获取，90 天有效，限流 60 次/分钟）
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import type { JobSample, EmploymentType } from '@pathpilot/shared';
import { fetchText, extractJdFromHtml } from './webSearch.js';

export interface LiepinSearchOutcome {
  samples: JobSample[];
  note: string;
  ok: boolean;
}

/** 单次搜索的统计信息，用于全量汇总与如实报告 */
export interface LiepinSearchStats {
  rounds: number;
  rawCount: number;
  dedupedCount: number;
  filteredCount: number;
}

/** CLI 可执行文件路径：<repo>/tools/liepin-cli/.venv/Scripts|bin/liepin-cli(.exe)，可用 LIEPIN_CLI_PATH 覆盖 */
export function cliPath(): string | null {
  if (process.env.LIEPIN_CLI_PATH && existsSync(process.env.LIEPIN_CLI_PATH)) return process.env.LIEPIN_CLI_PATH;
  const here = dirname(fileURLToPath(import.meta.url)); // <repo>/apps/server/src/agent/search
  const root = join(here, '..', '..', '..', '..', '..'); // 上溯 5 级到仓库根
  const candidates = [
    join(root, 'tools', 'liepin-cli', '.venv', 'Scripts', 'liepin-cli.exe'),
    join(root, 'tools', 'liepin-cli', '.venv', 'Scripts', 'liepin-cli.bat'),
    join(root, 'tools', 'liepin-cli', '.venv', 'bin', 'liepin-cli'),
  ];
  return candidates.find((p) => existsSync(p)) ?? null;
}

export function liepinConfigured(): boolean {
  return !!process.env.LIEPIN_USER_TOKEN && cliPath() !== null;
}

/** 搜索结果缓存（PRD 12：对重复搜索进行合理缓存；10 分钟；LRU 容量上限，只增不减防护） */
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 200;
const cache = new Map<string, { at: number; jobs: RawLiepinJob[] }>();

function cacheSet(key: string, value: { at: number; jobs: RawLiepinJob[] }): void {
  cache.delete(key); // 已存在时先删再插，保持插入序（最新在最后）
  cache.set(key, value);
  while (cache.size > CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

interface RawLiepinJob {
  jobId?: number;
  jobName?: string;
  company?: string;
  location?: string;
  salary?: string;
  education?: string;
  workYears?: string;
  industry?: string;
  companyTags?: string[];
  jobDetailUrl?: string;
}

function runCli(args: string[], timeoutMs: number, signal?: AbortSignal): Promise<string> {
  const exe = cliPath()!;
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('已取消'));
    const child = spawn(exe, args, {
      env: {
        ...process.env,
        LIEPIN_USER_TOKEN: process.env.LIEPIN_USER_TOKEN ?? '',
        PYTHONIOENCODING: 'utf-8',
      },
      windowsHide: true,
    });
    let out = '';
    let err = '';
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    };
    const onAbort = () => {
      child.kill();
      cleanup();
      reject(new Error('已取消'));
    };
    const timer = setTimeout(() => {
      child.kill();
      cleanup();
      reject(new Error(`liepin-cli 超时(${timeoutMs}ms)`));
    }, timeoutMs);
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) onAbort(); // 监听注册前已取消的竞态
    child.stdout.on('data', (d) => (out += d.toString('utf-8')));
    child.stderr.on('data', (d) => (err += d.toString('utf-8')));
    child.on('error', (e) => {
      cleanup();
      reject(e);
    });
    child.on('close', (code) => {
      cleanup();
      if (code === 0 && out.trim()) resolve(out);
      else reject(new Error(`liepin-cli 退出码 ${code}: ${(err || out).slice(0, 300)}`));
    });
  });
}

// ---------- 多轮搜索：关键词 × 翻页，限速 ≤60rpm ----------

/** 猎聘 MCP 限流 60 次/分钟；CLI 调用间隔取 1.1s（留余量），模块内全局生效。 */
const RATE_LIMIT_INTERVAL_MS = 1100;
/** 单次 liepinSearchJobs 最多发起的 CLI 调用数（远低于限流阈值，同时控制耗时）。 */
const MAX_SEARCH_CALLS = 10;
/** 每个关键词最多翻页数（page 从 0 开始）。 */
const MAX_PAGES_PER_KEYWORD = 3;
/** 候选池目标大小（按去重后计）：同岗多贴与筛选损耗约 50%，取 3 倍供择优。 */
const poolTargetFor = (sampleLimit: number) => Math.min(Math.max(sampleLimit * 3, 30), 100);

let lastCliCallAt = 0;

async function rateLimitedCli(args: string[], timeoutMs: number, signal?: AbortSignal): Promise<string> {
  const wait = RATE_LIMIT_INTERVAL_MS - (Date.now() - lastCliCallAt);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  if (signal?.aborted) throw new Error('已取消');
  lastCliCallAt = Date.now();
  return runCli(args, timeoutMs, signal);
}

/** 生成多轮搜索关键词：雇佣类型组合优先（实习/校招结果更对口），再接原词与同义扩展。 */
export function buildSearchKeywords(targetRole: string, employmentType: EmploymentType): string[] {
  const role = targetRole.trim().replace(/\s+/g, ' ');
  const typeTerm = employmentType === 'internship' ? '实习' : '校招';
  const variants = [`${role}${typeTerm}`, role];
  if (!/工程师$/.test(role)) variants.push(`${role}工程师`);
  if (!/(开发|工程师)$/.test(role)) variants.push(`${role}开发`);
  const seen = new Set<string>();
  return variants.filter((v) => {
    const key = v.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** 按 标题+公司（猎聘同岗多贴很常见）或详情链接去重，保持先出现者优先。 */
export function dedupeLiepinJobs(jobs: RawLiepinJob[]): RawLiepinJob[] {
  const seen = new Set<string>();
  const out: RawLiepinJob[] = [];
  for (const job of jobs) {
    const titleCompany = `${(job.jobName ?? '').trim()}|${(job.company ?? '').trim()}`.toLowerCase();
    const key = titleCompany !== '|'
      ? `tc:${titleCompany}`
      : job.jobDetailUrl
        ? `url:${job.jobDetailUrl.replace(/\/$/, '').toLowerCase()}`
        : job.jobId != null
          ? `id:${job.jobId}`
          : '';
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(job);
  }
  return out;
}

/** 岗位词的通用片段：单独命中不能证明相关性（"开发/工程/软件"几乎所有技术岗都有）。 */
const GENERIC_GRAMS = new Set([
  '开发', '工程', '程师', '软件', '技术', '设计', '产品', '运营', '测试', '数据', '分析', '管理', '专员', '助理', '实施',
]);

function gramsOf(term: string): string[] {
  const t = term.toLowerCase();
  if (t.length <= 2) return [t];
  const grams: string[] = [];
  for (let i = 0; i + 2 <= t.length; i++) grams.push(t.slice(i, i + 2));
  return grams;
}

/** 年限描述的下限（"1-3年"→1，"3年以上"→3，"经验不限"→null）。 */
export function yearsLowerBound(workYears?: string): number | null {
  const m = /(\d+)/.exec(workYears ?? '');
  return m ? Number(m[1]) : null;
}

/**
 * 相关性筛选：只剔除明确不相关的岗位（猎聘结果较泛，过度过滤会损失样本）。
 * 规则：命中完整关键词，或命中半数以上非通用二字片段（"前端开发"的区分片段是"前端"，"开发"为通用片段不计）。
 * 不做年限硬过滤——资深岗位仍可用于对比分析，由排序阶段把更匹配的排在前面。
 */
export function filterRelevantJobs(
  jobs: RawLiepinJob[],
  targetRole: string,
  employmentType: EmploymentType
): { kept: RawLiepinJob[]; filtered: number; filterRelaxed: boolean } {
  const tokens = targetRole
    .split(/[\s/·,，、|]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
  const matchesRole = (hay: string): boolean => {
    if (!tokens.length) return true;
    return tokens.some((token) => {
      const t = token.toLowerCase();
      if (hay.includes(t)) return true;
      const grams = gramsOf(token);
      const distinctive = grams.filter((g) => !GENERIC_GRAMS.has(g));
      const basis = distinctive.length ? distinctive : grams;
      const hits = basis.filter((g) => hay.includes(g)).length;
      return hits / basis.length >= 0.5;
    });
  };
  const kept = jobs.filter((job) => {
    const hay = [job.jobName ?? '', job.industry ?? '', ...(job.companyTags ?? [])].join(' ').toLowerCase();
    return matchesRole(hay);
  });
  if (!kept.length && jobs.length) return { kept: jobs, filtered: 0, filterRelaxed: true };
  return { kept, filtered: jobs.length - kept.length, filterRelaxed: false };
}

/**
 * 按与求职意向的匹配度排序（稳定）：实习搜索优先 标题含"实习" > 经验要求低 > 资深岗。
 * 资深岗位保留在池中，样本不足时仍可补充，并在 note 中如实标注。
 */
export function rankByFit(jobs: RawLiepinJob[], employmentType: EmploymentType): RawLiepinJob[] {
  const score = (job: RawLiepinJob): number => {
    if (employmentType !== 'internship') return 0;
    let s = 0;
    if (/实习|intern/i.test(job.jobName ?? '')) s += 2;
    const years = yearsLowerBound(job.workYears);
    if (years === null || years < 3) s += 1;
    return s;
  };
  return jobs
    .map((job, index) => ({ job, index }))
    .sort((a, b) => score(b.job) - score(a.job) || a.index - b.index)
    .map((entry) => entry.job);
}

/** 全量池的轻量汇总：学历与经验分布，供 note 与上层总结使用。 */
export function summarizePool(jobs: RawLiepinJob[]): string {
  const count = (pick: (j: RawLiepinJob) => string | undefined) => {
    const map = new Map<string, number>();
    for (const j of jobs) {
      const v = pick(j)?.trim();
      if (v) map.set(v, (map.get(v) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, n]) => `${k}×${n}`).join('、');
  };
  const parts: string[] = [];
  const edu = count((j) => j.education);
  const exp = count((j) => j.workYears);
  const city = count((j) => j.location?.split(/[·\s]/)[0]);
  if (edu) parts.push(`学历分布：${edu}`);
  if (exp) parts.push(`经验要求：${exp}`);
  if (city) parts.push(`城市分布：${city}`);
  return parts.join('；');
}

/**
 * 猎聘岗位搜索（官方 CLI，多轮关键词 × 翻页，限速 ≤60rpm）。返回统一 JobSample：
 * 搜索结果字段 + 详情页 JD 正文（供技能抽取）；失败如实返回 ok:false（上层降级其他通道）。
 */
export async function liepinSearchJobs(
  input: {
    targetRole: string;
    city?: string;
    employmentType: EmploymentType;
    sampleLimit: number;
  },
  opts: { signal?: AbortSignal; onProgress?: (message: string) => void } = {}
): Promise<LiepinSearchOutcome> {
  const signal = opts.signal;
  if (!process.env.LIEPIN_USER_TOKEN) {
    return { samples: [], ok: false, note: '未配置 LIEPIN_USER_TOKEN（猎聘官方通道未启用）。' };
  }
  if (!cliPath()) {
    return { samples: [], ok: false, note: '未找到 liepin-cli（tools/liepin-cli/.venv，安装见 README）。' };
  }
  const poolTarget = poolTargetFor(input.sampleLimit);
  const cacheKey = `${input.targetRole}|${input.city ?? ''}|${poolTarget}`;
  const cached = cache.get(cacheKey);
  let raw: RawLiepinJob[] = [];
  let fromCache = false;
  let lastErr = '';
  let rounds = 0;
  let rawTotal = 0;
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    raw = cached.jobs;
    fromCache = true;
    cacheSet(cacheKey, cached); // 命中也刷新新鲜度（LRU）
  } else {
    // 多轮搜索：关键词 × 翻页，达到候选池目标或用尽调用配额即停
    const keywords = buildSearchKeywords(input.targetRole, input.employmentType);
    const collected: RawLiepinJob[] = [];
    let calls = 0;
    let consecutiveEmpty = 0;
    outer: for (const keyword of keywords) {
      for (let page = 0; page < MAX_PAGES_PER_KEYWORD; page++) {
        if (calls >= MAX_SEARCH_CALLS || consecutiveEmpty >= 2) break outer;
        // 同岗多贴与筛选损耗大，按去重后数量判断候选池是否足够
        if (dedupeLiepinJobs(collected).length >= poolTarget) break outer;
        if (signal?.aborted) throw new Error('已取消');
        calls++;
        opts.onProgress?.(`猎聘搜索「${keyword}」第 ${page + 1} 页（已收集 ${collected.length} 条）…`);
        let list: RawLiepinJob[] = [];
        try {
          const stdout = await rateLimitedCli(
            ['job', 'search', '--job-name', keyword, ...(input.city ? ['--address', input.city] : []), '--page', String(page), '--output', 'json'],
            30_000,
            signal
          );
          const parsed = JSON.parse(stdout.replace(/^[^{[]*/, '')) as { data?: { list?: RawLiepinJob[] } };
          list = parsed.data?.list ?? [];
        } catch (err) {
          lastErr = err instanceof Error ? err.message : String(err);
          break; // 该关键词后续翻页大概率同样失败，换下一个关键词
        }
        if (!list.length) {
          consecutiveEmpty++;
          lastErr = lastErr || '接口返回空列表（可能触发限流，稍后重试或更换关键词）';
          break; // 空页即该关键词结果耗尽
        }
        consecutiveEmpty = 0;
        collected.push(...list);
        if (list.length < 10) break; // 不足一页，说明该关键词结果已取完
      }
    }
    rounds = calls;
    rawTotal = collected.length;
    raw = dedupeLiepinJobs(collected);
    if (raw.length) cacheSet(cacheKey, { at: Date.now(), jobs: raw });
    else if (rawTotal > 0) lastErr = '去重后无有效岗位';
  }
  if (!raw.length) {
    return { samples: [], ok: false, note: `猎聘官方搜索失败（${lastErr || '无结果'}），已回退其他通道。` };
  }

  const { kept, filtered, filterRelaxed } = filterRelevantJobs(raw, input.targetRole, input.employmentType);
  const ranked = rankByFit(kept, input.employmentType);
  const poolSummary = summarizePool(ranked);
  const now = new Date().toISOString();
  const selected = ranked.slice(0, input.sampleLimit);
  const seniorInSelected = input.employmentType === 'internship'
    ? selected.filter((job) => {
        const years = yearsLowerBound(job.workYears);
        return years !== null && years >= 3;
      }).length
    : 0;
  // 详情页正文抓取（网页抓取，不占 MCP 配额；并发 3 控制耗时与礼貌性）
  const descriptions = new Map<RawLiepinJob, string>();
  let fetched = 0;
  let index = 0;
  const workers = Array.from({ length: 3 }, async () => {
    while (index < selected.length) {
      if (signal?.aborted) throw new Error('已取消');
      const job = selected[index++];
      if (!job.jobDetailUrl) continue;
      opts.onProgress?.(`正在抓取岗位详情 ${index}/${selected.length}…`);
      try {
        const html = await fetchText(job.jobDetailUrl, 12000, undefined, { signal });
        const jd = extractJdFromHtml(html);
        if (jd) {
          descriptions.set(job, jd.description);
          fetched++;
        }
      } catch {
        /* 单条失败不阻断 */
      }
    }
  });
  await Promise.all(workers);

  const samples: JobSample[] = [];
  for (const job of selected) {
    const description = descriptions.get(job) ?? '';
    const structured = [
      job.jobName ? `岗位：${job.jobName}` : '',
      job.company ? `公司：${job.company}` : '',
      job.salary ? `薪资：${job.salary}` : '',
      job.education ? `学历要求：${job.education}` : '',
      job.workYears ? `经验要求：${job.workYears}` : '',
      job.industry ? `行业：${job.industry}` : '',
      Array.isArray(job.companyTags) && job.companyTags.length ? `方向标签：${job.companyTags.join('、')}` : '',
    ]
      .filter(Boolean)
      .join('；');
    samples.push({
      title: String(job.jobName ?? '猎聘岗位').slice(0, 100),
      company: job.company ? String(job.company) : null,
      location: job.location ? String(job.location) : input.city ?? null,
      employment_type: input.employmentType,
      education_requirement: job.education ? String(job.education) : null,
      experience_requirement: job.workYears ? String(job.workYears) : null,
      skills: [], // 由主管线抽取（关键词/LLM）
      description: (description ? `${structured}。岗位描述：${description}` : structured).slice(0, 4000),
      source_url: job.jobDetailUrl ?? 'https://www.liepin.com',
      fetched_at: now,
      source_type: 'web' as const,
    });
  }
  const stats: LiepinSearchStats = { rounds, rawCount: rawTotal, dedupedCount: raw.length, filteredCount: filtered };
  const parts = [
    fromCache
      ? `猎聘官方渠道命中缓存，候选池 ${stats.dedupedCount} 条`
      : `猎聘官方渠道经 ${stats.rounds} 轮搜索（限速 ≤60 次/分钟）收集 ${stats.rawCount} 条、去重后 ${stats.dedupedCount} 条`,
  ];
  if (stats.filteredCount > 0) parts.push(`剔除明确不相关 ${stats.filteredCount} 条`);
  if (filterRelaxed) parts.push('候选过少，已放宽相关性过滤');
  parts.push(`返回 ${samples.length} 条实时岗位（其中 ${fetched} 条已抓取完整 JD 正文）`);
  if (seniorInSelected > 0) parts.push(`其中 ${seniorInSelected} 条要求 3 年以上经验，供对比参考`);
  if (poolSummary) parts.push(poolSummary);
  parts.push('来源：liepin.com，均附原始链接');
  return { samples, ok: true, note: `${parts.join('；')}。` };
}
