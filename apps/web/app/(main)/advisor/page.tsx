'use client';
// AI 顾问页:全幅聊天(会话侧栏 + 模型选择 + 全高消息流)
import { AgentChat } from '@/components/AgentChat';

const SUGGESTIONS = ['我目前最应该学习什么？', '帮我分析北京的 Java 岗位', '为什么推荐我完成这个项目？', '生成我的简历草稿'];

export default function AdvisorPage() {
  return (
    <div className="flex h-full min-h-0 flex-col bg-paper">
      <AgentChat full suggestions={SUGGESTIONS} />
    </div>
  );
}
