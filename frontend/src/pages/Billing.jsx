import React, { useEffect, useState } from 'react';
import api from '../lib/api';
import { Check, CreditCard, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';

const loadRazorpayScript = () => new Promise((resolve) => {
  if (window.Razorpay) return resolve(true);
  const s = document.createElement('script');
  s.src = 'https://checkout.razorpay.com/v1/checkout.js';
  s.onload = () => resolve(true);
  s.onerror = () => resolve(false);
  document.body.appendChild(s);
});

export default function Billing() {
  const { user, refreshUser } = useAuth();
  const [plans, setPlans] = useState([]);
  const [sub, setSub] = useState(null);
  const [orders, setOrders] = useState([]);
  const [busy, setBusy] = useState(null);
  const [cycle, setCycle] = useState('monthly');

  const load = async () => {
    const [p, s, o] = await Promise.all([
      api.get('/billing/plans'),
      api.get('/billing/subscription'),
      api.get('/billing/orders'),
    ]);
    setPlans(p.data); setSub(s.data); setOrders(o.data);
  };
  useEffect(() => { load(); }, []);

  const upgrade = async (planId) => {
    setBusy(planId);
    try {
      const ok = await loadRazorpayScript();
      if (!ok) { toast.error('Could not load Razorpay'); setBusy(null); return; }
      const { data } = await api.post('/billing/orders', { plan: planId, billing_cycle: cycle });
      const opts = {
        key: data.key_id,
        amount: data.amount,
        currency: data.currency,
        name: 'wabridge',
        description: `Upgrade to ${planId}`,
        order_id: data.order_id,
        prefill: { email: user?.email, name: user?.full_name },
        theme: { color: '#16A34A' },
        handler: async (response) => {
          try {
            await api.post('/billing/verify', {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              plan: planId,
            });
            toast.success(`Upgraded to ${planId}`);
            await refreshUser();
            load();
          } catch (e) { toast.error('Verification failed'); }
        },
        modal: { ondismiss: () => setBusy(null) },
      };
      const rzp = new window.Razorpay(opts);
      rzp.open();
    } catch (e) {
      toast.error('Could not start checkout');
    } finally { setBusy(null); }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Subscription</h1>
        <p className="mt-1 text-sm text-zinc-600">Manage your plan and view invoices.</p>
      </div>

      {/* Current */}
      <div className="rounded-md border border-zinc-200 bg-white p-5">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Current plan</div>
            <div className="mt-1 font-display text-2xl font-semibold capitalize">{sub?.plan || 'free'}</div>
            <div className="mt-1 text-xs text-zinc-500">
              {(sub?.plan === 'free' || sub?.plan === 'trial') ? 'No expiry · upgrade anytime' : sub?.subscription_end ? `Renews ${new Date(sub.subscription_end).toLocaleDateString()}` : ''}
            </div>
          </div>
          <div className="ml-auto grid grid-cols-3 gap-6 text-xs">
            <div><div className="text-zinc-400">Messages</div><div className="font-display text-lg font-semibold">{sub?.plan_details?.messages?.toLocaleString() || '—'}</div></div>
            <div><div className="text-zinc-400">Leads</div><div className="font-display text-lg font-semibold">{sub?.plan_details?.leads?.toLocaleString() || '—'}</div></div>
            <div><div className="text-zinc-400">Numbers</div><div className="font-display text-lg font-semibold">{sub?.plan_details?.credentials || '—'}</div></div>
          </div>
        </div>
      </div>

      {/* Plans */}
      <div className="flex justify-center">
        <div className="inline-flex rounded-md border border-zinc-200 bg-white p-1" data-testid="billing-cycle-toggle">
          <button
            onClick={() => setCycle('monthly')}
            className={`rounded px-4 py-1.5 text-xs font-medium transition ${cycle === 'monthly' ? 'bg-wa-dark text-white' : 'text-zinc-600 hover:bg-zinc-50'}`}
          >Monthly</button>
          <button
            onClick={() => setCycle('annual')}
            data-testid="cycle-annual"
            className={`rounded px-4 py-1.5 text-xs font-medium transition ${cycle === 'annual' ? 'bg-wa-dark text-white' : 'text-zinc-600 hover:bg-zinc-50'}`}
          >Annual <span className="ml-1 rounded bg-green-100 px-1 py-0.5 text-[9px] text-green-800">2 mo free</span></button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {plans.map((p) => {
          const isHighlight = p.id === 'pro';
          const isCurrent = sub?.plan === p.id || (p.id === 'free' && sub?.plan === 'trial');
          const isFree = p.id === 'free';
          const showPrice = cycle === 'annual' && p.annual_inr ? p.annual_inr : p.price_inr;
          const cycleLabel = isFree ? '' : cycle === 'annual' ? '/year' : '/month';
          return (
            <div key={p.id} className={`relative rounded-md border p-6 ${isHighlight ? 'border-green-700 bg-zinc-950 text-zinc-100' : 'border-zinc-200 bg-white'}`}>
              {isHighlight && <span className="absolute -top-3 left-6 rounded-full bg-green-700 px-3 py-1 text-xs font-medium uppercase tracking-wider text-white">Most popular</span>}
              <div className={`text-xs font-semibold uppercase tracking-[0.2em] ${isHighlight ? 'text-green-400' : 'text-wa-dark'}`}>{p.name}</div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="font-display text-3xl font-semibold tracking-tight">₹{showPrice}</span>
                <span className={isHighlight ? 'text-zinc-400' : 'text-zinc-500'}>{cycleLabel}</span>
              </div>
              {cycle === 'annual' && !isFree && p.annual_inr && (
                <div className={`text-[11px] ${isHighlight ? 'text-green-400' : 'text-green-700'}`}>Save ₹{(p.price_inr * 12 - p.annual_inr).toLocaleString()} vs monthly</div>
              )}
              <ul className="mt-6 space-y-2 text-sm">
                <li className="flex items-start gap-2"><Check className={`mt-0.5 h-4 w-4 ${isHighlight ? 'text-green-400' : 'text-wa-dark'}`} />{p.messages.toLocaleString()} messages {isFree ? '' : '/ mo'}</li>
                <li className="flex items-start gap-2"><Check className={`mt-0.5 h-4 w-4 ${isHighlight ? 'text-green-400' : 'text-wa-dark'}`} />{p.leads.toLocaleString()} leads</li>
                <li className="flex items-start gap-2"><Check className={`mt-0.5 h-4 w-4 ${isHighlight ? 'text-green-400' : 'text-wa-dark'}`} />{p.credentials} WhatsApp number{p.credentials > 1 ? 's' : ''}</li>
              </ul>
              <button
                data-testid={`upgrade-${p.id}`}
                disabled={isCurrent || busy === p.id || isFree}
                onClick={() => !isFree && upgrade(p.id)}
                className={`mt-6 inline-flex w-full items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition ${
                  isCurrent ? 'cursor-default border border-zinc-300 text-zinc-500'
                    : isFree ? 'cursor-default border border-zinc-200 text-zinc-400'
                    : isHighlight ? 'bg-wa-dark text-white hover:bg-wa-mid'
                    : 'border border-zinc-900 text-zinc-900 hover:bg-zinc-900 hover:text-white'
                }`}
              >
                {isCurrent ? 'Current plan' : isFree ? 'Free forever' : busy === p.id ? 'Loading…' : <><CreditCard className="h-4 w-4" /> Upgrade to {p.name}</>}
              </button>
            </div>
          );
        })}
      </div>

      {/* Razorpay test note */}
      <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
        <AlertCircle className="mt-0.5 h-3.5 w-3.5" />
        Razorpay TEST mode. Use test card <span className="font-mono">4111 1111 1111 1111</span> · any future expiry · CVV 123.
      </div>

      {/* Orders */}
      <div className="rounded-md border border-zinc-200 bg-white">
        <div className="border-b border-zinc-200 px-5 py-3">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Payment history</div>
        </div>
        <table className="w-full text-sm">
          <thead className="text-[11px] uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="px-5 py-2.5 text-left font-semibold">Order</th>
              <th className="px-5 py-2.5 text-left font-semibold">Plan</th>
              <th className="px-5 py-2.5 text-left font-semibold">Amount</th>
              <th className="px-5 py-2.5 text-left font-semibold">Status</th>
              <th className="px-5 py-2.5 text-left font-semibold">Date</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 && <tr><td colSpan={5} className="px-5 py-8 text-center text-zinc-500">No orders yet.</td></tr>}
            {orders.map(o => (
              <tr key={o.id} className="border-t border-zinc-100">
                <td className="px-5 py-3 font-mono text-xs">{o.razorpay_order_id}</td>
                <td className="px-5 py-3 capitalize">{o.plan}</td>
                <td className="px-5 py-3">₹{o.amount_inr}</td>
                <td className="px-5 py-3"><span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${o.status === 'paid' ? 'bg-green-100 text-green-800' : 'bg-zinc-100 text-zinc-700'}`}>{o.status}</span></td>
                <td className="px-5 py-3 text-xs text-zinc-500">{new Date(o.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
