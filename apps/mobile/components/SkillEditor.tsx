// 个人档案中的技能与证据管理，使用现有技能接口并与「我的」页统计共用数据。
import { useEffect, useState } from 'react';
import { Alert, Text, TextInput, TouchableOpacity, View, type TextInputInstance } from 'react-native';
import { EVIDENCE_STATUSES, EVIDENCE_STATUS_LABELS, profileSkillInput, type EvidenceStatus, type ProfileSkillDTO, type SkillCatalogItem } from '@pathpilot/shared';
import { api } from '../lib/api';
import { C, SF, Btn, useSettings } from './ui';

type FocusProps = (key: string) => { ref: (input: TextInputInstance | null) => void; onFocus: () => void; editable: boolean };
type Form = { name: string; level: number; status: EvidenceStatus; description: string; url: string };
const emptyForm = (): Form => ({ name: '', level: 2, status: 'to_verify', description: '', url: '' });

// 与服务端技能词典的精确归一化规则一致，避免添加别名时覆盖现有记录。
function cleanTerm(raw: string) {
  let value = raw.trim().toLowerCase();
  for (const suffix of ['开发', '编程', '基础', '能力', '熟练使用', '熟悉', '掌握', '了解']) {
    if (value.endsWith(suffix) && value.length > suffix.length + 1) value = value.slice(0, -suffix.length).trim();
  }
  return value.replace(/[，,、；;。.\s]+/g, '');
}

export function SkillEditor({ focusProps }: { focusProps: FocusProps }) {
  const { fs } = useSettings();
  const [skills, setSkills] = useState<ProfileSkillDTO[]>([]);
  const [catalog, setCatalog] = useState<SkillCatalogItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [form, setForm] = useState<Form>(emptyForm);
  const [error, setError] = useState('');

  async function load() {
    try {
      const [rows, terms] = await Promise.all([api<ProfileSkillDTO[]>('/api/skills'), api<SkillCatalogItem[]>('/api/skills/catalog')]);
      setSkills(rows);
      setCatalog(terms);
      setLoaded(true);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '技能加载失败，请重试');
    }
  }
  useEffect(() => {
    let active = true;
    Promise.all([api<ProfileSkillDTO[]>('/api/skills'), api<SkillCatalogItem[]>('/api/skills/catalog')])
      .then(([rows, terms]) => {
        if (!active) return;
        setSkills(rows);
        setCatalog(terms);
        setLoaded(true);
      })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : '技能加载失败，请重试'); });
    return () => { active = false; };
  }, []);

  function edit(skill: ProfileSkillDTO) {
    setForm({ name: skill.name, level: skill.level, status: skill.evidenceStatus, description: skill.evidenceDescription ?? '', url: skill.evidenceUrl ?? '' });
    setEditing(skill.id);
    setError('');
  }

  async function save() {
    if (busy || editing === null) return;
    const name = form.name.trim();
    const description = form.description.trim();
    const url = form.url.trim();
    const payload = { skillName: name, level: form.level, evidenceStatus: form.status, ...(description ? { evidenceDescription: description } : {}), ...(url ? { evidenceUrl: url } : {}) };
    if (!profileSkillInput.safeParse(payload).success) {
      setError(!name ? '请填写技能名称' : '请检查证据链接格式，需填写完整网址');
      return;
    }
    if (form.status === 'evidenced' && !description && !url) {
      setError('选择“已有证据”时，请填写证据说明或链接');
      return;
    }
    if (editing === 'new') {
      const aliasMap = new Map<string, number>();
      for (const term of catalog) {
        aliasMap.set(cleanTerm(term.name), term.id);
        for (const alias of term.aliases) if (!aliasMap.has(cleanTerm(alias))) aliasMap.set(cleanTerm(alias), term.id);
      }
      const skillId = aliasMap.get(cleanTerm(name));
      if (skills.some((s) => s.skillId === skillId || s.name === name)) {
        setError('该技能已存在，请在下方选择编辑');
        return;
      }
    }
    setBusy(true);
    setError('');
    try {
      await api(editing === 'new' ? '/api/skills' : `/api/skills/${editing}`, {
        method: editing === 'new' ? 'POST' : 'PATCH',
        json: editing === 'new' ? payload : { level: form.level, evidenceStatus: form.status, evidenceDescription: description, evidenceUrl: url || null },
      });
      setEditing(null);
      setForm(emptyForm());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败，请重试');
    } finally { setBusy(false); }
  }

  function remove(skill: ProfileSkillDTO) {
    Alert.alert('删除技能', `确定删除“${skill.name}”及其证据记录吗？`, [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: async () => {
        setBusy(true);
        try {
          await api(`/api/skills/${skill.id}`, { method: 'DELETE' });
          if (editing === skill.id) setEditing(null);
          await load();
        } catch (err) { setError(err instanceof Error ? err.message : '删除失败，请重试'); }
        finally { setBusy(false); }
      } },
    ]);
  }

  const inputStyle = { ...SF.input, paddingHorizontal: 12, paddingVertical: 10, fontSize: fs(13), color: C.ink };
  const labelStyle = { fontSize: fs(12), fontWeight: '600' as const, color: C.slate, marginBottom: 6 };
  return (
    <View style={{ gap: 8 }}>
      <Text style={labelStyle}>技能与证据</Text>
      <Text style={{ fontSize: fs(11), color: C.slate2 }}>记录技能，并用项目、课程或证书说明及链接作为证据。</Text>
      {error ? <Text accessibilityRole="alert" style={{ color: C.amber, fontSize: fs(12) }}>{error}</Text> : null}
      {!loaded ? <Btn title="重新加载技能" kind="ghost" onPress={load} /> : (
        <>
          {skills.map((skill) => (
            <View key={skill.id} style={{ ...SF.inset, padding: 10, gap: 6 }}>
              <Text style={{ color: C.ink, fontSize: fs(13), fontWeight: '700' }}>{skill.name} · Lv{skill.level} · {EVIDENCE_STATUS_LABELS[skill.evidenceStatus]}</Text>
              {skill.evidenceDescription ? <Text style={{ color: C.slate, fontSize: fs(12) }}>{skill.evidenceDescription}</Text> : null}
              {skill.evidenceUrl ? <Text style={{ color: C.slate, fontSize: fs(11) }} numberOfLines={2}>{skill.evidenceUrl}</Text> : null}
              <View style={{ flexDirection: 'row', gap: 16 }}>
                <TouchableOpacity disabled={busy} onPress={() => edit(skill)} accessibilityRole="button"><Text style={{ color: C.accent, fontSize: fs(12) }}>编辑</Text></TouchableOpacity>
                <TouchableOpacity disabled={busy} onPress={() => remove(skill)} accessibilityRole="button"><Text style={{ color: C.amber, fontSize: fs(12) }}>删除</Text></TouchableOpacity>
              </View>
            </View>
          ))}
          {editing === null ? <Btn title="添加技能与证据" kind="ghost" disabled={busy} onPress={() => { setForm(emptyForm()); setEditing('new'); setError(''); }} /> : (
            <View style={{ ...SF.inset, padding: 12, gap: 10 }}>
              <Text style={{ color: C.ink, fontSize: fs(13), fontWeight: '700' }}>{editing === 'new' ? '添加技能' : '编辑技能'}</Text>
              <View><Text style={labelStyle}>技能名称</Text><TextInput {...focusProps('skillName')} accessibilityLabel="技能名称" editable={editing === 'new' && !busy} style={inputStyle} value={form.name} onChangeText={(name) => setForm((prev) => ({ ...prev, name }))} maxLength={60} placeholder="例如 Java" placeholderTextColor={C.slate2} /></View>
              <View><Text style={labelStyle}>熟练程度（0-5）</Text><View style={{ flexDirection: 'row', gap: 6 }}>{[0, 1, 2, 3, 4, 5].map((level) => <TouchableOpacity key={level} disabled={busy} onPress={() => setForm((prev) => ({ ...prev, level }))} style={{ ...SF.chip, flex: 1, alignItems: 'center', backgroundColor: form.level === level ? C.accent : C.group }}><Text style={{ color: form.level === level ? C.onAccent : C.slate }}>{level}</Text></TouchableOpacity>)}</View></View>
              <View><Text style={labelStyle}>证据状态</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{EVIDENCE_STATUSES.map((status) => <TouchableOpacity key={status} disabled={busy} onPress={() => setForm((prev) => ({ ...prev, status }))} style={{ ...SF.chip, paddingHorizontal: 10, backgroundColor: form.status === status ? C.accent : C.group }}><Text style={{ color: form.status === status ? C.onAccent : C.slate, fontSize: fs(11) }}>{EVIDENCE_STATUS_LABELS[status]}</Text></TouchableOpacity>)}</View></View>
              <View><Text style={labelStyle}>证据说明（选填）</Text><TextInput {...focusProps('skillEvidence')} accessibilityLabel="证据说明" editable={!busy} style={inputStyle} value={form.description} onChangeText={(description) => setForm((prev) => ({ ...prev, description }))} maxLength={500} multiline placeholder="例如课程项目或证书" placeholderTextColor={C.slate2} /></View>
              <View><Text style={labelStyle}>证据链接（选填）</Text><TextInput {...focusProps('skillUrl')} accessibilityLabel="证据链接" editable={!busy} style={inputStyle} value={form.url} onChangeText={(url) => setForm((prev) => ({ ...prev, url }))} autoCapitalize="none" keyboardType="url" placeholder="https://..." placeholderTextColor={C.slate2} /></View>
              <Text style={{ color: C.slate2, fontSize: fs(11) }}>填写后请点击保存技能。</Text>
              <Btn title={busy ? '保存中…' : '保存技能'} disabled={busy} onPress={save} />
              <Btn title="取消" kind="ghost" disabled={busy} onPress={() => { setEditing(null); setError(''); }} />
            </View>
          )}
        </>
      )}
    </View>
  );
}
