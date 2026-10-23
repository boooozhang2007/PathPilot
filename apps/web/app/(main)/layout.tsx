'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, clearToken, getToken } from '@/lib/api';

const NAV = [
  { href: '/dashboard', label: '首页', icon: '◧' },
  { href: '/jobs', label: '岗位洞察', icon: '◎' },
  { href: '/roadmap', label: '成长路线', icon: '◇' },
  { href: '/planning', label: '动态规划', icon: '↻' },
  { href: '/profile', label: '能力档案', icon: '☰' },
  { href: '/tasks', label: '任务中心', icon: '✓' },
  { href: '/advisor', label: 'AI 顾问', icon: '✦' },
];

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [nickname, setNickname] = useState('');
  const [engine, setEngine] = useState<string>('');

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    setNickname(localStorage.getItem('pp_nickname') ?? '同学');
    api<{ engine: string }>('/api/agent/config').then((c) => setEngine(c.engine)).catch(() => {});
  }, [router]);

  async function logout() {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch {
      /* 忽略 */
    }
    clearToken();
    router.replace('/login');
  }

  return (
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-20 flex w-56 flex-col border-r border-line bg-ink text-white">
        <div className="flex items-center gap-2 px-5 py-5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-xs font-black text-ink">PP</span>
          <div>
            <div className="text-sm font-black tracking-tight">PathPilot</div>
            <div className="text-[10px] text-white/50">AI 职业成长规划</div>
          </div>
        </div>
        <nav className="mt-2 flex-1 space-y-1 px-3">
          {NAV.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  active ? 'bg-white text-ink' : 'text-white/70 hover:bg-white/10 hover:text-white'
                }`}
              >
                <span className="text-xs opacity-70">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-white/10 px-4 py-4">
          <div className="mb-2 flex items-center gap-2 text-xs text-white/60">
            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: engine === 'pi-llm' ? '#4ade80' : '#fbbf24' }} />
            {engine === 'pi-llm' ? 'AI 模型通道' : '规则引擎通道'}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold">{nickname}</span>
            <button onClick={logout} className="text-[11px] text-white/50 transition hover:text-white">
              退出
            </button>
          </div>
        </div>
      </aside>
      <main className="ml-56 flex-1 px-8 py-8">{children}</main>
    </div>
  );
}
