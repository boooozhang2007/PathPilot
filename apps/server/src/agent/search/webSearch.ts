// 真实招聘信息联网搜索（PRD 4.2）：搜索引擎发现招聘页 → 抓取公开页面并解析
// 尽力而为 + 如实报告：每个来源记录 parse_status，失败不编造；带超时、协议校验、跳转与大小限制（PRD 6.6）
import type { JobSample, EmploymentType } from '@pathpilot/shared';
import { lookup } from 'node:dns/promises';
import ipaddr from 'ipaddr.js';
import { Agent, ProxyAgent, type Dispatcher } from 'undici';
import { config } from '../../config.js';
import { liepinConfigured, liepinSearchJobs } from './liepin.js';
import { nowcoderConfigured, nowcoderSearchJobs } from './nowcoder.js';
import { zhaopinConfigured, zhaopinSearchJobs } from './zhaopin.js';
import { shixisengConfigured, shixisengSearchJobs } from './shixiseng.js';
import { createLimiter, type Limiter } from './limit.js';

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
  /** 是否取得至少一条可解析的真实样本；失败时 note 必须说明具体原因 */
  ok: boolean;
  note: string;
}

/** 各岗位通道统一的结果形状：失败页数量随样本一起回报，避免通道成功时丢失“有多少页面没解析成功”。 */
interface ChannelOutcome {
  samples: JobSample[];
  note: string;
  ok: boolean;
  failedCount?: number;
}

/** 单个通道至少要有这么多剩余预算才值得启动（否则跳过并在 note 里如实说明）。 */
const MIN_CHANNEL_BUDGET_MS = 1500;

/** 四通道并行后，样本达到这个数量（且不超过 sampleLimit）就不再走搜索引擎回退。 */
const MIN_USEFUL_SAMPLES = 5;

/** 进度聚合的最小上报间隔：并行下各通道会同时上报，节流避免前端文案抖动与事件过多。 */
const PROGRESS_THROTTLE_MS = 700;

/** 跨通道去重键：与 jobs.ts 的 dedupeSamples 同一规则（URL 优先，无 URL 用标题+公司+正文前缀）。 */
function keyOfSample(sample: JobSample): string {
  return sample.source_url
    ? sample.source_url.replace(/\/$/, '').toLowerCase()
    : `${sample.title}|${sample.company ?? ''}|${sample.description.slice(0, 200)}`.toLowerCase();
}

/**
 * 轮转交错合并各通道样本：每个平台最多贡献 perChannelLimit 条，按通道轮流取一条，
 * 保证每个有样本的平台都进入结果；跨通道按 URL 优先去重。
 * 不做重复项回填——同一岗位计两次会扭曲技能频次统计。
 */
function mergeChannelSamples(groups: JobSample[][], perChannelLimit: number): JobSample[] {
  const queues = groups.map((group) => group.slice(0, Math.max(0, perChannelLimit)));
  const seen = new Set<string>();
  const merged: JobSample[] = [];
  let added = true;
  while (added) {
    added = false;
    for (const queue of queues) {
      while (queue.length) {
        const sample = queue.shift()!;
        const key = keyOfSample(sample);
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(sample);
        added = true;
        break;
      }
    }
  }
  return merged;
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function readResponseBody(res: Response, maxBytes: number): Promise<{ text: string; truncated: boolean }> {
  const reader = res.body?.getReader();
  if (!reader) return { text: await res.text(), truncated: false };
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      truncated = true;
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  return { text: new TextDecoder('utf-8').decode(concat(chunks)), truncated };
}

/** 公开网页 URL 校验：不使用招聘域名白名单，但只允许不带凭据、指向公网地址的 HTTP(S) 地址。 */
function normalizeHttpUrl(raw: string, base?: string): URL {
  let url: URL;
  try {
    url = new URL(raw, base);
  } catch {
    throw new Error('URL 格式不正确');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error(`不支持的 URL 协议：${url.protocol}`);
  if (url.username || url.password) throw new Error('URL 不允许包含认证凭据');
  return url;
}

function isPrivateIp(host: string): boolean {
  const normalized = host.replace(/^\[|\]$/g, '');
  if (!ipaddr.isValid(normalized)) return false;
  const parsed = ipaddr.parse(normalized);
  // URL 会把 ::ffff:127.0.0.1 规范化为 ::ffff:7f00:1；先还原成 IPv4 再判断。
  if (parsed instanceof ipaddr.IPv6 && parsed.isIPv4MappedAddress()) return isPrivateIp(parsed.toIPv4Address().toString());
  return parsed.range() !== 'unicast';
}

interface PublicHttpTarget {
  url: URL;
  pinnedAddress?: { address: string; family: 4 | 6 };
  proxy?: string;
}

function bypassConfiguredProxy(url: URL): boolean {
  const rule = process.env.NO_PROXY ?? process.env.no_proxy;
  if (!rule) return false;
  const host = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
  return rule.split(',').some((part) => {
    const entry = part.trim().toLowerCase();
    if (!entry) return false;
    if (entry === '*') return true;
    // NO_PROXY 的端口只影响匹配范围；主机部分仍按精确域名或子域名匹配。
    const token = entry.replace(/^https?:\/\//, '').replace(/^\./, '').split(':')[0].replace(/\.$/, '');
    return !!token && (host === token || host.endsWith(`.${token}`));
  });
}

function configuredHttpProxy(url: URL): string | undefined {
  if (bypassConfiguredProxy(url)) return undefined;
  const value = url.protocol === 'https:'
    ? process.env.HTTPS_PROXY ?? process.env.https_proxy ?? process.env.HTTP_PROXY ?? process.env.http_proxy
    : process.env.HTTP_PROXY ?? process.env.http_proxy;
  const candidate = value ?? process.env.ALL_PROXY ?? process.env.all_proxy;
  if (!candidate) return undefined;
  try {
    const proxy = new URL(candidate);
    if (proxy.protocol !== 'http:' && proxy.protocol !== 'https:') return undefined;
    return proxy.toString();
  } catch {
    return undefined;
  }
}

/** 抓取前确认当前 URL 及每次重定向目标不会进入本机、内网或保留地址，避免移除白名单后引入 SSRF。 */
async function assertPublicHttpUrl(raw: string, base?: string): Promise<PublicHttpTarget> {
  const url = normalizeHttpUrl(raw, base);
  const host = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new Error('URL 指向本机或内网地址，已拒绝抓取');
  }
  if (isPrivateIp(host)) throw new Error('URL 指向本机、内网或保留 IP，已拒绝抓取');
  // 代理（尤其 Fake-IP 模式）会在代理侧解析域名；本地 198.18/15 结果不能当作真实目标校验或固定连接。
  // 本机/内网字面地址已在上方拒绝；无代理的直连仍执行 DNS 校验和地址固定。
  const proxy = configuredHttpProxy(url);
  if (proxy) return { url, proxy };
  if (!ipaddr.isValid(host)) {
    if (!host.includes('.')) throw new Error('URL 主机名不是可公开解析的域名');
    let addresses: { address: string; family: number }[];
    try {
      addresses = await lookup(host, { all: true, verbatim: true });
    } catch {
      throw new Error(`无法解析公开域名 ${host}`);
    }
    if (!addresses.length || addresses.some((entry) => isPrivateIp(entry.address))) {
      throw new Error(`域名 ${host} 解析到非公网地址，已拒绝抓取`);
    }
    const first = addresses[0];
    return { url, pinnedAddress: { address: first.address, family: first.family === 6 ? 6 : 4 } };
  }
  return { url };
}

/** 连接层固定刚才验证过的地址，防止 DNS 在校验与实际连接之间重绑定。 */
export function pinnedDnsDispatcher(pinned: { address: string; family: 4 | 6 }): Agent {
  return new Agent({
    connect: {
      // Node 20+ 默认以 all:true 调用 lookup 并期望地址数组；两种调用形式都要支持。
      lookup: (_hostname, options, callback) =>
        options.all
          ? callback(null, [{ address: pinned.address, family: pinned.family }])
          : callback(null, pinned.address, pinned.family),
    },
  });
}

async function closeDispatcher(dispatcher?: Dispatcher): Promise<void> {
  await dispatcher?.close().catch(() => undefined);
}

/** 招聘站列表页/搜索页的整页 SSR HTML 实测 340–600KB，内嵌 JSON 就在其中，给整页抓取留足上限。 */
export const HTML_PAGE_MAX_BYTES = 3_000_000;

export async function fetchText(
  url: string,
  timeoutMs: number,
  maxBytes = 800_000,
  opts: { signal?: AbortSignal; failOnTruncate?: boolean; limiter?: Limiter } = {}
): Promise<string> {
  // 并发闸门：整条重定向链只占一个槽位；排队期间不启动超时计时，避免排队本身把请求算成超时。
  if (!opts.limiter) return fetchTextInner(url, timeoutMs, maxBytes, opts);
  return opts.limiter.run(() => fetchTextInner(url, timeoutMs, maxBytes, opts));
}

async function fetchTextInner(
  url: string,
  timeoutMs: number,
  maxBytes: number,
  opts: { signal?: AbortSignal; failOnTruncate?: boolean }
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  if (opts.signal) {
    if (opts.signal.aborted) controller.abort();
    else opts.signal.addEventListener('abort', onAbort, { once: true });
  }
  try {
    let current = normalizeHttpUrl(url).toString();
    for (let redirects = 0; redirects <= 5; redirects++) {
      const checked = await assertPublicHttpUrl(current);
      current = checked.url.toString();
      const dispatcher = checked.proxy
        ? new ProxyAgent(checked.proxy)
        : checked.pinnedAddress
          ? pinnedDnsDispatcher(checked.pinnedAddress)
          : undefined;
      try {
        const init: RequestInit & { dispatcher?: Dispatcher } = {
          signal: controller.signal,
          headers: { 'User-Agent': UA, 'Accept-Language': 'zh-CN,zh;q=0.9', Accept: 'text/html,application/xhtml+xml' },
          redirect: 'manual',
        };
        if (dispatcher) init.dispatcher = dispatcher;
        const res = await fetch(current, init);
        if (res.status >= 300 && res.status < 400) {
          const location = res.headers.get('location');
          try {
            await res.body?.cancel();
          } catch {
            /* ignore */
          }
          await closeDispatcher(dispatcher);
          if (!location) throw new Error(`HTTP ${res.status}`);
          current = normalizeHttpUrl(location, current).toString();
          continue;
        }
        if (!res.ok) {
          try {
            await res.body?.cancel();
          } catch {
            /* ignore */
          }
          await closeDispatcher(dispatcher);
          throw new Error(`HTTP ${res.status}`);
        }
        const body = await readResponseBody(res, maxBytes);
        await closeDispatcher(dispatcher);
        // 截断的 HTML 会让内嵌 JSON/正则解析静默失败，被误判成“页面结构变化”；按结构解析的调用方要求显式报错。
        if (body.truncated && opts.failOnTruncate) throw new Error(`响应体超过 ${maxBytes} 字节上限，已拒绝按截断内容解析`);
        return body.text;
      } catch (error) {
        await closeDispatcher(dispatcher);
        throw error;
      }
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
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => {
      const cp = parseInt(h, 16);
      // 超出 Unicode 范围的实体（如 &#xFFFFFFFF;）会让 fromCodePoint 抛 RangeError，按无效实体丢弃。
      return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : '';
    });
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

/** Tavily 搜索 API（配置 TAVILY_API_KEY 时启用），接受任意公开招聘域名结果 */
async function tavilySearch(query: string, limit: number, timeoutMs: number, signal?: AbortSignal, limiter?: Limiter): Promise<SearchHit[]> {
  // Tavily 用自己的 fetch，不经 fetchText，因此单独占用并发闸门的槽位。
  const run = () => tavilySearchInner(query, limit, timeoutMs, signal);
  return limiter ? limiter.run(run) : run();
}

async function tavilySearchInner(query: string, limit: number, timeoutMs: number, signal?: AbortSignal): Promise<SearchHit[]> {
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
        normalizeHttpUrl(r.url);
      } catch {
        continue;
      }
      if (!r.title?.trim()) continue;
      hits.push({ title: r.title.trim(), url: r.url });
      if (hits.length >= limit) break;
    }
    return hits;
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

/** 必应网页搜索会先把结果包成 /ck/a 跳转；解开 u 参数里的 base64url 目标地址。 */
function unwrapBingRedirect(url: URL): string | null {
  if (!/(^|\.)bing\.com$/i.test(url.hostname) || url.pathname !== '/ck/a') return url.toString();
  const encoded = url.searchParams.get('u');
  if (!encoded?.startsWith('a1')) return null;
  try {
    const base64 = encoded.slice(2).replace(/-/g, '+').replace(/_/g, '/');
    const padded = `${base64}${'='.repeat((4 - (base64.length % 4)) % 4)}`;
    const target = Buffer.from(padded, 'base64').toString('utf8');
    return normalizeHttpUrl(target).toString();
  } catch {
    return null;
  }
}

function normalizeSearchHit(rawHref: string, title: string, base: string): SearchHit | null {
  try {
    const resolved = normalizeHttpUrl(decodeEntities(rawHref), base);
    const url = unwrapBingRedirect(resolved);
    if (!url) return null;
    const target = new URL(url);
    // 搜索页、静态资源与同站导航不是岗位结果
    if (/(^|\.)(bing|google|baidu|sogou|so)\.com$/i.test(target.hostname) && !/^\/(job|jobs|position|positions|zhaopin)/i.test(target.pathname)) return null;
    const cleanTitle = stripTags(title).trim();
    // 搜索引擎常把教程、百科、学习路线排在招聘页前面；这些不是岗位样本。
    if (/(教程|学习路线|学习指南|入门指南|职业指南|岗位介绍|职业科普|从零|课程|百科|博客|经验贴|面试题)/i.test(cleanTitle)) return null;
    return cleanTitle ? { title: cleanTitle, url: target.toString() } : null;
  } catch {
    return null;
  }
}

/** 通过必应网页搜索发现招聘页链接；支持直接链接与必应跳转链接。 */
export async function searchJobPages(query: string, limit: number, timeoutMs: number, signal?: AbortSignal, limiter?: Limiter): Promise<SearchHit[]> {
  const url = `https://cn.bing.com/search?q=${encodeURIComponent(query)}&count=${Math.min(limit * 2, 30)}`;
  const html = await fetchText(url, timeoutMs, undefined, { signal, limiter });
  const hits: SearchHit[] = [];
  const seen = new Set<string>();
  const collect = (pattern: RegExp) => {
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(html)) && hits.length < limit) {
      const hit = normalizeSearchHit(m[1], m[2], url);
      if (!hit) continue;
      const key = hit.url.replace(/\/$/, '').toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push(hit);
    }
  };
  // 优先解析结果块；失败时退回所有 h2 链接（必应布局会变化）
  collect(/<li\b[^>]*class\s*=\s*["'][^"']*\bb_algo\b[^"']*["'][\s\S]*?<h2[^>]*>\s*<a[^>]+href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi);
  if (!hits.length) collect(/<h2[^>]*>\s*<a[^>]+href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi);
  return hits;
}

const JD_SECTION_RE =
  /(岗位职责|职位描述|工作职责|岗位描述|任职要求|职位要求|任职资格|工作内容|任职条件)[\s\S]{30,}/;

/** 从招聘页 HTML 提取 JD 正文；必须存在岗位段落与至少两类招聘上下文，避免把教程/百科误判为岗位。 */
export function extractJdFromHtml(html: string): { description: string; education: string | null; experience: string | null } | null {
  const text = stripTags(html);
  const m = JD_SECTION_RE.exec(text);
  if (!m) return null;
  const description = m[0].slice(0, 4000).trim();
  if (description.length < 120) return null;
  const edu = /(本科|硕士|研究生|大专|本科及以上|硕士及以上|学历不限)/.exec(text)?.[1] ?? null;
  const exp =
    /(实习经历|项目经验|工作经验|\d+年(以上)?(工作|开发)?经验|应届|在校生|接受应届)/.exec(text)?.[1] ?? null;
  const sectionSignals = [
    /(岗位职责|职位描述|工作职责|岗位描述)/.test(text),
    /(任职要求|职位要求|任职资格|任职条件)/.test(text),
  ].filter(Boolean).length;
  const hasJobMetadata = /(薪资|月薪|年薪|工作地点|工作城市|招聘人数|全职|兼职|远程|校招|社招)/.test(text);
  const hasApplicationSignal = /(投递|简历|入职)/.test(text);
  const recruitmentSignals = [!!edu, !!exp, hasJobMetadata, hasApplicationSignal].filter(Boolean).length;
  // “公司/团队/招聘”等泛化词也会出现在职业指南及其否定句中，不能单独证明这是有效 JD。
  const hasConcreteRecruitmentSignal = !!edu || !!exp || hasJobMetadata || hasApplicationSignal;
  if (sectionSignals + recruitmentSignals < 2 || !hasConcreteRecruitmentSignal) return null;
  return { description, education: edu, experience: exp };
}

/**
 * 真实联网搜索岗位样本。任何一步失败都如实记录在 attempts/note 里，绝不填充虚构样本。
 * 发现阶段：猎聘官方 MCP、牛客、智联、实习僧四个通道**并行**抓取，各平台各自抓满 sampleLimit；
 * 共享一条绝对截止线（SEARCH_TIMEOUT_MS）与一个全局在途请求闸门（SEARCH_MAX_INFLIGHT）。
 * 合并去重后仍不足 5 条时才回退 Tavily / 必应（受同一截止线约束）。
 * 任一通道抛错只记为该通道异常，不影响其它通道；取消=整次失败，超时=保留已抓到的部分样本并如实说明。
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
  const providerErrors: string[] = [];
  let hits: SearchHit[] = [];
  const seenUrls = new Set<string>();
  const checkAborted = () => {
    if (signal?.aborted) throw new Error('已取消');
  };
  const addError = (provider: string, err: unknown) => {
    const message = err instanceof Error ? err.message : String(err || '未知错误');
    const entry = `${provider}: ${message}`;
    if (!providerErrors.includes(entry)) providerErrors.push(entry);
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

  // 发现阶段：一条绝对截止线 + 一个全局在途闸门，四个平台通道并行抓取（并行后总耗时≈最慢通道）。
  const deadlineAt = Date.now() + timeout;
  const deadlineController = new AbortController();
  const deadlineTimer = setTimeout(() => deadlineController.abort(), timeout);
  // 用户取消与超时共用一个信号；二者在通道跑完后按 opts.signal 区分（取消=整次失败，超时=保留部分结果）。
  const internal = signal ? AbortSignal.any([signal, deadlineController.signal]) : deadlineController.signal;
  const budgetLeft = () => deadlineAt - Date.now();
  const limiter = createLimiter(config.search.maxInFlight);
  const skippedChannels: string[] = [];

  // 进度聚合：并行下各通道会同时上报，聚合成一行并节流，避免前端文案互相抢写。
  const channelProgress = new Map<string, { done: boolean; count: number }>();
  let lastProgressAt = 0;
  const report = (short: string, done: boolean, count: number) => {
    channelProgress.set(short, { done, count });
    const now = Date.now();
    if (!done && now - lastProgressAt < PROGRESS_THROTTLE_MS) return;
    lastProgressAt = now;
    const parts = [...channelProgress.entries()].map(([name, s]) => `${name} ${s.done ? `${s.count} 条` : '进行中'}`);
    opts.onProgress?.(`并行抓取中：${parts.join(' · ')}…`);
  };

  interface ChannelTask {
    short: string;
    label: string;
    note: string;
    samples: JobSample[];
    failedCount: number;
    /** ok=正常返回；skipped=策略性跳过（全职跳过实习僧）；disabled=未配置或预算不足 */
    state: 'ok' | 'skipped' | 'disabled';
  }

  const channels: {
    short: string;
    label: string;
    enabled: boolean;
    preNote?: string;
    run: (timeoutMs: number) => Promise<ChannelOutcome>;
  }[] = [
    {
      short: '猎聘',
      label: '猎聘官方通道',
      enabled: liepinConfigured(),
      run: (ms) => liepinSearchJobs(input, { signal: internal, onProgress: opts.onProgress, timeoutMs: ms, limiter }),
    },
    {
      short: '牛客',
      label: '牛客通道',
      enabled: nowcoderConfigured(),
      run: (ms) => nowcoderSearchJobs(input, { signal: internal, onProgress: opts.onProgress, timeoutMs: ms, limiter }),
    },
    {
      short: '智联',
      label: '智联通道',
      enabled: zhaopinConfigured(),
      run: (ms) => zhaopinSearchJobs(input, { signal: internal, onProgress: opts.onProgress, timeoutMs: ms, limiter }),
    },
    {
      short: '实习僧',
      label: '实习僧通道',
      enabled: shixisengConfigured() && input.employmentType !== 'full_time',
      // 实习僧只有实习岗：全职检索直接跳过是预期行为，不能记成通道异常（否则每次全职搜索都会多报一条失败）。
      preNote: shixisengConfigured() && input.employmentType === 'full_time'
        ? '实习僧仅提供实习岗位，全职检索已跳过该通道。'
        : undefined,
      run: (ms) => shixisengSearchJobs(input, { signal: internal, onProgress: opts.onProgress, timeoutMs: ms, limiter }),
    },
  ];

  // 结果预分配：每个通道把自己的结果写进 settled[i]。即便某个通道忽略 abort 信号，到点也能按
  // 已返回的结果继续，不会被它拖住整次搜索。
  const settled: ChannelTask[] = channels.map((channel) => ({
    short: channel.short,
    label: channel.label,
    note: channel.preNote ?? '',
    samples: [],
    failedCount: 0,
    state: channel.preNote ? 'skipped' : channel.enabled ? 'ok' : 'disabled',
  }));

  const tasks = channels.map(async (channel, i): Promise<void> => {
    const slot = settled[i];
    if (slot.state !== 'ok') return;
    if (budgetLeft() < MIN_CHANNEL_BUDGET_MS) {
      skippedChannels.push(channel.label);
      slot.state = 'disabled';
      return;
    }
    report(channel.short, false, 0);
    try {
      const outcome = await channel.run(budgetLeft());
      report(channel.short, true, outcome.samples.length);
      if (!outcome.ok) addError(channel.label, outcome.note);
      slot.note = outcome.note;
      slot.samples = outcome.samples;
      slot.failedCount = outcome.failedCount ?? 0;
    } catch (err) {
      // 单通道抛错（网络/结构变化/编程错误）只记为该通道异常，不影响其它通道。
      report(channel.short, true, 0);
      addError(channel.label, err);
    }
  });

  await Promise.race([
    Promise.all(tasks),
    new Promise<void>((resolve) => setTimeout(resolve, Math.max(budgetLeft(), 0) + 250)),
  ]);
  clearTimeout(deadlineTimer);
  const channelResults = settled;

  // 取消 vs 超时：用户取消整次失败；超时则保留各通道已抓到的部分样本并如实说明。
  checkAborted();

  const merged = mergeChannelSamples(channelResults.map((r) => r.samples), input.sampleLimit);
  samples.push(...merged);
  const channelFailed = channelResults.reduce((sum, r) => sum + r.failedCount, 0);
  const platformSummary = `联网搜索（四通道并行）：${channelResults
    .map((r) => (r.state === 'skipped' ? `${r.short} 跳过` : r.state === 'disabled' ? `${r.short} 未启用` : `${r.short} ${r.samples.length} 条`))
    .join('、')}；合并去重后 ${merged.length} 条`;
  const channelNotes = channelResults
    .filter((r) => r.note && !providerErrors.some((e) => e.includes(r.note)))
    .map((r) => r.note);
  if (deadlineController.signal.aborted) channelNotes.push(`已达搜索总时长预算（${timeout}ms），部分通道被截断。`);
  if (skippedChannels.length) channelNotes.push(`预算不足，已跳过 ${skippedChannels.join('、')}。`);

  // 阶段二：仅在平台样本不足时才回退搜索引擎（平台通道是结构化数据，质量更高，也少打扰引擎）。
  const pageBudget = () => Math.max(Math.min(budgetLeft(), config.search.pageTimeoutMs), 1_000);
  let attemptsFailed = 0;
  let pageSamples = 0;
  if (samples.length < Math.min(input.sampleLimit, MIN_USEFUL_SAMPLES)) {
    // 通道 1：Tavily 搜索 API（可选）——受同一截止线约束，单次请求不超过 pageTimeoutMs
    if (process.env.TAVILY_API_KEY) {
      if (budgetLeft() < MIN_CHANNEL_BUDGET_MS) {
        skippedChannels.push('Tavily');
      } else {
        opts.onProgress?.('正在通过 Tavily 搜索招聘页…');
        const rounds = await Promise.allSettled(
          roleTerms.map((term) => tavilySearch(`${term} ${input.city ?? ''} ${typeTerms.join(' ')}`.trim(), input.sampleLimit, pageBudget(), internal, limiter))
        );
        for (const round of rounds) {
          if (round.status === 'fulfilled') addHits(round.value);
          else addError('Tavily', round.reason);
        }
        checkAborted();
      }
    }

    // 通道 2：必应 HTML（尽力而为，可能被反爬拦截）——同样受截止线与单页超时约束
    if (hits.length < input.sampleLimit) {
      if (budgetLeft() < MIN_CHANNEL_BUDGET_MS) {
        skippedChannels.push('必应');
      } else {
        opts.onProgress?.('正在通过必应搜索招聘页…');
        const queries = roleTerms.map((term, i) =>
          `${term} ${input.city ?? ''} ${typeTerms[i % typeTerms.length]} 岗位 招聘 职位详情`.trim()
        );
        const rounds = await Promise.allSettled(queries.map((q) => searchJobPages(q, input.sampleLimit, pageBudget(), internal, limiter)));
        for (const round of rounds) {
          if (round.status === 'fulfilled') addHits(round.value);
          else addError('Bing', round.reason);
        }
        checkAborted();
      }
    }

    if (hits.length) {
      const now = new Date().toISOString();
      const candidates = hits.slice(0, Math.min(input.sampleLimit, 50));
      opts.onProgress?.(`正在抓取 ${candidates.length} 个岗位页面…`);
      const parsed = await Promise.all(
        candidates.map(async (hit): Promise<{ sample?: JobSample; attempt: SearchAttempt }> => {
          try {
            const html = await fetchText(hit.url, pageBudget(), undefined, { signal: internal, limiter });
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
      const seenKeys = new Set(samples.map(keyOfSample));
      for (const item of parsed) {
        attempts.push(item.attempt);
        if (!item.sample) continue;
        const key = keyOfSample(item.sample);
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        samples.push(item.sample);
        pageSamples++;
      }
      attemptsFailed = attempts.filter((a) => a.parse_status === 'failed').length;
    }
  }

  const details = providerErrors.join('；');
  const failedCount = channelFailed + attemptsFailed;
  const parts = [platformSummary];
  if (channelNotes.length) parts.push(channelNotes.join(' '));
  if (hits.length) parts.push(`搜索引擎回退命中 ${hits.length} 个岗位页面，成功解析 ${pageSamples} 条，失败 ${attemptsFailed} 条`);
  if (!samples.length) {
    const firstErrors = attempts.filter((a) => a.note).slice(0, 3).map((a) => a.note).join('；');
    return {
      samples: [],
      attempts,
      failedCount,
      ok: false,
      note: hits.length
        ? `${parts.join('；')}；均未能解析出有效正文${firstErrors ? `（${firstErrors}）` : ''}${details ? `；搜索通道异常：${details}` : ''}。`
        : `${parts.join('；')}。联网搜索未返回可抓取岗位链接${details ? `（${details}）` : '（搜索服务未返回岗位结果）'}。当前结果未混入预置样本；岗位分析可另行选择预置样本库或手动粘贴岗位描述。`,
    };
  }
  if (details) parts.push(`通道异常：${details}`);
  return { samples, attempts, failedCount, ok: true, note: `${parts.join('；')}。` };
}
