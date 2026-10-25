'use client';
// AI 顾问页：Open WebUI 式全幅聊天（会话侧栏 + 模型选择 + 全高消息流）
// 简历草稿入口在聊天顶栏（结果以消息形式插入对话）
import { AgentChat } from '@/components/AgentChat';

const SUGGESTIONS = ['我目前最应该学习什么？', '帮我分析北京的 Java 岗位', '为什么推荐我完成这个项目？', '生成我的简历草稿'];

export default function AdvisorPage() {
  // 主布局 main 有 px-8 py-8，负边距撑满成整屏聊天（高 100vh - 顶栏留白由 main 决定）
  return (
    <div className="-mx-8 -my-8 flex h-screen flex-col">
      <AgentChat full suggestions={SUGGESTIONS} />
    </div>
  );
}
