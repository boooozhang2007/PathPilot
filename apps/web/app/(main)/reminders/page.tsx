'use client';
// 学习提醒 & 周期总结（PRD P1）：任务到期提醒 + 每周确定性总结
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Loading, ErrorState, Empty, PageHeader, Tag } from '@/components/ui';
import { Ic } from '@/components/Icon';
import type { ReminderPayloadDTO, ReminderDTO, WeeklySummaryDTO } from '@pathpilot/shared';

export default function RemindersPage() {
  const [payload, setPayload] = useState<ReminderPayloadDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  function load() {
    setLoading(true);
    api<ReminderPayloadDTO>('/api/reminders')
      .then((p) => {
        setPayload(p);
        setErr('');
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function dismiss(r: ReminderDTO) {
    await api(`/api/reminders/${r.id}/dismiss`, { method: 'POST' }).catch(() => {});
    setPayload((prev) => (prev ? { ...prev, reminders: prev.reminders.filter((x) => x.id !== r.id) } : prev));
  }

  if (loading) return <Loading />;
  if (err) return <ErrorState message={err} onRetry={load} />;

  const summary = payload?.weeklySummary ?? null;
  const reminders = payload?.reminders ?? [];

  return (
    <div>
      <PageHeader
        eyebrow="10 · REMINDERS"
        title="学习提醒"
        desc="任务到期自动提醒 + 每周成长总结,帮你按节奏推进"
        right={<Link href="/tasks" className="pp-btn pp-btn-ghost px-4 py-2 text-xs"><Ic name="checkCircle" size={13} /> 任务中心</Link>}
      />

      {summary && <WeeklySummaryCard s={summary} />}

      <div className="pp-card reveal mt-6 p-5" style={{ '--d': '80ms' } as never}>
        <div className="mb-4 flex items-center gap-2 text-sm font-bold">
          <span className="inline-block h-3.5 w-1 rounded-full bg-accent" />
          到期提醒（{reminders.length}）
        </div>
        {reminders.length === 0 ? (
          <Empty icon="bell" title="暂无提醒" hint="未来 7 天内到期的任务会出现在这里" />
        ) : (
          <ul className="divide-y divide-line/70">
            {reminders.map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-amber-soft text-amber">
                  <Ic name="bell" size={15} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{r.title}</div>
                  <div className="mt-0.5 truncate text-xs text-slate-2">{r.message}</div>
                </div>
                {r.taskId && (
                  <Link href="/tasks" className="hidden shrink-0 text-xs font-semibold text-accent sm:block">
                    去处理
                  </Link>
                )}
                <button className="shrink-0 rounded-md border border-line px-2.5 py-1.5 text-xs text-slate-1 transition hover:border-accent hover:text-accent" onClick={() => dismiss(r)}>
                  已读
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function WeeklySummaryCard({ s }: { s: WeeklySummaryDTO }) {
  return (
    <section className="pp-card reveal p-5" style={{ '--d': '40ms' } as never}>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-bold">
          <Ic name="calendar" size={14} className="text-teal" />
          本周总结 <span className="num text-xs font-semibold text-slate-2">{s.period.label}</span>
        </div>
        <Tag tone="teal">{s.semesterCompletionRate}% 学期完成率</Tag>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <MiniStat label="本周完成" value={`${s.tasksCompletedThisWeek}`} unit="项" />
        <MiniStat label="计划投入" value={`${s.hoursPlannedThisWeek}`} unit="h" />
        <MiniStat label="实际投入" value={`${s.hoursActualThisWeek}`} unit="h" />
        <MiniStat label="累计完成" value={`${s.totalDoneTasks}`} unit="项" />
      </div>

      <ul className="space-y-1.5">
        {s.highlights.map((h, i) => (
          <li key={i} className="flex items-start gap-2 text-xs leading-5 text-slate-1">
            <Ic name="check" size={12} className="mt-0.5 shrink-0 text-teal" strokeWidth={2.6} />
            {h}
          </li>
        ))}
      </ul>

      {s.upcomingCriticalTasks.length > 0 && (
        <div className="mt-4 border-t border-line/70 pt-3">
          <div className="num mb-2 text-[10px] tracking-widest text-slate-2">高优先级待办</div>
          <div className="flex flex-wrap gap-1.5">
            {s.upcomingCriticalTasks.map((t) => (
              <span key={t.id} className="rounded-[4px] border border-accent/30 bg-accent-soft px-2 py-0.5 text-[11px] text-accent-deep">
                {t.title}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function MiniStat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="rounded-lg border border-line bg-paper/50 px-3 py-2.5">
      <div className="text-[11px] text-slate-2">{label}</div>
      <div className="num mt-0.5 text-lg font-bold text-ink">
        {value}
        {unit && <span className="ml-0.5 text-xs font-semibold text-slate-2">{unit}</span>}
      </div>
    </div>
  );
}
