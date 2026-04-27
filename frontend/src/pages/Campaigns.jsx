import React, { useEffect, useState } from 'react';
import api from '../lib/api';
import { Send, Plus, Play, Pause, X, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

const STATUS_STYLE = {
  pending_approval: 'bg-amber-100 text-amber-800',
  running: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  paused: 'bg-zinc-200 text-zinc-700',
  rejected: 'bg-red-100 text-red-700',
};

export default function Campaigns() {
  const [items, setItems] = useState([]);
  const [creds, setCreds] = useState([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: '', credential_id: '', message: '', recipientsText: '' });

  const load = async () => {
    const [c, cr] = await Promise.all([
      api.get('/campaigns'),
      api.get('/whatsapp/credentials'),
    ]);
    setItems(c.data);
    setCreds(cr.data);
  };

  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, []);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const recipients = form.recipientsText.split(/[\s,;\n]+/).map(s => s.trim()).filter(Boolean);
      if (!recipients.length) throw new Error('Please add at least one recipient');
      if (!form.credential_id) throw new Error('Pick a WhatsApp connection');
      await api.post('/campaigns', {
        name: form.name,
        credential_id: form.credential_id,
        message: form.message,
        recipients,
      });
      toast.success('Campaign created — pending approval');
      setOpen(false);
      setForm({ name: '', credential_id: '', message: '', recipientsText: '' });
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message || 'Failed');
    } finally { setBusy(false); }
  };

  const approve = async (id) => {
    await api.post(`/campaigns/${id}/approve`, { approve: true });
    toast.success('Approved · campaign starting');
    load();
  };
  const reject = async (id) => {
    await api.post(`/campaigns/${id}/approve`, { approve: false });
    toast.success('Campaign rejected');
    load();
  };
  const pause = async (id) => {
    await api.post(`/campaigns/${id}/pause`, {});
    toast.success('Paused');
    load();
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-center">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Campaigns</h1>
          <p className="mt-1 text-sm text-zinc-600">Bulk messaging with built-in approval gate &amp; rate limiting.</p>
        </div>
        <button data-testid="new-campaign" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-wa-mid">
          <Plus className="h-4 w-4" /> New campaign
        </button>
      </div>

      <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-[11px] uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="px-5 py-2.5 text-left font-semibold">Campaign</th>
              <th className="px-5 py-2.5 text-left font-semibold">Status</th>
              <th className="px-5 py-2.5 text-left font-semibold">Progress</th>
              <th className="px-5 py-2.5 text-left font-semibold">Recipients</th>
              <th className="px-5 py-2.5 text-left font-semibold">Sent / Failed</th>
              <th className="px-5 py-2.5 text-left font-semibold">Created</th>
              <th className="px-5 py-2.5 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr><td colSpan={7} className="px-5 py-12 text-center text-zinc-500">
                <Send className="mx-auto mb-3 h-6 w-6 text-zinc-300" />
                No campaigns yet. Click "New campaign" to begin.
              </td></tr>
            )}
            {items.map((c) => {
              const pct = c.total_recipients ? Math.round((c.sent_count / c.total_recipients) * 100) : 0;
              return (
                <tr key={c.id} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50/40">
                  <td className="px-5 py-3.5">
                    <div className="font-medium text-zinc-900">{c.name}</div>
                    <div className="mt-0.5 max-w-md truncate text-xs text-zinc-500">{c.message}</div>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${STATUS_STYLE[c.status] || 'bg-zinc-100'}`}>
                      {c.status === 'running' ? <Play className="h-3 w-3" /> : c.status === 'completed' ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                      {c.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-zinc-100">
                        <div className="h-full rounded-full bg-green-600" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="font-mono text-xs text-zinc-600">{pct}%</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 font-mono text-xs">{c.total_recipients}</td>
                  <td className="px-5 py-3.5 font-mono text-xs">{c.sent_count} / <span className="text-red-600">{c.failed_count || 0}</span></td>
                  <td className="px-5 py-3.5 text-xs text-zinc-500">{new Date(c.created_at).toLocaleString()}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-1.5">
                      {c.status === 'pending_approval' && (
                        <>
                          <button data-testid={`approve-${c.id}`} onClick={() => approve(c.id)} className="rounded-md bg-green-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-wa-mid">Approve</button>
                          <button data-testid={`reject-${c.id}`} onClick={() => reject(c.id)} className="rounded-md border border-zinc-300 px-2.5 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-50">Reject</button>
                        </>
                      )}
                      {c.status === 'running' && (
                        <button data-testid={`pause-${c.id}`} onClick={() => pause(c.id)} className="inline-flex items-center gap-1 rounded-md border border-zinc-300 px-2.5 py-1 text-[11px] font-medium hover:bg-zinc-50">
                          <Pause className="h-3 w-3" /> Pause
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-md border border-zinc-200 bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold">Create campaign</h3>
              <button onClick={() => setOpen(false)} className="text-zinc-500 hover:text-zinc-900"><X className="h-4 w-4" /></button>
            </div>
            <form onSubmit={submit} className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-700">Name</label>
                  <input data-testid="campaign-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" placeholder="Q2 promo blast" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-700">From WhatsApp</label>
                  <select data-testid="campaign-cred" required value={form.credential_id} onChange={(e) => setForm({ ...form, credential_id: e.target.value })} className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm">
                    <option value="">— pick a connection —</option>
                    {creds.map(c => <option key={c.id} value={c.id}>{c.name} ({c.whatsapp_from})</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700">Message</label>
                <textarea data-testid="campaign-message" required rows={4} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" placeholder="Hi {{name}}, …" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700">Recipients (one per line, comma or space-separated)</label>
                <textarea data-testid="campaign-recipients" required rows={4} value={form.recipientsText} onChange={(e) => setForm({ ...form, recipientsText: e.target.value })} className="w-full rounded-md border border-zinc-300 px-3 py-2 font-mono text-xs" placeholder="+919876543210
+919876543211" />
              </div>
              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5" />
                Campaigns must be approved by an admin before sending. Throttled to ~10 messages/sec.
              </div>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button type="button" onClick={() => setOpen(false)} className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-50">Cancel</button>
                <button data-testid="campaign-submit" disabled={busy} className="rounded-md bg-green-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-wa-mid disabled:opacity-60">
                  {busy ? 'Saving…' : 'Create campaign'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
