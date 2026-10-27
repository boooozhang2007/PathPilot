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
  if (!profile) return ['目标岗位', '当前年级', '每周可投入时间'];
  const missing: string[] = [];
  if (!profile.targetRole) missing.push('目标岗位');
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
  if (detected) {
    selected = detected;
    state = 'tool_execution';
  } else if (missing.length) {
    state = 'profile_collect';
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
    nextActions: INTENTS.map(({ id, label }) => ({ id, label })),
  };
}

export async function markFlowResult(sessionId: number, resultType = 'assistant'): Promise<void> {
  await db.update(agentChatSessions).set({ flowState: 'result_review', lastResultRef: { type: resultType }, updatedAt: new Date().toISOString() }).where(eq(agentChatSessions.id, sessionId));
}

export function flowPrompt(flow: AgentFlowDTO): string {
  const missing = flow.missingProfileFields.length ? `目前尚未填写的资料有：${flow.missingProfileFields.join('、')}。` : '';
  const intent = flow.selectedIntent ? `用户近期关注${flow.selectedIntent}。` : '';
  return `${missing}${intent}结合用户的明确请求和现有资料自然推进对话；只有在用户目标宽泛时，才提供岗位洞察、能力差距、成长路线、任务拆解、简历准备或面试模拟等方向供选择。缺少的信息只有在会影响结论时再询问。`;
}
