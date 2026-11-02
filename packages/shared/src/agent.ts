import type { ChatMessageDTO } from './types';
import type { Engine } from './enums';

export interface AgentStreamEvent {
  type: 'session' | 'thinking' | 'tool_start' | 'tool_progress' | 'tool_end' | 'text' | 'done' | 'error';
  delta?: string;
  name?: string;
  toolCallId?: string;
  summary?: string;
  isError?: boolean;
  engine?: Engine;
  model?: string;
  fallbackReason?: string;
  errorCode?: string;
  sessionId?: number;
  userMessageId?: number;
  messageId?: number;
  autoWrite?: boolean;
  /** 最终以服务端保存的回复为准，包含真实 ID、完整文本和执行状态。 */
  reply?: ChatMessageDTO;
}

export interface AgentToolState {
  name: string;
  toolCallId?: string;
  status: 'running' | 'done' | 'error' | 'canceled';
  summary?: string;
}

export interface AgentStreamState {
  text: string;
  thinking: string;
  tools: AgentToolState[];
  startedAt: number;
  phase?: 'connecting' | 'thinking' | 'executing' | 'responding' | 'finished' | 'error';
  engine?: Engine;
  model?: string;
}

export const AGENT_TOOL_LABELS: Record<string, string> = {
  get_user_profile: '读取能力档案', update_user_profile: '更新个人资料',
  upsert_skill: '更新技能', create_experience: '记录经历',
  get_tasks: '查询任务', update_task_status: '更新任务状态',
  get_current_roadmap: '读取成长路线', get_roadmap_versions: '查询路线历史',
  generate_roadmap: '生成成长路线', create_roadmap_revision: '调整成长路线',
  roadmap_add_task: '添加任务', roadmap_update_task: '更新任务', roadmap_remove_task: '移除任务',
  get_job_analysis: '读取岗位洞察', analyze_jobs: '分析招聘需求',
  analyze_skill_gap: '评估能力差距', search_jobs: '搜索招聘岗位', fetch_job_page: '读取岗位详情',
  extract_requirements: '提取任职要求', normalize_skills: '匹配技能', generate_resume_draft: '整理简历草稿',
};

export const AGENT_PHASE_LABELS: Record<NonNullable<AgentStreamState['phase']>, string> = {
  connecting: '正在连接职业顾问',
  thinking: '正在整理你的资料',
  executing: '正在执行当前步骤',
  responding: '正在组织回复',
  finished: '回复已完成',
  error: '本次回复未完成',
};

export function applyAgentEvent(state: AgentStreamState, event: AgentStreamEvent): AgentStreamState {
  if (event.type === 'session') return { ...state, phase: 'thinking' };
  if (event.type === 'text') return { ...state, text: state.text + (event.delta ?? ''), phase: 'responding' };
  if (event.type === 'thinking') return { ...state, thinking: state.thinking + (event.delta ?? ''), phase: 'thinking' };
  if (event.type === 'tool_start') return { ...state, phase: 'executing', tools: [...state.tools, {
    name: event.name ?? '', toolCallId: event.toolCallId, status: 'running',
  }] };
  if (event.type === 'tool_progress' || event.type === 'tool_end') {
    const tools = [...state.tools];
    let index = -1;
    for (let i = tools.length - 1; i >= 0; i--) {
      const tool = tools[i];
      if (tool.status === 'running' && (event.toolCallId ? tool.toolCallId === event.toolCallId : !event.name || tool.name === event.name)) { index = i; break; }
    }
    if (index >= 0) tools[index] = { ...tools[index], summary: event.summary ?? tools[index].summary,
      status: event.type === 'tool_end' ? event.isError ? 'error' : 'done' : 'running' };
    return { ...state, tools, phase: tools.some((tool) => tool.status === 'running') ? 'executing' : state.text ? 'responding' : 'thinking' };
  }
  if (event.type === 'error') return { ...state, phase: 'error' };
  if (event.type === 'done') return { ...state, phase: 'finished', engine: event.engine, model: event.model };
  return state;
}

export function completedAgentTools(tools: AgentToolState[]): ChatMessageDTO['toolCalls'] {
  return tools.map((tool) => ({ name: tool.name, toolCallId: tool.toolCallId,
    status: tool.status === 'running' ? 'canceled' : tool.status,
    summary: tool.summary ?? (tool.status === 'running' ? '执行已中止' : ''),
  }));
}

const eventTypes = new Set(['session', 'thinking', 'tool_start', 'tool_progress', 'tool_end', 'text', 'done', 'error']);

/** 增量 SSE 解析器：支持拆包、CRLF、多行 data、注释心跳和无尾部空行。 */
export function createAgentEventParser(onEvent: (event: AgentStreamEvent) => void) {
  let buffer = '';
  const dispatch = (frame: string) => {
    const data = frame.split(/\r?\n/).filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).replace(/^ /, '')).join('\n');
    if (!data.trim() || data.trim() === '[DONE]') return;
    let event: AgentStreamEvent;
    try { event = JSON.parse(data) as AgentStreamEvent; }
    catch { throw new Error('服务端流式响应格式不完整，请重试'); }
    if (event && typeof event === 'object' && eventTypes.has(event.type)) onEvent(event);
  };
  return {
    push(chunk: string) {
      buffer += chunk;
      for (;;) {
        const boundary = /\r?\n\r?\n/.exec(buffer);
        if (!boundary) break;
        dispatch(buffer.slice(0, boundary.index));
        buffer = buffer.slice(boundary.index + boundary[0].length);
      }
      if (buffer.length > 2_000_000) throw new Error('服务端响应过大，请重试');
    },
    finish() { if (buffer.trim()) dispatch(buffer); buffer = ''; },
  };
}

export function abortError(): Error {
  return Object.assign(new Error('操作已取消'), { name: 'AbortError' });
}

type StreamReader = {
  read: () => Promise<{ done: boolean; value?: Uint8Array }>;
  cancel?: () => Promise<unknown>;
  releaseLock?: () => void;
};

/** done 是完成依据；断线、卡住和被取消都不能误报成功。 */
export async function readAgentStream(
  body: { getReader: () => StreamReader }, onEvent: (event: AgentStreamEvent) => void,
  signal?: AbortSignal, decode?: (bytes: Uint8Array, final?: boolean) => string
): Promise<AgentStreamEvent> {
  if (signal?.aborted) throw abortError();
  const reader = body.getReader();
  const decoder = decode ? null : new TextDecoder();
  const decodeChunk = decode ?? ((bytes: Uint8Array, final = false) => decoder!.decode(bytes, { stream: !final }));
  let completion: AgentStreamEvent | undefined;
  const parser = createAgentEventParser((event) => { if (event.type === 'done') completion = event; onEvent(event); });
  let rejectAbort!: (error: Error) => void;
  const interrupted = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
  const abort = () => rejectAbort(abortError());
  signal?.addEventListener('abort', abort, { once: true });
  try {
    while (!completion) {
      const { done, value } = await Promise.race([reader.read(), interrupted]);
      if (done) {
        parser.push(decodeChunk(new Uint8Array(0), true));
        parser.finish();
        break;
      }
      parser.push(decodeChunk(value ?? new Uint8Array(0)));
    }
    if (!completion) throw Object.assign(new Error('连接已中断，回复尚未完成，请重试'), { code: 'STREAM_INTERRUPTED' });
    return completion;
  } finally {
    signal?.removeEventListener('abort', abort);
    try { void reader.cancel?.().catch(() => {}); } catch { /* 流可能已关闭。 */ }
    try { reader.releaseLock?.(); } catch { /* 被取消的读取可能仍在落尾。 */ }
  }
}

export function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(abortError()); return; }
    const abort = () => { clearTimeout(timer); reject(abortError()); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
    signal?.addEventListener('abort', abort, { once: true });
  });
}
