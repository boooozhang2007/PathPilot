// 本地时区日期工具：服务端时间均为 UTC ISO 字符串，比较/展示前统一转本地 YYYY-MM-DD
/** UTC ISO 字符串 → 本地时区 YYYY-MM-DD；无法解析时退回原串前 10 位 */
export function toLocalDateStr(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** 今天（本地时区）的 YYYY-MM-DD */
export function todayLocal(): string {
  return toLocalDateStr(new Date().toISOString());
}
