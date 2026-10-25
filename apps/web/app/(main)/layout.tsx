'use client';
// 主布局「墨线蓝图」:左侧墨蓝制图侧栏(路线节点导航),右侧纸面工作区
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, clearToken, getToken } from '@/lib/api';
import { Ic, Logo } from '@/components/Icon';
import { Tour, TOUR_KEY } from '@/components/Tour';

const NAV = [
  { href: '/dashboard', label: '首页', icon: 'target', num: '01' },
  { href: '/jobs', label: '岗位洞察', icon: 'globe', num: '02' },
  { href: '/roadmap', label: '成长路线', icon: 'roadmap', num: '03' },
  { href: '/tasks', label: '任务中心', icon: 'checkCircle', num: '04' },
  { href: '/advisor', label: 'AI 顾问', icon: 'chat', num: '05' },
  { href: '/profile', label: '能力档案', icon: 'layers', num: '06' },
  { href: '/planning', label: '动态规划', icon: 'refresh', num: '07' },
];

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [nickname, setNickname] = useState('');
  const [avatar, setAvatar] = useState<string | null>(null);
  const [engine, setEngine] = useState<string>('');
  const [tourOpen, setTourOpen] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    setNickname(localStorage.getItem('pp_nickname') ?? '同学');
    api<{ engine: string }>('/api/agent/config').then((c) => setEngine(c.engine)).catch(() => {});
    api<{ nickname: string; avatar: string | null } | null>('/api/profile')
      .then((p) => {
        if (p) {
          setNickname(p.nickname);
          setAvatar(p.avatar);
        }
      })
      .catch(() => {});
    // 首次访问自动开启手把手引导
    if (!localStorage.getItem(TOUR_KEY)) {
      const t = setTimeout(() => setTourOpen(true), 700);
      return () => clearTimeout(t);
    }
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
      {/* 墨蓝侧栏:品牌 → 路线节点导航 → 状态与账号 */}
      <aside className="ink-panel bp-grid-dark fixed inset-y-0 left-0 z-30 flex w-60 flex-col border-r border-ink text-white">
        <div className="flex items-center gap-3 px-5 pb-6 pt-6">
          <Logo size={36} />
          <div className="min-w-0">
            <div className="font-display text-[15px] font-bold tracking-tight">PathPilot</div>
            <div className="num text-[10px] tracking-[0.18em] text-white/45">CAREER BLUEPRINT</div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3" data-tour="nav">
          {NAV.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                data-tour-anchor={`nav-${item.href}`}
                className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${active ? 'bg-white text-ink shadow-lg shadow-black/20' : 'text-white/65 hover:bg-white/10 hover:text-white'}`}
              >
                {/* 活跃节点:蓝图路线上的当前站点 */}
                {active && <span className="absolute -left-3 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-accent ring-4 ring-accent/25" />}
                <Ic name={item.icon} size={17} className={active ? 'text-accent' : 'opacity-70 group-hover:opacity-100'} />
                <span className="font-medium">{item.label}</span>
                <span className={`num ml-auto text-[10px] tracking-widest ${active ? 'text-accent' : 'text-white/30'}`}>{item.num}</span>
              </Link>
            );
          })}
        </nav>

        <div className="space-y-3 border-t border-white/10 px-4 py-4">
          <button onClick={() => setTourOpen(true)} className="flex w-full items-center gap-2 rounded-xl border border-white/15 px-3 py-2 text-xs font-semibold text-white/75 transition hover:border-accent hover:text-white" data-tour="tour-entry">
            <Ic name="compass" size={14} />
            新手引导 · 五步上手
          </button>
          <div className="flex items-center gap-2 text-[11px] text-white/50">
            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: engine === 'pi-llm' ? '#4ade80' : '#fbbf24', boxShadow: `0 0 8px ${engine === 'pi-llm' ? '#4ade80' : '#fbbf24'}` }} />
            {engine === 'pi-llm' ? 'AI 模型在线' : '模型未配置'}
          </div>
          <div className="flex items-center gap-2.5">
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatar} alt={nickname} className="h-8 w-8 rounded-full object-cover ring-2 ring-white/20" />
            ) : (
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-sm font-bold text-white/80">{(nickname || '同')[0]}</span>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-semibold">{nickname}</div>
              <Link href="/profile" className="text-[10px] text-white/45 transition hover:text-white/80">
                编辑档案
              </Link>
            </div>
            <button onClick={logout} title="退出登录" className="rounded-lg p-1.5 text-white/40 transition hover:bg-white/10 hover:text-white">
              <Ic name="door" size={15} />
            </button>
          </div>
        </div>
      </aside>

      {/* 纸面工作区 */}
      <main className="bp-grid ml-60 min-h-screen flex-1 px-9 py-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>

      {tourOpen && <Tour onClose={() => setTourOpen(false)} />}
    </div>
  );
}
