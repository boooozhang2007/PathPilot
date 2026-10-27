// 岗位要求抽取（PRD 4.2/6.3 extract_requirements）
// 双通道：词典关键词抽取（确定性，规则引擎） / LLM 批量抽取（Pi-ai，配置 key 后启用）
import type { JobSample } from '@pathpilot/shared';
import { z } from 'zod';
import type { SkillNormalizer } from '../../services/normalize.js';
import { modelCallFailed } from '../../services/errors.js';

export interface ExtractedJob {
  skills: string[]; // 原始词条（归一化在统计阶段进行，保留原始依据）
  education: string | null;
  experience: string | null;
  bonus: string[];
  soft: string[];
}

const SOFT_PATTERNS: [RegExp, string][] = [
  [/沟通能力|沟通协调/, '沟通能力'],
  [/团队协作|团队合作|协作精神/, '团队协作'],
  [/学习能力|快速学习/, '学习能力'],
  [/问题分析|分析问题|解决问[题题]能力|排查/, '问题分析与解决'],
  [/责任心|责任感/, '责任心'],
  [/抗压/, '抗压能力'],
  [/主动[性权]/, '主动性'],
];

/** 英文缩写/词条按词边界匹配，避免 ML/HTML、Go/MongoDB、OS/position 这类子串误判 */
function containsTerm(text: string, term: string): boolean {
  const needle = term.trim().toLowerCase();
  if (!needle) return false;
  if (/^[\x00-\x7F]+$/.test(needle)) {
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|[^a-z0-9+#.])${escaped}(?:$|[^a-z0-9+#.])`, 'i').test(text.toLowerCase());
  }
  return text.toLowerCase().includes(needle);
}

/** 规则引擎通道：基于技能词典的关键词匹配抽取（保留证据上下文） */
export function extractRequirementsByKeywords(sample: JobSample, normalize: SkillNormalizer, catalogTerms: string[]): ExtractedJob {
  const text = `${sample.description}`;
  const found = new Map<string, string>(); // canonical → original term
  for (const term of catalogTerms) {
    const needle = term.trim();
    if (needle.length < 2) continue;
    if (containsTerm(text, needle)) {
      const n = normalize(term);
      if (!found.has(n.canonical)) found.set(n.canonical, term);
    }
  }
  const soft = SOFT_PATTERNS.filter(([re]) => re.test(text)).map(([, label]) => label);
  const bonusZone = /(加分|优先|plus|bonus)[\s\S]{0,400}/i.exec(text)?.[0] ?? '';
  const bonus = bonusZone
    ? [...found.keys()].filter((k) => bonusZone.toLowerCase().includes(k.toLowerCase())).slice(0, 5)
    : [];
  return {
    skills: [...found.values()],
    education: sample.education_requirement,
    experience: sample.experience_requirement,
    bonus,
    soft,
  };
}

// ---------- LLM 通道（Pi-ai 直连批量抽取，无工具循环） ----------
const llmExtractionSchema = z.object({
  jobs: z.array(
    z.object({
      index: z.number().int().min(0),
      skills: z.array(z.string()).max(30).default([]),
      education: z.string().nullable(),
      experience: z.string().nullable(),
      bonus: z.array(z.string()).max(10).default([]),
      soft: z.array(z.string()).max(10).default([]),
    })
  ),
});

export async function extractRequirementsByLlm(samples: JobSample[], signal?: AbortSignal): Promise<Map<number, ExtractedJob>> {
  const { runStructuredAgent } = await import('../pi/runtime.js');
  const listing = samples
    .map((s, i) => `【样本${i}】标题: ${s.title}\n描述: ${s.description.slice(0, 1200)}`)
    .join('\n\n');
  const { data } = await runStructuredAgent(
    {
      systemPrompt:
        '你是岗位需求抽取器。从给定的招聘描述中抽取结构化要求。只抽取描述中真实出现的内容，不得推断或补全；技能用通用规范名（如 JavaScript、Spring Boot、SQL）。education/experience 无明确说明时为 null。必须调用 submit_result 提交。',
      prompt: `抽取以下 ${samples.length} 条岗位描述的要求，返回 jobs 数组，每条含 index（对应样本序号）、skills、education、experience、bonus、soft。\n\n${listing}`,
      schema: llmExtractionSchema,
      wallClockMs: 120_000,
      signal,
    },
    (_toolCalls, captured) => (captured.length ? captured[captured.length - 1] : undefined)
  ).catch((err) => {
    throw modelCallFailed(`LLM 技能抽取失败: ${err instanceof Error ? err.message : err}`);
  });
  const map = new Map<number, ExtractedJob>();
  for (const job of data.jobs) {
    map.set(job.index, {
      skills: job.skills ?? [],
      education: job.education ?? null,
      experience: job.experience ?? null,
      bonus: job.bonus ?? [],
      soft: job.soft ?? [],
    });
  }
  return map;
}
