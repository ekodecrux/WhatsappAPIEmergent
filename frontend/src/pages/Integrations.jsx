import React, { useEffect, useState } from 'react';
import api from '../lib/api';
import {
  Plus, Copy, Trash2, X, KeyRound, Webhook, ShieldCheck, Eye, EyeOff,
  Send, Activity, BookOpen, CheckCircle2, XCircle, Code2,
} from 'lucide-react';
import { toast } from 'sonner';

const TABS = [
  { id: 'keys', label: 'API keys', icon: KeyRound },
  { id: 'webhooks', label: 'Webhooks', icon: Webhook },
  { id: 'deliveries', label: 'Activity', icon: Activity },
  { id: 'docs', label: 'Docs', icon: BookOpen },
];

const ALL_EVENTS = [
  { id: 'message.received', label: 'Inbound messages' },
  { id: 'message.sent', label: 'Outbound sent' },
  { id: 'message.status', label: 'Status updates' },
  { id: 'message.failed', label: 'Send failures' },
  { id: 'lead.created', label: 'New lead' },
  { id: 'test.ping', label: 'Test pings' },
];

function StatusBadge({ status }) {
  const map = {
    success: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800',
    pending: 'bg-amber-100 text-amber-800',
  };
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${map[status] || 'bg-zinc-100 text-zinc-700'}`}>{status}</span>;
}

export default function Integrations() {
  const [tab, setTab] = useState('keys');
  const [keys, setKeys] = useState([]);
  const [hooks, setHooks] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [openKey, setOpenKey] = useState(false);
  const [openHook, setOpenHook] = useState(false);
  const [keyForm, setKeyForm] = useState({ name: '' });
  const [hookForm, setHookForm] = useState({
    name: '', url: '',
    events: [],
    secret: '',
  });
  const [generated, setGenerated] = useState(null);
  const [showRaw, setShowRaw] = useState(false);
  const [activeHook, setActiveHook] = useState(null);
  const [pinging, setPinging] = useState({});

  const load = async () => {
    const [a, b] = await Promise.all([
      api.get('/integrations/api-keys'),
      api.get('/integrations/webhooks'),
    ]);
    setKeys(a.data); setHooks(b.data);
    if (b.data.length && !activeHook) setActiveHook(b.data[0]);
  };
  useEffect(() => { load(); }, []); // eslint-disable-line

  const loadDeliveries = async (id) => {
    if (!id) return;
    const { data } = await api.get(`/integrations/webhooks/${id}/deliveries`, { params: { limit: 50 } });
    setDeliveries(data);
  };
  useEffect(() => { if (tab === 'deliveries' && activeHook) loadDeliveries(activeHook.id); }, [tab, activeHook]);

  const createKey = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.post('/integrations/api-keys', { name: keyForm.name, scopes: ['send_message', 'create_lead'] });
      setGenerated(data); setShowRaw(true); setOpenKey(false);
      setKeyForm({ name: '' });
      load();
    } catch { toast.error('Failed'); }
  };
  const revoke = async (id) => {
    if (!window.confirm('Revoke this key? Existing ERP integrations will stop working.')) return;
    await api.delete(`/integrations/api-keys/${id}`);
    load();
  };

  const createHook = async (e) => {
    e.preventDefault();
    if (!hookForm.events.length) return toast.error('Pick at least one event');
    try {
      await api.post('/integrations/webhooks', hookForm);
      toast.success('Webhook saved');
      setOpenHook(false);
      setHookForm({ name: '', url: '', events: [], secret: '' });
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Failed'); }
  };
  const removeHook = async (id) => {
    if (!window.confirm('Delete webhook?')) return;
    await api.delete(`/integrations/webhooks/${id}`);
    if (activeHook?.id === id) setActiveHook(null);
    load();
  };
  const pingHook = async (id) => {
    setPinging(p => ({ ...p, [id]: true }));
    try {
      const { data } = await api.post(`/integrations/webhooks/${id}/test`);
      toast[data.status === 'success' ? 'success' : 'error'](`Ping ${data.status} (HTTP ${data.status_code}) · ${data.duration_ms}ms`);
      load();
      if (tab === 'deliveries') loadDeliveries(id);
    } catch { toast.error('Ping failed'); }
    finally { setPinging(p => ({ ...p, [id]: false })); }
  };

  const toggleEvent = (e) => {
    setHookForm(f => f.events.includes(e)
      ? { ...f, events: f.events.filter(x => x !== e) }
      : { ...f, events: [...f.events, e] });
  };

  const copy = (text) => { navigator.clipboard.writeText(text); toast.success('Copied'); };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">ERP &amp; API</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Connect WhatsApp to any internal tool — signed webhooks, wallet-billed sends, and templated bulk delivery.
        </p>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-zinc-200" data-testid="erp-tabs">
        {TABS.map(t => (
          <button
            key={t.id}
            data-testid={`erp-tab-${t.id}`}
            onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition ${tab === t.id ? 'border-wa-dark text-wa-dark' : 'border-transparent text-zinc-600 hover:text-zinc-900'}`}
          >
            <t.icon className="h-3.5 w-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {/* Generated key reveal */}
      {generated && (
        <div className="rounded-md border border-green-300 bg-green-50 p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 text-wa-dark" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-green-900">Save this API key — it&apos;s shown only once</div>
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

      {tab === 'keys' && (
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
                <tr>
                  <th className="px-5 py-2.5 text-left font-semibold">Name</th>
                  <th className="px-5 py-2.5 text-left font-semibold">Prefix</th>
                  <th className="px-5 py-2.5 text-left font-semibold">Calls</th>
                  <th className="px-5 py-2.5 text-left font-semibold">Limit / min</th>
                  <th className="px-5 py-2.5 text-left font-semibold">Last used</th>
                  <th className="px-5 py-2.5 text-left font-semibold">Status</th>
                  <th className="px-5 py-2.5 text-right font-semibold">·</th>
                </tr>
              </thead>
              <tbody>
                {keys.length === 0 && <tr><td colSpan={7} className="px-5 py-12 text-center text-zinc-500"><KeyRound className="mx-auto mb-3 h-6 w-6 text-zinc-300" />No API keys yet. Generate one to start integrating your ERP.</td></tr>}
                {keys.map(k => (
                  <tr key={k.id} className="border-b border-zinc-100 last:border-0">
                    <td className="px-5 py-3 font-medium">{k.name}</td>
                    <td className="px-5 py-3 font-mono text-xs">{k.key_prefix}…</td>
                    <td className="px-5 py-3 font-mono text-xs">{(k.call_count || 0).toLocaleString()}</td>
                    <td className="px-5 py-3 font-mono text-xs">{k.rate_limit_per_min || 120}</td>
                    <td className="px-5 py-3 text-xs text-zinc-500">{k.last_used_at ? new Date(k.last_used_at).toLocaleString() : '—'}</td>
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
      )}

      {tab === 'webhooks' && (
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
                <tr>
                  <th className="px-5 py-2.5 text-left font-semibold">Name</th>
                  <th className="px-5 py-2.5 text-left font-semibold">URL</th>
                  <th className="px-5 py-2.5 text-left font-semibold">Events</th>
                  <th className="px-5 py-2.5 text-left font-semibold">Deliveries</th>
                  <th className="px-5 py-2.5 text-left font-semibold">Last</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {hooks.length === 0 && <tr><td colSpan={6} className="px-5 py-12 text-center text-zinc-500"><Webhook className="mx-auto mb-3 h-6 w-6 text-zinc-300" />No webhooks yet. Add one to push WhatsApp events to your ERP.</td></tr>}
                {hooks.map(h => (
                  <tr key={h.id} className="border-b border-zinc-100 last:border-0">
                    <td className="px-5 py-3 font-medium">{h.name}</td>
                    <td className="px-5 py-3 font-mono text-xs text-zinc-600 max-w-[260px] truncate">{h.url}</td>
                    <td className="px-5 py-3"><div className="flex flex-wrap gap-1">{h.events?.map(e => <span key={e} className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px]">{e}</span>)}</div></td>
                    <td className="px-5 py-3 text-xs">
                      <span className="font-mono">{h.delivery_count || 0}</span>
                      {h.success_count != null && (
                        <span className="ml-2 text-zinc-500">
                          <span className="text-green-700">{h.success_count}</span>/<span className="text-red-700">{h.failure_count}</span>
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3"><StatusBadge status={h.last_status} /></td>
                    <td className="px-5 py-3 text-right space-x-1">
                      <button data-testid={`ping-${h.id}`} onClick={() => pingHook(h.id)} disabled={pinging[h.id]} className="inline-flex items-center gap-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-[11px] hover:bg-zinc-50 disabled:opacity-50">
                        <Send className="h-3 w-3" /> {pinging[h.id] ? 'Pinging…' : 'Ping'}
                      </button>
                      <button onClick={() => { setActiveHook(h); setTab('deliveries'); }} className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-[11px] hover:bg-zinc-50">Activity</button>
                      <button onClick={() => removeHook(h.id)} className="rounded-md p-1 text-zinc-500 hover:bg-red-50 hover:text-red-700"><Trash2 className="h-3.5 w-3.5" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'deliveries' && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-lg font-medium">Webhook deliveries</h2>
            <select
              value={activeHook?.id || ''}
              onChange={(e) => setActiveHook(hooks.find(h => h.id === e.target.value))}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs"
            >
              <option value="">Select a webhook…</option>
              {hooks.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          </div>
          <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
            {!activeHook && <div className="p-12 text-center text-sm text-zinc-500">Select a webhook to view its delivery history.</div>}
            {activeHook && deliveries.length === 0 && <div className="p-12 text-center text-sm text-zinc-500">No deliveries yet for this webhook.</div>}
            {activeHook && deliveries.map(d => (
              <details key={d.id} className="border-b border-zinc-100 last:border-0">
                <summary className="flex cursor-pointer items-center gap-3 px-4 py-3 text-xs hover:bg-zinc-50">
                  {d.status === 'success' ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-red-600" />}
                  <span className="font-mono text-zinc-700">{d.event}</span>
                  <span className="text-zinc-400">·</span>
                  <span className="font-mono text-zinc-600">HTTP {d.status_code}</span>
                  <span className="text-zinc-400">·</span>
                  <span className="text-zinc-500">{d.duration_ms}ms</span>
                  <span className="ml-auto text-zinc-500">{new Date(d.attempted_at).toLocaleString()}</span>
                </summary>
                <div className="grid gap-3 bg-zinc-50 p-4 lg:grid-cols-2">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Request</div>
                    <pre className="mt-1 max-h-60 overflow-auto rounded border border-zinc-200 bg-white p-2 text-[11px] leading-relaxed">{d.request_body}</pre>
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Response</div>
                    <pre className="mt-1 max-h-60 overflow-auto rounded border border-zinc-200 bg-white p-2 text-[11px] leading-relaxed">{d.response_body || '—'}</pre>
                  </div>
                </div>
              </details>
            ))}
          </div>
        </section>
      )}

      {tab === 'docs' && <DocsPanel />}

      {openKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-md border border-zinc-200 bg-white p-6">
            <div className="mb-4 flex items-center justify-between"><h3 className="font-display text-lg font-semibold">New API key</h3><button onClick={() => setOpenKey(false)}><X className="h-4 w-4" /></button></div>
            <form onSubmit={createKey} className="space-y-3">
              <input data-testid="key-name" required placeholder="Name (e.g. Odoo prod)" value={keyForm.name} onChange={(e) => setKeyForm({ name: e.target.value })} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
              <p className="text-xs text-zinc-500">This key will have <code className="rounded bg-zinc-100 px-1">send_message</code> &amp; <code className="rounded bg-zinc-100 px-1">create_lead</code> scopes. Default rate limit: 120 calls/min.</p>
              <div className="flex justify-end gap-2"><button type="button" onClick={() => setOpenKey(false)} className="rounded-md border border-zinc-300 px-3 py-2 text-sm">Cancel</button><button data-testid="key-submit" className="rounded-md bg-green-600 px-3 py-2 text-sm text-white">Generate</button></div>
            </form>
          </div>
        </div>
      )}

      {openHook && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-md border border-zinc-200 bg-white p-6">
            <div className="mb-4 flex items-center justify-between"><h3 className="font-display text-lg font-semibold">New webhook</h3><button onClick={() => setOpenHook(false)}><X className="h-4 w-4" /></button></div>
            <form onSubmit={createHook} className="space-y-3">
              <input data-testid="hook-name" required placeholder="Name (e.g. Odoo CRM)" value={hookForm.name} onChange={(e) => setHookForm({ ...hookForm, name: e.target.value })} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
              <input data-testid="hook-url" required type="url" placeholder="https://your-erp.com/webhooks/whatsapp" value={hookForm.url} onChange={(e) => setHookForm({ ...hookForm, url: e.target.value })} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
              <input data-testid="hook-secret" placeholder="HMAC secret (optional but recommended)" value={hookForm.secret} onChange={(e) => setHookForm({ ...hookForm, secret: e.target.value })} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm font-mono" />
              <div>
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Subscribed events</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {ALL_EVENTS.map(e => (
                    <label key={e.id} className={`flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs ${hookForm.events.includes(e.id) ? 'border-wa-dark bg-wa-dark/5' : 'border-zinc-200'}`}>
                      <input type="checkbox" checked={hookForm.events.includes(e.id)} onChange={() => toggleEvent(e.id)} className="h-3.5 w-3.5" />
                      <span><span className="font-mono">{e.id}</span> <span className="text-zinc-500">— {e.label}</span></span>
                    </label>
                  ))}
                </div>
              </div>
              <p className="text-[11px] text-zinc-500">We&apos;ll POST signed JSON with <code className="rounded bg-zinc-100 px-1">X-Wabridge-Signature-256</code> header. Verify it with HMAC-SHA256(secret, body).</p>
              <div className="flex justify-end gap-2"><button type="button" onClick={() => setOpenHook(false)} className="rounded-md border border-zinc-300 px-3 py-2 text-sm">Cancel</button><button data-testid="hook-submit" className="rounded-md bg-green-600 px-3 py-2 text-sm text-white">Save</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function DocsPanel() {
  const [section, setSection] = useState('quickstart');
  const SECTIONS = [
    { id: 'quickstart', label: 'Quick start' },
    { id: 'send', label: 'Send message' },
    { id: 'bulk', label: 'Bulk send' },
    { id: 'template', label: 'Template send' },
    { id: 'history', label: 'Message history' },
    { id: 'balance', label: 'Wallet balance' },
    { id: 'webhooks', label: 'Webhook payloads' },
  ];
  return (
    <div className="grid gap-5 lg:grid-cols-[200px_1fr]">
      <nav className="space-y-1">
        {SECTIONS.map(s => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            className={`block w-full rounded-md px-3 py-2 text-left text-sm font-medium transition ${section === s.id ? 'bg-wa-dark text-white' : 'text-zinc-700 hover:bg-zinc-100'}`}
          >{s.label}</button>
        ))}
      </nav>
      <div className="rounded-md border border-zinc-200 bg-white p-5">
        {section === 'quickstart' && <QuickStart />}
        {section === 'send' && <DocBlock title="POST /api/integrations/erp/send-message"
          desc="Wallet-billed single send. Persists into your tenant chat history & dispatches a message.sent webhook."
          curl={`curl -X POST {API_BASE}/api/integrations/erp/send-message \\
  -H "X-API-Key: <YOUR_KEY>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "to_phone": "+919876543210",
    "message": "Order #INV-1042 confirmed. Track: bit.ly/x",
    "category": "utility"
  }'`} />}
        {section === 'bulk' && <DocBlock title="POST /api/integrations/erp/send-bulk"
          desc="Up to 100 recipients in one call. Per-recipient {{variables}} are interpolated into the message body."
          curl={`curl -X POST {API_BASE}/api/integrations/erp/send-bulk \\
  -H "X-API-Key: <YOUR_KEY>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "message": "Hi {{name}}, your order {{order}} is shipped.",
    "category": "utility",
    "recipients": [
      {"to_phone":"+919876543210","variables":{"name":"Asha","order":"INV-101"}},
      {"to_phone":"+919876543211","variables":{"name":"Ravi","order":"INV-102"}}
    ]
  }'`} />}
        {section === 'template' && <DocBlock title="POST /api/integrations/erp/send-template"
          desc="Send using a saved template + variables. Inherits any media attached on the template."
          curl={`curl -X POST {API_BASE}/api/integrations/erp/send-template \\
  -H "X-API-Key: <YOUR_KEY>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "template_id": "<TEMPLATE_ID>",
    "to_phone": "+919876543210",
    "variables": {"name":"Asha","amount":"₹1,499"}
  }'`} />}
        {section === 'history' && <DocBlock title="GET /api/integrations/erp/messages"
          desc="Fetch the latest 50 messages for a phone or conversation."
          curl={`curl "{API_BASE}/api/integrations/erp/messages?phone=%2B919876543210&limit=50" \\
  -H "X-API-Key: <YOUR_KEY>"`} />}
        {section === 'balance' && <DocBlock title="GET /api/integrations/erp/balance"
          desc="Check the tenant's wallet balance & billing mode before queuing big batches."
          curl={`curl {API_BASE}/api/integrations/erp/balance \\
  -H "X-API-Key: <YOUR_KEY>"`} />}
        {section === 'webhooks' && <WebhookDocs />}
      </div>
    </div>
  );
}

function QuickStart() {
  return (
    <div className="space-y-4 text-sm text-zinc-700">
      <h3 className="font-display text-lg font-semibold">Get started in 3 steps</h3>
      <ol className="space-y-3">
        <li><span className="mr-2 inline-grid h-5 w-5 place-items-center rounded-full bg-wa-dark text-[11px] font-bold text-white">1</span><strong>Generate an API key</strong> — switch to the API keys tab and click <em>Generate key</em>. Copy the <code className="rounded bg-zinc-100 px-1 font-mono">wsk_…</code> value (shown once).</li>
        <li><span className="mr-2 inline-grid h-5 w-5 place-items-center rounded-full bg-wa-dark text-[11px] font-bold text-white">2</span><strong>Top up your wallet</strong> — every send debits your balance based on category (Marketing ₹0.85, Utility ₹0.115). Use the Wallet page.</li>
        <li><span className="mr-2 inline-grid h-5 w-5 place-items-center rounded-full bg-wa-dark text-[11px] font-bold text-white">3</span><strong>Call the API from your ERP</strong> — pass <code className="rounded bg-zinc-100 px-1 font-mono">X-API-Key</code> on every request. Add a webhook to receive replies + status updates.</li>
      </ol>
      <div className="rounded-md border border-zinc-200 bg-zinc-950 p-4 font-mono text-[11px] leading-6 text-zinc-300">
        <div className="mb-1 text-[10px] uppercase tracking-[0.2em] text-zinc-500">// First call</div>
<pre className="whitespace-pre-wrap">{`curl -X POST {API_BASE}/api/integrations/erp/send-message \\
  -H "X-API-Key: <YOUR_KEY>" \\
  -H "Content-Type: application/json" \\
  -d '{"to_phone":"+919876543210","message":"Hello from our ERP"}'`}</pre>
      </div>
      <p className="text-xs text-zinc-500">Default rate limit: 120 requests/minute per API key. If you exceed it you&apos;ll receive HTTP 429 and the request is not billed.</p>
    </div>
  );
}

function DocBlock({ title, desc, curl }) {
  return (
    <div className="space-y-3 text-sm">
      <h3 className="font-display text-lg font-semibold flex items-center gap-2"><Code2 className="h-4 w-4 text-wa-dark" />{title}</h3>
      <p className="text-zinc-600">{desc}</p>
      <div className="rounded-md border border-zinc-200 bg-zinc-950 p-4 font-mono text-[11px] leading-6 text-zinc-300">
        <pre className="whitespace-pre-wrap">{curl}</pre>
      </div>
    </div>
  );
}

function WebhookDocs() {
  return (
    <div className="space-y-3 text-sm">
      <h3 className="font-display text-lg font-semibold flex items-center gap-2"><Webhook className="h-4 w-4 text-wa-dark" />Webhook payloads</h3>
      <p className="text-zinc-600">Each delivery is a <code className="rounded bg-zinc-100 px-1">POST</code> with these headers + JSON body:</p>
      <div className="rounded-md border border-zinc-200 bg-zinc-950 p-4 font-mono text-[11px] leading-6 text-zinc-300">
<pre className="whitespace-pre-wrap">{`X-Wabridge-Event:        message.received
X-Wabridge-Webhook-Id:   <id>
X-Wabridge-Signature-256: sha256=<HMAC256(secret, body)>

{
  "event": "message.received",
  "delivered_at": "2026-04-28T12:01:24Z",
  "data": {
    "id": "msg-uuid",
    "conversation_id": "conv-uuid",
    "from_phone": "+919876543210",
    "content": "Hi, can I get a quote?",
    "sentiment": "positive",
    "lead_score": 78,
    "provider": "meta_cloud"
  }
}`}</pre>
      </div>
      <p className="text-xs text-zinc-500">Verify the signature in your handler before trusting the payload. Reject events older than 5 minutes to mitigate replay.</p>
    </div>
  );
}
