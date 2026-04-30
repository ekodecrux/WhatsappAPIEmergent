import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ChevronRight, ChevronDown, Rocket, MessageSquare, Users, Send, Workflow,
  Plug, CreditCard, BarChart3, UserPlus, Bot, FileText, Shield, Sparkles,
  ExternalLink, Check, AlertCircle, Phone, Mail, Lock, ScanLine, QrCode,
} from 'lucide-react';

const Step = ({ n, title, children, icon: Icon }) => (
  <div className="flex gap-5 border-b border-zinc-200 pb-6 last:border-0">
    <div className="shrink-0">
      <div className="grid h-8 w-8 place-items-center rounded-md bg-wa-dark text-white">
        {Icon ? <Icon className="h-4 w-4" /> : <span className="text-xs font-bold">{n}</span>}
      </div>
    </div>
    <div className="flex-1 min-w-0">
      <h3 className="font-display text-base font-semibold text-zinc-900">{title}</h3>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-zinc-700">{children}</div>
    </div>
  </div>
);

const Pill = ({ children }) => (
  <span className="inline-flex items-center gap-1 rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[11px] text-zinc-800">{children}</span>
);

const Note = ({ children, type = 'info' }) => {
  const styles = {
    info: 'border-blue-200 bg-blue-50 text-blue-900',
    warn: 'border-amber-200 bg-amber-50 text-amber-900',
    tip: 'border-green-200 bg-green-50 text-wa-dark',
  }[type];
  return (
    <div className={`flex items-start gap-2 rounded-md border p-2.5 text-xs ${styles}`}>
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <div>{children}</div>
    </div>
  );
};

const Section = ({ id, icon: Icon, title, defaultOpen, children }) => {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div id={id} className="rounded-md border border-zinc-200 bg-white">
      <button
        onClick={() => setOpen(o => !o)}
        data-testid={`section-${id}`}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left hover:bg-zinc-50"
      >
        <div className="flex items-center gap-3">
          <div className="grid h-8 w-8 place-items-center rounded-md bg-wa-dark/5 text-wa-dark">
            <Icon className="h-4 w-4" />
          </div>
          <div className="font-display text-base font-semibold text-zinc-900">{title}</div>
        </div>
        {open ? <ChevronDown className="h-4 w-4 text-zinc-500" /> : <ChevronRight className="h-4 w-4 text-zinc-500" />}
      </button>
      {open && (
        <div className="space-y-6 border-t border-zinc-200 px-5 py-6">
          {children}
        </div>
      )}
    </div>
  );
};

const TOC_ITEMS = [
  { id: 'getting-started', label: 'Getting started', icon: Rocket },
  { id: 'whatsapp', label: 'Connect WhatsApp', icon: MessageSquare },
  { id: 'leads', label: 'Add &amp; import leads', icon: Users },
  { id: 'campaigns', label: 'Bulk campaigns', icon: Send },
  { id: 'flows', label: 'Build a chatbot', icon: Workflow },
  { id: 'qr', label: 'Deploy QR code', icon: QrCode },
  { id: 'erp', label: 'ERP &amp; API', icon: Plug },
  { id: 'team', label: 'Team &amp; roles', icon: UserPlus },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'subscription', label: 'Subscription', icon: CreditCard },
];

export default function UserGuide() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-end">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-wa-dark">User guide</div>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">Get to your first WhatsApp campaign in 4 minutes.</h1>
          <p className="mt-1 text-sm text-zinc-600">A step-by-step playbook for every workflow on the platform.</p>
        </div>
        <a
          href="/USER_GUIDE.md"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
        >
          <ExternalLink className="h-3.5 w-3.5" /> Markdown version
        </a>
      </div>

      {/* TOC */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {TOC_ITEMS.map(t => (
          <a
            key={t.id}
            href={`#${t.id}`}
            data-testid={`toc-${t.id}`}
            className="flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700 hover:border-wa-light hover:bg-zinc-50"
          >
            <t.icon className="h-3.5 w-3.5 text-wa-mid" />
            <span dangerouslySetInnerHTML={{ __html: t.label }} />
          </a>
        ))}
      </div>

      {/* 1. Getting started */}
      <Section id="getting-started" icon={Rocket} title="1. Getting started" defaultOpen>
        <Step n="1" title="Create your workspace" icon={Rocket}>
          <p>Go to <Link to="/register" className="text-wa-dark underline">/register</Link>. You can sign up using:</p>
          <ul className="ml-5 list-disc space-y-1">
            <li><b>Password</b> — fastest, just email + password</li>
            <li><b>Email OTP</b> — a 6-digit code is mailed to you (5-min expiry)</li>
            <li><b>SMS OTP</b> — Twilio Verify sends a code to your phone</li>
          </ul>
          <p>Every signup automatically creates a multi-tenant workspace on the <b>Free plan</b> (100 msgs/mo) — no card required. Upgrade to Starter (₹499) or Pro (₹999) anytime.</p>
        </Step>
        <Step n="2" title="Sign in later" icon={Lock}>
          Use the same three options at <Link to="/login" className="text-wa-dark underline">/login</Link>. Once in, you'll land on the Overview dashboard.
        </Step>
        <Step n="3" title="Tour the sidebar" icon={Sparkles}>
          <p>Every major workflow lives in the left sidebar:</p>
          <ul className="ml-5 list-disc space-y-1">
            <li><b>WhatsApp Setup</b> – connect your sandbox / Twilio / Meta Cloud credentials</li>
            <li><b>Campaigns</b> – send bulk messages with approval workflow</li>
            <li><b>Leads / CRM</b> – capture and qualify customers</li>
            <li><b>Live Chat</b> – 3-pane real-time inbox with AI co-pilot</li>
            <li><b>Auto-replies</b> – simple keyword rules</li>
            <li><b>Chatbot Flows</b> – visual mind-map builder for full bots</li>
            <li><b>Analytics</b> – charts, funnels, campaign performance</li>
            <li><b>ERP &amp; API</b> – generate API keys, configure webhooks</li>
            <li><b>Team</b> – invite colleagues, assign roles</li>
          </ul>
        </Step>
      </Section>

      {/* 2. Connect WhatsApp */}
      <Section id="whatsapp" icon={MessageSquare} title="2. Connect WhatsApp">
        <Step n="1" title="Pick a provider">
          <p>Go to <Link to="/app/whatsapp" className="text-wa-dark underline">WhatsApp Setup → Connect account</Link> and pick:</p>
          <ul className="ml-5 list-disc space-y-1">
            <li><b>Twilio Sandbox</b> — instant, uses our shared sandbox <Pill>whatsapp:+14155238886</Pill></li>
            <li><b>Twilio (own account)</b> — paste your Account SID + Auth Token + WhatsApp From</li>
            <li><b>Meta Cloud API</b> — paste permanent access token + phone number ID</li>
          </ul>
        </Step>
        <Step n="2" title="Opt-in your phone (sandbox only)" icon={Phone}>
          <p>Twilio's shared sandbox requires a one-time opt-in:</p>
          <ol className="ml-5 list-decimal space-y-1">
            <li>Open Twilio Console → <i>Messaging → Try it out → Send a WhatsApp message</i></li>
            <li>Note the join code (e.g. <Pill>join silent-jungle</Pill>)</li>
            <li>From your phone, send that text to <Pill>+1 415 523 8886</Pill> on WhatsApp</li>
            <li>Twilio replies "✅ connected" — you can now send/receive</li>
          </ol>
          <Note type="tip">No phone? Use the <b>Sandbox simulator</b> (✈️ icon next to the credential) to fake an inbound message and test the entire stack without Twilio at all.</Note>
        </Step>
        <Step n="3" title="Configure inbound webhook (production only)" icon={Shield}>
          <p>For real customers to message you, set the <b>"WHEN A MESSAGE COMES IN"</b> webhook in your Twilio console to:</p>
          <Pill>{`{REACT_APP_BACKEND_URL}/api/whatsapp/webhook/twilio`}</Pill> with method POST.
        </Step>
        <Note type="info"><b>Encryption:</b> All credentials (SID, tokens) are AES-256 encrypted at rest with a tenant-derived key. Decryption only happens in-memory at send time.</Note>
      </Section>

      {/* 3. Leads */}
      <Section id="leads" icon={Users} title="3. Add &amp; import leads">
        <Step n="1" title="Manual entry">
          Visit <Link to="/app/leads" className="text-wa-dark underline">Leads / CRM → Add lead</Link>. Phone is required (E.164 format like <Pill>+919876543210</Pill>); name, email, company, notes are optional.
        </Step>
        <Step n="2" title="Bulk CSV upload">
          <p>Click <b>Import CSV</b> → either upload a file or paste raw CSV. Required header: <Pill>phone</Pill>. Optional: <Pill>name</Pill>, <Pill>email</Pill>, <Pill>company</Pill>.</p>
          <p>Duplicates (same phone within tenant) are skipped automatically.</p>
        </Step>
        <Step n="3" title="Filter, qualify, score">
          Inline status dropdown: <b>new → contacted → qualified → converted / lost</b>. Lead score (0-100) auto-updates from inbound message sentiment via Groq AI.
        </Step>
        <Step n="4" title="Push leads from your ERP">
          Use API key auth with <Pill>POST /api/integrations/erp/leads</Pill> — see the ERP section below.
        </Step>
      </Section>

      {/* 4. Campaigns */}
      <Section id="campaigns" icon={Send} title="4. Bulk campaigns">
        <Step n="1" title="Create">
          Visit <Link to="/app/campaigns" className="text-wa-dark underline">Campaigns → New campaign</Link>. Pick a connection, write the message, paste recipient phones (one per line, comma or space-separated). Submit.
        </Step>
        <Step n="2" title="Approve">
          Every campaign starts in <b>pending_approval</b>. An admin clicks <b>Approve</b> to start sending. Throttled to ~10 messages/sec to respect WhatsApp rate limits.
        </Step>
        <Step n="3" title="Pause / Resume">
          Click <b>Pause</b> mid-send to halt. Click <b>Resume</b> later — it skips already-sent recipients and continues.
        </Step>
        <Step n="4" title="Track">
          Live progress bar updates every 5 seconds. Each message lands in <b>Live Chat</b> as a conversation; replies fire AI suggestions automatically.
        </Step>
        <Note type="warn">Twilio sandbox can only send to opted-in phones. For production scale, use your own Twilio or Meta Cloud credentials.</Note>
      </Section>

      {/* 5. Flows */}
      <Section id="flows" icon={Workflow} title="5. Build a WhatsApp chatbot">
        <Step n="1" title="Pick a template" icon={Sparkles}>
          <p>Go to <Link to="/app/flows" className="text-wa-dark underline">Chatbot Flows</Link>. Five ready-to-use templates:</p>
          <ul className="ml-5 list-disc space-y-1">
            <li><b>Mobile Banking Bot</b> — auth → menu → balance / txns / transfer</li>
            <li><b>Training Certification</b> — quiz → certificate</li>
            <li><b>Lead Qualifier</b> — capture name, company, team-size</li>
            <li><b>Support FAQ Bot</b> — password reset / billing / agent</li>
            <li><b>Blank flow</b> — start from scratch</li>
          </ul>
        </Step>
        <Step n="2" title="Visual builder">
          <p>Drag nodes from the left palette. Connect them by dragging from a right-side handle to a left-side handle. Click any node/edge to edit on the right.</p>
          <p className="font-semibold text-zinc-900">Node types:</p>
          <ul className="ml-5 list-disc space-y-1">
            <li><b>Send message</b> — push a static or templated reply</li>
            <li><b>Ask question</b> — capture user reply into <Pill>{'{{var}}'}</Pill></li>
            <li><b>Choice menu</b> — list options 1, 2, 3… and route by user pick</li>
            <li><b>Keyword branch</b> — route by inbound text containing keywords (label edges)</li>
            <li><b>Condition</b> — compare a captured variable (e.g. <Pill>{'{{amount}} > 10000'}</Pill>); label edges <Pill>true</Pill> / <Pill>false</Pill></li>
            <li><b>API / Webhook</b> — POST captured variables to your ERP</li>
            <li><b>End</b> — terminate the conversation with a final message</li>
          </ul>
        </Step>
        <Step n="3" title="Triggers">
          At the bottom of the left panel, set <b>keywords</b> that activate this bot when an inbound message contains them (e.g. <Pill>bank</Pill>, <Pill>balance</Pill>). Use <Pill>start</Pill> as a generic catch-all.
        </Step>
        <Step n="4" title="Test → Publish">
          Click <b>Test</b> in the toolbar to fire a synthetic conversation. When happy, click <b>Publish</b> — the bot is now live and will trigger on real inbound matches.
        </Step>
        <Note type="tip">Variable interpolation: type <Pill>Hi {'{{name}}'}!</Pill> in any Send/End message and the engine substitutes the captured variable.</Note>
      </Section>

      {/* 6. QR */}
      <Section id="qr" icon={QrCode} title="6. Deploy as QR code">
        <Step n="1" title="Generate" icon={ScanLine}>
          On <Link to="/app/flows" className="text-wa-dark underline">Chatbot Flows</Link>, click the <b>QR icon</b> on any <i>Active</i> flow. The platform builds a <Pill>wa.me</Pill> link pre-filled with the flow's first trigger keyword and renders a scannable PNG.
        </Step>
        <Step n="2" title="Print &amp; deploy">
          Download the PNG. Print on storefronts, packaging, posters, training material. Anyone who scans it lands in WhatsApp with the trigger pre-typed — they hit Send and your bot starts the conversation instantly.
        </Step>
        <Note type="tip">Use case: a bank sticker on the ATM that auto-launches the balance-check bot. A QR on a training module that issues a quiz + certificate. A QR on a product box that triggers a feedback survey.</Note>
      </Section>

      {/* 7. ERP */}
      <Section id="erp" icon={Plug} title="7. ERP &amp; API integration">
        <Step n="1" title="Generate an API key" icon={Shield}>
          Visit <Link to="/app/integrations" className="text-wa-dark underline">ERP &amp; API → Generate key</Link>. The raw key is shown <b>only once</b> — copy it now. Subsequent listings show only the prefix.
        </Step>
        <Step n="2" title="Send a message from your ERP">
<pre className="overflow-auto rounded-md bg-zinc-950 p-3 font-mono text-[11px] leading-5 text-zinc-200">{`curl -X POST {API_URL}/api/integrations/erp/send-message \\
  -H "X-API-Key: wsk_••••••••••" \\
  -H "Content-Type: application/json" \\
  -d '{
    "to_phone": "+919876543210",
    "message": "Order #INV-1042 confirmed."
  }'`}</pre>
        </Step>
        <Step n="3" title="Push leads from your ERP">
<pre className="overflow-auto rounded-md bg-zinc-950 p-3 font-mono text-[11px] leading-5 text-zinc-200">{`curl -X POST {API_URL}/api/integrations/erp/leads \\
  -H "X-API-Key: wsk_••••••••••" \\
  -d '{ "phone":"+919...", "name":"Aarav", "company":"Acme" }'`}</pre>
        </Step>
        <Step n="4" title="Outbound webhooks">
          Add a webhook URL on the same page. Future events like <Pill>message.received</Pill> and <Pill>message.status</Pill> can be POSTed to your ERP.
        </Step>
      </Section>

      {/* 8. Team */}
      <Section id="team" icon={UserPlus} title="8. Team &amp; roles">
        <Step n="1" title="Invite a teammate">
          Visit <Link to="/app/team" className="text-wa-dark underline">Team → Invite teammate</Link>. Pick a role (admin / member / viewer) and enter their email. They receive an email with a token + accept link.
        </Step>
        <Step n="2" title="Accept an invite">
          The invitee opens <Pill>/accept-invite?token=…</Pill>, sets a password and joins the same workspace under the chosen role.
        </Step>
        <Step n="3" title="Manage roles">
          Admins can change roles, disable, or remove members from the Team page. You cannot demote yourself.
        </Step>
      </Section>

      {/* 9. Analytics */}
      <Section id="analytics" icon={BarChart3} title="9. Analytics">
        <Step n="1" title="Channel performance">
          <Link to="/app/analytics" className="text-wa-dark underline">Analytics</Link> page auto-refreshes every 7 seconds: volume area chart, status pie, lead funnel, source bar chart, campaign performance, delivery rate, sentiment.
        </Step>
        <Step n="2" title="Per-flow drop-off" icon={Workflow}>
          Click the chart icon on any flow in <Link to="/app/flows" className="text-wa-dark underline">Chatbot Flows</Link> for: <b>total sessions, active, completed, completion %</b>, plus per-node visit counts &amp; drop-off bars.
        </Step>
        <Step n="3" title="Audit log">
          Every action (login, invite, key gen, publish, etc.) is logged with timestamp + actor at the bottom of the <i>ERP &amp; API</i> page.
        </Step>
      </Section>

      {/* 10. Subscription */}
      <Section id="subscription" icon={CreditCard} title="10. Subscription">
        <Step n="1" title="Plans &amp; limits">
          <ul className="ml-5 list-disc space-y-1">
            <li><b>Free</b> · 100 msgs · 100 leads · ₹0 / forever</li>
            <li><b>Starter</b> · 5,000 msgs · 1,000 leads · ₹499/mo</li>
            <li><b>Pro</b> · 25,000 msgs · 10,000 leads · ₹999/mo</li>
          </ul>
        </Step>
        <Step n="2" title="Upgrade via Razorpay" icon={CreditCard}>
          <Link to="/app/billing" className="text-wa-dark underline">Subscription → Upgrade</Link>. Test card in TEST mode: <Pill>4111 1111 1111 1111</Pill> · any future expiry · CVV <Pill>123</Pill>.
        </Step>
        <Step n="3" title="Payment history">
          Every transaction (status, amount, plan, timestamp) is on the same page.
        </Step>
      </Section>

      <div className="rounded-md border border-zinc-200 bg-gradient-to-br from-white to-zinc-50 p-6 text-center">
        <Sparkles className="mx-auto h-5 w-5 text-wa-mid" />
        <h3 className="mt-2 font-display text-lg font-semibold">Need a hand?</h3>
        <p className="mt-1 text-sm text-zinc-600">Use the Sandbox simulator on <Link to="/app/whatsapp" className="text-wa-dark underline">WhatsApp Setup</Link> to drive an end-to-end test in 30 seconds — no Twilio opt-in needed.</p>
      </div>
    </div>
  );
}
