import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MessageSquare } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import AuthForm from '../components/AuthForm';

export default function Login() {
  const { setSession } = useAuth();
  const navigate = useNavigate();

  const onSuccess = (data) => {
    setSession(data);
    navigate(data?.is_superadmin ? '/app/admin' : '/app');
  };

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
      <div className="hidden bg-zinc-950 text-zinc-100 lg:block">
        <div className="flex h-full flex-col p-12">
          <Link to="/" className="flex items-center gap-2 text-base font-semibold">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-wa-light text-white">
              <MessageSquare className="h-3.5 w-3.5" strokeWidth={2.5} />
            </span>
            wabridge
          </Link>
          <div className="bg-blueprint mt-auto rounded-md border border-zinc-800 p-8">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-wa-light">SLA · 99.9%</div>
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
            <span className="grid h-6 w-6 place-items-center rounded-md bg-wa-light text-white">
              <MessageSquare className="h-3 w-3" strokeWidth={2.5} />
            </span>
            wabridge
          </Link>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Welcome back</h1>
          <p className="mt-1 text-sm text-zinc-600">Pick how you want to sign in.</p>

          <div className="mt-6">
            <AuthForm purpose="login" onSuccess={onSuccess} />
          </div>

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
