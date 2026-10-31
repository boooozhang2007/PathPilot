import { describe, expect, it } from 'vitest';
import { buildSearchKeywords, dedupeLiepinJobs, filterRelevantJobs, rankByFit, summarizePool } from '../../src/agent/search/liepin.js';

describe('猎聘多轮搜索辅助函数', () => {
  it('生成多轮关键词：雇佣类型组合优先，去重保序，避免无意义后缀', () => {
    expect(buildSearchKeywords('前端开发', 'internship')).toEqual(['前端开发实习', '前端开发', '前端开发工程师']);
    expect(buildSearchKeywords('  算法   工程师 ', 'full_time')).toEqual(['算法 工程师校招', '算法 工程师']);
    expect(buildSearchKeywords('Java', 'internship')).toEqual(['Java实习', 'Java', 'Java工程师', 'Java开发']);
  });

  it('按 标题+公司 去重（猎聘同岗多贴），链接兜底，先到先留', () => {
    const jobs = dedupeLiepinJobs([
      { jobId: 1, jobName: '前端开发实习生', company: 'A' },
      { jobId: 2, jobName: '前端开发实习生', company: 'A' }, // 同岗不同 jobId
      { jobDetailUrl: 'https://www.liepin.com/job/3.shtml', jobName: '前端工程师', company: 'B' },
      { jobDetailUrl: 'https://www.liepin.com/job/4.shtml', jobName: '前端工程师', company: 'B' },
      { jobName: '后端开发', company: 'C' },
      { jobDetailUrl: 'https://www.liepin.com/job/6.shtml' }, // 无标题公司，按链接保留
    ]);
    expect(jobs).toHaveLength(4);
    expect(jobs[0].jobId).toBe(1);
  });

  it('筛选剔除明确不相关岗位，保留完整词或区分片段命中的岗位', () => {
    const { kept, filtered, filterRelaxed } = filterRelevantJobs(
      [
        { jobName: '前端开发实习生', company: 'A' },
        { jobName: '电话销售专员', company: 'B', industry: '保险' },
        { jobName: 'WEB前端工程师', company: 'C' }, // 命中区分片段"前端"
        { jobName: '数字工程师', company: 'D', industry: '保险' }, // 无区分片段
        { jobName: '前端开发', company: 'E', workYears: '5年以上' }, // 资深但相关，保留供对比
      ],
      '前端开发',
      'internship'
    );
    expect(kept.map((j) => j.jobName)).toEqual(['前端开发实习生', 'WEB前端工程师', '前端开发']);
    expect(filtered).toBe(2);
    expect(filterRelaxed).toBe(false);
  });

  it('实习搜索按匹配度排序：实习岗优先，资深岗保留但靠后', () => {
    const ranked = rankByFit(
      [
        { jobName: '前端开发', workYears: '3-5年' },
        { jobName: '前端开发实习生', workYears: '经验不限' },
        { jobName: '前端工程师', workYears: '1-3年' },
      ],
      'internship'
    );
    expect(ranked.map((j) => j.jobName)).toEqual(['前端开发实习生', '前端工程师', '前端开发']);
  });

  it('过滤会清空候选池时放宽并如实标记', () => {
    const { kept, filterRelaxed } = filterRelevantJobs([{ jobName: '客户经理', company: 'A' }], '前端开发', 'internship');
    expect(kept).toHaveLength(1);
    expect(filterRelaxed).toBe(true);
  });

  it('汇总候选池的学历/经验/城市分布', () => {
    const summary = summarizePool([
      { jobName: 'a', education: '本科', workYears: '经验不限', location: '杭州·西湖区' },
      { jobName: 'b', education: '本科', workYears: '1年以内', location: '上海·浦东' },
      { jobName: 'c', education: '硕士', workYears: '经验不限', location: '杭州·滨江' },
    ]);
    expect(summary).toContain('学历分布：本科×2、硕士×1');
    expect(summary).toContain('经验要求：经验不限×2');
    expect(summary).toContain('城市分布：杭州×2、上海×1');
  });
});
