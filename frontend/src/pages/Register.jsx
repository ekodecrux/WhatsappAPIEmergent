import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MessageSquare } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import AuthForm from '../components/AuthForm';

export default function Register() {
  const { setSession } = useAuth();
  const navigate = useNavigate();
  const onSuccess = (data) => { setSession(data); navigate('/app/whatsapp'); };

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md animate-fadein">
          <Link to="/" className="mb-10 flex items-center gap-2 text-sm font-medium text-zinc-700">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-wa-light text-white">
              <MessageSquare className="h-3 w-3" strokeWidth={2.5} />
            </span>
            wabridge
          </Link>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Create your workspace</h1>
          <p className="mt-1 text-sm text-zinc-600">14 days of Pro free. Email OTP, SMS OTP or password — your call.</p>

          <div className="mt-6">
            <AuthForm purpose="signup" onSuccess={onSuccess} />
          </div>

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
                  <span className="mt-1 grid h-4 w-4 place-items-center rounded-full bg-wa-dark text-[9px] font-bold text-white">✓</span>
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
