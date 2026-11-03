// 智联招聘（sou.zhaopin.com）岗位通道：搜索页把整页结果以结构化 JSON 内嵌在
// window.__INITIAL_STATE__ 里，且每条岗位的 `jobDetailData.position.desc.description` 已是
// 完整 JD —— **一次请求即得 20 条含正文岗位，无需逐条抓详情页、无需搜索引擎**。
// 与 nowcoder 通道同构：本通道只负责拿到干净正文与来源链接，技能抽取交给主管线。
import type { JobSample, EmploymentType } from '@pathpilot/shared';
import { config } from '../../config.js';
import { fetchText, HTML_PAGE_MAX_BYTES } from './webSearch.js';
import { extractInitialState, pickRelevantByRole } from './nowcoder.js';
import type { Limiter } from './limit.js';

export interface ZhaopinSearchOutcome {
  samples: JobSample[];
  note: string;
  ok: boolean;
  /** 搜索页抓取/解析异常数：通道成功时也要如实回报 */
  failedCount: number;
}

/** 智联通道默认启用；需要临时关闭时设置 ZHAOPIN_DISABLE=1。 */
export function zhaopinConfigured(): boolean {
  return process.env.ZHAOPIN_DISABLE !== '1';
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

export interface ParsedZhaopinJob {
  title: string;
  company: string | null;
  location: string | null;
  salary: string | null;
  education: string | null;
  experience: string | null;
  skills: string[];
  description: string;
  url: string | null;
  /** 真实用工类型（来自 workType/workTypeCode）；无法判定时为 null，由请求类型兜底 */
  employmentType: EmploymentType | null;
}

/**
 * 把智联搜索页 positionList 的一条记录映射成结构化岗位。
 * JD 取自 `jobDetailData.position.desc.description`；正文不足 40 字视为不可用（登录墙/占位/结构变化），返回 null。
 */
export function parseZhaopinItem(
  raw: unknown,
  fallback: { city?: string }
): ParsedZhaopinJob | null {
  const it = asRecord(raw);
  if (!it) return null;
  const position = asRecord(asRecord(it.jobDetailData)?.position);
  const base = asRecord(position?.base);
  const desc = asRecord(position?.desc);

  const jd =
    str(desc?.description) ||
    str(desc?.jobDescription) ||
    str(position?.description) ||
    str(asRecord(it.jobDetailData)?.description) ||
    '';
  if (jd.length < 40) return null;

  const title = str(it.name) || str(base?.positionName) || '';
  if (!title) return null;

  const salary = str(it.salaryReal) || str(it.salary60) || str(base?.salary) || null;
  const education = str(it.education) || str(base?.education) || null;
  const experience = str(it.workingExp) || str(base?.positionWorkingExp) || null;
  const location =
    str(it.workCity) ||
    str(it.cityDistrict) ||
    str(base?.workCity) ||
    str(base?.positionWorkCity) ||
    fallback.city ||
    null;
  const company = str(it.companyName) || null;
  const skills = Array.isArray(it.jobSkillTags)
    ? it.jobSkillTags
        .map((t) => str(asRecord(t)?.name))
        .filter((s): s is string => Boolean(s))
    : [];
  const url = str(it.positionUrl) || str(it.positionUrlPc) || null;
  // 智联用 workType/workTypeCode 标注真实用工类型（实测：全职=2、实习=4）。搜索 URL 无法按类型过滤，
  // 只能按该字段收敛，否则实习检索会把社招岗标成实习。
  const workType = str(it.workType);
  const workTypeCode = str(it.workTypeCode);
  const employmentType: EmploymentType | null =
    workType === '实习' || workTypeCode === '4'
      ? 'internship'
      : workType === '全职' || workTypeCode === '2'
        ? 'full_time'
        : null;

  return {
    title: title.slice(0, 100),
    company,
    location,
    salary,
    education,
    experience,
    skills,
    description: jd,
    url,
    employmentType,
  };
}

/**
 * 从 HTML 中按 `"positionList":[...]` 做括号配对提取数组。
 * 智联搜索页每次渲染动态、外层可能是非严格 JSON 的 JS，直接解析整段 __INITIAL_STATE__ 易因
 * `undefined`/单引号等失败；而 positionList 数组本身是标准 JSON，只解析这一段最稳。
 */
export function extractPositionListArray(html: string): unknown[] {
  const key = '"positionList"';
  const k = html.indexOf(key);
  if (k < 0) return [];
  const start = html.indexOf('[', k);
  if (start < 0) return [];
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '[') depth++;
    else if (ch === ']') {
      depth--;
      if (depth === 0) {
        try {
          const arr = JSON.parse(html.slice(start, i + 1));
          return Array.isArray(arr) ? arr : [];
        } catch {
          return [];
        }
      }
    }
  }
  return [];
}

/** 提取 positionList：优先括号配对直取数组，失败再退回整段 __INITIAL_STATE__。 */
function extractPositionList(html: string): unknown[] {
  const direct = extractPositionListArray(html);
  if (direct.length) return direct;
  const state = asRecord(extractInitialState(html));
  if (!state) return [];
  if (Array.isArray(state.positionList)) return state.positionList;
  const data = asRecord(state.data);
  if (data && Array.isArray(data.positionList)) return data.positionList;
  return [];
}

/**
 * 智联岗位搜索：搜索页 SSR 直出 → positionList（每条含完整 JD）→ 映射 → 相关性收敛 → JobSample。
 * kw 已是岗位词定向，但仍按标题为主的规则做相关性收敛；若标题全不匹配则放宽到“标题+正文”，
 * 类型过滤后为空时如实返回 ok:false（回退其它通道），不把不相关岗位塞进岗位洞察。
 */
export async function zhaopinSearchJobs(
  input: { targetRole: string; city?: string; employmentType: EmploymentType; sampleLimit: number },
  opts: { signal?: AbortSignal; onProgress?: (message: string) => void; timeoutMs?: number; limiter?: Limiter } = {}
): Promise<ZhaopinSearchOutcome> {
  if (!zhaopinConfigured()) return { samples: [], ok: false, failedCount: 0, note: '智联通道已关闭（ZHAOPIN_DISABLE=1）。' };
  // 上层传入的是发现阶段剩余预算（并行下各通道起点相同），这里取更小者，避免单通道吃掉全部时间。
  const timeoutMs = Math.min(config.search.timeoutMs, opts.timeoutMs ?? Number.POSITIVE_INFINITY);
  const signal = opts.signal;
  const role = input.targetRole.trim().replace(/\s+/g, ' ');
  const city = input.city?.trim();
  if (!role) return { samples: [], ok: false, failedCount: 0, note: '智联通道缺少目标岗位关键词。' };

  const startedAt = Date.now();
  // 本通道自己的时间上限：留 2.5s 余量给上层，避免超出分到的预算。
  const deadline = startedAt + Math.max(timeoutMs - 2500, Math.floor(timeoutMs * 0.5));
  const maxPages = Math.min(3, Math.max(1, Math.ceil(input.sampleLimit / 20)));
  const failures: string[] = [];
  const parsed: ParsedZhaopinJob[] = [];
  let reachedDeadline = false;

  for (let page = 1; page <= maxPages; page++) {
    // 取消/超时：停止翻页，保留已解析的样本。
    if (signal?.aborted) break;
    if (Date.now() > deadline) {
      reachedDeadline = true;
      break;
    }
    // 实习检索补一个“实习生”关键词：智联按岗位词检索默认返回社招岗，不补词时类型过滤后常常一条不剩。
    const keyword = input.employmentType === 'internship' ? `${role}实习生` : role;
    const url =
      `https://sou.zhaopin.com/?kw=${encodeURIComponent(keyword)}` +
      (city ? `&jl=${encodeURIComponent(city)}` : '') +
      (page > 1 ? `&p=${page}` : '');
    opts.onProgress?.(`正在读取智联搜索页（第 ${page} 页）…`);
    let html: string;
    try {
      html = await fetchText(url, Math.min(timeoutMs, 9000, Math.max(deadline - Date.now(), 1000)), HTML_PAGE_MAX_BYTES, { signal, failOnTruncate: true, limiter: opts.limiter });
    } catch (err) {
      // 取消/超时导致的失败不计入抓取异常，避免污染 failedCount 与 note。
      if (signal?.aborted || Date.now() > deadline) break;
      failures.push(err instanceof Error ? err.message : '抓取失败');
      continue;
    }
    const list = extractPositionList(html);
    if (!list.length) {
      failures.push('搜索页未内嵌 positionList（可能为风控/结构变化）');
      continue;
    }
    for (const item of list) {
      const p = parseZhaopinItem(item, { city });
      if (p) parsed.push(p);
    }
  }

  if (!parsed.length) {
    const detail = failures.slice(0, 2).join('；');
    return {
      samples: [],
      ok: false,
      failedCount: failures.length,
      note: `智联通道未能解析出有效岗位${detail ? `（${detail}）` : ''}，已回退其它通道。`,
    };
  }

  // 去重（标题+公司）→ 类型收敛 → 相关性软过滤（kw 定向，过滤为空则保留全部）
  const seen = new Set<string>();
  const deduped = parsed.filter((p) => {
    const key = `${p.title}|${p.company ?? ''}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  // 搜索 URL 不能按用工类型过滤，实测实习检索会混进社招岗；按 workType 收敛后再取样本。
  const typeLabel = input.employmentType === 'internship' ? '实习' : '全职';
  const typed = deduped.filter((p) => p.employmentType === null || p.employmentType === input.employmentType);
  if (!typed.length) {
    return {
      samples: [],
      ok: false,
      failedCount: failures.length,
      note: `智联通道解析出 ${deduped.length} 条岗位，但均非「${typeLabel}」类型，已回退其它通道。`,
    };
  }
  const relevant = pickRelevantByRole(typed, role, (p) => p.title, (p) => p.description);
  const chosen = relevant.length ? relevant : typed;

  const now = new Date().toISOString();
  const limited = chosen.slice(0, input.sampleLimit).map((p) => ({
    title: p.title,
    company: p.company,
    location: p.location ?? city ?? null,
    employment_type: p.employmentType ?? input.employmentType,
    education_requirement: p.education,
    experience_requirement: p.experience,
    skills: p.skills,
    description: (p.salary ? `薪资：${p.salary}；${p.description}` : p.description).slice(0, 4000),
    source_url: p.url ?? 'https://sou.zhaopin.com/',
    fetched_at: now,
    source_type: 'web' as const,
  }));

  const parts = [
    `智联通道解析出 ${parsed.length} 条岗位`,
    typed.length !== deduped.length ? `类型筛选（${typeLabel}）后 ${typed.length} 条` : '',
    relevant.length && relevant.length !== typed.length ? `相关性筛选后 ${chosen.length} 条` : '',
    `最终返回 ${limited.length} 条（含来源链接）`,
  ].filter(Boolean);
  if (failures.length) parts.push(`另有 ${failures.length} 个搜索页抓取异常`);
  if (reachedDeadline) parts.push('已按时间预算截断部分页');
  return { samples: limited, ok: true, failedCount: failures.length, note: `${parts.join('；')}。` };
}
