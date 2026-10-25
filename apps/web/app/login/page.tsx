'use client';
// 登录/注册:左墨蓝图品牌面板 + 右表单
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, setToken } from '@/lib/api';
import { Ic, Logo } from '@/components/Icon';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const res = await api<{ token: string; user: { nickname: string } }>(mode === 'login' ? '/api/auth/login' : '/api/auth/register', {
        method: 'POST',
        json: mode === 'login' ? { email, password } : { email, password, nickname },
      });
      setToken(res.token);
      localStorage.setItem('pp_nickname', res.user.nickname);
      router.push('/dashboard');
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : '操作失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen bg-paper">
      {/* 品牌面板:蓝图网格 + 路线母题 */}
      <section className="ink-panel bp-grid-dark relative hidden w-[46%] flex-col justify-between p-12 text-white lg:flex">
        <div className="flex items-center gap-3">
          <Logo size={40} />
          <div>
            <div className="font-display text-lg font-bold">PathPilot</div>
            <div className="num text-[10px] tracking-[0.22em] text-white/45">CAREER BLUEPRINT</div>
          </div>
        </div>
        <div>
          <div className="eyebrow mb-3" style={{ color: '#8ba7ff' }}>
            岗位证据 → 能力档案 → 学期规划 → 任务证据
          </div>
          <h1 className="font-display max-w-md text-[32px] font-bold leading-snug">把职业目标,画成一张可以执行的成长蓝图。</h1>
          <div className="mt-8 flex items-center gap-3">
            {[
              { icon: 'globe', label: '岗位洞察' },
              { icon: 'roadmap', label: '成长路线' },
              { icon: 'checkCircle', label: '任务证据' },
              { icon: 'chat', label: 'AI 顾问' },
            ].map((s, i) => (
              <div key={s.label} className="flex items-center gap-3">
                <div className="flex flex-col items-center gap-1.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/15 bg-white/5">
                    <Ic name={s.icon} size={15} className="text-white/85" />
                  </span>
                  <span className="text-[10px] text-white/55">{s.label}</span>
                </div>
                {i < 3 && <span className="mb-5 h-px w-6 bg-white/20" />}
              </div>
            ))}
          </div>
        </div>
        <div className="num text-[10px] tracking-[0.2em] text-white/35">PATHPILOT · FOR CS STUDENTS</div>
      </section>

      {/* 表单区 */}
      <section className="bp-grid flex flex-1 items-center justify-center px-6 py-12">
        <div className="pp-anim w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <div className="flex items-center gap-2.5">
              <Logo size={34} />
              <span className="font-display text-lg font-bold">PathPilot AI</span>
            </div>
          </div>
          <div className="mb-7">
            <div className="eyebrow mb-2">WELCOME</div>
            <h2 className="font-display text-2xl font-bold">{mode === 'login' ? '欢迎回来' : '创建账号'}</h2>
            <p className="mt-1.5 text-sm text-slate-1">岗位证据 · 能力档案 · 可执行的成长计划</p>
          </div>
          <form onSubmit={submit} className="pp-card p-6">
            <div className="mb-5 flex rounded-xl bg-paper-2 p-1 text-sm font-semibold">
              <button type="button" className={`flex-1 rounded-lg py-2 transition ${mode === 'login' ? 'bg-white font-bold text-accent-deep shadow-sm' : 'text-slate-1'}`} onClick={() => setMode('login')}>
                登录
              </button>
              <button type="button" className={`flex-1 rounded-lg py-2 transition ${mode === 'register' ? 'bg-white font-bold text-accent-deep shadow-sm' : 'text-slate-1'}`} onClick={() => setMode('register')}>
                注册
              </button>
            </div>
            {mode === 'register' && (
              <div className="mb-3">
                <label className="pp-label">昵称</label>
                <input className="pp-input" value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="怎么称呼你" required maxLength={30} />
              </div>
            )}
            <div className="mb-3">
              <label className="pp-label">邮箱</label>
              <input className="pp-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
            </div>
            <div className="mb-4">
              <label className="pp-label">密码</label>
              <input className="pp-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={mode === 'register' ? '至少 8 位' : '密码'} required minLength={mode === 'register' ? 8 : 1} />
            </div>
            {err && (
              <div className="mb-3 flex items-center gap-1.5 rounded-lg bg-[#fdf1ef] px-3 py-2 text-xs text-[#b3271d]">
                <Ic name="warn" size={12} /> {err}
              </div>
            )}
            <button className="pp-btn pp-btn-primary w-full py-2.5 text-sm" disabled={busy}>
              {busy ? '请稍候…' : mode === 'login' ? '登录' : '创建账号'}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
