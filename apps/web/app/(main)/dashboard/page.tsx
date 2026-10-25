'use client';
// 首页:墨色主视觉回答「我离目标多远、下一步做什么」,对话与数据环绕
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Loading, Ring, SectionTitle } from '@/components/ui';
import { AgentChat } from '@/components/AgentChat';
import { Ic } from '@/components/Icon';
import type { DashboardData, RoadmapTaskDTO } from '@pathpilot/shared';
import { TASK_STATUS_LABELS, EVIDENCE_STATUS_LABELS, GRADE_LABELS } from '@pathpilot/shared';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 6) return '夜深了';
  if (h < 12) return '早上好';
  if (h < 18) return '下午好';
  return '晚上好';
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    api<DashboardData>('/api/dashboard')
      .then((d) => {
        setData(d);
        setErr('');
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  if (loading) return <Loading />;
  const d = data;
  const sem = d?.currentSemester ?? null;
  const nextTask: RoadmapTaskDTO | undefined = d?.recentTasks?.[0];
  const hasRoadmap = !!d?.activeRoadmapVersion;

  return (
    <div className="space-y-6">
      {/* ---------- 主视觉:墨色蓝图,一屏回答两件事(距离 & 下一步) ---------- */}
      <section className="ink-panel noise corner-ticks reveal relative overflow-hidden rounded-[10px] px-8 py-7 text-white">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0 max-w-xl">
            <div className="eyebrow mb-2 text-accent" style={{ color: '#8ba7ff' }}>
              01 · DASHBOARD
            </div>
            <h1 className="font-display text-[26px] font-bold leading-tight">
              {greeting()},{d?.profile?.nickname ?? '同学'}
            </h1>
            <p className="mt-2 text-[13px] leading-6 text-white/60">
              {d?.profile ? `${GRADE_LABELS[d.profile.grade]} · 目标 ${d.profile.targetRole || '未设定'} · 每周可投入 ${d.profile.weeklyHours}h` : '先完善个人资料,开始你的成长规划'}
            </p>
            <div className="mt-5 flex flex-wrap gap-2.5">
              <Link href={hasRoadmap ? '/planning' : '/jobs'} className="pp-btn pp-btn-primary px-5 py-2.5 text-sm">
                <Ic name={hasRoadmap ? 'refresh' : 'roadmap'} size={15} />
                {hasRoadmap ? '调整规划' : '生成我的路线'}
              </Link>
              <Link href="/advisor" className="pp-btn border border-white/20 px-5 py-2.5 text-sm text-white/85 transition hover:border-white/50 hover:text-white">
                <Ic name="chat" size={15} />
                问 AI 顾问
              </Link>
            </div>
            {/* 技能缺口:墨面上的亮点词条 */}
            {d?.topGaps?.length ? (
              <div className="mt-5 flex flex-wrap items-center gap-1.5">
                <span className="num mr-1 text-[10px] tracking-widest text-white/40">GAPS</span>
                {d.topGaps.slice(0, 4).map((g) => (
                  <span key={g.skill} className="rounded-md border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] text-white/75">
                    {g.skill}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          {/* 匹配环:页面视觉锚点 */}
          <div className="flex items-center gap-6">
            {d && d.matchScore !== null ? (
              <div className="text-center">
                <Ring value={d.matchScore} size={128} label="岗位匹配度" track="rgba(255,255,255,.16)" />
                <div className="num mt-1 text-[10px] tracking-widest text-white/40">{d.matchSampleCount} SAMPLES</div>
              </div>
            ) : (
              <Link href="/jobs" className="flex h-[128px] w-[128px] flex-col items-center justify-center gap-2 rounded-full border border-dashed border-white/25 text-white/70 transition hover:border-accent hover:text-white">
                <Ic name="globe" size={26} />
                <span className="text-xs">先做岗位分析</span>
              </Link>
            )}
          </div>
        </div>
      </section>

      {err && <ErrorDashboard message={err} onRetry={load} />}

      <div className="grid grid-cols-12 gap-5">
        {/* ---------- 对话:第二大块 ---------- */}
        <section className="pp-card reveal col-span-12 overflow-hidden p-0 lg:col-span-7" style={{ '--d': '80ms' } as never}>
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <div className="flex items-center gap-2 text-sm font-bold">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-accent text-white">
                <Ic name="spark" size={13} />
              </span>
              AI 顾问
            </div>
            <Link href="/advisor" className="u-link text-xs">
              完整对话
            </Link>
          </div>
          <AgentChat heightClass="h-[52vh]" suggestions={['我目前最应该学什么？', '帮我分析北京的 Java 岗位', '把每周改成 8 小时并重新规划']} />
        </section>

        {/* ---------- 右列:下一步 & 学期进度 & 岗位高频 ---------- */}
        <div className="col-span-12 space-y-5 lg:col-span-5">
          <section className="pp-card reveal p-5" style={{ '--d': '140ms' } as never}>
            <SectionTitle right={<Link href="/tasks" className="u-link text-xs">任务中心</Link>}>下一步行动</SectionTitle>
            {nextTask ? (
              <Link href="/tasks" className="group flex items-center gap-3 rounded-lg border border-line bg-paper/60 px-4 py-3.5 transition hover:border-accent">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">
                  <Ic name="play" size={15} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold group-hover:text-accent">{nextTask.title}</div>
                  <div className="num mt-0.5 text-[11px] text-slate-2">
                    {nextTask.estimatedHours}h · 学期 {nextTask.semester} · {TASK_STATUS_LABELS[nextTask.status]}
                  </div>
                </div>
                <Ic name="chevronRight" size={15} className="text-slate-2 transition group-hover:translate-x-0.5 group-hover:text-accent" />
              </Link>
            ) : (
              <div className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-xs text-slate-1">
                {hasRoadmap ? '当前学期任务全部完成' : '生成规划后,下一步行动会出现在这里'}
              </div>
            )}
            {sem && (
              <div className="mt-4">
                <div className="mb-1.5 flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-1">{sem.label}进度</span>
                  <span className="num font-bold text-teal">{sem.doneRatio}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-paper-2">
                  <div className="h-full rounded-full bg-gradient-to-r from-teal to-[#14a08a] transition-all duration-700" style={{ width: `${sem.doneRatio}%` }} />
                </div>
                <div className="num mt-1.5 text-[11px] text-slate-2">
                  {sem.doneTasks} / {sem.totalTasks} 项已完成
                </div>
              </div>
            )}
          </section>

          <section className="pp-card reveal p-5" style={{ '--d': '200ms' } as never}>
            <SectionTitle right={<Link href="/profile" className="u-link text-xs">能力档案</Link>}>核心技能缺口</SectionTitle>
            {d?.topGaps?.length ? (
              <ul className="space-y-2.5">
                {d.topGaps.map((g) => (
                  <li key={g.skill} className="flex items-center justify-between text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${g.importance === 'high' ? 'bg-accent' : 'bg-amber'}`} />
                      <span className="truncate font-semibold">{g.skill}</span>
                    </span>
                    <span className="shrink-0 text-xs text-slate-2">{EVIDENCE_STATUS_LABELS[g.userStatus]}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="py-4 text-center text-xs text-slate-1">
                <Link href="/jobs" className="u-link">发起岗位分析</Link>后展示缺口
              </div>
            )}
            {d?.jobSkills?.length ? (
              <div className="mt-4 space-y-2 border-t border-line/70 pt-3.5">
                <div className="num text-[10px] tracking-widest text-slate-2">TOP DEMANDS</div>
                {d.jobSkills.slice(0, 4).map((s) => (
                  <div key={s.name} className="flex items-center gap-2 text-xs">
                    <span className="w-16 shrink-0 truncate font-semibold text-ink">{s.name}</span>
                    <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-paper-2">
                      <span className="block h-full rounded-full bg-accent/75" style={{ width: `${Math.round(s.frequency * 100)}%` }} />
                    </span>
                    {s.required && <span className="shrink-0 rounded bg-accent-soft px-1 py-0.5 text-[10px] font-bold text-accent-deep">必备</span>}
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}

function ErrorDashboard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="reveal flex items-center gap-3 rounded-card border border-amber/40 bg-amber-soft px-4 py-3 text-sm text-amber">
      <Ic name="warn" size={15} />
      <span className="flex-1">{message}</span>
      <button className="pp-btn pp-btn-ghost px-3 py-1 text-xs" onClick={onRetry}>
        重试
      </button>
    </div>
  );
}
