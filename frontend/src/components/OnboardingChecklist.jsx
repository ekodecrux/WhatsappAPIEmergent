import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { Check, ChevronRight, Sparkles, Zap, Clock, Loader2, ArrowUpRight } from 'lucide-react';
import { toast } from 'sonner';

export default function OnboardingChecklist() {
  const [data, setData] = useState(null);
  const [seeding, setSeeding] = useState(false);
  const [hidden, setHidden] = useState(() => localStorage.getItem('onboarding_hidden') === '1');

  const load = async () => {
    try {
      const { data } = await api.get('/onboarding/status');
      setData(data);
    } catch { /* ignore */ }
  };
  useEffect(() => { load(); }, []);

  const seed = async () => {
    setSeeding(true);
    try {
      const { data: r } = await api.post('/onboarding/seed');
      const parts = [];
      if (r.templates) parts.push(`${r.templates} template${r.templates > 1 ? 's' : ''}`);
      if (r.flow) parts.push('1 welcome flow');
      if (r.quick_replies) parts.push(`${r.quick_replies} quick replies`);
      toast.success(parts.length ? `Added ${parts.join(', ')} ✨` : 'Already set up — looking good!');
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Failed'); }
    finally { setSeeding(false); }
  };

  if (!data) return null;
  if (data.percent === 100) return null;
  if (hidden) return null;

  return (
    <div data-testid="onboarding-checklist" className="rounded-md border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-700">
            <Sparkles className="h-3 w-3" /> Get to live in ~5 minutes
          </div>
          <h2 className="mt-1 font-display text-xl font-semibold tracking-tight text-zinc-900">
            {data.completed} of {data.total} steps complete
          </h2>
          <p className="mt-0.5 text-xs text-zinc-600">
            We&apos;ll do all the heavy lifting — you only need to paste your Meta/Twilio credentials once.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden h-1.5 w-32 overflow-hidden rounded-full bg-emerald-200 sm:block">
            <div className="h-full bg-emerald-600 transition-all" style={{ width: `${data.percent}%` }} />
          </div>
          <button
            data-testid="dismiss-onboarding"
            onClick={() => { localStorage.setItem('onboarding_hidden', '1'); setHidden(true); }}
            className="text-xs text-zinc-500 hover:underline"
          >Hide</button>
        </div>
      </div>

      <ol className="mt-4 grid gap-2 sm:grid-cols-2">
        {data.steps.map((s, i) => (
          <li
            key={s.id}
            data-testid={`onb-step-${s.id}`}
            className={`flex items-start gap-3 rounded-md border p-3 transition ${s.done ? 'border-emerald-300 bg-emerald-50/60' : 'border-zinc-200 bg-white'}`}
          >
            <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border ${s.done ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-zinc-300 bg-white text-[10px] font-bold text-zinc-500'}`}>
              {s.done ? <Check className="h-3 w-3" /> : i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className={`text-sm font-medium ${s.done ? 'text-emerald-900 line-through' : 'text-zinc-900'}`}>{s.title}</span>
                {s.duration && (
                  <span className="inline-flex items-center gap-0.5 rounded bg-zinc-100 px-1.5 py-0.5 text-[9px] text-zinc-600">
                    <Clock className="h-2.5 w-2.5" /> {s.duration}
                  </span>
                )}
                {s.blocking && !s.done && (
                  <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-800">required</span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-zinc-600">{s.description}</p>
              {s.current_value && <p className="mt-0.5 font-mono text-[11px] text-zinc-500">Current: {s.current_value}</p>}
              {!s.done && (
                <div className="mt-2">
                  {s.id === 'starter_pack' ? (
                    <button
                      data-testid="seed-starter-pack"
                      onClick={seed}
                      disabled={seeding}
                      className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                    >
                      {seeding ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                      {seeding ? 'Adding…' : s.cta} <ChevronRight className="h-3 w-3" />
                    </button>
                  ) : (
                    <Link
                      to={s.href}
                      className="inline-flex items-center gap-1 rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-800 hover:bg-zinc-50"
                    >
                      {s.cta} <ArrowUpRight className="h-3 w-3" />
                    </Link>
                  )}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-3 text-center text-[11px] text-zinc-500">
        Need help with Meta credentials? Open the{' '}
        <Link to="/app/whatsapp" className="font-semibold text-emerald-700 underline-offset-2 hover:underline">step-by-step Meta helper</Link>
        {' '}on the Channels page · or click the green sparkle button bottom-right to ask the AI.
      </div>
    </div>
  );
}
