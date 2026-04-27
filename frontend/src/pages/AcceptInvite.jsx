import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { MessageSquare, Lock, User, ArrowRight, AlertCircle } from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';

export default function AcceptInvite() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { setSession } = useAuth();
  const [token, setToken] = useState(params.get('token') || '');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      const { data } = await api.post('/team/accept-invite', { token, password, full_name: fullName });
      setSession(data);
      toast.success('Welcome to the team!');
      navigate('/app');
    } catch (e2) {
      const msg = e2?.response?.data?.detail || 'Failed';
      setErr(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally { setBusy(false); }
  };

  return (
    <div className="grid min-h-screen place-items-center p-6">
      <div className="w-full max-w-sm animate-fadein">
        <Link to="/" className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-zinc-700">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-wa-light text-white"><MessageSquare className="h-3 w-3" strokeWidth={2.5} /></span>
          wabridge
        </Link>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Accept invite</h1>
        <p className="mt-1 text-sm text-zinc-600">Set a password to join the workspace.</p>

        <form onSubmit={submit} className="mt-8 space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-zinc-700">Invite token</label>
            <input data-testid="invite-token" required value={token} onChange={(e) => setToken(e.target.value)} className="w-full rounded-md border border-zinc-300 px-3 py-2.5 font-mono text-xs" placeholder="paste invite token" />
          </div>
          <div className="relative">
            <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full rounded-md border border-zinc-300 py-2.5 pl-10 pr-3 text-sm" placeholder="Full name (optional)" />
          </div>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input data-testid="invite-password" required type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-md border border-zinc-300 py-2.5 pl-10 pr-3 text-sm" placeholder="At least 6 characters" />
          </div>
          {err && <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700"><AlertCircle className="mt-0.5 h-3.5 w-3.5" />{err}</div>}
          <button data-testid="accept-submit" disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-wa-dark px-4 py-2.5 text-sm font-medium text-white hover:bg-wa-mid disabled:opacity-60">
            {busy ? 'Joining…' : <>Join workspace <ArrowRight className="h-3.5 w-3.5" /></>}
          </button>
        </form>
      </div>
    </div>
  );
}
