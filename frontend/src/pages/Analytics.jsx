import React, { useEffect, useState } from 'react';
import api from '../lib/api';
import { TrendingUp, MessageSquare, Users, Send, Activity, Sparkles, Globe, BarChart3 } from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, CartesianGrid, RadialBarChart, RadialBar, Legend
} from 'recharts';

const WA_GREEN = '#25D366';
const WA_DARK = '#075E54';
const WA_MID = '#128C7E';
const COLORS = [WA_DARK, WA_GREEN, '#F59E0B', '#EF4444', '#A855F7'];

const Stat = ({ label, value, sub, icon: Icon, trend }) => (
  <div className="rounded-md border border-zinc-200 bg-white p-5">
    <div className="flex items-start justify-between">
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">{label}</div>
        <div className="mt-2 font-display text-3xl font-semibold tracking-tight text-zinc-900">{value}</div>
        {sub && <div className="mt-1 text-xs text-zinc-500">{sub}</div>}
      </div>
      <div className="grid h-9 w-9 place-items-center rounded-md border border-zinc-200 text-wa-dark">
        <Icon className="h-4 w-4" />
      </div>
    </div>
    {trend !== undefined && (
      <div className={`mt-3 inline-flex items-center gap-1 text-xs font-medium ${trend >= 0 ? 'text-green-700' : 'text-red-700'}`}>
        <TrendingUp className={`h-3 w-3 ${trend < 0 ? 'rotate-180' : ''}`} /> {trend >= 0 ? '+' : ''}{trend}% vs last period
      </div>
    )}
  </div>
);

export default function Analytics() {
  const [overview, setOverview] = useState(null);
  const [series, setSeries] = useState([]);
  const [breakdown, setBreakdown] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [leads, setLeads] = useState([]);
  const [days, setDays] = useState(14);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const [o, t, b, c, l] = await Promise.all([
        api.get('/dashboard/overview'),
        api.get(`/dashboard/timeseries?days=${days}`),
        api.get('/dashboard/status-breakdown'),
        api.get('/campaigns'),
        api.get('/leads'),
      ]);
      setOverview(o.data); setSeries(t.data); setBreakdown(b.data);
      setCampaigns(c.data); setLeads(l.data);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); const t = setInterval(load, 7000); return () => clearInterval(t); /* eslint-disable-next-line */ }, [days]);

  if (loading) return <div className="p-8 text-sm text-zinc-500">Loading…</div>;

  const m = overview?.metrics || {};

  // Lead source breakdown
  const sourceMap = {};
  leads.forEach(l => { sourceMap[l.source] = (sourceMap[l.source] || 0) + 1; });
  const sourceData = Object.entries(sourceMap).map(([k, v]) => ({ source: k, count: v }));

  // Lead status funnel
  const statusOrder = ['new', 'contacted', 'qualified', 'converted'];
  const statusCounts = statusOrder.map((s) => ({ status: s, count: leads.filter(l => l.status === s).length }));

  // Campaign performance
  const campaignPerf = campaigns.slice(0, 8).map(c => ({
    name: c.name?.slice(0, 20) || '—',
    sent: c.sent_count || 0,
    delivered: c.delivered_count || 0,
    failed: c.failed_count || 0,
  }));

  // Hourly heatmap stub: build from series data (last 14d)
  const totalSent = series.reduce((a, b) => a + (b.sent || 0), 0);
  const totalRecv = series.reduce((a, b) => a + (b.received || 0), 0);
  const totalLeads = series.reduce((a, b) => a + (b.leads || 0), 0);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-center">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Analytics</h1>
          <p className="mt-1 text-sm text-zinc-600">Real-time channel performance · auto-refreshes every 7s</p>
        </div>
        <div className="inline-flex rounded-md border border-zinc-200 bg-white p-1 text-xs">
          {[7, 14, 30].map(d => (
            <button key={d} data-testid={`range-${d}`} onClick={() => setDays(d)} className={`rounded px-3 py-1.5 ${days === d ? 'bg-wa-dark text-white' : 'text-zinc-700 hover:bg-zinc-100'}`}>
              Last {d}d
            </button>
          ))}
        </div>
      </div>

      {/* Top metrics */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Total messages" value={m.messages_total?.toLocaleString() || 0} sub="all directions" icon={MessageSquare} />
        <Stat label="Sent (window)" value={totalSent.toLocaleString()} sub={`${days} day window`} icon={Send} />
        <Stat label="Received (window)" value={totalRecv.toLocaleString()} sub={`${days} day window`} icon={Activity} />
        <Stat label="New leads (window)" value={totalLeads.toLocaleString()} sub={`${days} day window`} icon={Users} />
      </div>

      {/* Volume area chart */}
      <div className="rounded-md border border-zinc-200 bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Volume</div>
            <div className="mt-1 font-display text-lg font-medium">Messages per day</div>
          </div>
          <div className="flex items-center gap-3 text-xs text-zinc-500">
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: WA_DARK }} /> Sent</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: WA_GREEN }} /> Received</span>
          </div>
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series}>
              <defs>
                <linearGradient id="sent" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={WA_DARK} stopOpacity={0.4} />
                  <stop offset="95%" stopColor={WA_DARK} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="recv" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={WA_GREEN} stopOpacity={0.4} />
                  <stop offset="95%" stopColor={WA_GREEN} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#71717A' }} />
              <YAxis tick={{ fontSize: 11, fill: '#71717A' }} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid #E5E7EB' }} />
              <Area type="monotone" dataKey="sent" stroke={WA_DARK} fill="url(#sent)" strokeWidth={2} />
              <Area type="monotone" dataKey="received" stroke={WA_GREEN} fill="url(#recv)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Status breakdown */}
        <div className="rounded-md border border-zinc-200 bg-white p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Status breakdown</div>
          <div className="mt-1 font-display text-lg font-medium">Outbound delivery</div>
          <div className="mt-2 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={breakdown.length ? breakdown : [{ status: 'none', count: 1 }]} dataKey="count" nameKey="status" innerRadius={48} outerRadius={80} paddingAngle={3}>
                  {(breakdown.length ? breakdown : [{}]).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
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

        {/* Lead funnel */}
        <div className="rounded-md border border-zinc-200 bg-white p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Lead funnel</div>
          <div className="mt-1 font-display text-lg font-medium">Pipeline stages</div>
          <div className="mt-4 space-y-2.5">
            {(() => {
              const max = Math.max(1, ...statusCounts.map(s => s.count));
              return statusCounts.map((s, idx) => (
                <div key={s.status}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="capitalize text-zinc-700">{s.status}</span>
                    <span className="font-mono text-zinc-900">{s.count}</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-zinc-100">
                    <div className="h-full rounded-full" style={{ width: `${(s.count / max) * 100}%`, background: COLORS[idx % COLORS.length] }} />
                  </div>
                </div>
              ));
            })()}
          </div>
        </div>

        {/* Lead sources */}
        <div className="rounded-md border border-zinc-200 bg-white p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Lead sources</div>
          <div className="mt-1 font-display text-lg font-medium">Where leads come from</div>
          <div className="mt-2 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sourceData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="source" tick={{ fontSize: 11 }} width={70} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6 }} />
                <Bar dataKey="count" fill={WA_DARK} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Campaign performance */}
      <div className="rounded-md border border-zinc-200 bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Campaign performance</div>
            <div className="mt-1 font-display text-lg font-medium">Recent {Math.min(8, campaignPerf.length)} campaigns</div>
          </div>
          <div className="flex items-center gap-3 text-xs text-zinc-500">
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: WA_DARK }} /> Sent</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: WA_GREEN }} /> Delivered</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-red-500" /> Failed</span>
          </div>
        </div>
        <div className="h-72">
          {campaignPerf.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-zinc-500">No campaigns yet.</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={campaignPerf}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6 }} />
                <Bar dataKey="sent" fill={WA_DARK} radius={[3, 3, 0, 0]} />
                <Bar dataKey="delivered" fill={WA_GREEN} radius={[3, 3, 0, 0]} />
                <Bar dataKey="failed" fill="#EF4444" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Insights */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-md border border-zinc-200 bg-gradient-to-br from-white to-zinc-50 p-5">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-wa-mid">
            <Sparkles className="h-3 w-3" /> Insight
          </div>
          <div className="mt-2 font-display text-lg font-medium">Delivery rate</div>
          <div className="mt-1 font-display text-3xl font-semibold tracking-tight text-wa-dark">{m.delivery_rate || 0}%</div>
          <p className="mt-2 text-xs text-zinc-600">Industry healthy benchmark is 95%+. {m.delivery_rate >= 95 ? 'You\'re crushing it.' : 'Try cleaning your recipient list and using opt-in templates.'}</p>
        </div>
        <div className="rounded-md border border-zinc-200 bg-gradient-to-br from-white to-zinc-50 p-5">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-wa-mid">
            <Globe className="h-3 w-3" /> Conversations
          </div>
          <div className="mt-2 font-display text-lg font-medium">Active threads</div>
          <div className="mt-1 font-display text-3xl font-semibold tracking-tight text-wa-dark">{m.conversations_total || 0}</div>
          <p className="mt-2 text-xs text-zinc-600">{m.unread_total || 0} unread · respond within 24h to maintain engagement.</p>
        </div>
        <div className="rounded-md border border-zinc-200 bg-gradient-to-br from-white to-zinc-50 p-5">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-wa-mid">
            <BarChart3 className="h-3 w-3" /> Conversion
          </div>
          <div className="mt-2 font-display text-lg font-medium">Lead → qualified</div>
          <div className="mt-1 font-display text-3xl font-semibold tracking-tight text-wa-dark">
            {leads.length ? Math.round((statusCounts[2].count / leads.length) * 100) : 0}%
          </div>
          <p className="mt-2 text-xs text-zinc-600">{statusCounts[2].count} qualified out of {leads.length} total.</p>
        </div>
      </div>
    </div>
  );
}
