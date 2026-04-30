import React, { useEffect, useState } from 'react';
import api from '../lib/api';
import {
  Send, Users, MessagesSquare, CheckCheck, ArrowUpRight, Activity, AlertCircle, TrendingUp, Sparkles
} from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, CartesianGrid,
} from 'recharts';

const COLORS = ['#16A34A', '#3B82F6', '#F59E0B', '#EF4444', '#A855F7'];

const MetricCard = ({ label, value, sub, icon: Icon, accent }) => (
  <div data-testid={`metric-${label.replace(/\s/g, '-').toLowerCase()}`} className="rounded-md border border-zinc-200 bg-white p-5">
    <div className="flex items-start justify-between">
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">{label}</div>
        <div className="mt-2 font-display text-3xl font-semibold tracking-tight text-zinc-900">{value}</div>
        {sub && <div className="mt-1 text-xs text-zinc-500">{sub}</div>}
      </div>
      <div className={`grid h-9 w-9 place-items-center rounded-md border border-zinc-200 ${accent || 'text-zinc-700'}`}>
        <Icon className="h-4 w-4" />
      </div>
    </div>
  </div>
);

export default function Dashboard() {
  const [overview, setOverview] = useState(null);
  const [series, setSeries] = useState([]);
  const [breakdown, setBreakdown] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const fetch = async () => {
      try {
        const [o, t, b] = await Promise.all([
          api.get('/dashboard/overview'),
          api.get('/dashboard/timeseries?days=14'),
          api.get('/dashboard/status-breakdown'),
        ]);
        if (!mounted) return;
        setOverview(o.data);
        setSeries(t.data);
        setBreakdown(b.data);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    fetch();
    const interval = setInterval(fetch, 7000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  if (loading) return <div className="p-8 text-sm text-zinc-500">Loading…</div>;

  const m = overview?.metrics || {};
  const limits = overview?.limits || {};
  const usagePct = (n, total) => Math.min(100, Math.round((n / Math.max(1, total)) * 100));

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Overview</h1>
          <p className="mt-1 inline-flex items-center gap-2 text-sm text-zinc-600">
            Real-time pulse for {overview?.tenant?.company_name}
            <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-wa-dark">
              <span className="h-1.5 w-1.5 rounded-full bg-wa-light live-dot" /> LIVE
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link data-testid="quick-campaign" to="/app/campaigns" className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-800 hover:bg-zinc-50">
            <Send className="h-3.5 w-3.5" /> New campaign
          </Link>
          <Link data-testid="quick-chat" to="/app/chat" className="inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-3 py-2 text-xs font-medium text-white hover:bg-zinc-800">
            <MessagesSquare className="h-3.5 w-3.5" /> Open inbox
          </Link>
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Messages sent" value={m.messages_sent?.toLocaleString() || 0} sub={`${m.messages_inbound || 0} inbound`} icon={Send} accent="text-wa-dark" />
        <MetricCard label="Delivery rate" value={`${m.delivery_rate || 0}%`} sub={`${m.failed || 0} failed`} icon={CheckCheck} />
        <MetricCard label="Active leads" value={m.leads_total?.toLocaleString() || 0} sub={`${m.leads_qualified || 0} qualified`} icon={Users} />
        <MetricCard label="Conversations" value={m.conversations_total?.toLocaleString() || 0} sub={`${m.unread_total || 0} unread`} icon={MessagesSquare} />
      </div>

      {/* Charts row */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-md border border-zinc-200 bg-white p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Messages · 14 days</div>
              <div className="mt-1 font-display text-lg font-medium">Volume by direction</div>
            </div>
            <div className="flex items-center gap-3 text-xs text-zinc-500">
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-green-600" /> Sent</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-blue-600" /> Received</span>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#71717A' }} />
                <YAxis tick={{ fontSize: 11, fill: '#71717A' }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6 }} />
                <Line type="monotone" dataKey="sent" stroke="#16A34A" strokeWidth={2} dot={{ r: 2 }} />
                <Line type="monotone" dataKey="received" stroke="#3B82F6" strokeWidth={2} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-md border border-zinc-200 bg-white p-5">
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Status breakdown</div>
          <div className="font-display text-lg font-medium">Outbound</div>
          <div className="mt-2 h-44">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={breakdown.length ? breakdown : [{ status: 'none', count: 1 }]}
                  dataKey="count" nameKey="status" innerRadius={36} outerRadius={64} paddingAngle={2}
                >
                  {(breakdown.length ? breakdown : [{}]).map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 space-y-1.5 text-xs">
            {breakdown.length === 0 && <div className="text-zinc-500">No data yet.</div>}
            {breakdown.map((b, i) => (
              <div key={b.status} className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} />
                  <span className="capitalize text-zinc-700">{b.status}</span>
                </span>
                <span className="font-mono text-zinc-900">{b.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Plan usage */}
      <div className="grid gap-4 md:grid-cols-3">
        {[
          { label: 'Messages', used: m.messages_sent || 0, limit: limits.messages || 0, hint: 'this month' },
          { label: 'Leads', used: m.leads_total || 0, limit: limits.leads || 0, hint: 'total' },
          { label: 'Numbers connected', used: 0, limit: limits.credentials || 0, hint: 'WhatsApp credentials' },
        ].map((u) => (
          <div key={u.label} className="rounded-md border border-zinc-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">{u.label}</div>
              <span className="text-xs text-zinc-400">{u.hint}</span>
            </div>
            <div className="mt-2 font-display text-2xl font-semibold tracking-tight">
              {u.used.toLocaleString()} <span className="text-base font-normal text-zinc-400">/ {u.limit.toLocaleString()}</span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-zinc-100">
              <div className="h-full rounded-full bg-green-600" style={{ width: `${usagePct(u.used, u.limit)}%` }} />
            </div>
          </div>
        ))}
      </div>

      {/* Trial banner */}
      {(overview?.tenant?.plan === 'free' || overview?.tenant?.plan === 'trial') && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 text-amber-700" />
            <div>
              <div className="font-medium text-amber-900">You&apos;re on the Free plan — upgrade for more messages</div>
              <p className="mt-1 text-sm text-amber-800">Upgrade any time to keep your campaigns and chat history active.</p>
              <Link to="/app/billing" data-testid="trial-upgrade" className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800">
                See plans <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
