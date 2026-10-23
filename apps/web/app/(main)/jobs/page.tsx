'use client';
// 页面 2：岗位洞察（PRD 5.1）：搜索表单、样本列表、来源链接、频次柱状图、分类图、学历经验分布
import { useEffect, useState } from 'react';
import { api, pollRun } from '@/lib/api';
import { Loading, Empty, ErrorState, Tag, PageHeader } from '@/components/ui';
import { SkillFreqBar, CategoryPie, DistBars } from '@/components/charts';
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
    setBusy('解析手动输入的岗位描述…');
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
    <div className="pp-anim">
      <PageHeader title="岗位洞察" desc="基于真实招聘样本统计技能需求；样本量与来源全部如实标注" />

      <div className="pp-card mb-5 flex flex-wrap items-end gap-3 p-5">
        <div className="min-w-44 flex-1">
          <label className="pp-label">目标岗位</label>
          <input className="pp-input" value={role} onChange={(e) => setRole(e.target.value)} placeholder="如：Java 后端开发" />
        </div>
        <div className="w-36">
          <label className="pp-label">城市（可选）</label>
          <input className="pp-input" value={city} onChange={(e) => setCity(e.target.value)} placeholder="北京" />
        </div>
        <div className="w-32">
          <label className="pp-label">类型</label>
          <select className="pp-input" value={type} onChange={(e) => setType(e.target.value as never)}>
            <option value="internship">实习</option>
            <option value="full_time">正式就业</option>
          </select>
        </div>
        <button className="pp-btn pp-btn-primary px-5 py-2.5 text-sm" onClick={analyze} disabled={!!busy}>联网分析</button>
        <button className="pp-btn pp-btn-ghost px-4 py-2.5 text-sm" onClick={() => setManualOpen(!manualOpen)} disabled={!!busy}>手动输入 JD</button>
      </div>

      {manualOpen && (
        <div className="pp-card mb-5 space-y-3 p-5">
          <div className="text-sm font-bold">手动粘贴岗位描述 <span className="ml-1 text-xs font-normal text-slate-1">（来源类型=手动输入，样本量 1，搜索不可用时的可靠途径）</span></div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="pp-label">岗位标题</label>
              <input className="pp-input" value={manual.title} onChange={(e) => setManual({ ...manual, title: e.target.value })} />
            </div>
            <div className="w-48">
              <label className="pp-label">公司（可选）</label>
              <input className="pp-input" value={manual.company} onChange={(e) => setManual({ ...manual, company: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="pp-label">岗位描述（至少 30 字）</label>
            <textarea className="pp-input min-h-32" value={manual.description} onChange={(e) => setManual({ ...manual, description: e.target.value })} placeholder="粘贴岗位职责与任职要求原文…" />
          </div>
          <button className="pp-btn pp-btn-primary px-4 py-2 text-xs" onClick={submitManual} disabled={!manual.title || manual.description.length < 30 || !!busy}>解析该岗位</button>
        </div>
      )}

      {busy && (
        <div className="mb-5 flex items-center gap-3 rounded-card bg-teal-soft px-4 py-3 text-sm text-teal">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-teal/30 border-t-teal" />
          {busy}
        </div>
      )}
      {err && <div className="mb-5"><ErrorState message={err} onRetry={load} /></div>}
      {loading ? (
        <Loading text="读取岗位分析…" />
      ) : !analysis ? (
        <Empty title="还没有岗位分析" hint="输入目标岗位点击「联网分析」。搜索失败时会自动使用预置真实样本或手动输入，来源类型都会如实标注。" />
      ) : (
        <>
          <div className="mb-5 flex flex-wrap items-center gap-2 text-xs text-slate-1">
            <Tag tone="ink">{analysis.targetRole}</Tag>
            <Tag tone="teal">有效样本 {analysis.sampleCount} 条</Tag>
            <Tag tone="slate">引擎：{analysis.engine === 'pi-llm' ? 'AI 模型' : '规则引擎'}</Tag>
            <span>{new Date(analysis.createdAt).toLocaleString('zh-CN')}</span>
          </div>

          {r && r.limitations.length > 0 && (
            <div className="mb-5 rounded-card border border-amber/30 bg-amber-soft p-4 text-xs leading-5 text-amber">
              <div className="mb-1 font-bold">数据说明（重要）</div>
              <ul className="list-disc space-y-0.5 pl-4">
                {r.limitations.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-12 gap-5">
            <div className="pp-card col-span-7 p-5">
              <div className="mb-2 text-sm font-bold">技能需求排行 <span className="ml-1 text-xs font-normal text-slate-1">出现率 ≥50% 记为「必备」</span></div>
              <SkillFreqBar skills={r!.skills} sampleCount={analysis.sampleCount} />
            </div>
            <div className="col-span-5 space-y-5">
              <div className="pp-card p-5">
                <div className="mb-2 text-sm font-bold">技能分类分布</div>
                <CategoryPie items={categoryItems} />
              </div>
            </div>
            <div className="pp-card col-span-6 p-5">
              <div className="mb-2 text-sm font-bold">学历要求分布</div>
              <DistBars items={r!.education_requirements} total={analysis.sampleCount} />
            </div>
            <div className="pp-card col-span-6 p-5">
              <div className="mb-2 text-sm font-bold">经验要求分布</div>
              <DistBars items={r!.experience_requirements} total={analysis.sampleCount} />
            </div>
            <div className="pp-card col-span-12 p-5">
              <div className="mb-3 text-sm font-bold">岗位样本与来源</div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-slate-1">
                    <tr className="border-b border-line">
                      <th className="py-2 pr-3 font-semibold">岗位</th>
                      <th className="py-2 pr-3 font-semibold">公司</th>
                      <th className="py-2 pr-3 font-semibold">来源类型</th>
                      <th className="py-2 pr-3 font-semibold">解析</th>
                      <th className="py-2 font-semibold">原始链接</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r!.sources.map((s, i) => (
                      <tr key={i} className="border-b border-line/60">
                        <td className="max-w-64 truncate py-2 pr-3 font-semibold">{s.title}</td>
                        <td className="py-2 pr-3 text-slate-1">{(sources.find((x) => x.title === s.title)?.company) ?? '—'}</td>
                        <td className="py-2 pr-3"><Tag tone={s.source_type === 'web' ? 'teal' : s.source_type === 'manual' ? 'amber' : 'slate'}>{SOURCE_TYPE_LABELS[s.source_type]}</Tag></td>
                        <td className="py-2 pr-3">{s.parse_status === 'ok' ? <span className="text-teal">成功</span> : <span className="text-accent">失败</span>}</td>
                        <td className="py-2">
                          {s.source_url ? (
                            <a className="text-accent underline underline-offset-2" href={s.source_url} target="_blank" rel="noreferrer">查看原文</a>
                          ) : (
                            <span className="text-slate-2">无</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-[11px] leading-4 text-slate-2">每条样本均记录来源链接与采集时间；未成功解析的来源如实标记为「失败」，不计入统计。</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
