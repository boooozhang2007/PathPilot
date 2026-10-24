'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, setToken } from '@/lib/api';

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
    } catch (e) {
      setErr(e instanceof Error ? e.message : '操作失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-4">
      <div className="pp-anim w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-ink text-sm font-black text-white">PP</span>
            <span className="text-xl font-black tracking-tight">PathPilot AI</span>
          </div>
          <p className="mt-2 text-xs text-slate-1">岗位证据 · 能力档案 · 可执行的成长计划</p>
        </div>
        <form onSubmit={submit} className="pp-card p-6 shadow-sm">
          <div className="mb-5 flex rounded-xl bg-paper-2 p-1 text-sm font-semibold">
            <button type="button" className={`flex-1 rounded-lg py-2 transition ${mode === 'login' ? 'bg-white shadow-sm' : 'text-slate-1'}`} onClick={() => setMode('login')}>
              登录
            </button>
            <button type="button" className={`flex-1 rounded-lg py-2 transition ${mode === 'register' ? 'bg-white shadow-sm' : 'text-slate-1'}`} onClick={() => setMode('register')}>
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
          {err && <div className="mb-3 rounded-lg bg-accent-soft px-3 py-2 text-xs text-accent">{err}</div>}
          <button className="pp-btn pp-btn-primary w-full py-2.5 text-sm" disabled={busy}>
            {busy ? '请稍候…' : mode === 'login' ? '登录' : '创建账号'}
          </button>
        </form>
      </div>
    </main>
  );
}
