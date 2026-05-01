import React, { useEffect, useState } from 'react';
import api from '../lib/api';
import { LifeBuoy, Plus, X, Send, MessageCircle, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

const PRIO = { low: 'bg-zinc-100 text-zinc-700', normal: 'bg-blue-100 text-blue-800', high: 'bg-amber-100 text-amber-800', urgent: 'bg-red-100 text-red-800' };
const STATUS = { open: 'bg-blue-100 text-blue-800', in_progress: 'bg-amber-100 text-amber-800', resolved: 'bg-green-100 text-green-800', closed: 'bg-zinc-100 text-zinc-700' };

export default function Support() {
  const [list, setList] = useState([]);
  const [active, setActive] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ subject: '', description: '', priority: 'normal', category: 'general' });
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState('');

  const load = async () => {
    const { data } = await api.get('/support/tickets');
    setList(data);
  };
  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    if ((form.description || '').trim().length < 10) { toast.error('Please add at least 10 characters of detail'); return; }
    setBusy(true);
    try {
      const { data } = await api.post('/support/tickets', { ...form, source: 'manual' });
      toast.success(`Ticket #${data.id.slice(0, 8)} created`);
      setOpen(false);
      setForm({ subject: '', description: '', priority: 'normal', category: 'general' });
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Failed'); } finally { setBusy(false); }
  };

  const openTicket = async (t) => {
    const { data } = await api.get(`/support/tickets/${t.id}`);
    setActive(data);
    setReply('');
  };

  const sendReply = async () => {
    if (!reply.trim() || !active) return;
    setBusy(true);
    try {
      await api.post(`/support/tickets/${active.id}/reply`, { message: reply });
      setReply('');
      const { data } = await api.get(`/support/tickets/${active.id}`);
      setActive(data);
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Failed'); } finally { setBusy(false); }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight inline-flex items-center gap-2">
            <LifeBuoy className="h-6 w-6 text-wa-dark" /> Support
          </h1>
          <p className="mt-1 text-sm text-zinc-600">Raise issues with our team. Use the AI assistant first — it can solve most things instantly.</p>
        </div>
        <button data-testid="new-ticket-btn" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-md bg-wa-dark px-3 py-2 text-sm font-medium text-white hover:bg-wa-mid">
          <Plus className="h-4 w-4" /> New ticket
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.5fr]">
        <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
          {list.length === 0 && (
            <div className="px-4 py-12 text-center">
              <MessageCircle className="mx-auto mb-3 h-6 w-6 text-zinc-300" />
              <div className="text-sm font-medium text-zinc-700">No tickets yet</div>
              <div className="mt-1 text-xs text-zinc-500">Click "New ticket" or ask the AI assistant for help.</div>
            </div>
          )}
          {list.map(t => (
            <button key={t.id} onClick={() => openTicket(t)} data-testid={`ticket-${t.id}`} className={`block w-full border-b border-zinc-100 px-4 py-3 text-left last:border-0 hover:bg-zinc-50 ${active?.id === t.id ? 'bg-zinc-50' : ''}`}>
              <div className="flex items-center justify-between">
                <div className="truncate font-medium text-zinc-900">{t.subject}</div>
                <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-medium ${PRIO[t.priority]}`}>{t.priority}</span>
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-500">
                <span className={`rounded-full px-1.5 py-0.5 ${STATUS[t.status]}`}>{t.status}</span>
                <span>·</span>
                <span>{(t.created_at || '').slice(0, 10)}</span>
                {t.source === 'chatbot' && <span className="ml-auto rounded bg-blue-50 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-blue-700">AI</span>}
              </div>
            </button>
          ))}
        </div>

        {active ? (
          <div className="rounded-md border border-zinc-200 bg-white p-5" data-testid="ticket-detail">
            <h3 className="font-display text-lg font-semibold">{active.subject}</h3>
            <div className="mt-1 flex items-center gap-2 text-xs text-zinc-500">
              <span className={`rounded-full px-2 py-0.5 ${STATUS[active.status]}`}>{active.status}</span>
              <span className={`rounded-full px-2 py-0.5 ${PRIO[active.priority]}`}>{active.priority}</span>
              <span>·</span>
              <span>{(active.created_at || '').slice(0, 16).replace('T', ' ')}</span>
            </div>
            <div className="mt-4 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700 whitespace-pre-wrap">{active.description}</div>
            <div className="mt-4 space-y-2">
              {(active.replies || []).map(r => (
                <div key={r.id} className={`rounded-md border p-3 text-sm ${r.is_staff ? 'border-wa-dark/20 bg-wa-dark/5' : 'border-zinc-200'}`}>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{r.is_staff ? 'Support team' : 'You'} · {(r.created_at || '').slice(0, 16).replace('T', ' ')}</div>
                  <div className="mt-1 whitespace-pre-wrap text-zinc-800">{r.message}</div>
                </div>
              ))}
            </div>
            {active.status !== 'closed' && (
              <div className="mt-4">
                <textarea data-testid="ticket-reply-input" rows={3} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply…" className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
                <button data-testid="ticket-reply-send" onClick={sendReply} disabled={busy || !reply.trim()} className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-wa-dark px-3 py-2 text-sm font-medium text-white hover:bg-wa-mid disabled:opacity-50"><Send className="h-3.5 w-3.5" /> Send</button>
              </div>
            )}
          </div>
        ) : (
          <div className="grid place-items-center rounded-md border border-dashed border-zinc-300 bg-white p-12 text-sm text-zinc-500">
            <div className="text-center">
              <AlertCircle className="mx-auto mb-2 h-6 w-6 text-zinc-300" />
              Select a ticket to view conversation.
            </div>
          </div>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={submit} className="w-full max-h-[90vh] overflow-y-auto max-w-lg rounded-md border border-zinc-200 bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold">New support ticket</h3>
              <button type="button" onClick={() => setOpen(false)}><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3">
              <input data-testid="ticket-subject" required value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Subject (e.g., Cannot publish my flow)" className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
              <textarea data-testid="ticket-description" rows={5} required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Describe the issue, what you tried, and what you expected (min 10 chars)" className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
              <div className="grid grid-cols-2 gap-3">
                <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="rounded-md border border-zinc-300 px-3 py-2 text-sm" data-testid="ticket-priority">
                  <option value="low">Low priority</option>
                  <option value="normal">Normal priority</option>
                  <option value="high">High priority</option>
                  <option value="urgent">Urgent</option>
                </select>
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="rounded-md border border-zinc-300 px-3 py-2 text-sm">
                  <option value="general">General</option>
                  <option value="billing">Billing</option>
                  <option value="technical">Technical</option>
                  <option value="bug">Bug</option>
                  <option value="feature">Feature request</option>
                </select>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="rounded-md border border-zinc-300 px-3 py-2 text-sm">Cancel</button>
              <button type="submit" data-testid="ticket-submit" disabled={busy} className="rounded-md bg-wa-dark px-3 py-2 text-sm font-medium text-white hover:bg-wa-mid disabled:opacity-50">{busy ? 'Submitting…' : 'Submit ticket'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
