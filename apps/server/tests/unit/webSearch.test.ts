import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lookup } from 'node:dns/promises';
import { extractJdFromHtml, fetchText, searchJobPages, webSearchJobs } from '../../src/agent/search/webSearch.js';

vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(async () => [{ address: '93.184.216.34', family: 4 }]),
}));

vi.mock('../../src/agent/search/liepin.js', () => ({
  liepinConfigured: () => false,
  liepinSearchJobs: vi.fn(async () => ({ samples: [], ok: false, note: '猎聘通道测试未启用' })),
}));

const lookupMock = vi.mocked(lookup as unknown as (host: string, options: { all: boolean; verbatim: boolean }) => Promise<{ address: string; family: 4 | 6 }[]>);
const publicDns = [{ address: '93.184.216.34', family: 4 as const }];
const jdHtml = `<!doctype html><html><body><h1>前端开发实习生</h1><p>岗位职责：负责 Web 前端页面开发与联调，参与需求评审和技术方案设计。任职要求：本科及以上，熟悉 HTML、CSS、JavaScript、HTTP，了解 React 或 Vue，具备良好的沟通能力。这里有足够的真实岗位正文，用于通过正文长度校验并完成技能抽取。</p></body></html>`;
const bingTarget = (url: string) => `https://www.bing.com/ck/a?u=a1${Buffer.from(url, 'utf8').toString('base64url')}&ntb=1`;
const searchHtml = (target: string) => `<html><body><li class="b_algo"><h2><a href="${bingTarget(target)}">前端开发实习生招聘</a></h2></li></body></html>`;
const PROXY_ENV = ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'all_proxy', 'no_proxy'] as const;
const savedProxyEnv = new Map(PROXY_ENV.map((key) => [key, process.env[key]]));

describe('Agent 联网搜索链路', () => {
  beforeEach(() => {
    for (const key of PROXY_ENV) delete process.env[key];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    // 清除未消费的 mockResolvedValueOnce，避免把内网地址泄漏到下一个用例。
    lookupMock.mockReset().mockResolvedValue(publicDns);
    for (const key of PROXY_ENV) {
      const value = savedProxyEnv.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('接受非白名单域名，并解析必应跳转后的真实目标链接', async () => {
    const target = 'https://jobs.example.com/frontend-intern';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(searchHtml(target))));

    const hits = await searchJobPages('前端开发 实习', 3, 1000);

    expect(hits).toEqual([{ title: '前端开发实习生招聘', url: target }]);
  });

  it('搜索成功：完整返回真实样本、来源状态和可读结果说明', async () => {
    const target = 'https://jobs.example.com/frontend-intern';
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      const href = String(url);
      if (href.includes('cn.bing.com/search')) return new Response(searchHtml(target));
      if (href.startsWith(target)) return new Response(jdHtml);
      throw new Error(`unexpected URL: ${href}`);
    }));

    const result = await webSearchJobs(
      { targetRole: '前端开发', employmentType: 'internship', sampleLimit: 3 },
      {}
    );

    expect(result.ok).toBe(true);
    expect(result.samples).toHaveLength(1);
    expect(result.samples[0]).toMatchObject({ source_url: target, source_type: 'web' });
    expect(result.attempts).toEqual([{ title: '前端开发实习生招聘', url: target, parse_status: 'ok' }]);
    expect(result.note).toContain('成功解析 1 条');
    expect(result.note).not.toContain('白名单');
  });

  it('搜索失败：不伪装成功，返回具体通道错误', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('network down'))));

    const result = await webSearchJobs(
      { targetRole: '后端开发', employmentType: 'full_time', sampleLimit: 3 },
      {}
    );

    expect(result.ok).toBe(false);
    expect(result.samples).toEqual([]);
    expect(result.note).toContain('Bing: network down');
    expect(result.note).not.toContain('白名单');
  });

  it('移除域名白名单后仍拒绝重定向到本机或内网地址', async () => {
    const fetchMock = vi.fn(async () => new Response(null, {
      status: 302,
      headers: { location: 'http://127.0.0.1:3000/private' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchText('https://jobs.example.com/start', 1000)).rejects.toThrow(/已拒绝抓取/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('拒绝直接访问 IPv4 映射 IPv6 的本机地址', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchText('http://[::ffff:127.0.0.1]:3000/private', 1000)).rejects.toThrow(/已拒绝抓取/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('拒绝重定向到标准化后的 IPv4 映射 IPv6 本机地址', async () => {
    const fetchMock = vi.fn(async () => new Response(null, {
      status: 302,
      headers: { location: 'http://[::ffff:127.0.0.1]:3000/private' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchText('https://jobs.example.com/start', 1000)).rejects.toThrow(/已拒绝抓取/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('连接时固定已验证的公网 DNS 结果，防止二次解析重绑定', async () => {
    lookupMock
      .mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }])
      .mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }]);
    const fetchMock = vi.fn<typeof fetch>(async () => new Response('ok'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchText('https://jobs.example.com/start', 1000)).resolves.toBe('ok');
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[0][1] as unknown as { dispatcher?: unknown }).dispatcher).toBeDefined();
  });

  it('HTTP 代理的 Fake-IP 不触发 SSRF 误报，也不固定本地解析地址', async () => {
    process.env.HTTPS_PROXY = 'http://127.0.0.1:10200';
    lookupMock.mockResolvedValue([{ address: '198.18.0.140', family: 4 }]);
    const fetchMock = vi.fn<typeof fetch>(async () => new Response('ok'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchText('https://cn.bing.com/search?q=test', 1000)).resolves.toBe('ok');
    expect(lookup).not.toHaveBeenCalled();
    expect((fetchMock.mock.calls[0][1] as unknown as { dispatcher?: unknown }).dispatcher).toBeDefined();
  });

  it('过滤教程类搜索结果，不把学习资料当作岗位候选页', async () => {
    const target = 'https://jobs.example.com/frontend-guide';
    const html = `<html><body><li class="b_algo"><h2><a href="${bingTarget(target)}">前端开发学习指南</a></h2></li></body></html>`;
    const fetchMock = vi.fn(async () => new Response(html));
    vi.stubGlobal('fetch', fetchMock);

    const hits = await searchJobPages('前端开发 实习', 3, 1000);

    expect(hits).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('普通长文没有岗位段落时，不返回虚假搜索成功', async () => {
    const target = 'https://jobs.example.com/frontend-article';
    const article = `<html><body><h1>前端学习路线</h1><p>这是一篇面向初学者的前端学习文章，依次介绍 HTML、CSS、JavaScript、浏览器原理、工程化、React、Vue、性能优化、项目实践和面试准备。文章包含足够长的正文，但没有真实招聘信息、岗位段落、学历要求、工作地点、薪资或投递方式，因此不能被当成岗位样本。</p></body></html>`;
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      const href = String(url);
      if (href.includes('cn.bing.com/search')) return new Response(searchHtml(target));
      if (href.startsWith(target)) return new Response(article);
      throw new Error(`unexpected URL: ${href}`);
    }));

    expect(extractJdFromHtml(article)).toBeNull();
    const result = await webSearchJobs(
      { targetRole: '前端开发', employmentType: 'internship', sampleLimit: 3 },
      {}
    );

    expect(result.ok).toBe(false);
    expect(result.samples).toEqual([]);
    expect(result.note).toContain('均未能解析出有效正文');
  });

  it('含两个岗位标题的职业指南没有招聘信号时，不误判为真实岗位', () => {
    const guide = `<html><body><h1>前端开发职业指南</h1><p>岗位职责：本文介绍这一职业通常做什么，帮助学习者理解页面开发、工程协作和持续学习的一般路径，并不对应任何用人方的当前职位。</p><p>任职要求：本文介绍入行学习者通常需要掌握的基础知识和实践方向，不包含具体待遇、办公城市、名额或申请入口。</p><p>继续补充足够长的说明文字，使页面正文超过最低长度阈值，但它仍然是职业科普内容而不是一条真实招聘信息。</p></body></html>`;
    expect(extractJdFromHtml(guide)).toBeNull();
  });
});
