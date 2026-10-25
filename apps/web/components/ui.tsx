'use client';
import type { ReactNode } from 'react';
import { Ic } from './Icon';

export function Loading({ text = '加载中…' }: { text?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-20 text-sm text-slate-1">
      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-line-2 border-t-accent" />
      {text}
    </div>
  );
}

export function Empty({ title, hint, action, icon = 'compass' }: { title: string; hint?: string; action?: ReactNode; icon?: string }) {
  return (
    <div className="bp-grid flex flex-col items-center justify-center gap-3 rounded-card border border-dashed border-line-2 bg-white/50 py-16 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-white text-slate-2">
        <Ic name={icon} size={20} />
      </span>
      <div className="font-display text-base font-bold text-ink">{title}</div>
      {hint && <div className="max-w-sm text-xs leading-5 text-slate-1">{hint}</div>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-card border border-[#e8b4ae] bg-[#fdf1ef] px-4 py-3 text-sm text-[#b3271d]">
      <Ic name="warn" size={16} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="text-xs leading-5">{message}</div>
        {onRetry && (
          <button className="pp-btn pp-btn-ghost mt-2 px-3 py-1 text-xs" onClick={onRetry}>
            重试
          </button>
        )}
      </div>
    </div>
  );
}

export function Tag({ tone, children }: { tone: 'accent' | 'teal' | 'amber' | 'slate' | 'ink'; children: ReactNode }) {
  const map = {
    accent: 'bg-accent-soft text-accent-deep',
    teal: 'bg-teal-soft text-teal',
    amber: 'bg-amber-soft text-amber',
    slate: 'bg-paper-2 text-slate-1',
    ink: 'bg-ink text-white',
  } as const;
  return <span className={`pp-tag ${map[tone]}`}>{children}</span>;
}

/**
 * 页头:眉标(编号·模块) + 衬线大标题 + 一句话要点 + 右侧动作。
 * 注意力结构:眉标引导 → 大标题定调 → 动作收口。
 */
export function PageHeader({ eyebrow, title, desc, right }: { eyebrow?: string; title: string; desc?: string; right?: ReactNode }) {
  return (
    <header className="reveal mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
        <h1 className="title-metal font-display text-[28px] font-bold leading-tight tracking-tight">{title}</h1>
        {desc && <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-1">{desc}</p>}
      </div>
      {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
    </header>
  );
}

/** 数据统计块:等宽大数字 + 标签 */
export function Stat({ label, value, unit, tone = 'ink' }: { label: string; value: ReactNode; unit?: string; tone?: 'ink' | 'accent' | 'teal' | 'amber' }) {
  const color = { ink: 'text-ink', accent: 'text-accent', teal: 'text-teal', amber: 'text-amber' }[tone];
  return (
    <div className="pp-card px-5 py-4">
      <div className="text-xs font-semibold text-slate-1">{label}</div>
      <div className={`num mt-1 text-2xl font-bold ${color}`}>
        {value}
        {unit && <span className="ml-1 text-sm font-semibold text-slate-2">{unit}</span>}
      </div>
    </div>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <div className="flex items-center gap-2 text-sm font-bold text-ink">
        <span className="inline-block h-3.5 w-1 rounded-full bg-accent" />
        {children}
      </div>
      {right}
    </div>
  );
}

export function Ring({ value, size = 132, label, tone = 'accent', track = 'var(--color-line)' }: { value: number; size?: number; label?: string; tone?: 'accent' | 'teal'; track?: string }) {
  const r = size / 2 - 10;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.min(Math.max(value, 0), 100) / 100);
  const stroke = tone === 'teal' ? 'var(--color-teal)' : 'var(--color-accent)';
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth="9" fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={stroke} strokeWidth="9" fill="none" strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round" style={{ transition: 'stroke-dashoffset .9s cubic-bezier(.22,.8,.32,1)' }} />
      </svg>
      <div className="absolute text-center">
        <div className="num text-2xl font-bold">{value}%</div>
        {label && <div className="mt-0.5 text-[11px] text-slate-1">{label}</div>}
      </div>
    </div>
  );
}
