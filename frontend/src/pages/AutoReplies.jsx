import React, { useEffect, useState } from 'react';
import api from '../lib/api';
import { Plus, Trash2, X, Bot, Power } from 'lucide-react';
import { toast } from 'sonner';

const TRIGGERS = [
  { id: 'keyword', label: 'Keyword match' },
  { id: 'always', label: 'Always reply (greeting)' },
];

export default function AutoReplies() {
  const [items, setItems] = useState([]);
  const [creds, setCreds] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', credential_id: '', trigger_type: 'keyword', trigger_keywords: '', reply_message: '', priority: 0, is_active: true });

  const load = async () => {
    const [a, b] = await Promise.all([api.get('/auto-reply-rules'), api.get('/whatsapp/credentials')]);
    setItems(a.data); setCreds(b.data);
    if (b.data[0] && !form.credential_id) setForm(f => ({ ...f, credential_id: b.data[0].id }));
  };
  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        trigger_keywords: form.trigger_keywords.split(',').map(s => s.trim()).filter(Boolean),
      };
      await api.post('/auto-reply-rules', payload);
      toast.success('Auto-reply rule created');
      setOpen(false);
      setForm({ name: '', credential_id: creds[0]?.id || '', trigger_type: 'keyword', trigger_keywords: '', reply_message: '', priority: 0, is_active: true });
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Failed'); }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this rule?')) return;
    await api.delete(`/auto-reply-rules/${id}`);
    load();
  };

  const toggle = async (r) => {
    await api.patch(`/auto-reply-rules/${r.id}`, { is_active: !r.is_active });
    load();
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-center">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Auto-replies</h1>
          <p className="mt-1 text-sm text-zinc-600">Trigger instant responses based on keywords or greetings.</p>
        </div>
        <button data-testid="new-rule" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-wa-mid">
          <Plus className="h-4 w-4" /> New rule
        </button>
      </div>

      <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-[11px] uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="px-5 py-2.5 text-left font-semibold">Rule</th>
              <th className="px-5 py-2.5 text-left font-semibold">Trigger</th>
              <th className="px-5 py-2.5 text-left font-semibold">Reply</th>
              <th className="px-5 py-2.5 text-left font-semibold">Priority</th>
              <th className="px-5 py-2.5 text-right font-semibold">·</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && <tr><td colSpan={5} className="px-5 py-12 text-center text-zinc-500"><Bot className="mx-auto mb-3 h-6 w-6 text-zinc-300" />No auto-reply rules yet.</td></tr>}
            {items.map(r => (
              <tr key={r.id} className="border-b border-zinc-100 last:border-0">
                <td className="px-5 py-3.5">
                  <div className="font-medium text-zinc-900">{r.name}</div>
                  <button onClick={() => toggle(r)} className={`mt-0.5 inline-flex items-center gap-1 text-[11px] ${r.is_active ? 'text-wa-dark' : 'text-zinc-400'}`}>
                    <Power className="h-3 w-3" /> {r.is_active ? 'Active' : 'Paused'}
                  </button>
                </td>
                <td className="px-5 py-3.5 text-xs">
                  <div className="capitalize text-zinc-700">{r.trigger_type}</div>
                  {r.trigger_keywords?.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {r.trigger_keywords.map(k => <span key={k} className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px]">{k}</span>)}
                    </div>
                  )}
                </td>
                <td className="max-w-xs truncate px-5 py-3.5 text-zinc-700">{r.reply_message}</td>
                <td className="px-5 py-3.5 font-mono text-xs">{r.priority}</td>
                <td className="px-5 py-3.5 text-right">
                  <button data-testid={`del-rule-${r.id}`} onClick={() => remove(r.id)} className="rounded-md p-1 text-zinc-500 hover:bg-red-50 hover:text-red-700">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-h-[90vh] overflow-y-auto max-w-lg rounded-md border border-zinc-200 bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold">New auto-reply rule</h3>
              <button onClick={() => setOpen(false)}><X className="h-4 w-4" /></button>
            </div>
            <form onSubmit={submit} className="space-y-3">
              <input data-testid="rule-name" required placeholder="Rule name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
              <select required value={form.credential_id} onChange={(e) => setForm({ ...form, credential_id: e.target.value })} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm">
                <option value="">— pick connection —</option>
                {creds.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select value={form.trigger_type} onChange={(e) => setForm({ ...form, trigger_type: e.target.value })} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm">
                {TRIGGERS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
              {form.trigger_type === 'keyword' && (
                <input data-testid="rule-keywords" required placeholder="Keywords, comma-separated (price, demo, hi)" value={form.trigger_keywords} onChange={(e) => setForm({ ...form, trigger_keywords: e.target.value })} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
              )}
              <textarea data-testid="rule-reply" required placeholder="Reply message" rows={3} value={form.reply_message} onChange={(e) => setForm({ ...form, reply_message: e.target.value })} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
              <input type="number" placeholder="Priority" value={form.priority} onChange={(e) => setForm({ ...form, priority: parseInt(e.target.value) || 0 })} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setOpen(false)} className="rounded-md border border-zinc-300 px-3 py-2 text-sm">Cancel</button>
                <button data-testid="rule-submit" className="rounded-md bg-green-600 px-3 py-2 text-sm text-white">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
