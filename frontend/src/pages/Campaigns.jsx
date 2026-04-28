import React, { useEffect, useState } from 'react';
import api from '../lib/api';
import { Send, Plus, Play, Pause, X, CheckCircle2, Clock, AlertCircle, RotateCw, Image as ImageIcon, Beaker, Trash2, Zap } from 'lucide-react';
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
  const [form, setForm] = useState({
    name: '', credential_id: '', message: '', recipientsText: '',
    media_url: '', media_type: '',
    variants: [],
  });
  const [variantsOpen, setVariantsOpen] = useState(null); // campaign object for variant report

  const load = async () => {
    const [c, cr] = await Promise.all([
      api.get('/campaigns'),
      api.get('/whatsapp/credentials'),
    ]);
    setItems(c.data);
    setCreds(cr.data);
  };

  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, []);

  // Auto-prefill from AI Assistant action (sessionStorage)
  useEffect(() => {
    const draft = sessionStorage.getItem('wa_ai_campaign_draft');
    if (draft) {
      try {
        const d = JSON.parse(draft);
        setForm(f => ({
          ...f,
          name: d.name || 'AI-drafted campaign',
          message: d.message || f.message,
        }));
        setOpen(true);
        toast.success('AI draft loaded — review and submit');
      } catch {}
      sessionStorage.removeItem('wa_ai_campaign_draft');
    }
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const recipients = form.recipientsText.split(/[\s,;\n]+/).map(s => s.trim()).filter(Boolean);
      if (!recipients.length) throw new Error('Please add at least one recipient');
      if (!form.credential_id) throw new Error('Pick a WhatsApp connection');
      const variants = form.variants.filter(v => (v.message || '').trim());
      if (variants.length) {
        const total = variants.reduce((a, b) => a + Number(b.weight || 0), 0);
        if (total <= 0 || total > 100) throw new Error('Variant weights must sum 1–100%');
      }
      await api.post('/campaigns', {
        name: form.name,
        credential_id: form.credential_id,
        message: form.message,
        recipients,
        media_url: form.media_url || null,
        media_type: form.media_url ? (form.media_type || 'image') : null,
        variants,
      });
      toast.success('Campaign created — pending approval');
      setOpen(false);
      setForm({ name: '', credential_id: '', message: '', recipientsText: '', media_url: '', media_type: '', variants: [] });
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message || 'Failed');
    } finally { setBusy(false); }
  };

  const addVariant = () => {
    setForm(f => {
      const next = [...f.variants];
      const remaining = 100 - next.reduce((a, b) => a + Number(b.weight || 0), 0);
      next.push({ name: `Variant ${String.fromCharCode(65 + next.length)}`, message: '', weight: Math.max(10, Math.min(50, remaining)) });
      return { ...f, variants: next };
    });
  };
  const removeVariant = (i) => setForm(f => ({ ...f, variants: f.variants.filter((_, idx) => idx !== i) }));
  const updateVariant = (i, patch) => setForm(f => ({ ...f, variants: f.variants.map((v, idx) => idx === i ? { ...v, ...patch } : v) }));

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
  const resume = async (id) => {
    await api.post(`/campaigns/${id}/resume`, {});
    toast.success('Resumed');
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
                      {c.is_ab_test && (
                        <button data-testid={`variants-${c.id}`} onClick={() => setVariantsOpen(c)} className="inline-flex items-center gap-1 rounded-md border border-purple-300 bg-purple-50 px-2 py-1 text-[11px] font-medium text-purple-800 hover:bg-purple-100">
                          <Beaker className="h-3 w-3" /> A/B
                        </button>
                      )}
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
                      {c.status === 'paused' && (
                        <button data-testid={`resume-${c.id}`} onClick={() => resume(c.id)} className="inline-flex items-center gap-1 rounded-md bg-wa-dark px-2.5 py-1 text-[11px] font-medium text-white hover:bg-wa-mid">
                          <RotateCw className="h-3 w-3" /> Resume
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
                <textarea data-testid="campaign-message" required={form.variants.length === 0} rows={3} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" placeholder="Hi {{name}}, …" />
                <div className="mt-1 text-[10px] text-zinc-500">When A/B variants are added, this is used as fallback only.</div>
              </div>

              {/* Media attachment */}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[2fr_1fr]">
                <input
                  data-testid="campaign-media-url"
                  type="url"
                  value={form.media_url}
                  onChange={(e) => setForm({ ...form, media_url: e.target.value })}
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm font-mono"
                  placeholder="Optional media URL (https://… image, PDF, mp3, mp4)"
                />
                <select
                  data-testid="campaign-media-type"
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

              {/* A/B Variants */}
              <div className="rounded-md border border-zinc-200 bg-zinc-50/60 p-3">
                <div className="flex items-center justify-between">
                  <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-800">
                    <Beaker className="h-3.5 w-3.5 text-purple-700" /> A/B Test variants {form.variants.length ? `· ${form.variants.length}` : ''}
                  </div>
                  <button type="button" data-testid="add-variant" onClick={addVariant} className="inline-flex items-center gap-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-[11px] font-medium hover:bg-zinc-50">
                    <Plus className="h-3 w-3" /> Add variant
                  </button>
                </div>
                {form.variants.length === 0 && <div className="mt-1.5 text-[11px] text-zinc-500">Optional: split your audience across 2+ message variants and let stats show the winner.</div>}
                <div className="mt-2 space-y-2">
                  {form.variants.map((v, i) => (
                    <div key={i} className="rounded-md border border-zinc-200 bg-white p-2.5">
                      <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2">
                        <input value={v.name} onChange={(e) => updateVariant(i, { name: e.target.value })} className="rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium" placeholder="Variant name" />
                        <div className="inline-flex items-center gap-1 text-[10px] text-zinc-600">
                          <input type="number" min={1} max={99} value={v.weight} onChange={(e) => updateVariant(i, { weight: Number(e.target.value) })} className="w-14 rounded-md border border-zinc-300 px-1.5 py-1 text-xs font-mono" />
                          % traffic
                        </div>
                        <button type="button" onClick={() => removeVariant(i)} className="rounded-md p-1 text-zinc-500 hover:bg-red-50 hover:text-red-700"><Trash2 className="h-3 w-3" /></button>
                      </div>
                      <textarea rows={2} value={v.message} onChange={(e) => updateVariant(i, { message: e.target.value })} className="mt-1.5 w-full rounded-md border border-zinc-300 px-2 py-1 text-xs" placeholder="Variant message text…" />
                    </div>
                  ))}
                </div>
                {form.variants.length > 0 && (
                  <div className="mt-2 text-[10px] text-zinc-500">
                    Total weight: <span className={form.variants.reduce((a, b) => a + Number(b.weight || 0), 0) > 100 ? 'font-semibold text-red-600' : 'font-semibold text-zinc-700'}>{form.variants.reduce((a, b) => a + Number(b.weight || 0), 0)}%</span> (must sum to ≤100)
                  </div>
                )}
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
      {variantsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-md border border-zinc-200 bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold inline-flex items-center gap-2">
                <Beaker className="h-4 w-4 text-purple-700" /> A/B results · {variantsOpen.name}
              </h3>
              <button onClick={() => setVariantsOpen(null)}><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3">
              {(variantsOpen.variants || []).map((v, i) => {
                const sent = v.sent_count || 0;
                const delivered = v.delivered_count || 0;
                const failed = v.failed_count || 0;
                const rate = sent > 0 ? Math.round((delivered / sent) * 100) : 0;
                const total = (variantsOpen.variants || []).reduce((a, b) => a + (b.sent_count || 0), 0) || 1;
                const share = Math.round((sent / total) * 100);
                const winner = (variantsOpen.variants || []).every(x => (x.delivered_count || 0) <= delivered) && delivered > 0;
                return (
                  <div key={i} className={`rounded-md border p-4 ${winner ? 'border-green-500 bg-green-50/40' : 'border-zinc-200'}`}>
                    <div className="flex items-center justify-between">
                      <div className="inline-flex items-center gap-2">
                        <span className="text-sm font-semibold">{v.name}</span>
                        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-mono text-zinc-700">{v.weight}% allocated</span>
                        {winner && <span className="rounded-full bg-green-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white"><Zap className="-mt-0.5 inline h-2.5 w-2.5" /> Winner</span>}
                      </div>
                      <span className="text-xs text-zinc-500">{share}% share of sends</span>
                    </div>
                    <div className="mt-2 line-clamp-2 rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700">{v.message}</div>
                    <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
                      <div><div className="text-[10px] uppercase tracking-wider text-zinc-500">Sent</div><div className="font-mono text-base font-semibold">{sent}</div></div>
                      <div><div className="text-[10px] uppercase tracking-wider text-zinc-500">Delivered</div><div className="font-mono text-base font-semibold text-green-700">{delivered}</div></div>
                      <div><div className="text-[10px] uppercase tracking-wider text-zinc-500">Failed</div><div className="font-mono text-base font-semibold text-red-700">{failed}</div></div>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-100">
                      <div className="h-full rounded-full bg-green-600" style={{ width: `${rate}%` }} />
                    </div>
                    <div className="mt-1 text-right text-[10px] font-mono text-zinc-500">Delivery rate: {rate}%</div>
                  </div>
                );
              })}
            </div>
            <div className="mt-5 flex justify-end">
              <button onClick={() => setVariantsOpen(null)} className="rounded-md border border-zinc-300 px-3 py-2 text-sm">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
