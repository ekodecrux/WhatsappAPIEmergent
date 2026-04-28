import React, { useEffect, useState } from 'react';
import api from '../lib/api';
import {
  Shield, Users, Building2, CreditCard, LifeBuoy, BarChart3, Search, Filter, Power, RefreshCcw,
  TrendingUp, AlertTriangle, MessageSquare, Workflow, Calendar, Plus, X, Save, Inbox,
} from 'lucide-react';
import { toast } from 'sonner';

const TABS = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'tenants', label: 'Tenants', icon: Building2 },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'subscriptions', label: 'Subscriptions', icon: CreditCard },
  { id: 'tickets', label: 'Support Inbox', icon: LifeBuoy },
];

const PLAN_BADGE = {
  trial: 'bg-amber-100 text-amber-800',
  basic: 'bg-blue-100 text-blue-800',
  pro: 'bg-purple-100 text-purple-800',
  enterprise: 'bg-emerald-100 text-emerald-800',
};

const PRIO_BADGE = {
  low: 'bg-zinc-100 text-zinc-700',
  normal: 'bg-blue-100 text-blue-800',
  high: 'bg-amber-100 text-amber-800',
  urgent: 'bg-red-100 text-red-800',
};

const STATUS_BADGE = {
  open: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-amber-100 text-amber-800',
  resolved: 'bg-green-100 text-green-800',
  closed: 'bg-zinc-100 text-zinc-700',
};

const fmtINR = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);

function StatCard({ label, value, sub, icon: Icon, accent }) {
  return (
    <div className="rounded-md border border-zinc-200 bg-white p-5">
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
}

function Overview() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.get('/admin/stats').then(({ data }) => { setStats(data); setLoading(false); });
  }, []);
  if (loading) return <div className="p-6 text-sm text-zinc-500">Loading platform stats…</div>;
  if (!stats) return null;
  const t = stats.tenants || {};
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard testid="stat-tenants" label="Total tenants" value={t.total || 0} sub={`${t.active || 0} active · ${t.suspended || 0} suspended`} icon={Building2} />
        <StatCard label="MRR" value={fmtINR(stats.mrr_inr)} sub="from paid plans" icon={TrendingUp} accent="text-green-700" />
        <StatCard label="Open tickets" value={stats.tickets?.open || 0} sub={`${stats.tickets?.urgent || 0} urgent`} icon={LifeBuoy} accent={stats.tickets?.urgent ? 'text-red-700' : 'text-zinc-700'} />
        <StatCard label="Trials expiring (3d)" value={t.trial_expiring_3d || 0} sub={`${t.new_7d || 0} new in 7d`} icon={AlertTriangle} accent={t.trial_expiring_3d ? 'text-amber-700' : 'text-zinc-700'} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-md border border-zinc-200 bg-white p-5 lg:col-span-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Plan distribution</div>
          <div className="mt-3 space-y-2.5">
            {Object.entries(stats.plan_distribution || {}).map(([plan, count]) => {
              const pct = Math.round((count / Math.max(1, t.total)) * 100);
              return (
                <div key={plan}>
                  <div className="flex items-center justify-between text-xs">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${PLAN_BADGE[plan] || 'bg-zinc-100 text-zinc-700'}`}>{plan}</span>
                    <span className="font-mono text-zinc-700">{count} · {pct}%</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-100">
                    <div className="h-full rounded-full bg-wa-dark" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="rounded-md border border-zinc-200 bg-white p-5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Activity totals</div>
          <div className="mt-3 space-y-2 text-sm">
            {[
              ['Users', stats.users, Users],
              ['Messages', stats.messages, MessageSquare],
              ['Campaigns', stats.campaigns, BarChart3],
              ['Flows', stats.flows, Workflow],
              ['Marketplace', stats.marketplace_templates, Inbox],
            ].map(([l, v, I]) => (
              <div key={l} className="flex items-center justify-between rounded-md border border-zinc-100 px-3 py-2">
                <span className="inline-flex items-center gap-2 text-zinc-700"><I className="h-3.5 w-3.5 text-zinc-400" /> {l}</span>
                <span className="font-mono font-medium">{(v || 0).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Tenants() {
  const [list, setList] = useState([]);
  const [search, setSearch] = useState('');
  const [planFilter, setPlanFilter] = useState('all');
  const [activeFilter, setActiveFilter] = useState('all');
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const params = {};
    if (search) params.search = search;
    if (planFilter !== 'all') params.plan = planFilter;
    if (activeFilter !== 'all') params.active = activeFilter;
    const { data } = await api.get('/admin/tenants', { params });
    setList(data);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [planFilter, activeFilter]);

  const submitEdit = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      const body = {};
      if (editing.plan !== editing._origPlan) body.plan = editing.plan;
      if (editing.is_active !== editing._origActive) body.is_active = editing.is_active;
      if (editing.extend_trial_days) body.extend_trial_days = Number(editing.extend_trial_days);
      if (editing.notes != null) body.notes = editing.notes;
      await api.patch(`/admin/tenants/${editing.id}`, body);
      toast.success('Tenant updated');
      setEditing(null);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed');
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
        <form onSubmit={(e) => { e.preventDefault(); load(); }} className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
          <input
            data-testid="admin-tenant-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by company name or tenant ID…"
            className="w-full rounded-md border border-zinc-300 bg-white py-2 pl-9 pr-3 text-sm"
          />
        </form>
        <select value={planFilter} onChange={(e) => setPlanFilter(e.target.value)} className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm">
          <option value="all">All plans</option>
          <option value="trial">Trial</option>
          <option value="basic">Basic</option>
          <option value="pro">Pro</option>
          <option value="enterprise">Enterprise</option>
        </select>
        <select value={activeFilter} onChange={(e) => setActiveFilter(e.target.value)} className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm">
          <option value="all">All statuses</option>
          <option value="true">Active</option>
          <option value="false">Suspended</option>
        </select>
        <button onClick={load} className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs"><RefreshCcw className="h-3.5 w-3.5" /> Refresh</button>
      </div>

      <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
        <table className="w-full text-xs">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-[10px] uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="px-3 py-2.5 text-left font-semibold">Company</th>
              <th className="px-3 py-2.5 text-left font-semibold">Plan</th>
              <th className="px-3 py-2.5 text-left font-semibold">Trial</th>
              <th className="px-3 py-2.5 text-right font-semibold">Users</th>
              <th className="px-3 py-2.5 text-right font-semibold">Msgs</th>
              <th className="px-3 py-2.5 text-left font-semibold">Status</th>
              <th className="px-3 py-2.5 text-left font-semibold">Created</th>
              <th className="px-3 py-2.5 text-right font-semibold"></th>
            </tr>
          </thead>
          <tbody data-testid="admin-tenant-list">
            {list.length === 0 && <tr><td colSpan={8} className="px-3 py-8 text-center text-zinc-500">No tenants found.</td></tr>}
            {list.map(t => (
              <tr key={t.id} className="border-b border-zinc-100 last:border-0">
                <td className="px-3 py-2.5">
                  <div className="font-medium text-zinc-900">{t.company_name}</div>
                  <div className="font-mono text-[10px] text-zinc-500">{t.id.slice(0, 8)}…</div>
                </td>
                <td className="px-3 py-2.5">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${PLAN_BADGE[t.plan] || 'bg-zinc-100'}`}>{t.plan}</span>
                </td>
                <td className="px-3 py-2.5 text-zinc-700">{t.plan === 'trial' ? `${t.trial_days_left}d left` : '—'}</td>
                <td className="px-3 py-2.5 text-right font-mono">{t.users_count || 0}</td>
                <td className="px-3 py-2.5 text-right font-mono">{(t.messages_sent || 0).toLocaleString()}</td>
                <td className="px-3 py-2.5">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${t.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${t.is_active ? 'bg-green-600' : 'bg-red-600'}`} />
                    {t.is_active ? 'Active' : 'Suspended'}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-zinc-500">{(t.created_at || '').slice(0, 10)}</td>
                <td className="px-3 py-2.5 text-right">
                  <button
                    data-testid={`admin-edit-tenant-${t.id}`}
                    onClick={() => setEditing({ ...t, _origPlan: t.plan, _origActive: t.is_active, extend_trial_days: 0, notes: t.admin_notes || '' })}
                    className="rounded-md border border-zinc-300 px-2 py-1 text-[11px] hover:bg-zinc-50"
                  >Manage</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-md border border-zinc-200 bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold inline-flex items-center gap-2"><Building2 className="h-4 w-4" /> {editing.company_name}</h3>
              <button onClick={() => setEditing(null)}><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3 text-sm">
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Plan</label>
                <select value={editing.plan} onChange={(e) => setEditing({ ...editing, plan: e.target.value })} className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" data-testid="admin-edit-plan">
                  <option value="trial">Trial</option>
                  <option value="basic">Basic — ₹999</option>
                  <option value="pro">Pro — ₹2,999</option>
                  <option value="enterprise">Enterprise — ₹9,999</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Extend trial by (days)</label>
                <input type="number" min={0} max={90} value={editing.extend_trial_days || 0} onChange={(e) => setEditing({ ...editing, extend_trial_days: e.target.value })} className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" data-testid="admin-edit-extend" />
              </div>
              <div className="flex items-center justify-between rounded-md border border-zinc-200 px-3 py-2">
                <span className="text-zinc-700">Tenant active</span>
                <button
                  data-testid="admin-edit-active"
                  onClick={() => setEditing({ ...editing, is_active: !editing.is_active })}
                  className={`relative h-5 w-9 rounded-full transition ${editing.is_active ? 'bg-green-600' : 'bg-zinc-300'}`}
                >
                  <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${editing.is_active ? 'left-4' : 'left-0.5'}`} />
                </button>
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Internal notes</label>
                <textarea rows={2} value={editing.notes || ''} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" placeholder="Optional notes for the team…" />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setEditing(null)} className="rounded-md border border-zinc-300 px-3 py-2 text-sm">Cancel</button>
              <button data-testid="admin-edit-save" onClick={submitEdit} disabled={busy} className="inline-flex items-center gap-1.5 rounded-md bg-wa-dark px-3 py-2 text-sm font-medium text-white hover:bg-wa-mid disabled:opacity-50">
                {busy ? 'Saving…' : <><Save className="h-3.5 w-3.5" /> Save</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function UsersList() {
  const [list, setList] = useState([]);
  const [search, setSearch] = useState('');
  const load = async () => {
    const { data } = await api.get('/admin/users', { params: search ? { search } : {} });
    setList(data);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);
  return (
    <div className="space-y-4">
      <form onSubmit={(e) => { e.preventDefault(); load(); }} className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search users by email or name…" className="w-full rounded-md border border-zinc-300 bg-white py-2 pl-9 pr-3 text-sm" />
      </form>
      <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
        <table className="w-full text-xs">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-[10px] uppercase tracking-wider text-zinc-500"><tr>
            <th className="px-3 py-2.5 text-left">Email</th><th className="px-3 py-2.5 text-left">Name</th><th className="px-3 py-2.5 text-left">Company</th><th className="px-3 py-2.5 text-left">Role</th><th className="px-3 py-2.5 text-left">Last login</th>
          </tr></thead>
          <tbody>
            {list.map(u => (
              <tr key={u.id} className="border-b border-zinc-100 last:border-0">
                <td className="px-3 py-2.5">
                  <div className="font-medium text-zinc-900">{u.email}</div>
                  {u.is_superadmin && <span className="text-[10px] font-semibold uppercase text-purple-700">Super-admin</span>}
                </td>
                <td className="px-3 py-2.5 text-zinc-700">{u.full_name || '—'}</td>
                <td className="px-3 py-2.5 text-zinc-700">{u.company_name}</td>
                <td className="px-3 py-2.5 capitalize text-zinc-700">{u.role}</td>
                <td className="px-3 py-2.5 text-zinc-500">{(u.last_login || '').slice(0, 16).replace('T', ' ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Subscriptions() {
  const [list, setList] = useState([]);
  useEffect(() => { api.get('/admin/subscriptions').then(({ data }) => setList(data)); }, []);
  return (
    <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
      <table className="w-full text-xs">
        <thead className="border-b border-zinc-200 bg-zinc-50 text-[10px] uppercase tracking-wider text-zinc-500"><tr>
          <th className="px-3 py-2.5 text-left">Company</th><th className="px-3 py-2.5 text-left">Plan</th><th className="px-3 py-2.5 text-right">Amount</th><th className="px-3 py-2.5 text-left">Status</th><th className="px-3 py-2.5 text-left">Date</th>
        </tr></thead>
        <tbody>
          {list.length === 0 && <tr><td colSpan={5} className="px-3 py-8 text-center text-zinc-500">No paid subscriptions yet.</td></tr>}
          {list.map(o => (
            <tr key={o.id || o.razorpay_order_id} className="border-b border-zinc-100 last:border-0">
              <td className="px-3 py-2.5 font-medium">{o.company_name}</td>
              <td className="px-3 py-2.5 capitalize">{o.plan}</td>
              <td className="px-3 py-2.5 text-right font-mono">{fmtINR(o.amount_inr || (o.amount || 0) / 100)}</td>
              <td className="px-3 py-2.5">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${o.status === 'paid' ? 'bg-green-100 text-green-800' : 'bg-zinc-100 text-zinc-700'}`}>{o.status || 'pending'}</span>
              </td>
              <td className="px-3 py-2.5 text-zinc-500">{(o.created_at || '').slice(0, 16).replace('T', ' ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TicketInbox() {
  const [list, setList] = useState([]);
  const [statusF, setStatusF] = useState('all');
  const [prioF, setPrioF] = useState('all');
  const [active, setActive] = useState(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data } = await api.get('/admin/tickets', { params: { status: statusF, priority: prioF } });
    setList(data);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [statusF, prioF]);

  const openTicket = async (t) => {
    const { data } = await api.get(`/support/tickets/${t.id}`);
    setActive({ ...t, ...data });
    setReply('');
  };

  const sendReply = async () => {
    if (!reply.trim() || !active) return;
    setBusy(true);
    try {
      await api.post(`/support/tickets/${active.id}/reply`, { message: reply });
      toast.success('Reply sent');
      setReply('');
      const { data } = await api.get(`/support/tickets/${active.id}`);
      setActive(data);
      load();
    } catch (e) { toast.error('Failed'); } finally { setBusy(false); }
  };

  const setStatus = async (status) => {
    if (!active) return;
    await api.patch(`/admin/tickets/${active.id}`, { status });
    toast.success(`Status: ${status}`);
    const { data } = await api.get(`/support/tickets/${active.id}`);
    setActive(data);
    load();
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.5fr]">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <select value={statusF} onChange={(e) => setStatusF(e.target.value)} className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm">
            <option value="all">All status</option><option value="open">Open</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option><option value="closed">Closed</option>
          </select>
          <select value={prioF} onChange={(e) => setPrioF(e.target.value)} className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm">
            <option value="all">All priorities</option><option value="urgent">Urgent</option><option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option>
          </select>
        </div>
        <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
          {list.length === 0 && <div className="px-4 py-12 text-center text-sm text-zinc-500">No tickets.</div>}
          {list.map(t => (
            <button
              key={t.id}
              data-testid={`admin-ticket-${t.id}`}
              onClick={() => openTicket(t)}
              className={`block w-full border-b border-zinc-100 px-4 py-3 text-left transition last:border-0 hover:bg-zinc-50 ${active?.id === t.id ? 'bg-zinc-50' : ''}`}
            >
              <div className="flex items-center justify-between">
                <div className="truncate font-medium text-zinc-900">{t.subject}</div>
                <span className={`ml-2 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${PRIO_BADGE[t.priority]}`}>{t.priority}</span>
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-500">
                <span className={`rounded-full px-1.5 py-0.5 ${STATUS_BADGE[t.status]}`}>{t.status}</span>
                <span>·</span>
                <span className="truncate">{t.company_name}</span>
                <span>·</span>
                <span>{(t.created_at || '').slice(0, 10)}</span>
                {t.source === 'chatbot' && <span className="ml-auto rounded bg-blue-50 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-blue-700">AI</span>}
              </div>
            </button>
          ))}
        </div>
      </div>

      {active ? (
        <div className="rounded-md border border-zinc-200 bg-white p-5">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-display text-lg font-semibold">{active.subject}</h3>
              <div className="mt-1 flex items-center gap-2 text-xs text-zinc-500">
                <span>From {active.user?.email || active.user_email}</span>
                <span>·</span>
                <span>{active.company_name}</span>
                <span>·</span>
                <span className={`rounded-full px-2 py-0.5 ${STATUS_BADGE[active.status]}`}>{active.status}</span>
                <span className={`rounded-full px-2 py-0.5 ${PRIO_BADGE[active.priority]}`}>{active.priority}</span>
              </div>
            </div>
            <div className="flex gap-1">
              {['open', 'in_progress', 'resolved', 'closed'].map(s => (
                <button key={s} onClick={() => setStatus(s)} className={`rounded-md border px-2 py-1 text-[10px] font-medium uppercase tracking-wider ${active.status === s ? 'border-wa-dark bg-wa-dark text-white' : 'border-zinc-200 hover:bg-zinc-50'}`}>{s.replace('_', ' ')}</button>
              ))}
            </div>
          </div>
          <div className="mt-4 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700 whitespace-pre-wrap">{active.description}</div>
          <div className="mt-4 space-y-2">
            {(active.replies || []).map(r => (
              <div key={r.id} className={`rounded-md border p-3 text-sm ${r.is_staff ? 'border-wa-dark/20 bg-wa-dark/5' : 'border-zinc-200 bg-white'}`}>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  {r.is_staff ? 'Staff' : 'Customer'} · {r.author_name} · {(r.created_at || '').slice(0, 16).replace('T', ' ')}
                </div>
                <div className="mt-1 whitespace-pre-wrap text-zinc-800">{r.message}</div>
              </div>
            ))}
          </div>
          <div className="mt-4">
            <textarea data-testid="admin-reply-input" rows={3} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Type your reply…" className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
            <button data-testid="admin-reply-send" onClick={sendReply} disabled={busy || !reply.trim()} className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-wa-dark px-3 py-2 text-sm font-medium text-white hover:bg-wa-mid disabled:opacity-50">{busy ? 'Sending…' : 'Send reply'}</button>
          </div>
        </div>
      ) : (
        <div className="grid place-items-center rounded-md border border-dashed border-zinc-300 bg-white p-12 text-sm text-zinc-500">Select a ticket to view and respond.</div>
      )}
    </div>
  );
}

export default function AdminConsole() {
  const [tab, setTab] = useState('overview');

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight inline-flex items-center gap-2">
            <Shield className="h-6 w-6 text-purple-700" /> Super Admin Console
          </h1>
          <p className="mt-1 text-sm text-zinc-600">Platform-wide control: every tenant, every subscription, every ticket.</p>
        </div>
        <span className="hidden rounded-full bg-purple-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-purple-800 sm:inline-flex">Platform</span>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-zinc-200" data-testid="admin-tabs">
        {TABS.map(t => (
          <button
            key={t.id}
            data-testid={`admin-tab-${t.id}`}
            onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition ${tab === t.id ? 'border-wa-dark text-wa-dark' : 'border-transparent text-zinc-600 hover:text-zinc-900'}`}
          >
            <t.icon className="h-3.5 w-3.5" /> {t.label}
          </button>
        ))}
      </div>

      <div>
        {tab === 'overview' && <Overview />}
        {tab === 'tenants' && <Tenants />}
        {tab === 'users' && <UsersList />}
        {tab === 'subscriptions' && <Subscriptions />}
        {tab === 'tickets' && <TicketInbox />}
      </div>
    </div>
  );
}
