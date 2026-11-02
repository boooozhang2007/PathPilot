'use client';
// 简历工作台:选经历 → AI 生成草稿 → 逐项编辑 → 复制 Markdown / 下载 / 打印导出 PDF
import { useEffect, useState } from 'react';
import { api, API_BASE, getToken } from '@/lib/api';
import { Loading, ErrorState, Tag, PageHeader, Empty } from '@/components/ui';
import { Ic } from '@/components/Icon';
import type { ExperienceDTO, ProfileDTO } from '@pathpilot/shared';
import { EXPERIENCE_TYPE_LABELS } from '@pathpilot/shared';

interface Draft {
  target_role: string;
  summary: string;
  sections: { heading: string; items: string[] }[];
  notes: string[];
}

const CACHE_KEY = 'pp_resume_draft';

export default function ResumePage() {
  const [profile, setProfile] = useState<ProfileDTO | null>(null);
  const [experiences, setExperiences] = useState<ExperienceDTO[]>([]);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [draft, setDraft] = useState<Draft | null>(null);
  const [role, setRole] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    Promise.all([api<ProfileDTO | null>('/api/profile'), api<ExperienceDTO[]>('/api/experiences')])
      .then(([p, e]) => {
        setProfile(p);
        setExperiences(e);
        setRole(p?.targetRole ?? '');
        setPicked(new Set(e.map((x) => x.id)));
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          try {
            setDraft(JSON.parse(cached) as Draft);
          } catch {
            /* 忽略 */
          }
        }
      })
      .catch((e2) => setErr(e2 instanceof Error ? e2.message : '加载失败'))
      .finally(() => setLoading(false));
  }, []);

  async function generate() {
    if (!experiences.length) return;
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      const res = await api<{ draft: Draft }>('/api/resume/draft', {
        method: 'POST',
        json: { targetRole: role || profile?.targetRole || '软件开发', experienceIds: [...picked] },
      });
      setDraft(res.draft);
      localStorage.setItem(CACHE_KEY, JSON.stringify(res.draft));
      setMsg('草稿已生成,直接点击任意文字即可修改');
    } catch (e) {
      setErr(e instanceof Error ? e.message : '生成失败');
    } finally {
      setBusy(false);
    }
  }

  function patchDraft(patch: Partial<Draft>) {
    setDraft((d) => {
      if (!d) return d;
      const next = { ...d, ...patch };
      localStorage.setItem(CACHE_KEY, JSON.stringify(next));
      return next;
    });
  }

  function toMarkdown(d: Draft): string {
    return [`# ${d.target_role}`, '', d.summary, '', ...d.sections.flatMap((s) => [`## ${s.heading}`, ...s.items.map((i) => `- ${i}`), ''])].join('\n');
  }

  async function copyMd() {
    if (!draft) return;
    await navigator.clipboard.writeText(toMarkdown(draft));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function downloadMd() {
    if (!draft) return;
    const blob = new Blob([toMarkdown(draft)], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `resume-${(profile?.nickname ?? 'pathpilot').replace(/\s+/g, '-')}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function downloadPdf() {
    if (!draft) return;
    setBusy(true);
    setErr('');
    try {
      const res = await fetch(`${API_BASE}/api/resume/pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({
          targetRole: draft.target_role,
          summary: draft.summary,
          sections: draft.sections,
          notes: draft.notes,
          nickname: profile?.nickname,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const m = (data as { error?: { message?: string } }).error?.message;
        throw new Error(m ?? 'PDF 导出失败');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `resume-${(profile?.nickname ?? 'pathpilot').replace(/\s+/g, '-')}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      setMsg('PDF 已下载');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'PDF 导出失败');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Loading />;

  return (
    <div>
      <PageHeader
        eyebrow="08 · RESUME"
        title="简历工作台"
        desc="选择真实经历,AI 生成草稿;逐项修改后复制、下载或直接打印成 PDF"
        right={
          draft && (
            <div className="no-print flex gap-2">
              <button className="pp-btn pp-btn-ghost px-3 py-2 text-xs" onClick={copyMd}>
                <Ic name={copied ? 'check' : 'copy'} size={13} /> {copied ? '已复制' : '复制 Markdown'}
              </button>
              <button className="pp-btn pp-btn-ghost px-3 py-2 text-xs" onClick={downloadMd}>
                <Ic name="download" size={13} /> 下载 .md
              </button>
              <button className="pp-btn pp-btn-ghost px-3 py-2 text-xs" onClick={() => window.print()}>
                <Ic name="font" size={13} /> 打印
              </button>
              <button className="pp-btn pp-btn-primary px-3 py-2 text-xs" onClick={downloadPdf} disabled={busy}>
                <Ic name="download" size={13} /> {busy ? '导出中…' : '下载 PDF'}
              </button>
            </div>
          )
        }
      />

      {err && (
        <div className="no-print mb-5">
          <ErrorState message={err} onRetry={generate} />
        </div>
      )}
      {msg && (
        <div className="no-print mb-5 flex items-center gap-2 rounded-card bg-teal-soft px-4 py-3 text-sm text-teal">
          <Ic name="checkCircle" size={15} /> {msg}
        </div>
      )}

      <div className="grid grid-cols-12 gap-5">
        {/* 左:素材与生成(打印时隐藏) */}
        <div className="no-print col-span-12 space-y-5 lg:col-span-5">
          <div className="pp-card reveal p-5">
            <div className="mb-4 flex items-center gap-2 text-sm font-bold">
              <span className="inline-block h-3.5 w-1 rounded-full bg-accent" /> 目标岗位
            </div>
            <input className="pp-input" value={role} onChange={(e) => setRole(e.target.value)} placeholder="Java 后端开发" />
            <div className="mt-4 flex items-center justify-between">
              <span className="text-xs text-slate-2">已选 {picked.size} / {experiences.length} 条经历</span>
              <button className="text-xs font-semibold text-accent" onClick={() => setPicked(new Set(experiences.map((e) => e.id)))}>
                全选
              </button>
            </div>
            <div className="mt-2 flex gap-2">
              <button className="pp-btn pp-btn-primary flex-1 py-2.5 text-sm" onClick={generate} disabled={busy || !picked.size || !experiences.length}>
                {busy ? (
                  <>
                    <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" /> AI 撰写中…
                  </>
                ) : (
                  <>
                    <Ic name="spark" size={14} /> {draft ? '重新生成草稿' : '生成简历草稿'}
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="pp-card reveal p-5" style={{ '--d': '80ms' } as never}>
            <div className="mb-3 flex items-center gap-2 text-sm font-bold">
              <span className="inline-block h-3.5 w-1 rounded-full bg-accent" /> 经历素材
            </div>
            {experiences.length === 0 ? (
              <Empty icon="layers" title="还没有经历" hint="先到「能力档案」添加课程 / 项目 / 实习等真实经历" />
            ) : (
              <ul className="divide-y divide-line/70">
                {experiences.map((e) => {
                  const on = picked.has(e.id);
                  return (
                    <li key={e.id}>
                      <button
                        className={`flex w-full items-center gap-3 py-2.5 text-left text-sm transition ${on ? '' : 'opacity-45'}`}
                        onClick={() =>
                          setPicked((prev) => {
                            const n = new Set(prev);
                            if (n.has(e.id)) n.delete(e.id);
                            else n.add(e.id);
                            return n;
                          })
                        }
                      >
                        <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${on ? 'border-accent bg-accent text-white' : 'border-slate-2'}`}>
                          {on && <Ic name="check" size={10} strokeWidth={3.5} />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">{e.title}</span>
                          <span className="num block text-[11px] text-slate-2">
                            {EXPERIENCE_TYPE_LABELS[e.type]}
                            {e.technologies.length ? ` · ${e.technologies.slice(0, 3).join(' / ')}` : ''}
                          </span>
                        </span>
                        {e.evidenceUrl && <Ic name="checkCircle" size={13} className="shrink-0 text-teal" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {draft && draft.notes.length > 0 && (
            <div className="pp-card reveal p-5" style={{ '--d': '140ms' } as never}>
              <div className="mb-2 flex items-center gap-2 text-sm font-bold">
                <Ic name="info" size={14} className="text-amber" /> 建议补充
              </div>
              <ul className="space-y-1.5 text-xs leading-5 text-slate-1">
                {draft.notes.map((n, i) => (
                  <li key={i}>· {n}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* 右:简历预览(打印区域) */}
        <div className="col-span-12 lg:col-span-7">
          {!draft ? (
            <Empty icon="pen" title="还没有草稿" hint="左侧选择经历后点击「生成简历草稿」" />
          ) : (
            <div className="print-area pp-card reveal p-8" style={{ '--d': '80ms' } as never}>
              {/* 姓名/目标 */}
              <div className="flex items-end justify-between border-b-2 border-ink pb-3">
                <input
                  className="font-display w-full bg-transparent text-2xl font-bold outline-none focus:bg-accent-soft/40"
                  value={profile?.nickname ?? '你的名字'}
                  onChange={() => {}}
                  readOnly
                />
                <input
                  className="num w-40 shrink-0 bg-transparent text-right text-sm font-semibold text-accent-deep outline-none focus:bg-accent-soft/40"
                  value={draft.target_role}
                  onChange={(e) => patchDraft({ target_role: e.target.value })}
                />
              </div>

              <div className="mt-4">
                <div className="eyebrow no-print mb-1.5">SUMMARY</div>
                <textarea
                  className="w-full resize-none rounded-lg bg-transparent text-sm leading-6 outline-none focus:bg-accent-soft/30"
                  rows={Math.max(2, Math.ceil(draft.summary.length / 40))}
                  value={draft.summary}
                  onChange={(e) => patchDraft({ summary: e.target.value })}
                />
              </div>

              {draft.sections.map((s, si) => (
                <div key={si} className="mt-5">
                  <div className="flex items-center gap-2 border-b border-line pb-1.5">
                    <input
                      className="font-display bg-transparent text-base font-bold outline-none focus:bg-accent-soft/40"
                      value={s.heading}
                      onChange={(e) => {
                        const sections = [...draft.sections];
                        sections[si] = { ...s, heading: e.target.value };
                        patchDraft({ sections });
                      }}
                    />
                  </div>
                  <textarea
                    className="mt-2 w-full resize-none rounded-lg bg-transparent text-sm leading-6 outline-none focus:bg-accent-soft/30"
                    rows={Math.max(2, s.items.length)}
                    value={s.items.join('\n')}
                    onChange={(e) => {
                      const sections = [...draft.sections];
                      sections[si] = { ...s, items: e.target.value.split('\n') };
                      patchDraft({ sections });
                    }}
                  />
                </div>
              ))}

              <div className="no-print mt-6 flex items-center gap-2 text-[11px] text-slate-2">
                <Ic name="info" size={12} /> 点击任意文本即可修改,内容自动保存在本机
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
