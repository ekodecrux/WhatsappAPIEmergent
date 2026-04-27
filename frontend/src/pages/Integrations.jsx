import React, { useEffect, useState } from 'react';
import api from '../lib/api';
import { Plus, Copy, Trash2, X, KeyRound, Webhook, ShieldCheck, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

export default function Integrations() {
  const [keys, setKeys] = useState([]);
  const [hooks, setHooks] = useState([]);
  const [audits, setAudits] = useState([]);
  const [openKey, setOpenKey] = useState(false);
  const [openHook, setOpenHook] = useState(false);
  const [keyForm, setKeyForm] = useState({ name: '' });
  const [hookForm, setHookForm] = useState({ name: '', url: '', events: ['message.received', 'message.status'] });
  const [generated, setGenerated] = useState(null);
  const [showRaw, setShowRaw] = useState(false);

  const load = async () => {
    const [a, b, c] = await Promise.all([
      api.get('/integrations/api-keys'),
      api.get('/integrations/webhooks'),
      api.get('/integrations/audit-logs'),
    ]);
    setKeys(a.data); setHooks(b.data); setAudits(c.data);
  };
  useEffect(() => { load(); }, []);

  const createKey = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.post('/integrations/api-keys', { name: keyForm.name, scopes: ['send_message', 'create_lead'] });
      setGenerated(data);
      setShowRaw(true);
      setOpenKey(false);
      setKeyForm({ name: '' });
      load();
    } catch { toast.error('Failed'); }
  };
  const revoke = async (id) => {
    if (!window.confirm('Revoke this key?')) return;
    await api.delete(`/integrations/api-keys/${id}`);
    load();
  };

  const createHook = async (e) => {
    e.preventDefault();
    try {
      await api.post('/integrations/webhooks', hookForm);
      toast.success('Webhook saved');
      setOpenHook(false);
      setHookForm({ name: '', url: '', events: ['message.received', 'message.status'] });
      load();
    } catch { toast.error('Failed'); }
  };
  const removeHook = async (id) => {
    if (!window.confirm('Delete webhook?')) return;
    await api.delete(`/integrations/webhooks/${id}`);
    load();
  };

  const copy = (text) => { navigator.clipboard.writeText(text); toast.success('Copied'); };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">ERP &amp; API</h1>
        <p className="mt-1 text-sm text-zinc-600">Connect WhatsApp to any ERP using signed API keys and webhooks.</p>
      </div>

      {/* Generated key reveal */}
      {generated && (
        <div className="rounded-md border border-green-300 bg-green-50 p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 text-wa-dark" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-green-900">Save this API key — it's shown only once</div>
              <div className="mt-2 flex items-center gap-2 rounded-md border border-green-200 bg-white p-2.5 font-mono text-xs">
                <code className="flex-1 truncate" data-testid="generated-key">{showRaw ? generated.api_key : '•'.repeat(32)}</code>
                <button onClick={() => setShowRaw(s => !s)} className="rounded p-1 hover:bg-zinc-100">{showRaw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}</button>
                <button onClick={() => copy(generated.api_key)} className="rounded p-1 hover:bg-zinc-100"><Copy className="h-3.5 w-3.5" /></button>
              </div>
              <button onClick={() => setGenerated(null)} className="mt-2 text-xs text-green-800 underline">Dismiss</button>
            </div>
          </div>
        </div>
      )}

      {/* API keys */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-medium">API keys</h2>
          <button data-testid="new-api-key" onClick={() => setOpenKey(true)} className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-wa-mid">
            <Plus className="h-3.5 w-3.5" /> Generate key
          </button>
        </div>
        <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-[11px] uppercase tracking-wider text-zinc-500">
              <tr><th className="px-5 py-2.5 text-left font-semibold">Name</th><th className="px-5 py-2.5 text-left font-semibold">Prefix</th><th className="px-5 py-2.5 text-left font-semibold">Calls</th><th className="px-5 py-2.5 text-left font-semibold">Status</th><th className="px-5 py-2.5 text-right font-semibold">·</th></tr>
            </thead>
            <tbody>
              {keys.length === 0 && <tr><td colSpan={5} className="px-5 py-12 text-center text-zinc-500"><KeyRound className="mx-auto mb-3 h-6 w-6 text-zinc-300" />No API keys yet.</td></tr>}
              {keys.map(k => (
                <tr key={k.id} className="border-b border-zinc-100 last:border-0">
                  <td className="px-5 py-3 font-medium">{k.name}</td>
                  <td className="px-5 py-3 font-mono text-xs">{k.key_prefix}…</td>
                  <td className="px-5 py-3 font-mono text-xs">{k.call_count || 0}</td>
                  <td className="px-5 py-3"><span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${k.is_active ? 'bg-green-100 text-green-800' : 'bg-zinc-100 text-zinc-600'}`}>{k.is_active ? 'active' : 'revoked'}</span></td>
                  <td className="px-5 py-3 text-right">
                    {k.is_active && <button data-testid={`revoke-${k.id}`} onClick={() => revoke(k.id)} className="rounded-md p-1 text-zinc-500 hover:bg-red-50 hover:text-red-700"><Trash2 className="h-3.5 w-3.5" /></button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Webhooks */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-medium">Outbound webhooks</h2>
          <button data-testid="new-webhook" onClick={() => setOpenHook(true)} className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50">
            <Plus className="h-3.5 w-3.5" /> Add webhook
          </button>
        </div>
        <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-[11px] uppercase tracking-wider text-zinc-500">
              <tr><th className="px-5 py-2.5 text-left font-semibold">Name</th><th className="px-5 py-2.5 text-left font-semibold">URL</th><th className="px-5 py-2.5 text-left font-semibold">Events</th><th className="px-5 py-2.5 text-right font-semibold">·</th></tr>
            </thead>
            <tbody>
              {hooks.length === 0 && <tr><td colSpan={4} className="px-5 py-12 text-center text-zinc-500"><Webhook className="mx-auto mb-3 h-6 w-6 text-zinc-300" />No webhooks yet.</td></tr>}
              {hooks.map(h => (
                <tr key={h.id} className="border-b border-zinc-100 last:border-0">
                  <td className="px-5 py-3 font-medium">{h.name}</td>
                  <td className="px-5 py-3 font-mono text-xs text-zinc-600">{h.url}</td>
                  <td className="px-5 py-3"><div className="flex flex-wrap gap-1">{h.events?.map(e => <span key={e} className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px]">{e}</span>)}</div></td>
                  <td className="px-5 py-3 text-right"><button onClick={() => removeHook(h.id)} className="rounded-md p-1 text-zinc-500 hover:bg-red-50 hover:text-red-700"><Trash2 className="h-3.5 w-3.5" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Code sample */}
      <div className="rounded-md border border-zinc-200 bg-zinc-950 p-5 font-mono text-xs leading-6 text-zinc-300">
        <div className="mb-2 text-[11px] uppercase tracking-[0.2em] text-zinc-500">// Trigger from your ERP</div>
<pre className="whitespace-pre-wrap">{`curl -X POST {API_BASE}/api/integrations/erp/send-message \\
  -H "X-API-Key: {your_key}" \\
  -H "Content-Type: application/json" \\
  -d '{"to_phone":"+919876543210","message":"Order #INV-1042 confirmed"}'`}</pre>
      </div>

      {/* Audit logs */}
      <section className="space-y-3">
        <h2 className="font-display text-lg font-medium">Audit log</h2>
        <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-[11px] uppercase tracking-wider text-zinc-500">
              <tr><th className="px-5 py-2.5 text-left font-semibold">When</th><th className="px-5 py-2.5 text-left font-semibold">Action</th><th className="px-5 py-2.5 text-left font-semibold">Resource</th></tr>
            </thead>
            <tbody>
              {audits.length === 0 && <tr><td colSpan={3} className="px-5 py-8 text-center text-zinc-500">No activity yet.</td></tr>}
              {audits.slice(0, 30).map((a, i) => (
                <tr key={i} className="border-t border-zinc-100">
                  <td className="px-5 py-2 text-xs text-zinc-500">{new Date(a.created_at).toLocaleString()}</td>
                  <td className="px-5 py-2 font-mono text-xs">{a.action}</td>
                  <td className="px-5 py-2 font-mono text-xs text-zinc-500">{a.resource}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* New key modal */}
      {openKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-md border border-zinc-200 bg-white p-6">
            <div className="mb-4 flex items-center justify-between"><h3 className="font-display text-lg font-semibold">New API key</h3><button onClick={() => setOpenKey(false)}><X className="h-4 w-4" /></button></div>
            <form onSubmit={createKey} className="space-y-3">
              <input data-testid="key-name" required placeholder="Name (e.g. Odoo prod)" value={keyForm.name} onChange={(e) => setKeyForm({ name: e.target.value })} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
              <div className="flex justify-end gap-2"><button type="button" onClick={() => setOpenKey(false)} className="rounded-md border border-zinc-300 px-3 py-2 text-sm">Cancel</button><button data-testid="key-submit" className="rounded-md bg-green-600 px-3 py-2 text-sm text-white">Generate</button></div>
            </form>
          </div>
        </div>
      )}

      {openHook && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-md border border-zinc-200 bg-white p-6">
            <div className="mb-4 flex items-center justify-between"><h3 className="font-display text-lg font-semibold">New webhook</h3><button onClick={() => setOpenHook(false)}><X className="h-4 w-4" /></button></div>
            <form onSubmit={createHook} className="space-y-3">
              <input data-testid="hook-name" required placeholder="Name" value={hookForm.name} onChange={(e) => setHookForm({ ...hookForm, name: e.target.value })} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
              <input data-testid="hook-url" required type="url" placeholder="https://your-erp.com/webhooks/whatsapp" value={hookForm.url} onChange={(e) => setHookForm({ ...hookForm, url: e.target.value })} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
              <div className="flex justify-end gap-2"><button type="button" onClick={() => setOpenHook(false)} className="rounded-md border border-zinc-300 px-3 py-2 text-sm">Cancel</button><button data-testid="hook-submit" className="rounded-md bg-green-600 px-3 py-2 text-sm text-white">Save</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
