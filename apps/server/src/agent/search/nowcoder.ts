// 牛客（nowcoder.com）岗位通道：岗位数据内嵌在 window.__INITIAL_STATE__ 里，免登录、服务端直出，
// 比搜索引擎 HTML 抽取更稳定。发现分三路，可互相兜底：
//   1) 列表页（首选）：/jobs/intern/center、/jobs/school/jobs、/jobs/fulltime/center 服务端 SSR 直出
//      每页 20 条岗位，且每条已含完整 ext 正文（infos/requirements），**无需逐条抓详情页、无需搜索引擎**；
//   2) 站点地图（补充广度）：/sitemap/nowpick/sitemap.xml 汇总全站活跃岗位详情链接，按需抓详情；
//   3) 必应 site:（定向补充，依赖代理环境）。
// 技能抽取交给主管线（与 liepin 通道一致：本通道只负责拿到干净正文与来源链接）。
import type { JobSample, EmploymentType } from '@pathpilot/shared';
import { config } from '../../config.js';
import { fetchText, HTML_PAGE_MAX_BYTES, searchJobPages } from './webSearch.js';
import type { Limiter } from './limit.js';

export interface NowcoderSearchOutcome {
  samples: JobSample[];
  note: string;
  ok: boolean;
  /** 抓取/解析失败的页面数：通道成功时也要如实回报，供上层统计 parseFailedCount */
  failedCount: number;
}

/** 牛客通道默认启用；需要临时关闭时设置 NOWCODER_DISABLE=1（例如离线环境或临时降级）。 */
export function nowcoderConfigured(): boolean {
  return process.env.NOWCODER_DISABLE !== '1';
}

/** 从页面 HTML 中定位并解析 window.__INITIAL_STATE__（大括号配对，跳过字符串里的括号）。 */
export function extractInitialState(html: string): unknown | null {
  const marker = 'window.__INITIAL_STATE__';
  const at = html.indexOf(marker);
  if (at < 0) return null;
  const start = html.indexOf('{', at);
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let escaped = false;
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (inStr) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

export interface ParsedNowcoderJob {
  title: string;
  company: string | null;
  location: string | null;
  salary: string | null;
  description: string;
  education: string | null;
  experience: string | null;
  /** 岗位真实招聘类型（来自 recruitType）；无法判定时为 null，由来源页面类型兜底 */
  employmentType: EmploymentType | null;
}

/**
 * 牛客 recruitType：1=校招、2=实习、3=社招；0/缺失表示未标注（实测实习中心约半数岗位为 0）。
 * 未标注时不臆断类型，交给调用方用来源页面类型兜底。
 */
export function employmentTypeOfRecruitType(recruitType: unknown): EmploymentType | null {
  if (recruitType === 2) return 'internship';
  if (recruitType === 1 || recruitType === 3) return 'full_time';
  return null;
}

function pickEducation(text: string): string | null {
  return /(博士|硕士|研究生|本科及以上|本科|大专|专科|学历不限)/.exec(text)?.[1] ?? null;
}

function pickExperience(text: string): string | null {
  return /(\d+年(?:以上)?(?:工作|开发|相关)?经验|应届(?:生)?|在校生|实习生|实习经历|经验不限)/.exec(text)?.[1] ?? null;
}

/**
 * 从一条牛客岗位数据对象构建结构化岗位。
 * 详情页的 `store.jobDetail.detail` 与列表页 `jobList[i].data` 是同一套字段结构，共用此函数。
 * 解析不到正文时返回 null（不编造）。
 */
function buildParsedJob(detail: Record<string, unknown>, fallbackType?: EmploymentType | null): ParsedNowcoderJob | null {
  const jobName = typeof detail.jobName === 'string' ? detail.jobName.trim() : '';
  if (!jobName) return null;

  // ext 是 JSON 字符串，含 infos（岗位职责）与 requirements（任职要求）。
  let infos = '';
  let requirements = '';
  const extRaw = detail.ext;
  if (typeof extRaw === 'string' && extRaw.trim()) {
    try {
      const ext = JSON.parse(extRaw) as { infos?: unknown; requirements?: unknown };
      infos = typeof ext.infos === 'string' ? ext.infos : '';
      requirements = typeof ext.requirements === 'string' ? ext.requirements : '';
    } catch {
      /* ext 非法 JSON 时忽略，回落到其它字段 */
    }
  } else if (extRaw && typeof extRaw === 'object') {
    const ext = extRaw as { infos?: unknown; requirements?: unknown };
    infos = typeof ext.infos === 'string' ? ext.infos : '';
    requirements = typeof ext.requirements === 'string' ? ext.requirements : '';
  }

  const parts: string[] = [];
  if (infos.trim()) parts.push(`岗位职责：${infos.trim()}`);
  if (requirements.trim()) parts.push(`任职要求：${requirements.trim()}`);
  const description = parts.join('\n').trim();
  // 正文太短说明不是可用的 JD（可能是登录墙/占位页），不产出样本。
  if (description.length < 40) return null;

  const company =
    (detail.recommendInternCompany as { companyName?: unknown } | undefined)?.companyName;
  const salaryMin = typeof detail.salaryMin === 'number' ? detail.salaryMin : null;
  const salaryMax = typeof detail.salaryMax === 'number' ? detail.salaryMax : null;
  const salaryMonth = typeof detail.salaryMonth === 'number' ? detail.salaryMonth : null;
  // 牛客用 salaryMin=0 / salaryMax=9999999 表示“面议”，不当成真实薪资。
  const isNegotiable = salaryMax !== null && salaryMax >= 9_999_999;
  const salary =
    !isNegotiable && salaryMin !== null && salaryMax !== null && salaryMax > 0
      ? `${salaryMin}-${salaryMax}${salaryMonth && salaryMonth > 0 ? `·${salaryMonth}薪` : ''}`
      : null;

  return {
    title: jobName.slice(0, 100),
    company: typeof company === 'string' && company.trim() ? company.trim() : null,
    location: typeof detail.jobCity === 'string' && detail.jobCity.trim() ? detail.jobCity.trim() : null,
    salary,
    description,
    education: pickEducation(requirements || description),
    experience: pickExperience(requirements || description),
    employmentType: employmentTypeOfRecruitType(detail.recruitType) ?? fallbackType ?? null,
  };
}

/** 从详情页 HTML 解析出一条结构化岗位；解析不到正文时返回 null（不编造）。 */
export function parseNowcoderDetail(html: string, fallbackType?: EmploymentType | null): ParsedNowcoderJob | null {
  const state = extractInitialState(html) as
    | { store?: { jobDetail?: { detail?: Record<string, unknown> | null } } }
    | null;
  const detail = state?.store?.jobDetail?.detail;
  if (!detail || typeof detail !== 'object') return null;
  return buildParsedJob(detail, fallbackType);
}

// ---------------------------------------------------------------------------
// 列表页解析（首选发现路径）：服务端 SSR 直出，每条岗位已含完整正文，无需逐条抓详情。
// ---------------------------------------------------------------------------

interface DiscoveredJob {
  parsed: ParsedNowcoderJob;
  url: string;
}

interface RawListJob {
  data: Record<string, unknown>;
}

/** 递归收集 __INITIAL_STATE__ 中形如 [{ data: { jobName, ... } }] 的岗位数组（每页 20 条）。 */
function collectJobDataArrays(node: unknown, out: RawListJob[], depth = 0): void {
  if (depth > 9 || node == null) return;
  if (Array.isArray(node)) {
    if (node.length) {
      const first = node[0] as Record<string, unknown> | null;
      if (first && typeof first === 'object') {
        const firstData =
          first.data && typeof first.data === 'object'
            ? (first.data as Record<string, unknown>)
            : first;
        if (typeof firstData.jobName === 'string') {
          for (const item of node) {
            const it = item as Record<string, unknown> | null;
            if (it && typeof it === 'object') {
              const data =
                it.data && typeof it.data === 'object' ? (it.data as Record<string, unknown>) : it;
              if (typeof data.jobName === 'string') out.push({ data });
            }
          }
        }
      }
    }
    return;
  }
  if (typeof node === 'object') {
    for (const v of Object.values(node as Record<string, unknown>)) {
      collectJobDataArrays(v, out, depth + 1);
    }
  }
}

/**
 * 解析列表页 __INITIAL_STATE__ 中内嵌的岗位数组，返回结构化岗位 + 详情链接（用岗位 id 拼出）。
 * pageType 是该列表页自身的招聘类型，用于兜底 recruitType 未标注的岗位。
 */
export function parseNowcoderListJobs(html: string, pageType?: EmploymentType): DiscoveredJob[] {
  const state = extractInitialState(html);
  if (!state) return [];
  const raw: RawListJob[] = [];
  collectJobDataArrays(state, raw);
  const out: DiscoveredJob[] = [];
  for (const { data } of raw) {
    const parsed = buildParsedJob(data, pageType);
    if (!parsed) continue;
    const id = typeof data.id === 'number' ? data.id : null;
    out.push({
      parsed,
      url: id !== null ? `https://www.nowcoder.com/jobs/detail/${id}` : 'https://www.nowcoder.com/jobs',
    });
  }
  return out;
}

/** 列表页面（按招聘类型的服务端直出列表页）。internship 走实习中心，full_time 走校招+社招中心。 */
const LIST_PAGES: { url: string; employmentType: EmploymentType }[] = [
  { url: 'https://www.nowcoder.com/jobs/intern/center', employmentType: 'internship' },
  { url: 'https://www.nowcoder.com/jobs/school/jobs', employmentType: 'full_time' },
  { url: 'https://www.nowcoder.com/jobs/fulltime/center', employmentType: 'full_time' },
];

/** 抓取列表页并解析内嵌岗位（并发，单页失败不影响其它页）。这是不依赖搜索引擎的高质量发现路径。 */
async function discoverListPageJobs(
  employmentType: EmploymentType,
  timeoutMs: number,
  signal?: AbortSignal,
  onProgress?: (message: string) => void,
  limiter?: Limiter
): Promise<DiscoveredJob[]> {
  onProgress?.('正在读取牛客岗位列表页…');
  // 只抓与请求类型一致的列表页：全职检索不再抓实习中心（其中的岗位随后也会被类型过滤掉，只是白跑请求）。
  const pages = LIST_PAGES.filter((p) => p.employmentType === employmentType);
  const lists = await Promise.all(
    pages.map(async (p) => {
      try {
        const html = await fetchText(p.url, Math.min(timeoutMs, 8000), HTML_PAGE_MAX_BYTES, { signal, failOnTruncate: true, limiter });
        return parseNowcoderListJobs(html, p.employmentType);
      } catch {
        return [] as DiscoveredJob[];
      }
    })
  );
  const seen = new Set<string>();
  const out: DiscoveredJob[] = [];
  for (const list of lists) {
    for (const job of list) {
      if (seen.has(job.url)) continue;
      seen.add(job.url);
      out.push(job);
    }
  }
  return out;
}

function isNowcoderDetailUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return /(^|\.)nowcoder\.com$/i.test(url.hostname) && /\/jobs\/detail\//i.test(url.pathname);
  } catch {
    return false;
  }
}

// 候选链接池缓存（与 liepin 通道相近的轻量 LRU，10 分钟）。只缓存“来源链接”，正文仍按需抓取。
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 100;
const urlCache = new Map<string, { at: number; urls: string[] }>();

function cacheSet(key: string, urls: string[]): void {
  urlCache.delete(key);
  urlCache.set(key, { at: Date.now(), urls });
  while (urlCache.size > CACHE_MAX_ENTRIES) {
    const oldest = urlCache.keys().next().value;
    if (oldest === undefined) break;
    urlCache.delete(oldest);
  }
}

const SITEMAP_INDEX_URL = 'https://www.nowcoder.com/sitemap/nowpick/sitemap.xml';

function extractLocs(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);
}

/**
 * 从牛客优聘站点地图直接发现岗位详情链接（服务端直出，不依赖必应/搜索引擎）。
 * 站点地图索引 → 若干 sitemapN.xml → 汇总所有 /jobs/detail/ 链接。
 */
async function discoverSitemapUrls(
  timeoutMs: number,
  signal?: AbortSignal,
  onProgress?: (message: string) => void,
  limiter?: Limiter
): Promise<string[]> {
  onProgress?.('正在读取牛客站点地图获取岗位列表…');
  const indexXml = await fetchText(SITEMAP_INDEX_URL, timeoutMs, HTML_PAGE_MAX_BYTES, { signal, failOnTruncate: true, limiter });
  const childMaps = extractLocs(indexXml).filter((u) => /\/nowpick\/sitemap\d+\.xml$/i.test(u));
  if (!childMaps.length) return [];
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const mapUrl of childMaps.slice(0, 3)) {
    if (signal?.aborted) throw new Error('已取消');
    try {
      const xml = await fetchText(mapUrl, timeoutMs, HTML_PAGE_MAX_BYTES, { signal, failOnTruncate: true, limiter });
      for (const loc of extractLocs(xml)) {
        if (!isNowcoderDetailUrl(loc)) continue;
        const clean = loc.split('?')[0].replace(/\/$/, '');
        if (seen.has(clean)) continue;
        seen.add(clean);
        urls.push(clean);
      }
    } catch {
      /* 单个子地图失败不影响其它 */
    }
  }
  return urls;
}

/** 必应 site: 搜索发现牛客岗位详情链接（作为列表页/站点地图的定向补充，依赖代理环境）。 */
async function discoverBingUrls(
  input: { targetRole: string; employmentType: EmploymentType },
  limit: number,
  timeoutMs: number,
  signal?: AbortSignal,
  onProgress?: (message: string) => void,
  limiter?: Limiter
): Promise<string[]> {
  const role = input.targetRole.trim().replace(/\s+/g, ' ');
  const typeTerm = input.employmentType === 'internship' ? '实习' : '校招';
  const queries = [
    `site:nowcoder.com/jobs/detail ${role} ${typeTerm}`,
    `site:nowcoder.com/jobs/detail ${role}`,
  ];
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const query of queries) {
    if (signal?.aborted) throw new Error('已取消');
    if (urls.length >= limit) break;
    onProgress?.(`正在通过必应检索牛客岗位（${query}）…`);
    let found: { title: string; url: string }[] = [];
    try {
      found = await searchJobPages(query, Math.min(limit, 10), timeoutMs, signal, limiter);
    } catch {
      continue; // 该查询失败不阻断其它查询
    }
    for (const hit of found) {
      if (!isNowcoderDetailUrl(hit.url)) continue;
      const key = hit.url.split('?')[0].replace(/\/$/, '');
      if (seen.has(key)) continue;
      seen.add(key);
      urls.push(hit.url);
      if (urls.length >= limit) break;
    }
  }
  return urls;
}

/** 发现候选详情链接：站点地图为主（不依赖搜索引擎），必应为定向补充；结果去重后按“必应定向命中优先”排序。 */
async function discoverDetailUrls(
  input: { targetRole: string; employmentType: EmploymentType },
  timeoutMs: number,
  signal?: AbortSignal,
  onProgress?: (message: string) => void,
  limiter?: Limiter
): Promise<string[]> {
  const cacheKey = `urls|${input.targetRole}|${input.employmentType}`;
  const cached = urlCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    cacheSet(cacheKey, cached.urls); // 命中刷新 LRU
    return cached.urls;
  }

  const [bing, sitemap] = await Promise.all([
    discoverBingUrls(input, 20, timeoutMs, signal, onProgress, limiter).catch(() => [] as string[]),
    discoverSitemapUrls(timeoutMs, signal, onProgress, limiter).catch(() => [] as string[]),
  ]);

  const seen = new Set<string>();
  const merged: string[] = [];
  for (const url of [...bing, ...sitemap]) {
    const key = url.split('?')[0].replace(/\/$/, '').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(url);
  }
  if (merged.length) cacheSet(cacheKey, merged);
  return merged;
}

/** 岗位词的相关性片段（与 liepin 同规则：完整命中，或命中半数以上非通用二字片段）。 */
const GENERIC_GRAMS = new Set([
  '开发', '工程', '程师', '软件', '技术', '设计', '产品', '运营', '测试', '数据', '分析', '管理', '专员', '助理', '实施',
]);

export function matchesRole(hay: string, targetRole: string): boolean {
  const tokens = targetRole
    .split(/[\s/·,，、|]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
  if (!tokens.length) return true;
  return tokens.some((token) => {
    const t = token.toLowerCase();
    if (hay.includes(t)) return true;
    const grams: string[] = [];
    if (t.length <= 2) grams.push(t);
    else for (let i = 0; i + 2 <= t.length; i++) grams.push(t.slice(i, i + 2));
    const distinctive = grams.filter((g) => !GENERIC_GRAMS.has(g));
    const basis = distinctive.length ? distinctive : grams;
    // 二字片段会跨词边界切出无意义片段（“后端开发”里的“端开”），只按半数命中会把后端岗位判成前端岗位。
    // 中文复合词的语义中心在词首二字（“前端开发”→“前端”），因此词首片段必须命中。
    if (t.length >= 3 && !hay.includes(t.slice(0, 2))) return false;
    const hits = basis.filter((g) => hay.includes(g)).length;
    return hits / basis.length >= 0.5;
  });
}

/** 词条整体出现（不做二字片段近似）：放宽路径专用，避免正文里“顺带提到前端”的岗位混进来。 */
function containsWholeToken(hay: string, targetRole: string): boolean {
  return targetRole
    .split(/[\s/·,，、|]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
    .some((t) => hay.includes(t.toLowerCase()));
}

/**
 * 按岗位词收敛样本：以标题为主信号（正文里顺带提到“前端”的算法/后端岗位不算命中）；
 * 仅当标题全都匹配不上时才放宽到“标题 + 正文”，且放宽也要求岗位词整体出现，
 * 避免为了凑数把不相关岗位塞进岗位洞察。
 */
export function pickRelevantByRole<T>(
  items: T[],
  targetRole: string,
  titleOf: (item: T) => string,
  bodyOf: (item: T) => string
): T[] {
  const byTitle = items.filter((item) => matchesRole(titleOf(item).toLowerCase(), targetRole));
  if (byTitle.length) return byTitle;
  return items.filter((item) => containsWholeToken(`${titleOf(item)} ${bodyOf(item)}`.toLowerCase(), targetRole));
}

/**
 * 牛客岗位搜索：
 *   1) 列表页（首选，SSR 直出，已含正文，无需抓详情）→ 直接得到候选岗位；
 *   2) 站点地图补充广度 → 抓详情页解析；
 *   3) 必应定向补充（依赖代理）。
 * 合并后按岗位相关性筛选与排序 → 组装统一 JobSample。任何一步失败都如实返回 ok:false（上层降级其它通道），绝不填充虚构样本。
 */
export async function nowcoderSearchJobs(
  input: { targetRole: string; city?: string; employmentType: EmploymentType; sampleLimit: number },
  opts: { signal?: AbortSignal; onProgress?: (message: string) => void; timeoutMs?: number; limiter?: Limiter } = {}
): Promise<NowcoderSearchOutcome> {
  if (!nowcoderConfigured()) return { samples: [], ok: false, failedCount: 0, note: '牛客通道已关闭（NOWCODER_DISABLE=1）。' };
  // 上层传入的是发现阶段剩余预算（并行下各通道起点相同），这里取更小者，避免单通道吃掉全部时间。
  const timeoutMs = Math.min(config.search.timeoutMs, opts.timeoutMs ?? Number.POSITIVE_INFINITY);
  const signal = opts.signal;
  const startedAt = Date.now();
  // 整体时间预算：留 3.5s 余量给上层，避免超过 SEARCH_TIMEOUT_MS。
  const deadline = startedAt + Math.max(timeoutMs - 3500, Math.floor(timeoutMs * 0.5));

  // 1) 列表页（首选）：不依赖搜索引擎、无需逐条抓详情，直出完整岗位。
  const listJobs = await discoverListPageJobs(
    input.employmentType,
    timeoutMs,
    signal,
    opts.onProgress,
    opts.limiter
  ).catch(() => [] as DiscoveredJob[]);
  const listUrls = new Set(listJobs.map((j) => j.url));

  // 2) 站点地图 / 必应补充广度：排除列表页已覆盖的岗位，剩余按预算抓详情。
  // 详情抓取预算随样本量收敛（原实现最少 32 个、最多 64 个详情请求，实测每次搜索要打 30+ 次）。
  const fetchBudget = Math.min(Math.max(input.sampleLimit * 3, 12), 32);
  let sitemapUrls: string[] = [];
  try {
    const discovered = await discoverDetailUrls(input, timeoutMs, signal, opts.onProgress, opts.limiter);
    sitemapUrls = discovered
      .map((u) => u.split('?')[0].replace(/\/$/, ''))
      .filter((u) => !listUrls.has(u))
      .slice(0, fetchBudget);
  } catch {
    sitemapUrls = [];
  }

  const now = new Date().toISOString();
  const parsedJobs: DiscoveredJob[] = [...listJobs];
  const failures: string[] = [];
  let index = 0;
  let reachedDeadline = false;
  if (sitemapUrls.length) {
    // 并发 3：并行抓取时全局在途上限为 8，单通道不必再开 5 个 worker。
    const workers = Array.from({ length: 3 }, async () => {
      while (index < sitemapUrls.length) {
        // 取消/超时：保留已解析的岗位，不再继续抓。
        if (signal?.aborted) return;
        if (Date.now() > deadline) {
          reachedDeadline = true;
          return;
        }
        const url = sitemapUrls[index++];
        opts.onProgress?.(`正在抓取牛客岗位 ${index}/${sitemapUrls.length}…`);
        try {
          const html = await fetchText(url, Math.min(timeoutMs, 8000), HTML_PAGE_MAX_BYTES, { signal, failOnTruncate: true, limiter: opts.limiter });
          const parsed = parseNowcoderDetail(html);
          if (!parsed) {
            failures.push('正文解析不足（可能为登录墙/岗位下线/页面结构变化）');
            continue;
          }
          parsedJobs.push({ parsed, url });
        } catch (err) {
          // 取消/超时导致的失败不计入解析失败，避免污染 failedCount 与 note。
          if (signal?.aborted || Date.now() > deadline) return;
          failures.push(err instanceof Error ? err.message : '抓取失败');
        }
      }
    });
    await Promise.all(workers);
  }

  // 类型收敛：列表页与站点地图里混有实习/校招/社招岗位，必须按岗位自身的真实类型过滤，
  // 不能把输入类型直接当标签（否则全职检索会把实习岗标成全职，污染岗位洞察的学历/经验分布）。
  const typeLabel = input.employmentType === 'internship' ? '实习' : '全职';
  const typed = parsedJobs.filter(({ parsed }) => parsed.employmentType === null || parsed.employmentType === input.employmentType);
  if (!typed.length && parsedJobs.length > 0) {
    return {
      samples: [],
      ok: false,
      failedCount: failures.length,
      note: `牛客通道解析出 ${parsedJobs.length} 条岗位，但均非「${typeLabel}」类型，已回退其它通道。`,
    };
  }

  // 相关性筛选 + 去重（标题+公司）——列表页/站点地图是宽候选，必须按岗位词收敛，
  // 不能把不相关岗位混进“岗位洞察”（宁可回退其它更定向的通道）。
  const role = input.targetRole;
  const relevant = pickRelevantByRole(typed, role, ({ parsed }) => parsed.title, ({ parsed }) => parsed.description);
  if (!relevant.length && typed.length > 0) {
    return {
      samples: [],
      ok: false,
      failedCount: failures.length,
      note: `牛客通道解析出 ${typed.length} 条「${typeLabel}」岗位，但均与「${role}」不相关，已回退其它更定向的通道。`,
    };
  }

  const seen = new Set<string>();
  const ranked = relevant
    .filter(({ parsed }) => {
      const key = `${parsed.title}|${parsed.company ?? ''}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => {
      if (input.employmentType !== 'internship') return 0;
      const score = (t: string) => (/实习|intern/i.test(t) ? 1 : 0);
      return score(b.parsed.title) - score(a.parsed.title);
    });

  if (!ranked.length) {
    const detail = failures.slice(0, 2).join('；');
    return {
      samples: [],
      ok: false,
      failedCount: failures.length,
      note: `牛客通道未能从列表页/站点地图解析出有效岗位${detail ? `（${detail}）` : ''}，已回退其它通道。`,
    };
  }

  const limited = ranked.slice(0, input.sampleLimit).map(({ parsed, url }) => ({
    title: parsed.title,
    company: parsed.company,
    location: parsed.location ?? input.city ?? null,
    employment_type: parsed.employmentType ?? input.employmentType,
    education_requirement: parsed.education,
    experience_requirement: parsed.experience,
    skills: [] as string[],
    description: (parsed.salary ? `薪资：${parsed.salary}；${parsed.description}` : parsed.description).slice(0, 4000),
    source_url: url,
    fetched_at: now,
    source_type: 'web' as const,
  }));

  const parts = [
    `牛客通道从列表页获取 ${listJobs.length} 条岗位`,
    sitemapUrls.length ? `站点地图/检索补充 ${sitemapUrls.length} 个详情链接（解析 ${parsedJobs.length - listJobs.length} 条）` : '未使用站点地图补充',
    typed.length !== parsedJobs.length ? `类型筛选（${typeLabel}）后 ${typed.length} 条` : '',
    `最终返回 ${limited.length} 条（含来源链接）`,
  ].filter(Boolean);
  if (failures.length) parts.push(`另有 ${failures.length} 个页面解析失败`);
  if (reachedDeadline) parts.push('已按时间预算截断部分页面');
  return { samples: limited, ok: true, failedCount: failures.length, note: `${parts.join('；')}。` };
}
