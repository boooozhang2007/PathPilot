'use client';
// ⌘K 命令面板(Linear/Vercel 式):键盘导航 + 模糊过滤,页面跳转与全局动作
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Ic, type IconName } from './Icon';

interface Cmd {
  id: string;
  icon: IconName;
  label: string;
  group: '页面' | '动作';
  keywords?: string;
  run: () => void;
}

export function CommandPalette({ onLogout }: { onLogout: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const toggleTheme = useCallback(() => {
    const el = document.documentElement;
    const next = el.classList.toggle('dark');
    localStorage.setItem('pp_theme', next ? 'dark' : 'light');
    // 通知主布局同步侧栏主题状态(与 MainLayout.toggleTheme 同一契约)
    window.dispatchEvent(new Event('pp:theme'));
  }, []);

  const cmds = useMemo<Cmd[]>(
    () => [
      { id: 'dashboard', icon: 'target', label: '首页', group: '页面', keywords: 'dashboard home', run: () => router.push('/dashboard') },
      { id: 'jobs', icon: 'globe', label: '岗位洞察', group: '页面', keywords: 'job 分析 岗位', run: () => router.push('/jobs') },
      { id: 'roadmap', icon: 'roadmap', label: '成长路线', group: '页面', keywords: 'roadmap 规划 路线', run: () => router.push('/roadmap') },
      { id: 'tasks', icon: 'checkCircle', label: '任务中心', group: '页面', keywords: 'task 任务 打卡', run: () => router.push('/tasks') },
      { id: 'growth', icon: 'rocket', label: '成长统计', group: '页面', keywords: 'growth 统计 成就', run: () => router.push('/growth') },
      { id: 'advisor', icon: 'chat', label: 'AI 顾问', group: '页面', keywords: 'chat 对话 ai', run: () => router.push('/advisor') },
      { id: 'profile', icon: 'layers', label: '能力档案', group: '页面', keywords: 'profile 档案 技能', run: () => router.push('/profile') },
      { id: 'resume', icon: 'pen', label: '简历工作台', group: '页面', keywords: 'resume 简历', run: () => router.push('/resume') },
      { id: 'planning', icon: 'refresh', label: '动态规划', group: '页面', keywords: 'planning 重规划', run: () => router.push('/planning') },
      { id: 'theme', icon: 'moon', label: '切换深色 / 浅色主题', group: '动作', keywords: 'dark theme 深色 主题', run: toggleTheme },
      {
        id: 'tour',
        icon: 'compass',
        label: '重看新手引导',
        group: '动作',
        keywords: 'tour guide 引导 教学',
        run: () => {
          localStorage.removeItem('pp_tour_done');
          router.push('/dashboard');
          setTimeout(() => location.reload(), 100);
        },
      },
      { id: 'logout', icon: 'door', label: '退出登录', group: '动作', keywords: 'logout 退出', run: onLogout },
    ],
    [router, toggleTheme, onLogout]
  );

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return cmds;
    return cmds.filter((c) => (c.label + ' ' + (c.keywords ?? '')).toLowerCase().includes(s));
  }, [cmds, q]);

  // 全局快捷键:Ctrl/Cmd + K;侧栏按钮通过 pp:cmdk 事件唤起
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    const onSignal = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('pp:cmdk', onSignal);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pp:cmdk', onSignal);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQ('');
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => setActive(0), [q]);

  const runAt = useCallback(
    (i: number) => {
      const c = filtered[i];
      if (!c) return;
      setOpen(false);
      c.run();
    },
    [filtered]
  );

  if (!open) return null;
  let lastGroup = '';

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center bg-ink/45 px-4 pt-[16vh] backdrop-blur-sm" onClick={() => setOpen(false)}>
      <div className="glass w-full max-w-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
          <Ic name="spark" size={15} className="text-accent" />
          <input
            ref={inputRef}
            className="flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-slate-2"
            placeholder="搜索页面或执行动作…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((v) => Math.min(v + 1, filtered.length - 1));
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((v) => Math.max(v - 1, 0));
              }
              if (e.key === 'Enter') {
                e.preventDefault();
                runAt(active);
              }
            }}
          />
          <span className="num rounded-md border border-line px-1.5 py-0.5 text-[10px] text-slate-2">ESC</span>
        </div>
        <div className="max-h-80 overflow-y-auto py-1.5">
          {filtered.length === 0 && <div className="px-4 py-6 text-center text-xs text-slate-2">没有匹配的命令</div>}
          {filtered.map((c, i) => {
            const head = c.group !== lastGroup ? ((lastGroup = c.group), true) : false;
            return (
              <div key={c.id}>
                {head && <div className="num px-4 pb-1 pt-2.5 text-[10px] font-semibold tracking-[0.2em] text-slate-2">{c.group.toUpperCase()}</div>}
                <button
                  className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition ${i === active ? 'bg-accent-soft text-ink' : 'text-slate-1 hover:bg-paper'}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => runAt(i)}
                >
                  <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${i === active ? 'bg-accent text-white' : 'bg-paper-2 text-slate-1'}`}>
                    <Ic name={c.icon} size={14} />
                  </span>
                  <span className="flex-1">{c.label}</span>
                  {i === active && <span className="num rounded-md border border-line px-1.5 py-0.5 text-[10px] text-slate-2">↵</span>}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
