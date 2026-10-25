// 简历草稿（PRD 4.9）：只用真实经历，不虚构量化数据；LLM 通道
import { resumeDraftResult, type ResumeDraftResult } from '@pathpilot/shared';
import { listExperiences } from '../services/profileService.js';
import { runStructuredAgent } from './pi/runtime.js';
import { isLlmConfigured } from './settings.js';
import { badRequest, modelCallFailed } from '../services/errors.js';

export async function resumeDraft(userId: number, input: { targetRole: string; experienceIds?: number[] }): Promise<{ draft: ResumeDraftResult; engine: 'pi-llm' | 'rules' }> {
  const all = await listExperiences(userId);
  if (!all.length) throw badRequest('能力档案中暂无经历，请先添加真实经历');
  const selected = input.experienceIds?.length ? all.filter((e) => input.experienceIds!.includes(e.id)) : all;
  if (!selected.length) throw badRequest('所选经历不存在');
  if (!(await isLlmConfigured())) throw badRequest('未配置模型 API：请管理员在 /admin 页面配置后再生成简历草稿');
  try {
    const { data } = await runStructuredAgent(
      {
        systemPrompt:
          '你是应届生简历撰写助手。规则：只使用用户提供的真实经历；不得虚构任何数据、指标、奖项、成果；用户未提供量化结果时不得编造百分比或数字；输出为结构化简历草稿。必须调用 submit_result 提交。',
        prompt: `目标岗位：${input.targetRole}\n\n真实经历（JSON）：\n${JSON.stringify(selected, null, 2)}\n\n请生成简历草稿：data 含 target_role/summary/sections(heading+items)/notes。notes 中说明哪些信息建议用户补充真实数据。`,
        schema: resumeDraftResult,
        wallClockMs: 120_000,
      },
      (_calls, captured) => (captured.length ? captured[captured.length - 1] : undefined)
    );
    return { draft: { ...data, notes: data.notes ?? [] }, engine: 'pi-llm' };
  } catch (err) {
    throw modelCallFailed(`简历草稿生成失败：${err instanceof Error ? err.message : '未知错误'}`);
  }
}
