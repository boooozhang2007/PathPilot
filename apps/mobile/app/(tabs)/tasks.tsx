// 任务：详情弹层（滚动修复+对齐）/ 任务说明编辑 / 删除与批量删除 / 开始·暂停跟踪
import { useCallback, useState } from 'react';
import { ScrollView, View, Text, TextInput, Modal, RefreshControl, TouchableOpacity, Pressable, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { api } from '../../lib/api';
import { C, SF, Card, Tag, Loading, ErrorBox, EmptyBox, Btn, Body, useSettings } from '../../components/ui';
import { Icon } from '../../components/icons';
import type { RoadmapTaskDTO } from '@pathpilot/shared';
import { TASK_STATUS_LABELS, PRIORITY_LABELS, GRADE_TO_CURRENT_SEMESTER } from '@pathpilot/shared';
import { toLocalDateStr, todayLocal } from '../../lib/date';

type View2 = 'today' | 'week' | 'all';

/** profile 不可用时「本学期」视图的兜底学期（与 other 年级一致） */
const FALLBACK_SEMESTER = GRADE_TO_CURRENT_SEMESTER.other;

export default function TasksTab() {
  const { fs } = useSettings();
  const [tasks, setTasks] = useState<RoadmapTaskDTO[]>([]);
  const [view, setView] = useState<View2>('today');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [detail, setDetail] = useState<RoadmapTaskDTO | null>(null);
  const [evUrl, setEvUrl] = useState('');
  const [evNote, setEvNote] = useState('');
  const [evHours, setEvHours] = useState('');
  const [noteMax, setNoteMax] = useState(false); // 成果说明放大编辑
  const [syncFail, setSyncFail] = useState('');
  const [curSemester, setCurSemester] = useState<number | null>(FALLBACK_SEMESTER);
  // 说明编辑 / 批量管理
  const [descDraft, setDescDraft] = useState<string | null>(null);
  const [manage, setManage] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const load = useCallback(() => {
    Promise.all([api<RoadmapTaskDTO[]>('/api/tasks'), api<{ grade?: string } | null>('/api/profile').catch(() => null)])
      .then(([t, p]) => {
        setTasks(t);
        // 冲突后刷新详情的版本号，让保留的编辑草稿可以再次提交。
        setDetail((current) => current ? t.find((task) => task.id === current.id) ?? null : null);
        // 共享的年级→学期映射；profile 不可用时回退到 FALLBACK_SEMESTER，避免「本学期」视图恒空
        const grade = p?.grade as keyof typeof GRADE_TO_CURRENT_SEMESTER | undefined;
        setCurSemester(grade ? GRADE_TO_CURRENT_SEMESTER[grade] ?? FALLBACK_SEMESTER : FALLBACK_SEMESTER);
        setErr('');
      })
      .catch((e) => setErr(e instanceof Error ? e.message : '加载失败'))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function update(task: RoadmapTaskDTO, patch: Record<string, unknown>) {
    setSyncFail('');
    try {
      const updated = await api<RoadmapTaskDTO>(`/api/tasks/${task.id}`, { method: 'PATCH', json: { ...patch, expectedUpdatedAt: task.updatedAt } });
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      setDetail((d) => (d && d.id === updated.id ? updated : d));
      return true;
    } catch (e) {
      setSyncFail(e instanceof Error ? e.message : '未同步：更新失败，请重试');
      load();
      return false;
    }
  }

  async function saveEvidence() {
    if (!detail) return;
    // 实际小时：先校验再提交，挡住空白串（Number(' ')===0）与非法数字（'1.2.3'→NaN）
    let actualHours: number | undefined;
    if (evHours.trim() !== '') {
      const n = Number(evHours);
      if (!Number.isFinite(n) || n < 0 || n > 500) {
        setSyncFail('实际小时需为 0-500 之间的数字');
        return;
      }
      actualHours = n;
    }
    await update(detail, {
      ...(evUrl ? { evidenceUrl: evUrl } : {}),
      ...(evNote ? { resultNote: evNote } : {}),
      ...(actualHours !== undefined ? { actualHours } : {}),
    });
  }

  async function saveDescription() {
    if (!detail || descDraft === null || !descDraft.trim()) return;
    if (await update(detail, { description: descDraft.trim() })) setDescDraft(null);
  }

  function removeTask(task: RoadmapTaskDTO) {
    Alert.alert('删除任务', `「${task.title}」将被删除，不可恢复。确定？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '确认删除',
        style: 'destructive',
        onPress: async () => {
          try {
            await api(`/api/tasks/${task.id}`, { method: 'DELETE' });
            setTasks((prev) => prev.filter((t) => t.id !== task.id));
            setDetail(null);
            setSelected((prev) => {
              const n = new Set(prev);
              n.delete(task.id);
              return n;
            });
          } catch (e) {
            setSyncFail(e instanceof Error ? e.message : '删除失败');
          }
        },
      },
    ]);
  }

  function removeSelected() {
    const ids = [...selected];
    if (!ids.length) return;
    Alert.alert('批量删除', `将删除 ${ids.length} 个任务，不可恢复。确定？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '确认删除',
        style: 'destructive',
        onPress: async () => {
          try {
            await api('/api/tasks/batch-delete', { method: 'POST', json: { ids } });
            setSelected(new Set());
            setManage(false);
            load();
          } catch (e) {
            setSyncFail(e instanceof Error ? e.message : '批量删除失败');
          }
        },
      },
    ]);
  }

  if (loading) return <Loading />;
  const inputSt = { ...SF.input, paddingHorizontal: 12, paddingVertical: 10, fontSize: fs(13), color: C.ink, marginBottom: 10 };
  const today = todayLocal();
  const visible =
    view === 'all' ? tasks : view === 'week' ? tasks.filter((t) => t.semester === curSemester) : tasks.filter((t) => t.status === 'in_progress' || (t.completedAt ? toLocalDateStr(t.completedAt) === today : false));

  return (
    <View style={{ flex: 1, ...SF.page, paddingTop: 54 }}>
      <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: C.ink }}>任务</Text>
          {tasks.length > 0 && (
            <TouchableOpacity
              style={{ ...SF.raised, flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, borderColor: manage ? C.accent : C.line, backgroundColor: manage ? C.accentSoft : 'transparent', paddingHorizontal: 11, paddingVertical: 5 }}
              onPress={() => {
                setManage((v) => !v);
                setSelected(new Set());
              }}
            >
              <Icon name={manage ? 'close' : 'checkCircle'} size={13} color={manage ? C.accent : C.slate} />
              <Text style={{ fontSize: fs(12), fontWeight: '600', color: manage ? C.accent : C.slate }}>{manage ? '退出管理' : '批量管理'}</Text>
            </TouchableOpacity>
          )}
        </View>
        {syncFail ? (
          <View style={{ backgroundColor: C.amberSoft, borderRadius: 10, padding: 10, marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon name="warn" size={13} color={C.amber} />
            <Text style={{ color: C.amber, fontSize: fs(12), flex: 1 }}>{syncFail}</Text>
          </View>
        ) : null}
        <View style={{ ...SF.inset, flexDirection: 'row', padding: 3, marginTop: 12, borderRadius: 12 }}>
          {([['today', '今日'], ['week', '本学期'], ['all', '全部']] as [View2, string][]).map(([k, label]) => {
            const active = view === k;
            return (
              <TouchableOpacity
                key={k}
                style={{ flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center', ...(active ? { ...SF.raised, borderWidth: 0 } : {}) }}
                onPress={() => setView(k)}
              >
                <Text style={{ fontWeight: '600', fontSize: 13, color: active ? C.ink : C.slate }}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* 批量删除操作条 */}
      {manage && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingBottom: 10 }}>
          <TouchableOpacity style={{ borderRadius: 10, borderWidth: 1, borderColor: C.line, paddingHorizontal: 12, paddingVertical: 7 }} onPress={() => setSelected(new Set(visible.map((t) => t.id)))}>
            <Text style={{ fontSize: fs(12), color: C.ink, fontWeight: '600' }}>全选</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{ borderRadius: 10, backgroundColor: selected.size ? '#E5484D' : C.slate2, paddingHorizontal: 12, paddingVertical: 7, flexDirection: 'row', alignItems: 'center', gap: 5 }}
            disabled={!selected.size}
            onPress={removeSelected}
          >
            <Icon name="trash" size={13} color="#FFFFFF" />
            <Text style={{ fontSize: fs(12), color: '#FFFFFF', fontWeight: '700' }}>删除所选（{selected.size}）</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: fs(10), color: C.slate2, flex: 1 }}>完成前后均可删除</Text>
        </View>
      )}

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); setTimeout(() => setRefreshing(false), 800); }} tintColor={C.accent} />}>
        {err ? <ErrorBox message={err} onRetry={load} /> : null}
        {visible.length === 0 ? (
          <EmptyBox title="暂无任务" hint="下拉刷新；也可在 AI 顾问中让 Agent 添加任务" />
        ) : (
          visible.map((t) => (
            <Card key={t.id} style={{ marginBottom: 10, ...(manage && selected.has(t.id) ? { borderWidth: 2, borderColor: C.accent } : {}) }}>
              <TouchableOpacity
                onPress={() => {
                  if (manage) {
                    setSelected((prev) => {
                      const n = new Set(prev);
                      if (n.has(t.id)) n.delete(t.id);
                      else n.add(t.id);
                      return n;
                    });
                  } else {
                    setDetail(t);
                    setDescDraft(null);
                    setEvUrl(t.evidenceUrl ?? '');
                    setEvNote(t.resultNote ?? '');
                    setEvHours(t.actualHours != null ? String(t.actualHours) : '');
                  }
                }}
              >
                {manage && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <View style={{ width: 18, height: 18, borderRadius: 5, borderWidth: 1.5, borderColor: selected.has(t.id) ? C.accent : C.line, backgroundColor: selected.has(t.id) ? C.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                      {selected.has(t.id) && <Icon name="check" size={11} color="#FFFFFF" strokeWidth={3} />}
                    </View>
                    <Text style={{ fontSize: fs(11), color: C.slate }}>{selected.has(t.id) ? '已选' : '点击选择'}</Text>
                  </View>
                )}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: C.ink }} numberOfLines={2}>
                    {t.parentTaskId ? '↳ ' : ''}{t.title}
                  </Text>
                  <Tag tone={t.status === 'done' ? 'teal' : t.status === 'in_progress' ? 'accent' : t.status === 'deferred' ? 'amber' : 'slate'}>
                    {TASK_STATUS_LABELS[t.status]}
                  </Tag>
                </View>
                {t.parentTaskId ? <Text style={{ fontSize: fs(10), color: C.accent, marginTop: 4 }}>子任务 · 跟随父任务推进</Text> : null}
                {/* 详细说明板块 */}
                {t.description ? (
                  <Text style={{ fontSize: 12, color: C.slate, lineHeight: 18, marginTop: 6 }} numberOfLines={2}>
                    {t.description}
                  </Text>
                ) : null}
                <Text style={{ fontSize: 12, color: C.slate2, marginTop: 6 }}>
                  预计 {t.estimatedHours}h · 优先级{PRIORITY_LABELS[t.priority]}{t.actualHours != null ? ` · 实际 ${t.actualHours}h` : ''}
                </Text>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  {/* 跟踪：开始/暂停 */}
                  {t.status === 'not_started' && (
                    <Btn title="开始跟踪" kind="ghost" onPress={() => update(t, { status: 'in_progress' })} style={{ paddingVertical: 6, paddingHorizontal: 12 }} />
                  )}
                  {t.status === 'in_progress' && (
                    <>
                      <Btn title="暂停" kind="ghost" onPress={() => update(t, { status: 'not_started' })} style={{ paddingVertical: 6, paddingHorizontal: 12 }} />
                      <Btn title="完成" kind="teal" onPress={() => update(t, { status: 'done', actualHours: t.actualHours ?? t.estimatedHours })} style={{ paddingVertical: 6, paddingHorizontal: 12 }} />
                    </>
                  )}
                  {t.status === 'deferred' && (
                    <Btn title="恢复跟踪" kind="ghost" onPress={() => update(t, { status: 'in_progress' })} style={{ paddingVertical: 6, paddingHorizontal: 12 }} />
                  )}
                  {t.status !== 'done' && t.status !== 'deferred' && (
                    <Btn title="延期" kind="ghost" onPress={() => update(t, { status: 'deferred', deferredReason: '手机端标记延期' })} style={{ paddingVertical: 6, paddingHorizontal: 12 }} />
                  )}
                  {!manage && (
                    <TouchableOpacity style={{ paddingVertical: 6, paddingHorizontal: 12, alignItems: 'center' }} onPress={() => removeTask(t)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                      <Icon name="trash" size={15} color="#E5484D" />
                    </TouchableOpacity>
                  )}
                  {t.evidenceUrl ? <Tag tone="teal">有成果</Tag> : null}
                </View>
              </TouchableOpacity>
            </Card>
          ))
        )}
      </ScrollView>

      {/* 任务详情/成果记录：内容可滚动（修复关闭行溢出透明背景）；点击上方空白处关闭 */}
      <Modal visible={!!detail} animationType="slide" transparent onRequestClose={() => setDetail(null)}>
        <Pressable style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(11,34,57,0.35)' }} onPress={() => setDetail(null)}>
          <Pressable onPress={(e) => e.stopPropagation()}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ ...SF.sheet, maxHeight: '86%' }}>
              {detail ? (
                <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 28 }} keyboardShouldPersistTaps="handled">
                  <View style={{ width: 40, height: 4, borderRadius: 999, backgroundColor: C.line, alignSelf: 'center', marginBottom: 12 }} />
                  <Text style={{ fontSize: 16, fontWeight: '800', color: C.ink, marginBottom: 8 }}>{detail.title}</Text>
                  {syncFail ? <Text style={{ color: C.amber, fontSize: fs(12), marginBottom: 12 }}>{syncFail}</Text> : null}

                  {/* 任务说明（可编辑） */}
                  {descDraft === null ? (
                    <TouchableOpacity onPress={() => setDescDraft(detail.description)} style={{ marginBottom: 12 }}>
                      <Body muted>{detail.description}</Body>
                      <Text style={{ fontSize: fs(11), color: C.accent, marginTop: 4, fontWeight: '600' }}>编辑任务说明</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={{ marginBottom: 12 }}>
                      <TextInput
                        style={[inputSt, { minHeight: 80, textAlignVertical: 'top' }]}
                        value={descDraft}
                        onChangeText={setDescDraft}
                        multiline
                        placeholder="任务详细说明：做法步骤、学习资源、参考例子"
                        placeholderTextColor={C.slate2}
                      />
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                        <Btn title="保存说明" onPress={saveDescription} style={{ paddingVertical: 7, paddingHorizontal: 14 }} />
                        <Btn title="取消" kind="ghost" onPress={() => setDescDraft(null)} style={{ paddingVertical: 7, paddingHorizontal: 14 }} />
                      </View>
                    </View>
                  )}

                  <View style={{ ...SF.inset, padding: 10, marginBottom: 8 }}>
                    <Text style={{ fontSize: 12, color: C.ink, lineHeight: 18 }}><Text style={{ fontWeight: '700' }}>产出：</Text>{detail.deliverable}</Text>
                  </View>
                  <View style={{ ...SF.inset, padding: 10, marginBottom: 14 }}>
                    <Text style={{ fontSize: 12, color: C.ink, lineHeight: 18 }}><Text style={{ fontWeight: '700' }}>验收：</Text>{detail.acceptanceCriteria}</Text>
                  </View>

                  <Text style={{ fontSize: 13, fontWeight: '700', color: C.ink, marginBottom: 8 }}>记录学习成果</Text>
                  <TextInput style={inputSt} placeholder="成果链接（GitHub/部署地址）" placeholderTextColor={C.slate2} value={evUrl} onChangeText={setEvUrl} autoCapitalize="none" />
                  {/* 成果说明 + 实际小时：同行等高对齐 */}
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'stretch' }}>
                    <View style={{ flex: 1 }}>
                      <TextInput
                        style={[inputSt, { minHeight: 60, textAlignVertical: 'top', marginBottom: 0 }]}
                        placeholder="成果说明"
                        placeholderTextColor={C.slate2}
                        value={evNote}
                        onChangeText={setEvNote}
                        multiline
                      />
                      <TouchableOpacity onPress={() => setNoteMax(true)} style={{ position: 'absolute', right: 8, bottom: 10 }}>
                        <Icon name="expand" size={16} color={C.slate2} />
                      </TouchableOpacity>
                    </View>
                    <TextInput
                      style={[inputSt, { width: 90, minHeight: 60, textAlignVertical: 'top' }]}
                      placeholder="实际小时"
                      placeholderTextColor={C.slate2}
                      value={evHours}
                      onChangeText={setEvHours}
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={{ height: 10 }} />
                  <Btn title="保存成果" onPress={saveEvidence} style={{ marginBottom: 8 }} />
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Btn title="删除任务" kind="danger" onPress={() => removeTask(detail)} style={{ flex: 1 }} />
                    <Btn title="关闭" kind="ghost" onPress={() => setDetail(null)} style={{ flex: 1 }} />
                  </View>
                </ScrollView>
              ) : null}
            </KeyboardAvoidingView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* 成果说明放大编辑 */}
      <Modal visible={noteMax} animationType="fade" onRequestClose={() => setNoteMax(false)}>
        <View style={{ flex: 1, ...SF.page, paddingTop: 54, paddingHorizontal: 16 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: C.ink }}>成果说明</Text>
            <TouchableOpacity onPress={() => setNoteMax(false)} style={{ padding: 6 }}>
              <Icon name="collapse" size={16} color={C.accent} />
            </TouchableOpacity>
          </View>
          <TextInput
            style={{ ...SF.input, flex: 1, padding: 14, fontSize: 14, color: C.ink, textAlignVertical: 'top' }}
            value={evNote}
            onChangeText={setEvNote}
            multiline
            autoFocus
            placeholder="写下这个任务的真实成果：做了什么、用什么技术、结果如何…"
            placeholderTextColor={C.slate2}
          />
        </View>
      </Modal>
    </View>
  );
}

