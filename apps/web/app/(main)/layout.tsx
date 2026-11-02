'use client';
// 主布局:左侧深色导航侧栏(桌面常驻、移动端抽屉),右侧浅色工作区;顾问页为全高布局
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, clearToken, getToken } from '@/lib/api';
import { Ic, Logo } from '@/components/Icon';
import { Tour, TOUR_KEY } from '@/components/Tour';
import { CommandPalette } from '@/components/CommandPalette';

const NAV = [
  { href: '/dashboard', label: '首页', icon: 'target', num: '01' },
  { href: '/jobs', label: '岗位洞察', icon: 'globe', num: '02' },
  { href: '/roadmap', label: '成长路线', icon: 'roadmap', num: '03' },
  { href: '/tasks', label: '任务中心', icon: 'checkCircle', num: '04' },
  { href: '/growth', label: '成长统计', icon: 'rocket', num: '05' },
  { href: '/advisor', label: 'AI 顾问', icon: 'chat', num: '06' },
  { href: '/profile', label: '能力档案', icon: 'layers', num: '07' },
  { href: '/resume', label: '简历工作台', icon: 'pen', num: '08' },
  { href: '/planning', label: '动态规划', icon: 'refresh', num: '09' },
];

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [nickname, setNickname] = useState('');
  const [avatar, setAvatar] = useState<string | null>(null);
  const [engine, setEngine] = useState<string>('');
  const [tourOpen, setTourOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const isAdvisor = pathname === '/advisor';

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));
  }, []);

  // 命令面板等其他入口切主题时,同步侧栏 dark 状态(图标即时跟随)
  useEffect(() => {
    const onTheme = () => setDark(document.documentElement.classList.contains('dark'));
    window.addEventListener('pp:theme', onTheme);
    return () => window.removeEventListener('pp:theme', onTheme);
  }, []);

  useEffect(() => {
    const openNavigation = () => setMobileNavOpen(true);
    window.addEventListener('pp:nav', openNavigation);
    return () => window.removeEventListener('pp:nav', openNavigation);
  }, []);

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('pp_theme', next ? 'dark' : 'light');
    window.dispatchEvent(new Event('pp:theme'));
  }

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
      {/* 深色侧栏:品牌 → 路线节点导航 → 状态与账号;移动端从左侧滑出 */}
      <aside className={`leather fixed inset-y-0 left-0 z-50 flex w-60 flex-col text-white transition-transform duration-200 md:translate-x-0 ${mobileNavOpen ? 'translate-x-0' : '-translate-x-full'}`}>
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
                className={`group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${active ? 'bg-white text-[#202d2b]' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}
                onClick={() => setMobileNavOpen(false)}
              >
                {/* 活跃节点:蓝图路线上的当前站点 */}
                {active && <span className="absolute -left-3 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-accent" />}
                <Ic name={item.icon} size={17} className={active ? 'text-accent' : 'opacity-70 transition group-hover:opacity-100'} />
                <span className="font-medium">{item.label}</span>
                <span className={`num ml-auto text-[10px] ${active ? 'text-accent' : 'text-white/30'}`}>{item.num}</span>
              </Link>
            );
          })}
        </nav>

        <div className="space-y-3 border-t border-white/10 px-4 py-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.dispatchEvent(new Event('pp:cmdk'))}
              className="flex flex-1 items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-white/70 transition hover:border-white/40 hover:text-white"
              title="命令面板"
            >
              <Ic name="menu" size={13} />
              快速跳转
              <span className="num ml-auto rounded border border-white/15 px-1 py-0.5 text-[9px] text-white/45">⌘K</span>
            </button>
            <button onClick={toggleTheme} title={dark ? '切到浅色' : '切到深色'} className="rounded-lg border border-white/15 p-2 text-white/70 transition hover:border-white/40 hover:text-white">
              <Ic name={dark ? 'spark' : 'moon'} size={14} />
            </button>
          </div>
          <button onClick={() => setTourOpen(true)} className="flex w-full items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-white/70 transition hover:border-white/40 hover:text-white" data-tour="tour-entry">
            <Ic name="compass" size={14} />
            新手引导 · 五步上手
          </button>
          <div className="flex items-center gap-2 text-[11px] text-white/55">
            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: engine === 'pi-llm' ? '#71c6a8' : '#e9b65e' }} />
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
              <Link href="/profile" onClick={() => setMobileNavOpen(false)} className="text-[10px] text-white/45 transition hover:text-white/80">
                编辑档案
              </Link>
            </div>
            <button onClick={logout} title="退出登录" className="rounded-lg p-1.5 text-white/40 transition hover:bg-white/10 hover:text-white">
              <Ic name="door" size={15} />
            </button>
          </div>
        </div>
      </aside>

      {mobileNavOpen && <button aria-label="关闭导航菜单" className="fixed inset-0 z-40 bg-black/35 md:hidden" onClick={() => setMobileNavOpen(false)} />}

      <main className={`workspace ml-0 flex-1 md:ml-60 ${isAdvisor ? 'flex h-[100dvh] flex-col overflow-hidden p-0' : 'min-h-screen px-4 py-3 md:px-9 md:py-8'}`}>
        {!isAdvisor && (
          <div className="mb-3 flex h-10 items-center gap-3 md:hidden">
            <button aria-label="打开导航菜单" onClick={() => setMobileNavOpen(true)} className="rounded-md p-2 text-slate-1 hover:bg-paper-2">
              <Ic name="menu" size={19} />
            </button>
            <Logo size={28} />
            <span className="text-sm font-semibold text-ink">PathPilot</span>
          </div>
        )}
        <div className={isAdvisor ? 'min-h-0 w-full flex-1' : 'max-w-[1200px]'}>{children}</div>
      </main>

      {tourOpen && <Tour onClose={() => setTourOpen(false)} />}
      <CommandPalette onLogout={logout} />
    </div>
  );
}
