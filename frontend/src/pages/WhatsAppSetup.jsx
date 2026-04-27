import React, { useEffect, useState } from 'react';
import api from '../lib/api';
import {
  Plus, ShieldCheck, Phone, Trash2, Lock, X, Beaker, Server, AlertCircle, Send
} from 'lucide-react';
import { toast } from 'sonner';

const PROVIDERS = [
  { id: 'twilio_sandbox', label: 'Twilio Sandbox', icon: Beaker, hint: 'Instant — uses platform sandbox. Great for testing.' },
  { id: 'twilio', label: 'Twilio (Own account)', icon: Server, hint: 'Bring your own Twilio WhatsApp credentials.' },
  { id: 'meta_cloud', label: 'Meta Cloud API', icon: Phone, hint: 'Official Meta WhatsApp Business Cloud API.' },
];

export default function WhatsAppSetup() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState('twilio_sandbox');
  const [form, setForm] = useState({ name: '', account_sid: '', auth_token: '', whatsapp_from: '', access_token: '', phone_number_id: '', business_account_id: '' });
  const [busy, setBusy] = useState(false);
  const [simPhone, setSimPhone] = useState('+919876543210');
  const [simText, setSimText] = useState('Hi, I would like a quote for 50 units. Please share details.');
  const [simBusyId, setSimBusyId] = useState(null);

  const load = async () => {
    const { data } = await api.get('/whatsapp/credentials');
    setItems(data);
  };

  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/whatsapp/credentials', { ...form, provider });
      toast.success('WhatsApp credentials connected');
      setOpen(false);
      setForm({ name: '', account_sid: '', auth_token: '', whatsapp_from: '', access_token: '', phone_number_id: '', business_account_id: '' });
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to add credentials');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm('Remove this connection?')) return;
    await api.delete(`/whatsapp/credentials/${id}`);
    toast.success('Removed');
    load();
  };

  const simulate = async (cred_id) => {
    setSimBusyId(cred_id);
    try {
      await api.post('/whatsapp/simulate-inbound', {
        credential_id: cred_id,
        from_phone: simPhone,
        text: simText,
      });
      toast.success('Simulated inbound message — open Live Chat to view.');
    } catch {
      toast.error('Failed to simulate');
    } finally { setSimBusyId(null); }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-center">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">WhatsApp Setup</h1>
          <p className="mt-1 text-sm text-zinc-600">Connect your WhatsApp Business credentials. Stored encrypted.</p>
        </div>
        <button
          data-testid="add-credential-btn"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-wa-mid"
        >
          <Plus className="h-4 w-4" /> Connect account
        </button>
      </div>

      {/* Encryption notice */}
      <div className="flex items-start gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-4">
        <Lock className="mt-0.5 h-4 w-4 text-wa-dark" />
        <div className="text-sm text-zinc-700">
          <span className="font-medium text-zinc-900">Tokens are AES-256 encrypted</span> with a tenant-derived key. Decryption only happens in-memory at send time.
        </div>
      </div>

      {/* List */}
      <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
        <div className="grid grid-cols-12 border-b border-zinc-200 bg-zinc-50 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          <div className="col-span-4">Account</div>
          <div className="col-span-2">Provider</div>
          <div className="col-span-3">From</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-1 text-right">·</div>
        </div>
        {items.length === 0 && (
          <div className="px-5 py-12 text-center text-sm text-zinc-500">
            <ShieldCheck className="mx-auto mb-3 h-6 w-6 text-zinc-300" />
            No connections yet. Add a Twilio sandbox to start in seconds.
          </div>
        )}
        {items.map((c) => (
          <div key={c.id} className="grid grid-cols-12 items-center border-b border-zinc-100 px-5 py-3.5 last:border-b-0">
            <div className="col-span-4">
              <div className="font-medium text-zinc-900">{c.name}</div>
              <div className="font-mono text-xs text-zinc-500">{c.account_sid_masked || '—'}</div>
            </div>
            <div className="col-span-2 text-sm capitalize text-zinc-700">{c.provider.replace('_', ' ')}</div>
            <div className="col-span-3 font-mono text-xs text-zinc-700">{c.whatsapp_from || c.phone_number_id || '—'}</div>
            <div className="col-span-2">
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                c.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-zinc-100 text-zinc-700'
              }`}>
                <span className={`h-1.5 w-1.5 rounded-full ${c.status === 'active' ? 'bg-green-600 live-dot' : 'bg-zinc-400'}`} />
                {c.status}
              </span>
            </div>
            <div className="col-span-1 flex items-center justify-end gap-1">
              <button
                data-testid={`simulate-${c.id}`}
                onClick={() => simulate(c.id)}
                disabled={simBusyId === c.id}
                title="Simulate inbound message"
                className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
              </button>
              <button
                data-testid={`delete-cred-${c.id}`}
                onClick={() => remove(c.id)}
                className="rounded-md p-1.5 text-zinc-500 hover:bg-red-50 hover:text-red-700"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Sandbox simulator */}
      {items.length > 0 && (
        <div className="rounded-md border border-zinc-200 bg-white p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-wa-dark">Sandbox simulator</div>
          <h3 className="mt-1 font-display text-lg font-medium">Simulate an inbound WhatsApp message</h3>
          <p className="mt-1 text-sm text-zinc-600">Useful for previewing the inbox, AI suggestions and auto-replies without a real customer.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-700">From phone</label>
              <input data-testid="sim-phone" value={simPhone} onChange={(e) => setSimPhone(e.target.value)} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-wa-light focus:ring-2 focus:ring-wa-light/20" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-700">Message</label>
              <input data-testid="sim-text" value={simText} onChange={(e) => setSimText(e.target.value)} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-wa-light focus:ring-2 focus:ring-wa-light/20" />
            </div>
          </div>
          <p className="mt-3 text-xs text-zinc-500">Click the <Send className="inline h-3 w-3" /> icon next to a connected account above to simulate.</p>
        </div>
      )}

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-md border border-zinc-200 bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold">Connect WhatsApp Business</h3>
              <button onClick={() => setOpen(false)} className="text-zinc-500 hover:text-zinc-900"><X className="h-4 w-4" /></button>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  data-testid={`provider-${p.id}`}
                  onClick={() => setProvider(p.id)}
                  className={`flex items-start gap-2.5 rounded-md border p-3 text-left text-xs ${provider === p.id ? 'border-wa-light bg-green-50/40' : 'border-zinc-200 hover:bg-zinc-50'}`}
                >
                  <p.icon className={`mt-0.5 h-4 w-4 ${provider === p.id ? 'text-wa-dark' : 'text-zinc-500'}`} />
                  <div>
                    <div className="font-medium text-zinc-900">{p.label}</div>
                    <div className="mt-0.5 text-[11px] text-zinc-500">{p.hint}</div>
                  </div>
                </button>
              ))}
            </div>

            <form onSubmit={submit} className="mt-5 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700">Connection name</label>
                <input data-testid="cred-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-wa-light" placeholder="e.g. India primary" />
              </div>

              {provider === 'twilio_sandbox' && (
                <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-700">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 text-amber-600" />
                    <div>
                      Uses platform Twilio sandbox <span className="font-mono">whatsapp:+14155238886</span>. Recipients must opt-in by sending the join code from the Twilio console.
                    </div>
                  </div>
                </div>
              )}

              {provider === 'twilio' && (
                <>
                  <input data-testid="twilio-sid" required value={form.account_sid} onChange={(e) => setForm({ ...form, account_sid: e.target.value })} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" placeholder="Account SID (AC…)" />
                  <input data-testid="twilio-token" required value={form.auth_token} onChange={(e) => setForm({ ...form, auth_token: e.target.value })} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm font-mono" placeholder="Auth token" />
                  <input data-testid="twilio-from" required value={form.whatsapp_from} onChange={(e) => setForm({ ...form, whatsapp_from: e.target.value })} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" placeholder="whatsapp:+1415..." />
                </>
              )}

              {provider === 'meta_cloud' && (
                <>
                  <input data-testid="meta-token" required value={form.access_token} onChange={(e) => setForm({ ...form, access_token: e.target.value })} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" placeholder="Permanent access token (EAA…)" />
                  <input data-testid="meta-phone-id" required value={form.phone_number_id} onChange={(e) => setForm({ ...form, phone_number_id: e.target.value })} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" placeholder="Phone number ID" />
                  <input value={form.business_account_id} onChange={(e) => setForm({ ...form, business_account_id: e.target.value })} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" placeholder="Business account ID (optional)" />
                </>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button type="button" onClick={() => setOpen(false)} className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50">Cancel</button>
                <button data-testid="cred-submit" type="submit" disabled={busy} className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-wa-mid disabled:opacity-60">
                  {busy ? 'Saving…' : 'Connect'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
