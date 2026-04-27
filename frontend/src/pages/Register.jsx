import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Building2, Mail, Lock, User, ArrowRight, MessageSquare, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';

export default function Register() {
  const { register, loading } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    email: '', password: '', company_name: '', full_name: '',
  });
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    try {
      await register(form);
      toast.success('Workspace ready. Trial activated.');
      navigate('/app/whatsapp');
    } catch (e) {
      const msg = e?.response?.data?.detail || 'Registration failed';
      setErr(msg);
      toast.error(msg);
    }
  };

  const set = (k) => (e) => setForm((s) => ({ ...s, [k]: e.target.value }));

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md animate-fadein">
          <Link to="/" className="mb-10 flex items-center gap-2 text-sm font-medium text-zinc-700">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-wa-dark text-white">
              <MessageSquare className="h-3 w-3" strokeWidth={2.5} />
            </span>
            wabridge
          </Link>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Create your workspace</h1>
          <p className="mt-1 text-sm text-zinc-600">14 days of Pro free. No card required.</p>

          <form onSubmit={submit} className="mt-8 space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-zinc-700">Full name</label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                  <input
                    data-testid="register-name" required value={form.full_name} onChange={set('full_name')}
                    className="w-full rounded-md border border-zinc-300 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-wa-light focus:ring-2 focus:ring-wa-light/20"
                    placeholder="Riya Patel" />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-zinc-700">Company</label>
                <div className="relative">
                  <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                  <input
                    data-testid="register-company" required value={form.company_name} onChange={set('company_name')}
                    className="w-full rounded-md border border-zinc-300 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-wa-light focus:ring-2 focus:ring-wa-light/20"
                    placeholder="Acme Corp" />
                </div>
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-700">Work email</label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                <input
                  data-testid="register-email" type="email" required value={form.email} onChange={set('email')}
                  className="w-full rounded-md border border-zinc-300 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-wa-light focus:ring-2 focus:ring-wa-light/20"
                  placeholder="you@company.com" />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-700">Password</label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                <input
                  data-testid="register-password" type="password" required minLength={6}
                  value={form.password} onChange={set('password')}
                  className="w-full rounded-md border border-zinc-300 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-wa-light focus:ring-2 focus:ring-wa-light/20"
                  placeholder="At least 6 characters" />
              </div>
            </div>

            {err && (
              <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5" /> {err}
              </div>
            )}

            <button
              type="submit" data-testid="register-submit" disabled={loading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-green-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-wa-mid disabled:opacity-60"
            >
              {loading ? 'Creating…' : <>Create workspace <ArrowRight className="h-3.5 w-3.5" /></>}
            </button>
          </form>

          <p className="mt-6 text-sm text-zinc-600">
            Already a customer?{' '}
            <Link to="/login" data-testid="goto-login" className="font-medium text-wa-dark hover:underline">Sign in</Link>
          </p>
        </div>
      </div>

      <div className="hidden bg-zinc-50 p-12 lg:block">
        <div className="flex h-full flex-col">
          <div className="bg-blueprint flex-1 rounded-md border border-zinc-200 bg-white p-8">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-wa-dark">What's inside</div>
            <h3 className="mt-3 font-display text-2xl font-semibold tracking-tight">Your full WhatsApp stack, day one.</h3>
            <ul className="mt-6 space-y-4 text-sm text-zinc-700">
              {[
                'Encrypted credential vault (AES-256)',
                'Bulk campaigns with approval gates',
                '3-pane real-time inbox + AI co-pilot',
                'Lead CRM with scoring & assignment',
                'API + webhooks for any ERP',
                'Audit log for every action',
              ].map((t) => (
                <li key={t} className="flex items-start gap-2.5">
                  <span className="mt-1 grid h-4 w-4 place-items-center rounded-full bg-green-600 text-[9px] font-bold text-white">✓</span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
