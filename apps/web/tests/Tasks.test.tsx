import { act } from 'react';
import { create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, expect, it, vi } from 'vitest';
import TasksPage from '../app/(main)/tasks/page';
import { api } from '../lib/api';

vi.mock('../lib/api', () => ({ api: vi.fn() }));
vi.mock('../components/Icon', () => ({ Ic: () => <span /> }));

let renderer: ReactTestRenderer;
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.mocked(api).mockReset();
});

const STATS = { semesterCompletionRate: 0, completedSkills: 0, completedProjects: 0, totalTasks: 1, doneTasks: 0, deferredTasks: 0, plannedHours: 0, actualHours: 0, upcomingCriticalTasks: [] };
const PROFILE = { nickname: '测试', grade: 'freshman' }; // 大一 → 当前学期 1

function makeTask(patch: Record<string, unknown>) {
  return {
    id: 1, roadmapId: 1, parentTaskId: null, taskType: 'task', sortOrder: 0, dueDate: null, dependencyIds: [], completionRule: 'manual',
    semester: 1, title: '任务', description: '原说明', estimatedHours: 20, priority: 'medium', status: 'not_started',
    prerequisites: [], deliverable: '产出', acceptanceCriteria: '验收', relatedSkills: [], completedAt: null, actualHours: null,
    evidenceUrl: null, resultNote: null, deferredReason: null, createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z',
    ...patch,
  };
}

const textOf = (node: ReactTestInstance): string => node.children.map((child) => (typeof child === 'string' ? child : textOf(child))).join('');
const button = (label: string) => renderer.root.findAllByType('button').find((node) => textOf(node).trim() === label)!;
const patches = () => vi.mocked(api).mock.calls.filter(([path, init]) => String(path).startsWith('/api/tasks/') && init?.method === 'PATCH').map(([, init]) => init?.json as Record<string, unknown>);

it('看板「完成」保留已记录的实际工时，不用预计工时覆盖', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const task = makeTask({ status: 'in_progress', actualHours: 12 });
  vi.mocked(api).mockImplementation(async (path, init) => {
    if (init?.method === 'PATCH') return { ...task, ...(init.json as object), status: 'done' };
    if (path === '/api/tasks') return [task];
    if (path === '/api/stats/growth') return STATS;
    return PROFILE;
  });
  await act(async () => { renderer = create(<TasksPage />); });
  await act(async () => { button('完成').props.onClick({ stopPropagation() {} }); });
  expect(patches()).toEqual([{ status: 'done', actualHours: 12, expectedUpdatedAt: task.updatedAt }]);
});

it('保存任务说明冲突时保留草稿、在弹层内提示，并用刷新后的版本号重试成功', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const stale = makeTask({});
  const fresh = makeTask({ title: '另一设备改过的标题', updatedAt: '2026-11-02T00:00:00.000Z' });
  let server = fresh; // 服务端已是新版本，页面首屏拿到的是旧版本
  let firstLoad = true;
  vi.mocked(api).mockImplementation(async (path, init) => {
    if (init?.method === 'PATCH') {
      const json = init.json as { expectedUpdatedAt: string; description: string };
      if (json.expectedUpdatedAt !== server.updatedAt) throw new Error('任务已被其他设备修改，请刷新后重试');
      server = { ...server, description: json.description, updatedAt: '2026-11-03T00:00:00.000Z' };
      return server;
    }
    if (path === '/api/tasks') {
      if (firstLoad) { firstLoad = false; return [stale]; }
      return [server];
    }
    if (path === '/api/stats/growth') return STATS;
    return PROFILE;
  });
  await act(async () => { renderer = create(<TasksPage />); });
  const card = renderer.root.findAll((node) => node.type === 'div' && typeof node.props.onClick === 'function' && String(node.props.className).includes('cursor-pointer'))[0];
  await act(async () => { card.props.onClick(); });
  await act(async () => { renderer.root.findAllByType('button').find((node) => textOf(node).includes('编辑说明'))!.props.onClick(); });
  await act(async () => { renderer.root.findByType('textarea').props.onChange({ target: { value: '我写了很久的新说明' } }); });

  await act(async () => { await button('保存说明').props.onClick(); });
  // 冲突：草稿还在，错误显示在弹层内，详情已换成服务端最新版本
  expect(renderer.root.findByType('textarea').props.value).toBe('我写了很久的新说明');
  expect(textOf(renderer.root.findByProps({ role: 'alert' }))).toContain('已被其他设备修改');
  expect(JSON.stringify(renderer.toJSON())).toContain('另一设备改过的标题');

  await act(async () => { await button('保存说明').props.onClick(); });
  expect(patches().map((json) => json.expectedUpdatedAt)).toEqual([stale.updatedAt, fresh.updatedAt]);
  expect(renderer.root.findAllByType('textarea')).toHaveLength(0); // 保存成功后才收起编辑框
  expect(renderer.root.findAllByProps({ role: 'alert' })).toHaveLength(0);
});

it('「今日」视图按本地日期判断完成时间，而不是 UTC 日期', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  // 本地时间早上 7 点（东八区此时 UTC 仍是前一天）
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 11, 7, 0, 0));
  const tasks = [
    makeTask({ id: 1, title: '昨天上午完成的任务', status: 'done', completedAt: new Date(2026, 10, 10, 10, 0, 0).toISOString() }),
    makeTask({ id: 2, title: '今天清晨完成的任务', status: 'done', completedAt: new Date(2026, 10, 11, 6, 0, 0).toISOString() }),
  ];
  vi.mocked(api).mockImplementation(async (path) => {
    if (path === '/api/tasks') return tasks;
    if (path === '/api/stats/growth') return STATS;
    return PROFILE;
  });
  await act(async () => { renderer = create(<TasksPage />); });
  await act(async () => { button('今日').props.onClick(); });
  const rendered = JSON.stringify(renderer.toJSON());
  expect(rendered).toContain('今天清晨完成的任务');
  expect(rendered).not.toContain('昨天上午完成的任务');
});
