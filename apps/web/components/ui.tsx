'use client';
import type { ReactNode } from 'react';

export function Loading({ text = '加载中…' }: { text?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-1">
      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-line border-t-accent" />
      {text}
    </div>
  );
}

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-card border border-dashed border-line bg-white/60 py-14 text-center">
      <div className="text-sm font-semibold text-ink">{title}</div>
      {hint && <div className="max-w-sm text-xs leading-5 text-slate-1">{hint}</div>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-card border border-accent/30 bg-accent-soft px-4 py-3 text-sm text-accent">
      <div className="font-semibold">出错了</div>
      <div className="mt-1 text-xs leading-5">{message}</div>
      {onRetry && (
        <button className="pp-btn pp-btn-ghost mt-2 px-3 py-1 text-xs" onClick={onRetry}>
          重试
        </button>
      )}
    </div>
  );
}

export function Tag({ tone, children }: { tone: 'accent' | 'teal' | 'amber' | 'slate' | 'ink'; children: ReactNode }) {
  const map = {
    accent: 'bg-accent-soft text-accent',
    teal: 'bg-teal-soft text-teal',
    amber: 'bg-amber-soft text-amber',
    slate: 'bg-paper-2 text-slate-1',
    ink: 'bg-ink text-white',
  } as const;
  return <span className={`pp-tag ${map[tone]}`}>{children}</span>;
}

export function PageHeader({ title, desc, right }: { title: string; desc?: string; right?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {desc && <p className="mt-1 text-sm text-slate-1">{desc}</p>}
      </div>
      {right}
    </div>
  );
}

export function Ring({ value, size = 132, label }: { value: number; size?: number; label?: string }) {
  const r = size / 2 - 10;
  const c = 2 * Math.PI * r;
  const off = c * (1 - value / 100);
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--color-line)" strokeWidth="10" fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="var(--color-accent)"
          strokeWidth="10"
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={off}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset .8s ease' }}
        />
      </svg>
      <div className="absolute text-center">
        <div className="text-2xl font-bold">{value}%</div>
        {label && <div className="text-[11px] text-slate-1">{label}</div>}
      </div>
    </div>
  );
}
