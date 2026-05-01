import React, { useEffect, useRef, useState } from 'react';
import api from '../lib/api';
import { ShieldCheck, ShieldAlert, ShieldX, Loader2, Wand2, Clock } from 'lucide-react';
import { toast } from 'sonner';

const ICON = { good: ShieldCheck, warning: ShieldAlert, danger: ShieldX };
const COLOR = {
  good: 'border-green-200 bg-green-50 text-green-900',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
  danger: 'border-red-200 bg-red-50 text-red-900',
};

export function SpamScoreWidget({ body, onApplyRewrite, category = 'marketing' }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!body || body.length < 8) { setData(null); return; }
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const { data } = await api.post('/ai-assist/spam-score', { body, category });
        setData(data);
      } catch { /* ignore */ }
      finally { setLoading(false); }
    }, 800);
    return () => clearTimeout(timer.current);
  }, [body, category]);

  if (!body || body.length < 8) return null;
  if (loading && !data) return (
    <div className="mt-1 inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2 py-1 text-[11px] text-zinc-500">
      <Loader2 className="h-3 w-3 animate-spin" /> AI checking…
    </div>
  );
  if (!data) return null;

  const Icon = ICON[data.label] || ShieldCheck;
  return (
    <div data-testid="spam-score-widget" className={`mt-1 rounded-md border p-2.5 text-xs ${COLOR[data.label]}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 shrink-0" />
          <div>
            <div className="font-semibold">
              Spam-score: {data.score}/100
              <span className="ml-2 text-[10px] uppercase tracking-wider">
                {data.label === 'good' ? '✓ ready to send' : data.label === 'warning' ? 'reconsider' : 'will likely be blocked'}
              </span>
            </div>
            {data.issues?.length > 0 && (
              <ul className="mt-1 list-inside list-disc text-[11px] opacity-80">
                {data.issues.slice(0, 4).map((i, k) => <li key={k}>{i}</li>)}
              </ul>
            )}
          </div>
        </div>
      </div>
      {data.rewrite && (
        <div className="mt-2 rounded-md border border-zinc-200 bg-white p-2 text-[11px] text-zinc-700">
          <div className="mb-1 inline-flex items-center gap-1 font-semibold text-zinc-900"><Wand2 className="h-3 w-3" /> AI rewrite</div>
          <div className="italic">"{data.rewrite}"</div>
          <button
            type="button"
            data-testid="apply-rewrite"
            onClick={() => { onApplyRewrite?.(data.rewrite); toast.success('Rewrite applied'); }}
            className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-zinc-900 px-2 py-1 text-[10px] font-semibold text-white hover:bg-zinc-800"
          >
            <Wand2 className="h-3 w-3" /> Apply rewrite
          </button>
        </div>
      )}
    </div>
  );
}

export function OptimalTimeHint() {
  const [data, setData] = useState(null);
  useEffect(() => {
    api.get('/ai-assist/optimal-send-time').then(({ data }) => setData(data)).catch(() => {});
  }, []);
  if (!data) return null;
  return (
    <div data-testid="optimal-time-hint" className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] text-blue-900">
      <div className="inline-flex items-center gap-1.5 font-semibold">
        <Clock className="h-3 w-3" /> Best send time: {data.best_day_label}, {data.best_hour_label} IST
      </div>
      <div className="mt-0.5 text-[10px] text-blue-800">{data.rationale} <span className="opacity-70">({data.confidence})</span></div>
    </div>
  );
}
