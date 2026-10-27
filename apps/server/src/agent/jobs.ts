// 岗位分析流水线（PRD 4.2）：真实搜索 → 技能抽取 → 频次统计 → 结果落库
// 数据真实性规则：样本量如实、失败如实标注、绝不编造
import type { JobAnalysisDTO, JobAnalysisResult, JobSample } from '@pathpilot/shared';
import { getSkillCatalog, listProfileSkills } from '../services/profileService.js';
import { buildNormalizer } from '../services/normalize.js';
import { computeJobStats } from '../services/frequency.js';
import { saveSamples, attachAnalysisToSamples, saveRequirements, saveAnalysis, presetSamplesFor } from '../services/analysisService.js';
import { webSearchJobs } from './search/webSearch.js';
import { extractRequirementsByKeywords, extractRequirementsByLlm, type ExtractedJob } from './search/extract.js';
import { currentEngine } from './core.js';
import { isLlmConfigured } from './settings.js';
import { sampleInsufficient } from '../services/errors.js';

export interface AnalyzeJobsInput {
  targetRole: string;
  city?: string;
  employmentType: 'internship' | 'full_time';
  sampleLimit: number;
}

export interface JobWorkOptions {
  signal?: AbortSignal;
  onProgress?: (progress: number, message: string) => void;
}

function checkAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error('已取消');
}

export async function analyzeJobs(userId: number, input: AnalyzeJobsInput, opts: JobWorkOptions = {}): Promise<JobAnalysisDTO> {
  const limitations: string[] = [];
  checkAborted(opts.signal);
  // 1) 真实联网搜索
  opts.onProgress?.(10, '正在联网搜索真实招聘信息…');
  const web = await webSearchJobs(input, {
    signal: opts.signal,
    onProgress: (message) => opts.onProgress?.(25, message),
  });
  checkAborted(opts.signal);
  if (web.note) limitations.push(web.note);
  const samples: JobSample[] = dedupeSamples([...web.samples]);

  // 2) 样本不足 → 回退预置样本库（来源类型如实标注）
  if (samples.length < Math.min(5, input.sampleLimit)) {
    const preset = await presetSamplesFor(input.targetRole, input.employmentType, input.sampleLimit);
    if (preset.length) {
      samples.push(...dedupeSamples(preset, samples));
      limitations.push(`联网样本不足，已补充 ${preset.length} 条预置真实样本（来源类型=preset，附原始链接，采集时间见来源列表）。`);
    }
  }

  if (!samples.length) {
    limitations.push('未取得任何有效岗位样本。可在岗位洞察页手动粘贴岗位描述（来源类型=manual）后重新分析。');
    // 仍然落库一个空结果，明确报告数据不足（PRD 4.2 验收：必须明确报告数据不足）
    const empty = buildResult(input.targetRole, [], {
      sampleCount: 0,
      parseFailedCount: web.failedCount,
      skills: [],
      education: [],
      experience: [],
    }, [], limitations);
    opts.onProgress?.(90, '保存分析结果…');
    return saveAnalysis(userId, { ...input, engine: await currentEngine() }, empty);
  }

  // 3) 技能抽取（LLM 通道 / 词典关键词通道）
  checkAborted(opts.signal);
  const catalog = await getSkillCatalog();
  const normalize = buildNormalizer(catalog);
  const catalogTerms = catalog.flatMap((c) => [c.name, ...(c.aliases ?? [])]);
  let extracted: Map<number, ExtractedJob>;
  if (await isLlmConfigured()) {
    opts.onProgress?.(55, `正在用 AI 抽取 ${samples.length} 条样本的技能要求…`);
    try {
      extracted = await extractRequirementsByLlm(samples, opts.signal);
      limitations.push('技能抽取由 AI 模型完成（仅从真实岗位文本抽取，未推断）。');
    } catch (err) {
      checkAborted(opts.signal);
      limitations.push(`AI 抽取失败（${err instanceof Error ? err.message : '未知'}），已回退词典关键词抽取。`);
      extracted = keywordExtract(samples, normalize, catalogTerms);
    }
  } else {
    extracted = keywordExtract(samples, normalize, catalogTerms);
    limitations.push('技能抽取由技能词典关键词匹配完成（未配置 AI 模型 Key）。');
  }
  checkAborted(opts.signal);

  // 4) 回填技能到样本 + 频次统计（只统计成功样本）
  const filled: JobSample[] = samples.map((s, i) => {
    const ex = extracted.get(i);
    return {
      ...s,
      skills: ex?.skills?.length ? ex.skills : keywordForOne(s, normalize, catalogTerms).skills,
      education_requirement: s.education_requirement ?? ex?.education ?? null,
      experience_requirement: s.experience_requirement ?? ex?.experience ?? null,
      relevance_score: relevanceScore(s, input.targetRole, input.city),
      content_quality_score: Math.min(100, Math.round((s.description.length / 1200) * 100)),
      dedupe_key: s.source_url ? s.source_url.replace(/\/$/, '').toLowerCase() : undefined,
    };
  });
  const stats = computeJobStats(filled, web.failedCount, normalize);
  if (stats.sampleCount < 5) limitations.push(`当前取得 ${stats.sampleCount} 条有效岗位样本，统计按当前样本计算。`);

  const result = buildResult(
    input.targetRole,
    filled,
    stats,
    web.attempts.map((a) => ({ title: a.title, source_url: a.url, source_type: 'web' as const, parse_status: a.parse_status, fetched_at: new Date().toISOString() })),
    limitations
  );

  // 5) 落库：样本 + 要求明细 + 分析快照
  opts.onProgress?.(85, '保存岗位样本与分析结果…');
  const sourceIds = await saveSamples(userId, filled, 'ok');
  const analysis = await saveAnalysis(userId, { ...input, engine: await currentEngine() }, result);
  await attachAnalysisToSamples(analysis.id, sourceIds);
  const requirementRows = sourceIds.flatMap((sid, i) => {
    const ex = extracted.get(i);
    const sample = filled[i];
    const rows = sample.skills.map((skill) => ({
      jobSourceId: sid,
      originalText: skill,
      requirementType: 'skill',
      importance: stats.skills.find((s) => s.name === normalize(skill).canonical)?.required ? 'high' : 'medium',
      evidenceText: sample.description.slice(0, 200),
    }));
    const extras = [
      ...(sample.education_requirement ? [{ jobSourceId: sid, originalText: sample.education_requirement, requirementType: 'education', importance: 'medium' as const, evidenceText: null }] : []),
      ...(sample.experience_requirement ? [{ jobSourceId: sid, originalText: sample.experience_requirement, requirementType: 'experience', importance: 'medium' as const, evidenceText: null }] : []),
      ...(ex?.bonus ?? []).map((b) => ({ jobSourceId: sid, originalText: b, requirementType: 'bonus', importance: 'low' as const, evidenceText: null })),
      ...(ex?.soft ?? []).map((b) => ({ jobSourceId: sid, originalText: b, requirementType: 'soft', importance: 'medium' as const, evidenceText: null })),
    ];
    return [...rows, ...extras];
  });
  await saveRequirements(requirementRows);
  return analysis;
}

/** 手动粘贴 JD 分析（PRD 4.2：搜索失败时允许手动输入，标明来源类型） */
export async function analyzeManualJob(
  userId: number,
  input: { targetRole: string; title: string; company?: string; location?: string; employmentType: 'internship' | 'full_time'; description: string; sourceUrl?: string },
  opts: JobWorkOptions = {}
): Promise<JobAnalysisDTO> {
  const sample: JobSample = {
    title: input.title,
    company: input.company ?? null,
    location: input.location ?? null,
    employment_type: input.employmentType,
    education_requirement: /(本科|硕士|研究生|大专)/.exec(input.description)?.[1] ?? null,
    experience_requirement: /(实习|应届|\d+年经验|项目经验)/.exec(input.description)?.[1] ?? null,
    skills: [],
    description: input.description,
    source_url: input.sourceUrl ?? null,
    fetched_at: new Date().toISOString(),
    source_type: 'manual',
  };
  const catalog = await getSkillCatalog();
  const normalize = buildNormalizer(catalog);
  const catalogTerms = catalog.flatMap((c) => [c.name, ...(c.aliases ?? [])]);
  let extracted: ExtractedJob;
  if (await isLlmConfigured()) {
    opts.onProgress?.(40, '正在用 AI 抽取岗位要求…');
    try {
      extracted = (await extractRequirementsByLlm([sample], opts.signal)).get(0) ?? keywordForOne(sample, normalize, catalogTerms);
    } catch {
      checkAborted(opts.signal);
      extracted = keywordForOne(sample, normalize, catalogTerms);
    }
  } else {
    extracted = keywordForOne(sample, normalize, catalogTerms);
  }
  checkAborted(opts.signal);
  sample.skills = extracted.skills;
  const stats = computeJobStats([sample], 0, normalize);
  const result = buildResult(input.targetRole, [sample], stats, [], [
    '本结果基于你手动粘贴的 1 条岗位描述（来源类型=manual）。',
  ]);
  opts.onProgress?.(85, '保存岗位分析结果…');
  const [sid] = await saveSamples(userId, [sample], 'ok');
  const analysis = await saveAnalysis(userId, { targetRole: input.targetRole, employmentType: input.employmentType, city: input.location, engine: await currentEngine() }, result);
  await attachAnalysisToSamples(analysis.id, [sid]);
  await saveRequirements(
    sample.skills.map((skill) => ({ jobSourceId: sid, originalText: skill, requirementType: 'skill', importance: 'medium', evidenceText: input.description.slice(0, 200) }))
  );
  return analysis;
}

export { sampleInsufficient };

// ---------- 内部 ----------
function keywordExtract(samples: JobSample[], normalize: ReturnType<typeof buildNormalizer>, catalogTerms: string[]): Map<number, ExtractedJob> {
  const map = new Map<number, ExtractedJob>();
  samples.forEach((s, i) => map.set(i, extractRequirementsByKeywords(s, normalize, catalogTerms)));
  return map;
}

function keywordForOne(sample: JobSample, normalize: ReturnType<typeof buildNormalizer>, catalogTerms: string[]): ExtractedJob {
  return extractRequirementsByKeywords(sample, normalize, catalogTerms);
}

function dedupeSamples(samples: JobSample[], existing: JobSample[] = []): JobSample[] {
  const seen = new Set(existing.map((s) => s.source_url ? s.source_url.replace(/\/$/, '').toLowerCase() : `${s.title}|${s.company ?? ''}|${s.description.slice(0, 200)}`.toLowerCase()));
  const out: JobSample[] = [];
  for (const sample of samples) {
    const key = sample.source_url ? sample.source_url.replace(/\/$/, '').toLowerCase() : `${sample.title}|${sample.company ?? ''}|${sample.description.slice(0, 200)}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(sample);
  }
  return out;
}

function relevanceScore(sample: JobSample, targetRole: string, city?: string): number {
  const haystack = `${sample.title} ${sample.description}`.toLowerCase();
  const terms = targetRole.toLowerCase().split(/[\s/、，,]+/).filter((x) => x.length > 1);
  const hits = terms.filter((term) => haystack.includes(term)).length;
  const titleHit = targetRole && sample.title.toLowerCase().includes(targetRole.toLowerCase()) ? 25 : 0;
  const cityHit = city && `${sample.location ?? ''} ${sample.description}`.includes(city) ? 10 : 0;
  return Math.min(100, Math.round((hits / Math.max(1, terms.length)) * 55 + titleHit + cityHit + Math.min(10, sample.description.length / 300)));
}

function buildResult(
  targetRole: string,
  samples: JobSample[],
  stats: ReturnType<typeof computeJobStats>,
  webAttempts: { title: string; source_url: string; parse_status: string; fetched_at: string }[],
  limitations: string[]
): JobAnalysisResult {
  return {
    target_role: targetRole,
    sample_count: stats.sampleCount,
    skills: stats.skills.map((s) => ({
      name: s.name,
      category: s.category,
      count: s.count,
      frequency: Math.round(s.frequency * 1000) / 1000,
      required: s.required,
      original_terms: s.originalTerms,
    })),
    education_requirements: stats.education.map((d) => ({ label: d.label, count: d.count, ratio: Math.round(d.ratio * 1000) / 1000 })),
    experience_requirements: stats.experience.map((d) => ({ label: d.label, count: d.count, ratio: Math.round(d.ratio * 1000) / 1000 })),
    sources: [
      ...samples.map((s) => ({
        title: s.title,
        source_url: s.source_url,
        source_type: s.source_type,
        parse_status: 'ok',
        fetched_at: s.fetched_at,
        relevance_score: s.relevance_score ?? null,
        content_quality_score: s.content_quality_score ?? null,
      })),
      ...webAttempts.map((a) => ({ title: a.title, source_url: a.source_url, source_type: 'web' as const, parse_status: a.parse_status, fetched_at: a.fetched_at })),
    ],
    limitations,
  };
}
