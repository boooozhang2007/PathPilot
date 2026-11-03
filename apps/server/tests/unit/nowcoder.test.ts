import { describe, expect, it } from 'vitest';
import {
  employmentTypeOfRecruitType,
  extractInitialState,
  matchesRole,
  nowcoderConfigured,
  parseNowcoderDetail,
  parseNowcoderListJobs,
  pickRelevantByRole,
} from '../../src/agent/search/nowcoder.js';

const ext = JSON.stringify({
  infos: '1、负责核心产品 Java 后端功能与公共模块的编写；\n2、解决项目部署升级中的技术问题；\n3、协同跨团队保证质量与进度。',
  requirements: '1、本科及以上学历，有 Java 开发经验；\n2、使用过 Spring、Spring Boot、Mybatis；\n3、使用过 MySQL、Redis；\n4、了解 Linux、网络与 Nginx 基础。',
  jobStrength: null,
  topSchool: ['郑州大学', '北京邮电大学'],
});

const detailState = {
  store: {
    jobDetail: {
      detail: {
        id: 29637,
        jobName: '【京东】Java后端实习生（22-23届）',
        jobCity: '北京',
        jobCityList: ['北京'],
        eduLevel: 0,
        salaryMin: 250,
        salaryMax: 300,
        salaryMonth: 0,
        graduationYear: '不限',
        recruitType: 2,
        ext,
        recommendInternCompany: { companyName: '京东数科', industryTagNameList: ['金融'], scaleTagName: 'B轮' },
      },
    },
  },
  prefetchData: { '1': {} },
};

const detailHtml = `<!doctype html><html><head><title>x</title></head><body><script>window.__INITIAL_STATE__=${JSON.stringify(detailState)};</script></body></html>`;

describe('牛客通道解析', () => {
  it('从详情页内嵌 __INITIAL_STATE__ 解析出结构化岗位与 JD 正文', () => {
    const job = parseNowcoderDetail(detailHtml);
    expect(job).not.toBeNull();
    expect(job!.title).toContain('Java后端实习生');
    expect(job!.company).toBe('京东数科');
    expect(job!.location).toBe('北京');
    expect(job!.salary).toBe('250-300');
    expect(job!.education).toBe('本科及以上');
    expect(job!.description).toContain('岗位职责：');
    expect(job!.description).toContain('任职要求：');
    expect(job!.description).toContain('Spring Boot');
  });

  it('“面议”薪资（salaryMax=9999999）不当作真实薪资', () => {
    const state = {
      store: {
        jobDetail: {
          detail: {
            jobName: '某后端岗位',
            jobCity: '上海',
            salaryMin: 0,
            salaryMax: 9999999,
            ext,
            recommendInternCompany: { companyName: '某公司' },
          },
        },
      },
    };
    const html = `<html><script>window.__INITIAL_STATE__=${JSON.stringify(state)};</script></html>`;
    const job = parseNowcoderDetail(html);
    expect(job).not.toBeNull();
    expect(job!.salary).toBeNull();
  });

  it('非牛客页面（无内嵌状态）返回 null，不编造样本', () => {
    expect(parseNowcoderDetail('<html><body><h1>普通页面</h1></body></html>')).toBeNull();
  });

  it('正文过短（登录墙/占位页）返回 null', () => {
    const shortState = {
      store: { jobDetail: { detail: { jobName: '某岗位', ext: JSON.stringify({ infos: '短', requirements: '' }) } } },
    };
    const html = `<html><script>window.__INITIAL_STATE__=${JSON.stringify(shortState)};</script></html>`;
    expect(parseNowcoderDetail(html)).toBeNull();
  });

  it('extractInitialState 能跳过字符串内的大括号与转义', () => {
    const obj = { a: '含有 } 和 { 的字符串', b: { c: 1 } };
    const html = `<script>window.__INITIAL_STATE__=${JSON.stringify(obj)};window.x=1;</script>`;
    expect(extractInitialState(html)).toEqual(obj);
    expect(extractInitialState('<html>no state</html>')).toBeNull();
  });

  it('从列表页内嵌 __INITIAL_STATE__ 批量解析岗位（无需逐条抓详情），并用岗位 id 拼详情链接', () => {
    const listState = {
      store: {
        fulltimeCenter: {
          jobList: [
            {
              data: {
                id: 300768,
                jobName: 'Java软件开发工程师（中/高级）',
                jobCity: '深圳',
                salaryMin: 20,
                salaryMax: 50,
                salaryMonth: 14,
                recruitType: 3,
                ext,
                recommendInternCompany: { companyName: '招商银行' },
              },
            },
            {
              data: {
                id: 466253,
                jobName: '前端开发工程师',
                jobCity: '杭州',
                salaryMin: 15,
                salaryMax: 25,
                salaryMonth: 0,
                recruitType: 3,
                ext,
                recommendInternCompany: { companyName: '网易' },
              },
            },
            { data: { id: 1, jobName: '无正文岗位', ext: JSON.stringify({ infos: '', requirements: '' }) } },
          ],
        },
      },
    };
    const html = `<html><script>window.__INITIAL_STATE__=${JSON.stringify(listState)};</script></html>`;
    const jobs = parseNowcoderListJobs(html);
    // 第三条正文为空，应被丢弃
    expect(jobs.length).toBe(2);
    const first = jobs[0];
    expect(first.parsed.title).toContain('Java软件开发工程师');
    expect(first.parsed.company).toBe('招商银行');
    expect(first.parsed.salary).toBe('20-50·14薪');
    expect(first.url).toBe('https://www.nowcoder.com/jobs/detail/300768');
  });

  it('列表页没有内嵌岗位数组时返回空数组，不报错', () => {
    expect(parseNowcoderListJobs('<html><body>空壳</body></html>')).toEqual([]);
  });

  it('默认启用，NOWCODER_DISABLE=1 时关闭', () => {
    const saved = process.env.NOWCODER_DISABLE;
    try {
      delete process.env.NOWCODER_DISABLE;
      expect(nowcoderConfigured()).toBe(true);
      process.env.NOWCODER_DISABLE = '1';
      expect(nowcoderConfigured()).toBe(false);
    } finally {
      if (saved === undefined) delete process.env.NOWCODER_DISABLE;
      else process.env.NOWCODER_DISABLE = saved;
    }
  });

  it('recruitType 决定真实类型：2=实习、1/3=全职，未标注时用列表页类型兜底', () => {
    expect(employmentTypeOfRecruitType(2)).toBe('internship');
    expect(employmentTypeOfRecruitType(1)).toBe('full_time');
    expect(employmentTypeOfRecruitType(3)).toBe('full_time');
    expect(employmentTypeOfRecruitType(0)).toBeNull();
    expect(employmentTypeOfRecruitType(undefined)).toBeNull();

    const listState = {
      store: {
        interCenter: {
          jobList: [
            { data: { id: 11, jobName: '前端开发实习生', recruitType: 2, ext } },
            { data: { id: 12, jobName: '前端开发工程师', recruitType: 3, ext } },
            { data: { id: 13, jobName: '前端开发（未标注类型）', ext } },
          ],
        },
      },
    };
    const html = `<html><script>window.__INITIAL_STATE__=${JSON.stringify(listState)};</script></html>`;
    const jobs = parseNowcoderListJobs(html, 'internship');
    expect(jobs.map((j) => j.parsed.employmentType)).toEqual(['internship', 'full_time', 'internship']);
  });

  it('相关性片段不跨词边界误命中：后端岗位不会被判成前端岗位', () => {
    expect(matchesRole('java后端开发工程师 岗位职责：负责服务端开发', '前端开发')).toBe(false);
    expect(matchesRole('ai大模型应用开发 岗位职责：负责大模型应用开发与调优', '前端开发')).toBe(false);
    expect(matchesRole('前端开发工程师 岗位职责：负责页面开发', '前端开发')).toBe(true);
    expect(matchesRole('web 前端工程师，负责管理后台页面', '前端开发')).toBe(true);
  });

  it('相关性筛选以标题为主：正文顺带提到“前端”的算法岗不算命中，标题全不匹配时才放宽到正文', () => {
    const items = [
      { title: '大模型应用算法工程师', description: '与产品、后端、前端、测试等团队协作推进交付' },
      { title: '前端工程师', description: '负责页面开发' },
      { title: '后端开发工程师', description: '负责服务端开发' },
    ];
    const picked = pickRelevantByRole(items, '前端开发', (i) => i.title, (i) => i.description);
    expect(picked.map((i) => i.title)).toEqual(['前端工程师']);

    // 标题全不匹配时放宽到“标题+正文”，但放宽也要求岗位词整体出现（不做片段近似）
    const relaxed = pickRelevantByRole(
      [
        { title: '软件工程师', description: '负责前端开发与联调' },
        { title: '大模型应用算法工程师', description: '与产品、后端、前端、测试等团队协作推进交付' },
      ],
      '前端开发',
      (i) => i.title,
      (i) => i.description
    );
    expect(relaxed.map((i) => i.title)).toEqual(['软件工程师']);
  });
});
