import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lookup } from 'node:dns/promises';
import { extractPositionListArray, parseZhaopinItem, zhaopinConfigured, zhaopinSearchJobs } from '../../src/agent/search/zhaopin.js';

vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(async () => [{ address: '93.184.216.34', family: 4 }]),
}));

const lookupMock = vi.mocked(
  lookup as unknown as (host: string, options: { all: boolean; verbatim: boolean }) => Promise<{ address: string; family: 4 | 6 }[]>
);

const LONG_JD =
  '岗位职责：负责后端服务的设计与开发，参与需求评审和技术方案设计，保证系统稳定运行。任职要求：本科及以上学历，熟悉 Java、Spring、MySQL，具备良好的沟通能力与团队协作精神。';

const stateHtml = (positionList: unknown[]) =>
  `<html><body><script>window.__INITIAL_STATE__=${JSON.stringify({ positionList })}</script></body></html>`;

const sampleItem = {
  name: 'JAVA后端开发工程师',
  companyName: '某科技有限公司',
  salaryReal: '15001-30000',
  salary60: '1.5-3万',
  workCity: '北京',
  education: '本科',
  workingExp: '1-3年',
  jobSkillTags: [{ name: 'Java' }, { name: 'Spring' }],
  positionUrl: 'https://www.zhaopin.com/jobdetail/CC123.htm',
  jobDetailData: {
    position: {
      base: { positionName: 'JAVA后端开发工程师' },
      desc: { description: LONG_JD },
    },
  },
};

describe('智联通道', () => {
  beforeEach(() => {
    lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it('parseZhaopinItem 映射结构化字段并从 position.desc.description 取正文', () => {
    const p = parseZhaopinItem(sampleItem, { city: '上海' });
    expect(p).not.toBeNull();
    expect(p!.title).toBe('JAVA后端开发工程师');
    expect(p!.company).toBe('某科技有限公司');
    expect(p!.location).toBe('北京');
    expect(p!.salary).toBe('15001-30000');
    expect(p!.education).toBe('本科');
    expect(p!.experience).toBe('1-3年');
    expect(p!.skills).toEqual(['Java', 'Spring']);
    expect(p!.description).toContain('岗位职责');
    expect(p!.url).toBe('https://www.zhaopin.com/jobdetail/CC123.htm');
  });

  it('正文过短时返回 null（不编造）', () => {
    const short = { name: 'X', jobDetailData: { position: { desc: { description: '太短' } } } };
    expect(parseZhaopinItem(short, {})).toBeNull();
  });

  it('extractPositionListArray 能绕过外层非严格 JSON、按括号配对直取 positionList 数组', () => {
    // 模拟真实页面：外层脚本含 undefined 等非 JSON 片段，只有 positionList 是标准 JSON
    const html =
      '<script>window.x = {a: undefined, b: \'single\'}; window.__INITIAL_STATE__={"positionList":' +
      JSON.stringify([sampleItem, { ...sampleItem, name: '第二岗' }]) +
      ',"other":undefined}</script>';
    const arr = extractPositionListArray(html);
    expect(arr.length).toBe(2);
    expect((arr[0] as { name: string }).name).toBe('JAVA后端开发工程师');
  });

  it('extractPositionListArray 无 positionList 时返回空数组', () => {
    expect(extractPositionListArray('<html>无数据</html>')).toEqual([]);
  });

  it('搜索页 SSR 直出 positionList → 组装 JobSample（免详情抓取）', async () => {
    vi.stubEnv('ZHAOPIN_DISABLE', '');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(stateHtml([sampleItem]))));

    const result = await zhaopinSearchJobs(
      { targetRole: 'Java后端', employmentType: 'full_time', sampleLimit: 5 },
      {}
    );

    expect(result.ok).toBe(true);
    expect(result.samples.length).toBeGreaterThanOrEqual(1);
    expect(result.samples[0]).toMatchObject({
      title: 'JAVA后端开发工程师',
      company: '某科技有限公司',
      source_url: 'https://www.zhaopin.com/jobdetail/CC123.htm',
      source_type: 'web',
      employment_type: 'full_time',
    });
    expect(result.samples[0].description).toContain('薪资：15001-30000');
  });

  it('按 workType 收敛类型：实习岗不会被标成全职，反之亦然', async () => {
    vi.stubEnv('ZHAOPIN_DISABLE', '');
    const internItem = { ...sampleItem, name: '前端开发实习生', workType: '实习', workTypeCode: '4' };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(stateHtml([internItem]))));

    const intern = await zhaopinSearchJobs(
      { targetRole: '前端开发', employmentType: 'internship', sampleLimit: 5 },
      {}
    );
    expect(intern.ok).toBe(true);
    expect(intern.samples[0]).toMatchObject({ title: '前端开发实习生', employment_type: 'internship' });

    // 同一条实习岗在“全职”检索里必须被类型过滤掉，而不是标成 full_time。
    const fulltime = await zhaopinSearchJobs(
      { targetRole: '前端开发', employmentType: 'full_time', sampleLimit: 5 },
      {}
    );
    expect(fulltime.ok).toBe(false);
    expect(fulltime.samples).toEqual([]);
    expect(fulltime.note).toContain('均非「全职」类型');
  });

  it('ZHAOPIN_DISABLE=1 时通道关闭', async () => {
    vi.stubEnv('ZHAOPIN_DISABLE', '1');
    expect(zhaopinConfigured()).toBe(false);
    const result = await zhaopinSearchJobs({ targetRole: 'Java', employmentType: 'internship', sampleLimit: 3 }, {});
    expect(result.ok).toBe(false);
    expect(result.note).toContain('已关闭');
  });
});
