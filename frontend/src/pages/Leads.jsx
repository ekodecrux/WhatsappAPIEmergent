import React, { useEffect, useMemo, useState } from 'react';
import api from '../lib/api';
import { Plus, Search, Trash2, X, Upload, Filter, Star } from 'lucide-react';
import { toast } from 'sonner';

const STATUS = ['new', 'contacted', 'qualified', 'converted', 'lost'];

const Badge = ({ status }) => {
  const map = {
    new: 'bg-blue-100 text-blue-800',
    contacted: 'bg-amber-100 text-amber-800',
    qualified: 'bg-green-100 text-green-800',
    converted: 'bg-emerald-100 text-emerald-800',
    lost: 'bg-red-100 text-red-700',
  };
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${map[status] || 'bg-zinc-100'}`}>{status}</span>;
};

export default function Leads() {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [form, setForm] = useState({ phone: '', name: '', email: '', company: '', notes: '' });
  const [csv, setCsv] = useState('phone,name,email,company\n+919876543210,Aarav Mehta,aarav@acme.in,Acme');

  const load = async () => {
    const params = status ? `?status=${status}` : '';
    const { data } = await api.get(`/leads${params}`);
    setItems(data);
  };
  useEffect(() => { load(); }, [status]);

  const filtered = useMemo(() => {
    if (!q.trim()) return items;
    const s = q.toLowerCase();
    return items.filter(l => (l.name || '').toLowerCase().includes(s) || (l.phone || '').includes(s) || (l.email || '').toLowerCase().includes(s) || (l.company || '').toLowerCase().includes(s));
  }, [items, q]);

  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/leads', form);
      toast.success('Lead added');
      setForm({ phone: '', name: '', email: '', company: '', notes: '' });
      setOpen(false);
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Failed'); }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete lead?')) return;
    await api.delete(`/leads/${id}`);
    load();
  };

  const update = async (id, patch) => {
    await api.patch(`/leads/${id}`, patch);
    load();
  };

  const doImport = async (e) => {
    e.preventDefault();
    const lines = csv.split(/\n/).map(s => s.trim()).filter(Boolean);
    const [hdr, ...rest] = lines;
    const cols = hdr.split(',').map(s => s.trim());
    const items = rest.map(line => {
      const vals = line.split(',').map(s => s.trim());
      const obj = {};
      cols.forEach((c, i) => obj[c] = vals[i]);
      return obj;
    });
    try {
      const { data } = await api.post('/leads/import', { items });
      toast.success(`Imported ${data.inserted}, skipped ${data.skipped}`);
      setImportOpen(false);
      load();
    } catch { toast.error('Import failed'); }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-center">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Leads</h1>
          <p className="mt-1 text-sm text-zinc-600">Capture, score and convert.</p>
        </div>
        <div className="flex items-center gap-2">
          <button data-testid="import-leads" onClick={() => setImportOpen(true)} className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50">
            <Upload className="h-3.5 w-3.5" /> Import CSV
          </button>
          <button data-testid="new-lead" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-wa-mid">
            <Plus className="h-4 w-4" /> Add lead
          </button>
        </div>
      </div>

      <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
          <input data-testid="leads-search" value={q} onChange={(e) => setQ(e.target.value)} className="w-full rounded-md border border-zinc-300 bg-white py-2 pl-8 pr-3 text-sm" placeholder="Search by name, phone, email, company…" />
        </div>
        <div className="inline-flex items-center gap-1 rounded-md border border-zinc-300 bg-white p-1 text-xs">
          <Filter className="ml-2 h-3 w-3 text-zinc-400" />
          {['', ...STATUS].map(s => (
            <button key={s || 'all'} data-testid={`filter-${s || 'all'}`} onClick={() => setStatus(s)} className={`rounded px-2 py-1 ${status === s ? 'bg-zinc-900 text-white' : 'text-zinc-700 hover:bg-zinc-100'}`}>
              {s || 'All'}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-[11px] uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="px-5 py-2.5 text-left font-semibold">Lead</th>
              <th className="px-5 py-2.5 text-left font-semibold">Company</th>
              <th className="px-5 py-2.5 text-left font-semibold">Phone</th>
              <th className="px-5 py-2.5 text-left font-semibold">Score</th>
              <th className="px-5 py-2.5 text-left font-semibold">Status</th>
              <th className="px-5 py-2.5 text-left font-semibold">Source</th>
              <th className="px-5 py-2.5 text-right font-semibold">·</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={7} className="px-5 py-12 text-center text-zinc-500">No leads yet.</td></tr>}
            {filtered.map((l) => (
              <tr key={l.id} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50/40">
                <td className="px-5 py-3">
                  <div className="font-medium text-zinc-900">{l.name}</div>
                  <div className="text-xs text-zinc-500">{l.email || '—'}</div>
                </td>
                <td className="px-5 py-3 text-zinc-700">{l.company || '—'}</td>
                <td className="px-5 py-3 font-mono text-xs">{l.phone}</td>
                <td className="px-5 py-3">
                  <div className="inline-flex items-center gap-1 text-xs">
                    <Star className="h-3 w-3 text-amber-500" /> {l.lead_score}
                  </div>
                </td>
                <td className="px-5 py-3">
                  <select value={l.status} onChange={(e) => update(l.id, { status: e.target.value })} className="rounded-md border border-zinc-200 bg-transparent px-1.5 py-0.5 text-xs">
                    {STATUS.map(s => <option key={s}>{s}</option>)}
                  </select>
                </td>
                <td className="px-5 py-3 text-xs capitalize text-zinc-600">{l.source}</td>
                <td className="px-5 py-3 text-right">
                  <button data-testid={`del-lead-${l.id}`} onClick={() => remove(l.id)} className="rounded-md p-1 text-zinc-500 hover:bg-red-50 hover:text-red-700">
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
          <div className="w-full max-w-md rounded-md border border-zinc-200 bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold">Add lead</h3>
              <button onClick={() => setOpen(false)}><X className="h-4 w-4" /></button>
            </div>
            <form onSubmit={submit} className="space-y-3">
              <input data-testid="lead-phone" required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+919…" className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
              <input data-testid="lead-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name" className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
              <input data-testid="lead-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
              <input data-testid="lead-company" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="Company" className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
              <textarea data-testid="lead-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Notes" rows={3} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setOpen(false)} className="rounded-md border border-zinc-300 px-3 py-2 text-sm">Cancel</button>
                <button data-testid="lead-submit" className="rounded-md bg-green-600 px-3 py-2 text-sm text-white">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {importOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-md border border-zinc-200 bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold">Import leads</h3>
              <button onClick={() => setImportOpen(false)}><X className="h-4 w-4" /></button>
            </div>
            <form onSubmit={doImport} className="space-y-3">
              <p className="text-xs text-zinc-600">Paste CSV with headers: phone, name, email, company.</p>
              <textarea data-testid="csv-input" rows={10} value={csv} onChange={(e) => setCsv(e.target.value)} className="w-full rounded-md border border-zinc-300 px-3 py-2 font-mono text-xs" />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setImportOpen(false)} className="rounded-md border border-zinc-300 px-3 py-2 text-sm">Cancel</button>
                <button data-testid="csv-submit" className="rounded-md bg-green-600 px-3 py-2 text-sm text-white">Import</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
