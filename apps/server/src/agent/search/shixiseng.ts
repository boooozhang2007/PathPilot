// 实习僧（shixiseng.com）岗位通道：搜索页 HTML 直出 `/intern/inn_xxx` 详情链接；
// 详情页是 Nuxt2 SSR，标题被字体反爬混淆（列表里的 name 是 PUA 私有区字符），但**详情页 HTML 中的
// `<title>` 是明文**、JD 正文在 `<div class="job_detail">…</div>` 里也是明文 HTML。
// 因不引入 HTML 解析库、且不 eval 外部 JS（安全），本通道走：搜索页 regex 抓 uuid → 并发抓详情页 →
// 从 `<title>` 拆标题/公司、从 job_detail 容器 strip 标签取正文。技能抽取交给主管线。
import type { JobSample, EmploymentType } from '@pathpilot/shared';
import { config } from '../../config.js';
import { fetchText, HTML_PAGE_MAX_BYTES } from './webSearch.js';
import { pickRelevantByRole } from './nowcoder.js';
import type { Limiter } from './limit.js';

export interface ShixisengSearchOutcome {
  samples: JobSample[];
  note: string;
  ok: boolean;
  /** 详情页抓取/解析失败数：通道成功时也要如实回报 */
  failedCount: number;
}

/** 实习僧通道默认启用；需要临时关闭时设置 SHIXISENG_DISABLE=1。 */
export function shixisengConfigured(): boolean {
  return process.env.SHIXISENG_DISABLE !== '1';
}

const SEARCH_ENDPOINT = 'https://www.shixiseng.com/interns';
const DETAIL_PREFIX = 'https://www.shixiseng.com/intern/';

/** 从搜索页 HTML 中抓取所有详情 uuid（/intern/inn_xxx），去重保序。 */
export function extractInternUuids(html: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of html.matchAll(/\/intern\/(inn_[A-Za-z0-9]+)/g)) {
    const id = m[1];
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, d) => {
      const cp = Number(d);
      return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : '';
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => {
      const cp = parseInt(h, 16);
      return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : '';
    });
}

/** 去标签 + 解实体 + 折叠空白。 */
function stripTags(html: string): string {
  return decodeEntities(html.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 从 startMarker 处的开标签开始，按 div 配对返回该元素的内层 HTML。
 * job_detail 内部只有 <p>/<span> 等行内标签，没有嵌套 div，按 div 计数即可稳妥闭合。
 */
function extractDivInner(html: string, startMarker: string): string | null {
  const at = html.indexOf(startMarker);
  if (at < 0) return null;
  const open = html.indexOf('>', at);
  if (open < 0) return null;
  const re = /<div\b[^>]*>|<\/div>/gi;
  re.lastIndex = open + 1;
  let depth = 1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (/^<\/div/i.test(m[0])) {
      depth--;
      if (depth === 0) return html.slice(open + 1, m.index);
    } else {
      depth++;
    }
  }
  return null;
}

export interface ParsedShixisengJob {
  title: string;
  company: string | null;
  salary: string | null;
  education: string | null;
  description: string;
}

function pickEducation(text: string): string | null {
  return /(博士|硕士|研究生|本科及以上|本科|大专|专科|学历不限)/.exec(text)?.[1] ?? null;
}

/**
 * 从实习僧详情页 HTML 解析一条结构化岗位；正文不足 40 字返回 null（不编造）。
 * 标题优先取 `<title>`（明文）；正文取 `class="job_detail"` 容器，回落到 `class="intern-from-api"`。
 */
export function parseShixisengDetail(html: string): ParsedShixisengJob | null {
  const titleRaw = /<title>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() ?? '';
  let title = '';
  let company: string | null = null;
  const mt = /^(.*?)实习招聘-(.*?)实习生招聘/.exec(titleRaw);
  if (mt) {
    title = mt[1].trim();
    company = mt[2].trim() || null;
  } else {
    title = titleRaw.replace(/[-—]?实习僧.*$/, '').replace(/实习招聘.*$/, '').trim();
  }
  if (!title) title = '实习岗位';

  const inner =
    extractDivInner(html, 'class="job_detail"') ?? extractDivInner(html, 'class="intern-from-api"');
  const description = inner ? stripTags(inner) : '';
  if (description.length < 40) return null;

  // 薪资：优先 “a-b/天” 形式；实习僧实习岗基本都是日薪。
  let salary: string | null = null;
  const day = /(\d{1,4})\s*-\s*(\d{1,4})\s*\/\s*天/.exec(html);
  if (day) salary = `${day[1]}-${day[2]}/天`;
  if (!salary) {
    const month = /(\d{1,4})\s*-\s*(\d{1,4})\s*\/\s*月/.exec(html);
    if (month) salary = `${month[1]}-${month[2]}/月`;
  }

  return {
    title: title.slice(0, 100),
    company,
    salary,
    education: pickEducation(description),
    description,
  };
}

/**
 * 实习僧岗位搜索：搜索页抓 uuid → 并发抓详情页 → 解析标题/JD → 相关性收敛 → JobSample。
 * 实习僧只提供实习岗位；当上层请求全职时本通道直接跳过（回退其它通道）。
 */
export async function shixisengSearchJobs(
  input: { targetRole: string; city?: string; employmentType: EmploymentType; sampleLimit: number },
  opts: { signal?: AbortSignal; onProgress?: (message: string) => void; timeoutMs?: number; limiter?: Limiter } = {}
): Promise<ShixisengSearchOutcome> {
  if (!shixisengConfigured()) return { samples: [], ok: false, failedCount: 0, note: '实习僧通道已关闭（SHIXISENG_DISABLE=1）。' };
  if (input.employmentType === 'full_time') {
    return { samples: [], ok: false, failedCount: 0, note: '实习僧仅提供实习岗位，全职检索已跳过。' };
  }
  // 上层传入的是发现阶段剩余预算（并行下各通道起点相同），这里取更小者，避免单通道吃掉全部时间。
  const timeoutMs = Math.min(config.search.timeoutMs, opts.timeoutMs ?? Number.POSITIVE_INFINITY);
  const signal = opts.signal;
  const role = input.targetRole.trim().replace(/\s+/g, ' ');
  const city = input.city?.trim();
  if (!role) return { samples: [], ok: false, failedCount: 0, note: '实习僧通道缺少目标岗位关键词。' };

  const startedAt = Date.now();
  const deadline = startedAt + Math.max(timeoutMs - 3500, Math.floor(timeoutMs * 0.5));

  const searchUrl =
    `${SEARCH_ENDPOINT}?keyword=${encodeURIComponent(role)}` +
    (city ? `&city=${encodeURIComponent(city)}` : '') +
    '&type=intern';
  opts.onProgress?.('正在读取实习僧搜索页…');
  let searchHtml: string;
  try {
    searchHtml = await fetchText(searchUrl, Math.min(timeoutMs, 9000), HTML_PAGE_MAX_BYTES, { signal, failOnTruncate: true, limiter: opts.limiter });
  } catch (err) {
    return {
      samples: [],
      ok: false,
      failedCount: 0,
      note: `实习僧搜索页抓取失败（${err instanceof Error ? err.message : '未知错误'}），已回退其它通道。`,
    };
  }

  const uuids = extractInternUuids(searchHtml);
  if (!uuids.length) {
    return { samples: [], ok: false, failedCount: 0, note: '实习僧搜索页未解析到岗位链接（可能为风控/结构变化），已回退其它通道。' };
  }

  // 每平台要抓满 sampleLimit，详情失败率不低，候选放宽到 36（全局在途 8 兜底，礼貌性可控）。
  const cap = Math.min(Math.max(input.sampleLimit * 3, 12), 36);
  const targets = uuids.slice(0, cap);
  const now = new Date().toISOString();
  const parsed: { job: ParsedShixisengJob; url: string }[] = [];
  const failures: string[] = [];
  let index = 0;
  let reachedDeadline = false;

  // 并发 3：并行抓取时全局在途上限为 8，单通道不必再开 4 个 worker。
  const workers = Array.from({ length: Math.min(3, targets.length) }, async () => {
    while (index < targets.length) {
      // 取消/超时：保留已解析的岗位，不再继续抓。
      if (signal?.aborted) return;
      if (Date.now() > deadline) {
        reachedDeadline = true;
        return;
      }
      const id = targets[index++];
      const url = `${DETAIL_PREFIX}${id}`;
      opts.onProgress?.(`正在抓取实习僧岗位 ${index}/${targets.length}…`);
      try {
        const html = await fetchText(url, Math.min(timeoutMs, 8000), HTML_PAGE_MAX_BYTES, { signal, failOnTruncate: true, limiter: opts.limiter });
        const job = parseShixisengDetail(html);
        if (!job) {
          failures.push('正文解析不足（页面结构变化或岗位下线）');
          continue;
        }
        parsed.push({ job, url });
      } catch (err) {
        // 取消/超时导致的失败不计入解析失败，避免污染 failedCount 与 note。
        if (signal?.aborted || Date.now() > deadline) return;
        failures.push(err instanceof Error ? err.message : '抓取失败');
      }
    }
  });
  await Promise.all(workers);

  if (!parsed.length) {
    const detail = failures.slice(0, 2).join('；');
    return {
      samples: [],
      ok: false,
      failedCount: failures.length,
      note: `实习僧通道未能解析出有效岗位${detail ? `（${detail}）` : ''}，已回退其它通道。`,
    };
  }

  const seen = new Set<string>();
  const deduped = parsed.filter(({ job }) => {
    const key = `${job.title}|${job.company ?? ''}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const relevant = pickRelevantByRole(deduped, role, ({ job }) => job.title, ({ job }) => job.description);
  const chosen = relevant.length ? relevant : deduped;

  const limited = chosen.slice(0, input.sampleLimit).map(({ job, url }) => ({
    title: job.title,
    company: job.company,
    location: input.city ?? null,
    employment_type: 'internship' as const,
    education_requirement: job.education,
    experience_requirement: null,
    skills: [] as string[],
    description: (job.salary ? `薪资：${job.salary}；${job.description}` : job.description).slice(0, 4000),
    source_url: url,
    fetched_at: now,
    source_type: 'web' as const,
  }));

  const parts = [
    `实习僧通道解析出 ${parsed.length} 条岗位`,
    relevant.length && relevant.length !== deduped.length ? `相关性筛选后 ${chosen.length} 条` : '',
    `最终返回 ${limited.length} 条（含来源链接）`,
  ].filter(Boolean);
  if (failures.length) parts.push(`另有 ${failures.length} 个详情页解析失败`);
  if (reachedDeadline) parts.push('已按时间预算截断部分页面');
  return { samples: limited, ok: true, failedCount: failures.length, note: `${parts.join('；')}。` };
}
