import React, { useEffect, useState } from 'react';
import api from '../lib/api';
import { Plus, Trash2, X, FileText } from 'lucide-react';
import { toast } from 'sonner';

const CATS = ['MARKETING', 'UTILITY', 'AUTHENTICATION'];

export default function Templates() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', category: 'MARKETING', body: '', header: '', footer: '', language: 'en', media_url: '', media_type: '' });

  const load = async () => { const { data } = await api.get('/whatsapp/templates'); setItems(data); };
  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/whatsapp/templates', form);
      toast.success('Template saved');
      setOpen(false);
      setForm({ name: '', category: 'MARKETING', body: '', header: '', footer: '', language: 'en', media_url: '', media_type: '' });
      load();
    } catch { toast.error('Failed'); }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete template?')) return;
    await api.delete(`/whatsapp/templates/${id}`);
    load();
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Templates</h1>
          <p className="mt-1 text-sm text-zinc-600">Approved message templates for outbound campaigns.</p>
        </div>
        <button data-testid="new-template" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-wa-mid">
          <Plus className="h-4 w-4" /> New template
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.length === 0 && (
          <div className="col-span-full rounded-md border border-zinc-200 bg-white p-12 text-center text-sm text-zinc-500">
            <FileText className="mx-auto mb-3 h-6 w-6 text-zinc-300" />
            No templates yet.
          </div>
        )}
        {items.map(t => (
          <div key={t.id} className="rounded-md border border-zinc-200 bg-white p-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-wa-dark">{t.category}</div>
                <div className="mt-1 font-display text-base font-medium text-zinc-900">{t.name}</div>
              </div>
              <button onClick={() => remove(t.id)} className="rounded-md p-1 text-zinc-500 hover:bg-red-50 hover:text-red-700">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            {t.header && <div className="mt-3 text-xs font-medium text-zinc-700">{t.header}</div>}
            <div className="mt-2 whitespace-pre-line text-sm text-zinc-700">{t.body}</div>
            {t.footer && <div className="mt-2 text-xs text-zinc-500">{t.footer}</div>}
            {t.media_url && (
              <a href={t.media_url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 rounded-md bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-700 hover:bg-zinc-200">
                📎 {t.media_type || 'media'}
              </a>
            )}
            <div className="mt-3 inline-flex rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-800">approved</div>
          </div>
        ))}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-h-[90vh] overflow-y-auto max-w-lg rounded-md border border-zinc-200 bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold">New template</h3>
              <button onClick={() => setOpen(false)}><X className="h-4 w-4" /></button>
            </div>
            <form onSubmit={submit} className="space-y-3">
              <input data-testid="template-name" required placeholder="Template name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm">
                {CATS.map(c => <option key={c}>{c}</option>)}
              </select>
              <input placeholder="Header (optional)" value={form.header} onChange={(e) => setForm({ ...form, header: e.target.value })} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
              <textarea data-testid="template-body" required placeholder="Body" rows={4} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
              <input placeholder="Footer (optional)" value={form.footer} onChange={(e) => setForm({ ...form, footer: e.target.value })} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[2fr_1fr]">
                <input
                  type="url"
                  placeholder="Media URL (optional — image, PDF, mp3, mp4)"
                  value={form.media_url}
                  onChange={(e) => setForm({ ...form, media_url: e.target.value })}
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm font-mono"
                />
                <select
                  value={form.media_type}
                  onChange={(e) => setForm({ ...form, media_type: e.target.value })}
                  disabled={!form.media_url}
                  className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-50"
                >
                  <option value="">Auto-detect</option>
                  <option value="image">Image</option>
                  <option value="document">Document</option>
                  <option value="audio">Audio</option>
                  <option value="video">Video</option>
                </select>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setOpen(false)} className="rounded-md border border-zinc-300 px-3 py-2 text-sm">Cancel</button>
                <button data-testid="template-submit" className="rounded-md bg-green-600 px-3 py-2 text-sm text-white">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
