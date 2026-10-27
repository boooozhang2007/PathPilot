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

/**
 * 猎聘岗位搜索（官方 CLI）。返回统一 JobSample：
 * 搜索结果字段 + 详情页 JD 正文（供技能抽取）；失败如实返回 ok:false（上层降级其他通道）。
 */
export async function liepinSearchJobs(
  input: {
    targetRole: string;
    city?: string;
    employmentType: EmploymentType;
    sampleLimit: number;
  },
  opts: { signal?: AbortSignal } = {}
): Promise<LiepinSearchOutcome> {
  const signal = opts.signal;
  if (!process.env.LIEPIN_USER_TOKEN) {
    return { samples: [], ok: false, note: '未配置 LIEPIN_USER_TOKEN（猎聘官方通道未启用）。' };
  }
  if (!cliPath()) {
    return { samples: [], ok: false, note: '未找到 liepin-cli（tools/liepin-cli/.venv，安装见 README）。' };
  }
  // CLI 搜索：优先缓存；未命中时调用（突发限流会返回空列表，退避重试 2 次）
  const cacheKey = `${input.targetRole}|${input.city ?? ''}`;
  const cached = cache.get(cacheKey);
  let raw: RawLiepinJob[] = [];
  let fromCache = false;
  let lastErr = '';
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    raw = cached.jobs;
    fromCache = true;
    cacheSet(cacheKey, cached); // 命中也刷新新鲜度（LRU）
  } else {
    for (let attempt = 0; attempt < 3 && raw.length === 0; attempt++) {
      if (signal?.aborted) throw new Error('已取消');
      if (attempt > 0) await new Promise((r) => setTimeout(r, 3000));
      try {
        const stdout = await runCli(
          ['job', 'search', '--job-name', input.targetRole, ...(input.city ? ['--address', input.city] : []), '--page', '0', '--output', 'json'],
          30_000,
          signal
        );
        const parsed = JSON.parse(stdout.replace(/^[^{[]*/, '')) as { data?: { list?: RawLiepinJob[] } };
        raw = parsed.data?.list ?? [];
        if (!raw.length) lastErr = '接口返回空列表（可能触发突发限流，稍后重试或更换关键词）';
      } catch (err) {
        lastErr = err instanceof Error ? err.message : String(err);
      }
    }
    if (raw.length) cacheSet(cacheKey, { at: Date.now(), jobs: raw });
  }
  if (!raw.length) {
    return { samples: [], ok: false, note: `猎聘官方搜索失败（${lastErr || '无结果'}），已回退其他通道。` };
  }

  const now = new Date().toISOString();
  const samples: JobSample[] = [];
  let fetched = 0;
  for (const job of raw.slice(0, input.sampleLimit)) {
    if (signal?.aborted) throw new Error('已取消');
    // 详情页正文（供技能抽取；抓取失败时用结构化字段，如实可用）
    let description = '';
    if (job.jobDetailUrl) {
      try {
        const html = await fetchText(job.jobDetailUrl, 12000, undefined, { signal, allowedHosts: ['liepin.com'] });
        const jd = extractJdFromHtml(html);
        if (jd) {
          description = jd.description;
          fetched++;
        }
      } catch {
        /* 单条失败不阻断 */
      }
    }
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
  return {
    samples,
    ok: true,
    note: `猎聘官方渠道返回 ${samples.length} 条实时岗位（${fromCache ? '命中缓存' : '其中 ' + fetched + ' 条已抓取完整 JD 正文'}），来源：liepin.com，均附原始链接。`,
  };
}
