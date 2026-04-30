import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';
import {
  Shield, Users, Building2, CreditCard, LifeBuoy, BarChart3, Search, RefreshCcw,
  TrendingUp, AlertTriangle, MessageSquare, Workflow, X, Save, Inbox, Banknote,
  Wallet, Percent, Plus, Minus, Eye,
} from 'lucide-react';
import { toast } from 'sonner';

const TABS = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'analytics', label: 'Analytics', icon: TrendingUp },
  { id: 'tenants', label: 'Tenants', icon: Building2 },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'subscriptions', label: 'Subscriptions', icon: CreditCard },
  { id: 'pricing', label: 'Pricing & Discounts', icon: Banknote },
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
  const { startImpersonation } = useAuth();
  const navigate = useNavigate();
  const [list, setList] = useState([]);
  const [search, setSearch] = useState('');
  const [planFilter, setPlanFilter] = useState('all');
  const [activeFilter, setActiveFilter] = useState('all');
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [creditAmt, setCreditAmt] = useState('');
  const [creditNote, setCreditNote] = useState('');
  const [pricing, setPricing] = useState({ marketing: '', utility: '', authentication: '', service: '' });

  const impersonate = async (tid) => {
    if (!window.confirm('View as this tenant? You can return any time.')) return;
    try {
      const { data } = await api.post(`/admin/tenants/${tid}/impersonate`);
      startImpersonation(data);
      navigate('/app');
    } catch (e) { toast.error(e?.response?.data?.detail || 'Impersonation failed'); }
  };

  const load = async () => {
    const params = {};
    if (search) params.search = search;
    if (planFilter !== 'all') params.plan = planFilter;
    if (activeFilter !== 'all') params.active = activeFilter;
    const { data } = await api.get('/admin/tenants', { params });
    setList(data);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [planFilter, activeFilter]);

  const openEdit = async (t) => {
    // hydrate full details (pricing_overrides + discount_pct)
    try {
      const { data } = await api.get(`/admin/tenants/${t.id}`);
      const full = data.tenant || {};
      setEditing({
        ...t, ...full,
        _origPlan: t.plan, _origActive: t.is_active, _origMode: full.billing_mode || t.billing_mode || 'byoc',
        extend_trial_days: 0,
        notes: full.admin_notes || '',
        discount_pct: full.discount_pct || 0,
        billing_mode: full.billing_mode || t.billing_mode || 'byoc',
      });
      const po = full.pricing_overrides || {};
      setPricing({
        marketing: po.marketing ?? '',
        utility: po.utility ?? '',
        authentication: po.authentication ?? '',
        service: po.service ?? '',
      });
      setCreditAmt(''); setCreditNote('');
    } catch {
      toast.error('Could not load tenant details');
    }
  };

  const submitEdit = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      const body = {};
      if (editing.plan !== editing._origPlan) body.plan = editing.plan;
      if (editing.is_active !== editing._origActive) body.is_active = editing.is_active;
      if (editing.extend_trial_days) body.extend_trial_days = Number(editing.extend_trial_days);
      if (editing.notes != null) body.notes = editing.notes;
      if (Number(editing.discount_pct) !== Number(editing._origDiscount || 0)) body.discount_pct = Number(editing.discount_pct);
      if (editing.billing_mode !== editing._origMode) body.billing_mode = editing.billing_mode;
      if (Object.keys(body).length) {
        await api.patch(`/admin/tenants/${editing.id}`, body);
      }
      // Apply manual credit/debit if entered
      if (creditAmt && Number(creditAmt) !== 0) {
        await api.post(`/wallet/admin/${editing.id}/credit`, {
          amount_inr: Number(creditAmt),
          note: creditNote || `Adjustment by platform admin`,
        });
      }
      // Apply pricing overrides if any field non-empty
      const po = {};
      ['marketing', 'utility', 'authentication', 'service'].forEach(k => {
        if (pricing[k] !== '' && pricing[k] != null && !Number.isNaN(Number(pricing[k]))) {
          po[k] = Number(pricing[k]);
        }
      });
      if (Object.keys(po).length) {
        await api.patch(`/wallet/admin/${editing.id}/pricing`, po);
      }
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
              <th className="px-3 py-2.5 text-right font-semibold">Wallet</th>
              <th className="px-3 py-2.5 text-right font-semibold">Users</th>
              <th className="px-3 py-2.5 text-right font-semibold">Msgs</th>
              <th className="px-3 py-2.5 text-left font-semibold">Mode</th>
              <th className="px-3 py-2.5 text-left font-semibold">Status</th>
              <th className="px-3 py-2.5 text-right font-semibold"></th>
            </tr>
          </thead>
          <tbody data-testid="admin-tenant-list">
            {list.length === 0 && <tr><td colSpan={9} className="px-3 py-8 text-center text-zinc-500">No tenants found.</td></tr>}
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
                <td className="px-3 py-2.5 text-right font-mono text-zinc-700">{fmtINR(t.wallet_balance_inr || 0)}</td>
                <td className="px-3 py-2.5 text-right font-mono">{t.users_count || 0}</td>
                <td className="px-3 py-2.5 text-right font-mono">{(t.messages_sent || 0).toLocaleString()}</td>
                <td className="px-3 py-2.5">
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${t.billing_mode === 'wallet' ? 'bg-purple-100 text-purple-800' : 'bg-zinc-100 text-zinc-700'}`}>{t.billing_mode || 'byoc'}</span>
                </td>
                <td className="px-3 py-2.5">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${t.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${t.is_active ? 'bg-green-600' : 'bg-red-600'}`} />
                    {t.is_active ? 'Active' : 'Suspended'}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right space-x-1">
                  <button
                    data-testid={`impersonate-${t.id}`}
                    onClick={() => impersonate(t.id)}
                    title="View as this tenant"
                    className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] text-amber-800 hover:bg-amber-100"
                  ><Eye className="h-3 w-3" /> View as</button>
                  <button
                    data-testid={`admin-edit-tenant-${t.id}`}
                    onClick={() => openEdit(t)}
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
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-md border border-zinc-200 bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold inline-flex items-center gap-2">
                <Building2 className="h-4 w-4" /> {editing.company_name}
              </h3>
              <button onClick={() => setEditing(null)}><X className="h-4 w-4" /></button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {/* Subscription */}
              <section className="space-y-3 rounded-md border border-zinc-200 p-4">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 inline-flex items-center gap-1.5"><CreditCard className="h-3 w-3" /> Subscription</div>
                <div>
                  <label className="text-xs text-zinc-600">Assign plan</label>
                  <select value={editing.plan} onChange={(e) => setEditing({ ...editing, plan: e.target.value })} className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" data-testid="admin-edit-plan">
                    <option value="trial">Trial · ₹0 / 14 days</option>
                    <option value="basic">Basic · ₹999 / mo</option>
                    <option value="pro">Pro · ₹2,999 / mo</option>
                    <option value="enterprise">Enterprise · ₹9,999 / mo</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-zinc-600">Extend trial by (days)</label>
                  <input type="number" min={0} max={90} value={editing.extend_trial_days || 0} onChange={(e) => setEditing({ ...editing, extend_trial_days: e.target.value })} className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" data-testid="admin-edit-extend" />
                </div>
                <div className="flex items-center justify-between rounded-md border border-zinc-200 px-3 py-2">
                  <span className="text-xs text-zinc-700">Tenant active</span>
                  <button
                    data-testid="admin-edit-active"
                    onClick={() => setEditing({ ...editing, is_active: !editing.is_active })}
                    className={`relative h-5 w-9 rounded-full transition ${editing.is_active ? 'bg-green-600' : 'bg-zinc-300'}`}
                  >
                    <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${editing.is_active ? 'left-4' : 'left-0.5'}`} />
                  </button>
                </div>
              </section>

              {/* Wallet & Discount */}
              <section className="space-y-3 rounded-md border border-zinc-200 p-4">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 inline-flex items-center gap-1.5"><Wallet className="h-3 w-3" /> Wallet &amp; discount</div>
                <div>
                  <label className="text-xs text-zinc-600">Billing mode</label>
                  <select value={editing.billing_mode} onChange={(e) => setEditing({ ...editing, billing_mode: e.target.value })} className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm">
                    <option value="byoc">BYOC (tenant pays Twilio/Meta directly)</option>
                    <option value="wallet">Wallet (we bill per-message via prepaid balance)</option>
                  </select>
                </div>
                <div className="rounded-md bg-zinc-50 p-2 text-xs">
                  <div className="text-zinc-500">Current balance</div>
                  <div className="font-mono text-base font-semibold">{fmtINR(editing.wallet_balance_inr || 0)}</div>
                </div>
                <div>
                  <label className="text-xs text-zinc-600">Manual credit / debit (₹) — use negative to debit</label>
                  <div className="mt-1 grid grid-cols-[1fr_auto_auto] gap-1.5">
                    <input type="number" data-testid="admin-credit-amt" value={creditAmt} onChange={(e) => setCreditAmt(e.target.value)} placeholder="500" className="rounded-md border border-zinc-300 px-3 py-2 text-sm" />
                    <button type="button" onClick={() => setCreditAmt(String(Math.abs(Number(creditAmt) || 100)))} className="rounded-md border border-green-300 bg-green-50 px-2 text-xs text-green-800" title="Credit"><Plus className="h-3 w-3" /></button>
                    <button type="button" onClick={() => setCreditAmt(String(-Math.abs(Number(creditAmt) || 100)))} className="rounded-md border border-red-300 bg-red-50 px-2 text-xs text-red-800" title="Debit"><Minus className="h-3 w-3" /></button>
                  </div>
                  <input type="text" value={creditNote} onChange={(e) => setCreditNote(e.target.value)} placeholder="Reason (optional)" className="mt-1.5 w-full rounded-md border border-zinc-300 px-3 py-2 text-xs" />
                </div>
                <div>
                  <label className="text-xs text-zinc-600 inline-flex items-center gap-1"><Percent className="h-3 w-3" /> Bonus on top-ups (%)</label>
                  <input type="number" min={0} max={100} step="0.5" data-testid="admin-discount-pct" value={editing.discount_pct} onChange={(e) => setEditing({ ...editing, discount_pct: e.target.value })} className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
                  <p className="mt-1 text-[11px] text-zinc-500">When the tenant tops up ₹X, they receive ₹X + {Number(editing.discount_pct || 0)}% bonus credit.</p>
                </div>
              </section>

              {/* Per-message pricing override */}
              <section className="space-y-2 rounded-md border border-zinc-200 p-4 sm:col-span-2">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 inline-flex items-center gap-1.5"><Banknote className="h-3 w-3" /> Per-message pricing override (₹)</div>
                <p className="text-[11px] text-zinc-500">Defaults: Marketing ₹0.85 · Utility ₹0.115 · Authentication ₹0.115 · Service ₹0. Leave blank to use default.</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    ['marketing', 'Marketing', '0.85'],
                    ['utility', 'Utility', '0.115'],
                    ['authentication', 'Auth', '0.115'],
                    ['service', 'Service', '0.00'],
                  ].map(([k, lbl, ph]) => (
                    <div key={k}>
                      <label className="text-[10px] text-zinc-500">{lbl}</label>
                      <input
                        type="number" step="0.001" min={0}
                        data-testid={`pricing-${k}`}
                        value={pricing[k]}
                        onChange={(e) => setPricing({ ...pricing, [k]: e.target.value })}
                        placeholder={ph}
                        className="mt-0.5 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-xs font-mono"
                      />
                    </div>
                  ))}
                </div>
              </section>

              {/* Notes */}
              <section className="space-y-2 rounded-md border border-zinc-200 p-4 sm:col-span-2">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Internal notes</div>
                <textarea rows={2} value={editing.notes || ''} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" placeholder="Optional notes for the team…" />
              </section>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setEditing(null)} className="rounded-md border border-zinc-300 px-3 py-2 text-sm">Cancel</button>
              <button data-testid="admin-edit-save" onClick={submitEdit} disabled={busy} className="inline-flex items-center gap-1.5 rounded-md bg-wa-dark px-3 py-2 text-sm font-medium text-white hover:bg-wa-mid disabled:opacity-50">
                {busy ? 'Saving…' : <><Save className="h-3.5 w-3.5" /> Save changes</>}
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

// ============ Platform Pricing & Discounts Tab ============
function PricingTab() {
  const [revenue, setRevenue] = useState(null);
  const [days, setDays] = useState(30);
  const [tenants, setTenants] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get(`/wallet/admin/revenue?days=${days}`),
      api.get('/admin/tenants'),
    ]).then(([r, t]) => {
      setRevenue(r.data);
      setTenants(t.data);
    }).finally(() => setLoading(false));
  }, [days]);

  const filtered = tenants.filter(t =>
    !search || t.company_name?.toLowerCase().includes(search.toLowerCase()) || t.id.startsWith(search)
  );
  const withDiscount = filtered.filter(t => (t.discount_pct || 0) > 0);
  const customPriced = filtered.filter(t => t.pricing_overrides && Object.keys(t.pricing_overrides).length > 0);

  if (loading) return <div className="p-6 text-sm text-zinc-500">Loading pricing data…</div>;

  return (
    <div className="space-y-5" data-testid="admin-pricing-tab">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Top-up revenue" value={fmtINR(revenue?.topups_inr || 0)} sub={`${days}d window`} icon={TrendingUp} accent="text-green-700" />
        <StatCard label="Wallet COGS" value={fmtINR(revenue?.message_debits_inr || 0)} sub="Outgoing message cost" icon={CreditCard} accent="text-red-700" />
        <StatCard label="Approx margin" value={fmtINR(revenue?.approx_margin_inr || 0)} sub="Revenue − COGS" icon={Banknote} accent="text-purple-700" />
        <StatCard label="Tenants on discount" value={withDiscount.length} sub={`${customPriced.length} on custom pricing`} icon={Percent} />
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
          <input
            data-testid="pricing-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tenant…"
            className="w-full rounded-md border border-zinc-300 bg-white py-2 pl-9 pr-3 text-sm"
          />
        </div>
        <div className="flex gap-1">
          {[7, 30, 90].map(d => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`rounded-md border px-2.5 py-1 text-[11px] font-medium ${days === d ? 'border-wa-dark bg-wa-dark text-white' : 'border-zinc-300 bg-white hover:bg-zinc-50'}`}
            >{d}d</button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
        <table className="w-full text-xs">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-[10px] uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="px-3 py-2.5 text-left">Company</th>
              <th className="px-3 py-2.5 text-left">Plan</th>
              <th className="px-3 py-2.5 text-left">Mode</th>
              <th className="px-3 py-2.5 text-right">Wallet</th>
              <th className="px-3 py-2.5 text-right">Top-up bonus</th>
              <th className="px-3 py-2.5 text-left">Custom pricing</th>
              <th className="px-3 py-2.5 text-right"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-zinc-500">No tenants.</td></tr>}
            {filtered.map(t => {
              const po = t.pricing_overrides || {};
              const overrides = Object.keys(po).length;
              return (
                <tr key={t.id} className="border-b border-zinc-100 last:border-0">
                  <td className="px-3 py-2.5 font-medium text-zinc-900">{t.company_name}</td>
                  <td className="px-3 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase ${PLAN_BADGE[t.plan] || 'bg-zinc-100'}`}>{t.plan}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${t.billing_mode === 'wallet' ? 'bg-purple-100 text-purple-800' : 'bg-zinc-100 text-zinc-700'}`}>{t.billing_mode || 'byoc'}</span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono">{fmtINR(t.wallet_balance_inr || 0)}</td>
                  <td className="px-3 py-2.5 text-right">
                    {(t.discount_pct || 0) > 0
                      ? <span className="rounded-full bg-green-100 px-2 py-0.5 font-mono font-semibold text-green-800">+{t.discount_pct}%</span>
                      : <span className="text-zinc-400">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-zinc-700">
                    {overrides > 0 ? `${overrides} override${overrides > 1 ? 's' : ''}` : <span className="text-zinc-400">default</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <button
                      onClick={() => window.location.assign(`/app/admin?tab=tenants`)}
                      className="rounded-md border border-zinc-300 px-2 py-1 text-[11px] hover:bg-zinc-50"
                    >Adjust →</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4 text-xs text-zinc-600">
        <strong className="text-zinc-900">How pricing works:</strong> default per-conversation rates are
        Marketing ₹0.85 · Utility ₹0.115 · Auth ₹0.115 · Service ₹0.
        Override rates per-tenant in <em>Tenants → Manage</em>. The top-up bonus % gives the tenant extra
        wallet credit on every Razorpay top-up — useful for promotional offers and enterprise discounts.
      </div>
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

// ============ Analytics Tab (super-admin) ============
function MiniBarChart({ data, valueKey, color = '#075E54', formatY = (v) => v }) {
  const max = Math.max(1, ...data.map(d => d[valueKey] || 0));
  return (
    <div className="flex h-32 items-end gap-1">
      {data.map((d, i) => {
        const v = d[valueKey] || 0;
        const px = Math.max(2, Math.round((v / max) * 128));
        return (
          <div key={i} className="group relative flex flex-1 items-end self-stretch">
            <div
              className="w-full rounded-sm transition-all hover:opacity-80"
              style={{ height: `${px}px`, backgroundColor: color }}
              title={`${d.date}: ${formatY(v)}`}
            />
            <div className="pointer-events-none absolute -top-7 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-zinc-900 px-1.5 py-0.5 text-[10px] text-white group-hover:block">
              {d.date}: {formatY(v)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AnalyticsTab() {
  const [days, setDays] = useState(30);
  const [series, setSeries] = useState(null);
  const [funnel, setFunnel] = useState(null);
  const [topMetric, setTopMetric] = useState('messages');
  const [top, setTop] = useState([]);
  const [mix, setMix] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get(`/admin/analytics/timeseries?days=${days}`),
      api.get('/admin/analytics/funnel'),
      api.get(`/admin/analytics/message-mix?days=${days}`),
    ]).then(([s, f, m]) => {
      setSeries(s.data); setFunnel(f.data); setMix(m.data);
    }).finally(() => setLoading(false));
  }, [days]);

  useEffect(() => {
    api.get(`/admin/analytics/top-tenants?metric=${topMetric}&limit=8`).then(({ data }) => setTop(data));
  }, [topMetric]);

  if (loading || !series || !funnel) return <div className="p-6 text-sm text-zinc-500">Loading analytics…</div>;

  const t = series.totals;
  return (
    <div className="space-y-6" data-testid="admin-analytics">
      <div className="flex items-center justify-between">
        <div className="text-xs text-zinc-500">Platform metrics for the last <span className="font-mono">{days}</span> days.</div>
        <div className="flex gap-1">
          {[7, 30, 90].map(d => (
            <button
              key={d}
              data-testid={`analytics-range-${d}`}
              onClick={() => setDays(d)}
              className={`rounded-md border px-2.5 py-1 text-[11px] font-medium ${days === d ? 'border-wa-dark bg-wa-dark text-white' : 'border-zinc-300 bg-white hover:bg-zinc-50'}`}
            >{d}d</button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="New tenants" value={t.new_tenants} sub={`${days}d window`} icon={Building2} />
        <StatCard label="Messages sent" value={(t.messages || 0).toLocaleString()} sub={`${days}d window`} icon={MessageSquare} />
        <StatCard label="Top-up revenue" value={fmtINR(t.revenue_inr)} sub={`${days}d window`} icon={TrendingUp} accent="text-green-700" />
        <StatCard label="Wallet cost" value={fmtINR(t.wallet_cost_inr)} sub={`Margin: ${fmtINR(t.revenue_inr - t.wallet_cost_inr)}`} icon={CreditCard} accent="text-purple-700" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-md border border-zinc-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Messages per day</div>
            <span className="text-xs text-zinc-500">Total {(t.messages || 0).toLocaleString()}</span>
          </div>
          <MiniBarChart data={series.series} valueKey="messages" color="#075E54" />
        </div>
        <div className="rounded-md border border-zinc-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Top-up revenue per day</div>
            <span className="text-xs text-zinc-500">{fmtINR(t.revenue_inr)}</span>
          </div>
          <MiniBarChart data={series.series} valueKey="revenue_inr" color="#16a34a" formatY={(v) => `₹${Math.round(v)}`} />
        </div>
        <div className="rounded-md border border-zinc-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">New tenants per day</div>
            <span className="text-xs text-zinc-500">{t.new_tenants} signups</span>
          </div>
          <MiniBarChart data={series.series} valueKey="new_tenants" color="#7c3aed" />
        </div>
        <div className="rounded-md border border-zinc-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Conversation status mix ({mix?.days}d)</div>
            <span className="text-xs text-zinc-500">{(mix?.total || 0).toLocaleString()} total</span>
          </div>
          <div className="space-y-2">
            {Object.entries(mix?.by_status || {}).map(([status, count]) => {
              const pct = mix.total ? Math.round((count / mix.total) * 100) : 0;
              const colors = { sent: 'bg-blue-500', delivered: 'bg-cyan-500', read: 'bg-green-500', failed: 'bg-red-500', queued: 'bg-amber-500' };
              return (
                <div key={status}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono text-zinc-700">{status}</span>
                    <span className="font-mono text-zinc-500">{count.toLocaleString()} · {pct}%</span>
                  </div>
                  <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-zinc-100">
                    <div className={`h-full ${colors[status] || 'bg-zinc-400'}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-md border border-zinc-200 bg-white p-5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Conversion funnel</div>
          <div className="mt-3 space-y-2 text-sm">
            <FunnelRow label="Total tenants" value={funnel.total} max={funnel.total} />
            <FunnelRow label="Trial" value={funnel.trial} max={funnel.total} />
            <FunnelRow label="Paid" value={funnel.paid} max={funnel.total} accent="text-green-700" />
            <FunnelRow label="On wallet plan" value={funnel.wallet_plan_tenants} max={funnel.total} accent="text-purple-700" />
            <FunnelRow label="Active in 7 days" value={funnel.active_7d} max={funnel.total} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-md border border-zinc-200 px-3 py-2">
              <div className="text-[10px] uppercase text-zinc-500">Trial → Paid</div>
              <div className="font-mono text-base font-semibold text-green-700">{funnel.trial_to_paid_pct}%</div>
            </div>
            <div className="rounded-md border border-zinc-200 px-3 py-2">
              <div className="text-[10px] uppercase text-zinc-500">7d activation</div>
              <div className="font-mono text-base font-semibold text-blue-700">{funnel.weekly_activation_pct}%</div>
            </div>
            <div className="rounded-md border border-zinc-200 px-3 py-2">
              <div className="text-[10px] uppercase text-zinc-500">Suspended</div>
              <div className="font-mono text-base font-semibold text-red-700">{funnel.suspended}</div>
            </div>
            <div className="rounded-md border border-zinc-200 px-3 py-2">
              <div className="text-[10px] uppercase text-zinc-500">Churned 30d</div>
              <div className="font-mono text-base font-semibold text-amber-700">{funnel.churned_30d}</div>
            </div>
          </div>
        </div>

        <div className="rounded-md border border-zinc-200 bg-white p-5 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Top tenants</div>
            <div className="flex gap-1">
              {[
                ['messages', 'By messages'],
                ['revenue', 'By revenue'],
                ['wallet_balance', 'By balance'],
              ].map(([id, lbl]) => (
                <button
                  key={id}
                  data-testid={`analytics-top-${id}`}
                  onClick={() => setTopMetric(id)}
                  className={`rounded-md border px-2 py-1 text-[10px] font-medium ${topMetric === id ? 'border-wa-dark bg-wa-dark text-white' : 'border-zinc-300 bg-white hover:bg-zinc-50'}`}
                >{lbl}</button>
              ))}
            </div>
          </div>
          {top.length === 0 && <div className="py-6 text-center text-xs text-zinc-500">No data yet.</div>}
          {top.length > 0 && (
            <div className="space-y-1.5">
              {top.map((row, i) => {
                const max = Math.max(1, ...top.map(r => r.value));
                const pct = (row.value / max) * 100;
                return (
                  <div key={row.tenant_id} className="grid grid-cols-[20px_1fr_120px] items-center gap-2 text-xs">
                    <span className="font-mono text-zinc-400">#{i + 1}</span>
                    <div>
                      <div className="font-medium text-zinc-900 truncate">{row.company_name}</div>
                      <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-zinc-100">
                        <div className="h-full rounded-full bg-wa-dark" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <div className="text-right font-mono text-zinc-700">
                      {topMetric === 'messages' ? row.value.toLocaleString() : fmtINR(row.value)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FunnelRow({ label, value, max, accent }) {
  const pct = max ? Math.round((value / max) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-zinc-700">{label}</span>
        <span className={`font-mono ${accent || 'text-zinc-700'}`}>{value} · {pct}%</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-100">
        <div className="h-full rounded-full bg-wa-dark" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}



export default function AdminConsole() {
  const location = useLocation();
  const navigate = useNavigate();
  const urlTab = new URLSearchParams(location.search).get('tab');
  const [tab, setTab] = useState(urlTab || 'overview');
  useEffect(() => {
    if (urlTab && urlTab !== tab) setTab(urlTab);
    // eslint-disable-next-line
  }, [urlTab]);
  const switchTab = (id) => {
    setTab(id);
    navigate(id === 'overview' ? '/app/admin' : `/app/admin?tab=${id}`, { replace: true });
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight inline-flex items-center gap-2">
            <Shield className="h-6 w-6 text-purple-700" /> Platform Console
          </h1>
          <p className="mt-1 text-sm text-zinc-600">SaaS owner cockpit — every tenant, every subscription, every rupee.</p>
        </div>
        <span className="hidden rounded-full bg-purple-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-purple-800 sm:inline-flex">Platform Owner</span>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-zinc-200" data-testid="admin-tabs">
        {TABS.map(t => (
          <button
            key={t.id}
            data-testid={`admin-tab-${t.id}`}
            onClick={() => switchTab(t.id)}
            className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition ${tab === t.id ? 'border-wa-dark text-wa-dark' : 'border-transparent text-zinc-600 hover:text-zinc-900'}`}
          >
            <t.icon className="h-3.5 w-3.5" /> {t.label}
          </button>
        ))}
      </div>

      <div>
        {tab === 'overview' && <Overview />}
        {tab === 'analytics' && <AnalyticsTab />}
        {tab === 'tenants' && <Tenants />}
        {tab === 'users' && <UsersList />}
        {tab === 'subscriptions' && <Subscriptions />}
        {tab === 'pricing' && <PricingTab />}
        {tab === 'tickets' && <TicketInbox />}
      </div>
    </div>
  );
}
