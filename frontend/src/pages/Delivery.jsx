import React, { useEffect, useState } from 'react';
import api from '../lib/api';
import {
  CheckCheck, AlertTriangle, Clock, Phone, RefreshCcw, TrendingUp, XCircle, Send, Activity,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';

const STATUS_STYLE = {
  delivered: { bg: 'bg-green-100', text: 'text-green-800', label: 'Delivered' },
  read: { bg: 'bg-emerald-100', text: 'text-emerald-800', label: 'Read' },
  sent: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Sent' },
  queued: { bg: 'bg-zinc-100', text: 'text-zinc-700', label: 'Queued' },
  accepted: { bg: 'bg-zinc-100', text: 'text-zinc-700', label: 'Accepted' },
  failed: { bg: 'bg-red-100', text: 'text-red-800', label: 'Failed' },
  undelivered: { bg: 'bg-orange-100', text: 'text-orange-800', label: 'Undelivered' },
  unknown: { bg: 'bg-zinc-100', text: 'text-zinc-700', label: 'Unknown' },
};

const StatCard = ({ label, value, sub, icon: Icon, accent, testid }) => (
  <div data-testid={testid} className="rounded-md border border-zinc-200 bg-white p-5">
    <div className="flex items-start justify-between">
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">{label}</div>
        <div className={`mt-2 font-display text-3xl font-semibold tracking-tight ${accent || 'text-zinc-900'}`}>{value}</div>
        {sub && <div className="mt-1 text-xs text-zinc-500">{sub}</div>}
      </div>
      <div className={`grid h-9 w-9 place-items-center rounded-md border border-zinc-200 ${accent || 'text-zinc-700'}`}>
        <Icon className="h-4 w-4" />
      </div>
    </div>
  </div>
);

export default function Delivery() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    setRefreshing(true);
    try {
      const { data } = await api.get(`/dashboard/delivery?days=${days}&limit=50`);
      setData(data);
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [days]);

  if (loading) return <div className="p-8 text-sm text-zinc-500">Loading…</div>;
  if (!data) return <div className="p-8 text-sm text-zinc-500">No data.</div>;

  const t = data.totals || {};
  const trend = data.trend || [];
  const failed = data.recent_failed || [];
  const campaigns = data.by_campaign || [];

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight inline-flex items-center gap-2">
            <Activity className="h-6 w-6 text-wa-dark" /> Delivery Status
          </h1>
          <p className="mt-1 text-sm text-zinc-600">Real-time per-message delivery tracking via Twilio status webhook.</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            data-testid="delivery-range"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs"
          >
            <option value={1}>Today</option>
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
          </select>
          <button
            data-testid="delivery-refresh"
            onClick={load}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
          >
            <RefreshCcw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard testid="stat-total" label="Outbound (period)" value={(t.total || 0).toLocaleString()} sub="Messages attempted" icon={Send} />
        <StatCard testid="stat-delivered" label="Delivered" value={(t.delivered || 0).toLocaleString()} sub={`${t.delivery_rate || 0}% rate`} icon={CheckCheck} accent="text-green-700" />
        <StatCard testid="stat-failed" label="Failed" value={(t.failed || 0).toLocaleString()} sub={`${t.failure_rate || 0}% failure`} icon={XCircle} accent="text-red-700" />
        <StatCard testid="stat-pending" label="Pending" value={(t.pending || 0).toLocaleString()} sub="Sent but not yet delivered" icon={Clock} accent="text-amber-700" />
      </div>

      {/* Trend chart */}
      <div className="rounded-md border border-zinc-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Daily delivery breakdown</div>
            <div className="mt-1 font-display text-lg font-medium">Sent vs Delivered vs Failed</div>
          </div>
          <div className="hidden items-center gap-3 text-xs text-zinc-500 sm:flex">
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-blue-600" /> Sent</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-green-600" /> Delivered</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-red-500" /> Failed</span>
          </div>
        </div>
        <div className="h-64" data-testid="delivery-chart">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={trend} barCategoryGap={6}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#71717A' }} />
              <YAxis tick={{ fontSize: 11, fill: '#71717A' }} allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6 }} />
              <Bar dataKey="sent" stackId="a" fill="#3B82F6" radius={[0, 0, 0, 0]} />
              <Bar dataKey="delivered" stackId="b" fill="#16A34A" radius={[0, 0, 0, 0]} />
              <Bar dataKey="failed" stackId="c" fill="#EF4444" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Status breakdown */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-md border border-zinc-200 bg-white p-5 lg:col-span-1">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Status counts</div>
          <div className="mt-3 space-y-2">
            {Object.entries(data.status_counts || {}).length === 0 && (
              <div className="text-xs text-zinc-500">No outbound messages in the selected window.</div>
            )}
            {Object.entries(data.status_counts || {}).map(([s, c]) => {
              const cfg = STATUS_STYLE[s] || STATUS_STYLE.unknown;
              return (
                <div key={s} className="flex items-center justify-between text-sm">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${cfg.bg} ${cfg.text}`}>
                    {cfg.label}
                  </span>
                  <span className="font-mono text-zinc-900">{c.toLocaleString()}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Per-campaign performance */}
        <div className="rounded-md border border-zinc-200 bg-white p-5 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Per-campaign delivery</div>
            <TrendingUp className="h-3.5 w-3.5 text-zinc-400" />
          </div>
          <div className="overflow-hidden rounded-md border border-zinc-200">
            <table className="w-full text-xs">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-[10px] uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Campaign</th>
                  <th className="px-3 py-2 text-right font-semibold">Sent</th>
                  <th className="px-3 py-2 text-right font-semibold">Delivered</th>
                  <th className="px-3 py-2 text-right font-semibold">Failed</th>
                  <th className="px-3 py-2 text-right font-semibold">Rate</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.length === 0 && (
                  <tr><td colSpan={5} className="px-3 py-8 text-center text-zinc-500">No campaign messages yet.</td></tr>
                )}
                {campaigns.map(c => (
                  <tr key={c.campaign_id} className="border-b border-zinc-100 last:border-0">
                    <td className="max-w-[260px] truncate px-3 py-2.5">{c.campaign_name}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{c.sent}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-green-700">{c.delivered}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-red-700">{c.failed}</td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="h-1.5 w-12 overflow-hidden rounded-full bg-zinc-100">
                          <div className="h-full rounded-full bg-green-600" style={{ width: `${c.delivery_rate}%` }} />
                        </div>
                        <span className="font-mono text-zinc-900">{c.delivery_rate}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Recent failures */}
      <div className="rounded-md border border-zinc-200 bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Recent failures</div>
            <div className="mt-1 font-display text-lg font-medium inline-flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-600" /> Last {failed.length} failed messages
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-[10px] uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Recipient</th>
                <th className="px-3 py-2 text-left font-semibold">Message</th>
                <th className="px-3 py-2 text-left font-semibold">Status</th>
                <th className="px-3 py-2 text-left font-semibold">Error</th>
                <th className="px-3 py-2 text-left font-semibold">When</th>
              </tr>
            </thead>
            <tbody data-testid="failed-list">
              {failed.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-8 text-center text-zinc-500">No failures — your delivery is clean.</td></tr>
              )}
              {failed.map(m => {
                const cfg = STATUS_STYLE[m.status] || STATUS_STYLE.unknown;
                return (
                  <tr key={m.id} className="border-b border-zinc-100 last:border-0">
                    <td className="px-3 py-2.5">
                      <div className="inline-flex items-center gap-1.5">
                        <Phone className="h-3 w-3 text-zinc-400" />
                        <span className="font-mono text-zinc-800">{m.to_phone || '—'}</span>
                      </div>
                    </td>
                    <td className="max-w-[320px] truncate px-3 py-2.5 text-zinc-700">{m.content || '—'}</td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${cfg.bg} ${cfg.text}`}>
                        {cfg.label}
                      </span>
                    </td>
                    <td className="max-w-[260px] truncate px-3 py-2.5 text-red-700">{m.error || '—'}</td>
                    <td className="px-3 py-2.5 text-zinc-500">{(m.sent_at || '').replace('T', ' ').slice(0, 16)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
