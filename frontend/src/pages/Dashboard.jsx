import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import {
  Send, Users, MessagesSquare, Activity, AlertCircle, TrendingUp, Sparkles,
  Wallet, Plug, Workflow, MessageSquare, LifeBuoy, ArrowUpRight, Plus, Inbox,
  CheckCircle2, Clock, Zap, Megaphone, AlertTriangle,
} from 'lucide-react';

const ICONS = { channel: MessageSquare, wallet: Wallet, inbox: Inbox, alert: AlertTriangle, ticket: LifeBuoy, flow: Workflow };
const LEVEL_STYLE = {
  high: 'border-red-200 bg-red-50 text-red-900',
  warn: 'border-amber-200 bg-amber-50 text-amber-900',
  info: 'border-zinc-200 bg-white text-zinc-800',
};

function Tile({ to, icon: Icon, label, primary, secondary, hint, accent }) {
  return (
    <Link
      to={to}
      data-testid={`tile-${label.replace(/\s|&|\//g, '-').toLowerCase()}`}
      className="group relative flex flex-col rounded-md border border-zinc-200 bg-white p-5 transition hover:border-zinc-400 hover:shadow-sm"
    >
      <div className="flex items-start justify-between">
        <div className={`grid h-9 w-9 place-items-center rounded-md border border-zinc-200 ${accent || 'bg-zinc-50 text-zinc-700'}`}>
          <Icon className="h-4 w-4" />
        </div>
        <ArrowUpRight className="h-3.5 w-3.5 text-zinc-400 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-zinc-700" />
      </div>
      <div className="mt-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="font-display text-2xl font-semibold tracking-tight text-zinc-900">{primary}</span>
        {secondary && <span className="text-xs text-zinc-500">{secondary}</span>}
      </div>
      {hint && <div className="mt-1 text-xs text-zinc-500">{hint}</div>}
    </Link>
  );
}

export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const fetch = async () => {
      try {
        const { data } = await api.get('/dashboard/summary');
        if (mounted) setSummary(data);
      } finally { if (mounted) setLoading(false); }
    };
    fetch();
    const t = setInterval(fetch, 10000);
    return () => { mounted = false; clearInterval(t); };
  }, []);

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  }, []);

  if (loading) return <div className="p-8 text-sm text-zinc-500">Loading mission control…</div>;
  const m = summary?.modules || {};

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      {/* Hero — greeting + quick actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-zinc-900">{greeting}</h1>
          <p className="mt-1 text-sm text-zinc-600">
            <strong className="font-semibold text-zinc-900">{summary?.today_sent || 0}</strong> messages sent today ·
            <kbd className="ml-2 rounded border border-zinc-300 bg-zinc-50 px-1.5 py-0.5 font-mono text-[10px] text-zinc-600">⌘K</kbd>
            <span className="ml-1 text-xs text-zinc-500">to jump anywhere</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/app/campaigns" data-testid="quick-new-campaign" className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-wa-mid">
            <Plus className="h-3.5 w-3.5" /> New campaign
          </Link>
          <Link to="/app/chat" data-testid="quick-open-inbox" className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3.5 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50">
            <Inbox className="h-3.5 w-3.5" /> Open inbox
            {m.inbox?.unread > 0 && <span className="ml-1 rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">{m.inbox.unread}</span>}
          </Link>
          <Link to="/app/flows" className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3.5 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50">
            <Workflow className="h-3.5 w-3.5" /> Build a chatbot
          </Link>
        </div>
      </div>

      {/* Attention strip */}
      {summary?.attention?.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {summary.attention.map((a, i) => {
            const Icon = ICONS[a.icon] || AlertCircle;
            return (
              <Link
                key={i}
                to={a.href}
                data-testid={`attention-${a.icon}`}
                className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-xs transition hover:shadow-sm ${LEVEL_STYLE[a.level] || LEVEL_STYLE.info}`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{a.msg}</span>
                </span>
                <span className="inline-flex shrink-0 items-center gap-0.5 font-semibold underline-offset-2 hover:underline">
                  {a.cta} <ArrowUpRight className="h-3 w-3" />
                </span>
              </Link>
            );
          })}
        </div>
      )}

      {/* Module summary tiles — Engage / Customers / Build / Account */}
      <section className="space-y-3">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">Engage</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Tile
            to={m.campaigns?.href || '/app/campaigns'}
            icon={Send}
            label="Campaigns"
            primary={(m.campaigns?.running || 0) + (m.campaigns?.scheduled || 0)}
            secondary={`${m.campaigns?.running || 0} running`}
            hint={m.campaigns?.last_name ? `Last: ${m.campaigns.last_name} · ${m.campaigns.last_status}` : 'Run your first broadcast →'}
          />
          <Tile
            to={m.flows?.href || '/app/flows'}
            icon={Workflow}
            label="Chatbots"
            primary={m.flows?.published || 0}
            secondary={`of ${m.flows?.total || 0} flows live`}
            hint={m.flows?.total ? 'Edit or publish more flows' : 'Clone a marketplace template →'}
          />
          <Tile
            to="/app/marketplace"
            icon={Sparkles}
            label="Marketplace"
            primary="Browse"
            hint="Pre-built lead, FAQ, cart-recovery flows"
            accent="bg-purple-50 text-purple-700"
          />
          <Tile
            to="/app/templates"
            icon={MessageSquare}
            label="Templates"
            primary="Library"
            hint="Reusable WhatsApp message templates"
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">Customers</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Tile
            to={m.inbox?.href || '/app/chat'}
            icon={MessagesSquare}
            label="Inbox"
            primary={m.inbox?.unread || 0}
            secondary={`${m.inbox?.conversations || 0} conversations`}
            hint={m.inbox?.last_inbound_at ? `Last reply ${new Date(m.inbox.last_inbound_at).toLocaleString()}` : 'No inbound yet'}
            accent={(m.inbox?.unread || 0) > 0 ? 'bg-red-50 text-red-700' : ''}
          />
          <Tile
            to={m.leads?.href || '/app/leads'}
            icon={Users}
            label="Leads & CRM"
            primary={(m.leads?.new || 0) + (m.leads?.qualified || 0)}
            secondary={`${m.leads?.qualified || 0} qualified`}
            hint={m.leads?.new ? `${m.leads.new} new — review pipeline` : 'Pipeline empty — start a campaign'}
          />
          <Tile
            to="/app/auto-replies"
            icon={Zap}
            label="Auto-replies"
            primary="Manage"
            hint="Out-of-hours + keyword auto-responders"
          />
          <Tile
            to="/app/analytics"
            icon={TrendingUp}
            label="Analytics"
            primary="Trends"
            hint="Delivery, sentiment, lead score over time"
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">Build</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Tile
            to={m.channels?.href || '/app/whatsapp'}
            icon={MessageSquare}
            label="Channels"
            primary={m.channels?.active || 0}
            secondary={`of ${m.channels?.total || 0} connected`}
            hint={m.channels?.total ? 'Manage Twilio / Meta credentials' : 'Connect your first WhatsApp number →'}
            accent={m.channels?.total === 0 ? 'bg-amber-50 text-amber-700' : ''}
          />
          <Tile
            to={m.erp?.href || '/app/integrations'}
            icon={Plug}
            label="Developer / ERP"
            primary={m.erp?.api_keys || 0}
            secondary={`${m.erp?.webhooks || 0} webhooks`}
            hint={m.erp?.scheduled_pending ? `${m.erp.scheduled_pending} scheduled pending` : 'API keys, webhooks & cart recovery'}
          />
          <Tile
            to="/app/team"
            icon={Users}
            label="Team"
            primary="Invite"
            hint="Add agents, set roles & permissions"
          />
          <Tile
            to="/app/delivery"
            icon={Activity}
            label="Delivery"
            primary={summary?.today_sent || 0}
            secondary="sent today"
            hint="Per-message status & live logs"
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">Account</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Tile
            to={m.wallet?.href || '/app/wallet'}
            icon={Wallet}
            label="Wallet"
            primary={`₹${(m.wallet?.balance_inr || 0).toFixed(0)}`}
            secondary={m.wallet?.billing_mode === 'wallet' ? 'wallet billing' : 'BYOC mode'}
            hint={m.wallet?.low ? '⚠ Top up to keep sending' : 'Healthy balance'}
            accent={m.wallet?.low ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}
          />
          <Tile
            to="/app/billing"
            icon={Megaphone}
            label="Subscription"
            primary="Free"
            hint="Upgrade to Starter ₹499 / Pro ₹999"
          />
          <Tile
            to={m.support?.href || '/app/support'}
            icon={LifeBuoy}
            label="Support"
            primary={m.support?.open || 0}
            secondary="open tickets"
            hint={m.support?.open ? 'Check awaiting responses' : 'All clear · raise a ticket if needed'}
          />
          <Tile
            to="/app/settings"
            icon={CheckCircle2}
            label="Settings"
            primary="Configure"
            hint="Profile, integrations, security"
          />
        </div>
      </section>

      <div className="pt-4 text-center text-xs text-zinc-500">
        Tip: press <kbd className="rounded border border-zinc-300 bg-zinc-50 px-1.5 py-0.5 font-mono text-[10px]">⌘K</kbd> (or <kbd className="rounded border border-zinc-300 bg-zinc-50 px-1.5 py-0.5 font-mono text-[10px]">Ctrl K</kbd>) to jump to any feature instantly · click the green sparkle bottom-right to ask the AI assistant for help
      </div>
    </div>
  );
}
