'use client';
// 规划分享公开页（PRD P2）：只读查看他人分享的成长路线
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { Loading, ErrorState, Tag } from '@/components/ui';
import { Ic, Logo } from '@/components/Icon';
import type { SharedRoadmapDTO } from '@pathpilot/shared';
import { CAREER_PATH_LABELS, TASK_STATUS_LABELS } from '@pathpilot/shared';

export default function SharedRoadmapPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<SharedRoadmapDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    api<SharedRoadmapDTO>(`/api/share/${token}`)
      .then((d) => {
        setData(d);
        setErr('');
      })
      .catch((e) => setErr(e instanceof Error ? e.message : '链接无效'))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return <div className="min-h-screen"><Loading /></div>;
  if (err || !data) return <div className="min-h-screen"><ErrorState message={err || '链接无效'} /></div>;

  const totalHours = data.content.total_estimated_hours;

  return (
    <div className="min-h-screen bg-paper">
      <header className="leather sticky top-0 z-30 flex items-center justify-between px-6 py-4 text-[#f3ead5]">
        <div className="flex items-center gap-3">
          <Logo size={30} />
          <div>
            <div className="font-display text-sm font-bold tracking-tight">PathPilot</div>
            <div className="num text-[9px] tracking-[0.18em] text-white/45">共享成长路线 · 只读</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Tag tone="slate">v{data.version}</Tag>
          <Tag tone="accent">{CAREER_PATH_LABELS[data.careerPath]}</Tag>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8">
        <div className="mb-6">
          <div className="eyebrow mb-2">SHARED ROADMAP</div>
          <h1 className="font-display text-[26px] font-bold leading-tight">{data.targetRole}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-1">{data.content.goal}</p>
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-2">
            <span className="flex items-center gap-1.5"><Ic name="clock" size={13} /> 每周 {data.weeklyHours} 小时</span>
            <span className="flex items-center gap-1.5"><Ic name="layers" size={13} /> {data.content.semesters.length} 学期</span>
            <span className="flex items-center gap-1.5"><Ic name="checkCircle" size={13} /> 预计 {totalHours}h / {data.tasks.length} 项任务</span>
          </div>
        </div>

        {/* 学期节点 */}
        <div className="space-y-4">
          {data.content.semesters.map((sem, idx) => {
            const semTasks = data.tasks.filter((t) => t.semester === sem.index);
            return (
              <section key={sem.index} className="pp-card p-5">
                <div className="mb-2.5 flex items-center gap-2.5">
                  <span className="num text-[11px] font-bold tracking-widest text-slate-2">S{sem.index}</span>
                  <span className="font-display text-[15px] font-bold">{sem.label}</span>
                  <Tag tone="slate">{sem.estimated_hours}h</Tag>
                  {idx === 0 && <Tag tone="accent">本学期</Tag>}
                </div>
                {sem.milestone && (
                  <div className="mb-3 rounded-lg border border-line bg-paper/50 px-3.5 py-2.5 text-xs leading-5">
                    <span className="font-bold text-ink">里程碑 · </span>
                    <span className="text-slate-1">{sem.milestone}</span>
                  </div>
                )}
                {sem.focus_skills.length > 0 && (
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {sem.focus_skills.map((s) => (
                      <Tag key={s} tone="amber">{s}</Tag>
                    ))}
                  </div>
                )}
                {semTasks.length > 0 && (
                  <ul className="divide-y divide-line/70">
                    {semTasks.map((t, i) => (
                      <li key={i} className="flex items-center justify-between gap-3 py-2 text-xs">
                        <div className="min-w-0">
                          <div className="truncate font-semibold">{t.title}</div>
                          {t.deliverable && <div className="mt-0.5 truncate text-slate-2">产出：{t.deliverable}</div>}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="num text-slate-2">{t.estimatedHours}h</span>
                          <Tag tone={t.status === 'done' ? 'teal' : t.status === 'in_progress' ? 'accent' : t.status === 'deferred' ? 'amber' : 'slate'}>
                            {TASK_STATUS_LABELS[t.status]}
                          </Tag>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>

        <footer className="mt-8 border-t border-line pt-4 text-center text-[11px] text-slate-2">
          由 PathPilot AI 生成 · 仅供查看
          {data.expiresAt && <> · 链接于 {new Date(data.expiresAt).toLocaleDateString()} 过期</>}
        </footer>
      </main>
    </div>
  );
}
