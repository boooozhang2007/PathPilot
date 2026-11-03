import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lookup } from 'node:dns/promises';
import {
  extractInternUuids,
  parseShixisengDetail,
  shixisengConfigured,
  shixisengSearchJobs,
} from '../../src/agent/search/shixiseng.js';

vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(async () => [{ address: '93.184.216.34', family: 4 }]),
}));

const lookupMock = vi.mocked(
  lookup as unknown as (host: string, options: { all: boolean; verbatim: boolean }) => Promise<{ address: string; family: 4 | 6 }[]>
);

const detailHtml = (title: string, body: string) =>
  `<html><head><title>${title}</title></head><body>` +
  `<div class="con-job"><div class="job_til">职位描述：</div><div class="job_part">` +
  `<div class="job_detail">${body}</div></div></div><span>150-200/天</span></body></html>`;

const BODY_JAVA =
  '<p>【岗位职责】</p><p>程序开发、文档整理、公司交办的其他事务。</p>' +
  '<p>【任职要求】</p><p>本科及以上，1、精通JavaEE、SpringMVC；2、熟练掌握Java语言；3、熟悉MySQL数据库，具备良好沟通能力。</p>';

describe('实习僧通道', () => {
  beforeEach(() => {
    lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it('extractInternUuids 从搜索页 HTML 抓取去重的 uuid', () => {
    const html = '<a href="/intern/inn_aaa">a</a><a href="/intern/inn_bbb">b</a><a href="/intern/inn_aaa">c</a>';
    expect(extractInternUuids(html)).toEqual(['inn_aaa', 'inn_bbb']);
  });

  it('parseShixisengDetail 从 <title> 拆标题/公司、从 job_detail 容器取正文', () => {
    const html = detailHtml('java实习生实习招聘-瑞曦科技实习生招聘-实习僧', BODY_JAVA);
    const p = parseShixisengDetail(html);
    expect(p).not.toBeNull();
    expect(p!.title).toBe('java实习生');
    expect(p!.company).toBe('瑞曦科技');
    expect(p!.description).toContain('【岗位职责】');
    expect(p!.description).toContain('精通JavaEE');
    expect(p!.salary).toBe('150-200/天');
    expect(p!.education).toBe('本科及以上');
  });

  it('正文过短时返回 null', () => {
    const html = detailHtml('x实习招聘-y实习生招聘-实习僧', '<p>太短</p>');
    expect(parseShixisengDetail(html)).toBeNull();
  });

  it('搜索页抓 uuid → 并发抓详情 → 组装 JobSample', async () => {
    vi.stubEnv('SHIXISENG_DISABLE', '');
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      const href = String(url);
      if (href.includes('/interns?')) {
        return new Response(
          '<html><body><a href="/intern/inn_aaa">a</a><a href="/intern/inn_bbb">b</a></body></html>'
        );
      }
      if (href.includes('/intern/inn_aaa')) {
        return new Response(detailHtml('java实习生实习招聘-瑞曦科技实习生招聘-实习僧', BODY_JAVA));
      }
      if (href.includes('/intern/inn_bbb')) {
        return new Response(detailHtml('java开发实习生实习招聘-某公司实习生招聘-实习僧', BODY_JAVA));
      }
      throw new Error(`unexpected URL: ${href}`);
    }));

    const result = await shixisengSearchJobs(
      { targetRole: 'java', employmentType: 'internship', sampleLimit: 5 },
      {}
    );

    expect(result.ok).toBe(true);
    expect(result.samples.length).toBe(2);
    expect(result.samples[0]).toMatchObject({ employment_type: 'internship', source_type: 'web' });
    expect(result.samples[0].description).toContain('薪资：150-200/天');
    expect(result.samples.map((s) => s.source_url)).toContain('https://www.shixiseng.com/intern/inn_aaa');
  });

  it('请求全职时跳过（实习僧仅实习岗）', async () => {
    const result = await shixisengSearchJobs(
      { targetRole: 'java', employmentType: 'full_time', sampleLimit: 3 },
      {}
    );
    expect(result.ok).toBe(false);
    expect(result.note).toContain('仅提供实习岗位');
  });

  it('SHIXISENG_DISABLE=1 时通道关闭', async () => {
    vi.stubEnv('SHIXISENG_DISABLE', '1');
    expect(shixisengConfigured()).toBe(false);
    const result = await shixisengSearchJobs({ targetRole: 'java', employmentType: 'internship', sampleLimit: 3 }, {});
    expect(result.ok).toBe(false);
    expect(result.note).toContain('已关闭');
  });
});
