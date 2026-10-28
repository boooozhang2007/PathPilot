import { describe, expect, it } from 'vitest';
import { formatYearMonth, initialYearMonth, pickerYears, wheelIndex } from './monthPicker';

describe('毕业年月滚轮', () => {
  it('打开已有年月时保留年份和非一月的月份', () => {
    expect(initialYearMonth('2031-11', 2026)).toEqual({ year: 2031, month: 11 });
    expect(initialYearMonth('2020-02', 2026)).toEqual({ year: 2020, month: 2 });
  });

  it('空值或无效月份使用默认毕业年月', () => {
    for (const value of ['', '2028-00', '2028-13', 'not-a-date']) {
      expect(initialYearMonth(value, 2026)).toEqual({ year: 2028, month: 6 });
    }
  });

  it('滚动到中心行时更新年份和月份，边界回弹不越界', () => {
    const years = pickerYears(2026, 2028);
    expect(years[wheelIndex(years.indexOf(2031) * 44, 44, years.length)]).toBe(2031);
    expect(wheelIndex(10 * 44 + 21, 44, 12) + 1).toBe(11);
    expect(wheelIndex(10 * 44 + 23, 44, 12) + 1).toBe(12);
    expect(wheelIndex(-44, 44, 12)).toBe(0);
    expect(wheelIndex(9999, 44, 12)).toBe(11);
  });

  it('年份范围包含已保存的过去或远期毕业年份', () => {
    expect(pickerYears(2026, 2000)).toContain(2000);
    expect(pickerYears(2026, 2050)).toContain(2050);
    expect(pickerYears(2026, 2028)).toContain(2041);
  });

  it('提交年月保持两位月份，可用于 API 日期', () => {
    expect(formatYearMonth(2031, 2)).toBe('2031-02');
    expect(formatYearMonth(2029, 12)).toBe('2029-12');
  });
});
