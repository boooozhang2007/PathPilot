// 真实招聘信息联网搜索（PRD 4.2）：搜索引擎发现招聘页 → 白名单域名抓取解析
// 尽力而为 + 如实报告：每个来源记录 parse_status，失败不编造；带超时与大小限制（PRD 6.6）
import type { JobSample, EmploymentType } from '@pathpilot/shared';
import { config } from '../../config.js';
import { liepinConfigured, liepinSearchJobs } from './liepin.js';

export interface SearchAttempt {
  title: string;
  url: string;
  parse_status: 'ok' | 'failed' | 'pending';
  note?: string;
}

export interface WebSearchOutcome {
  samples: JobSample[];
  attempts: SearchAttempt[];
  failedCount: number;
  note: string;
}

/** 允许抓取的招聘相关域名白名单（fetch_job_page 等工具共用同一份） */
export const ALLOWED_HOSTS = [
  'zhipin.com',
  'shixiseng.com',
  'liepin.com',
  'lagou.com',
  'nowcoder.com',
  '51job.com',
  'zhaopin.com',
  'jobui.com',
  'maijob.com',
  'hire.bigmodel.com',
  'careers.tencent.com',
  'job.bytedance.com',
  'jobs.bytedance.com',
  'talent.aliyun.com',
  'campus.alibaba.com',
  'ncss.cn',
  'chinahr.com',
  'linkedin.com',
  'wondercv.com',
];

export function isAllowedJobHost(hostname: string): boolean {
  return ALLOWED_HOSTS.some((d) => hostname === d || hostname.endsWith(`.${d}`));
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function readResponseBody(res: Response, maxBytes: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return await res.text();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  return new TextDecoder('utf-8').decode(concat(chunks));
}

export async function fetchText(
  url: string,
  timeoutMs: number,
  maxBytes = 800_000,
  opts: { signal?: AbortSignal; allowedHosts?: string[] } = {}
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  if (opts.signal) {
    if (opts.signal.aborted) controller.abort();
    else opts.signal.addEventListener('abort', onAbort, { once: true });
  }
  try {
    let current = url;
    for (let redirects = 0; redirects <= 5; redirects++) {
      if (opts.allowedHosts) {
        let host = '';
        try {
          host = new URL(current).hostname;
        } catch {
          throw new Error('URL 格式不正确');
        }
        if (!opts.allowedHosts.some((d) => host === d || host.endsWith(`.${d}`))) {
          throw new Error(`域名 ${host} 不在允许的招聘站点白名单内`);
        }
      }
      const res = await fetch(current, {
        signal: controller.signal,
        headers: { 'User-Agent': UA, 'Accept-Language': 'zh-CN,zh;q=0.9', Accept: 'text/html,application/xhtml+xml' },
        redirect: opts.allowedHosts ? 'manual' : 'follow',
      });
      if (opts.allowedHosts && res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        try {
          await res.body?.cancel();
        } catch {
          /* ignore */
        }
        if (!location) throw new Error(`HTTP ${res.status}`);
        current = new URL(location, current).toString();
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await readResponseBody(res, maxBytes);
    }
    throw new Error('重定向次数过多');
  } finally {
    clearTimeout(timer);
    if (opts.signal) opts.signal.removeEventListener('abort', onAbort);
  }
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const len = chunks.reduce((s, c) => s + c.byteLength, 0);
  const out = new Uint8Array(len);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)));
}

function stripTags(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  ).replace(/\s+/g, ' ');
}

interface SearchHit {
  title: string;
  url: string;
}

/** Tavily 搜索 API（配置 TAVILY_API_KEY 时启用），返回白名单域名结果 */
async function tavilySearch(query: string, limit: number, timeoutMs: number, signal?: AbortSignal): Promise<SearchHit[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.TAVILY_API_KEY}`,
      },
      body: JSON.stringify({ query, max_results: Math.min(limit * 2, 20), search_depth: 'basic' }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { results?: { title: string; url: string; content: string }[] };
    const hits: SearchHit[] = [];
    for (const r of data.results ?? []) {
      try {
        const host = new URL(r.url).hostname;
        if (!isAllowedJobHost(host)) continue;
      } catch {
        continue;
      }
      hits.push({ title: r.title, url: r.url });
      if (hits.length >= limit) break;
    }
    return hits;
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

/** 通过必应网页搜索发现招聘页链接 */
export async function searchJobPages(query: string, limit: number, timeoutMs: number, signal?: AbortSignal): Promise<SearchHit[]> {
  const url = `https://cn.bing.com/search?q=${encodeURIComponent(query)}&count=${Math.min(limit * 2, 30)}`;
  const html = await fetchText(url, timeoutMs, undefined, { signal });
  const hits: SearchHit[] = [];
  // 解析 b_algo 结果块中的 <h2><a href>
  const re = /<li\b[^>]*class\s*=\s*["'][^"']*\bb_algo\b[^"']*["'][\s\S]*?<h2[^>]*>\s*<a[^>]+href\s*=\s*["'](https?:\/\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && hits.length < limit) {
    const href = decodeEntities(m[1]);
    const title = stripTags(m[2]).trim();
    try {
      const host = new URL(href).hostname;
      if (!isAllowedJobHost(host)) continue;
    } catch {
      continue;
    }
    if (title && href) hits.push({ title, url: href });
  }
  if (!hits.length) {
    const fallback = /<h2[^>]*>\s*<a[^>]+href\s*=\s*[\"'](https?:\/\/[^\"']+)[\"'][^>]*>([\s\S]*?)<\/a>/gi;
    while ((m = fallback.exec(html)) && hits.length < limit) {
      const href = decodeEntities(m[1]);
      const title = stripTags(m[2]).trim();
      try {
        const host = new URL(href).hostname;
        if (!isAllowedJobHost(host)) continue;
      } catch {
        continue;
      }
      if (title && href && !hits.some((hit) => hit.url === href)) hits.push({ title, url: href });
    }
  }
  return hits;
}

const JD_SECTION_RE =
  /(岗位职责|职位描述|工作职责|岗位描述|任职要求|职位要求|任职资格|工作内容|任职条件)[\s\S]{30,}/;

/** 从招聘页 HTML 提取 JD 正文（尽力而为；提取不足 120 字视为失败） */
export function extractJdFromHtml(html: string): { description: string; education: string | null; experience: string | null } | null {
  const text = stripTags(html);
  const m = JD_SECTION_RE.exec(text);
  const description = (m ? m[0] : text).slice(0, 4000).trim();
  if (description.length < 120) return null;
  const edu = /(本科|硕士|研究生|大专|本科及以上|硕士及以上|学历不限)/.exec(text)?.[1] ?? null;
  const exp =
    /(实习经历|项目经验|工作经验|\d+年(以上)?(工作|开发)?经验|应届|在校生|接受应届)/.exec(text)?.[1] ?? null;
  return { description, education: edu, experience: exp };
}

/**
 * 真实联网搜索岗位样本。任何一步失败都如实记录在 attempts 里，绝不填充虚构样本。
 * 通道优先级：猎聘官方 MCP（配置 LIEPIN_MCP_TOKEN 时）→ Tavily 搜索 API → 必应 HTML（尽力而为）→ 如实报告失败。
 */
export async function webSearchJobs(
  input: {
    targetRole: string;
    city?: string;
    employmentType: EmploymentType;
    sampleLimit: number;
  },
  opts: { signal?: AbortSignal; onProgress?: (message: string) => void } = {}
): Promise<WebSearchOutcome> {
  const timeout = config.search.timeoutMs;
  const signal = opts.signal;
  const attempts: SearchAttempt[] = [];
  const samples: JobSample[] = [];
  let searchError = '';
  let hits: SearchHit[] = [];
  const seenUrls = new Set<string>();
  const checkAborted = () => {
    if (signal?.aborted) throw new Error('已取消');
  };

  const role = input.targetRole.trim().replace(/\s+/g, ' ');
  const typeTerms = input.employmentType === 'internship' ? ['实习', '在校生'] : ['校招', '应届'];
  const roleTerms = [
    role,
    `${role} 任职要求 技术栈`,
    `${role} ${typeTerms[0]} 岗位职责`,
  ];
  const addHits = (found: SearchHit[]) => {
    for (const hit of found) {
      let key = hit.url;
      try {
        const url = new URL(hit.url);
        url.hash = '';
        key = url.toString().replace(/\/$/, '').toLowerCase();
      } catch {
        key = hit.url.toLowerCase();
      }
      if (seenUrls.has(key)) continue;
      seenUrls.add(key);
      hits.push(hit);
    }
  };

  // 通道 0：猎聘官方 MCP（岗位数据 + 来源链接，最高优先）
  let liepinNote = '';
  if (liepinConfigured()) {
    opts.onProgress?.('正在通过猎聘官方通道搜索…');
    const liepin = await liepinSearchJobs(input, { signal });
    if (liepin.ok && liepin.samples.length) {
      return { samples: liepin.samples, attempts: [], failedCount: 0, note: liepin.note };
    }
    liepinNote = liepin.note;
  }
  checkAborted();

  // 通道 1：Tavily 搜索 API（可选）
  if (process.env.TAVILY_API_KEY) {
    opts.onProgress?.('正在通过 Tavily 搜索招聘页…');
    try {
      const rounds = await Promise.allSettled(
        roleTerms.map((term) => tavilySearch(`${term} ${input.city ?? ''} ${typeTerms.join(' ')}`.trim(), input.sampleLimit, timeout, signal))
      );
      for (const round of rounds) if (round.status === 'fulfilled') addHits(round.value);
      if (rounds.some((round) => round.status === 'rejected')) searchError = 'Tavily: 部分关键词搜索失败';
    } catch (err) {
      searchError = `Tavily: ${err instanceof Error ? err.message : '失败'}`;
    }
    checkAborted();
  }

  // 通道 2：必应 HTML（尽力而为，可能被反爬拦截）
  if (hits.length < input.sampleLimit) {
    opts.onProgress?.('正在通过必应搜索招聘页…');
    const queries = roleTerms.map((term, i) =>
      `${term} ${input.city ?? ''} ${typeTerms[i % typeTerms.length]} 岗位 招聘 职位详情`.trim()
    );
    const rounds = await Promise.allSettled(queries.map((q) => searchJobPages(q, input.sampleLimit, timeout, signal)));
    for (const round of rounds) {
      if (round.status === 'fulfilled') addHits(round.value);
      else searchError = `Bing: ${round.reason instanceof Error ? round.reason.message : '部分关键词搜索失败'}`;
    }
    if (!hits.length && !searchError) {
      for (const q of queries) {
        try {
          addHits(await searchJobPages(q, input.sampleLimit, timeout, signal));
          if (hits.length >= input.sampleLimit) break;
        } catch (err) {
          searchError = `Bing: ${err instanceof Error ? err.message : '失败'}`;
        }
      }
    }
    checkAborted();
  }

  if (!hits.length) {
    return {
      samples: [],
      attempts: [],
      failedCount: 0,
      note: `${liepinNote ? `${liepinNote} ` : ''}联网搜索未取得可用招聘页（${searchError || '无白名单域名结果'}）。已按规则回退到预置样本库/手动输入，来源类型如实标注。`,
    };
  }
  const now = new Date().toISOString();
  const candidates = hits.slice(0, Math.min(input.sampleLimit, 30));
  opts.onProgress?.(`正在抓取 ${candidates.length} 个岗位页面…`);
  const parsed = await Promise.all(
    candidates.map(async (hit): Promise<{ sample?: JobSample; attempt: SearchAttempt }> => {
      try {
        const html = await fetchText(hit.url, timeout, undefined, { signal, allowedHosts: ALLOWED_HOSTS });
        const jd = extractJdFromHtml(html);
        if (!jd) return { attempt: { title: hit.title, url: hit.url, parse_status: 'failed', note: '正文提取不足（可能需要登录或 JS 渲染）' } };
        return {
          attempt: { title: hit.title, url: hit.url, parse_status: 'ok' },
          sample: {
            title: hit.title.slice(0, 100),
            company: null,
            location: input.city ?? null,
            employment_type: input.employmentType,
            education_requirement: jd.education,
            experience_requirement: jd.experience,
            skills: [],
            description: jd.description,
            source_url: hit.url,
            fetched_at: now,
            source_type: 'web',
          },
        };
      } catch (err) {
        return { attempt: { title: hit.title, url: hit.url, parse_status: 'failed', note: err instanceof Error ? err.message : '抓取失败' } };
      }
    })
  );
  checkAborted();
  for (const item of parsed) {
    attempts.push(item.attempt);
    if (item.sample) samples.push(item.sample);
  }
  const failedCount = attempts.filter((a) => a.parse_status === 'failed').length;
  return {
    samples,
    attempts,
    failedCount,
    note: `联网搜索命中 ${hits.length} 个招聘页，成功解析 ${samples.length} 条，失败 ${failedCount} 条（来源：必应搜索 + 白名单站点抓取）。`,
  };
}
