'use client';
// AI 顾问页:全幅聊天(会话侧栏 + 模型选择 + 全高消息流)
import { AgentChat } from '@/components/AgentChat';

const SUGGESTIONS = ['我目前最应该学习什么？', '帮我分析北京的 Java 岗位', '为什么推荐我完成这个项目？', '生成我的简历草稿'];

export default function AdvisorPage() {
  // 主布局 main 为 px-9 py-8,负边距撑满成整屏聊天
  return (
    <div className="-mx-9 -my-8 flex h-screen flex-col bg-paper">
      <AgentChat full suggestions={SUGGESTIONS} />
    </div>
  );
}
