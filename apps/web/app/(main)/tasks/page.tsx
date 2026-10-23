'use client';
// 页面 6：任务中心（PRD 5.1）：今日/本周/全部 + 四态看板 + 实际投入 + 成果记录
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Loading, Empty, ErrorState, Tag, PageHeader } from '@/components/ui';
import type { RoadmapTaskDTO, GrowthStats, ProfileDTO } from '@pathpilot/shared';
import { TASK_STATUS_LABELS, PRIORITY_LABELS } from '@pathpilot/shared';
import { currentSemesterOf } from '@pathpilot/shared';

const COLS: { key: RoadmapTaskDTO['status']; tone: 'slate' | 'accent' | 'teal' | 'amber' }[] = [
  { key: 'not_started', tone: 'slate' },
  { key: 'in_progress', tone: 'accent' },
  { key: 'done', tone: 'teal' },
  { key: 'deferred', tone: 'amber' },
];

export default function TasksPage() {
  const [tasks, setTasks] = useState<RoadmapTaskDTO[]>([]);
  const [stats, setStats] = useState<GrowthStats | null>(null);
  const [profile, setProfile] = useState<ProfileDTO | null>(null);
  const [view, setView] = useState<'today' | 'week' | 'all'>('week');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [detail, setDetail] = useState<RoadmapTaskDTO | null>(null);
  const [evidence, setEvidence] = useState({ url: '', note: '', hours: '' });

  async function load() {
    setLoading(true);
    try {
      const [t, s, p] = await Promise.all([api<RoadmapTaskDTO[]>('/api/tasks'), api<GrowthStats>('/api/stats/growth'), api<ProfileDTO | null>('/api/profile')]);
      setTasks(t);
      setStats(s);
      setProfile(p);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function update(task: RoadmapTaskDTO, patch: Record<string, unknown>) {
    // 乐观锁：带上读取时的 updated_at，被其他设备改过则提示刷新（PRD 10.4）
    try {
      const updated = await api<RoadmapTaskDTO>(`/api/tasks/${task.id}`, { method: 'PATCH', json: { ...patch, expectedUpdatedAt: task.updatedAt } });
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      if (detail?.id === updated.id) setDetail(updated);
      api<GrowthStats>('/api/stats/growth').then(setStats).catch(() => {});
    } catch (e) {
      setErr(e instanceof Error ? e.message : '更新失败');
      await load();
    }
  }

  const currentSem = profile ? currentSemesterOf(profile.grade) : null;
  const today = new Date().toISOString().slice(0, 10);
  const visible =
    view === 'all'
      ? tasks
      : view === 'week'
        ? tasks.filter((t) => t.semester === currentSem)
        : tasks.filter((t) => t.status === 'in_progress' || (t.completedAt ?? '').startsWith(today));

  if (loading) return <Loading />;

  return (
    <div className="pp-anim">
      <PageHeader
        title="任务中心"
        desc="任务状态实时同步到手机端 · 冲突时提示刷新，不静默覆盖"
        right={
          <div className="flex rounded-xl bg-paper-2 p-1 text-xs font-semibold">
            {([['today', '今日'], ['week', '本学期'], ['all', '全部']] as const).map(([k, label]) => (
              <button key={k} className={`rounded-lg px-4 py-2 transition ${view === k ? 'bg-white shadow-sm' : 'text-slate-1'}`} onClick={() => setView(k)}>{label}</button>
            ))}
          </div>
        }
      />
      {err && <div className="mb-4"><ErrorState message={err} onRetry={load} /></div>}

      {tasks.length === 0 ? (
        <Empty title="暂无任务" hint="生成成长规划后，任务会按学期安排到这里" />
      ) : (
        <>
          {/* 统计 */}
          <div className="mb-5 grid grid-cols-5 gap-4">
            {[
              { label: '学期完成率', value: `${stats?.semesterCompletionRate ?? 0}%` },
              { label: '已完成任务', value: `${stats?.doneTasks ?? 0}/${stats?.totalTasks ?? 0}` },
              { label: '延后任务', value: `${stats?.deferredTasks ?? 0}` },
              { label: '计划投入', value: `${stats?.plannedHours ?? 0}h` },
              { label: '实际投入', value: `${stats?.actualHours ?? 0}h` },
            ].map((s) => (
              <div key={s.label} className="pp-card px-4 py-3.5">
                <div className="text-[11px] text-slate-1">{s.label}</div>
                <div className="mt-0.5 text-lg font-bold">{s.value}</div>
              </div>
            ))}
          </div>

          {/* 看板 */}
          <div className="grid grid-cols-4 gap-4">
            {COLS.map(({ key, tone }) => {
              const col = visible.filter((t) => t.status === key);
              return (
                <div key={key} className="rounded-card bg-white/60 p-3">
                  <div className="mb-3 flex items-center justify-between px-1">
                    <span className="text-xs font-bold">{TASK_STATUS_LABELS[key]}</span>
                    <Tag tone={tone}>{col.length}</Tag>
                  </div>
                  <div className="space-y-2.5">
                    {col.map((t) => (
                      <div key={t.id} className="pp-card cursor-pointer p-3 transition hover:shadow-md" onClick={() => { setDetail(t); setEvidence({ url: t.evidenceUrl ?? '', note: t.resultNote ?? '', hours: t.actualHours != null ? String(t.actualHours) : '' }); }}>
                        <div className="text-xs font-bold leading-5">{t.title}</div>
                        <div className="mt-2 flex items-center justify-between text-[11px] text-slate-2">
                          <span>{t.estimatedHours}h · P{PRIORITY_LABELS[t.priority]}</span>
                          <span>学期 {t.semester}</span>
                        </div>
                        <div className="mt-2 flex gap-1.5">
                          {key === 'not_started' && (
                            <button className="rounded-md bg-teal-soft px-2 py-1 text-[11px] font-semibold text-teal hover:opacity-80" onClick={(e) => { e.stopPropagation(); update(t, { status: 'in_progress' }); }}>开始</button>
                          )}
                          {key === 'in_progress' && (
                            <button className="rounded-md bg-teal px-2 py-1 text-[11px] font-semibold text-white hover:opacity-80" onClick={(e) => { e.stopPropagation(); update(t, { status: 'done', actualHours: t.estimatedHours }); }}>完成</button>
                          )}
                          {key === 'deferred' && (
                            <button className="rounded-md bg-paper-2 px-2 py-1 text-[11px] font-semibold text-ink hover:opacity-80" onClick={(e) => { e.stopPropagation(); update(t, { status: 'in_progress' }); }}>恢复</button>
                          )}
                        </div>
                      </div>
                    ))}
                    {col.length === 0 && <div className="py-6 text-center text-[11px] text-slate-2">暂无</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* 任务详情弹层 */}
      {detail && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink/30 p-4" onClick={() => setDetail(null)}>
          <div className="pp-card max-h-[85vh] w-full max-w-lg overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 flex items-start justify-between gap-3">
              <div className="text-base font-bold leading-6">{detail.title}</div>
              <button className="text-slate-2 hover:text-ink" onClick={() => setDetail(null)}>✕</button>
            </div>
            <div className="mb-4 flex flex-wrap gap-1.5">
              <Tag tone="slate">学期 {detail.semester}</Tag>
              <Tag tone={detail.status === 'done' ? 'teal' : detail.status === 'in_progress' ? 'accent' : detail.status === 'deferred' ? 'amber' : 'slate'}>{TASK_STATUS_LABELS[detail.status]}</Tag>
              <Tag tone="ink">预计 {detail.estimatedHours}h</Tag>
              {detail.actualHours != null && <Tag tone="teal">实际 {detail.actualHours}h</Tag>}
            </div>
            <p className="mb-4 text-sm leading-6 text-slate-1">{detail.description}</p>
            <div className="mb-4 space-y-2 text-xs leading-5">
              <div className="rounded-lg bg-paper-2 p-3"><span className="font-bold">产出要求：</span>{detail.deliverable}</div>
              <div className="rounded-lg bg-paper-2 p-3"><span className="font-bold">验收标准：</span>{detail.acceptanceCriteria}</div>
              {detail.prerequisites.length > 0 && <div className="rounded-lg bg-paper-2 p-3"><span className="font-bold">前置任务：</span>{detail.prerequisites.join('、')}</div>}
              {detail.relatedSkills.length > 0 && <div className="rounded-lg bg-paper-2 p-3"><span className="font-bold">关联技能：</span>{detail.relatedSkills.join('、')}</div>}
            </div>

            <div className="mb-3 space-y-2 border-t border-line pt-4">
              <label className="pp-label">成果记录（完成任务时填写）</label>
              <input className="pp-input text-xs" placeholder="成果链接（GitHub/部署地址/文档）" value={evidence.url} onChange={(e) => setEvidence({ ...evidence, url: e.target.value })} />
              <div className="flex gap-2">
                <input className="pp-input flex-1 text-xs" placeholder="成果说明（真实结果）" value={evidence.note} onChange={(e) => setEvidence({ ...evidence, note: e.target.value })} />
                <input className="pp-input w-28 text-xs" type="number" min="0" placeholder="实际小时" value={evidence.hours} onChange={(e) => setEvidence({ ...evidence, hours: e.target.value })} />
              </div>
              <button
                className="pp-btn pp-btn-primary px-4 py-2 text-xs"
                onClick={() =>
                  update(detail, {
                    ...(evidence.url ? { evidenceUrl: evidence.url } : {}),
                    ...(evidence.note ? { resultNote: evidence.note } : {}),
                    ...(evidence.hours !== '' ? { actualHours: Number(evidence.hours) } : {}),
                  })
                }
              >
                保存成果
              </button>
            </div>

            <div className="flex flex-wrap gap-2 border-t border-line pt-4">
              {detail.status !== 'in_progress' && detail.status !== 'done' && (
                <button className="pp-btn pp-btn-ghost px-3 py-1.5 text-xs" onClick={() => update(detail, { status: 'in_progress' })}>标记进行中</button>
              )}
              {detail.status !== 'done' && (
                <button className="pp-btn pp-btn-primary px-3 py-1.5 text-xs" onClick={() => update(detail, { status: 'done' })}>标记完成</button>
              )}
              {detail.status !== 'deferred' && detail.status !== 'done' && (
                <button
                  className="pp-btn pp-btn-ghost px-3 py-1.5 text-xs"
                  onClick={() => {
                    const reason = window.prompt('延期原因（必填）：');
                    if (reason) update(detail, { status: 'deferred', deferredReason: reason });
                  }}
                >
                  延期（需原因）
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
