import React from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, ShieldCheck, Zap, MessageSquare, Database, Workflow,
  Users, BarChart3, Bot, Lock, Globe, Check, ChevronRight, Sparkles
} from 'lucide-react';

const Pill = ({ children }) => (
  <span className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-700">
    <span className="h-1.5 w-1.5 rounded-full bg-green-600 live-dot" />
    {children}
  </span>
);

const Feature = ({ icon: Icon, title, desc }) => (
  <div className="group relative rounded-md border border-zinc-200 bg-white p-6 transition-colors hover:bg-zinc-50">
    <div className="mb-4 inline-flex h-9 w-9 items-center justify-center rounded-md border border-zinc-200 bg-white text-wa-dark">
      <Icon className="h-4 w-4" />
    </div>
    <h3 className="font-display text-lg font-semibold text-zinc-900">{title}</h3>
    <p className="mt-1.5 text-sm leading-relaxed text-zinc-600">{desc}</p>
  </div>
);

const PriceCard = ({ name, price, items, highlight, cta = 'Start free trial', tag }) => (
  <div
    data-testid={`pricing-${name.toLowerCase()}`}
    className={`relative rounded-md border p-7 ${highlight ? 'border-green-700 bg-zinc-950 text-zinc-100' : 'border-zinc-200 bg-white'}`}
  >
    {tag && (
      <span className="absolute -top-3 left-6 rounded-full bg-green-700 px-3 py-1 text-xs font-medium uppercase tracking-wider text-white">
        {tag}
      </span>
    )}
    <div className={`text-xs font-semibold uppercase tracking-[0.2em] ${highlight ? 'text-green-400' : 'text-wa-dark'}`}>{name}</div>
    <div className="mt-3 flex items-baseline gap-2">
      <span className="font-display text-4xl font-semibold tracking-tight">₹{price}</span>
      <span className={highlight ? 'text-zinc-400' : 'text-zinc-500'}>/month</span>
    </div>
    <ul className="mt-6 space-y-3 text-sm">
      {items.map((it) => (
        <li key={it} className="flex items-start gap-2.5">
          <Check className={`mt-0.5 h-4 w-4 shrink-0 ${highlight ? 'text-green-400' : 'text-wa-dark'}`} />
          <span className={highlight ? 'text-zinc-200' : 'text-zinc-700'}>{it}</span>
        </li>
      ))}
    </ul>
    <Link
      to="/register"
      data-testid={`cta-${name.toLowerCase()}`}
      className={`mt-7 inline-flex w-full items-center justify-center rounded-md px-4 py-2.5 text-sm font-medium transition ${
        highlight ? 'bg-wa-dark text-white hover:bg-wa-mid' : 'border border-zinc-900 text-zinc-900 hover:bg-zinc-900 hover:text-white'
      }`}
    >
      {cta} <ChevronRight className="ml-1 h-4 w-4" />
    </Link>
  </div>
);

export default function Landing() {
  return (
    <div className="min-h-screen bg-white text-zinc-900">
      {/* Top nav */}
      <header className="sticky top-0 z-50 border-b border-zinc-200 bg-white/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <Link to="/" className="flex items-center gap-2 font-display text-base font-semibold tracking-tight">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-wa-dark text-white">
              <MessageSquare className="h-3.5 w-3.5" strokeWidth={2.5} />
            </span>
            wabridge<span className="text-wa-dark">.</span>
          </Link>
          <nav className="hidden items-center gap-7 text-sm text-zinc-600 md:flex">
            <a href="#features" className="hover:text-zinc-900">Features</a>
            <a href="#how" className="hover:text-zinc-900">How it works</a>
            <a href="#pricing" className="hover:text-zinc-900">Pricing</a>
            <a href="#integrations" className="hover:text-zinc-900">ERP &amp; API</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/login" data-testid="nav-login" className="text-sm font-medium text-zinc-700 hover:text-zinc-900">
              Sign in
            </Link>
            <Link
              to="/register"
              data-testid="nav-register"
              className="inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-zinc-800"
            >
              Get started <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="bg-blueprint absolute inset-0 -z-10" />
        <div className="bg-radial-fade absolute inset-0 -z-10" />
        <div className="mx-auto max-w-7xl px-6 pt-24 pb-20 md:pt-32">
          <div className="flex flex-col items-start gap-6">
            <Pill>Live on WhatsApp Business Cloud &amp; Twilio</Pill>
            <h1 className="font-display text-5xl font-semibold leading-[1.05] tracking-tighter text-zinc-900 sm:text-6xl lg:text-7xl">
              The WhatsApp control room <br className="hidden md:block" />
              for <span className="text-wa-dark">modern revenue teams</span>
            </h1>
            <p className="max-w-2xl text-lg leading-relaxed text-zinc-600">
              Connect your own WhatsApp Business credentials, run bulk campaigns with built-in approval flow,
              chat in real time, and plug into any ERP via webhooks &amp; API keys. Built for teams who refuse to be spammers.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                to="/register"
                data-testid="hero-cta-trial"
                className="inline-flex items-center gap-2 rounded-md bg-green-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-wa-mid"
              >
                Start 14-day free trial <ArrowRight className="h-4 w-4" />
              </Link>
              <a href="#how" className="inline-flex items-center gap-2 rounded-md border border-zinc-300 bg-white px-5 py-3 text-sm font-medium text-zinc-800 hover:bg-zinc-50">
                See how it works
              </a>
            </div>
            <div className="mt-2 flex items-center gap-4 text-xs text-zinc-500">
              <span className="inline-flex items-center gap-1.5"><Lock className="h-3.5 w-3.5" /> AES-256 encrypted credentials</span>
              <span>•</span>
              <span>No credit card required</span>
              <span>•</span>
              <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Compliant by design</span>
            </div>
          </div>

          {/* Visual block */}
          <div className="mt-16 overflow-hidden rounded-md border border-zinc-200 bg-white shadow-sm">
            <div className="grid grid-cols-12 gap-0">
              <div className="col-span-12 border-b border-zinc-200 lg:col-span-3 lg:border-b-0 lg:border-r">
                <div className="border-b border-zinc-200 p-5">
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-wa-dark">Live Conversations</div>
                </div>
                {[
                  { name: 'Aarav Mehta', body: 'Need a quote for 50 units', score: 82 },
                  { name: 'Priya Singh', body: 'Order confirmation please', score: 64 },
                  { name: 'Rahul Verma', body: 'Demo this week?', score: 91 },
                ].map((c, i) => (
                  <div key={i} className={`flex items-center gap-3 border-b border-zinc-100 p-4 ${i === 0 ? 'bg-zinc-50' : ''}`}>
                    <div className="grid h-8 w-8 place-items-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-700">
                      {c.name.split(' ').map(s => s[0]).join('')}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-medium text-zinc-900">{c.name}</div>
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-wa-dark">{c.score}</span>
                      </div>
                      <div className="truncate text-xs text-zinc-500">{c.body}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="col-span-12 lg:col-span-6">
                <div className="border-b border-zinc-200 p-5">
                  <div className="flex items-center gap-3">
                    <div className="grid h-8 w-8 place-items-center rounded-full bg-green-700 text-xs font-semibold text-white">RV</div>
                    <div>
                      <div className="text-sm font-medium">Rahul Verma</div>
                      <div className="text-[11px] text-zinc-500">+91 98xxxx91 · last seen 1m ago</div>
                    </div>
                  </div>
                </div>
                <div className="space-y-3 p-5">
                  <div className="flex justify-start">
                    <div className="max-w-[78%] rounded-md rounded-tl-none bg-zinc-100 px-3 py-2 text-sm text-zinc-800">
                      Hey, can we set up a demo this week?
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <div className="max-w-[78%] rounded-md rounded-tr-none bg-green-600 px-3 py-2 text-sm text-white">
                      Absolutely — Tuesday 4pm IST works for our team.
                    </div>
                  </div>
                  <div className="flex justify-start">
                    <div className="max-w-[78%] rounded-md rounded-tl-none bg-zinc-100 px-3 py-2 text-sm text-zinc-800">
                      Perfect. Send the link.
                    </div>
                  </div>
                </div>
              </div>
              <div className="col-span-12 border-t border-zinc-200 lg:col-span-3 lg:border-t-0 lg:border-l">
                <div className="border-b border-zinc-200 p-5">
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-wa-dark">AI Co-pilot</div>
                </div>
                <div className="space-y-3 p-5">
                  <div className="rounded-md border border-zinc-200 p-3 text-xs leading-relaxed text-zinc-700">
                    <div className="mb-1 flex items-center gap-1.5 font-medium text-zinc-900">
                      <Sparkles className="h-3.5 w-3.5 text-wa-dark" /> Suggested reply
                    </div>
                    Sharing the calendar link now. Looking forward to walking you through the bulk campaign workflow.
                  </div>
                  <div className="rounded-md bg-zinc-50 p-3 text-xs text-zinc-700">
                    <div className="font-medium text-zinc-900">Lead intent</div>
                    <div className="mt-1">High purchase intent · score 91</div>
                  </div>
                  <div className="rounded-md bg-zinc-50 p-3 text-xs text-zinc-700">
                    <div className="font-medium text-zinc-900">Sentiment</div>
                    <div className="mt-1 text-wa-dark">Positive</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-t border-zinc-200 bg-zinc-50">
        <div className="mx-auto max-w-7xl px-6 py-24">
          <div className="mb-12 max-w-2xl">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-wa-dark">Built for scale</div>
            <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">
              Everything your team needs to run WhatsApp like a real channel.
            </h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Feature icon={ShieldCheck} title="Bring your own credentials" desc="Connect your Twilio or Meta WhatsApp Business account. Tokens are encrypted with AES-256 — never logged." />
            <Feature icon={Zap} title="Bulk with guardrails" desc="Send to thousands with built-in rate limiting, opt-in checks and a human-in-the-loop approval gate." />
            <Feature icon={Bot} title="AI co-pilot" desc="Llama-3.3 powered reply suggestions, sentiment analysis and lead scoring. No additional setup." />
            <Feature icon={MessageSquare} title="Real-time inbox" desc="A 3-pane chat console for your sales & support team. WhatsApp-style bubbles, blazing fast." />
            <Feature icon={Database} title="Lead CRM" desc="Capture, score and convert leads. Bulk import, filters, custom fields and assignment in one place." />
            <Feature icon={Workflow} title="ERP integrations" desc="Trigger campaigns from your ERP via signed API keys & webhooks. Bidirectional & idempotent." />
            <Feature icon={Users} title="Team & roles" desc="Invite teammates, assign conversations, and audit every action with detailed activity logs." />
            <Feature icon={BarChart3} title="Analytics" desc="Volume, delivery & engagement charts that update in real time. Export anytime." />
            <Feature icon={Globe} title="Multi-tenant ready" desc="Scoped data per tenant, plan limits and per-tenant rate budgets out of the box." />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="border-t border-zinc-200">
        <div className="mx-auto max-w-7xl px-6 py-24">
          <div className="grid gap-12 lg:grid-cols-2">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-wa-dark">How it works</div>
              <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">From signup to first campaign in under 4 minutes.</h2>
              <p className="mt-4 max-w-lg text-zinc-600">No SDKs to install, no infrastructure to maintain. Just connect, compose and approve.</p>
            </div>
            <ol className="space-y-6">
              {[
                ['01', 'Create your workspace', 'Sign up for the 14-day free trial. No card, no commitment.'],
                ['02', 'Connect WhatsApp', 'Use the Twilio sandbox to start instantly, or paste your own Meta Cloud credentials. Encrypted on save.'],
                ['03', 'Import leads', 'Paste a list, upload a CSV or push from your ERP via API. Deduped automatically.'],
                ['04', 'Compose & approve', 'Pick a template, draft a message, queue the campaign. Admin approves before send.'],
                ['05', 'Track in real-time', 'Delivery, read, replies and lead scoring update live. Reply right from the inbox.'],
              ].map(([n, t, d]) => (
                <li key={n} className="flex gap-5 border-b border-zinc-200 pb-6 last:border-0 last:pb-0">
                  <span className="font-mono text-sm font-semibold tracking-tight text-wa-dark">{n}</span>
                  <div>
                    <div className="font-display text-lg font-medium text-zinc-900">{t}</div>
                    <p className="mt-1 text-sm leading-relaxed text-zinc-600">{d}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-t border-zinc-200 bg-zinc-50">
        <div className="mx-auto max-w-7xl px-6 py-24">
          <div className="mb-12 max-w-2xl">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-wa-dark">Pricing</div>
            <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">
              Simple plans. Transparent limits. No per-message fees.
            </h2>
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            <PriceCard name="Basic" price="999" items={['5,000 messages / month', '1,000 leads', '1 WhatsApp number', 'Email support']} />
            <PriceCard name="Pro" price="2,999" tag="Most popular" highlight items={['50,000 messages / month', '10,000 leads', '3 WhatsApp numbers', 'AI co-pilot', 'API & ERP webhooks', 'Priority support']} />
            <PriceCard name="Enterprise" price="9,999" items={['500,000 messages / month', '100,000 leads', 'Unlimited numbers', 'SLA & onboarding', 'Audit log export']} />
          </div>
        </div>
      </section>

      {/* Integrations / ERP */}
      <section id="integrations" className="border-t border-zinc-200">
        <div className="mx-auto max-w-7xl px-6 py-24">
          <div className="grid gap-10 lg:grid-cols-2">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-wa-dark">ERP &amp; API</div>
              <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">
                Plug into the systems you already run on.
              </h2>
              <p className="mt-4 max-w-lg text-zinc-600">
                Generate signed API keys, configure outbound webhooks and trigger WhatsApp from any ERP — SAP, Odoo, Tally, Salesforce, Zoho or your in-house tooling.
              </p>
              <Link to="/register" className="mt-6 inline-flex items-center gap-2 rounded-md border border-zinc-900 px-4 py-2.5 text-sm font-medium text-zinc-900 hover:bg-zinc-900 hover:text-white">
                Generate an API key <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="rounded-md border border-zinc-200 bg-zinc-950 p-6 font-mono text-xs leading-6 text-zinc-300">
              <div className="mb-3 text-[11px] uppercase tracking-[0.2em] text-zinc-500">// trigger from your ERP</div>
              <pre className="whitespace-pre-wrap">
{`curl -X POST https://api.wabridge.io/api/integrations/erp/send-message \\
  -H "X-API-Key: wsk_••••••••••••••" \\
  -H "Content-Type: application/json" \\
  -d '{
    "to_phone": "+919876543210",
    "message": "Order #INV-1042 confirmed. Track here: ..."
  }'

// → { "success": true, "sid": "SM..." }`}
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-zinc-200 bg-zinc-950 text-zinc-100">
        <div className="mx-auto max-w-7xl px-6 py-20">
          <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
            <div>
              <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Ship your first WhatsApp campaign today.</h2>
              <p className="mt-2 text-zinc-400">14 days free. Cancel anytime.</p>
            </div>
            <Link
              to="/register"
              data-testid="footer-cta"
              className="inline-flex items-center gap-2 rounded-md bg-green-600 px-5 py-3 text-sm font-medium text-white hover:bg-wa-mid"
            >
              Get started <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-6 py-8 text-sm text-zinc-500 md:flex-row">
          <div className="flex items-center gap-2">
            <span className="grid h-5 w-5 place-items-center rounded bg-wa-dark text-white"><MessageSquare className="h-3 w-3" /></span>
            <span className="font-medium text-zinc-900">wabridge</span> · © {new Date().getFullYear()}
          </div>
          <div className="flex items-center gap-5">
            <a href="#features" className="hover:text-zinc-900">Features</a>
            <a href="#pricing" className="hover:text-zinc-900">Pricing</a>
            <Link to="/login" className="hover:text-zinc-900">Sign in</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
