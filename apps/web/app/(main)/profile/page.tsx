'use client';
// 页面 5：能力档案（PRD 5.1）：个人资料 + 技能/课程/项目/竞赛 + 证据 + 雷达图 + 缺口建议
// 技能按「专业能力 / 通用能力」分组展示；资料支持头像上传与 MBTI 记录
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { Loading, ErrorState, Tag, PageHeader } from '@/components/ui';
import { SkillRadar } from '@/components/charts';
import type { ProfileDTO, ProfileSkillDTO, ExperienceDTO, SkillGapResult } from '@pathpilot/shared';
import {
  GRADES, GRADE_LABELS, CAREER_PATHS, CAREER_PATH_LABELS, EXPERIENCE_TYPES, EXPERIENCE_TYPE_LABELS,
  EVIDENCE_STATUSES, EVIDENCE_STATUS_LABELS, MBTI_DIMENSIONS, skillGroupOf, SKILL_GROUP_LABELS,
} from '@pathpilot/shared';

type Tab = 'skills' | 'courses' | 'projects' | 'contests';

/** 16 型 MBTI 选项（四维度组合） */
const MBTI_OPTIONS = [''] as string[];
for (const d of MBTI_DIMENSIONS[0].options) for (const n of MBTI_DIMENSIONS[1].options) for (const t of MBTI_DIMENSIONS[2].options) for (const j of MBTI_DIMENSIONS[3].options) MBTI_OPTIONS.push(d + n + t + j);

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileDTO | null>(null);
  const [skills, setSkills] = useState<ProfileSkillDTO[]>([]);
  const [experiences, setExperiences] = useState<ExperienceDTO[]>([]);
  const [gap, setGap] = useState<SkillGapResult | null>(null);
  const [tab, setTab] = useState<Tab>('skills');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [skillForm, setSkillForm] = useState({ skillName: '', level: 2, evidenceStatus: 'to_verify', evidenceUrl: '' });
  const [expForm, setExpForm] = useState<{ type: ExperienceDTO['type']; title: string; description: string; technologies: string; result: string; evidenceUrl: string }>({
    type: 'project', title: '', description: '', technologies: '', result: '', evidenceUrl: '',
  });
  const [expOpen, setExpOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  /** 头像上传：压缩为 ≤256px JPEG data URL（存 profile.avatar） */
  function onAvatarPicked(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, 256 / Math.max(img.width, img.height));
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
        saveProfile({ avatar: canvas.toDataURL('image/jpeg', 0.85) });
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  async function load() {
    setLoading(true);
    try {
      const [p, s, e, g] = await Promise.all([
        api<ProfileDTO | null>('/api/profile'),
        api<ProfileSkillDTO[]>('/api/skills'),
        api<ExperienceDTO[]>('/api/experiences'),
        api<SkillGapResult>('/api/skills/gap'),
      ]);
      setProfile(p);
      setSkills(s);
      setExperiences(e);
      setGap(g);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function saveProfile(p: Partial<ProfileDTO>) {
    setSaving(true);
    setMsg('');
    try {
      const merged = {
        nickname: profile?.nickname ?? '同学',
        grade: profile?.grade ?? 'sophomore',
        graduationDate: profile?.graduationDate ?? '2028-06-30',
        targetRole: profile?.targetRole ?? '',
        careerPath: profile?.careerPath ?? 'undecided',
        weeklyHours: profile?.weeklyHours ?? 8,
        mbti: profile?.mbti ?? null,
        avatar: profile?.avatar ?? null,
        ...p,
      };
      const updated = await api<ProfileDTO>('/api/profile', { method: 'PUT', json: merged });
      setProfile(updated);
      setMsg('资料已保存（Web 与手机端即刻同步）');
    } catch (e) {
      setErr(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  async function exportProfile() {
    const data = await api<Record<string, unknown>>('/api/profile/export');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pathpilot-profile-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMsg('资料已导出为 JSON 文件');
  }

  async function addSkill() {
    if (!skillForm.skillName.trim()) return;
    setSaving(true);
    try {
      await api('/api/skills', { method: 'POST', json: { ...skillForm, evidenceUrl: skillForm.evidenceUrl || undefined } });
      setSkillForm({ skillName: '', level: 2, evidenceStatus: 'to_verify', evidenceUrl: '' });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '添加失败');
    } finally {
      setSaving(false);
    }
  }

  async function removeSkill(id: number) {
    await api(`/api/skills/${id}`, { method: 'DELETE' }).catch(() => {});
    await load();
  }

  async function addExperience() {
    if (!expForm.title.trim()) return;
    setSaving(true);
    try {
      await api('/api/experiences', {
        method: 'POST',
        json: {
          type: expForm.type,
          title: expForm.title,
          description: expForm.description || undefined,
          technologies: expForm.technologies.split(/[，,、\s]+/).filter(Boolean),
          result: expForm.result || undefined,
          evidenceUrl: expForm.evidenceUrl || undefined,
        },
      });
      setExpForm({ type: 'project', title: '', description: '', technologies: '', result: '', evidenceUrl: '' });
      setExpOpen(false);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '添加失败');
    } finally {
      setSaving(false);
    }
  }

  async function removeExperience(id: number) {
    await api(`/api/experiences/${id}`, { method: 'DELETE' }).catch(() => {});
    await load();
  }

  if (loading) return <Loading />;
  return (
    <div className="pp-anim">
      <PageHeader title="能力档案" desc="个人资料与真实经历 · 未填信息标记为未知，不擅自补全" right={
        <button className="pp-btn pp-btn-ghost px-3 py-2 text-xs" onClick={exportProfile}>导出资料 JSON</button>
      } />
      {err && <div className="mb-4"><ErrorState message={err} onRetry={load} /></div>}
      {msg && <div className="mb-4 rounded-card bg-teal-soft px-4 py-3 text-sm text-teal">{msg}</div>}

      <div className="grid grid-cols-12 gap-5">
        {/* 基础资料 */}
        <div className="pp-card col-span-5 p-6">
          <div className="mb-4 text-sm font-bold">个人资料</div>
          {/* 头像 */}
          <div className="mb-4 flex items-center gap-4">
            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full bg-paper-2">
              {profile?.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.avatar} alt="头像" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xl font-bold text-slate-2">{(profile?.nickname ?? '同')[0]}</div>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <button className="pp-btn pp-btn-ghost px-3 py-1.5 text-xs" onClick={() => avatarInputRef.current?.click()} disabled={saving}>上传头像</button>
              {profile?.avatar && (
                <button className="text-left text-[11px] text-slate-2 hover:text-accent" onClick={() => saveProfile({ avatar: null })}>移除头像</button>
              )}
            </div>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onAvatarPicked(f);
                e.target.value = '';
              }}
            />
          </div>
          <div className="space-y-3 text-sm">
            <div>
              <label className="pp-label">昵称</label>
              <input className="pp-input" value={profile?.nickname ?? ''} onChange={(e) => setProfile(profile ? { ...profile, nickname: e.target.value } : profile)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="pp-label">学校</label>
                <input className="pp-input" value={profile?.school ?? ''} onChange={(e) => setProfile(profile ? { ...profile, school: e.target.value } : profile)} />
              </div>
              <div>
                <label className="pp-label">专业</label>
                <input className="pp-input" value={profile?.major ?? ''} onChange={(e) => setProfile(profile ? { ...profile, major: e.target.value } : profile)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="pp-label">当前年级</label>
                <select className="pp-input" value={profile?.grade ?? 'sophomore'} onChange={(e) => setProfile(profile ? { ...profile, grade: e.target.value as never } : profile)}>
                  {GRADES.map((g) => <option key={g} value={g}>{GRADE_LABELS[g]}</option>)}
                </select>
              </div>
              <div>
                <label className="pp-label">预计毕业（年月）</label>
                <input
                  className="pp-input"
                  type="month"
                  value={(profile?.graduationDate ?? '').slice(0, 7)}
                  onChange={(e) => setProfile(profile ? { ...profile, graduationDate: e.target.value ? `${e.target.value}-01` : profile.graduationDate } : profile)}
                />
              </div>
            </div>
            <div>
              <label className="pp-label">目标岗位</label>
              <input className="pp-input" value={profile?.targetRole ?? ''} onChange={(e) => setProfile(profile ? { ...profile, targetRole: e.target.value } : profile)} placeholder="Java 后端开发" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="pp-label">发展路径</label>
                <select className="pp-input" value={profile?.careerPath ?? 'undecided'} onChange={(e) => setProfile(profile ? { ...profile, careerPath: e.target.value as never } : profile)}>
                  {CAREER_PATHS.map((p) => <option key={p} value={p}>{CAREER_PATH_LABELS[p]}</option>)}
                </select>
              </div>
              <div>
                <label className="pp-label">MBTI（供 AI 针对性建议）</label>
                <select className="pp-input" value={profile?.mbti ?? ''} onChange={(e) => setProfile(profile ? { ...profile, mbti: e.target.value || null } : profile)}>
                  <option value="">未测 / 不填写</option>
                  {MBTI_OPTIONS.filter(Boolean).map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="pp-label">每周可投入（小时）</label>
              <input className="pp-input" type="number" min={1} max={80} value={profile?.weeklyHours ?? 8} onChange={(e) => setProfile(profile ? { ...profile, weeklyHours: Number(e.target.value) } : profile)} />
            </div>
            <button className="pp-btn pp-btn-primary w-full py-2.5 text-xs" onClick={() => saveProfile({})} disabled={saving}>保存资料</button>
          </div>

          {gap && gap.sample_count > 0 && gap.core_skills.length > 0 && (
            <div className="mt-6 border-t border-line pt-4">
              <div className="mb-2 text-sm font-bold">能力雷达 <span className="text-xs font-normal text-slate-1">（证据状态，非虚构熟练度）</span></div>
              <SkillRadar
                indicators={gap.core_skills.slice(0, 6).map((s) => ({ name: s.skill, max: 3 }))}
                values={gap.core_skills.slice(0, 6).map((s) => (s.user_status === 'evidenced' ? 3 : s.user_status === 'to_verify' ? 2 : s.user_status === 'needs_improvement' ? 1 : 0))}
              />
            </div>
          )}
        </div>

        {/* 技能与经历 */}
        <div className="col-span-7">
          <div className="pp-card p-6">
            <div className="mb-4 flex gap-1 rounded-xl bg-paper-2 p-1 text-xs font-semibold">
              {([['skills', '技能'], ['courses', '课程'], ['projects', '项目'], ['contests', '竞赛/实践']] as [Tab, string][]).map(([k, label]) => (
                <button key={k} className={`flex-1 rounded-lg py-2 transition ${tab === k ? 'bg-white shadow-sm' : 'text-slate-1'}`} onClick={() => setTab(k)}>{label}</button>
              ))}
            </div>

            {tab === 'skills' && (
              <div>
                <div className="mb-3 flex gap-2">
                  <input className="pp-input flex-1" placeholder="技能名（如 Spring Boot）" value={skillForm.skillName} onChange={(e) => setSkillForm({ ...skillForm, skillName: e.target.value })} />
                  <select className="pp-input w-24" value={skillForm.level} onChange={(e) => setSkillForm({ ...skillForm, level: Number(e.target.value) })}>
                    {[0, 1, 2, 3, 4, 5].map((l) => <option key={l} value={l}>Lv{l}</option>)}
                  </select>
                  <select className="pp-input w-28" value={skillForm.evidenceStatus} onChange={(e) => setSkillForm({ ...skillForm, evidenceStatus: e.target.value })}>
                    {EVIDENCE_STATUSES.map((s) => <option key={s} value={s}>{EVIDENCE_STATUS_LABELS[s]}</option>)}
                  </select>
                  <button className="pp-btn pp-btn-primary px-4 text-xs" onClick={addSkill} disabled={saving}>添加</button>
                </div>
                <input className="pp-input mb-3 text-xs" placeholder="证据链接（可选，如 GitHub/证书地址）——有证据才标记「已有证据」" value={skillForm.evidenceUrl} onChange={(e) => setSkillForm({ ...skillForm, evidenceUrl: e.target.value })} />
                {skills.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-1">还没有技能记录</div>
                ) : (
                  (['professional', 'general'] as const).map((group) => {
                    const groupSkills = skills.filter((s) => skillGroupOf(s.category) === group);
                    if (!groupSkills.length) return null;
                    return (
                      <div key={group} className="mb-3">
                        <div className="mb-1 flex items-center gap-2 text-[11px] font-bold text-slate-1">
                          <span className={`rounded-full px-2 py-0.5 ${group === 'professional' ? 'bg-accent-soft text-accent' : 'bg-teal-soft text-teal'}`}>{SKILL_GROUP_LABELS[group]}</span>
                          <span className="text-slate-2">{groupSkills.length} 项</span>
                        </div>
                        <ul className="divide-y divide-line">
                          {groupSkills.map((s) => (
                            <li key={s.id} className="flex items-center justify-between py-2.5 text-sm">
                              <span className="flex items-center gap-2">
                                <span className="font-semibold">{s.name}</span>
                                <span className="font-mono text-xs text-slate-2">Lv{s.level}</span>
                                <Tag tone={s.evidenceStatus === 'evidenced' ? 'teal' : s.evidenceStatus === 'to_verify' ? 'amber' : 'slate'}>{EVIDENCE_STATUS_LABELS[s.evidenceStatus]}</Tag>
                                {s.evidenceUrl && <a className="text-xs text-accent underline" href={s.evidenceUrl} target="_blank" rel="noreferrer">证据</a>}
                              </span>
                              <button className="text-xs text-slate-2 hover:text-accent" onClick={() => removeSkill(s.id)}>删除</button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {tab !== 'skills' && (
              <div>
                <div className="mb-3 flex justify-end">
                  <button className="pp-btn pp-btn-ghost px-3 py-1.5 text-xs" onClick={() => setExpOpen(!expOpen)}>{expOpen ? '收起' : '+ 添加经历'}</button>
                </div>
                {expOpen && (
                  <div className="mb-4 space-y-2 rounded-xl bg-paper-2/60 p-4">
                    <div className="flex gap-2">
                      <select className="pp-input w-36" value={expForm.type} onChange={(e) => setExpForm({ ...expForm, type: e.target.value as never })}>
                        {EXPERIENCE_TYPES.filter((t) => (tab === 'courses' ? t === 'course' : tab === 'projects' ? t === 'project' : t === 'contest' || t === 'internship' || t === 'practice')).map((t) => (
                          <option key={t} value={t}>{EXPERIENCE_TYPE_LABELS[t]}</option>
                        ))}
                      </select>
                      <input className="pp-input flex-1" placeholder="名称" value={expForm.title} onChange={(e) => setExpForm({ ...expForm, title: e.target.value })} />
                    </div>
                    <textarea className="pp-input text-xs" placeholder="描述（你做了什么，只写真实内容）" value={expForm.description} onChange={(e) => setExpForm({ ...expForm, description: e.target.value })} />
                    <div className="flex gap-2">
                      <input className="pp-input flex-1 text-xs" placeholder="技术栈（逗号分隔）" value={expForm.technologies} onChange={(e) => setExpForm({ ...expForm, technologies: e.target.value })} />
                      <input className="pp-input flex-1 text-xs" placeholder="成果（真实结果，不虚构数字）" value={expForm.result} onChange={(e) => setExpForm({ ...expForm, result: e.target.value })} />
                    </div>
                    <input className="pp-input text-xs" placeholder="证明链接（GitHub/文档，可选）" value={expForm.evidenceUrl} onChange={(e) => setExpForm({ ...expForm, evidenceUrl: e.target.value })} />
                    <button className="pp-btn pp-btn-primary px-4 py-1.5 text-xs" onClick={addExperience} disabled={saving || !expForm.title}>保存经历</button>
                  </div>
                )}
                {experiences.filter((e) => (tab === 'courses' ? e.type === 'course' : tab === 'projects' ? e.type === 'project' : ['contest', 'internship', 'practice'].includes(e.type))).length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-1">暂无记录</div>
                ) : (
                  <ul className="space-y-3">
                    {experiences
                      .filter((e) => (tab === 'courses' ? e.type === 'course' : tab === 'projects' ? e.type === 'project' : ['contest', 'internship', 'practice'].includes(e.type)))
                      .map((e) => (
                        <li key={e.id} className="rounded-xl border border-line p-4 text-sm">
                          <div className="flex items-center justify-between">
                            <span className="font-bold">{e.title}</span>
                            <button className="text-xs text-slate-2 hover:text-accent" onClick={() => removeExperience(e.id)}>删除</button>
                          </div>
                          {e.description && <p className="mt-1 text-xs leading-5 text-slate-1">{e.description}</p>}
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            <Tag tone="slate">{EXPERIENCE_TYPE_LABELS[e.type]}</Tag>
                            {e.technologies.map((t) => <Tag key={t} tone="amber">{t}</Tag>)}
                            {e.result && <span className="text-xs text-slate-1">成果：{e.result}</span>}
                            {e.evidenceUrl && <a className="text-xs text-accent underline" href={e.evidenceUrl} target="_blank" rel="noreferrer">证明链接</a>}
                          </div>
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {/* 缺口建议 */}
          {gap && gap.learning_order.length > 0 && (
            <div className="pp-card mt-5 p-6">
              <div className="mb-2 text-sm font-bold">缺口与建议学习顺序 <span className="text-xs font-normal text-slate-1">基于 {gap.sample_count} 条真实岗位样本</span></div>
              <div className="mb-3 flex flex-wrap gap-2">
                {gap.learning_order.map((s, i) => (
                  <span key={s} className="flex items-center gap-1 rounded-full bg-paper-2 px-3 py-1 text-xs">
                    <span className="font-mono font-bold text-accent">{i + 1}</span> {s}
                  </span>
                ))}
              </div>
              <div className="text-xs leading-5 text-slate-1">{gap.rationale}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
