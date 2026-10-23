'use client';
// 页面 3：成长路线（PRD 5.1）：时间轴 + 学期目标 + 里程碑 + 任务状态
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Loading, Empty, ErrorState, Tag, PageHeader } from '@/components/ui';
import type { RoadmapDTO, RoadmapTaskDTO } from '@pathpilot/shared';
import { TASK_STATUS_LABELS } from '@pathpilot/shared';

export default function RoadmapPage() {
  const [data, setData] = useState<{ roadmap: RoadmapDTO; tasks: RoadmapTaskDTO[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  function load() {
    setLoading(true);
    api<{ roadmap: RoadmapDTO; tasks: RoadmapTaskDTO[] } | null>('/api/roadmaps/current')
      .then((d) => setData(d))
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }
  useEffect(() => {
    load();
  }, []);

  if (loading) return <Loading />;
  if (err) return <ErrorState message={err} onRetry={load} />;
  if (!data)
    return (
      <Empty
        title="还没有成长规划"
        hint="基于岗位分析与你的能力档案，生成分学期的可执行成长路线"
        action={
          <Link href="/planning" className="pp-btn pp-btn-primary mt-2 px-4 py-2 text-xs">
            去生成规划
          </Link>
        }
      />
    );

  const { roadmap, tasks } = data;
  const totalHours = roadmap.content.total_estimated_hours;
  const doneCount = tasks.filter((t) => t.status === 'done').length;

  return (
    <div className="pp-anim">
      <PageHeader
        title="成长路线"
        desc={`${roadmap.content.goal}`}
        right={<div className="text-right text-xs text-slate-1">版本 v{roadmap.version} · {roadmap.engine === 'pi-llm' ? 'AI 模型生成' : '规则引擎生成'}</div>}
      />

      <div className="mb-6 grid grid-cols-4 gap-4">
        {[
          { label: '覆盖学期', value: `${roadmap.content.semesters.length} 个` },
          { label: '任务总数', value: `${tasks.length} 项` },
          { label: '预计投入', value: `${totalHours} h` },
          { label: '已完成', value: `${doneCount} 项` },
        ].map((s) => (
          <div key={s.label} className="pp-card px-5 py-4">
            <div className="text-xs text-slate-1">{s.label}</div>
            <div className="mt-1 text-xl font-bold">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="relative pl-8">
        <div className="absolute bottom-4 left-3 top-2 w-0.5 bg-line" />
        {roadmap.content.semesters.map((sem, idx) => {
          const semTasks = tasks.filter((t) => t.semester === sem.index);
          const done = semTasks.filter((t) => t.status === 'done').length;
          return (
            <div key={sem.index} className="relative mb-6">
              <span
                className={`absolute -left-[26px] top-1.5 flex h-4 w-4 items-center justify-center rounded-full border-2 ${
                  done === semTasks.length && semTasks.length ? 'border-teal bg-teal' : 'border-line bg-white'
                }`}
              />
              <div className="pp-card p-5">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold">{sem.label}</span>
                    <Tag tone="slate">{sem.estimated_hours}h</Tag>
                    {done > 0 && <Tag tone="teal">{done}/{semTasks.length} 完成</Tag>}
                  </div>
                  {idx === 0 && <Tag tone="accent">本学期</Tag>}
                </div>
                <div className="mb-3 text-xs leading-5 text-slate-1">学期目标：{sem.goal}</div>
                <div className="mb-3 rounded-lg bg-paper-2 px-3 py-2 text-xs">
                  <span className="font-semibold text-ink">里程碑：</span>
                  {sem.milestone}
                </div>
                {sem.focus_skills.length > 0 && (
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {sem.focus_skills.map((s) => (
                      <Tag key={s} tone="amber">{s}</Tag>
                    ))}
                  </div>
                )}
                {semTasks.length > 0 && (
                  <ul className="divide-y divide-line/70">
                    {semTasks.map((t) => (
                      <li key={t.id} className="flex items-center justify-between py-2 text-xs">
                        <span className="min-w-0 truncate pr-3 font-semibold">{t.title}</span>
                        <span className="flex shrink-0 items-center gap-2">
                          <span className="text-slate-2">{t.estimatedHours}h</span>
                          <Tag tone={t.status === 'done' ? 'teal' : t.status === 'in_progress' ? 'accent' : t.status === 'deferred' ? 'amber' : 'slate'}>
                            {TASK_STATUS_LABELS[t.status]}
                          </Tag>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {roadmap.content.assumptions.length > 0 && (
        <div className="pp-card p-5 text-xs leading-5 text-slate-1">
          <div className="mb-1 font-bold text-ink">规划依据</div>
          <ul className="list-disc space-y-0.5 pl-4">
            {roadmap.content.assumptions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
          {roadmap.content.risks.length > 0 && (
            <div className="mt-2 text-amber">风险提示：{roadmap.content.risks.join('；')}</div>
          )}
        </div>
      )}
    </div>
  );
}
