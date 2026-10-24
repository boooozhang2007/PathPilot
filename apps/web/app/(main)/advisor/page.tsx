'use client';
// AI 顾问页：共享 AgentChat（真实 API + 工具调用展示 + 模型选择）+ 简历草稿
import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/lib/api';
import { PageHeader, Tag } from '@/components/ui';
import { AgentChat } from '@/components/AgentChat';

const SUGGESTIONS = ['我目前最应该学习什么？', '帮我分析北京的 Java 岗位', '为什么推荐我完成这个项目？', '我的项目经历还缺少哪些证据？', '生成我的简历草稿'];

export default function AdvisorPage() {
  const [busyResume, setBusyResume] = useState(false);
  const [resumeText, setResumeText] = useState('');
  const [resumeErr, setResumeErr] = useState('');

  async function draftResume() {
    setBusyResume(true);
    setResumeErr('');
    try {
      const res = await api<{ draft: { summary: string; sections: { heading: string; items: string[] }[] } }>('/api/resume/draft', { method: 'POST', json: {} });
      setResumeText(`【简历草稿】\n${res.draft.summary}\n\n${res.draft.sections.map((s) => `▪ ${s.heading}\n${s.items.map((i) => `  · ${i}`).join('\n')}`).join('\n')}`);
    } catch (e) {
      setResumeErr(e instanceof Error ? e.message : '生成失败');
    } finally {
      setBusyResume(false);
    }
  }

  return (
    <div className="pp-anim">
      <PageHeader
        title="AI 顾问"
        right={
          <div className="flex items-center gap-2">
            <Link href="/admin" className="pp-btn pp-btn-ghost px-3 py-2 text-xs">模型管理</Link>
          </div>
        }
      />

      <div className="grid grid-cols-12 gap-5">
        <div className="pp-card col-span-8 flex flex-col overflow-hidden p-0">
          <AgentChat heightClass="h-[62vh]" showModel suggestions={SUGGESTIONS} />
        </div>

        <div className="col-span-4 space-y-5">
          <div className="pp-card p-5">
            <div className="mb-2 text-sm font-bold">简历草稿</div>
            <button className="pp-btn pp-btn-primary w-full py-2 text-xs" onClick={draftResume} disabled={busyResume}>
              {busyResume ? '生成中…' : '基于真实经历生成'}
            </button>
            {resumeErr && <div className="mt-3 rounded-lg bg-accent-soft px-3 py-2 text-xs text-accent">{resumeErr}</div>}
            {resumeText && <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-paper-2 p-3 text-[11px] leading-4 text-slate-1">{resumeText}</pre>}
          </div>
        </div>
      </div>
    </div>
  );
}
