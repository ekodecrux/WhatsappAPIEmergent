import React, { useState } from 'react';
import api from '../lib/api';
import { Mail, Lock, ArrowRight, Phone, Sparkles, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Generic OTP form. Modes: 'email' | 'sms' | 'password'
 * purpose: 'login' | 'signup'
 * onSuccess: (data) => void  (data is the TokenOut payload from backend)
 */
export default function AuthForm({ purpose, onSuccess }) {
  const [mode, setMode] = useState('password');
  const [step, setStep] = useState('start'); // start -> verify
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [hint, setHint] = useState('');

  const [email, setEmail] = useState('demo@test.com');
  const [password, setPassword] = useState('demo1234');
  const [phone, setPhone] = useState('+919121664855');
  const [code, setCode] = useState('');
  const [fullName, setFullName] = useState('');
  const [company, setCompany] = useState('');

  const isSignup = purpose === 'signup';

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true); setHint('');
    try {
      if (mode === 'password') {
        if (isSignup) {
          const { data } = await api.post('/auth/register', { email, password, full_name: fullName, company_name: company });
          toast.success('Workspace ready');
          onSuccess(data);
        } else {
          const { data } = await api.post('/auth/login', { email, password });
          toast.success('Welcome back');
          onSuccess(data);
        }
      } else if (mode === 'email') {
        if (step === 'start') {
          const { data } = await api.post('/auth/email/request-otp', {
            email,
            purpose,
            full_name: isSignup ? fullName : undefined,
            company_name: isSignup ? company : undefined,
          });
          if (data.dev_code) setHint(`Dev code: ${data.dev_code}`);
          else toast.success('Code sent — check your email');
          setStep('verify');
        } else {
          const { data } = await api.post('/auth/email/verify-otp', {
            email, code, purpose,
            full_name: isSignup ? fullName : undefined,
            company_name: isSignup ? company : undefined,
          });
          toast.success(isSignup ? 'Workspace ready' : 'Signed in');
          onSuccess(data);
        }
      } else if (mode === 'sms') {
        if (step === 'start') {
          await api.post('/auth/sms/request-otp', {
            phone, purpose,
            email: isSignup ? email : undefined,
            full_name: isSignup ? fullName : undefined,
            company_name: isSignup ? company : undefined,
          });
          toast.success('SMS code sent');
          setStep('verify');
        } else {
          const { data } = await api.post('/auth/sms/verify-otp', {
            phone, code, purpose,
            email: isSignup ? email : undefined,
            full_name: isSignup ? fullName : undefined,
            company_name: isSignup ? company : undefined,
          });
          toast.success(isSignup ? 'Workspace ready' : 'Signed in');
          onSuccess(data);
        }
      }
    } catch (e2) {
      const detail = e2?.response?.data?.detail;
      const msg = typeof detail === 'string' ? detail : (Array.isArray(detail) ? detail.map(d => d.msg || JSON.stringify(d)).join(' ') : 'Failed');
      setErr(msg); toast.error(msg);
    } finally { setBusy(false); }
  };

  const switchMode = (m) => { setMode(m); setStep('start'); setErr(''); setCode(''); };

  return (
    <form onSubmit={submit} className="space-y-4">
      {/* Mode tabs */}
      <div className="grid grid-cols-3 gap-1 rounded-md border border-zinc-200 bg-zinc-50 p-1 text-xs">
        {[
          { id: 'password', label: 'Password', icon: Lock },
          { id: 'email', label: 'Email OTP', icon: Mail },
          { id: 'sms', label: 'SMS OTP', icon: Phone },
        ].map(t => (
          <button
            key={t.id}
            type="button"
            data-testid={`auth-mode-${t.id}`}
            onClick={() => switchMode(t.id)}
            className={`inline-flex items-center justify-center gap-1.5 rounded px-2 py-1.5 transition ${mode === t.id ? 'bg-white font-medium text-wa-dark shadow-sm' : 'text-zinc-600 hover:text-zinc-900'}`}
          >
            <t.icon className="h-3 w-3" /> {t.label}
          </button>
        ))}
      </div>

      {/* Signup-only fields */}
      {isSignup && step === 'start' && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input
            data-testid="register-name"
            required
            value={fullName} onChange={(e) => setFullName(e.target.value)}
            placeholder="Full name"
            className="w-full rounded-md border border-zinc-300 px-3 py-2.5 text-sm outline-none focus:border-wa-light focus:ring-2 focus:ring-wa-light/20"
          />
          <input
            data-testid="register-company"
            required
            value={company} onChange={(e) => setCompany(e.target.value)}
            placeholder="Company"
            className="w-full rounded-md border border-zinc-300 px-3 py-2.5 text-sm outline-none focus:border-wa-light focus:ring-2 focus:ring-wa-light/20"
          />
        </div>
      )}

      {/* Email field */}
      {(mode === 'password' || mode === 'email' || (mode === 'sms' && isSignup)) && step === 'start' && (
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            data-testid="auth-email"
            type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className="w-full rounded-md border border-zinc-300 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-wa-light focus:ring-2 focus:ring-wa-light/20"
          />
        </div>
      )}

      {/* Phone for SMS */}
      {mode === 'sms' && step === 'start' && (
        <div className="relative">
          <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            data-testid="auth-phone"
            required value={phone} onChange={(e) => setPhone(e.target.value)}
            placeholder="+91…"
            className="w-full rounded-md border border-zinc-300 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-wa-light focus:ring-2 focus:ring-wa-light/20"
          />
        </div>
      )}

      {/* Password */}
      {mode === 'password' && (
        <div className="relative">
          <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            data-testid="auth-password"
            type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full rounded-md border border-zinc-300 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-wa-light focus:ring-2 focus:ring-wa-light/20"
          />
        </div>
      )}

      {/* OTP code */}
      {(mode === 'email' || mode === 'sms') && step === 'verify' && (
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs text-zinc-600">
            <Sparkles className="h-3 w-3 text-wa-mid" /> Enter the 6-digit code sent to <span className="font-medium text-zinc-900">{mode === 'email' ? email : phone}</span>
          </div>
          <input
            data-testid="auth-otp"
            required maxLength={6} pattern="[0-9]{6}" inputMode="numeric"
            value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="123456"
            className="w-full rounded-md border border-zinc-300 px-3 py-3 text-center font-mono text-2xl tracking-[0.5em] outline-none focus:border-wa-light focus:ring-2 focus:ring-wa-light/20"
          />
          <button type="button" onClick={() => setStep('start')} className="mt-2 text-xs text-zinc-500 hover:text-zinc-900">
            ← change {mode === 'email' ? 'email' : 'phone'}
          </button>
        </div>
      )}

      {hint && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">{hint}</div>
      )}

      {err && (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5" /> {err}
        </div>
      )}

      <button
        type="submit" data-testid="auth-submit" disabled={busy}
        className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-wa-dark px-4 py-2.5 text-sm font-medium text-white transition hover:bg-wa-mid disabled:opacity-60"
      >
        {busy ? 'Working…' : (
          step === 'verify'
            ? <>Verify code <ArrowRight className="h-3.5 w-3.5" /></>
            : (mode === 'password'
              ? <>{isSignup ? 'Create workspace' : 'Sign in'} <ArrowRight className="h-3.5 w-3.5" /></>
              : <>Send code <ArrowRight className="h-3.5 w-3.5" /></>)
        )}
      </button>
    </form>
  );
}
