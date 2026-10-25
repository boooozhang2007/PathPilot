'use client';
// ECharts 封装（技能频次/分类/雷达/对比/完成统计，PRD 11.2 图表数值全部来自真实业务数据）
import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';

const PALETTE = ['#426EFE', '#0E7C6B', '#B97A0B', '#0B2239', '#8B96A8', '#3157D6', '#14A08A', '#B39422'];

export function Chart({ option, height = 300 }: { option: echarts.EChartsOption; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    if (!chartRef.current) chartRef.current = echarts.init(ref.current);
    chartRef.current.setOption({ color: PALETTE, textStyle: { fontFamily: 'inherit' }, ...option });
    const onResize = () => chartRef.current?.resize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [option]);
  useEffect(() => () => chartRef.current?.dispose(), []);
  return <div ref={ref} style={{ height, width: '100%' }} />;
}

export function SkillFreqBar({ skills, sampleCount }: { skills: { name: string; frequency: number; count: number }[]; sampleCount: number }) {
  const top = skills.slice(0, 12).reverse();
  return (
    <Chart
      height={Math.max(280, top.length * 26)}
      option={{
        grid: { left: 8, right: 40, top: 10, bottom: 10, containLabel: true },
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'shadow' },
          formatter: (p: unknown) => {
            const it = p as { name: string; value: number; data?: { count: number } }[];
            const d = it[0];
            return `${d?.name}<br/>出现 ${d?.data?.count ?? d?.value ?? 0} / ${sampleCount} 条（${d?.value ?? 0}%）`;
          },
        },
        xAxis: { type: 'value', axisLabel: { formatter: '{value}%' }, splitLine: { lineStyle: { color: '#e7e3d5' } } },
        yAxis: { type: 'category', data: top.map((s) => s.name), axisTick: { show: false }, axisLine: { show: false } },
        series: [
          {
            type: 'bar',
            data: top.map((s) => ({ value: Math.round(s.frequency * 100), count: s.count })),
            itemStyle: { borderRadius: [0, 6, 6, 0] },
            barMaxWidth: 18,
            label: { show: true, position: 'right', formatter: '{c}%', fontSize: 11, color: '#52627A' },
          },
        ],
      }}
    />
  );
}

export function CategoryPie({ items }: { items: { name: string; value: number }[] }) {
  return (
    <Chart
      option={{
        tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
        legend: { bottom: 0, icon: 'circle', itemWidth: 8, itemHeight: 8, textStyle: { fontSize: 11, color: '#52627A' } },
        series: [{ type: 'pie', radius: ['45%', '72%'], center: ['50%', '44%'], itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 }, label: { show: false }, data: items }],
      }}
    />
  );
}

export function DistBars({ items, total }: { items: { label: string; count: number; ratio: number }[]; total: number }) {
  return (
    <Chart
      height={160}
      option={{
        grid: { left: 8, right: 30, top: 6, bottom: 6, containLabel: true },
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (p: unknown) => {
          const d = (p as { name: string; value: number }[])[0];
          return `${d.name}: ${d.value} / ${total}（${Math.round((d.value / Math.max(total, 1)) * 100)}%）`;
        } },
        xAxis: { type: 'category', data: items.map((i) => i.label), axisTick: { show: false } },
        yAxis: { type: 'value', splitLine: { lineStyle: { color: '#e7e3d5' } } },
        series: [{ type: 'bar', data: items.map((i) => i.count), itemStyle: { borderRadius: [6, 6, 0, 0], color: '#0E7C6B' }, barMaxWidth: 36 }],
      }}
    />
  );
}

export function SkillRadar({ indicators, values }: { indicators: { name: string; max: number }[]; values: number[] }) {
  return (
    <Chart
      option={{
        tooltip: {},
        radar: { indicator: indicators, radius: '68%', splitArea: { areaStyle: { color: ['#fff', '#f6f4ec'] } }, axisName: { color: '#52627A', fontSize: 11 } },
        series: [{ type: 'radar', data: [{ value: values, areaStyle: { opacity: 0.25 } }], symbolSize: 4 }],
      }}
    />
  );
}

export function VersionCompare({ oldHours, newHours, oldCount, newCount }: { oldHours: number; newHours: number; oldCount: number; newCount: number }) {
  return (
    <Chart
      height={220}
      option={{
        tooltip: {},
        legend: { bottom: 0, textStyle: { fontSize: 11, color: '#52627A' } },
        grid: { left: 8, right: 20, top: 20, bottom: 40, containLabel: true },
        xAxis: { type: 'category', data: ['任务数', '预计小时'], axisTick: { show: false } },
        yAxis: { type: 'value', splitLine: { lineStyle: { color: '#e7e3d5' } } },
        series: [
          { name: '调整前', type: 'bar', data: [oldCount, oldHours], itemStyle: { borderRadius: [6, 6, 0, 0], color: '#8B96A8' }, barMaxWidth: 28 },
          { name: '调整后', type: 'bar', data: [newCount, newHours], itemStyle: { borderRadius: [6, 6, 0, 0], color: '#426EFE' }, barMaxWidth: 28 },
        ],
      }}
    />
  );
}
