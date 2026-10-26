import { and, eq } from 'drizzle-orm';
import type { AdviceIntent, AgentFlowDTO, AgentFlowState } from '@pathpilot/shared';
import { db } from '../db/client.js';
import { agentChatSessions } from '../db/schema.js';
import { getProfile } from '../services/profileService.js';

const INTENTS: { id: AdviceIntent; label: string; words: string[] }[] = [
  { id: 'job_insight', label: '岗位洞察', words: ['岗位', '招聘', '职位', '市场'] },
  { id: 'skill_gap', label: '能力差距', words: ['差距', '技能缺口', '能力'] },
  { id: 'roadmap', label: '成长路线', words: ['路线', '规划', '学习计划', '成长'] },
  { id: 'task_breakdown', label: '任务拆解', words: ['拆解', '子任务', '任务'] },
  { id: 'resume', label: '简历准备', words: ['简历', '经历'] },
  { id: 'interview', label: '面试模拟', words: ['面试', '模拟'] },
];

function missingProfile(profile: Awaited<ReturnType<typeof getProfile>>): string[] {
  if (!profile) return ['昵称', '学校', '专业', '年级', '目标岗位', '发展路径', '每周可投入时间'];
  const missing: string[] = [];
  if (!profile.school) missing.push('学校');
  if (!profile.major) missing.push('专业');
  if (!profile.targetRole) missing.push('目标岗位');
  if (!profile.careerPath) missing.push('发展路径');
  if (!profile.grade) missing.push('当前年级');
  if (!profile.weeklyHours || profile.weeklyHours < 1) missing.push('每周可投入时间');
  return missing;
}

function detectIntent(message: string): AdviceIntent | null {
  const text = message.toLowerCase();
  const hit = INTENTS.find((x) => x.words.some((word) => text.includes(word.toLowerCase())));
  return hit?.id ?? null;
}

export async function prepareFlow(userId: number, sessionId: number, message: string): Promise<AgentFlowDTO> {
  const rows = await db.select().from(agentChatSessions).where(and(eq(agentChatSessions.id, sessionId), eq(agentChatSessions.userId, userId))).limit(1);
  const session = rows[0];
  const profile = await getProfile(userId);
  const missing = missingProfile(profile);
  const detected = detectIntent(message);
  let state = session?.flowState as AgentFlowState | undefined;
  let selected = (session?.selectedIntent as AdviceIntent | null) ?? null;
  if (missing.length) {
    state = 'profile_collect';
  } else if (detected) {
    selected = detected;
    state = 'tool_execution';
  } else if (!selected) {
    state = 'advice_intent_select';
  } else if (state === 'result_review' || state === 'next_action') {
    state = 'next_action';
  } else {
    state = state ?? 'advice_intent_select';
  }
  await db.update(agentChatSessions).set({ flowState: state, selectedIntent: selected, profileSnapshot: profile ? { school: profile.school, major: profile.major, grade: profile.grade, targetRole: profile.targetRole, careerPath: profile.careerPath, weeklyHours: profile.weeklyHours } : null, updatedAt: new Date().toISOString() }).where(eq(agentChatSessions.id, sessionId));
  return {
    state,
    missingProfileFields: missing,
    selectedIntent: selected,
    nextActions: missing.length ? [{ id: 'profile', label: '完善资料' }] : INTENTS.map(({ id, label }) => ({ id, label })),
  };
}

export async function markFlowResult(sessionId: number, resultType = 'assistant'): Promise<void> {
  await db.update(agentChatSessions).set({ flowState: 'result_review', lastResultRef: { type: resultType }, updatedAt: new Date().toISOString() }).where(eq(agentChatSessions.id, sessionId));
}

export function flowPrompt(flow: AgentFlowDTO): string {
  if (flow.state === 'profile_collect') return `当前流程阶段：资料补充。缺少字段：${flow.missingProfileFields.join('、')}。只引导用户到资料页补充这些字段，不调用业务工具，不生成岗位分析、规划或任务。`;
  if (flow.state === 'advice_intent_select') return '当前流程阶段：建议类型选择。请用清晰的选项让用户选择岗位洞察、能力差距、成长路线、任务拆解、简历准备或面试模拟；不要提前执行工具。';
  if (flow.state === 'tool_execution') return `当前流程阶段：执行${flow.selectedIntent ?? '用户选择的建议'}。调用与该意图匹配的工具，完成后说明结果并给出下一步操作。`;
  if (flow.state === 'result_review') return '当前流程阶段：结果复核。让用户确认结果是否符合预期，并提供继续、调整或查看详情的操作。';
  return '当前流程阶段：下一步行动。优先提供可以直接执行的下一步操作。';
}

export function flowToolsEnabled(flow: AgentFlowDTO): boolean {
  return flow.state === 'tool_execution' || flow.state === 'result_review' || flow.state === 'next_action';
}
