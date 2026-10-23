'use client';
// 页面 4：动态规划（PRD 5.1）：条件编辑、重规划、前后对比、版本历史
import { useEffect, useState } from 'react';
import { api, pollRun } from '@/lib/api';
import { Loading, Empty, ErrorState, Tag, PageHeader } from '@/components/ui';
import { VersionCompare } from '@/components/charts';
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
      await api('/api/profile', { method: 'PUT', json: { ...profile, nickname: profile!.nickname, grade: profile!.grade, graduationDate: profile!.graduationDate, targetRole: role, careerPath: path, weeklyHours: weekly } });
      setMsg('条件已保存');
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '保存失败');
    }
  }

  async function replan() {
    setErr('');
    setMsg('');
    setBusy('正在基于最新条件重新规划（已完成任务将保留）…');
    try {
      if (!profile) throw new Error('请先保存个人资料');
      await api('/api/profile', { method: 'PUT', json: { ...profile, nickname: profile.nickname, grade: profile.grade, graduationDate: profile.graduationDate, targetRole: role, careerPath: path, weeklyHours: weekly } });
      const run = await api<{ run_id: number }>(`/api/roadmaps/${current!.id}/revise`, { method: 'POST', json: { weeklyHours: weekly, targetRole: role, careerPath: path } });
      setBusy('规划生成中…');
      await pollRun(run.run_id);
      setMsg('新版本已生成，已完成任务与成果已保留');
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '重规划失败（原规划不受影响）');
    } finally {
      setBusy('');
    }
  }

  async function firstPlan() {
    setErr('');
    setBusy('正在生成你的第一版成长规划…');
    try {
      await api('/api/profile', { method: 'PUT', json: { ...profile, nickname: profile!.nickname, grade: profile!.grade, graduationDate: profile!.graduationDate, targetRole: role, careerPath: path, weeklyHours: weekly } });
      const run = await api<{ run_id: number }>('/api/roadmaps', { method: 'POST', json: {} });
      await pollRun(run.run_id);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '生成失败');
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="pp-anim">
      <PageHeader title="动态规划" desc="条件变化后重新规划：新版本、已完成任务保留、差异逐项可查" />

      {err && <div className="mb-4"><ErrorState message={err} /></div>}
      {msg && <div className="mb-4 rounded-card bg-teal-soft px-4 py-3 text-sm text-teal">{msg}</div>}
      {busy && (
        <div className="mb-4 flex items-center gap-3 rounded-card bg-teal-soft px-4 py-3 text-sm text-teal">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-teal/30 border-t-teal" />
          {busy}
        </div>
      )}

      <div className="grid grid-cols-12 gap-5">
        <div className="pp-card col-span-5 p-6">
          <div className="mb-4 text-sm font-bold">当前规划条件</div>
          <div className="mb-5">
            <label className="pp-label">每周可投入时间：<span className="font-mono text-accent">{weekly} 小时</span></label>
            <input type="range" min={2} max={30} value={weekly} onChange={(e) => setWeekly(Number(e.target.value))} className="w-full accent-[#E8512A]" />
            <div className="flex justify-between text-[10px] text-slate-2"><span>2h</span><span>30h</span></div>
          </div>
          <div className="mb-4">
            <label className="pp-label">目标岗位</label>
            <input className="pp-input" value={role} onChange={(e) => setRole(e.target.value)} placeholder="Java 后端开发 / 前端开发 / AI 应用开发 / 数据分析" />
          </div>
          <div className="mb-5">
            <label className="pp-label">发展路径</label>
            <div className="flex rounded-xl bg-paper-2 p-1 text-xs font-semibold">
              {CAREER_PATHS.map((p) => (
                <button key={p} className={`flex-1 rounded-lg py-2 transition ${path === p ? 'bg-white shadow-sm' : 'text-slate-1'}`} onClick={() => setPath(p)}>
                  {CAREER_PATH_LABELS[p]}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button className="pp-btn pp-btn-ghost flex-1 py-2.5 text-xs" onClick={saveConditions} disabled={!!busy || !profile}>保存条件</button>
            {current ? (
              <button className="pp-btn pp-btn-primary flex-1 py-2.5 text-xs" onClick={replan} disabled={!!busy}>重新规划</button>
            ) : (
              <button className="pp-btn pp-btn-primary flex-1 py-2.5 text-xs" onClick={firstPlan} disabled={!!busy || !profile}>生成规划</button>
            )}
          </div>
          {!profile && <p className="mt-3 text-[11px] text-accent">请先在「能力档案」完善年级与毕业时间等资料</p>}
        </div>

        <div className="col-span-7 space-y-5">
          {diff ? (
            <div className="pp-card p-6">
              <div className="mb-3 text-sm font-bold">调整前后对比（v{current?.parentVersionId ? '' : ''}当前 v{current?.version}）</div>
              <VersionCompare
                oldHours={diff.hours_change.from}
                newHours={diff.hours_change.to}
                oldCount={counts?.oldCount ?? 0}
                newCount={counts?.newCount ?? 0}
              />
              <div className="mt-4 grid grid-cols-3 gap-3 text-xs">
                <div className="rounded-lg bg-accent-soft p-3">
                  <div className="font-bold text-accent">新增 {diff.added_tasks.length}</div>
                  {diff.added_tasks.slice(0, 3).map((t) => <div key={t} className="truncate text-slate-1">{t}</div>)}
                </div>
                <div className="rounded-lg bg-paper-2 p-3">
                  <div className="font-bold text-slate-1">移除 {diff.removed_tasks.length}</div>
                  {diff.removed_tasks.slice(0, 3).map((t) => <div key={t} className="truncate text-slate-1">{t}</div>)}
                </div>
                <div className="rounded-lg bg-amber-soft p-3">
                  <div className="font-bold text-amber">延后 {diff.deferred_tasks.length}</div>
                  {diff.deferred_tasks.slice(0, 3).map((t) => <div key={t} className="truncate text-slate-1">{t}</div>)}
                </div>
              </div>
              {diff.priority_changes.length > 0 && (
                <div className="mt-3 text-xs text-slate-1">
                  优先级变化：{diff.priority_changes.map((c) => `${c.title}（${c.from}→${c.to}）`).join('、')}
                </div>
              )}
              {diff.reasons.length > 0 && (
                <div className="mt-3 rounded-lg bg-paper-2 p-3 text-xs leading-5">
                  <span className="font-bold">调整原因：</span>
                  {diff.reasons.join('；')}
                </div>
              )}
            </div>
          ) : (
            current && (
              <div className="pp-card flex items-center justify-center p-10 text-sm text-slate-1">
                首次规划（v{current.version}），条件变化后重规划将在此展示对比
              </div>
            )
          )}

          <div className="pp-card p-6">
            <div className="mb-3 text-sm font-bold">规划版本历史</div>
            {versions.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-1">暂无版本</div>
            ) : (
              <ul className="divide-y divide-line">
                {versions.map((v) => (
                  <li key={v.id} className="flex items-center justify-between py-2.5 text-xs">
                    <span className="flex items-center gap-2">
                      <span className="font-mono font-bold">v{v.version}</span>
                      <span className="text-slate-1">{v.weeklyHours}h/周 · {v.targetRole}</span>
                      {v.status === 'active' && <Tag tone="teal">当前</Tag>}
                    </span>
                    <span className="text-slate-2">{new Date(v.createdAt).toLocaleString('zh-CN')}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-[11px] text-slate-2">每次重规划生成新版本，历史版本永久保留可追溯；生成失败不会影响当前规划。</p>
          </div>
        </div>
      </div>
    </div>
  );
}
