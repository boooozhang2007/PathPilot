'use client';
// 首页 Dashboard：Agent 对话置于核心（真实 API），关键数据环绕
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Loading, Tag, Ring, PageHeader } from '@/components/ui';
import { AgentChat } from '@/components/AgentChat';
import type { DashboardData, RoadmapTaskDTO } from '@pathpilot/shared';
import { TASK_STATUS_LABELS, EVIDENCE_STATUS_LABELS, GRADE_LABELS } from '@pathpilot/shared';

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    api<DashboardData>('/api/dashboard')
      .then(setData)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  if (loading) return <Loading />;
  const d = data;
  const sem = d?.currentSemester ?? null;

  return (
    <div className="pp-anim">
      <PageHeader
        title={`${d?.profile?.nickname ?? '同学'}，下午好 👋`}
        desc={d?.profile ? `${GRADE_LABELS[d.profile.grade]} · 目标 ${d.profile.targetRole || '未设定'} · 每周 ${d.profile.weeklyHours}h` : '先完善个人资料，开始你的成长规划'}
        right={
          <Link href="/planning" className="pp-btn pp-btn-primary px-3 py-2 text-xs">
            {d?.activeRoadmapVersion ? '调整规划' : '生成规划'}
          </Link>
        }
      />

      <div className="grid grid-cols-12 gap-5">
        {/* 核心：Agent 对话（真实 API） */}
        <div className="pp-card col-span-8 overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <div className="flex items-center gap-2 text-sm font-bold">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-accent text-[11px] text-white">✦</span>
              AI 顾问
            </div>
            <Link href="/advisor" className="text-xs text-accent">完整对话 →</Link>
          </div>
          <AgentChat heightClass="h-[54vh]" suggestions={['我目前最应该学什么？', '帮我分析北京的 Java 岗位', '把每周改成 8 小时并重新规划']} />
        </div>

        {/* 右列：关键数据 */}
        <div className="col-span-4 space-y-5">
          <div className="pp-card p-5">
            <div className="mb-3 text-sm font-bold">能力匹配度</div>
            {d?.matchScore !== null && d ? (
              <div className="flex items-center gap-5">
                <Ring value={d.matchScore} size={96} />
                <div className="min-w-0 flex-1">
                  <div className="mb-2 text-xs font-semibold text-slate-1">岗位需求能力</div>
                  {d.jobSkills.length > 0 ? (
                    <ul className="space-y-1.5">
                      {d.jobSkills.map((s) => (
                        <li key={s.name} className="flex items-center gap-2 text-xs">
                          <span className="w-14 shrink-0 truncate font-semibold text-ink">{s.name}</span>
                          <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-paper-2">
                            <span className="block h-full rounded-full bg-accent/70" style={{ width: `${Math.round(s.frequency * 100)}%` }} />
                          </span>
                          {s.required && <span className="shrink-0 rounded bg-accent-soft px-1 py-0.5 text-[10px] font-semibold text-accent">必需</span>}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="py-3 text-xs text-slate-2">分析样本不足</div>
                  )}
                </div>
              </div>
            ) : (
              <div className="py-6 text-center text-xs text-slate-1">
                暂无岗位样本
                <Link href="/jobs" className="mt-2 block text-accent underline">去发起岗位分析 →</Link>
              </div>
            )}
          </div>

          {sem && (
            <div className="pp-card p-5">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-sm font-bold">{sem.label}</div>
                <Tag tone="teal">{sem.doneRatio}%</Tag>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-paper-2">
                <div className="h-2 rounded-full bg-accent transition-all" style={{ width: `${sem.doneRatio}%` }} />
              </div>
              <div className="mt-2 text-xs text-slate-1">已完成 {sem.doneTasks} / {sem.totalTasks} 项</div>
            </div>
          )}

          <div className="pp-card p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-bold">核心技能缺口</div>
              <Link href="/profile" className="text-xs text-accent">档案 →</Link>
            </div>
            {d?.topGaps.length ? (
              <ul className="space-y-2">
                {d.topGaps.slice(0, 4).map((g) => (
                  <li key={g.skill} className="flex items-center justify-between text-sm">
                    <span className="font-semibold">{g.skill}</span>
                    <span className="text-xs text-slate-1">{EVIDENCE_STATUS_LABELS[g.userStatus]}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="py-4 text-center text-xs text-slate-1">岗位分析后展示</div>
            )}
          </div>
        </div>

        {/* 近期任务 */}
        <div className="pp-card col-span-12 p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-bold">近期任务</div>
            <Link href="/tasks" className="text-xs text-accent">任务中心 →</Link>
          </div>
          {d?.recentTasks.length ? (
            <ul className="grid grid-cols-2 gap-x-8">
              {d.recentTasks.slice(0, 6).map((t: RoadmapTaskDTO) => (
                <li key={t.id} className="flex items-center justify-between border-b border-line/60 py-2.5 text-sm">
                  <span className="min-w-0 truncate pr-3">{t.title}</span>
                  <Tag tone={t.status === 'in_progress' ? 'teal' : t.status === 'deferred' ? 'amber' : 'slate'}>{TASK_STATUS_LABELS[t.status]}</Tag>
                </li>
              ))}
            </ul>
          ) : (
            <div className="py-6 text-center text-xs text-slate-1">生成规划后任务显示在这里</div>
          )}
        </div>
      </div>
    </div>
  );
}
