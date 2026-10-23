'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Loading, Empty, ErrorState, Tag, Ring, PageHeader } from '@/components/ui';
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
  if (err) return <ErrorState message={err} onRetry={load} />;
  if (!data) return null;

  return (
    <div className="pp-anim">
      <PageHeader
        title={`${data.profile?.nickname ?? '同学'}，下午好 👋`}
        desc={data.profile ? `${GRADE_LABELS[data.profile.grade]} · 目标 ${data.profile.targetRole || '未设定'} · 每周 ${data.profile.weeklyHours}h` : '先完善个人资料，开始你的成长规划'}
        right={
          <div className="flex gap-2">
            <Link href="/jobs" className="pp-btn pp-btn-ghost px-3 py-2 text-xs">分析岗位</Link>
            <Link href="/planning" className="pp-btn pp-btn-primary px-3 py-2 text-xs">{data.activeRoadmapVersion ? '调整规划' : '生成规划'}</Link>
          </div>
        }
      />

      <div className="grid grid-cols-12 gap-5">
        {/* 匹配度 */}
        <div className="pp-card col-span-3 p-6 text-center">
          <div className="mb-1 text-xs font-semibold text-slate-1">岗位能力匹配度</div>
          {data.matchScore !== null ? (
            <>
              <Ring value={data.matchScore} label={`${data.matchSampleCount} 条真实样本`} />
              <p className="mt-2 text-[11px] leading-4 text-slate-2">辅助指标 · 非就业概率</p>
            </>
          ) : (
            <div className="py-8 text-xs text-slate-1">
              暂无岗位样本
              <Link href="/jobs" className="mt-2 block text-accent underline">去发起岗位分析 →</Link>
            </div>
          )}
        </div>

        {/* 核心缺口 */}
        <div className="pp-card col-span-5 p-6">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-bold">核心技能缺口</div>
            <Link href="/profile" className="text-xs text-accent">能力档案 →</Link>
          </div>
          {data.topGaps.length ? (
            <ul className="space-y-2.5">
              {data.topGaps.map((g) => (
                <li key={g.skill} className="flex items-center justify-between text-sm">
                  <span className="font-semibold">{g.skill}</span>
                  <span className="flex items-center gap-2">
                    {g.importance === 'high' && <Tag tone="accent">必备</Tag>}
                    <span className="text-xs text-slate-1">{EVIDENCE_STATUS_LABELS[g.userStatus]}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="py-8 text-center text-xs text-slate-1">暂无缺口数据（先做岗位分析或补充技能档案）</div>
          )}
        </div>

        {/* 本学期进度 */}
        <div className="pp-card col-span-4 p-6">
          <div className="mb-3 text-sm font-bold">本学期进度</div>
          {data.currentSemester ? (
            <div>
              <div className="mb-2 text-xs text-slate-1">{data.currentSemester.label}</div>
              <Ring value={data.currentSemester.doneRatio} size={110} />
              <div className="mt-2 text-center text-xs text-slate-1">
                已完成 {data.currentSemester.doneTasks} / {data.currentSemester.totalTasks} 项任务
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-slate-1">生成规划后展示</div>
          )}
        </div>

        {/* 近期任务 */}
        <div className="pp-card col-span-7 p-6">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-bold">近期任务</div>
            <Link href="/tasks" className="text-xs text-accent">任务中心 →</Link>
          </div>
          {data.recentTasks.length ? (
            <ul className="divide-y divide-line">
              {data.recentTasks.slice(0, 5).map((t: RoadmapTaskDTO) => (
                <li key={t.id} className="flex items-center justify-between py-2.5 text-sm">
                  <span className="min-w-0 truncate pr-3">{t.title}</span>
                  <Tag tone={t.status === 'in_progress' ? 'teal' : t.status === 'deferred' ? 'amber' : 'slate'}>{TASK_STATUS_LABELS[t.status]}</Tag>
                </li>
              ))}
            </ul>
          ) : (
            <Empty title="暂无进行中的任务" hint="生成成长规划后，任务会显示在这里" />
          )}
        </div>

        {/* 最近一次规划调整 */}
        <div className="pp-card col-span-5 p-6">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-bold">最近一次规划调整</div>
            <Link href="/planning" className="text-xs text-accent">动态规划 →</Link>
          </div>
          {data.lastReplan ? (
            <div className="space-y-2 text-xs leading-5 text-slate-1">
              <div>
                当前版本 <span className="font-mono font-bold text-ink">v{data.lastReplan.version}</span> · {new Date(data.lastReplan.createdAt).toLocaleString('zh-CN')}
              </div>
              <div className="rounded-lg bg-paper-2 p-3">
                <div className="mb-1 font-semibold text-ink">变化摘要</div>
                预计投入 {data.lastReplan.diff.hours_change.from}h → {data.lastReplan.diff.hours_change.to}h；新增 {data.lastReplan.diff.added_tasks.length} 项、移除 {data.lastReplan.diff.removed_tasks.length} 项、延后 {data.lastReplan.diff.deferred_tasks.length} 项
                {data.lastReplan.diff.reasons.length > 0 && <div className="mt-1 text-slate-1">原因：{data.lastReplan.diff.reasons[0]}</div>}
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-slate-1">{data.activeRoadmapVersion ? '首次规划，尚无调整记录' : '还没有成长规划'}</div>
          )}
        </div>
      </div>
    </div>
  );
}
