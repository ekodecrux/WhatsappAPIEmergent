import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';
import { Building2, User, Mail, Shield, Beaker, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

const Row = ({ icon: Icon, label, value }) => (
  <div className="flex items-center gap-3 border-b border-zinc-200 py-4 last:border-0">
    <Icon className="h-4 w-4 text-zinc-500" />
    <div className="flex-1">
      <div className="text-xs uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="mt-0.5 text-sm text-zinc-900">{value}</div>
    </div>
  </div>
);

export default function Settings() {
  const { user } = useAuth();
  const [sb, setSb] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try { const { data } = await api.get('/sandbox/status'); setSb(data); } catch { /* ignore */ }
  };
  useEffect(() => { load(); }, []);

  const toggleSandbox = async () => {
    setBusy(true);
    try {
      if (sb?.active) {
        const { data } = await api.post('/sandbox/disable');
        toast.success(`Cleared ${data.deleted.conversations} conversations, ${data.deleted.leads} leads, ${data.deleted.campaigns} campaigns`);
      } else {
        const { data } = await api.post('/sandbox/enable');
        if (data.already_active) {
          toast.message('Sandbox already populated');
        } else {
          toast.success(`Seeded ${data.summary.conversations} conversations, ${data.summary.leads} leads, ${data.summary.campaigns} campaigns ✨`);
        }
      }
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Failed'); }
    finally { setBusy(false); }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-zinc-600">Account &amp; workspace details.</p>
      </div>

      <div className="rounded-md border border-zinc-200 bg-white px-5">
        <Row icon={User} label="Full name" value={user?.full_name} />
        <Row icon={Mail} label="Email" value={user?.email} />
        <Row icon={Building2} label="Company" value={user?.company_name} />
        <Row icon={Shield} label="Role" value={user?.role} />
      </div>

      {/* Sandbox mode */}
      <div className="rounded-md border border-purple-200 bg-gradient-to-br from-purple-50 to-white p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-purple-700">
              <Sparkles className="h-3 w-3" /> Sandbox mode
            </div>
            <h2 className="mt-1 font-display text-lg font-semibold text-zinc-900">Try the product with realistic demo data</h2>
            <p className="mt-1 text-xs text-zinc-700">
              Waiting for Meta template approval? Toggle Sandbox to populate your account with 50 lifelike
              conversations (positive/negative/CTWA), 200 leads, and 5 campaigns. Disable to wipe in one click — your
              real data is never touched.
            </p>
            {sb?.active && (
              <div className="mt-2 inline-flex items-center gap-2 rounded-md bg-purple-100 px-2 py-1 text-[11px] font-medium text-purple-900">
                <Beaker className="h-3 w-3" /> Active · {sb.counts.conversations} convs · {sb.counts.leads} leads · {sb.counts.campaigns} campaigns
              </div>
            )}
          </div>
          <button
            data-testid="toggle-sandbox"
            onClick={toggleSandbox}
            disabled={busy}
            className={`shrink-0 rounded-md px-4 py-2 text-sm font-medium transition disabled:opacity-60 ${sb?.active ? 'border border-red-300 bg-red-50 text-red-800 hover:bg-red-100' : 'bg-purple-700 text-white hover:bg-purple-800'}`}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : (sb?.active ? 'Disable sandbox' : 'Enable sandbox')}
          </button>
        </div>
      </div>

      <div className="rounded-md border border-zinc-200 bg-white p-5 text-sm text-zinc-600">
        Profile editing &amp; team-management coming soon.
      </div>
    </div>
  );
}
