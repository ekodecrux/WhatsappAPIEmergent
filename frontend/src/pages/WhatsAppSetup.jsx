import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import {
  Plus, ShieldCheck, Phone, Trash2, Lock, X, Beaker, Server, AlertCircle, Send, Zap, Info, ExternalLink, MessageSquare,
  Award, Check, Copy, ChevronDown, ChevronRight as ChevronRightIcon, Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import ShareLinksPanel from '../components/ShareLinksPanel';

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
  const [sandboxInfo, setSandboxInfo] = useState(null);
  const [testModal, setTestModal] = useState(null); // {cred}
  const [testTo, setTestTo] = useState('+91');
  const [testText, setTestText] = useState('Hello — this is a test message from wabridge.');
  const [testBusy, setTestBusy] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const load = async () => {
    const [{ data: creds }, { data: sb }] = await Promise.all([
      api.get('/whatsapp/credentials'),
      api.get('/whatsapp/sandbox-info').catch(() => ({ data: null })),
    ]);
    setItems(creds);
    setSandboxInfo(sb);
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

  const openTest = (c) => {
    setTestModal({ cred: c });
    setTestResult(null);
  };

  const runTest = async () => {
    if (!testModal?.cred) return;
    if (!testTo.startsWith('+') || testTo.length < 8) {
      toast.error('Enter recipient in E.164 format, e.g. +919876543210');
      return;
    }
    setTestBusy(true);
    setTestResult(null);
    try {
      const { data } = await api.post('/whatsapp/test-send', {
        credential_id: testModal.cred.id,
        to_phone: testTo,
        text: testText,
      });
      setTestResult(data);
      if (data.success) toast.success('Test message accepted by provider');
      else toast.error(data.error || 'Provider rejected the message');
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Test failed');
    } finally { setTestBusy(false); }
  };

  const [diagBusy, setDiagBusy] = useState(false);
  const [diag, setDiag] = useState(null);
  const runDiagnose = async () => {
    if (!testModal?.cred) return;
    setDiagBusy(true);
    setDiag(null);
    try {
      const { data } = await api.post('/whatsapp/twilio/diagnose', { credential_id: testModal.cred.id });
      setDiag(data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Diagnose failed');
    } finally { setDiagBusy(false); }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-center">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">WhatsApp Setup</h1>
          <p className="mt-1 text-sm text-zinc-600">Connect your WhatsApp Business credentials. Stored encrypted.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/app/connect-whatsapp"
            data-testid="open-wizard"
            className="inline-flex items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-3.5 py-2 text-sm font-medium text-emerald-900 hover:bg-emerald-100"
          >
            <Sparkles className="h-4 w-4" /> Use guided wizard
          </Link>
          <button
            data-testid="add-credential-btn"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-wa-mid"
          >
            <Plus className="h-4 w-4" /> Connect account
          </button>
        </div>
      </div>

      {/* Encryption notice */}
      <div className="flex items-start gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-4">
        <Lock className="mt-0.5 h-4 w-4 text-wa-dark" />
        <div className="text-sm text-zinc-700">
          <span className="font-medium text-zinc-900">Tokens are AES-256 encrypted</span> with a tenant-derived key. Decryption only happens in-memory at send time.
        </div>
      </div>

      <GreenTickWizard />

      {/* Twilio Sandbox opt-in helper — required for real WhatsApp delivery */}
      {sandboxInfo && items.some(c => c.provider === 'twilio_sandbox') && (
        <div className="rounded-md border border-amber-200 bg-amber-50/60 p-4" data-testid="sandbox-helper">
          <div className="flex items-start gap-3">
            <Info className="mt-0.5 h-4 w-4 text-amber-700" />
            <div className="flex-1 text-sm text-amber-900">
              <div className="font-medium">Twilio Sandbox requires recipient opt-in</div>
              <p className="mt-1 text-amber-800">
                For sandbox messages to actually be delivered, the recipient must first send a join code from <strong>their personal WhatsApp</strong> to <span className="font-mono">{sandboxInfo.sandbox_phone}</span>.
              </p>
              <ol className="mt-2 list-inside list-decimal space-y-0.5 text-xs text-amber-800">
                <li>Open <a href={sandboxInfo.console_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 underline">Twilio Console → Try WhatsApp <ExternalLink className="h-3 w-3" /></a> to find your join keyword (looks like <span className="font-mono">join my-keyword</span>).</li>
                <li>From the recipient's WhatsApp, message <span className="font-mono">{sandboxInfo.sandbox_phone}</span> with that exact text.</li>
                <li>Twilio replies confirming opt-in. The recipient is then live for 72h.</li>
                <li>Use the <Zap className="inline h-3 w-3" /> Test send button next to a connection to verify end-to-end delivery.</li>
              </ol>
            </div>
          </div>
        </div>
      )}

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
                data-testid={`test-send-${c.id}`}
                onClick={() => openTest(c)}
                title="Send a real test message to verify delivery"
                className="rounded-md p-1.5 text-zinc-500 hover:bg-green-50 hover:text-green-700"
              >
                <Zap className="h-4 w-4" />
              </button>
              <button
                data-testid={`simulate-${c.id}`}
                onClick={() => simulate(c.id)}
                disabled={simBusyId === c.id}
                title="Simulate inbound message (no real WhatsApp needed)"
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

      {/* Share links — wa.me link + QR code per connected number */}
      {items.length > 0 && (
        <div className="space-y-3">
          {items.map(c => (
            <ShareLinksPanel key={c.id} credentialId={c.id} credentialName={c.name} />
          ))}
        </div>
      )}

      {/* Meta credentials inline helper */}
      <MetaCredentialsHelper />

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
                  <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
                    <div className="flex items-start gap-2">
                      <Info className="mt-0.5 h-3.5 w-3.5 text-blue-700" />
                      <div>
                        <strong>Where to find these?</strong> In Meta Business Suite → Business Settings → System Users → generate a permanent token with <span className="font-mono">whatsapp_business_messaging</span> + <span className="font-mono">whatsapp_business_management</span> scopes. Phone Number ID is in WhatsApp → API Setup. We'll verify these against Meta Graph API before saving.
                      </div>
                    </div>
                  </div>
                  <input data-testid="meta-token" required value={form.access_token} onChange={(e) => setForm({ ...form, access_token: e.target.value })} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm font-mono" placeholder="Permanent access token (EAA…, ~200+ chars)" />
                  <input data-testid="meta-phone-id" required value={form.phone_number_id} onChange={(e) => setForm({ ...form, phone_number_id: e.target.value })} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm font-mono" placeholder="Phone number ID (15-17 digit number)" />
                  <input value={form.business_account_id} onChange={(e) => setForm({ ...form, business_account_id: e.target.value })} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm font-mono" placeholder="Business account ID (optional)" />
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
      {/* Test send modal */}
      {testModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-md border border-zinc-200 bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold inline-flex items-center gap-2">
                <Zap className="h-4 w-4 text-green-600" /> Test send · {testModal.cred.name}
              </h3>
              <button onClick={() => setTestModal(null)}><X className="h-4 w-4" /></button>
            </div>
            <p className="text-xs text-zinc-600">Sends a real WhatsApp message via {testModal.cred.provider.replace('_', ' ')}. The recipient must be reachable for your provider (sandbox = opted-in only; Meta Cloud = any number once your business is verified).</p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Recipient (E.164)</label>
                <input
                  data-testid="test-to"
                  value={testTo}
                  onChange={(e) => setTestTo(e.target.value)}
                  placeholder="+919876543210"
                  className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm font-mono"
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Message</label>
                <textarea
                  data-testid="test-text"
                  rows={3}
                  value={testText}
                  onChange={(e) => setTestText(e.target.value)}
                  className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
            {testResult && (
              <div className={`mt-4 rounded-md border p-3 text-xs ${testResult.success ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-800'}`} data-testid="test-result">
                <div className="font-medium">{testResult.success ? 'Provider accepted the message' : 'Provider rejected the message'}</div>
                {testResult.success && <div className="mt-1 font-mono">Status: {testResult.status} · ID: {testResult.sid?.slice(0, 24)}…</div>}
                {!testResult.success && (
                  <>
                    <div className="mt-1">{testResult.error}</div>
                    {testResult.hint && (
                      <div className="mt-2 rounded border border-amber-200 bg-amber-50 p-2 text-amber-900">
                        <strong>How to fix:</strong> {testResult.hint}
                      </div>
                    )}
                    {testModal?.cred?.provider === 'twilio' && (
                      <div className="mt-2">
                        <button
                          data-testid="diagnose-twilio"
                          onClick={runDiagnose}
                          disabled={diagBusy}
                          className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-[11px] font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
                        >
                          {diagBusy ? 'Inspecting Twilio…' : '🩺 Diagnose Twilio account'}
                        </button>
                      </div>
                    )}
                    {diag && (
                      <div className="mt-2 space-y-1.5 rounded border border-zinc-300 bg-white p-3 text-[11px] text-zinc-800">
                        <div><b>Account status:</b> <span className={diag.account_status === 'active' ? 'text-green-700' : 'text-red-700'}>{diag.account_status}</span>{diag.sandbox_active && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-semibold text-amber-800">SANDBOX / TRIAL</span>}</div>
                        <div><b>Saved From:</b> <code className="font-mono">{diag.configured_from || '—'}</code></div>
                        <div><b>Match found in your senders?</b> {diag.configured_from_matches ? <span className="text-green-700">✓ yes</span> : <span className="text-red-700">✗ no</span>}</div>
                        {diag.whatsapp_senders?.length > 0 && (
                          <div>
                            <b>Senders Twilio sees on your account:</b>
                            <ul className="ml-4 mt-1 list-disc text-zinc-700">
                              {diag.whatsapp_senders.slice(0, 8).map((s, i) => (
                                <li key={i}><code className="font-mono">{s.phone || s.sender_id}</code> · {s.channel} · {s.status}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        <div className="mt-1.5 rounded bg-amber-50 p-2 text-amber-900"><b>Next step:</b> {diag.suggested_action}</div>
                      </div>
                    )}
                  </>
                )}
                <div className="mt-2 text-[11px] text-zinc-600">Tip: open the <strong>Delivery Status</strong> page after a few seconds to see the actual delivered/failed status as Twilio reports it.</div>
              </div>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setTestModal(null)} className="rounded-md border border-zinc-300 px-3 py-2 text-sm">Close</button>
              <button
                data-testid="test-send-submit"
                onClick={runTest}
                disabled={testBusy}
                className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-wa-mid disabled:opacity-50"
              >
                {testBusy ? 'Sending…' : <><MessageSquare className="h-3.5 w-3.5" /> Send test</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function GreenTickWizard() {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(() => {
    try { return JSON.parse(localStorage.getItem('green_tick_progress') || '{}'); } catch { return {}; }
  });
  const toggleStep = (idx) => {
    const next = { ...done, [idx]: !done[idx] };
    setDone(next);
    localStorage.setItem('green_tick_progress', JSON.stringify(next));
  };
  const STEPS = [
    {
      title: 'Verify your business in Meta Business Manager',
      detail: 'Upload utility bill or business registration. Approval takes 1–7 days.',
      link: 'https://business.facebook.com/settings/security',
      linkLabel: 'Open Business Manager',
    },
    {
      title: 'Confirm display name (no generic terms)',
      detail: 'Use your real brand name (e.g. "Acme Corp"), not "Customer Care" or "Support". Avoid emojis and country names.',
    },
    {
      title: 'Set up business profile in WhatsApp Manager',
      detail: 'Add address, website, vertical, and a 640×640 logo. Required for the official badge review.',
      link: 'https://business.facebook.com/wa/manage',
      linkLabel: 'Open WhatsApp Manager',
    },
    {
      title: 'Drive 100+ inbound conversations in 7 days',
      detail: 'Meta only awards green ticks to phone numbers receiving real customer messages. Run a Click-to-WhatsApp ad to accelerate.',
    },
    {
      title: 'Apply for Official Business Account',
      detail: 'In WhatsApp Manager → Account info → "Apply for verification". Provide 3 high-quality news article links covering your brand.',
      link: 'https://business.facebook.com/wa/manage/phone-numbers',
      linkLabel: 'Apply for green tick',
    },
    {
      title: 'Wait for review (4–28 days)',
      detail: 'You\'ll get a notification on success. If rejected, fix the cited reason and re-apply after 30 days.',
    },
  ];
  const completed = Object.values(done).filter(Boolean).length;
  const pct = Math.round((completed / STEPS.length) * 100);
  const samplePR = `Sample press release angle:\n\n"${'<Your Brand>'} launches WhatsApp customer service that responds in <2 minutes — powered by wabridge"\n\nKey points to include for journalists:\n• Founder quote on why WhatsApp-first support\n• Customer base size & geography\n• Photo of founders / office\n• Spokesperson contact email + phone\n\nPitch to: TechCrunch India, YourStory, Inc42, Economic Times Tech, Moneycontrol Business`;

  return (
    <div className="rounded-md border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white">
      <button
        data-testid="green-tick-toggle"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between p-4 text-left"
      >
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-full bg-emerald-600 text-white">
            <Award className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-semibold text-emerald-950">Green Tick Application Helper</div>
            <div className="text-xs text-emerald-800">{completed} of {STEPS.length} steps complete · {pct}%</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden h-1.5 w-32 overflow-hidden rounded-full bg-emerald-200 sm:block">
            <div className="h-full bg-emerald-600 transition-all" style={{ width: `${pct}%` }} />
          </div>
          {open ? <ChevronDown className="h-4 w-4 text-emerald-700" /> : <ChevronRightIcon className="h-4 w-4 text-emerald-700" />}
        </div>
      </button>
      {open && (
        <div className="border-t border-emerald-200 p-4">
          <p className="mb-3 text-xs text-emerald-900">
            Meta&apos;s green tick (Official Business Account) takes <strong>4–8 weeks</strong> end-to-end.
            Follow these steps in order. We&apos;ve checked the latest 2026 Meta guidelines — most rejections happen at step 4 (low conversation volume).
          </p>
          <ol className="space-y-2">
            {STEPS.map((s, i) => (
              <li key={i} className={`flex items-start gap-3 rounded-md border p-3 transition ${done[i] ? 'border-emerald-300 bg-emerald-50/60' : 'border-zinc-200 bg-white'}`}>
                <button
                  data-testid={`green-tick-step-${i}`}
                  onClick={() => toggleStep(i)}
                  className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border ${done[i] ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-zinc-300 bg-white'}`}
                >
                  {done[i] ? <Check className="h-3 w-3" /> : <span className="text-[10px] font-bold text-zinc-500">{i + 1}</span>}
                </button>
                <div className="min-w-0 flex-1">
                  <div className={`text-sm font-medium ${done[i] ? 'text-emerald-900 line-through' : 'text-zinc-900'}`}>{s.title}</div>
                  <div className="mt-0.5 text-xs text-zinc-600">{s.detail}</div>
                  {s.link && (
                    <a href={s.link} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline">
                      {s.linkLabel} <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ol>
          <details className="mt-4 rounded-md border border-zinc-200 bg-white">
            <summary className="cursor-pointer p-3 text-xs font-medium text-zinc-700">📰 Press-release template (3 articles required by Meta)</summary>
            <pre className="whitespace-pre-wrap border-t border-zinc-200 bg-zinc-50 p-3 text-[11px] leading-relaxed text-zinc-700">{samplePR}</pre>
            <button
              onClick={() => { navigator.clipboard.writeText(samplePR); toast.success('Press-release template copied'); }}
              className="m-3 inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs hover:bg-zinc-50"
            ><Copy className="h-3 w-3" /> Copy template</button>
          </details>
        </div>
      )}
    </div>
  );
}


function MetaCredentialsHelper() {
  const [open, setOpen] = useState(false);
  const ITEMS = [
    {
      label: 'Permanent access token',
      where: 'Meta Business Settings → System Users → (create or pick one) → Generate New Token → select your WhatsApp app → check whatsapp_business_messaging + whatsapp_business_management → Generate',
      url: 'https://business.facebook.com/settings/system-users',
      tip: 'Use System User token (never expires) — not the temporary 24h token from the API explorer.',
    },
    {
      label: 'Phone number ID',
      where: 'Meta WhatsApp Manager → Account Tools → Phone numbers → click your number → "Phone number ID" displayed at top.',
      url: 'https://business.facebook.com/wa/manage/phone-numbers',
      tip: '15-digit numeric ID like 109876543210987.',
    },
    {
      label: 'WhatsApp Business Account ID (WABA ID)',
      where: 'Meta WhatsApp Manager → Account Tools → Account info → "WhatsApp Business Account ID".',
      url: 'https://business.facebook.com/wa/manage/home/',
      tip: 'Required for managed templates & message reports.',
    },
    {
      label: 'App secret',
      where: 'developers.facebook.com → Your App → Settings → Basic → "App Secret" (click Show).',
      url: 'https://developers.facebook.com/apps',
      tip: 'We use this to validate the HMAC signature on every inbound webhook from Meta.',
    },
    {
      label: 'Webhook callback URL',
      where: 'Copy this URL into developers.facebook.com → Your App → WhatsApp → Configuration → Callback URL',
      url: null,
      tip: `Set verify token to anything, then paste here. Subscribe to: messages, message_status, message_template_status.`,
      copy: `${window.location.origin}/api/whatsapp/webhook/meta`,
    },
  ];
  return (
    <div className="rounded-md border border-purple-200 bg-gradient-to-br from-purple-50 to-white">
      <button
        data-testid="meta-helper-toggle"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between p-4 text-left"
      >
        <div className="flex items-center gap-3">
          <div className="grid h-8 w-8 place-items-center rounded-full bg-purple-700 text-white">
            <Info className="h-3.5 w-3.5" />
          </div>
          <div>
            <div className="text-sm font-semibold text-purple-950">Where to find Meta credentials</div>
            <div className="text-xs text-purple-800">Direct links to each value in your Meta dashboard — open in a new tab</div>
          </div>
        </div>
        {open ? <ChevronDown className="h-4 w-4 text-purple-700" /> : <ChevronRightIcon className="h-4 w-4 text-purple-700" />}
      </button>
      {open && (
        <div className="space-y-3 border-t border-purple-200 p-4">
          {ITEMS.map((it, i) => (
            <div key={i} className="rounded-md border border-zinc-200 bg-white p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-zinc-900">{i + 1}. {it.label}</div>
                {it.url && (
                  <a href={it.url} target="_blank" rel="noreferrer"
                     className="inline-flex items-center gap-1 rounded-md border border-purple-300 bg-purple-50 px-2 py-0.5 text-[11px] font-medium text-purple-800 hover:bg-purple-100">
                    Open in Meta <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
              <p className="mt-1 text-xs text-zinc-700">{it.where}</p>
              {it.tip && <p className="mt-1 text-[11px] text-zinc-500">💡 {it.tip}</p>}
              {it.copy && (
                <div className="mt-2 flex items-center gap-1">
                  <input value={it.copy} readOnly className="flex-1 rounded-md border border-zinc-300 bg-zinc-50 px-2 py-1.5 font-mono text-[11px]" />
                  <button
                    onClick={() => { navigator.clipboard.writeText(it.copy); toast.success('Copied'); }}
                    className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 hover:bg-zinc-50"
                  ><Copy className="h-3 w-3" /></button>
                </div>
              )}
            </div>
          ))}
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-900">
            <strong>Pro tip:</strong> never paste a temporary access token (expires in 24h). Always use a System User token from Business Settings. We&apos;ll auto-validate it before saving.
          </div>
        </div>
      )}
    </div>
  );
}

