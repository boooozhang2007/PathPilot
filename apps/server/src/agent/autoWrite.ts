import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { agentChatSessions } from '../db/schema.js';

/** 用户按会话授权 Agent 写操作；数据库持久化，跨设备和服务重启保持一致。 */
export function setSessionAutoWrite(sessionId: number, enabled: boolean): void {
  db.update(agentChatSessions).set({ autoWrite: enabled }).where(eq(agentChatSessions.id, sessionId)).run();
}

export function isSessionAutoWriteEnabled(sessionId: number): boolean {
  return db.select({ enabled: agentChatSessions.autoWrite }).from(agentChatSessions)
    .where(eq(agentChatSessions.id, sessionId)).get()?.enabled ?? false;
}
