'use client';
// 动态规划:条件控制台(每周时间/岗位/路径) → 生成或重规划 → 版本对比与历史
import { useEffect, useState } from 'react';
import { api, pollRun } from '@/lib/api';
import { Empty, ErrorState, Tag, PageHeader } from '@/components/ui';
import { VersionCompare } from '@/components/charts';
import { Ic } from '@/components/Icon';
import type { ProfileDTO, RoadmapVersionSummary, RoadmapDiff, RoadmapDTO } from '@pathpilot/shared';
import { CAREER_PATHS, CAREER_PATH_LABELS } from '@pathpilot/shared';

export default function PlanningPage() {
  const [profile, setProfile] = useState<ProfileDTO | null>(null);
  const [versions, setVersions] = useState<RoadmapVersionSummary[]>([]);
  const [current, setCurrent] = useState<RoadmapDTO | null>(null);
  const [diff, setDiff] = useState<RoadmapDiff | null>(null);
  const [counts, setCounts] = useState<{ oldCount: number; newCount: number } | null>(null);
  const [weekly, setWeekly] = useState(8);
  const [role, setRole] = useState('');
  const [path, setPath] = useState<'employment' | 'graduate_school' | 'undecided'>('employment');
  const [busy, setBusy] = useState('');
  const [progress, setProgress] = useState(0);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  async function load() {
    try {
      const p = await api<ProfileDTO | null>('/api/profile');
      setProfile(p);
      if (p) {
        setWeekly(p.weeklyHours);
        setRole(p.targetRole);
        setPath(p.careerPath);
      }
      setVersions(await api<RoadmapVersionSummary[]>('/api/roadmaps'));
      const cur = await api<{ roadmap: RoadmapDTO; tasks: unknown[] } | null>('/api/roadmaps/current');
      setCurrent(cur?.roadmap ?? null);
      if (cur?.roadmap) {
        const d = await api<RoadmapDiff>(`/api/roadmaps/${cur.roadmap.id}/diff`).catch(() => null);
        setDiff(d);
        if (d && cur.roadmap.parentVersionId) {
          const parent = await api<{ tasks: unknown[] }>(`/api/roadmaps/${cur.roadmap.parentVersionId}`).catch(() => null);
          setCounts({ oldCount: parent?.tasks.length ?? 0, newCount: cur.tasks.length });
        } else setCounts(null);
      } else {
        setDiff(null);
        setCounts(null);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : '加载失败');
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function saveConditions() {
    setErr('');
    setMsg('');
    try {
      await api('/api/profile', {
        method: 'PUT',
        json: { ...profile, nickname: profile!.nickname, grade: profile!.grade, graduationDate: profile!.graduationDate, targetRole: role, careerPath: path, weeklyHours: weekly },
      });
      setMsg('条件已保存');
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '保存失败');
    }
  }

  /** 生成进度条动画(轮询期间推进,营造节奏) */
  function tickProgress() {
    setProgress((v) => Math.min(v + 12, 92));
  }

  async function replan() {
    setErr('');
    setMsg('');
    setProgress(8);
    setBusy('AI 正在基于最新条件重新规划…');
    try {
      if (!profile) throw new Error('请先保存个人资料');
      await api('/api/profile', { method: 'PUT', json: { ...profile, nickname: profile.nickname, grade: profile.grade, graduationDate: profile.graduationDate, targetRole: role, careerPath: path, weeklyHours: weekly } });
      const run = await api<{ run_id: number }>(`/api/roadmaps/${current!.id}/revise`, { method: 'POST', json: { weeklyHours: weekly, targetRole: role, careerPath: path } });
      setBusy('规划生成中…');
      await pollRun(run.run_id, tickProgress, 300000);
      setProgress(100);
      setMsg('新版本已生成');
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '重规划失败');
    } finally {
      setBusy('');
      setTimeout(() => setProgress(0), 600);
    }
  }

  async function firstPlan() {
    setErr('');
    setProgress(8);
    setBusy('AI 正在生成你的第一版成长规划…');
    try {
      await api('/api/profile', { method: 'PUT', json: { ...profile, nickname: profile!.nickname, grade: profile!.grade, graduationDate: profile!.graduationDate, targetRole: role, careerPath: path, weeklyHours: weekly } });
      const run = await api<{ run_id: number }>('/api/roadmaps', { method: 'POST', json: {} });
      await pollRun(run.run_id, tickProgress, 300000);
      setProgress(100);
      setMsg('规划已生成');
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '生成失败');
    } finally {
      setBusy('');
      setTimeout(() => setProgress(0), 600);
    }
  }

  return (
    <div>
      <PageHeader eyebrow="09 · REPLAN" title="动态规划" desc="调整条件,AI 重新拆解路线;每个版本都可回看对比" />

      {err && (
        <div className="mb-5">
          <ErrorState message={err} />
        </div>
      )}
      {msg && <div className="mb-5 flex items-center gap-2 rounded-card bg-teal-soft px-4 py-3 text-sm text-teal"><Ic name="checkCircle" size={15} />{msg}</div>}
      {busy && (
        <div className="mb-5 overflow-hidden rounded-card border border-accent/30 bg-accent-soft">
          <div className="flex items-center gap-3 px-4 py-3 text-sm text-accent-deep">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
            {busy}
          </div>
          <div className="h-1 bg-accent/15">
            <div className="h-full bg-accent transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      <div className="grid grid-cols-12 gap-5">
        {/* 条件控制台 */}
        <div className="pp-card reveal col-span-12 p-6 lg:col-span-5">
          <div className="mb-1 flex items-center gap-2 text-sm font-bold">
            <Ic name="settings" size={15} className="text-accent" /> 当前规划条件
          </div>
          <div className="mb-5 mt-4">
            <label className="pp-label">
              每周可投入时间:<span className="num ml-1 text-base font-bold text-accent">{weekly} 小时</span>
            </label>
            <input type="range" min={2} max={30} value={weekly} onChange={(e) => setWeekly(Number(e.target.value))} className="w-full accent-accent" />
            <div className="num flex justify-between text-[10px] text-slate-2">
              <span>2h</span>
              <span>30h</span>
            </div>
          </div>
          <div className="mb-4">
            <label className="pp-label">目标岗位</label>
            <input className="pp-input" value={role} onChange={(e) => setRole(e.target.value)} placeholder="Java 后端开发 / 前端开发 / AI 应用开发" />
          </div>
          <div className="mb-5">
            <label className="pp-label">发展路径</label>
            <div className="flex rounded-xl bg-paper-2 p-1 text-xs font-semibold">
              {CAREER_PATHS.map((p) => (
                <button key={p} className={`flex-1 rounded-lg py-2 transition ${path === p ? 'bg-white font-bold text-accent-deep shadow-sm' : 'text-slate-1'}`} onClick={() => setPath(p)}>
                  {CAREER_PATH_LABELS[p]}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button className="pp-btn pp-btn-ghost flex-1 py-2.5 text-xs" onClick={saveConditions} disabled={!!busy || !profile}>
              保存条件
            </button>
            {current ? (
              <button className="pp-btn pp-btn-primary flex-1 py-2.5 text-xs" onClick={replan} disabled={!!busy}>
                <Ic name="refresh" size={14} /> 重新规划
              </button>
            ) : (
              <button className="pp-btn pp-btn-primary flex-1 py-2.5 text-xs" onClick={firstPlan} disabled={!!busy || !profile}>
                <Ic name="roadmap" size={14} /> 生成规划
              </button>
            )}
          </div>
          {!profile && <p className="mt-3 text-[11px] text-accent">先在「能力档案」完善年级与毕业时间</p>}
        </div>

        {/* 右列:对比 + 历史 */}
        <div className="col-span-12 space-y-5 lg:col-span-7">
          {diff ? (
            <div className="pp-card reveal p-6" style={{ '--d': '80ms' } as never}>
              <div className="mb-3 flex items-center gap-2 text-sm font-bold">
                <span className="inline-block h-3.5 w-1 rounded-full bg-accent" />
                调整前后对比 · 当前 v{current?.version}
              </div>
              <VersionCompare oldHours={diff.hours_change.from} newHours={diff.hours_change.to} oldCount={counts?.oldCount ?? 0} newCount={counts?.newCount ?? 0} />
              <div className="mt-4 grid grid-cols-3 gap-3 text-xs">
                <div className="rounded-lg bg-accent-soft p-3">
                  <div className="num font-bold text-accent-deep">+{diff.added_tasks.length} 新增</div>
                  {diff.added_tasks.slice(0, 3).map((t) => (
                    <div key={t} className="truncate text-slate-1">
                      {t}
                    </div>
                  ))}
                </div>
                <div className="rounded-lg bg-paper-2 p-3">
                  <div className="num font-bold text-slate-1">{diff.removed_tasks.length} 移除</div>
                  {diff.removed_tasks.slice(0, 3).map((t) => (
                    <div key={t} className="truncate text-slate-1">
                      {t}
                    </div>
                  ))}
                </div>
                <div className="rounded-lg bg-amber-soft p-3">
                  <div className="num font-bold text-amber">{diff.deferred_tasks.length} 延后</div>
                  {diff.deferred_tasks.slice(0, 3).map((t) => (
                    <div key={t} className="truncate text-slate-1">
                      {t}
                    </div>
                  ))}
                </div>
              </div>
              {diff.reasons.length > 0 && (
                <div className="mt-3 rounded-lg bg-paper-2/70 p-3 text-xs leading-5">
                  <span className="font-bold">调整原因:</span>
                  {diff.reasons.join(';')}
                </div>
              )}
            </div>
          ) : (
            current && (
              <div className="pp-card reveal flex items-center justify-center p-10 text-sm text-slate-1" style={{ '--d': '80ms' } as never}>
                首次规划(v{current.version}),重规划后将在此展示前后对比
              </div>
            )
          )}

          <div className="pp-card reveal p-6" style={{ '--d': '140ms' } as never}>
            <div className="mb-3 flex items-center gap-2 text-sm font-bold">
              <span className="inline-block h-3.5 w-1 rounded-full bg-accent" />
              规划版本历史
            </div>
            {versions.length === 0 ? (
              <Empty icon="clock" title="暂无版本" />
            ) : (
              <ul className="divide-y divide-line/70">
                {versions.map((v) => (
                  <li key={v.id} className="flex items-center justify-between py-2.5 text-xs">
                    <span className="flex items-center gap-2.5">
                      <span className="num font-bold text-accent-deep">v{v.version}</span>
                      <span className="text-slate-1">
                        {v.weeklyHours}h/周 · {v.targetRole}
                      </span>
                      {v.status === 'active' && <Tag tone="teal">当前</Tag>}
                    </span>
                    <span className="num text-slate-2">{new Date(v.createdAt).toLocaleString('zh-CN')}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
