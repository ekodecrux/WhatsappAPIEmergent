import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import {
  ArrowRight, ArrowLeft, Check, X, Loader2, MessageSquare, Sparkles, ShieldCheck,
  AlertTriangle, Copy, ExternalLink, Phone, Send, Zap, Info, Settings,
} from 'lucide-react';
import { toast } from 'sonner';

/**
 * One-screen 4-step WhatsApp connect wizard.
 * Replaces the multi-modal "WhatsApp Setup → Test Send → Diagnose → Sandbox Info" navigation.
 * Auto-detects sandbox vs production and adapts every screen accordingly.
 */
export default function ConnectWhatsApp() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);

  // Step 1 — choice
  const [mode, setMode] = useState(null); // 'sandbox' | 'production'

  // Step 2 — credentials
  const [creds, setCreds] = useState({
    name: 'My Twilio',
    account_sid: '',
    auth_token: '',
    whatsapp_from: '+14155238886',  // sandbox default
  });
  const [savedCred, setSavedCred] = useState(null);
  const [savingCred, setSavingCred] = useState(false);

  // Step 3 — test send
  const [testTo, setTestTo] = useState('+91');
  const [testText, setTestText] = useState('Hello! This is a test message from my WhatsApp business account.');
  const [testResult, setTestResult] = useState(null);
  const [testBusy, setTestBusy] = useState(false);

  // Step 4 — diagnose (auto-runs if test fails)
  const [diag, setDiag] = useState(null);
  const [diagBusy, setDiagBusy] = useState(false);

  // Sandbox info (shown inline for sandbox mode)
  const [sandboxInfo, setSandboxInfo] = useState(null);

  useEffect(() => {
    if (mode === 'sandbox') {
      api.get('/whatsapp/sandbox-info').then(({ data }) => setSandboxInfo(data)).catch(() => {});
      setCreds(c => ({ ...c, whatsapp_from: '+14155238886', name: 'Twilio Sandbox' }));
    } else if (mode === 'production') {
      setCreds(c => ({ ...c, whatsapp_from: '', name: 'Twilio Production' }));
    }
  }, [mode]);

  const next = () => setStep(s => Math.min(4, s + 1));
  const back = () => setStep(s => Math.max(1, s - 1));

  const saveCredentials = async () => {
    if (!creds.account_sid.trim() || !creds.auth_token.trim() || !creds.whatsapp_from.trim()) {
      return toast.error('Fill all three fields');
    }
    setSavingCred(true);
    try {
      const { data } = await api.post('/whatsapp/credentials', {
        name: creds.name,
        provider: 'twilio',
        account_sid: creds.account_sid.trim(),
        auth_token: creds.auth_token.trim(),
        from_address: creds.whatsapp_from.trim(),
      });
      setSavedCred(data);
      toast.success('Credentials saved & encrypted');
      next();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Could not save credentials');
    } finally { setSavingCred(false); }
  };

  const runTest = async () => {
    if (!testTo.trim().startsWith('+') || testTo.trim().length < 10) {
      return toast.error('Enter recipient in E.164 format, e.g. +919876543210');
    }
    setTestBusy(true);
    setTestResult(null);
    setDiag(null);
    try {
      const { data } = await api.post('/whatsapp/test-send', {
        credential_id: savedCred.id,
        to_phone: testTo.trim(),
        text: testText,
      });
      setTestResult(data);
      if (data.success) {
        toast.success('🎉 Message accepted by WhatsApp!');
        setTimeout(() => setStep(4), 800);
      } else {
        // auto-run diagnose to show the user exactly what's wrong
        runDiagnose();
      }
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Test failed');
    } finally { setTestBusy(false); }
  };

  const runDiagnose = async () => {
    if (!savedCred?.id) return;
    setDiagBusy(true);
    try {
      const { data } = await api.post('/whatsapp/twilio/diagnose', { credential_id: savedCred.id });
      setDiag(data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Diagnose failed');
    } finally { setDiagBusy(false); }
  };

  const copy = (txt) => { navigator.clipboard.writeText(txt); toast.success('Copied'); };

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-3xl p-6">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <button onClick={() => navigate('/app')} className="inline-flex items-center gap-1.5 text-sm text-zinc-600 hover:text-zinc-900">
            <X className="h-4 w-4" /> Exit wizard
          </button>
          <Stepper step={step} />
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white shadow-sm">
          {step === 1 && <Step1Choice mode={mode} setMode={setMode} onNext={() => mode && next()} />}
          {step === 2 && <Step2Credentials mode={mode} creds={creds} setCreds={setCreds} sandboxInfo={sandboxInfo} onSave={saveCredentials} onBack={back} saving={savingCred} />}
          {step === 3 && <Step3TestSend mode={mode} testTo={testTo} setTestTo={setTestTo} testText={testText} setTestText={setTestText} runTest={runTest} testBusy={testBusy} testResult={testResult} sandboxInfo={sandboxInfo} diag={diag} diagBusy={diagBusy} runDiagnose={runDiagnose} onBack={back} onSkip={() => setStep(4)} />}
          {step === 4 && <Step4Done navigate={navigate} mode={mode} testResult={testResult} />}
        </div>
      </div>
    </div>
  );
}

function Stepper({ step }) {
  const labels = ['Choose mode', 'Credentials', 'Test send', 'Done'];
  return (
    <div className="flex items-center gap-2">
      {labels.map((l, i) => {
        const n = i + 1;
        const active = n === step;
        const done = n < step;
        return (
          <React.Fragment key={n}>
            <div className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${active ? 'bg-wa-dark text-white' : done ? 'bg-green-100 text-green-800' : 'bg-zinc-100 text-zinc-500'}`}>
              {done ? <Check className="h-3 w-3" /> : <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-white/30 text-[10px] font-semibold">{n}</span>}
              <span className="hidden sm:inline">{l}</span>
            </div>
            {n < labels.length && <div className={`h-px w-3 ${done ? 'bg-green-400' : 'bg-zinc-200'}`} />}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function Step1Choice({ mode, setMode, onNext }) {
  return (
    <div className="p-8">
      <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-800">
        <Sparkles className="h-3 w-3" /> Step 1 of 4
      </div>
      <h1 className="font-display text-3xl font-semibold tracking-tight">Connect WhatsApp</h1>
      <p className="mt-1 text-sm text-zinc-600">Pick how you want to send. You can switch later.</p>

      <div className="mt-6 grid gap-3 md:grid-cols-2">
        <ModeCard
          tid="mode-sandbox"
          active={mode === 'sandbox'}
          onClick={() => setMode('sandbox')}
          icon={<Zap className="h-5 w-5" />}
          title="Twilio Sandbox"
          subtitle="For testing in 60 seconds"
          bullets={[
            'No approval needed — start instantly',
            'Send to your own + opted-in test phones',
            'Free for the first 1000 messages',
            'Demo with the recipient first joining via SMS keyword',
          ]}
          tag="RECOMMENDED for first time"
          tagColor="bg-amber-100 text-amber-900"
        />
        <ModeCard
          tid="mode-production"
          active={mode === 'production'}
          onClick={() => setMode('production')}
          icon={<ShieldCheck className="h-5 w-5" />}
          title="Twilio Production"
          subtitle="For going live with customers"
          bullets={[
            'Use your own approved WhatsApp Business number',
            'Send to anyone (no opt-in keyword)',
            'Pay-per-message Meta + Twilio rates',
            'Requires WhatsApp sender approval (1–5 days)',
          ]}
          tag="LIVE / PAID"
          tagColor="bg-green-100 text-green-800"
        />
      </div>

      <div className="mt-6 flex justify-end">
        <button data-testid="step1-next" onClick={onNext} disabled={!mode} className="inline-flex items-center gap-1.5 rounded-md bg-wa-dark px-4 py-2.5 text-sm font-medium text-white hover:bg-wa-mid disabled:opacity-50">
          Continue <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function ModeCard({ tid, active, onClick, icon, title, subtitle, bullets, tag, tagColor }) {
  return (
    <button
      type="button"
      data-testid={tid}
      onClick={onClick}
      className={`relative rounded-lg border p-5 text-left transition ${active ? 'border-wa-dark bg-green-50/40 ring-2 ring-wa-dark/30' : 'border-zinc-200 bg-white hover:border-zinc-400'}`}
    >
      {tag && <span className={`absolute right-3 top-3 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${tagColor}`}>{tag}</span>}
      <div className="flex items-center gap-2 text-wa-dark">{icon}<span className="font-display text-lg font-semibold text-zinc-900">{title}</span></div>
      <div className="mt-0.5 text-xs text-zinc-500">{subtitle}</div>
      <ul className="mt-3 space-y-1.5 text-xs text-zinc-700">
        {bullets.map((b, i) => <li key={i} className="flex gap-1.5"><Check className="mt-0.5 h-3 w-3 shrink-0 text-green-600" /><span>{b}</span></li>)}
      </ul>
    </button>
  );
}

function Step2Credentials({ mode, creds, setCreds, sandboxInfo, onSave, onBack, saving }) {
  const isSandbox = mode === 'sandbox';
  return (
    <div className="p-8">
      <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800">
        <Settings className="h-3 w-3" /> Step 2 of 4
      </div>
      <h1 className="font-display text-3xl font-semibold tracking-tight">{isSandbox ? 'Paste your sandbox credentials' : 'Paste your production credentials'}</h1>
      <p className="mt-1 text-sm text-zinc-600">All credentials are encrypted at rest. Find them in your <a href="https://console.twilio.com/" target="_blank" rel="noreferrer" className="font-medium text-wa-dark underline">Twilio Console</a>.</p>

      {isSandbox && sandboxInfo && (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <div className="font-semibold">Sandbox quick start</div>
          <ol className="mt-1.5 list-decimal space-y-0.5 pl-4">
            <li>Open your phone's WhatsApp</li>
            <li>Send <code className="rounded bg-white px-1 py-0.5 font-mono">join {sandboxInfo.join_keyword || '<your-keyword>'}</code> to <code className="rounded bg-white px-1 py-0.5 font-mono">{sandboxInfo.sandbox_phone}</code></li>
            <li>You'll get a confirmation reply — that phone is now opted in for testing</li>
          </ol>
          <a href={sandboxInfo.console_url} target="_blank" rel="noreferrer" className="mt-1.5 inline-flex items-center gap-1 font-medium underline">Find your join keyword <ExternalLink className="h-3 w-3" /></a>
        </div>
      )}

      <div className="mt-5 space-y-3">
        <Field label="Account SID" tid="cred-sid" value={creds.account_sid} onChange={v => setCreds({ ...creds, account_sid: v })} placeholder="AC1a2b3c…" mono />
        <Field label="Auth Token" tid="cred-token" value={creds.auth_token} onChange={v => setCreds({ ...creds, auth_token: v })} placeholder="paste auth token" mono type="password" />
        <Field
          label={isSandbox ? 'Sandbox From number' : 'Your approved WhatsApp Business number'}
          tid="cred-from"
          value={creds.whatsapp_from}
          onChange={v => setCreds({ ...creds, whatsapp_from: v })}
          placeholder={isSandbox ? '+14155238886' : '+919876543210'}
          mono
          help={isSandbox
            ? 'Always +14155238886 for the Twilio sandbox.'
            : 'Find this under Messaging → Senders → WhatsApp Senders. It must already be approved by Meta.'}
        />
      </div>

      <div className="mt-6 flex items-center justify-between">
        <button data-testid="step2-back" onClick={onBack} className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm hover:bg-zinc-50"><ArrowLeft className="h-4 w-4" /> Back</button>
        <button data-testid="step2-save" onClick={onSave} disabled={saving} className="inline-flex items-center gap-1.5 rounded-md bg-wa-dark px-4 py-2.5 text-sm font-medium text-white hover:bg-wa-mid disabled:opacity-50">
          {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : <>Save & continue <ArrowRight className="h-4 w-4" /></>}
        </button>
      </div>
    </div>
  );
}

function Field({ label, tid, value, onChange, placeholder, mono, type = 'text', help }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-zinc-700">{label}</label>
      <input
        data-testid={tid}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full rounded-md border border-zinc-300 px-3 py-2 text-sm ${mono ? 'font-mono' : ''}`}
      />
      {help && <p className="mt-1 text-[10px] text-zinc-500">{help}</p>}
    </div>
  );
}

function Step3TestSend({ mode, testTo, setTestTo, testText, setTestText, runTest, testBusy, testResult, sandboxInfo, diag, diagBusy, runDiagnose, onBack, onSkip }) {
  const isSandbox = mode === 'sandbox';
  return (
    <div className="p-8">
      <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-purple-50 px-3 py-1 text-xs font-semibold text-purple-800">
        <Send className="h-3 w-3" /> Step 3 of 4
      </div>
      <h1 className="font-display text-3xl font-semibold tracking-tight">Send a test message</h1>
      <p className="mt-1 text-sm text-zinc-600">{isSandbox ? 'Send it to YOUR own phone (the one you joined the sandbox with).' : 'Send it to your own phone or a teammate to confirm everything works.'}</p>

      {isSandbox && (
        <div className="mt-3 rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
          <Info className="mr-1 inline h-3 w-3" /> The recipient phone <b>must have already</b> texted <code className="rounded bg-white px-1 font-mono">join {sandboxInfo?.join_keyword || '<keyword>'}</code> to <code className="rounded bg-white px-1 font-mono">{sandboxInfo?.sandbox_phone || '+14155238886'}</code>, otherwise the send will fail with a "no Channel" error.
        </div>
      )}

      <div className="mt-5 space-y-3">
        <Field label="Recipient phone (E.164)" tid="test-to" value={testTo} onChange={setTestTo} placeholder="+919876543210" mono />
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-700">Message</label>
          <textarea
            data-testid="test-text"
            rows={3}
            value={testText}
            onChange={(e) => setTestText(e.target.value)}
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <button
        data-testid="test-send-btn"
        onClick={runTest}
        disabled={testBusy}
        className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-wa-mid disabled:opacity-50"
      >
        {testBusy ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</> : <><Send className="h-4 w-4" /> Send test now</>}
      </button>

      {testResult && (
        <div className={`mt-4 rounded-md border p-3 text-xs ${testResult.success ? 'border-green-300 bg-green-50 text-green-900' : 'border-red-300 bg-red-50 text-red-900'}`}>
          <div className="flex items-center gap-1.5 font-semibold">
            {testResult.success ? <Check className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
            {testResult.success ? 'Provider accepted the message — check your phone!' : 'Provider rejected the message'}
          </div>
          {testResult.success && <div className="mt-1 font-mono text-[10px]">SID: {testResult.sid}</div>}
          {!testResult.success && (
            <>
              <div className="mt-1 text-[11px]">{testResult.error}</div>
              {testResult.hint && (
                <div className="mt-2 rounded border border-amber-200 bg-amber-50 p-2 text-amber-900">
                  <strong>How to fix:</strong> {testResult.hint}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {(diagBusy || diag) && (
        <div className="mt-3 rounded-md border border-zinc-300 bg-zinc-50 p-3 text-xs">
          <div className="mb-1.5 inline-flex items-center gap-1.5 font-semibold text-zinc-900">
            <ShieldCheck className="h-3.5 w-3.5 text-zinc-700" /> Diagnostics from your Twilio account
          </div>
          {diagBusy && <Loader2 className="h-4 w-4 animate-spin" />}
          {diag && (
            <div className="space-y-1.5">
              <div><b>Account status:</b> <span className={diag.account_status === 'active' ? 'text-green-700' : 'text-red-700'}>{diag.account_status}</span>{diag.sandbox_active && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-semibold text-amber-800">SANDBOX / TRIAL</span>}</div>
              <div><b>Saved From:</b> <code className="font-mono">{diag.configured_from || '—'}</code></div>
              <div><b>Match found in your senders?</b> {diag.configured_from_matches ? <span className="text-green-700">✓ yes</span> : <span className="text-red-700">✗ no</span>}</div>
              {diag.whatsapp_senders?.length > 0 && (
                <details>
                  <summary className="cursor-pointer text-zinc-700">Senders Twilio sees on your account ({diag.whatsapp_senders.length})</summary>
                  <ul className="ml-4 mt-1 list-disc">
                    {diag.whatsapp_senders.slice(0, 8).map((s, i) => (<li key={i}><code className="font-mono">{s.phone || s.sender_id}</code> · {s.channel} · {s.status}</li>))}
                  </ul>
                </details>
              )}
              <div className="mt-1.5 rounded bg-amber-50 p-2 text-amber-900"><b>Next step:</b> {diag.suggested_action}</div>
            </div>
          )}
        </div>
      )}

      <div className="mt-6 flex items-center justify-between">
        <button data-testid="step3-back" onClick={onBack} className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm hover:bg-zinc-50"><ArrowLeft className="h-4 w-4" /> Back</button>
        <button data-testid="step3-skip" onClick={onSkip} className="text-xs text-zinc-500 hover:text-zinc-800">Skip — I'll test later →</button>
      </div>
    </div>
  );
}

function Step4Done({ navigate, mode, testResult }) {
  return (
    <div className="p-10 text-center">
      <div className="mx-auto mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-700">
        <Check className="h-8 w-8" strokeWidth={3} />
      </div>
      <h1 className="font-display text-3xl font-semibold tracking-tight">{testResult?.success ? "You're live!" : 'Setup saved'}</h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-zinc-600">
        {testResult?.success
          ? `Your ${mode === 'sandbox' ? 'sandbox' : 'production'} WhatsApp channel is wired up. Time to send your first campaign or build a chatbot.`
          : "Your credentials are saved. You can run a test anytime from the Channel Setup page."}
      </p>

      <div className="mx-auto mt-6 grid max-w-md gap-2">
        <button data-testid="goto-campaigns" onClick={() => navigate('/app/campaigns')} className="inline-flex items-center justify-center gap-1.5 rounded-md bg-wa-dark px-4 py-2.5 text-sm font-medium text-white hover:bg-wa-mid">
          <Send className="h-4 w-4" /> Send my first campaign
        </button>
        <button onClick={() => navigate('/app/flows')} className="inline-flex items-center justify-center gap-1.5 rounded-md border border-zinc-300 bg-white px-4 py-2.5 text-sm hover:bg-zinc-50">
          <MessageSquare className="h-4 w-4" /> Build a chatbot flow
        </button>
        <button onClick={() => navigate('/app/whatsapp')} className="text-xs text-zinc-500 hover:text-zinc-800">Advanced channel settings →</button>
      </div>
    </div>
  );
}
