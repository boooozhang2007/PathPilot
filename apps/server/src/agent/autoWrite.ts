// 会话级「自动写入」开关：Agent 写工具（改任务/规划/档案）默认拒绝执行，
// 用户在前端对话中显式开启后才放行（PRD 6.6 运行限制；会话级、内存态，服务重启后需重新开启）
const enabledSessions = new Set<number>();

export function setSessionAutoWrite(sessionId: number, enabled: boolean): void {
  if (enabled) enabledSessions.add(sessionId);
  else enabledSessions.delete(sessionId);
}

export function isSessionAutoWriteEnabled(sessionId: number): boolean {
  return enabledSessions.has(sessionId);
}
