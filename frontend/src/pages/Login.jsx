import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, ArrowRight, MessageSquare, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';

export default function Login() {
  const { login, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('demo@test.com');
  const [password, setPassword] = useState('demo1234');
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    try {
      await login(email, password);
      toast.success('Welcome back');
      navigate('/app');
    } catch (e) {
      const msg = e?.response?.data?.detail || 'Login failed';
      setErr(msg);
      toast.error(msg);
    }
  };

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
      <div className="hidden bg-zinc-950 text-zinc-100 lg:block">
        <div className="flex h-full flex-col p-12">
          <Link to="/" className="flex items-center gap-2 text-base font-semibold">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-wa-dark text-white">
              <MessageSquare className="h-3.5 w-3.5" strokeWidth={2.5} />
            </span>
            wabridge
          </Link>
          <div className="bg-blueprint mt-auto rounded-md border border-zinc-800 p-8">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-green-400">SLA · 99.9%</div>
            <h2 className="mt-3 font-display text-3xl font-semibold leading-tight tracking-tight">
              "We replaced four shadow tools with one disciplined console."
            </h2>
            <p className="mt-4 text-sm text-zinc-400">— Ops lead at a 200-store retail chain</p>
            <div className="mt-8 grid grid-cols-3 gap-4 text-xs">
              <div><div className="font-display text-2xl font-semibold text-white">2.4M</div><div className="text-zinc-500">msgs / mo</div></div>
              <div><div className="font-display text-2xl font-semibold text-white">98.7%</div><div className="text-zinc-500">delivery</div></div>
              <div><div className="font-display text-2xl font-semibold text-white">14 d</div><div className="text-zinc-500">free trial</div></div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm animate-fadein">
          <Link to="/" className="mb-10 flex items-center gap-2 text-sm font-medium text-zinc-700 lg:hidden">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-wa-dark text-white">
              <MessageSquare className="h-3 w-3" strokeWidth={2.5} />
            </span>
            wabridge
          </Link>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Welcome back</h1>
          <p className="mt-1 text-sm text-zinc-600">Sign in to your console.</p>

          <form onSubmit={submit} className="mt-8 space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-700">Email</label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                <input
                  data-testid="login-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-md border border-zinc-300 bg-white py-2.5 pl-10 pr-3 text-sm outline-none focus:border-wa-light focus:ring-2 focus:ring-wa-light/20"
                  placeholder="you@company.com"
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-700">Password</label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                <input
                  data-testid="login-password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-md border border-zinc-300 bg-white py-2.5 pl-10 pr-3 text-sm outline-none focus:border-wa-light focus:ring-2 focus:ring-wa-light/20"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {err && (
              <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5" /> {err}
              </div>
            )}

            <button
              type="submit"
              data-testid="login-submit"
              disabled={loading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-green-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-wa-mid disabled:opacity-60"
            >
              {loading ? 'Signing in…' : <>Sign in <ArrowRight className="h-3.5 w-3.5" /></>}
            </button>
          </form>

          <p className="mt-6 text-sm text-zinc-600">
            New here?{' '}
            <Link to="/register" data-testid="goto-register" className="font-medium text-wa-dark hover:underline">
              Create your workspace
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
