// 技能归一化（PRD 4.3）：词典精确别名匹配，保留原始词条，不合并语义相近但不等价的技能
import type { SkillCategory, SkillCatalogItem } from '@pathpilot/shared';

export interface NormalizedSkill {
  canonical: string;
  category: SkillCategory;
  /** 命中的词典条目（名称或别名），未命中为 null */
  matched: boolean;
}

export type SkillNormalizer = (term: string) => NormalizedSkill;

const SUFFIXES_TO_STRIP = ['开发', '编程', '基础', '能力', '熟练使用', '熟悉', '掌握', '了解'];

function cleanTerm(raw: string): string {
  let t = raw.trim().toLowerCase();
  // 去掉常见修饰后缀（如 "Spring Boot 开发" → "spring boot"）
  for (const suffix of SUFFIXES_TO_STRIP) {
    if (t.endsWith(suffix.toLowerCase()) && t.length > suffix.length + 1) {
      t = t.slice(0, -suffix.length).trim();
    }
  }
  return t.replace(/[，,、；;。.\s]+/g, '');
}

/**
 * 构建归一化器：大小写与空白不敏感；仅按词典别名合并（PRD：不得随意合并相近技能）。
 * 未命中词典的词条原样返回（matched=false），由调用方决定是否人工补充词典。
 */
export function buildNormalizer(catalog: SkillCatalogItem[]): SkillNormalizer {
  const aliasMap = new Map<string, { canonical: string; category: SkillCategory }>();
  for (const item of catalog) {
    aliasMap.set(cleanTerm(item.name), { canonical: item.name, category: item.category });
    for (const alias of item.aliases ?? []) {
      const key = cleanTerm(alias);
      if (!aliasMap.has(key)) aliasMap.set(key, { canonical: item.name, category: item.category });
    }
  }
  return (term: string): NormalizedSkill => {
    const cleaned = cleanTerm(term);
    const hit = aliasMap.get(cleaned);
    if (hit) return { canonical: hit.canonical, category: hit.category, matched: true };
    // 未命中：按原词（去修饰）返回，分类置为框架类占位，由上层标记
    return { canonical: term.trim(), category: 'framework', matched: false };
  };
}

export interface ExtractedSkillRef {
  original: string;
  normalized: string;
  category: SkillCategory;
  matched: boolean;
}

/** 批量归一化并保留 原始词条 → 归一化结果 映射（PRD：必须保留原始词条和归一化依据） */
export function normalizeSkillList(
  terms: string[],
  normalize: SkillNormalizer
): { refs: ExtractedSkillRef[]; byCanonical: Map<string, ExtractedSkillRef[]> } {
  const refs = terms.map((original) => {
    const n = normalize(original);
    return { original, normalized: n.canonical, category: n.category, matched: n.matched };
  });
  const byCanonical = new Map<string, ExtractedSkillRef[]>();
  for (const r of refs) {
    const list = byCanonical.get(r.normalized) ?? [];
    list.push(r);
    byCanonical.set(r.normalized, list);
  }
  return { refs, byCanonical };
}
