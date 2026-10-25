'use client';
// 成长统计:投入图表 + 完成时间线 + 状态分布 + 成就徽章墙(数据全部来自真实任务/档案)
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Loading, ErrorState, Tag, PageHeader, Ring, SectionTitle, Empty } from '@/components/ui';
import { Chart, CategoryPie } from '@/components/charts';
import { Ic, type IconName } from '@/components/Icon';
import type { GrowthStats, ProfileDTO, ProfileSkillDTO, ExperienceDTO, RoadmapTaskDTO, RoadmapVersionSummary } from '@pathpilot/shared';
import { TASK_STATUS_LABELS, EVIDENCE_STATUS_LABELS } from '@pathpilot/shared';

interface Badge {
  icon: IconName;
  title: string;
  desc: string;
  on: boolean;
}

export default function GrowthPage() {
  const [stats, setStats] = useState<GrowthStats | null>(null);
  const [tasks, setTasks] = useState<RoadmapTaskDTO[]>([]);
  const [skills, setSkills] = useState<ProfileSkillDTO[]>([]);
  const [experiences, setExperiences] = useState<ExperienceDTO[]>([]);
  const [versions, setVersions] = useState<RoadmapVersionSummary[]>([]);
  const [profile, setProfile] = useState<ProfileDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    Promise.all([
      api<GrowthStats>('/api/stats/growth'),
      api<RoadmapTaskDTO[]>('/api/tasks'),
      api<ProfileSkillDTO[]>('/api/skills'),
      api<ExperienceDTO[]>('/api/experiences'),
      api<RoadmapVersionSummary[]>('/api/roadmaps'),
      api<ProfileDTO | null>('/api/profile'),
    ])
      .then(([s, t, sk, e, v, p]) => {
        setStats(s);
        setTasks(t);
        setSkills(sk);
        setExperiences(e);
        setVersions(v);
        setProfile(p);
      })
      .catch((e2) => setErr(e2 instanceof Error ? e2.message : '加载失败'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Loading />;
  if (err) return <ErrorState message={err} onRetry={() => location.reload()} />;

  const done = tasks.filter((t) => t.status === 'done');
  const evidenced = skills.filter((s) => s.evidenceStatus === 'evidenced');
  const doneRatio = tasks.length ? Math.round((done.length / tasks.length) * 100) : 0;

  // 按学期投入(计划 vs 实际)
  const sems = [...new Set(tasks.map((t) => t.semester))].sort((a, b) => a - b);
  const hoursBySem = sems.map((s) => ({
    sem: `S${s}`,
    planned: tasks.filter((t) => t.semester === s).reduce((x, t) => x + t.estimatedHours, 0),
    actual: tasks.filter((t) => t.semester === s).reduce((x, t) => x + (t.actualHours ?? 0), 0),
  }));

  // 完成时间线(按月,近 10 个有记录的月份)
  const byMonth = new Map<string, number>();
  for (const t of done) {
    if (!t.completedAt) continue;
    const m = t.completedAt.slice(0, 7);
    byMonth.set(m, (byMonth.get(m) ?? 0) + 1);
  }
  const months = [...byMonth.keys()].sort().slice(-10);

  // 状态分布
  const statusItems = (['not_started', 'in_progress', 'done', 'deferred'] as const)
    .map((k) => ({ name: TASK_STATUS_LABELS[k], value: tasks.filter((t) => t.status === k).length }))
    .filter((i) => i.value > 0);

  // 连续活跃月(以最近有完成的月份为终点往前数)
  let streak = 0;
  if (months.length) {
    const ms = [...byMonth.keys()].sort();
    const last = ms[ms.length - 1];
    const [ly, lm] = last.split('-').map(Number);
    let cur = new Date(ly, lm - 1, 1);
    for (;;) {
      const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`;
      if (byMonth.has(key)) {
        streak++;
        cur = new Date(cur.getFullYear(), cur.getMonth() - 1, 1);
      } else break;
    }
  }

  // 成就徽章(全部由真实数据计算)
  const badges: Badge[] = [
    { icon: 'roadmap', title: '启程', desc: '生成第一版成长规划', on: versions.length >= 1 },
    { icon: 'check', title: '破冰', desc: '完成第一个任务', on: done.length >= 1 },
    { icon: 'star', title: '十连击', desc: '累计完成 10 个任务', on: done.length >= 10 },
    { icon: 'checkCircle', title: '证据链', desc: '技能挂上第一份证据', on: evidenced.length >= 1 },
    { icon: 'layers', title: '硬功夫', desc: '5 项技能有证据', on: evidenced.length >= 5 },
    { icon: 'rocket', title: '作品集', desc: '拥有项目经历', on: experiences.some((e) => e.type === 'project') },
    { icon: 'door', title: '实习生', desc: '拥有实习经历', on: experiences.some((e) => e.type === 'internship') },
    { icon: 'refresh', title: '深耕', desc: '规划迭代 3 个版本', on: versions.length >= 3 },
    { icon: 'clock', title: '百小时', desc: '实际投入满 100 小时', on: (stats?.actualHours ?? 0) >= 100 },
    { icon: 'target', title: '关键先生', desc: '完成 3 个高优先级任务', on: done.filter((t) => t.priority === 'high').length >= 3 },
  ];
  const unlocked = badges.filter((b) => b.on).length;

  return (
    <div className="space-y-6">
      {/* 主视觉:一句话看清投入产出 */}
      <section className="ink-panel bp-grid-dark reveal flex flex-wrap items-center justify-between gap-6 rounded-2xl px-8 py-7 text-white">
        <div className="min-w-0">
          <div className="eyebrow mb-2" style={{ color: '#8ba7ff' }}>
            05 · GROWTH
          </div>
          <h1 className="font-display text-[26px] font-bold leading-tight">{profile?.nickname ?? '同学'}的成长记录</h1>
          <div className="mt-3 flex flex-wrap gap-5">
            {[
              { label: '完成任务', value: `${done.length}`, unit: `/${tasks.length}` },
              { label: '实际投入', value: `${stats?.actualHours ?? 0}`, unit: 'h' },
              { label: '证据技能', value: `${evidenced.length}`, unit: `/${skills.length}` },
              { label: '连续活跃', value: `${streak}`, unit: '个月' },
            ].map((s) => (
              <div key={s.label}>
                <div className="num text-2xl font-bold">
                  {s.value}
                  <span className="text-sm font-semibold text-white/50">{s.unit}</span>
                </div>
                <div className="mt-0.5 text-[11px] text-white/50">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-8">
          <div className="text-center">
            <Ring value={doneRatio} size={120} label="总完成率" track="rgba(255,255,255,.16)" tone="teal" />
          </div>
          <div className="hidden text-center sm:block">
            <Ring value={stats?.semesterCompletionRate ?? 0} size={120} label="本学期" track="rgba(255,255,255,.16)" />
          </div>
        </div>
      </section>

      {/* 图表区 */}
      <div className="grid grid-cols-12 gap-5">
        <section className="pp-card reveal col-span-12 p-5 lg:col-span-7" style={{ '--d': '80ms' } as never}>
          <SectionTitle right={<span className="num text-[10px] tracking-widest text-slate-2">HOURS</span>}>按学期投入(计划 vs 实际)</SectionTitle>
          <Chart
            height={260}
            option={{
              grid: { left: 8, right: 16, top: 28, bottom: 4, containLabel: true },
              tooltip: { trigger: 'axis' },
              legend: { top: 0, right: 0, textStyle: { fontSize: 11, color: '#52627A' }, itemWidth: 12, itemHeight: 8 },
              xAxis: { type: 'category', data: hoursBySem.map((h) => h.sem), axisTick: { show: false } },
              yAxis: { type: 'value', splitLine: { lineStyle: { color: '#e7e3d5' } } },
              series: [
                { name: '计划', type: 'bar', data: hoursBySem.map((h) => h.planned), itemStyle: { borderRadius: [5, 5, 0, 0], color: '#C6CFDE' }, barMaxWidth: 22 },
                { name: '实际', type: 'bar', data: hoursBySem.map((h) => h.actual), itemStyle: { borderRadius: [5, 5, 0, 0], color: '#426EFE' }, barMaxWidth: 22 },
              ],
            }}
          />
        </section>

        <section className="pp-card reveal col-span-12 p-5 lg:col-span-5" style={{ '--d': '140ms' } as never}>
          <SectionTitle right={<span className="num text-[10px] tracking-widest text-slate-2">TIMELINE</span>}>完成时间线(按月)</SectionTitle>
          {months.length ? (
            <Chart
              height={260}
              option={{
                grid: { left: 8, right: 16, top: 14, bottom: 4, containLabel: true },
                tooltip: { trigger: 'axis' },
                xAxis: { type: 'category', data: months, axisTick: { show: false } },
                yAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: '#e7e3d5' } } },
                series: [{ type: 'bar', data: months.map((m) => byMonth.get(m) ?? 0), itemStyle: { borderRadius: [5, 5, 0, 0], color: '#0E7C6B' }, barMaxWidth: 26 }],
              }}
            />
          ) : (
            <Empty icon="clock" title="还没有完成任务" hint="完成任务后,这里会出现你的月度节奏" />
          )}
        </section>

        <section className="pp-card reveal col-span-12 p-5 lg:col-span-5" style={{ '--d': '200ms' } as never}>
          <SectionTitle>任务状态分布</SectionTitle>
          {statusItems.length ? <CategoryPie items={statusItems} /> : <Empty icon="checkCircle" title="暂无任务" />}
        </section>

        <section className="pp-card reveal col-span-12 p-5 lg:col-span-7" style={{ '--d': '240ms' } as never}>
          <SectionTitle right={<span className="num text-[10px] tracking-widest text-slate-2">CRITICAL</span>}>即将推进的关键任务</SectionTitle>
          {stats?.upcomingCriticalTasks?.length ? (
            <ul className="divide-y divide-line/70">
              {stats.upcomingCriticalTasks.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="min-w-0 truncate font-semibold">{t.title}</span>
                  <span className="num flex shrink-0 items-center gap-2.5 text-[11px] text-slate-2">
                    S{t.semester} · {t.estimatedHours}h
                    <Tag tone={t.status === 'in_progress' ? 'accent' : 'slate'}>{TASK_STATUS_LABELS[t.status]}</Tag>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty icon="target" title="暂无待办的高优先级任务" />
          )}
          <div className="mt-4 flex flex-wrap gap-2 border-t border-line/70 pt-3.5">
            {(['evidenced', 'to_verify', 'needs_improvement', 'unevaluated'] as const).map((k) => (
              <Tag key={k} tone={k === 'evidenced' ? 'teal' : k === 'to_verify' ? 'amber' : 'slate'}>
                {EVIDENCE_STATUS_LABELS[k]} {skills.filter((s) => s.evidenceStatus === k).length}
              </Tag>
            ))}
          </div>
        </section>
      </div>

      {/* 成就徽章墙 */}
      <section className="pp-card reveal p-5" style={{ '--d': '280ms' } as never}>
        <SectionTitle
          right={
            <span className="num text-xs text-slate-2">
              {unlocked}/{badges.length} 已解锁
            </span>
          }
        >
          成就徽章
        </SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {badges.map((b, i) => (
            <div
              key={b.title}
              className={`reveal flex items-center gap-3 rounded-xl border p-3.5 transition ${b.on ? 'border-accent/40 bg-accent-soft/60' : 'border-line bg-paper/50 opacity-60'}`}
              style={{ '--d': `${300 + i * 50}ms` } as never}
            >
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${b.on ? 'bg-accent text-white shadow-lg shadow-accent/30' : 'bg-paper-2 text-slate-2'}`}>
                <Ic name={b.icon} size={18} />
              </span>
              <div className="min-w-0">
                <div className={`text-sm font-bold ${b.on ? 'text-ink' : 'text-slate-1'}`}>{b.title}</div>
                <div className="truncate text-[11px] text-slate-2">{b.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
