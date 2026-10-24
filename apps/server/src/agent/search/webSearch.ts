// 真实招聘信息联网搜索（PRD 4.2）：搜索引擎发现招聘页 → 白名单域名抓取解析
// 尽力而为 + 如实报告：每个来源记录 parse_status，失败不编造；带超时与大小限制（PRD 6.6）
import type { JobSample, EmploymentType } from '@pathpilot/shared';
import { config } from '../../config.js';

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

/** 允许抓取的招聘相关域名白名单 */
const ALLOWED_HOSTS = [
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
  'talent.aliyun.com',
  'campus.alibaba.com',
];

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export async function fetchText(url: string, timeoutMs: number, maxBytes = 800_000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': UA, 'Accept-Language': 'zh-CN,zh;q=0.9', Accept: 'text/html,application/xhtml+xml' },
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
  } finally {
    clearTimeout(timer);
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
async function tavilySearch(query: string, limit: number, timeoutMs: number): Promise<SearchHit[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
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
        if (!ALLOWED_HOSTS.some((d) => host === d || host.endsWith(`.${d}`))) continue;
      } catch {
        continue;
      }
      hits.push({ title: r.title, url: r.url });
      if (hits.length >= limit) break;
    }
    return hits;
  } finally {
    clearTimeout(timer);
  }
}

/** 通过必应网页搜索发现招聘页链接 */
export async function searchJobPages(query: string, limit: number, timeoutMs: number): Promise<SearchHit[]> {
  const url = `https://cn.bing.com/search?q=${encodeURIComponent(query)}&count=${Math.min(limit * 2, 30)}`;
  const html = await fetchText(url, timeoutMs);
  const hits: SearchHit[] = [];
  // 解析 b_algo 结果块中的 <h2><a href>
  const re = /<li class="b_algo"[\s\S]*?<h2[^>]*><a[^>]+href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && hits.length < limit) {
    const href = decodeEntities(m[1]);
    const title = stripTags(m[2]).trim();
    try {
      const host = new URL(href).hostname;
      if (!ALLOWED_HOSTS.some((d) => host === d || host.endsWith(`.${d}`))) continue;
    } catch {
      continue;
    }
    if (title && href) hits.push({ title, url: href });
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
 * 通道：Tavily 搜索 API（配置 TAVILY_API_KEY 时）→ 必应 HTML（尽力而为）→ 如实报告失败。
 */
export async function webSearchJobs(input: {
  targetRole: string;
  city?: string;
  employmentType: EmploymentType;
  sampleLimit: number;
}): Promise<WebSearchOutcome> {
  const timeout = config.search.timeoutMs;
  const typeWord = input.employmentType === 'internship' ? '实习' : '招聘';
  const attempts: SearchAttempt[] = [];
  const samples: JobSample[] = [];
  let searchError = '';
  let hits: SearchHit[] = [];

  // 通道 1：Tavily 搜索 API（可选）
  if (process.env.TAVILY_API_KEY) {
    try {
      hits = await tavilySearch(
        `${input.targetRole} ${typeWord} ${input.city ?? ''} 岗位职责 任职要求 招聘`.trim(),
        input.sampleLimit,
        timeout
      );
    } catch (err) {
      searchError = `Tavily: ${err instanceof Error ? err.message : '失败'}`;
    }
  }

  // 通道 2：必应 HTML（尽力而为，可能被反爬拦截）
  if (!hits.length) {
    const queries = [
      `${input.targetRole} ${typeWord} ${input.city ?? ''} 岗位职责 任职要求 site:zhipin.com OR site:shixiseng.com`.trim(),
      `${input.targetRole} ${typeWord} 招聘 任职要求 实习僧 OR BOSS直聘`.trim(),
    ];
    for (const q of queries) {
      try {
        const found = await searchJobPages(q, input.sampleLimit, timeout);
        hits = found;
        if (found.length) break;
      } catch (err) {
        searchError = `Bing: ${err instanceof Error ? err.message : '失败'}`;
      }
    }
  }

  if (!hits.length) {
    return {
      samples: [],
      attempts: [],
      failedCount: 0,
      note: `联网搜索未取得可用招聘页（${searchError || '无白名单域名结果'}）。已按规则回退到预置样本库/手动输入，来源类型如实标注。`,
    };
  }
  const now = new Date().toISOString();
  for (const hit of hits.slice(0, input.sampleLimit)) {
    try {
      const html = await fetchText(hit.url, timeout);
      const jd = extractJdFromHtml(html);
      if (!jd) {
        attempts.push({ title: hit.title, url: hit.url, parse_status: 'failed', note: '正文提取不足（可能需要登录或 JS 渲染）' });
        continue;
      }
      attempts.push({ title: hit.title, url: hit.url, parse_status: 'ok' });
      samples.push({
        title: hit.title.slice(0, 100),
        company: null, // 搜索结果标题中公司不可靠，如实置空（PRD 允许未知为空）
        location: input.city ?? null,
        employment_type: input.employmentType,
        education_requirement: jd.education,
        experience_requirement: jd.experience,
        skills: [], // 技能由抽取阶段填充
        description: jd.description,
        source_url: hit.url,
        fetched_at: now,
        source_type: 'web',
      });
    } catch (err) {
      attempts.push({ title: hit.title, url: hit.url, parse_status: 'failed', note: err instanceof Error ? err.message : '抓取失败' });
    }
  }
  const failedCount = attempts.filter((a) => a.parse_status === 'failed').length;
  return {
    samples,
    attempts,
    failedCount,
    note: `联网搜索命中 ${hits.length} 个招聘页，成功解析 ${samples.length} 条，失败 ${failedCount} 条（来源：必应搜索 + 白名单站点抓取）。`,
  };
}
