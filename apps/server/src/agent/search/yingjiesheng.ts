// 应届生求职网（yingjiesheng.com）接入：参考 github.com/YIKUAIBANZI/job-hunter 的已校准实现
//   · 搜索页 URL：q.yingjiesheng.com/jobs/search/<关键词>?jobarea=<城市码>
//   · 城市码：北京 010000 / 上海 020000 / 广州 030200 / 深圳 040000 / 杭州 080200
//   · 搜索响应结构：resultbody.searchData.joblist.items[]（jobid/jobname/coname/providesalary/
//     jobarea/workyear/degree/jobterm/jobtag/isapply/isReprintJob/isExpire）
//   · 详情页：q.yingjiesheng.com/jobdetail/<jobid>.html
// 通道：① 无头 Chrome 渲染搜索页并解析卡片（job-hunter 同款人工 URL，网络干净时可用）
//      ② parseYjsPayload 解析用户从浏览器复制的接口 JSON/卡片数据（离线可用）
// 站点出现滑块验证时如实报告，不绕过验证码（与 job-hunter 边界一致）
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import type { JobSample, EmploymentType } from '@pathpilot/shared';

export const YJS_CITY_CODES: Record<string, string> = {
  北京: '010000',
  上海: '020000',
  广州: '030200',
  深圳: '040000',
  杭州: '080200',
};

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe` : '',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].filter(Boolean);

export interface YjsSearchOutcome {
  samples: JobSample[];
  ok: boolean;
  note: string;
}

function chromePath(): string | null {
  return CHROME_CANDIDATES.find((p) => existsSync(p)) ?? null;
}

function headlessDump(url: string, budgetMs = 12000): Promise<string> {
  const exe = chromePath();
  if (!exe) return Promise.reject(new Error('本机未找到 Chrome/Edge'));
  return new Promise((resolve, reject) => {
    const child = spawn(exe, ['--headless=new', '--disable-gpu', '--no-sandbox', `--virtual-time-budget=${budgetMs}`, '--dump-dom', url], { windowsHide: true });
    let out = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('页面加载超时'));
    }, 40000);
    child.stdout.on('data', (d) => (out += d.toString('utf-8')));
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', () => {
      clearTimeout(timer);
      resolve(out);
    });
  });
}

interface RawYjsItem {
  jobid?: string | number;
  jobname?: string;
  coname?: string;
  providesalary?: string;
  jobarea?: string;
  workyear?: string;
  degree?: string;
  jobterm?: string;
  jobtag?: string | string[];
  isapply?: string | number;
  isReprintJob?: string | number;
  isExpire?: string | number;
}

function isReprint(item: RawYjsItem): boolean {
  return String(item.isReprintJob ?? '') === '1' || String(item.isExpire ?? '') === '1';
}

function tagsOf(item: RawYjsItem): string[] {
  const jobtag = Array.isArray(item.jobtag) ? item.jobtag.join(' ') : String(item.jobtag ?? '');
  return [item.jobarea, item.workyear, item.degree, item.jobterm, jobtag].filter(Boolean).map(String).map((t) => t.trim()).filter(Boolean);
}

function buildDescription(item: RawYjsItem): string {
  const tags = tagsOf(item);
  return [`岗位：${item.jobname ?? ''}`, item.coname ? `公司：${item.coname}` : '', item.providesalary ? `薪资：${item.providesalary}` : '', tags.length ? `要求/标签：${tags.join('｜')}` : '']
    .filter(Boolean)
    .join('；')
    .slice(0, 2000);
}

/** item → 统一 JobSample（字段映射对齐 job-hunter 已校准结构） */
function toSample(item: RawYjsItem, employmentType: EmploymentType): JobSample | null {
  const jobId = String(item.jobid ?? '');
  const title = String(item.jobname ?? '').trim();
  if (!jobId || !title) return null;
  return {
    title,
    company: item.coname ? String(item.coname) : null,
    location: item.jobarea ? String(item.jobarea) : null,
    employment_type: employmentType,
    education_requirement: item.degree ? String(item.degree) : null,
    experience_requirement: item.workyear ? String(item.workyear) : null,
    skills: tagsOf(item),
    description: buildDescription(item),
    source_url: String(jobId).startsWith('paste-') ? null : `https://q.yingjiesheng.com/jobdetail/${jobId}.html`,
    fetched_at: new Date().toISOString(),
    source_type: 'web' as const,
  };
}

/** 实时搜索：无头 Chrome 加载搜索页（人工 URL）并解析渲染出的岗位卡片 */
export async function yjsSearchJobs(input: { keyword: string; city?: string; employmentType: EmploymentType; sampleLimit: number }): Promise<YjsSearchOutcome> {
  const cityCode = input.city ? YJS_CITY_CODES[input.city] : undefined;
  const url = `https://q.yingjiesheng.com/jobs/search/${encodeURIComponent(input.keyword)}${cityCode ? `?jobarea=${cityCode}` : ''}`;
  try {
    const html = await headlessDump(url);
    // 风控页检测（阿里云滑块）：如实报告，不绕过
    if (/滑动验证|AliyunCaptcha|captcha-frontend/.test(html)) {
      return { samples: [], ok: false, note: `应届生求职网当前需要页面验证。打开 ${url} 复制接口数据后可用 parse_yjs_jobs 解析。` };
    }
    const samples = parseYjsCards(html, input.employmentType)
      .filter((s) => (input.city ? (s.location ?? '').includes(input.city) : true))
      .slice(0, input.sampleLimit);
    return {
      samples,
      ok: samples.length > 0,
      note: samples.length
        ? `应届生求职网返回 ${samples.length} 条校招岗位（来源：q.yingjiesheng.com，均附岗位链接）。`
        : `应届生求职网页面未解析到岗位卡片；可让用户复制接口数据后用 parse_yjs_jobs 解析。`,
    };
  } catch (err) {
    return { samples: [], ok: false, note: `应届生求职网搜索失败（${err instanceof Error ? err.message : '未知'}），已按规则跳过该通道。` };
  }
}

/** 解析渲染后的搜索页 DOM 中的岗位卡片（q.yingjiesheng.com 卡片含 jobdetail/<id>.html 链接） */
export function parseYjsCards(html: string, employmentType: EmploymentType): JobSample[] {
  const samples: JobSample[] = [];
  const seen = new Set<string>();
  const re = /<a[^>]+href="[^"]*jobdetail\/(\d+)\.html[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const jobId = m[1];
    if (seen.has(jobId)) continue;
    seen.add(jobId);
    const text = m[2]
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text || text.length < 4) continue;
    samples.push({
      title: text.slice(0, 100),
      company: null,
      location: null,
      employment_type: employmentType,
      education_requirement: null,
      experience_requirement: null,
      skills: [],
      description: text.slice(0, 800),
      source_url: `https://q.yingjiesheng.com/jobdetail/${jobId}.html`,
      fetched_at: new Date().toISOString(),
      source_type: 'web' as const,
    });
  }
  return samples;
}

/**
 * 解析粘贴数据（离线可用）：
 *  ① job-hunter 监听到的 noauth 搜索接口 JSON（resultbody.searchData.joblist.items）
 *  ② 或单条详情接口 JSON（resultbody 直含 jobid/jobname）
 *  ③ 或纯文本岗位卡片（含「岗位/公司/薪资」字样），按行拆条
 * 返回统一 JobSample；转载/过期岗位（isReprintJob/isExpire=1）如实跳过。
 */
export function parseYjsPayload(payload: string, employmentType: EmploymentType = 'internship'): { samples: JobSample[]; skipped: number } {
  const trimmed = payload.trim();
  let items: RawYjsItem[] = [];
  let skipped = 0;
  try {
    const data = JSON.parse(trimmed) as Record<string, unknown>;
    const list =
      ((data as { resultbody?: { searchData?: { joblist?: { items?: unknown[] } }; jobid?: string } }).resultbody?.searchData?.joblist?.items as RawYjsItem[] | undefined) ??
      ((data as { searchData?: { joblist?: { items?: RawYjsItem[] } } }).searchData?.joblist?.items as RawYjsItem[] | undefined) ??
      ((data as { items?: RawYjsItem[] }).items as RawYjsItem[] | undefined) ??
      (((data as { resultbody?: Record<string, unknown> }).resultbody?.jobid as string | undefined) ? [data.resultbody as RawYjsItem] : []);
    items = list.filter((x) => x && typeof x === 'object');
  } catch {
    // 纯文本：按岗位卡片分块（每块含 jobdetail 链接或「岗位/公司」标识）
    const blocks = trimmed.split(/\n\s*\n/).map((b) => b.trim()).filter((b) => b.length > 10);
    items = blocks.map((b, i) => {
      const idMatch = /jobdetail\/(\d+)\.html/.exec(b);
      return {
        jobid: idMatch?.[1] ?? `paste-${i + 1}`, // 无链接文本块用占位 ID（source_url 置空，不伪造链接）
        jobname: /岗位[：:]\s*(.+)/.exec(b)?.[1]?.slice(0, 60) ?? b.split(/\s|，/)[0].slice(0, 40),
        coname: /公司[：:]\s*([^；;\n]+)/.exec(b)?.[1],
        providesalary: /薪资[：:]\s*([^；;\n]+)/.exec(b)?.[1],
        jobarea: /(北京|上海|广州|深圳|杭州)[^\n；;]*/.exec(b)?.[0],
        workyear: /(应届|在校|实习|不限|\d+[-\d]*年)/.exec(b)?.[0],
        degree: /(本科|硕士|大专|学历不限)/.exec(b)?.[0],
      };
    });
  }
  const samples: JobSample[] = [];
  for (const item of items) {
    if (isReprint(item)) {
      skipped++;
      continue;
    }
    const s = toSample(item, employmentType);
    if (s) samples.push(s);
  }
  return { samples, skipped };
}
