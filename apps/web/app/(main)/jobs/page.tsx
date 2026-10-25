'use client';
// 岗位洞察:指令台式搜索区 + 技能频次/分布/来源证据
import { useEffect, useState } from 'react';
import { api, pollRun } from '@/lib/api';
import { Loading, Empty, ErrorState, Tag, PageHeader } from '@/components/ui';
import { SkillFreqBar, CategoryPie, DistBars } from '@/components/charts';
import { Ic } from '@/components/Icon';
import type { JobAnalysisDTO, JobSourceDTO } from '@pathpilot/shared';
import { SOURCE_TYPE_LABELS, SKILL_CATEGORY_LABELS, type SkillCategory } from '@pathpilot/shared';

export default function JobsPage() {
  const [analysis, setAnalysis] = useState<JobAnalysisDTO | null>(null);
  const [sources, setSources] = useState<JobSourceDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const [role, setRole] = useState('Java 后端开发');
  const [city, setCity] = useState('');
  const [type, setType] = useState<'internship' | 'full_time'>('internship');
  const [manualOpen, setManualOpen] = useState(false);
  const [manual, setManual] = useState({ title: '', company: '', description: '' });

  async function load() {
    setLoading(true);
    setErr('');
    try {
      const a = await api<JobAnalysisDTO | null>('/api/jobs/analysis/latest');
      setAnalysis(a);
      if (a) setSources(await api<JobSourceDTO[]>(`/api/jobs/sources?analysisId=${a.id}`));
    } catch (e) {
      setErr(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function analyze() {
    setErr('');
    setBusy('正在联网搜索真实招聘信息…');
    try {
      const res = await api<{ run_id: number }>('/api/jobs/analyze', { method: 'POST', json: { targetRole: role, city: city || undefined, employmentType: type, sampleLimit: 10 } });
      setBusy('采集岗位样本并抽取技能要求…');
      await pollRun(res.run_id, (s) => setBusy(s === 'running' ? '采集岗位样本并抽取技能要求…' : s));
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '分析失败');
    } finally {
      setBusy('');
    }
  }

  async function submitManual() {
    setErr('');
    setBusy('解析岗位描述…');
    try {
      const res = await api<{ run_id: number }>('/api/jobs/manual', {
        method: 'POST',
        json: { targetRole: role, title: manual.title, company: manual.company || undefined, location: city || undefined, employmentType: type, description: manual.description },
      });
      await pollRun(res.run_id);
      setManualOpen(false);
      setManual({ title: '', company: '', description: '' });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '解析失败');
    } finally {
      setBusy('');
    }
  }

  const r = analysis?.result;
  const categoryItems = r
    ? Object.entries(
        r.skills.reduce<Record<string, number>>((acc, s) => {
          acc[s.category] = (acc[s.category] ?? 0) + s.count;
          return acc;
        }, {})
      ).map(([k, v]) => ({ name: SKILL_CATEGORY_LABELS[k as SkillCategory] ?? k, value: v }))
    : [];

  return (
    <div>
      <PageHeader eyebrow="02 · INSIGHT" title="岗位洞察" desc="输入目标岗位,AI 联网采集真实招聘样本,统计技能需求与分布" />

      {/* 指令台:一行完成一次分析 */}
      <section className="ink-panel bp-grid-dark reveal mb-5 rounded-2xl p-1.5">
        <div className="flex flex-wrap items-end gap-3 rounded-xl bg-white/95 p-4 backdrop-blur">
          <div className="min-w-44 flex-1">
            <label className="pp-label">目标岗位</label>
            <input className="pp-input" value={role} onChange={(e) => setRole(e.target.value)} placeholder="如:Java 后端开发" />
          </div>
          <div className="w-32">
            <label className="pp-label">城市</label>
            <input className="pp-input" value={city} onChange={(e) => setCity(e.target.value)} placeholder="北京" />
          </div>
          <div className="w-28">
            <label className="pp-label">类型</label>
            <select className="pp-input" value={type} onChange={(e) => setType(e.target.value as never)}>
              <option value="internship">实习</option>
              <option value="full_time">正式就业</option>
            </select>
          </div>
          <button className="pp-btn pp-btn-primary px-5 py-2.5 text-sm" onClick={analyze} disabled={!!busy}>
            <Ic name="globe" size={15} /> 联网分析
          </button>
          <button className="pp-btn pp-btn-ghost px-4 py-2.5 text-sm" onClick={() => setManualOpen(!manualOpen)} disabled={!!busy}>
            <Ic name="pen" size={14} /> 粘贴 JD
          </button>
        </div>
      </section>

      {manualOpen && (
        <div className="pp-card reveal mb-5 space-y-3 p-5">
          <div className="text-sm font-bold">粘贴一条岗位描述</div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="pp-label">岗位标题</label>
              <input className="pp-input" value={manual.title} onChange={(e) => setManual({ ...manual, title: e.target.value })} />
            </div>
            <div className="w-48">
              <label className="pp-label">公司</label>
              <input className="pp-input" value={manual.company} onChange={(e) => setManual({ ...manual, company: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="pp-label">岗位描述(至少 30 字)</label>
            <textarea className="pp-input min-h-32" value={manual.description} onChange={(e) => setManual({ ...manual, description: e.target.value })} placeholder="粘贴岗位职责与任职要求原文…" />
          </div>
          <button className="pp-btn pp-btn-primary px-4 py-2 text-xs" onClick={submitManual} disabled={!manual.title || manual.description.length < 30 || !!busy}>
            解析该岗位
          </button>
        </div>
      )}

      {busy && (
        <div className="mb-5 flex items-center gap-3 rounded-card bg-accent-soft px-4 py-3 text-sm text-accent-deep">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
          {busy}
        </div>
      )}
      {err && (
        <div className="mb-5">
          <ErrorState message={err} onRetry={load} />
        </div>
      )}
      {loading ? (
        <Loading text="读取岗位分析…" />
      ) : !analysis ? (
        <Empty icon="globe" title="开始第一次岗位分析" hint="点击「联网分析」,约 10-30 秒出结果;搜索受限时也可粘贴岗位描述解析" />
      ) : (
        <>
          <div className="reveal mb-5 flex flex-wrap items-center gap-2 text-xs text-slate-1">
            <Tag tone="ink">{analysis.targetRole}</Tag>
            <Tag tone="teal">有效样本 {analysis.sampleCount} 条</Tag>
            <span className="num">{new Date(analysis.createdAt).toLocaleString('zh-CN')}</span>
          </div>

          <div className="grid grid-cols-12 gap-5">
            <div className="pp-card reveal col-span-12 p-5 lg:col-span-7" style={{ '--d': '80ms' } as never}>
              <div className="mb-2 flex items-center gap-2 text-sm font-bold">
                <span className="inline-block h-3.5 w-1 rounded-full bg-accent" />
                技能需求排行
                <span className="num ml-auto text-[10px] tracking-widest text-slate-2">≥50% = 必备</span>
              </div>
              <SkillFreqBar skills={r!.skills} sampleCount={analysis.sampleCount} />
            </div>
            <div className="pp-card reveal col-span-12 p-5 lg:col-span-5" style={{ '--d': '140ms' } as never}>
              <div className="mb-2 flex items-center gap-2 text-sm font-bold">
                <span className="inline-block h-3.5 w-1 rounded-full bg-accent" />
                技能分类分布
              </div>
              <CategoryPie items={categoryItems} />
            </div>
            <div className="pp-card reveal col-span-6 p-5" style={{ '--d': '200ms' } as never}>
              <div className="mb-2 flex items-center gap-2 text-sm font-bold">
                <span className="inline-block h-3.5 w-1 rounded-full bg-accent" />
                学历要求分布
              </div>
              <DistBars items={r!.education_requirements} total={analysis.sampleCount} />
            </div>
            <div className="pp-card reveal col-span-6 p-5" style={{ '--d': '240ms' } as never}>
              <div className="mb-2 flex items-center gap-2 text-sm font-bold">
                <span className="inline-block h-3.5 w-1 rounded-full bg-accent" />
                经验要求分布
              </div>
              <DistBars items={r!.experience_requirements} total={analysis.sampleCount} />
            </div>

            {/* 来源证据表 */}
            <div className="pp-card reveal col-span-12 p-5" style={{ '--d': '280ms' } as never}>
              <div className="mb-3 flex items-center gap-2 text-sm font-bold">
                <span className="inline-block h-3.5 w-1 rounded-full bg-accent" />
                岗位样本与来源
                <span className="num ml-auto text-[10px] tracking-widest text-slate-2">{r!.sources.length} RECORDS</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-slate-2">
                    <tr className="border-b border-line">
                      <th className="py-2 pr-3 font-semibold">岗位</th>
                      <th className="py-2 pr-3 font-semibold">公司</th>
                      <th className="py-2 pr-3 font-semibold">来源</th>
                      <th className="py-2 pr-3 font-semibold">解析</th>
                      <th className="py-2 font-semibold">原文</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r!.sources.map((s, i) => (
                      <tr key={i} className="border-b border-line/60 transition hover:bg-paper/50">
                        <td className="max-w-64 truncate py-2 pr-3 font-semibold">{s.title}</td>
                        <td className="py-2 pr-3 text-slate-1">{sources.find((x) => x.title === s.title)?.company ?? '—'}</td>
                        <td className="py-2 pr-3">
                          <Tag tone={s.source_type === 'web' ? 'teal' : s.source_type === 'manual' ? 'amber' : 'slate'}>{SOURCE_TYPE_LABELS[s.source_type]}</Tag>
                        </td>
                        <td className="py-2 pr-3">{s.parse_status === 'ok' ? <span className="flex items-center gap-1 text-teal"><Ic name="check" size={11} strokeWidth={2.6} />成功</span> : <span className="text-slate-2">—</span>}</td>
                        <td className="py-2">
                          {s.source_url ? (
                            <a className="u-link" href={s.source_url} target="_blank" rel="noreferrer">
                              查看原文
                            </a>
                          ) : (
                            <span className="text-slate-2">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
