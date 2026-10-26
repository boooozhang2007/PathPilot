'use client';
// 首页:面包盒(Bento)布局——大小不一的纸件拼成一个整块,主视觉最大、数据与对话环绕
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Loading, Ring } from '@/components/ui';
import { AgentChat } from '@/components/AgentChat';
import { Ic, type IconName } from '@/components/Icon';
import type { DashboardData, RoadmapTaskDTO } from '@pathpilot/shared';
import { TASK_STATUS_LABELS, EVIDENCE_STATUS_LABELS, GRADE_LABELS } from '@pathpilot/shared';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 6) return '夜深了';
  if (h < 12) return '早上好';
  if (h < 18) return '下午好';
  return '晚上好';
}

/** 面包盒小格标签:图标 + 标题 + 右侧动作 */
function TileHead({ icon, title, right }: { icon: IconName; title: string; right?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <div className="flex items-center gap-2 text-sm font-bold">
        <Ic name={icon} size={14} className="text-accent-deep" />
        {title}
      </div>
      {right}
    </div>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [motto, setMotto] = useState('向着热爱深处，慢慢长成自己的答案。');

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
  useEffect(() => { api<{ text: string }>('/api/motto').then((x) => setMotto(x.text)).catch(() => {}); }, []);

  if (loading) return <Loading />;
  const d = data;
  const sem = d?.currentSemester ?? null;
  const nextTask: RoadmapTaskDTO | undefined = d?.recentTasks?.[0];
  const hasRoadmap = !!d?.activeRoadmapVersion;

  return (
    <div className="grid grid-cols-12 grid-flow-row-dense gap-4">
      {/* ---------- 面包盒最大格:主视觉(2 行高) ---------- */}
      <section className="ink-panel noise corner-ticks sheet-frame reveal relative col-span-12 overflow-hidden rounded-[10px] px-7 py-6 text-white lg:col-span-8 lg:row-span-2">
        <span className="tape" />
        <div className="flex h-full flex-col justify-between">
          <div>
            <div className="eyebrow mb-2">01 · DASHBOARD</div>
            <h1 className="font-display text-[26px] font-bold leading-tight">{greeting()},{d?.profile?.nickname ?? '同学'}</h1>
            <p className="mt-2 text-[13px] leading-6 text-white/60">
              {motto}<br />
              {d?.profile ? `${GRADE_LABELS[d.profile.grade]} · 目标 ${d.profile.targetRole || '未设定'} · 每周可投入 ${d.profile.weeklyHours}h` : '先完善个人资料,开始你的成长规划'}
            </p>
          </div>
          <div className="mt-6">
            <div className="flex flex-wrap gap-2.5">
              <Link href={hasRoadmap ? '/planning' : '/jobs'} className="pp-btn pp-btn-primary px-5 py-2.5 text-sm">
                <Ic name={hasRoadmap ? 'refresh' : 'roadmap'} size={15} />
                {hasRoadmap ? '调整规划' : '生成我的路线'}
              </Link>
              <Link href="/advisor" className="pp-btn border border-white/25 px-5 py-2.5 text-sm text-white/90 transition hover:border-white/60 hover:text-white">
                <Ic name="chat" size={15} />
                问 AI 顾问
              </Link>
            </div>
            {d?.topGaps?.length ? (
              <div className="mt-5 flex flex-wrap items-center gap-1.5">
                <span className="num mr-1 text-[10px] tracking-widest text-white/40">GAPS</span>
                {d.topGaps.slice(0, 4).map((g) => (
                  <span key={g.skill} className="rounded-[4px] border border-white/20 bg-white/5 px-2 py-0.5 text-[11px] text-white/80">
                    {g.skill}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {/* ---------- 匹配度格 ---------- */}
      <section className="pp-card reveal col-span-12 flex flex-col p-5 lg:col-span-4">
        <TileHead icon="target" title="岗位匹配度" right={<Link href="/jobs" className="u-link text-xs">岗位洞察</Link>} />
        <div className="flex flex-1 items-center justify-center gap-4">
          {d && d.matchScore !== null ? (
            <>
              <Ring value={d.matchScore} size={104} label="当前" />
              <div className="space-y-1 text-xs text-slate-1">
                <div className="num text-[10px] tracking-widest text-slate-2">SAMPLES</div>
                <div className="num text-xl font-bold text-ink">{d.matchSampleCount}</div>
                <div>条真实岗位样本</div>
              </div>
            </>
          ) : (
            <Link href="/jobs" className="flex h-24 w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-line-2 text-slate-1 transition hover:border-accent hover:text-accent">
              <Ic name="globe" size={22} />
              <span className="text-xs">先做岗位分析</span>
            </Link>
          )}
        </div>
      </section>

      {/* ---------- 学期进度格 ---------- */}
      <section className="pp-card reveal col-span-12 p-5 lg:col-span-4" style={{ '--d': '60ms' } as never}>
        <TileHead icon="calendar" title="学期进度" right={sem ? <span className="num text-xs font-bold text-teal">{sem.doneRatio}%</span> : undefined} />
        {sem ? (
          <div className="flex flex-1 flex-col justify-center">
            <div className="mb-1.5 text-xs font-semibold text-slate-1">{sem.label}</div>
            <div className="h-2 overflow-hidden rounded-full bg-paper-2 shadow-[inset_0_1px_2px_rgba(70,45,10,.25)]">
              <div className="h-full rounded-full bg-gradient-to-r from-teal to-[#2a9a83]" style={{ width: `${sem.doneRatio}%` }} />
            </div>
            <div className="num mt-2 text-[11px] text-slate-2">
              {sem.doneTasks} / {sem.totalTasks} 项已完成
            </div>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center text-xs text-slate-2">生成规划后显示</div>
        )}
      </section>

      {/* ---------- 对话大格(2 行高) ---------- */}
      <section className="pp-card reveal col-span-12 overflow-hidden p-0 lg:col-span-7 lg:row-span-2" style={{ '--d': '80ms' } as never}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <div className="flex items-center gap-2 text-sm font-bold">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent text-white">
              <Ic name="spark" size={13} />
            </span>
            AI 顾问
          </div>
          <Link href="/advisor" className="u-link text-xs">
            完整对话
          </Link>
        </div>
        <AgentChat heightClass="h-[430px]" suggestions={['我目前最应该学什么？', '帮我分析北京的 Java 岗位', '把每周改成 8 小时并重新规划']} />
      </section>

      {/* ---------- 下一步行动格 ---------- */}
      <section className="pp-card reveal col-span-12 p-5 lg:col-span-5" style={{ '--d': '140ms' } as never}>
        <TileHead icon="play" title="下一步行动" right={<Link href="/tasks" className="u-link text-xs">任务中心</Link>} />
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
      </section>

      {/* ---------- 技能缺口格 ---------- */}
      <section className="pp-card reveal col-span-12 p-5 lg:col-span-5" style={{ '--d': '200ms' } as never}>
        <TileHead icon="layers" title="核心技能缺口" right={<Link href="/profile" className="u-link text-xs">能力档案</Link>} />
        {d?.topGaps?.length ? (
          <ul className="space-y-2">
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
          <div className="py-3 text-center text-xs text-slate-1">
            <Link href="/jobs" className="u-link">发起岗位分析</Link>后展示缺口
          </div>
        )}
        {d?.jobSkills?.length ? (
          <div className="mt-3.5 space-y-1.5 border-t border-line/70 pt-3">
            <div className="num text-[10px] tracking-widest text-slate-2">TOP DEMANDS</div>
            {d.jobSkills.slice(0, 3).map((s) => (
              <div key={s.name} className="flex items-center gap-2 text-xs">
                <span className="w-16 shrink-0 truncate font-semibold text-ink">{s.name}</span>
                <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-paper-2 shadow-[inset_0_1px_2px_rgba(70,45,10,.2)]">
                  <span className="block h-full rounded-full bg-accent/75" style={{ width: `${Math.round(s.frequency * 100)}%` }} />
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      {err && (
        <div className="reveal col-span-12 flex items-center gap-3 rounded-card border border-amber/40 bg-amber-soft px-4 py-3 text-sm text-amber">
          <Ic name="warn" size={15} />
          <span className="flex-1">{err}</span>
          <button className="pp-btn pp-btn-ghost px-3 py-1 text-xs" onClick={load}>
            重试
          </button>
        </div>
      )}
    </div>
  );
}
