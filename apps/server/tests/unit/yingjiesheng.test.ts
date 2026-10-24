// 应届生求职网工具测试：响应结构解析（对齐 job-hunter 已校准字段）/ DOM 卡片解析 / 转载过期跳过 / 纯文本解析
import { describe, it, expect } from 'vitest';
import { parseYjsPayload, parseYjsCards, YJS_CITY_CODES } from '../../src/agent/search/yingjiesheng.js';

const FIXTURE_SEARCH_JSON = JSON.stringify({
  resultbody: {
    searchData: {
      joblist: {
        items: [
          { jobid: 100001, jobname: 'Java 后端开发实习生', coname: '示例科技', providesalary: '200-300元/天', jobarea: '北京', workyear: '在校生', degree: '本科', jobterm: '实习', jobtag: ['后端', '校招'] },
          { jobid: 100002, jobname: '前端开发（校招）', coname: '示例集团', providesalary: '15-25k', jobarea: '上海', workyear: '应届生', degree: '本科', jobterm: '全职' },
          { jobid: 100003, jobname: '转载岗位（应跳过）', coname: '外部公司', isReprintJob: 1 },
          { jobid: 100004, jobname: '过期岗位（应跳过）', coname: '外部公司', isExpire: 1 },
        ],
      },
    },
  },
});

const FIXTURE_HTML = `
<div class="job-list">
  <a href="https://q.yingjiesheng.com/jobdetail/200001.html" class="job-item">
    <span class="name">数据分析师实习生</span><span class="company">示例数据科技</span>
  </a>
  <a href="/jobdetail/200002.html" class="job-item"><span>产品经理校招</span></a>
  <a href="https://q.yingjiesheng.com/jobdetail/200001.html" class="job-item"><span>重复卡片应去重</span></a>
</div>`;

describe('应届生求职网：接口 JSON 解析（job-hunter 结构）', () => {
  it('解析 items 并映射统一样本', () => {
    const { samples, skipped } = parseYjsPayload(FIXTURE_SEARCH_JSON);
    expect(skipped).toBe(2); // 转载 + 过期
    expect(samples.length).toBe(2);
    const first = samples[0];
    expect(first.title).toBe('Java 后端开发实习生');
    expect(first.company).toBe('示例科技');
    expect(first.education_requirement).toBe('本科');
    expect(first.experience_requirement).toBe('在校生');
    expect(first.source_url).toBe('https://q.yingjiesheng.com/jobdetail/100001.html');
    expect(first.source_type).toBe('web');
  });

  it('兼容裸 items 数组与详情接口单对象', () => {
    const arr = parseYjsPayload(JSON.stringify({ items: [{ jobid: 1, jobname: 'A' }] }));
    expect(arr.samples.length).toBe(1);
    const detail = parseYjsPayload(JSON.stringify({ resultbody: { jobid: 9, jobname: 'B', coname: 'C' } }));
    expect(detail.samples[0].title).toBe('B');
  });

  it('城市码与 job-hunter 一致', () => {
    expect(YJS_CITY_CODES['北京']).toBe('010000');
    expect(YJS_CITY_CODES['深圳']).toBe('040000');
  });
});

describe('应届生求职网：搜索页卡片 DOM 解析', () => {
  it('提取 jobdetail 链接卡片并去重', () => {
    const samples = parseYjsCards(FIXTURE_HTML, 'internship');
    expect(samples.length).toBe(2); // 第三个重复 ID 去重
    expect(samples[0].title).toContain('数据分析师实习生');
    expect(samples[0].source_url).toContain('jobdetail/200001.html');
    expect(samples[1].source_url).toBe('https://q.yingjiesheng.com/jobdetail/200002.html');
  });
});

describe('应届生求职网：纯文本卡片解析（离线兜底）', () => {
  it('按块解析岗位/公司/薪资字段', () => {
    const text = [
      '岗位：算法工程师实习生；公司：示例AI；薪资：300元/天；北京 本校招 硕士 https://q.yingjiesheng.com/jobdetail/300001.html',
      '',
      '岗位：测试开发（校招）；公司：示例质量；薪资：12-18k；上海 应届生 本科',
    ].join('\n');
    const { samples } = parseYjsPayload(text);
    expect(samples.length).toBe(2);
    expect(samples[0].company).toBe('示例AI');
    expect(samples[0].education_requirement).toBe('硕士');
  });
});
