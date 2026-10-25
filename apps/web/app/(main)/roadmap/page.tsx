'use client';
// 成长路线:蓝图式时间轴,每学期一个节点站,任务挂在站点下
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Loading, Empty, ErrorState, Tag, PageHeader, Stat } from '@/components/ui';
import { Ic } from '@/components/Icon';
import type { RoadmapDTO, RoadmapTaskDTO } from '@pathpilot/shared';
import { TASK_STATUS_LABELS } from '@pathpilot/shared';

export default function RoadmapPage() {
  const [data, setData] = useState<{ roadmap: RoadmapDTO; tasks: RoadmapTaskDTO[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  function load() {
    setLoading(true);
    api<{ roadmap: RoadmapDTO; tasks: RoadmapTaskDTO[] } | null>('/api/roadmaps/current')
      .then((d) => {
        setData(d);
        setErr('');
      })
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
      <>
        <PageHeader eyebrow="03 · ROADMAP" title="成长路线" />
        <Empty
          icon="roadmap"
          title="还没有成长规划"
          hint="岗位数据 + 你的档案,AI 将生成按学期拆解的路线:每项任务都有时长、产出与验收标准"
          action={
            <Link href="/planning" className="pp-btn pp-btn-primary mt-2 px-5 py-2.5 text-sm">
              <Ic name="roadmap" size={15} /> 生成规划
            </Link>
          }
        />
      </>
    );

  const { roadmap, tasks } = data;
  const totalHours = roadmap.content.total_estimated_hours;
  const doneCount = tasks.filter((t) => t.status === 'done').length;

  return (
    <div>
      <PageHeader
        eyebrow="03 · ROADMAP"
        title="成长路线"
        desc={roadmap.content.goal}
        right={<Tag tone="ink">v{roadmap.version} · {roadmap.content.semesters.length} 学期 · {tasks.length} 任务</Tag>}
      />

      {/* 概览数字带 */}
      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="reveal" style={{ '--d': '60ms' } as never}><Stat label="覆盖学期" value={roadmap.content.semesters.length} unit="个" /></div>
        <div className="reveal" style={{ '--d': '110ms' } as never}><Stat label="任务总数" value={tasks.length} unit="项" /></div>
        <div className="reveal" style={{ '--d': '160ms' } as never}><Stat label="预计投入" value={totalHours} unit="h" tone="accent" /></div>
        <div className="reveal" style={{ '--d': '210ms' } as never}><Stat label="已完成" value={doneCount} unit="项" tone="teal" /></div>
      </div>

      {/* 蓝图时间轴 */}
      <div className="relative pl-9">
        {roadmap.content.semesters.map((sem, idx) => {
          const semTasks = tasks.filter((t) => t.semester === sem.index);
          const done = semTasks.filter((t) => t.status === 'done').length;
          const complete = semTasks.length > 0 && done === semTasks.length;
          return (
            <section key={sem.index} className="reveal relative mb-7" style={{ '--d': `${140 + idx * 70}ms` } as never}>
              <span className={`node ${complete ? 'node-done' : idx === 0 ? 'node-active' : ''}`} />
              {idx < roadmap.content.semesters.length - 1 && <span className="pathline" />}
              <div className="pp-card p-5">
                <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="num text-[11px] font-bold tracking-widest text-slate-2">S{sem.index}</span>
                    <span className="font-display text-[15px] font-bold">{sem.label}</span>
                    <Tag tone="slate">{sem.estimated_hours}h</Tag>
                    {idx === 0 && <Tag tone="accent">本学期</Tag>}
                    {complete && (
                      <span className="flex items-center gap-1 text-xs font-bold text-teal">
                        <Ic name="check" size={12} strokeWidth={2.6} /> 已完成
                      </span>
                    )}
                  </div>
                  {done > 0 && !complete && (
                    <span className="num text-xs text-slate-2">
                      {done}/{semTasks.length}
                    </span>
                  )}
                </div>
                <div className="mb-3 rounded-lg border border-line bg-paper/50 px-3.5 py-2.5 text-xs leading-5">
                  <span className="font-bold text-ink">里程碑 · </span>
                  <span className="text-slate-1">{sem.milestone}</span>
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
                      <li key={t.id} className="flex items-center justify-between gap-3 py-2 text-xs">
                        <span className="min-w-0 truncate font-semibold">{t.title}</span>
                        <span className="flex shrink-0 items-center gap-2.5">
                          <span className="num text-slate-2">{t.estimatedHours}h</span>
                          <Tag tone={t.status === 'done' ? 'teal' : t.status === 'in_progress' ? 'accent' : t.status === 'deferred' ? 'amber' : 'slate'}>
                            {TASK_STATUS_LABELS[t.status]}
                          </Tag>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <div className="reveal mt-2 flex justify-center">
        <Link href="/planning" className="pp-btn pp-btn-ghost px-5 py-2.5 text-sm">
          <Ic name="refresh" size={14} /> 条件变化?重新规划
        </Link>
      </div>
    </div>
  );
}
