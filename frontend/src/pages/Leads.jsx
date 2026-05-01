import React, { useEffect, useMemo, useState } from 'react';
import api from '../lib/api';
import { Plus, Search, Trash2, X, Upload, Filter, Star, Globe, Loader2, AlertTriangle } from 'lucide-react';
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

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-center">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Leads</h1>
          <p className="mt-1 text-sm text-zinc-600">Capture, score and convert.</p>
        </div>
        <div className="flex items-center gap-2">
          <button data-testid="import-leads" onClick={() => setImportOpen(true)} className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50">
            <Upload className="h-3.5 w-3.5" /> Import leads
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
          <div className="w-full max-h-[90vh] overflow-y-auto max-w-md rounded-md border border-zinc-200 bg-white p-6">
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

      {importOpen && <ImportLeadsModal onClose={() => { setImportOpen(false); load(); }} />}
    </div>
  );
}

function ImportLeadsModal({ onClose }) {
  const [tab, setTab] = useState('csv');
  const [csv, setCsv] = useState('phone,name,email,company\n+919876543210,Aarav Mehta,aarav@acme.in,Acme');
  const [url, setUrl] = useState('');
  const [country, setCountry] = useState('+91');
  const [scraping, setScraping] = useState(false);
  const [scrapeResult, setScrapeResult] = useState(null);
  const [importing, setImporting] = useState(false);
  const [selected, setSelected] = useState({});

  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => setCsv(String(r.result || ''));
    r.readAsText(f);
  };

  const doCsv = async (e) => {
    e.preventDefault();
    setImporting(true);
    try {
      const lines = csv.split(/\n/).map(s => s.trim()).filter(Boolean);
      if (!lines.length) return;
      const header = lines.shift().split(',').map(s => s.trim().toLowerCase());
      const items = lines.map(l => {
        const cols = l.split(',');
        const obj = {};
        header.forEach((h, i) => { obj[h] = (cols[i] || '').trim(); });
        return obj;
      });
      const { data } = await import('../lib/api').then(m => m.default.post('/leads/import', { items }));
      toast.success(`Imported ${data.inserted} new leads (${data.skipped} skipped)`);
      onClose();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Import failed'); }
    finally { setImporting(false); }
  };

  const doScrape = async () => {
    if (!url.trim()) return;
    setScraping(true);
    setScrapeResult(null);
    try {
      const api = (await import('../lib/api')).default;
      const { data } = await api.post('/leads/scrape-url', { url: url.trim(), country_code: country });
      setScrapeResult(data);
      const initial = {};
      (data.rows || []).forEach(r => { initial[r.phone] = !r.duplicate; });
      setSelected(initial);
      if (!data.rows?.length) toast.message('No phone numbers found on that page');
    } catch (e) { toast.error(e?.response?.data?.detail || 'Scrape failed'); }
    finally { setScraping(false); }
  };

  const doScrapeImport = async () => {
    if (!scrapeResult) return;
    const items = scrapeResult.rows
      .filter(r => selected[r.phone] && !r.duplicate)
      .map(r => ({ phone: r.phone, source: 'web_scrape', name: scrapeResult.page_title || r.phone }));
    if (!items.length) return toast.error('Select at least one number');
    setImporting(true);
    try {
      const api = (await import('../lib/api')).default;
      const { data } = await api.post('/leads/import', { items });
      toast.success(`Imported ${data.inserted} numbers from web`);
      onClose();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Import failed'); }
    finally { setImporting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-md border border-zinc-200 bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold">Import leads</h3>
          <button onClick={onClose}><X className="h-4 w-4" /></button>
        </div>

        <div className="mb-4 flex border-b border-zinc-200">
          {[
            { id: 'csv', label: 'CSV Upload', icon: Upload },
            { id: 'url', label: 'From Web Page', icon: Globe },
          ].map(t => (
            <button
              key={t.id}
              type="button"
              data-testid={`import-tab-${t.id}`}
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition ${
                tab === t.id ? 'border-b-2 border-wa-dark text-wa-dark' : 'text-zinc-500 hover:text-zinc-800'
              }`}
            >
              <t.icon className="h-3.5 w-3.5" /> {t.label}
            </button>
          ))}
        </div>

        {tab === 'csv' && (
          <form onSubmit={doCsv} className="space-y-3">
            <p className="text-xs text-zinc-600">Upload a CSV or paste below. Required header: <span className="font-mono">phone</span>. Optional: <span className="font-mono">name, email, company</span>.</p>
            <label className="block">
              <input data-testid="csv-file" type="file" accept=".csv,text/csv" onChange={onFile} className="block w-full text-xs text-zinc-700 file:mr-3 file:rounded-md file:border file:border-zinc-300 file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-zinc-700 hover:file:bg-zinc-50" />
            </label>
            <textarea data-testid="csv-input" rows={8} value={csv} onChange={(e) => setCsv(e.target.value)} className="w-full rounded-md border border-zinc-300 px-3 py-2 font-mono text-xs" />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className="rounded-md border border-zinc-300 px-3 py-2 text-sm">Cancel</button>
              <button data-testid="csv-submit" disabled={importing} className="rounded-md bg-green-600 px-3 py-2 text-sm text-white disabled:opacity-60">{importing ? 'Importing…' : 'Import'}</button>
            </div>
          </form>
        )}

        {tab === 'url' && (
          <div className="space-y-3">
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <AlertTriangle className="mr-1 inline h-3 w-3" />
              Use only on pages you own or with explicit consent. WhatsApp requires opt-in before messaging — you are responsible for compliance.
            </div>
            <p className="text-xs text-zinc-600">Paste a URL (e.g. your public contact page). We'll extract phone numbers + emails — you pick which to import.</p>
            <div className="flex gap-2">
              <select value={country} onChange={(e) => setCountry(e.target.value)} className="rounded-md border border-zinc-300 px-2 py-2 text-sm">
                <option value="+91">🇮🇳 +91</option>
                <option value="+1">🇺🇸 +1</option>
                <option value="+44">🇬🇧 +44</option>
                <option value="+971">🇦🇪 +971</option>
                <option value="+65">🇸🇬 +65</option>
              </select>
              <input
                data-testid="scrape-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://yourbrand.com/contact"
                className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm"
              />
              <button
                data-testid="scrape-run"
                type="button"
                onClick={doScrape}
                disabled={scraping || !url.trim()}
                className="inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
              >
                {scraping ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Globe className="h-3.5 w-3.5" />} Scan
              </button>
            </div>

            {scrapeResult && (
              <div className="space-y-2 rounded-md border border-zinc-200 bg-zinc-50 p-3">
                <div className="flex items-center justify-between text-xs">
                  <div>
                    <div className="font-medium text-zinc-900">{scrapeResult.page_title || 'Web page'}</div>
                    <div className="text-zinc-500">{scrapeResult.phones_found} phone numbers · {scrapeResult.duplicates} already in your CRM</div>
                  </div>
                  {scrapeResult.rows?.length > 0 && (
                    <div className="flex gap-1 text-[10px]">
                      <button type="button" onClick={() => { const next = {}; scrapeResult.rows.forEach(r => { next[r.phone] = !r.duplicate; }); setSelected(next); }} className="rounded border border-zinc-300 bg-white px-2 py-0.5">Select new</button>
                      <button type="button" onClick={() => setSelected({})} className="rounded border border-zinc-300 bg-white px-2 py-0.5">Clear</button>
                    </div>
                  )}
                </div>
                {scrapeResult.rows?.length > 0 ? (
                  <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border border-zinc-200 bg-white p-2">
                    {scrapeResult.rows.map(r => (
                      <label key={r.phone} className={`flex items-center justify-between gap-2 rounded px-2 py-1 text-xs ${r.duplicate ? 'text-zinc-400' : 'hover:bg-zinc-50'}`}>
                        <span className="inline-flex items-center gap-2">
                          <input
                            type="checkbox"
                            disabled={r.duplicate}
                            checked={!!selected[r.phone]}
                            onChange={(e) => setSelected(s => ({ ...s, [r.phone]: e.target.checked }))}
                            data-testid={`scrape-row-${r.phone}`}
                          />
                          <span className="font-mono">{r.phone}</span>
                        </span>
                        {r.duplicate && <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[9px] uppercase tracking-wider text-zinc-500">already imported</span>}
                      </label>
                    ))}
                  </div>
                ) : (
                  <div className="text-center text-xs text-zinc-500">No phone numbers detected on this page.</div>
                )}
                {scrapeResult.emails_found?.length > 0 && (
                  <div className="text-[11px] text-zinc-600"><b>Emails found:</b> {scrapeResult.emails_found.slice(0, 5).join(', ')}{scrapeResult.emails_found.length > 5 && '…'}</div>
                )}
                {scrapeResult.rows?.length > 0 && (
                  <button
                    data-testid="scrape-import"
                    type="button"
                    onClick={doScrapeImport}
                    disabled={importing || Object.values(selected).filter(Boolean).length === 0}
                    className="w-full rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-wa-mid disabled:opacity-60"
                  >
                    {importing ? 'Importing…' : `Import ${Object.values(selected).filter(Boolean).length} selected → CRM`}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
