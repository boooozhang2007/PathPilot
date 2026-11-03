import { act } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, expect, it, vi } from 'vitest';
import ProfilePage from '../app/(main)/profile/page';
import { api } from '../lib/api';

vi.mock('../lib/api', () => ({ api: vi.fn() }));
vi.mock('../components/charts', () => ({ SkillRadar: () => null }));
vi.mock('../components/Icon', () => ({ Ic: () => <span /> }));

let renderer: ReactTestRenderer;
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  vi.unstubAllGlobals();
});

it('移除头像保存成功后立即刷新预览，保留其它字段的未保存草稿', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const profile = { nickname: '测试', avatar: 'data:image/jpeg;base64,avatar', weeklyHours: 8, grade: 'freshman' };
  vi.mocked(api).mockImplementation(async (path, init) => {
    if (path === '/api/profile') return { ...profile, ...(init?.json as object ?? {}) };
    if (path === '/api/skills/gap') return null;
    return [];
  });
  await act(async () => { renderer = create(<ProfilePage />); });
  expect(renderer.root.findAllByType('img')).toHaveLength(1);

  const nickname = renderer.root.findAllByType('input').find((node) => node.props.value === '测试')!;
  await act(async () => { nickname.props.onChange({ target: { value: '未保存的昵称' } }); });
  const remove = renderer.root.findAllByType('button').find((node) => node.children.includes('移除头像'))!;
  await act(async () => { await remove.props.onClick(); });

  expect(renderer.root.findAllByType('img')).toHaveLength(0);
  expect(renderer.root.findAllByType('input').some((node) => node.props.value === '未保存的昵称')).toBe(true);
});


it('自定义路径未修改直接失焦不会覆盖已选预设，修改后失焦才保存', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const profile = { nickname: '测试', avatar: null, weeklyHours: 8, grade: 'freshman', careerPath: 'employment' };
  vi.mocked(api).mockReset();
  vi.mocked(api).mockImplementation(async (path, init) => {
    if (path === '/api/profile') return { ...profile, ...(init?.json as object ?? {}) };
    if (path === '/api/skills/gap') return null;
    return [];
  });
  await act(async () => { renderer = create(<ProfilePage />); });
  const input = renderer.root.findAllByType('input').find((node) => node.props['aria-label'] === '自定义发展路径')!;
  await act(async () => { input.props.onBlur({ target: { value: '' } }); });
  expect(vi.mocked(api).mock.calls.filter(([path, init]) => path === '/api/profile' && init?.method === 'PUT')).toHaveLength(0);

  await act(async () => { input.props.onChange({ target: { value: '出国深造' } }); });
  await act(async () => { input.props.onBlur({ target: { value: '出国深造' } }); });
  const writes = vi.mocked(api).mock.calls.filter(([path, init]) => path === '/api/profile' && init?.method === 'PUT');
  expect(writes).toHaveLength(1);
  expect(writes[0][1]?.json).toEqual({ careerPath: '出国深造' });
});
