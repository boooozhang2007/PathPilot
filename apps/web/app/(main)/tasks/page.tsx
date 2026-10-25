'use client';
// 任务中心:四态看板 + 今日焦点统计 + 详情弹层(成果/说明编辑/删除) + 批量管理
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Loading, Empty, ErrorState, Tag, PageHeader } from '@/components/ui';
import { Ic } from '@/components/Icon';
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
  const [manage, setManage] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [descDraft, setDescDraft] = useState<string | null>(null);

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

  async function removeTask(task: RoadmapTaskDTO) {
    if (!window.confirm(`删除任务「${task.title}」?该操作不可恢复。`)) return;
    try {
      await api(`/api/tasks/${task.id}`, { method: 'DELETE' });
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
      setDetail(null);
      setSelected((prev) => {
        const n = new Set(prev);
        n.delete(task.id);
        return n;
      });
      api<GrowthStats>('/api/stats/growth').then(setStats).catch(() => {});
    } catch (e) {
      setErr(e instanceof Error ? e.message : '删除失败');
    }
  }

  async function removeSelected() {
    const ids = [...selected];
    if (!ids.length || !window.confirm(`删除所选 ${ids.length} 个任务?该操作不可恢复。`)) return;
    try {
      await api('/api/tasks/batch-delete', { method: 'POST', json: { ids } });
      setSelected(new Set());
      setManage(false);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '批量删除失败');
    }
  }

  async function saveDescription() {
    if (!detail || descDraft === null || !descDraft.trim()) return;
    await update(detail, { description: descDraft.trim() });
    setDescDraft(null);
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
    <div>
      <PageHeader
        eyebrow="04 · TASKS"
        title="任务中心"
        desc="按状态推进,完成的每一步都会沉淀为能力证据"
        right={
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg bg-paper-2 p-1 text-xs font-semibold">
              {([['today', '今日'], ['week', '本学期'], ['all', '全部']] as const).map(([k, label]) => (
                <button key={k} className={`rounded-lg px-4 py-2 transition ${view === k ? 'bg-white font-bold text-accent-deep shadow-sm' : 'text-slate-1'}`} onClick={() => setView(k)}>
                  {label}
                </button>
              ))}
            </div>
            {tasks.length > 0 && (
              <button
                className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${manage ? 'border-accent bg-accent-soft text-accent-deep' : 'border-line-2 text-slate-1 hover:border-ink'}`}
                onClick={() => {
                  setManage((v) => !v);
                  setSelected(new Set());
                }}
              >
                {manage ? '退出管理' : '批量管理'}
              </button>
            )}
          </div>
        }
      />

      {err && (
        <div className="mb-5">
          <ErrorState message={err} onRetry={load} />
        </div>
      )}

      {tasks.length === 0 ? (
        <Empty icon="checkCircle" title="暂无任务" hint="生成成长规划后,任务会按学期安排到这里" />
      ) : (
        <>
          {/* 数字带 */}
          <div className="reveal mb-5 grid grid-cols-2 gap-4 md:grid-cols-5">
            {[
              { label: '学期完成率', value: `${stats?.semesterCompletionRate ?? 0}%`, tone: 'text-teal' },
              { label: '已完成', value: `${stats?.doneTasks ?? 0}/${stats?.totalTasks ?? 0}`, tone: 'text-ink' },
              { label: '延后', value: `${stats?.deferredTasks ?? 0}`, tone: 'text-amber' },
              { label: '计划投入', value: `${stats?.plannedHours ?? 0}h`, tone: 'text-ink' },
              { label: '实际投入', value: `${stats?.actualHours ?? 0}h`, tone: 'text-accent' },
            ].map((s) => (
              <div key={s.label} className="pp-card px-4 py-3">
                <div className="text-[11px] font-semibold text-slate-1">{s.label}</div>
                <div className={`num mt-0.5 text-lg font-bold ${s.tone}`}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* 批量操作条 */}
          {manage && (
            <div className="reveal mb-4 flex flex-wrap items-center gap-3 rounded-card border border-accent/30 bg-accent-soft px-4 py-2.5 text-xs">
              <span className="font-semibold text-accent-deep">
                已选 <span className="num font-bold">{selected.size}</span> 个
              </span>
              <button className="rounded-lg bg-white px-3 py-1.5 font-semibold text-ink ring-1 ring-line-2 transition hover:ring-ink" onClick={() => setSelected(new Set(visible.map((t) => t.id)))}>
                全选
              </button>
              <button className="pp-btn pp-btn-danger px-3 py-1.5" disabled={!selected.size} onClick={removeSelected}>
                <Ic name="trashSweep" size={13} /> 删除所选
              </button>
            </div>
          )}

          {/* 四态看板 */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {COLS.map(({ key, tone }, ci) => {
              const col = visible.filter((t) => t.status === key);
              return (
                <div key={key} className="reveal rounded-lg border border-line bg-paper/40 p-2.5" style={{ '--d': `${ci * 70}ms` } as never}>
                  <div className="mb-2.5 flex items-center justify-between px-1.5 pt-1">
                    <span className="flex items-center gap-2 text-xs font-bold text-ink">
                      <span className={`h-2 w-2 rounded-full ${key === 'done' ? 'bg-teal' : key === 'in_progress' ? 'bg-accent' : key === 'deferred' ? 'bg-amber' : 'bg-slate-2'}`} />
                      {TASK_STATUS_LABELS[key]}
                    </span>
                    <Tag tone={tone}>{col.length}</Tag>
                  </div>
                  <div className="space-y-2.5">
                    {col.map((t) => {
                      const picked = manage && selected.has(t.id);
                      return (
                        <div
                          key={t.id}
                          className={`pp-card cursor-pointer p-3 transition hover:-translate-y-0.5 hover:shadow-md ${picked ? 'ring-2 ring-accent' : ''}`}
                          onClick={() => {
                            if (manage) {
                              setSelected((prev) => {
                                const n = new Set(prev);
                                if (n.has(t.id)) n.delete(t.id);
                                else n.add(t.id);
                                return n;
                              });
                            } else {
                              setDetail(t);
                              setDescDraft(null);
                              setEvidence({ url: t.evidenceUrl ?? '', note: t.resultNote ?? '', hours: t.actualHours != null ? String(t.actualHours) : '' });
                            }
                          }}
                        >
                          {manage && (
                            <div className="mb-1.5 flex items-center gap-2">
                              <span className={`flex h-4 w-4 items-center justify-center rounded border ${picked ? 'border-accent bg-accent text-white' : 'border-slate-2'}`}>
                                {picked && <Ic name="check" size={10} strokeWidth={3.5} />}
                              </span>
                              <span className="text-[10px] text-slate-2">{picked ? '已选' : '选择'}</span>
                            </div>
                          )}
                          <div className="text-xs font-bold leading-5">{t.title}</div>
                          <div className="num mt-2 flex items-center justify-between text-[11px] text-slate-2">
                            <span>
                              {t.estimatedHours}h · {PRIORITY_LABELS[t.priority]}
                            </span>
                            <span>S{t.semester}</span>
                          </div>
                          <div className="mt-2 flex gap-1.5">
                            {key === 'not_started' && (
                              <button className="rounded-md bg-paper-2 px-2 py-1 text-[11px] font-semibold text-ink transition hover:bg-accent-soft hover:text-accent-deep" onClick={(e) => { e.stopPropagation(); update(t, { status: 'in_progress' }); }}>
                                开始
                              </button>
                            )}
                            {key === 'in_progress' && (
                              <button className="rounded-md bg-teal px-2 py-1 text-[11px] font-semibold text-white transition hover:opacity-85" onClick={(e) => { e.stopPropagation(); update(t, { status: 'done', actualHours: t.estimatedHours }); }}>
                                完成
                              </button>
                            )}
                            {key === 'deferred' && (
                              <button className="rounded-md bg-paper-2 px-2 py-1 text-[11px] font-semibold text-ink transition hover:bg-accent-soft hover:text-accent-deep" onClick={(e) => { e.stopPropagation(); update(t, { status: 'in_progress' }); }}>
                                恢复
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
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
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/45 p-4 backdrop-blur-sm" onClick={() => setDetail(null)}>
          <div className="pp-card pp-anim max-h-[85vh] w-full max-w-lg overflow-y-auto p-0" onClick={(e) => e.stopPropagation()}>
            <div className="ink-panel noise flex items-start justify-between gap-3 rounded-t-[5px] px-6 py-5 text-white">
              <div className="min-w-0">
                <div className="num mb-1 text-[10px] tracking-[0.2em] text-white/50">TASK S{detail.semester}</div>
                <div className="font-display text-lg font-bold leading-snug">{detail.title}</div>
              </div>
              <button className="rounded-lg p-1.5 text-white/60 transition hover:bg-white/10 hover:text-white" onClick={() => setDetail(null)}>
                <Ic name="close" size={16} />
              </button>
            </div>
            <div className="p-6">
              <div className="mb-4 flex flex-wrap gap-1.5">
                <Tag tone={detail.status === 'done' ? 'teal' : detail.status === 'in_progress' ? 'accent' : detail.status === 'deferred' ? 'amber' : 'slate'}>{TASK_STATUS_LABELS[detail.status]}</Tag>
                <Tag tone="slate">预计 {detail.estimatedHours}h</Tag>
                {detail.actualHours != null && <Tag tone="teal">实际 {detail.actualHours}h</Tag>}
                <Tag tone="ink">{PRIORITY_LABELS[detail.priority]}优先</Tag>
              </div>

              {/* 任务说明(可编辑) */}
              {descDraft === null ? (
                <button className="group mb-4 block w-full rounded-lg bg-paper/60 p-4 text-left transition hover:bg-paper-2/70" onClick={() => setDescDraft(detail.description)}>
                  <div className="text-xs leading-6 text-ink">{detail.description}</div>
                  <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-slate-2 transition group-hover:text-accent">
                    <Ic name="pen" size={11} /> 编辑说明
                  </span>
                </button>
              ) : (
                <div className="mb-4 space-y-2">
                  <textarea className="pp-input text-xs" rows={4} value={descDraft} onChange={(e) => setDescDraft(e.target.value)} placeholder="任务详细说明:做法步骤、学习资源、参考例子" />
                  <div className="flex gap-2">
                    <button className="pp-btn pp-btn-primary px-3 py-1.5 text-xs" onClick={saveDescription}>
                      保存说明
                    </button>
                    <button className="pp-btn pp-btn-ghost px-3 py-1.5 text-xs" onClick={() => setDescDraft(null)}>
                      取消
                    </button>
                  </div>
                </div>
              )}

              <div className="mb-4 space-y-2 text-xs leading-5">
                <div className="rounded-lg bg-paper-2/60 p-3">
                  <span className="font-bold">产出要求 · </span>
                  {detail.deliverable}
                </div>
                <div className="rounded-lg bg-paper-2/60 p-3">
                  <span className="font-bold">验收标准 · </span>
                  {detail.acceptanceCriteria}
                </div>
                {detail.prerequisites.length > 0 && (
                  <div className="rounded-lg bg-paper-2/60 p-3">
                    <span className="font-bold">前置任务 · </span>
                    {detail.prerequisites.join('、')}
                  </div>
                )}
                {detail.relatedSkills.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 p-1">
                    <span className="text-[11px] font-bold text-slate-1">关联技能</span>
                    {detail.relatedSkills.map((s) => (
                      <Tag key={s} tone="amber">
                        {s}
                      </Tag>
                    ))}
                  </div>
                )}
              </div>

              <div className="mb-3 space-y-2 border-t border-line pt-4">
                <label className="pp-label">记录学习成果</label>
                <input className="pp-input text-xs" placeholder="成果链接(GitHub / 部署地址 / 文档)" value={evidence.url} onChange={(e) => setEvidence({ ...evidence, url: e.target.value })} />
                <div className="flex gap-2">
                  <input className="pp-input flex-1 text-xs" placeholder="成果说明" value={evidence.note} onChange={(e) => setEvidence({ ...evidence, note: e.target.value })} />
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
                  <button className="pp-btn pp-btn-ghost px-3 py-1.5 text-xs" onClick={() => update(detail, { status: 'in_progress' })}>
                    标记进行中
                  </button>
                )}
                {detail.status !== 'done' && (
                  <button className="pp-btn pp-btn-primary px-3 py-1.5 text-xs" onClick={() => update(detail, { status: 'done' })}>
                    标记完成
                  </button>
                )}
                {detail.status !== 'deferred' && detail.status !== 'done' && (
                  <button
                    className="pp-btn pp-btn-ghost px-3 py-1.5 text-xs"
                    onClick={() => {
                      const reason = window.prompt('延期原因:');
                      if (reason) update(detail, { status: 'deferred', deferredReason: reason });
                    }}
                  >
                    延期
                  </button>
                )}
                <button className="pp-btn pp-btn-danger px-3 py-1.5 text-xs" onClick={() => removeTask(detail)}>
                  <Ic name="trash" size={13} /> 删除任务
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
