/** 滚轮上下各留三行空白，因此偏移量 0 对应第一项居中。 */
export function wheelIndex(offset: number, rowHeight: number, itemCount: number): number {
  return Math.max(0, Math.min(itemCount - 1, Math.round(offset / rowHeight)));
}

export function initialYearMonth(value: string, currentYear: number) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value);
  if (match && Number(match[1]) > 0) {
    return { year: Number(match[1]), month: Number(match[2]) };
  }
  return { year: currentYear + 2, month: 6 };
}

export function pickerYears(currentYear: number, selectedYear: number): number[] {
  const first = Math.max(1, Math.min(currentYear - 10, selectedYear));
  const last = Math.max(currentYear + 15, selectedYear);
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}

export function formatYearMonth(year: number, month: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
}
